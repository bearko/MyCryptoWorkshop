// 世界の海図（フェーズ 4、docs/EMPIRE_DESIGN.md 10.1・10.12）：海に 9 つの島。
// 島はそのランドの背景のドット絵を切り抜いたもの（縮めない。原寸の 2 倍で描く）。島の右上に Legendary のアイコン。
// 島の色の縁で、そのランドとの関わりを示す：本拠は青緑、渡ったランドは生成り、まだのランドは灰、渡れないランドは暗く。
import empire from '../../generated/empire.json';
import { img, ready } from '../images';
import { drawSprite, landBackground, sectorIcon } from '../pixel';
import { css, tile } from './grid';
import type { MapScene, MapTarget } from './view';

type RGBA = number[];
const P = empire.palette as unknown as Record<string, RGBA[]> & { outline: RGBA };

/** 島の大きさ（絵の座標）。背景から 64×48 を切り抜いて 2 倍 */
export const ISLE_W = 128;
export const ISLE_H = 96;

/** 9 つの島の左上（576×480 の中。PC の 1280×720 で 1 倍のまま全部が入る大きさ。島の下に札、右上にアイコンが入るよう、行の間を空ける）。並びは world.ts の WORLD_LANDS */
export const ISLE_POS: [number, number][] = [
  [28, 40],
  [224, 24],
  [420, 48],
  [20, 190],
  [220, 184],
  [428, 198],
  [36, 340],
  [232, 348],
  [420, 336],
];

/** 島の背景のどこを切り抜くか（背景 320×256 の中、地面の見える辺り） */
const CROP: [number, number] = [128, 120];

export interface IsleData {
  land: string;
  /** 本拠・渡った・まだ・渡れない・描かない（創業の大陸選びでは、創業できる 4 つだけを描く） */
  status: 'home' | 'branch' | 'open' | 'closed' | 'hidden';
}

export class WorldScene implements MapScene {
  readonly width: number;
  readonly height: number;
  readonly animated = true;
  selected: number | null = null;

  /** pos と size を渡すと、島の置き場所と大きさを変えられる（創業の大陸選びは 4 つを大きく） */
  constructor(
    readonly isles: IsleData[],
    private readonly layout: { pos?: [number, number][]; w?: number; h?: number; width?: number; height?: number } = {},
  ) {
    this.width = layout.width ?? 576;
    this.height = layout.height ?? 480;
  }

  private get iw() {
    return this.layout.w ?? ISLE_W;
  }
  private get ih() {
    return this.layout.h ?? ISLE_H;
  }

  pending(): boolean {
    return this.isles.some((i) => i.status !== 'hidden' && (!ready(landBackground(i.land)) || !ready(img(sectorIcon(i.land, 4)))));
  }

  isleRect(i: number) {
    const [x, y] = (this.layout.pos ?? ISLE_POS)[i];
    return { x, y, w: this.iw, h: this.ih };
  }

  drawSurround(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
    seaTiles(ctx, x, y, w, h);
  }

  drawStatic(ctx: CanvasRenderingContext2D): void {
    seaTiles(ctx, 0, 0, this.width, this.height);
    this.isles.forEach((isle, i) => {
      if (isle.status === 'hidden') return;
      const { x, y } = this.isleRect(i);
      // 浅瀬（砂浜）と外郭線
      ctx.fillStyle = css(P.outline);
      ctx.fillRect(x - 6, y - 6, this.iw + 12, this.ih + 12);
      ctx.fillStyle = css(P.sand[1]);
      ctx.fillRect(x - 5, y - 5, this.iw + 10, this.ih + 10);
      const bg = landBackground(isle.land);
      if (ready(bg)) ctx.drawImage(bg, CROP[0], CROP[1], this.iw / 2, this.ih / 2, x, y, this.iw, this.ih);
      // 関わりの縁（3 ドット）
      const edge = isle.status === 'home' ? P.ours[1] : isle.status === 'branch' ? P.plaza[0] : P.neutral[1];
      ctx.fillStyle = css(edge);
      ctx.fillRect(x - 3, y - 3, this.iw + 6, 3);
      ctx.fillRect(x - 3, y + this.ih, this.iw + 6, 3);
      ctx.fillRect(x - 3, y, 3, this.ih);
      ctx.fillRect(x + this.iw, y, 3, this.ih);
      if (isle.status === 'closed') {
        ctx.fillStyle = 'rgba(25,22,40,0.6)';
        ctx.fillRect(x - 6, y - 6, this.iw + 12, this.ih + 12);
      }
      // Legendary のアイコン（島の右上）
      const icon = img(sectorIcon(isle.land, 4));
      if (ready(icon)) {
        ctx.fillStyle = css(P.outline);
        ctx.fillRect(x + this.iw - 41, y - 17, 50, 50);
        ctx.drawImage(icon, x + this.iw - 40, y - 16, 48, 48);
      }
    });
  }

