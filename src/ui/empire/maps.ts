// 会社の状態から地図（GridData）を組み立てる。地図は見た目だけで、計算は src/empire/ が持つ。
import { generateArea, type Area } from '../../empire/area';
import type { EmpireState, Plot, Store } from '../../empire/model';
import type { Region } from '../../empire/nation';
import { regionStores } from '../../empire/nation';
import { makeRng } from '../../empire/rng';
import type { GridCell, GridData } from '../../render/map/grid';
import { TILE } from '../../render/map/grid';
import { SECTOR_SIZE } from '../../render/map/land';
import type { LandProfile } from '../../empire/lands';

/** シリーズ（ID の下 3 桁）と段階（1〜5）から ID */
const ext = (series: number, lv: number) => Math.max(1, Math.min(5, lv)) * 1000 + series;
export const RAMEN = 154;
export const CAKE = 176;
const DOLL = 182;
const SUSHI = 157;
const BURGER = 151;
const WHEEL = 118;
const PARASOL = 190;

/** 自社の店の絵：改装すると 1 段上がる（看板で Lv2、看板と駐車場で Lv3） */
export const storeExt = (s: Pick<Store, 'sign' | 'parking'>) => ext(RAMEN, 1 + (s.sign ? 1 : 0) + (s.sign && s.parking ? 1 : 0));
export const RIVAL_EXT = ext(CAKE, 1);

/** 地図の区画（ゲームの区画）から、外周つきの格子の番号へ */
export const gridIndex = (a: Pick<Area, 'w'>, i: number) => (Math.floor(i / a.w) + 1) * (a.w + 2) + (i % a.w) + 1;

/** 人通り（0〜1）。家賃と同じく駅に近いほど高い */
export function heats(a: Area): number[] {
  const max = Math.max(...a.cells.map((c) => c.base));
  const min = Math.min(...a.cells.map((c) => c.base));
  return a.cells.map((c) => (c.base - min) / Math.max(1, max - min));
}

/** 名前から決まる種（フェーズ 1 の飾りの町は、屋号ごとに同じ形になる） */
function seedOf(text: string): number {
  let h = 2166136261;
  for (const ch of text) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return h >>> 0;
}

/** フェーズ 1 の町（計算には使わない飾り）。店は駅に近いほうから置く */
export function foundingTown(e: Pick<EmpireState, 'name' | 'land'>): Area {
  return generateArea(makeRng(seedOf(`${e.name}:${e.land}`)));
}

const KIND_RANK: Record<string, number> = { home: 0.05, station: 0, office: 0.2, school: 0.45, liquor: 0.5, residential: 0.65, suburb: 0.85 };

/**
 * フェーズ 1 の店（や候補）の区画。区画の種類（駅前・オフィス街・郊外…）の人通りの順位で選ぶ。
 * 店の並びと、その店の種類・日販だけで決まるので、候補として見せた区画と、出店したあとの区画が同じになる。
 */
export function p1Cell(a: Area, kind: string, base: number, taken: number[]): number {
  const h = heats(a);
  const free = h
    .map((v, i) => ({ v, i }))
    .filter((x) => !taken.includes(x.i) && x.v < 1)
    .sort((x, y) => y.v - x.v || x.i - y.i);
  const jitter = ((base / 10_000) % 7) / 70;
  const want = Math.min(free.length - 1, Math.max(0, Math.floor(((KIND_RANK[kind] ?? 0.5) + jitter) * (free.length - 1))));
  return free[want].i;
}

/** フェーズ 1 の店の区画（店の順に、前の店の区画を避けて） */
export function storeCells(a: Area, stores: { plot: string; base: number }[]): number[] {
  const out: number[] = [];
  for (const s of stores) out.push(p1Cell(a, s.plot, s.base, out));
  return out;
}

/** フェーズ 1 の出店候補の区画。出店したら同じ区画に店が建つ（候補どうしが重なれば、あとの方をずらす） */
export function plotCells(a: Area, plots: Plot[], storeAt: number[]): number[] {
  const used: number[] = [];
  return plots.map((p) => {
    let c = p1Cell(a, p.kind, p.base, storeAt);
    if (used.includes(c)) c = p1Cell(a, p.kind, p.base, [...storeAt, ...used]);
    used.push(c);
    return c;
  });
}

