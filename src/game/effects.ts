/**
 * Skill effects are data: each skill node lists how its level changes the shop's stats.
 * `computeStats` folds every owned node's effects into one Stats object.
 *
 * A numeric stat is evaluated as
 *   value = max(base, …max effects) + Σ add effects,   then × every multiplier group.
 */

import type { LineId } from './lines';
import type { StaffRole } from './staff';

/** Shop-wide numeric stats. See BASE_STATS in stats.ts for defaults. */
export type GlobalStat =
  | 'dayLength'
  | 'maxRarity'
  | 'luck'
  | 'storageCap'
  | 'shelfSlots'
  | 'spawnRate'
  | 'groupChance'
  | 'patience'
  | 'queuePatience'
  | 'walkSpeed'
  | 'maxTier'
  | 'priceMult'
  | 'collectionBonus'
  | 'cashierTime'
  | 'registers'
  | 'registerClick'
  | 'tipChance'
  | 'bountyMult'
  | 'thiefSpeed'
  | 'stealTime'
  | 'guardChance'
  | 'pestInterval'
  | 'pestBountyMult'
  // Phase 2
  | 'editionTier'
  | 'editionLuck'
  | 'shinChance'
  | 'dismantleRarity'
  | 'dustMult'
  | 'gemChance'
  | 'infusion'
  | 'infusionPower'
  | 'packer'
  // Phase 3: staff, facilities, sales automation, research
  | `staff_${StaffRole}`
  | 'restockTime'
  | 'browseTime'
  | 'upsell'
  | 'closingBonus'
  | 'guardSpeed'
  | 'hunterSpeed'
  | 'researchRate'
  | 'market'
  | 'marketInterval'
  | 'marketRate'
  | 'peddlerTrip'
  | 'peddlerLoad'
  | 'peddlerRate'
  | 'autoRegisters'
  | 'batchChance'
  | 'rug'
  | 'potionStand'
  | 'barChance'
  | 'barPrice'
  | 'trialChance'
  | 'trialFee'
  | 'showcaseSlots'
  | 'showcaseMult'
  // Phase 4: day conditions, hazards, visitors, decisions
  | `fav_${FactionKey}`
  | 'cleanerSpeed'
  | 'mudChance'
  | 'coinChance'
  | 'coinValue'
  | 'storePestInterval'
  | 'storePestBounty'
  | 'cryptid'
  | 'cryptidInterval'
  | 'chestInterval'
  | 'chestMult'
  | 'vehicle'
  | 'vehicleSize'
  | 'vehicleInterval'
  | 'collectorChance'
  | 'collectorPay'
  | 'collectorFocus'
  | 'collectorFetch'
  | 'partySlots'
  | 'ownerChance'
  | 'ownerPay'
  | 'merchantRate'
  | 'reformChance'
  | 'regularPay'
  | 'blessingPower'
  | 'legendChance'
  | 'fogThieves'
  | 'festivalCrowd'
  // Phase 5
  | 'affinityPower'
  | 'orderSlots'
  | 'orderPay'
  | 'orderFocus'
  | 'cleared'
  // Phase 6
  | 'cpMult'
  | 'startGum'
  | 'keepRecipes'
  | 'autoBuyer'
  | 'raidReward'
  | 'charity'
  | 'charityLoad'
  | 'fameMult'
  | 'raidChance';

/** The five factions, as heroes' home factions and as stat keys. */
export type FactionKey = 'suzaku' | 'seiryu' | 'kouryu' | 'byakko' | 'genbu';

/** Per-production-line stats; the full key is `${line}.${stat}`, e.g. "forge.craftTime". */
export type LineStat =
  | 'unlocked'
  | 'craftTime'
  | 'craftClick'
  | 'doubleChance'
  | 'luck'
  | 'helperInterval'
  | 'overclock'
  | 'heatRate'
  | 'coolRate'
  | 'editionLuck';

export type NumStat = GlobalStat | `${LineId}.${LineStat}`;

export type Effect =
  /** Adds `base + per × level` (only while the node is owned). */
  | { op: 'add'; stat: NumStat; per: number; base?: number }
  /**
   * Multiplies by (1 + Σ per × level). Effects sharing a `group` add up inside one factor;
   * without a group each node is its own factor.
   */
  | { op: 'mul'; stat: NumStat; per: number; group?: string }
  /** Multiplies by `factor ^ level` (e.g. 0.92 = −8% per level, compounding). */
  | { op: 'pow'; stat: NumStat; factor: number }
  /** Raises the stat to at least `value` (unlock tiers such as the highest rarity). */
  | { op: 'max'; stat: NumStat; value: number }
  /** Shows a workshop facility layer once the node reaches `minLevel` (default 1). */
  | { op: 'overlay'; key: string; minLevel?: number }
  /** Unlocks an extension series for crafting. */
  | { op: 'series'; index: number }
  /** Multiplies one series' sale price by (1 + per × level). */
  | { op: 'seriesMul'; index: number; per: number }
  /** Adds `per × level` to how often a line picks this series when crafting (base 1). */
  | { op: 'seriesWeight'; index: number; per: number }
  /** Multiplies this series' edition chance by (1 + per × level). */
  | { op: 'seriesEdition'; index: number; per: number }
  /** Adds `per × level` to this series' chance of a 真 Legendary. */
  | { op: 'seriesShin'; index: number; per: number };

// Small constructors keep the skill table readable.
export const add = (stat: NumStat, per: number, base = 0): Effect => ({ op: 'add', stat, per, base });
export const mul = (stat: NumStat, per: number, group?: string): Effect => ({ op: 'mul', stat, per, group });
export const pow = (stat: NumStat, factor: number): Effect => ({ op: 'pow', stat, factor });
export const atLeast = (stat: NumStat, value: number): Effect => ({ op: 'max', stat, value });
export const overlay = (key: string, minLevel = 1): Effect => ({ op: 'overlay', key, minLevel });
export const unlockSeries = (index: number): Effect => ({ op: 'series', index });
export const seriesPrice = (index: number, per: number): Effect => ({ op: 'seriesMul', index, per });
export const seriesWeight = (index: number, per: number): Effect => ({ op: 'seriesWeight', index, per });
export const seriesEdition = (index: number, per: number): Effect => ({ op: 'seriesEdition', index, per });
export const seriesShin = (index: number, per: number): Effect => ({ op: 'seriesShin', index, per });
