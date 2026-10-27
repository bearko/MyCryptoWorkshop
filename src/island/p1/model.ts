/**
 * フェーズ 1 の中身（画面に依存しない。tests/island-p1.test.ts）。
 * 1 日ごとに：工事 → 従業員（休む・働く）→ クラフト → 運搬 → 陳列と販売。月末に報告とランキング。
 */
import { heroById } from '../../game/catalog';
import { DEF } from '../defs';
import { cells, type Dir } from '../sim';
import {
  ENTRY_AFTER,
  HIRE_POOL,
  MATS,
  P1B,
  PRODUCT,
  PRODUCTS,
  RIVAL_GROWTH,
  RIVALS,
  SHOP,
  SKILL,
  STAMINA,
  START_MATS,
  START_STAFF,
  TRANSPORT,
  UNCOMMON,
  WAGE_PER_STAT,
  aptitude,
  sku,
  skuParts,
  skuPrice,
  speedOf,
  type Mat,
  type Rar,
  type Sku,
  type Stats,
  type Task,
} from './data';

export type Ground = 'grass' | 'road';
export type Owner = 'me' | 'town' | string;

export interface PBuilding {
  uid: number;
  id: string;
  i: number;
  j: number;
  dir: Dir;
  left: number;
  owner: Owner;
}

export interface Staff {
  hero: number;
  stats: Stats;
  stamina: number;
  task: Task | null;
  /** 製造は作業台の番号、販売はお店の uid、開拓は素材 */
  target: number | Mat | null;
  resting: boolean;
  /** 月給（最初の 3 人は 0） */
  wage: number;
  /** 開拓の進み（日） */
  explore: number;
}

export interface Slot {
  sku: Sku | null;
  worker: number | null;
  progress: number;
  running: boolean;
  repeat: boolean;
}

export interface ShopState {
  uid: number;
  /** 棚ごとの商品。0 番が主力商品 */
  shelves: (Sku | null)[];
  staff: number | null;
  part: number;
  storage: Partial<Record<Sku, number>>;
  shelf: Partial<Record<Sku, number>>;
  /** 品切れが続くと下がる満足度（0.5〜1） */
  sat: number;
  carry: Partial<Record<Sku, number>>;
  /** 今月の売上 */
  rev: number;
}

export interface Trip {
  hauler: number;
  to: number;
  cargo: Partial<Record<Sku, number>>;
  left: number;
  total: number;
}

export interface RivalState {
  id: string;
  sells: Partial<Record<string, number>>;
  base: number;
}

export interface Rank {
  name: string;
  sales: number;
  me: boolean;
}

export interface Report {
  month: number;
  revenue: number;
  bySeries: Partial<Record<string, number>>;
  costs: { materials: number; wages: number; part: number; upkeep: number; build: number };
  profit: number;
  area: Rank[];
  rank: number;
  news: string[];
}

export interface Flags {
  /** 市場データを開いた */
  data: boolean;
  /** 最初の月の報告のあとのランキングの紹介を見た */
  ranking: boolean;
  /** クリアのお祝いを見た */
  clearSeen: boolean;
}

export interface P1State {
  v: 1;
  kind: 'p1';
  seed: number;
  n: number;
  ground: Ground[];
  day: number;
  /** 最初のお店が開いた日。月の締めはここから 30 日ごと（準備期間は数えない） */
  open: number | null;
  money: number;
  buildings: PBuilding[];
  nextUid: number;
  mats: Partial<Record<Mat, number>>;
  routes: Mat[];
  staff: Staff[];
  slots: Slot[];
  stock: Partial<Record<Sku, number>>;
  shops: Record<number, ShopState>;
  trips: Trip[];
  skills: string[];
  rivals: RivalState[];
  demand: Partial<Record<string, number>>;
  /** 今月の売上（シリーズごと）・ライバルの売上・費用 */
  monthSales: Partial<Record<string, number>>;
  rivalSales: Record<string, number>;
  monthCost: Report['costs'];
  /** 自社だけが売っている月の数（ライバルが参入する目安） */
  alone: Partial<Record<string, number>>;
  reports: Report[];
  hirePool: number[];
  cleared: boolean;
  flags: Flags;
}

export const START_MONEY = 30000;
export const DAYS = 30;
export const N = 16;
const ROAD_LINES = [2, 7, 12];

// ---------------------------------------------------------------- 乱数と地図

export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let x = a;
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

