#!/usr/bin/env node
// Builds the game catalog from the My Crypto Heroes asset database
// (https://github.com/bearko/mycryptoheroes) and copies only the files the game uses.
//
//   node scripts/sync-assets.mjs
//
// Source directory: $MCH_ASSETS_DIR, else vendor/mycryptoheroes (git submodule).
// Outputs: public/mch/** (copied assets), public/mch-atlas/*.png (sprite sheets) and
// src/generated/catalog.json.

import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import pngjs from 'pngjs';

const { PNG } = pngjs;

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const src = resolve(root, process.env.MCH_ASSETS_DIR ?? 'vendor/mycryptoheroes');
const outPublic = join(root, 'public', 'mch');
const outAtlas = join(root, 'public', 'mch-atlas');
const outCatalog = join(root, 'src', 'generated', 'catalog.json');

if (!existsSync(join(src, 'Data'))) {
  console.error(`[sync-assets] asset database not found at ${src}`);
  console.error('Run `git submodule update --init` or set MCH_ASSETS_DIR.');
  process.exit(1);
}

const readJson = (p) => JSON.parse(readFileSync(join(src, p), 'utf8'));
const copied = new Set();
/** Copies a file from the asset DB and returns its URL path relative to the site root. */
function use(relPath) {
  if (!copied.has(relPath)) {
    const from = join(src, relPath);
    if (!existsSync(from)) throw new Error(`missing asset: ${relPath}`);
    const to = join(outPublic, relPath);
    mkdirSync(dirname(to), { recursive: true });
    copyFileSync(from, to);
    copied.add(relPath);
  }
  return `mch/${relPath}`;
}

rmSync(outPublic, { recursive: true, force: true });
rmSync(outAtlas, { recursive: true, force: true });

// ---------------------------------------------------------------- sprite atlases
// 64×64 pixel-art sprites (extensions, heroes, enemies) are packed into sheets of 16×16 cells
// (8×8 for enemies, of which only a few are used at a time). A sprite is referenced as
// "#<sheet>/<cell>", e.g. "#ext-0/37".
const CELL = 64;
const SHEET_COLS = { ext: 16, hero: 16, enemy: 8 };
const atlasQueues = {};
const spriteRefs = new Map();
/** Queues a 64×64 sprite for an atlas and returns its reference (or a plain file for odd sizes). */
function sprite(kind, relPath) {
  const known = spriteRefs.get(relPath);
  if (known) return known;
  const ref = packSprite(kind, relPath);
  spriteRefs.set(relPath, ref);
  return ref;
}

function packSprite(kind, relPath) {
  const png = PNG.sync.read(readFileSync(join(src, relPath)));
  if (png.width !== CELL || png.height !== CELL) return use(relPath);
  const queue = (atlasQueues[kind] ??= []);
  const index = queue.length;
  const perSheet = SHEET_COLS[kind] ** 2;
  queue.push(png);
  return `#${kind}-${Math.floor(index / perSheet)}/${index % perSheet}`;
}

function writeAtlases() {
  const sheets = {};
  mkdirSync(outAtlas, { recursive: true });
  for (const [kind, pngs] of Object.entries(atlasQueues)) {
    const cols = SHEET_COLS[kind];
    const perSheet = cols * cols;
    for (let page = 0; page * perSheet < pngs.length; page++) {
      const cells = pngs.slice(page * perSheet, (page + 1) * perSheet);
      const rows = Math.ceil(cells.length / cols);
      const sheet = new PNG({ width: cols * CELL, height: rows * CELL });
      cells.forEach((png, i) => {
        PNG.bitblt(png, sheet, 0, 0, CELL, CELL, (i % cols) * CELL, Math.floor(i / cols) * CELL);
      });
      const name = `${kind}-${page}`;
      writeFileSync(join(outAtlas, `${name}.png`), PNG.sync.write(sheet, { deflateLevel: 9 }));
      sheets[name] = { url: `mch-atlas/${name}.png`, cols, rows, cell: CELL };
    }
  }
  return sheets;
}

const RARITIES = ['Common', 'Uncommon', 'Rare', 'Epic', 'Legendary'];

// What the game uses right now is packed first, so the first sheet of each atlas covers it.
const content = JSON.parse(readFileSync(join(root, 'src', 'game', 'content.json'), 'utf8'));
const firstBy = (isFirst) => (a, b) => Number(isFirst(b)) - Number(isFirst(a));

