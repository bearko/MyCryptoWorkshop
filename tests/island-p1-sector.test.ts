import { describe, expect, it } from 'vitest';
import { MATS, PRODUCT, RIVALS, SECTORS, TIERS, rivalDef } from '../src/island/p1/data';
import { sectorProfile } from '../src/island/p1/company';
import { crowned, landCleared, lastRank, moveTo } from '../src/island/p1/land';
import { accept, adBoost, areaRanking, legDays, matPrice, newP1, offeredMissions, openGate, runAd, step } from '../src/island/p1/model';

describe('セクタの個性', () => {
  it('風見の丘：他社の名前と需要がセクタのもの', () => {
    const s = newP1(11, 'C', 'c2');
    const ids = s.rivals.map((r) => r.id);
    expect(ids).toEqual(['fusha', 'okaue', 'kazami', 'hane']);
    expect(ids.some((id) => RIVALS.some((x) => x.id === id))).toBe(false);
    expect(rivalDef('fusha')?.name).toBe('風車堂');
    // 地図にも、その会社の店がある
    for (const id of ids) expect(s.buildings.some((b) => b.owner === id)).toBe(true);
    // 需要：マレット ×1.6・ランタン ×0.6、センスはそのまま
    expect(s.demand.Mallet).toBeCloseTo(PRODUCT.Mallet.demand * 1.6);
    expect(s.demand.Lantern).toBeCloseTo(PRODUCT.Lantern.demand * 0.6);
    expect(s.demand.Sensu).toBeCloseTo(PRODUCT.Sensu.demand);
    // ランキングの名前もセクタの他社
    const rows = areaRanking(s, 0, Object.fromEntries(s.rivals.map((r) => [r.id, r.base])));
    expect(rows.map((r) => r.name)).toContain('カザミ金物');
  });

  it('はじまりの浜はいままでどおり（RIVALS・需要そのまま）', () => {
    const s = newP1(11);
    expect(s.rivals.map((r) => r.id)).toEqual(RIVALS.map((r) => r.id));
    expect(s.demand.Mallet).toBeCloseTo(PRODUCT.Mallet.demand);
    expect(sectorProfile(s).cheap).toBeUndefined();
  });

  it('Uncommon の他社は、ランクの倍率が掛かる。港町はルートが全部開いている', () => {
    const s = newP1(12, 'U', 'u1');
    const def = rivalDef('ship')!;
    const st = s.rivals.find((r) => r.id === 'ship')!;
    expect(st.base).toBeCloseTo(def.base * TIERS.U.rival);
    expect(st.sells.Lantern).toBeCloseTo(1.4 * TIERS.U.rival);
    expect([...s.routes].sort()).toEqual(Object.keys(MATS).sort());
    // ほかのセクタは紙・布・宝石がまだ
    expect(newP1(12, 'U', 'u2').routes).not.toContain('gem');
  });

  it('特産の素材は 20% 安い（湖のほとり：ガラス・粘土）', () => {
    const c1 = newP1(13);
    const c3 = newP1(13, 'C', 'c3');
    expect(matPrice(c3, 'glass')).toBe(Math.round(matPrice(c1, 'glass') * 0.8));
    expect(matPrice(c3, 'clay')).toBe(Math.round(matPrice(c1, 'clay') * 0.8));
    expect(matPrice(c3, 'iron')).toBe(matPrice(c1, 'iron'));
    const c2 = newP1(13, 'C', 'c2');
    expect(matPrice(c2, 'iron')).toBe(Math.round(MATS.iron.price * 0.8));
  });

  it('運ぶ日数：坂道のセクタは長い（風見の丘 ×1.2・商人の坂 ×1.3）', () => {
    const c1 = newP1(14);
    const c2 = newP1(14, 'C', 'c2');
    const u2 = newP1(14, 'U', 'u2');
    expect(legDays(c2, 10)).toBeCloseTo(legDays(c1, 10) * 1.2);
    expect(legDays(u2, 10)).toBeCloseTo(legDays(c1, 10) * 1.3);
  });

  it('宣伝の効き目：商人の坂は ×1.5', () => {
    const c1 = newP1(15);
    const u2 = newP1(15, 'U', 'u2');
    c1.money = u2.money = 1e6;
    runAd(c1, 'flyer');
    runAd(u2, 'flyer');
    expect(adBoost(u2)).toBeCloseTo(adBoost(c1) * 1.5);
  });

  it('すべてのセクタに一言と、遊べるセクタには 3 枚の案内がある', () => {
    for (const d of SECTORS.filter((x) => !x.cloud)) expect(d.profile.tag.length).toBeGreaterThan(0);
    for (const d of SECTORS.filter((x) => x.id !== 'c1' && !x.cloud && !x.soon)) expect(d.profile.intro.length).toBe(3);
    // 他社の id はセクタをまたいで重ならない
    const all = [...RIVALS, ...SECTORS.flatMap((x) => x.profile.rivals ?? [])].map((r) => r.id);
    expect(new Set(all).size).toBe(all.length);
  });
});

describe('セクタの依頼とランド制覇', () => {
  it('セクタの依頼は、そのセクタでだけ受けられ、そこでだけ進む', () => {
    const s = newP1(16);
    expect(offeredMissions(s).some((m) => m.id.startsWith('c2_'))).toBe(false);
    s.money = 1e6;
    openGate(s);
    s.money = 1e6;
    expect(moveTo(s, 'c2', null)).toBeNull();
    const offered = offeredMissions(s).map((m) => m.id);
    expect(offered.slice(0, 2)).toEqual(['c2_mallet', 'c2_top']);
    expect(accept(s, 'c2_mallet')).toBeNull();
    s.monthUnits.Mallet = 10;
    step(s);
    expect(s.missions.c2_mallet).toBe('done');
  });

  it('Common の 3 セクタすべてで 1 位になるとランド制覇', () => {
    const s = newP1(17);
    s.money = 1e7;
    openGate(s);
    s.cleared = true;
    expect(crowned(s, 'c1')).toBe(true);
    expect(landCleared(s, 'C')).toBe(false);
    moveTo(s, 'c2', null);
    expect(crowned(s, 'c1')).toBe(true);
    expect(crowned(s, 'c2')).toBe(false);
    s.cleared = true;
    s.reports.push({ rank: 1 } as never);
    expect(lastRank(s, 'c2')).toBe(1);
    moveTo(s, 'c3', null);
    expect(landCleared(s, 'C')).toBe(false);
    s.cleared = true;
    expect(landCleared(s, 'C')).toBe(true);
    expect(landCleared(s, 'U')).toBe(false);
  });
});