export const ground = (s: P1State, i: number, j: number): Ground | null => (i < 0 || j < 0 || i >= s.n || j >= s.n ? null : s.ground[j * s.n + i]);
export const isRoad = (s: P1State, i: number, j: number) => ground(s, i, j) === 'road';

/** 入口の向き → 前のマスへのずれ */
export const FRONT: Record<Dir, [number, number]> = { rd: [1, 0], ld: [0, 1], lu: [-1, 0], ru: [0, -1] };

export function occupant(s: P1State, i: number, j: number): PBuilding | null {
  for (const b of s.buildings) if (cells(DEF[b.id], b.i, b.j, b.dir).some(([x, y]) => x === i && y === j)) return b;
  return null;
}

/** 入口の前のマス（建物のマスを除く） */
export function frontCells(id: string, i: number, j: number, dir: Dir): [number, number][] {
  const cs = cells(DEF[id], i, j, dir);
  const [dx, dy] = FRONT[dir];
  return cs.map(([x, y]) => [x + dx, y + dy] as [number, number]).filter(([x, y]) => !cs.some(([p, q]) => p === x && q === y));
}

export const facesRoad = (s: P1State, id: string, i: number, j: number, dir: Dir) => frontCells(id, i, j, dir).some(([x, y]) => isRoad(s, x, y));

function lotFree(s: P1State, id: string, i: number, j: number, dir: Dir) {
  return cells(DEF[id], i, j, dir).every(([x, y]) => ground(s, x, y) === 'grass' && !occupant(s, x, y));
}

/** 区画：道路が縦横 3 本ずつ。住宅・駅・公園・他社の店が建っている */
export function newP1(seed = Math.floor(Math.random() * 1e9)): P1State {
  const n = N;
  const g: Ground[] = [];
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) g.push(ROAD_LINES.includes(i) || ROAD_LINES.includes(j) ? 'road' : 'grass');
  const s: P1State = {
    v: 1,
    kind: 'p1',
    seed,
    n,
    ground: g,
    day: 0,
    open: null,
    money: START_MONEY,
    buildings: [],
    nextUid: 1,
    mats: { ...START_MATS },
    routes: (Object.keys(MATS) as Mat[]).filter((m) => MATS[m].open),
    staff: START_STAFF.map((id) => newStaff(id, 0)),
    slots: [],
    stock: {},
    shops: {},
    trips: [],
    skills: [],
    rivals: RIVALS.map((r) => ({ id: r.id, sells: { ...r.sells }, base: r.base })),
    demand: Object.fromEntries(PRODUCTS.map((p) => [p.key, p.demand])),
    monthSales: {},
    rivalSales: Object.fromEntries(RIVALS.map((r) => [r.id, 0])),
    monthCost: { materials: 0, wages: 0, part: 0, upkeep: 0, build: 0 },
    alone: {},
    reports: [],
    hirePool: [],
    cleared: false,
    flags: { data: false, ranking: false, clearSeen: false },
  };
  populate(s);
  s.hirePool = pickHires(s);
  return s;
}

function put(s: P1State, id: string, i: number, j: number, dir: Dir, owner: Owner) {
  s.buildings.push({ uid: s.nextUid++, id, i, j, dir, left: 0, owner });
}

/** 道路に面した空き地を探して、入口を道路に向けて置く */
function placeTown(s: P1State, id: string, r: () => number, owner: Owner, near?: [number, number]): boolean {
  const spots: [number, number, Dir][] = [];
  for (let j = 0; j < s.n; j++)
    for (let i = 0; i < s.n; i++)
      for (const dir of ['rd', 'ld', 'lu', 'ru'] as Dir[]) if (lotFree(s, id, i, j, dir) && facesRoad(s, id, i, j, dir)) spots.push([i, j, dir]);
  if (!spots.length) return false;
  if (near) spots.sort((a, b) => Math.abs(a[0] - near[0]) + Math.abs(a[1] - near[1]) - (Math.abs(b[0] - near[0]) + Math.abs(b[1] - near[1])));
  const pick = near ? spots[0] : spots[Math.floor(r() * spots.length)];
  put(s, id, pick[0], pick[1], pick[2], owner);
  return true;
}

