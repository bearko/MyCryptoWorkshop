// Headless auto-player used by the balance tests and `npm run balance`.
import { newSave, type SaveData } from '../save';
import { Shop, type DayReport, type Rng } from '../shop';
import { costOf, isAvailable, level, SKILLS } from '../skills';
import { computeStats } from '../stats';

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
  /** Taps per second the player spends on the pot, register, thieves and pests. */
  clicksPerSec: number;
  /** Chance a tap aimed at a thief connects. */
  thiefAccuracy: number;
}

export const PLAYERS: PlayerModel[] = [
  { name: 'active', clicksPerSec: 3, thiefAccuracy: 0.8 },
  { name: 'casual', clicksPerSec: 1, thiefAccuracy: 0.5 },
  { name: 'idle', clicksPerSec: 0, thiefAccuracy: 0 },
];

/** Plays one business day with the given player model. */
export function playDay(save: SaveData, rng: Rng, player: PlayerModel = PLAYERS[0]): { report: DayReport; seconds: number } {
  const shop = new Shop(save, rng);
  const dt = 1 / 30;
  let clickBudget = 0;
  while (!shop.over) {
    shop.update(dt);
    clickBudget += player.clicksPerSec * dt;
    while (clickBudget >= 1) {
      clickBudget -= 1;
      const thief = shop.actors.find((a) => a.kind === 'thief' && (a.state === 'steal' || a.state === 'flee'));
      if (thief && rng() < player.thiefAccuracy) shop.clickThief(thief);
      else if (shop.pestList.length) shop.clickPest(shop.pestList[0]);
      else if (shop.queue.length >= 2) shop.clickRegister();
      else shop.clickPot();
    }
  }
  return { report: shop.report, seconds: shop.elapsed };
}

/** One-off unlock nodes a sensible player saves up for. */
const KEY_NODES = new Set(['uncommon', 'rare', 'epic', 'legendary', 'tier1', 'tier2', 'tier3', 'tier4', 'conveyor', 'mine', 'register']);

/** Simple shopper: buys key unlocks first, saves up when one is close, otherwise buys the cheapest node. */
export function spend(save: SaveData, lastRevenue: number): void {
  for (;;) {
    const options = SKILLS.filter((n) => isAvailable(n, save.levels) && level(save.levels, n.id) < n.max)
      .map((n) => ({ n, cost: costOf(n, level(save.levels, n.id)), key: KEY_NODES.has(n.id) || n.id.startsWith('recipe_') }))
      .sort((a, b) => a.cost - b.cost);
    const nextKey = options.find((o) => o.key);
    let pick = options.find((o) => o.key && o.cost <= save.gum);
    if (!pick) {
      const saving = nextKey && nextKey.cost <= save.gum + lastRevenue * 2;
      pick = options.find((o) => o.cost <= save.gum && (!saving || o.cost + nextKey!.cost <= save.gum + lastRevenue));
    }
    if (!pick) return;
    save.gum -= pick.cost;
    save.levels[pick.n.id] = level(save.levels, pick.n.id) + 1;
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
}

/** Runs `days` business days from a new save. */
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
      nodesMaxed: SKILLS.filter((n) => level(save.levels, n.id) >= n.max).length,
      maxRarity: stats.maxRarity,
      maxTier: stats.maxTier,
      collection: save.collection.length,
    });
  }
  return rows;
}

export function toCsv(rows: DayRow[]): string {
  if (!rows.length) return '';
  const keys = Object.keys(rows[0]) as (keyof DayRow)[];
  return [keys.join(','), ...rows.map((r) => keys.map((k) => r[k]).join(','))].join('\n') + '\n';
}
