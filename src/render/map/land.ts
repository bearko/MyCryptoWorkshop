// 国（ランド）の画面：ランドの背景の上に、エリアを浮いた板として並べる（docs/EMPIRE_DESIGN.md 10.1）。
// 板の大きさがレアリティ、上面は区画の略図（自社＝青緑、ライバル＝赤、他社＝灰、空き＝生成り）。
import empire from '../../generated/empire.json';
import { img, ready } from '../images';
import { landBackground, sectorIcon } from '../pixel';
import { css } from './grid';
import type { MapScene, MapTarget } from './view';

type RGBA = number[];
const P = empire.palette as unknown as Record<string, RGBA[]> & { outline: RGBA };

/** レアリティごとの広さ（マス）。docs/EMPIRE_DESIGN.md 10.1 */
export const SECTOR_SIZE = [
  [10, 8],
  [14, 11],
  [17, 14],
  [20, 17],
  [23, 20],
] as const;
/** 略図の 1 マスのドット数 */
const PX = 6;

/** 11 エリアの板の位置（絵の座標の左上、640×512 の中）。並びは nation.ts の REGION_NAMES と同じ */
export const PLATE_POS: [number, number][] = [
  [40, 410],
  [40, 310],
  [160, 330],
  [556, 190],
  [258, 26],
  [40, 208],
  [270, 378],
  [60, 44],
  [470, 300],
  [452, 40],
  [250, 166],
];

export interface PlateData {
  rarity: number;
  own: number;
  rival: number;
  capacity: number;
  hub: boolean;
  locked: boolean;
}

const LAND_COLOR: Record<string, string> = {
  Ocean: '#00d9d5',
  Strawberry: '#ff80b5',
  Tangerine: '#ff9407',
  Lime: '#7fbf00',
  Graphite: '#737373',
  Grape: '#7e2ebd',
  Sage: '#00735a',
  Blueberry: '#3071f2',
  Ruby: '#d00013',
};

const mix = (a: number[], b: number[], t: number) => a.map((v, i) => Math.round(v * (1 - t) + b[i] * t));
const hex = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));

/** 決まった種から同じ並びを出す乱数（板の略図が月ごとに揺れないように） */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 板の上面の略図（自社・ライバル・空きの区画を、ブロックごとにまとめて塗る） */
function schematic(p: PlateData, seed: number): HTMLCanvasElement {
  const [w, h] = SECTOR_SIZE[p.rarity];
  const c = document.createElement('canvas');
  c.width = w * PX;
  c.height = h * PX;
  const g = c.getContext('2d')!;
  g.fillStyle = css(P.grass[1]);
  g.fillRect(0, 0, c.width, c.height);
  const r = rng(seed * 7919 + 13);
  // 区画になるマス（外周の木を除いた内側の 6 割）
  const inner: number[] = [];
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) inner.push(y * w + x);
  const lots = inner.filter(() => r() < 0.6);
  // ブロック（3×3）ごとに持ち主を寄せる：自社のブロックを先に、ライバルを奥から
  const total = Math.max(p.capacity, p.own + p.rival, 1);
  const nOwn = Math.round((lots.length * p.own) / total);
  const nRival = Math.round((lots.length * p.rival) / total);
  const block = (i: number) => Math.floor((i % w) / 3) + Math.floor(i / w / 3) * 100;
  const byBlock = [...lots].sort((a, b) => block(a) - block(b) || a - b);
  const owner = new Map<number, string>();
  byBlock.slice(0, nOwn).forEach((i) => owner.set(i, 'ours'));
  byBlock
    .slice(-nRival || byBlock.length)
    .slice(0, nRival)
    .forEach((i) => owner.set(i, 'rival'));
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const edge = x === 0 || y === 0 || x === w - 1 || y === h - 1;
      let col: RGBA | null = null;
      if (edge) col = P.grass[2];
      else if (owner.get(i) === 'ours') col = P.ours[1];
      else if (owner.get(i) === 'rival') col = P.rival[1];
      else if (lots.includes(i)) col = r() < 0.35 ? P.neutral[1] : P.plaza[1];
      else col = r() < 0.5 ? P.wall[2] : null;
      if (!col) continue;
      g.fillStyle = css(col);
      g.fillRect(x * PX + 1, y * PX + 1, PX - 2, PX - 2);
    }
  }
  // 3×3 ブロックの境の道
  g.fillStyle = css(P.road[1]);
  for (let x = 4; x < w - 1; x += 3) g.fillRect(x * PX - 1, PX, 2, (h - 2) * PX);
  for (let y = 4; y < h - 1; y += 3) g.fillRect(PX, y * PX - 1, (w - 2) * PX, 2);
  return c;
}

