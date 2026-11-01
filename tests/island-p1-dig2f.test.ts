/**
 * 発掘 v2 の 6 段目（docs/ISLAND_PHASE1.md「6. 研究ポイントの倍率なし・無限の強化パネル・研究への寄付・Uncommon の発表の研究 Lv」）：
 * RP はレアリティで変わらない・無限の強化パネル（RP 払い・Lv の上限なし）・研究への寄付（お金で RP・回数の上限なし）・
 * Uncommon の発表は研究 Lv の条件つき・古いセーブ（版 6 → 7）。
 */
import { describe, expect, it } from 'vitest';
import { DIG_BALANCE, DIG_SITES, DONATE, DUNGEON_FINDS, INF_PANELS, INF_SKILLS, INVESTS, PRODUCTS, RELICS, RESEARCH_NEED, RP_GAIN, SKILL, infCost, isResearch, maxLv, rpCost, skuPrice, type Tier } from '../src/island/p1/data';
import { clearCondText, presentNeedText, topicsPage } from '../src/island/p1/digmeet';
import {
  DAYS,
  LEARNABLE,
  blast,
  build,
  clearGoal,
  deserializeP1,
  dig,
  digLayout,
  digPower,
  digRepeatMs,
  donate,
  donateLock,
  donations,
  drill,
  endMonth,
  endRun,
  extRank,
  infAt,
  learn,
  levelLock,
  levelUp,
  lvOf,
  newP1,
  nextDonateCost,
  nextLevelRp,
  placeFind,
  present,
  presentLock,
  presentRes,
  relicSku,
  serializeP1,
  setLevel,
  skillLock,
  startRun,
  allowedDirs,
  type DigHit,
  type P1State,
} from '../src/island/p1/model';
import { specOf } from '../scripts/island/audit';
import { infSpend } from '../scripts/island/sim';

function lot(s: P1State, id: string): [number, number, 'rd' | 'ld' | 'lu' | 'ru'] {
  for (let j = 0; j < s.n; j++)
    for (let i = 0; i < s.n; i++) {
      const d = allowedDirs(s, id, i, j);
      if (d.length) return [i, j, d[0]];
    }
  throw new Error('no lot');
}
/** 出会いのあと・資金たっぷり・工房あり（sector のランクで） */
function game(sector = 'c1', tier: Tier = 'C', seed = 3): P1State {
  const s = newP1(seed, tier, sector);
  s.money = 1e8;
  s.tut = 99;
  s.flags.digMeet = 'done';
  s.flags.hq = true;
  s.flags.rings = ['U'];
  const b = build(s, 'workshop', ...lot(s, 'workshop'));
  if (typeof b === 'string') throw new Error(b);
  b.left = 0;
  setLevel(s, 'dig_deep', 3);
  return s;
}
/** 荒れ地 k で作業を始める */
function run(s: P1State, k = 0) {
  s.dig!.sites[k].permit = true;
  if (s.digRun) endRun(s);
  const r = startRun(s, k);
  if (typeof r === 'string') throw new Error(r);
}
/** (x, y) を層 layer まで掘り進める */
function digTo(s: P1State, x: number, y: number, layer: number): DigHit {
  for (let n = 0; n < 200; n++) {
    const r = dig(s, x, y);
    if (typeof r === 'string') throw new Error(r);
    if (r.broke && r.layer >= layer) return r;
  }
  throw new Error('not reached');
}
/** 発掘の速さ ∞・掘る力 ∞・掘る範囲 ∞ の前に要るパネルを全部 Lv5 に */
function maxPrereq(s: P1State) {
  for (const id of ['dig_power', 'dig_speed', 'dig_blast', 'dig_drill', 'u_dig_power2']) setLevel(s, id, 5);
}

