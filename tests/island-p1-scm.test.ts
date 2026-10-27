import { describe, expect, it } from 'vitest';
import { assign, bottleneck, build, canPlaceAt, allowedDirs, deserializeP1, newP1, serializeP1, setShelf, stageCaps, startCraft, step, type P1State } from '../src/island/p1/model';
import { TUT, TUT_DONE, tutOf } from '../src/island/p1/tut';

function lot(s: P1State, id: string): [number, number, 'rd' | 'ld' | 'ru' | 'lu'] {
  for (let j = 0; j < s.n; j++)
    for (let i = 0; i < s.n; i++) {
      const ds = allowedDirs(s, id, i, j);
      if (ds.length && !canPlaceAt(s, id, i, j, ds[0])) return [i, j, ds[0]];
    }
  throw new Error('no lot');
}

function setup(s: P1State) {
  const [a, b, d] = lot(s, 'workshop');
  build(s, 'workshop', a, b, d);
  for (let k = 0; k < 4; k++) step(s);
  const [x, y, e] = lot(s, 'general_store');
  const shop = build(s, 'general_store', x, y, e);
  if (typeof shop === 'string') throw new Error(shop);
  for (let k = 0; k < 5; k++) step(s);
  return shop.uid;
}

describe('SCM ダッシュボード：段ごとの回せる数とボトルネック', () => {
  it('物流の担当がいなければ、物流が止まっている段になる', () => {
    const s = newP1(1);
    const uid = setup(s);
    assign(s, 10003, 'craft', 0);
    assign(s, 10002, 'shop', uid);
    setShelf(s, uid, 0, 'Sensu:C');
    expect(startCraft(s, 0, 'Sensu:C')).toBeNull();
    const c = stageCaps(s);
    expect(c.haul.stopped).toBe(true);
    expect(bottleneck(c)).toBe('haul');
  });
  it('4 つがそろえば止まる段は無く、いちばん少ない段がボトルネック', () => {
    const s = newP1(1);
    const uid = setup(s);
    assign(s, 10003, 'craft', 0);
    assign(s, 10001, 'transport');
    assign(s, 10002, 'shop', uid);
    setShelf(s, uid, 0, 'Sensu:C');
    startCraft(s, 0, 'Sensu:C');
    const c = stageCaps(s);
    for (const k of ['craft', 'haul', 'sell'] as const) expect(c[k].stopped).toBe(false);
    const min = Math.min(...(['buy', 'craft', 'haul', 'sell'] as const).map((k) => c[k].perMonth));
    expect(c[bottleneck(c)].perMonth).toBe(min);
  });
});

describe('チュートリアル', () => {
  it('新しいゲームは 0 段目から、以前のセーブ（工房あり）は済み扱い', () => {
    const s = newP1(1);
    expect(tutOf(s)).toBe(0);
    setup(s);
    const o = JSON.parse(serializeP1(s));
    delete o.tut;
    const old = deserializeP1(JSON.stringify(o))!;
    expect(tutOf(old)).toBe(TUT_DONE);
  });
  it('段は流れの順に並び、建てる → 置く → 売る で進む', () => {
    const ids = TUT.map((x) => x.id);
    expect(ids.indexOf('craft')).toBeLessThan(ids.indexOf('haul'));
    expect(ids.indexOf('haul')).toBeLessThan(ids.indexOf('sell'));
    expect(ids.indexOf('sell')).toBeLessThan(ids.indexOf('buyer'));
    expect(ids.indexOf('scm')).toBeLessThan(ids.indexOf('skills'));
    const s = newP1(1);
    const at = (id: string) => TUT[ids.indexOf(id)].done(s, new Set());
    expect(at('workshop')).toBe(false);
    const uid = setup(s);
    expect(at('workshop')).toBe(true);
    expect(at('craft')).toBe(false);
    assign(s, 10003, 'craft', 0);
    s.slots[0].sku = 'Sensu:C';
    expect(at('craft')).toBe(true);
    expect(at('haul')).toBe(false);
    assign(s, 10001, 'transport');
    expect(at('haul')).toBe(true);
    expect(at('sell')).toBe(false);
    setShelf(s, uid, 0, 'Sensu:C');
    assign(s, 10002, 'shop', uid);
    expect(at('sell')).toBe(true);
    expect(TUT[ids.indexOf('scm')].done(s, new Set(['scm']))).toBe(true);
  });
});
