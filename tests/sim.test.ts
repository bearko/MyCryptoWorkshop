import { describe, expect, it } from 'vitest';
import { playDay, seeded, spend } from '../src/game/balance/autoplay';
import { newSave } from '../src/game/save';
import { Shop } from '../src/game/shop';
import { isAvailable, level, SKILLS, skillById } from '../src/game/skills';
import { computeStats, rarityWeights } from '../src/game/stats';
import { THIEF_STYLES } from '../src/game/thieves';

describe('skill tree', () => {
  it('has unique ids, valid parents and unique positions', () => {
    const ids = new Set<string>();
    const pos = new Set<string>();
    for (const n of SKILLS) {
      expect(ids.has(n.id)).toBe(false);
      ids.add(n.id);
      const p = `${n.x},${n.y}`;
      expect(pos.has(p), `position ${p} of ${n.id}`).toBe(false);
      pos.add(p);
      for (const r of n.requires) expect(skillById.has(r), `${n.id} requires ${r}`).toBe(true);
    }
  });

  it('only exposes the root branches at the start', () => {
    const levels = newSave().levels;
    const available = SKILLS.filter((n) => isAvailable(n, levels)).map((n) => n.id);
    expect(available).toEqual(expect.arrayContaining(['root', 'craftSpeed', 'ad', 'price', 'bounty', 'shelf']));
    expect(available).not.toContain('rare');
  });
});

describe('stats', () => {
  it('rarity weights favour the rarity below the newest one', () => {
    expect(rarityWeights(0, 1)).toEqual([1]);
    const w = rarityWeights(2, 1);
    expect(w[1]).toBeGreaterThan(w[2]);
    expect(w[1]).toBeGreaterThan(w[0]);
  });

  it('upgrades move stats in the right direction', () => {
    const base = computeStats({ root: 1 });
    const up = computeStats({ root: 1, craftSpeed: 3, shelf: 2, ad: 2, price: 1, conveyor: 1 });
    expect(up.craftTime).toBeLessThan(base.craftTime);
    expect(up.shelfSlots).toBe(base.shelfSlots + 2);
    expect(up.spawnInterval).toBeLessThan(base.spawnInterval);
    expect(up.priceMult).toBeGreaterThan(base.priceMult);
    expect(up.storageCap).toBeGreaterThan(0);
    expect(up.overlays).toContain('conveyor');
  });
});

describe('shop simulation', () => {
  it('sells items and earns GUM on day 1', () => {
    const save = newSave();
    const { report } = playDay(save, seeded(1));
    expect(report.sold).toBeGreaterThan(3);
    expect(report.revenue).toBeGreaterThan(0);
    expect(save.gum).toBe(report.revenue);
    expect(save.day).toBe(2);
    expect(save.collection.length).toBeGreaterThan(0);
  });

  it('never duplicates or loses track of items on the shelf', () => {
    const save = newSave();
    save.levels = { root: 1, shelf: 3, conveyor: 1, craftSpeed: 5 };
    save.day = 5;
    const shop = new Shop(save, seeded(7));
    for (let i = 0; i < 30 * 60 && !shop.over; i++) {
      shop.update(1 / 30);
      for (const s of shop.slots) {
        const claimants = shop.actors.filter((a) => a.slot >= 0 && shop.slots[a.slot] === s && a.id === s.claimedBy);
        expect(claimants.length).toBeLessThanOrEqual(1);
      }
      expect(shop.storage.length).toBeLessThanOrEqual(Math.max(shop.stats.storageCap, 0) + shop.slots.length + 16);
    }
  });

  it('every thief type finishes its route (escapes or is caught) instead of getting stuck', () => {
    const seen = new Set<number>();
    for (let seed = 1; seed <= 12; seed++) {
      const save = newSave();
      save.day = 12;
      save.levels = { root: 1, shelf: 9, craftSpeed: 10, dayLength: 10 };
      const shop = new Shop(save, seeded(seed));
      shop.on((e) => {
        if (e.type === 'thief') seen.add(e.hero.id);
      });
      const tapChance = seed % 2 ? 0 : 0.02;
      const tapRng = seeded(seed + 100);
      for (let i = 0; i < 30 * 120 && !shop.over; i++) {
        shop.update(1 / 30);
        for (const a of shop.actors) {
          if (a.kind !== 'thief') continue;
          expect(a.timer, `${a.hero.name} stuck in ${a.state}`).toBeLessThan(20);
          if (tapRng() < tapChance) shop.clickThief(a);
        }
        for (const p of shop.pestList) {
          expect(p.x).toBeGreaterThanOrEqual(0);
          expect(p.x).toBeLessThanOrEqual(1000);
        }
      }
    }
    expect(seen.size).toBe(Object.keys(THIEF_STYLES).length);
  });

  it('tough thieves need several taps', () => {
    const save = newSave();
    save.day = 4;
    const shop = new Shop(save, seeded(3));
    const events: string[] = [];
    shop.on((e) => events.push(e.type));
    for (let i = 0; i < 30 * 120 && !shop.over; i++) {
      shop.update(1 / 30);
      const tough = shop.actors.find((a) => a.kind === 'thief' && a.style!.hp > 1 && a.state !== 'caught');
      if (tough) {
        shop.clickThief(tough);
        expect(tough.state).not.toBe('caught');
        return;
      }
    }
  });

  it('progresses through the rarities within a reasonable number of days (balance smoke test)', () => {
    const save = newSave();
    const rng = seeded(42);
    const milestones: Record<string, number> = {};
    const lines: string[] = [];
    for (let day = 1; day <= 60; day++) {
      const { report } = playDay(save, rng);
      spend(save, report.revenue);
      for (const id of ['uncommon', 'rare', 'epic', 'legendary', 'tier4']) {
        if (!milestones[id] && level(save.levels, id) > 0) milestones[id] = day;
      }
      if (day <= 5 || day % 5 === 0) {
        lines.push(
          `day ${String(day).padStart(2)} rev ${String(report.revenue).padStart(8)} sold ${String(report.sold).padStart(3)} lost ${String(report.lost).padStart(2)} nodes ${Object.values(save.levels).reduce((a, b) => a + b, 0)}`,
        );
      }
    }
    console.log(lines.join('\n'), '\nmilestones', milestones);
    expect(milestones.uncommon).toBeLessThanOrEqual(4);
    expect(milestones.rare).toBeLessThanOrEqual(15);
    expect(milestones.epic).toBeLessThanOrEqual(35);
  });
});
