import type { SaveData } from './save';
import { costOf, isAvailable, level, type SkillNode } from './skills';

/** How much of the node's currency the player has. */
export function balanceFor(save: SaveData, node: SkillNode): number {
  return node.currency === 'dust' ? save.resources.dust : save.gum;
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
  if (node.currency === 'dust') save.resources.dust -= cost;
  else save.gum -= cost;
  save.levels[node.id] = level(save.levels, node.id) + 1;
  return true;
}
