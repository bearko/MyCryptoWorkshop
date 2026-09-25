import { describe, expect, it } from 'vitest';
import { BOARDS, cleanName, createHandler, dayKey, googleVerifier, memoryStore, MIN_CLEAR_SECONDS, validate, weekKey, type HandlerOptions, type Jwk } from '../api/leaderboard';

const NOW = Date.UTC(2026, 8, 25, 12); // Friday 2026-09-25
const id = (n: number) => n.toString(16).padStart(32, '0');

/** One store shared by every request (createHandler asks for it per request). */
function shared(options: HandlerOptions = {}) {
  const clock = { now: NOW };
  const store = memoryStore(() => clock.now);
  const handler = createHandler(() => store, { now: () => clock.now, adminToken: 'secret', ...options });
  let ip = 0;
  const call = async (method: string, query = '', body?: unknown, headers: Record<string, string> = {}) => {
    const res = await handler(
      new Request(`http://x/api/leaderboard${query}`, {
        method,
        headers: { 'content-type': 'application/json', 'x-forwarded-for': `10.0.0.${ip++ % 250}`, ...headers },
        body: body === undefined ? undefined : JSON.stringify(body),
      }),
    );
    return { status: res.status, body: (await res.json().catch(() => null)) as Record<string, unknown> };
  };
  return { call, clock };
}

const entry = (n: number, patch: Record<string, unknown> = {}) => ({
  id: id(n),
  name: `P${n}`,
  total: 1000 * n,
  bestDay: 100 * n,
  lastDay: 50 * n,
  day30: 500 * n,
  clear1: null,
  clearBest: null,
  run: 1,
  day: 40,
  playSeconds: 20000,
  ...patch,
});

describe('leaderboard: validation', () => {
  it('cleans nicknames and refuses blocked ones', () => {
    expect(cleanName('  マイン　ちゃん ')).toBe('マイン ちゃん');
    expect(cleanName('ＡＢＣ１２３')).toBe('ABC123');
    expect(cleanName('')).toBeNull();
    expect(cleanName('x'.repeat(17))).toBeNull();
    expect(cleanName('visit http://spam')).toBeNull();
    expect(cleanName('シネ')).toBeNull();
    expect(cleanName(42)).toBeNull();
  });

  it('refuses impossible numbers', () => {
    expect(validate(entry(1))).toMatchObject({ id: id(1), total: 1000 });
    expect(validate({ ...entry(1), id: 'nope' })).toBe('bad_id');
    expect(validate({ ...entry(1), total: -1 })).toBe('bad_number');
    expect(validate({ ...entry(1), total: Infinity })).toBe('bad_number');
    expect(validate({ ...entry(1), bestDay: 5000 })).toBe('inconsistent');
    expect(validate({ ...entry(1), clear1: MIN_CLEAR_SECONDS - 1 })).toBe('bad_clear');
    expect(validate({ ...entry(1), clear1: 30000 })).toBe('bad_clear'); // longer than the play time
    expect(validate({ ...entry(1), clear1: 5000, clearBest: 6000 })).toBe('bad_clear');
    expect(validate({ ...entry(1), clear1: 5000, clearBest: 3000 })).toMatchObject({ clear1: 5000, clearBest: 3000 });
  });

  it('periods: UTC day and ISO week', () => {
    expect(dayKey(NOW)).toBe('2026-09-25');
    expect(weekKey(NOW)).toBe('2026-W39');
    expect(weekKey(Date.UTC(2026, 0, 1))).toBe('2026-W01');
    expect(weekKey(Date.UTC(2027, 0, 1))).toBe('2026-W53');
    expect(weekKey(Date.UTC(2024, 11, 30))).toBe('2025-W01');
  });
});

