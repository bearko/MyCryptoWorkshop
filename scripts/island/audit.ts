/**
 * 投資の効き目の監査（UI なし・モデル層だけ）：すべての投資が SCM ダッシュボードの数字（stageCaps の 4 段）と、
 * 実際の 30 日の結果（作った・運んだ・売れた数と売上）の両方に出るかを確かめる。
 * 実行：`npm run island:audit`（tests/island-p1-audit.test.ts から呼ぶ。結果は docs/ISLAND_AUDIT.md に書く）。
 * ふだんの `npm test` でも同じ判定を回し、「反映されない投資」が 1 つも無いことを確かめる。
 *
 * 投資の一覧は手で書かない：設備投資（INVESTS の全部 × 全段）・スキル（LEARNABLE の全部）はデータから列挙し、
 * 効くはずの段（expect）と、効くのに要る前提（setup）だけをここの表で持つ。表に無いものがデータに増えたら、テストが落ちる。
 * docs/ISLAND_PHASE1.md「投資の効き目の監査」
 */
import { writeFileSync } from 'node:fs';
import { ADS, DIG_BALANCE, DIG_SITES, HIRE_POOL, INVEST, INVESTS, MONEY_PANELS, P1B, PRODUCT, RESEARCH_NEED, SKILL, aptitude, isResearch, relicKey, sku, skuParts, type DigFxKind, type FxKind, type Mat, type Skill, type Sku, type Task } from '../../src/island/p1/data';
import {
  LEARNABLE,
  allowedDirs,
  assign,
  bonus,
  build,
  canPlaceAt,
  gainSkill,
  hasRoute,
  heroStats,
  hire,
  hireSlots,
  invest,
  invLv,
  jamOf,
  myShops,
  myWorkshop,
  newP1,
  openRelic,
  relicSku,
  digLayout,
  reviveSite,
  oneWay,
  pathLen,
  raise,
  rareHeroes,
  recommend,
  roadPath,
  doorOf,
  fitEquipment,
  runAd,
  sellNow,
  sellWhatIf,
  setDustShop,
  setLevel,
  scoutMul,
  skillTier,
  setPart,
  setShelf,
  stageCaps,
  staffOf,
  startCraft,
  step,
  trainDays,
  tutSpot,
  wholesaler,
  type P1State,
  type PBuilding,
  type Stage,
} from '../../src/island/p1/model';

export const STAGES: Stage[] = ['buy', 'craft', 'haul', 'sell'];
export const STAGE_NAME: Record<Stage, string> = { buy: '① 調達', craft: '② 製造', haul: '③ 物流', sell: '④ 販売' };
const SEED = 1;
/**
 * 実際の結果を測る日数（3 か月。30 日だと、ロット 4 個・1 便 10 個・買い付けの山の区切りで、小さな効き目が数字に出ないことがあるため。
 * ゆっくり効くもの＝OJT・目利きなどは、その項目の days）
 */
export const RUN_DAYS = 90;

// ---------------------------------------------------------------- 基準の状態

/**
 * 基準の状態。std0／std1 は仕様の「基準」（タオックス・工房 1・よろず屋 1・3 人を配置・センスを製造・調達係なし／あり・資金たっぷり）。
 * j_* は「その段が詰まり」になるように、ほかの段を太くした基準（需要を何倍かにして、販売以外が詰まるようにする）。
 * 投資は、効くはずの段が詰まりの基準で測る（詰まりの段が太くなれば、実際の売上も増えるはず）。
 */
export type BaseId = 'std0' | 'std1' | 'j_buy' | 'j_trip' | 'j_craft' | 'j_haul' | 'j_haul1' | 'j_haul3' | 'j_sell' | 'j_cap' | 'j_new';
interface BaseOpt {
  name: string;
  sector?: string;
  buyer?: boolean;
  /** 作業台の数（2 台目からは、製造の適性の高い人を雇って置く） */
  benches?: number;
  /** 運搬係の数（2 人目からは雇う） */
  haulers?: number;
  /** 需要の倍率（全部の商品） */
  demand?: number;
  /** アルバイト */
  part?: number;
  /** 工房を卸問屋から遠くに置く（調達の往復を長く）／お店を工房から遠くに置く（運ぶ日数を長く） */
  farBuy?: boolean;
  farShop?: boolean;
  /** 前もって取っておくスキル（効き目を測る項目とは別） */
  skills?: string[];
  /** 工房の設備（前もって） */
  inv?: Record<string, number>;
  product?: Sku;
  /** 調達ランクを 1 に戻す（月の調達の上限 100） */
  rank1?: boolean;
  /** 倉庫を 1 つ（置き場所で詰まらないように） */
  warehouse?: boolean;
}
export const BASES: Record<BaseId, BaseOpt> = {
  std0: { name: '基準（調達係なし）' },
  std1: { name: '基準（調達係あり）', buyer: true },
  j_sell: { name: '販売が詰まり（需要 ×5・作業台 3・運搬 2）', buyer: true, warehouse: true, benches: 3, haulers: 2, demand: 5, inv: { carts: 1, stockroom: 1 }, skills: ['stock1'] },
  j_cap: { name: '販売の処理力が詰まり（需要 ×25・作業台 3・運搬 2）', buyer: true, warehouse: true, benches: 3, haulers: 2, demand: 25, inv: { carts: 1, stockroom: 1, tools: 3 }, skills: ['stock1', 'stock2'] },
  j_craft: { name: '製造が詰まり（需要 ×25・作業台 2・アルバイト 1・運搬 3）', buyer: true, warehouse: true, benches: 2, haulers: 3, demand: 25, part: 1, inv: { carts: 1 }, skills: ['stock1'] },
  j_haul: { name: '物流が詰まり（需要 ×25・お店が遠い・作業台 3・運搬 3）', buyer: true, warehouse: true, benches: 3, haulers: 3, demand: 25, part: 1, farShop: true, inv: { stockroom: 1, tools: 2 }, skills: ['stock1'] },
  j_haul1: { name: '物流が詰まり（荷車の数。運搬 1 人・需要 ×25・作業台 3）', buyer: true, warehouse: true, benches: 3, demand: 25, part: 1, inv: { stockroom: 1, tools: 2 }, skills: ['stock1'] },
  j_haul3: { name: '物流が詰まり（運搬係の速さ・休み。運搬 3 人・需要 ×25・作業台 3）', buyer: true, warehouse: true, benches: 3, haulers: 3, demand: 25, part: 1, inv: { stockroom: 1, tools: 3, bench: 1 }, skills: ['stock1', 'stock2'] },
  j_buy: { name: '調達が詰まり（調達の上限・調達ランク 1。需要 ×25・作業台 3・運搬 3）', buyer: true, warehouse: true, benches: 3, haulers: 3, demand: 25, part: 1, inv: { carts: 1, tools: 2 }, product: 'Scissors:C', rank1: true },
  j_trip: { name: '調達が詰まり（1 往復で運べる量。卸問屋が遠い・物置 +40・需要 ×25・作業台 3・運搬 3）', buyer: true, benches: 3, haulers: 3, demand: 25, part: 1, farBuy: true, inv: { carts: 1, tools: 2, stockroom: 1 }, product: 'Scissors:C', skills: ['stock1', 'stock2', 'stock3'] },
  j_new: { name: '販売が詰まり（ユーホタウン・gap のゴブレットを初めて並べる）', sector: 'c2', buyer: true, benches: 2, demand: 3, product: 'Goblet:C', skills: ['t_glass'] },
};
/** 効くはずの段 → その段が詰まりの基準 */
const JAM_BASE: Record<Stage, BaseId> = { buy: 'j_buy', craft: 'j_craft', haul: 'j_haul', sell: 'j_sell' };

