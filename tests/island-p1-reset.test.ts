/**
 * 発掘 v2 の 7 段目（docs/ISLAND_PHASE1.md「ランクアップの災害と復興」）：
 * 会社として初めて上のランクへ進出するときの災害と徴収（所持金・建物・お金のパネルがリセット。RP・RP のパネル・ヒーローは残る）・
 * 支度金・帳簿・荒れ地の作り直しと再発掘の RP・手で直す（修繕・取り壊し）・ヒーローに任せる（支援金・割高・遅い・売上が戻る・尽きたら止まる・伸び率）・
 * 古いセーブ。Uncommon の発表は「この町で掘った数」（tests/island-p1-dig2f.test.ts）。
 */
import { describe, expect, it } from 'vitest';
import { DIG_SITES, INVEST, MANAGER, P1B, RESEARCH_NEED, RESET, RP_GAIN, SKILL, isResearch } from '../src/island/p1/data';
import { delegateCostOf, managerApt, managerRate, pl, repairCostOf, repairDaysOf, reviveScale, RUIN, sectorState } from '../src/island/p1/company';
import { moveTo, moveFee, recOf } from '../src/island/p1/land';
import {
  allowedDirs,
  build,
  closeCompanyMonth,
  deserializeP1,
  dig,
  digLayout,
  donate,
  donations,
  newP1,
  openGate,
  placeFind,
  reviveSite,
  serializeP1,
  setLevel,
  setPart,
  startRun,
  step,
  endRun,
  type DigHit,
  type P1State,
  type PBuilding,
} from '../src/island/p1/model';
import { clearRuin, delegate, delegateLock, rankUpTier, repair, repairAll, repairAllCost, repairLock, reviveView, ruinsOf } from '../src/island/p1/reset';
import { INVEST_SPEC } from '../scripts/island/audit';

function lot(s: P1State, id: string, skip = 0): [number, number, 'rd' | 'ld' | 'lu' | 'ru'] {
  let n = 0;
  for (let j = 0; j < s.n; j++)
    for (let i = 0; i < s.n; i++) {
      const d = allowedDirs(s, id, i, j);
      if (d.length && n++ >= skip) return [i, j, d[0]];
    }
  throw new Error('no lot');
}
function put(s: P1State, id: string, skip = 0): PBuilding {
  const b = build(s, id, ...lot(s, id, skip));
  if (typeof b === 'string') throw new Error(b);
  // 工事は次の日に終わる（お店の札・作業台ができる）
  b.left = 1;
  step(s);
  return b;
}
const MONEY = 'host';
const RESEARCH = 'hire';
const MGR = 10001;
/**
 * タオックスで工房・お店 2 軒・倉庫（設備投資つき）。お金のパネル・研究パネル・寄付・研究ノート・レシピ・制覇・ブランド力・依頼状。関所は開通。
 */
function town(): P1State {
  const s = newP1(9);
  s.tut = 99;
  s.money = 1e7;
  s.flags.digMeet = 'done';
  s.flags.hq = true;
  openGate(s);
  put(s, 'workshop');
  const shop = put(s, 'general_store', 3);
  put(s, 'general_store', 12);
  put(s, 'warehouse', 20);
  s.buildings.find((b) => b.uid === shop.uid)!.inv = { shelves: 1 };
  setPart(s, shop.uid, 1);
  s.mats = { cloth: 30 };
  s.stock = { 'Sensu:C': 5 };
  setLevel(s, MONEY, 3);
  setLevel(s, RESEARCH, 1);
  setLevel(s, 'dig_power', 2);
  s.rp = 1234;
  s.research[1011] = 7;
  s.recipes = { x: { at: 1 } };
  s.cleared = true;
  s.presented = ['c1', 'c2'];
  s.letters = ['U'];
  s.brand = 42;
  s.emblem = 3;
  donate(s);
  donate(s);
  return s;
}

