import { storePests } from '../catalog';
import { RARITY_PRICE } from '../items';
import { FLOOR_Y, HERO_PX, QUEUE_LANE_Y, SCENE_W, SHOP_LANE_Y, WALL_SLOTS } from '../layout';
import { GEM_IDS } from '../lines';
import type { Shop } from './index';
import type { Actor, Chest, Coin, Mess, StorePest } from './types';
import { t } from '../../i18n';

/** Store enemies start showing up from this day; treasure chests from CHEST_DAY. */
export const STORE_PEST_DAY = 6;
export const CHEST_DAY = 5;
const MAX_MESSES = 8;
const MAX_STORE_PESTS = 2;
const COIN_LIFE = 15;
const MESS_RANGE = 28;
const SCARE_RANGE = 110;
const CHEST_SPEED = 85;

/** Customer states in which they walk about the floor (and can step in mud or be scared). */
const ROAMING = new Set<Actor['state']>(['enter', 'toShelf', 'browse', 'waitShelf', 'toQueue']);

/**
 * Things that go wrong (or right) on the shop floor: mud on rainy days, coins dropped in the
 * fog, enemies that scare customers, and treasure chests drifting past on balloons.
 */
export class Hazards {
  messes: Mess[] = [];
  coins: Coin[] = [];
  pests: StorePest[] = [];
  chests: Chest[] = [];
  private pestTimer = 0;
  /** No more enemies in the shop today (MAI chased them off). */
  pestsSuppressed = false;
  private pestNext: number;
  private chestTimer = 0;
  private chestNext: number;
  private cryptidTimer = 0;
  /** Set for a frame when the cryptid strikes (for the lightning effect). */
  strike: { x: number; y: number } | null = null;

  constructor(private readonly shop: Shop) {
    const { rand, stats } = shop;
    this.pestNext = rand.range(20, 35) * stats.storePestInterval;
    this.chestNext = rand.range(15, 30) * stats.chestInterval;
  }

  /** A random spot on the customers' side of the floor (the lane, when display tables stand below it). */
  private floorSpot(): { x: number; y: number } {
    const { rand, stats } = this.shop;
    const tables = stats.shelfSlots > WALL_SLOTS;
    return { x: rand.range(300, 880), y: rand.range(SHOP_LANE_Y - 6, tables ? SHOP_LANE_Y + 16 : QUEUE_LANE_Y - 20) };
  }

  update(dt: number): void {
    const shop = this.shop;
    const { stats, rand } = shop;
    this.strike = null;
    for (const m of this.messes) m.t += dt;
    for (const c of this.coins) c.t += dt;
    this.coins = this.coins.filter((c) => c.t < COIN_LIFE);

    // Enemies wandering the shop
    if (shop.save.day >= STORE_PEST_DAY && !this.pestsSuppressed && shop.party.calm <= 0) {
      this.pestTimer += dt;
      if (this.pestTimer >= this.pestNext && this.pests.length < MAX_STORE_PESTS) {
        this.pestTimer = 0;
        this.pestNext = rand.range(25, 45) * stats.storePestInterval;
        const e = rand.pick(storePests);
        const at = this.floorSpot();
        const to = this.floorSpot();
        this.pests.push({ id: shop.newId(), name: e.name, image: e.image, x: at.x, y: at.y, tx: to.x, ty: to.y, hp: 2, hitFlash: 0, t: 0 });
        shop.fx.push({ kind: 'smoke', x: at.x, y: at.y - 30, t: 0 });
        shop.emit({ type: 'storePest', name: e.name });
      }
    }
    for (const p of this.pests) {
      p.t += dt;
      p.hitFlash = Math.max(0, p.hitFlash - dt * 4);
      const d = Math.hypot(p.tx - p.x, p.ty - p.y);
      if (d < 4) {
        const to = this.floorSpot();
        p.tx = to.x;
        p.ty = to.y;
      } else {
        p.x += ((p.tx - p.x) / d) * 45 * dt;
        p.y += ((p.ty - p.y) / d) * 45 * dt;
      }
    }
    if (this.pests.length) this.scareCustomers(dt);

    // The shop's cryptid strikes enemies with lightning.
    if (stats.cryptid > 0 && this.pests.length) {
      this.cryptidTimer += dt;
      if (this.cryptidTimer >= stats.cryptidInterval) {
        this.cryptidTimer = 0;
        this.defeat(this.pests[0], 'cryptid');
      }
    }

    // Treasure chests on balloons
    if (shop.save.day >= CHEST_DAY) {
      this.chestTimer += dt;
      if (this.chestTimer >= this.chestNext) {
        this.chestTimer = 0;
        this.chestNext = rand.range(35, 60) * stats.chestInterval;
        this.chests.push({ id: shop.newId(), x: SCENE_W + 50, y: rand.range(FLOOR_Y - 40, FLOOR_Y + 60), vx: -CHEST_SPEED, t: 0 });
      }
    }
    for (const c of this.chests) {
      c.t += dt;
      c.x += c.vx * dt;
    }
    this.chests = this.chests.filter((c) => c.x > -60);
  }

