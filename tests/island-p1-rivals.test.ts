import { describe, expect, it } from 'vitest';
import { MARKET_GROWTH, RIVAL, RIVAL_GROWTH } from '../src/island/p1/data';
import { endMonth, newP1 } from '../src/island/p1/model';

describe('他社の伸びと撤退（A・B）', () => {
  it('A：エクステ以外の売上は市場と同じだけ伸び、売り場の強さは扱い始めの pullCap 倍で頭打ち', () => {
    const s = newP1(1);
    const r = s.rivals[0];
    const key = Object.keys(r.sells)[0];
    const base0 = r.base;
    const pull0 = r.sells[key] ?? 0;
    for (let m = 0; m < 60; m++) endMonth(s);
    expect(r.base).toBeCloseTo(base0 * Math.pow(1 + MARKET_GROWTH, 60), 0);
    expect(r.sells[key] ?? 0).toBeCloseTo(pull0 * RIVAL.pullCap, 5);
    expect(RIVAL_GROWTH).toBeLessThan(MARKET_GROWTH);
  });

  it('B：追随で入った商品が売れない月が続くと撤退し、もう追随しない', () => {
    const s = newP1(1, 'C', 'c2');
    const r = s.rivals[0];
    r.sells.Goblet = 0.8;
    r.pull0 = { ...(r.pull0 ?? {}), Goblet: 0.8 };
    r.follow = { Goblet: 0 };
    // 自社だけがゴブレットを売っている（他社の売上 0）月が続く
    const other = Object.keys(r.sells).find((k) => k !== 'Goblet')!;
    for (let m = 0; m < RIVAL.weakMonths; m++) {
      s.monthSales.Goblet = 50000;
      // 他社はほかの商品では売れている（日を回したのと同じ記録）
      s.rivalProd[r.id] = { [other]: 30000 };
      const rep = endMonth(s);
      if (m === RIVAL.weakMonths - 1) expect(rep.news.some((n) => n.endsWith('|out'))).toBe(true);
    }
    expect(r.sells.Goblet).toBeUndefined();
    expect(r.quit).toContain('Goblet');
  });

  it('B：もとから扱っている商品は撤退しない', () => {
    const s = newP1(1, 'C', 'c2');
    const r = s.rivals[0];
    const key = Object.keys(r.sells)[0];
    for (let m = 0; m < 6; m++) {
      s.monthSales[key] = 900000;
      endMonth(s);
    }
    expect((r.sells[key] ?? 0) > 0).toBe(true);
  });
});
