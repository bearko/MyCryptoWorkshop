// 経営モードのバランス測定（scripts/empire-sim.mjs から呼ぶ）。3 つの戦略のボットで、
// フェーズごとの所要月数と資金の推移を測る。いまはフェーズ 1 の条件（3 店舗・3 か月連続の黒字）だけ。
import { newEmpire, type EmpireState } from './model';
import { advanceMonth, letterFor, OPEN_COST, phase1Done, plotsFor, RENOVATE_COST, STAFF_NEEDED, type Decisions } from './sim';

export interface Bot {
  name: string;
  decide(state: EmpireState): Decisions;
}

/** 候補のうち、家賃のわりに日販が高い区画（ボットの選び方） */
const bestPlot = (s: EmpireState) => [...plotsFor(s)].sort((a, b) => b.base * 30 * 0.27 - b.rent - (a.base * 30 * 0.27 - a.rent))[0];
/** 手紙が来ていれば加盟店を受ける（ボットは id 1 のヒーロー） */
const withLetter = (s: EmpireState) => {
  const l = letterFor(s, 1);
  return l ? [l] : [];
};

export const BOTS: Bot[] = [
  {
    name: 'cautious',
    decide: (s) => ({
      stores: Object.fromEntries(s.stores.map((st) => [st.id, { order: 1.0, hours: 16, staff: STAFF_NEEDED[16] }])),
      open: s.funds > OPEN_COST * 1.5 ? [bestPlot(s)] : withLetter(s),
    }),
  },
  {
    name: 'standard',
    decide: (s) => ({
      stores: Object.fromEntries(s.stores.map((st) => [st.id, { order: 1.08, hours: 16, staff: STAFF_NEEDED[16] }])),
      renovate: s.stores.filter((st) => !st.sign && s.funds > RENOVATE_COST.sign * 2).map((st) => ({ store: st.id, kind: 'sign' as const })),
      open: s.funds > OPEN_COST * 1.1 ? [bestPlot(s)] : withLetter(s),
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
      open: s.funds >= OPEN_COST ? [bestPlot(s)] : withLetter(s),
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