function populate(s: P1State) {
  const r = rng(s.seed);
  placeTown(s, 'station', r, 'town', [7, 1]);
  placeTown(s, 'park', r, 'town', [9, 9]);
  placeTown(s, 'police', r, 'town', [13, 4]);
  const near: [number, number][] = [[4, 4], [10, 5], [5, 10], [10, 10]];
  RIVALS.forEach((rv, k) => placeTown(s, rv.store, r, rv.id, near[k]));
  const homes = ['house', 'cottage', 'garage_house', 'japanese_house', 'apartment', 'manor'];
  // 住宅：外側の区画を中心に、空き地を 4 割ほど残す
  for (let k = 0; k < 46; k++) placeTown(s, homes[Math.floor(r() * homes.length)], r, 'town');
}

// ---------------------------------------------------------------- 従業員

export function heroStats(id: number): Stats {
  const h = heroById.get(id) as unknown as { stats?: Stats } | undefined;
  return h?.stats ?? { hp: 150, phy: 50, int: 50, agi: 50 };
}

function newStaff(hero: number, wage: number): Staff {
  const stats = heroStats(hero);
  return { hero, stats, stamina: stats.hp, task: null, target: null, resting: false, wage, explore: 0 };
}

export const wageOf = (hero: number) => {
  const s = heroStats(hero);
  return Math.round((s.phy + s.int + s.agi) * WAGE_PER_STAT);
};

function pickHires(s: P1State): number[] {
  const r = rng(s.seed + s.reports.length * 7919);
  const pool = HIRE_POOL.filter((id) => heroById.has(id) && !s.staff.some((x) => x.hero === id));
  const out: number[] = [];
  while (out.length < 3 && pool.length) out.push(pool.splice(Math.floor(r() * pool.length), 1)[0]);
  return out;
}

export const has = (s: P1State, skill: string) => s.skills.includes(skill);
export const staffOf = (s: P1State, hero: number) => s.staff.find((x) => x.hero === hero) ?? null;
export const speed = (st: Staff, task: Task) => speedOf(aptitude(st.stats, task));

/** 仕事を割り当てる。前の仕事からは外れる */
export function assign(s: P1State, hero: number, task: Task | null, target: number | Mat | null = null): string | null {
  const st = staffOf(s, hero);
  if (!st) return 'no-staff';
  unassign(s, st);
  if (task === 'craft') {
    const slot = s.slots[target as number];
    if (!slot) return 'no-slot';
    if (slot.worker != null) {
      const prev = staffOf(s, slot.worker);
      if (prev) unassign(s, prev);
    }
    slot.worker = hero;
  } else if (task === 'shop') {
    const shop = s.shops[target as number];
    if (!shop) return 'no-shop';
    if (shop.staff != null) {
      const prev = staffOf(s, shop.staff);
      if (prev) unassign(s, prev);
    }
    shop.staff = hero;
  } else if (task === 'explore') {
    const m = target as Mat;
    if (!MATS[m] || s.routes.includes(m)) return 'no-route';
    st.explore = 0;
  }
  st.task = task;
  st.target = target;
  return null;
}

function unassign(s: P1State, st: Staff) {
  for (const sl of s.slots) if (sl.worker === st.hero) sl.worker = null;
  for (const sh of Object.values(s.shops)) if (sh.staff === st.hero) sh.staff = null;
  st.task = null;
  st.target = null;
}

export function hire(s: P1State, hero: number): string | null {
  if (!has(s, 'hire')) return 'locked';
  if (!s.hirePool.includes(hero)) return 'gone';
  s.staff.push(newStaff(hero, wageOf(hero)));
  s.hirePool = s.hirePool.filter((x) => x !== hero);
  return null;
}

export function setRest(s: P1State, hero: number, rest: boolean) {
  const st = staffOf(s, hero);
  if (st) st.resting = rest;
}

// ---------------------------------------------------------------- 建てる

export type PlaceErr = 'ground' | 'taken' | 'road' | 'money' | 'locked' | 'soon' | 'limit';

/** 入口が道路に向く向きだけ */
export function allowedDirs(s: P1State, id: string, i: number, j: number): Dir[] {
  return (['rd', 'ld', 'lu', 'ru'] as Dir[]).filter((d) => facesRoad(s, id, i, j, d) && lotFree(s, id, i, j, d));
}

export function canBuild(s: P1State, id: string): PlaceErr | null {
  const b = P1B[id];
  if (!b) return 'locked';
  if (b.soon) return 'soon';
  if (b.requires && !has(s, b.requires)) return 'locked';
  if (b.kind === 'workshop' && s.buildings.some((x) => x.owner === 'me' && x.id === 'workshop')) return 'limit';
  if (b.kind === 'shop' && !s.buildings.some((x) => x.owner === 'me' && x.id === 'workshop')) return 'locked';
  if (s.money < b.cost) return 'money';
  return null;
}

