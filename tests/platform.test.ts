// bearko.games 共通基盤（総合スコア）に送る成績
import { describe, expect, it } from 'vitest';
import { newSave } from '../src/game/save';
import { reportScore, scoreMetrics } from '../src/net/platform';

describe('総合スコアの成績', () => {
  it('はじめは day・クリアなし', () => {
    const s = newSave(0);
    s.day = 3;
    expect(scoreMetrics(s)).toMatchObject({ day: 3, clearBest: null, run: 1 });
  });
  it('30 日目に届いたことがあれば day は 30 以上、最速クリアは周回込み', () => {
    const s = newSave(0);
    s.day = 5;
    s.prestige.runs = 1;
    s.prestige.clearSeconds = 9000;
    s.prestige.history = [{ ...(s.prestige.history[0] ?? {}), clearSeconds: 7200 } as never];
    expect(scoreMetrics(s)).toMatchObject({ day: 30, clearBest: 7200, run: 2 });
  });
  it('SDK がなくても例外を出さない', () => {
    expect(() => reportScore(newSave(0))).not.toThrow();
  });
});
