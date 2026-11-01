/**
 * フェーズ 1 の地図：草地と道路、建物、持ち主の縁（自社は青緑・他社は赤）、運搬の荷車。
 * 絵の置き方は ../render.ts と同じ規格。
 */
import { t } from '../../i18n';
import { drawRef } from '../../render/images';
import { DEF } from '../defs';
import { center, diamond, drawArt, drawBuilding, drawCell, image, type Camera, type Effect } from '../render';
import { cells, frontCell, type Dir } from '../sim';
import { PRODUCT, skuParts, type Sku } from './data';
import { COIN_KEEP, COIN_MS, PLUS_MS, along, drawRing, drawWalker, floatText, type Anim } from './anim';
import { craftDays, doorOf, facilityStatus, ground, isRoad, myWorkshop, reach, roadPath, speed, staffOf, wasteSpots, type P1State, type Stop } from './model';
import { bounds, cacheScale, covered, drawBorders, drawWorld, roadAt, type World } from './worldrender';

import { extImage } from './ui';
export interface P1Ghost {
  id: string;
  i: number;
  j: number;
  dir: Dir;
  ok: boolean;
  /** お店を置くとき：商圏（近いマスほど濃く） */
  area?: boolean;
  /** 人流解析：お客さんの多い区画（上位 20%）。薄い金色に塗る */
  hot?: Set<number>;
}

