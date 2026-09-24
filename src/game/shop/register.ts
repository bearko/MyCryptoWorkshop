import { getExtension } from '../catalog';
import { COUNTER, HERO_PX } from '../layout';
import { salePrice } from '../stats';
import type { Shop } from './index';

/** Chris-kun's register(s): checkout progress, taps, sales. */
export class Register {
  /** Checkout progress in seconds per register. */
  progress: number[];
  pulse = 0;

  constructor(private readonly shop: Shop) {
    this.progress = Array.from({ length: shop.stats.registers }, () => 0);
  }

  decay(dt: number): void {
    this.pulse = Math.max(0, this.pulse - dt * 4);
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
      if (this.progress[r] >= this.shop.stats.cashierTime) this.checkout(r);
    }
  }

  click(): void {
    this.pulse = 1;
    const a = this.shop.customers.queue[0];
    if (a && a.state === 'queue') {
      this.progress[0] += this.shop.stats.registerClick;
      if (this.progress[0] >= this.shop.stats.cashierTime) this.checkout(0);
    }
  }

  isOnRegister(x: number, y: number): boolean {
    return x >= COUNTER.x0 - 10 && x <= COUNTER.x1 + 30 && y >= COUNTER.top - 90 && y <= COUNTER.bottom + 30;
  }

  private checkout(r: number): void {
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
    const ext = getExtension(a.item);
    const price = salePrice(ext.rarityIndex, shop.stats, shop.save.collection.length, a.tier, tip);
    shop.addGum(price, a.x, a.y - HERO_PX - 30);
    shop.report.sold++;
    shop.save.totals.sold++;
    if (!shop.report.bestSale || price > shop.report.bestSale.price) {
      shop.report.bestSale = { price, item: a.item, hero: a.hero.name };
    }
    shop.emit({ type: 'sale', price, item: a.item, hero: a.hero, tip });
    a.paid = price;
    a.item = null;
    customers.leave(a, 'happy');
  }
}
