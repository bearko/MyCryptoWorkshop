/**
 * スキルツリー v2（docs/ISLAND_PHASE1.md「スキルツリー」）：外周・エンブレム・ゴールドダスト・新しいパネルの効き目。
 */
import { describe, expect, it } from 'vitest';
import { brandPull } from '../src/island/p1/company';
import { ADS, BRANCHES, DEPOT, MARKET, MISSIONS, P1B, SKILL, SKILLS, SHOP, STORE, TOP_STREAK, sku } from '../src/island/p1/data';
import {
  adCost,
  batchOf,
  cartsOf,
  claim,
  craftDays,
  depotLink,
  deserializeP1,
  endMonth,
  hireSlots,
  knownStart,
  learn,
  legDays,
  matPrice,
  newP1,
  ojtMonth,
  openGate,
  openRing,
  priceAt,
  rivalOffers,
  ringOpen,
  ringsDue,
  serializeP1,
  skillLock,
  storageCap,
  upkeepOf,
  type P1State,
  type PBuilding,
  type ShopState,
} from '../src/island/p1/model';
import { HUBPOS, POS, UNPLACED } from '../src/island/p1/treelayout';

const rich = (seed = 5): P1State => {
  const s = newP1(seed);
  s.money = 1_000_000;
  return s;
};

describe('スキルツリー v2：データと配置', () => {
  it('枝は 8 本（システムが新しい）。どのパネルも枝の配置に入っていて、パネルどうし・根もとと重ならない', () => {
    expect(BRANCHES.map((b) => b.key)).toEqual(['shop', 'craft', 'logi', 'buy', 'people', 'ops', 'sys', 'tech']);
    expect(UNPLACED).toEqual([]);
    const ps = [...POS.entries()];
    for (let i = 0; i < ps.length; i++) for (let j = i + 1; j < ps.length; j++) expect(Math.hypot(ps[i][1].x - ps[j][1].x, ps[i][1].y - ps[j][1].y), `${ps[i][0]}–${ps[j][0]}`).toBeGreaterThan(1.05);
    for (const [, p] of HUBPOS) for (const [id, q] of ps) expect(Math.hypot(p.x - q.x, p.y - q.y), id).toBeGreaterThan(0.9);
  });

  it('先に要るスキルは全部ある。✨ は資金 0・ダスト 3、封印は E・L に枝ごとに 1 つずつ', () => {
    for (const k of SKILLS) for (const r of k.requires ?? []) expect(SKILL[r], `${k.id} → ${r}`).toBeTruthy();
    const dust = SKILLS.filter((k) => k.dust);
    expect(dust.map((k) => k.branch).sort()).toEqual(['buy', 'craft', 'logi', 'ops', 'people', 'shop', 'sys']);
    for (const k of dust) expect([k.cost, k.dust, k.tier ?? 'C']).toEqual([0, 3, 'C']);
    for (const b of BRANCHES) for (const tier of ['E', 'L'] as const) expect(SKILLS.filter((k) => k.branch === b.key && k.tier === tier && k.sealed)).toHaveLength(1);
  });

  it('既存のパネルの値段は上げていない', () => {
    const old: Record<string, number> = { host: 4000, shop2: 6000, display: 3500, shop3: 14000, jig: 4000, pot: 10000, jig2: 7000, chair: 3000, loading: 2500, shortcut: 3500, hub: 5000, route_cloth: 2000, route_paper: 2000, route_gem: 6000, bulk: 4000, stock1: 3000, stock2: 8000, bulk2: 7000, stock3: 15000, swift: 3000, eye: 2500, scoutmap: 3000, hire: 3000, lounge: 2500, pace1: 4000, pace2: 12000, b_sign: 12000, b_premium: 30000, b_partner: 15000, b_ads: 10000, b_scout: 12000, t_master: 15000 };
    for (const [id, c] of Object.entries(old)) expect(SKILL[id].cost, id).toBe(c);
  });

  it('「○○で 1 位」の依頼はダスト 1（Uncommon は 2）。アンコモン 5 個・エリア 3 位・アンコモン開発も 1', () => {
    for (const m of MISSIONS.filter((x) => x.id.endsWith('_top'))) expect(m.dust, m.id).toBe(m.sector?.startsWith('u') ? 2 : 1);
    for (const id of ['uncommon', 'rank3', 'u1_dev']) expect(MISSIONS.find((m) => m.id === id)?.dust).toBe(1);
  });
});

