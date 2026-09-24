import type { Hero } from '../catalog';
import { DOOR, walkScale } from '../layout';
import type { Shop } from './index';
import type { Actor } from './types';

/** Creates a hero standing in the doorway. Shared by customers and thieves. */
export function makeActor(shop: Shop, kind: Actor['kind'], hero: Hero, tier: number, offset = 0): Actor {
  return {
    id: shop.newId(),
    kind,
    hero,
    tier,
    x: DOOR.x + offset * 0.3,
    y: DOOR.y,
    tx: DOOR.x,
    ty: DOOR.y,
    speed: shop.stats.walkSpeed * walkScale() * (kind === 'thief' ? 1.15 : shop.rand.range(0.9, 1.1)),
    state: 'enter',
    timer: 0,
    slot: -1,
    item: null,
    mood: 'none',
    facing: -1,
    bob: shop.rand.next() * 10,
    path: [],
    priceBonus: 1,
    mudCooldown: 0,
    hp: 1,
    hitFlash: 0,
    rope: false,
    gone: false,
  };
}

/** Frees the shelf slot an actor was heading for. */
export function releaseClaim(shop: Shop, a: Actor): void {
  const slots = shop.stock.slots;
  if (a.slot >= 0 && slots[a.slot]?.claimedBy === a.id) slots[a.slot].claimedBy = null;
  a.slot = -1;
}
