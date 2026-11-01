/**
 * 発掘 v2 の 4 段目：復興・ダンジョン・遺物の展示館（docs/ISLAND_PHASE1.md「4. 復興・ダンジョン・展示館」）。
 * 掘りきり → 復興（建てられる・家 +N・需要）・4 か所目はダンジョン・ダンジョンの壁は入るたびに作り直し・層の上限（深い層の許可の Lv）・
 * 奥ほど上のランク（種を固定した壁で数える）・Epic は 2 × 2・RP の倍率・最深記録・展示の枠と価値・来館者と収入・節目のボーナス（1 回だけ）・
 * 展示館は復興した土地だけ・会社で 1 つ・セーブの引き継ぎ（版 5 → 6）。
 */
import { describe, expect, it } from 'vitest';
import { allSeries } from '../src/game/catalog';
import { DIG_BALANCE, DIG_SITES, DUNGEON_FINDS, RESEARCH_NEED, RP_GAIN } from '../src/island/p1/data';
import {
  allowedDirs,
  autoDig,
  build,
  canBuild,
  canPlaceAt,
  deserializeP1,
  dig,
  digCheck,
  digLayout,
  digNext,
  dungeonDepth,
  dungeonLayout,
  DUNGEON,
  endMonth,
  endRun,
  exhibit,
  extRank,
  findSize,
  invest,
  isRevived,
  isRoad,
  museumKnown,
  museumMarks,
  museumMonth,
  museumSlots,
  museumValue,
  newP1,
  placeFind,
  relicValue,
  researchOf,
  runLock,
  serializeP1,
  setLevel,
  siteState,
  standSite,
  startRun,
  townHomes,
  wasteCells,
  wasteSpots,
  type DigHit,
  type P1State,
} from '../src/island/p1/model';

const MB = DIG_BALANCE.museum;
const lot = (s: P1State, id: string): [number, number, 'rd' | 'ld' | 'lu' | 'ru'] => {
  for (let j = 0; j < s.n; j++) for (let i = 0; i < s.n; i++) { const d = allowedDirs(s, id, i, j); if (d.length) return [i, j, d[0]]; }
  throw new Error('no lot');
};
function game(sector = 'c1', tier: 'C' | 'U' = 'C'): P1State {
  const s = newP1(1, tier, sector);
  s.money = 1e8;
  s.tut = 99;
  s.flags.digMeet = 'done';
  const b = build(s, 'workshop', ...lot(s, 'workshop'));
  if (typeof b === 'string') throw new Error(b);
  b.left = 0;
  setLevel(s, 'dig_deep', 3);
  // 1 打の強さを上げて、テストを短く（荒れ地は 1 打で 1 枚）
  setLevel(s, 'dig_power', 5);
  setLevel(s, 'u_dig_power2', 5);
  return s;
}
/** 荒れ地 k を手で掘りきる（最後の 1 打の結果を返す） */
function digOut(s: P1State, k: number): DigHit {
  s.dig!.sites[k].permit = true;
  if (s.digRun) endRun(s);
  const r = startRun(s, k);
  if (typeof r === 'string') throw new Error(r);
  for (let n = 0; n < 5000; n++) {
    const at = digNext(s);
    if (!at) break;
    const h = dig(s, at[0], at[1]);
    if (typeof h === 'string') throw new Error(h);
    const all = [h, ...(h.extra ?? [])];
    const done = all.find((x) => x.done);
    if (done) return done;
  }
  throw new Error(`not dug out: ${k}`);
}
const EPIC = allSeries.flatMap((x) => x.items).find((e) => e.rarity === 'Epic' && !e.shin)!.id;
/** ダンジョンに潜る（入るたびに壁を作り直す） */
function dive(s: P1State) {
  if (s.digRun) endRun(s);
  const r = startRun(s, DUNGEON);
  if (typeof r === 'string') throw new Error(r);
  return s;
}

