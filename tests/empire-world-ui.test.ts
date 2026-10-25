// 世界展開の画面の、DOM に触れない部分：稟議・渡ったランドの見立て・テスト用の飛び先（M10 その 3）
import { describe, expect, it } from 'vitest';
import type { EmpireState } from '../src/empire/model';
import { advanceMonth, type Decisions } from '../src/empire/sim';
import { HUB_COST, OPEN_COSTS, TRAINING_COST } from '../src/empire/nation';
import { branchDecisionCost, branchOf, ENTRY, entryCost, exitValue, routeCost } from '../src/empire/world';
import { newSave } from '../src/game/save';
import { testActions } from '../src/ui/testPanel';
import { reserved, ringiItems, type Ctx } from '../src/ui/empire/cards';
import { branchCtx, branchLens, isleStatus } from '../src/ui/empire/worldui';

const phase4 = () => testActions.jumpPhase4(newSave(), 3).empire as EmpireState;
const withBranch = (mode: 'direct' | 'jv' | 'license' | 'acquire' = 'jv') => {
  const e = phase4();
  const land = e.land === 'Strawberry' ? 'Lime' : 'Strawberry';
  return { e: advanceMonth(e, { enter: { land, mode } }).state, land };
};

describe('テスト用の飛び先', () => {
  it('フェーズ 4 へ飛ぶと、本拠のキングとの謁見が済み、世界が開いている', () => {
    const e = phase4();
    expect(e.phase).toBe(4);
    expect(e.court?.audience).toBe(true);
    expect(e.world?.branches).toEqual([]);
    expect(isleStatus(e, e.land)).toBe('home');
    expect(isleStatus(e, 'Graphite')).toBe('open');
    expect(isleStatus(e, 'Ruby')).toBe('closed');
  });
});

describe('稟議', () => {
  it('渡る費用は、航路と参入方式の費用の合計', () => {
    const e = phase4();
    const d: Decisions = { enter: { land: 'Lime', mode: 'acquire' } };
    expect(reserved(e, d)).toBe(routeCost(e) + entryCost('acquire'));
    expect(ringiItems(e, d).map((x) => x.label).join()).toContain('Lime');
  });
  it('渡ったランドの出店・物流拠点・研修所・現地化を数え、撤退は戻るお金として引く', () => {
    const { e, land } = withBranch();
    const b = branchOf(e, land)!;
    const bd = { expand: [{ region: 0, type: 'direct' as const, count: 2 }], buildHub: [1], training: 1, localize: true };
    const want = 2 * OPEN_COSTS.direct + HUB_COST + TRAINING_COST + ENTRY.localizeCost;
    expect(branchDecisionCost(e, land, bd)).toBe(want);
    expect(reserved(e, { branches: { [land]: bd } })).toBe(want);
    expect(ringiItems(e, { branches: { [land]: bd } })).toHaveLength(4);
    expect(reserved(e, { branches: { [land]: { exit: true } } })).toBe(-exitValue(b));
    // 稟議から 1 つ取り消すと、そのランドのほかの決定は残る
    const items = ringiItems(e, { branches: { [land]: bd } });
    const after = items[0].cancel({ branches: { [land]: bd } });
    expect(after.branches?.[land]?.expand).toEqual([]);
    expect(after.branches?.[land]?.training).toBe(1);
  });
});

describe('渡ったランドの見立て', () => {
  it('渡ったランドを、本拠と同じ形の会社に見立てる（本拠は書き換えない）', () => {
    const { e, land } = withBranch();
    const v = branchLens(e, branchOf(e, land)!);
    expect(v.land).toBe(land);
    expect(v.nation!.regions[0].direct).toBe(ENTRY.jvStores);
    expect(v.nation!.eraStrict).toBe(false);
    expect(v.crowns).toBeUndefined();
    expect(e.land).not.toBe(land);
  });
  it('見立ての下書きは、Decisions.branches のそのランドに書き戻る', () => {
    const { e, land } = withBranch();
    let draft: Decisions = { branches: { [land]: { localize: true } } };
    const base: Ctx = { e, draft, last: null, set: (fn) => (draft = fn(draft)), fundsLeft: () => e.funds, heroName: () => '' };
    const c = branchCtx(base, branchOf(e, land)!);
    c.set((d) => ({ ...d, expand: [{ region: 0, type: 'direct', count: 1 }], training: 2 }));
    expect(draft.branches?.[land]).toMatchObject({ localize: true, training: 2, expand: [{ region: 0, type: 'direct', count: 1 }] });
    expect(draft.expand).toBeUndefined();
  });
  it('渡ったランドの謁見と注目の知らせには、そのランドが付く', () => {
    let { e, land } = withBranch();
    e = { ...e, world: { ...e.world!, branches: e.world!.branches.map((b) => ({ ...b, court: { ...b.court, attention: 100, stage: 2, invited: true } })) } };
    const r = advanceMonth(e, { branches: { [land]: { offering: 'gold' } } });
    const n = r.report.notes.find((x) => x.kind === 'audience');
    expect(n && 'land' in n ? n.land : null).toBe(land);
  });
});
