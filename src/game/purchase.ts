import { addTo, balanceOf } from './currency';
import { onBought } from './prestige';
import type { SaveData } from './save';
import { costOf, isAvailable, level, TREE_NODES, type SkillNode } from './skills';
import { computeStats } from './stats';

/** How much of the node's currency the player has. */
export function balanceFor(save: SaveData, node: SkillNode): number {
  return balanceOf(save, node.currency ?? 'gum');
}

/** Price of the node's next level, or null if it cannot be bought now (locked or maxed). */
export function nextCost(save: SaveData, node: SkillNode): number | null {
  const lv = level(save.levels, node.id);
  if (!isAvailable(node, save.levels) || lv >= node.max) return null;
  return costOf(node, lv);
}

export function canBuy(save: SaveData, node: SkillNode): boolean {
  const cost = nextCost(save, node);
  return cost !== null && balanceFor(save, node) >= cost;
}

/** Buys one level if affordable. Returns true on success. */
export function buy(save: SaveData, node: SkillNode): boolean {
  const cost = nextCost(save, node);
  if (cost === null || balanceFor(save, node) < cost) return false;
  addTo(save, node.currency ?? 'gum', -cost);
  save.levels[node.id] = level(save.levels, node.id) + 1;
  onBought(save, node);
  return true;
}

/** Nodes the 番頭 never buys on its own: the clear is the player's moment. */
const MANUAL_ONLY = new Set(['goldenExtension']);

/**
 * 番頭 (auto-buyer): buys GUM nodes, cheapest first, until nothing is affordable.
 * Returns the nodes bought (one entry per level).
 */
export function autoBuy(save: SaveData, limit = 300): SkillNode[] {
  if (!save.settings.autoBuy || computeStats(save.levels).autoBuyer <= 0) return [];
  const bought: SkillNode[] = [];
  for (let i = 0; i < limit; i++) {
    let best: SkillNode | null = null;
    let bestCost = Infinity;
    for (const node of TREE_NODES) {
      if ((node.currency ?? 'gum') !== 'gum' || MANUAL_ONLY.has(node.id)) continue;
      const cost = nextCost(save, node);
      if (cost !== null && cost < bestCost && cost <= save.gum) {
        best = node;
        bestCost = cost;
      }
    }
    if (!best || !buy(save, best)) break;
    bought.push(best);
  }
  return bought;
}
