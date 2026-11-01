/**
 * ランクアップの災害と徴収・被災した町の復興（発掘 v2 の 7 段目）。画面に依存しない（tests/island-p1-reset.test.ts）。
 * 会社として初めて上のランクのセクタへ進出するとき（land.ts の moveTo）、自然災害で開拓した土地が荒れ地に戻り、建物は廃墟になり、
 * ランドが復興のために所持金を全額徴収する。研究ポイント・RP で開けたパネル・ヒーローは残る。お金で開けたパネルは未取得へ。
 * 被災した町は、手で直す（安い）か、ヒーローに復興支援金を送って任せる（割高・遅い・自動）。docs/ISLAND_PHASE1.md「ランクアップの災害と復興」
 */
import { DEF } from '../defs';
import { cells } from '../sim';
import { MANAGER, P1B, RESET, SECTORS, SKILL, isResearch, type Tier } from './data';
import { book, delegateCostOf, repairCostOf, repairDaysOf, repairOrder, ruinCount, RUIN, sectorDef, type Land, type RuinLike, type SectorRec } from './company';
import { assign, newDig, reviveMul, spend, staffOf, wasteSpots, type DigState, type P1State, type PBuilding, type ResetRec } from './model';

const TIER_ORDER: Tier[] = ['C', 'U', 'R', 'E', 'L'];
const rankOf = (t0: Tier) => TIER_ORDER.indexOf(t0);

/** 廃墟か */
export const isRuin = (b: Pick<PBuilding, 'owner'>) => b.owner === RUIN;
/** いまのセクタの廃墟 */
export const ruinsOf = (s: Pick<P1State, 'buildings'>) => s.buildings.filter(isRuin);

/**
 * その出店でランクアップの災害が起きるか（起きるなら行き先のランク）：会社として初めて、いまより上のランクのセクタへ進出するとき
 * （まだ出店していないセクタで、出店したどのセクタよりランクが上）。同じランクの 2 つ目以降・出店済みのセクタへ戻るときは null。
 * 古いセーブですでに Uncommon に出店していれば、Uncommon では起きない（次の Rare で）
 */
export function rankUpTier(s: Pick<P1State, 'land'>, target: string): Tier | null {
  const land = s.land;
  if (!land || land.mine.includes(target)) return null;
  const tier = sectorDef(target).tier;
  const top = Math.max(...land.mine.map((id) => rankOf(sectorDef(id).tier)));
  return rankOf(tier) > top ? tier : null;
}

/** 初めて上のランクへ進出したときの、セクタの写しの作り直し（建物は廃墟・荒れ地は作り直し・在庫は 0）。廃墟の数 */
function ruinSnap(snap: Record<string, unknown>, sector: string, round: number): number {
  const bs = (snap.buildings as PBuilding[] | undefined) ?? [];
  // 荒れ地（復興した土地・ダンジョンの入り口も）のマス：そこに建っていた自社の建物（展示館など）は、荒れ地に戻るので残らない
  const waste = new Set(wasteSpots(sector).flatMap(([i, j]) => [0, 1].flatMap((dj) => [0, 1].map((di) => `${i + di},${j + dj}`))));
  const onWaste = (b: PBuilding) => cells(DEF[b.id], b.i, b.j, b.dir).some(([x, y]) => waste.has(`${x},${y}`));
  const keep: PBuilding[] = [];
  let ruins = 0;
  for (const b of bs) {
    if (b.owner === 'me' || b.owner === RUIN) {
      if (onWaste(b)) continue;
      if (b.owner === 'me' && !P1B[b.id]) continue;
      keep.push({ ...b, owner: RUIN, left: 0, inv: undefined });
      ruins++;
    } else keep.push(b);
  }
  for (const b of keep) if (b.inv === undefined) delete b.inv;
  snap.buildings = keep;
  // お店・作業台・在庫・素材・運搬中・調達中・注文・宣伝は 0
  snap.shops = {};
  snap.slots = [];
  snap.stock = {};
  snap.mats = {};
  snap.trips = [];
  snap.buyTrip = null;
  snap.orders = [];
  snap.ads = {};
  snap.dustShop = null;
  snap.monthSales = {};
  snap.monthUnits = {};
  // 復興した土地が荒れ地に戻るので、復興で上がった需要の割合を戻す
  const dig = snap.dig as DigState | null | undefined;
  if (dig) {
    const mul = reviveMul({ dig });
    const demand = (snap.demand as Record<string, number> | undefined) ?? {};
    if (mul !== 1) for (const k of Object.keys(demand)) demand[k] = (demand[k] ?? 0) / mul;
    // 荒れ地 4 か所は作り直し（新しい種・新しい壁。許可はまた 1 か所目から）。ダンジョンの最深記録は残す
    const nd = newDig(sector, round);
    if (nd) {
      const best = Math.max(dig.best ?? 0, dig.dungeon?.best ?? 0);
      if (best > 0) nd.best = best;
      snap.dig = nd;
    }
  }
  return ruins;
}

