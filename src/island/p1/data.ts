/**
 * フェーズ 1「新天地で実績を上げろ」の数値（docs/ISLAND_PHASE1.md）。
 * 素材 → クラフト → 運搬 → 陳列 → 販売。商品は MCH の Common エクステ 5 シリーズ。
 */
import { t } from '../../i18n';

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
}

export const PRODUCTS: ProductDef[] = [
  { key: 'Sensu', name: t('センス', 'Sensu'), ext: { C: 1032, U: 2032 }, price: 900, batch: 4, days: 3, recipe: { C: { wood: 6 }, U: { wood: 6, paper: 4 } }, demand: 20 },
  { key: 'Mallet', name: t('マレット', 'Mallet'), ext: { C: 1073, U: 2073 }, price: 1100, batch: 4, days: 4, recipe: { C: { wood: 4, iron: 2 }, U: { wood: 4, iron: 4, gem: 1 } }, demand: 12 },
  { key: 'Node-Doll', name: t('ノード・ドール', 'Node-Doll'), ext: { C: 1107, U: 2107 }, price: 1400, batch: 3, days: 4, recipe: { C: { clay: 6, glass: 1 }, U: { clay: 6, cloth: 4 } }, demand: 8 },
  { key: 'Lantern', name: t('ランタン', 'Lantern'), ext: { C: 1150, U: 2150 }, price: 1300, batch: 4, days: 4, recipe: { C: { iron: 2, glass: 3 }, U: { iron: 4, glass: 4, gem: 1 } }, demand: 30 },
  { key: 'Scissors', name: t('鋏', 'Scissors'), ext: { C: 1171, U: 2171 }, price: 1000, batch: 4, days: 3, recipe: { C: { iron: 5 }, U: { iron: 5, gem: 1 } }, demand: 22 },
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

// ---------------------------------------------------------------- 建てられる建物

export interface P1Building {
  id: string;
  kind: 'workshop' | 'shop' | 'food' | 'warehouse' | 'depot';
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
];
export const P1B: Record<string, P1Building> = Object.fromEntries(P1_BUILDINGS.map((b) => [b.id, b]));

// ---------------------------------------------------------------- 従業員

export type Task = 'craft' | 'transport' | 'shop' | 'explore' | 'intel' | 'buy' | 'side';
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
};
/** 物流拠点：工房 → 拠点はトラックの定期便（距離 × link）、拠点 → お店は荷車 */
export const DEPOT = { link: 0.3 };
export const SHOP = { shelfCap: 10, storageCap: 20, displayPerDay: 6, partTimeDisplay: 4, partTimeWage: 30, partTimeMax: 1, noStaff: 0 };
/** 新しいお店の認知度：開店した日は 0.2、1 日 0.02 ずつ上がって 1 まで（売れる数にかかる） */
export const AWARE = { start: 0.35, perDay: 0.025 };
/** 保管：工房の物置（素材と、運ぶ前の商品の合計）と、倉庫 1 つで増える数。いっぱいだと調達もクラフトもできない */
export const STORE = { base: 80, warehouse: 200 };

// ---------------------------------------------------------------- スキルツリー

export interface Skill {
  id: string;
  branch: 'shop' | 'craft' | 'logi' | 'buy' | 'people' | 'ops';
  name: string;
  note: string;
  cost: number;
  requires?: string[];
}