const clone = (s: P1State): P1State => structuredClone(s);
/** 作業台で作るものを決める（素材がまだ無くても、自動製造で決めておく。届いたら始まる） */
function setCraft(s: P1State, k: number, x: Sku) {
  const sl = s.slots[k];
  sl.running = false;
  sl.progress = 0;
  if (startCraft(s, k, x)) {
    sl.sku = x;
    sl.repeat = true;
  }
}

/** 置ける区画のうち、score がいちばん大きい所 */
function place(s: P1State, id: string, score: (i: number, j: number) => number): [number, number, 'rd' | 'ld' | 'lu' | 'ru'] | null {
  // 建てるのに要るスキル（物流拠点・輸入品店など）は先に（前と後の両方に）
  const req = P1B[id]?.requires;
  if (req) gainSkill(s, req);
  let best: [number, number, 'rd' | 'ld' | 'lu' | 'ru'] | null = null;
  let bv = -Infinity;
  for (let j = 0; j < s.n; j++)
    for (let i = 0; i < s.n; i++)
      for (const d of allowedDirs(s, id, i, j)) {
        if (canPlaceAt(s, id, i, j, d)) continue;
        const v = score(i, j);
        if (v > bv) {
          bv = v;
          best = [i, j, d];
        }
      }
  return best;
}
/** 建てて、工事を終わらせる（1 日進める） */
function buildNow(s: P1State, id: string, at: [number, number, 'rd' | 'ld' | 'lu' | 'ru'] | null): PBuilding {
  if (!at) throw new Error(`no lot for ${id}`);
  const req = P1B[id]?.requires;
  if (req) gainSkill(s, req);
  const b = build(s, id, ...at);
  if (typeof b === 'string') throw new Error(`${id}: ${b}`);
  b.left = 1;
  step(s);
  return b;
}
/** 候補（HIRE_POOL）から、その仕事の適性がいちばん高い（worst なら低い）人を雇う */
export function hireFor(s: P1State, task: Task, worst = false): number {
  const cands = HIRE_POOL.filter((id) => !s.staff.some((x) => x.hero === id)).sort((a, b) => aptitude(heroStats(b), task) - aptitude(heroStats(a), task));
  const id = worst ? cands[cands.length - 1] : cands[0];
  s.hirePool = [id];
  const e = hire(s, id);
  if (e) throw new Error(`hire ${id}: ${e}`);
  return id;
}

/**
 * 基準の状態（phase：慣らしの日数をずらした写し。0・1・2 → 40・47・54 日）。
 * 実際の結果は、ロット・便・休みの山の区切りで ±1 便ほどゆれるので、3 つの写しの合計で比べる
 */
export const PHASES = [0, 1, 2];
const baseCache = new Map<string, P1State>();
export function baseOf(id: BaseId, phase = 0): P1State {
  const hit = baseCache.get(`${id}:${phase}`);
  if (hit) return clone(hit);
  const o = BASES[id];
  const sector = o.sector ?? 'c1';
  const s = newP1(SEED, 'C', sector);
  s.money = 5_000_000;
  s.tut = 99;
  s.flags.hq = true;
  gainSkill(s, 'hire');
  for (const k of o.skills ?? []) gainSkill(s, k);
  const wh = wholesaler(s)!;
  const ws = buildNow(
    s,
    'workshop',
    o.farBuy
      ? place(s, 'workshop', (i, j) => {
          const fake = { uid: -1, id: 'workshop', i, j, dir: allowedDirs(s, 'workshop', i, j)[0], left: 0, owner: 'me' } as PBuilding;
          return roadPath(s, doorOf(fake), doorOf(wh))?.length ?? 0;
        })
      : tutSpot(s, 'workshop'),
  );
  for (const [k, lv] of Object.entries(o.inv ?? {})) for (let n = 0; n < lv; n++) invest(s, ws.uid, k);
  if (o.warehouse) warehouse(s);
  const shop = buildNow(
    s,
    'general_store',
    o.farShop
      ? place(s, 'general_store', (i, j) => {
          const fake = { uid: -1, id: 'general_store', i, j, dir: allowedDirs(s, 'general_store', i, j)[0], left: 0, owner: 'me' } as PBuilding;
          return pathLen(s, ws, fake);
        })
      : tutSpot(s, 'general_store'),
  );
  const x = o.product ?? 'Sensu:C';
  assign(s, 10003, 'craft', 0);
  assign(s, 10001, 'transport');
  assign(s, 10002, 'shop', shop.uid);
  for (let k = 1; k < (o.benches ?? 1); k++) invest(s, ws.uid, 'bench');
  for (let k = 1; k < s.slots.length; k++) assign(s, hireFor(s, 'craft'), 'craft', k);
  for (let k = 1; k < (o.haulers ?? 1); k++) assign(s, hireFor(s, 'transport'), 'transport');
  // 調達係は、候補のうち調達の適性がいちばん低い人（「能力の高い人と入れ替える」を確かめられるように）
  if (o.buyer) assign(s, hireFor(s, 'buy', true), 'buy');
  setShelf(s, shop.uid, 0, x);
  if (o.part) setPart(s, shop.uid, o.part);
  s.slots.forEach((_, k) => setCraft(s, k, x));
  if (o.demand) for (const k of Object.keys(s.demand)) s.demand[k] = (s.demand[k] ?? 0) * o.demand;
  for (let d = 0; d < 40 + phase * 7; d++) step(s);
  s.money = 5_000_000;
  if (o.rank1) {
    s.proc.lv = 1;
    s.proc.exp = 0;
  }
  baseCache.set(`${id}:${phase}`, clone(s));
  return s;
}

// ---------------------------------------------------------------- 測る

export interface Run {
  made: number;
  hauled: number;
  sold: number;
  bought: number;
  rev: number;
  profit: number;
  brand: number;
}
function runDays(s: P1State, days: number): Run {
  const m0 = s.money;
  const b0 = s.brand ?? 0;
  const r: Run = { made: 0, hauled: 0, sold: 0, bought: 0, rev: 0, profit: 0, brand: 0 };
  for (let d = 0; d < days; d++) {
    const res = step(s);
    for (const x of res.made) r.made += x.n;
    for (const x of res.delivered) r.hauled += x.n;
    r.sold += res.sales.length;
    for (const x of res.sales) r.rev += x.yen;
    for (const n of Object.values(res.arrived ?? {})) r.bought += n ?? 0;
  }
  r.profit = s.money - m0;
  r.brand = (s.brand ?? 0) - b0;
  return r;
}

// ---------------------------------------------------------------- 投資の一覧

/** 前もっての準備（前と後の両方に）と、投資（後だけ） */
type Setup = (s: P1State) => void;
export type Check = 'stage' | 'yen' | 'profit' | 'probe';
export interface Item {
  id: string;
  group: '設備投資' | '研究パネル' | 'お金パネル' | '人材' | '建物' | '宣伝' | '商品';
  name: string;
  /** 効くはずの段（空：段の数字ではなく、利益・ブランド力・候補などに効く。out があれば対象外） */
  expect: Stage[];
  /** 測る基準（段ごと。無ければ JAM_BASE） */
  base?: Partial<Record<Stage, BaseId>> | BaseId;
  setup?: Setup;
  apply: Setup;
  /** 適用のあと、前と後の両方に */
  post?: Setup;
  /** stage：段の数字（個）／yen：販売の売上の見込み（値段に効くもの）／profit：利益／probe：決まった数字 */
  check?: Check;
  probe?: { name: string; f: (s: P1State) => number; better: 'up' | 'down' };
  days?: number;
  /** 対象外の理由 */
  out?: string;
  note?: string;
}

