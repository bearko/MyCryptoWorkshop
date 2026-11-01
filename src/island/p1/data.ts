/**
 * フェーズ 1「新天地で実績を上げろ」の数値（docs/ISLAND_PHASE1.md）。
 * 素材 → クラフト → 運搬 → 陳列 → 販売。商品は MCH の Common エクステ 5 シリーズ。
 */
import { allSeries } from '../../game/catalog';
import { t } from '../../i18n';
import { OUTER_SKILLS } from './skillsx';

export type Mat = 'iron' | 'wood' | 'clay' | 'glass' | 'cloth' | 'paper' | 'gem';
export const MAT_KEYS: Mat[] = ['iron', 'wood', 'clay', 'glass', 'cloth', 'paper', 'gem'];

export interface MatDef {
  name: string;
  price: number;
  /** 最初から買える */
  open: boolean;
  /** 自力でルートを開拓するのにかかる日数（開拓の適性 1.0 のとき） */
  exploreDays: number;
}

export const MATS: Record<Mat, MatDef> = {
  iron: { name: t('鉄', 'Iron'), price: 150, open: true, exploreDays: 0 },
  wood: { name: t('木材', 'Wood'), price: 60, open: true, exploreDays: 0 },
  clay: { name: t('粘土', 'Clay'), price: 50, open: true, exploreDays: 0 },
  glass: { name: t('ガラス', 'Glass'), price: 600, open: true, exploreDays: 0 },
  cloth: { name: t('布', 'Cloth'), price: 180, open: false, exploreDays: 10 },
  paper: { name: t('紙', 'Paper'), price: 100, open: false, exploreDays: 10 },
  gem: { name: t('宝石', 'Gems'), price: 120, open: false, exploreDays: 20 },
};

export const START_MATS: Partial<Record<Mat, number>> = { iron: 10, wood: 24, clay: 12, glass: 9 };

export type Rar = 'C' | 'U';

/** 商品を作るのに要る「技」（スキルツリーの技の枝。スキルの id は 't_' + 技） */
export type TechKey = 'wood' | 'paper' | 'metal' | 'glass' | 'clay' | 'textile' | 'jewel';
export const techSkill = (k: TechKey) => `t_${k}`;

export interface ProductDef {
  /** シリーズの key（catalog.json の series.key） */
  key: string;
  name: string;
  /** Common と Uncommon のエクステの id（絵と名前） */
  ext: Record<Rar, number>;
  price: number;
  /** 1 回のクラフト（1 ロット）でできる数（Common。Uncommon はその半分） */
  batch: number;
  /** クラフトの日数（製造の適性 1.0 のとき） */
  days: number;
  recipe: Record<Rar, Partial<Record<Mat, number>>>;
  /** エリアの月の需要（個）。新しいお店は認知度のぶんしか売れない */
  demand: number;
  /** 作るのに要る「技」（スキルツリーの技の枝）。無ければ基礎の商品（最初から作れる） */
  tech?: TechKey;
  /** この商品が主役になる最小のランク（無ければ C）。それより下のセクタでは需要が無く、市場データにも出さない */
  tier?: Tier;
  /** 復刻品（発掘 v2 の 3 段目）：もとの遺物（エクステの id）・作るランク（出たセクタのランク）。docs/ISLAND_PHASE1.md「3. 復刻品」 */
  relic?: { ext: number; rank: Rar };
}

export const PRODUCTS: ProductDef[] = [
  // 基礎の 5 つ（最初から作れる。最初の町タオックスで売れる）
  { key: 'Sensu', name: t('センス', 'Sensu'), ext: { C: 1032, U: 2032 }, price: 900, batch: 4, days: 3, recipe: { C: { wood: 6 }, U: { wood: 6, paper: 4 } }, demand: 20 },
  { key: 'Mallet', name: t('マレット', 'Mallet'), ext: { C: 1073, U: 2073 }, price: 1100, batch: 4, days: 4, recipe: { C: { wood: 4, iron: 2 }, U: { wood: 4, iron: 4, gem: 1 } }, demand: 12 },
  { key: 'Node-Doll', name: t('ノード・ドール', 'Node-Doll'), ext: { C: 1107, U: 2107 }, price: 1400, batch: 3, days: 4, recipe: { C: { clay: 6, glass: 1 }, U: { clay: 6, cloth: 4 } }, demand: 8 },
  { key: 'Lantern', name: t('ランタン', 'Lantern'), ext: { C: 1150, U: 2150 }, price: 1300, batch: 4, days: 4, recipe: { C: { iron: 2, glass: 3 }, U: { iron: 4, glass: 4, gem: 1 } }, demand: 30 },
  { key: 'Scissors', name: t('鋏', 'Scissors'), ext: { C: 1171, U: 2171 }, price: 1000, batch: 4, days: 3, recipe: { C: { iron: 5 }, U: { iron: 5, gem: 1 } }, demand: 22 },
  // 技が要る 12（docs/ISLAND_PHASE1.md「商品と技」。セクタごとの「まだ誰も売っていない」商品）
  { key: 'Chair', name: t('椅子', 'Chair'), ext: { C: 1170, U: 2170 }, price: 1500, batch: 3, days: 4, recipe: { C: { wood: 8, cloth: 2 }, U: { wood: 8, cloth: 2, paper: 2 } }, demand: 14, tech: 'wood' },
  { key: 'Parasol', name: t('傘', 'Parasol'), ext: { C: 1190, U: 2190 }, price: 1200, batch: 4, days: 3, recipe: { C: { wood: 3, paper: 6 }, U: { wood: 3, paper: 6, gem: 1 } }, demand: 18, tech: 'paper' },
  { key: 'Knife', name: t('ナイフ', 'Knife'), ext: { C: 1048, U: 2048 }, price: 1100, batch: 4, days: 3, recipe: { C: { iron: 6 }, U: { iron: 6, gem: 1 } }, demand: 16, tech: 'metal' },
  { key: 'Compass', name: t('コンパス', 'Compass'), ext: { C: 1156, U: 2156 }, price: 1600, batch: 4, days: 4, recipe: { C: { iron: 3, glass: 3 }, U: { iron: 3, glass: 3, gem: 1 } }, demand: 10, tech: 'metal' },
  { key: 'Goblet', name: t('ゴブレット', 'Goblet'), ext: { C: 1030, U: 2030 }, price: 1700, batch: 4, days: 4, recipe: { C: { glass: 5 }, U: { glass: 5, gem: 1 } }, demand: 10, tech: 'glass' },
  { key: 'Monocle', name: t('モノクル', 'Monocle'), ext: { C: 1102, U: 2102 }, price: 1300, batch: 4, days: 3, recipe: { C: { glass: 3, iron: 1 }, U: { glass: 3, iron: 1, gem: 1 } }, demand: 12, tech: 'glass' },
  { key: 'Moai', name: t('モアイ', 'Moai'), ext: { C: 1106, U: 2106 }, price: 1000, batch: 3, days: 4, recipe: { C: { clay: 10 }, U: { clay: 10, paper: 2 } }, demand: 14, tech: 'clay' },
  { key: 'JapaneseDoll', name: t('日本人形', 'Japanese Doll'), ext: { C: 1127, U: 2127 }, price: 1800, batch: 3, days: 4, recipe: { C: { clay: 5, cloth: 4, paper: 1 }, U: { clay: 5, cloth: 4, paper: 1, gem: 1 } }, demand: 9, tech: 'clay' },
  { key: 'Ribbon', name: t('リボン', 'Ribbon'), ext: { C: 1110, U: 2110 }, price: 900, batch: 4, days: 3, recipe: { C: { cloth: 5 }, U: { cloth: 5, paper: 2 } }, demand: 22, tech: 'textile' },
  { key: 'Hat', name: t('ハット', 'Hat'), ext: { C: 1059, U: 2059 }, price: 1400, batch: 3, days: 4, recipe: { C: { cloth: 6, paper: 2 }, U: { cloth: 6, paper: 2, gem: 1 } }, demand: 12, tech: 'textile' },
  { key: 'Quill', name: t('ペン', 'Quill'), ext: { C: 1003, U: 2003 }, price: 800, batch: 4, days: 3, recipe: { C: { paper: 4, iron: 1 }, U: { paper: 4, iron: 1, gem: 1 } }, demand: 24, tech: 'paper' },
  { key: 'MusicBox', name: t('オルゴール', 'Music Box'), ext: { C: 1165, U: 2165 }, price: 2600, batch: 3, days: 4, recipe: { C: { wood: 4, iron: 3, gem: 1 }, U: { wood: 4, iron: 3, gem: 1, paper: 2 } }, demand: 6, tech: 'jewel', tier: 'U' },
];
/**
 * 商品の定義（キー → 定義）。いまの 17 商品に、復刻品（RELICS。下の「復刻品」）も入る。
 * 商品を引くときは productOf（ここ 1 か所の入口）。会社で開いた復刻品だけの一覧は model.ts の productsOf
 */
export const PRODUCT: Record<string, ProductDef> = Object.fromEntries(PRODUCTS.map((p) => [p.key, p]));
export const productOf = (key: string): ProductDef | undefined => PRODUCT[key];

/** Uncommon は値段 2.5 倍、売り場での強さ 1.3 倍。作るには工房の設備と製造の適性 60 以上が要る */
export const UNCOMMON = { price: 2.5, pull: 1.3, minCraft: 31 };

/** 商品の番号（シリーズとレアリティ） */
export type Sku = `${string}:${Rar}`;
export const sku = (key: string, r: Rar): Sku => `${key}:${r}`;
export const skuParts = (s: Sku): [string, Rar] => s.split(':') as [string, Rar];
export const skuPrice = (s: Sku) => {
  const [k, r] = skuParts(s);
  return Math.round(PRODUCT[k].price * (r === 'U' ? UNCOMMON.price : 1));
};

// ---------------------------------------------------------------- 同業他社（同じエリアの物販）

export interface RivalDef {
  id: string;
  name: string;
  /** 扱っている商品と売り場での強さ */
  sells: Partial<Record<string, number>>;
  /** エクステ以外の売上（月） */
  base: number;
  /** 地図に置く店（建物の id） */
  store: string;
  /** 利益率（調査で分かる） */
  margin: number;
}

export const RIVALS: RivalDef[] = [
  { id: 'lamp', name: t('ランタン堂', 'Lantern House'), sells: { Lantern: 1.6, Scissors: 1.5 }, base: 7000, store: 'import', margin: 0.18 },
  { id: 'kane', name: t('カネモノ商会', 'Kanemono Trading'), sells: { Lantern: 1, Mallet: 1 }, base: 9000, store: 'general_store', margin: 0.12 },
  { id: 'hibana', name: t('ヒバナ雑貨', 'Hibana Goods'), sells: { Scissors: 1, 'Node-Doll': 1 }, base: 8000, store: 'greengrocer', margin: 0.15 },
  { id: 'marumi', name: t('マルミ商店', 'Marumi Store'), sells: { Lantern: 1 }, base: 6000, store: 'watch', margin: 0.08 },
];

/** ライバルが月ごとに強くなる割合と、自社が独り占めしている商品に新しく参入するまでの月数 */
export const RIVAL_GROWTH = 0.012;
export const ENTRY_AFTER = 4;
/** エリアの需要の伸び（月）。他社の「エクステ以外の売上」もこれと同じだけ伸びる（市場より速くは伸びない） */
export const MARKET_GROWTH = 0.015;
/**
 * 他社の伸びと撤退（docs/ISLAND_PHASE1.md「同業他社」）。
 * pullCap：売り場の強さは RIVAL_GROWTH ずつ伸びるが、扱い始めたときの pullCap 倍で頭打ち（市場より速く強くなり続けない）。
 * 追随で入った商品は、その月の売上がその商品の市場（自社＋他社）の weakShare 未満の月が weakMonths 続くと撤退する。
 */
export const RIVAL = { pullCap: 1.3, weakShare: 0.15, weakMonths: 3 };

// ---------------------------------------------------------------- 建てられる建物

export interface P1Building {
  id: string;
  kind: 'workshop' | 'shop' | 'food' | 'warehouse' | 'depot' | 'fun' | 'big' | 'museum';
  cost: number;
  days: number;
  upkeep: number;
  /** 棚の数（並べられる商品の種類） */
  shelves?: number;
  /** 売り場での強さ */
  pull?: number;
  /** 最初から建てられる。false ならスキルで解放（requires） */
  requires?: string;
  /** 準備中（フェーズ 1 では建てられない） */
  soon?: boolean;
}

export const P1_BUILDINGS: P1Building[] = [
  { id: 'workshop', kind: 'workshop', cost: 0, days: 4, upkeep: 800 },
  { id: 'general_store', kind: 'shop', cost: 3000, days: 5, upkeep: 1200, shelves: 1, pull: 1 },
  { id: 'warehouse', kind: 'warehouse', cost: 4000, days: 5, upkeep: 600 },
  { id: 'logistics', kind: 'depot', cost: 6000, days: 6, upkeep: 900, requires: 'hub' },
  { id: 'import', kind: 'shop', cost: 8000, days: 8, upkeep: 2000, shelves: 2, pull: 1.15, requires: 'shop2' },
  { id: 'boutique', kind: 'shop', cost: 15000, days: 10, upkeep: 3200, shelves: 2, pull: 1.35, requires: 'shop3' },
  { id: 'ramen', kind: 'food', cost: 1800, days: 6, upkeep: 300, soon: true },
  { id: 'cafe', kind: 'food', cost: 1800, days: 6, upkeep: 300, soon: true },
  { id: 'bakery', kind: 'food', cost: 1600, days: 6, upkeep: 300, soon: true },
  { id: 'arcade', kind: 'fun', cost: 12000, days: 10, upkeep: 1500, soon: true },
  { id: 'amusement', kind: 'fun', cost: 40000, days: 20, upkeep: 5000, soon: true },
  { id: 'factory', kind: 'big', cost: 60000, days: 20, upkeep: 6000, soon: true },
  { id: 'harbor', kind: 'big', cost: 120000, days: 30, upkeep: 9000, soon: true },
  // 遺物の展示館（発掘 v2 の 4 段目）：復興した土地にだけ・会社で 1 つ。値段はブティック（Common の大きめの建物）と同じくらい
  { id: 'museum', kind: 'museum', cost: 15000, days: 10, upkeep: 600 },
];

/**
 * 建築の一覧のカテゴリ（タブ）。建てられる建物（資金だけが足りないものも含む）が 1 つも無いカテゴリはロック。
 * 1 つ以上建てられるようになったら、ロックが外れる演出（Flags.buildCats に見たカテゴリを覚える）。
 */
export const BUILD_CATS: { id: string; name: string; icon: string; ids: string[] }[] = [
  { id: 'base', name: t('本店', 'Head office'), icon: '🏠', ids: ['workshop'] },
  { id: 'shop', name: t('お店', 'Shops'), icon: '🛍️', ids: ['general_store', 'import', 'boutique'] },
  { id: 'logi', name: t('物流・倉庫', 'Logistics'), icon: '📦', ids: ['warehouse', 'logistics'] },
  { id: 'food', name: t('飲食', 'Food'), icon: '🍜', ids: ['ramen', 'cafe', 'bakery'] },
  { id: 'fun', name: t('娯楽', 'Leisure'), icon: '🎡', ids: ['arcade', 'amusement'] },
  { id: 'big', name: t('大型施設', 'Large sites'), icon: '🏭', ids: ['factory', 'harbor'] },
  // 発掘 v2 の 4 段目：復興した土地ができると開く
  { id: 'relic', name: t('遺物', 'Relics'), icon: '🏛', ids: ['museum'] },
];
export const P1B: Record<string, P1Building> = Object.fromEntries(P1_BUILDINGS.map((b) => [b.id, b]));

// ---------------------------------------------------------------- 従業員

export type Task = 'craft' | 'transport' | 'shop' | 'explore' | 'intel' | 'buy' | 'side' | 'manager' | 'train' | 'dig';
export const TASKS: { key: Task; name: string; note: string }[] = [
  { key: 'craft', name: t('製造', 'Craft'), note: t('3 つの能力のバランス', 'Balance of all three stats') },
  { key: 'transport', name: t('運搬', 'Haul'), note: t('PHY 重視', 'Mostly PHY') },
  { key: 'shop', name: t('販売', 'Sell'), note: t('INT 重視', 'Mostly INT') },
  { key: 'explore', name: t('開拓', 'Scout'), note: t('AGI 重視', 'Mostly AGI') },
  { key: 'intel', name: t('調査', 'Research'), note: t('INT と AGI', 'INT and AGI') },
  { key: 'buy', name: t('調達', 'Buying'), note: t('INT 寄りのバランス', 'Balanced, a bit more INT') },
];

export interface Stats {
  hp: number;
  phy: number;
  int: number;
  agi: number;
}

/**
 * 作業の適性（0〜100）。能力値は MCH の値を、全ヒーロー中の最大が 100 になるように縮めたもの（`model.ts` の heroStats）。
 * 見習いの MCHアーティストの製造が約 28、コモンの得意な仕事が 40〜55、レジェンダリーで 80〜88。
 */
export function aptitude(s: Stats, task: Task): number {
  switch (task) {
    case 'craft':
      return 0.5 * Math.min(s.phy, s.int, s.agi) + 0.5 * ((s.phy + s.int + s.agi) / 3);
    case 'transport':
      return 0.6 * s.phy + 0.4 * s.agi;
    case 'shop':
      return 0.6 * s.int + 0.4 * s.agi;
    case 'explore':
      return 0.5 * s.agi + 0.25 * s.phy + 0.25 * s.int;
    case 'intel':
      return 0.5 * s.int + 0.5 * s.agi;
    case 'buy':
      return 0.4 * s.int + 0.3 * s.phy + 0.3 * s.agi;
    case 'side':
      // 他店でのバイト：売り場の仕事なので販売と同じ
      return 0.6 * s.int + 0.4 * s.agi;
    case 'manager':
      // セクタマネージャー：能力値の合計（平均）
      return (s.phy + s.int + s.agi) / 3;
    case 'train':
      // 技の修行：製造と同じ
      return 0.5 * Math.min(s.phy, s.int, s.agi) + 0.5 * ((s.phy + s.int + s.agi) / 3);
    case 'dig':
      // 発掘：力仕事が中心（docs/ISLAND_PHASE1.md「地層の発掘と研究ポイント」）
      return 0.6 * s.phy + 0.2 * s.agi + 0.2 * s.int;
  }
}

export const START_STAFF = [10001, 10002, 10003];

/**
 * 他店でバイト（資金が尽きたときの助け）。ヒーローを他社のお店で働かせ、1 日 pay × 販売の速さ を受け取る。
 * 毎日 grow の確率で、能力値（INT・AGI・PHY のどれか）が 1 上がる。資金が rescue 以下になるとマインちゃんが紹介する。
 */
export const SIDE = { pay: 180, grow: 0.04, rescue: 10000 };
/**
 * 関所（ランドのふち）。通行料を払うと開通し、次のランドセクタへ行けるようになる。
 * 通行料 ＝ このエリアで 1 位の他社の先月の売上 × mult（round G 単位で切り上げ）。倍率はテストプレイで決める。
 * at は置く場所の目安（東のふち、横の道路の出口のそば）。
 */
export const GATE = { mult: 1, round: 1000, at: [15, 8] as [number, number] };

/**
 * ブランド力（0〜max）。ランドセクタで 1 位になったり、実績を上げると上がり、順位が大きく下がったり不祥事で下がる。
 * 売り場の強さが brand × pullPer だけ上がる（最大 pullCap）。スキルツリーにブランド力が要るパネルがある。
 */
export const BRAND = {
  max: 999,
  log: 30,
  pullPer: 0.001,
  pullCap: 0.3,
  /** 上がるとき */
  firstSale: 5,
  sectorTop: 30,
  stayTop: 5,
  rankUp: 2,
  mission: 3,
  uncommon: 4,
  gate: 10,
  enter: { C: 5, U: 15, R: 25, E: 40, L: 60 } as Record<Tier, number>,
  adsSkill: 2,
  /** ランド制覇（そのランクのセクタすべてで 1 位） */
  landClear: 20,
  /** 下がるとき：順位が 2 つ以上下がったら、下がった数 × rankDown */
  rankDown: 6,
  /** 不祥事（妨害工作がばれた など。いまはまだ起きない） */
  scandal: 60,
};

/** ランドセクタのランク（地図の広さ・他社の強さ・お客さんの多さ・Common の商品の売れにくさ・出店許可申請の費用） */
export type Tier = 'C' | 'U' | 'R' | 'E' | 'L';
export const TIERS: Record<Tier, { n: number; rival: number; demand: number; commonPull: number; color: string }> = {
  C: { n: 16, rival: 1, demand: 1, commonPull: 1, color: '#b8c0d4' },
  U: { n: 21, rival: 2.2, demand: 2, commonPull: 0.55, color: '#7ee08f' },
  R: { n: 21, rival: 3.5, demand: 3, commonPull: 0.35, color: '#6fc6f0' },
  E: { n: 26, rival: 5, demand: 4.5, commonPull: 0.25, color: '#b49bff' },
  L: { n: 26, rival: 8, demand: 7, commonPull: 0.15, color: '#ffd257' },
};
/**
 * セクタの個性（docs/ISLAND_PHASE1.md「ランドマップとセクタ」）。
 * 同じランクでも、他社・売れ筋・特産・地形がセクタごとに違う。
 */
export interface SectorProfile {
  /** このセクタの同業他社（4 社）。無ければ RIVALS（最初のセクタ・タオックス） */
  rivals?: RivalDef[];
  /** 商品ごとの需要の倍率（無い商品は 1。gap の商品は 1.4〜1.8） */
  demand?: Partial<Record<string, number>>;
  /**
   * このセクタで「まだ誰も売っていない」勝ち筋の商品（2〜3 つ）。他社の sells には入れない。
   * 市場データ・マインちゃんのおすすめ（recommend）はここから選ぶ。最初の町タオックスはセンスと鋏（基礎の商品が売れる）
   */
  gap?: string[];
  /** 飽和（他社 2 社以上が扱う商品の売れにくさ）を掛けない。最初の町だけ（チュートリアルの売れ方を変えない） */
  noSaturation?: boolean;
  /** 特産：この素材が 20% 安い */
  cheap?: Mat[];
  /** 最初から全部のルート（紙・布・宝石）が開いている */
  routesOpen?: boolean;
  /** 最初からこのルートだけ開いている（routesOpen の一部だけ版） */
  routes?: Mat[];
  /** 住宅の数の倍率（町の大きさ。populate の住宅数に掛ける） */
  homes?: number;
  /** 他社のエクステ以外の月の売上の倍率（商売敵の強さ） */
  rivalMul?: number;
  /** 運ぶ日数の倍率（坂道 1.2 など） */
  haul?: number;
  /** 宣伝の効き目の倍率 */
  ads?: number;
  /** ランドマップに出す一言の特徴 */
  tag: string;
  /**
   * 到着の案内（マインちゃん 3 枚：目標 → リサーチ（市場データを開くボタン付き）→ 最初の一手）。
   * {top} は 1 位の他社の月の売上の見込みに置き換える。Uncommon の 3 枚目は「魔法の釜」がまだのときの文（あれば工房の文になる）
   */
  intro: string[];
}
/** 特産の素材の値引き */
export const CHEAP_RATE = 0.8;

export interface SectorDef {
  id: string;
  tier: Tier;
  name: string;
  /** 出店許可申請の費用（入国料） */
  fee: number;
  /** ランドマップの上の位置（0〜100） */
  at: [number, number];
  /**
   * つながった地図の上の位置（同じランクの階層の中。gx はマスの i の向き、gy は j の向き）。
   * 上下左右に 1 違いのセクタが隣どうし（斜めは隣ではない）。ランクが違えば別の階層で、つながらない。
   */
  grid: [number, number];
  /** 雲に覆われていて、まだ行けない */
  cloud?: boolean;
  /** 開放の条件：そのランクのセクタに n 個以上出店 */
  need?: { tier: Tier; n: number };
  /** 開放されても、まだ遊べない（準備中） */
  soon?: boolean;
  /** セクタの個性 */
  profile: SectorProfile;
  /** ランドマップの説明に添える予告（準備中のセクタ） */
  teaser?: string;
}