export function canPlaceAt(s: P1State, id: string, i: number, j: number, dir: Dir): PlaceErr | null {
  const e = canBuild(s, id);
  if (e) return e;
  const cs = cells(DEF[id], i, j, dir);
  if (cs.some(([x, y]) => ground(s, x, y) !== 'grass')) return 'ground';
  if (cs.some(([x, y]) => occupant(s, x, y))) return 'taken';
  if (!facesRoad(s, id, i, j, dir)) return 'road';
  return null;
}

export function build(s: P1State, id: string, i: number, j: number, dir: Dir): PBuilding | PlaceErr {
  const e = canPlaceAt(s, id, i, j, dir);
  if (e) return e;
  const b = P1B[id];
  s.money -= b.cost;
  s.monthCost.build += b.cost;
  const pb: PBuilding = { uid: s.nextUid++, id, i, j, dir, left: b.days, owner: 'me' };
  s.buildings.push(pb);
  return pb;
}

/** 向きを、入口が道路に向く次の向きへ */
export function turn(s: P1State, uid: number): boolean {
  const b = s.buildings.find((x) => x.uid === uid && x.owner === 'me');
  if (!b) return false;
  const order: Dir[] = ['rd', 'ld', 'lu', 'ru'];
  const others = s.buildings.filter((x) => x !== b);
  for (let k = 1; k < 4; k++) {
    const d = order[(order.indexOf(b.dir) + k) % 4];
    const cs = cells(DEF[b.id], b.i, b.j, d);
    const free = cs.every(([x, y]) => ground(s, x, y) === 'grass' && !others.some((o) => cells(DEF[o.id], o.i, o.j, o.dir).some(([p, q]) => p === x && q === y)));
    if (free && facesRoad(s, b.id, b.i, b.j, d)) {
      b.dir = d;
      return true;
    }
  }
  return false;
}

export const myWorkshop = (s: P1State) => s.buildings.find((b) => b.owner === 'me' && b.id === 'workshop' && b.left <= 0) ?? null;
export const myShops = (s: P1State) => s.buildings.filter((b) => b.owner === 'me' && P1B[b.id]?.kind === 'shop' && b.left <= 0);

const benchCount = (s: P1State) => 1 + (has(s, 'bench2') ? 1 : 0) + (has(s, 'bench3') ? 1 : 0);
export const shelfCount = (s: P1State, id: string) => (P1B[id]?.shelves ?? 1) + (has(s, 'shelf1') ? 1 : 0) + (has(s, 'shelf2') ? 1 : 0);
export const partMax = (s: P1State) => SHOP.partTimeMax + (has(s, 'parttime') ? 2 : 0);

function syncSlots(s: P1State) {
  while (myWorkshop(s) && s.slots.length < benchCount(s)) s.slots.push({ sku: null, worker: null, progress: 0, running: false, repeat: true });
}
function syncShop(s: P1State, b: PBuilding) {
  const sh = (s.shops[b.uid] ??= { uid: b.uid, shelves: [], staff: null, part: 0, storage: {}, shelf: {}, sat: 1, carry: {}, rev: 0 });
  while (sh.shelves.length < shelfCount(s, b.id)) sh.shelves.push(null);
}

// ---------------------------------------------------------------- 調達

export const matPrice = (s: P1State, m: Mat) => Math.round(MATS[m].price * (has(s, 'bulk') ? 0.85 : 1));

export function buy(s: P1State, m: Mat, qty: number): string | null {
  if (!s.routes.includes(m)) return 'route';
  const cost = matPrice(s, m) * qty;
  if (cost > s.money) return 'money';
  s.money -= cost;
  s.monthCost.materials += cost;
  s.mats[m] = (s.mats[m] ?? 0) + qty;
  return null;
}

// ---------------------------------------------------------------- スキル

export function learn(s: P1State, id: string): string | null {
  const k = SKILL[id];
  if (!k || has(s, id)) return 'done';
  if (k.requires?.some((r) => !has(s, r))) return 'requires';
  if (s.money < k.cost) return 'money';
  s.money -= k.cost;
  s.monthCost.build += k.cost;
  s.skills.push(id);
  if (id.startsWith('route_')) {
    const m = id.slice(6) as Mat;
    if (!s.routes.includes(m)) s.routes.push(m);
  }
  syncSlots(s);
  for (const b of myShops(s)) syncShop(s, b);
  return null;
}

