// 危機（docs/EMPIRE_DESIGN.md 6.2・10.14）。DOM に触れない純関数。フェーズ 3 から。
//
// リスクはメーター（0〜100）に積もり、70 で必ず予兆を出してから、100 で起きる。乱数は使わない（起きるかどうかは決定しだい）。
// - 食の事故：品質の崩れ（急な出店で下がり、マニュアルで下がりにくい）で積もる。品質点検で下げられる。起きるとブランドに傷、常連客が離れ、客足が 3 か月落ちる
// - 供給ショック：仕入れ先が 1 つに偏っていると、毎月少しずつ積もる。仕入れ先を分けると下がり、2 年は積もりにくい。
//   会議卓の製造・交易のカードでも積もりにくくなる。起きると原価が 6 か月上がる
// - 拡大しすぎ：品質の大きな崩れと、店の数に対して速すぎる出店（月 8% 超）で積もる。出店を緩めれば下がる。起きると品質とオーナー・従業員の支持が落ちる
// オーナーの反乱（nation.ts の満足度と調査）・借金の崩壊（地価と担保割れ）・経営陣の対立（総会の約束）は、もとからある仕組みで扱う。
import type { EmpireState, Note } from './model';
import { nationStores, type Nation } from './nation';

export type CrisisId = 'food' | 'supply' | 'overgrow';
export const CRISES: CrisisId[] = ['food', 'supply', 'overgrow'];

export interface Crisis {
  meters: Record<CrisisId, number>;
  /** 予兆を出したか（メーターが下がるまで、同じ予兆を繰り返さない） */
  warned: Record<CrisisId, boolean>;
  /** 起きた危機の効き目（その月まで） */
  effects: { id: CrisisId; until: number }[];
  /** 仕入れ先を分けた効き目が続く月 */
  diversifiedUntil: number;
}

/** 数字は仮。npm run sim:empire で測って決める */
export const CRISIS = {
  sign: 70,
  strike: 100,
  /** 予兆を出し直すのは、この線を下回ってから */
  rearm: 50,
  food: {
    /** 品質の崩れ（0.95 を下回った分 × 係数）、毎月の戻り */
    quality: 0.95,
    qualityWeight: 150,
    decay: 3,
    /** 起きたあとのメーター、ブランドの傷、常連客の支持の下がり、客足と月数 */
    after: 30,
    shock: 0.3,
    regulars: 15,
    demand: 0.85,
    months: 3,
    /** 品質点検：1 店あたりの費用と、下がる量 */
    inspectPerStore: 500_000,
    inspectDrop: 40,
  },
  supply: {
    /** 毎月の積もり方と、製造・交易のカード、仕入れ先を分けたあいだの減り方 */
    monthly: 2,
    card: 0.8,
    diversified: 1.5,
    after: 20,
    /** 起きると原価率が上がる（月数） */
    costRate: 0.03,
    months: 6,
    /** 仕入れ先を分ける：基本の費用と 1 店あたり、下がる量、効き目の月数 */
    diversifyBase: 1_000_000_000,
    diversifyPerStore: 2_000_000,
    diversifyDrop: 50,
    diversifyMonths: 24,
  },
  overgrow: {
    /** 品質の大きな崩れ（0.88 を下回った分 × 係数）、店の数に対する月の出店の割合（8% を超えた分 × 係数）、毎月の戻り */
    quality: 0.88,
    qualityWeight: 200,
    growth: 0.08,
    growthWeight: 100,
    decay: 4,
    after: 30,
    /** 起きると品質・オーナーの満足度・従業員の支持が下がる */
    qualityHit: 0.12,
    satisfaction: 15,
    staff: 15,
  },
} as const;

