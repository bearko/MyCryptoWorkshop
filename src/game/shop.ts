import { customersByTier, getExtension, pests, series, thieves, type Hero } from './catalog';
import {
  CEILING_Y,
  COUNTER,
  CRAFT_RING,
  DOOR_X,
  HERO_PX,
  MAX_SLOTS,
  PEST_PX,
  PEST_SPOTS,
  POT,
  queuePos,
  SHOP_LANE_Y,
  slotPos,
  STORAGE_POS,
  WINDOW,
} from './layout';
import type { SaveData } from './save';
import { thiefStyle, type ThiefStyle } from './thieves';
import { computeStats, RARITY_PRICE, rarityWeights, salePrice, tierWeights, type Stats } from './stats';

export type Rng = () => number;

export interface Slot {
  item: number | null;
  /** An item is flying toward this slot. */
  incoming: boolean;
  /** Entity id of the customer or thief that is heading for this item. */
  claimedBy: number | null;
}

export type ActorState =
  | 'enter'
  | 'toShelf'
  | 'browse'
  | 'waitShelf'
  | 'toQueue'
  | 'queue'
  | 'leave'
  | 'steal'
  | 'flee'
  | 'caught';

export type Mood = 'none' | 'happy' | 'angry' | 'thinking';

export interface Actor {
  id: number;
  kind: 'customer' | 'thief';
  hero: Hero;
  tier: number;
  x: number;
  y: number;
  tx: number;
  ty: number;
  speed: number;
  state: ActorState;
  timer: number;
  slot: number;
  item: number | null;
  mood: Mood;
  facing: 1 | -1;
  bob: number;
  paid?: number;
  /** Waypoints to walk through before the current target (thieves only). */
  path: { x: number; y: number }[];
  style?: ThiefStyle;
  /** Taps left before a thief is caught. */
  hp: number;
  hitFlash: number;
  /** Hanging from a rope (ceiling route). */
  rope: boolean;
  /** Removed at the end of this frame. */
  gone: boolean;
}

export interface Flyer {
  item: number;
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  t: number;
  dur: number;
  dest: { kind: 'slot'; index: number } | { kind: 'storage' };
}

export interface Popup {
  text: string;
  x: number;
  y: number;
  t: number;
  color: string;
  icon?: 'gum';
}

export interface Pest {
  id: number;
  name: string;
  image: string;
  /** Feet position; pests hop from spot to spot around the workshop. */
  x: number;
  y: number;
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  hopT: number;
  hopDur: number;
  wait: number;
  life: number;
  t: number;
}

export interface Effect {
  kind: 'smoke' | 'hit';
  x: number;
  y: number;
  t: number;
}

export interface DayReport {
  day: number;
  revenue: number;
  sold: number;
  customers: number;
  lost: number;
  stolen: number;
  caught: number;
  pests: number;
  crafted: number;
  newEntries: number[];
  bestSale: { price: number; item: number; hero: string } | null;
}

export type ShopEvent =
  | { type: 'craft'; item: number; isNew: boolean }
  | { type: 'sale'; price: number; item: number; hero: Hero; tip: boolean }
  | { type: 'lost'; hero: Hero; reason: 'empty' | 'queue' }
  | { type: 'thief'; hero: Hero; style: ThiefStyle }
  | { type: 'thiefHit'; hero: Hero; hpLeft: number }
  | { type: 'stolen'; hero: Hero; item: number }
  | { type: 'caught'; hero: Hero; bounty: number; byGuard: boolean }
  | { type: 'pest'; name: string }
  | { type: 'pestCleared'; reward: number }
  | { type: 'mine' }
  | { type: 'dayEnd'; report: DayReport };

const MAX_ACTORS = 16;
const ITEM_FLIGHT = 0.75;

