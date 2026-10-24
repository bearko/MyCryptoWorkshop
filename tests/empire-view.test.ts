// 経営画面の、DOM に触れない部分：地図の組み立て・報告の振り分け・稟議の一覧
import { describe, expect, it } from 'vitest';
import { newEmpire, type EmpireState } from '../src/empire/model';
import { advanceMonth, AREA_OPEN_COST, CENTER_COST, plotsFor } from '../src/empire/sim';
import { testActions } from '../src/ui/testPanel';
import { newSave } from '../src/game/save';
import { reserved, ringiItems } from '../src/ui/empire/cards';
import { foundingTown, gridIndex, plotCells, sectorGrid, storeCells, storeExt, townGrid } from '../src/ui/empire/maps';
import { adviceOf, newsOf, voicesOf } from '../src/ui/empire/notes';
import { money, shortMoney } from '../src/ui/empire/text';
import { SECTOR_SIZE } from '../src/render/map/land';

const phase2 = () => testActions.jumpPhase2(newSave(), 3).empire as EmpireState;
const phase3 = () => testActions.jumpPhase3(newSave(), 3).empire as EmpireState;

describe('地図の組み立て', () => {
  it('町は 8×6 の区画のまわりに木の外周（10×8 マス）で、駅と道がある', () => {
    const e = phase2();
    const g = townGrid(e.area!, { own: [], rival: e.area!.rivalStores, centers: [], targetKind: () => 'lot' });
    expect(g.cols).toBe(10);
    expect(g.rows).toBe(8);
    expect(g.extras.some((x) => x.sprite === 'station')).toBe(true);
    expect(g.roadsX.length).toBeGreaterThan(0);
    // 外周は押せない、内側の区画はすべて押せる
    const targets = g.cells.filter((c) => c.target).length;
    expect(targets).toBe(48);
    // ライバルの店は赤い縁の区画にケーキ
    for (const r of e.area!.rivalStores) expect(g.cells[gridIndex(e.area!, r)].lot).toBe('rival');
  });

  it('自社の店は改装するとエクステンションが 1 段上がる', () => {
    expect(storeExt({ sign: false, parking: false })).toBe(1154);
    expect(storeExt({ sign: true, parking: false })).toBe(2154);
    expect(storeExt({ sign: true, parking: true })).toBe(3154);
  });

  it('フェーズ 1：店と候補は重ならず、屋号ごとに同じ町', () => {
    const e = newEmpire('テスト', 1);
    const a = foundingTown(e);
    expect(foundingTown(e)).toEqual(a);
    const cells = storeCells(a, e.stores);
    const pc = plotCells(a, plotsFor(e), cells);
    expect(pc.some((c) => cells.includes(c))).toBe(false);
    expect(new Set(pc).size).toBe(pc.length);
  });

  it('フェーズ 1：候補として見せた区画に、出店した店が建つ', () => {
    const e = { ...newEmpire('テスト', 7), funds: 1e9 };
    const a = foundingTown(e);
    const plots = plotsFor(e);
    const shown = plotCells(a, plots, storeCells(a, e.stores));
    const next = advanceMonth(e, { open: [plots[0]] }).state;
    const after = storeCells(a, next.stores);
    expect(after[1]).toBe(shown[0]);
  });

  it('エリアの地図はレアリティの広さで、自社とライバルの店の数が区画に出る', () => {
    const e = phase3();
    const r = { ...e.nation!.regions[9], direct: 5, fcOwner: 2 };
    const g = sectorGrid(r, 10);
    expect([g.cols, g.rows]).toEqual(SECTOR_SIZE[r.rarity]);
    expect(g.cells.filter((c) => c.lot === 'ours').length).toBe(7);
    expect(g.cells.filter((c) => c.lot === 'rival').length).toBe(r.rival);
  });
});

describe('報告の振り分け', () => {
  it('品切れは常連客の絵馬になり、その場で発注を増やせる', () => {
    const e = newEmpire('テスト', 1);
    const r = { month: 0, revenue: 0, inflow: 0, profit: 0, funds: 0, stores: [], notes: [{ kind: 'stockout' as const, store: 1 }] };
    const [v] = voicesOf(r, e);
    expect(v.store).toBe(1);
    const d = v.fix!.apply({}, e);
    expect(d.stores?.[1]?.order).toBeCloseTo(e.stores[0].order + 0.1);
  });

  it('ライバルの出店予定はかわら版の先頭に、助言は「!」の区画を指す', () => {
    const e = phase2();
    const r = { month: 1, revenue: 0, inflow: 0, profit: 1, funds: 0, stores: [], notes: [{ kind: 'opened' as const, store: 2 }, { kind: 'rivalPlan' as const, cell: 3 }] };
    const news = newsOf(r, e);
    expect(news[0].kind).toBe('rival');
    expect(news[0].cell).toBe(3);
    expect(adviceOf(r, e, false)).toContain('!');
  });
});

describe('稟議（今月の下書き）', () => {
  it('出店と物流センターの費用を合計し、1 件ずつ取り消せる', () => {
    const e = phase2();
    const d = { openAt: [10, 11], buildCenter: [20] };
    expect(reserved(e, d)).toBe(2 * AREA_OPEN_COST + CENTER_COST);
    const items = ringiItems(e, d);
    expect(items).toHaveLength(3);
    const after = items[0].cancel(d);
    expect(after.openAt).toEqual([11]);
  });

  it('月を進めると、下書きどおりに出店される', () => {
    const e = { ...phase2(), funds: 1e9 };
    const free = e.area!.cells.map((_, i) => i).find((i) => !e.area!.rivalStores.includes(i) && !e.stores.some((s) => s.cell === i))!;
    const next = advanceMonth(e, { openAt: [free] }).state;
    expect(next.stores.some((s) => s.cell === free)).toBe(true);
  });
});

describe('金額の書き方', () => {
  it('万と億で丸める', () => {
    expect(money(118_400_000)).toBe('1億1,840万');
    expect(money(-78_100_000)).toBe('−7,810万');
    expect(money(9_999)).toBe('9,999');
    expect(shortMoney(102_710_000)).toBe('1.02億');
    expect(shortMoney(1_240_000_000_00)).toBe('1,240億');
  });
});

describe('ステークホルダーの絵馬（M8）', () => {
  it('出ている要望は期限つきの急ぎの絵馬になり、問屋には全店の発注を減らす手が付く', () => {
    const e = testActions.stakeDemand(testActions.foundEmpire(newSave(), 1)).empire as EmpireState;
    const v = voicesOf(null, e).find((x) => x.key === 'demand-wholesaler')!;
    expect(v.urgent).toBe(true);
    expect(v.due).toBeTruthy();
    const d = v.fix!.apply({}, e);
    expect(d.stores?.[1]?.order).toBeCloseTo(e.stores[0].order - 0.1);
  });

  it('期限が今月なら、マインちゃんの助言はその要望を先に言う', () => {
    const e = testActions.stakeDemand(testActions.foundEmpire(newSave(), 1)).empire as EmpireState;
    const r = { month: 0, revenue: 0, inflow: 0, profit: 1, funds: 0, stores: [], notes: [] };
    expect(adviceOf(r, { ...e, month: e.stake!.demands[0].due }, false)).toContain('期限');
  });

  it('最後通告はかわら版に載る', () => {
    const e = newEmpire('テスト', 1);
    const r = { month: 0, revenue: 0, inflow: 0, profit: 1, funds: 0, stores: [], notes: [{ kind: 'ultimatum' as const, who: 'wholesaler' as const, months: 3 }] };
    expect(newsOf(r, e)[0].kind).toBe('era');
  });
});