describe('1. いつ起きるか', () => {
  it('会社として初めて上のランクへ進出するときだけ。同じランクの 2 つ目・戻るときは起きない', () => {
    const s = town();
    expect(rankUpTier(s, 'c2')).toBeNull();
    expect(rankUpTier(s, 'u1')).toBe('U');
    // Common どうしは今のまま（出店許可申請の費用を払う）
    const fee = moveFee(s, 'c2');
    expect(fee).toBeGreaterThan(0);
    const m0 = s.money;
    expect(moveTo(s, 'c2', MGR)).toBeNull();
    expect(s.money).toBe(m0 - fee);
    expect(s.resets ?? []).toHaveLength(0);
    // 戻る：起きない
    expect(moveTo(s, 'c1', null)).toBeNull();
    expect(s.resets ?? []).toHaveLength(0);
    // Uncommon：費用は取らない（徴収がその代わり）
    expect(moveFee(s, 'u1')).toBe(0);
    expect(moveTo(s, 'u1', MGR)).toBeNull();
    expect(s.resets).toHaveLength(1);
    expect(s.resets![0]).toMatchObject({ tier: 'U', to: 'u1', grant: RESET.grant });
    // 2 つ目の Uncommon・Common へ戻る：起きない
    expect(rankUpTier(s, 'u2')).toBeNull();
    expect(rankUpTier(s, 'c3')).toBeNull();
    s.money = 1e7;
    expect(moveTo(s, 'u2', null)).toBeNull();
    expect(moveTo(s, 'c1', null)).toBeNull();
    expect(s.resets).toHaveLength(1);
  });
});

describe('2. 失うもの・残るもの', () => {
  it('所持金は全額徴収 → 支度金。帳簿は特別損失「復興の徴収」と特別利益「復興の支度金」', () => {
    const s = town();
    const before = s.money;
    expect(moveTo(s, 'u1', MGR)).toBeNull();
    expect(s.money).toBe(RESET.grant);
    expect(RESET.grant).toBe(30000);
    expect(s.resets![0].levy).toBe(Math.round(before));
    expect(s.books!.cur.levy).toBe(Math.round(before));
    expect(s.books!.cur.grant).toBe(RESET.grant);
    const p = pl(s.books!.cur);
    expect(p.special).toBe(s.books!.cur.build + s.books!.cur.fees + Math.round(before) - RESET.grant);
  });

  it('建物は廃墟（その場所に残り、働かない）・在庫・素材・アルバイト・設備投資は 0。お金のパネルは未取得', () => {
    const s = town();
    const mine = s.buildings.filter((b) => b.owner === 'me').map((b) => ({ uid: b.uid, id: b.id, i: b.i, j: b.j }));
    expect(moveTo(s, 'u1', MGR)).toBeNull();
    const snap = recOf(s, 'c1').snap as unknown as P1State;
    const ruins = snap.buildings.filter((b) => b.owner === RUIN);
    expect(ruins.map((b) => ({ uid: b.uid, id: b.id, i: b.i, j: b.j }))).toEqual(mine);
    expect(snap.buildings.some((b) => b.owner === 'me')).toBe(false);
    expect(ruins.every((b) => !b.inv && b.left === 0)).toBe(true);
    expect(snap.shops).toEqual({});
    expect(snap.slots).toEqual([]);
    expect(snap.stock).toEqual({});
    expect(snap.mats).toEqual({});
    expect(s.resets![0].ruins.c1).toBe(mine.length);
    // お金のパネル：未取得（Lv も消える）。研究パネルは残る
    expect(SKILL[MONEY].cat).toBe('money');
    expect(s.skills.includes(MONEY)).toBe(false);
    expect(s.skillLv[MONEY]).toBeUndefined();
    expect(s.skills.includes('dig_power')).toBe(false);
    expect(s.skills.includes(RESEARCH)).toBe(true);
    expect(s.skills.every((id) => !SKILL[id] || isResearch(SKILL[id]))).toBe(true);
    // 行き先の町は新しい区画（在庫・素材はその町のはじめ）
    expect(s.sector).toBe('u1');
    expect(s.buildings.some((b) => b.owner === 'me' || b.owner === RUIN)).toBe(false);
  });

  it('残るもの：RP・RP のパネル・ヒーローの能力値・研究ノート・レシピ・制覇・エンブレム・ブランド力・依頼状・寄付の回数・ランドマップ', () => {
    const s = town();
    const stats = s.staff.map((x) => ({ hero: x.hero, stats: { ...x.stats } }));
    const nBuys = donations(s);
    const rp = s.rp;
    expect(moveTo(s, 'u1', MGR)).toBeNull();
    expect(s.rp).toBe(rp);
    expect(s.staff.map((x) => ({ hero: x.hero, stats: x.stats }))).toEqual(stats);
    expect(s.research[1011]).toBe(7);
    expect(s.recipes.x).toBeTruthy();
    expect((recOf(s, 'c1').snap as unknown as P1State).cleared).toBe(true);
    expect(s.emblem).toBeGreaterThanOrEqual(3);
    expect(s.brand).toBeGreaterThanOrEqual(42);
    expect(s.letters).toContain('U');
    expect(s.presented).toEqual(['c1', 'c2']);
    expect(donations(s)).toBe(nBuys);
    expect(s.land!.mine).toEqual(['c1', 'u1']);
    // ヒーローの仕事の割り当ては外れる（マネージャーはそのまま：復興の担当の第一候補）
    expect(s.staff.filter((x) => x.hero !== MGR).every((x) => x.task == null)).toBe(true);
    expect(s.staff.find((x) => x.hero === MGR)!.task).toBe('manager');
    expect(recOf(s, 'c1').manager).toBe(MGR);
    // 被災した町の記録
    expect(recOf(s, 'c1').revive).toMatchObject({ fund: 0, all: 4, months: 0 });
    expect(recOf(s, 'c1').capital).toBe(0);
  });

  it('荒れ地は作り直し（新しい種・新しい壁・許可は 1 か所目から）。復興した土地とその上の建物（展示館）は荒れ地に戻り、飾っていた遺物は研究ノートへ', () => {
    const s = town();
    // 荒れ地 0 を掘りきって復興 → 展示館を建てて遺物を飾る
    const d = s.dig!;
    const L0 = digLayout('c1', 0)!;
    d.sites[0].permit = true;
    d.sites[0].done = true;
    d.sites[0].depth.fill(L0.depth);
    d.sites[0].hp.fill(0);
    expect(reviveSite(s, 0)).toBeTruthy();
    const mus = put(s, 'museum');
    expect(mus.id).toBe('museum');
    s.museum!.items = [1011];
    s.museum!.lv = 1;
    s.dig!.dungeon = { site: 3, runs: 2, best: 5, st: null, found: [] };
    expect(moveTo(s, 'u1', MGR)).toBeNull();
    const snap = recOf(s, 'c1').snap as unknown as P1State;
    expect(snap.buildings.some((b) => b.id === 'museum')).toBe(false);
    expect(s.museum).toMatchObject({ at: null, items: [], lv: 0 });
    expect(snap.dig!.round).toBe(1);
    expect(snap.dig!.sites.every((x) => !x.permit && !x.done && !x.revived && x.depth.every((v) => v === 0))).toBe(true);
    expect(snap.dig!.topics).toEqual([]);
    expect(snap.dig!.dungeon ?? null).toBeNull();
    // 最深記録は残す
    expect(snap.dig!.best).toBe(5);
    // 新しい壁（0 周目と違う）
    expect(digLayout('c1', 0, 1)!.finds).not.toEqual(digLayout('c1', 0)!.finds);
    expect(s.loop).toEqual({ n: 1, found: [], tablets: [] });
  });
});