export function newCrisis(): Crisis {
  return { meters: { food: 0, supply: 0, overgrow: 0 }, warned: { food: false, supply: false, overgrow: false }, effects: [], diversifiedUntil: -1 };
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** 会社が持つすべての国（本拠と渡ったランド） */
function nations(e: EmpireState): Nation[] {
  return [...(e.nation ? [e.nation] : []), ...(e.world?.branches.map((b) => b.nation) ?? [])];
}

/** 会社全体の店の数（本拠と渡ったランド） */
export const allStores = (e: EmpireState) => nations(e).reduce((a, n) => a + nationStores(n), 0);

/** 品質点検の費用 */
export const inspectCost = (e: EmpireState) => allStores(e) * CRISIS.food.inspectPerStore;
/** 仕入れ先を分ける費用 */
export const diversifyCost = (e: EmpireState) => CRISIS.supply.diversifyBase + allStores(e) * CRISIS.supply.diversifyPerStore;

/** 今月の決定：品質点検・仕入れ先を分ける（月のはじめ） */
export function applyCrisisDecisions(e: EmpireState, d: { inspect?: boolean; diversify?: boolean }, notes: Note[]): void {
  if (e.phase < 3) return;
  const c = (e.crisis ??= newCrisis());
  const pay = (cost: number) => {
    if (e.funds < cost) {
      notes.push({ kind: 'shortOfFunds' });
      return false;
    }
    e.funds -= cost;
    return true;
  };
  if (d.inspect && pay(inspectCost(e))) {
    c.meters.food = Math.max(0, c.meters.food - CRISIS.food.inspectDrop);
    notes.push({ kind: 'crisisAction', crisis: 'food' });
  }
  if (d.diversify && pay(diversifyCost(e))) {
    c.meters.supply = Math.max(0, c.meters.supply - CRISIS.supply.diversifyDrop);
    c.diversifiedUntil = e.month + CRISIS.supply.diversifyMonths;
    notes.push({ kind: 'crisisAction', crisis: 'supply' });
  }
}

/** いま効いている危機の重し（客足の倍率・原価率の上がり） */
export function crisisMods(e: Pick<EmpireState, 'crisis' | 'month'>): { demand: number; costRate: number } {
  const on = (id: CrisisId) => !!e.crisis?.effects.some((x) => x.id === id && e.month < x.until);
  return { demand: on('food') ? CRISIS.food.demand : 1, costRate: on('supply') ? CRISIS.supply.costRate : 0 };
}

/** その危機の効き目が続く月（効いていなければ null） */
export const crisisUntil = (e: Pick<EmpireState, 'crisis' | 'month'>, id: CrisisId) => e.crisis?.effects.find((x) => x.id === id && e.month < x.until)?.until ?? null;

/** 1 か月ぶんの積もり方（画面で見せる見込みにも使う）。opened はこの月に増えた店、before は月のはじめの店 */
export function crisisDelta(e: EmpireState, opened: number, before = allStores(e)): Record<CrisisId, number> {
  // いちばん品質の崩れた国で見る
  const q = Math.min(1, ...nations(e).map((n) => n.quality));
  const growth = opened / Math.max(60, before);
  const table = e.group?.table ?? [];
  const div = (e.crisis?.diversifiedUntil ?? -1) > e.month;
  return {
    food: Math.max(0, CRISIS.food.quality - q) * CRISIS.food.qualityWeight - CRISIS.food.decay,
    supply: Math.max(0, CRISIS.supply.monthly - (table.includes('factory') ? CRISIS.supply.card : 0) - (table.includes('trade') ? CRISIS.supply.card : 0) - (div ? CRISIS.supply.diversified : 0)),
    overgrow: Math.max(0, CRISIS.overgrow.quality - q) * CRISIS.overgrow.qualityWeight + Math.max(0, growth - CRISIS.overgrow.growth) * CRISIS.overgrow.growthWeight - CRISIS.overgrow.decay,
  };
}

/** 月末の危機（店の売上が出たあと）。opened はこの月に増えた自社の店の数 */
export function crisisStep(e: EmpireState, opened: number, notes: Note[]): void {
  if (e.phase < 3 || !e.nation) return;
  const c = (e.crisis ??= newCrisis());
  c.effects = c.effects.filter((x) => x.until > e.month);
  const delta = crisisDelta(e, opened, allStores(e) - opened);
  for (const id of CRISES) {
    let v = clamp(c.meters[id] + delta[id], 0, 100);
    // 予兆を出さずには起きない：予兆の前に線を越えたら、その月は予兆で止める
    if (v >= CRISIS.strike && !c.warned[id]) v = CRISIS.strike - 1;
    c.meters[id] = v;
    if (v < CRISIS.rearm) c.warned[id] = false;
    if (v >= CRISIS.strike) {
      strike(e, id, notes);
      c.warned[id] = false;
    } else if (v >= CRISIS.sign && !c.warned[id]) {
      c.warned[id] = true;
      notes.push({ kind: 'crisisSign', crisis: id });
    }
  }
}

/** 危機が起きる */
function strike(e: EmpireState, id: CrisisId, notes: Note[]): void {
  const c = e.crisis!;
  if (id === 'food') {
    c.meters.food = CRISIS.food.after;
    c.effects.push({ id, until: e.month + 1 + CRISIS.food.months });
    if (e.crowns) e.crowns.shock = Math.min(0.6, e.crowns.shock + CRISIS.food.shock);
    if (e.stake) e.stake.support.regulars = Math.max(0, e.stake.support.regulars - CRISIS.food.regulars);
  } else if (id === 'supply') {
    c.meters.supply = CRISIS.supply.after;
    c.effects.push({ id, until: e.month + 1 + CRISIS.supply.months });
  } else {
    c.meters.overgrow = CRISIS.overgrow.after;
    for (const n of nations(e)) {
      n.quality = Math.max(0.5, n.quality - CRISIS.overgrow.qualityHit);
      n.satisfaction = Math.max(0, n.satisfaction - CRISIS.overgrow.satisfaction);
    }
    if (e.stake) e.stake.support.staff = Math.max(0, e.stake.support.staff - CRISIS.overgrow.staff);
  }
  notes.push({ kind: 'crisis', crisis: id });
}

export function restoreCrisis(raw: unknown): Crisis | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const c = raw as Partial<Crisis>;
  const num = (v: unknown, f: number) => (typeof v === 'number' && Number.isFinite(v) ? v : f);
  const base = newCrisis();
  for (const id of CRISES) {
    base.meters[id] = clamp(num(c.meters?.[id], 0), 0, 100);
    base.warned[id] = c.warned?.[id] === true;
  }
  base.effects = (Array.isArray(c.effects) ? c.effects : []).filter((x) => CRISES.includes(x?.id)).map((x) => ({ id: x.id, until: num(x.until, 0) }));
  base.diversifiedUntil = num(c.diversifiedUntil, -1);
  return base;
}
