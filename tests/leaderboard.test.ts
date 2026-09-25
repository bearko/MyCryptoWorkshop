import { describe, expect, it } from 'vitest';
import { BOARDS, cleanName, createHandler, dayKey, memoryStore, MIN_CLEAR_SECONDS, validate, weekKey } from '../api/leaderboard';

const NOW = Date.UTC(2026, 8, 25, 12); // Friday 2026-09-25
const id = (n: number) => n.toString(16).padStart(32, '0');

/** One store shared by every request (createHandler asks for it per request). */
function shared() {
  const store = memoryStore();
  const clock = { now: NOW };
  const handler = createHandler(() => store, { now: () => clock.now, adminToken: 'secret' });
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
