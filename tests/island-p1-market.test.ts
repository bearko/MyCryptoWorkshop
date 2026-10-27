import { describe, expect, it } from 'vitest';
import { allowedDirs, build, capture, depotInfo, newP1, oneWay, rivalOffers, siteInfo, step, type Offer, type P1State } from '../src/island/p1/model';

function spots(s: P1State, id: string) {
  const out: [number, number, 'rd' | 'ld' | 'ru' | 'lu'][] = [];
  for (let j = 0; j < s.n; j++) for (let i = 0; i < s.n; i++) { const ds = allowedDirs(s, id, i, j); if (ds.length) out.push([i, j, ds[0]]); }
  return out;
}
const me = (i: number, j: number): Offer => ({ i, j, w: 1, g: 'me' });
const sum = (xs: number[]) => xs.reduce((a, x) => a + x, 0);

describe('商圏：お客さんの住む場所とお店の距離', () => {
  it('場所によって売れる数が変わる（家の多い所・駅の近くほど売れる）', () => {
    const s = newP1(7);
    const u = spots(s, 'general_store').map(([i, j]) => sum(capture(s, 'Sensu', [me(i, j)])));
    expect(Math.max(...u)).toBeGreaterThan(Math.min(...u) * 1.5);
  });
  it('自社のお店を隣に固めてもお客さんはほとんど増えず、離して出すと増える', () => {
    const s = newP1(7);
    const all = spots(s, 'general_store');
    const [a] = [...all].sort((x, y) => sum(capture(s, 'Sensu', [me(y[0], y[1])])) - sum(capture(s, 'Sensu', [me(x[0], x[1])])));
    const one = sum(capture(s, 'Sensu', [me(a[0], a[1])]));
    const near = [...all].filter((p) => p[0] !== a[0] || p[1] !== a[1]).sort((x, y) => Math.abs(x[0] - a[0]) + Math.abs(x[1] - a[1]) - (Math.abs(y[0] - a[0]) + Math.abs(y[1] - a[1])))[0];
    const adj = sum(capture(s, 'Sensu', [me(a[0], a[1]), me(near[0], near[1])])) - one;
    const spread = Math.max(...all.map((p) => sum(capture(s, 'Sensu', [me(a[0], a[1]), me(p[0], p[1])])) - one));
    expect(adj).toBeLessThan(one * 0.15);
    expect(spread).toBeGreaterThan(adj * 3);
  });
  it('他社の近くで同じ商品を売ると、他社の売上を奪う（離れていれば奪わない）', () => {
    const s = newP1(7);
    const lamp = s.buildings.find((b) => b.owner === 'lamp')!;
    const rv = rivalOffers(s, 'Lantern');
    const li = rv.findIndex((o) => o.rid === 'lamp');
    const before = capture(s, 'Lantern', rv)[li];
    const all = spots(s, 'general_store');
    const d = (p: [number, number, unknown]) => Math.abs(p[0] - lamp.i) + Math.abs(p[1] - lamp.j);
    const near = [...all].sort((x, y) => d(x) - d(y))[0];
    const far = [...all].sort((x, y) => d(y) - d(x))[0];
    const lostNear = before - capture(s, 'Lantern', [me(near[0], near[1]), ...rv])[li + 1];
    const lostFar = before - capture(s, 'Lantern', [me(far[0], far[1]), ...rv])[li + 1];
    expect(lostNear).toBeGreaterThan(lostFar * 2);
  });
  it('遠いお店ほど運ぶ日数がかかり、物流拠点をそばに建てると縮む', () => {
    const s = newP1(7);
    s.money = 1e6;
    const ws = spots(s, 'workshop').sort((x, y) => Math.abs(x[0] - 7) + Math.abs(x[1] - 8) - (Math.abs(y[0] - 7) + Math.abs(y[1] - 8)))[0];
    build(s, 'workshop', ...ws);
    for (let k = 0; k < 5; k++) step(s);
    const far = spots(s, 'general_store').sort((x, y) => Math.abs(y[0] - ws[0]) + Math.abs(y[1] - ws[1]) - (Math.abs(x[0] - ws[0]) + Math.abs(x[1] - ws[1])))[0];
    const near = spots(s, 'general_store').sort((x, y) => Math.abs(x[0] - ws[0]) + Math.abs(x[1] - ws[1]) - (Math.abs(y[0] - ws[0]) + Math.abs(y[1] - ws[1])))[0];
    expect(siteInfo(s, 'general_store', ...far)!.days).toBeGreaterThan(siteInfo(s, 'general_store', ...near)!.days * 2);
    const shop = build(s, 'general_store', ...far);
    if (typeof shop === 'string') throw new Error(shop);
    for (let k = 0; k < 6; k++) step(s);
    s.skills.push('hub');
    const before = oneWay(s, shop).days;
    const by = spots(s, 'logistics').sort((x, y) => Math.abs(x[0] - far[0]) + Math.abs(x[1] - far[1]) - (Math.abs(y[0] - far[0]) + Math.abs(y[1] - far[1])))[0];
    const info = depotInfo(s, ...by);
    expect(info[0].after).toBeLessThan(before * 0.7);
  });
});
