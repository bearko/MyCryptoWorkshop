/**
 * 発掘場の画面・研究ノートの表示用の純粋な関数（src/island/p1/digview.ts）。
 * マスの見え方（面・穴・🔒・ひび・あと何回・覗き見）・小さな帯・残り時間のバー・発掘終了の札・打てない理由・演出の大きさ・研究ノートのタブと行。
 */
import { describe, expect, it } from 'vitest';
import { DIG, DIG_SITES, RESEARCH_NEED, TABLETS } from '../src/island/p1/data';
import { anyPeek, autoDiggers, biggestFx, cellView, digBlock, digErrText, digStatus, findLabel, fxOf, gotLines, nextLvText, noteEntries, noteTablets, noteTabs, noteTotals, runBar, stars } from '../src/island/p1/digview';
import { allowedDirs, assign, build, dig, digLayout, endRun, newP1, runTick, setLevel, startRun, type DigHit, type P1State } from '../src/island/p1/model';

const lot = (s: P1State, id: string): [number, number, 'rd' | 'ld' | 'lu' | 'ru'] => {
  for (let j = 0; j < s.n; j++) for (let i = 0; i < s.n; i++) { const d = allowedDirs(s, id, i, j); if (d.length) return [i, j, d[0]]; }
  throw new Error('no lot');
};
function site(sector = 'c1', tier: 'C' | 'U' = 'C'): P1State {
  const s = newP1(1, tier, sector);
  s.money = 1e6;
  const b = build(s, 'workshop', ...lot(s, 'workshop'));
  if (typeof b === 'string') throw new Error(b);
  b.left = 0;
  // 1 段目のテスト：全部の層を掘れる・研究 Lv5 まで（発掘の枝の制限は tests/island-p1-dig2b.test.ts）
  setLevel(s, 'dig_deep', 3);
  setLevel(s, 'dig_study', 2);
  // 北の荒れ地（0）で発掘作業を始めておく
  s.dig!.sites[0].permit = true;
  startRun(s, 0);
  return s;
}
const hp = (s: P1State) => s.dig!.sites[s.dig!.cur].hp;
const dp = (s: P1State) => s.dig!.sites[s.dig!.cur].depth;
const hit = (o: Partial<DigHit>): DigHit => ({ x: 0, y: 0, layer: 0, depth: 1, broke: true, left: 0, item: null, rp: 0, ...o });

describe('マスの見え方（正面の壁）', () => {
  it('どのマスも叩ける面。はがすと一段奥の層の色。いちばん奥まで掘ったら穴', () => {
    const s = site();
    const L = digLayout('c1', 0)!;
    expect(cellView(s, 0, 0)).toMatchObject({ state: 'face', layer: 0, color: DIG.C.layers[0].color, taps: L.cells[0].hard[0] });
    expect(cellView(s, 6, 8).state).toBe('face');
    dig(s, 0, 0);
    expect(cellView(s, 0, 0)).toMatchObject({ state: 'face', layer: 1, color: DIG.C.layers[1].color });
    dp(s)[0] = 3;
    hp(s)[0] = 0;
    expect(cellView(s, 0, 0)).toMatchObject({ state: 'dug', taps: 0, peek: null });
  });
  it('ひび：いまの層の残りの硬さで 0・1・2・3。あと何回は 1 打の強さで割る', () => {
    const s = site();
    const L = digLayout('c1', 0)!;
    expect(cellView(s, 0, 0).crack).toBe(0);
    // 岩盤（硬さ 3）のマスで、残りの硬さを変えて見る
    const k = L.cells.findIndex((c) => c.hard[2] === 3);
    const [x, y] = [k % L.w, Math.floor(k / L.w)];
    dp(s)[k] = 2;
    hp(s)[k] = 3;
    expect(cellView(s, x, y)).toMatchObject({ crack: 0, taps: 3, layer: 2 });
    hp(s)[k] = 2;
    expect(cellView(s, x, y)).toMatchObject({ crack: 1, taps: 2 });
    hp(s)[k] = 1;
    expect(cellView(s, x, y)).toMatchObject({ crack: 2, taps: 1 });
  });
  it('深い層の許可が要る層は 🔒（locked）', () => {
    const s = site();
    // 深い層の許可が無い（2 層目まで）
    s.skills = s.skills.filter((id) => id !== 'dig_deep');
    dp(s)[3] = 2;
    hp(s)[3] = 3;
    expect(cellView(s, 3, 0).state).toBe('locked');
  });
  it('覗き見：いまの層のものだけ、無傷は細いひび（12%）。叩くと広がる。1 枚以上奥はランタンのときだけ', () => {
    const s = site();
    const L = digLayout('c1', 0)!;
    const f0 = L.finds.find((g) => g.layer === 0)!;
    expect(cellView(s, f0.x, f0.y).peek).toMatchObject({ item: f0.item, ahead: 0, frac: 0.12 });
    // 開いた時点では、形が分かるほど見えているマスは無い（初めての覗き見の一言はまだ）
    expect(anyPeek(s)).toBe(false);
    const f = L.finds.find((g) => g.layer === 1 && !L.finds.some((h) => h.x === g.x && h.y === g.y && h.layer === 0))!;
    expect(cellView(s, f.x, f.y).peek).toBeNull();
    setLevel(s, 'dig_lamp', 1);
    expect(cellView(s, f.x, f.y).peek).toMatchObject({ item: f.item, ahead: 1, layer: 1, frac: 0.2 });
    // 粘土層（硬さ 2）まで 1 枚はがして 1 打：40% 以上 → 初めての覗き見
    const t = site();
    const g = L.finds.find((q) => q.layer === 1 && q.item.kind === 'ext' && L.cells[q.y * 7 + q.x].hard[1] === 2)!;
    dig(t, g.x, g.y);
    expect(cellView(t, g.x, g.y).peek).toMatchObject({ ahead: 0, frac: 0.12 });
    dig(t, g.x, g.y);
    expect(cellView(t, g.x, g.y).peek!.frac).toBe(0.9);
    expect(anyPeek(t)).toBe(true);
  });
});

