import { describe, expect, it } from 'vitest';
import { allowedDirs, assign, build, canPlaceAt, newP1, setShelf, shopEstimates, startCraft, step, type P1State } from '../src/island/p1/model';
import { emptyShelfCount, fillEmptyShelves, freeHeroes, salesRows, salesTags, setMainAll, staffEmptyShops } from '../src/island/p1/sales';
import { changeShelf } from '../src/island/p1/screens';
import { countValue, REVEAL } from '../src/island/p1/report';

function lot(s: P1State, id: string, skip = 0): [number, number, 'rd' | 'ld' | 'ru' | 'lu'] {
  let n = 0;
  for (let j = 0; j < s.n; j++)
    for (let i = 0; i < s.n; i++) {
      const ds = allowedDirs(s, id, i, j);
      if (ds.length && !canPlaceAt(s, id, i, j, ds[0])) {
        if (n++ < skip) continue;
        return [i, j, ds[0]];
      }
    }
  throw new Error('no lot');
}

/** 工房とよろず屋を建て、3 人を製造・物流・販売に置いて作り始める */
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
  return { s, uid: shop.uid };
}

/** 2 軒目のよろず屋（店員も商品も無し） */
function secondShop(s: P1State): number {
  s.money += 100000;
  const [x, y, e] = lot(s, 'general_store', 1);
  const shop = build(s, 'general_store', x, y, e);
  if (typeof shop === 'string') throw new Error(shop);
  for (let k = 0; k < 6; k++) step(s);
  if (!s.shops[shop.uid]) throw new Error('shop not open');
  return shop.uid;
}

describe('販売管理：一覧（salesRows）', () => {
  it('自社のお店ごとに名前・店員・棚・売上・見込み・認知度・札がそろう', () => {
    const { s, uid } = running(1);
    const rows = salesRows(s);
    expect(rows).toHaveLength(1);
    const r = rows[0];
    expect(r.uid).toBe(uid);
    expect(r.name).toBeTruthy();
    expect(r.staff?.hero).toBe(10002);
    expect(r.apt).toBeGreaterThan(0);
    expect(r.shelves).toEqual(['Sensu:C']);
    expect(r.rev).toBe(0);
    expect(r.est).toBeGreaterThanOrEqual(0);
    expect(r.aw).toBeGreaterThan(0);
    expect(r.aw).toBeLessThanOrEqual(1);
    expect(r.homes).toBeGreaterThanOrEqual(0);
    expect(r.partMax).toBeGreaterThanOrEqual(1);
    // 元の状態を書き換えない
    expect(s.shops[uid].shelves).toEqual(['Sensu:C']);
  });
  it('詰まりの札：商品未定・品切れ・休業中・店員なし', () => {
    const { s, uid } = running(1);
    // 作りたては棚にも裏にも無い＝品切れ
    expect(salesTags(s, uid)).toEqual(['out']);
    s.shops[uid].shelf['Sensu:C'] = 3;
    expect(salesTags(s, uid)).toEqual([]);
    assign(s, 10002, null);
    expect(salesTags(s, uid)).toEqual(['closed']);
    s.shops[uid].part = 1;
    expect(salesTags(s, uid)).toEqual(['noclerk']);
    setShelf(s, uid, 0, null);
    expect(salesTags(s, uid)).toContain('unset');
  });
  it('売れる見込み／月はお店ごとに出て、店員も商品も無いお店は 0', () => {
    const { s, uid } = running(1);
    const uid2 = secondShop(s);
    const est = shopEstimates(s);
    expect(est[uid]).toBeGreaterThan(0);
    expect(est[uid2]).toBe(0);
    const rows = salesRows(s, 'est');
    expect(rows.map((r) => r.uid)).toEqual([uid, uid2]);
    expect(rows[1].tags).toEqual(['unset', 'closed']);
  });
  it('並び替え：売上順・見込み順・認知順', () => {
    const { s, uid } = running(1);
    const uid2 = secondShop(s);
    s.shops[uid].rev = 100;
    s.shops[uid2].rev = 900;
    s.shops[uid].aw = 0.9;
    s.shops[uid2].aw = 0.3;
    expect(salesRows(s, 'rev').map((r) => r.uid)).toEqual([uid2, uid]);
    expect(salesRows(s, 'aw').map((r) => r.uid)).toEqual([uid, uid2]);
    expect(salesRows(s, 'est').map((r) => r.uid)).toEqual([uid, uid2]);
  });
});

