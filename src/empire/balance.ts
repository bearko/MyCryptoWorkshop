// 経営モードのバランス測定（scripts/empire-sim.mjs から呼ぶ）。3 つの戦略のボットで、
// フェーズごとの所要月数と資金の推移を測る。いまはフェーズ 1 の条件（3 店舗・3 か月連続の黒字）だけ。
import { newEmpire, type EmpireState } from './model';
import { advanceMonth, OPEN_COST, RENOVATE_COST, STAFF_NEEDED, type Decisions } from './sim';

export interface Bot {
  name: string;
  decide(state: EmpireState): Decisions;
}

/** フェーズ 1 の候補区画（仮。M2 で区画の候補 3 つから選ぶ形にする） */
const PLOT = { base: 260_000, rent: 350_000 };

export const BOTS: Bot[] = [
  {
    name: 'cautious',
    decide: (s) => ({
      stores: Object.fromEntries(s.stores.map((st) => [st.id, { order: 1.0, hours: 16, staff: STAFF_NEEDED[16] }])),
      open: s.funds > OPEN_COST * 3 ? [PLOT] : [],
    }),
  },
  {
    name: 'standard',
    decide: (s) => ({
      stores: Object.fromEntries(s.stores.map((st) => [st.id, { order: 1.08, hours: 16, staff: STAFF_NEEDED[16] }])),
      renovate: s.stores.filter((st) => !st.sign && s.funds > RENOVATE_COST.sign * 2).map((st) => ({ store: st.id, kind: 'sign' as const })),
      open: s.funds > OPEN_COST * 1.5 ? [PLOT] : [],
    }),
  },
  {
    name: 'aggressive',
    decide: (s) => ({
      stores: Object.fromEntries(s.stores.map((st) => [st.id, { order: 1.2, hours: 24, staff: STAFF_NEEDED[24] }])),
      renovate: s.stores.flatMap((st) => [
        ...(!st.sign ? [{ store: st.id, kind: 'sign' as const }] : []),
        ...(!st.parking ? [{ store: st.id, kind: 'parking' as const }] : []),
      ]),
      open: s.funds >= OPEN_COST ? [PLOT] : [],
    }),
  },
];

export interface BotResult {
  bot: string;
  seed: number;
  /** フェーズ 1 の条件を満たした月（満たさなければ null） */
  phase1Month: number | null;
  stores: number;
  funds: number;
  /** 資金がマイナスで終わった月の数 */
  redMonths: number;
}

/** フェーズ 1 を抜ける条件：3 店舗・3 か月連続の黒字 */
export function phase1Done(s: EmpireState): boolean {
  const last = s.history.slice(-3);
  return s.stores.length >= 3 && last.length === 3 && last.every((r) => r.profit > 0);
}

export function runBot(bot: Bot, seed: number, months: number): BotResult {
  let s = newEmpire(bot.name, seed);
  let phase1Month: number | null = null;
  let redMonths = 0;
  for (let i = 0; i < months; i++) {
    s = advanceMonth(s, bot.decide(s)).state;
    if (s.funds < 0) redMonths++;
    if (phase1Month === null && phase1Done(s)) phase1Month = s.month;
  }
  return { bot: bot.name, seed, phase1Month, stores: s.stores.length, funds: Math.round(s.funds), redMonths };
}
