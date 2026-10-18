// bearko.games 共通基盤（総合スコア・トロフィー・RTA）に送るもの
import { afterEach, describe, expect, it, vi } from 'vitest';
import { newSave } from '../src/game/save';
import { abortRta, canPickAvatar, openAvatarPicker, reportRtaProgress, reportScore, reportTrophies, rtaCheckpointsReached, scoreMetrics, setRtaPending, startRtaIfPending, trophyIds } from '../src/net/platform';

describe('総合スコアの成績', () => {
  it('はじめは day・クリアなし', () => {
    const s = newSave(0);
    s.day = 3;
    expect(scoreMetrics(s)).toMatchObject({ day: 3, clearBest: null, run: 1 });
  });
  it('30 日目に届いたことがあれば day は 30 以上、最速クリアは周回込み', () => {
    const s = newSave(0);
    s.day = 5;
    s.prestige.runs = 1;
    s.prestige.clearSeconds = 9000;
    s.prestige.history = [{ ...(s.prestige.history[0] ?? {}), clearSeconds: 7200 } as never];
    expect(scoreMetrics(s)).toMatchObject({ day: 30, clearBest: 7200, run: 2 });
  });
  it('SDK がなくても例外を出さない', () => {
    expect(() => reportScore(newSave(0))).not.toThrow();
  });
});

// ---------------------------------------------------------------- トロフィー・RTA（docs/ROADMAP.md 8.4）

const withLevels = (levels: Record<string, number>) => {
  const s = newSave(0);
  Object.assign(s.levels, levels);
  return s;
};

describe('トロフィーの条件', () => {
  it('はじめは何もない', () => {
    expect(trophyIds(newSave(0))).toEqual([]);
  });
  it('1 日目の営業を終えると day1（閉店で day が 2 になる）', () => {
    const s = newSave(0);
    expect(trophyIds(s)).not.toContain('workshop.day1');
    s.day = 2;
    expect(trophyIds(s)).toEqual(['workshop.day1']);
  });
  it('30 日目を終えると day30、MCH製法で legendary、黄金のエクステンションで clear', () => {
    const s = withLevels({ epic: 1, legendary: 1 });
    s.day = 31;
    expect(trophyIds(s)).toEqual(['workshop.day1', 'workshop.day30', 'workshop.legendary']);
    s.levels.goldenExtension = 1;
    expect(trophyIds(s)).toEqual(['workshop.day1', 'workshop.day30', 'workshop.legendary', 'workshop.clear']);
  });
  it('30 日目の途中ではまだ付かない', () => {
    const s = newSave(0);
    s.day = 30;
    expect(trophyIds(s)).not.toContain('workshop.day30');
  });
  it('移転したあとは 1 周目の分も含めて 5 つ', () => {
    const s = newSave(0);
    s.prestige.runs = 1;
    expect(trophyIds(s)).toEqual(['workshop.day1', 'workshop.day30', 'workshop.legendary', 'workshop.clear', 'workshop.relocate']);
  });
});

describe('RTA の区切り', () => {
  it('Epic → Legendary → 黄金のエクステンション の順', () => {
    expect(rtaCheckpointsReached(newSave(0))).toEqual([]);
    expect(rtaCheckpointsReached(withLevels({ epic: 1 }))).toEqual(['epic']);
    expect(rtaCheckpointsReached(withLevels({ epic: 1, legendary: 1, goldenExtension: 1 }))).toEqual(['epic', 'legendary', 'clear']);
  });
});

