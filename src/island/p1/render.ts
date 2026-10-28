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
import { COIN_KEEP, COIN_MS, PLUS_MS, along, drawRing, drawWalker, floatText, type Anim } from './anim';
import { craftDays, doorOf, facilityStatus, ground, isRoad, myWorkshop, reach, roadPath, speed, staffOf, type P1State, type Stop } from './model';

export interface P1Ghost {
  id: string;
  i: number;
  j: number;
  dir: Dir;
  ok: boolean;
  /** お店を置くとき：商圏（近いマスほど濃く） */
  area?: boolean;
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

export function drawP1(ctx: CanvasRenderingContext2D, s: P1State, cam: Camera, w: number, h: number, dpr: number, now: number, fx: Effect[], ghost: P1Ghost | null, selected: number | null, cell: [number, number] | null = null, placeable: Set<number> | null = null, anim: Anim | null = null) {
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
  const ws = myWorkshop(s);
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
  if (anim) {
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
  drawBubbles(ctx, s, cam, w, h, dpr, anim);
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
        drawRef(ctx, getExtension(PRODUCT[key].ext[r]).image, x + pad + n2 * (icon + 2), y + pad, icon, icon);
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