const shopOf = (s: P1State) => myShops(s)[0];
const wsOf = (s: P1State) => myWorkshop(s)!;
const mainSku = (s: P1State) => s.slots[0].sku as Sku;
/** 投資：その建物の、その設備をいまの段から 1 段 */
const targetOf = (s: P1State, id: string) => (INVEST[id].kind === 'workshop' ? wsOf(s) : INVEST[id].kind === 'shop' ? shopOf(s) : s.buildings.find((x) => x.owner === 'me' && x.id === 'warehouse')!);
const inv = (id: string) => (s: P1State) => {
  const b = targetOf(s, id);
  const e = invest(s, b.uid, id);
  if (e) throw new Error(`invest ${id}: ${e}`);
};
/** 2 つ目の商品：棚 +1 と作業台をもう 1 つ（職人つき）にして、片方で作る */
/** 空いた棚を 1 つ用意する（無ければ棚を増やす） */
const shelfRoom = (s: P1State) => {
  const b = shopOf(s);
  if (!s.shops[b.uid].shelves.some((y) => !y)) invest(s, b.uid, 'shelves');
};
/**
 * 別の商品を並べる：空いた棚（無ければ棚を増やす）に x を並べ、主力を作っている作業台の 1 つで x を作る
 * （主力の作業台が 1 つしかなければ、作業台を増やして職人を雇う）
 */
const second = (x: Sku, opts: { stock?: boolean } = {}) => (s: P1State) => {
  shelfRoom(s);
  if (opts.stock === false) return;
  const b = shopOf(s);
  setShelf(s, b.uid, s.shops[b.uid].shelves.findIndex((y) => !y), x);
  if (s.slots.some((sl) => sl.sku === x)) return;
  const main = mainSku(s);
  let k = [...s.slots.keys()].reverse().find((i) => i > 0 && s.slots[i].sku === main);
  if (k == null) {
    invest(s, wsOf(s).uid, 'bench');
    k = s.slots.length - 1;
    assign(s, hireFor(s, 'craft'), 'craft', k);
  }
  setCraft(s, k, x);
};
const tired = (task: Task) => (s: P1State) => {
  const st = s.staff.find((x) => x.task === task && x.hero !== -1)!;
  st.stamina = st.stats.hp * 0.3;
  st.resting = false;
};
/** その仕事の人を、雇った人と入れ替える */
const replace = (task: Task) => (s: P1State) => {
  const old = s.staff.find((x) => x.task === task)!;
  const id = hireFor(s, task);
  const target = old.target;
  assign(s, old.hero, null);
  assign(s, id, task, target);
};
/** 2 軒目のお店：far＝いちばん伸びる区画（sellWhatIf の 2 軒目と同じ）、near＝いまのお店のすぐ近く */
const shop2 = (kind: string, far: boolean, clerk = false) => (s: P1State) => {
  const b0 = shopOf(s);
  const at = far
    ? (() => {
        const w = sellWhatIf(s).find((x) => x.kind === 'shop');
        if (w?.at) {
          const d = allowedDirs(s, kind, w.at[0], w.at[1]).find((dd) => !canPlaceAt(s, kind, w.at![0], w.at![1], dd));
          if (d) return [w.at[0], w.at[1], d] as [number, number, 'rd' | 'ld' | 'lu' | 'ru'];
        }
        return place(s, kind, (i, j) => Math.abs(i - b0.i) + Math.abs(j - b0.j));
      })()
    : place(s, kind, (i, j) => -(Math.abs(i - b0.i) + Math.abs(j - b0.j)));
  const b = buildNow(s, kind, at);
  setShelf(s, b.uid, 0, s.shops[b0.uid].shelves[0]);
  setPart(s, b.uid, 1);
  if (clerk) assign(s, hireFor(s, 'shop'), 'shop', b.uid);
};
/** 物流拠点：お店までの片道がいちばん縮む所 */
const depot = (s: P1State) => {
  const shop = shopOf(s);
  const at = place(s, 'logistics', (i, j) => {
    const fake = { uid: -1, id: 'logistics', i, j, dir: allowedDirs(s, 'logistics', i, j)[0], left: 0, owner: 'me' } as PBuilding;
    return -oneWay(s, shop, myWorkshop(s)!, [fake]).days;
  });
  buildNow(s, 'logistics', at);
};
const warehouse = (s: P1State) => {
  const ws = wsOf(s);
  buildNow(s, 'warehouse', place(s, 'warehouse', (i, j) => -(Math.abs(i - ws.i) + Math.abs(j - ws.j))));
};
const truck = (s: P1State) => {
  if (!invLv(wsOf(s), 'truck')) invest(s, wsOf(s).uid, 'truck');
};
/** アンコモン：魔法の釜・開発済み・紙のルート・製造の適性 31 以上の職人を作業台 1 に */
const uncommonReady = (s: P1State) => {
  for (const k of ['pot', 'route_cloth', 'route_paper', 'route_gem']) gainSkill(s, k);
  const [key] = skuParts(mainSku(s));
  if (!s.dev.includes(key)) s.dev.push(key);
  const st = staffOf(s, s.slots[0].worker!)!;
  if (aptitude(st.stats, 'craft') < 31) {
    const id = hireFor(s, 'craft');
    assign(s, st.hero, null);
    assign(s, id, 'craft', 0);
  }
  s.mats.paper = 30;
  s.mats.gem = 10;
};
const toU = (s: P1State) => {
  const [key] = skuParts(mainSku(s));
  const x = sku(key, 'U');
  for (const b of myShops(s)) s.shops[b.uid].shelves = s.shops[b.uid].shelves.map((y) => (y && skuParts(y)[0] === key ? x : y));
  s.slots.forEach((sl, k) => {
    if (sl.sku && skuParts(sl.sku)[0] === key) setCraft(s, k, x);
  });
};
/** 並べている商品を「このセクタで初めて」に戻す（認知はじめから） */
const fresh = (s: P1State) => {
  for (const b of myShops(s)) for (const x of s.shops[b.uid].shelves) if (x) delete s.known[skuParts(x)[0]];
};
const ad = (id: string) => (s: P1State) => {
  if (runAd(s, id)) throw new Error(`ad ${id}`);
};

/**
 * スキルの表：効くはずの段と、効くのに要る前提。LEARNABLE（封印・準備中を除く）の全部が入っていること（テストで確かめる）。
 * out：段の数字・利益に効かない（解放・候補・進行速度など）。その理由
 */
