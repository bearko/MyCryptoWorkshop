/**
 * フェーズ 1 の中身（画面に依存しない。tests/island-p1.test.ts）。
 * 1 日ごとに：工事 → 従業員（休む・働く）→ クラフト → 運搬 → 陳列と販売。月末に報告とランキング。
 */
import { heroById } from '../../game/catalog';
import { DEF } from '../defs';
import { cells, type Dir } from '../sim';
import {
  ADS,
  AWARE,
  STORE,
  DEV,
  ENTRY_AFTER,
  PROC,
  procNeed,
  HIRE_POOL,
  INTEL,
  INVEST,
  MISSIONS,
  MOVE,
  PAY,
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
  /** 設備投資の段（自社の建物だけ） */
  inv?: Partial<Record<string, number>>;
}

export interface Staff {
  hero: number;
  stats: Stats;
  stamina: number;
  task: Task | null;
  /** 製造は作業台の番号、販売はお店の uid、開拓は素材、調査は他社の id */
  target: number | string | null;
  resting: boolean;
  /** 月給（最初の 3 人は 0） */
  wage: number;
  /** 開拓の進み（日） */
  explore: number;
  /** 昇給の段（作業が速くなる） */
  lv?: number;
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
  /** 今月の費用（売れた商品の素材代・アルバイト代。維持費は月末に足す） */
  cost: number;
  /** 先月の売上と費用 */
  last: { rev: number; cost: number } | null;
  /** 認知度（0.2〜1）。開店したてのお店は知られていないので売れにくい */
  aw?: number;
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
  costs: { materials: number; wages: number; part: number; upkeep: number; build: number; ads: number };
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
  /** 最初の 1 か月のチュートリアルの段（tut.ts。99 で終わり。以前のセーブには無い） */
  tut?: number;
  /** tut の段の並びの版（tut.ts の TUT_VERSION） */
  tutV?: number;
  /** アンコモンを開発した商品 */
  dev: string[];
  /** 開発中の商品 */
  lab: { key: string; left: number } | null;
  /** 宣伝の残り日数 */
  ads: Partial<Record<string, number>>;
  /** 他社の調査の進み（日） */
  intel: Partial<Record<string, number>>;
  /** 他社の今月の売上（商品ごと）と先月の結果 */
  rivalProd: Record<string, Partial<Record<string, number>>>;
  rivalLast: Record<string, { total: number; by: Partial<Record<string, number>> }>;
  /** 依頼：達成した・報酬を受け取った */
  /** 依頼：受けた（accepted）→ 達成（done）→ 報酬を受け取った（claimed）。無ければまだ受けていない */
  missions: Partial<Record<string, 'accepted' | 'done' | 'claimed'>>;
  /** 今月売れた数（商品ごと）・アンコモンを売った数（合計） */
  monthUnits: Partial<Record<string, number>>;
  unitsU: number;
  /** 工房：今月作った数と価値・先月の結果 */
  ws: { made: number; value: number; last: { made: number; value: number } | null; hauled?: number };
  /** 調達：ランク・今月買った数・作りたいエクステ・追加の素材・素材ごとの月の量（auto＝先月の消費に合わせる） */
  proc: Proc;
  /** 素材の消費（今月・先月） */
  matUsed: Partial<Record<Mat, number>>;
  matUsedLast: Partial<Record<Mat, number>> | null;
  /** 工房の稼働（作業台×日のうち、動いていた数）。今月と先月 */
  util: { work: number; cap: number };
  utilLast: { work: number; cap: number } | null;
  /** 調達係の買い付け：工房から卸問屋へ行って帰る（帰ると素材が届く） */
  buyTrip: BuyTrip | null;
  /** ゲームの進行速度（1・1.5・2。スキルで選べる） */
  pace?: number;
}

export interface BuyTrip {
  hero: number;
  left: number;
  total: number;
  cargo: Partial<Record<Mat, number>>;
}

export interface Proc {
  lv: number;
  exp: number;
  bought: number;
  /** 作りたいエクステ（空なら作業台で作っているもの） */
  items: Sku[];
  extra: Mat[];
  qty: Partial<Record<Mat, { n: number; auto: boolean }>>;
  carry: Partial<Record<Mat, number>>;
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

function lotFree(s: P1State, id: string, i: number, j: number, dir: Dir, ignore?: number) {
  return cells(DEF[id], i, j, dir).every(([x, y]) => {
    const o = ground(s, x, y) === 'grass' ? occupant(s, x, y) : undefined;
    return o !== undefined && (!o || o.uid === ignore);
  });
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
    monthCost: { materials: 0, wages: 0, part: 0, upkeep: 0, build: 0, ads: 0 },
    alone: {},
    reports: [],
    hirePool: [],
    cleared: false,
    flags: { data: false, ranking: false, clearSeen: false },
    tut: 0,
    tutV: 3,
    ...extras(),
  };
  populate(s);
  s.hirePool = pickHires(s);
  return s;
}

