import type { LineStat, NumStat } from './effects';
import { LINE_IDS, type LineId } from './lines';
import { itemExt, itemValue, type ItemCode } from './items';
export { RARITY_PRICE } from './items';
import { series } from './catalog';
import { STAFF_ROLES, type StaffRole } from './staff';
import { FACTION_KEYS } from './factions';
import type { FactionKey } from './effects';
import { level, SKILLS, type Levels } from './skills';

/** Payment multiplier per customer tier (Common → Legendary heroes). */
export const TIER_PAY = [1, 1.25, 1.5, 1.8, 2.2];

/** Per-line defaults. */
const LINE_BASE: Record<LineId, Record<LineStat, number>> = {
  pot: { unlocked: 1, craftTime: 4.2, craftClick: 0.22, doubleChance: 0, luck: 1, helperInterval: 0, overclock: 3, heatRate: 0.35, coolRate: 0.45, editionLuck: 1 },
  forge: { unlocked: 0, craftTime: 5.0, craftClick: 0.22, doubleChance: 0, luck: 1, helperInterval: 0, overclock: 3, heatRate: 0.35, coolRate: 0.45, editionLuck: 1.5 },
  capsule: { unlocked: 0, craftTime: 6.5, craftClick: 0.2, doubleChance: 0, luck: 1, helperInterval: 0, overclock: 3, heatRate: 0.4, coolRate: 0.45, editionLuck: 1 },
};

/** Stat values with no skills owned. Skills change them through their `effects`. */
export const BASE_STATS = {
  dayLength: 40,
  maxRarity: 0,
  luck: 1,
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
  editionTier: 0,
  editionLuck: 1,
  shinChance: 0,
  /** Highest rarity the dismantler breaks down (-1 = no dismantler). */
  dismantleRarity: -1,
  dustMult: 1,
  gemChance: 0.3,
  /** 1 once 魔石 can be infused into lines. */
  infusion: 0,
  infusionPower: 1,
  /** 1 once the packer restocks the most valuable items first. */
  packer: 0,
  // Phase 3
  /** Seconds between restocks from storage to the shelf. */
  restockTime: 0.8,
  /** Seconds a customer looks at an item before taking it. */
  browseTime: 0.45,
  /** Extra chance that a customer goes for the priciest item. */
  upsell: 0,
  /** Share of the day's revenue added at closing. */
  closingBonus: 0,
  guardSpeed: 190,
  hunterSpeed: 220,
  /** Research points per minute of business. */
  researchRate: 0,
  market: 0,
  marketInterval: 9,
  /** Share of the shop price the market pays. */
  marketRate: 0.4,
  /** Seconds the peddler is out of the shop. */
  peddlerTrip: 16,
  peddlerLoad: 1,
  peddlerRate: 0.8,
  /** Self-checkout machines (slower than Chris-kun, no taps). */
  autoRegisters: 0,
  /** Chance that a checkout also serves the next customer in line. */
  batchChance: 0,
  rug: 0,
  potionStand: 0,
  barChance: 0,
  /** A drink costs this share of what the customer just paid. */
  barPrice: 0.2,
  trialChance: 0,
  trialFee: 0.25,
  showcaseSlots: 0,
  showcaseMult: 1.5,
  ...(Object.fromEntries(STAFF_ROLES.map((r) => [`staff_${r}`, 0])) as Record<`staff_${StaffRole}`, number>),
  // Phase 4
  /** Extra pay from customers of each faction (0.1 = +10%). */
  ...(Object.fromEntries(FACTION_KEYS.map((f) => [`fav_${f}`, 0])) as Record<`fav_${FactionKey}`, number>),
  cleanerSpeed: 200,
  /** Chance a customer walks in mud on a rainy day. */
  mudChance: 0.35,
  /** Chance a paying customer drops a coin on a foggy day. */
  coinChance: 0.3,
  /** A dropped coin is worth this share of the purchase. */
  coinValue: 0.15,
  /** Multiplier on the time between enemies wandering into the shop. */
  storePestInterval: 1,
  storePestBounty: 1,
  /** 1 once a cryptid guards the shop. */
  cryptid: 0,
  /** Seconds between the cryptid's lightning strikes. */
  cryptidInterval: 10,
  /** Multiplier on the time between treasure chests. */
  chestInterval: 1,
  chestMult: 1,
  /** Best vehicle unlocked: 0 none, 1 carriage, 2 airship, 3 land gate. */
  vehicle: 0,
  vehicleSize: 0,
  /** Multiplier on the time between vehicles. */
  vehicleInterval: 1,
  collectorChance: 0,
  collectorPay: 2,
  /** Chance per customer of a land owner (land days always bring one). */
  ownerChance: 0,
  ownerPay: 3,
  /** Share of the stock's value the shady merchant offers. */
  merchantRate: 0.32,
  /** Chance a thief caught by a tap asks to reform. */
  reformChance: 0.3,
  regularPay: 1.5,
  blessingPower: 1,
  /** Chance per day of a legendary hero's visit (sales ×2 for a while). */
  legendChance: 0,
  /** Thieves come this much more often in fog. */
  fogThieves: 1.6,
  /** Customers come this much more often on a festival day. */
  festivalCrowd: 1.4,
  ...(Object.fromEntries(
    LINE_IDS.flatMap((line) => Object.entries(LINE_BASE[line]).map(([k, v]) => [`${line}.${k}`, v])),
  ) as Record<`${LineId}.${LineStat}`, number>),
} satisfies Record<NumStat, number>;

export type LineStats = Record<LineStat, number>;

/** The stats of one production line. */
export function lineStats(stats: Stats, line: LineId): LineStats {
  return Object.fromEntries(Object.keys(LINE_BASE[line]).map((k) => [k, stats[`${line}.${k as LineStat}`]])) as LineStats;
}

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
  const seriesMult = series.map(() => 1);
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
        case 'seriesMul':
          seriesMult[e.index] *= 1 + e.per * lv;
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
    seriesPrice: seriesMult,
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