function roadMask(s: P1State, i: number, j: number, w: World | null = null) {
  // つながった地図：隣のセクタの道路にもつなぐ
  const r = w ? (x: number, y: number) => roadAt(s, w, x, y) : (x: number, y: number) => isRoad(s, x, y);
  return (r(i, j - 1) ? 1 : 0) | (r(i + 1, j) ? 2 : 0) | (r(i, j + 1) ? 4 : 0) | (r(i - 1, j) ? 8 : 0);
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

/**
 * world：つながった地図（関所を開けたあと。隣のセクタを描く）。
 * overview：縮小して全体を見ているとき（隣のセクタは覚えておいた絵の細かさ。人・荷車・吹き出しは描かない）
 */
export function drawP1(ctx: CanvasRenderingContext2D, s: P1State, cam: Camera, w: number, h: number, dpr: number, now: number, fx: Effect[], ghost: P1Ghost | null, selected: number | null, cell: [number, number] | null = null, placeable: Set<number> | null = null, anim: Anim | null = null, world: World | null = null, overview: number | null = null) {
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
  // つながった地図：いまのセクタより奥のセクタを先に
  const regionVis = (r: { oi: number; oj: number; n: number }) => {
    const b = bounds(r);
    return b.x0 < right && b.x0 + b.w > left && b.y0 < bottom && b.y0 + b.h > top0;
  };
  if (world) drawWorld(ctx, s, world, 'back', visible, regionVis, now, overview, cacheScale(cam.zoom, dpr));
  for (let d = -4; d < s.n * 2 + 4; d++) {
    for (let i = -2; i <= d + 2; i++) {
      const j = d - i;
      if (i < -2 || j < -2 || i >= s.n + 2 || j >= s.n + 2 || !visible(i, j)) continue;
      const g = ground(s, i, j);
      // まわりの砂浜・水は、隣のセクタがあれば描かない（地図がつながって見える）
      if (!g && covered(world, i, j)) continue;
      if (g === 'road') drawCell(ctx, image(`tiles/road${roadMask(s, i, j, world)}.png`), i, j);
      else if (g === 'grass') drawCell(ctx, grass, i, j);
      else if (i === -1 || j === -1 || i === s.n || j === s.n) drawCell(ctx, sand, i, j);
      else drawCell(ctx, water, i, j);
    }
  }
  // 荒れ地（2 × 2）：乾いた土・小石・石垣のかけら・枯れ草。発掘中は杭とロープ（仮の絵。docs/ISLAND_ART_TODO.md）
  const wastes = s.dig ? wasteSpots(s.dig.sector) : [];
  wastes.forEach((sp, k) => {
    if (visible(sp[0], sp[1]) || visible(sp[0] + 1, sp[1] + 1)) drawWaste(ctx, s, k, sp, now, anim?.wasteGlow === k);
  });
  // 置くとき：置けないマスは暗く、置く場所は緑（置ける）か赤（置けない）
  if (placeable)
    for (let j = 0; j < s.n; j++)
      for (let i = 0; i < s.n; i++) if (!placeable.has(j * s.n + i) && visible(i, j)) diamond(ctx, i, j, 'rgba(14,18,30,0.55)');

  // 置くとき：荒れ地は赤く（発掘許可をもらって掘りきると建てられる）
  if (placeable)
    for (const [i0, j0] of wastes)
      for (let dj = 0; dj < 2; dj++) for (let di = 0; di < 2; di++) if (visible(i0 + di, j0 + dj)) diamond(ctx, i0 + di, j0 + dj, 'rgba(225,60,60,0.42)');

  // 人流解析：お客さんの多い区画を薄い金色に（置けないマスの暗さの上に）
  if (ghost?.hot)
    for (const k of ghost.hot) {
      const i = k % s.n;
      const j = Math.floor(k / s.n);
      if (visible(i, j)) diamond(ctx, i, j, 'rgba(255,200,60,0.5)');
    }

  // お店を置くとき：お客さんが来やすい範囲（商圏）を金色に。近いほど濃い
  if (ghost?.area)
    for (let j = ghost.j - 6; j <= ghost.j + 6; j++)
      for (let i = ghost.i - 6; i <= ghost.i + 6; i++) {
        const d = Math.abs(i - ghost.i) + Math.abs(j - ghost.j);
        if (d > 6 || !ground(s, i, j) || !visible(i, j)) continue;
        diamond(ctx, i, j, `rgba(255,205,90,${(0.55 * reach(d)).toFixed(3)})`);
      }

  // チュートリアル：建ててもらう場所（金色に光るマスと「ここに建ててみて！」）
  if (anim?.mark) {
    const a = 0.35 + 0.25 * Math.sin(now / 220);
    diamond(ctx, anim.mark.i, anim.mark.j, `rgba(255,214,90,${a.toFixed(3)})`);
    edge(ctx, anim.mark.i, anim.mark.j, '#ffd65a');
  }
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
  // 荒れ地の旗（発掘許可あり）：建物と同じく奥から手前へ
  wastes.forEach(([i0, j0], k) => {
    const st = s.dig?.sites[k];
    if (!st?.permit || st.done || s.digRun?.site === k || !visible(i0, j0)) return;
    items.push({ depth: (i0 + j0) * 1000 + i0 + 0.3, draw: () => wasteFlag(ctx, i0, j0, now) });
  });
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
  // 運搬中の荷車：工房（か物流拠点）からお店へ、道路をたどって行き来する
  const ws = overview ? null : myWorkshop(s);
  if (ws) {
    for (const t of s.trips) {
      const to = s.buildings.find((b) => b.uid === t.to);
      const from = (t.from != null ? s.buildings.find((b) => b.uid === t.from) : null) ?? ws;
      if (!to) continue;
      const path = tripPath(s, doorOf(from), doorOf(to));
      // 1 日のうちの進みも入れて、なめらかに（日ごとに飛ばない）
      const k = Math.min(0.999, (t.total - t.left + (anim?.frac ?? 0)) / t.total);
      // 行き（荷物あり）と帰り（空）
      const back = k >= 0.5;
      const f = back ? (1 - k) * 2 : k * 2;
      const p = path.length > 1 ? along(path, f) : { i: path[0]?.[0] ?? from.i, j: path[0]?.[1] ?? from.j, di: 0, dj: 0 };
      if (!visible(Math.round(p.i), Math.round(p.j))) continue;
      // 運搬係が荷車を押して歩く。工房を出るとき・お店に入るときは、ふわっと出入りする
      const q = path.length > 1 ? along(path, Math.max(0, Math.min(1, f + (back ? -0.04 : 0.04)))) : p;
      const c = center(q.i, q.j);
      const alpha = Math.min(1, f / 0.06, (1 - f) / 0.06);
      const di = back ? -p.di : p.di;
      const dj = back ? -p.dj : p.dj;
      items.push({
        depth: (p.i + p.j) * 1000 + p.i + 0.7,
        draw: () => {
          ctx.save();
          ctx.globalAlpha = Math.max(0, alpha);
          cart(ctx, c.x, c.y + 20);
          ctx.restore();
          drawWalker(ctx, t.hauler, p.i, p.j, di, dj, (anim?.clock ?? now) / 90, Math.max(0, alpha));
        },
      });
    }
  }
  // 歩いているヒーロー（お客さん・調達係）
  if (anim && !overview) {
    for (const wk of [...anim.crowd, ...anim.walkers]) {
      const f = (anim.clock - wk.t0) / wk.dur;
      if (f < 0 || f > 1) continue;
      const p = along(wk.path, f);
      if (!visible(Math.round(p.i), Math.round(p.j))) continue;
      // 家から出てくるとき・お店に入るときはふわっと
      const alpha = Math.min(1, f / 0.08, (1 - f) / 0.08);
      items.push({ depth: (p.i + p.j) * 1000 + p.i + 0.6, draw: () => drawWalker(ctx, wk.hero, p.i, p.j, p.di, p.dj, (anim.clock - wk.t0) / 90, alpha) });
    }
    // 注文した素材を運んでくる問屋の人
    for (const cu of anim.couriers ?? []) {
      const p = along(cu.path, cu.f);
      if (!visible(Math.round(p.i), Math.round(p.j))) continue;
      const alpha = Math.min(1, cu.f / 0.06, (1 - cu.f) / 0.06);
      const carry = image(`items/${cu.carry}.png`);
      items.push({ depth: (p.i + p.j) * 1000 + p.i + 0.6, draw: () => drawWalker(ctx, cu.hero, p.i, p.j, p.di, p.dj, anim.clock / 90, Math.max(0, alpha), carry) });
    }
    const by = anim.buyer;
    if (by && by.path.length > 1) {
      // 行き（0〜0.5）は工房から卸問屋へ、帰り（0.5〜1）は荷物を持って戻る
      const back = by.k > 0.5;
      const f = back ? (1 - by.k) * 2 : by.k * 2;
      const p = along(by.path, f);
      const carry = back && by.carry ? image(`items/${by.carry}.png`) : null;
      items.push({ depth: (p.i + p.j) * 1000 + p.i + 0.6, draw: () => drawWalker(ctx, by.hero, p.i, p.j, back ? -p.di : p.di, back ? -p.dj : p.dj, anim.clock / 90, 1, carry) });
    }
  }
  items.sort((a, b) => a.depth - b.depth);
  for (const it of items) it.draw();
  // 発掘との出会い：光らせる荒れ地のふちを、建物の上にも金色で（手前の家に隠れないように）
  if (anim?.wasteGlow != null && wastes[anim.wasteGlow]) {
    const [i0, j0] = wastes[anim.wasteGlow];
    const a = 0.45 + 0.35 * Math.sin(now / 220);
    ctx.beginPath();
    [wastePt(i0, j0, 0, 0), wastePt(i0, j0, 1, 0), wastePt(i0, j0, 1, 1), wastePt(i0, j0, 0, 1)].forEach((q, n) => (n ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y)));
    ctx.closePath();
    ctx.setLineDash([22, 14]);
    ctx.lineDashOffset = -now / 30;
    ctx.strokeStyle = `rgba(255,214,90,${a.toFixed(3)})`;
    ctx.lineWidth = 7;
    ctx.stroke();
    ctx.setLineDash([]);
  }
  // つながった地図：手前のセクタと、セクタのあいだの境界線
  if (world) {
    drawWorld(ctx, s, world, 'front', visible, regionVis, now, overview, cacheScale(cam.zoom, dpr));
    drawBorders(ctx, s, world, cam.zoom);
  }
  if (anim?.mark) {
    const c = center(anim.mark.i, anim.mark.j);
    const y = c.y - 150 - Math.abs(Math.sin(now / 300)) * 10;
    ctx.font = "900 30px 'Hiragino Kaku Gothic ProN', 'Noto Sans JP', system-ui, sans-serif";
    const w = ctx.measureText(anim.mark.label).width + 28;
    ctx.fillStyle = '#ffd65a';
    ctx.strokeStyle = '#0f1626';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.roundRect(c.x - w / 2, y - 26, w, 52, 14);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(c.x - 12, y + 24);
    ctx.lineTo(c.x, y + 44);
    ctx.lineTo(c.x + 12, y + 24);
    ctx.fill();
    ctx.fillStyle = '#0f1626';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(anim.mark.label, c.x, y + 1);
  }
  // スポットライト：見せたいところのまわりを暗く
  if (anim?.spot) {
    const c = center(anim.spot.i, anim.spot.j);
    const cy = c.y - 30;
    const r = anim.spot.r;
    const g = ctx.createRadialGradient(c.x, cy, r * 0.55, c.x, cy, r * 1.25);
    g.addColorStop(0, 'rgba(8,12,22,0)');
    g.addColorStop(1, 'rgba(8,12,22,0.62)');
    ctx.fillStyle = g;
    ctx.fillRect(left - pad, top0 - pad, right - left + pad * 2, bottom - top0 + pad * 2);
    ctx.strokeStyle = 'rgba(255,214,110,0.75)';
    ctx.lineWidth = 4;
    ctx.setLineDash([14, 10]);
    ctx.lineDashOffset = -now / 40;
    ctx.beginPath();
    ctx.ellipse(c.x, cy + 10, r * 0.62, r * 0.36, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
  }
  ctx.restore();
  if (!overview) drawBubbles(ctx, s, cam, w, h, dpr, anim);
}

// ---------------------------------------------------------------- 自社の施設の上の吹き出し

/** 2 行に分けて、吹き出しの幅をせまく */
const STOP: Record<Stop, [string, string]> = {
  gateShut: [t('関所', 'Gate'), t('通行止め', 'closed')],
  gateOpen: [t('関所', 'Gate'), t('開通', 'open')],
  noCrafter: [t('職人', 'No'), t('不在', 'crafter')],
  crafterRest: [t('職人', 'Crafter'), t('休憩中', 'resting')],
  noItem: [t('作る物', 'Nothing'), t('未定', 'to make')],
  noMats: [t('素材', 'No'), t('不足', 'materials')],
  full: [t('倉庫', 'Storage'), t('満杯', 'full')],
  noHauler: [t('運搬係', 'No'), t('不在', 'hauler')],
  noProduct: [t('商品', 'No'), t('未定', 'product')],
  noClerk: [t('店員', 'No'), t('不在', 'clerk')],
  clerkRest: [t('店員', 'Clerk'), t('休憩中', 'resting')],
  soldOut: [t('在庫', 'Sold'), t('切れ', 'out')],
};
const BUBBLE = { craft: '#6fd08c', sell: '#f2b544', error: '#e0524f', warn: '#f39a3c', info: '#7cc6f2', line: '#0f1626' };
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

function drawBubbles(ctx: CanvasRenderingContext2D, s: P1State, cam: Camera, w: number, h: number, dpr: number, anim: Anim | null) {
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
        drawRef(ctx, extImage(PRODUCT[key].ext[r]), x + pad + n2 * (icon + 2), y + pad, icon, icon);
      });
      // 製造：1 ロットの秒数で枠を分けて、進んだぶん色を付ける
      if (st.kind === 'craft' && anim) {
        const sl = s.slots.find((q) => q.running && q.sku);
        const wk = sl?.worker != null ? staffOf(s, sl.worker) : null;
        if (sl?.sku && wk && !wk.resting) {
          const sp = speed(wk, 'craft');
          const need = craftDays(s, sl.sku);
          const p = Math.min(1, (sl.progress + sp * anim.frac) / need);
          const secs = ((need / sp) * (anim.dayMs / 1000)) / Math.max(1, anim.speed);
          const parts = Math.max(1, Math.min(12, Math.round(secs)));
          drawRing(ctx, x, y, bw, bh, parts, Math.floor(p * parts + 1e-6));
        }
      }
    } else {
      // 商品の吹き出しと同じ高さで、2 行にして幅をせまく
      const lines = STOP[st.stop];
      const bh = icon0 + pad * 2;
      let fs = Math.max(8, Math.min(14, (bh - 8) / 2.3));
      ctx.font = `700 ${fs}px ${FONT}`;
      let tw = Math.max(...lines.map((l) => ctx.measureText(l).width));
      if (tw + 10 > maxW) {
        fs = Math.max(7, (fs * (maxW - 10)) / tw);
        ctx.font = `700 ${fs}px ${FONT}`;
        tw = Math.max(...lines.map((l) => ctx.measureText(l).width));
      }
      const bw = Math.max(tw + 10, bh * 0.9);
      const { x, y } = bubble(ctx, sx, sy, bw, bh, BUBBLE[st.level]);
      ctx.fillStyle = st.level === 'error' ? '#fff' : BUBBLE.line;
      ctx.textBaseline = 'middle';
      ctx.textAlign = 'center';
      const lh = fs * 1.15;
      lines.forEach((l, k) => ctx.fillText(l, x + bw / 2, y + bh / 2 + (k - 0.5) * lh + 0.5));
    }
    if (!anim) continue;
    // 吹き出しの上：工房は「＋数」、お店は売上の連なり
    const top = sy - (icon0 + pad * 2) - Math.max(4, Math.round((icon0 + pad * 2) * 0.18)) - 4;
    const fs = Math.max(11, Math.min(16, tileW * 0.15));
    for (const pl of anim.plus) {
      if (pl.uid !== b.uid) continue;
      const age = (anim.clock - pl.t) / PLUS_MS;
      if (age < 0 || age > 1) continue;
      floatText(ctx, `+${pl.n}`, sx, top - age * 18, fs + 2, '#b6ffcb', 1 - age * age);
    }
    const coins = anim.coins.get(b.uid);
    if (coins?.length) {
      const live = coins.filter((c) => anim.clock - c.t < COIN_MS).slice(-COIN_KEEP);
      // 新しいものほど下。古いものほど上で薄く
      live.forEach((c, k) => {
        const idx = live.length - 1 - k;
        const age = (anim.clock - c.t) / COIN_MS;
        const rise = Math.min(1, (anim.clock - c.t) / 180) * 6;
        const alpha = (1 - idx / COIN_KEEP) * Math.min(1, (1 - age) * 3);
        floatText(ctx, `+${c.yen.toLocaleString('en-US')} G`, sx, top - idx * (fs + 3) - rise, fs, '#ffe27a', alpha);
      });
    }
  }
  ctx.restore();
}


