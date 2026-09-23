#!/usr/bin/env node
// Builds the game catalog from the My Crypto Heroes asset database
// (https://github.com/bearko/mycryptoheroes) and copies only the files the game uses.
//
//   node scripts/sync-assets.mjs
//
// Source directory: $MCH_ASSETS_DIR, else vendor/mycryptoheroes (git submodule).
// Outputs: public/mch/** (copied assets) and src/generated/catalog.json.

import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const src = resolve(root, process.env.MCH_ASSETS_DIR ?? 'vendor/mycryptoheroes');
const outPublic = join(root, 'public', 'mch');
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

// Extension series used by the game. The first is available from the start; the rest are
// unlocked by recipe nodes in the skill tree. Every series here has a Common→Legendary line.
const SERIES = [
  'ブレード', 'マスケット', 'ペン', 'アーマー', 'カタナ', 'ブック',
  'リング', 'シールド', 'レイピア', 'ワンド', 'ハット', 'ゴブレット',
];
const RARITIES = ['Common', 'Uncommon', 'Rare', 'Epic', 'Legendary'];

const extensions = readJson('Data/Extensions/extensions.json');
const series = SERIES.map((ja) => {
  const items = extensions
    .filter((e) => e.category === 'legacy' && e.series.name.ja === ja && RARITIES.includes(e.rarity.name))
    // Exclude the "真" (55xx/56xx) re-releases; they are reserved for a later ultra-rare tier.
    .filter((e) => e.id < 5500)
    .sort((a, b) => a.id - b.id);
  if (items.length === 0) throw new Error(`series not found: ${ja}`);
  const first = items[0];
  return {
    key: first.series.name.en,
    name: ja,
    items: items.map((e) => ({
      id: e.id,
      name: e.name.ja,
      rarity: e.rarity.name,
      skill: e.active_skill?.name?.ja ?? '',
      stats: e.max_level_stats,
      image: use(e.image_file_path),
    })),
  };
});

// Customers: original heroes grouped by rarity. Heroes that play thieves are excluded.
const THIEF_IDS = [2003, 3013, 4036, 3032, 3036, 3049, 3007, 4046, 4006];
// $MCH_MAX_CUSTOMERS_PER_TIER caps heroes per rarity (used for size-limited preview builds).
const maxPerTier = Number(process.env.MCH_MAX_CUSTOMERS_PER_TIER ?? Infinity);
const heroes = readJson('Data/Heroes/heroes.json');
const tierCount = {};
const customers = heroes
  .filter((h) => h.category === 'original' && h.rarity && RARITIES.includes(h.rarity.name))
  .filter((h) => !THIEF_IDS.includes(h.id))
  .filter((h) => (tierCount[h.rarity.name] = (tierCount[h.rarity.name] ?? 0) + 1) <= maxPerTier)
  .map((h) => ({
    id: h.id,
    name: h.name.ja,
    rarity: h.rarity.name,
    faction: h.faction?.name?.ja ?? '',
    passive: h.passive?.name?.ja ?? '',
    image: use(h.image_file_path),
  }));
const thieves = THIEF_IDS.map((id) => {
  const h = heroes.find((x) => x.id === id);
  if (!h) throw new Error(`thief hero not found: ${id}`);
  return { id: h.id, name: h.name.ja, rarity: h.rarity.name, image: use(h.image_file_path) };
});

// Workshop pests: small enemies that sit on the magic pot.
const PEST_IDS = [101, 111, 121, 131, 102, 112, 122, 132];
const enemies = readJson('Data/Enemies/enemies.json');
const pests = PEST_IDS.map((id) => enemies.find((e) => e.id === id))
  .filter((e) => e && e.image_exists)
  .map((e) => ({ id: e.id, name: e.name.ja, image: use(e.image_file_path) }));

// Workshop background and facility overlays.
const craftBgs = readJson('Data/CraftBackgrounds/craft_backgrounds.json');
const workshop = Object.fromEntries(craftBgs.map((b) => [b.key, use(b.image_file_path)]));
// Scenery seen through the storefront window.
const windowView = use('Image/Backgrounds/1056.png');

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
};

const catalog = {
  generatedFrom: 'https://github.com/bearko/mycryptoheroes',
  series,
  customers,
  thieves,
  pests,
  workshop,
  windowView,
  staff: {
    chris: frames.chris_loop,
    chrisCheer: staffPose('chris_03_cheer.png'),
    mine: frames.navi_ain_loop,
    maycri: frames.maycri_loop,
  },
  icons: {
    gum: icon('gum'),
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
  },
  audio,
};

mkdirSync(dirname(outCatalog), { recursive: true });
writeFileSync(outCatalog, JSON.stringify(catalog, null, 1));
console.log(
  `[sync-assets] ${series.length} series / ${series.reduce((n, s) => n + s.items.length, 0)} extensions, ` +
    `${customers.length} customers, ${thieves.length} thieves, ${pests.length} pests, ${copied.size} files`,
);
