import { itemEdition, itemExt, itemValue, type ItemCode } from '../items';
import { MAX_SHOWCASE, showcasePos, slotPos, STORAGE_POS } from '../layout';
import type { SaveData } from '../save';
import type { Stats } from '../stats';
import type { Flyer, Slot } from './types';

const CRAFT_FLIGHT = 0.75;
const RESTOCK_FLIGHT = 0.6;

/** Items good enough for the showcase: Rare and above, or any edition / 真. */
export function showcaseWorthy(code: ItemCode): boolean {
  const ext = itemExt(code);
  return ext.rarityIndex >= 2 || itemEdition(code) > 0 || ext.shin;
}

/** Shelf slots (then showcase slots), back-room storage, and items flying between them. */
export class Stock {
  readonly slots: Slot[];
  storage: number[];
  flyers: Flyer[] = [];
  /** Counts up to stats.restockTime between restocks from storage. */
  private restockTimer = 0;
  /** Set when an item was restocked this frame (the stocker reacts). */
  restocked = false;

  constructor(
    save: SaveData,
    private stats: Stats,
  ) {
    const shelf = Array.from({ length: stats.shelfSlots }, (_, i): Slot => ({
      item: save.shelf[i] ?? null,
      ...slotPos(i),
      showcase: false,
      incoming: false,
      claimedBy: null,
    }));
    const showcaseCount = Math.min(MAX_SHOWCASE, stats.showcaseSlots);
    const showcase = Array.from({ length: showcaseCount }, (_, i): Slot => ({
      item: save.showcase[i] ?? null,
      ...showcasePos(i),
      showcase: true,
      incoming: false,
      claimedBy: null,
    }));
    this.slots = [...shelf, ...showcase];
    // Items that no longer fit go to storage.
    const overflow = [...save.shelf.slice(stats.shelfSlots), ...save.showcase.slice(showcaseCount)].filter((x): x is number => x !== null);
    this.storage = [...save.storage, ...overflow];
  }

  /** New shelf / showcase slots bought during the day are added at the end (indexes stay valid). */
  applyStats(stats: Stats): void {
    this.stats = stats;
    const shelf = this.slots.filter((s) => !s.showcase).length;
    const show = this.slots.filter((s) => s.showcase).length;
    for (let i = shelf; i < stats.shelfSlots; i++) this.slots.push({ item: null, ...slotPos(i), showcase: false, incoming: false, claimedBy: null });
    for (let i = show; i < Math.min(MAX_SHOWCASE, stats.showcaseSlots); i++) this.slots.push({ item: null, ...showcasePos(i), showcase: true, incoming: false, claimedBy: null });
  }

  /** A free slot for this item: the showcase first if it deserves it, else the shelf. */
  freeSlotIndex(item?: ItemCode): number {
    const free = (s: Slot) => s.item === null && !s.incoming;
    if (item !== undefined && showcaseWorthy(item)) {
      const i = this.slots.findIndex((s) => s.showcase && free(s));
      if (i >= 0) return i;
    }
    return this.slots.findIndex((s) => !s.showcase && free(s));
  }

  /** How many more crafted items fit (free shelf slots + free storage). */
  capacity(): number {
    const freeSlots = this.slots.filter((s) => !s.showcase && s.item === null && !s.incoming).length;
    const incomingStorage = this.flyers.filter((f) => f.dest.kind === 'storage').length;
    const freeStorage = Math.max(0, this.stats.storageCap - this.storage.length - incomingStorage);
    return freeSlots + freeStorage;
  }

  hasItemOnShelf(): boolean {
    return this.slots.some((s) => s.item !== null);
  }

  /** Series collectors are waiting for (取り寄せ fetches them from storage first). */
  wantedSeries: () => number[] = () => [];

  /** Called when storage is full; returns true if it freed a place (the dismantler). */
  freeUp: () => boolean = () => false;

  /** True if a newly crafted item has somewhere to go (dismantling something if needed). */
  makeRoom(): boolean {
    return this.capacity() > 0 || (this.freeUp() && this.capacity() > 0);
  }

  private fly(item: ItemCode, from: { x: number; y: number }, slot: number, dur: number): void {
    const s = this.slots[slot];
    s.incoming = true;
    this.flyers.push({ item, fromX: from.x, fromY: from.y, toX: s.x, toY: s.y, t: 0, dur, dest: { kind: 'slot', index: slot } });
  }

  /** Sends a freshly crafted item from a station to a free slot, or to storage. */
  receive(item: number, from: { x: number; y: number }): void {
    const slot = this.freeSlotIndex(item);
    if (slot >= 0) this.fly(item, from, slot, CRAFT_FLIGHT);
    else this.flyers.push({ item, fromX: from.x, fromY: from.y, toX: STORAGE_POS.x, toY: STORAGE_POS.y, t: 0, dur: CRAFT_FLIGHT, dest: { kind: 'storage' } });
  }

