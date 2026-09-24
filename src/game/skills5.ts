// i18n-check: skip — node text is replaced from skillsEn.ts in English (tests/i18n.test.ts checks it).
// Phase 5: every series in one grid, top-left of the tree. Each series is a row of up to five
// nodes — レシピ (unlock), 評判 (price), 量産 (how often it is crafted), 名品 (edition chance)
// and 真打ち (真 chance, paid in research points, series with a 真 only). Rows run in bands of 30:
// the first band goes up from the レシピ帳 hub, the next comes back down, and so on.
import { icons, series, seriesIcon } from './catalog';
import { add, atLeast, mul, pow, seriesEdition, seriesPrice, seriesShin, seriesWeight, unlockSeries, type Effect } from './effects';
import { LINE_IDS } from './lines';
import type { SkillNode } from './skills';
import { t } from '../i18n';

const BAND = 30;
const BAND_X0 = -10;
const BAND_W = 6;

/** Grid position of series `i`: its row, and the column of its レシピ node. */
export function seriesCell(i: number): { x: number; y: number } {
  const band = Math.floor(i / BAND);
  const r = i % BAND;
  return { x: BAND_X0 - BAND_W * band, y: band % 2 === 0 ? -1 - r : -BAND + r };
}

/** Costs of the first recipes (unchanged from before the grid). */
const EARLY_RECIPE_COSTS = [0, 40, 100, 250, 600, 1500, 3500, 5000, 9000, 16000, 30000, 55000];
const EARLY_BEAST_COSTS = [5000, 12000, 25000, 50000, 90000];

const recipeId = (i: number) => `recipe_${series[i].key}`;
const HORSE = series.findIndex((s) => s.key === 'Horse');

/** Price of each series' recipe, following the unlock order within its group (beasts / the rest). */
const recipeCost: number[] = [];
{
  let plain = 0;
  let beast = 0;
  series.forEach((s, i) => {
    if (i === 0 || i === HORSE) recipeCost.push(i === 0 ? 20 : 3000);
    else if (s.family === 'beast') {
      recipeCost.push(beast < EARLY_BEAST_COSTS.length ? EARLY_BEAST_COSTS[beast] : Math.round(90000 * Math.pow(1.13, beast - 4)));
      beast++;
    } else {
      plain++;
      recipeCost.push(plain < EARLY_RECIPE_COSTS.length ? EARLY_RECIPE_COSTS[plain] : Math.round(55000 * Math.pow(1.08, plain - 11)));
    }
  });
}

/** The node that opens series i's row (its recipe, or the hub / capsule line for the free ones). */
function rowKey(i: number): string {
  if (i === 0) return 'recipeBook';
  if (i === HORSE) return 'capsuleLine';
  return recipeId(i);
}

/** Recipe i requires the previous recipe of its group. */
function previousRecipe(i: number): string {
  const beast = series[i].family === 'beast';
  for (let j = i - 1; j > 0; j--) {
    if ((series[j].family === 'beast') !== beast) continue;
    return j === HORSE ? 'capsuleLine' : recipeId(j);
  }
  return beast ? 'capsuleLine' : 'recipeBook';
}

function seriesNodes(i: number): SkillNode[] {
  const s = series[i];
  const { x, y } = seriesCell(i);
  const icon = s.items[Math.min(4, 1 + Math.floor(i / 40))].image;
  const cost = recipeCost[i];
  const beast = s.family === 'beast';
  const nodes: SkillNode[] = [];
  if (i !== 0 && i !== HORSE) {
    // Variety draws customers: early recipes a lot, later ones a little.
    const variety = i < 18 ? 0.06 : 0.01;
    nodes.push({
      id: recipeId(i), branch: 'series', name: t(`レシピ：${s.name}`, `Recipe: ${s.name}`),
      desc: beast
        ? t(`具現化カプセルで${s.name}シリーズ（幻獣）を作れるようになる`, `The Materialize Capsule can make the ${s.name} series (beasts)`)
        : t(`${s.name}シリーズをクラフトできるようになる。品揃えが増えて来客ペースが上がる`, `Lets you craft the ${s.name} series. A wider range draws more customers`),
      icon: s.items[0].image, x, y, max: 1, baseCost: cost, growth: 1,
      requires: [previousRecipe(i)], requiresAll: beast ? ['capsuleLine'] : undefined,
      effects: [unlockSeries(i), mul('spawnRate', variety, 'variety')],
    });
  }
  const opens = [rowKey(i)];
  nodes.push(
    {
      id: `rep_${s.key}`, branch: 'series', name: t(`評判：${s.name}`, `Reputation: ${s.name}`), desc: t(`${s.name}シリーズの販売価格 +10%`, `${s.name} series sale price +10%`),
      icon, x: x - 1, y, max: 5, baseCost: Math.max(800, Math.round(cost * 0.6)), growth: 1.7,
      requires: opens, requiresAll: ['reputation'], effects: [seriesPrice(i, 0.1)],
    },
    {
      id: `mass_${s.key}`, branch: 'series', name: t(`量産：${s.name}`, `Mass Production: ${s.name}`), desc: t(`${s.name}シリーズがクラフトされやすくなる（+100%）`, `The ${s.name} series is crafted more often (+100%)`),
      icon: s.items[0].image, x: x - 2, y, max: 5, baseCost: Math.max(500, Math.round(cost * 0.3)), growth: 1.6,
      requires: opens, requiresAll: ['planning'], effects: [seriesWeight(i, 1)],
    },
    {
      id: `master_${s.key}`, branch: 'series', name: t(`名品：${s.name}`, `Masterpiece: ${s.name}`), desc: t(`${s.name}シリーズのエディションの出やすさ +20%`, `${s.name} series edition chance +20%`),
      icon: s.items[3].image, x: x - 3, y, max: 5, baseCost: Math.max(1000, Math.round(cost * 0.4)), growth: 1.7,
      requires: opens, requiresAll: ['masterwork'], effects: [seriesEdition(i, 0.2)],
    },
  );
  if (s.shin) {
    nodes.push({
      id: `shin_${s.key}`, branch: 'series', name: t(`真打ち：${s.name}`, `Shin Craft: ${s.name}`), desc: t(`${s.name}シリーズの Legendary が「真」になる確率 +5%`, `Chance that a ${s.name} Legendary is Shin +5%`),
      icon: s.shin.image, x: x - 4, y, max: 3, baseCost: 5 + Math.round(i / 10), growth: 1.5,
      requires: opens, requiresAll: ['shinForge'], effects: [seriesShin(i, 0.05)], currency: 'research',
    });
  }
  return nodes;
}

