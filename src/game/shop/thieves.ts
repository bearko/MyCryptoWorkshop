import { thieves } from '../catalog';
import { itemValue, RARITY_PRICE } from '../items';
import { CEILING_Y, DOOR, HERO_PX, SHOP_LANE_Y, WINDOW } from '../layout';
import type { Hero } from '../catalog';
import { thiefStyle, type ThiefStyle } from '../thieves';
import { makeActor, releaseClaim } from './actors';
import type { Shop } from './index';
import { followPath, moveToward } from './movement';
import type { Actor, Slot } from './types';

/** Villain heroes that sneak in, steal the priciest item and escape by their own route. */
export class Thieves {
  private timer = 0;
  private next: number;
  /** No more thieves today (MAI chased them off). */
  suppressed = false;

  constructor(private readonly shop: Shop) {
    this.next = shop.rand.range(10, 16);
  }

  updateSpawns(dt: number): void {
    const shop = this.shop;
    if (shop.save.day < 2 || this.suppressed) return;
    this.timer += dt;
    if (this.timer >= this.next) {
      this.timer = 0;
      const scale = Math.max(0.45, 1 - 0.04 * (shop.save.day - 2));
      // Thieves love the fog.
      const fog = shop.condition.kind === 'fog' ? shop.stats.fogThieves : 1;
      this.next = (shop.rand.range(14, 22) * scale) / fog;
      if (shop.stock.hasItemOnShelf()) this.spawn();
    }
  }

  /** Sends a thief in (a random villain, or the given pirate of a raid). */
  spawn(who?: Hero, how?: ThiefStyle): Actor {
    const shop = this.shop;
    // In the fog, the ones who pass for customers come out.
    const disguised = thieves.filter((t) => thiefStyle(t.id).disguise);
    const hero = who ?? (shop.condition.kind === 'fog' && disguised.length && shop.rand.next() < 0.6 ? shop.rand.pick(disguised) : shop.rand.pick(thieves));
    const style = how ?? thiefStyle(hero.id);
    const a = makeActor(shop, 'thief', hero, 0);
    a.style = style;
    a.hp = style.hp;
    a.speed *= style.speed;
    shop.actors.push(a);
    this.chooseTarget(a);
    if (a.slot >= 0) {
      const target = this.shop.stock.slots[a.slot];
      if (style.entry === 'ceiling') {
        // Drops down on a rope right above the item.
        a.x = target.x;
        a.y = CEILING_Y;
        a.rope = true;
      } else if (style.entry === 'window') {
        a.x = WINDOW.x;
        a.y = WINDOW.y;
        a.path = [{ x: WINDOW.x + 20, y: SHOP_LANE_Y }];
      } else if (style.entry === 'smoke') {
        a.x = target.x + shop.rand.range(-50, 50);
        a.y = SHOP_LANE_Y;
        shop.fx.push({ kind: 'smoke', x: a.x, y: a.y - HERO_PX / 2, t: 0 });
      }
    }
    shop.emit({ type: 'thief', hero, style });
    return a;
  }

  private isClaimedByThief(s: Slot): boolean {
    return s.claimedBy !== null && this.shop.actors.some((a) => a.id === s.claimedBy && a.kind === 'thief');
  }

  private chooseTarget(a: Actor): void {
    const slots = this.shop.stock.slots;
    const options = slots.flatMap((s, i) => (s.item !== null && !this.isClaimedByThief(s) ? [i] : []));
    if (options.length === 0) {
      this.startFlee(a);
      return;
    }
    const value = (i: number) => itemValue(slots[i].item!);
    const slot = options.reduce((best, i) => (value(i) > value(best) ? i : best), options[0]);
    slots[slot].claimedBy = a.id;
    a.slot = slot;
    a.state = 'toShelf';
    const p = slots[slot];
    a.tx = p.x;
    a.ty = SHOP_LANE_Y;
  }

  /** Sends a thief toward its escape route. */
  private startFlee(a: Actor): void {
    const route = a.style?.exit ?? 'door';
    a.state = 'flee';
    a.timer = 0;
    a.slot = -1;
    if (route === 'ceiling') {
      a.path = [{ x: a.x, y: CEILING_Y }];
      a.rope = true;
    } else if (route === 'window') {
      a.path = [
        { x: WINDOW.x + 20, y: SHOP_LANE_Y },
        { x: WINDOW.x, y: WINDOW.y },
      ];
    } else if (route === 'smoke') {
      // Staggers toward the door, then vanishes in smoke after a short window.
      a.path = [{ x: DOOR.x - 60, y: SHOP_LANE_Y }];
    } else {
      a.path = [
        { x: DOOR.x, y: SHOP_LANE_Y },
        { x: DOOR.x, y: DOOR.y },
      ];
    }
  }

