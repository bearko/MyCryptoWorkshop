/**
 * フェーズ 1 の中身（画面に依存しない。tests/island-p1.test.ts）。
 * 1 日ごとに：工事 → 従業員（休む・働く）→ クラフト → 運搬 → 陳列と販売。月末に報告とランキング。
 */
import { t } from '../../i18n';
import { allSeries, heroById } from '../../game/catalog';
import { DEF } from '../defs';
import { cells, type Dir } from '../sim';
import { book, brandAdd, brandPull, emptyLedger, newBooks, newLand, runSector, sectorProfile, type BrandEv, type Books, type Land, type LedgerKey } from './company';
import {
  ADS,
  levelCost,
  lvMulOf,
  OLD_DIG_TOOLS,
  DIG,
  DIG_AUTO,
  DIG_BALANCE,
  DUNGEON_DIG,
  DUNGEON_FINDS,
  WASTE,
  DIG_ODDS,
  DIG_SITES,
  RESEARCH_NEED,
  RP_GAIN,
  RP_PER_DUST,
  START_RP,
  TABLET_LAYERS,
  TABLETS,
  isResearch,
  researchLv,
  rpCost,
  type DigTier,
  maxLv,
  FX_LIN,
  type FxKind,
  AWARE,
  AWARE_GOODS,
  TRAIN,
  STORE,
  DEV,
  ENTRY_AFTER,
  MARKET_GROWTH,
  RIVAL,
  BUILD_CATS,
  BRAND,
  TIERS,
  type Tier,
  GATE,
  PROC,
  procNeed,
  HIRE_POOL,
  INTEL,
  INVEST,
  SKILL_TO_INVEST,
  TOP_STREAK,
  MISSIONS,
  MOVE,
  PAY,
  MATS,
  P1B,
  PRODUCT,
  PRODUCTS,
  RELICS,
  isRelic,
  relicOf,
  RIVAL_GROWTH,
  SHOP,
  CHEAP_RATE,
  SECTORS,
  rivalDef,
  rivalsOf,
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
  type Mat,
  type Rar,
  type Sku,
  type Stats,
  type Task,
  SIDE,
  MARKET,
  DEPOT,
  anyOfMet,
  techSkill,
  SKILLS,
  type Skill,
  type ProductDef,
  type SectorProfile,
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
  /** 前の便・往復で余った日の端数（次に持ち越す。運搬係・調達係） */
  lag?: number;
}

export interface Slot {
  sku: Sku | null;
  worker: number | null;
  progress: number;
  running: boolean;
  /** 自動製造（素材があるかぎり続けて作る） */
  repeat: boolean;
  /** 自動製造でないとき、あと何個作るか（1 ロット始めるごとに減る） */
  left?: number;
  /** できあがった日に余った進み（次のロットに持ち越す。次の日に始められなければ消える） */
  over?: number;
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
  /** 品出しの端数（次の日に持ち越す） */
  dcarry?: number;
}

export interface Trip {
  hauler: number;
  /** 出たところ（工房か物流拠点の uid。以前のセーブには無い＝工房） */
  from?: number;
  /** 荷物を下ろした（行きが終わった）。帰りは空の荷車 */
  dropped?: boolean;
  to: number;
  cargo: Partial<Record<Sku, number>>;
  left: number;
  total: number;
}

export interface RivalState {
  id: string;
  sells: Partial<Record<string, number>>;
  base: number;
  /** 商品ごとの、扱い始めたときの売り場の強さ（伸びの頭打ち RIVAL.pullCap の基準）。以前のセーブには無い */
  pull0?: Partial<Record<string, number>>;
  /** 追随で入った商品：売れない月が続いた数（RIVAL.weakMonths で撤退）。もとから扱っている商品は入らない */
  follow?: Partial<Record<string, number>>;
  /** 撤退した商品（もう追随しない） */
  quit?: string[];
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
  /** その月の流れ（商品の数）：買った素材・作った・運んだ・売れた。以前のセーブには無い */
  flow?: { bought: number; made: number; hauled: number; sold: number };
  /** 月のはじめと終わりの資金 */
  money?: { start: number; end: number };
  /** その月に上がったブランド力 */
  brand?: number;
  /** その月のボトルネック（締めの時点） */
  bottleneck?: Stage;
  /** 締めの時点で続けて 1 位の月の数（制覇の「いま 1 / 2」）。以前のセーブには無い */
  streak?: number;
  /** この月に他社の反撃が始まった（宣伝を始めた他社＝その月の 2 位・月数） */
  rally?: { by: string; months: number };
  /** この月に制覇してもらったエンブレム */
  emblem?: number;
  /** OJT で能力が上がった人の数 */
  ojt?: number;
  /** 月次 PDCA：来月の見込み（売上・利益） */
  forecast?: { sales: number; profit: number };
  /** 今月の出土品：新発見・研究 Lv が上がった数・入った RP（発掘場のあるセクタ） */
  dig?: { found: number; lv: number; rp: number };
  /** 売上のうち復刻品のぶん（G。売っていなければ無い） */
  relic?: number;
  /** 復興（発掘 v2 の 4 段目）：掘りきった荒れ地の数 / 荒れ地の数・ダンジョンが見つかっている（発掘場のあるセクタ） */
  revive?: { done: number; all: number; dungeon: boolean };
  /** 遺物の展示館の来館者・入館料の収入・展示の価値（館があるとき） */
  museum?: { visitors: number; income: number; value: number };
}

export interface Flags {
  /** 市場データを開いた */
  data: boolean;
  /** 最初の月の報告のあとのランキングの紹介を見た */
  ranking: boolean;
  /** クリアのお祝いを見た */
  clearSeen: boolean;
  /** 資金が少なくなったときに、マインちゃんがバイトを紹介した */
  side?: boolean;
  /** チュートリアルの「初売上までの流れ」を見た */
  tour?: boolean;
  /** スキルツリーの本社パネルを開放した */
  hq?: boolean;
  /** はじめて売れた（ブランド力） */
  firstSale?: boolean;
  /** チュートリアル：工房の設定のあとの説明を見た */
  craftTalk?: boolean;
  /** チュートリアル：建ててもらう場所（工房とお店。運ぶ様子が見えるよう、少し離す） */
  spots?: Record<string, [number, number, Dir]>;
  /** 「人材の募集」を開放したあと、人事タブで人材登用のアンロックの演出を見た */
  hireUnlocked?: boolean;
  /** 建築の一覧で、ロックが外れる演出を見たカテゴリ */
  buildCats?: string[];
  /** 到着の案内を見たセクタ（id） */
  sectorIntro?: string[];
  /** Common ランド制覇のお祝いを見た */
  landCommon?: boolean;
  /** Uncommon ランド制覇のお祝いを見た */
  landUncommon?: boolean;
  /** 市場データを開いたセクタ（id）。2 か所目以降のリサーチの案内に使う */
  dataSeen?: string[];
  /** スキルツリーの開いた外周（U・R・E・L）。そのランクのセクタに出店したあと、ツリーを開いたときの演出で開く */
  rings?: Tier[];
  /**
   * 発掘との出会い（2 か月目の途中、初めて手が空いたとき。digmeet.ts）：会話のあと 'tap'（工房をタップ → 吹き出しの「⛏ 発掘場」）→
   * 'open'（開いた。最初の出土を待つ）→ 'skill'（研究ポイントの説明のあと、スキルツリーを開くまで）→ 'done'。無ければまだ出会っていない
   */
  digMeet?: 'tap' | 'open' | 'skill' | 'done';
  /** 初めて復刻品のレシピが開いたときのマインちゃんの会話を見た */
  relicTalk?: boolean;
  /**
   * スキルツリーの発掘の枝（発掘 v2 の 2 段目）：'new'＝出会いのあと、ツリーで雲から出てきた（マインちゃんの一言を 1 回だけ）／'seen'＝一言を出し終えた。
   * 無ければ、まだ雲の中（出会いの前、または出会いのあとまだツリーを開いていない）
   */
  digBranch?: 'new' | 'seen';
  /** 「深い層の許可が要る」マスを初めて押した（マインちゃんの一言を出した） */
  digDeepTip?: boolean;
  /** 発掘画面で、初めてひびの隙間から何かが見えた（マインちゃんの一言を出した） */
  digPeekTip?: boolean;
  /** 初めて荒れ地が復興したときのマインちゃんの一言を出した */
  reviveTalk?: boolean;
  /** 初めてダンジョンの入り口が見つかったときのマインちゃんの一言を出した */
  dungeonTalk?: boolean;
  /** 遺物の展示館を建てられるようになったときのマインちゃんの一言を出した */
  museumTalk?: boolean;
}

export interface P1State {
  /** セーブの版（2：地層の発掘と研究ポイント／3：荒れ地と発掘許可・15 秒の発掘／4：発掘のスキルツリー／5：発掘の正面の壁／6：復興・ダンジョン・展示館。1〜5 のセーブは deserializeP1 で順に移す） */
  v: 1 | 2 | 3 | 4 | 5 | 6;
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
  /** 取ったパネルのレベル（skills に入っているものは最低 1。無ければ 1。docs/ISLAND_PHASE1.md「パネルのレベル」） */
  skillLv: Record<string, number>;
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
  /** 能力値の版（2：全ヒーロー中の最大が 100 になるように縮めた） */
  statV?: number;
  /** 今月のバイト代（他店でバイト） */
  sideMonth?: number;
  /** 関所の通行料を払って開通したか */
  gateOpen?: boolean;
  /** このセクタ（ランドセクタの id とランク）。以前のセーブは c1・C */
  sector?: string;
  /** このセクタに来た日（開業準備の日数を数える） */
  arrived?: number;
  tier?: Tier;
  /** 会社ぜんたい：ブランド力・その履歴・帳簿・ランド（ほかのセクタ） */
  brand?: number;
  brandLog?: BrandEv[];
  books?: Books;
  land?: Land;
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
  /** 卸問屋への注文（納期に届く） */
  orders?: Order[];
  /** 月のはじめの資金とブランド力（報告の「この月で」用） */
  moneyStart?: number;
  brandStart?: number;
  /** チュートリアルの流れの案内：お店の中を見せるまで、売るのを待つ */
  holdSales?: boolean;
  /** ゲームの進行速度（1・1.5・2。スキルで選べる） */
  pace?: number;
  /** 月末ポーズ：月次報告を出したあと、「次の月に進む」を押すまで時間を止める（以前のセーブには無い＝止めない） */
  monthPause?: boolean;
  /** 技の修行（会社で 1 つずつ。終わると skills に入る）。docs/ISLAND_PHASE1.md「技の修行」 */
  training?: Training | null;
  /** 新商品の認知（このセクタ・商品ごと。0〜1。無い商品は AWARE_GOODS.start）。docs/ISLAND_PHASE1.md「新商品の認知」 */
  known: Partial<Record<string, number>>;
  /** このセクタで続けて 1 位の月の数（TOP_STREAK で制覇＝cleared）。docs/ISLAND_PHASE1.md「制覇」 */
  topStreak?: number;
  /** 他社の反撃の残りの月（このセクタ。0 で終わり）。docs/ISLAND_PHASE1.md「他社の反撃」 */
  rally?: number;
  /** 会社のエンブレム（関所の開通・セクタの制覇で 1 つずつ）。スキルツリーの外周のパネルの条件（数を持っていればよい） */
  emblem: number;
  /** 会社の研究ポイント（RP）。採掘でだけ貯まる。研究パネルを開くのに使う（docs/ISLAND_PHASE1.md「地層の発掘と研究ポイント」） */
  rp: number;
  /** 研究ノート：エクステごとの掘った数（会社で共有。研究レベルは researchLv。上限（研究の目利き）を超えても数は貯める） */
  research: Record<number, number>;
  /** 研究の数の端数（深い層ほど研究が進みやすい：層 n で 1 + 0.25 × (n − 1) × 倍率 個ぶん。端数は持ち越し） */
  resCarry?: Record<number, number>;
  /** 研究 Lv の RP を払い終えた上限（研究の目利きで上限が上がったら、その場で上がったぶんの RP を払う） */
  resCapPaid?: number;
  /** 版 3 までのセーブの下限（研究 Lv・掘れる層を下げない。版 4 の移し替えで決める） */
  digOld?: { cap?: number; deep?: Partial<Record<DigTier, number>> };
  /** 掘り出した石板（id） */
  tablets: string[];
  /** 調査依頼状（そのランクのセクタへ出店できる）。Common のお題をそろえて発表すると 'U' */
  letters: Tier[];
  /** 研究成果を発表したセクタ（id） */
  presented: string[];
  /** このセクタの発掘場（荒れ地 4 か所。Common・Uncommon のセクタだけ。無ければ null） */
  dig: DigState | null;
  /** 発掘作業（15 秒）の途中。月の締めは行うが、月末ポーズと月次報告の画面は作業のあとにまとめて（docs/ISLAND_PHASE1.md「15 秒の発掘」） */
  digRun?: DigRun | null;
  /** 「名物店主」（以前の ✨）にしたお店（このセクタの uid） */
  dustShop?: number | null;
  /** きのう売れた数（商品ごと。POS レジで市場データに出す） */
  yday?: Partial<Record<string, number>>;
  /**
   * 復刻品のレシピ（会社で共有。商品キー → 開いた日・初めて売った日＝独占の始まり）。研究 Lv3 で開く。
   * docs/ISLAND_PHASE1.md「3. 復刻品」
   */
  recipes: Record<string, RelicRec>;
  /** 遺物の展示館（会社で 1 つ。どのセクタに建ててもよい。展示・増築の段・節目のボーナスは会社のもの）。docs/ISLAND_PHASE1.md「4. 復興・ダンジョン・展示館」 */
  museum?: MuseumState;
  /** ダンジョンの入り口が見つかったセクタ（会社で共有。研究ノートの「ダンジョン」のタブ） */
  dungeons?: string[];
}

/** 遺物の展示館：建っている場所（無ければ null）・展示（枠ごとのエクステの id。空きは null）・展示室の増築の段・届いた節目の数・先月の来館 */
export interface MuseumState {
  at: { sector: string; uid: number } | null;
  items: (number | null)[];
  lv: number;
  marks: number;
  last?: { visitors: number; income: number; value: number };
}

/** 復刻品のレシピ 1 つ：開いた日（並びの順）・初めて売った日（独占はここから DIG_BALANCE.relic.monopolyMonths か月） */
export interface RelicRec {
  at: number;
  sold?: number;
}

/** 技の修行：スキル・修行に出た職人・残りの日数・はじめの日数・修行の前の担当（同じセクタなら、空いていれば戻す） */
export interface Training {
  id: string;
  hero: number;
  left: number;
  total: number;
  from?: { task: Task; target: number | string | null; sector: string } | null;
}

/** 卸問屋への注文（ロット単位）。納期に問屋の人が工房まで運んできて、工房に入ったら在庫になる */
export interface Order {
  id: number;
  m: Mat;
  qty: number;
  /** 納期までの日数（はじめの日数） */
  left: number;
  total: number;
  /** 運んでくる問屋の人（ヒーロー） */
  courier: number;
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

/** 費用：このセクタの月の報告（monthCost）と、会社の帳簿の両方へ。as：帳簿では別の科目に（通行料 → fees） */
export function spend(s: P1State, k: keyof Report['costs'], v: number, as?: LedgerKey) {
  s.monthCost[k] = (s.monthCost[k] ?? 0) + v;
  book(s, as ?? (k === 'materials' ? 'mats' : k), v);
}
export const N = 16;
/** 道路：2 マス目から 5 マスおき（16 マスなら 2・7・12、21 マスなら 2・7・12・17） */
export const roadLines = (n: number) => Array.from({ length: Math.ceil((n - 3) / 5) }, (_, k) => 2 + 5 * k).filter((x) => x < n - 1);
export function groundOf(n: number): Ground[] {
  const r = roadLines(n);
  const g: Ground[] = [];
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) g.push(r.includes(i) || r.includes(j) ? 'road' : 'grass');
  return g;
}

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

function lotFree(s: P1State, id: string, i: number, j: number, dir: Dir, ignore?: number, revived = false) {
  return cells(DEF[id], i, j, dir).every(([x, y]) => {
    // 荒れ地（発掘許可をもらって掘りきると復興して、自社の建物を建てられるようになる。町の建物は建てない）
    if (revived ? wasteBlock(s, x, y) : isWaste(s, x, y)) return false;
    const o = ground(s, x, y) === 'grass' ? occupant(s, x, y) : undefined;
    return o !== undefined && (!o || o.uid === ignore);
  });
}

/**
 * 区画：道路が縦横 3 本ずつ（Uncommon より上は広く 4 本）。住宅・駅・公園・他社の店が建っている。
 * tier：ランドセクタのランク。上のランクほど地図が広く、他社が強く、お客さんが多い（data.ts の TIERS）。
 */
export function newP1(seed = Math.floor(Math.random() * 1e9), tier: Tier = 'C', sector = 'c1'): P1State {
  const T = TIERS[tier];
  const prof = SECTORS.find((x) => x.id === sector)?.profile;
  const rivalDefs = rivalsOf(sector);
  const n = tier === 'C' ? N : T.n;
  const g = groundOf(n);
  const s: P1State = {
    v: 6,
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
    routes: (Object.keys(MATS) as Mat[]).filter((m) => prof?.routesOpen || MATS[m].open || !!prof?.routes?.includes(m)),
    staff: START_STAFF.map((id) => newStaff(id, 0)),
    slots: [],
    stock: {},
    shops: {},
    trips: [],
    skills: [],
    skillLv: {},
    rivals: rivalDefs.map((r) => ({ id: r.id, sells: Object.fromEntries(Object.entries(r.sells).map(([k, v]) => [k, (v ?? 0) * T.rival])), base: r.base * T.rival * (prof?.rivalMul ?? 1) })),
    demand: Object.fromEntries(PRODUCTS.map((p) => [p.key, baseDemand(p, tier, prof)])),
    monthSales: {},
    rivalSales: Object.fromEntries(rivalDefs.map((r) => [r.id, 0])),
    monthCost: { materials: 0, wages: 0, part: 0, upkeep: 0, build: 0, ads: 0 },
    alone: {},
    reports: [],
    hirePool: [],
    cleared: false,
    topStreak: 0,
    rally: 0,
    flags: { data: false, ranking: false, clearSeen: false, buildCats: ['base'] },
    tut: 0,
    tutV: 3,
    statV: 2,
    sector,
    tier,
    brand: 0,
    brandLog: [],
    books: newBooks(),
    emblem: 0,
    rp: START_RP,
    research: {},
    resCapPaid: DIG_BALANCE.tree.cap[0],
    tablets: [],
    letters: [],
    presented: [],
    dig: newDig(sector),
    dustShop: null,
    yday: {},
    recipes: {},
    ...extras(),
  };
  populate(s);
  s.hirePool = pickHires(s);
  return s;
}

const TIER_ORDER: Tier[] = ['C', 'U', 'R', 'E', 'L'];
/** 商品がそのランクのセクタで出るか（tier より下のセクタでは需要が無い） */
export const tierOk = (p: ProductDef, tier: Tier) => TIER_ORDER.indexOf(p.tier ?? 'C') <= TIER_ORDER.indexOf(tier);
/**
 * セクタの商品の月の需要（はじめ）：もとの需要 × ランク × セクタの倍率。
 * 技が要る商品は、そのセクタの gap（まだ誰も売っていない勝ち筋）でなければ MARKET.niche 倍（その町ではまだあまり求められていない）
 */
export function baseDemand(p: ProductDef, tier: Tier, prof?: SectorProfile): number {
  if (!tierOk(p, tier)) return 0;
  // 復刻品：どのセクタでも売れる（昔の Lime の品として人気）。ランクの需要 × 町の大きさ（家の数）に比例
  if (p.relic) return p.demand * TIERS[tier].demand * (prof?.homes ?? 1);
  const niche = p.tech && !prof?.gap?.includes(p.key) ? MARKET.niche : 1;
  return p.demand * TIERS[tier].demand * (prof?.demand?.[p.key] ?? 1) * niche;
}

/** フェーズ 1 のあとから足した項目の初期値（古いセーブにも足す） */
function extras(): Pick<P1State, 'dev' | 'lab' | 'ads' | 'intel' | 'rivalProd' | 'rivalLast' | 'missions' | 'monthUnits' | 'unitsU' | 'ws' | 'proc' | 'matUsed' | 'matUsedLast' | 'util' | 'utilLast' | 'buyTrip' | 'known'> {
  return {
    known: {},
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
  // 16 マスの区画での位置を、広い区画では同じ割合のところへ
  const k16 = (s.n - 1) / 15;
  const at = (p: [number, number]): [number, number] => [Math.round(p[0] * k16), Math.round(p[1] * k16)];
  placeTown(s, 'station', r, 'town', at([7, 1]));
  placeTown(s, 'park', r, 'town', at([9, 9]));
  placeTown(s, 'police', r, 'town', at([13, 4]));
  placeTown(s, 'wholesale', r, 'town', at([1, 14]));
  placeTown(s, GATE_ID, r, 'town', at(GATE.at));
  const near: [number, number][] = [[4, 4], [10, 5], [5, 10], [10, 10]];
  rivalsOf(s.sector).forEach((rv, k) => placeTown(s, rv.store, r, rv.id, at(near[k])));
  const homes = ['house', 'cottage', 'garage_house', 'japanese_house', 'apartment', 'manor'];
  // 住宅：外側の区画を中心に、空き地を 4 割ほど残す
  // セクタの個性：町の大きさ（住宅の数の倍率）
  const nHomes = Math.round(46 * ((s.n * s.n) / (N * N)) * (sectorProfile(s).homes ?? 1));
  for (let k = 0; k < nHomes; k++) placeTown(s, homes[Math.floor(r() * homes.length)], r, 'town');
}

// ---------------------------------------------------------------- 従業員

/**
 * 能力値の縮め方：MCH の値のままだと高ランクのヒーローは 100 を超えるので、
 * PHY・INT・AGI それぞれ、全ヒーロー中の最大が 100 になるように掛ける。HP はスタミナに使うのでそのまま。
 */
type StatKey = 'phy' | 'int' | 'agi';
const STAT_KEYS: StatKey[] = ['phy', 'int', 'agi'];
let statMax: Record<StatKey, number> | null = null;
export function heroStatMax(): Record<StatKey, number> {
  if (statMax) return statMax;
  const m: Record<StatKey, number> = { phy: 1, int: 1, agi: 1 };
  for (const h of heroById.values() as Iterable<unknown>) {
    const st = (h as { stats?: Stats }).stats;
    if (st) for (const k of STAT_KEYS) m[k] = Math.max(m[k], st[k]);
  }
  return (statMax = m);
}
/** MCH の能力値 → このゲームの能力値（0〜100） */
export function scaleStats(raw: Stats): Stats {
  const m = heroStatMax();
  return { hp: raw.hp, phy: Math.round((raw.phy * 100) / m.phy), int: Math.round((raw.int * 100) / m.int), agi: Math.round((raw.agi * 100) / m.agi) };
}

export function heroStats(id: number): Stats {
  const h = heroById.get(id) as unknown as { stats?: Stats } | undefined;
  return scaleStats(h?.stats ?? { hp: 150, phy: 50, int: 50, agi: 50 });
}

/** 速さ 1.0 の基準：見習いの MCHアーティストの製造の適性 */
let aptBase = 0;
export const speedOf = (apt: number) => apt / (aptBase ||= aptitude(heroStats(START_STAFF[2]), 'craft') || 28);

function newStaff(hero: number, wage: number): Staff {
  const stats = heroStats(hero);
  return { hero, stats, stamina: stats.hp, task: null, target: null, resting: false, wage, explore: 0 };
}

/** 月給は MCH の能力値のまま（縮める前）の合計で決める */
export const wageOf = (hero: number) => {
  const s = (heroById.get(hero) as unknown as { stats?: Stats } | undefined)?.stats ?? { hp: 150, phy: 50, int: 50, agi: 50 };
  return Math.round((s.phy + s.int + s.agi) * WAGE_PER_STAT);
};

/** アンコモンのヒーロー（スキル「憧れの職場」で雇える候補に入る） */
let uncommons: number[] | null = null;
const uncommonHeroes = () =>
  (uncommons ??= ([...(heroById.values() as Iterable<unknown>)] as { id: number; rarity?: string; stats?: unknown }[]).filter((h) => h.rarity === 'Uncommon' && h.stats).map((h) => h.id));

/** 雇える候補の数：3 人（採用枠の拡大で 4・憧れの職場で 5） */
export const hireSlots = (s: P1State) => (has(s, 'b_scout') ? 5 : has(s, 'slots') ? 4 : 3);
function pickHires(s: P1State): number[] {
  const r = rng(s.seed + s.reports.length * 7919 + (s.books?.months.length ?? 0) * 31);
  const scout = has(s, 'b_scout');
  const free = (id: number) => heroById.has(id) && !s.staff.some((x) => x.hero === id);
  const pool = [...HIRE_POOL, ...(scout ? uncommonHeroes() : [])].filter(free);
  const out: number[] = [];
  // ヘッドハンティング：レアのヒーローを 1 人
  if (has(s, 'headhunt')) {
    const rp = rareHeroes().filter(free);
    if (rp.length) out.push(rp[Math.floor(r() * rp.length)]);
  }
  while (out.length < hireSlots(s) && pool.length) out.push(pool.splice(Math.floor(r() * pool.length), 1)[0]);
  return out;
}

export const has = (s: Pick<P1State, 'skills'>, skill: string) => s.skills.includes(skill);
/** パネルのレベル（未取得 0。取ったものは最低 1） */
export const lvOf = (s: Pick<P1State, 'skills' | 'skillLv'>, id: string) => (s.skills.includes(id) ? Math.max(1, s.skillLv?.[id] ?? 1) : 0);
/** レベルの効果の倍率：未取得 0、取得済み 1 + 0.25(lv − 1)（Lv5 で 2） */
export const lvMul = (s: Pick<P1State, 'skills' | 'skillLv'>, id: string) => lvMulOf(lvOf(s, id));
/** 掛け算型の下げ（日数 −20% など）：1 − v × 倍率（下げは −80% まで） */
const cut = (s: Pick<P1State, 'skills' | 'skillLv'>, id: string, v: number) => Math.max(0.2, 1 - v * lvMul(s, id));
/** 汎用の効き目の合計のキャッシュ（skills・skillLv が入れ替わったら作り直す） */
const fxCache = new WeakMap<object, { len: number; lv: object | undefined; sums: Partial<Record<FxKind, number>> }>();
/**
 * 汎用の効き目（Skill.fx）の合計：取ったパネルの fx の v × 倍率（lot・brand は v × レベル。レベルごとの表 at があればその値）と、
 * 解放型の Lv2 からの効果（Skill.up）の v ×（レベル − 1）。docs/ISLAND_PHASE1.md「汎用の効き目」
 */
export function fxSum(s: Pick<P1State, 'skills' | 'skillLv'>, kind: FxKind): number {
  const hit = fxCache.get(s.skills);
  if (hit && hit.len === s.skills.length && hit.lv === s.skillLv) return hit.sums[kind] ?? 0;
  const sums: Partial<Record<FxKind, number>> = {};
  for (const id of s.skills) {
    const k = SKILL[id];
    if (!k || (!k.fx && !k.up)) continue;
    const lv = lvOf(s, id);
    // レベルごとの表（発掘の枝）があれば、その Lv の値
    for (const f of k.fx ?? []) sums[f.kind] = (sums[f.kind] ?? 0) + (f.at ? (f.at[Math.min(f.at.length, lv) - 1] ?? 0) : f.v * (FX_LIN.includes(f.kind) ? lv : lvMulOf(lv)));
    for (const f of k.up ?? []) sums[f.kind] = (sums[f.kind] ?? 0) + f.v * (lv - 1);
  }
  fxCache.set(s.skills, { len: s.skills.length, lv: s.skillLv, sums });
  return sums[kind] ?? 0;
}
/** 汎用の下げ（日数・値段など）：1 − 合計（−80% まで） */
export const fxCut = (s: Pick<P1State, 'skills' | 'skillLv'>, kind: FxKind) => Math.max(0.2, 1 - fxSum(s, kind));
/** 解放型のパネルの Lv2 からの個別の効き目：v ×（レベル − 1） */
export const upOf = (s: Pick<P1State, 'skills' | 'skillLv'>, id: string, v: number) => v * Math.max(0, lvOf(s, id) - 1);
export const staffOf = (s: P1State, hero: number) => s.staff.find((x) => x.hero === hero) ?? null;
/** 他店でのバイトの日給 */
export const sidePay = (st: Staff) => Math.round(SIDE.pay * speed(st, 'side'));
/** スキルで足す適性：マニュアル整備 +3（すべての仕事）・名工の作業台（✨）+15（製造・修行） */
export const aptBonus = (s: P1State | undefined, task: Task) => (!s ? 0 : 3 * lvMul(s, 'manual') + (task === 'craft' || task === 'train' ? 15 * lvMul(s, 'd_craft') : 0) + fxSum(s, 'apt'));
/** 適性（能力値 ＋ スキルで足すぶん） */
export const aptOf = (s: P1State | undefined, st: Pick<Staff, 'stats'>, task: Task) => aptitude(st.stats, task) + aptBonus(s, task);
/** 作業の速さ。s を渡すとスキルの適性（マニュアル整備・名工の作業台）も入る */
export const speed = (st: Staff, task: Task, s?: P1State) => speedOf(aptOf(s, st, task)) * (1 + PAY.raiseSpeed * (st.lv ?? 0));
/** 休むと 1 日に戻るスタミナ（休憩室・福利厚生で +50% ずつ） */
export const restRateOf = (s: P1State) => STAMINA.rest * (1 + 0.5 * lvMul(s, 'lounge') + 0.5 * lvMul(s, 'welfare') + fxSum(s, 'rest'));
/**
 * 働くと 1 日に減るスタミナ。職人：職人の休憩所・職人の椅子・5S（減る）、夜間稼働（増える）。
 * 店員：営業時間の延長（増える）。シフト制：みんな減る
 */
export function drainOf(s: P1State, st: Pick<Staff, 'task'>): number {
  const easy =
    (st.task === 'craft' ? (invLv(myWorkshop(s), 'breakroom') > 0 ? 0.7 : 1) * cut(s, 'chair', 0.3) * cut(s, 'five_s', 0.1) * (has(s, 'night') ? 1.2 : 1) : 1) *
    (st.task === 'shop' && has(s, 'hours') ? 1.2 : 1) *
    // 常駐の交代制：常駐で働く日（作業していない日）の発掘隊の減り −15%／Lv
    (st.task === 'dig' && !s.digRun ? fxCut(s, 'dig.relay') : 1) *
    cut(s, 'shift', 0.2) *
    fxCut(s, 'stamina');
  return STAMINA.work * easy;
}
/**
 * 稼働率（0〜1）：これから 30 日のうち、働ける日の割合。いまのスタミナと休み中かどうかから、
 * 「働く（drainOf ずつ減る）→ 疲れたら休む（restRateOf ずつ戻る）」を 30 日ぶんたどる（日を連続の量として数える）。
 * SCM の数字（stageCaps）は、担当の人ごとにこれを掛ける。休憩室・シフト制・職人の椅子・賞与などが数字に出る。
 * docs/ISLAND_PHASE1.md「稼働率」
 */
export function uptime(s: P1State, st: Staff): number {
  const hp = st.stats.hp;
  const lo = hp * STAMINA.tired;
  const hi = hp * STAMINA.back;
  const d = drainOf(s, st);
  const r = restRateOf(s);
  // いまの山（いまのスタミナで働ける日 → 疲れて休む日）はそのまま数え、そのあとは「働く・休む」をくり返したときの割合で
  const steady = r / (r + d);
  let left = DAYS;
  let work = 0;
  if (!st.resting) {
    const w0 = Math.min(left, Math.max(0, (st.stamina - lo) / d));
    work += w0;
    left -= w0;
  }
  if (left > 0) {
    const r0 = Math.min(left, Math.max(0, (hi - (st.resting ? st.stamina : lo)) / r));
    left -= r0;
  }
  work += left * steady;
  return work / DAYS;
}
/** ERP・基幹システム刷新（✨）：全段の「ひと月に流せる数」の倍率 */
export const flowMul = (s: P1State) => 1 + 0.05 * lvMul(s, 'erp') + 0.1 * lvMul(s, 'd_sys') + fxSum(s, 'flow');

/** 仕事を割り当てる。前の仕事からは外れる */
export function assign(s: P1State, hero: number, task: Task | null, target: number | string | null = null): string | null {
  const st = staffOf(s, hero);
  if (!st) return 'no-staff';
  // 修行中の職人は、修行が終わるまでほかの仕事に就けない
  if (st.task === 'train') return 'training';
  // 発掘隊の人数の上限（発掘隊の役所）。古いセーブで上限を超えていたら、そのまま（新しくは付けられない）
  if (task === 'dig' && st.task !== 'dig' && s.staff.filter((x) => x.task === 'dig').length >= crewCap(s)) return 'crew-full';
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
    if (!MATS[m] || hasRoute(s, m)) return 'no-route';
    st.explore = 0;
  } else if (task === 'intel') {
    const r = target as string;
    if (!s.rivals.some((x) => x.id === r)) return 'no-rival';
    if (intelLv(s, r) >= INTEL.length) return 'done';
  } else if (task === 'side') {
    if (!s.rivals.some((x) => x.id === target)) return 'no-rival';
  } else if (task === 'dig') {
    // 発掘隊：荒れ地のあるセクタだけ（働くのは発掘作業のあいだだけ）
    if (!s.dig) return 'no-site';
  }
  st.task = task;
  st.target = target;
  return null;
}

/**
 * 休憩中のヒーローが仕事に戻るまでの日数（スタミナが STAMINA.back まで戻る日。休憩中でなければ 0）。
 * ヒーロー選びで休憩中のカードを押したときの「休憩中（あと N 日）」
 */
export function restDaysLeft(s: P1State, st: Staff): number {
  if (!st.resting) return 0;
  const need = st.stats.hp * STAMINA.back - st.stamina;
  return Math.max(1, Math.ceil(need / Math.max(0.01, restRateOf(s))));
}

/**
 * ヒーローを付け替える（ヒーロー選びで、ほかの担当についている人を押したとき）：いまの担当から外せるか。
 * 修行中・セクタマネージャー・休憩中・待機中は付け替えない（docs/ISLAND_PHASE1.md「ヒーロー選びの見分け」）
 */
export const canSwap = (st: Staff) => st.task != null && st.task !== 'train' && st.task !== 'manager' && !st.resting;

/**
 * 付け替えで元の場所が無人になって止まるか（確認の赤字「△△ は担当がいなくなり、止まります」）。
 * toTask：付け替え先の仕事（運搬係 → 運搬係のように同じ仕事へ移すときは、止まらない）。
 * 運搬・調達：ほかに同じ係がいない／製造：その作業台に作るものがある／販売：アルバイトがいない／開拓・調査・発掘：その仕事が止まる。
 * バイト（他店）は自社の仕事ではないので止まらない扱い
 */
export function swapStops(s: P1State, hero: number, toTask: Task | null): boolean {
  const st = staffOf(s, hero);
  if (!st || !canSwap(st)) return false;
  switch (st.task) {
    case 'transport':
      return toTask !== 'transport' && !s.staff.some((x) => x.hero !== hero && x.task === 'transport');
    case 'buy':
      return toTask !== 'buy' && !s.staff.some((x) => x.hero !== hero && x.task === 'buy');
    case 'craft':
      return !!s.slots.find((sl) => sl.worker === hero)?.sku;
    case 'shop': {
      const sh = Object.values(s.shops).find((x) => x.staff === hero);
      return !!sh && sh.part === 0;
    }
    case 'explore':
    case 'intel':
    case 'dig':
      return true;
    default:
      return false;
  }
}

