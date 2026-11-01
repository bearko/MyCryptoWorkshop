/**
 * 発掘画面の作り直し（v11）：正面の壁を手前から奥へ（docs/ISLAND_PHASE1.md「地層の発掘と研究ポイント」の「発掘場」「発掘場の画面」）。
 * どのマスも叩ける・奥ほど硬い・1 打で 1 枚まで・1 × 1 と 2 × 2（Epic 以上）の取れる条件・取れたらまとめて次の層・掘れる層の上限・
 * 範囲・発破（1 枚ずつ）・ドリル（奥へ N 層）・覗き見の段階（純粋な関数）・発掘隊の打つマスの選び方・掘りきり・版 4 → 5 の引き継ぎ・
 * 復刻品のレシピが研究 Lv3 でいまどおり開く。
 */
import { describe, expect, it } from 'vitest';
import { allSeries } from '../src/game/catalog';
import { DIG, DIG_BALANCE, DIG_SITES, RESEARCH_NEED, relicKey } from '../src/island/p1/data';
import { moveTo } from '../src/island/p1/land';
import {
  allowedDirs,
  blast,
  build,
  crackOf,
  deserializeP1,
  dig,
  digCheck,
  digLayout,
  digLayouts,
  digNext,
  drill,
  endRun,
  findCells,
  findOf,
  findSize,
  newP1,
  openGate,
  peekFrac,
  peekView,
  placeFind,
  serializeP1,
  setLevel,
  siteDiggable,
  siteProgress,
  startRun,
  type DigHit,
  type P1State,
} from '../src/island/p1/model';

const lot = (s: P1State, id: string): [number, number, 'rd' | 'ld' | 'lu' | 'ru'] => {
  for (let j = 0; j < s.n; j++) for (let i = 0; i < s.n; i++) { const d = allowedDirs(s, id, i, j); if (d.length) return [i, j, d[0]]; }
  throw new Error('no lot');
};
function game(sector = 'c1', tier: 'C' | 'U' = 'C', deep = 3): P1State {
  const s = newP1(1, tier, sector);
  s.money = 1e7;
  s.tut = 99;
  s.flags.digMeet = 'done';
  const b = build(s, 'workshop', ...lot(s, 'workshop'));
  if (typeof b === 'string') throw new Error(b);
  b.left = 0;
  if (deep) setLevel(s, 'dig_deep', deep);
  return s;
}
function run(s: P1State, k = 0): P1State {
  s.dig!.sites[k].permit = true;
  if (s.digRun) endRun(s);
  const r = startRun(s, k);
  if (typeof r === 'string') throw new Error(r);
  return s;
}
const st = (s: P1State) => s.dig!.sites[s.dig!.cur];
/** いまの層が 1 枚はがれるまで（または 2 × 2 を待つまで）打つ */
function peelOnce(s: P1State, x: number, y: number): DigHit {
  for (let k = 0; k < 20; k++) {
    const r = dig(s, x, y);
    if (typeof r === 'string') throw new Error(`${x},${y}: ${r}`);
    if (r.broke || r.wait) return r;
  }
  throw new Error('not peeled');
}
/** Epic のエクステ（2 × 2 になる。いまの荒れ地には出ないので、テストで壁に埋める） */
const EPIC = allSeries.flatMap((x) => x.items).find((e) => e.rarity === 'Epic')!.id;
const LEG = allSeries.flatMap((x) => x.items).find((e) => e.rarity === 'Legendary')!.id;

