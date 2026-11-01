/**
 * スキルツリーのパネル（ひし形・アイコンだけ）の配置と線（docs/ISLAND_PHASE1.md「スキルツリー」の「パネルの形・間隔・線」）。
 */
import { describe, expect, it } from 'vitest';
import { SKILL } from '../src/island/p1/data';
import { BOUNDS, EDGES, GAP, HUBPOS, PANEL, POS, RING_OUT, STEP, UNIT, curveNear, edgeBends, edgeEnd, rimDist } from '../src/island/p1/treelayout';

describe('スキルツリー：ひし形のパネルの大きさと間隔', () => {
  it('パネルはひし形の外接の幅 UNIT の 0.6〜0.7（64px）。段の間・パネルの間は、ひし形のすき間が 0.8〜1 枚分', () => {
    expect(PANEL).toBeGreaterThanOrEqual(0.6);
    expect(PANEL).toBeLessThanOrEqual(0.7);
    expect(Math.round(PANEL * UNIT)).toBe(64);
    for (const d of [GAP, STEP]) {
      expect((d - PANEL) / PANEL).toBeGreaterThanOrEqual(0.8);
      expect((d - PANEL) / PANEL).toBeLessThanOrEqual(1);
    }
  });

  it('どのひし形も、ほかのひし形と重ならない（すき間はいちばん近い 2 枚でもひし形の幅の 0.6 枚分以上）。枝の根もとの札とも重ならない', () => {
    const ps = [...POS.entries()];
    for (let i = 0; i < ps.length; i++)
      for (let j = i + 1; j < ps.length; j++) {
        // 同じ向きのひし形（|x| + |y| ≤ PANEL / 2）どうしは、中心の L1 の距離が PANEL を超えれば重ならない
        const l1 = Math.abs(ps[i][1].x - ps[j][1].x) + Math.abs(ps[i][1].y - ps[j][1].y);
        expect(l1 - PANEL, `${ps[i][0]}–${ps[j][0]}`).toBeGreaterThan(PANEL * 0.6);
      }
    for (const [, p] of HUBPOS) for (const [id, q] of ps) expect(Math.hypot(p.x - q.x, p.y - q.y), id).toBeGreaterThan(0.9);
  });

  it('全体が広がりすぎない（いちばん外の段の半径 21 UNIT まで。PC の「全体」で 1 画面に収まる）', () => {
    expect(RING_OUT.L).toBeLessThanOrEqual(21);
    expect(Math.max(-BOUNDS.x0, BOUNDS.x1, -BOUNDS.y0, BOUNDS.y1)).toBeLessThanOrEqual(21);
    // PC 1280×800 の木の高さ（約 650px）で、拡大率の下限 0.15 より大きく全体が入る
    expect(650 / (2 * (RING_OUT.L + 0.9) * UNIT)).toBeGreaterThan(0.15);
  });
});

describe('スキルツリー：つながりの線', () => {
  it('線は先に要るパネル（無ければ枝の根もと）から。両端のパネルはある', () => {
    expect(EDGES.length).toBeGreaterThan(300);
    for (const e of EDGES) {
      expect(SKILL[e.to], e.to).toBeTruthy();
      if (e.from) expect(POS.has(e.from), e.from).toBe(true);
      expect(edgeEnd(e.from, e.br)).toBeTruthy();
    }
    for (const k of Object.values(SKILL)) if (k.requires?.length && !k.sealed) for (const r of k.requires) expect(EDGES.some((e) => e.from === r && e.to === k.id), `${r} → ${k.id}`).toBe(true);
  });

  it('ひし形の縁で切る：横・縦はひし形の幅の半分、斜め 45° はその 1/√2', () => {
    expect(rimDist(1, 0)).toBeCloseTo(PANEL / 2);
    expect(rimDist(0, -1)).toBeCloseTo(PANEL / 2);
    expect(rimDist(Math.SQRT1_2, Math.SQRT1_2)).toBeCloseTo(PANEL / 2 / Math.SQRT2);
  });

  it('ほかのパネルを横切る線はゆるい弧にする。弧にしても横切る線は 1 割未満（1 本につき 1 枚まで）', () => {
    const bends = edgeBends();
    let straightHits = 0;
    let left = 0;
    for (const e of EDGES) {
      const a = edgeEnd(e.from, e.br);
      const b = edgeEnd(e.to, e.br);
      const others = [...POS].filter(([id]) => id !== e.from && id !== e.to);
      const hit = (bend: number) => others.filter(([, p]) => curveNear(a, b, bend, p, PANEL / 2 + 0.06)).length;
      if (hit(0)) straightHits++;
      const m = bends.get(e) ?? 0;
      expect(Math.abs(m)).toBeLessThanOrEqual(1.6);
      const n = hit(m);
      expect(n, `${e.from} → ${e.to}`).toBeLessThanOrEqual(1);
      if (n) left++;
    }
    expect(straightHits).toBeGreaterThan(0);
    expect(left).toBeLessThan(straightHits * 0.1);
  });
});
