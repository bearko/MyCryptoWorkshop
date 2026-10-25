// 町とエリアの地図（64px のマスの格子）。区画にエクステンションを原寸で置き、舗装の縁の色で持ち主を示す
// （docs/EMPIRE_DESIGN.md 10.3）。外周は木、ブロックのあいだに細い道。
import empire from '../../generated/empire.json';
import { drawExtension, drawSprite, extensionRef, spriteSize, type EmpireSprite } from '../pixel';
import { fileOf, img, ready } from '../images';
import type { MapScene, MapTarget } from './view';

export const TILE = 64;
type RGBA = number[];
const P = empire.palette as unknown as Record<string, RGBA[]> & { outline: RGBA };
export const css = (c: RGBA, a = 1) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;

export type Ground = 'grass' | 'plaza' | 'field' | 'water' | 'sand';
export type Owner = 'ours' | 'rival' | 'neutral' | 'free';

export interface GridCell {
  ground: Ground;
  /** 舗装した区画（縁の色が持ち主） */
  lot?: Owner;
  /** 区画に置くエクステンション */
  ext?: number;
  /** 生成した物（木・小さな物流センター） */
  obj?: 'treeS' | 'treeL' | 'hubS';
  /** 押せる区画（場面の外での呼び名） */
  target?: { kind: string; id: number };
}

/** 区画ごとの印（毎フレーム重ねる） */
export interface CellMarks {
  selected?: boolean;
  planned?: 'open' | 'center';
  /** 出店の予定のときに薄く見せる絵 */
  ghostExt?: number;
  rivalPlan?: boolean;
  recommended?: boolean;
  /** 出店の候補（フェーズ 1 の空き区画） */
  candidate?: boolean;
  inRange?: boolean;
  heat?: number;
}

export interface GridData {
  cols: number;
  rows: number;
  cells: GridCell[];
  /** 縦の道（マスの境目の x、マス単位）と横の道 */
  roadsX: number[];
  roadsY: number[];
  /** 生成した大きな物（駅など）。絵の座標の左上 */
  extras: { sprite: EmpireSprite; x: number; y: number }[];
  /** 地図の外側に敷くもの */
  surround: 'woods' | 'sea';
  /** 車と人を走らせるか */
  traffic: boolean;
}

export type Overlay = 'none' | 'heat' | 'range';

const lotEdge = (o: Owner) => (o === 'ours' ? P.ours[1] : o === 'rival' ? P.rival[1] : o === 'neutral' ? P.neutral[1] : P.plaza[2]);

function drawLot(ctx: CanvasRenderingContext2D, x: number, y: number, owner: Owner): void {
  const pl = P.plaza;
  ctx.fillStyle = css(pl[1]);
  ctx.fillRect(x + 2, y + 2, TILE - 4, TILE - 4);
  ctx.fillStyle = css(pl[0]);
  for (let yy = y + 2; yy < y + TILE - 2; yy += 8) ctx.fillRect(x + 2, yy, TILE - 4, 1);
  ctx.fillStyle = css(lotEdge(owner));
  ctx.fillRect(x + 2, y + 2, TILE - 4, 2);
  ctx.fillRect(x + 2, y + TILE - 4, TILE - 4, 2);
  ctx.fillRect(x + 2, y + 2, 2, TILE - 4);
  ctx.fillRect(x + TILE - 4, y + 2, 2, TILE - 4);
}

export function tile(ground: Ground, x: number, y: number): EmpireSprite {
  if (ground === 'water') return `water${(x * 3 + y) % 4}` as EmpireSprite;
  if (ground === 'grass') return `grass${(x * 7 + y * 3) % 5}` as EmpireSprite;
  return ground;
}

/** 道の上を行き来する車と人（絵の座標の線分） */
interface Lane {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export class GridScene implements MapScene {
  readonly width: number;
  readonly height: number;
  readonly animated: boolean;
  marks: Map<number, CellMarks> = new Map();
  overlay: Overlay = 'none';
  private lanes: Lane[] = [];
  /** 月を進めたときに一時的に増やす車（タイムラプス） */
  rush = 0;

