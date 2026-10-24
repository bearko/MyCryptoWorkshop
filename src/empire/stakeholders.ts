// ステークホルダーの統治（docs/EMPIRE_DESIGN.md 10.4）。DOM に触れない純関数。
//
// 支持度（0〜100）はステークホルダーごとに持つ。不満の出来事があった月は下がり、何もなければ
// ふだんの値（REST）へ少しずつ戻る。支持度が DEMAND_BELOW を割ると、期限つきの要望（絵馬）が出る。
// 期限までに CLEAR_ABOVE まで戻せなければ最後通告になり、しばらく会社に重しがかかる。
// 加盟オーナー会は、これまでの満足度（Nation.satisfaction）と告発・調査をそのまま使う。
import type { EmpireState, MonthReport, Note } from './model';

export type StakeholderId = 'regulars' | 'wholesaler' | 'shotengai' | 'staff' | 'owners' | 'shareholders';

export interface StakeholderDef {
  id: StakeholderId;
  /** 登場するフェーズ */
  from: EmpireState['phase'];
  name: { ja: string; en: string };
}

export const STAKEHOLDERS: StakeholderDef[] = [
  { id: 'regulars', from: 1, name: { ja: '常連客', en: 'Regulars' } }, // i18n-ja
  { id: 'wholesaler', from: 1, name: { ja: '問屋', en: 'Wholesaler' } }, // i18n-ja
  { id: 'shotengai', from: 2, name: { ja: '商店街', en: 'High street' } }, // i18n-ja
  { id: 'staff', from: 3, name: { ja: '従業員', en: 'Staff' } }, // i18n-ja
  { id: 'owners', from: 3, name: { ja: '加盟オーナー会', en: 'Franchise owners' } }, // i18n-ja
  { id: 'shareholders', from: 3, name: { ja: '銀行・株主', en: 'Bank & shareholders' } }, // i18n-ja
];

export interface Demand {
  who: StakeholderId;
  /** 出した月と期限の月（この月の終わりまでに戻せなければ最後通告） */
  since: number;
  due: number;
}

export interface Penalty {
  who: StakeholderId;
  /** この月より前のあいだ効く */
  until: number;
}

export interface Stake {
  support: Record<StakeholderId, number>;
  demands: Demand[];
  penalties: Penalty[];
}

/** 数字は仮。npm run sim:empire で測って決める（EMPIRE_DESIGN 10.7） */
export const SUPPORT = {
  start: 60,
  /** 何もない月に戻っていく値と、1 か月に戻る量 */
  rest: 60,
  drift: 5,
  /** 要望が出ているあいだに不満が止まった月は、応えたと伝わって早く戻る */
  driftAnswered: 8,
  /** これを割ると要望（絵馬）が出る。期限は何か月後か */
  demandBelow: 40,
  dueMonths: 3,
  /** 要望が取り下げられる値 */
  clearAbove: 50,
  /** 最後通告のあとの支持度 */
  afterUltimatum: 45,
  /** 喜ぶ出来事で上がる上限 */
  delightCap: 80,
} as const;

/** 不満の出来事 1 回あたりの下がり方（1 か月の下がり幅には上限がある） */
export const GRIEVANCE = {
  stockout: 5,
  waste: 5,
  crowded: 3,
  fatigue: 2,
  open24: 1,
  /** 1 か月に RUSH_FREE 店を超えて出した 1 店ごと（商店街の「出店ラッシュ」） */
  rush: 2,
  quality: 4,
  force24: 3,
  traineeShort: 3,
  loss: 6,
  monthlyCap: 15,
} as const;

/** 喜ぶ出来事 */
export const DELIGHT = { renovate: 3, pb: 3, training: 1, profitUp: 2 } as const;
/** 1 か月にこの店数までの出店なら、商店街は気にしない */
export const RUSH_FREE = 2;

