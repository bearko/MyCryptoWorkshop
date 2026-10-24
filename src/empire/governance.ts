// 会社の統治（docs/EMPIRE_DESIGN.md 10.4・10.8）：役員会・年 1 回の株主総会・定款。DOM に触れない純関数。
//
// - 役員会：5 席。工房でスカウトした英雄を座らせる。英雄の得意（酒場の技の種類）と強さで、全社に小さな効き目
// - 株主総会：フェーズ 3 から毎年 6 月。上場前は銀行との面談。信任（支持度の「銀行・株主」）で決議が通るかが決まる。
//   演説で「たたえる相手」「ライバルの名指し」「来年の約束」を 3 択ずつ選ぶ。約束は 1 年後の総会で答え合わせ
// - 延期：年に 1 回まで。2 か月延ばせるが、信任が下がり、次の総会では通る線が上がる
// - 定款：上場のときに 3 つの方針（24 時間営業・加盟店の比率・配当）を決める。変えるには総会の決議
import type { EmpireState, Note } from './model';
import { nationStores, type StoreType } from './nation';
import { newStake } from './stakeholders';

/** 役員の得意（酒場の技の種類と同じ名前） */
export type BoardKind = 'sales' | 'crowd' | 'craft' | 'luck' | 'sweep' | 'rush' | 'wait' | 'vip' | 'wish' | 'restock' | 'study';

export interface BoardMember {
  /** ヒーローの id */
  id: number;
  kind: BoardKind;
  /** 強さ（酒場の格 × スカウトの段。1〜6 ほど）。座らせたときの値を覚えておく */
  power: number;
}

export type PraiseTarget = 'owners' | 'staff' | 'regulars';
export type RivalCall = 'declare' | 'hint' | 'none';
export type PromiseKind = 'revenue' | 'stores' | 'noLoss';

export interface Pledge {
  kind: PromiseKind;
  /** 約束した月と、答え合わせの月 */
  made: number;
  due: number;
  /** 約束したときの数字（売上は直近 12 か月、店は店数） */
  base: number;
}

export interface Articles {
  /** 加盟店に 24 時間営業を求めることを認めるか */
  force24: boolean;
  /** 新しく出す店の形：直営中心・半々・加盟中心 */
  mix: 'direct' | 'balanced' | 'franchise';
  /** 配当：直近 12 か月の利益のうち、総会で払う割合の段（0〜2） */
  dividend: 0 | 1 | 2;
}

export interface Governance {
  board: BoardMember[];
  /** 次の総会の月 */
  nextMeeting: number;
  /** この 1 年で延期したか（次の総会は通る線が上がる） */
  postponed: boolean;
  pledge: Pledge | null;
  articles: Articles | null;
  /** ライバルを名指しした総会のあと、この月まではライバルが速く出店する */
  rivalRushUntil: number;
}

/** 総会での演説と議題（その月の決定に入れる） */
export interface MeetingChoice {
  praise: PraiseTarget;
  rival: RivalCall;
  pledge: PromiseKind;
  /** 定款を 1 か所だけ変える（信任が線を越えていれば通る） */
  amend?: Partial<Articles>;
}

/** 数字は仮。npm run sim:empire で測って決める（EMPIRE_DESIGN 10.8） */
export const BOARD_SEATS = 5;
/** 総会は毎年この月（0 = 1 月） */
export const MEETING_MONTH = 5;
export const MEETING = {
  /** 決議が通る信任の線（延期したあとは上がる） */
  pass: 40,
  passAfterPostpone: 50,
  /** たたえた相手の支持度 */
  praise: 8,
  /** ライバルを名指しすると株主は沸くが、ライバルの出店が速まる（か月） */
  declare: 6,
  hint: 2,
  rivalRushMonths: 6,
  /** 延期：何か月延ばすか、信任の下がり */
  postponeMonths: 2,
  postponeCost: 8,
  /** 約束を守った・破った */
  kept: 15,
  broken: 20,
  /** 定款を変えるのに要る信任 */
  amend: 50,
} as const;

/** 約束の中身：売上を 2 割伸ばす・店を 20 店増やす・赤字の月を出さない */
export const PLEDGE = { revenueGrowth: 1.2, stores: 20 } as const;

/** 配当の段：利益のうち払う割合と、株主の喜び */
export const DIVIDEND = [
  { rate: 0, trust: 0 },
  { rate: 0.2, trust: 4 },
  { rate: 0.4, trust: 8 },
] as const;

/** 定款の加盟店の比率：新しく出す店のうち、少ない側の形が占めてよい割合 */
export const MIX_CAP = 1 / 3;

