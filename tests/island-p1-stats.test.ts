import { describe, expect, it } from 'vitest';
import { heroById } from '../src/game/catalog';
import { HIRE_POOL, START_STAFF, TASKS, aptitude } from '../src/island/p1/data';
import { RANKS, rankOf } from '../src/island/p1/heroui';
import { deserializeP1, heroStats, newP1, serializeP1, speed, wageOf } from '../src/island/p1/model';

const ids = [...(heroById.values() as Iterable<unknown>)].filter((h) => (h as { stats?: unknown }).stats).map((h) => (h as { id: number }).id);
const best = (id: number) => Math.max(...TASKS.map((t) => aptitude(heroStats(id), t.key)));
const rank = (id: number) => RANKS.indexOf(rankOf(best(id)));

describe('ヒーローの能力値（全ヒーロー中の最大が 100）', () => {
  it('PHY・INT・AGI はどれも 100 以下で、最大がちょうど 100', () => {
    for (const k of ['phy', 'int', 'agi'] as const) {
      const vals = ids.map((id) => heroStats(id)[k]);
      expect(Math.max(...vals)).toBe(100);
      expect(Math.min(...vals)).toBeGreaterThan(0);
    }
  });

  it('見習いの 3 人は G〜F、速さは 1.0 前後のまま', () => {
    const s = newP1(1);
    for (const id of START_STAFF) expect(rank(id)).toBeLessThanOrEqual(RANKS.indexOf('F'));
    const artist = s.staff.find((x) => x.hero === START_STAFF[2])!;
    expect(speed(artist, 'craft')).toBeCloseTo(1, 5);
  });

  it('最初に雇えるコモンは良くて E、D は少し', () => {
    const pool = HIRE_POOL.filter((id) => heroById.has(id));
    const rs = pool.map(rank);
    expect(Math.max(...rs)).toBeLessThanOrEqual(RANKS.indexOf('D'));
    expect(rs.filter((r) => r === RANKS.indexOf('D')).length).toBeLessThanOrEqual(1);
  });

  it('S はひと握り（レジェンダリーなど）', () => {
    const s = ids.filter((id) => rankOf(best(id)) === 'S').length;
    expect(s).toBeGreaterThan(0);
    expect(s).toBeLessThan(ids.length * 0.05);
  });

  it('月給は縮める前の値のまま', () => {
    const raw = (heroById.get(1008) as unknown as { stats: { phy: number; int: number; agi: number } }).stats;
    expect(wageOf(1008)).toBe(Math.round((raw.phy + raw.int + raw.agi) * 3));
  });

  it('以前のセーブの能力値は読み込むときに縮める', () => {
    const s = newP1(2);
    const o = JSON.parse(serializeP1(s));
    delete o.statV;
    o.staff[0].stats = { ...(heroById.get(o.staff[0].hero) as unknown as { stats: object }).stats };
    const back = deserializeP1(JSON.stringify(o))!;
    expect(back.staff[0].stats).toEqual(heroStats(o.staff[0].hero));
    expect(back.statV).toBe(2);
    // 2 回読んでも縮まない
    expect(deserializeP1(serializeP1(back))!.staff[0].stats).toEqual(heroStats(o.staff[0].hero));
  });
});
