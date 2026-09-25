import { fmt } from '../format';
import { MAX_SLOTS } from '../layout';
import type { SaveData } from '../save';
import { computeStats, type Stats } from '../stats';
import { Customers } from './customers';
import { Decisions } from './decisions';
import { Dismantler } from './dismantler';
import { Hazards } from './hazards';
import { Market } from './market';
import { Pests } from './pests';
import { Raid } from './raid';
import { Production } from './production';
import { Random } from './random';
import { Register } from './register';
import { Staff } from './staff';
import { Stock } from './stock';
import { Thieves } from './thieves';
import { Visitors } from './visitors';
import { rollCondition, type DayCondition } from '../conditions';
import { grantSets } from '../heroes';
import { placeOrders } from '../orders';
import { checkAchievements, rollDailies, settleDailies } from '../achievements';
import type { LineId } from '../lines';
import type { Actor, DayReport, ExtraSource, Fx, Pest, Popup, Rng, ShopEvent } from './types';

export type * from './types';

/**
 * One business day. Owns the shared state (stats, actors, report, effects) and runs each
 * system in a fixed order every frame. Systems live in this folder:
 *   stock (shelf/showcase/storage/flyers) · production (lines) · customers · thieves · register ·
 *   pests · staff · market · hazards (mud, coins, shop enemies, chests) · visitors · decisions
 */
export class Shop {
  /** Current stats (re-computed by applyLevels when skills are bought during the day). */
  stats: Stats;
  readonly rand: Random;
  readonly report: DayReport;
  actors: Actor[] = [];
  popups: Popup[] = [];
  fx: Fx[] = [];
  timeLeft: number;
  elapsed = 0;
  over = false;
  /** The doors are open (a shop made with waitToOpen shows the storefront until start()). */
  started = false;

  readonly stock: Stock;
  readonly dismantler: Dismantler;
  readonly production: Production;
  readonly customers: Customers;
  readonly thieves: Thieves;
  readonly register: Register;
  readonly pests: Pests;
  readonly staff: Staff;
  readonly market: Market;
  readonly hazards: Hazards;
  readonly visitors: Visitors;
  readonly decisions: Decisions;
  readonly raid: Raid;
  /** Today's weather / festival / land day. */
  readonly condition: DayCondition;
  /** Multiplier on how often customers come today (weather, festival). */
  readonly crowd: number;

  private lastId = 0;
  private listeners: ((e: ShopEvent) => void)[] = [];

