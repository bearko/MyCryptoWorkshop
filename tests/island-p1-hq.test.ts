import { describe, expect, it } from 'vitest';
import { deserializeP1, hqOpen, newP1, openHQ, serializeP1 } from '../src/island/p1/model';

describe('スキルツリーの本社', () => {
  it('はじめは閉じていて、開放すると開く（2 回目は何もしない）', () => {
    const s = newP1(3);
    expect(hqOpen(s)).toBe(false);
    expect(openHQ(s)).toBe(true);
    expect(hqOpen(s)).toBe(true);
    expect(openHQ(s)).toBe(false);
    expect(hqOpen(deserializeP1(serializeP1(s))!)).toBe(true);
  });

  it('チュートリアルでもらう「人材の募集」だけでは開かない', () => {
    const s = newP1(3);
    s.skills.push('hire');
    expect(hqOpen(s)).toBe(false);
    expect(hqOpen(deserializeP1(serializeP1(s))!)).toBe(false);
  });

  it('以前のセーブで自分でスキルを取っていれば、開放済みにする', () => {
    const s = newP1(3);
    s.skills.push('hire', 'shelf1');
    const o = JSON.parse(serializeP1(s));
    delete o.flags.hq;
    expect(hqOpen(deserializeP1(JSON.stringify(o))!)).toBe(true);
  });
});
