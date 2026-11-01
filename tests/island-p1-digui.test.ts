/**
 * 発掘場の画面・研究ノートの表示用の純粋な関数（src/island/p1/digview.ts）。
 * マスの見え方（穴・押せる・届かない・ひび・あと何回）・上の 1 行・残り時間のバー・発掘終了の札・打てない理由・演出の大きさ・研究ノートのタブと行。
 */
import { describe, expect, it } from 'vitest';
import { DIG_SITES, RESEARCH_NEED, TABLETS } from '../src/island/p1/data';
import { autoDiggers, biggestFx, cellView, digBlock, digErrText, digStatus, findLabel, focusRow, fxOf, gotLines, nextLvText, noteEntries, noteTablets, noteTabs, noteTotals, runBar, stars } from '../src/island/p1/digview';
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
const hit = (o: Partial<DigHit>): DigHit => ({ x: 0, y: 0, broke: true, left: 0, item: null, rp: 0, ...o });

describe('マスの見え方', () => {
  it('1 段目は押せる、2 段目からは届かない。崩れたら穴になり、下が押せる', () => {
    const s = site();
    expect(cellView(s, 0, 0).state).toBe('open');
    expect(cellView(s, 0, 1).state).toBe('far');
    const L = digLayout('c1', 0)!;
    hp(s)[0] = 1;
    dig(s, 0, 0);
    expect(cellView(s, 0, 0).state).toBe('dug');
    expect(cellView(s, 0, 0).taps).toBe(0);
    expect(cellView(s, 0, 1).state).toBe('open');
    expect(cellView(s, 0, 1).layer).toBe(L.cells[7].layer);
  });
  it('ひび：打ちかけで 1、半分を切ったら 2。あと何回は 1 打の強さで割る', () => {
    const s = site();
    const L = digLayout('c1', 0)!;
    expect(cellView(s, 0, 0).crack).toBe(0);
    // 硬さ 3 のマス（岩盤）まで穴を開けて、残りの硬さを変えて見る
    const k = L.cells.findIndex((c) => c.hard === 3);
    const x = k % L.w;
    const y = Math.floor(k / L.w);
    for (let yy = 0; yy < y; yy++) hp(s)[yy * L.w + x] = 0;
    hp(s)[k] = 2;
    expect(cellView(s, x, y).crack).toBe(1);
    expect(cellView(s, x, y).taps).toBe(2);
    hp(s)[k] = 1;
    expect(cellView(s, x, y).crack).toBe(2);
    expect(cellView(s, x, y).taps).toBe(1);
  });
  it('ランタンが無ければ中身は見えない。あれば手が届くマスと 1 段下が見える', () => {
    const s = site();
    const L = digLayout('c1', 0)!;
    const k = L.cells.findIndex((c, i) => i >= 7 && i < 14 && c.item);
    expect(k).toBeGreaterThan(0);
    const x = k % L.w;
    expect(cellView(s, x, 1).peek).toBeNull();
    // （発掘 v2 の 2 段目：ランタンは工房の設備投資からスキルツリーの「発掘のランタン」へ）
    setLevel(s, 'dig_lamp', 1);
    expect(cellView(s, x, 1).peek).toEqual(L.cells[k].item);
    // 2 段下はまだ見えない
    const k2 = L.cells.findIndex((c, i) => i >= 14 && i < 21 && c.item);
    if (k2 >= 0) expect(cellView(s, k2 % L.w, 2).peek).toBeNull();
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
    hp(s)[0] = 0;
    expect(digStatus(s)!.pct).toBe(1);
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
  it('発掘終了の札：新発見・研究 Lv ↑・RP・素材・崩したマス', () => {
    expect(gotLines({ found: 2, lv: 1, rp: 38, mat: 6, cells: 21 })).toEqual([
      ['新発見', '2'],
      ['研究 Lv ↑', '1'],
      ['研究ポイント', '+38'],
      ['素材', '+6'],
      ['崩したマス', '21'],
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
    for (const e of ['no-site', 'no-run', 'dug', 'far', 'no-blast', 'money'] as const) expect(digErrText(e).length).toBeGreaterThan(0);
  });
  it('開いたときに見せる行は、いちばん深く崩れた行', () => {
    const s = site();
    expect(focusRow(s)).toBe(0);
    hp(s)[0] = 0;
    hp(s)[7] = 0;
    hp(s)[14] = 0;
    expect(focusRow(s)).toBe(2);
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
  it('打っただけ → 崩れた → 素材 → エクステ → 石板 → お題', () => {
    expect(fxOf(hit({ broke: false }))).toBe('chip');
    expect(fxOf(hit({}))).toBe('crumble');
    expect(fxOf(hit({ item: { kind: 'mat', mat: 'iron', n: 3 } }))).toBe('mat');
    expect(fxOf(hit({ item: { kind: 'ext', id: 1011 } }))).toBe('ext');
    expect(fxOf(hit({ item: { kind: 'tablet', id: 'tab_c1' } }))).toBe('tablet');
    expect(fxOf(hit({ item: { kind: 'ext', id: 1122, topic: true } }))).toBe('topic');
    // 発破で何マスも崩れたとき：いちばん大きいもの
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
