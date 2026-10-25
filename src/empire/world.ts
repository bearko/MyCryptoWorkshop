// フェーズ 4 世界展開（docs/EMPIRE_DESIGN.md 4.4・10.12）。DOM に触れない純関数。
//
// 本拠のキングとの謁見が成ると、ほかのランドへ渡れる。渡ったランドでは小さく始め直す：
// 最初に開いているのは Common の 1 エリアだけで、物流拠点を建てたエリアから広げる（本拠と同じ 11 エリア）。
// 会社の資金と知名度は持ち越すが、そのランドの文化への慣れ（現地化）とキングの注目は一から。
// 渡っていないランドでも、ほかの会社が並行して開拓を進めている（遅れて渡るほどライバルが多い）。
//
// 参入方式（4.4）：
// - 直営：遅いが利益はまるごと。最初は 0 店
// - ライセンス：現地の提携先が速く店を増やす。こちらは売上の 1 割を受け取るだけ。30 か月で独立を言い出す
// - 合弁：最初から 8 店。利益は半分ずつ。あとで残り半分を買い取れる
// - 買収：現地のチェーンを買う。すぐに店が手に入るが、統合までの半年は客足が落ちる
import { courtStep, holdAudience, newCourt, type Court } from './court';
import { focusFit, landProfile, LAND_PROFILES, type FoundingLand } from './lands';
import type { EmpireState, Note } from './model';
import { generateNation, HUB_COST, nationStores, OPEN_COSTS, regionMonth, regionStores, trainees, TRAINING_COST, TRAINING_UPKEEP, HUB_UPKEEP, type Nation, type StoreType } from './nation';
import { rivalExpand } from './rivalai';
import type { Rng } from './rng';

export type EntryMode = 'direct' | 'license' | 'jv' | 'acquire';
export const ENTRY_MODES: EntryMode[] = ['direct', 'license', 'jv', 'acquire'];

/** 世界の 9 ランド（海図の並び）。渡れるのは創業できる 4 ランド。残りは名前だけ */
export const WORLD_LANDS = ['Ocean', 'Strawberry', 'Tangerine', 'Lime', 'Graphite', 'Grape', 'Sage', 'Blueberry', 'Ruby'] as const;
export const OPEN_LANDS: FoundingLand[] = ['Ocean', 'Strawberry', 'Tangerine', 'Lime'];

export interface Branch {
  land: string;
  mode: EntryMode;
  /** 渡った月 */
  opened: number;
  nation: Nation;
  court: Court;
  /** 現地化（0.8〜1）。本拠の型のままだと文化に合わず、月ごとに慣れていく */
  local: number;
  /** ライセンスの提携先の店（こちらの店ではない。売上の一部を受け取る） */
  partner: number;
  /** 合弁：こちらの取り分（0.5 か、買い取ったら 1） */
  stake: number;
  /** 買収：統合が終わる月（それまでは客足が落ちる） */
  integrateUntil: number;
  /** 直近 12 か月の売上とライバルの売上（そのランドのキングの招待に使う） */
  hist: { revenue: number; rival: number }[];
}

export interface World {
  branches: Branch[];
  /** 渡っていないランドで、ほかの会社が開いた店の数（海図に出す） */
  others: Record<string, number>;
  /** 撤退したランドの現地化（再進出が楽になる） */
  knowhow: Record<string, number>;
}

/** 数字は仮。npm run sim:empire で測って決める */
export const ENTRY = {
  /** 渡る費用（航路を開く）。Ocean からは船の技術で安い */
  route: 500_000_000,
  oceanDiscount: 0.7,
  /** 現地化：最初の値、月ごとの慣れ、現地化への投資 1 回の費用と上がり方 */
  localStart: 0.85,
  localMonthly: 0.005,
  localizeCost: 300_000_000,
  localizeStep: 0.05,
  /** ライセンス：提携先が毎月増やす店、こちらの取り分、独立を言い出す月 */
  licensePerMonth: 2,
  licenseRoyalty: 0.1,
  licenseBreak: 30,
  /** 合弁：最初の店、こちらの取り分、残りを買い取る費用（1 店あたり） */
  jvStores: 8,
  jvStake: 0.5,
  jvBuyout: 25_000_000,
  /** 買収：手に入る店（ライバルから）、1 店あたりの値段、統合の月数と客足 */
  acquireStores: 10,
  acquirePrice: 40_000_000,
  integrateMonths: 6,
  integrateDemand: 0.85,
  /** 撤退：店を売る値段（出店費用のうち） */
  exitRecover: 0.5,
} as const;

