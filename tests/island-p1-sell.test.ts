import { describe, expect, it } from 'vitest';
import {
  allowedDirs,
  assign,
  build,
  canPlaceAt,
  capture,
  displayCap,
  myShops,
  newP1,
  rivalOffers,
  salesPotential,
  sellInfo,
  sellWhatIf,
  serializeP1,
  setPart,
  setShelf,
  stageCaps,
  startCraft,
  step,
  type P1State,
  type PBuilding,
  type ShopState,
} from '../src/island/p1/model';

function lot(s: P1State, id: string): [number, number, 'rd' | 'ld' | 'ru' | 'lu'] {
  for (let j = 0; j < s.n; j++)
    for (let i = 0; i < s.n; i++) {
      const ds = allowedDirs(s, id, i, j);
      if (ds.length && !canPlaceAt(s, id, i, j, ds[0])) return [i, j, ds[0]];
    }
  throw new Error('no lot');
}

/** 工房とよろず屋を建て、製造・物流・販売に人を置いて、センスを並べてしばらく回す */
function running(seed = 1): { s: P1State; uid: number } {
  const s = newP1(seed);
  const [a, b, d] = lot(s, 'workshop');
  build(s, 'workshop', a, b, d);
  for (let k = 0; k < 4; k++) step(s);
  const [x, y, e] = lot(s, 'general_store');
  const shop = build(s, 'general_store', x, y, e);
  if (typeof shop === 'string') throw new Error(shop);
  for (let k = 0; k < 5; k++) step(s);
  assign(s, 10003, 'craft', 0);
  assign(s, 10001, 'transport');
  assign(s, 10002, 'shop', shop.uid);
  setShelf(s, shop.uid, 0, 'Sensu:C');
  startCraft(s, 0, 'Sensu:C');
  for (let k = 0; k < 20; k++) step(s);
  return { s, uid: shop.uid };
}

/** 地図に直接お店を足す（式を確かめる用。売り場は from と同じ体制・認知度） */
function addShop(s: P1State, i: number, j: number, from: number): PBuilding {
  const uid = s.nextUid++;
  const b: PBuilding = { uid, id: 'general_store', i, j, dir: 'rd', left: 0, owner: 'me' };
  const f = s.shops[from];
  const sh: ShopState = { ...f, uid, shelves: [...f.shelves], storage: {}, shelf: {}, carry: {} };
  s.buildings.push(b);
  s.shops[uid] = sh;
  return b;
}

describe('販売の式：自社のお店・棚は家ごとに 1 軒ぶん（capture の gmax）', () => {
  it('同じ場所に同じ商品の自社のお店をもう 1 つ足しても、自社の取り分の合計は変わらない', () => {
    const { s } = running(1);
    const b = myShops(s)[0];
    const o = { i: b.i, j: b.j, w: 1, g: 'me' };
    const rv = rivalOffers(s, 'Sensu');
    const one = capture(s, 'Sensu', [o, ...rv])[0];
    const two = capture(s, 'Sensu', [o, { ...o }, ...rv]);
    expect(two[0] + two[1]).toBeCloseTo(one, 9);
  });
  it('同じ商品の棚を 2 段にしても増えない／同じ場所のお店では増えず、離れたお店で増える', () => {
    const { s, uid } = running(1);
    const base = salesPotential(s);
    const s2 = JSON.parse(serializeP1(s)) as P1State;
    s2.shops[uid].shelves = ['Sensu:C', 'Sensu:C'];
    expect(salesPotential(s2)).toBeCloseTo(base, 6);
    const b = myShops(s)[0];
    const same = JSON.parse(serializeP1(s)) as P1State;
    addShop(same, b.i, b.j, uid);
    expect(salesPotential(same)).toBeCloseTo(base, 6);
    const far = JSON.parse(serializeP1(s)) as P1State;
    addShop(far, s.n - 1 - b.i, s.n - 1 - b.j, uid);
    expect(salesPotential(far)).toBeGreaterThan(base + 2);
  });
});

describe('打ち手ごとの見込み（sellWhatIf）', () => {
  it('純粋関数：状態を書き換えない', () => {
    const { s } = running(2);
    const before = serializeP1(s);
    const n = s.nextUid;
    sellWhatIf(s);
    sellInfo(s);
    expect(serializeP1(s)).toBe(before);
    expect(s.nextUid).toBe(n);
  });
  it('2 軒目は離れた区画を選び、プラスになる。いまのお店のすぐ近くより大きい', () => {
    for (const seed of [1, 2, 3]) {
      const { s, uid } = running(seed);
      const b = myShops(s)[0];
      const w = sellWhatIf(s).find((x) => x.kind === 'shop')!;
      expect(w).toBeDefined();
      expect(w.units).toBeGreaterThan(2);
      expect(w.ok).toBe(true);
      const [i, j] = w.at!;
      expect(Math.abs(i - b.i) + Math.abs(j - b.j)).toBeGreaterThanOrEqual(4);
      // いまのお店に隣り合う場所の 2 軒目（同じ商圏）は、ほとんど増えない
      const near = JSON.parse(serializeP1(s)) as P1State;
      const base = salesPotential(near);
      addShop(near, b.i, b.j, uid);
      expect(salesPotential(near) - base).toBeLessThan(w.units);
    }
  });
  it('効き目の大きい順で、+2 個未満は ok=false', () => {
    const { s } = running(1);
    const ws = sellWhatIf(s);
    for (let k = 1; k < ws.length; k++) expect(ws[k - 1].units).toBeGreaterThanOrEqual(ws[k].units);
    for (const w of ws) expect(w.ok).toBe(w.units >= 2);
  });
});

