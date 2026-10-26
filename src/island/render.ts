/**
 * 島づくりの描画（Canvas 2D）。1 マスは横 200・縦 110 のひし形で、隣のマスへは横 ±100・縦 +55。
 * 絵の基準点は「下端から 31 上、手前のマスの横の真ん中」（docs/ISLAND_MVP.md）。
 */
import { DEF, type Def } from './defs';
import { cells, frontCell, groundAt, type Building, type Dir, type State } from './sim';

const BASE = `${import.meta.env.BASE_URL}island/`;
const cache = new Map<string, HTMLImageElement>();
export function image(path: string): HTMLImageElement {
  let im = cache.get(path);
  if (!im) {
    im = new Image();
    im.src = BASE + path;
    cache.set(path, im);
  }
  return im;
}
const ok = (im: HTMLImageElement) => im.complete && im.naturalWidth > 0;

export const art = (id: string, dir: Dir) => image(`b/${id}/${dir === 'rd' || dir === 'ld' ? 'rd' : 'lu'}.png`);
export const mirrored = (dir: Dir) => dir === 'ld' || dir === 'ru';

export interface Camera {
  x: number;
  y: number;
  zoom: number;
}

export interface Effect {
  uid: number;
  start: number;
}

export interface Ghost {
  def: Def;
  i: number;
  j: number;
  dir: Dir;
  ok: boolean;
}

/** マスの真ん中（ワールド座標） */
export const center = (i: number, j: number) => ({ x: (i - j) * 100, y: (i + j) * 55 });

/** 画面の点 → マス */
export function pick(cam: Camera, w: number, h: number, sx: number, sy: number): [number, number] {
  const wx = (sx - w / 2) / cam.zoom + cam.x;
  const wy = (sy - h / 2) / cam.zoom + cam.y;
  const u = (wx / 100 + wy / 55) / 2;
  const v = (wy / 55 - wx / 100) / 2;
  return [Math.round(u), Math.round(v)];
}

/** 絵を基準点で置く。dir が左下・右上なら左右反転 */
function drawArt(ctx: CanvasRenderingContext2D, im: HTMLImageElement, def: Def, b: { i: number; j: number; dir: Dir }, sx = 0, sw?: number) {
  if (!ok(im)) return;
  const w = sw ?? im.naturalWidth;
  const h = im.naturalHeight;
  const [fi, fj] = frontCell(def, b.i, b.j, b.dir);
  const c = center(fi, fj);
  const flip = mirrored(b.dir);
  // 2 マスの絵は、手前のマスが左（反転すると右）にある
  const ax = def.size === 2 ? (flip ? w - 100 : 100) : 100;
  const x = c.x - ax;
  const y = c.y + 55 - (h - 31);
  if (flip) {
    ctx.save();
    ctx.translate(x + w, y);
    ctx.scale(-1, 1);
    ctx.drawImage(im, sx, 0, w, h, 0, 0, w, h);
    ctx.restore();
  } else ctx.drawImage(im, sx, 0, w, h, x, y, w, h);
}

/** 1 マスの絵（土台・足場・キラキラ）をマスに置く */
function drawCell(ctx: CanvasRenderingContext2D, im: HTMLImageElement, i: number, j: number, frame = 0) {
  if (!ok(im)) return;
  const h = im.naturalHeight;
  const c = center(i, j);
  ctx.drawImage(im, frame * 200, 0, 200, h, c.x - 100, c.y + 55 - (h - 31), 200, h);
}

const SCAFFOLD_FRAMES = { 3: 9, 4: 12, 5: 15 } as const;
const SPARKLE_FRAMES = 18;
const SPARKLE_MS = 70;

function levels(def: Def): 3 | 4 | 5 {
  if (def.tall) return 5;
  return def.size === 2 ? 4 : 3;
}

function diamond(ctx: CanvasRenderingContext2D, i: number, j: number, fill: string) {
  const c = center(i, j);
  ctx.beginPath();
  ctx.moveTo(c.x, c.y - 55);
  ctx.lineTo(c.x + 100, c.y);
  ctx.lineTo(c.x, c.y + 55);
  ctx.lineTo(c.x - 100, c.y);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
}

