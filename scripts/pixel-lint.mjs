#!/usr/bin/env node
// 生成したドット絵の自動検査（docs/pixel-rules.md「検査のしきい値」）。
//   npm run pixel:lint          # public/empire/ の絵（npm run sync-assets で作る）
// 1 つでも失敗があれば終了コード 1。
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import pngjs from 'pngjs';
import { Canvas, key } from './pixel/core.mjs';
import { OUTLINE, PALETTE } from './pixel/palette.mjs';

const { PNG } = pngjs;
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const lum = (c) => (0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]) / 255;
const same = (a, b) => a[0] === b[0] && a[1] === b[1] && a[2] === b[2] && a[3] === b[3];
const OUT = key(OUTLINE);

function crop(src, x, y, w, h) {
  const c = new Canvas(w, h);
  for (let yy = 0; yy < h; yy++) for (let xx = 0; xx < w; xx++) c.put(xx, yy, src.get(x + xx, y + yy));
  return c;
}

const opaque = (c, x, y) => x >= 0 && y >= 0 && x < c.w && y < c.h && c.alpha(x, y) > 0;

export function colorsOf(c) {
  const s = new Set();
  for (let y = 0; y < c.h; y++) for (let x = 0; x < c.w; x++) if (c.alpha(x, y)) s.add(key(c.get(x, y)));
  return s;
}

export function orphans(c) {
  let n = 0;
  for (let y = 0; y < c.h; y++) {
    for (let x = 0; x < c.w; x++) {
      if (!c.alpha(x, y)) continue;
      const p = c.get(x, y);
      let alone = true;
      for (let dy = -1; dy <= 1 && alone; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue;
          if (opaque(c, x + dx, y + dy) && same(c.get(x + dx, y + dy), p)) {
            alone = false;
            break;
          }
        }
      }
      if (alone) n++;
    }
  }
  return n;
}

/** 1 ドットの高さの帯が 2 本、同じ長さ（3 以上）で上下に重なっている組の数 */
export function banding(c) {
  const runs = (y) => {
    const out = [];
    let x = 0;
    while (x < c.w) {
      if (!c.alpha(x, y) || key(c.get(x, y)) === OUT) {
        x++;
        continue;
      }
      const p = c.get(x, y);
      let e = x;
      while (e + 1 < c.w && c.alpha(e + 1, y) && same(c.get(e + 1, y), p)) e++;
      if (e - x + 1 >= 3) out.push({ x, e, p });
      x = e + 1;
    }
    return out;
  };
  const strip = (y, r) => {
    for (const yy of [y - 1, y + 1]) {
      if (yy < 0 || yy >= c.h) continue;
      for (let x = r.x; x <= r.e; x++) if (c.alpha(x, yy) && same(c.get(x, yy), r.p)) return false;
    }
    return true;
  };
  let n = 0;
  for (let y = 0; y + 1 < c.h; y++) {
    const below = runs(y + 1);
    for (const r of runs(y)) {
      const m = below.find((b) => b.x === r.x && b.e === r.e && !same(b.p, r.p));
      if (m && strip(y, r) && strip(y + 1, m)) n++;
    }
  }
  return n;
}

/** 外形の段差で「長・短・長」（差が 2 以上）になっているところの数 */
export function jaggies(c) {
  const profiles = [];
  const top = [];
  const bottom = [];
  for (let x = 0; x < c.w; x++) {
    let t = -1;
    let b = -1;
    for (let y = 0; y < c.h; y++) if (c.alpha(x, y)) (t < 0 && (t = y), (b = y));
    top.push(t);
    bottom.push(b);
  }
  const left = [];
  const right = [];
  for (let y = 0; y < c.h; y++) {
    let l = -1;
    let r = -1;
    for (let x = 0; x < c.w; x++) if (c.alpha(x, y)) (l < 0 && (l = x), (r = x));
    left.push(l);
    right.push(r);
  }
  profiles.push(top, bottom, left, right);
  let n = 0;
  for (const prof of profiles) {
    // 段：同じ高さが続く長さと、その高さ。1 ドットずつ同じ向きに下がる（上がる）坂の中だけを見る
    const steps = [];
    for (const v of prof) {
      const last = steps[steps.length - 1];
      if (last && last.v === v) last.len++;
      else steps.push({ v, len: 1 });
    }
    for (let i = 1; i + 1 < steps.length; i++) {
      const [a, b, d] = [steps[i - 1], steps[i], steps[i + 1]];
      if (a.v < 0 || b.v < 0 || d.v < 0) continue;
      const d1 = b.v - a.v;
      const d2 = d.v - b.v;
      if (Math.abs(d1) !== 1 || d1 !== d2) continue;
      if (b.len <= a.len - 2 && b.len <= d.len - 2) n++;
    }
  }
  return n;
}