/**
 * ランクアップの災害と徴収（moveTo から。いまのセクタの写しを取ったあと、行き先の町を作る前に呼ぶ）：
 * - 所持金は全額徴収（帳簿の特別損失「復興の徴収」）→ ランドからの復興の支度金（特別利益。RESET.grant）
 * - お金で開けたパネルは未取得へ（研究パネル・無限の強化パネル・研究への寄付の回数は残る）。お金のパネルの修行は取りやめ
 * - ヒーローは残る（能力値・Lv）。仕事の割り当ては外す（セクタマネージャーはそのまま：被災した町の復興の担当の第一候補）
 * - すべてのセクタの写し：建物は廃墟・荒れ地は作り直し・在庫は 0。お題・石板・出土品はまた埋まっている（この周回で初めて見つけたぶんの RP がまた入る）
 * - 展示館が廃墟（荒れ地に戻る）になったら、飾っていた遺物は研究ノートに戻る
 * - 研究ノート・研究 Lv・レシピ・制覇・エンブレム・ブランド力・調査依頼状・ランドマップ・最深記録は残る
 */
export function resetForTier(s: P1State, tier: Tier, to: string): ResetRec {
  const land = s.land as Land;
  // 所持金：全額徴収 → 支度金
  const levy = Math.max(0, Math.round(s.money));
  s.money = 0;
  book(s, 'levy', levy);
  s.money += RESET.grant;
  book(s, 'grant', RESET.grant);
  // お金で開けたパネル
  const lost = s.skills.filter((id) => SKILL[id] && !isResearch(SKILL[id]));
  if (lost.length) {
    s.skills = s.skills.filter((id) => !lost.includes(id));
    const lv = { ...(s.skillLv ?? {}) };
    for (const id of lost) delete lv[id];
    s.skillLv = lv;
  }
  if (s.training && SKILL[s.training.id] && !isResearch(SKILL[s.training.id])) {
    const st = staffOf(s, s.training.hero);
    if (st && st.task === 'train') {
      st.task = null;
      st.target = null;
    }
    s.training = null;
  }
  // ヒーロー：仕事の割り当ては外す（マネージャー・修行中はそのまま）
  for (const st of s.staff) if (st.task !== 'manager' && st.task !== 'train') assign(s, st.hero, null);
  // 周回：この周回で見つけた記録だけ消す（研究 Lv・レシピは残る）
  s.loop = { n: (s.loop?.n ?? 0) + 1, found: [], tablets: [] };
  // すべてのセクタ（出店したセクタの写し）
  const ruins: Record<string, number> = {};
  for (const id of land.mine) {
    const rec = land.recs[id];
    if (!rec?.snap) continue;
    const n = ruinSnap(rec.snap, id, s.loop.n);
    ruins[id] = n;
    rec.jobs = undefined;
    rec.capital = 0;
    rec.revive = n > 0 ? { fund: 0, all: n, months: 0, spent: 0 } : undefined;
  }
  // 展示館：荒れ地に戻ったので、飾っていた遺物は研究ノートへ（展示室の増築はお金の投資なので 0 から）
  if (s.museum) {
    s.museum.at = null;
    s.museum.items = [];
    s.museum.lv = 0;
  }
  const rec: ResetRec = { day: s.day, tier, to, levy, grant: RESET.grant, ruins };
  (s.resets ??= []).push(rec);
  return rec;
}

/** 最後のランクアップの災害（演出がまだなら）。画面の「サインとハンコ」 */
export const pendingReset = (s: Pick<P1State, 'resets'>) => {
  const r = s.resets?.[s.resets.length - 1];
  return r && !r.seen ? r : null;
};

// ---------------------------------------------------------------- 手で直す（いまいるセクタの廃墟）

export type RepairErr = 'none' | 'money' | 'limit';
/** 廃墟を直せない理由（null なら直せる）。工房は 1 つまで（新しく建てていれば直せない） */
export function repairLock(s: P1State, uid: number): RepairErr | null {
  const b = s.buildings.find((x) => x.uid === uid && isRuin(x));
  if (!b) return 'none';
  if (b.id === 'workshop' && s.buildings.some((x) => x.owner === 'me' && x.id === 'workshop')) return 'limit';
  if (s.money < repairCostOf(b.id)) return 'money';
  return null;
}
/** 修繕する：元の建物（設備投資の段は 0 から）に、工期の短い工事で戻る。払った額 */
export function repair(s: P1State, uid: number): { cost: number; days: number } | RepairErr {
  const e = repairLock(s, uid);
  if (e) return e;
  const b = s.buildings.find((x) => x.uid === uid)!;
  const cost = repairCostOf(b.id);
  const days = repairDaysOf(b.id);
  s.money -= cost;
  spend(s, 'build', cost);
  b.owner = 'me';
  b.left = days;
  delete b.inv;
  return { cost, days };
}
/** 全部修繕の合計（直せるものだけ。工房が建っていれば工房の廃墟は除く） */
export function repairAllCost(s: P1State): { n: number; cost: number } {
  const hasWs = s.buildings.some((x) => x.owner === 'me' && x.id === 'workshop');
  const list = ruinsOf(s).filter((b) => !(b.id === 'workshop' && hasWs));
  // 工房の廃墟が 2 つあっても、直せるのは 1 つ
  const ws = list.filter((b) => b.id === 'workshop');
  const xs = [...list.filter((b) => b.id !== 'workshop'), ...ws.slice(0, 1)];
  return { n: xs.length, cost: xs.reduce((a, b) => a + repairCostOf(b.id), 0) };
}
/** 全部修繕（工房 → 安い順に、資金のあるだけ）。直した数と払った額 */
export function repairAll(s: P1State): { n: number; cost: number } {
  let n = 0;
  let cost = 0;
  for (const b of repairOrder(ruinsOf(s))) {
    const r = repair(s, b.uid);
    if (typeof r === 'string') continue;
    n++;
    cost += r.cost;
  }
  return { n, cost };
}
/** 取り壊す（無料。空き地になる） */
export function clearRuin(s: P1State, uid: number): boolean {
  const k = s.buildings.findIndex((x) => x.uid === uid && isRuin(x));
  if (k < 0) return false;
  s.buildings.splice(k, 1);
  return true;
}