describe('3. 再発掘と RP', () => {
  /** (x, y) を層 layer まで掘る */
  function digTo(s: P1State, x: number, y: number): DigHit {
    for (let n = 0; n < 200; n++) {
      const r = dig(s, x, y);
      if (typeof r === 'string') throw new Error(r);
      if (r.broke) return r;
    }
    throw new Error('not reached');
  }
  it('この周回で初めて掘り出したエクステは、初発見の RP がまた入る（同じ周回で 2 回は入らない）。研究 Lv は残る', () => {
    const s = town();
    const id = DIG_SITES.c1.finds[0];
    s.research[id] = RESEARCH_NEED[RESEARCH_NEED.length - 1] + 5;
    expect(moveTo(s, 'u1', MGR)).toBeNull();
    s.money = 1e6;
    expect(moveTo(s, 'c1', null)).toBeNull();
    expect(s.dig!.round).toBe(1);
    // 荒れ地 0 の手前の層に、研究済みの出土品を 2 つ
    const L = digLayout('c1', 0, 1)!;
    placeFind(L, { kind: 'ext', id }, 0, 0, 0);
    placeFind(L, { kind: 'ext', id }, 1, 0, 0);
    s.dig!.sites[0].permit = true;
    const r = startRun(s, 0);
    expect(typeof r).not.toBe('string');
    const rp0 = s.rp;
    const a = digTo(s, 0, 0);
    expect(a.item).toMatchObject({ kind: 'ext', id });
    expect(a.again).toBe(true);
    expect(a.first).toBeFalsy();
    expect(a.rp).toBe(RP_GAIN.C.first);
    expect(s.rp - rp0).toBe(RP_GAIN.C.first);
    const b = digTo(s, 1, 0);
    expect(b.item).toMatchObject({ kind: 'ext', id });
    expect(b.again).toBeFalsy();
    expect(b.rp).toBe(0);
    endRun(s);
    // この町で掘った数（Uncommon の発表の条件と同じ数え方）
    expect(s.dig!.dug?.[id]).toBe(2);
  });

  it('0 周目（災害の前）は今のまま：研究ノートに数があれば初発見の RP は入らない', () => {
    const s = town();
    const id = DIG_SITES.c1.finds[0];
    s.research[id] = 3;
    const L = digLayout('c1', 0)!;
    placeFind(L, { kind: 'ext', id }, 0, 0, 0);
    s.dig!.sites[0].permit = true;
    startRun(s, 0);
    const r = digTo(s, 0, 0);
    expect(r.again).toBeFalsy();
    expect(r.first).toBeFalsy();
    endRun(s);
  });
});

