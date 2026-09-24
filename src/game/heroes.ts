import { attributeName, customers, RARITIES, RARITY_JA, type Hero } from './catalog';
import { t } from '../i18n';
import { add, mul, type Effect } from './effects';
import { FACTION_BY_NAME, FACTION_NAME } from './factions';
import type { SkillNode } from './skills';

/**
 * The hero collection: which customers have bought something, how often (affinity), and
 * rewards for completing a set — every hero of an attribute (三国志, 銃火器, …), a faction or
 * a rarity. Set rewards are hidden skill nodes granted automatically (grantSets).
 */

/** Visit counts at which a hero becomes 顔なじみ / 常連 / 大ファン, and how much more they pay. */
export const AFFINITY = [
  { visits: 5, name: t('顔なじみ', 'Familiar Face'), pay: 0.05 },
  { visits: 20, name: t('常連', 'Regular'), pay: 0.1 },
  { visits: 50, name: t('大ファン', 'Big Fan'), pay: 0.2 },
];

/** Affinity rank (0 = none) for a number of purchases. */
export function affinityRank(visits: number): number {
  let rank = 0;
  AFFINITY.forEach((a, i) => visits >= a.visits && (rank = i + 1));
  return rank;
}

export interface HeroSet {
  id: string;
  kind: 'attribute' | 'faction' | 'rarity';
  name: string;
  heroes: Hero[];
  reward: string;
  effects: Effect[];
}

/** Attribute sets need at least this many heroes to count. */
const MIN_SET = 3;

const byAttribute = new Map<string, Hero[]>();
for (const h of customers) for (const a of h.attributes ?? []) byAttribute.set(a, [...(byAttribute.get(a) ?? []), h]);

export const HERO_SETS: HeroSet[] = [
  ...[...byAttribute.entries()]
    .filter(([, list]) => list.length >= MIN_SET)
    .sort((a, b) => a[1].length - b[1].length)
    .map(([attr, list]): HeroSet => ({ id: `set_attr_${attr}`, kind: 'attribute', name: attributeName(attr), heroes: list, reward: t('販売価格 +1%', 'Sale price +1%'), effects: [mul('priceMult', 0.01, 'sets')] })),
  ...Object.entries(FACTION_NAME).map(([key, name]): HeroSet => ({
    id: `set_faction_${key}`,
    kind: 'faction',
    name,
    heroes: customers.filter((h) => h.faction && FACTION_BY_NAME[h.faction] === key),
    reward: t(`${name}のヒーローの支払い +15%`, `${name} heroes pay +15%`),
    effects: [add(`fav_${key as keyof typeof FACTION_NAME}`, 0.15)],
  })),
  ...RARITIES.map((r, i): HeroSet => ({
    id: `set_rarity_${r}`,
    kind: 'rarity',
    name: t(`${RARITY_JA[r]}ヒーロー`, `${RARITY_JA[r]} Heroes`),
    heroes: customers.filter((h) => h.rarityIndex === i),
    reward: t('販売価格 +3%', 'Sale price +3%'),
    effects: [mul('priceMult', 0.03, 'sets')],
  })),
];

/** Set rewards as hidden skill nodes (never shown in the tree, granted by grantSets). */
export const HERO_SET_NODES: SkillNode[] = HERO_SETS.map((set, i) => ({
  id: set.id,
  branch: 'root',
  name: t(`コンプリート：${set.name}`, `Complete: ${set.name}`),
  desc: set.reward,
  icon: set.heroes[0].image,
  x: 1000 + i,
  y: 1000,
  max: 1,
  baseCost: 0,
  growth: 1,
  requires: [],
  effects: set.effects,
  hidden: true,
}));

/** Marks newly completed sets as owned. Returns the sets completed now. */
export function grantSets(save: { heroes: Record<string, number>; levels: Record<string, number> }): HeroSet[] {
  const done: HeroSet[] = [];
  for (const set of HERO_SETS) {
    if (save.levels[set.id]) continue;
    if (set.heroes.every((h) => (save.heroes[h.id] ?? 0) > 0)) {
      save.levels[set.id] = 1;
      done.push(set);
    }
  }
  return done;
}