describe('復興（掘りきった荒れ地）', () => {
  it('掘りきると復興：家 +6%（最低 1）・需要も同じ割合で上がる・住宅の絵は近くに 2 軒まで・小道が通って建物を建てられる', () => {
    const s = game();
    const homes0 = townHomes(s);
    const dem0 = { ...s.demand };
    const n0 = s.buildings.length;
    const hit = digOut(s, 0);
    const st = s.dig!.sites[0];
    const want = Math.max(1, Math.round(homes0 * DIG_BALANCE.revive.homes));
    expect([st.done, st.revived, st.homes, hit.revive]).toEqual([true, true, want, want]);
    expect(townHomes(s) - homes0).toBe(Math.min(want, DIG_BALANCE.revive.houses));
    expect(s.buildings.length - n0).toBe(Math.min(want, DIG_BALANCE.revive.houses));
    for (const k of Object.keys(dem0)) expect(s.demand[k]).toBeCloseTo((dem0[k] ?? 0) * (1 + DIG_BALANCE.revive.homes), 6);
    // 小道（道路）が通る
    expect(st.path!.length).toBeGreaterThan(0);
    for (const [x, y] of st.path!) expect(isRoad(s, x, y)).toBe(true);
    // 復興した土地のマス：建物を建てられる（入口を小道に向ける）。まだの荒れ地は 'waste'
    const cells0 = wasteCells('c1', 0);
    expect(cells0.every(([x, y]) => isRevived(s, x, y))).toBe(true);
    const ok = cells0.filter(([x, y]) => allowedDirs(s, 'general_store', x, y).length > 0);
    expect(ok.length).toBeGreaterThan(0);
    const [x1, y1] = wasteCells('c1', 1)[0];
    expect(canPlaceAt(s, 'general_store', x1, y1, 'rd')).toBe('waste');
    const b = build(s, 'general_store', ok[0][0], ok[0][1], allowedDirs(s, 'general_store', ok[0][0], ok[0][1])[0]);
    expect(typeof b).toBe('object');
  });

  it('13 セクタとも、復興した土地へ小道が通る（町の建物で塞がれない）', () => {
    for (const id of Object.keys(DIG_SITES)) {
      const s = newP1(7, id.startsWith('u') ? 'U' : 'C', id);
      s.money = 1e8;
      setLevel(s, 'dig_deep', 3);
      setLevel(s, 'dig_power', 5);
      setLevel(s, 'u_dig_power2', 5);
      s.tut = 99;
      for (let k = 0; k < 3; k++) {
        digOut(s, k);
        expect(s.dig!.sites[k].path!.length, `${id} ${k}`).toBeGreaterThan(0);
      }
    }
  });

  it('月次報告に「復興 N / 4」', () => {
    const s = game();
    digOut(s, 0);
    endRun(s);
    const r = endMonth(s);
    expect(r.revive).toEqual({ done: 1, all: 4, dungeon: false });
  });
});

