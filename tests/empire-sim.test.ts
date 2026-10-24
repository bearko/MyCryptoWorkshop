// 経営モードの月次シミュレーション（docs/EMPIRE_DESIGN.md 9.1）
import { describe, expect, it } from 'vitest';
import { newEmpire, restoreEmpire } from '../src/empire/model';
import { makeRng } from '../src/empire/rng';
import { advanceMonth, COST_RATE, expectedDemand, OPEN_COST, RENOVATE_COST } from '../src/empire/sim';

describe('乱数', () => {
  it('同じ状態からは同じ並び、0 以上 1 未満', () => {
    const a = makeRng(42);
    const b = makeRng(42);
    const xs = Array.from({ length: 100 }, () => a.next());
    expect(xs).toEqual(Array.from({ length: 100 }, () => b.next()));
    expect(xs.every((x) => x >= 0 && x < 1)).toBe(true);
    expect(a.state).toBe(b.state);
  });
});

describe('月を進める', () => {
  it('元の状態を変えず、月と資金と履歴が進む', () => {
    const s0 = newEmpire('テスト商店', 7);
    const before = JSON.stringify(s0);
    const { state, report } = advanceMonth(s0);
    expect(JSON.stringify(s0)).toBe(before);
    expect(state.month).toBe(1);
    expect(state.funds).toBeCloseTo(s0.funds + report.profit);
    expect(state.history).toHaveLength(1);
    expect(state.rng).not.toBe(s0.rng);
  });

  it('同じ種と同じ決定なら同じ結果（種を変えると天気が変わる）', () => {
    const run = (seed: number) => {
      let s = newEmpire('a', seed);
      for (let i = 0; i < 12; i++) s = advanceMonth(s, { stores: { 1: { order: 1.05 } } }).state;
      return s.funds;
    };
    expect(run(1)).toBe(run(1));
    expect(run(1)).not.toBe(run(2));
  });

  it('既定の 1 店は黒字（仮の値の確認）', () => {
    const { report } = advanceMonth(newEmpire('a', 1));
    expect(report.revenue).toBeGreaterThan(0);
    expect(report.profit).toBeGreaterThan(0);
  });

  it('発注が多いほど廃棄が増え、少ないほど欠品が増える', () => {
    const at = (order: number) => advanceMonth(newEmpire('a', 3), { stores: { 1: { order } } }).report.stores[0];
    expect(at(1.4).waste).toBeGreaterThan(at(0.8).waste);
    expect(at(0.8).lost).toBeGreaterThan(at(1.4).lost);
  });

  it('24 時間で人手が足りないと疲れが積もり、予兆が出て、需要が落ちる', () => {
    let s = newEmpire('a', 5);
    const notes = [];
    for (let i = 0; i < 6; i++) {
      const r = advanceMonth(s, { stores: { 1: { hours: 24, staff: 2 } } });
      s = r.state;
      notes.push(...r.report.notes);
    }
    expect(s.stores[0].fatigue).toBeGreaterThanOrEqual(60);
    expect(notes.some((n) => n.kind === 'fatigue')).toBe(true);
    const tired = expectedDemand(s.stores[0], 0);
    expect(tired).toBeLessThan(expectedDemand({ ...s.stores[0], fatigue: 0 }, 0));
  });

  it('改装と出店は資金から払い、3 店で共同仕入れの原価になる', () => {
    const s0 = { ...newEmpire('a', 9), funds: 70_000_000 };
    const { state, report } = advanceMonth(s0, { renovate: [{ store: 1, kind: 'sign' }], open: [{ kind: 'residential' as const, base: 250_000, rent: 300_000, owner: null }, { kind: 'residential' as const, base: 250_000, rent: 300_000, owner: null }] });
    expect(state.stores).toHaveLength(3);
    expect(state.stores[0].sign).toBe(true);
    expect(state.funds).toBeCloseTo(s0.funds - RENOVATE_COST.sign - 2 * OPEN_COST + report.profit);
    const r = report.stores[0];
    expect(r.purchases / (r.expected * 1.1 * 30)).toBeCloseTo(COST_RATE.joint);
  });

  it('資金が足りない出店はしない', () => {
    const s0 = { ...newEmpire('a', 1), funds: 100 };
    const { state, report } = advanceMonth(s0, { open: [{ kind: 'residential' as const, base: 1, rent: 1, owner: null }] });
    expect(state.stores).toHaveLength(1);
    expect(report.notes.some((n) => n.kind === 'shortOfFunds')).toBe(true);
  });
});

