/**
 * フェーズ 1「新天地で実績を上げろ」の数値（docs/ISLAND_PHASE1.md）。
 * 素材 → クラフト → 運搬 → 陳列 → 販売。商品は MCH の Common エクステ 5 シリーズ。
 */
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
export const PRODUCT: Record<string, ProductDef> = Object.fromEntries(PRODUCTS.map((p) => [p.key, p]));

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
  kind: 'workshop' | 'shop' | 'food' | 'warehouse' | 'depot' | 'fun' | 'big';
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
];
export const P1B: Record<string, P1Building> = Object.fromEntries(P1_BUILDINGS.map((b) => [b.id, b]));

// ---------------------------------------------------------------- 従業員

export type Task = 'craft' | 'transport' | 'shop' | 'explore' | 'intel' | 'buy' | 'side' | 'manager' | 'train';
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

export type Branch = 'shop' | 'craft' | 'logi' | 'buy' | 'people' | 'ops' | 'sys' | 'tech';

export interface Skill {
  id: string;
  branch: Branch;
  name: string;
  /** 効き目（数字で書く） */
  note: string;
  cost: number;
  requires?: string[];
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
  /** ゴールドダストで取る（資金は要らない。cost は 0） */
  dust?: number;
  /** 封印（Epic・Legendary の外周。名前は「???」。まだ取れない） */
  sealed?: boolean;
  /** 準備中（まだ取れない） */
  soon?: boolean;
  /**
   * 最大レベル（2〜5）。無ければ数字の効果のパネルは 5、✨ は 3。解放型（建物・商品・ルート・人材の募集・進行速度など）は 2〜3 を書く。
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
}

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
  | 'flow';
export interface Fx {
  kind: FxKind;
  v: number;
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
}
/** 数で足す効き目（ロット・ブランド力）：レベルで 1 ずつ（v × lv）。このパネルは最大 3 */
export const FX_LIN: FxKind[] = ['lot', 'brand'];
/** 下げる効き目（表示で −） */
export const FX_DOWN: FxKind[] = ['craftDays', 'haulDays', 'matPrice', 'buyDays', 'stamina', 'wage', 'upkeep', 'rally'];
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
};
/** fx を表示の行に */
export const fxShown = (f: Fx): Shown => ({ label: FX_LABEL[f.kind], v: f.v, unit: f.kind === 'apt' || f.kind === 'brand' || f.kind === 'lot' ? '' : '%', down: FX_DOWN.includes(f.kind), lin: FX_LIN.includes(f.kind) });

