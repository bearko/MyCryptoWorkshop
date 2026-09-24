import { COUNTER, HERO_PX } from '../layout';
import { salePrice } from '../stats';
import type { Shop } from './index';

/** A self-checkout machine takes this much longer than Chris-kun. */
export const AUTO_REGISTER_SLOWDOWN = 1.6;

/** Chris-kun's register(s) and the self-checkout machines: checkout progress, taps, sales. */
export class Register {
  /** Checkout progress in seconds per lane (staffed registers first, then machines). */
  progress: number[];
  pulse = 0;
  /** Lanes that are self-checkout machines (no taps, slower). */
  readonly autoFrom: number;

  constructor(private readonly shop: Shop) {
    const { registers, autoRegisters } = shop.stats;
    this.autoFrom = registers;
    this.progress = Array.from({ length: registers + autoRegisters }, () => 0);
  }

  decay(dt: number): void {
    this.pulse = Math.max(0, this.pulse - dt * 4);
  }

  private laneTime(r: number): number {
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
    const price = Math.round(salePrice(a.item, shop.stats, shop.save.collection.length, a.tier, tip) * a.priceBonus);
    shop.addGum(price, a.x, a.y - HERO_PX - 30);
    shop.report.sold++;
    shop.save.totals.sold++;
    if (!shop.report.bestSale || price > shop.report.bestSale.price) {
      shop.report.bestSale = { price, item: a.item, hero: a.hero.name };
    }
    shop.emit({ type: 'sale', price, item: a.item, hero: a.hero, tip });
    a.paid = price;
    a.item = null;
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