const rv = (id: string, name: string, sells: Partial<Record<string, number>>, base: number, store: string, margin: number): RivalDef => ({ id, name, sells, base, store, margin });
/** 3 枚目（最初の一手）：工房から */
const FIRST_WS = t('まずは[[工房]]を建て直そう。建物はセクタごとだよ。', 'First, rebuild your [[workshop]]. Buildings belong to each sector.');
/** Uncommon の 3 枚目：魔法の釜がまだのとき */
const FIRST_POT = t('スキルツリーの[[魔法の釜]]を開放すると[[商品開発]]ができるよ。まずは[[工房]]からね。', 'Unlock the [[Magic pot]] in the skill tree to do [[product development]]. Start with the [[workshop]].');

/** 2 枚目（リサーチ）：基礎の商品はもう他店が売っている → 市場データで、まだ誰も売っていない商品を探す */
const RESEARCH = t('この町では[[センス]]や[[鋏]]はもう他店が売っている。[[市場データ]]で、まだ誰も売っていない商品を探そう！', 'Here, other shops already sell [[Sensu]] and [[Scissors]]. Use the [[market data]] to find goods nobody sells yet!');
const RESEARCH_U = t('ここは Uncommon ランドで、基礎の商品はもう他店が売っている。[[市場データ]]で、まだ誰も売っていない商品を探して[[アンコモン]]にしよう！', 'This is an Uncommon land, and other shops already sell the basic goods. Use the [[market data]] to find goods nobody sells yet, and make them [[Uncommon]]!');
/** 到着の案内の 2 枚目（リサーチ）か。main.ts が「市場データを開く」ボタンを付ける */
export const isResearchPage = (text: string) => text === RESEARCH || text === RESEARCH_U;

/** 1 枚目（目標）：ようこそ ＋ エリア 1 位 ＋ 1 位の他社の月の売上（{top}） */
const goal = (name: string) =>
  t(`[[${name}]]へようこそ！ 目標は[[2 か月続けてエリア 1 位]]、他社 4 社のうち 1 位の月の売上は約 {top} だよ。`, `Welcome to [[${name}]]! The goal: [[#1 in the area two months running]]. There are 4 rivals; the leader makes about {top} a month.`);

/**
 * ランド「はじまりの国 Lime」の 21 セクタ（docs/ISLAND_PHASE1.md「ランドマップとセクタ」）。
 * id はセーブと繋がるので変えない（c1〜c3・u1〜u2・r1・e1・l1 は前からある id）。
 * at：ランドマップの位置（0〜100）。つながった地図の grid に合わせて、下から Common 2 段（4＋4。列＝gx・段＝gy）・Uncommon 3＋2・Rare 2＋2・Epic 3。
 * Legendary は Rare の 2 段目のあいだ（ランドの真ん中の都）。札が重ならないよう、同じ段は横に 19% 以上、段は縦に 13% 以上あける。
 */
export const SECTORS: SectorDef[] = [
  // ---------------------------------------------------------------- Common（下の段：c1〜c4）
  // gap：まだ誰も売っていない商品（他社の sells に入れない）。センスと鋏は、タオックスの外ではどこも他社 2 社以上が扱う（飽和）
  {
    id: 'c1',
    tier: 'C',
    name: t('タオックス', 'Taox'),
    fee: 0,
    at: [13, 89],
    grid: [0, 0],
    profile: { tag: t('はじまりの町。センスとランタンがよく売れる', 'Where it all begins. Sensu and Lanterns sell well'), intro: [], gap: ['Sensu', 'Scissors'], noSaturation: true },
  },
  {
    id: 'c2',
    tier: 'C',
    name: t('ユーホタウン', 'Yuho Town'),
    fee: 5000,
    at: [37, 89],
    grid: [1, 0],
    profile: {
      rivals: [
        rv('kohan', t('湖畔ガラス', 'Lakeshore Glass'), { Lantern: 1.7, Scissors: 1 }, 9500, 'import', 0.18),
        rv('mizube', t('ミズベ商店', 'Mizube Store'), { Lantern: 1, Sensu: 1 }, 7000, 'general_store', 0.12),
        rv('watashi', t('渡し場雑貨', 'Ferry Goods'), { 'Node-Doll': 1.4, Scissors: 1.2 }, 6500, 'greengrocer', 0.14),
        rv('yoshino', t('ヨシノ工芸', 'Yoshino Crafts'), { Sensu: 1.3, Mallet: 0.8 }, 8000, 'watch', 0.1),
      ],
      gap: ['Goblet', 'Monocle'],
      demand: { Goblet: 1.6, Monocle: 1.5 },
      cheap: ['glass', 'clay'],
      tag: t('湖の町。ガラスと粘土が安く、ガラス細工を売る店がまだない', 'A lake town. Glass and clay are cheap, and no one sells glasswork yet'),
      intro: [goal(t('ユーホタウン', 'Yuho Town')), RESEARCH, FIRST_WS],
    },
  },
  {
    id: 'c3',
    tier: 'C',
    name: t('リデル・ヒルズ', 'Riddle Hills'),
    fee: 6000,
    at: [13, 75],
    grid: [0, 1],
    profile: {
      rivals: [
        rv('fusha', t('風車堂', 'Windmill House'), { Mallet: 1.5, Scissors: 1.2 }, 7500, 'import', 0.16),
        rv('okaue', t('丘の上雑貨', 'Hilltop Goods'), { Sensu: 1, Mallet: 1 }, 8000, 'general_store', 0.12),
        rv('kazami', t('カザミ金物', 'Kazami Hardware'), { Scissors: 1.6, Lantern: 0.8 }, 9000, 'greengrocer', 0.15),
        rv('hane', t('ハネ商店', 'Hane Store'), { Mallet: 0.8, Sensu: 1 }, 5500, 'watch', 0.08),
      ],
      gap: ['Knife', 'Compass'],
      demand: { Knife: 1.6, Compass: 1.5 },
      cheap: ['iron'],
      haul: 1.2,
      tag: t('金物好きの丘の町。鉄が安く、坂道で運ぶのに時間がかかる', 'A hill town that loves hardware. Iron is cheap; slopes slow hauling'),
      intro: [goal(t('リデル・ヒルズ', 'Riddle Hills')), RESEARCH, FIRST_WS],
    },
  },
  {
    id: 'c4',
    tier: 'C',
    name: t('キッチョムシティ', 'Kitchom City'),
    fee: 8000,
    at: [37, 75],
    grid: [1, 1],
    profile: {
      rivals: [
        rv('kitcho', t('キッチョム雑貨', 'Kitchom Goods'), { Sensu: 1.3, Scissors: 1.1 }, 8500, 'import', 0.15),
        rv('machida', t('よろず屋マチダ', 'Machida General'), { Sensu: 1, Mallet: 1, Lantern: 0.8 }, 9000, 'general_store', 0.12),
        rv('tsumugi', t('ツムギ生活館', 'Tsumugi Living'), { Scissors: 1.3, 'Node-Doll': 1, Ribbon: 1.2 }, 7500, 'greengrocer', 0.14),
        rv('komono', t('コモノ堂', 'Komono-do'), { Sensu: 1.2, Ribbon: 1 }, 6000, 'watch', 0.1),
      ],
      gap: ['Chair', 'Hat'],
      demand: { Chair: 1.6, Hat: 1.5 },
      homes: 1.3,
      tag: t('人が多い町。暮らしの品はそろっているが、家具と帽子の店がない', 'A busy town. Everyday goods abound, but no one sells furniture or hats'),
      intro: [goal(t('キッチョムシティ', 'Kitchom City')), RESEARCH, FIRST_WS],
    },
  },
  // ---------------------------------------------------------------- Common（上の段：c5〜c8）
  {
    id: 'c5',
    tier: 'C',
    name: t('オマツリタウン', 'Omatsuri Town'),
    fee: 8000,
    at: [63, 89],
    grid: [2, 0],
    profile: {
      rivals: [
        rv('yatai', t('屋台通り商会', 'Stall Street Trading'), { Lantern: 1.4, Sensu: 1.2 }, 8000, 'import', 0.16),
        rv('mikoshi', t('ミコシ屋', 'Mikoshiya'), { Sensu: 1.5, Scissors: 1 }, 7000, 'general_store', 0.13),
        rv('akari', t('提灯のアカリ', 'Akari Lanterns'), { Lantern: 1.6 }, 8500, 'greengrocer', 0.15),
        rv('hayashi', t('ハヤシ雑貨', 'Hayashi Goods'), { Scissors: 1, Mallet: 0.8 }, 6000, 'watch', 0.09),
      ],
      gap: ['Parasol', 'Quill'],
      demand: { Parasol: 1.7, Quill: 1.5 },
      ads: 1.4,
      tag: t('お祭りの町。宣伝がよく効き、紙の品を売る店がまだない', 'A festival town. Ads work well, and no one sells paper goods yet'),
      intro: [goal(t('オマツリタウン', 'Omatsuri Town')), RESEARCH, FIRST_WS],
    },
  },
  {
    id: 'c6',
    tier: 'C',
    name: t('ジラ・カントリー', 'Zira Country'),
    fee: 7000,
    at: [63, 75],
    grid: [2, 1],
    profile: {
      rivals: [
        rv('kikori', t('きこり商店', 'Woodcutter Store'), { Mallet: 1.3, Sensu: 1 }, 6500, 'import', 0.14),
        rv('hatake', t('ハタケ雑貨', 'Hatake Goods'), { Scissors: 1.1, Sensu: 0.9 }, 6000, 'general_store', 0.12),
        rv('bokujo', t('牧場の店', 'Ranch Shop'), { 'Node-Doll': 1.2, Lantern: 0.8 }, 5500, 'greengrocer', 0.11),
        rv('zira', t('ジラ金物', 'Zira Hardware'), { Mallet: 1, Scissors: 1 }, 7000, 'watch', 0.13),
      ],
      gap: ['Moai', 'Chair'],
      demand: { Moai: 1.6, Chair: 1.4 },
      cheap: ['wood'],
      homes: 0.8,
      haul: 1.1,
      tag: t('のどかな田舎。木材が安いが、お客さんは少なめ', 'Quiet countryside. Wood is cheap, but customers are fewer'),
      intro: [goal(t('ジラ・カントリー', 'Zira Country')), RESEARCH, FIRST_WS],
    },
  },
  {
    id: 'c7',
    tier: 'C',
    name: t('サクラコシティ', 'Sakurako City'),
    fee: 10000,
    at: [87, 89],
    grid: [3, 0],
    profile: {
      rivals: [
        rv('hanami', t('花見堂', 'Hanami-do'), { Sensu: 1.5, Lantern: 1 }, 8500, 'import', 0.17),
        rv('washi', t('サクラ和紙店', 'Sakura Paper Shop'), { Sensu: 1.2, Quill: 1.2 }, 7000, 'general_store', 0.13),
        rv('hinaya', t('ひな人形のヒナヤ', 'Hinaya Dolls'), { 'Node-Doll': 1.5, Scissors: 1 }, 7500, 'greengrocer', 0.15),
        rv('harukaze', t('春風商店', 'Spring Breeze Store'), { Scissors: 1, Mallet: 1, Quill: 0.8 }, 6500, 'watch', 0.1),
      ],
      gap: ['Parasol', 'JapaneseDoll'],
      demand: { Parasol: 1.6, JapaneseDoll: 1.7 },
      routes: ['paper'],
      tag: t('桜の町。紙が手に入り、和の品がまだ足りない', 'A cherry-blossom town. Paper is on sale; traditional goods are scarce'),
      intro: [goal(t('サクラコシティ', 'Sakurako City')), RESEARCH, FIRST_WS],
    },
  },
  {
    id: 'c8',
    tier: 'C',
    name: t('ペストタウン', 'Pest Town'),
    fee: 12000,
    at: [87, 75],
    grid: [3, 1],
    profile: {
      rivals: [
        rv('gekiyasu', t('ゲキヤス本舗', 'Gekiyasu Honpo'), { Sensu: 1.2, Scissors: 1.2, Lantern: 1.2 }, 10000, 'import', 0.08),
        rv('nendo', t('ネンド工房ショップ', 'Nendo Studio Shop'), { 'Node-Doll': 1.5, Mallet: 1 }, 8000, 'general_store', 0.14),
        rv('tenbin', t('天秤商会', 'Tenbin Trading'), { Mallet: 1.3, Lantern: 1.2, Sensu: 1 }, 9000, 'greengrocer', 0.12),
        rv('kuiki', t('クイキ商店', 'Kuiki Store'), { Scissors: 1.4 }, 8500, 'watch', 0.11),
      ],
      gap: ['Ribbon', 'Knife'],
      demand: { Ribbon: 1.6, Knife: 1.5 },
      cheap: ['clay'],
      rivalMul: 1.15,
      tag: t('商売敵の多い町。基礎の商品はどれも取り合い。粘土が安い', 'A town full of rivals; every basic good is contested. Clay is cheap'),
      intro: [goal(t('ペストタウン', 'Pest Town')), RESEARCH, FIRST_WS],
    },
  },
  // ---------------------------------------------------------------- Uncommon（u1〜u5）
  // 基礎の 5 つはどれも他社 2 社以上が扱う。gap の商品をアンコモンにするのが勝ち筋
  {
    id: 'u1',
    tier: 'U',
    name: t('ウメコタウン', 'Umeko Town'),
    fee: 150000,
    at: [20, 62],
    grid: [0, 0],
    profile: {
      rivals: [
        rv('ship', t('シップ商会', 'Ship Trading'), { Lantern: 1.4, Scissors: 1.4, Mallet: 1 }, 12000, 'import', 0.2),
        rv('shiokaze', t('潮風堂', 'Sea Breeze House'), { Sensu: 1.2, 'Node-Doll': 1.2 }, 10000, 'general_store', 0.14),
        rv('kowan', t('港湾雑貨', 'Harbor Goods'), { Mallet: 1.3, Lantern: 1, 'Node-Doll': 1 }, 9000, 'greengrocer', 0.15),
        rv('funanori', t('船乗りの店', 'Sailors’ Shop'), { Scissors: 1, Sensu: 1 }, 8000, 'watch', 0.1),
      ],
      gap: ['MusicBox', 'Compass'],
      demand: { MusicBox: 1.6, Compass: 1.5 },
      routesOpen: true,
      tag: t('遠くの素材（紙・布・宝石）が最初から買える港町。アンコモンの出番', 'A port where far-off materials (paper, cloth, gems) are on sale from day one. Time for Uncommons'),
      intro: [goal(t('ウメコタウン', 'Umeko Town')), RESEARCH_U, FIRST_POT],
    },
  },
  {
    id: 'u2',
    tier: 'U',
    name: t('ヤツカノタウン', 'Yatsukano Town'),
    fee: 180000,
    at: [50, 62],
    grid: [1, 0],
    profile: {
      rivals: [
        rv('kajiya', t('鍛冶屋ヤツカ', 'Yatsuka Smithy'), { Mallet: 1.5, Scissors: 1.3 }, 12000, 'import', 0.18),
        rv('hagane', t('ハガネ商会', 'Hagane Trading'), { Scissors: 1.5, Sensu: 1, Chair: 1 }, 10000, 'general_store', 0.15),
        rv('kanagu', t('金具のカナグ', 'Kanagu Fittings'), { Mallet: 1.2, Lantern: 1, 'Node-Doll': 1 }, 9000, 'greengrocer', 0.13),
        rv('tsuchiya', t('ツチ屋', 'Tsuchiya'), { Mallet: 1, Sensu: 1, Lantern: 0.8, 'Node-Doll': 0.8, Chair: 1 }, 8000, 'watch', 0.1),
      ],
      gap: ['Knife', 'MusicBox'],
      demand: { Knife: 1.7, MusicBox: 1.5 },
      cheap: ['iron'],
      tag: t('金物の町。鉄が安く、刃物と細工物がまだ足りない', 'A hardware town. Iron is cheap; blades and fine work are scarce'),
      intro: [goal(t('ヤツカノタウン', 'Yatsukano Town')), RESEARCH_U, FIRST_POT],
    },
  },
  {
    id: 'u3',
    tier: 'U',
    name: t('エムケーシティ', 'MK City'),
    fee: 220000,
    at: [80, 62],
    grid: [2, 0],
    profile: {
      rivals: [
        rv('sakaue', t('坂上百貨', 'Slopetop Department'), { Sensu: 1.2, Mallet: 1.2, 'Node-Doll': 1.2, Lantern: 1.2, Scissors: 1.2, Ribbon: 1 }, 15000, 'import', 0.22),
        rv('guild', t('ギルド商店', 'Guild Store'), { Lantern: 1.5, Mallet: 1.5 }, 12000, 'general_store', 0.16),
        rv('nobori', t('のぼり屋', 'Banner House'), { Sensu: 1.5, Ribbon: 1.2 }, 9000, 'greengrocer', 0.14),
        rv('sakashita', t('坂下金物', 'Slopefoot Hardware'), { Scissors: 1.6, 'Node-Doll': 1 }, 10000, 'watch', 0.1),
      ],
      gap: ['Hat', 'Goblet'],
      demand: { Hat: 1.6, Goblet: 1.5 },
      haul: 1.3,
      ads: 1.5,
      tag: t('商人の坂の町。宣伝がよく効くが、坂で運ぶのは遅い', 'A merchants’ hill town. Ads work well, but hauling up the slope is slow'),
      intro: [goal(t('エムケーシティ', 'MK City')), RESEARCH_U, FIRST_POT],
    },
  },
  {
    id: 'u4',
    tier: 'U',
    name: t('ゴリ・ラグズ', 'Gori Rugs'),
    fee: 260000,
    at: [35, 49],
    grid: [0, 1],
    profile: {
      rivals: [
        rv('orimono', t('織物のゴリ', 'Gori Weaves'), { 'Node-Doll': 1.5, Sensu: 1, Hat: 1 }, 12000, 'import', 0.19),
        rv('shikimono', t('敷物商会', 'Rug Trading'), { 'Node-Doll': 1.2, Lantern: 1, Mallet: 1 }, 10500, 'general_store', 0.14),
        rv('momen', t('モメン屋', 'Momenya'), { Sensu: 1.2, Scissors: 1.1, Hat: 1.2 }, 9000, 'greengrocer', 0.13),
        rv('itoyo', t('糸屋イトヨ', 'Itoyo Threads'), { Scissors: 1.3, Lantern: 1, Mallet: 0.8 }, 8000, 'watch', 0.1),
      ],
      gap: ['Ribbon', 'JapaneseDoll'],
      demand: { Ribbon: 1.6, JapaneseDoll: 1.7 },
      routes: ['cloth'],
      tag: t('織物の町。布が手に入り、リボンや人形を売る店がまだない', 'A weaving town. Cloth is on sale; no one sells ribbons or dolls yet'),
      intro: [goal(t('ゴリ・ラグズ', 'Gori Rugs')), RESEARCH_U, FIRST_POT],
    },
  },
  {
    id: 'u5',
    tier: 'U',
    name: t('ザックシティ', 'Zack City'),
    fee: 300000,
    at: [65, 49],
    grid: [1, 1],
    profile: {
      rivals: [
        rv('zack', t('ザック百貨', 'Zack Department'), { Sensu: 1.2, Mallet: 1.2, 'Node-Doll': 1.2, Lantern: 1.2, Scissors: 1.2, Knife: 1 }, 16000, 'import', 0.2),
        rv('metro', t('メトロ商会', 'Metro Trading'), { Lantern: 1.4, Scissors: 1.3, Chair: 1 }, 13000, 'general_store', 0.16),
        rv('tokai', t('トカイ雑貨', 'Tokai Goods'), { Sensu: 1.3, 'Node-Doll': 1.2, Knife: 1 }, 11000, 'greengrocer', 0.14),
        rv('ekimae', t('駅前マート', 'Station Mart'), { Mallet: 1.3, Sensu: 1, Chair: 1 }, 10000, 'watch', 0.12),
      ],
      gap: ['MusicBox', 'Monocle', 'Goblet'],
      demand: { MusicBox: 1.5, Monocle: 1.4, Goblet: 1.4 },
      homes: 1.3,
      rivalMul: 1.2,
      tag: t('Uncommon いちばんの大都市。お客さんも商売敵も多い', 'The biggest Uncommon city. Many customers, many rivals'),
      intro: [goal(t('ザックシティ', 'Zack City')), RESEARCH_U, FIRST_POT],
    },
  },
  // ---------------------------------------------------------------- Rare（r1〜r4。準備中）
  ...(
    [
      ['r1', t('グリーン・マウス', 'Green Mouse'), 600000, 0, t('緑に囲まれた栄えた町。商売敵もお客さんも桁違い', 'A thriving town in the green. Rivals and customers on another scale')],
      ['r2', t('カスミシティ', 'Kasumi City'), 700000, 1, t('霞のかかる大きな市場。他社の店が立ち並ぶ', 'A great market in the haze, lined with rival stores')],
      ['r3', t('デグノブタウン', 'Degnob Town'), 800000, 2, t('職人と商人が集まる町。他店から客を奪う勝負', 'A town of crafters and traders. Win customers from rival shops')],
      ['r4', t('ネコツ・バメ', 'Nekotsu Bame'), 900000, 3, t('港と市場が隣り合う、にぎやかな町', 'A lively town where the port meets the market')],
    ] as [string, string, number, number, string][]
  ).map(
    ([id, name, fee, k, tag]): SectorDef => ({
      id,
      tier: 'R',
      name,
      fee,
      // 2×2（r1 r2 / r3 r4）。ランドマップも 2 段に
      at: [k % 2 ? 75 : 25, k < 2 ? 36 : 23],
      grid: [k % 2, Math.floor(k / 2)],
      need: { tier: 'U', n: 2 },
      soon: true,
      profile: { tag, intro: [] },
      teaser: t('Rare では商売敵が 3.5 倍、お客さんも 3 倍。レアのエクステと、他店から客を奪う出店の出番（準備中）。', 'In Rare sectors, rivals are 3.5× and customers 3×. Time for Rare extensions and winning customers from rival shops (coming soon).'),
    }),
  ),
  // ---------------------------------------------------------------- Epic・Legendary（雲の向こう）
  { id: 'e1', tier: 'E', name: t('ヒトシタウン', 'Hitoshi Town'), fee: 0, at: [25, 10], grid: [0, 0], cloud: true, profile: { tag: t('他社を買収できる町', 'A town where you can acquire rivals'), intro: [] } },
  { id: 'e2', tier: 'E', name: t('ヌコカントリー', 'Nuko Country'), fee: 0, at: [50, 10], grid: [1, 0], cloud: true, profile: { tag: t('他社を買収できる町', 'A town where you can acquire rivals'), intro: [] } },
  { id: 'e3', tier: 'E', name: t('クリプト・サン・シティ', 'Crypto Sun City'), fee: 0, at: [75, 10], grid: [2, 0], cloud: true, profile: { tag: t('他社を買収できる町', 'A town where you can acquire rivals'), intro: [] } },
  { id: 'l1', tier: 'L', name: t('ヤマピーキングダム', 'Yamapi Kingdom'), fee: 0, at: [50, 23], grid: [0, 0], cloud: true, profile: { tag: t('ブランド力で売る、ランドいちばんの都', 'The capital of the land, won by brand power'), intro: [] } },
];

