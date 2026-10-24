// ドット絵を整数倍だけで描く道具（docs/pixel-rules.md「大きさ」）。経営モードの地図と、
// 工房の店舗シーン（scene.ts）の両方から使う。
import empire from '../generated/empire.json';
import { allSeries } from '../game/catalog';
import { drawRef, img, ready } from './images';

/**
 * キャンバスを、CSS の大きさ（cssW×cssH）と倍率（zoom）に合わせる。
 * 1 ドットが画面の整数個の画素になるよう、devicePixelRatio を掛けたあとで丸める。
 * 戻り値は「絵の 1 ドット = 画面の何画素か」と、絵の座標での見える幅・高さ。
 */
export function fitPixelCanvas(canvas: HTMLCanvasElement, cssW: number, cssH: number, zoom: number): { scale: number; viewW: number; viewH: number } {
  const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
  // 0.5 倍は、2 倍以上の高精細な画面でだけ効く（1 ドットが画面の 1 画素より小さくはならない）
  const scale = Math.max(1, Math.round(dpr * zoom));
  const w = Math.max(1, Math.round(cssW * dpr));
  const h = Math.max(1, Math.round(cssH * dpr));
  if (canvas.width !== w) canvas.width = w;
  if (canvas.height !== h) canvas.height = h;
  canvas.style.width = `${w / dpr}px`;
  canvas.style.height = `${h / dpr}px`;
  canvas.dataset.artScale = String(scale);
  const ctx = canvas.getContext('2d');
  if (ctx) ctx.imageSmoothingEnabled = false;
  return { scale, viewW: w / scale, viewH: h / scale };
}

/** 画面の 1 CSS ピクセルが、絵の何ドットか */
export const cssPerArt = (scale: number) => scale / (typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1);

// ---------------------------------------------------------------- 生成した絵（scripts/pixel/）

export type EmpireSprite = keyof typeof empire.sprites;
const sheet = () => img(empire.sheet);

/** 生成した絵を 1 枚描く（左上を x, y に）。読み込み前なら描かない */
export function drawSprite(ctx: CanvasRenderingContext2D, name: EmpireSprite, x: number, y: number): void {
  const s = empire.sprites[name];
  const im = sheet();
  if (s && ready(im)) ctx.drawImage(im, s.x, s.y, s.w, s.h, Math.round(x), Math.round(y), s.w, s.h);
}

export const spriteSize = (name: EmpireSprite) => empire.sprites[name];

/** ランドの背景（ドット絵にしたもの） */
export const landBackground = (land: string) => img((empire.backgrounds as Record<string, string>)[land] ?? empire.backgrounds.Ocean);
/** ランドセクタのアイコン（0 Common 〜 4 Legendary） */
export const sectorIcon = (land: string, rarity: number) => (empire.sectors as Record<string, string[]>)[land]?.[rarity] ?? empire.sectors.Ocean[rarity];

export const empireImages = () => [empire.sheet, ...Object.values(empire.backgrounds)];

// ---------------------------------------------------------------- MCH のエクステンション（区画の設備）

const extRefs = new Map<number, string>();
for (const s of allSeries) for (const it of s.items) extRefs.set(it.id, it.image);

/** エクステンションの絵の参照（無い id は undefined） */
export const extensionRef = (id: number) => extRefs.get(id);

/** エクステンションを原寸（64×64）で描く */
export function drawExtension(ctx: CanvasRenderingContext2D, id: number, x: number, y: number): void {
  const ref = extRefs.get(id);
  if (ref) drawRef(ctx, ref, Math.round(x), Math.round(y), 64, 64);
}
