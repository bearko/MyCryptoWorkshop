/**
 * 会社ぜんたいのこと：ブランド力・帳簿（月ごと → 四半期の P/L・B/S）・ほかのランドセクタ（セクタマネージャーの運営）。
 * セクタをまたいで共有する。地図やお店のシミュレーションには触らない（model.ts から呼ぶ）。
 * docs/ISLAND_PHASE1.md「ブランド力」「ランドマップとセクタ」「決算書」。
 */
import { t } from '../../i18n';
import { BRAND, MANAGER, P1B, RESET, SECTORS, type Stats, type Tier } from './data';

// ---------------------------------------------------------------- ブランド力

export interface BrandEv {
  day: number;
  d: number;
  why: string;
}

/** ブランド力を上げ下げする（0〜BRAND.max）。履歴は新しい順に BRAND.log 件 */
export function brandAdd(s: { brand?: number; brandLog?: BrandEv[]; day: number }, d: number, why: string) {
  if (!d) return;
  const before = s.brand ?? 0;
  s.brand = Math.max(0, Math.min(BRAND.max, before + d));
  const real = s.brand - before;
  if (!real) return;
  s.brandLog = [{ day: s.day, d: real, why }, ...(s.brandLog ?? [])].slice(0, BRAND.log);
}

/** ブランド力による売り場の強さの倍率 */
/** ブランド力の売り場の強さ。x2：ブランド戦略室（✨）の倍率の足し分（true＝Lv1 の +1、数ならそのまま。Lv3 で +1.5） */
export const brandPull = (brand = 0, x2: boolean | number = false) => {
  const m = 1 + (typeof x2 === 'number' ? x2 : x2 ? 1 : 0);
  return 1 + Math.min(BRAND.pullCap * m, brand * BRAND.pullPer * m);
};

// ---------------------------------------------------------------- 帳簿

/** 会社のひと月の出入り（すべてのセクタの合計） */
export interface Ledger {
  /** 売上高（いま経営しているセクタのお店の売上） */
  sales: number;
  /** 素材（売上原価） */
  mats: number;
  wages: number;
  part: number;
  upkeep: number;
  ads: number;
  /** 建物・スキル・設備・移転（投資） */
  build: number;
  /** 関所の通行料・出店許可申請（入国料） */
  fees: number;
  /** 他店でバイトの日給 */
  side: number;
  /** 依頼の報酬など */
  other: number;
  /** セクタマネージャーが運営するセクタから本社へ回ってきた利益（赤字ならマイナス） */
  managed: number;
  /** 遺物の展示館の入館料（発掘 v2 の 4 段目。以前の帳簿には無い） */
  museum?: number;
  /** 特別損失：復興の徴収（ランクアップの災害で、ランドが所持金を全額徴収。発掘 v2 の 7 段目。以前の帳簿には無い） */
  levy?: number;
  /** 特別利益：復興の支度金（ランドから） */
  grant?: number;
}
export type LedgerKey = keyof Ledger;
export const emptyLedger = (): Ledger => ({ sales: 0, mats: 0, wages: 0, part: 0, upkeep: 0, ads: 0, build: 0, fees: 0, side: 0, other: 0, managed: 0, museum: 0, levy: 0, grant: 0 });

/** 月末の貸借対照表の材料 */
export interface Balance {
  cash: number;
  /** 素材と商品（原価） */
  stock: number;
  /** 自社の建物（取得額） */
  buildings: number;
  /** マネージャーのセクタへ回した投資の合計 */
  invest: number;
}

export interface Books {
  cur: Ledger;
  months: { m: number; l: Ledger; bs: Balance }[];
}
export const newBooks = (): Books => ({ cur: emptyLedger(), months: [] });

export function book(s: { books?: Books }, key: LedgerKey, amt: number) {
  if (!amt) return;
  const cur = (s.books ??= newBooks()).cur;
  cur[key] = (cur[key] ?? 0) + amt;
}

/** 資本金（最初の資金） */
export const CAPITAL = 30000;

