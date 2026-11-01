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
  peekAhead,
  peekView,
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
const depthOf = (s: P1State) => s.dig!.sites[s.dig!.cur].depth;
/** いまの層が 1 枚はがれるまで打つ */
function breakCell(s: P1State, x: number, y: number): DigHit {
  for (let k = 0; k < 40; k++) {
    const r = dig(s, x, y);
    if (typeof r === 'string') throw new Error(`${x},${y}: ${r}`);
    if (r.broke) return r;
  }
  throw new Error('not broken');
}
/** (x, y) を手前から掘り進めて、層 layer をはがす */
function digTo(s: P1State, x: number, y: number, layer: number): DigHit {
  for (;;) {
    const r = breakCell(s, x, y);
    if (r.layer >= layer) return r;
  }
}
/** 荒れ地 k の、いまの許可で掘れる層をぜんぶはがす（はがれた結果を返す） */
function clearOpen(s: P1State, k = 0): DigHit[] {
  run(s, k);
  const L = digLayout(s.dig!.sector, k)!;
  const n = deepLayers(s, L.tier);
  const out: DigHit[] = [];
  for (let i = 0; i < L.w * L.h; i++) while (depthOf(s)[i] < Math.min(n, L.depth)) out.push(breakCell(s, i % 7, Math.floor(i / 7)));
  return out;
}
const lv = (s: P1State, id: string, n: number) => setLevel(s, id, n);

