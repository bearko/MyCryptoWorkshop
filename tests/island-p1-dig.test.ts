/**
 * 地層の発掘と研究ポイント（docs/ISLAND_PHASE1.md「地層の発掘と研究ポイント」）：データと仕組み。
 * 荒れ地の配置・建てられない判定・発掘許可と申請料・15 秒の発掘作業（時間の流れ・月をまたいでもポーズしない）・回数なしで打てる・
 * お題の散らばり・掘りきり・研究レベルと RP・石板・道具・発掘隊・研究／お金パネル・✨ → RP・調査依頼状・古いセーブの移し替え（版 1 → 2 → 3）。
 */
import { describe, expect, it } from 'vitest';
import { BLAST, DIG, DIG_BALANCE, DIG_SITES, MISSIONS, MONEY_PANELS, RESEARCH_NEED, RP_GAIN, RP_PER_DUST, SECTORS, SKILL, SKILLS, START_RP, TABLETS, TIERS, WASTE, aptitude, isResearch, levelCost, maxLv, rpCost, researchLv } from '../src/island/p1/data';
import { moveTo } from '../src/island/p1/land';
import {
  allowedDirs,
  applyPermit,
  assign,
  blast,
  build,
  canMoveTo,
  canPlaceAt,
  claim,
  deserializeP1,
  dig,
  digCheck,
  digLayout,
  digLayouts,
  digNext,
  digPower,
  digRepeatMs,
  endRun,
  firstSite,
  grantFirst,
  hasLetter,
  holdReport,
  invest,
  isRoad,
  isWaste,
  learn,
  levelUp,
  lvOf,
  myWorkshop,
  newDig,
  newP1,
  occupant,
  openGate,
  peek,
  permitFee,
  permitLock,
  present,
  presentLock,
  researchLeft,
  researchOf,
  runLock,
  runTick,
  serializeP1,
  sessionSec,
  setLevel,
  siteProgress,
  siteTopic,
  startRun,
  step,
  topicProgress,
  tutSpot,
  wasteAt,
  wasteCells,
  wasteName,
  wasteSpots,
  type DigHit,
  type P1State,
} from '../src/island/p1/model';
import { SECTOR_KEYS } from '../src/island/p1/land';

const lot = (s: P1State, id: string): [number, number, 'rd' | 'ld' | 'lu' | 'ru'] => {
  for (let j = 0; j < s.n; j++) for (let i = 0; i < s.n; i++) { const d = allowedDirs(s, id, i, j); if (d.length) return [i, j, d[0]]; }
  throw new Error('no lot');
};
/** 工房（道具の設備投資のため）を建てる */
function site(seed = 1, sector = 'c1', tier: 'C' | 'U' = 'C'): P1State {
  const s = newP1(seed, tier, sector);
  s.money = 1e7;
  const b = build(s, 'workshop', ...lot(s, 'workshop'));
  if (typeof b === 'string') throw new Error(b);
  b.left = 0;
  return s;
}
/** 荒れ地 k の許可をもらって、発掘作業を始める（時間は進めないので、作業は終わらない） */
function run(s: P1State, k = 0): P1State {
  s.dig!.sites[k].permit = true;
  if (s.digRun) endRun(s);
  const r = startRun(s, k);
  if (typeof r === 'string') throw new Error(r);
  return s;
}
const hpOf = (s: P1State) => s.dig!.sites[s.dig!.cur].hp;
/** そのマスが崩れるまで打つ */
function breakCell(s: P1State, x: number, y: number): DigHit {
  for (let k = 0; k < 20; k++) {
    const r = dig(s, x, y);
    if (typeof r === 'string') throw new Error(`${x},${y}: ${r}`);
    if (r.broke) return r;
  }
  throw new Error('not broken');
}
/** (x, y) まで上から掘り進めて、そのマスを崩す */
function digTo(s: P1State, x: number, y: number): DigHit {
  for (let yy = 0; yy < y; yy++) if (hpOf(s)[yy * 7 + x] > 0) breakCell(s, x, yy);
  return breakCell(s, x, y);
}
const digSectors = Object.keys(DIG_SITES);