export class Shop {
  readonly stats: Stats;
  readonly slots: Slot[];
  storage: number[];
  actors: Actor[] = [];
  queue: Actor[] = [];
  flyers: Flyer[] = [];
  popups: Popup[] = [];
  pests: Pest[] = [];
  effects: Effect[] = [];
  /** Checkout progress in seconds per register. */
  registerProgress: number[];
  craftProgress = 0;
  craftBlocked = false;
  timeLeft: number;
  elapsed = 0;
  over = false;
  potPulse = 0;
  registerPulse = 0;
  minePulse = 0;
  report: DayReport;

  private nextId = 1;
  private spawnTimer = 0;
  private nextSpawn = 1.2;
  private thiefTimer = 0;
  private nextThief: number;
  private pestTimer = 0;
  private nextPest: number;
  private mineTimer = 0;
  private listeners: ((e: ShopEvent) => void)[] = [];

  constructor(
    readonly save: SaveData,
    private readonly rng: Rng = Math.random,
  ) {
    this.stats = computeStats(save.levels);
    this.slots = Array.from({ length: this.stats.shelfSlots }, (_, i) => ({
      item: save.shelf[i] ?? null,
      incoming: false,
      claimedBy: null,
    }));
    // Items that no longer fit on the shelf go to storage (or are kept if it overflows once).
    const overflow = save.shelf.slice(this.stats.shelfSlots).filter((x): x is number => x !== null);
    this.storage = [...save.storage, ...overflow];
    this.registerProgress = Array.from({ length: this.stats.registers }, () => 0);
    this.timeLeft = this.stats.dayLength;
    this.nextThief = this.rand(10, 16);
    this.nextPest = this.rand(12, 20) * this.stats.pestInterval;
    this.report = {
      day: save.day,
      revenue: 0,
      sold: 0,
      customers: 0,
      lost: 0,
      stolen: 0,
      caught: 0,
      pests: 0,
      crafted: 0,
      newEntries: [],
      bestSale: null,
    };
  }

  on(fn: (e: ShopEvent) => void): void {
    this.listeners.push(fn);
  }

  private emit(e: ShopEvent): void {
    for (const fn of this.listeners) fn(e);
  }

  private rand(a: number, b: number): number {
    return a + (b - a) * this.rng();
  }

  private pick<T>(list: T[]): T {
    return list[Math.floor(this.rng() * list.length) % list.length];
  }

  private pickWeighted(weights: number[]): number {
    const total = weights.reduce((a, b) => a + b, 0);
    let r = this.rng() * total;
    for (let i = 0; i < weights.length; i++) {
      r -= weights[i];
      if (r <= 0) return i;
    }
    return weights.length - 1;
  }

  // ---------------------------------------------------------------- update

  update(dt: number): void {
    if (this.over) return;
    this.elapsed += dt;
    this.timeLeft -= dt;
    this.potPulse = Math.max(0, this.potPulse - dt * 4);
    this.registerPulse = Math.max(0, this.registerPulse - dt * 4);
    this.minePulse = Math.max(0, this.minePulse - dt * 3);

    this.updateCraft(dt);
    this.updateFlyers(dt);
    this.updateRestock();
    this.updateSpawns(dt);
    this.updateActors(dt);
    this.updateRegisters(dt);
    this.updatePests(dt);

    for (const e of this.effects) e.t += dt;
    this.effects = this.effects.filter((e) => e.t < 0.7);
    for (const p of this.popups) p.t += dt;
    this.popups = this.popups.filter((p) => p.t < 1.4);

    if (this.timeLeft <= 0) this.closeDay();
  }

  private freeSlotIndex(): number {
    return this.slots.findIndex((s) => s.item === null && !s.incoming);
  }

  private incomingStorage(): number {
    return this.flyers.filter((f) => f.dest.kind === 'storage').length;
  }

  private capacity(): number {
    const freeSlots = this.slots.filter((s) => s.item === null && !s.incoming).length;
    const freeStorage = Math.max(0, this.stats.storageCap - this.storage.length - this.incomingStorage());
    return freeSlots + freeStorage;
  }

