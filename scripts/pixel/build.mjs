// 経営モードの生成した絵を public/empire/ に書き、目録（src/generated/empire.json）を返す。
// scripts/sync-assets.mjs から呼ぶ。ファイル名に中身のハッシュを入れる（サービスワーカーが古い絵を出さないように）。
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import pngjs from 'pngjs';
import { Canvas } from './core.mjs';
import { LAND_BACKGROUNDS, landBackground } from './backgrounds.mjs';
import { OUTLINE, PAL } from './palette.mjs';
import { sprites } from './sprites.mjs';

const { PNG } = pngjs;

function writeHashed(dir, name, png) {
  const buf = PNG.sync.write(png, { deflateLevel: 9 });
  const file = `${name}.${createHash('sha256').update(buf).digest('hex').slice(0, 10)}.png`;
  writeFileSync(join(dir, file), buf);
  return `empire/${file}`;
}

/** 棚詰めで 1 枚にまとめる（幅 512、2 ドットの余白） */
export function packSheet(list, width = 512) {
  const placed = [];
  let x = 0;
  let y = 0;
  let shelf = 0;
  for (const s of [...list].sort((a, b) => b.canvas.h - a.canvas.h)) {
    if (x + s.canvas.w > width) {
      x = 0;
      y += shelf + 2;
      shelf = 0;
    }
    placed.push({ ...s, x, y });
    x += s.canvas.w + 2;
    shelf = Math.max(shelf, s.canvas.h);
  }
  const sheet = new Canvas(width, y + shelf);
  for (const p of placed) sheet.stamp(p.canvas, p.x, p.y);
  return { sheet, placed };
}

/**
 * @param {{ root: string, src: string, use: (rel: string) => string }} o
 * root はリポジトリ、src は MCH の素材、use は素材をコピーして URL を返す関数
 */
export function buildEmpireAssets({ root, src, use }) {
  const outDir = join(root, 'public', 'empire');
  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(outDir, { recursive: true });
  const { sheet, placed } = packSheet(sprites());
  const sheetUrl = writeHashed(outDir, 'sheet', sheet.toPNG());
  const backgrounds = {};
  for (const [land, id] of Object.entries(LAND_BACKGROUNDS)) {
    const png = PNG.sync.read(readFileSync(join(src, `Image/Backgrounds/${id}.png`)));
    backgrounds[land] = writeHashed(outDir, `bg-${land}`, landBackground(png).toPNG());
  }
  const order = ['01_Ocean', '02_Strawberry', '03_Tangerine', '04_Lime', '05_Graphite', '06_Grape', '07_Sage', '08_Blueberry', '09_Ruby'];
  const rar = ['1_Common', '2_Uncommon', '3_Rare', '4_Epic', '5_Legendary'];
  const sectors = Object.fromEntries(order.map((f) => [f.slice(3), rar.map((r) => use(`Image/LandSectors/${f}_${r}.png`))]));
  return {
    sheet: sheetUrl,
    sprites: Object.fromEntries(placed.map((p) => [p.name, { x: p.x, y: p.y, w: p.canvas.w, h: p.canvas.h, kind: p.kind }])),
    backgrounds,
    sectors,
    // 地図をキャンバスに描くときの色（区画の舗装・縁・道）。src/render/map が使う
    palette: { outline: OUTLINE, ...PAL },
  };
}
