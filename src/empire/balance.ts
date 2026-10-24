// 経営モードのバランス測定（scripts/empire-sim.mjs から呼ぶ）。3 つの戦略のボットで、
// フェーズごとの所要月数と資金の推移を測る。フェーズ 1（3 店舗・3 か月連続の黒字）と
// フェーズ 2（12 店・ライバルより多い・物流センター）。
import { cannibalMult, CENTER_RANGE, dist, freeCells } from './area';
import { newEmpire, type EmpireState } from './model';
import {
  advanceMonth,
  AREA_OPEN_COST,
  canPromote,
  CENTER_COST,
  letterFor,
  OPEN_COST,
  ownCells,
  phase1Done,
  phase2Done,
  plotsFor,
  POS_COST,
  RENOVATE_COST,
  STAFF_NEEDED,
  SV_SPAN,
  type Decisions,
} from './sim';

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

/** フェーズ 2 の手：食い合いの少ない区画に出し、店が集まったら物流センター、SV は店の数なり */
function phase2Moves(s: EmpireState, reserve: number): Decisions {
  const area = s.area!;
  const own = ownCells(s);
  const d: Decisions = { sv: Math.ceil(s.stores.length / SV_SPAN) };
  let funds = s.funds;
  if (area.centers.length === 0 && s.stores.length >= 5 && funds > CENTER_COST * 1.2) {
    // 自店がいちばん多く配送圏に入る空き区画
    const free = freeCells(area, new Set(own));
    const best = free.sort((a, b) => own.filter((c) => dist(area, c, b) <= CENTER_RANGE).length - own.filter((c) => dist(area, c, a) <= CENTER_RANGE).length)[0];
    d.buildCenter = [best];
    funds -= CENTER_COST;
  }
  if (!s.pos && funds > POS_COST * 3) {
    d.pos = true;
    funds -= POS_COST;
  }
  const opens: number[] = [];
  // 店が 5 店を超えたら、物流センターの資金を先に貯める
  const saving = area.centers.length === 0 && !d.buildCenter && s.stores.length >= 5;
  while (!saving && funds > AREA_OPEN_COST * reserve && s.stores.length + opens.length < 30) {
    const taken = new Set([...own, ...opens, ...(d.buildCenter ?? [])]);
    const free = freeCells(area, taken);
    const cells = [...own, ...opens];
    const score = (i: number) => area.cells[i].base * cannibalMult(area, i, [...cells, i]) - area.cells[i].rent / 30 + (area.centers.some((c) => dist(area, c, i) <= CENTER_RANGE) ? 20_000 : 0);
    const best = free.sort((a, b) => score(b) - score(a))[0];
    if (best === undefined) break;
    opens.push(best);
    funds -= AREA_OPEN_COST;
  }
  d.openAt = opens;
  return d;
}

/** フェーズごとに手を変えるボット */
const staged = (p1: (s: EmpireState) => Decisions, reserve: number) => (s: EmpireState): Decisions => {
  if (canPromote(s) && s.phase === 1) return { promote: true };
  return s.phase === 1 ? p1(s) : phase2Moves(s, reserve);
};

const BOTS_P1: Bot[] = [
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

export const BOTS: Bot[] = BOTS_P1.map((b, i) => ({ name: b.name, decide: staged(b.decide, [1.6, 1.25, 1][i]) }));

export interface BotResult {
  bot: string;
  seed: number;
  /** フェーズ 1 の条件を満たした月（満たさなければ null） */
  phase1Month: number | null;
  /** フェーズ 2 の条件を満たした月 */
  phase2Month: number | null;
  stores: number;
  funds: number;
  /** 資金がマイナスで終わった月の数 */
  redMonths: number;
}

export function runBot(bot: Bot, seed: number, months: number): BotResult {
  let s = newEmpire(bot.name, seed);
  let phase1Month: number | null = null;
  let phase2Month: number | null = null;
  let redMonths = 0;
  for (let i = 0; i < months; i++) {
    s = advanceMonth(s, bot.decide(s)).state;
    if (s.funds < 0) redMonths++;
    if (phase1Month === null && phase1Done(s)) phase1Month = s.month;
    if (phase2Month === null && s.phase === 2 && phase2Done(s)) phase2Month = s.month;
  }
  return { bot: bot.name, seed, phase1Month, phase2Month, stores: s.stores.length, funds: Math.round(s.funds), redMonths };
}