/** 明るさの差が大きい 2 色の市松の数 */
export function harshDither(c) {
  let n = 0;
  for (let y = 0; y + 1 < c.h; y++) {
    for (let x = 0; x + 1 < c.w; x++) {
      if (!(c.alpha(x, y) && c.alpha(x + 1, y) && c.alpha(x, y + 1) && c.alpha(x + 1, y + 1))) continue;
      const a = c.get(x, y);
      const b = c.get(x + 1, y);
      if (same(a, b) || !same(a, c.get(x + 1, y + 1)) || !same(b, c.get(x, y + 1))) continue;
      if (Math.abs(lum(a) - lum(b)) > 0.25) n++;
    }
  }
  return n;
}

export function perimeterNonOutline(c) {
  let total = 0;
  let bad = 0;
  for (let y = 0; y < c.h; y++) {
    for (let x = 0; x < c.w; x++) {
      if (!c.alpha(x, y)) continue;
      const edge = !opaque(c, x + 1, y) || !opaque(c, x - 1, y) || !opaque(c, x, y + 1) || !opaque(c, x, y - 1);
      if (!edge) continue;
      total++;
      if (key(c.get(x, y)) !== OUT) bad++;
    }
  }
  return total ? bad / total : 0;
}

export function contrastRange(c) {
  const ls = [];
  for (let y = 0; y < c.h; y++) for (let x = 0; x < c.w; x++) if (c.alpha(x, y)) ls.push(lum(c.get(x, y)));
  ls.sort((a, b) => a - b);
  return ls[Math.floor(ls.length * 0.95)] - ls[Math.floor(ls.length * 0.05)];
}

function semiAlpha(c) {
  for (let i = 3; i < c.data.length; i += 4) if (c.data[i] !== 0 && c.data[i] !== 255) return true;
  return false;
}

/** 1 枚の絵を検査し、失敗した ID と中身を返す */
export function lint(c, kind) {
  const fails = [];
  const colors = colorsOf(c);
  const opaqueCount = [...Array(c.w * c.h).keys()].filter((i) => c.data[i * 4 + 3]).length;
  if (kind !== 'bg') {
    const off = [...colors].filter((k) => !PALETTE.has(k)).length;
    if (off) fails.push(`palette（パレット外の色 ${off}）`);
  }
  if (colors.size > (kind === 'bg' ? 24 : 32)) fails.push(`colors（${colors.size} 色）`);
  if (semiAlpha(c)) fails.push('alpha（半透明のドット）');
  if (kind === 'fg') {
    const r = perimeterNonOutline(c);
    if (r > 0.02) fails.push(`outline（外周の ${Math.round(r * 100)}% が外郭線でない）`);
    const j = jaggies(c);
    if (j > 3) fails.push(`jaggy（${j} か所）`);
  }
  const o = orphans(c);
  if (o > opaqueCount * 0.01) fails.push(`orphan（${o}）`);
  const b = banding(c);
  if (b > 4) fails.push(`banding（${b} 組）`);
  const d = harshDither(c);
  if (d > 2) fails.push(`dither（${d}）`);
  if (kind === 'bg') {
    const r = contrastRange(c);
    if (r > 0.45) fails.push(`bg-contrast（${Math.round(r * 100)}%）`);
  }
  if (kind === 'tile') {
    const big = new Canvas(c.w * 2, c.h * 2);
    for (const [ox, oy] of [
      [0, 0],
      [c.w, 0],
      [0, c.h],
      [c.w, c.h],
    ])
      big.stamp(c, ox, oy);
    if (orphans(big) > o * 4 || banding(big) > b * 4) fails.push('seam（つなぎ目にノイズ）');
  }
  return fails;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  let manifest;
  try {
    manifest = JSON.parse(readFileSync(join(root, 'src/generated/empire.json'), 'utf8'));
  } catch {
    console.error('src/generated/empire.json がありません。先に npm run sync-assets を実行してください');
    process.exit(1);
  }
  const load = (url) => Canvas.fromPNG(PNG.sync.read(readFileSync(join(root, 'public', url))));
  const sheet = load(manifest.sheet);
  const rows = [];
  for (const [name, s] of Object.entries(manifest.sprites)) rows.push([name, s.kind, lint(crop(sheet, s.x, s.y, s.w, s.h), s.kind)]);
  for (const [land, url] of Object.entries(manifest.backgrounds)) rows.push([`bg-${land}`, 'bg', lint(load(url), 'bg')]);
  let failed = 0;
  for (const [name, kind, fails] of rows) {
    if (fails.length) failed++;
    console.log(`${fails.length ? '✗' : '✓'} ${name.padEnd(16)} ${kind.padEnd(4)} ${fails.join('、')}`);
  }
  console.log(`${rows.length} 枚中 ${failed} 枚が失敗`);
  process.exitCode = failed ? 1 : 0;
}
