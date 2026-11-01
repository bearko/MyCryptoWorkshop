/**
 * 発掘 v2 の 2 段目：発掘のスキルツリー（9 本目の枝「発掘」。docs/ISLAND_PHASE1.md「地層の発掘と研究ポイント」の「2. 発掘のスキルツリー」）。
 * 各パネルの各 Lv で効き目が数字に出ること（作業時間・1 打の強さ・会心・長押しの間隔・隣への力・見える深さ・掘れる層・研究の上限と深さの倍率・
 * 上限で貯めて上がったときに Lv と RP・発破の火薬代と大きさ・ドリル・隊の人数の上限・隊の速さ・常駐の有無と速さ・段取り・交代制・素材）、
 * 版 3 → 4 の引き継ぎ、出会いの前は枝が隠れていること、パネルが重ならないこと。投資の監査（island:audit）では発掘の枝は「対象外」なので、ここで全部確かめる。
 */
import { describe, expect, it } from 'vitest';
import { BRANCHES, DIG_BALANCE, DIG_PANELS, DIG_SITES, INVESTS, LV_COST, RESEARCH_NEED, RP_GAIN, SKILL, SKILLS, isResearch, levelCost, maxLv, shownOf, shownText } from '../src/island/p1/data';
import {
  affordableSkills,
  assign,
  autoRate,
  autoDig,
  blast,
  blastCost,
  blastSize,
  build,
  allowedDirs,
  crewCap,
  deepLayers,
  deserializeP1,
  dig,
  digCheck,
  digLayout,
  digLayouts,
  digNext,
  digPower,
  digRepeatMs,
  drainOf,
  drill,
  endRun,
  fxSum,
  hire,
  learn,
  levelUp,
  lvOf,
  newP1,
  peek,
  researchCap,
  researchLeft,
  researchOf,
  runLock,
  serializeP1,
  sessionSec,
  setLevel,
  skillLock,
  standSite,
  startRun,
  step,
  type DigHit,
  type P1State,
} from '../src/island/p1/model';
import { cellView, digRec, digSpec, lockedLayer, nextLvText, noteEntries, standing } from '../src/island/p1/digview';
import { BRANCH_TIP, digTips } from '../src/island/p1/digmeet';
import { BR_CAP, HUBPOS, LAYOUT, POS, UNPLACED } from '../src/island/p1/treelayout';
import { specOf } from '../scripts/island/audit';

const T = DIG_BALANCE.tree;
const lot = (s: P1State, id: string): [number, number, 'rd' | 'ld' | 'lu' | 'ru'] => {
  for (let j = 0; j < s.n; j++) for (let i = 0; i < s.n; i++) { const d = allowedDirs(s, id, i, j); if (d.length) return [i, j, d[0]]; }
  throw new Error('no lot');
};
/** 発掘との出会いのあと（枝が見える）・資金たっぷり・工房あり */
function met(seed = 1, sector = 'c1', tier: 'C' | 'U' = 'C'): P1State {
  const s = newP1(seed, tier, sector);
  s.money = 1e8;
  s.tut = 99;
  s.flags.hq = true;
  s.flags.digMeet = 'done';
  s.skills.push('hire');
  const b = build(s, 'workshop', ...lot(s, 'workshop'));
  if (typeof b === 'string') throw new Error(b);
  b.left = 0;
  return s;
}
function run(s: P1State, k = 0): P1State {
  s.dig!.sites[k].permit = true;
  if (s.digRun) endRun(s);
  const r = startRun(s, k);
  if (typeof r === 'string') throw new Error(r);
  return s;
}
const hpOf = (s: P1State) => s.dig!.sites[s.dig!.cur].hp;
function breakCell(s: P1State, x: number, y: number): DigHit {
  for (let k = 0; k < 40; k++) {
    const r = dig(s, x, y);
    if (typeof r === 'string') throw new Error(`${x},${y}: ${r}`);
    if (hpOf(s)[y * 7 + x] <= 0) return r;
  }
  throw new Error('not broken');
}
function digTo(s: P1State, x: number, y: number): DigHit {
  for (let yy = 0; yy < y; yy++) if (hpOf(s)[yy * 7 + x] > 0) breakCell(s, x, yy);
  return breakCell(s, x, y);
}
/** 荒れ地 k の、いまの許可で掘れる層をぜんぶ崩す */
function clearOpen(s: P1State, k = 0) {
  run(s, k);
  const L = digLayout(s.dig!.sector, k)!;
  const n = deepLayers(s, L.tier);
  for (let y = 0; y < L.h; y++) if (L.cells[y * 7].layer < n) for (let x = 0; x < 7; x++) if (hpOf(s)[y * 7 + x] > 0) breakCell(s, x, y);
}
const lv = (s: P1State, id: string, n: number) => setLevel(s, id, n);

