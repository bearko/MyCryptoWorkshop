// Ruby（流星街）：掲示板で団員とのつながりを作ってから入国、団長の情報網
import { describe, expect, it } from 'vitest';
import type { EmpireState } from '../src/empire/model';
import { advanceMonth } from '../src/empire/sim';
import { canEnter, RUBY, rubyOpen } from '../src/empire/world';
import { hasNetwork, rivalBid } from '../src/empire/group';
import { ENDING_CROWNS } from '../src/empire/group';
import { newSave } from '../src/game/save';
import { testActions } from '../src/ui/testPanel';

describe('Ruby', () => {
  it('ふだんは入国できず、掲示板に 5 回書き込んで団員とのつながりが 100 になると渡れる', () => {
    let e = { ...(testActions.jumpPhase4(newSave(), 3).empire as EmpireState), funds: 1e11 };
    expect(canEnter(e, 'Ruby')).toBe(false);
    // つながりが無いうちに渡ろうとしても渡れない
    e = advanceMonth(e, { enter: { land: 'Ruby', mode: 'direct' } }).state;
    expect(e.world!.branches.some((b) => b.land === 'Ruby')).toBe(false);
    const funds = e.funds;
    for (let i = 0; i < 100 / RUBY.postStep; i++) e = advanceMonth(e, { post: true }).state;
    expect(rubyOpen(e)).toBe(true);
    expect(funds - e.funds).toBeGreaterThan(0);
    expect(canEnter(e, 'Ruby')).toBe(true);
    e = advanceMonth(e, { enter: { land: 'Ruby', mode: 'jv' } }).state;
    expect(e.world!.branches.some((b) => b.land === 'Ruby')).toBe(true);
  });
  it('団長の情報網があると、地主会のライバルの付け値が先に分かる（そのとおりの値で競る）', () => {
    let e = testActions.jumpPhase5(newSave(), 3).empire as EmpireState;
    e.court = { ...e.court!, privileges: [...e.court!.privileges, 'network'] };
    expect(hasNetwork(e)).toBe(true);
    const preview = Math.round(rivalBid(e.group!, e.land));
    const r = advanceMonth(e, { bids: {} });
    expect(r.state.group!.legend[e.land].rivalPrice).toBe(preview);
  });
  it('エンディングは 9 ランドで 3 冠（27 個）', () => {
    expect(ENDING_CROWNS).toBe(27);
  });
});
