// 経営モードの入口：14 日未満のクリアと、本店からの送金
import { describe, expect, it } from 'vitest';
import { newPrestige } from '../src/game/prestige';
import { EMPIRE_RELEASED, empireOpen, empireUnlocked, TRANSFER_CAP, transferFor, UNLOCK_CLEAR_DAY } from '../src/empire/unlock';

const record = (days: number, cleared: boolean, clearDay?: number | null) => ({ run: 1, land: null, days, seconds: 0, clearSeconds: cleared ? 100 : null, clearDay, revenue: 0, cp: 0 });

describe('マインちゃんの登場条件', () => {
  it('この周回を 14 日未満でクリアしたら開く', () => {
    const p = newPrestige();
    expect(empireUnlocked(p)).toBe(false);
    p.clearDay = UNLOCK_CLEAR_DAY;
    expect(empireUnlocked(p)).toBe(false);
    p.clearDay = UNLOCK_CLEAR_DAY - 1;
    expect(empireUnlocked(p)).toBe(true);
  });

  it('過去の周回の記録でも開く（clearDay が無い古い記録は、移転までの日数で見る）', () => {
    const p = newPrestige();
    p.history.push(record(20, true));
    expect(empireUnlocked(p)).toBe(false);
    p.history.push(record(12, false));
    expect(empireUnlocked(p)).toBe(false);
    p.history.push(record(12, true));
    expect(empireUnlocked(p)).toBe(true);
    const q = newPrestige();
    q.history.push(record(30, true, 9));
    expect(empireUnlocked(q)).toBe(true);
  });
});

describe('本店からの送金', () => {
  it('売上の 1%、フェーズの上限まで', () => {
    expect(transferFor(1_000_000, 1)).toBe(10_000);
    expect(transferFor(1e12, 1)).toBe(TRANSFER_CAP[1]);
    expect(transferFor(-5, 1)).toBe(0);
  });
});

describe('入口を出すか', () => {
  it('テストモードでは登場条件を満たしている扱い、公開前の通常モードでは出さない', () => {
    const p = newPrestige();
    expect(empireOpen({ test: true, hasCompany: false, prestige: p })).toBe(true);
    expect(EMPIRE_RELEASED).toBe(false);
    p.clearDay = 5;
    expect(empireOpen({ test: false, hasCompany: true, prestige: p })).toBe(false);
  });
});