  private scareCustomers(dt: number): void {
    const shop = this.shop;
    for (const a of shop.actors) {
      if (a.kind !== 'customer' || !ROAMING.has(a.state)) continue;
      const near = this.pests.some((p) => Math.hypot(p.x - a.x, p.y - a.y) < SCARE_RANGE);
      if (near && shop.rand.next() < 0.1 * dt) shop.customers.lose(a, 'scared');
    }
  }

  /** Mud: a customer walking through it may storm off. Called for each customer every frame. */
  stepCheck(a: Actor, dt: number): void {
    a.mudCooldown = Math.max(0, a.mudCooldown - dt);
    if (a.mudCooldown > 0 || !ROAMING.has(a.state) || this.messes.length === 0) return;
    if (!this.messes.some((m) => Math.hypot(m.x - a.x, m.y - a.y) < MESS_RANGE)) return;
    a.mudCooldown = 4;
    a.hitFlash = 1;
    if (this.shop.rand.next() < 0.25) this.shop.customers.lose(a, 'mess');
  }

  /** Rainy days: customers track mud in. */
  onCustomerEnter(): void {
    const shop = this.shop;
    if (shop.condition.kind !== 'rain' || this.messes.length >= MAX_MESSES) return;
    if (shop.rand.next() < shop.stats.mudChance) this.addMess('mud', this.floorSpot());
  }

  /** Foggy days: paying customers sometimes drop a coin. */
  onPaid(a: Actor, price: number): void {
    const shop = this.shop;
    if (shop.condition.kind !== 'fog' || shop.rand.next() >= shop.stats.coinChance) return;
    const value = Math.max(1, Math.round(price * shop.stats.coinValue));
    this.coins.push({ id: shop.newId(), x: a.x + shop.rand.range(-20, 20), y: a.y + shop.rand.range(0, 12), value, t: 0 });
  }

  addMess(kind: Mess['kind'], at: { x: number; y: number }): void {
    if (this.messes.length >= MAX_MESSES) return;
    this.messes.push({ id: this.shop.newId(), x: at.x, y: at.y, kind, t: 0 });
    this.shop.emit({ type: 'mess', kind });
  }

  clean(m: Mess, byStaff: boolean): void {
    if (!this.messes.includes(m)) return;
    this.messes = this.messes.filter((x) => x !== m);
    this.shop.fx.push({ kind: 'hit', x: m.x, y: m.y - 6, t: 0 });
    this.shop.emit({ type: 'cleaned', byStaff });
  }

  pickUp(c: Coin): void {
    if (!this.coins.includes(c)) return;
    this.coins = this.coins.filter((x) => x !== c);
    this.shop.addExtra('coin', c.value, c.x, c.y - 30);
  }

  /** Every mess and coin at once (a cryptid's visit). */
  /** Clears the whole floor (the cryptid's visit); returns what it cleared. */
  sweep(): { messes: number; coins: number; pests: number } {
    const done = { messes: this.messes.length, coins: this.coins.length, pests: this.pests.length };
    for (const m of [...this.messes]) this.clean(m, true);
    for (const c of [...this.coins]) this.pickUp(c);
    for (const p of [...this.pests]) this.defeat(p, 'cryptid');
    return done;
  }