interface SkillSpec {
  expect: Stage[];
  base?: Item['base'];
  setup?: Setup;
  after?: Setup;
  /** 適用のあと、前と後の両方に（宣伝を出す など） */
  post?: Setup;
  check?: Check;
  probe?: Item['probe'];
  days?: number;
  out?: string;
  note?: string;
}
const ALL4: Stage[] = ['buy', 'craft', 'haul', 'sell'];
/** 全員に効くもののうち、ここで測る段：製造・物流・販売（調達係への効き目は、調達係 1 人だけを変える行＝賞与・昇給で確かめる） */
const STAFF3: Stage[] = ['craft', 'haul', 'sell'];
const ALL4_BASE: Item['base'] = { buy: 'j_trip', haul: 'j_haul3' };
export const SKILL_SPEC: Record<string, SkillSpec> = {
  // ④ 販売
  host: { expect: ['sell'] },
  display: { expect: ['sell'], base: 'j_cap', note: '処理力（品出し）が詰まりのとき' },
  vmd: { expect: ['sell'], setup: second('Lantern:C'), note: '棚 2 つ以上のお店' },
  pop: { expect: ['sell'], base: 'j_new', setup: fresh, note: '初めて並べる商品（認知 30% から育つ）' },
  golden: { expect: ['sell'] },
  set: { expect: ['sell'], setup: second('Lantern:C'), check: 'yen', note: '2 種類並べたお店の値段' },
  point: { expect: ['sell'], setup: (s) => ((s.rivals[0].sells.Sensu = 1.2), (s.rally = 3)), note: '他社の反撃中（他社 1 社がセンスも扱う）' },
  hours: { expect: ['sell'], base: 'j_cap', note: '処理力（品出し）が詰まりのとき' },
  shop2: { expect: [], out: '解放（輸入品店を建てられる）。建物「輸入品店」の行で確かめる' },
  shop3: { expect: [], out: '解放（ブティックを建てられる）。建物「ブティック」の行で確かめる' },
  b_sign: { expect: ['sell'] },
  order: { expect: ['sell'] },
  fair: { expect: [], check: 'profit', post: ad('poster'), days: 30, note: '適用のあとに駅のポスター（30 日）を出す：費用 −30%・効き目 +10% → 利益' },
  b_premium: { expect: ['sell'], check: 'yen' },
  concierge: { expect: ['sell'] },
  d_shop: { expect: ['sell'], after: (s) => void setDustShop(s, shopOf(s).uid) },
  // ② 製造
  jig: { expect: ['craft'] },
  pot: { expect: [], out: '解放（アンコモンを開発できる）。商品「アンコモンに替える」の行で確かめる' },
  five_s: { expect: ['craft'] },
  jig2: { expect: ['craft'] },
  lot: { expect: ['craft'] },
  chair: { expect: ['craft'], note: 'スタミナ → 稼働率' },
  kaizen: { expect: ['craft'] },
  night: { expect: ['craft'], note: '日数 −15%・スタミナ +20%（差し引き）' },
  mold: { expect: ['craft'], setup: (s) => (uncommonReady(s), toU(s)), note: 'アンコモンを作っているとき' },
  line: { expect: ['craft'] },
  d_craft: { expect: ['craft'] },
  // ③ 物流
  loading: { expect: ['haul'] },
  shortcut: { expect: ['haul'] },
  timetable: { expect: ['haul'], setup: (s) => (invest(s, wsOf(s).uid, 'carts'), invest(s, wsOf(s).uid, 'carts'), gainSkill(s, 'loading')), note: '荷車 3・積み込みの工夫（裏の半分ルールで便を待つとき）' },
  route_opt: { expect: ['haul'] },
  hub: { expect: [], out: '解放（物流拠点を建てられる）。建物「物流拠点」の行で確かめる' },
  crossdock: { expect: ['haul'], setup: depot, note: '物流拠点があるとき' },
  joint: { expect: ['haul'] },
  fleet: { expect: ['haul'] },
  d_logi: { expect: ['haul'] },
  // ① 調達
  route_cloth: { expect: [], out: '解放（布を買える）。技の商品の材料' },
  route_paper: { expect: [], out: '解放（紙を買える）。技の商品・アンコモンの材料' },
  route_gem: { expect: [], out: '解放（宝石を買える）。アンコモンの材料' },
  bulk: { expect: [], check: 'profit', note: '素材の値段 → 利益' },
  stock1: { expect: ['buy'] },
  stock2: { expect: ['buy'] },
  bulk2: { expect: [], check: 'profit', note: '素材の値段 → 利益' },
  stock3: { expect: ['buy'] },
  swift: { expect: ['buy'], base: 'j_trip', note: '往復で運べる量が詰まりのとき' },
  eye: { expect: ['buy'], days: 120, note: '調達ランクが早く上がる（上限が伸びる）。120 日で測る' },
  scoutmap: { expect: [], check: 'probe', probe: { name: 'ルートの開拓の日数（布）', f: (s) => scoutMul(s) * 10, better: 'down' }, note: '開拓の日数' },
  abc: { expect: [], check: 'profit', note: '素材の値段 −5%・買いすぎなし → 利益' },
  contract: { expect: [], check: 'profit', note: '素材の値段 → 利益' },
  b_partner: { expect: ['buy'], note: '素材の値段も' },
  direct: { expect: ['buy'], note: '素材の値段も' },
  d_buy: { expect: [], check: 'profit', note: '素材の値段 → 利益（ルートも全部開く）' },
  // 人材
  hire: { expect: [], out: '解放（ヒーローを雇える）。人材の行（雇って配置）で確かめる' },
  lounge: { expect: STAFF3, base: ALL4_BASE, note: 'スタミナ → 稼働率（調達係の休みは ① の「賞与」の行で確かめる）' },
  manual: { expect: STAFF3, base: ALL4_BASE, note: '調達係も速くなる（① は「昇給」「能力の高い人」の行と同じ仕組み。置き場所で詰まった基準では、職人も速くなって置き場所を取り合うので ① の差は出にくい）' },
  shift: { expect: STAFF3, base: ALL4_BASE, note: 'スタミナ → 稼働率（調達係の休みは ① の「賞与」の行で確かめる）' },
  slots: { expect: [], check: 'probe', probe: { name: '雇える候補の数', f: (s) => hireSlots(s), better: 'up' } },
  ojt: { expect: ALL4, base: ALL4_BASE, days: 120, note: '月末に能力 +1。120 日で測る' },
  incentive: { expect: ['sell'], note: '給料 +10% も' },
  welfare: { expect: STAFF3, base: ALL4_BASE, note: 'スタミナ → 稼働率（調達係の休みは ① の「賞与」の行で確かめる）' },
  b_scout: { expect: [], check: 'probe', probe: { name: '雇える候補の数', f: (s) => hireSlots(s), better: 'up' } },
  training: { expect: [], check: 'probe', probe: { name: '技の修行の日数（木工・職人 10003）', f: (s) => trainDays(s, 't_wood', 10003), better: 'down' } },
  mgr: { expect: [], out: 'ほかのセクタ（セクタマネージャー）の売上の倍率。このセクタの段には効かない' },
  headhunt: { expect: [], check: 'probe', probe: { name: '月の入れ替えでレアの候補が来る', f: (s) => s.hirePool.filter((id) => rareHeroes().includes(id)).length, better: 'up' }, days: 30 },
  d_people: { expect: ['craft'], after: (s) => replace('craft')(s), setup: undefined, note: '雇うときの能力（後だけ雇う。前も同じ人を雇う）' },
  // 経営
  pace1: { expect: [], out: '進行速度（遊ぶ速さ）。段の数字には効かない' },
  pace2: { expect: [], out: '進行速度（遊ぶ速さ）。段の数字には効かない' },
  budget: { expect: [], check: 'profit', note: '維持費 → 利益' },
  pdca: { expect: [], out: '月次報告に来月の見込みが出る（情報）' },
  b_ads: { expect: ['sell'], setup: ad('poster'), note: '宣伝（駅のポスター 30 日）が効いているとき（ブランド力 +2／月も）' },
  pr: { expect: [], check: 'probe', probe: { name: 'ブランド力（★）', f: (s) => s.brand ?? 0, better: 'up' }, days: 30 },
  holding: { expect: [], out: 'ほかのセクタ（マネージャー）の利益。このセクタの段には効かない' },
  d_ops: { expect: ['sell'], setup: (s) => void (s.brand = 200), note: 'ブランド力 200 のとき' },
  // システム
  pos: { expect: ['sell'] },
  auto_order: { expect: ['buy'], base: 'j_trip', note: '往復で運べる量が詰まりのとき' },
  inventory: { expect: ['haul', 'buy'], base: { buy: 'j_trip' }, setup: truck, note: 'お店の裏 +10（トラックのとき）・物置 +20' },
  erp: { expect: ALL4, base: { buy: 'j_buy', haul: 'j_haul3' } },
  dyn: { expect: ['sell'], check: 'yen', note: '扱う他社が 1 社以下の商品の値段' },
  flow: { expect: ['sell'] },
  forecast: { expect: ['sell'], base: 'j_new', setup: fresh, note: '初めて並べる商品（認知のはじめ）' },
  ec: { expect: ['sell'] },
  d_sys: { expect: ALL4, base: { buy: 'j_buy', haul: 'j_haul3' } },
  // 技
  t_wood: { expect: [], out: '解放（椅子を作れる）。商品の行で確かめる' },
  t_paper: { expect: [], out: '解放（傘・ペンを作れる）。商品の行で確かめる' },
  t_metal: { expect: [], out: '解放（ナイフ・コンパスを作れる）。商品の行で確かめる' },
  t_glass: { expect: [], out: '解放（ゴブレット・モノクルを作れる）。商品「gap の商品」の行で確かめる' },
  t_clay: { expect: [], out: '解放（モアイ・日本人形を作れる）。商品の行で確かめる' },
  t_textile: { expect: [], out: '解放（リボン・ハットを作れる）。商品の行で確かめる' },
  t_jewel: { expect: [], out: '解放（オルゴールを作れる）。商品の行で確かめる' },
  t_master: { expect: ['sell'], setup: (s) => (gainSkill(s, 't_metal'), second('Knife:C')(s)), note: '技の商品（ナイフ）を並べているとき' },
};