describe('データ：9 本目の枝「発掘」', () => {
  it('BRANCHES に dig。パネルは Common 11 枚・Uncommon 外周 6 枚、すべてお金パネル（Lv1〜5・levelCost）。値段は C 2,000〜12,000・U 20,000〜80,000', () => {
    expect(BRANCHES.at(-1)).toEqual({ key: 'dig', name: '発掘' });
    const ks = SKILLS.filter((k) => k.branch === 'dig');
    expect(ks.map((k) => k.id)).toEqual(DIG_PANELS);
    expect(ks.filter((k) => !k.tier)).toHaveLength(11);
    expect(ks.filter((k) => k.tier === 'U')).toHaveLength(6);
    for (const k of ks) {
      expect(isResearch(k), k.id).toBe(false);
      expect(maxLv(k), k.id).toBe(5);
      const [lo, hi] = k.tier ? [20000, 80000] : [2000, 12000];
      expect(k.cost, k.id).toBeGreaterThanOrEqual(lo);
      expect(k.cost, k.id).toBeLessThanOrEqual(hi);
      expect(levelCost(k, 2), k.id).toBe(Math.round((k.cost * LV_COST[1]) / 100) * 100);
      for (const r of k.requires ?? []) expect(SKILL[r]?.branch, `${k.id} → ${r}`).toBe('dig');
    }
    // 例：発掘の追加申請 Lv2 は 4,000 G
    expect(levelCost(SKILL.dig_ext, 2)).toBe(4000);
    // Uncommon の外周の最初の 2 枚にエンブレム（ほかの枝の外周と同じ開き方）
    expect([SKILL.u_dig_ext2.emblem, SKILL.u_dig_auto.emblem]).toEqual([1, 2]);
    // 先に要るパネルのレベル
    expect(SKILL.u_dig_auto.reqLv).toEqual({ dig_crew: 3 });
    expect(SKILL.u_dig_ext2.reqLv).toEqual({ dig_ext: 5 });
    expect(SKILL.u_dig_power2.reqLv).toEqual({ dig_power: 5 });
  });

  it('設備投資から発掘の道具（ツルハシの新調・ランタン・発破の道具）が消えた。既存のパネル・設備の値段はそのまま', () => {
    expect(INVESTS.map((x) => x.id)).not.toEqual(expect.arrayContaining(['pick']));
    expect(INVESTS.some((x) => ['pick', 'lantern', 'blast'].includes(x.id))).toBe(false);
    expect([SKILL.host.cost, SKILL.jig.cost, SKILL.hire.cost]).toEqual([4000, 4000, 3000]);
  });

  it('配置：どのパネルも置かれていて、パネルどうし 1.05 より離れ、根もととも重ならない。発掘の枝は物流とシステムのあいだ（外周は 1 段 3 枚）', () => {
    expect(UNPLACED).toEqual([]);
    const ps = [...POS.entries()];
    for (let i = 0; i < ps.length; i++) for (let j = i + 1; j < ps.length; j++) expect(Math.hypot(ps[i][1].x - ps[j][1].x, ps[i][1].y - ps[j][1].y), `${ps[i][0]}–${ps[j][0]}`).toBeGreaterThan(1.05);
    for (const [, p] of HUBPOS) for (const [id, q] of ps) expect(Math.hypot(p.x - q.x, p.y - q.y), id).toBeGreaterThan(0.9);
    expect(LAYOUT.dig.angle).toBeGreaterThan(LAYOUT.logi.angle);
    expect(LAYOUT.dig.angle).toBeLessThan(LAYOUT.sys.angle);
    expect(LAYOUT.dig.rows.flat().sort()).toEqual(DIG_PANELS.filter((id) => !SKILL[id].tier).sort());
    expect(BR_CAP.dig).toBe(3);
    // もとの 8 本は大きく動かさない（回すのは 12° まで）
    const OLD = { buy: 180, tech: -135, craft: -90, logi: -45, sys: 0, shop: 45, ops: 90, people: 135 } as const;
    for (const [br, a] of Object.entries(OLD)) expect(Math.abs(LAYOUT[br as keyof typeof OLD].angle - a), br).toBeLessThan(12);
  });

  it('出会いの前は枝ごと雲の中：研究も開放もできない（hidden）。「上げられる」にも入らない。出会いのあとは取れる', () => {
    const s = met();
    delete s.flags.digMeet;
    expect(skillLock(s, SKILL.dig_ext)).toBe('hidden');
    expect(learn(s, 'dig_ext')).toBe('hidden');
    expect(affordableSkills(s).some((k) => SKILL[k.id].branch === 'dig')).toBe(false);
    s.flags.digMeet = 'done';
    expect(skillLock(s, SKILL.dig_ext)).toBeNull();
    expect(learn(s, 'dig_ext')).toBeNull();
    expect(lvOf(s, 'dig_ext')).toBe(1);
  });

  it('先に要るもの：常駐は発掘隊の手際 Lv3 から（Lv2 では取れない）', () => {
    const s = met();
    s.emblem = 9;
    s.flags.rings = ['U'];
    lv(s, 'dig_ext', 1);
    lv(s, 'dig_office', 1);
    lv(s, 'dig_crew', 2);
    expect(skillLock(s, SKILL.u_dig_auto)).toBe('requires');
    lv(s, 'dig_crew', 3);
    expect(skillLock(s, SKILL.u_dig_auto)).toBeNull();
    // 素材の選り分けは Uncommon の輪が開いていればよい
    expect(skillLock(s, SKILL.u_dig_mat)).toBeNull();
    s.flags.rings = [];
    expect(skillLock(s, SKILL.u_dig_mat)).toBe('ring');
  });

  it('監査（island:audit）では「対象外」：発掘（tests/island-p1-dig2b.test.ts で確認）', () => {
    for (const id of DIG_PANELS) expect(specOf(SKILL[id])?.out, id).toBe('発掘（tests/island-p1-dig2b.test.ts で確認）');
  });

  it('パネルの説明の Lv ごとの値（いまの効果 → 次のレベル）が既存の仕組みで出る', () => {
    const line = (id: string, n: number) => shownOf(SKILL[id]).base.map((x) => shownText(x, n));
    expect(line('dig_ext', 1)).toEqual(['+3 秒']);
    expect(line('dig_ext', 5)).toEqual(['+15 秒']);
    expect(line('dig_speed', 1)).toEqual(['150 ms']);
    expect(line('dig_speed', 5)).toEqual(['90 ms']);
    expect(line('dig_power', 2)).toEqual(['+1', '+10%']);
    expect(line('dig_deep', 1)[0]).toBe('岩盤まで');
    expect(line('dig_deep', 3)[1]).toBe('大地のつなぎ目まで');
    expect(line('dig_study', 2)[0]).toBe('Lv5');
    expect(line('dig_blast', 4)).toEqual(['1,000 G', '4 × 4']);
    expect(line('u_dig_relay', 2)).toEqual(['−30%']);
  });
});