export interface TownOptions {
  /** 自社の店のある区画と絵 */
  own: { cell: number; ext: number; id: number }[];
  rival: number[];
  centers: number[];
  /** 押せる区画の種類（フェーズ 1 の候補だけ押せる、など） */
  targetKind: (cell: number) => string | null;
  /** ランドの個性（地形・守り神・特産品）。無ければ森に囲まれた、癖のない町 */
  land?: LandProfile;
}

/** 町（Common のエリア）：8×6 の区画のまわりに木の外周、ブロックのあいだに細い道、駅 */
export function townGrid(a: Area, o: TownOptions): GridData {
  const cols = a.w + 2;
  const rows = a.h + 2;
  const h = heats(a);
  const cells: GridCell[] = Array.from({ length: cols * rows }, (_, gi) => {
    const x = gi % cols;
    const y = Math.floor(gi / cols);
    const ring = x === 0 || y === 0 || x === cols - 1 || y === rows - 1;
    if (!ring) return { ground: 'grass' };
    // 地形：海上都市は砂浜（下の端は海）、城下町は上の端が大通り、ほかは森
    if (o.land?.terrain === 'sea') return y === rows - 1 ? { ground: 'water' } : { ground: 'sand' };
    if (o.land?.terrain === 'castle' && y === 0) return { ground: 'plaza' };
    return { ground: 'grass', obj: (x + y) % 3 === 0 ? 'treeL' : 'treeS' };
  });
  const peak = h.indexOf(1);
  const terrain = o.land?.terrain;
  a.cells.forEach((_, i) => {
    const gi = gridIndex(a, i);
    const own = o.own.find((s) => s.cell === i);
    const kind = o.targetKind(i);
    const target = kind ? { kind, id: i } : undefined;
    if (own) cells[gi] = { ground: 'grass', lot: 'ours', ext: own.ext, target };
    else if (o.rival.includes(i)) cells[gi] = { ground: 'grass', lot: 'rival', ext: RIVAL_EXT, target };
    else if (o.centers.includes(i)) cells[gi] = { ground: 'grass', lot: 'ours', obj: 'hubS', target };
    else if (h[i] >= 0.62) cells[gi] = { ground: 'grass', lot: 'free', target };
    // 自由国家（Tangerine）はまだ空き地が多く、住宅の国（Lime）は郊外まで家が並ぶ
    else if (h[i] >= 0.3 && !(terrain === 'open' && i % 2 === 0)) cells[gi] = { ground: 'grass', ext: ext(DOLL, h[i] > 0.48 ? 2 : 1), target };
    else if (terrain === 'suburb' && i % 3 !== 0) cells[gi] = { ground: 'grass', ext: ext(DOLL, 1), target };
    else cells[gi] = { ground: (i * 7) % 5 === 0 || terrain === 'open' ? 'field' : 'grass', obj: (i * 7) % 5 === 0 || terrain === 'open' ? undefined : i % 2 ? 'treeL' : 'treeS', target };
  });
  // 特産品の店：駅にいちばん近い、どこのものでもない家 2 軒を、ランドの特産品の店に
  if (o.land) {
    const homes = a.cells
      .map((_, i) => i)
      .filter((i) => cells[gridIndex(a, i)].ext !== undefined && !cells[gridIndex(a, i)].lot)
      .sort((x, y) => h[y] - h[x])
      .slice(0, 2);
    for (const i of homes) cells[gridIndex(a, i)] = { ...cells[gridIndex(a, i)], lot: 'neutral', ext: ext(o.land.specialty.series, 2) };
  }
  // 駅：人通りのいちばん多い区画の真上の外周（上の端）に
  const px = (peak % a.w) + 1;
  const stationX = Math.max(0, Math.min(cols * TILE - 122, px * TILE + TILE / 2 - 61));
  for (const dx of [-1, 0, 1]) {
    const c = cells[px + dx];
    if (c) delete c.obj;
  }
  // 守り神：駅の左どなりの外周に、ランドの守り神のエクステンション
  if (o.land) {
    const gx = px - 2 >= 0 ? px - 2 : px + 2;
    if (gx < cols) cells[gx] = { ground: o.land.terrain === 'sea' ? 'sand' : 'plaza', ext: ext(o.land.guardian.series, 3) };
  }
  const extras: GridData['extras'] = [{ sprite: 'station', x: stationX, y: 10 }];
  // 海上都市の港：下の海に船
  if (terrain === 'sea') for (const bx of [2, cols - 3]) extras.push({ sprite: 'boat', x: bx * TILE, y: (rows - 1) * TILE + 8 });
  return { cols, rows, cells, roadsX: [3, 5, 7].filter((x) => x < cols - 1), roadsY: [3, 5].filter((y) => y < rows - 1), extras, surround: terrain === 'sea' ? 'sea' : 'woods', traffic: true };
}

