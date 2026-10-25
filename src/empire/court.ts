// 政府の注目とキングとの謁見（docs/EMPIRE_DESIGN.md 10.11）。DOM に触れない純関数。フェーズ 3 から。
//
// 小さく始めた会社が大きくなると、政府に名前が知られ、やがてキングから謁見に招かれる。
// - 注目度（0〜100）：毎月、持っている冠と「キングの好み」に合っているかで貯まる
// - 招待：注目度が 100 に届き、本拠ランドで売上 1 位なら、キングから謁見の招待が来る
// - 謁見：献上の品を 1 つ選ぶ。キングの好みに合えば謁見は成り、フェーズ 3 を卒業できる。
//   ランドごとの特権（外交と各種の許し）が開く。合わなければ注目度が下がり、また貯め直す
import type { EmpireState, Note } from './model';
import { landProfile, type FoundingLand } from './lands';
import { regionStores } from './nation';

export type Offering = 'pledge' | 'sweets' | 'talent' | 'wine' | 'gold';
export const OFFERINGS: Offering[] = ['pledge', 'sweets', 'talent', 'wine', 'gold'];

export type Privilege = 'harbor' | 'underground' | 'purveyor' | 'housing';

export interface Court {
  /** 注目度（0〜100） */
  attention: number;
  /** 知らせた段（0 なし・1 名前が知られた・2 大臣から声）。同じ知らせを繰り返さない */
  stage: number;
  /** 謁見の招待が来ているか（来ている月から、献上の品を選べる） */
  invited: boolean;
  /** 謁見が成ったか（フェーズ 3 の卒業） */
  audience: boolean;
  privileges: Privilege[];
}

/** 数字は仮。npm run sim:empire で測って決める */
export const ATTENTION = {
  /** 毎月の基本、冠 1 つあたり、キングの好みに合っているとき（0〜1 の度合いに掛ける） */
  base: 0.3,
  perCrown: 1,
  fit: 2.5,
  /** 知らせる段 */
  stages: [30, 60],
  /** 謁見がうまくいかなかったとき */
  failCost: 40,
} as const;

/** キングごとの好み：喜ぶ献上の品と、特権 */
export const KINGS: Record<FoundingLand, { likes: Offering; privilege: Privilege }> = {
  Ocean: { likes: 'pledge', privilege: 'harbor' },
  Strawberry: { likes: 'sweets', privilege: 'underground' },
  Tangerine: { likes: 'talent', privilege: 'purveyor' },
  Lime: { likes: 'wine', privilege: 'housing' },
};

/** 特権の効き目 */
export const PRIVILEGE = {
  /** 港の優先権（Ocean）：原価の下がり */
  harborCostCut: 0.01,
  /** 地下の開拓（Strawberry）：本拠エリアと同じ広さの地下街が 1 エリア増える */
  /** 御用商人（Tangerine）：虎王からの出資と、家賃の下がり */
  purveyorGrant: 2_000_000_000,
  purveyorRent: 0.9,
  /** 住宅開発の許し（Lime）：開いているエリアの入りきる目安が増える */
  housingCapacity: 1.1,
} as const;