describe('作業時間・威力・速さ', () => {
  it('発掘の追加申請：1 回の発掘作業 15 → 18・21・24・27・30 秒。長期の発掘許可でさらに +6 秒／Lv（最大 60）', () => {
    const s = met();
    expect(sessionSec(s)).toBe(15);
    const got = [1, 2, 3, 4, 5].map((n) => (lv(s, 'dig_ext', n), sessionSec(s)));
    expect(got).toEqual([18, 21, 24, 27, 30]);
    const more = [1, 2, 3, 4, 5].map((n) => (lv(s, 'u_dig_ext2', n), sessionSec(s)));
    expect(more).toEqual([36, 42, 48, 54, 60]);
    run(s, 0);
    expect(s.digRun!.total).toBe(60000);
  });

  it('ツルハシの鍛え直し：1 打の強さ 2・2・3・3・4、会心（2 倍）は Lv2・4 で 10%・20%。重機の貸し出しでさらに +1・+1・+2・+2・+3', () => {
    const s = met();
    expect(digPower(s)).toBe(1);
    const p = [1, 2, 3, 4, 5].map((n) => (lv(s, 'dig_power', n), [digPower(s), fxSum(s, 'dig.crit')]));
    expect(p).toEqual([
      [2, 0],
      [2, 0.1],
      [3, 0.1],
      [3, 0.2],
      [4, 0.2],
    ]);
    const q = [1, 2, 3, 4, 5].map((n) => (lv(s, 'u_dig_power2', n), digPower(s)));
    expect(q).toEqual([5, 5, 6, 6, 7]);
  });

  it('会心は打った数から決まる（同じ打ち方なら同じ）。Lv2 でおよそ 10%、会心の 1 打は 2 倍の強さ', () => {
    const s = met();
    lv(s, 'dig_deep', 1);
    lv(s, 'dig_power', 2);
    run(s, 0);
    let crit = 0;
    let n = 0;
    for (let k = 0; k < 600; k++) {
      const at = digNext(s);
      if (!at) break;
      const before = hpOf(s)[at[1] * 7 + at[0]];
      const r = dig(s, at[0], at[1]);
      if (typeof r === 'string') break;
      n++;
      if (r.crit) {
        crit++;
        expect(before - r.left).toBe(Math.min(before, 4));
      }
    }
    expect(n).toBeGreaterThan(80);
    expect(crit / n).toBeGreaterThan(0.04);
    expect(crit / n).toBeLessThan(0.2);
  });

  it('手早い掘り方：長押しの間隔 170 → 150・130・115・100・90 ms', () => {
    const s = met();
    expect(digRepeatMs(s)).toBe(170);
    expect([1, 2, 3, 4, 5].map((n) => (lv(s, 'dig_speed', n), digRepeatMs(s)))).toEqual([150, 130, 115, 100, 90]);
  });

  it('広く掘る：打ったマスの隣にも力の一部（Lv1 左右 25%・Lv3 左右と下 45%・Lv5 上下左右 60%）。崩れたら中身も出る', () => {
    const s = met();
    lv(s, 'dig_deep', 1);
    run(s, 0);
    const hard = (x: number, y: number) => digLayout('c1', 0)!.cells[y * 7 + x].hard;
    lv(s, 'dig_reach', 1);
    const r = dig(s, 3, 0);
    if (typeof r === 'string') throw new Error(r);
    expect(r.extra?.map((h) => [h.x, h.y])).toEqual([
      [2, 0],
      [4, 0],
    ]);
    expect(hpOf(s)[2]).toBeCloseTo(Math.max(0, hard(2, 0) - 0.25), 5);
    // Lv3：左右と下
    lv(s, 'dig_reach', 3);
    breakCell(s, 0, 0);
    const r3 = dig(s, 0, 1);
    if (typeof r3 === 'string') throw new Error(r3);
    expect(r3.extra?.map((h) => [h.x, h.y]).sort()).toEqual([
      [0, 2],
      [1, 1],
    ]);
    // Lv5：上下左右に 60%（打ったマスの強さ 1 × 0.6）
    lv(s, 'dig_reach', 5);
    expect(fxSum(s, 'dig.reach')).toBe(0.6);
    const hp0 = hpOf(s)[6 * 7 + 6];
    for (let y = 0; y < 6; y++) if (hpOf(s)[y * 7 + 6] > 0) breakCell(s, 6, y);
    expect(hpOf(s)[6 * 7 + 6]).toBeLessThan(hp0);
    // 隣の力で崩れたマスからも中身が出る：1 打の強さ 4（ツルハシ Lv5）× 25% ＝ 硬さ 1 の隣のマスが崩れる
    const t = met(3);
    lv(t, 'dig_deep', 1);
    lv(t, 'dig_power', 5);
    lv(t, 'dig_reach', 1);
    run(t, 0);
    const L = digLayout('c1', 0)!;
    expect(L.cells[0].item?.kind).toBe('ext');
    expect(L.cells[0].hard).toBe(1);
    const r2 = dig(t, 1, 0);
    if (typeof r2 === 'string') throw new Error(r2);
    const got = r2.extra?.find((h) => h.x === 0 && h.y === 0);
    expect(got).toMatchObject({ broke: true, splash: true });
    expect(got?.item).toEqual(L.cells[0].item);
    expect(got!.first).toBe(true);
  });
});

