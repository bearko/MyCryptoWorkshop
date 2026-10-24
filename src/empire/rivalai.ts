// ライバルの手（フェーズ 3、docs/EMPIRE_DESIGN.md 10.9）。DOM に触れない純関数。
//
// - 出店：エリアを「空き × 人通り × プレイヤーの強さ」で並べ、上位ほど多く出す（合計の速さは前と同じ）。
//   プレイヤーが強いエリアほど狙われる
// - セール攻勢：年に 1 度、プレイヤーの店がいちばん多いエリアで 3 か月の値下げ。1 か月前にかわら版で予告する。
//   攻勢のあいだ、そのエリアの客足が落ち、ライバルが 2 店増やす。対抗セール（費用）で客足は守れる
import type { Note } from './model';
import { regionStores, RIVAL_NATION, type Nation, type Region } from './nation';

export interface Campaign {
  region: number;
  /** 始まる月と終わる月（この月の前まで） */
  start: number;
  end: number;
}

/** 数字は仮。npm run sim:empire で測って決める */
export const CAMPAIGN = {
  /** 何か月ごとに仕掛けるか、最初はフェーズ 3 の何か月目か */
  every: 12,
  first: 9,
  months: 3,
  notice: 1,
  /** 攻勢のあいだの客足と、ライバルが増やす店 */
  demand: 0.9,
  stores: 2,
  /** 対抗セール：そのエリアの自店 1 店あたりの月の費用 */
  counterPerStore: 600_000,
} as const;

/** 1 回の出店の手で、上位・中位・下位のエリアに出す店の数 */
const SPREAD = [2, 2, 2, 1, 1, 1, 1, 0, 0, 0];

/** エリアの狙いやすさ（空きが多く、人通りがあり、プレイヤーが強いほど高い） */
function score(r: Region): number {
  const room = Math.max(0, Math.floor(r.capacity * RIVAL_NATION.share) - r.rival);
  const ours = regionStores(r) / r.capacity;
  return room * r.traffic * (1 + 2 * ours);
}

/**
 * ライバルの出店（RIVAL_NATION.interval か月ごとに呼ぶ）。rounds は緩い時代やライバルを名指ししたあとで 2。
 * 開いているエリアだけ、エリアの入りきる目安の RIVAL_NATION.share まで。
 */
export function rivalExpand(n: Nation, rounds: number): void {
  for (let k = 0; k < rounds; k++) {
    const order = n.regions
      .map((r, i) => ({ r, i }))
      .filter((x) => !x.r.locked && x.r.rival < Math.floor(x.r.capacity * RIVAL_NATION.share))
      .sort((a, b) => score(b.r) - score(a.r) || a.i - b.i);
    order.forEach((x, j) => {
      const cap = Math.floor(x.r.capacity * RIVAL_NATION.share);
      x.r.rival = Math.min(cap, x.r.rival + (SPREAD[j] ?? 0));
    });
  }
}

/** 次のセール攻勢を決める（プレイヤーの店がいちばん多いエリア） */
export function planCampaign(n: Nation, month: number): Campaign | null {
  const target = n.regions
    .map((r, i) => ({ r, i }))
    .filter((x) => !x.r.locked && regionStores(x.r) > 0)
    .sort((a, b) => regionStores(b.r) - regionStores(a.r) || a.i - b.i)[0];
  return target ? { region: target.i, start: month + CAMPAIGN.notice, end: month + CAMPAIGN.notice + CAMPAIGN.months } : null;
}

export const campaignActive = (c: Campaign | null | undefined, month: number) => !!c && month >= c.start && month < c.end;

/** 対抗セールの今月の費用 */
export const counterCost = (n: Nation, c: Campaign) => regionStores(n.regions[c.region]) * CAMPAIGN.counterPerStore;

/**
 * セール攻勢の 1 か月（nationMonth の売上の前）。予告・開始・ライバルの出店・終わり。
 * 返り値：そのエリアの客足の倍率（対抗していれば 1）
 */
export function campaignStep(n: Nation, c: Campaign | null, month: number, countered: boolean, notes: Note[]): number {
  if (!c) return 1;
  if (month === c.start - CAMPAIGN.notice) notes.push({ kind: 'campaignSoon', region: c.region, month: c.start });
  if (!campaignActive(c, month)) return 1;
  const r = n.regions[c.region];
  if (month === c.start) {
    r.rival = Math.min(Math.floor(r.capacity * RIVAL_NATION.share) + CAMPAIGN.stores, r.rival + CAMPAIGN.stores);
    notes.push({ kind: 'campaign', region: c.region, until: c.end });
  }
  return countered ? 1 : CAMPAIGN.demand;
}