export interface PL {
  sales: number;
  cogs: number;
  gross: number;
  sga: number;
  op: number;
  nonop: number;
  special: number;
  net: number;
  l: Ledger;
}
export function pl(l: Ledger): PL {
  const gross = l.sales - l.mats;
  const sga = l.wages + l.part + l.upkeep + l.ads;
  const op = gross - sga;
  const nonop = l.side + l.other + l.managed + (l.museum ?? 0);
  // 特別な出入り：投資・入国料・復興の徴収（損失）から、復興の支度金（利益）を引く
  const special = l.build + l.fees + (l.levy ?? 0) - (l.grant ?? 0);
  return { sales: l.sales, cogs: l.mats, gross, sga, op, nonop, special, net: op + nonop - special, l };
}
export function sumLedger(ls: Ledger[]): Ledger {
  const out = emptyLedger();
  for (const l of ls) for (const k of Object.keys(out) as LedgerKey[]) out[k] = (out[k] ?? 0) + (l[k] ?? 0);
  return out;
}

/** 四半期（3 か月ずつ）。最後の四半期は途中でもよい */
export function quarters(b: Books): { q: number; months: number; l: Ledger; bs: Balance | null; done: boolean }[] {
  const out: { q: number; months: number; l: Ledger; bs: Balance | null; done: boolean }[] = [];
  for (let k = 0; k < b.months.length; k += 3) {
    const part = b.months.slice(k, k + 3);
    out.push({ q: k / 3 + 1, months: part.length, l: sumLedger(part.map((x) => x.l)), bs: part[part.length - 1].bs, done: part.length === 3 });
  }
  return out;
}

// ---------------------------------------------------------------- ランドとセクタ

/** ほかのセクタ（いま経営していないセクタ）の記録 */
export interface SectorRec {
  id: string;
  /** そのセクタの地図・お店などの写し（いま経営していないときだけ） */
  snap?: Record<string, unknown>;
  /** 離れるときに担当していた仕事（戻ったら、空いていれば元に戻す） */
  jobs?: { hero: number; task: string; target: number | string | null }[];
  /** セクタマネージャー（ヒーロー） */
  manager?: number | null;
  /** 利益のうちそのセクタへ回す割合 */
  invest: number;
  /** 離れたときの月の売上と費用（素材の割合・決まった費用） */
  base?: { rev: number; matRate: number; fixed: number };
  /** 回した投資の合計 */
  capital: number;
  /** マネージャーの月ごとの結果（新しいものが後ろ） */
  log: { m: number; rev: number; profit: number; invest: number; toHQ: number }[];
  /**
   * 被災した町の復興（発掘 v2 の 7 段目。ランクアップの災害のあと）：復興支援金の残り・被災した建物の数・任せてからの月数・使った支援金・
   * 全部直った月（任せた月から数える）・支援金が尽きた。担当は manager（マネージャーの仕組みのまま）
   */
  revive?: { fund: number; all: number; months: number; spent: number; doneAt?: number; out?: boolean; last?: number };
}

export interface Land {
  /** いま経営しているセクタ */
  cur: string;
  /** 出店したセクタ（入ったことがある） */
  mine: string[];
  recs: Record<string, SectorRec>;
  /** 新しいセクタの町を作るときの元の種（最初のセクタの seed。どこから進出しても同じ町になる） */
  seed?: number;
}

export const newLand = (cur = SECTORS[0].id): Land => ({ cur, mine: [cur], recs: {} });
export const sectorDef = (id: string) => SECTORS.find((x) => x.id === id) ?? SECTORS[0];
/** いまのセクタの個性（data.ts の SectorProfile：他社・売れ筋・特産・地形） */
export const sectorProfile = (s: { sector?: string }) => sectorDef(s.sector ?? 'c1').profile;

/** セクタの状態（ランドマップ）：雲・まだ・開放済み・出店済み・いまここ */
export type SectorState = 'cloud' | 'locked' | 'open' | 'mine' | 'here' | 'soon';
export function sectorState(land: Land, id: string): SectorState {
  const d = sectorDef(id);
  if (land.cur === id) return 'here';
  if (land.mine.includes(id)) return 'mine';
  if (d.cloud) return 'cloud';
  if (d.need && land.mine.filter((x) => sectorDef(x).tier === d.need!.tier).length < d.need.n) return 'locked';
  if (d.soon) return 'soon';
  return 'open';
}

/** セクタマネージャーの適性：能力値の合計（PHY・INT・AGI の平均。0〜100） */
export const managerApt = (st: Stats) => (st.phy + st.int + st.agi) / 3;
/** 適性 → 離れたときの売上に対する倍率の目安 */
export const managerRate = (apt: number) => Math.max(MANAGER.min, Math.min(MANAGER.max, MANAGER.at0 + apt * MANAGER.per));

