import type { NumStat } from './effects';
import { itemExt, itemValue, type ItemCode } from './items';
export { RARITY_PRICE } from './items';
import { series } from './catalog';
import { level, SKILLS, type Levels } from './skills';

/** Payment multiplier per customer tier (Common → Legendary heroes). */
export const TIER_PAY = [1, 1.25, 1.5, 1.8, 2.2];

/** Stat values with no skills owned. Skills change them through their `effects`. */
export const BASE_STATS: Record<NumStat, number> = {
  dayLength: 40,
  craftTime: 2.6,
  craftClick: 0.12,
  doubleChance: 0,
  maxRarity: 0,
  luck: 1,
  mineInterval: 0,
  storageCap: 0,
  shelfSlots: 3,
  spawnRate: 1,
  groupChance: 0,
  patience: 6,
  queuePatience: 14,
  walkSpeed: 115,
  maxTier: 0,
  priceMult: 1,
  collectionBonus: 0.006,
  cashierTime: 1.8,
  registers: 1,
  registerClick: 0.35,
  tipChance: 0,
  bountyMult: 1,
  thiefSpeed: 1,
  stealTime: 1.4,
  guardChance: 0,
  pestInterval: 1,
  pestBountyMult: 1,
};

/** Seconds between customers at spawnRate 1. */
const BASE_SPAWN_INTERVAL = 2.7;

export interface Stats extends Record<NumStat, number> {
  /** Seconds between customers (derived from spawnRate). */
  spawnInterval: number;
  /** Indexes of craftable series. */
  seriesUnlocked: number[];
  /** Workshop facility layers to show. */
  overlays: string[];
  /** Price multiplier per series index (reputation skills). */
  seriesPrice: number[];
}

export function computeStats(levels: Levels): Stats {
  const floor: Partial<Record<NumStat, number>> = {};
  const adds: Partial<Record<NumStat, number>> = {};
  // Multiplier groups per stat: group key → Σ(per × level) for 'mul', or a running product for 'pow'.
  const mulGroups = new Map<NumStat, Map<string, number>>();
  const pows: Partial<Record<NumStat, number>> = {};
  const seriesUnlocked = [0];
  const overlays = ['magic_pot'];

  for (const node of SKILLS) {
    const lv = level(levels, node.id);
    if (lv <= 0) continue;
    for (const e of node.effects) {
      switch (e.op) {
        case 'add':
          adds[e.stat] = (adds[e.stat] ?? 0) + (e.base ?? 0) + e.per * lv;
          break;
        case 'mul': {
          const groups = mulGroups.get(e.stat) ?? new Map<string, number>();
          const key = e.group ?? node.id;
          groups.set(key, (groups.get(key) ?? 0) + e.per * lv);
          mulGroups.set(e.stat, groups);
          break;
        }
        case 'pow':
          pows[e.stat] = (pows[e.stat] ?? 1) * Math.pow(e.factor, lv);
          break;
        case 'max':
          floor[e.stat] = Math.max(floor[e.stat] ?? -Infinity, e.value);
          break;
        case 'overlay':
          if (lv >= (e.minLevel ?? 1) && !overlays.includes(e.key)) overlays.push(e.key);
          break;
        case 'series':
          if (!seriesUnlocked.includes(e.index)) seriesUnlocked.push(e.index);
          break;
      }
    }
  }

  const values = {} as Record<NumStat, number>;
  for (const stat of Object.keys(BASE_STATS) as NumStat[]) {
    let v = Math.max(BASE_STATS[stat], floor[stat] ?? -Infinity) + (adds[stat] ?? 0);
    for (const sum of mulGroups.get(stat)?.values() ?? []) v *= 1 + sum;
    v *= pows[stat] ?? 1;
    values[stat] = v;
  }
  seriesUnlocked.sort((a, b) => a - b);

  return {
    ...values,
    spawnInterval: BASE_SPAWN_INTERVAL / values.spawnRate,
    seriesUnlocked,
    overlays,
    seriesPrice: series.map(() => 1),
  };
}

/** Relative craft weights for each rarity up to the highest unlocked one. */
export function rarityWeights(maxRarity: number, luck: number): number[] {
  const weights: number[] = [];
  for (let r = 0; r <= maxRarity; r++) {
    const d = maxRarity - r;
    // The newest rarity is scarce, the one below it is the staple, older ones fade out.
    let w = d === 0 ? (maxRarity === 0 ? 1 : 0.35) : Math.pow(0.45, d - 1);
    if (d === 0 && maxRarity > 0) w *= luck;
    weights.push(w);
  }
  return weights;
}

/** Relative spawn weights for each customer tier up to the highest unlocked one. */
export function tierWeights(maxTier: number): number[] {
  return Array.from({ length: maxTier + 1 }, (_, t) => Math.pow(0.6, maxTier - t));
}

/** What a customer of `tier` pays for an item. */
export function salePrice(code: ItemCode, stats: Stats, uniqueCount: number, tier: number, tip: boolean): number {
  const series = stats.seriesPrice[itemExt(code).seriesIndex] ?? 1;
  const base = itemValue(code) * series * stats.priceMult * (1 + stats.collectionBonus * uniqueCount);
  return Math.max(1, Math.round(base * TIER_PAY[tier] * (tip ? 1.5 : 1)));
}