describe('見える深さ・掘れる層・研究', () => {
  it('発掘のランタン：見える深さ 1・2・3 段。Lv4 はお題の気配が さらに 2 段先まで、Lv5 は石板も', () => {
    const s = met();
    lv(s, 'dig_deep', 1);
    run(s, 0);
    breakCell(s, 0, 0);
    const L = digLayout('c1', 0)!;
    const it = (y: number) => L.cells[y * 7].item;
    // (0, 1) は手が届く。y = 1 + d まで見える
    for (const n of [1, 2, 3]) {
      lv(s, 'dig_lamp', n);
      expect(peek(s, 0, 1 + n), `Lv${n}`).toEqual(it(1 + n));
      expect(peek(s, 0, 2 + n), `Lv${n} +1`).toBeNull();
    }
    // お題・石板のマス：手が届くマスからの深さが 4〜5 段のとき、Lv4 でお題・Lv5 で石板が見える
    const find = (kind: 'topic' | 'tablet') => {
      for (let k = 0; k < 4; k++) {
        const Lk = digLayout('c1', k)!;
        const i = Lk.cells.findIndex((c) => (kind === 'topic' ? c.item?.kind === 'ext' && !!c.item.topic : c.item?.kind === 'tablet'));
        if (i >= 0) return { k, i };
      }
      return null;
    };
    for (const kind of ['topic', 'tablet'] as const) {
      const f = find(kind)!;
      const t = met(2);
      lv(t, 'dig_deep', 1);
      run(t, f.k);
      const x = f.i % 7;
      const y = Math.floor(f.i / 7);
      // そのマスの 5 段上まで掘る（手が届くのは 4 段上のマス）
      for (let yy = 0; yy < y - 4; yy++) breakCell(t, x, yy);
      lv(t, 'dig_lamp', 3);
      expect(peek(t, x, y), `${kind} Lv3`).toBeNull();
      lv(t, 'dig_lamp', 4);
      if (kind === 'topic') expect(peek(t, x, y)).toEqual(digLayout('c1', f.k)!.cells[f.i].item);
      else expect(peek(t, x, y)).toBeNull();
      lv(t, 'dig_lamp', 5);
      expect(peek(t, x, y), `${kind} Lv5`).toEqual(digLayout('c1', f.k)!.cells[f.i].item);
    }
  });

  it('深い層の許可：はじめは 2 層目まで（岩盤は「深い層の許可が要る」）。Common は Lv1 で岩盤、Uncommon は Lv2 で 3 層目・Lv3 で 4 層目', () => {
    const s = met();
    expect(deepLayers(s, 'C')).toBe(2);
    run(s, 0);
    const L = digLayout('c1', 0)!;
    const y2 = L.rows[2];
    expect(digCheck(s, 0, y2)).toBe('deep');
    expect(cellView(s, 0, y2).state).toBe('locked');
    expect(lockedLayer(s)).toBe(2);
    expect(digSpec(s)).toEqual({ sec: 15, power: 1, deep: '粘土層', cap: 3 });
    lv(s, 'dig_deep', 1);
    expect(deepLayers(s, 'C')).toBe(3);
    expect(digCheck(s, 0, y2)).toBe('far');
    expect(lockedLayer(s)).toBeNull();
    expect(digSpec(s)!.deep).toBe('岩盤');
    const u = met(1, 'u1', 'U');
    expect(deepLayers(u, 'U')).toBe(2);
    expect([1, 2, 3, 4, 5].map((n) => (lv(u, 'dig_deep', n), deepLayers(u, 'U')))).toEqual([2, 3, 4, 4, 4]);
  });

  it('いまの許可で掘れるマスが無くなった荒れ地は、作業を始められない（deep）。深い層の許可で掘れるようになる。掘りきり（done）は全部の層', () => {
    const s = met();
    clearOpen(s, 0);
    endRun(s);
    expect(s.dig!.sites[0].done).toBe(false);
    expect(runLock(s, 0)).toBe('deep');
    lv(s, 'dig_deep', 1);
    expect(runLock(s, 0)).toBeNull();
    clearOpen(s, 0);
    expect(s.dig!.sites[0].done).toBe(true);
  });

  it('研究の目利き：研究 Lv の上限 3 → 4・5。上限のあいだも数は貯め、上限が上がった瞬間に Lv と RP が入る', () => {
    const s = met();
    const id = 1011;
    s.research[id] = 10;
    expect(researchCap(s)).toBe(3);
    expect(researchOf(s, id)).toBe(3);
    expect(researchLeft(s, id)).toBe(0);
    const e = noteEntries(s, 'c1').find((x) => x.id === id)!;
    expect(nextLvText(e)).toBe('上限（研究の目利きで上がる）');
    // 上限のあいだに掘ったぶんも数える（11 個 → 生の Lv5）
    lv(s, 'dig_deep', 1);
    run(s, 0);
    const L = digLayout('c1', 0)!;
    const k = L.cells.findIndex((c) => c.item?.kind === 'ext' && !c.item.topic && c.item.id === id);
    if (k >= 0) {
      const h = digTo(s, k % 7, Math.floor(k / 7));
      expect(h.lv).toBeUndefined();
      expect(s.research[id]).toBeGreaterThanOrEqual(11);
    } else s.research[id] = 11;
    endRun(s);
    const rp0 = s.rp;
    lv(s, 'dig_ext', 1);
    lv(s, 'dig_lamp', 1);
    expect(learn(s, 'dig_study')).toBeNull();
    expect(researchCap(s)).toBe(4);
    expect(researchOf(s, id)).toBe(4);
    expect(s.rp - rp0).toBeGreaterThanOrEqual(RP_GAIN.C.lv[2]);
    const rp1 = s.rp;
    expect(levelUp(s, 'dig_study')).toBeNull();
    expect(researchOf(s, id)).toBe(5);
    expect(s.rp - rp1).toBeGreaterThanOrEqual(RP_GAIN.C.lv[3]);
    // お題は上限に掛からない（その場で Lv5）
    const t = met();
    const topic = DIG_SITES.c1.topics[0];
    t.research[topic] = RESEARCH_NEED[4];
    expect(researchOf(t, topic)).toBe(5);
  });

  it('研究の目利き Lv3〜5：深い層ほど研究が進みやすい（層 n で 1 + 0.25 × (n − 1) × 倍率 1・1.5・2 個ぶん。端数は持ち越し）', () => {
    const want = { 3: 1, 4: 1.5, 5: 2 } as const;
    for (const [n, m] of Object.entries(want)) {
      const s = met();
      lv(s, 'dig_deep', 1);
      lv(s, 'dig_study', Number(n));
      run(s, 0);
      // 岩盤（3 層目）のエクステを 1 つ掘る：1 + 0.25 × 2 × m 個ぶん
      let k = -1;
      for (let site = 0; site < 4 && k < 0; site++) {
        const L = digLayout('c1', site)!;
        const i = L.cells.findIndex((c) => c.layer === 2 && c.item?.kind === 'ext' && !c.item.topic);
        if (i >= 0) {
          run(s, site);
          k = i;
        }
      }
      const L = digLayout('c1', s.dig!.cur)!;
      const id = (L.cells[k].item as { id: number }).id;
      for (let yy = 0; yy < Math.floor(k / 7); yy++) if (hpOf(s)[yy * 7 + (k % 7)] > 0) breakCell(s, k % 7, yy);
      const n0 = s.research[id] ?? 0;
      const c0 = s.resCarry?.[id] ?? 0;
      breakCell(s, k % 7, Math.floor(k / 7));
      const add = 1 + 0.25 * 2 * m + c0;
      expect((s.research[id] ?? 0) - n0, `Lv${n}`).toBe(Math.floor(add + 1e-9));
      expect(s.resCarry![id], `Lv${n}`).toBeCloseTo(add - Math.floor(add + 1e-9), 6);
    }
  });
});