describe('お店の処理力（品出し）の制限', () => {
  it('需要が処理力を超えると、販売の数字は処理力で頭打ち（why=capacity）。アルバイト・什器が効く', () => {
    const { s, uid } = running(1);
    s.demand.Sensu = 5000;
    const c = stageCaps(s).sell;
    expect(c.why).toBe('capacity');
    expect(c.perMonth).toBe(Math.round(displayCap(s)));
    expect(c.demand!).toBeGreaterThan(c.capacity!);
    const info = sellInfo(s);
    expect(info.why).toBe('capacity');
    const ws = sellWhatIf(s);
    const part = ws.find((w) => w.kind === 'part');
    const fx = ws.find((w) => w.kind === 'fixtures');
    expect(part?.ok || fx?.ok).toBe(true);
    // 処理力が効いているときは、需要の側の手（売り場の強さ）は効かない
    expect(ws.find((w) => w.kind === 'pull')!.ok).toBe(false);
    // アルバイトを足すと処理力が増える
    const cap0 = displayCap(s);
    setPart(s, uid, 1);
    expect(displayCap(s)).toBeGreaterThan(cap0);
  });
  it('店員が休憩中でも、見込み（需要から取れる数・処理力）はいつもの体制で数える', () => {
    const { s, uid } = running(1);
    const pot = salesPotential(s);
    const cap = displayCap(s);
    const st = s.staff.find((x) => x.hero === s.shops[uid].staff)!;
    st.resting = true;
    expect(salesPotential(s)).toBeCloseTo(pot, 9);
    expect(displayCap(s)).toBeCloseTo(cap, 9);
  });
  it('ふだん（需要が小さい）は需要の側が効いている（why=demand）', () => {
    const { s } = running(1);
    const c = stageCaps(s).sell;
    expect(c.why).toBe('demand');
    expect(c.perMonth).toBe(Math.round(Math.min(salesPotential(s), displayCap(s))));
  });
});

describe('まとめの判定（売れる数が頭打ちの理由）', () => {
  /** 地図のあちこちにお店を足して、遠い家を減らす */
  function cover(s: P1State, uid: number) {
    const placed = myShops(s).map((b) => [b.i, b.j]);
    for (let j = 0; j < s.n; j++)
      for (let i = 0; i < s.n; i++) {
        if (!allowedDirs(s, 'general_store', i, j).length) continue;
        if (placed.some(([x, y]) => Math.abs(x - i) + Math.abs(y - j) < 4)) continue;
        addShop(s, i, j, uid);
        placed.push([i, j]);
      }
  }
  it('お店 1 軒だと遠い家が多い（far）', () => {
    const { s } = running(1);
    const info = sellInfo(s);
    expect(info.far).toBeGreaterThanOrEqual(0.4);
    expect(info.why).toBe('far');
    expect(info.shops[0].overlap).toBe(0);
  });
  it('飽和した商品ばかりなら、遠い家より先に「需要が小さい／取り合い」（demand）', () => {
    const { s } = running(1);
    s.sector = 'c2';
    s.known.Sensu = 1;
    s.rivals[0].sells.Sensu = 1;
    s.rivals[1].sells.Sensu = 1;
    const info = sellInfo(s);
    expect(info.satShare).toBe(1);
    expect(info.why).toBe('demand');
    expect(info.goods[0].why).toBe('saturated');
  });
  it('遠い家が少ないとき：認知が低ければ known、他社が強ければ rival。自社の重なりも出る', () => {
    const { s, uid } = running(1);
    cover(s, uid);
    for (const r of s.rivals) r.sells.Sensu = 4;
    const ok = sellInfo(s);
    expect(ok.far).toBeLessThan(0.4);
    expect(ok.share).toBeLessThan(0.5);
    expect(ok.why).toBe('rival');
    for (const b of myShops(s)) s.shops[b.uid].aw = 0.3;
    const low = sellInfo(s);
    expect(low.known).toBeLessThan(0.7);
    expect(low.why).toBe('known');
    // 隣り合うお店を足すと、重なりが 50% 以上になる
    const b = myShops(s)[0];
    addShop(s, b.i, b.j, uid);
    const ov = sellInfo(s).shops.filter((x) => x.b.i === b.i && x.b.j === b.j);
    expect(ov.every((x) => x.overlap >= 0.5)).toBe(true);
  });
});