/** フェーズ 1 のあとから足した項目の初期値（古いセーブにも足す） */
function extras(): Pick<P1State, 'dev' | 'lab' | 'ads' | 'intel' | 'rivalProd' | 'rivalLast' | 'missions' | 'monthUnits' | 'unitsU' | 'ws' | 'proc' | 'matUsed' | 'matUsedLast' | 'util' | 'utilLast' | 'buyTrip'> {
  return {
    dev: [],
    lab: null,
    ads: {},
    intel: {},
    rivalProd: {},
    rivalLast: {},
    missions: {},
    monthUnits: {},
    unitsU: 0,
    ws: { made: 0, value: 0, last: null },
    proc: { lv: 1, exp: 0, bought: 0, items: [], extra: [], qty: {}, carry: {} },
    matUsed: {},
    matUsedLast: null,
    util: { work: 0, cap: 0 },
    utilLast: null,
    buyTrip: null,
  };
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
  placeTown(s, 'wholesale', r, 'town', [1, 14]);
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
export const speed = (st: Staff, task: Task) => speedOf(aptitude(st.stats, task)) * (1 + PAY.raiseSpeed * (st.lv ?? 0));

/** 仕事を割り当てる。前の仕事からは外れる */
export function assign(s: P1State, hero: number, task: Task | null, target: number | string | null = null): string | null {
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
  } else if (task === 'intel') {
    const r = target as string;
    if (!s.rivals.some((x) => x.id === r)) return 'no-rival';
    if (intelLv(s, r) >= INTEL.length) return 'done';
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
export function allowedDirs(s: P1State, id: string, i: number, j: number, ignore?: number): Dir[] {
  return (['rd', 'ld', 'lu', 'ru'] as Dir[]).filter((d) => facesRoad(s, id, i, j, d) && lotFree(s, id, i, j, d, ignore));
}

export function canBuild(s: P1State, id: string): PlaceErr | null {
  const b = P1B[id];
  if (!b) return 'locked';
  if (b.soon) return 'soon';
  if (b.requires && !has(s, b.requires)) return 'locked';
  if (b.kind === 'workshop' && s.buildings.some((x) => x.owner === 'me' && x.id === 'workshop')) return 'limit';
  if (b.kind !== 'workshop' && !s.buildings.some((x) => x.owner === 'me' && x.id === 'workshop')) return 'locked';
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

// ---------------------------------------------------------------- 移転・撤去・設備投資

export const moveCost = (b: PBuilding) => Math.max(MOVE.min, Math.round((P1B[b.id]?.cost ?? 0) * MOVE.rate));
export const moveDays = (b: PBuilding) => Math.max(1, Math.ceil((P1B[b.id]?.days ?? 2) * MOVE.days));
export const refundOf = (b: PBuilding) => Math.round((P1B[b.id]?.cost ?? 0) * MOVE.refund);

/** 移転先として置けるか（自分のいまのマスは空いているとみなす） */
export function canMoveTo(s: P1State, uid: number, i: number, j: number, dir: Dir): PlaceErr | null {
  const b = s.buildings.find((x) => x.uid === uid && x.owner === 'me');
  if (!b) return 'locked';
  if (b.left > 0) return 'locked';
  if (s.money < moveCost(b)) return 'money';
  const cs = cells(DEF[b.id], i, j, dir);
  if (cs.some(([x, y]) => ground(s, x, y) !== 'grass')) return 'ground';
  if (cs.some(([x, y]) => {
    const o = occupant(s, x, y);
    return o && o.uid !== uid;
  }))
    return 'taken';
  if (!facesRoad(s, b.id, i, j, dir)) return 'road';
  return null;
}

/** 移転：お金を払って、工期の半分だけ休業する。在庫や設備はそのまま */
export function relocate(s: P1State, uid: number, i: number, j: number, dir: Dir): PlaceErr | null {
  const e = canMoveTo(s, uid, i, j, dir);
  if (e) return e;
  const b = s.buildings.find((x) => x.uid === uid)!;
  const cost = moveCost(b);
  s.money -= cost;
  s.monthCost.build += cost;
  b.i = i;
  b.j = j;
  b.dir = dir;
  b.left = moveDays(b);
  return null;
}

/** 撤去：建てる値段の 3 割が戻る。お店の在庫は工房の倉庫へ。本店（工房）は撤去できない */
export function demolish(s: P1State, uid: number): string | null {
  const k = s.buildings.findIndex((x) => x.uid === uid && x.owner === 'me');
  if (k < 0) return 'locked';
  const b = s.buildings[k];
  if (b.id === 'workshop') return 'workshop';
  const sh = s.shops[uid];
  if (sh) {
    for (const src of [sh.storage, sh.shelf]) for (const [x, n] of Object.entries(src)) s.stock[x as Sku] = (s.stock[x as Sku] ?? 0) + (n ?? 0);
    if (sh.staff != null) {
      const st = staffOf(s, sh.staff);
      if (st) unassign(s, st);
    }
    delete s.shops[uid];
  }
  const back = refundOf(b);
  s.money += back;
  s.monthCost.build -= back;
  s.buildings.splice(k, 1);
  return null;
}

export const invLv = (b: PBuilding | null | undefined, id: string) => b?.inv?.[id] ?? 0;
/** 次の段の値段（もう上がらないときは null） */
export function investCost(b: PBuilding, id: string): number | null {
  const x = INVEST[id];
  if (!x) return null;
  return x.cost[invLv(b, id)] ?? null;
}
export function invest(s: P1State, uid: number, id: string): string | null {
  const b = s.buildings.find((x) => x.uid === uid && x.owner === 'me');
  const x = INVEST[id];
  if (!b || !x) return 'locked';
  const kind = P1B[b.id]?.kind;
  if (kind !== x.kind) return 'locked';
  const cost = investCost(b, id);
  if (cost == null) return 'max';
  if (s.money < cost) return 'money';
  s.money -= cost;
  s.monthCost.build += cost;
  b.inv = { ...b.inv, [id]: invLv(b, id) + 1 };
  return null;
}

export const storageCap = (b: PBuilding) => SHOP.storageCap + 20 * invLv(b, 'backroom');

// ---------------------------------------------------------------- 保管（工房の物置と倉庫）

export const myWarehouses = (s: P1State) => s.buildings.filter((b) => b.owner === 'me' && b.id === 'warehouse' && b.left <= 0);
/** 素材と、お店へ運ぶ前の商品を置ける数の合計 */
export const poolCap = (s: P1State) => STORE.base + STORE.warehouse * myWarehouses(s).length;
const sum = (o: Partial<Record<string, number>>) => Object.values(o).reduce<number>((a, n) => a + (n ?? 0), 0);
/** いま置いている数（買い付けて運んでいる素材も含む） */
export const poolUsed = (s: P1State) => sum(s.mats) + sum(s.stock) + (s.buyTrip ? sum(s.buyTrip.cargo) : 0);
export const poolFree = (s: P1State) => Math.max(0, poolCap(s) - poolUsed(s));

/** 区画の道路を通る道のり（入口の前のマスから入口の前のマスまで。見つからなければ null） */
export function roadPath(s: P1State, from: [number, number], to: [number, number]): [number, number][] | null {
  const key = (i: number, j: number) => j * s.n + i;
  const prev = new Map<number, number>();
  const q: [number, number][] = [from];
  prev.set(key(...from), -1);
  while (q.length) {
    const [i, j] = q.shift()!;
    if (i === to[0] && j === to[1]) {
      const out: [number, number][] = [];
      let k = key(i, j);
      while (k !== -1) {
        out.unshift([k % s.n, Math.floor(k / s.n)]);
        k = prev.get(k)!;
      }
      return out;
    }
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const ni = i + di;
      const nj = j + dj;
      if (!isRoad(s, ni, nj) || prev.has(key(ni, nj))) continue;
      prev.set(key(ni, nj), key(i, j));
      q.push([ni, nj]);
    }
  }
  return null;
}
/** 建物の入口の前の道路のマス */
export function doorOf(b: PBuilding): [number, number] {
  return frontCells(b.id, b.i, b.j, b.dir)[0] ?? [b.i, b.j];
}
export const wholesaler = (s: P1State) => s.buildings.find((b) => b.id === 'wholesale') ?? null;

export const myWorkshop = (s: P1State) => s.buildings.find((b) => b.owner === 'me' && b.id === 'workshop' && b.left <= 0) ?? null;
export const myShops = (s: P1State) => s.buildings.filter((b) => b.owner === 'me' && P1B[b.id]?.kind === 'shop' && b.left <= 0);

const benchCount = (s: P1State) => 1 + (has(s, 'bench2') ? 1 : 0) + (has(s, 'bench3') ? 1 : 0);
export const shelfCount = (s: P1State, id: string) => (P1B[id]?.shelves ?? 1) + (has(s, 'shelf1') ? 1 : 0) + (has(s, 'shelf2') ? 1 : 0);
export const partMax = (s: P1State) => SHOP.partTimeMax + (has(s, 'parttime') ? 2 : 0);

function syncSlots(s: P1State) {
  while (myWorkshop(s) && s.slots.length < benchCount(s)) s.slots.push({ sku: null, worker: null, progress: 0, running: false, repeat: true });
}
function syncShop(s: P1State, b: PBuilding) {
  const sh = (s.shops[b.uid] ??= { uid: b.uid, shelves: [], staff: null, part: 0, storage: {}, shelf: {}, sat: 1, carry: {}, rev: 0, cost: 0, last: null, aw: AWARE.start });
  while (sh.shelves.length < shelfCount(s, b.id)) sh.shelves.push(null);
}

// ---------------------------------------------------------------- 調達

export const matPrice = (s: P1State, m: Mat) => Math.round(MATS[m].price * (has(s, 'bulk') ? 0.85 : 1));

/** 月に買える素材の数の上限（ランクとスキル） */
export const procCap = (s: P1State) => Math.round((PROC.base + PROC.perLv * (s.proc.lv - 1)) * (1 + (has(s, 'stock1') ? 0.3 : 0) + (has(s, 'stock2') ? 0.6 : 0)));
export const procLeft = (s: P1State) => Math.max(0, procCap(s) - s.proc.bought);

/** 経験値を足して、ランクを上げる。上がったら新しいランクを返す */
function procExp(s: P1State, exp: number): number | null {
  const p = s.proc;
  const before = p.lv;
  p.exp += exp;
  while (p.lv < PROC.maxLv && p.exp >= procNeed(p.lv)) {
    p.exp -= procNeed(p.lv);
    p.lv++;
  }
  if (p.lv >= PROC.maxLv) p.exp = 0;
  return p.lv > before ? p.lv : null;
}

/** 素材を買う（手で買うときも、調達係が買うときも、月の上限の中で） */
export function buy(s: P1State, m: Mat, qty: number, gain = 1): string | null {
  if (!s.routes.includes(m)) return 'route';
  if (qty <= 0) return null;
  if (qty > procLeft(s)) return 'cap';
  if (qty > poolFree(s)) return 'storage';
  const cost = matPrice(s, m) * qty;
  if (cost > s.money) return 'money';
  s.money -= cost;
  s.monthCost.materials += cost;
  s.mats[m] = (s.mats[m] ?? 0) + qty;
  s.proc.bought += qty;
  procExp(s, qty * gain + PROC.perBuy);
  return null;
}

/** 作りたいエクステ（指定が無ければ、作業台で作っているもの） */
export const procItems = (s: P1State): Sku[] => (s.proc.items.length ? s.proc.items : [...new Set(s.slots.map((sl) => sl.sku).filter((x): x is Sku => !!x))]);

/** 買い付ける素材：作りたいエクステの素材と、追加で選んだ素材（ルートがあるものだけ） */
export function procMats(s: P1State): { m: Mat; from: 'item' | 'extra' }[] {
  const out: { m: Mat; from: 'item' | 'extra' }[] = [];
  for (const x of procItems(s)) for (const m of Object.keys(recipeOf(x)) as Mat[]) if (!out.some((o) => o.m === m)) out.push({ m, from: 'item' });
  for (const m of s.proc.extra) if (!out.some((o) => o.m === m)) out.push({ m, from: 'extra' });
  return out.filter((o) => s.routes.includes(o.m));
}

/** 工房が 100% 動いたときの月の素材の消費（作業台の設定と職人の速さ。作業台に無い作りたいエクステは速さ 1 の作業台 1 つぶん） */
export function fullUse(s: P1State): Partial<Record<Mat, number>> {
  const out: Partial<Record<Mat, number>> = {};
  const add = (x: Sku, sp: number) => {
    const batches = (DAYS * sp) / craftDays(s, x);
    for (const [m, q] of Object.entries(recipeOf(x))) out[m as Mat] = (out[m as Mat] ?? 0) + batches * (q ?? 0);
  };
  const made = new Set<Sku>();
  for (const sl of s.slots) {
    if (!sl.sku) continue;
    const st = sl.worker != null ? staffOf(s, sl.worker) : null;
    add(sl.sku, st ? speed(st, 'craft') : 1);
    made.add(sl.sku);
  }
  for (const x of s.proc.items) if (!made.has(x)) add(x, 1);
  for (const k of Object.keys(out)) out[k as Mat] = Math.ceil(out[k as Mat] ?? 0);
  return out;
}

/** 素材の月の量（指定が無ければ先月の消費、先月が無ければ 100% のときの消費） */
export function procQty(s: P1State, m: Mat): number {
  const q = s.proc.qty[m];
  if (q && !q.auto) return q.n;
  const last = s.matUsedLast?.[m];
  if (last != null && last > 0) return last;
  return fullUse(s)[m] ?? 0;
}
export function setProcQty(s: P1State, m: Mat, n: number | null) {
  if (n == null) delete s.proc.qty[m];
  else s.proc.qty[m] = { n: Math.max(0, Math.round(n)), auto: false };
}
export function toggleProcItem(s: P1State, x: Sku) {
  const cur = procItems(s);
  s.proc.items = cur.includes(x) ? cur.filter((y) => y !== x) : [...cur, x];
}
export function toggleProcExtra(s: P1State, m: Mat) {
  s.proc.extra = s.proc.extra.includes(m) ? s.proc.extra.filter((y) => y !== m) : [...s.proc.extra, m];
}
/** 先月の工房の稼働率（0〜1）。先月が無ければ null */
export const utilRate = (u: { work: number; cap: number } | null) => (u && u.cap > 0 ? u.work / u.cap : null);

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
    if (!s.dev.includes(skuParts(x)[0])) return 'dev';
    const st = worker != null ? staffOf(s, worker) : null;
    if (!st || aptitude(st.stats, 'craft') < UNCOMMON.minCraft) return 'skill';
  }
  for (const [m, q] of Object.entries(recipeOf(x))) if ((s.mats[m as Mat] ?? 0) < (q ?? 0)) return 'mats';
  // できた商品を置く場所（素材を使ったぶんは空く）
  const freed = Object.values(recipeOf(x)).reduce<number>((a, q) => a + (q ?? 0), 0);
  if (poolUsed(s) - freed + batchOf(x) > poolCap(s)) return 'full';
  return null;
}

