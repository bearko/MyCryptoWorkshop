// フェーズ 5 企業グループ（docs/EMPIRE_DESIGN.md 4.5・10.1・10.13）。DOM に触れない純関数。
//
// フェーズ 4 を卒業すると、各ランドの Legendary エリア（大市場）が開く。ただし区画は自由に取れない：
// 年に 1 度の地主会（競り）で、区画を落札した数までしか店を出せない。1 社がエリアの区画の 5 割を超えて持つことは当局が許さない。
// Legendary エリアごとに、そのランドの会社と 3 冠（売上規模・ブランド力・影響力）を争う（番付）。
// 渡れる全ランドの Legendary で 3 冠をそろえると、エンディング（財閥）。
import { BUSINESS, groupMods, newTable, tableChangeCost, tableProfit, validTable, type Business, type Table } from './business';
import { CROWNS, crownsDueThisMonth, type CrownId } from './crowns';
import type { Court } from './court';
import type { EmpireState, MonthReport, Note } from './model';
import { isLegend, legendIndex, perStoreDaily, plotRoom, regionStores, rivalDaily, unlockLegend, type Nation, type Region } from './nation';

export { isLegend, legendIndex, plotRoom, unlockLegend };
import type { Rng } from './rng';
import { OPEN_LANDS } from './world';

export type BidLevel = 'low' | 'market' | 'high';
export const BID_LEVELS: BidLevel[] = ['low', 'market', 'high'];
export interface Bid {
  /** 欲しい区画の数 */
  plots: number;
  level: BidLevel;
}

export interface LegendRecord {
  /** 直近 12 か月の、その Legendary エリアの売上（自社とライバル） */
  hist: { revenue: number; rival: number }[];
  /** いま持っている番付の冠 */
  held: Record<CrownId, boolean>;
  /** 前の地主会でライバルが落札した値（区画 1 つ。まだなら 0） */
  rivalPrice: number;
}

export interface Group {
  /** 会議卓（3×3） */
  table: Table;
  /** ランドごとの Legendary エリアの番付 */
  legend: Record<string, LegendRecord>;
  /** 次の地主会の月と、これまでの回数 */
  nextAuction: number;
  auctions: number;
  /** フェーズ 5 に入った月 */
  since: number;
  /** エンディングを迎えた月（まだなら null）。そのあとも遊び続けられる */
  ended: number | null;
}

/** 数字は仮。npm run sim:empire で測って決める */
export const AUCTION = {
  /** 1 回の地主会に出る区画 */
  offered: 30,
  /** 区画 1 つの相場 */
  price: 150_000_000,
  /** 1 社が持てる区画の上限（エリアの広さに対する割合） */
  cap: 0.5,
  /** ライバルの欲しい区画と、付け値（相場に対する倍率）。回を重ねるほど強気になる */
  rivalWant: [10, 16],
  rivalPrice: [1.0, 1.3],
  rivalGrowth: 0.06,
  /** ライバルが強気になるのは、この回数まで */
  rivalGrowthMax: 8,
  /** プレイヤーの付け値（相場に対する倍率） */
  levels: { low: 0.9, market: 1.15, high: 1.45 } as Record<BidLevel, number>,
  /** 地主会の間隔（月） */
  every: 12,
} as const;

/** 番付の配点 */
export const LEGEND = {
  /** 影響力：物流拠点・区画 1 つ・そのランドのキングとの謁見。ライバルは基礎・区画・地主会の回数 */
  hub: 10,
  perPlot: 0.3,
  audience: 10,
  rivalBase: 12,
  rivalPerAuction: 2,
  /** ブランド力：ライバルの品質と、回ごとの伸び */
  rivalQuality: 0.95,
  rivalBrandGrowth: 0.02,
} as const;

/** 財閥の格：番付の冠の数で、ホールディングス → コンツェルン → 財閥 */
export const RANK = { konzern: 4, zaibatsu: 8 } as const;

export function newGroup(month: number): Group {
  return { table: newTable(), legend: {}, nextAuction: month + 1, auctions: 0, since: month, ended: null };
}

/** 会社が店を持つランド（本拠と渡ったランド）の、国とキング */
export function landsOf(e: EmpireState): { land: string; nation: Nation; court: Court | undefined }[] {
  const out: { land: string; nation: Nation; court: Court | undefined }[] = [];
  if (e.nation) out.push({ land: e.land, nation: e.nation, court: e.court });
  for (const b of e.world?.branches ?? []) out.push({ land: b.land, nation: b.nation, court: b.court });
  return out;
}

const newRecord = (): LegendRecord => ({ hist: [], held: { scale: false, brand: false, influence: false }, rivalPrice: 0 });

/** 地主会で 1 社が持てる区画の上限 */
export const plotCap = (r: Region) => Math.floor(r.capacity * AUCTION.cap);

