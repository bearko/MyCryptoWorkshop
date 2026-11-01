/**
 * 発掘との出会い（国の役所からの手紙）・お題の発表・調査依頼状・助言の優先順・月次報告の「今月の出土品」・発掘作業のまとめ報告
 * （docs/ISLAND_PHASE1.md「地層の発掘と研究ポイント」）。
 */
import { describe, expect, it } from 'vitest';
import { heroById } from '../src/game/catalog';
import { DEF } from '../src/island/defs';
import { DIG_BALANCE, DIG_REQUEST, DIG_SITES, DIG_THEME, MISSIONS, RP_GAIN, SECTOR_CHIEF, rewardText } from '../src/island/p1/data';
import { DIG_IDLE_DAYS, DIG_TIP_ORDER, MEET_FOUND, MEET_IDLE_DAYS, MEET_LINES, canPresent, chiefHome, chiefOf, digMet, digReportLine, digReportText, digSummary, digTips, letterToGet, meetReady, meetTip, presentAfter, presentPages, topicsPage } from '../src/island/p1/digmeet';
import { LETTER_LOCK, letterLocked, moveTo } from '../src/island/p1/land';
import { accept, allowedDirs, build, claim, dig, digLayouts, endRun, missionMet, newP1, openGate, present, setLevel, startRun, step, type DigHit, type P1State, type Report } from '../src/island/p1/model';

const lot = (s: P1State, id: string): [number, number, 'rd' | 'ld' | 'lu' | 'ru'] => {
  for (let j = 0; j < s.n; j++) for (let i = 0; i < s.n; i++) { const d = allowedDirs(s, id, i, j); if (d.length) return [i, j, d[0]]; }
  throw new Error('no lot');
};
/** チュートリアルを終えて、工房があり、最初の月の締めのあと（2 か月目） */
function month2(seed = 1, sector = 'c1', tier: 'C' | 'U' = 'C'): P1State {
  const s = newP1(seed, tier, sector);
  s.money = 1e7;
  const b = build(s, 'workshop', ...lot(s, 'workshop'));
  if (typeof b === 'string') throw new Error(b);
  b.left = 0;
  // 1 段目のテスト：全部の層を掘れる・研究 Lv5 まで（発掘の枝の制限は tests/island-p1-dig2b.test.ts）
  setLevel(s, 'dig_deep', 3);
  setLevel(s, 'dig_study', 2);
  s.tut = 99;
  s.reports.push({ month: 1, revenue: 0, bySeries: {}, costs: { materials: 0, wages: 0, part: 0, upkeep: 0, build: 0, ads: 0 }, profit: 0, area: [], rank: 4, news: [] });
  s.monthPause = false;
  return s;
}
/** 荒れ地 k の許可をもらって発掘作業を始める */
function run(s: P1State, k: number) {
  s.dig!.sites[k].permit = true;
  if (s.digRun) endRun(s);
  if (typeof startRun(s, k) === 'string') throw new Error('run');
}
function breakCell(s: P1State, x: number, y: number): DigHit {
  for (let k = 0; k < 20; k++) {
    const r = dig(s, x, y);
    if (typeof r === 'string') throw new Error(`${x},${y}: ${r}`);
    if (r.broke) return r;
  }
  throw new Error('not broken');
}
/** (x, y) を手前から掘り進めて、層 layer をはがす */
const digTo = (s: P1State, x: number, y: number, layer: number) => {
  for (;;) {
    const r = breakCell(s, x, y);
    if (r.layer >= layer) return r;
  }
};
/** いまのセクタのお題を n 個（上の層から）掘る（お題のある荒れ地で作業して、終える） */
function topics(s: P1State, n = 99) {
  const sec = s.dig!.sector;
  const want = DIG_SITES[sec].topics.slice(0, n);
  for (const L of digLayouts(sec)) {
    if (L.topic == null || !want.includes(L.topic) || s.dig!.topics.includes(L.topic)) continue;
    run(s, L.site);
    const f = L.finds.find((g) => g.item.kind === 'ext' && !!g.item.topic)!;
    digTo(s, f.x, f.y, f.layer);
    endRun(s);
  }
}
/** 報告（締め）を作る */
const rep = (month: number, revenue: number, rank: number, extra: Partial<Report> = {}): Report => ({ month, revenue, bySeries: {}, costs: { materials: 0, wages: 0, part: 0, upkeep: 0, build: 0, ads: 0 }, profit: 0, area: [], rank, news: [], ...extra });

