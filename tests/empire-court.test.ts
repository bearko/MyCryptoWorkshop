// 政府の注目とキングとの謁見（M10 その 2）
import { describe, expect, it } from 'vitest';
import { restoreEmpire, type EmpireState } from '../src/empire/model';
import { advanceMonth, canPromote } from '../src/empire/sim';
import { ATTENTION, KINGS, kingFit, PRIVILEGE } from '../src/empire/court';
import { newSave } from '../src/game/save';
import { testActions } from '../src/ui/testPanel';

const phase3 = (land = 'Ocean') => {
  const save = { ...newSave(), prestige: { ...newSave().prestige, home: land } };
  return advanceMonth(testActions.jumpPhase3(save, 3).empire as EmpireState).state;
};
const invited = (land = 'Ocean') => {
  const e = phase3(land);
  return { ...e, court: { attention: 100, stage: 2, invited: true, audience: false, privileges: [] } } as EmpireState;
};

describe('政府の注目度', () => {
  it('フェーズ 3 に入ると毎月貯まり、30 と 60 で知らせが出る', () => {
    let e = phase3();
    expect(e.court).toBeDefined();
    const notes: string[] = [];
    for (let i = 0; i < 40 && (e.court?.stage ?? 0) < 2; i++) {
      const r = advanceMonth(e);
      e = r.state;
      notes.push(...r.report.notes.filter((n) => n.kind === 'attention').map((n) => n.kind));
    }
    expect(notes).toHaveLength(2);
    expect(e.court!.attention).toBeGreaterThanOrEqual(ATTENTION.stages[1]);
  });

  it('魔王（Strawberry）はスイーツを喜び、よその特産品を嫌う', () => {
    const e = phase3('Strawberry');
    expect(kingFit({ ...e, focus: 'sweets' })).toBe(1);
    expect(kingFit({ ...e, focus: 'imports' })).toBe(0);
  });

  it('虎王（Tangerine）は役員会の英雄を見る', () => {
    const e = phase3('Tangerine');
    const none = kingFit(e);
    const two = kingFit({ ...e, gov: { ...e.gov!, board: [{ id: 1, kind: 'sales', power: 1 }, { id: 2, kind: 'luck', power: 1 }] } });
    expect(two).toBeGreaterThan(none);
  });
});

describe('キングとの謁見', () => {
  it('好みの品を献上すると謁見が成り、特権を授かってフェーズ 3 を卒業できる', () => {
    const e = invited('Lime');
    const r = advanceMonth(e, { offering: KINGS.Lime.likes });
    expect(r.state.court!.audience).toBe(true);
    expect(r.state.court!.privileges).toContain('housing');
    expect(canPromote(r.state)).toBe(true);
  });

  it('好みに合わない品で、商いもキングの好みに合っていなければ、注目度が下がる', () => {
    const e = { ...invited('Strawberry'), focus: 'imports' as const };
    const r = advanceMonth(e, { offering: 'wine' });
    expect(r.state.court!.audience).toBe(false);
    expect(r.state.court!.attention).toBeLessThan(100);
    expect(canPromote(r.state)).toBe(false);
  });

  it('地下の開拓（Strawberry）でエリアが 1 つ増え、御用商人（Tangerine）で出資が入る', () => {
    const s = advanceMonth(invited('Strawberry'), { offering: 'sweets' }).state;
    expect(s.nation!.regions).toHaveLength(12);
    const before = invited('Tangerine');
    const t2 = advanceMonth(before, { offering: 'talent' });
    expect(t2.state.funds).toBeGreaterThan(before.funds + t2.report.profit + PRIVILEGE.purveyorGrant * 0.9);
  });

  it('注目度と特権は保存して読み直せる', () => {
    const s = advanceMonth(invited('Ocean'), { offering: 'pledge' }).state;
    expect(restoreEmpire(JSON.parse(JSON.stringify(s)))!.court).toEqual(s.court);
  });
});

describe('フェーズ 4 から渡れるランドのキング', () => {
  it('Grape の魚王はアイスを好み、謁見が成ると G9 の口添えで、ほかのキングの注目が上がる', async () => {
    const { newSave } = await import('../src/game/save');
    const { testActions } = await import('../src/ui/testPanel');
    let e = testActions.jumpPhase4(newSave(), 3).empire as EmpireState;
    e = { ...e, funds: 1e11 };
    const other = e.land === 'Lime' ? 'Sage' : 'Lime';
    e = advanceMonth(e, { enter: { land: 'Grape', mode: 'jv' } }).state;
    e = advanceMonth(e, { enter: { land: other, mode: 'jv' } }).state;
    const grape = e.world!.branches.find((b) => b.land === 'Grape')!;
    grape.court = { ...grape.court, attention: 100, stage: 2, invited: true };
    const before = e.world!.branches.find((b) => b.land === other)!.court.attention;
    expect(KINGS.Grape.likes).toBe('ice');
    const r = advanceMonth(e, { branches: { Grape: { offering: 'ice' } } });
    const g = r.state.world!.branches.find((b) => b.land === 'Grape')!;
    expect(g.court.audience).toBe(true);
    expect(g.court.privileges).toContain('g9');
    expect(r.state.world!.branches.find((b) => b.land === other)!.court.attention).toBeGreaterThanOrEqual(before + 20);
  });
});
