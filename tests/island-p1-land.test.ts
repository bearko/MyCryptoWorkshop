import { describe, expect, it } from 'vitest';
import { MANAGER, TIERS, rivalDef } from '../src/island/p1/data';
import { managerRate, pl, quarters, runSector, sectorState, type SectorRec } from '../src/island/p1/company';
import { moveTo, recOf } from '../src/island/p1/land';
import { allowedDirs, assign, build, deserializeP1, gateToll, heroStats, monthRevenue, newP1, openGate, serializeP1, setShelf, startCraft, step, type P1State } from '../src/island/p1/model';

function lot(s: P1State, id: string): [number, number, 'rd' | 'ld' | 'lu' | 'ru'] {
  for (let j = 0; j < s.n; j++)
    for (let i = 0; i < s.n; i++) {
      const d = allowedDirs(s, id, i, j);
      if (d.length) return [i, j, d[0]];
    }
  throw new Error('no lot');
}
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
const run = (s: P1State, days: number) => {
  for (let k = 0; k < days; k++) step(s);
};

describe('ブランド力', () => {
  it('はじめての売上で上がり、履歴に残る', () => {
    const s = newP1(5);
    setup(s);
    s.money = 1e6;
    run(s, 40);
    expect(s.flags.firstSale).toBe(true);
    expect(s.brand).toBeGreaterThanOrEqual(5);
    expect(s.brandLog!.at(-1)!.why).toContain('売上');
  });

  it('ランドセクタを制覇（2 か月続けて 1 位）すると大きく上がる', () => {
    const s = newP1(5);
    setup(s);
    s.money = 1e6;
    // 他社をとても弱くして 1 位にする
    for (const r of s.rivals) {
      r.base = 0;
      r.sells = {};
    }
    const before = s.brand ?? 0;
    // 研究成果は発表済み（制覇の 2 つ目の条件。発掘 v2 の 5 段目）
    s.presented.push('c1');
    run(s, 40);
    // 1 回目の 1 位ではまだ制覇ではない
    expect(s.reports.at(-1)!.rank).toBe(1);
    expect(s.cleared).toBe(false);
    run(s, 30);
    expect(s.cleared).toBe(true);
    expect((s.brand ?? 0) - before).toBeGreaterThanOrEqual(30);
  });
});

describe('帳簿（四半期の P/L・B/S）', () => {
  it('30 日ごとに会社の月を締め、売上は帳簿にも入る', () => {
    const s = newP1(6);
    setup(s);
    s.money = 1e6;
    run(s, 21); // 30 日目まで
    expect(s.books!.months).toHaveLength(1);
    run(s, 60);
    expect(s.books!.months).toHaveLength(3);
    const q = quarters(s.books!);
    expect(q).toHaveLength(1);
    expect(q[0].done).toBe(true);
    const total = s.books!.months.reduce((a, m) => a + m.l.sales, 0);
    expect(total).toBeGreaterThan(0);
    const r = pl(q[0].l);
    expect(r.gross).toBe(r.sales - r.cogs);
    expect(r.net).toBe(r.op + r.nonop - r.special);
    expect(q[0].bs!.cash).toBe(s.books!.months[2].bs.cash);
    void monthRevenue;
  });
});