describe('発掘との出会い（2 か月目の途中、初めて手が空いたとき）', () => {
  it('チュートリアルのあと・最初の月の締めのあと・月末ポーズでない・操作がないまま 5 日で出会う', () => {
    const s = month2();
    expect(MEET_IDLE_DAYS).toBe(5);
    expect(meetReady(s, 4)).toBe(false);
    expect(meetReady(s, 5)).toBe(true);
    // 見習い期間（チュートリアル中）は出ない
    s.tut = 12;
    expect(meetReady(s, 9)).toBe(false);
    s.tut = 99;
    // 月末ポーズのあいだは出ない
    s.monthPause = true;
    expect(meetReady(s, 9)).toBe(false);
    s.monthPause = false;
    // 最初の月の締めの前（1 か月目）は出ない
    const r = s.reports.pop()!;
    expect(meetReady(s, 9)).toBe(false);
    s.reports.push(r);
    // 一度出会ったら出ない
    s.flags.digMeet = 'tap';
    expect(meetReady(s, 9)).toBe(false);
    expect(digMet(s)).toBe(true);
  });

  it('荒れ地の無いセクタ・発掘作業のあいだは出会わない（工房は要らない）。古いセーブ（チュートリアルの番号が無い）も 2 か月目を過ぎていれば出会う', () => {
    const s = month2();
    s.buildings.find((b) => b.owner === 'me' && b.id === 'workshop')!.left = 3;
    expect(meetReady(s, 9)).toBe(true);
    run(s, 0);
    expect(meetReady(s, 9)).toBe(false);
    const r = month2(1, 'r1' as string, 'U');
    r.dig = null;
    expect(meetReady(r, 9)).toBe(false);
    const old = month2();
    delete (old as { tut?: number }).tut;
    expect(meetReady(old, 5)).toBe(true);
  });

  it('国の役所からの手紙（セリフ 1〜3）と 4（1 枚 2 文まで・最後は次にすること）。途中の一言は「荒れ地をタップ」→「マスを掘る」→「スキルツリーの四角いパネル」', () => {
    const lines = [...MEET_LINES(), MEET_FOUND()];
    expect(lines).toHaveLength(4);
    for (const l of lines) expect(l.replace(/[！？]/g, '。').split('。').filter((x) => x.trim()).length).toBeLessThanOrEqual(2);
    expect(lines[0]).toContain('[[国の役所]]から手紙');
    expect(lines[0]).toContain('[[復興]]');
    expect(lines[1]).toContain('[[遺物]]');
    expect(lines[2]).toContain('[[発掘許可]]');
    expect(lines[2]).toContain('掘ってみよう');
    expect(lines[3]).toContain('四角いパネル');
    for (const l of lines) expect(l).not.toContain('ツルハシ');
    const s = month2();
    expect(meetTip(s)).toBeNull();
    s.flags.digMeet = 'tap';
    expect(meetTip(s)).toContain('荒れ地');
    s.flags.digMeet = 'open';
    expect(meetTip(s)).toContain('荒れ地');
    run(s, 0);
    expect(meetTip(s)).toContain('掘ってみよう');
    endRun(s);
    s.flags.digMeet = 'skill';
    expect(meetTip(s)).toContain('スキル');
    s.flags.digMeet = 'done';
    expect(meetTip(s)).toBeNull();
  });
});