  constructor(
    readonly save: SaveData,
    rng: Rng = Math.random,
    options: { waitToOpen?: boolean } = {},
  ) {
    this.rand = new Random(rng);
    this.stats = computeStats(save.levels);
    this.condition = save.forecast;
    this.crowd = this.condition.kind === 'rain' ? 0.85 : this.condition.kind === 'festival' ? this.stats.festivalCrowd : 1;
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
      dust: 0,
      gems: {},
      research: 0,
      extras: { bar: 0, trial: 0, market: 0, peddler: 0, bonus: 0, chest: 0, coin: 0, merchant: 0, raid: 0 },
      guests: 0,
      decisions: [],
      newHeroes: [],
      sets: [],
      ordersDone: 0,
      rareSold: 0,
      chests: 0,
      achievements: [],
      dailyEmblems: 0,
      fame: 0,
      donated: 0,
      raid: null,
    };
    this.stock = new Stock(save, this.stats);
    this.dismantler = new Dismantler(this);
    this.stock.freeUp = () => this.dismantler.freeOne();
    this.production = new Production(this);
    this.customers = new Customers(this);
    this.register = new Register(this);
    // Thieves before pests: both draw their first spawn time from the RNG in this order.
    this.thieves = new Thieves(this);
    this.pests = new Pests(this);
    this.staff = new Staff(this);
    this.market = new Market(this);
    this.hazards = new Hazards(this);
    this.visitors = new Visitors(this);
    this.decisions = new Decisions(this);
    this.raid = new Raid(this);
    if (!options.waitToOpen) this.start();
  }

  /** Opens the doors: today's 魔石 are paid and infused, and the day begins. */
  start(): void {
    if (this.started) return;
    this.started = true;
    this.production.infuse();
  }

  /**
   * Skills bought during the day (from the skill tree) take effect at once: new stats, extra
   * shelf and showcase slots, newly unlocked lines, registers and staff, a longer day.
   */
  applyLevels(): void {
    const before = this.stats;
    this.stats = computeStats(this.save.levels);
    this.timeLeft += Math.max(0, this.stats.dayLength - before.dayLength);
    this.stock.applyStats(this.stats);
    this.production.applyStats();
    this.register.applyStats();
    this.staff.applyStats();
  }

  /** A choice is waiting for the player; the day is paused. */
  get pendingDecision() {
    return this.decisions.pending;
  }

  decide(choice: number): void {
    this.decisions.decide(choice);
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
    this.popups.push({ text: `+${fmt(amount)}`, x, y, t: 0, color: '#ffe066', icon: 'gum' });
  }

  /** Revenue from outside the register (potion bar, trial area, market, peddler, closing bonus). */
  addExtra(source: ExtraSource, amount: number, x: number, y: number): void {
    this.addGum(amount, x, y);
    this.report.extras[source] += amount;
    this.emit({ type: 'extra', source, amount });
  }

  // ---------------------------------------------------------------- update

  update(dt: number): void {
    if (this.over || !this.started || this.decisions.pending) return;
    this.elapsed += dt;
    this.timeLeft -= dt;
    this.register.decay(dt);

    this.production.update(dt);
    this.stock.update(dt);
    this.dismantler.update(dt);
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
    this.staff.update(dt);
    this.market.update(dt);
    this.hazards.update(dt);
    this.visitors.update(dt);
    this.decisions.update();
    this.raid.update(dt);

    for (const e of this.fx) e.t += dt;
    this.fx = this.fx.filter((e) => e.t < 0.7);
    for (const p of this.popups) p.t += dt;
    this.popups = this.popups.filter((p) => p.t < 1.4);

    if (this.timeLeft <= 0) this.closeDay();
  }

  private closeDay(): void {
    this.over = true;
    this.timeLeft = 0;
    this.raid.finish();
    this.staff.closeDay();
    // Items still in customers' hands or in flight go back on the shelf / into storage.
    this.stock.closeOut(this.actors.flatMap((a) => (a.item !== null && a.kind === 'customer' ? [a.item] : [])));
    this.save.shelf = this.stock.slots.filter((s) => !s.showcase).map((s) => s.item);
    this.save.showcase = this.stock.slots.filter((s) => s.showcase).map((s) => s.item);
    this.save.storage = [...this.stock.storage];
    this.save.bestDayRevenue = Math.max(this.save.bestDayRevenue, this.report.revenue);
    // The early-game leaderboard: first-run sales by the end of Day 30.
    if (this.save.day === 30 && this.save.prestige.runs === 0) this.save.ranking.day30 = this.save.totals.revenue - this.save.prestige.runStartRevenue;
    this.report.sets = grantSets(this.save).map((set) => set.name);
    this.report.dailyEmblems = settleDailies(this.save, this.report);
    // Orders not filled today wait one more day; new ones come in for tomorrow.
    for (const o of this.save.orders) o.days--;
    let id = Math.max(0, ...this.save.orders.map((o) => o.id));
    this.save.orders = placeOrders(this.save.orders, this.stats, () => this.rand.next(), () => ++id);
    this.save.day++;
    this.report.achievements = checkAchievements(this.save).map((a) => a.name);
    this.save.dailies = rollDailies(this.save, this.stats, this.report, () => this.rand.next());
    this.save.forecast = rollCondition(this.save.day, () => this.rand.next());
    this.emit({ type: 'dayEnd', report: this.report });
  }

  // ---------------------------------------------------------------- input (ignored after closing)

  /** Tap on a production line (the magic pot by default). */
  clickLine(id: LineId = 'pot'): void {
    if (!this.over) this.production.line(id)?.click();
  }

  /** Start / stop holding a line to overclock it. */
  holdLine(id: LineId, holding: boolean): void {
    const line = this.production.line(id);
    if (line && !this.over) line.holding = holding && line.jam <= 0;
  }

  lineAt(x: number, y: number): LineId | null {
    return this.production.lineAt(x, y)?.id ?? null;
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

  /** Taps on a chest, a shop enemy, a coin or a mess. Returns true if something was hit. */
  clickHazard(x: number, y: number): boolean {
    return !this.over && this.hazards.click(x, y);
  }

  hazardAt(x: number, y: number) {
    return this.hazards.at(x, y);
  }

  thiefAt(x: number, y: number): Actor | null {
    return this.thieves.at(x, y);
  }

  pestAt(x: number, y: number): Pest | null {
    return this.pests.at(x, y);
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
  get lines() {
    return this.production.lines;
  }
  get maxSlots(): number {
    return MAX_SLOTS;
  }
  /** Shelf slots, not counting the showcase. */
  get shelfSlots(): number {
    return this.stats.shelfSlots;
  }
  get staffMembers() {
    return this.staff.members;
  }
}