describe('正面の壁：手前から 1 枚ずつ', () => {
  it('どのマスも最初から叩ける。1 打で いまの層の硬さを 1 打の強さぶん減らし、0 で 1 枚はがれて次の層へ。余った力は奥に届かない', () => {
    const s = run(game());
    const L = digLayout('c1', 0)!;
    for (let k = 0; k < L.w * L.h; k++) expect(digCheck(s, k % 7, Math.floor(k / 7))).toBeNull();
    setLevel(s, 'dig_power', 5);
    // 1 打の強さ 4：硬さ 1 の表土に打っても、はがれるのは 1 枚だけ
    const r = dig(s, 5, 7);
    if (typeof r === 'string') throw new Error(r);
    expect([r.layer, r.broke, r.depth, r.left]).toEqual([0, true, 1, L.cells[7 * 7 + 5].hard[1]]);
    expect(st(s).depth[7 * 7 + 5]).toBe(1);
  });

  it('奥の層ほど硬い（Common：表土 1・粘土層 1〜2・岩盤 2〜3／Uncommon：2〜3・3・3〜4・4〜5。v13）。面の色も奥ほど暗い', () => {
    expect(DIG_BALANCE.hard).toEqual({ C: [[1, 1], [1, 2], [2, 3]], U: [[2, 3], [3, 3], [3, 4], [4, 5]] });
    for (const t of ['C', 'U'] as const) {
      const lum = (hex: string) => [1, 3, 5].reduce((a, i) => a + parseInt(hex.slice(i, i + 2), 16), 0);
      const ls = DIG[t].layers;
      for (let n = 1; n < ls.length; n++) {
        const avg = (k: number) => (ls[k].hard[0] + ls[k].hard[1]) / 2;
        expect(ls[n].hard[0], `${t} ${n}`).toBeGreaterThanOrEqual(ls[n - 1].hard[0]);
        expect(avg(n), `${t} ${n}`).toBeGreaterThan(avg(n - 1));
        expect(lum(ls[n].color), `${t} ${n}`).toBeLessThan(lum(ls[n - 1].color));
      }
    }
  });

  it('掘れる層の上限（深い層の許可）：上限の層は叩けない（deep）。上限まで掘りきったら作業を始められない', () => {
    const s = run(game('c1', 'C', 0));
    for (let n = 0; n < 2; n++) peelOnce(s, 0, 0);
    expect(digCheck(s, 0, 0)).toBe('deep');
    expect(dig(s, 0, 0)).toBe('deep');
    // ほかのマスは叩ける
    expect(digCheck(s, 1, 0)).toBeNull();
    expect(siteDiggable(s, 0)).toBe(true);
    // 全部のマスを 2 枚まで → 掘れるマスが無い
    for (let k = 1; k < 63; k++) while (st(s).depth[k] < 2) peelOnce(s, k % 7, Math.floor(k / 7));
    expect(siteDiggable(s, 0)).toBe(false);
    expect(st(s).done).toBe(false);
    expect(siteProgress(s, 0)).toBeCloseTo(2 / 3, 6);
  });

  it('掘りきり：全部のマスをいちばん奥まではがしたとき（done）。最後の 1 打に done', () => {
    const s = run(game(), 2);
    let last: DigHit | null = null;
    for (let k = 0; k < 63; k++) while (st(s).depth[k] < 3) last = peelOnce(s, k % 7, Math.floor(k / 7));
    expect(last?.done).toBe(true);
    expect(st(s).done).toBe(true);
    expect(siteProgress(s, 2)).toBe(1);
    expect(digCheck(s, 0, 0)).toBe('dug');
  });
});

