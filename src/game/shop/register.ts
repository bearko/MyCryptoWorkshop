import { COUNTER, HERO_PX } from '../layout';
import { itemExt } from '../items';
import { salePrice } from '../stats';
import { DUST_BY_RARITY } from './dismantler';
import type { Shop } from './index';

/** A self-checkout machine takes this much longer than Chris-kun. */
export const AUTO_REGISTER_SLOWDOWN = 1.6;

/** Chris-kun's register(s) and the self-checkout machines: checkout progress, taps, sales. */
export class Register {
  /** Checkout progress in seconds per lane (staffed registers first, then machines). */
  progress: number[];
  pulse = 0;
  /** Gold dust from sales not yet a whole grain (金粉の還元). */
  private dustFrac = 0;
  /** Lanes that are self-checkout machines (no taps, slower). */
  autoFrom: number;

  constructor(private readonly shop: Shop) {
    const { registers, autoRegisters } = shop.stats;
    this.autoFrom = registers;
    this.progress = Array.from({ length: registers + autoRegisters }, () => 0);
  }

  /** Registers bought during the day open at once. */
  applyStats(): void {
    const { registers, autoRegisters } = this.shop.stats;
    this.autoFrom = registers;
    while (this.progress.length < registers + autoRegisters) this.progress.push(0);
  }

  decay(dt: number): void {
    this.pulse = Math.max(0, this.pulse - dt * 4);
  }

  /** Seconds a checkout takes on lane r. */
  laneTime(r: number): number {
    return this.shop.stats.cashierTime * (r >= this.autoFrom ? AUTO_REGISTER_SLOWDOWN : 1);
  }

  update(dt: number): void {
    const queue = this.shop.customers.queue;
    for (let r = 0; r < this.progress.length; r++) {
      const a = queue[r];
      if (!a || a.state !== 'queue') {
        this.progress[r] = 0;
        continue;
      }
      this.progress[r] += dt;
      if (this.progress[r] >= this.laneTime(r)) this.checkout(r);
    }
  }

  click(): void {
    this.pulse = 1;
    const a = this.shop.customers.queue[0];
    if (a && a.state === 'queue') {
      this.progress[0] += this.shop.stats.registerClick;
      if (this.progress[0] >= this.laneTime(0)) this.checkout(0);
    }
  }

  /** Checks out up to `count` customers who are in line at once. Returns how many. */
  rush(count: number): number {
    let done = 0;
    for (let k = 0; k < count; k++) {
      const r = this.shop.customers.queue.findIndex((a) => a.state === 'queue');
      if (r < 0) break;
      this.checkout(r, true);
      done++;
    }
    return done;
  }

  isOnRegister(x: number, y: number): boolean {
    return x >= COUNTER.x0 - 10 && x <= COUNTER.x1 + 30 && y >= COUNTER.top - 90 && y <= COUNTER.bottom + 30;
  }

  private checkout(r: number, batched = false): void {
    const shop = this.shop;
    const customers = shop.customers;
    const a = customers.queue[r];
    this.progress[r] = 0;
    customers.queue.splice(r, 1);
    if (a.item === null) {
      customers.leave(a, 'none');
      return;
    }
    const tip = shop.rand.next() < shop.stats.tipChance;
    const price = Math.round(salePrice(a.item, shop.stats, shop.save.collection.length, a.tier, tip) * customers.payMult(a, a.item));
    shop.addGum(price, a.x, a.y - HERO_PX - 30);
    shop.report.sold++;
    shop.save.totals.sold++;
    // 金粉の還元: a pinch of gold dust for every sale, by rarity.
    if (shop.stats.saleDust > 0) {
      this.dustFrac += DUST_BY_RARITY[itemExt(a.item).rarityIndex] * shop.stats.saleDust * shop.stats.dustMult;
      const grains = Math.floor(this.dustFrac);
      if (grains > 0) {
        this.dustFrac -= grains;
        shop.save.resources.dust += grains;
        shop.report.dust += grains;
      }
    }
    if (itemExt(a.item).rarityIndex >= 2) shop.report.rareSold++;
    if (!shop.save.heroes[a.hero.id]) shop.report.newHeroes.push(a.hero.id);
    shop.save.heroes[a.hero.id] = (shop.save.heroes[a.hero.id] ?? 0) + 1;
    if (!shop.report.bestSale || price > shop.report.bestSale.price) {
      shop.report.bestSale = { price, item: a.item, hero: a.hero.name };
    }
    shop.emit({ type: 'sale', price, item: a.item, hero: a.hero, tip });
    if (a.special === 'order' && a.order && shop.save.orders.includes(a.order)) {
      // Order filled: the hero is delighted (affinity +3) and the order is done.
      shop.save.orders = shop.save.orders.filter((o) => o !== a.order);
      shop.save.heroes[a.hero.id] += 3;
      shop.report.ordersDone++;
      shop.save.totals.orders++;
      shop.emit({ type: 'orderDone', hero: a.hero, item: a.item, price });
    }
    a.paid = price;
    a.item = null;
    shop.hazards.onPaid(a, price);
    customers.afterCheckout(a);
    // まとめ会計: the next customer in line is served in the same go.
    if (!batched && shop.rand.next() < shop.stats.batchChance) {
      const next = customers.queue[r];
      if (next && next.state === 'queue') {
        shop.emit({ type: 'batch' });
        this.checkout(r, true);
      }
    }
  }
}
