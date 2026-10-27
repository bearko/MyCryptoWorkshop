import { describe, expect, it } from 'vitest';
import { aptitude } from '../src/island/p1/data';
import {
  allowedDirs,
  assign,
  build,
  canPlaceAt,
  craftCheck,
  facesRoad,
  heroStats,
  isRoad,
  learn,
  newP1,
  recommend,
  setShelf,
  startCraft,
  step,
  type P1State,
} from '../src/island/p1/model';

/** 道路に面した空き地を 1 つ探す */
function lot(s: P1State, id: string): [number, number, 'rd' | 'ld' | 'lu' | 'ru'] {
  for (let j = 0; j < s.n; j++)
    for (let i = 0; i < s.n; i++) {
      const d = allowedDirs(s, id, i, j);
      if (d.length) return [i, j, d[0]];
    }
  throw new Error('no lot');
}

/** 工房とお店を建てて、3 人を割り当てる */
function setup(s: P1State) {
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
  expect(startCraft(s, 0, 'Sensu:C')).toBeNull();
  return shop.uid;
}

describe('フェーズ 1：区画と建て方', () => {
  it('道路が縦横に通り、他社の店と住宅は入口が道路を向いている', () => {
    const s = newP1(3);
    expect(isRoad(s, 2, 5)).toBe(true);
    const rivals = s.buildings.filter((b) => b.owner !== 'me' && b.owner !== 'town');
    expect(rivals).toHaveLength(4);
    for (const b of s.buildings) expect(facesRoad(s, b.id, b.i, b.j, b.dir), b.id).toBe(true);
  });

  it('道路に面していない所には建てられず、向きは道路側だけ', () => {
    const s = newP1(3);
    const [i, j, d] = lot(s, 'workshop');
    for (const dir of allowedDirs(s, 'workshop', i, j)) expect(facesRoad(s, 'workshop', i, j, dir)).toBe(true);
    expect(canPlaceAt(s, 'workshop', i, j, d)).toBeNull();
    // 道路に面さない向き
    const bad = (['rd', 'ld', 'lu', 'ru'] as const).find((x) => !facesRoad(s, 'workshop', i, j, x));
    if (bad) expect(canPlaceAt(s, 'workshop', i, j, bad)).toBe('road');
  });

  it('お店は工房のあと。飲食は準備中', () => {
    const s = newP1(3);
    const [i, j, d] = lot(s, 'general_store');
    expect(canPlaceAt(s, 'general_store', i, j, d)).toBe('locked');
    expect(canPlaceAt(s, 'ramen', i, j, d)).toBe('soon');
  });
});

describe('フェーズ 1：従業員とサプライチェーン', () => {
  it('運搬はウォーリアー、製造はアーティスト、販売はタクティシャンが向いている', () => {
    const w = heroStats(10001);
    const tc = heroStats(10002);
    const a = heroStats(10003);
    expect(aptitude(w, 'transport')).toBeGreaterThan(Math.max(aptitude(tc, 'transport'), aptitude(a, 'transport')));
    expect(aptitude(a, 'craft')).toBeGreaterThan(Math.max(aptitude(w, 'craft'), aptitude(tc, 'craft')));
    expect(aptitude(tc, 'shop')).toBeGreaterThan(Math.max(aptitude(w, 'shop'), aptitude(a, 'shop')));
  });

  it('市場データのおすすめはセンス', () => {
    expect(recommend(newP1(3))).toBe('Sensu');
  });

  it('素材 → クラフト → 運搬 → 陳列 → 販売で売上が立ち、月末に報告とランキングが出る', () => {
    const s = newP1(3);
    setup(s);
    let report = null;
    for (let k = 0; k < 40 && !report; k++) report = step(s).report;
    expect(report).not.toBeNull();
    expect(report!.revenue).toBeGreaterThan(0);
    expect(report!.bySeries.Sensu).toBeGreaterThan(0);
    expect(report!.area.some((r) => r.me)).toBe(true);
    expect(report!.area).toHaveLength(5);
  });

  it('働き続けるとスタミナが減って休み、戻るとまた働く', () => {
    const s = newP1(3);
    setup(s);
    const artist = s.staff.find((x) => x.hero === 10003)!;
    let rested = false;
    for (let k = 0; k < 40; k++) {
      step(s);
      if (artist.resting) rested = true;
    }
    expect(rested).toBe(true);
  });

  it('アンコモンは魔法の釜と、製造の適性 60 以上の職人が要る', () => {
    const s = newP1(3);
    setup(s);
    s.mats.paper = 10;
    s.money = 1e6;
    expect(craftCheck(s, 'Sensu:U', 10003)).toBe('pot');
    learn(s, 'bench2');
    learn(s, 'pot');
    expect(craftCheck(s, 'Sensu:U', 10003)).toBe('skill');
  });

  it('独り占めが続くと他社が参入する', () => {
    const s = newP1(3);
    setup(s);
    s.mats.wood = 1000;
    for (let k = 0; k < 30 * 4; k++) step(s);
    expect(s.rivals.some((r) => (r.sells.Sensu ?? 0) > 0)).toBe(true);
    expect(s.reports.some((r) => r.news.length > 0)).toBe(true);
  });
});
