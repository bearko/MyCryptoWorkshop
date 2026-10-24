// エクステンションにない物の絵（docs/design.md 4 章）。64px のマスが基準、光源は左上。
// 地形（kind: tile）は背景として輪郭線なし・低コントラスト。建物や車（kind: fg）はほぼ黒の外郭線。
import { Canvas, outlined } from './core.mjs';
import { OUTLINE, PAL, SKIN } from './palette.mjs';

const T = 64;

function grass(seed) {
  const c = new Canvas(T, T);
  const g = PAL.grass;
  c.rect(0, 0, T, T, g[1]);
  // 様式的な草のしるし（明るい段の小さな「v」）。規則的にまばらに置く
  [
    [9, 11],
    [37, 7],
    [22, 31],
    [51, 27],
    [6, 47],
    [41, 50],
    [27, 57],
  ].forEach(([tx, ty], i) => {
    if ((i + seed) % 3 === 0) return;
    const x = (tx + seed * 5) % 60;
    const y = (ty + seed * 3) % 60;
    c.put(x, y, g[0]);
    c.put(x + 2, y, g[0]);
    c.put(x + 1, y + 1, g[0]);
  });
  return c;
}

function plaza() {
  const c = new Canvas(T, T);
  const p = PAL.plaza;
  c.rect(0, 0, T, T, p[1]);
  for (let y = 0; y < T; y += 8) {
    for (let x = 0; x < T; x += 16) c.rect((x + ((y / 8) % 2 ? 8 : 0)) % T, y, 1, 8, p[2]);
    c.rect(0, y, T, 1, p[2]);
  }
  return c;
}

function field() {
  const c = new Canvas(T, T);
  const f = PAL.field;
  c.rect(0, 0, T, T, PAL.grass[1]);
  c.rect(4, 6, 56, 52, f[2]);
  for (let y = 8; y < 56; y += 6) {
    c.rect(6, y, 52, 3, f[1]);
    c.rect(6, y, 52, 1, f[0]);
  }
  return c;
}

function water(seed) {
  const c = new Canvas(T, T);
  const w = PAL.water;
  c.rect(0, 0, T, T, w[1]);
  [
    [6, 8],
    [34, 14],
    [18, 30],
    [46, 38],
    [8, 52],
    [38, 56],
  ].forEach(([tx, ty]) => {
    const x = (tx + seed * 7) % 56;
    c.rect(x, ty, 6, 1, w[0]);
    c.rect(x + 2, ty - 1, 3, 1, w[0]);
  });
  return c;
}

function sand() {
  const c = new Canvas(T, T);
  const s = PAL.sand;
  c.rect(0, 0, T, T, s[1]);
  for (let i = 0; i < 9; i++) {
    const x = (i * 23 + 5) % 60;
    const y = (i * 17 + 9) % 60;
    c.rect(x, y, 2, 1, s[0]);
  }
  return c;
}

function tree(big) {
  const r = big ? 11 : 8;
  const L = new Canvas(2 * r + 4, 2 * r + 12);
  const cx = r + 2;
  const cy = r + 2;
  const F = PAL.leaf;
  const B = PAL.trunk;
  L.rect(cx - 1, cy + r - 2, 3, 9, B[1]);
  L.rect(cx + 1, cy + r - 2, 1, 9, B[2]);
  for (let y = -r; y <= r; y++) {
    for (let x = -r; x <= r; x++) {
      if (x * x + y * y > r * r + Math.floor(r / 2)) continue;
      const d = (x + r * 0.45) ** 2 + (y + r * 0.45) ** 2;
      L.put(cx + x, cy + y, d < (r * 0.55) ** 2 ? F[0] : x + y > r * 0.55 ? F[2] : F[1]);
    }
  }
  return outlined(L, OUTLINE);
}

function station() {
  const L = new Canvas(122, 50);
  const x0 = 1;
  const y0 = 5;
  const R = PAL.roofC;
  const W = PAL.wall;
  const G = PAL.glass;
  L.rect(x0 + 10, y0, 100, 14, R[1]);
  L.rect(x0 + 10, y0, 100, 1, R[0]);
  L.rect(x0 + 10, y0, 1, 14, R[0]);
  L.rect(x0 + 108, y0 + 1, 2, 13, R[2]);
  L.rect(x0 + 10, y0 + 13, 100, 1, R[3]);
  L.rect(x0 + 48, 1, 24, 6, R[1]);
  L.rect(x0 + 48, 1, 24, 1, R[0]);
  L.rect(x0 + 57, 2, 6, 4, W[0]);
  L.put(x0 + 60, 3, OUTLINE);
  L.put(x0 + 60, 4, OUTLINE);
  const wy = y0 + 14;
  L.rect(x0 + 10, wy, 100, 24, W[1]);
  L.rect(x0 + 10, wy, 1, 24, W[0]);
  L.rect(x0 + 108, wy, 2, 24, W[2]);
  L.rect(x0 + 10, wy + 23, 100, 1, W[3]);
  for (let i = 0; i < 5; i++) {
    const ax = x0 + 16 + i * 18;
    L.rect(ax, wy + 6, 12, 17, W[3]);
    L.rect(ax + 1, wy + 7, 10, 16, G[1]);
    L.rect(ax + 1, wy + 7, 10, 1, G[0]);
  }
  L.rect(x0, y0 + 6, 10, 2, R[2]);
  L.rect(x0 + 110, y0 + 6, 10, 2, R[2]);
  return outlined(L, OUTLINE);
}

