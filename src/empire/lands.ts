// ランドの個性（docs/EMPIRE_DESIGN.md 10.10）。DOM に触れない。
//
// 経営モードで創業できるのは 4 ランド（Ocean・Strawberry・Tangerine・Lime）。
// フェーズ 4 からは、さらに 5 ランド（Graphite・Grape・Sage・Blueberry・Ruby）へも渡れる（10.16・10.17）。
// Ruby はふだん入国できず、掲示板に書き込んで団員とのつながりを作った会社だけが入れる（world.ts）。
// ランドごとに文化・地形・特産品・守り神・キングが違い、当たる品ぞろえ（Focus）と、ライバルの入り方が変わる。

/** 会社の品ぞろえ（当たるビジネス）。店の客足に、ランドの文化との合い方が掛かる */
export type Focus = 'daily' | 'sweets' | 'imports' | 'luxury' | 'leisure';
export const FOCUSES: Focus[] = ['daily', 'sweets', 'imports', 'luxury', 'leisure'];

export type FoundingLand = 'Ocean' | 'Strawberry' | 'Tangerine' | 'Lime';
export const FOUNDING_LANDS: FoundingLand[] = ['Ocean', 'Strawberry', 'Tangerine', 'Lime'];
/** 渡れるランド（創業できる 4 ランドと、フェーズ 4 から渡れる 4 ランド） */
export type WorldLand = FoundingLand | 'Graphite' | 'Grape' | 'Sage' | 'Blueberry' | 'Ruby';
export const LATER_LANDS: WorldLand[] = ['Graphite', 'Grape', 'Sage', 'Blueberry', 'Ruby'];

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

