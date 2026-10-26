/**
 * 島づくり（試作）の中身：地図、建物の置き方、1 日ごとの工事、1 か月ごとの暮らしとお金。
 * 画面に依存しない（tests/island.test.ts で確かめる）。
 */
import { DEF, NEEDS, POLICIES, type Boost, type Def, type Need } from './defs';

export type Dir = 'rd' | 'ld' | 'lu' | 'ru';
export const DIRS: Dir[] = ['rd', 'ld', 'lu', 'ru'];
export type Ground = 'water' | 'sand' | 'grass';

export interface Building {
  uid: number;
  id: string;
  /** 奥のマス */
  i: number;
  j: number;
  dir: Dir;
  /** 工事の残り日数（0 で完成） */
  left: number;
}

export interface Month {
  income: number;
  tax: number;
  upkeep: number;
  moved: number;
}

export interface State {
  v: 1;
  seed: number;
  n: number;
  ground: Ground[];
  day: number;
  money: number;
  pop: number;
  approval: number;
  buildings: Building[];
  nextUid: number;
  last: Month | null;
  /** 届いた人口の節目（お祝いは 1 度だけ） */
  reached: number[];
  /** 出している政策 */
  policies: string[];
  /** 選挙の結果（新しい順ではなく行った順） */
  elections: { day: number; approval: number; won: boolean }[];
}

export const START_MONEY = 30000;
/** テスト用（?test=2）：人口の条件を無視して何でも建てられる */
export const flags = { unlockAll: false };
export const DAYS_PER_MONTH = 30;
export const WORK_SHARE = 0.6;
export const TAX_PER_WORKER = 12;
/** 住んでいる人 1 人あたりの月の住民税 */
export const TAX_PER_RESIDENT = 3;
export const GOAL = { pop: 1000, approval: 70 };
/** 選挙は 2 年ごと（最初は 2 年目の終わり）。支持率がこれ以上なら続投 */
export const ELECTION = { everyMonths: 24, pass: 45 };

// ---------------------------------------------------------------- 地図

function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let x = a;
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

/** 丸い島。ふちを少し揺らし、まわりを砂浜、その外を海にする */
export function makeIsland(seed: number, n = 28): Ground[] {
  const r = rng(seed);
  const waves = Array.from({ length: 6 }, () => ({ k: 1 + Math.floor(r() * 4), p: r() * Math.PI * 2, a: 0.04 + r() * 0.06 }));
  const c = (n - 1) / 2;
  const out: Ground[] = [];
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const dx = (i - c) / c;
      const dy = (j - c) / c;
      const ang = Math.atan2(dy, dx);
      const edge = 0.78 + waves.reduce((s, w) => s + w.a * Math.sin(w.k * ang + w.p), 0);
      const d = Math.hypot(dx, dy);
      out.push(d < edge - 0.08 ? 'grass' : d < edge ? 'sand' : 'water');
    }
  }
  return out;
}

export function newGame(seed = Math.floor(Math.random() * 1e9)): State {
  const n = 28;
  return { v: 1, seed, n, ground: makeIsland(seed, n), day: 0, money: START_MONEY, pop: 0, approval: 50, buildings: [], nextUid: 1, last: null, reached: [], policies: [], elections: [] };
}

export const groundAt = (s: State, i: number, j: number): Ground | null => (i < 0 || j < 0 || i >= s.n || j >= s.n ? null : s.ground[j * s.n + i]);

// ---------------------------------------------------------------- 置き方

/** 建物が使うマス。2 マスは、入口が右下・左上なら j の向き、左下・右上なら i の向きに延びる */
export function cells(def: Def, i: number, j: number, dir: Dir): [number, number][] {
  if (def.size === 1) return [[i, j]];
  return dir === 'rd' || dir === 'lu' ? [[i, j], [i, j + 1]] : [[i, j], [i + 1, j]];
}

/** いちばん手前のマス（絵の基準点が乗るマス） */
export function frontCell(def: Def, i: number, j: number, dir: Dir): [number, number] {
  const c = cells(def, i, j, dir);
  return c[c.length - 1];
}

export function occupant(s: State, i: number, j: number): Building | null {
  for (const b of s.buildings) {
    if (cells(DEF[b.id], b.i, b.j, b.dir).some(([x, y]) => x === i && y === j)) return b;
  }
  return null;
}

export type PlaceError = 'ground' | 'taken' | 'money' | 'locked' | 'coast';