/** 最後通告の重し：何か月続くか、どれだけ効くか */
export const ULTIMATUM = {
  regulars: { months: 3, demand: 0.9 },
  wholesaler: { months: 3, costRate: 0.04 },
  shotengai: { months: 3, rent: 1.2 },
  staff: { months: 1, demand: 0.85 },
  shareholders: { months: 6, borrow: 0.5 },
} as const;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export function newStake(): Stake {
  return { support: Object.fromEntries(STAKEHOLDERS.map((s) => [s.id, SUPPORT.start])) as Record<StakeholderId, number>, demands: [], penalties: [] };
}

/** いまのフェーズで顔を出しているステークホルダー */
export const activeStakeholders = (e: Pick<EmpireState, 'phase'>) => STAKEHOLDERS.filter((s) => s.from <= e.phase);

/** 支持度（加盟オーナー会は満足度） */
export function supportOf(e: EmpireState, who: StakeholderId): number {
  if (who === 'owners') return e.nation?.satisfaction ?? SUPPORT.start;
  return e.stake?.support[who] ?? SUPPORT.start;
}

/** 最後通告の重しが、この月に効いているか */
export const penalized = (e: Pick<EmpireState, 'stake' | 'month'>, who: StakeholderId) => !!e.stake?.penalties.some((p) => p.who === who && e.month < p.until);

/** 月の計算に掛ける重し（効いていなければ 1・0） */
export function stakeMods(e: Pick<EmpireState, 'stake' | 'month'>): { demand: number; costRate: number; rent: number; borrow: number } {
  return {
    demand: (penalized(e, 'regulars') ? ULTIMATUM.regulars.demand : 1) * (penalized(e, 'staff') ? ULTIMATUM.staff.demand : 1),
    costRate: penalized(e, 'wholesaler') ? ULTIMATUM.wholesaler.costRate : 0,
    rent: penalized(e, 'shotengai') ? ULTIMATUM.shotengai.rent : 1,
    borrow: penalized(e, 'shareholders') ? ULTIMATUM.shareholders.borrow : 1,
  };
}

/** この月の出来事から、ステークホルダーごとの上げ下げ（加盟オーナー会は別の仕組み） */
export function monthDeltas(e: EmpireState, r: MonthReport, extra: { renovated: number }): Partial<Record<StakeholderId, number>> {
  const count = (k: Note['kind']) => r.notes.filter((n) => n.kind === k).length;
  const down: Partial<Record<StakeholderId, number>> = {};
  const up: Partial<Record<StakeholderId, number>> = {};
  const add = (m: typeof down, who: StakeholderId, v: number) => (m[who] = (m[who] ?? 0) + v);
  if (e.phase <= 2) {
    // 店を寄せる（食い合い）のはフェーズ 2 の定石なので、常連客は気にしない。困るのは品切れと疲れた店
    add(down, 'regulars', count('stockout') * GRIEVANCE.stockout + count('fatigue') * GRIEVANCE.fatigue);
    add(down, 'wholesaler', count('waste') * GRIEVANCE.waste);
    if (e.phase === 2) add(down, 'shotengai', e.stores.filter((s) => s.hours === 24).length * GRIEVANCE.open24 + Math.max(0, count('opened') - RUSH_FREE) * GRIEVANCE.rush);
    add(up, 'regulars', extra.renovated * DELIGHT.renovate);
  } else if (e.nation) {
    const n = e.nation;
    add(down, 'regulars', count('qualityWarn') * GRIEVANCE.quality);
    add(up, 'regulars', count('pbUp') * DELIGHT.pb);
    add(down, 'shotengai', (n.force24 ? GRIEVANCE.force24 : 0) + n.regions.filter((x) => x.direct + x.fcOwner + x.fcHq > x.capacity * 0.8).length * GRIEVANCE.crowded);
    add(down, 'staff', (count('traineeLimit') + count('eraCap')) * GRIEVANCE.traineeShort + count('qualityWarn') * GRIEVANCE.quality);
    add(up, 'staff', Math.min(3, n.trainingCenters) * DELIGHT.training);
    const prev = e.history.slice(0, -1).slice(-12);
    const avg = prev.length ? prev.reduce((a, x) => a + x.profit, 0) / prev.length : 0;
    if (r.profit < 0) add(down, 'shareholders', GRIEVANCE.loss);
    else if (prev.length >= 3 && r.profit > avg) add(up, 'shareholders', DELIGHT.profitUp);
  }
  const out: Partial<Record<StakeholderId, number>> = {};
  for (const s of activeStakeholders(e)) {
    if (s.id === 'owners') continue;
    const d = Math.min(GRIEVANCE.monthlyCap, down[s.id] ?? 0);
    out[s.id] = (up[s.id] ?? 0) - d;
  }
  return out;
}

