// つながった地図（docs/ISLAND_PHASE1.md「つながった地図」）：階層と隣・シームレスな移動とマネージャーの交代・カメラの付け直し・縮小の札
import { describe, expect, it } from 'vitest';
import { SECTORS, TIERS } from '../src/island/p1/data';
import { moveTo, recOf, townSeed } from '../src/island/p1/land';
import { allowedDirs, assign, build, newP1, openGate, setShelf, startCraft, step, type P1State } from '../src/island/p1/model';
import { adjacent, camShift, enteredSector, ghostTown, layerOf, neighborsOf, sectorBadges, switchSector, tileOf } from '../src/island/p1/world';

function lot(s: P1State, id: string): [number, number, 'rd' | 'ld' | 'lu' | 'ru'] {
  for (let j = 0; j < s.n; j++)
    for (let i = 0; i < s.n; i++) {
      const d = allowedDirs(s, id, i, j);
      if (d.length) return [i, j, d[0]];
    }
  throw new Error('no lot');
}
const run = (s: P1State, days: number) => {
  for (let k = 0; k < days; k++) step(s);
};
/** 工房とお店を建てて 1 か月営業（月の報告がある） */
function business(s: P1State) {
  const [a, b, d] = lot(s, 'workshop');
  build(s, 'workshop', a, b, d);
  run(s, 4);
  const [x, y, e] = lot(s, 'general_store');
  const shop = build(s, 'general_store', x, y, e);
  if (typeof shop === 'string') throw new Error(shop);
  run(s, 5);
  assign(s, 10003, 'craft', 0);
  assign(s, 10001, 'transport');
  assign(s, 10002, 'shop', shop.uid);
  setShelf(s, shop.uid, 0, 'Sensu:C');
  expect(startCraft(s, 0, 'Sensu:C')).toBeNull();
  s.money = 1e6;
  run(s, 32);
  s.money = 1e6;
  return shop.uid;
}
/** 待機中のヒーローを 1 人足す（マネージャーの候補） */
function addIdle(s: P1State, hero: number, stats = { phy: 60, int: 60, agi: 60 }) {
  const base = s.staff[0];
  s.staff.push({ ...JSON.parse(JSON.stringify(base)), hero, task: null, target: null, resting: false, stats: { ...base.stats, ...stats } });
}

describe('階層と隣', () => {
  it('セクタはみな grid を持ち、同じ階層の中で位置が重ならない', () => {
    for (const d of SECTORS) expect(d.grid).toHaveLength(2);
    for (const tier of ['C', 'U', 'R', 'E', 'L'] as const) {
      const ks = layerOf(tier).map((d) => d.grid.join(','));
      expect(new Set(ks).size).toBe(ks.length);
    }
    expect(layerOf('C')).toHaveLength(8);
    expect(layerOf('U')).toHaveLength(5);
  });

  it('隣は同じ階層で上下左右に 1 違い（斜めは隣ではない）', () => {
    expect(adjacent('c1', 'c2')).toBe(true);
    expect(adjacent('c1', 'c3')).toBe(true);
    expect(adjacent('c1', 'c4')).toBe(false); // 斜め
    expect(adjacent('c2', 'c5')).toBe(true);
    expect(adjacent('c7', 'c8')).toBe(true);
    expect(neighborsOf('c1').map((d) => d.id).sort()).toEqual(['c2', 'c3']);
    expect(neighborsOf('u2').map((d) => d.id).sort()).toEqual(['u1', 'u3', 'u5']);
  });

  it('ランクが違えば別の階層で、つながらない（Common と Uncommon は隣にならない）', () => {
    for (const a of layerOf('C')) for (const b of layerOf('U')) expect(adjacent(a.id, b.id)).toBe(false);
    for (const d of SECTORS) for (const x of neighborsOf(d.id)) expect(x.tier).toBe(d.tier);
    // u1 と c1 は grid が同じ [0,0] でも、別の階層
    expect(adjacent('c1', 'u1')).toBe(false);
  });

  it('同じ階層は同じ広さ（n）', () => {
    expect(TIERS.C.n).toBe(16);
    expect(newP1(1, 'C', 'c2').n).toBe(TIERS.C.n);
  });
});

