// 生成した画像（スプライトシート・窓の景色）の URL には中身のハッシュが入る。
// シートの中身（セルの番号）が変わると URL も変わるので、古いキャッシュの絵がずれて出ることがない
import { describe, expect, it } from 'vitest';
import raw from '../src/generated/catalog.json';

describe('生成した画像の URL', () => {
  it('mch-atlas/ の URL はすべて <名前>.<ハッシュ 10 桁>.png', () => {
    const urls = JSON.stringify(raw).match(/mch-atlas\/[^"]+/g) ?? [];
    expect(urls.length).toBeGreaterThan(10);
    expect(urls.filter((u) => !/^mch-atlas\/[\w-]+\.[0-9a-f]{10}\.png$/.test(u))).toEqual([]);
  });
});
