// 経営モードの状態（docs/EMPIRE_DESIGN.md 9 章）。DOM に触れない。
// 会社の資金の単位は GUM だが、工房の GUM とは別の財布（本店 → 会社の一方向）。
import type { Area } from './area';
import { newNationExtras, STORE_TYPES, type Nation } from './nation';
import { restoreStake, type Stake, type StakeholderId } from './stakeholders';
import { restoreGovernance, type Governance, type PromiseKind } from './governance';
import { restoreCrowns, type CrownId, type Crowns } from './crowns';
import type { Campaign } from './rivalai';
import { FOCUSES, type Focus } from './lands';
import { restoreCourt, type Court, type Offering, type Privilege } from './court';
import { ENTRY_MODES, type Branch, type EntryMode, type World } from './world';
import { restoreGroup, type Group } from './group';
import type { Business } from './business';

/** 区画の種類（フェーズ 1 の出店候補）。home は創業の 1 号店、liquor は加盟した酒屋 */
export type PlotKind = 'home' | 'station' | 'residential' | 'suburb' | 'office' | 'school' | 'liquor';

/** 出店できる区画 */
export interface Plot {
  kind: PlotKind;
  /** 基礎日販（GUM/日） */
  base: number;
  /** 月の家賃（加盟店はオーナーの土地なので 0） */
  rent: number;
  /** 加盟店のオーナー（ヒーローの id）。直営は null */
  owner: number | null;
}

export const HOME_PLOT: Plot = { kind: 'home', base: 300_000, rent: 400_000, owner: null };

export interface Store {
  id: number;
  plot: PlotKind;
  /** 加盟店のオーナー（ヒーローの id）。直営は null。加盟店は粗利を本部とオーナーで分ける */
  owner: number | null;
  /** エリアの地図の区画（フェーズ 2 から。フェーズ 1 は null） */
  cell: number | null;
  /** 開いた月（EmpireState.month） */
  opened: number;
  /** 区画の基礎日販（GUM/日、16 時間営業・改装なし・平月） */
  base: number;
  /** 月の家賃 */
  rent: number;
  /** 発注の多さ（見込み需要に対する仕入れの倍率） */
  order: number;
  hours: 16 | 24;
  /** シフトに入る人数 */
  staff: number;
  sign: boolean;
  parking: boolean;
  /** 店主の疲れ（0〜100）。人手が足りないと積もり、需要が落ちる */
  fatigue: number;
}

export interface StoreReport {
  id: number;
  /** 見込み需要（店主に見えていた数字）と実際の需要（日あたり、売価） */
  expected: number;
  demand: number;
  revenue: number;
  /** 仕入れ（原価）。売れ残りの分も含む */
  purchases: number;
  /** 売れ残り・欠品（売価、月あたり） */
  waste: number;
  lost: number;
  labor: number;
  rent: number;
  profit: number;
  fatigue: number;
}