/**
 * 汎用の効き目（fx）のパネル：fx の種類から、効くはずの段と基準を自動で決める（docs/ISLAND_PHASE1.md「汎用の効き目」）。
 * お金（給料・維持費・素材の値段）は「90 日の利益が増える」、ブランド力は「★ が増える」、マネージャーは対象外（ほかのセクタ）。
 */
const FX_SPEC: Record<Exclude<FxKind, DigFxKind>, SkillSpec> = {
  pull: { expect: ['sell'] },
  price: { expect: ['sell'], check: 'yen', note: '値段' },
  demand: { expect: ['sell'] },
  known: { expect: ['sell'], base: 'j_new', setup: fresh, note: '初めて並べる商品（認知の育ち）' },
  display: { expect: ['sell'], base: 'j_cap', note: '処理力（品出し）が詰まりのとき' },
  rally: { expect: ['sell'], setup: (s) => ((s.rivals[0].sells.Sensu = 1.2), (s.rally = 3)), note: '他社の反撃中' },
  ads: { expect: ['sell'], setup: ad('poster'), note: '宣伝（駅のポスター）が効いているとき' },
  craftDays: { expect: ['craft'] },
  lot: { expect: ['craft'] },
  haulDays: { expect: ['haul'] },
  cartCap: { expect: ['haul'] },
  procCap: { expect: ['buy'] },
  buyDays: { expect: ['buy'], base: 'j_trip', note: '往復で運べる量が詰まりのとき' },
  matPrice: { expect: [], check: 'profit', note: '素材の値段 → 利益' },
  stamina: { expect: STAFF3, base: ALL4_BASE, note: 'スタミナ → 稼働率' },
  rest: { expect: STAFF3, base: ALL4_BASE, note: 'スタミナ → 稼働率' },
  apt: { expect: STAFF3, base: ALL4_BASE, note: '全員の適性' },
  flow: { expect: ALL4, base: { buy: 'j_buy', haul: 'j_haul3' } },
  wage: { expect: [], check: 'profit', note: '給料 → 利益' },
  upkeep: { expect: [], check: 'profit', note: '維持費 → 利益' },
  brand: { expect: [], check: 'probe', probe: { name: 'ブランド力（★）', f: (s) => s.brand ?? 0, better: 'up' }, days: 30 },
  manager: { expect: [], out: 'ほかのセクタ（セクタマネージャー）の売上。このセクタの段には効かない' },
};
/** 外周を開いた状態に（U・R のパネルは、その外周を開いた基準で測る） */
const rings = (s: P1State) => void (s.flags.rings = ['U', 'R']);
/** そのパネルの監査の表の行：手で書いた SKILL_SPEC、無ければ fx の最初の種類から。Epic・Legendary は対象外（まだ遊べない） */
export function specOf(k: Skill): SkillSpec | undefined {
  const tier = skillTier(k);
  if (tier === 'E' || tier === 'L') return { expect: [], out: `まだ遊べない（${tier === 'E' ? 'Epic' : 'Legendary'} のセクタが無い）` };
  // 発掘の枝：SCM の段には効かない（発掘の速さ・深さ・研究の進み）。効き目は vitest で全部確かめる
  if (k.branch === 'dig') return { expect: [], out: '発掘（tests/island-p1-dig2b.test.ts で確認）' };
  const hand = SKILL_SPEC[k.id];
  if (hand) return hand;
  const f = k.fx?.[0];
  if (!f) return undefined;
  const base = FX_SPEC[f.kind as Exclude<FxKind, DigFxKind>];
  return { ...base, setup: (s) => (rings(s), base.setup?.(s)), note: [`汎用の効き目（${f.kind}）`, base.note].filter(Boolean).join('：') };
}
/**
 * レベル上げの監査：お金パネル（レベルがあるのはお金パネルだけ。研究パネルは Lv1 の行で確かめる）の Lv1 → Lv2。
 * 基準は Lv1 の行と同じ（前も後も Lv1 を取ってある）。Epic・Legendary は対象外（まだ遊べない）
 */
export const LEVEL_AUDIT = (['C', 'U', 'R'] as const).flatMap((tier) => Object.values(MONEY_PANELS[tier]));