  private pestReward(): number {
    const { stats } = this.shop;
    return Math.round((5 + 0.4 * RARITY_PRICE[stats.maxRarity] * stats.priceMult) * stats.storePestBounty);
  }

  defeat(p: StorePest, by: 'tap' | 'cryptid'): void {
    const shop = this.shop;
    if (!this.pests.includes(p)) return;
    this.pests = this.pests.filter((x) => x !== p);
    const reward = this.pestReward();
    shop.addGum(reward, p.x, p.y - 90);
    shop.fx.push({ kind: 'hit', x: p.x, y: p.y - 30, t: 0 });
    if (by === 'cryptid') this.strike = { x: p.x, y: p.y };
    shop.report.pests++;
    shop.save.totals.pests++;
    shop.emit({ type: 'storePestCleared', reward, by });
  }

  private openChest(c: Chest): void {
    const shop = this.shop;
    const { stats, rand } = shop;
    this.chests = this.chests.filter((x) => x !== c);
    shop.report.chests++;
    shop.save.totals.chests++;
    shop.fx.push({ kind: 'hit', x: c.x, y: c.y, t: 0 });
    const roll = rand.next();
    if (roll < 0.7) {
      const amount = Math.round(RARITY_PRICE[stats.maxRarity] * stats.priceMult * 4 * stats.chestMult);
      shop.addExtra('chest', amount, c.x, c.y - 40);
      shop.emit({ type: 'chest', reward: 'gum', amount });
    } else if (roll < 0.9) {
      const amount = Math.round((5 + 4 * stats.maxRarity) * stats.chestMult);
      shop.save.resources.dust += amount;
      shop.report.dust += amount;
      shop.popups.push({ text: t(`+${amount} ダスト`, `+${amount} dust`), x: c.x, y: c.y - 40, t: 0, color: '#ffd98a' });
      shop.emit({ type: 'chest', reward: 'dust', amount });
    } else {
      const gem = rand.pick(GEM_IDS);
      shop.save.resources.gems[gem] += 2;
      shop.report.gems[gem] = (shop.report.gems[gem] ?? 0) + 2;
      shop.popups.push({ text: t('+2 魔石', '+2 stones'), x: c.x, y: c.y - 40, t: 0, color: '#c9a8ff' });
      shop.emit({ type: 'chest', reward: 'gem', amount: 2 });
    }
    // The empty chest and packing litter end up on the floor.
    this.addMess('litter', { x: Math.min(900, Math.max(300, c.x)), y: this.floorSpot().y });
  }

  /** What is under a tap, if anything the hazards own. Hit areas are generous for touch. */
  at(x: number, y: number): { kind: 'chest'; ref: Chest } | { kind: 'pest'; ref: StorePest } | { kind: 'coin'; ref: Coin } | { kind: 'mess'; ref: Mess } | null {
    for (const c of this.chests) if (Math.abs(x - c.x) < 44 && y > c.y - 90 && y < c.y + 30) return { kind: 'chest', ref: c };
    for (const p of this.pests) if (Math.abs(x - p.x) < 44 && y < p.y + 20 && y > p.y - HERO_PX - 20) return { kind: 'pest', ref: p };
    for (const c of this.coins) if (Math.hypot(x - c.x, y - c.y) < 30) return { kind: 'coin', ref: c };
    for (const m of this.messes) if (Math.hypot(x - m.x, y - m.y) < 36) return { kind: 'mess', ref: m };
    return null;
  }

  click(x: number, y: number): boolean {
    const hit = this.at(x, y);
    if (!hit) return false;
    if (hit.kind === 'chest') this.openChest(hit.ref);
    else if (hit.kind === 'coin') this.pickUp(hit.ref);
    else if (hit.kind === 'mess') this.clean(hit.ref, false);
    else {
      hit.ref.hp--;
      hit.ref.hitFlash = 1;
      if (hit.ref.hp <= 0) this.defeat(hit.ref, 'tap');
      else this.shop.fx.push({ kind: 'hit', x: hit.ref.x, y: hit.ref.y - 30, t: 0 });
    }
    return true;
  }
}
