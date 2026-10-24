// テストモードのデバッグパネル：テスト用のセーブだけを変える
import { describe, expect, it } from 'vitest';
import { newSave } from '../src/game/save';
import { testActions } from '../src/ui/testPanel';

describe('デバッグパネルの操作', () => {
  it('本番のセーブを写す（設定はテスト側のまま、本番のセーブは変えない）', () => {
    const current = newSave();
    current.settings.bgmVolume = 0;
    const prod = newSave();
    prod.day = 42;
    prod.gum = 12345;
    prod.settings.bgmVolume = 1;
    const copied = testActions.copyProduction(current, prod);
    expect(copied.day).toBe(42);
    expect(copied.gum).toBe(12345);
    expect(copied.settings.bgmVolume).toBe(0);
    expect(prod.settings.bgmVolume).toBe(1);
  });

  it('最初からは Day 1、設定は残す', () => {
    const current = newSave();
    current.day = 30;
    current.settings.seVolume = 0.25;
    const fresh = testActions.reset(current);
    expect(fresh.day).toBe(1);
    expect(fresh.settings.seVolume).toBe(0.25);
  });

  it('GUM を足す・日を進める（元のセーブは変えない）', () => {
    const current = newSave();
    const richer = testActions.addGum(current, 1e6);
    expect(richer.gum).toBe(current.gum + 1e6);
    expect(testActions.skipDays(current, 7).day).toBe(current.day + 7);
    expect(testActions.skipDays(current, -99).day).toBe(1);
    expect(current.day).toBe(1);
  });
});
