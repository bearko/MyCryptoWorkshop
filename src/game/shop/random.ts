import type { Rng } from './types';

/** Random helpers over an injectable generator (tests pass a seeded one). */
export class Random {
  constructor(readonly next: Rng = Math.random) {}

  range(a: number, b: number): number {
    return a + (b - a) * this.next();
  }

  pick<T>(list: readonly T[]): T {
    return list[Math.floor(this.next() * list.length) % list.length];
  }

  weighted(weights: number[]): number {
    const total = weights.reduce((a, b) => a + b, 0);
    let r = this.next() * total;
    for (let i = 0; i < weights.length; i++) {
      r -= weights[i];
      if (r <= 0) return i;
    }
    return weights.length - 1;
  }
}
