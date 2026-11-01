/**
 * つながった地図の描画：いまのセクタのまわりに、同じ階層のほかのセクタを描く。
 * - 出店済み：写し（snap）の建物・道路・地面を全部（少し暗く。人や荷車は描かない）
 * - 未出店（開いている）：町を先に作って、いまのセクタに面した外周 3 マスだけ。その先は霧
 * - まだ行けない：外周 3 マスを灰色＋雲
 * 縮小したときは、セクタごとに一度だけ小さな canvas に描いて使い回す（重くならないように）。
 * docs/ISLAND_PHASE1.md「つながった地図」。
 */
import { DEF } from '../defs';
import { center, drawBuilding, drawCell, image, loading } from '../render';
import { cells, frontCell } from '../sim';
import { TIERS, type Tier } from './data';
import { sectorDef, sectorState } from './company';
import { groundOf, type Ground, type P1State, type PBuilding } from './model';
import { ghostTown, gridDelta, layerOf, snapOf } from './world';

/** 外周の何マスを見せるか */
export const STRIP = 3;
/** 霧のグラデーションの幅（マス） */
const FADE = 4;

type Kind = 'mine' | 'open' | 'gray';
export interface Region {
  id: string;
  tier: Tier;
  kind: Kind;
  /** grid のずれ */
  dx: number;
  dy: number;
  /** マスのずれ（dx × n, dy × n） */
  oi: number;
  oj: number;
  n: number;
  /** いまのセクタの上下左右の隣 */
  adj: boolean;
  buildings: PBuilding[];
  ground: Ground[];
}

export interface World {
  key: string;
  n: number;
  regions: Region[];
  /** いまのセクタの座標のマス (i, j) を含むセクタ（いまのセクタは null） */
  at: (i: number, j: number) => Region | null;
}

/** 隣のセクタで、いまのセクタとの境界からの距離（マス）。隣でなければ Infinity */
export function edgeDist(r: Pick<Region, 'dx' | 'dy' | 'n' | 'adj'>, li: number, lj: number): number {
  if (!r.adj) return Infinity;
  if (r.dx === 1) return li;
  if (r.dx === -1) return r.n - 1 - li;
  if (r.dy === 1) return lj;
  return r.n - 1 - lj;
}

let memo: World | null = null;
/** いまの階層のほかのセクタ（関所を開けるまでは null：隣は見せない） */
export function worldOf(s: P1State): World | null {
  const land = s.land;
  if (!land) return null;
  const key = `${land.cur}|${land.mine.join(',')}|${s.seed}|${s.n}`;
  if (memo?.key === key) return memo;
  const cur = sectorDef(land.cur);
  const n = s.n;
  const regions: Region[] = [];
  for (const d of layerOf(cur.tier)) {
    if (d.id === cur.id) continue;
    const g = gridDelta(cur.id, d.id);
    if (!g) continue;
    const st = sectorState(land, d.id);
    const kind: Kind = st === 'mine' ? 'mine' : st === 'open' ? 'open' : 'gray';
    const snap = kind === 'mine' ? snapOf(s, d.id) : null;
    const src = snap ?? (kind === 'gray' ? null : ghostTown(s, d.id));
    const rn = snap?.n ?? src?.n ?? n;
    regions.push({ id: d.id, tier: d.tier, kind: snap || kind !== 'mine' ? kind : 'open', dx: g[0], dy: g[1], oi: g[0] * n, oj: g[1] * n, n: rn, adj: Math.abs(g[0]) + Math.abs(g[1]) === 1, buildings: src?.buildings ?? [], ground: groundOf(rn) });
  }
  // 奥から手前へ（等角の奥＝ i + j の小さい方）
  regions.sort((a, b) => a.dx + a.dy - (b.dx + b.dy));
  const byGrid = new Map(regions.map((r) => [`${r.dx},${r.dy}`, r]));
  memo = {
    key,
    n,
    regions,
    at: (i, j) => {
      const dx = Math.floor(i / n);
      const dy = Math.floor(j / n);
      if (!dx && !dy) return null;
      return byGrid.get(`${dx},${dy}`) ?? null;
    },
  };
  return memo;
}

/** 描くマスか（未出店・まだ行けない隣は、外周 3 マス＋霧の下の数マス） */
function shown(r: Region, li: number, lj: number, under = true): boolean {
  if (r.kind === 'mine') return true;
  return edgeDist(r, li, lj) < STRIP + (under ? FADE : 0);
}