  private updateCraft(dt: number): void {
    if (this.stats.mineInterval > 0) {
      this.mineTimer += dt;
      if (this.mineTimer >= this.stats.mineInterval) {
        this.mineTimer -= this.stats.mineInterval;
        this.craftProgress += this.stats.craftClick;
        this.minePulse = 1;
        this.emit({ type: 'mine' });
      }
    }
    const rate = Math.max(0.3, 1 - 0.35 * this.pests.length);
    this.craftProgress += (dt / this.stats.craftTime) * rate;
    this.craftBlocked = false;
    while (this.craftProgress >= 1) {
      if (this.capacity() <= 0) {
        this.craftProgress = 1;
        this.craftBlocked = true;
        return;
      }
      this.craftProgress -= 1;
      const count = this.rng() < this.stats.doubleChance ? 2 : 1;
      for (let i = 0; i < count && this.capacity() > 0; i++) this.craftOne();
    }
  }

  private rollItem(): number {
    const rarity = this.pickWeighted(rarityWeights(this.stats.maxRarity, this.stats.luck));
    const seriesIndex = this.pick(this.stats.seriesUnlocked);
    return series[seriesIndex].items[rarity].id;
  }

  private craftOne(): void {
    const item = this.rollItem();
    const isNew = !this.save.collection.includes(item);
    if (isNew) {
      this.save.collection.push(item);
      this.report.newEntries.push(item);
    }
    this.report.crafted++;
    this.save.totals.crafted++;
    const slot = this.freeSlotIndex();
    const from = { x: POT.x, y: POT.mouthY };
    if (slot >= 0) {
      this.slots[slot].incoming = true;
      const to = slotPos(slot);
      this.flyers.push({ item, fromX: from.x, fromY: from.y, toX: to.x, toY: to.y, t: 0, dur: ITEM_FLIGHT, dest: { kind: 'slot', index: slot } });
    } else {
      this.flyers.push({ item, fromX: from.x, fromY: from.y, toX: STORAGE_POS.x, toY: STORAGE_POS.y, t: 0, dur: ITEM_FLIGHT, dest: { kind: 'storage' } });
    }
    this.emit({ type: 'craft', item, isNew });
  }

  private updateFlyers(dt: number): void {
    for (const f of this.flyers) f.t += dt;
    const landed = this.flyers.filter((f) => f.t >= f.dur);
    this.flyers = this.flyers.filter((f) => f.t < f.dur);
    for (const f of landed) {
      if (f.dest.kind === 'slot') {
        const slot = this.slots[f.dest.index];
        slot.incoming = false;
        slot.item = f.item;
      } else {
        this.storage.push(f.item);
      }
    }
  }

  private updateRestock(): void {
    while (this.storage.length > 0) {
      const slot = this.freeSlotIndex();
      if (slot < 0) return;
      const item = this.storage.shift()!;
      this.slots[slot].incoming = true;
      const to = slotPos(slot);
      this.flyers.push({ item, fromX: STORAGE_POS.x, fromY: STORAGE_POS.y, toX: to.x, toY: to.y, t: 0, dur: 0.6, dest: { kind: 'slot', index: slot } });
    }
  }

  /** Puts an item back on a free slot, else into storage. Returns false if there is no room. */
  private returnItem(item: number): boolean {
    const slot = this.freeSlotIndex();
    if (slot >= 0) {
      this.slots[slot].item = item;
      return true;
    }
    if (this.storage.length < Math.max(this.stats.storageCap, 0) || this.stats.storageCap === 0) {
      // Without a conveyor, returned items still wait in the back room so nothing is lost.
      this.storage.push(item);
      return true;
    }
    return false;
  }

