/**
 * 段ごとの打ち手の見込み（whatIf）・次に細くなる段（nextJam）・稼働率（uptime）。docs/ISLAND_PHASE1.md「見込みつきの打ち手」
 */
import { describe, expect, it } from 'vitest';
import { baseOf } from '../scripts/island/audit';
import { bonus, gainSkill, jamOf, nextJam, serializeP1, stageCaps, uptime, whatIf } from '../src/island/p1/model';

describe('稼働率（uptime）', () => {
  it('休憩室・シフト制で上がり、賞与（疲れている人）で上がる。0〜1', () => {
    const s = baseOf('j_craft');
    const st = s.staff.find((x) => x.task === 'craft')!;
    const u0 = uptime(s, st);
    expect(u0).toBeGreaterThan(0);
    expect(u0).toBeLessThanOrEqual(1);
    const a = structuredClone(s);
    gainSkill(a, 'lounge');
    expect(uptime(a, a.staff.find((x) => x.task === 'craft')!)).toBeGreaterThan(u0);
    const b = structuredClone(s);
    gainSkill(b, 'shift');
    expect(uptime(b, b.staff.find((x) => x.task === 'craft')!)).toBeGreaterThan(u0);
    const c = structuredClone(s);
    const t = c.staff.find((x) => x.task === 'craft')!;
    t.stamina = t.stats.hp * 0.3;
    const tired = uptime(c, t);
    bonus(c, t.hero);
    expect(uptime(c, t)).toBeGreaterThan(tired);
  });
});

describe('段ごとの打ち手の見込み（whatIf）', () => {
  it('純粋関数：状態を書き換えない', () => {
    const s = baseOf('j_craft');
    const before = serializeP1(s);
    for (const k of ['buy', 'craft', 'haul', 'sell'] as const) whatIf(s, k);
    expect(serializeP1(s)).toBe(before);
  });
  it('効き目の大きい順で、どれもその段の数字を上げる。製造が詰まりなら、作業台（職人つき）が効く', () => {
    const s = baseOf('j_craft');
    expect(jamOf(s)).toBe('craft');
    const ws = whatIf(s, 'craft');
    expect(ws.length).toBeGreaterThan(2);
    for (let k = 1; k < ws.length; k++) expect(ws[k - 1].units).toBeGreaterThanOrEqual(ws[k].units);
    expect(ws.every((w) => w.units > 0)).toBe(true);
    const bench = ws.find((w) => w.move.kind === 'invest' && w.move.id === 'bench');
    expect(bench?.ok).toBe(true);
  });
  it('物流・調達が詰まりのときも、その段の打ち手が出る（荷車・運搬係／調達の上限・倉庫・早足）', () => {
    const h = whatIf(baseOf('j_haul1'), 'haul');
    expect(h.some((w) => w.move.kind === 'invest' && w.move.id === 'carts' && w.ok)).toBe(true);
    expect(h.some((w) => w.move.kind === 'person' && w.ok)).toBe(true);
    const b = whatIf(baseOf('j_buy'), 'buy');
    expect(b.some((w) => w.move.kind === 'skill' && w.move.id === 'stock1' && w.ok)).toBe(true);
    const t = whatIf(baseOf('j_trip'), 'buy');
    expect(t.some((w) => w.move.kind === 'build' && w.move.id === 'warehouse' && w.ok)).toBe(true);
    expect(t.some((w) => w.move.kind === 'skill' && w.move.id === 'swift' && w.ok)).toBe(true);
  });
  it('打ち手を当てると、見込みどおりにその段の数字が上がる（作業台）', () => {
    const s = baseOf('j_craft');
    const w = whatIf(s, 'craft').find((x) => x.move.kind === 'skill' && x.move.id === 'jig')!;
    const before = stageCaps(s, true).craft.perMonth;
    gainSkill(s, 'jig');
    expect(stageCaps(s, true).craft.perMonth - before).toBeCloseTo(w.units, 6);
  });
});

describe('次に細くなる段（nextJam）', () => {
  it('詰まりを 30% 太くしたら、次に細い段が出る（同じなら same）', () => {
    const s = baseOf('j_craft');
    const nx = nextJam(s);
    expect(nx.bn).toBe('craft');
    const c = stageCaps(s);
    const others = (['buy', 'haul', 'sell'] as const).map((k) => c[k].perMonth);
    if (c.craft.perMonth * 1.3 > Math.min(...others)) expect(nx.same).toBe(false);
    else expect(nx.same).toBe(true);
    const std = baseOf('std0');
    // 止まっている段（調達係なし・素材切れ）は、動かしたとして次を見る
    const n0 = nextJam(std);
    expect(n0.bn).toBe('buy');
    expect(n0.next).not.toBe('buy');
  });
});
