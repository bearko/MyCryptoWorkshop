/**
 * 発掘 v2 の 5 段目（docs/ISLAND_PHASE1.md「お題・発表・調査依頼状」「制覇（2 か月続けて 1 位）」「3. 復刻品」）：
 * 制覇に研究成果の発表・調査依頼状は Common の 2 つの町で・真似された復刻品のマインちゃんの一言・自動プレイの品ぞろえの見直し。
 */
import { describe, expect, it } from 'vitest';
import { BRAND, DIG_SITES, LETTER_NEED, TOP_STREAK, relicKey } from '../src/island/p1/data';
import { clearCondText, clearWaitTip, digSummary, digTips, lettersLeft, presentAfter, presentPages, relicCopied } from '../src/island/p1/digmeet';
import { newLand } from '../src/island/p1/company';
import { letterLock } from '../src/island/p1/land';
import { DAYS, allowedDirs, build, step, clearGoal, clearWaiting, deserializeP1, endMonth, letterProgress, newP1, openRelic, present, serializeP1, setShelf, tutSpot, type P1State } from '../src/island/p1/model';
import { lineupScore, rankLineup } from '../scripts/island/sim';

/** タオックス・出会いのあと・他社が売らない（締めると 1 位） */
function town(seed = 5, sector = 'c1'): P1State {
  const s = newP1(seed, 'C', sector);
  s.money = 1e6;
  s.tut = 99;
  s.flags.digMeet = 'done';
  for (const r of s.rivals) {
    r.base = 0;
    r.sells = {};
  }
  s.open = 0;
  return s;
}
/** 売上のある月の締め（他社が売らないので 1 位） */
function close(s: P1State) {
  s.monthSales = { Sensu: 50000 };
  s.day += DAYS;
  return endMonth(s);
}
function lotOf(s: P1State, id: string): [number, number, 'rd' | 'ld' | 'lu' | 'ru'] {
  for (let j = 0; j < s.n; j++) for (let i = 0; i < s.n; i++) {
    const d = allowedDirs(s, id, i, j);
    if (d.length) return [i, j, d[0]];
  }
  throw new Error('no lot');
}
/** お題を全部そろえる（掘った扱い） */
const topics = (s: P1State) => (s.dig!.topics = [...DIG_SITES[s.dig!.sector].topics]);

describe('制覇に研究成果の発表', () => {
  it('1 位を 2 か月続けても、発表がまだなら制覇しない（「👑 1 位を守っている（制覇まで：研究成果の発表）」）', () => {
    const s = town();
    const r1 = close(s);
    expect(r1.rank).toBe(1);
    expect(r1.goal).toEqual({ present: false, got: 0, all: 3 });
    const r2 = close(s);
    expect(r2.streak).toBe(TOP_STREAK);
    expect(s.cleared).toBe(false);
    expect(r2.emblem).toBeUndefined();
    expect(s.emblem).toBe(0);
    expect(clearWaiting(s)).toBe(true);
    expect(clearGoal(s)).toMatchObject({ top: true, present: false, got: 0, all: 3 });
    // 月次報告の KGI のカードの条件の文・助言
    expect(clearCondText(r1.streak!, r1.goal)[0]).toBe('制覇の条件：1 位を 2 か月（いま 1 / 2）／研究成果の発表 0 / 3 お題');
    expect(clearCondText(r2.streak!, { present: false, got: 1, all: 3 })[0]).toBe('制覇の条件：1 位を 2 か月 ✔／研究成果の発表 1 / 3 お題');
    expect(clearWaitTip(s)).toContain('研究成果の発表も要る');
    // まとめ報告の「制覇」も同じ判定
    expect(digSummary(s, [r1, r2], { finds: [], mats: {}, rp: 0, lv: 0, topics: [], tablets: [], recipes: [] } as never).conquered).toBe(false);
    // 3 か月目も 1 位のまま：まだ制覇ではない
    close(s);
    expect(s.cleared).toBe(false);
  });

  it('1 位が 2 か月続いているときに発表すると、その場で制覇（🏅 エンブレム・ブランド力）', () => {
    const s = town();
    close(s);
    close(s);
    topics(s);
    expect(clearWaitTip(s)).toContain('町の長');
    const brand0 = s.brand ?? 0;
    const r = present(s);
    expect(typeof r).toBe('object');
    if (typeof r === 'string') return;
    expect(r.conquered).toBe(true);
    expect(s.cleared).toBe(true);
    expect(s.emblem).toBe(1);
    expect((s.brand ?? 0) - brand0).toBe(BRAND.sectorTop);
    expect(clearWaiting(s)).toBe(false);
    expect(presentAfter(null, 1, true)).toContain('制覇');
    // 次の月の締め：もう制覇しているので、エンブレムは増えない（守ったぶんのブランド力だけ）
    const r3 = close(s);
    expect(r3.emblem).toBeUndefined();
    expect(s.emblem).toBe(1);
    expect(r3.goal?.present).toBe(true);
  });

  it('発表のあとに 1 位を 2 か月続けても制覇（月の締めで）', () => {
    const s = town();
    topics(s);
    const r = present(s);
    expect(typeof r !== 'string' && r.conquered).toBe(false);
    expect(s.cleared).toBe(false);
    const r1 = close(s);
    expect(s.cleared).toBe(false);
    expect(clearCondText(r1.streak!, r1.goal)[0]).toBe('制覇の条件：1 位を 2 か月（いま 1 / 2）／研究成果の発表 ✔');
    const r2 = close(s);
    expect(s.cleared).toBe(true);
    expect(r2.emblem).toBe(1);
  });

  it('お題の無いセクタ（発掘場が無い）は、いままでどおり 1 位を 2 か月で制覇', () => {
    const s = town();
    s.dig = null;
    expect(clearGoal(s).present).toBe(true);
    const r1 = close(s);
    expect(r1.goal).toBeUndefined();
    close(s);
    expect(s.cleared).toBe(true);
  });

  it('古いセーブ：すでに制覇しているセクタは制覇のまま（発表していなくても）', () => {
    const s = town();
    s.cleared = true;
    s.topStreak = 3;
    const back = deserializeP1(serializeP1(s))!;
    expect(back.cleared).toBe(true);
    expect(back.presented).toEqual([]);
    expect(clearWaiting(back)).toBe(false);
    close(back);
    expect(back.cleared).toBe(true);
  });
});