/** すべてのセクタの同業他社（id はセクタをまたいで重ならない） */
export const ALL_RIVALS: RivalDef[] = [...RIVALS, ...SECTORS.flatMap((x) => x.profile.rivals ?? [])];
/** 他社の定義（どのセクタの他社でも引ける） */
export const rivalDef = (id: string) => ALL_RIVALS.find((x) => x.id === id);
/** セクタの他社（無ければタオックスの 4 社） */
export const rivalsOf = (sector = 'c1') => SECTORS.find((x) => x.id === sector)?.profile.rivals ?? RIVALS;
/** Uncommon の 3 枚目：魔法の釜があれば工房の文 */
export const introFirstStep = (tier: Tier, hasPot: boolean) => (tier !== 'C' && !hasPot ? FIRST_POT : FIRST_WS);

/**
 * セクタマネージャー：離れたセクタを、指名したヒーローが運営する。
 * 月の売上 ＝ 離れたときの売上 ×（at0 ＋ 適性 × per。min〜max）× ゆらぎ（±noise）×（投資で伸びたぶん）。
 * 適性は能力値の平均。見習い（約 28）で 0.83、コモンの強い人（約 45）で 1.0、レジェンダリー（約 75）で 1.3。
 * 投資：利益のうち invest の割合をそのセクタへ。投資 1 G で月の売上が roi G 伸びる。
 */
export const MANAGER = { at0: 0.55, per: 0.01, min: 0.5, max: 1.4, none: 0.5, noise: 0.12, roi: 0.25, invest: 0.3, choices: [0, 0.3, 0.5, 0.8] };
/** 1 日働くとスタミナが減る量と、休むと戻る量 */
export const STAMINA = { work: 10, rest: 30, tired: 0.15, back: 0.8 };
/** 雇ったヒーローの月給（基準）。能力の合計に比例 */
export const WAGE_PER_STAT = 3;

// ---------------------------------------------------------------- 運搬・お店

/** 荷車は 1 日に道を cellsPerDay マス（遠いお店ほど運ぶ日数がかかる）。調達係は歩いて walkPerDay マス */
export const TRANSPORT = { cap: 10, cellsPerDay: 2.5, walkPerDay: 8 };

/**
 * 商圏（docs/ISLAND_PHASE1.md「商圏と出店」）。
 * 住宅と駅にお客さんが住んでいて、商品ごとの需要を持つ。お客さんは近いお店・強いお店ほど行き、
 * 遠いと「買わない」を選ぶ（outside）。お店への引き寄せ = 売り場の強さ ÷ (1 + (距離 / d0)²)。
 * - 他社の近くで同じ商品を売ると、同じお客さんの取り合い（他社の売上も減る）
 * - 自社のお店どうしを近くに置くと、自社で取り合う
 * - 散らばらせると、まだ取られていないお客さんに届くが、工房から遠くなって運ぶのに日数がかかる
 * pot：エリアの需要（PRODUCTS.demand）に掛ける倍率（お店が近くにないと買われないぶん、もとの需要より多めに持つ）
 */
export const MARKET = {
  d0: 2.5,
  outside: 0.3,
  pot: 2.2,
  rivalPull: 1.1,
  pop: { station: 6, apartment: 3, manor: 1.5, house: 1, cottage: 1, garage_house: 1, japanese_house: 1 } as Record<string, number>,
  /**
   * 他社が 2 社以上扱っている商品は「他店で供給が足りている」（飽和）。自社の売り場の引き寄せに掛ける（Uncommon の商品は satU）。
   * そのセクタの gap（まだ誰も売っていない商品）と、noSaturation のセクタ（最初の町）は除く。
   */
  saturated: 0.45,
  satU: 0.7,
  satAt: 2,
  /** 技が要る商品のうち、そのセクタの gap でないものの需要の倍率（その町ではまだあまり求められていない） */
  niche: 0.5,
  /**
   * 他社の反撃：自社がそのセクタで 1 位になった月（前月は 1 位でない）から rallyMonths か月、
   * 他社の売り場の強さが rally 倍（宣伝を始める）。docs/ISLAND_PHASE1.md「他社の反撃」
   */
  rally: 1.25,
  rallyMonths: 2,
};
/** 制覇（KGI の達成）：そのセクタで、この月数だけ続けて 1 位 */
export const TOP_STREAK = 2;
/**
 * 発掘 v2 の 5 段目：Uncommon の調査依頼状は、Common のセクタでこの数だけ研究成果を発表したら届く
 * （docs/ISLAND_PHASE1.md「お題・発表・調査依頼状」）
 */
export const LETTER_NEED = 2;
/** 物流拠点：工房 → 拠点はトラックの定期便（距離 × link）、拠点 → お店は荷車 */
export const DEPOT = { link: 0.3 };
export const SHOP = { shelfCap: 10, storageCap: 20, displayPerDay: 6, partTimeDisplay: 4, partTimeWage: 30, partTimeMax: 1, noStaff: 0 };
/** 新しいお店の認知度：開店した日は 0.2、1 日 0.02 ずつ上がって 1 まで（売れる数にかかる） */
export const AWARE = { start: 0.35, perDay: 0.025 };
/**
 * 新商品の認知（セクタごと・商品ごと。0〜1）。そのセクタで初めて並べる商品は、お客さんがまだ知らない（start）。
 * 自社のお店の棚に並んでいる日に perDay、宣伝が効いている日はさらに ad だけ育つ（並べていない日は変わらない）。
 * 売れる数（売り場の強さ）に掛ける。noSaturation のセクタ（最初の町タオックス）は全部 1（チュートリアルを変えない）
 */
export const AWARE_GOODS = { start: 0.3, perDay: 0.02, ad: 0.03, low: 0.6 };
/** 保管：工房の物置（素材と、運ぶ前の商品の合計）と、倉庫 1 つで増える数。いっぱいだと調達もクラフトもできない */
export const STORE = { base: 80, warehouse: 200 };

// ---------------------------------------------------------------- スキルツリー

/** 枝（9 本）。dig＝発掘（発掘 v2 の 2 段目。Lime だけ・発掘との出会いのあとに雲から出る。パネルはすべてお金パネル） */
export type Branch = 'shop' | 'craft' | 'logi' | 'buy' | 'people' | 'ops' | 'sys' | 'tech' | 'dig';

export interface Skill {
  id: string;
  branch: Branch;
  name: string;
  /** 効き目（数字で書く） */
  note: string;
  cost: number;
  requires?: string[];
  /** 先に要るパネルのレベル（requires のうち、Lv2 以上が要るもの。「発掘隊の手際 Lv3」など） */
  reqLv?: Record<string, number>;
  /** ids のうち n 個以上を取っていると取れる（「技を 3 つ」など） */
  anyOf?: { ids: string[]; n: number };
  /** 取るのに要るブランド力 */
  brand?: number;
  /** 技の修行の日数（取ったあと、職人が修行して身につけるまで。製造の適性で縮む。無ければ即日） */
  train?: number;
  /**
   * 外周（ランクのエリア。無ければ C＝内側）。そのランクのセクタに出店したあと、スキルツリーを開いたときに開く（Flags.rings）。
   * docs/ISLAND_PHASE1.md「スキルツリー」
   */
  tier?: Tier;
  /** 取るのに要るエンブレムの数（持っている数。使って減らない） */
  emblem?: number;
  /**
   * 大きめの研究パネル（以前の ✨ ゴールドダストのパネル）。同じランクの研究パネルの約 2.5 倍の RP。
   * docs/ISLAND_PHASE1.md「地層の発掘と研究ポイント」
   */
  big?: boolean;
  /**
   * 区分：研究パネル（RP で開く。レベルなし）／お金パネル（資金で開く。Lv1〜5）。data.ts の最後で決める（MONEY_PANELS）
   */
  cat?: SkillCat;
  /** 研究パネルの値段（RP）。お金パネルは 0 */
  rp?: number;
  /** 封印（Epic・Legendary の外周。名前は「???」。まだ取れない） */
  sealed?: boolean;
  /** 準備中（まだ取れない） */
  soon?: boolean;
  /**
   * お金パネルの最大レベル（無ければ 5）。研究パネルはいつも 1（レベルなし。ここの値は使わない）。
   * docs/ISLAND_PHASE1.md「スキルツリー」「パネルのレベル」
   */
  max?: number;
  /** 数字の効果（レベル 1 の値）。汎用の効き目（model.ts の fxSum）で効く。レベル n で ×(1 + 0.25(n − 1)) */
  fx?: Fx[];
  /** 解放型のパネルの Lv2 からの効果（Lv2 の値。Lv n で ×(n − 1)）。汎用の効き目で効く */
  up?: Fx[];
  /** 効き目の表示（既存のパネル。効き目そのものは model.ts に個別に書いてある）。fx のパネルは fx から作る */
  show?: Shown[];
  /** 解放型のパネルの Lv2 からの個別の効き目の表示（効き目は model.ts。Lv n で ×(n − 1)） */
  upShow?: Shown[];
  /**
   * 無限の強化パネル（発掘 v2 の 6 段目）：研究パネル（RP 払い）なのに Lv の上限が無い。値段は infCost（Lv ごとに上がる）、
   * 効き目は model.ts の digRepeatMs・digPower・発破とドリルの大きさ（DIG_BALANCE.infinite）。RP 払いなので、のちのリセットでも残る側
   */
  inf?: InfKind;
  /** 研究への寄付（お金で RP を買う）：開放するパネルではなく、押すたびに G を払って RP を受け取る（回数の上限なし。donateCost） */
  donate?: boolean;
}
/** 無限の強化パネルの種類：発掘の速さ・掘る力・掘る範囲 */
export type InfKind = 'speed' | 'power' | 'reach';

/**
 * 汎用の効き目の種類（docs/ISLAND_PHASE1.md「汎用の効き目」）。新しいパネルは fx を書くだけで効く。
 * v は割合（0.1 = 10%）。apt・brand・lot は数。
 */
export type FxKind =
  | 'pull'
  | 'price'
  | 'demand'
  | 'known'
  | 'craftDays'
  | 'lot'
  | 'haulDays'
  | 'cartCap'
  | 'matPrice'
  | 'procCap'
  | 'buyDays'
  | 'display'
  | 'stamina'
  | 'rest'
  | 'apt'
  | 'wage'
  | 'upkeep'
  | 'ads'
  | 'brand'
  | 'rally'
  | 'manager'
  | 'flow'
  | DigFxKind;
/**
 * 発掘の枝の効き目（docs/ISLAND_PHASE1.md「発掘のスキルツリー」）。値はレベルごとの表（Fx.at）で書く（Lv で素直に比例しないため）。
 * fxSum で合計を読む（発掘作業の長さ・1 打の強さ・会心・長押しの間隔・隣への力・隊の速さ・常駐の速さ・交代制・素材）
 */
export type DigFxKind = 'dig.sec' | 'dig.power' | 'dig.crit' | 'dig.repeat' | 'dig.reach' | 'dig.crew' | 'dig.autoSpeed' | 'dig.relay' | 'dig.mat';
export interface Fx {
  kind: FxKind;
  v: number;
  /** レベルごとの値（Lv1〜5）。あれば v × 倍率の代わりにこれを使う（発掘の枝） */
  at?: number[];
}
/** 効き目の表示の 1 行（label の後ろに「+15%」のように値が付く） */
export interface Shown {
  label: string;
  v: number;
  /** % なら割合（0.15 → 15%）。'' なら数（+2） */
  unit: '%' | '';
  /** 下げる効果（−） */
  down?: boolean;
  /** レベルで 1 ずつ足す（ロット +1 個 → Lv2 で +2 個）。無ければ ×(1 + 0.25(n − 1)) */
  lin?: boolean;
  /** レベルごとの値（Lv1〜5。発掘の枝）。あれば v × 倍率の代わりにこれ */
  at?: number[];
  /** レベルごとの文（Lv1〜5。発掘の枝の「岩盤まで」「左右 1 マス」など）。あれば数の代わりにこれ */
  txt?: string[];
  /** 値のうしろの単位（「 秒」「 ms」など） */
  suf?: string;
  /** 符号（+・−）を付けない（「150 ms」のような、そのものの値） */
  bare?: boolean;
}
/** 数で足す効き目（ロット・ブランド力）：レベルで 1 ずつ（v × lv）。このパネルは最大 3 */
export const FX_LIN: FxKind[] = ['lot', 'brand'];
/** 下げる効き目（表示で −） */
export const FX_DOWN: FxKind[] = ['craftDays', 'haulDays', 'matPrice', 'buyDays', 'stamina', 'wage', 'upkeep', 'rally', 'dig.relay'];
/** fx の種類の表示名 */
export const FX_LABEL: Record<FxKind, string> = {
  pull: t('すべてのお店の売り場の強さ', 'All shops’ pull'),
  price: t('すべての商品の値段', 'All prices'),
  demand: t('エリアの需要', 'Area demand'),
  known: t('新商品の認知の育ち', 'New items get known'),
  craftDays: t('クラフトの日数', 'Crafting days'),
  lot: t('基礎の商品のロット', 'Basic goods per lot'),
  haulDays: t('運ぶ日数', 'Hauling days'),
  cartCap: t('荷車に積める数', 'Cart load'),
  matPrice: t('素材の値段', 'Material prices'),
  procCap: t('月の調達の上限', 'Monthly buying limit'),
  buyDays: t('調達係の往復の日数', 'Buyer round trips'),
  display: t('品出しの速さ', 'Shelving speed'),
  stamina: t('働くときのスタミナの減り', 'Stamina drain at work'),
  rest: t('休むと戻るスタミナ', 'Stamina recovered by rest'),
  apt: t('全員の適性', 'Everyone’s aptitude'),
  wage: t('給料', 'Wages'),
  upkeep: t('建物の維持費', 'Building upkeep'),
  ads: t('宣伝の効き目', 'Ad strength'),
  brand: t('ブランド力（月に）', 'Brand (a month)'),
  rally: t('他社の反撃の効き目', 'Rival counterattacks'),
  manager: t('マネージャーのセクタの売上', 'Managed sectors’ sales'),
  flow: t('全段の「ひと月に流せる数」', 'Every stage’s monthly flow'),
  'dig.sec': t('1 回の発掘作業', 'Each dig run'),
  'dig.power': t('1 打の強さ', 'Strike power'),
  'dig.crit': t('会心（2 倍）の確率', 'Critical (×2) chance'),
  'dig.repeat': t('長押しの間隔', 'Hold-strike interval'),
  'dig.reach': t('隣のマスへの力', 'Power to neighbours'),
  'dig.crew': t('発掘隊の 1 日に打つ回数', 'Dig crew strikes a day'),
  'dig.autoSpeed': t('常駐の速さ', 'Standing crew speed'),
  'dig.relay': t('常駐で働く日のスタミナの減り', 'Stamina drain on standing days'),
  'dig.mat': t('掘り出した素材', 'Materials dug up'),
};
/** 発掘の枝の効き目の単位（% でないもの）と、そのものの値で見せるもの（長押しの間隔：170 ms から引いた値） */
const DIG_UNIT: Partial<Record<FxKind, { suf?: string; pct?: boolean; disp?: (v: number) => number; bare?: boolean }>> = {
  'dig.sec': { suf: t(' 秒', ' s') },
  'dig.power': {},
  'dig.crit': { pct: true },
  'dig.repeat': { suf: ' ms', disp: (v) => 170 - v, bare: true },
  'dig.reach': { pct: true },
  'dig.crew': { pct: true },
  'dig.autoSpeed': { pct: true },
  'dig.relay': { pct: true },
  'dig.mat': { pct: true },
};
/** fx を表示の行に */
export const fxShown = (f: Fx): Shown => {
  const d = DIG_UNIT[f.kind];
  if (d) return { label: FX_LABEL[f.kind], v: f.v, unit: d.pct ? '%' : '', down: FX_DOWN.includes(f.kind) && !d.bare, at: f.at?.map(d.disp ?? ((v) => v)), suf: d.suf, bare: d.bare };
  return { label: FX_LABEL[f.kind], v: f.v, unit: f.kind === 'apt' || f.kind === 'brand' || f.kind === 'lot' ? '' : '%', down: FX_DOWN.includes(f.kind), lin: FX_LIN.includes(f.kind) };
};

/** レベルのコストの倍率（Lv1〜5。合計 20）。docs/ISLAND_PHASE1.md「パネルのレベル」 */
export const LV_COST = [1, 2, 3.5, 5.5, 8];
/** レベル n の効果の倍率：1 + 0.25(n − 1)（Lv5 で 2 倍）。未取得 0 */
export const lvMulOf = (lv: number) => (lv <= 0 ? 0 : 1 + 0.25 * (lv - 1));
/** スキルの区分：研究パネル（RP）・お金パネル（資金） */
export type SkillCat = 'research' | 'money';
/** 研究パネルか（お金パネルでなければ研究パネル） */
export const isResearch = (k: Skill) => k.cat !== 'money';
/** 最大レベル（研究パネル・封印・準備中・研究への寄付は 1。無限の強化パネルは上限なし＝Infinity） */
export const maxLv = (k: Skill) => (k.inf ? Infinity : k.sealed || k.soon || k.donate || isResearch(k) ? 1 : (k.max ?? 5));
/** そのレベル（lv）にするコスト（GUM）：round(cost × 倍率 / 100) × 100 */
export const levelCost = (k: Skill, lv: number) => Math.round((k.cost * LV_COST[Math.max(0, Math.min(LV_COST.length, lv) - 1)]) / 100) * 100;
/** 効き目の表示の行：レベル lv のときの値（up は Lv2 から） */
export const shownAt = (x: Shown, lv: number, up = false) => (x.at || x.txt ? (lv <= 0 ? 0 : (x.at?.[lv - 1] ?? lv)) : up ? x.v * Math.max(0, lv - 1) : x.lin ? x.v * lv : x.v * lvMulOf(lv));
/** パネルの効き目の行（fx・show と、Lv2 からの up・upShow） */
/** 効き目の値の表示（+15%・−20%・+2・+3 秒・150 ms） */
export function fmtShown(x: Shown, v: number): string {
  const n = x.unit === '%' ? v * 100 : v;
  const r = Math.round(n * 10) / 10;
  return `${x.bare ? '' : x.down ? '−' : '+'}${r}${x.unit}${x.suf ?? ''}`;
}
/** そのレベルの効き目の文（無ければ null）。文の表（txt）があればそれ、無ければ数（fmtShown） */
export function shownText(x: Shown, lv: number, up = false): string | null {
  if (x.txt) return lv <= 0 ? null : (x.txt[Math.min(x.txt.length, lv) - 1] ?? null);
  const v = shownAt(x, lv, up);
  return v ? fmtShown(x, v) : null;
}
export function shownOf(k: Skill): { base: Shown[]; up: Shown[] } {
  return { base: [...(k.show ?? []), ...(k.fx ?? []).map(fxShown)], up: [...(k.upShow ?? []), ...(k.up ?? []).map(fxShown)] };
}
/** 修行の日数の縮み方：適性 apt で ×(1 − min(cut, apt / per))（適性 100 で −40%） */
export const TRAIN = { cut: 0.4, per: 250 };

/**
 * スキルツリー v2（docs/ISLAND_PHASE1.md「スキルツリー」）。実際の店舗運営で使われている工夫をパネルにし、効き目は数字で書く。
 * 内側（C）＋外周（U・R・E・L）。U・R の最初のパネルはエンブレムが要る。✨ はゴールドダストで取る。
 * 既存のパネルの値段は変えない。
 */