  constructor(readonly data: GridData) {
    this.width = data.cols * TILE;
    this.height = data.rows * TILE;
    this.animated = data.traffic;
    const top = TILE;
    const bottom = (data.rows - 1) * TILE;
    const left = TILE;
    const right = (data.cols - 1) * TILE;
    for (const bx of data.roadsX) this.lanes.push({ x0: bx * TILE, y0: top, x1: bx * TILE, y1: bottom });
    for (const by of data.roadsY) this.lanes.push({ x0: left, y0: by * TILE, x1: right, y1: by * TILE });
  }

  cellRect(i: number) {
    return { x: (i % this.data.cols) * TILE, y: Math.floor(i / this.data.cols) * TILE, w: TILE, h: TILE };
  }

  /** target（kind, id）のマスの番号 */
  cellOf(kind: string, id: number): number {
    return this.data.cells.findIndex((c) => c.target?.kind === kind && c.target.id === id);
  }

  pending(): boolean {
    if (!ready(img(empire.sheet))) return true;
    return this.data.cells.some((c) => c.ext !== undefined && extensionRef(c.ext) !== undefined && !ready(img(fileOf(extensionRef(c.ext)!))));
  }

  drawSurround(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
    const x0 = Math.floor(x / TILE) - 1;
    const y0 = Math.floor(y / TILE) - 1;
    for (let ty = y0; ty <= y0 + Math.ceil(h / TILE) + 1; ty++) {
      for (let tx = x0; tx <= x0 + Math.ceil(w / TILE) + 1; tx++) {
        if (tx >= 0 && ty >= 0 && tx < this.data.cols && ty < this.data.rows) continue;
        const wx = tx * TILE;
        const wy = ty * TILE;
        if (this.data.surround === 'sea') {
          drawSprite(ctx, tile('water', tx & 0xff, ty & 0xff), wx, wy);
          continue;
        }
        drawSprite(ctx, tile('grass', tx & 0xff, ty & 0xff), wx, wy);
        const n = (tx * 31 + ty * 17) & 7;
        if (n < 5) drawSprite(ctx, n < 2 ? 'treeL' : 'treeS', wx + 8 + ((tx * 13) & 15), wy + 6 + ((ty * 7) & 15));
      }
    }
  }

  drawStatic(ctx: CanvasRenderingContext2D): void {
    const { cols, cells } = this.data;
    // 地面と区画の舗装
    cells.forEach((c, i) => {
      const tx = i % cols;
      const ty = Math.floor(i / cols);
      drawSprite(ctx, tile(c.ground, tx, ty), tx * TILE, ty * TILE);
      if (c.lot) drawLot(ctx, tx * TILE, ty * TILE, c.lot);
    });
    // 道（区画の境目の細い道）
    const R = P.road;
    for (const l of this.lanes) {
      if (l.x0 === l.x1) {
        ctx.fillStyle = css(R[1]);
        ctx.fillRect(l.x0 - 5, l.y0, 10, l.y1 - l.y0);
        ctx.fillStyle = css(R[0]);
        ctx.fillRect(l.x0 - 5, l.y0, 1, l.y1 - l.y0);
        ctx.fillStyle = css(R[2]);
        ctx.fillRect(l.x0 + 4, l.y0, 1, l.y1 - l.y0);
      } else {
        ctx.fillStyle = css(R[1]);
        ctx.fillRect(l.x0, l.y0 - 5, l.x1 - l.x0, 10);
        ctx.fillStyle = css(R[0]);
        ctx.fillRect(l.x0, l.y0 - 5, l.x1 - l.x0, 1);
        ctx.fillStyle = css(R[2]);
        ctx.fillRect(l.x0, l.y0 + 4, l.x1 - l.x0, 1);
      }
    }
    // 物（奥から手前へ）
    const objs: { y: number; draw: () => void }[] = [];
    cells.forEach((c, i) => {
      const x = (i % cols) * TILE;
      const y = Math.floor(i / cols) * TILE;
      if (c.ext !== undefined) objs.push({ y: y + TILE, draw: () => drawExtension(ctx, c.ext!, x, y) });
      if (c.obj) {
        const s = spriteSize(c.obj);
        objs.push({ y: y + TILE, draw: () => drawSprite(ctx, c.obj!, x + Math.floor((TILE - s.w) / 2), y + TILE - s.h - 2) });
      }
    });
    for (const e of this.data.extras) {
      const s = spriteSize(e.sprite);
      objs.push({ y: e.y + s.h, draw: () => drawSprite(ctx, e.sprite, e.x, e.y) });
    }
    objs.sort((a, b) => a.y - b.y).forEach((o) => o.draw());
  }