describe('leaderboard: API', () => {
  it('ranks by board order, keeps each player\'s best and shows the caller\'s rank', async () => {
    const { call } = shared();
    for (const n of [1, 2, 3]) expect((await call('POST', '', entry(n, { clear1: 3000 + n * 100, clearBest: 3000 + n * 100 }))).status).toBe(200);
    const total = await call('GET', `?board=total&me=${id(1)}`);
    expect((total.body.entries as { name: string }[]).map((e) => e.name)).toEqual(['P3', 'P2', 'P1']);
    expect(total.body.me).toEqual({ rank: 3, score: 1000 });
    // Clear time: lower is better.
    const clear = await call('GET', '?board=clear1');
    expect((clear.body.entries as { name: string }[]).map((e) => e.name)).toEqual(['P1', 'P2', 'P3']);
    // Ids are never public.
    expect(JSON.stringify(total.body)).not.toContain(id(3));
  });

  it('shows each player\'s title (称号); unknown titles are dropped', async () => {
    const { call, clock } = shared();
    await call('POST', '', entry(1, { title: 'Ocean:king' }));
    await call('POST', '', entry(2, { title: 'Moon:emperor' }));
    await call('POST', '', entry(3, { title: 'verse' }));
    const titles = ((await call('GET', '?board=total')).body.entries as { name: string; title?: string }[]).map((e) => [e.name, e.title ?? null]);
    expect(titles).toEqual([['P3', 'verse'], ['P2', null], ['P1', 'Ocean:king']]);
    // A later submission without a title clears it.
    clock.now += 11_000;
    await call('POST', '', entry(1));
    expect(((await call('GET', '?board=total')).body.entries as { name: string; title?: string }[]).find((e) => e.name === 'P1')?.title).toBeUndefined();
  });

  it('a worse later score does not replace the best one', async () => {
    const { call, clock } = shared();
    await call('POST', '', entry(1, { clear1: 4000, clearBest: 4000 }));
    clock.now += 11_000;
    await call('POST', '', entry(1, { total: 500, bestDay: 50, lastDay: 10, clear1: 5000, clearBest: 5000 }));
    expect(((await call('GET', '?board=total')).body.entries as { score: number }[])[0].score).toBe(1000);
    expect(((await call('GET', '?board=clear1')).body.entries as { score: number }[])[0].score).toBe(4000);
  });

  it('today and this week are separate boards per period', async () => {
    const { call, clock } = shared();
    await call('POST', '', entry(1));
    expect((await call('GET', '?board=today')).body).toMatchObject({ period: '2026-09-25', count: 1 });
    clock.now += 86400_000;
    expect((await call('GET', '?board=today')).body).toMatchObject({ period: '2026-09-26', count: 0 });
    expect((await call('GET', '?board=week')).body).toMatchObject({ period: '2026-W39', count: 1 });
  });

  it('rate-limits one player, refuses bad input and unknown boards', async () => {
    const { call } = shared();
    expect((await call('POST', '', entry(1))).status).toBe(200);
    expect((await call('POST', '', entry(1))).status).toBe(429);
    expect((await call('POST', '', { ...entry(2), name: '' })).body).toEqual({ error: 'bad_name' });
    expect((await call('GET', '?board=nope')).status).toBe(400);
  });

  it('limits requests per address', async () => {
    const { call } = shared();
    let status = 0;
    for (let i = 0; i < 70; i++) status = (await call('GET', '?board=total', undefined, { 'x-forwarded-for': '9.9.9.9' })).status;
    expect(status).toBe(429);
  });

  it('a player can withdraw; the admin can ban', async () => {
    const { call, clock } = shared();
    await call('POST', '', entry(1));
    await call('POST', '', entry(2));
    expect((await call('DELETE', '', { id: id(1) })).status).toBe(200);
    for (const board of Object.keys(BOARDS)) {
      expect(JSON.stringify((await call('GET', `?board=${board}`)).body)).not.toContain('"P1"');
    }
    // Admin view has ids; a ban blocks later submissions.
    const admin = await call('GET', '?board=total&admin=1', undefined, { authorization: 'Bearer secret' });
    expect((admin.body.entries as { id: string }[])[0].id).toBe(id(2));
    await call('DELETE', '', { id: id(2), ban: true }, { authorization: 'Bearer secret' });
    clock.now += 11_000;
    expect((await call('POST', '', entry(2))).status).toBe(403);
    // Without the token, ban is ignored.
    await call('DELETE', '', { id: id(3), ban: true });
    expect((await call('POST', '', entry(3))).status).toBe(200);
  });

  it('answers 503 until Upstash is configured, and CORS preflight', async () => {
    const handler = createHandler(() => null);
    expect((await handler(new Request('http://x/api/leaderboard?board=total'))).status).toBe(503);
    const pre = await handler(new Request('http://x/api/leaderboard', { method: 'OPTIONS' }));
    expect(pre.status).toBe(204);
    expect(pre.headers.get('access-control-allow-origin')).toBe('*');
  });
});