/** フェーズ 4 の卒業：本拠の外の 2 ランドでキングとの謁見が成り、直近 12 か月の売上のうち本拠の外が 3 割 */
export const GRADUATE = { audiences: 2, foreign: 0.3 } as const;

/** ほかの会社の伸び（渡っていないランドの店、月ごと）と、渡ったときのライバルへの効き方 */
export const OTHERS = { perMonth: 1.5, toRival: 0.05 } as const;

export function newWorld(home: string): World {
  const others: Record<string, number> = {};
  for (const k of WORLD_LANDS) if (k !== home) others[k] = k === 'Tangerine' ? 0 : 20;
  return { branches: [], others, knowhow: {} };
}

/** 渡る費用 */
export function routeCost(e: Pick<EmpireState, 'land' | 'court'>): number {
  const ocean = landProfile(e.land).key === 'Ocean' || !!e.court?.privileges.includes('harbor');
  return ENTRY.route * (ocean ? ENTRY.oceanDiscount : 1);
}

/** 参入方式ごとの、渡った月の費用（航路を除く） */
export function entryCost(mode: EntryMode): number {
  if (mode === 'jv') return ENTRY.jvStores * OPEN_COSTS.direct * 0.5;
  if (mode === 'acquire') return ENTRY.acquireStores * ENTRY.acquirePrice;
  return 0;
}

export const canEnter = (e: EmpireState, land: string) => e.phase >= 4 && !!e.world && OPEN_LANDS.includes(land as FoundingLand) && land !== e.land && !e.world.branches.some((b) => b.land === land);

/** ほかのランドへ渡る（月の決定のはじめ） */
export function enterLand(e: EmpireState, land: string, mode: EntryMode, rng: Rng, notes: Note[]): void {
  const w = e.world;
  if (!w || !canEnter(e, land)) return;
  const cost = routeCost(e) + entryCost(mode);
  if (e.funds < cost) {
    notes.push({ kind: 'shortOfFunds' });
    return;
  }
  e.funds -= cost;
  const p = landProfile(land);
  // そのランドの 11 エリア。ほかの会社の進み具合で、ライバルの店が多い
  const nation = generateNation({ stores: 0, fc: 0, hub: false, rival: 0, traffic: 260_000, rent: 330_000 }, rng, e.month);
  const extra = 1 + (w.others[land] ?? 0) * OTHERS.toRival;
  for (const r of nation.regions.slice(1)) {
    r.capacity = Math.round(r.capacity * p.population);
    r.rival = Math.round(r.rival * (p.key === 'Tangerine' ? 0.5 : 1) * extra);
  }
  nation.regions[0].rival = Math.round(2 * extra);
  // 最初のエリアは、本拠ではなく上陸した港町
  nation.regions[0].name = { ja: '上陸の港町', en: 'Landing port' }; // i18n-ja
  const b: Branch = { land, mode, opened: e.month, nation, court: newCourt(), local: Math.max(ENTRY.localStart, w.knowhow[land] ?? 0), partner: 0, stake: 1, integrateUntil: -1, hist: [] };
  const home = nation.regions[0];
  if (mode === 'jv') {
    home.direct = ENTRY.jvStores;
    b.stake = ENTRY.jvStake;
  } else if (mode === 'acquire') {
    const take = ENTRY.acquireStores;
    home.direct = take;
    home.rival = Math.max(0, home.rival - Math.min(home.rival, take));
    b.integrateUntil = e.month + ENTRY.integrateMonths;
  }
  w.branches.push(b);
  delete w.others[land];
  notes.push({ kind: 'entered', land, mode });
}

/** ランドの決定（出店・物流拠点・研修所・現地化・合弁の買い取り・撤退） */
export interface BranchDecision {
  expand?: { region: number; type: StoreType; count: number }[];
  buildHub?: number[];
  training?: number;
  localize?: boolean;
  buyout?: boolean;
  exit?: boolean;
  offering?: import('./court').Offering;
}