export const SKILLS: Skill[] = [
  // ---------------------------------------------------------------- ④ 販売
  { id: 'host', branch: 'shop', name: t('接客の研修', 'Customer service training'), note: t('すべてのお店の売り場の強さ +15%', 'All shops’ pull +15%'), cost: 4000 },
  { id: 'display', branch: 'shop', name: t('品出しの名人', 'Shelving pros'), note: t('棚に並べる速さ +50%', 'Shelving speed +50%'), cost: 3500 },
  { id: 'vmd', branch: 'shop', name: t('売り場の見せ方（VMD）', 'Visual merchandising'), note: t('棚が 2 つ以上あるお店の売り場の強さ +10%', 'Pull +10% at shops with 2+ shelves'), cost: 5000, requires: ['host'] },
  { id: 'pop', branch: 'shop', name: t('手書き POP', 'Handwritten POP cards'), note: t('新商品の認知の育ち +50%', 'New items get known 50% faster'), cost: 3000, requires: ['display'] },
  { id: 'golden', branch: 'shop', name: t('ゴールデンゾーンの棚割', 'Golden-zone planogram'), note: t('各お店の 1 番目の棚（主力商品）の売り場の強さ +12%', 'Pull +12% for each shop’s first shelf (main product)'), cost: 6000, requires: ['vmd'] },
  { id: 'set', branch: 'shop', name: t('セット販売', 'Bundle sales'), note: t('2 種類以上並べているお店の商品の値段 +5%', 'Prices +5% at shops stocking 2+ kinds'), cost: 7000, requires: ['golden'] },
  { id: 'point', branch: 'shop', name: t('ポイントカード', 'Loyalty cards'), note: t('他社の反撃の効き目が半分（他社の売り場の強さ ×1.25 → ×1.12）', 'Rival counterattacks hit half as hard (rival pull ×1.25 → ×1.12)'), cost: 8000, requires: ['pop'] },
  { id: 'hours', branch: 'shop', name: t('営業時間の延長', 'Longer opening hours'), note: t('棚に並べる数 +2／日（お店ごと）・店員のスタミナの減り +20%', 'Shelve +2 a day per shop; clerks tire 20% faster'), cost: 4500, requires: ['display'] },
  { id: 'shop2', branch: 'shop', name: t('輸入品店', 'Import store'), note: t('棚 2 の輸入品店を建てられる（売り場の強さ ×1.15）', 'Unlocks the import store (2 shelves, pull ×1.15)'), cost: 6000, requires: ['host'] },
  { id: 'shop3', branch: 'shop', name: t('ブティック', 'Boutique'), note: t('売り場が強いブティックを建てられる（棚 2・売り場の強さ ×1.35）', 'Unlocks the boutique (2 shelves, pull ×1.35)'), cost: 14000, requires: ['shop2'] },
  { id: 'b_sign', branch: 'shop', name: t('ブランドの看板', 'Brand signboards'), note: t('すべてのお店の売り場の強さ +25%', 'All shops’ pull +25%'), cost: 12000, requires: ['host'], brand: 30, tier: 'U', emblem: 1 },
  { id: 'order', branch: 'shop', name: t('客注・取り寄せ', 'Special orders'), note: t('自社のお店に来るお客さん +10%（エリアの需要 +10%）', 'Customers at your shops +10% (area demand +10%)'), cost: 15000, requires: ['set'], tier: 'U' },
  { id: 'fair', branch: 'shop', name: t('季節の催事', 'Seasonal fairs'), note: t('宣伝の費用 −30%・効き目 +10%', 'Ads cost 30% less and work 10% better'), cost: 12000, requires: ['point'], tier: 'U' },
  { id: 'b_premium', branch: 'shop', name: t('プレミアム価格', 'Premium pricing'), note: t('すべての商品の値段 +15%', 'All prices +15%'), cost: 30000, requires: ['shop3', 'b_sign'], brand: 80, tier: 'R' },
  { id: 'concierge', branch: 'shop', name: t('接客の匠', 'Master hosts'), note: t('すべてのお店の売り場の強さ +20%', 'All shops’ pull +20%'), cost: 40000, requires: ['b_sign'], tier: 'R', emblem: 3 },
  { id: 'd_shop', branch: 'shop', name: t('名物店主', 'Famous shopkeeper'), note: t('選んだ 1 軒の売り場の強さ +40%（お店の画面で選ぶ。替えられる）', 'One chosen shop’s pull +40% (pick it in the shop screen; you can switch)'), cost: 0, big: true },
  // ---------------------------------------------------------------- ② 製造
  { id: 'jig', branch: 'craft', name: t('段取りの改善', 'Better setups'), note: t('クラフトの日数 −20%', 'Crafting −20% days'), cost: 4000 },
  { id: 'pot', branch: 'craft', name: t('魔法の釜', 'Magic pot'), note: t('「商品開発」でアンコモンを開発できる（作るには製造の適性 31 以上の職人）', 'Develop Uncommons in Product development (crafting them needs aptitude 31+)'), cost: 10000 },
  { id: 'five_s', branch: 'craft', name: t('5S（整理・整頓）', '5S (sort and tidy)'), note: t('クラフトの日数 −5%・職人のスタミナの減り −10%', 'Crafting −5% days; crafters tire 10% slower'), cost: 3000 },
  { id: 'jig2', branch: 'craft', name: t('型の工夫', 'Better molds'), note: t('クラフトの日数 −15%', 'Crafting −15% days'), cost: 7000, requires: ['jig'] },
  { id: 'lot', branch: 'craft', name: t('ロットの改善', 'Bigger lots'), note: t('基礎の商品（技なし）の 1 ロット +1 個', 'Basic goods (no craft skill) +1 per lot'), cost: 6000, requires: ['jig'] },
  { id: 'chair', branch: 'craft', name: t('職人の椅子', 'Crafter chairs'), note: t('職人のスタミナの減り −30%', 'Crafters tire 30% slower'), cost: 3000, requires: ['five_s'] },
  { id: 'kaizen', branch: 'craft', name: t('カイゼン提案箱', 'Kaizen suggestion box'), note: t('クラフトの日数 −10%', 'Crafting −10% days'), cost: 9000, requires: ['five_s', 'jig2'] },
  { id: 'night', branch: 'craft', name: t('夜間稼働', 'Night shifts'), note: t('クラフトの日数 −15%・職人のスタミナの減り +20%', 'Crafting −15% days; crafters tire 20% faster'), cost: 12000, requires: ['kaizen'], tier: 'U', emblem: 1 },
  { id: 'mold', branch: 'craft', name: t('共通の型', 'Shared molds'), note: t('アンコモンの 1 ロット +1 個', 'Uncommons +1 per lot'), cost: 15000, requires: ['pot'], tier: 'U' },
  { id: 'line', branch: 'craft', name: t('自動化ライン', 'Automated line'), note: t('クラフトの日数 −20%', 'Crafting −20% days'), cost: 40000, requires: ['night'], tier: 'R', emblem: 3 },
  { id: 'd_craft', branch: 'craft', name: t('名工の作業台', 'Master’s workbench'), note: t('全員の製造の適性 +15', 'Everyone’s crafting aptitude +15'), cost: 0, big: true },
  // ---------------------------------------------------------------- ③ 物流
  { id: 'loading', branch: 'logi', name: t('積み込みの工夫', 'Smart loading'), note: t('荷車に積める数 +30%', 'Cart load +30%'), cost: 2500 },
  { id: 'shortcut', branch: 'logi', name: t('近道の地図', 'Shortcut map'), note: t('運ぶ日数 −15%', 'Hauling −15% days'), cost: 3500, requires: ['loading'] },
  { id: 'timetable', branch: 'logi', name: t('定期便の時刻表', 'Scheduled runs'), note: t('お店の裏が半分以上埋まっていても便を出す（待ちなし）', 'Send runs even when a backroom is over half full (no waiting)'), cost: 4000, requires: ['loading'] },
  { id: 'route_opt', branch: 'logi', name: t('配送ルートの最適化', 'Route optimization'), note: t('運ぶ日数 −10%', 'Hauling −10% days'), cost: 5000, requires: ['shortcut'] },
  { id: 'hub', branch: 'logi', name: t('物流拠点', 'Logistics hub'), note: t('物流拠点を建てられる（工房 → 拠点はトラックで日数 ×0.3）', 'Lets you build hubs (workshop → hub by truck, days ×0.3)'), cost: 5000, requires: ['timetable'] },
  { id: 'crossdock', branch: 'logi', name: t('クロスドッキング', 'Cross-docking'), note: t('工房 → 拠点の日数 ×0.3 → ×0.2', 'Workshop → hub days ×0.3 → ×0.2'), cost: 12000, requires: ['hub'], tier: 'U', emblem: 1 },
  { id: 'joint', branch: 'logi', name: t('共同配送', 'Shared deliveries'), note: t('運搬係 1 人が同時に出せる便 +1', 'Each hauler runs one more trip at once'), cost: 15000, requires: ['route_opt'], tier: 'U' },
  { id: 'fleet', branch: 'logi', name: t('自社トラック網', 'Own truck fleet'), note: t('運ぶ速さ ×1.3', 'Hauling speed ×1.3'), cost: 40000, requires: ['crossdock'], tier: 'R', emblem: 3 },
  { id: 'd_logi', branch: 'logi', name: t('配送センター', 'Distribution center'), note: t('運ぶ日数 −30%', 'Hauling −30% days'), cost: 0, big: true },
  // ---------------------------------------------------------------- ① 調達
  { id: 'route_cloth', branch: 'buy', name: t('布のルート', 'Cloth route'), note: t('布を買えるようになる', 'Lets you buy cloth'), cost: 2000 },
  { id: 'route_paper', branch: 'buy', name: t('紙のルート', 'Paper route'), note: t('紙を買えるようになる', 'Lets you buy paper'), cost: 2000, requires: ['route_cloth'] },
  { id: 'route_gem', branch: 'buy', name: t('宝石のルート', 'Gem route'), note: t('宝石を買えるようになる', 'Lets you buy gems'), cost: 6000, requires: ['route_paper'] },
  { id: 'bulk', branch: 'buy', name: t('まとめ買い', 'Bulk buying'), note: t('素材の値段 −15%', 'Materials −15%'), cost: 4000 },
  { id: 'stock1', branch: 'buy', name: t('調達枠の拡大', 'Bigger buying quota'), note: t('月の調達の上限 +30%', 'Monthly buying limit +30%'), cost: 3000 },
  { id: 'stock2', branch: 'buy', name: t('大口契約', 'Bulk contracts'), note: t('月の調達の上限 +60%', 'Monthly buying limit +60%'), cost: 8000, requires: ['stock1', 'bulk'] },
  { id: 'bulk2', branch: 'buy', name: t('卸との信頼', 'Wholesaler trust'), note: t('素材の値段 さらに −10%', 'Materials −10% more'), cost: 7000, requires: ['bulk'] },
  { id: 'stock3', branch: 'buy', name: t('年間契約', 'Annual contract'), note: t('月の調達の上限 +100%', 'Monthly buying limit +100%'), cost: 15000, requires: ['stock2'] },
  { id: 'swift', branch: 'buy', name: t('早足の買い付け', 'Brisk buying trips'), note: t('調達係の往復の日数 −30%', 'Buyer round trips −30% days'), cost: 3000, requires: ['stock1'] },
  { id: 'eye', branch: 'buy', name: t('目利き', 'Sharp eye'), note: t('調達ランクの経験 +50%', 'Buying rank exp +50%'), cost: 2500, requires: ['stock1'] },
  { id: 'scoutmap', branch: 'buy', name: t('開拓の手引き', 'Scouting guide'), note: t('ルートの開拓の日数 −40%', 'Scouting −40% days'), cost: 3000, requires: ['route_paper'] },
  { id: 'abc', branch: 'buy', name: t('ABC 分析', 'ABC analysis'), note: t('調達係の買う量を消費にぴったり合わせる（買いすぎなし）・素材の値段 −5%', 'Buyers match purchases to use (no overbuying); materials −5%'), cost: 4000, requires: ['stock1'] },
  { id: 'contract', branch: 'buy', name: t('長期契約', 'Long-term contract'), note: t('素材の値段 −5%（値段の変動が入ったら 6 か月固定）', 'Materials −5% (locks prices for 6 months once prices fluctuate)'), cost: 10000, requires: ['bulk2'], tier: 'U', emblem: 1 },
  { id: 'b_partner', branch: 'buy', name: t('指名の取引先', 'Preferred supplier'), note: t('素材の値段 −15%・月の調達の上限 +50%', 'Materials −15%, monthly buying limit +50%'), cost: 15000, requires: ['bulk2'], brand: 50, tier: 'U' },
  { id: 'direct', branch: 'buy', name: t('産地との直接取引', 'Direct sourcing'), note: t('素材の値段 −10%・月の調達の上限 +50%', 'Materials −10%, monthly buying limit +50%'), cost: 35000, requires: ['contract'], tier: 'R', emblem: 3 },
  { id: 'd_buy', branch: 'buy', name: t('商社との提携', 'Trading-house alliance'), note: t('すべての素材のルートが開く・素材の値段 −10%', 'Opens every material route; materials −10%'), cost: 0, big: true },
  // ---------------------------------------------------------------- 人材
  { id: 'hire', branch: 'people', name: t('人材の募集', 'Recruiting'), note: t('ヒーローを雇えるようになる（候補 3 人・毎月入れ替わる）', 'Hire heroes (3 candidates, refreshed monthly)'), cost: 3000 },
  { id: 'lounge', branch: 'people', name: t('休憩室', 'Lounge'), note: t('スタミナの回復 +50%', 'Stamina recovers 50% faster'), cost: 2500 },
  { id: 'manual', branch: 'people', name: t('マニュアル整備', 'Work manuals'), note: t('全員の適性 +3（すべての仕事）', 'Everyone’s aptitude +3 (all jobs)'), cost: 4000, requires: ['hire'] },
  { id: 'shift', branch: 'people', name: t('シフト制の導入', 'Shift system'), note: t('働くときのスタミナの減り −20%', 'Stamina drain while working −20%'), cost: 5000, requires: ['lounge'] },
  { id: 'slots', branch: 'people', name: t('採用枠の拡大', 'More openings'), note: t('雇える候補 3 → 4 人', 'Hiring candidates 3 → 4'), cost: 7000, requires: ['hire'] },
  { id: 'ojt', branch: 'people', name: t('OJT', 'On-the-job training'), note: t('担当のある人の、担当に効く能力が月に +1（PHY・INT・AGI。上限 100）', 'Assigned staff gain +1 a month in the stat their job uses (PHY/INT/AGI, max 100)'), cost: 6000, requires: ['manual'] },
  { id: 'incentive', branch: 'people', name: t('インセンティブ', 'Incentives'), note: t('売り場の強さ +5%・給料 +10%', 'Pull +5%; wages +10%'), cost: 5000, requires: ['manual'] },
  { id: 'welfare', branch: 'people', name: t('福利厚生', 'Benefits'), note: t('休むと戻るスタミナ +50%・給料 +5%', 'Rest recovers 50% more stamina; wages +5%'), cost: 6000, requires: ['shift'] },
  { id: 'b_scout', branch: 'people', name: t('憧れの職場', 'Dream employer'), note: t('雇える候補が 5 人に（アンコモンも来る）', 'Recruiting shows 5 candidates (Uncommons too)'), cost: 12000, requires: ['slots'], brand: 60, tier: 'U' },
  { id: 'training', branch: 'people', name: t('社内研修', 'In-house training'), note: t('技の修行の日数 −30%', 'Craft-skill training −30% days'), cost: 12000, requires: ['ojt'], tier: 'U', emblem: 1 },
  { id: 'mgr', branch: 'people', name: t('マネージャー研修', 'Manager training'), note: t('セクタマネージャーの売上の倍率 +0.1', 'Sector managers’ sales rate +0.1'), cost: 15000, requires: ['incentive'], tier: 'U' },
  { id: 'headhunt', branch: 'people', name: t('ヘッドハンティング', 'Headhunting'), note: t('雇える候補にレアのヒーローが 1 人来る', 'One Rare hero joins the hiring candidates'), cost: 40000, requires: ['b_scout'], tier: 'R', emblem: 3 },
  { id: 'd_people', branch: 'people', name: t('カリスマ採用', 'Star recruiter'), note: t('雇うときの能力 +20%（PHY・INT・AGI。上限 100）', 'New hires’ stats +20% (PHY/INT/AGI, max 100)'), cost: 0, big: true },
  // ---------------------------------------------------------------- 経営
  { id: 'pace1', branch: 'ops', name: t('業務の効率化', 'Streamlined operations'), note: t('ゲームの進行速度を 1.5 倍にできる（システム → 進行速度）', 'Lets you run the game at 1.5× (System → Game speed)'), cost: 4000 },
  { id: 'pace2', branch: 'ops', name: t('業務の自動化', 'Automated operations'), note: t('ゲームの進行速度を 2 倍にできる（システム → 進行速度）', 'Lets you run the game at 2× (System → Game speed)'), cost: 12000, requires: ['pace1'] },
  { id: 'budget', branch: 'ops', name: t('予算管理', 'Budgeting'), note: t('建物の維持費 −10%', 'Building upkeep −10%'), cost: 4000 },
  { id: 'pdca', branch: 'ops', name: t('月次 PDCA', 'Monthly PDCA'), note: t('月次報告に来月の見込み（売上・利益）が出る', 'Monthly reports show next month’s forecast (sales, profit)'), cost: 5000, requires: ['budget'] },
  { id: 'b_ads', branch: 'ops', name: t('ブランド広告', 'Brand advertising'), note: t('宣伝の効き目 ×1.5・ブランド力が月に +2', 'Ads 1.5× as strong; brand +2 a month'), cost: 10000, requires: ['pace1'], brand: 40, tier: 'U' },
  { id: 'pr', branch: 'ops', name: t('広報室', 'PR office'), note: t('ブランド力が月に +1', 'Brand +1 a month'), cost: 12000, requires: ['pdca'], tier: 'U', emblem: 1 },
  { id: 'holding', branch: 'ops', name: t('持株会社', 'Holding company'), note: t('マネージャーのセクタの利益 +10%', 'Managed sectors’ profit +10%'), cost: 40000, requires: ['pr'], tier: 'R', emblem: 3 },
  { id: 'd_ops', branch: 'ops', name: t('ブランド戦略室', 'Brand strategy office'), note: t('ブランド力の効き目 ×2（売り場の強さ 最大 +30% → +60%）', 'Brand effect ×2 (pull bonus cap +30% → +60%)'), cost: 0, big: true },
  // ---------------------------------------------------------------- システム
  { id: 'pos', branch: 'sys', name: t('POS レジ', 'POS registers'), note: t('市場データに商品ごとの「きのう売れた数」が出る・売り場の強さ +3%', 'Market data shows yesterday’s sales per item; pull +3%'), cost: 5000 },
  { id: 'auto_order', branch: 'sys', name: t('自動発注（EDI）', 'Auto-ordering (EDI)'), note: t('調達係の買い付けが毎日届く（往復なし）・注文の納期 −50%', 'Buyer purchases arrive daily (no round trip); order lead time −50%'), cost: 8000, requires: ['pos'] },
  { id: 'inventory', branch: 'sys', name: t('在庫管理システム', 'Inventory system'), note: t('お店の裏 +10・工房の物置 +20', 'Backrooms +10; workshop stockroom +20'), cost: 6000, requires: ['pos'] },
  { id: 'erp', branch: 'sys', name: t('ERP', 'ERP'), note: t('全段の「ひと月に流せる数」+5%（調達・製造・物流・販売）', 'Every stage’s monthly flow +5% (buy, craft, haul, sell)'), cost: 20000, requires: ['auto_order', 'inventory'], tier: 'U', emblem: 1 },
  { id: 'dyn', branch: 'sys', name: t('ダイナミックプライシング', 'Dynamic pricing'), note: t('需要が供給より多い商品（扱う他社が 1 社以下）の値段 +8%', 'Prices +8% where demand beats supply (1 rival or fewer)'), cost: 18000, requires: ['pos'], tier: 'U' },
  { id: 'flow', branch: 'sys', name: t('人流解析', 'Foot-traffic analytics'), note: t('建てるときにお客さんの多い区画（上位 20%）が光る・売り場の強さ +5%', 'Busiest blocks (top 20%) glow when placing; pull +5%'), cost: 15000, requires: ['inventory'], tier: 'U' },
  { id: 'forecast', branch: 'sys', name: t('需要予測 AI', 'Demand-forecast AI'), note: t('新商品の認知が 30% → 50% から始まる', 'New items start 50% known instead of 30%'), cost: 40000, requires: ['erp'], tier: 'R', emblem: 3 },
  { id: 'ec', branch: 'sys', name: t('EC サイト', 'Online store'), note: t('遠いお客さんも買う（自社のお店の届き方が最低 25%）', 'Far customers buy too (your shops reach at least 25%)'), cost: 45000, requires: ['dyn'], tier: 'R' },
  { id: 'd_sys', branch: 'sys', name: t('基幹システム刷新', 'Core system overhaul'), note: t('全段の「ひと月に流せる数」+10%（調達・製造・物流・販売）', 'Every stage’s monthly flow +10% (buy, craft, haul, sell)'), cost: 0, big: true },
  // ---------------------------------------------------------------- 技（作れる商品を増やす。docs/ISLAND_PHASE1.md「商品と技」）
  { id: 't_wood', branch: 'tech', name: t('木工の技', 'Woodworking'), note: t('椅子を作れる', 'Lets you make Chairs'), cost: 4000, train: 8 },
  { id: 't_paper', branch: 'tech', name: t('紙工の技', 'Papercraft'), note: t('傘・ペンを作れる', 'Lets you make Parasols and Quills'), cost: 5000, train: 10 },
  { id: 't_metal', branch: 'tech', name: t('金工の技', 'Metalwork'), note: t('ナイフ・コンパスを作れる', 'Lets you make Knives and Compasses'), cost: 6000, train: 12 },
  { id: 't_glass', branch: 'tech', name: t('ガラス細工', 'Glasswork'), note: t('ゴブレット・モノクルを作れる', 'Lets you make Goblets and Monocles'), cost: 7000, train: 14 },
  { id: 't_clay', branch: 'tech', name: t('陶芸の技', 'Pottery'), note: t('モアイ・日本人形を作れる', 'Lets you make Moai and Japanese Dolls'), cost: 5000, train: 10 },
  { id: 't_textile', branch: 'tech', name: t('織物の技', 'Weaving'), note: t('リボン・ハットを作れる', 'Lets you make Ribbons and Hats'), cost: 6000, train: 12 },
  { id: 't_jewel', branch: 'tech', name: t('宝飾の技', 'Jewelcraft'), note: t('オルゴールを作れる', 'Lets you make Music Boxes'), cost: 12000, train: 20, requires: ['t_metal'] },
  { id: 't_master', branch: 'tech', name: t('匠の技', 'Master craft'), note: t('技が要る商品の売り場の強さ +15%（技を 3 つ取ると開放できる）', 'Pull +15% for goods that need a craft skill (unlock after any 3 craft skills)'), cost: 15000, anyOf: { ids: ['t_wood', 't_paper', 't_metal', 't_glass', 't_clay', 't_textile', 't_jewel'], n: 3 } },
  { id: 't_rare', branch: 'tech', name: t('レアの技', 'Rare craft'), note: t('レアの商品を作れる（準備中）', 'Lets you make Rare goods (coming soon)'), cost: 50000, requires: ['t_master'], tier: 'U', emblem: 1, soon: true },
];

/** 効き目の表示の行（既存のパネル用） */
const up_ = (label: string, v: number, lin = false): Shown => ({ label, v, unit: '%', lin });
const dn_ = (label: string, v: number): Shown => ({ label, v, unit: '%', down: true });
const nm_ = (label: string, v: number, lin = false): Shown => ({ label, v, unit: '', lin });
const PULL_ = FX_LABEL.pull;
const CRAFT_ = FX_LABEL.craftDays;
const HAUL_ = FX_LABEL.haulDays;
const MAT_ = FX_LABEL.matPrice;
const PROC_ = FX_LABEL.procCap;
const STAM_ = FX_LABEL.stamina;
/**
 * 既存のパネルのレベル（docs/ISLAND_PHASE1.md「パネルのレベル」）。効き目そのものは model.ts（lvMul で比例）。
 * 数字の効果は最大 5（表示の行 show）、解放型は 2〜3（Lv2 からの効果 up／upShow）。デメリット（スタミナ +20%・給料 +10% など）はレベルで増えない。
 */