export const SKILLS: Skill[] = [
  { id: 'shelf1', branch: 'shop', name: t('棚を増やす', 'More shelves'), note: t('お店の棚 +1（2 種類並べられる）', 'Shelves +1 per shop'), cost: 3000 },
  { id: 'host', branch: 'shop', name: t('案内係の育成', 'Train hosts'), note: t('売り場での強さ +15%', 'Shop pull +15%'), cost: 4000 },
  { id: 'parttime', branch: 'shop', name: t('アルバイトの採用', 'Part-time hiring'), note: t('アルバイトの上限 +2', 'Part-timers +2 per shop'), cost: 2500 },
  { id: 'shop2', branch: 'shop', name: t('輸入品店', 'Import store'), note: t('棚 2 の輸入品店を建てられる', 'Unlocks the import store (2 shelves)'), cost: 6000, requires: ['shelf1'] },
  { id: 'shelf2', branch: 'shop', name: t('棚をさらに増やす', 'Even more shelves'), note: t('お店の棚 +1', 'Shelves +1 per shop'), cost: 9000, requires: ['shelf1'] },
  { id: 'display', branch: 'shop', name: t('品出しの名人', 'Shelving pros'), note: t('棚に並べる速さ +50%', 'Shelving speed +50%'), cost: 3500, requires: ['parttime'] },
  { id: 'shop3', branch: 'shop', name: t('ブティック', 'Boutique'), note: t('売り場が強いブティックを建てられる', 'Unlocks the boutique (strong pull)'), cost: 14000, requires: ['shop2', 'host'] },
  { id: 'bench2', branch: 'craft', name: t('作業台を増やす', 'Second workbench'), note: t('同時に 2 つクラフトできる', 'Craft two things at once'), cost: 5000 },
  { id: 'jig', branch: 'craft', name: t('段取りの改善', 'Better jigs'), note: t('クラフトの日数 −20%', 'Crafting −20% days'), cost: 4000 },
  { id: 'pot', branch: 'craft', name: t('魔法の釜', 'Magic pot'), note: t('「商品開発」でアンコモンを開発できる（作るには製造の適性 31 以上の職人）', 'Develop Uncommons in Product development (crafting them needs aptitude 31+)'), cost: 10000, requires: ['bench2'] },
  { id: 'jig2', branch: 'craft', name: t('型の工夫', 'Better molds'), note: t('クラフトの日数 −15%', 'Crafting −15% days'), cost: 7000, requires: ['jig'] },
  { id: 'chair', branch: 'craft', name: t('職人の椅子', 'Crafter chairs'), note: t('職人のスタミナの減り −30%', 'Crafters tire 30% slower'), cost: 3000 },
  { id: 'bench3', branch: 'craft', name: t('工房を工場に', 'Workshop to factory'), note: t('作業台 +1・クラフトの日数 −20%', 'Workbench +1, crafting −20% days'), cost: 22000, requires: ['bench2', 'jig'] },
  { id: 'cart2', branch: 'logi', name: t('荷車を増やす', 'Second cart'), note: t('運搬係 1 人が同時に 2 便', 'Two trips at once per hauler'), cost: 3000 },
  { id: 'truck', branch: 'logi', name: t('小型トラック', 'Small truck'), note: t('積める数 ×2.5・速さ ×1.5', 'Load ×2.5, speed ×1.5'), cost: 8000, requires: ['cart2'] },
  { id: 'loading', branch: 'logi', name: t('積み込みの工夫', 'Smart loading'), note: t('荷車に積める数 +30%', 'Cart load +30%'), cost: 2500 },
  { id: 'shortcut', branch: 'logi', name: t('近道の地図', 'Shortcut map'), note: t('運ぶ日数 −15%', 'Hauling −15% days'), cost: 3500, requires: ['loading'] },
  { id: 'cart3', branch: 'logi', name: t('荷車をさらに増やす', 'Third cart'), note: t('運搬係 1 人が同時に 3 便', 'Three trips at once per hauler'), cost: 7000, requires: ['cart2'] },
  { id: 'backroom', branch: 'logi', name: t('お店の裏倉庫', 'Shop stockrooms'), note: t('お店の裏に置ける数 +20', 'Shop back storage +20'), cost: 4000, requires: ['loading'] },
  { id: 'hub', branch: 'logi', name: t('物流拠点', 'Logistics hub'), note: t('物流拠点を建てられる（工房から遠いお店への便が速くなる）', 'Lets you build logistics hubs (faster runs to far shops)'), cost: 5000, requires: ['loading'] },
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
  { id: 'tidy', branch: 'buy', name: t('物置の整理', 'Tidy stockroom'), note: t('工房の物置 +40 個', 'Workshop stockroom +40'), cost: 2500, requires: ['bulk'] },
  { id: 'rack', branch: 'buy', name: t('倉庫の高い棚', 'Tall racks'), note: t('倉庫 1 棟の置き場所 +100 個', 'Each warehouse +100'), cost: 6000, requires: ['tidy'] },
  { id: 'scoutmap', branch: 'buy', name: t('開拓の手引き', 'Scouting guide'), note: t('ルートの開拓の日数 −40%', 'Scouting −40% days'), cost: 3000, requires: ['route_paper'] },
  { id: 'hire', branch: 'people', name: t('人材の募集', 'Recruiting'), note: t('ヒーローを雇えるようになる', 'Hire heroes'), cost: 3000 },
  { id: 'lounge', branch: 'people', name: t('休憩室', 'Lounge'), note: t('スタミナの回復 +50%', 'Stamina recovers 50% faster'), cost: 2500 },
  { id: 'pace1', branch: 'ops', name: t('業務の効率化', 'Streamlined operations'), note: t('ゲームの進行速度を 1.5 倍にできる（システム → 進行速度）', 'Lets you run the game at 1.5× (System → Game speed)'), cost: 4000 },
  { id: 'pace2', branch: 'ops', name: t('業務の自動化', 'Automated operations'), note: t('ゲームの進行速度を 2 倍にできる（システム → 進行速度）', 'Lets you run the game at 2× (System → Game speed)'), cost: 12000, requires: ['pace1'] },
];
export const SKILL: Record<string, Skill> = Object.fromEntries(SKILLS.map((s) => [s.id, s]));
export const BRANCHES: { key: Skill['branch']; name: string }[] = [
  { key: 'shop', name: t('お店', 'Shops') },
  { key: 'craft', name: t('工房', 'Workshop') },
  { key: 'logi', name: t('物流', 'Logistics') },
  { key: 'buy', name: t('調達', 'Buying') },
  { key: 'people', name: t('人材', 'People') },
  { key: 'ops', name: t('経営', 'Operations') },
];

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
  kind: 'shop' | 'workshop';
  name: string;
  note: string;
  /** 段ごとの値段 */
  cost: number[];
}