export function draw(ctx: CanvasRenderingContext2D, s: State, cam: Camera, w: number, h: number, now: number, fx: Effect[], ghost: Ghost | null, selected: number | null) {
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#2f6fae';
  ctx.fillRect(0, 0, w, h);
  ctx.translate(w / 2, h / 2);
  ctx.scale(cam.zoom, cam.zoom);
  ctx.translate(-cam.x, -cam.y);
  ctx.imageSmoothingEnabled = cam.zoom < 1;

  // 見えているマスだけ
  const pad = 400;
  const left = cam.x - w / 2 / cam.zoom - pad;
  const right = cam.x + w / 2 / cam.zoom + pad;
  const topY = cam.y - h / 2 / cam.zoom - pad;
  const bottom = cam.y + h / 2 / cam.zoom + pad;
  const visible = (i: number, j: number) => {
    const c = center(i, j);
    return c.x > left && c.x < right && c.y > topY && c.y < bottom;
  };

  const water = image(`tiles/water${Math.floor(now / 700) % 2}.png`);
  const tile = { grass: image('tiles/grass.png'), sand: image('tiles/sand.png'), water };
  // 地面：奥から手前へ
  for (let d = 0; d < s.n * 2 - 1; d++) {
    for (let i = 0; i <= d; i++) {
      const j = d - i;
      if (i >= s.n || j >= s.n || !visible(i, j)) continue;
      const g = groundAt(s, i, j);
      if (g) drawCell(ctx, tile[g], i, j);
    }
  }
  // まわりの海
  for (let i = -6; i < s.n + 6; i++)
    for (let j = -6; j < s.n + 6; j++) if ((i < 0 || j < 0 || i >= s.n || j >= s.n) && visible(i, j)) drawCell(ctx, water, i, j);

  // 置こうとしている場所の色
  if (ghost) for (const [x, y] of cells(ghost.def, ghost.i, ghost.j, ghost.dir)) diamond(ctx, x, y, ghost.ok ? 'rgba(120,255,160,0.35)' : 'rgba(255,90,90,0.4)');
  const sel = selected != null ? s.buildings.find((b) => b.uid === selected) : null;
  if (sel) for (const [x, y] of cells(DEF[sel.id], sel.i, sel.j, sel.dir)) diamond(ctx, x, y, 'rgba(255,230,120,0.35)');

  // 建物：手前のマスの奥行きの順
  type Item = { depth: number; draw: () => void };
  const items: Item[] = [];
  for (const b of s.buildings) {
    const def = DEF[b.id];
    const [fi, fj] = frontCell(def, b.i, b.j, b.dir);
    if (!visible(fi, fj)) continue;
    const depth = (fi + fj) * 1000 + fi;
    const effect = fx.find((e) => e.uid === b.uid);
    items.push({ depth, draw: () => drawBuilding(ctx, b, def, now, effect) });
  }
  if (ghost) {
    const [fi, fj] = frontCell(ghost.def, ghost.i, ghost.j, ghost.dir);
    items.push({
      depth: (fi + fj) * 1000 + fi + 0.5,
      draw: () => {
        ctx.globalAlpha = 0.7;
        drawArt(ctx, art(ghost.def.id, ghost.dir), ghost.def, ghost);
        ctx.globalAlpha = 1;
      },
    });
  }
  items.sort((a, b) => a.depth - b.depth);
  for (const it of items) it.draw();
  ctx.restore();
}

function drawBuilding(ctx: CanvasRenderingContext2D, b: Building, def: Def, now: number, effect?: Effect) {
  if (b.left > 0) {
    // 工事中：更地の上に、進み具合に合わせた段まで足場を組む
    const lv = levels(def);
    const total = SCAFFOLD_FRAMES[lv];
    const frame = Math.min(total - 1, Math.floor((1 - b.left / def.days) * total));
    for (const [x, y] of cells(def, b.i, b.j, b.dir)) {
      drawCell(ctx, image('fx/lot.png'), x, y);
      drawCell(ctx, image(`fx/scaffold${lv}.png`), x, y, frame);
    }
    return;
  }
  const f = effect ? Math.floor((now - effect.start) / SPARKLE_MS) : -1;
  const sparkle = f >= 0 && f < SPARKLE_FRAMES;
  if (sparkle) for (const [x, y] of cells(def, b.i, b.j, b.dir)) drawCell(ctx, image('fx/sparkle_back.png'), x, y, f);
  drawArt(ctx, art(b.id, b.dir), def, b);
  if (sparkle) for (const [x, y] of cells(def, b.i, b.j, b.dir)) drawCell(ctx, image('fx/sparkle_front.png'), x, y, f);
}

export const effectDone = (e: Effect, now: number) => now - e.start > SPARKLE_FRAMES * SPARKLE_MS;