describe('調査依頼状は Common の 2 つの町で', () => {
  it(`Common の発表を数える（いま 0 / ${LETTER_NEED} → 1 / ${LETTER_NEED}）。1 つ目では届かず、2 つ目で届く`, () => {
    const s = town();
    expect(letterProgress(s, 'U')).toEqual([0, LETTER_NEED]);
    expect(letterLock(s)).toBe('🔒 調査依頼状が要る（Common の 2 つの町で研究を発表しよう。いま 0 / 2）');
    topics(s);
    expect(lettersLeft(s)).toBe(1);
    expect(presentPages(s)[2].text).toBe('あと 1 つ、別の町でも研究を発表してくれ。そうしたら[[Uncommon の調査依頼状]]を書こう。');
    const r = present(s);
    expect(typeof r !== 'string' && r.letter).toBeNull();
    expect(letterProgress(s, 'U')).toEqual([1, LETTER_NEED]);
    expect(letterLock(s)).toContain('いま 1 / 2');
    // 1 つ目の町で発表したあと：「別の Common の町でも研究を発表しよう（いま 1 / 2）」の助言
    s.land = newLand('c1');
    expect(digTips(s).find((x) => x.key === 'letter-need')?.text).toContain('いま 1 / 2');
    // 2 つ目の町
    const s2 = town(6, 'c2');
    s2.presented = ['c1'];
    topics(s2);
    expect(lettersLeft(s2)).toBe(0);
    const r2 = present(s2);
    expect(typeof r2 !== 'string' && r2.letter).toBe('U');
    expect(letterProgress(s2, 'U')).toBeNull();
  });

  it('同じ町で 2 回は発表できない（数えるのは町の数）', () => {
    const s = town();
    topics(s);
    present(s);
    expect(present(s)).toBe('done');
    expect(s.presented).toEqual(['c1']);
    expect(s.letters).toEqual([]);
  });
});

describe('真似された復刻品のマインちゃんの一言', () => {
  it('独占が切れて他社が 2 社になった復刻品が棚にあるとき（販売管理へ）。1 社・独占中・棚に無いときは出ない', () => {
    const s = town(1, 'c2');
    const ext = DIG_SITES.c2.finds[0];
    const key = relicKey(ext);
    s.research[ext] = 99;
    openRelic(s, ext);
    const w = build(s, 'workshop', ...(tutSpot(s, 'workshop') ?? lotOf(s, 'workshop')));
    if (typeof w === 'string') throw new Error(w);
    const b = build(s, 'general_store', ...(tutSpot(s, 'general_store') ?? lotOf(s, 'general_store')));
    if (typeof b === 'string') throw new Error(b);
    for (let d = 0; d < 12; d++) step(s);
    expect(setShelf(s, b.uid, 0, `${key}:C`)).toBe(true);
    expect(relicCopied(s)).toBeNull();
    // 売った（独占が始まった）・まだ独占中
    s.recipes[key].sold = s.day;
    s.rivals[0].sells[key] = 1;
    s.rivals[1].sells[key] = 1;
    expect(relicCopied(s)).toBeNull();
    // 独占が切れた・他社 2 社
    s.day += DAYS * 5;
    expect(relicCopied(s)?.key).toBe(key);
    const tip = digTips(s).find((x) => x.key === 'copied');
    expect(tip?.tier).toBe('mid');
    expect(tip?.text).toBe(`「${relicCopied(s)!.name}」は他社に真似されて売れにくくなったよ。新しい復刻品か、ほかの商品に並べ替えよう！`);
    // 1 社だけなら出ない
    s.rivals[1].sells[key] = 0;
    expect(relicCopied(s)).toBeNull();
    s.rivals[1].sells[key] = 1;
    // 棚から外したら出ない
    expect(setShelf(s, b.uid, 0, null)).toBe(true);
    expect(relicCopied(s)).toBeNull();
  });
});

describe('自動プレイの品ぞろえ（毎月の締めで見直す）', () => {
  it('並べ替えは「売れる見込み × 粗利」の大きい順。真似されて見込みが落ちた商品は下がる', () => {
    const a = { x: 'A:C' as const, units: 30, margin: 900 };
    const b = { x: 'B:C' as const, units: 12, margin: 1400 };
    expect(rankLineup([b, a]).map((o) => o.x)).toEqual(['A:C', 'B:C']);
    // 真似されて売れる見込みが 30 → 10 に落ちた A は B より下へ
    expect(rankLineup([{ ...a, units: 10 }, b]).map((o) => o.x)).toEqual(['B:C', 'A:C']);
    expect(lineupScore({ units: 10, margin: 900 })).toBe(9000);
  });
});