describe('共通基盤の SDK への送信', () => {
  const g = globalThis as unknown as { window?: unknown; sessionStorage?: unknown };
  const fakeSdk = () => {
    let running: { runId: string; regulation: string } | null = null;
    const ok = () => Promise.resolve({ ok: true });
    const sdk = {
      init: vi.fn(ok),
      submitScore: vi.fn(ok),
      unlockTrophy: vi.fn((_id: string) => ok()),
      rta: {
        start: vi.fn((o: { regulation: string }) => ((running = { runId: 'r1', regulation: o.regulation }), ok())),
        checkpoint: vi.fn((_id: string, _opts?: { igtMs?: number }) => ok()),
        abort: vi.fn(() => ((running = null), ok())),
        current: () => running,
      },
    };
    const store = new Map<string, string>();
    g.sessionStorage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v), removeItem: (k: string) => store.delete(k) };
    g.window = { BearkoGames: sdk };
    return sdk;
  };
  afterEach(() => {
    delete g.window;
    delete g.sessionStorage;
  });

  it('同じトロフィーは 1 回だけ、1 つずつ順に送る（同時に送ると別々の仮アカウントに入る）', async () => {
    const sdk = fakeSdk();
    let release = () => {};
    sdk.unlockTrophy.mockImplementationOnce(() => new Promise((r) => (release = () => r({ ok: true }))));
    const s = withLevels({ epic: 1, legendary: 1 });
    s.day = 31;
    reportTrophies(s);
    reportTrophies(s);
    await new Promise((r) => setTimeout(r, 0));
    expect(sdk.unlockTrophy.mock.calls.map((c) => c[0])).toEqual(['workshop.day1']);
    release();
    await new Promise((r) => setTimeout(r, 0));
    expect(sdk.unlockTrophy.mock.calls.map((c) => c[0])).toEqual(['workshop.day1', 'workshop.day30', 'workshop.legendary']);
  });

  it('「RTA で始める」から来た Day 1 だけ計測を始め、区切りを順に 1 回ずつ送る', () => {
    const sdk = fakeSdk();
    const s = newSave(0);
    startRtaIfPending(s);
    expect(sdk.rta.start).not.toHaveBeenCalled();
    setRtaPending(true);
    startRtaIfPending(s);
    expect(sdk.rta.start).toHaveBeenCalledWith(expect.objectContaining({ regulation: 'workshop-golden' }));
    s.levels.epic = 1;
    reportRtaProgress(s, 1234.4);
    reportRtaProgress(s, 2000);
    s.levels.legendary = 1;
    s.levels.goldenExtension = 1;
    reportRtaProgress(s, 9000);
    expect(sdk.rta.checkpoint.mock.calls).toEqual([
      ['epic', { igtMs: 1234 }],
      ['legendary', { igtMs: 9000 }],
      ['clear', { igtMs: 9000 }],
    ]);
    abortRta();
    expect(sdk.rta.abort).toHaveBeenCalled();
  });

  it('移転したあとや Day 2 以降では始めない', () => {
    const sdk = fakeSdk();
    const s = newSave(0);
    s.prestige.runs = 1;
    setRtaPending(true);
    startRtaIfPending(s);
    expect(sdk.rta.start).not.toHaveBeenCalled();
  });

  it('計測していなければ区切りを送らない', () => {
    const sdk = fakeSdk();
    reportRtaProgress(withLevels({ epic: 1 }), 1000);
    expect(sdk.rta.checkpoint).not.toHaveBeenCalled();
  });
});

describe('bearko.games 共通のアイコン', () => {
  const g = globalThis as unknown as { window?: unknown };
  afterEach(() => { delete g.window; });
  it('SDK がない・古いときは出さず例外も出さない。あれば窓を開く', () => {
    expect(canPickAvatar()).toBe(false);
    expect(openAvatarPicker()).toBe(false);
    g.window = { BearkoGames: { init: async () => ({ ok: true }) } };
    expect(canPickAvatar()).toBe(false);
    let opened = 0;
    g.window = { BearkoGames: { init: async () => ({ ok: true }), openAvatarPicker: () => { opened++; } } };
    expect(canPickAvatar()).toBe(true);
    expect(openAvatarPicker()).toBe(true);
    expect(opened).toBe(1);
  });
});