/** いまのセクタの座標で、道路か（セクタをまたいで道路をつなぐ） */
export function roadAt(s: P1State, w: World | null, i: number, j: number): boolean {
  if (i >= 0 && j >= 0 && i < s.n && j < s.n) return s.ground[j * s.n + i] === 'road';
  const r = w?.at(i, j);
  if (!r) return false;
  const li = i - r.oi;
  const lj = j - r.oj;
  if (li < 0 || lj < 0 || li >= r.n || lj >= r.n || !shown(r, li, lj)) return false;
  return r.ground[lj * r.n + li] === 'road';
}

/** いまのセクタのまわりの砂浜・水のマスを、隣のセクタが覆っているか */
export const covered = (w: World | null, i: number, j: number) => !!w?.at(i, j);

function mask(s: P1State, w: World, i: number, j: number) {
  return (roadAt(s, w, i, j - 1) ? 1 : 0) | (roadAt(s, w, i + 1, j) ? 2 : 0) | (roadAt(s, w, i, j + 1) ? 4 : 0) | (roadAt(s, w, i - 1, j) ? 8 : 0);
}

function outline(ctx: CanvasRenderingContext2D, i: number, j: number, color: string) {
  const c = center(i, j);
  ctx.beginPath();
  ctx.moveTo(c.x, c.y - 52);
  ctx.lineTo(c.x + 95, c.y);
  ctx.lineTo(c.x, c.y + 52);
  ctx.lineTo(c.x - 95, c.y);
  ctx.closePath();
  ctx.strokeStyle = color;
  ctx.lineWidth = 6;
  ctx.stroke();
}

/** 雲（まだ行けないセクタの上）。仮の絵：コードで描いた白い丸の集まり（docs/ISLAND_ART_TODO.md） */
function cloud(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, a = 0.9) {
  ctx.fillStyle = `rgba(236,240,246,${a})`;
  for (const [ox, oy, k] of [
    [0, 0, 1],
    [-0.9, 0.25, 0.7],
    [0.9, 0.2, 0.75],
    [-0.4, -0.45, 0.65],
    [0.45, -0.4, 0.6],
  ] as [number, number, number][]) {
    ctx.beginPath();
    ctx.ellipse(x + ox * r, y + oy * r * 0.6, r * k, r * k * 0.6, 0, 0, Math.PI * 2);
    ctx.fill();
  }
}

/** セクタの範囲（いまのセクタの座標。マスの真ん中からの小数）を、タイルの座標の変換で塗る */
function inTileSpace(ctx: CanvasRenderingContext2D, fn: () => void) {
  ctx.save();
  ctx.transform(100, 55, -100, 55, 0, 0);
  fn();
  ctx.restore();
}

/** 霧：外周 3 マスの先は、白い霧に溶ける（隣でなければ全部が霧） */
function fog(ctx: CanvasRenderingContext2D, r: Region) {
  const rgb = r.kind === 'gray' ? '150,158,172' : '226,234,243';
  const end = r.kind === 'gray' ? 0.94 : 0.96;
  inTileSpace(ctx, () => {
    const x0 = r.oi - 0.5;
    const y0 = r.oj - 0.5;
    if (!r.adj) {
      ctx.fillStyle = `rgba(${rgb},${end})`;
      ctx.fillRect(x0, y0, r.n, r.n);
      return;
    }
    // 境界から STRIP マス目のふちで透明 → STRIP + FADE マスで霧
    const a = STRIP - 0.5;
    const b = STRIP + FADE - 0.5;
    let g: CanvasGradient;
    if (r.dx === 1) g = ctx.createLinearGradient(r.oi + a, 0, r.oi + b, 0);
    else if (r.dx === -1) g = ctx.createLinearGradient(r.oi + r.n - 1 - a, 0, r.oi + r.n - 1 - b, 0);
    else if (r.dy === 1) g = ctx.createLinearGradient(0, r.oj + a, 0, r.oj + b);
    else g = ctx.createLinearGradient(0, r.oj + r.n - 1 - a, 0, r.oj + r.n - 1 - b);
    g.addColorStop(0, `rgba(${rgb},0)`);
    g.addColorStop(0.55, `rgba(${rgb},${(end * 0.7).toFixed(2)})`);
    g.addColorStop(1, `rgba(${rgb},${end})`);
    ctx.fillStyle = g;
    ctx.fillRect(x0, y0, r.n, r.n);
  });
}

