import { TREE_NODES, type SkillNode } from './skills';
import { computeStats } from './stats';

/** Node ids that always add something: staff, hero aces and series recipes. */
const FEATURE_PREFIXES = ['hire_', 'ace_', 'recipe_'];

/**
 * Named by hand: gates that open a new branch or kind of skill (their own effect is a small bonus),
 * and levelled nodes whose first level puts something new in the shop (a register, a showcase, a
 * bar, a new kind of visitor).
 */
const NAMED = new Set([
  ...['storeHub', 'decor', 'reputation', 'recipeBook', 'planning', 'masterwork', 'beastBook', 'honorHub', 'relocation'],
  ...['register', 'autoRegister', 'showcase', 'rug', 'potionBar', 'trial', 'collectors', 'owner', 'legend'],
]);

/** Stats with nothing learned, to tell which one-off nodes switch something on. */
const START = computeStats({}) as unknown as Record<string, number>;

/**
 * Whether learning the node adds something new to the game (a staff member, an item, a facility,
 * a kind of customer, a new branch…) instead of raising a number. These get the ornate frame.
 */
function adds(node: SkillNode): boolean {
  if (NAMED.has(node.id) || FEATURE_PREFIXES.some((p) => node.id.startsWith(p))) return true;
  // Emblem perks are ranks of the same bonus.
  if (node.branch === 'honor') return false;
  if (node.effects.some((e) => e.op === 'max' || e.op === 'series' || (e.op === 'add' && (e.base ?? 0) > 0))) return true;
  if (node.max !== 1) return false;
  // Something placed in the workshop (lantern, conveyor…).
  if (node.effects.some((e) => e.op === 'overlay')) return true;
  // One-off nodes: a gate to a new branch (no effect of its own) or a 0 → on switch.
  if (!node.effects.length) return true;
  return node.effects.some((e) => e.op === 'add' && START[e.stat] === 0);
}

export const FEATURE_NODES = new Set(TREE_NODES.filter(adds).map((n) => n.id));

export const isFeature = (id: string) => FEATURE_NODES.has(id);
