// ランドの個性（docs/EMPIRE_DESIGN.md 10.10）。DOM に触れない。
//
// 経営モードで創業できるのは、いまは 4 ランド（Ocean・Strawberry・Tangerine・Lime）。
// ランドごとに文化・地形・特産品・守り神・キングが違い、当たる品ぞろえ（Focus）と、ライバルの入り方が変わる。
// 残りの 5 ランドは、世界（フェーズ 4）で名前だけ見える。

/** 会社の品ぞろえ（当たるビジネス）。店の客足に、ランドの文化との合い方が掛かる */
export type Focus = 'daily' | 'sweets' | 'imports' | 'luxury' | 'leisure';
export const FOCUSES: Focus[] = ['daily', 'sweets', 'imports', 'luxury', 'leisure'];

export type FoundingLand = 'Ocean' | 'Strawberry' | 'Tangerine' | 'Lime';
export const FOUNDING_LANDS: FoundingLand[] = ['Ocean', 'Strawberry', 'Tangerine', 'Lime'];

/** 町の地図の地形：海に囲まれる・城下町・何もない野原・住宅街の広がる平地 */
export type Terrain = 'sea' | 'castle' | 'open' | 'suburb';

export interface LandProfile {
  key: string;
  /** 国の形（海上都市・帝国…） */
  kind: { ja: string; en: string };
  /** 文化のひと言（創業の画面と、世界の海図で見せる） */
  lines: { ja: string; en: string }[];
  /** 特産品と守り神（MCH のエクステンションのシリーズ番号。地図の飾りに使う） */
  specialty: { series: number; name: { ja: string; en: string } };
  guardian: { series: number; name: { ja: string; en: string } };
  king: { name: { ja: string; en: string }; likes: { ja: string; en: string } };
  terrain: Terrain;
  /** 品ぞろえごとの客足の倍率（1 がふつう） */
  fit: Record<Focus, number>;
  /** 人の多さ（フェーズ 3 のエリアの入りきる目安に掛ける） */
  population: number;
  /** 家賃の倍率 */
  rent: number;
  /** ライバルが入ってくる月（0 は最初から。Tangerine はまだどこの会社も入っていない） */
  rivalFrom: number;
}

const L = (ja: string, en: string) => ({ ja, en });

