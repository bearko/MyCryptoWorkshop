// 経営モードのフェーズ 2（エリアチェーン、docs/EMPIRE_DESIGN.md 4.2）
import { describe, expect, it } from 'vitest';
import { cannibalMult, CENTER_RANGE, dist, generateArea, rivalTarget } from '../src/empire/area';
import { newEmpire, restoreEmpire, type EmpireState } from '../src/empire/model';
import { makeRng } from '../src/empire/rng';
import { rivalOf } from '../src/empire/rivals';
import { advanceMonth, AREA_OPEN_COST, areaMult, canPromote, CENTER_COST, DELIVERY, logistics, ownCells, phase2Done, plotsFor, POS_COST, RIVAL } from '../src/empire/sim';

/** フェーズ 1 を抜けて、エリアの地図ができたところ */
function phase2(seed = 3): EmpireState {
  let s: EmpireState = { ...newEmpire('a', seed), funds: 200_000_000 };
  s = advanceMonth(s, { open: plotsFor(s).slice(0, 2) }).state;
  while (!canPromote(s)) s = advanceMonth(s).state;
  return advanceMonth(s, { promote: true }).state;
}

describe('エリアの地図', () => {
  it('同じ乱数からは同じ地図。人通りの多い区画ほど家賃が高い', () => {
    const a = generateArea(makeRng(9));
    expect(generateArea(makeRng(9))).toEqual(a);
    expect(a.cells).toHaveLength(a.w * a.h);
    const byBase = [...a.cells].sort((x, y) => x.base - y.base);
    expect(byBase.at(-1)!.rent).toBeGreaterThan(byBase[0].rent);
  });

  it('近くの自店・ライバルほど食い合う', () => {
    const a = generateArea(makeRng(1));
    const c = 2 * a.w + 3;
    expect(cannibalMult(a, c, [c])).toBe(1);
    const near = cannibalMult(a, c, [c, c + 1]);
    const far = cannibalMult(a, c, [c, c + 2]);
    expect(near).toBeLessThan(far);
    expect(far).toBeLessThan(1);
    expect(cannibalMult({ ...a, rivalStores: [c - 1] }, c, [c])).toBeLessThan(near);
  });
});

describe('フェーズ 1 → 2', () => {
  it('格上げで地図ができ、いまの店が区画に並び、ライバルが店を持って次の出店を予告している', () => {
    const s = phase2();
    expect(s.phase).toBe(2);
    expect(s.area).not.toBeNull();
    expect(s.stores.every((x) => x.cell !== null)).toBe(true);
    expect(new Set(ownCells(s)).size).toBe(s.stores.length);
    expect(s.area!.rivalStores).toHaveLength(RIVAL.start);
    expect(s.area!.rivalPlan).not.toBeNull();
    expect(rivalOf(s.land).company.ja).toBe('海援商会');
  });

  it('区画への出店は空きにだけ。費用を払う', () => {
    const s = phase2();
    const taken = s.stores[0].cell!;
    const free = s.area!.cells.findIndex((_, i) => !ownCells(s).includes(i) && !s.area!.rivalStores.includes(i) && i !== s.area!.rivalPlan?.cell);
    const { state, report } = advanceMonth(s, { openAt: [taken, free] });
    expect(state.stores).toHaveLength(s.stores.length + 1);
    expect(state.stores.at(-1)!.cell).toBe(free);
    expect(state.funds).toBeCloseTo(s.funds - AREA_OPEN_COST + report.profit);
  });
});

