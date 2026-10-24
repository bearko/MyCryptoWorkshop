// ステークホルダーの統治（M8）：支持度・期限つきの要望・最後通告
import { describe, expect, it } from 'vitest';
import { newEmpire, restoreEmpire, type EmpireState, type MonthReport, type Note } from '../src/empire/model';
import { advanceMonth } from '../src/empire/sim';
import { activeStakeholders, newStake, stakeMods, stakeStep, SUPPORT, ULTIMATUM } from '../src/empire/stakeholders';

const report = (e: EmpireState, notes: Note[]): MonthReport => ({ month: e.month, revenue: 0, inflow: 0, profit: 1, funds: e.funds, stores: [], notes });

/** 同じ出来事が続く月を n か月まわす（報告を返す） */
function months(e: EmpireState, n: number, notes: () => Note[]): MonthReport[] {
  const out: MonthReport[] = [];
  for (let i = 0; i < n; i++) {
    const r = report(e, notes());
    e.history = [...e.history, r];
    stakeStep(e, r, { renovated: 0 });
    out.push(r);
    e.month++;
  }
  return out;
}

describe('支持度', () => {
  it('フェーズ 1 は常連客と問屋だけ、フェーズ 3 で 6 者そろう', () => {
    expect(activeStakeholders({ phase: 1 }).map((s) => s.id)).toEqual(['regulars', 'wholesaler']);
    expect(activeStakeholders({ phase: 3 })).toHaveLength(6);
  });

  it('廃棄が続くと問屋の支持度が下がり、40 を割った月に期限つきの要望が出る', () => {
    const e = newEmpire('テスト', 1);
    const rs = months(e, 6, () => [{ kind: 'waste', store: 1 }]);
    const at = rs.findIndex((r) => r.notes.some((n) => n.kind === 'demand' && n.who === 'wholesaler'));
    expect(at).toBeGreaterThan(0);
    const note = rs[at].notes.find((n) => n.kind === 'demand')!;
    expect(note.kind === 'demand' && note.due).toBe(at + SUPPORT.dueMonths);
    expect(e.stake!.support.wholesaler).toBeLessThan(SUPPORT.demandBelow);
  });

  it('期限までに戻せないと最後通告になり、原価が上がる重しがかかる', () => {
    const e = newEmpire('テスト', 1);
    let m = -1;
    for (let i = 0; i < 12 && m < 0; i++) {
      const [r] = months(e, 1, () => [{ kind: 'waste', store: 1 }]);
      if (r.notes.some((n) => n.kind === 'ultimatum')) m = r.month;
    }
    expect(m).toBeGreaterThan(0);
    expect(stakeMods({ stake: e.stake, month: m + 1 }).costRate).toBe(ULTIMATUM.wholesaler.costRate);
    expect(stakeMods({ stake: e.stake, month: m + 1 + ULTIMATUM.wholesaler.months }).costRate).toBe(0);
  });

  it('不満の出来事が止まれば戻っていき、要望は取り下げられる', () => {
    const e = newEmpire('テスト', 1);
    let bad = true;
    // 要望が出た次の月から発注をしぼる（廃棄が止まる）
    const rs = months(e, 12, () => {
      if (e.stake?.demands.length) bad = false;
      return bad ? [{ kind: 'waste', store: 1 }] : [];
    });
    expect(rs.some((r) => r.notes.some((n) => n.kind === 'demandMet' && n.who === 'wholesaler'))).toBe(true);
    expect(rs.some((r) => r.notes.some((n) => n.kind === 'ultimatum'))).toBe(false);
    expect(e.stake!.demands).toHaveLength(0);
  });

  it('改装すると常連客が喜ぶ（ふだんの値より上がる）', () => {
    const e = newEmpire('テスト', 1);
    const r = report(e, []);
    e.history = [r];
    stakeStep(e, r, { renovated: 2 });
    expect(e.stake!.support.regulars).toBeGreaterThan(SUPPORT.rest);
  });
});

describe('月の計算への重し', () => {
  it('問屋の最後通告のあいだは、同じ決定でも利益が下がる', () => {
    const e = { ...newEmpire('テスト', 3), stake: newStake() };
    const base = advanceMonth(e).report.profit;
    const hit = advanceMonth({ ...e, stake: { ...newStake(), penalties: [{ who: 'wholesaler', until: e.month + 1 }] } }).report.profit;
    expect(hit).toBeLessThan(base);
  });

  it('常連客の最後通告は売上を 1 割落とす', () => {
    const e = { ...newEmpire('テスト', 3), stake: newStake() };
    const base = advanceMonth(e).report.revenue;
    const hit = advanceMonth({ ...e, stake: { ...newStake(), penalties: [{ who: 'regulars', until: e.month + 1 }] } }).report.revenue;
    expect(hit).toBeLessThan(base * 0.95);
  });
});

describe('セーブ', () => {
  it('支持度のない古いセーブも読め、最初の月に作られる', () => {
    const old = JSON.parse(JSON.stringify(newEmpire('テスト', 1)));
    delete old.stake;
    const e = restoreEmpire(old)!;
    expect(e.stake).toBeUndefined();
    const next = advanceMonth(e).state;
    expect(next.stake?.support.regulars).toBeDefined();
  });

  it('要望と重しは保存して読み直せる', () => {
    const e = newEmpire('テスト', 1);
    e.stake = { ...newStake(), demands: [{ who: 'wholesaler', since: 2, due: 5 }], penalties: [{ who: 'regulars', until: 9 }] };
    const back = restoreEmpire(JSON.parse(JSON.stringify(e)))!;
    expect(back.stake!.demands).toEqual([{ who: 'wholesaler', since: 2, due: 5 }]);
    expect(back.stake!.penalties).toEqual([{ who: 'regulars', until: 9 }]);
  });
});