describe('4. 手で直す（修繕・取り壊し）', () => {
  it('修繕：元の建物の値段の 40%（最低 1,000 G）・工期は短く。設備投資の段は 0 から。工房は 1 つまで', () => {
    expect(repairCostOf('general_store')).toBe(Math.round(P1B.general_store.cost * 0.4));
    expect(repairCostOf('workshop')).toBe(RESET.repair.min);
    expect(repairDaysOf('boutique')).toBeLessThan(P1B.boutique.days);
    expect(repairDaysOf('boutique')).toBe(Math.ceil(P1B.boutique.days * 0.4));
    const s = town();
    expect(moveTo(s, 'u1', MGR)).toBeNull();
    s.money = 2000;
    expect(moveTo(s, 'c1', null)).toBeNull();
    expect(s.money).toBe(2000);
    const ruins = ruinsOf(s);
    expect(ruins).toHaveLength(4);
    const shop = ruins.find((b) => b.id === 'general_store')!;
    const ws = ruins.find((b) => b.id === 'workshop')!;
    s.money = 100;
    expect(repairLock(s, shop.uid)).toBe('money');
    s.money = 100000;
    const r = repair(s, shop.uid);
    expect(r).toEqual({ cost: repairCostOf('general_store'), days: repairDaysOf('general_store') });
    expect(s.money).toBe(100000 - repairCostOf('general_store'));
    const b = s.buildings.find((x) => x.uid === shop.uid)!;
    expect(b.owner).toBe('me');
    expect(b.left).toBe(repairDaysOf('general_store'));
    expect(b.inv).toBeUndefined();
    // 工房を新しく建てていたら、工房の廃墟は直せない
    const nw: PBuilding = { uid: 999, id: 'workshop', i: 0, j: 0, dir: 'rd', left: 0, owner: 'me' };
    s.buildings.push(nw);
    expect(repairLock(s, ws.uid)).toBe('limit');
    s.buildings.pop();
    // 全部修繕（合計）
    const all = repairAllCost(s);
    expect(all.n).toBe(3);
    expect(all.cost).toBe(ruinsOf(s).reduce((a, x) => a + repairCostOf(x.id), 0));
    expect(repairAll(s)).toEqual(all);
    expect(ruinsOf(s)).toHaveLength(0);
    // 直したら、工期のあと元どおり働く（お店の札ができる）
    for (let k = 0; k < 6; k++) step(s);
    expect(s.shops[shop.uid]).toBeTruthy();
  });

  it('取り壊す：無料で空き地に', () => {
    const s = town();
    expect(moveTo(s, 'u1', MGR)).toBeNull();
    expect(moveTo(s, 'c1', null)).toBeNull();
    const m0 = s.money;
    const r = ruinsOf(s)[1];
    expect(clearRuin(s, r.uid)).toBe(true);
    expect(s.money).toBe(m0);
    expect(s.buildings.some((b) => b.uid === r.uid)).toBe(false);
    expect(allowedDirs(s, r.id, r.i, r.j).length).toBeGreaterThan(0);
  });
});