/** 物流センター（2 マス幅）。社名の帯は自社の色 */
function hub(w = 112) {
  const L = new Canvas(w + 2, 46);
  const x0 = 1;
  const y0 = 2;
  const R = PAL.roofB;
  const W = PAL.wall;
  const O = PAL.ours;
  L.rect(x0, y0, w, 14, R[1]);
  L.rect(x0, y0, w, 1, R[0]);
  L.rect(x0, y0, 1, 14, R[0]);
  L.rect(x0 + w - 2, y0 + 1, 2, 13, R[2]);
  for (let xx = x0 + 4; xx < x0 + w - 2; xx += 6) L.rect(xx, y0 + 2, 1, 11, R[2]);
  L.rect(x0, y0 + 13, w, 1, R[3]);
  const wy = y0 + 14;
  L.rect(x0, wy, w, 28, W[1]);
  L.rect(x0, wy, 1, 28, W[0]);
  L.rect(x0 + w - 2, wy, 2, 28, W[2]);
  L.rect(x0, wy + 27, w, 1, W[3]);
  L.rect(x0, wy + 2, w, 4, O[1]);
  L.rect(x0, wy + 5, w, 1, O[2]);
  const bays = Math.max(1, Math.floor((w - 8) / 34));
  for (let i = 0; i < bays; i++) {
    const bx = x0 + 6 + i * 34;
    L.rect(bx, wy + 9, 24, 18, W[3]);
    for (let yy = wy + 10; yy < wy + 26; yy += 3) L.rect(bx + 1, yy, 22, 2, W[2]);
  }
  return outlined(L, OUTLINE);
}

function truck() {
  const L = new Canvas(22, 13);
  const O = PAL.ours;
  const W = PAL.wall;
  L.rect(1, 1, 13, 8, W[0]);
  L.rect(1, 6, 13, 3, O[1]);
  L.rect(13, 1, 1, 8, W[2]);
  L.rect(14, 3, 6, 6, O[1]);
  L.rect(15, 4, 3, 2, PAL.glass[0]);
  L.rect(19, 3, 1, 6, O[2]);
  L.rect(3, 9, 3, 3, OUTLINE);
  L.rect(15, 9, 3, 3, OUTLINE);
  return outlined(L, OUTLINE);
}

function walker(i) {
  const L = new Canvas(5, 9);
  const shirts = [PAL.ours[0], PAL.roofA[1], PAL.roofB[0], PAL.rival[0]];
  L.rect(1, 1, 3, 3, SKIN);
  L.rect(1, 4, 3, 3, shirts[i % 4]);
  L.rect(1, 7, 1, 1, OUTLINE);
  L.rect(3, 7, 1, 1, OUTLINE);
  return outlined(L, OUTLINE);
}

function boat() {
  const L = new Canvas(22, 14);
  L.rect(10, 1, 1, 8, PAL.trunk[2]);
  L.rect(11, 1, 6, 6, PAL.wall[0]);
  L.rect(16, 2, 1, 5, PAL.wall[2]);
  L.rect(2, 9, 18, 3, PAL.ours[1]);
  L.rect(4, 11, 14, 1, PAL.ours[2]);
  return outlined(L, OUTLINE);
}

/** 生成する絵の一覧。kind は検査の種類（docs/pixel-rules.md） */
export function sprites() {
  const list = [];
  const add = (name, canvas, kind) => list.push({ name, canvas, kind });
  for (let s = 0; s < 5; s++) add(`grass${s}`, grass(s), 'tile');
  add('plaza', plaza(), 'tile');
  add('field', field(), 'tile');
  for (let s = 0; s < 4; s++) add(`water${s}`, water(s), 'tile');
  add('sand', sand(), 'tile');
  add('treeS', tree(false), 'fg');
  add('treeL', tree(true), 'fg');
  add('station', station(), 'fg');
  add('hub', hub(112), 'fg');
  add('hubS', hub(58), 'fg');
  add('truck', truck(), 'fg');
  add('truckL', truck().flipped(), 'fg');
  for (let i = 0; i < 4; i++) add(`walker${i}`, walker(i), 'fg');
  add('boat', boat(), 'fg');
  return list;
}
