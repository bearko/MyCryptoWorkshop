/**
 * フェーズ 1 の地図：草地と道路、建物、持ち主の縁（自社は青緑・他社は赤）、運搬の荷車。
 * 絵の置き方は ../render.ts と同じ規格。
 */
import { getExtension } from '../../game/catalog';
import { t } from '../../i18n';
import { drawRef } from '../../render/images';
import { DEF } from '../defs';
import { center, diamond, drawArt, drawBuilding, drawCell, image, type Camera, type Effect } from '../render';
import { cells, frontCell, type Dir } from '../sim';
import { PRODUCT, skuParts, type Sku } from './data';
import { facilityStatus, ground, isRoad, myWorkshop, type P1State, type Stop } from './model';

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

/** マスのふちを線で */
function edge(ctx: CanvasRenderingContext2D, i: number, j: number, color: string) {
  const c = center(i, j);
  ctx.strokeStyle = color;
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(c.x, c.y - 55);
  ctx.lineTo(c.x + 100, c.y);
  ctx.lineTo(c.x, c.y + 55);
  ctx.lineTo(c.x - 100, c.y);
  ctx.closePath();
  ctx.stroke();
}

export function drawP1(ctx: CanvasRenderingContext2D, s: P1State, cam: Camera, w: number, h: number, dpr: number, now: number, fx: Effect[], ghost: P1Ghost | null, selected: number | null, cell: [number, number] | null = null, placeable: Set<number> | null = null) {
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
  // 置くとき：置けないマスは暗く、置く場所は緑（置ける）か赤（置けない）
  if (placeable)
    for (let j = 0; j < s.n; j++)
      for (let i = 0; i < s.n; i++) if (!placeable.has(j * s.n + i) && visible(i, j)) diamond(ctx, i, j, 'rgba(14,18,30,0.55)');

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
        // 設置面：置けるなら緑、置けないなら赤（下の建物より上に塗る）
        for (const [x, y] of cells(def, ghost.i, ghost.j, ghost.dir)) {
          diamond(ctx, x, y, ghost.ok ? 'rgba(80,235,130,0.62)' : 'rgba(255,60,60,0.62)');
          edge(ctx, x, y, ghost.ok ? '#b8ffd0' : '#ffd0d0');
        }
        ctx.globalAlpha = ghost.ok ? 0.8 : 0.5;
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
  drawBubbles(ctx, s, cam, w, h, dpr);
}

// ---------------------------------------------------------------- 自社の施設の上の吹き出し

const STOP: Record<Stop, string> = {
  noCrafter: t('職人不在', 'No crafter'),
  crafterRest: t('職人休憩中', 'Crafter resting'),
  noItem: t('作る物未定', 'Nothing to make'),
  noMats: t('素材不足', 'No materials'),
  noHauler: t('運搬係不在', 'No hauler'),
  noProduct: t('商品未定', 'No product'),
  noClerk: t('店員不在', 'No clerk'),
  clerkRest: t('店員休憩中', 'Clerk resting'),
  soldOut: t('在庫切れ', 'Sold out'),
};
const BUBBLE = { craft: '#6fd08c', sell: '#f2b544', error: '#e0524f', warn: '#f39a3c', line: '#0f1626' };
const FONT = "'Hiragino Kaku Gothic ProN', 'Noto Sans JP', system-ui, sans-serif";

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** 四角い吹き出し（下の辺に小さな三角）。tip＝三角の先（建物の上） */
function bubble(ctx: CanvasRenderingContext2D, tipX: number, tipY: number, bw: number, bh: number, fill: string) {
  const tail = Math.max(4, Math.round(bh * 0.18));
  const x = Math.round(tipX - bw / 2);
  const y = Math.round(tipY - tail - bh);
  ctx.lineWidth = 2;
  ctx.strokeStyle = BUBBLE.line;
  ctx.fillStyle = fill;
  roundRect(ctx, x, y, bw, bh, Math.min(6, bh / 3));
  ctx.fill();
  ctx.stroke();
  // 三角（下の線の上に重ねて、つなぎ目の線を消す）
  ctx.beginPath();
  ctx.moveTo(tipX - tail, y + bh - 1);
  ctx.lineTo(tipX, tipY);
  ctx.lineTo(tipX + tail, y + bh - 1);
  ctx.fill();
  ctx.stroke();
  ctx.fillRect(tipX - tail + 1.5, y + bh - 2.5, tail * 2 - 3, 3);
  return { x, y };
}

function drawBubbles(ctx: CanvasRenderingContext2D, s: P1State, cam: Camera, w: number, h: number, dpr: number) {
  ctx.save();
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.imageSmoothingEnabled = false;
  const tileW = 200 * cam.zoom;
  const maxW = tileW * 0.92;
  for (const b of s.buildings) {
    const st = facilityStatus(s, b);
    if (!st) continue;
    const def = DEF[b.id];
    const cs = cells(def, b.i, b.j, b.dir).map(([x, y]) => center(x, y));
    const wx = cs.reduce((a, c) => a + c.x, 0) / cs.length;
    const [fi, fj] = frontCell(def, b.i, b.j, b.dir);
    const im = image(`b/${b.id}/rd.png`);
    const ah = im.naturalHeight || 200;
    // 絵の上端（キャンバスの上の余白を少し差し引く）
    const wy = center(fi, fj).y + 55 - (ah - 31) + 26;
    const sx = (wx - cam.x) * cam.zoom + w / 2;
    const sy = (wy - cam.y) * cam.zoom + h / 2;
    if (sx < -80 || sx > w + 80 || sy < -40 || sy > h + 120) continue;
    const pad = 4;
    const icon0 = Math.max(22, Math.min(52, tileW * 0.4));
    if ('kind' in st) {
      const n = st.items.length;
      let icon = icon0;
      icon = Math.min(icon, (maxW - pad * 2 - (n - 1) * 2) / n);
      const bw = n * icon + (n - 1) * 2 + pad * 2;
      const bh = icon + pad * 2;
      const { x, y } = bubble(ctx, sx, sy, bw, bh, st.kind === 'craft' ? BUBBLE.craft : BUBBLE.sell);
      st.items.forEach((k: Sku, n2) => {
        const [key, r] = skuParts(k);
        drawRef(ctx, getExtension(PRODUCT[key].ext[r]).image, x + pad + n2 * (icon + 2), y + pad, icon, icon);
      });
    } else {
      // 商品の吹き出しと同じ高さで、となりの建物にかからない幅まで
      const text = `! ${STOP[st.stop]}`;
      const bh = icon0 + pad * 2;
      let fs = Math.max(9, Math.min(16, bh * 0.4));
      ctx.font = `700 ${fs}px ${FONT}`;
      let tw = ctx.measureText(text).width;
      if (tw + 12 > maxW) {
        fs = Math.max(8, (fs * (maxW - 12)) / tw);
        ctx.font = `700 ${fs}px ${FONT}`;
        tw = ctx.measureText(text).width;
      }
      const bw = Math.max(tw + 12, bh);
      const { x, y } = bubble(ctx, sx, sy, bw, bh, st.level === 'error' ? BUBBLE.error : BUBBLE.warn);
      ctx.fillStyle = st.level === 'error' ? '#fff' : BUBBLE.line;
      ctx.textBaseline = 'middle';
      ctx.textAlign = 'center';
      ctx.fillText(text, x + bw / 2, y + bh / 2 + 0.5);
    }
  }
  ctx.restore();
}
