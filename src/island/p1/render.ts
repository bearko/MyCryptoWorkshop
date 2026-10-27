/**
 * フェーズ 1 の地図：草地と道路、建物、持ち主の縁（自社は青緑・他社は赤）、運搬の荷車。
 * 絵の置き方は ../render.ts と同じ規格。
 */
import { DEF } from '../defs';
import { center, diamond, drawArt, drawBuilding, drawCell, image, type Camera, type Effect } from '../render';
import { cells, frontCell, type Dir } from '../sim';
import { ground, isRoad, myWorkshop, type P1State } from './model';

export interface P1Ghost {
  id: string;
  i: number;
  j: number;
  dir: Dir;
  ok: boolean;
}

function roadMask(s: P1State, i: number, j: number) {
  return (isRoad(s, i, j - 1) ? 1 : 0) | (isRoad(s, i + 1, j) ? 2 : 0) | (isRoad(s, i, j + 1) ? 4 : 0) | (isRoad(s, i - 1, j) ? 8 : 0);
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

const OWN = '#3fd6c4';
const RIVAL = '#f0565a';

/** 小さな荷車（運搬中の便） */
function cart(ctx: CanvasRenderingContext2D, x: number, y: number) {
  ctx.fillStyle = '#1d1a24';
  ctx.fillRect(x - 15, y - 21, 30, 17);
  ctx.fillStyle = '#c98a4a';
  ctx.fillRect(x - 13, y - 19, 26, 13);
  ctx.fillStyle = '#e8b56a';
  ctx.fillRect(x - 13, y - 19, 26, 4);
  ctx.fillStyle = '#1d1a24';
  ctx.fillRect(x - 11, y - 5, 6, 6);
  ctx.fillRect(x + 5, y - 5, 6, 6);
}

export function drawP1(ctx: CanvasRenderingContext2D, s: P1State, cam: Camera, w: number, h: number, dpr: number, now: number, fx: Effect[], ghost: P1Ghost | null, selected: number | null, cell: [number, number] | null = null) {
  ctx.save();
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = '#2f6fae';
  ctx.fillRect(0, 0, w, h);
  ctx.translate(w / 2, h / 2);
  ctx.scale(cam.zoom, cam.zoom);
  ctx.translate(-cam.x, -cam.y);
  ctx.imageSmoothingEnabled = cam.zoom < 1;
  const pad = 400;
  const left = cam.x - w / 2 / cam.zoom - pad;
  const right = cam.x + w / 2 / cam.zoom + pad;
  const top0 = cam.y - h / 2 / cam.zoom - pad;
  const bottom = cam.y + h / 2 / cam.zoom + pad;
  const visible = (i: number, j: number) => {
    const c = center(i, j);
    return c.x > left && c.x < right && c.y > top0 && c.y < bottom;
  };
  const water = image(`tiles/water${Math.floor(now / 700) % 2}.png`);
  const grass = image('tiles/grass.png');
  const sand = image('tiles/sand.png');
  for (let d = -4; d < s.n * 2 + 4; d++) {
    for (let i = -2; i <= d + 2; i++) {
      const j = d - i;
      if (i < -2 || j < -2 || i >= s.n + 2 || j >= s.n + 2 || !visible(i, j)) continue;
      const g = ground(s, i, j);
      if (g === 'road') drawCell(ctx, image(`tiles/road${roadMask(s, i, j)}.png`), i, j);
      else if (g === 'grass') drawCell(ctx, grass, i, j);
      else if (i === -1 || j === -1 || i === s.n || j === s.n) drawCell(ctx, sand, i, j);
      else drawCell(ctx, water, i, j);
    }
  }
  if (ghost) for (const [x, y] of cells(DEF[ghost.id], ghost.i, ghost.j, ghost.dir)) diamond(ctx, x, y, ghost.ok ? 'rgba(120,255,160,0.35)' : 'rgba(255,90,90,0.4)');
  const sel = selected != null ? s.buildings.find((b) => b.uid === selected) : null;
  if (sel) for (const [x, y] of cells(DEF[sel.id], sel.i, sel.j, sel.dir)) diamond(ctx, x, y, 'rgba(255,230,120,0.35)');
  else if (cell) diamond(ctx, cell[0], cell[1], 'rgba(255,230,120,0.45)');

  type Item = { depth: number; draw: () => void };
  const items: Item[] = [];
  for (const b of s.buildings) {
    const def = DEF[b.id];
    const [fi, fj] = frontCell(def, b.i, b.j, b.dir);
    if (!visible(fi, fj)) continue;
    const eff = fx.find((e) => e.uid === b.uid);
    items.push({
      depth: (fi + fj) * 1000 + fi,
      draw: () => {
        if (b.owner !== 'town') for (const [x, y] of cells(def, b.i, b.j, b.dir)) outline(ctx, x, y, b.owner === 'me' ? OWN : RIVAL);
        drawBuilding(ctx, b, def, now, eff);
      },
    });
  }
  if (ghost) {
    const def = DEF[ghost.id];
    const [fi, fj] = frontCell(def, ghost.i, ghost.j, ghost.dir);
    items.push({
      depth: (fi + fj) * 1000 + fi + 0.5,
      draw: () => {
        ctx.globalAlpha = 0.7;
        drawArt(ctx, image(`b/${ghost.id}/${ghost.dir === 'rd' || ghost.dir === 'ld' ? 'rd' : 'lu'}.png`), def, ghost);
        ctx.globalAlpha = 1;
      },
    });
  }
  // 運搬中の荷車：工房からお店へ、進み具合の位置
  const ws = myWorkshop(s);
  if (ws) {
    for (const t of s.trips) {
      const to = s.buildings.find((b) => b.uid === t.to);
      if (!to) continue;
      const k = 1 - t.left / t.total;
      // 行きと帰りを往復で
      const f = k < 0.5 ? k * 2 : (1 - k) * 2;
      const [ai, aj] = frontCell(DEF[ws.id], ws.i, ws.j, ws.dir);
      const [bi, bj] = frontCell(DEF[to.id], to.i, to.j, to.dir);
      const i = ai + (bi - ai) * f;
      const j = aj + (bj - aj) * f;
      const c = center(i, j);
      items.push({ depth: (i + j) * 1000 + i + 0.7, draw: () => cart(ctx, c.x, c.y + 20) });
    }
  }
  items.sort((a, b) => a.depth - b.depth);
  for (const it of items) it.draw();
  ctx.restore();
}
