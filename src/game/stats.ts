import { series } from './catalog';
import { level, type Levels } from './skills';

/** Base sale price per rarity (Common → Legendary). */
export const RARITY_PRICE = [5, 15, 50, 170, 600];
/** Payment multiplier per customer tier (Common → Legendary heroes). */
export const TIER_PAY = [1, 1.25, 1.5, 1.8, 2.2];

export interface Stats {
  dayLength: number;
  craftTime: number;
  /** Fraction of a craft completed per pot click. */
  craftClick: number;
  doubleChance: number;
  /** Highest craftable rarity index. */
  maxRarity: number;
  luck: number;
  /** Seconds between Mine-chan's automatic pot clicks (0 = not hired). */
  mineInterval: number;
  storageCap: number;
  shelfSlots: number;
  seriesUnlocked: number[];
  spawnInterval: number;
  groupChance: number;
  patience: number;
  queuePatience: number;
  walkSpeed: number;
  maxTier: number;
  priceMult: number;
  collectionBonus: number;
  cashierTime: number;
  registers: number;
  /** Seconds of checkout removed per register click. */
  registerClick: number;
  tipChance: number;
  bountyMult: number;
  thiefSpeed: number;
  stealTime: number;
  guardChance: number;
  pestInterval: number;
  pestBountyMult: number;
  overlays: string[];
}

export function computeStats(levels: Levels): Stats {
  const lv = (id: string) => level(levels, id);

  const seriesUnlocked = [0, ...series.slice(1).flatMap((s, i) => (lv(`recipe_${s.key}`) > 0 ? [i + 1] : []))];
  const variety = 1 + 0.06 * (seriesUnlocked.length - 1);
  const spawnRate = variety * (1 + 0.15 * lv('ad')) * (lv('lantern') ? 1.2 : 1) * (1 + 0.06 * lv('wordOfMouth'));

  const maxRarity = lv('legendary') ? 4 : lv('epic') ? 3 : lv('rare') ? 2 : lv('uncommon') ? 1 : 0;
  const maxTier = lv('tier4') ? 4 : lv('tier3') ? 3 : lv('tier2') ? 2 : lv('tier1') ? 1 : 0;

  const overlays: string[] = ['magic_pot'];
  if (lv('forge')) overlays.push('ambient_overlay_200');
  if (lv('conveyor')) overlays.push('conveyor');
  if (lv('rare')) overlays.push('capsule');
  if (lv('lantern')) overlays.push('ambient_overlay_500');
  if (lv('luck') >= 1) overlays.push('ambient_overlay_401');
  if (lv('luck') >= 3) overlays.push('ambient_overlay_402');
  if (lv('luck') >= 5) overlays.push('ambient_overlay_325');

  return {
    dayLength: 40 + 8 * lv('dayLength'),
    craftTime: 2.6 * Math.pow(0.92, lv('craftSpeed')) * (lv('forge') ? 0.85 : 1) * Math.pow(0.94, lv('craftSpeed2')),
    craftClick: 0.12 * (1 + 0.4 * lv('craftClick')),
    doubleChance: 0.05 * lv('double'),
    maxRarity,
    luck: 1 + 0.25 * lv('luck'),
    mineInterval: lv('mine') ? 2.4 - 0.35 * (lv('mine') - 1) : 0,
    storageCap: lv('conveyor') ? 4 + 3 * lv('storage') : 0,
    shelfSlots: 3 + lv('shelf'),
    seriesUnlocked,
    spawnInterval: 2.7 / spawnRate,
    groupChance: 0.08 * lv('group'),
    patience: 6 + 1.5 * lv('patience'),
    queuePatience: 14 + 1.5 * lv('patience'),
    walkSpeed: 150 * (1 + 0.12 * lv('walk')),
    maxTier,
    priceMult: (1 + 0.15 * lv('price')) * (1 + 0.15 * lv('brand')),
    collectionBonus: 0.006 + 0.003 * lv('collector'),
    cashierTime: 1.8 * Math.pow(0.9, lv('cashier')),
    registers: 1 + lv('register'),
    registerClick: 0.35 * (1 + 0.4 * lv('registerClick')),
    tipChance: 0.1 * lv('tip'),
    bountyMult: 1 + 0.5 * lv('bounty'),
    thiefSpeed: Math.pow(0.88, lv('trap')),
    stealTime: 1.4 + 0.5 * lv('bell'),
    guardChance: 0.15 * lv('guard'),
    pestInterval: 1 + 0.2 * lv('ward'),
    pestBountyMult: 1 + lv('exterminate'),
    overlays,
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

export function salePrice(rarityIndex: number, stats: Stats, uniqueCount: number, tier: number, tip: boolean): number {
  const base = RARITY_PRICE[rarityIndex] * stats.priceMult * (1 + stats.collectionBonus * uniqueCount);
  return Math.max(1, Math.round(base * TIER_PAY[tier] * (tip ? 1.5 : 1)));
}
