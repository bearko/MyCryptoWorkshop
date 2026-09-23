import { catalog, customersByTier, icons, series } from './catalog';

/** The five factions of My Crypto Heroes, used as the branches of the skill tree. */
export type Branch = 'root' | 'suzaku' | 'seiryu' | 'kouryu' | 'byakko' | 'genbu';

export const BRANCHES: Record<Branch, { name: string; role: string; color: string }> = {
  root: { name: '工房', role: '開業', color: '#e8d6a8' },
  suzaku: { name: '朱雀', role: 'クラフト', color: '#ff6b4a' },
  seiryu: { name: '青龍', role: '集客', color: '#3fb5ff' },
  kouryu: { name: '黄竜', role: '経営・レジ', color: '#ffd23f' },
  byakko: { name: '白虎', role: '防犯', color: '#e9eef5' },
  genbu: { name: '玄武', role: '陳列・レシピ', color: '#58d6a0' },
};

export interface SkillNode {
  id: string;
  branch: Branch;
  name: string;
  /** Effect text for one level. */
  desc: string;
  icon: string;
  /** Grid position (1 unit = one node spacing). */
  x: number;
  y: number;
  max: number;
  baseCost: number;
  growth: number;
  /** The node becomes available once any of these is at level ≥ 1. */
  requires: string[];
}

const ext = (seriesIndex: number, rarityIndex: number) => series[seriesIndex].items[rarityIndex].image;
const hero = (tier: number) => customersByTier[tier][0].image;
const ws = catalog.workshop as Record<string, string>;

export const RECIPE_COSTS = [0, 40, 100, 250, 600, 1500, 3500, 5000, 9000, 16000, 30000, 55000];

const recipeNodes: SkillNode[] = series.slice(1).map((s, i) => {
  const index = i + 1;
  // Row 1: series 1..6 run left from the shelf node. Row 2: series 7..11 branch off the armor recipe.
  const row1 = index <= 6;
  return {
    id: `recipe_${s.key}`,
    branch: 'genbu',
    name: `レシピ：${s.name}`,
    desc: `${s.name}シリーズをクラフトできるようになる。品揃えが増えて来客ペースが上がる`,
    icon: ext(index, 0),
    x: row1 ? -1 - index : -4 - (index - 7),
    y: row1 ? -1 : -2,
    max: 1,
    baseCost: RECIPE_COSTS[index],
    growth: 1,
    requires: [index === 1 ? 'shelf' : index === 7 ? `recipe_${series[3].key}` : `recipe_${series[index - 1].key}`],
  };
});

