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

describe('チュートリアル：人材の募集は自分で開放する', () => {
  it('人材の募集はもらえない。段「recruit」は本社と人材の募集を開放し、ツリーを閉じたら進む。資金が足りなければ援助', async () => {
    const { TUT } = await import('../src/island/p1/tut');
    const { learn } = await import('../src/island/p1/model');
    const st = TUT.find((x) => x.id === 'recruit')!;
    const s = newP1(4);
    expect(s.skills).not.toContain('hire');
    s.money = 500;
    expect(st.grant!(s)).toBe(3000);
    s.money = 10000;
    expect(st.grant!(s)).toBe(0);
    expect(st.done(s, new Set(['skills']))).toBe(false);
    openHQ(s);
    expect(learn(s, 'hire')).toBeNull();
    expect(st.done(s, new Set())).toBe(false);
    expect(st.done(s, new Set(['skills']))).toBe(true);
    // 次の段「hire」は、人事を開いてアンロックを見るまでは人事タブを光らせる
    const hire = TUT.find((x) => x.id === 'hire')!;
    expect(typeof hire.hl === 'function' ? hire.hl(s) : hire.hl).toBe('hr');
    s.flags.hireUnlocked = true;
    expect(typeof hire.hl === 'function' ? hire.hl(s) : hire.hl).toBe('hr:hire');
  });
});
