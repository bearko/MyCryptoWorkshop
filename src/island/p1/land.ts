/**
 * ランドセクタの行き来（関所の先）。
 * 会社（資金・ヒーロー・スキル・ブランド力・開発した商品・調達ランク）は共有し、地図・建物・お店・素材・他社はセクタごと。
 * いま経営していないセクタは、セクタマネージャーが運営する（company.ts の runSector）。
 * docs/ISLAND_PHASE1.md「ランドマップとセクタ」。
 */
import { t } from '../../i18n';
import { BRAND, MANAGER, P1B, type Mat } from './data';
import { brandAdd, book, newLand, sectorDef, sectorState, type SectorRec } from './company';
import { assign, groundOf, newP1, staffOf, type P1State } from './model';

/** セクタごとに持つもの（セクタを離れるときに写しを取り、戻ったら戻す） */
export const SECTOR_KEYS = [
  'seed',
  'n',
  'open',
  'buildings',
  'nextUid',
  'mats',
  'slots',
  'stock',
  'shops',
  'trips',
  'rivals',
  'demand',
  'monthSales',
  'rivalSales',
  'monthCost',
  'alone',
  'reports',
  'cleared',
  'gateOpen',
  'ads',
  'intel',
  'rivalProd',
  'rivalLast',
  'monthUnits',
  'ws',
  'matUsed',
  'matUsedLast',
  'util',
  'utilLast',
  'buyTrip',
  'orders',
  'sector',
  'tier',
  'arrived',
] as const;

/** いまのセクタに自社の建物があるか（あれば、離れるときにマネージャーが要る） */
export const hasBusiness = (s: P1State) => s.buildings.some((b) => b.owner === 'me' && P1B[b.id]);

/** セクタの担当：ほかのセクタでマネージャーをしていない人 */
export const isAway = (s: P1State, hero: number) => staffOf(s, hero)?.task === 'manager';

export function recOf(s: P1State, id: string): SectorRec {
  const land = (s.land ??= newLand(s.sector ?? 'c1'));
  return (land.recs[id] ??= { id, invest: MANAGER.invest, capital: 0, log: [] });
}

/** 出店許可申請（入国料） */
export const feeOf = (id: string) => sectorDef(id).fee;

export type MoveErr = 'no-land' | 'here' | 'cloud' | 'locked' | 'soon' | 'money' | 'manager' | 'busy';

/**
 * ほかのセクタへ移る。いまのセクタに建物があれば manager（ヒーロー）を指名する。
 * 初めてのセクタは出店許可申請の費用を払い、まっさらな区画から始める。
 */
export function moveTo(s: P1State, target: string, manager: number | null): MoveErr | null {
  const land = s.land;
  if (!land) return 'no-land';
  const st = sectorState(land, target);
  if (st === 'here') return 'here';
  if (st === 'cloud' || st === 'locked' || st === 'soon') return st;
  const fresh = st === 'open';
  const fee = fresh ? feeOf(target) : 0;
  if (s.money < fee) return 'money';
  const cur = land.cur;
  const business = hasBusiness(s);
  if (business && manager == null) return 'manager';
  if (manager != null) {
    const m = staffOf(s, manager);
    if (!m) return 'manager';
    if (m.task === 'manager') return 'busy';
  }

  // ---- いまのセクタを離れる
  const rec = recOf(s, cur);
  // 調達係の帰り道の素材は、そのまま届いたことに
  if (s.buyTrip) {
    for (const [m, n] of Object.entries(s.buyTrip.cargo) as [Mat, number][]) s.mats[m] = (s.mats[m] ?? 0) + (n ?? 0);
    s.buyTrip = null;
  }
  // このセクタで担当していた仕事（戻ったら、空いていれば元に戻す）
  const local = ['craft', 'transport', 'shop', 'buy', 'intel'];
  rec.jobs = s.staff.filter((x) => x.task && local.includes(x.task)).map((x) => ({ hero: x.hero, task: x.task as string, target: x.target }));
  for (const j of rec.jobs) assign(s, j.hero, null);
  if (manager != null) {
    assign(s, manager, null);
    const m = staffOf(s, manager)!;
    m.task = 'manager';
    m.target = cur;
  }
  rec.manager = manager;
  // 離れたときの売上と費用（最後の月の報告）。まだ締めが無ければ、マネージャーの売上は 0
  const last = s.reports[s.reports.length - 1];
  rec.base = last && last.revenue > 0 ? { rev: last.revenue, matRate: (last.costs.materials ?? 0) / last.revenue, fixed: (last.costs.upkeep ?? 0) + (last.costs.part ?? 0) + (last.costs.ads ?? 0) } : undefined;
  if (!business) rec.base = undefined;
  rec.snap = JSON.parse(JSON.stringify(Object.fromEntries(SECTOR_KEYS.map((k) => [k, s[k as keyof P1State]]))));

  // ---- 行き先へ
  const back = land.recs[target];
  if (!fresh && back?.snap) {
    Object.assign(s, back.snap);
    // マネージャーが投資したぶん、お客さんが増えている
    if (back.base && back.capital > 0) {
      const grow = Math.min(2, 1 + (back.capital * MANAGER.roi) / back.base.rev);
      for (const k of Object.keys(s.demand)) s.demand[k] = (s.demand[k] ?? 0) * grow;
    }
    // マネージャーは本社の仕事に戻る
    if (back.manager != null) {
      const m = staffOf(s, back.manager);
      if (m && m.task === 'manager') {
        m.task = null;
        m.target = null;
      }
    }
    // 前の担当を、空いていれば元に戻す
    for (const j of back.jobs ?? []) {
      const x = staffOf(s, j.hero);
      if (x && x.task == null) assign(s, j.hero, j.task as never, j.target);
    }
    back.snap = undefined;
    back.jobs = undefined;
    back.base = undefined;
    back.manager = null;
    back.capital = 0;
  } else {
    const def = sectorDef(target);
    const next = newP1(Math.floor(s.seed * 7 + target.charCodeAt(0) * 131 + target.charCodeAt(1) * 17), def.tier, target);
    for (const k of SECTOR_KEYS) (s as unknown as Record<string, unknown>)[k] = (next as unknown as Record<string, unknown>)[k];
    // 関所はもう開いている（ランドは会社ぜんたいで開く）
    s.gateOpen = true;
    s.arrived = s.day;
    if (fee > 0) {
      s.money -= fee;
      book(s, 'fees', fee);
    }
    land.mine.push(target);
    brandAdd(s, BRAND.enter[def.tier], t(`${def.name}に出店`, `Opened in ${def.name}`));
  }
  s.ground = groundOf(s.n);
  land.cur = target;
  return null;
}
