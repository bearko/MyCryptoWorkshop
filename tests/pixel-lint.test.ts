import { describe, expect, it } from 'vitest';
// @ts-expect-error plain JS module under scripts/
import { Canvas } from '../scripts/pixel/core.mjs';
// @ts-expect-error plain JS module under scripts/
import { banding, harshDither, jaggies, lint, orphans, perimeterNonOutline } from '../scripts/pixel-lint.mjs';
// @ts-expect-error plain JS module under scripts/
import { OUTLINE, PAL } from '../scripts/pixel/palette.mjs';

const A = PAL.grass[1];
const B = PAL.grass[3];
const W = [255, 255, 255, 255];
const K = [0, 0, 0, 255];

describe('pixel lint', () => {
  it('finds an orphan dot', () => {
    const c = new Canvas(5, 5);
    c.rect(0, 0, 5, 5, A);
    c.put(2, 2, B);
    expect(orphans(c)).toBe(1);
  });

  it('finds two 1-pixel strips stacked with the same length (banding)', () => {
    const c = new Canvas(8, 6);
    c.rect(0, 0, 8, 6, A);
    c.rect(2, 2, 4, 1, B);
    c.rect(2, 3, 4, 1, PAL.grass[0]);
    expect(banding(c)).toBe(1);
  });

  it('finds a short step between two long steps on a 1-pixel slope', () => {
    const c = new Canvas(20, 10);
    // top edge: y = 5 for 6 columns, y = 4 for 1 column, y = 3 for 6 columns
    for (let x = 0; x < 6; x++) c.rect(x, 5, 1, 5, A);
    c.rect(6, 4, 1, 6, A);
    for (let x = 7; x < 13; x++) c.rect(x, 3, 1, 7, A);
    expect(jaggies(c)).toBeGreaterThan(0);
  });

  it('does not count right-angle corners as jaggies', () => {
    const c = new Canvas(20, 12);
    c.rect(2, 6, 6, 4, A);
    c.rect(8, 2, 8, 8, A);
    expect(jaggies(c)).toBe(0);
  });

  it('finds a high-contrast checkerboard', () => {
    const c = new Canvas(4, 4);
    for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) c.put(x, y, (x + y) % 2 ? W : K);
    expect(harshDither(c)).toBeGreaterThan(2);
  });

  it('checks that a foreground sprite is closed by the outline', () => {
    const c = new Canvas(6, 6);
    c.rect(0, 0, 6, 6, OUTLINE);
    c.rect(1, 1, 4, 4, A);
    expect(perimeterNonOutline(c)).toBe(0);
    c.put(0, 3, A);
    expect(perimeterNonOutline(c)).toBeGreaterThan(0);
  });

  it('rejects colours outside the palette and semi-transparent pixels', () => {
    const c = new Canvas(4, 4);
    c.rect(0, 0, 4, 4, [1, 2, 3, 255]);
    c.put(0, 0, [10, 10, 10, 128]);
    const fails = lint(c, 'tile').join(' ');
    expect(fails).toContain('palette');
    expect(fails).toContain('alpha');
  });
});