/** この地主会で、あと何区画まで欲しがれるか */
export function biddable(r: Region): number {
  const free = Math.max(0, r.capacity - (r.plots ?? 0) - (r.rivalPlots ?? r.rival));
  return Math.max(0, Math.min(AUCTION.offered, free, plotCap(r) - (r.plots ?? 0)));
}

/** 付け値（区画 1 つ） */
export const bidPrice = (level: BidLevel) => AUCTION.price * AUCTION.levels[level];
/** 落札したときに払う額（不動産のカードで安くなる） */
export const bidCost = (e: Pick<EmpireState, 'group'>, bid: Bid) => Math.round(bid.plots * bidPrice(bid.level) * groupMods(e).plotPrice);

/** 地主会：ランドごとに、付け値の高いほうから区画を取る。払うのは自分の付け値（落札した区画の分だけ） */
export function holdAuction(e: EmpireState, bids: Record<string, Bid> | undefined, rng: Rng, notes: Note[]): void {
  const g = e.group!;
  for (const { land, nation } of landsOf(e)) {
    const li = legendIndex(nation);
    const r = nation.regions[li];
    if (!r || r.locked) continue;
    const rec = (g.legend[land] ??= newRecord());
    const bid = bids?.[land];
    const offered = Math.min(AUCTION.offered, Math.max(0, r.capacity - (r.plots ?? 0) - (r.rivalPlots ?? r.rival)));
    const rivalPrice = AUCTION.price * (AUCTION.rivalPrice[0] + rng.next() * (AUCTION.rivalPrice[1] - AUCTION.rivalPrice[0])) * (1 + AUCTION.rivalGrowth * Math.min(g.auctions, AUCTION.rivalGrowthMax));
    const rivalWant = Math.min(AUCTION.rivalWant[0] + Math.floor(rng.next() * (AUCTION.rivalWant[1] - AUCTION.rivalWant[0] + 1)) + g.auctions, Math.max(0, plotCap(r) - (r.rivalPlots ?? r.rival)));
    const want = bid ? Math.max(0, Math.min(Math.floor(bid.plots), biddable(r))) : 0;
    const price = bid ? bidPrice(bid.level) : 0;
    let won = 0;
    let rivalWon = 0;
    const take = (n: number, left: number) => Math.max(0, Math.min(n, left));
    if (want > 0 && price > rivalPrice) {
      won = take(want, offered);
      rivalWon = take(rivalWant, offered - won);
    } else {
      rivalWon = take(rivalWant, offered);
      won = take(want, offered - rivalWon);
    }
    // 払えるだけ（資金が足りなければ、払える区画まで）
    const unit = price * groupMods(e).plotPrice;
    if (won > 0 && unit > 0) won = Math.min(won, Math.floor(Math.max(0, e.funds) / unit));
    const paid = Math.round(won * unit);
    e.funds -= paid;
    r.plots = (r.plots ?? 0) + won;
    r.rivalPlots = (r.rivalPlots ?? r.rival) + rivalWon;
    rec.rivalPrice = Math.round(rivalPrice);
    notes.push({ kind: 'auction', land, won, wanted: want, paid, rivalWon });
  }
  g.auctions++;
  g.nextAuction = e.month + AUCTION.every;
}

export interface LegendStats {
  ours: Record<CrownId, number>;
  rival: Record<CrownId, number>;
}

/** そのランドの Legendary エリアの番付の数字 */
export function legendStats(e: EmpireState, land: string): LegendStats | null {
  const l = landsOf(e).find((x) => x.land === land);
  const r = l ? l.nation.regions[legendIndex(l.nation)] : undefined;
  if (!l || !r || r.locked) return null;
  const g = e.group;
  const rec = g?.legend[land];
  const gm = groupMods(e);
  const own = regionStores(r);
  const per = 100 / Math.max(1, r.capacity);
  const auctions = Math.min(g?.auctions ?? 0, AUCTION.rivalGrowthMax);
  return {
    ours: {
      scale: Math.round((rec?.hist ?? []).reduce((a, h) => a + h.revenue, 0)),
      brand: Math.round(own * per * l.nation.quality * (1 + gm.brand) * 10) / 10,
      influence: Math.round((r.hub ? LEGEND.hub : 0) + (r.plots ?? 0) * LEGEND.perPlot + (l.court?.audience ? LEGEND.audience : 0) + gm.influence),
    },
    rival: {
      scale: Math.round((rec?.hist ?? []).reduce((a, h) => a + h.rival, 0)),
      brand: Math.round(r.rival * per * LEGEND.rivalQuality * (1 + LEGEND.rivalBrandGrowth * auctions) * 10) / 10,
      influence: Math.round(LEGEND.rivalBase + (r.rivalPlots ?? r.rival) * LEGEND.perPlot + LEGEND.rivalPerAuction * auctions),
    },
  };
}