  /** Puts an item back on a free slot, else into storage. Returns false if there is no room. */
  returnItem(item: number): boolean {
    const slot = this.freeSlotIndex(item);
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

  /**
   * Takes the cheapest sellable item out of storage (for the market and the peddler). Items the
   * dismantler would break down are left for it, so gold dust keeps coming in.
   */
  takeCheapest(): ItemCode | null {
    let pick = -1;
    this.storage.forEach((code, i) => {
      if (this.forDismantler(code)) return;
      if (pick < 0 || itemValue(code) < itemValue(this.storage[pick])) pick = i;
    });
    return pick < 0 ? null : this.storage.splice(pick, 1)[0];
  }

  /** True if this item is left for the dismantler rather than sold off. */
  private forDismantler(code: ItemCode): boolean {
    const ext = itemExt(code);
    return ext.rarityIndex <= this.stats.dismantleRarity && itemEdition(code) === 0 && !ext.shin;
  }

  /** True if the market or the peddler has something to take. */
  hasSurplus(): boolean {
    return this.storage.some((code) => !this.forDismantler(code));
  }

  /** True if every shelf slot (not the showcase) is taken or about to be. */
  shelfFull(): boolean {
    return this.slots.every((s) => s.showcase || s.item !== null || s.incoming);
  }

  /** Lands arrived flyers, then restocks one empty slot from storage every restockTime seconds. */
  update(dt: number): void {
    this.restocked = false;
    for (const f of this.flyers) f.t += dt;
    const landed = this.flyers.filter((f) => f.t >= f.dur);
    this.flyers = this.flyers.filter((f) => f.t < f.dur);
    for (const f of landed) {
      if (f.dest.kind === 'slot') {
        const slot = this.slots[f.dest.index];
        slot.incoming = false;
        slot.item = f.item;
      } else if (f.dest.kind === 'storage') {
        this.storage.push(f.item);
      }
    }

    this.restockTimer = Math.min(this.restockTimer + dt, this.stats.restockTime);
    if (this.restockTimer < this.stats.restockTime) return;
    const dur = this.stats.packer > 0 ? RESTOCK_FLIGHT * 0.6 : RESTOCK_FLIGHT;
    // The showcase takes the best worthy item from storage, or from an unclaimed shelf slot.
    const showcase = this.slots.findIndex((s) => s.showcase && s.item === null && !s.incoming);
    if (showcase >= 0) {
      let best = -1;
      this.storage.forEach((code, i) => showcaseWorthy(code) && (best < 0 || itemValue(code) > itemValue(this.storage[best])) && (best = i));
      if (best >= 0) {
        this.fly(this.storage.splice(best, 1)[0], STORAGE_POS, showcase, dur);
        this.afterRestock();
        return;
      }
      const from = this.slots.findIndex((s) => !s.showcase && s.item !== null && s.claimedBy === null && showcaseWorthy(s.item));
      if (from >= 0) {
        const s = this.slots[from];
        const item = s.item!;
        s.item = null;
        this.fly(item, s, showcase, dur);
        this.afterRestock();
        return;
      }
    }
    if (this.storage.length === 0) return;
    if (this.stats.collectorFetch > 0 && this.fetchForCollectors(dur)) return;
    const slot = this.freeSlotIndex();
    if (slot < 0) return;
    // With the packer, the most valuable item in storage goes out first (and faster).
    let pick = 0;
    if (this.stats.packer > 0) this.storage.forEach((code, i) => itemValue(code) > itemValue(this.storage[pick]) && (pick = i));
    this.fly(this.storage.splice(pick, 1)[0], STORAGE_POS, slot, dur);
    this.afterRestock();
  }

  /**
   * 取り寄せ: an item of a series a collector is waiting for goes from storage to the shelf, on a
   * free slot or in place of an item nobody is after (which goes back to storage).
   */
  private fetchForCollectors(dur: number): boolean {
    const wanted = this.wantedSeries();
    if (!wanted.length) return false;
    const onShelf = (i: number) => this.slots.some((s) => s.item !== null && s.claimedBy === null && itemExt(s.item).seriesIndex === i);
    const pick = this.storage.findIndex((code) => wanted.includes(itemExt(code).seriesIndex) && !onShelf(itemExt(code).seriesIndex));
    if (pick < 0) return false;
    let slot = this.freeSlotIndex();
    if (slot < 0) {
      slot = this.slots.findIndex((s) => !s.showcase && !s.incoming && s.item !== null && s.claimedBy === null && !wanted.includes(itemExt(s.item).seriesIndex));
      if (slot < 0) return false;
      this.storage.push(this.slots[slot].item!);
      this.slots[slot].item = null;
    }
    const [code] = this.storage.splice(pick, 1);
    this.fly(code, STORAGE_POS, slot, dur);
    this.afterRestock();
    return true;
  }

  private afterRestock(): void {
    this.restockTimer = 0;
    this.restocked = true;
  }

  /** At closing: in-flight and held items go back to the shelf / storage; returns nothing lost. */
  closeOut(heldItems: number[]): void {
    const held = [...heldItems, ...this.flyers.filter((f) => f.dest.kind === 'slot' || f.dest.kind === 'storage').map((f) => f.item)];
    for (const f of this.flyers) if (f.dest.kind === 'slot') this.slots[f.dest.index].incoming = false;
    this.flyers = [];
    for (const item of held) this.returnItem(item);
  }
}
