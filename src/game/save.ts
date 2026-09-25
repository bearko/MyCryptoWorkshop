import { customers, extensionById, heroById, series } from './catalog';
import type { Order } from './orders';
import type { Daily } from './achievements';
import { newPrestige, type Prestige } from './prestige';
import { CONDITIONS } from './conditions';

const CONDITION_KINDS = Object.keys(CONDITIONS);
import { addTo } from './currency';
import type { DayCondition } from './conditions';
import { itemId } from './items';
import { GEM_IDS, type GemId, type LineId } from './lines';
import { MAX_PARTY, partyDef } from './party';
import { costOf, skillById, type Levels } from './skills';
import { grantTaught } from './skills7';
import { setHomeLand } from './titles';
import { t } from '../i18n';

export interface Totals {
  revenue: number;
  sold: number;
  customers: number;
  lost: number;
  stolen: number;
  caught: number;
  pests: number;
  crafted: number;
  orders: number;
  chests: number;
}

/** Bump when the save shape changes, and add a step to MIGRATIONS. */
export const SAVE_VERSION = 7;

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
  /** autoBuy: 番頭 buys GUM skills after each day (once learned). */
  settings: {
    bgm: boolean;
    se: boolean;
    autoBuy: boolean;
    /** Drawing quality: auto drops to low on slow devices. */
    quality: 'auto' | 'high' | 'low';
    /** Color-vision friendly rarity colors, with rarity letters. */
    colorAssist: boolean;
    /** No confetti or UI animations (defaults to the system setting). */
    reduceMotion: boolean;
    /** On-screen alerts for events (always shown while sound effects are off). */
    alerts: boolean;
  };
  tips: string[];
  meta: {
    /** Epoch ms when this save was started. */
    createdAt: number;
    /** Epoch ms of the last write. */
    savedAt: number;
    /** In-game seconds spent in business days. */
    playSeconds: number;
  };
  /** Materials from the dismantler, and research points from the researcher. */
  resources: { dust: number; gems: Record<GemId, number>; research: number; emblem: number };
  /** Showcase contents carried over between days (null = empty). */
  showcase: (number | null)[];
  /** Condition of the next business day (weather, festival, land). */
  forecast: DayCondition;
  /** Reformed thieves who now shop as regulars (hero ids). */
  regulars: number[];
  /** Purchases per hero id (the hero collection and affinity). */
  heroes: Record<string, number>;
  /** Open orders (注文) for the coming business days. */
  orders: Order[];
  /** Heroes in the party (英雄の酒場), in order; only scouted ones take the floor. */
  party: number[];
  /** Achievement ids earned. */
  achievements: string[];
  /** Requests for the next business day. */
  dailies: Daily[];
  /** ランド移転 (prestige) progress across runs. */
  prestige: Prestige;
  /** Best edition crafted per extension id (for the collection). */
  bestEdition: Record<string, number>;
  /** 魔石 infused into each line for the next business day. */
  infusion: Partial<Record<LineId, GemId>>;
  /** The worldwide leaderboards (opt-in). */
  ranking: Ranking;
}

export interface Ranking {
  /** Random player id (32 hex digits); never shown to other players. */
  id: string;
  /** Nickname on the leaderboards. */
  name: string;
  /** Records are sent only after the player joins. */
  joined: boolean;
  /** Sales of the first run by the end of Day 30 (the early-game board). */
  day30: number | null;
  /** Signed in with Google: the record is linked to the account. */
  google: boolean;
  /** This device's key for a Google-linked record (issued by the server at sign-in). */
  secret: string | null;
}

const RANKING_ID = /^[0-9a-f]{32}$/;

export function newRanking(): Ranking {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return { id: [...bytes].map((b) => b.toString(16).padStart(2, '0')).join(''), name: '', joined: false, day30: null, google: false, secret: null };
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
  orders: 0,
  chests: 0,
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
    settings: {
      bgm: true,
      se: true,
      autoBuy: true,
      quality: 'auto',
      colorAssist: false,
      reduceMotion: typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches,
      alerts: false,
    },
    tips: [],
    meta: { createdAt: now, savedAt: now, playSeconds: 0 },
    resources: { dust: 0, gems: emptyGems(), research: 0, emblem: 0 },
    showcase: [],
    forecast: { kind: 'sunny' },
    regulars: [],
    heroes: {},
    orders: [],
    party: [],
    achievements: [],
    dailies: [],
    prestige: newPrestige(),
    bestEdition: {},
    infusion: {},
    ranking: newRanking(),
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
  // v3 → v4 (Phase 3): research points and the showcase.
  3: (d) => ({ ...d, version: 4, resources: { ...(d.resources as object), research: 0 }, showcase: [] }),
  // v4 → v5 (Phase 4): day conditions and reformed regulars.
  4: (d) => ({ ...d, version: 5, forecast: { kind: 'sunny' }, regulars: [] }),
  // v5 → v6 (Phase 5): the hero collection.
  // v6 → v7 (Phase 6): ランド移転.
  6: (d) => ({ ...d, version: 7, prestige: newPrestige() }),
  5: (d) => ({ ...d, version: 6, heroes: {}, orders: [], achievements: [], dailies: [], resources: { ...(d.resources as object), emblem: 0 } }),
};