describe('ダンジョン', () => {
  it('セクタで最後の 1 か所（4 か所目）を掘りきると、復興の代わりにダンジョンの入り口。建物は建てられない', () => {
    const s = game();
    for (const k of [2, 0, 3]) digOut(s, k);
    expect(s.dig!.dungeon).toBeFalsy();
    const hit = digOut(s, 1);
    expect(hit.dungeon).toBe(true);
    expect(s.dig!.dungeon!.site).toBe(1);
    expect(s.dig!.sites[1].revived).toBeFalsy();
    expect(s.dungeons).toEqual(['c1']);
    const end = endRun(s)!;
    expect([end.found, end.revived]).toEqual([1, undefined]);
    const [x, y] = wasteCells('c1', 1)[0];
    expect(isRevived(s, x, y)).toBe(false);
    expect(canPlaceAt(s, 'general_store', x, y, 'rd')).toBe('waste');
    // 許可は要らない
    expect(runLock(s, DUNGEON)).toBeNull();
  });

  it('壁は入るたびに作り直す（種：セクタの id ＋ 入った回数。前の回の掘りかけは残らない）', () => {
    const s = game();
    for (const k of [0, 1, 2, 3]) digOut(s, k);
    dive(s);
    expect(s.dig!.dungeon!.runs).toBe(1);
    const L1 = dungeonLayout('c1', 1)!;
    expect([L1.w, L1.h, L1.depth, L1.dungeon]).toEqual([7, 9, DIG_BALANCE.dungeon.layers, true]);
    expect(dig(s, 0, 0)).not.toBe('no-run');
    expect(siteState(s, DUNGEON)!.depth[0]).toBeGreaterThan(0);
    endRun(s);
    dive(s);
    expect(s.dig!.dungeon!.runs).toBe(2);
    expect(siteState(s, DUNGEON)!.depth.every((v) => v === 0)).toBe(true);
    const L2 = dungeonLayout('c1', 2)!;
    expect(JSON.stringify(L2.finds)).not.toBe(JSON.stringify(L1.finds));
    // 同じ回は同じ壁
    expect(dungeonLayout('c1', 2)).toBe(L2);
    // お題・石板は出ない
    expect(L1.finds.some((f) => f.item.kind === 'tablet' || (f.item.kind === 'ext' && f.item.topic))).toBe(false);
  });

  it('掘れる層の上限は深い層の許可：Lv1〜3 で 3 層・Lv4 で 5 層・Lv5 で 6 層', () => {
    const s = game();
    expect([1, 2, 3, 4, 5].map((lv) => (setLevel(s, 'dig_deep', lv), dungeonDepth(s)))).toEqual([3, 3, 3, 5, 6]);
    setLevel(s, 'dig_deep', 3);
    for (const k of [0, 1, 2, 3]) digOut(s, k);
    dive(s);
    // 3 層はがしたマスは、4 層目で止まる
    for (let n = 0; n < 40 && (siteState(s, DUNGEON)!.depth[0] ?? 0) < 3; n++) dig(s, 0, 0);
    expect(siteState(s, DUNGEON)!.depth[0]).toBe(3);
    expect(digCheck(s, 0, 0)).toBe('deep');
    setLevel(s, 'dig_deep', 5);
    expect(digCheck(s, 0, 0)).toBeNull();
  });

  it('奥の層ほど上のランクのエクステ（Common のセクタ：1〜2 層は Common だけ・Rare は 4 層から・Epic は 5 層から）', () => {
    const by: Record<number, Record<string, number>> = {};
    for (let runs = 1; runs <= 150; runs++) {
      const L = dungeonLayout('c3', runs)!;
      for (const f of L.finds) {
        if (f.item.kind !== 'ext') continue;
        (by[f.layer] ??= {})[extRank(f.item.id)] = ((by[f.layer] ??= {})[extRank(f.item.id)] ?? 0) + 1;
      }
    }
    const share = (layer: number, r: string) => (by[layer][r] ?? 0) / Object.values(by[layer]).reduce((a, b) => a + b, 0);
    expect(Object.keys(by[0])).toEqual(['C']);
    expect(Object.keys(by[1])).toEqual(['C']);
    expect(share(2, 'U')).toBeGreaterThan(0.05);
    expect(by[2].R ?? 0).toBe(0);
    expect(share(3, 'R')).toBeGreaterThan(0.02);
    expect(by[3].E ?? 0).toBe(0);
    expect(share(4, 'E')).toBeGreaterThan(0);
    expect(share(5, 'E')).toBeGreaterThan(share(4, 'E'));
    expect(share(5, 'R')).toBeGreaterThan(share(3, 'R'));
    // 上のランクは、そのセクタの DUNGEON_FINDS から（Uncommon は Uncommon のセクタの出土品＝復刻品がある）
    const pool = new Set(Object.values(DUNGEON_FINDS.c3).flat());
    for (let runs = 1; runs <= 20; runs++) for (const f of dungeonLayout('c3', runs)!.finds) if (f.item.kind === 'ext' && extRank(f.item.id) !== 'C') expect(pool.has(f.item.id)).toBe(true);
    expect(Object.values(DUNGEON_FINDS.c3).map((x) => x!.length)).toEqual([9, 9, 9]);
  });

  it('Uncommon のセクタは 1 つ上へずらす（6 層で Legendary まで）', () => {
    const ranks = new Set<string>();
    for (let runs = 1; runs <= 400; runs++) for (const f of dungeonLayout('u2', runs)!.finds) if (f.item.kind === 'ext') ranks.add(`${f.layer}:${extRank(f.item.id)}`);
    expect(ranks.has('0:U')).toBe(true);
    expect(ranks.has('0:R')).toBe(false);
    expect(ranks.has('5:L')).toBe(true);
    expect(ranks.has('4:L')).toBe(false);
    expect(Object.keys(DUNGEON_FINDS.u2)).toEqual(['R', 'E', 'L']);
  });

  it('Epic・Legendary は 2 × 2（4 マスとも掘ると取れる）', () => {
    const big = Array.from({ length: 80 }, (_, k) => dungeonLayout('c1', k + 1)!).flatMap((L) => L.finds).filter((f) => f.item.kind === 'ext' && (extRank(f.item.id) === 'E' || extRank(f.item.id) === 'L'));
    expect(big.length).toBeGreaterThan(0);
    for (const f of big) expect(f.size).toEqual([2, 2]);
    expect(findSize({ kind: 'ext', id: EPIC })).toEqual([2, 2]);
  });

  it('RP はレアリティで変わらない（v14a）：Rare・Epic・Legendary の初発見も研究 Lv の上がりも Common と同じ', () => {
    expect([RP_GAIN.R.first, RP_GAIN.E.first, RP_GAIN.L.first]).toEqual([RP_GAIN.C.first, RP_GAIN.C.first, RP_GAIN.C.first]);
    for (const r of ['U', 'R', 'E', 'L'] as const) expect(RP_GAIN[r].lv, r).toEqual(RP_GAIN.C.lv);
    const s = game();
    for (const k of [0, 1, 2, 3]) digOut(s, k);
    setLevel(s, 'dig_deep', 5);
    dive(s);
    const L = dungeonLayout('c1', s.dig!.dungeon!.runs)!;
    const rare = DUNGEON_FINDS.c1.R![0];
    placeFind(L, { kind: 'ext', id: rare }, 3, 3, 0);
    placeFind(L, { kind: 'ext', id: EPIC }, 0, 6, 0);
    const rp0 = s.rp;
    let h: DigHit | string = dig(s, 3, 3);
    for (let n = 0; n < 10 && typeof h !== 'string' && !h.broke; n++) h = dig(s, 3, 3);
    expect(typeof h !== 'string' && h.item?.kind === 'ext' && h.first).toBe(true);
    expect(s.rp - rp0).toBe(RP_GAIN.C.first);
    // Epic：4 マスとも
    const rp1 = s.rp;
    let last: DigHit | null = null;
    for (const [x, y] of [[0, 6], [1, 6], [0, 7], [1, 7]] as [number, number][])
      for (let n = 0; n < 10; n++) {
        const r = dig(s, x, y);
        if (typeof r === 'string') break;
        last = r;
        if (r.broke || r.wait) break;
      }
    expect(last?.span).toEqual({ x: 0, y: 6, w: 2, h: 2 });
    expect(s.rp - rp1).toBe(RP_GAIN.C.first);
    expect(s.dig!.dungeon!.found).toEqual(expect.arrayContaining([rare, EPIC]));
  });

  it('最深記録（はがした層の数）。初めての層に届いたら「新記録」', () => {
    const s = game();
    for (const k of [0, 1, 2, 3]) digOut(s, k);
    dive(s);
    for (let n = 0; n < 40 && siteState(s, DUNGEON)!.depth[10] < 2; n++) dig(s, 3, 1);
    const e1 = endRun(s)!;
    expect([e1.isDungeon, e1.deep, e1.record, s.dig!.dungeon!.best]).toEqual([true, 2, true, 2]);
    dive(s);
    dig(s, 0, 0);
    dig(s, 0, 0);
    const e2 = endRun(s)!;
    expect([e2.deep! <= 2, e2.record, s.dig!.dungeon!.best]).toEqual([true, false, 2]);
    // 掘りきりは無い（もう一度潜れる）
    expect(e2.done).toBe(false);
  });

  it('発掘隊の常駐はダンジョンでは働かない（荒れ地だけ）', () => {
    const s = game();
    for (const k of [0, 1, 2, 3]) digOut(s, k);
    endRun(s);
    setLevel(s, 'u_dig_auto', 5);
    expect(standSite(s)).toBe(-1);
    const st = s.staff[0];
    expect(autoDig(s, st)).toEqual([]);
  });
});

