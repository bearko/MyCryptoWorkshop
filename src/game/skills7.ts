// The hero branch (英雄): 英雄の酒場 and its halls, party slots, and a スカウト node per hero.
// Laid out bottom-left of the tree: the halls stand in a column at x -6 (rows 6, 8, 10), each
// with its tier's scouts in a row going left, cheapest first.
import { series, seriesIcon } from './catalog';
import { add, mul } from './effects';
import { PARTY_ROSTER, partyHero, scoutId, supportEffects, TIER_HALL, taughtSeries, type PartyHeroDef, type PartyTier } from './party';
import type { SkillNode } from './skills';
import { recipeCost } from './skills5';
import { t } from '../i18n';

const HALL_X = -6;
const ROW_Y: Record<PartyTier, number> = { 1: 6, 2: 8, 3: 10 };
/** Price growth of each hero level, by tier. */
const LEVEL_GROWTH: Record<PartyTier, number> = { 1: 3, 2: 4, 3: 4.5 };
/** Scouting costs about as much as buying the recipes the hero teaches. */
const SCOUT_COST_FACTOR = 1;

/** GUM for scouting a hero (Lv 1). */
export function scoutCost(d: PartyHeroDef): number {
  const sum = taughtSeries(d).reduce((a, i) => a + recipeCost[i], 0) * SCOUT_COST_FACTOR;
  const mag = Math.pow(10, Math.floor(Math.log10(sum)) - 1);
  return Math.round(sum / mag) * mag;
}

function scoutNode(d: PartyHeroDef, x: number): SkillNode {
  const hero = partyHero(d.id);
  return {
    id: scoutId(d.id),
    branch: 'party',
    name: t(`スカウト：${hero.name}`, `Scout: ${hero.name}`),
    // Short: the tree's detail card shows the skill, the support effect and the recipes (a button).
    desc: t(`${hero.name}を仲間にする。ゆかりのシリーズのレシピを教えてくれる`, `${hero.name} joins you and teaches the recipes of their series`),
    icon: hero.image,
    x,
    y: ROW_Y[d.tier],
    max: 5,
    baseCost: scoutCost(d),
    growth: LEVEL_GROWTH[d.tier],
    requires: [TIER_HALL[d.tier]],
    effects: supportEffects(d),
  };
}

const scoutRow = (tier: PartyTier): SkillNode[] =>
  PARTY_ROSTER.filter((d) => d.tier === tier)
    .sort((a, b) => scoutCost(a) - scoutCost(b))
    .map((d, i) => scoutNode(d, HALL_X - 1 - i));

export const PARTY_NODES: SkillNode[] = [
  {
    id: 'tavern', branch: 'party', name: t('英雄の酒場', 'Heroes\' Tavern'),
    desc: t('ヒーローをスカウトしてパーティを組めるようになる（1人）。ここから先のシリーズのレシピは、ヒーローが教えてくれる', 'Lets you scout heroes and form a party (1 hero). From here on, heroes teach you the recipes of new series'),
    icon: seriesIcon('Sake', 2), x: HALL_X, y: ROW_Y[1], max: 1, baseCost: 200000, growth: 1, requires: ['storeHub'], requiresAll: ['recipe_Steering Wheel'], effects: [add('partySlots', 1)],
  },
  {
    id: 'partySlot', branch: 'party', name: t('パーティ枠', 'Party Slot'), desc: t('パーティに入れられるヒーロー +1人（最大5人）', 'One more hero in the party (up to 5)'),
    icon: seriesIcon('Oriflamme', 1), x: HALL_X, y: ROW_Y[1] - 1, max: 4, baseCost: 1500000, growth: 8, requires: ['tavern'], effects: [add('partySlots', 1)],
  },
  {
    id: 'heroHall', branch: 'party', name: t('英雄の広間', 'Hall of Heroes'), desc: t('名だたる英雄をスカウトできるようになる。販売価格 +5%', 'Lets you scout renowned heroes. Sale price +5%'),
    icon: seriesIcon('Mantle', 3), x: HALL_X, y: ROW_Y[2], max: 1, baseCost: 5000000, growth: 1, requires: ['tavern'], requiresAll: ['epic'], effects: [mul('priceMult', 0.05)],
  },
  {
    id: 'legendHall', branch: 'party', name: t('伝説の間', 'Hall of Legends'), desc: t('伝説の英雄をスカウトできるようになる。販売価格 +10%', 'Lets you scout legendary heroes. Sale price +10%'),
    icon: seriesIcon('Crown', 4), x: HALL_X, y: ROW_Y[3], max: 1, baseCost: 500000000, growth: 1, requires: ['heroHall'], requiresAll: ['legendary'], effects: [mul('priceMult', 0.1)],
  },
  ...scoutRow(1),
  ...scoutRow(2),
  ...scoutRow(3),
];

/** Recipes of scouted heroes: learns the ones not learned yet. Returns their node ids. */
export function grantTaught(levels: Record<string, number>): string[] {
  const out: string[] = [];
  for (const d of PARTY_ROSTER) {
    if ((levels[scoutId(d.id)] ?? 0) <= 0) continue;
    for (const i of taughtSeries(d)) {
      const id = `recipe_${series[i].key}`;
      if ((levels[id] ?? 0) > 0) continue;
      levels[id] = 1;
      out.push(id);
    }
  }
  return out;
}