describe('埋まっているもの：1 × 1 と 2 × 2', () => {
  it('Epic・Legendary のエクステは 2 × 2、ほか（Common〜Rare・素材・石板）は 1 × 1。いまの荒れ地は全部 1 × 1', () => {
    expect(findSize({ kind: 'ext', id: EPIC })).toEqual([2, 2]);
    expect(findSize({ kind: 'ext', id: LEG })).toEqual([2, 2]);
    expect(findSize({ kind: 'ext', id: 1011 })).toEqual([1, 1]);
    expect(findSize({ kind: 'ext', id: 2019 })).toEqual([1, 1]);
    expect(findSize({ kind: 'mat', mat: 'iron', n: 3 })).toEqual([1, 1]);
    expect(findSize({ kind: 'tablet', id: 'tab_c1' })).toEqual([1, 1]);
    for (const id of Object.keys(DIG_SITES)) for (const L of digLayouts(id)) expect(L.finds.every((f) => f.size[0] === 1 && f.size[1] === 1)).toBe(true);
  });

  it('1 × 1：そのものの層を叩いて 0 にした 1 打で取れる（手前の層を全部はがしてから）', () => {
    const s = run(game());
    const L = digLayout('c1', 0)!;
    const f = L.finds.find((g) => g.layer === 2 && g.item.kind === 'ext')!;
    // 手前の 2 枚（表土・粘土層）をはがしても、まだ取れない
    expect(peelOnce(s, f.x, f.y).layer).toBe(0);
    expect(peelOnce(s, f.x, f.y).layer).toBe(1);
    expect(s.research[(f.item as { id: number }).id] ?? 0).toBeLessThanOrEqual(2);
    const r = peelOnce(s, f.x, f.y);
    expect(r.layer).toBe(2);
    expect(r.item).toEqual(f.item);
  });

  it('2 × 2：4 マスとも そのものの層まではがして 0 にしたときに取れる。それまでは待つ（wait）。取れたら 4 マスまとめて次の層へ', () => {
    const s = run(game('c5'), 1);
    const L = digLayout('c5', 1)!;
    const f = placeFind(L, { kind: 'ext', id: EPIC }, 2, 3, 1)!;
    expect(f.size).toEqual([2, 2]);
    const cells = findCells(L, f);
    expect(cells).toEqual([3 * 7 + 2, 3 * 7 + 3, 4 * 7 + 2, 4 * 7 + 3]);
    // 4 マスの層 1 に同じものが入っている（ほかのものは取り除いた）
    for (const k of cells) expect(findOf(s, k % 7, Math.floor(k / 7), 1)).toBe(f);
    for (const k of cells) peelOnce(s, k % 7, Math.floor(k / 7));
    const xy = cells.map((k) => [k % 7, Math.floor(k / 7)] as const);
    // 3 マスは、層 1 を 0 にしても待つ（取れない・次の層へ進まない）
    for (const [x, y] of xy.slice(0, 3)) {
      const r = peelOnce(s, x, y);
      expect([r.wait, r.broke, r.item, r.depth]).toEqual([true, false, null, 1]);
      expect(digCheck(s, x, y)).toBe('wait');
    }
    const rp0 = s.rp;
    const last = peelOnce(s, xy[3][0], xy[3][1]);
    expect(last.broke).toBe(true);
    expect(last.item).toEqual({ kind: 'ext', id: EPIC });
    expect(last.span).toEqual({ x: 2, y: 3, w: 2, h: 2 });
    expect(last.first).toBe(true);
    expect(s.rp).toBeGreaterThan(rp0);
    for (const k of cells) expect([st(s).depth[k], st(s).hp[k]]).toEqual([2, L.cells[k].hard[2]]);
    // はがした層は 4 マスぶん
    expect(s.digRun!.got.cells).toBe(4 + 4);
  });

  it('2 × 2 の範囲のうち 1 マスでも手前に残っていたら取れない（4 マスとも）', () => {
    const s = run(game('c5'), 2);
    const L = digLayout('c5', 2)!;
    placeFind(L, { kind: 'ext', id: EPIC }, 0, 0, 0);
    expect(peelOnce(s, 0, 0).wait).toBe(true);
    expect(peelOnce(s, 1, 0).wait).toBe(true);
    expect(peelOnce(s, 0, 1).wait).toBe(true);
    expect(st(s).depth.slice(0, 2)).toEqual([0, 0]);
    expect(peelOnce(s, 1, 1).item).toEqual({ kind: 'ext', id: EPIC });
  });
});

