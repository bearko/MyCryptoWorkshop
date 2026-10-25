// M&A（docs/EMPIRE_DESIGN.md 6.1・10.15）。DOM に触れない純関数。フェーズ 4 から。
//
// 買う側：店を持つランドのライバル会社の株を集める。
//   市場で月に 5% ずつ買える（5% で大量保有の報告が出て、株価が上がる）。市場で買えるのは 30% まで。
//   その先は公開買付け（TOB）：過半数（51%）まで、上乗せ（プレミアム）を付けて買う。
//   承認は「価格・資金の確実さ・規制・信頼」で決まる。そのランドで自社とライバルを合わせたシェアが 5 割を超えるなら当局が認めない。
//   大陸ホールディングスが対抗して名乗り出る：上乗せが 3 割に届かなければ競り負ける。
//   傘下にすると、ライバルは値下げ攻勢と出店をやめ、地主会でも控えめになる。持分に応じて配当が入る。
//   統合（PMI）の費用を払い続けると統合メーターが上がる。上がりきらないまま決算を迎えると減損（買った額の 1 割）。
// 買われる側：フェーズ 5 で上場していると、大陸ホールディングスが株を買い集めてくる（予告つき）。
//   30% に届いた 3 か月後に公開買付け。それまでに防衛策（安定株主・ポイズンピル・ホワイトナイト・MBO）を 1 つ選ぶ。
//   防げなければ、役員会に 2 席を取られ、資金の 2 割を配当に出させられ、会議卓のいちばん高い事業を売らされる。
import { BUSINESS, CORE_SLOT } from './business';
import { MARKET, REGULATION, FISCAL_MONTH } from './crowns';
import type { EmpireState, Note } from './model';
import { rivalDaily, regionStores, type Nation } from './nation';

export type Defense = 'stable' | 'pill' | 'knight' | 'mbo';
export const DEFENSES: Defense[] = ['stable', 'pill', 'knight', 'mbo'];

export interface Holding {
  /** 持分（0〜1） */
  stake: number;
  /** 大量保有の報告を出したか（5% から。株価が上がる） */
  disclosed: boolean;
  /** 傘下にしたか（過半数） */
  control: boolean;
  /** 買うのに払った額（減損の計算に使う） */
  paid: number;
  /** 統合メーター（0〜100） */
  integration: number;
}

export interface Raid {
  /** 大陸ホールディングスの持分 */
  stake: number;
  /** 公開買付けの月（30% に届いたら決まる） */
  tobAt: number | null;
  /** 選んだ防衛策 */
  defense: Defense | null;
}

export interface Mna {
  holdings: Record<string, Holding>;
  raid: Raid | null;
  /** 買収を仕掛けられたことがあるか（1 度きり） */
  raided: boolean;
}

/** 数字は仮。npm run sim:empire で測って決める */
export const MNA = {
  /** ライバルの会社の値打ち（ライバルの店 1 店あたり） */
  perStore: 80_000_000,
  /** 市場で 1 か月に買える持分、報告の線、市場で買える上限、公開買付けで目指す持分 */
  step: 0.05,
  disclose: 0.05,
  marketCap: 0.3,
  control: 0.51,
  /** 報告のあとの株価の上がり方 */
  disclosedPremium: 0.2,
  /** 公開買付けの上乗せ（2 つから選ぶ）と、大陸ホールディングスの対抗の上乗せ */
  premiums: [0.2, 0.4] as const,
  rivalBid: 0.3,
  /** 信任がこれを下回ると、株主が応じない */
  trust: 45,
  /** 傘下の配当：ライバルの売上に対する利益率 */
  dividend: 0.1,
  /** 統合：1 か月の費用と、上がり方。決算の月に足りなければ減損（買った額の割合） */
  pmiCost: 200_000_000,
  pmiStep: 10,
  impairmentBelow: 60,
  impairment: 0.1,
  /** 統合が済んだら配当が倍 */
  integratedBonus: 2,
} as const;