describe('エンブレム・ゴールドダスト', () => {
  it('関所の開通でエンブレム +1', () => {
    const s = rich();
    expect(s.emblem).toBe(0);
    expect(openGate(s)).toBe(true);
    expect(s.emblem).toBe(1);
  });

  it('セクタを制覇した月にエンブレム +1（守った月は増えない）', () => {
    const s = rich();
    for (const r of s.rivals) r.base = 0;
    s.open = 0;
    s.topStreak = TOP_STREAK - 1;
    s.monthSales = { Sensu: 50000 };
    const r = endMonth(s);
    expect(s.cleared).toBe(true);
    expect(r.emblem).toBe(1);
    expect(s.emblem).toBe(1);
    s.monthSales = { Sensu: 50000 };
    endMonth(s);
    expect(s.emblem).toBe(1);
  });

  it('依頼の報酬を受け取ると、ゴールドダストが増える（セーブにも残る）', () => {
    const s = rich();
    s.missions.rank3 = 'done';
    expect(claim(s, 'rank3')).toBeNull();
    expect(s.dust).toBe(1);
    expect(deserializeP1(serializeP1(s))!.dust).toBe(1);
  });

  it('古いセーブは 0 から', () => {
    const o = JSON.parse(serializeP1(newP1(2)));
    delete o.emblem;
    delete o.dust;
    const s = deserializeP1(JSON.stringify(o))!;
    expect([s.emblem, s.dust]).toEqual([0, 0]);
  });

  it('✨ のパネルは資金（GUM）では取れず、ダストを使う', () => {
    const s = rich();
    const before = s.money;
    expect(learn(s, 'd_shop')).toBe('dust');
    expect(s.money).toBe(before);
    s.dust = 4;
    expect(learn(s, 'd_shop')).toBeNull();
    expect(s.money).toBe(before);
    expect(s.dust).toBe(1);
    expect(learn(s, 'd_craft')).toBe('dust');
  });
});

describe('外周（ランクのエリア）', () => {
  it('Uncommon のパネルは、Uncommon のセクタに出店して外周を開くまで取れない', () => {
    const s = rich();
    s.brand = 99;
    s.emblem = 5;
    learn(s, 'host');
    expect(skillLock(s, SKILL.b_sign)).toBe('ring');
    expect(learn(s, 'b_sign')).toBe('ring');
    expect(ringsDue(s)).toEqual([]);
    s.land = { cur: 'c1', mine: ['c1', 'u1'], recs: {} };
    expect(ringsDue(s)).toEqual(['U']);
    expect(openRing(s, 'U')).toBe(true);
    expect(openRing(s, 'U')).toBe(false);
    expect(ringOpen(s, 'U')).toBe(true);
    expect(ringsDue(s)).toEqual([]);
    expect(learn(s, 'b_sign')).toBeNull();
    // フラグはセーブに残る
    expect(ringOpen(deserializeP1(serializeP1(s))!, 'U')).toBe(true);
  });

  it('エンブレムが足りないと取れない（持っている数で判定し、減らない）', () => {
    const s = rich();
    s.flags.rings = ['U', 'R'];
    for (const id of ['jig', 'five_s', 'jig2', 'kaizen']) expect(learn(s, id)).toBeNull();
    expect(learn(s, 'night')).toBe('emblem');
    s.emblem = 1;
    expect(learn(s, 'night')).toBeNull();
    expect(s.emblem).toBe(1);
    expect(learn(s, 'line')).toBe('emblem');
    s.emblem = 3;
    expect(learn(s, 'line')).toBeNull();
  });

  it('封印（Epic・Legendary）と準備中（レアの技）は取れない', () => {
    const s = rich();
    s.flags.rings = ['U', 'R', 'E', 'L'];
    expect(learn(s, 'seal_shop_e')).toBe('sealed');
    s.emblem = 9;
    for (const id of ['t_wood', 't_paper', 't_metal']) s.skills.push(id);
    s.skills.push('t_master');
    expect(learn(s, 't_rare')).toBe('soon');
  });
});

