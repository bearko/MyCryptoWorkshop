// 生成するドット絵の道具（docs/pixel-rules.md）。RGBA の小さなキャンバスと、色相をずらしたランプ。
import pngjs from 'pngjs';

const { PNG } = pngjs;

/** HSV（h は度、s・v は 0〜1）から RGB（0〜255） */
export function hsv(h, s, v) {
  const hh = (((h % 360) + 360) % 360) / 60;
  const i = Math.floor(hh);
  const f = hh - i;
  const p = v * (1 - s);
  const q = v * (1 - s * f);
  const t = v * (1 - s * (1 - f));
  const [r, g, b] = [
    [v, t, p],
    [q, v, p],
    [p, v, t],
    [p, q, v],
    [t, p, v],
    [v, p, q],
  ][i % 6];
  return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255), 255];
}

/**
 * 明るい → 暗いの 4 段のランプ。段ごとに色相をずらす（docs/pixel-rules.md「色」）。
 * 寒色は暗いほど青・紫へ、暖色（warm）は暗いほど赤へ寄る。index 1 が基本の色。
 */
export function ramp(h, s, v, { n = 4, warm = false, dv = 0.13, ds = 0.06 } = {}) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const k = i - 1;
    out.push(hsv(h + k * (warm ? -7 : 9), Math.min(1, Math.max(0, s + k * ds)), Math.min(1, Math.max(0, v - k * dv))));
  }
  return out;
}

export const key = (c) => `${c[0]},${c[1]},${c[2]},${c[3]}`;

export class Canvas {
  constructor(w, h) {
    this.w = w;
    this.h = h;
    this.data = new Uint8Array(w * h * 4);
  }
  get(x, y) {
    const i = (y * this.w + x) * 4;
    return [this.data[i], this.data[i + 1], this.data[i + 2], this.data[i + 3]];
  }
  put(x, y, c) {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    this.data.set(c, (y * this.w + x) * 4);
  }
  rect(x, y, w, h, c) {
    for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) this.put(xx, yy, c);
  }
  alpha(x, y) {
    return this.data[(y * this.w + x) * 4 + 3];
  }
  /** 不透明なドットだけを重ねる（半透明は使わない） */
  stamp(src, ox, oy) {
    for (let y = 0; y < src.h; y++) for (let x = 0; x < src.w; x++) if (src.alpha(x, y)) this.put(ox + x, oy + y, src.get(x, y));
  }
  /** 左右反転したコピー */
  flipped() {
    const c = new Canvas(this.w, this.h);
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) c.put(this.w - 1 - x, y, this.get(x, y));
    return c;
  }
  toPNG() {
    const png = new PNG({ width: this.w, height: this.h });
    png.data.set(this.data);
    return png;
  }
  static fromPNG(png) {
    const c = new Canvas(png.width, png.height);
    c.data.set(png.data);
    return c;
  }
}

/** 不透明なドットの外側に 1 ドットの外郭線を足す（前面の物だけに使う） */
export function outlined(layer, color) {
  const src = new Canvas(layer.w, layer.h);
  src.data.set(layer.data);
  for (let y = 0; y < layer.h; y++) {
    for (let x = 0; x < layer.w; x++) {
      if (src.alpha(x, y)) continue;
      for (const [dx, dy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ]) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx >= 0 && ny >= 0 && nx < layer.w && ny < layer.h && src.alpha(nx, ny) && key(src.get(nx, ny)) !== key(color)) {
          layer.put(x, y, color);
          break;
        }
      }
    }
  }
  return layer;
}

/** 決まった種から同じ並びを出す乱数（mulberry32） */
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
