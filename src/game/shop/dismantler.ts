import { itemEdition, itemExt, itemValue, type ItemCode } from '../items';
import { DISMANTLER, STORAGE_POS } from '../layout';
import { FAMILY_GEM } from '../lines';
import type { Shop } from './index';

/** Gold dust per dismantled item, by rarity (Common → Legendary). */
export const DUST_BY_RARITY = [1, 2, 5, 12, 30];
/** Seconds between breaking down surplus junk while the shelf is full. */
const SURPLUS_INTERVAL = 3;

/**
 * The 分解炉 (fireplace): when there is no room for a newly crafted item, it breaks down the
 * cheapest low-rarity plain item into gold dust and sometimes a 魔石.
 */
export class Dismantler {
  private timer = 0;

  constructor(private readonly shop: Shop) {}

  /** While the shelf is full, surplus junk in storage is broken down one item at a time. */
  update(dt: number): void {
    const { stats, stock } = this.shop;
    if (stats.dismantleRarity < 0) return;
    this.timer = Math.min(this.timer + dt, SURPLUS_INTERVAL);
    if (this.timer < SURPLUS_INTERVAL || !stock.shelfFull()) return;
    let pick = -1;
    stock.storage.forEach((code, i) => this.eligible(code) && (pick < 0 || itemValue(code) < itemValue(stock.storage[pick])) && (pick = i));
    if (pick < 0) return;
    this.timer = 0;
    this.dismantle(stock.storage.splice(pick, 1)[0], STORAGE_POS);
  }

  private eligible(code: ItemCode): boolean {
    const ext = itemExt(code);
    return ext.rarityIndex <= this.shop.stats.dismantleRarity && itemEdition(code) === 0 && !ext.shin;
  }

  /** Frees one place by dismantling an item from storage (or an unclaimed shelf item). */
  freeOne(): boolean {
    const shop = this.shop;
    if (shop.stats.dismantleRarity < 0) return false;
    const stock = shop.stock;
    // Cheapest eligible item: storage first, then shelf items nobody is heading for.
    let best: { where: 'storage' | 'slot'; index: number; value: number } | null = null;
    stock.storage.forEach((code, index) => {
      if (this.eligible(code) && (!best || itemValue(code) < best.value)) best = { where: 'storage', index, value: itemValue(code) };
    });
    if (!best) {
      stock.slots.forEach((s, index) => {
        if (s.item !== null && s.claimedBy === null && this.eligible(s.item) && (!best || itemValue(s.item) < best.value)) {
          best = { where: 'slot', index, value: itemValue(s.item) };
        }
      });
    }
    if (!best) return false;
    const pick = best as { where: 'storage' | 'slot'; index: number };
    let code: ItemCode;
    let from: { x: number; y: number };
    if (pick.where === 'storage') {
      code = stock.storage.splice(pick.index, 1)[0];
      from = STORAGE_POS;
    } else {
      code = stock.slots[pick.index].item!;
      stock.slots[pick.index].item = null;
      from = stock.slots[pick.index];
    }
    this.dismantle(code, from);
    return true;
  }

  private dismantle(code: ItemCode, from: { x: number; y: number }): void {
    const shop = this.shop;
    const ext = itemExt(code);
    const dust = Math.max(1, Math.round(DUST_BY_RARITY[ext.rarityIndex] * shop.stats.dustMult));
    const gem = shop.rand.next() < shop.stats.gemChance ? FAMILY_GEM[ext.family] : null;
    shop.save.resources.dust += dust;
    shop.report.dust += dust;
    if (gem) {
      shop.save.resources.gems[gem]++;
      shop.report.gems[gem] = (shop.report.gems[gem] ?? 0) + 1;
    }
    shop.stock.flyers.push({ item: code, fromX: from.x, fromY: from.y, toX: DISMANTLER.x, toY: DISMANTLER.y, t: 0, dur: 0.5, dest: { kind: 'dismantle' } });
    shop.popups.push({ text: `+${dust} ダスト${gem ? '・魔石' : ''}`, x: DISMANTLER.x, y: DISMANTLER.y - 70, t: 0, color: '#ffd98a' });
    shop.emit({ type: 'dismantle', item: code, dust, gem });
  }
}