  drawDynamic(ctx: CanvasRenderingContext2D, t: number, hover: MapTarget | null): void {
    // 航路の船：本拠から渡ったランドへ、行き来する
    const home = this.isles.findIndex((i) => i.status === 'home');
    if (home >= 0) {
      const a = this.isleRect(home);
      this.isles.forEach((isle, i) => {
        if (isle.status !== 'branch') return;
        const b = this.isleRect(i);
        const k = ((t / 6000 + i * 0.27) % 1 + 1) % 1;
        const u = k < 0.5 ? k * 2 : 2 - k * 2;
        const x = Math.round(a.x + this.iw / 2 + (b.x - a.x) * u - 12);
        const y = Math.round(a.y + this.ih + 4 + (b.y - a.y) * u);
        drawSprite(ctx, 'boat', x, y);
      });
    }
    if (hover) ring(ctx, hover, 'rgba(244,235,221,0.95)', 2);
    if (this.selected !== null) {
      const r = this.isleRect(this.selected);
      ring(ctx, { x: r.x - 9, y: r.y - 9, w: r.w + 18, h: r.h + 18 }, css(P.outline), 1);
      ring(ctx, { x: r.x - 8, y: r.y - 8, w: r.w + 16, h: r.h + 16 }, '#F2B544', 3);
    }
  }

  hit(x: number, y: number): MapTarget | null {
    for (let i = 0; i < this.isles.length; i++) {
      if (this.isles[i].status === 'hidden') continue;
      const r = this.isleRect(i);
      if (x >= r.x - 6 && y >= r.y - 6 && x < r.x + r.w + 6 && y < r.y + r.h + 6) return { kind: 'land', id: i, ...r };
    }
    return null;
  }

  hitNear(x: number, y: number, rad: number): MapTarget | null {
    let best: MapTarget | null = null;
    let bd = rad;
    this.isles.forEach((isle, i) => {
      if (isle.status === 'hidden') return;
      const p = this.isleRect(i);
      const d = Math.hypot(Math.max(p.x - x, 0, x - (p.x + p.w)), Math.max(p.y - y, 0, y - (p.y + p.h)));
      if (d <= bd) {
        bd = d;
        best = { kind: 'land', id: i, ...p };
      }
    });
    return best;
  }
}

function seaTiles(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
  for (let ty = Math.floor(y / 64) - 1; ty <= Math.ceil((y + h) / 64); ty++) {
    for (let tx = Math.floor(x / 64) - 1; tx <= Math.ceil((x + w) / 64); tx++) drawSprite(ctx, tile('water', tx & 0xff, ty & 0xff), tx * 64, ty * 64);
  }
}

function ring(ctx: CanvasRenderingContext2D, r: { x: number; y: number; w: number; h: number }, color: string, t: number): void {
  ctx.fillStyle = color;
  ctx.fillRect(r.x, r.y, r.w, t);
  ctx.fillRect(r.x, r.y + r.h - t, r.w, t);
  ctx.fillRect(r.x, r.y, t, r.h);
  ctx.fillRect(r.x + r.w - t, r.y, t, r.h);
}