describe('上の 1 行と、打てない理由', () => {
  it('荒れ地の名前・掘った割合・RP・層・お題。お店が無ければ詰まりは出さない', () => {
    const s = site();
    const st = digStatus(s)!;
    expect(st.name).toBe('北の荒れ地');
    expect(st.pct).toBe(0);
    expect(st.layer).toBe('表土');
    expect(st.topics).toEqual([0, 3]);
    expect(st.jam).toBeNull();
    expect(st.rp).toBe(s.rp);
    // 63 マス × 3 層のうち 1 枚
    dp(s)[0] = 1;
    expect(digStatus(s)!.pct).toBe(1);
    expect(digStatus(s)!.date).toMatch(/年目|開業準備/);
    expect(digStatus(s)!).toMatchObject({ sales: 0, found: 0, lvUp: 0 });
  });
  it('残り時間のバー：15.0 秒から。残り 5 秒で赤く（warn）、残り 3 秒で音（tick）。作業していなければ null', () => {
    const s = site();
    expect(runBar(s)).toEqual({ sec: '15.0', frac: 1, warn: false, tick: false });
    runTick(s, 10500);
    expect(runBar(s)).toMatchObject({ sec: '4.5', warn: true, tick: false });
    runTick(s, 2000);
    expect(runBar(s)).toMatchObject({ sec: '2.5', warn: true, tick: true });
    endRun(s);
    expect(runBar(s)).toBeNull();
  });
  it('発掘終了の札：新発見・研究 Lv ↑・RP・素材・はがした層', () => {
    expect(gotLines({ found: 2, lv: 1, rp: 38, mat: 6, cells: 21 })).toEqual([
      ['新発見', '2'],
      ['研究 Lv ↑', '1'],
      ['研究ポイント', '+38'],
      ['素材', '+6'],
      ['はがした層', '21'],
    ]);
  });
  it('作業が終わった・荒れ地が無いは、パネル全体の理由（工房が無くても掘れる）', () => {
    const s = site();
    expect(digBlock(s)).toBeNull();
    endRun(s);
    expect(digBlock(s)).toBe('no-run');
    expect(digErrText('no-run')).toContain('もう一度');
    const r = newP1(1, 'C', 'c1');
    r.dig!.sites[0].permit = true;
    startRun(r, 0);
    expect(digBlock(r)).toBeNull();
    const x = site();
    x.dig = null;
    expect(digBlock(x)).toBe('no-site');
    expect(digStatus(x)).toBeNull();
    for (const e of ['no-site', 'no-run', 'dug', 'deep', 'wait', 'no-blast', 'money'] as const) expect(digErrText(e).length).toBeGreaterThan(0);
  });
  it('発掘隊：発掘の担当の顔と 1 日の回数', () => {
    const s = site();
    expect(autoDiggers(s)).toEqual([]);
    expect(assign(s, s.staff[0].hero, 'dig', null)).toBeNull();
    const a = autoDiggers(s);
    expect(a).toHaveLength(1);
    expect(a[0].hero).toBe(s.staff[0].hero);
    expect(a[0].perDay).toBeGreaterThan(0);
  });
});