describe('発破・ドリル', () => {
  it('発破：火薬代 2,000・1,500・1,000・1,000・1,000 G、大きさ 3・3・3・4・5（深い層の許可の無い層は崩さない）', () => {
    const want: [number, number][] = [
      [2000, 3],
      [1500, 3],
      [1000, 3],
      [1000, 4],
      [1000, 5],
    ];
    for (let n = 1; n <= 5; n++) {
      const s = met();
      lv(s, 'dig_power', 1);
      lv(s, 'dig_deep', 1);
      lv(s, 'dig_blast', n);
      expect([blastCost(s), blastSize(s)], `Lv${n}`).toEqual(want[n - 1]);
      run(s, 0);
      // 真ん中の列を掘って (3, 3) に手を届かせてから
      for (let y = 0; y < 3; y++) breakCell(s, 3, y);
      const m0 = s.money;
      const r = blast(s, 3, 3);
      if (typeof r === 'string') throw new Error(r);
      const N = want[n - 1][1];
      const lo = -Math.floor((N - 1) / 2);
      let cells = 0;
      for (let dy = lo; dy < lo + N; dy++) for (let dx = lo; dx < lo + N; dx++) if (!(dx === 0 && dy < 0)) cells++;
      expect(r.length, `Lv${n}`).toBe(cells);
      expect(m0 - s.money).toBe(want[n - 1][0]);
    }
    // 2 層目まで（岩盤に許可が無い）のときは、岩盤のマスは崩さない
    const s = met();
    lv(s, 'dig_power', 1);
    lv(s, 'dig_blast', 5);
    run(s, 0);
    const L = digLayout('c1', 0)!;
    const y = L.rows[2] - 1;
    for (let yy = 0; yy < y; yy++) breakCell(s, 3, yy);
    const r = blast(s, 3, y);
    if (typeof r === 'string') throw new Error(r);
    expect(r.every((h) => L.cells[h.y * 7 + h.x].layer < 2)).toBe(true);
  });

  it('掘削ドリル：押したマスから真下に 3・4・5・6・7 マス。燃料代 1,000 G。無ければ no-drill。許可の無い層で止まる', () => {
    for (let n = 1; n <= 5; n++) {
      const s = met();
      lv(s, 'dig_deep', 1);
      run(s, 0);
      expect(drill(s, 2, 0)).toBe('no-drill');
      lv(s, 'dig_drill', n);
      const m0 = s.money;
      const r = drill(s, 2, 0);
      if (typeof r === 'string') throw new Error(r);
      expect(r.map((h) => [h.x, h.y]), `Lv${n}`).toEqual(Array.from({ length: T.drill[n - 1] }, (_, k) => [2, k]));
      expect(m0 - s.money).toBe(T.drillFuel);
    }
    const s = met();
    lv(s, 'dig_drill', 5);
    run(s, 0);
    const L = digLayout('c1', 0)!;
    for (let y = 0; y < L.rows[2] - 3; y++) breakCell(s, 1, y);
    const r = drill(s, 1, L.rows[2] - 3);
    if (typeof r === 'string') throw new Error(r);
    expect(r).toHaveLength(3);
    s.money = 0;
    expect(drill(s, 4, 0)).toBe('money');
  });
});

