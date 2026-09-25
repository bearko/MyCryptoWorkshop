import { customersByTier, thieves, type Hero } from '../catalog';
import { FACTION_BY_NAME } from '../factions';
import { AFFINITY, affinityRank } from '../heroes';
import { orderHero, orderMatches, type Order } from '../orders';
import { itemExt, itemValue } from '../items';
import { DOOR, HERO_PX, POTION_BAR, queuePos, SHOP_LANE_Y, TRIAL } from '../layout';
import { tierWeights } from '../stats';
import { makeActor, releaseClaim } from './actors';
import type { Shop } from './index';
import { followPath, moveToward } from './movement';
import type { Actor, Mood } from './types';

/** Cap on heroes in the shop (vehicles bring guilds on top of the usual flow). */
const MAX_ACTORS = 24;
/** Guild members pay a little more. */
const GUILD_PAY = 1.1;

/** Hero customers: arriving, picking an item, queueing, leaving. */
export class Customers {
  /** Customers waiting at (or walking to) the register, in order. */
  queue: Actor[] = [];
  private spawnTimer = 0;
  private nextSpawn = 1.2;
  private ownerCame = false;

  constructor(private readonly shop: Shop) {}

  updateSpawns(dt: number): void {
    this.spawnTimer += dt;
    if (this.spawnTimer >= this.nextSpawn) {
      const { stats, rand } = this.shop;
      this.spawnTimer = 0;
      this.nextSpawn = (stats.spawnInterval * rand.range(0.7, 1.3)) / this.shop.crowd;
      this.spawn();
      if (rand.next() < stats.groupChance) this.spawn(40);
    }
  }

  /** Picks who comes in: now and then a land owner, a reformed regular or a collector. */
  private pickVisitor(): { hero: Hero; tier: number; special?: Actor['special']; wants?: number } {
    const shop = this.shop;
    const { stats, rand, save } = shop;
    const landDay = shop.condition.kind === 'land' && !this.ownerCame && shop.elapsed > stats.dayLength * 0.2;
    if (landDay || rand.next() < stats.ownerChance) {
      this.ownerCame = true;
      return { hero: rand.pick(customersByTier[4]), tier: 4, special: 'owner' };
    }
    if (save.regulars.length && rand.next() < Math.min(0.3, 0.04 * save.regulars.length)) {
      const hero = thieves.find((t) => t.id === rand.pick(save.regulars));
      if (hero) return { hero, tier: Math.min(stats.maxTier, Math.max(0, hero.rarityIndex)), special: 'regular' };
    }
    const tier = rand.weighted(tierWeights(stats.maxTier));
    const hero = rand.pick(customersByTier[tier]);
    if (rand.next() < stats.collectorChance) return { hero, tier, special: 'collector', wants: rand.pick(stats.seriesUnlocked) };
    return { hero, tier };
  }

  private spawn(offset = 0, guild = false): boolean {
    const shop = this.shop;
    if (shop.actors.length >= MAX_ACTORS) return false;
    const v = guild ? { hero: shop.rand.pick(customersByTier[shop.rand.weighted(tierWeights(shop.stats.maxTier))]), special: 'guild' as const, wants: undefined, tier: 0 } : this.pickVisitor();
    if (guild) v.tier = customersByTier.findIndex((list) => list.includes(v.hero));
    const a = makeActor(shop, 'customer', v.hero, v.tier, offset);
    a.special = v.special;
    a.wants = v.wants;
    shop.actors.push(a);
    shop.report.customers++;
    shop.save.totals.customers++;
    shop.staff.cheer('host');
    shop.hazards.onCustomerEnter();
    if (a.special && a.special !== 'guild') shop.emit({ type: 'special', kind: a.special, hero: a.hero });
    this.chooseShelfTarget(a);
    return true;
  }

  /** The customer who placed `order` comes in for it. */
  spawnOrder(order: Order): void {
    const shop = this.shop;
    const hero = orderHero(order);
    const a = makeActor(shop, 'customer', hero, Math.max(0, hero.rarityIndex), 0);
    a.special = 'order';
    a.order = order;
    shop.actors.push(a);
    shop.report.customers++;
    shop.save.totals.customers++;
    shop.emit({ type: 'special', kind: 'order', hero });
    this.chooseShelfTarget(a);
  }

  /** A party hero comes in person (来店) and buys the priciest item at ×pay. */
  spawnVip(hero: Hero, pay: number): boolean {
    const shop = this.shop;
    if (shop.actors.length >= MAX_ACTORS) return false;
    const a = makeActor(shop, 'customer', hero, 4, 0);
    a.special = 'vip';
    a.vipPay = pay;
    shop.actors.push(a);
    shop.report.customers++;
    shop.save.totals.customers++;
    this.chooseShelfTarget(a);
    return true;
  }

  /** A guild member arriving by vehicle. Returns false if the shop is packed. */
  spawnGuest(): boolean {
    const ok = this.spawn(this.shop.rand.range(-30, 30), true);
    if (ok) this.shop.report.guests++;
    return ok;
  }

  /** Whether this customer would take the item (collectors and orders are picky). */
  private wants(a: Actor, item: number): boolean {
    if (a.special === 'order') return orderMatches(a.order!, itemExt(item));
    return a.special !== 'collector' || itemExt(item).seriesIndex === a.wants;
  }