describe('5. ヒーローに任せる（復興支援金）', () => {
  /** Uncommon へ移ったあと：タオックスは被災・マネージャーは MGR・離れたときの売上 */
  function after(): P1State {
    const s = town();
    expect(moveTo(s, 'u1', MGR)).toBeNull();
    recOf(s, 'c1').base = { rev: 100000, matRate: 0.3, fixed: 5000 };
    return s;
  }
  it('支援金を送る（所持金から）。担当はそのセクタのマネージャー。いまいるセクタ・足りないときは送れない', () => {
    const s = after();
    expect(delegateLock(s, 'u1', MGR, 0)).toBe('here');
    expect(delegateLock(s, 'c1', MGR, 1e9)).toBe('money');
    expect(RESET.delegate.funds).toEqual([10000, 30000, 80000]);
    expect(delegate(s, 'c1', 10002, 10000)).toBeNull();
    expect(s.money).toBe(RESET.grant - 10000);
    expect(recOf(s, 'c1').manager).toBe(10002);
    expect(s.staff.find((x) => x.hero === 10002)).toMatchObject({ task: 'manager', target: 'c1' });
    // 前の担当は本社の仕事に戻る
    expect(s.staff.find((x) => x.hero === MGR)!.task).toBeNull();
    expect(reviveView(s, 'c1')).toMatchObject({ ruins: 4, fixed: 0, all: 4, fund: 10000, hero: 10002 });
  });

  it('毎月の締めで、担当が 1〜3 軒（能力値で）を割高（× 1.5）に直す。売上は直った割合で戻る。全部直ったら残りは本社へ', () => {
    const s = after();
    const st = s.staff.find((x) => x.hero === MGR)!;
    st.stats = { ...st.stats, phy: 40, int: 40, agi: 40 };
    expect(delegate(s, 'c1', MGR, 30000)).toBeNull();
    const rec = recOf(s, 'c1');
    const costs = (rec.snap!.buildings as PBuilding[]).filter((b) => b.owner === RUIN).map((b) => delegateCostOf(b.id));
    expect(costs.every((c, k) => c === Math.round(repairCostOf((rec.snap!.buildings as PBuilding[]).filter((b) => b.owner === RUIN)[k].id) * 1.5))).toBe(true);
    const c1 = closeCompanyMonth(s).managed.find((x) => x.id === 'c1')!;
    // 能力値の平均 40 → 1 か月に 2 軒
    expect(c1.revive).toMatchObject({ fixed: 2, left: 2, all: 4 });
    expect(rec.revive!.fund).toBe(30000 - c1.revive!.spent);
    expect(reviveScale(rec)).toBeCloseTo(2 / 4, 5);
    // 売上：離れたときの売上 × 直った割合 × 適性の倍率（± ゆらぎ）
    const rate = managerRate(managerApt(st.stats));
    expect(c1.rev).toBeGreaterThan(100000 * 0.5 * rate * (1 - MANAGER.noise) - 1);
    expect(c1.rev).toBeLessThan(100000 * 0.5 * rate * (1 + MANAGER.noise) + 1);
    const m0 = s.money;
    const c2 = closeCompanyMonth(s).managed.find((x) => x.id === 'c1')!;
    expect(c2.revive).toMatchObject({ fixed: 2, left: 0 });
    expect(reviveScale(rec)).toBe(1);
    expect(rec.revive!.doneAt).toBe(2);
    // 残りの支援金は本社へ
    expect(c2.revive!.refund).toBeGreaterThan(0);
    expect(rec.revive!.fund).toBe(0);
    expect(s.money).toBe(m0 + c2.revive!.refund + c2.toHQ);
  });

  it('遅い：能力値が低いと 1 か月に 1 軒、高いと 3 軒。支援金が尽きたら止まる（報告に「尽きた」）。追加で送れる', () => {
    const s = after();
    const st = s.staff.find((x) => x.hero === MGR)!;
    st.stats = { ...st.stats, phy: 10, int: 10, agi: 10 };
    expect(delegate(s, 'c1', MGR, 10000)).toBeNull();
    expect(closeCompanyMonth(s).managed.find((x) => x.id === 'c1')!.revive!.fixed).toBe(1);
    // 支援金を 1 G に：直せない・止まる
    recOf(s, 'c1').revive!.fund = 1;
    const r = closeCompanyMonth(s).managed.find((x) => x.id === 'c1')!.revive!;
    expect(r).toMatchObject({ fixed: 0, out: true });
    expect(reviveView(s, 'c1')!.out).toBe(true);
    // 追加で送ると、また進む
    s.money = 1e6;
    expect(delegate(s, 'c1', MGR, 80000)).toBeNull();
    expect(reviveView(s, 'c1')!.out).toBe(false);
    st.stats = { ...st.stats, phy: 70, int: 70, agi: 70 };
    expect(closeCompanyMonth(s).managed.find((x) => x.id === 'c1')!.revive!.fixed).toBe(3);
  });

  it('担当がいなければ直さない（マネージャー不在）。お題と出土品の発掘はしない（写しの発掘場はそのまま）', () => {
    const s = after();
    recOf(s, 'c1').revive!.fund = 50000;
    s.staff.find((x) => x.hero === MGR)!.task = null;
    expect(closeCompanyMonth(s).managed.find((x) => x.id === 'c1')!.revive!.fixed).toBe(0);
    const dig0 = JSON.stringify((recOf(s, 'c1').snap as unknown as P1State).dig);
    s.staff.find((x) => x.hero === MGR)!.task = 'manager';
    s.staff.find((x) => x.hero === MGR)!.target = 'c1';
    closeCompanyMonth(s);
    expect(JSON.stringify((recOf(s, 'c1').snap as unknown as P1State).dig)).toBe(dig0);
  });

  it('伸び率：復興の担当は、毎月 能力値の低い 2 つが +2〜3（上限 100。OJT の 3 倍くらい）', () => {
    const s = after();
    const st = s.staff.find((x) => x.hero === MGR)!;
    st.stats = { ...st.stats, phy: 30, int: 50, agi: 40 };
    s.money = 1e6;
    expect(delegate(s, 'c1', MGR, 80000)).toBeNull();
    const g = closeCompanyMonth(s).managed.find((x) => x.id === 'c1')!.revive!.grow;
    expect(Object.keys(g).sort()).toEqual(['agi', 'phy']);
    for (const v of Object.values(g)) expect(v).toBeGreaterThanOrEqual(RESET.grow.lo);
    for (const v of Object.values(g)) expect(v).toBeLessThanOrEqual(RESET.grow.hi);
    expect(st.stats.int).toBe(50);
    st.stats = { ...st.stats, phy: 99, int: 100, agi: 99 };
    closeCompanyMonth(s);
    expect([st.stats.phy, st.stats.int, st.stats.agi]).toEqual([100, 100, 100]);
  });

  it('任せていた町に戻ると、支援金の残りは本社へ戻り、直った建物は働く（お店の札）', () => {
    const s = after();
    expect(delegate(s, 'c1', MGR, 30000)).toBeNull();
    closeCompanyMonth(s);
    const left = recOf(s, 'c1').revive!.fund;
    const m0 = s.money;
    expect(moveTo(s, 'c1', null)).toBeNull();
    expect(s.money).toBe(m0 + left);
    const fixedShop = s.buildings.find((b) => b.owner === 'me' && P1B[b.id]?.kind === 'shop');
    if (fixedShop) expect(s.shops[fixedShop.uid]).toBeTruthy();
    expect(s.staff.find((x) => x.hero === MGR)!.task).toBeNull();
  });
});