/** レベルのコストの倍率（Lv1〜5。合計 20）。docs/ISLAND_PHASE1.md「パネルのレベル」 */
export const LV_COST = [1, 2, 3.5, 5.5, 8];
/** レベル n の効果の倍率：1 + 0.25(n − 1)（Lv5 で 2 倍）。未取得 0 */
export const lvMulOf = (lv: number) => (lv <= 0 ? 0 : 1 + 0.25 * (lv - 1));
/** 最大レベル（封印・準備中は 1） */
export const maxLv = (k: Skill) => (k.sealed || k.soon ? 1 : (k.max ?? (k.dust ? 3 : 5)));
/** そのレベル（lv）にするコスト（GUM）：round(cost × 倍率 / 100) × 100 */
export const levelCost = (k: Skill, lv: number) => Math.round((k.cost * LV_COST[Math.max(0, Math.min(LV_COST.length, lv) - 1)]) / 100) * 100;
/** ✨ のパネルのそのレベルのダスト（✨3 → ✨4 → ✨5） */
export const levelDust = (k: Skill, lv: number) => (k.dust ? k.dust + lv - 1 : 0);
/** 効き目の表示の行：レベル lv のときの値（up は Lv2 から） */
export const shownAt = (x: Shown, lv: number, up = false) => (up ? x.v * Math.max(0, lv - 1) : x.lin ? x.v * lv : x.v * lvMulOf(lv));
/** パネルの効き目の行（fx・show と、Lv2 からの up・upShow） */
/** 効き目の値の表示（+15%・−20%・+2） */
export function fmtShown(x: Shown, v: number): string {
  const n = x.unit === '%' ? v * 100 : v;
  const r = Math.round(n * 10) / 10;
  return `${x.down ? '−' : '+'}${r}${x.unit}`;
}
export function shownOf(k: Skill): { base: Shown[]; up: Shown[] } {
  return { base: [...(k.show ?? []), ...(k.fx ?? []).map(fxShown)], up: [...(k.upShow ?? []), ...(k.up ?? []).map(fxShown)] };
}
/** 修行の日数の縮み方：適性 apt で ×(1 − min(cut, apt / per))（適性 100 で −40%） */
export const TRAIN = { cut: 0.4, per: 250 };
/** ゴールドダストのパネルの値段（どの枝も同じ） */
export const DUST_COST = 3;

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
  { id: 'd_shop', branch: 'shop', name: t('名物店主', 'Famous shopkeeper'), note: t('選んだ 1 軒の売り場の強さ +40%（お店の画面で選ぶ。替えられる）', 'One chosen shop’s pull +40% (pick it in the shop screen; you can switch)'), cost: 0, dust: DUST_COST },
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
  { id: 'd_craft', branch: 'craft', name: t('名工の作業台', 'Master’s workbench'), note: t('全員の製造の適性 +15', 'Everyone’s crafting aptitude +15'), cost: 0, dust: DUST_COST },
  // ---------------------------------------------------------------- ③ 物流
  { id: 'loading', branch: 'logi', name: t('積み込みの工夫', 'Smart loading'), note: t('荷車に積める数 +30%', 'Cart load +30%'), cost: 2500 },
  { id: 'shortcut', branch: 'logi', name: t('近道の地図', 'Shortcut map'), note: t('運ぶ日数 −15%', 'Hauling −15% days'), cost: 3500, requires: ['loading'] },
  { id: 'timetable', branch: 'logi', name: t('定期便の時刻表', 'Scheduled runs'), note: t('お店の裏が半分以上埋まっていても便を出す（待ちなし）', 'Send runs even when a backroom is over half full (no waiting)'), cost: 4000, requires: ['loading'] },
  { id: 'route_opt', branch: 'logi', name: t('配送ルートの最適化', 'Route optimization'), note: t('運ぶ日数 −10%', 'Hauling −10% days'), cost: 5000, requires: ['shortcut'] },
  { id: 'hub', branch: 'logi', name: t('物流拠点', 'Logistics hub'), note: t('物流拠点を建てられる（工房 → 拠点はトラックで日数 ×0.3）', 'Lets you build hubs (workshop → hub by truck, days ×0.3)'), cost: 5000, requires: ['timetable'] },
  { id: 'crossdock', branch: 'logi', name: t('クロスドッキング', 'Cross-docking'), note: t('工房 → 拠点の日数 ×0.3 → ×0.2', 'Workshop → hub days ×0.3 → ×0.2'), cost: 12000, requires: ['hub'], tier: 'U', emblem: 1 },
  { id: 'joint', branch: 'logi', name: t('共同配送', 'Shared deliveries'), note: t('運搬係 1 人が同時に出せる便 +1', 'Each hauler runs one more trip at once'), cost: 15000, requires: ['route_opt'], tier: 'U' },
  { id: 'fleet', branch: 'logi', name: t('自社トラック網', 'Own truck fleet'), note: t('運ぶ速さ ×1.3', 'Hauling speed ×1.3'), cost: 40000, requires: ['crossdock'], tier: 'R', emblem: 3 },
  { id: 'd_logi', branch: 'logi', name: t('配送センター', 'Distribution center'), note: t('運ぶ日数 −30%', 'Hauling −30% days'), cost: 0, dust: DUST_COST },
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
  { id: 'd_buy', branch: 'buy', name: t('商社との提携', 'Trading-house alliance'), note: t('すべての素材のルートが開く・素材の値段 −10%', 'Opens every material route; materials −10%'), cost: 0, dust: DUST_COST },
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
  { id: 'd_people', branch: 'people', name: t('カリスマ採用', 'Star recruiter'), note: t('雇うときの能力 +20%（PHY・INT・AGI。上限 100）', 'New hires’ stats +20% (PHY/INT/AGI, max 100)'), cost: 0, dust: DUST_COST },
  // ---------------------------------------------------------------- 経営
  { id: 'pace1', branch: 'ops', name: t('業務の効率化', 'Streamlined operations'), note: t('ゲームの進行速度を 1.5 倍にできる（システム → 進行速度）', 'Lets you run the game at 1.5× (System → Game speed)'), cost: 4000 },
  { id: 'pace2', branch: 'ops', name: t('業務の自動化', 'Automated operations'), note: t('ゲームの進行速度を 2 倍にできる（システム → 進行速度）', 'Lets you run the game at 2× (System → Game speed)'), cost: 12000, requires: ['pace1'] },
  { id: 'budget', branch: 'ops', name: t('予算管理', 'Budgeting'), note: t('建物の維持費 −10%', 'Building upkeep −10%'), cost: 4000 },
  { id: 'pdca', branch: 'ops', name: t('月次 PDCA', 'Monthly PDCA'), note: t('月次報告に来月の見込み（売上・利益）が出る', 'Monthly reports show next month’s forecast (sales, profit)'), cost: 5000, requires: ['budget'] },
  { id: 'b_ads', branch: 'ops', name: t('ブランド広告', 'Brand advertising'), note: t('宣伝の効き目 ×1.5・ブランド力が月に +2', 'Ads 1.5× as strong; brand +2 a month'), cost: 10000, requires: ['pace1'], brand: 40, tier: 'U' },
  { id: 'pr', branch: 'ops', name: t('広報室', 'PR office'), note: t('ブランド力が月に +1', 'Brand +1 a month'), cost: 12000, requires: ['pdca'], tier: 'U', emblem: 1 },
  { id: 'holding', branch: 'ops', name: t('持株会社', 'Holding company'), note: t('マネージャーのセクタの利益 +10%', 'Managed sectors’ profit +10%'), cost: 40000, requires: ['pr'], tier: 'R', emblem: 3 },
  { id: 'd_ops', branch: 'ops', name: t('ブランド戦略室', 'Brand strategy office'), note: t('ブランド力の効き目 ×2（売り場の強さ 最大 +30% → +60%）', 'Brand effect ×2 (pull bonus cap +30% → +60%)'), cost: 0, dust: DUST_COST },
  // ---------------------------------------------------------------- システム
  { id: 'pos', branch: 'sys', name: t('POS レジ', 'POS registers'), note: t('市場データに商品ごとの「きのう売れた数」が出る・売り場の強さ +3%', 'Market data shows yesterday’s sales per item; pull +3%'), cost: 5000 },
  { id: 'auto_order', branch: 'sys', name: t('自動発注（EDI）', 'Auto-ordering (EDI)'), note: t('調達係の買い付けが毎日届く（往復なし）・注文の納期 −50%', 'Buyer purchases arrive daily (no round trip); order lead time −50%'), cost: 8000, requires: ['pos'] },
  { id: 'inventory', branch: 'sys', name: t('在庫管理システム', 'Inventory system'), note: t('お店の裏 +10・工房の物置 +20', 'Backrooms +10; workshop stockroom +20'), cost: 6000, requires: ['pos'] },
  { id: 'erp', branch: 'sys', name: t('ERP', 'ERP'), note: t('全段の「ひと月に流せる数」+5%（調達・製造・物流・販売）', 'Every stage’s monthly flow +5% (buy, craft, haul, sell)'), cost: 20000, requires: ['auto_order', 'inventory'], tier: 'U', emblem: 1 },
  { id: 'dyn', branch: 'sys', name: t('ダイナミックプライシング', 'Dynamic pricing'), note: t('需要が供給より多い商品（扱う他社が 1 社以下）の値段 +8%', 'Prices +8% where demand beats supply (1 rival or fewer)'), cost: 18000, requires: ['pos'], tier: 'U' },
  { id: 'flow', branch: 'sys', name: t('人流解析', 'Foot-traffic analytics'), note: t('建てるときにお客さんの多い区画（上位 20%）が光る・売り場の強さ +5%', 'Busiest blocks (top 20%) glow when placing; pull +5%'), cost: 15000, requires: ['inventory'], tier: 'U' },
  { id: 'forecast', branch: 'sys', name: t('需要予測 AI', 'Demand-forecast AI'), note: t('新商品の認知が 30% → 50% から始まる', 'New items start 50% known instead of 30%'), cost: 40000, requires: ['erp'], tier: 'R', emblem: 3 },
  { id: 'ec', branch: 'sys', name: t('EC サイト', 'Online store'), note: t('遠いお客さんも買う（自社のお店の届き方が最低 25%）', 'Far customers buy too (your shops reach at least 25%)'), cost: 45000, requires: ['dyn'], tier: 'R' },
  { id: 'd_sys', branch: 'sys', name: t('基幹システム刷新', 'Core system overhaul'), note: t('全段の「ひと月に流せる数」+10%（調達・製造・物流・販売）', 'Every stage’s monthly flow +10% (buy, craft, haul, sell)'), cost: 0, dust: DUST_COST },
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
// 解放型のパネルの説明に「Lv2〜：…」を足す
for (const k of SKILLS) {
  // 外周のパネルの説明は fx から（「すべてのお店の売り場の強さ +13%・…」）
  if (!k.note && k.fx) k.note = k.fx.map((f) => `${FX_LABEL[f.kind]} ${fmtShown(fxShown(f), f.v)}`).join(t('・', ', '));
  const ups = shownOf(k).up;
  const list = ups.map((x) => `${x.label} ${fmtShown(x, x.v)}`).join(t('・', ', '));
  if (ups.length) k.note += t(`（Lv2〜：${list}）`, ` (Lv2+: ${list})`);
}
export const SKILL: Record<string, Skill> = Object.fromEntries(SKILLS.map((s) => [s.id, s]));
/** 枝（8 本）。docs/ISLAND_PHASE1.md「スキルツリー」：物流が主軸・人材で勝負・システムでハイテク企業 */
export const BRANCHES: { key: Branch; name: string }[] = [
  { key: 'shop', name: t('お店', 'Shops') },
  { key: 'craft', name: t('工房', 'Workshop') },
  { key: 'logi', name: t('物流', 'Logistics') },
  { key: 'buy', name: t('調達', 'Buying') },
  { key: 'people', name: t('人材', 'People') },
  { key: 'ops', name: t('経営', 'Operations') },
  { key: 'sys', name: t('システム', 'Systems') },
  { key: 'tech', name: t('技', 'Crafts') },
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
  kind: 'shop' | 'workshop' | 'warehouse';
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
];
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
  /** ゴールドダストの報酬（受け取るときに会社のダストへ） */
  dust?: number;
}
export const MISSIONS: Mission[] = [
  { id: 'first_sale', from: t('町内会', 'Neighborhood council'), title: t('はじめての売上', 'First sale'), text: t('お店で商品を 1 つ売る', 'Sell one item in your shop'), reward: 1000 },
  { id: 'sensu100', from: t('近所の住民', 'A neighbor'), title: t('夏祭りにセンスを', 'Fans for the festival'), text: t('ひと月にセンスを 15 個売る', 'Sell 15 Sensu in one month'), reward: 3000 },
  { id: 'ad', from: t('町内会', 'Neighborhood council'), title: t('お店を知ってほしい', 'Let people know'), text: t('宣伝広報をする', 'Run an ad'), reward: 1000 },
  { id: 'two_shops', from: t('商店会', 'Merchants’ association'), title: t('通りににぎわいを', 'Liven up the street'), text: t('お店を 2 軒にする', 'Open a second shop'), reward: 3000 },
  { id: 'research', from: t('商店会', 'Merchants’ association'), title: t('ライバルを知る', 'Know your rivals'), text: t('他社のお店を調査する', 'Research a rival store'), reward: 1500 },
  { id: 'lantern50', from: t('駅長', 'Stationmaster'), title: t('夜道を明るく', 'Light up the night'), text: t('ひと月にランタンを 10 個売る', 'Sell 10 Lanterns in one month'), reward: 3000 },
  { id: 'uncommon', from: t('収集家', 'A collector'), title: t('めずらしい品を', 'Something rare'), text: t('アンコモンを合わせて 5 個売る', 'Sell 5 Uncommons in total'), reward: 5000, dust: 1 },
  { id: 'rank3', from: t('商店会', 'Merchants’ association'), title: t('エリアの顔に', 'Face of the area'), text: t('月の報告でエリア 3 位以内に入る', 'Finish a month in the area top 3'), reward: 5000, dust: 1 },
  // セクタの依頼（そのセクタでだけ受けられる。id はセーブと繋がる）
  // 湖・丘の依頼は、そのセクタの「まだ誰も売っていない」商品（ランタン・マレットは他店で供給が足りているので、ゴブレット・ナイフに）
  { id: 'c2_goblet', sector: 'c2', from: t('湖の宿', 'The lakeside inn'), title: t('湖畔で乾杯', 'A toast by the lake'), text: t('ひと月にゴブレットを 10 個売る', 'Sell 10 Goblets in one month'), reward: 4000, dust: 1 },
  { id: 'c2_top', sector: 'c2', from: t('ユーホタウンの町内会', 'Yuho Town council'), title: t('湖の一番店', 'Top shop on the lake'), text: t('ユーホタウンで 2 か月続けて 1 位になる', 'Become #1 in Yuho Town two months in a row'), reward: 10000, dust: 1 },
  { id: 'c3_knife', sector: 'c3', from: t('丘の上の大工さん', 'A hilltop carpenter'), title: t('ナイフを 10 本', 'Ten Knives'), text: t('ひと月にナイフを 10 本売る', 'Sell 10 Knives in one month'), reward: 4000, dust: 1 },
  { id: 'c3_top', sector: 'c3', from: t('リデル・ヒルズの町内会', 'Riddle Hills council'), title: t('丘の一番店', 'Top shop on the hill'), text: t('リデル・ヒルズで 2 か月続けて 1 位になる', 'Become #1 in Riddle Hills two months in a row'), reward: 10000, dust: 1 },
  { id: 'c4_top', sector: 'c4', from: t('キッチョムシティの町内会', 'Kitchom City council'), title: t('町いちばんの店', 'Top shop in town'), text: t('キッチョムシティで 2 か月続けて 1 位になる', 'Become #1 in Kitchom City two months in a row'), reward: 10000, dust: 1 },
  { id: 'c5_top', sector: 'c5', from: t('お祭りの実行委員会', 'The festival committee'), title: t('お祭りの顔に', 'Face of the festival'), text: t('オマツリタウンで 2 か月続けて 1 位になる', 'Become #1 in Omatsuri Town two months in a row'), reward: 10000, dust: 1 },
  { id: 'c6_top', sector: 'c6', from: t('ジラ・カントリーの村長', 'Zira Country’s village head'), title: t('村の一番店', 'Top shop in the village'), text: t('ジラ・カントリーで 2 か月続けて 1 位になる', 'Become #1 in Zira Country two months in a row'), reward: 10000, dust: 1 },
  { id: 'c7_top', sector: 'c7', from: t('サクラコシティの町内会', 'Sakurako City council'), title: t('桜の一番店', 'Top shop under the blossoms'), text: t('サクラコシティで 2 か月続けて 1 位になる', 'Become #1 in Sakurako City two months in a row'), reward: 10000, dust: 1 },
  { id: 'c8_top', sector: 'c8', from: t('ペストタウンの商店会', 'Pest Town merchants'), title: t('激戦区の一番店', 'Top of the battleground'), text: t('ペストタウンで 2 か月続けて 1 位になる', 'Become #1 in Pest Town two months in a row'), reward: 10000, dust: 1 },
  { id: 'u1_dev', sector: 'u1', from: t('港の商人', 'A harbor merchant'), title: t('新しい品を', 'Something new'), text: t('アンコモンを 1 つ開発する', 'Develop one Uncommon'), reward: 8000, dust: 1 },
  { id: 'u1_top', sector: 'u1', from: t('ウメコタウンの商工会', 'Umeko Town guild'), title: t('港の一番店', 'Top shop in the harbor'), text: t('ウメコタウンで 2 か月続けて 1 位になる', 'Become #1 in Umeko Town two months in a row'), reward: 30000, dust: 2 },
  { id: 'u2_top', sector: 'u2', from: t('ヤツカノタウンの鍛冶組合', 'Yatsukano smiths’ guild'), title: t('金物の町の一番店', 'Top shop in the hardware town'), text: t('ヤツカノタウンで 2 か月続けて 1 位になる', 'Become #1 in Yatsukano Town two months in a row'), reward: 32000, dust: 2 },
  { id: 'u3_ads', sector: 'u3', from: t('坂の商店会', 'Slope merchants'), title: t('坂を宣伝で', 'Advertise the slope'), text: t('宣伝を 2 種類以上同時にする', 'Run 2 or more kinds of ads at once'), reward: 6000 },
  { id: 'u3_top', sector: 'u3', from: t('エムケーシティの商店会', 'MK City association'), title: t('坂の一番店', 'Top shop on the slope'), text: t('エムケーシティで 2 か月続けて 1 位になる', 'Become #1 in MK City two months in a row'), reward: 35000, dust: 2 },
  { id: 'u4_top', sector: 'u4', from: t('ゴリ・ラグズの織物組合', 'Gori Rugs weavers’ guild'), title: t('織物の町の一番店', 'Top shop in the weaving town'), text: t('ゴリ・ラグズで 2 か月続けて 1 位になる', 'Become #1 in Gori Rugs two months in a row'), reward: 38000, dust: 2 },
  { id: 'u5_top', sector: 'u5', from: t('ザックシティの商工会議所', 'Zack City chamber of commerce'), title: t('大都市の一番店', 'Top shop in the big city'), text: t('ザックシティで 2 か月続けて 1 位になる', 'Become #1 in Zack City two months in a row'), reward: 40000, dust: 2 },
];

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