describe('スキルの効き目（壁）', () => {
  it('範囲（広く掘る）：隣のマスの いまの層 に力の一部。待っているマス・掘れない層には届かない', () => {
    const s = run(game());
    peelOnce(s, 3, 3);
    setLevel(s, 'dig_reach', 5);
    const hp0 = st(s).hp[3 * 7 + 4];
    const r = dig(s, 3, 3);
    if (typeof r === 'string') throw new Error(r);
    expect(r.extra?.map((h) => [h.x, h.y, h.layer]).sort()).toEqual([
      [2, 3, 0],
      [3, 2, 0],
      [3, 4, 0],
      [4, 3, 0],
    ]);
    expect(st(s).hp[3 * 7 + 4]).toBeLessThan(hp0);
  });

  it('発破：押したマスを真ん中に 3 × 3 の いまの層を 1 枚ずつ（硬さに関係なく）。深さの違うマスもそれぞれ 1 枚', () => {
    const s = run(game());
    setLevel(s, 'dig_blast', 1);
    peelOnce(s, 4, 4);
    peelOnce(s, 4, 4);
    const before = [...st(s).depth];
    const r = blast(s, 4, 4);
    if (typeof r === 'string') throw new Error(r);
    expect(r).toHaveLength(9);
    for (const h of r) expect(st(s).depth[h.y * 7 + h.x]).toBe(before[h.y * 7 + h.x] + 1);
    // 岩盤（硬さ 2〜3）も 1 回の発破で 1 枚
    expect(r.find((h) => h.x === 4 && h.y === 4)).toMatchObject({ layer: 2, broke: true, depth: 3 });
    // 真ん中が掘りきったマスでも、まわりがはがせれば使える
    const r2 = blast(s, 4, 4);
    if (typeof r2 === 'string') throw new Error(r2);
    expect(r2).toHaveLength(8);
  });

  it('ドリル：押したマス 1 つを奥へ N 層（Lv1 は 3 層）。2 × 2 のものを待つところで止まる', () => {
    const s = run(game('c5'), 3);
    setLevel(s, 'dig_drill', 1);
    const r = drill(s, 6, 8);
    if (typeof r === 'string') throw new Error(r);
    expect(r.map((h) => h.layer)).toEqual([0, 1, 2]);
    expect(st(s).depth[8 * 7 + 6]).toBe(3);
    const L = digLayout('c5', 3)!;
    placeFind(L, { kind: 'ext', id: EPIC }, 0, 0, 1);
    const r2 = drill(s, 0, 0);
    if (typeof r2 === 'string') throw new Error(r2);
    expect(r2.map((h) => [h.layer, h.broke, !!h.wait])).toEqual([
      [0, true, false],
      [1, false, true],
    ]);
    expect(st(s).depth[0]).toBe(1);
  });

  it('発掘隊の打つマス：取りかけのもの（2 × 2）の範囲 → 打ちかけ → 浅いマス → 左上から。待っているマス・掘れない層は打たない', () => {
    const s = run(game('c5', 'C', 0));
    expect(digNext(s)).toEqual([0, 0]);
    // 左上を 2 枚（上限）まで → 次の (1, 0)
    peelOnce(s, 0, 0);
    expect(digNext(s)).toEqual([1, 0]);
    peelOnce(s, 0, 0);
    expect(digNext(s)).toEqual([1, 0]);
    // 打ちかけのマスを先に
    const L = digLayout('c5', 0)!;
    const k = L.cells.findIndex((c, i) => i > 20 && c.hard[0] >= 1);
    st(s).hp[k] = 0.5;
    expect(digNext(s)).toEqual([k % 7, Math.floor(k / 7)]);
    st(s).hp[k] = L.cells[k].hard[0];
    // 取りかけの 2 × 2：1 マスを 0 にして待っている → 範囲のほかのマスを先に
    placeFind(L, { kind: 'ext', id: EPIC }, 4, 5, 0);
    expect(peelOnce(s, 4, 5).wait).toBe(true);
    const nx = digNext(s)!;
    expect(findCells(L, { x: 4, y: 5, size: [2, 2] })).toContain(nx[1] * 7 + nx[0]);
    expect(nx).not.toEqual([4, 5]);
  });
});