export function canPlace(s: State, def: Def, i: number, j: number, dir: Dir): PlaceError | null {
  if (s.pop < def.unlock && !flags.unlockAll) return 'locked';
  const cs = cells(def, i, j, dir);
  if (cs.some(([x, y]) => groundAt(s, x, y) !== 'grass')) return 'ground';
  if (cs.some(([x, y]) => occupant(s, x, y))) return 'taken';
  if (def.coastal) {
    const near = cs.some(([x, y]) => [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => { const g = groundAt(s, x + dx, y + dy); return g === 'sand' || g === 'water'; }));
    if (!near) return 'coast';
  }
  if (s.money < def.cost) return 'money';
  return null;
}

export function place(s: State, id: string, i: number, j: number, dir: Dir): Building | PlaceError {
  const def = DEF[id];
  const err = canPlace(s, def, i, j, dir);
  if (err) return err;
  s.money -= def.cost;
  const b: Building = { uid: s.nextUid++, id, i, j, dir, left: def.days };
  s.buildings.push(b);
  return b;
}

/** 向きを変える。2 マスは延びる向きが変わるので、置き直せるときだけ */
export function rotate(s: State, uid: number): boolean {
  const b = s.buildings.find((x) => x.uid === uid);
  if (!b) return false;
  const def = DEF[b.id];
  const next = DIRS[(DIRS.indexOf(b.dir) + 1) % 4];
  if (def.size === 2) {
    const others = { ...s, buildings: s.buildings.filter((x) => x !== b) };
    const cs = cells(def, b.i, b.j, next);
    if (cs.some(([x, y]) => groundAt(s, x, y) !== 'grass' || occupant(others, x, y))) return false;
  }
  b.dir = next;
  return true;
}

/** 取り壊す。完成していれば建てた額の半分、工事中なら全額が戻る */
export function demolish(s: State, uid: number): number {
  const k = s.buildings.findIndex((x) => x.uid === uid);
  if (k < 0) return 0;
  const b = s.buildings[k];
  const back = b.left > 0 ? DEF[b.id].cost : Math.floor(DEF[b.id].cost / 2);
  s.money += back;
  s.buildings.splice(k, 1);
  s.pop = Math.min(s.pop, homes(s));
  return back;
}

// ---------------------------------------------------------------- 暮らしの計算

const done = (s: State) => s.buildings.filter((b) => b.left <= 0).map((b) => DEF[b.id]);

export const homes = (s: State) => done(s).reduce((t, d) => t + d.homes, 0);
export const jobs = (s: State) => done(s).reduce((t, d) => t + d.jobs, 0);
export const workers = (s: State) => Math.floor(s.pop * WORK_SHARE);
export const appeal = (s: State) => done(s).reduce((t, d) => t + d.appeal, 0);

export function boosts(s: State): Record<Boost, number> {
  const out: Record<Boost, number> = { tax: 0, industry: 0, tourism: 0, approval: 0, immigration: 0 };
  for (const d of done(s)) for (const [k, v] of Object.entries(d.boost)) out[k as Boost] += v ?? 0;
  for (const p of POLICIES) if (s.policies.includes(p.id)) for (const [k, v] of Object.entries(p.boost)) out[k as Boost] += v ?? 0;
  return out;
}

/** 人手のそろい具合（0〜1） */
export function staffing(s: State): number {
  const j = jobs(s);
  return j === 0 ? 1 : Math.min(1, workers(s) / j);
}

export function capacity(s: State, need: Need): number {
  const st = staffing(s);
  return done(s).reduce((t, d) => t + (d.serve[need] ?? 0) * (d.jobs ? st : 1), 0);
}

/** 必要ごとの満たされ具合（0〜1）。まだ求められていない必要は 1 */
export function coverage(s: State): Record<Need, number> {
  const out = {} as Record<Need, number>;
  for (const n of NEEDS) out[n.key] = s.pop < n.from || s.pop === 0 ? 1 : Math.min(1, capacity(s, n.key) / s.pop);
  return out;
}

export function happiness(s: State): number {
  const cov = coverage(s);
  const needs = NEEDS.reduce((t, n) => t + n.weight * cov[n.key], 0);
  const w = workers(s);
  const employ = w === 0 ? 1 : Math.min(1, jobs(s) / w);
  const pretty = Math.min(0.08, (appeal(s) / Math.max(30, s.pop)) * 0.2);
  return Math.max(0, Math.min(1, needs + 0.18 * employ + pretty));
}