/** フェーズ 3 のエリア（ほかのランドセクタ）の地図。店の数から区画を割りふる（見た目だけ） */
export function sectorGrid(r: Region, seed: number, land?: LandProfile): GridData {
  const [cols, rows] = SECTOR_SIZE[r.rarity];
  const lv = r.rarity + 1;
  const block = r.rarity === 0 ? 2 : 3;
  const rand = makeRng((seed * 2654435761) >>> 0);
  const cells: GridCell[] = Array.from({ length: cols * rows }, (_, gi) => {
    const x = gi % cols;
    const y = Math.floor(gi / cols);
    const ring = x === 0 || y === 0 || x === cols - 1 || y === rows - 1;
    return ring ? { ground: 'grass', obj: (x + y) % 3 === 0 ? 'treeL' : 'treeS' } : { ground: 'grass' };
  });
  const inner: number[] = [];
  for (let y = 1; y < rows - 1; y++) for (let x = 1; x < cols - 1; x++) inner.push(y * cols + x);
  const lots = inner.filter(() => rand.next() < 0.6);
  const blockOf = (gi: number) => Math.floor(((gi % cols) - 1) / block) + Math.floor((Math.floor(gi / cols) - 1) / block) * 100;
  const ordered = [...lots].sort((a, b) => blockOf(a) - blockOf(b) || a - b);
  const own = Math.min(regionStores(r), ordered.length);
  const rival = Math.min(r.rival, ordered.length - own);
  // 町の店：寿司・バーガー・観覧車・パラソル。ランドの特産品の店も混ぜる
  const others = [ext(SUSHI, lv), ext(BURGER, lv), ext(WHEEL, Math.min(lv, 4)), ext(PARASOL, lv), ...(land ? [ext(land.specialty.series, lv), ext(land.specialty.series, lv)] : [])];
  ordered.forEach((gi, k) => {
    if (k < own) cells[gi] = { ground: 'grass', lot: 'ours', ext: ext(RAMEN, lv) };
    else if (k >= ordered.length - rival) cells[gi] = { ground: 'grass', lot: 'rival', ext: ext(CAKE, lv) };
    else cells[gi] = rand.next() < 0.45 ? { ground: 'grass', lot: 'neutral', ext: others[Math.floor(rand.next() * others.length)] } : { ground: 'grass', lot: 'free' };
  });
  for (const gi of inner) {
    if (cells[gi].lot) continue;
    const v = rand.next();
    cells[gi] = v < 0.55 ? { ground: 'grass', ext: ext(DOLL, Math.min(4, 1 + Math.floor(rand.next() * lv))) } : v < 0.85 ? { ground: 'grass', obj: v < 0.7 ? 'treeL' : 'treeS' } : { ground: 'field' };
  }
  const roadsX: number[] = [];
  const roadsY: number[] = [];
  for (let x = 1 + block; x < cols - 1; x += block) roadsX.push(x);
  for (let y = 1 + block; y < rows - 1; y += block) roadsY.push(y);
  if (r.hub) cells[cols + 1] = { ground: 'grass', lot: 'ours', obj: 'hubS' };
  return { cols, rows, cells, roadsX, roadsY, extras: [], surround: land?.terrain === 'sea' ? 'sea' : 'woods', traffic: true };
}