// ---------------------------------------------------------------- クラフト

export const recipeOf = (x: Sku) => {
  const [k, r] = skuParts(x);
  return PRODUCT[k].recipe[r];
};

/** その職人で作れるか（レアリティ・材料・設備） */
export function craftCheck(s: P1State, x: Sku, worker: number | null): string | null {
  const [, r] = skuParts(x);
  if (r === 'U') {
    if (!has(s, 'pot')) return 'pot';
    const st = worker != null ? staffOf(s, worker) : null;
    if (!st || aptitude(st.stats, 'craft') < UNCOMMON.minCraft) return 'skill';
  }
  for (const [m, q] of Object.entries(recipeOf(x))) if ((s.mats[m as Mat] ?? 0) < (q ?? 0)) return 'mats';
  return null;
}

function consume(s: P1State, x: Sku) {
  for (const [m, q] of Object.entries(recipeOf(x))) s.mats[m as Mat] = (s.mats[m as Mat] ?? 0) - (q ?? 0);
}

export function startCraft(s: P1State, slot: number, x: Sku, repeat = true): string | null {
  const sl = s.slots[slot];
  if (!sl) return 'no-slot';
  if (sl.running) return 'busy';
  if (sl.worker == null) return 'worker';
  const e = craftCheck(s, x, sl.worker);
  if (e) return e;
  consume(s, x);
  sl.sku = x;
  sl.progress = 0;
  sl.running = true;
  sl.repeat = repeat;
  return null;
}

export const batchOf = (x: Sku) => {
  const [k, r] = skuParts(x);
  return r === 'U' ? Math.ceil(PRODUCT[k].batch / 2) : PRODUCT[k].batch;
};

export const craftDays = (s: P1State, x: Sku) => PRODUCT[skuParts(x)[0]].days * (has(s, 'jig') ? 0.8 : 1) * (has(s, 'bench3') ? 0.8 : 1);

// ---------------------------------------------------------------- お店

export function setShelf(s: P1State, uid: number, idx: number, x: Sku | null): boolean {
  const sh = s.shops[uid];
  if (!sh || idx >= sh.shelves.length) return false;
  sh.shelves[idx] = x;
  return true;
}

export function setPart(s: P1State, uid: number, n: number): boolean {
  const sh = s.shops[uid];
  if (!sh) return false;
  sh.part = Math.max(0, Math.min(partMax(s), n));
  return true;
}

/** お店の売り場での強さ（商品ごと） */
function pull(s: P1State, b: PBuilding, sh: ShopState, x: Sku): number {
  const st = sh.staff != null ? staffOf(s, sh.staff) : null;
  const staffed = st && !st.resting ? 0.6 + 0.4 * speed(st, 'shop') : 0;
  const service = staffed + sh.part * 0.15;
  if (service <= 0) return 0;
  const [, r] = skuParts(x);
  return (P1B[b.id].pull ?? 1) * (has(s, 'host') ? 1.15 : 1) * service * sh.sat * (r === 'U' ? UNCOMMON.pull : 1);
}

export const dist = (a: PBuilding, b: PBuilding) => Math.abs(a.i - b.i) + Math.abs(a.j - b.j);

// ---------------------------------------------------------------- 1 日

export interface DayResult {
  finished: PBuilding[];
  crafted: Sku[];
  delivered: { to: number; n: number }[];
  routes: Mat[];
  report: Report | null;
}