// ---------------------------------------------------------------- extensions (all series)
// Every Legacy and Modern extension, grouped by series. Which series the game uses is decided
// in src/game/catalog.ts. "真" re-releases (ids 55xx/56xx) are flagged with `shin`.
const activeKeys = content.activeSeries.map((s) => s.key);
const isActiveExt = (e) => e.category === 'legacy' && activeKeys.includes(e.series.name.en);
const extensions = readJson('Data/Extensions/extensions.json')
  .filter((e) => e.category === 'legacy' || e.category === 'modern')
  .sort((a, b) => a.id - b.id)
  .sort(firstBy(isActiveExt));
const seriesMap = new Map();
for (const e of extensions) {
  const key = `${e.category}:${e.series.name.en}`;
  if (!seriesMap.has(key)) {
    seriesMap.set(key, { key: e.series.name.en, name: e.series.name.ja, expansion: e.category, items: [] });
  }
  seriesMap.get(key).items.push({
    id: e.id,
    name: e.name.ja,
    rarity: e.rarity.name,
    shin: e.category === 'legacy' && e.id >= 5500,
    skill: e.active_skill?.name?.ja ?? '',
    stats: e.max_level_stats,
    image: sprite('ext', e.image_file_path),
  });
}
const series = [...seriesMap.values()].sort((a, b) => a.items[0].id - b.items[0].id);
for (const s of series) s.items.sort((a, b) => a.id - b.id);

// ---------------------------------------------------------------- heroes (all usable)
// Original, novice and replica heroes. Customers and thieves are chosen in src/game/catalog.ts.
const heroes = readJson('Data/Heroes/heroes.json')
  .filter((h) => ['original', 'novice', 'replica'].includes(h.category))
  .sort(firstBy((h) => h.category === 'original'))
  .map((h) => ({
    id: h.id,
    name: h.name.ja,
    rarity: h.rarity?.name ?? null,
    category: h.category,
    faction: h.faction?.name?.ja ?? '',
    passive: h.passive?.name?.ja ?? '',
    image: sprite('hero', h.image_file_path),
  }));

// ---------------------------------------------------------------- enemies (all with 64px art)
const enemies = readJson('Data/Enemies/enemies.json')
  .filter((e) => e.image_exists)
  .sort(firstBy((e) => content.pestIds.includes(e.id) || content.storePestIds.includes(e.id)))
  .map((e) => ({ id: e.id, name: e.name.ja, image: sprite('enemy', e.image_file_path) }));

// ---------------------------------------------------------------- window views
// Battle backgrounds are 1000×1500; the storefront window only shows a 2:1 strip, so a small
// box-filtered crop is written instead of shipping the full image.
const WINDOW_W = 320;
const WINDOW_H = 160;
function windowCrop(relPath, key) {
  const png = PNG.sync.read(readFileSync(join(src, relPath)));
  const cropH = Math.round(png.width / 2);
  const y0 = Math.round(png.height * 0.3);
  const out = new PNG({ width: WINDOW_W, height: WINDOW_H });
  const sx = png.width / WINDOW_W;
  const sy = cropH / WINDOW_H;
  for (let y = 0; y < WINDOW_H; y++) {
    for (let x = 0; x < WINDOW_W; x++) {
      const acc = [0, 0, 0, 0];
      let n = 0;
      for (let v = Math.floor(y0 + y * sy); v < Math.floor(y0 + (y + 1) * sy); v++) {
        for (let u = Math.floor(x * sx); u < Math.floor((x + 1) * sx); u++) {
          const i = (v * png.width + u) * 4;
          for (let c = 0; c < 4; c++) acc[c] += png.data[i + c];
          n++;
        }
      }
      const o = (y * WINDOW_W + x) * 4;
      for (let c = 0; c < 4; c++) out.data[o + c] = Math.round(acc[c] / Math.max(1, n));
    }
  }
  mkdirSync(outAtlas, { recursive: true });
  writeFileSync(join(outAtlas, `window-${key}.png`), PNG.sync.write(out, { deflateLevel: 9 }));
  return `mch-atlas/window-${key}.png`;
}

