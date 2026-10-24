// 経営モードの状態（docs/EMPIRE_DESIGN.md 9 章）。DOM に触れない。
// 会社の資金の単位は GUM だが、工房の GUM とは別の財布（本店 → 会社の一方向）。

export interface Store {
  id: number;
  /** 開いた月（EmpireState.month） */
  opened: number;
  /** 区画の基礎日販（GUM/日、16 時間営業・改装なし・平月） */
  base: number;
  /** 月の家賃 */
  rent: number;
  /** 発注の多さ（見込み需要に対する仕入れの倍率） */
  order: number;
  hours: 16 | 24;
  /** シフトに入る人数 */
  staff: number;
  sign: boolean;
  parking: boolean;
  /** 店主の疲れ（0〜100）。人手が足りないと積もり、需要が落ちる */
  fatigue: number;
}

export interface StoreReport {
  id: number;
  /** 見込み需要（店主に見えていた数字）と実際の需要（日あたり、売価） */
  expected: number;
  demand: number;
  revenue: number;
  /** 仕入れ（原価）。売れ残りの分も含む */
  purchases: number;
  /** 売れ残り・欠品（売価、月あたり） */
  waste: number;
  lost: number;
  labor: number;
  rent: number;
  profit: number;
  fatigue: number;
}

/** 報告の一行。画面が言葉にする（予兆は必ずここに出してから起こす） */
export type Note =
  | { kind: 'fatigue'; store: number }
  | { kind: 'waste'; store: number }
  | { kind: 'stockout'; store: number }
  | { kind: 'opened'; store: number }
  | { kind: 'shortOfFunds' }
  | { kind: 'storeLimit' };

export interface MonthReport {
  month: number;
  revenue: number;
  /** この月に本店から届いた送金 */
  inflow: number;
  profit: number;
  funds: number;
  stores: StoreReport[];
  notes: Note[];
}

export interface EmpireState {
  /** 屋号 */
  name: string;
  phase: 1 | 2 | 3 | 4 | 5;
  /** 創業からの月（0 が最初の月） */
  month: number;
  funds: number;
  /** 乱数の状態（rng.ts） */
  rng: number;
  stores: Store[];
  nextStoreId: number;
  /** 前の月を進めてから本店から届いた送金（次の報告に載せて 0 に戻す） */
  inflow: number;
  /** 直近の報告（新しいものが後ろ、最大 HISTORY 件） */
  history: MonthReport[];
}

export const HISTORY = 24;
/** 創業時の資金（仮。本店からの送金の率は M2 で決める） */
export const START_FUNDS = 10_000_000;

export function newStore(id: number, opened: number, base = 300_000, rent = 400_000): Store {
  return { id, opened, base, rent, order: 1.1, hours: 16, staff: 3, sign: false, parking: false, fatigue: 0 };
}

export function newEmpire(name: string, seed: number): EmpireState {
  return { name, phase: 1, month: 0, funds: START_FUNDS, rng: seed >>> 0, stores: [newStore(1, 0)], nextStoreId: 2, inflow: 0, history: [] };
}

const num = (v: unknown, fallback: number) => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);

/** 保存された会社を読み直す。形が壊れていれば null（工房のセーブは読めるままにする） */
export function restoreEmpire(raw: unknown): EmpireState | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Partial<EmpireState>;
  if (!Array.isArray(r.stores)) return null;
  const base = newEmpire(typeof r.name === 'string' ? r.name : '', num(r.rng, 1));
  const stores = r.stores
    .filter((s): s is Store => !!s && typeof s === 'object' && typeof s.id === 'number')
    .map((s) => ({ ...newStore(s.id, num(s.opened, 0)), ...s, hours: s.hours === 24 ? 24 : 16 }) as Store);
  const phase = [1, 2, 3, 4, 5].includes(r.phase as number) ? (r.phase as EmpireState['phase']) : 1;
  return {
    ...base,
    phase,
    month: num(r.month, 0),
    funds: num(r.funds, base.funds),
    inflow: num(r.inflow, 0),
    stores,
    nextStoreId: Math.max(num(r.nextStoreId, 1), ...stores.map((s) => s.id + 1)),
    history: Array.isArray(r.history) ? r.history.slice(-HISTORY) : [],
  };
}
