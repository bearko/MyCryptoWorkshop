// 3 冠と規制（docs/EMPIRE_DESIGN.md 5 章・10.9）。DOM に触れない純関数。フェーズ 3 から。
//
// 3 つの指標で、本拠ランドのライバルと比べる。1 位を取った指標が「冠」：
// - 売上規模：直近 12 か月の売上。年 1 回の決算（3 月）で確定
// - ブランド力：認知（市場のシェア）× 寄与（常連客の支持と品質）× 強度（PB と、事故の傷）。半年ごと（3 月・9 月）の番付
// - 影響力：物流・雇用・地域・役員会。毎月。上げるほど規制のメーターも上がる
//
// 規制：市場のシェア（町の店も入れた市場）＋影響力の重み。
// 35% で当局が注視、40% を超えると悪い取引（24 時間の強制・混みすぎたエリア）に制裁金、
// 50% を超えたまま半年続くと分割（店の一部をライバルへ売る）。1 位になるのに 50% は要らない。
import type { EmpireState, Note } from './model';
import { regionStores, type Nation } from './nation';

export type CrownId = 'scale' | 'brand' | 'influence';
export const CROWNS: CrownId[] = ['scale', 'brand', 'influence'];

export interface Crowns {
  /** いま持っている冠（確定した時点の結果） */
  held: Record<CrownId, boolean>;
  /** ブランドの傷（0〜1）。事故で付き、月ごとに癒える */
  shock: number;
  /** 規制の線を超えていた月数（分割の審査） */
  overMonths: number;
}

export interface CrownStats {
  ours: Record<CrownId, number>;
  rival: Record<CrownId, number>;
  /** 規制に使うシェア（0〜1）と、影響力の上乗せを除いた市場のシェア */
  share: number;
  marketShare: number;
}

/** 数字は仮。npm run sim:empire で測って決める */
export const MARKET = {
  /** エリアの入りきる目安のうち、町の店（どこのチェーンでもない店）が占める割合 */
  neutral: 0.5,
} as const;
export const REGULATION = {
  watch: 0.35,
  fines: 0.4,
  breakup: 0.5,
  /** 分割までの月数と、売らされる店の割合 */
  breakupMonths: 6,
  breakupShare: 0.15,
  /** 影響力 1 あたりの規制メーターの上乗せ */
  influenceWeight: 0.0005,
  /** 悪い取引 1 つあたりの制裁金（その月の売上に対する割合） */
  fineRate: 0.02,
  /** 分割で売る店 1 店の値段（ライバルが払う） */
  salePrice: 10_000_000,
} as const;
/** ブランドの傷：事故ごとの深さと、月ごとの癒え方 */
export const SHOCK = { investigation: 0.3, ultimatum: 0.15, quality: 0.1, heal: 0.05 } as const;
/** 影響力の配点 */
export const INFLUENCE = { hub: 6, training: 4, support: 0.1, board: 2, listed: 5, rivalRegion: 6, rivalBase: 10 } as const;
/** 冠が確定する月（0 = 1 月。3 月決算） */
export const FISCAL_MONTH = 2;

export function newCrowns(): Crowns {
  return { held: { scale: false, brand: false, influence: false }, shock: 0, overMonths: 0 };
}

const open = (n: Nation) => n.regions.filter((r) => !r.locked);

/** 本拠ランドの 3 指標と、規制に使うシェア */
export function crownStats(e: EmpireState): CrownStats | null {
  const n = e.nation;
  if (!n) return null;
  const rs = open(n);
  const own = rs.reduce((a, r) => a + regionStores(r), 0);
  const rival = rs.reduce((a, r) => a + r.rival, 0);
  const neutral = rs.reduce((a, r) => a + r.capacity * MARKET.neutral, 0);
  const market = Math.max(1, own + rival + neutral);
  const last = e.history.slice(-12);
  const regulars = e.stake?.support.regulars ?? 60;
  const shock = e.crowns?.shock ?? 0;
  const brand = (s: number, contribution: number, strength: number) => Math.round(100 * Math.sqrt(s) * contribution * strength);
  const sup = (e.stake?.support.shotengai ?? 60) + (e.stake?.support.staff ?? 60);
  const influence = Math.round(
    rs.filter((r) => r.hub).length * INFLUENCE.hub + n.trainingCenters * INFLUENCE.training + sup * INFLUENCE.support + (e.gov?.board.length ?? 0) * INFLUENCE.board + (n.listed ? INFLUENCE.listed : 0),
  );
  const rivalInfluence = Math.round(rs.filter((r) => r.rival >= 3).length * INFLUENCE.rivalRegion + INFLUENCE.rivalBase);
  const marketShare = own / market;
  return {
    ours: {
      scale: last.reduce((a, r) => a + r.revenue, 0),
      brand: brand(marketShare, 0.5 + 0.5 * (regulars / 100), n.quality * (1 + 0.05 * n.pb) * (1 - shock)),
      influence,
    },
    rival: {
      scale: last.reduce((a, r) => a + (r.rivalRevenue ?? 0), 0),
      brand: brand(rival / market, 0.8, 0.95),
      influence: rivalInfluence,
    },
    share: marketShare + influence * REGULATION.influenceWeight,
    marketShare,
  };
}