describe('遺物の展示館', () => {
  /** 復興した土地を 1 か所つくって、そこに展示館を建てる */
  function withMuseum(): P1State {
    const s = game();
    expect(canBuild(s, 'museum')).toBe('locked');
    digOut(s, 0);
    endRun(s);
    expect(canBuild(s, 'museum')).toBeNull();
    const cs = wasteCells('c1', 0);
    let at: [number, number, 'rd' | 'ld' | 'lu' | 'ru'] | null = null;
    for (const [x, y] of cs) {
      const d = allowedDirs(s, 'museum', x, y);
      if (d.length) {
        at = [x, y, d[0]];
        break;
      }
    }
    expect(at).not.toBeNull();
    const b = build(s, 'museum', ...at!);
    if (typeof b === 'string') throw new Error(b);
    b.left = 0;
    // 研究 Lv の上限を 5 に（研究の目利き Lv2）
    setLevel(s, 'dig_study', 2);
    return s;
  }

  it('復興した土地にだけ建てられる・会社で 1 つ', () => {
    const s = game();
    digOut(s, 0);
    endRun(s);
    // 普通の空き地には建てられない
    const [i, j, d] = lot(s, 'general_store');
    expect(canPlaceAt(s, 'museum', i, j, d)).toBe('revive');
    for (let jj = 0; jj < s.n; jj++) for (let ii = 0; ii < s.n; ii++) for (const dd of allowedDirs(s, 'museum', ii, jj)) expect(isRevived(s, ii, jj)).toBe(true), void dd;
    const m = withMuseum();
    expect(m.museum!.at).not.toBeNull();
    expect(canBuild(m, 'museum')).toBe('limit');
  });

  it('展示の枠は 4（展示室の増築で 8・12・16）。同じエクステは 1 枠まで。価値 ＝ レアリティ ×（1 ＋ 0.25 ×（研究 Lv − 1））', () => {
    const s = withMuseum();
    expect(museumSlots(s)).toBe(4);
    const [a, b2] = DIG_SITES.c1.finds;
    s.research[a] = RESEARCH_NEED[2];
    s.research[b2] = RESEARCH_NEED[0];
    const ep = EPIC;
    s.research[ep] = RESEARCH_NEED[4];
    expect(exhibit(s, 0, a)).toBeNull();
    expect(exhibit(s, 1, a)).toBe('dup');
    expect(exhibit(s, 1, 999999)).toBe('unknown');
    expect(exhibit(s, 4, b2)).toBe('slot');
    expect(relicValue(s, a)).toBeCloseTo(MB.val.C * (1 + 0.25 * (researchOf(s, a) - 1)), 6);
    expect(relicValue(s, ep)).toBeCloseTo(MB.val.E * (1 + 0.25 * 4), 6);
    exhibit(s, 1, b2);
    expect(museumValue(s)).toBeCloseTo(relicValue(s, a) + relicValue(s, b2), 6);
    const mb = s.buildings.find((x) => x.id === 'museum')!;
    expect(invest(s, mb.uid, 'hall')).toBeNull();
    expect(museumSlots(s)).toBe(8);
    invest(s, mb.uid, 'hall');
    invest(s, mb.uid, 'hall');
    expect(museumSlots(s)).toBe(16);
    expect(invest(s, mb.uid, 'hall')).toBe('max');
  });

  it('毎月の来館者と入館料（帳簿の「展示館」）・月次報告の行', () => {
    const s = withMuseum();
    const id = DIG_SITES.c1.finds[0];
    s.research[id] = RESEARCH_NEED[4];
    exhibit(s, 0, id);
    const v = museumValue(s);
    const m = museumMonth(s)!;
    expect(m).toEqual({ visitors: Math.round(v * MB.visitors), income: Math.round(v * MB.visitors) * MB.fee, value: v });
    const money0 = s.money;
    const r = endMonth(s);
    expect(r.museum).toEqual(m);
    expect(s.books!.months.length ? 0 : s.books!.cur.museum).toBe(m.income);
    // 維持費・給料を差し引いても、入館料のぶんは入っている（維持費・給料のぶんを戻して比べる）
    expect(s.money - money0 + r.costs.upkeep + r.costs.wages).toBeGreaterThanOrEqual(m.income - 1);
  });

  it('節目（20・50・100…）を超えるごとに、ブランド力 +1・新商品の認知の上がり方 +5%。節目ごとに 1 回だけ', () => {
    const s = withMuseum();
    const ep = EPIC;
    s.research[ep] = RESEARCH_NEED[4];
    const b0 = s.brand ?? 0;
    // Epic Lv5 ＝ 15 × 2 ＝ 30（20 を超える）
    exhibit(s, 0, ep);
    expect(museumMarks(s).reached).toBe(1);
    expect([s.museum!.marks, (s.brand ?? 0) - b0, museumKnown(s)]).toEqual([1, 1, MB.known]);
    // 外して、また飾っても 2 回目のボーナスは無い
    exhibit(s, 0, null);
    exhibit(s, 0, ep);
    expect([s.museum!.marks, (s.brand ?? 0) - b0]).toEqual([1, 1]);
    expect(museumMarks(s).next).toBe(50);
    expect(museumMarks(s).left).toBe(20);
  });
});

