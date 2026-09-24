import { describe, expect, it } from 'vitest';
import { ACHIEVEMENTS, checkAchievements, DAILY_BONUS, rollDailies, settleDailies } from '../src/game/achievements';
import { seeded } from '../src/game/balance/autoplay';
import { customers, series } from '../src/game/catalog';
import { affinityRank, grantSets, HERO_SETS } from '../src/game/heroes';
import { favoriteSeries, placeOrders, type Order } from '../src/game/orders';
import { buy } from '../src/game/purchase';
import { migrate, newSave, parseSave, SAVE_VERSION, type SaveData } from '../src/game/save';
import { Shop } from '../src/game/shop';
import { isAvailable, skillById, SKILLS, TREE_NODES } from '../src/game/skills';
import { computeStats } from '../src/game/stats';

function saveWith(levels: Record<string, number>, patch: Partial<SaveData> = {}): SaveData {
  const save = newSave();
  Object.assign(save.levels, levels);
  return Object.assign(save, patch);
}

describe('all series', () => {
  it('uses every complete series, each with Common → Legendary and a family', () => {
    expect(series.length).toBeGreaterThanOrEqual(170);
    for (const s of series) {
      expect(s.items.map((i) => i.rarityIndex)).toEqual([0, 1, 2, 3, 4]);
      expect(['arcane', 'arms', 'beast']).toContain(s.family);
    }
  });

  it('beast recipes also need the capsule line', () => {
    const beast = series.find((s, i) => s.family === 'beast' && i > 20)!;
    const node = skillById.get(`recipe_${beast.key}`)!;
    expect(node.requiresAll).toContain('capsuleLine');
    const levels = Object.fromEntries(node.requires.map((r) => [r, 1]));
    expect(isAvailable(node, levels)).toBe(false);
    expect(isAvailable(node, { ...levels, capsuleLine: 1 })).toBe(true);
  });

  it('量産 makes a series come up more often', () => {
    const katana = series.findIndex((s) => s.key === 'Katana');
    // Katana crafts over a few days (the pot makes five series here, all weight 1 by default).
    const count = (levels: Record<string, number>) => {
      let k = 0;
      for (let seed = 1; seed <= 6; seed++) {
        const shop = new Shop(saveWith({ recipeBook: 1, recipe_Musket: 1, recipe_Quill: 1, recipe_Armor: 1, recipe_Katana: 1, shelf: 9, conveyor: 1, storage: 8, ...levels }), seeded(seed));
        shop.on((e) => {
          if (e.type === 'craft' && series.findIndex((s) => s.items.some((i) => i.id === e.item % 100000)) === katana) k++;
        });
        for (let i = 0; i < 30 * 120 && !shop.over; i++) shop.update(1 / 30);
      }
      return k;
    };
    expect(count({ planning: 1, mass_Katana: 5 })).toBeGreaterThan(count({}) * 2);
  });

  it('the tree has at least 1000 nodes; set rewards stay hidden', () => {
    expect(TREE_NODES.length).toBeGreaterThanOrEqual(1000);
    const hidden = SKILLS.filter((n) => n.hidden);
    expect(hidden.length).toBe(HERO_SETS.length);
    for (const n of hidden) expect(isAvailable(n, { root: 1 })).toBe(false);
  });
});

describe('save v6', () => {
  it('migrates a v5 save with an empty hero book, orders, achievements and emblems', () => {
    const v5 = { ...newSave(), version: 5, resources: { dust: 3, gems: newSave().resources.gems, research: 2 } } as Record<string, unknown>;
    for (const k of ['heroes', 'orders', 'achievements', 'dailies']) delete v5[k];
    const data = parseSave(JSON.stringify(v5));
    expect(data.version).toBe(SAVE_VERSION);
    expect(data.heroes).toEqual({});
    expect(data.orders).toEqual([]);
    expect(data.achievements).toEqual([]);
    expect(data.resources).toMatchObject({ dust: 3, research: 2, emblem: 0 });
    expect(migrate({ version: 5, resources: {} }).version).toBe(SAVE_VERSION);
  });
});

