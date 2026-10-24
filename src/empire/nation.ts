// フェーズ 3 の全国チェーン（docs/EMPIRE_DESIGN.md 4.3・10.1）。本拠ランドの 11 エリア（ランドセクタ）を、
// 1 店ずつではなくエリアごとの店の数で動かす。エリアの広さ（入りきる目安）はレアリティで決まる。純関数だけ。
// 新しいエリアには物流拠点を先に建て、研修所で育てた店長・オーナーの数だけ一度に出店できる。
import type { Rng } from './rng';

/** 店の形：直営・オーナーの土地の加盟店・本部が用意した土地の加盟店 */
export type StoreType = 'direct' | 'fcOwner' | 'fcHq';
export const STORE_TYPES: StoreType[] = ['direct', 'fcOwner', 'fcHq'];

export interface Region {
  name: { ja: string; en: string };
  /** 店が入りきる目安（これを超えると食い合いが強くなる） */
  capacity: number;
  /** 1 店あたりの基礎日販（GUM/日） */
  traffic: number;
  /** 1 店あたりの月の家賃 */
  rent: number;
  /** 物流拠点（と工場）があるか。無いエリアには出店できない（本拠エリアを除く） */
  hub: boolean;
  direct: number;
  fcOwner: number;
  fcHq: number;
  /** ライバルの店の数 */
  rival: number;
  /** レアリティ（0 Common 〜 4 Legendary）。広さと人通りが決まる */
  rarity: number;
  /** まだ入れないエリア（Legendary はフェーズ 5 で開く）。売上もライバルの増加もない */
  locked: boolean;
}

export interface Nation {
  regions: Region[];
  /** 研修所の数（店長・オーナーを育てる。出店の速さを決める） */
  trainingCenters: number;
  /** マニュアル（品質が崩れてから整えられる） */
  manual: boolean;
  /** 店の品質（0.5〜1）。急いで出店すると下がり、需要に効く */
  quality: number;
  /** 加盟店オーナーの満足度（0〜100）。下がり続けると告発と当局の調査へ */
  satisfaction: number;
  /** 加盟店に 24 時間営業を求めているか（売上は伸びるが満足度が下がる） */
  force24: boolean;
  /** オーナー支援の手厚さ（0〜3） */
  support: number;
  /** 当局の調査が入る月（予告済み） */
  investigation: number | null;
  /** 時代のルール：出店規制が厳しいか、次に変わる月 */
  eraStrict: boolean;
  eraChange: number;
  /** 地価の指数（1 が全国チェーンを始めたとき）と、その始まりの月 */
  landIndex: number;
  landStart: number;
  /** 借入（直営店の土地が担保） */
  loans: number;
  /** 上場したか、創業者（プレイヤー）の持分 */
  listed: boolean;
  ownership: number;
  /** PB（自社ブランド）の段階（0〜5）。本店の工房の品が店に並ぶ */
  pb: number;
}

/** 11 エリアの名前とレアリティ（本拠エリアはフェーズ 2 の地図。docs/EMPIRE_DESIGN.md 10.1） */
export const REGION_NAMES = [
  { ja: '駅前の町（本拠）', en: 'Station town (home)', rarity: 0 }, // i18n-ja
  { ja: '港町', en: 'Harbor town', rarity: 0 }, // i18n-ja
  { ja: '南町', en: 'South town', rarity: 0 }, // i18n-ja
  { ja: '坂の上', en: 'Hilltop', rarity: 0 }, // i18n-ja
  { ja: '北の港', en: 'North port', rarity: 1 }, // i18n-ja
  { ja: '川向こう', en: 'Across the river', rarity: 1 }, // i18n-ja
  { ja: '新市街', en: 'New town', rarity: 1 }, // i18n-ja
  { ja: '旧市街', en: 'Old town', rarity: 2 }, // i18n-ja
  { ja: '湾岸', en: 'Bayside', rarity: 2 }, // i18n-ja
  { ja: '中央区', en: 'Central ward', rarity: 3 }, // i18n-ja
  { ja: '大市場', en: 'Grand market', rarity: 4 }, // i18n-ja
];

/** レアリティごとのエリアの広さ（入りきる目安）・人通り・最初のライバルの店の数 */
export const RARITY_AREA = [
  { capacity: 20, traffic: [200_000, 280_000], rival: [2, 3] },
  { capacity: 30, traffic: [240_000, 320_000], rival: [3, 5] },
  { capacity: 45, traffic: [280_000, 360_000], rival: [5, 7] },
  { capacity: 65, traffic: [320_000, 400_000], rival: [8, 10] },
  { capacity: 100, traffic: [380_000, 460_000], rival: [14, 18] },
] as const;
/** このレアリティから先はフェーズ 5 まで開かない */
export const LOCKED_RARITY = 4;

