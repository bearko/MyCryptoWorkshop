import { describe, expect, it } from 'vitest';
import { seeded } from '../src/game/balance/autoplay';
import { series } from '../src/game/catalog';
import { EDITIONS, itemEdition, itemId, itemName, itemValue, makeItem, RARITY_PRICE, SHIN_MULT } from '../src/game/items';
import { buy, canBuy, nextCost } from '../src/game/purchase';
import { migrate, newSave, parseSave, SAVE_VERSION } from '../src/game/save';
import { Shop } from '../src/game/shop';
import { DUST_BY_RARITY } from '../src/game/shop/dismantler';
import { GEM_COST } from '../src/game/shop/production';
import { skillById } from '../src/game/skills';
import { computeStats } from '../src/game/stats';

const blade = series.find((s) => s.key === 'Blade')!;
const horse = series.find((s) => s.key === 'Horse')!;

describe('item codes and editions', () => {
  it('packs edition and extension id into one number; plain ids stay valid', () => {
    const id = blade.items[2].id;
    expect(makeItem(id)).toBe(id);
    const code = makeItem(id, 3);
    expect(itemId(code)).toBe(id);
    expect(itemEdition(code)).toBe(3);
    expect(itemName(code)).toBe(`【${EDITIONS[3].name}】${blade.items[2].name}`);
  });

  it('prices by rarity, family, edition and 真', () => {
    const common = blade.items[0].id;
    expect(itemValue(common)).toBe(RARITY_PRICE[0]);
    expect(itemValue(makeItem(common, 4))).toBe(RARITY_PRICE[0] * EDITIONS[4].mult);
    // 幻獣 sell for more than 武具 of the same rarity.
    expect(itemValue(horse.items[0].id)).toBeGreaterThan(itemValue(common));
    if (blade.shin) expect(itemValue(blade.shin.id)).toBe(itemValue(blade.items[4].id) * SHIN_MULT);
  });
});

describe('save v3', () => {
  it('migrates a v2 save by adding empty materials', () => {
    const v2 = { ...newSave(), version: 2 } as Record<string, unknown>;
    delete v2.resources;
    delete v2.bestEdition;
    delete v2.infusion;
    const data = parseSave(JSON.stringify(v2));
    expect(data.version).toBe(SAVE_VERSION);
    expect(data.resources.dust).toBe(0);
    expect(Object.values(data.resources.gems).every((n) => n === 0)).toBe(true);
    expect(data.bestEdition).toEqual({});
    expect(data.infusion).toEqual({});
    expect(migrate({ version: 2 }).version).toBe(SAVE_VERSION);
  });

  it('keeps edition items on the shelf and in storage', () => {
    const code = makeItem(blade.items[1].id, 2);
    const data = parseSave(JSON.stringify({ ...newSave(), shelf: [code, null], storage: [code] }));
    expect(data.shelf).toEqual([code, null]);
    expect(data.storage).toEqual([code]);
  });

  it('refunds over-max dust nodes as dust, not GUM', () => {
    const node = skillById.get('engraving')!;
    expect(node.currency).toBe('dust');
    const save = { ...newSave(), levels: { root: 1, engraving: node.max + 1 } };
    const data = parseSave(JSON.stringify(save));
    expect(data.levels.engraving).toBe(node.max);
    expect(data.gum).toBe(0);
    expect(data.resources.dust).toBeGreaterThan(0);
  });
});

describe('gold dust purchases', () => {
  it('dust nodes are paid with dust and leave GUM alone', () => {
    const save = newSave();
    const node = skillById.get('engraving')!;
    for (const r of node.requires) save.levels[r] = 1;
    save.gum = 1e9;
    save.resources.dust = 0;
    expect(canBuy(save, node)).toBe(false);
    const cost = nextCost(save, node)!;
    save.resources.dust = cost;
    expect(buy(save, node)).toBe(true);
    expect(save.resources.dust).toBe(0);
    expect(save.gum).toBe(1e9);
  });
});

describe('production lines', () => {
  it('each line only crafts its own families', () => {
    const save = newSave();
    Object.assign(save.levels, { forge: 1, capsuleLine: 1 });
    const shop = new Shop(save, seeded(1));
    expect(shop.lines.map((l) => l.id)).toEqual(['pot', 'forge', 'capsule']);
    for (const line of shop.lines) {
      const families = new Set(line.recipes().map((i) => series[i].family));
      if (line.id === 'pot') expect([...families].every((f) => f === 'arcane' || f === 'arms')).toBe(true);
      if (line.id === 'forge') expect([...families]).toEqual(['arms']);
      if (line.id === 'capsule') expect([...families]).toEqual(['beast']);
    }
  });

  it('holding a line crafts faster than leaving it, and overheating jams it', () => {
    const run = (hold: boolean) => {
      const save = newSave();
      const shop = new Shop(save, seeded(5));
      let crafts = 0;
      let overheats = 0;
      shop.on((e) => {
        if (e.type === 'craft') crafts++;
        if (e.type === 'overheat') overheats++;
      });
      for (let i = 0; i < 30 * 30; i++) {
        if (hold) shop.holdLine('pot', true);
        shop.update(1 / 30);
      }
      return { crafts, overheats };
    };
    const idle = run(false);
    const held = run(true);
    expect(held.crafts).toBeGreaterThan(idle.crafts);
    expect(held.overheats).toBeGreaterThan(0);
  });

  it('infusing a 魔石 costs GEM_COST gems and needs the infusion skill', () => {
    const save = newSave();
    save.resources.gems.ifrit = GEM_COST + 1;
    save.infusion = { pot: 'ifrit' };
    new Shop(save, seeded(1));
    expect(save.resources.gems.ifrit).toBe(GEM_COST + 1);

    save.levels.infusion = 1;
    const shop = new Shop(save, seeded(1));
    expect(save.resources.gems.ifrit).toBe(1);
    expect(shop.lines[0].gem).toBe('ifrit');
    expect(shop.lines[0].stats.craftTime).toBeLessThan(computeStats(save.levels)['pot.craftTime']);

    // Not enough left for tomorrow: the line runs without it.
    const next = new Shop(save, seeded(1));
    expect(next.lines[0].gem).toBeNull();
    expect(save.resources.gems.ifrit).toBe(1);
  });
});

describe('dismantler', () => {
  it('turns the cheapest plain storage item into dust when stock is full', () => {
    const save = newSave();
    save.levels.dismantle = 1;
    const shop = new Shop(save, seeded(2));
    const cheap = blade.items[0].id;
    const dear = makeItem(blade.items[0].id, 2);
    shop.stock.storage.push(dear, cheap);
    expect(shop.dismantler.freeOne()).toBe(true);
    expect(shop.stock.storage).toEqual([dear]);
    expect(save.resources.dust).toBe(DUST_BY_RARITY[0]);
    // Edition items are never dismantled.
    expect(shop.dismantler.freeOne()).toBe(false);
  });

  it('does nothing before the skill is learned', () => {
    const shop = new Shop(newSave(), seeded(2));
    shop.stock.storage.push(blade.items[0].id);
    expect(shop.dismantler.freeOne()).toBe(false);
  });
});