describe('保存と読み直し', () => {
  it('JSON を通しても同じ', () => {
    const s = advanceMonth(newEmpire('a', 1)).state;
    expect(restoreEmpire(JSON.parse(JSON.stringify(s)))).toEqual(s);
  });

  it('壊れた形は null、欠けた項目は既定値で埋める', () => {
    expect(restoreEmpire(null)).toBeNull();
    expect(restoreEmpire({ name: 'x' })).toBeNull();
    const r = restoreEmpire({ stores: [{ id: 4 }], phase: 9 });
    expect(r?.phase).toBe(1);
    expect(r?.stores[0].hours).toBe(16);
    expect(r?.nextStoreId).toBe(5);
  });
});

describe('セーブとの関係', () => {
  it('会社のないセーブは empire が null、会社はセーブを通しても残る', async () => {
    const { newSave, parseSave } = await import('../src/game/save');
    const save = newSave();
    expect(parseSave(JSON.stringify(save)).empire).toBeNull();
    const { empire: _drop, ...old } = save;
    expect(parseSave(JSON.stringify(old)).empire).toBeNull();
    save.empire = advanceMonth(newEmpire('a', 1)).state;
    expect(parseSave(JSON.stringify(save)).empire).toEqual(save.empire);
  });

  it('黄金のエクステンションを作った営業日を覚え、移転で周回の記録に残す', async () => {
    const { newSave } = await import('../src/game/save');
    const { onBought, relocate } = await import('../src/game/prestige');
    const { skillById } = await import('../src/game/skills');
    const save = newSave();
    save.day = 12;
    onBought(save, skillById.get('goldenExtension')!);
    expect(save.prestige.clearDay).toBe(12);
    relocate(save, 'ocean');
    expect(save.prestige.history[0].clearDay).toBe(12);
    expect(save.prestige.clearDay).toBeNull();
  });
});

describe('フェーズ 1：区画・手紙・格上げ', () => {
  it('出店候補は 3 つ・種類が別・状態を変えない・月で入れ替わる', async () => {
    const { plotsFor } = await import('../src/empire/sim');
    const s = newEmpire('a', 11);
    const before = JSON.stringify(s);
    const a = plotsFor(s);
    expect(a).toHaveLength(3);
    expect(new Set(a.map((p) => p.kind)).size).toBe(3);
    expect(plotsFor(s)).toEqual(a);
    expect(JSON.stringify(s)).toBe(before);
    expect(plotsFor(advanceMonth(s).state)).not.toEqual(a);
  });

  it('加盟の手紙は決まった月だけ。加盟店は家賃・人件費なしで粗利の一部が本部へ', async () => {
    const { letterFor, LETTER_MONTHS, FC_OPEN_COST, FC_SHARE } = await import('../src/empire/sim');
    let s = newEmpire('a', 2);
    expect(letterFor(s, 7)).toBeNull();
    // 手紙の来ない月に加盟店を出そうとしても出ない
    expect(advanceMonth(s, { open: [{ kind: 'liquor', base: 280_000, rent: 0, owner: 7 }] }).state.stores).toHaveLength(1);
    while (s.month < LETTER_MONTHS[0]) s = advanceMonth(s).state;
    const letter = letterFor(s, 7)!;
    expect(letter.owner).toBe(7);
    const { state, report } = advanceMonth(s, { open: [letter] });
    const fc = state.stores.find((x) => x.owner === 7)!;
    expect(fc).toBeTruthy();
    const r = report.stores.find((x) => x.id === fc.id)!;
    expect(r.rent).toBe(0);
    expect(r.labor).toBe(0);
    expect(r.profit).toBeCloseTo((r.revenue - r.purchases) * FC_SHARE);
    expect(state.funds).toBeCloseTo(s.funds - FC_OPEN_COST + report.profit);
    expect(letterFor(state, 8)).toBeNull();
  });

  it('3 店・3 か月連続の黒字で格上げでき、条件を満たさないうちは上がらない', async () => {
    const { canPromote, plotsFor } = await import('../src/empire/sim');
    let s = { ...newEmpire('a', 4), funds: 200_000_000 };
    expect(advanceMonth(s, { promote: true }).state.phase).toBe(1);
    s = advanceMonth(s, { open: plotsFor(s).slice(0, 2) }).state;
    expect(s.stores).toHaveLength(3);
    let ready = false;
    for (let i = 0; i < 6 && !ready; i++) {
      const r = advanceMonth(s);
      s = r.state;
      ready = r.report.notes.some((n) => n.kind === 'phaseReady');
    }
    expect(ready).toBe(true);
    expect(canPromote(s)).toBe(true);
    const up = advanceMonth(s, { promote: true });
    expect(up.state.phase).toBe(2);
    expect(up.report.notes.some((n) => n.kind === 'promoted')).toBe(true);
  });
});