/** 報告の一行。画面が言葉にする（予兆は必ずここに出してから起こす） */
export type Note =
  | { kind: 'fatigue'; store: number }
  | { kind: 'waste'; store: number }
  | { kind: 'stockout'; store: number }
  | { kind: 'opened'; store: number }
  | { kind: 'shortOfFunds' }
  | { kind: 'storeLimit' }
  | { kind: 'phaseReady' }
  | { kind: 'promoted'; phase: number }
  | { kind: 'rivalPlan'; cell: number }
  | { kind: 'rivalOpened'; cell: number }
  | { kind: 'centerBuilt'; cell: number }
  | { kind: 'crowded'; store: number }
  | { kind: 'hubBuilt'; region: number }
  | { kind: 'needHub'; region: number }
  | { kind: 'traineeLimit'; trainees: number }
  | { kind: 'qualityWarn' }
  | { kind: 'manualReady' }
  | { kind: 'ownerUnrest'; satisfaction: number }
  | { kind: 'investigationSoon' }
  | { kind: 'investigation'; fine: number }
  | { kind: 'eraSoon'; strict: boolean; month: number }
  | { kind: 'eraChanged'; strict: boolean }
  | { kind: 'eraCap'; cap: number }
  | { kind: 'landSlowing' }
  | { kind: 'landFalling' }
  | { kind: 'marginCall'; amount: number }
  | { kind: 'ipo'; raised: number }
  | { kind: 'pbUp'; level: number }
  /** ステークホルダーの要望（期限つき）・取り下げ・最後通告（stakeholders.ts） */
  | { kind: 'demand'; who: StakeholderId; due: number }
  | { kind: 'demandMet'; who: StakeholderId }
  | { kind: 'ultimatum'; who: StakeholderId; months: number }
  /** 株主総会（governance.ts）：延期・開催・去年の約束の答え合わせ */
  | { kind: 'meetingPostponed'; month: number }
  | { kind: 'meetingHeld'; approval: number; passed: boolean; dividend: number; amended: boolean; listed: boolean }
  | { kind: 'pledgeResult'; pledge: PromiseKind; kept: boolean }
  | { kind: 'meetingSoon'; month: number }
  /** 3 冠と規制（crowns.ts）、ライバルのセール攻勢（rivalai.ts） */
  | { kind: 'crown'; crown: CrownId; won: boolean }
  | { kind: 'regulationWatch' }
  | { kind: 'regulationFine'; fine: number }
  | { kind: 'breakupWarning'; months: number }
  | { kind: 'breakupCleared' }
  | { kind: 'breakup'; stores: number }
  | { kind: 'campaignSoon'; region: number; month: number }
  | { kind: 'campaign'; region: number; until: number }
  | { kind: 'focusChanged'; focus: Focus }
  /** 政府の注目とキングとの謁見（court.ts） */
  | { kind: 'attention'; stage: number; land?: string }
  | { kind: 'audienceInvite'; land?: string }
  | { kind: 'audience'; offering: Offering; success: boolean; privilege: Privilege; land?: string }
  /** フェーズ 4 世界展開（world.ts） */
  | { kind: 'entered'; land: string; mode: EntryMode }
  | { kind: 'exited'; land: string; stores: number }
  | { kind: 'jvBuyout'; land: string }
  | { kind: 'licenseWarning'; land: string; month: number }
  | { kind: 'licenseBroke'; land: string; stores: number }
  /** フェーズ 5 企業グループ（group.ts・business.ts） */
  | { kind: 'auctionSoon'; month: number }
  | { kind: 'auction'; land: string; won: number; wanted: number; paid: number; rivalWon: number }
  | { kind: 'legendCrown'; land: string; crown: CrownId; won: boolean }
  | { kind: 'tableChanged'; added: Business[]; removed: Business[] }
  | { kind: 'ending' };

export interface MonthReport {
  month: number;
  revenue: number;
  /** この月に本店から届いた送金 */
  inflow: number;
  /** 本部の費用（SV・物流センター・物流拠点・研修所）。利益からは引いてある */
  overhead?: number;
  /** フェーズ 3 から：ライバルの売上（本拠ランド全体） */
  rivalRevenue?: number;
  /** フェーズ 4 から：本拠の外のランドの売上（revenue に含む） */
  foreignRevenue?: number;
  /** フェーズ 5 から：会議卓の事業の利益（profit に含む） */
  groupProfit?: number;
  profit: number;
  funds: number;
  stores: StoreReport[];
  notes: Note[];
}

export interface EmpireState {
  /** 屋号 */
  name: string;
  phase: 1 | 2 | 3 | 4 | 5;
  /** 創業からの月（0 が最初の月） */
  month: number;
  funds: number;
  /** 乱数の状態（rng.ts） */
  rng: number;
  stores: Store[];
  nextStoreId: number;
  /** 前の月を進めてから本店から届いた送金（次の報告に載せて 0 に戻す） */
  inflow: number;
  /** 直近の報告（新しいものが後ろ、最大 HISTORY 件） */
  history: MonthReport[];
  /** 本拠のランド（ライバルが決まる。catalog の lands[].key） */
  land: string;
  /** エリアの地図（フェーズ 2 から） */
  area: Area | null;
  /** SV（巡回指導員）の人数 */
  sv: number;
  /** POS を入れたか */
  pos: boolean;
  /** フェーズ 3 から：本拠ランドの 11 エリア（古いセーブは 6 エリア） */
  nation: Nation | null;
  /** ステークホルダーの支持度・要望・最後通告（M8 から。無ければ最初の月に作る） */
  stake?: Stake;
  /** フェーズ 3 から：役員会・株主総会・定款（無ければフェーズ 3 の最初の月に作る） */
  gov?: Governance;
  /** フェーズ 3 から：3 冠と規制 */
  crowns?: Crowns;
  /** フェーズ 3 から：ライバルのセール攻勢（予告ずみ・進行中） */
  campaign?: Campaign | null;
  /** 会社の品ぞろえ（当たるビジネス）。ランドの文化との合い方が客足に掛かる（無ければ日用品） */
  focus?: Focus;
  /** フェーズ 3 から：政府の注目度とキングとの謁見、特権 */
  court?: Court;
  /** フェーズ 4 から：渡ったランドと、ほかの会社の進み具合 */
  world?: World;
  /** フェーズ 5 から：会議卓・地主会・Legendary の番付・エンディング */
  group?: Group;
}