export const HUB_COST = 150_000_000;
export const HUB_UPKEEP = 3_000_000;
export const TRAINING_COST = 60_000_000;
export const TRAINING_UPKEEP = 2_000_000;
/** 研修所が無くても月に育てられる人数と、研修所 1 つで増える人数 */
export const TRAINEES = { base: 2, perCenter: 4 } as const;
export const MANUAL_COST = 40_000_000;
/** マニュアルを整えられる品質の線（崩れてからでないと、何を書けばよいか分からない） */
export const MANUAL_UNLOCK = 0.9;
/** 店の形ごとの出店費用（本部の負担） */
export const OPEN_COSTS: Record<StoreType, number> = { direct: 12_000_000, fcOwner: 2_000_000, fcHq: 9_000_000 };
/** 加盟店の本部の取り分（粗利のうち）。オーナーが土地を持てば低く、本部が用意すれば高い */
export const ROYALTY = { fcOwner: 0.35, fcHq: 0.55 } as const;
/** 直営の店長とシフトの人件費（月） */
export const DIRECT_LABOR = 500_000;
/** 物流拠点の有無による配送費（1 店・月）と原価率 */
export const HUB_LOGISTICS = { withHub: { delivery: 40_000, costRate: 0.66 }, without: { delivery: 300_000, costRate: 0.72 } } as const;
/** 品質：出店 1 店ごとの下がり方（マニュアルがあると 3 割）、月ごとの戻り */
export const QUALITY = { perOpen: 0.006, manualFactor: 0.3, recover: 0.02, min: 0.5 } as const;
/** ライバル：何か月ごとに各エリアで 1 店増えるか、エリアの入りきる目安の何割まで */
export const RIVAL_NATION = { interval: 3, share: 0.55 } as const;

// ---- 足かせ（docs/EMPIRE_DESIGN.md 4.3）。どれも予兆を報告に出してから起きる
/** 満足度：毎月の戻り、24 時間の強制、混みすぎたエリア 1 つごと、支援 1 段ごと */
export const SATISFACTION = { start: 70, base: 1, force24: -3, crowded: -2, support: 1.5, warn: 50, complaint: 30, afterInvestigation: 55 } as const;
/** 24 時間の強制で加盟店の売上が伸びる率 */
export const FORCE24_BOOST = 1.12;
/** オーナー支援：1 段ごと・加盟店 1 店あたりの月の費用 */
export const SUPPORT_COST = 60_000;
/** 当局の調査：制裁金（直近 12 か月の利益に対する割合、最低額） */
export const INVESTIGATION = { fineRate: 0.1, minFine: 200_000_000 } as const;
/** 時代のルール：規制の厳しい期間・緩い期間（月）、予告する月数、厳しいときの月の出店上限と出店費用の倍率、緩いときのライバルの伸び */
export const ERA = { strict: 24, loose: 30, notice: 3, strictCap: 6, strictCost: 1.3, looseRival: 2 } as const;
/** 地価：上がる月数と月の伸び、下がる月数と月の下げ、予兆の月数 */
export const LAND = { riseMonths: 36, rise: 0.02, fallMonths: 18, fall: 0.03, notice: 3 } as const;
/** 担保：直営店 1 店の土地の値打ち（指数 1 のとき）、借りられる割合、月の利息 */
export const LOAN = { landPerStore: 30_000_000, ratio: 0.8, interest: 0.004 } as const;
/** 上場：条件（直近 12 か月の売上）、株価の倍率（利益の何年分）、売り出す割合 */
export const IPO = { minRevenue: 30_000_000_000, per: 20, sell: 0.25 } as const;
/** PB：1 段の開発費、原価率の下がり方、需要の伸び */
export const PB = { max: 5, cost: 50_000_000, costCut: 0.015, demand: 0.02 } as const;

/** 地価の指数：全国チェーンを始めてからの月で決まる（上がって、天井を打って、下がって、落ち着く） */
export function landIndexAt(monthsIn: number): number {
  const up = Math.min(monthsIn, LAND.riseMonths);
  const peak = (1 + LAND.rise) ** LAND.riseMonths;
  if (monthsIn <= LAND.riseMonths) return (1 + LAND.rise) ** up;
  const down = Math.min(monthsIn - LAND.riseMonths, LAND.fallMonths);
  return peak * (1 - LAND.fall) ** down;
}

/** 担保の値打ちと、あといくら借りられるか */
export function collateral(n: Nation): number {
  return n.regions.reduce((a, r) => a + r.direct, 0) * LOAN.landPerStore * n.landIndex;
}
export const borrowable = (n: Nation) => Math.max(0, collateral(n) * LOAN.ratio - n.loans);

export const regionStores = (r: Region) => r.direct + r.fcOwner + r.fcHq;
export const nationStores = (n: Nation) => n.regions.reduce((a, r) => a + regionStores(r), 0);
export const trainees = (n: Nation) => TRAINEES.base + TRAINEES.perCenter * n.trainingCenters;

