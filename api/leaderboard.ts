// Vercel Function: the worldwide sales leaderboards, stored in Upstash Redis (sorted sets).
//
//   GET    /api/leaderboard?board=total&me=<id>&limit=50   top entries (+ the caller's own rank)
//   POST   /api/leaderboard   { id, name, total, bestDay, lastDay, day30, clear1, clearBest, …, secret? }
//   POST   /api/leaderboard?action=google   { id, credential }   Sign in with Google → { id, secret, name, existing }
//   POST   /api/leaderboard?action=signout  { id, secret }       this device's secret stops working
//   DELETE /api/leaderboard   { id, secret? }                   a player withdraws (all records)
//
// Admin (Authorization: Bearer $LEADERBOARD_ADMIN_TOKEN):
//   GET    ?board=…&admin=1   entries with player ids
//   DELETE { id, ban: true }  removes a player; a banned id is never recorded again
//
// Environment: UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN (or the KV_REST_API_URL /
// KV_REST_API_TOKEN pair that the Vercel Marketplace integration sets); optional
// GOOGLE_CLIENT_ID (Sign in with Google), LEADERBOARD_REQUIRE_GOOGLE=1 (only signed-in players
// submit) and LEADERBOARD_ADMIN_TOKEN.
//
// Sign-in is optional. A signed-in player's records follow the Google account to other devices,
// show a verified mark, and only take writes from signed-in devices. Only Google's account number
// ("sub") is stored: no e-mail address or real name.
//
// A browser game cannot prove its own numbers, so submissions are sanity-checked here (ranges,
// consistency, rate limits) and the admin can remove and ban players. This file is self-contained
// (no relative imports) so Vercel can deploy it as is.

/** Board key → sort order ('asc': lower is better, e.g. clear time). Keep in step with src/net/leaderboard.ts. */
export const BOARDS = {
  clear1: 'asc',
  clearBest: 'asc',
  day30: 'desc',
  total: 'desc',
  bestDay: 'desc',
  today: 'desc',
  week: 'desc',
} as const;
export type BoardKey = keyof typeof BOARDS;

/** Fastest believable clear (in-game seconds of business days). */
export const MIN_CLEAR_SECONDS = 15 * 60;
/** Seconds between submissions from one player. */
export const SUBMIT_INTERVAL = 10;
/** Requests per minute from one address. */
export const IP_LIMIT = 60;
const MAX_REVENUE = 1e21;
const MAX_LIMIT = 100;
const NAMES = 'lb:names';
const META = 'lb:meta';
/** Each player's title (称号), shown next to the name. */
const TITLES = 'lb:titles';
const BANNED = 'lb:banned';

type Cmd = (string | number)[];

/** Runs Redis commands in one round trip; results in order (errors as Error values). */
export interface Store {
  exec(commands: Cmd[]): Promise<unknown[]>;
}

// ---------------------------------------------------------------- periods

/** UTC day, e.g. 2026-09-25. */
export const dayKey = (now: number) => new Date(now).toISOString().slice(0, 10);

