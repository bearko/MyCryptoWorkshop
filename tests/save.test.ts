import { describe, expect, it } from 'vitest';
import { exportCode, importCode, migrate, newSave, parseSave, sanitize, SAVE_VERSION, SaveError } from '../src/game/save';
import { costOf, skillById } from '../src/game/skills';

/** A save as written by the MVP (version 1, no meta). */
const v1 = {
  version: 1,
  gum: 500,
  day: 5,
  levels: { root: 1, craftSpeed: 3, shelf: 2 },
  collection: [1001, 2001],
  shelf: [1001, null, 2001],
  storage: [],
  totals: { revenue: 900, sold: 40, customers: 50, lost: 2, stolen: 1, caught: 3, pests: 0, crafted: 45 },
  bestDayRevenue: 300,
  settings: { bgm: false, se: true },
  tips: ['welcome'],
};

describe('save migration', () => {
  it('upgrades a v1 save to the current version and keeps progress', () => {
    const data = parseSave(JSON.stringify(v1));
    expect(data.version).toBe(SAVE_VERSION);
    expect(data.gum).toBe(500);
    expect(data.day).toBe(5);
    expect(data.levels).toEqual({ root: 1, craftSpeed: 3, shelf: 2 });
    expect(data.settings.bgmVolume).toBe(0);
    expect(data.settings.seVolume).toBe(1);
    expect(data.meta.playSeconds).toBeGreaterThan(0);
  });

  it('turns the v7 BGM / SE switches into volumes (on → 100%, off → OFF)', () => {
    const v7 = { ...newSave(), version: 7, settings: { bgm: true, se: false, autoBuy: false } } as Record<string, unknown>;
    const data = parseSave(JSON.stringify(v7));
    expect(data.version).toBe(SAVE_VERSION);
    expect(data.settings).toMatchObject({ bgmVolume: 1, seVolume: 0, autoBuy: false });
    expect(data.settings).not.toHaveProperty('bgm');
    expect(data.settings).not.toHaveProperty('se');
  });

  it('keeps volumes within 0..1 and falls back to full loudness for broken ones', () => {
    const d = { ...newSave(), settings: { ...newSave().settings, bgmVolume: 0.45, seVolume: 'loud' } } as Record<string, unknown>;
    const data = parseSave(JSON.stringify(d));
    expect(data.settings.bgmVolume).toBe(0.45);
    expect(data.settings.seVolume).toBe(1);
    expect(parseSave(JSON.stringify({ ...newSave(), settings: { bgmVolume: 7, seVolume: -1 } })).settings).toMatchObject({ bgmVolume: 1, seVolume: 0 });
  });

  it('rejects saves from a newer version instead of corrupting them', () => {
    expect(() => migrate({ version: SAVE_VERSION + 1 })).toThrow(SaveError);
  });

  it('rejects things that are not saves', () => {
    expect(() => parseSave('not json')).toThrow(SaveError);
    expect(() => parseSave('{"foo":1}')).toThrow(SaveError);
  });
});

describe('sanitize', () => {
  it('refunds levels above a node max and drops unknown nodes and extensions', () => {
    const data = newSave();
    const node = skillById.get('shelf')!;
    data.levels = { root: 1, shelf: node.max + 2, removedNode: 3 };
    data.collection = [1001, 999999];
    data.shelf = [999999, 1001];
    const refund = sanitize(data);
    expect(refund).toBe(costOf(node, node.max) + costOf(node, node.max + 1));
    expect(data.gum).toBe(refund);
    expect(data.levels).toEqual({ root: 1, shelf: node.max });
    expect(data.collection).toEqual([1001]);
    expect(data.shelf).toEqual([null, 1001]);
  });
});

describe('save codes', () => {
  it('round-trips through export and import', () => {
    const data = parseSave(JSON.stringify(v1));
    const back = importCode(exportCode(data));
    expect(back).toEqual(data);
  });

  it('explains bad codes', () => {
    expect(() => importCode('hello')).toThrow(/セーブコードではありません/);
    expect(() => importCode('MCW:@@@')).toThrow(SaveError);
  });
});
