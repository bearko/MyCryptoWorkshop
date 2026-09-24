import { extensionById } from './catalog';
import { itemId } from './items';
import { GEM_IDS, type GemId, type LineId } from './lines';
import { costOf, skillById, type Levels } from './skills';

export interface Totals {
  revenue: number;
  sold: number;
  customers: number;
  lost: number;
  stolen: number;
  caught: number;
  pests: number;
  crafted: number;
}

/** Bump when the save shape changes, and add a step to MIGRATIONS. */
export const SAVE_VERSION = 3;

export interface SaveData {
  version: typeof SAVE_VERSION;
  gum: number;
  day: number;
  levels: Levels;
  /** Extension ids crafted at least once. */
  collection: number[];
  /** Shelf contents carried over between days (null = empty slot). */
  shelf: (number | null)[];
  storage: number[];
  totals: Totals;
  bestDayRevenue: number;
  settings: { bgm: boolean; se: boolean };
  tips: string[];
  meta: {
    /** Epoch ms when this save was started. */
    createdAt: number;
    /** Epoch ms of the last write. */
    savedAt: number;
    /** In-game seconds spent in business days. */
    playSeconds: number;
  };
  /** Materials from the dismantler. */
  resources: { dust: number; gems: Record<GemId, number> };
  /** Best edition crafted per extension id (for the collection). */
  bestEdition: Record<string, number>;
  /** 魔石 infused into each line for the next business day. */
  infusion: Partial<Record<LineId, GemId>>;
}

export const emptyGems = (): Record<GemId, number> => Object.fromEntries(GEM_IDS.map((g) => [g, 0])) as Record<GemId, number>;

export const emptyTotals = (): Totals => ({
  revenue: 0,
  sold: 0,
  customers: 0,
  lost: 0,
  stolen: 0,
  caught: 0,
  pests: 0,
  crafted: 0,
});

export function newSave(now = Date.now()): SaveData {
  return {
    version: SAVE_VERSION,
    gum: 0,
    day: 1,
    levels: { root: 1 },
    collection: [],
    shelf: [],
    storage: [],
    totals: emptyTotals(),
    bestDayRevenue: 0,
    settings: { bgm: true, se: true },
    tips: [],
    meta: { createdAt: now, savedAt: now, playSeconds: 0 },
    resources: { dust: 0, gems: emptyGems() },
    bestEdition: {},
    infusion: {},
  };
}

// ---------------------------------------------------------------- migrations

type RawSave = Record<string, unknown> & { version?: number };

/** MIGRATIONS[n] upgrades a version-n save to version n+1. */
const MIGRATIONS: Record<number, (d: RawSave) => RawSave> = {
  // v1 → v2: adds `meta`. Play time before v2 is estimated from the days played.
  1: (d) => ({
    ...d,
    version: 2,
    meta: { createdAt: Date.now(), savedAt: Date.now(), playSeconds: Math.max(0, ((d.day as number) ?? 1) - 1) * 45 },
  }),
  // v2 → v3 (Phase 2): dismantler materials, best editions, 魔石 infusion.
  2: (d) => ({ ...d, version: 3, resources: { dust: 0, gems: emptyGems() }, bestEdition: {}, infusion: {} }),
};

export class SaveError extends Error {}

/** Upgrades any older save to SAVE_VERSION. Throws SaveError for unknown or future versions. */
export function migrate(raw: RawSave): RawSave {
  let d = { ...raw };
  let v = typeof d.version === 'number' ? d.version : 1;
  if (v > SAVE_VERSION) throw new SaveError(`このセーブデータは新しいバージョン（v${v}）のものです`);
  while (v < SAVE_VERSION) {
    const step = MIGRATIONS[v];
    if (!step) throw new SaveError(`v${v} のセーブデータは読み込めません`);
    d = step(d);
    v = d.version as number;
  }
  return d;
}

/**
 * Fixes a save against the current game data: unknown extension ids are dropped, and skill
 * levels that no longer exist (removed nodes, lowered max) are refunded as GUM.
 * Returns the GUM refunded.
 */
