/**
 * 設備投資（建物ごと＝セクタごと）・制覇（2 か月続けて 1 位）・他社の反撃（docs/ISLAND_PHASE1.md「設備投資」「制覇」「他社の反撃」）。
 */
import { describe, expect, it } from 'vitest';
import { INVEST, MARKET, SKILL, SKILLS, SKILL_TO_INVEST, STORE, TRANSPORT, TOP_STREAK } from '../src/island/p1/data';
import { crowned, moveTo, recOf } from '../src/island/p1/land';
import {
  accept,
  allowedDirs,
  assign,
  benchCount,
  build,
  cartCap,
  cartsOf,
  craftDays,
  deserializeP1,
  invest,
  invLv,
  legDays,
  myShops,
  myWorkshop,
  newP1,
  openGate,
  partMax,
  poolCap,
  rivalOffers,
  serializeP1,
  setPart,
  setShelf,
  shelfCount,
  startCraft,
  step,
  storageCap,
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
function setup(s: P1State) {
  build(s, 'workshop', ...lot(s, 'workshop'));
  for (let k = 0; k < 4; k++) step(s);
  const shop = build(s, 'general_store', ...lot(s, 'general_store'));
  if (typeof shop === 'string') throw new Error(shop);
  for (let k = 0; k < 5; k++) step(s);
  assign(s, 10003, 'craft', 0);
  assign(s, 10001, 'transport');
  assign(s, 10002, 'shop', shop.uid);
  setShelf(s, shop.uid, 0, 'Sensu:C');
  expect(startCraft(s, 0, 'Sensu:C')).toBeNull();
  return shop.uid;
}
const run = (s: P1State, days: number) => {
  for (let k = 0; k < days; k++) step(s);
};
/** 他社をとても弱くして、毎月 1 位になれるようにする */
const weakRivals = (s: P1State) => {
  for (const r of s.rivals) {
    r.base = 0;
    r.sells = {};
  }
};

describe('設備投資（スキルツリーから移した設備）', () => {
  it('外したスキルはツリーに無く、設備投資の値段は以前のスキルと同じ', () => {
    for (const id of Object.keys(SKILL_TO_INVEST)) expect(SKILL[id]).toBeUndefined();
    expect(INVEST.shelves.cost).toEqual([3000, 9000]);
    expect(INVEST.staffroom.cost).toEqual([2500]);
    expect(INVEST.backroom.cost).toEqual([1500, 3000, 4000]);
    expect(INVEST.bench.cost).toEqual([5000, 22000]);
    expect(INVEST.stockroom.cost).toEqual([2500]);
    expect(INVEST.carts.cost).toEqual([3000, 7000]);
    expect(INVEST.truck.cost).toEqual([8000]);
    expect(INVEST.rack.cost).toEqual([6000]);
    expect(INVEST.rack.kind).toBe('warehouse');
    // 残るスキルの「先に要る」が、外したスキルを指していない
    for (const k of SKILLS) for (const r of k.requires ?? []) expect(SKILL[r]).toBeTruthy();
    expect(SKILL.shop2.requires).toEqual(['host']);
    expect(SKILL.shop3.requires).toEqual(['shop2']);
    expect(SKILL.display.requires).toBeUndefined();
    // v2：物流拠点は定期便の時刻表のあと（docs/ISLAND_PHASE1.md「スキルツリー」）
    expect(SKILL.hub.requires).toEqual(['timetable']);
  });

  it('工房：作業台・荷車・トラック・物置は、その工房の段で効く', () => {
    const s = newP1(21);
    setup(s);
    s.money = 1e6;
    const ws = myWorkshop(s)!;
    const days0 = craftDays(s, 'Sensu:C');
    const leg0 = legDays(s, 10);
    expect(benchCount(s)).toBe(1);
    expect(invest(s, ws.uid, 'bench')).toBeNull();
    expect(s.slots).toHaveLength(2);
    expect(craftDays(s, 'Sensu:C')).toBeCloseTo(days0);
    expect(invest(s, ws.uid, 'bench')).toBeNull();
    expect(s.slots).toHaveLength(3);
    expect(craftDays(s, 'Sensu:C')).toBeCloseTo(days0 * 0.8);
    expect(invest(s, ws.uid, 'bench')).toBe('max');
    expect(cartsOf(s)).toBe(1);
    invest(s, ws.uid, 'carts');
    invest(s, ws.uid, 'carts');
    expect(cartsOf(s)).toBe(3);
    expect(cartCap(s)).toBe(TRANSPORT.cap);
    invest(s, ws.uid, 'truck');
    expect(cartCap(s)).toBe(Math.round(TRANSPORT.cap * 2.5));
    expect(legDays(s, 10)).toBeCloseTo(leg0 / 1.5);
    const pool = poolCap(s);
    invest(s, ws.uid, 'stockroom');
    expect(poolCap(s)).toBe(pool + 40);
    // お店の設備は工房には付けられない
    expect(invest(s, ws.uid, 'shelves')).toBe('locked');
  });

  it('お店：棚・アルバイトの上限・裏の倉庫は、そのお店だけ', () => {
    const s = newP1(22);
    const uid = setup(s);
    s.money = 1e6;
    const b = s.buildings.find((x) => x.uid === uid)!;
    expect(shelfCount(s, b)).toBe(1);
    expect(invest(s, uid, 'shelves')).toBeNull();
    expect(s.shops[uid].shelves).toHaveLength(2);
    expect(partMax(s, uid)).toBe(1);
    expect(invest(s, uid, 'staffroom')).toBeNull();
    expect(partMax(s, uid)).toBe(3);
    expect(setPart(s, uid, 3)).toBe(true);
    expect(s.shops[uid].part).toBe(3);
    expect(storageCap(b)).toBe(20);
    invest(s, uid, 'backroom');
    expect(storageCap(b)).toBe(40);
    // 2 軒目は、まだ何も付いていない
    const two = build(s, 'general_store', ...lot(s, 'general_store'));
    if (typeof two === 'string') throw new Error(two);
    run(s, 6);
    expect(s.shops[two.uid].shelves).toHaveLength(1);
    expect(partMax(s, two.uid)).toBe(1);
  });

  it('倉庫：高い棚はその倉庫だけ +100', () => {
    const s = newP1(23);
    setup(s);
    s.money = 1e6;
    const w = build(s, 'warehouse', ...lot(s, 'warehouse'));
    if (typeof w === 'string') throw new Error(w);
    run(s, 6);
    const pool = poolCap(s);
    expect(pool).toBe(STORE.base + STORE.warehouse);
    expect(invest(s, w.uid, 'rack')).toBeNull();
    expect(poolCap(s)).toBe(pool + 100);
    expect(invest(s, w.uid, 'rack')).toBe('max');
  });

  it('設備は建物ごと：新しいセクタでは入れ直す（タオックスの設備は持ち込めない）', () => {
    const s = newP1(24);
    setup(s);
    s.money = 1e6;
    const ws = myWorkshop(s)!;
    invest(s, ws.uid, 'bench');
    invest(s, ws.uid, 'carts');
    invest(s, myShops(s)[0].uid, 'shelves');
    expect(benchCount(s)).toBe(2);
    openGate(s);
    expect(moveTo(s, 'c2', 10002)).toBeNull();
    expect(benchCount(s)).toBe(1);
    expect(cartsOf(s)).toBe(1);
    setup(s);
    expect(s.slots).toHaveLength(1);
    expect(s.shops[myShops(s)[0].uid].shelves).toHaveLength(1);
    // タオックスに戻ると、タオックスの設備はそのまま
    expect(moveTo(s, 'c1', 10003)).toBeNull();
    expect(benchCount(s)).toBe(2);
    expect(s.slots).toHaveLength(2);
  });
});

describe('古いセーブ：設備のスキル → 設備投資', () => {
  it('外したスキルを取り除き、いまのセクタの工房・お店・倉庫に同じ段を付ける（お金は取らない）', () => {
    const s = newP1(25);
    const uid = setup(s);
    s.money = 1e6;
    const w = build(s, 'warehouse', ...lot(s, 'warehouse'));
    if (typeof w === 'string') throw new Error(w);
    run(s, 6);
    invest(s, uid, 'backroom');
    invest(s, uid, 'backroom');
    const money = s.money;
    s.skills.push('hire', 'shelf1', 'shelf2', 'bench2', 'cart2', 'truck', 'tidy', 'rack', 'parttime', 'backroom', 'loading');
    // 以前のセーブ：スキルで増えた作業台と棚が、もう並んでいる
    s.slots.push({ sku: null, worker: null, progress: 0, running: false, repeat: true });
    s.shops[uid].shelves.push(null, null);
    const o = JSON.parse(serializeP1(s));
    delete o.topStreak;
    delete o.rally;
    const back = deserializeP1(JSON.stringify(o))!;
    expect(back.skills).toEqual(['hire', 'loading']);
    expect(back.money).toBe(money);
    const ws = back.buildings.find((b) => b.owner === 'me' && b.id === 'workshop')!;
    const shop = back.buildings.find((b) => b.uid === uid)!;
    const wh = back.buildings.find((b) => b.uid === w.uid)!;
    expect(invLv(ws, 'bench')).toBe(1);
    expect(invLv(ws, 'carts')).toBe(1);
    expect(invLv(ws, 'truck')).toBe(1);
    expect(invLv(ws, 'stockroom')).toBe(1);
    expect(invLv(shop, 'shelves')).toBe(2);
    expect(invLv(shop, 'staffroom')).toBe(1);
    // 裏の倉庫：設備投資 2 段 ＋ スキル 1 段 ＝ 3 段（最大）
    expect(invLv(shop, 'backroom')).toBe(3);
    expect(invLv(wh, 'rack')).toBe(1);
    expect(back.slots).toHaveLength(2);
    expect(back.shops[uid].shelves).toHaveLength(3);
    expect(back.topStreak).toBe(0);
    expect(back.rally).toBe(0);
  });

  it('もう制覇していたセーブは、制覇のまま', () => {
    const s = newP1(26);
    s.cleared = true;
    const o = JSON.parse(serializeP1(s));
    delete o.topStreak;
    const back = deserializeP1(JSON.stringify(o))!;
    expect(back.cleared).toBe(true);
    expect(back.topStreak).toBe(TOP_STREAK);
  });

  it('ほかのセクタの以前の写しに戻ると、設備より多い作業台・棚は外す（商品は工房へ）', () => {
    const s = newP1(27);
    const uid = setup(s);
    s.money = 1e6;
    run(s, 10);
    openGate(s);
    expect(moveTo(s, 'c2', 10002)).toBeNull();
    // 以前の写し：スキルで作業台と棚が増えていた
    const snap = recOf(s, 'c1').snap as unknown as P1State;
    snap.slots.push({ sku: 'Sensu:C', worker: null, progress: 0, running: false, repeat: true });
    snap.shops[uid].shelves.push('Scissors:C');
    snap.shops[uid].storage['Scissors:C'] = 5;
    delete (snap as Partial<P1State>).topStreak;
    expect(moveTo(s, 'c1', 10003)).toBeNull();
    expect(s.slots).toHaveLength(1);
    expect(s.shops[uid].shelves).toHaveLength(1);
    expect(s.stock['Scissors:C']).toBe(5);
    expect(s.topStreak).toBe(0);
  });
});

describe('制覇（2 か月続けて 1 位）と他社の反撃', () => {
  it('1 位 1 回目：topStreak 1・まだ制覇でない・反撃 2 か月。2 か月目で制覇（研究成果は発表済み）', () => {
    const s = newP1(28);
    setup(s);
    // 制覇の 2 つ目の条件（研究成果の発表）は済ませておく（発掘 v2 の 5 段目。tests/island-p1-dig2e.test.ts）
    s.presented.push('c1');
    s.money = 1e6;
    weakRivals(s);
    run(s, 31);
    const r1 = s.reports.at(-1)!;
    expect(r1.rank).toBe(1);
    expect(r1.streak).toBe(1);
    expect(r1.rally?.months).toBe(MARKET.rallyMonths);
    expect(r1.rally?.by).toBeTruthy();
    expect(s.topStreak).toBe(1);
    expect(s.cleared).toBe(false);
    expect(s.rally).toBe(2);
    expect(crowned(s, 'c1')).toBe(false);
    run(s, 30);
    const r2 = s.reports.at(-1)!;
    expect(r2.streak).toBe(2);
    expect(r2.rally).toBeUndefined();
    expect(s.cleared).toBe(true);
    expect(s.rally).toBe(1);
    expect(crowned(s, 'c1')).toBe(true);
    run(s, 30);
    expect(s.rally).toBe(0);
    expect(s.topStreak).toBe(3);
  });

  it('1 位を取られたら topStreak は 0 に戻り、また 1 位を取ると反撃が始まる', () => {
    const s = newP1(29);
    setup(s);
    s.money = 1e6;
    weakRivals(s);
    run(s, 31);
    expect(s.topStreak).toBe(1);
    // 他社がとても強くなった
    for (const r of s.rivals) r.base = 1e7;
    run(s, 30);
    expect(s.topStreak).toBe(0);
    expect(s.cleared).toBe(false);
    for (const r of s.rivals) r.base = 0;
    run(s, 30);
    expect(s.topStreak).toBe(1);
    expect(s.reports.at(-1)!.rally).toBeTruthy();
    expect(s.rally).toBe(2);
  });

  it('反撃中は他社の売り場の強さ ×MARKET.rally', () => {
    const s = newP1(30);
    const base = rivalOffers(s, 'Lantern');
    s.rally = 2;
    const up = rivalOffers(s, 'Lantern');
    expect(up.length).toBe(base.length);
    up.forEach((o, k) => expect(o.w).toBeCloseTo(base[k].w * MARKET.rally));
  });

  it('「○○で 1 位」の依頼は、制覇（2 か月続けて 1 位）で達成', () => {
    const s = newP1(31);
    s.money = 1e6;
    openGate(s);
    expect(moveTo(s, 'c2', null)).toBeNull();
    setup(s);
    weakRivals(s);
    expect(accept(s, 'c2_top')).toBeNull();
    s.presented.push('c2');
    run(s, 31);
    expect(s.topStreak).toBe(1);
    expect(s.missions.c2_top).toBe('accepted');
    run(s, 30);
    expect(s.cleared).toBe(true);
    expect(s.missions.c2_top).toBe('done');
  });
});