export function step(s: P1State): DayResult {
  s.day++;
  const res: DayResult = { finished: [], crafted: [], delivered: [], routes: [], report: null };

  // 工事
  for (const b of s.buildings) {
    if (b.owner === 'me' && b.left > 0) {
      b.left--;
      if (b.left === 0) {
        res.finished.push(b);
        if (b.id === 'workshop') syncSlots(s);
        if (P1B[b.id]?.kind === 'shop') {
          syncShop(s, b);
          if (s.open === null) {
            s.open = s.day;
            s.rivalSales = Object.fromEntries(s.rivals.map((r) => [r.id, 0]));
          }
        }
      }
    }
  }

  const ws = myWorkshop(s);
  const shops = myShops(s);
  const working = new Set<number>();

  // クラフト
  s.slots.forEach((sl) => {
    const st = sl.worker != null ? staffOf(s, sl.worker) : null;
    if (!sl.running && sl.repeat && sl.sku && st && !st.resting && !craftCheck(s, sl.sku, sl.worker)) {
      consume(s, sl.sku);
      sl.running = true;
      sl.progress = 0;
    }
    if (!sl.running || !sl.sku || !st || st.resting) return;
    working.add(st.hero);
    sl.progress += speed(st, 'craft');
    if (sl.progress >= craftDays(s, sl.sku)) {
      s.stock[sl.sku] = (s.stock[sl.sku] ?? 0) + batchOf(sl.sku);
      res.crafted.push(sl.sku);
      sl.running = false;
      sl.progress = 0;
    }
  });

  // 運搬：運搬係ごとに、荷車の数まで便を出す
  if (ws) {
    for (const st of s.staff) {
      if (st.task !== 'transport' || st.resting) continue;
      const mine = s.trips.filter((t) => t.hauler === st.hero);
      if (mine.length) working.add(st.hero);
      const carts = has(s, 'cart2') ? 2 : 1;
      if (mine.length >= carts) continue;
      const cap = Math.round(TRANSPORT.cap * (has(s, 'truck') ? 2.5 : 1));
      for (const shop of shops) {
        if (s.trips.filter((t) => t.hauler === st.hero).length >= carts) break;
        const sh = s.shops[shop.uid];
        if (s.trips.some((t) => t.to === shop.uid && t.hauler === st.hero)) continue;
        const cargo: Partial<Record<Sku, number>> = {};
        let load = 0;
        const inbound = (x: Sku) => s.trips.filter((t) => t.to === shop.uid).reduce((a, t) => a + (t.cargo[x] ?? 0), 0);
        for (const x of sh.shelves) {
          if (!x || load >= cap) continue;
          const room = SHOP.storageCap - (sh.storage[x] ?? 0) - inbound(x);
          const want = Math.min(room, s.stock[x] ?? 0, cap - load);
          if (want <= 0 || (sh.storage[x] ?? 0) + inbound(x) > SHOP.storageCap / 2) continue;
          cargo[x] = want;
          s.stock[x] = (s.stock[x] ?? 0) - want;
          load += want;
        }
        if (load > 0) {
          const days = Math.max(1, (dist(ws, shop) / (TRANSPORT.cellsPerDay * (has(s, 'truck') ? 1.5 : 1))) * (has(s, 'hub') ? 0.7 : 1) * 2) / speed(st, 'transport');
          s.trips.push({ hauler: st.hero, to: shop.uid, cargo, left: days, total: days });
          working.add(st.hero);
        }
      }
    }
  }
  for (const t of s.trips) t.left -= 1;
  for (const t of s.trips.filter((x) => x.left <= 0)) {
    const sh = s.shops[t.to];
    let n = 0;
    for (const [x, q] of Object.entries(t.cargo)) {
      if (sh) sh.storage[x as Sku] = (sh.storage[x as Sku] ?? 0) + (q ?? 0);
      else s.stock[x as Sku] = (s.stock[x as Sku] ?? 0) + (q ?? 0);
      n += q ?? 0;
    }
    res.delivered.push({ to: t.to, n });
  }
  s.trips = s.trips.filter((t) => t.left > 0);

  // 開拓
  for (const st of s.staff) {
    if (st.task !== 'explore' || st.resting || typeof st.target !== 'string') continue;
    working.add(st.hero);
    st.explore += speed(st, 'explore');
    const m = st.target as Mat;
    if (st.explore >= MATS[m].exploreDays) {
      if (!s.routes.includes(m)) s.routes.push(m);
      res.routes.push(m);
      st.task = null;
      st.target = null;
      st.explore = 0;
    }
  }

  // 陳列と販売
  for (const b of shops) {
    const sh = s.shops[b.uid];
    const st = sh.staff != null ? staffOf(s, sh.staff) : null;
    if (st && !st.resting) working.add(st.hero);
    let cap = (st && !st.resting ? SHOP.displayPerDay * speed(st, 'shop') : 0) + sh.part * SHOP.partTimeDisplay;
    for (const x of sh.shelves) {
      if (!x || cap <= 0) continue;
      const move = Math.min(Math.floor(cap), sh.storage[x] ?? 0, SHOP.shelfCap - (sh.shelf[x] ?? 0));
      if (move > 0) {
        sh.storage[x] = (sh.storage[x] ?? 0) - move;
        sh.shelf[x] = (sh.shelf[x] ?? 0) + move;
        cap -= move;
      }
    }
    const open = (st && !st.resting) || sh.part > 0;
    const empty = sh.shelves.some((x) => x && (sh.shelf[x] ?? 0) <= 0);
    if (open) sh.sat = empty ? Math.max(0.5, sh.sat - 0.01) : Math.min(1, sh.sat + 0.02);
    s.monthCost.part += sh.part * SHOP.partTimeWage;
    s.money -= sh.part * SHOP.partTimeWage;
  }
  for (const p of PRODUCTS) {
    const daily = (s.demand[p.key] ?? 0) / DAYS;
    const offers: { b: PBuilding; sh: ShopState; x: Sku; w: number }[] = [];
    for (const b of shops) {
      const sh = s.shops[b.uid];
      for (const x of sh.shelves) {
        if (!x || skuParts(x)[0] !== p.key) continue;
        const w = (sh.shelf[x] ?? 0) > 0 ? pull(s, b, sh, x) : 0;
        if (w > 0) offers.push({ b, sh, x, w });
      }
    }
    const mine = offers.reduce((a, o) => a + o.w, 0);
    const rivals = s.rivals.reduce((a, r) => a + (r.sells[p.key] ?? 0), 0);
    const total = mine + rivals;
    if (total <= 0) continue;
    for (const o of offers) {
      const want = (daily * o.w) / total + (o.sh.carry[o.x] ?? 0);
      const sold = Math.min(Math.floor(want), o.sh.shelf[o.x] ?? 0);
      o.sh.carry[o.x] = Math.min(1, want - sold);
      o.sh.shelf[o.x] = (o.sh.shelf[o.x] ?? 0) - sold;
      const yen = sold * skuPrice(o.x);
      s.money += yen;
      s.monthSales[p.key] = (s.monthSales[p.key] ?? 0) + yen;
      o.sh.rev += yen;
    }
    for (const r of s.rivals) if (r.sells[p.key]) s.rivalSales[r.id] += ((daily * (r.sells[p.key] ?? 0)) / total) * p.price;
  }

  // スタミナ
  const restRate = STAMINA.rest * (has(s, 'lounge') ? 1.5 : 1);
  for (const st of s.staff) {
    if (st.resting) {
      st.stamina = Math.min(st.stats.hp, st.stamina + restRate);
      if (st.stamina >= st.stats.hp * STAMINA.back) st.resting = false;
    } else if (working.has(st.hero)) {
      st.stamina = Math.max(0, st.stamina - STAMINA.work);
      if (st.stamina <= st.stats.hp * STAMINA.tired) st.resting = true;
    } else st.stamina = Math.min(st.stats.hp, st.stamina + restRate / 2);
  }

  if (s.open !== null && s.day > s.open && (s.day - s.open) % DAYS === 0) res.report = endMonth(s);
  return res;
}