/**
 * 月末の支持度・要望・最後通告。報告（r.notes）に書き足し、e.stake を更新する。
 * e.month はまだこの月（進める前）。
 */
export function stakeStep(e: EmpireState, r: MonthReport, extra: { renovated: number }): void {
  const st = (e.stake ??= newStake());
  const m = e.month;
  const deltas = monthDeltas(e, r, extra);
  for (const s of activeStakeholders(e)) {
    if (s.id === 'owners') continue;
    const d = deltas[s.id] ?? 0;
    let v = st.support[s.id];
    if (d < 0) v += d;
    else {
      // 何もなかった月は、ふだんの値へ戻る（喜ぶ出来事はその上に足す）
      const step = st.demands.some((x) => x.who === s.id) && d === 0 ? SUPPORT.driftAnswered : SUPPORT.drift;
      v = v < SUPPORT.rest ? Math.min(SUPPORT.rest, v + step) : v;
      // 喜ぶ出来事で上がるのは DELIGHT_CAP まで（その上は総会や役員会でしか上がらない）
      if (d > 0) v = Math.max(v, Math.min(SUPPORT.delightCap, v + d));
    }
    st.support[s.id] = clamp(Math.round(v), 0, 100);
  }
  // 効き終わった重しを片づける
  st.penalties = st.penalties.filter((p) => p.until > m + 1);
  for (const s of activeStakeholders(e)) {
    if (s.id === 'owners') continue;
    const v = st.support[s.id];
    const open = st.demands.find((x) => x.who === s.id);
    if (open && v >= SUPPORT.clearAbove) {
      st.demands = st.demands.filter((x) => x !== open);
      r.notes.push({ kind: 'demandMet', who: s.id });
    } else if (open && m >= open.due) {
      st.demands = st.demands.filter((x) => x !== open);
      const months = ULTIMATUM[s.id as keyof typeof ULTIMATUM].months;
      st.penalties.push({ who: s.id, until: m + 1 + months });
      st.support[s.id] = SUPPORT.afterUltimatum;
      r.notes.push({ kind: 'ultimatum', who: s.id, months });
    } else if (!open && v < SUPPORT.demandBelow && !penalized({ stake: st, month: m + 1 }, s.id)) {
      st.demands.push({ who: s.id, since: m, due: m + SUPPORT.dueMonths });
      r.notes.push({ kind: 'demand', who: s.id, due: m + SUPPORT.dueMonths });
    }
  }
}

export function restoreStake(raw: unknown): Stake | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const s = raw as Partial<Stake>;
  const base = newStake();
  const ids = new Set(STAKEHOLDERS.map((x) => x.id));
  const num = (v: unknown, f: number) => (typeof v === 'number' && Number.isFinite(v) ? v : f);
  return {
    support: Object.fromEntries(STAKEHOLDERS.map((x) => [x.id, clamp(num(s.support?.[x.id], base.support[x.id]), 0, 100)])) as Stake['support'],
    demands: (Array.isArray(s.demands) ? s.demands : []).filter((d): d is Demand => !!d && ids.has(d.who) && typeof d.due === 'number').map((d) => ({ who: d.who, since: num(d.since, 0), due: d.due })),
    penalties: (Array.isArray(s.penalties) ? s.penalties : []).filter((p): p is Penalty => !!p && ids.has(p.who) && typeof p.until === 'number').map((p) => ({ who: p.who, until: p.until })),
  };
}
