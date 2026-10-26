// 周回向けの近道（まとめて習得して開店）は、一度クリアした人にだけ出す
import { describe, expect, it } from 'vitest';
import { everCleared, newPrestige } from '../src/game/prestige';

describe('一度でもクリアしたか', () => {
  it('この周回か過去の周回で黄金のエクステンションを作っていれば真', () => {
    const p = newPrestige();
    expect(everCleared(p)).toBe(false);
    p.history.push({ run: 1, land: null, days: 20, seconds: 900, clearSeconds: null, revenue: 0, cp: 0 });
    expect(everCleared(p)).toBe(false);
    p.history.push({ run: 2, land: 'Ocean', days: 15, seconds: 800, clearSeconds: 700, revenue: 0, cp: 0 });
    expect(everCleared(p)).toBe(true);
    const q = newPrestige();
    q.clearSeconds = 1200;
    expect(everCleared(q)).toBe(true);
  });
});