describe('発掘隊：役所・手際・常駐（自動化）・段取り・交代制・素材', () => {
  /** n 人を雇って発掘隊に（上限を超えるぶんは crew-full） */
  const crew = (s: P1State, n: number) => {
    const out: (string | null)[] = [];
    for (let k = 0; k < n; k++) {
      if (k >= s.staff.length) {
        const pick = s.hirePool.find((h) => !s.staff.some((x) => x.hero === h))!;
        expect(hire(s, pick)).toBeNull();
      }
      out.push(assign(s, s.staff[k].hero, 'dig'));
    }
    return out;
  };

  it('発掘隊の役所：人数の上限 1 → 2・3・3・4・5。上限を超えては付けられない（crew-full）。古いセーブで超えていたら、そのまま', () => {
    const s = met();
    expect(crewCap(s)).toBe(1);
    expect(crew(s, 2)).toEqual([null, 'crew-full']);
    expect([1, 2, 3, 4, 5].map((n) => (lv(s, 'dig_office', n), crewCap(s)))).toEqual([2, 3, 3, 4, 5]);
    // 上限 5 で 3 人 → 役所を Lv1（上限 2）に戻しても、3 人のまま（新しくは付けられない）
    lv(s, 'dig_office', 5);
    s.staff.forEach((x) => x.task === 'dig' && assign(s, x.hero, null));
    expect(crew(s, 3)).toEqual([null, null, null]);
    lv(s, 'dig_office', 1);
    expect(s.staff.filter((x) => x.task === 'dig')).toHaveLength(3);
    expect(crew(s, 4)[3]).toBe('crew-full');
    // 担当の人をもう一度「発掘」にしても外れない
    expect(assign(s, 10001, 'dig')).toBeNull();
  });

  it('発掘隊の手際：1 日に打つ回数 +20%／Lv（作業のあいだ）', () => {
    const per = (n: number) => {
      const s = met();
      lv(s, 'dig_deep', 1);
      if (n) {
        lv(s, 'dig_ext', 1);
        lv(s, 'dig_office', 1);
        lv(s, 'dig_crew', n);
      }
      crew(s, 1);
      run(s, 0);
      const st = s.staff.find((x) => x.task === 'dig')!;
      let hits = 0;
      for (let d = 0; d < 20; d++) hits += autoDig(s, st).filter((h) => !h.splash).length;
      return hits;
    };
    const base = per(0);
    expect(base).toBeGreaterThan(10);
    for (const n of [1, 3, 5]) expect(per(n) / base, `Lv${n}`).toBeCloseTo(1 + 0.2 * n, 1);
  });

  it('常駐：無ければ作業していない日は掘らない（疲れない）。あれば許可のある荒れ地を作業中の 20%・40%・55%・70%・80% の速さで掘る（スタミナは減る）', () => {
    const dayHits = (n: number) => {
      const s = met();
      s.emblem = 9;
      s.flags.rings = ['U'];
      lv(s, 'dig_deep', 1);
      crew(s, 1);
      s.dig!.sites[0].permit = true;
      if (n) lv(s, 'u_dig_auto', n);
      const st = s.staff.find((x) => x.task === 'dig')!;
      st.stats.hp = 9999;
      st.stamina = 9999;
      const sta0 = st.stamina;
      let hits = 0;
      for (let d = 0; d < 40; d++) hits += (step(s).dug ?? []).filter((h) => !h.splash).length;
      return { hits, tired: st.stamina < sta0, s };
    };
    const none = dayHits(0);
    expect(none.hits).toBe(0);
    expect(none.tired).toBe(false);
    // 作業中の 1 日の数
    const inRun = (() => {
      const s = met();
      lv(s, 'dig_deep', 1);
      crew(s, 1);
      run(s, 0);
      const st = s.staff.find((x) => x.task === 'dig')!;
      let hits = 0;
      for (let d = 0; d < 40; d++) hits += autoDig(s, st).filter((h) => !h.splash).length;
      return hits;
    })();
    for (let n = 1; n <= 5; n++) {
      const r = dayHits(n);
      expect(r.tired, `Lv${n}`).toBe(true);
      expect(r.hits / inRun, `Lv${n}`).toBeCloseTo(T.auto[n - 1], 1);
      // 荒れ地の吹き出し・地図の作業員の元：常駐中 1 日 N 打
      expect(standing(r.s)?.site).toBe(0);
    }
  });

  it('常駐の段取り：常駐の速さ +10%／Lv。Lv1 はお題の気配のある所へ向かって掘る', () => {
    const s = met();
    s.emblem = 9;
    s.flags.rings = ['U'];
    lv(s, 'dig_deep', 1);
    crew(s, 1);
    lv(s, 'u_dig_auto', 1);
    const st = s.staff.find((x) => x.task === 'dig')!;
    const k = digLayouts('c1').findIndex((L) => L.topic != null);
    s.dig!.sites[k].permit = true;
    s.dig!.cur = k;
    const L = digLayout('c1', k)!;
    const tk = L.cells.findIndex((c) => c.item?.kind === 'ext' && !!c.item.topic);
    const tx = tk % 7;
    const plain = digNext(s, true)!;
    lv(s, 'u_dig_route', 1);
    const smart = digNext(s, true)!;
    expect(Math.abs(smart[0] - tx)).toBeLessThanOrEqual(Math.abs(plain[0] - tx));
    expect(smart[0]).toBe(tx);
    expect(standSite(s)).toBe(k);
    // 速さ：常駐の割合 ×（1 ＋ 10%／Lv）
    expect([1, 2, 3, 4, 5].map((n) => (lv(s, 'u_dig_route', n), autoRate(s)))).toEqual([1, 2, 3, 4, 5].map((n) => T.auto[0] * (1 + T.autoSpeed[n - 1])));
    expect(standing(s)?.perDay).toBeGreaterThan(0);
    void st;
  });

  it('常駐の段取り Lv3：研究 Lv の低いエクステのマスを先に・Lv5：研究 Lv の上限に達したエクステは避ける', () => {
    const s = met();
    lv(s, 'dig_deep', 1);
    // 北東の荒れ地（3）の 1 段目：素材・土・エクステ・土・エクステ・エクステ・エクステ
    const L = digLayout('c1', 3)!;
    s.dig!.sites[3].permit = true;
    s.dig!.cur = 3;
    // （お題は見つけ済みにしておく：Lv1 の「お題の気配へ向かう」は別のテスト）
    if (L.topic != null) s.dig!.topics.push(L.topic);
    const exts = [0, 1, 2, 3, 4, 5, 6].filter((x) => L.cells[x].item?.kind === 'ext' && !(L.cells[x].item as { topic?: boolean }).topic);
    expect(exts).toEqual([2, 4, 5, 6]);
    const idAt = (x: number) => (L.cells[x].item as { id: number }).id;
    // 段取りが無ければ、浅いマス → 左から
    expect(digNext(s, true)).toEqual([0, 0]);
    lv(s, 'u_dig_route', 3);
    expect(digNext(s, true)).toEqual([2, 0]);
    // x = 5 のエクステだけ研究 Lv が低い（ほかは上限まで）→ そこを先に
    for (const x of exts) if (idAt(x) !== idAt(5)) s.research[idAt(x)] = 11;
    expect(digNext(s, true)).toEqual([5, 0]);
    // Lv5：全部上限なら、エクステのマスを避ける
    s.research[idAt(5)] = 11;
    lv(s, 'u_dig_route', 5);
    const pick = digNext(s, true)!;
    expect(exts.includes(pick[0]) && pick[1] === 0).toBe(false);
    // 作業中（手伝い）は段取りに関係なく、いつもの選び方
    expect(digNext(s, false)).toEqual([0, 0]);
  });

  it('常駐の交代制：常駐で働く日のスタミナの減り −15%／Lv（作業中の日には効かない）', () => {
    const s = met();
    crew(s, 1);
    const st = s.staff.find((x) => x.task === 'dig')!;
    const base = drainOf(s, st);
    const got = [1, 2, 3, 4, 5].map((n) => (lv(s, 'u_dig_relay', n), drainOf(s, st) / base));
    got.forEach((v, i) => expect(v).toBeCloseTo(1 - 0.15 * (i + 1), 6));
    run(s, 0);
    expect(drainOf(s, st)).toBeCloseTo(base, 6);
  });

  it('素材の選り分け：崩したマスの素材 +20%／Lv（端数は持ち越し）', () => {
    for (const n of [0, 1, 3, 5]) {
      const s = met();
      lv(s, 'dig_deep', 1);
      if (n) lv(s, 'u_dig_mat', n);
      let got = 0;
      let base = 0;
      for (let k = 0; k < 4; k++) {
        run(s, k);
        const L = digLayout('c1', k)!;
        L.cells.forEach((c, i) => {
          if (c.item?.kind !== 'mat' || hpOf(s)[i] <= 0) return;
          const h = digTo(s, i % 7, Math.floor(i / 7));
          base += c.item.n;
          got += h.mat ?? 0;
        });
        endRun(s);
      }
      expect(base).toBeGreaterThan(20);
      expect(got / base, `Lv${n}`).toBeCloseTo(1 + 0.2 * n, 1);
    }
  });
});