/** 渡ったランドの 1 か月。会社の資金を動かし、そのランドの売上と利益を返す */
export function branchMonth(e: EmpireState, b: Branch, d: BranchDecision, rng: Rng, notes: Note[]): { revenue: number; profit: number; rivalRevenue: number } {
  const n = b.nation;
  // そのランドのキングとの謁見（招待が来ていれば）。特権はそのランドに効く
  // そのランドの冠のかわり：売上でライバルを上回る・店の数で上回る・物流拠点 3 つ以上
  const held = () => {
    const tr = b.hist.reduce((a, h) => a + h.revenue, 0) > b.hist.reduce((a, h) => a + h.rival, 0);
    const own = n.regions.reduce((a, r) => a + regionStores(r), 0);
    const rv = n.regions.reduce((a, r) => a + r.rival, 0);
    return { scale: b.hist.length >= 12 && tr, brand: own > rv, influence: n.regions.filter((r) => r.hub).length >= 3 };
  };
  const view = (): EmpireState =>
    ({ ...e, land: b.land, nation: n, court: b.court, crowns: { held: held(), shock: 0, overMonths: 0 }, history: b.hist.map((h, i) => ({ month: i, revenue: h.revenue, rivalRevenue: h.rival, inflow: 0, profit: 0, funds: 0, stores: [], notes: [] })) }) as EmpireState;
  // 謁見と注目の知らせには、どのランドのキングかを付ける（画面の文に使う）
  const tag = (from: number) => {
    for (const x of notes.slice(from)) if (x.kind === 'attention' || x.kind === 'audienceInvite' || x.kind === 'audience') x.land = b.land;
  };
  if (d.offering) {
    const v = view();
    const from = notes.length;
    holdAudience(v, d.offering, notes);
    tag(from);
    b.court = v.court!;
    e.funds = v.funds;
  }
  const pay = (cost: number) => {
    if (e.funds < cost) {
      notes.push({ kind: 'shortOfFunds' });
      return false;
    }
    e.funds -= cost;
    return true;
  };
  for (let i = 0; i < (d.training ?? 0); i++) if (pay(TRAINING_COST)) n.trainingCenters++;
  for (const ri of d.buildHub ?? []) {
    const r = n.regions[ri];
    if (!r || r.hub || r.locked) continue;
    if (pay(HUB_COST)) r.hub = true;
  }
  if (d.localize && b.local < 1 && pay(ENTRY.localizeCost)) b.local = Math.min(1, b.local + ENTRY.localizeStep);
  if (d.buyout && b.mode === 'jv' && b.stake < 1 && pay(buyoutCost(b, e.month))) {
    b.stake = 1;
    notes.push({ kind: 'jvBuyout', land: b.land });
  }
  // 出店：そのランドの研修所で育った人数まで、物流拠点のあるエリアだけ（Common の最初のエリアは拠点なしで出せる）
  let people = trainees(n);
  for (const x of d.expand ?? []) {
    const r = n.regions[x.region];
    if (!r || r.locked || (!r.hub && x.region !== 0)) continue;
    for (let i = 0; i < x.count && people > 0; i++) {
      if (!pay(OPEN_COSTS[x.type])) break;
      r[x.type]++;
      people--;
    }
  }
  // ライセンス：提携先が増やし、30 か月で独立を言い出す（その月に買い取らなければ、店ごとライバルになる）
  if (b.mode === 'license') {
    const r = n.regions[0];
    b.partner = Math.min(Math.floor(r.capacity * 0.7), b.partner + ENTRY.licensePerMonth);
    const months = e.month - b.opened;
    if (months === ENTRY.licenseBreak - 3) notes.push({ kind: 'licenseWarning', land: b.land, month: b.opened + ENTRY.licenseBreak });
    if (months === ENTRY.licenseBreak) {
      if (d.buyout && pay(buyoutCost(b, e.month))) {
        r.fcOwner += b.partner;
        notes.push({ kind: 'jvBuyout', land: b.land });
      } else {
        r.rival += b.partner;
        notes.push({ kind: 'licenseBroke', land: b.land, stores: b.partner });
      }
      b.partner = 0;
      b.mode = 'direct';
    }
  }
  // ライバル（そのランドの会社）
  if (e.month % 3 === 0) rivalExpand(n, 1);
  // 現地化：月ごとに慣れる
  b.local = Math.min(1, b.local + ENTRY.localMonthly);
  const integrating = e.month < b.integrateUntil;
  const demand = focusFit(b.land, e.focus) * b.local * (integrating ? ENTRY.integrateDemand : 1);
  const reps = n.regions.map((r) => regionMonth(r, n.quality, (rng.next() * 2 - 1) * 0.05, { demand, rentMult: landProfile(b.land).rent }));
  let revenue = reps.reduce((a, r) => a + r.revenue, 0);
  let profit = reps.reduce((a, r) => a + r.profit, 0) * b.stake;
  // ライセンスの提携先の売上の一部
  if (b.partner > 0) {
    const partnerRev = reps[0].daily * 30 * b.partner;
    revenue += partnerRev;
    profit += partnerRev * ENTRY.licenseRoyalty;
  }
  profit -= n.regions.filter((r) => r.hub).length * HUB_UPKEEP + n.trainingCenters * TRAINING_UPKEEP;
  const rivalRevenue = reps.reduce((a, r) => a + r.rivalRevenue, 0);
  b.hist = [...b.hist, { revenue, rival: rivalRevenue }].slice(-12);
  // キングの注目（そのランドのキング）
  const v = view();
  const from = notes.length;
  courtStep(v, notes);
  tag(from);
  b.court = v.court!;
  return { revenue, profit, rivalRevenue };
}

