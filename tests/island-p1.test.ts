import { describe, expect, it } from 'vitest';
import { aptitude } from '../src/island/p1/data';
import {
  allowedDirs,
  assign,
  bonus,
  build,
  canMoveTo,
  claim,
  demolish,
  develop,
  deserializeP1,
  facilityStatus,
  buy,
  fullUse,
  procCap,
  procMats,
  procQty,
  setProcQty,
  toggleProcExtra,
  toggleProcItem,
  intelLv,
  invest,
  myWorkshop,
  raise,
  relocate,
  runAd,
  serializeP1,
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

  it('アンコモンは魔法の釜・商品開発と、製造の適性 60 以上の職人が要る', () => {
    const s = newP1(3);
    setup(s);
    s.mats.paper = 10;
    s.money = 1e6;
    expect(craftCheck(s, 'Sensu:U', 10003)).toBe('pot');
    learn(s, 'bench2');
    learn(s, 'pot');
    s.dev.push('Sensu');
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

describe('フェーズ 1：タイルの操作とメニューの仕組み', () => {
  it('お店を移転すると費用を払って休業し、在庫はそのまま', () => {
    const s = newP1(5);
    const uid = setup(s);
    for (let k = 0; k < 10; k++) step(s);
    s.money = 50000;
    const b = s.buildings.find((x) => x.uid === uid)!;
    let to: [number, number, 'rd' | 'ld' | 'lu' | 'ru'] | null = null;
    for (let j = 0; j < s.n && !to; j++)
      for (let i = 0; i < s.n && !to; i++) {
        const d = allowedDirs(s, 'general_store', i, j, uid);
        if (d.length && (i !== b.i || j !== b.j)) to = [i, j, d[0]];
      }
    expect(to).not.toBeNull();
    const stock = JSON.stringify(s.shops[uid].storage);
    expect(relocate(s, uid, ...to!)).toBeNull();
    expect(s.money).toBe(48000);
    expect(b.left).toBeGreaterThan(0);
    expect([b.i, b.j]).toEqual([to![0], to![1]]);
    expect(JSON.stringify(s.shops[uid].storage)).toBe(stock);
    // 自分のいまの場所にも置き直せる（自分のマスは空いているとみなす）
    for (let k = 0; k < 5; k++) step(s);
    expect(canMoveTo(s, uid, b.i, b.j, b.dir)).toBeNull();
  });

  it('お店を撤去すると 3 割が戻り、在庫は工房へ。工房は撤去できない', () => {
    const s = newP1(5);
    const uid = setup(s);
    for (let k = 0; k < 12; k++) step(s);
    const inShop = Object.values(s.shops[uid].storage).reduce<number>((a, n) => a + (n ?? 0), 0) + Object.values(s.shops[uid].shelf).reduce<number>((a, n) => a + (n ?? 0), 0);
    const before = (s.stock['Sensu:C'] ?? 0) + inShop;
    const m = s.money;
    expect(demolish(s, uid)).toBeNull();
    expect(s.money).toBe(m + 900);
    expect(s.shops[uid]).toBeUndefined();
    expect(s.stock['Sensu:C']).toBe(before);
    expect(demolish(s, myWorkshop(s)!.uid)).toBe('workshop');
  });

  it('設備投資は段ごとに値段が上がり、看板でお店が強くなる', () => {
    const s = newP1(5);
    const uid = setup(s);
    s.money = 100000;
    expect(invest(s, uid, 'sign')).toBeNull();
    expect(invest(s, uid, 'sign')).toBeNull();
    expect(s.money).toBe(100000 - 2000 - 4000);
    expect(invest(s, uid, 'tools')).toBe('locked');
    expect(invest(s, uid, 'backroom')).toBeNull();
    expect(invest(s, uid, 'backroom')).toBeNull();
    expect(invest(s, uid, 'backroom')).toBe('max');
  });

  it('アンコモンは魔法の釜のあと、商品開発してから作れる', () => {
    const s = newP1(5);
    setup(s);
    s.money = 100000;
    s.mats.paper = 50;
    expect(develop(s, 'Sensu')).toBe('pot');
    learn(s, 'bench2');
    learn(s, 'pot');
    s.staff.push({ ...s.staff[2], hero: 99999, stats: { hp: 200, phy: 70, int: 70, agi: 70 }, task: null, target: null });
    expect(craftCheck(s, 'Sensu:U', 99999)).toBe('dev');
    expect(develop(s, 'Sensu')).toBeNull();
    expect(develop(s, 'Lantern')).toBe('busy');
    let done = false;
    for (let k = 0; k < 10; k++) done = step(s).developed.includes('Sensu') || done;
    expect(done).toBe(true);
    expect(craftCheck(s, 'Sensu:U', 99999)).toBeNull();
  });

  it('他社の調査は日がたつと段階的に進み、終わると手が空く', () => {
    const s = newP1(5);
    setup(s);
    const rid = s.rivals[0].id;
    expect(assign(s, 10002, 'intel', rid)).toBeNull();
    const seen: number[] = [];
    for (let k = 0; k < 40; k++) for (const x of step(s).intel) seen.push(x.lv);
    expect(seen).toEqual([1, 2, 3]);
    expect(intelLv(s, rid)).toBe(3);
    expect(s.staff.find((x) => x.hero === 10002)!.task).toBeNull();
  });

  it('依頼を達成すると報酬を受け取れる。宣伝は費用が宣伝費に入る', () => {
    const s = newP1(5);
    setup(s);
    s.money = 20000;
    expect(claim(s, 'ad')).toBe('not-yet');
    expect(runAd(s, 'flyer')).toBeNull();
    expect(runAd(s, 'flyer')).toBe('busy');
    expect(s.monthCost.ads).toBe(1500);
    const r = step(s);
    expect(r.missions).toContain('ad');
    const m = s.money;
    expect(claim(s, 'ad')).toBeNull();
    expect(s.money).toBe(m + 1000);
    expect(claim(s, 'ad')).toBe('not-yet');
  });

  it('賞与でスタミナが戻り、昇給は 3 段まで', () => {
    const s = newP1(5);
    setup(s);
    const st = s.staff[0];
    st.stamina = 10;
    st.resting = true;
    s.money = 10000;
    expect(bonus(s, st.hero)).toBeNull();
    expect(st.stamina).toBe(st.stats.hp);
    expect(st.resting).toBe(false);
    for (let k = 0; k < 3; k++) expect(raise(s, st.hero)).toBeNull();
    expect(raise(s, st.hero)).toBe('max');
    expect(st.wage).toBeGreaterThan(0);
  });

  it('お店ごとの先月の売上と費用が残り、セーブから戻せる', () => {
    const s = newP1(5);
    const uid = setup(s);
    for (let k = 0; k < 40; k++) step(s);
    const last = s.shops[uid].last!;
    expect(last.rev).toBeGreaterThan(0);
    expect(last.cost).toBeGreaterThan(1200);
    expect(s.rivalLast[s.rivals[0].id].total).toBeGreaterThan(0);
    const back = deserializeP1(serializeP1(s))!;
    expect(back.shops[uid].last).toEqual(last);
    // 古いセーブ（新しい項目が無い）も読める
    const old = JSON.parse(serializeP1(s));
    delete old.dev;
    delete old.ads;
    delete old.missions;
    const o2 = deserializeP1(JSON.stringify(old))!;
    expect(o2.dev).toEqual([]);
    expect(o2.missions).toEqual({});
  });
});

describe('フェーズ 1：地図の吹き出し', () => {
  it('動いていれば作っている・売っている商品、止まっていれば理由', () => {
    const s = newP1(5);
    const uid = setup(s);
    const ws = myWorkshop(s)!;
    const shop = s.buildings.find((b) => b.uid === uid)!;
    expect(facilityStatus(s, ws)).toEqual({ kind: 'craft', items: ['Sensu:C'] });
    expect(facilityStatus(s, shop)).toEqual({ level: 'warn', stop: 'soldOut' });
    for (let k = 0; k < 6; k++) step(s);
    expect(facilityStatus(s, shop)).toEqual({ kind: 'sell', items: ['Sensu:C'] });
    assign(s, 10002, null);
    expect(facilityStatus(s, shop)).toEqual({ level: 'error', stop: 'noClerk' });
    assign(s, 10003, null);
    expect(facilityStatus(s, ws)).toEqual({ level: 'error', stop: 'noCrafter' });
    // 他社や町の建物には出さない
    expect(facilityStatus(s, s.buildings.find((b) => b.owner === 'town')!)).toBeNull();
  });
});

describe('フェーズ 1：調達', () => {
  it('月に買える数には上限があり、買うとランクが上がって上限が増える', () => {
    const s = newP1(5);
    s.money = 1e6;
    expect(procCap(s)).toBe(100);
    expect(buy(s, 'wood', 101)).toBe('cap');
    expect(buy(s, 'wood', 100)).toBeNull();
    // 105 の経験値で Lv.2（上限 120）。今月はあと 20 個
    expect(s.proc.lv).toBe(2);
    expect(procCap(s)).toBe(120);
    expect(buy(s, 'wood', 21)).toBe('cap');
    expect(buy(s, 'wood', 20)).toBeNull();
    learn(s, 'stock1');
    expect(procCap(s)).toBe(Math.round((100 + 20 * (s.proc.lv - 1)) * 1.3));
  });

  it('作りたいエクステから買う素材が決まり、ほかの素材も足せる', () => {
    const s = newP1(5);
    setup(s);
    expect(procMats(s).map((x) => x.m)).toEqual(['wood']);
    toggleProcItem(s, 'Lantern:C');
    expect(procMats(s).map((x) => x.m)).toEqual(['wood', 'iron', 'glass']);
    toggleProcExtra(s, 'clay');
    expect(procMats(s).find((x) => x.m === 'clay')?.from).toBe('extra');
    // 100% のときの消費：センス（2 日・木材 3）を速さ 1 で 30 日 → 45
    expect(fullUse(s).wood).toBeGreaterThanOrEqual(45);
  });

  it('調達係がいると月の量を毎日分けて買い、量は先月の消費が初期値', () => {
    const s = newP1(5);
    setup(s);
    s.mats.wood = 0;
    s.staff.push({ ...s.staff[0], hero: 99998, task: null, target: null });
    assign(s, 99998, 'buy');
    // 先月が無いときは 100% のときの消費
    expect(procQty(s, 'wood')).toBe(fullUse(s).wood);
    setProcQty(s, 'wood', 60);
    for (let k = 0; k < 10; k++) step(s);
    expect(s.proc.bought).toBe(20);
    setProcQty(s, 'wood', null);
    for (let k = 0; k < 40; k++) step(s);
    // 締めのあとは先月の消費に合わせる
    expect(s.matUsedLast?.wood).toBeGreaterThan(0);
    expect(procQty(s, 'wood')).toBe(s.matUsedLast!.wood);
    expect(s.utilLast!.cap).toBeGreaterThan(0);
  });
});
