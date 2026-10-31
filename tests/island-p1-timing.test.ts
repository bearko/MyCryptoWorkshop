/**
 * 時間を「工夫」で作る（docs/ISLAND_PHASE1.md「技の修行」「新商品の認知」「他社の追随」）。
 * 技は職人が修行して身につける・新しい商品は知られるまで売れにくい・独り占めの商品には他社が追随する。
 */
import { describe, expect, it } from 'vitest';
import { AWARE_GOODS, ENTRY_AFTER, MARKET, SKILL, aptitude } from '../src/island/p1/data';
import {
  allowedDirs,
  assign,
  build,
  endMonth,
  has,
  knownOf,
  learn,
  market,
  newP1,
  runAd,
  saturated,
  sellEstimate,
  sellersOf,
  setShelf,
  step,
  trainDays,
  trainees,
  type P1State,
} from '../src/island/p1/model';

function lot(s: P1State, id: string): [number, number, 'rd' | 'ld' | 'lu' | 'ru'] {
  for (let j = 0; j < s.n; j++)
    for (let i = 0; i < s.n; i++) {
      const d = allowedDirs(s, id, i, j);
      if (d.length) return [i, j, d[0]];
    }
  throw new Error('no lot');
}

/** 工房とお店を建てて、店員を置き、棚に x を並べる（棚の数は満タン） */
function shopWith(s: P1State, x: `${string}:${'C' | 'U'}`) {
  s.money = 1e6;
  build(s, 'workshop', ...lot(s, 'workshop'));
  for (let k = 0; k < 4; k++) step(s);
  const shop = build(s, 'general_store', ...lot(s, 'general_store'));
  if (typeof shop === 'string') throw new Error(shop);
  for (let k = 0; k < 5; k++) step(s);
  assign(s, 10002, 'shop', shop.uid);
  setShelf(s, shop.uid, 0, x);
  s.shops[shop.uid].shelf[x] = 10;
  return shop.uid;
}

describe('技の修行', () => {
  it('修行の日数は製造の適性で縮む（適性 100 で −40%）。匠の技は修行なし', () => {
    const s = newP1(1);
    const st = s.staff[0];
    expect(SKILL.t_glass.train).toBe(14);
    expect(SKILL.t_jewel.train).toBe(20);
    expect(SKILL.t_master.train).toBeUndefined();
    st.stats = { hp: 100, phy: 0, int: 0, agi: 0 };
    expect(trainDays(s, 't_glass', st)).toBe(14);
    st.stats = { hp: 100, phy: 100, int: 100, agi: 100 };
    expect(trainDays(s, 't_glass', st)).toBe(Math.round(14 * 0.6));
    st.stats = { hp: 100, phy: 50, int: 50, agi: 50 };
    expect(trainDays(s, 't_glass', st)).toBe(Math.round(14 * 0.8));
    expect(trainDays(s, 't_master', st)).toBe(0);
  });

  it('技（研究パネル）を取ると、RP は払うが修行中。職人は作業台を離れ、終わったら身につけて元の作業台へ戻る', () => {
    const s = newP1(2);
    shopWith(s, 'Sensu:C');
    assign(s, 10003, 'craft', 0);
    const best = trainees(s)[0];
    expect(best.hero).toBe([...s.staff].sort((a, b) => aptitude(b.stats, 'craft') - aptitude(a.stats, 'craft'))[0].hero);
    const money = s.money;
    s.rp = 1000;
    expect(learn(s, 't_glass', 10003)).toBeNull();
    expect(s.money).toBe(money);
    expect(s.rp).toBe(1000 - SKILL.t_glass.rp!);
    expect(has(s, 't_glass')).toBe(false);
    const days = trainDays(s, 't_glass', 10003);
    expect(s.training).toMatchObject({ id: 't_glass', hero: 10003, left: days });
    const st = s.staff.find((x) => x.hero === 10003)!;
    expect(st.task).toBe('train');
    expect(s.slots[0].worker).toBeNull();
    // 修行中はほかの仕事に就けない・もう 1 つの技は取れない（修行は 1 つずつ）
    expect(assign(s, 10003, 'craft', 0)).toBe('training');
    expect(learn(s, 't_metal')).toBe('busy');
    expect(learn(s, 't_glass')).toBe('training');
    let learned: { id: string; hero: number }[] = [];
    for (let k = 0; k < days; k++) learned = step(s).learned ?? learned;
    expect(learned).toEqual([{ id: 't_glass', hero: 10003 }]);
    expect(has(s, 't_glass')).toBe(true);
    expect(s.training).toBeNull();
    expect(st.task).toBe('craft');
    expect(s.slots[0].worker).toBe(10003);
  });

  it('元の作業台がふさがっていたら、待機に戻る', () => {
    const s = newP1(3);
    shopWith(s, 'Sensu:C');
    assign(s, 10003, 'craft', 0);
    s.rp = 1000;
    learn(s, 't_wood', 10003);
    assign(s, 10001, 'craft', 0);
    for (let k = 0; k < 10 && s.training; k++) step(s);
    expect(has(s, 't_wood')).toBe(true);
    expect(s.staff.find((x) => x.hero === 10003)!.task).toBeNull();
    expect(s.slots[0].worker).toBe(10001);
  });
});