export function sanitize(data: SaveData): number {
  // Shelf and storage hold item codes (edition × 100000 + id), the collection plain ids.
  const known = (code: number) => extensionById.has(itemId(code));
  data.collection = data.collection.filter((id) => extensionById.has(id));
  data.shelf = data.shelf.map((code) => (code !== null && known(code) ? code : null));
  data.storage = data.storage.filter(known);
  data.bestEdition = Object.fromEntries(Object.entries(data.bestEdition ?? {}).filter(([id]) => extensionById.has(Number(id))));
  data.totals = { ...emptyTotals(), ...data.totals };

  let refund = 0;
  for (const [id, lv] of Object.entries(data.levels)) {
    const node = skillById.get(id);
    const keep = node ? Math.min(lv, node.max) : 0;
    if (node) for (let l = keep; l < lv; l++) refund += node.currency === 'dust' ? 0 : costOf(node, l);
    if (node?.currency === 'dust') for (let l = keep; l < lv; l++) data.resources.dust += costOf(node, l);
    // Nodes that were removed entirely: nothing to price them by, so they are simply dropped.
    if (keep > 0) data.levels[id] = keep;
    else delete data.levels[id];
  }
  data.levels.root = 1;
  data.gum += refund;
  return refund;
}

/** Parses, migrates and sanitizes a JSON save. */
export function parseSave(json: string): SaveData {
  let raw: RawSave;
  try {
    raw = JSON.parse(json) as RawSave;
  } catch {
    throw new SaveError('セーブデータの形式が正しくありません');
  }
  if (!raw || typeof raw !== 'object' || typeof raw.levels !== 'object') throw new SaveError('セーブデータの形式が正しくありません');
  const base = newSave();
  const migrated = migrate(raw);
  const data = { ...base, ...migrated, meta: { ...base.meta, ...(migrated.meta as object) } } as SaveData;
  const res = (migrated.resources ?? {}) as Partial<SaveData['resources']>;
  data.resources = { dust: res.dust ?? 0, gems: { ...emptyGems(), ...res.gems } };
  sanitize(data);
  return data;
}

// ---------------------------------------------------------------- export / import codes

const CODE_PREFIX = 'MCW:';

/** A copy-pasteable save code (prefix + base64 of the JSON). */
export function exportCode(data: SaveData): string {
  const bytes = new TextEncoder().encode(JSON.stringify(data));
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return CODE_PREFIX + btoa(bin);
}

export function importCode(code: string): SaveData {
  const trimmed = code.trim();
  if (!trimmed.startsWith(CODE_PREFIX)) throw new SaveError('My Crypto Workshop のセーブコードではありません');
  let json: string;
  try {
    const bin = atob(trimmed.slice(CODE_PREFIX.length));
    json = new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
  } catch {
    throw new SaveError('セーブコードが壊れています（途中で切れていないか確認してください）');
  }
  return parseSave(json);
}

// ---------------------------------------------------------------- storage

const KEY = 'mycryptoworkshop.save';
const LEGACY_KEYS = ['mycryptoworkshop.save.v1'];
const BACKUP_KEY = 'mycryptoworkshop.save.backup';

function storageGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function storageSet(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Storage may be unavailable (private mode); the game keeps running without saving.
  }
}

export function loadSave(): SaveData {
  let raw = storageGet(KEY);
  let fromLegacy = false;
  for (const legacy of LEGACY_KEYS) {
    if (raw) break;
    raw = storageGet(legacy);
    fromLegacy = !!raw;
  }
  if (!raw) return newSave();
  try {
    const version = (JSON.parse(raw) as RawSave).version ?? 1;
    // Keep a copy of the original before upgrading it.
    if (fromLegacy || version !== SAVE_VERSION) storageSet(BACKUP_KEY, raw);
    return parseSave(raw);
  } catch {
    storageSet(BACKUP_KEY, raw);
    return newSave();
  }
}

export function writeSave(data: SaveData): void {
  data.meta.savedAt = Date.now();
  storageSet(KEY, JSON.stringify(data));
}

export function clearSave(): void {
  try {
    localStorage.removeItem(KEY);
    for (const k of LEGACY_KEYS) localStorage.removeItem(k);
  } catch {
    // ignore
  }
}
