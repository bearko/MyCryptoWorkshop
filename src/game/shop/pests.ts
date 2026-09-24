import { pests as pestCatalog } from '../catalog';
import { PEST_PX, PEST_SPOTS } from '../layout';
import { RARITY_PRICE } from '../items';
import type { Shop } from './index';
import type { Pest } from './types';

/** Enemies that get into the workshop from day 3, hop around and slow crafting. */
export class Pests {
  list: Pest[] = [];
  private timer = 0;
  private next: number;

  constructor(private readonly shop: Shop) {
    this.next = shop.rand.range(12, 20) * shop.stats.pestInterval;
  }

  private pickSpot(): { x: number; y: number } {
    const { rand } = this.shop;
    const spot = rand.pick(PEST_SPOTS);
    return { x: spot.x + rand.range(-25, 25), y: spot.y + rand.range(-10, 10) };
  }

  update(dt: number): void {
    const shop = this.shop;
    for (const p of this.list) {
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
        p.wait = shop.rand.range(1.2, 2.6);
      }
    }
    this.list = this.list.filter((p) => p.t < p.life);

    if (shop.save.day < 3) return;
    const maxPests = Math.min(3, 1 + Math.floor((shop.save.day - 3) / 4));
    this.timer += dt;
    if (this.timer >= this.next && this.list.length < maxPests) {
      this.timer = 0;
      this.next = shop.rand.range(12, 22) * shop.stats.pestInterval;
      const e = shop.rand.pick(pestCatalog);
      const at = this.pickSpot();
      this.list.push({
        id: shop.newId(),
        name: e.name,
        image: e.image,
        ...{ x: at.x, y: at.y, fromX: at.x, fromY: at.y, toX: at.x, toY: at.y },
        hopT: 0,
        hopDur: 0,
        wait: shop.rand.range(1, 2),
        life: 14,
        t: 0,
      });
      shop.fx.push({ kind: 'smoke', x: at.x, y: at.y - PEST_PX / 2, t: 0 });
      shop.emit({ type: 'pest', name: e.name });
    }
  }

  at(x: number, y: number): Pest | null {
    for (const p of this.list) {
      if (Math.abs(x - p.x) < 52 && y < p.y + 22 && y > p.y - PEST_PX - 30) return p;
    }
    return null;
  }

  click(p: Pest): boolean {
    const shop = this.shop;
    if (!this.list.includes(p)) return false;
    const { stats } = shop;
    const reward = Math.round((3 + 0.3 * RARITY_PRICE[stats.maxRarity] * stats.priceMult) * stats.pestBountyMult);
    shop.addGum(reward, p.x, p.y - PEST_PX - 20);
    shop.fx.push({ kind: 'hit', x: p.x, y: p.y - PEST_PX / 2, t: 0 });
    this.list = this.list.filter((q) => q !== p);
    shop.report.pests++;
    shop.save.totals.pests++;
    shop.emit({ type: 'pestCleared', reward });
    return true;
  }
}
