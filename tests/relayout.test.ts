// 営業中に店の床を並べ直したとき（窓の形が変わった・チャットを表示した / 隠した）
import { afterEach, describe, expect, it } from 'vitest';
import { newSave } from '../src/game/save';
import { Shop } from '../src/game/shop';
import { MIN_SCENE_H, MAX_SCENE_H, SCENE_H, setSceneHeight } from '../src/game/layout';
import { seeded } from '../src/game/balance/autoplay';

afterEach(() => setSceneHeight(MIN_SCENE_H));

describe('Shop.relayout', () => {
  it('床が短くなったら、下の端より下にいた人と歩く先を床の中に戻す', () => {
    setSceneHeight(MAX_SCENE_H);
    const save = newSave(0);
    save.day = 5;
    const shop = new Shop(save, seeded(1));
    for (let i = 0; i < 400 && shop.actors.length < 3; i++) shop.update(0.25);
    expect(shop.actors.length).toBeGreaterThan(0);
    const a = shop.actors[0] as unknown as { x: number; y: number; path?: { x: number; y: number }[] };
    a.y = MAX_SCENE_H - 30;
    a.path = [{ x: 100, y: MAX_SCENE_H - 25 }];
    const others = shop.actors.slice(1).map((o) => (o as unknown as { y: number }).y);
    setSceneHeight(MIN_SCENE_H);
    shop.relayout();
    expect(a.y).toBe(SCENE_H - 20);
    expect(a.path[0].y).toBe(SCENE_H - 20);
    // 床の中にいた人はそのまま
    shop.actors.slice(1).forEach((o, i) => expect((o as unknown as { y: number }).y).toBe(Math.min(others[i], SCENE_H - 20)));
  });
});