// ---------------------------------------------------------------- ヒーローに任せる（ほかのセクタ）

/** 被災した町の復興のようす（ランドマップの札）。被災していなければ null */
export function reviveView(s: P1State, id: string): { ruins: number; fixed: number; all: number; fund: number; out: boolean; hero: number | null; rec: SectorRec } | null {
  const rec = s.land?.recs[id];
  if (!rec?.revive) return null;
  const here = s.land?.cur === id;
  const { ruins } = here ? { ruins: ruinsOf(s).length } : ruinCount(rec.snap?.buildings as RuinLike[] | undefined);
  const st = rec.manager != null ? staffOf(s, rec.manager) : null;
  const hero = !here && st && st.task === 'manager' && st.target === id ? st.hero : null;
  return { ruins, fixed: Math.max(0, rec.revive.all - ruins), all: rec.revive.all, fund: rec.revive.fund, out: !!rec.revive.out, hero, rec };
}
/** 任せた町の残りを、いまの支援金で直しきれるか（足りない額） */
export function fundShort(s: P1State, id: string): number {
  const rec = s.land?.recs[id];
  const bs = (rec?.snap?.buildings as RuinLike[] | undefined) ?? [];
  const need = bs.filter((b) => b.owner === RUIN).reduce((a, b) => a + delegateCostOf(b.id), 0);
  return Math.max(0, need - (rec?.revive?.fund ?? 0));
}

export type DelegateErr = 'here' | 'none' | 'hero' | 'busy' | 'money';
/** 任せられない理由（null なら任せられる） */
export function delegateLock(s: P1State, id: string, hero: number, fund: number): DelegateErr | null {
  const land = s.land;
  if (!land || land.cur === id) return 'here';
  const rec = land.recs[id];
  if (!rec?.revive || !rec.snap) return 'none';
  const st = staffOf(s, hero);
  if (!st) return 'hero';
  if (st.task === 'train') return 'busy';
  if (st.task === 'manager' && st.target !== id) return 'busy';
  if (s.money < fund) return 'money';
  return null;
}
/**
 * 復興を任せる：ヒーローをそのセクタの担当（マネージャー）にして、復興支援金を送る（所持金から。帳簿は投資）。
 * 毎月の締めで、担当が支援金から廃墟を直していく（company.ts の reviveMonth）。追加で送れる（同じ担当で）
 */
export function delegate(s: P1State, id: string, hero: number, fund: number): DelegateErr | null {
  const e = delegateLock(s, id, hero, fund);
  if (e) return e;
  const rec = s.land!.recs[id];
  // 前の担当は本社の仕事に戻る
  if (rec.manager != null && rec.manager !== hero) {
    const old = staffOf(s, rec.manager);
    if (old && old.task === 'manager' && old.target === id) {
      old.task = null;
      old.target = null;
    }
  }
  const st = staffOf(s, hero)!;
  if (!(st.task === 'manager' && st.target === id)) {
    assign(s, hero, null);
    st.task = 'manager';
    st.target = id;
  }
  rec.manager = hero;
  if (fund > 0) {
    s.money -= fund;
    spend(s, 'build', fund);
    rec.revive!.fund += fund;
    rec.revive!.out = false;
  }
  rec.invest ??= MANAGER.invest;
  return null;
}

/** 被災した Common の町の一覧（ランクアップの災害のあと。演出の札） */
export const ruinedSectors = (s: P1State): string[] => (s.land?.mine ?? []).filter((id) => !!s.land?.recs[id]?.revive);
/** 演出の札に並べるセクタ（被災した町。いま出店しているセクタの順） */
export const ruinedDefs = (s: P1State) => ruinedSectors(s).map((id) => SECTORS.find((x) => x.id === id)!).filter(Boolean);
