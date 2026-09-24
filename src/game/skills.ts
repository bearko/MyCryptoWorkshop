import { catalog, customersByTier, icons, pests, series, thieves } from './catalog';
import type { Currency } from './currency';
import { PHASE3_NODES } from './skills3';
import { PHASE4_NODES } from './skills4';
import { PHASE5_SERIES_NODES } from './skills5';
import { HERO_SET_NODES } from './heroes';
import { add, atLeast, mul, overlay, pow, unlockSeries, type Effect } from './effects';

/** The five factions of My Crypto Heroes, plus the shop and research, are the branches of the skill tree. */
export type Branch = 'root' | 'suzaku' | 'seiryu' | 'kouryu' | 'byakko' | 'genbu' | 'store' | 'research' | 'series';

export const BRANCHES: Record<Branch, { name: string; role: string; color: string }> = {
  root: { name: '工房', role: '開業', color: '#e8d6a8' },
  suzaku: { name: '朱雀', role: 'クラフト', color: '#ff6b4a' },
  seiryu: { name: '青龍', role: '集客', color: '#3fb5ff' },
  kouryu: { name: '黄竜', role: '経営・レジ', color: '#ffd23f' },
  byakko: { name: '白虎', role: '防犯', color: '#e9eef5' },
  genbu: { name: '玄武', role: '陳列・倉庫・分解', color: '#58d6a0' },
  store: { name: '店舗', role: 'スタッフ・設備', color: '#ff9ecb' },
  research: { name: '研究', role: '研究ポイント', color: '#b48cff' },
  series: { name: 'シリーズ', role: 'レシピ・評判・量産', color: '#e6b56b' },
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
  /** …and all of these (e.g. a series' 評判 also needs 評判の広がり). */
  requiresAll?: string[];
  /** What each level does (see effects.ts). */
  effects: Effect[];
  /** Not shown in the tree: granted by the game (hero set rewards). */
  hidden?: boolean;
  /** Paid in gold dust or research points instead of GUM. */
  currency?: Exclude<Currency, 'gum'>;
}

const ext = (seriesIndex: number, rarityIndex: number) => series[seriesIndex].items[rarityIndex].image;
const hero = (tier: number) => customersByTier[tier][0].image;
const ws = catalog.workshop as Record<string, string>;

/** Series index by key, for readable node definitions. */
const S = Object.fromEntries(series.map((s, i) => [s.key, i])) as Record<string, number>;

