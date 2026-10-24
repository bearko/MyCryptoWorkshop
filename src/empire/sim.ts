// 経営モードの月次シミュレーション（docs/EMPIRE_DESIGN.md 9.1）。純関数：元の状態は変えない。
// 数字はすべて仮の値。scripts/empire-sim.mjs で測って決める。
import { HISTORY, newStore, type EmpireState, type MonthReport, type Note, type Store, type StoreReport } from './model';
import { makeRng, type Rng } from './rng';

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
export const OPEN_COST = 5_000_000;
/** フェーズごとの店数の上限（フェーズ 1 は 3 店まで） */
export const MAX_STORES: Record<EmpireState['phase'], number> = { 1: 3, 2: 30, 3: 200, 4: 1000, 5: 5000 };
/** 予兆を出す線 */
export const FATIGUE_WARN = 60;

/** 1 か月ぶんのプレイヤーの決定。書いていないものは先月のまま */
export interface Decisions {
  stores?: Record<number, Partial<Pick<Store, 'order' | 'hours' | 'staff'>>>;
  renovate?: { store: number; kind: 'sign' | 'parking' }[];
  /** 新しい店（基礎日販と家賃は区画で決まる。フェーズ 1 は候補から選ぶ） */
  open?: { base: number; rent: number }[];
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** 店主に見えている、この月の 1 日あたりの見込み需要（天気のぶれの前） */
export function expectedDemand(store: Store, month: number): number {
  return store.base * HOURS_MULT[store.hours] * (store.sign ? SIGN_MULT : 1) * (store.parking ? PARKING_MULT : 1) * SEASON[month % 12] * (1 - store.fatigue / 250);
}

/** 1 店の 1 か月。疲れは月の始めの値で需要に効き、月末に更新する */
export function storeMonth(store: Store, month: number, costRate: number, rng: Rng): { store: Store; report: StoreReport } {
  const expected = expectedDemand(store, month);
  const demand = expected * (1 + (rng.next() * 2 - 1) * WEATHER_SWING);
  const stocked = expected * store.order;
  const sold = Math.min(demand, stocked);
  const revenue = sold * DAYS_PER_MONTH;
  const purchases = stocked * DAYS_PER_MONTH * costRate;
  const labor = store.staff * WAGE * (store.hours === 24 ? 1.5 : 1);
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
    rent: store.rent,
    profit: revenue - purchases - labor - store.rent,
    fatigue,
  };
  return { store: { ...store, fatigue }, report };
}

/** 決定を当てる（範囲の外は丸める。お金が足りない改装・出店はしない） */
function applyDecisions(state: EmpireState, d: Decisions, notes: Note[]): void {
  for (const s of state.stores) {
    const c = d.stores?.[s.id];
    if (!c) continue;
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
  for (const o of d.open ?? []) {
    if (state.stores.length >= MAX_STORES[state.phase]) {
      notes.push({ kind: 'storeLimit' });
      continue;
    }
    if (state.funds < OPEN_COST) {
      notes.push({ kind: 'shortOfFunds' });
      continue;
    }
    state.funds -= OPEN_COST;
    const id = state.nextStoreId++;
    state.stores.push(newStore(id, state.month, o.base, o.rent));
    notes.push({ kind: 'opened', store: id });
  }
}

/** 月を 1 つ進める。新しい状態とその月の報告を返す */
export function advanceMonth(prev: EmpireState, decisions: Decisions = {}): { state: EmpireState; report: MonthReport } {
  const state: EmpireState = structuredClone(prev);
  const notes: Note[] = [];
  applyDecisions(state, decisions, notes);
  const rng = makeRng(state.rng);
  const costRate = state.stores.length >= JOINT_BUYING_STORES ? COST_RATE.joint : COST_RATE.wholesale;
  const reports: StoreReport[] = [];
  state.stores = state.stores.map((s) => {
    const { store, report } = storeMonth(s, state.month, costRate, rng);
    reports.push(report);
    // 予兆：疲れが積もり始めた月から知らせる（需要が大きく落ちる前に）
    if (report.fatigue >= FATIGUE_WARN || report.fatigue > s.fatigue) notes.push({ kind: 'fatigue', store: s.id });
    if (report.waste > report.revenue * 0.15) notes.push({ kind: 'waste', store: s.id });
    if (report.lost > report.revenue * 0.1) notes.push({ kind: 'stockout', store: s.id });
    return store;
  });
  const revenue = reports.reduce((a, r) => a + r.revenue, 0);
  const profit = reports.reduce((a, r) => a + r.profit, 0);
  state.funds += profit;
  if (state.funds < 0) notes.push({ kind: 'shortOfFunds' });
  const report: MonthReport = { month: state.month, revenue, inflow: state.inflow, profit, funds: state.funds, stores: reports, notes };
  state.inflow = 0;
  state.history = [...state.history, report].slice(-HISTORY);
  state.month++;
  state.rng = rng.state;
  return { state, report };
}
