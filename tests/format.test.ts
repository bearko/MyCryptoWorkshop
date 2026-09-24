import { describe, expect, it } from 'vitest';
import { fmt } from '../src/game/format';

describe('fmt', () => {
  it.each([
    [0, '0'],
    [9999, '9,999'],
    [10000, '1万'],
    [12345, '1.23万'],
    [123456, '12.3万'],
    [1234567, '123万'],
    [12345678, '1,234万'],
    [99999999, '9,999万'],
    [1e8, '1億'],
    [5e8, '5億'],
    [1.5e12, '1.5兆'],
    [2.5e16, '2.5京'],
    [1e20, '1垓'],
    [3.21e48, '3.21極'],
    [1e53, '1.00e53'],
    [-12345, '-1.23万'],
  ])('%d → %s', (n, expected) => {
    expect(fmt(n)).toBe(expected);
  });

  it('never rounds up (9,999.9万 stays below 1億)', () => {
    expect(fmt(99_999_999.9)).toBe('9,999万');
    expect(fmt(19_999)).toBe('1.99万');
  });
});
