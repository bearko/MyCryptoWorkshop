// Phase 5: every series in one grid, top-left of the tree. Each series is a row of up to five
// nodes — レシピ (unlock), 評判 (price), 量産 (how often it is crafted), 名品 (edition chance)
// and 真打ち (真 chance, paid in research points, series with a 真 only). Rows run in bands of 30:
// the first band goes up from the レシピ帳 hub, the next comes back down, and so on.
import { icons, series } from './catalog';
import { mul, pow, seriesEdition, seriesPrice, seriesShin, seriesWeight, unlockSeries, type Effect } from './effects';
import { LINE_IDS } from './lines';
import type { SkillNode } from './skills';

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
      id: recipeId(i), branch: 'series', name: `レシピ：${s.name}`,
      desc: beast ? `具現化カプセルで${s.name}シリーズ（幻獣）を作れるようになる` : `${s.name}シリーズをクラフトできるようになる。品揃えが増えて来客ペースが上がる`,
      icon: s.items[0].image, x, y, max: 1, baseCost: cost, growth: 1,
      requires: [previousRecipe(i)], requiresAll: beast ? ['capsuleLine'] : undefined,
      effects: [unlockSeries(i), mul('spawnRate', variety, 'variety')],
    });
  }
  const opens = [rowKey(i)];
  nodes.push(
    {
      id: `rep_${s.key}`, branch: 'series', name: `評判：${s.name}`, desc: `${s.name}シリーズの販売価格 +10%`,
      icon, x: x - 1, y, max: 5, baseCost: Math.max(800, Math.round(cost * 0.6)), growth: 1.7,
      requires: opens, requiresAll: ['reputation'], effects: [seriesPrice(i, 0.1)],
    },
    {
      id: `mass_${s.key}`, branch: 'series', name: `量産：${s.name}`, desc: `${s.name}シリーズがクラフトされやすくなる（+100%）`,
      icon: s.items[0].image, x: x - 2, y, max: 5, baseCost: Math.max(500, Math.round(cost * 0.3)), growth: 1.6,
      requires: opens, requiresAll: ['planning'], effects: [seriesWeight(i, 1)],
    },
    {
      id: `master_${s.key}`, branch: 'series', name: `名品：${s.name}`, desc: `${s.name}シリーズのエディションの出やすさ +20%`,
      icon: s.items[3].image, x: x - 3, y, max: 5, baseCost: Math.max(1000, Math.round(cost * 0.4)), growth: 1.7,
      requires: opens, requiresAll: ['masterwork'], effects: [seriesEdition(i, 0.2)],
    },
  );
  if (s.shin) {
    nodes.push({
      id: `shin_${s.key}`, branch: 'series', name: `真打ち：${s.name}`, desc: `${s.name}シリーズの Legendary が「真」になる確率 +5%`,
      icon: s.shin.image, x: x - 4, y, max: 3, baseCost: 5 + Math.round(i / 10), growth: 1.5,
      requires: opens, requiresAll: ['shinForge'], effects: [seriesShin(i, 0.05)], currency: 'research',
    });
  }
  return nodes;
}

export const PHASE5_SERIES_NODES: SkillNode[] = [
  // Hubs next to 陳列棚増設
  { id: 'recipeBook', branch: 'series', name: 'レシピ帳', desc: 'シリーズのレシピを集め始める。品揃えを意識して来客ペース +5%', icon: icons.gems.leviathan, x: -2, y: -1, max: 1, baseCost: 20, growth: 1, requires: ['shelf'], effects: [mul('spawnRate', 0.05)] },
  { id: 'planning', branch: 'series', name: '生産計画', desc: 'シリーズごとの「量産」を習得できるようになる。全ラインのクラフト時間 -3%', icon: icons.bufPhy, x: -3, y: -2, max: 1, baseCost: 5000, growth: 1, requires: ['recipeBook'], effects: LINE_IDS.map((l): Effect => pow(`${l}.craftTime`, 0.97)) },
  { id: 'masterwork', branch: 'series', name: '名品鑑定', desc: 'シリーズごとの「名品」を習得できるようになる。エディションの出やすさ +5%', icon: icons.gems.garuda, x: -2, y: -2, max: 1, baseCost: 20000, growth: 1, requires: ['recipeBook'], requiresAll: ['appraisal'], effects: [mul('editionLuck', 0.05)] },
  ...series.flatMap((_, i) => seriesNodes(i)),
];