describe('荒れ地（未開拓エリア）の配置', () => {
  it('発掘場のある 13 セクタに 2 × 2 の荒れ地が 4 か所（合計 16 マス）。重ならない・地図の内側・道路に面していない。Rare 以降は無し', () => {
    expect(digSectors).toHaveLength(13);
    for (const id of digSectors) {
      const sp = wasteSpots(id);
      expect(sp, id).toHaveLength(WASTE.count);
      const tier = SECTORS.find((x) => x.id === id)!.tier;
      const n = tier === 'C' ? 16 : TIERS[tier].n;
      const s = newP1(1, tier, id);
      const cells = sp.flatMap((_, k) => wasteCells(id, k));
      expect(new Set(cells.map(([i, j]) => `${i},${j}`)).size, id).toBe(16);
      for (const [i, j] of cells) {
        expect(i > 0 && j > 0 && i < n - 1 && j < n - 1, `${id} ${i},${j}`).toBe(true);
        expect(isRoad(s, i, j), `${id} ${i},${j}`).toBe(false);
        // 上下左右のどれも道路ではない（町の 1 マスの建物・チュートリアルの建てる場所は道路に面した所だけ）
        for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) expect(isRoad(s, i + di, j + dj), `${id} ${i},${j}`).toBe(false);
      }
      // 4 つの象限に 1 つずつ（画面で見た向きの名前が全部ちがう）
      expect(new Set(sp.map((_, k) => wasteName(id, k))).size, id).toBe(4);
    }
    expect(wasteSpots('r1')).toEqual([]);
    expect(wasteName('c1', 0)).toBe('北の荒れ地');
  });

  it('同じセクタは、ゲームの種が違ってもいつも同じ位置。町の建物（住宅・公園・駅・他社）と重ならない', () => {
    for (const id of digSectors) {
      const tier = SECTORS.find((x) => x.id === id)!.tier;
      for (const seed of [1, 987654]) {
        const s = newP1(seed, tier, id);
        expect(wasteSpots(s.sector!)).toEqual(wasteSpots(id));
        for (const [i, j] of wasteSpots(id).flatMap((_, k) => wasteCells(id, k))) expect(occupant(s, i, j), `${id}:${seed} ${i},${j}`).toBeNull();
      }
    }
  }, 60000);

  it('タオックスのチュートリアルで建てる場所（工房・よろず屋・倉庫）を避ける', () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const s = newP1(seed);
      const w = tutSpot(s, 'workshop')!;
      expect(isWaste(s, w[0], w[1])).toBe(false);
      const ws = build(s, 'workshop', w[0], w[1], w[2]);
      if (typeof ws === 'string') throw new Error(ws);
      ws.left = 0;
      for (const id of ['general_store', 'warehouse']) {
        const sp = tutSpot(s, id)!;
        expect(sp, id).toBeTruthy();
        expect(isWaste(s, sp[0], sp[1]), `${seed} ${id}`).toBe(false);
      }
    }
  });

  it('荒れ地のマスには建物を建てられない（置けない理由は waste）。移転先にもできない', () => {
    const s = site();
    const [i, j] = wasteSpots('c1')[0];
    expect(wasteAt(s, i, j)).toBe(0);
    expect(wasteAt(s, i + 1, j + 1)).toBe(0);
    expect(wasteAt(s, i + 2, j)).toBe(-1);
    for (const d of ['rd', 'ld', 'lu', 'ru'] as const) expect(canPlaceAt(s, 'general_store', i, j, d)).toBe('waste');
    // 2 × 2 の建物は荒れ地にかかる場所に置けない
    const ws = myWorkshop(s)!;
    for (const d of ['rd', 'ld', 'lu', 'ru'] as const) expect(canMoveTo(s, ws.uid, i + 1, j + 1, d)).toBe('waste');
    // 建てるモードの「置けるマス」に、荒れ地は入らない
    for (const [x, y] of wasteCells('c1', 0)) expect(allowedDirs(s, 'general_store', x, y)).toEqual([]);
  });
});

describe('荒れ地の断面（発掘場）', () => {
  it('Common は横 7 × 縦 20（3 層）、Uncommon は横 7 × 縦 24（4 層）が 4 か所。Rare 以降は無い', () => {
    const c = digLayouts('c1');
    expect(c).toHaveLength(4);
    for (const L of c) expect([L.tier, L.w, L.h, L.rows]).toEqual(['C', 7, 20, [0, 7, 14]]);
    const u = digLayouts('u1');
    expect(u).toHaveLength(4);
    for (const L of u) expect([L.tier, L.w, L.h, L.rows]).toEqual(['U', 7, 24, [0, 6, 12, 18]]);
    expect(digLayout('r1')).toBeNull();
    expect(newP1(1, 'R', 'r1').dig).toBeNull();
  });

  it('配置はセクタの種から決まり、ゲームの種が違っても同じ（何度遊んでも同じ配置）', () => {
    const a = newP1(1).dig!;
    const b = newP1(987654).dig!;
    expect(a.sites.map((x) => x.hp)).toEqual(b.sites.map((x) => x.hp));
    expect(newDig('c1')!.sites.map((x) => x.hp)).toEqual(a.sites.map((x) => x.hp));
    expect(newDig('c2')!.sites[0].hp).not.toEqual(a.sites[0].hp);
    expect(a.sites.every((x) => !x.permit && !x.done)).toBe(true);
  });

  it('お題は 4 か所に散らばる（1 か所に 1 つまで。お題 k は k 番目の層）。石板は Common 1 枚・Uncommon 2 枚', () => {
    for (const id of digSectors) {
      const Ls = digLayouts(id);
      const all: number[] = [];
      for (const L of Ls) {
        const topics = L.cells.filter((c) => c.item?.kind === 'ext' && c.item.topic);
        expect(topics.length, `${id} ${L.site}`).toBeLessThanOrEqual(1);
        if (topics.length) {
          const tid = (topics[0].item as { id: number }).id;
          expect(L.topic).toBe(tid);
          expect(topics[0].layer, `${id} ${tid}`).toBe(DIG_SITES[id].topics.indexOf(tid));
          all.push(tid);
        } else expect(L.topic).toBeNull();
        // お題以外の出土品は、そのセクタの finds から（何度も出る）
        for (const c of L.cells) if (c.item?.kind === 'ext' && !c.item.topic) expect(DIG_SITES[id].finds).toContain(c.item.id);
      }
      expect(all.sort()).toEqual([...DIG_SITES[id].topics].sort());
      const tabs = Ls.flatMap((L) => L.cells.filter((c) => c.item?.kind === 'tablet'));
      expect(tabs.length, id).toBe(Ls[0].tier === 'C' ? 1 : 2);
      // エクステ・素材の出方は今の割合（24%・14% 前後）
      const cells = Ls.flatMap((L) => L.cells);
      const ext = cells.filter((c) => c.item?.kind === 'ext').length / cells.length;
      const mat = cells.filter((c) => c.item?.kind === 'mat').length / cells.length;
      expect(ext, id).toBeGreaterThan(0.17);
      expect(ext, id).toBeLessThan(0.32);
      expect(mat, id).toBeGreaterThan(0.08);
      expect(mat, id).toBeLessThan(0.21);
    }
  });

  it('出土品の数：Common はお題 3・お題以外 8、Uncommon はお題 4・お題以外 10。お題はほかのセクタの出土品に入らない', () => {
    const topics = Object.values(DIG_SITES).flatMap((x) => x.topics);
    const finds = new Set(Object.values(DIG_SITES).flatMap((x) => x.finds));
    expect(new Set(topics).size).toBe(topics.length);
    for (const t of topics) expect(finds.has(t)).toBe(false);
    for (const [id, x] of Object.entries(DIG_SITES)) {
      expect([x.topics.length, x.finds.length], id).toEqual(id.startsWith('c') ? [3, 8] : [4, 10]);
      for (const e of [...x.topics, ...x.finds]) expect(Math.floor(e / 1000), `${id} ${e}`).toBe(id.startsWith('c') ? 1 : 2);
    }
    // 石板は C 8 枚・U 10 枚・Rare 以降は枠だけ
    expect(TABLETS.filter((x) => !x.soon)).toHaveLength(18);
    expect(TABLETS.filter((x) => x.soon).length).toBeGreaterThan(0);
  });

  it('発掘場の進み具合はセクタごと（SECTOR_KEYS）', () => {
    expect(SECTOR_KEYS).toContain('dig');
  });
});