/** 1 つのセクタを描く（地面 → 建物 → 灰色・雲・霧） */
function drawRegion(ctx: CanvasRenderingContext2D, s: P1State, w: World, r: Region, vis: (i: number, j: number) => boolean, now: number) {
  const grass = image('tiles/grass.png');
  const sand = image('tiles/sand.png');
  const dim = r.kind === 'mine';
  // 地面（出店済みは外側の砂浜も）
  const lo = dim ? -1 : 0;
  const hi = dim ? r.n : r.n - 1;
  for (let d = lo * 2; d <= hi * 2; d++)
    for (let li = lo; li <= hi; li++) {
      const lj = d - li;
      if (lj < lo || lj > hi) continue;
      const i = li + r.oi;
      const j = lj + r.oj;
      if (!vis(i, j)) continue;
      const inside = li >= 0 && lj >= 0 && li < r.n && lj < r.n;
      if (!inside) {
        // 外側の砂浜：ほかのセクタ（いまのセクタも）が無いところだけ
        const cur = i >= 0 && j >= 0 && i < s.n && j < s.n;
        if (!cur && !w.at(i, j)) drawCell(ctx, sand, i, j);
        continue;
      }
      if (!shown(r, li, lj)) continue;
      if (r.ground[lj * r.n + li] === 'road') drawCell(ctx, image(`tiles/road${mask(s, w, i, j)}.png`), i, j);
      else drawCell(ctx, grass, i, j);
    }
  // 建物（未出店・まだ行けないセクタは外周 3 マスの中だけ）
  const items: { depth: number; b: PBuilding }[] = [];
  for (const b of r.buildings) {
    const def = DEF[b.id];
    const [fi, fj] = frontCell(def, b.i, b.j, b.dir);
    if (r.kind !== 'mine' && !cells(def, b.i, b.j, b.dir).every(([x, y]) => edgeDist(r, x, y) < STRIP)) continue;
    if (!vis(fi + r.oi, fj + r.oj)) continue;
    items.push({ depth: (fi + fj) * 1000 + fi, b });
  }
  items.sort((a, b) => a.depth - b.depth);
  for (const { b } of items) {
    const def = DEF[b.id];
    const at = { ...b, i: b.i + r.oi, j: b.j + r.oj };
    // 廃墟（ランクアップの災害。発掘 v2 の 7 段目）：となりの町からも、暗く色あせて見える（仮の絵）
    if (b.owner === 'ruin') {
      ctx.save();
      ctx.filter = 'grayscale(0.75) brightness(0.5) sepia(0.35)';
      drawBuilding(ctx, { ...at, left: 0 }, def, now);
      ctx.restore();
      continue;
    }
    if (b.owner !== 'town') for (const [x, y] of cells(def, at.i, at.j, at.dir)) outline(ctx, x, y, b.owner === 'me' ? '#3fd6c4' : '#f0565a');
    drawBuilding(ctx, at, def, now);
  }
  if (r.kind === 'gray') {
    // 灰色（外周 3 マス）
    inTileSpace(ctx, () => {
      ctx.fillStyle = 'rgba(96,102,116,0.55)';
      ctx.fillRect(r.oi - 0.5, r.oj - 0.5, r.n, r.n);
    });
  }
  if (r.kind !== 'mine') fog(ctx, r);
  if (r.kind === 'gray') {
    // 雲：外周 3 マスの上に 3 つ
    for (const k of [0.2, 0.5, 0.8]) {
      const along = (r.n - 1) * k;
      const [li, lj] = r.dx === 1 ? [1, along] : r.dx === -1 ? [r.n - 2, along] : r.dy === 1 ? [along, 1] : r.dy === -1 ? [along, r.n - 2] : [(r.n - 1) / 2, (r.n - 1) * k];
      const c = center(li + r.oi, lj + r.oj);
      cloud(ctx, c.x, c.y - 40, 170);
    }
  }
}

// ---------------------------------------------------------------- セクタごとの絵を覚えておく（出店済みのセクタ・縮小したとき）

const cache = new Map<string, { cv: HTMLCanvasElement; x0: number; y0: number; w: number; h: number; k: number }>();
/** セクタの絵の範囲（ワールド座標。建物の高さと砂浜のぶんの余白つき） */
export function bounds(r: Pick<Region, 'oi' | 'oj' | 'n'>) {
  const x0 = (r.oi - (r.oj + r.n - 1)) * 100 - 300;
  const x1 = (r.oi + r.n - 1 - r.oj) * 100 + 300;
  const y0 = (r.oi + r.oj) * 55 - 520;
  const y1 = (r.oi + r.oj + 2 * r.n - 2) * 55 + 200;
  return { x0, y0, w: x1 - x0, h: y1 - y0 };
}