describe('6. 投資の監査・セーブ', () => {
  it('修繕・復興の支援金は、投資の一覧（設備投資・監査）の対象外', () => {
    expect(Object.keys(INVEST).some((k) => /repair|revive|fund/.test(k))).toBe(false);
    expect(Object.keys(INVEST_SPEC).some((k) => /repair|revive|fund/.test(k))).toBe(false);
  });

  it('セーブに残る（版 8）：店の名前・周回・災害の記録・被災した町', () => {
    const s = town();
    expect(moveTo(s, 'u1', MGR)).toBeNull();
    s.storeName = 'くま商会';
    const back = deserializeP1(serializeP1(s))!;
    expect(back.v).toBe(8);
    expect(back.storeName).toBe('くま商会');
    expect(back.loop).toEqual(s.loop);
    expect(back.resets).toEqual(s.resets);
    expect(back.land!.recs.c1.revive).toEqual(s.land!.recs.c1.revive);
  });

  it('古いセーブ：すでに Uncommon に出店していれば、さかのぼって災害を起こさない（次の Rare で）', () => {
    const s = town();
    // 版 7 のころに Uncommon へ出店していた
    s.land!.mine.push('u1');
    const o = JSON.parse(serializeP1(s));
    o.v = 7;
    const back = deserializeP1(JSON.stringify(o))!;
    expect(back.v).toBe(8);
    expect(back.resets).toBeUndefined();
    expect(rankUpTier(back, 'u2')).toBeNull();
    expect(sectorState(back.land!, 'u2')).toBe('open');
    const m0 = back.money;
    expect(moveTo(back, 'u2', MGR)).toBeNull();
    expect(back.resets).toBeUndefined();
    expect(back.money).toBeLessThan(m0);
    expect(back.skills.includes(MONEY)).toBe(true);
  });
});