describe('新商品の認知', () => {
  it('タオックスは最初から 1（チュートリアルを変えない）。ほかのセクタは 0.3 から', () => {
    const c1 = newP1(4);
    expect(knownOf(c1, 'Sensu')).toBe(1);
    expect(knownOf(c1, 'Goblet')).toBe(1);
    const c2 = newP1(4, 'C', 'c2');
    expect(knownOf(c2, 'Goblet')).toBe(AWARE_GOODS.start);
    expect(knownOf(c2, 'Sensu')).toBe(AWARE_GOODS.start);
    expect(market(c2).find((r) => r.p.key === 'Goblet')!.known).toBe(AWARE_GOODS.start);
  });

  it('売れる見込みに認知が掛かる', () => {
    const s = newP1(5, 'C', 'c2');
    const low = sellEstimate(s, 'Goblet');
    s.known.Goblet = 1;
    // 引き寄せが 0.3 倍なので、お客さんは「買わない」へ流れる（ちょうど 1/0.3 倍にはならない）
    expect(sellEstimate(s, 'Goblet')).toBeGreaterThan(low * 1.5);
  });

  it('棚に並んでいる日に +0.02、宣伝が効いている日はさらに +0.03。並べていない商品は変わらない', () => {
    const s = newP1(6, 'C', 'c2');
    shopWith(s, 'Sensu:C');
    const k0 = knownOf(s, 'Sensu');
    step(s);
    expect(knownOf(s, 'Sensu')).toBeCloseTo(k0 + AWARE_GOODS.perDay);
    expect(knownOf(s, 'Goblet')).toBe(AWARE_GOODS.start);
    expect(runAd(s, 'flyer')).toBeNull();
    const k1 = knownOf(s, 'Sensu');
    step(s);
    expect(knownOf(s, 'Sensu')).toBeCloseTo(k1 + AWARE_GOODS.perDay + AWARE_GOODS.ad);
    for (let k = 0; k < 60; k++) step(s);
    expect(knownOf(s, 'Sensu')).toBe(1);
  });

  it('タオックスでは育てない（いつも 1）', () => {
    const s = newP1(7);
    shopWith(s, 'Sensu:C');
    step(s);
    expect(s.known.Sensu).toBeUndefined();
    expect(knownOf(s, 'Sensu')).toBe(1);
  });
});

describe('他社の追随', () => {
  /** 自社だけがその商品を売っている月を n 回締める */
  const months = (s: P1State, key: string, n: number) => {
    let news: string[] = [];
    for (let k = 0; k < n; k++) {
      s.monthSales[key] = 5000;
      news = news.concat(endMonth(s).news);
    }
    return news;
  };

  it('gap の商品も、ENTRY_AFTER か月ごとに 1 社ずつ参入し、2 社目で飽和する', () => {
    const s = newP1(8, 'C', 'c2');
    expect(sellersOf(s, 'Goblet')).toBe(0);
    expect(months(s, 'Goblet', ENTRY_AFTER - 1)).toEqual([]);
    const first = months(s, 'Goblet', 1);
    expect(first).toHaveLength(1);
    expect(first[0]).toMatch(/\|/);
    expect(sellersOf(s, 'Goblet')).toBe(1);
    expect(saturated(s, 'Goblet')).toBe(false);
    expect(market(s).find((r) => r.p.key === 'Goblet')!.gap).toBe(false);
    months(s, 'Goblet', ENTRY_AFTER);
    expect(sellersOf(s, 'Goblet')).toBe(MARKET.satAt);
    expect(saturated(s, 'Goblet')).toBe(true);
    // 飽和したら、それ以上は増えない
    months(s, 'Goblet', ENTRY_AFTER * 2);
    expect(sellersOf(s, 'Goblet')).toBe(MARKET.satAt);
  });

  it('参入した他社は 0.8 の強さで売る（ランクの倍率を掛けた月の成長のぶんだけ強くなる）', () => {
    const s = newP1(9, 'C', 'c3');
    months(s, 'Knife', ENTRY_AFTER);
    const r = s.rivals.find((x) => (x.sells.Knife ?? 0) > 0)!;
    expect(r.sells.Knife).toBeGreaterThan(0.8);
    expect(r.sells.Knife).toBeLessThan(0.82);
  });

  it('タオックスはいままでどおり、誰も売っていない商品に 1 社だけ', () => {
    const s = newP1(10);
    expect(sellersOf(s, 'Sensu')).toBe(0);
    months(s, 'Sensu', ENTRY_AFTER * 3);
    expect(sellersOf(s, 'Sensu')).toBe(1);
  });
});
