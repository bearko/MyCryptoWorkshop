/**
 * セクタごとの「売れる商材」と技の枝（docs/ISLAND_PHASE1.md「商品と技」）。
 * 商品 17・技が要る商品・飽和（他社 2 社以上）・gap の需要・おすすめ（recommend）と足りないもの（needFor）。
 */
import { describe, expect, it } from 'vitest';
import { MARKET, PRODUCT, PRODUCTS, SECTORS, SKILL, SKILLS, rivalsOf, sku, techSkill } from '../src/island/p1/data';
import { craftCheck, goodsMul, learn, market, needFor, newP1, recommend, saturated, sellEstimate, step, type P1State } from '../src/island/p1/model';

/** 技の修行が終わるまで日を進める（docs/ISLAND_PHASE1.md「技の修行」） */
const trainOut = (s: P1State) => {
  for (let k = 0; k < 40 && s.training; k++) step(s);
};

describe('商品 17 と技の枝', () => {
  it('商品は 17。技が要るのは 12 で、どれも技の枝のスキルがある', () => {
    expect(PRODUCTS).toHaveLength(17);
    const tech = PRODUCTS.filter((p) => p.tech);
    expect(tech).toHaveLength(12);
    for (const p of tech) expect(SKILL[techSkill(p.tech!)]?.branch).toBe('tech');
    expect(SKILLS.filter((k) => k.branch === 'tech').map((k) => k.id)).toEqual(['t_wood', 't_paper', 't_metal', 't_glass', 't_clay', 't_textile', 't_jewel', 't_master']);
    // U のレシピは C に 1 つ足したもの
    for (const p of PRODUCTS.slice(5)) expect(Object.keys(p.recipe.U).length).toBe(Object.keys(p.recipe.C).length + 1);
  });

  it('技が無いと作れない（craftCheck が tech）。技を取って修行が終わると作れる', () => {
    const s = newP1(1);
    s.money = 1e6;
    s.mats = { glass: 10, iron: 10, wood: 10 };
    expect(craftCheck(s, sku('Goblet', 'C'), null)).toBe('tech');
    expect(craftCheck(s, sku('Sensu', 'C'), null)).toBeNull();
    expect(learn(s, 't_glass')).toBeNull();
    // 修行中はまだ作れない
    expect(craftCheck(s, sku('Goblet', 'C'), null)).toBe('tech');
    trainOut(s);
    expect(craftCheck(s, sku('Goblet', 'C'), null)).toBeNull();
  });

  it('宝飾の技は金工の技のあと。匠の技は技を 3 つ取ってから', () => {
    const s = newP1(2);
    s.money = 1e6;
    expect(learn(s, 't_jewel')).toBe('requires');
    expect(learn(s, 't_master')).toBe('requires');
    learn(s, 't_metal');
    // 金工の技は修行中：まだ宝飾の技は取れない
    expect(learn(s, 't_jewel')).toBe('requires');
    trainOut(s);
    expect(learn(s, 't_jewel')).toBeNull();
    trainOut(s);
    expect(learn(s, 't_master')).toBe('requires');
    learn(s, 't_wood');
    trainOut(s);
    // 匠の技は修行なし（即日）
    expect(learn(s, 't_master')).toBeNull();
    expect(s.skills).toContain('t_master');
  });

  it('匠の技は、技が要る商品だけ売り場の強さ +15%', () => {
    const s = newP1(3, 'C', 'c2');
    const g0 = goodsMul(s, 'Goblet', 'C');
    s.skills.push('t_master');
    expect(goodsMul(s, 'Goblet', 'C')).toBeCloseTo(g0 * 1.15);
    expect(goodsMul(s, 'Mallet', 'C')).toBeCloseTo(1);
  });
});