export const SKILLS: SkillNode[] = [
  { id: 'root', branch: 'root', name: '工房開業', desc: 'あなたのクラフト工房。ここから五勢力の技術が広がる', icon: ws.workshop_base, x: 0, y: 0, max: 1, baseCost: 0, growth: 1, requires: [] },

  // 朱雀: crafting (up)
  { id: 'craftSpeed', branch: 'suzaku', name: '壺の火力', desc: 'クラフト時間 -8%', icon: icons.gems.ifrit, x: 0, y: -1, max: 10, baseCost: 15, growth: 1.5, requires: ['root'] },
  { id: 'craftClick', branch: 'suzaku', name: '職人の手際', desc: '壺クリックの効果 +40%', icon: ext(0, 1), x: -1, y: -2, max: 5, baseCost: 30, growth: 1.7, requires: ['craftSpeed'] },
  { id: 'uncommon', branch: 'suzaku', name: 'エリート製法', desc: 'Uncommon のエクステンションをクラフトできる', icon: ext(0, 1), x: 0, y: -2, max: 1, baseCost: 60, growth: 1, requires: ['craftSpeed'] },
  { id: 'double', branch: 'suzaku', name: '同時クラフト', desc: '5%の確率で2個同時に完成', icon: icons.bufPhy, x: 1, y: -2, max: 8, baseCost: 150, growth: 1.6, requires: ['craftSpeed'] },
  { id: 'forge', branch: 'suzaku', name: '鍛冶ハンマー', desc: '炉のハンマーが動き出す。クラフト時間 -15%', icon: ws.ambient_overlay_200, x: -1, y: -3, max: 1, baseCost: 250, growth: 1, requires: ['craftClick'] },
  { id: 'mine', branch: 'suzaku', name: 'マインちゃん雇用', desc: 'マインちゃんが一定間隔で壺をかき混ぜる（自動クリック・間隔短縮）', icon: catalog.staff.mine[0].image, x: -2, y: -3, max: 5, baseCost: 400, growth: 2, requires: ['craftClick'] },
  { id: 'rare', branch: 'suzaku', name: 'ブレイブ製法', desc: '具現化カプセルを導入。Rare をクラフトできる', icon: ext(0, 2), x: 0, y: -3, max: 1, baseCost: 500, growth: 1, requires: ['uncommon'] },
  { id: 'luck', branch: 'suzaku', name: '鑑定眼', desc: '最高レアリティの出現率 +25%', icon: icons.gems.leviathan, x: 1, y: -3, max: 8, baseCost: 300, growth: 1.7, requires: ['uncommon'] },
  { id: 'craftSpeed2', branch: 'suzaku', name: '錬金の極意', desc: 'クラフト時間 -6%', icon: icons.gems.tiamat, x: 1, y: -4, max: 10, baseCost: 3000, growth: 1.5, requires: ['rare'] },
  { id: 'epic', branch: 'suzaku', name: 'インペリアル製法', desc: 'Epic をクラフトできる', icon: ext(0, 3), x: 0, y: -4, max: 1, baseCost: 5000, growth: 1, requires: ['rare'] },
  { id: 'legendary', branch: 'suzaku', name: 'MCH製法', desc: 'Legendary をクラフトできる', icon: ext(0, 4), x: 0, y: -5, max: 1, baseCost: 150000, growth: 1, requires: ['epic'] },

  // 青龍: customers (right)
  { id: 'ad', branch: 'seiryu', name: '呼び込み', desc: '来客ペース +15%', icon: icons.bufAgi, x: 1, y: 0, max: 10, baseCost: 12, growth: 1.5, requires: ['root'] },
  { id: 'patience', branch: 'seiryu', name: '居心地の良さ', desc: '客が待ってくれる時間 +1.5秒', icon: icons.hp, x: 2, y: -1, max: 5, baseCost: 40, growth: 1.6, requires: ['ad'] },
  { id: 'tier1', branch: 'seiryu', name: '客層：Uncommon', desc: 'Uncommon ヒーローが来店（支払い ×1.25）', icon: hero(1), x: 2, y: 0, max: 1, baseCost: 80, growth: 1, requires: ['ad'] },
  { id: 'walk', branch: 'seiryu', name: '案内板', desc: '客の移動速度 +12%', icon: icons.bufAgi, x: 2, y: 1, max: 5, baseCost: 60, growth: 1.6, requires: ['ad'] },
  { id: 'lantern', branch: 'seiryu', name: 'ランタン装飾', desc: '工房にランタンを吊るす。来客ペース +20%', icon: ws.ambient_overlay_500, x: 3, y: -1, max: 1, baseCost: 350, growth: 1, requires: ['patience'] },
  { id: 'tier2', branch: 'seiryu', name: '客層：Rare', desc: 'Rare ヒーローが来店（支払い ×1.5）', icon: hero(2), x: 3, y: 0, max: 1, baseCost: 800, growth: 1, requires: ['tier1'] },
  { id: 'group', branch: 'seiryu', name: '団体客', desc: '8%の確率で客がもう1人一緒に来る', icon: hero(0), x: 3, y: 1, max: 5, baseCost: 500, growth: 1.8, requires: ['walk'] },
  { id: 'wordOfMouth', branch: 'seiryu', name: '口コミ', desc: '来客ペース +6%', icon: icons.ce, x: 4, y: -1, max: 10, baseCost: 4000, growth: 1.5, requires: ['lantern'] },
  { id: 'tier3', branch: 'seiryu', name: '客層：Epic', desc: 'Epic ヒーローが来店（支払い ×1.8）', icon: hero(3), x: 4, y: 0, max: 1, baseCost: 8000, growth: 1, requires: ['tier2'] },
  { id: 'tier4', branch: 'seiryu', name: '客層：Legendary', desc: 'Legendary ヒーローが来店（支払い ×2.2）', icon: hero(4), x: 5, y: 0, max: 1, baseCost: 200000, growth: 1, requires: ['tier3'] },

  // 黄竜: pricing and register (down)
  { id: 'price', branch: 'kouryu', name: '値付け上手', desc: '販売価格 +15%', icon: ext(11, 2), x: 0, y: 1, max: 10, baseCost: 20, growth: 1.55, requires: ['root'] },
  { id: 'cashier', branch: 'kouryu', name: 'クリスくん研修', desc: 'レジの会計時間 -10%', icon: catalog.staff.chris[0].image, x: 0, y: 2, max: 8, baseCost: 30, growth: 1.55, requires: ['price'] },
  { id: 'registerClick', branch: 'kouryu', name: 'レジ打ち', desc: 'レジクリックの効果 +40%', icon: icons.bufInt, x: 1, y: 2, max: 5, baseCost: 50, growth: 1.6, requires: ['price'] },
  { id: 'dayLength', branch: 'kouryu', name: '営業時間延長', desc: '1日の営業時間 +8秒', icon: icons.sleep, x: 0, y: 3, max: 10, baseCost: 100, growth: 1.6, requires: ['cashier'] },
  { id: 'tip', branch: 'kouryu', name: 'おもてなし', desc: '10%の確率でチップ（+50%）', icon: ext(6, 2), x: 1, y: 3, max: 5, baseCost: 300, growth: 1.7, requires: ['registerClick'] },
  { id: 'register', branch: 'kouryu', name: 'レジ増設', desc: 'レジを1台増やす（同時に会計）', icon: icons.int, x: 0, y: 4, max: 2, baseCost: 2000, growth: 8, requires: ['dayLength'] },
  { id: 'collector', branch: 'kouryu', name: '図鑑の知識', desc: '図鑑1種あたりの価格ボーナス +0.3%', icon: ext(5, 3), x: 1, y: 4, max: 5, baseCost: 1500, growth: 2, requires: ['tip'] },
  { id: 'brand', branch: 'kouryu', name: 'ブランド力', desc: '販売価格 +15%', icon: ext(10, 4), x: 0, y: 5, max: 10, baseCost: 10000, growth: 1.6, requires: ['register'] },

  // 白虎: security (down-left)
  { id: 'bounty', branch: 'byakko', name: '懸賞金', desc: '泥棒を捕まえた時の報酬 +50%', icon: catalog.thieves[0].image, x: -1, y: 1, max: 5, baseCost: 60, growth: 1.7, requires: ['root'] },
  { id: 'trap', branch: 'byakko', name: '足止め罠', desc: '泥棒の逃げ足 -12%', icon: icons.fear, x: -2, y: 2, max: 5, baseCost: 120, growth: 1.7, requires: ['bounty'] },
  { id: 'bell', branch: 'byakko', name: '防犯ベル', desc: '泥棒が盗むのにかかる時間 +0.5秒', icon: icons.decoy, x: -1, y: 2, max: 5, baseCost: 150, growth: 1.7, requires: ['bounty'] },
  { id: 'guard', branch: 'byakko', name: 'マイクリくん警備', desc: 'マイクリくんが逃げる泥棒を捕まえる（確率 +15%）', icon: catalog.staff.maycri[0].image, x: -2, y: 3, max: 5, baseCost: 1500, growth: 2, requires: ['trap'] },
  { id: 'ward', branch: 'byakko', name: '虫除け結界', desc: '工房荒らしの出現間隔 +20%', icon: icons.gems.garuda, x: -1, y: 3, max: 5, baseCost: 400, growth: 1.7, requires: ['bell'] },
  { id: 'exterminate', branch: 'byakko', name: '退治報酬', desc: '工房荒らし退治の報酬 +100%', icon: catalog.pests[0].image, x: -1, y: 4, max: 5, baseCost: 600, growth: 1.8, requires: ['ward'] },

  // 玄武: shelves, storage and recipes (left)
  { id: 'shelf', branch: 'genbu', name: '陳列棚増設', desc: '陳列スペース +1', icon: ext(9, 0), x: -1, y: 0, max: 9, baseCost: 25, growth: 1.65, requires: ['root'] },
  { id: 'conveyor', branch: 'genbu', name: '搬送レーン', desc: '搬送レーンを導入。棚が満杯でも倉庫に4個までストック', icon: ws.conveyor, x: -2, y: 0, max: 1, baseCost: 200, growth: 1, requires: ['shelf'] },
  { id: 'storage', branch: 'genbu', name: '倉庫拡張', desc: '倉庫の容量 +3', icon: ext(3, 1), x: -3, y: 0, max: 8, baseCost: 500, growth: 1.6, requires: ['conveyor'] },
  ...recipeNodes,
];

export const skillById = new Map(SKILLS.map((s) => [s.id, s]));

export type Levels = Record<string, number>;

export const level = (levels: Levels, id: string) => levels[id] ?? 0;

export function costOf(node: SkillNode, currentLevel: number): number {
  return Math.round(node.baseCost * Math.pow(node.growth, currentLevel));
}

export function isAvailable(node: SkillNode, levels: Levels): boolean {
  return node.requires.length === 0 || node.requires.some((r) => level(levels, r) > 0);
}

/** Visible = purchasable now, or adjacent to something purchasable (shown as a locked silhouette). */
export function isVisible(node: SkillNode, levels: Levels): boolean {
  if (isAvailable(node, levels)) return true;
  return node.requires.some((r) => {
    const parent = skillById.get(r);
    return parent ? isAvailable(parent, levels) : false;
  });
}