describe('覗き見（ひびの隙間から見える）', () => {
  it('見える割合（純粋な関数）：そのものの層の無傷は 12%（細いひび 1 本）→ 叩くほど 40% → 90%（残り 1 打）。待っているマスは 95%。1 枚以上手前（ランタン）はうっすら 20・15・10%', () => {
    // 硬さ 3・強さ 1：無傷 12%・残り 2 → 40%・残り 1 → 90%
    expect([3, 2, 1].map((l) => peekFrac(0, l, 3, 1))).toEqual([0.12, 0.4, 0.9]);
    // 硬さ 4：40 → 65 → 90%
    expect([4, 3, 2, 1].map((l) => peekFrac(0, l, 4, 1))).toEqual([0.12, 0.4, 0.65, 0.9]);
    // 硬さ 2：1 打したら残り 1 打 → 90%。1 打ではがれる層は 12% のまま
    expect([2, 1].map((l) => peekFrac(0, l, 2, 1))).toEqual([0.12, 0.9]);
    expect(peekFrac(0, 1, 1, 1)).toBe(0.12);
    // 2 × 2 を待っている（0）
    expect(peekFrac(0, 0, 3, 1)).toBe(0.95);
    expect([1, 2, 3].map((a) => peekFrac(a, 3, 3, 1))).toEqual([0.2, 0.15, 0.1]);
  });

  it('ひびの段階（純粋な関数）：無傷 0 → 1 → 2 → 3（あと少し・待っている）', () => {
    expect([3, 2.5, 2, 1, 0.5, 0].map((l) => crackOf(l, 3))).toEqual([0, 1, 1, 2, 3, 3]);
  });

  it('peekView：いまの層にあるもの（ランタンで 1・2・3 枚奥まで）。2 × 2 は 4 マスに分かれて見える（どのマスにどの部分か）', () => {
    const s = run(game('c5'), 0);
    const L = digLayout('c5', 0)!;
    placeFind(L, { kind: 'ext', id: EPIC }, 1, 6, 1);
    for (const [x, y, part] of [
      [1, 6, [0, 0]],
      [2, 6, [1, 0]],
      [1, 7, [0, 1]],
      [2, 7, [1, 1]],
    ] as const) {
      // ランタンが無ければ、1 枚奥のものは見えない（層 0 に別のものがあれば、それだけが見える）
      const front = findOf(s, x, y, 0);
      const v0 = peekView(s, x, y);
      if (front) expect(v0?.item).toEqual(front.item);
      else expect(v0).toBeNull();
      // ランタン Lv1：1 枚奥がうっすら
      setLevel(s, 'dig_lamp', 1);
      const v = peekView(s, x, y)!;
      if (front) expect(v.item).toEqual(front.item);
      else expect(v).toMatchObject({ item: { kind: 'ext', id: EPIC }, ahead: 1, part, size: [2, 2], frac: 0.2 });
      s.skills = s.skills.filter((id) => id !== 'dig_lamp');
    }
    // 1 枚はがすと、そのものの層（ahead 0。無傷は 12%）
    while (st(s).depth[6 * 7 + 2] < 1) peelOnce(s, 2, 6);
    expect(peekView(s, 2, 6)).toMatchObject({ ahead: 0, part: [1, 0], frac: 0.12 });
  });
});