/** 役員 1 人の効き目（強さ 1 あたり） */
export const BOARD_EFFECT = {
  demand: 0.005,
  costCut: 0.003,
  interest: 0.05,
  support: 0.5,
  quality: 0.002,
  fine: 0.1,
} as const;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** m 以降で、最初の総会の月（少なくとも after か月あと） */
export function firstMeeting(m: number, after = 6): number {
  let x = m + after;
  while (x % 12 !== MEETING_MONTH) x++;
  return x;
}

export function newGovernance(month: number): Governance {
  return { board: [], nextMeeting: firstMeeting(month), postponed: false, pledge: null, articles: null, rivalRushUntil: -1 };
}

/** 今月が総会の月か */
export const meetingNow = (e: Pick<EmpireState, 'gov' | 'month' | 'phase'>) => e.phase >= 3 && !!e.gov && e.month >= e.gov.nextMeeting;

/** 信任（支持度の「銀行・株主」） */
export const trustOf = (e: Pick<EmpireState, 'stake'>) => e.stake?.support.shareholders ?? 60;

/** 役員会の効き目の合計 */
export function boardMods(g: Governance | null | undefined): { demand: number; costCut: number; interest: number; staff: number; owners: number; shareholders: number; quality: number; fine: number } {
  const sum = (kinds: BoardKind[]) => (g?.board ?? []).filter((b) => kinds.includes(b.kind)).reduce((a, b) => a + b.power, 0);
  return {
    demand: 1 + sum(['sales', 'crowd']) * BOARD_EFFECT.demand,
    costCut: sum(['craft', 'restock']) * BOARD_EFFECT.costCut,
    interest: Math.max(0.5, 1 - sum(['luck']) * BOARD_EFFECT.interest),
    staff: sum(['wait']) * BOARD_EFFECT.support,
    owners: sum(['wish']) * BOARD_EFFECT.support,
    shareholders: sum(['vip']) * BOARD_EFFECT.support,
    quality: sum(['rush', 'study']) * BOARD_EFFECT.quality,
    fine: Math.max(0.5, 1 - sum(['sweep']) * BOARD_EFFECT.fine),
  };
}

/** 役員会の顔ぶれを決める（重複を除き、5 席まで） */
export function seatBoard(members: BoardMember[]): BoardMember[] {
  const seen = new Set<number>();
  return members.filter((m) => !seen.has(m.id) && seen.add(m.id)).slice(0, BOARD_SEATS);
}

/** 定款の加盟店の比率で、今月の出店を削る（少ない側の形を、出す店の MIX_CAP までにする） */
export function capByArticles(expand: { region: number; type: StoreType; count: number }[], a: Articles | null): { region: number; type: StoreType; count: number }[] {
  if (!a || a.mix === 'balanced') return expand;
  const total = expand.reduce((x, y) => x + y.count, 0);
  const minor = (t: StoreType) => (a.mix === 'direct' ? t !== 'direct' : t === 'direct');
  let room = Math.floor(total * MIX_CAP);
  return expand.map((x) => {
    if (!minor(x.type)) return x;
    const c = Math.min(x.count, room);
    room -= c;
    return { ...x, count: c };
  });
}

/** 直近 12 か月の売上・利益と、赤字の月があったか（今月の報告より前） */
function trailing(e: EmpireState) {
  const last = e.history.slice(-12);
  return { revenue: last.reduce((a, r) => a + r.revenue, 0), profit: last.reduce((a, r) => a + r.profit, 0), loss: last.some((r) => r.profit < 0), months: last.length };
}

/** 約束を守れたか（答え合わせの月の数字で） */
export function pledgeKept(e: EmpireState, p: Pledge): boolean {
  const tr = trailing(e);
  if (p.kind === 'revenue') return tr.revenue >= p.base * PLEDGE.revenueGrowth;
  if (p.kind === 'stores') return (e.nation ? nationStores(e.nation) : e.stores.length) >= p.base + PLEDGE.stores;
  // 赤字を出さない：約束してからの月だけを見る
  return !e.history.filter((r) => r.month >= p.made).some((r) => r.profit < 0);
}

/** 約束したときの数字 */
export function pledgeBase(e: EmpireState, kind: PromiseKind): number {
  if (kind === 'revenue') return trailing(e).revenue;
  if (kind === 'stores') return e.nation ? nationStores(e.nation) : e.stores.length;
  return 0;
}

/**
 * 総会（月の決定を当てる前に呼ぶ）。延期・開催・約束の答え合わせ・配当・定款の変更。
 * 信任は e.stake.support.shareholders を直接動かす。資金（配当）も動く。
 */
