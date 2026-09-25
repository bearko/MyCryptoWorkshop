import { series } from './catalog';
import type { SaveData } from './save';
import { skillById, type SkillNode } from './skills';
export { BLESSINGS, BLESSING_NODES } from './blessings';
import { computeStats } from './stats';
import { setHomeLand } from './titles';

/**
 * ランド移転 (prestige). After clearing, the workshop can move to one of the nine lands:
 * the run starts over, but the land's cryptid adds a permanent blessing, and the run's
 * revenue (plus fame from donations) turns into Cp for the 移転 branch.
 *
 * Kept: collection, hero book and set rewards, achievements, emblems and the 名誉 branch,
 * blessings, the 移転 branch, titles (称号), regulars, totals, play time, settings.
 * Reset: GUM, day, every other skill, stock, materials, research, orders, requests.
 */
export interface RunRecord {
  run: number;
  land: string | null;
  days: number;
  /** Play time of the run, and when the golden extension was made (seconds into the run). */
  seconds: number;
  clearSeconds: number | null;
  revenue: number;
  cp: number;
}

export interface Prestige {
  /** Relocations so far (the current run is runs + 1). */
  runs: number;
  cp: number;
  /** Land the workshop moved to last (its view and cryptid). */
  home: string | null;
  /** Fame from the charity clerk this run (raises Cp). */
  fame: number;
  runStartSeconds: number;
  runStartRevenue: number;
  clearSeconds: number | null;
  /** Best single day across all runs. */
  bestDay: number;
  history: RunRecord[];
}

export const newPrestige = (): Prestige => ({ runs: 0, cp: 0, home: null, fame: 0, runStartSeconds: 0, runStartRevenue: 0, clearSeconds: null, bestDay: 0, history: [] });

/** GUM a new run starts with, by level of 移転資金. */
export const START_GUM = [0, 1e3, 1e5, 1e7, 1e9];

/** Revenue this run. */
export const runRevenue = (save: SaveData) => save.totals.revenue - save.prestige.runStartRevenue;

/** Cp multiplier from fame: 1 + √fame / 50 (fame 2,500 → ×2, 10,000 → ×3). */
export const fameBonus = (fame: number) => 1 + Math.sqrt(Math.max(0, fame)) / 50;

/** Cp for moving now: √(run revenue / 10億) × fame bonus × Cp skills. Only after clearing. */
export function cpForRun(save: SaveData): number {
  const stats = computeStats(save.levels);
  if (stats.cleared <= 0) return 0;
  const base = Math.sqrt(Math.max(0, runRevenue(save)) / 1e9);
  return Math.floor(base * fameBonus(save.prestige.fame) * stats.cpMult);
}

/** Skill levels that survive a move. */
function kept(id: string): boolean {
  const node = skillById.get(id);
  if (!node) return false;
  return node.hidden === true || node.branch === 'honor' || node.branch === 'prestige' || node.branch === 'title';
}

/** Moves the workshop to `land`: records the run, pays out Cp and starts over. */
export function relocate(save: SaveData, land: string): RunRecord {
  const p = save.prestige;
  const stats = computeStats(save.levels);
  const cp = cpForRun(save);
  const record: RunRecord = {
    run: p.runs + 1,
    land: p.home,
    days: save.day - 1,
    seconds: save.meta.playSeconds - p.runStartSeconds,
    clearSeconds: p.clearSeconds,
    revenue: runRevenue(save),
    cp,
  };
  p.history.push(record);
  p.runs++;
  p.cp += cp;
  p.home = land;
  p.fame = 0;
  p.runStartSeconds = save.meta.playSeconds;
  p.runStartRevenue = save.totals.revenue;
  p.clearSeconds = null;
  p.bestDay = Math.max(p.bestDay, save.bestDayRevenue);

  const levels: Record<string, number> = { root: 1 };
  for (const [id, lv] of Object.entries(save.levels)) if (kept(id)) levels[id] = lv;
  levels[`bless_${land}`] = (levels[`bless_${land}`] ?? 0) + 1;
  // Titles of this land can be earned in this run.
  setHomeLand(levels, land);
  // 引き継ぎのレシピ帳: the first recipes come along.
  const carry = 5 * stats.keepRecipes;
  if (carry > 0) {
    levels.recipeBook = 1;
    series.filter((s, i) => i > 0 && s.family !== 'beast').slice(0, carry).forEach((s) => (levels[`recipe_${s.key}`] = 1));
  }
  save.levels = levels;
  save.gum = START_GUM[Math.min(START_GUM.length - 1, stats.startGum)];
  save.day = 1;
  save.shelf = [];
  save.storage = [];
  save.showcase = [];
  save.bestDayRevenue = 0;
  save.resources.dust = 0;
  save.resources.research = 0;
  for (const g of Object.keys(save.resources.gems) as (keyof typeof save.resources.gems)[]) save.resources.gems[g] = 0;
  save.orders = [];
  save.dailies = [];
  save.infusion = {};
  save.forecast = { kind: 'sunny' };
  return record;
}

/** Called when a node is bought: remembers when the run was cleared. */
export function onBought(save: SaveData, node: SkillNode): void {
  if (node.id === 'goldenExtension' && save.prestige.clearSeconds === null) save.prestige.clearSeconds = save.meta.playSeconds - save.prestige.runStartSeconds;
}