describe('セクタの gap と飽和', () => {
  it('gap の商品はどの他社も売っていない。タオックスの外では、センスと鋏を他社 2 社以上が扱う', () => {
    for (const d of SECTORS.filter((x) => (x.tier === 'C' || x.tier === 'U') && !x.soon)) {
      const gap = d.profile.gap ?? [];
      expect(gap.length).toBeGreaterThanOrEqual(2);
      for (const k of gap) expect(PRODUCT[k]).toBeTruthy();
      if (d.id === 'c1') continue;
      const rv = rivalsOf(d.id);
      for (const k of gap) expect(rv.some((r) => (r.sells[k] ?? 0) > 0)).toBe(false);
      for (const k of ['Sensu', 'Scissors']) expect(rv.filter((r) => (r.sells[k] ?? 0) > 0).length).toBeGreaterThanOrEqual(2);
    }
  });

  it('gap の需要は 1.4〜1.8 倍。gap でない技の商品は MARKET.niche 倍、オルゴールは Common では出ない', () => {
    for (const d of SECTORS.filter((x) => (x.tier === 'C' || x.tier === 'U') && !x.soon && x.id !== 'c1'))
      for (const k of d.profile.gap ?? []) {
        const v = d.profile.demand?.[k] ?? 1;
        expect(v).toBeGreaterThanOrEqual(1.4);
        expect(v).toBeLessThanOrEqual(1.8);
      }
    const c2 = newP1(4, 'C', 'c2');
    expect(c2.demand.Goblet).toBeCloseTo(PRODUCT.Goblet.demand * 1.6);
    expect(c2.demand.Knife).toBeCloseTo(PRODUCT.Knife.demand * MARKET.niche);
    expect(c2.demand.MusicBox).toBe(0);
    expect(market(c2).some((r) => r.p.key === 'MusicBox')).toBe(false);
    const u1 = newP1(4, 'U', 'u1');
    expect(u1.demand.MusicBox).toBeGreaterThan(0);
  });

  it('飽和：他社 2 社以上が扱う商品は、自社の売り場の強さ ×0.45（Uncommon は ×0.7）。タオックスは飽和なし', () => {
    const c2 = newP1(5, 'C', 'c2');
    expect(saturated(c2, 'Sensu')).toBe(true);
    expect(saturated(c2, 'Lantern')).toBe(true);
    expect(saturated(c2, 'Goblet')).toBe(false);
    expect(saturated(c2, 'Mallet')).toBe(false);
    expect(goodsMul(c2, 'Sensu', 'C')).toBeCloseTo(MARKET.saturated);
    expect(goodsMul(c2, 'Sensu', 'U')).toBeCloseTo(MARKET.satU);
    // 同じ他社の並びでも、飽和なら売れる見込みが下がる
    const before = sellEstimate(c2, 'Sensu');
    c2.rivals.forEach((r) => {
      if (r.sells.Sensu) r.sells.Sensu = 0;
    });
    expect(sellEstimate(c2, 'Sensu')).toBeGreaterThan(before);
    // タオックスはいままでどおり（ランタンは 3 社が扱うが、飽和にしない）
    const c1 = newP1(5);
    expect(saturated(c1, 'Lantern')).toBe(false);
    expect(goodsMul(c1, 'Lantern', 'C')).toBe(1);
  });
});

describe('リサーチ：おすすめと足りないもの', () => {
  it('タオックスのおすすめはセンスのまま（チュートリアル）', () => {
    expect(recommend(newP1(3))).toBe('Sensu');
    expect(needFor(newP1(3), 'Sensu')).toBeNull();
  });

  it('ユーホタウンではゴブレット。まだ作れないので、足りないのは「ガラス細工」', () => {
    const s = newP1(6, 'C', 'c2');
    expect(recommend(s)).toBe('Goblet');
    expect(needFor(s, 'Goblet')).toEqual({ kind: 'tech', skill: 't_glass' });
    const row = market(s).find((r) => r.p.key === 'Goblet')!;
    expect(row.gap).toBe(true);
    expect(row.sellers).toBe(0);
    s.skills.push('t_glass');
    expect(needFor(s, 'Goblet')).toBeNull();
  });

  it('素材のルートが足りなければルート、Uncommon では魔法の釜 → 商品開発', () => {
    const c4 = newP1(7, 'C', 'c4');
    c4.skills.push('t_wood');
    expect(needFor(c4, 'Chair')).toEqual({ kind: 'route', skill: 'route_cloth', mat: 'cloth' });
    const u1 = newP1(7, 'U', 'u1');
    expect(['MusicBox', 'Compass']).toContain(recommend(u1));
    u1.skills.push('t_metal', 't_jewel');
    expect(needFor(u1, 'Compass')).toEqual({ kind: 'pot', skill: 'pot' });
    u1.skills.push('pot');
    expect(needFor(u1, 'Compass')).toEqual({ kind: 'dev', key: 'Compass' });
    u1.dev.push('Compass');
    expect(needFor(u1, 'Compass')).toBeNull();
  });
});