export const HISTORY = 24;
/** 6 エリアだったころの並びのレアリティ */
const OLD_RARITY = [0, 0, 1, 1, 2, 3];
/** 創業時の資金（仮。本店からの送金の率は M2 で決める） */
export const START_FUNDS = 10_000_000;

export function newStore(id: number, opened: number, plot: Plot = HOME_PLOT): Store {
  return { id, plot: plot.kind, owner: plot.owner, cell: null, opened, base: plot.base, rent: plot.rent, order: 1.1, hours: 16, staff: 3, sign: false, parking: false, fatigue: 0 };
}

export function newEmpire(name: string, seed: number, land = 'Ocean', focus?: Focus): EmpireState {
  return { name, phase: 1, month: 0, funds: START_FUNDS, rng: seed >>> 0, stores: [newStore(1, 0)], nextStoreId: 2, inflow: 0, history: [], land, area: null, sv: 0, pos: false, nation: null, ...(focus ? { focus } : {}) };
}

const num = (v: unknown, fallback: number) => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);

/** 保存された会社を読み直す。形が壊れていれば null（工房のセーブは読めるままにする） */
export function restoreEmpire(raw: unknown): EmpireState | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Partial<EmpireState>;
  if (!Array.isArray(r.stores)) return null;
  const base = newEmpire(typeof r.name === 'string' ? r.name : '', num(r.rng, 1));
  const stores = r.stores
    .filter((s): s is Store => !!s && typeof s === 'object' && typeof s.id === 'number')
    .map((s) => ({ ...newStore(s.id, num(s.opened, 0)), ...s, owner: typeof s.owner === 'number' ? s.owner : null, cell: typeof s.cell === 'number' ? s.cell : null, hours: s.hours === 24 ? 24 : 16 }) as Store);
  const phase = [1, 2, 3, 4, 5].includes(r.phase as number) ? (r.phase as EmpireState['phase']) : 1;
  return {
    ...base,
    phase,
    month: num(r.month, 0),
    funds: num(r.funds, base.funds),
    inflow: num(r.inflow, 0),
    stores,
    nextStoreId: Math.max(num(r.nextStoreId, 1), ...stores.map((s) => s.id + 1)),
    history: Array.isArray(r.history) ? r.history.slice(-HISTORY) : [],
    land: typeof r.land === 'string' ? r.land : base.land,
    area: restoreArea(r.area),
    sv: Math.max(0, Math.floor(num(r.sv, 0))),
    pos: r.pos === true,
    nation: restoreNation(r.nation),
    stake: restoreStake(r.stake),
    gov: restoreGovernance(r.gov),
    crowns: restoreCrowns(r.crowns),
    campaign: restoreCampaign(r.campaign),
    court: restoreCourt(r.court),
    world: restoreWorld(r.world),
    group: restoreGroup(r.group),
    ...(FOCUSES.includes(r.focus as Focus) ? { focus: r.focus } : {}),
  };
}