describe('1. RP はレアリティで変わらない', () => {
  it('出土品 1 個ぶん（初発見・研究 Lv の上がり）はどのランクも Common と同じ表。お題・石板・発表はセクタのランクで違う', () => {
    for (const r of ['U', 'R', 'E', 'L'] as const) {
      expect(RP_GAIN[r].first, r).toBe(RP_GAIN.C.first);
      expect(RP_GAIN[r].lv, r).toEqual(RP_GAIN.C.lv);
    }
    expect([RP_GAIN.C.topic, RP_GAIN.U.topic]).toEqual([40, 100]);
    expect([RP_GAIN.C.present, RP_GAIN.U.present]).toEqual([60, 150]);
  });

  it('荒れ地で Common・Uncommon・Rare・Epic を初めて掘っても、RP は同じ +15', () => {
    const s = game('u1', 'U');
    run(s, 0);
    const L = digLayout('u1', 0)!;
    const rare = DUNGEON_FINDS.c1.R![0];
    const epic = DUNGEON_FINDS.c1.E![0];
    expect([extRank(rare), extRank(epic)]).toEqual(['R', 'E']);
    placeFind(L, { kind: 'ext', id: rare }, 0, 0, 0);
    placeFind(L, { kind: 'ext', id: epic }, 3, 3, 0);
    const r1 = digTo(s, 0, 0, 0);
    expect(r1.item).toMatchObject({ kind: 'ext', id: rare });
    expect([r1.first, r1.rp]).toEqual([true, RP_GAIN.C.first]);
    // Epic（2 × 2）：4 マスとも
    let last: DigHit | null = null;
    for (const [x, y] of [[3, 3], [4, 3], [3, 4], [4, 4]] as [number, number][])
      for (let n = 0; n < 30; n++) {
        const r = dig(s, x, y);
        if (typeof r === 'string') break;
        last = r;
        if (r.broke || r.wait) break;
      }
    expect(last?.item).toMatchObject({ kind: 'ext', id: epic });
    expect(last?.rp).toBe(RP_GAIN.C.first);
  });

  it('売上の側の差：展示館の価値は C 1・U 2・R 5・E 15・L 40 のまま。Uncommon の復刻品は Common より高い（同じランクの既存の商品の平均 × priceMul）', () => {
    expect(DIG_BALANCE.museum.val).toEqual({ C: 1, U: 2, R: 5, E: 15, L: 40 });
    const cs = RELICS.filter((p) => p.relic!.rank === 'C').map((p) => skuPrice(relicSku(p.key)));
    const us = RELICS.filter((p) => p.relic!.rank === 'U').map((p) => skuPrice(relicSku(p.key)));
    expect(cs.length).toBeGreaterThan(0);
    expect(us.length).toBeGreaterThan(0);
    expect(Math.min(...us)).toBeGreaterThan(Math.max(...cs));
    const avgU = PRODUCTS.filter((p) => !p.tier).reduce((a, p) => a + skuPrice(`${p.key}:U`), 0) / PRODUCTS.filter((p) => !p.tier).length;
    for (const v of us) {
      expect(v).toBeGreaterThanOrEqual(avgU * DIG_BALANCE.relic.priceMul * 0.88);
      expect(v).toBeLessThanOrEqual(avgU * DIG_BALANCE.relic.priceMul * 1.12);
    }
    // Rare 以上の復刻品はまだ無い（Rare の町が開いてから）
    expect(RELICS.every((p) => p.relic!.rank === 'C' || p.relic!.rank === 'U')).toBe(true);
  });
});