/**
 * セクタマネージャーのひと月：売上は離れたときの売上 × 適性の倍率 × ゆらぎ。費用は素材（売上に比例）と決まった費用。
 * 利益が出たら、invest の割合をそのセクタへ投資（以後の売上が伸びる）、残りを本社へ。赤字はそのまま本社が負う。
 */
export function runSector(rec: SectorRec, st: Stats | null, m: number, rnd: () => number, bonus: { rate?: number; profit?: number; scale?: number } = {}): { rev: number; profit: number; invest: number; toHQ: number } {
  const base = rec.base;
  if (!base) return { rev: 0, profit: 0, invest: 0, toHQ: 0 };
  // 被災した町（発掘 v2 の 7 段目）：直ったお店の割合ぶんだけ（売上も決まった費用も）。全部直ったら 1
  const scale = Math.max(0, Math.min(1, bonus.scale ?? 1));
  // スキル：マネージャー研修（倍率 +0.1）
  const rate = (st ? managerRate(managerApt(st)) : MANAGER.none) + (bonus.rate ?? 0);
  const grow = 1 + (rec.capital * MANAGER.roi) / Math.max(1, base.rev);
  const rev = Math.round(base.rev * scale * rate * grow * (1 + (rnd() * 2 - 1) * MANAGER.noise));
  const raw = rev - rev * base.matRate - base.fixed * scale;
  // スキル：持株会社（利益 +10%。赤字には掛けない）
  const profit = Math.round(raw > 0 ? raw * (bonus.profit ?? 1) : raw);
  const invest = profit > 0 ? Math.round(profit * rec.invest) : 0;
  const toHQ = profit - invest;
  rec.capital += invest;
  rec.log = [...rec.log, { m, rev, profit, invest, toHQ }].slice(-24);
  return { rev, profit, invest, toHQ };
}

export const TIER_NAME: Record<Tier, string> = { C: 'Common', U: 'Uncommon', R: 'Rare', E: 'Epic', L: 'Legendary' };
export const tierLabel = (tier: Tier) => t(`${TIER_NAME[tier]}ランドセクタ`, `${TIER_NAME[tier]} land sector`);

// ---------------------------------------------------------------- 被災した町の復興（発掘 v2 の 7 段目。docs/ISLAND_PHASE1.md「ランクアップの災害と復興」）

/** 廃墟（ランクアップの災害で壊れた自社の建物）の持ち主。その場所に残り、働かない・売らない。修繕すると 'me' に戻る */
export const RUIN = 'ruin';
/** 建物の形（写しの中の建物も同じ形） */
export interface RuinLike {
  uid: number;
  id: string;
  owner: string;
  left: number;
  inv?: Partial<Record<string, number>>;
}
/** 手で直す値段（元の建物の値段の 40%・最低 1,000 G） */
export const repairCostOf = (id: string) => Math.max(RESET.repair.min, Math.round((P1B[id]?.cost ?? 0) * RESET.repair.rate));
/** 手で直す日数（元の工期の 4 割・最低 1 日） */
export const repairDaysOf = (id: string) => Math.max(1, Math.ceil((P1B[id]?.days ?? 2) * RESET.repair.days));
/** ヒーローに任せたときの 1 軒の値段（修繕の値段 × 1.5。割高） */
export const delegateCostOf = (id: string) => Math.round(repairCostOf(id) * RESET.delegate.costMul);
/** 担当が 1 か月に直せる数（能力値の平均で 1〜3 軒） */
export function revivePerMonth(st: Stats): number {
  const a = managerApt(st);
  const D = RESET.delegate;
  return a < D.lo ? D.perMonth[0] : a < D.hi ? D.perMonth[1] : D.perMonth[2];
}
/** 写しの建物の、廃墟の数と直った（自社の）数 */
export function ruinCount(bs: RuinLike[] | undefined): { ruins: number; fixed: number } {
  let ruins = 0;
  let fixed = 0;
  for (const b of bs ?? []) {
    if (b.owner === RUIN) ruins++;
    else if (b.owner === 'me' && P1B[b.id]) fixed++;
  }
  return { ruins, fixed };
}
/** 被災した町のマネージャーの売上の割合：直った建物 /（直った建物 ＋ 廃墟）。被災していなければ 1 */
export function reviveScale(rec: Pick<SectorRec, 'revive' | 'snap'>): number {
  if (!rec.revive) return 1;
  const { ruins, fixed } = ruinCount(rec.snap?.buildings as RuinLike[] | undefined);
  return ruins + fixed > 0 ? fixed / (ruins + fixed) : 0;
}
/** 修繕の順：工房 → 安い順（同じなら建てた順） */
export const repairOrder = <T extends RuinLike>(xs: T[]): T[] => [...xs].sort((a, b) => (a.id === 'workshop' ? -1 : 0) - (b.id === 'workshop' ? -1 : 0) || repairCostOf(a.id) - repairCostOf(b.id) || a.uid - b.uid);