  /** How much more than the price this customer pays for `code`. */
  payMult(a: Actor, code: number): number {
    const shop = this.shop;
    const { stats } = shop;
    let m = a.priceBonus * shop.visitors.salesMult * shop.party.salesMult;
    // Affinity: heroes who keep coming back pay a little more.
    const rank = affinityRank(shop.save.heroes[a.hero.id] ?? 0);
    if (rank > 0) m *= 1 + AFFINITY[rank - 1].pay * stats.affinityPower;
    const fav = a.hero.faction ? FACTION_BY_NAME[a.hero.faction] : undefined;
    if (fav) m *= 1 + stats[`fav_${fav}`];
    if (a.special === 'collector' && itemExt(code).seriesIndex === a.wants) m *= stats.collectorPay;
    else if (a.special === 'owner') m *= stats.ownerPay;
    else if (a.special === 'vip') m *= a.vipPay ?? 1;
    else if (a.special === 'regular') m *= stats.regularPay;
    else if (a.special === 'guild') m *= GUILD_PAY;
    else if (a.special === 'order' && orderMatches(a.order!, itemExt(code))) m *= stats.orderPay;
    return m;
  }

  /** Customers pick an unclaimed item; higher tiers are more likely to go for the priciest one. */
  private chooseShelfTarget(a: Actor): void {
    const { rand } = this.shop;
    const slots = this.shop.stock.slots;
    // Collectors only look at the series they collect.
    const wanted = (item: number) => this.wants(a, item);
    const options = slots.flatMap((s, i) => (s.item !== null && s.claimedBy === null && wanted(s.item) ? [i] : []));
    if (options.length === 0) {
      a.state = 'waitShelf';
      a.slot = -1;
      a.timer = 0;
      a.mood = 'thinking';
      const spot = slots[Math.floor(rand.next() * slots.length)];
      a.tx = spot.x + rand.range(-30, 30);
      a.ty = SHOP_LANE_Y;
      return;
    }
    let slot = rand.pick(options);
    const laneY = SHOP_LANE_Y + rand.range(-14, 14);
    // Richer customers (and the consultant's advice) go for the priciest item.
    if (a.special === 'owner' || a.special === 'vip' || rand.next() < a.tier * 0.2 + this.shop.stats.upsell) {
      const value = (i: number) => itemValue(slots[i].item!);
      slot = options.reduce((best, i) => (value(i) > value(best) ? i : best), options[0]);
    }
    slots[slot].claimedBy = a.id;
    a.slot = slot;
    a.state = a.state === 'enter' || a.state === 'waitShelf' ? 'toShelf' : a.state;
    a.mood = 'none';
    const p = slots[slot];
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

  /** The customer gives up and leaves angry. */
  lose(a: Actor, reason: 'empty' | 'queue' | 'mess' | 'scared'): void {
    if (a.state === 'leave') return;
    this.queue = this.queue.filter((q) => q !== a);
    if (a.item !== null) {
      this.shop.stock.returnItem(a.item);
      a.item = null;
    }
    const shop = this.shop;
    shop.report.lost++;
    shop.save.totals.lost++;
    shop.emit({ type: 'lost', hero: a.hero, reason });
    this.leave(a, 'angry');
  }

  update(a: Actor, dt: number): void {
    const shop = this.shop;
    const slots = shop.stock.slots;
    shop.hazards.stepCheck(a, dt);
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
        if (a.timer < shop.stats.browseTime) break;
        const slot = slots[a.slot];
        if (slot && slot.item !== null && slot.claimedBy === a.id) {
          a.item = slot.item;
          a.priceBonus = slot.showcase ? shop.stats.showcaseMult : 1;
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
        if (a.timer > (shop.stats.patience + shop.party.patienceBonus) * (a.special === 'order' || a.special === 'vip' ? 3 : 1)) {
          this.lose(a, 'empty');
          break;
        }
        if (slots.some((s) => s.item !== null && s.claimedBy === null && this.wants(a, s.item))) {
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
        if (a.timer > shop.stats.queuePatience + shop.party.patienceBonus) {
          this.lose(a, 'queue');
        }
        break;
      }
      case 'toBar':
      case 'toTrial':
        if (followPath(a, dt, a.speed)) {
          a.state = a.state === 'toBar' ? 'drink' : 'trial';
          a.timer = 0;
          a.facing = a.state === 'trial' ? 1 : -1;
        }
        break;
      case 'drink':
      case 'trial': {
        const bar = a.state === 'drink';
        if (a.timer < (bar ? 1.4 : 1.8)) break;
        const { stats } = shop;
        const amount = Math.max(1, Math.round((a.paid ?? 0) * (bar ? stats.barPrice : stats.trialFee)));
        shop.addExtra(bar ? 'bar' : 'trial', amount, a.x, a.y - HERO_PX - 30);
        this.leave(a, 'happy');
        break;
      }
      case 'leave':
        if (followPath(a, dt, a.speed * 1.2)) a.gone = true;
        break;
      default:
        break;
    }
  }

  /** After paying: maybe a drink at the potion bar or a go at the trial area, then home. */
  afterCheckout(a: Actor): void {
    const { stats, rand } = this.shop;
    if (rand.next() < stats.barChance) {
      a.state = 'toBar';
      a.path = [{ x: POTION_BAR.spot.x + rand.range(-30, 30), y: POTION_BAR.spot.y }];
    } else if (rand.next() < stats.trialChance) {
      a.state = 'toTrial';
      a.path = [{ x: TRIAL.spot.x, y: TRIAL.spot.y }];
    } else {
      this.leave(a, 'happy');
      return;
    }
    a.mood = 'happy';
    a.timer = 0;
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
