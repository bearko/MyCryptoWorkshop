import { POT, slotPos, STORAGE_POS } from '../layout';
import type { SaveData } from '../save';
import type { Stats } from '../stats';
import type { Flyer, Slot } from './types';

const CRAFT_FLIGHT = 0.75;
const RESTOCK_FLIGHT = 0.6;

/** Shelf slots, back-room storage, and items flying between them. */
export class Stock {
  readonly slots: Slot[];
  storage: number[];
  flyers: Flyer[] = [];

  constructor(
    save: SaveData,
    private readonly stats: Stats,
  ) {
    this.slots = Array.from({ length: stats.shelfSlots }, (_, i) => ({
      item: save.shelf[i] ?? null,
      incoming: false,
      claimedBy: null,
    }));
    // Items that no longer fit on the shelf go to storage.
    const overflow = save.shelf.slice(stats.shelfSlots).filter((x): x is number => x !== null);
    this.storage = [...save.storage, ...overflow];
  }

  freeSlotIndex(): number {
    return this.slots.findIndex((s) => s.item === null && !s.incoming);
  }

  /** How many more crafted items fit (free shelf slots + free storage). */
  capacity(): number {
    const freeSlots = this.slots.filter((s) => s.item === null && !s.incoming).length;
    const incomingStorage = this.flyers.filter((f) => f.dest.kind === 'storage').length;
    const freeStorage = Math.max(0, this.stats.storageCap - this.storage.length - incomingStorage);
    return freeSlots + freeStorage;
  }

  hasItemOnShelf(): boolean {
    return this.slots.some((s) => s.item !== null);
  }

  /** Sends a freshly crafted item from the pot to a free slot, or to storage. */
  sendFromPot(item: number): void {
    const slot = this.freeSlotIndex();
    const from = { x: POT.x, y: POT.mouthY };
    if (slot >= 0) {
      this.slots[slot].incoming = true;
      const to = slotPos(slot);
      this.flyers.push({ item, fromX: from.x, fromY: from.y, toX: to.x, toY: to.y, t: 0, dur: CRAFT_FLIGHT, dest: { kind: 'slot', index: slot } });
    } else {
      this.flyers.push({ item, fromX: from.x, fromY: from.y, toX: STORAGE_POS.x, toY: STORAGE_POS.y, t: 0, dur: CRAFT_FLIGHT, dest: { kind: 'storage' } });
    }
  }

  /** Puts an item back on a free slot, else into storage. Returns false if there is no room. */
  returnItem(item: number): boolean {
    const slot = this.freeSlotIndex();
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

  /** Lands arrived flyers, then restocks empty slots from storage. */
  update(dt: number): void {
    for (const f of this.flyers) f.t += dt;
    const landed = this.flyers.filter((f) => f.t >= f.dur);
    this.flyers = this.flyers.filter((f) => f.t < f.dur);
    for (const f of landed) {
      if (f.dest.kind === 'slot') {
        const slot = this.slots[f.dest.index];
        slot.incoming = false;
        slot.item = f.item;
      } else {
        this.storage.push(f.item);
      }
    }
    while (this.storage.length > 0) {
      const slot = this.freeSlotIndex();
      if (slot < 0) return;
      const item = this.storage.shift()!;
      this.slots[slot].incoming = true;
      const to = slotPos(slot);
      this.flyers.push({ item, fromX: STORAGE_POS.x, fromY: STORAGE_POS.y, toX: to.x, toY: to.y, t: 0, dur: RESTOCK_FLIGHT, dest: { kind: 'slot', index: slot } });
    }
  }

  /** At closing: in-flight and held items go back to the shelf / storage; returns nothing lost. */
  closeOut(heldItems: number[]): void {
    const held = [...heldItems, ...this.flyers.map((f) => f.item)];
    for (const f of this.flyers) if (f.dest.kind === 'slot') this.slots[f.dest.index].incoming = false;
    this.flyers = [];
    for (const item of held) this.returnItem(item);
  }
}