export const LAND_PROFILES: Record<WorldLand, LandProfile> = {
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
  // ---- フェーズ 4 から渡れるランド（創業はできない。rivalFrom は使わない）
  Graphite: {
    key: 'Graphite',
    kind: L('団結の国', 'United nation'), // i18n-ja
    lines: [
      L('安定した、柔和な国。キングの象王は「親方」と呼ばれ、家臣と国民に慕われている', 'A steady, gentle land. King Elephant, called "the Boss", is loved by retainers and people alike'), // i18n-ja
      L('親方より家臣と国民のほうが「もっと強い国に」と願う、団結力のあるランド。技術力が高い。特産品はグラファイト', 'Its people, more than the Boss, want a stronger land: united, with high technology. Specialty: graphite'), // i18n-ja
      L('ランドの中の交流が盛ん。親方は外交にも積極的で、交渉よりも繋がりを保つ付き合い方をする', 'Lively ties at home. The Boss is active abroad, keeping bonds rather than bargaining'), // i18n-ja
    ],
    specialty: { series: 42, name: L('グラファイト', 'Graphite') }, // i18n-ja
    guardian: { series: 24, name: L('象（エレファント）', 'Elephant') }, // i18n-ja
    king: { name: L('象王（親方）', 'King Elephant (the Boss)'), likes: L('国を強くする人づくりと技術', 'People and technology that make the land strong') }, // i18n-ja
    terrain: 'suburb',
    fit: { daily: 1.05, sweets: 0.98, imports: 0.95, luxury: 1.06, leisure: 1 },
    population: 1,
    rent: 1,
    rivalFrom: 0,
  },
  Grape: {
    key: 'Grape',
    kind: L('野心の国', 'Ambitious nation'), // i18n-ja
    lines: [
      L('野心あふれる国。キングの魚王は、9 ランドの代表が集まって世界の方針を決める G9 の議長', "A land brimming with ambition. King Fish chairs the G9, where the nine lands set the world's course"), // i18n-ja
      L('代々、武力を増して国力を高めてきた。国の内外から兵を集めて独自の大会を開き、国じゅうが活気にあふれる。特産品はグレープ', 'For generations it grew strong through arms. It gathers fighters from everywhere for its own tournaments; the whole land buzzes. Specialty: grapes'), // i18n-ja
      L('魚王はアイスが好き。外交にも積極的で、その場でも野心を隠さない', 'King Fish loves ice cream. Active in diplomacy, he never hides his ambition'), // i18n-ja
    ],
    specialty: { series: 43, name: L('グレープ', 'Grape') }, // i18n-ja
    guardian: { series: 26, name: L('蛇（スネーク）', 'Snake') }, // i18n-ja
    king: { name: L('魚王', 'King Fish'), likes: L('アイスと、勢いのある商い', 'Ice cream, and business with drive') }, // i18n-ja
    terrain: 'castle',
    fit: { daily: 1, sweets: 1.05, imports: 0.92, luxury: 1.03, leisure: 1.15 },
    population: 1.1,
    rent: 1.05,
    rivalFrom: 0,
  },
  Sage: {
    key: 'Sage',
    kind: L('穏やかな国', 'Gentle nation'), // i18n-ja
    lines: [
      L('女王の猫王が治める、穏やかな国。特産品はセージ', 'A gentle land ruled by Queen Cat. Specialty: sage'), // i18n-ja
      L('移民（初心者）を積極的に支え、異文化の人も喜んで迎え入れる', 'It supports newcomers and gladly welcomes people from other cultures'), // i18n-ja
      L('自分たちの思想を発信することに熱心で、ラジオ局を建てたいと考えている', 'Eager to share its ideas, it hopes to build a radio station'), // i18n-ja
    ],
    specialty: { series: 44, name: L('セージ', 'Sage') }, // i18n-ja
    guardian: { series: 23, name: L('牛（ブル）', 'Bull') }, // i18n-ja
    king: { name: L('猫王（女王）', 'Queen Cat'), likes: L('新しく来た人への支えと、異文化', 'Support for newcomers, and other cultures') }, // i18n-ja
    terrain: 'open',
    fit: { daily: 1.03, sweets: 0.98, imports: 1.15, luxury: 0.95, leisure: 1.02 },
    population: 1.05,
    rent: 0.95,
    rivalFrom: 0,
  },
  Blueberry: {
    key: 'Blueberry',
    kind: L('海賊団', 'Pirate crew'), // i18n-ja
    lines: [
      L('海賊団を名乗る、ごく少ない人数の海洋国家。土地はほとんどなく、小さな島が点在し、人々は船の上で暮らす', 'A tiny sea nation calling itself a pirate crew. Barely any land: scattered islets, people living on ships'), // i18n-ja
      L('かつては犬王が治めていたが、政権が代わり、海賊業を柱にすると決めた尖った国。特産品はブルーベリー', 'Once ruled by King Dog; after a change of power it chose piracy as its trade. Specialty: blueberries'), // i18n-ja
      L('外交はできるが、基本は我が道を行く。Strawberry とつながりがあるらしい', 'Open to diplomacy, but it goes its own way. Rumored ties to Strawberry'), // i18n-ja
    ],
    specialty: { series: 45, name: L('ブルーベリー', 'Blueberry') }, // i18n-ja
    guardian: { series: 27, name: L('犬（ドッグ）', 'Dog') }, // i18n-ja
    king: { name: L('船長', 'the Captain'), likes: L('海の向こうの品と、島と島をつなぐ港', 'Goods from across the sea, and ports that link the islets') }, // i18n-ja
    terrain: 'sea',
    fit: { daily: 0.95, sweets: 1.1, imports: 1.12, luxury: 0.98, leisure: 1 },
    population: 0.7,
    rent: 0.9,
    rivalFrom: 0,
  },
  Ruby: {
    key: 'Ruby',
    kind: L('謎多き国', 'Land of mysteries'), // i18n-ja
    lines: [
      L('謎の多い国。通称「流星街」。ふだんは入国できず、所属する国民（団員）とつながりのある者だけが入れる', 'A land of mysteries, known as Meteor Town. Closed to outsiders: only those with ties to its members may enter'), // i18n-ja
      L('キングの猿王は「団長」と呼ばれ、団員すら姿を見たことがない。指示は掲示板で出し、団員は書き込みで団長に声を届ける。特産品はルビー', 'King Monkey, called "the Chief", has never been seen even by members. Orders come by message board; members reply by posting. Specialty: rubies'), // i18n-ja
      L('団長は企画好きで、独自の大会で好成績を収めると認知されやすい。他国の動きも独自の情報網で見ているらしい。「悪魔金魚」が街を徘徊する伝説や、巨大ロボの研究の噂もささやかれる', "The Chief loves events: shine at its tournaments to be noticed. Its own network watches other lands. Rumors tell of a demon goldfish roaming the streets, and of a giant robot in the works"), // i18n-ja
    ],
    specialty: { series: 46, name: L('ルビー', 'Ruby') }, // i18n-ja
    guardian: { series: 25, name: L('猿（モンキー）', 'Monkey') }, // i18n-ja
    king: { name: L('猿王（団長）', 'King Monkey (the Chief)'), likes: L('大会での好成績と、情報', 'Strong showings at its tournaments, and information') }, // i18n-ja
    terrain: 'castle',
    fit: { daily: 0.95, sweets: 1, imports: 1.05, luxury: 1.1, leisure: 1.12 },
    population: 0.9,
    rent: 1.1,
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
  const k = (Object.keys(LAND_PROFILES) as WorldLand[]).find((x) => x.toLowerCase() === (land ?? '').toLowerCase());
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
