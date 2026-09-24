import { describe, expect, it } from 'vitest';
import { SKILLS } from '../src/game/skills';
import { computeStats } from '../src/game/stats';
import snapshot from './fixtures/stats-snapshot.json';

describe('data-driven skill effects', () => {
  // The snapshot was produced by the original hand-written computeStats before effects became data.
  // Phase 2 renamed the crafting stats to the magic pot's line stats, and turned the 鍛冶ハンマー
  // (-15% craft time) into the forge line, so that one value is expected to differ.
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
        if (key === 'overlays') continue;
        const got = actual[key as keyof typeof actual];
        if (typeof value === 'number') expect(got, key).toBeCloseTo(value, 9);
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
    expect(describeChanges(before, after)).toEqual([{ label: '魔法の壺: クラフト時間', from: '2.39秒', to: '2.20秒' }]);
  });

  it('describes unlocks and new series', () => {
    const changes = describeChanges(computeStats({ root: 1 }), computeStats({ root: 1, shelf: 1, recipe_Musket: 1 }));
    expect(changes.map((c) => c.label)).toEqual(['陳列スペース', '来客間隔', 'クラフトできるシリーズ']);
    expect(changes[2].to).toContain('マスケット');
  });
});