describe('セーブの引き継ぎ（版 5 → 6）', () => {
  /** 版 5 のセーブ：荒れ地の掘りきりの印だけ（復興・ダンジョンの記録は無い） */
  function v5(done: number[]): P1State {
    const s = game();
    const o = JSON.parse(serializeP1(s));
    o.v = 5;
    for (const k of done) {
      const L = digLayout('c1', k)!;
      o.dig.sites[k] = { ...o.dig.sites[k], permit: true, done: true, depth: new Array(L.w * L.h).fill(L.depth), hp: new Array(L.w * L.h).fill(0) };
    }
    return deserializeP1(JSON.stringify(o))!;
  }
  it('掘りきった荒れ地は復興済みに（家・需要・小道）', () => {
    const s = v5([0, 2]);
    expect(s.v).toBe(7);
    expect(s.dig!.sites.map((x) => !!x.revived)).toEqual([true, false, true, false]);
    expect(s.dig!.dungeon).toBeFalsy();
    for (const [x, y] of s.dig!.sites[0].path!) expect(isRoad(s, x, y)).toBe(true);
    // 読み直しても同じ（小道は地面に。家・需要は 2 回足さない）
    const again = deserializeP1(serializeP1(s))!;
    expect(again.buildings.length).toBe(s.buildings.length);
    expect(again.demand).toEqual(s.demand);
    for (const [x, y] of again.dig!.sites[2].path!) expect(isRoad(again, x, y)).toBe(true);
  });
  it('4 か所とも掘りきっていたら、いちばん番号の大きい荒れ地をダンジョンに', () => {
    const s = v5([0, 1, 2, 3]);
    expect(s.dig!.sites.map((x) => !!x.revived)).toEqual([true, true, true, false]);
    expect(s.dig!.dungeon!.site).toBe(3);
    expect(s.dungeons).toEqual(['c1']);
    expect(wasteSpots('c1').length).toBe(4);
  });
});