/** 付け替えの前半：いまの担当から外す（「担当を外す」と同じ扱い）。外せたら元の仕事（task・target）を返す */
export function releaseForSwap(s: P1State, hero: number): { task: Task; target: number | string | null } | null {
  const st = staffOf(s, hero);
  if (!st || !canSwap(st)) return null;
  const from = { task: st.task as Task, target: st.target };
  return assign(s, hero, null) == null ? from : null;
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
  const st = newStaff(hero, wageOf(hero));
  // カリスマ採用（✨）：雇うときの能力 +20%（上限 100）
  if (has(s, 'd_people')) {
    const m = 1 + 0.2 * lvMul(s, 'd_people');
    st.stats = { ...st.stats, phy: Math.min(100, Math.round(st.stats.phy * m)), int: Math.min(100, Math.round(st.stats.int * m)), agi: Math.min(100, Math.round(st.stats.agi * m)) };
  }
  s.staff.push(st);
  s.hirePool = s.hirePool.filter((x) => x !== hero);
  return null;
}

export function setRest(s: P1State, hero: number, rest: boolean) {
  const st = staffOf(s, hero);
  if (st) st.resting = rest;
}

// ---------------------------------------------------------------- 建てる

/** revive：遺物の展示館は復興した土地にだけ */
export type PlaceErr = 'ground' | 'waste' | 'taken' | 'road' | 'money' | 'locked' | 'soon' | 'limit' | 'revive';

/** 入口が道路に向く向きだけ */
/**
 * チュートリアルで建ててもらう場所。工房は区画の左下寄り、お店は工房から道のりで 7〜10 マス離れた、家の多い所。
 * 一度決めたら覚えておく（Flags.spots）。
 */
export function tutSpot(s: P1State, id: string): [number, number, Dir] | null {
  const memo = (s.flags.spots ??= {});
  if (memo[id] && allowedDirs(s, id, memo[id][0], memo[id][1]).includes(memo[id][2])) return memo[id];
  const lots: [number, number, Dir][] = [];
  for (let j = 0; j < s.n; j++) for (let i = 0; i < s.n; i++) for (const d of allowedDirs(s, id, i, j)) lots.push([i, j, d]);
  if (!lots.length) return null;
  let pick: [number, number, Dir] | null = null;
  if (P1B[id]?.kind === 'workshop') {
    const ti = s.n * 0.3;
    const tj = s.n * 0.62;
    pick = lots.sort((a, b) => Math.hypot(a[0] - ti, a[1] - tj) - Math.hypot(b[0] - ti, b[1] - tj))[0];
  } else {
    const ws = myWorkshop(s) ?? s.buildings.find((b) => b.owner === 'me' && b.id === 'workshop');
    if (!ws) return null;
    const homes = sources(s).list;
    let best = -Infinity;
    for (const l of lots) {
      const fake: PBuilding = { uid: -1, id, i: l[0], j: l[1], dir: l[2], left: 0, owner: 'me' };
      const len = roadPath(s, doorOf(ws), doorOf(fake))?.length ?? 99;
      if (len < 6 || len > 11) continue;
      const near = homes.filter((k) => Math.abs(k.i - l[0]) + Math.abs(k.j - l[1]) <= 3).reduce((a, k) => a + k.pop, 0);
      const score = near - Math.abs(len - 8) * 0.6;
      if (score > best) {
        best = score;
        pick = l;
      }
    }
    pick ??= lots[0];
  }
  if (pick) memo[id] = pick;
  return pick;
}

export function allowedDirs(s: P1State, id: string, i: number, j: number, ignore?: number): Dir[] {
  return (['rd', 'ld', 'lu', 'ru'] as Dir[]).filter((d) => facesRoad(s, id, i, j, d) && lotFree(s, id, i, j, d, ignore, true) && (id !== 'museum' || cells(DEF[id], i, j, d).every(([x, y]) => isRevived(s, x, y))));
}

export function canBuild(s: P1State, id: string): PlaceErr | null {
  const b = P1B[id];
  if (!b) return 'locked';
  if (b.soon) return 'soon';
  if (b.requires && !has(s, b.requires)) return 'locked';
  if (b.kind === 'workshop' && s.buildings.some((x) => x.owner === 'me' && x.id === 'workshop')) return 'limit';
  if (b.kind !== 'workshop' && !s.buildings.some((x) => x.owner === 'me' && x.id === 'workshop')) return 'locked';
  // 遺物の展示館：会社で 1 つ・復興した土地があるセクタだけ
  if (b.kind === 'museum') {
    if (s.museum?.at) return 'limit';
    if (!revivedSites(s).length) return 'locked';
  }
  if (s.money < b.cost) return 'money';
  return null;
}

/** 建築の一覧：その建物の条件を満たしている（資金だけが足りない・建設済みも含む）。満たしていなければ「？」 */
export const buildKnown = (s: P1State, id: string) => {
  const e = canBuild(s, id);
  return e === null || e === 'money' || e === 'limit' || (e === 'locked' && !P1B[id]?.requires && !P1B[id]?.soon);
};
/** 建築の一覧のカテゴリが開いている（建てられる建物が 1 つ以上ある） */
export const buildCatOpen = (s: P1State, cat: string) => {
  const c = BUILD_CATS.find((x) => x.id === cat);
  return !!c && c.ids.some((id) => {
    const e = canBuild(s, id);
    return e === null || e === 'money' || e === 'limit';
  });
};

export function canPlaceAt(s: P1State, id: string, i: number, j: number, dir: Dir): PlaceErr | null {
  const e = canBuild(s, id);
  if (e) return e;
  const cs = cells(DEF[id], i, j, dir);
  if (cs.some(([x, y]) => ground(s, x, y) !== 'grass')) return 'ground';
  if (cs.some(([x, y]) => wasteBlock(s, x, y))) return 'waste';
  // 遺物の展示館は、復興した土地にだけ
  if (id === 'museum' && !cs.every(([x, y]) => isRevived(s, x, y))) return 'revive';
  if (cs.some(([x, y]) => occupant(s, x, y))) return 'taken';
  if (!facesRoad(s, id, i, j, dir)) return 'road';
  return null;
}

export function build(s: P1State, id: string, i: number, j: number, dir: Dir): PBuilding | PlaceErr {
  const e = canPlaceAt(s, id, i, j, dir);
  if (e) return e;
  const b = P1B[id];
  s.money -= b.cost;
  spend(s, 'build', b.cost);
  const pb: PBuilding = { uid: s.nextUid++, id, i, j, dir, left: b.days, owner: 'me' };
  s.buildings.push(pb);
  // 遺物の展示館（会社で 1 つ）：建てた場所を覚える。展示・増築の段は会社のもの
  if (b.kind === 'museum') {
    s.museum ??= { at: null, items: [], lv: 0, marks: 0 };
    s.museum.at = { sector: s.sector ?? 'c1', uid: pb.uid };
    if (invLv(pb, 'hall') < s.museum.lv) pb.inv = { ...pb.inv, hall: s.museum.lv };
  }
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
    const free = cs.every(([x, y]) => ground(s, x, y) === 'grass' && !wasteBlock(s, x, y) && (b.id !== 'museum' || isRevived(s, x, y)) && !others.some((o) => cells(DEF[o.id], o.i, o.j, o.dir).some(([p, q]) => p === x && q === y)));
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
  if (cs.some(([x, y]) => wasteBlock(s, x, y))) return 'waste';
  if (b.id === 'museum' && !cs.every(([x, y]) => isRevived(s, x, y))) return 'revive';
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
  spend(s, 'build', cost);
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
  spend(s, 'build', -back);
  s.buildings.splice(k, 1);
  // 遺物の展示館を撤去：展示は残す（建て直せば同じ展示で開く）
  if (b.id === 'museum' && s.museum?.at?.uid === b.uid) s.museum.at = null;
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
  spend(s, 'build', cost);
  b.inv = { ...b.inv, [id]: invLv(b, id) + 1 };
  // 展示室の増築：枠の数は会社のもの（展示館の段）
  if (kind === 'museum' && s.museum) s.museum.lv = Math.max(s.museum.lv, invLv(b, id));
  // 作業台・棚が増えたら、その場で使えるように
  if (kind === 'workshop') syncSlots(s);
  if (kind === 'shop' && s.shops[b.uid]) syncShop(s, b);
  return null;
}

/** お店の裏に置ける数（そのお店の設備投資「裏の倉庫を広げる」） */
export const storageCap = (b: PBuilding, s?: P1State) => SHOP.storageCap + 20 * invLv(b, 'backroom') + (s ? Math.round(10 * lvMul(s, 'inventory')) : 0);

// ---------------------------------------------------------------- 保管（工房の物置と倉庫）

export const myWarehouses = (s: P1State) => s.buildings.filter((b) => b.owner === 'me' && b.id === 'warehouse' && b.left <= 0);
/** 素材と、お店へ運ぶ前の商品を置ける数の合計 */
export const poolCap = (s: P1State) => STORE.base + 40 * invLv(wsAny(s), 'stockroom') + Math.round(20 * lvMul(s, 'inventory')) + myWarehouses(s).reduce((a, w) => a + STORE.warehouse + 100 * invLv(w, 'rack'), 0);
const sum = (o: Partial<Record<string, number>>) => Object.values(o).reduce<number>((a, n) => a + (n ?? 0), 0);
/** いま置いている数（買い付けて運んでいる素材も含む） */
export const poolUsed = (s: P1State) => sum(s.mats) + sum(s.stock) + (s.buyTrip ? sum(s.buyTrip.cargo) : 0) + (s.orders ?? []).reduce((a, o) => a + o.qty, 0);
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

// ---------------------------------------------------------------- 関所

/** 関所の建物（絵は仮に警備の詰所を借りている。docs/ISLAND_ART_TODO.md） */
export const GATE_ID = 'guard';
export const isGate = (b: PBuilding) => b.id === GATE_ID && b.owner === 'town';
export const gateOf = (s: P1State) => s.buildings.find(isGate) ?? null;

/** 他社のひと月の売上の見込み（自社が無いとき）。先月の締めがまだ無いときに使う */
export function rivalMonthGuess(s: P1State): Record<string, number> {
  const out: Record<string, number> = Object.fromEntries(s.rivals.map((r) => [r.id, r.base]));
  for (const p of productsOf(s)) {
    const rv = rivalOffers(s, p.key);
    const month = capture(s, p.key, rv);
    rv.forEach((o, n) => (out[o.rid] += month[n] * p.price));
  }
  return out;
}

/** 通行料：このエリアで 1 位の他社の先月の売上くらい（締めがまだなら見込み） */
export function gateToll(s: P1State): number {
  const last = s.rivals.every((r) => s.rivalLast[r.id]) ? Object.fromEntries(s.rivals.map((r) => [r.id, s.rivalLast[r.id].total])) : rivalMonthGuess(s);
  const top = Math.max(0, ...Object.values(last));
  return Math.ceil((top * GATE.mult) / GATE.round) * GATE.round;
}

/** 通行料を払って関所を開ける。払えたら true */
export function openGate(s: P1State): boolean {
  if (s.gateOpen) return false;
  const toll = gateToll(s);
  if (s.money < toll) return false;
  s.money -= toll;
  spend(s, 'build', toll, 'fees');
  s.gateOpen = true;
  // エンブレム：関所の開通で 1 つ
  s.emblem = (s.emblem ?? 0) + 1;
  // 関所の先：ランド（ほかのセクタ）が会社ぜんたいで開く
  s.land ??= newLand(s.sector ?? 'c1');
  brandAdd(s, BRAND.gate, t('関所を開通', 'Opened the gate'));
  return true;
}

export const myWorkshop = (s: P1State) => s.buildings.find((b) => b.owner === 'me' && b.id === 'workshop' && b.left <= 0) ?? null;
export const myShops = (s: P1State) => s.buildings.filter((b) => b.owner === 'me' && P1B[b.id]?.kind === 'shop' && b.left <= 0);

/** このセクタの工房（工事中も含む。設備投資の段を読む） */
export const wsAny = (s: P1State) => s.buildings.find((b) => b.owner === 'me' && b.id === 'workshop') ?? null;
/**
 * 設備（設備投資の段。建物ごと＝セクタごと）：運搬係 1 人が同時に出せる便・1 便に積める数（積み込みの工夫はスキル）・
 * 作業台の数（工房）・棚の数とアルバイトの上限（お店ごと）
 */
export const cartsOf = (s: P1State) => 1 + invLv(wsAny(s), 'carts') + lvOf(s, 'joint');
export const cartCap = (s: P1State) => Math.round(TRANSPORT.cap * (invLv(wsAny(s), 'truck') > 0 ? 2.5 : 1) * (1 + 0.3 * lvMul(s, 'loading') + fxSum(s, 'cartCap')));
export const benchCount = (s: P1State) => 1 + invLv(wsAny(s), 'bench');
export const shelfCount = (_s: P1State, b: PBuilding) => (P1B[b.id]?.shelves ?? 1) + invLv(b, 'shelves');
export const partMax = (s: P1State, uid: number) => SHOP.partTimeMax + 2 * invLv(s.buildings.find((x) => x.uid === uid), 'staffroom');

function syncSlots(s: P1State) {
  while (myWorkshop(s) && s.slots.length < benchCount(s)) s.slots.push({ sku: null, worker: null, progress: 0, running: false, repeat: true });
}
function syncShop(s: P1State, b: PBuilding) {
  const sh = (s.shops[b.uid] ??= { uid: b.uid, shelves: [], staff: null, part: 0, storage: {}, shelf: {}, sat: 1, carry: {}, rev: 0, cost: 0, last: null, aw: AWARE.start });
  while (sh.shelves.length < shelfCount(s, b)) sh.shelves.push(null);
}

/**
 * 設備より多い作業台・棚・アルバイトを外す（ほかのセクタの以前の写しに戻ったとき。設備投資はそのセクタの建物の段で数える）。
 * 外した棚の商品は工房の倉庫へ、外した作業台の職人は手が空く
 */
export function fitEquipment(s: P1State) {
  if (myWorkshop(s))
    while (s.slots.length > benchCount(s)) {
      const sl = s.slots.pop()!;
      const st = sl.worker != null ? staffOf(s, sl.worker) : null;
      if (st && st.task === 'craft') {
        st.task = null;
        st.target = null;
      }
    }
  for (const b of myShops(s)) {
    const sh = s.shops[b.uid];
    if (!sh) continue;
    while (sh.shelves.length > shelfCount(s, b)) {
      const x = sh.shelves.pop();
      if (!x || sh.shelves.includes(x)) continue;
      s.stock[x] = (s.stock[x] ?? 0) + (sh.shelf[x] ?? 0) + (sh.storage[x] ?? 0);
      delete sh.shelf[x];
      delete sh.storage[x];
    }
    sh.part = Math.min(sh.part, partMax(s, b.uid));
  }
}

// ---------------------------------------------------------------- 調達

/** このセクタの特産（20% 安い素材） */
export const isCheap = (s: P1State, m: Mat) => !!sectorProfile(s).cheap?.includes(m);
export const matPrice = (s: P1State, m: Mat) =>
  Math.round(
    MATS[m].price *
      Math.max(
        0.2,
        cut(s, 'bulk', 0.15) * cut(s, 'bulk2', 0.1) * cut(s, 'b_partner', 0.15) * cut(s, 'abc', 0.05) * cut(s, 'contract', 0.05) * cut(s, 'direct', 0.1) * cut(s, 'd_buy', 0.1) * Math.max(0.2, 1 - upOf(s, `route_${m}`, 0.08)) * fxCut(s, 'matPrice'),
      ) *
      (isCheap(s, m) ? CHEAP_RATE : 1),
  );

/** 月に買える素材の数の上限（ランクとスキル） */
export const procCap = (s: P1State) => Math.round((PROC.base + PROC.perLv * (s.proc.lv - 1)) * (1 + procBonus(s)) * flowMul(s));
/** スキルで足す月の調達の上限（割合）：調達枠の拡大・大口契約・年間契約・指名の取引先・産地との直接取引（レベルで伸びる）・汎用 */
export const procBonus = (s: P1State) =>
  0.3 * lvMul(s, 'stock1') + 0.6 * lvMul(s, 'stock2') + 1 * lvMul(s, 'stock3') + 0.5 * lvMul(s, 'b_partner') + 0.5 * lvMul(s, 'direct') + fxSum(s, 'procCap') + upOf(s, 'auto_order', 0.1);
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
  if (!hasRoute(s, m)) return 'route';
  if (qty <= 0) return null;
  if (qty > procLeft(s)) return 'cap';
  if (qty > poolFree(s)) return 'storage';
  const cost = matPrice(s, m) * qty;
  if (cost > s.money) return 'money';
  s.money -= cost;
  spend(s, 'materials', cost);
  s.mats[m] = (s.mats[m] ?? 0) + qty;
  s.proc.bought += qty;
  procExp(s, (qty * gain + PROC.perBuy) * (1 + 0.5 * lvMul(s, 'eye')));
  return null;
}

/**
 * 調達係の 1 往復の日数（工房 ⇄ 卸問屋。早足の買い付けで −30%・自動発注（EDI）は往復なしで 1 日）。
 * 道がつながっていなければ null
 */
export function buyDays(s: P1State, st: Staff): number | null {
  const ws = myWorkshop(s);
  const wh = wholesaler(s);
  const path = ws && wh ? roadPath(s, doorOf(ws), doorOf(wh)) : null;
  if (!path) return null;
  if (has(s, 'auto_order')) return 1;
  // 日の端数は持ち越す（Staff.lag）ので丸めない
  return Math.max(2, ((path.length * 2) / TRANSPORT.walkPerDay / speed(st, 'buy', s)) * Math.max(0.2, cut(s, 'swift', 0.3) * fxCut(s, 'buyDays')));
}

/** 1 ロットの素材の数 */
export const LOT = 10;
/** 卸問屋の人（注文を運んでくる） */
export const COURIERS = [1004, 1006, 1007, 1003];
/** 卸問屋から工房まで歩く日数 */
export function walkDays(s: P1State): number {
  const ws = myWorkshop(s);
  const wh = wholesaler(s);
  const path = ws && wh ? roadPath(s, doorOf(wh), doorOf(ws)) : null;
  return Math.max(1, Math.ceil((path?.length ?? 8) / TRANSPORT.walkPerDay));
}
/** 納期（注文してから届くまでの日数）：支度の 1 日 ＋ 歩く日数 */
export const leadDays = (s: P1State) => (has(s, 'auto_order') ? Math.max(1, Math.ceil((1 + walkDays(s)) * 0.5)) : 1 + walkDays(s));

/**
 * 卸問屋に lots ロット注文する。代金はいま払い、納期に問屋の人が工房まで運んでくる（工房に入ったら在庫になる）。
 * 置き場所は注文したぶんを先に取っておく。
 */
export function order(s: P1State, m: Mat, lots: number): string | null {
  const qty = Math.max(0, Math.round(lots)) * LOT;
  if (!hasRoute(s, m)) return 'route';
  if (qty <= 0) return null;
  if (qty > procLeft(s)) return 'cap';
  if (qty > poolFree(s)) return 'storage';
  const cost = matPrice(s, m) * qty;
  if (cost > s.money) return 'money';
  s.money -= cost;
  spend(s, 'materials', cost);
  s.proc.bought += qty;
  procExp(s, (qty + PROC.perBuy) * (1 + 0.5 * lvMul(s, 'eye')));
  const days = leadDays(s);
  const id = (s.orders ?? []).reduce((a, o) => Math.max(a, o.id), 0) + 1;
  (s.orders ??= []).push({ id, m, qty, left: days, total: days, courier: COURIERS[(id - 1) % COURIERS.length] });
  return null;
}

/** 作りたいエクステ（指定が無ければ、作業台で作っているもの） */
export const procItems = (s: P1State): Sku[] => (s.proc.items.length ? s.proc.items : [...new Set(s.slots.map((sl) => sl.sku).filter((x): x is Sku => !!x))]);

/** 買い付ける素材：作りたいエクステの素材と、追加で選んだ素材（ルートがあるものだけ） */
export function procMats(s: P1State): { m: Mat; from: 'item' | 'extra' }[] {
  const out: { m: Mat; from: 'item' | 'extra' }[] = [];
  for (const x of procItems(s)) for (const m of Object.keys(recipeOf(x)) as Mat[]) if (!out.some((o) => o.m === m)) out.push({ m, from: 'item' });
  for (const m of s.proc.extra) if (!out.some((o) => o.m === m)) out.push({ m, from: 'extra' });
  return out.filter((o) => hasRoute(s, o.m));
}

/**
 * 工房が 100% 動いたときの月の素材の消費（作業台の設定と職人の速さ。作業台に無い作りたいエクステは速さ 1 の作業台 1 つぶん）。
 * withRest：職人が休む日も入れる（いつもの体制。稼働率 uptime）。調達係の月の量（自動）はこちら
 */
export function fullUse(s: P1State, withRest = false): Partial<Record<Mat, number>> {
  const out: Partial<Record<Mat, number>> = {};
  const add = (x: Sku, sp: number) => {
    const batches = (DAYS * sp) / craftDays(s, x);
    for (const [m, q] of Object.entries(recipeOf(x))) out[m as Mat] = (out[m as Mat] ?? 0) + batches * (q ?? 0);
  };
  const made = new Set<Sku>();
  for (const sl of s.slots) {
    if (!sl.sku) continue;
    const st = sl.worker != null ? staffOf(s, sl.worker) : null;
    add(sl.sku, st ? speed(st, 'craft', s) * (withRest ? uptime(s, st) : 1) : 1);
    made.add(sl.sku);
  }
  for (const x of s.proc.items) if (!made.has(x)) add(x, 1);
  for (const k of Object.keys(out)) out[k as Mat] = Math.ceil(out[k as Mat] ?? 0);
  return out;
}

