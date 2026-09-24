import { describe, expect, it } from 'vitest';
import { SKILLS } from '../src/game/skills';
import { computeStats } from '../src/game/stats';
import snapshot from './fixtures/stats-snapshot.json';

describe('data-driven skill effects', () => {
  // The snapshot was produced by the original hand-written computeStats before effects became data.
  it('reproduces the original stat formulas for 41 skill configurations', () => {
    for (const { levels, stats: expected } of snapshot) {
      const actual = computeStats(levels as Record<string, number>);
      for (const [key, value] of Object.entries(expected)) {
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
