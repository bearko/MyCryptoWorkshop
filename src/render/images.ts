import { atlases } from '../game/catalog';

const cache = new Map<string, HTMLImageElement>();

/** Resolves a catalog asset path (e.g. `mch/Image/...`) against the deployed base URL. */
export function assetUrl(path: string): string {
  return `${import.meta.env.BASE_URL}${path}`;
}

export function img(path: string): HTMLImageElement {
  let im = cache.get(path);
  if (!im) {
    im = new Image();
    im.decoding = 'async';
    im.src = assetUrl(path);
    cache.set(path, im);
  }
  return im;
}

export const ready = (im: HTMLImageElement) => im.complete && im.naturalWidth > 0;

// ---------------------------------------------------------------- sprite references
// Catalog images are either a file path ("mch/Image/...") or an atlas cell ("#ext-0/37").

interface Cell {
  sheet: { url: string; cols: number; rows: number; cell: number };
  col: number;
  row: number;
}

const cellCache = new Map<string, Cell>();

function atlasCell(ref: string): Cell {
  let c = cellCache.get(ref);
  if (!c) {
    const [name, index] = ref.slice(1).split('/');
    const sheet = atlases[name];
    if (!sheet) throw new Error(`unknown sprite sheet ${name}`);
    const i = Number(index);
    c = { sheet, col: i % sheet.cols, row: Math.floor(i / sheet.cols) };
    cellCache.set(ref, c);
  }
  return c;
}

export const isSprite = (ref: string) => ref.startsWith('#');

/** The file that has to be loaded to show `ref` (the sheet for atlas cells). */
export function fileOf(ref: string): string {
  return isSprite(ref) ? atlasCell(ref).sheet.url : ref;
}

/** Draws a catalog image (file or atlas cell) into a rectangle; skips it until loaded. */
export function drawRef(ctx: CanvasRenderingContext2D, ref: string, x: number, y: number, w: number, h: number): void {
  if (isSprite(ref)) {
    const { sheet, col, row } = atlasCell(ref);
    const im = img(sheet.url);
    if (ready(im)) ctx.drawImage(im, col * sheet.cell, row * sheet.cell, sheet.cell, sheet.cell, x, y, w, h);
  } else {
    const im = img(ref);
    if (ready(im)) ctx.drawImage(im, x, y, w, h);
  }
}

/** CSS that shows one atlas cell scaled to fill its element, whatever the element's size. */
export function spriteStyle(ref: string): string {
  const { sheet, col, row } = atlasCell(ref);
  const px = sheet.cols > 1 ? (col / (sheet.cols - 1)) * 100 : 0;
  const py = sheet.rows > 1 ? (row / (sheet.rows - 1)) * 100 : 0;
  return `background-image:url("${assetUrl(sheet.url)}");background-size:${sheet.cols * 100}% ${sheet.rows * 100}%;background-position:${px}% ${py}%`;
}

export function preload(refs: string[]): Promise<void> {
  const paths = [...new Set(refs.map(fileOf))];
  return Promise.all(
    paths.map(
      (p) =>
        new Promise<void>((resolve) => {
          const im = img(p);
          if (ready(im)) return resolve();
          im.addEventListener('load', () => resolve(), { once: true });
          im.addEventListener('error', () => resolve(), { once: true });
        }),
    ),
  ).then(() => undefined);
}
