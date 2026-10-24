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
    expect(testActions.addGum(current, 6e11).gum).toBe(current.gum + 6e11);
    const dusty = testActions.addDust(current, 1e5);
    expect(dusty.resources.dust).toBe(current.resources.dust + 1e5);
    expect(current.resources.dust).toBe(0);
    expect(testActions.skipDays(current, 7).day).toBe(current.day + 7);
    expect(testActions.skipDays(current, -99).day).toBe(1);
    expect(current.day).toBe(1);
  });
});

describe('デバッグパネル：経営モード', () => {
  it('会社を作り、資金を足し、月を進め、種を決める', () => {
    const s0 = newSave();
    expect(() => testActions.addFunds(s0, 1)).toThrow();
    const s1 = testActions.foundEmpire(s0, 1);
    expect(s1.empire?.month).toBe(0);
    const s2 = testActions.addFunds(s1, 1e8);
    expect(s2.empire!.funds).toBe(s1.empire!.funds + 1e8);
    const s3 = testActions.advanceMonths(s2, 12);
    expect(s3.empire?.month).toBe(12);
    expect(s3.empire?.history).toHaveLength(12);
    expect(testActions.setSeed(s3, 1).empire?.rng).toBe(1);
    // 同じ種からは同じ結果
    expect(testActions.advanceMonths(testActions.foundEmpire(s0, 1), 12).empire?.funds).toBe(testActions.advanceMonths(s1, 12).empire?.funds);
  });
});

describe('デバッグパネル：マインちゃんの登場', () => {
  it('登場条件を満たすと、会社があっても消えて誘いから始められる', async () => {
    const { empireUnlocked } = await import('../src/empire/unlock');
    const withCompany = testActions.foundEmpire(newSave(), 1);
    expect(withCompany.empire).not.toBeNull();
    const s = testActions.meetUnlock(withCompany);
    expect(s.empire).toBeNull();
    expect(empireUnlocked(s.prestige)).toBe(true);
  });
});
