// M&A（M10 その 5 の後半）：ライバル会社の株を集めて傘下に、統合と減損、買収の防衛
import { describe, expect, it } from 'vitest';
import { restoreEmpire, type EmpireState } from '../src/empire/model';
import { advanceMonth } from '../src/empire/sim';
import { combinedShare, MNA, RAID, stepPrice, tobCheck, tobPrice, controlled, dividendOf } from '../src/empire/mna';
import { REGULATION, FISCAL_MONTH } from '../src/empire/crowns';
import { newSave } from '../src/game/save';
import { testActions } from '../src/ui/testPanel';

const phase4 = () => ({ ...(testActions.jumpPhase4(newSave(), 3).empire as EmpireState), funds: 1e12 });
/** 渡ったばかりで小さいランド（規制にかからない） */
const withBranch = () => {
  const e = phase4();
  const land = e.land === 'Lime' ? 'Strawberry' : 'Lime';
  return { e: advanceMonth(e, { enter: { land, mode: 'direct' } }).state, land };
};
const notesOf = (r: ReturnType<typeof advanceMonth>) => r.report.notes.map((n) => n.kind);

describe('ライバル会社の株を集める', () => {
  it('市場で月に 5% ずつ。5% で大量保有の報告が出て、そのあとは株価が上がる。市場で買えるのは 30% まで', () => {
    let { e, land } = withBranch();
    const p0 = stepPrice(e, land);
    const r = advanceMonth(e, { mna: { buy: [land] } });
    expect(notesOf(r)).toContain('mnaDisclosed');
    e = r.state;
    expect(e.mna!.holdings[land].stake).toBe(MNA.step);
    expect(stepPrice(e, land)).toBeGreaterThan(p0);
    for (let i = 0; i < 10; i++) e = advanceMonth(e, { mna: { buy: [land] } }).state;
    expect(e.mna!.holdings[land].stake).toBe(MNA.marketCap);
  });
  it('公開買付け：上乗せが 3 割に届かなければ大陸ホールディングスに競り負け、届けば過半数で傘下になる', () => {
    const { e, land } = withBranch();
    expect(combinedShare(e, land)).toBeLessThan(REGULATION.breakup);
    expect(tobCheck(e, land, 0.2)).toMatchObject({ ok: false, reason: 'outbid' });
    const before = e.funds;
    const r = advanceMonth(e, { mna: { tob: { land, premium: 0.4 } } });
    expect(notesOf(r)).toContain('tobDone');
    expect(controlled(r.state, land)).toBe(true);
    expect(before - r.state.funds).toBeGreaterThan(tobPrice(e, land, 0.4) * 0.9);
    // 傘下の会社から配当が入る
    expect(dividendOf(r.state, land)).toBeGreaterThan(0);
  });
  it('本拠のようにシェアの大きいランドでは、当局が公開買付けを認めない', () => {
    const e = phase4();
    for (const r of e.nation!.regions) if (!r.locked) r.direct = Math.round(r.capacity * 0.6);
    expect(combinedShare(e, e.land)).toBeGreaterThanOrEqual(REGULATION.breakup);
    expect(tobCheck(e, e.land, 0.4)).toMatchObject({ ok: false, reason: 'regulation' });
  });
  it('傘下にしたライバルは出店しない。統合が足りないまま決算を迎えると減損', () => {
    let { e, land } = withBranch();
    e = advanceMonth(e, { mna: { tob: { land, premium: 0.4 } } }).state;
    const n = e.world!.branches.find((b) => b.land === land)!.nation;
    const rivals = n.regions.reduce((a, r) => a + r.rival, 0);
    let impaired = false;
    for (let i = 0; i < 14; i++) {
      const r = advanceMonth(e);
      impaired ||= r.report.notes.some((x) => x.kind === 'impairment');
      e = r.state;
    }
    expect(e.world!.branches.find((b) => b.land === land)!.nation.regions.reduce((a, r) => a + r.rival, 0)).toBe(rivals);
    expect(impaired).toBe(true);
    // 統合の費用を払い続けると、統合が済む
    for (let i = 0; i < 10; i++) e = advanceMonth(e, { mna: { pmi: [land] } }).state;
    expect(e.mna!.holdings[land].integration).toBe(100);
  });
});

describe('買収の防衛', () => {
  const listed5 = () => {
    const e = testActions.jumpPhase5(newSave(), 3).empire as EmpireState;
    e.nation!.listed = true;
    e.nation!.ownership = 0.75;
    e.group!.since = e.month - RAID.after;
    return { ...e, funds: 1e11 };
  };
  it('上場していると大陸ホールディングスが買い集め、30% で公開買付けを予告する', () => {
    let e = listed5();
    const kinds: string[] = [];
    for (let i = 0; i < 8; i++) {
      const r = advanceMonth(e);
      kinds.push(...r.report.notes.map((n) => n.kind));
      e = r.state;
    }
    expect(kinds).toContain('raidDisclosed');
    expect(kinds).toContain('raidTob');
    expect(e.mna!.raid?.tobAt).not.toBeNull();
  });
  it('防衛策がなければ席と資金と事業を失い、安定株主なら退けられる', () => {
    const run = (defense?: 'stable') => {
      let e = listed5();
      let won: boolean | null = null;
      for (let i = 0; i < 14 && won === null; i++) {
        const r = advanceMonth(e, defense && e.mna?.raid?.tobAt != null ? { mna: { defense } } : {});
        const over = r.report.notes.find((n) => n.kind === 'raidOver');
        if (over && 'won' in over) won = over.won;
        e = r.state;
      }
      return won;
    };
    expect(run()).toBe(false);
    expect(run('stable')).toBe(true);
  });
  it('セーブして読み直せる', () => {
    let e = listed5();
    for (let i = 0; i < 3; i++) e = advanceMonth(e).state;
    const back = restoreEmpire(JSON.parse(JSON.stringify(e)))!;
    expect(back.mna).toEqual(e.mna);
    expect(FISCAL_MONTH).toBeGreaterThanOrEqual(0);
  });
});