/** 買われる側 */
export const RAID = {
  /** フェーズ 5 に入って何か月で始まるか、月に買う持分、公開買付けまでの月数 */
  after: 6,
  step: 0.05,
  tobMonths: 3,
  /** 防衛策 */
  stableCost: 3_000_000_000,
  /** ポイズンピルは株主の信任がこれ以上なら通る。使うと信任が下がる */
  pillTrust: 50,
  pillTrustCost: 10,
  /** ホワイトナイト：友好的な会社に渡す持分 */
  knightShare: 0.2,
  /** MBO：時価に対する上乗せ */
  mboPremium: 0.3,
  /** 防げなかったとき：取られる席、配当に出させられる資金の割合 */
  seats: 2,
  payout: 0.2,
} as const;

export function newMna(): Mna {
  return { holdings: {}, raid: null, raided: false };
}

const newHolding = (): Holding => ({ stake: 0, disclosed: false, control: false, paid: 0, integration: 0 });

/** 会社が店を持つランドの国 */
function nationOf(e: EmpireState, land: string): Nation | null {
  if (land === e.land) return e.nation;
  return e.world?.branches.find((b) => b.land === land)?.nation ?? null;
}

const open = (n: Nation) => n.regions.filter((r) => !r.locked);
/** そのランドのライバルの店の数 */
export const rivalStores = (n: Nation) => open(n).reduce((a, r) => a + r.rival, 0);

/** ライバル会社の値打ち（時価） */
export function rivalValue(e: EmpireState, land: string): number {
  const n = nationOf(e, land);
  return n ? rivalStores(n) * MNA.perStore : 0;
}

/** 市場で 5% 買う値段（報告のあとは株価が上がる） */
export function stepPrice(e: EmpireState, land: string): number {
  const h = e.mna?.holdings[land];
  return Math.round(rivalValue(e, land) * MNA.step * (h?.disclosed ? 1 + MNA.disclosedPremium : 1));
}

/** 公開買付けで過半数まで買う値段 */
export function tobPrice(e: EmpireState, land: string, premium: number): number {
  const h = e.mna?.holdings[land];
  return Math.round(rivalValue(e, land) * Math.max(0, MNA.control - (h?.stake ?? 0)) * (1 + premium));
}

/** そのランドで自社とライバルを合わせたシェア（規制の審査に使う） */
export function combinedShare(e: EmpireState, land: string): number {
  const n = nationOf(e, land);
  if (!n) return 0;
  const rs = open(n);
  const own = rs.reduce((a, r) => a + regionStores(r), 0);
  const rival = rs.reduce((a, r) => a + r.rival, 0);
  const neutral = rs.reduce((a, r) => a + r.capacity * MARKET.neutral, 0);
  return (own + rival) / Math.max(1, own + rival + neutral);
}

export type TobCheck = { ok: boolean; reason: 'regulation' | 'trust' | 'funds' | 'outbid' | null };

/** 公開買付けが成るか（価格・資金の確実さ・規制・信頼）。funds は払ったあとに残る資金の見込み */
export function tobCheck(e: EmpireState, land: string, premium: number): TobCheck {
  if (combinedShare(e, land) >= REGULATION.breakup) return { ok: false, reason: 'regulation' };
  if ((e.stake?.support.shareholders ?? 60) < MNA.trust) return { ok: false, reason: 'trust' };
  if (e.funds < tobPrice(e, land, premium) * 1.2) return { ok: false, reason: 'funds' };
  if (premium < MNA.rivalBid) return { ok: false, reason: 'outbid' };
  return { ok: true, reason: null };
}

/** そのランドのライバルは傘下か（値下げ攻勢・出店・地主会が控えめになる） */
export const controlled = (e: Pick<EmpireState, 'mna'>, land: string) => !!e.mna?.holdings[land]?.control;

