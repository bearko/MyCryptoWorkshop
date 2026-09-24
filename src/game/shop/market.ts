import { STORAGE_POS } from '../layout';
import { salePrice } from '../stats';
import type { Shop } from './index';

/**
 * マーケット出品: while the shelf is full, surplus stock in storage is sold online, one item
 * every marketInterval seconds, at a share of the shop price.
 */
export class Market {
  private timer = 0;

  constructor(private readonly shop: Shop) {}

  update(dt: number): void {
    const shop = this.shop;
    const { stats, stock } = shop;
    if (stats.market <= 0) return;
    this.timer = Math.min(this.timer + dt, stats.marketInterval);
    if (this.timer < stats.marketInterval || !stock.hasSurplus() || !stock.shelfFull()) return;
    this.timer = 0;
    const code = stock.takeCheapest()!;
    const amount = Math.max(1, Math.round(salePrice(code, stats, shop.save.collection.length, 0, false) * stats.marketRate));
    // The parcel flies off the left edge of the workshop.
    stock.flyers.push({ item: code, fromX: STORAGE_POS.x, fromY: STORAGE_POS.y, toX: -60, toY: STORAGE_POS.y - 120, t: 0, dur: 0.9, dest: { kind: 'away' } });
    shop.staff.cheer('delivery');
    shop.addExtra('market', amount, STORAGE_POS.x + 20, STORAGE_POS.y - 70);
  }
}
