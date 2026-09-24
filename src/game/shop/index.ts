import { MAX_SLOTS } from '../layout';
import type { SaveData } from '../save';
import { computeStats, type Stats } from '../stats';
import { Customers } from './customers';
import { Pests } from './pests';
import { Production } from './production';
import { Random } from './random';
import { Register } from './register';
import { Stock } from './stock';
import { Thieves } from './thieves';
import type { Actor, DayReport, Fx, Pest, Popup, Rng, ShopEvent } from './types';

export type * from './types';

/**
 * One business day. Owns the shared state (stats, actors, report, effects) and runs each
 * system in a fixed order every frame. Systems live in this folder:
 *   stock (shelf/storage/flyers) · production (pot) · customers · thieves · register · pests
 */
export class Shop {
  readonly stats: Stats;
  readonly rand: Random;
  readonly report: DayReport;
  actors: Actor[] = [];
  popups: Popup[] = [];
  fx: Fx[] = [];
  timeLeft: number;
  elapsed = 0;
  over = false;

  readonly stock: Stock;
  readonly production: Production;
  readonly customers: Customers;
  readonly thieves: Thieves;
  readonly register: Register;
  readonly pests: Pests;

  private lastId = 0;
  private listeners: ((e: ShopEvent) => void)[] = [];

  constructor(
    readonly save: SaveData,
    rng: Rng = Math.random,
  ) {
    this.rand = new Random(rng);
    this.stats = computeStats(save.levels);
    this.timeLeft = this.stats.dayLength;
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
    this.stock = new Stock(save, this.stats);
    this.production = new Production(this);
    this.customers = new Customers(this);
    this.register = new Register(this);
    // Thieves before pests: both draw their first spawn time from the RNG in this order.
    this.thieves = new Thieves(this);
    this.pests = new Pests(this);
  }

  // ---------------------------------------------------------------- shared helpers

  on(fn: (e: ShopEvent) => void): void {
    this.listeners.push(fn);
  }

  emit(e: ShopEvent): void {
    for (const fn of this.listeners) fn(e);
  }

  newId(): number {
    return ++this.lastId;
  }

  addGum(amount: number, x: number, y: number): void {
    this.save.gum += amount;
    this.save.totals.revenue += amount;
    this.report.revenue += amount;
    this.popups.push({ text: `+${amount.toLocaleString()}`, x, y, t: 0, color: '#ffe066', icon: 'gum' });
  }

  // ---------------------------------------------------------------- update

  update(dt: number): void {
    if (this.over) return;
    this.elapsed += dt;
    this.timeLeft -= dt;
    this.register.decay(dt);

    this.production.update(dt);
    this.stock.update(dt);
    // No new arrivals in the last two seconds of the day.
    if (this.timeLeft >= 2) {
      this.customers.updateSpawns(dt);
      this.thieves.updateSpawns(dt);
    }
    for (const a of this.actors) {
      a.timer += dt;
      if (a.kind === 'thief') this.thieves.update(a, dt);
      else this.customers.update(a, dt);
    }
    this.actors = this.actors.filter((a) => !a.gone);
    this.customers.alignQueue();
    this.register.update(dt);
    this.pests.update(dt);

    for (const e of this.fx) e.t += dt;
    this.fx = this.fx.filter((e) => e.t < 0.7);
    for (const p of this.popups) p.t += dt;
    this.popups = this.popups.filter((p) => p.t < 1.4);

    if (this.timeLeft <= 0) this.closeDay();
  }

  private closeDay(): void {
    this.over = true;
    this.timeLeft = 0;
    // Items still in customers' hands or in flight go back on the shelf / into storage.
    this.stock.closeOut(this.actors.flatMap((a) => (a.item !== null && a.kind === 'customer' ? [a.item] : [])));
    this.save.shelf = this.stock.slots.map((s) => s.item);
    this.save.storage = [...this.stock.storage];
    this.save.bestDayRevenue = Math.max(this.save.bestDayRevenue, this.report.revenue);
    this.save.day++;
    this.emit({ type: 'dayEnd', report: this.report });
  }

  // ---------------------------------------------------------------- input (ignored after closing)

  clickPot(): void {
    if (!this.over) this.production.click();
  }

  clickRegister(): void {
    if (!this.over) this.register.click();
  }

  clickThief(a: Actor): void {
    if (!this.over) this.thieves.click(a);
  }

  clickPest(p: Pest): boolean {
    return !this.over && this.pests.click(p);
  }

  thiefAt(x: number, y: number): Actor | null {
    return this.thieves.at(x, y);
  }

  pestAt(x: number, y: number): Pest | null {
    return this.pests.at(x, y);
  }

  isOnPot(x: number, y: number): boolean {
    return this.production.isOnPot(x, y);
  }

  isOnRegister(x: number, y: number): boolean {
    return this.register.isOnRegister(x, y);
  }

  // ---------------------------------------------------------------- read-only views for the renderer

  get slots() {
    return this.stock.slots;
  }
  get storage() {
    return this.stock.storage;
  }
  get flyers() {
    return this.stock.flyers;
  }
  get queue() {
    return this.customers.queue;
  }
  get pestList() {
    return this.pests.list;
  }
  get registerProgress() {
    return this.register.progress;
  }
  get registerPulse() {
    return this.register.pulse;
  }
  get craftProgress() {
    return this.production.progress;
  }
  get craftBlocked() {
    return this.production.blocked;
  }
  get potPulse() {
    return this.production.potPulse;
  }
  get minePulse() {
    return this.production.minePulse;
  }
  get maxSlots(): number {
    return MAX_SLOTS;
  }
}