describe('販売管理：一括の操作', () => {
  it('全店の主力商品をまとめて替える：1 番目の棚だけ替え、外した商品の棚の残りは裏へ戻る', () => {
    const { s, uid } = running(1);
    const uid2 = secondShop(s);
    s.shops[uid].shelf['Sensu:C'] = 4;
    expect(setMainAll(s, 'Lantern:C')).toBe(2);
    expect(s.shops[uid].shelves[0]).toBe('Lantern:C');
    expect(s.shops[uid2].shelves[0]).toBe('Lantern:C');
    expect(s.shops[uid].shelf['Sensu:C']).toBeUndefined();
    expect(s.shops[uid].storage['Sensu:C']).toBe(4);
    // もう同じなら 0
    expect(setMainAll(s, 'Lantern:C')).toBe(0);
  });
  it('空き棚をまとめて埋める：空いている棚だけ', () => {
    const { s, uid } = running(1);
    const uid2 = secondShop(s);
    expect(emptyShelfCount(s)).toBe(1);
    expect(fillEmptyShelves(s, 'Lantern:C')).toBe(1);
    expect(s.shops[uid].shelves[0]).toBe('Sensu:C');
    expect(s.shops[uid2].shelves[0]).toBe('Lantern:C');
    expect(emptyShelfCount(s)).toBe(0);
    expect(fillEmptyShelves(s, 'Lantern:C')).toBe(0);
  });
  it('店員のいないお店に、いちばん向いている待機中のヒーローを置く', () => {
    const { s, uid } = running(1);
    const uid2 = secondShop(s);
    // 待機中がいない：何も置かない
    expect(freeHeroes(s)).toHaveLength(0);
    expect(staffEmptyShops(s)).toEqual([]);
    // 運搬係を外して待機中に
    assign(s, 10001, null);
    const put = staffEmptyShops(s);
    expect(put).toEqual([{ uid: uid2, hero: 10001 }]);
    expect(s.shops[uid2].staff).toBe(10001);
    expect(s.shops[uid].staff).toBe(10002);
    // 休憩中の人は置かない
    assign(s, 10001, null);
    s.staff.find((x) => x.hero === 10001)!.resting = true;
    expect(staffEmptyShops(s)).toEqual([]);
  });
});

describe('お店の棚の差し替え（changeShelf）', () => {
  it('棚に残っている商品があれば moved(prev, n) を呼び、裏に戻る', () => {
    const { s, uid } = running(1);
    s.shops[uid].shelf['Sensu:C'] = 5;
    const calls: [string, number][] = [];
    changeShelf(s, uid, 0, 'Lantern:C', (prev, n) => calls.push([prev, n]));
    expect(calls).toEqual([['Sensu:C', 5]]);
    expect(s.shops[uid].storage['Sensu:C']).toBe(5);
    expect(s.shops[uid].shelves[0]).toBe('Lantern:C');
  });
  it('棚が空のとき・同じ商品のときは呼ばない', () => {
    const { s, uid } = running(1);
    const calls: unknown[] = [];
    changeShelf(s, uid, 0, 'Lantern:C', (...a) => calls.push(a));
    changeShelf(s, uid, 0, 'Lantern:C', (...a) => calls.push(a));
    expect(calls).toEqual([]);
  });
});

describe('月次報告の発表：カウントアップ', () => {
  it('長さは金額に関係なく一定（1.6 秒）、到達 → 跳ね → 金貨 → タップ待ち（6 秒で自動）', () => {
    expect(REVEAL.count).toBe(1600);
    expect(REVEAL.hit).toBe(400);
    expect(REVEAL.coins).toBe(800);
    expect(REVEAL.auto).toBe(6000);
  });
  it('カウントの値：0 から始まり、途中は金額を超えず、最後は正確な値', () => {
    for (const to of [900, 12000, 150000]) {
      expect(countValue(to, 0, () => 0.5)).toBeGreaterThanOrEqual(0);
      for (let k = 0; k <= 1; k += 0.05) {
        const v = countValue(to, k, () => 0.999);
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(to);
      }
      expect(countValue(to, 0.9, () => 0.5)).toBe(Math.round(to * (1 - 0.01)));
      expect(countValue(to, 1)).toBe(to);
    }
  });
});