/** 荷車の道（工房・拠点 → お店）。道路は変わらないので覚えておく */
const tripPaths = new Map<string, [number, number][]>();
function tripPath(s: P1State, a: [number, number], b: [number, number]): [number, number][] {
  const key = `${s.seed}:${a}:${b}`;
  let p = tripPaths.get(key);
  if (!p) {
    p = roadPath(s, a, b) ?? [a, b];
    tripPaths.set(key, p);
  }
  return p;
}


// ---------------------------------------------------------------- 荒れ地（仮の絵。PixelLab で作り直す：docs/ISLAND_ART_TODO.md）

/** 荒れ地ごとの決まった乱数（同じ荒れ地はいつも同じ絵） */
function wasteRng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let x = a;
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}
/** 2 × 2 の菱形の中の点（u：右上へ・v：左下へ。0〜1） */
function wastePt(i: number, j: number, u: number, v: number) {
  const c = center(i, j);
  return { x: c.x + (u - v) * 200, y: c.y - 55 + (u + v) * 110 };
}
/**
 * 荒れ地 1 か所（2 × 2）：ひびの入った乾いた土・小石・崩れた石垣のかけら・枯れ草。
 * 発掘中は杭とロープ、掘りきった後はならした土（4 段目で建てられる土地に）。glow：発掘との出会いで光らせる
 */
