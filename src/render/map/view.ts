// 経営モードの地図の入れ物：キャンバス 1 枚に、場面（町・国）を整数倍で描く。
// カメラ（倍率と位置）、マウスを乗せたとき・押したとき・ずらしたときの扱いを受け持つ。
// 場面は「動かない層」を 1 度だけ絵の原寸で描いておき、毎フレームそれを拡大して重ねる。
import { cssPerArt, fitPixelCanvas } from '../pixel';

/** 地図の上で押せるもの（区画・エリアの板など）。kind と id は場面が決める */
export interface MapTarget {
  kind: string;
  id: number;
  /** 絵の座標での範囲（枠を描く・札を出す位置） */
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface MapScene {
  /** 絵の座標での大きさ */
  width: number;
  height: number;
  /** 動かない層（地形・建物）。絵の原寸で 1 度だけ描く */
  drawStatic(ctx: CanvasRenderingContext2D): void;
  /** 地図の外側（キャンバスが地図より広いとき） */
  drawSurround?(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void;
  /** 毎フレーム重ねるもの（選択の枠・車・予定の印）。t はミリ秒 */
  drawDynamic?(ctx: CanvasRenderingContext2D, t: number, hover: MapTarget | null): void;
  /** 絵の座標の点にあるもの */
  hit(x: number, y: number): MapTarget | null;
  /** 指で押したとき：点から r（絵の座標）以内でいちばん近いもの（小さな的を押しやすく） */
  hitNear?(x: number, y: number, r: number): MapTarget | null;
  /** 動きがあるか（無ければ止まった 1 枚だけ描く） */
  animated?: boolean;
  /** 読み込み待ちの画像があるか（あれば読み込み後に描き直す） */
  pending?(): boolean;
}

export interface MapViewEvents {
  onHover?(t: MapTarget | null, cssX: number, cssY: number): void;
  onSelect?(t: MapTarget | null): void;
  onCamera?(): void;
}

const reduceMotion = () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

export class MapView {
  readonly el: HTMLElement;
  readonly canvas: HTMLCanvasElement;
  private scene: MapScene | null = null;
  private staticLayer: HTMLCanvasElement | null = null;
  private zoom = 1;
  /** カメラの左上（絵の座標） */
  private camX = 0;
  private camY = 0;
  private scale = 1;
  private viewW = 0;
  private viewH = 0;
  private hover: MapTarget | null = null;
  private raf = 0;
  private drag: { x: number; y: number; camX: number; camY: number; moved: boolean; id: number } | null = null;
  private ro: ResizeObserver | null = null;
  private dirty = true;

  /** 倍率の段（1 は画面の 1 CSS ピクセル＝絵の 1 ドット。0.5 は高精細な画面でだけ縮む） */
  private levels: number[] = [1, 2, 3];

  constructor(private events: MapViewEvents = {}) {
    this.el = document.createElement('div');
    this.el.className = 'ke-map';
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'ke-map-canvas';
    this.el.append(this.canvas);
    this.canvas.addEventListener('pointermove', (ev) => this.onMove(ev));
    this.canvas.addEventListener('pointerdown', (ev) => this.onDown(ev));
    this.canvas.addEventListener('pointerup', (ev) => this.onUp(ev));
    this.canvas.addEventListener('pointercancel', () => (this.drag = null));
    this.canvas.addEventListener('pointerleave', () => this.setHover(null, 0, 0));
    this.canvas.addEventListener(
      'wheel',
      (ev) => {
        if (!this.scene) return;
        ev.preventDefault();
        if (ev.ctrlKey || Math.abs(ev.deltaY) > Math.abs(ev.deltaX) * 2) {
          if (ev.ctrlKey) this.stepZoom(ev.deltaY < 0 ? 1 : -1);
          else this.panBy(0, ev.deltaY / cssPerArt(this.scale));
        } else this.panBy(ev.deltaX / cssPerArt(this.scale), 0);
      },
      { passive: false },
    );
    if (typeof ResizeObserver !== 'undefined') {
      this.ro = new ResizeObserver(() => this.layout());
      this.ro.observe(this.el);
    }
  }

  /** 場面を入れ替える。keepCamera なら今の位置を保つ。zoom が 'fit' なら、地図がほぼ収まるいちばん大きな倍率 */
  setScene(scene: MapScene, opts: { focus?: { x: number; y: number }; zoom?: number | 'fit'; keepCamera?: boolean; levels?: number[] } = {}): void {
    const same = !!this.scene && this.scene.width === scene.width && this.scene.height === scene.height;
    this.scene = scene;
    this.staticLayer = null;
    if (opts.levels) this.levels = opts.levels;
    if (opts.zoom === 'fit') this.zoom = this.fitZoom(scene);
    else if (opts.zoom) this.zoom = this.clampZoom(opts.zoom);
    else this.zoom = this.clampZoom(this.zoom);
    this.layout();
    if (!(opts.keepCamera && same)) {
      if (opts.focus) this.centerOn(opts.focus.x, opts.focus.y);
      else this.centerOn(scene.width / 2, scene.height / 2);
    }
    this.invalidate();
  }

  /** 地図の描き直しを予約する（選択や予定が変わったとき） */
  invalidate(rebuildStatic = false): void {
    if (rebuildStatic) this.staticLayer = null;
    this.dirty = true;
    this.loop();
  }

  get currentZoom(): number {
    return this.zoom;
  }

  get zoomLimits(): [number, number] {
    return [this.levels[0], this.levels[this.levels.length - 1]];
  }

  /** 1 段上げる・下げる */
  stepZoom(dir: 1 | -1): void {
    const i = this.levels.indexOf(this.zoom);
    const next = this.levels[Math.max(0, Math.min(this.levels.length - 1, (i < 0 ? 0 : i) + dir))];
    this.setZoom(next);
  }

  /** 地図が画面にほぼ（15% まではみ出して）収まる、いちばん大きな段 */
  private fitZoom(s: MapScene): number {
    const r = this.el.getBoundingClientRect();
    if (r.width < 1) return this.levels[0];
    const ok = this.levels.filter((z) => s.width * z <= r.width * 1.15 && s.height * z <= r.height * 1.15);
    return ok.length ? ok[ok.length - 1] : this.levels[0];
  }

  setZoom(z: number): void {
    const nz = this.clampZoom(z);
    if (nz === this.zoom || !this.scene) return;
    const cx = this.camX + this.viewW / 2;
    const cy = this.camY + this.viewH / 2;
    this.zoom = nz;
    this.layout();
    this.centerOn(cx, cy);
    this.events.onCamera?.();
    this.invalidate();
  }

  private clampZoom(z: number): number {
    return this.levels.reduce((best, l) => (Math.abs(l - z) < Math.abs(best - z) ? l : best), this.levels[0]);
  }

  /** 絵の座標の点を画面の中央に */
  centerOn(x: number, y: number): void {
    this.camX = x - this.viewW / 2;
    this.camY = y - this.viewH / 2;
    this.clampCamera();
    this.events.onCamera?.();
    this.invalidate();
  }

  /** 絵の座標の範囲が見えるように動かす（下に sheet ぶんの高さを空けて） */
  reveal(t: { x: number; y: number; w: number; h: number }, bottomCss = 0): void {
    const k = cssPerArt(this.scale);
    const bottom = bottomCss / k;
    const visibleH = this.viewH - bottom;
    if (t.x < this.camX || t.x + t.w > this.camX + this.viewW || t.y < this.camY || t.y + t.h > this.camY + visibleH) {
      this.camX = t.x + t.w / 2 - this.viewW / 2;
      this.camY = t.y + t.h / 2 - visibleH / 2;
      this.clampCamera(bottom);
      this.events.onCamera?.();
      this.invalidate();
    }
  }

  panBy(dx: number, dy: number): void {
    this.camX += dx;
    this.camY += dy;
    this.clampCamera();
    this.events.onCamera?.();
    this.invalidate();
  }

  /** 絵の座標 → 地図の要素の中の CSS 座標 */
  toCss(x: number, y: number): { x: number; y: number } {
    const k = cssPerArt(this.scale);
    return { x: (x - Math.round(this.camX)) * k, y: (y - Math.round(this.camY)) * k };
  }

  get artScaleCss(): number {
    return cssPerArt(this.scale);
  }

  destroy(): void {
    cancelAnimationFrame(this.raf);
    this.ro?.disconnect();
    this.el.remove();
  }

  // ---------------------------------------------------------------- 内部

  private layout(): void {
    const r = this.el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return;
    const f = fitPixelCanvas(this.canvas, r.width, r.height, this.zoom);
    this.scale = f.scale;
    this.viewW = f.viewW;
    this.viewH = f.viewH;
    this.clampCamera();
    this.dirty = true;
    this.loop();
  }

  private clampCamera(bottomPad = 0): void {
    const s = this.scene;
    if (!s) return;
    // 地図が画面より小さい向きは真ん中に、大きい向きは端まで
    // 地図の外側も描くので、端の物が画面の端に貼りつかないよう半マス（32 ドット）まで外へ出られる
    const m = 32;
    if (s.width <= this.viewW) this.camX = (s.width - this.viewW) / 2;
    else this.camX = Math.max(-m, Math.min(s.width - this.viewW + m, this.camX));
    const vh = this.viewH - bottomPad;
    if (s.height <= vh) this.camY = (s.height - vh) / 2;
    else this.camY = Math.max(-m, Math.min(s.height - vh + m, this.camY));
  }

  private toArt(ev: PointerEvent): { x: number; y: number } {
    const r = this.canvas.getBoundingClientRect();
    const k = cssPerArt(this.scale);
    return { x: (ev.clientX - r.left) / k + Math.round(this.camX), y: (ev.clientY - r.top) / k + Math.round(this.camY) };
  }

  private setHover(t: MapTarget | null, cssX: number, cssY: number): void {
    const changed = (t?.kind ?? '') !== (this.hover?.kind ?? '') || t?.id !== this.hover?.id;
    this.hover = t;
    this.canvas.style.cursor = t ? 'pointer' : this.canPan() ? 'grab' : 'default';
    if (changed) this.invalidate();
    this.events.onHover?.(t, cssX, cssY);
  }

  private canPan(): boolean {
    const s = this.scene;
    return !!s && (s.width > this.viewW || s.height > this.viewH);
  }

  private onMove(ev: PointerEvent): void {
    if (!this.scene) return;
    if (this.drag && this.drag.id === ev.pointerId) {
      const k = cssPerArt(this.scale);
      const dx = (ev.clientX - this.drag.x) / k;
      const dy = (ev.clientY - this.drag.y) / k;
      if (Math.abs(dx) + Math.abs(dy) > 6 / k) this.drag.moved = true;
      if (this.drag.moved) {
        this.camX = this.drag.camX - dx;
        this.camY = this.drag.camY - dy;
        this.clampCamera();
        this.events.onCamera?.();
        this.invalidate();
      }
      return;
    }
    if (ev.pointerType === 'mouse') {
      const p = this.toArt(ev);
      const r = this.canvas.getBoundingClientRect();
      this.setHover(this.scene.hit(p.x, p.y), ev.clientX - r.left, ev.clientY - r.top);
    }
  }

  private onDown(ev: PointerEvent): void {
    this.drag = { x: ev.clientX, y: ev.clientY, camX: this.camX, camY: this.camY, moved: false, id: ev.pointerId };
    try {
      this.canvas.setPointerCapture(ev.pointerId);
    } catch {
      // 古いブラウザ
    }
  }

  private onUp(ev: PointerEvent): void {
    const d = this.drag;
    this.drag = null;
    if (!d || d.moved || !this.scene) return;
    const p = this.toArt(ev);
    // 指は太いので、小さな的は 22px まで外れても拾う
    const near = ev.pointerType === 'mouse' ? null : this.scene.hitNear?.(p.x, p.y, 22 / cssPerArt(this.scale));
    this.events.onSelect?.(this.scene.hit(p.x, p.y) ?? near ?? null);
  }

  private loop(): void {
    if (this.raf) return;
    this.raf = requestAnimationFrame((t) => {
      this.raf = 0;
      this.draw(t);
      const s = this.scene;
      if (s && ((s.animated && !reduceMotion()) || s.pending?.())) {
        this.dirty = true;
        if (s.pending?.()) this.staticLayer = null;
        this.loop();
      }
    });
  }

  private draw(t: number): void {
    const s = this.scene;
    const ctx = this.canvas.getContext('2d');
    if (!s || !ctx || !this.dirty) return;
    this.dirty = false;
    if (!this.staticLayer) {
      const c = document.createElement('canvas');
      c.width = s.width;
      c.height = s.height;
      const g = c.getContext('2d')!;
      g.imageSmoothingEnabled = false;
      s.drawStatic(g);
      this.staticLayer = c;
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = '#191628';
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    const ox = Math.round(this.camX);
    const oy = Math.round(this.camY);
    ctx.setTransform(this.scale, 0, 0, this.scale, -ox * this.scale, -oy * this.scale);
    s.drawSurround?.(ctx, ox, oy, Math.ceil(this.viewW) + 1, Math.ceil(this.viewH) + 1);
    ctx.drawImage(this.staticLayer, 0, 0);
    s.drawDynamic?.(ctx, reduceMotion() ? 0 : t, this.hover);
  }
}