describe('出土の演出は 1 つだけ大きく', () => {
  it('打っただけ → はがれた → 素材 → エクステ → 石板 → 大きな遺物（2 × 2）→ お題', () => {
    expect(fxOf(hit({ broke: false }))).toBe('chip');
    expect(fxOf(hit({}))).toBe('crumble');
    expect(fxOf(hit({ item: { kind: 'mat', mat: 'iron', n: 3 } }))).toBe('mat');
    expect(fxOf(hit({ item: { kind: 'ext', id: 1011 } }))).toBe('ext');
    expect(fxOf(hit({ item: { kind: 'tablet', id: 'tab_c1' } }))).toBe('tablet');
    expect(fxOf(hit({ item: { kind: 'ext', id: 1122, topic: true } }))).toBe('topic');
    expect(fxOf(hit({ item: { kind: 'ext', id: 4001 }, span: { x: 0, y: 0, w: 2, h: 2 } }))).toBe('epic');
    expect(biggestFx([hit({ item: { kind: 'ext', id: 4001 }, span: { x: 0, y: 0, w: 2, h: 2 } }), hit({ item: { kind: 'tablet', id: 'tab_c1' } })])).toBe('epic');
    // 発破で何マスもはがれたとき：いちばん大きいもの
    expect(biggestFx([hit({}), hit({ item: { kind: 'ext', id: 1011 } }), hit({ broke: false })])).toBe('ext');
    expect(biggestFx([hit({ item: { kind: 'ext', id: 1122, topic: true } }), hit({ item: { kind: 'tablet', id: 'tab_c1' } })])).toBe('topic');
  });
  it('エクステの札：お題・新発見・研究 Lv', () => {
    expect(findLabel(hit({ item: { kind: 'ext', id: 1122, topic: true } }))).toBe('お題を発見！');
    expect(findLabel(hit({ item: { kind: 'ext', id: 1011 }, first: true }))).toBe('新発見！');
    expect(findLabel(hit({ item: { kind: 'ext', id: 1011 }, lv: 3 }))).toBe('研究 Lv3');
    expect(findLabel(hit({ item: { kind: 'mat', mat: 'iron', n: 3 } }))).toBe('');
  });
});

describe('研究ノート', () => {
  it('タブ：いまのセクタが先頭、次に出店したセクタ。発掘場のあるセクタすべて', () => {
    const s = site('c3');
    s.land = { cur: 'c3', mine: ['c1', 'c3'], recs: {} };
    const tabs = noteTabs(s);
    expect(tabs[0]).toMatchObject({ id: 'c3', here: true, visited: true });
    expect(tabs[1]).toMatchObject({ id: 'c1', here: false, visited: true });
    expect(tabs.slice(2).every((x) => !x.visited)).toBe(true);
    expect(tabs.map((x) => x.id).sort()).toEqual(Object.keys(DIG_SITES).sort());
  });
  it('行：お題（印つき）→ お題以外。未発見は 0 個、★ と「次のレベルまであと N 個」', () => {
    const s = site();
    s.research = { 1011: 3, 1122: RESEARCH_NEED[4] };
    const list = noteEntries(s, 'c1');
    expect(list.filter((x) => x.topic).map((x) => x.id)).toEqual(DIG_SITES.c1.topics);
    expect(list.filter((x) => !x.topic).map((x) => x.id)).toEqual(DIG_SITES.c1.finds);
    const axe = list.find((x) => x.id === 1011)!;
    expect(axe.lv).toBe(2);
    expect(axe.left).toBe(1);
    expect(nextLvText(axe)).toBe('次のレベルまで あと 1 個');
    const log = list.find((x) => x.id === 1122)!;
    expect(log.lv).toBe(5);
    expect(nextLvText(log)).toBe('研究 Lv 最大');
    const none = list.find((x) => x.id === 1056)!;
    expect(none.n).toBe(0);
    expect(nextLvText(none)).toBe('まだ見つけていない');
    expect(stars(2)).toBe('★★☆☆☆');
    expect(stars(5)).toBe('★★★★★');
  });
  it('石板：そのセクタの石板と読んだか。見出しの数は Rare 以降の枠を数えない', () => {
    const s = site();
    expect(noteTablets(s, 'c1').map((x) => x.read)).toEqual([false]);
    s.tablets = ['tab_c1'];
    expect(noteTablets(s, 'c1')[0]).toMatchObject({ read: true });
    expect(noteTablets(s, 'u1')).toHaveLength(2);
    const tot = noteTotals(s);
    expect(tot.tablets).toBe(1);
    expect(tot.allTablets).toBe(TABLETS.filter((x) => !x.soon).length);
    expect(tot.all).toBe(new Set(Object.values(DIG_SITES).flatMap((x) => [...x.topics, ...x.finds])).size);
  });
});