function consume(s: P1State, x: Sku) {
  for (const [m, q] of Object.entries(recipeOf(x))) {
    s.mats[m as Mat] = (s.mats[m as Mat] ?? 0) - (q ?? 0);
    s.matUsed[m as Mat] = (s.matUsed[m as Mat] ?? 0) + (q ?? 0);
  }
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

export const craftDays = (s: P1State, x: Sku) => PRODUCT[skuParts(x)[0]].days * (has(s, 'jig') ? 0.8 : 1) * (has(s, 'bench3') ? 0.8 : 1) * (1 - 0.1 * invLv(myWorkshop(s), 'tools'));

/** 1 個あたりの素材代（いまの値段） */
export const unitCost = (s: P1State, x: Sku) => Object.entries(recipeOf(x)).reduce((a, [m, q]) => a + matPrice(s, m as Mat) * (q ?? 0), 0) / batchOf(x);

// ---------------------------------------------------------------- 商品開発

export const devCost = (key: string) => Math.round(PRODUCT[key].price * DEV.rate);
export function develop(s: P1State, key: string): string | null {
  if (!PRODUCT[key]) return 'locked';
  if (!has(s, 'pot')) return 'pot';
  if (s.dev.includes(key)) return 'done';
  if (s.lab) return 'busy';
  const cost = devCost(key);
  if (s.money < cost) return 'money';
  s.money -= cost;
  s.monthCost.build += cost;
  s.lab = { key, left: DEV.days };
  return null;
}

// ---------------------------------------------------------------- 宣伝・調査・依頼・給与

export const adBoost = (s: P1State) => ADS.reduce((a, x) => a + ((s.ads[x.id] ?? 0) > 0 ? x.boost : 0), 0);
export function runAd(s: P1State, id: string): string | null {
  const x = ADS.find((a) => a.id === id);
  if (!x) return 'locked';
  if ((s.ads[id] ?? 0) > 0) return 'busy';
  if (s.money < x.cost) return 'money';
  s.money -= x.cost;
  s.monthCost.ads = (s.monthCost.ads ?? 0) + x.cost;
  s.ads[id] = x.days;
  return null;
}

/** 調査の段（0〜3） */
export const intelLv = (s: P1State, rid: string) => INTEL.filter((d) => (s.intel[rid] ?? 0) >= d).length;

function missionMet(s: P1State, id: string): boolean {
  switch (id) {
    case 'first_sale':
      return Object.values(s.monthUnits).some((n) => (n ?? 0) > 0) || s.reports.some((r) => r.revenue > 0);
    case 'sensu100':
      return (s.monthUnits.Sensu ?? 0) >= 15;
    case 'ad':
      return ADS.some((a) => (s.ads[a.id] ?? 0) > 0);
    case 'two_shops':
      return myShops(s).length >= 2;
    case 'research':
      return Object.keys(s.intel).some((r) => intelLv(s, r) >= 1);
    case 'lantern50':
      return (s.monthUnits.Lantern ?? 0) >= 10;
    case 'uncommon':
      return s.unitsU >= 5;
    case 'rank3':
      return s.reports.some((r) => r.rank <= 3);
  }
  return false;
}
/** 同時に受けられる依頼の数 */
export const MISSION_MAX = 3;
/** 受けて進行中・達成した依頼（右上のミッションに出す） */
export const activeMissions = (s: P1State) => MISSIONS.filter((m) => s.missions[m.id] === 'accepted' || s.missions[m.id] === 'done');
/** まだ受けていない依頼（上から 3 つ） */
export const offeredMissions = (s: P1State) => MISSIONS.filter((m) => !s.missions[m.id]).slice(0, 3);
/** 依頼の画面に出すもの：受けたもの・達成したもの、そのあとにまだ受けていないもの */
export const openMissions = (s: P1State) => [...activeMissions(s), ...offeredMissions(s)];

/** 依頼を受ける。受けた時点で条件を満たしていれば、次の日に達成になる */
export function accept(s: P1State, id: string): string | null {
  if (s.missions[id]) return 'done';
  if (MISSIONS.filter((m) => s.missions[m.id] === 'accepted').length >= MISSION_MAX) return 'full';
  s.missions[id] = 'accepted';
  return null;
}

/** 数で決まる依頼の進み具合（無ければ null） */
export function missionProgress(s: P1State, id: string): [number, number] | null {
  switch (id) {
    case 'sensu100':
      return [Math.min(15, s.monthUnits.Sensu ?? 0), 15];
    case 'lantern50':
      return [Math.min(10, s.monthUnits.Lantern ?? 0), 10];
    case 'uncommon':
      return [Math.min(5, s.unitsU), 5];
    case 'two_shops':
      return [Math.min(2, myShops(s).length), 2];
  }
  return null;
}
export function claim(s: P1State, id: string): string | null {
  const m = MISSIONS.find((x) => x.id === id);
  if (!m || s.missions[id] !== 'done') return 'not-yet';
  s.missions[id] = 'claimed';
  s.money += m.reward;
  return null;
}

export const bonusCost = (st: Staff) => Math.round(PAY.bonusBase + st.wage * PAY.bonusRate);
/** 賞与：スタミナが満タンになり、休みから戻る */
export function bonus(s: P1State, hero: number): string | null {
  const st = staffOf(s, hero);
  if (!st) return 'no-staff';
  const cost = bonusCost(st);
  if (s.money < cost) return 'money';
  s.money -= cost;
  s.monthCost.wages += cost;
  st.stamina = st.stats.hp;
  st.resting = false;
  return null;
}
export const raiseStep = (hero: number) => Math.max(100, Math.round(wageOf(hero) * PAY.raiseWage));
/** 昇給：作業が 5% 速くなる（3 段まで）。月給が上がる */
export function raise(s: P1State, hero: number): string | null {
  const st = staffOf(s, hero);
  if (!st) return 'no-staff';
  if ((st.lv ?? 0) >= PAY.raiseMax) return 'max';
  st.lv = (st.lv ?? 0) + 1;
  st.wage += raiseStep(hero);
  return null;
}

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
  return (P1B[b.id].pull ?? 1) * (has(s, 'host') ? 1.15 : 1) * (1 + 0.1 * invLv(b, 'sign')) * (1 + adBoost(s)) * service * sh.sat * (r === 'U' ? UNCOMMON.pull : 1);
}