export function holdMeeting(e: EmpireState, choice: MeetingChoice | undefined, postpone: boolean, notes: Note[]): void {
  const g = e.gov;
  if (!g || !meetingNow(e)) return;
  const st = (e.stake ??= newStake());
  const trust = () => st.support.shareholders;
  const setTrust = (v: number) => (st.support.shareholders = clamp(Math.round(v), 0, 100));
  if (postpone && !g.postponed) {
    g.postponed = true;
    g.nextMeeting = e.month + MEETING.postponeMonths;
    setTrust(trust() - MEETING.postponeCost);
    notes.push({ kind: 'meetingPostponed', month: g.nextMeeting });
    return;
  }
  // 去年の約束の答え合わせ
  if (g.pledge && e.month >= g.pledge.due) {
    const ok = pledgeKept(e, g.pledge);
    setTrust(trust() + (ok ? MEETING.kept : -MEETING.broken));
    notes.push({ kind: 'pledgeResult', pledge: g.pledge.kind, kept: ok });
    g.pledge = null;
  }
  const c: MeetingChoice = choice ?? { praise: 'staff', rival: 'none', pledge: 'noLoss' };
  // 演説：たたえた相手は支持度が上がる。加盟オーナー会は満足度
  if (c.praise === 'owners' && e.nation) e.nation.satisfaction = clamp(e.nation.satisfaction + MEETING.praise, 0, 100);
  else if (c.praise !== 'owners') st.support[c.praise] = clamp(st.support[c.praise] + MEETING.praise, 0, 100);
  if (c.rival === 'declare') {
    setTrust(trust() + MEETING.declare);
    g.rivalRushUntil = e.month + MEETING.rivalRushMonths;
  } else if (c.rival === 'hint') setTrust(trust() + MEETING.hint);
  // 原稿を用意しなかった総会は、株主の受けが悪い
  if (!choice) setTrust(trust() - 5);
  // 配当（上場していれば定款の段で。上場前は銀行なので配当はない）
  let dividend = 0;
  if (e.nation?.listed && g.articles) {
    const d = DIVIDEND[g.articles.dividend];
    // 外の株主の持分のぶんだけ払う（創業者の持分は会社に残す）
    dividend = Math.max(0, trailing(e).profit) * d.rate * (1 - e.nation.ownership);
    e.funds -= dividend;
    setTrust(trust() + d.trust);
  }
  const line = g.postponed ? MEETING.passAfterPostpone : MEETING.pass;
  const approval = trust();
  const passed = approval >= line;
  // 定款の変更：信任が線を越えていれば通る
  let amended = false;
  if (passed && c.amend && g.articles && approval >= MEETING.amend) {
    g.articles = { ...g.articles, ...c.amend };
    if (e.nation && g.articles.force24 === false) e.nation.force24 = false;
    amended = true;
  }
  g.pledge = { kind: c.pledge, made: e.month, due: e.month + 12, base: pledgeBase(e, c.pledge) };
  g.nextMeeting = firstMeeting(e.month, 1);
  g.postponed = false;
  notes.push({ kind: 'meetingHeld', approval, passed, dividend, amended, listed: !!e.nation?.listed });
  // 否決：銀行・株主の最後通告と同じ重し（借入の枠が半分）
  if (!passed) st.penalties.push({ who: 'shareholders', until: e.month + 6 });
}

/** 役員会の効き目を、毎月の支持度に足す（stakeStep のあと） */
export function boardMonth(e: EmpireState): void {
  if (!e.gov?.board.length || !e.stake) return;
  const b = boardMods(e.gov);
  const st = e.stake.support;
  st.staff = clamp(st.staff + b.staff, 0, 100);
  st.shareholders = clamp(st.shareholders + b.shareholders, 0, 100);
  if (e.nation) e.nation.satisfaction = clamp(e.nation.satisfaction + b.owners, 0, 100);
}

export function restoreGovernance(raw: unknown): Governance | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const g = raw as Partial<Governance>;
  const num = (v: unknown, f: number) => (typeof v === 'number' && Number.isFinite(v) ? v : f);
  const kinds: BoardKind[] = ['sales', 'crowd', 'craft', 'luck', 'sweep', 'rush', 'wait', 'vip', 'wish', 'restock', 'study'];
  const p = g.pledge;
  const a = g.articles;
  return {
    board: seatBoard((Array.isArray(g.board) ? g.board : []).filter((b): b is BoardMember => !!b && Number.isInteger(b.id) && kinds.includes(b.kind)).map((b) => ({ id: b.id, kind: b.kind, power: clamp(num(b.power, 1), 0, 10) }))),
    nextMeeting: num(g.nextMeeting, 0),
    postponed: g.postponed === true,
    pledge: p && ['revenue', 'stores', 'noLoss'].includes(p.kind) ? { kind: p.kind, made: num(p.made, 0), due: num(p.due, 0), base: num(p.base, 0) } : null,
    articles: a ? { force24: a.force24 === true, mix: a.mix === 'direct' || a.mix === 'franchise' ? a.mix : 'balanced', dividend: ([0, 1, 2] as const).includes(a.dividend as 0) ? (a.dividend as 0 | 1 | 2) : 1 } : null,
    rivalRushUntil: num(g.rivalRushUntil, -1),
  };
}