describe('発掘許可（荒れ地ごと）', () => {
  it('セクタの 1 か所目は無料、2 か所目から申請料（Common 2,000 G・Uncommon 8,000 G）。足りなければ申請できない', () => {
    const s = newP1(1);
    expect(permitFee(s)).toBe(0);
    s.money = 0;
    expect(permitLock(s, 2)).toBeNull();
    expect(applyPermit(s, 2)).toEqual({ fee: 0 });
    expect(s.dig!.sites[2].permit).toBe(true);
    expect(applyPermit(s, 2)).toBe('have');
    expect(permitFee(s)).toBe(DIG_BALANCE.permitFee.C);
    expect(permitLock(s, 0)).toBe('money');
    s.money = 5000;
    const fees0 = s.books!.cur.fees;
    expect(applyPermit(s, 0)).toEqual({ fee: 2000 });
    expect(s.money).toBe(3000);
    expect(s.books!.cur.fees - fees0).toBe(2000);
    const u = newP1(1, 'U', 'u1');
    grantFirst(u);
    expect(permitFee(u)).toBe(DIG_BALANCE.permitFee.U);
  });

  it('1 か所目（発掘との出会いの手紙で無料で済ませる）は、自社の工房にいちばん近い荒れ地', () => {
    const s = site(2);
    const k = firstSite(s);
    const ws = myWorkshop(s)!;
    const d = (q: number) => Math.abs(wasteSpots('c1')[q][0] + 0.5 - ws.i) + Math.abs(wasteSpots('c1')[q][1] + 0.5 - ws.j);
    for (let q = 0; q < 4; q++) expect(d(k)).toBeLessThanOrEqual(d(q));
    expect(grantFirst(s)).toBe(k);
    expect(s.dig!.sites.map((x) => x.permit).filter(Boolean)).toHaveLength(1);
    // 2 回目は何もしない（もう 1 か所ある）
    grantFirst(s);
    expect(s.dig!.sites.filter((x) => x.permit)).toHaveLength(1);
  });

  it('許可が無いと発掘作業を始められない。一度もらえば何度でも掘れる', () => {
    const s = site();
    expect(runLock(s, 1)).toBe('no-permit');
    expect(startRun(s, 1)).toBe('no-permit');
    applyPermit(s, 1);
    for (let n = 0; n < 3; n++) {
      expect(typeof startRun(s, 1)).toBe('object');
      expect(runLock(s, 1)).toBe('busy');
      endRun(s);
    }
  });
});

