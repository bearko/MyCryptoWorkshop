// 業態カードと会議卓（フェーズ 5、docs/EMPIRE_DESIGN.md 4.5・10.13）。DOM に触れない純関数。
//
// 会議卓は 3×3 のマス。真ん中は本業の「よろず屋」で動かせない。まわりの 8 マスに業態カードを置く。
// カードは置いた月に費用を払い、毎月その事業の利益が入り、会社全体に効き目がある。
// 縦か横に隣り合ったカードが相性のよい組み合わせなら「シナジーの線」がつながり、両方の利益と影響力が上がる。
import type { EmpireState } from './model';

export type Business = 'store' | 'tavern' | 'freight' | 'bank' | 'estate' | 'media' | 'power' | 'factory' | 'inn' | 'trade';
/** 置ける業態（本業のよろず屋を除く） */
export const BUSINESSES: Exclude<Business, 'store'>[] = ['tavern', 'freight', 'bank', 'estate', 'media', 'power', 'factory', 'inn', 'trade'];

/** 会社全体への効き目（フェーズ 5） */
export interface GroupMods {
  /** 客足（足し算。0.02 で +2%） */
  demand: number;
  /** 原価率の下がり */
  costCut: number;
  /** 家賃の倍率 */
  rent: number;
  /** 物流拠点の維持費の倍率 */
  hubUpkeep: number;
  /** ブランド力（Legendary の番付）の上乗せ（0.1 で +10%） */
  brand: number;
  /** 影響力（Legendary の番付）の上乗せ */
  influence: number;
  /** 地主会の落札額の倍率 */
  plotPrice: number;
  /** 航路の費用の倍率 */
  route: number;
  /** 渡ったランドの現地化の、月ごとの上乗せ */
  localize: number;
  /** まだ謁見していないキングの注目度の、月ごとの上乗せ */
  attention: number;
}

export const NEUTRAL_MODS: GroupMods = { demand: 0, costCut: 0, rent: 1, hubUpkeep: 1, brand: 0, influence: 0, plotPrice: 1, route: 1, localize: 0, attention: 0 };

export interface BusinessDef {
  name: { ja: string; en: string };
  /** カードの印（1 文字） */
  mark: { ja: string; en: string };
  /** 置く費用と、毎月の利益（シナジーの前） */
  cost: number;
  profit: number;
  effect: Partial<GroupMods>;
  /** 効き目のひと言 */
  note: { ja: string; en: string };
}

const L = (ja: string, en: string) => ({ ja, en });

/** 数字は仮。npm run sim:empire で測って決める */
export const BUSINESS: Record<Business, BusinessDef> = {
  store: { name: L('よろず屋（本業）', 'General store (core)'), mark: L('万', 'G'), cost: 0, profit: 0, effect: {}, note: L('会社の本業。会議卓の真ん中から動かせない', 'Your core business. It stays in the middle of the table') }, // i18n-ja
  tavern: { name: L('飲食（酒場）', 'Dining (tavern)'), mark: L('酒', 'D'), cost: 3_000_000_000, profit: 60_000_000, effect: { demand: 0.02, brand: 0.05 }, note: L('客足 +2%・ブランド力 +5%', 'Customers +2% · brand +5%') }, // i18n-ja
  freight: { name: L('物流（運送）', 'Logistics (freight)'), mark: L('運', 'L'), cost: 4_000_000_000, profit: 50_000_000, effect: { hubUpkeep: 0.5, influence: 6 }, note: L('物流拠点の維持費が半分・影響力 +6', 'Hub upkeep halved · influence +6') }, // i18n-ja
  bank: { name: L('金融（銀行・ポイント）', 'Finance (bank and points)'), mark: L('銀', 'F'), cost: 6_000_000_000, profit: 120_000_000, effect: { brand: 0.05, influence: 3 }, note: L('ポイントで常連が増える：ブランド力 +5%・影響力 +3', 'Points keep regulars: brand +5% · influence +3') }, // i18n-ja
  estate: { name: L('不動産', 'Real estate'), mark: L('地', 'R'), cost: 5_000_000_000, profit: 80_000_000, effect: { rent: 0.92, plotPrice: 0.9 }, note: L('家賃 −8%・地主会の落札額 −10%', 'Rent −8% · auction prices −10%') }, // i18n-ja
  media: { name: L('メディア（瓦版）', 'Media (broadsheet)'), mark: L('瓦', 'M'), cost: 3_000_000_000, profit: 40_000_000, effect: { brand: 0.1, attention: 1 }, note: L('ブランド力 +10%・キングの注目 +1／月', 'Brand +10% · royal attention +1/month') }, // i18n-ja
  power: { name: L('エネルギー（電力）', 'Energy (power)'), mark: L('電', 'E'), cost: 5_000_000_000, profit: 70_000_000, effect: { costCut: 0.005, influence: 6 }, note: L('原価 −0.5%・影響力 +6', 'Cost of goods −0.5% · influence +6') }, // i18n-ja
  factory: { name: L('製造（工房）', 'Manufacturing (workshop)'), mark: L('工', 'W'), cost: 4_000_000_000, profit: 60_000_000, effect: { costCut: 0.005, demand: 0.01 }, note: L('原価 −0.5%・客足 +1%', 'Cost of goods −0.5% · customers +1%') }, // i18n-ja
  inn: { name: L('宿', 'Inns'), mark: L('宿', 'I'), cost: 3_000_000_000, profit: 50_000_000, effect: { demand: 0.02, localize: 0.005 }, note: L('客足 +2%・現地化 +0.5%／月', 'Customers +2% · localization +0.5%/month') }, // i18n-ja
  trade: { name: L('交易（商社）', 'Trading house'), mark: L('商', 'T'), cost: 4_000_000_000, profit: 60_000_000, effect: { route: 0.5, localize: 0.005, influence: 3 }, note: L('航路の費用が半分・現地化 +0.5%／月・影響力 +3', 'Routes half price · localization +0.5%/month · influence +3') }, // i18n-ja
};