describe('関所の先：ランドセクタ', () => {
  it('関所を開けるとランドが開く。Epic・Legendary は雲、Rare は Uncommon 2 つで開放', () => {
    const s = newP1(7);
    s.money = gateToll(s) + 1000;
    expect(openGate(s)).toBe(true);
    const land = s.land!;
    expect(land.cur).toBe('c1');
    expect(sectorState(land, 'c1')).toBe('here');
    expect(sectorState(land, 'c2')).toBe('open');
    expect(sectorState(land, 'u1')).toBe('open');
    expect(sectorState(land, 'r1')).toBe('locked');
    expect(sectorState(land, 'e1')).toBe('cloud');
    expect(sectorState(land, 'l1')).toBe('cloud');
    land.mine.push('u1', 'u2');
    expect(sectorState(land, 'r1')).toBe('soon');
  });

  it('建物があるセクタを離れるにはマネージャーが要る。新しいセクタは入国料を払って、まっさらから', () => {
    const s = newP1(8);
    const shop = setup(s);
    s.money = 1e6;
    run(s, 40);
    s.money = 1e6;
    openGate(s);
    expect(moveTo(s, 'c2', null)).toBe('manager');
    const money = s.money;
    expect(moveTo(s, 'c2', 10003)).toBeNull();
    expect(s.money).toBe(money - 5000);
    expect(s.sector).toBe('c2');
    expect(s.buildings.some((b) => b.owner === 'me')).toBe(false);
    expect(s.staff.find((x) => x.hero === 10003)!.task).toBe('manager');
    expect(s.staff.find((x) => x.hero === 10001)!.task).toBeNull();
    const rec = recOf(s, 'c1');
    expect(rec.snap).toBeTruthy();
    expect(rec.base?.rev).toBeGreaterThan(0);
    // マネージャーのセクタは、会社の月の締めでお金が動く
    const m0 = s.money;
    let managed = 0;
    for (let k = 0; k < 30; k++) managed += step(s).company?.managed.length ?? 0;
    expect(managed).toBe(1);
    expect(rec.log.length).toBe(1);
    expect(s.money).not.toBe(m0);
    // 戻ると、建物と担当が元どおり。マネージャーは本社の仕事に戻る
    expect(moveTo(s, 'c1', null)).toBeNull();
    expect(s.sector).toBe('c1');
    expect(s.buildings.some((b) => b.uid === shop && b.owner === 'me')).toBe(true);
    expect(s.staff.find((x) => x.hero === 10003)!.task).toBe('craft');
    expect(s.staff.find((x) => x.hero === 10002)!.task).toBe('shop');
    // c2 には建物が無いので、マネージャーは要らない
    expect(recOf(s, 'c2').snap).toBeTruthy();
  });

  it('Uncommon は地図が広く、他社が強い。調査依頼状・お金が足りなければ入れない', () => {
    const s = newP1(9);
    s.money = 1e6;
    openGate(s);
    expect(moveTo(s, 'u1', null)).toBe('letter');
    s.letters = ['U'];
    s.money = 1000;
    expect(moveTo(s, 'u1', null)).toBe('money');
    s.money = 1e6;
    expect(moveTo(s, 'u1', null)).toBeNull();
    // ウメコタウン（港町）の他社（セクタの個性）の売上に、ランクの倍率が掛かる
    const lamp0 = rivalDef(s.rivals[0].id)!.base;
    expect(s.n).toBe(TIERS.U.n);
    expect(s.ground).toHaveLength(TIERS.U.n * TIERS.U.n);
    expect(s.rivals[0].base).toBeCloseTo(lamp0 * TIERS.U.rival, 5);
    expect(s.tier).toBe('U');
    // セーブして読み直しても広さはそのまま
    const back = deserializeP1(serializeP1(s))!;
    expect(back.ground).toHaveLength(TIERS.U.n * TIERS.U.n);
    expect(back.land!.cur).toBe('u1');
  });

  it('マネージャーの適性が高いほど売上の倍率が上がり、低いと赤字にもなる', () => {
    expect(managerRate(28)).toBeLessThan(1);
    expect(managerRate(45)).toBeCloseTo(1, 1);
    expect(managerRate(80)).toBeGreaterThan(1.2);
    const rec: SectorRec = { id: 'c1', invest: 0.5, capital: 0, log: [], base: { rev: 20000, matRate: 0.3, fixed: 9000 } };
    const weak = runSector({ ...rec, log: [] }, { ...heroStats(10003), phy: 5, int: 5, agi: 5 }, 1, () => 0);
    expect(weak.profit).toBeLessThan(0);
    expect(weak.invest).toBe(0);
    const strong = runSector(rec, { hp: 100, phy: 90, int: 90, agi: 90 }, 1, () => 0.5);
    expect(strong.profit).toBeGreaterThan(0);
    expect(strong.invest).toBe(Math.round(strong.profit * 0.5));
    expect(rec.capital).toBe(strong.invest);
    // 投資したぶん次の月の売上が伸びる
    const next = runSector(rec, { hp: 100, phy: 90, int: 90, agi: 90 }, 2, () => 0.5);
    expect(next.rev).toBeGreaterThan(strong.rev);
    expect(MANAGER.choices).toContain(MANAGER.invest);
  });
});
