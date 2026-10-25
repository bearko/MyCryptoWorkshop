// 経営モードの月次シミュレーション（docs/EMPIRE_DESIGN.md 9.1）。純関数：元の状態は変えない。
// 数字はすべて仮の値。scripts/empire-sim.mjs で測って決める。
import { HISTORY, newStore, type EmpireState, type MonthReport, type Note, type Plot, type PlotKind, type Store, type StoreReport } from './model';
import { makeRng, type Rng } from './rng';
import { stakeMods, stakeStep } from './stakeholders';
import { crownStep } from './crowns';
import { FOCUS_CHANGE_PER_STORE, focusFit, landProfile, type Focus } from './lands';
import { courtStep, holdAudience, privilegeMods, type Offering } from './court';
import { branchMonth, enterLand, exitLand, newWorld, othersMonth, phase4Done, type BranchDecision, type EntryMode } from './world';
import { CAMPAIGN, campaignActive, campaignStep, counterCost, planCampaign, rivalExpand } from './rivalai';
import { boardMods, boardMonth, capByArticles, holdMeeting, newGovernance, seatBoard, type Articles, type BoardMember, type MeetingChoice } from './governance';
import { cannibalMult, freeCells, generateArea, inRange, rivalTarget, type Area } from './area';
import {
  borrowable,
  collateral,
  ERA,
  FORCE24_BOOST,
  generateNation,
  INVESTIGATION,
  IPO,
  LAND,
  landIndexAt,
  LOAN,
  PB,
  regionStores,
  SATISFACTION,
  SUPPORT_COST,
  HUB_COST,
  HUB_UPKEEP,
  MANUAL_COST,
  MANUAL_UNLOCK,
  nationStores,
  OPEN_COSTS,
  QUALITY,
  RIVAL_NATION,
  regionMonth,
  trainees,
  TRAINING_COST,
  TRAINING_UPKEEP,
  type StoreType,
} from './nation';

export const DAYS_PER_MONTH = 30;
/** 月ごとの季節（0 = 1 月） */
export const SEASON = [0.9, 0.9, 1, 1, 1.05, 1.05, 1.15, 1.2, 1.05, 1, 0.95, 1.1];
export const HOURS_MULT = { 16: 1, 24: 1.3 } as const;
export const SIGN_MULT = 1.08;
export const PARKING_MULT = 1.12;
/** 原価率：問屋経由と、3 店からの共同仕入れ */
export const COST_RATE = { wholesale: 0.75, joint: 0.7 } as const;
export const JOINT_BUYING_STORES = 3;
/** シフト 1 人の月給（16 時間営業。24 時間は 1.5 倍） */
export const WAGE = 90_000;
/** 回すのに要る人数 */
export const STAFF_NEEDED = { 16: 3, 24: 4 } as const;
export const MAX_STAFF = 8;
export const ORDER_RANGE = [0.8, 1.4] as const;
/** 天気のぶれ（±） */
export const WEATHER_SWING = 0.1;
/** 改装と出店の費用（仮） */
export const RENOVATE_COST = { sign: 1_500_000, parking: 4_000_000 } as const;
export const OPEN_COST = 25_000_000;
/** 加盟店（オーナーの土地と店）：本部が払うのは研修と看板だけ。粗利のうち本部の取り分 */
export const FC_OPEN_COST = 3_000_000;
export const FC_SHARE = 0.45;
/** 加盟したいヒーローから手紙が届く月（フェーズ 1、店に空きがあるとき） */
export const LETTER_MONTHS = [8, 18];
/** 出店候補の区画：基礎日販と家賃の幅（仮） */
export const PLOT_RANGES: Record<Exclude<PlotKind, 'home' | 'liquor'>, { base: [number, number]; rent: [number, number] }> = {
  station: { base: [380_000, 440_000], rent: [700_000, 900_000] },
  office: { base: [330_000, 380_000], rent: [520_000, 650_000] },
  school: { base: [280_000, 330_000], rent: [350_000, 430_000] },
  residential: { base: [240_000, 300_000], rent: [280_000, 360_000] },
  suburb: { base: [250_000, 320_000], rent: [220_000, 300_000] },
};
export const LIQUOR_PLOT = { kind: 'liquor', base: 280_000, rent: 0 } as const;
/** フェーズごとの店数の上限（フェーズ 1 は 3 店まで） */
export const MAX_STORES: Record<EmpireState['phase'], number> = { 1: 3, 2: 30, 3: 400, 4: 1000, 5: 5000 };
/** 予兆を出す線 */
export const FATIGUE_WARN = 60;