/** 傘下の会社からの 1 か月の配当 */
export function dividendOf(e: EmpireState, land: string): number {
  const h = e.mna?.holdings[land];
  const n = nationOf(e, land);
  if (!h?.control || !n) return 0;
  const revenue = open(n).reduce((a, r) => a + rivalDaily(r) * 30 * r.rival, 0);
  return revenue * MNA.dividend * h.stake * (h.integration >= 100 ? MNA.integratedBonus : 1);
}

/** 会社の時価（直近 12 か月の利益 × 20 年分。上場していなくても見積もる） */
export function marketCap(e: EmpireState): number {
  return Math.max(0, e.history.slice(-12).reduce((a, r) => a + r.profit, 0)) * 20;
}
/** MBO の費用：外の株主の持分を、時価に上乗せして買い戻す */
export const mboCost = (e: EmpireState) => Math.round(marketCap(e) * (1 - (e.nation?.ownership ?? 1)) * (1 + RAID.mboPremium));

export interface MnaDecision {
  /** 市場で 5% ずつ買うランド */
  buy?: string[];
  /** 公開買付け */
  tob?: { land: string; premium: number };
  /** 統合の費用を払うランド */
  pmi?: string[];
  /** 買収の防衛策 */
  defense?: Defense;
}

/** M&A の 1 か月（店の売上が出たあと）。配当は report に足す */
export function mnaStep(e: EmpireState, d: MnaDecision | undefined, notes: Note[]): number {
  if (e.phase < 4 || !e.nation) return 0;
  const m = (e.mna ??= newMna());
  const pay = (cost: number) => {
    if (e.funds < cost) {
      notes.push({ kind: 'shortOfFunds' });
      return false;
    }
    e.funds -= cost;
    return true;
  };
  // 買う
  for (const land of d?.buy ?? []) {
    if (!nationOf(e, land)) continue;
    const h = (m.holdings[land] ??= newHolding());
    if (h.control || h.stake >= MNA.marketCap - 1e-9) continue;
    const cost = stepPrice(e, land);
    if (!pay(cost)) continue;
    h.stake = Math.min(MNA.marketCap, Math.round((h.stake + MNA.step) * 100) / 100);
    h.paid += cost;
    if (!h.disclosed && h.stake >= MNA.disclose) {
      h.disclosed = true;
      notes.push({ kind: 'mnaDisclosed', land });
    }
  }
  if (d?.tob) {
    const { land, premium } = d.tob;
    const h = (m.holdings[land] ??= newHolding());
    if (!h.control && nationOf(e, land)) {
      const check = tobCheck(e, land, premium);
      if (!check.ok) notes.push({ kind: 'tobFailed', land, reason: check.reason! });
      else {
        const cost = tobPrice(e, land, premium);
        e.funds -= cost;
        h.paid += cost;
        h.stake = MNA.control;
        h.control = true;
        notes.push({ kind: 'tobDone', land });
      }
    }
  }
  // 統合
  for (const land of d?.pmi ?? []) {
    const h = m.holdings[land];
    if (!h?.control || h.integration >= 100) continue;
    if (pay(MNA.pmiCost)) {
      h.integration = Math.min(100, h.integration + MNA.pmiStep);
      if (h.integration >= 100) notes.push({ kind: 'integrated', land });
    }
  }
  // 減損：決算の月に統合が足りなければ
  if (e.month % 12 === FISCAL_MONTH) {
    for (const [land, h] of Object.entries(m.holdings)) {
      if (!h.control || h.integration >= MNA.impairmentBelow) continue;
      const loss = h.paid * MNA.impairment;
      e.funds -= loss;
      notes.push({ kind: 'impairment', land, loss });
    }
  }
  raidStep(e, d?.defense, notes);
  // 配当
  return Object.keys(m.holdings).reduce((a, land) => a + dividendOf(e, land), 0);
}