describe('2. 無限の強化パネル（RP 払い・Lv の上限なし）', () => {
  it('3 枚は発掘の枝の Uncommon の外周・研究パネル（RP）・Lv の上限なし。前に要るのは速さ＝手早い掘り方 Lv5・力＝重機の貸し出し Lv5・範囲＝発破 Lv5 と掘削ドリル Lv5', () => {
    expect(INF_PANELS).toEqual(['u_dig_speed_inf', 'u_dig_power_inf', 'u_dig_reach_inf']);
    for (const k of INF_SKILLS) {
      expect([k.branch, k.tier, isResearch(k), maxLv(k)], k.id).toEqual(['dig', 'U', true, Infinity]);
      expect(rpCost(k)).toBe(DIG_BALANCE.infinite.cost);
    }
    expect(SKILL.u_dig_speed_inf.reqLv).toEqual({ dig_speed: 5 });
    expect(SKILL.u_dig_power_inf.reqLv).toEqual({ u_dig_power2: 5 });
    expect(SKILL.u_dig_reach_inf.reqLv).toEqual({ dig_blast: 5, dig_drill: 5 });
  });

  it('開く条件：対応するパネルが最大 Lv になるまで取れない。取ると RP が減り、資金は減らない', () => {
    const s = game();
    s.rp = 1e6;
    setLevel(s, 'dig_speed', 4);
    expect(skillLock(s, SKILL.u_dig_speed_inf)).toBe('requires');
    setLevel(s, 'dig_speed', 5);
    expect(skillLock(s, SKILL.u_dig_speed_inf)).toBeNull();
    // 外周（Uncommon）が閉じていれば取れない
    s.flags.rings = [];
    expect(skillLock(s, SKILL.u_dig_speed_inf)).toBe('ring');
    s.flags.rings = ['U'];
    const m0 = s.money;
    expect(learn(s, 'u_dig_speed_inf')).toBeNull();
    expect([lvOf(s, 'u_dig_speed_inf'), 1e6 - s.rp, s.money]).toEqual([1, infCost(1), m0]);
  });

  it('値段：Lv1 2,000 RP から ×1.25 ずつ（50 RP 単位）。RP が足りなければ「rp」。Lv 50 でも数字が壊れない', () => {
    expect([1, 2, 3, 4, 5].map(infCost)).toEqual([2000, 2500, 3150, 3900, 4900]);
    for (let lv = 2; lv <= 60; lv++) {
      expect(infCost(lv)).toBeGreaterThan(infCost(lv - 1));
      expect(infCost(lv) / infCost(lv - 1)).toBeCloseTo(1.25, 1);
      expect(Number.isFinite(infCost(lv))).toBe(true);
    }
    const s = game();
    maxPrereq(s);
    s.rp = infCost(1) + infCost(2) - 1;
    expect(learn(s, 'u_dig_power_inf')).toBeNull();
    expect(nextLevelRp(s, SKILL.u_dig_power_inf)).toBe(infCost(2));
    expect(levelLock(s, SKILL.u_dig_power_inf)).toBe('rp');
    expect(levelUp(s, 'u_dig_power_inf')).toBe('rp');
    s.rp += 1;
    const m0 = s.money;
    expect(levelUp(s, 'u_dig_power_inf')).toBeNull();
    expect([lvOf(s, 'u_dig_power_inf'), s.rp, s.money]).toEqual([2, 0, m0]);
  });

  it('効き目：速さは長押しの間隔が短く（下限 40 ms）・力は 1 打の強さが大きく・範囲は確率が上がる。Lv が上がるほど鈍く、上限は無い（Lv 50・500 でも動く）', () => {
    const s = game();
    maxPrereq(s);
    const ms0 = digRepeatMs(s);
    const p0 = digPower(s);
    expect([ms0, p0]).toEqual([90, 7]);
    const ms = [1, 2, 10, 50, 500].map((lv) => infAt(s, 'speed', lv));
    const pw = [1, 2, 10, 50, 500].map((lv) => infAt(s, 'power', lv));
    const rc = [1, 2, 10, 50, 500].map((lv) => infAt(s, 'reach', lv));
    for (let i = 1; i < 5; i++) {
      expect(ms[i]).toBeLessThanOrEqual(ms[i - 1]);
      expect(pw[i]).toBeGreaterThan(pw[i - 1]);
      expect(rc[i]).toBeGreaterThan(rc[i - 1]);
    }
    expect(ms[0]).toBeLessThan(ms0);
    expect(Math.min(...ms)).toBeGreaterThanOrEqual(DIG_BALANCE.infinite.minMs);
    expect(pw[0]).toBeCloseTo(p0 * 1.05, 2);
    expect(rc[0]).toBeCloseTo(0.03, 5);
    // 鈍くなる：Lv1 → 2 の伸びより Lv49 → 50 の伸びが小さい
    expect(infAt(s, 'power', 50) - infAt(s, 'power', 49)).toBeLessThan(infAt(s, 'power', 2) - infAt(s, 'power', 1));
    for (const v of [...ms, ...pw, ...rc]) expect(Number.isFinite(v)).toBe(true);
    // 取ると効く（digRepeatMs・digPower）。Lv 50 でも掘れる
    setLevel(s, 'u_dig_speed_inf', 50);
    setLevel(s, 'u_dig_power_inf', 50);
    expect(digRepeatMs(s)).toBe(infAt(s, 'speed', 50));
    expect(digPower(s)).toBe(infAt(s, 'power', 50));
    expect(maxLv(SKILL.u_dig_power_inf)).toBe(Infinity);
    expect(levelLock(s, SKILL.u_dig_power_inf)).toBe(s.rp >= infCost(51) ? null : 'rp');
    run(s, 0);
    const r = dig(s, 2, 2);
    expect(typeof r).toBe('object');
  });

  it('掘る範囲 ∞：発破・ドリルが確率で 1 つ大きく。確率が 100% を超えたら（高い Lv）いつも大きい', () => {
    const s = game();
    maxPrereq(s);
    run(s, 0);
    // Lv5 の発破は 5 × 5（中心の 3, 4 から 25 マス）
    const a = blast(s, 3, 4);
    expect(Array.isArray(a) && a.length).toBe(25);
    setLevel(s, 'u_dig_reach_inf', 100);
    expect(infAt(s, 'reach', 100)).toBeGreaterThan(1);
    const b = blast(s, 3, 4);
    // 6 × 6 以上（壁の 7 × 9 に収まる範囲）
    expect(Array.isArray(b) && b.length).toBeGreaterThanOrEqual(30);
    const d = drill(s, 0, 0);
    expect(Array.isArray(d) && d.length).toBeGreaterThanOrEqual(1);
  });

  it('自動プレイ（100%）：研究パネルを取り切っていなければ回さない。取り切ったら次の Lv の安い順に RP があるだけ', () => {
    const s = game();
    maxPrereq(s);
    s.rp = 1e5;
    expect(infSpend(s)).toBe(0);
  });
});

