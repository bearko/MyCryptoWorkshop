// テストモード（?test=1）：本番と別のセーブ、外への送信なし
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { exitTestUrl, isTestSearch, saveKeys } from '../src/testMode';

describe('テストモードの判定', () => {
  it('?test=1 のときだけテストモード', () => {
    expect(isTestSearch('?test=1')).toBe(true);
    expect(isTestSearch('?lang=en&test=1')).toBe(true);
    expect(isTestSearch('')).toBe(false);
    expect(isTestSearch('?test=0')).toBe(false);
    expect(isTestSearch('?test')).toBe(false);
  });

  it('セーブは本番と別のキー', () => {
    expect(saveKeys(false).key).toBe('mycryptoworkshop.save');
    expect(saveKeys(true).key).not.toBe(saveKeys(false).key);
    expect(saveKeys(true).backup).not.toBe(saveKeys(false).backup);
  });

  it('通常に戻る URL は test だけを外す', () => {
    expect(exitTestUrl('https://workshop.bearko.games/?test=1&lang=en')).toBe('https://workshop.bearko.games/?lang=en');
    expect(exitTestUrl('https://workshop.bearko.games/?test=1')).toBe('https://workshop.bearko.games/');
  });
});

describe('テストモードでは外に送らない', () => {
  // TEST_MODE は読み込んだときの URL で決まるので、毎回読み直す
  beforeEach(() => vi.resetModules());
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  const stubSdk = () => {
    const sdk = { init: vi.fn(async () => ({})), submitScore: vi.fn(async () => ({ ok: true })), unlockTrophy: vi.fn(async () => ({ ok: true })) };
    vi.stubGlobal('window', { BearkoGames: sdk, addEventListener: () => undefined });
    return sdk;
  };

  it('?test=1 では共通基盤に初期化もスコアも送らない', async () => {
    vi.stubGlobal('location', { search: '?test=1', href: 'https://workshop.bearko.games/?test=1' });
    const sdk = stubSdk();
    const { initPlatform, reportScore } = await import('../src/net/platform');
    const { newSave } = await import('../src/game/save');
    initPlatform('test');
    reportScore(newSave());
    expect(sdk.init).not.toHaveBeenCalled();
    expect(sdk.submitScore).not.toHaveBeenCalled();
  });

  it('通常は送る（比較のため）', async () => {
    vi.stubGlobal('location', { search: '', href: 'https://workshop.bearko.games/' });
    const sdk = stubSdk();
    const { initPlatform, reportScore } = await import('../src/net/platform');
    const { newSave } = await import('../src/game/save');
    initPlatform('test');
    reportScore(newSave());
    expect(sdk.init).toHaveBeenCalled();
    expect(sdk.submitScore).toHaveBeenCalled();
  });

  it('?test=1 ではランキングへの送信を断る（通信しない）', async () => {
    vi.stubGlobal('location', { search: '?test=1', href: 'https://workshop.bearko.games/?test=1' });
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    const { submit } = await import('../src/net/leaderboard');
    const { newSave } = await import('../src/game/save');
    const save = newSave();
    Object.assign(save.ranking, { joined: true, name: 'tester' });
    await expect(submit(save, 1)).rejects.toThrow();
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