describe('新しいパネルの効き目', () => {
  const shopOf = (_s: P1State, shelves: (string | null)[]): [PBuilding, ShopState] => {
    const b: PBuilding = { uid: 99, id: 'import', i: 3, j: 3, dir: 'rd', left: 0, owner: 'me' };
    const sh: ShopState = { uid: 99, shelves: shelves as ShopState['shelves'], staff: null, part: 1, storage: {}, shelf: {}, sat: 1, carry: {}, rev: 0, cost: 0, last: null };
    return [b, sh];
  };

  it('5S・カイゼン：クラフトの日数 ×0.95 × 0.9', () => {
    const s = rich();
    const x = sku('Sensu', 'C');
    const d0 = craftDays(s, x);
    s.skills.push('five_s', 'kaizen');
    expect(craftDays(s, x)).toBeCloseTo(d0 * 0.95 * 0.9, 6);
  });

  it('ロットの改善：基礎の商品だけ 1 ロット +1。共通の型：アンコモン +1', () => {
    const s = rich();
    expect(batchOf(sku('Sensu', 'C'), s)).toBe(4);
    s.skills.push('lot', 'mold');
    expect(batchOf(sku('Sensu', 'C'), s)).toBe(5);
    expect(batchOf(sku('Knife', 'C'), s)).toBe(4);
    expect(batchOf(sku('Sensu', 'U'), s)).toBe(3);
  });

  it('ABC 分析・長期契約・産地との直接取引・商社との提携（✨）：素材の値段', () => {
    const s = rich();
    const p0 = matPrice(s, 'iron');
    s.skills.push('abc', 'contract', 'direct', 'd_buy');
    expect(matPrice(s, 'iron')).toBe(Math.round(150 * 0.95 * 0.95 * 0.9 * 0.9));
    expect(p0).toBe(150);
  });

  it('共同配送：便 +1・配送センター（✨）：運ぶ日数 ×0.7・クロスドッキング：拠点まで ×0.2', () => {
    const s = rich();
    const c0 = cartsOf(s);
    const l0 = legDays(s, 10);
    expect(depotLink(s)).toBe(DEPOT.link);
    s.skills.push('joint', 'd_logi', 'crossdock');
    expect(cartsOf(s)).toBe(c0 + 1);
    expect(legDays(s, 10)).toBeCloseTo(l0 * 0.7, 6);
    expect(depotLink(s)).toBe(0.2);
  });

  it('在庫管理システム：お店の裏 +10', () => {
    const s = rich();
    const [b] = shopOf(s, [null]);
    expect(storageCap(b, s)).toBe(SHOP.storageCap);
    s.skills.push('inventory');
    expect(storageCap(b, s)).toBe(SHOP.storageCap + 10);
    expect(STORE.base).toBeGreaterThan(0);
  });

  it('セット販売：2 種類以上並べているお店だけ +5%', () => {
    const s = rich();
    s.skills.push('set');
    const x = sku('Sensu', 'C');
    const [, one] = shopOf(s, [x]);
    const [, two] = shopOf(s, [x, sku('Scissors', 'C')]);
    expect(priceAt(s, x, one)).toBe(900);
    expect(priceAt(s, x, two)).toBe(Math.round(900 * 1.05));
  });

  it('予算管理：維持費 −10%・季節の催事：宣伝 −30%・需要予測 AI：認知 0.5 から', () => {
    const s = rich();
    const b: PBuilding = { uid: 1, id: 'general_store', i: 0, j: 0, dir: 'rd', left: 0, owner: 'me' };
    s.skills.push('budget', 'fair', 'forecast');
    expect(upkeepOf(s, b)).toBe(Math.round(P1B.general_store.upkeep * 0.9));
    expect(adCost(s, 'poster')).toBe(Math.round(ADS.find((a) => a.id === 'poster')!.cost * 0.7));
    expect(knownStart(s)).toBe(0.5);
  });

  it('採用枠の拡大：候補 4 人・ブランド戦略室（✨）：ブランド力の効き目 ×2（最大 +60%）', () => {
    const s = rich();
    expect(hireSlots(s)).toBe(3);
    s.skills.push('slots');
    expect(hireSlots(s)).toBe(4);
    expect(brandPull(200)).toBeCloseTo(1.2, 6);
    expect(brandPull(200, true)).toBeCloseTo(1.4, 6);
    expect(brandPull(999, true)).toBeCloseTo(1.6, 6);
  });

  it('OJT：担当のある人の、担当に効く能力が +1（担当の無い人は上がらない）', () => {
    const s = rich();
    s.skills.push('ojt');
    const [a, b] = s.staff;
    a.task = 'transport';
    b.task = null;
    const phy = a.stats.phy;
    const bs = { ...b.stats };
    expect(ojtMonth(s)).toBe(1);
    expect(a.stats.phy).toBe(phy + 1);
    expect(b.stats).toEqual(bs);
  });

  it('ポイントカード：他社の反撃の効き目が半分（×1.25 → ×1.125）', () => {
    const s = rich();
    s.rally = 2;
    const w0 = rivalOffers(s, 'Lantern')[0].w;
    s.skills.push('point');
    const w1 = rivalOffers(s, 'Lantern')[0].w;
    expect(w1 / w0).toBeCloseTo((1 + (MARKET.rally - 1) / 2) / MARKET.rally, 6);
  });
});