export function monthReport(s: State): Month {
  const b = boosts(s);
  const st = staffing(s);
  const cov = coverage(s);
  let income = 0;
  for (const d of done(s)) {
    const staffed = d.jobs ? st : 1;
    if (d.kind === 'shop') {
      // 同じ必要を満たす店が多すぎると、1 軒あたりの客が減る
      const need = (Object.keys(d.serve)[0] ?? 'goods') as Need;
      const cap = capacity(s, need);
      const share = cap === 0 ? 0 : Math.min(1, s.pop / cap);
      income += d.income * staffed * share * (cov[need] > 0 ? 1 : 0);
    } else if (d.kind === 'industry') income += d.income * staffed * (1 + b.industry);
    else if (d.kind === 'tourism') income += d.income * staffed * Math.min(1, appeal(s) / 30) * (1 + b.tourism);
  }
  const employed = Math.min(workers(s), jobs(s));
  const rate = POLICIES.reduce((r, p) => (s.policies.includes(p.id) && p.taxRate ? r * p.taxRate : r), 1);
  const tax = (employed * TAX_PER_WORKER + s.pop * TAX_PER_RESIDENT) * (1 + b.tax) * rate;
  const upkeep = done(s).reduce((t, d) => t + d.upkeep, 0) + POLICIES.reduce((t, p) => t + (s.policies.includes(p.id) ? p.cost : 0), 0);
  return { income: Math.round(income), tax: Math.round(tax), upkeep, moved: 0 };
}

/** 1 日進める。工事が終わった建物を返す。月の終わりには暮らしとお金を計算する */
export function togglePolicy(s: State, id: string): boolean {
  const k = s.policies.indexOf(id);
  if (k >= 0) s.policies.splice(k, 1);
  else s.policies.push(id);
  return k < 0;
}

/** この月の終わりが選挙か */
export const electionDue = (day: number) => day > 0 && day % (ELECTION.everyMonths * DAYS_PER_MONTH) === 0;

export function step(s: State): { finished: Building[]; month: Month | null; election: { won: boolean; approval: number } | null } {
  s.day++;
  const finished: Building[] = [];
  for (const b of s.buildings) {
    if (b.left > 0) {
      b.left--;
      if (b.left === 0) finished.push(b);
    }
  }
  let month: Month | null = null;
  let election: { won: boolean; approval: number } | null = null;
  if (s.day % DAYS_PER_MONTH === 0) {
    month = endMonth(s);
    if (electionDue(s.day)) {
      election = { won: s.approval >= ELECTION.pass, approval: s.approval };
      s.elections.push({ day: s.day, ...election });
    }
  }
  return { finished, month, election };
}

export function endMonth(s: State): Month {
  const m = monthReport(s);
  s.money += m.income + m.tax - m.upkeep;
  const h = happiness(s);
  const b = boosts(s);
  const target = Math.max(0, Math.min(100, h * 100 + b.approval));
  s.approval = Math.round(s.approval * 0.6 + target * 0.4);
  const room = homes(s) - s.pop;
  let moved = 0;
  // 満足していれば空き家の 4 割ほどが埋まる。不満が強いと 5% が出ていく
  if (h >= 0.4 && room > 0) moved = Math.min(room, Math.max(3, Math.round(room * (0.25 + (h - 0.4))) + b.immigration + Math.round(appeal(s) * 0.2)));
  else if (h < 0.3 && s.pop > 0) moved = -Math.ceil(s.pop * 0.05);
  s.pop = Math.max(0, Math.min(homes(s), s.pop + moved));
  m.moved = moved;
  s.last = m;
  return m;
}

export const MILESTONES = [20, 50, 100, 150, 200, 300, 400, 500, 600, 800, GOAL.pop];

/** まだ祝っていない、届いた節目 */
export function newMilestones(s: State): number[] {
  const hit = MILESTONES.filter((m) => s.pop >= m && !s.reached.includes(m));
  s.reached.push(...hit);
  return hit;
}

export const won = (s: State) => s.pop >= GOAL.pop && s.approval >= GOAL.approval;

export const date = (day: number) => ({ year: 1 + Math.floor(day / 360), month: 1 + Math.floor((day % 360) / DAYS_PER_MONTH), day: 1 + (day % DAYS_PER_MONTH) });

// ---------------------------------------------------------------- セーブ

export function serialize(s: State): string {
  const { ground: _g, ...rest } = s;
  return JSON.stringify(rest);
}

export function deserialize(json: string): State | null {
  try {
    const o = JSON.parse(json) as Omit<State, 'ground'>;
    if (o.v !== 1 || !Array.isArray(o.buildings)) return null;
    const buildings = o.buildings.filter((b) => DEF[b.id]);
    return { ...o, policies: o.policies ?? [], elections: o.elections ?? [], buildings, ground: makeIsland(o.seed, o.n) };
  } catch {
    return null;
  }
}