export function newCourt(): Court {
  return { attention: 0, stage: 0, invited: false, audience: false, privileges: [] };
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const kingOf = (e: Pick<EmpireState, 'land'>) => KINGS[landProfile(e.land).key as FoundingLand] ?? KINGS.Ocean;

/**
 * キングの好みに合っているか（0〜1）。ランドごとに見るところが違う：
 * - 海王（Ocean）：かたよらない商い。どのステークホルダーの支持度も 50 以上
 * - 魔王（Strawberry）：甘い物と、文化への敬意。品ぞろえがスイーツ（よその特産品は嫌う）
 * - 虎王（Tangerine）：国を活気づける逸材。役員会に英雄が 2 人以上
 * - 龍王（Lime）：上質な品と、人が根づく町。品ぞろえが高級品か娯楽、従業員と商店街の支持度が 60 以上
 */
export function kingFit(e: EmpireState): number {
  const k = landProfile(e.land).key;
  const sup = e.stake?.support;
  const focus = e.focus ?? 'daily';
  if (k === 'Strawberry') return focus === 'sweets' ? 1 : focus === 'imports' ? 0 : 0.4;
  if (k === 'Tangerine') return Math.min(1, (e.gov?.board.length ?? 0) / 2) * 0.8 + (focus === 'luxury' ? 0.2 : 0);
  if (k === 'Lime') return (focus === 'luxury' || focus === 'leisure' ? 0.5 : 0) + ((sup?.staff ?? 60) >= 60 && (sup?.shotengai ?? 60) >= 60 ? 0.5 : 0);
  // Ocean と、創業できないランド（古いセーブ）
  const all = sup ? Object.entries(sup).filter(([w]) => w !== 'owners').map(([, v]) => v) : [60];
  const owners = e.nation?.satisfaction ?? 60;
  return Math.min(...all, owners) >= 50 ? 1 : 0.3;
}

/** キングの好みのひと言（何をすれば注目されるか） */
export function kingWants(e: Pick<EmpireState, 'land'>): { ja: string; en: string } {
  const k = landProfile(e.land).key;
  if (k === 'Strawberry') return { ja: '品ぞろえをスイーツ・果物に（よその特産品は嫌われる）', en: 'Sell sweets and fruit (goods from other lands are frowned on)' }; // i18n-ja
  if (k === 'Tangerine') return { ja: '役員会に英雄を 2 人以上迎える（国を活気づける逸材）', en: 'Seat two or more heroes on the board (talent that lifts the land)' }; // i18n-ja
  if (k === 'Lime') return { ja: '品ぞろえを高級品か娯楽に、従業員と商店街の支持度を 60 以上に', en: 'Sell fine goods or leisure; keep staff and high-street support at 60+' }; // i18n-ja
  return { ja: 'どのステークホルダーの支持度も 50 以上に保つ（かたよらない商い）', en: 'Keep every stakeholder at 50+ support (balanced business)' }; // i18n-ja
}

/** 招待の条件のもう 1 つ：本拠ランドで売上 1 位（直近 12 か月） */
function salesFirst(e: EmpireState): boolean {
  const last = e.history.slice(-12);
  if (last.length < 12 || last.some((r) => r.rivalRevenue === undefined)) return false;
  return last.reduce((a, r) => a + r.revenue, 0) > last.reduce((a, r) => a + (r.rivalRevenue ?? 0), 0);
}

/** 月末の注目度（stakeStep・crownStep のあと） */
export function courtStep(e: EmpireState, notes: Note[]): void {
  if (e.phase < 3 || !e.nation) return;
  const c = (e.court ??= newCourt());
  if (c.audience) return;
  const crowns = Object.values(e.crowns?.held ?? {}).filter(Boolean).length;
  c.attention = clamp(c.attention + ATTENTION.base + crowns * ATTENTION.perCrown + kingFit(e) * ATTENTION.fit, 0, 100);
  ATTENTION.stages.forEach((v, i) => {
    if (c.attention >= v && c.stage < i + 1) {
      c.stage = i + 1;
      notes.push({ kind: 'attention', stage: i + 1 });
    }
  });
  if (!c.invited && c.attention >= 100 && salesFirst(e)) {
    c.invited = true;
    notes.push({ kind: 'audienceInvite' });
  }
}

/** 謁見（月の決定を当てる前）。献上の品がキングの好みに合えば成る */
export function holdAudience(e: EmpireState, offering: Offering | undefined, notes: Note[]): void {
  const c = e.court;
  if (!c || !c.invited || c.audience || !offering) return;
  const king = kingOf(e);
  // 好みに合う品なら成る。合わない品でも、キングの好みに十分合った商いをしていれば成る
  const ok = offering === king.likes || (kingFit(e) >= 1 && offering !== 'gold');
  if (offering === 'gold') e.funds -= Math.max(0, e.funds * 0.05);
  if (ok) {
    c.audience = true;
    c.invited = false;
    c.privileges = [...new Set([...c.privileges, king.privilege])];
    grantPrivilege(e, king.privilege);
    notes.push({ kind: 'audience', offering, success: true, privilege: king.privilege });
  } else {
    c.invited = false;
    c.attention = Math.max(0, c.attention - ATTENTION.failCost);
    c.stage = Math.min(c.stage, 1);
    notes.push({ kind: 'audience', offering, success: false, privilege: king.privilege });
  }
}

/** 特権を当てる（一度きりのもの：地下の開拓・御用商人・住宅開発） */
function grantPrivilege(e: EmpireState, p: Privilege): void {
  const n = e.nation;
  if (!n) return;
  if (p === 'underground') {
    const home = n.regions[0];
    n.regions.push({ ...home, name: { ja: '地下街', en: 'Underground' }, direct: 0, fcOwner: 0, fcHq: 0, rival: 0, hub: false, rarity: home.rarity, locked: false }); // i18n-ja
  } else if (p === 'purveyor') {
    e.funds += PRIVILEGE.purveyorGrant;
  } else if (p === 'housing') {
    for (const r of n.regions) if (!r.locked) r.capacity = Math.round(r.capacity * PRIVILEGE.housingCapacity);
  }
}

/** 毎月効く特権（港の優先権・御用商人の家賃） */
export function privilegeMods(e: Pick<EmpireState, 'court'>): { costCut: number; rent: number } {
  const has = (p: Privilege) => !!e.court?.privileges.includes(p);
  return { costCut: has('harbor') ? PRIVILEGE.harborCostCut : 0, rent: has('purveyor') ? PRIVILEGE.purveyorRent : 1 };
}

/** 本拠ランドの自店の数（謁見の画面で見せる） */
export const homeStores = (e: EmpireState) => (e.nation ? e.nation.regions.reduce((a, r) => a + regionStores(r), 0) : 0);

/** いまの冠の数（画面用） */
export const crownCount = (e: EmpireState) => Object.values(e.crowns?.held ?? {}).filter(Boolean).length;

/** 注目度が 1 か月にどれだけ貯まるか（画面用） */
export function attentionPerMonth(e: EmpireState): number {
  return ATTENTION.base + crownCount(e) * ATTENTION.perCrown + kingFit(e) * ATTENTION.fit;
}

export function restoreCourt(raw: unknown): Court | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const c = raw as Partial<Court>;
  const num = (v: unknown, f: number) => (typeof v === 'number' && Number.isFinite(v) ? v : f);
  const ps: Privilege[] = ['harbor', 'underground', 'purveyor', 'housing'];
  return {
    attention: clamp(num(c.attention, 0), 0, 100),
    stage: Math.max(0, Math.min(2, Math.floor(num(c.stage, 0)))),
    invited: c.invited === true,
    audience: c.audience === true,
    privileges: (Array.isArray(c.privileges) ? c.privileges : []).filter((p): p is Privilege => ps.includes(p)),
  };
}