function cachedRegion(ctx: CanvasRenderingContext2D, s: P1State, w: World, r: Region, k: number, now: number) {
  const key = `${w.key}|${r.id}`;
  let c = cache.get(key);
  if (!c || c.k !== k) {
    const b = bounds(r);
    // 絵の読み込みが終わるまでは覚えない（欠けた絵を使い回さない）
    if (loading()) {
      drawRegion(ctx, s, w, r, () => true, now);
      return;
    }
    const cv = document.createElement('canvas');
    cv.width = Math.max(1, Math.ceil(b.w * k));
    cv.height = Math.max(1, Math.ceil(b.h * k));
    const g = cv.getContext('2d')!;
    g.setTransform(k, 0, 0, k, -b.x0 * k, -b.y0 * k);
    g.imageSmoothingEnabled = true;
    drawRegion(g, s, w, r, () => true, now);
    // 出店済みのセクタは少し暗く（明るさ 85%。描いた画素だけ）
    if (r.kind === 'mine') {
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.globalCompositeOperation = 'source-atop';
      g.fillStyle = 'rgba(0,0,0,0.15)';
      g.fillRect(0, 0, cv.width, cv.height);
      g.globalCompositeOperation = 'source-over';
    }
    c = { cv, ...b, k };
    // 古い階層の絵は捨てる
    for (const old of cache.keys()) if (!old.startsWith(`${w.key}|`)) cache.delete(old);
    cache.set(key, c);
  }
  ctx.drawImage(c.cv, c.x0, c.y0, c.w, c.h);
}

/**
 * ほかのセクタを描く。which：back＝いまのセクタより奥（先に描く）、front＝手前（いまのセクタの建物のあと）。
 * 出店済みのセクタ（全体を描く）と縮小したときは、覚えておいた絵で描く（scale：その絵の細かさ）。
 */
export function drawWorld(ctx: CanvasRenderingContext2D, s: P1State, w: World, which: 'back' | 'front', vis: (i: number, j: number) => boolean, regionVis: (r: Region) => boolean, now: number, overview: number | null, scale: number) {
  for (const r of w.regions) {
    const back = r.dx + r.dy <= 0;
    if (back !== (which === 'back') || !regionVis(r)) continue;
    if (overview) cachedRegion(ctx, s, w, r, overview, now);
    else if (r.kind === 'mine') cachedRegion(ctx, s, w, r, scale, now);
    else drawRegion(ctx, s, w, r, vis, now);
  }
}

/** セクタの四隅（ワールド座標） */
export function corners(oi: number, oj: number, n: number) {
  const c = (i: number, j: number) => ({ x: (i - j) * 100, y: (i + j) * 55 });
  return [c(oi - 0.5, oj - 0.5), c(oi + n - 0.5, oj - 0.5), c(oi + n - 0.5, oj + n - 0.5), c(oi - 0.5, oj + n - 0.5)];
}

/** 境界線：細い点線（ランクの色、少し透ける）。いまのセクタも */
export function drawBorders(ctx: CanvasRenderingContext2D, s: P1State, w: World, zoom: number) {
  const tier = (s.tier ?? 'C') as Tier;
  ctx.save();
  ctx.strokeStyle = TIERS[tier].color;
  ctx.globalAlpha = 0.6;
  ctx.lineWidth = Math.max(3, 2 / zoom);
  ctx.setLineDash([Math.max(16, 9 / zoom), Math.max(12, 7 / zoom)]);
  for (const r of [{ oi: 0, oj: 0, n: s.n }, ...w.regions]) {
    const p = corners(r.oi, r.oj, r.n);
    ctx.beginPath();
    ctx.moveTo(p[0].x, p[0].y);
    for (const q of p.slice(1)) ctx.lineTo(q.x, q.y);
    ctx.closePath();
    ctx.stroke();
  }
  ctx.restore();
}

/** 覚えておく絵の細かさ（画面の画素 1 つ ≒ 絵の画素 1 つ。メモリを食わないよう 0.5 まで） */
export const cacheScale = (zoom: number, dpr: number) => (zoom * dpr > 0.26 ? 0.5 : zoom * dpr > 0.13 ? 0.25 : 0.125);
/** 縮小したときの、覚えておく絵の細かさ */
export const overviewScale = (zoom: number, dpr: number) => Math.min(0.25, cacheScale(zoom, dpr));