/** 設備投資の表：効くはずの段と前提（INVESTS の全部が入っていること） */
export const INVEST_SPEC: Record<string, { expect: Stage[]; base?: Item['base']; setup?: Setup; after?: Setup; note?: string; out?: string }> = {
  shelves: { expect: ['sell'], after: (s) => second(recommendable(s))(s), note: '空いた棚に別の商品（市場データのおすすめ）を並べる（2 段目は、1 段目の棚にも別の商品を並べた状態から）' },
  sign: { expect: ['sell'] },
  staffroom: { expect: ['sell'], after: (s) => void setPart(s, shopOf(s).uid, 3), note: 'アルバイトを上限まで（3 人）' },
  fixtures: { expect: ['sell'], base: 'j_cap', note: '処理力（品出し）が詰まりのとき' },
  backroom: { expect: ['haul'], note: 'お店の裏が 1 便・同時の便を抑えているとき（1 段目：トラック、2 段目：＋荷車 2、3 段目：＋荷車 3）' },
  bench: { expect: ['craft'], after: (s) => assign(s, hireFor(s, 'craft'), 'craft', s.slots.length - 1), note: '増えた作業台に職人を置く（2 段目は日数 −20% も）' },
  carts: { expect: ['haul'], base: 'j_haul1', note: '荷車の数が詰まりのとき（運搬係 1 人）' },
  truck: { expect: ['haul'] },
  stockroom: { expect: ['buy'], base: 'j_trip', note: '往復で運べる量（置き場所）が詰まりのとき' },
  tools: { expect: ['craft'] },
  breakroom: { expect: ['craft'], note: 'スタミナ → 稼働率' },
  rack: { expect: ['buy'], base: 'j_trip', setup: (s) => (warehouse(s), void (s.mats.clay = (s.mats.clay ?? 0) + 190)), note: '倉庫があって、置き場所がいっぱいに近いとき（使わない素材 190）' },
  // 発掘の道具（ツルハシ・ランタン・発破）は、発掘 v2 の 2 段目でスキルツリーの発掘の枝へ移した（監査では「発掘」の対象外）
  // 遺物の展示館の展示室の増築（発掘 v2 の 4 段目）：SCM の段ではなく、入館料と節目のボーナス
  hall: { expect: [], out: '展示館（tests/island-p1-dungeon.test.ts で確認）' },
};
/** 荒れ地 k を掘りきって、復興させる（家 +N・需要 +6%） */
function reviveFor(s: P1State, k: number) {
  const st = s.dig!.sites[k];
  const L = digLayout(s.dig!.sector, k)!;
  st.permit = true;
  st.depth.fill(L.depth);
  st.hp.fill(0);
  st.done = true;
  if (!reviveSite(s, k)) throw new Error(`revive ${k}`);
}
/** 空いた棚に並べる商品：マインちゃんのおすすめ（いま作れるもの） */
/** 監査で開く復刻品（ユーホタウンの出土品のはじめ。Common の素材だけ） */
const RELIC_AUDIT = DIG_SITES.c2.finds[0];
/** 研究を Lv3 にして、復刻品のレシピを開く */
function openRelicFor(s: P1State, ext: number) {
  s.research[ext] = Math.max(s.research[ext] ?? 0, RESEARCH_NEED[DIG_BALANCE.relic.openLv - 1]);
  openRelic(s, ext);
}
function recommendable(s: P1State): Sku {
  const on = (k: string) => myShops(s).some((b) => s.shops[b.uid].shelves.some((y) => y && skuParts(y)[0] === k));
  const can = (k: string) => !PRODUCT[k]?.tech && Object.keys(PRODUCT[k]?.recipe.C ?? {}).every((m) => hasRoute(s, m as Mat));
  const k = [recommend(s), 'Lantern', 'Mallet', 'Scissors', 'Node-Doll'].find((x) => can(x) && !on(x)) ?? 'Lantern';
  return sku(k, 'C');
}

export function items(): Item[] {
  const out: Item[] = [];
  // 設備投資：全部 × 全段
  for (const x of INVESTS) {
    const spec = INVEST_SPEC[x.id];
    for (let lv = 1; lv <= x.cost.length; lv++) {
      const pre = (s: P1State) => {
        spec?.setup?.(s);
        if (x.id === 'shelves' && lv >= 2) second('Lantern:C')(s);
        if (x.id === 'backroom') {
          truck(s);
          for (let k = 1; k < lv; k++) invest(s, wsOf(s).uid, 'carts');
        }
        // その設備をちょうど lv − 1 段に（基準で先に入れてあれば戻す）
        const b = targetOf(s, x.id);
        if (invLv(b, x.id) > lv - 1) {
          b.inv = { ...b.inv, [x.id]: lv - 1 };
          fitEquipment(s);
        }
        while (invLv(b, x.id) < lv - 1) inv(x.id)(s);
        if (x.id === 'bench') for (let k = 1; k < s.slots.length; k++) if (s.slots[k].worker == null) assign(s, hireFor(s, 'craft'), 'craft', k);
      };
      out.push({
        id: `@${x.id}:${lv}`,
        group: '設備投資',
        name: `${x.name}（${lv} 段目）`,
        expect: spec?.expect ?? [],
        base: spec?.base,
        setup: pre,
        apply: (s) => {
          inv(x.id)(s);
          spec?.after?.(s);
          if (x.id === 'bench') setCraft(s, s.slots.length - 1, mainSku(s));
        },
        note: spec?.note,
        out: spec ? spec.out : '表に無い（scripts/island/audit.ts の INVEST_SPEC に足す）',
      });
    }
  }
  // スキル：取れるもの全部（封印・準備中を除く）
  for (const k of LEARNABLE()) {
    const spec = specOf(k);
    out.push({
      id: k.id,
      group: isResearch(k) ? '研究パネル' : 'お金パネル',
      name: k.name,
      expect: spec?.expect ?? [],
      base: spec?.base,
      setup: spec?.setup,
      apply: (s) => {
        gainSkill(s, k.id);
        spec?.after?.(s);
      },
      check: spec?.check,
      probe: spec?.probe,
      post: spec?.post,
      days: spec?.days,
      out: spec ? spec.out : '表に無い（scripts/island/audit.ts の SKILL_SPEC に足す）',
      note: spec?.note,
    });
  }
  // レベル上げ：代表のパネルの Lv1 → Lv2（前も後も Lv1 を取ってある。after は前と後の両方に）
  for (const id of LEVEL_AUDIT) {
    const k = SKILL[id];
    const spec = specOf(k);
    if (!spec || spec.out) continue;
    out.push({
      id: `${id}@lv2`,
      group: 'お金パネル',
      name: `${k.name}（Lv1 → Lv2）`,
      expect: spec.expect,
      base: spec.base,
      setup: (s) => {
        rings(s);
        spec.setup?.(s);
        gainSkill(s, id);
      },
      apply: (s) => setLevel(s, id, 2),
      post: (s) => {
        spec.after?.(s);
        spec.post?.(s);
      },
      check: spec.check,
      probe: spec.probe,
      days: spec.days,
      note: ['レベル上げ', spec.note].filter(Boolean).join('：'),
    });
  }
  // 人材：雇って配置（能力の高い人と入れ替え／2 人目）・賞与・昇給
  const TASK_OF: Record<Stage, Task> = { buy: 'buy', craft: 'craft', haul: 'transport', sell: 'shop' };
  const PEOPLE_BASE: Record<Stage, BaseId> = { buy: 'j_trip', craft: 'j_craft', haul: 'j_haul1', sell: 'j_sell' };
  for (const st of STAGES) {
    const task = TASK_OF[st];
    out.push({ id: `hire_best_${st}`, group: '人材', name: `${STAGE_NAME[st]}：能力の高い人と入れ替える`, expect: [st], base: PEOPLE_BASE[st], apply: replace(task) });
    if (st === 'buy') out.push({ id: `hire_2nd_${st}`, group: '人材', name: `${STAGE_NAME[st]}：2 人目を置く`, expect: [], apply: () => {}, out: '調達係は 1 人（配置の画面で 2 人目を置くと、前の人は外れる）' });
    else if (st === 'craft')
      out.push({
        id: `hire_2nd_${st}`,
        group: '人材',
        name: `${STAGE_NAME[st]}：もう 1 人置く（増やした作業台に）`,
        expect: [st],
        base: PEOPLE_BASE[st],
        setup: (s) => void invest(s, wsOf(s).uid, 'bench'),
        apply: (s) => {
          const k = s.slots.length - 1;
          assign(s, hireFor(s, 'craft'), 'craft', k);
          setCraft(s, k, mainSku(s));
        },
      });
    else if (st === 'haul') out.push({ id: `hire_2nd_${st}`, group: '人材', name: `${STAGE_NAME[st]}：2 人目を置く`, expect: [st], base: PEOPLE_BASE[st], apply: (s) => void assign(s, hireFor(s, 'transport'), 'transport') });
    else
      out.push({
        id: `hire_2nd_${st}`,
        group: '人材',
        name: `${STAGE_NAME[st]}：2 人目を置く（2 軒目のお店に）`,
        expect: [st],
        base: PEOPLE_BASE[st],
        setup: (s) => {
          shop2('general_store', true)(s);
          setPart(s, myShops(s)[1].uid, 0);
        },
        apply: (s) => void assign(s, hireFor(s, 'shop'), 'shop', myShops(s)[1].uid),
      });
    out.push({ id: `bonus_${st}`, group: '人材', name: `${STAGE_NAME[st]}：賞与（疲れている人に）`, expect: [st], base: PEOPLE_BASE[st], setup: tired(task), apply: (s) => void bonus(s, s.staff.find((x) => x.task === task)!.hero), note: 'スタミナ 30% の人' });
    out.push({ id: `raise_${st}`, group: '人材', name: `${STAGE_NAME[st]}：昇給（1 段）`, expect: [st], base: PEOPLE_BASE[st], days: 120, apply: (s) => void raise(s, s.staff.find((x) => x.task === task)!.hero), note: '速さ +5%（小さいので 120 日で測る）' });
  }
  // 建物
  out.push({ id: 'shop_near', group: '建物', name: 'お店 2 軒目（同じ商圏・アルバイト 1）', expect: ['sell'], base: 'j_cap', apply: shop2('general_store', false), note: '処理力が詰まりのとき（需要の取り分は増えない）' });
  out.push({ id: 'shop_far', group: '建物', name: 'お店 2 軒目（離れた商圏・店員とアルバイト 1）', expect: ['sell'], apply: shop2('general_store', true, true) });
  out.push({ id: 'shop_import', group: '建物', name: '輸入品店（離れた商圏・店員とアルバイト 1）', expect: ['sell'], apply: shop2('import', true, true) });
  out.push({ id: 'shop_boutique', group: '建物', name: 'ブティック（離れた商圏・店員とアルバイト 1）', expect: ['sell'], apply: shop2('boutique', true, true) });
  out.push({ id: 'warehouse', group: '建物', name: '倉庫', expect: ['buy'], base: 'j_trip', apply: warehouse, note: '往復で運べる量（置き場所）が詰まりのとき' });
  out.push({ id: 'depot', group: '建物', name: '物流拠点（遠いお店の近くに）', expect: ['haul'], apply: depot });
  // 発掘 v2 の 4 段目：掘りきった荒れ地の復興（住民が増えて需要が上がる）・遺物の展示館
  out.push({ id: 'revive', group: '建物', name: '荒れ地の復興（掘りきって家 +N・需要 +6%）', expect: ['sell'], apply: (s) => reviveFor(s, 0), note: '荒れ地 1 か所を掘りきった（住宅の絵 2 軒・小道も）' });
  out.push({ id: 'museum', group: '建物', name: '遺物の展示館', expect: [], apply: () => {}, out: '展示館（tests/island-p1-dungeon.test.ts で確認）' });
  // 宣伝
  for (const a of ADS) out.push({ id: `ad_${a.id}`, group: '宣伝', name: a.name, expect: ['sell'], apply: ad(a.id), note: `${a.days} 日` });
  // 商品
  out.push({ id: 'goods_rec', group: '商品', name: '棚に別の商品（市場データのおすすめ）', expect: ['sell'], setup: second('Lantern:C', { stock: false }), apply: (s) => second(recommendable(s))(s) });
  out.push({
    id: 'goods_gap',
    group: '商品',
    name: '棚に gap の商品（ユーホタウンのモノクル）',
    expect: ['sell'],
    base: 'j_new',
    setup: second('Monocle:C', { stock: false }),
    apply: (s) => second('Monocle:C')(s),
  });
  // 復刻品（発掘 v2 の 3 段目）：ユーホタウンの出土品の研究を Lv3 にしてレシピを開き、空いた棚に並べる（独占のうちは他社がいない）
  out.push({
    id: 'goods_relic',
    group: '商品',
    name: '棚に復刻品を並べる（ユーホタウンの遺物を研究 Lv3 に）',
    expect: ['sell'],
    base: 'j_new',
    setup: (s) => {
      openRelicFor(s, RELIC_AUDIT);
      second(relicSku(relicKey(RELIC_AUDIT)), { stock: false })(s);
    },
    apply: (s) => second(relicSku(relicKey(RELIC_AUDIT)))(s),
    note: '売値 ×1.25・独占 4 か月',
  });
  out.push({ id: 'goods_u', group: '商品', name: 'アンコモンに替える', expect: ['sell'], check: 'yen', setup: uncommonReady, apply: toU, note: '値段 ×2.5・売り場の強さ ×1.3' });
  return out;
}