const LEVELS: Record<string, Partial<Skill>> = {
  host: { show: [up_(PULL_, 0.15)] },
  display: { show: [up_(t('棚に並べる速さ', 'Shelving speed'), 0.5)] },
  vmd: { show: [up_(t('棚 2 つ以上のお店の売り場の強さ', 'Pull at shops with 2+ shelves'), 0.1)] },
  pop: { show: [up_(FX_LABEL.known, 0.5)] },
  golden: { show: [up_(t('1 番目の棚の売り場の強さ', 'Pull of each first shelf'), 0.12)] },
  set: { show: [up_(t('2 種類以上並べたお店の値段', 'Prices at shops with 2+ kinds'), 0.05)] },
  point: { show: [dn_(FX_LABEL.rally, 0.5)] },
  hours: { show: [nm_(t('棚に並べる数（1 日・お店ごと）', 'Shelved a day per shop'), 2)] },
  shop2: { max: 3, upShow: [up_(t('輸入品店の売り場の強さ', 'Import stores’ pull'), 0.1)] },
  shop3: { max: 3, upShow: [up_(t('ブティックの売り場の強さ', 'Boutiques’ pull'), 0.1)] },
  b_sign: { show: [up_(PULL_, 0.25)] },
  order: { show: [up_(FX_LABEL.demand, 0.1)] },
  fair: { show: [dn_(t('宣伝の費用', 'Ad costs'), 0.3), up_(FX_LABEL.ads, 0.1)] },
  b_premium: { show: [up_(FX_LABEL.price, 0.15)] },
  concierge: { show: [up_(PULL_, 0.2)] },
  d_shop: { show: [up_(t('選んだ 1 軒の売り場の強さ', 'Chosen shop’s pull'), 0.4)] },
  jig: { show: [dn_(CRAFT_, 0.2)] },
  pot: { max: 3, upShow: [dn_(t('商品開発の日数', 'Development days'), 0.2)] },
  five_s: { show: [dn_(CRAFT_, 0.05), dn_(t('職人のスタミナの減り', 'Crafter stamina drain'), 0.1)] },
  jig2: { show: [dn_(CRAFT_, 0.15)] },
  lot: { max: 3, show: [nm_(FX_LABEL.lot, 1, true)] },
  chair: { show: [dn_(t('職人のスタミナの減り', 'Crafter stamina drain'), 0.3)] },
  kaizen: { show: [dn_(CRAFT_, 0.1)] },
  night: { show: [dn_(CRAFT_, 0.15)] },
  mold: { max: 3, show: [nm_(t('アンコモンのロット', 'Uncommons per lot'), 1, true)] },
  line: { show: [dn_(CRAFT_, 0.2)] },
  d_craft: { show: [nm_(t('全員の製造の適性', 'Everyone’s crafting aptitude'), 15)] },
  loading: { show: [up_(FX_LABEL.cartCap, 0.3)] },
  shortcut: { show: [dn_(HAUL_, 0.15)] },
  timetable: { max: 2, up: [{ kind: 'haulDays', v: 0.05 }] },
  route_opt: { show: [dn_(HAUL_, 0.1)] },
  hub: { max: 3, upShow: [dn_(t('拠点からお店まで運ぶ日数', 'Hub → shop days'), 0.1)] },
  crossdock: { show: [dn_(t('工房 → 拠点の日数（×0.3 から）', 'Workshop → hub days (from ×0.3)'), 0.33)] },
  joint: { max: 3, show: [nm_(t('運搬係 1 人が同時に出せる便', 'Trips per hauler at once'), 1, true)] },
  fleet: { show: [up_(t('運ぶ速さ', 'Hauling speed'), 0.3)] },
  d_logi: { show: [dn_(HAUL_, 0.3)] },
  route_cloth: { max: 3, upShow: [dn_(t('布の値段', 'Cloth price'), 0.08)] },
  route_paper: { max: 3, upShow: [dn_(t('紙の値段', 'Paper price'), 0.08)] },
  route_gem: { max: 3, upShow: [dn_(t('宝石の値段', 'Gem price'), 0.08)] },
  bulk: { show: [dn_(MAT_, 0.15)] },
  stock1: { show: [up_(PROC_, 0.3)] },
  stock2: { show: [up_(PROC_, 0.6)] },
  bulk2: { show: [dn_(MAT_, 0.1)] },
  stock3: { show: [up_(PROC_, 1)] },
  swift: { show: [dn_(FX_LABEL.buyDays, 0.3)] },
  eye: { show: [up_(t('調達ランクの経験', 'Buying rank exp'), 0.5)] },
  scoutmap: { show: [dn_(t('ルートの開拓の日数', 'Scouting days'), 0.4)] },
  abc: { show: [dn_(MAT_, 0.05)] },
  contract: { show: [dn_(MAT_, 0.05)] },
  b_partner: { show: [dn_(MAT_, 0.15), up_(PROC_, 0.5)] },
  direct: { show: [dn_(MAT_, 0.1), up_(PROC_, 0.5)] },
  d_buy: { show: [dn_(MAT_, 0.1)] },
  hire: { max: 3, up: [{ kind: 'wage', v: 0.05 }] },
  lounge: { show: [up_(t('スタミナの回復', 'Stamina recovery'), 0.5)] },
  manual: { show: [nm_(FX_LABEL.apt, 3)] },
  shift: { show: [dn_(STAM_, 0.2)] },
  slots: { max: 2, up: [{ kind: 'wage', v: 0.05 }] },
  ojt: { max: 3, show: [nm_(t('担当に効く能力（月に）', 'Job stat (a month)'), 1, true)] },
  incentive: { show: [up_(PULL_, 0.05)] },
  welfare: { show: [up_(FX_LABEL.rest, 0.5)] },
  b_scout: { max: 2, up: [{ kind: 'apt', v: 2 }] },
  training: { show: [dn_(t('技の修行の日数', 'Training days'), 0.3)] },
  mgr: { show: [up_(t('マネージャーの売上の倍率', 'Managers’ sales rate'), 0.1)] },
  headhunt: { max: 2, up: [{ kind: 'apt', v: 2 }] },
  d_people: { show: [up_(t('雇うときの能力', 'New hires’ stats'), 0.2)] },
  pace1: { max: 2, up: [{ kind: 'upkeep', v: 0.05 }] },
  pace2: { max: 2, up: [{ kind: 'upkeep', v: 0.05 }] },
  budget: { show: [dn_(FX_LABEL.upkeep, 0.1)] },
  pdca: { max: 2, up: [{ kind: 'flow', v: 0.02 }] },
  b_ads: { show: [up_(FX_LABEL.ads, 0.5), nm_(FX_LABEL.brand, 2)] },
  pr: { max: 3, show: [nm_(FX_LABEL.brand, 1, true)] },
  holding: { show: [up_(t('マネージャーのセクタの利益', 'Managed sectors’ profit'), 0.1)] },
  d_ops: { show: [up_(t('ブランド力の効き目', 'Brand effect'), 1)] },
  pos: { show: [up_(PULL_, 0.03)] },
  auto_order: { max: 2, up: [{ kind: 'procCap', v: 0.1 }] },
  inventory: { show: [nm_(t('お店の裏', 'Backroom'), 10), nm_(t('工房の物置', 'Stockroom'), 20)] },
  erp: { show: [up_(FX_LABEL.flow, 0.05)] },
  dyn: { show: [up_(t('競合の少ない商品の値段', 'Prices with little competition'), 0.08)] },
  flow: { show: [up_(PULL_, 0.05)] },
  forecast: { show: [up_(t('新商品の認知のはじめ（30% に足す）', 'Starting awareness (added to 30%)'), 0.2)] },
  ec: { show: [up_(t('遠いお客さんへの届き方（最低）', 'Minimum reach to far customers'), 0.25)] },
  d_sys: { show: [up_(FX_LABEL.flow, 0.1)] },
  t_master: { show: [up_(t('技の商品の売り場の強さ', 'Pull for craft-skill goods'), 0.15)] },
  t_rare: { max: 1 },
};
// 技：Lv2 から、その技の商品のロット +1（最大 3）
for (const k of SKILLS) if (k.branch === 'tech' && k.train) LEVELS[k.id] = { max: 3, upShow: [nm_(t(`${k.name}の商品のロット`, `${k.name} goods per lot`), 1)] };
for (const k of SKILLS) Object.assign(k, LEVELS[k.id] ?? {});
// 外周（U・R・E・L）のパネル：汎用の効き目（fx）で書いた追加のパネル
SKILLS.push(...OUTER_SKILLS);

/** 発掘のスキルツリーの数字（DIG_BALANCE.tree） */
export interface DigTree {
  cost: Record<string, number>;
  ext: number[];
  ext2: number[];
  maxSec: number;
  power: number[];
  crit: number[];
  critMul: number;
  power2: number[];
  repeat: number[];
  reach: number[];
  reachDir: ('lr' | 'lrd' | 'all')[];
  lamp: number[];
  hint: number;
  deep: Record<'C' | 'U', number[]>;
  cap: number[];
  deepMul: number[];
  blastCost: number[];
  blastSize: number[];
  drill: number[];
  drillFuel: number;
  office: number[];
  crew: number[];
  auto: number[];
  autoSpeed: number[];
  relay: number[];
  mat: number[];
}

// ---------------------------------------------------------------- 発掘と研究ポイントの調整値（ここ 1 か所）

/**
 * 地層の発掘と研究ポイントの、自動プレイ（`npm run island:sim`）で直す数字はここにまとめる（docs/ISLAND_BALANCE.md「v8」「v9」）。
 * 使う所：研究パネルの値段（RP_PRICE）・RP の入り方（RP_GAIN）・地層の硬さと荒れ地の壁のマス目・出土品の割合（DIG）・自動発掘の速さ（DIG_AUTO）・
 * 発掘作業の長さ（sessionSec）・長押しの間隔（repeatMs）・発掘許可の申請料（permitFee）・自動プレイの打つ速さ（simTapsPerSec）・
 * 発掘のスキルツリー（tree。発掘 v2 の 2 段目：パネルの値段とレベルごとの効き目。以前の工房の設備投資「ツルハシ・ランタン・発破の道具」はここへ移した）。
 * v8 で直したもの（前 → 後）：Common の粘土層の硬さ 1〜2 → 1〜3・岩盤 2〜3 → 3（掘り尽くすのを Common の 1 か所目の滞在に合わせる）／
 * Common の RP「初めて掘る」10 → 15・「研究 Lv」5・10・15・20 → 8・15・20・25（1 か所目で RP が尽きて止まらない）／
 * ツルハシの新調 5,000・15,000 → 10,000・30,000 G（1 か所目のはじめに買って、すぐ掘り尽くさない）／発破の火薬代 1,000 → 2,000 G（余ったお金の使い道）。
 * v9（発掘 v2 の 1 段目）：ツルハシの回数をやめ、荒れ地 4 か所 × 15 秒の発掘作業に（docs/ISLAND_PHASE1.md「地層の発掘と研究ポイント」）
 * v10（発掘 v2 の 2 段目）：発掘のスキルツリー（9 本目の枝「発掘」。tree）。道具の値段（tools）・火薬代（blastCost）は tree へ
 * v11（発掘画面の作り直し）：上から掘る断面（rows）をやめ、正面の壁（wall。横 7 × 縦 9）を手前から奥へ。硬さ（hard）は奥ほど硬く・出土品の割合（odds）は 1 か所の数がそろうように
 */
export const DIG_BALANCE: {
  rpPrice: Record<Tier, { lo: number; hi: number; big: number; step: number }>;
  /**
   * RP の入り方。first・lv（出土品 1 個ぶん）は v14a からどのランクも同じ（レアリティの倍率なし）。
   * topic・tablet・present はセクタのランク（C・U の荒れ地）で決まる。R・E・L はダンジョンの奥で出る上のランクのエクステ（お題・石板・発表は無い）
   */
  rpGain: Record<Tier, { first: number; lv: [number, number, number, number]; topic: number; tablet: number; present: number }>;
  /** 地層の硬さ（層ごと。手前 → 奥。奥ほど硬い） */
  hard: Record<'C' | 'U', [number, number][]>;
  /** 荒れ地 1 か所の正面の壁のマス目（横 × 縦）。各マスに奥行きの層が DIG.<ランク>.layers の数だけ */
  wall: Record<'C' | 'U', [number, number]>;
  /** 壁に埋まっているものの割合（マス × 層 1 枚あたり。お題・石板のほかに）：エクステ・素材。残りは土だけ */
  odds: Record<'C' | 'U', { ext: number; mat: number }>;
  autoPerDay: number;
  /** 発掘のスキルツリー（9 本目の枝「発掘」）。表は Lv1〜5（[0] が Lv1）。deep・study・office は Lv0〜5（[0] が未取得） */
  tree: DigTree;
  /** 1 回の発掘作業の長さ（現実の秒）。2 段目のスキル「追加申請」で延びる（model.ts の sessionSec） */
  sessionSec: number;
  /** 長押しで続けて打つ間隔（ミリ秒）。2 段目のスキル「速さ」で短くなる（model.ts の digRepeatMs） */
  repeatMs: number;
  /** 発掘許可の申請料（G。セクタの 1 か所目は無料、2 か所目から） */
  permitFee: Record<'C' | 'U', number>;
  /** 自動プレイ（scripts/island/sim.ts）で、1 秒に打てる数の仮定 */
  simTapsPerSec: number;
  /**
   * お題 k を埋める層（手前 0 から。ランクごと）。v13（発掘 v2 の 5 段目）：制覇に研究成果の発表が要るので、お題を奥の層へ
   * （v12 までは お題 k ＝ k 番目の層）。docs/ISLAND_BALANCE.md「v13」
   */
  topicLayer: Record<'C' | 'U', number[]>;
  /**
   * 復刻品（発掘 v2 の 3 段目。docs/ISLAND_PHASE1.md「3. 復刻品」）：レシピが開く研究 Lv・売値の倍率（同じランクの商品の平均に掛ける）・
   * 独占の月数（初めて売った月から、どのセクタでも他社が真似しない）・需要（1 種類の月の需要。ランクの需要と町の大きさを掛ける。
   * 同じランクの gap の商品の 0.6 倍くらい）・作る手間（日数・1 ロットの数）
   */
  relic: { openLv: number; priceMul: number; monopolyMonths: number; demandBase: number; days: [number, number]; batch: number };
  /**
   * 復興（発掘 v2 の 4 段目。docs/ISLAND_PHASE1.md「4. 復興・ダンジョン・展示館」）：掘りきった荒れ地 1 か所で、そのセクタの家の数 × homes の家が増え、
   * 商品ごとの需要も同じ割合で上がる。地図の住宅の絵は houses 軒まで（近くの空き地に）
   */
  revive: { homes: number; houses: number };
  /**
   * ダンジョン（セクタで最後に掘りきった荒れ地から）：壁（横 × 縦）・層の数・硬さ（ランクごと・層ごと）・掘れる層（深い層の許可の Lv0〜5）・
   * 出土品の割合・層ごとのエクステのランクの確率（そのセクタのランク／1 つ上／2 つ上／3 つ上）・上のランクの出土品の種類の数（セクタごと・ランクごと）
   */
  dungeon: {
    wall: [number, number];
    layers: number;
    hard: Record<'C' | 'U', [number, number][]>;
    deep: number[];
    odds: { ext: number; mat: number };
    rarity: Record<'C' | 'U', [number, number, number, number][]>;
    pick: number;
  };
  /**
   * 遺物の展示館：値段は P1B の museum。枠（はじめ・展示室の増築のあと）・増築の値段・価値（レアリティ × 研究 Lv）・
   * 来館者（価値 1 あたりの月の人数）・入館料（1 人）・節目（展示の価値の合計）と、節目ごとの恒久のボーナス（会社全体の新商品の認知の上がり方・ブランド力）
   */
  museum: { slots: number[]; expand: number[]; val: Record<Tier, number>; lvStep: number; visitors: number; fee: number; marks: number[]; known: number; brand: number };
  /**
   * 無限の強化パネル（発掘 v2 の 6 段目。RP 払い・Lv の上限なし）：値段（Lv1 の RP）と Lv ごとの倍率・丸める単位。
   * 効き目は Lv の curve 乗（1 より小さいので、上がるほど少しずつ鈍くなる。上限は無い）：
   * 速さ＝長押しの間隔 ÷（1 ＋ speed × Lv^curve）（下限 minMs）・力＝1 打の強さ ×（1 ＋ power × Lv^curve）・
   * 範囲＝発破・ドリルが 1 つ大きくなる確率 reach × Lv^curve（1 を超えたぶんは確実に +1、端数が確率）
   */
  infinite: { cost: number; grow: number; step: number; curve: number; speed: number; minMs: number; power: number; reach: number };
  /** 研究への寄付（お金で RP を買う・回数の上限なし）：はじめの値段（G）・押すごとの倍率・丸める単位・受け取る RP（一定） */
  buyRp: { cost: number; grow: number; step: number; rp: number };
  /** Uncommon の研究成果の発表の条件（お題に加えて）：そのセクタの出土品（finds）のうち n 種を研究 Lv lv 以上に */
  presentRes: Partial<Record<'C' | 'U', { n: number; lv: number }>>;
} = {
  // 研究パネルの RP の値段：根もと lo 〜 枝先 hi（平均は (lo + hi) / 2）・大きめの研究パネル big・丸める単位 step
  rpPrice: {
    C: { lo: 20, hi: 80, big: 125, step: 5 },
    U: { lo: 60, hi: 180, big: 300, step: 5 },
    R: { lo: 150, hi: 450, big: 750, step: 10 },
    E: { lo: 375, hi: 1125, big: 1875, step: 25 },
    L: { lo: 940, hi: 2810, big: 4700, step: 50 },
  },
  // RP の入り方：初めて掘る・研究 Lv2〜5・お題・石板・発表
  rpGain: {
    C: { first: 15, lv: [8, 15, 20, 25], topic: 40, tablet: 20, present: 60 },
    // v14a（発掘 v2 の 6 段目）：出土品 1 個ぶんの RP（初発見・研究 Lv の上がり）はレアリティで変わらない（どのランクも Common の表）。
    // レアリティの差は売上の側（展示館の価値・復刻品の売値）。お題・石板・発表は、セクタのランクの違いとして残す
    // （前：U 初発見 25・Lv 12・25・38・50／R 80・38〜160／E 250・120〜500／L 600・288〜1,200）
    U: { first: 15, lv: [8, 15, 20, 25], topic: 100, tablet: 50, present: 150 },
    R: { first: 15, lv: [8, 15, 20, 25], topic: 0, tablet: 0, present: 0 },
    E: { first: 15, lv: [8, 15, 20, 25], topic: 0, tablet: 0, present: 0 },
    L: { first: 15, lv: [8, 15, 20, 25], topic: 0, tablet: 0, present: 0 },
  },
  // 地層の硬さ（層ごと・手前 → 奥。1 打の強さ 1 のときに打つ回数の範囲）。v11：正面の壁を手前から奥へ。奥ほど硬い
  hard: {
    C: [
      [1, 1],
      [1, 2],
      [2, 3],
    ],
    U: [
      [2, 3],
      [3, 3],
      [3, 4],
      [4, 5],
    ],
  },
  // 荒れ地 1 か所の正面の壁（横 7 × 縦 9。スマホの縦長の全画面に合う形）
  wall: { C: [7, 9], U: [7, 9] },
  // 壁に埋まっているもの（マス × 層 1 枚あたり）。v10 の断面（Common 140 マス・Uncommon 168 マス × エクステ 24%・素材 14%）と、1 か所の出土の数がそろうように
  odds: { C: { ext: 0.178, mat: 0.104 }, U: { ext: 0.16, mat: 0.093 } },
  // 自動発掘：適性の速さ 1.0 で 1 日に打つ回数
  autoPerDay: 3,
  // 発掘のスキルツリー（仮。Lv が上がるほど levelCost で ×2・×3.5・×5.5・×8）
  tree: {
    cost: {
      dig_ext: 2000,
      dig_power: 4000,
      dig_speed: 5000,
      dig_reach: 8000,
      dig_lamp: 3000,
      dig_deep: 5000,
      dig_study: 6000,
      dig_blast: 6000,
      dig_drill: 12000,
      dig_office: 4000,
      dig_crew: 7000,
      u_dig_ext2: 40000,
      u_dig_auto: 60000,
      u_dig_power2: 80000,
      u_dig_route: 30000,
      u_dig_relay: 20000,
      u_dig_mat: 25000,
    },
    // 追加申請：+3 秒／Lv（15 → 30 秒）・長期の発掘許可：さらに +6 秒／Lv（最大 60 秒）
    ext: [3, 6, 9, 12, 15],
    ext2: [6, 12, 18, 24, 30],
    maxSec: 60,
    // ツルハシの鍛え直し：1 打の強さ +1（Lv1）・+2（Lv3）・+3（Lv5）。間の Lv は会心（2 倍）の確率 +10%
    power: [1, 1, 2, 2, 3],
    crit: [0, 0.1, 0.1, 0.2, 0.2],
    critMul: 2,
    // 重機の貸し出し：さらに +1（Lv1・3・5）
    power2: [1, 1, 2, 2, 3],
    // 手早い掘り方：長押しの間隔 170 → 150・130・115・100・90 ms（170 から引く ms）
    repeat: [20, 40, 55, 70, 80],
    // 広く掘る：隣のマスへの力（打った強さの割合）と向き（lr 左右・lrd 左右と下・all 上下左右）
    reach: [0.25, 0.35, 0.45, 0.5, 0.6],
    reachDir: ['lr', 'lr', 'lrd', 'all', 'all'],
    // 発掘のランタン：ひびの隙間から見え始める深さ（何枚手前から。ふだんは いまの層だけ）。Lv4 でお題の気配が さらに 2 枚先から、Lv5 で石板も
    lamp: [1, 2, 3, 3, 3],
    hint: 2,
    // 深い層の許可：掘れる層の数（Lv0〜5）。ダンジョンの深さは DIG_BALANCE.dungeon.deep
    deep: { C: [2, 3, 3, 3, 3, 3], U: [2, 2, 3, 4, 4, 4] },
    // 研究の目利き：研究 Lv の上限（Lv0〜5）と、深い層ほど研究が進みやすい倍率（層 n で 1 + 0.25 × (n − 1) × 倍率 個ぶん）
    cap: [3, 4, 5, 5, 5, 5],
    deepMul: [0, 0, 0, 1, 1.5, 2],
    // 発破：火薬代（G）と大きさ（N × N）
    blastCost: [2000, 1500, 1000, 1000, 1000],
    blastSize: [3, 3, 3, 4, 5],
    // 掘削ドリル：押したマス 1 つを奥へ N 層・1 回の燃料代（G）
    drill: [3, 4, 5, 6, 7],
    drillFuel: 1000,
    // 発掘隊の役所：隊の人数の上限（Lv0〜5）・発掘隊の手際：1 日に打つ回数 +20%／Lv
    office: [1, 2, 3, 3, 4, 5],
    crew: [0.2, 0.4, 0.6, 0.8, 1.0],
    // 常駐（自動化）：作業していない日の速さ（作業中の何割）・段取り：速さ +10%／Lv・交代制：スタミナの減り −15%／Lv・素材の選り分け：+20%／Lv
    auto: [0.2, 0.4, 0.55, 0.7, 0.8],
    autoSpeed: [0.1, 0.2, 0.3, 0.4, 0.5],
    relay: [0.15, 0.3, 0.45, 0.6, 0.75],
    mat: [0.2, 0.4, 0.6, 0.8, 1.0],
  },
  // 発掘作業：15 秒（現実の秒）・長押し 0.17 秒ごと
  sessionSec: 15,
  repeatMs: 170,
  // 発掘許可の申請料（仮。セクタの 1 か所目は無料）
  permitFee: { C: 2000, U: 8000 },
  // 自動プレイ：1 秒に 4 打
  simTapsPerSec: 4,
  // お題の層（v13）
  topicLayer: { C: [1, 2, 2], U: [2, 3, 3, 3] },
  // 復刻品：研究 Lv3 で開く・売値 ×1.25・独占 4 か月・需要 12 個（gap の商品の平均 20.5 の 0.6 倍）・3〜4 日・1 ロット 4 個（アンコモンは半分）
  relic: { openLv: 3, priceMul: 1.05, monopolyMonths: 3, demandBase: 12, days: [3, 4], batch: 4 },
  // 復興：家の数の +6%（46 軒の町で +3 軒）・地図に描く住宅は 2 軒まで
  revive: { homes: 0.06, houses: 2 },
  dungeon: {
    wall: [7, 9],
    layers: 6,
    // 奥ほど硬い。Common のセクタでも、奥の層は Uncommon の荒れ地の奥（3〜4）より硬い
    hard: {
      C: [
        [2, 2],
        [2, 3],
        [3, 4],
        [4, 5],
        [5, 6],
        [6, 7],
      ],
      U: [
        [3, 3],
        [3, 4],
        [4, 5],
        [5, 6],
        [6, 7],
        [7, 8],
      ],
    },
    // 掘れる層（深い層の許可 Lv0〜5）：Lv1〜3 で 3 層・Lv4 で 5 層・Lv5 で 6 層（荒れ地を掘りきるには Common で Lv1・Uncommon で Lv3 が要る）
    deep: [2, 3, 3, 3, 5, 6],
    odds: { ext: 0.178, mat: 0.104 },
    // 層ごとのエクステのランク：[そのセクタのランク, 1 つ上, 2 つ上, 3 つ上]。
    // Common のセクタ（1 つ上＝Uncommon・2 つ上＝Rare・3 つ上＝Epic）：1〜2 層は Common だけ・3 層 U 10%・4 層 U 25% R 5%・5 層 U 25% R 12% E 2%・6 層 U 25% R 20% E 6%
    // Uncommon のセクタは 1 つ上へずらす（R・E・L）。Legendary は 6 層の 1% だけ
    rarity: {
      C: [
        [1, 0, 0, 0],
        [1, 0, 0, 0],
        [0.9, 0.1, 0, 0],
        [0.7, 0.25, 0.05, 0],
        [0.61, 0.25, 0.12, 0.02],
        [0.49, 0.25, 0.2, 0.06],
      ],
      U: [
        [1, 0, 0, 0],
        [1, 0, 0, 0],
        [0.9, 0.1, 0, 0],
        [0.7, 0.25, 0.05, 0],
        [0.63, 0.25, 0.12, 0],
        [0.54, 0.25, 0.2, 0.01],
      ],
    },
    pick: 9,
  },
  // 展示館：枠 4（展示室の増築で 8・12・16）・価値 C 1・U 2・R 5・E 15・L 40 ×（1 + 0.25 ×（研究 Lv − 1））・価値 1 で月 12 人・入館料 15 G
  museum: { slots: [4, 8, 12, 16], expand: [20000, 50000, 120000], val: { C: 1, U: 2, R: 5, E: 15, L: 40 }, lvStep: 0.25, visitors: 12, fee: 15, marks: [20, 50, 100, 200, 400, 800], known: 0.05, brand: 1 },
  // 無限の強化パネル：Lv1 2,000 RP・×1.25 ずつ（50 RP 単位）。Lv^0.85：速さ −2%・力 +5%・範囲 +3% から（Lv10 で 速さ ÷1.14・力 ×1.35・範囲 21%）
  infinite: { cost: 2000, grow: 1.25, step: 50, curve: 0.85, speed: 0.02, minMs: 40, power: 0.05, reach: 0.03 },
  // 研究への寄付：はじめ 20,000 G で 100 RP・押すごとに ×1.15（100 G 単位）
  buyRp: { cost: 20000, grow: 1.15, step: 100, rp: 100 },
  // Uncommon の発表：お題に加えて、そのセクタの出土品 2 種を研究 Lv3 に（復刻品のレシピも Lv3 で開く）。Common は お題だけ
  presentRes: { U: { n: 2, lv: 3 } },
};

