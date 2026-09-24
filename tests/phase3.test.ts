import { describe, expect, it } from 'vitest';
import { seeded } from '../src/game/balance/autoplay';
import { series, staffHeroes } from '../src/game/catalog';
import { makeItem } from '../src/game/items';
import { buy } from '../src/game/purchase';
import { migrate, newSave, parseSave, SAVE_VERSION, type SaveData } from '../src/game/save';
import { Shop, type ShopEvent } from '../src/game/shop';
import { showcaseWorthy } from '../src/game/shop/stock';
import { SKILLS, skillById } from '../src/game/skills';
import { STAFF_ROLES } from '../src/game/staff';

const blade = series.find((s) => s.key === 'Blade')!;
const common = blade.items[0].id;
const rare = blade.items[2].id;

function saveWith(levels: Record<string, number>, patch: Partial<SaveData> = {}): SaveData {
  const save = newSave();
  Object.assign(save.levels, levels);
  return Object.assign(save, patch);
}

/** Runs a shop for `seconds` (or until closing) and collects its events. */
function run(shop: Shop, seconds: number): ShopEvent[] {
  const events: ShopEvent[] = [];
  shop.on((e) => events.push(e));
  for (let t = 0; t < seconds && !shop.over; t += 1 / 30) shop.update(1 / 30);
  return events;
}

describe('save v4', () => {
  it('migrates a v3 save by adding research points and an empty showcase', () => {
    const v3 = { ...newSave(), version: 3, resources: { dust: 7, gems: newSave().resources.gems } } as Record<string, unknown>;
    delete v3.showcase;
    const data = parseSave(JSON.stringify(v3));
    expect(data.version).toBe(SAVE_VERSION);
    expect(data.resources.research).toBe(0);
    expect(data.resources.dust).toBe(7);
    expect(data.showcase).toEqual([]);
    expect(migrate({ version: 3, resources: {} }).version).toBe(SAVE_VERSION);
  });
});

describe('skill tree (phase 3)', () => {
  it('research nodes cost research points, not GUM', () => {
    const lab = skillById.get('lab')!;
    expect(lab.currency).toBe('research');
    const save = saveWith({ hire_researcher: 1 }, { gum: 1e9 });
    save.resources.research = 0;
    expect(buy(save, lab)).toBe(false);
    save.resources.research = lab.baseCost;
    expect(buy(save, lab)).toBe(true);
    expect(save.resources.research).toBe(0);
    expect(save.gum).toBe(1e9);
  });

  it('every staff role can be hired and has an ace', () => {
    for (const role of STAFF_ROLES) {
      expect(skillById.get(`hire_${role}`), role).toBeDefined();
      expect(skillById.get(`ace_${role}`), role).toBeDefined();
      expect(staffHeroes[role].hero.id).not.toBe(staffHeroes[role].ace.id);
    }
    expect(SKILLS.length).toBeGreaterThanOrEqual(170);
  });
});

describe('staff', () => {
  it('hired staff are on duty, and an ace replaces the first hire', () => {
    const shop = new Shop(saveWith({ hire_stocker: 1, hire_host: 1, ace_host: 1 }), seeded(1));
    const byRole = Object.fromEntries(shop.staffMembers.map((m) => [m.role, m]));
    expect(Object.keys(byRole).sort()).toEqual(['host', 'stocker']);
    expect(byRole.stocker.hero.id).toBe(staffHeroes.stocker.hero.id);
    expect(byRole.host.hero.id).toBe(staffHeroes.host.ace.id);
    expect(byRole.host.ace).toBe(true);
  });

  it('the guard runs down a thief without any taps', () => {
    const shop = new Shop(saveWith({ hire_guard: 1 }, { day: 5, shelf: [rare, rare, rare] }), seeded(4));
    shop.thieves.spawn();
    const events = run(shop, 20);
    const caught = events.find((e) => e.type === 'caught');
    expect(caught && caught.type === 'caught' && caught.guard).toBe(staffHeroes.guard.hero.name);
  });

  it('the exterminator clears pests in the workshop', () => {
    const shop = new Shop(saveWith({ hire_exterminator: 1 }, { day: 8 }), seeded(2));
    const events = run(shop, 60);
    expect(events.some((e) => e.type === 'pestCleared')).toBe(true);
  });

  it('the researcher earns research points', () => {
    const save = saveWith({ hire_researcher: 1, lab: 1 });
    const shop = new Shop(save, seeded(3));
    run(shop, 60);
    expect(shop.report.research).toBeGreaterThanOrEqual(1);
    expect(save.resources.research).toBe(shop.report.research);
  });

  it('the peddler sells stock from storage and brings the money back', () => {
    const storage = Array.from({ length: 6 }, () => common);
    const shop = new Shop(saveWith({ hire_peddler: 1, conveyor: 1, storage: 1 }, { storage }), seeded(5));
    run(shop, 200);
    expect(shop.report.extras.peddler).toBeGreaterThan(0);
  });

  it('the accountant adds a closing bonus', () => {
    const shop = new Shop(saveWith({ hire_accountant: 1 }, { shelf: [common, common, common] }), seeded(6));
    run(shop, 200);
    expect(shop.over).toBe(true);
    expect(shop.report.extras.bonus).toBeGreaterThan(0);
  });
});

describe('facilities and sales', () => {
  it('valuable items go to the showcase, plain commons to the shelf', () => {
    expect(showcaseWorthy(rare)).toBe(true);
    expect(showcaseWorthy(common)).toBe(false);
    expect(showcaseWorthy(makeItem(common, 1))).toBe(true);
    const shop = new Shop(saveWith({ showcase: 2 }), seeded(1));
    const stock = shop.stock;
    expect(stock.slots.filter((s) => s.showcase)).toHaveLength(2);
    expect(stock.slots[stock.freeSlotIndex(rare)].showcase).toBe(true);
    expect(stock.slots[stock.freeSlotIndex(common)].showcase).toBe(false);
  });

  it('the showcase is saved separately from the shelf', () => {
    const save = saveWith({ showcase: 1 }, { showcase: [rare] });
    const shop = new Shop(save, seeded(1));
    expect(shop.stock.slots.find((s) => s.showcase)!.item).toBe(rare);
    run(shop, 200);
    expect(save.showcase.length).toBe(1);
    expect(save.shelf.length).toBe(shop.shelfSlots);
  });

  it('the market sells surplus while the shelf is full', () => {
    const shelf = [common, common, common];
    const storage = Array.from({ length: 4 }, () => common);
    const shop = new Shop(saveWith({ market: 1, conveyor: 1 }, { shelf, storage }), seeded(7));
    run(shop, 30);
    expect(shop.report.extras.market).toBeGreaterThan(0);
  });

  it('self-checkout machines add lanes', () => {
    const shop = new Shop(saveWith({ register: 1, autoRegister: 2 }), seeded(1));
    expect(shop.register.progress).toHaveLength(4);
    expect(shop.register.laneTime(3)).toBeGreaterThan(shop.register.laneTime(0));
  });

  it('the potion bar and the trial area earn extra from customers who bought something', () => {
    const shelf = Array.from({ length: 3 }, () => rare);
    const shop = new Shop(saveWith({ potionBar: 5, trial: 5 }, { shelf }), seeded(8));
    // Every customer drinks.
    (shop.stats as { barChance: number }).barChance = 1;
    run(shop, 200);
    expect(shop.report.extras.bar).toBeGreaterThan(0);
  });
});