function drawWaste(ctx: CanvasRenderingContext2D, s: P1State, k: number, sp: [number, number], now: number, glow: boolean) {
  const [i, j] = sp;
  const st = s.dig?.sites[k];
  const done = !!st?.done;
  const running = s.digRun?.site === k;
  const r = wasteRng(i * 131 + j * 17 + k * 7 + (s.sector ?? 'c1').charCodeAt(1) * 1009);
  const T = wastePt(i, j, 0, 0);
  const R = wastePt(i, j, 1, 0);
  const B = wastePt(i, j, 1, 1);
  const L = wastePt(i, j, 0, 1);
  const poly = (pts: { x: number; y: number }[]) => {
    ctx.beginPath();
    pts.forEach((p, n) => (n ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
    ctx.closePath();
  };
  // 地面：乾いた土（掘りきった後は明るく平らに）
  poly([T, R, B, L]);
  ctx.fillStyle = done ? '#c2a476' : '#94734a';
  ctx.fill();
  // 土のむら（明るい斑と暗い斑）
  for (let n = 0; n < 14; n++) {
    const p = wastePt(i, j, 0.1 + r() * 0.8, 0.1 + r() * 0.8);
    ctx.fillStyle = done ? (n % 2 ? 'rgba(255,240,200,0.18)' : 'rgba(120,90,50,0.15)') : n % 2 ? 'rgba(190,150,96,0.45)' : 'rgba(70,50,30,0.3)';
    ctx.beginPath();
    ctx.ellipse(p.x, p.y, 18 + r() * 30, 8 + r() * 12, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  if (done) {
    // ならした土：熊手の筋
    ctx.strokeStyle = 'rgba(120,92,56,0.45)';
    ctx.lineWidth = 3;
    for (let n = 1; n < 8; n++) {
      const a = wastePt(i, j, n / 8, 0.08);
      const b = wastePt(i, j, n / 8, 0.92);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }
  } else {
    // ひび（ジグザグの線）
    ctx.strokeStyle = 'rgba(46,30,16,0.75)';
    ctx.lineWidth = 3;
    for (let n = 0; n < 6; n++) {
      let u = 0.15 + r() * 0.7;
      let v = 0.15 + r() * 0.7;
      ctx.beginPath();
      const p0 = wastePt(i, j, u, v);
      ctx.moveTo(p0.x, p0.y);
      for (let m = 0; m < 4; m++) {
        u = Math.min(0.92, Math.max(0.08, u + (r() - 0.5) * 0.22));
        v = Math.min(0.92, Math.max(0.08, v + (r() - 0.5) * 0.22));
        const p = wastePt(i, j, u, v);
        ctx.lineTo(p.x, p.y);
      }
      ctx.stroke();
    }
    // 崩れた石垣のかけら（灰色の小さな塊）
    for (let n = 0; n < 5; n++) {
      const p = wastePt(i, j, 0.12 + r() * 0.76, 0.12 + r() * 0.76);
      const w = 14 + r() * 16;
      ctx.fillStyle = '#5e5a57';
      ctx.fillRect(Math.round(p.x - w / 2), Math.round(p.y - 9), Math.round(w), 12);
      ctx.fillStyle = '#8d8984';
      ctx.fillRect(Math.round(p.x - w / 2), Math.round(p.y - 13), Math.round(w), 5);
      ctx.fillStyle = '#2c2a28';
      ctx.fillRect(Math.round(p.x - w / 2), Math.round(p.y + 3), Math.round(w), 2);
    }
    // 小石
    for (let n = 0; n < 16; n++) {
      const p = wastePt(i, j, 0.06 + r() * 0.88, 0.06 + r() * 0.88);
      ctx.fillStyle = n % 3 ? '#b8ab98' : '#6f675d';
      ctx.fillRect(Math.round(p.x), Math.round(p.y), 5, 4);
    }
    // 枯れ草（黄土色の短い線の束）
    ctx.strokeStyle = '#c9b06a';
    ctx.lineWidth = 2;
    for (let n = 0; n < 9; n++) {
      const p = wastePt(i, j, 0.08 + r() * 0.84, 0.08 + r() * 0.84);
      for (let m = -1; m <= 1; m++) {
        ctx.beginPath();
        ctx.moveTo(p.x + m * 3, p.y);
        ctx.lineTo(p.x + m * 6, p.y - 10 - r() * 6);
        ctx.stroke();
      }
    }
  }
  // ふち（暗い土の線）
  poly([T, R, B, L]);
  ctx.strokeStyle = 'rgba(52,36,20,0.6)';
  ctx.lineWidth = 4;
  ctx.stroke();
  // 発掘中：四隅と辺の真ん中に杭、そのあいだにロープ
  if (running) {
    const posts = [0, 0.5, 1].flatMap((u) => [0, 0.5, 1].map((v) => [u, v] as [number, number])).filter(([u, v]) => u === 0 || v === 0 || u === 1 || v === 1);
    const ring: [number, number][] = [[0, 0], [0.5, 0], [1, 0], [1, 0.5], [1, 1], [0.5, 1], [0, 1], [0, 0.5]];
    const pin = (u: number, v: number) => wastePt(i, j, 0.04 + u * 0.92, 0.04 + v * 0.92);
    const rope = (color: string, w: number) => {
      ctx.strokeStyle = color;
      ctx.lineWidth = w;
      ctx.beginPath();
      ring.forEach(([u, v], n) => {
        const p = pin(u, v);
        if (n) ctx.lineTo(p.x, p.y - 26);
        else ctx.moveTo(p.x, p.y - 26);
      });
      ctx.closePath();
      ctx.stroke();
    };
    rope('#2a1a0c', 6);
    rope('#ffe9a0', 3);
    for (const [u, v] of posts) {
      const p = pin(u, v);
      ctx.fillStyle = '#2a1a0c';
      ctx.fillRect(Math.round(p.x - 5), Math.round(p.y - 36), 10, 38);
      ctx.fillStyle = '#8a5c30';
      ctx.fillRect(Math.round(p.x - 3), Math.round(p.y - 34), 6, 34);
      ctx.fillStyle = '#c98a4a';
      ctx.fillRect(Math.round(p.x - 3), Math.round(p.y - 34), 2, 34);
    }
  }
  // 発掘との出会い：金色に光らせる
  if (glow) {
    const a = 0.55 + 0.35 * Math.sin(now / 220);
    poly([T, R, B, L]);
    ctx.fillStyle = `rgba(255,214,90,${(a * 0.35).toFixed(3)})`;
    ctx.fill();
    ctx.strokeStyle = `rgba(255,214,90,${a.toFixed(3)})`;
    ctx.lineWidth = 6;
    ctx.stroke();
  }
}
/** 発掘許可の小さな旗（荒れ地の奥の角） */
function wasteFlag(ctx: CanvasRenderingContext2D, i: number, j: number, now: number) {
  const p = wastePt(i, j, 0.22, 0.22);
  const wave = Math.sin(now / 300) * 3;
  ctx.fillStyle = '#3a2a1a';
  ctx.fillRect(Math.round(p.x - 2), Math.round(p.y - 64), 4, 66);
  ctx.fillStyle = '#e94b4b';
  ctx.beginPath();
  ctx.moveTo(p.x + 2, p.y - 64);
  ctx.lineTo(p.x + 34, p.y - 54 + wave);
  ctx.lineTo(p.x + 2, p.y - 42);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#fff3d0';
  ctx.fillRect(Math.round(p.x + 9), Math.round(p.y - 57), 8, 6);
}
