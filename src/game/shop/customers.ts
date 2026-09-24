import { customersByTier } from '../catalog';
import { itemValue } from '../items';
import { DOOR, queuePos, SHOP_LANE_Y, slotPos } from '../layout';
import { tierWeights } from '../stats';
import { makeActor, releaseClaim } from './actors';
import type { Shop } from './index';
import { followPath, moveToward } from './movement';
import type { Actor, Mood } from './types';

const MAX_ACTORS = 16;

/** Hero customers: arriving, picking an item, queueing, leaving. */
export class Customers {
  /** Customers waiting at (or walking to) the register, in order. */
  queue: Actor[] = [];
  private spawnTimer = 0;
  private nextSpawn = 1.2;

  constructor(private readonly shop: Shop) {}

  updateSpawns(dt: number): void {
    this.spawnTimer += dt;
    if (this.spawnTimer >= this.nextSpawn) {
      const { stats, rand } = this.shop;
      this.spawnTimer = 0;
      this.nextSpawn = stats.spawnInterval * rand.range(0.7, 1.3);
      this.spawn();
      if (rand.next() < stats.groupChance) this.spawn(40);
    }
  }

  private spawn(offset = 0): void {
    const shop = this.shop;
    if (shop.actors.length >= MAX_ACTORS) return;
    const tier = shop.rand.weighted(tierWeights(shop.stats.maxTier));
    const hero = shop.rand.pick(customersByTier[tier]);
    const a = makeActor(shop, 'customer', hero, tier, offset);
    shop.actors.push(a);
    shop.report.customers++;
    shop.save.totals.customers++;
    this.chooseShelfTarget(a);
  }

  /** Customers pick an unclaimed item; higher tiers are more likely to go for the priciest one. */
  private chooseShelfTarget(a: Actor): void {
    const { rand } = this.shop;
    const slots = this.shop.stock.slots;
    const options = slots.flatMap((s, i) => (s.item !== null && s.claimedBy === null ? [i] : []));
    if (options.length === 0) {
      a.state = 'waitShelf';
      a.slot = -1;
      a.timer = 0;
      a.mood = 'thinking';
      const spot = slotPos(Math.floor(rand.next() * slots.length));
      a.tx = spot.x + rand.range(-30, 30);
      a.ty = SHOP_LANE_Y;
      return;
    }
    let slot = rand.pick(options);
    const laneY = SHOP_LANE_Y + rand.range(-14, 14);
    if (rand.next() < a.tier * 0.2) {
      const value = (i: number) => itemValue(slots[i].item!);
      slot = options.reduce((best, i) => (value(i) > value(best) ? i : best), options[0]);
    }
    slots[slot].claimedBy = a.id;
    a.slot = slot;
    a.state = a.state === 'enter' || a.state === 'waitShelf' ? 'toShelf' : a.state;
    a.mood = 'none';
    const p = slotPos(slot);
    a.tx = p.x;
    a.ty = laneY;
  }

  leave(a: Actor, mood: Mood): void {
    const { rand } = this.shop;
    releaseClaim(this.shop, a);
    a.state = 'leave';
    a.mood = mood;
    a.path = [
      { x: DOOR.x + rand.range(-10, 10), y: SHOP_LANE_Y + rand.range(-10, 10) },
      { x: DOOR.x, y: DOOR.y },
    ];
    a.timer = 0;
  }

  private loseCustomer(a: Actor, reason: 'empty' | 'queue'): void {
    const shop = this.shop;
    shop.report.lost++;
    shop.save.totals.lost++;
    shop.emit({ type: 'lost', hero: a.hero, reason });
    this.leave(a, 'angry');
  }

  update(a: Actor, dt: number): void {
    const shop = this.shop;
    const slots = shop.stock.slots;
    switch (a.state) {
      case 'enter':
      case 'toShelf': {
        if (a.slot < 0) {
          this.chooseShelfTarget(a);
          break;
        }
        if (moveToward(a, dt)) {
          a.state = 'browse';
          a.timer = 0;
        }
        break;
      }
      case 'browse': {
        if (a.timer < 0.45) break;
        const slot = slots[a.slot];
        if (slot && slot.item !== null && slot.claimedBy === a.id) {
          a.item = slot.item;
          slot.item = null;
          slot.claimedBy = null;
          a.slot = -1;
          a.state = 'toQueue';
          a.timer = 0;
          this.queue.push(a);
        } else {
          releaseClaim(shop, a);
          a.state = 'waitShelf';
          a.timer = 0;
          a.mood = 'thinking';
        }
        break;
      }
      case 'waitShelf': {
        moveToward(a, dt, a.speed * 0.5);
        if (a.timer > shop.stats.patience) {
          this.loseCustomer(a, 'empty');
          break;
        }
        if (slots.some((s) => s.item !== null && s.claimedBy === null)) {
          const waited = a.timer;
          this.chooseShelfTarget(a);
          a.timer = waited;
        }
        break;
      }
      case 'toQueue':
      case 'queue': {
        const arrived = moveToward(a, dt);
        if (arrived && a.state === 'toQueue') {
          // Queue patience starts once the customer is actually in line (walks can be long).
          a.state = 'queue';
          a.timer = 0;
        }
        if (a.timer > shop.stats.queuePatience) {
          this.queue = this.queue.filter((q) => q !== a);
          if (a.item !== null) shop.stock.returnItem(a.item);
          a.item = null;
          this.loseCustomer(a, 'queue');
        }
        break;
      }
      case 'leave':
        if (followPath(a, dt, a.speed * 1.2)) a.gone = true;
        break;
      default:
        break;
    }
  }

  /** Keeps queue targets in sync with queue order. */
  alignQueue(): void {
    this.queue.forEach((a, i) => {
      const p = queuePos(i);
      a.tx = Math.min(p.x, 960);
      a.ty = p.y;
    });
  }
}