// ---- フェーズ 2（エリアチェーン、docs/EMPIRE_DESIGN.md 4.2）
/** 地図の区画に出す店の費用（店づくりが型になって、フェーズ 1 より安い） */
export const AREA_OPEN_COST = 12_000_000;
export const CENTER_COST = 80_000_000;
export const CENTER_UPKEEP = 1_500_000;
/** SV（巡回指導員）1 人の月給と、見られる店の数 */
export const SV_WAGE = 400_000;
export const SV_SPAN = 8;
export const MAX_SV = 10;
export const POS_COST = 15_000_000;
/** 1 店あたりの月の配送費：物流センターの配送圏の中・外、センターが 1 つも無いとき */
export const DELIVERY = { inRange: 40_000, outOfRange: 300_000, none: 150_000 } as const;
/** 配送圏の中の店の原価率（センターからまとめて運ぶ） */
export const CENTER_COST_RATE = 0.66;
/** 知名度：店が多いほど需要が増える（20 店で +40%） */
export const AWARENESS = { perStore: 0.4 / 20, max: 0.4 } as const;
/** ライバルの出店：何か月ごと、何店まで、最初に何店 */
export const RIVAL = { interval: 3, max: 12, start: 2 } as const;
/** 食い合いの予兆を出す線 */
export const CROWDED_WARN = 0.8;

/** 1 か月ぶんのプレイヤーの決定。書いていないものは先月のまま */
export interface Decisions {
  /** 全店の方針（そのあと stores の店ごとの指定で上書き） */
  all?: Partial<Pick<Store, 'order' | 'hours' | 'staff'>>;
  stores?: Record<number, Partial<Pick<Store, 'order' | 'hours' | 'staff'>>>;
  /** フェーズ 2 から：地図の区画に出店する */
  openAt?: number[];
  /** フェーズ 2 から：物流センターを建てる区画 */
  buildCenter?: number[];
  /** SV の人数 */
  sv?: number;
  /** POS を入れる */
  pos?: boolean;
  /** フェーズ 3 から：エリアに店の形ごとに出店する（研修所で育った人数まで） */
  expand?: { region: number; type: StoreType; count: number }[];
  /** フェーズ 3 から：物流拠点を建てるエリア */
  buildHub?: number[];
  /** フェーズ 3 から：研修所を建てる数 */
  training?: number;
  /** フェーズ 3 から：マニュアルを整える */
  manual?: boolean;
  /** フェーズ 3 から：加盟店に 24 時間営業を求める／やめる */
  force24?: boolean;
  /** フェーズ 3 から：オーナー支援の手厚さ（0〜3） */
  support?: number;
  /** フェーズ 3 から：借りる・返す額 */
  borrow?: number;
  repay?: number;
  /** フェーズ 3 から：上場する */
  ipo?: boolean;
  /** フェーズ 3 から：PB を 1 段開発する */
  pb?: boolean;
  renovate?: { store: number; kind: 'sign' | 'parking' }[];
  /** 新しい店（plotsFor の候補か、letterFor の加盟店） */
  open?: Plot[];
  /** 次の格へ上がる（条件を満たしているときだけ） */
  promote?: boolean;
  /** フェーズ 3 から：役員会の顔ぶれ（5 席まで。渡せば入れ替える） */
  board?: BoardMember[];
  /** 株主総会の月：演説と議題。延期するなら postpone */
  meeting?: MeetingChoice;
  postpone?: boolean;
  /** 上場するときの定款 */
  articles?: Articles;
  /** ライバルのセール攻勢に対抗セールで応える（攻勢のあいだ、毎月） */
  counter?: boolean;
  /** 品ぞろえを変える（フェーズ 2 からは店の数に応じた費用） */
  focus?: Focus;
  /** キングとの謁見で献上する品（招待が来ている月） */
  offering?: Offering;
  /** フェーズ 4 から：ほかのランドへ渡る（参入方式つき） */
  enter?: { land: string; mode: EntryMode };
  /** フェーズ 4 から：渡ったランドごとの決定 */
  branches?: Record<string, BranchDecision>;
}

const pickIn = (rng: Rng, [lo, hi]: [number, number]) => Math.round((lo + rng.next() * (hi - lo)) / 10_000) * 10_000;

/** この月の出店候補 3 つ（状態は変えない。月が進むと入れ替わる） */
export function plotsFor(state: EmpireState): Plot[] {
  const rng = makeRng((state.rng ^ 0x9e3779b9) >>> 0);
  const kinds = Object.keys(PLOT_RANGES) as (keyof typeof PLOT_RANGES)[];
  for (let i = kinds.length - 1; i > 0; i--) {
    const j = Math.floor(rng.next() * (i + 1));
    [kinds[i], kinds[j]] = [kinds[j], kinds[i]];
  }
  return kinds.slice(0, 3).map((kind) => ({ kind, base: pickIn(rng, PLOT_RANGES[kind].base), rent: pickIn(rng, PLOT_RANGES[kind].rent), owner: null }));
}