describe('セーブ：版 4 → 5（上から掘る断面 → 正面の壁）', () => {
  /** 版 4 のセーブ（荒れ地 4 か所が、横 7 × 縦 20 の断面の残りの硬さだけ） */
  const v4 = (edit?: (o: Record<string, unknown>) => void) => {
    const s = game();
    const o = JSON.parse(serializeP1(s));
    o.v = 4;
    const d = o.dig as { sites: { hp: number[]; permit: boolean; done: boolean; depth?: number[] }[]; topics: number[] };
    d.sites = [
      { hp: new Array(140).fill(2).map((v, i) => (i < 30 ? 0 : v)), permit: true, done: false },
      { hp: new Array(140).fill(0), permit: true, done: true },
      { hp: new Array(140).fill(3), permit: false, done: false },
      { hp: new Array(140).fill(3), permit: false, done: false },
    ];
    edit?.(o);
    return deserializeP1(JSON.stringify(o))!;
  };

  it('掘りかけは新しい壁で作り直す。許可・掘りきりの印はそのまま（掘りきった荒れ地は全部いちばん奥まで）', () => {
    const s = v4();
    expect(s.v).toBe(7);
    const d = s.dig!;
    expect(d.sites.map((x) => [x.permit, x.done])).toEqual([
      [true, false],
      [true, true],
      [false, false],
      [false, false],
    ]);
    expect(d.sites[0].depth.every((v) => v === 0)).toBe(true);
    expect(d.sites[0].hp).toEqual(digLayout('c1', 0)!.cells.map((c) => c.hard[0]));
    expect(d.sites[1].depth.every((v) => v === 3)).toBe(true);
    expect(siteProgress(s, 1)).toBe(1);
    // 読み直しても同じ
    expect(deserializeP1(serializeP1(s))!.dig!.sites).toEqual(d.sites);
  });

  it('研究・RP・お題の発見・石板・レシピはそのまま。見つけ済みのお題・読んだ石板は新しい壁にも出ない', () => {
    const topic = DIG_SITES.c1.topics[0];
    const s = v4((o) => {
      // （どの荒れ地も掘りきっていないことに）
      for (const x of (o.dig as { sites: { done: boolean; hp: number[] }[] }).sites) x.done = false;
      (o.dig as { topics: number[] }).topics = [topic];
      o.research = { [topic]: RESEARCH_NEED[4], 1011: 3 };
      o.tablets = ['tab_c1'];
      o.rp = 321;
      o.recipes = { [relicKey(topic)]: { at: 5 } };
    });
    expect([s.rp, s.research[1011], s.tablets, s.dig!.topics]).toEqual([321, 3, ['tab_c1'], [topic]]);
    expect(s.recipes[relicKey(topic)]).toEqual({ at: 5 });
    const Lt = digLayouts('c1').find((L) => L.topic === topic)!;
    const ft = Lt.finds.find((f) => f.item.kind === 'ext' && f.item.topic)!;
    run(s, Lt.site);
    expect(findOf(s, ft.x, ft.y, ft.layer)).toBeNull();
    const Lb = digLayouts('c1').find((L) => L.finds.some((f) => f.item.kind === 'tablet'))!;
    const fb = Lb.finds.find((f) => f.item.kind === 'tablet')!;
    run(s, Lb.site);
    expect(findOf(s, fb.x, fb.y, fb.layer)).toBeNull();
  });

  it('ほかのセクタの写し（ランドの移動で戻る）の断面も、戻ったときに壁で作り直す（許可はそのまま）', () => {
    const s = game();
    openGate(s);
    s.dig!.sites[2].permit = true;
    expect(moveTo(s, 'c2', 10001)).toBeNull();
    const rec = s.land!.recs.c1!;
    const snap = rec.snap as { dig: { sites: { hp: number[]; permit: boolean; done: boolean; depth?: number[] }[] } };
    snap.dig.sites = snap.dig.sites.map((x) => ({ hp: new Array(140).fill(1), permit: x.permit, done: x.done }));
    expect(moveTo(s, 'c1', 10002)).toBeNull();
    expect(s.dig!.sites.every((x) => Array.isArray(x.depth) && x.depth.length === 63)).toBe(true);
    expect(s.dig!.sites[2].permit).toBe(true);
  });
});

describe('復刻品（3 段目）は いまどおり', () => {
  it('壁から掘ったエクステも、研究 Lv3 になった 1 打で復刻品のレシピが開く', () => {
    const s = run(game('c2'), 0);
    const L = digLayout('c2', 0)!;
    const f = L.finds.find((g) => g.item.kind === 'ext' && !g.item.topic)!;
    const id = (f.item as { id: number }).id;
    s.research[id] = RESEARCH_NEED[2] - 1;
    let r: DigHit | null = null;
    while (st(s).depth[f.y * 7 + f.x] <= f.layer) r = peelOnce(s, f.x, f.y);
    expect(r!.recipe).toBe(relicKey(id));
    expect(endRun(s)!.got.recipes).toEqual([relicKey(id)]);
  });
});
