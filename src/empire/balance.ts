// 経営モードのバランス測定（scripts/empire-sim.mjs から呼ぶ）。3 つの戦略のボットで、
// フェーズごとの所要月数と資金の推移を測る。フェーズ 1（3 店舗・3 か月連続の黒字）と
// フェーズ 2（12 店・ライバルより多い・物流センター）とフェーズ 3（本拠ランドで売上 1 位）。
import { cannibalMult, CENTER_RANGE, dist, freeCells } from './area';
import { newEmpire, type EmpireState } from './model';
import { meetingNow } from './governance';
import type { Focus } from './lands';
import { crownStats, REGULATION } from './crowns';
import { HUB_COST, OPEN_COSTS, regionStores, trainees, TRAINING_COST, type StoreType } from './nation';
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
  phase3Done,
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

/** フェーズ 3 の手：研修所を建て、人通りの多いエリアから物流拠点、育った人数ぶん出店 */
function phase3Moves(s: EmpireState, reserve: number, type: StoreType): Decisions {
  const n = s.nation!;
  // 株主総会：従業員をたたえ、ライバルは遠回しに、約束は「赤字を出さない」
  const d: Decisions = { expand: [], ...(meetingNow(s) ? { meeting: { praise: 'staff', rival: 'hint', pledge: 'noLoss' } as const } : {}) };
  let funds = s.funds;
  if (n.trainingCenters < 4 && funds > TRAINING_COST * 2 * reserve) {
    d.training = 1;
    funds -= TRAINING_COST;
  }
  const noHub = n.regions.map((r, i) => ({ r, i })).filter((x) => !x.r.hub && !x.r.locked && x.i !== 0).sort((a, b) => b.r.traffic - a.r.traffic);
  const open = n.regions.filter((r, i) => (r.hub || i === 0) && regionStores(r) < r.capacity * 0.75);
  if (noHub.length && (open.length === 0 || funds > HUB_COST * 1.5 * reserve)) {
    d.buildHub = [noHub[0].i];
    funds -= HUB_COST;
  }
  if (n.manual === false && n.quality < 0.9) d.manual = true;
  // 規制：シェアが分割の線に近づいたら、出店を止める（人のプレイヤーもメーターを見て止める）
  const share = crownStats(s)?.share ?? 0;
  let people = share >= REGULATION.breakup - 0.03 ? 0 : trainees(n);
  for (const [i, r] of n.regions.entries()) {
    if (!(r.hub || i === 0) && !d.buildHub?.includes(i)) continue;
    const room = Math.floor(r.capacity * 0.75) - regionStores(r);
    const afford = Math.floor(funds / (OPEN_COSTS[type] * reserve));
    const count = Math.max(0, Math.min(room, people, afford));
    if (count > 0) {
      d.expand!.push({ region: i, type, count });
      people -= count;
      funds -= count * OPEN_COSTS[type];
    }
  }
  return d;
}

/**
 * 絵馬（期限つきの要望）に応える：問屋には発注をしぼり、常連客には発注を戻し、商店街には 24 時間をやめる。
 * 人のプレイヤーも絵馬を見て直すので、ボットも同じだけ応える（応えないと最後通告が続く）
 */
function heedDemands(s: EmpireState, d: Decisions): Decisions {
  const who = new Set((s.stake?.demands ?? []).map((x) => x.who));
  if (!who.size || s.phase >= 3) {
    if (who.has('staff') || who.has('shotengai') || who.has('regulars')) return { ...d, expand: (d.expand ?? []).map((x) => ({ ...x, count: Math.ceil(x.count / 2) })), force24: false };
    return d;
  }
  // 商店街：出店はひと月 2 店まで
  const openAt = who.has('shotengai') ? (d.openAt ?? []).slice(0, 2) : d.openAt;
  const stores = { ...d.stores };
  for (const st of s.stores) {
    const c = { ...stores[st.id] };
    if (who.has('wholesaler')) c.order = Math.min(c.order ?? st.order, 1.05);
    if (who.has('regulars')) c.order = Math.max(c.order ?? st.order, 1.1);
    if (who.has('shotengai')) Object.assign(c, { hours: 16, staff: STAFF_NEEDED[16] });
    stores[st.id] = c;
  }
  return { ...d, stores, openAt };
}

/** フェーズごとに手を変えるボット */
const staged = (p1: (s: EmpireState) => Decisions, reserve: number, type: StoreType) => (s: EmpireState): Decisions => {
  if (canPromote(s) && s.phase < 3) return { promote: true };
  if (s.phase === 1) return heedDemands(s, p1(s));
  return heedDemands(s, s.phase === 2 ? phase2Moves(s, reserve) : phase3Moves(s, reserve, type));
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

export const BOTS: Bot[] = BOTS_P1.map((b, i) => ({ name: b.name, decide: staged(b.decide, [1.6, 1.25, 1][i], (['fcOwner', 'fcHq', 'direct'] as const)[i]) }));

export interface BotResult {
  bot: string;
  seed: number;
  /** フェーズ 1 の条件を満たした月（満たさなければ null） */
  phase1Month: number | null;
  /** フェーズ 2 の条件を満たした月 */
  phase2Month: number | null;
  /** フェーズ 3 の条件を満たした月 */
  phase3Month: number | null;
  stores: number;
  funds: number;
  /** 資金がマイナスで終わった月の数 */
  redMonths: number;
  /** 最後通告を受けた回数と、要望が出た回数 */
  ultimatums: number;
  demands: number;
}

export function runBot(bot: Bot, seed: number, months: number, land = 'Ocean', focus?: Focus): BotResult {
  let s = newEmpire(bot.name, seed, land, focus);
  let phase1Month: number | null = null;
  let phase2Month: number | null = null;
  let phase3Month: number | null = null;
  let redMonths = 0;
  let ultimatums = 0;
  let demands = 0;
  for (let i = 0; i < months; i++) {
    const step = advanceMonth(s, bot.decide(s));
    s = step.state;
    ultimatums += step.report.notes.filter((n) => n.kind === 'ultimatum').length;
    demands += step.report.notes.filter((n) => n.kind === 'demand').length;
    if (s.funds < 0) redMonths++;
    if (phase1Month === null && phase1Done(s)) phase1Month = s.month;
    if (phase2Month === null && s.phase === 2 && phase2Done(s)) phase2Month = s.month;
    if (phase3Month === null && s.phase === 3 && phase3Done(s)) phase3Month = s.month;
  }
  return { bot: bot.name, seed, phase1Month, phase2Month, phase3Month, stores: s.nation ? s.nation.regions.reduce((a, r) => a + regionStores(r), 0) : s.stores.length, funds: Math.round(s.funds), redMonths, ultimatums, demands };
}
