import { describe, expect, it } from 'vitest';
import { seeded } from '../src/game/balance/autoplay';
import { lands, series } from '../src/game/catalog';
import { cpForRun, relocate, START_GUM } from '../src/game/prestige';
import { autoBuy } from '../src/game/purchase';
import { migrate, newSave, parseSave, SAVE_VERSION, type SaveData } from '../src/game/save';
import { Shop, type ShopEvent } from '../src/game/shop';
import { raidSize } from '../src/game/shop/raid';
import { skillById, TREE_NODES } from '../src/game/skills';
import { computeStats } from '../src/game/stats';

function saveWith(levels: Record<string, number>, patch: Partial<SaveData> = {}): SaveData {
  const save = newSave();
  Object.assign(save.levels, levels);
  return Object.assign(save, patch);
}

/** A save that has just cleared, with `revenue` GUM earned this run. */
function cleared(revenue: number, levels: Record<string, number> = {}): SaveData {
  const save = saveWith({ legendary: 1, goldenExtension: 1, ...levels }, { gum: 5e9, day: 150 });
  save.totals.revenue = revenue;
  return save;
}

describe('save v7', () => {
  it('migrates a v6 save with a fresh prestige record and the auto-buy setting', () => {
    const v6 = { ...newSave(), version: 6, settings: { bgm: false, se: true } } as Record<string, unknown>;
    delete v6.prestige;
    const data = parseSave(JSON.stringify(v6));
    expect(data.version).toBe(SAVE_VERSION);
    expect(data.prestige).toMatchObject({ runs: 0, cp: 0, home: null, fame: 0, history: [] });
    expect(data.settings).toMatchObject({ bgm: false, se: true, autoBuy: true, quality: 'auto', colorAssist: false, alerts: false });
    expect(migrate({ version: 6 }).version).toBe(SAVE_VERSION);
  });
});

describe('ランド移転', () => {
  it('pays Cp only after the clear: √(revenue / 10億), more with fame', () => {
    const save = cleared(1e11);
    expect(cpForRun(save)).toBe(10);
    save.prestige.fame = 2500;
    expect(cpForRun(save)).toBe(20);
    delete save.levels.goldenExtension;
    expect(cpForRun(save)).toBe(0);
  });

  it('keeps the collection, honors and Cp skills; resets GUM, days and the rest of the tree', () => {
    const save = cleared(1e11, { honorHub: 1, oldShop: 3, recipe_Katana: 1, tier2: 1 });
    save.collection = [series[0].items[0].id];
    save.resources.emblem = 7;
    save.resources.dust = 50;
    save.meta.playSeconds = 3600;
    const record = relocate(save, 'Strawberry');
    expect(record).toMatchObject({ run: 1, land: null, days: 149, cp: 10, revenue: 1e11 });
    expect(save.prestige).toMatchObject({ runs: 1, cp: 10, home: 'Strawberry', fame: 0, runStartSeconds: 3600, runStartRevenue: 1e11 });
    expect(save.levels.oldShop).toBe(3);
    expect(save.levels.honorHub).toBe(1);
    expect(save.levels.recipe_Katana).toBeUndefined();
    expect(save.levels.tier2).toBeUndefined();
    expect(save.levels.goldenExtension).toBeUndefined();
    expect(save.levels.bless_Strawberry).toBe(1);
    expect(save).toMatchObject({ day: 1, gum: 0, shelf: [], storage: [] });
    expect(save.collection.length).toBe(1);
    expect(save.resources).toMatchObject({ emblem: 7, dust: 0, research: 0 });
    expect(computeStats(save.levels).cleared).toBe(0);
  });

  it('blessings stack per move and are kept', () => {
    const base = computeStats({ root: 1 }).priceMult;
    const save = cleared(1e10);
    relocate(save, 'Strawberry');
    const once = computeStats(save.levels).priceMult;
    expect(once).toBeGreaterThan(base);
    save.levels.goldenExtension = 1;
    relocate(save, 'Strawberry');
    expect(save.levels.bless_Strawberry).toBe(2);
    expect(computeStats(save.levels).priceMult).toBeGreaterThan(once);
    for (const land of lands) expect(skillById.get(`bless_${land.key}`)?.hidden).toBe(true);
  });

  it('移転資金 and 引き継ぎのレシピ帳 give the next run a head start', () => {
    const save = cleared(1e10, { relocation: 1, startGum: 2, keepRecipes: 1 });
    relocate(save, 'Ocean');
    expect(save.gum).toBe(START_GUM[2]);
    expect(save.levels.recipeBook).toBe(1);
    const recipes = Object.keys(save.levels).filter((id) => id.startsWith('recipe_'));
    expect(recipes.length).toBe(5);
    expect(computeStats(save.levels).seriesUnlocked.length).toBeGreaterThan(computeStats({ root: 1 }).seriesUnlocked.length);
  });

  it('the 移転 branch is paid in Cp and sits in the tree', () => {
    const nodes = TREE_NODES.filter((n) => n.branch === 'prestige');
    expect(nodes.length).toBeGreaterThanOrEqual(13);
    for (const n of nodes) expect(n.currency).toBe('cp');
  });
});