// ---------------------------------------------------------------- 発掘の枝（9 本目。発掘 v2 の 2 段目）

/**
 * 発掘の枝のパネル（docs/ISLAND_PHASE1.md「地層の発掘と研究ポイント」の「2. 発掘のスキルツリー」）。すべてお金パネル（Lv1〜5・levelCost）。
 * Common の区画（根もとから枝先へ）11 枚と、Uncommon の外周 6 枚。数字は DIG_BALANCE.tree の 1 か所。効き目は model.ts（fxSum・lvOf）。
 * 発掘との出会い（digMeet）の前は、枝ごと雲で隠す（skillLock の 'hidden'）。Lime だけ（digLand）
 */
const DT = DIG_BALANCE.tree;
const lvTxt = (f: (v: number, lv: number) => string, xs: number[]) => xs.map((v, k) => f(v, k + 1));
const dShow = (label: string, txt: string[]): Shown => ({ label, v: 0, unit: '', txt });
const REACH_DIR = { lr: t('左右', 'left & right'), lrd: t('左右と下', 'sides & below'), all: t('上下左右', 'all 4 sides') };
const LAYER_C = [t('表土', 'Topsoil'), t('粘土層', 'Clay'), t('岩盤', 'Bedrock')];
const LAYER_U = [t('岩盤', 'Bedrock'), t('古い港の跡', 'Old harbor'), t('古い街道の跡', 'Old highway'), t('大地のつなぎ目', 'Seam of the lands')];
const upTo = (names: string[], n: number) => t(`${names[n - 1]}まで`, `to ${names[n - 1]}`);
const dig_ = (id: string, name: string, note: string, more: Partial<Skill> = {}): Skill => ({ id, branch: 'dig', name, note, cost: DT.cost[id], ...more });
export const DIG_SKILLS: Skill[] = [
  // Common の区画（根もと）
  dig_('dig_ext', t('発掘の追加申請', 'Extra dig time'), t('1 回の発掘作業 +3 秒／Lv（15 → 30 秒）', 'Each dig run +3 s per level (15 → 30 s)'), { fx: [{ kind: 'dig.sec', v: DT.ext[0], at: DT.ext }] }),
  dig_('dig_power', t('ツルハシの鍛え直し', 'Reforged pickaxe'), t('1 打の強さ +1（Lv1・3・5 で +1 ずつ。Lv2・4 は会心の確率 +10%：会心で 2 倍）', 'Strike power +1 (more at Lv3 and Lv5; Lv2 and Lv4 add +10% critical chance: ×2)'), {
    fx: [
      { kind: 'dig.power', v: DT.power[0], at: DT.power },
      { kind: 'dig.crit', v: DT.crit[1], at: DT.crit },
    ],
  }),
  dig_('dig_speed', t('手早い掘り方', 'Quick swings'), t('長押しで続けて打つ間隔 170 → 150・130・115・100・90 ms', 'Hold-strike interval 170 → 150, 130, 115, 100, 90 ms'), { requires: ['dig_power'], fx: [{ kind: 'dig.repeat', v: DT.repeat[0], at: DT.repeat }] }),
  dig_('dig_reach', t('広く掘る', 'Wide digging'), t('打ったマスの隣の、いまの層にも力の一部（Lv1：左右に 25% … Lv5：上下左右に 60%。はがれたら中身も出る）', 'Part of each strike hits the neighbours’ current layer (Lv1: sides 25% … Lv5: all 4 sides 60%; their contents come out too)'), {
    requires: ['dig_speed'],
    fx: [{ kind: 'dig.reach', v: DT.reach[0], at: DT.reach }],
    show: [dShow(t('力が届く向き', 'Directions'), DT.reachDir.map((d) => REACH_DIR[d]))],
  }),
  dig_('dig_lamp', t('発掘のランタン', 'Dig lantern'), t('ひびの隙間から、奥に埋まっているものがうっすら見える（ふだんは いまの層だけ → 1・2・3 枚手前から）・Lv4 でお題の気配（金色のにじみ）が さらに 2 枚先から・Lv5 で石板も', 'Faintly glimpse finds deeper in (normally only the current layer → 1, 2, 3 layers ahead); Lv4: target glow 2 layers further; Lv5: tablets too'), {
    requires: ['dig_ext'],
    show: [dShow(t('見え始める深さ', 'Sight'), lvTxt((v) => t(`${v} 枚手前から`, `${v} layer(s) ahead`), DT.lamp)), dShow(t('お題の気配', 'Target hints'), [t('なし', 'none'), t('なし', 'none'), t('なし', 'none'), t(`さらに ${DT.hint} 枚先から`, `${DT.hint} more layers`), t(`さらに ${DT.hint} 枚先から（石板も）`, `${DT.hint} more layers (tablets too)`)])],
  }),
  dig_('dig_deep', t('深い層の許可', 'Deep-layer permit'), t('掘れる層の上限：はじめは 2 層目まで（岩盤は国の許可が要る）。Lv1 で岩盤（Common の 3 層目）・Uncommon は Lv2 で 3 層目・Lv3 で 4 層目。ダンジョンは Lv1〜3 で 3 層・Lv4 で 5 層・Lv5 で 6 層', 'Deepest layer you may dig: layer 2 at first (bedrock needs a permit). Lv1: bedrock (Common layer 3); Uncommon layer 3 at Lv2, layer 4 at Lv3. Dungeons: 3 layers at Lv1–3, 5 at Lv4, 6 at Lv5'), {
    requires: ['dig_lamp'],
    show: [dShow(t('Common の荒れ地', 'Common wastelands'), DT.deep.C.slice(1).map((n) => upTo(LAYER_C, n))), dShow(t('Uncommon の荒れ地', 'Uncommon wastelands'), DT.deep.U.slice(1).map((n) => upTo(LAYER_U, n))), dShow(t('ダンジョンの深さ', 'Dungeon depth'), DIG_BALANCE.dungeon.deep.slice(1).map((n) => t(`${n} 層まで`, `${n} layers`)))],
  }),
  dig_('dig_study', t('研究の目利き', 'Keen research'), t('研究 Lv の上限：はじめは Lv3。Lv1 で Lv4・Lv2 で Lv5。Lv3〜5 は深い層ほど研究が進みやすい（層 n で 1 + 0.25 × (n − 1) × 倍率 個ぶん数える）', 'Research level cap: Lv3 at first; Lv4 at panel Lv1, Lv5 at Lv2. Lv3–5: deeper layers count more (layer n counts 1 + 0.25 × (n − 1) × multiplier)'), {
    requires: ['dig_deep'],
    show: [dShow(t('研究 Lv の上限', 'Research cap'), DT.cap.slice(1).map((n) => t(`Lv${n}`, `Lv${n}`))), dShow(t('深い層の倍率', 'Depth multiplier'), DT.deepMul.slice(1).map((m) => (m ? `×${m}` : t('なし', 'none'))))],
  }),
  dig_('dig_blast', t('発破', 'Blasting'), t('発破が使える（押したマスを真ん中に 3 × 3 の、いまの層を 1 枚ずつ一度にはがす・硬さに関係なく・1 回ごとに火薬代）。Lv で火薬代 2,000 → 1,500・1,000 G、Lv4 で 4 × 4・Lv5 で 5 × 5', 'Unlocks blasting (peel one layer off the 3 × 3 around the cell at once, however hard; powder each time). Powder 2,000 → 1,500 → 1,000 G; 4 × 4 at Lv4, 5 × 5 at Lv5'), {
    requires: ['dig_power'],
    show: [dShow(t('火薬代', 'Powder'), DT.blastCost.map((v) => `${v.toLocaleString('en-US')} G`)), dShow(t('大きさ', 'Size'), DT.blastSize.map((v) => `${v} × ${v}`))],
  }),
  dig_('dig_drill', t('掘削ドリル', 'Drill'), t('押したマス 1 つを奥へ N 層一気にはがす（Lv1：3 層 … Lv5：7 層）。1 回ごとに燃料代 1,000 G', 'Peel N layers off the tapped cell at once (Lv1: 3 … Lv5: 7). 1,000 G fuel each time'), {
    requires: ['dig_blast'],
    show: [dShow(t('奥へ', 'Deeper by'), lvTxt((v) => t(`${v} 層`, `${v} layers`), DT.drill))],
  }),
  dig_('dig_office', t('発掘隊の役所', 'Dig crew office'), t('発掘隊の人数の上限 1 → 2・3・3・4・5 人', 'Dig crew size limit 1 → 2, 3, 3, 4, 5'), {
    requires: ['dig_ext'],
    show: [dShow(t('発掘隊の上限', 'Crew limit'), DT.office.slice(1).map((n) => t(`${n} 人`, `${n}`)))],
  }),
  dig_('dig_crew', t('発掘隊の手際', 'Skilled crew'), t('発掘隊の 1 日に打つ回数 +20%／Lv', 'Dig crew strikes a day +20% per level'), { requires: ['dig_office'], fx: [{ kind: 'dig.crew', v: DT.crew[0], at: DT.crew }] }),
  // Uncommon の外周
  dig_('u_dig_ext2', t('長期の発掘許可', 'Long-term dig permit'), t('1 回の発掘作業 さらに +6 秒／Lv（最大 60 秒）', 'Each dig run +6 s more per level (max 60 s)'), { tier: 'U', emblem: 1, requires: ['dig_ext'], reqLv: { dig_ext: 5 }, fx: [{ kind: 'dig.sec', v: DT.ext2[0], at: DT.ext2 }] }),
  dig_('u_dig_auto', t('発掘隊の常駐（自動化）', 'Standing dig crew'), t('作業していない日も、許可のある荒れ地を発掘隊が掘る（作業中の速さの 20% → 40%・55%・70%・80%）。出土品・RP・研究は手で掘ったのと同じ。スタミナは減る', 'On days you are not digging, the crew digs permitted wastelands (20% → 40, 55, 70, 80% of the in-run pace). Finds, RP and research count the same. They tire'), {
    tier: 'U',
    emblem: 2,
    requires: ['dig_crew'],
    reqLv: { dig_crew: 3 },
    show: [dShow(t('作業していない日の速さ', 'Pace on idle days'), DT.auto.map((v) => t(`作業中の ${Math.round(v * 100)}%`, `${Math.round(v * 100)}% of in-run`)))],
  }),
  dig_('u_dig_power2', t('重機の貸し出し', 'Heavy machinery'), t('1 打の強さ さらに +1（Lv1・3・5 で +1 ずつ）。Uncommon の硬い層も楽に', 'Strike power +1 more (more at Lv3 and Lv5). Makes Uncommon’s hard layers easy'), { tier: 'U', requires: ['dig_power'], reqLv: { dig_power: 5 }, fx: [{ kind: 'dig.power', v: DT.power2[0], at: DT.power2 }] }),
  dig_('u_dig_route', t('常駐の段取り', 'Crew planning'), t('常駐で打つマスの選び方を賢く（Lv1：お題の気配のある層を優先・Lv3：研究 Lv の低いエクステを優先・Lv5：出土品の重なりを避ける）・常駐の速さ +10%／Lv', 'Smarter targets for the standing crew (Lv1: toward hidden targets; Lv3: low-research finds first; Lv5: avoid maxed finds); standing pace +10% per level'), {
    tier: 'U',
    requires: ['u_dig_auto'],
    fx: [{ kind: 'dig.autoSpeed', v: DT.autoSpeed[0], at: DT.autoSpeed }],
    show: [dShow(t('マスの選び方', 'Targeting'), [t('お題の気配を優先', 'targets first'), t('お題の気配を優先', 'targets first'), t('＋研究 Lv の低いもの', '+ low research'), t('＋研究 Lv の低いもの', '+ low research'), t('＋重なりを避ける', '+ avoid maxed')])],
  }),
  dig_('u_dig_relay', t('常駐の交代制', 'Crew shifts'), t('常駐で働く日のスタミナの減り −15%／Lv', 'Stamina drain on standing days −15% per level'), { tier: 'U', requires: ['u_dig_auto'], fx: [{ kind: 'dig.relay', v: DT.relay[0], at: DT.relay }] }),
  dig_('u_dig_mat', t('素材の選り分け', 'Material sorting'), t('掘り出した素材 +20%／Lv（端数は持ち越し）', 'Materials dug up +20% per level (fractions carry over)'), { tier: 'U', fx: [{ kind: 'dig.mat', v: DT.mat[0], at: DT.mat }] }),
];
SKILLS.push(...DIG_SKILLS);
/** 発掘の枝のパネル（すべてお金パネル） */
export const DIG_PANELS = DIG_SKILLS.map((k) => k.id);

// ---------------------------------------------------------------- 無限の強化パネル・研究への寄付（発掘 v2 の 6 段目）

const DI = DIG_BALANCE.infinite;
const DB = DIG_BALANCE.buyRp;
/** 無限の強化パネルの Lv lv の値段（RP）：cost × grow^(lv − 1)（step 単位）。lv ≤ 0 は 0 */
export const infCost = (lv: number) => (lv <= 0 ? 0 : Math.max(DI.step, Math.round((DI.cost * DI.grow ** (lv - 1)) / DI.step) * DI.step));
/** 無限の強化パネルの Lv lv の効き目の量：per × lv^curve（上がるほど少しずつ鈍くなる。上限なし） */
export const infAmt = (per: number, lv: number) => (lv <= 0 ? 0 : per * lv ** DI.curve);
/** 研究への寄付の n 回目（0 から）の値段（G）：cost × grow^n（step 単位） */
export const donateCost = (n: number) => Math.max(DB.step, Math.round((DB.cost * DB.grow ** Math.max(0, n)) / DB.step) * DB.step);
const inf_ = (id: string, kind: InfKind, name: string, note: string, requires: string[]): Skill => ({ id, branch: 'dig', tier: 'U', inf: kind, name, note, cost: 0, requires, reqLv: Object.fromEntries(requires.map((r) => [r, 5])) });
/**
 * 無限の強化パネル 3 枚（発掘の枝の Uncommon の外周の、いちばん外の段。研究パネル＝RP 払い・Lv の上限なし）。
 * 開く条件：対応する発掘のパネルを最大 Lv（速さ＝手早い掘り方 Lv5・力＝重機の貸し出し Lv5・範囲＝発破 Lv5 と掘削ドリル Lv5）
 */
export const INF_SKILLS: Skill[] = [
  inf_('u_dig_speed_inf', 'speed', t('発掘の速さ ∞', 'Dig speed ∞'), t(`長押しで続けて打つ間隔をさらに短く（Lv ごとに約 −${Math.round(DI.speed * 100)}%。上がるほど少しずつ鈍くなる・${DI.minMs} ms まで）。Lv の上限なし・研究ポイントで上げる`, `Hold-strike interval even shorter (about −${Math.round(DI.speed * 100)}% per level, tapering; down to ${DI.minMs} ms). No level cap · paid in RP`), ['dig_speed']),
  inf_('u_dig_power_inf', 'power', t('掘る力 ∞', 'Dig power ∞'), t(`1 打の強さ ×（1 ＋ 約 ${Math.round(DI.power * 100)}%／Lv。上がるほど少しずつ鈍くなる）。Lv の上限なし・研究ポイントで上げる`, `Strike power × (1 + about ${Math.round(DI.power * 100)}% per level, tapering). No level cap · paid in RP`), ['u_dig_power2']),
  inf_('u_dig_reach_inf', 'reach', t('掘る範囲 ∞', 'Dig reach ∞'), t(`発破が 1 回り大きく・ドリルが 1 層深くなる確率 +約 ${Math.round(DI.reach * 100)}%／Lv（上がるほど少しずつ鈍くなる。100% を超えたぶんは もう 1 つ）。Lv の上限なし・研究ポイントで上げる`, `Chance for a blast one size bigger and a drill one layer deeper +about ${Math.round(DI.reach * 100)}% per level (tapering; past 100% adds another). No level cap · paid in RP`), ['dig_blast', 'dig_drill']),
];
/**
 * 研究への寄付（お金パネル。発掘の枝の根もとの近く）：押すたびに G を払って RP を受け取る（回数の上限なし。値段は donateCost で上がる）。
 * 開く時期：Uncommon の調査依頼状を持っている、または Common のセクタを 1 つ制覇したあと（model.ts の donateLock）
 */
export const DONATE: Skill = {
  id: 'dig_donate',
  branch: 'dig',
  donate: true,
  name: t('研究への寄付', 'Research donation'),
  note: t(`国の研究所に寄付して、研究ポイントを受け取る（1 回 ${DB.rp} RP。押すたびに寄付の額が ×${DB.grow} ずつ上がる・回数の上限なし）`, `Donate to the national institute for research points (${DB.rp} RP each; each donation costs ×${DB.grow} more · no limit)`),
  cost: DB.cost,
};
SKILLS.push(...INF_SKILLS, DONATE);
/** 無限の強化パネルの id */
export const INF_PANELS = INF_SKILLS.map((k) => k.id);

// ---------------------------------------------------------------- スキルツリーの 2 区分（研究パネル・お金パネル）

/**
 * お金パネル（資金で開く・Lv1〜5）：技を除く 7 本の枝 × 5 ランクに 1 枚ずつ（35 枚）と、発掘の枝の 17 枚（DIG_PANELS）・研究への寄付（DONATE。押すたびに RP を買う）。
 * それ以外はすべて研究パネル（RP で開く・レベルなし。無限の強化パネル INF_SKILLS だけは Lv の上限なし）。
 * Common は仕様の 7 枚。Uncommon〜Legendary は「枝の根もと近く、Lv5 まであり、レベルを上げるほど素直に効く数字のパネル」＝
 * そのランク・その枝の追加のパネルの 1 枚目（`<ランク>_<枝>_1`。ロット・ブランド力のような最大 3 のパネルは無い）。
 * docs/ISLAND_PHASE1.md「地層の発掘と研究ポイント」「お金パネル 35 枚」
 */
export const MONEY_PANELS: Record<Tier, Partial<Record<Branch, string>>> = {
  C: { shop: 'host', craft: 'jig', logi: 'shortcut', buy: 'bulk', people: 'manual', ops: 'budget', sys: 'pos' },
  U: { shop: 'u_shop_1', craft: 'u_craft_1', logi: 'u_logi_1', buy: 'u_buy_1', people: 'u_people_1', ops: 'u_ops_1', sys: 'u_sys_1' },
  R: { shop: 'r_shop_1', craft: 'r_craft_1', logi: 'r_logi_1', buy: 'r_buy_1', people: 'r_people_1', ops: 'r_ops_1', sys: 'r_sys_1' },
  E: { shop: 'e_shop_1', craft: 'e_craft_1', logi: 'e_logi_1', buy: 'e_buy_1', people: 'e_people_1', ops: 'e_ops_1', sys: 'e_sys_1' },
  L: { shop: 'l_shop_1', craft: 'l_craft_1', logi: 'l_logi_1', buy: 'l_buy_1', people: 'l_people_1', ops: 'l_ops_1', sys: 'l_sys_1' },
};
/**
 * 研究パネルの RP の値段（仮）。ランク・枝ごとに、根もと（lo）から枝先（hi）へ、先に要るパネルの深さの順に並べて割り振る（平均は (lo + hi) / 2）。
 * Common 20〜80（平均 50）・Uncommon 60〜180（平均 120）・Rare 以降は Uncommon の 2.5 倍ずつ。大きめの研究パネル（以前の ✨）は big。
 * 人材の募集はチュートリアルで最初の 30 RP で開くので 30（START_RP）。
 */
export const RP_PRICE = DIG_BALANCE.rpPrice;
/** 開始時に持っている研究ポイント（マインちゃんの「前の世界の研究ノート」。新しいゲームだけ） */
export const START_RP = 30;
/** 以前のゴールドダスト 1 つ ＝ RP（古いセーブの移し替え・依頼の報酬の置き換え） */
export const RP_PER_DUST = 40;
const RP_FIXED: Record<string, number> = { hire: START_RP };
{
  const money = new Set([...Object.values(MONEY_PANELS).flatMap((x) => Object.values(x)), ...DIG_PANELS, DONATE.id]);
  const byId = new Map(SKILLS.map((k) => [k.id, k]));
  const tierOf = (k: Skill) => k.tier ?? 'C';
  // 同じランクの中の深さ（先に要るパネルのうち、同じランクのものをたどった最長の数）
  const depth = new Map<string, number>();
  const dep = (k: Skill): number => {
    const hit = depth.get(k.id);
    if (hit != null) return hit;
    depth.set(k.id, 0);
    const inner = (k.requires ?? []).map((r) => byId.get(r)).filter((r): r is Skill => !!r && tierOf(r) === tierOf(k));
    const d = inner.length ? 1 + Math.max(...inner.map(dep)) : 0;
    depth.set(k.id, d);
    return d;
  };
  for (const k of SKILLS) {
    k.cat = money.has(k.id) ? 'money' : 'research';
    k.rp = 0;
  }
  for (const tier of ['C', 'U', 'R', 'E', 'L'] as Tier[]) {
    const P = RP_PRICE[tier];
    const round = (v: number) => Math.max(P.step, Math.round(v / P.step) * P.step);
    for (const b of new Set(SKILLS.map((k) => k.branch))) {
      const list = SKILLS.filter((k) => tierOf(k) === tier && k.branch === b && k.cat === 'research' && !k.big && !k.inf).sort((x, y) => dep(x) - dep(y) || x.cost - y.cost);
      list.forEach((k, i) => (k.rp = round(P.lo + ((P.hi - P.lo) * (list.length > 1 ? i : 0)) / Math.max(1, list.length - 1))));
      // 1 枚だけの枝は真ん中の値段
      if (list.length === 1) list[0].rp = round((P.lo + P.hi) / 2);
    }
    for (const k of SKILLS) if (tierOf(k) === tier && k.big) k.rp = P.big;
  }
  for (const [id, v] of Object.entries(RP_FIXED)) if (byId.get(id)) byId.get(id)!.rp = v;
  // 無限の強化パネル：Lv1 の値段（Lv2 からは infCost）
  for (const k of INF_SKILLS) k.rp = infCost(1);
  // 研究パネルはレベルなし（効き目は Lv1 の値）：Lv2 からの効き目は持たない
  for (const k of SKILLS)
    if (k.cat === 'research') {
      delete k.up;
      delete k.upShow;
    }
}
/** 研究パネルの値段（RP。お金パネルは 0） */
export const rpCost = (k: Skill) => (isResearch(k) ? (k.rp ?? 0) : 0);

// 解放型のお金パネルの説明に「Lv2〜：…」を足す
for (const k of SKILLS) {
  // 外周のパネルの説明は fx から（「すべてのお店の売り場の強さ +13%・…」）
  if (!k.note && k.fx) k.note = k.fx.map((f) => `${FX_LABEL[f.kind]} ${fmtShown(fxShown(f), f.v)}`).join(t('・', ', '));
  const ups = shownOf(k).up;
  const list = ups.map((x) => `${x.label} ${fmtShown(x, x.v)}`).join(t('・', ', '));
  if (ups.length) k.note += t(`（Lv2〜：${list}）`, ` (Lv2+: ${list})`);
}
export const SKILL: Record<string, Skill> = Object.fromEntries(SKILLS.map((s) => [s.id, s]));
/** 枝（9 本）。docs/ISLAND_PHASE1.md「スキルツリー」：物流が主軸・人材で勝負・システムでハイテク企業・発掘（Lime。出会いのあと） */
export const BRANCHES: { key: Branch; name: string }[] = [
  { key: 'shop', name: t('お店', 'Shops') },
  { key: 'craft', name: t('工房', 'Workshop') },
  { key: 'logi', name: t('物流', 'Logistics') },
  { key: 'buy', name: t('調達', 'Buying') },
  { key: 'people', name: t('人材', 'People') },
  { key: 'ops', name: t('経営', 'Operations') },
  { key: 'sys', name: t('システム', 'Systems') },
  { key: 'tech', name: t('技', 'Crafts') },
  { key: 'dig', name: t('発掘', 'Digging') },
];
/** 技の「技を n つ」の条件を満たしているか（has：取ったスキル） */
export const anyOfMet = (k: Skill, has: (id: string) => boolean) => !k.anyOf || k.anyOf.ids.filter(has).length >= k.anyOf.n;

