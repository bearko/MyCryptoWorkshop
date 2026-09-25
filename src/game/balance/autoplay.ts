// Headless auto-player used by the balance tests and `npm run balance`.
import { newSave, type SaveData } from '../save';
import { Shop, type DayReport, type Decision, type Rng } from '../shop';
import { GEM_IDS, LINE_IDS } from '../lines';
import { buy, canBuy } from '../purchase';
import { GEM_COST } from '../shop/production';
import { costOf, isAvailable, level, SKILLS, TREE_NODES } from '../skills';
import { STAFF_ROLES } from '../staff';
import { computeStats } from '../stats';
import { cpForRun, relocate } from '../prestige';
import { suggestParty } from '../party';

/** Deterministic PRNG (mulberry32). */
export function seeded(seed: number): Rng {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface PlayerModel {
  name: string;
  /** Taps per second the player spends on the lines, register, thieves and pests. */
  clicksPerSec: number;
  /** Chance a tap aimed at a thief connects. */
  thiefAccuracy: number;
  /** Holds one production line to overclock it, releasing before it overheats. */
  overclocks: boolean;
  /** Infuses 魔石 into lines between days. */
  usesGems: boolean;
  /** Answers decision events with a simple policy (otherwise the fallback, as when idle). */
  decides: boolean;
}

export const PLAYERS: PlayerModel[] = [
  { name: 'active', clicksPerSec: 3, thiefAccuracy: 0.8, overclocks: true, usesGems: true, decides: true },
  { name: 'casual', clicksPerSec: 1, thiefAccuracy: 0.5, overclocks: false, usesGems: true, decides: true },
  { name: 'idle', clicksPerSec: 0, thiefAccuracy: 0, overclocks: false, usesGems: false, decides: false },
];

/** Picks today's 魔石 for each line: the gem the player has most of. */
function chooseGems(save: SaveData): void {
  const stats = computeStats(save.levels);
  save.infusion = {};
  if (stats.infusion <= 0) return;
  const pool = { ...save.resources.gems };
  for (const line of LINE_IDS) {
    if (stats[`${line}.unlocked`] <= 0) continue;
    const gem = GEM_IDS.reduce((best, g) => (pool[g] > pool[best] ? g : best), GEM_IDS[0]);
    if (pool[gem] < GEM_COST) continue;
    pool[gem] -= GEM_COST;
    save.infusion[line] = gem;
  }
}

/**
 * A simple policy for decision events: sell to the merchant only when storage is overflowing,
 * take MAI's sales boost, and forgive thieves until there are a few regulars.
 */
export function policy(shop: Shop, d: Decision): number {
  if (d.kind === 'merchant') return shop.stock.storage.length >= Math.max(4, shop.stats.storageCap) ? 0 : 1;
  if (d.kind === 'reform') return shop.save.regulars.length < 6 ? 1 : 0;
  return 0;
}

/** Plays one business day with the given player model. */
export function playDay(save: SaveData, rng: Rng, player: PlayerModel = PLAYERS[0]): { report: DayReport; seconds: number } {
  if (player.usesGems) chooseGems(save);
  // The party: the strongest heroes scouted so far.
  save.party = suggestParty(save.levels, computeStats(save.levels).partySlots);
  const shop = new Shop(save, rng);
  const dt = 1 / 30;
  let clickBudget = 0;
  let tapLine = 0;
  while (!shop.over) {
    const pending = shop.pendingDecision;
    if (pending) shop.decide(player.decides ? policy(shop, pending) : pending.fallback);
    if (player.overclocks) {
      // Keep the slowest-progressing line held while it is cool enough.
      const target = shop.lines.reduce((a, b) => (b.stats.craftTime > a.stats.craftTime ? b : a));
      for (const line of shop.lines) {
        const hold = line === target && line.jam <= 0 && (line.holding ? line.heat < 0.8 : line.heat < 0.5);
        shop.holdLine(line.id, hold);
      }
    }
    shop.update(dt);
    clickBudget += player.clicksPerSec * dt;
    while (clickBudget >= 1) {
      clickBudget -= 1;
      const thief = shop.actors.find((a) => a.kind === 'thief' && (a.state === 'steal' || a.state === 'flee'));
      if (thief && rng() < player.thiefAccuracy) shop.clickThief(thief);
      else if (shop.pestList.length) shop.clickPest(shop.pestList[0]);
      else if (shop.queue.length >= 2) shop.clickRegister();
      else shop.clickLine(shop.lines[tapLine++ % shop.lines.length].id);
    }
  }
  return { report: shop.report, seconds: shop.elapsed };
}

/** One-off unlock nodes a sensible player saves up for. */
const KEY_NODES = new Set(['uncommon', 'rare', 'epic', 'legendary', 'tier1', 'tier2', 'tier3', 'tier4', 'conveyor', 'mine', 'register', 'forge', 'capsuleLine', 'appraisal', 'dismantle', 'storeHub', 'hire_stocker', 'hire_host', 'hire_promoter', 'hire_guard', 'hire_researcher', 'market', 'decor', 'showcase', 'carriage', 'hire_cleaner', 'cryptid', 'goldenExtension', 'orders', 'hire_charity', 'tavern', 'heroHall', 'legendHall', 'partySlot']);

/** Simple shopper: buys key unlocks first, saves up when one is close, otherwise buys the cheapest node. */
export function spend(save: SaveData, lastRevenue: number): void {
  for (;;) {
    // Gold-dust and research nodes are bought whenever affordable (those have no other use).
    const materialNode = SKILLS.find((n) => n.currency && canBuy(save, n));
    if (materialNode) {
      buy(save, materialNode);
      continue;
    }
    const options = SKILLS.filter((n) => !n.currency && isAvailable(n, save.levels) && level(save.levels, n.id) < n.max)
      .map((n) => ({ n, cost: costOf(n, level(save.levels, n.id)), key: KEY_NODES.has(n.id) || n.id.startsWith('recipe_') || (n.id.startsWith('scout_') && level(save.levels, n.id) === 0) }))
      .sort((a, b) => a.cost - b.cost);
    const nextKey = options.find((o) => o.key);
    let pick = options.find((o) => o.key && o.cost <= save.gum);
    if (!pick) {
      const saving = nextKey && nextKey.cost <= save.gum + lastRevenue * 2;
      pick = options.find((o) => o.cost <= save.gum && (!saving || o.cost + nextKey!.cost <= save.gum + lastRevenue));
    }
    if (!pick) return;
    buy(save, pick.n);
  }
}

export interface DayRow {
  day: number;
  /** In-game seconds played up to the end of this day. */
  playSeconds: number;
  revenue: number;
  gumAfterSpending: number;
  sold: number;
  customers: number;
  lost: number;
  stolen: number;
  caught: number;
  pests: number;
  levelsOwned: number;
  nodesMaxed: number;
  maxRarity: number;
  maxTier: number;
  collection: number;
  /** Production lines running. */
  lines: number;
  /** Gold dust held after spending. */
  dust: number;
  /** Staff members hired. */
  staff: number;
  research: number;
  cleared: boolean;
  emblem: number;
  /** Skill nodes not yet maxed (ids), for the report. */
  unfinished: string[];
}

/** Runs `days` business days from a new save. */
export interface RunResult {
  run: number;
  land: string | null;
  /** Minutes of play from the start of the run to the clear (null if not cleared in time). */
  clearMinutes: number | null;
  days: number;
  cp: number;
}

/** Lands the simulated player moves to, in order. */
const MOVE_ORDER = ['Strawberry', 'Tangerine', 'Ocean', 'Grape', 'Lime', 'Sage', 'Blueberry', 'Ruby', 'Graphite'];

/**
 * Plays `runs` runs back to back: each ends at the clear (or after maxDays), then the shop
 * moves to the next land and spends its Cp. Returns how long each run took to clear.
 */
export function simulateRuns(runs: number, maxDays: number, seed: number, player: PlayerModel = PLAYERS[0]): RunResult[] {
  const save = newSave(0);
  const rng = seeded(seed);
  const results: RunResult[] = [];
  for (let run = 1; run <= runs; run++) {
    const start = save.meta.playSeconds;
    let clearMinutes: number | null = null;
    for (let d = 1; d <= maxDays && clearMinutes === null; d++) {
      const { report, seconds } = playDay(save, rng, player);
      save.meta.playSeconds += seconds;
      spend(save, report.revenue);
      if (computeStats(save.levels).cleared > 0) clearMinutes = Math.round((save.meta.playSeconds - start) / 6) / 10;
    }
    const land = save.prestige.home;
    const days = save.day - 1;
    const cp = cpForRun(save);
    results.push({ run, land, clearMinutes, days, cp });
    if (clearMinutes === null) break;
    relocate(save, MOVE_ORDER[(run - 1) % MOVE_ORDER.length]);
    spend(save, 0);
  }
  return results;
}

export function simulate(days: number, seed: number, player: PlayerModel = PLAYERS[0]): DayRow[] {
  const save = newSave(0);
  const rng = seeded(seed);
  const rows: DayRow[] = [];
  let playSeconds = 0;
  for (let d = 1; d <= days; d++) {
    const { report, seconds } = playDay(save, rng, player);
    playSeconds += seconds;
    spend(save, report.revenue);
    const stats = computeStats(save.levels);
    rows.push({
      day: report.day,
      playSeconds: Math.round(playSeconds),
      revenue: report.revenue,
      gumAfterSpending: save.gum,
      sold: report.sold,
      customers: report.customers,
      lost: report.lost,
      stolen: report.stolen,
      caught: report.caught,
      pests: report.pests,
      levelsOwned: Object.values(save.levels).reduce((a, b) => a + b, 0),
      nodesMaxed: TREE_NODES.filter((n) => level(save.levels, n.id) >= n.max).length,
      maxRarity: stats.maxRarity,
      maxTier: stats.maxTier,
      collection: save.collection.length,
      lines: LINE_IDS.filter((id) => stats[`${id}.unlocked`] > 0).length,
      dust: save.resources.dust,
      staff: STAFF_ROLES.filter((r) => stats[`staff_${r}`] > 0).length,
      research: save.resources.research,
      cleared: stats.cleared > 0,
      emblem: save.resources.emblem,
      unfinished: TREE_NODES.filter((n) => level(save.levels, n.id) < n.max).map((n) => n.id),
    });
  }
  return rows;
}

export function toCsv(rows: DayRow[]): string {
  if (!rows.length) return '';
  const keys = (Object.keys(rows[0]) as (keyof DayRow)[]).filter((k) => k !== 'unfinished');
  return [keys.join(','), ...rows.map((r) => keys.map((k) => r[k]).join(','))].join('\n') + '\n';
}