describe('leaderboard: game side', () => {
  it('the client boards are the server boards', async () => {
    const { BOARD_LIST } = await import('../src/net/leaderboard');
    expect(BOARD_LIST.map((b) => b.key).sort()).toEqual(Object.keys(BOARDS).sort());
  });

  it('a save gets a private id that survives save/load, and its snapshot passes the server checks', async () => {
    const { newSave, parseSave } = await import('../src/game/save');
    const { submission } = await import('../src/net/leaderboard');
    const save = newSave();
    expect(save.ranking).toMatchObject({ joined: false, day30: null });
    expect(save.ranking.id).toMatch(/^[0-9a-f]{32}$/);
    expect(parseSave(JSON.stringify(save)).ranking.id).toBe(save.ranking.id);
    // Older saves get one on load.
    const old = JSON.parse(JSON.stringify(save));
    delete old.ranking;
    expect(parseSave(JSON.stringify(old)).ranking.id).toMatch(/^[0-9a-f]{32}$/);

    Object.assign(save.ranking, { name: 'マイン', joined: true, day30: 5e6 });
    Object.assign(save, { day: 180, bestDayRevenue: 2e9 });
    save.totals.revenue = 4e11;
    save.meta.playSeconds = 23000;
    save.prestige.clearSeconds = 22000;
    const s = submission(save, 1.5e9);
    expect(s).toMatchObject({ clear1: 22000, clearBest: 22000, run: 1, day30: 5e6 });
    expect(validate(s)).toMatchObject({ name: 'マイン', total: 4e11 });
  });

  it('after relocating, run 1 stays the "fastest clear" record and the best of all runs counts too', async () => {
    const { newSave } = await import('../src/game/save');
    const { submission } = await import('../src/net/leaderboard');
    const save = newSave();
    save.prestige.runs = 2;
    save.prestige.history = [
      { run: 1, land: null, days: 170, seconds: 23000, clearSeconds: 22000, revenue: 4e11, cp: 10 },
      { run: 2, land: 'Ocean', days: 80, seconds: 9000, clearSeconds: 8000, revenue: 5e11, cp: 20 },
    ];
    save.prestige.clearSeconds = null;
    expect(submission(save, 0)).toMatchObject({ clear1: 22000, clearBest: 8000, run: 3 });
  });

  it('Day 30 of the first run records the early-dash sales', async () => {
    const { newSave } = await import('../src/game/save');
    const { Shop } = await import('../src/game/shop');
    const { seeded } = await import('../src/game/balance/autoplay');
    const save = newSave();
    Object.assign(save, { day: 30 });
    save.totals.revenue = 12345;
    const shop = new Shop(save, seeded(1));
    for (let i = 0; i < 30 * 400 && !shop.over; i++) {
      const d = shop.pendingDecision;
      if (d) shop.decide(d.fallback);
      shop.update(1 / 30);
    }
    expect(shop.over).toBe(true);
    expect(save.ranking.day30).toBe(save.totals.revenue);
    expect(save.ranking.day30).toBeGreaterThanOrEqual(12345);
  });
});

// ---------------------------------------------------------------- Google sign-in

const CLIENT = 'test-client.apps.googleusercontent.com';
const b64url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const b64json = (v: unknown) => b64url(new TextEncoder().encode(JSON.stringify(v)));

