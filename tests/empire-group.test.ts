// フェーズ 5 企業グループ（M10 その 4）：Legendary エリアと地主会、番付、会議卓、エンディング
import { describe, expect, it } from 'vitest';
import { restoreEmpire, type EmpireState } from '../src/empire/model';
import { advanceMonth, canPromote } from '../src/empire/sim';
import { legendIndex, regionStores, plotRoom } from '../src/empire/nation';
import { AUCTION, bidPrice, biddable, endingReached, landsOf, legendStats } from '../src/empire/group';
import { BUSINESS, newTable, SELL_BACK, synergyLinks, tableChangeCost, tableMods, tableProfit, validTable } from '../src/empire/business';
import { OPEN_LANDS } from '../src/empire/world';
import { newSave } from '../src/game/save';
import { testActions } from '../src/ui/testPanel';
import { companyTitle } from '../src/ui/empire/text';

const phase5 = () => testActions.jumpPhase5(newSave(), 3).empire as EmpireState;
const legendOf = (e: EmpireState, land = e.land) => {
  const n = landsOf(e).find((x) => x.land === land)!.nation;
  return n.regions[legendIndex(n)];
};

describe('フェーズ 5 へ', () => {
  it('フェーズ 4 を卒業して上がると、各ランドの Legendary エリアが開き、翌月に地主会がある', () => {
    let e = phase5();
    // jumpPhase5 は卒業の条件を待たないので、フェーズ 4 に戻して条件を作ってから上がる
    e = { ...e, phase: 4, group: undefined };
    for (const { nation } of landsOf(e)) for (const r of nation.regions) if (r.rarity === 4) Object.assign(r, { locked: true, plots: undefined, rivalPlots: undefined });
    e.history = e.history.map((r) => ({ ...r, revenue: 100, foreignRevenue: 40 }));
    expect(canPromote(e)).toBe(true);
    const s = advanceMonth(e, { promote: true }).state;
    expect(s.phase).toBe(5);
    expect(s.group?.nextAuction).toBe(e.month + 1);
    for (const { land } of landsOf(s)) {
      const r = legendOf(s, land);
      expect(r.locked).toBe(false);
      expect(r.plots).toBe(0);
      expect(r.rivalPlots).toBeLessThanOrEqual(Math.floor(r.capacity / 2));
    }
    expect(canPromote(s)).toBe(false);
  });
});

describe('地主会', () => {
  it('付け値が高ければ欲しい区画を先に取り、払うのは自分の付け値。区画の数までしか店を出せない', () => {
    let e = phase5();
    const r0 = legendOf(e);
    expect(plotRoom(r0)).toBe(0);
    const want = biddable(r0);
    const funds = e.funds;
    const s = advanceMonth(e, { bids: { [e.land]: { plots: want, level: 'high' } } }).state;
    const r = legendOf(s);
    const note = s.history.at(-1)!.notes.find((n) => n.kind === 'auction' && n.land === e.land);
    expect(note && 'won' in note ? note.won : -1).toBe(r.plots);
    expect(r.plots).toBeGreaterThan(0);
    expect(note && 'paid' in note ? note.paid : 0).toBe(Math.round(r.plots! * bidPrice('high')));
    expect(s.funds).toBeLessThan(funds);
    expect(s.group?.nextAuction).toBe(e.month + AUCTION.every);
    // 区画を超えては出店できない
    e = s;
    const li = legendIndex(landsOf(e)[0].nation);
    e.nation!.regions[li].hub = true;
    e.nation!.trainingCenters = 30;
    e.nation!.eraStrict = false;
    const after = advanceMonth(e, { expand: [{ region: li, type: 'direct', count: 999 }] }).state;
    expect(regionStores(legendOf(after))).toBe(r.plots);
  });
  it('1 社が持てるのは、エリアの区画の半分まで', () => {
    const e = phase5();
    const r = legendOf(e);
    r.plots = Math.floor(r.capacity * AUCTION.cap) - 3;
    expect(biddable(r)).toBeLessThanOrEqual(3);
  });
});

describe('会議卓', () => {
  it('真ん中は本業。隣り合う相性のよいカードは線がつながり、利益と影響力が上がる', () => {
    const t = newTable();
    expect(validTable(t)).toBe(true);
    t[1] = 'freight';
    t[0] = 'trade';
    expect(synergyLinks(t)).toHaveLength(2); // 本業と物流、物流と交易
    expect(tableProfit(t)).toBe(BUSINESS.freight.profit * 1.5 + BUSINESS.trade.profit * 1.25);
    expect(tableMods(t).influence).toBe(6 + 3 + 2 * 2);
    // 同じカードは 1 枚まで、真ん中は動かせない
    expect(validTable([...t.slice(0, 2), 'freight', ...t.slice(3)])).toBe(false);
    expect(validTable(t.map((b, i) => (i === 4 ? null : b)))).toBe(false);
  });
  it('置くと費用、外すと半分戻る。動かすだけなら無料', () => {
    const a = newTable();
    const b = [...a];
    b[1] = 'bank';
    expect(tableChangeCost(a, b).cost).toBe(BUSINESS.bank.cost);
    const c = [...a];
    c[7] = 'bank';
    expect(tableChangeCost(b, c)).toMatchObject({ cost: 0, refund: 0 });
    expect(tableChangeCost(b, a).refund).toBe(BUSINESS.bank.cost * SELL_BACK);
  });
  it('月を進めると、カードの費用を払い、事業の利益が入る', () => {
    const e = phase5();
    const t = newTable();
    t[1] = 'freight';
    const s = advanceMonth(e, { table: t }).state;
    expect(s.group?.table[1]).toBe('freight');
    expect(s.history.at(-1)!.groupProfit).toBe(BUSINESS.freight.profit * 1.25);
  });
});

describe('番付とエンディング', () => {
  it('Legendary エリアで店と区画が多いほうが、ブランド力と影響力で上回る', () => {
    const e = phase5();
    const r = legendOf(e);
    Object.assign(r, { plots: 40, direct: 40, hub: true, rival: 10, rivalPlots: 10 });
    const st = legendStats(e, e.land)!;
    expect(st.ours.brand).toBeGreaterThan(st.rival.brand);
    expect(st.ours.influence).toBeGreaterThan(st.rival.influence);
  });
  it('渡れる全ランドの Legendary で 3 冠そろうとエンディング。格は財閥になる', () => {
    const e = phase5();
    const held = { scale: true, brand: true, influence: true };
    e.group!.legend = Object.fromEntries(OPEN_LANDS.map((k) => [k, { hist: [], held, rivalPrice: 0 }]));
    // まだ渡っていないランドがあればエンディングではない
    expect(landsOf(e).length).toBe(3);
    expect(endingReached(e)).toBe(false);
    expect(companyTitle(e)).toContain(e.name);
    expect(companyTitle({ ...e, name: 'X' })).toMatch(/財閥|Zaibatsu/);
  });
  it('セーブして読み直せる', () => {
    const e = advanceMonth(phase5(), { bids: {} }).state;
    const back = restoreEmpire(JSON.parse(JSON.stringify(e)))!;
    expect(back.group).toEqual(e.group);
    expect(legendOf(back).plots).toBe(legendOf(e).plots);
    expect(legendOf(back).rivalPlots).toBe(legendOf(e).rivalPlots);
  });
});
