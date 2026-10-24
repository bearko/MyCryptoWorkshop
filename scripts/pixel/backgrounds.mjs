// ランドの背景（MCH の Image/Backgrounds/2105〜2905、1000×1500 の塗りの絵）をドット絵の背景にする。
// 地平線の帯を切り出す → 1/3 に縮小 → 平均色へ 45% 寄せてコントラストを下げる →
// 12 色に減色（ディザなし）→ 1 ドットの点を消す。320×256 を 2 倍で表示する（docs/design.md 4 章）。
import { Canvas } from './core.mjs';

export const LAND_BACKGROUNDS = { Ocean: 2105, Strawberry: 2205, Tangerine: 2301, Lime: 2405, Graphite: 2505, Grape: 2605, Sage: 2705, Blueberry: 2805, Ruby: 2905 };

function downscale3(png) {
  const w = Math.floor(png.width / 3);
  const h = Math.floor(png.height / 3);
  const out = new Float32Array(w * h * 3);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let r = 0;
      let g = 0;
      let b = 0;
      for (let dy = 0; dy < 3; dy++) {
        for (let dx = 0; dx < 3; dx++) {
          const i = ((y * 3 + dy) * png.width + x * 3 + dx) * 4;
          r += png.data[i];
          g += png.data[i + 1];
          b += png.data[i + 2];
        }
      }
      out.set([r / 9, g / 9, b / 9], (y * w + x) * 3);
    }
  }
  return { w, h, px: out };
}

/** メディアンカット（ディザなし） */
function medianCut(pixels, colors) {
  let boxes = [pixels];
  while (boxes.length < colors) {
    let best = -1;
    let bestRange = -1;
    let ch = 0;
    boxes.forEach((b, i) => {
      if (b.length < 2) return;
      for (let c = 0; c < 3; c++) {
        let lo = 255;
        let hi = 0;
        for (const p of b) {
          lo = Math.min(lo, p[c]);
          hi = Math.max(hi, p[c]);
        }
        if (hi - lo > bestRange) {
          bestRange = hi - lo;
          best = i;
          ch = c;
        }
      }
    });
    if (best < 0) break;
    const b = boxes[best].sort((p, q) => p[ch] - q[ch]);
    const mid = b.length >> 1;
    boxes.splice(best, 1, b.slice(0, mid), b.slice(mid));
  }
  return boxes.map((b) => {
    const s = [0, 0, 0];
    for (const p of b) for (let c = 0; c < 3; c++) s[c] += p[c];
    return s.map((v) => Math.round(v / b.length));
  });
}

/** まわりで 3 回以上出る色に寄せる（それ以外はそのまま）。1 ドットの点を消す */
function modeFilter(c) {
  const out = new Canvas(c.w, c.h);
  out.data.set(c.data);
  for (let y = 1; y < c.h - 1; y++) {
    for (let x = 1; x < c.w - 1; x++) {
      const counts = new Map();
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const k = c.get(x + dx, y + dy).join(',');
          counts.set(k, (counts.get(k) ?? 0) + 1);
        }
      }
      let bestK = null;
      let bestN = 2;
      for (const [k, n] of counts) {
        if (n > bestN) {
          bestN = n;
          bestK = k;
        }
      }
      if (bestK) out.put(x, y, bestK.split(',').map(Number));
    }
  }
  return out;
}

export function landBackground(png, { w = 320, h = 256, top = 200, colors = 12, flatten = 0.45 } = {}) {
  const small = downscale3(png);
  const x0 = Math.floor((small.w - w) / 2);
  const band = [];
  const mean = [0, 0, 0];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = ((top + y) * small.w + x0 + x) * 3;
      const p = [small.px[i], small.px[i + 1], small.px[i + 2]];
      band.push(p);
      for (let c = 0; c < 3; c++) mean[c] += p[c];
    }
  }
  for (let c = 0; c < 3; c++) mean[c] /= band.length;
  const soft = band.map((p) => p.map((v, c) => v * (1 - flatten) + mean[c] * flatten));
  const pal = medianCut(
    soft.map((p) => p.slice()),
    colors,
  );
  const out = new Canvas(w, h);
  soft.forEach((p, i) => {
    let best = pal[0];
    let bd = Infinity;
    for (const q of pal) {
      const d = (p[0] - q[0]) ** 2 + (p[1] - q[1]) ** 2 + (p[2] - q[2]) ** 2;
      if (d < bd) {
        bd = d;
        best = q;
      }
    }
    out.put(i % w, Math.floor(i / w), [...best, 255]);
  });
  return modeFilter(modeFilter(out));
}