describe('町の長と研究成果の発表', () => {
  it('発掘場のあるセクタすべてに町の長（replica のヒーローの絵）。家は町の住宅のうち 1 つで、いつも同じ', () => {
    expect(Object.keys(SECTOR_CHIEF).sort()).toEqual(Object.keys(DIG_SITES).sort());
    for (const [sec, id] of Object.entries(SECTOR_CHIEF)) {
      const hero = heroById.get(id);
      expect(hero?.category, sec).toBe('replica');
      expect(hero?.rarity, sec).toBe(sec.startsWith('c') ? 'RepC' : 'RepB');
      expect(chiefOf(sec)).toBe(id);
    }
    expect(new Set(Object.values(SECTOR_CHIEF)).size).toBe(Object.keys(SECTOR_CHIEF).length);
    expect(chiefOf('r1')).toBeNull();
    const s = month2(3);
    const home = chiefHome(s)!;
    expect(home.owner).toBe('town');
    expect(DEF[home.id].cat).toBe('home');
    expect(chiefHome(month2(3))!.uid).toBe(home.uid);
  });

  it('お題がそろうまでは発表できない。そろうと 3 枚の会話（マインちゃん → 町の長 → 町の長）→ +60 RP と Uncommon の調査依頼状', () => {
    const s = month2(5);
    s.flags.digMeet = 'done';
    openGate(s);
    expect(canPresent(s)).toBe(false);
    expect(letterLocked(s, 'u1')).toBe(true);
    expect(LETTER_LOCK).toContain('調査依頼状が要る');
    topics(s);
    expect(canPresent(s)).toBe(true);
    expect(letterToGet(s)).toBe('U');
    const pages = presentPages(s);
    expect(pages.map((p) => p.who)).toEqual([null, SECTOR_CHIEF.c1, SECTOR_CHIEF.c1]);
    expect(pages[2].text).toContain('Uncommon の調査依頼状');
    const rp0 = s.rp;
    expect(present(s)).toEqual({ rp: RP_GAIN.C.present, letter: 'U' });
    expect(s.rp - rp0).toBe(60);
    expect(canPresent(s)).toBe(false);
    expect(letterLocked(s, 'u1')).toBe(false);
    expect(presentAfter('U')).toContain('ランドマップ');
    // 依頼状を持っていれば、Uncommon に出店できる
    expect(moveTo(s, 'u1', 10001)).toBeNull();
  });

  it('出会いの前は、お題がそろっても発表の印を出さない。2 つ目の Common のセクタでは依頼状はもう持っている（RP だけ）', () => {
    const s = month2(5);
    topics(s);
    expect(canPresent(s)).toBe(false);
    s.flags.digMeet = 'done';
    s.letters = ['U'];
    expect(canPresent(s)).toBe(true);
    expect(letterToGet(s)).toBeNull();
    expect(presentPages(s)[2].text).not.toContain('調査依頼状');
  });

  it('到着の案内のお題の 1 枚：「この町の荒れ地には、栄えていた頃の[[〇〇]]が眠っているはず。お題は 3 つ（Uncommon は 4 つ）」', () => {
    expect(Object.keys(DIG_THEME).sort()).toEqual(Object.keys(DIG_SITES).sort());
    expect(topicsPage('c2')).toContain(`荒れ地には、栄えていた頃の[[${DIG_THEME.c2}]]が眠っているはず。お題は 3 つ`);
    expect(topicsPage('u1')).toContain('お題は 4 つ');
    expect(topicsPage('r1')).toBeNull();
  });
});

describe('マインちゃんの助言（発掘）の優先順', () => {
  it('並びは 発表できる（high）→ 復刻品の独占があと 1 か月（mid）→ しばらく掘っていない（mid）→ 次の許可（mid）→ お題があと 1 つ（mid）→ 調査依頼状があるのに Uncommon に行っていない（low）', () => {
    expect(DIG_TIP_ORDER).toEqual(['present', 'relic', 'idle', 'permit', 'topic-one', 'letter', 'branch']);
    expect(DIG_IDLE_DAYS).toBe(10);
    const s = month2(5);
    s.money = 0;
    // 出会いの前・出会いの途中（荒れ地をタップする段）は出さない
    expect(digTips(s)).toEqual([]);
    s.flags.digMeet = 'tap';
    expect(digTips(s)).toEqual([]);
    s.flags.digMeet = 'done';
    // 許可のある荒れ地が無い・申請料は 1 か所目なので無料
    expect(digTips(s).map((x) => [x.key, x.tier])).toEqual([['permit', 'mid']]);
    s.dig!.sites[1].permit = true;
    s.dig!.last = s.day;
    // 許可がある・さっき掘った・2 か所目の申請料（2,000 G）が払えない → 何も出さない
    expect(digTips(s)).toEqual([]);
    s.money = DIG_BALANCE.permitFee.C;
    const pm = digTips(s);
    expect(pm.map((x) => x.key)).toEqual(['permit']);
    expect(pm[0].text).toContain('2,000 G');
    s.money = 0;
    // 10 日掘っていない → 「15 秒だけ掘ってみよう」（その荒れ地を指す）
    s.day += DIG_IDLE_DAYS;
    const idle = digTips(s);
    expect(idle.map((x) => [x.key, x.tier, x.site])).toEqual([['idle', 'mid', 1]]);
    expect(idle[0].text).toContain('15 秒だけ掘ってみよう');
    // 発掘作業のあいだは出さない
    run(s, 1);
    expect(digTips(s)).toEqual([]);
    endRun(s);
    s.dig!.last = s.day;
    topics(s, 2);
    const one = digTips(s);
    expect(one.map((x) => x.key)).toEqual(['topic-one']);
    expect(one[0].text).toContain('あと 1 つ');
    expect(one[0].text).toContain('岩盤');
    expect(one[0].text).toContain('の荒れ地');
    topics(s);
    s.dig!.last = s.day;
    s.money = 1e7;
    expect(openGate(s)).toBe(true);
    s.money = 0;
    expect(digTips(s).map((x) => [x.key, x.tier])).toEqual([['present', 'high']]);
    present(s);
    const low = digTips(s);
    expect(low.map((x) => [x.key, x.tier])).toEqual([['letter', 'low']]);
    expect(low[0].text).toContain('150,000 G');
    // Uncommon に出店したら、依頼状の助言は消える
    s.land!.mine.push('u1');
    expect(digTips(s)).toEqual([]);
  });
});