describe('画面のための数字', () => {
  it('発掘終了の札の「次の強化のおすすめ」：いちばん安い発掘のパネルの次の Lv（「発掘の追加申請 Lv2（4,000 G）で 21 秒に」）', () => {
    const s = met();
    expect(digRec(s)?.text).toBe('発掘の追加申請 Lv1（2,000 G）で 18 秒に');
    lv(s, 'dig_ext', 1);
    lv(s, 'dig_lamp', 1);
    lv(s, 'dig_office', 1);
    lv(s, 'dig_power', 1);
    expect(digRec(s)).toMatchObject({ id: 'dig_ext', lv: 2, cost: 4000, text: '発掘の追加申請 Lv2（4,000 G）で 21 秒に' });
    // 深い層の許可が要るマスを押した作業のあとは、深い層の許可を先に
    expect(digRec(s, 'dig_deep')?.text).toBe('深い層の許可 Lv1（5,000 G）で 岩盤まで掘れる');
    // 出会いの前は出さない
    delete s.flags.digMeet;
    expect(digRec(s)).toBeNull();
  });

  it('マインちゃん：発掘の枝が雲から出たあと 1 回だけ（low）。発掘のパネルを 1 枚でも開けたら出さない', () => {
    const s = met();
    s.dig!.last = s.day;
    s.dig!.sites.forEach((x) => (x.permit = true));
    expect(digTips(s).some((x) => x.key === 'branch')).toBe(false);
    s.flags.digBranch = 'new';
    const tip = digTips(s).find((x) => x.key === 'branch')!;
    expect(tip).toMatchObject({ tier: 'low', text: BRANCH_TIP() });
    expect(tip.text).toContain('[[追加申請]]');
    lv(s, 'dig_ext', 1);
    expect(digTips(s).some((x) => x.key === 'branch')).toBe(false);
  });

  it('助言「N 秒だけ掘ってみよう」の秒数は作業時間に合わせる', () => {
    const s = met();
    s.dig!.sites[0].permit = true;
    s.day = 100;
    s.dig!.last = 0;
    lv(s, 'dig_ext', 2);
    expect(digTips(s).find((x) => x.key === 'idle')?.text).toContain('21 秒だけ掘ってみよう');
  });
});

