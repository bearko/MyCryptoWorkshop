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
  it('人材の募集はもらえない。段「recruit」は本社と人材の募集を開放し、ツリーを閉じたら進む。開始時の 30 RP で開く（足りない古いセーブだけ足す）', async () => {
    const { TUT } = await import('../src/island/p1/tut');
    const { learn } = await import('../src/island/p1/model');
    const st = TUT.find((x) => x.id === 'recruit')!;
    const s = newP1(4);
    expect(s.skills).not.toContain('hire');
    expect(s.rp).toBe(30);
    expect(st.rpTalk!(s)).toBe(0);
    s.rp = 10;
    expect(st.rpTalk!(s)).toBe(20);
    s.rp = 30;
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

describe('作る数（自動製造でないとき）', () => {
  it('決めた数だけ作って止まる。自動製造をオンにすると続けて作る', async () => {
    const M = await import('../src/island/p1/model');
    const s = newP1(11);
    const lot = (id: string): [number, number, 'rd' | 'ld' | 'lu' | 'ru'] => {
      for (let j = 0; j < s.n; j++) for (let i = 0; i < s.n; i++) { const d = M.allowedDirs(s, id, i, j); if (d.length) return [i, j, d[0]]; }
      throw new Error('no lot');
    };
    const [a, b, d] = lot('workshop');
    M.build(s, 'workshop', a, b, d);
    for (let k = 0; k < 5; k++) M.step(s);
    M.assign(s, 10003, 'craft', 0);
    s.slots[0].sku = 'Sensu:C';
    s.mats = Object.fromEntries(Object.entries(M.recipeOf('Sensu:C')).map(([m, q]) => [m, (q ?? 0) * 3])) as never;
    M.setCraftPlan(s, 0, 8); // 2 ロット
    expect(s.slots[0].running).toBe(true);
    expect(s.slots[0].left).toBe(4);
    for (let k = 0; k < 40; k++) M.step(s);
    expect(s.slots[0].running).toBe(false);
    expect(s.slots[0].left).toBe(0);
    expect(s.stock['Sensu:C']).toBe(8);
    M.setAutoCraft(s, 0, true);
    expect(s.slots[0].running).toBe(true);
    expect(s.slots[0].repeat).toBe(true);
  });
});

describe('素材の注文（ロット単位・納期）', () => {
  it('代金はいま払い、納期に工房へ届く。置き場所は先に取っておく', async () => {
    const M = await import('../src/island/p1/model');
    const s = newP1(12);
    const lot = (id: string): [number, number, 'rd' | 'ld' | 'lu' | 'ru'] => {
      for (let j = 0; j < s.n; j++) for (let i = 0; i < s.n; i++) { const d = M.allowedDirs(s, id, i, j); if (d.length) return [i, j, d[0]]; }
      throw new Error('no lot');
    };
    const [a, b, d] = lot('workshop');
    M.build(s, 'workshop', a, b, d);
    for (let k = 0; k < 5; k++) M.step(s);
    const m = s.routes[0];
    const have = s.mats[m] ?? 0;
    const money = s.money;
    const free = M.poolFree(s);
    expect(M.order(s, m, 1)).toBeNull();
    expect(s.money).toBe(money - M.matPrice(s, m) * M.LOT);
    expect(M.poolFree(s)).toBe(free - M.LOT);
    expect(s.mats[m] ?? 0).toBe(have);
    const days = M.leadDays(s);
    expect(s.orders![0].left).toBe(days);
    let got = false;
    for (let k = 0; k < days; k++) got = !!M.step(s).orders?.length || got;
    expect(got).toBe(true);
    expect(s.mats[m] ?? 0).toBe(have + M.LOT);
    expect(s.orders).toHaveLength(0);
  });
});