describe('3. 研究への寄付（お金で RP・回数の上限なし）', () => {
  it('お金パネル（発掘の枝・Lv なし）。100% の数（LEARNABLE）・設備投資の一覧・監査の対象外', () => {
    expect([DONATE.branch, isResearch(DONATE), maxLv(DONATE)]).toEqual(['dig', false, 1]);
    expect(LEARNABLE().some((k) => k.donate)).toBe(false);
    expect(INVESTS.some((x) => x.id === DONATE.id)).toBe(false);
    expect(specOf(DONATE)?.out).toBeTruthy();
    expect(specOf(DONATE)?.expect).toEqual([]);
    const s = game();
    expect(skillLock(s, DONATE)).toBe('donate');
    expect(learn(s, DONATE.id)).toBe('donate');
  });

  it('開く時期：Uncommon の調査依頼状を持っている、または Common のセクタを 1 つ制覇したあと。発掘の枝が雲の中なら hidden', () => {
    const s = game();
    expect(donateLock(s)).toBe('closed');
    s.letters = ['U'];
    expect(donateLock(s)).toBeNull();
    s.letters = [];
    s.cleared = true;
    expect(donateLock(s)).toBeNull();
    s.flags.digMeet = undefined;
    expect(donateLock(s)).toBe('hidden');
  });

  it('値段：20,000 G から押すたびに ×1.15（100 G 単位）。受け取る RP は 100 で一定。資金が足りなければ money', () => {
    const s = game();
    s.letters = ['U'];
    const rp0 = s.rp;
    const got: number[] = [];
    for (let k = 0; k < 5; k++) {
      const m0 = s.money;
      const r = donate(s);
      if (typeof r === 'string') throw new Error(r);
      got.push(m0 - s.money);
      expect(r.rp).toBe(100);
      expect(r.next).toBe(nextDonateCost(s));
    }
    expect(got).toEqual([20000, 23000, 26400, 30400, 35000]);
    expect([s.rp - rp0, donations(s)]).toEqual([500, 5]);
    // 50 回目でも数字が壊れない
    s.rpBuys = 50;
    expect(Number.isFinite(nextDonateCost(s))).toBe(true);
    expect(nextDonateCost(s)).toBeGreaterThan(20000 * 1.15 ** 49);
    s.money = nextDonateCost(s) - 1;
    expect(donate(s)).toBe('money');
  });

  it('寄付の回数は会社の永続の記録（セーブに残る。値段は下がって戻らない）', () => {
    const s = game();
    s.letters = ['U'];
    donate(s);
    donate(s);
    const back = deserializeP1(serializeP1(s))!;
    expect([back.v, donations(back), nextDonateCost(back)]).toEqual([8, 2, 26400]);
  });
});