describe('データ：9 本目の枝「発掘」', () => {
  it('BRANCHES に dig。パネルは Common 11 枚・Uncommon 外周 6 枚、すべてお金パネル（Lv1〜5・levelCost）。値段は C 2,000〜12,000・U 20,000〜80,000', () => {
    expect(BRANCHES.at(-1)).toEqual({ key: 'dig', name: '発掘' });
    // 無限の強化パネル・研究への寄付（6 段目）は別（tests/island-p1-dig2f.test.ts）
    const ks = SKILLS.filter((k) => k.branch === 'dig' && !k.inf && !k.donate);
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
        // 会心の 1 打は強さ 4（2 × 2）：Common の壁（硬さ 3 まで）はかならず 1 枚はがれる
        expect(r.broke).toBe(true);
      } else expect(r.broke ? 0 : before - r.left).toBe(r.broke ? 0 : Math.min(before, 2));
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

  it('広く掘る：打ったマスの隣の いまの層 にも力の一部（Lv1 左右 25%・Lv3 左右と下 45%・Lv5 上下左右 60%）。はがれたら中身も出る', () => {
    const s = met();
    lv(s, 'dig_deep', 1);
    run(s, 0);
    const hard0 = (x: number, y: number) => digLayout('c1', 0)!.cells[y * 7 + x].hard[0];
    lv(s, 'dig_reach', 1);
    const r = dig(s, 3, 0);
    if (typeof r === 'string') throw new Error(r);
    expect(r.extra?.map((h) => [h.x, h.y])).toEqual([
      [2, 0],
      [4, 0],
    ]);
    expect(hpOf(s)[2]).toBeCloseTo(Math.max(0, hard0(2, 0) - 0.25), 5);
    // Lv3：左右と下
    lv(s, 'dig_reach', 3);
    const r3 = dig(s, 0, 4);
    if (typeof r3 === 'string') throw new Error(r3);
    expect(r3.extra?.map((h) => [h.x, h.y]).sort()).toEqual([
      [0, 5],
      [1, 4],
    ]);
    // Lv5：上下左右に 60%（打ったマスの強さ 1 × 0.6）
    lv(s, 'dig_reach', 5);
    expect(fxSum(s, 'dig.reach')).toBe(0.6);
    const hp0 = hpOf(s)[6 * 7 + 6];
    dig(s, 6, 5);
    expect(hpOf(s)[6 * 7 + 6]).toBeLessThan(hp0);
    // 隣の力ではがれたマスからも中身が出る：1 打の強さ 4（ツルハシ Lv5）× 25% ＝ 硬さ 1 の隣のマスがはがれる
    const t = met(3);
    lv(t, 'dig_deep', 1);
    lv(t, 'dig_power', 5);
    lv(t, 'dig_reach', 1);
    run(t, 0);
    const L = digLayout('c1', 0)!;
    const f = L.finds.find((g) => g.layer === 0 && g.item.kind === 'ext' && !g.item.topic && g.x < 6)!;
    expect(L.cells[f.y * 7 + f.x].hard[0]).toBe(1);
    const r2 = dig(t, f.x + 1, f.y);
    if (typeof r2 === 'string') throw new Error(r2);
    const got = r2.extra?.find((h) => h.x === f.x && h.y === f.y);
    expect(got).toMatchObject({ broke: true, splash: true });
    expect(got?.item).toEqual(f.item);
    expect(got!.first).toBe(true);
  });
});

describe('見える深さ・掘れる層・研究', () => {
  it('発掘のランタン：ひびの隙間から見え始める深さ ふだん いまの層だけ → Lv1・2・3 で 1・2・3 枚手前（Lv4・5 の遠くの気配はダンジョンの深さ用）', () => {
    const s = met();
    lv(s, 'dig_deep', 1);
    run(s, 0);
    expect(peekAhead(s)).toBe(0);
    expect([1, 2, 3, 4, 5].map((n) => (lv(s, 'dig_lamp', n), peekAhead(s)))).toEqual([1, 2, 3, 3, 3]);
    // 層 2 に埋まっていて、手前の層には何も無いマス：ふだんは見えない（2 枚手前）。Lv2 で見える
    const L = digLayout('c1', 0)!;
    const only = (layer: number, Lk = L) => Lk.finds.find((g) => g.layer === layer && !Lk.finds.some((h) => h.x === g.x && h.y === g.y && h.layer < layer))!;
    const f = only(2);
    const s0 = met();
    lv(s0, 'dig_deep', 1);
    run(s0, 0);
    expect(peek(s0, f.x, f.y)).toBeNull();
    lv(s, 'dig_lamp', 1);
    expect(peek(s, f.x, f.y)).toBeNull();
    lv(s, 'dig_lamp', 2);
    expect(peek(s, f.x, f.y)).toEqual(f.item);
    expect(peekView(s, f.x, f.y)).toMatchObject({ ahead: 2, frac: 0.15 });
    // Uncommon（4 層）：層 3 のものは Lv3（3 枚手前）から
    const u = met(1, 'u1', 'U');
    lv(u, 'dig_deep', 3);
    run(u, 0);
    const Lu = digLayout('u1', 0)!;
    const g = only(3, Lu);
    lv(u, 'dig_lamp', 2);
    expect(peek(u, g.x, g.y)).toBeNull();
    lv(u, 'dig_lamp', 3);
    expect(peek(u, g.x, g.y)).toEqual(g.item);
  });

  it('深い層の許可：はじめは 2 層目まで（岩盤は「深い層の許可が要る」）。Common は Lv1 で岩盤、Uncommon は Lv2 で 3 層目・Lv3 で 4 層目', () => {
    const s = met();
    expect(deepLayers(s, 'C')).toBe(2);
    run(s, 0);
    // 2 枚はがすと、3 層目（岩盤）は叩けない
    digTo(s, 0, 0, 1);
    expect(depthOf(s)[0]).toBe(2);
    expect(digCheck(s, 0, 0)).toBe('deep');
    expect(dig(s, 0, 0)).toBe('deep');
    expect(cellView(s, 0, 0).state).toBe('locked');
    expect(lockedLayer(s)).toBe(2);
    expect(digSpec(s)).toEqual({ sec: 15, power: 1, deep: '粘土層', cap: 3 });
    lv(s, 'dig_deep', 1);
    expect(deepLayers(s, 'C')).toBe(3);
    expect(digCheck(s, 0, 0)).toBeNull();
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
    const f = L.finds.find((g) => g.item.kind === 'ext' && !g.item.topic && g.item.id === id);
    if (f) {
      const h = digTo(s, f.x, f.y, f.layer);
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
      const L = digLayout('c1', 0)!;
      const f = L.finds.find((g) => g.layer === 2 && g.item.kind === 'ext' && !g.item.topic)!;
      const id = (f.item as { id: number }).id;
      digTo(s, f.x, f.y, 1);
      const n0 = s.research[id] ?? 0;
      const c0 = s.resCarry?.[id] ?? 0;
      breakCell(s, f.x, f.y);
      const add = 1 + 0.25 * 2 * m + c0;
      expect((s.research[id] ?? 0) - n0, `Lv${n}`).toBe(Math.floor(add + 1e-9));
      expect(s.resCarry![id], `Lv${n}`).toBeCloseTo(add - Math.floor(add + 1e-9), 6);
    }
  });
});

describe('発破・ドリル', () => {
  it('発破：火薬代 2,000・1,500・1,000・1,000・1,000 G、大きさ 3・3・3・4・5。いまの層を 1 枚ずつ（硬さに関係なく。深い層の許可の無い層ははがさない）', () => {
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
      // (3, 3) の 2 枚目（粘土層）まで掘っておく：そのマスは 1 枚奥、まわりは手前の 1 枚
      breakCell(s, 3, 3);
      const m0 = s.money;
      const r = blast(s, 3, 3);
      if (typeof r === 'string') throw new Error(r);
      const N = want[n - 1][1];
      expect(r.length, `Lv${n}`).toBe(N * N);
      expect(r.every((h) => h.broke)).toBe(true);
      expect(r.find((h) => h.x === 3 && h.y === 3)?.layer).toBe(1);
      expect(r.filter((h) => !(h.x === 3 && h.y === 3)).every((h) => h.layer === 0)).toBe(true);
      expect(m0 - s.money).toBe(want[n - 1][0]);
    }
    // 2 層目まで（岩盤に許可が無い）のときは、岩盤の層ははがさない（真ん中が岩盤でも、まわりは はがれる）
    const s = met();
    lv(s, 'dig_power', 1);
    lv(s, 'dig_blast', 5);
    run(s, 0);
    digTo(s, 3, 3, 1);
    expect(digCheck(s, 3, 3)).toBe('deep');
    const r = blast(s, 3, 3);
    if (typeof r === 'string') throw new Error(r);
    expect(r.some((h) => h.x === 3 && h.y === 3)).toBe(false);
    expect(r.every((h) => h.layer < 2)).toBe(true);
    expect(r).toHaveLength(24);
  });

  it('掘削ドリル：押したマス 1 つを奥へ 3・4・5・6・7 層。燃料代 1,000 G。無ければ no-drill。許可の無い層で止まる', () => {
    for (let n = 1; n <= 5; n++) {
      const u = met(1, 'u1', 'U');
      lv(u, 'dig_deep', 3);
      run(u, 0);
      expect(drill(u, 2, 0)).toBe('no-drill');
      lv(u, 'dig_drill', n);
      const m0 = u.money;
      const r = drill(u, 2, 0);
      if (typeof r === 'string') throw new Error(r);
      // Uncommon の壁は 4 層：Lv1 は 3 層、Lv2 から 4 層（いちばん奥まで）
      const want = Math.min(4, T.drill[n - 1]);
      expect(r.map((h) => [h.x, h.y, h.layer]), `Lv${n}`).toEqual(Array.from({ length: want }, (_, k) => [2, 0, k]));
      expect(depthOf(u)[2]).toBe(want);
      expect(m0 - u.money).toBe(T.drillFuel);
    }
    // 2 層目まで（深い層の許可が無い）：2 層で止まる
    const s = met();
    lv(s, 'dig_drill', 5);
    run(s, 0);
    const r = drill(s, 1, 0);
    if (typeof r === 'string') throw new Error(r);
    expect(r).toHaveLength(2);
    expect(digCheck(s, 1, 0)).toBe('deep');
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
    const tf = L.finds.find((g) => g.item.kind === 'ext' && !!g.item.topic)!;
    const plain = digNext(s, true)!;
    expect(plain).toEqual([0, 0]);
    lv(s, 'u_dig_route', 1);
    // お題の範囲のマスを、お題の層まで先に
    expect(digNext(s, true)).toEqual([tf.x, tf.y]);
    expect(standSite(s)).toBe(k);
    // 速さ：常駐の割合 ×（1 ＋ 10%／Lv）
    expect([1, 2, 3, 4, 5].map((n) => (lv(s, 'u_dig_route', n), autoRate(s)))).toEqual([1, 2, 3, 4, 5].map((n) => T.auto[0] * (1 + T.autoSpeed[n - 1])));
    expect(standing(s)?.perDay).toBeGreaterThan(0);
    void st;
  });

  it('常駐の段取り Lv3：いまの層に研究 Lv の低いエクステがあるマスを先に・Lv5：研究 Lv の上限に達したエクステは避ける', () => {
    const s = met();
    lv(s, 'dig_deep', 1);
    const L = digLayout('c1', 3)!;
    s.dig!.sites[3].permit = true;
    s.dig!.cur = 3;
    // （お題は見つけ済みにしておく：Lv1 の「お題の気配へ向かう」は別のテスト）
    if (L.topic != null) s.dig!.topics.push(L.topic);
    // 手前の層（0）のエクステのマス（左上から）
    const exts = L.finds.filter((g) => g.layer === 0 && g.item.kind === 'ext' && !g.item.topic).map((g) => g.y * 7 + g.x).sort((a, b) => a - b);
    expect(exts.length).toBeGreaterThanOrEqual(3);
    const idAt = (k: number) => (L.finds.find((g) => g.layer === 0 && g.y * 7 + g.x === k)!.item as { id: number }).id;
    const xy = (k: number) => [k % 7, Math.floor(k / 7)];
    // 段取りが無ければ、浅いマス → 左上から
    expect(digNext(s, true)).toEqual([0, 0]);
    lv(s, 'u_dig_route', 3);
    expect(digNext(s, true)).toEqual(xy(exts[0]));
    // ひとつのエクステだけ研究 Lv が低い（ほかは上限まで）→ そこを先に
    const low = idAt(exts[exts.length - 1]);
    for (const k of exts) if (idAt(k) !== low) s.research[idAt(k)] = 11;
    expect(digNext(s, true)).toEqual(xy(exts.find((k) => idAt(k) === low)!));
    // Lv5：全部上限なら、エクステのマスを避ける
    s.research[low] = 11;
    lv(s, 'u_dig_route', 5);
    const pick = digNext(s, true)!;
    expect(exts.includes(pick[1] * 7 + pick[0])).toBe(false);
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

  it('素材の選り分け：掘り出した素材 +20%／Lv（端数は持ち越し）', () => {
    for (const n of [0, 1, 3, 5]) {
      const s = met();
      lv(s, 'dig_deep', 1);
      if (n) lv(s, 'u_dig_mat', n);
      let got = 0;
      let base = 0;
      for (let k = 0; k < 4; k++) {
        for (const h of clearOpen(s, k)) {
          if (h.item?.kind !== 'mat') continue;
          base += h.item.n;
          got += h.mat ?? 0;
        }
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
    expect(a.v).toBe(8);
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
      // 版 3 の断面（横 7 × 縦 20・上から掘る形。岩盤は 14 行目から）で、岩盤のマスを崩していた
      const d = o.dig as { sites: { hp: number[]; depth?: number[] }[] };
      d.sites = d.sites.map((x) => ({ ...x, depth: undefined, hp: new Array(140).fill(1) }));
      d.sites[0].hp[14 * 7] = 0;
    });
    expect(researchOf(s, 1011)).toBe(5);
    expect(researchCap(s)).toBe(5);
    expect(deepLayers(s, 'C')).toBe(3);
    // 新しいゲームは上限 3・2 層目まで
    const n = met();
    expect([researchCap(n), deepLayers(n, 'C')]).toEqual([3, 2]);
    // 版 4 を読み直しても変わらない
    const back = deserializeP1(serializeP1(s))!;
    expect([back.v, researchCap(back), deepLayers(back, 'C'), lvOf(back, 'dig_power')]).toEqual([8, 5, 3, 0]);
  });
});