describe('15 秒の発掘作業', () => {
  it('打てるのは作業のあいだだけ。回数の制限なしに何回でも打てる（工房が無くても掘れる）', () => {
    const s = newP1(1);
    s.dig!.sites[0].permit = true;
    expect(digCheck(s, 0, 0)).toBe('no-run');
    run(s, 0);
    expect(digCheck(s, 0, 0)).toBeNull();
    let n = 0;
    for (let k = 0; k < 400; k++) {
      const at = digNext(s);
      if (!at) break;
      if (typeof dig(s, at[0], at[1]) !== 'string') n++;
    }
    expect(n).toBeGreaterThan(200);
    expect('picks' in s.dig!).toBe(false);
  });

  it('長さは現実の 15 秒（sessionSec）。長押しは 0.17 秒ごと（digRepeatMs）。時間切れで作業が終わる', () => {
    const s = run(site());
    expect(sessionSec(s)).toBe(15);
    expect(digRepeatMs(s)).toBe(170);
    expect(s.digRun!.left).toBe(15000);
    expect(runTick(s, 14000)).toBe(false);
    expect(runTick(s, 1000)).toBe(true);
    const end = endRun(s)!;
    expect(end.crossed).toBe(false);
    expect(s.digRun).toBeNull();
    expect(dig(s, 0, 0)).toBe('no-run');
  });

  it('作業のあいだもゲームの時間は流れる。月をまたいでも報告は積むだけで、月末ポーズにならない。作業のあとに 1 回だけポーズ', () => {
    const s = site(3);
    s.open = 0;
    s.dig!.sites[0].permit = true;
    // 月の締めの少し前で、作業を始める
    for (let d = 0; d < 26; d++) step(s);
    expect(s.reports).toHaveLength(0);
    s.monthPause = true;
    run(s, 0);
    // 月末ポーズから始めたら、次の月が始まる（作業のあいだは時間が流れる）
    expect(s.monthPause).toBe(false);
    const got: boolean[] = [];
    for (let d = 0; d < 40; d++) {
      const r = step(s);
      if (r.report) got.push(holdReport(s));
    }
    expect(got).toEqual([true, true]);
    expect(s.reports).toHaveLength(2);
    expect(s.monthPause).toBe(false);
    const end = endRun(s)!;
    expect(end.crossed).toBe(true);
    expect(end.held).toEqual(s.reports);
    expect(s.monthPause).toBe(true);
    // 作業していない月は、ふだんどおり（holdReport は false）
    s.monthPause = false;
    let held: boolean | null = null;
    for (let d = 0; d < 31 && held == null; d++) if (step(s).report) held = holdReport(s);
    expect(held).toBe(false);
  });

  it('1 打の強さのぶん硬さが減り、硬さのぶん打つと崩れる（Common 1〜3・Uncommon 3〜5）', () => {
    const cs = digLayouts('c1').flatMap((L) => L.cells);
    expect(Math.min(...cs.map((c) => c.hard))).toBe(1);
    expect(Math.max(...cs.map((c) => c.hard))).toBe(3);
    const us = digLayouts('u1').flatMap((L) => L.cells);
    expect(Math.min(...us.map((c) => c.hard))).toBe(3);
    expect(Math.max(...us.map((c) => c.hard))).toBe(5);
    const s = run(site(), 0);
    const L = digLayout('c1', 0)!;
    const k = L.cells.findIndex((c, i) => c.hard >= 2 && i % 7 === 0);
    const y = Math.floor(k / 7);
    for (let yy = 0; yy < y; yy++) if (hpOf(s)[yy * 7] > 0) breakCell(s, 0, yy);
    let hits = 0;
    let r: DigHit | string;
    do {
      r = dig(s, 0, y);
      hits++;
    } while (typeof r !== 'string' && !r.broke);
    expect(hits).toBe(L.cells[k].hard);
    expect(digCheck(s, 0, y)).toBe('dug');
    expect(s.digRun!.got.cells).toBeGreaterThanOrEqual(y + 1);
  });

  it('届かないマスは打てない。掘り出したマスの隣は打てる（上から掘り進める）', () => {
    const s = run(site());
    expect(digCheck(s, 0, 5)).toBe('far');
    expect(digCheck(s, 9, 0)).toBe('out');
    breakCell(s, 3, 0);
    expect(digCheck(s, 3, 1)).toBeNull();
    expect(digCheck(s, 4, 1)).toBe('far');
  });

  it('荒れ地のマスを全部崩すと「掘りきった」（done）。もう作業は始められない。割合とお題の気配', () => {
    const s = run(site(), 1);
    expect(siteProgress(s, 1)).toBe(0);
    const tp0 = siteTopic(s, 1);
    expect(['none', 'hidden']).toContain(tp0);
    let last: DigHit | null = null;
    for (let k = 0; k < 2000; k++) {
      const at = digNext(s);
      if (!at) break;
      const r = dig(s, at[0], at[1]);
      if (typeof r !== 'string') last = r;
    }
    expect(last?.done).toBe(true);
    expect(s.dig!.sites[1].done).toBe(true);
    expect(siteProgress(s, 1)).toBe(1);
    if (tp0 === 'hidden') expect(siteTopic(s, 1)).toBe('found');
    expect(endRun(s)!.done).toBe(true);
    expect(runLock(s, 1)).toBe('done');
  });

  it('発掘終了の札の数：新発見・研究 Lv ↑・RP・素材・崩したマス（作業ごと）', () => {
    const s = run(site());
    for (let k = 0; k < 60; k++) {
      const at = digNext(s)!;
      dig(s, at[0], at[1]);
    }
    const got = { ...s.digRun!.got };
    expect(got.cells).toBeGreaterThan(10);
    expect(got.rp).toBe(s.dig!.month.rp);
    expect(got.found).toBe(s.dig!.month.found);
    const end = endRun(s)!;
    expect(end.got).toEqual(got);
    run(s, 0);
    expect(s.digRun!.got).toEqual({ found: 0, lv: 0, rp: 0, mat: 0, cells: 0 });
  });
});