/** ISO week (UTC), e.g. 2026-W39. */
export function weekKey(now: number): string {
  const d = new Date(now);
  // The week belongs to the year of its Thursday.
  const thursday = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 3 - ((d.getUTCDay() + 6) % 7)));
  const week = Math.ceil(((thursday.getTime() - Date.UTC(thursday.getUTCFullYear(), 0, 1)) / 86400000 + 1) / 7);
  return `${thursday.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

/** Redis key of a board (the period boards get a key per day / week). */
export function boardKey(board: BoardKey, now: number): string {
  if (board === 'today') return `lb:today:${dayKey(now)}`;
  if (board === 'week') return `lb:week:${weekKey(now)}`;
  return `lb:${board}`;
}

const PERIOD_TTL = { today: 3 * 86400, week: 16 * 86400 };

// ---------------------------------------------------------------- validation

const ID = /^[0-9a-f]{32}$/;

// Blocked in names (after NFKC, lower case, katakana → hiragana, spaces and dashes removed).
const NG_WORDS = ['http', 'www.', '.com', '.net', '.org', '.jp', 'discord.gg', 'fuck', 'shit', 'cunt', 'bitch', 'nigger', 'nigga', 'faggot', 'rape', 'nazi', 'hitler', 'ちんこ', 'ちんぽ', 'まんこ', 'せっくす', 'しね', '死ね', '殺す', 'ころす', 'れいぷ', 'きちがい', '氏ね'];

/** Control, zero-width and direction-override characters (removed from names). */
const INVISIBLE = new RegExp(
  `[${[[0x00, 0x1f], [0x7f, 0x9f], [0x200b, 0x200f], [0x2028, 0x202e], [0x2066, 0x2069]].map(([a, b]) => `${String.fromCharCode(a)}-${String.fromCharCode(b)}`).join('')}]`,
  'g',
);

const toHiragana = (s: string) => s.replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60));

/** A cleaned-up nickname, or null when it is empty, too long or blocked. */
export function cleanName(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const name = raw.normalize('NFKC').replace(INVISIBLE, '').replace(/\s+/g, ' ').trim();
  if (name.length < 1 || [...name].length > 16) return null;
  const flat = toHiragana(name.toLowerCase()).replace(/[\s_\-・]/g, '');
  if (NG_WORDS.some((w) => flat.includes(w))) return null;
  return name;
}

export interface Submission {
  id: string;
  name: string;
  total: number;
  bestDay: number;
  /** Revenue of the day just closed (goes to today's and this week's boards). */
  lastDay: number;
  day30: number | null;
  clear1: number | null;
  clearBest: number | null;
  run: number;
  day: number;
  playSeconds: number;
  /** Title code ("<land>:<rank>" or "verse"), or null for none. */
  title: string | null;
}

const TITLE_LANDS = ['Ocean', 'Strawberry', 'Tangerine', 'Lime', 'Graphite', 'Grape', 'Sage', 'Blueberry', 'Ruby'];
const TITLE_RANKS = ['commander', 'knightCommander', 'knight', 'g5', 'maestro', 'king'];

/** A known title code, or null (anything else is dropped rather than refused). */
export function cleanTitle(raw: unknown): string | null {
  if (raw === 'verse') return 'verse';
  if (typeof raw !== 'string') return null;
  const [land, rank] = raw.split(':');
  return TITLE_LANDS.includes(land) && TITLE_RANKS.includes(rank) && raw === `${land}:${rank}` ? raw : null;
}

const num = (v: unknown, max = MAX_REVENUE) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= max ? v : NaN);
const opt = (v: unknown, max?: number) => (v === null || v === undefined ? null : num(v, max));

/** Checks a submission; returns it cleaned, or the reason it was refused. */
export function validate(body: unknown): Submission | string {
  if (!body || typeof body !== 'object') return 'bad_body';
  const b = body as Record<string, unknown>;
  if (typeof b.id !== 'string' || !ID.test(b.id)) return 'bad_id';
  const name = cleanName(b.name);
  if (!name) return 'bad_name';
  const s: Submission = {
    id: b.id,
    name,
    total: num(b.total),
    bestDay: num(b.bestDay),
    lastDay: num(b.lastDay ?? 0),
    day30: opt(b.day30),
    clear1: opt(b.clear1, 1e9),
    clearBest: opt(b.clearBest, 1e9),
    run: num(b.run ?? 1, 1e6),
    day: num(b.day ?? 1, 1e7),
    playSeconds: num(b.playSeconds ?? 0, 1e10),
    title: cleanTitle(b.title),
  };
  const values = [s.total, s.bestDay, s.lastDay, s.day30, s.clear1, s.clearBest, s.run, s.day, s.playSeconds];
  if (values.some((v) => Number.isNaN(v))) return 'bad_number';
  // Consistency: a part never exceeds the whole (a little slack for rounding).
  const within = (part: number | null, whole: number) => part === null || part <= whole * 1.000001 + 1;
  if (!within(s.bestDay, s.total) || !within(s.lastDay, s.bestDay) || !within(s.day30, s.total)) return 'inconsistent';
  for (const c of [s.clear1, s.clearBest]) if (c !== null && (c < MIN_CLEAR_SECONDS || c > s.playSeconds + 1)) return 'bad_clear';
  if (s.clear1 !== null && s.clearBest !== null && s.clearBest > s.clear1) return 'bad_clear';
  return s;
}

// ---------------------------------------------------------------- stores

/** Upstash Redis over its REST API (pipeline endpoint). */
export function upstash(url: string, token: string): Store {
  return {
    async exec(commands) {
      const res = await fetch(`${url.replace(/\/$/, '')}/pipeline`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(commands),
      });
      if (!res.ok) throw new Error(`redis ${res.status}`);
      const out = (await res.json()) as { result?: unknown; error?: string }[];
      return out.map((r) => (r.error ? new Error(r.error) : r.result));
    },
  };
}

/**
 * An in-memory stand-in for the few Redis commands used here (local dev server and tests).
 * Scores come back as strings, like the REST API.
 */
export function memoryStore(now: () => number = Date.now): Store {
  const zsets = new Map<string, Map<string, number>>();
  const hashes = new Map<string, Map<string, string>>();
  const strings = new Map<string, string>();
  const expiry = new Map<string, number>();
  const sets = new Map<string, Set<string>>();
  const zset = (k: string) => zsets.get(k) ?? zsets.set(k, new Map()).get(k)!;
  const hash = (k: string) => hashes.get(k) ?? hashes.set(k, new Map()).get(k)!;
  const sorted = (k: string, rev: boolean) =>
    [...zset(k)].sort((a, b) => (rev ? b[1] - a[1] || (b[0] < a[0] ? -1 : 1) : a[1] - b[1] || (a[0] < b[0] ? -1 : 1)));
  const run = (c: Cmd): unknown => {
    const [op, ...a] = c.map(String);
    // Expired keys (only plain values use EX / EXPIRE here) are gone.
    if ((expiry.get(a[0]) ?? Infinity) <= now()) {
      strings.delete(a[0]);
      expiry.delete(a[0]);
    }
    switch (op.toUpperCase()) {
      case 'ZADD': {
        const flag = a.length === 4 ? a[1].toUpperCase() : '';
        const [score, member] = a.slice(-2);
        const z = zset(a[0]);
        const cur = z.get(member);
        const v = Number(score);
        if (cur === undefined || (flag === 'GT' && v > cur) || (flag === 'LT' && v < cur) || !flag) z.set(member, v);
        return cur === undefined ? 1 : 0;
      }
      case 'ZRANGE': {
        const rev = a.some((x) => x.toUpperCase() === 'REV');
        const withScores = a.some((x) => x.toUpperCase() === 'WITHSCORES');
        const list = sorted(a[0], rev).slice(Number(a[1]), Number(a[2]) + 1);
        return withScores ? list.flatMap(([m, s]) => [m, String(s)]) : list.map(([m]) => m);
      }
      case 'ZRANK':
      case 'ZREVRANK': {
        const i = sorted(a[0], op.toUpperCase() === 'ZREVRANK').findIndex(([m]) => m === a[1]);
        return i < 0 ? null : i;
      }
      case 'ZSCORE': {
        const v = zset(a[0]).get(a[1]);
        return v === undefined ? null : String(v);
      }
      case 'ZCARD':
        return zset(a[0]).size;
      case 'ZREM':
        return zset(a[0]).delete(a[1]) ? 1 : 0;
      case 'HSET':
        hash(a[0]).set(a[1], a[2]);
        return 1;
      case 'HMGET':
        return a.slice(1).map((f) => hash(a[0]).get(f) ?? null);
      case 'HDEL':
        return hash(a[0]).delete(a[1]) ? 1 : 0;
      case 'SET': {
        if (a.some((x) => x.toUpperCase() === 'NX') && strings.has(a[0])) return null;
        strings.set(a[0], a[1]);
        const ex = a.findIndex((x) => x.toUpperCase() === 'EX');
        if (ex > 0) expiry.set(a[0], now() + Number(a[ex + 1]) * 1000);
        else expiry.delete(a[0]);
        return 'OK';
      }
      case 'INCR': {
        const v = Number(strings.get(a[0]) ?? 0) + 1;
        strings.set(a[0], String(v));
        return v;
      }
      case 'EXPIRE':
        if (strings.has(a[0])) expiry.set(a[0], now() + Number(a[1]) * 1000);
        return 1;
      case 'GET':
        return strings.get(a[0]) ?? null;
      case 'HGET':
        return hash(a[0]).get(a[1]) ?? null;
      case 'SREM':
        return sets.get(a[0])?.delete(a[1]) ? 1 : 0;
      case 'SADD':
        (sets.get(a[0]) ?? sets.set(a[0], new Set()).get(a[0])!).add(a[1]);
        return 1;
      case 'SISMEMBER':
        return sets.get(a[0])?.has(a[1]) ? 1 : 0;
      case 'DEL':
        return [zsets, hashes, strings, sets].reduce((n, m) => n + (m.delete(a[0]) ? 1 : 0), 0);
      default:
        return new Error(`unsupported ${op}`);
    }
  };
  return { exec: async (commands) => commands.map(run) };
}

// ---------------------------------------------------------------- Google sign-in

const GOOGLE_CERTS = 'https://www.googleapis.com/oauth2/v3/certs';
const GOOGLE_ISSUERS = ['accounts.google.com', 'https://accounts.google.com'];

/** Google's account number for a verified ID token ("sub"); nothing else is kept. */
export type GoogleVerifier = (credential: string) => Promise<{ sub: string } | null>;
export type Jwk = JsonWebKey & { kid?: string };

const fromBase64Url = (s: string) =>
  Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4)), (c) => c.charCodeAt(0));
const utf8 = (bytes: Uint8Array) => new TextDecoder().decode(bytes);

/**
 * Checks a Google ID token (from Sign in with Google): RS256 signature against Google's
 * published keys, audience = our client id, issuer and expiry.
 */
export function googleVerifier(clientId: string, options: { now?: () => number; fetchKeys?: () => Promise<Jwk[]> } = {}): GoogleVerifier {
  const now = options.now ?? Date.now;
  const fetchKeys =
    options.fetchKeys ??
    (async () => {
      const res = await fetch(GOOGLE_CERTS);
      if (!res.ok) throw new Error(`google certs ${res.status}`);
      return ((await res.json()) as { keys: Jwk[] }).keys;
    });
  let cache: { keys: Jwk[]; at: number } | null = null;
  async function keyFor(kid: string): Promise<Jwk | undefined> {
    const stale = !cache || now() - cache.at > 3600_000;
    // Google rotates keys: refetch for an unknown kid, at most once a minute.
    const unknown = cache && !cache.keys.some((k) => k.kid === kid) && now() - cache.at > 60_000;
    if (stale || unknown) cache = { keys: await fetchKeys(), at: now() };
    return cache!.keys.find((k) => k.kid === kid);
  }
  return async (credential) => {
    const parts = credential.split('.');
    if (parts.length !== 3) return null;
    try {
      const header = JSON.parse(utf8(fromBase64Url(parts[0]))) as { alg?: string; kid?: string };
      const claims = JSON.parse(utf8(fromBase64Url(parts[1]))) as { aud?: string; iss?: string; exp?: number; sub?: string };
      if (header.alg !== 'RS256' || typeof header.kid !== 'string') return null;
      if (claims.aud !== clientId || !GOOGLE_ISSUERS.includes(claims.iss ?? '')) return null;
      if (typeof claims.exp !== 'number' || claims.exp * 1000 < now() - 60_000) return null;
      if (typeof claims.sub !== 'string' || !claims.sub) return null;
      const jwk = await keyFor(header.kid);
      if (!jwk) return null;
      const key = await crypto.subtle.importKey('jwk', { kty: jwk.kty, n: jwk.n, e: jwk.e }, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
      const ok = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, fromBase64Url(parts[2]), new TextEncoder().encode(`${parts[0]}.${parts[1]}`));
      return ok ? { sub: claims.sub } : null;
    } catch {
      return null;
    }
  };
}

/** 32 random hex digits (player ids and device secrets). */
export function randomHex(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function sha256(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

// Keys for signed-in players: Google account → player id, player id → account, and the hashed
// secrets of the devices signed in to it (a linked record only takes writes with one of them).
const googleKey = (sub: string) => `lb:google:${sub}`;
const ownerKey = (id: string) => `lb:owner:${id}`;
const secretsKey = (id: string) => `lb:secrets:${id}`;
const VERIFIED = 'lb:verified';

// ---------------------------------------------------------------- handler

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });

export interface HandlerOptions {
  now?: () => number;
  adminToken?: string;
  /** OAuth client id for Sign in with Google (sent to the game; off when missing). */
  googleClientId?: string;
  /** Token check (defaults to googleVerifier(googleClientId)). */
  verifyGoogle?: GoogleVerifier;
  /** Only signed-in players can submit. */
  requireGoogle?: boolean;
}

type Body = Record<string, unknown> | null;

export function createHandler(getStore: () => Store | null, options: HandlerOptions = {}): (req: Request) => Promise<Response> {
  const now = options.now ?? Date.now;
  const clientId = options.googleClientId || null;
  const verify = options.verifyGoogle ?? (clientId ? googleVerifier(clientId, { now }) : null);
  const requireGoogle = !!options.requireGoogle && !!verify;
  const isAdmin = (req: Request) => !!options.adminToken && req.headers.get('authorization') === `Bearer ${options.adminToken}`;
  const clientIp = (req: Request) => (req.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() || 'unknown';
  const idOf = (body: Body) => (typeof body?.id === 'string' && ID.test(body.id) ? body.id : null);

  /** Counts a request from the caller's address; true when over the limit. */
  async function limited(store: Store, req: Request): Promise<boolean> {
    const key = `lb:ip:${clientIp(req)}:${Math.floor(now() / 60000)}`;
    const [count] = await store.exec([['INCR', key], ['EXPIRE', key, 120]]);
    return Number(count) > IP_LIMIT;
  }

  /** A record linked to a Google account takes writes only with a signed-in device's secret. */
  async function authorize(store: Store, id: string, secret: unknown): Promise<string | null> {
    const [owner] = await store.exec([['GET', ownerKey(id)]]);
    if (owner) {
      if (typeof secret !== 'string' || !ID.test(secret)) return 'auth';
      const [ok] = await store.exec([['SISMEMBER', secretsKey(id), await sha256(secret)]]);
      return Number(ok) === 1 ? null : 'auth';
    }
    return requireGoogle ? 'login_required' : null;
  }

  async function get(store: Store, req: Request): Promise<Response> {
    const url = new URL(req.url);
    const board = url.searchParams.get('board') as BoardKey;
    if (!(board in BOARDS)) return json(400, { error: 'bad_board' });
    const limit = Math.max(1, Math.min(MAX_LIMIT, Number(url.searchParams.get('limit')) || 50));
    const me = url.searchParams.get('me') ?? '';
    const admin = url.searchParams.get('admin') === '1' && isAdmin(req);
    const key = boardKey(board, now());
    const asc = BOARDS[board] === 'asc';
    const cmds: Cmd[] = [asc ? ['ZRANGE', key, 0, limit - 1, 'WITHSCORES'] : ['ZRANGE', key, 0, limit - 1, 'REV', 'WITHSCORES'], ['ZCARD', key]];
    if (ID.test(me)) cmds.push([asc ? 'ZRANK' : 'ZREVRANK', key, me], ['ZSCORE', key, me]);
    const [range, count, myRank, myScore] = await store.exec(cmds);
    const flat = (range as string[]) ?? [];
    const ids: string[] = [];
    const scores: number[] = [];
    for (let i = 0; i < flat.length; i += 2) {
      ids.push(flat[i]);
      scores.push(Number(flat[i + 1]));
    }
    const [names, verified, titles] = ids.length ? ((await store.exec([['HMGET', NAMES, ...ids], ['HMGET', VERIFIED, ...ids], ['HMGET', TITLES, ...ids]])) as (string | null)[][]) : [[], [], []];
    // Ties share a rank (1, 2, 2, 4).
    let rank = 0;
    const entries = ids.map((id, i) => {
      if (i === 0 || scores[i] !== scores[i - 1]) rank = i + 1;
      return { rank, name: names[i] ?? '???', score: scores[i], ...(titles?.[i] ? { title: titles[i] } : {}), ...(verified[i] ? { verified: true } : {}), ...(id === me ? { me: true } : {}), ...(admin ? { id } : {}) };
    });
    const mine = myRank !== null && myRank !== undefined && !(myRank instanceof Error) ? { rank: Number(myRank) + 1, score: Number(myScore) } : null;
    const period = board === 'today' ? dayKey(now()) : board === 'week' ? weekKey(now()) : null;
    return json(200, { board, period, count: Number(count) || 0, entries, me: mine, auth: { googleClientId: clientId, requireGoogle } });
  }

  async function submit(store: Store, body: Body): Promise<Response> {
    const s = validate(body);
    if (typeof s === 'string') return json(400, { error: s });
    const [banned, fresh] = await store.exec([
      ['SISMEMBER', BANNED, s.id],
      ['SET', `lb:rl:${s.id}`, 1, 'NX', 'EX', SUBMIT_INTERVAL],
    ]);
    if (Number(banned) === 1) return json(403, { error: 'banned' });
    if (fresh === null) return json(429, { error: 'too_soon' });
    const denied = await authorize(store, s.id, body?.secret);
    if (denied) return json(403, { error: denied });
    const t = now();
    const cmds: Cmd[] = [
      ['HSET', NAMES, s.id, s.name],
      s.title ? ['HSET', TITLES, s.id, s.title] : ['HDEL', TITLES, s.id],
      ['HSET', META, s.id, JSON.stringify({ run: s.run, day: s.day, playSeconds: s.playSeconds, at: t })],
      ['ZADD', boardKey('total', t), 'GT', s.total, s.id],
      ['ZADD', boardKey('bestDay', t), 'GT', s.bestDay, s.id],
    ];
    if (s.lastDay > 0) {
      for (const b of ['today', 'week'] as const) cmds.push(['ZADD', boardKey(b, t), 'GT', s.lastDay, s.id], ['EXPIRE', boardKey(b, t), PERIOD_TTL[b]]);
    }
    if (s.day30 !== null) cmds.push(['ZADD', boardKey('day30', t), 'GT', s.day30, s.id]);
    if (s.clear1 !== null) cmds.push(['ZADD', boardKey('clear1', t), 'LT', s.clear1, s.id]);
    if (s.clearBest !== null) cmds.push(['ZADD', boardKey('clearBest', t), 'LT', s.clearBest, s.id]);
    await store.exec(cmds);
    return json(200, { ok: true });
  }

  /** Moves a device's records onto the player it signs in as (each board keeps the better one). */
  async function merge(store: Store, from: string, to: string): Promise<void> {
    const t = now();
    const boards = Object.keys(BOARDS) as BoardKey[];
    const scores = await store.exec(boards.map((b) => ['ZSCORE', boardKey(b, t), from]));
    const [fromName, toName] = (await store.exec([['HMGET', NAMES, from, to]]))[0] as (string | null)[];
    const cmds: Cmd[] = [];
    boards.forEach((b, i) => {
      if (scores[i] === null || scores[i] instanceof Error) return;
      cmds.push(['ZADD', boardKey(b, t), BOARDS[b] === 'asc' ? 'LT' : 'GT', Number(scores[i]), to], ['ZREM', boardKey(b, t), from]);
    });
    if (fromName && !toName) cmds.push(['HSET', NAMES, to, fromName]);
    const [fromTitle, toTitle] = (await store.exec([['HMGET', TITLES, from, to]]))[0] as (string | null)[];
    if (fromTitle && !toTitle) cmds.push(['HSET', TITLES, to, fromTitle]);
    cmds.push(['HDEL', NAMES, from], ['HDEL', META, from], ['HDEL', TITLES, from]);
    await store.exec(cmds);
  }

  /**
   * Sign in with Google: the account's player (created from this device's id the first time;
   * this device's records are merged in otherwise) and a new secret for this device.
   */
  async function signIn(store: Store, body: Body): Promise<Response> {
    if (!verify) return json(501, { error: 'google_off' });
    const id = idOf(body);
    if (!id) return json(400, { error: 'bad_id' });
    const claims = await verify(String(body?.credential ?? ''));
    if (!claims) return json(401, { error: 'bad_token' });
    const [linked, owner] = (await store.exec([['GET', googleKey(claims.sub)], ['GET', ownerKey(id)]])) as (string | null)[];
    let target: string;
    if (linked) {
      target = linked;
      // Only an unlinked device record is merged (never someone else's account).
      if (linked !== id && !owner) await merge(store, id, linked);
    } else {
      // A device already linked to another account starts a new player for this one.
      target = owner && owner !== claims.sub ? randomHex() : id;
      await store.exec([['SET', googleKey(claims.sub), target], ['SET', ownerKey(target), claims.sub], ['HSET', VERIFIED, target, 1]]);
    }
    const [banned] = await store.exec([['SISMEMBER', BANNED, target]]);
    if (Number(banned) === 1) return json(403, { error: 'banned' });
    const secret = randomHex();
    const [, name] = await store.exec([['SADD', secretsKey(target), await sha256(secret)], ['HGET', NAMES, target]]);
    return json(200, { id: target, secret, name: typeof name === 'string' ? name : null, existing: !!linked });
  }

  /** Signs this device out (its secret stops working). */
  async function signOut(store: Store, body: Body): Promise<Response> {
    const id = idOf(body);
    if (!id || typeof body?.secret !== 'string') return json(400, { error: 'bad_id' });
    await store.exec([['SREM', secretsKey(id), await sha256(body.secret)]]);
    return json(200, { ok: true });
  }

  async function del(store: Store, req: Request, body: Body): Promise<Response> {
    const id = idOf(body);
    if (!id) return json(400, { error: 'bad_id' });
    const admin = isAdmin(req);
    if (!admin) {
      const denied = await authorize(store, id, body?.secret);
      if (denied === 'auth') return json(403, { error: denied });
    }
    const t = now();
    const cmds: Cmd[] = (Object.keys(BOARDS) as BoardKey[]).map((b) => ['ZREM', boardKey(b, t), id]);
    cmds.push(['HDEL', NAMES, id], ['HDEL', META, id], ['HDEL', TITLES, id]);
    if (body?.ban === true && admin) {
      // The Google link stays, so signing in again finds the banned player.
      cmds.push(['SADD', BANNED, id]);
    } else {
      const [owner] = await store.exec([['GET', ownerKey(id)]]);
      if (typeof owner === 'string') cmds.push(['DEL', googleKey(owner)], ['DEL', ownerKey(id)], ['DEL', secretsKey(id)], ['HDEL', VERIFIED, id]);
    }
    await store.exec(cmds);
    return json(200, { ok: true });
  }

  return async (req) => {
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
    const store = getStore();
    if (!store) return json(503, { error: 'not_configured' });
    try {
      if (!isAdmin(req) && (await limited(store, req))) return json(429, { error: 'rate_limited' });
      if (req.method === 'GET') return await get(store, req);
      const body = (await req.json().catch(() => null)) as Body;
      if (req.method === 'POST') {
        const action = new URL(req.url).searchParams.get('action');
        if (action === 'google') return await signIn(store, body);
        if (action === 'signout') return await signOut(store, body);
        return await submit(store, body);
      }
      if (req.method === 'DELETE') return await del(store, req, body);
      return json(405, { error: 'method' });
    } catch (e) {
      console.error(e);
      return json(502, { error: 'store' });
    }
  };
}

// ---------------------------------------------------------------- Vercel entry points

const env = (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env ?? {};

let store: Store | null | undefined;
function envStore(): Store | null {
  if (store === undefined) {
    const url = env.UPSTASH_REDIS_REST_URL ?? env.KV_REST_API_URL;
    const token = env.UPSTASH_REDIS_REST_TOKEN ?? env.KV_REST_API_TOKEN;
    store = url && token ? upstash(url, token) : null;
  }
  return store;
}

const handler = createHandler(envStore, {
  adminToken: env.LEADERBOARD_ADMIN_TOKEN || undefined,
  googleClientId: env.GOOGLE_CLIENT_ID || undefined,
  requireGoogle: env.LEADERBOARD_REQUIRE_GOOGLE === '1',
});

export const GET = handler;
export const POST = handler;
export const DELETE = handler;
export const OPTIONS = handler;