export class LandScene implements MapScene {
  readonly width = 640;
  readonly height = 512;
  selected: number | null = null;
  private tops: HTMLCanvasElement[];

  constructor(
    readonly land: string,
    readonly plates: PlateData[],
  ) {
    this.tops = plates.map((p, i) => schematic(p, i + 1));
  }

  pending(): boolean {
    return !ready(landBackground(this.land)) || !ready(img(sectorIcon(this.land, 4)));
  }

  /** 板の範囲（略図＋縁＋厚み） */
  plateRect(i: number) {
    const [w, h] = SECTOR_SIZE[this.plates[i].rarity];
    const [x, y] = PLATE_POS[i];
    return { x, y, w: w * PX + 2, h: h * PX + 2 + this.depth(i) };
  }

  private depth(i: number) {
    return 4 + 2 * this.plates[i].rarity;
  }

  drawSurround(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
    ctx.fillStyle = '#241B2A';
    ctx.fillRect(x, y, w, h);
  }

  drawStatic(ctx: CanvasRenderingContext2D): void {
    const bg = landBackground(this.land);
    if (ready(bg)) ctx.drawImage(bg, 0, 0, 320, 256, 0, 0, 640, 512);
    ctx.fillStyle = 'rgba(25,22,40,0.30)';
    ctx.fillRect(0, 0, 640, 512);
    const lc = hex(LAND_COLOR[this.land] ?? LAND_COLOR.Ocean);
    const face = [0.85, 0.65, 0.45].map((t) => mix([40, 40, 48], lc, t));
    // 奥（上）の板から順に
    const order = this.plates.map((_, i) => i).sort((a, b) => PLATE_POS[a][1] - PLATE_POS[b][1]);
    for (const i of order) {
      const p = this.plates[i];
      const { x, y } = this.plateRect(i);
      const top = this.tops[i];
      const d = this.depth(i);
      const w = top.width + 2;
      const h = top.height + 2;
      // 影（板が浮いている）
      ctx.fillStyle = 'rgba(12,10,24,0.45)';
      ctx.fillRect(x + 8, y + 12, w + 2, h + d + 2);
      // 外郭線
      ctx.fillStyle = css(P.outline);
      ctx.fillRect(x - 1, y - 1, w + 2, h + d + 2);
      // 厚み（ランドの色）
      ctx.fillStyle = `rgb(${face[1].join(',')})`;
      ctx.fillRect(x, y + h, w, d);
      ctx.fillStyle = `rgb(${face[0].join(',')})`;
      ctx.fillRect(x, y + h, w, 2);
      ctx.fillStyle = `rgb(${face[2].join(',')})`;
      ctx.fillRect(x, y + h + d - 2, w, 2);
      // 縁（左上が明るい）
      ctx.fillStyle = css(P.wall[0]);
      ctx.fillRect(x, y, w, h);
      ctx.fillStyle = css(P.wall[2]);
      ctx.fillRect(x + w - 2, y + 1, 2, h - 1);
      ctx.fillRect(x + 1, y + h - 2, w - 1, 2);
      ctx.drawImage(top, x + 1, y + 1);
      if (p.locked) {
        ctx.fillStyle = 'rgba(25,22,40,0.55)';
        ctx.fillRect(x, y, w, h + d);
        lock(ctx, x + Math.floor(w / 2) - 7, y + Math.floor(h / 2) - 8);
      }
      if (p.hub) flag(ctx, x + w - 12, y - 10);
    }
    // Legendary のアイコン（板の左上に掛ける）
    const li = this.plates.findIndex((p) => p.rarity === 4);
    const icon = img(sectorIcon(this.land, 4));
    if (li >= 0 && ready(icon)) {
      const { x, y } = this.plateRect(li);
      ctx.fillStyle = css(P.outline);
      ctx.fillRect(x - 27, y - 27, 66, 66);
      ctx.drawImage(icon, x - 26, y - 26, 64, 64);
    }
  }