/** Runs a day, tapping every raid pirate if `defend`. */
function runDay(save: SaveData, seed: number, defend: boolean): { shop: Shop; events: ShopEvent[] } {
  const shop = new Shop(save, seeded(seed));
  const events: ShopEvent[] = [];
  shop.on((e) => events.push(e));
  for (let i = 0; i < 30 * 300 && !shop.over; i++) {
    const d = shop.pendingDecision;
    if (d) shop.decide(d.kind === 'mai' ? 1 : d.fallback);
    shop.update(1 / 30);
    if (defend) for (const a of shop.actors) if (a.raider && a.state !== 'caught' && !a.gone) shop.clickThief(a);
  }
  return { shop, events };
}

describe('レイド', () => {
  const fullShelf = () => Array.from({ length: 12 }, () => series[0].items[2].id);

  it('never comes in the first run', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const { events } = runDay(saveWith({}, { day: 20, shelf: fullShelf() }), seed, false);
      expect(events.some((e) => e.type === 'raidWarn')).toBe(false);
    }
  });

  it('from the second run, pirates storm in after a warning; catching them all pays emblems', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const save = saveWith({}, { day: 20, shelf: fullShelf() });
      save.prestige.runs = 1;
      const { shop, events } = runDay(save, seed, true);
      const warn = events.findIndex((e) => e.type === 'raidWarn');
      if (warn < 0) continue;
      const kinds = events.map((e) => e.type);
      expect(kinds.indexOf('raidStart')).toBeGreaterThan(warn);
      const raid = shop.report.raid!;
      expect(raid.pirates).toBe(raidSize(20));
      expect(raid.caught).toBe(raid.pirates);
      expect(raid.won).toBe(true);
      expect(raid.reward).toBeGreaterThan(0);
      expect(save.resources.emblem).toBeGreaterThanOrEqual(2);
      expect(shop.report.extras.raid).toBe(raid.reward);
      return;
    }
    throw new Error('no raid in 40 days');
  });

  it('pirates left alone are settled at closing as a loss', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const save = saveWith({}, { day: 20, shelf: fullShelf() });
      save.prestige.runs = 1;
      const { shop } = runDay(save, seed, false);
      const raid = shop.report.raid;
      if (!raid) continue;
      expect(raid.won).toBe(false);
      expect(raid.caught).toBeLessThan(raid.pirates);
      return;
    }
    throw new Error('no raid in 40 days');
  });
});

describe('寄付係', () => {
  it('donates the cheapest items in storage at closing for fame', () => {
    const cheap = series[0].items[0].id;
    const rare = series[0].items[3].id;
    const save = saveWith({ hire_charity: 1 }, { day: 5, shelf: Array.from({ length: 12 }, () => rare), storage: [rare, cheap, cheap, rare, cheap] });
    const { shop, events } = runDay(save, 3, false);
    expect(shop.report.donated).toBeGreaterThan(0);
    expect(shop.report.donated).toBeLessThanOrEqual(computeStats(save.levels).charityLoad);
    expect(save.prestige.fame).toBe(shop.report.fame);
    expect(shop.report.fame).toBeGreaterThan(0);
    expect(events.some((e) => e.type === 'donate')).toBe(true);
  });

  it('needs 寄付の心得 (a Cp skill) before it can be hired', () => {
    const hire = skillById.get('hire_charity')!;
    expect(hire.requiresAll).toContain('charityUnlock');
  });
});

describe('番頭 (auto-buyer)', () => {
  it('buys GUM skills cheapest first after a day, only when learned and switched on', () => {
    const save = saveWith({}, { gum: 5000 });
    expect(autoBuy(save)).toEqual([]);
    save.levels.autoBuyer = 1;
    save.settings.autoBuy = false;
    expect(autoBuy(save)).toEqual([]);
    save.settings.autoBuy = true;
    const bought = autoBuy(save);
    expect(bought.length).toBeGreaterThan(0);
    expect(bought.every((n) => (n.currency ?? 'gum') === 'gum')).toBe(true);
    expect(save.gum).toBeLessThan(5000);
  });

  it('never makes the golden extension on its own', () => {
    const save = saveWith({ autoBuyer: 1, legendary: 1 }, { gum: skillById.get('goldenExtension')!.baseCost * 10 });
    autoBuy(save, 50);
    expect(save.levels.goldenExtension).toBeUndefined();
  });
});