describe('hero collection', () => {
  it('records heroes who buy something', () => {
    const save = saveWith({}, { shelf: Array.from({ length: 3 }, () => series[0].items[0].id) });
    const shop = new Shop(save, seeded(2));
    for (let i = 0; i < 30 * 60 && !shop.over; i++) shop.update(1 / 30);
    const visits = Object.values(save.heroes).reduce((a, b) => a + b, 0);
    expect(visits).toBe(shop.report.sold);
    expect(shop.report.newHeroes.length).toBe(Object.keys(save.heroes).length);
  });

  it('affinity ranks follow visit counts', () => {
    expect([0, 4, 5, 19, 20, 49, 50].map(affinityRank)).toEqual([0, 0, 1, 1, 2, 2, 3]);
  });

  it('a set completes once every hero in it has bought something, and raises prices', () => {
    const set = HERO_SETS.find((s) => s.kind === 'attribute')!;
    const save = newSave();
    for (const h of set.heroes.slice(1)) save.heroes[h.id] = 1;
    expect(grantSets(save)).toEqual([]);
    save.heroes[set.heroes[0].id] = 1;
    expect(grantSets(save).map((s) => s.id)).toContain(set.id);
    expect(computeStats(save.levels).priceMult).toBeGreaterThan(computeStats(newSave().levels).priceMult);
  });
});

describe('orders', () => {
  it('heroes order a favourite series among the unlocked ones', () => {
    const hero = customers.find((c) => c.attributes?.includes('三国志'))!;
    const all = series.map((_, i) => i);
    const fav = favoriteSeries(hero, all).map((i) => series[i].key);
    expect(fav).toEqual(expect.arrayContaining(['Halberd']));
    expect(favoriteSeries(hero, [0])).toEqual([]);
  });

  it('the order book fills up to the number of slots', () => {
    const stats = computeStats({ root: 1, orders: 1, orderSlots: 2, ...Object.fromEntries(series.map((s) => [`recipe_${s.key}`, 1])), capsuleLine: 1, uncommon: 1, rare: 1 });
    let id = 0;
    const book = placeOrders([], stats, seeded(1), () => ++id);
    expect(book.length).toBe(3);
    for (const o of book) expect(stats.seriesUnlocked).toContain(o.series);
  });

  it('an ordering customer pays the order premium for the right item, and the order is filled', () => {
    const katana = series.findIndex((s) => s.key === 'Katana');
    const hero = customers.find((c) => c.rarityIndex === 0)!;
    const order: Order = { id: 1, heroId: hero.id, series: katana, minRarity: 0, days: 2 };
    const item = series[katana].items[0].id;
    const save = saveWith({ orders: 1, recipeBook: 1, recipe_Musket: 1, recipe_Quill: 1, recipe_Armor: 1, recipe_Katana: 1 }, { orders: [order], shelf: [item, item, item] });
    const shop = new Shop(save, seeded(4));
    const done: number[] = [];
    shop.on((e) => e.type === 'orderDone' && done.push(e.price));
    for (let i = 0; i < 30 * 60 && !shop.over && !done.length; i++) {
      const d = shop.pendingDecision;
      if (d) shop.decide(d.fallback);
      shop.update(1 / 30);
    }
    expect(done.length).toBe(1);
    expect(save.orders.some((o) => o.id === 1)).toBe(false);
    // One purchase plus the +3 affinity for filling the order (they may also have shopped before).
    expect(save.heroes[hero.id]).toBeGreaterThanOrEqual(4);
  });
});

describe('achievements and daily requests', () => {
  it('pays emblems once per achievement', () => {
    const save = newSave();
    save.totals.sold = 150;
    const got = checkAchievements(save);
    const sold = ACHIEVEMENTS.find((a) => a.id === 'sold1')!;
    expect(got).toContain(sold);
    expect(save.resources.emblem).toBeGreaterThanOrEqual(sold.emblem);
    const again = checkAchievements(save);
    expect(again).not.toContain(sold);
  });

  it('daily requests start on day 3 and pay per request, plus a bonus for all three', () => {
    const shop = new Shop(saveWith({}, { day: 2 }), seeded(1));
    expect(rollDailies(shop.save, shop.stats, shop.report, seeded(1))).toEqual([]);
    const save = saveWith({}, { day: 8 });
    const report = new Shop(save, seeded(1)).report;
    save.dailies = rollDailies(save, computeStats(save.levels), report, seeded(2));
    expect(save.dailies.length).toBe(3);
    // A report that beats everything
    Object.assign(report, { sold: 1e6, rareSold: 1e6, caught: 1e6, pests: 1e6, revenue: 1e12, chests: 99, ordersDone: 9, guests: 1e6 });
    expect(settleDailies(save, report)).toBe(3 + DAILY_BONUS);
    expect(save.resources.emblem).toBe(3 + DAILY_BONUS);
  });
});

describe('clear', () => {
  it('the golden extension clears the game', () => {
    const node = skillById.get('goldenExtension')!;
    const save = saveWith({ legendary: 1 }, { gum: node.baseCost });
    expect(buy(save, node)).toBe(true);
    expect(computeStats(save.levels).cleared).toBe(1);
  });
});