export class SaveError extends Error {}

/** Upgrades any older save to SAVE_VERSION. Throws SaveError for unknown or future versions. */
export function migrate(raw: RawSave): RawSave {
  let d = { ...raw };
  let v = typeof d.version === 'number' ? d.version : 1;
  if (v > SAVE_VERSION) throw new SaveError(t(`このセーブデータは新しいバージョン（v${v}）のものです`, `This save is from a newer version (v${v})`));
  while (v < SAVE_VERSION) {
    const step = MIGRATIONS[v];
    if (!step) throw new SaveError(t(`v${v} のセーブデータは読み込めません`, `Saves from v${v} cannot be loaded`));
    d = step(d);
    v = d.version as number;
  }
  return d;
}

/**
 * Fixes a save against the current game data: unknown extension ids are dropped, and skill
 * levels that no longer exist (removed nodes, lowered max) are refunded in the node's currency.
 * Returns the GUM refunded.
 */
export function sanitize(data: SaveData): number {
  // Shelf and storage hold item codes (edition × 100000 + id), the collection plain ids.
  const known = (code: number) => extensionById.has(itemId(code));
  data.collection = data.collection.filter((id) => extensionById.has(id));
  // 幻獣の書 (added later) opens the beast rows: saves that already run the capsule get it free.
  if ((data.levels.capsuleLine ?? 0) > 0 && !data.levels.beastBook) data.levels.beastBook = 1;
  data.shelf = data.shelf.map((code) => (code !== null && known(code) ? code : null));
  data.storage = data.storage.filter(known);
  data.showcase = (data.showcase ?? []).map((code) => (code !== null && known(code) ? code : null));
  data.regulars = [...new Set(data.regulars ?? [])].filter((id) => heroById.has(id));
  data.orders = (data.orders ?? []).filter((o) => o.series < series.length && customers.some((c) => c.id === o.heroId));
  data.party = [...new Set(data.party ?? [])].filter((id) => !!partyDef(id)).slice(0, MAX_PARTY);
  // Scouted heroes' recipes are always learned.
  grantTaught(data.levels);
  // The land the workshop is on (its titles can be earned this run).
  setHomeLand(data.levels, data.prestige?.home ?? null);
  data.heroes = Object.fromEntries(Object.entries(data.heroes ?? {}).filter(([id, n]) => heroById.has(Number(id)) && n > 0));
  if (!data.forecast || !CONDITION_KINDS.includes(data.forecast.kind)) data.forecast = { kind: 'sunny' };
  data.bestEdition = Object.fromEntries(Object.entries(data.bestEdition ?? {}).filter(([id]) => extensionById.has(Number(id))));
  data.totals = { ...emptyTotals(), ...data.totals };

  let refund = 0;
  for (const [id, lv] of Object.entries(data.levels)) {
    const node = skillById.get(id);
    const keep = node ? Math.min(lv, node.max) : 0;
    if (node) {
      for (let l = keep; l < lv; l++) {
        if (node.currency) addTo(data, node.currency, costOf(node, l));
        else refund += costOf(node, l);
      }
    }
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
    throw new SaveError(t('セーブデータの形式が正しくありません', 'The save data is not in the right format'));
  }
  if (!raw || typeof raw !== 'object' || typeof raw.levels !== 'object') throw new SaveError(t('セーブデータの形式が正しくありません', 'The save data is not in the right format'));
  const base = newSave();
  const migrated = migrate(raw);
  const data = { ...base, ...migrated, meta: { ...base.meta, ...(migrated.meta as object) } } as SaveData;
  const res = (migrated.resources ?? {}) as Partial<SaveData['resources']>;
  data.prestige = { ...newPrestige(), ...(migrated.prestige as object) };
  data.settings = { ...base.settings, ...(migrated.settings as object) };
  data.ranking = { ...base.ranking, ...(migrated.ranking as object) };
  if (!RANKING_ID.test(data.ranking.id)) data.ranking.id = base.ranking.id;
  data.resources = { dust: res.dust ?? 0, gems: { ...emptyGems(), ...res.gems }, research: res.research ?? 0, emblem: res.emblem ?? 0 };
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
  if (!trimmed.startsWith(CODE_PREFIX)) throw new SaveError(t('My Crypto Workshop のセーブコードではありません', 'This is not a My Crypto Workshop save code'));
  let json: string;
  try {
    const bin = atob(trimmed.slice(CODE_PREFIX.length));
    json = new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
  } catch {
    throw new SaveError(t('セーブコードが壊れています（途中で切れていないか確認してください）', 'The save code is broken (check that it was not cut off)'));
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
