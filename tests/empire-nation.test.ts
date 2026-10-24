// 経営モードのフェーズ 3（全国チェーン、docs/EMPIRE_DESIGN.md 4.3）
import { describe, expect, it } from 'vitest';
import { freeCells } from '../src/empire/area';
import { newEmpire, restoreEmpire, type EmpireState } from '../src/empire/model';
import { HUB_COST, MANUAL_UNLOCK, nationStores, OPEN_COSTS, perStoreDaily, regionMonth, regionStores, trainees, TRAINING_COST } from '../src/empire/nation';
import { advanceMonth, canPromote, ownCells, phase3Done, plotsFor, storeCount } from '../src/empire/sim';

/** フェーズ 2 を抜けて、全国チェーンになったところ */
function phase3(seed = 3): EmpireState {
  let s: EmpireState = { ...newEmpire('a', seed), funds: 1e10 };
  s = advanceMonth(s, { open: plotsFor(s).slice(0, 2) }).state;
  while (!canPromote(s)) s = advanceMonth(s).state;
  s = advanceMonth(s, { promote: true }).state;
  const free = freeCells(s.area!, new Set(ownCells(s)));
  s = advanceMonth(s, { buildCenter: [free[0]], openAt: free.slice(1, 10) }).state;
  expect(canPromote(s)).toBe(true);
  return advanceMonth(s, { promote: true }).state;
}

describe('フェーズ 2 → 3', () => {
  it('格上げで 6 エリアができ、本拠エリアに地図の店とライバルがまとまる', () => {
    const s = phase3();
    expect(s.phase).toBe(3);
    const n = s.nation!;
    expect(n.regions).toHaveLength(6);
    expect(regionStores(n.regions[0])).toBe(s.stores.length);
    expect(n.regions[0].hub).toBe(true);
    expect(n.regions.slice(1).every((r) => !r.hub && regionStores(r) === 0 && r.rival > 0)).toBe(true);
    expect(storeCount(s)).toBe(nationStores(n));
    const r = advanceMonth(s).report;
    expect(r.rivalRevenue).toBeGreaterThan(0);
    expect(r.revenue).toBeGreaterThan(0);
  });
});

describe('出店：物流拠点と研修所', () => {
  it('物流拠点の無いエリアには出店できない。建てれば出せる', () => {
    const s = phase3();
    const blocked = advanceMonth(s, { expand: [{ region: 1, type: 'direct', count: 1 }] });
    expect(regionStores(blocked.state.nation!.regions[1])).toBe(0);
    expect(blocked.report.notes.some((n) => n.kind === 'needHub')).toBe(true);
    const ok = advanceMonth(s, { buildHub: [1], expand: [{ region: 1, type: 'direct', count: 1 }] });
    expect(ok.state.nation!.regions[1].hub).toBe(true);
    expect(ok.state.nation!.regions[1].direct).toBe(1);
    expect(ok.state.funds).toBeCloseTo(s.funds - HUB_COST - OPEN_COSTS.direct + ok.report.profit);
  });

  it('1 か月に出せるのは研修所で育った人数まで。研修所で増える', () => {
    const s = phase3();
    const before = nationStores(s.nation!);
    const r = advanceMonth(s, { expand: [{ region: 0, type: 'fcOwner', count: 20 }] });
    expect(nationStores(r.state.nation!) - before).toBe(trainees(s.nation!));
    expect(r.report.notes.some((n) => n.kind === 'traineeLimit')).toBe(true);
    const t = advanceMonth(s, { training: 2 }).state;
    expect(t.nation!.trainingCenters).toBe(2);
    expect(t.funds).toBeLessThan(s.funds - 2 * TRAINING_COST + 1e9);
    const r2 = advanceMonth(t, { expand: [{ region: 0, type: 'fcOwner', count: 20 }] });
    expect(nationStores(r2.state.nation!) - nationStores(t.nation!)).toBe(trainees(t.nation!));
  });
});

describe('店の形と品質', () => {
  it('加盟店：オーナーの土地は取り分が低く、本部の土地は家賃を払う代わりに取り分が高い', () => {
    const s = phase3();
    const base = { ...s.nation!.regions[0], direct: 0, fcOwner: 0, fcHq: 0, rival: 0 };
    const one = (k: 'direct' | 'fcOwner' | 'fcHq') => regionMonth({ ...base, [k]: 1 }, 1, 0).profit;
    expect(one('fcOwner')).toBeGreaterThan(0);
    expect(one('fcHq')).toBeGreaterThan(one('fcOwner'));
    expect(one('direct')).toBeGreaterThan(one('fcHq'));
  });

  it('急いで出店すると品質が下がり、崩れてからマニュアルを整えられる', () => {
    let s = phase3();
    s = advanceMonth(s, { training: 4 }).state;
    expect(advanceMonth(s, { manual: true }).state.nation!.manual).toBe(false);
    let warned = false;
    for (let i = 0; i < 6 && s.nation!.quality >= MANUAL_UNLOCK; i++) {
      const r = advanceMonth(s, { expand: [{ region: 0, type: 'fcOwner', count: 30 }] });
      s = r.state;
      warned ||= r.report.notes.some((n) => n.kind === 'manualReady');
    }
    expect(s.nation!.quality).toBeLessThan(MANUAL_UNLOCK);
    expect(warned).toBe(true);
    const m = advanceMonth(s, { manual: true }).state;
    expect(m.nation!.manual).toBe(true);
    const r = s.nation!.regions[0];
    expect(perStoreDaily(r, 0.8)).toBeLessThan(perStoreDaily(r, 1));
  });
});

describe('卒業と保存', () => {
  it('直近 12 か月の売上がライバルを上回ると条件を満たす', () => {
    let s = phase3();
    expect(phase3Done(s)).toBe(false);
    s = advanceMonth(s, { training: 5, buildHub: [1, 2, 3, 4, 5] }).state;
    for (let i = 0; i < 24 && !phase3Done(s); i++) {
      s = advanceMonth(s, { expand: [0, 1, 2, 3, 4, 5].map((region) => ({ region, type: 'fcOwner' as const, count: 4 })) }).state;
    }
    expect(phase3Done(s)).toBe(true);
    expect(canPromote(s)).toBe(true);
  });

  it('6 エリアごと JSON を通しても同じ', () => {
    const s = advanceMonth(phase3()).state;
    expect(restoreEmpire(JSON.parse(JSON.stringify(s)))).toEqual(s);
  });
});