// ---------------------------------------------------------------- 月末

export function areaRanking(s: P1State, mine: number, rivals: Record<string, number>): Rank[] {
  const rows: Rank[] = s.rivals.map((r) => ({ name: RIVALS.find((x) => x.id === r.id)?.name ?? r.id, sales: Math.round(rivals[r.id]), me: false }));
  rows.push({ name: '', sales: Math.round(mine), me: true });
  return rows.sort((a, b) => b.sales - a.sales);
}

export function endMonth(s: P1State): Report {
  const month = Math.round((s.day - (s.open ?? 0)) / DAYS);
  const news: string[] = [];
  const upkeep = s.buildings.filter((b) => b.owner === 'me' && b.left <= 0).reduce((a, b) => a + (P1B[b.id]?.upkeep ?? 0), 0);
  const wages = s.staff.reduce((a, st) => a + st.wage, 0);
  s.money -= upkeep + wages;
  s.monthCost.upkeep += upkeep;
  s.monthCost.wages += wages;
  const revenue = Object.values(s.monthSales).reduce<number>((a, v) => a + (v ?? 0), 0);
  const rivals: Record<string, number> = {};
  for (const r of s.rivals) rivals[r.id] = r.base + (s.rivalSales[r.id] ?? 0);
  const area = areaRanking(s, revenue, rivals);
  const rank = area.findIndex((x) => x.me) + 1;
  const costs = { ...s.monthCost };
  const report: Report = { month, revenue: Math.round(revenue), bySeries: { ...s.monthSales }, costs, profit: Math.round(revenue - Object.values(costs).reduce<number>((a, v) => a + v, 0)), area, rank, news };

  // 自社だけが売っている商品には、しばらくすると他社が参入する
  for (const p of PRODUCTS) {
    const sold = (s.monthSales[p.key] ?? 0) > 0;
    const others = s.rivals.some((r) => (r.sells[p.key] ?? 0) > 0);
    s.alone[p.key] = sold && !others ? (s.alone[p.key] ?? 0) + 1 : 0;
    if ((s.alone[p.key] ?? 0) >= ENTRY_AFTER) {
      const weakest = [...s.rivals].sort((a, b) => rivals[a.id] - rivals[b.id])[0];
      weakest.sells[p.key] = 0.8;
      s.alone[p.key] = 0;
      const name = RIVALS.find((x) => x.id === weakest.id)?.name ?? '';
      news.push(`${name}|${p.name}`);
    }
  }
  // 他社は少しずつ強くなり、需要も伸びる
  for (const r of s.rivals) {
    r.base *= 1 + RIVAL_GROWTH;
    for (const k of Object.keys(r.sells)) r.sells[k] = (r.sells[k] ?? 0) * (1 + RIVAL_GROWTH);
  }
  for (const k of Object.keys(s.demand)) s.demand[k] = (s.demand[k] ?? 0) * 1.015;

  if (rank === 1 && revenue > 0) s.cleared = true;
  s.reports.push(report);
  s.monthSales = {};
  for (const sh of Object.values(s.shops)) sh.rev = 0;
  s.rivalSales = Object.fromEntries(s.rivals.map((r) => [r.id, 0]));
  s.monthCost = { materials: 0, wages: 0, part: 0, upkeep: 0, build: 0 };
  s.hirePool = pickHires(s);
  return report;
}