// ---------------------------------------------------------------- 判定

export interface Cell {
  base: BaseId;
  stage: Stage;
  /** (a) その段の数字（前 → 後。適用した直後と、測り終えたあとの大きいほうの差で判定） */
  a0: number;
  a1: number;
  e0: number;
  e1: number;
  /** 直後・10 日ごとのうち、いちばん大きい差 */
  gain: number;
  stopped0: boolean;
  stopped1: boolean;
  jam0: Stage;
  jam1: Stage;
  r0: Run;
  r1: Run;
  /** yen：販売の売上の見込み（前 → 後） */
  y0: number;
  y1: number;
  okA: boolean;
  okB: boolean;
}
export type Verdict = '○' | '×' | '対象外';
export interface Row {
  item: Item;
  cells: Cell[];
  verdict: Verdict;
  /** probe・profit のとき */
  p0?: number;
  p1?: number;
  why?: string;
}

const EPS = 0.05;

function measure(item: Item, base: BaseId, stage: Stage): Cell {
  const r0: Run = { made: 0, hauled: 0, sold: 0, bought: 0, rev: 0, profit: 0, brand: 0 };
  const r1: Run = { ...r0 };
  let first: Omit<Cell, 'r0' | 'r1' | 'okA' | 'okB' | 'gain' | 'e0' | 'e1'> | null = null;
  let gain = -Infinity;
  let e0 = 0;
  let e1 = 0;
  for (const ph of PHASES) {
    const s0 = baseOf(base, ph);
    item.setup?.(s0);
    const s1 = clone(s0);
    item.apply(s1);
    item.post?.(s0);
    item.post?.(s1);
    const c0 = stageCaps(s0, true);
    const c1 = stageCaps(s1, true);
    if (!first)
      first = { base, stage, a0: c0[stage].perMonth, a1: c1[stage].perMonth, stopped0: c0[stage].stopped, stopped1: c1[stage].stopped, jam0: jamOf(s0), jam1: jamOf(s1), y0: sellNow(s0).yen, y1: sellNow(s1).yen };
    gain = Math.max(gain, c1[stage].perMonth - c0[stage].perMonth);
    const days = item.days ?? RUN_DAYS;
    // (a) は、適用した直後と、10 日ごと（ゆっくり効くもの＝認知・OJT など）に比べて、いちばん大きい差で判定する
    for (let d = 0; d < days; d += 10) {
      const n = Math.min(10, days - d);
      for (const [x, r] of [
        [s0, r0],
        [s1, r1],
      ] as const) {
        const q = runDays(x, n);
        for (const k of Object.keys(q) as (keyof Run)[]) r[k] += q[k];
      }
      const a = stageCaps(s0, true)[stage].perMonth;
      const b = stageCaps(s1, true)[stage].perMonth;
      if (ph === 0) {
        e0 = a;
        e1 = b;
      }
      gain = Math.max(gain, b - a);
    }
  }
  const f = first!;
  const unstop = f.stopped0 && !f.stopped1;
  const okA = item.check === 'yen' ? f.y1 > f.y0 + 1 || gain > EPS : unstop || gain > EPS;
  // (b)：その段が詰まり（前の状態）なら、実際の売上が増えること。詰まりでなければ、減らないこと（3 つの写しの合計）
  const okB = f.jam0 !== stage && !unstop ? r1.rev >= r0.rev : r1.rev > r0.rev;
  return { ...f, e0, e1, gain, r0, r1, okA, okB };
}