  drawDynamic(ctx: CanvasRenderingContext2D, t: number, hover: MapTarget | null): void {
    const { cols } = this.data;
    // 重ねる色分け（人通り・配送圏）
    if (this.overlay !== 'none') {
      this.marks.forEach((m, i) => {
        const x = (i % cols) * TILE;
        const y = Math.floor(i / cols) * TILE;
        if (this.overlay === 'heat' && m.heat !== undefined) {
          const h = m.heat;
          ctx.fillStyle = `rgba(${Math.round(80 + 175 * h)},${Math.round(120 + 60 * (1 - Math.abs(h - 0.5) * 2))},${Math.round(200 - 170 * h)},0.42)`;
          ctx.fillRect(x + 2, y + 2, TILE - 4, TILE - 4);
        }
        if (this.overlay === 'range' && m.inRange) {
          ctx.fillStyle = css(P.ours[0], 0.28);
          ctx.fillRect(x, y, TILE, TILE);
        }
      });
    }
    // 車と人：道の線の上を行き来する
    if (this.data.traffic && this.lanes.length) {
      const cars = 2 + this.rush;
      for (let k = 0; k < cars; k++) {
        const l = this.lanes[(k * 3 + 1) % this.lanes.length];
        const len = Math.abs(l.x1 - l.x0) + Math.abs(l.y1 - l.y0);
        const speed = 0.03 + (k % 3) * 0.008 + (this.rush ? 0.04 : 0);
        const d = ((t * speed + k * 97) % (len * 2)) | 0;
        const back = d > len;
        const p = back ? len * 2 - d : d;
        if (l.y0 === l.y1) {
          const x = l.x0 + p - 11;
          drawSprite(ctx, back ? 'truckL' : 'truck', x, l.y0 - 9);
        } else {
          // 縦の道は小さく：トラックの代わりに人が歩く
          drawSprite(ctx, `walker${k % 4}` as EmpireSprite, l.x0 - 2, l.y0 + p - 5);
        }
      }
      for (let k = 0; k < 6; k++) {
        const l = this.lanes[(k * 5) % this.lanes.length];
        const len = Math.abs(l.x1 - l.x0) + Math.abs(l.y1 - l.y0);
        const d = ((t * 0.012 + k * 53) % (len * 2)) | 0;
        const p = d > len ? len * 2 - d : d;
        const side = k % 2 ? 6 : -10;
        if (l.y0 === l.y1) drawSprite(ctx, `walker${k % 4}` as EmpireSprite, l.x0 + p, l.y0 + side);
        else drawSprite(ctx, `walker${(k + 1) % 4}` as EmpireSprite, l.x0 + side, l.y0 + p);
      }
    }
    // 区画の印
    this.marks.forEach((m, i) => {
      const x = (i % cols) * TILE;
      const y = Math.floor(i / cols) * TILE;
      if (m.planned) {
        if (m.planned === 'open' && m.ghostExt !== undefined) {
          ctx.globalAlpha = 0.6;
          drawExtension(ctx, m.ghostExt, x, y);
          ctx.globalAlpha = 1;
        }
        if (m.planned === 'center') {
          ctx.globalAlpha = 0.6;
          drawSprite(ctx, 'hubS', x + 2, y + 14);
          ctx.globalAlpha = 1;
        }
        dashed(ctx, x + 3, y + 3, TILE - 6, TILE - 6, css(P.lantern[1]), t);
      }
      if (m.candidate && !m.planned) dashed(ctx, x + 3, y + 3, TILE - 6, TILE - 6, 'rgba(244,235,221,0.95)', t);
      if (m.recommended) badge(ctx, x + TILE - 18, y + 4, css(P.lantern[1]), '★');
      if (m.rivalPlan) badge(ctx, x + TILE - 18, y + 4, css(P.rival[1]), '!');
    });
    const sel = [...this.marks.entries()].find(([, m]) => m.selected)?.[0];
    if (hover && hover.kind !== 'none') frame(ctx, hover.x + 1, hover.y + 1, hover.w - 2, hover.h - 2, 'rgba(244,235,221,0.95)', 2);
    if (sel !== undefined) {
      const x = (sel % cols) * TILE;
      const y = Math.floor(sel / cols) * TILE;
      frame(ctx, x - 1, y - 1, TILE + 2, TILE + 2, css(P.outline), 1);
      frame(ctx, x, y, TILE, TILE, '#F2B544', 3);
    }
  }