/** 番付の冠の数（全ランドの合計） */
export const legendCrowns = (e: Pick<EmpireState, 'group'>) => Object.values(e.group?.legend ?? {}).reduce((a, r) => a + CROWNS.filter((c) => r.held[c]).length, 0);

/** エンディングに要る冠の数（渡れる全ランド × 3） */
export const ENDING_CROWNS = OPEN_LANDS.length * CROWNS.length;

/** エンディングの条件：渡れる全ランドに店を持ち、その全部の Legendary で 3 冠 */
export function endingReached(e: EmpireState): boolean {
  if (!e.group) return false;
  const lands = landsOf(e).map((x) => x.land);
  return OPEN_LANDS.every((k) => lands.includes(k) && CROWNS.every((c) => e.group!.legend[k]?.held[c]));
}

/** 会議卓の並べ替え（月のはじめ）。費用が足りなければ並べ替えない */
export function applyTable(e: EmpireState, next: Table | undefined, notes: Note[]): void {
  const g = e.group;
  if (!g || !next || !validTable(next)) return;
  const ch = tableChangeCost(g.table, next);
  if (ch.cost - ch.refund > e.funds) {
    notes.push({ kind: 'shortOfFunds' });
    return;
  }
  e.funds += ch.refund - ch.cost;
  g.table = [...next];
  if (ch.added.length || ch.removed.length) notes.push({ kind: 'tableChanged', added: ch.added, removed: ch.removed });
}

/** フェーズ 5 の 1 か月（店の売上が出たあと、報告を履歴に積む前）。地主会・会議卓の利益・番付・エンディング */
export function groupMonth(e: EmpireState, d: { table?: Table; bids?: Record<string, Bid> }, report: MonthReport, rng: Rng, notes: Note[]): void {
  const g = e.group;
  if (!g || e.phase < 5) return;
  applyTable(e, d.table, notes);
  if (e.month + 1 === g.nextAuction) notes.push({ kind: 'auctionSoon', month: g.nextAuction });
  if (e.month >= g.nextAuction) holdAuction(e, d.bids, rng, notes);
  // 会議卓の事業の利益
  const p = tableProfit(g.table);
  e.funds += p;
  report.profit += p;
  report.groupProfit = p;
  // まだ謁見していないキングの注目（メディアのカード）
  const gm = groupMods(e);
  if (gm.attention > 0) for (const { court } of landsOf(e)) if (court && !court.audience) court.attention = Math.min(100, court.attention + gm.attention);
  // 番付：Legendary エリアの売上を積み、3 冠を決める（決まる月は本拠の 3 冠と同じ）
  for (const { land, nation } of landsOf(e)) {
    const r = nation.regions[legendIndex(nation)];
    if (!r || r.locked) continue;
    const rec = (g.legend[land] ??= newRecord());
    // 分割で売った店などで、ライバルの店が区画を超えていれば、区画まで（区画の無い店は開けない）
    r.rival = Math.min(r.rival, r.rivalPlots ?? r.rival);
    rec.hist = [...rec.hist, { revenue: perStoreDaily(r, nation.quality) * 30 * regionStores(r), rival: rivalDaily(r) * 30 * r.rival }].slice(-12);
    const st = legendStats(e, land)!;
    for (const c of crownsDueThisMonth(e.month)) {
      const won = st.ours[c] > st.rival[c];
      if (won !== rec.held[c]) notes.push({ kind: 'legendCrown', land, crown: c, won });
      rec.held[c] = won;
    }
  }
  if (g.ended === null && endingReached(e)) {
    g.ended = e.month;
    notes.push({ kind: 'ending' });
  }
}

/** 会議卓に置いてあるカード（画面と稟議用） */
export const placed = (t: Table) => t.filter((b): b is Business => !!b && b !== 'store');
export const businessCost = (b: Business) => BUSINESS[b].cost;

export function restoreGroup(raw: unknown): Group | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const g = raw as Partial<Group>;
  const num = (v: unknown, f: number) => (typeof v === 'number' && Number.isFinite(v) ? v : f);
  const legend: Record<string, LegendRecord> = {};
  for (const [k, v] of Object.entries(g.legend ?? {})) {
    if (!v || typeof v !== 'object') continue;
    legend[k] = {
      hist: (Array.isArray(v.hist) ? v.hist : []).slice(-12).map((h) => ({ revenue: num(h?.revenue, 0), rival: num(h?.rival, 0) })),
      held: { scale: v.held?.scale === true, brand: v.held?.brand === true, influence: v.held?.influence === true },
      rivalPrice: num(v.rivalPrice, 0),
    };
  }
  return {
    table: validTable(g.table) ? g.table : newTable(),
    legend,
    nextAuction: num(g.nextAuction, 0),
    auctions: Math.max(0, Math.floor(num(g.auctions, 0))),
    since: num(g.since, 0),
    ended: typeof g.ended === 'number' ? g.ended : null,
  };
}