/** この月に加盟の手紙が届いているか（届いていれば、そのオーナーの区画） */
export function letterFor(state: EmpireState, owner: number): Plot | null {
  if (state.phase !== 1 || !LETTER_MONTHS.includes(state.month) || state.stores.length >= MAX_STORES[state.phase]) return null;
  if (state.stores.some((s) => s.owner !== null && s.opened === state.month)) return null;
  return { ...LIQUOR_PLOT, owner };
}

/** フェーズ 2 を抜ける条件：12 店以上・ライバルより多い・物流センターがある */
export function phase2Done(s: EmpireState): boolean {
  return !!s.area && s.stores.length >= 12 && s.stores.length > s.area.rivalStores.length && s.area.centers.length > 0;
}

/** フェーズ 1 を抜ける条件：3 店舗・3 か月連続の黒字 */
export function phase1Done(s: EmpireState): boolean {
  const last = s.history.slice(-3);
  return s.stores.length >= 3 && last.length === 3 && last.every((r) => r.profit > 0);
}

/** フェーズ 3 を抜ける条件：本拠ランドで、直近 12 か月の売上がライバルを上回る */
export function phase3Done(s: EmpireState): boolean {
  if (!s.nation) return false;
  const last = s.history.slice(-12);
  if (last.length < 12 || last.some((r) => r.rivalRevenue === undefined)) return false;
  return last.reduce((a, r) => a + r.revenue, 0) > last.reduce((a, r) => a + (r.rivalRevenue ?? 0), 0);
}

/** フェーズ 3 の卒業はキングとの謁見（招待には売上 1 位と政府の注目が要る。court.ts） */
export const canPromote = (s: EmpireState) => (s.phase === 1 && phase1Done(s)) || (s.phase === 2 && phase2Done(s)) || (s.phase === 3 && !!s.court?.audience) || (s.phase === 4 && phase4Done(s));

/** 店の数（フェーズ 3 からはエリアの合計） */
export const storeCount = (s: EmpireState) => (s.nation ? nationStores(s.nation) : s.stores.length);

/** 店のある区画（フェーズ 2 から） */
export const ownCells = (s: EmpireState) => s.stores.map((x) => x.cell).filter((c): c is number => c !== null);

/** 地図の上の店にかかる需要の倍率：知名度 × 食い合い × SV の目の届き方 */
export function areaMult(s: EmpireState, store: Store): number {
  if (!s.area || store.cell === null) return 1;
  const aware = 1 + Math.min(AWARENESS.max, AWARENESS.perStore * s.stores.length);
  const coverage = Math.min(1, (s.sv * SV_SPAN) / Math.max(1, s.stores.length));
  return aware * cannibalMult(s.area, store.cell, ownCells(s)) * (0.92 + 0.08 * coverage);
}

