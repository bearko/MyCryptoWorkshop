/**
 * 会社ぜんたいのこと：ブランド力・帳簿（月ごと → 四半期の P/L・B/S）・ほかのランドセクタ（セクタマネージャーの運営）。
 * セクタをまたいで共有する。地図やお店のシミュレーションには触らない（model.ts から呼ぶ）。
 * docs/ISLAND_PHASE1.md「ブランド力」「ランドマップとセクタ」「決算書」。
 */
import { t } from '../../i18n';
import { BRAND, MANAGER, SECTORS, type Stats, type Tier } from './data';

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
export const brandPull = (brand = 0) => 1 + Math.min(BRAND.pullCap, brand * BRAND.pullPer);

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
}
export type LedgerKey = keyof Ledger;
export const emptyLedger = (): Ledger => ({ sales: 0, mats: 0, wages: 0, part: 0, upkeep: 0, ads: 0, build: 0, fees: 0, side: 0, other: 0, managed: 0 });

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
  (s.books ??= newBooks()).cur[key] += amt;
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
  const nonop = l.side + l.other + l.managed;
  const special = l.build + l.fees;
  return { sales: l.sales, cogs: l.mats, gross, sga, op, nonop, special, net: op + nonop - special, l };
}
export function sumLedger(ls: Ledger[]): Ledger {
  const out = emptyLedger();
  for (const l of ls) for (const k of Object.keys(out) as LedgerKey[]) out[k] += l[k] ?? 0;
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
}

export interface Land {
  /** いま経営しているセクタ */
  cur: string;
  /** 出店したセクタ（入ったことがある） */
  mine: string[];
  recs: Record<string, SectorRec>;
}

export const newLand = (cur = SECTORS[0].id): Land => ({ cur, mine: [cur], recs: {} });
export const sectorDef = (id: string) => SECTORS.find((x) => x.id === id) ?? SECTORS[0];

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
export function runSector(rec: SectorRec, st: Stats | null, m: number, rnd: () => number): { rev: number; profit: number; invest: number; toHQ: number } {
  const base = rec.base;
  if (!base) return { rev: 0, profit: 0, invest: 0, toHQ: 0 };
  const rate = st ? managerRate(managerApt(st)) : MANAGER.none;
  const grow = 1 + (rec.capital * MANAGER.roi) / Math.max(1, base.rev);
  const rev = Math.round(base.rev * rate * grow * (1 + (rnd() * 2 - 1) * MANAGER.noise));
  const profit = Math.round(rev - rev * base.matRate - base.fixed);
  const invest = profit > 0 ? Math.round(profit * rec.invest) : 0;
  const toHQ = profit - invest;
  rec.capital += invest;
  rec.log = [...rec.log, { m, rev, profit, invest, toHQ }].slice(-24);
  return { rev, profit, invest, toHQ };
}

export const TIER_NAME: Record<Tier, string> = { C: 'Common', U: 'Uncommon', R: 'Rare', E: 'Epic', L: 'Legendary' };
export const tierLabel = (tier: Tier) => t(`${TIER_NAME[tier]}ランドセクタ`, `${TIER_NAME[tier]} land sector`);