describe('物流・SV・POS', () => {
  it('物流センターの配送圏の中は配送費も原価率も下がる', () => {
    const s = phase2();
    const store = s.stores[0];
    expect(logistics(s, store).delivery).toBe(DELIVERY.none);
    const far = s.area!.cells.findIndex((_, i) => dist(s.area!, i, store.cell!) > CENTER_RANGE && !s.area!.rivalStores.includes(i));
    const near = s.area!.cells.findIndex((_, i) => dist(s.area!, i, store.cell!) === 1 && !ownCells(s).includes(i) && !s.area!.rivalStores.includes(i));
    const withFar = advanceMonth(s, { buildCenter: [far] }).state;
    expect(withFar.funds).toBeLessThan(s.funds - CENTER_COST + 1e8);
    expect(logistics(withFar, withFar.stores[0]).delivery).toBe(DELIVERY.outOfRange);
    const withNear = advanceMonth(s, { buildCenter: [near] }).state;
    const l = logistics(withNear, withNear.stores[0]);
    expect(l.delivery).toBe(DELIVERY.inRange);
    expect(l.costRate).toBeLessThan(logistics(s, store).costRate);
  });

  it('SV が足りると需要の目減りがなくなる', () => {
    const s = phase2();
    expect(areaMult({ ...s, sv: 1 }, s.stores[0])).toBeGreaterThan(areaMult({ ...s, sv: 0 }, s.stores[0]));
  });

  it('POS を入れると、欠品と廃棄が合わせて減る', () => {
    const s = phase2();
    const without = advanceMonth(s).report.stores;
    const withPos = advanceMonth({ ...s, funds: s.funds }, { pos: true });
    expect(withPos.state.pos).toBe(true);
    expect(withPos.state.funds).toBeCloseTo(s.funds - POS_COST + withPos.report.profit);
    const loss = (rs: typeof without) => rs.reduce((a, r) => a + r.waste + r.lost, 0);
    expect(loss(withPos.report.stores)).toBeLessThan(loss(without));
  });
});

describe('ライバル', () => {
  it('予告した区画に、予告した月に出店する', () => {
    let s = phase2();
    const plan = s.area!.rivalPlan!;
    while (s.month < plan.month) s = advanceMonth(s).state;
    const r = advanceMonth(s);
    expect(r.state.area!.rivalStores).toContain(plan.cell);
    expect(r.report.notes.some((n) => n.kind === 'rivalOpened' && n.cell === plan.cell)).toBe(true);
    expect(r.report.notes.some((n) => n.kind === 'rivalPlan')).toBe(true);
  });

  it('予告された区画に先に出店すれば、ライバルは別の区画へ回る', () => {
    const s = phase2();
    const plan = s.area!.rivalPlan!;
    let t = advanceMonth(s, { openAt: [plan.cell] }).state;
    while (t.month <= plan.month) t = advanceMonth(t).state;
    expect(t.stores.some((x) => x.cell === plan.cell)).toBe(true);
    expect(t.area!.rivalStores).not.toContain(plan.cell);
    expect(t.area!.rivalStores.length).toBeGreaterThan(RIVAL.start);
  });

  it('次の狙いは空き区画から選ぶ', () => {
    const s = phase2();
    const c = rivalTarget(s.area!, ownCells(s))!;
    expect(ownCells(s)).not.toContain(c);
    expect(s.area!.rivalStores).not.toContain(c);
  });
});

describe('フェーズ 2 の卒業と保存', () => {
  it('12 店・ライバルより多い・物流センターで条件を満たす', () => {
    const s = phase2();
    expect(phase2Done(s)).toBe(false);
    const area = s.area!;
    const free = area.cells.map((_, i) => i).filter((i) => !ownCells(s).includes(i) && !area.rivalStores.includes(i));
    const big = { ...s, funds: 1e10 };
    const t = advanceMonth(big, { buildCenter: [free[0]], openAt: free.slice(1, 10) }).state;
    expect(t.stores.length).toBeGreaterThanOrEqual(12);
    expect(phase2Done(t)).toBe(true);
    expect(canPromote(t)).toBe(true);
  });

  it('地図ごと JSON を通しても同じ', () => {
    const s = advanceMonth(phase2()).state;
    expect(restoreEmpire(JSON.parse(JSON.stringify(s)))).toEqual(s);
  });
});