describe('研究レベルと研究ポイント', () => {
  it('研究レベル：掘った数 1・2・4・7・11 で Lv1〜5（Lv2・3・4・5 に重なり 1・2・3・4 個）', () => {
    expect([0, 1, 2, 3, 4, 6, 7, 10, 11, 20].map(researchLv)).toEqual([0, 1, 2, 2, 3, 3, 4, 4, 5, 5]);
    expect(RESEARCH_NEED).toEqual([1, 2, 4, 7, 11]);
  });

  it('新しいエクステを初めて掘ると +15 RP、Lv が上がると +8・+15・+20・+25（研究 Lv は会社で共有）', () => {
    const s = run(site(), 0);
    const L = digLayout('c1', 0)!;
    const k = L.cells.findIndex((c) => c.item?.kind === 'ext' && !c.item.topic);
    const id = (L.cells[k].item as { id: number }).id;
    const rp0 = s.rp;
    const r = digTo(s, k % 7, Math.floor(k / 7));
    expect(r.first).toBe(true);
    expect(r.rp).toBe(RP_GAIN.C.first);
    expect(researchOf(s, id)).toBe(1);
    expect(researchLeft(s, id)).toBe(1);
    expect(s.rp - rp0).toBeGreaterThanOrEqual(RP_GAIN.C.first);
    // 重なりで Lv が上がる：Lv2（+5）・Lv5（+20）。別のセクタで同じエクステが出ても続きから（会社で共有）
    const others = L.cells.map((c, i) => [c, i] as const).filter(([c, i]) => i > k && c.item?.kind === 'ext' && !c.item.topic).map(([, i]) => i);
    const hitAt = (i: number, have: number) => {
      const x = i % 7;
      const y = Math.floor(i / 7);
      for (let yy = 0; yy < y; yy++) if (hpOf(s)[yy * 7 + x] > 0) breakCell(s, x, yy);
      const eid = (L.cells[i].item as { id: number }).id;
      s.research[eid] = have;
      return breakCell(s, x, y);
    };
    const r2 = hitAt(others[0], 1);
    expect([r2.lv, r2.rp, r2.first]).toEqual([2, RP_GAIN.C.lv[0], undefined]);
    const r5 = hitAt(others[1], 10);
    expect([r5.lv, r5.rp]).toEqual([5, RP_GAIN.C.lv[3]]);
    const r0 = hitAt(others[2], 4);
    expect([r0.lv, r0.rp]).toEqual([undefined, 0]);
    // 別のセクタ（ユーホタウン）でも、鏡（1105）は続きから
    const c2 = site(1, 'c2');
    c2.research[1105] = 6;
    const L2 = digLayouts('c2').find((L) => L.cells.some((c) => c.item?.kind === 'ext' && c.item.id === 1105))!;
    run(c2, L2.site);
    const m = L2.cells.findIndex((c) => c.item?.kind === 'ext' && c.item.id === 1105);
    expect(m).toBeGreaterThanOrEqual(0);
    expect(digTo(c2, m % 7, Math.floor(m / 7)).lv).toBe(4);
    expect(s.dig!.month.found).toBeGreaterThan(0);
  });

  it('Uncommon のセクタでは +25・+12〜+50（表のとおり）', () => {
    expect(RP_GAIN.U).toEqual({ first: 25, lv: [12, 25, 38, 50], topic: 100, tablet: 50, present: 150 });
    const s = run(site(4, 'u1', 'U'), 0);
    const L = digLayout('u1', 0)!;
    const k = L.cells.findIndex((c) => c.item?.kind === 'ext' && !c.item.topic);
    const r = digTo(s, k % 7, Math.floor(k / 7));
    expect(r.rp).toBe(25);
  });

  it('お題を掘るとその場で研究 Lv5・+40 RP（お題は各 1 つ）。4 か所の荒れ地を掘ってそろえると発表できる', () => {
    const s = site();
    expect(topicProgress(s)).toEqual([0, 3]);
    expect(presentLock(s)).toBe('not-yet');
    for (const L of digLayouts('c1')) {
    run(s, L.site);
    L.cells.forEach((c, k) => {
      if (c.item?.kind !== 'ext' || !c.item.topic) return;
      const rp0 = s.rp;
      const r = digTo(s, k % 7, Math.floor(k / 7));
      expect(r.item).toMatchObject({ topic: true });
      expect(r.lv).toBe(5);
      expect(s.rp - rp0).toBeGreaterThanOrEqual(RP_GAIN.C.topic);
      expect(researchOf(s, c.item.id)).toBe(5);
    });
    }
    expect(topicProgress(s)).toEqual([3, 3]);
    expect(s.dig!.topics).toEqual(expect.arrayContaining(DIG_SITES.c1.topics));
  });

  it('石板を掘ると +20 RP、研究ノートに残る（読み物）', () => {
    const s = site();
    const L = digLayouts('c1').find((x) => x.cells.some((c) => c.item?.kind === 'tablet'))!;
    run(s, L.site);
    const k = L.cells.findIndex((c) => c.item?.kind === 'tablet');
    const r = digTo(s, k % 7, Math.floor(k / 7));
    expect(r.item).toEqual({ kind: 'tablet', id: 'tab_c1' });
    expect(r.rp).toBe(RP_GAIN.C.tablet);
    expect(s.tablets).toEqual(['tab_c1']);
  });

  it('素材のマスは、そのセクタの素材が増える（Common：鉄・木材・粘土・ガラス）', () => {
    const s = run(site(1, 'c2'), 0);
    const L = digLayout('c2', 0)!;
    const k = L.cells.findIndex((c) => c.item?.kind === 'mat');
    const it = L.cells[k].item as { mat: 'glass'; n: number };
    const m0 = s.mats[it.mat] ?? 0;
    digTo(s, k % 7, Math.floor(k / 7));
    expect(s.mats[it.mat]).toBeGreaterThanOrEqual(m0 + it.n);
    expect(DIG.C.mats).toContain(it.mat);
    // 湖の町（ガラス・粘土が特産）は、ガラスと粘土のマスが多め
    const mats = digLayouts('c2').flatMap((x) => x.cells).filter((c) => c.item?.kind === 'mat').map((c) => (c.item as { mat: string }).mat);
    const n = (m: string) => mats.filter((x) => x === m).length;
    expect(n('glass') + n('clay')).toBeGreaterThan(n('iron') + n('wood'));
  });
});