describe('月次報告の「今月の出土品」', () => {
  it('締めで dig.month が報告に移り、1 行の数（新発見・研究 Lv ↑・RP）になる', () => {
    const s = month2(7);
    s.reports = [];
    s.open = s.day;
    // 1 段目のマスをいくつか掘る（エクステが出れば新発見と RP）
    run(s, 0);
    for (let x = 0; x < 7; x++) breakCell(s, x, 0);
    endRun(s);
    const m = { ...s.dig!.month };
    let r: Report | undefined;
    for (let k = 0; k < 40 && !r; k++) r = step(s).report ?? undefined;
    expect(r).toBeDefined();
    expect(digReportLine(r!)).toEqual(m);
    expect(s.dig!.month).toEqual({ found: 0, lv: 0, rp: 0 });
    expect(digReportLine({})).toBeNull();
    expect(digReportText({ found: 2, lv: 3, rp: 45 })[0]).toBe('新発見 2・研究 Lv ↑ 3・RP +45');
    expect(digReportText({ found: 0, lv: 0, rp: 0 })[0]).toContain('なし');
    expect(digReportText({ found: 0, lv: 0, rp: 0 })[0]).not.toContain('ツルハシ');
  });
});

describe('発掘作業のまとめ報告（純粋な関数）', () => {
  const got = { found: 2, lv: 1, rp: 45, mat: 6, cells: 30 };
  it('題・期間の売上の合計・月ごとの売上・順位の変化・資金の増減・今回の出土・最新の月', () => {
    const before = rep(2, 30000, 3);
    const a = rep(3, 40000, 2, { money: { start: 50000, end: 62000 } });
    const b = rep(4, 52000, 2, { money: { start: 62000, end: 81000 } });
    const sum = digSummary({ reports: [before, a, b] }, [a, b], got);
    expect(sum.title).toBe('発掘中の報告（1 年目・3 月〜4 月）');
    expect(sum.total).toBe(92000);
    expect(sum.months).toEqual([
      { month: 3, label: '3 月', revenue: 40000 },
      { month: 4, label: '4 月', revenue: 52000 },
    ]);
    expect([sum.rankFrom, sum.rankTo]).toEqual([3, 2]);
    expect(sum.money).toEqual({ start: 50000, end: 81000 });
    expect(sum.got).toEqual(got);
    expect(sum.latest).toBe(b);
    expect(sum.conquered).toBe(false);
  });
  it('1 か月だけ・年をまたぐ・最初の月（前の順位が無い）・制覇（2 か月続けて 1 位）', () => {
    const one = rep(5, 1000, 1, { streak: 1 });
    expect(digSummary({ reports: [one] }, [one], got)).toMatchObject({ title: '発掘中の報告（1 年目・5 月）', rankFrom: null, rankTo: 1, money: null, conquered: false });
    const x = rep(12, 1, 2);
    const y = rep(13, 2, 1, { streak: 2 });
    const sum = digSummary({ reports: [rep(11, 0, 4), x, y] }, [x, y], got);
    expect(sum.title).toBe('発掘中の報告（1 年目・12 月〜2 年目・1 月）');
    expect(sum.conquered).toBe(true);
  });
});

describe('発掘の依頼', () => {
  it('発掘場のあるセクタに 1 つずつ。古い〇〇（そのセクタのお題以外の出土品）を掘り出すと達成、報酬は RP', () => {
    expect(Object.keys(DIG_REQUEST).sort()).toEqual(Object.keys(DIG_SITES).sort());
    for (const [sec, q] of Object.entries(DIG_REQUEST)) {
      expect(DIG_SITES[sec].finds, sec).toContain(q.ext);
      const m = MISSIONS.find((x) => x.id === `${sec}_dig`)!;
      expect(m).toMatchObject({ sector: sec, dig: q.ext, reward: 0, rp: sec.startsWith('u') ? 80 : 40 });
      expect(m.title).toContain('古い');
      expect(rewardText(m)).toBe(`報酬 研究 ${m.rp} RP`);
    }
    const s = month2(9);
    expect(missionMet(s, 'c1_dig')).toBe(false);
    expect(accept(s, 'c1_dig')).toBeNull();
    s.research[DIG_REQUEST.c1.ext] = 1;
    expect(missionMet(s, 'c1_dig')).toBe(true);
    // ほかのセクタの依頼は、そのセクタにいるときだけ
    s.research[DIG_REQUEST.c2.ext] = 1;
    expect(missionMet(s, 'c2_dig')).toBe(false);
    s.missions.c1_dig = 'done';
    const rp0 = s.rp;
    const g0 = s.money;
    expect(claim(s, 'c1_dig')).toBeNull();
    expect(s.rp - rp0).toBe(40);
    expect(s.money).toBe(g0);
  });
});
