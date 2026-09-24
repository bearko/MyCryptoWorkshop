import { FAMILIES, getExtension, type Extension } from './catalog';

/**
 * An item on the shelf, in storage or in a customer's hands is one number:
 *   code = edition × 100000 + extension id
 * Plain extension ids (edition 0) are therefore valid codes, so older saves need no conversion.
 */
export type ItemCode = number;

export interface Edition {
  name: string;
  /** Sale price multiplier. */
  mult: number;
  color: string;
}

/** Editions from plain to golden. Index = edition number. */
export const EDITIONS: Edition[] = [
  { name: '', mult: 1, color: '' },
  { name: '鑑定済み', mult: 1.6, color: '#9be7ff' },
  { name: '刻印入り', mult: 3, color: '#c77dff' },
  { name: 'サイン入り', mult: 6, color: '#ffd166' },
  { name: '黄金', mult: 15, color: '#ffcf33' },
];

/** Base chance per craft of each edition (before luck), for editions 1..4. */
export const EDITION_BASE_CHANCE = [0, 0.08, 0.025, 0.008, 0.002];

/** "真" Legendaries sell for this many times a normal Legendary. */
export const SHIN_MULT = 4;

/** Base sale price per rarity (Common → Legendary). */
export const RARITY_PRICE = [5, 15, 50, 170, 600];

const EDITION_STRIDE = 100000;

export const makeItem = (id: number, edition = 0): ItemCode => edition * EDITION_STRIDE + id;
export const itemId = (code: ItemCode): number => code % EDITION_STRIDE;
export const itemEdition = (code: ItemCode): number => Math.floor(code / EDITION_STRIDE);
export const itemExt = (code: ItemCode): Extension => getExtension(itemId(code));

/** Base value before shop-wide multipliers: rarity × family × edition × 真. */
export function itemValue(code: ItemCode): number {
  const ext = itemExt(code);
  return RARITY_PRICE[ext.rarityIndex] * FAMILIES[ext.family].priceMult * EDITIONS[itemEdition(code)].mult * (ext.shin ? SHIN_MULT : 1);
}

/** Display name, e.g. "【刻印入り】ブレイブブレード". */
export function itemName(code: ItemCode): string {
  const ed = EDITIONS[itemEdition(code)];
  return (ed.name ? `【${ed.name}】` : '') + itemExt(code).name;
}