describe('道具（工房の設備投資）', () => {
  it('ツルハシの新調：1 打の強さ +1（2 段）', () => {
    const s = run(site());
    expect(digPower(s)).toBe(1);
    const ws = myWorkshop(s)!;
    expect(invest(s, ws.uid, 'pick')).toBeNull();
    expect(digPower(s)).toBe(2);
    expect(invest(s, ws.uid, 'pick')).toBeNull();
    expect(digPower(s)).toBe(3);
    expect(invest(s, ws.uid, 'pick')).not.toBeNull();
    // 硬さ 3 のマスが 1 打で崩れる
    const L = digLayout('c1', 0)!;
    const k = L.cells.findIndex((c) => c.hard === 3);
    for (let yy = 0; yy < Math.floor(k / 7); yy++) if (hpOf(s)[yy * 7 + (k % 7)] > 0) breakCell(s, k % 7, yy);
    const r = dig(s, k % 7, Math.floor(k / 7));
    expect(typeof r !== 'string' && r.broke).toBe(true);
  });

  it('ランタン：手が届くマスの 1 段下の出土品が見える（無いと見えない）', () => {
    const s = run(site());
    const L = digLayout('c1', 0)!;
    // 1 段目のどこかを崩す → その下（2 段目）は手が届く、3 段目はランタンで見える
    breakCell(s, 0, 0);
    const want = (y: number) => L.cells[y * 7].item;
    expect(peek(s, 0, 2)).toBeNull();
    invest(s, myWorkshop(s)!.uid, 'lantern');
    expect(peek(s, 0, 2)).toEqual(want(2));
    expect(peek(s, 0, 1)).toEqual(want(1));
    expect(peek(s, 0, 4)).toBeNull();
  });

  it('発破：火薬代で 3 × 3 を一度に崩す（道具が無いと使えない。回数は使わない）', () => {
    const s = run(site());
    expect(blast(s, 3, 0)).toBe('no-blast');
    invest(s, myWorkshop(s)!.uid, 'blast');
    const m0 = s.money;
    const r = blast(s, 3, 0);
    if (typeof r === 'string') throw new Error(r);
    expect(r).toHaveLength(6);
    expect(r.every((x) => x.broke)).toBe(true);
    expect(s.money).toBe(m0 - BLAST.cost);
  });
});

describe('発掘隊（仕事「発掘」）', () => {
  it('適性は 0.6 × PHY ＋ 0.2 × AGI ＋ 0.2 × INT', () => {
    expect(aptitude({ hp: 100, phy: 50, int: 20, agi: 10 }, 'dig')).toBeCloseTo(0.6 * 50 + 0.2 * 10 + 0.2 * 20, 6);
  });

  it('発掘作業のあいだだけ、同じ荒れ地を 1 日に数回ぶん打つ。作業していない日は働かない・スタミナも減らない', () => {
    const s = site();
    expect(assign(s, 10001, 'dig')).toBeNull();
    const st = s.staff.find((x) => x.hero === 10001)!;
    const sta0 = st.stamina;
    expect(step(s).dug).toBeUndefined();
    expect(st.stamina).toBeGreaterThanOrEqual(sta0);
    run(s, 2);
    const res = step(s);
    const n = res.dug?.length ?? 0;
    expect(n).toBeGreaterThanOrEqual(1);
    expect(n).toBeLessThanOrEqual(6);
    expect(s.dig!.sites[2].hp.some((v, k) => v < digLayout('c1', 2)!.cells[k].hard)).toBe(true);
    expect(s.dig!.sites[0].hp).toEqual(newDig('c1')!.sites[0].hp);
    expect(st.stamina).toBeLessThan(sta0 + 1e-9);
    endRun(s);
    expect(step(s).dug).toBeUndefined();
  });

  it('発掘場の無いセクタでは発掘の仕事に就けない', () => {
    const s = newP1(1, 'R', 'r1');
    expect(assign(s, 10001, 'dig')).toBe('no-site');
  });
});