/** A Google-like signer: an RSA key pair and ID tokens signed with it. */
async function fakeGoogle() {
  const pair = (await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify'])) as CryptoKeyPair;
  const jwk = { ...(await crypto.subtle.exportKey('jwk', pair.publicKey)), kid: 'k1' } as Jwk;
  let fetches = 0;
  const fetchKeys = async () => {
    fetches++;
    return [jwk];
  };
  const token = async (claims: Record<string, unknown> = {}, kid = 'k1') => {
    const head = b64json({ alg: 'RS256', kid, typ: 'JWT' });
    const body = b64json({ iss: 'https://accounts.google.com', aud: CLIENT, sub: 'user-1', exp: NOW / 1000 + 3600, ...claims });
    const sig = new Uint8Array(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', pair.privateKey, new TextEncoder().encode(`${head}.${body}`)));
    return `${head}.${body}.${b64url(sig)}`;
  };
  return { fetchKeys, token, fetches: () => fetches };
}

describe('leaderboard: Google ID tokens', () => {
  it('accepts a signed token for our client and refuses anything else', async () => {
    const g = await fakeGoogle();
    const verify = googleVerifier(CLIENT, { now: () => NOW, fetchKeys: g.fetchKeys });
    expect(await verify(await g.token())).toEqual({ sub: 'user-1' });
    expect(await verify(await g.token({ aud: 'someone-else' }))).toBeNull();
    expect(await verify(await g.token({ iss: 'https://evil.example' }))).toBeNull();
    expect(await verify(await g.token({ exp: NOW / 1000 - 3600 }))).toBeNull();
    expect(await verify(await g.token({}, 'unknown-kid'))).toBeNull();
    // A token whose claims were changed after signing.
    const [h, , sig] = (await g.token()).split('.');
    expect(await verify(`${h}.${b64json({ iss: 'accounts.google.com', aud: CLIENT, sub: 'admin', exp: NOW / 1000 + 60 })}.${sig}`)).toBeNull();
    expect(await verify('not-a-token')).toBeNull();
    // Keys are cached.
    expect(g.fetches()).toBe(1);
  });
});

describe('leaderboard: signed-in players', () => {
  async function signedIn(options: HandlerOptions = {}) {
    const g = await fakeGoogle();
    const env = shared({ googleClientId: CLIENT, verifyGoogle: googleVerifier(CLIENT, { now: () => NOW, fetchKeys: g.fetchKeys }), ...options });
    const signIn = async (deviceId: string, claims: Record<string, unknown> = {}) =>
      env.call('POST', '?action=google', { id: deviceId, credential: await g.token(claims) });
    return { ...env, signIn, g };
  }

  it('tells the game the client id, and marks signed-in players as verified', async () => {
    const { call, signIn } = await signedIn();
    expect((await call('GET', '?board=total')).body.auth).toEqual({ googleClientId: CLIENT, requireGoogle: false });
    const res = await signIn(id(1));
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: id(1), name: null });
    expect(res.body.secret).toMatch(/^[0-9a-f]{32}$/);
    await call('POST', '', { ...entry(1), secret: res.body.secret });
    await call('POST', '', entry(2));
    const entries = (await call('GET', '?board=total')).body.entries as { name: string; verified?: boolean }[];
    expect(entries.find((e) => e.name === 'P1')?.verified).toBe(true);
    expect(entries.find((e) => e.name === 'P2')?.verified).toBeUndefined();
  });

  it('a linked record takes writes only from signed-in devices', async () => {
    const { call, signIn, clock } = await signedIn();
    const { secret } = (await signIn(id(1))).body as { secret: string };
    expect((await call('POST', '', entry(1))).body).toEqual({ error: 'auth' });
    clock.now += 11_000;
    expect((await call('POST', '', { ...entry(1), secret: 'f'.repeat(32) })).body).toEqual({ error: 'auth' });
    clock.now += 11_000;
    expect((await call('POST', '', { ...entry(1), secret })).status).toBe(200);
    // Signing out this device: its secret stops working.
    await call('POST', '?action=signout', { id: id(1), secret });
    clock.now += 11_000;
    expect((await call('POST', '', { ...entry(1), secret })).body).toEqual({ error: 'auth' });
    // Nobody can delete it without a secret either.
    expect((await call('DELETE', '', { id: id(1) })).status).toBe(403);
  });

  it('signing in on a second device continues the same player and merges that device\'s records', async () => {
    const { call, signIn, clock } = await signedIn();
    const first = (await signIn(id(1))).body as { id: string; secret: string };
    await call('POST', '', { ...entry(1, { total: 5000, bestDay: 900, clear1: 9000, clearBest: 9000 }), secret: first.secret });
    // Device 2 played on its own first (better clear, lower total).
    await call('POST', '', entry(2, { total: 3000, bestDay: 1200, lastDay: 100, clear1: 7000, clearBest: 7000 }));
    const second = (await signIn(id(2))).body as { id: string; secret: string; name: string };
    expect(second.id).toBe(id(1));
    expect(second.name).toBe('P1');
    expect(second.secret).not.toBe(first.secret);
    const top = async (board: string) => (await call('GET', `?board=${board}`)).body as { entries: { name: string; score: number }[]; count: number };
    expect(await top('total')).toMatchObject({ count: 1, entries: [{ name: 'P1', score: 5000 }] });
    expect((await top('bestDay')).entries[0].score).toBe(1200);
    expect((await top('clear1')).entries[0].score).toBe(7000);
    // Both devices can write.
    clock.now += 11_000;
    expect((await call('POST', '', { ...entry(1, { total: 6000, bestDay: 1200 }), id: second.id, secret: second.secret })).status).toBe(200);
  });

  it('a device linked to one account starts a new player for another account', async () => {
    const { signIn } = await signedIn();
    await signIn(id(1), { sub: 'alice' });
    const bob = (await signIn(id(1), { sub: 'bob' })).body as { id: string };
    expect(bob.id).not.toBe(id(1));
    expect(bob.id).toMatch(/^[0-9a-f]{32}$/);
  });

  it('withdrawing removes the link; a ban keeps it so the account stays banned', async () => {
    const { call, signIn, clock } = await signedIn();
    const a = (await signIn(id(1), { sub: 'alice' })).body as { secret: string };
    await call('POST', '', { ...entry(1), secret: a.secret });
    expect((await call('DELETE', '', { id: id(1), secret: a.secret })).status).toBe(200);
    // Signed in again: a fresh link, no records.
    expect((await signIn(id(1), { sub: 'alice' })).body).toMatchObject({ id: id(1), name: null });

    const b = (await signIn(id(2), { sub: 'bob' })).body as { secret: string };
    await call('POST', '', { ...entry(2), secret: b.secret });
    await call('DELETE', '', { id: id(2), ban: true }, { authorization: 'Bearer secret' });
    clock.now += 11_000;
    expect((await signIn(id(3), { sub: 'bob' })).status).toBe(403);
  });

  it('LEADERBOARD_REQUIRE_GOOGLE: only signed-in players submit', async () => {
    const { call, signIn } = await signedIn({ requireGoogle: true });
    expect((await call('GET', '?board=total')).body.auth).toMatchObject({ requireGoogle: true });
    expect((await call('POST', '', entry(1))).body).toEqual({ error: 'login_required' });
    const { secret } = (await signIn(id(2))).body as { secret: string };
    expect((await call('POST', '', { ...entry(2), secret })).status).toBe(200);
  });

  it('sign-in is off without a client id; bad tokens are refused', async () => {
    const off = shared();
    expect((await off.call('POST', '?action=google', { id: id(1), credential: 'x' })).status).toBe(501);
    expect(((await off.call('GET', '?board=total')).body.auth as { googleClientId: unknown }).googleClientId).toBeNull();
    const { call } = await signedIn();
    expect((await call('POST', '?action=google', { id: id(1), credential: 'x.y.z' })).status).toBe(401);
  });
});

