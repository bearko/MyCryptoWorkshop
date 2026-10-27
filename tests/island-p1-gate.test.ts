import { describe, expect, it } from 'vitest';
import { GATE } from '../src/island/p1/data';
import { deserializeP1, facilityStatus, gateOf, gateToll, newP1, openGate, serializeP1 } from '../src/island/p1/model';

describe('関所', () => {
  it('ランドのふち（東）に、町の建物として置かれる', () => {
    const s = newP1(7);
    const g = gateOf(s)!;
    expect(g).toBeTruthy();
    expect(g.owner).toBe('town');
    expect(Math.abs(g.i - GATE.at[0]) + Math.abs(g.j - GATE.at[1])).toBeLessThanOrEqual(2);
    expect(facilityStatus(s, g)).toEqual({ level: 'warn', stop: 'gateShut' });
  });

  it('通行料は 1 位の他社のひと月の売上くらい（1000 G 単位で切り上げ）', () => {
    const s = newP1(7);
    const toll = gateToll(s);
    // 締めの前は見込み（固定の売上 ＋ 商圏で売れるぶん）
    expect(toll).toBeGreaterThan(Math.max(...s.rivals.map((r) => r.base)));
    expect(toll % GATE.round).toBe(0);
    // 先月の締めがあればそちらを使う
    s.rivalLast = Object.fromEntries(s.rivals.map((r, k) => [r.id, { total: k === 0 ? 99_500 : 1000, by: {} }]));
    expect(gateToll(s)).toBe(100_000);
  });

  it('資金が足りないと開かない。払うと資金が減って開通する', () => {
    const s = newP1(7);
    const toll = gateToll(s);
    s.money = toll - 1;
    expect(openGate(s)).toBe(false);
    expect(s.gateOpen).toBeFalsy();
    s.money = toll + 500;
    expect(openGate(s)).toBe(true);
    expect(s.money).toBe(500);
    expect(s.monthCost.build).toBe(toll);
    expect(s.gateOpen).toBe(true);
    expect(openGate(s)).toBe(false);
    expect(facilityStatus(s, gateOf(s)!)).toEqual({ level: 'info', stop: 'gateOpen' });
  });

  it('以前のセーブにも関所を足す', () => {
    const s = newP1(7);
    const o = JSON.parse(serializeP1(s));
    o.buildings = o.buildings.filter((b: { id: string }) => b.id !== 'guard');
    const back = deserializeP1(JSON.stringify(o))!;
    expect(gateOf(back)).toBeTruthy();
  });
});