/** 名誉 (honor): permanent perks bought with emblems from achievements and daily requests. */
const HONOR: { key: string; name: string; desc: string; icon: string; effects: Effect[] }[] = [
  { key: 'price', name: t('名声', 'Renown'), desc: t('販売価格 +5%', 'Sale price +5%'), icon: icons.emblem, effects: [mul('priceMult', 0.05, 'honor')] },
  { key: 'craft', name: t('手際', 'Dexterity'), desc: t('全ラインのクラフト時間 -4%', 'Craft time -4% (all lines)'), icon: icons.bufPhy, effects: LINE_IDS.map((l): Effect => pow(`${l}.craftTime`, 0.96)) },
  { key: 'crowd', name: t('人気', 'Popularity'), desc: t('来客ペース +5%', 'Customer rate +5%'), icon: icons.bufAgi, effects: [mul('spawnRate', 0.05, 'honor')] },
  { key: 'hours', name: t('夜なべ', 'Night Work'), desc: t('1日の営業時間 +4秒', 'Business day +4s'), icon: icons.sleep, effects: [add('dayLength', 4)] },
  { key: 'research', name: t('研究熱心', 'Studious'), desc: t('研究ポイント +15%', 'Research points +15%'), icon: icons.int, effects: [mul('researchRate', 0.15, 'honor')] },
  { key: 'edition', name: t('目利き', 'Connoisseur'), desc: t('エディションの出やすさ +8%', 'Edition chance +8%'), icon: icons.gems.garuda, effects: [mul('editionLuck', 0.08, 'honor')] },
  { key: 'luck', name: t('幸運', 'Fortune'), desc: t('最高レアの出やすさ +8%（全ライン）', 'Top-rarity chance +8% (all lines)'), icon: icons.gems.tiamat, effects: [add('luck', 0.08)] },
  { key: 'storage', name: t('倉庫番', 'Storekeeper'), desc: t('倉庫の容量 +3', 'Storage capacity +3'), icon: seriesIcon('Chair', 3), effects: [add('storageCap', 3)] },
  { key: 'guard', name: t('防犯', 'Security'), desc: t('泥棒の逃げ足 -5%', 'Thief speed -5%'), icon: icons.fear, effects: [pow('thiefSpeed', 0.95)] },
  { key: 'patience', name: t('もてなし', 'Hospitality'), desc: t('棚とレジで待つ時間 +1秒', 'Customers wait 1s longer at shelves and registers'), icon: icons.hp, effects: [add('patience', 1), add('queuePatience', 1)] },
  { key: 'tip', name: t('心づけ', 'Gratuity'), desc: t('チップの確率 +3%', 'Tip chance +3%'), icon: seriesIcon('Wallet', 1), effects: [add('tipChance', 0.03)] },
  { key: 'dust', name: t('精錬の誉れ', 'Refiner\'s Pride'), desc: t('ゴールドダスト +15%', 'Gold dust +15%'), icon: icons.dust, effects: [mul('dustMult', 0.15, 'honor')] },
  { key: 'gem', name: t('魔石の縁', 'Stone Affinity'), desc: t('魔石が出る確率 +5%', 'Magic stone chance +5%'), icon: icons.gems.ifrit, effects: [add('gemChance', 0.05)] },
  { key: 'vehicle', name: t('観光名所', 'Tourist Spot'), desc: t('乗り物で来る客 +1人', 'Customers per vehicle +1'), icon: seriesIcon('Horse', 4), effects: [add('vehicleSize', 1)] },
  { key: 'fans', name: t('看板', 'Signboard'), desc: t('顔なじみ・常連の支払いボーナス +20%', 'Familiar-face and regular payment bonus +20%'), icon: seriesIcon('Oriflamme', 2), effects: [mul('affinityPower', 0.2, 'honor')] },
];
const HONOR_RANKS = ['I', 'II', 'III', 'IV', 'V'];
/** Emblems per rank (× 1–3 by row: the lower perks cost more). */
const HONOR_COSTS = [2, 5, 10, 20, 40];