describe('4. Uncommon のお題に、この町で掘った数（v14：研究 Lv → この町で掘った数）', () => {
  /** Uncommon のセクタ・お題は全部そろえた */
  const uTown = () => {
    const s = game('u1', 'U');
    s.dig!.topics = [...DIG_SITES.u1.topics];
    return s;
  };
  it('お題がそろっても、出土品 2 種をこの町で 10 個ずつ掘っていなければ鍵（research）。会社の研究 Lv は数えない。そろえば発表できる（RP と Rare の依頼状）', () => {
    const s = uTown();
    expect(DIG_BALANCE.presentRes).toEqual({ U: { n: 2, dug: 10 } });
    expect(presentLock(s)).toBe('research');
    expect(presentRes(s)).toMatchObject({ have: 0, need: 2, dug: 10 });
    expect(present(s)).toBe('research');
    // 研究 Lv（会社で共有）が高くても、この町で掘っていなければ数えない
    s.research[DIG_SITES.u1.finds[0]] = RESEARCH_NEED[4];
    s.research[DIG_SITES.u1.finds[1]] = RESEARCH_NEED[4];
    expect(presentLock(s)).toBe('research');
    s.dig!.dug = { [DIG_SITES.u1.finds[0]]: 10, [DIG_SITES.u1.finds[1]]: 9 };
    expect(presentRes(s)).toMatchObject({ have: 1, need: 2 });
    expect(presentRes(s)!.best[0]).toEqual({ id: DIG_SITES.u1.finds[0], n: 10 });
    expect(presentLock(s)).toBe('research');
    s.dig!.dug[DIG_SITES.u1.finds[1]] = 10;
    expect(presentLock(s)).toBeNull();
    const r = present(s);
    expect(r).toMatchObject({ rp: RP_GAIN.U.present, letter: 'R' });
    expect(presentLock(s)).toBe('done');
  });

  it('お題がそろっていなければ not-yet（いままでどおり）。制覇の条件の文・月次報告に進み具合（この町で 10 個掘った出土品 1 / 2 種）', () => {
    const s = game('u1', 'U');
    s.dig!.topics = [DIG_SITES.u1.topics[0]];
    s.dig!.dug = { [DIG_SITES.u1.finds[0]]: 12 };
    expect(presentLock(s)).toBe('not-yet');
    const g = clearGoal(s);
    expect(g.res).toEqual([1, 2, 10]);
    expect(clearCondText(1, g)[0]).toBe('制覇の条件：1 位を 2 か月（いま 1 / 2）／研究成果の発表 1 / 4 お題・この町で 10 個掘った出土品 1 / 2 種');
    expect(clearCondText(1, g)[1]).toBe('条件：1 位 2 か月 1/2・発表 1/4・掘 1/2');
    expect(presentNeedText(g)[0]).toBe('1 / 4 お題・この町で 10 個掘った出土品 1 / 2 種');
    // 月次報告の goal にも
    for (const r of s.rivals) {
      r.base = 0;
      r.sells = {};
    }
    s.open = 0;
    s.monthSales = { Sensu: 50000 };
    s.day += DAYS;
    const rep = endMonth(s);
    expect(rep.goal).toEqual({ present: false, got: 1, all: 4, res: [1, 2, 10] });
    expect(topicsPage('u1')).toContain('この町の出土品 2 種を[[この町で 10 個ずつ]]');
  });

  it('Common は今のまま（お題だけ）。研究 Lv の条件は無い', () => {
    const s = game('c1', 'C');
    s.dig!.topics = [...DIG_SITES.c1.topics];
    expect(presentRes(s)).toBeNull();
    expect(presentLock(s)).toBeNull();
    expect(clearGoal(s).res).toBeNull();
    expect(clearCondText(1, { present: false, got: 1, all: 3 })[0]).toBe('制覇の条件：1 位を 2 か月（いま 1 / 2）／研究成果の発表 1 / 3 お題');
  });
});

describe('5. 古いセーブ（版 6 → 7）', () => {
  it('無限の強化パネルは Lv0・寄付は 0 回。Uncommon で発表済みのセクタは、研究 Lv が足りなくても発表済みのまま', () => {
    const s = game('u1', 'U');
    s.dig!.topics = [...DIG_SITES.u1.topics];
    s.presented = ['c1', 'c2', 'u1'];
    const o = JSON.parse(serializeP1(s));
    o.v = 6;
    delete o.rpBuys;
    const back = deserializeP1(JSON.stringify(o))!;
    expect(back.v).toBe(8);
    expect(donations(back)).toBe(0);
    for (const id of INF_PANELS) expect(lvOf(back, id)).toBe(0);
    expect(presentLock(back)).toBe('done');
    expect(clearGoal(back)).toMatchObject({ present: true, res: [2, 2, 10] });
  });
});