/** 規制の段：0 なし・1 注視・2 制裁金・3 分割の審査 */
export function regulationLevel(share: number): 0 | 1 | 2 | 3 {
  if (share >= REGULATION.breakup) return 3;
  if (share >= REGULATION.fines) return 2;
  if (share >= REGULATION.watch) return 1;
  return 0;
}

/** いま確定する冠（3 月は 3 つとも、9 月はブランド力と影響力、ほかの月は影響力だけ） */
export function crownsDueThisMonth(month: number): CrownId[] {
  const m = month % 12;
  if (m === FISCAL_MONTH) return ['scale', 'brand', 'influence'];
  if (m === (FISCAL_MONTH + 6) % 12) return ['brand', 'influence'];
  return ['influence'];
}

/**
 * 月末の 3 冠と規制（nationMonth の報告ができたあとに呼ぶ）。
 * 制裁金と分割は資金と店を動かす。予兆は必ず先に報告に出す。
 */
export function crownStep(e: EmpireState, notes: Note[], revenue: number): void {
  const n = e.nation;
  if (!n || e.phase < 3) return;
  const c = (e.crowns ??= newCrowns());
  // ブランドの傷：この月の事故で付き、何もなければ癒える
  let hit = 0;
  if (notes.some((x) => x.kind === 'investigation')) hit += SHOCK.investigation;
  if (notes.some((x) => x.kind === 'ultimatum' && x.who === 'regulars')) hit += SHOCK.ultimatum;
  if (notes.some((x) => x.kind === 'qualityWarn') && n.quality < 0.85) hit += SHOCK.quality;
  c.shock = Math.min(0.6, hit > 0 ? c.shock + hit : Math.max(0, c.shock - SHOCK.heal));
  const st = crownStats(e)!;
  for (const id of crownsDueThisMonth(e.month)) {
    const won = st.ours[id] > st.rival[id];
    if (won !== c.held[id]) notes.push({ kind: 'crown', crown: id, won });
    c.held[id] = won;
  }
  // 規制
  const level = regulationLevel(st.share);
  const crowded = n.regions.filter((r) => regionStores(r) > r.capacity * 0.8).length;
  if (level >= 2) {
    const bad = (n.force24 ? 1 : 0) + (crowded > 0 ? 1 : 0);
    if (bad > 0) {
      const fine = revenue * REGULATION.fineRate * bad;
      e.funds -= fine;
      notes.push({ kind: 'regulationFine', fine });
    }
  }
  if (level >= 3) {
    c.overMonths++;
    if (c.overMonths === 1) notes.push({ kind: 'breakupWarning', months: REGULATION.breakupMonths });
    if (c.overMonths >= REGULATION.breakupMonths) {
      const sold = breakup(n);
      e.funds += sold * REGULATION.salePrice;
      notes.push({ kind: 'breakup', stores: sold });
      c.overMonths = 0;
    }
  } else {
    if (c.overMonths > 0) notes.push({ kind: 'breakupCleared' });
    c.overMonths = 0;
    if (level === 1 && e.month % 6 === 0) notes.push({ kind: 'regulationWatch' });
  }
}

/** 分割：自店の多いエリアから、店の BREAKUP_SHARE をライバルへ売る（加盟店から先に）。売った店の数を返す */
export function breakup(n: Nation): number {
  const total = open(n).reduce((a, r) => a + regionStores(r), 0);
  let left = Math.max(1, Math.round(total * REGULATION.breakupShare));
  const sold = left;
  const order = open(n).sort((a, b) => regionStores(b) / b.capacity - regionStores(a) / a.capacity);
  for (const r of order) {
    for (const k of ['fcHq', 'fcOwner', 'direct'] as const) {
      const take = Math.min(left, r[k], Math.max(0, regionStores(r) - 1));
      r[k] -= take;
      r.rival += take;
      left -= take;
      if (left <= 0) return sold;
    }
  }
  return sold - left;
}

export function restoreCrowns(raw: unknown): Crowns | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const c = raw as Partial<Crowns>;
  const num = (v: unknown, f: number) => (typeof v === 'number' && Number.isFinite(v) ? v : f);
  return {
    held: { scale: c.held?.scale === true, brand: c.held?.brand === true, influence: c.held?.influence === true },
    shock: Math.min(0.6, Math.max(0, num(c.shock, 0))),
    overMonths: Math.max(0, Math.floor(num(c.overMonths, 0))),
  };
}
