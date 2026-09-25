import { describe, expect, it } from 'vitest';
import { TREE_NODES } from '../src/game/skills';

describe('skill tree layout', () => {
  it('no two nodes share a cell', () => {
    const cells = new Set<string>();
    for (const n of TREE_NODES) {
      const key = `${n.x},${n.y}`;
      expect(cells.has(key), `${n.id} at ${key}`).toBe(false);
      cells.add(key);
    }
  });

  it('every block sits next to the rest of the tree (no islands)', () => {
    // Nodes in touching cells (sides or corners) are neighbours; the whole tree must be one
    // connected cluster, with no block set apart by an empty row or column.
    const seen = new Set<string>([TREE_NODES[0].id]);
    const queue = [TREE_NODES[0]];
    while (queue.length) {
      const a = queue.pop()!;
      for (const b of TREE_NODES) {
        if (seen.has(b.id) || Math.abs(a.x - b.x) > 1 || Math.abs(a.y - b.y) > 1) continue;
        seen.add(b.id);
        queue.push(b);
      }
    }
    const far = TREE_NODES.filter((n) => !seen.has(n.id)).map((n) => `${n.id}@${n.x},${n.y}`);
    expect(far).toEqual([]);
  });
});

describe('buying skills during the day', () => {
  it('a shop made with waitToOpen does nothing (and spends no 魔石) until it opens', async () => {
    const { newSave } = await import('../src/game/save');
    const { Shop } = await import('../src/game/shop');
    const save = newSave();
    Object.assign(save.levels, { infusion: 1 });
    save.infusion = { pot: 'ifrit' };
    save.resources.gems.ifrit = 10;
    const shop = new Shop(save, () => 0.5, { waitToOpen: true });
    shop.update(1);
    expect(shop.elapsed).toBe(0);
    expect(save.resources.gems.ifrit).toBe(10);
    shop.start();
    expect(save.resources.gems.ifrit).toBeLessThan(10);
    expect(shop.lines[0].gem).toBe('ifrit');
    shop.update(1);
    expect(shop.elapsed).toBe(1);
  });

  it('applyLevels adds shelf slots, lines, registers, staff and day length at once', async () => {
    const { newSave } = await import('../src/game/save');
    const { Shop } = await import('../src/game/shop');
    const save = newSave();
    const shop = new Shop(save, () => 0.5);
    shop.update(1);
    const slots = shop.slots.length;
    const left = shop.timeLeft;
    Object.assign(save.levels, { shelf: 2, craftClick: 1, forge: 1, cashier: 1, dayLength: 1, register: 1, hire_stocker: 1 });
    shop.applyLevels();
    expect(shop.slots.length).toBe(slots + 2);
    expect(shop.lines.map((l) => l.id)).toEqual(['pot', 'forge']);
    expect(shop.register.progress.length).toBe(2);
    expect(shop.staffMembers.map((m) => m.role)).toContain('stocker');
    expect(shop.timeLeft).toBeCloseTo(left + 8);
  });
});

describe('workshop layout', () => {
  it('pests stay out of the top of the workshop (HUD and tips)', async () => {
    const { PEST_SPOTS, PEST_PX, WORKSHOP_H } = await import('../src/game/layout');
    // Top of a pest's sprite, with the hop jitter.
    for (const s of PEST_SPOTS) expect(s.y - 10 - PEST_PX).toBeGreaterThan(WORKSHOP_H * 0.4);
  });
});

describe('feature nodes', () => {
  it('staff, recipes and unlocks get the ornate frame; plain upgrades do not', async () => {
    const { isFeature } = await import('../src/game/features');
    const { skillById } = await import('../src/game/skills');
    for (const id of ['hire_stocker', 'recipe_Katana', 'storeHub', 'epic', 'tier1', 'conveyor', 'market', 'autoBuyer', 'register', 'showcase']) expect(isFeature(id), id).toBe(true);
    for (const id of ['craftSpeed', 'price', 'shelf', 'rsGrandTheory', 'stocker_1', 'honor_price_1', 'rep_Katana']) {
      expect(skillById.has(id), id).toBe(true);
      expect(isFeature(id), id).toBe(false);
    }
  });
});
