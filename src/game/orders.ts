import content from './content.json';
import { customers, customersByTier, RARITY_JA, RARITIES, series, type Hero } from './catalog';
import type { Stats } from './stats';

/**
 * Orders (注文): a hero asks for their ゆかりの品 — a series tied to one of their attributes
 * (三国志 → ハルバード, 音楽 → ヴァイオリン, …) at a minimum rarity. The order is placed the evening
 * before; the hero comes in during the next business day and pays a premium if it is on the
 * shelf. Unfilled orders wait a second day, then lapse.
 */
export interface Order {
  id: number;
  heroId: number;
  /** Series index wanted. */
  series: number;
  /** Lowest acceptable rarity index. */
  minRarity: number;
  /** Business days left (including the next one). */
  days: number;
}

const FAVORITES = content.favorites as unknown as Record<string, string[]>;
const seriesIndex = new Map(series.map((s, i) => [s.key, i]));

/** Series a hero would order, among the unlocked ones (their attributes' favourites). */
export function favoriteSeries(hero: Hero, unlocked: number[]): number[] {
  const keys = (hero.attributes ?? []).flatMap((a) => FAVORITES[a] ?? []);
  const idx = [...new Set(keys.map((k) => seriesIndex.get(k)).filter((i): i is number => i !== undefined))];
  return idx.filter((i) => unlocked.includes(i));
}

export const orderHero = (o: Order): Hero => customers.find((c) => c.id === o.heroId)!;

/** "Rare 以上のカタナ" */
export function orderLabel(o: Order): string {
  return `${RARITY_JA[RARITIES[o.minRarity]]}${o.minRarity < 4 ? ' 以上' : ''}の${series[o.series].name}`;
}

export function orderMatches(o: Order, ext: { seriesIndex: number; rarityIndex: number }): boolean {
  return ext.seriesIndex === o.series && ext.rarityIndex >= o.minRarity;
}

/** Tops the order book up to stats.orderSlots with new orders from customers who can visit. */
export function placeOrders(orders: Order[], stats: Stats, rand: () => number, nextId: () => number): Order[] {
  const book = orders.filter((o) => o.days > 0);
  const pick = <T>(list: T[]) => list[Math.floor(rand() * list.length)];
  for (let tries = 0; book.length < stats.orderSlots && tries < 20; tries++) {
    const tier = Math.floor(rand() * (stats.maxTier + 1));
    const hero = pick(customersByTier[tier]);
    if (!hero || book.some((o) => o.heroId === hero.id)) continue;
    const fav = favoriteSeries(hero, stats.seriesUnlocked);
    if (!fav.length) continue;
    const minRarity = Math.max(0, stats.maxRarity - 1 - Math.floor(rand() * 2));
    book.push({ id: nextId(), heroId: hero.id, series: pick(fav), minRarity, days: 2 });
  }
  return book;
}