// Workshop background and facility overlays.
const craftBgs = readJson('Data/CraftBackgrounds/craft_backgrounds.json');
const workshop = Object.fromEntries(craftBgs.map((b) => [b.key, use(b.image_file_path)]));
// Scenery seen through the storefront window.
const windowView = windowCrop('Image/Backgrounds/1056.png', 'default');

// Lands (guilds of MCH): the window view on a land's day, and its guardian cryptid.
const backgrounds = readJson('Data/Backgrounds/backgrounds.json');
const cryptids = readJson('Data/Cryptids/cryptids.json');
const lands = backgrounds
  .filter((b) => b.node_type === 'land')
  .map((b) => ({
    key: b.node_name_en,
    name: b.node_name_ja,
    view: windowCrop(b.image_file_path, b.node_name_en.toLowerCase()),
    cryptid: use(cryptids.find((c) => c.image_file_path === b.cryptid_ref).image_file_path),
  }));

// Staff (original characters, free to use).
const chars = readJson('Data/Characters/characters.json');
const frames = {};
for (const c of chars) {
  for (const set of c.sprite_sets) {
    for (const anim of set.animations) {
      if (!anim.id.endsWith('_loop')) continue;
      frames[anim.id] = anim.frames.map((f) => ({ image: use(f.image_file_path), ms: f.duration_ms }));
    }
  }
}
const staffPose = (file) => use(`Image/Characters/${file}`);

const icons = readJson('Data/Icons/icons.json');
const icon = (key) => use(icons.find((i) => i.key === key).image_file_path);
const gems = readJson('Data/Materials/gemstones.json');
const battleIcons = readJson('Data/BattleIcons/battle_icons.json');
const bicon = (key) => use(battleIcons.find((i) => i.key === key).image_file_path);

const audio = {
  bgmShop: use('Audio/BGM/pve.mp3'),
  bgmTree: use('Audio/BGM/land.mp3'),
  craft: use('Audio/SE/Actions/production.mp3'),
  rare: use('Audio/SE/Actions/open_treasure.mp3'),
  sale: use('Audio/SE/Actions/cp-mining-complete.mp3'),
  unlock: use('Audio/SE/Actions/insp.mp3'),
  build: use('Audio/SE/Actions/tooldev.mp3'),
  fail: use('Audio/SE/Actions/crash.mp3'),
  hit: use('Audio/SE/Battle/1_single_damage.mp3'),
  buff: use('Audio/SE/Battle/4_buff.mp3'),
  debuff: use('Audio/SE/Battle/5_debuff_status_effect.mp3'),
  win: use('Audio/SE/Jingles/win.mp3'),
  helper: use('Audio/SE/Jingles/knight.mp3'),
  clean: use('Audio/SE/Battle/3_heal_resurrection.mp3'),
  zap: use('Audio/SE/Battle/2_area_damage.mp3'),
};

const atlases = writeAtlases();

const catalog = {
  generatedFrom: 'https://github.com/bearko/mycryptoheroes',
  atlases,
  series,
  heroes,
  enemies,
  workshop,
  windowView,
  lands,
  staff: {
    chris: frames.chris_loop,
    chrisCheer: staffPose('chris_03_cheer.png'),
    mine: frames.navi_ain_loop,
    maycri: frames.maycri_loop,
  },
  icons: {
    gum: icon('gum'),
    dust: icon('gold_dust'),
    emblem: icon('emblem'),
    mch: icon('mch_icon'),
    logo: icon('mch_logo_horizontal'),
    ce: icon('ce'),
    cp: icon('cp'),
    gems: Object.fromEntries(gems.map((g) => [g.element, use(g.image_file_path)])),
    hp: bicon('hp'),
    phy: bicon('phy'),
    int: bicon('int'),
    bufAgi: bicon('buf_agi'),
    bufPhy: bicon('buf_phy'),
    bufInt: bicon('buf_int'),
    sleep: bicon('sleep'),
    fear: bicon('fear'),
    decoy: bicon('decoy'),
    mai: icon('mai_sd'),
  },
  audio,
};

mkdirSync(dirname(outCatalog), { recursive: true });
writeFileSync(outCatalog, JSON.stringify(catalog, null, 1));
console.log(
  `[sync-assets] ${series.length} series / ${extensions.length} extensions, ${heroes.length} heroes, ` +
    `${enemies.length} enemies, ${Object.keys(atlases).length} atlas sheets, ${copied.size} other files`,
);