describe('スキルツリーの 2 区分', () => {
  it('お金パネルは技を除く 7 本 × 5 ランクの 35 枚（Lv5 まで）、残りは研究パネル（レベルなし）', () => {
    const money = SKILLS.filter((k) => !isResearch(k));
    expect(money).toHaveLength(35);
    expect(Object.values(MONEY_PANELS.C).sort()).toEqual(['budget', 'bulk', 'host', 'jig', 'manual', 'pos', 'shortcut']);
    for (const tier of ['C', 'U', 'R', 'E', 'L'] as const) {
      const ids = Object.values(MONEY_PANELS[tier]);
      expect(ids, tier).toHaveLength(7);
      for (const id of ids) {
        expect(SKILL[id], id).toBeTruthy();
        expect(SKILL[id].tier ?? 'C').toBe(tier);
        expect(maxLv(SKILL[id]), id).toBe(5);
        expect(SKILL[id].branch).not.toBe('tech');
      }
    }
    for (const k of SKILLS.filter(isResearch)) {
      expect(maxLv(k), k.id).toBe(1);
      expect(rpCost(k), k.id).toBeGreaterThan(0);
    }
    expect(SKILLS.filter(isResearch).length).toBe(SKILLS.length - 35);
  });

  it('RP の値段：Common 平均 50 前後（20〜80）・Uncommon 平均 120 前後・Rare 以降 2.5 倍ずつ・大きめの研究パネルは約 2.5 倍・人材の募集は 30', () => {
    const avg = (tier: string) => {
      const r = SKILLS.filter((k) => (k.tier ?? 'C') === tier && isResearch(k) && !k.big);
      return r.reduce((a, k) => a + rpCost(k), 0) / r.length;
    };
    expect(avg('C')).toBeGreaterThan(45);
    expect(avg('C')).toBeLessThan(55);
    for (const k of SKILLS.filter((x) => !x.tier && isResearch(x) && !x.big)) {
      expect(rpCost(k), k.id).toBeGreaterThanOrEqual(20);
      expect(rpCost(k), k.id).toBeLessThanOrEqual(80);
    }
    expect(avg('U')).toBeGreaterThan(110);
    expect(avg('U')).toBeLessThan(130);
    expect(avg('R') / avg('U')).toBeCloseTo(2.5, 1);
    expect(avg('E') / avg('R')).toBeCloseTo(2.5, 1);
    expect(avg('L') / avg('E')).toBeCloseTo(2.5, 1);
    for (const k of SKILLS.filter((x) => x.big)) expect(rpCost(k) / avg(k.tier ?? 'C'), k.id).toBeCloseTo(2.5, 0);
    expect(rpCost(SKILL.hire)).toBe(START_RP);
  });

  it('研究パネルは RP で開く（資金は減らない）。お金パネルは資金で開き、レベルも資金で上がる', () => {
    const s = newP1(2);
    s.money = 1e6;
    expect(s.rp).toBe(30);
    const m0 = s.money;
    expect(learn(s, 'display')).toBeNull();
    expect([s.money, s.rp]).toEqual([m0, 30 - rpCost(SKILL.display)]);
    s.rp = 0;
    expect(learn(s, 'lounge')).toBe('rp');
    expect(learn(s, 'host')).toBeNull();
    expect(s.money).toBe(m0 - SKILL.host.cost);
    expect(levelUp(s, 'host')).toBeNull();
    expect(lvOf(s, 'host')).toBe(2);
    expect(s.money).toBe(m0 - SKILL.host.cost - levelCost(SKILL.host, 2));
    expect(levelUp(s, 'display')).toBe('max');
    s.money = 0;
    expect(learn(s, 'jig')).toBe('money');
  });

  it('依頼の ✨ 報酬は RP に（1 ✨ = 40 RP）', () => {
    expect(RP_PER_DUST).toBe(40);
    const s = newP1(3);
    s.missions.c2_top = 'done';
    claim(s, 'c2_top');
    expect(s.rp).toBe(30 + 40);
    expect(MISSIONS.every((m) => !('dust' in m))).toBe(true);
  });
});

describe('調査依頼状', () => {
  /** いまの Common のセクタのお題を全部掘る */
  const allTopics = (s: P1State) => {
    for (const L of digLayouts(s.dig!.sector)) {
      if (L.topic == null) continue;
      run(s, L.site);
      L.cells.forEach((c, k) => {
        if (c.item?.kind === 'ext' && c.item.topic && hpOf(s)[k] > 0) digTo(s, k % 7, Math.floor(k / 7));
      });
      endRun(s);
    }
  };

  it('調査依頼状が無いと Uncommon に出店できない。Common のお題をそろえて発表すると +60 RP と調査依頼状', () => {
    const s = site(5);
    openGate(s);
    expect(hasLetter(s, 'U')).toBe(false);
    expect(moveTo(s, 'u1', null)).toBe('letter');
    expect(present(s)).toBe('not-yet');
    allTopics(s);
    const rp0 = s.rp;
    expect(present(s)).toEqual({ rp: RP_GAIN.C.present, letter: 'U' });
    expect(s.rp - rp0).toBe(60);
    expect(present(s)).toBe('done');
    expect(hasLetter(s, 'U')).toBe(true);
    expect(moveTo(s, 'u1', 10001)).toBeNull();
    expect(s.sector).toBe('u1');
    // 着いたセクタは新しい発掘場（Uncommon・荒れ地 4 か所・許可はまだ）
    expect(s.dig).toMatchObject({ sector: 'u1' });
    expect(s.dig!.sites.map((x) => x.permit)).toEqual([false, false, false, false]);
  });

  it('Common どうしの移動はいまのまま（依頼状は要らない）。戻ると発掘場は離れたときのまま', () => {
    const s = site(6);
    openGate(s);
    run(s, 3);
    breakCell(s, 2, 0);
    endRun(s);
    const sites = JSON.parse(JSON.stringify(s.dig!.sites));
    expect(moveTo(s, 'c2', 10001)).toBeNull();
    expect(s.dig!.sector).toBe('c2');
    expect(moveTo(s, 'c1', 10002)).toBeNull();
    expect(s.dig!.sites).toEqual(sites);
  });
});