/** 雇える候補（Common のヒーロー）。月の初めに入れ替わる */
export const HIRE_POOL = [1001, 1002, 1003, 1004, 1005, 1006, 1007, 1008, 1009, 1010, 1011, 1012, 1013, 1014, 1015, 1016, 1017, 1018, 1019, 1020];

// ---------------------------------------------------------------- ランキング（エリアの外は飾り）

export const LAND_COMPANIES: [string, number][] = [
  [t('ミナトの百貨', 'Minato Department'), 420000],
  [t('ナギサ物産', 'Nagisa Products'), 260000],
  [t('アオバ商事', 'Aoba Trading'), 180000],
  [t('ツクモ工芸', 'Tsukumo Crafts'), 120000],
  [t('カザミ屋', 'Kazamiya'), 90000],
  [t('ホシノ雑貨', 'Hoshino Goods'), 70000],
  [t('イソベ商店', 'Isobe Store'), 48000],
  [t('ヨツバ堂', 'Yotsuba-do'), 30000],
];
export const WORLD_COMPANIES: [string, number][] = [
  [t('ギルド・オブ・ナイン', 'Guild of Nine'), 24000000],
  [t('セブンシーズ商会', 'Seven Seas Trading'), 15000000],
  [t('クラウン・ホールディングス', 'Crown Holdings'), 9800000],
  [t('ドラゴンゲート', 'Dragon Gate'), 7200000],
  [t('ルビーネット', 'Ruby Net'), 5100000],
  [t('グラファイト工業', 'Graphite Industries'), 3900000],
  [t('ブルーベリー海運', 'Blueberry Shipping'), 2600000],
  [t('セージ・ラジオ', 'Sage Radio'), 1800000],
];

// ---------------------------------------------------------------- 設備投資（建物ごと）

export interface Invest {
  id: string;
  /** どの建物に付けるか（建物ごと＝セクタごと。工房はセクタに 1 つ、倉庫は棟ごと） */
  kind: 'shop' | 'workshop' | 'warehouse' | 'museum';
  name: string;
  note: string;
  /** 段ごとの値段 */
  cost: number[];
}

/**
 * 設備投資（建物ごと）。棚・作業台・荷車・置き場所のような「設備」は、スキルツリーではなくここ（docs/ISLAND_PHASE1.md「設備投資」）。
 * 建物はセクタごとなので、新しいセクタでは入れ直す（タオックスで育てた設備をそのまま持ち込めない）。値段は以前のスキルと同じ
 */
export const INVESTS: Invest[] = [
  { id: 'shelves', kind: 'shop', name: t('棚を増やす', 'More shelves'), note: t('このお店の棚 +1（1 段ごと。別の商品を並べると売上が増える）', 'This shop’s shelves +1 per level (a different item adds sales)'), cost: [3000, 9000] },
  { id: 'sign', kind: 'shop', name: t('看板を出す', 'Signboard'), note: t('このお店の売り場の強さ +10%（1 段ごと）', 'This shop’s pull +10% per level'), cost: [2000, 4000, 8000] },
  { id: 'staffroom', kind: 'shop', name: t('アルバイトの控室', 'Part-timer room'), note: t('このお店のアルバイトの上限 +2', 'This shop can take 2 more part-timers'), cost: [2500] },
  { id: 'fixtures', kind: 'shop', name: t('陳列の什器', 'Display fixtures'), note: t('棚に並べる速さ +30%（1 段ごと）', 'Shelving speed +30% per level'), cost: [2500, 5000] },
  { id: 'backroom', kind: 'shop', name: t('裏の倉庫を広げる', 'Bigger backroom'), note: t('裏に置ける数 +20（1 段ごと）', 'Backroom +20 per level'), cost: [1500, 3000, 4000] },
  { id: 'bench', kind: 'workshop', name: t('作業台を増やす', 'More workbenches'), note: t('作業台 +1（1 段ごと。2 段目は工場にして、クラフトの日数 −20% も）', 'Workbench +1 per level (level 2 also cuts crafting days by 20%)'), cost: [5000, 22000] },
  { id: 'carts', kind: 'workshop', name: t('荷車を増やす', 'More carts'), note: t('運搬係 1 人が同時に出せる便 +1（1 段ごと）', 'Each hauler runs one more trip at once per level'), cost: [3000, 7000] },
  { id: 'truck', kind: 'workshop', name: t('小型トラック', 'Small truck'), note: t('積める数 ×2.5・運ぶ速さ ×1.5', 'Load ×2.5, hauling speed ×1.5'), cost: [8000] },
  { id: 'stockroom', kind: 'workshop', name: t('物置の整理', 'Tidy stockroom'), note: t('工房の物置 +40 個', 'Workshop stockroom +40'), cost: [2500] },
  { id: 'tools', kind: 'workshop', name: t('道具の新調', 'New tools'), note: t('クラフトの日数 −10%（1 段ごと）', 'Crafting −10% days per level'), cost: [3000, 6000, 12000] },
  { id: 'breakroom', kind: 'workshop', name: t('職人の休憩所', 'Crafters’ break room'), note: t('工房で働く人のスタミナの減り −30%', 'Crafters lose 30% less stamina'), cost: [2500] },
  { id: 'rack', kind: 'warehouse', name: t('倉庫の高い棚', 'Tall racks'), note: t('この倉庫の置き場所 +100 個', 'This warehouse holds 100 more'), cost: [6000] },
  // 遺物の展示館（発掘 v2 の 4 段目）：展示の枠 4 → 8・12・16
  { id: 'hall', kind: 'museum', name: t('展示室の増築', 'Gallery extension'), note: t('展示の枠 +4（4 → 8・12・16）', 'Display slots +4 (4 → 8, 12, 16)'), cost: DIG_BALANCE.museum.expand },
  // 発掘の道具（ツルハシの新調・ランタン・発破の道具）は、発掘 v2 の 2 段目でスキルツリーの「発掘」の枝へ移した（DIG_PANELS。古いセーブは版 4 で移す）
];
/** 以前の発掘の道具（工房の設備投資）→ 発掘の枝のパネル（版 3 → 4。段 → Lv：ツルハシ 1 段 Lv1・2 段 Lv3／ランタン Lv1／発破 Lv1） */
export const OLD_DIG_TOOLS: Record<string, { id: string; lv: number[] }> = { pick: { id: 'dig_power', lv: [1, 3] }, lantern: { id: 'dig_lamp', lv: [1] }, blast: { id: 'dig_blast', lv: [1] } };
/**
 * 以前のスキル → 設備投資（古いセーブの移し替え。deserializeP1）。
 * 外したスキルを持っていたら、いまのセクタの建物に同じ段を付ける（お金は取らない）
 */
export const SKILL_TO_INVEST: Record<string, string> = {
  shelf1: 'shelves',
  shelf2: 'shelves',
  parttime: 'staffroom',
  backroom: 'backroom',
  bench2: 'bench',
  bench3: 'bench',
  tidy: 'stockroom',
  cart2: 'carts',
  cart3: 'carts',
  truck: 'truck',
  rack: 'rack',
};
export const INVEST: Record<string, Invest> = Object.fromEntries(INVESTS.map((x) => [x.id, x]));

/** 移転は建てる値段の半分（最低 2,000 G）・工期の半分。撤去は建てる値段の 3 割が戻る */
export const MOVE = { rate: 0.5, min: 2000, days: 0.5, refund: 0.3 };

// ---------------------------------------------------------------- 地層の発掘と研究ポイント（docs/ISLAND_PHASE1.md「地層の発掘と研究ポイント」）

/** 発掘場のあるランク（Rare 以降は準備中） */
export type DigTier = 'C' | 'U';
export interface Stratum {
  name: string;
  /** 1 マスの硬さ（打つ回数。1 打の強さ 1 のとき）の範囲 */
  hard: [number, number];
  /** コードで描くときの色（仮。docs/ISLAND_ART_TODO.md） */
  color: string;
}
/**
 * 荒れ地 1 か所の発掘場（正面の壁）：横 w × 縦 h のマス目。各マスに奥行きの層が layers の数だけ（手前 → 奥）。
 * 叩くと手前の層から 1 枚ずつはがれる（どのマスも最初から叩ける）。奥の層ほど硬い。
 * layers の color は壁の面の色（仮。手前ほど明るい土、奥ほど暗く硬そうな岩。docs/ISLAND_ART_TODO.md）。
 * mat：素材が出たときの数。セクタの地図に荒れ地が 4 か所（WASTE）あり、1 か所に 1 枚の壁
 */
export const DIG: Record<DigTier, { w: number; h: number; layers: Stratum[]; mat: number; mats: Mat[] }> = {
  C: {
    w: DIG_BALANCE.wall.C[0],
    h: DIG_BALANCE.wall.C[1],
    mat: 3,
    mats: ['iron', 'wood', 'clay', 'glass'],
    layers: [
      { name: t('表土', 'Topsoil'), hard: DIG_BALANCE.hard.C[0], color: '#a77d4e' },
      { name: t('粘土層', 'Clay layer'), hard: DIG_BALANCE.hard.C[1], color: '#8a5f3c' },
      { name: t('岩盤', 'Bedrock'), hard: DIG_BALANCE.hard.C[2], color: '#615b57' },
    ],
  },
  U: {
    w: DIG_BALANCE.wall.U[0],
    h: DIG_BALANCE.wall.U[1],
    mat: 2,
    mats: ['cloth', 'paper', 'gem'],
    layers: [
      { name: t('岩盤', 'Bedrock'), hard: DIG_BALANCE.hard.U[0], color: '#77706b' },
      { name: t('古い港の跡', 'Old harbor ruins'), hard: DIG_BALANCE.hard.U[1], color: '#566a76' },
      { name: t('古い街道の跡', 'Old highway ruins'), hard: DIG_BALANCE.hard.U[2], color: '#54495e' },
      { name: t('大地のつなぎ目', 'Seam of the lands'), hard: DIG_BALANCE.hard.U[3], color: '#38364a' },
    ],
  },
};
/**
 * ダンジョンの壁（発掘 v2 の 4 段目。セクタで最後に掘りきった荒れ地の底から見つかる。入るたびに作り直す）：横 7 × 縦 9 × 奥行き 6 層。
 * 層の名前・色は仮（docs/ISLAND_ART_TODO.md）。硬さは DIG_BALANCE.dungeon.hard（セクタのランクごと。奥ほど硬い）。素材はそのセクタの荒れ地と同じ
 */
const DUNGEON_LAYERS = (): { name: string; color: string }[] => [
  { name: t('古い地下道', 'Old tunnels'), color: '#6b5a48' },
  { name: t('遺跡の床', 'Ruined floor'), color: '#5a5566' },
  { name: t('崩れた回廊', 'Fallen gallery'), color: '#4d4258' },
  { name: t('眠る宝物庫', 'Sleeping vault'), color: '#5b4526' },
  { name: t('封じられた祭壇', 'Sealed altar'), color: '#3a2c4c' },
  { name: t('大地の底', 'Bottom of the earth'), color: '#1f1a2e' },
];
export const DUNGEON_DIG: Record<DigTier, { w: number; h: number; layers: Stratum[]; mat: number; mats: Mat[] }> = {
  C: { w: DIG_BALANCE.dungeon.wall[0], h: DIG_BALANCE.dungeon.wall[1], mat: DIG.C.mat, mats: DIG.C.mats, layers: DUNGEON_LAYERS().map((x, k) => ({ ...x, hard: DIG_BALANCE.dungeon.hard.C[k] })) },
  U: { w: DIG_BALANCE.dungeon.wall[0], h: DIG_BALANCE.dungeon.wall[1], mat: DIG.U.mat, mats: DIG.U.mats, layers: DUNGEON_LAYERS().map((x, k) => ({ ...x, hard: DIG_BALANCE.dungeon.hard.U[k] })) },
};
/**
 * 荒れ地（未開拓エリア）：発掘場のあるセクタの地図に 2 × 2 マスを 4 か所。1 か所が 1 つの発掘場。
 * 置き場所は区画の内側（道路に面していないマス＝町の 1 マスの建物が建たない所）から、セクタの id で決める（model.ts の wasteSpots）
 */
export const WASTE = { count: 4, size: 2 };
/** 壁に埋まっているものの割合（マス × 層 1 枚あたり。お題・石板のほかに）：エクステ・素材。残りは土だけ */
export const DIG_ODDS = DIG_BALANCE.odds;
/** 石板を置く層（Common 1 枚・Uncommon 2 枚） */
export const TABLET_LAYERS: Record<DigTier, number[]> = { C: [2], U: [1, 3] };
/** 発掘隊（仕事「発掘」）：発掘作業のあいだだけ、適性の速さ 1.0 で 1 日に打つ回数（手で掘るほうが速い） */
export const DIG_AUTO = { perDay: DIG_BALANCE.autoPerDay };
/** 発破：Lv1 の火薬代（G。仮。Lv で安くなる：model.ts の blastCost） */
export const BLAST = { cost: DIG_BALANCE.tree.blastCost[0] };

/**
 * 研究ポイント（RP）の入り方（数字は仮）。研究レベルは Lv1〜5：Lv2・3・4・5 に上がるのに、重なりがそれぞれ 1・2・3・4 個要る。
 * first：新しいエクステを初めて掘る／lv：Lv2〜5 に上がる／topic：お題を掘る（その場で Lv5）／tablet：石板／present：お題をそろえて発表する
 */
export const RP_GAIN = DIG_BALANCE.rpGain;
/** 研究レベルに要る、掘った数の合計（Lv1〜5）：1・2・4・7・11 */
export const RESEARCH_NEED = [1, 2, 4, 7, 11];
/** 掘った数 → 研究レベル（0〜5） */
export const researchLv = (n: number) => RESEARCH_NEED.filter((x) => n >= x).length;

/**
 * セクタごとの出土品（ここ 1 か所にまとめる。bearko があとで差し替えられるように）。
 * topics：お題（Common 3・Uncommon 4。各層に 1 つずつ、上の層から順に）。どのセクタのお題も、ほかのセクタの出土品には入れない。
 * finds：お題以外（Common 8・Uncommon 10。何度も出る。となりのセクタと重なってよい＝研究レベルは続きから）。
 * いまの 17 商品のシリーズ（PRODUCTS）は入れない。選んだ理由は docs/ISLAND_PHASE1.md「出土品の一覧」。
 */
export const DIG_SITES: Record<string, { topics: number[]; finds: number[] }> = {
  // Common：職人の町の名残（道具・暮らし・祭り）
  c1: { topics: [1122, 1104, 1034], finds: [1011, 1056, 1031, 1096, 1008, 1016, 1105, 1111] },
  c2: { topics: [1160, 1075, 1019], finds: [1089, 1132, 1169, 1185, 1155, 1086, 1105, 1017] },
  c3: { topics: [1099, 1152, 1018], finds: [1011, 1010, 1004, 1081, 1097, 1164, 1183, 1001] },
  c4: { topics: [1182, 1061, 1193], finds: [1031, 1096, 1172, 1174, 1129, 1151, 1180, 1179] },
  c5: { topics: [1071, 1140, 1063], finds: [1064, 1067, 1066, 1037, 1118, 1058, 1157, 1141] },
  c6: { topics: [1163, 1173, 1131], finds: [1056, 1137, 1159, 1191, 1184, 1138, 1020, 1023] },
  c7: { topics: [1103, 1006, 1142], finds: [1016, 1141, 1013, 1124, 1058, 1098, 1181, 1139] },
  c8: { topics: [1108, 1177, 1189], finds: [1109, 1134, 1092, 1094, 1087, 1091, 1179, 1051] },
  // Uncommon：つながっていた 9 つのランド（港・道・市場・織物・都。お題に 8 つのランドのエクステ）
  u1: { topics: [2047, 2038, 2143, 2045], finds: [2019, 2647, 2640, 2160, 2089, 2086, 2151, 2157, 2084, 2122] },
  u2: { topics: [2131, 2034, 2099, 2042], finds: [2011, 2001, 2006, 2010, 2004, 2081, 2152, 2153, 2097, 2164] },
  u3: { topics: [2033, 2036, 2172, 2040], finds: [2017, 2009, 2111, 2178, 2140, 2095, 2037, 2063, 2064, 2067] },
  u4: { topics: [2141, 2193, 2043, 2044], finds: [2096, 2031, 2077, 2007, 2180, 2174, 2016, 2112, 2139, 2184] },
  u5: { topics: [2182, 2041, 2039, 2046], finds: [2118, 2129, 2154, 2142, 2115, 2186, 2130, 2158, 2161, 2121] },
};

// ---------------------------------------------------------------- 復刻品（発掘 v2 の 3 段目。docs/ISLAND_PHASE1.md「3. 復刻品」）

/** 復刻品の商品キー（「Relic-1122」。SKU は「Relic-1122:C」。いまの 17 商品のキーと重ならない） */
/**
 * ダンジョンの奥で出る、本来そのセクタでは手に入らないランクのエクステ（セクタごと・ランクごとに DIG_BALANCE.dungeon.pick 種。セクタの id の種で選ぶ）。
 * Common のセクタ：Uncommon（Uncommon のセクタのお題以外の出土品から。復刻品のレシピがある）・Rare・Epic。Uncommon のセクタ：Rare・Epic・Legendary。
 * Rare 以上はカタログのそのレアリティのエクステ（真の再販は除く・いまの 17 商品のシリーズは除く）。Epic・Legendary は 2 × 2
 */
export const DUNGEON_FINDS: Record<string, Partial<Record<Tier, number[]>>> = (() => {
  const RAR: Record<Tier, string> = { C: 'Common', U: 'Uncommon', R: 'Rare', E: 'Epic', L: 'Legendary' };
  const used = new Set(PRODUCTS.flatMap((p) => Object.values(p.ext)));
  const prodSeries = new Set(allSeries.filter((x) => x.items.some((e) => used.has(e.id))).map((x) => x.key));
  const byRar = (r: Tier) => [...new Set(allSeries.filter((x) => !prodSeries.has(x.key)).flatMap((x) => x.items.filter((e) => e.rarity === RAR[r] && !e.shin).map((e) => e.id)))].sort((a, b) => a - b);
  const uFinds = [...new Set(Object.entries(DIG_SITES).filter(([id]) => id.startsWith('u')).flatMap(([, x]) => x.finds))].sort((a, b) => a - b);
  // 文字列の種（FNV）と、種から決まる並べ替え
  const seed = (x: string) => {
    let h = 2166136261;
    for (let i = 0; i < x.length; i++) h = Math.imul(h ^ x.charCodeAt(i), 16777619);
    return h >>> 0;
  };
  const shuffle = (xs: number[], key: string) => {
    let a = seed(key) || 1;
    const r = () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t0 = a;
      t0 = Math.imul(t0 ^ (t0 >>> 15), t0 | 1);
      t0 ^= t0 + Math.imul(t0 ^ (t0 >>> 7), t0 | 61);
      return ((t0 ^ (t0 >>> 14)) >>> 0) / 4294967296;
    };
    const out = [...xs];
    for (let k = out.length - 1; k > 0; k--) {
      const m = Math.floor(r() * (k + 1));
      [out[k], out[m]] = [out[m], out[k]];
    }
    return out;
  };
  const pools: Partial<Record<Tier, number[]>> = { U: uFinds, R: byRar('R'), E: byRar('E'), L: byRar('L') };
  const out: Record<string, Partial<Record<Tier, number[]>>> = {};
  for (const id of Object.keys(DIG_SITES)) {
    const ups: Tier[] = id.startsWith('u') ? ['R', 'E', 'L'] : ['U', 'R', 'E'];
    out[id] = Object.fromEntries(ups.map((r) => [r, shuffle(pools[r] ?? [], `dungeon:${id}:${r}`).slice(0, DIG_BALANCE.dungeon.pick).sort((a, b) => a - b)]));
  }
  return out;
})();
export const relicKey = (ext: number) => `Relic-${ext}`;
export const isRelic = (key: string) => key.startsWith('Relic-');
/** 遺物の id から決まる種（同じ遺物はいつも同じレシピ・値段・日数） */
const relicHash = (ext: number) => {
  let x = (ext * 2654435761) >>> 0;
  x ^= x >>> 15;
  x = Math.imul(x, 2246822519) >>> 0;
  return (x ^ (x >>> 13)) >>> 0;
};
/** 遺物のエクステの名前（カタログの全シリーズから。日本語・英語） */
let relicNames: Map<number, [string, string]> | null = null;
const relicName = (ext: number): [string, string] => {
  relicNames ??= new Map(allSeries.flatMap((x) => x.items.map((e) => [e.id, [e.name, e.nameEn] as [string, string]] as const)));
  return relicNames.get(ext) ?? [`#${ext}`, `#${ext}`];
};
/**
 * 復刻品のレシピ：そのセクタの発掘の素材から、遺物の id で決める（同じ遺物はいつも同じ）。
 * Common：鉄・木材・粘土・ガラスから 2 種（4 個と 2 個。ガラスは高いので 2 個のほう）。
 * Uncommon：布・紙・宝石から 1〜2 種（3 個・2 個目は 1 個）＋ Common の素材 1 種（4 個）。数はいまの同じランクの商品と同じくらい（C 6.7・U 8.5 個）
 */
export function relicRecipe(ext: number, rank: Rar): Partial<Record<Mat, number>> {
  const hsh = relicHash(ext);
  const cm = DIG.C.mats;
  if (rank === 'C') {
    const a = cm[hsh % cm.length];
    const rest = cm.filter((m) => m !== a);
    const b = rest[Math.floor(hsh / 7) % rest.length];
    const [big, small] = a === 'glass' ? [b, a] : [a, b];
    return { [big]: 4, [small]: 2 };
  }
  const um = DIG.U.mats;
  const u1 = um[hsh % um.length];
  const two = Math.floor(hsh / 5) % 2 === 1;
  const u2 = um.filter((m) => m !== u1)[Math.floor(hsh / 11) % (um.length - 1)];
  const c = cm.filter((m) => m !== 'glass')[Math.floor(hsh / 13) % 3];
  return { [c]: 4, [u1]: 3, ...(two ? { [u2]: 1 } : {}) };
}
/** 同じランクのいまの商品の平均の値段（Common の商品。アンコモンは SKU の値段で ×UNCOMMON.price） */
const AVG_PRICE = PRODUCTS.filter((p) => !p.tier).reduce((a, p) => a + p.price, 0) / PRODUCTS.filter((p) => !p.tier).length;
/** 復刻品 1 つの定義（遺物の id・出たセクタのランク） */
function relicDef(ext: number, rank: Rar): ProductDef {
  const hsh = relicHash(ext);
  const B = DIG_BALANCE.relic;
  const [ja, en] = relicName(ext);
  // 値段：平均 × 1.25 を中心に ±10%（遺物ごとに少しずつ違う）
  const price = Math.round((AVG_PRICE * B.priceMul * (0.9 + 0.1 * (hsh % 3))) / 10) * 10;
  const recipe = relicRecipe(ext, rank);
  return { key: relicKey(ext), name: t(`復刻 ${ja}`, `Revival ${en}`), ext: { C: ext, U: ext }, price, batch: B.batch, days: B.days[(hsh >>> 3) % B.days.length], recipe: { C: recipe, U: recipe }, demand: B.demandBase, relic: { ext, rank } };
}
/**
 * 復刻品（発掘で出るエクステ 1 つにつき 1 つ。DIG_SITES の全セクタの topics と finds）。ランクは出たセクタのランク。
 * いまの 17 商品と同じエクステ（シリーズ）は作らない（いまの DIG_SITES には無い。足したときのため）
 */