/** 買われる側：大陸ホールディングスの買い集めと公開買付け */
function raidStep(e: EmpireState, defense: Defense | undefined, notes: Note[]): void {
  const m = e.mna!;
  const n = e.nation!;
  const since = e.group ? e.month - e.group.since : -1;
  if (!m.raid && !m.raided && e.phase >= 5 && n.listed && since >= RAID.after) {
    m.raid = { stake: 0, tobAt: null, defense: null };
    m.raided = true;
  }
  const r = m.raid;
  if (!r) return;
  if (defense && !r.defense) {
    // 防衛策を決める（その場で効くものは、その場で払う）
    if (defense === 'stable' && e.funds >= RAID.stableCost) {
      e.funds -= RAID.stableCost;
      r.defense = 'stable';
    } else if (defense === 'pill') r.defense = 'pill';
    else if (defense === 'knight') {
      n.ownership = Math.max(0, n.ownership - RAID.knightShare);
      r.defense = 'knight';
    } else if (defense === 'mbo' && e.funds >= mboCost(e)) {
      e.funds -= mboCost(e);
      n.ownership = 1;
      n.listed = false;
      r.defense = 'mbo';
    }
    if (r.defense) notes.push({ kind: 'raidDefense', defense: r.defense });
  }
  // MBO で上場をやめたら、買い集めは終わる
  if (r.defense === 'mbo') {
    m.raid = null;
    notes.push({ kind: 'raidOver', won: true });
    return;
  }
  if (r.tobAt === null) {
    const before = r.stake;
    r.stake = Math.min(MNA.marketCap, Math.round((r.stake + RAID.step) * 100) / 100);
    if (before < MNA.disclose && r.stake >= MNA.disclose) notes.push({ kind: 'raidDisclosed' });
    if (r.stake >= MNA.marketCap) {
      r.tobAt = e.month + RAID.tobMonths;
      notes.push({ kind: 'raidTob', month: r.tobAt });
    }
    return;
  }
  if (e.month < r.tobAt) return;
  // 公開買付けの月：防衛策が効くか
  const pillOk = r.defense === 'pill' && (e.stake?.support.shareholders ?? 60) >= RAID.pillTrust;
  const won = r.defense === 'stable' || r.defense === 'knight' || pillOk;
  if (r.defense === 'pill' && e.stake) e.stake.support.shareholders = Math.max(0, e.stake.support.shareholders - RAID.pillTrustCost);
  if (!won) {
    // 役員会に 2 席・資金の 2 割を配当に・会議卓のいちばん高い事業を売る
    const g = e.gov;
    if (g) g.board = g.board.slice(0, Math.max(0, g.board.length - RAID.seats));
    const payout = Math.max(0, e.funds) * RAID.payout;
    e.funds -= payout;
    const t = e.group?.table;
    if (t) {
      const top = t.map((b, i) => ({ b, i })).filter((x) => x.b && x.i !== CORE_SLOT).sort((a, b) => BUSINESS[b.b!].cost - BUSINESS[a.b!].cost)[0];
      if (top) {
        e.funds += BUSINESS[top.b!].cost * 0.5;
        t[top.i] = null;
      }
    }
  }
  m.raid = null;
  notes.push({ kind: 'raidOver', won });
}

export function restoreMna(raw: unknown): Mna | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const m = raw as Partial<Mna>;
  const num = (v: unknown, f: number) => (typeof v === 'number' && Number.isFinite(v) ? v : f);
  const holdings: Record<string, Holding> = {};
  for (const [k, v] of Object.entries(m.holdings ?? {})) {
    if (!v || typeof v !== 'object') continue;
    holdings[k] = { stake: Math.min(1, Math.max(0, num(v.stake, 0))), disclosed: v.disclosed === true, control: v.control === true, paid: Math.max(0, num(v.paid, 0)), integration: Math.min(100, Math.max(0, num(v.integration, 0))) };
  }
  const r = m.raid;
  return {
    holdings,
    raid: r && typeof r === 'object' ? { stake: Math.min(1, Math.max(0, num(r.stake, 0))), tobAt: typeof r.tobAt === 'number' ? r.tobAt : null, defense: DEFENSES.includes(r.defense as Defense) ? (r.defense as Defense) : null } : null,
    raided: m.raided === true,
  };
}