describe('セーブ', () => {
  it('新しいゲームは版 3・30 RP。発掘の進み・許可・研究ノートはセーブに残る', () => {
    const s = run(site());
    expect([s.v, s.rp]).toEqual([3, 30]);
    breakCell(s, 0, 0);
    endRun(s);
    s.research[1011] = 3;
    s.tablets = ['tab_c1'];
    s.letters = ['U'];
    const back = deserializeP1(serializeP1(s))!;
    expect(back.dig!.sites).toEqual(s.dig!.sites);
    expect(back.research[1011]).toBe(3);
    expect(back.tablets).toEqual(['tab_c1']);
    expect(back.letters).toEqual(['U']);
  });

  it('古いセーブ（版 1）：研究パネルのレベル上げぶんを資金に戻して Lv1 に。お金パネルのレベルはそのまま。✨ は 40 RP ずつ。開始時の 30 RP は無し', () => {
    const s = newP1(7);
    for (const id of ['host', 'golden', 'jig', 'lounge', 'd_shop']) s.skills.push(id);
    setLevel(s, 'host', 3);
    setLevel(s, 'golden', 3);
    setLevel(s, 'lounge', 2);
    setLevel(s, 'd_shop', 3);
    const o = JSON.parse(serializeP1(s));
    o.v = 1;
    o.dust = 2;
    delete o.rp;
    delete o.research;
    delete o.tablets;
    delete o.letters;
    delete o.presented;
    delete o.dig;
    const m0 = o.money;
    const old = deserializeP1(JSON.stringify(o))!;
    // 版 1 → 2 → 3 と順に移す
    expect(old.v).toBe(3);
    expect(old.dig!.sites).toHaveLength(4);
    expect(old.skills).toEqual(expect.arrayContaining(['host', 'golden', 'jig', 'lounge', 'd_shop']));
    expect([lvOf(old, 'host'), lvOf(old, 'golden'), lvOf(old, 'lounge'), lvOf(old, 'd_shop')]).toEqual([3, 1, 1, 1]);
    const refund = levelCost(SKILL.golden, 2) + levelCost(SKILL.golden, 3) + levelCost(SKILL.lounge, 2);
    expect(old.money).toBe(m0 + refund);
    // ✨ 2 つ ＋ 名物店主の Lv2・3 に払った ✨4・✨5 → 11 × 40 RP
    expect(old.rp).toBe((2 + 4 + 5) * 40);
    expect(old.dig?.sector).toBe('c1');
    expect(old.letters).toEqual([]);
    expect('dust' in old).toBe(false);
  });

  it('古いセーブで、すでに Uncommon に出店していれば調査依頼状を持っている', () => {
    const s = newP1(8);
    s.land = { cur: 'c1', mine: ['c1', 'u1'], recs: {} };
    const o = JSON.parse(serializeP1(s));
    o.v = 1;
    delete o.letters;
    expect(deserializeP1(JSON.stringify(o))!.letters).toEqual(['U']);
    const o2 = JSON.parse(serializeP1(newP1(8, 'U', 'u2')));
    o2.v = 1;
    delete o2.letters;
    const u = deserializeP1(JSON.stringify(o2))!;
    expect(u.letters).toEqual(['U']);
    expect(u.dig?.sector).toBe('u2');
  });

  it('版 2 → 3：研究ノート・RP・お題の発見はそのまま。荒れ地 4 か所で作り直し（見つけたお題は再び出ない）。1 か所目の許可は済み。ツルハシの回数は捨てる', () => {
    const s = site(9);
    const o = JSON.parse(serializeP1(s));
    o.v = 2;
    // 版 2 の発掘場：1 つ・工房の裏（210 マス）・ツルハシの回数
    const found = DIG_SITES.c1.topics[0];
    o.dig = { sector: 'c1', picks: 17, hp: new Array(210).fill(0), topics: [found], carry: 0.4, month: { found: 3, lv: 1, rp: 70 } };
    o.rp = 333;
    o.research = { [found]: 11, 1011: 4 };
    o.tablets = ['tab_c1'];
    o.presented = [];
    const back = deserializeP1(JSON.stringify(o))!;
    expect(back.v).toBe(3);
    expect(back.rp).toBe(333);
    expect(back.research).toEqual({ [found]: 11, 1011: 4 });
    expect(back.tablets).toEqual(['tab_c1']);
    const d = back.dig!;
    expect(d.sites).toHaveLength(4);
    expect('picks' in d).toBe(false);
    expect(d.topics).toEqual([found]);
    expect(d.month).toEqual({ found: 3, lv: 1, rp: 70 });
    expect(d.sites.map((x) => x.hp)).toEqual(newDig('c1')!.sites.map((x) => x.hp));
    const k = firstSite(back);
    expect(d.sites.map((x, q) => x.permit === (q === k))).toEqual([true, true, true, true]);
    expect(topicProgress(back)).toEqual([1, 3]);
    // 見つけ済みのお題の荒れ地は「お題：見つけ済み」。掘っても二度と出ない（RP も入らない）
    const L = digLayouts('c1').find((x) => x.topic === found)!;
    expect(siteTopic(back, L.site)).toBe('found');
    run(back, L.site);
    const tk = L.cells.findIndex((c) => c.item?.kind === 'ext' && c.item.topic);
    const r = digTo(back, tk % 7, Math.floor(tk / 7));
    expect(r.item).toBeNull();
    expect(r.rp).toBe(0);
    expect(back.dig!.topics).toEqual([found]);
  });

  it('版 2 のセクタの写し（ランドの移動で戻る）も、戻ったときに荒れ地 4 か所に作り直す', () => {
    const s = site(10);
    openGate(s);
    expect(moveTo(s, 'c2', 10001)).toBeNull();
    const rec = s.land!.recs.c1!;
    (rec.snap as { dig: unknown }).dig = { sector: 'c1', picks: 5, hp: new Array(210).fill(1), topics: [], carry: 0, month: { found: 0, lv: 0, rp: 0 } };
    expect(moveTo(s, 'c1', 10002)).toBeNull();
    expect(s.dig!.sector).toBe('c1');
    expect(s.dig!.sites).toHaveLength(4);
    expect(s.dig!.sites.filter((x) => x.permit)).toHaveLength(1);
  });
});