/** 1 店の月の配送費と原価率（フェーズ 2 から） */
export function logistics(s: EmpireState, store: Store): { delivery: number; costRate: number } {
  const joint = s.stores.length >= JOINT_BUYING_STORES ? COST_RATE.joint : COST_RATE.wholesale;
  if (!s.area || store.cell === null) return { delivery: 0, costRate: joint };
  if (s.area.centers.length === 0) return { delivery: DELIVERY.none, costRate: joint };
  return inRange(s.area, store.cell) ? { delivery: DELIVERY.inRange, costRate: CENTER_COST_RATE } : { delivery: DELIVERY.outOfRange, costRate: joint };
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** 店主に見えている、この月の 1 日あたりの見込み需要（天気のぶれの前） */
export function expectedDemand(store: Store, month: number, mult = 1): number {
  return mult * store.base * HOURS_MULT[store.hours] * (store.sign ? SIGN_MULT : 1) * (store.parking ? PARKING_MULT : 1) * SEASON[month % 12] * (1 - store.fatigue / 250);
}

/** 1 店の 1 か月。疲れは月の始めの値で需要に効き、月末に更新する */
export interface StoreEnv {
  costRate: number;
  /** 需要の倍率（地図の上の知名度・食い合い・SV） */
  mult?: number;
  /** 月の配送費 */
  delivery?: number;
  /** POS：売れ行きのデータで、天気のぶれの半分以上を発注に織りこめる */
  pos?: boolean;
  /** 家賃の倍率（商店街の最後通告で地主が上げる） */
  rentMult?: number;
}

export function storeMonth(store: Store, month: number, env: StoreEnv | number, rng: Rng): { store: Store; report: StoreReport } {
  const e: StoreEnv = typeof env === 'number' ? { costRate: env } : env;
  const costRate = e.costRate;
  const expected = expectedDemand(store, month, e.mult ?? 1);
  const swing = (rng.next() * 2 - 1) * WEATHER_SWING;
  const demand = expected * (1 + swing);
  const stocked = expected * store.order * (e.pos ? 1 + swing * 0.6 : 1);
  const sold = Math.min(demand, stocked);
  const revenue = sold * DAYS_PER_MONTH;
  const purchases = stocked * DAYS_PER_MONTH * costRate;
  // 加盟店は人件費と家賃をオーナーが持ち、本部は粗利の FC_SHARE を受け取る
  const fc = store.owner !== null;
  const labor = fc ? 0 : store.staff * WAGE * (store.hours === 24 ? 1.5 : 1);
  const rent = fc ? 0 : store.rent * (e.rentMult ?? 1);
  const delivery = e.delivery ?? 0;
  const short = Math.max(0, STAFF_NEEDED[store.hours] - store.staff);
  const fatigue = clamp(store.fatigue + (short > 0 ? short * 12 : -15), 0, 100);
  const report: StoreReport = {
    id: store.id,
    expected,
    demand,
    revenue,
    purchases,
    waste: Math.max(0, stocked - sold) * DAYS_PER_MONTH,
    lost: Math.max(0, demand - stocked) * DAYS_PER_MONTH,
    labor,
    rent,
    profit: (fc ? (revenue - purchases) * FC_SHARE : revenue - purchases - labor - rent) - delivery,
    fatigue,
  };
  return { store: { ...store, fatigue }, report };
}

/** 決定を当てる（範囲の外は丸める。お金が足りない改装・出店はしない） */
/** ランドの文化と品ぞろえの合い方（客足の倍率）。人の多さはフェーズ 3 のエリアの広さに効く */
export const landDemand = (s: Pick<EmpireState, 'land' | 'focus'>) => focusFit(s.land, s.focus);

/** 品ぞろえを変える費用（フェーズ 1 は無料） */
export const focusChangeCost = (s: EmpireState) => (s.phase === 1 ? 0 : storeCount(s) * FOCUS_CHANGE_PER_STORE);

function applyDecisions(state: EmpireState, d: Decisions, notes: Note[], rng: Rng): void {
  if (d.focus && d.focus !== (state.focus ?? 'daily')) {
    const cost = focusChangeCost(state);
    if (state.funds >= cost) {
      state.funds -= cost;
      state.focus = d.focus;
      notes.push({ kind: 'focusChanged', focus: d.focus });
    } else notes.push({ kind: 'shortOfFunds' });
  }
  if (d.promote && canPromote(state)) {
    state.phase = (state.phase + 1) as EmpireState['phase'];
    notes.push({ kind: 'promoted', phase: state.phase });
    if (state.phase === 2) openArea(state, rng);
    if (state.phase === 3) openNation(state, rng);
    if (state.phase === 4) state.world = newWorld(state.land);
  }
  for (const s of state.stores) {
    const c = { ...d.all, ...d.stores?.[s.id] };
    if (c.order !== undefined) s.order = clamp(c.order, ORDER_RANGE[0], ORDER_RANGE[1]);
    if (c.hours !== undefined) s.hours = c.hours === 24 ? 24 : 16;
    if (c.staff !== undefined) s.staff = clamp(Math.round(c.staff), 0, MAX_STAFF);
  }
  for (const r of d.renovate ?? []) {
    const s = state.stores.find((x) => x.id === r.store);
    if (!s || s[r.kind]) continue;
    if (state.funds < RENOVATE_COST[r.kind]) {
      notes.push({ kind: 'shortOfFunds' });
      continue;
    }
    state.funds -= RENOVATE_COST[r.kind];
    s[r.kind] = true;
  }
  for (const o of state.phase === 1 ? (d.open ?? []) : []) {
    if (state.stores.length >= MAX_STORES[state.phase]) {
      notes.push({ kind: 'storeLimit' });
      continue;
    }
    const fc = o.owner !== null;
    // 加盟店は手紙が届いた月にだけ
    if (fc && !letterFor(state, o.owner!)) continue;
    const cost = fc ? FC_OPEN_COST : OPEN_COST;
    if (state.funds < cost) {
      notes.push({ kind: 'shortOfFunds' });
      continue;
    }
    state.funds -= cost;
    const id = state.nextStoreId++;
    state.stores.push(newStore(id, state.month, o));
    notes.push({ kind: 'opened', store: id });
  }
  const area = state.area;
  if (!area || state.phase !== 2) return;
  if (d.sv !== undefined) state.sv = clamp(Math.round(d.sv), 0, MAX_SV);
  if (d.pos && !state.pos) {
    if (state.funds >= POS_COST) {
      state.funds -= POS_COST;
      state.pos = true;
    } else notes.push({ kind: 'shortOfFunds' });
  }
  for (const cell of d.buildCenter ?? []) {
    if (!freeCells(area, new Set(ownCells(state))).includes(cell)) continue;
    if (state.funds < CENTER_COST) {
      notes.push({ kind: 'shortOfFunds' });
      continue;
    }
    state.funds -= CENTER_COST;
    area.centers.push(cell);
    notes.push({ kind: 'centerBuilt', cell });
  }
  for (const cell of d.openAt ?? []) {
    if (state.stores.length >= MAX_STORES[state.phase]) {
      notes.push({ kind: 'storeLimit' });
      continue;
    }
    if (!freeCells(area, new Set(ownCells(state))).includes(cell)) continue;
    if (state.funds < AREA_OPEN_COST) {
      notes.push({ kind: 'shortOfFunds' });
      continue;
    }
    state.funds -= AREA_OPEN_COST;
    const id = state.nextStoreId++;
    const c = area.cells[cell];
    state.stores.push({ ...newStore(id, state.month, { kind: 'residential', base: c.base, rent: c.rent, owner: null }), cell });
    notes.push({ kind: 'opened', store: id });
  }
}

/** フェーズ 1 → 2：エリアの地図を作り、いまの店を真ん中あたりに並べ、ライバルを置く */
function openArea(state: EmpireState, rng: Rng): void {
  const area: Area = generateArea(rng);
  const late = landProfile(state.land).rivalFrom > state.month;
  // いまの店は、食い合わない程度に離して真ん中あたりへ（2 マスずつ空ける）
  const cx = Math.floor(area.w / 2) - 1;
  const cy = Math.floor(area.h / 2) - 1;
  const spots = [cy * area.w + cx - 1, cy * area.w + cx + 1, (cy + 2) * area.w + cx, (cy - 1) * area.w + cx + 3].filter((i) => i >= 0 && i < area.cells.length);
  state.stores.forEach((s, i) => (s.cell = spots[i] ?? null));
  state.area = area;
  // まだどこの会社も入っていないランド（Tangerine）は、ライバルが来るのは rivalFrom の月から
  for (let i = 0; i < (late ? 0 : RIVAL.start); i++) {
    const c = rivalTarget(area, ownCells(state));
    if (c !== null) area.rivalStores.push(c);
  }
  const next = rivalTarget(area, ownCells(state));
  area.rivalPlan = next === null ? null : { cell: next, month: Math.max(state.month + RIVAL.interval, late ? landProfile(state.land).rivalFrom : 0) };
}

/** ライバルの一手：予告した月に出店し（先に取られていたら次の候補へ）、次の出店を予告する */
function rivalStep(state: EmpireState, notes: Note[]): void {
  const area = state.area;
  if (!area || state.phase !== 2) return;
  const plan = area.rivalPlan;
  if (plan && plan.month <= state.month) {
    const own = ownCells(state);
    const free = freeCells(area, new Set(own));
    const cell = free.includes(plan.cell) ? plan.cell : rivalTarget(area, own);
    if (cell !== null && area.rivalStores.length < RIVAL.max) {
      area.rivalStores.push(cell);
      notes.push({ kind: 'rivalOpened', cell });
    }
    area.rivalPlan = null;
  }
  if (!area.rivalPlan && area.rivalStores.length < RIVAL.max) {
    const next = rivalTarget(area, ownCells(state));
    if (next !== null) {
      area.rivalPlan = { cell: next, month: state.month + RIVAL.interval };
      notes.push({ kind: 'rivalPlan', cell: next });
    }
  }
}

/** フェーズ 2 → 3：本拠エリアは地図の店をまとめ、残り 10 エリアを作る */
function openNation(state: EmpireState, rng: Rng): void {
  const own = state.stores;
  const avg = (f: (x: Store) => number) => (own.length ? own.reduce((a, x) => a + f(x), 0) / own.length : 250_000);
  state.nation = generateNation(
    { stores: own.length, fc: own.filter((x) => x.owner !== null).length, hub: (state.area?.centers.length ?? 0) > 0, rival: state.area?.rivalStores.length ?? 0, traffic: Math.round(avg((x) => x.base)), rent: Math.round(avg((x) => x.rent)) },
    rng,
    state.month,
  );
  // まだ会社の少ないランド（Tangerine）は、ほかのエリアのライバルも少ない
  if (landProfile(state.land).rivalFrom > state.month - 12) for (const r of state.nation.regions.slice(1)) r.rival = Math.floor(r.rival / 2);
  // 人の多いランド（Ocean）ほど、エリアに入りきる店が多い
  const pop = landProfile(state.land).population;
  for (const r of state.nation.regions.slice(1)) r.capacity = Math.round(r.capacity * pop);
}

/** 自店がエリアの入りきる目安のこの割合を超えると、オーナーの満足度が下がる */
export const CROWDED_OWN = 0.8;

/** 直近 12 か月（今月を除く）の売上と利益 */
const trailing = (s: EmpireState) => {
  const last = s.history.slice(-12);
  return { revenue: last.reduce((a, r) => a + r.revenue, 0), profit: last.reduce((a, r) => a + r.profit, 0) };
};

/** 上場できるか（直近 12 か月の売上が条件を満たし、まだ上場していない） */
export const canIpo = (s: EmpireState) => !!s.nation && !s.nation.listed && trailing(s).revenue >= IPO.minRevenue;

/** 上場で集まる資金（直近 12 か月の利益 × 倍率 × 売り出す割合） */
export const ipoRaise = (s: EmpireState) => Math.max(0, trailing(s).profit) * IPO.per * IPO.sell;

/** フェーズ 3 の決定：研修所・物流拠点・マニュアル・出店（研修所で育った人数まで、物流拠点のあるエリアだけ） */
function applyNationDecisions(state: EmpireState, d: Decisions, notes: Note[]): void {
  const n = state.nation!;
  const g = (state.gov ??= newGovernance(state.month));
  if (d.board) g.board = seatBoard(d.board);
  holdMeeting(state, d.meeting, !!d.postpone, notes);
  holdAudience(state, d.offering, notes);
  const pay = (cost: number) => {
    if (state.funds < cost) {
      notes.push({ kind: 'shortOfFunds' });
      return false;
    }
    state.funds -= cost;
    return true;
  };
  for (let i = 0; i < (d.training ?? 0); i++) if (pay(TRAINING_COST)) n.trainingCenters++;
  for (const ri of d.buildHub ?? []) {
    const r = n.regions[ri];
    if (!r || r.hub || r.locked) continue;
    if (pay(HUB_COST)) {
      r.hub = true;
      notes.push({ kind: 'hubBuilt', region: ri });
    }
  }
  if (d.manual && !n.manual && n.quality < MANUAL_UNLOCK && pay(MANUAL_COST)) n.manual = true;
  // 定款で 24 時間の強制を認めていなければ、求められない（変えるには総会の決議）
  if (d.force24 !== undefined) n.force24 = d.force24 && (g.articles?.force24 ?? true);
  if (d.support !== undefined) n.support = clamp(Math.round(d.support), 0, 3);
  if (d.pb && n.pb < PB.max && pay(PB.cost)) {
    n.pb++;
    notes.push({ kind: 'pbUp', level: n.pb });
  }
  if (d.borrow && d.borrow > 0) {
    const amount = Math.min(d.borrow, borrowable(n) * stakeMods(state).borrow);
    n.loans += amount;
    state.funds += amount;
  }
  if (d.repay && d.repay > 0) {
    const amount = Math.min(d.repay, n.loans, Math.max(0, state.funds));
    n.loans -= amount;
    state.funds -= amount;
  }
  if (d.ipo && canIpo(state)) {
    const raised = ipoRaise(state);
    state.funds += raised;
    n.ownership *= 1 - IPO.sell;
    n.listed = true;
    g.articles = d.articles ?? { force24: n.force24, mix: 'balanced', dividend: 1 };
    if (!g.articles.force24) n.force24 = false;
    notes.push({ kind: 'ipo', raised });
  }
  // 時代のルール：規制が厳しいあいだは、月の出店に上限がある
  let people = n.eraStrict ? Math.min(trainees(n), ERA.strictCap) : trainees(n);
  const capped = n.eraStrict && trainees(n) > ERA.strictCap;
  let opened = 0;
  for (const x of capByArticles(d.expand ?? [], g.articles)) {
    const r = n.regions[x.region];
    if (!r || r.locked || x.count <= 0) continue;
    if (!r.hub && x.region !== 0) {
      notes.push({ kind: 'needHub', region: x.region });
      continue;
    }
    for (let i = 0; i < x.count; i++) {
      if (people <= 0) {
        notes.push(capped ? { kind: 'eraCap', cap: ERA.strictCap } : { kind: 'traineeLimit', trainees: trainees(n) });
        break;
      }
      if (nationStores(n) >= MAX_STORES[state.phase] || !pay(OPEN_COSTS[x.type] * (n.eraStrict ? ERA.strictCost : 1))) break;
      r[x.type]++;
      people--;
      opened++;
    }
    if (people <= 0) break;
  }
  // 品質：急いで出すほど下がり（マニュアルがあると緩む）、毎月少しずつ戻る
  const wasAbove = n.quality >= MANUAL_UNLOCK;
  n.quality = Math.min(1, Math.max(QUALITY.min, n.quality + QUALITY.recover + boardMods(g).quality - opened * QUALITY.perOpen * (n.manual ? QUALITY.manualFactor : 1)));
  if (n.quality < 0.95) notes.push({ kind: 'qualityWarn' });
  if (wasAbove && n.quality < MANUAL_UNLOCK && !n.manual) notes.push({ kind: 'manualReady' });
}

/** フェーズ 3 の 1 か月：ライバルが増え、エリアごとに売上と利益を出す */
function nationMonth(state: EmpireState, d: Decisions, notes: Note[], rng: Rng): MonthReport {
  applyNationDecisions(state, d, notes);
  const n = state.nation!;
  const m = state.month;
  // 時代のルール：変わる 3 か月前に予告し、その月に変わる
  if (m + ERA.notice === n.eraChange) notes.push({ kind: 'eraSoon', strict: !n.eraStrict, month: n.eraChange });
  if (m >= n.eraChange) {
    n.eraStrict = !n.eraStrict;
    n.eraChange = m + (n.eraStrict ? ERA.strict : ERA.loose);
    notes.push({ kind: 'eraChanged', strict: n.eraStrict });
  }
  // ライバル：規制が緩いあいだは倍の速さで増える
  // 総会でライバルを名指ししたあとしばらくは、緩い時代と同じ速さで増える
  const rush = !n.eraStrict || (state.gov?.rivalRushUntil ?? -1) >= m;
  // ライバルの出店：プレイヤーが強いエリアほど狙う（rivalai.ts）
  if (m % RIVAL_NATION.interval === 0) rivalExpand(n, rush ? ERA.looseRival : 1);
  // セール攻勢：フェーズ 3 に入って CAMPAIGN.first か月目から、毎年 1 度。1 か月前に予告
  const since = m - n.landStart;
  if (since >= CAMPAIGN.first - CAMPAIGN.notice && (since - (CAMPAIGN.first - CAMPAIGN.notice)) % CAMPAIGN.every === 0 && !campaignActive(state.campaign, m)) state.campaign = planCampaign(n, m);
  const countered = !!d.counter && campaignActive(state.campaign, m);
  const hitDemand = campaignStep(n, state.campaign ?? null, m, countered, notes);
  const counterSpend = countered && state.campaign ? counterCost(n, state.campaign) : 0;
  // 地価：上がり方が鈍ってきたら予兆、天井を過ぎたら下がる。担保割れは返済を迫られる
  const monthsIn = m - n.landStart;
  n.landIndex = landIndexAt(monthsIn);
  if (monthsIn === LAND.riseMonths - LAND.notice && n.loans > 0) notes.push({ kind: 'landSlowing' });
  if (monthsIn === LAND.riseMonths + 1) notes.push({ kind: 'landFalling' });
  const limit = collateral(n) * LOAN.ratio;
  if (n.loans > limit) {
    const amount = n.loans - limit;
    n.loans = limit;
    state.funds -= amount;
    notes.push({ kind: 'marginCall', amount });
  }
  // オーナーの満足度：24 時間の強制・混みすぎたエリアで下がり、支援で上がる。下がり続けると告発 → 調査
  const fc = n.regions.reduce((a, r) => a + r.fcOwner + r.fcHq, 0);
  if (fc > 0) {
    // 自店を詰めこみすぎたエリア（ライバルの店は数えない。オーナーが怒るのは本部の出店のしかた）
    const crowded = n.regions.filter((r) => regionStores(r) > r.capacity * CROWDED_OWN).length;
    const delta = SATISFACTION.base + (n.force24 ? SATISFACTION.force24 : 0) + crowded * SATISFACTION.crowded + n.support * SATISFACTION.support;
    n.satisfaction = clamp(n.satisfaction + delta, 0, 100);
    if (n.satisfaction < SATISFACTION.warn) notes.push({ kind: 'ownerUnrest', satisfaction: Math.round(n.satisfaction) });
    if (n.satisfaction < SATISFACTION.complaint && n.investigation === null) {
      n.investigation = m + 2;
      notes.push({ kind: 'investigationSoon' });
    }
  }
  if (n.investigation !== null && m >= n.investigation) {
    const fine = Math.max(INVESTIGATION.minFine, trailing(state).profit * INVESTIGATION.fineRate) * boardMods(state.gov).fine;
    state.funds -= fine;
    n.force24 = false;
    n.satisfaction = Math.max(n.satisfaction, SATISFACTION.afterInvestigation);
    n.investigation = null;
    notes.push({ kind: 'investigation', fine });
  }
  const sm = stakeMods(state);
  const bm = boardMods(state.gov);
  // 総会の 1 か月前に予告する
  if (state.gov && state.gov.nextMeeting === m + 1) notes.push({ kind: 'meetingSoon', month: m + 1 });
  const pm = privilegeMods(state);
  const mods = { demand: (1 + n.pb * PB.demand) * sm.demand * bm.demand * landDemand(state), costCut: n.pb * PB.costCut - sm.costRate + bm.costCut + pm.costCut, fcBoost: n.force24 ? FORCE24_BOOST : 1, rentMult: sm.rent * landProfile(state.land).rent * pm.rent };
  const reps = n.regions.map((r, i) => regionMonth(r, n.quality, (rng.next() * 2 - 1) * WEATHER_SWING * 0.5, i === state.campaign?.region && campaignActive(state.campaign, m) ? { ...mods, demand: mods.demand * hitDemand } : mods));
  const overhead = n.regions.filter((r) => r.hub).length * HUB_UPKEEP + n.trainingCenters * TRAINING_UPKEEP + counterSpend + n.loans * LOAN.interest * bm.interest + n.support * fc * SUPPORT_COST;
  const revenue = reps.reduce((a, r) => a + r.revenue, 0);
  const profit = reps.reduce((a, r) => a + r.profit, 0) - overhead;
  state.funds += profit;
  if (state.funds < 0) notes.push({ kind: 'shortOfFunds' });
  return { month: state.month, revenue, inflow: state.inflow, overhead, profit, funds: state.funds, stores: [], notes, rivalRevenue: reps.reduce((a, r) => a + r.rivalRevenue, 0) };
}

/** 月を 1 つ進める。新しい状態とその月の報告を返す */
export function advanceMonth(prev: EmpireState, decisions: Decisions = {}): { state: EmpireState; report: MonthReport } {
  const state: EmpireState = structuredClone(prev);
  const notes: Note[] = [];
  const rng = makeRng(state.rng);
  applyDecisions(state, decisions, notes, rng);
  // この月に改装した店の数（常連客が喜ぶ）
  const renovated = state.stores.filter((s) => {
    const p = prev.stores.find((x) => x.id === s.id);
    return !!p && ((s.sign && !p.sign) || (s.parking && !p.parking));
  }).length;
  if (state.phase >= 3 && state.nation) {
    if (state.phase >= 4 && state.world && decisions.enter) enterLand(state, decisions.enter.land, decisions.enter.mode, rng, notes);
    const report = nationMonth(state, decisions, notes, rng);
    // フェーズ 4：渡ったランドの 1 か月（売上は会社の売上に、本拠の外の売上として足す）
    if (state.phase >= 4 && state.world) {
      for (const [land, bd] of Object.entries(decisions.branches ?? {})) if (bd.exit) exitLand(state, land, notes);
      let foreign = 0;
      for (const b of state.world.branches) {
        const r = branchMonth(state, b, decisions.branches?.[b.land] ?? {}, rng, notes);
        foreign += r.revenue;
        report.revenue += r.revenue;
        report.profit += r.profit;
        state.funds += r.profit;
      }
      report.foreignRevenue = foreign;
      othersMonth(state.world, state.month);
    }
    state.inflow = 0;
    state.history = [...state.history, report].slice(-HISTORY);
    stakeStep(state, report, { renovated });
    boardMonth(state);
    crownStep(state, notes, report.revenue);
    courtStep(state, notes);
    report.funds = state.funds;
    if (canPromote(state)) notes.push({ kind: 'phaseReady' });
    state.month++;
    state.rng = rng.state;
    return { state, report };
  }
  rivalStep(state, notes);
  const reports: StoreReport[] = [];
  // 最後通告の重し（客離れ・問屋の値上げ・地主の値上げ）
  const sm = stakeMods(state);
  const ld = landDemand(state);
  const lr = landProfile(state.land).rent;
  const env = state.stores.map((s) => {
    const l = logistics(state, s);
    return { delivery: l.delivery, costRate: l.costRate + sm.costRate, mult: areaMult(state, s) * sm.demand * ld, crowd: state.area && s.cell !== null ? cannibalMult(state.area, s.cell, ownCells(state)) : 1 };
  });
  state.stores = state.stores.map((s, i) => {
    const { store, report } = storeMonth(s, state.month, { costRate: env[i].costRate, delivery: env[i].delivery, mult: env[i].mult, pos: state.pos, rentMult: sm.rent * lr }, rng);
    if (env[i].crowd < CROWDED_WARN) notes.push({ kind: 'crowded', store: s.id });
    reports.push(report);
    // 予兆：疲れが積もり始めた月から知らせる（需要が大きく落ちる前に）
    if (report.fatigue >= FATIGUE_WARN || report.fatigue > s.fatigue) notes.push({ kind: 'fatigue', store: s.id });
    if (report.waste > report.revenue * 0.15) notes.push({ kind: 'waste', store: s.id });
    if (report.lost > report.revenue * 0.1) notes.push({ kind: 'stockout', store: s.id });
    return store;
  });
  const revenue = reports.reduce((a, r) => a + r.revenue, 0);
  // 本部の費用：SV の月給と物流センターの維持費
  const overhead = state.sv * SV_WAGE + (state.area?.centers.length ?? 0) * CENTER_UPKEEP;
  const profit = reports.reduce((a, r) => a + r.profit, 0) - overhead;
  state.funds += profit;
  if (state.funds < 0) notes.push({ kind: 'shortOfFunds' });
  const report: MonthReport = { month: state.month, revenue, inflow: state.inflow, overhead, profit, funds: state.funds, stores: reports, notes };
  state.inflow = 0;
  state.history = [...state.history, report].slice(-HISTORY);
  stakeStep(state, report, { renovated });
  if (canPromote(state)) notes.push({ kind: 'phaseReady' });
  state.month++;
  state.rng = rng.state;
  return { state, report };
}
