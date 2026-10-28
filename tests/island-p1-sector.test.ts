import { describe, expect, it } from 'vitest';
import { MATS, MISSIONS, PRODUCT, RIVALS, SECTORS, TIERS, rivalDef } from '../src/island/p1/data';
import { sectorProfile } from '../src/island/p1/company';
import { crowned, landCleared, lastRank, moveTo, playable } from '../src/island/p1/land';
import { accept, adBoost, areaRanking, legDays, matPrice, newP1, offeredMissions, openGate, runAd, step } from '../src/island/p1/model';

describe('セクタの個性', () => {
  it('リデル・ヒルズ（丘）：他社の名前と需要がセクタのもの', () => {
    const s = newP1(11, 'C', 'c3');
    const ids = s.rivals.map((r) => r.id);
    expect(ids).toEqual(['fusha', 'okaue', 'kazami', 'hane']);
    expect(ids.some((id) => RIVALS.some((x) => x.id === id))).toBe(false);
    expect(rivalDef('fusha')?.name).toBe('風車堂');
    // 地図にも、その会社の店がある
    for (const id of ids) expect(s.buildings.some((b) => b.owner === id)).toBe(true);
    // 需要：gap のナイフ ×1.6・コンパス ×1.5、基礎の商品はそのまま、gap でない技の商品は MARKET.niche 倍
    expect(s.demand.Knife).toBeCloseTo(PRODUCT.Knife.demand * 1.6);
    expect(s.demand.Compass).toBeCloseTo(PRODUCT.Compass.demand * 1.5);
    expect(s.demand.Sensu).toBeCloseTo(PRODUCT.Sensu.demand);
    expect(s.demand.Goblet).toBeCloseTo(PRODUCT.Goblet.demand * 0.5);
    // ランキングの名前もセクタの他社
    const rows = areaRanking(s, 0, Object.fromEntries(s.rivals.map((r) => [r.id, r.base])));
    expect(rows.map((r) => r.name)).toContain('カザミ金物');
  });

  it('タオックス（最初のセクタ）はいままでどおり（RIVALS・需要そのまま）', () => {
    const s = newP1(11);
    expect(s.rivals.map((r) => r.id)).toEqual(RIVALS.map((r) => r.id));
    expect(s.demand.Mallet).toBeCloseTo(PRODUCT.Mallet.demand);
    expect(sectorProfile(s).cheap).toBeUndefined();
  });

  it('Uncommon の他社は、ランクの倍率が掛かる。ウメコタウン（港町）はルートが全部開いている', () => {
    const s = newP1(12, 'U', 'u1');
    const def = rivalDef('ship')!;
    const st = s.rivals.find((r) => r.id === 'ship')!;
    expect(st.base).toBeCloseTo(def.base * TIERS.U.rival);
    expect(st.sells.Lantern).toBeCloseTo(1.4 * TIERS.U.rival);
    expect([...s.routes].sort()).toEqual(Object.keys(MATS).sort());
    // ほかのセクタは紙・布・宝石がまだ
    expect(newP1(12, 'U', 'u2').routes).not.toContain('gem');
  });

  it('特産の素材は 20% 安い（ユーホタウン：ガラス・粘土）', () => {
    const c1 = newP1(13);
    const c2 = newP1(13, 'C', 'c2');
    expect(matPrice(c2, 'glass')).toBe(Math.round(matPrice(c1, 'glass') * 0.8));
    expect(matPrice(c2, 'clay')).toBe(Math.round(matPrice(c1, 'clay') * 0.8));
    expect(matPrice(c2, 'iron')).toBe(matPrice(c1, 'iron'));
    const c3 = newP1(13, 'C', 'c3');
    expect(matPrice(c3, 'iron')).toBe(Math.round(MATS.iron.price * 0.8));
  });

  it('運ぶ日数：坂道のセクタは長い（リデル・ヒルズ ×1.2・エムケーシティ ×1.3）', () => {
    const c1 = newP1(14);
    const c3 = newP1(14, 'C', 'c3');
    const u3 = newP1(14, 'U', 'u3');
    expect(legDays(c3, 10)).toBeCloseTo(legDays(c1, 10) * 1.2);
    expect(legDays(u3, 10)).toBeCloseTo(legDays(c1, 10) * 1.3);
  });

  it('宣伝の効き目：エムケーシティは ×1.5・オマツリタウンは ×1.4', () => {
    const c1 = newP1(15);
    const u3 = newP1(15, 'U', 'u3');
    const c5 = newP1(15, 'C', 'c5');
    c1.money = u3.money = c5.money = 1e6;
    runAd(c1, 'flyer');
    runAd(u3, 'flyer');
    runAd(c5, 'flyer');
    expect(adBoost(u3)).toBeCloseTo(adBoost(c1) * 1.5);
    expect(adBoost(c5)).toBeCloseTo(adBoost(c1) * 1.4);
  });

  it('新しい個性：住宅の数・一部のルート・他社の強さ', () => {
    const homes = (x: ReturnType<typeof newP1>) => x.buildings.filter((b) => b.owner === 'town' && ['house', 'cottage', 'garage_house', 'japanese_house', 'apartment', 'manor'].includes(b.id)).length;
    // キッチョムシティは住宅多め、ジラ・カントリーは少なめ
    expect(homes(newP1(21, 'C', 'c4'))).toBeGreaterThan(homes(newP1(21)));
    expect(homes(newP1(21, 'C', 'c6'))).toBeLessThan(homes(newP1(21)));
    // サクラコシティは紙だけ、ゴリ・ラグズは布だけ最初から
    const c7 = newP1(22, 'C', 'c7').routes;
    expect(c7).toContain('paper');
    expect(c7).not.toContain('cloth');
    expect(c7).not.toContain('gem');
    const u4 = newP1(22, 'U', 'u4').routes;
    expect(u4).toContain('cloth');
    expect(u4).not.toContain('paper');
    // ペストタウンは他社 ×1.15、ザックシティは ×1.2（ランクの倍率にさらに掛かる）
    const c8 = newP1(23, 'C', 'c8');
    expect(c8.rivals[0].base).toBeCloseTo(rivalDef(c8.rivals[0].id)!.base * 1.15);
    const u5 = newP1(23, 'U', 'u5');
    expect(u5.rivals[0].base).toBeCloseTo(rivalDef(u5.rivals[0].id)!.base * TIERS.U.rival * 1.2);
    // 特産：ジラ・カントリーは木材、ヤツカノタウンは鉄
    expect(matPrice(newP1(24, 'C', 'c6'), 'wood')).toBe(Math.round(MATS.wood.price * 0.8));
    expect(matPrice(newP1(24, 'U', 'u2'), 'iron')).toBe(Math.round(MATS.iron.price * 0.8));
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
    expect(offered.slice(0, 2)).toEqual(['c2_goblet', 'c2_top']);
    expect(accept(s, 'c2_goblet')).toBeNull();
    expect(s.missions.c2_goblet).toBe('accepted');
    s.monthUnits.Goblet = 10;
    step(s);
    expect(s.missions.c2_goblet).toBe('done');
  });

  it('Common の 8 セクタすべてで 1 位になるとランド制覇', () => {
    const s = newP1(17);
    s.money = 1e8;
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
    const commons = playable('C').map((x) => x.id);
    expect(commons).toEqual(['c1', 'c2', 'c3', 'c4', 'c5', 'c6', 'c7', 'c8']);
    for (const id of commons.slice(2)) {
      expect(landCleared(s, 'C')).toBe(false);
      s.money = 1e8;
      expect(moveTo(s, id, null)).toBeNull();
      s.cleared = true;
    }
    expect(landCleared(s, 'C')).toBe(true);
    expect(landCleared(s, 'U')).toBe(false);
  });

  it('依頼を受けた時点で条件を満たしていれば、その場で達成（港町：アンコモンを開発済み）', () => {
    const s = newP1(18, 'U', 'u1');
    s.dev.push('Sensu');
    expect(accept(s, 'u1_dev')).toBeNull();
    expect(s.missions.u1_dev).toBe('done');
    // まだなら、受けただけ（進行中）
    const t2 = newP1(18, 'U', 'u1');
    expect(accept(t2, 'u1_dev')).toBeNull();
    expect(t2.missions.u1_dev).toBe('accepted');
    // ほかのセクタの依頼は、そこにいないので達成にならない
    const c1 = newP1(18);
    c1.dev.push('Sensu');
    expect(accept(c1, 'u1_dev')).toBeNull();
    expect(c1.missions.u1_dev).toBe('accepted');
  });

});