/**
 * 復興の担当のひと月の伸び：能力値（PHY・INT・AGI）の低い順に RESET.grow.stats 個を +lo〜hi（上限 100）。上がった能力と数
 */
export function growHero(st: { stats: Stats }, rnd: () => number): Partial<Record<'phy' | 'int' | 'agi', number>> {
  const G = RESET.grow;
  const keys = (['phy', 'int', 'agi'] as const).filter((k) => st.stats[k] < 100).sort((a, b) => st.stats[a] - st.stats[b]).slice(0, G.stats);
  const out: Partial<Record<'phy' | 'int' | 'agi', number>> = {};
  const next = { ...st.stats };
  for (const k of keys) {
    const d = Math.min(100 - next[k], G.lo + Math.floor(rnd() * (G.hi - G.lo + 1)));
    if (d <= 0) continue;
    next[k] += d;
    out[k] = d;
  }
  st.stats = next;
  return out;
}

/** 復興のひと月の結果（会社の月の締め） */
export interface ReviveMonth {
  /** この月に直した数・残りの廃墟・被災した数・使った支援金・残り・尽きた・全部直って本社へ戻した支援金・担当の伸び */
  fixed: number;
  left: number;
  all: number;
  spent: number;
  fund: number;
  out: boolean;
  refund: number;
  grow: Partial<Record<'phy' | 'int' | 'agi', number>>;
}
/**
 * 任せた町のひと月（会社の月の締め）：担当（マネージャー）がいて支援金があれば、廃墟を安い順に 1〜3 軒（能力値で）直す。
 * 1 軒は修繕の値段 × 1.5（割高）。支援金が尽きたら止まる（out）。全部直ったら残りの支援金は本社へ（refund）。
 * 担当は、支援金があった月に能力値が大きく伸びる（growHero）。お題と出土品の発掘はしない（写しの発掘場には触らない）
 */
export function reviveMonth(rec: SectorRec, st: { stats: Stats } | null, rnd: () => number): ReviveMonth | null {
  const rv = rec.revive;
  const bs = rec.snap?.buildings as RuinLike[] | undefined;
  if (!rv || !bs) return null;
  const ruins = repairOrder(bs.filter((b) => b.owner === RUIN));
  const out: ReviveMonth = { fixed: 0, left: ruins.length, all: rv.all, spent: 0, fund: rv.fund, out: false, refund: 0, grow: {} };
  if (!ruins.length) return null;
  if (st && rv.fund > 0) {
    rv.months++;
    const per = revivePerMonth(st.stats);
    for (const b of ruins) {
      if (out.fixed >= per) break;
      const c = delegateCostOf(b.id);
      if (rv.fund < c) break;
      rv.fund -= c;
      rv.spent += c;
      out.spent += c;
      b.owner = 'me';
      b.left = 0;
      delete b.inv;
      out.fixed++;
    }
    out.left = ruins.length - out.fixed;
    out.grow = growHero(st, rnd);
    // 残りの廃墟があるのに、いちばん安い 1 軒も直せない：支援金が尽きた
    const rest = ruins.filter((b) => b.owner === RUIN);
    rv.out = rest.length > 0 && rest.every((b) => rv.fund < delegateCostOf(b.id));
  }
  rv.last = out.fixed;
  out.out = !!rv.out;
  if (out.left === 0) {
    if (rv.doneAt == null) rv.doneAt = rv.months;
    out.refund = rv.fund;
    rv.fund = 0;
    rv.out = false;
    out.out = false;
  }
  out.fund = rv.fund;
  return out;
}
