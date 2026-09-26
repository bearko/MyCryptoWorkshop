import { describe, expect, it } from 'vitest';
import { seeded } from '../src/game/balance/autoplay';
import { series } from '../src/game/catalog';
import { makeItem } from '../src/game/items';
import { newSave } from '../src/game/save';
import { Shop, type ShopEvent } from '../src/game/shop';
import { computeStats } from '../src/game/stats';

/** A mid-game shop: many recipes, collectors often, full shelves of one series. */
function busyShop(extra: Record<string, number> = {}) {
  const save = newSave(0);
  save.day = 60;
  const levels: Record<string, number> = { ...save.levels, shelf: 5, conveyor: 1, storage: 4, collectors: 5, ad: 8, uncommon: 1, rare: 1, recipeBook: 1 };
  for (const s of series.slice(1, 60)) if (s.family !== 'beast') levels[`recipe_${s.key}`] = 1;
  save.levels = { ...levels, ...extra };
  save.shelf = Array(12).fill(makeItem(series[0].items[1].id, 0));
  return save;
}

function play(save: ReturnType<typeof busyShop>, seed: number) {
  const shop = new Shop(save, seeded(seed));
  // A productive workshop, as in the mid game (the shelves stay stocked).
  for (const line of shop.lines) line.stats = { ...line.stats, craftTime: 0.3 };
  const events: ShopEvent[] = [];
  shop.on((e) => events.push(e));
  while (!shop.over) shop.update(1 / 30);
  return { shop, events };
}

describe('a shop that flows', () => {
  it('品揃えの評判 at Lv 5: collectors always come for a series the shop has', () => {
    expect(computeStats({}).collectorStock).toBeCloseTo(0.4);
    expect(computeStats({ collectorStock: 5 }).collectorStock).toBeGreaterThanOrEqual(1);
    const { events } = play(busyShop({ collectorStock: 5 }), 4);
    const wanted = events.flatMap((e) => (e.type === 'special' && e.kind === 'collector' ? [e] : []));
    expect(wanted.length).toBeGreaterThan(0);
  });

  it('特注受付 and 代わりの品のご提案: collectors are served and nobody leaves empty-handed', () => {
    const lost = (extra: Record<string, number>) => {
      let n = 0;
      for (const seed of [1, 2, 3]) n += play(busyShop(extra), seed).events.filter((e) => e.type === 'lost' && e.reason === 'empty' && (e.special === 'collector' || e.special === 'order')).length;
      return n;
    };
    const before = lost({ collectorStock: 0 });
    const after = lost({ collectorStock: 0, bespoke: 1, alternative: 1 });
    expect(before).toBeGreaterThan(0);
    expect(after).toBe(0);
    const { events } = play(busyShop({ bespoke: 1 }), 5);
    expect(events.some((e) => e.type === 'bespoke')).toBe(true);
  });

  it('店舗拡張 lets more customers in; 安心の店内 keeps them from fleeing', () => {
    expect(computeStats({}).shopCapacity).toBe(24);
    expect(computeStats({ bigStore: 6 }).shopCapacity).toBe(48);
    expect(computeStats({ safeShop: 3 }).scareChance).toBeLessThan(0.05);
    expect(computeStats({ bustling: 10 }).spawnInterval).toBeLessThan(computeStats({}).spawnInterval);
  });
});