  private updateSpawns(dt: number): void {
    if (this.timeLeft < 2) return;
    this.spawnTimer += dt;
    if (this.spawnTimer >= this.nextSpawn) {
      this.spawnTimer = 0;
      this.nextSpawn = this.stats.spawnInterval * this.rand(0.7, 1.3);
      this.spawnCustomer();
      if (this.rng() < this.stats.groupChance) this.spawnCustomer(40);
    }
    if (this.save.day >= 2) {
      this.thiefTimer += dt;
      if (this.thiefTimer >= this.nextThief) {
        this.thiefTimer = 0;
        const scale = Math.max(0.45, 1 - 0.04 * (this.save.day - 2));
        this.nextThief = this.rand(14, 22) * scale;
        if (this.slots.some((s) => s.item !== null)) this.spawnThief();
      }
    }
  }

  private makeActor(kind: Actor['kind'], hero: Hero, tier: number, offset = 0): Actor {
    return {
      id: this.nextId++,
      kind,
      hero,
      tier,
      x: DOOR_X + offset,
      y: SHOP_LANE_Y + this.rand(-6, 6),
      tx: DOOR_X,
      ty: SHOP_LANE_Y,
      speed: this.stats.walkSpeed * (kind === 'thief' ? 1.15 : this.rand(0.9, 1.1)),
      state: 'enter',
      timer: 0,
      slot: -1,
      item: null,
      mood: 'none',
      facing: -1,
      bob: this.rng() * 10,
      path: [],
      hp: 1,
      hitFlash: 0,
      rope: false,
      gone: false,
    };
  }

  private spawnCustomer(offset = 0): void {
    if (this.actors.length >= MAX_ACTORS) return;
    const tier = this.pickWeighted(tierWeights(this.stats.maxTier));
    const hero = this.pick(customersByTier[tier]);
    const a = this.makeActor('customer', hero, tier, offset);
    this.actors.push(a);
    this.report.customers++;
    this.save.totals.customers++;
    this.chooseShelfTarget(a);
  }

