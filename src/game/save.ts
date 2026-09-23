import { extensionById } from './catalog';
import type { Levels } from './skills';

export interface Totals {
  revenue: number;
  sold: number;
  customers: number;
  lost: number;
  stolen: number;
  caught: number;
  pests: number;
  crafted: number;
}

export interface SaveData {
  version: 1;
  gum: number;
  day: number;
  levels: Levels;
  /** Extension ids crafted at least once. */
  collection: number[];
  /** Shelf contents carried over between days (null = empty slot). */
  shelf: (number | null)[];
  storage: number[];
  totals: Totals;
  bestDayRevenue: number;
  settings: { bgm: boolean; se: boolean };
  tips: string[];
}

export const emptyTotals = (): Totals => ({
  revenue: 0,
  sold: 0,
  customers: 0,
  lost: 0,
  stolen: 0,
  caught: 0,
  pests: 0,
  crafted: 0,
});

export function newSave(): SaveData {
  return {
    version: 1,
    gum: 0,
    day: 1,
    levels: { root: 1 },
    collection: [],
    shelf: [],
    storage: [],
    totals: emptyTotals(),
    bestDayRevenue: 0,
    settings: { bgm: true, se: true },
    tips: [],
  };
}

const KEY = 'mycryptoworkshop.save.v1';

export function loadSave(): SaveData {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return newSave();
    const data = { ...newSave(), ...JSON.parse(raw) } as SaveData;
    // Drop ids that no longer exist in the catalog (e.g. after an asset update).
    const known = (id: number | null) => id === null || extensionById.has(id);
    data.collection = data.collection.filter((id) => extensionById.has(id));
    data.shelf = data.shelf.map((id) => (known(id) ? id : null));
    data.storage = data.storage.filter((id) => extensionById.has(id));
    data.totals = { ...emptyTotals(), ...data.totals };
    return data;
  } catch {
    return newSave();
  }
}

export function writeSave(data: SaveData): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch {
    // Storage may be unavailable (private mode); the game keeps running without saving.
  }
}

export function clearSave(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // ignore
  }
}