export const INVESTS: Invest[] = [
  { id: 'sign', kind: 'shop', name: t('看板を出す', 'Signboard'), note: t('このお店の売り場の強さ +10%（1 段ごと）', 'This shop’s pull +10% per level'), cost: [2000, 4000, 8000] },
  { id: 'fixtures', kind: 'shop', name: t('陳列の什器', 'Display fixtures'), note: t('棚に並べる速さ +30%（1 段ごと）', 'Shelving speed +30% per level'), cost: [2500, 5000] },
  { id: 'backroom', kind: 'shop', name: t('裏の倉庫を広げる', 'Bigger backroom'), note: t('裏に置ける数 +20（1 段ごと）', 'Backroom +20 per level'), cost: [1500, 3000] },
  { id: 'tools', kind: 'workshop', name: t('道具の新調', 'New tools'), note: t('クラフトの日数 −10%（1 段ごと）', 'Crafting −10% days per level'), cost: [3000, 6000, 12000] },
  { id: 'breakroom', kind: 'workshop', name: t('職人の休憩所', 'Crafters’ break room'), note: t('工房で働く人のスタミナの減り −30%', 'Crafters lose 30% less stamina'), cost: [2500] },
];
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
  from: string;
  title: string;
  text: string;
  reward: number;
}
export const MISSIONS: Mission[] = [
  { id: 'first_sale', from: t('町内会', 'Neighborhood council'), title: t('はじめての売上', 'First sale'), text: t('お店で商品を 1 つ売る', 'Sell one item in your shop'), reward: 1000 },
  { id: 'sensu100', from: t('近所の住民', 'A neighbor'), title: t('夏祭りにセンスを', 'Fans for the festival'), text: t('ひと月にセンスを 15 個売る', 'Sell 15 Sensu in one month'), reward: 3000 },
  { id: 'ad', from: t('町内会', 'Neighborhood council'), title: t('お店を知ってほしい', 'Let people know'), text: t('宣伝広報をする', 'Run an ad'), reward: 1000 },
  { id: 'two_shops', from: t('商店会', 'Merchants’ association'), title: t('通りににぎわいを', 'Liven up the street'), text: t('お店を 2 軒にする', 'Open a second shop'), reward: 3000 },
  { id: 'research', from: t('商店会', 'Merchants’ association'), title: t('ライバルを知る', 'Know your rivals'), text: t('他社のお店を調査する', 'Research a rival store'), reward: 1500 },
  { id: 'lantern50', from: t('駅長', 'Stationmaster'), title: t('夜道を明るく', 'Light up the night'), text: t('ひと月にランタンを 10 個売る', 'Sell 10 Lanterns in one month'), reward: 3000 },
  { id: 'uncommon', from: t('収集家', 'A collector'), title: t('めずらしい品を', 'Something rare'), text: t('アンコモンを合わせて 5 個売る', 'Sell 5 Uncommons in total'), reward: 5000 },
  { id: 'rank3', from: t('商店会', 'Merchants’ association'), title: t('エリアの顔に', 'Face of the area'), text: t('月の報告でエリア 3 位以内に入る', 'Finish a month in the area top 3'), reward: 5000 },
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