describe('はじまりの国 Lime：21 セクタ', () => {
  it('C8・U5・R4・E3・L1、id と名前は重ならない。前からの id は残っている', () => {
    const n = (tier: string) => SECTORS.filter((x) => x.tier === tier).length;
    expect(SECTORS).toHaveLength(21);
    expect([n('C'), n('U'), n('R'), n('E'), n('L')]).toEqual([8, 5, 4, 3, 1]);
    const ids = SECTORS.map((x) => x.id);
    expect(new Set(ids).size).toBe(21);
    for (const id of ['c1', 'c2', 'c3', 'u1', 'u2', 'r1', 'e1', 'l1']) expect(ids).toContain(id);
    expect(new Set(SECTORS.map((x) => x.name)).size).toBe(21);
    expect(SECTORS.map((x) => x.name).slice(0, 8)).toEqual(['タオックス', 'ユーホタウン', 'リデル・ヒルズ', 'キッチョムシティ', 'オマツリタウン', 'ジラ・カントリー', 'サクラコシティ', 'ペストタウン']);
    expect(SECTORS.filter((x) => x.tier === 'C').map((x) => x.fee)).toEqual([0, 5000, 6000, 8000, 8000, 7000, 10000, 12000]);
    expect(SECTORS.filter((x) => x.tier === 'U').map((x) => x.fee)).toEqual([150000, 180000, 220000, 260000, 300000]);
    // Rare は U×2 で開放・準備中、Epic・Legendary は雲
    for (const d of SECTORS.filter((x) => x.tier === 'R')) expect([d.need?.n, d.soon]).toEqual([2, true]);
    for (const d of SECTORS.filter((x) => x.tier === 'E' || x.tier === 'L')) expect(d.cloud).toBe(true);
  });

  it('他社の名前も id もセクタをまたいで重ならない。Common・Uncommon はみな 4 社の個性を持つ', () => {
    const all = [...RIVALS, ...SECTORS.flatMap((x) => x.profile.rivals ?? [])];
    expect(new Set(all.map((r) => r.id)).size).toBe(all.length);
    expect(new Set(all.map((r) => r.name)).size).toBe(all.length);
    for (const d of SECTORS.filter((x) => (x.tier === 'C' || x.tier === 'U') && x.id !== 'c1')) {
      expect(d.profile.rivals).toHaveLength(4);
      expect(d.profile.intro).toHaveLength(3);
      expect(d.profile.intro[0]).toContain(d.name);
    }
  });

  it('札が重ならない（同じ段の間隔とランクの段の間隔）', () => {
    for (let a = 0; a < SECTORS.length; a++)
      for (let b = a + 1; b < SECTORS.length; b++) {
        const [p, q] = [SECTORS[a].at, SECTORS[b].at];
        // 横に 19% 以上、または縦に 13% 以上はなれている
        expect(Math.abs(p[0] - q[0]) >= 19 || Math.abs(p[1] - q[1]) >= 13).toBe(true);
      }
  });

  it('Common・Uncommon のセクタにはどれも「○○で 1 位」の依頼がある', () => {
    for (const d of SECTORS.filter((x) => (x.tier === 'C' || x.tier === 'U') && x.id !== 'c1')) {
      const m = MISSIONS.find((x) => x.id === `${d.id}_top`);
      expect(m?.sector).toBe(d.id);
      expect(m?.text).toContain(d.name);
      expect(m!.reward).toBe(d.tier === 'C' ? 10000 : m!.reward);
      if (d.tier === 'U') expect(m!.reward).toBeGreaterThanOrEqual(30000);
    }
  });
});

describe('セクタの特産のルートと、詰まりの指し方', () => {
  it('港町に移ると、紙・布・宝石のルートが会社のスキルなしで使える（hasRoute）', async () => {
    const M = await import('../src/island/p1/model');
    const s = M.newP1(1, 'U', 'u1');
    expect(M.hasRoute(s, 'paper')).toBe(true);
    const c = M.newP1(1, 'C', 'c1');
    expect(M.hasRoute(c, 'paper')).toBe(false);
  });
  it('同じ細さなら、調達ではなく製造を詰まりと指す', async () => {
    const M = await import('../src/island/p1/model');
    const cap = (perMonth: number) => ({ perMonth, stopped: false }) as never;
    expect(M.bottleneck({ buy: cap(10), craft: cap(10), haul: cap(20), sell: cap(30) })).toBe('craft');
    expect(M.bottleneck({ buy: cap(5), craft: cap(10), haul: cap(20), sell: cap(30) })).toBe('buy');
  });
});
