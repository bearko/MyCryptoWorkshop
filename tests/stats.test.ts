import { describe, expect, it } from 'vitest';
import { SKILLS } from '../src/game/skills';
import { computeStats } from '../src/game/stats';
import snapshot from './fixtures/stats-snapshot.json';

describe('data-driven skill effects', () => {
  // The snapshot was produced by the original hand-written computeStats before effects became data.
  // Phase 2 renamed the crafting stats to the magic pot's line stats, and turned the 鍛冶ハンマー
  // (-15% craft time) into the forge line, so that one value is expected to differ.
  // Phase 2-6 also retuned the pot's base craft time and tap power; both are only ever
  // multiplied by skills, so the old values scale by the same factor.
  const RETUNED: Record<string, number> = { 'pot.craftTime': 4.2 / 2.6, 'pot.craftClick': 0.22 / 0.12 };
  const RENAMED: Record<string, string> = {
    craftTime: 'pot.craftTime',
    craftClick: 'pot.craftClick',
    doubleChance: 'pot.doubleChance',
    mineInterval: 'pot.helperInterval',
  };
  it('reproduces the original stat formulas for 41 skill configurations', () => {
    for (const { levels, stats: expected } of snapshot) {
      const actual = computeStats(levels as Record<string, number>);
      for (const [oldKey, value] of Object.entries(expected)) {
        const key = RENAMED[oldKey] ?? oldKey;
        if (key === 'pot.craftTime' && (levels as Record<string, number>).forge) continue;
        // Retuned for ~900 collectable extensions in Phase 5.
        if (key === 'overlays' || key === 'collectionBonus') continue;
        const got = actual[key as keyof typeof actual];
        if (typeof value === 'number') expect(got, key).toBeCloseTo(value * (RETUNED[key] ?? 1), 9);
        else expect([...(got as unknown[])].sort(), key).toEqual([...(value as unknown[])].sort());
      }
    }
  });

  it('every node has at least one effect (except the root)', () => {
    for (const n of SKILLS) if (n.id !== 'root') expect(n.effects.length, n.id).toBeGreaterThan(0);
  });
});

import { describeChanges } from '../src/game/statInfo';

describe('describeChanges', () => {
  it('shows the next level of a node as before → after', () => {
    const before = computeStats({ root: 1, craftSpeed: 1 });
    const after = computeStats({ root: 1, craftSpeed: 2 });
    expect(describeChanges(before, after)).toEqual([{ label: '魔法の壺: クラフト時間', from: '3.86秒', to: '3.55秒' }]);
  });

  it('describes unlocks and new series', () => {
    const changes = describeChanges(computeStats({ root: 1 }), computeStats({ root: 1, shelf: 1, recipe_Musket: 1 }));
    expect(changes.map((c) => c.label)).toEqual(['陳列スペース', '来客間隔', 'クラフトできるシリーズ']);
    expect(changes[2].to).toContain('マスケット');
  });
});