/** 撤退：店を売り、現地化の知見は残す */
export function exitLand(e: EmpireState, land: string, notes: Note[]): void {
  const w = e.world;
  const b = w?.branches.find((x) => x.land === land);
  if (!w || !b) return;
  const stores = nationStores(b.nation);
  e.funds += stores * OPEN_COSTS.direct * ENTRY.exitRecover;
  w.knowhow[land] = b.local;
  w.branches = w.branches.filter((x) => x !== b);
  w.others[land] = stores;
  notes.push({ kind: 'exited', land, stores });
}

/** 渡っていないランドのほかの会社の伸び */
export function othersMonth(w: World, month: number): void {
  for (const k of Object.keys(w.others)) {
    // Tangerine は、ほかの会社が気づくまで（フェーズ 4 に入ってからでも 1 年）はゆっくり
    const rate = k === 'Tangerine' && month % 12 < 6 ? OTHERS.perMonth * 0.3 : OTHERS.perMonth;
    w.others[k] = Math.round((w.others[k] + rate) * 10) / 10;
  }
}

/** 本拠の外の売上の割合（直近 12 か月） */
export function foreignShare(e: EmpireState): number {
  const last = e.history.slice(-12);
  const total = last.reduce((a, r) => a + r.revenue, 0);
  const foreign = last.reduce((a, r) => a + (r.foreignRevenue ?? 0), 0);
  return total > 0 ? foreign / total : 0;
}

/** フェーズ 4 を抜ける条件 */
export function phase4Done(e: EmpireState): boolean {
  if (!e.world || !e.nation) return false;
  return e.world.branches.filter((b) => b.court.audience).length >= GRADUATE.audiences && foreignShare(e) >= GRADUATE.foreign;
}

/** 買い取りの費用（合弁の残り半分、独立を言い出した月のライセンスの提携先）。買い取れないときは 0 */
export function buyoutCost(b: Branch, month: number): number {
  if (b.mode === 'jv' && b.stake < 1) return regionStores(b.nation.regions[0]) * ENTRY.jvBuyout;
  if (b.mode === 'license' && month - b.opened === ENTRY.licenseBreak) return b.partner * ENTRY.jvBuyout;
  return 0;
}

/** 撤退で戻るお金 */
export const exitValue = (b: Branch) => nationStores(b.nation) * OPEN_COSTS.direct * ENTRY.exitRecover;

/** ランドの決定にかかる費用の合計（稟議の見込み。撤退で戻るお金は引く） */
export function branchDecisionCost(e: EmpireState, land: string, d: BranchDecision | undefined): number {
  const b = branchOf(e, land);
  if (!b || !d) return 0;
  return (
    (d.expand ?? []).reduce((a, x) => a + x.count * OPEN_COSTS[x.type], 0) +
    (d.buildHub ?? []).length * HUB_COST +
    (d.training ?? 0) * TRAINING_COST +
    (d.localize && b.local < 1 ? ENTRY.localizeCost : 0) +
    (d.buyout ? buyoutCost(b, e.month) : 0) -
    (d.exit ? exitValue(b) : 0)
  );
}

export const branchOf = (e: EmpireState, land: string) => e.world?.branches.find((b) => b.land === land);

/** 創業できるランドのキングの名前の表（海図で使う） */
export const KING_OF = (land: string) => (OPEN_LANDS.includes(land as FoundingLand) ? LAND_PROFILES[land as FoundingLand].king.name : null);