/** 相性のよい組み合わせ（縦か横に隣り合うと線がつながる） */
export const SYNERGY: [Business, Business][] = [
  ['store', 'freight'],
  ['store', 'tavern'],
  ['store', 'factory'],
  ['store', 'bank'],
  ['freight', 'trade'],
  ['trade', 'factory'],
  ['bank', 'estate'],
  ['bank', 'media'],
  ['estate', 'inn'],
  ['inn', 'tavern'],
  ['media', 'tavern'],
  ['power', 'factory'],
  ['power', 'estate'],
];

/** シナジー 1 本の効き目：両方の利益 +25%、影響力 +2 */
export const SYNERGY_BONUS = { profit: 0.25, influence: 2 } as const;
/** カードを外すときに戻る割合 */
export const SELL_BACK = 0.5;
/** 会議卓のマス（3×3）と、本業の置き場所 */
export const TABLE_SIZE = 9;
export const CORE_SLOT = 4;

export type Table = (Business | null)[];

export function newTable(): Table {
  const t: Table = Array(TABLE_SIZE).fill(null);
  t[CORE_SLOT] = 'store';
  return t;
}

const pairKey = (a: Business, b: Business) => [a, b].sort().join('+');
const SYNERGY_SET = new Set(SYNERGY.map(([a, b]) => pairKey(a, b)));
export const synergizes = (a: Business | null, b: Business | null) => !!a && !!b && SYNERGY_SET.has(pairKey(a, b));

/** 縦か横に隣り合うマスの組（左右・上下） */
export const NEIGHBORS: [number, number][] = [
  [0, 1],
  [1, 2],
  [3, 4],
  [4, 5],
  [6, 7],
  [7, 8],
  [0, 3],
  [3, 6],
  [1, 4],
  [4, 7],
  [2, 5],
  [5, 8],
];

/** つながっているシナジーの線（マスの組） */
export function synergyLinks(t: Table): [number, number][] {
  return NEIGHBORS.filter(([a, b]) => synergizes(t[a], t[b]));
}

/** そのマスのカードに、何本の線がつながっているか */
export const linksAt = (t: Table, slot: number) => synergyLinks(t).filter(([a, b]) => a === slot || b === slot).length;

/** 会議卓の 1 か月の利益（シナジー込み） */
export function tableProfit(t: Table): number {
  return t.reduce((a, b, i) => a + (b ? BUSINESS[b].profit * (1 + SYNERGY_BONUS.profit * linksAt(t, i)) : 0), 0);
}

/** 会社全体への効き目（会議卓のカードとシナジーの線） */
export function tableMods(t: Table | undefined): GroupMods {
  const m = { ...NEUTRAL_MODS };
  if (!t) return m;
  for (const b of t) {
    if (!b) continue;
    const x = BUSINESS[b].effect;
    m.demand += x.demand ?? 0;
    m.costCut += x.costCut ?? 0;
    m.rent *= x.rent ?? 1;
    m.hubUpkeep *= x.hubUpkeep ?? 1;
    m.brand += x.brand ?? 0;
    m.influence += x.influence ?? 0;
    m.plotPrice *= x.plotPrice ?? 1;
    m.route *= x.route ?? 1;
    m.localize += x.localize ?? 0;
    m.attention += x.attention ?? 0;
  }
  m.influence += synergyLinks(t).length * SYNERGY_BONUS.influence;
  return m;
}

/** フェーズ 5 の会社の効き目（会議卓が無ければ何も効かない） */
export const groupMods = (e: Pick<EmpireState, 'group'>): GroupMods => tableMods(e.group?.table);

/** 会議卓を並べ替えたときの費用：新しく置いたカードは費用、外したカードは半分戻る。動かすだけなら無料 */
export function tableChangeCost(from: Table, to: Table): { cost: number; refund: number; added: Business[]; removed: Business[] } {
  const has = (t: Table) => new Set(t.filter((b): b is Business => !!b));
  const a = has(from);
  const b = has(to);
  const added = [...b].filter((x) => !a.has(x));
  const removed = [...a].filter((x) => !b.has(x));
  return { cost: added.reduce((s, x) => s + BUSINESS[x].cost, 0), refund: removed.reduce((s, x) => s + BUSINESS[x].cost * SELL_BACK, 0), added, removed };
}

/** 会議卓として正しい形か（9 マス、真ん中は本業、同じカードは 1 枚まで） */
export function validTable(t: unknown): t is Table {
  if (!Array.isArray(t) || t.length !== TABLE_SIZE || t[CORE_SLOT] !== 'store') return false;
  const cards = t.filter((x) => x !== null);
  if (cards.some((x) => !BUSINESSES.includes(x) && x !== 'store')) return false;
  return new Set(cards).size === cards.length;
}
