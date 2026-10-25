// 危機（M10 その 5）：予兆のあとに起きる・備えで下がる・セーブ
import { describe, expect, it } from 'vitest';
import { restoreEmpire, type EmpireState, type Note } from '../src/empire/model';
import { advanceMonth } from '../src/empire/sim';
import { CRISIS, crisisMods, crisisStep, diversifyCost, inspectCost, newCrisis } from '../src/empire/crisis';
import { newTable } from '../src/empire/business';
import { newSave } from '../src/game/save';
import { testActions } from '../src/ui/testPanel';

const phase3 = () => testActions.jumpPhase3(newSave(), 3).empire as EmpireState;
const step = (e: EmpireState, opened = 0) => {
  const notes: Note[] = [];
  crisisStep(e, opened, notes);
  return notes.map((n) => ('crisis' in n ? `${n.kind}:${n.crisis}` : n.kind));
};

describe('危機は予兆のあとに起きる', () => {
  it('品質が崩れると食の事故のおそれが積もり、70 で予兆、100 で起きる。起きるとブランドに傷・常連客が離れ・客足が落ちる', () => {
    const e = phase3();
    e.crisis = newCrisis();
    e.nation!.quality = 0.75;
    const seen: string[] = [];
    for (let i = 0; i < 12 && !seen.includes('crisis:food'); i++) seen.push(...step(e));
    expect(seen.indexOf('crisisSign:food')).toBeGreaterThanOrEqual(0);
    expect(seen.indexOf('crisis:food')).toBeGreaterThan(seen.indexOf('crisisSign:food'));
    expect(e.crisis.meters.food).toBe(CRISIS.food.after);
    expect(crisisMods(e).demand).toBe(CRISIS.food.demand);
  });
  it('予兆の線を一気に越えても、その月は予兆で止まる', () => {
    const e = phase3();
    e.crisis = { ...newCrisis(), meters: { food: 65, supply: 0, overgrow: 0 } };
    e.nation!.quality = 0.6;
    expect(step(e)).toContain('crisisSign:food');
    expect(e.crisis.meters.food).toBe(CRISIS.strike - 1);
    expect(step(e)).toContain('crisis:food');
  });
  it('仕入れ先が偏っていると供給ショックのおそれが毎月積もる。製造・交易のカードで積もりにくい', () => {
    const e = phase3();
    e.crisis = newCrisis();
    step(e);
    expect(e.crisis.meters.supply).toBe(CRISIS.supply.monthly);
    const t = newTable();
    t[1] = 'factory';
    t[3] = 'trade';
    e.group = { table: t, legend: {}, nextAuction: 99, auctions: 0, since: 0, ended: null };
    step(e);
    expect(e.crisis.meters.supply).toBeCloseTo(CRISIS.supply.monthly * 2 - CRISIS.supply.card * 2);
  });
  it('拡大しすぎが起きると、品質とオーナーの満足度が落ちる', () => {
    const e = phase3();
    e.crisis = { ...newCrisis(), meters: { food: 0, supply: 0, overgrow: 99 }, warned: { food: false, supply: false, overgrow: true } };
    e.nation!.quality = 0.8;
    const q = e.nation!.quality;
    const s = e.nation!.satisfaction;
    expect(step(e)).toContain('crisis:overgrow');
    expect(e.nation!.quality).toBeLessThan(q);
    expect(e.nation!.satisfaction).toBeLessThan(s);
  });
});

describe('備え', () => {
  it('品質点検で食の事故のおそれが下がり、仕入れ先を分けると供給ショックが下がって 2 年は積もりにくい', () => {
    let e = { ...phase3(), funds: 1e10 };
    e.crisis = { ...newCrisis(), meters: { food: 80, supply: 80, overgrow: 0 } };
    const funds = e.funds;
    const cost = inspectCost(e) + diversifyCost(e);
    e = advanceMonth(e, { inspect: true, diversify: true }).state;
    expect(e.crisis!.meters.food).toBeLessThan(80 - CRISIS.food.inspectDrop + 10);
    expect(e.crisis!.meters.supply).toBeLessThan(80 - CRISIS.supply.diversifyDrop + 10);
    expect(e.crisis!.diversifiedUntil).toBeGreaterThan(e.month + 20);
    expect(funds - e.funds).toBeGreaterThan(cost * 0.5);
  });
  it('セーブして読み直せる', () => {
    const e = advanceMonth(phase3()).state;
    e.crisis!.effects.push({ id: 'supply', until: e.month + 3 });
    const back = restoreEmpire(JSON.parse(JSON.stringify(e)))!;
    expect(back.crisis).toEqual(e.crisis);
  });
});