describe('leaderboard: game client against the handler', () => {
  it('join, sign in with Google on two devices, sign out', async () => {
    const g = await fakeGoogle();
    const clock = { now: NOW };
    const store = memoryStore(() => clock.now);
    const handler = createHandler(() => store, { now: () => clock.now, googleClientId: CLIENT, verifyGoogle: googleVerifier(CLIENT, { now: () => NOW, fetchKeys: g.fetchKeys }) });
    const realFetch = globalThis.fetch;
    globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => handler(new Request(input, init))) as typeof fetch;
    try {
      const { newSave } = await import('../src/game/save');
      const lb = await import('../src/net/leaderboard');
      // Device A joins with a nickname, then signs in.
      const a = newSave();
      Object.assign(a.ranking, { name: 'マイン', joined: true });
      a.totals.revenue = 1e6;
      a.bestDayRevenue = 1e5;
      await lb.submit(a);
      expect(await lb.signInWithGoogle(a, await g.token())).toBe(false);
      expect(a.ranking).toMatchObject({ google: true, joined: true });
      clock.now += 11_000;
      await lb.submit(a);
      // Device B signs in with the same account: it becomes the same player, name included.
      const b = newSave();
      b.bestDayRevenue = 5e5;
      b.totals.revenue = 6e5;
      expect(await lb.signInWithGoogle(b, await g.token())).toBe(true);
      expect(b.ranking).toMatchObject({ id: a.ranking.id, name: 'マイン', joined: true, google: true });
      clock.now += 11_000;
      await lb.submit(b);
      const best = await lb.fetchBoard('bestDay', b.ranking.id);
      expect(best.entries).toEqual([{ rank: 1, name: 'マイン', score: 5e5, verified: true, me: true }]);
      expect(best.auth).toEqual({ googleClientId: CLIENT, requireGoogle: false });
      // B signs out: a fresh unlinked id; its old secret no longer works.
      const oldSecret = b.ranking.secret!;
      await lb.signOut(b);
      expect(b.ranking).toMatchObject({ google: false, secret: null, joined: false });
      expect(b.ranking.id).not.toBe(a.ranking.id);
      clock.now += 11_000;
      await expect(lb.submit({ ...b, ranking: { ...b.ranking, id: a.ranking.id, secret: oldSecret, joined: true, name: 'x' } })).rejects.toMatchObject({ code: 'auth' });
    } finally {
      globalThis.fetch = realFetch;
    }
  });
});