  private spawnThief(): void {
    const hero = this.pick(thieves);
    const style = thiefStyle(hero.id);
    const a = this.makeActor('thief', hero, 0);
    a.style = style;
    a.hp = style.hp;
    a.speed *= style.speed;
    this.actors.push(a);
    this.chooseThiefTarget(a);
    if (a.slot >= 0) {
      const target = slotPos(a.slot);
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
        a.x = target.x + this.rand(-50, 50);
        a.y = SHOP_LANE_Y;
        this.effects.push({ kind: 'smoke', x: a.x, y: a.y - HERO_PX / 2, t: 0 });
      }
    }
    this.emit({ type: 'thief', hero, style });
  }

  private itemValue(item: number): number {
    return RARITY_PRICE[getExtension(item).rarityIndex];
  }

  /** Customers pick an unclaimed item; higher tiers are more likely to go for the priciest one. */
  private chooseShelfTarget(a: Actor): void {
    const options = this.slots.flatMap((s, i) => (s.item !== null && s.claimedBy === null ? [i] : []));
    if (options.length === 0) {
      a.state = 'waitShelf';
      a.slot = -1;
      a.timer = 0;
      a.mood = 'thinking';
      const spot = slotPos(Math.floor(this.rng() * this.slots.length));
      a.tx = spot.x + this.rand(-30, 30);
      a.ty = SHOP_LANE_Y;
      return;
    }
    let slot = this.pick(options);
    const laneY = SHOP_LANE_Y + this.rand(-14, 14);
    if (this.rng() < a.tier * 0.2) {
      slot = options.reduce((best, i) => (this.itemValue(this.slots[i].item!) > this.itemValue(this.slots[best].item!) ? i : best), options[0]);
    }
    this.slots[slot].claimedBy = a.id;
    a.slot = slot;
    a.state = a.state === 'enter' || a.state === 'waitShelf' ? 'toShelf' : a.state;
    a.mood = 'none';
    const p = slotPos(slot);
    a.tx = p.x;
    a.ty = laneY;
  }

  private chooseThiefTarget(a: Actor): void {
    const options = this.slots.flatMap((s, i) => (s.item !== null && !this.isClaimedByThief(s) ? [i] : []));
    if (options.length === 0) {
      this.startFlee(a);
      return;
    }
    const slot = options.reduce((best, i) => (this.itemValue(this.slots[i].item!) > this.itemValue(this.slots[best].item!) ? i : best), options[0]);
    this.slots[slot].claimedBy = a.id;
    a.slot = slot;
    a.state = 'toShelf';
    const p = slotPos(slot);
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
      a.path = [{ x: DOOR_X - 60, y: SHOP_LANE_Y }];
    } else {
      a.path = [{ x: DOOR_X + 40, y: SHOP_LANE_Y + 30 }];
    }
  }

  /** Walks along the actor's waypoints. Returns true once the last one is reached. */
  private followPath(a: Actor, dt: number, speed: number): boolean {
    const next = a.path[0];
    if (!next) return true;
    a.tx = next.x;
    a.ty = next.y;
    if (this.moveToward(a, dt, speed)) a.path.shift();
    return a.path.length === 0;
  }

  private isClaimedByThief(s: Slot): boolean {
    return s.claimedBy !== null && this.actors.some((a) => a.id === s.claimedBy && a.kind === 'thief');
  }

  private releaseClaim(a: Actor): void {
    if (a.slot >= 0 && this.slots[a.slot]?.claimedBy === a.id) this.slots[a.slot].claimedBy = null;
    a.slot = -1;
  }

  private moveToward(a: Actor, dt: number, speed = a.speed): boolean {
    const dx = a.tx - a.x;
    const dy = a.ty - a.y;
    const d = Math.hypot(dx, dy);
    if (d < 2) {
      a.x = a.tx;
      a.y = a.ty;
      return true;
    }
    const step = Math.min(d, speed * dt);
    a.x += (dx / d) * step;
    a.y += (dy / d) * step;
    if (Math.abs(dx) > 1) a.facing = dx < 0 ? -1 : 1;
    a.bob += dt * 10;
    return false;
  }

  private leave(a: Actor, mood: Mood): void {
    this.releaseClaim(a);
    a.state = 'leave';
    a.mood = mood;
    a.tx = DOOR_X + 40;
    a.ty = SHOP_LANE_Y + this.rand(-10, 10);
    a.timer = 0;
  }

  private updateActors(dt: number): void {
    for (const a of this.actors) {
      a.timer += dt;
      if (a.kind === 'thief') this.updateThief(a, dt);
      else this.updateCustomer(a, dt);
    }
    this.actors = this.actors.filter((a) => !a.gone && !(a.state === 'leave' && a.x >= DOOR_X + 30));
    // Keep queue targets in sync with queue order.
    this.queue.forEach((a, i) => {
      const p = queuePos(i);
      a.tx = Math.min(p.x, 960);
      a.ty = p.y;
    });
  }

  private updateCustomer(a: Actor, dt: number): void {
    switch (a.state) {
      case 'enter':
      case 'toShelf': {
        if (a.slot < 0) {
          this.chooseShelfTarget(a);
          break;
        }
        if (this.moveToward(a, dt)) {
          a.state = 'browse';
          a.timer = 0;
        }
        break;
      }
      case 'browse': {
        if (a.timer < 0.45) break;
        const slot = this.slots[a.slot];
        if (slot && slot.item !== null && slot.claimedBy === a.id) {
          a.item = slot.item;
          slot.item = null;
          slot.claimedBy = null;
          a.slot = -1;
          a.state = 'toQueue';
          a.timer = 0;
          this.queue.push(a);
        } else {
          this.releaseClaim(a);
          a.state = 'waitShelf';
          a.timer = 0;
          a.mood = 'thinking';
        }
        break;
      }
      case 'waitShelf': {
        this.moveToward(a, dt, a.speed * 0.5);
        if (a.timer > this.stats.patience) {
          this.report.lost++;
          this.save.totals.lost++;
          this.emit({ type: 'lost', hero: a.hero, reason: 'empty' });
          this.leave(a, 'angry');
          break;
        }
        if (this.slots.some((s) => s.item !== null && s.claimedBy === null)) {
          const waited = a.timer;
          this.chooseShelfTarget(a);
          a.timer = waited;
        }
        break;
      }
      case 'toQueue':
      case 'queue': {
        const arrived = this.moveToward(a, dt);
        if (arrived) a.state = 'queue';
        if (a.timer > this.stats.queuePatience) {
          this.queue = this.queue.filter((q) => q !== a);
          if (a.item !== null) this.returnItem(a.item);
          a.item = null;
          this.report.lost++;
          this.save.totals.lost++;
          this.emit({ type: 'lost', hero: a.hero, reason: 'queue' });
          this.leave(a, 'angry');
        }
        break;
      }
      case 'leave':
        this.moveToward(a, dt, a.speed * 1.2);
        break;
      default:
        break;
    }
  }

  private updateThief(a: Actor, dt: number): void {
    const style = a.style!;
    a.hitFlash = Math.max(0, a.hitFlash - dt * 4);
    switch (a.state) {
      case 'enter':
      case 'toShelf': {
        const slot = this.slots[a.slot];
        if (!slot || slot.item === null) {
          this.releaseClaim(a);
          this.chooseThiefTarget(a);
          break;
        }
        if (a.path.length) {
          this.followPath(a, dt, a.speed);
          break;
        }
        const p = slotPos(a.slot);
        a.tx = p.x;
        a.ty = SHOP_LANE_Y;
        if (this.moveToward(a, dt, a.rope ? a.speed * 0.8 : a.speed)) {
          a.rope = false;
          a.state = 'steal';
          a.timer = 0;
        }
        break;
      }
      case 'steal': {
        if (a.timer < this.stats.stealTime * style.steal) break;
        const slot = this.slots[a.slot];
        if (slot && slot.item !== null) {
          a.item = slot.item;
          slot.item = null;
          // Any customer that was heading for this item has to look again.
          for (const c of this.actors) {
            if (c.kind === 'customer' && c.slot === a.slot) {
              c.slot = -1;
              if (c.state === 'browse') c.state = 'toShelf';
            }
          }
          slot.claimedBy = null;
        }
        this.startFlee(a);
        if (a.item !== null && this.rng() < this.stats.guardChance) this.catchThief(a, true);
        break;
      }
      case 'flee': {
        const speed = 270 * style.speed * this.stats.thiefSpeed * (a.rope ? 0.6 : 1);
        const vanishAfter = 2.2 / this.stats.thiefSpeed;
        if (style.exit === 'smoke') {
          this.followPath(a, dt, 90 * this.stats.thiefSpeed);
          if (a.timer >= vanishAfter) {
            this.effects.push({ kind: 'smoke', x: a.x, y: a.y - HERO_PX / 2, t: 0 });
            this.escape(a);
          }
        } else if (this.followPath(a, dt, speed)) {
          this.escape(a);
        }
        break;
      }
      case 'caught':
        if (a.timer > 0.8) {
          this.effects.push({ kind: 'smoke', x: a.x, y: a.y - HERO_PX / 2, t: 0 });
          a.gone = true;
        }
        break;
      default:
        break;
    }
  }

  private escape(a: Actor): void {
    if (a.item !== null) {
      this.report.stolen++;
      this.save.totals.stolen++;
      this.emit({ type: 'stolen', hero: a.hero, item: a.item });
      a.item = null;
    }
    a.gone = true;
  }

  private catchThief(a: Actor, byGuard: boolean): void {
    this.releaseClaim(a);
    if (a.item !== null) this.returnItem(a.item);
    a.item = null;
    const topValue = RARITY_PRICE[this.stats.maxRarity] * this.stats.priceMult;
    const bounty = Math.round((5 + 0.6 * topValue) * this.stats.bountyMult);
    this.addGum(bounty, a.x, a.y - HERO_PX - 30);
    this.report.caught++;
    this.save.totals.caught++;
    a.state = 'caught';
    a.mood = 'angry';
    a.rope = false;
    a.path = [];
    a.timer = 0;
    this.emit({ type: 'caught', hero: a.hero, bounty, byGuard });
  }

  private updateRegisters(dt: number): void {
    for (let r = 0; r < this.registerProgress.length; r++) {
      const a = this.queue[r];
      if (!a || a.state !== 'queue') {
        this.registerProgress[r] = 0;
        continue;
      }
      this.registerProgress[r] += dt;
      if (this.registerProgress[r] >= this.stats.cashierTime) this.checkout(r);
    }
  }

  private checkout(r: number): void {
    const a = this.queue[r];
    this.registerProgress[r] = 0;
    this.queue.splice(r, 1);
    if (a.item === null) {
      this.leave(a, 'none');
      return;
    }
    const tip = this.rng() < this.stats.tipChance;
    const ext = getExtension(a.item);
    const price = salePrice(ext.rarityIndex, this.stats, this.save.collection.length, a.tier, tip);
    this.addGum(price, a.x, a.y - HERO_PX - 30);
    this.report.sold++;
    this.save.totals.sold++;
    if (!this.report.bestSale || price > this.report.bestSale.price) {
      this.report.bestSale = { price, item: a.item, hero: a.hero.name };
    }
    this.emit({ type: 'sale', price, item: a.item, hero: a.hero, tip });
    a.paid = price;
    a.item = null;
    this.leave(a, 'happy');
  }

  private addGum(amount: number, x: number, y: number): void {
    this.save.gum += amount;
    this.save.totals.revenue += amount;
    this.report.revenue += amount;
    this.popups.push({ text: `+${amount.toLocaleString()}`, x, y, t: 0, color: '#ffe066', icon: 'gum' });
  }

  private pickSpot(): { x: number; y: number } {
    const spot = this.pick(PEST_SPOTS);
    return { x: spot.x + this.rand(-25, 25), y: spot.y + this.rand(-10, 10) };
  }

  private updatePests(dt: number): void {
    for (const p of this.pests) {
      p.t += dt;
      if (p.hopT < p.hopDur) {
        p.hopT = Math.min(p.hopDur, p.hopT + dt);
        const k = p.hopT / p.hopDur;
        p.x = p.fromX + (p.toX - p.fromX) * k;
        p.y = p.fromY + (p.toY - p.fromY) * k;
      } else if ((p.wait -= dt) <= 0) {
        // Hop to another random spot so the pest can't be caught by tapping one place.
        const to = this.pickSpot();
        Object.assign(p, { fromX: p.x, fromY: p.y, toX: to.x, toY: to.y, hopT: 0 });
        p.hopDur = Math.max(0.35, Math.hypot(to.x - p.x, to.y - p.y) / 380);
        p.wait = this.rand(1.2, 2.6);
      }
    }
    this.pests = this.pests.filter((p) => p.t < p.life);

    if (this.save.day < 3) return;
    const maxPests = Math.min(3, 1 + Math.floor((this.save.day - 3) / 4));
    this.pestTimer += dt;
    if (this.pestTimer >= this.nextPest && this.pests.length < maxPests) {
      this.pestTimer = 0;
      this.nextPest = this.rand(12, 22) * this.stats.pestInterval;
      const e = this.pick(pests);
      const at = this.pickSpot();
      this.pests.push({
        id: this.nextId++,
        name: e.name,
        image: e.image,
        ...{ x: at.x, y: at.y, fromX: at.x, fromY: at.y, toX: at.x, toY: at.y },
        hopT: 0,
        hopDur: 0,
        wait: this.rand(1, 2),
        life: 14,
        t: 0,
      });
      this.effects.push({ kind: 'smoke', x: at.x, y: at.y - PEST_PX / 2, t: 0 });
      this.emit({ type: 'pest', name: e.name });
    }
  }

  // ---------------------------------------------------------------- input

  clickPot(): void {
    if (this.over) return;
    this.craftProgress += this.stats.craftClick;
    this.potPulse = 1;
  }

  clickRegister(): void {
    if (this.over) return;
    this.registerPulse = 1;
    const a = this.queue[0];
    if (a && a.state === 'queue') {
      this.registerProgress[0] += this.stats.registerClick;
      if (this.registerProgress[0] >= this.stats.cashierTime) this.checkout(0);
    }
  }

  clickPest(p: Pest): boolean {
    if (this.over || !this.pests.includes(p)) return false;
    const reward = Math.round((3 + 0.3 * RARITY_PRICE[this.stats.maxRarity] * this.stats.priceMult) * this.stats.pestBountyMult);
    this.addGum(reward, p.x, p.y - PEST_PX - 20);
    this.effects.push({ kind: 'hit', x: p.x, y: p.y - PEST_PX / 2, t: 0 });
    this.pests = this.pests.filter((q) => q !== p);
    this.report.pests++;
    this.save.totals.pests++;
    this.emit({ type: 'pestCleared', reward });
    return true;
  }

  /** Returns the thief under the point, if any (sprites are drawn with feet at a.y). Hit boxes are generous for touch. */
  thiefAt(x: number, y: number): Actor | null {
    for (const a of this.actors) {
      if (a.kind !== 'thief' || a.state === 'caught' || a.gone) continue;
      if (Math.abs(x - a.x) < 52 && y < a.y + 26 && y > a.y - HERO_PX - 34) return a;
    }
    return null;
  }

  clickThief(a: Actor): void {
    if (this.over || a.state === 'caught' || a.gone) return;
    a.hp--;
    a.hitFlash = 1;
    this.effects.push({ kind: 'hit', x: a.x, y: a.y - HERO_PX / 2, t: 0 });
    if (a.hp > 0) this.emit({ type: 'thiefHit', hero: a.hero, hpLeft: a.hp });
    else this.catchThief(a, false);
  }

  pestAt(x: number, y: number): Pest | null {
    for (const p of this.pests) {
      if (Math.abs(x - p.x) < 52 && y < p.y + 22 && y > p.y - PEST_PX - 30) return p;
    }
    return null;
  }

  isOnPot(x: number, y: number): boolean {
    const h = POT.hit;
    const onRing = Math.hypot(x - CRAFT_RING.x, y - CRAFT_RING.y) < 50;
    return onRing || (x >= h.x0 && x <= h.x1 && y >= h.y0 && y <= h.y1);
  }

  isOnRegister(x: number, y: number): boolean {
    return x >= COUNTER.x0 && x <= COUNTER.x1 + 40 && y >= COUNTER.top - 150 && y <= COUNTER.bottom + 60;
  }

  // ---------------------------------------------------------------- day end

  private closeDay(): void {
    this.over = true;
    this.timeLeft = 0;
    // Items still in customers' hands or in flight go back on the shelf / into storage.
    const held = [
      ...this.actors.flatMap((a) => (a.item !== null && a.kind === 'customer' ? [a.item] : [])),
      ...this.flyers.map((f) => f.item),
    ];
    for (const f of this.flyers) if (f.dest.kind === 'slot') this.slots[f.dest.index].incoming = false;
    this.flyers = [];
    for (const item of held) this.returnItem(item);
    this.save.shelf = this.slots.map((s) => s.item);
    this.save.storage = [...this.storage];
    this.save.bestDayRevenue = Math.max(this.save.bestDayRevenue, this.report.revenue);
    this.save.day++;
    this.emit({ type: 'dayEnd', report: this.report });
  }

  get maxSlots(): number {
    return MAX_SLOTS;
  }
}