/** 営業カレンダー（開店日が 1 年目 1 月 1 日）。開店前は null */
export function date(s: Pick<P1State, 'day' | 'open'>) {
  if (s.open === null) return null;
  const d = s.day - s.open;
  return { year: 1 + Math.floor(d / 360), month: 1 + Math.floor((d % 360) / DAYS), day: 1 + (d % DAYS) };
}
/** 次の締めまでの日数 */
export const daysToClose = (s: Pick<P1State, 'day' | 'open'>) => (s.open === null ? DAYS : DAYS - ((s.day - s.open) % DAYS));

/** 今月これまでの売上 */
export const monthRevenue = (s: P1State) => Object.values(s.monthSales).reduce<number>((a, v) => a + (v ?? 0), 0);

/** 市場データ：商品ごとの需要・売っている会社・今の売れ行きの目安 */
export function market(s: P1State) {
  return PRODUCTS.map((p) => {
    const sellers = s.rivals.filter((r) => (r.sells[p.key] ?? 0) > 0);
    const strength = sellers.reduce((a, r) => a + (r.sells[p.key] ?? 0), 0);
    const mine = Object.values(s.shops).some((sh) => sh.shelves.some((x) => x && skuParts(x)[0] === p.key));
    return { p, demand: Math.round(s.demand[p.key] ?? 0), sellers: sellers.length, strength, mine, sold: Math.round((s.demand[p.key] ?? 0) * (strength > 0 ? 1 : 0)) };
  });
}

/** いちばんのおすすめ（需要が大きく、売っている会社が少ない） */
export function recommend(s: P1State): string {
  const rows = market(s).filter((r) => !r.mine);
  rows.sort((a, b) => b.demand / (1 + b.strength * 2) - a.demand / (1 + a.strength * 2));
  return (rows[0] ?? market(s)[0]).p.key;
}

export const skuOf = (key: string, r: Rar = 'C') => sku(key, r);

// ---------------------------------------------------------------- セーブ

export function serializeP1(s: P1State): string {
  const { ground: _g, ...rest } = s;
  return JSON.stringify(rest);
}

export function deserializeP1(json: string): P1State | null {
  try {
    const o = JSON.parse(json) as Omit<P1State, 'ground'>;
    if (o.v !== 1 || o.kind !== 'p1') return null;
    const g: Ground[] = [];
    for (let j = 0; j < o.n; j++) for (let i = 0; i < o.n; i++) g.push(ROAD_LINES.includes(i) || ROAD_LINES.includes(j) ? 'road' : 'grass');
    const open = o.open ?? (o.buildings.some((b) => b.owner === 'me' && b.left <= 0 && P1B[b.id]?.kind === 'shop') ? o.day - (o.day % DAYS) : null);
    return { ...o, open, ground: g };
  } catch {
    return null;
  }
}
