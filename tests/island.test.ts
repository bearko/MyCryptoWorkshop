import { describe, expect, it } from 'vitest';
import { DEF, DEFS } from '../src/island/defs';
import { canPlace, cells, demolish, deserialize, endMonth, frontCell, groundAt, happiness, homes, newGame, place, rotate, serialize, step, type State } from '../src/island/sim';

const grassCell = (s: State, size = 1): [number, number] => {
  for (let j = 0; j < s.n; j++)
    for (let i = 0; i < s.n; i++) {
      const ok = cells({ ...DEF.house, size: size as 1 | 2 }, i, j, 'rd').every(([x, y]) => groundAt(s, x, y) === 'grass' && !s.buildings.some((b) => cells(DEF[b.id], b.i, b.j, b.dir).some(([p, q]) => p === x && q === y)));
      if (ok) return [i, j];
    }
  throw new Error('no grass');
};

describe('島づくり：建物の一覧', () => {
  it('id が重ならず、2 マスは 2 マス', () => {
    expect(new Set(DEFS.map((d) => d.id)).size).toBe(DEFS.length);
    expect(DEF.station.size).toBe(2);
    expect(DEF.house.homes).toBeGreaterThan(0);
  });
});

describe('島づくり：地図と置き方', () => {
  it('同じ種なら同じ島。真ん中は草地、角は海', () => {
    const a = newGame(7);
    const b = newGame(7);
    expect(a.ground).toEqual(b.ground);
    expect(groundAt(a, 9, 9)).toBe('grass');
    expect(groundAt(a, 0, 0)).toBe('water');
  });

  it('2 マスは向きで延びる方向が変わり、手前のマスが基準になる', () => {
    expect(cells(DEF.station, 3, 3, 'rd')).toEqual([[3, 3], [3, 4]]);
    expect(cells(DEF.station, 3, 3, 'ld')).toEqual([[3, 3], [4, 3]]);
    expect(frontCell(DEF.station, 3, 3, 'lu')).toEqual([3, 4]);
    expect(frontCell(DEF.house, 3, 3, 'ru')).toEqual([3, 3]);
  });

  it('海・重なり・お金・人口の条件で断る', () => {
    const s = newGame(7);
    expect(canPlace(s, DEF.house, 0, 0, 'rd')).toBe('ground');
    const [i, j] = grassCell(s);
    expect(place(s, 'house', i, j, 'rd')).toMatchObject({ id: 'house' });
    expect(canPlace(s, DEF.house, i, j, 'rd')).toBe('taken');
    expect(canPlace(s, DEF.tower, 9, 9, 'rd')).toBe('locked');
    s.money = 10;
    const [x, y] = grassCell(s);
    expect(canPlace(s, DEF.house, x, y, 'rd')).toBe('money');
  });

  it('工事が終わると住める。取り壊すと半額が戻る', () => {
    const s = newGame(7);
    const [i, j] = grassCell(s);
    const b = place(s, 'house', i, j, 'rd');
    if (typeof b === 'string') throw new Error(b);
    expect(homes(s)).toBe(0);
    let finished = 0;
    for (let d = 0; d < DEF.house.days; d++) finished += step(s).finished.length;
    expect(finished).toBe(1);
    expect(homes(s)).toBe(DEF.house.homes);
    const before = s.money;
    expect(demolish(s, b.uid)).toBe(DEF.house.cost / 2);
    expect(s.money).toBe(before + DEF.house.cost / 2);
  });

  it('2 マスの向きは、置き直せるときだけ変わる', () => {
    const s = newGame(7);
    s.pop = 500;
    s.money = 1e6;
    const [i, j] = grassCell(s, 2);
    const b = place(s, 'station', i, j, 'rd');
    if (typeof b === 'string') throw new Error(b);
    const ok = rotate(s, b.uid);
    expect(b.dir).toBe(ok ? 'ld' : 'rd');
  });
});

describe('島づくり：暮らし', () => {
  it('家と食事と店があれば人が来て、税が入る', () => {
    const s = newGame(11);
    s.money = 1e6;
    for (const id of ['house', 'house', 'house', 'ramen', 'general_store', 'park']) {
      const [i, j] = grassCell(s);
      place(s, id, i, j, 'rd');
    }
    for (let d = 0; d < 30 * 6; d++) step(s);
    expect(s.pop).toBeGreaterThan(5);
    expect(s.pop).toBeLessThanOrEqual(homes(s));
    expect(happiness(s)).toBeGreaterThan(0.45);
    const m = endMonth(s);
    expect(m.tax).toBeGreaterThan(0);
  });

  it('食べる所がないと満足度が下がる', () => {
    const s = newGame(11);
    s.money = 1e6;
    for (let k = 0; k < 4; k++) {
      const [i, j] = grassCell(s);
      place(s, 'apartment', i, j, 'rd');
    }
    s.pop = 40;
    for (const b of s.buildings) b.left = 0;
    expect(happiness(s)).toBeLessThan(0.6);
  });

  it('セーブして読み直すと同じ', () => {
    const s = newGame(5);
    const [i, j] = grassCell(s);
    place(s, 'cafe', i, j, 'lu');
    const r = deserialize(serialize(s));
    expect(r?.buildings).toEqual(s.buildings);
    expect(r?.ground).toEqual(s.ground);
  });
});