  update(a: Actor, dt: number): void {
    const shop = this.shop;
    const { stats } = shop;
    const slots = shop.stock.slots;
    const style = a.style!;
    a.hitFlash = Math.max(0, a.hitFlash - dt * 4);
    switch (a.state) {
      case 'enter':
      case 'toShelf': {
        const slot = slots[a.slot];
        if (!slot || slot.item === null) {
          releaseClaim(shop, a);
          this.chooseTarget(a);
          break;
        }
        if (a.path.length) {
          followPath(a, dt, a.speed);
          break;
        }
        const p = slots[a.slot];
        a.tx = p.x;
        a.ty = SHOP_LANE_Y;
        if (moveToward(a, dt, a.rope ? a.speed * 0.8 : a.speed)) {
          a.rope = false;
          a.state = 'steal';
          a.timer = 0;
        }
        break;
      }
      case 'steal': {
        if (a.timer < stats.stealTime * style.steal) break;
        const slot = slots[a.slot];
        if (slot && slot.item !== null) {
          a.item = slot.item;
          slot.item = null;
          // Any customer that was heading for this item has to look again.
          for (const c of shop.actors) {
            if (c.kind === 'customer' && c.slot === a.slot) {
              c.slot = -1;
              if (c.state === 'browse') c.state = 'toShelf';
            }
          }
          slot.claimedBy = null;
        }
        this.startFlee(a);
        if (a.item !== null && shop.rand.next() < stats.guardChance) this.catch(a, true);
        break;
      }
      case 'flee': {
        const speed = 200 * style.speed * stats.thiefSpeed * (a.rope ? 0.6 : 1);
        const vanishAfter = 2.2 / stats.thiefSpeed;
        if (style.exit === 'smoke') {
          followPath(a, dt, 90 * stats.thiefSpeed);
          if (a.timer >= vanishAfter) {
            shop.fx.push({ kind: 'smoke', x: a.x, y: a.y - HERO_PX / 2, t: 0 });
            this.escape(a);
          }
        } else if (followPath(a, dt, speed)) {
          this.escape(a);
        }
        break;
      }
      case 'caught':
        if (a.timer > 0.8) {
          shop.fx.push({ kind: 'smoke', x: a.x, y: a.y - HERO_PX / 2, t: 0 });
          a.gone = true;
        }
        break;
      default:
        break;
    }
  }

  private escape(a: Actor): void {
    const shop = this.shop;
    if (a.item !== null) {
      shop.report.stolen++;
      shop.save.totals.stolen++;
      shop.emit({ type: 'stolen', hero: a.hero, item: a.item });
      a.item = null;
    }
    a.gone = true;
  }

  bounty(): number {
    const { stats } = this.shop;
    const topValue = RARITY_PRICE[stats.maxRarity] * stats.priceMult;
    return Math.round((5 + 0.6 * topValue) * stats.bountyMult);
  }

  /**
   * Catches a thief (by a tap, Maycri-kun, the guard or MAI); the stolen item goes back.
   * The bounty is not paid when the thief asks to reform (the choice pays it instead).
   */
  catch(a: Actor, byGuard: boolean, guard?: string, payBounty = true): void {
    const shop = this.shop;
    releaseClaim(shop, a);
    if (a.item !== null) shop.stock.returnItem(a.item);
    a.item = null;
    const bounty = this.bounty();
    if (payBounty) shop.addGum(bounty, a.x, a.y - HERO_PX - 30);
    shop.report.caught++;
    shop.save.totals.caught++;
    a.state = 'caught';
    a.mood = 'angry';
    a.rope = false;
    a.path = [];
    a.timer = 0;
    shop.emit({ type: 'caught', hero: a.hero, bounty: payBounty ? bounty : 0, byGuard, guard });
  }

  /** Returns the thief under the point, if any. Hit boxes are generous for touch. */
  at(x: number, y: number): Actor | null {
    for (const a of this.shop.actors) {
      if (a.kind !== 'thief' || a.state === 'caught' || a.gone) continue;
      if (Math.abs(x - a.x) < 52 && y < a.y + 26 && y > a.y - HERO_PX - 34) return a;
    }
    return null;
  }

  click(a: Actor): void {
    if (a.state === 'caught' || a.gone) return;
    a.hp--;
    a.hitFlash = 1;
    this.shop.fx.push({ kind: 'hit', x: a.x, y: a.y - HERO_PX / 2, t: 0 });
    if (a.hp > 0) this.shop.emit({ type: 'thiefHit', hero: a.hero, hpLeft: a.hp });
    else this.catch(a, false, undefined, !this.shop.decisions.offerReform(a, this.bounty()));
  }

  /** Catches every thief in the shop and keeps new ones away for the day. Returns how many. */
  clearAll(): number {
    const n = this.catchAll('MAI');
    this.suppressed = true;
    return n;
  }

  /** Catches every thief in the shop (MAI, or a hero of the party). Returns how many. */
  catchAll(by: string): number {
    let n = 0;
    for (const a of this.shop.actors) {
      if (a.kind !== 'thief' || a.state === 'caught' || a.gone) continue;
      this.catch(a, true, by);
      n++;
    }
    return n;
  }
}