describe('カメラの付け直しと、中心が入ったセクタ', () => {
  it('隣のセクタへ移ったら、ずらしたぶんを引くと同じ地点を指す', () => {
    const n = 16;
    // 古い座標でのマス (n + 3, 5) は、新しいセクタ（dx = 1）では (3, 5)
    const old = { x: (n + 3 - 5) * 100, y: (n + 3 + 5) * 55 };
    const d = camShift(1, 0, n);
    expect({ x: old.x - d.x, y: old.y - d.y }).toEqual({ x: (3 - 5) * 100, y: (3 + 5) * 55 });
    const d2 = camShift(0, -1, n);
    const old2 = { x: (4 - (-2)) * 100, y: (4 + -2) * 55 };
    const p = tileOf(old2.x - d2.x, old2.y - d2.y);
    expect(p.u).toBeCloseTo(4);
    expect(p.v).toBeCloseTo(-2 + n);
  });

  it('出店済みの隣に 1.5 マス以上入ったら、そのセクタ（ちらつかないよう境界のそばでは移らない）', () => {
    const s = newP1(3);
    s.money = 1e6;
    openGate(s);
    const at = (u: number, v: number) => enteredSector(s, (u - v) * 100, (u + v) * 55);
    // 未出店の隣には移らない
    expect(at(s.n + 3, 7)).toBeNull();
    s.land!.mine.push('c2');
    expect(at(s.n - 0.5 + 1.4, 7)).toBeNull();
    expect(at(s.n - 0.5 + 1.6, 7)).toBe('c2');
    expect(at(7, 7)).toBeNull();
    // 斜めは隣ではない
    s.land!.mine.push('c4');
    expect(at(s.n + 3, s.n + 3)).toBeNull();
  });
});

describe('switchSector（シームレスな移動）', () => {
  it('入るセクタのマネージャーを、出るセクタのマネージャーに回す。往復しても資金・建物・在庫・マネージャーが壊れない', () => {
    const s = newP1(8);
    const shop = business(s);
    openGate(s);
    // c1 → c2（ランドマップの出店。c1 のマネージャーは 10003）
    expect(moveTo(s, 'c2', 10003)).toBeNull();
    // c2 にも工房（離れるときにマネージャーが要る）
    const [a, b, d] = lot(s, 'workshop');
    build(s, 'workshop', a, b, d);
    run(s, 4);
    const c2Buildings = JSON.stringify(s.buildings);
    const c1Snap = JSON.stringify(recOf(s, 'c1').snap);
    const stock1 = JSON.stringify((recOf(s, 'c1').snap as { stock: unknown }).stock);
    const money = s.money;
    // c2 → c1：c1 のマネージャー 10003 が c2 のマネージャーに交代
    const r = switchSector(s, 'c1');
    expect(r.err).toBeNull();
    expect(r.handed).toBe(true);
    expect(r.manager).toBe(10003);
    expect(r.delta).toEqual([-1, 0]);
    expect(s.land!.cur).toBe('c1');
    expect(s.money).toBe(money); // 出店済みなので入国料は無い
    expect(s.buildings.some((x) => x.uid === shop && x.owner === 'me')).toBe(true);
    expect(JSON.stringify(s.stock)).toBe(stock1);
    const m = s.staff.find((x) => x.hero === 10003)!;
    expect(m.task).toBe('manager');
    expect(m.target).toBe('c2');
    expect(recOf(s, 'c2').manager).toBe(10003);
    expect(recOf(s, 'c1').manager ?? null).toBeNull();
    // c1 → c2：また交代して元どおり
    const r2 = switchSector(s, 'c2');
    expect(r2.err).toBeNull();
    expect(r2.handed).toBe(true);
    expect(r2.delta).toEqual([1, 0]);
    expect(s.land!.cur).toBe('c2');
    expect(JSON.stringify(s.buildings)).toBe(c2Buildings);
    expect(s.money).toBe(money);
    expect(recOf(s, 'c1').manager).toBe(10003);
    expect(s.staff.find((x) => x.hero === 10003)!.target).toBe('c1');
    // c1 の写しは往復の前と同じ（建物・お店・在庫・報告）
    const back = JSON.parse(JSON.stringify(recOf(s, 'c1').snap)) as Record<string, unknown>;
    const before = JSON.parse(c1Snap) as Record<string, unknown>;
    for (const k of ['buildings', 'shops', 'stock', 'reports', 'mats', 'seed', 'n']) expect(back[k]).toEqual(before[k]);
  });

  it('入るセクタにマネージャーがいなければ、適性のいちばん高い待機中のヒーローを指名する。誰もいなければ移らない', () => {
    const s = newP1(8);
    business(s);
    openGate(s);
    // c1 に建物があるまま c2 へ（c1 のマネージャー 10003）。c2 は建物なし → 戻るときにマネージャー不要
    expect(moveTo(s, 'c2', 10003)).toBeNull();
    const [a, b, d] = lot(s, 'workshop');
    build(s, 'workshop', a, b, d);
    run(s, 4);
    // c1 のマネージャーを外す（不在）
    const m = s.staff.find((x) => x.hero === 10003)!;
    m.task = null;
    m.target = null;
    recOf(s, 'c1').manager = null;
    // 待機中は 10003 と 10001・10002（c2 では仕事なし）。いちばん適性の高い人
    for (const x of s.staff) if (x.hero !== 10003) assign(s, x.hero, null);
    addIdle(s, 99901, { phy: 99, int: 99, agi: 99 });
    const r = switchSector(s, 'c1');
    expect(r.err).toBeNull();
    expect(r.auto).toBe(true);
    expect(r.manager).toBe(99901);
    expect(recOf(s, 'c2').manager).toBe(99901);
  });

  it('マネージャーにできるヒーローがいなければ移らない（状態はそのまま）', () => {
    const s = newP1(8);
    business(s);
    openGate(s);
    expect(moveTo(s, 'c2', 10003)).toBeNull();
    const [a, b, d] = lot(s, 'workshop');
    build(s, 'workshop', a, b, d);
    run(s, 4);
    const m = s.staff.find((x) => x.hero === 10003)!;
    m.task = null;
    m.target = null;
    recOf(s, 'c1').manager = null;
    // 全員を修行中に（マネージャーにできない）
    for (const x of s.staff) {
      assign(s, x.hero, null);
      x.task = 'train';
    }
    const before = JSON.stringify(s.buildings);
    const r = switchSector(s, 'c1');
    expect(r.err).toBe('manager');
    expect(s.land!.cur).toBe('c2');
    expect(JSON.stringify(s.buildings)).toBe(before);
  });

  it('出るセクタに建物が無ければ、入るセクタのマネージャーは本社の仕事に戻る', () => {
    const s = newP1(8);
    business(s);
    openGate(s);
    expect(moveTo(s, 'c2', 10003)).toBeNull();
    const r = switchSector(s, 'c1');
    expect(r.err).toBeNull();
    expect(r.manager).toBeNull();
    expect(r.back).toBe(10003);
    expect(s.staff.find((x) => x.hero === 10003)!.task).toBe('craft');
  });

  it('未出店のセクタへは switchSector では移らない（進出は入国料の流れ）', () => {
    const s = newP1(8);
    s.money = 1e6;
    openGate(s);
    expect(switchSector(s, 'c2').err).toBe('not-mine');
    expect(switchSector(s, 'c1').err).toBe('here');
  });
});

