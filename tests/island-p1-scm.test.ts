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
  it('段は「建てる → 作る → 素材 → お店 → 売る → 運ぶ」の順に、1 つずつ進む', () => {
    const ids = TUT.map((x) => x.id);
    for (const [a, b] of [['workshop', 'craft'], ['craft', 'mats'], ['mats', 'shop'], ['shop', 'sell'], ['sell', 'haul'], ['haul', 'firstSale'], ['firstSale', 'scm'], ['scm', 'skills']]) expect(ids.indexOf(a)).toBeLessThan(ids.indexOf(b));
    // 会話は 1 枚 2 文まで（「。」「！」「？」で数える）
    for (const st of TUT) for (const pg of st.intro?.pages ?? []) expect((pg.text.match(/[。！？]/g) ?? []).length).toBeLessThanOrEqual(2);
    const s = newP1(1);
    const at = (id: string, seen: string[] = []) => TUT[ids.indexOf(id)].done(s, new Set(seen));
    expect(at('workshop')).toBe(false);
    const uid = setup(s);
    expect(at('workshop')).toBe(true);
    expect(at('craft')).toBe(false);
    assign(s, 10003, 'craft', 0);
    s.slots[0].sku = 'Sensu:C';
    expect(at('craft')).toBe(true);
    expect(at('mats', ['buy'])).toBe(false);
    s.proc.bought = 10;
    expect(at('mats')).toBe(false);
    expect(at('mats', ['buy'])).toBe(true);
    expect(at('sell')).toBe(false);
    setShelf(s, uid, 0, 'Sensu:C');
    assign(s, 10002, 'shop', uid);
    expect(at('sell')).toBe(true);
    expect(at('haul')).toBe(false);
    assign(s, 10001, 'transport');
    expect(at('haul')).toBe(true);
    expect(at('scm', ['scm'])).toBe(true);
  });
});
