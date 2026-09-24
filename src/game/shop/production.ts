import { series } from '../catalog';
import { CRAFT_RING, POT } from '../layout';
import { rarityWeights } from '../stats';
import type { Shop } from './index';

/** The magic pot: craft progress, taps, Mine-chan's auto-stirring. */
export class Production {
  progress = 0;
  blocked = false;
  potPulse = 0;
  minePulse = 0;
  private mineTimer = 0;

  constructor(private readonly shop: Shop) {}

  update(dt: number): void {
    const { stats, stock } = this.shop;
    this.potPulse = Math.max(0, this.potPulse - dt * 4);
    this.minePulse = Math.max(0, this.minePulse - dt * 3);
    if (stats.mineInterval > 0) {
      this.mineTimer += dt;
      if (this.mineTimer >= stats.mineInterval) {
        this.mineTimer -= stats.mineInterval;
        this.progress += stats.craftClick;
        this.minePulse = 1;
        this.shop.emit({ type: 'mine' });
      }
    }
    // Each pest in the workshop slows crafting.
    const rate = Math.max(0.3, 1 - 0.35 * this.shop.pests.list.length);
    this.progress += (dt / stats.craftTime) * rate;
    this.blocked = false;
    while (this.progress >= 1) {
      if (stock.capacity() <= 0) {
        this.progress = 1;
        this.blocked = true;
        return;
      }
      this.progress -= 1;
      const count = this.shop.rand.next() < stats.doubleChance ? 2 : 1;
      for (let i = 0; i < count && stock.capacity() > 0; i++) this.craftOne();
    }
  }

  click(): void {
    this.progress += this.shop.stats.craftClick;
    this.potPulse = 1;
  }

  isOnPot(x: number, y: number): boolean {
    const h = POT.hit;
    const onRing = Math.hypot(x - CRAFT_RING.x, y - CRAFT_RING.y) < 50;
    return onRing || (x >= h.x0 && x <= h.x1 && y >= h.y0 && y <= h.y1);
  }

  private rollItem(): number {
    const { stats, rand } = this.shop;
    const rarity = rand.weighted(rarityWeights(stats.maxRarity, stats.luck));
    const seriesIndex = rand.pick(stats.seriesUnlocked);
    return series[seriesIndex].items[rarity].id;
  }

  private craftOne(): void {
    const { save, report } = this.shop;
    const item = this.rollItem();
    const isNew = !save.collection.includes(item);
    if (isNew) {
      save.collection.push(item);
      report.newEntries.push(item);
    }
    report.crafted++;
    save.totals.crafted++;
    this.shop.stock.sendFromPot(item);
    this.shop.emit({ type: 'craft', item, isNew });
  }
}