  hit(x: number, y: number): MapTarget | null {
    const tx = Math.floor(x / TILE);
    const ty = Math.floor(y / TILE);
    if (tx < 0 || ty < 0 || tx >= this.data.cols || ty >= this.data.rows) return null;
    const c = this.data.cells[ty * this.data.cols + tx];
    if (!c?.target) return null;
    return { kind: c.target.kind, id: c.target.id, x: tx * TILE, y: ty * TILE, w: TILE, h: TILE };
  }
}

function frame(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, color: string, t: number): void {
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w, t);
  ctx.fillRect(x, y + h - t, w, t);
  ctx.fillRect(x, y, t, h);
  ctx.fillRect(x + w - t, y, t, h);
}

function dashed(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, color: string, t: number): void {
  ctx.fillStyle = color;
  const off = Math.floor(t / 120) % 8;
  for (let i = -8; i < w; i += 8) {
    const a = Math.max(0, i + off);
    const b = Math.min(w, i + off + 4);
    if (b > a) {
      ctx.fillRect(x + a, y, b - a, 2);
      ctx.fillRect(x + w - b, y + h - 2, b - a, 2);
    }
  }
  for (let i = -8; i < h; i += 8) {
    const a = Math.max(0, i + off);
    const b = Math.min(h, i + off + 4);
    if (b > a) {
      ctx.fillRect(x + w - 2, y + a, 2, b - a);
      ctx.fillRect(x, y + h - b, 2, b - a);
    }
  }
}

/** 区画の角の小さな札（★ おすすめ・! ライバルが狙う）。1 ドットの線で描く */
function badge(ctx: CanvasRenderingContext2D, x: number, y: number, color: string, mark: '★' | '!'): void {
  ctx.fillStyle = '#181818';
  ctx.fillRect(x - 1, y - 1, 16, 16);
  ctx.fillStyle = color;
  ctx.fillRect(x, y, 14, 14);
  ctx.fillStyle = '#181818';
  if (mark === '!') {
    ctx.fillRect(x + 6, y + 3, 2, 6);
    ctx.fillRect(x + 6, y + 10, 2, 2);
  } else {
    // 5 つの角の星を 1 ドットの段差で
    const rows = ['   1   ', '  111  ', '1111111', ' 11111 ', '  111  ', ' 11 11 ', '11   11'];
    rows.forEach((r, yy) => [...r].forEach((ch, xx) => ch === '1' && ctx.fillRect(x + 4 + xx, y + 3 + yy, 1, 1)));
  }
}