export const RELICS: ProductDef[] = (() => {
  const own = new Set(PRODUCTS.flatMap((p) => [p.ext.C % 1000, p.ext.U % 1000]));
  const out = new Map<number, ProductDef>();
  for (const [sec, d] of Object.entries(DIG_SITES)) {
    const tier = SECTORS.find((x) => x.id === sec)?.tier;
    if (tier !== 'C' && tier !== 'U') continue;
    for (const id of [...d.topics, ...d.finds]) if (!out.has(id) && !own.has(id % 1000)) out.set(id, relicDef(id, tier));
  }
  return [...out.values()];
})();
for (const p of RELICS) PRODUCT[p.key] = p;
/** その遺物（エクステの id）の復刻品。無ければ undefined */
export const relicOf = (ext: number): ProductDef | undefined => PRODUCT[relicKey(ext)];

/** 石板（読み物）。Common：栄えていた頃の Lime の職人の町／Uncommon：Lime がほかの国とつながって交易していた頃（9 つのランドの謎は伏線）／Rare 以降：枠だけ */
export interface Tablet {
  id: string;
  sector: string;
  title: string;
  text: string;
  /** まだ読めない（Rare 以降の枠） */
  soon?: boolean;
}
export const TABLETS: Tablet[] = [
  { id: 'tab_c1', sector: 'c1', title: t('職人の町', 'The crafters’ town'), text: t('栄えていた頃の Lime には、ここに職人の町があった。人々は工房に集まり、道具から暮らしの品まで、なんでも自分たちの手で作った。', 'In Lime’s golden age, a crafters’ town stood here. People gathered in workshops and made everything by hand, from tools to everyday goods.') },
  { id: 'tab_c2', sector: 'c2', title: t('湖のガラス', 'Glass by the lake'), text: t('湖のほとりで、Lime の職人たちは砂からガラスを吹いた。町で作った品は、舟で湖の向こうへ運ばれた。', 'By the lake, Lime’s crafters blew glass from sand. Goods made in town were ferried across the water.') },
  { id: 'tab_c3', sector: 'c3', title: t('丘の鍛冶場', 'The hill forge'), text: t('丘の鍛冶場では、鉄を打つ音が一日じゅう響いた。ここで鍛えた道具が、町の仕事を支えた。', 'At the hill forge, hammers rang all day. The tools forged here kept the town at work.') },
  { id: 'tab_c4', sector: 'c4', title: t('にぎやかな市場', 'The busy market'), text: t('栄えていた Lime の町には大勢が暮らし、家具も服も、隣どうしで作って分け合った。市場はいつもにぎわっていた。', 'Many lived in Lime’s thriving town, making furniture and clothes for each other. The market was always lively.') },
  { id: 'tab_c5', sector: 'c5', title: t('職人の祭り', 'The crafters’ festival'), text: t('年に一度、職人たちは作った品を持ち寄り、祭りで見せ合った。いちばんの品を作った者が、町の長になった。', 'Once a year, crafters showed their work at a festival. Whoever made the finest piece became head of the town.') },
  { id: 'tab_c6', sector: 'c6', title: t('森と畑の村', 'Village of woods and fields'), text: t('森の木を切り、畑を耕し、町の職人に材料を届けた。この村が、町の暮らしを支えていた。', 'They felled trees, tilled fields and brought materials to the town’s crafters. This village kept the town going.') },
  { id: 'tab_c7', sector: 'c7', title: t('はじまりの国', 'The Land of Beginnings'), text: t('職人たちは紙に技を書き残し、弟子へと伝えた。「はじまりの国」の名は、ここで技がはじまったことから。', 'Crafters wrote their skills on paper and passed them to apprentices. The “Land of Beginnings” is named for where the crafts began.') },
  { id: 'tab_c8', sector: 'c8', title: t('町の外へ', 'Beyond the town'), text: t('職人の町はやがて大きくなり、店どうしの競い合いが始まった。粘土の人形は町の外へも売られたが、ある時から、町は静かに荒れていった。', 'The crafters’ town grew, and shops began to compete. Clay dolls were sold far beyond its walls — until, one day, the town quietly fell to ruin.') },
  { id: 'tab_u1a', sector: 'u1', title: t('どこへでも行ける港', 'A harbor to anywhere'), text: t('この港から、Lime の船はどこへでも行けた。海の向こうの国々と品物を交わし、港はいつも荷であふれていた。', 'From this harbor, Lime’s ships could go anywhere. They traded with lands across the sea, and the docks overflowed with cargo.') },
  { id: 'tab_u1b', sector: 'u1', title: t('古い海図', 'An old sea chart'), text: t('古い海図には、9 つの土地が 1 本の航路で結ばれている。いまの地図には、その航路が無い。', 'An old chart links nine lands with a single route. Today’s maps show no such route.') },
  { id: 'tab_u2a', sector: 'u2', title: t('山からの鉄', 'Iron from the mountains'), text: t('鍛冶の町の鉄は、遠いグラファイトの山から運ばれてきた。Lime と山の国は、交易の道でつながっていた。', 'The smiths’ iron came from the far Graphite mountains. Lime and the mountain land were joined by a trade road.') },
  { id: 'tab_u2b', sector: 'u2', title: t('途切れた道', 'The broken road'), text: t('道は 9 つの土地を巡っていた。どこで道が切れたのか、記録は途中で途切れている。', 'The road once circled all nine lands. Where it broke, the records do not say.') },
  { id: 'tab_u3a', sector: 'u3', title: t('9 つの品の市場', 'A market of nine lands'), text: t('坂の上の市場には、9 つの土地の品が並んだ。タンジェリンの果実も、ここでは珍しくなかった。', 'The hilltop market sold goods from all nine lands. Even Tangerine fruit was nothing unusual here.') },
  { id: 'tab_u3b', sector: 'u3', title: t('ひとつの通貨', 'One currency'), text: t('商人の帳簿には、9 つの土地の名が同じ通貨で書かれている。世界は、もとは 1 つだった。', 'Merchants’ ledgers list all nine lands in one currency. The world was once one.') },
  { id: 'tab_u4a', sector: 'u4', title: t('9 色の織物', 'A cloth of nine colors'), text: t('織物の模様は、9 つの土地の色を 1 枚に織り込んだもの。どの色も、となりの色とつながっている。', 'The pattern weaves the colors of nine lands into one cloth. Every color touches the next.') },
  { id: 'tab_u4b', sector: 'u4', title: t('ひとつの谷', 'One valley'), text: t('グレープとセージの職人は、同じ機で布を織った。2 つの土地は、もとは 1 つの谷だった。', 'Grape and Sage weavers shared one loom. The two lands were once a single valley.') },
  { id: 'tab_u5a', sector: 'u5', title: t('石の地図', 'The stone map'), text: t('大きな街の広場に、9 つの土地を描いた石の地図がある。真ん中に、ひとつの大地が描かれている。', 'In the city square lies a stone map of nine lands. At its center is a single, whole land.') },
  { id: 'tab_u5b', sector: 'u5', title: t('霧の向こう', 'Beyond the mist'), text: t('ある日、大地は 9 つに分かれた。そのうちいくつかは、霧の向こうに見えなくなったという。', 'One day, the land split into nine. Some of them, it is said, vanished beyond the mist.') },
  // Rare 以降：枠だけ（準備中）
  ...['r1', 'r2', 'r3', 'r4'].flatMap((id) =>
    ['a', 'b'].map((x): Tablet => ({ id: `tab_${id}${x}`, sector: id, title: t('（準備中）', '(Coming soon)'), text: t('まだ読めない。', 'Not readable yet.'), soon: true })),
  ),
];
export const TABLET: Record<string, Tablet> = Object.fromEntries(TABLETS.map((x) => [x.id, x]));

/**
 * セクター長（町の長・シャドーヒーロー）の仮の絵：MCH のヒーローのデータに「シャドー」の区分が無いので、
 * セクタごとに replica のヒーロー（Common のセクタは RepC、Uncommon は RepB）を割り当てる。差し替えはここだけ（docs/ISLAND_ART_TODO.md）。
 */
export const SECTOR_CHIEF: Record<string, number> = {
  c1: 12023, // ミケランジェロ（職人の町のはじまり）
  c2: 12006, // アルキメデス（湖・水）
  c3: 12031, // ビスマルク（鉄の丘）
  c4: 12026, // 豊臣秀吉（大勢の暮らし・城下町）
  c5: 12030, // 出雲阿国（お祭り）
  c6: 12019, // 金太郎（森と畑）
  c7: 12036, // 樋口一葉（技を書き残した町）
  c8: 12041, // ベンジャミン・フランクリン（商売敵の町）
  u1: 13037, // マゼラン（どこへでも行ける港）
  u2: 13018, // 武蔵坊弁慶（金物・刀）
  u3: 13003, // 平賀源内（商人の坂・宣伝）
  u4: 13035, // 小野小町（織物）
  u5: 13044, // 徳川家康（大都市）
};

/** 到着の案内の「この町の地層には[[〇〇]]が眠っているはず」（docs/ISLAND_PHASE1.md「お題・発表・調査依頼状」） */
export const DIG_THEME: Record<string, string> = {
  c1: t('職人の町のはじまり', 'the start of the crafters’ town'),
  c2: t('湖のガラス細工', 'the lakeside glasswork'),
  c3: t('丘の鍛冶場', 'the hill forge'),
  c4: t('大勢の暮らし', 'the life of many'),
  c5: t('職人の祭り', 'the crafters’ festival'),
  c6: t('森と畑の村', 'a village of woods and fields'),
  c7: t('書き残された技', 'crafts written down'),
  c8: t('粘土の人形', 'clay dolls'),
  u1: t('どこへでも行けた港', 'a harbor to anywhere'),
  u2: t('山からの鉄の道', 'the iron road from the mountains'),
  u3: t('9 つのランドの市場', 'a market of nine lands'),
  u4: t('9 色の織物', 'a cloth of nine colors'),
  u5: t('石の地図の都', 'the city of the stone map'),
};

/** 発掘の依頼（セクタに 1 つ）：古い〇〇を掘り出す（お題以外の出土品から）。報酬は RP（Common 40・Uncommon 80） */
export const DIG_REQUEST: Record<string, { ext: number; name: string; from: string }> = {
  c1: { ext: 1111, name: t('懐中時計', 'Pocket Watch'), from: t('タオックスの町内会', 'Taox council') },
  c2: { ext: 1086, name: t('アンモナイト', 'Ammonite'), from: t('湖の漁師', 'A lake fisher') },
  c3: { ext: 1010, name: t('ノービスシールド', 'Novice Shield'), from: t('丘の鍛冶屋', 'A hill smith') },
  c4: { ext: 1179, name: t('ネズミ捕り', 'Mouse Trap'), from: t('キッチョムシティの町内会', 'Kitchom City council') },
  c5: { ext: 1064, name: t('フルート', 'Flute'), from: t('お祭りの楽団', 'The festival band') },
  c6: { ext: 1137, name: t('ハチミツ', 'Honey'), from: t('村の養蜂家', 'A village beekeeper') },
  c7: { ext: 1016, name: t('スクロール', 'Scrolls'), from: t('サクラコシティの町内会', 'Sakurako City council') },
  c8: { ext: 1092, name: t('ステゴエッグ', 'Stego Egg'), from: t('ペストタウンの古物商', 'A Pest Town antique dealer') },
  u1: { ext: 2647, name: t('クラブシェル', 'Crab Shell'), from: t('港の船大工', 'A harbor shipwright') },
  u2: { ext: 2153, name: t('鉄製パンジャンドラム', 'Iron Panjandrum'), from: t('鍛冶組合の長老', 'An elder of the smiths’ guild') },
  u3: { ext: 2111, name: t('エリート懐中時計', 'Elite Pocket Watch'), from: t('坂の時計屋', 'The slope watchmaker') },
  u4: { ext: 2016, name: t('エリートスクロール', 'Elite Scrolls'), from: t('織物組合の記録係', 'The weavers’ archivist') },
  u5: { ext: 2115, name: t('にゃ～さんのスクーター', 'Nya’s Scooter'), from: t('ザックシティの博物館', 'The Zack City museum') },
};

// ---------------------------------------------------------------- 商品開発・宣伝・調査・依頼・給与

/** アンコモンの開発：値段は Common の値段 × 40、10 日（「魔法の釜」が要る） */
export const DEV = { rate: 4, days: 10 };

export interface Ad {
  id: string;
  name: string;
  note: string;
  cost: number;
  days: number;
  boost: number;
}
export const ADS: Ad[] = [
  { id: 'flyer', name: t('チラシ配り', 'Flyers'), note: t('10 日間、自社のお店の売り場の強さ +15%', 'Your shops’ pull +15% for 10 days'), cost: 1500, days: 10, boost: 0.15 },
  { id: 'poster', name: t('駅のポスター', 'Station posters'), note: t('30 日間、自社のお店の売り場の強さ +20%', 'Your shops’ pull +20% for 30 days'), cost: 5000, days: 30, boost: 0.2 },
  { id: 'event', name: t('店頭イベント', 'In-store event'), note: t('5 日間、自社のお店の売り場の強さ +50%', 'Your shops’ pull +50% for 5 days'), cost: 4000, days: 5, boost: 0.5 },
];

/** 他社の調査：段階ごとに分かることが増える（見習いの速さで 1 日 1） */
export const INTEL = [5, 12, 20];

export interface Mission {
  id: string;
  /** このセクタでだけ受けられる（無ければどこでも） */
  sector?: string;
  from: string;
  title: string;
  text: string;
  reward: number;
  /** 研究ポイントの報酬（受け取るときに会社の RP へ。以前の ✨ 1 つ = RP_PER_DUST） */
  rp?: number;
  /** 発掘の依頼：このエクステを掘り出す（研究ノートに 1 つ以上） */
  dig?: number;
}
export const MISSIONS: Mission[] = [
  { id: 'first_sale', from: t('町内会', 'Neighborhood council'), title: t('はじめての売上', 'First sale'), text: t('お店で商品を 1 つ売る', 'Sell one item in your shop'), reward: 1000 },
  { id: 'sensu100', from: t('近所の住民', 'A neighbor'), title: t('夏祭りにセンスを', 'Fans for the festival'), text: t('ひと月にセンスを 15 個売る', 'Sell 15 Sensu in one month'), reward: 3000 },
  { id: 'ad', from: t('町内会', 'Neighborhood council'), title: t('お店を知ってほしい', 'Let people know'), text: t('宣伝広報をする', 'Run an ad'), reward: 1000 },
  { id: 'two_shops', from: t('商店会', 'Merchants’ association'), title: t('通りににぎわいを', 'Liven up the street'), text: t('お店を 2 軒にする', 'Open a second shop'), reward: 3000 },
  { id: 'research', from: t('商店会', 'Merchants’ association'), title: t('ライバルを知る', 'Know your rivals'), text: t('他社のお店を調査する', 'Research a rival store'), reward: 1500 },
  { id: 'lantern50', from: t('駅長', 'Stationmaster'), title: t('夜道を明るく', 'Light up the night'), text: t('ひと月にランタンを 10 個売る', 'Sell 10 Lanterns in one month'), reward: 3000 },
  { id: 'uncommon', from: t('収集家', 'A collector'), title: t('めずらしい品を', 'Something rare'), text: t('アンコモンを合わせて 5 個売る', 'Sell 5 Uncommons in total'), reward: 5000, rp: 40 },
  { id: 'rank3', from: t('商店会', 'Merchants’ association'), title: t('エリアの顔に', 'Face of the area'), text: t('月の報告でエリア 3 位以内に入る', 'Finish a month in the area top 3'), reward: 5000, rp: 40 },
  // セクタの依頼（そのセクタでだけ受けられる。id はセーブと繋がる）
  // 湖・丘の依頼は、そのセクタの「まだ誰も売っていない」商品（ランタン・マレットは他店で供給が足りているので、ゴブレット・ナイフに）
  { id: 'c2_goblet', sector: 'c2', from: t('湖の宿', 'The lakeside inn'), title: t('湖畔で乾杯', 'A toast by the lake'), text: t('ひと月にゴブレットを 10 個売る', 'Sell 10 Goblets in one month'), reward: 4000, rp: 40 },
  { id: 'c2_top', sector: 'c2', from: t('ユーホタウンの町内会', 'Yuho Town council'), title: t('湖の一番店', 'Top shop on the lake'), text: t('ユーホタウンで 2 か月続けて 1 位になる', 'Become #1 in Yuho Town two months in a row'), reward: 10000, rp: 40 },
  { id: 'c3_knife', sector: 'c3', from: t('丘の上の大工さん', 'A hilltop carpenter'), title: t('ナイフを 10 本', 'Ten Knives'), text: t('ひと月にナイフを 10 本売る', 'Sell 10 Knives in one month'), reward: 4000, rp: 40 },
  { id: 'c3_top', sector: 'c3', from: t('リデル・ヒルズの町内会', 'Riddle Hills council'), title: t('丘の一番店', 'Top shop on the hill'), text: t('リデル・ヒルズで 2 か月続けて 1 位になる', 'Become #1 in Riddle Hills two months in a row'), reward: 10000, rp: 40 },
  { id: 'c4_top', sector: 'c4', from: t('キッチョムシティの町内会', 'Kitchom City council'), title: t('町いちばんの店', 'Top shop in town'), text: t('キッチョムシティで 2 か月続けて 1 位になる', 'Become #1 in Kitchom City two months in a row'), reward: 10000, rp: 40 },
  { id: 'c5_top', sector: 'c5', from: t('お祭りの実行委員会', 'The festival committee'), title: t('お祭りの顔に', 'Face of the festival'), text: t('オマツリタウンで 2 か月続けて 1 位になる', 'Become #1 in Omatsuri Town two months in a row'), reward: 10000, rp: 40 },
  { id: 'c6_top', sector: 'c6', from: t('ジラ・カントリーの村長', 'Zira Country’s village head'), title: t('村の一番店', 'Top shop in the village'), text: t('ジラ・カントリーで 2 か月続けて 1 位になる', 'Become #1 in Zira Country two months in a row'), reward: 10000, rp: 40 },
  { id: 'c7_top', sector: 'c7', from: t('サクラコシティの町内会', 'Sakurako City council'), title: t('桜の一番店', 'Top shop under the blossoms'), text: t('サクラコシティで 2 か月続けて 1 位になる', 'Become #1 in Sakurako City two months in a row'), reward: 10000, rp: 40 },
  { id: 'c8_top', sector: 'c8', from: t('ペストタウンの商店会', 'Pest Town merchants'), title: t('激戦区の一番店', 'Top of the battleground'), text: t('ペストタウンで 2 か月続けて 1 位になる', 'Become #1 in Pest Town two months in a row'), reward: 10000, rp: 40 },
  { id: 'u1_dev', sector: 'u1', from: t('港の商人', 'A harbor merchant'), title: t('新しい品を', 'Something new'), text: t('アンコモンを 1 つ開発する', 'Develop one Uncommon'), reward: 8000, rp: 40 },
  { id: 'u1_top', sector: 'u1', from: t('ウメコタウンの商工会', 'Umeko Town guild'), title: t('港の一番店', 'Top shop in the harbor'), text: t('ウメコタウンで 2 か月続けて 1 位になる', 'Become #1 in Umeko Town two months in a row'), reward: 30000, rp: 80 },
  { id: 'u2_top', sector: 'u2', from: t('ヤツカノタウンの鍛冶組合', 'Yatsukano smiths’ guild'), title: t('金物の町の一番店', 'Top shop in the hardware town'), text: t('ヤツカノタウンで 2 か月続けて 1 位になる', 'Become #1 in Yatsukano Town two months in a row'), reward: 32000, rp: 80 },
  { id: 'u3_ads', sector: 'u3', from: t('坂の商店会', 'Slope merchants'), title: t('坂を宣伝で', 'Advertise the slope'), text: t('宣伝を 2 種類以上同時にする', 'Run 2 or more kinds of ads at once'), reward: 6000 },
  { id: 'u3_top', sector: 'u3', from: t('エムケーシティの商店会', 'MK City association'), title: t('坂の一番店', 'Top shop on the slope'), text: t('エムケーシティで 2 か月続けて 1 位になる', 'Become #1 in MK City two months in a row'), reward: 35000, rp: 80 },
  { id: 'u4_top', sector: 'u4', from: t('ゴリ・ラグズの織物組合', 'Gori Rugs weavers’ guild'), title: t('織物の町の一番店', 'Top shop in the weaving town'), text: t('ゴリ・ラグズで 2 か月続けて 1 位になる', 'Become #1 in Gori Rugs two months in a row'), reward: 38000, rp: 80 },
  { id: 'u5_top', sector: 'u5', from: t('ザックシティの商工会議所', 'Zack City chamber of commerce'), title: t('大都市の一番店', 'Top shop in the big city'), text: t('ザックシティで 2 か月続けて 1 位になる', 'Become #1 in Zack City two months in a row'), reward: 40000, rp: 80 },
  // 発掘の依頼（セクタに 1 つ。id は <セクタ>_dig。報酬は RP だけ）
  ...Object.entries(DIG_REQUEST).map(([sec, q]): Mission => ({
    id: `${sec}_dig`,
    sector: sec,
    from: q.from,
    title: t(`古い${q.name}を探して`, `Find an old ${q.name}`),
    text: t(`発掘場で「${q.name}」を掘り出す`, `Dig up a ${q.name} at the dig site`),
    reward: 0,
    rp: sec.startsWith('u') ? 80 : 40,
    dig: q.ext,
  })),
];
/** 依頼の報酬の文（お金・RP。RP だけの依頼はお金を書かない） */
export const rewardText = (m: Mission) =>
  m.reward > 0 && m.rp ? t(`報酬 ${m.reward.toLocaleString('en-US')} G・研究 ${m.rp} RP`, `Reward ${m.reward.toLocaleString('en-US')} G + ${m.rp} RP`) : m.reward > 0 ? t(`報酬 ${m.reward.toLocaleString('en-US')} G`, `Reward ${m.reward.toLocaleString('en-US')} G`) : t(`報酬 研究 ${m.rp ?? 0} RP`, `Reward ${m.rp ?? 0} RP`);

/** 賞与：スタミナが満タンになる。昇給：作業の速さ +5%（3 段まで）、月給 +15%（基準の月給に対して） */
export const PAY = { bonusBase: 800, bonusRate: 0.3, raiseSpeed: 0.05, raiseWage: 0.15, raiseMax: 3 };

// ---------------------------------------------------------------- 調達ランク

/**
 * 調達ランク（Lv.1〜100）。月に買える素材の数の合計に上限がある（ランクとスキルで上がる）。
 * 経験値：買った数 1 個で 1（調達係が買うと適性の速さ倍）＋ 1 回の買い付けで 5。
 */
export const PROC = { maxLv: 100, base: 100, perLv: 20, expBase: 50, expPerLv: 10, perBuy: 5 };
/** 次のランクまでの経験値 */
export const procNeed = (lv: number) => PROC.expBase + PROC.expPerLv * lv;

// ---------------------------------------------------------------- ゲームの進行速度

/** 1 日の長さ（ms、標準）。体感に合わせて 1.2 秒（ひと月 36 秒） */
export const DAY_BASE_MS = 1200;
/** 進行速度（システム → 進行速度）。1.5 倍・2 倍はスキルで選べるようになる */
export const PACES: { v: number; skill?: string }[] = [{ v: 1 }, { v: 1.5, skill: 'pace1' }, { v: 2, skill: 'pace2' }];