export const dist = (a: PBuilding, b: PBuilding) => Math.abs(a.i - b.i) + Math.abs(a.j - b.j);

// ---------------------------------------------------------------- 1 日

export interface DayResult {
  finished: PBuilding[];
  crafted: Sku[];
  delivered: { to: number; n: number }[];
  routes: Mat[];
  report: Report | null;
  /** 新しく達成した依頼・調査が進んだ他社・開発できた商品 */
  missions: string[];
  intel: { rid: string; lv: number }[];
  developed: string[];
  /** 調達ランクが上がった */
  procLv?: number;
  /** 調達係が持ち帰った素材 */
  arrived?: Partial<Record<Mat, number>>;
  /** 1 ロットできた（作業台の番号と数） */
  made: { slot: number; sku: Sku; n: number }[];
  /** 売れた（お店と金額。1 個ずつ） */
  sales: { uid: number; yen: number; sku: Sku }[];
}

export function step(s: P1State): DayResult {
  s.day++;
  const res: DayResult = { finished: [], crafted: [], delivered: [], routes: [], report: null, missions: [], intel: [], developed: [], made: [], sales: [] };

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

  // 調達：調達係が工房から卸問屋まで歩いて行き、往復のあいだに要る量を買って帰る（月の上限・資金・置き場所の中で）
  const ws0 = myWorkshop(s);
  const shopB = wholesaler(s);
  if (s.buyTrip) {
    const st = staffOf(s, s.buyTrip.hero);
    if (st && !st.resting) {
      working.add(st.hero);
      s.buyTrip.left -= 1;
    }
    if (s.buyTrip.left <= 0 || !st || st.task !== 'buy') {
      // 帰ってきた（途中で外されたときも、買った素材は届ける）
      for (const [m, n] of Object.entries(s.buyTrip.cargo)) s.mats[m as Mat] = (s.mats[m as Mat] ?? 0) + (n ?? 0);
      res.arrived = { ...s.buyTrip.cargo };
      s.buyTrip = null;
    }
  } else if (ws0 && shopB) {
    const st = s.staff.find((x) => x.task === 'buy' && !x.resting);
    const path = st ? roadPath(s, doorOf(ws0), doorOf(shopB)) : null;
    if (st && path) {
      const sp = speed(st, 'buy');
      const days = Math.max(2, Math.round(((path.length * 2) / TRANSPORT.cellsPerDay) / sp));
      // 往復の日数ぶん（＋端数の持ち越し）を、月の量から買う
      const cargo: Partial<Record<Mat, number>> = {};
      const lv = s.proc.lv;
      let free = poolFree(s);
      for (const { m } of procMats(s)) {
        const want = (procQty(s, m) / DAYS) * days + (s.proc.carry[m] ?? 0);
        let n = Math.floor(want);
        s.proc.carry[m] = want - n;
        n = Math.min(n, procLeft(s), free, Math.floor(s.money / Math.max(1, matPrice(s, m))));
        if (n <= 0) continue;
        if (buy(s, m, n, sp)) continue;
        free -= n;
        // buy() は手元に足すので、運んでいる荷物に移す
        s.mats[m] = (s.mats[m] ?? 0) - n;
        cargo[m] = n;
      }
      if (Object.keys(cargo).length) {
        s.buyTrip = { hero: st.hero, left: days, total: days, cargo };
        working.add(st.hero);
        if (s.proc.lv > lv) res.procLv = s.proc.lv;
      }
    }
  }

  // クラフト
  if (ws) s.util.cap += s.slots.length;
  s.slots.forEach((sl, slotIdx) => {
    const st = sl.worker != null ? staffOf(s, sl.worker) : null;
    if (!sl.running && sl.repeat && sl.sku && st && !st.resting && !craftCheck(s, sl.sku, sl.worker)) {
      consume(s, sl.sku);
      sl.running = true;
      sl.progress = 0;
    }
    if (!sl.running || !sl.sku || !st || st.resting) return;
    working.add(st.hero);
    s.util.work += 1;
    sl.progress += speed(st, 'craft');
    if (sl.progress >= craftDays(s, sl.sku)) {
      s.stock[sl.sku] = (s.stock[sl.sku] ?? 0) + batchOf(sl.sku);
      s.ws.made += batchOf(sl.sku);
      s.ws.value += batchOf(sl.sku) * skuPrice(sl.sku);
      res.crafted.push(sl.sku);
      res.made.push({ slot: slotIdx, sku: sl.sku, n: batchOf(sl.sku) });
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
        const capB = storageCap(shop);
        if (s.trips.some((t) => t.to === shop.uid && t.hauler === st.hero)) continue;
        const cargo: Partial<Record<Sku, number>> = {};
        let load = 0;
        const inbound = (x: Sku) => s.trips.filter((t) => t.to === shop.uid).reduce((a, t) => a + (t.cargo[x] ?? 0), 0);
        for (const x of sh.shelves) {
          if (!x || load >= cap) continue;
          const room = capB - (sh.storage[x] ?? 0) - inbound(x);
          const want = Math.min(room, s.stock[x] ?? 0, cap - load);
          if (want <= 0 || (sh.storage[x] ?? 0) + inbound(x) > capB / 2) continue;
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
    if (sh) s.ws.hauled = (s.ws.hauled ?? 0) + n;
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

  // 調査
  for (const st of s.staff) {
    if (st.task !== 'intel' || st.resting || typeof st.target !== 'string') continue;
    const rid = st.target;
    working.add(st.hero);
    const before = intelLv(s, rid);
    s.intel[rid] = (s.intel[rid] ?? 0) + speed(st, 'intel');
    const lv = intelLv(s, rid);
    if (lv > before) res.intel.push({ rid, lv });
    if (lv >= INTEL.length) {
      st.task = null;
      st.target = null;
    }
  }

  // 商品開発
  if (s.lab && --s.lab.left <= 0) {
    if (!s.dev.includes(s.lab.key)) s.dev.push(s.lab.key);
    res.developed.push(s.lab.key);
    s.lab = null;
  }

  // 陳列と販売
  for (const b of shops) {
    const sh = s.shops[b.uid];
    const st = sh.staff != null ? staffOf(s, sh.staff) : null;
    if (st && !st.resting) working.add(st.hero);
    let cap = ((st && !st.resting ? SHOP.displayPerDay * speed(st, 'shop') : 0) + sh.part * SHOP.partTimeDisplay) * (1 + 0.3 * invLv(b, 'fixtures'));
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
    if (open) sh.aw = Math.min(1, (sh.aw ?? 1) + AWARE.perDay);
    const empty = sh.shelves.some((x) => x && (sh.shelf[x] ?? 0) <= 0);
    if (open) sh.sat = empty ? Math.max(0.5, sh.sat - 0.01) : Math.min(1, sh.sat + 0.02);
    s.monthCost.part += sh.part * SHOP.partTimeWage;
    s.money -= sh.part * SHOP.partTimeWage;
    sh.cost += sh.part * SHOP.partTimeWage;
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
      // 新しいお店は知られていないぶん売れにくい（認知度）
      const want = ((daily * o.w) / total) * (o.sh.aw ?? 1) + (o.sh.carry[o.x] ?? 0);
      const sold = Math.min(Math.floor(want), o.sh.shelf[o.x] ?? 0);
      o.sh.carry[o.x] = Math.min(1, want - sold);
      o.sh.shelf[o.x] = (o.sh.shelf[o.x] ?? 0) - sold;
      const yen = sold * skuPrice(o.x);
      s.money += yen;
      s.monthSales[p.key] = (s.monthSales[p.key] ?? 0) + yen;
      o.sh.rev += yen;
      o.sh.cost += sold * unitCost(s, o.x);
      for (let k = 0; k < sold; k++) res.sales.push({ uid: o.b.uid, yen: skuPrice(o.x), sku: o.x });
      s.monthUnits[p.key] = (s.monthUnits[p.key] ?? 0) + sold;
      if (skuParts(o.x)[1] === 'U') s.unitsU += sold;
    }
    for (const r of s.rivals) {
      if (!r.sells[p.key]) continue;
      const yen = ((daily * (r.sells[p.key] ?? 0)) / total) * p.price;
      s.rivalSales[r.id] += yen;
      const m = (s.rivalProd[r.id] ??= {});
      m[p.key] = (m[p.key] ?? 0) + yen;
    }
  }

  // スタミナ
  const restRate = STAMINA.rest * (has(s, 'lounge') ? 1.5 : 1);
  for (const st of s.staff) {
    if (st.resting) {
      st.stamina = Math.min(st.stats.hp, st.stamina + restRate);
      if (st.stamina >= st.stats.hp * STAMINA.back) st.resting = false;
    } else if (working.has(st.hero)) {
      const easy = st.task === 'craft' && invLv(ws, 'breakroom') > 0 ? 0.7 : 1;
      st.stamina = Math.max(0, st.stamina - STAMINA.work * easy);
      if (st.stamina <= st.stats.hp * STAMINA.tired) st.resting = true;
    } else st.stamina = Math.min(st.stats.hp, st.stamina + restRate / 2);
  }

  // 宣伝の残り日数
  for (const k of Object.keys(s.ads)) s.ads[k] = Math.max(0, (s.ads[k] ?? 0) - 1);

  // 依頼は締めの前と後に確かめる（今月の数と、報告の順位）
  checkMissions(s, res);
  if (s.open !== null && s.day > s.open && (s.day - s.open) % DAYS === 0) {
    res.report = endMonth(s);
    checkMissions(s, res);
  }
  return res;
}

function checkMissions(s: P1State, res: DayResult) {
  for (const m of MISSIONS) {
    if (s.missions[m.id] !== 'accepted' || !missionMet(s, m.id)) continue;
    s.missions[m.id] = 'done';
    res.missions.push(m.id);
  }
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
  for (const b of s.buildings) {
    const sh = s.shops[b.uid];
    if (!sh) continue;
    sh.last = { rev: Math.round(sh.rev), cost: Math.round(sh.cost + (b.left <= 0 ? (P1B[b.id]?.upkeep ?? 0) : 0)) };
    sh.cost = 0;
  }
  s.ws.last = { made: s.ws.made, value: Math.round(s.ws.value) };
  s.ws.made = 0;
  s.ws.hauled = 0;
  s.ws.value = 0;
  s.rivalLast = Object.fromEntries(s.rivals.map((r) => [r.id, { total: Math.round(r.base + (s.rivalSales[r.id] ?? 0)), by: { ...(s.rivalProd[r.id] ?? {}) } }]));
  s.rivalProd = {};
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
  s.monthUnits = {};
  s.matUsedLast = { ...s.matUsed };
  s.matUsed = {};
  s.utilLast = { ...s.util };
  s.util = { work: 0, cap: 0 };
  s.proc.bought = 0;
  for (const sh of Object.values(s.shops)) sh.rev = 0;
  s.rivalSales = Object.fromEntries(s.rivals.map((r) => [r.id, 0]));
  s.monthCost = { materials: 0, wages: 0, part: 0, upkeep: 0, build: 0, ads: 0 };
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
    const s: P1State = { ...extras(), ...o, open, ground: g };
    // 以前のセーブ：卸問屋が無ければ建てておく
    if (!s.buildings.some((b) => b.id === 'wholesale')) placeTown(s, 'wholesale', rng(s.seed + 11), 'town', [1, 14]);
    // 以前のセーブ：釜があれば全部のアンコモンを開発済みに
    if (!(o as Partial<P1State>).dev && s.skills.includes('pot')) s.dev = PRODUCTS.map((p) => p.key);
    s.monthCost.ads ??= 0;
    for (const sh of Object.values(s.shops)) {
      sh.cost ??= 0;
      sh.last ??= null;
    }
    return s;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------- 地図の吹き出し（自社の施設）

export type Stop = 'noCrafter' | 'crafterRest' | 'noItem' | 'noMats' | 'full' | 'noHauler' | 'noProduct' | 'noClerk' | 'clerkRest' | 'soldOut';
/** 施設のようす：動いているなら作っている／売っている商品、止まっているなら理由（error＝止まっている、warn＝流れが詰まりかけ） */
export type FacilityStatus = { kind: 'craft' | 'sell'; items: Sku[] } | { level: 'error' | 'warn'; stop: Stop };

export function facilityStatus(s: P1State, b: PBuilding): FacilityStatus | null {
  if (b.owner !== 'me' || b.left > 0) return null;
  const kind = P1B[b.id]?.kind;
  if (kind === 'workshop') {
    // 作業中か、続けて作る設定で次も作れる作業台（1 回ぶんができた直後も「作っている」とみなす）
    const live = s.slots.filter((sl) => {
      const st = sl.worker != null ? staffOf(s, sl.worker) : null;
      return sl.sku && st && !st.resting && (sl.running || (sl.repeat && !craftCheck(s, sl.sku, sl.worker)));
    });
    if (!live.length) {
      const sl = s.slots[0];
      if (!sl || sl.worker == null) return { level: 'error', stop: 'noCrafter' };
      if (staffOf(s, sl.worker)?.resting) return { level: 'error', stop: 'crafterRest' };
      if (!sl.sku) return { level: 'error', stop: 'noItem' };
      const why = craftCheck(s, sl.sku, sl.worker);
      if (why === 'mats') return { level: 'error', stop: 'noMats' };
      if (why === 'full') return { level: 'error', stop: 'full' };
      return { level: 'error', stop: 'noItem' };
    }
    const stock = Object.values(s.stock).reduce<number>((a, n) => a + (n ?? 0), 0);
    const haulers = s.staff.some((x) => x.task === 'transport' && !x.resting);
    if (stock > 0 && !haulers && myShops(s).length) return { level: 'warn', stop: 'noHauler' };
    return { kind: 'craft', items: [...new Set(live.map((sl) => sl.sku!))].slice(0, 3) };
  }
  if (kind === 'shop') {
    const sh = s.shops[b.uid];
    if (!sh) return null;
    const main = sh.shelves[0];
    if (!main) return { level: 'error', stop: 'noProduct' };
    const st = sh.staff != null ? staffOf(s, sh.staff) : null;
    if (!st && sh.part === 0) return { level: 'error', stop: 'noClerk' };
    if (st?.resting && sh.part === 0) return { level: 'error', stop: 'clerkRest' };
    if ((sh.shelf[main] ?? 0) <= 0 && (sh.storage[main] ?? 0) <= 0) return { level: 'warn', stop: 'soldOut' };
    return { kind: 'sell', items: [main] };
  }
  return null;
}

// ---------------------------------------------------------------- SCM ダッシュボード：段ごとの能力（商品の数／月）

export type Stage = 'buy' | 'craft' | 'haul' | 'sell';
export interface StageCap {
  /** ひと月に回せる商品の数（いまの体制のまま） */
  perMonth: number;
  /** 担当がいない・止まっている */
  stopped: boolean;
}

/** 作業台の体制で、ひと月に作れる商品の数と、そのとき要る素材 */
function craftPlan(s: P1State) {
  let units = 0;
  const need: Partial<Record<Mat, number>> = {};
  for (const sl of s.slots) {
    if (!sl.sku || sl.worker == null) continue;
    const st = staffOf(s, sl.worker);
    if (!st) continue;
    const lots = (DAYS * speed(st, 'craft')) / craftDays(s, sl.sku);
    units += lots * batchOf(sl.sku);
    for (const [m, q] of Object.entries(recipeOf(sl.sku))) need[m as Mat] = (need[m as Mat] ?? 0) + lots * (q ?? 0);
  }
  return { units, need };
}

/** 往復の日数（運搬係 1 人・お店 1 軒あたりの平均） */
function haulDays(s: P1State, st: Staff): number {
  const ws = myWorkshop(s);
  const shops = myShops(s);
  if (!ws || !shops.length) return 0;
  const d = shops.reduce((a, b) => a + Math.max(1, (dist(ws, b) / (TRANSPORT.cellsPerDay * (has(s, 'truck') ? 1.5 : 1))) * (has(s, 'hub') ? 0.7 : 1) * 2) / speed(st, 'transport'), 0) / shops.length;
  return Math.max(1, d);
}

/** お店の棚に商品があるとして、ひと月に売れそうな数（いまの売り場の強さ・認知度・ライバルで） */
export function salesPotential(s: P1State): number {
  let units = 0;
  for (const p of PRODUCTS) {
    const daily = (s.demand[p.key] ?? 0) / DAYS;
    const offers: { w: number; aw: number }[] = [];
    for (const b of myShops(s)) {
      const sh = s.shops[b.uid];
      for (const x of sh.shelves) if (x && skuParts(x)[0] === p.key) offers.push({ w: pull(s, b, sh, x), aw: sh.aw ?? 1 });
    }
    const mine = offers.reduce((a, o) => a + o.w, 0);
    const total = mine + s.rivals.reduce((a, r) => a + (r.sells[p.key] ?? 0), 0);
    if (total <= 0) continue;
    for (const o of offers) units += ((daily * o.w) / total) * o.aw * DAYS;
  }
  return units;
}

export function stageCaps(s: P1State): Record<Stage, StageCap> {
  const plan = craftPlan(s);
  // 調達：調達係の月の量で、作業台の要る素材をどれだけまかなえるか（調達係がいなければ手元の素材だけ）
  const buyer = s.staff.some((x) => x.task === 'buy' && !x.resting);
  let ratio = Infinity;
  for (const [m, q] of Object.entries(plan.need)) {
    const have = buyer ? procQty(s, m as Mat) : s.mats[m as Mat] ?? 0;
    ratio = Math.min(ratio, (q ?? 0) > 0 ? have / (q ?? 1) : Infinity);
  }
  if (!Number.isFinite(ratio)) ratio = plan.units > 0 ? 1 : 0;
  // 調達係がいないときは手元の素材ぶんだけ（あと 3 日ぶんを切ったら止まっている扱い）
  const buy = { perMonth: Math.round(plan.units * ratio), stopped: !buyer && ratio * DAYS < 3 };
  const craft = { perMonth: Math.round(plan.units), stopped: !s.slots.some((sl) => sl.worker != null && sl.sku) };
  const haulers = s.staff.filter((x) => x.task === 'transport');
  const carts = has(s, 'cart2') ? 2 : 1;
  const cap = Math.round(TRANSPORT.cap * (has(s, 'truck') ? 2.5 : 1));
  const haul = { perMonth: Math.round(haulers.reduce((a, st) => a + (haulDays(s, st) ? (DAYS / haulDays(s, st)) * carts * cap : 0), 0)), stopped: !haulers.length };
  const sell = { perMonth: Math.round(salesPotential(s)), stopped: !myShops(s).some((b) => s.shops[b.uid].shelves.some((x) => x) && (s.shops[b.uid].staff != null || s.shops[b.uid].part > 0)) };
  return { buy, craft, haul, sell };
}

/** いちばん細いところ（止まっている段があればそこ） */
export function bottleneck(c: Record<Stage, StageCap>): Stage {
  const order: Stage[] = ['buy', 'craft', 'haul', 'sell'];
  const stopped = order.find((k) => c[k].stopped);
  if (stopped) return stopped;
  return order.reduce((a, k) => (c[k].perMonth < c[a].perMonth ? k : a), order[0]);
}

/** 手元の素材で、作業台があと何日動けるか（作業台が動いていなければ null） */
export function matDays(s: P1State): number | null {
  const plan = craftPlan(s);
  let d = Infinity;
  for (const [m, q] of Object.entries(plan.need)) if ((q ?? 0) > 0) d = Math.min(d, ((s.mats[m as Mat] ?? 0) / (q ?? 1)) * DAYS);
  return Number.isFinite(d) ? d : null;
}