const honorNodes: SkillNode[] = [
  { id: 'honorHub', branch: 'honor', name: '名誉の殿堂', desc: '実績とデイリー依頼で得たエンブレムで、永続の特典を習得できる', icon: icons.emblem, x: 13, y: 0, max: 1, baseCost: 1, growth: 1, requires: [], effects: [mul('priceMult', 0.02, 'honor')], currency: 'emblem' },
  ...HONOR.flatMap((perk, row) =>
    HONOR_RANKS.map((rank, r): SkillNode => ({
      id: `honor_${perk.key}_${r + 1}`, branch: 'honor', name: `${perk.name} ${rank}`, desc: perk.desc, icon: perk.icon,
      x: 14 + r, y: row - 7, max: 1, baseCost: HONOR_COSTS[r] * (1 + Math.floor(row / 5)), growth: 1,
      requires: [r === 0 ? 'honorHub' : `honor_${perk.key}_${r}`], effects: perk.effects, currency: 'emblem',
    })),
  ),
];

/** GUM price of the clear goal (tuned with `npm run balance` for about 6 hours of play). */
export const CLEAR_COST = 3e11;

export const PHASE5_SERIES_NODES: SkillNode[] = [
  ...honorNodes,
  {
    id: 'goldenExtension', branch: 'suzaku', name: '黄金のエクステンション', desc: '伝説の工房の証。すべてのシリーズの技を注ぎ込んだ黄金のエクステンションを作る（ゲームクリア）。販売価格 +100%',
    icon: series[0].items[4].image, x: 0, y: -7, max: 1, baseCost: CLEAR_COST, growth: 1, requires: ['legendary'], effects: [atLeast('cleared', 1), mul('priceMult', 1)],
  },
  // Hubs next to 陳列棚増設
  { id: 'recipeBook', branch: 'series', name: 'レシピ帳', desc: 'シリーズのレシピを集め始める。品揃えを意識して来客ペース +5%', icon: icons.gems.leviathan, x: -2, y: -1, max: 1, baseCost: 20, growth: 1, requires: ['shelf'], effects: [mul('spawnRate', 0.05)] },
  { id: 'planning', branch: 'series', name: '生産計画', desc: 'シリーズごとの「量産」を習得できるようになる。全ラインのクラフト時間 -3%', icon: icons.bufPhy, x: -3, y: -2, max: 1, baseCost: 5000, growth: 1, requires: ['recipeBook'], effects: LINE_IDS.map((l): Effect => pow(`${l}.craftTime`, 0.97)) },
  { id: 'masterwork', branch: 'series', name: '名品鑑定', desc: 'シリーズごとの「名品」を習得できるようになる。エディションの出やすさ +5%', icon: icons.gems.garuda, x: -2, y: -2, max: 1, baseCost: 20000, growth: 1, requires: ['recipeBook'], requiresAll: ['appraisal'], effects: [mul('editionLuck', 0.05)] },
  ...series.flatMap((_, i) => seriesNodes(i)),

  // 青龍: orders and affinity (above the collectors)
  { id: 'orders', branch: 'seiryu', name: '注文受付', desc: 'ヒーローから「ゆかりの品」の注文を受けられるようになる（1件）。注文の品は ×3 で売れる', icon: seriesIcon('Scrolls', 2), x: 6, y: -4, max: 1, baseCost: 15000, growth: 1, requires: ['collectors'], effects: [add('orderSlots', 1)] },
  { id: 'orderSlots', branch: 'seiryu', name: '注文帳', desc: '同時に受けられる注文 +1件', icon: seriesIcon('Book', 2), x: 7, y: -4, max: 2, baseCost: 40000, growth: 3, requires: ['orders'], effects: [add('orderSlots', 1)] },
  { id: 'orderPay', branch: 'seiryu', name: '特注価格', desc: '注文の品の値段 +0.5倍', icon: seriesIcon('Wallet', 3), x: 8, y: -4, max: 4, baseCost: 30000, growth: 1.8, requires: ['orderSlots'], effects: [add('orderPay', 0.5)] },
  { id: 'orderFocus', branch: 'seiryu', name: '注文優先', desc: '注文のあるシリーズがさらにクラフトされやすくなる', icon: icons.bufPhy, x: 9, y: -4, max: 3, baseCost: 25000, growth: 1.8, requires: ['orderPay'], effects: [add('orderFocus', 2)] },
  { id: 'fanService', branch: 'seiryu', name: 'ファンサービス', desc: '顔なじみ・常連・大ファンの支払いボーナス +50%', icon: icons.hp, x: 6, y: -5, max: 4, baseCost: 20000, growth: 1.9, requires: ['orders'], effects: [mul('affinityPower', 0.5)] },
];