/** 素材の月の量（指定が無ければ、先月の消費と、いつもの体制（職人の休みも入れる）での消費の多いほう） */
export function procQty(s: P1State, m: Mat): number {
  const q = s.proc.qty[m];
  if (q && !q.auto) return q.n;
  // 自動：先月の消費と、工房がいつもの体制で動いたときの量の多いほう
  // （先月が素材不足で少なかったときに、買う量まで減って抜け出せなくなるのを防ぐ）
  const last = s.matUsedLast?.[m] ?? 0;
  // ABC 分析：いつもの体制での消費にぴったり（先月の消費が多くても買いすぎない）
  if (has(s, 'abc')) return fullUse(s, true)[m] ?? 0;
  return Math.max(last, fullUse(s, true)[m] ?? 0);
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

/** スキルツリーの本社を開放したか（以前のセーブは読み込むときに決める。deserializeP1） */
export const hqOpen = (s: P1State) => !!s.flags.hq;
/** スキルツリーの本社を開放する（無料）。ここから枝が広がる */
export function openHQ(s: P1State): boolean {
  if (hqOpen(s)) return false;
  s.flags.hq = true;
  return true;
}

// ---------------------------------------------------------------- スキルツリー v2：外周・エンブレム・ゴールドダスト

/** スキルのランク（外周）。無ければ C（内側） */
export const skillTier = (k: Skill): Tier => k.tier ?? 'C';
/** その外周が開いているか（C はいつも開いている） */
export const ringOpen = (s: Pick<P1State, 'flags'>, tier: Tier) => tier === 'C' || !!s.flags.rings?.includes(tier);
/** 出店したことのあるランク（いまのセクタ・ランドの出店先） */
export function tiersEntered(s: P1State): Tier[] {
  const out = new Set<Tier>([s.tier ?? 'C']);
  for (const id of s.land?.mine ?? []) {
    const d = SECTORS.find((x) => x.id === id);
    if (d) out.add(d.tier);
  }
  return TIER_ORDER.filter((x) => out.has(x));
}
/** これから開く外周（そのランクのセクタに出店したのに、まだ開いていない）。低いランクから */
export const ringsDue = (s: P1State): Tier[] => tiersEntered(s).filter((x) => x !== 'C' && !ringOpen(s, x));
/** 外周を開く（スキルツリーの演出のはじめに呼ぶ） */
export function openRing(s: P1State, tier: Tier): boolean {
  if (ringOpen(s, tier)) return false;
  s.flags.rings = [...(s.flags.rings ?? []), tier];
  return true;
}
/** レアのヒーロー（ヘッドハンティングで候補に入る） */
let rares: number[] | null = null;
export const rareHeroes = () =>
  (rares ??= ([...(heroById.values() as Iterable<unknown>)] as { id: number; rarity?: string; stats?: unknown }[]).filter((h) => h.rarity === 'Rare' && h.stats).map((h) => h.id));
/** まだ取れないパネル（封印・準備中。ヘッドハンティングはレアのヒーローがカタログにいなければ準備中） */
export const skillSoon = (k: Skill) => !!k.sealed || !!k.soon || (k.id === 'headhunt' && !rareHeroes().length);
/** 取れるパネルの数（封印・準備中を除く。100% の数え方） */
export const LEARNABLE = () => SKILLS.filter((k) => !skillSoon(k));

/** スキルが取れない理由（null なら取れる。資金だけが足りないときは 'money'、研究ポイントが足りないときは 'rp'） */
/** hidden：発掘の枝（発掘との出会いの前・Lime でないランド）は雲の中 */
export type SkillLock = 'done' | 'training' | 'hidden' | 'sealed' | 'soon' | 'ring' | 'requires' | 'brand' | 'emblem' | 'rp' | 'money';
/** 先に要るパネル（requires と、そのレベル reqLv）がそろっている */
export const requiresMet = (s: P1State, k: Skill) => !k.requires?.some((r) => !has(s, r) || lvOf(s, r) < (k.reqLv?.[r] ?? 1)) && anyOfMet(k, (r) => has(s, r));
export function skillLock(s: P1State, k: Skill): SkillLock | null {
  if (has(s, k.id)) return 'done';
  if (s.training?.id === k.id) return 'training';
  if (k.branch === 'dig' && !digBranchOpen(s)) return 'hidden';
  if (k.sealed) return 'sealed';
  if (skillSoon(k)) return 'soon';
  if (!ringOpen(s, skillTier(k))) return 'ring';
  if (!requiresMet(s, k)) return 'requires';
  if (k.brand && (s.brand ?? 0) < k.brand) return 'brand';
  if (k.emblem && (s.emblem ?? 0) < k.emblem) return 'emblem';
  if (isResearch(k)) return (s.rp ?? 0) < rpCost(k) ? 'rp' : null;
  if (s.money < k.cost) return 'money';
  return null;
}

/**
 * スキルを取る。研究パネルは研究ポイント（RP）、お金パネルは資金（GUM）で開く（docs/ISLAND_PHASE1.md「地層の発掘と研究ポイント」）。
 * 技（Skill.train）は、払ったあと職人が修行して身につける（s.training。1 つずつ）。
 * hero：修行に出す職人（無ければ製造の適性がいちばん高い人）。修行中はその職人は作業台に立てない
 */
export function learn(s: P1State, id: string, hero?: number): string | null {
  const k = SKILL[id];
  if (!k || has(s, id)) return 'done';
  if (s.training?.id === id) return 'training';
  if (k.branch === 'dig' && !digBranchOpen(s)) return 'hidden';
  if (k.sealed) return 'sealed';
  if (skillSoon(k)) return 'soon';
  if (!ringOpen(s, skillTier(k))) return 'ring';
  if (!requiresMet(s, k)) return 'requires';
  if (k.brand && (s.brand ?? 0) < k.brand) return 'brand';
  if (k.emblem && (s.emblem ?? 0) < k.emblem) return 'emblem';
  let trainee: Staff | null = null;
  if (k.train) {
    if (s.training) return 'busy';
    trainee = hero != null ? staffOf(s, hero) : trainees(s)[0] ?? null;
    if (!trainee || trainee.task === 'manager' || trainee.task === 'train') return 'no-staff';
  }
  if (isResearch(k)) {
    // 研究パネル：RP で開く（資金は要らない）
    const rp = rpCost(k);
    if ((s.rp ?? 0) < rp) return 'rp';
    s.rp -= rp;
  } else {
    if (s.money < k.cost) return 'money';
    s.money -= k.cost;
    spend(s, 'build', k.cost);
  }
  if (trainee) {
    startTraining(s, id, trainee);
    return null;
  }
  gainSkill(s, id);
  return null;
}

/** レベルが上げられない理由（null なら上げられる）。未取得は 'none'。研究パネルはレベルなし（'max'） */
export type LevelLock = 'none' | 'max' | 'ring' | 'money';
export function levelLock(s: P1State, k: Skill): LevelLock | null {
  const lv = lvOf(s, k.id);
  if (lv <= 0) return 'none';
  if (lv >= maxLv(k)) return 'max';
  if (!ringOpen(s, skillTier(k))) return 'ring';
  if (s.money < levelCost(k, lv + 1)) return 'money';
  return null;
}
/** 次のレベルの値段（資金。お金パネルだけ） */
export const nextLevelCost = (s: P1State, k: Skill) => levelCost(k, lvOf(s, k.id) + 1);
/** お金パネルのレベルを 1 つ上げる（資金）。docs/ISLAND_PHASE1.md「パネルのレベル」 */
export function levelUp(s: P1State, id: string): LevelLock | null {
  const k = SKILL[id];
  if (!k) return 'none';
  const e = levelLock(s, k);
  if (e) return e;
  const lv = lvOf(s, id) + 1;
  const c = levelCost(k, lv);
  s.money -= c;
  spend(s, 'build', c);
  setLevel(s, id, lv);
  return null;
}
/** レベルを決める（skillLv は入れ替える：汎用の効き目のキャッシュが作り直される）。監査・テストからも使う */
export function setLevel(s: P1State, id: string, lv: number) {
  if (!s.skills.includes(id)) s.skills.push(id);
  s.skillLv = { ...(s.skillLv ?? {}), [id]: lv };
  syncSlots(s);
  for (const b of myShops(s)) syncShop(s, b);
  // 研究の目利き：研究 Lv の上限が上がったら、止まっていたエクステの Lv と RP をその場で
  if (id === 'dig_study') syncResearchCap(s);
}

/** スキルが効き始める（取った・修行が終わった）。監査（scripts/island/audit.ts）も、条件を満たした状態としてこれで足す */
export function gainSkill(s: P1State, id: string) {
  if (!s.skills.includes(id)) s.skills.push(id);
  if (id.startsWith('route_')) {
    const m = id.slice(6) as Mat;
    if (!s.routes.includes(m)) s.routes.push(m);
  }
  // 商社との提携（✨）：すべての素材のルートが開く
  if (id === 'd_buy') for (const m of Object.keys(MATS) as Mat[]) if (!s.routes.includes(m)) s.routes.push(m);
  syncSlots(s);
  for (const b of myShops(s)) syncShop(s, b);
  if (id === 'dig_study') syncResearchCap(s);
}

/** 修行に出せる職人（製造の適性が高い順。ほかのセクタのマネージャーと修行中の人を除く） */
export const trainees = (s: P1State) => s.staff.filter((x) => x.task !== 'manager' && x.task !== 'train').sort((a, b) => aptitude(b.stats, 'craft') - aptitude(a.stats, 'craft'));
/** その職人が技を身につけるまでの日数：train ×（1 − min(0.4, 製造の適性 / 250)） */
export function trainDays(s: P1State, id: string, hero: number | Staff | null): number {
  const k = SKILL[id];
  if (!k?.train) return 0;
  const st = typeof hero === 'number' ? staffOf(s, hero) : hero;
  const apt = st ? aptOf(s, st, 'craft') : 0;
  // 社内研修：修行の日数 −30%
  return Math.max(1, Math.round(k.train * (1 - Math.min(TRAIN.cut, apt / TRAIN.per)) * cut(s, 'training', 0.3)));
}
/** 修行中のスキル（無ければ null）と残りの日数 */
export const trainingOf = (s: P1State, id: string) => (s.training?.id === id ? s.training : null);

function startTraining(s: P1State, id: string, st: Staff) {
  const days = trainDays(s, id, st);
  const from = st.task && st.task !== 'side' ? { task: st.task, target: st.target, sector: s.sector ?? 'c1' } : null;
  unassign(s, st);
  st.task = 'train';
  st.target = id;
  st.resting = false;
  s.training = { id, hero: st.hero, left: days, total: days, from };
}

/** 修行が終わった：スキルが効き始め、職人は元の配置へ（同じセクタで、空いていれば） */
function finishTraining(s: P1State): { id: string; hero: number } | null {
  const tr = s.training;
  if (!tr) return null;
  s.training = null;
  gainSkill(s, tr.id);
  const st = staffOf(s, tr.hero);
  if (st && st.task === 'train') {
    st.task = null;
    st.target = null;
    const f = tr.from;
    if (f && f.sector === (s.sector ?? 'c1')) {
      const free =
        f.task === 'craft' ? s.slots[f.target as number]?.worker == null : f.task === 'shop' ? s.shops[f.target as number] != null && s.shops[f.target as number].staff == null : f.task !== 'manager' && f.task !== 'train';
      if (free) assign(s, st.hero, f.task, f.target);
    }
  }
  return { id: tr.id, hero: tr.hero };
}

// ---------------------------------------------------------------- クラフト

export const recipeOf = (x: Sku) => {
  const [k, r] = skuParts(x);
  return PRODUCT[k].recipe[r];
};

/** その職人で作れるか（レアリティ・材料・設備） */
export function craftCheck(s: P1State, x: Sku, worker: number | null): string | null {
  const [k, r] = skuParts(x);
  // 復刻品：レシピが開いていれば、技・魔法の釜・商品開発は要らない（研究したこと自体が開発）。アンコモンの職人の適性は要る
  if (isRelic(k)) {
    if (!s.recipes?.[k]) return 'relic';
    if (r === 'U') {
      const st = worker != null ? staffOf(s, worker) : null;
      if (!st || aptOf(s, st, 'craft') < UNCOMMON.minCraft) return 'skill';
    }
  }
  // 技が要る商品（スキルツリーの技の枝）
  const tech = PRODUCT[k]?.tech;
  if (tech && !has(s, techSkill(tech))) return 'tech';
  if (r === 'U' && !isRelic(k)) {
    if (!has(s, 'pot')) return 'pot';
    if (!s.dev.includes(skuParts(x)[0])) return 'dev';
    const st = worker != null ? staffOf(s, worker) : null;
    if (!st || aptOf(s, st, 'craft') < UNCOMMON.minCraft) return 'skill';
  }
  for (const [m, q] of Object.entries(recipeOf(x))) if ((s.mats[m as Mat] ?? 0) < (q ?? 0)) return 'mats';
  // できた商品を置く場所（素材を使ったぶんは空く）
  const freed = Object.values(recipeOf(x)).reduce<number>((a, q) => a + (q ?? 0), 0);
  if (poolUsed(s) - freed + batchOf(x, s) > poolCap(s)) return 'full';
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

/**
 * 作る数を決める（自動製造でないとき）。n 個ぶん（ロットに切り上げ）作って止まる。
 * 止まっていて作れるなら、すぐ 1 ロット目を始める。
 */
export function setCraftPlan(s: P1State, slot: number, n: number): void {
  const sl = s.slots[slot];
  if (!sl || !sl.sku) return;
  sl.repeat = false;
  sl.left = Math.max(0, Math.round(n));
  if (!sl.running && sl.left > 0 && !startCraft(s, slot, sl.sku, false)) sl.left = Math.max(0, sl.left - batchOf(sl.sku, s));
}
/** 自動製造のオン・オフ */
export function setAutoCraft(s: P1State, slot: number, on: boolean): void {
  const sl = s.slots[slot];
  if (!sl) return;
  sl.repeat = on;
  sl.left = 0;
  if (on && !sl.running && sl.worker != null && sl.sku) startCraft(s, slot, sl.sku, true);
}

/** 1 ロットでできる数。s を渡すとスキル（ロットの改善：基礎の商品 +1・共通の型：アンコモン +1）も入る */
export const batchOf = (x: Sku, s?: P1State) => {
  const [k, r] = skuParts(x);
  const base = r === 'U' ? Math.ceil(PRODUCT[k].batch / 2) : PRODUCT[k].batch;
  if (!s) return base;
  const tech = PRODUCT[k].tech;
  // ロットの改善・汎用のロット（基礎の商品）・共通の型（アンコモン）・技の Lv2 から（その技の商品）
  return base + (r === 'C' && !tech ? lvOf(s, 'lot') + Math.round(fxSum(s, 'lot')) : 0) + (r === 'U' ? lvOf(s, 'mold') : 0) + (tech ? upOf(s, techSkill(tech), 1) : 0);
};

export const craftDays = (s: P1State, x: Sku) =>
  (PRODUCT[skuParts(x)[0]].days *
    Math.max(0.2, cut(s, 'jig', 0.2) * cut(s, 'jig2', 0.15) * cut(s, 'five_s', 0.05) * cut(s, 'kaizen', 0.1) * cut(s, 'night', 0.15) * cut(s, 'line', 0.2) * fxCut(s, 'craftDays')) *
    (invLv(wsAny(s), 'bench') >= 2 ? 0.8 : 1) *
    (1 - 0.1 * invLv(myWorkshop(s), 'tools'))) /
  flowMul(s);

/** 1 個あたりの素材代（いまの値段） */
export const unitCost = (s: P1State, x: Sku) => Object.entries(recipeOf(x)).reduce((a, [m, q]) => a + matPrice(s, m as Mat) * (q ?? 0), 0) / batchOf(x, s);

// ---------------------------------------------------------------- 商品開発

export const devCost = (key: string) => Math.round(PRODUCT[key].price * DEV.rate);
/** 商品開発の日数（魔法の釜の Lv2 から −20% ずつ） */
export const devDays = (s: P1State) => Math.max(1, Math.round(DEV.days * Math.max(0.2, 1 - upOf(s, 'pot', 0.2))));
export function develop(s: P1State, key: string): string | null {
  if (!PRODUCT[key]) return 'locked';
  if (!has(s, 'pot')) return 'pot';
  if (s.dev.includes(key)) return 'done';
  if (s.lab) return 'busy';
  const cost = devCost(key);
  if (s.money < cost) return 'money';
  s.money -= cost;
  spend(s, 'build', cost);
  s.lab = { key, left: devDays(s) };
  return null;
}

// ---------------------------------------------------------------- 宣伝・調査・依頼・給与

export const adBoost = (s: P1State) => ADS.reduce((a, x) => a + ((s.ads[x.id] ?? 0) > 0 ? x.boost : 0), 0) * (1 + 0.5 * lvMul(s, 'b_ads')) * (1 + 0.1 * lvMul(s, 'fair') + fxSum(s, 'ads')) * (sectorProfile(s).ads ?? 1);
/** 宣伝の費用（季節の催事で −30%） */
export const adCost = (s: P1State, id: string) => Math.round((ADS.find((a) => a.id === id)?.cost ?? 0) * cut(s, 'fair', 0.3));
export function runAd(s: P1State, id: string): string | null {
  const x = ADS.find((a) => a.id === id);
  if (!x) return 'locked';
  if ((s.ads[id] ?? 0) > 0) return 'busy';
  const cost = adCost(s, id);
  if (s.money < cost) return 'money';
  s.money -= cost;
  spend(s, 'ads', cost);
  s.ads[id] = x.days;
  return null;
}

/** 調査の段（0〜3） */
export const intelLv = (s: P1State, rid: string) => INTEL.filter((d) => (s.intel[rid] ?? 0) >= d).length;

export function missionMet(s: P1State, id: string): boolean {
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
  // セクタの依頼：そのセクタにいるときだけ
  const m = MISSIONS.find((x) => x.id === id);
  if (m?.sector && m.sector !== s.sector) return false;
  const last = s.reports[s.reports.length - 1];
  // 発掘の依頼：そのエクステを掘り出した（研究ノートに 1 つ以上。研究は会社で共有なので、前に掘っていれば受けたときに達成）
  if (m?.dig != null) return (s.research?.[m.dig] ?? 0) >= 1;
  switch (id) {
    case 'c3_knife':
      return (s.monthUnits.Knife ?? 0) >= 10;
    case 'c2_goblet':
      return (s.monthUnits.Goblet ?? 0) >= 10;
    case 'u1_dev':
      return s.dev.length >= 1;
    case 'u3_ads':
      return ADS.filter((a) => (s.ads[a.id] ?? 0) > 0).length >= 2;
  }
  // 「○○で 1 位」：そのセクタを制覇した（2 か月続けて 1 位）
  if (m?.sector && id.endsWith('_top')) return !!s.cleared && !!last;
  return false;
}
/** 同時に受けられる依頼の数 */
export const MISSION_MAX = 3;
/** 受けて進行中・達成した依頼（右上のミッションに出す） */
export const activeMissions = (s: P1State) => MISSIONS.filter((m) => s.missions[m.id] === 'accepted' || s.missions[m.id] === 'done');
/** まだ受けていない依頼（上から 3 つ） */
export const offeredMissions = (s: P1State) =>
  MISSIONS.filter((m) => !s.missions[m.id] && (!m.sector || m.sector === s.sector))
    // いまいるセクタの依頼を先に
    .sort((a, b) => Number(!a.sector) - Number(!b.sector))
    .slice(0, 3);
/** 依頼の画面に出すもの：受けたもの・達成したもの、そのあとにまだ受けていないもの */
export const openMissions = (s: P1State) => [...activeMissions(s), ...offeredMissions(s)];

/** 依頼を受ける。受けた時点で条件を満たしていれば、その場で達成（done）になる（報酬は「受け取る」で） */
export function accept(s: P1State, id: string): string | null {
  if (s.missions[id]) return 'done';
  if (MISSIONS.filter((m) => s.missions[m.id] === 'accepted').length >= MISSION_MAX) return 'full';
  s.missions[id] = missionMet(s, id) ? 'done' : 'accepted';
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
    case 'c3_knife':
      return [Math.min(10, s.sector === 'c3' ? (s.monthUnits.Knife ?? 0) : 0), 10];
    case 'c2_goblet':
      return [Math.min(10, s.sector === 'c2' ? (s.monthUnits.Goblet ?? 0) : 0), 10];
  }
  return null;
}
export function claim(s: P1State, id: string): string | null {
  const m = MISSIONS.find((x) => x.id === id);
  if (!m || s.missions[id] !== 'done') return 'not-yet';
  s.missions[id] = 'claimed';
  s.money += m.reward;
  book(s, 'other', m.reward);
  // 研究ポイント（以前のゴールドダスト ✨ 1 つ = 40 RP）
  if (m.rp) s.rp = (s.rp ?? 0) + m.rp;
  brandAdd(s, BRAND.mission, t(`依頼「${m.title}」を達成`, `Request done: ${m.title}`));
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
  spend(s, 'wages', cost);
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
  const prev = sh.shelves[idx];
  sh.shelves[idx] = x;
  // 棚から外した商品が、このお店のどの棚にも無くなったら、棚に残っていた分は裏へ戻す
  // （残したままだと、並べていない商品として売れずに棚の場所だけふさぐ）
  if (prev && prev !== x && !sh.shelves.includes(prev)) {
    const n = sh.shelf[prev] ?? 0;
    if (n > 0) sh.storage[prev] = (sh.storage[prev] ?? 0) + n;
    delete sh.shelf[prev];
  }
  return true;
}

export function setPart(s: P1State, uid: number, n: number): boolean {
  const sh = s.shops[uid];
  if (!sh) return false;
  sh.part = Math.max(0, Math.min(partMax(s, uid), n));
  return true;
}

/**
 * お店の売り場での強さ（商品ごと）。clerk：'now'＝いまの様子（店員が休憩中なら居ない）・
 * 'in'＝店員がいるとき・'out'＝店員が休んでいるとき（アルバイトだけ）。見込み（SCM の数字）は 'in' と 'out' を稼働率で混ぜる
 */
type Clerk = 'now' | 'in' | 'out';
function pull(s: P1State, b: PBuilding, sh: ShopState, x: Sku, clerk: Clerk = 'now'): number {
  const st = sh.staff != null ? staffOf(s, sh.staff) : null;
  const present = !!st && (clerk === 'in' || (clerk === 'now' && !st.resting));
  const staffed = st && present ? 0.6 + 0.4 * speed(st, 'shop', s) : 0;
  const service = staffed + sh.part * 0.15;
  if (service <= 0) return 0;
  const [k, r] = skuParts(x);
  return (P1B[b.id].pull ?? 1) * skillPull(s) * shopPull(s, b, sh, x) * brandPull(s.brand, lvMul(s, 'd_ops')) * (1 + 0.1 * invLv(b, 'sign')) * (1 + adBoost(s)) * service * sh.sat * (r === 'U' ? UNCOMMON.pull : r === 'C' ? TIERS[s.tier ?? 'C'].commonPull : 1) * goodsMul(s, k, r) * knownOf(s, k);
}
/**
 * スキルの売り場の強さ（すべてのお店）：接客の研修 ×1.15・ブランドの看板 ×1.25・接客の匠 ×1.2・インセンティブ ×1.05・
 * POS レジ ×1.03・人流解析 ×1.05・ERP／基幹システム刷新（全段 +5%／+10%）
 */
export const skillPull = (s: P1State) =>
  (1 + 0.15 * lvMul(s, 'host')) * (1 + 0.25 * lvMul(s, 'b_sign')) * (1 + 0.2 * lvMul(s, 'concierge')) * (1 + 0.05 * lvMul(s, 'incentive')) * (1 + 0.03 * lvMul(s, 'pos')) * (1 + 0.05 * lvMul(s, 'flow')) * (1 + fxSum(s, 'pull')) * flowMul(s);
/** お店ごと・棚ごとのスキル：VMD（棚 2 つ以上）×1.1・ゴールデンゾーン（1 番目の棚）×1.12・名物店主（✨）×1.4 */
export function shopPull(s: P1State, b: PBuilding, sh: ShopState | null, x?: Sku): number {
  const vmd = shelfCount(s, b) >= 2 ? 1 + 0.1 * lvMul(s, 'vmd') : 1;
  const golden = !!x && sh?.shelves[0] === x ? 1 + 0.12 * lvMul(s, 'golden') : 1;
  const famous = s.dustShop === b.uid ? 1 + 0.4 * lvMul(s, 'd_shop') : 1;
  // 輸入品店・ブティックの Lv2 から：その建物の売り場の強さ +10% ずつ
  const kind = b.id === 'import' ? 1 + upOf(s, 'shop2', 0.1) : b.id === 'boutique' ? 1 + upOf(s, 'shop3', 0.1) : 1;
  return vmd * golden * famous * kind;
}
/** 名物店主（✨）にするお店を選ぶ（1 軒だけ。替えられる） */
export function setDustShop(s: P1State, uid: number): boolean {
  if (!has(s, 'd_shop') || !s.shops[uid]) return false;
  s.dustShop = uid;
  return true;
}

/**
 * 新商品の認知（0〜1）：そのセクタのお客さんがその商品をどれだけ知っているか。売り場の強さに掛ける。
 * 最初の町（noSaturation）は全部 1。ほかのセクタは、初めて並べる商品は AWARE_GOODS.start から
 */
export function knownOf(s: Pick<P1State, 'known' | 'sector' | 'skills' | 'skillLv'>, key: string): number {
  if (sectorProfile(s)?.noSaturation) return 1;
  return Math.max(0, Math.min(1, s.known?.[key] ?? knownStart(s)));
}
/** 新商品の認知のはじめ（需要予測 AI で 0.3 → 0.5） */
export const knownStart = (s: Pick<P1State, 'skills' | 'skillLv'>) => Math.min(0.9, AWARE_GOODS.start + 0.2 * lvMul(s, 'forecast'));

/** 他社でその商品を扱っている会社の数 */
export const sellersOf = (s: P1State, key: string) => s.rivals.filter((r) => (r.sells[key] ?? 0) > 0).length;
/** そのセクタの「まだ誰も売っていない」勝ち筋の商品（SectorProfile.gap） */
export const gapOf = (s: P1State): string[] => sectorProfile(s)?.gap ?? [];
/**
 * 飽和：他社が MARKET.satAt 社以上扱っている商品は「他店で供給が足りている」。
 * gap の商品と、noSaturation のセクタ（最初の町）は飽和にしない
 */
export function saturated(s: P1State, key: string): boolean {
  const prof = sectorProfile(s);
  if (prof?.noSaturation) return false;
  // gap の商品も、他社が追随して 2 社目が入ったら飽和（endMonth の参入）
  return sellersOf(s, key) >= MARKET.satAt;
}
/** 商品ごとの売り場の強さの倍率：飽和（Common 0.45・Uncommon 0.7）と「匠の技」（技が要る商品 +15%） */
export function goodsMul(s: P1State, key: string, r: Rar): number {
  const sat = saturated(s, key) ? (r === 'U' ? MARKET.satU : MARKET.saturated) : 1;
  const master = PRODUCT[key]?.tech ? 1 + 0.15 * lvMul(s, 't_master') : 1;
  return sat * master;
}

export const dist = (a: PBuilding, b: PBuilding) => Math.abs(a.i - b.i) + Math.abs(a.j - b.j);

// ---------------------------------------------------------------- 商圏（お客さんの住む場所とお店の距離）

export interface Source {
  i: number;
  j: number;
  pop: number;
}
let srcCache: { key: string; list: Source[]; total: number } | null = null;
/** お客さんの住む場所（住宅と駅）。町の建物は動かないので、建物の数が変わったときだけ作り直す */
export function sources(s: P1State): { list: Source[]; total: number } {
  const key = `${s.seed}:${s.buildings.length}`;
  if (srcCache?.key === key) return srcCache;
  const list = s.buildings.filter((b) => b.owner === 'town' && MARKET.pop[b.id]).map((b) => ({ i: b.i, j: b.j, pop: MARKET.pop[b.id] }));
  srcCache = { key, list, total: list.reduce((a, x) => a + x.pop, 0) || 1 };
  return srcCache;
}
/** EC サイト：自社のお店の届き方の下限 */
export const MARKET_EC = { floor: 0.25 };
/** 人流解析：お客さんの多い区画（空き地のうち、近くのお客さんの密度が上位 20% のマス。j * n + i） */
let hotCache: { key: string; set: Set<number> } | null = null;
export function hotCells(s: P1State): Set<number> {
  const key = `${s.seed}:${s.n}:${s.buildings.length}`;
  if (hotCache?.key === key) return hotCache.set;
  const { list } = sources(s);
  const cells0: { k: number; v: number }[] = [];
  for (let j = 0; j < s.n; j++)
    for (let i = 0; i < s.n; i++) {
      if (ground(s, i, j) !== 'grass' || occupant(s, i, j)) continue;
      cells0.push({ k: j * s.n + i, v: list.reduce((a, x) => a + x.pop * reach(Math.abs(x.i - i) + Math.abs(x.j - j)), 0) });
    }
  cells0.sort((a, b) => b.v - a.v);
  const set = new Set(cells0.slice(0, Math.ceil(cells0.length * 0.2)).map((c) => c.k));
  hotCache = { key, set };
  return set;
}
/** 距離が離れると、お客さんが来にくくなる（d0 マスで半分） */
export const reach = (d: number) => 1 / (1 + (d / MARKET.d0) ** 2);

/** 商品を売っているお店 1 つ（自社の棚・他社のお店）。g：会社（'me' か他社の id） */
export interface Offer {
  i: number;
  j: number;
  w: number;
  g: string;
}

/**
 * 商品 key について、お店ごとのひと月に来るお客さんの数（個）。
 * 住む場所ごとに、会社ごとの「いちばん来やすいお店」の強さで会社を選び（同じ会社のお店が近くに何軒あっても強さは足されない）、
 * 選んだ会社のお店のあいだでは、来やすさに応じて分かれる。だから同じ所に自社のお店を固めても、お客さんは増えず取り合いになる。
 */
export function capture(s: P1State, key: string, offers: Offer[]): number[] {
  const out = offers.map(() => 0);
  if (!offers.length) return out;
  const { list, total } = sources(s);
  const demand = (s.demand[key] ?? 0) * MARKET.pot;
  const ec = has(s, 'ec');
  const ecFloor = Math.min(1, MARKET_EC.floor * lvMul(s, 'ec'));
  // 客注・取り寄せ：自社のお店に来るお客さん +10%（＋汎用のエリアの需要）
  const meMul = 1 + 0.1 * lvMul(s, 'order') + fxSum(s, 'demand');
  const w = offers.map(() => 0);
  const groups = [...new Set(offers.map((o) => o.g))];
  for (const k of list) {
    const dk = (demand * k.pop) / total;
    offers.forEach((o, n) => {
      const r0 = reach(Math.abs(o.i - k.i) + Math.abs(o.j - k.j));
      // EC サイト：自社のお店は遠いお客さんにも届く（届き方が最低 ecFloor）
      w[n] = o.w * (o.g === 'me' && ec ? Math.max(ecFloor, r0) : r0);
    });
    let sum = MARKET.outside;
    const gmax: Record<string, number> = {};
    const gsum: Record<string, number> = {};
    for (const g of groups) {
      gmax[g] = 0;
      gsum[g] = 0;
    }
    offers.forEach((o, n) => {
      gmax[o.g] = Math.max(gmax[o.g], w[n]);
      gsum[o.g] += w[n];
    });
    for (const g of groups) sum += gmax[g];
    offers.forEach((o, n) => {
      if (gsum[o.g] > 0) out[n] += ((dk * gmax[o.g]) / sum) * (w[n] / gsum[o.g]) * (o.g === 'me' ? meMul : 1);
    });
  }
  return out;
}

/** 他社のお店（商品を売っている強さつき） */
export function rivalOffers(s: P1State, key: string): (Offer & { rid: string })[] {
  const out: (Offer & { rid: string })[] = [];
  // 他社の反撃中（自社が 1 位を取った月から）：売り場の強さ ×MARKET.rally
  // ポイントカード：反撃の効き目が半分（×1.25 → ×1.12）
  // ポイントカード：反撃の効き目 −50%（レベルで伸びる）・汎用の rally
  const rally = (s.rally ?? 0) > 0 ? 1 + (MARKET.rally - 1) * Math.max(0, 1 - 0.5 * lvMul(s, 'point') - fxSum(s, 'rally')) : 1;
  for (const r of s.rivals) {
    const w = (r.sells[key] ?? 0) * MARKET.rivalPull * rally;
    if (w <= 0) continue;
    const b = s.buildings.find((x) => x.owner === r.id);
    if (b) out.push({ i: b.i, j: b.j, w, g: r.id, rid: r.id });
  }
  return out;
}

/**
 * 自社の棚（stocked：棚に商品があるものだけ・いまの様子。false なら並んでいるとして見込む＝いつもの体制）。
 * away：見込みのとき、店員が休んでいる日（アルバイトだけ）として数える
 */
function myOffers(s: P1State, key: string, stocked: boolean, away = false) {
  const out: (Offer & { b: PBuilding; sh: ShopState; x: Sku })[] = [];
  for (const b of myShops(s)) {
    const sh = s.shops[b.uid];
    for (const x of sh.shelves) {
      if (!x || skuParts(x)[0] !== key) continue;
      if (stocked && (sh.shelf[x] ?? 0) <= 0) continue;
      const w = pull(s, b, sh, x, stocked ? 'now' : away ? 'out' : 'in') * (sh.aw ?? 1);
      if (w > 0) out.push({ i: b.i, j: b.j, w, g: 'me', b, sh, x });
    }
  }
  return out;
}

/** 道のりのマス数（道路をたどる。つながっていなければまっすぐの距離） */
const pathCache = new Map<string, number>();
export function pathLen(s: P1State, a: PBuilding, b: PBuilding): number {
  const da = doorOf(a);
  const db = doorOf(b);
  const key = `${s.seed}:${da}:${db}`;
  let n = pathCache.get(key);
  if (n == null) {
    const p = roadPath(s, da, db);
    n = p ? p.length - 1 : Math.abs(da[0] - db[0]) + Math.abs(da[1] - db[1]);
    pathCache.set(key, n);
  }
  return n;
}
/** 荷車で、片道に何日（速さ 1 の運搬係） */
export const legDays = (s: P1State, n: number) =>
  ((n / (TRANSPORT.cellsPerDay * (invLv(wsAny(s), 'truck') > 0 ? 1.5 : 1) * (1 + 0.3 * lvMul(s, 'fleet')))) *
    Math.max(0.2, cut(s, 'shortcut', 0.15) * cut(s, 'route_opt', 0.1) * cut(s, 'd_logi', 0.3) * fxCut(s, 'haulDays') * (1 - upOf(s, 'timetable', 0.05))) *
    (sectorProfile(s).haul ?? 1)) /
  flowMul(s);
/** 工房 → 物流拠点のトラックの定期便の日数の倍率（クロスドッキングで 0.3 → 0.2） */
export const depotLink = (s: P1State) => (has(s, 'crossdock') ? Math.max(0.05, Math.round((DEPOT.link - 0.1 * lvMul(s, 'crossdock')) * 1000) / 1000) : DEPOT.link);
/** ルートの開拓の日数の倍率（開拓の手引き：−40%。レベルで伸びる） */
export const scoutMul = (s: P1State) => cut(s, 'scoutmap', 0.4);
export const myDepots = (s: P1State) => s.buildings.filter((b) => b.owner === 'me' && P1B[b.id]?.kind === 'depot' && b.left <= 0);
/** お店まで片道の日数と、どこから出すか（工房か、近い物流拠点。拠点までは定期便で速い） */
export function oneWay(s: P1State, shop: PBuilding, ws = myWorkshop(s), depots = myDepots(s)): { days: number; from: PBuilding | null } {
  if (!ws) return { days: 0, from: null };
  let best = { days: legDays(s, pathLen(s, ws, shop)), from: ws as PBuilding | null };
  for (const d of depots) {
    // 物流拠点の Lv2 から：拠点 → お店 −10% ずつ
    const days = legDays(s, pathLen(s, ws, d)) * depotLink(s) + legDays(s, pathLen(s, d, shop)) * Math.max(0.2, 1 - upOf(s, 'hub', 0.1));
    if (days < best.days) best = { days, from: d };
  }
  return best;
}

/** いまあるお店の商圏：近くの家・近くの競合（同じ商品を売る他社）・工房（拠点）からの片道 */
export function shopArea(s: P1State, b: PBuilding) {
  const keys = new Set((s.shops[b.uid]?.shelves ?? []).filter((x): x is Sku => !!x).map((x) => skuParts(x)[0]));
  const homes = sources(s).list.filter((k) => Math.abs(k.i - b.i) + Math.abs(k.j - b.j) <= MARKET.d0).length;
  const rivals = s.rivals.filter((r) => {
    const rb = s.buildings.find((x) => x.owner === r.id);
    return rb && Math.abs(rb.i - b.i) + Math.abs(rb.j - b.j) <= MARKET.d0 * 1.5 && [...keys].some((k) => (r.sells[k] ?? 0) > 0);
  });
  const mine = myShops(s).filter((x) => x.uid !== b.uid && Math.abs(x.i - b.i) + Math.abs(x.j - b.j) <= MARKET.d0);
  return { homes, rivals: rivals.map((r) => r.id), mine: mine.length, way: oneWay(s, b) };
}

/**
 * いますぐ 1 便出す（チュートリアルの流れの案内で、荷車が走るところを見せる）。
 * ふだんはお店の裏が半分を超えて埋まっていると出さないが、ここでは工房にある商品を積めるだけ積む。出せたら true
 */
export function forceHaul(s: P1State): boolean {
  const ws = myWorkshop(s);
  const shop = myShops(s)[0];
  const st = s.staff.find((x) => x.task === 'transport');
  if (!ws || !shop || !st) return false;
  if (s.trips.some((t) => t.to === shop.uid && !t.dropped)) return true;
  const sh = s.shops[shop.uid];
  const cargo: Partial<Record<Sku, number>> = {};
  let load = 0;
  for (const x of sh.shelves) {
    if (!x) continue;
    const n = Math.min(s.stock[x] ?? 0, cartCap(s) - load);
    if (n <= 0) continue;
    cargo[x] = n;
    s.stock[x] = (s.stock[x] ?? 0) - n;
    load += n;
  }
  if (!load) return false;
  st.resting = false;
  const way = oneWay(s, shop, ws);
  const days = Math.max(1, (way.days * 2) / speed(st, 'transport', s));
  s.trips.push({ hauler: st.hero, from: way.from?.uid, to: shop.uid, cargo, left: days, total: days });
  return true;
}

/** 物流拠点の下見：ここに建てたら、自社のお店ごとの片道の日数がどう変わるか */
export function depotInfo(s: P1State, i: number, j: number, dir: Dir): { shop: PBuilding; before: number; after: number }[] {
  const ws = myWorkshop(s);
  if (!ws) return [];
  const fake: PBuilding = { uid: -1, id: 'logistics', i, j, dir, left: 0, owner: 'me' };
  return myShops(s).map((shop) => ({ shop, before: oneWay(s, shop, ws).days, after: oneWay(s, shop, ws, [...myDepots(s), fake]).days }));
}

/** 出店の下見：ここにお店を建てたら、ひと月に何個売れそうか・他社と自社のお店からどれだけ取るか・工房から何日か */
export interface SiteInfo {
  key: string;
  units: number;
  fromRivals: number;
  fromMine: number;
  homes: number;
  rivals: number;
  days: number;
}
export function siteInfo(s: P1State, id: string, i: number, j: number, dir: Dir): SiteInfo | null {
  const def = P1B[id];
  if (!def || def.kind !== 'shop') return null;
  const made = [...new Set(s.slots.map((x) => x.sku).filter((x): x is Sku => !!x).map((x) => skuParts(x)[0]))];
  const keys = made.length ? made : [recommend(s)];
  let best: SiteInfo | null = null;
  const fake: PBuilding = { uid: -1, id, i, j, dir, left: 0, owner: 'me' };
  for (const key of keys) {
    const mine = myOffers(s, key, false);
    const rv = rivalOffers(s, key);
    const before = capture(s, key, [...mine, ...rv]);
    const w = (def.pull ?? 1) * skillPull(s);
    const after = capture(s, key, [...mine, ...rv, { i, j, w, g: 'me' }]);
    const units = after[after.length - 1];
    const fromMine = mine.reduce((a, _, n) => a + before[n] - after[n], 0);
    const fromRivals = rv.reduce((a, _, n) => a + before[mine.length + n] - after[mine.length + n], 0);
    if (!best || units > best.units) best = { key, units, fromRivals, fromMine, homes: 0, rivals: 0, days: 0 };
  }
  if (!best) return null;
  best.homes = sources(s).list.filter((k) => Math.abs(k.i - i) + Math.abs(k.j - j) <= MARKET.d0).length;
  best.rivals = s.rivals.filter((r) => {
    const b = s.buildings.find((x) => x.owner === r.id);
    return b && Math.abs(b.i - i) + Math.abs(b.j - j) <= MARKET.d0 * 1.5 && (r.sells[best!.key] ?? 0) > 0;
  }).length;
  best.days = oneWay(s, fake).days;
  return best;
}

// ---------------------------------------------------------------- 1 日

export interface DayResult {
  finished: PBuilding[];
  crafted: Sku[];
  delivered: { to: number; n: number }[];
  routes: Mat[];
  report: Report | null;
  /** 会社の月の締め（30 日ごと） */
  company?: CompanyMonth;
  /** 新しく達成した依頼・調査が進んだ他社・開発できた商品 */
  missions: string[];
  intel: { rid: string; lv: number }[];
  developed: string[];
  /** 調達ランクが上がった */
  procLv?: number;
  /** 調達係が持ち帰った素材・届いた注文の素材 */
  arrived?: Partial<Record<Mat, number>>;
  /** 届いた注文（問屋の人が工房に着いた） */
  orders?: Order[];
  /** 1 ロットできた（作業台の番号と数） */
  made: { slot: number; sku: Sku; n: number }[];
  /** 売れた（お店と金額。1 個ずつ） */
  sales: { uid: number; yen: number; sku: Sku }[];
  /** バイトで能力値が上がった */
  grew: { hero: number; stat: keyof Stats }[];
  /** 技の修行が終わった（身につけたスキルと職人） */
  learned?: { id: string; hero: number }[];
  /** 自動発掘で打ったマス */
  dug?: DigHit[];
}

export function step(s: P1State): DayResult {
  s.day++;
  const res: DayResult = { finished: [], crafted: [], delivered: [], routes: [], report: null, missions: [], intel: [], developed: [], made: [], sales: [], grew: [] };

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
            s.moneyStart = Math.round(s.money);
            s.brandStart = s.brand ?? 0;
          }
        }
      }
    }
  }

  const ws = myWorkshop(s);
  const shops = myShops(s);
  const working = new Set<number>();

  // 注文：納期に問屋の人が工房に着いたら在庫になる
  if (s.orders?.length) {
    for (const o of s.orders) o.left -= 1;
    for (const o of s.orders.filter((x) => x.left <= 0)) {
      s.mats[o.m] = (s.mats[o.m] ?? 0) + o.qty;
      (res.orders ??= []).push(o);
      res.arrived = { ...(res.arrived ?? {}), [o.m]: (res.arrived?.[o.m] ?? 0) + o.qty };
    }
    s.orders = s.orders.filter((x) => x.left > 0);
  }
  // 調達：調達係が工房から卸問屋まで歩いて行き、次の買い付けが届くまでもつ量を買って帰る（月の上限・資金・置き場所の中で）
  const ws0 = myWorkshop(s);
  const shopB = wholesaler(s);
  if (s.buyTrip) {
    const st = staffOf(s, s.buyTrip.hero);
    // 買い付けの途中は休まずに帰ってくる（休むのは帰ってから。運搬の便と同じ）
    if (st) {
      if (!st.resting) working.add(st.hero);
      s.buyTrip.left -= 1;
    }
    if (s.buyTrip.left <= 0 || !st || st.task !== 'buy') {
      // 帰ってきた（途中で外されたときも、買った素材は届ける）
      for (const [m, n] of Object.entries(s.buyTrip.cargo)) s.mats[m as Mat] = (s.mats[m as Mat] ?? 0) + (n ?? 0);
      res.arrived = { ...s.buyTrip.cargo };
      // 日の端数（早く帰れたぶん）は次の往復に持ち越す（速さ・早足の効き目が日単位で消えないように）
      if (st && st.task === 'buy') st.lag = Math.min(0.99, Math.max(0, -s.buyTrip.left));
      // 疲れて帰ってきたら、ここで休む
      if (st && st.stamina <= st.stats.hp * STAMINA.tired) st.resting = true;
      s.buyTrip = null;
    }
  }
  // 帰ってきたその日に、次の買い付けに出る（疲れていれば休んでから）
  // 工房で出荷を待つ商品がたまっているあいだは、買い付けを控える（作りすぎて素材代をむだにしない。運ぶ・売るのが追いつけば、また買う）
  const haulersN = s.staff.filter((x) => x.task === 'transport').length;
  // （数えるのは、どこかのお店の棚に並べている商品だけ。並べなくなった商品の売れ残りでは止めない）
  const onShelf = new Set(myShops(s).flatMap((b) => s.shops[b.uid]?.shelves ?? []));
  const waiting = (Object.entries(s.stock) as [Sku, number][]).reduce((a, [x, n]) => a + (onShelf.has(x) ? n ?? 0 : 0), 0);
  const backlog = waiting >= Math.max(20, 2 * cartCap(s) * cartsOf(s) * Math.max(1, haulersN));
  if (!s.buyTrip && ws0 && shopB && !backlog) {
    const st = s.staff.find((x) => x.task === 'buy' && !x.resting);
    const days = st ? buyDays(s, st) : null;
    if (st && days) {
      const sp = speed(st, 'buy', s);
      // 月の量（1 日ぶん × 日数）で、次の次の帰りまで（往復 2 回ぶん）もつように、手元と注文中の素材に足りないぶんを買う。
      // 帰ったら休むことになるときは、休むあいだのぶんも先に買っておく（工房の素材が切れないように）
      const cargo: Partial<Record<Mat, number>> = {};
      const lv = s.proc.lv;
      let free = poolFree(s);
      // （1 日ぶんは、自動なら職人が働いている日の速さ＝100% のときの消費で見る。作業台ごとに 1 ロットぶんの余裕も）
      const rest = st.stamina - drainOf(s, st) * days <= st.stats.hp * STAMINA.tired ? (st.stats.hp * (STAMINA.back - STAMINA.tired)) / restRateOf(s) : 0;
      const full = fullUse(s);
      const wants = procMats(s).map(({ m }) => {
        const onHand = (s.mats[m] ?? 0) + (s.orders ?? []).filter((o) => o.m === m).reduce((a, o) => a + o.qty, 0);
        const manual = s.proc.qty[m] && !s.proc.qty[m]!.auto;
        const daily = (manual ? procQty(s, m) : Math.max(procQty(s, m), full[m] ?? 0)) / DAYS;
        const lots = s.slots.reduce((a, sl) => a + (sl.sku && sl.worker != null ? recipeOf(sl.sku)[m] ?? 0 : 0), 0);
        return { m, want: Math.max(0, daily * (2 * days + rest) + lots - onHand) + (s.proc.carry[m] ?? 0) };
      });
      for (const { m, want } of wants) {
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
        s.buyTrip = { hero: st.hero, left: Math.max(0.01, days - (st.lag ?? 0)), total: days, cargo };
        st.lag = 0;
        working.add(st.hero);
        if (s.proc.lv > lv) res.procLv = s.proc.lv;
      }
    }
  }

  // クラフト
  if (ws) s.util.cap += s.slots.length;
  s.slots.forEach((sl, slotIdx) => {
    const st = sl.worker != null ? staffOf(s, sl.worker) : null;
    if (!sl.running && (sl.repeat || (sl.left ?? 0) > 0) && sl.sku && st && !st.resting && !craftCheck(s, sl.sku, sl.worker)) {
      consume(s, sl.sku);
      sl.running = true;
      // 前のロットで余った進み（日の端数）を持ち越す（速さ・段取りの効き目が日単位で消えないように）
      sl.progress = sl.over ?? 0;
      if (!sl.repeat) sl.left = Math.max(0, (sl.left ?? 0) - batchOf(sl.sku, s));
    }
    sl.over = 0;
    if (!sl.running || !sl.sku || !st || st.resting) return;
    working.add(st.hero);
    s.util.work += 1;
    sl.progress += speed(st, 'craft', s);
    if (sl.progress >= craftDays(s, sl.sku)) {
      s.stock[sl.sku] = (s.stock[sl.sku] ?? 0) + batchOf(sl.sku, s);
      s.ws.made += batchOf(sl.sku, s);
      s.ws.value += batchOf(sl.sku, s) * skuPrice(sl.sku);
      res.crafted.push(sl.sku);
      res.made.push({ slot: slotIdx, sku: sl.sku, n: batchOf(sl.sku, s) });
      sl.running = false;
      sl.over = Math.min(sl.progress - craftDays(s, sl.sku), craftDays(s, sl.sku) * 0.99);
      sl.progress = 0;
    }
  });

  // 運搬：運搬係ごとに、荷車の数まで便を出す
  if (ws) {
    for (const st of s.staff) {
      if (st.task !== 'transport' || st.resting) continue;
      const mine = s.trips.filter((t) => t.hauler === st.hero);
      if (mine.length) working.add(st.hero);
      // 疲れていたら新しい便は出さない（出ている便が帰ってきたら休む）
      if (st.stamina <= st.stats.hp * STAMINA.tired) continue;
      const carts = cartsOf(s);
      if (mine.length >= carts) continue;
      const cap = cartCap(s);
      // 荷車が空いているかぎり便を出す（同じお店へ 2 便目も出せる。お店の裏の空きと「半分ルール」の中で）
      const order = [...shops];
      for (let pass = 0, sent = true; sent && pass < carts; pass++) {
        sent = false;
        for (const shop of order) {
          if (s.trips.filter((t) => t.hauler === st.hero).length >= carts) break;
          const sh = s.shops[shop.uid];
          const capB = storageCap(shop, s);
          const cargo: Partial<Record<Sku, number>> = {};
          let load = 0;
          const inbound = (x: Sku) => s.trips.filter((t) => t.to === shop.uid && !t.dropped).reduce((a, t) => a + (t.cargo[x] ?? 0), 0);
          // 便を出すのは、お店の裏が半分以下のとき（定期便の時刻表があれば、半分を超えていても出し、着くまでに棚へ出るぶん＝品出しの数 × 片道の日数も見込んで積む）。
          // 空きが半便に満たないときは待つ（小さな便で荷車をふさがない）
          const tt = has(s, 'timetable');
          const kinds = Math.max(1, sh.shelves.filter((y) => y).length);
          const ahead = tt ? (displayPerDayOf(s, shop) * oneWay(s, shop, ws).days) / speed(st, 'transport', s) / kinds : 0;
          const minLoad = Math.min(cap, capB) / 2;
          for (const x of sh.shelves) {
            if (!x || load >= cap) continue;
            const room = Math.floor(capB + ahead) - (sh.storage[x] ?? 0) - inbound(x);
            const want = Math.min(room, s.stock[x] ?? 0, cap - load);
            if (want <= 0 || room < minLoad || (!tt && (sh.storage[x] ?? 0) > capB / 2)) continue;
            cargo[x] = want;
            s.stock[x] = (s.stock[x] ?? 0) - want;
            load += want;
          }
          if (load > 0) {
            // 往復の日数：道のりで決まる（遠いお店ほどかかる。物流拠点が近ければそこから）。前の便の日の端数を持ち越す
            const way = oneWay(s, shop, ws);
            const days = Math.max(1, (way.days * 2) / speed(st, 'transport', s));
            s.trips.push({ hauler: st.hero, from: way.from?.uid, to: shop.uid, cargo, left: Math.max(0.01, days - (st.lag ?? 0)), total: days });
            st.lag = 0;
            working.add(st.hero);
            sent = true;
          }
        }
      }
    }
  }
  for (const t of s.trips) t.left -= 1;
  // 帰ってきた便：日の端数（早く着いたぶん）を運搬係の次の便に持ち越す
  for (const t of s.trips) {
    if (t.left > 0) continue;
    const h = staffOf(s, t.hauler);
    if (h) h.lag = Math.min(0.99, (h.lag ?? 0) + Math.max(0, -t.left));
  }
  // 行きが終わったら荷物を下ろす（帰りは空の荷車）
  for (const t of s.trips.filter((x) => !x.dropped && x.left <= x.total / 2)) {
    t.dropped = true;
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
    st.explore += speed(st, 'explore', s);
    const m = st.target as Mat;
    if (st.explore >= MATS[m].exploreDays * scoutMul(s)) {
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
    s.intel[rid] = (s.intel[rid] ?? 0) + speed(st, 'intel', s);
    const lv = intelLv(s, rid);
    if (lv > before) res.intel.push({ rid, lv });
    if (lv >= INTEL.length) {
      st.task = null;
      st.target = null;
    }
  }

  // 発掘隊：発掘作業のあいだは、同じ荒れ地を 1 日に数回ぶん打つ。作業していない日は働かない・スタミナも減らない
  // （常駐（自動化）があれば、作業していない日も許可のある荒れ地を掘る。スタミナは減る）
  for (const st of s.staff) {
    if (st.task !== 'dig' || st.resting || !s.dig) continue;
    if (!s.digRun && (!hasAuto(s) || standSite(s) < 0)) continue;
    working.add(st.hero);
    const hits = autoDig(s, st);
    if (hits.length) (res.dug ??= []).push(...hits);
  }

  // 他店でバイト：日給を受け取り、ときどき能力値が上がる
  for (const st of s.staff) {
    if (st.task !== 'side' || st.resting) continue;
    working.add(st.hero);
    const pay = sidePay(st);
    s.money += pay;
    s.sideMonth = (s.sideMonth ?? 0) + pay;
    book(s, 'side', pay);
    if (rng(s.seed + s.day * 131 + st.hero)() < SIDE.grow) {
      const keys: (keyof Stats)[] = ['int', 'agi', 'phy'];
      const k = keys[Math.floor(rng(s.seed + s.day * 977 + st.hero)() * 3)];
      st.stats = { ...st.stats, [k]: st.stats[k] + 1 };
      res.grew.push({ hero: st.hero, stat: k });
    }
  }

  // 技の修行
  if (s.training && --s.training.left <= 0) {
    const done = finishTraining(s);
    if (done) (res.learned ??= []).push(done);
  }

  // 商品開発
  if (s.lab && --s.lab.left <= 0) {
    if (!s.dev.includes(s.lab.key)) s.dev.push(s.lab.key);
    res.developed.push(s.lab.key);
    brandAdd(s, BRAND.uncommon, t(`${PRODUCT[s.lab.key]?.name ?? s.lab.key}のアンコモンを開発`, `Developed an Uncommon ${PRODUCT[s.lab.key]?.name ?? s.lab.key}`));
    s.lab = null;
  }

  // 陳列と販売
  for (const b of shops) {
    const sh = s.shops[b.uid];
    const st = sh.staff != null ? staffOf(s, sh.staff) : null;
    if (st && !st.resting) working.add(st.hero);
    // 品出しの端数は次の日に持ち越す（速さ・陳列の什器の効き目が 1 個単位で消えないように。使わなかった日は消える）
    const rate = displayRate(s, b, sh, st && !st.resting ? st : null);
    let cap = rate > 0 ? rate + (sh.dcarry ?? 0) : 0;
    let moved = 0;
    for (const x of sh.shelves) {
      if (!x || cap < 1) continue;
      const move = Math.min(Math.floor(cap), sh.storage[x] ?? 0, SHOP.shelfCap - (sh.shelf[x] ?? 0));
      if (move > 0) {
        sh.storage[x] = (sh.storage[x] ?? 0) - move;
        sh.shelf[x] = (sh.shelf[x] ?? 0) + move;
        cap -= move;
        moved += move;
      }
    }
    sh.dcarry = moved > 0 ? Math.min(0.99, cap - Math.floor(cap)) : 0;
    const open = (st && !st.resting) || sh.part > 0;
    if (open) sh.aw = Math.min(1, (sh.aw ?? 1) + AWARE.perDay);
    const empty = sh.shelves.some((x) => x && (sh.shelf[x] ?? 0) <= 0);
    if (open) sh.sat = empty ? Math.max(0.5, sh.sat - 0.01) : Math.min(1, sh.sat + 0.02);
    spend(s, 'part', sh.part * SHOP.partTimeWage);
    s.money -= sh.part * SHOP.partTimeWage;
    sh.cost += sh.part * SHOP.partTimeWage;
  }
  // 売れる：住む場所ごとに、近くて強いお店へお客さんが分かれる（棚が空のお店には来ない＝他社へ流れる）
  const today: Partial<Record<string, number>> = {};
  syncRelics(s);
  for (const p of productsOf(s)) {
    const mine = s.holdSales ? [] : myOffers(s, p.key, true);
    const rv = rivalOffers(s, p.key);
    const month = capture(s, p.key, [...mine, ...rv]);
    mine.forEach((o, n) => {
      const want = month[n] / DAYS + (o.sh.carry[o.x] ?? 0);
      const sold = Math.min(Math.floor(want), o.sh.shelf[o.x] ?? 0);
      o.sh.carry[o.x] = Math.min(1, want - sold);
      o.sh.shelf[o.x] = (o.sh.shelf[o.x] ?? 0) - sold;
      const unit = priceAt(s, o.x, o.sh);
      const yen = sold * unit;
      if (sold > 0) today[p.key] = (today[p.key] ?? 0) + sold;
      s.money += yen;
      s.monthSales[p.key] = (s.monthSales[p.key] ?? 0) + yen;
      o.sh.rev += yen;
      o.sh.cost += sold * unitCost(s, o.x);
      for (let k = 0; k < sold; k++) res.sales.push({ uid: o.b.uid, yen: unit, sku: o.x });
      if (sold > 0) {
        book(s, 'sales', yen);
        if (!s.flags.firstSale) {
          s.flags.firstSale = true;
          brandAdd(s, BRAND.firstSale, t('はじめての売上', 'First sale'));
        }
      }
      s.monthUnits[p.key] = (s.monthUnits[p.key] ?? 0) + sold;
      if (skuParts(o.x)[1] === 'U') s.unitsU += sold;
      // 復刻品：初めて売れた日から独占（どのセクタでも他社が真似しない）
      const rec = sold > 0 && p.relic ? s.recipes?.[p.key] : undefined;
      if (rec && rec.sold == null) rec.sold = s.day;
    });
    // 新商品の認知：棚に並んでいる日に育つ（宣伝が効いている日はさらに）。最初の町は育てない（いつも 1）
    if (!s.holdSales && !sectorProfile(s)?.noSaturation && mine.length) {
      const cur = s.known[p.key] ?? knownStart(s);
      // 手書き POP：認知の育ち +50%
      if (cur < 1) s.known[p.key] = Math.min(1, cur + (AWARE_GOODS.perDay + (adBoost(s) > 0 ? AWARE_GOODS.ad : 0)) * (1 + 0.5 * lvMul(s, 'pop') + fxSum(s, 'known') + museumKnown(s)));
    }
    rv.forEach((o, n) => {
      const yen = (month[mine.length + n] / DAYS) * p.price;
      s.rivalSales[o.rid] += yen;
      const m = (s.rivalProd[o.rid] ??= {});
      m[p.key] = (m[p.key] ?? 0) + yen;
    });
  }

  // POS レジ：きのう売れた数
  if (!s.holdSales) s.yday = today;

  // スタミナ（休憩室・福利厚生で回復 +50% ずつ。減り方は drainOf。SCM の数字の稼働率 uptime と同じ式）
  const restRate = restRateOf(s);
  for (const st of s.staff) {
    if (st.resting) {
      st.stamina = Math.min(st.stats.hp, st.stamina + restRate);
      if (st.stamina >= st.stats.hp * STAMINA.back) st.resting = false;
    } else if (working.has(st.hero)) {
      st.stamina = Math.max(0, st.stamina - drainOf(s, st));
      // 調達係・運搬係は、出ている途中では休まず、帰ってから休む（調達係は休むあいだのぶんを、出るときに先に買ってある）
      const onTrip = (st.task === 'buy' && s.buyTrip?.hero === st.hero) || (st.task === 'transport' && s.trips.some((t) => t.hauler === st.hero));
      if (st.stamina <= st.stats.hp * STAMINA.tired && !onTrip) st.resting = true;
    } else if (st.stamina <= st.stats.hp * STAMINA.tired) {
      // 疲れて帰ってきた（運搬係・調達係）：ここから休む
      st.resting = true;
      st.stamina = Math.min(st.stats.hp, st.stamina + restRate);
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
  // 会社の月の締め（ゲームの最初から 30 日ごと）：ほかのセクタの運営と、帳簿
  if (s.day % DAYS === 0) res.company = closeCompanyMonth(s);
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
  const rows: Rank[] = s.rivals.map((r) => ({ name: rivalDef(r.id)?.name ?? r.id, sales: Math.round(rivals[r.id]), me: false }));
  rows.push({ name: '', sales: Math.round(mine), me: true });
  return rows.sort((a, b) => b.sales - a.sales);
}

export function endMonth(s: P1State): Report {
  s.sideMonth = 0;
  const month = Math.round((s.day - (s.open ?? 0)) / DAYS);
  const news: string[] = [];
  const upkeep = s.buildings.filter((b) => b.owner === 'me' && b.left <= 0).reduce((a, b) => a + upkeepOf(s, b), 0);
  for (const b of s.buildings) {
    const sh = s.shops[b.uid];
    if (!sh) continue;
    sh.last = { rev: Math.round(sh.rev), cost: Math.round(sh.cost + (b.left <= 0 ? upkeepOf(s, b) : 0)) };
    sh.cost = 0;
  }
  s.ws.last = { made: s.ws.made, value: Math.round(s.ws.value) };
  const hauledThisMonth = s.ws.hauled ?? 0;
  s.ws.made = 0;
  s.ws.hauled = 0;
  s.ws.value = 0;
  s.rivalLast = Object.fromEntries(s.rivals.map((r) => [r.id, { total: Math.round(r.base + (s.rivalSales[r.id] ?? 0)), by: { ...(s.rivalProd[r.id] ?? {}) } }]));
  s.rivalProd = {};
  const wages = Math.round(s.staff.reduce((a, st) => a + st.wage, 0) * wageMul(s));
  s.money -= upkeep + wages;
  spend(s, 'upkeep', upkeep);
  spend(s, 'wages', wages);
  const revenue = Object.values(s.monthSales).reduce<number>((a, v) => a + (v ?? 0), 0);
  const rivals: Record<string, number> = {};
  for (const r of s.rivals) rivals[r.id] = r.base + (s.rivalSales[r.id] ?? 0);
  const area = areaRanking(s, revenue, rivals);
  const rank = area.findIndex((x) => x.me) + 1;
  const costs = { ...s.monthCost };
  const sold = Object.values(s.monthUnits).reduce<number>((a, v) => a + (v ?? 0), 0);
  const brandStart = s.brandStart ?? s.brand ?? 0;
  const relicRev = Object.entries(s.monthSales).reduce<number>((a, [k, v]) => a + (isRelic(k) ? (v ?? 0) : 0), 0);
  // 遺物の展示館：展示の価値から来館者と入館料（帳簿の「展示館」）。節目のボーナスも
  syncMuseum(s);
  const mus = museumMonth(s);
  if (mus && s.museum) {
    s.money += mus.income;
    book(s, 'museum', mus.income);
    s.museum.last = mus;
  }
  const report: Report = {
    month,
    revenue: Math.round(revenue),
    ...(relicRev > 0 ? { relic: Math.round(relicRev) } : {}),
    bySeries: { ...s.monthSales },
    costs,
    profit: Math.round(revenue - Object.values(costs).reduce<number>((a, v) => a + v, 0)),
    area,
    rank,
    news,
    flow: { bought: s.proc.bought, made: s.ws.last.made, hauled: hauledThisMonth, sold },
    money: { start: s.moneyStart ?? s.money, end: Math.round(s.money) },
    brand: 0,
    ...(mus ? { museum: mus } : {}),
    ...(s.dig ? { revive: { done: s.dig.sites.filter((x) => x.done).length, all: s.dig.sites.length, dungeon: !!s.dig.dungeon } } : {}),
  };
  void brandStart;

  // 他社の追随：自社が売っている商品を扱う他社が少ないと、ENTRY_AFTER か月ごとに、扱っていない他社が 1 社ずつ真似を始める（0.8 の強さ）。
  // gap の商品も同じ。2 社目が入ると飽和（saturated）になるので、次の gap を探す理由になる。
  // 最初の町（noSaturation）はいままでどおり、誰も売っていない商品に 1 社だけ
  const noSat = !!sectorProfile(s)?.noSaturation;
  for (const p of productsOf(s)) {
    const sold = (s.monthSales[p.key] ?? 0) > 0;
    const n = sellersOf(s, p.key);
    const room = noSat ? n === 0 : n < MARKET.satAt;
    s.alone[p.key] = sold && room ? (s.alone[p.key] ?? 0) + 1 : 0;
    // 復刻品：売れた月なのに独占の始まりが無ければ（日を回さずに締めたとき）、この月から
    const rr = p.relic && sold ? s.recipes?.[p.key] : undefined;
    if (rr && rr.sold == null) rr.sold = s.day;
    // 復刻品の独占のあいだは、どの他社も真似しない（数えるのは続ける。切れた月の締めで 1 社目が真似を始める）
    if (p.relic && monopolyLeft(s, p.key) > 0) {
      s.alone[p.key] = Math.min(ENTRY_AFTER, s.alone[p.key] ?? 0);
      continue;
    }
    if ((s.alone[p.key] ?? 0) >= ENTRY_AFTER) {
      const next = s.rivals.filter((r) => !((r.sells[p.key] ?? 0) > 0) && !r.quit?.includes(p.key)).sort((a, b) => rivals[a.id] - rivals[b.id])[0];
      s.alone[p.key] = 0;
      if (next) {
        next.sells[p.key] = 0.8;
        (next.pull0 ??= {})[p.key] = 0.8;
        (next.follow ??= {})[p.key] = 0;
        news.push(`${rivalDef(next.id)?.name ?? ''}|${p.name}${p.relic ? '|copy' : ''}`);
      }
    }
  }
  // 他社の撤退：追随で入った商品が売れない（その商品の市場の RIVAL.weakShare 未満）月が続いたら、扱うのをやめる
  for (const r of s.rivals) {
    if (!r.follow) continue;
    for (const key of Object.keys(r.follow)) {
      if (!((r.sells[key] ?? 0) > 0)) {
        delete r.follow[key];
        continue;
      }
      // その月の他社の商品ごとの売上が記録されていない（日を回していない）ときは判定しない
      const by = s.rivalLast[r.id]?.by;
      if (!by || !Object.keys(by).length) continue;
      const theirs = by[key] ?? 0;
      const market = (s.monthSales[key] ?? 0) + s.rivals.reduce((a, x) => a + (s.rivalLast[x.id]?.by[key] ?? 0), 0);
      const weak = market > 0 && theirs < market * RIVAL.weakShare;
      r.follow[key] = weak ? (r.follow[key] ?? 0) + 1 : 0;
      if ((r.follow[key] ?? 0) >= RIVAL.weakMonths) {
        delete r.sells[key];
        delete r.follow[key];
        if (r.pull0) delete r.pull0[key];
        (r.quit ??= []).push(key);
        news.push(`${rivalDef(r.id)?.name ?? ''}|${PRODUCT[key]?.name ?? key}|out`);
      }
    }
  }
  // 他社と需要の伸び：他社の「エクステ以外の売上」は市場（需要）と同じだけ伸びる。
  // 売り場の強さは少しずつ伸びるが、扱い始めたときの RIVAL.pullCap 倍で頭打ち（市場より速く強くなり続けない）
  for (const r of s.rivals) {
    r.base *= 1 + MARKET_GROWTH;
    const p0 = (r.pull0 ??= {});
    for (const k of Object.keys(r.sells)) {
      const v = r.sells[k] ?? 0;
      if (p0[k] == null) p0[k] = v;
      r.sells[k] = Math.min(v * (1 + RIVAL_GROWTH), (p0[k] ?? v) * RIVAL.pullCap);
    }
  }
  for (const k of Object.keys(s.demand)) s.demand[k] = (s.demand[k] ?? 0) * (1 + MARKET_GROWTH);

  // 制覇：TOP_STREAK か月続けて 1 位（docs/ISLAND_PHASE1.md「制覇」）。他社の反撃：1 位を取った月から MARKET.rallyMonths か月
  const prev = s.reports.length ? s.reports[s.reports.length - 1].rank : null;
  const top = rank === 1 && revenue > 0;
  const wasTop = (s.topStreak ?? 0) > 0;
  s.topStreak = top ? (s.topStreak ?? 0) + 1 : 0;
  report.streak = s.topStreak;
  s.rally = Math.max(0, (s.rally ?? 0) - 1);
  if (top && !wasTop) {
    s.rally = MARKET.rallyMonths;
    report.rally = { by: area.find((x) => !x.me)?.name ?? '', months: MARKET.rallyMonths };
  }
  // ブランド力：セクタを制覇・1 位を守った・順位が上がった・大きく下がった
  if (top && s.cleared) brandAdd(s, BRAND.stayTop, t('1 位を守った', 'Stayed #1'));
  else if (top && s.topStreak >= TOP_STREAK) brandAdd(s, BRAND.sectorTop, t('ランドセクタを制覇（2 か月続けて 1 位）', 'Conquered the land sector (#1 two months running)'));
  else if (prev !== null && rank < prev) brandAdd(s, BRAND.rankUp * (prev - rank), t(`順位が ${prev} 位 → ${rank} 位に`, `Rank up: #${prev} → #${rank}`));
  if (prev !== null && rank - prev >= 2) brandAdd(s, -BRAND.rankDown * (rank - prev), t(`順位が ${prev} 位 → ${rank} 位に大きく下がった`, `Rank fell: #${prev} → #${rank}`));
  if (has(s, 'b_ads')) brandAdd(s, Math.round(BRAND.adsSkill * lvMul(s, 'b_ads')), t('ブランド広告', 'Brand advertising'));
  if (has(s, 'pr')) brandAdd(s, lvOf(s, 'pr'), t('広報室', 'PR office'));
  // 汎用の効き目：ブランド力が月に +N（IR・ESG 経営など）
  const fxb = Math.round(fxSum(s, 'brand'));
  if (fxb > 0) brandAdd(s, fxb, t('ブランドの取り組み（スキル）', 'Brand initiatives (skills)'));
  // 制覇：はじめて制覇した月にエンブレムを 1 つ
  if (s.topStreak >= TOP_STREAK && !s.cleared) {
    s.emblem = (s.emblem ?? 0) + 1;
    report.emblem = 1;
  }
  if (s.topStreak >= TOP_STREAK) s.cleared = true;
  // OJT：担当のある人の、担当に効く能力が +1（上限 100）
  if (has(s, 'ojt')) report.ojt = ojtMonth(s);
  // 今月の出土品
  if (s.dig) {
    report.dig = { ...s.dig.month };
    s.dig.month = { found: 0, lv: 0, rp: 0 };
  }
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
  report.brand = (s.brand ?? 0) - brandStart;
  s.moneyStart = Math.round(s.money);
  s.brandStart = s.brand ?? 0;
  // 詰まり：締めが終わった時点（他社・需要の伸びも入れたあと）の能力で。月末ポーズで開く SCM ダッシュボードと同じ値になる
  report.bottleneck = jamOf(s);
  // 月次 PDCA：来月の見込み（売上・利益）
  if (has(s, 'pdca')) report.forecast = forecastNext(s, report);
  return report;
}

/** 建物の月の維持費（予算管理で −10%） */
export const upkeepOf = (s: P1State, b: PBuilding) => Math.round((P1B[b.id]?.upkeep ?? 0) * Math.max(0.2, cut(s, 'budget', 0.1) * fxCut(s, 'upkeep')));
/** 給料の倍率（インセンティブ +10%・福利厚生 +5%） */
export const wageMul = (s: P1State) => Math.max(0.2, 1 + (has(s, 'incentive') ? 0.1 : 0) + (has(s, 'welfare') ? 0.05 : 0) - fxSum(s, 'wage'));

/** OJT で上がる能力：仕事の適性の重みがいちばん大きい能力（製造・修行・マネージャーは 3 つのうち低いもの） */
export function ojtStat(st: Staff): keyof Stats | null {
  const t0 = st.task;
  if (!t0 || t0 === 'side') return null;
  const low = (): keyof Stats => (['phy', 'int', 'agi'] as const).reduce((a, k) => (st.stats[k] < st.stats[a] ? k : a), 'phy' as keyof Stats);
  switch (t0) {
    case 'craft':
    case 'train':
    case 'manager':
      return low();
    case 'transport':
      return 'phy';
    case 'shop':
    case 'buy':
      return 'int';
    case 'explore':
      return 'agi';
    case 'intel':
      return st.stats.int <= st.stats.agi ? 'int' : 'agi';
  }
  return null;
}
/** OJT のひと月：担当のある人の能力を 1 上げる。上がった人の数 */
export function ojtMonth(s: P1State): number {
  let n = 0;
  for (const st of s.staff) {
    const k = ojtStat(st);
    if (!k || st.stats[k] >= 100) continue;
    // OJT のレベルぶん（Lv3 で +3）
    st.stats = { ...st.stats, [k]: Math.min(100, st.stats[k] + Math.max(1, lvOf(s, 'ojt'))) };
    n++;
  }
  return n;
}

/**
 * 来月の見込み（月次 PDCA）：いちばん細い段の「ひと月に流せる数」× 並べている商品の平均の値段。
 * 利益は、そこから素材代（同じ数の原価）と今月の決まった費用（給料・維持費・アルバイト・宣伝）を引いたもの
 */
export function forecastNext(s: P1State, r?: Report): { sales: number; profit: number } {
  const caps = stageCaps(s);
  const live = (['buy', 'craft', 'haul', 'sell'] as Stage[]).filter((k) => !caps[k].stopped).map((k) => caps[k].perMonth);
  const units = live.length === 4 ? Math.min(...live) : 0;
  const xs = myShops(s).flatMap((b) => s.shops[b.uid]?.shelves.filter((x): x is Sku => !!x) ?? []);
  const price = xs.length ? xs.reduce((a, x) => a + priceOf(s, x), 0) / xs.length : 0;
  const cost = xs.length ? xs.reduce((a, x) => a + unitCost(s, x), 0) / xs.length : 0;
  const last = r ?? s.reports[s.reports.length - 1];
  const fixed = last ? (last.costs.wages ?? 0) + (last.costs.upkeep ?? 0) + (last.costs.part ?? 0) + (last.costs.ads ?? 0) : 0;
  const sales = Math.round(units * price);
  return { sales, profit: Math.round(sales - units * cost - fixed) };
}

/** 会社の月の締め：ほかのセクタ（マネージャーが運営）の結果を本社へ、帳簿をひと月ぶん閉じる */
export interface CompanyMonth {
  m: number;
  managed: { id: string; rev: number; profit: number; invest: number; toHQ: number; hero: number | null }[];
  /** 四半期が終わった（3 か月ごと） */
  quarter: number | null;
}
export function closeCompanyMonth(s: P1State): CompanyMonth {
  const m = Math.round(s.day / DAYS);
  const managed: CompanyMonth['managed'] = [];
  if (s.land) {
    for (const id of s.land.mine) {
      if (id === s.land.cur) continue;
      const rec = s.land.recs[id];
      if (!rec?.base) continue;
      // マネージャーがほかの仕事に移っていたら、マネージャー不在（売上は下がる）
      const st0 = rec.manager != null ? staffOf(s, rec.manager) : null;
      const st = st0 && st0.task === 'manager' && st0.target === id ? st0 : null;
      // マネージャー研修：売上の倍率 +0.1・持株会社：利益 +10%
      const r = runSector(rec, st?.stats ?? null, m, rng(s.seed + s.day * 31 + id.length * 7 + id.charCodeAt(1)), { rate: 0.1 * lvMul(s, 'mgr') + fxSum(s, 'manager'), profit: 1 + 0.1 * lvMul(s, 'holding') });
      s.money += r.toHQ;
      book(s, 'managed', r.toHQ);
      managed.push({ id, ...r, hero: rec.manager ?? null });
    }
  }
  const books = (s.books ??= newBooks());
  books.months.push({ m, l: books.cur, bs: balance(s) });
  books.months = books.months.slice(-48);
  books.cur = emptyLedger();
  return { m, managed, quarter: books.months.length % 3 === 0 ? books.months.length / 3 : null };
}

/** 貸借対照表の材料：現金・在庫（原価）・建物（取得額）・ほかのセクタへの投資 */
export function balance(s: P1State) {
  const matV = (Object.entries(s.mats) as [Mat, number][]).reduce((a, [m, n]) => a + (n ?? 0) * matPrice(s, m), 0);
  let goods = 0;
  const add = (x: Sku, n: number) => (goods += n * unitCost(s, x));
  for (const [x, n] of Object.entries(s.stock) as [Sku, number][]) add(x, n ?? 0);
  for (const sh of Object.values(s.shops)) {
    for (const [x, n] of Object.entries(sh.shelf) as [Sku, number][]) add(x, n ?? 0);
    for (const [x, n] of Object.entries(sh.storage) as [Sku, number][]) add(x, n ?? 0);
  }
  const bcost = (list: PBuilding[]) => list.filter((b) => b.owner === 'me').reduce((a, b) => a + (P1B[b.id]?.cost ?? 0), 0);
  let buildings = bcost(s.buildings);
  let invest = 0;
  if (s.land)
    for (const rec of Object.values(s.land.recs)) {
      if (rec.snap) buildings += bcost((rec.snap.buildings as PBuilding[]) ?? []);
      invest += rec.capital;
    }
  return { cash: Math.round(s.money), stock: Math.round(matV + goods), buildings: Math.round(buildings), invest: Math.round(invest) };
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

/**
 * 商品を作るのに、まだ足りないもの（いちばん先に要るもの 1 つ）。無ければ null。
 * tech：技のスキル／route：素材のルート（スキル）／pot・dev：Uncommon 以上のセクタでアンコモンにするのに要る魔法の釜・商品開発
 */
export type Need = { kind: 'tech'; skill: string } | { kind: 'route'; skill: string; mat: Mat } | { kind: 'pot'; skill: 'pot' } | { kind: 'dev'; key: string };
export function needFor(s: P1State, key: string): Need | null {
  const p = PRODUCT[key];
  if (!p) return null;
  // 復刻品：素材のルートだけ（技・魔法の釜・商品開発は要らない）
  if (p.relic) {
    for (const m of Object.keys(p.recipe[p.relic.rank]) as Mat[]) if (!hasRoute(s, m)) return { kind: 'route', skill: `route_${m}`, mat: m };
    return null;
  }
  if (p.tech && !has(s, techSkill(p.tech))) return { kind: 'tech', skill: techSkill(p.tech) };
  const wantU = (s.tier ?? 'C') !== 'C';
  const mats = Object.keys({ ...p.recipe.C, ...(wantU ? p.recipe.U : {}) }) as Mat[];
  for (const m of mats) if (!hasRoute(s, m)) return { kind: 'route', skill: `route_${m}`, mat: m };
  if (wantU && !has(s, 'pot')) return { kind: 'pot', skill: 'pot' };
  if (wantU && !s.dev.includes(key)) return { kind: 'dev', key };
  return null;
}

/** 市場データの 1 行 */
export interface MarketRow {
  p: ProductDef;
  demand: number;
  /** 扱っている他社の数と、売り場の強さの合計 */
  sellers: number;
  strength: number;
  /** 自社の棚に並べている */
  mine: boolean;
  sold: number;
  /** このセクタの勝ち筋（gap）で、まだ誰も売っていない */
  gap: boolean;
  /** 他店で供給が足りている（飽和） */
  saturated: boolean;
  /** 作るのに足りないもの */
  need: Need | null;
  /** 新商品の認知（0〜1。最初の町は 1） */
  known: number;
}

/** 市場データ：商品ごとの需要・売っている会社・飽和・作るのに足りないもの（このセクタのランクで出る商品だけ） */
export function market(s: P1State): MarketRow[] {
  const tier = s.tier ?? 'C';
  const gap = gapOf(s);
  return PRODUCTS.filter((p) => tierOk(p, tier)).map((p) => {
    const sellers = sellersOf(s, p.key);
    const strength = s.rivals.reduce((a, r) => a + (r.sells[p.key] ?? 0), 0);
    const mine = Object.values(s.shops).some((sh) => sh.shelves.some((x) => x && skuParts(x)[0] === p.key));
    const demand = Math.round(s.demand[p.key] ?? 0);
    return { p, demand, sellers, strength, mine, sold: Math.round((s.demand[p.key] ?? 0) * (strength > 0 ? 1 : 0)), gap: gap.includes(p.key) && sellers === 0, saturated: saturated(s, p.key), need: needFor(s, p.key), known: knownOf(s, p.key) };
  });
}

/** おすすめの点数：需要 × 値段 ÷ 他社の強さ（飽和ならさらに下げる） */
const recScore = (r: MarketRow) => ((r.demand * r.p.price) / (1 + r.strength * 2)) * (r.saturated ? MARKET.saturated : 1);
/**
 * マインちゃんのおすすめ：このセクタの gap（まだ誰も売っていない）を優先し、その中で需要 × 値段が大きいもの。
 * まだ作れない商品でも勧める（足りないものは needFor）。gap を並べ終えたら、いま作れて供給が足りていないもの
 */
export function recommend(s: P1State): string {
  const rows = market(s);
  const free = rows.filter((r) => !r.mine);
  const gapKeys = gapOf(s);
  const pick = (xs: MarketRow[]) => [...xs].sort((a, b) => recScore(b) - recScore(a))[0];
  // gap を並べ終えたら：いま作れて供給が足りていないもの → いま作れるもの → なんでも
  const best = pick(free.filter((r) => gapKeys.includes(r.p.key))) ?? pick(free.filter((r) => !r.need && !r.saturated)) ?? pick(free.filter((r) => !r.need)) ?? pick(free);
  return (best ?? rows[0]).p.key;
}

// ---------------------------------------------------------------- 復刻品（発掘 v2 の 3 段目。docs/ISLAND_PHASE1.md「3. 復刻品」）

/** 会社で開いた復刻品（開いた順） */
export function openRelics(s: Pick<P1State, 'recipes'>): ProductDef[] {
  const r = s.recipes ?? {};
  return Object.keys(r)
    .filter((k) => PRODUCT[k]?.relic)
    .sort((a, b) => r[a].at - r[b].at || a.localeCompare(b))
    .map((k) => PRODUCT[k]);
}
/** 売り買いする商品の一覧（いまの 17 商品＋会社で開いた復刻品）。市場・販売・他社の計算はここを通る */
export const productsOf = (s: Pick<P1State, 'recipes'>): ProductDef[] => (s.recipes && Object.keys(s.recipes).length ? [...PRODUCTS, ...openRelics(s)] : PRODUCTS);
/** 復刻品の SKU（作るランク：遺物が出たセクタのランク） */
export const relicSku = (key: string): Sku => sku(key, PRODUCT[key]?.relic?.rank ?? 'C');
/** その商品を作るときの SKU（復刻品はそのランク・ほかは Common） */
export const makeSku = (key: string): Sku => (isRelic(key) ? relicSku(key) : sku(key, 'C'));
/** 復刻品のこのセクタの需要（無ければ足す）。開いたとき・セクタを移ったとき・以前のセーブ */
function relicDemand(s: P1State) {
  for (const p of openRelics(s)) if (s.demand[p.key] === undefined) s.demand[p.key] = baseDemand(p, s.tier ?? 'C', sectorProfile(s)) * reviveMul(s);
}
/**
 * 遺物の研究 Lv が DIG_BALANCE.relic.openLv（3）以上になったら、その復刻品のレシピを会社で開く。
 * 新しく開いたら商品キー（開いていた・復刻品が無いなら null）
 */
export function openRelic(s: P1State, ext: number): string | null {
  const p = relicOf(ext);
  if (!p || researchLv(s.research?.[ext] ?? 0) < DIG_BALANCE.relic.openLv) return null;
  s.recipes ??= {};
  if (s.recipes[p.key]) return null;
  s.recipes[p.key] = { at: s.day };
  relicDemand(s);
  return p.key;
}
/** 研究 Lv3 以上なのにまだ開いていない復刻品を開き、このセクタの需要をそろえる（以前のセーブ・セクタの移動） */
export function syncRelics(s: P1State) {
  s.recipes ??= {};
  for (const [id, n] of Object.entries(s.research ?? {})) if (researchLv(n ?? 0) >= DIG_BALANCE.relic.openLv) openRelic(s, Number(id));
  relicDemand(s);
}
/** 独占が切れる日（まだ売っていなければ null） */
export const monopolyEnd = (s: Pick<P1State, 'recipes'>, key: string): number | null => {
  const sold = s.recipes?.[key]?.sold;
  return sold == null ? null : sold + DIG_BALANCE.relic.monopolyMonths * DAYS;
};
/** 独占の残りの月（切り上げ）。まだ売っていなければ monopolyMonths（売った月から始まる）、切れたら 0 */
export function monopolyLeft(s: Pick<P1State, 'recipes' | 'day'>, key: string): number {
  if (!s.recipes?.[key]) return 0;
  const end = monopolyEnd(s, key);
  if (end == null) return DIG_BALANCE.relic.monopolyMonths;
  return Math.max(0, Math.ceil((end - s.day) / DAYS));
}
/** 市場データの復刻品の 1 枚 */
export interface RelicRow {
  p: ProductDef;
  /** 作る SKU（遺物のランク） */
  x: Sku;
  demand: number;
  sellers: number;
  saturated: boolean;
  /** 自社の棚に並べている */
  mine: boolean;
  need: Need | null;
  known: number;
  /** 独占の残りの月（0 で切れた）・まだ売っていない（独占はこれから） */
  left: number;
  started: boolean;
}
/** 市場データの「復刻品」（開いた順。純粋な関数） */
export function relicMarket(s: P1State): RelicRow[] {
  return openRelics(s).map((p) => {
    const sellers = sellersOf(s, p.key);
    const mine = Object.values(s.shops).some((sh) => sh.shelves.some((x) => x && skuParts(x)[0] === p.key));
    return { p, x: relicSku(p.key), demand: Math.round(s.demand[p.key] ?? baseDemand(p, s.tier ?? 'C', sectorProfile(s)) * reviveMul(s)), sellers, saturated: saturated(s, p.key), mine, need: needFor(s, p.key), known: knownOf(s, p.key), left: monopolyLeft(s, p.key), started: s.recipes[p.key]?.sold != null };
  });
}
/** まだ開いていない復刻品のうち、研究 Lv が高い順（市場データの「研究 Lv3 で開く」のシルエット） */
export function relicsSoon(s: Pick<P1State, 'recipes' | 'research'>, n = 3): { p: ProductDef; lv: number }[] {
  return RELICS.filter((p) => !s.recipes?.[p.key] && (s.research?.[p.relic!.ext] ?? 0) > 0)
    .map((p) => ({ p, lv: researchLv(s.research[p.relic!.ext] ?? 0) }))
    .sort((a, b) => b.lv - a.lv || a.p.key.localeCompare(b.p.key))
    .slice(0, n);
}

export const skuOf = (key: string, r: Rar = 'C') => sku(key, r);
/** 売るときの値段（スキル「プレミアム価格」で +15%） */
export const priceOf = (s: P1State, x: Sku) => Math.round(skuPrice(x) * (1 + 0.15 * lvMul(s, 'b_premium')) * (has(s, 'dyn') && sellersOf(s, skuParts(x)[0]) <= 1 ? 1 + 0.08 * lvMul(s, 'dyn') : 1) * (1 + fxSum(s, 'price')));
/** そのお店で売るときの値段（セット販売：2 種類以上並べているお店で +5%） */
export function priceAt(s: P1State, x: Sku, sh: ShopState | null): number {
  const kinds = sh ? new Set(sh.shelves.filter((y) => !!y)).size : 0;
  return Math.round(priceOf(s, x) * (kinds >= 2 ? 1 + 0.05 * lvMul(s, 'set') : 1));
}

// ---------------------------------------------------------------- セーブ

export function serializeP1(s: P1State): string {
  const { ground: _g, ...rest } = s;
  return JSON.stringify(rest);
}

export function deserializeP1(json: string): P1State | null {
  try {
    const o = JSON.parse(json) as Omit<P1State, 'ground'>;
    if ((o.v !== 1 && o.v !== 2 && o.v !== 3 && o.v !== 4 && o.v !== 5 && o.v !== 6) || o.kind !== 'p1') return null;
    const g = groundOf(o.n);
    const open = o.open ?? (o.buildings.some((b) => b.owner === 'me' && b.left <= 0 && P1B[b.id]?.kind === 'shop') ? o.day - (o.day % DAYS) : null);
    const s: P1State = { ...extras(), ...o, open, ground: g };
    // 以前のセーブ：セクタ・ブランド力・帳簿・ランド
    // 流れの案内の途中で閉じたときに、売らないままにならないように
    s.holdSales = false;
    s.sector ??= 'c1';
    s.tier ??= 'C';
    s.brand ??= 0;
    s.brandLog ??= [];
    s.books ??= newBooks();
    // 以前のセーブ：エンブレムは 0 から
    s.emblem ??= 0;
    // 以前のセーブ：パネルのレベルは全部 1
    s.skillLv ??= {};
    // 版 1 → 2：地層の発掘と研究ポイント（研究パネルのレベルの返金・✨ → RP・調査依頼状）
    if (o.v === 1) migrateDig(s, (o as { dust?: number }).dust ?? 0);
    s.rp ??= 0;
    s.research ??= {};
    s.tablets ??= [];
    s.letters ??= [];
    s.presented ??= [];
    // 版 3 の断面で掘っていた深さ（版 3 → 4 で、掘れる層の下限に残す）。壁で作り直す前に数える
    const oldDeep = o.v === 3 ? oldDigDeep(s) : {};
    // 版 2 → 3：荒れ地 4 か所の発掘場に作り直す（研究ノート・RP・お題の発見はそのまま。1 か所目の許可は済み。ツルハシの回数は捨てる）
    // 版 4 → 5：上から掘る断面を、正面の壁で作り直す（掘りかけの進みは捨てる。許可・掘りきりの印はそのまま）
    ensureDig(s);
    // 発掘作業の途中で閉じた：作業は終わり。月をまたいでいたら、月末ポーズから
    if (s.digRun) {
      if (s.reports.length > s.digRun.rep0) s.monthPause = true;
      s.digRun = null;
    }
    // 版 3 → 4：発掘の道具（工房の設備投資）を発掘の枝のパネルへ。研究 Lv・掘れる層は、いままでの深さを下限に
    if (o.v < 4) migrateDigTree(s, oldDeep);
    s.resCapPaid ??= researchCap(s);
    // 版 5 → 6：掘りきった荒れ地は復興済みに・4 か所とも掘りきっていたら、いちばん番号の大きい荒れ地をダンジョンに（ensureDig の syncRevive）。
    // 地面はセーブに入れないので、復興の小道をここで通す
    syncGround(s);
    s.v = 6;
    if (s.gateOpen && !s.land) s.land = newLand(s.sector);
    // 以前のセーブ：卸問屋が無ければ建てておく
    if (!s.buildings.some((b) => b.id === 'wholesale')) placeTown(s, 'wholesale', rng(s.seed + 11), 'town', [1, 14]);
    // 以前のセーブ：能力値が MCH の値のままなら縮める（バイトで上がったぶんも同じ割合で）
    if ((s.statV ?? 1) < 2) {
      for (const st of s.staff) st.stats = scaleStats(st.stats);
      s.statV = 2;
    }
    // 以前のセーブ：自分でスキルを取っていれば、本社は開放済み（チュートリアルでもらう「人材の募集」は数えない）
    if (s.flags.hq === undefined && s.skills.some((k) => k !== 'hire')) s.flags.hq = true;
    // 以前のセーブ：チュートリアルが済んでいて人材の募集があれば、アンロックの演出は見たことに
    if (s.flags.hireUnlocked === undefined && s.skills.includes('hire') && (typeof s.tut !== 'number' || s.tut >= 99)) s.flags.hireUnlocked = true;
    // 以前のセーブ：建築のカテゴリは、いま開いているものを見たことに（演出はこれから開くものだけ）
    s.flags.buildCats ??= BUILD_CATS.filter((c) => buildCatOpen(s, c.id)).map((c) => c.id);
    // 以前のセーブ：関所が無ければ建てておく
    if (!gateOf(s)) placeTown(s, GATE_ID, rng(s.seed + 13), 'town', GATE.at);
    // 以前のセーブ：釜があれば全部のアンコモンを開発済みに
    if (!(o as Partial<P1State>).dev && s.skills.includes('pot')) s.dev = PRODUCTS.map((p) => p.key);
    s.monthCost.ads ??= 0;
    // 以前のセーブ：あとから足した商品の需要（セクタのはじめの値）
    for (const p of PRODUCTS) if (s.demand[p.key] === undefined) s.demand[p.key] = baseDemand(p, s.tier ?? 'C', sectorProfile(s));
    // 以前のセーブ：復刻品のレシピ（研究 Lv3 以上の遺物は開いている）
    s.recipes ??= {};
    syncRelics(s);
    for (const sh of Object.values(s.shops)) {
      sh.cost ??= 0;
      sh.last ??= null;
    }
    // 以前のセーブ：制覇（2 か月続けて 1 位）と他社の反撃。もう制覇していればそのまま
    s.topStreak ??= s.cleared ? TOP_STREAK : 0;
    s.rally ??= 0;
    migrateEquipSkills(s);
    return s;
  } catch {
    return null;
  }
}

/**
 * 以前のセーブ：設備のスキル（棚・作業台・荷車・置き場所など）を設備投資へ移す。
 * スキルを外し、いまのセクタの工房・お店（全部）・倉庫（全部）に同じ段を付ける（お金は取らない）。
 * ほかのセクタの写し（land.recs[].snap）は触らない（戻ったときは付いていない。fitEquipment）
 */
export function migrateEquipSkills(s: P1State) {
  const old = s.skills.filter((k) => SKILL_TO_INVEST[k]);
  if (!old.length) return;
  s.skills = s.skills.filter((k) => !SKILL_TO_INVEST[k]);
  for (const k of old) {
    const x = INVEST[SKILL_TO_INVEST[k]];
    const targets = s.buildings.filter((b) => b.owner === 'me' && P1B[b.id]?.kind === x.kind);
    for (const b of targets) b.inv = { ...b.inv, [x.id]: Math.min(x.cost.length, invLv(b, x.id) + 1) };
  }
  syncSlots(s);
  for (const b of myShops(s)) if (s.shops[b.uid]) syncShop(s, b);
}

// ---------------------------------------------------------------- 地図の吹き出し（自社の施設）

export type Stop = 'gateShut' | 'gateOpen' | 'noCrafter' | 'crafterRest' | 'noItem' | 'noMats' | 'full' | 'noHauler' | 'noProduct' | 'noClerk' | 'clerkRest' | 'soldOut';
/** 施設のようす：動いているなら作っている／売っている商品、止まっているなら理由（error＝止まっている、warn＝流れが詰まりかけ） */
export type FacilityStatus = { kind: 'craft' | 'sell'; items: Sku[] } | { level: 'error' | 'warn' | 'info'; stop: Stop };

export function facilityStatus(s: P1State, b: PBuilding): FacilityStatus | null {
  if (isGate(b)) return s.gateOpen ? { level: 'info', stop: 'gateOpen' } : { level: 'warn', stop: 'gateShut' };
  if (b.owner !== 'me' || b.left > 0) return null;
  const kind = P1B[b.id]?.kind;
  if (kind === 'workshop') {
    // 作業中か、続けて作る設定で次も作れる作業台（1 回ぶんができた直後も「作っている」とみなす）
    const live = s.slots.filter((sl) => {
      const st = sl.worker != null ? staffOf(s, sl.worker) : null;
      return sl.sku && st && !st.resting && (sl.running || ((sl.repeat || (sl.left ?? 0) > 0) && !craftCheck(s, sl.sku, sl.worker)));
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
  /** ④ 販売だけ：どちらの制限が効いているか（需要から取れる数／お店の処理力）と、その 2 つの数 */
  why?: 'demand' | 'capacity';
  demand?: number;
  capacity?: number;
}

/** 作業台の体制で、ひと月に作れる商品の数と、そのとき要る素材 */
function craftPlan(s: P1State) {
  let units = 0;
  const need: Partial<Record<Mat, number>> = {};
  for (const sl of s.slots) {
    if (!sl.sku || sl.worker == null) continue;
    const st = staffOf(s, sl.worker);
    if (!st) continue;
    // 職人の稼働率（休む日は作業台が止まる）
    const lots = (DAYS * speed(st, 'craft', s) * uptime(s, st)) / craftDays(s, sl.sku);
    units += lots * batchOf(sl.sku, s);
    for (const [m, q] of Object.entries(recipeOf(sl.sku))) need[m as Mat] = (need[m as Mat] ?? 0) + lots * (q ?? 0);
  }
  return { units, need };
}

/** 往復の日数（運搬係 1 人・お店 1 軒あたりの平均） */
function haulDays(s: P1State, st: Staff): number {
  const ws = myWorkshop(s);
  const shops = myShops(s);
  if (!ws || !shops.length) return 0;
  const d = shops.reduce((a, b) => a + Math.max(1, (oneWay(s, b, ws).days * 2) / speed(st, 'transport', s)), 0) / shops.length;
  return Math.max(1, d);
}

/** お店の棚に商品があるとして、ひと月に売れそうな数（いまの売り場の強さ・認知度・ライバルで） */
/** その商品を自社のお店（無ければ区画の真ん中のお店 1 軒）に並べたときの、ひと月に売れる見込みの数 */
export function sellEstimate(s: P1State, key: string, r: Rar = 'C'): number {
  const rv = rivalOffers(s, key);
  const shops = myShops(s);
  const g = goodsMul(s, key, r) * knownOf(s, key);
  const mine = shops.length ? shops.map((b) => ({ i: b.i, j: b.j, w: (P1B[b.id].pull ?? 1) * brandPull(s.brand, lvMul(s, 'd_ops')) * g, g: 'me' })) : [{ i: Math.floor(s.n / 2), j: Math.floor(s.n / 2), w: g, g: 'me' }];
  const out = capture(s, key, [...mine, ...rv]);
  return mine.reduce((a, _, n) => a + out[n], 0);
}

/**
 * 需要から取れる数（並べている商品ごとに、エリアの需要を家ごとに自社と他社で取り合った自社の取り分の合計）。
 * capture は家ごとに「自社のいちばん来やすいお店 1 軒」の強さで会社を選ぶので、同じ商圏に同じ商品のお店・棚を足しても増えない。
 * mul：自社の売り場の強さに掛ける倍率（打ち手の見込み用）
 */
function potentialOf(s: P1State, mul = 1) {
  let units = 0;
  let yen = 0;
  const byKey: Record<string, number> = {};
  /** `${uid}:${sku}` → その棚の月の数 */
  const byShelf: Record<string, number> = {};
  // 店員の稼働率：店員がいる日（in）と休んでいる日（out。アルバイトだけ・いなければ閉店）を、稼働率の平均で混ぜる
  const clerks = myShops(s)
    .map((b) => s.shops[b.uid])
    .filter((sh) => sh?.staff != null && sh.shelves.some((x) => x))
    .map((sh) => staffOf(s, sh.staff!))
    .filter((x): x is Staff => !!x);
  const u = clerks.length ? clerks.reduce((a, st) => a + uptime(s, st), 0) / clerks.length : 1;
  for (const [away, k] of [
    [false, u],
    [true, 1 - u],
  ] as [boolean, number][]) {
    if (k <= 0) continue;
    for (const p of productsOf(s)) {
      const mine = myOffers(s, p.key, false, away).map((o) => ({ ...o, w: o.w * mul }));
      if (!mine.length) continue;
      const month = capture(s, p.key, [...mine, ...rivalOffers(s, p.key)]);
      for (let n = 0; n < mine.length; n++) {
        const v = month[n] * k;
        units += v;
        yen += v * priceAt(s, mine[n].x, mine[n].sh);
        byKey[p.key] = (byKey[p.key] ?? 0) + v;
        byShelf[`${mine[n].b.uid}:${mine[n].x}`] = (byShelf[`${mine[n].b.uid}:${mine[n].x}`] ?? 0) + v;
      }
    }
  }
  return { units, yen, byKey, byShelf };
}

export function salesPotential(s: P1State): number {
  return potentialOf(s).units;
}

/**
 * お店 1 軒が 1 日に棚へ並べられる数（店員の品出し × 速さ ＋ アルバイト）×（陳列の什器 +30%／段）×（品出しの名人 ×1.5）＋ 営業時間の延長 +2。
 * clerk：品出しをする店員（休憩中なら null を渡す）。step の陳列と、販売の段の「お店の処理力」で同じ式
 */
function displayRate(s: P1State, b: PBuilding, sh: ShopState, clerk: Staff | null, u = 1): number {
  const base = (clerk ? SHOP.displayPerDay * speed(clerk, 'shop', s) * u : 0) + sh.part * SHOP.partTimeDisplay;
  // 開いている日の割合（アルバイトがいればいつも。店員だけなら稼働率）
  const open = sh.part > 0 ? 1 : clerk ? u : 0;
  return base * (1 + 0.3 * invLv(b, 'fixtures')) * (1 + 0.5 * lvMul(s, 'display') + fxSum(s, 'display')) + 2 * lvMul(s, 'hours') * open;
}
/** お店 1 軒の 1 日の品出しの数（いつもの体制：店員は稼働率ぶん。uptime） */
export function displayPerDayOf(s: P1State, b: PBuilding): number {
  const sh = s.shops[b.uid];
  if (!sh) return 0;
  const clerk = sh.staff != null ? staffOf(s, sh.staff) : null;
  return displayRate(s, b, sh, clerk, clerk ? uptime(s, clerk) : 1);
}
/** お店の処理力：商品を並べている自社のお店の「1 日に棚に並べられる数 × 30」の合計（ひと月に売れる数の上限） */
export function displayCap(s: P1State): number {
  return myShops(s).reduce((a, b) => a + (s.shops[b.uid]?.shelves.some((x) => x) ? displayPerDayOf(s, b) * DAYS : 0), 0);
}

/**
 * お店ごとの「売れる見込み／月」（uid → 個）：そのお店の棚ごとの需要から取れる数の合計と、そのお店の処理力（品出し × 30 日）の小さいほう。
 * 販売管理の一覧用。純粋関数
 */
export function shopEstimates(s: P1State): Record<number, number> {
  const pot = potentialOf(s);
  const out: Record<number, number> = {};
  for (const b of myShops(s)) {
    const sh = s.shops[b.uid];
    if (!sh) continue;
    let n = 0;
    for (const x of new Set(sh.shelves.filter((x): x is Sku => !!x))) n += pot.byShelf[`${b.uid}:${x}`] ?? 0;
    const cap = sh.shelves.some((x) => x) ? displayPerDayOf(s, b) * DAYS : 0;
    out[b.uid] = Math.round(Math.min(n, cap));
  }
  return out;
}

// ---------------------------------------------------------------- ④ 販売の内訳（SCM ダッシュボード）

/** 家から見て、自社のお店の届き方がこれより小さいと「遠くて届かない」（およそ 4 マス以上） */
export const FAR_REACH = 0.3;
/** 頭打ちの理由（まとめの 1 行。判定の順） */
export type SellWhy = 'capacity' | 'demand' | 'far' | 'known' | 'rival';
/** 商品ごとの「なぜ取れていないか」 */
export type GoodsWhy = 'saturated' | 'known' | 'far' | 'rival' | 'ok';
export interface SellGoods {
  key: string;
  x: Sku;
  /** エリアの需要（個／月。demand × MARKET.pot） */
  demand: number;
  /** いま売れる見込み（個／月） */
  units: number;
  /** 自社の取り分（units ÷ demand） */
  share: number;
  sellers: number;
  saturated: boolean;
  /** 認知（商品の認知 × 並べているお店の認知度の平均） */
  known: number;
  /** どのお店からも遠い家の需要の割合 */
  far: number;
  why: GoodsWhy;
}
export interface SellShop {
  b: PBuilding;
  /** 商圏の家（届く家の数）と、その家の需要がエリア全体に占める割合 */
  homes: number;
  reach: number;
  /** 商圏の家のうち、ほかの自社のお店（同じ商品）のほうが来やすい・同じ割合（＝自社どうしの取り合い） */
  overlap: number;
  /** 同じ商品を扱う他社のうち、いちばん近いお店までのマス数（無ければ null）と、商圏の近くの他社の数 */
  rivalDist: number | null;
  rivals: number;
  goods: Sku[];
}
export interface SellInfo {
  /** 需要から取れる数・お店の処理力・販売の数字（小さいほう） */
  potential: number;
  capacity: number;
  perMonth: number;
  why: SellWhy;
  /** 需要で重みをつけた平均：取り分・飽和の割合・遠い家の割合・認知 */
  share: number;
  satShare: number;
  far: number;
  known: number;
  goods: SellGoods[];
  shops: SellShop[];
}

const manhattan = (a: { i: number; j: number }, b: { i: number; j: number }) => Math.abs(a.i - b.i) + Math.abs(a.j - b.j);

/** ④ 販売の内訳：頭打ちの理由・商品ごと・お店ごと（docs/ISLAND_PHASE1.md「販売の内訳」） */
export function sellInfo(s: P1State): SellInfo {
  const pot = potentialOf(s);
  const capacity = displayCap(s);
  const { list, total } = sources(s);
  const goods: SellGoods[] = [];
  for (const p of productsOf(s)) {
    const mine = myOffers(s, p.key, false);
    if (!mine.length) continue;
    const demand = (s.demand[p.key] ?? 0) * MARKET.pot;
    const units = pot.byKey[p.key] ?? 0;
    const shops = [...new Set(mine.map((o) => o.b))];
    let farPop = 0;
    for (const k of list) if (Math.max(...shops.map((b) => reach(manhattan(b, k)))) < FAR_REACH) farPop += k.pop;
    const far = farPop / total;
    const aw = shops.reduce((a, b) => a + (s.shops[b.uid].aw ?? 1), 0) / shops.length;
    const known = knownOf(s, p.key) * aw;
    const sat = saturated(s, p.key);
    const sellers = sellersOf(s, p.key);
    const why: GoodsWhy = sat ? 'saturated' : known < 0.7 ? 'known' : far >= 0.4 ? 'far' : sellers > 0 ? 'rival' : 'ok';
    goods.push({ key: p.key, x: mine[0].x, demand, units, share: demand > 0 ? units / demand : 0, sellers, saturated: sat, known, far, why });
  }
  goods.sort((a, b) => b.demand - a.demand);
  const dSum = goods.reduce((a, g) => a + g.demand, 0) || 1;
  const wavg = (f: (g: SellGoods) => number) => goods.reduce((a, g) => a + f(g) * g.demand, 0) / dSum;
  const share = goods.reduce((a, g) => a + g.units, 0) / dSum;
  const satShare = wavg((g) => (g.saturated ? 1 : 0));
  const far = wavg((g) => g.far);
  const known = goods.length ? wavg((g) => g.known) : 1;

  // お店ごと：商圏の家・自社どうしの重なり（capture の gmax：家ごとに自社は最も来やすい 1 軒ぶんしか数えない）
  const shopsOn = myShops(s).filter((b) => s.shops[b.uid]?.shelves.some((x) => x));
  const keysOf = (b: PBuilding) => new Set(s.shops[b.uid].shelves.filter((x): x is Sku => !!x).map((x) => skuParts(x)[0]));
  const shops: SellShop[] = shopsOn.map((b) => {
    const keys = keysOf(b);
    const peers = shopsOn.filter((o) => o.uid !== b.uid && [...keysOf(o)].some((k) => keys.has(k)));
    let homes = 0;
    let pop = 0;
    let over = 0;
    for (const k of list) {
      const r = reach(manhattan(b, k));
      if (r < FAR_REACH) continue;
      homes++;
      pop += k.pop;
      if (peers.some((o) => reach(manhattan(o, k)) >= r)) over += k.pop;
    }
    let rivalDist: number | null = null;
    let rivals = 0;
    for (const r of s.rivals) {
      const rb = s.buildings.find((x) => x.owner === r.id);
      if (!rb || ![...keys].some((k) => (r.sells[k] ?? 0) > 0)) continue;
      const d = manhattan(rb, b);
      if (d <= MARKET.d0 * 1.5) rivals++;
      rivalDist = rivalDist == null ? d : Math.min(rivalDist, d);
    }
    return { b, homes, reach: pop / total, overlap: pop > 0 ? over / pop : 0, rivalDist, rivals, goods: s.shops[b.uid].shelves.filter((x): x is Sku => !!x) };
  });

  const perMonth = Math.min(pot.units, capacity);
  const why: SellWhy = capacity < pot.units ? 'capacity' : share >= 0.5 || satShare >= 0.5 ? 'demand' : far >= 0.4 ? 'far' : known < 0.7 ? 'known' : 'rival';
  return { potential: pot.units, capacity, perMonth, why, share, satShare, far, known, goods, shops };
}

/** 打ち手の種類：別の商品・棚 +1 と別の商品・次のお店・売り場の強さ +15%・認知 100%・アルバイト +1・陳列の什器 +1 */
export type WhatIfKind = 'goods' | 'shelf' | 'shop' | 'pull' | 'known' | 'part' | 'fixtures';
export interface WhatIf {
  kind: WhatIfKind;
  /** 販売の数字（需要から取れる数と処理力の小さいほう）の増え方（個／月）と、売上の増え方（G／月） */
  units: number;
  yen: number;
  /** 効き目が +2 個以上（それ未満は「いまは効かない」） */
  ok: boolean;
  /** goods：並べる商品・お店・棚（replace：入れ替え） */
  key?: string;
  uid?: number;
  replace?: Sku | null;
  /** shop：建てるマス（人流解析の区画なら hot） */
  at?: [number, number];
  hot?: boolean;
  /** shelf：設備投資の値段 */
  cost?: number;
}

/** 販売の数字と売上（処理力で頭打ちなら、その割合で売上も縮める） */
export function sellNow(s: P1State, mul = 1): { units: number; yen: number } {
  const pot = potentialOf(s, mul);
  const cap = displayCap(s);
  const units = Math.min(pot.units, cap);
  return { units, yen: pot.units > 0 ? (pot.yen * units) / pot.units : 0 };
}

/** お店の写し（打ち手の見込み用。元の状態は書き換えない） */
const withShops = (s: P1State, shops: Record<number, ShopState>): P1State => ({ ...s, shops: { ...s.shops, ...shops } });

/**
 * 打ち手ごとの見込み：候補を状態の写しに仮に当てて、販売の数字（salesPotential と処理力の小さいほう）を計算し直す。
 * 純粋関数（s は書き換えない）。効き目の大きい順
 */
export function sellWhatIf(s: P1State): WhatIf[] {
  const base = sellNow(s);
  const out: WhatIf[] = [];
  const add = (w: Omit<WhatIf, 'units' | 'yen' | 'ok'>, after: { units: number; yen: number }) => {
    const units = after.units - base.units;
    out.push({ ...w, units, yen: after.yen - base.yen, ok: units >= 2 });
  };
  const shops = myShops(s).filter((b) => s.shops[b.uid]?.shelves.some((x) => x));
  const served = shops.filter((b) => s.shops[b.uid].staff != null || s.shops[b.uid].part > 0);
  if (!served.length) return out;
  const { list } = sources(s);
  // いちばん強いお店：商圏の家（来やすさの重み）× 売り場に人がいる
  const area = (b: { i: number; j: number }) => list.reduce((a, k) => a + k.pop * reach(manhattan(b, k)), 0);
  const strong = [...served].sort((a, b) => area(b) - area(a))[0];
  const pot = potentialOf(s);

  // 別の商品：マインちゃんのおすすめを、いちばん強いお店の空き棚（無ければ見込みのいちばん小さい棚と入れ替え）に
  const rec = recommend(s);
  const stocked = new Set(Object.values(s.shops).flatMap((sh) => sh.shelves.filter((x): x is Sku => !!x).map((x) => skuParts(x)[0])));
  if (!stocked.has(rec)) {
    const sh = s.shops[strong.uid];
    const x = sku(rec, (s.tier ?? 'C') !== 'C' && s.dev.includes(rec) ? 'U' : 'C');
    let idx = sh.shelves.findIndex((y) => !y);
    if (idx < 0) idx = sh.shelves.reduce((m, y, k) => ((pot.byShelf[`${strong.uid}:${y}`] ?? 0) < (pot.byShelf[`${strong.uid}:${sh.shelves[m]}`] ?? 0) ? k : m), 0);
    const shelves = [...sh.shelves];
    const replace = shelves[idx];
    shelves[idx] = x;
    add({ kind: 'goods', key: rec, uid: strong.uid, replace }, sellNow(withShops(s, { [strong.uid]: { ...sh, shelves } })));
    // 空き棚が無ければ：棚を増やして（設備投資）並べる。入れ替えずに足すので、いまの商品の売上も残る
    if (replace && investCost(strong, 'shelves') != null) {
      const nb: PBuilding = { ...strong, inv: { ...strong.inv, shelves: invLv(strong, 'shelves') + 1 } };
      add({ kind: 'shelf', key: rec, uid: strong.uid, cost: investCost(strong, 'shelves')! }, sellNow({ ...withShops(s, { [strong.uid]: { ...sh, shelves: [...sh.shelves, x] } }), buildings: s.buildings.map((b) => (b.uid === strong.uid ? nb : b)) }));
    }
  }

  // 次のお店（よろず屋）：置ける区画のうち、いちばん伸びる所。並べるのは需要の大きい商品、売り場はいちばん強いお店と同じ体制（慣れたあと）
  const id = 'general_store';
  if (canBuild(s, id) === null || canBuild(s, id) === 'money') {
    const top = [...stocked].sort((a, b) => (s.demand[b] ?? 0) - (s.demand[a] ?? 0));
    const from = s.shops[strong.uid];
    const pick = (k: string) => from.shelves.find((y) => y && skuParts(y)[0] === k) ?? Object.values(s.shops).flatMap((sh) => sh.shelves).find((y) => y && skuParts(y)[0] === k) ?? null;
    const shelves = top.slice(0, P1B[id].shelves ?? 1).map(pick);
    const hot = hotCells(s);
    let best: { at: [number, number]; r: { units: number; yen: number }; hot: boolean } | null = null;
    for (let j = 0; j < s.n; j++)
      for (let i = 0; i < s.n; i++) {
        const dirs = allowedDirs(s, id, i, j);
        if (!dirs.length) continue;
        const uid = s.nextUid;
        const b: PBuilding = { uid, id, i, j, dir: dirs[0], left: 0, owner: 'me' };
        const sh: ShopState = { uid, shelves, staff: from.staff, part: from.part, storage: {}, shelf: {}, sat: 1, carry: {}, rev: 0, cost: 0, last: null, aw: 1 };
        const r = sellNow({ ...withShops(s, { [uid]: sh }), buildings: [...s.buildings, b] });
        const isHot = hot.has(j * s.n + i);
        // 同じくらいなら人流解析の区画を選ぶ
        if (!best || r.units > best.r.units + 0.5 || (r.units > best.r.units - 0.5 && isHot && !best.hot)) best = { at: [i, j], r, hot: isHot };
      }
    if (best) add({ kind: 'shop', at: best.at, hot: best.hot }, best.r);
  }

  // 売り場の強さ +15%（接客の研修・看板 1 段）
  add({ kind: 'pull' }, sellNow(s, 1.15));

  // 認知を 100% に（宣伝）：並べている商品の認知と、お店の認知度
  const known = { ...s.known };
  for (const k of stocked) known[k] = 1;
  const aw: Record<number, ShopState> = {};
  for (const b of shops) aw[b.uid] = { ...s.shops[b.uid], aw: 1 };
  add({ kind: 'known' }, sellNow({ ...withShops(s, aw), known }));

  // 処理力が効いているときだけ：アルバイト +1・陳列の什器 +1（処理力のいちばん小さいお店に）
  if (displayCap(s) < pot.units) {
    const weak = [...served].sort((a, b) => displayPerDayOf(s, a) - displayPerDayOf(s, b));
    const pt = weak.find((b) => s.shops[b.uid].part < partMax(s, b.uid));
    if (pt) add({ kind: 'part', uid: pt.uid }, sellNow(withShops(s, { [pt.uid]: { ...s.shops[pt.uid], part: s.shops[pt.uid].part + 1 } })));
    const fx = weak.find((b) => investCost(b, 'fixtures') != null);
    if (fx) {
      const nb: PBuilding = { ...fx, inv: { ...fx.inv, fixtures: invLv(fx, 'fixtures') + 1 } };
      add({ kind: 'fixtures', uid: fx.uid }, sellNow({ ...s, buildings: s.buildings.map((x) => (x.uid === fx.uid ? nb : x)) }));
    }
  }
  return out.sort((a, b) => b.units - a.units || b.yen - a.yen);
}

/**
 * 1 便あたりに運べる数と、運搬係 1 人が 1 往復のあいだに運べる数（荷車の数 × 1 便）、お店ごとの受け入れ（お店の裏に入る量）。
 * 1 便はお店の裏（storageCap）より多く積めない（定期便の時刻表があれば、着くまでに棚へ出るぶんを見込んで積める）。
 * docs/ISLAND_PHASE1.md「SCM ダッシュボード」の ③ 物流
 */
export function haulLoad(s: P1State): { perTrip: number; perCycle: number; shops: { b: PBuilding; q: number }[] } {
  const L = cartCap(s);
  const on = myShops(s).filter((b) => s.shops[b.uid]?.shelves.some((x) => x));
  const list = on.length ? on : myShops(s);
  if (!list.length) return { perTrip: L, perCycle: L * cartsOf(s), shops: [] };
  const tt = has(s, 'timetable');
  // お店の裏に入る量（運んでいる途中の荷物も含めて）。定期便のぶん（着くまでに棚へ出る量）は stageCaps で足す
  const shops = list.map((b) => ({ b, q: storageCap(b, s) }));
  // 定期便の時刻表があれば、着くまでに売れるぶんも見込んで積む（1 便はお店の裏より多くてもよい）
  const perTrip = tt ? L : Math.min(L, Math.max(...list.map((b) => storageCap(b, s))));
  return { perTrip, perCycle: cartsOf(s) * perTrip, shops };
}

/**
 * 調達係 1 人がひと月に運べる素材の数（往復の回数 × 1 往復の量）。1 往復の量は工房の置き場所で頭打ち
 * （出るとき、前の往復で届いた素材がまだ置き場所にあるので、(置き場所 − 使わない素材 − 出荷待ちの商品) の半分ほど）
 */
export function buyTripMonth(s: P1State, st: Staff): number {
  const days = buyDays(s, st);
  if (!days) return 0;
  const cap = poolCap(s);
  const used = new Set(procMats(s).map((o) => o.m));
  const dead = (Object.entries(s.mats) as [Mat, number][]).reduce((a, [m, n]) => a + (used.has(m) ? 0 : n ?? 0), 0);
  const perTrip = Math.max(0, (cap - dead - Math.min(cap / 2, cartCap(s))) / 2);
  // 1 往復の量が置き場所で頭打ちのときは、休む前に休むあいだのぶんを先に買っておけないので、休みのぶん回数が減る（稼働率）
  return (uptime(s, st) * DAYS * perTrip) / days;
}

/** exact：数字を丸めない（監査・見込みの比べ用）。noSell：④ 販売を計算しない（見込みの比べで、ほかの段だけ要るとき） */
export function stageCaps(s: P1State, exact = false, noSell = false): Record<Stage, StageCap> {
  const R = (v: number) => (exact ? v : Math.round(v));
  const plan = craftPlan(s);
  // 調達：調達係の月の量で、作業台の要る素材をどれだけまかなえるか（調達係がいなければ手元の素材だけ）。
  // 調達係が休む日は買い付けに出ない（稼働率）・月の調達の上限（procCap）・1 往復で運べる量（置き場所）で頭打ち
  const buyer = s.staff.find((x) => x.task === 'buy') ?? null;
  let ratio = Infinity;
  let f = 1;
  if (buyer) {
    const total = procMats(s).reduce((a, o) => a + procQty(s, o.m), 0);
    // 休んだ日のぶんは次の買い付けで取り戻すので、稼働率は 1 往復で運べる量（buyTripMonth）の回数にだけ効く
    if (total > 0) f = Math.min(1, procCap(s) / total, buyTripMonth(s, buyer) / total);
  }
  for (const [m, q] of Object.entries(plan.need)) {
    const have = buyer ? (hasRoute(s, m as Mat) && procMats(s).some((o) => o.m === m) ? procQty(s, m as Mat) * f : 0) : s.mats[m as Mat] ?? 0;
    ratio = Math.min(ratio, (q ?? 0) > 0 ? have / (q ?? 1) : Infinity);
  }
  if (!Number.isFinite(ratio)) ratio = plan.units > 0 ? 1 : 0;
  // 調達係がいないときは手元の素材ぶんだけ（あと 3 日ぶんを切ったら止まっている扱い）
  const buy = { perMonth: R(plan.units * ratio), stopped: !buyer && ratio * DAYS < 3 };
  const craft = { perMonth: R(plan.units), stopped: !s.slots.some((sl) => sl.worker != null && sl.sku) };
  // 物流：運搬係ごとに（稼働率 × ひと月の往復の回数 × 1 往復で運べる数）
  const haulers = s.staff.filter((x) => x.task === 'transport');
  const load = haulLoad(s);
  // 荷車：運搬係ごとに（稼働率 × ひと月の往復の回数 × 荷車の数 × 1 便）。運搬係は便が帰ってきてから休む
  const carts = haulers.reduce((a, st) => {
    const round = haulDays(s, st);
    return round ? a + ((uptime(s, st) * DAYS) / round) * load.perCycle : a;
  }, 0);
  // お店の受け入れ：運んでいる途中の荷物は、下ろすまで（片道のあいだ）お店の裏の空きを取っておく。お店ごとに（取っておける量 ÷ 片道の日数）
  const sp = haulers.length ? haulers.reduce((a, st) => a + speed(st, 'transport', s), 0) / haulers.length : 1;
  const pipe = load.shops.reduce((a, x) => {
    const ow = Math.max(0.5, oneWay(s, x.b).days / sp);
    return a + ((x.q + (has(s, 'timetable') ? displayPerDayOf(s, x.b) * ow : 0)) * DAYS) / ow;
  }, 0);
  const haul = { perMonth: R(Math.min(carts, pipe)), stopped: !haulers.length };
  // 販売：需要から取れる数（salesPotential）と、お店の処理力（品出しの数 × 30 日。displayCap）の小さいほう。どちらも店員の稼働率込み
  const demand = noSell ? 0 : salesPotential(s);
  const capacity = noSell ? 0 : displayCap(s);
  const sell: StageCap = {
    perMonth: R(Math.min(demand, capacity)),
    stopped: !myShops(s).some((b) => s.shops[b.uid].shelves.some((x) => x) && (s.shops[b.uid].staff != null || s.shops[b.uid].part > 0)),
    why: capacity < demand ? 'capacity' : 'demand',
    demand: R(demand),
    capacity: R(capacity),
  };
  return { buy, craft, haul, sell };
}

/** いちばん細いところ（止まっている段があればそこ） */
export function bottleneck(c: Record<Stage, StageCap>): Stage {
  const order: Stage[] = ['buy', 'craft', 'haul', 'sell'];
  const stopped = order.find((k) => c[k].stopped);
  if (stopped) return stopped;
  // 同じ細さなら、調達より製造・販売を指す（調達係がいると調達の棒は製造と同じ長さになるので、調達が「詰まり」と出がち）
  const pref: Stage[] = ['craft', 'sell', 'haul', 'buy'];
  const min = Math.min(...order.map((k) => c[k].perMonth));
  return pref.find((k) => c[k].perMonth <= min + 1e-9) ?? order[0];
}

/**
 * 詰まりの段：月次報告と SCM ダッシュボードで共通の判定（docs/ISLAND_PHASE1.md「詰まりの判定」）。
 * いつも「ひと月に流せる数」（stageCaps）のいちばん少ない段。その月の実績（買った・作った数）では決めない
 * （手持ちの素材で足りて買わなかった月は「調達 0」になるが、詰まりではないため）
 */
export const jamOf = (s: P1State): Stage => bottleneck(stageCaps(s));

/**
 * 次に細くなる段：いまの詰まりの段だけ「ひと月に流せる数」を +30% にして（止まっている段は動かしたとして）、もう一度詰まりを見る。
 * same：30% 太くしても、まだ同じ段が詰まり。docs/ISLAND_PHASE1.md「次に細くなる段」
 */
export function nextJam(s: P1State, caps = stageCaps(s)): { bn: Stage; next: Stage; same: boolean; n: number } {
  const bn = bottleneck(caps);
  const c2 = { ...caps, [bn]: { ...caps[bn] } } as Record<Stage, StageCap>;
  const others = (['buy', 'craft', 'haul', 'sell'] as Stage[]).filter((k) => k !== bn);
  if (c2[bn].stopped) {
    c2[bn].stopped = false;
    c2[bn].perMonth = Infinity;
  } else c2[bn].perMonth = caps[bn].perMonth * 1.3;
  const next = bottleneck(c2);
  void others;
  return { bn, next, same: next === bn, n: Math.round(next === bn ? caps[bn].perMonth : caps[next].perMonth) };
}

/** 段ごとの打ち手（④ 販売は sellWhatIf。ほかの段は、設備投資の次の段・取れるスキル・人を置く） */
export type StageMove =
  | { kind: 'invest'; id: string; uid: number; cost: number }
  | { kind: 'skill'; id: string; cost: number; rp?: number }
  | { kind: 'level'; id: string; lv: number; cost: number }
  | { kind: 'person'; task: Task; hero: number; hire: boolean; replace: number | null; target: number | string | null; cost: number }
  | { kind: 'build'; id: string; cost: number }
  | { kind: 'sell'; w: WhatIf };
export interface StageIf {
  stage: Stage;
  move: StageMove;
  /** その段の数字（ひと月に流せる数）の増え方 */
  units: number;
  /** 効き目が +1 個以上 */
  ok: boolean;
}

/** 打ち手の見込み用の写し（元の状態は書き換えない。帳簿・ランドの写しなど重いものは共有するが、触らない） */
function scratch(s: P1State): P1State {
  return {
    ...s,
    skills: [...s.skills],
    skillLv: { ...(s.skillLv ?? {}) },
    routes: [...s.routes],
    buildings: s.buildings.map((b) => ({ ...b, inv: b.inv ? { ...b.inv } : undefined })),
    slots: s.slots.map((x) => ({ ...x })),
    staff: s.staff.map((x) => ({ ...x, stats: { ...x.stats } })),
    shops: Object.fromEntries(Object.entries(s.shops).map(([k, sh]) => [k, { ...sh, shelves: [...sh.shelves] }])),
    hirePool: [...s.hirePool],
    proc: { ...s.proc, qty: { ...s.proc.qty }, items: [...s.proc.items], extra: [...s.proc.extra], carry: { ...s.proc.carry } },
    flags: { ...s.flags },
  };
}

/** その仕事に置ける人：手の空いている人（いちばん適性の高い人）、いなければ雇える候補のいちばん適性の高い人 */
function bestFor(s: P1State, task: Task, min = 0): { hero: number; hire: boolean; apt: number } | null {
  const idle = s.staff.filter((x) => x.task == null).map((x) => ({ hero: x.hero, hire: false, apt: aptOf(s, x, task) }));
  const pool = has(s, 'hire') ? s.hirePool.map((id) => ({ hero: id, hire: true, apt: aptitude(heroStats(id), task) + aptBonus(s, task) })) : [];
  const all = [...idle, ...pool].filter((x) => x.apt > min).sort((a, b) => b.apt - a.apt || Number(a.hire) - Number(b.hire));
  return all[0] ?? null;
}
function putPerson(c: P1State, p: { hero: number; hire: boolean }, task: Task, target: number | string | null, replace: number | null) {
  if (p.hire) hire(c, p.hero);
  if (replace != null) {
    const old = staffOf(c, replace);
    if (old) unassign(c, old);
  }
  assign(c, p.hero, task, target);
  if (task === 'craft' && typeof target === 'number') {
    const sl = c.slots[target];
    sl.sku ??= c.slots.find((x) => x.sku)?.sku ?? null;
    sl.repeat = true;
  }
}

/**
 * 段ごとの打ち手の見込み（効き目の大きい順）：設備投資の次の段・取れるスキル・人を置く を写しに当てて、stageCaps を計算し直す。
 * ④ 販売は sellWhatIf（直前の販売の内訳と同じ）。純粋関数（s は書き換えない）。docs/ISLAND_PHASE1.md「見込みつきの打ち手」
 */
export function whatIf(s: P1State, stage: Stage): StageIf[] {
  if (stage === 'sell') return sellWhatIf(s).map((w) => ({ stage, move: { kind: 'sell', w } as StageMove, units: w.units, ok: w.ok }));
  const base = stageCaps(s, true, true)[stage];
  const b0 = base.stopped ? 0 : base.perMonth;
  const out: StageIf[] = [];
  const tryMove = (move: StageMove, apply: (c: P1State) => void) => {
    const c = scratch(s);
    apply(c);
    const a = stageCaps(c, true, true)[stage];
    const units = (a.stopped ? 0 : a.perMonth) - b0;
    if (units > 0.05) out.push({ stage, move, units, ok: units >= 1 });
  };
  // 設備投資：その段に効く建物ごとに、段がいちばん低いものの次の段（作業台は、増えた台に人を置く）
  for (const x of Object.values(INVEST)) {
    if (x.id === 'shelves') continue;
    const bs = (x.kind === 'workshop' ? [myWorkshop(s)] : x.kind === 'shop' ? myShops(s) : myWarehouses(s)).filter((b): b is PBuilding => !!b && investCost(b, x.id) != null);
    const b = bs.sort((p, q) => invLv(p, x.id) - invLv(q, x.id))[0];
    if (!b) continue;
    tryMove({ kind: 'invest', id: x.id, uid: b.uid, cost: investCost(b, x.id)! }, (c) => {
      const cb = c.buildings.find((y) => y.uid === b.uid)!;
      cb.inv = { ...cb.inv, [x.id]: invLv(cb, x.id) + 1 };
      if (x.kind === 'workshop') syncSlots(c);
      if (x.id === 'bench') {
        const p = bestFor(c, 'craft');
        if (p) putPerson(c, p, 'craft', c.slots.length - 1, null);
      }
    });
  }
  // 建物：倉庫（置き場所）。置く場所は問わない（工房の物置と同じに数える）
  if (myWorkshop(s) && canBuild(s, 'warehouse') !== 'locked')
    tryMove({ kind: 'build', id: 'warehouse', cost: P1B.warehouse.cost }, (c) => {
      c.buildings.push({ uid: -1, id: 'warehouse', i: -1, j: -1, dir: 'rd', left: 0, owner: 'me' });
    });
  // スキル：いま取れるもの（資金・研究ポイントだけが足りないものも。技・大きめの研究パネル・外周の条件が足りないものは除く）
  for (const k of SKILLS) {
    if (k.train || k.big) continue;
    const e = skillLock(s, k);
    if (e !== null && e !== 'money' && e !== 'rp') continue;
    const research = isResearch(k);
    tryMove({ kind: 'skill', id: k.id, cost: research ? 0 : k.cost, rp: research ? rpCost(k) : undefined }, (c) => gainSkill(c, k.id));
  }
  // レベル上げ：いま上げられるもの（お金パネル。資金だけが足りないものも）
  for (const k of SKILLS) {
    const e = levelLock(s, k);
    if (e !== null && e !== 'money') continue;
    const lv = lvOf(s, k.id) + 1;
    tryMove({ kind: 'level', id: k.id, lv, cost: levelCost(k, lv) }, (c) => setLevel(c, k.id, lv));
  }
  // 人を置く：空いた作業台・運搬係をもう 1 人・調達係（いなければ置く、いれば能力の高い人に替える）
  const TASK: Record<Exclude<Stage, 'sell'>, Task> = { buy: 'buy', craft: 'craft', haul: 'transport' };
  const task = TASK[stage];
  if (stage === 'craft') {
    const free = s.slots.findIndex((sl) => sl.worker == null);
    const p = bestFor(s, 'craft');
    if (free >= 0 && p) tryMove({ kind: 'person', task, hero: p.hero, hire: p.hire, replace: null, target: free, cost: p.hire ? wageOf(p.hero) : 0 }, (c) => putPerson(c, p, 'craft', free, null));
    // いちばん遅い職人を、もっと得意な人に替える
    const weak = s.slots
      .map((sl, k) => ({ k, st: sl.worker != null ? staffOf(s, sl.worker) : null }))
      .filter((x) => x.st && x.st.task === 'craft')
      .sort((a, b) => aptOf(s, a.st!, 'craft') - aptOf(s, b.st!, 'craft'))[0];
    const better = weak ? bestFor(s, 'craft', aptOf(s, weak.st!, 'craft')) : null;
    if (weak && better) tryMove({ kind: 'person', task, hero: better.hero, hire: better.hire, replace: weak.st!.hero, target: weak.k, cost: better.hire ? wageOf(better.hero) : 0 }, (c) => putPerson(c, better, 'craft', weak.k, weak.st!.hero));
  } else if (stage === 'haul') {
    const p = bestFor(s, 'transport');
    if (p && myShops(s).length) tryMove({ kind: 'person', task, hero: p.hero, hire: p.hire, replace: null, target: null, cost: p.hire ? wageOf(p.hero) : 0 }, (c) => putPerson(c, p, 'transport', null, null));
  } else {
    const cur = s.staff.find((x) => x.task === 'buy') ?? null;
    const p = bestFor(s, 'buy', cur ? aptOf(s, cur, 'buy') : 0);
    if (p) tryMove({ kind: 'person', task, hero: p.hero, hire: p.hire, replace: cur?.hero ?? null, target: null, cost: p.hire ? wageOf(p.hero) : 0 }, (c) => putPerson(c, p, 'buy', null, cur?.hero ?? null));
  }
  return out.sort((a, b) => b.units - a.units);
}

/** いまの資金・研究ポイントで取れる開放とレベル上げ（技の修行・チュートリアルの外の判断はしない） */
export function affordableSkills(s: P1State): { id: string; kind: 'skill' | 'level' }[] {
  const out: { id: string; kind: 'skill' | 'level' }[] = [];
  for (const k of SKILLS) {
    if (skillLock(s, k) === null) out.push({ id: k.id, kind: 'skill' });
    else if (levelLock(s, k) === null) out.push({ id: k.id, kind: 'level' });
  }
  return out;
}
/**
 * いま取れる開放・レベル上げのうち、見込み（SCM の whatIf と同じ：段の数字の増え方、④ 販売は sellNow）がいちばん大きいもの。
 * 詰まりの段の増え方を先に、同じなら 4 段の合計で比べる。どれも数字に出なければ、いちばん安いもの
 */
export function bestSkillMove(s: P1State): { id: string; kind: 'skill' | 'level'; units: number } | null {
  // 大きめの研究パネル（以前の ✨）は大事に使うので、ほかに取れるものがあればそちらから
  const all = affordableSkills(s).filter((x) => !SKILL[x.id].train);
  const small = all.filter((x) => !SKILL[x.id].big);
  const list = small.length ? small : all;
  if (!list.length) return null;
  const jam = myShops(s).length ? jamOf(s) : null;
  const caps0 = stageCaps(s, true, true);
  const v0 = (c: typeof caps0, k: Stage) => (c[k].stopped ? 0 : c[k].perMonth);
  let best: { id: string; kind: 'skill' | 'level'; units: number; score: number } | null = null;
  for (const x of list) {
    const c = scratch(s);
    if (x.kind === 'skill') gainSkill(c, x.id);
    else setLevel(c, x.id, lvOf(c, x.id) + 1);
    const caps = stageCaps(c, true, true);
    const gain = (['buy', 'craft', 'haul', 'sell'] as Stage[]).map((k) => Math.max(0, v0(caps, k) - v0(caps0, k)));
    const units = jam ? gain[['buy', 'craft', 'haul', 'sell'].indexOf(jam)] : Math.max(...gain);
    const score = units * 1000 + gain.reduce((a, b) => a + b, 0);
    if (!best || score > best.score) best = { ...x, units, score };
  }
  if (best && best.score <= 0.05) {
    const cost = (x: { id: string; kind: 'skill' | 'level' }) => (x.kind === 'skill' ? (isResearch(SKILL[x.id]) ? rpCost(SKILL[x.id]) * 100 : SKILL[x.id].cost) : nextLevelCost(s, SKILL[x.id]));
    const cheap = [...list].sort((a, b) => cost(a) - cost(b))[0];
    return { ...cheap, units: 0 };
  }
  return best ? { id: best.id, kind: best.kind, units: best.units } : null;
}

/** 素材のルートが使えるか：会社で開いたルート、またはいまのセクタの特産で最初から開いているルート */
export function hasRoute(s: Pick<P1State, 'routes' | 'sector'>, m: Mat): boolean {
  if (s.routes.includes(m)) return true;
  const prof = sectorProfile(s);
  return !!prof?.routesOpen || !!prof?.routes?.includes(m);
}

/** 手元の素材で、作業台があと何日動けるか（作業台が動いていなければ null） */
export function matDays(s: P1State): number | null {
  const plan = craftPlan(s);
  let d = Infinity;
  for (const [m, q] of Object.entries(plan.need)) if ((q ?? 0) > 0) d = Math.min(d, ((s.mats[m as Mat] ?? 0) / (q ?? 1)) * DAYS);
  return Number.isFinite(d) ? d : null;
}

// ---------------------------------------------------------------- 地層の発掘と研究ポイント（docs/ISLAND_PHASE1.md「地層の発掘と研究ポイント」）

/** 壁に埋まっているもの：エクステ（topic＝お題）・素材・石板 */
export type DigItem = { kind: 'ext'; id: number; topic?: boolean } | { kind: 'mat'; mat: Mat; n: number } | { kind: 'tablet'; id: string };
/** 壁に埋まっているもの 1 つ：層 layer（0 が手前）の、左上のマス (x, y) から size（横 × 縦）の範囲。Epic 以上のエクステは 2 × 2 */
export interface DigFind {
  item: DigItem;
  x: number;
  y: number;
  size: [number, number];
  layer: number;
}
export interface DigCell {
  /** 層ごとの硬さ（手前 → 奥。打つ回数。1 打の強さ 1 のとき） */
  hard: number[];
}
/** 荒れ地 1 か所の正面の壁（発掘場）。叩くと手前の層から 1 枚ずつはがれる */
export interface DigLayout {
  sector: string;
  tier: DigTier;
  /** 荒れ地の番号（0〜3。wasteSpots の順） */
  site: number;
  w: number;
  h: number;
  /** 奥行きの層の数（Common 3・Uncommon 4） */
  depth: number;
  cells: DigCell[];
  /** 埋まっているもの */
  finds: DigFind[];
  /** マス k の層 n に埋まっているもの（finds の番号。無ければ -1）。添え字は k × depth + n */
  at: number[];
  /** この荒れ地に眠っているお題（エクステの id。無ければ null。1 か所に 1 つまで） */
  topic: number | null;
  /** ダンジョンの壁（入るたびに作り直す。site は DUNGEON） */
  dungeon?: boolean;
}
/** 荒れ地 1 か所の進み具合 */
export interface DigSiteState {
  /** マスごとの、はがした枚数（0〜層の数。層の数なら、いちばん奥まで掘りきったマス） */
  depth: number[];
  /** マスごとの、いまの層の残りの硬さ（掘りきったマスは 0。2 × 2 のものの層を叩いて 0 にして、ほかのマスを待っているあいだも 0） */
  hp: number[];
  /** 国の発掘許可をもらった（一度もらえば何度でも掘れる） */
  permit: boolean;
  /** 掘りきった（全部のマスを、いちばん奥まではがした） */
  done: boolean;
  /** 復興した（掘りきって、建物を建てられる土地になった。家 +homes・需要も同じ割合で上がった）。ダンジョンの入り口になった荒れ地は復興しない */
  revived?: boolean;
  /** 復興で増えた家の数 */
  homes?: number;
  /** 復興で通した小道（道路にしたマス。建物の入口を向けられる） */
  path?: [number, number][];
}
/** ダンジョン（セクタで最後に掘りきった荒れ地の底。入るたびに壁を作り直す）：入り口の荒れ地・入った回数・最深記録（はがした層の数）・いまの壁の進み・見つけたエクステ */
export interface DungeonState {
  site: number;
  runs: number;
  best: number;
  st: DigSiteState | null;
  found: number[];
  /** 最後の作業でいちばん深くはがした層（作業のあとの発掘画面の帯） */
  last?: number;
}
/** このセクタの発掘場（荒れ地 4 か所。セクタごと。SECTOR_KEYS の dig） */
export interface DigState {
  sector: string;
  sites: DigSiteState[];
  /** いま掘っている（最後に掘った）荒れ地 */
  cur: number;
  /** 掘り出したお題（エクステの id） */
  topics: number[];
  /** 発掘隊の端数 */
  carry: number;
  /** 素材の選り分けの端数 */
  matCarry?: number;
  /** 打った数（会心の判定の種） */
  hits?: number;
  /** 今月：新発見・研究 Lv が上がった数・入った RP（月次報告の「今月の出土品」） */
  month: { found: number; lv: number; rp: number };
  /** 最後に発掘作業をした日（助言「しばらく掘っていない」） */
  last?: number;
  /** ダンジョン（4 か所目を掘りきると見つかる） */
  dungeon?: DungeonState | null;
}
/** 1 回の発掘作業の出土（発掘終了の札・まとめ報告） */
export interface DigGot {
  found: number;
  lv: number;
  rp: number;
  mat: number;
  /** はがした層の枚数（マス × 層） */
  cells: number;
  /** 開いた復刻品のレシピ（商品キー。以前の作業には無い） */
  recipes?: string[];
}
/** 発掘作業（15 秒・現実の秒）。作業のあいだは時間が流れ、月をまたいでも月末ポーズと月次報告の画面は出さない */
export interface DigRun {
  site: number;
  /** 残り・長さ（ミリ秒） */
  left: number;
  total: number;
  /** 作業を始めたときの報告の数（これより後の報告が、作業のあいだに締めた月） */
  rep0: number;
  got: DigGot;
  /** ダンジョン：この作業でいちばん深くはがした層の数・作業の前の最深記録 */
  deep?: number;
  best0?: number;
  /** この作業で荒れ地を掘りきって、復興した（荒れ地の番号と増えた家）／ダンジョンの入り口が見つかった（荒れ地の番号） */
  revived?: { site: number; homes: number };
  found?: number;
}
/** 1 打の結果 */
export interface DigHit {
  x: number;
  y: number;
  /** 叩いた層（0 が手前） */
  layer: number;
  /** このマスの層が 1 枚はがれた */
  broke: boolean;
  /** 打ったあとの、はがした枚数 */
  depth: number;
  /** 残りの硬さ（はがれたら、次の層の硬さ） */
  left: number;
  /** はがれて出てきたもの */
  item: DigItem | null;
  /** 2 × 2 のものの層を 0 にしたが、ほかのマスがまだ（4 マスとも掘ると取れる） */
  wait?: boolean;
  /** 大きいもの（2 × 2）が取れた：その範囲（まとめて次の層へ） */
  span?: { x: number; y: number; w: number; h: number };
  /** 入った研究ポイント */
  rp: number;
  /** はじめて掘ったエクステ */
  first?: boolean;
  /** 研究レベルが上がった（上がったあとのレベル） */
  lv?: number;
  /** この 1 打で、荒れ地を掘りきった */
  done?: boolean;
  /** 掘りきって復興した（増えた家の数）／ダンジョンの入り口が見つかった */
  revive?: number;
  dungeon?: boolean;
  /** 研究 Lv3 になって、復刻品のレシピが開いた（商品キー） */
  recipe?: string;
  /** 会心（2 倍） */
  crit?: boolean;
  /** 素材のマス：実際に入った数（素材の選り分けで増える。置き場所に入るぶんだけ） */
  mat?: number;
  /** 置き場所がいっぱいで、素材を置けなかった */
  matFull?: boolean;
  /** 広く掘る：隣のマスへの力で打ったマス */
  splash?: boolean;
  /** 広く掘る：同じ 1 打で隣のマスにも当たった結果 */
  extra?: DigHit[];
}
/** 打てない理由。dug：いちばん奥まで掘った／deep：深い層の許可が要る（スキル → 発掘）／wait：2 × 2 のものの層を叩ききって、ほかのマスを待っている／no-drill：掘削ドリルが無い */
export type DigErr = 'no-site' | 'no-run' | 'out' | 'dug' | 'deep' | 'wait' | 'no-blast' | 'no-drill' | 'money';

/** 文字列の種（セクタの id → 発掘場の配置の種。同じセクタは何度遊んでも同じ配置） */
function strSeed(x: string): number {
  let h = 2166136261;
  for (let i = 0; i < x.length; i++) h = Math.imul(h ^ x.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** 発掘場のあるセクタ（Common・Uncommon で出土品の決まったセクタ）のランク。無ければ null */
function digTierOf(sector: string): DigTier | null {
  const tier = SECTORS.find((x) => x.id === sector)?.tier;
  return DIG_SITES[sector] && (tier === 'C' || tier === 'U') ? tier : null;
}

// ---------------------------------------------------------------- 荒れ地（未開拓エリア）

const spotCache = new Map<string, [number, number][]>();
/**
 * 荒れ地 4 か所の左上のマス（2 × 2。発掘場の無いセクタは []）。
 * 区画（道路のあいだ。地図の端の区画は除く）の内側の 2 × 2 ＝ 道路に面していないマスなので、町の 1 マスの建物（住宅・お店・交番…）も
 * チュートリアルで建てる場所（工房・よろず屋・倉庫。道路に面した 1 マス）も、ここには来ない。ゲームの種に寄らず、セクタの id で決める。
 * Common（16 マス）は内側の区画がちょうど 4 つ（4 つの象限に 1 つずつ）。Uncommon（21 マス）は 9 つから、角の 4 つかひし形の 4 つ。
 */
export function wasteSpots(sector: string): [number, number][] {
  const hit = spotCache.get(sector);
  if (hit) return hit;
  const tier = digTierOf(sector);
  let out: [number, number][] = [];
  if (tier) {
    const n = tier === 'C' ? N : TIERS[tier].n;
    const roads = roadLines(n);
    const starts: number[] = [];
    for (let k = 0; k + 1 < roads.length; k++) {
      const a = roads[k] + 1;
      const len = roads[k + 1] - 1 - a + 1;
      if (len >= WASTE.size + 2) starts.push(a + Math.floor((len - WASTE.size) / 2));
    }
    const all = starts.flatMap((j) => starts.map((i): [number, number] => [i, j]));
    if (all.length <= WASTE.count) out = all;
    else {
      const lo = starts[0];
      const hi = starts[starts.length - 1];
      const mid = starts[Math.floor((starts.length - 1) / 2)];
      const corners: [number, number][] = [[lo, lo], [hi, lo], [lo, hi], [hi, hi]];
      const diamond: [number, number][] = [[mid, lo], [hi, mid], [mid, hi], [lo, mid]];
      out = rng(strSeed(`waste:${sector}`))() < 0.5 ? corners : diamond;
    }
  }
  spotCache.set(sector, out);
  return out;
}
/** 荒れ地の 4 マス */
export function wasteCells(sector: string, k: number): [number, number][] {
  const sp = wasteSpots(sector)[k];
  if (!sp) return [];
  const out: [number, number][] = [];
  for (let dj = 0; dj < WASTE.size; dj++) for (let di = 0; di < WASTE.size; di++) out.push([sp[0] + di, sp[1] + dj]);
  return out;
}
/** マス (i, j) の荒れ地の番号（荒れ地でなければ -1） */
export function wasteAt(s: Pick<P1State, 'sector'>, i: number, j: number): number {
  const sp = wasteSpots(s.sector ?? 'c1');
  for (let k = 0; k < sp.length; k++) if (i >= sp[k][0] && j >= sp[k][1] && i < sp[k][0] + WASTE.size && j < sp[k][1] + WASTE.size) return k;
  return -1;
}
export const isWaste = (s: Pick<P1State, 'sector'>, i: number, j: number) => wasteAt(s, i, j) >= 0;

/** 画面で見た 8 つの向き（東から時計回り）の荒れ地の名前 */
const WASTE_NAMES = () => [
  t('東の荒れ地', 'East wasteland'),
  t('南東の荒れ地', 'Southeast wasteland'),
  t('南の荒れ地', 'South wasteland'),
  t('南西の荒れ地', 'Southwest wasteland'),
  t('西の荒れ地', 'West wasteland'),
  t('北西の荒れ地', 'Northwest wasteland'),
  t('北の荒れ地', 'North wasteland'),
  t('北東の荒れ地', 'Northeast wasteland'),
];
/** 荒れ地の名前（画面で見た向き：「北の荒れ地」「南東の荒れ地」…） */
export function wasteName(sector: string, k: number): string {
  const sp = wasteSpots(sector)[k];
  const tier = digTierOf(sector);
  if (!sp || !tier) return t(`荒れ地 ${k + 1}`, `Wasteland ${k + 1}`);
  const n = tier === 'C' ? N : TIERS[tier].n;
  const c = (n - 1) / 2;
  const ci = sp[0] + (WASTE.size - 1) / 2 - c;
  const cj = sp[1] + (WASTE.size - 1) / 2 - c;
  const a = Math.atan2((ci + cj) * 55, (ci - cj) * 100);
  return WASTE_NAMES()[((Math.round(a / (Math.PI / 4)) % 8) + 8) % 8];
}

// ---------------------------------------------------------------- 荒れ地の正面の壁（発掘場）

/** エクステのランク（カタログの全シリーズから。見つからなければ Common） */
let extRar: Map<number, string> | null = null;
export function extRarity(id: number): string {
  extRar ??= new Map(allSeries.flatMap((x) => x.items.map((e) => [e.id, e.rarity] as const)));
  return extRar.get(id) ?? 'Common';
}
/** エクステのランク（C・U・R・E・L。カタログのレアリティから） */
const RARITY_TIER: Record<string, Tier> = { Common: 'C', Uncommon: 'U', Rare: 'R', Epic: 'E', Legendary: 'L' };
export const extRank = (id: number): Tier => RARITY_TIER[extRarity(id)] ?? 'C';
/** 埋まっているものの大きさ（横 × 縦）：Epic 以上のエクステは 2 × 2（4 マス）、ほかは 1 × 1 */
export function findSize(it: DigItem): [number, number] {
  if (it.kind !== 'ext') return [1, 1];
  const r = extRarity(it.id);
  return r === 'Epic' || r === 'Legendary' ? [2, 2] : [1, 1];
}
/** 埋まっているものの範囲のマス（k） */
export const findCells = (L: Pick<DigLayout, 'w'>, f: Pick<DigFind, 'x' | 'y' | 'size'>): number[] => {
  const out: number[] = [];
  for (let dy = 0; dy < f.size[1]; dy++) for (let dx = 0; dx < f.size[0]; dx++) out.push((f.y + dy) * L.w + f.x + dx);
  return out;
};
/**
 * 壁の層 layer の (x, y) に、大きさ findSize(item) で埋める（範囲が壁からはみ出すなら false）。範囲の同じ層にあったものは取り除く。
 * 配置（digLayouts）と、4 段目のダンジョンの奥の Epic（2 × 2）・テストで使う
 */
export function placeFind(L: DigLayout, item: DigItem, x: number, y: number, layer: number): DigFind | null {
  const size = findSize(item);
  if (x < 0 || y < 0 || x + size[0] > L.w || y + size[1] > L.h || layer < 0 || layer >= L.depth) return null;
  const f: DigFind = { item, x, y, size, layer };
  const cells = findCells(L, f);
  const gone = new Set(cells.map((k) => L.at[k * L.depth + layer]).filter((i) => i >= 0));
  if (gone.size) {
    const keep = L.finds.filter((_, i) => !gone.has(i));
    L.finds.length = 0;
    L.finds.push(...keep);
  }
  L.finds.push(f);
  // 番号を付け直す
  L.at.fill(-1);
  L.finds.forEach((g, i) => {
    for (const k of findCells(L, g)) L.at[k * L.depth + g.layer] = i;
  });
  return f;
}

const layoutCache = new Map<string, DigLayout[]>();
/**
 * セクタの荒れ地 4 か所の正面の壁（Common・Uncommon で出土品の決まったセクタだけ。無ければ []）。seed から決めるので、いつも同じ。
 * 横 w × 縦 h のマス目、各マスに奥行きの層（手前 → 奥。奥ほど硬い）。埋まっているものは、ある層のある範囲（1 × 1。Epic 以上は 2 × 2）。
 * お題（Common 3・Uncommon 4）は 4 か所に散らばる（1 か所に 1 つまで。お題 k は k 番目の層）。石板は決まった層に（お題と別のマス）。
 * 1 マスの 1 つの層には 1 つまで（重ならない）。ほかはマス × 層ごとに DIG_ODDS の割合でエクステ・素材
 */
export function digLayouts(sector: string): DigLayout[] {
  const hit = layoutCache.get(sector);
  if (hit) return hit;
  const def = SECTORS.find((x) => x.id === sector);
  const site = DIG_SITES[sector];
  const tier = digTierOf(sector);
  if (!def || !site || !tier) {
    layoutCache.set(sector, []);
    return [];
  }
  const D = DIG[tier];
  const odds = DIG_ODDS[tier];
  const r = rng(strSeed(`dig:${sector}`));
  const pick = <T>(xs: T[]) => xs[Math.floor(r() * xs.length)];
  const shuffle = <T>(xs: T[]) => {
    const a = [...xs];
    for (let k = a.length - 1; k > 0; k--) {
      const m = Math.floor(r() * (k + 1));
      [a[k], a[m]] = [a[m], a[k]];
    }
    return a;
  };
  // 素材：そのセクタの特産（Common は安い素材、Uncommon は最初から開いているルート）を 3 倍出やすく
  const prof = def.profile;
  const special = new Set<Mat>([...(prof.cheap ?? []), ...(tier === 'U' ? (prof.routes ?? []) : [])]);
  const matBag = D.mats.flatMap((m) => (special.has(m) ? [m, m, m] : [m]));
  const n = wasteSpots(sector).length;
  const depth = D.layers.length;
  // どの荒れ地にどのお題があるか（1 か所に 1 つまで）と、石板を置く荒れ地
  const order = shuffle(Array.from({ length: n }, (_, k) => k));
  const topicAt = new Map<number, number>();
  site.topics.forEach((_, k) => topicAt.set(order[k % n], k));
  const tabs = TABLETS.filter((x) => x.sector === sector);
  const tabSites = shuffle(Array.from({ length: n }, (_, k) => k));
  const out: DigLayout[] = [];
  for (let sk = 0; sk < n; sk++) {
    const cells: DigCell[] = [];
    for (let k = 0; k < D.w * D.h; k++) cells.push({ hard: D.layers.map((L) => L.hard[0] + Math.floor(r() * (L.hard[1] - L.hard[0] + 1))) });
    const tk = topicAt.get(sk);
    const L: DigLayout = { sector, tier, site: sk, w: D.w, h: D.h, depth, cells, finds: [], at: new Array<number>(D.w * D.h * depth).fill(-1), topic: tk != null ? site.topics[tk] : null };
    // 空いている所（その層で、範囲のどのマスにもまだ何も無い）にランダムに
    const putSomewhere = (item: DigItem, layer: number) => {
      const [sw, sh] = findSize(item);
      for (let guard = 0; guard < 200; guard++) {
        const x = Math.floor(r() * (D.w - sw + 1));
        const y = Math.floor(r() * (D.h - sh + 1));
        if (findCells(L, { x, y, size: [sw, sh] }).every((k) => L.at[k * depth + layer] < 0)) return placeFind(L, item, x, y, layer);
      }
      return null;
    };
    if (tk != null) putSomewhere({ kind: 'ext', id: site.topics[tk], topic: true }, tk);
    TABLET_LAYERS[tier].forEach((layer, ti) => {
      if (tabs[ti] && tabSites[ti % n] === sk) putSomewhere({ kind: 'tablet', id: tabs[ti].id }, layer);
    });
    // ほか：マス × 層ごとに
    for (let layer = 0; layer < depth; layer++)
      for (let k = 0; k < D.w * D.h; k++) {
        const roll = r();
        const item: DigItem | null = roll < odds.ext ? { kind: 'ext', id: pick(site.finds) } : roll < odds.ext + odds.mat ? { kind: 'mat', mat: pick(matBag), n: D.mat } : null;
        if (!item || L.at[k * depth + layer] >= 0) continue;
        const f: DigFind = { item, x: k % D.w, y: Math.floor(k / D.w), size: findSize(item), layer };
        if (findCells(L, f).every((c) => c < D.w * D.h && L.at[c * depth + layer] < 0) && f.x + f.size[0] <= D.w) placeFind(L, item, f.x, f.y, layer);
      }
    out.push(L);
  }
  layoutCache.set(sector, out);
  return out;
}
/** 荒れ地 k の壁（無ければ null） */
export const digLayout = (sector: string, k = 0): DigLayout | null => digLayouts(sector)[k] ?? null;

// ---------------------------------------------------------------- ダンジョン（発掘 v2 の 4 段目。docs/ISLAND_PHASE1.md「4. 復興・ダンジョン・展示館」）

/** ダンジョンの「荒れ地の番号」（dig.cur・digRun.site・DigLayout.site。荒れ地 0〜3 とは別） */
export const DUNGEON = 4;
const TIER_UP: Tier[] = ['C', 'U', 'R', 'E', 'L'];
/** ランクの n 段上（Legendary で止まる） */
const tierUp = (t0: Tier, n: number): Tier => TIER_UP[Math.min(TIER_UP.length - 1, TIER_UP.indexOf(t0) + n)];
const dungeonCache = new Map<string, DigLayout>();
/**
 * ダンジョンの壁（横 7 × 縦 9 × 奥行き 6 層。入るたびに作り直す：種はセクタの id と入った回数）。
 * 出るものは、そのセクタの出土品（お題以外の finds。お題・石板は出さない）と素材。奥の層ほど、上のランクのエクステ（DUNGEON_FINDS）が混ざる
 * （層ごとの確率は DIG_BALANCE.dungeon.rarity）。Epic・Legendary は 2 × 2
 */
export function dungeonLayout(sector: string, runs: number): DigLayout | null {
  const key = `${sector}:${runs}`;
  const hit = dungeonCache.get(key);
  if (hit) return hit;
  const def = SECTORS.find((x) => x.id === sector);
  const site = DIG_SITES[sector];
  const tier = digTierOf(sector);
  if (!def || !site || !tier) return null;
  const D = DUNGEON_DIG[tier];
  const B = DIG_BALANCE.dungeon;
  const r = rng(strSeed(`dungeon:${sector}:${runs}`));
  const pick = <T>(xs: T[]) => xs[Math.floor(r() * xs.length)];
  const prof = def.profile;
  const special = new Set<Mat>([...(prof.cheap ?? []), ...(tier === 'U' ? (prof.routes ?? []) : [])]);
  const matBag = D.mats.flatMap((m) => (special.has(m) ? [m, m, m] : [m]));
  const depth = D.layers.length;
  const cells: DigCell[] = [];
  for (let k = 0; k < D.w * D.h; k++) cells.push({ hard: D.layers.map((x) => x.hard[0] + Math.floor(r() * (x.hard[1] - x.hard[0] + 1))) });
  const L: DigLayout = { sector, tier, site: DUNGEON, w: D.w, h: D.h, depth, cells, finds: [], at: new Array<number>(D.w * D.h * depth).fill(-1), topic: null, dungeon: true };
  const pools = DUNGEON_FINDS[sector] ?? {};
  for (let layer = 0; layer < depth; layer++) {
    const odds = B.rarity[tier][Math.min(B.rarity[tier].length - 1, layer)];
    for (let k = 0; k < D.w * D.h; k++) {
      const roll = r();
      let item: DigItem | null = null;
      if (roll < B.odds.ext) {
        // エクステのランク：この層の確率で、そのセクタのランク／1 つ上／2 つ上／3 つ上
        const u = r();
        let up = 0;
        let acc = 0;
        for (let n = 0; n < odds.length; n++) {
          acc += odds[n];
          if (u < acc) {
            up = n;
            break;
          }
        }
        const pool = up > 0 ? (pools[tierUp(tier, up)] ?? []) : site.finds;
        item = { kind: 'ext', id: pick(pool.length ? pool : site.finds) };
      } else if (roll < B.odds.ext + B.odds.mat) item = { kind: 'mat', mat: pick(matBag), n: D.mat };
      if (!item || L.at[k * depth + layer] >= 0) continue;
      const f: DigFind = { item, x: k % D.w, y: Math.floor(k / D.w), size: findSize(item), layer };
      if (f.x + f.size[0] <= D.w && f.y + f.size[1] <= D.h && findCells(L, f).every((c) => L.at[c * depth + layer] < 0)) placeFind(L, item, f.x, f.y, layer);
    }
  }
  // 古い壁は捨てる（いまの 1 枚と、その前の 1 枚だけ）
  for (const k of [...dungeonCache.keys()]) if (dungeonCache.size >= 4) dungeonCache.delete(k);
  dungeonCache.set(key, L);
  return L;
}
/** 荒れ地 k（DUNGEON ならダンジョン）の壁 */
export function layoutOf(s: Pick<P1State, 'dig'>, k: number): DigLayout | null {
  if (!s.dig) return null;
  if (k === DUNGEON) return s.dig.dungeon ? dungeonLayout(s.dig.sector, s.dig.dungeon.runs) : null;
  return digLayout(s.dig.sector, k);
}
/** 荒れ地 k（DUNGEON ならダンジョンのいまの壁）の進み具合 */
export function siteState(s: Pick<P1State, 'dig'>, k: number): DigSiteState | null {
  if (!s.dig) return null;
  if (k === DUNGEON) return s.dig.dungeon?.st ?? null;
  return s.dig.sites[k] ?? null;
}
/** 壁の層（手前 → 奥。名前・硬さ・色）：荒れ地は DIG、ダンジョンは DUNGEON_DIG */
export const layersOf = (L: Pick<DigLayout, 'tier' | 'dungeon'>) => (L.dungeon ? DUNGEON_DIG[L.tier].layers : DIG[L.tier].layers);
/** 荒れ地（ダンジョン）の名前 */
export function siteName(s: Pick<P1State, 'dig'>, k: number): string {
  if (!s.dig) return '';
  if (k === DUNGEON) return t('ダンジョン', 'Dungeon');
  return wasteName(s.dig.sector, k);
}

/** まだ掘っていない荒れ地 1 か所（どのマスも 0 枚・手前の層の硬さ） */
const freshSite = (L: DigLayout): DigSiteState => ({ depth: L.cells.map(() => 0), hp: L.cells.map((c) => c.hard[0]), permit: false, done: false });
/** 新しい発掘場（荒れ地 4 か所。そのセクタに発掘場が無ければ null）。許可はまだ（1 か所目は申請料なし） */
export function newDig(sector: string): DigState | null {
  const Ls = digLayouts(sector);
  if (!Ls.length) return null;
  return { sector, sites: Ls.map(freshSite), cur: 0, topics: [], carry: 0, month: { found: 0, lv: 0, rp: 0 } };
}
/** いま掘っている荒れ地の壁（ダンジョンならダンジョンのいまの壁） */
export const digSite = (s: Pick<P1State, 'dig'>) => (s.dig ? layoutOf(s, s.dig.cur) : null);
/** いま掘っている荒れ地の進み具合 */
const curSite = (s: Pick<P1State, 'dig'>) => (s.dig ? siteState(s, s.dig.cur) : null);
// ---------------------------------------------------------------- 発掘のスキルツリー（9 本目の枝「発掘」。発掘 v2 の 2 段目）

const DT = DIG_BALANCE.tree;
/** 表の Lv の値（Lv1〜5。未取得は 0） */
const atLv = (xs: number[], lv: number) => (lv <= 0 ? 0 : xs[Math.min(xs.length, lv) - 1]);
/** 発掘の枝を出すランド（Lime だけ。いまのランドはすべて Lime。ほかの国では枝を出さない） */
export const digLand = (_s: Pick<P1State, 'sector'>) => true;
/** 発掘の枝が見えている（Lime・発掘との出会いのあと）。前は枝ごと雲で隠す */
export const digBranchOpen = (s: Pick<P1State, 'sector' | 'flags'>) => digLand(s) && !!s.flags.digMeet;
/** 1 打の強さ：1 ＋ ツルハシの鍛え直し ＋ 重機の貸し出し（Lv1・3・5 で +1 ずつ） */
export const digPower = (s: P1State) => 1 + fxSum(s, 'dig.power');
/** 会心（2 倍）の確率（ツルハシの鍛え直しの Lv2・4） */
export const critChance = (s: P1State) => fxSum(s, 'dig.crit');
/** 1 回の発掘作業の長さ（秒）：15 ＋ 追加申請（+3 秒／Lv）＋ 長期の発掘許可（+6 秒／Lv）。最大 60 秒 */
export const sessionSec = (s: P1State) => Math.min(DT.maxSec, DIG_BALANCE.sessionSec + fxSum(s, 'dig.sec'));
/** 長押しで続けて打つ間隔（ミリ秒）：170 → 手早い掘り方で 150・130・115・100・90 */
export const digRepeatMs = (s: P1State) => DIG_BALANCE.repeatMs - fxSum(s, 'dig.repeat');
/** 掘れる層の数（深い層の許可。はじめは 2 層目まで。古いセーブは掘っていた深さを下限に） */
export const deepLayers = (s: P1State, tier: DigTier) => Math.max(DT.deep[tier][Math.min(5, lvOf(s, 'dig_deep'))], s.digOld?.deep?.[tier] ?? 0);
/**
 * 画面に依存しない値（発掘画面の作り直しでもそのまま使う）：掘ってよい深さの上限（層の数）・ドリル 1 回で奥へはがす層の数・
 * 発破 1 回の広さ（N × N）・見える深さ（段）。断面の描き方は digui.ts だけが知っている
 */
export const digDepthLimit = (s: P1State, tier: DigTier) => deepLayers(s, tier);
/** ダンジョンで掘れる層の数（深い層の許可：Lv1〜3 で 3 層・Lv4 で 5 層・Lv5 で 6 層） */
export const dungeonDepth = (s: Pick<P1State, 'skills' | 'skillLv'>) => DIG_BALANCE.dungeon.deep[Math.min(5, lvOf(s, 'dig_deep'))];
/** その壁で掘れる層の数（荒れ地は深い層の許可・ダンジョンは dungeonDepth） */
export const depthLimit = (s: P1State, L: Pick<DigLayout, 'tier' | 'dungeon'>) => (L.dungeon ? dungeonDepth(s) : deepLayers(s, L.tier));
/** その層を掘ってよい（深い層の許可） */
export const layerOpen = (s: P1State, L: Pick<DigLayout, 'tier' | 'dungeon'>, layer: number) => layer < depthLimit(s, L);
/** 研究 Lv の上限（研究の目利き：はじめは Lv3・Lv1 で 4・Lv2 で 5。古いセーブは上げていた Lv を下限に） */
export const researchCap = (s: Pick<P1State, 'skills' | 'skillLv' | 'digOld'>) => Math.max(DT.cap[Math.min(5, lvOf(s, 'dig_study'))], s.digOld?.cap ?? 0);
/** 深い層ほど研究が進みやすい倍率（研究の目利きの Lv3〜5） */
export const deepMul = (s: P1State) => DT.deepMul[Math.min(5, lvOf(s, 'dig_study'))];
/** 層 layer（0 が表）で見つけたエクステを、研究の数で何個ぶん数えるか：1 ＋ 0.25 × (n − 1) × 倍率 */
export const researchGain = (s: P1State, layer: number) => 1 + 0.25 * layer * deepMul(s);
/** ランタンで見える深さ（段。無ければ 0） */
export const lampRows = (s: P1State) => atLv(DT.lamp, lvOf(s, 'dig_lamp'));
/** 発破の火薬代・大きさ（N × N） */
export const blastCost = (s: P1State) => DT.blastCost[Math.max(0, Math.min(5, lvOf(s, 'dig_blast')) - 1)];
export const blastSize = (s: P1State) => atLv(DT.blastSize, lvOf(s, 'dig_blast')) || 3;
/** 掘削ドリル：1 回で深さ方向に何マス（無ければ 0。いまの断面では「真下」）・燃料代 */
export const drillLen = (s: P1State) => atLv(DT.drill, lvOf(s, 'dig_drill'));
export const DRILL_FUEL = DT.drillFuel;
export const hasDrill = (s: P1State) => lvOf(s, 'dig_drill') > 0;
/** 発掘隊の人数の上限（発掘隊の役所：1 → 2・3・3・4・5） */
export const crewCap = (s: P1State) => DT.office[Math.min(5, lvOf(s, 'dig_office'))];
/** 発掘隊の 1 日に打つ回数の倍率（発掘隊の手際 +20%／Lv） */
export const crewMul = (s: P1State) => 1 + fxSum(s, 'dig.crew');
/** 常駐（自動化）：作業していない日も掘る */
export const hasAuto = (s: P1State) => lvOf(s, 'u_dig_auto') > 0;
/** 常駐の速さ（作業中の何割）：常駐の Lv の表 ×（1 ＋ 段取りの +10%／Lv） */
export const autoRate = (s: P1State) => atLv(DT.auto, lvOf(s, 'u_dig_auto')) * (1 + fxSum(s, 'dig.autoSpeed'));
/** そのマスは、いちばん奥まで掘りきった */
export const isDug = (s: Pick<P1State, 'dig'>, x: number, y: number) => {
  const L = digSite(s);
  return !!L && x >= 0 && y >= 0 && x < L.w && y < L.h && curSite(s)!.depth[y * L.w + x] >= L.depth;
};
/** そのマスの、はがした枚数（＝いまの層の番号。いちばん奥まで掘ったら層の数） */
export const cellDepth = (s: Pick<P1State, 'dig'>, x: number, y: number) => {
  const L = digSite(s);
  return L ? (curSite(s)!.depth[y * L.w + x] ?? 0) : 0;
};
/** マス k の層 layer に埋まっているもの（もう見つけたお題・もう読んだ石板は出ない：見つけ済みのものは、作り直した壁にも置かない） */
function findAt(s: Pick<P1State, 'dig'> & Partial<Pick<P1State, 'tablets'>>, L: DigLayout, k: number, layer: number): DigFind | null {
  // （掘り出した瞬間は、まだ topics・tablets に入っていないので出る）
  const i = L.at[k * L.depth + layer];
  if (i == null || i < 0) return null;
  const f = L.finds[i];
  const it = f.item;
  if (it.kind === 'ext' && it.topic && s.dig?.topics.includes(it.id)) return null;
  if (it.kind === 'tablet' && s.tablets?.includes(it.id)) return null;
  return f;
}
/** いま掘っている荒れ地の、マス (x, y) の層 layer に埋まっているもの（見つけ済みのお題・読んだ石板は null） */
export function findOf(s: P1State, x: number, y: number, layer: number): DigFind | null {
  const L = digSite(s);
  if (!L || x < 0 || y < 0 || x >= L.w || y >= L.h || layer < 0 || layer >= L.depth) return null;
  return findAt(s, L, y * L.w + x, layer);
}

/** 覗き見（ひびの隙間から見える、埋まっているもの） */
export interface PeekView {
  item: DigItem;
  /** 埋まっている層 */
  layer: number;
  /** いまの層から何枚奥か（0：いまの層＝その層をはがせば取れる・1 以上はランタンのときだけ） */
  ahead: number;
  /** 見える割合（0〜1。ひびの隙間から見えるアイコンの面積） */
  frac: number;
  /** 大きいもの（2 × 2）のうち、このマスに見える部分（範囲の左上からのずれ） */
  part: [number, number];
  size: [number, number];
  /** ランタン Lv4〜：遠くのお題（Lv5 は石板も）の気配だけ（金色のにじみ） */
  hint?: boolean;
}
/** ひびの隙間から見え始める深さ（何枚手前から）：ふだんは いまの層だけ（0）・ランタン Lv1・2・3 で 1・2・3 枚手前から */
export const peekAhead = (s: P1State) => lampRows(s);
/**
 * 覗き見の見える割合（純粋な関数）：ahead（何枚手前か）と、いまの層の残りの硬さ（left / hard・1 打の強さ power）。
 * そのものの層（ahead 0）：無傷は 12%（細いひび 1 本。「何かある」程度で形は分からない）→ 叩いて残りが減るほど 40% → 90%（残り 1 打）・
 * 2 × 2 を待っている（0）は 95%／1 枚以上手前（ランタンのときだけ）：うっすら 20%・15%・10%
 */
export function peekFrac(ahead: number, left: number, hard: number, power: number): number {
  if (ahead >= 1) return Math.max(0.1, Math.round((0.25 - 0.05 * ahead) * 100) / 100);
  if (left <= 0) return 0.95;
  if (left >= hard) return 0.12;
  const full = Math.max(1, Math.ceil(hard / power - 1e-9));
  const now = Math.max(1, Math.ceil(left / power - 1e-9));
  // 叩いたあとの段階：1 段目 40% … 残り 1 打 90%
  const m = full - 1;
  const i = Math.max(1, full - now);
  return m <= 1 ? 0.9 : Math.round((0.4 + (0.5 * (i - 1)) / (m - 1)) * 100) / 100;
}
/** ひびの段階（純粋な関数）：いまの層の残りの硬さに合わせて 0（無傷）・1・2・3（あと少し・待っている） */
export function crackOf(left: number, hard: number): 0 | 1 | 2 | 3 {
  if (left >= hard) return 0;
  if (left <= 0) return 3;
  const d = 1 - left / hard;
  return d < 0.34 ? 1 : d < 0.67 ? 2 : 3;
}
/**
 * マス (x, y) の覗き見（無ければ null）：そのマスの、いまの層（ランタンがあれば peekAhead 枚奥まで）に埋まっているもの（いちばん手前の 1 つ）。
 * ランタン Lv4 からは、お題の気配が さらに 2 枚先から（Lv5 は石板も。気配だけ）
 */
export function peekView(s: P1State, x: number, y: number): PeekView | null {
  const L = digSite(s);
  if (!L || x < 0 || y < 0 || x >= L.w || y >= L.h) return null;
  const k = y * L.w + x;
  const st = curSite(s)!;
  const d = st.depth[k];
  if (d >= L.depth) return null;
  const ahead = peekAhead(s);
  const lv = lvOf(s, 'dig_lamp');
  const far = lv >= 4 ? ahead + DT.hint : ahead;
  for (let n = d; n < L.depth && n - d <= far; n++) {
    const f = findAt(s, L, k, n);
    if (!f) continue;
    const a = n - d;
    const base = { item: f.item, layer: n, ahead: a, part: [x - f.x, y - f.y] as [number, number], size: f.size };
    if (a <= ahead) return { ...base, frac: peekFrac(a, st.hp[k], L.cells[k].hard[d], digPower(s)) };
    if ((f.item.kind === 'ext' && f.item.topic) || (lv >= 5 && f.item.kind === 'tablet')) return { ...base, frac: 0.1, hint: true };
  }
  return null;
}
/** ランタンで薄く見えている中身（覗き見の中身だけ。気配は除く） */
export function peek(s: P1State, x: number, y: number): DigItem | null {
  const v = peekView(s, x, y);
  return v && !v.hint ? v.item : null;
}
/** そのマスを打てない理由（null なら打てる）。どのマスも最初から叩ける。打てるのは発掘作業のあいだだけ（回数の制限は無い） */
export function digCheck(s: P1State, x: number, y: number): DigErr | null {
  const L = digSite(s);
  if (!L || !s.dig) return 'no-site';
  if (!s.digRun || s.digRun.site !== s.dig.cur) return 'no-run';
  if (x < 0 || y < 0 || x >= L.w || y >= L.h) return 'out';
  const k = y * L.w + x;
  const st = curSite(s)!;
  if (st.depth[k] >= L.depth) return 'dug';
  if (!layerOpen(s, L, st.depth[k])) return 'deep';
  if (st.hp[k] <= 0) return 'wait';
  return null;
}
/** お題のエクステ（その場で研究 Lv5。研究 Lv の上限に掛からない） */
const TOPIC_IDS = new Set(Object.values(DIG_SITES).flatMap((x) => x.topics));
export const isTopicExt = (id: number) => TOPIC_IDS.has(id);
type ResState = Pick<P1State, 'research' | 'skills' | 'skillLv' | 'digOld'>;
/** そのエクステの研究レベル（会社で共有。0〜5。お題のほかは研究 Lv の上限まで） */
export const researchOf = (s: ResState, id: number) => {
  const lv = researchLv(s.research?.[id] ?? 0);
  return TOPIC_IDS.has(id) ? lv : Math.min(lv, researchCap(s));
};
/** 研究 Lv の上限に達して止まっている（数は貯めている。研究の目利きで上がる） */
export const researchCapped = (s: ResState, id: number) => !TOPIC_IDS.has(id) && researchCap(s) < RESEARCH_NEED.length && researchLv(s.research?.[id] ?? 0) >= researchCap(s);
/** 次の研究レベルまで、あと何個（最大・上限なら 0） */
export const researchLeft = (s: ResState, id: number) => {
  if (researchCapped(s, id)) return 0;
  const n = s.research?.[id] ?? 0;
  const next = RESEARCH_NEED.find((x) => x > n);
  return next == null ? 0 : Math.max(1, Math.ceil(next - n));
};
/**
 * 研究 Lv の上限が上がったとき（研究の目利き）：上限で止まっていたエクステの Lv が上がり、そのぶんの RP が入る。
 * 入った RP と上がった数を返す（上がっていなければ 0）
 */
export function syncResearchCap(s: P1State): { rp: number; lv: number } {
  const cap = researchCap(s);
  const paid = s.resCapPaid ?? cap;
  const out = { rp: 0, lv: 0 };
  if (cap > paid) {
    for (const [k, n] of Object.entries(s.research ?? {})) {
      const id = Number(k);
      if (TOPIC_IDS.has(id)) continue;
      const raw = researchLv(n);
      let up = false;
      for (let L = paid + 1; L <= Math.min(raw, cap); L++) {
        const v = RP_GAIN[extRank(id)].lv[L - 2];
        out.rp += v;
        up = true;
      }
      if (up) out.lv++;
    }
    if (out.rp) gainRp(s, out.rp);
    for (let i = 0; i < out.lv; i++) if (s.dig) countLv(s);
  }
  s.resCapPaid = Math.max(paid, cap);
  return out;
}
/** RP を足す（今月の出土品・発掘作業の出土にも数える） */
function gainRp(s: P1State, v: number) {
  s.rp = (s.rp ?? 0) + v;
  if (s.dig) s.dig.month.rp += v;
  if (s.digRun) s.digRun.got.rp += v;
}
function countFound(s: P1State) {
  s.dig!.month.found++;
  if (s.digRun) s.digRun.got.found++;
}
function countLv(s: P1State) {
  s.dig!.month.lv++;
  if (s.digRun) s.digRun.got.lv++;
}
/** 層がはがれて、埋まっていたものが取れた：中身を受け取る（研究レベル・RP・素材・石板・お題） */
function reveal(s: P1State, L: DigLayout, f: DigFind, hit: DigHit) {
  const it = f.item;
  hit.item = it;
  const G = RP_GAIN[L.tier];
  if (it.kind === 'mat') {
    // 素材の選り分け：+20%／Lv（端数は持ち越し）
    const v = it.n * (1 + fxSum(s, 'dig.mat')) + (s.dig?.matCarry ?? 0);
    const all = Math.floor(v + 1e-9);
    if (s.dig) s.dig.matCarry = v - all;
    // ダンジョンの素材は、置き場所（工房の物置・倉庫）に入るぶんだけ（無尽蔵なので、置き場所があふれて調達が止まらないように。荒れ地は今どおり）
    const n = L.dungeon ? Math.min(all, poolFree(s)) : all;
    s.mats[it.mat] = (s.mats[it.mat] ?? 0) + n;
    if (s.digRun) s.digRun.got.mat += n;
    hit.mat = n;
    if (n < all) hit.matFull = true;
    return;
  }
  if (it.kind === 'tablet') {
    if (!s.tablets.includes(it.id)) {
      s.tablets.push(it.id);
      hit.rp += G.tablet;
      gainRp(s, G.tablet);
    }
    return;
  }
  const before = s.research[it.id] ?? 0;
  // ダンジョンで見つけたもの（入り口の吹き出しに並べる）
  if (L.dungeon && s.dig?.dungeon && !s.dig.dungeon.found.includes(it.id)) s.dig.dungeon.found.push(it.id);
  if (it.topic) {
    // お題：その場で研究 Lv5（お題は各 1 つだけ出土）
    s.research[it.id] = Math.max(before, RESEARCH_NEED[RESEARCH_NEED.length - 1]);
    if (!s.dig!.topics.includes(it.id)) s.dig!.topics.push(it.id);
    if (before === 0) {
      hit.first = true;
      countFound(s);
    }
    if (researchLv(before) < 5) {
      hit.lv = 5;
      countLv(s);
    }
    hit.rp += G.topic;
    gainRp(s, G.topic);
    gotRecipe(s, it.id, hit);
    return;
  }
  // 深い層ほど研究が進みやすい（研究の目利きの Lv3〜）：層 n で 1 + 0.25 × (n − 1) × 倍率 個ぶん（端数は持ち越し）
  s.resCarry ??= {};
  const add = researchGain(s, f.layer) + (s.resCarry[it.id] ?? 0);
  const whole = Math.max(1, Math.floor(add + 1e-9));
  s.resCarry[it.id] = Math.max(0, add - whole);
  const n = before + whole;
  s.research[it.id] = n;
  // 研究 Lv の上限（研究の目利き）までしか上がらない（数は貯める。上限が上がったら syncResearchCap で上がる）
  const cap = researchCap(s);
  const lv0 = Math.max(1, Math.min(cap, researchLv(before)));
  const lv1 = Math.min(cap, researchLv(n));
  // RP はエクステのランクで（ダンジョンの奥の Rare 以上は大きい。荒れ地の出土品はセクタのランクと同じ）
  const E = RP_GAIN[extRank(it.id)];
  if (before === 0) {
    hit.first = true;
    countFound(s);
    hit.rp += E.first;
    gainRp(s, E.first);
  }
  if (lv1 > lv0) {
    hit.lv = lv1;
    countLv(s);
    let v = 0;
    for (let x = lv0 + 1; x <= lv1; x++) v += E.lv[x - 2];
    hit.rp += v;
    gainRp(s, v);
  }
  gotRecipe(s, it.id, hit);
}
/** 研究 Lv3 になったら復刻品のレシピを開く（発掘作業の出土にも数える） */
function gotRecipe(s: P1State, id: number, hit: DigHit) {
  const key = openRelic(s, id);
  if (!key) return;
  hit.recipe = key;
  if (s.digRun) (s.digRun.got.recipes ??= []).push(key);
}
/** マス k の層を 1 枚はがして、次の層へ（いちばん奥なら硬さ 0） */
function peel(L: DigLayout, st: DigSiteState, k: number) {
  st.depth[k]++;
  st.hp[k] = st.depth[k] < L.depth ? L.cells[k].hard[st.depth[k]] : 0;
}
/**
 * 1 マスのいまの層を強さ power で打つ（余った力は奥の層に届かない：1 打で 1 枚まで）。0 で 1 枚はがれて次の層へ。
 * 埋まっていたものは、その範囲の全部のマスがその層まではがれた（その層を叩いて 0 にした）ときに取れる（取れたら範囲のマスはまとめて次の層へ）。
 * 全部のマスがいちばん奥まではがれたら、その荒れ地は掘りきった（done）
 */
function strike(s: P1State, L: DigLayout, x: number, y: number, power: number): DigHit {
  const k = y * L.w + x;
  const st = siteState(s, L.site)!;
  const layer = st.depth[k];
  const hit: DigHit = { x, y, layer, broke: false, depth: layer, left: st.hp[k], item: null, rp: 0 };
  if (layer >= L.depth || st.hp[k] <= 0) return hit;
  // 隣への力（広く掘る）は端数になるので、小数 2 桁で丸める
  st.hp[k] = Math.max(0, Math.round((st.hp[k] - power) * 100) / 100) || 0;
  hit.left = st.hp[k];
  if (st.hp[k] > 0) return hit;
  const f = findAt(s, L, k, layer);
  if (f && f.size[0] * f.size[1] > 1) {
    // 大きいもの（2 × 2）：範囲の 4 マスとも、その層を叩いて 0 にするまで待つ
    const cells = findCells(L, f);
    if (!cells.every((c) => st.depth[c] === layer && st.hp[c] <= 0)) {
      hit.wait = true;
      return hit;
    }
    for (const c of cells) peel(L, st, c);
    if (s.digRun) s.digRun.got.cells += cells.length;
    hit.span = { x: f.x, y: f.y, w: f.size[0], h: f.size[1] };
    hit.broke = true;
    reveal(s, L, f, hit);
  } else {
    peel(L, st, k);
    if (s.digRun) s.digRun.got.cells++;
    hit.broke = true;
    if (f) reveal(s, L, f, hit);
  }
  hit.depth = st.depth[k];
  hit.left = st.hp[k];
  // ダンジョン：いちばん深くはがした層（最深記録）
  if (L.dungeon && s.dig?.dungeon) {
    const dd = Math.max(...(hit.span ? findCells(L, { x: hit.span.x, y: hit.span.y, size: [hit.span.w, hit.span.h] }) : [k]).map((c) => st.depth[c]));
    if (s.digRun) s.digRun.deep = Math.max(s.digRun.deep ?? 0, dd);
    s.dig.dungeon.best = Math.max(s.dig.dungeon.best, dd);
  }
  if (!st.done && st.depth.every((v) => v >= L.depth)) {
    st.done = true;
    hit.done = true;
    // 掘りきった荒れ地は復興する（家 +N・需要も上がる・建物を建てられる）。セクタの最後の 1 か所はダンジョンの入り口
    if (!L.dungeon) {
      const r = finishSite(s, L.site);
      if (r === 'dungeon') {
        hit.dungeon = true;
        if (s.digRun) s.digRun.found = L.site;
      } else if (r) {
        hit.revive = r.homes;
        if (s.digRun) s.digRun.revived = { site: L.site, homes: r.homes };
      }
    }
  }
  return hit;
}
/** 会心か（ツルハシの鍛え直しの Lv2・4。打った数から決めるので、同じ打ち方なら同じ結果） */
function rollCrit(s: P1State): boolean {
  const p = critChance(s);
  if (p <= 0 || !s.dig) return false;
  s.dig.hits = (s.dig.hits ?? 0) + 1;
  return rng((s.seed >>> 0) + s.dig.hits * 7919 + 13)() < p;
}
/** 広く掘る：隣のマスへの力の向き（Lv1・2 左右・Lv3 左右と下・Lv4・5 上下左右） */
const REACH_DIRS: Record<'lr' | 'lrd' | 'all', [number, number][]> = {
  lr: [
    [-1, 0],
    [1, 0],
  ],
  lrd: [
    [-1, 0],
    [1, 0],
    [0, 1],
  ],
  all: [
    [-1, 0],
    [1, 0],
    [0, -1],
    [0, 1],
  ],
};
/** マス k のいまの層を打てる（いちばん奥まで掘っていない・掘ってよい層・待っていない） */
const open1 = (s: P1State, L: DigLayout, st: DigSiteState, k: number) => st.depth[k] < L.depth && st.hp[k] > 0 && layerOpen(s, L, st.depth[k]);
/** 1 打（会心・広く掘るを含む）：そのマスを power で打ち、隣のマスの いまの層 にも力の一部（掘ってよい層のマスだけ） */
function strikeAt(s: P1State, L: DigLayout, x: number, y: number, power: number): DigHit {
  const crit = rollCrit(s);
  const p = crit ? power * DT.critMul : power;
  const hit = strike(s, L, x, y, p);
  if (crit) hit.crit = true;
  const lv = lvOf(s, 'dig_reach');
  const r = fxSum(s, 'dig.reach');
  if (lv > 0 && r > 0) {
    const st = siteState(s, L.site)!;
    for (const [dx, dy] of REACH_DIRS[DT.reachDir[Math.min(5, lv) - 1]]) {
      const X = x + dx;
      const Y = y + dy;
      if (X < 0 || Y < 0 || X >= L.w || Y >= L.h || !open1(s, L, st, Y * L.w + X)) continue;
      const h2 = strike(s, L, X, Y, p * r);
      h2.splash = true;
      (hit.extra ??= []).push(h2);
      if (h2.done) hit.done = true;
    }
  }
  return hit;
}
/** 打つ：そのマスを 1 打（1 打の強さ digPower・会心・広く掘る）。その層がはがれたら中身が出る。発掘作業のあいだは何回でも打てる。打てなければ理由（DigErr） */
export function dig(s: P1State, x: number, y: number): DigHit | DigErr {
  const e = digCheck(s, x, y);
  if (e) return e;
  return strikeAt(s, digSite(s)!, x, y, digPower(s));
}
/** 発破が使えるか（スキル「発破」） */
export const hasBlast = (s: P1State) => lvOf(s, 'dig_blast') > 0;
/** 発破：火薬代で、(x, y) を真ん中に N × N マスの いまの層を 1 枚ずつ はがす（硬さに関係なく 1 枚。深い層の許可が無い層・待っているマスははがさない） */
export function blast(s: P1State, x: number, y: number): DigHit[] | DigErr {
  const e = digCheck(s, x, y);
  // 真ん中のマスが掘りきっていても、まわりがはがせれば使える
  if (e && e !== 'dug' && e !== 'deep' && e !== 'wait') return e;
  if (!hasBlast(s)) return 'no-blast';
  const L = digSite(s)!;
  const st = curSite(s)!;
  const n = blastSize(s);
  const lo = -Math.floor((n - 1) / 2);
  const targets: [number, number][] = [];
  for (let dy = lo; dy < lo + n; dy++)
    for (let dx = lo; dx < lo + n; dx++) {
      const X = x + dx;
      const Y = y + dy;
      if (X >= 0 && Y >= 0 && X < L.w && Y < L.h && open1(s, L, st, Y * L.w + X)) targets.push([X, Y]);
    }
  if (!targets.length) return e ?? 'dug';
  const cost = blastCost(s);
  if (s.money < cost) return 'money';
  s.money -= cost;
  spend(s, 'build', cost);
  return targets.map(([X, Y]) => strike(s, L, X, Y, Infinity));
}
/** 掘削ドリル：燃料代で、(x, y) のマス 1 つを 奥へ N 層 一気にはがす（深い層の許可が無い層・2 × 2 のものを待つところで止まる） */
export function drill(s: P1State, x: number, y: number): DigHit[] | DigErr {
  const e = digCheck(s, x, y);
  if (e) return e;
  if (!hasDrill(s)) return 'no-drill';
  if (s.money < DRILL_FUEL) return 'money';
  const L = digSite(s)!;
  const st = curSite(s)!;
  s.money -= DRILL_FUEL;
  spend(s, 'build', DRILL_FUEL);
  const k = y * L.w + x;
  const out: DigHit[] = [];
  for (let i = 0; i < drillLen(s); i++) {
    if (!open1(s, L, st, k)) break;
    const h = strike(s, L, x, y, Infinity);
    out.push(h);
    if (!h.broke || h.done) break;
  }
  return out;
}
/** 荒れ地 k に、いまの許可で掘れるマスが残っている（深い層の許可が無い層は数えない） */
export function siteDiggable(s: P1State, k: number): boolean {
  const L = layoutOf(s, k);
  const st = siteState(s, k);
  if (!L || !st) return false;
  return st.depth.some((d, i) => d < L.depth && st.hp[i] > 0 && layerOpen(s, L, d));
}
/**
 * 次に打つマス（発掘隊）：取りかけのもの（2 × 2 の範囲のどこかを、その層まで叩いている）の範囲 → 打ちかけのマス → 浅いマス → 左上から
 * （深い層の許可が無い層・待っているマスは打たない）。
 * stand（常駐で働く日）は常駐の段取りで選び方が変わる（層の番号で）：Lv1 お題の気配のある所（お題の範囲の、お題の層まで）を先に・
 * Lv3 いまの層に研究 Lv の低いエクステがあるマスを先に・Lv5 研究 Lv の上限に達したエクステのマスを後回し
 */
export function digNext(s: P1State, stand = false): [number, number] | null {
  const L = digSite(s);
  const st = curSite(s);
  if (!L || !st) return null;
  const rl = stand ? lvOf(s, 'u_dig_route') : 0;
  const bonus = new Map<number, number>();
  const add = (k: number, v: number) => bonus.set(k, Math.min(bonus.get(k) ?? 0, v));
  for (const f of L.finds) {
    const cells = findCells(L, f);
    if (cells.some((c) => st.depth[c] > f.layer) || !findAt(s, L, cells[0], f.layer)) continue;
    // 取りかけの大きいもの
    if (f.size[0] * f.size[1] > 1 && cells.some((c) => st.depth[c] === f.layer && st.hp[c] < L.cells[c].hard[f.layer])) for (const c of cells) add(c, -2e6);
    // 常駐の段取り Lv1：お題の気配
    if (rl >= 1 && f.item.kind === 'ext' && f.item.topic) for (const c of cells) add(c, -1.5e6);
  }
  const cap = researchCap(s);
  let best: [number, number] | null = null;
  let score = Infinity;
  for (let y = 0; y < L.h; y++)
    for (let x = 0; x < L.w; x++) {
      const k = y * L.w + x;
      if (!open1(s, L, st, k)) continue;
      const d = st.depth[k];
      let v = (bonus.get(k) ?? 0) + (st.hp[k] < L.cells[k].hard[d] ? -1e6 : 0) + d * 1000 + y * L.w + x;
      const it = findAt(s, L, k, d)?.item;
      if (it?.kind === 'ext' && !it.topic) {
        // Lv3：研究 Lv の低いエクステほど先に（上限に達したものは数えない）・Lv5：上限に達したエクステは後回し
        const lv = researchOf(s, it.id);
        if (rl >= 3 && lv < cap) v -= 1500 * (cap - lv);
        if (rl >= 5 && lv >= cap) v += 1e5;
      }
      if (v < score) {
        score = v;
        best = [x, y];
      }
    }
  return best;
}
/** 常駐（作業していない日）に掘る荒れ地：許可があって掘れるマスが残っている所（いまの荒れ地 → 段取り Lv1 はお題の気配のある所 → 番号の順）。無ければ -1 */
export function standSite(s: P1State): number {
  const d = s.dig;
  if (!d) return -1;
  const ok = d.sites.map((_, k) => k).filter((k) => d.sites[k].permit && !d.sites[k].done && siteDiggable(s, k));
  if (!ok.length) return -1;
  if (lvOf(s, 'u_dig_route') >= 1) {
    const hidden = ok.find((k) => siteTopic(s, k) === 'hidden');
    if (hidden != null && !ok.includes(d.cur)) return hidden;
    if (hidden != null && siteTopic(s, d.cur) !== 'hidden') return hidden;
  }
  return ok.includes(d.cur) ? d.cur : ok[0];
}
/**
 * 発掘隊の 1 日：発掘作業のあいだは、適性の速さ × DIG_AUTO.perDay ×（発掘隊の手際）回ぶん同じ荒れ地を打つ（端数は持ち越す）。
 * 常駐（自動化）があれば、作業していない日も、許可のある荒れ地を その速さ × 常駐の割合で打つ
 */
export function autoDig(s: P1State, st: Staff): DigHit[] {
  if (!s.dig) return [];
  const stand = !s.digRun;
  if (stand) {
    if (!hasAuto(s)) return [];
    const k = standSite(s);
    if (k < 0) return [];
    s.dig.cur = k;
  }
  const out: DigHit[] = [];
  s.dig.carry += DIG_AUTO.perDay * speed(st, 'dig', s) * crewMul(s) * (stand ? autoRate(s) : 1);
  const L = digSite(s)!;
  while (s.dig.carry >= 1) {
    const at = digNext(s, stand);
    if (!at) break;
    const r = strikeAt(s, L, at[0], at[1], digPower(s));
    out.push(r, ...(r.extra ?? []));
    s.dig.carry -= 1;
    if (siteState(s, L.site)?.done) break;
  }
  s.dig.carry = Math.min(1, s.dig.carry);
  return out;
}

// ---------------------------------------------------------------- 発掘許可（荒れ地ごと）

/** このセクタで許可をもらった荒れ地の数 */
export const permitCount = (s: Pick<P1State, 'dig'>) => s.dig?.sites.filter((x) => x.permit).length ?? 0;
/** 次の発掘許可の申請料（セクタの 1 か所目は無料。2 か所目から DIG_BALANCE.permitFee） */
export function permitFee(s: Pick<P1State, 'dig'>): number {
  const tier = s.dig ? digTierOf(s.dig.sector) : null;
  if (!tier) return 0;
  return permitCount(s) === 0 ? 0 : DIG_BALANCE.permitFee[tier];
}
export type PermitErr = 'no-site' | 'have' | 'money';
/** 荒れ地 k の発掘許可を申請できない理由（null ならできる） */
export function permitLock(s: P1State, k: number): PermitErr | null {
  const st = s.dig?.sites[k];
  if (!st) return 'no-site';
  if (st.permit) return 'have';
  return s.money < permitFee(s) ? 'money' : null;
}
/** 発掘許可を申請する（国の役所へ。申請料は帳簿の「許可・通行料」） */
export function applyPermit(s: P1State, k: number): { fee: number } | PermitErr {
  const e = permitLock(s, k);
  if (e) return e;
  const fee = permitFee(s);
  if (fee > 0) {
    s.money -= fee;
    book(s, 'fees', fee);
  }
  s.dig!.sites[k].permit = true;
  return { fee };
}
/** 1 か所目の荒れ地：自社の工房にいちばん近い荒れ地（工房が無ければ 0） */
export function firstSite(s: Pick<P1State, 'sector' | 'buildings'>): number {
  const ws = s.buildings.find((b) => b.owner === 'me' && b.id === 'workshop');
  const sp = wasteSpots(s.sector ?? 'c1');
  if (!ws || !sp.length) return 0;
  let best = 0;
  let bd = Infinity;
  sp.forEach(([i, j], k) => {
    const d = Math.abs(i + 0.5 - ws.i) + Math.abs(j + 0.5 - ws.j);
    if (d < bd) {
      bd = d;
      best = k;
    }
  });
  return best;
}
/** 1 か所目の発掘許可を、申請料なしで済ませる（発掘との出会いの手紙・古いセーブ）。許可した荒れ地の番号 */
export function grantFirst(s: P1State): number {
  if (!s.dig) return -1;
  const k = firstSite(s);
  if (permitCount(s) === 0 && s.dig.sites[k]) s.dig.sites[k].permit = true;
  return k;
}
/** 荒れ地 k の掘った割合（0〜1。はがした層の枚数 / マス × 層の数） */
export function siteProgress(s: Pick<P1State, 'dig'>, k: number): number {
  const st = siteState(s, k);
  const L = layoutOf(s, k);
  if (!st || !L || !st.depth?.length) return 0;
  return st.depth.reduce((a, v) => a + Math.min(L.depth, v), 0) / (st.depth.length * L.depth);
}
/** 荒れ地 k のお題：'none'（無い）／'hidden'（まだ眠っている）／'found'（見つけ済み） */
export function siteTopic(s: Pick<P1State, 'dig'>, k: number): 'none' | 'hidden' | 'found' {
  const L = k === DUNGEON ? null : layoutOf(s, k);
  if (!L || L.topic == null) return 'none';
  return s.dig!.topics.includes(L.topic) ? 'found' : 'hidden';
}

// ---------------------------------------------------------------- 復興（掘りきった荒れ地。発掘 v2 の 4 段目）

/** 町の住宅の数（商圏の家） */
export const townHomes = (s: Pick<P1State, 'buildings'>) => s.buildings.filter((b) => b.owner === 'town' && DEF[b.id]?.cat === 'home').length;
/** 復興した荒れ地の番号 */
export const revivedSites = (s: Pick<P1State, 'dig'>) => (s.dig?.sites ?? []).map((x, k) => ({ x, k })).filter(({ x }) => x.revived).map(({ k }) => k);
/** 復興で上がった需要の倍率（1 ＋ 0.06 × 復興した荒れ地の数） */
export const reviveMul = (s: Pick<P1State, 'dig'>) => 1 + DIG_BALANCE.revive.homes * revivedSites(s).length;
/** マス (i, j) は復興した土地（建物を建てられる） */
export function isRevived(s: Pick<P1State, 'sector' | 'dig'>, i: number, j: number): boolean {
  const k = wasteAt(s, i, j);
  return k >= 0 && !!s.dig?.sites[k]?.revived;
}
/** マス (i, j) は建てられない荒れ地（まだ掘りきっていない・ダンジョンの入り口） */
export const wasteBlock = (s: Pick<P1State, 'sector' | 'dig'>, i: number, j: number) => isWaste(s, i, j) && !isRevived(s, i, j);
/** 荒れ地 k はダンジョンの入り口 */
export const isDungeonSite = (s: Pick<P1State, 'dig'>, k: number) => k >= 0 && s.dig?.dungeon?.site === k;

const HOME_IDS = ['house', 'cottage', 'garage_house', 'japanese_house', 'apartment', 'manor'];
/**
 * 復興した土地へ通す小道：荒れ地の 4 辺のうち、道路とのあいだの空き地（1 マス幅）がいちばん多く空いている辺を道路にする
 * （区画の内側なので、そのままでは建物の入口を道路に向けられない）。空いていなければ []
 */
function pathFor(s: P1State, k: number): [number, number][] {
  const sp = wasteSpots(s.sector ?? 'c1')[k];
  if (!sp) return [];
  const [i0, j0] = sp;
  const n = WASTE.size;
  const sides: [number, number][][] = [
    Array.from({ length: n }, (_, d): [number, number] => [i0 - 1, j0 + d]),
    Array.from({ length: n }, (_, d): [number, number] => [i0 + n, j0 + d]),
    Array.from({ length: n }, (_, d): [number, number] => [i0 + d, j0 - 1]),
    Array.from({ length: n }, (_, d): [number, number] => [i0 + d, j0 + n]),
  ];
  const ok = ([x, y]: [number, number]) => ground(s, x, y) === 'grass' && !occupant(s, x, y) && !isWaste(s, x, y) && [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => isRoad(s, x + dx, y + dy));
  let best: [number, number][] = [];
  for (const side of sides) {
    const free = side.filter(ok);
    if (free.length > best.length) best = free;
  }
  return best;
}
/** 復興で通した小道を地面に（地面はセーブに入れないので、読み込んだとき・セクタを移ったときにも） */
export function syncGround(s: P1State) {
  for (const st of s.dig?.sites ?? []) for (const [x, y] of st.path ?? []) if (x >= 0 && y >= 0 && x < s.n && y < s.n) s.ground[y * s.n + x] = 'road';
}
/**
 * 荒れ地 k が復興する：そのセクタの家の数の +6%（DIG_BALANCE.revive.homes。最低 1）の家が増え、商品ごとの需要も同じ割合で上がる。
 * 地図には住宅の絵を近くの空き地に houses 軒まで足し、荒れ地へ小道を通す（建物を建てられる土地に）
 */
export function reviveSite(s: P1State, k: number): { homes: number } | null {
  const st = s.dig?.sites[k];
  if (!st || !st.done || st.revived) return null;
  const homes = Math.max(1, Math.round(townHomes(s) * DIG_BALANCE.revive.homes));
  const before = reviveMul(s);
  st.revived = true;
  st.homes = homes;
  const after = reviveMul(s);
  for (const key of Object.keys(s.demand)) s.demand[key] = ((s.demand[key] ?? 0) * after) / before;
  st.path = pathFor(s, k);
  syncGround(s);
  const sp = wasteSpots(s.sector ?? 'c1')[k];
  const r = rng(strSeed(`revive:${s.dig!.sector}:${k}`));
  for (let n = 0; n < Math.min(homes, DIG_BALANCE.revive.houses) && sp; n++) placeTown(s, HOME_IDS[Math.floor(r() * HOME_IDS.length)], r, 'town', [sp[0] + 0.5, sp[1] + 0.5]);
  return { homes };
}
/** 掘りきった荒れ地のあと始末：セクタの最後の 1 か所ならダンジョンの入り口（'dungeon'）、ほかは復興（増えた家）。済んでいれば null */
function finishSite(s: P1State, k: number): 'dungeon' | { homes: number } | null {
  const d = s.dig;
  const st = d?.sites[k];
  if (!d || !st?.done || st.revived || d.dungeon?.site === k) return null;
  if (!d.dungeon && d.sites.every((x) => x.done)) {
    openDungeon(s, k);
    return 'dungeon';
  }
  return reviveSite(s, k);
}
function openDungeon(s: P1State, k: number) {
  const d = s.dig!;
  d.dungeon = { site: k, runs: 0, best: 0, st: null, found: [] };
  const list = (s.dungeons ??= []);
  if (!list.includes(d.sector)) list.push(d.sector);
}
/**
 * 掘りきった荒れ地を、復興・ダンジョンにそろえる（版 5 までのセーブ・ほかのセクタの写し）。どれが最後に掘りきったかは記録が無いので、
 * 4 か所とも掘りきっていれば、いちばん番号の大きい荒れ地をダンジョンに。済んでいるものはそのまま（何度呼んでもよい）
 */
export function syncRevive(s: P1State) {
  const d = s.dig;
  if (!d) return;
  const pending = d.sites.map((_, k) => k).filter((k) => d.sites[k].done && !d.sites[k].revived && d.dungeon?.site !== k);
  const last = pending.length && !d.dungeon && d.sites.every((x) => x.done) ? Math.max(...pending) : -1;
  for (const k of pending) if (k !== last) reviveSite(s, k);
  if (last >= 0) openDungeon(s, last);
  syncGround(s);
}

// ---------------------------------------------------------------- 遺物の展示館（発掘 v2 の 4 段目）

const MB = DIG_BALANCE.museum;
/** 展示館の建物（いまのセクタに建っていれば） */
export function museumBuilding(s: Pick<P1State, 'museum' | 'sector' | 'buildings'>): PBuilding | null {
  const at = s.museum?.at;
  if (!at || at.sector !== (s.sector ?? 'c1')) return null;
  return s.buildings.find((b) => b.uid === at.uid && b.id === 'museum') ?? null;
}
/** 展示館が開いている（建っている。ほかのセクタに建てたものは開いているとみなす） */
export function museumOpen(s: Pick<P1State, 'museum' | 'sector' | 'buildings'>): boolean {
  const at = s.museum?.at;
  if (!at) return false;
  if (at.sector !== (s.sector ?? 'c1')) return true;
  const b = museumBuilding(s);
  return !!b && b.left <= 0;
}
/** 展示の枠（4 → 展示室の増築で 8・12・16） */
export const museumSlots = (s: Pick<P1State, 'museum'>) => MB.slots[Math.min(MB.slots.length - 1, s.museum?.lv ?? 0)];
/** 遺物 1 つの展示の価値：レアリティ（C 1・U 2・R 5・E 15・L 40）×（1 ＋ 0.25 ×（研究 Lv − 1）） */
export function relicValue(s: ResState, id: number): number {
  const lv = Math.max(1, researchOf(s, id));
  return Math.round(MB.val[extRank(id)] * (1 + MB.lvStep * (lv - 1)) * 100) / 100;
}
/** 展示の価値の合計 */
export const museumValue = (s: ResState & Pick<P1State, 'museum'>) => Math.round((s.museum?.items ?? []).reduce<number>((a, id) => a + (id != null ? relicValue(s, id) : 0), 0) * 100) / 100;
/** 飾れる遺物（研究ノートの出土品。見つけたエクステ）：価値の高い順 */
export function exhibitable(s: ResState): number[] {
  return Object.entries(s.research ?? {})
    .filter(([, n]) => (n ?? 0) > 0)
    .map(([id]) => Number(id))
    .sort((a, b) => relicValue(s, b) - relicValue(s, a) || a - b);
}
export type ExhibitErr = 'no-museum' | 'slot' | 'unknown' | 'dup';
/** 展示の枠 slot に遺物 id を飾る（null で外す）。同じエクステは 1 枠まで。飾ったら節目のボーナスを確かめる */
export function exhibit(s: P1State, slot: number, id: number | null): ExhibitErr | null {
  const m = s.museum;
  if (!m?.at) return 'no-museum';
  if (slot < 0 || slot >= museumSlots(s)) return 'slot';
  if (id != null) {
    if (!((s.research?.[id] ?? 0) > 0)) return 'unknown';
    if (m.items.some((x, k) => x === id && k !== slot)) return 'dup';
  }
  while (m.items.length < museumSlots(s)) m.items.push(null);
  m.items[slot] = id;
  syncMuseum(s);
  return null;
}
/** 価値の高い遺物から、空いている枠に飾る（自動プレイ）。飾った数 */
export function autoExhibit(s: P1State): number {
  const m = s.museum;
  if (!m?.at) return 0;
  while (m.items.length < museumSlots(s)) m.items.push(null);
  const want = exhibitable(s).slice(0, museumSlots(s));
  let n = 0;
  // いま飾っているもののうち、上位に入らないものは入れ替える
  for (let k = 0; k < museumSlots(s); k++) if (m.items[k] != null && !want.includes(m.items[k]!)) m.items[k] = null;
  for (const id of want) {
    if (m.items.includes(id)) continue;
    const k = m.items.findIndex((x, i) => x == null && i < museumSlots(s));
    if (k < 0) break;
    m.items[k] = id;
    n++;
  }
  syncMuseum(s);
  return n;
}
/** 節目（展示の価値の合計 20・50・100・200…）：届いた数・次の節目・あといくつ */
export function museumMarks(s: ResState & Pick<P1State, 'museum'>): { reached: number; next: number | null; left: number } {
  const v = museumValue(s);
  const next = MB.marks.find((x) => x > v) ?? null;
  return { reached: MB.marks.filter((x) => v >= x).length, next, left: next == null ? 0 : Math.round((next - v) * 10) / 10 };
}
/** 節目を超えたら、恒久のボーナス（会社全体の新商品の認知の上がり方 +5%・ブランド力 +1）。節目ごとに 1 回だけ。新しく届いた数 */
export function syncMuseum(s: P1State): number {
  const m = s.museum;
  if (!m) return 0;
  const { reached } = museumMarks(s);
  let n = 0;
  while (m.marks < reached) {
    m.marks++;
    n++;
    brandAdd(s, MB.brand, t(`遺物の展示館（展示の価値 ${MB.marks[m.marks - 1]}）`, `Relic museum (exhibit value ${MB.marks[m.marks - 1]})`));
  }
  return n;
}
/** 展示館の節目のボーナス：新商品の認知の上がり方の足し分（+5% × 届いた節目） */
export const museumKnown = (s: Pick<P1State, 'museum'>) => MB.known * (s.museum?.marks ?? 0);
/** 展示館のひと月：来館者（価値 × 12 人）と入館料の収入（来館者 × 15 G）。館が開いていなければ null */
export function museumMonth(s: P1State): { visitors: number; income: number; value: number } | null {
  if (!museumOpen(s)) return null;
  const value = museumValue(s);
  const visitors = Math.round(value * MB.visitors);
  return { visitors, income: visitors * MB.fee, value };
}

// ---------------------------------------------------------------- 発掘作業（15 秒）

/** deep：いまの許可で掘れるマスが残っていない（深い層の許可が要る） */
export type RunErr = 'no-site' | 'no-permit' | 'done' | 'busy' | 'deep';
/** 荒れ地 k で発掘作業を始められない理由（null なら始められる） */
export function runLock(s: P1State, k: number): RunErr | null {
  // ダンジョン：許可は要らない（掘りきったので）。入るたびに壁を作り直すので、掘りきりも無い
  if (k === DUNGEON) {
    if (!s.dig?.dungeon) return 'no-site';
    return s.digRun ? 'busy' : null;
  }
  const st = s.dig?.sites[k];
  if (!st) return 'no-site';
  if (s.digRun) return 'busy';
  if (!st.permit) return 'no-permit';
  if (st.done) return 'done';
  if (!siteDiggable(s, k)) return 'deep';
  return null;
}
/**
 * 発掘作業を始める（sessionSec 秒）。作業のあいだは時間が流れる（月末ポーズから始めたら、次の月が始まる）。
 * 月の締め（endMonth）は行うが、月末ポーズと月次報告の画面は作業のあとにまとめる（holdReport・endRun）
 */
export function startRun(s: P1State, k: number): DigRun | RunErr {
  const e = runLock(s, k);
  if (e) return e;
  s.dig!.cur = k;
  s.dig!.last = s.day;
  s.monthPause = false;
  const ms = sessionSec(s) * 1000;
  s.digRun = { site: k, left: ms, total: ms, rep0: s.reports.length, got: { found: 0, lv: 0, rp: 0, mat: 0, cells: 0 } };
  // ダンジョン：入るたびに壁を作り直す（種はセクタの id と入った回数。前の回の掘りかけは残らない）
  const dg = k === DUNGEON ? s.dig!.dungeon! : null;
  if (dg) {
    dg.runs++;
    const L = dungeonLayout(s.dig!.sector, dg.runs)!;
    dg.st = { ...freshSite(L), permit: true };
    s.digRun.deep = 0;
    s.digRun.best0 = dg.best;
  }
  return s.digRun;
}
/** 現実の時間を ms 進める。時間切れなら true */
export function runTick(s: P1State, ms: number): boolean {
  if (!s.digRun) return false;
  s.digRun.left = Math.max(0, s.digRun.left - ms);
  return s.digRun.left <= 0;
}
/** 月の締めの報告を、いまは画面に出さずに積む（発掘作業のあいだ） */
export const holdReport = (s: Pick<P1State, 'digRun'>) => !!s.digRun;
export interface RunEnd {
  site: number;
  got: DigGot;
  /** 作業のあいだに締めた月の報告（古い順） */
  held: Report[];
  /** 月をまたいだ（まとめ報告を出し、そのあと月末ポーズを 1 回） */
  crossed: boolean;
  /** その荒れ地を掘りきっている */
  done: boolean;
  /** ダンジョンの作業だった・はがしたいちばん深い層・最深記録を更新した */
  isDungeon?: boolean;
  deep?: number;
  record?: boolean;
  /** 復興した荒れ地と増えた家／ダンジョンの入り口が見つかった荒れ地 */
  revived?: { site: number; homes: number };
  found?: number;
}
/** 発掘作業を終える（時間切れ・「発掘を終える」）。月をまたいでいたら、月末ポーズを 1 回（「次の月へ」を押すまで止まる） */
export function endRun(s: P1State): RunEnd | null {
  const r = s.digRun;
  if (!r) return null;
  s.digRun = null;
  if (s.dig) s.dig.last = s.day;
  const held = s.reports.slice(r.rep0);
  if (held.length) s.monthPause = true;
  const isDungeon = r.site === DUNGEON;
  if (isDungeon && s.dig?.dungeon) s.dig.dungeon.last = r.deep ?? 0;
  return {
    site: r.site,
    got: r.got,
    held,
    crossed: held.length > 0,
    done: !isDungeon && !!s.dig?.sites[r.site]?.done,
    ...(isDungeon ? { isDungeon, deep: r.deep ?? 0, record: (r.deep ?? 0) > (r.best0 ?? 0) } : {}),
    ...(r.revived ? { revived: r.revived } : {}),
    ...(r.found != null ? { found: r.found } : {}),
  };
}

/** そのセクタのお題（エクステの id。上の層から） */
export const topicsOf = (sector: string) => DIG_SITES[sector]?.topics ?? [];
/** 掘り出したお題の数 / お題の数 */
export function topicProgress(s: Pick<P1State, 'dig'>): [number, number] {
  if (!s.dig) return [0, 0];
  return [s.dig.topics.length, topicsOf(s.dig.sector).length];
}
/** いまの層（いま掘っている荒れ地の、いちばん奥まで進んだマスのいまの層。まだ掘っていなければ 0） */
export function digDepthLayer(s: Pick<P1State, 'dig'>): number {
  const L = digSite(s);
  const st = curSite(s);
  if (!L || !st) return 0;
  return Math.min(L.depth - 1, Math.max(0, ...st.depth));
}
/** 発表すると受け取る調査依頼状（Common → Uncommon。Uncommon → Rare は枠だけ） */
const NEXT_TIER: Partial<Record<Tier, Tier>> = { C: 'U', U: 'R' };
export type PresentErr = 'no-site' | 'not-yet' | 'done';
/** 研究成果を発表できない理由（null ならできる）：このセクタのお題をそろえたら、セクター長に発表する */
export function presentLock(s: P1State): PresentErr | null {
  if (!s.dig) return 'no-site';
  if (s.presented.includes(s.dig.sector)) return 'done';
  const [a, b] = topicProgress(s);
  return a < b ? 'not-yet' : null;
}
/** 研究成果を発表する：RP と、上のランクの調査依頼状を受け取る */
export function present(s: P1State): { rp: number; letter: Tier | null } | PresentErr {
  const e = presentLock(s);
  if (e) return e;
  const sector = s.dig!.sector;
  const tier = digTierOf(sector)!;
  s.presented.push(sector);
  const v = RP_GAIN[tier].present;
  gainRp(s, v);
  const letter = NEXT_TIER[tier] ?? null;
  if (letter && !s.letters.includes(letter)) s.letters.push(letter);
  return { rp: v, letter };
}
/** 調査依頼状を持っている（そのランクのセクタへ出店できる。Common はいつでも） */
export const hasLetter = (s: Pick<P1State, 'letters'>, tier: Tier) => tier === 'C' || !!s.letters?.includes(tier);

/** エクステの名前（研究ノート・出土の演出。カタログの全シリーズから） */
let extNames: Map<number, { name: string; nameEn: string }> | null = null;
export function extName(id: number): string {
  extNames ??= new Map(allSeries.flatMap((x) => x.items.map((e) => [e.id, { name: e.name, nameEn: e.nameEn }] as const)));
  const e = extNames.get(id);
  return e ? t(e.name, e.nameEn) : `#${id}`;
}

/** 版 2 の発掘場（セクタに 1 つ・工房の裏）。版 3 で荒れ地 4 か所に作り直す */
interface OldDig {
  sector: string;
  hp: number[];
  topics: number[];
  month?: { found: number; lv: number; rp: number };
}
/**
 * 版 2 → 3（docs/ISLAND_PHASE1.md「セーブの引き継ぎ（版 3）」）：断面のマス目は新しい荒れ地 4 か所で作り直す。
 * 見つけたお題（・研究ノート・RP・石板は会社のもの）はそのまま（見つけ済みのお題は、新しい配置で再び出ない）。1 か所目の許可は済み。ツルハシの回数は捨てる
 */
export function upgradeDig(old: OldDig, s: Pick<P1State, 'buildings'>): DigState | null {
  const d = newDig(old.sector);
  if (!d) return null;
  d.topics = [...(old.topics ?? [])];
  if (old.month) d.month = { ...old.month };
  const k = firstSite({ sector: old.sector, buildings: s.buildings });
  d.sites[k].permit = true;
  d.cur = k;
  return d;
}
/**
 * 版 4 → 5（docs/ISLAND_PHASE1.md「セーブの引き継ぎ（版 5）」）：上から掘る断面（マスごとの残りの硬さだけ）を、正面の壁で作り直す。
 * 掘りかけの進みは捨てる。許可・掘りきりの印はそのまま（掘りきった荒れ地は、全部のマスをいちばん奥まで掘ったことに）。
 * 研究・RP・お題の発見・石板・レシピは会社のもの（そのまま）。見つけ済みのお題・読んだ石板は、新しい壁にも出ない（findAt）
 */
function rebuildWalls(d: DigState) {
  const old = d.sites ?? [];
  d.sites = digLayouts(d.sector).map((L, k) => {
    const st = freshSite(L);
    st.permit = !!old[k]?.permit;
    st.done = !!old[k]?.done;
    if (st.done) {
      st.depth.fill(L.depth);
      st.hp.fill(0);
    }
    return st;
  });
}
/** いまのセクタの発掘場を、いまの形にそろえる（無い・別のセクタ → 新しく。版 2 の形 → 作り直す。版 4 までの断面 → 正面の壁で作り直す） */
export function ensureDig(s: P1State) {
  const sec = s.sector ?? 'c1';
  const d = s.dig as (DigState & Partial<OldDig>) | null | undefined;
  if (d === undefined || (d && d.sector !== sec)) s.dig = newDig(sec);
  else if (d && !Array.isArray(d.sites)) s.dig = upgradeDig(d as OldDig, s);
  else if (d && d.sites.some((x) => !Array.isArray(x.depth))) rebuildWalls(d);
  // 版 5 まで：掘りきった荒れ地を復興・ダンジョンに（済んでいれば何もしない）
  if (s.dig && s.buildings) syncRevive(s);
}
/** 版 3 の断面（横 7・上から掘る形）の、層ごとの行数 */
const OLD_ROWS: Record<DigTier, number[]> = { C: [7, 7, 6], U: [6, 6, 6, 6] };
/** 版 3・4 の断面（上から掘る形）で崩していた、いちばん深い層の数（掘れる層の下限に残す。版 3 → 4 の移し替えで使う） */
export function oldDigDeep(s: Pick<P1State, 'dig'>): Partial<Record<DigTier, number>> {
  const out: Partial<Record<DigTier, number>> = {};
  const d = s.dig;
  const tier = d && Array.isArray(d.sites) ? digTierOf(d.sector) : null;
  if (!d || !tier) return out;
  const layerOfRow = (row: number) => {
    let acc = 0;
    for (let n = 0; n < OLD_ROWS[tier].length; n++) {
      acc += OLD_ROWS[tier][n];
      if (row < acc) return n;
    }
    return OLD_ROWS[tier].length - 1;
  };
  for (const st of d.sites) {
    if (Array.isArray(st.depth)) continue;
    (st.hp ?? []).forEach((v, i) => {
      if (v <= 0) out[tier] = Math.max(out[tier] ?? 0, layerOfRow(Math.floor(i / 7)) + 1);
    });
  }
  return out;
}

/**
 * 版 3 → 4（docs/ISLAND_PHASE1.md「セーブの引き継ぎ（版 4）」）：工房の設備投資の発掘の道具を、発掘の枝のパネルへ（払ったお金は戻さない）。
 * ツルハシの新調 1 段 → ツルハシの鍛え直し Lv1・2 段 → Lv3／発掘のランタン → 発掘のランタン Lv1／発破の道具 → 発破 Lv1。
 * いまのセクタと、ほかのセクタの写しの工房のうち、いちばん進んだ段で渡す（写しの設備投資からも外す）。
 * 版 3 までは研究 Lv の上限・掘れる層の制限が無かったので、上げていた研究 Lv（お題を除く）・掘っていた層を下限に残す（下がらない）
 */
export function migrateDigTree(s: P1State, oldDeep: Partial<Record<DigTier, number>> = oldDigDeep(s)) {
  const lv: Record<string, number> = {};
  const strip = (b: { id?: string; owner?: string; inv?: Partial<Record<string, number>> }) => {
    if (b.id !== 'workshop' || !b.inv) return;
    for (const [tool, to] of Object.entries(OLD_DIG_TOOLS)) {
      const n = b.inv[tool] ?? 0;
      if (n > 0) lv[to.id] = Math.max(lv[to.id] ?? 0, to.lv[Math.min(to.lv.length, n) - 1]);
      delete b.inv[tool];
    }
  };
  for (const b of s.buildings) if (b.owner === 'me') strip(b);
  for (const r of Object.values(s.land?.recs ?? {})) for (const b of ((r.snap as { buildings?: PBuilding[] } | undefined)?.buildings ?? []) as PBuilding[]) if (b.owner === 'me') strip(b);
  for (const [id, n] of Object.entries(lv)) if (lvOf(s, id) < n) setLevel(s, id, n);
  // 研究 Lv の下限（お題を除く。版 3 は Lv5 まで上がっていた）
  const top = Math.max(0, ...Object.entries(s.research ?? {}).filter(([id]) => !TOPIC_IDS.has(Number(id))).map(([, n]) => researchLv(n)));
  // 掘れる層の下限：いまのセクタの荒れ地で、崩したマスのいちばん深い層まで（版 3 の断面で数える。oldDigDeep）
  const deep: Partial<Record<DigTier, number>> = { ...oldDeep };
  if (top > DT.cap[0] || Object.keys(deep).length) s.digOld = { ...(top > DT.cap[0] ? { cap: top } : {}), ...(Object.keys(deep).length ? { deep } : {}) };
  s.resCapPaid = researchCap(s);
}

/** 以前のゴールドダストのパネルの値段（版 1 のセーブの返金に使う：✨ 3 → 4 → 5。外周は U 5・R 6・E 8・L 10 から） */
const OLD_DUST: Record<Tier, number> = { C: 3, U: 5, R: 6, E: 8, L: 10 };
/**
 * 版 1 → 2 のセーブの移し替え（docs/ISLAND_PHASE1.md「セーブの引き継ぎ」）。
 * 開放済みのパネルはそのまま。研究パネルになったパネルのレベル上げぶんは Lv1 に戻し、払ったお金を資金に（✨ で払ったぶんは RP に）戻す。
 * 持っていた ✨ は 1 ✨ = RP_PER_DUST の RP に。開始時の 30 RP は足さない。Uncommon に出店済みなら調査依頼状を持っている
 */
export function migrateDig(s: P1State, dust: number) {
  let refund = 0;
  let dustBack = 0;
  const lv = { ...(s.skillLv ?? {}) };
  for (const id of s.skills) {
    const k = SKILL[id];
    const n = lv[id] ?? 1;
    if (!k || !isResearch(k) || n <= 1) continue;
    for (let x = 2; x <= n; x++) {
      if (k.big) dustBack += OLD_DUST[skillTier(k)] + x - 1;
      else refund += levelCost(k, x);
    }
    delete lv[id];
  }
  s.skillLv = lv;
  if (refund > 0) {
    s.money += refund;
    book(s, 'other', refund);
  }
  s.rp = (dust + dustBack) * RP_PER_DUST;
  const uIn = s.tier === 'U' || (s.land?.mine ?? []).some((id) => SECTORS.find((x) => x.id === id)?.tier === 'U');
  s.letters = uIn ? ['U'] : [];
  s.presented = [];
  s.research = {};
  s.tablets = [];
  delete (s as { dust?: number }).dust;
  s.v = 2;
}