describe('セーブ：版 3 → 4', () => {
  /** 版 3 のセーブ（工房に発掘の道具） */
  const v3 = (inv: Record<string, number>, edit?: (o: Record<string, unknown>) => void) => {
    const s = met(4);
    const o = JSON.parse(serializeP1(s));
    o.v = 3;
    o.skills = o.skills.filter((id: string) => !id.startsWith('dig_') && !id.startsWith('u_dig_'));
    delete o.resCapPaid;
    const ws = o.buildings.find((b: { id: string; owner: string }) => b.owner === 'me' && b.id === 'workshop');
    ws.inv = { ...(ws.inv ?? {}), ...inv };
    edit?.(o);
    return deserializeP1(JSON.stringify(o))!;
  };

  it('ツルハシの新調 1 段 → ツルハシの鍛え直し Lv1、2 段 → Lv3／ランタン → 発掘のランタン Lv1／発破の道具 → 発破 Lv1（払ったお金は戻さない）。設備投資からは外す', () => {
    const a = v3({ pick: 1 });
    expect(a.v).toBe(4);
    expect(lvOf(a, 'dig_power')).toBe(1);
    expect(digPower(a)).toBe(2);
    const b = v3({ pick: 2, lantern: 1, blast: 1, tools: 2 });
    expect([lvOf(b, 'dig_power'), lvOf(b, 'dig_lamp'), lvOf(b, 'dig_blast')]).toEqual([3, 1, 1]);
    expect(digPower(b)).toBe(3);
    const ws = b.buildings.find((x) => x.owner === 'me' && x.id === 'workshop')!;
    expect(ws.inv).toEqual({ tools: 2 });
    // 資金は変わらない
    const plain = v3({});
    expect(b.money).toBe(plain.money);
    expect(lvOf(plain, 'dig_power')).toBe(0);
  });

  it('ほかのセクタの写しの工房の道具も渡す（いちばん進んだ段）', () => {
    const s = v3({}, (o) => {
      o.land = { cur: 'c1', mine: ['c1', 'c2'], recs: { c2: { id: 'c2', invest: 0, capital: 0, log: [], snap: { buildings: [{ uid: 99, id: 'workshop', owner: 'me', i: 1, j: 1, left: 0, inv: { pick: 2, lantern: 1 } }] } } } };
    });
    expect([lvOf(s, 'dig_power'), lvOf(s, 'dig_lamp')]).toEqual([3, 1]);
    const snapWs = ((s.land!.recs.c2.snap as { buildings: { inv: Record<string, number> }[] }).buildings[0]).inv;
    expect(snapWs).toEqual({});
  });

  it('研究 Lv・掘れる層は下がらない：版 3 で研究 Lv5 にしていたエクステは Lv5 のまま、岩盤まで掘っていた荒れ地は岩盤まで掘れる', () => {
    const s = v3({}, (o) => {
      (o.research as Record<number, number>)[1011] = 11;
      const d = o.dig as { sites: { hp: number[] }[] };
      const L = digLayout('c1', 0)!;
      d.sites[0].hp[L.rows[2] * 7] = 0;
    });
    expect(researchOf(s, 1011)).toBe(5);
    expect(researchCap(s)).toBe(5);
    expect(deepLayers(s, 'C')).toBe(3);
    // 新しいゲームは上限 3・2 層目まで
    const n = met();
    expect([researchCap(n), deepLayers(n, 'C')]).toEqual([3, 2]);
    // 版 4 を読み直しても変わらない
    const back = deserializeP1(serializeP1(s))!;
    expect([back.v, researchCap(back), deepLayers(back, 'C'), lvOf(back, 'dig_power')]).toEqual([4, 5, 3, 0]);
  });
});
