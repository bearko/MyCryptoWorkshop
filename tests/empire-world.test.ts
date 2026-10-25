// フェーズ 4 世界展開（M10 その 3）
import { describe, expect, it } from 'vitest';
import { restoreEmpire, type EmpireState } from '../src/empire/model';
import { nationStores } from '../src/empire/nation';
import { advanceMonth, canPromote } from '../src/empire/sim';
import { ENTRY, entryCost, foreignShare, newWorld, phase4Done, routeCost } from '../src/empire/world';
import { newSave } from '../src/game/save';
import { testActions } from '../src/ui/testPanel';

/** フェーズ 4 に入ったところ（Lime が本拠） */
function phase4(): EmpireState {
  const save = { ...newSave(), prestige: { ...newSave().prestige, home: 'Lime' } };
  let e = advanceMonth(testActions.jumpPhase3(save, 3).empire as EmpireState).state;
  e = { ...e, court: { attention: 100, stage: 2, invited: false, audience: true, privileges: ['housing'] } };
  expect(canPromote(e)).toBe(true);
  return { ...advanceMonth(e, { promote: true }).state, funds: 2e10 };
}

describe('フェーズ 4 へ', () => {
  it('謁見のあと次の格へ上がると、世界が開く。本拠のほかの 8 ランドでは、ほかの会社が開拓を進めている', () => {
    const e = phase4();
    expect(e.phase).toBe(4);
    expect(e.world).toBeDefined();
    expect(Object.keys(e.world!.others)).toHaveLength(8);
    const later = advanceMonth(advanceMonth(e).state).state;
    expect(later.world!.others.Ocean).toBeGreaterThan(e.world!.others.Ocean);
  });
});

describe('ほかのランドへ渡る', () => {
  it('直営は 0 店から、Common の最初のエリアだけで小さく始める', () => {
    const e = phase4();
    const r = advanceMonth(e, { enter: { land: 'Strawberry', mode: 'direct' } });
    const b = r.state.world!.branches[0];
    expect(b.land).toBe('Strawberry');
    expect(nationStores(b.nation)).toBe(0);
    expect(b.nation.regions).toHaveLength(11);
    expect(r.report.notes.some((n) => n.kind === 'entered')).toBe(true);
    expect(r.state.funds).toBeLessThan(e.funds - routeCost(e) + r.report.profit + 1);
  });

  it('合弁は最初から 8 店、利益は半分ずつ。買収は統合までのあいだ客足が落ちる', () => {
    const jv = advanceMonth(phase4(), { enter: { land: 'Ocean', mode: 'jv' } }).state.world!.branches[0];
    expect(nationStores(jv.nation)).toBe(ENTRY.jvStores);
    expect(jv.stake).toBe(ENTRY.jvStake);
    const acq = advanceMonth(phase4(), { enter: { land: 'Ocean', mode: 'acquire' } }).state.world!.branches[0];
    expect(nationStores(acq.nation)).toBe(ENTRY.acquireStores);
    expect(acq.integrateUntil).toBeGreaterThan(acq.opened);
    expect(entryCost('acquire')).toBeGreaterThan(entryCost('jv'));
  });

  it('渡ったランドの売上は、本拠の外の売上として会社の売上に足される', () => {
    let e = advanceMonth(phase4(), { enter: { land: 'Ocean', mode: 'jv' } }).state;
    for (let i = 0; i < 12; i++) e = advanceMonth(e).state;
    expect(e.history.at(-1)!.foreignRevenue).toBeGreaterThan(0);
    expect(foreignShare(e)).toBeGreaterThan(0);
  });

  it('ライセンスの提携先は 30 か月で独立を言い出し、買い取らなければ店ごとライバルになる', () => {
    let e = advanceMonth(phase4(), { enter: { land: 'Tangerine', mode: 'license' } }).state;
    const notes: string[] = [];
    for (let i = 0; i < ENTRY.licenseBreak + 1; i++) {
      const r = advanceMonth(e);
      e = r.state;
      notes.push(...r.report.notes.map((n) => n.kind));
    }
    expect(notes).toContain('licenseWarning');
    expect(notes).toContain('licenseBroke');
    expect(e.world!.branches[0].partner).toBe(0);
  });

  it('撤退すると店を売り、現地化の知見が残る', () => {
    let e = advanceMonth(phase4(), { enter: { land: 'Ocean', mode: 'jv' } }).state;
    e = advanceMonth(e, { branches: { Ocean: { exit: true } } }).state;
    expect(e.world!.branches).toHaveLength(0);
    expect(e.world!.knowhow.Ocean).toBeGreaterThan(0);
  });
});

describe('フェーズ 4 の卒業', () => {
  it('本拠の外の 2 ランドで謁見が成り、本拠の外の売上が 3 割', () => {
    let e = phase4();
    e = advanceMonth(e, { enter: { land: 'Ocean', mode: 'jv' } }).state;
    e = advanceMonth(e, { enter: { land: 'Strawberry', mode: 'jv' } }).state;
    expect(phase4Done(e)).toBe(false);
    for (const b of e.world!.branches) b.court = { ...b.court, audience: true };
    e = { ...e, history: e.history.map((r) => ({ ...r, foreignRevenue: r.revenue * 0.4 })) };
    expect(phase4Done(e)).toBe(true);
  });
});

describe('セーブ', () => {
  it('世界と渡ったランドは保存して読み直せる', () => {
    const e = advanceMonth(phase4(), { enter: { land: 'Ocean', mode: 'jv' } }).state;
    expect(restoreEmpire(JSON.parse(JSON.stringify(e)))!.world).toEqual(e.world);
  });

  it('新しい世界は、本拠を除く 8 ランド', () => {
    expect(Object.keys(newWorld('Ocean').others)).not.toContain('Ocean');
  });
});