export const LAND_PROFILES: Record<FoundingLand, LandProfile> = {
  Ocean: {
    key: 'Ocean',
    kind: L('海上都市', 'Sea city'), // i18n-ja
    lines: [
      L('住民の数は全ランドで 1 番。異文化の交流が盛んで、よそのランドの特産品がよく売れる', 'The most populous land. Open to other cultures: goods from other lands sell well'), // i18n-ja
      L('船の技術は世界の最先端。特産品はステアリング', 'World-leading shipbuilding. Specialty: steering wheels'), // i18n-ja
      L('キングの海王はバランスを重んじる。Ruby とつながりがある', 'King Neptune values balance and has ties to Ruby'), // i18n-ja
    ],
    specialty: { series: 38, name: L('ステアリング', 'Steering wheel') }, // i18n-ja
    guardian: { series: 19, name: L('亀（トータス）', 'Tortoise') }, // i18n-ja
    king: { name: L('海王', 'King Neptune'), likes: L('かたよらない商い', 'Balanced business') }, // i18n-ja
    terrain: 'sea',
    fit: { daily: 1, sweets: 0.97, imports: 1.15, luxury: 0.95, leisure: 1 },
    population: 1.15,
    rent: 1.05,
    rivalFrom: 0,
  },
  Strawberry: {
    key: 'Strawberry',
    kind: L('帝国', 'Empire'), // i18n-ja
    lines: [
      L('魔王の絶対王政。国民の忠義が厚く、武力も高い。地下に秘密の施設があるという噂', "The Demon King's absolute rule. Loyal, strong people. Rumors of a secret facility underground"), // i18n-ja
      L('魔王は甘い物が好きで、スイーツやフルーツが好まれる。特産品はストロベリー', 'The king loves sweets: desserts and fruit sell. Specialty: strawberries'), // i18n-ja
      L('よそとはあまり交わらない独自の文化。開くときは、その文化を尊重すること', 'A culture of its own that keeps apart. Respect it when you open here'), // i18n-ja
    ],
    specialty: { series: 39, name: L('ストロベリー', 'Strawberry') }, // i18n-ja
    guardian: { series: 20, name: L('鶏（ルースター）', 'Rooster') }, // i18n-ja
    king: { name: L('魔王', 'Demon King'), likes: L('甘い物と、文化への敬意', 'Sweets, and respect for the culture') }, // i18n-ja
    terrain: 'castle',
    fit: { daily: 1, sweets: 1.15, imports: 0.85, luxury: 1.03, leisure: 0.93 },
    population: 1,
    rent: 1,
    rivalFrom: 0,
  },
  Tangerine: {
    key: 'Tangerine',
    kind: L('自由国家', 'Free state'), // i18n-ja
    lines: [
      L('商人・宗教家・芸術家と、その時々の偉人で姿を変えてきた国。いまは象徴となる偉人がいない', 'A land reshaped by each era’s great figure. Right now it has none'), // i18n-ja
      L('キングの虎王は財力が全ランドで 1 番。心を開いた人にしか会わない。特産品はタンジェリン', 'King Tiger is the richest of all and meets only those he trusts. Specialty: tangerines'), // i18n-ja
      L('まだどこの会社も入っておらず、開き放題。ただ、ほかの会社が気づく日も遠くない', 'No company is here yet: open ground. Others will notice before long'), // i18n-ja
    ],
    specialty: { series: 40, name: L('タンジェリン', 'Tangerine') }, // i18n-ja
    guardian: { series: 21, name: L('虎（タイガー）', 'Tiger') }, // i18n-ja
    king: { name: L('虎王', 'King Tiger'), likes: L('国を活気づける逸材', 'Someone who brings the land to life') }, // i18n-ja
    terrain: 'open',
    fit: { daily: 1, sweets: 1, imports: 0.9, luxury: 1.12, leisure: 1.06 },
    population: 0.95,
    rent: 0.95,
    rivalFrom: 24,
  },
  Lime: {
    key: 'Lime',
    kind: L('急成長の国', 'Rising nation'), // i18n-ja
    lines: [
      L('一度は最弱と言われたが、建て直して Strawberry と肩を並べるまでになった。調和を重んじる', 'Once the weakest land, now rebuilt to rival Strawberry. It values harmony'), // i18n-ja
      L('土地が広く、住宅街が並ぶ。人が根づく娯楽や働く場所が喜ばれる。特産品はライム', 'Wide land lined with houses. Places to play and work are welcome. Specialty: limes'), // i18n-ja
      L('キングの龍王は高級志向で、ワインが特に好き。外交でどの国ともパイプがある', 'King Dragon likes fine things, wine above all, and has ties with every land'), // i18n-ja
    ],
    specialty: { series: 41, name: L('ライム', 'Lime') }, // i18n-ja
    guardian: { series: 22, name: L('龍（ドラゴン）', 'Dragon') }, // i18n-ja
    king: { name: L('龍王', 'King Dragon'), likes: L('上質な品と、人が根づく町', 'Fine goods, and towns people settle in') }, // i18n-ja
    terrain: 'suburb',
    fit: { daily: 1.03, sweets: 0.97, imports: 1.03, luxury: 1.1, leisure: 1.12 },
    population: 1.05,
    rent: 0.9,
    rivalFrom: 0,
  },
};

/** 創業できない（古いセーブの）ランドは、どの品ぞろえも 1 倍の、癖のないランドとして扱う */
const NEUTRAL: LandProfile = {
  ...LAND_PROFILES.Ocean,
  fit: { daily: 1, sweets: 1, imports: 1, luxury: 1, leisure: 1 },
  population: 1,
  rent: 1,
};

export function landProfile(land: string | null | undefined): LandProfile {
  const k = FOUNDING_LANDS.find((x) => x.toLowerCase() === (land ?? '').toLowerCase());
  return k ? LAND_PROFILES[k] : { ...NEUTRAL, key: land ?? 'Ocean' };
}

/** 品ぞろえを変えるのにかかる費用（店 1 店あたり。フェーズ 1 は無料） */
export const FOCUS_CHANGE_PER_STORE = 1_000_000;

/** 品ぞろえと文化の合い方（客足の倍率） */
export const focusFit = (land: string | null | undefined, focus: Focus | undefined) => landProfile(land).fit[focus ?? 'daily'];

/** いちばん合う品ぞろえ */
export function bestFocus(land: string | null | undefined): Focus {
  const f = landProfile(land).fit;
  return FOCUSES.reduce((a, b) => (f[b] > f[a] ? b : a), 'daily' as Focus);
}
