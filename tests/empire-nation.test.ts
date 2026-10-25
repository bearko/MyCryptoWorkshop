// 経営モードのフェーズ 3（全国チェーン、docs/EMPIRE_DESIGN.md 4.3）
import { describe, expect, it } from 'vitest';
import { crownStats } from '../src/empire/crowns';
import { landProfile } from '../src/empire/lands';
import { freeCells } from '../src/empire/area';
import { newEmpire, restoreEmpire, type EmpireState } from '../src/empire/model';
import { ERA, HUB_COST, MANUAL_UNLOCK, nationStores, OPEN_COSTS, perStoreDaily, regionMonth, regionStores, trainees, TRAINING_COST } from '../src/empire/nation';
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

/** 規制の緩い時代にした全国チェーン（出店の上限を外して確かめるため） */
const loose = (s: EmpireState): EmpireState => ({ ...s, nation: { ...s.nation!, eraStrict: false, eraChange: s.month + 100 } });

describe('フェーズ 2 → 3', () => {
  it('格上げで 6 エリアができ、本拠エリアに地図の店とライバルがまとまる', () => {
    const s = phase3();
    expect(s.phase).toBe(3);
    const n = s.nation!;
    expect(n.regions).toHaveLength(11);
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
    expect(ok.state.funds).toBeCloseTo(s.funds - HUB_COST - OPEN_COSTS.direct * ERA.strictCost + ok.report.profit);
  });

  it('1 か月に出せるのは研修所で育った人数まで。研修所で増える', () => {
    const s = loose(phase3());
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
    let s = loose(phase3());
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
  it('直近 12 か月の売上がライバルを上回ると 1 位（卒業には謁見も要る）', () => {
    let s = loose(phase3());
    expect(phase3Done(s)).toBe(false);
    const open = [1, 2, 3, 4, 5, 6, 7, 8, 9];
    s = advanceMonth(s, { training: 8, buildHub: open }).state;
    for (let i = 0; i < 48 && !phase3Done(s); i++) {
      // 分割の線（シェア 5 割）に近づいたら出店を止める
      const near = (crownStats(s)?.share ?? 0) >= 0.47;
      s = advanceMonth(s, { expand: near ? [] : [0, ...open].map((region) => ({ region, type: 'fcOwner' as const, count: 2 })), manual: true, training: 0 }).state;
    }
    expect(phase3Done(s)).toBe(true);
    // 卒業はキングとの謁見（売上 1 位は招待の条件の 1 つ）
    expect(canPromote(s)).toBe(false);
  });

  it('11 エリアごと JSON を通しても同じ', () => {
    const s = advanceMonth(phase3()).state;
    expect(restoreEmpire(JSON.parse(JSON.stringify(s)))).toEqual(s);
  });
});

describe('11 エリアとレアリティ', () => {
  it('レアリティが上がるほど広く、Legendary はフェーズ 5 まで閉じている', async () => {
    const { RARITY_AREA } = await import('../src/empire/nation');
    const n = phase3().nation!;
    expect(n.regions.map((r) => r.rarity)).toEqual([0, 0, 0, 0, 1, 1, 1, 2, 2, 3, 4]);
    // 人の多いランドほど広い（本拠は Ocean：1.15 倍）
    for (const r of n.regions.slice(1)) expect(r.capacity).toBe(Math.round(RARITY_AREA[r.rarity].capacity * landProfile('Ocean').population));
    const legendary = n.regions[10];
    expect(legendary.locked).toBe(true);
    const s = advanceMonth({ ...phase3(), funds: 1e10 }, { buildHub: [10], expand: [{ region: 10, type: 'direct', count: 3 }] });
    expect(s.state.nation!.regions[10].hub).toBe(false);
    expect(regionStores(s.state.nation!.regions[10])).toBe(0);
    expect(s.report.rivalRevenue).toBeGreaterThan(0);
  });

  it('6 エリアだったころのセーブも読める（レアリティは並びから）', () => {
    const s = advanceMonth(phase3()).state;
    const old = JSON.parse(JSON.stringify(s));
    old.nation.regions = old.nation.regions.slice(0, 6).map((r: Record<string, unknown>) => {
      const { rarity: _r, locked: _l, ...rest } = r;
      return rest;
    });
    const back = restoreEmpire(old)!;
    expect(back.nation!.regions.map((r) => r.rarity)).toEqual([0, 0, 1, 1, 2, 3]);
    expect(back.nation!.regions.every((r) => !r.locked)).toBe(true);
  });
});

describe('フェーズ 3 の足かせ（予兆のあとに来る）', () => {
  it('24 時間の強制は加盟店の売上を伸ばすが、満足度が下がり、予兆 → 予告 → 調査と制裁金になる', async () => {
    const { SATISFACTION, INVESTIGATION } = await import('../src/empire/nation');
    let s = loose(phase3());
    s = advanceMonth(s, { expand: [{ region: 0, type: 'fcOwner', count: 2 }] }).state;
    const without = advanceMonth(s).report.revenue;
    const withForce = advanceMonth(s, { force24: true });
    expect(withForce.report.revenue).toBeGreaterThan(without);
    s = withForce.state;
    const kinds: string[] = [];
    let fined = 0;
    for (let i = 0; i < 40 && !fined; i++) {
      const r = advanceMonth(s);
      s = r.state;
      kinds.push(...r.report.notes.map((n) => n.kind));
      for (const n of r.report.notes) if (n.kind === 'investigation') fined = n.fine;
    }
    expect(kinds.indexOf('ownerUnrest')).toBeGreaterThanOrEqual(0);
    expect(kinds.indexOf('ownerUnrest')).toBeLessThan(kinds.indexOf('investigationSoon'));
    expect(kinds.indexOf('investigationSoon')).toBeLessThan(kinds.indexOf('investigation'));
    expect(fined).toBeGreaterThanOrEqual(INVESTIGATION.minFine);
    expect(s.nation!.force24).toBe(false);
    expect(s.nation!.satisfaction).toBeGreaterThanOrEqual(SATISFACTION.afterInvestigation);
  });

  it('オーナー支援で満足度が上がる', () => {
    let s = loose(phase3());
    s = advanceMonth(s, { expand: [{ region: 0, type: 'fcOwner', count: 2 }] }).state;
    s = { ...s, nation: { ...s.nation!, satisfaction: 40 } };
    expect(advanceMonth(s, { support: 3 }).state.nation!.satisfaction).toBeGreaterThan(advanceMonth(s).state.nation!.satisfaction);
  });

  it('時代のルール：変わる前に予告があり、規制が厳しいと月の出店に上限がある', async () => {
    const { ERA } = await import('../src/empire/nation');
    let s = phase3();
    expect(s.nation!.eraStrict).toBe(true);
    s = advanceMonth(s, { training: 4 }).state;
    const capped = advanceMonth(s, { expand: [{ region: 0, type: 'fcOwner', count: 30 }] });
    expect(nationStores(capped.state.nation!) - nationStores(s.nation!)).toBe(ERA.strictCap);
    expect(capped.report.notes.some((n) => n.kind === 'eraCap')).toBe(true);
    const kinds: string[] = [];
    for (let i = 0; i < ERA.strict + 2; i++) {
      const r = advanceMonth(s);
      s = r.state;
      kinds.push(...r.report.notes.map((n) => n.kind));
    }
    expect(kinds.indexOf('eraSoon')).toBeGreaterThanOrEqual(0);
    expect(kinds.indexOf('eraSoon')).toBeLessThan(kinds.indexOf('eraChanged'));
    expect(s.nation!.eraStrict).toBe(false);
  });

  it('地価は上がって天井を打って下がる。借入は担保まで、担保割れは返済を迫られる（予兆あり）', async () => {
    const { landIndexAt, LAND, borrowable } = await import('../src/empire/nation');
    expect(landIndexAt(LAND.riseMonths)).toBeGreaterThan(landIndexAt(10));
    expect(landIndexAt(LAND.riseMonths + LAND.fallMonths)).toBeLessThan(landIndexAt(LAND.riseMonths));
    let s = loose(phase3());
    s = advanceMonth(s, { expand: [{ region: 0, type: 'direct', count: 2 }] }).state;
    const room = borrowable(s.nation!);
    expect(room).toBeGreaterThan(0);
    const b = advanceMonth(s, { borrow: room * 10 });
    expect(b.state.nation!.loans).toBeCloseTo(room);
    s = b.state;
    const kinds: string[] = [];
    // 地価が上がるたびに借り増す（バブル）と、下がり始めて担保割れになる
    for (let i = 0; i < LAND.riseMonths + 12; i++) {
      const r = advanceMonth(s, { borrow: borrowable(s.nation!) });
      s = r.state;
      kinds.push(...r.report.notes.map((n) => n.kind));
    }
    expect(kinds).toContain('landSlowing');
    expect(kinds).toContain('marginCall');
    expect(kinds.indexOf('landSlowing')).toBeLessThan(kinds.indexOf('marginCall'));
  });

  it('上場は売上の条件を満たしてから。資金が入り、持分が薄まる', async () => {
    const { IPO } = await import('../src/empire/nation');
    const { canIpo } = await import('../src/empire/sim');
    const s = loose(phase3());
    expect(canIpo(s)).toBe(false);
    expect(advanceMonth(s, { ipo: true }).state.nation!.listed).toBe(false);
    const rich = { ...s, history: Array.from({ length: 12 }, (_, i) => ({ month: i, revenue: IPO.minRevenue / 12 + 1, inflow: 0, profit: 1e9, funds: 0, stores: [], notes: [] })) };
    expect(canIpo(rich)).toBe(true);
    const r = advanceMonth(rich, { ipo: true });
    expect(r.state.nation!.listed).toBe(true);
    expect(r.state.nation!.ownership).toBeCloseTo(1 - IPO.sell);
    expect(r.report.notes.some((n) => n.kind === 'ipo')).toBe(true);
  });

  it('PB を広げると、同じ店でも利益が増える', async () => {
    const { PB } = await import('../src/empire/nation');
    const s = loose(phase3());
    const up = advanceMonth(s, { pb: true });
    expect(up.state.nation!.pb).toBe(1);
    expect(up.state.funds).toBeCloseTo(s.funds - PB.cost + up.report.profit);
    expect(up.report.profit).toBeGreaterThan(advanceMonth(s).report.profit);
  });
});
