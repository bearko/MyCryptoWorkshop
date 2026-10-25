// ランドの個性（M10a）：文化と品ぞろえ、ライバルの入り方、地図の地形
import { describe, expect, it } from 'vitest';
import { newEmpire, restoreEmpire, type EmpireState } from '../src/empire/model';
import { bestFocus, FOUNDING_LANDS, LAND_PROFILES, landProfile } from '../src/empire/lands';
import { advanceMonth, focusChangeCost } from '../src/empire/sim';
import { newSave } from '../src/game/save';
import { testActions } from '../src/ui/testPanel';
import { foundingTown, townGrid } from '../src/ui/empire/maps';

describe('ランドの文化と品ぞろえ', () => {
  it('創業できる 4 ランドは、いちばん当たる品ぞろえがみな違う', () => {
    const best = FOUNDING_LANDS.map(bestFocus);
    expect(best).toEqual(['imports', 'sweets', 'luxury', 'leisure']);
  });

  it('文化に合う品ぞろえだと、同じ店でも売上が伸びる', () => {
    const a = advanceMonth(newEmpire('テスト', 3, 'Strawberry', 'sweets')).report.revenue;
    const b = advanceMonth(newEmpire('テスト', 3, 'Strawberry', 'imports')).report.revenue;
    expect(a).toBeGreaterThan(b * 1.2);
  });

  it('知らないランド（古いセーブ）は、どの品ぞろえも 1 倍', () => {
    expect(Object.values(landProfile('Ruby').fit).every((v) => v === 1)).toBe(true);
  });

  it('品ぞろえはフェーズ 1 なら無料、フェーズ 2 からは店の数だけ費用がかかる', () => {
    const e = newEmpire('テスト', 1, 'Lime');
    expect(focusChangeCost(e)).toBe(0);
    const next = advanceMonth(e, { focus: 'leisure' }).state;
    expect(next.focus).toBe('leisure');
    const p2 = testActions.jumpPhase2(newSave(), 3).empire as EmpireState;
    expect(focusChangeCost(p2)).toBeGreaterThan(0);
    const after = advanceMonth({ ...p2, funds: 1e9 }, { focus: 'luxury' });
    expect(after.state.funds).toBeLessThan(1e9 + after.report.profit);
  });

  it('品ぞろえは保存して読み直せる', () => {
    const e = newEmpire('テスト', 1, 'Tangerine', 'luxury');
    expect(restoreEmpire(JSON.parse(JSON.stringify(e)))!.focus).toBe('luxury');
  });
});

describe('ライバルの入り方', () => {
  it('Tangerine はまだどこの会社も入っておらず、エリアの町にライバルがいない', () => {
    const save = { ...newSave(), prestige: { ...newSave().prestige, home: 'Tangerine' } };
    const e = testActions.jumpPhase2(save, 3).empire as EmpireState;
    expect(e.land).toBe('Tangerine');
    expect(e.area!.rivalStores).toHaveLength(0);
    expect(e.area!.rivalPlan!.month).toBeGreaterThanOrEqual(LAND_PROFILES.Tangerine.rivalFrom);
  });
});

describe('地図の地形', () => {
  it('海上都市の町は海に囲まれ、守り神と特産品の店がある', () => {
    const e = newEmpire('テスト', 1, 'Ocean');
    const a = foundingTown(e);
    const g = townGrid(a, { own: [], rival: [], centers: [], targetKind: () => null, land: landProfile('Ocean') });
    expect(g.surround).toBe('sea');
    const exts = g.cells.map((c) => c.ext ?? 0);
    expect(exts.some((x) => x % 1000 === LAND_PROFILES.Ocean.guardian.series)).toBe(true);
    expect(exts.filter((x) => x % 1000 === LAND_PROFILES.Ocean.specialty.series)).toHaveLength(2);
  });

  it('ほかのランドは森に囲まれる', () => {
    const e = newEmpire('テスト', 1, 'Lime');
    const g = townGrid(foundingTown(e), { own: [], rival: [], centers: [], targetKind: () => null, land: landProfile('Lime') });
    expect(g.surround).toBe('woods');
  });
});

describe('フェーズ 4 から渡れる 4 ランド', () => {
  it('Graphite・Grape・Sage・Blueberry にも文化・特産品・守り神・キングがあり、創業では選べない', async () => {
    const { LATER_LANDS, FOUNDING_LANDS: F } = await import('../src/empire/lands');
    const { KINGS } = await import('../src/empire/court');
    const { OPEN_LANDS } = await import('../src/empire/world');
    for (const k of LATER_LANDS) {
      const p = landProfile(k);
      expect(p.key).toBe(k);
      expect(p.lines).toHaveLength(3);
      expect(Object.values(p.fit).some((v) => v !== 1)).toBe(true);
      expect(KINGS[k]).toBeTruthy();
      expect(F).not.toContain(k);
      expect(OPEN_LANDS).toContain(k);
    }
    expect(OPEN_LANDS).not.toContain('Ruby');
    // 守り神：象・蛇・牛・犬
    expect(LATER_LANDS.map((k) => landProfile(k).guardian.series)).toEqual([24, 26, 23, 27]);
  });
});