describe('先に見せる町と、進出した町は同じ', () => {
  it('ghostTown は moveTo の新規と同じ種（どこから進出しても同じ）', () => {
    const s = newP1(8);
    s.money = 1e6;
    openGate(s);
    const g = ghostTown(s, 'c3');
    const seed = townSeed(s, 'c3');
    // c2 に寄ってから c3 へ進出しても、同じ種
    expect(moveTo(s, 'c2', null)).toBeNull();
    expect(townSeed(s, 'c3')).toBe(seed);
    expect(moveTo(s, 'c3', null)).toBeNull();
    expect(s.seed).toBe(seed);
    expect(s.buildings.map((b) => [b.id, b.i, b.j])).toEqual(g.buildings.map((b) => [b.id, b.i, b.j]));
  });
});

describe('sectorBadges（縮小したときの札）', () => {
  it('いまの階層の全セクタ。順位・主力商品・マネージャー・先月の売上、未進出は入国料', () => {
    const s = newP1(8);
    business(s);
    openGate(s);
    const bs = sectorBadges(s);
    expect(bs.map((b) => b.id).sort()).toEqual(layerOf('C').map((d) => d.id).sort());
    const here = bs.find((b) => b.id === 'c1')!;
    expect(here.state).toBe('here');
    expect(here.rank).toBe(s.reports.at(-1)!.rank);
    expect(here.items).toEqual(['Sensu:C']);
    expect(here.lastRev).toBe(s.reports.at(-1)!.revenue);
    const c2 = bs.find((b) => b.id === 'c2')!;
    expect(c2.state).toBe('open');
    expect(c2.fee).toBe(5000);
    expect(bs.some((b) => b.tier !== 'C')).toBe(false);
    // c2 へ移ると、c1 はマネージャーの札
    expect(moveTo(s, 'c2', 10003)).toBeNull();
    const c1 = sectorBadges(s).find((b) => b.id === 'c1')!;
    expect(c1.state).toBe('mine');
    expect(c1.manager).toBe(10003);
    expect(c1.items).toEqual(['Sensu:C']);
    expect(c1.rank).toBe(here.rank);
    expect(c1.delta).toEqual([-1, 0]);
  });

  it('関所を開ける前は空（隣は見せない）', () => {
    expect(sectorBadges(newP1(8))).toEqual([]);
  });

  it('まだ行けないセクタには条件', () => {
    const s = newP1(9);
    s.money = 1e7;
    openGate(s);
    expect(moveTo(s, 'u1', null)).toBeNull();
    s.land!.mine.push('u2');
    s.land!.mine.push('u3');
    // Uncommon の階層。Rare はまだ準備中なので出ない（階層が違う）
    expect(sectorBadges(s).every((b) => b.tier === 'U')).toBe(true);
  });
});