/** Nodes added in Phase 2: production lines, overclock, editions, dismantling, 魔石, reputation. */
const PHASE2_NODES: SkillNode[] = [
  // Magic pot: overclock
  { id: 'potOverclock', branch: 'suzaku', name: '攪拌の極意', desc: '壺を長押ししたときの速さ +0.5倍', icon: icons.bufAgi, x: 2, y: -2, max: 5, baseCost: 300, growth: 1.8, requires: ['double'], effects: [add('pot.overclock', 0.5)] },
  { id: 'potCooling', branch: 'suzaku', name: '冷却の魔法陣', desc: '壺の過熱ペース -10%、冷却ペース +15%', icon: icons.gems.leviathan, x: 2, y: -3, max: 5, baseCost: 250, growth: 1.8, requires: ['potOverclock'], effects: [pow('pot.heatRate', 0.9), mul('pot.coolRate', 0.15)] },

  // Forge line (up-left)
  { id: 'forgeSpeed', branch: 'suzaku', name: 'ふいご', desc: '鍛冶炉のクラフト時間 -8%', icon: ext(S.Blade, 1), x: -2, y: -4, max: 10, baseCost: 400, growth: 1.5, requires: ['forge'], effects: [pow('forge.craftTime', 0.92)] },
  { id: 'forgeClick', branch: 'suzaku', name: '槌さばき', desc: '鍛冶炉タップの効果 +40%', icon: ext(S.Katana, 1), x: -3, y: -4, max: 5, baseCost: 500, growth: 1.7, requires: ['forgeSpeed'], effects: [mul('forge.craftClick', 0.4)] },
  { id: 'forgeDouble', branch: 'suzaku', name: '二丁掛け', desc: '鍛冶炉で5%の確率で2個同時に完成', icon: ext(S.Musket, 2), x: -4, y: -4, max: 8, baseCost: 900, growth: 1.6, requires: ['forgeClick'], effects: [add('forge.doubleChance', 0.05)] },
  { id: 'forgeTemper', branch: 'suzaku', name: '焼き入れ', desc: '鍛冶炉のエディションの出やすさ +20%', icon: ext(S.Shield, 2), x: -2, y: -5, max: 8, baseCost: 1200, growth: 1.7, requires: ['forgeSpeed'], effects: [mul('forge.editionLuck', 0.2)] },
  { id: 'forgeOverclock', branch: 'suzaku', name: '大ふいご', desc: '鍛冶炉を長押ししたときの速さ +0.5倍', icon: icons.bufPhy, x: -3, y: -5, max: 5, baseCost: 800, growth: 1.8, requires: ['forgeClick'], effects: [add('forge.overclock', 0.5)] },
  { id: 'forgeCooling', branch: 'suzaku', name: '水桶', desc: '鍛冶炉の過熱ペース -10%、冷却ペース +15%', icon: ext(S.Armor, 1), x: -4, y: -5, max: 5, baseCost: 700, growth: 1.8, requires: ['forgeDouble'], effects: [pow('forge.heatRate', 0.9), mul('forge.coolRate', 0.15)] },
  { id: 'forgeSpeed2', branch: 'suzaku', name: '名匠の技', desc: '鍛冶炉のクラフト時間 -6%', icon: ext(S.Katana, 4), x: -2, y: -6, max: 10, baseCost: 8000, growth: 1.5, requires: ['forgeTemper'], effects: [pow('forge.craftTime', 0.94)] },

  // Editions (column above the forge)
  { id: 'appraisal', branch: 'suzaku', name: '鑑定の心得', desc: '「鑑定済み」エディション（×1.6）が出るようになる', icon: ext(S.Ring, 2), x: -1, y: -4, max: 1, baseCost: 1500, growth: 1, requires: ['forge'], effects: [atLeast('editionTier', 1)] },
  { id: 'engraving', branch: 'suzaku', name: '刻印術', desc: '「刻印入り」エディション（×3）が出るようになる', icon: ext(S.Blade, 3), x: -1, y: -5, max: 1, baseCost: 60, growth: 1, requires: ['appraisal'], effects: [atLeast('editionTier', 2)], currency: 'dust' },
  { id: 'autograph', branch: 'suzaku', name: 'サイン会', desc: 'ヒーローの「サイン入り」エディション（×6）が出るようになる', icon: ext(S.Quill, 4), x: -1, y: -6, max: 1, baseCost: 250, growth: 1, requires: ['engraving'], effects: [atLeast('editionTier', 3)], currency: 'dust' },
  { id: 'goldLeaf', branch: 'suzaku', name: '金箔細工', desc: '「黄金」エディション（×15）が出るようになる', icon: ext(S.Goblet, 4), x: -1, y: -7, max: 1, baseCost: 1000, growth: 1, requires: ['autograph'], effects: [atLeast('editionTier', 4)], currency: 'dust' },
  { id: 'editionLuck', branch: 'suzaku', name: '目利き', desc: 'エディションの出やすさ +20%（全ライン）', icon: icons.gems.garuda, x: -2, y: -7, max: 10, baseCost: 30, growth: 1.5, requires: ['autograph'], effects: [mul('editionLuck', 0.2)], currency: 'dust' },
  { id: 'shinForge', branch: 'suzaku', name: '真打ち', desc: 'Legendary が3%の確率で「真」版（×4）になる', icon: series[S.Blade].shin!.image, x: 0, y: -6, max: 5, baseCost: 500, growth: 1.6, requires: ['legendary'], effects: [add('shinChance', 0.03)], currency: 'dust' },

  // Capsule line (up-right)
  { id: 'capsuleLine', branch: 'suzaku', name: '具現化カプセル起動', desc: '3号機「具現化カプセル」が動き出す。幻獣（価格×1.5）を専門に作る。ホースのレシピ付き', icon: ext(S.Dragon, 3), x: 2, y: -4, max: 1, baseCost: 3000, growth: 1, requires: ['rare'], effects: [add('capsule.unlocked', 1), overlay('capsule'), unlockSeries(S.Horse), mul('spawnRate', 0.06, 'variety')] },
  { id: 'capsuleSpeed', branch: 'suzaku', name: '培養液', desc: 'カプセルのクラフト時間 -8%', icon: ext(S.Horse, 1), x: 3, y: -4, max: 10, baseCost: 2500, growth: 1.5, requires: ['capsuleLine'], effects: [pow('capsule.craftTime', 0.92)] },
  { id: 'capsuleClick', branch: 'suzaku', name: '起動スイッチ', desc: 'カプセルタップの効果 +40%', icon: ext(S.Parrot, 1), x: 4, y: -4, max: 5, baseCost: 3000, growth: 1.7, requires: ['capsuleSpeed'], effects: [mul('capsule.craftClick', 0.4)] },
  { id: 'capsuleDouble', branch: 'suzaku', name: '双子の卵', desc: 'カプセルで5%の確率で2体同時に完成', icon: ext(S.Fairy, 2), x: 5, y: -4, max: 8, baseCost: 5000, growth: 1.6, requires: ['capsuleClick'], effects: [add('capsule.doubleChance', 0.05)] },
  { id: 'capsuleLuck', branch: 'suzaku', name: '幻獣召喚陣', desc: 'カプセルの最高レアの出やすさ +25%', icon: ext(S.Pegasus, 2), x: 3, y: -5, max: 8, baseCost: 4000, growth: 1.7, requires: ['capsuleSpeed'], effects: [add('capsule.luck', 0.25)] },
  { id: 'capsuleOverclock', branch: 'suzaku', name: '過充電', desc: 'カプセルを長押ししたときの速さ +0.5倍', icon: icons.bufInt, x: 4, y: -5, max: 5, baseCost: 3500, growth: 1.8, requires: ['capsuleClick'], effects: [add('capsule.overclock', 0.5)] },
  { id: 'capsuleCooling', branch: 'suzaku', name: '冷却液', desc: 'カプセルの過熱ペース -10%、冷却ペース +15%', icon: ext(S.Tiger, 1), x: 5, y: -5, max: 5, baseCost: 3000, growth: 1.8, requires: ['capsuleDouble'], effects: [pow('capsule.heatRate', 0.9), mul('capsule.coolRate', 0.15)] },

  // 玄武: dismantling, 魔石, packer (left)
  { id: 'packer', branch: 'genbu', name: '梱包機', desc: '倉庫から棚へ、高い品を優先して素早く補充する', icon: ext(S.Book, 0), x: -3, y: 1, max: 1, baseCost: 1200, growth: 1, requires: ['storage'], effects: [atLeast('packer', 1)] },
  { id: 'dismantle', branch: 'genbu', name: '分解炉', desc: '置き場所がないとき、Common の通常品を分解してゴールドダストと魔石にする', icon: icons.dust, x: -4, y: 0, max: 1, baseCost: 1500, growth: 1, requires: ['storage'], effects: [atLeast('dismantleRarity', 0)] },
  { id: 'dismantleRarity', branch: 'genbu', name: '分解の火力', desc: '分解炉で分解できるレアリティ +1（Uncommon → Rare）', icon: icons.gems.ifrit, x: -5, y: 0, max: 2, baseCost: 5000, growth: 4, requires: ['dismantle'], effects: [add('dismantleRarity', 1)] },
  { id: 'dustYield', branch: 'genbu', name: '精錬', desc: '分解で得るゴールドダスト +25%', icon: icons.dust, x: -6, y: 0, max: 8, baseCost: 2000, growth: 1.6, requires: ['dismantleRarity'], effects: [mul('dustMult', 0.25)] },
  { id: 'gemChance', branch: 'genbu', name: '魔石の目', desc: '分解で魔石が出る確率 +10%', icon: icons.gems.tiamat, x: -4, y: 1, max: 5, baseCost: 2500, growth: 1.7, requires: ['dismantle'], effects: [add('gemChance', 0.1)] },
  { id: 'infusion', branch: 'genbu', name: '魔石の投入', desc: '営業前に各ラインへ魔石を投入して1日強化できる（1日2個）', icon: icons.gems.leviathan, x: -5, y: 1, max: 1, baseCost: 40, growth: 1, requires: ['gemChance'], effects: [atLeast('infusion', 1)], currency: 'dust' },
  { id: 'infusionPower', branch: 'genbu', name: '魔石の共鳴', desc: '魔石の効果 +25%', icon: icons.gems.garuda, x: -6, y: 1, max: 4, baseCost: 100, growth: 2, requires: ['infusion'], effects: [mul('infusionPower', 0.25)], currency: 'dust' },

  // 黄竜: reputation
  { id: 'reputation', branch: 'kouryu', name: '評判の広がり', desc: '販売価格 +5%。シリーズごとの評判を上げられるようになる', icon: icons.emblem, x: 2, y: 3, max: 1, baseCost: 1000, growth: 1, requires: ['tip'], effects: [mul('priceMult', 0.05)] },
];

