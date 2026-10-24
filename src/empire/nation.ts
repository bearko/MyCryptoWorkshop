// フェーズ 3 の全国チェーン（docs/EMPIRE_DESIGN.md 4.3）。本拠ランドの 6 エリアを、1 店ずつではなく
// エリアごとの店の数で動かす。純関数だけ。
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
}

export interface Nation {
  regions: Region[];
  /** 研修所の数（店長・オーナーを育てる。出店の速さを決める） */
  trainingCenters: number;
  /** マニュアル（品質が崩れてから整えられる） */
  manual: boolean;
  /** 店の品質（0.5〜1）。急いで出店すると下がり、需要に効く */
  quality: number;
}

/** 6 エリアの名前（本拠エリアはフェーズ 2 の地図） */
export const REGION_NAMES = [
  { ja: '本拠エリア', en: 'Home area' }, // i18n-ja
  { ja: '北エリア', en: 'North area' }, // i18n-ja
  { ja: '東エリア', en: 'East area' }, // i18n-ja
  { ja: '南エリア', en: 'South area' }, // i18n-ja
  { ja: '西エリア', en: 'West area' }, // i18n-ja
  { ja: '中央エリア', en: 'Central area' }, // i18n-ja
];

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

/** エリアの 1 か月（30 日、天気のぶれ ±swing） */
export function regionMonth(r: Region, quality: number, swing: number): RegionReport {
  const daily = perStoreDaily(r, quality) * (1 + swing);
  const l = r.hub ? HUB_LOGISTICS.withHub : HUB_LOGISTICS.without;
  const perStoreRevenue = daily * 30;
  const gross = perStoreRevenue * (1 - l.costRate);
  const direct = gross - DIRECT_LABOR - r.rent - l.delivery;
  const fcOwner = gross * ROYALTY.fcOwner - l.delivery;
  const fcHq = gross * ROYALTY.fcHq - r.rent - l.delivery;
  return {
    revenue: perStoreRevenue * regionStores(r),
    profit: direct * r.direct + fcOwner * r.fcOwner + fcHq * r.fcHq,
    rivalRevenue: rivalDaily(r) * (1 + swing) * 30 * r.rival,
    daily,
  };
}

const round = (v: number) => Math.round(v / 10_000) * 10_000;

/** フェーズ 2 → 3：本拠エリアはフェーズ 2 の地図をまとめたもの、残り 5 エリアは乱数で作る */
export function generateNation(home: { stores: number; fc: number; hub: boolean; rival: number; traffic: number; rent: number }, rng: Rng): Nation {
  const regions: Region[] = REGION_NAMES.map((name, i) => {
    if (i === 0) return { name, capacity: 40, traffic: home.traffic, rent: home.rent, hub: home.hub, direct: home.stores - home.fc, fcOwner: home.fc, fcHq: 0, rival: home.rival };
    const traffic = round(220_000 + rng.next() * 160_000);
    return { name, capacity: 30 + Math.floor(rng.next() * 30), traffic, rent: round(traffic * 1.1 + rng.next() * 100_000), hub: false, direct: 0, fcOwner: 0, fcHq: 0, rival: 4 + Math.floor(rng.next() * 5) };
  });
  return { regions, trainingCenters: 0, manual: false, quality: 1 };
}