function restoreWorld(raw: unknown): World | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const w = raw as Partial<World>;
  const rec = (v: unknown) => (v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).filter(([, x]) => typeof x === 'number' && Number.isFinite(x))) : {}) as Record<string, number>;
  const branches = (Array.isArray(w.branches) ? w.branches : []).flatMap((b): Branch[] => {
    const nation = restoreNation(b?.nation);
    if (!b || typeof b.land !== 'string' || !nation) return [];
    return [
      {
        land: b.land,
        mode: ENTRY_MODES.includes(b.mode) ? b.mode : 'direct',
        opened: num(b.opened, 0),
        nation,
        court: restoreCourt(b.court) ?? { attention: 0, stage: 0, invited: false, audience: false, privileges: [] },
        local: Math.min(1, Math.max(0.5, num(b.local, 0.85))),
        partner: Math.max(0, num(b.partner, 0)),
        stake: Math.min(1, Math.max(0, num(b.stake, 1))),
        integrateUntil: num(b.integrateUntil, -1),
        hist: (Array.isArray(b.hist) ? b.hist : []).slice(-12).map((h) => ({ revenue: num(h?.revenue, 0), rival: num(h?.rival, 0) })),
      },
    ];
  });
  return { branches, others: rec(w.others), knowhow: rec(w.knowhow) };
}

function restoreCampaign(raw: unknown): Campaign | null | undefined {
  if (raw === undefined) return undefined;
  if (!raw || typeof raw !== 'object') return null;
  const c = raw as Partial<Campaign>;
  return Number.isInteger(c.region) && typeof c.start === 'number' && typeof c.end === 'number' ? { region: c.region!, start: c.start, end: c.end } : null;
}

function restoreArea(raw: unknown): Area | null {
  if (!raw || typeof raw !== 'object') return null;
  const a = raw as Partial<Area>;
  if (typeof a.w !== 'number' || typeof a.h !== 'number' || !Array.isArray(a.cells) || a.cells.length !== a.w * a.h) return null;
  const ints = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is number => Number.isInteger(x) && x >= 0 && x < a.w! * a.h!) : []);
  const plan = a.rivalPlan && typeof a.rivalPlan === 'object' && Number.isInteger(a.rivalPlan.cell) && typeof a.rivalPlan.month === 'number' ? a.rivalPlan : null;
  return { w: a.w, h: a.h, cells: a.cells.map((c) => ({ base: num(c?.base, 0), rent: num(c?.rent, 0) })), centers: ints(a.centers), rivalStores: ints(a.rivalStores), rivalPlan: plan };
}

function restoreNation(raw: unknown): Nation | null {
  if (!raw || typeof raw !== 'object') return null;
  const n = raw as Partial<Nation>;
  if (!Array.isArray(n.regions) || n.regions.length === 0) return null;
  const int = (v: unknown) => Math.max(0, Math.floor(num(v, 0)));
  const d = newNationExtras([], 0);
  return {
    ...d,
    satisfaction: Math.min(100, Math.max(0, num(n.satisfaction, d.satisfaction))),
    force24: n.force24 === true,
    support: Math.min(3, int(n.support)),
    investigation: typeof n.investigation === 'number' ? n.investigation : null,
    eraStrict: n.eraStrict !== false,
    eraChange: num(n.eraChange, d.eraChange),
    landIndex: num(n.landIndex, 1),
    landStart: num(n.landStart, 0),
    loans: Math.max(0, num(n.loans, 0)),
    listed: n.listed === true,
    ownership: Math.min(1, Math.max(0, num(n.ownership, 1))),
    pb: Math.min(5, int(n.pb)),
    regions: n.regions.map((r, i) => ({
      name: { ja: String(r?.name?.ja ?? ''), en: String(r?.name?.en ?? '') },
      // 6 エリアだったころのセーブは、並びからレアリティを決める（Legendary は無い）
      rarity: Math.min(4, Math.max(0, Math.floor(num(r?.rarity, OLD_RARITY[i] ?? 0)))),
      locked: r?.locked === true,
      capacity: Math.max(1, num(r?.capacity, 30)),
      traffic: num(r?.traffic, 250_000),
      rent: num(r?.rent, 300_000),
      hub: r?.hub === true,
      ...Object.fromEntries(STORE_TYPES.map((k) => [k, int(r?.[k])])),
      rival: int(r?.rival),
      ...(typeof r?.plots === 'number' ? { plots: int(r.plots), rivalPlots: int(r.rivalPlots ?? r.rival) } : {}),
    })) as Nation['regions'],
    trainingCenters: int(n.trainingCenters),
    manual: n.manual === true,
    quality: Math.min(1, Math.max(0.5, num(n.quality, 1))),
  };
}