export const SKILLS: SkillNode[] = [
  { id: 'root', branch: 'root', name: '工房開業', desc: 'あなたのクラフト工房。ここから五勢力の技術が広がる', icon: ws.workshop_base, x: 0, y: 0, max: 1, baseCost: 0, growth: 1, requires: [], effects: [] },

  // 朱雀: crafting (up)
  { id: 'craftSpeed', branch: 'suzaku', name: '壺の火力', desc: 'クラフト時間 -8%', icon: icons.gems.ifrit, x: 0, y: -1, max: 10, baseCost: 15, growth: 1.5, requires: ['root'], effects: [pow('pot.craftTime', 0.92)] },
  { id: 'craftClick', branch: 'suzaku', name: '職人の手際', desc: '壺タップの効果 +40%', icon: ext(0, 1), x: -1, y: -2, max: 5, baseCost: 30, growth: 1.7, requires: ['craftSpeed'], effects: [mul('pot.craftClick', 0.4)] },
  { id: 'uncommon', branch: 'suzaku', name: 'エリート製法', desc: 'Uncommon のエクステンションをクラフトできる', icon: ext(0, 1), x: 0, y: -2, max: 1, baseCost: 60, growth: 1, requires: ['craftSpeed'], effects: [atLeast('maxRarity', 1)] },
  { id: 'double', branch: 'suzaku', name: '同時クラフト', desc: '5%の確率で2個同時に完成', icon: icons.bufPhy, x: 1, y: -2, max: 8, baseCost: 150, growth: 1.6, requires: ['craftSpeed'], effects: [add('pot.doubleChance', 0.05)] },
  { id: 'forge', branch: 'suzaku', name: '鍛冶炉を稼働', desc: '2号機「鍛冶炉」が動き出す。武具を専門に作り、エディション付きが出やすい', icon: ws.ambient_overlay_200, x: -1, y: -3, max: 1, baseCost: 1500, growth: 1, requires: ['craftClick'], effects: [add('forge.unlocked', 1), overlay('ambient_overlay_200')] },
  { id: 'mine', branch: 'suzaku', name: 'マインちゃん雇用', desc: 'マインちゃんが一定間隔で壺をかき混ぜる（自動クリック・間隔短縮）', icon: catalog.staff.mine[0].image, x: -2, y: -3, max: 5, baseCost: 400, growth: 2, requires: ['craftClick'], effects: [add('pot.helperInterval', -0.35, 2.75)] },
  { id: 'rare', branch: 'suzaku', name: 'ブレイブ製法', desc: 'Rare をクラフトできる', icon: ext(0, 2), x: 0, y: -3, max: 1, baseCost: 1500, growth: 1, requires: ['uncommon'], effects: [atLeast('maxRarity', 2)] },
  { id: 'luck', branch: 'suzaku', name: '鑑定眼', desc: '最高レアリティの出現率 +25%（全ライン）', icon: icons.gems.leviathan, x: 1, y: -3, max: 8, baseCost: 300, growth: 1.7, requires: ['uncommon'], effects: [add('luck', 0.25), overlay('ambient_overlay_401'), overlay('ambient_overlay_402', 3), overlay('ambient_overlay_325', 5)] },
  { id: 'craftSpeed2', branch: 'suzaku', name: '錬金の極意', desc: 'クラフト時間 -6%', icon: icons.gems.tiamat, x: 1, y: -4, max: 10, baseCost: 3000, growth: 1.5, requires: ['rare'], effects: [pow('pot.craftTime', 0.94)] },
  { id: 'epic', branch: 'suzaku', name: 'インペリアル製法', desc: 'Epic をクラフトできる', icon: ext(0, 3), x: 0, y: -4, max: 1, baseCost: 120000, growth: 1, requires: ['rare'], effects: [atLeast('maxRarity', 3)] },
  { id: 'legendary', branch: 'suzaku', name: 'MCH製法', desc: 'Legendary をクラフトできる', icon: ext(0, 4), x: 0, y: -5, max: 1, baseCost: 20000000, growth: 1, requires: ['epic'], effects: [atLeast('maxRarity', 4)] },

  // 青龍: customers (right)
  { id: 'ad', branch: 'seiryu', name: '呼び込み', desc: '来客ペース +15%', icon: icons.bufAgi, x: 1, y: 0, max: 10, baseCost: 12, growth: 1.5, requires: ['root'], effects: [mul('spawnRate', 0.15)] },
  { id: 'patience', branch: 'seiryu', name: '居心地の良さ', desc: '客が待ってくれる時間 +1.5秒', icon: icons.hp, x: 2, y: -1, max: 5, baseCost: 40, growth: 1.6, requires: ['ad'], effects: [add('patience', 1.5), add('queuePatience', 1.5)] },
  { id: 'tier1', branch: 'seiryu', name: '客層：Uncommon', desc: 'Uncommon ヒーローが来店（支払い ×1.25）', icon: hero(1), x: 2, y: 0, max: 1, baseCost: 80, growth: 1, requires: ['ad'], effects: [atLeast('maxTier', 1)] },
  { id: 'walk', branch: 'seiryu', name: '案内板', desc: '客の移動速度 +12%', icon: icons.bufAgi, x: 2, y: 1, max: 5, baseCost: 60, growth: 1.6, requires: ['ad'], effects: [mul('walkSpeed', 0.12)] },
  { id: 'lantern', branch: 'seiryu', name: 'ランタン装飾', desc: '工房にランタンを吊るす。来客ペース +20%', icon: ws.ambient_overlay_500, x: 3, y: -1, max: 1, baseCost: 350, growth: 1, requires: ['patience'], effects: [mul('spawnRate', 0.2), overlay('ambient_overlay_500')] },
  { id: 'tier2', branch: 'seiryu', name: '客層：Rare', desc: 'Rare ヒーローが来店（支払い ×1.5）', icon: hero(2), x: 3, y: 0, max: 1, baseCost: 800, growth: 1, requires: ['tier1'], effects: [atLeast('maxTier', 2)] },
  { id: 'group', branch: 'seiryu', name: '団体客', desc: '8%の確率で客がもう1人一緒に来る', icon: hero(0), x: 3, y: 1, max: 5, baseCost: 500, growth: 1.8, requires: ['walk'], effects: [add('groupChance', 0.08)] },
  { id: 'wordOfMouth', branch: 'seiryu', name: '口コミ', desc: '来客ペース +6%', icon: icons.ce, x: 4, y: -1, max: 10, baseCost: 4000, growth: 1.5, requires: ['lantern'], effects: [mul('spawnRate', 0.06)] },
  { id: 'tier3', branch: 'seiryu', name: '客層：Epic', desc: 'Epic ヒーローが来店（支払い ×1.8）', icon: hero(3), x: 4, y: 0, max: 1, baseCost: 8000, growth: 1, requires: ['tier2'], effects: [atLeast('maxTier', 3)] },
  { id: 'tier4', branch: 'seiryu', name: '客層：Legendary', desc: 'Legendary ヒーローが来店（支払い ×2.2）', icon: hero(4), x: 5, y: 0, max: 1, baseCost: 1500000, growth: 1, requires: ['tier3'], effects: [atLeast('maxTier', 4)] },

  // 黄竜: pricing and register (down)
  { id: 'price', branch: 'kouryu', name: '値付け上手', desc: '販売価格 +15%', icon: ext(11, 2), x: 0, y: 1, max: 10, baseCost: 20, growth: 1.55, requires: ['root'], effects: [mul('priceMult', 0.15)] },
  { id: 'cashier', branch: 'kouryu', name: 'クリスくん研修', desc: 'レジの会計時間 -10%', icon: catalog.staff.chris[0].image, x: 0, y: 2, max: 8, baseCost: 30, growth: 1.55, requires: ['price'], effects: [pow('cashierTime', 0.9)] },
  { id: 'registerClick', branch: 'kouryu', name: 'レジ打ち', desc: 'レジクリックの効果 +40%', icon: icons.bufInt, x: 1, y: 2, max: 5, baseCost: 50, growth: 1.6, requires: ['price'], effects: [mul('registerClick', 0.4)] },
  { id: 'dayLength', branch: 'kouryu', name: '営業時間延長', desc: '1日の営業時間 +8秒', icon: icons.sleep, x: 0, y: 3, max: 10, baseCost: 100, growth: 1.6, requires: ['cashier'], effects: [add('dayLength', 8)] },
  { id: 'tip', branch: 'kouryu', name: 'おもてなし', desc: '10%の確率でチップ（+50%）', icon: ext(6, 2), x: 1, y: 3, max: 5, baseCost: 300, growth: 1.7, requires: ['registerClick'], effects: [add('tipChance', 0.1)] },
  { id: 'register', branch: 'kouryu', name: 'レジ増設', desc: 'レジを1台増やす（同時に会計）', icon: icons.int, x: 0, y: 4, max: 2, baseCost: 2000, growth: 8, requires: ['dayLength'], effects: [add('registers', 1)] },
  { id: 'collector', branch: 'kouryu', name: '図鑑の知識', desc: '図鑑1種あたりの価格ボーナス +0.06%', icon: ext(5, 3), x: 1, y: 4, max: 5, baseCost: 1500, growth: 2, requires: ['tip'], effects: [add('collectionBonus', 0.0006)] },
  { id: 'brand', branch: 'kouryu', name: 'ブランド力', desc: '販売価格 +15%', icon: ext(10, 4), x: 0, y: 5, max: 10, baseCost: 4000, growth: 1.6, requires: ['register'], effects: [mul('priceMult', 0.15)] },

  // 白虎: security (down-left)
  { id: 'bounty', branch: 'byakko', name: '懸賞金', desc: '泥棒を捕まえた時の報酬 +50%', icon: thieves[0].image, x: -1, y: 1, max: 5, baseCost: 60, growth: 1.7, requires: ['root'], effects: [add('bountyMult', 0.5)] },
  { id: 'trap', branch: 'byakko', name: '足止め罠', desc: '泥棒の逃げ足 -12%', icon: icons.fear, x: -2, y: 2, max: 5, baseCost: 120, growth: 1.7, requires: ['bounty'], effects: [pow('thiefSpeed', 0.88)] },
  { id: 'bell', branch: 'byakko', name: '防犯ベル', desc: '泥棒が盗むのにかかる時間 +0.5秒', icon: icons.decoy, x: -1, y: 2, max: 5, baseCost: 150, growth: 1.7, requires: ['bounty'], effects: [add('stealTime', 0.5)] },
  { id: 'guard', branch: 'byakko', name: 'マイクリくん警備', desc: 'マイクリくんが逃げる泥棒を捕まえる（確率 +15%）', icon: catalog.staff.maycri[0].image, x: -2, y: 3, max: 5, baseCost: 1500, growth: 2, requires: ['trap'], effects: [add('guardChance', 0.15)] },
  { id: 'ward', branch: 'byakko', name: '虫除け結界', desc: '工房荒らしの出現間隔 +20%', icon: icons.gems.garuda, x: -1, y: 3, max: 5, baseCost: 400, growth: 1.7, requires: ['bell'], effects: [add('pestInterval', 0.2)] },
  { id: 'exterminate', branch: 'byakko', name: '退治報酬', desc: '工房荒らし退治の報酬 +100%', icon: pests[0].image, x: -1, y: 4, max: 5, baseCost: 600, growth: 1.8, requires: ['ward'], effects: [add('pestBountyMult', 1)] },

  // 玄武: shelves, storage and recipes (left)
  { id: 'shelf', branch: 'genbu', name: '陳列棚増設', desc: '陳列スペース +1', icon: ext(9, 0), x: -1, y: 0, max: 9, baseCost: 25, growth: 1.65, requires: ['root'], effects: [add('shelfSlots', 1)] },
  { id: 'conveyor', branch: 'genbu', name: '搬送レーン', desc: '搬送レーンを導入。棚が満杯でも倉庫に4個までストック', icon: ws.conveyor, x: -2, y: 0, max: 1, baseCost: 200, growth: 1, requires: ['shelf'], effects: [add('storageCap', 0, 4), overlay('conveyor')] },
  { id: 'storage', branch: 'genbu', name: '倉庫拡張', desc: '倉庫の容量 +3', icon: ext(3, 1), x: -3, y: 0, max: 8, baseCost: 500, growth: 1.6, requires: ['conveyor'], effects: [add('storageCap', 3)] },
  ...PHASE2_NODES,
  ...PHASE3_NODES,
  ...PHASE4_NODES,
  ...PHASE5_SERIES_NODES,
  ...HERO_SET_NODES,
];

export const skillById = new Map(SKILLS.map((s) => [s.id, s]));

/** The nodes shown in the skill tree (hidden set rewards left out). */
export const TREE_NODES = SKILLS.filter((n) => !n.hidden);

export type Levels = Record<string, number>;

export const level = (levels: Levels, id: string) => levels[id] ?? 0;

export function costOf(node: SkillNode, currentLevel: number): number {
  return Math.round(node.baseCost * Math.pow(node.growth, currentLevel));
}

export function isAvailable(node: SkillNode, levels: Levels): boolean {
  if (node.hidden) return false;
  if (node.requiresAll?.some((r) => level(levels, r) <= 0)) return false;
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