  drawDynamic(ctx: CanvasRenderingContext2D, _t: number, hover: MapTarget | null): void {
    if (hover) ring(ctx, hover, 'rgba(244,235,221,0.95)', 2);
    if (this.selected !== null) {
      const r = { ...this.plateRect(this.selected), kind: 'region', id: this.selected };
      ring(ctx, { ...r, x: r.x - 3, y: r.y - 3, w: r.w + 6, h: r.h + 6 }, css(P.outline), 1);
      ring(ctx, { ...r, x: r.x - 2, y: r.y - 2, w: r.w + 4, h: r.h + 4 }, '#F2B544', 3);
    }
  }

  hitNear(x: number, y: number, r: number): MapTarget | null {
    let best: MapTarget | null = null;
    let bd = r;
    this.plates.forEach((_, i) => {
      const p = this.plateRect(i);
      const dx = Math.max(p.x - x, 0, x - (p.x + p.w));
      const dy = Math.max(p.y - y, 0, y - (p.y + p.h));
      const d = Math.hypot(dx, dy);
      if (d <= bd) {
        bd = d;
        best = { kind: 'region', id: i, ...p };
      }
    });
    return best;
  }

  hit(x: number, y: number): MapTarget | null {
    // 手前（下）の板から
    const order = this.plates.map((_, i) => i).sort((a, b) => PLATE_POS[b][1] - PLATE_POS[a][1]);
    for (const i of order) {
      const r = this.plateRect(i);
      if (x >= r.x && y >= r.y && x < r.x + r.w && y < r.y + r.h) return { kind: 'region', id: i, ...r };
    }
    return null;
  }
}

function ring(ctx: CanvasRenderingContext2D, r: { x: number; y: number; w: number; h: number }, color: string, t: number): void {
  ctx.fillStyle = color;
  ctx.fillRect(r.x, r.y, r.w, t);
  ctx.fillRect(r.x, r.y + r.h - t, r.w, t);
  ctx.fillRect(r.x, r.y, t, r.h);
  ctx.fillRect(r.x + r.w - t, r.y, t, r.h);
}

/** 錠前（まだ入れないエリア） */
function lock(ctx: CanvasRenderingContext2D, x: number, y: number): void {
  ctx.fillStyle = '#181818';
  ctx.fillRect(x + 2, y, 10, 8);
  ctx.fillRect(x, y + 6, 14, 11);
  ctx.fillStyle = '#F2B544';
  ctx.fillRect(x + 4, y + 2, 6, 5);
  ctx.fillStyle = '#181818';
  ctx.fillRect(x + 5, y + 3, 4, 4);
  ctx.fillStyle = '#F2B544';
  ctx.fillRect(x + 1, y + 7, 12, 9);
  ctx.fillStyle = '#181818';
  ctx.fillRect(x + 6, y + 10, 2, 4);
}

/** 物流拠点の旗（自社の色） */
function flag(ctx: CanvasRenderingContext2D, x: number, y: number): void {
  ctx.fillStyle = '#181818';
  ctx.fillRect(x, y, 2, 14);
  ctx.fillRect(x + 1, y - 1, 10, 8);
  ctx.fillStyle = css(P.ours[1]);
  ctx.fillRect(x + 2, y, 8, 6);
  ctx.fillStyle = css(P.ours[0]);
  ctx.fillRect(x + 2, y, 8, 1);
}