export function audit(list = items()): Row[] {
  const rows: Row[] = [];
  for (const item of list) {
    if (item.out) {
      rows.push({ item, cells: [], verdict: '対象外', why: item.out });
      continue;
    }
    if (!item.expect.length) {
      // 段の数字ではなく、利益・決まった数字に効くもの
      const s0 = baseOf(typeof item.base === 'string' ? item.base : 'j_sell');
      item.setup?.(s0);
      const s1 = clone(s0);
      item.apply(s1);
      item.post?.(s0);
      item.post?.(s1);
      const days = item.days ?? RUN_DAYS;
      if (item.check === 'probe' && item.probe) {
        const before = item.probe.f(s0);
        const after0 = item.probe.f(s1);
        let p0 = before;
        let p1 = after0;
        if (item.days) {
          runDays(s0, days);
          runDays(s1, days);
          p0 = item.probe.f(s0);
          p1 = item.probe.f(s1);
        }
        const ok = item.probe.better === 'up' ? p1 > p0 : p1 < p0;
        rows.push({ item, cells: [], verdict: ok ? '○' : '×', p0, p1 });
      } else {
        const r0 = runDays(s0, days);
        const r1 = runDays(s1, days);
        rows.push({ item, cells: [], verdict: r1.profit > r0.profit ? '○' : '×', p0: r0.profit, p1: r1.profit });
      }
      continue;
    }
    const cells = item.expect.map((st) => {
      const b = typeof item.base === 'string' ? item.base : item.base?.[st] ?? JAM_BASE[st];
      return measure(item, b, st);
    });
    const bad = cells.filter((c) => !c.okA || !c.okB);
    rows.push({ item, cells, verdict: bad.length ? '×' : '○', why: bad.map((c) => `${STAGE_NAME[c.stage]}：${!c.okA ? '数字が上がらない' : ''}${!c.okA && !c.okB ? '・' : ''}${!c.okB ? '売上が増えない' : ''}`).join('／') || undefined });
  }
  return rows;
}

// ---------------------------------------------------------------- 表

const f1 = (v: number) => (Math.round(v * 10) / 10).toString();
const g = (v: number) => `${Math.round(v).toLocaleString('en-US')}`;

export function baseTable(): string {
  const out: string[] = [];
  out.push(`| 基準 | ① 調達 | ② 製造 | ③ 物流 | ④ 販売 | 詰まり | ${RUN_DAYS} 日：作った・運んだ・売れた | ${RUN_DAYS} 日の売上 |`);
  out.push('|---|---|---|---|---|---|---|---|');
  for (const id of Object.keys(BASES) as BaseId[]) {
    const s = baseOf(id);
    const c = stageCaps(s);
    const j = jamOf(s);
    const r = runDays(s, RUN_DAYS);
    out.push(`| ${BASES[id].name}（${id}） | ${STAGES.map((k) => (c[k].stopped ? '止まっている' : `${k === j ? '**' : ''}${c[k].perMonth}${k === j ? '**' : ''}`)).join(' | ')} | ${STAGE_NAME[j]} | ${r.made}・${r.hauled}・${r.sold} | ${g(r.rev)} G |`);
  }
  return out.join('\n');
}

export function table(rows: Row[]): string {
  const out: string[] = [];
  const n = (v: Verdict) => rows.filter((r) => r.verdict === v).length;
  out.push(`判定：○ ${n('○')}・× ${n('×')}・対象外 ${n('対象外')}（全 ${rows.length}）`);
  // スキルツリーの 2 区分：研究パネル（RP・レベルなし）とお金パネル（資金・Lv1〜5。レベル上げの行を含む）
  for (const g0 of ['研究パネル', 'お金パネル'] as const) {
    const rs = rows.filter((r) => r.item.group === g0);
    const m = (v: Verdict) => rs.filter((r) => r.verdict === v).length;
    out.push(`- ${g0}：○ ${m('○')}・× ${m('×')}・対象外 ${m('対象外')}（${rs.length} 行）`);
  }
  out.push('');
  out.push(`| 投資 | 種類 | 効くはずの段 | 基準 | (a) 段の数字 前→後 | 詰まり 前→後 | (b) ${RUN_DAYS} 日 ×${PHASES.length}：作った・運んだ・売れた 前→後 | (b) 売上 前→後 | 判定 | 備考 |`);
  out.push('|---|---|---|---|---|---|---|---|---|---|');
  for (const r of rows) {
    const it = r.item;
    const verdict = r.verdict === '×' ? '<span style="color:#d33">**×**</span>' : r.verdict;
    const note = [it.note, r.why].filter(Boolean).join('。');
    if (!r.cells.length) {
      const what = it.out ? '—' : it.check === 'probe' ? it.probe!.name : `利益（${it.days ?? RUN_DAYS} 日）`;
      const val = r.p0 != null ? `${it.check === 'profit' ? g(r.p0) : f1(r.p0)} → ${it.check === 'profit' ? g(r.p1!) : f1(r.p1!)}` : '—';
      out.push(`| ${it.name}（${it.id}） | ${it.group} | ${what} | — | ${it.check === 'probe' ? val : '—'} | — | — | ${it.check === 'profit' ? `${val}（利益）` : '—'} | ${verdict} | ${note} |`);
      continue;
    }
    for (const [k, c] of r.cells.entries()) {
      const a = it.check === 'yen' ? `${g(c.y0)} → ${g(c.y1)} G（見込みの売上）` : `${c.stopped0 ? '止' : f1(c.a0)} → ${c.stopped1 ? '止' : f1(c.a1)}（最大の差 ${c.gain >= 0 ? '+' : ''}${f1(c.gain)}）`;
      const b = `${c.r0.made}・${c.r0.hauled}・${c.r0.sold} → ${c.r1.made}・${c.r1.hauled}・${c.r1.sold}`;
      const rev = `${g(c.r0.rev)} → ${g(c.r1.rev)}${c.r1.rev > c.r0.rev ? '' : c.jam0 === c.stage ? ' ⚠' : ''}`;
      out.push(`| ${k ? '〃' : `${it.name}（${it.id}）`} | ${k ? '' : it.group} | ${STAGE_NAME[c.stage]} | ${c.base} | ${a} | ${STAGE_NAME[c.jam0]} → ${STAGE_NAME[c.jam1]} | ${b} | ${rev} | ${k ? '' : verdict} | ${k ? '' : note} |`);
    }
  }
  return out.join('\n');
}

export const AUTO_BEGIN = '<!-- island:audit:begin（npm run island:audit が書き換える。手で直さない） -->';
export const AUTO_END = '<!-- island:audit:end -->';
export function writeAudit(path: string, rows: Row[], existing: string | null, ms: number) {
  const body = [AUTO_BEGIN, '', `最終更新：npm run island:audit（${rows.length} 項目・計測 ${(ms / 1000).toFixed(1)} 秒）`, '', '### 基準の状態', '', baseTable(), '', '### 投資ごとの効き目', '', table(rows), '', AUTO_END].join('\n');
  let doc: string;
  if (existing && existing.includes(AUTO_BEGIN) && existing.includes(AUTO_END)) doc = existing.slice(0, existing.indexOf(AUTO_BEGIN)) + body + existing.slice(existing.indexOf(AUTO_END) + AUTO_END.length);
  else doc = `# 投資の効き目の監査\n\n${body}\n`;
  writeFileSync(path, doc);
  return doc;
}
