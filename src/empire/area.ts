// フェーズ 2 のエリアの地図（docs/EMPIRE_DESIGN.md 4.2）。純関数だけ。
// 店を近くに集めると知名度が上がって配送も安くなるが、近すぎると自店どうしで食い合う。
import type { Rng } from './rng';

export interface Cell {
  /** 基礎日販（GUM/日） */
  base: number;
  /** 月の家賃 */
  rent: number;
}

export interface Area {
  w: number;
  h: number;
  /** 行ごとに並べた区画（index = y * w + x） */
  cells: Cell[];
  /** 物流センターのある区画 */
  centers: number[];
  /** ライバルの店のある区画 */
  rivalStores: number[];
  /** ライバルが次に出店する区画と月（1 か月前から報告に出る＝予兆） */
  rivalPlan: { cell: number; month: number } | null;
}

export const AREA_W = 8;
export const AREA_H = 6;
/** 物流センターの配送圏（チェビシェフ距離） */
export const CENTER_RANGE = 2;

export const xyOf = (a: Pick<Area, 'w'>, i: number) => ({ x: i % a.w, y: Math.floor(i / a.w) });
export function dist(a: Pick<Area, 'w'>, i: number, j: number): number {
  const p = xyOf(a, i);
  const q = xyOf(a, j);
  return Math.max(Math.abs(p.x - q.x), Math.abs(p.y - q.y));
}

const round = (v: number) => Math.round(v / 10_000) * 10_000;

/** エリアを作る。駅のある一点ほど人通りが多く、家賃も高い。端は郊外で安い */
export function generateArea(rng: Rng): Area {
  const w = AREA_W;
  const h = AREA_H;
  const sx = 1 + Math.floor(rng.next() * (w - 2));
  const sy = 1 + Math.floor(rng.next() * (h - 2));
  const cells: Cell[] = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const d = Math.hypot(x - sx, y - sy);
      const base = 200_000 + 260_000 * Math.exp(-d / 2.5) + (rng.next() - 0.5) * 60_000;
      const edge = x === 0 || y === 0 || x === w - 1 || y === h - 1;
      cells.push({ base: round(base), rent: round(base * (edge ? 0.9 : 1.4) - 60_000) });
    }
  }
  return { w, h, cells, centers: [], rivalStores: [], rivalPlan: null };
}

/** 区画に近い順の空き区画（自店・ライバル・物流センターの無いところ） */
export function freeCells(a: Area, taken: Set<number>): number[] {
  return a.cells.map((_, i) => i).filter((i) => !taken.has(i) && !a.centers.includes(i) && !a.rivalStores.includes(i));
}

/** 物流センターの配送圏にあるか */
export const inRange = (a: Area, cell: number) => a.centers.some((c) => dist(a, c, cell) <= CENTER_RANGE);

/** 食い合い：近くの自店・ライバルの店ほど需要が減る */
export const CANNIBAL = { own1: 0.92, own2: 0.97, rival1: 0.88, rival2: 0.96 } as const;

export function cannibalMult(a: Area, cell: number, ownCells: number[]): number {
  let m = 1;
  for (const c of ownCells) {
    if (c === cell) continue;
    const d = dist(a, c, cell);
    if (d === 1) m *= CANNIBAL.own1;
    else if (d === 2) m *= CANNIBAL.own2;
  }
  for (const c of a.rivalStores) {
    const d = dist(a, c, cell);
    if (d === 1) m *= CANNIBAL.rival1;
    else if (d === 2) m *= CANNIBAL.rival2;
  }
  return m;
}

/** ライバルが次に狙う区画：人通りから、近くの店の数を引いて選ぶ（サイコロは振らない） */
export function rivalTarget(a: Area, ownCells: number[]): number | null {
  const taken = new Set(ownCells);
  const free = freeCells(a, taken);
  let best: number | null = null;
  let score = -Infinity;
  for (const i of free) {
    const crowd = [...ownCells, ...a.rivalStores].filter((c) => dist(a, c, i) <= 1).length;
    const s = a.cells[i].base - crowd * 90_000 - a.cells[i].rent * 0.1;
    if (s > score) {
      score = s;
      best = i;
    }
  }
  return best;
}