/** エリアの店 1 店あたりの日販：知名度（エリアでの店の密度）× 混み具合（自店とライバルの合計）× 品質 */
export function perStoreDaily(r: Region, quality: number, own = regionStores(r)): number {
  const aware = 1 + 0.4 * Math.min(1, own / r.capacity);
  const total = own + r.rival;
  const crowd = total <= r.capacity * 0.6 ? 1 : Math.max(0.5, 1 - (0.6 * (total - r.capacity * 0.6)) / r.capacity);
  return r.traffic * aware * crowd * quality;
}

/** ライバルの店 1 店あたりの日販（品質は一定） */
export function rivalDaily(r: Region): number {
  return perStoreDaily({ ...r, direct: r.rival, fcOwner: 0, fcHq: 0, rival: regionStores(r) }, 0.95, r.rival);
}

export interface RegionReport {
  revenue: number;
  /** 会社の取り分（直営の利益＋加盟店からの取り分） */
  profit: number;
  rivalRevenue: number;
  daily: number;
}

/** エリアの 1 か月にかかる会社全体の効き目（PB・24 時間の強制） */
export interface RegionMods {
  /** 需要の倍率（PB） */
  demand?: number;
  /** 原価率の下がり（PB） */
  costCut?: number;
  /** 加盟店の売上の倍率（24 時間の強制） */
  fcBoost?: number;
  /** 家賃の倍率（商店街の最後通告） */
  rentMult?: number;
}

/** エリアの 1 か月（30 日、天気のぶれ ±swing） */
export function regionMonth(r: Region, quality: number, swing: number, mods: RegionMods = {}): RegionReport {
  if (r.locked) return { revenue: 0, profit: 0, rivalRevenue: 0, daily: 0 };
  const daily = perStoreDaily(r, quality) * (1 + swing) * (mods.demand ?? 1);
  const l = r.hub ? HUB_LOGISTICS.withHub : HUB_LOGISTICS.without;
  const perStoreRevenue = daily * 30;
  const fcRevenue = perStoreRevenue * (mods.fcBoost ?? 1);
  const margin = 1 - (l.costRate - (mods.costCut ?? 0));
  const gross = perStoreRevenue * margin;
  const fcGross = fcRevenue * margin;
  const rent = r.rent * (mods.rentMult ?? 1);
  const direct = gross - DIRECT_LABOR - rent - l.delivery;
  const fcOwner = fcGross * ROYALTY.fcOwner - l.delivery;
  const fcHq = fcGross * ROYALTY.fcHq - rent - l.delivery;
  return {
    revenue: perStoreRevenue * r.direct + fcRevenue * (r.fcOwner + r.fcHq),
    profit: direct * r.direct + fcOwner * r.fcOwner + fcHq * r.fcHq,
    rivalRevenue: rivalDaily(r) * (1 + swing) * 30 * r.rival,
    daily,
  };
}

const round = (v: number) => Math.round(v / 10_000) * 10_000;

/** フェーズ 2 → 3：本拠エリアはフェーズ 2 の地図をまとめたもの、残り 10 エリアはレアリティごとに乱数で作る */
export function generateNation(home: { stores: number; fc: number; hub: boolean; rival: number; traffic: number; rent: number }, rng: Rng, month = 0): Nation {
  const regions: Region[] = REGION_NAMES.map(({ ja, en, rarity }, i) => {
    const name = { ja, en };
    if (i === 0) return { name, capacity: 40, traffic: home.traffic, rent: home.rent, hub: home.hub, direct: home.stores - home.fc, fcOwner: home.fc, fcHq: 0, rival: home.rival, rarity, locked: false };
    const p = RARITY_AREA[rarity];
    const traffic = round(p.traffic[0] + rng.next() * (p.traffic[1] - p.traffic[0]));
    const rival = p.rival[0] + Math.floor(rng.next() * (p.rival[1] - p.rival[0] + 1));
    return { name, capacity: p.capacity, traffic, rent: round(traffic * 1.1 + rng.next() * 100_000), hub: false, direct: 0, fcOwner: 0, fcHq: 0, rival, rarity, locked: rarity >= LOCKED_RARITY };
  });
  return newNationExtras(regions, month);
}

/** エリアから全国チェーンの状態を作る（足かせの初期値つき）。month は始まりの月 */
export function newNationExtras(regions: Region[], month: number): Nation {
  return {
    regions,
    trainingCenters: 0,
    manual: false,
    quality: 1,
    satisfaction: SATISFACTION.start,
    force24: false,
    support: 0,
    investigation: null,
    eraStrict: true,
    eraChange: month + ERA.strict,
    landIndex: 1,
    landStart: month,
    loans: 0,
    listed: false,
    ownership: 1,
    pb: 0,
  };
}
