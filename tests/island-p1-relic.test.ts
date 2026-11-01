/**
 * 発掘 v2 の 3 段目：復刻品（docs/ISLAND_PHASE1.md「3. 復刻品」）。
 * 研究 Lv3 でレシピが開く・お題は即・同じ遺物は同じレシピ・作れる（技なし）・素材が足りないと理由・売れる・
 * 独占の 4 か月は他社が来ない・切れたら後追い・ニュース・市場データの組み立て・セーブの読み書き。
 */
import { describe, expect, it } from 'vitest';
import { DIG, DIG_BALANCE, DIG_SITES, ENTRY_AFTER, PRODUCT, PRODUCTS, RELICS, RESEARCH_NEED, TIERS, isRelic, relicKey, relicOf, relicRecipe, skuParts, skuPrice, type Mat } from '../src/island/p1/data';
import { relicLine } from '../src/island/p1/digview';
import { relicEnding } from '../src/island/p1/digmeet';
import {
  DAYS,
  allowedDirs,
  assign,
  build,
  craftCheck,
  deserializeP1,
  dig,
  digLayout,
  endMonth,
  endRun,
  market,
  monopolyEnd,
  monopolyLeft,
  needFor,
  newP1,
  openRelic,
  openRelics,
  productsOf,
  relicMarket,
  relicSku,
  relicsSoon,
  sellersOf,
  serializeP1,
  setShelf,
  startCraft,
  setLevel,
  startRun,
  step,
  tutSpot,
  type DigFind,
  type DigHit,
  type P1State,
} from '../src/island/p1/model';

const LV3 = RESEARCH_NEED[DIG_BALANCE.relic.openLv - 1];
/** ユーホタウン（c2）の出土品のはじめ（Common の素材だけ） */
const EXT = DIG_SITES.c2.finds[0];
const KEY = relicKey(EXT);

/** 研究を n 個ぶんにして、レシピを開く */
function research(s: P1State, ext: number, n = LV3) {
  s.research[ext] = n;
  return openRelic(s, ext);
}
/** 工房とお店を建てて、3 人を配置（タオックス以外は飽和・認知が効く） */
function town(sector = 'c2'): P1State {
  const s = newP1(1, 'C', sector);
  s.money = 1e7;
  s.tut = 99;
  for (const id of ['workshop', 'general_store']) {
    const at = tutSpot(s, id) ?? lotOf(s, id);
    const b = build(s, id, ...at);
    if (typeof b === 'string') throw new Error(b);
  }
  for (let d = 0; d < 12; d++) step(s);
  const shop = s.buildings.find((b) => b.owner === 'me' && b.id === 'general_store')!;
  assign(s, 10003, 'craft', 0);
  assign(s, 10001, 'transport');
  assign(s, 10002, 'shop', shop.uid);
  return s;
}
function lotOf(s: P1State, id: string): [number, number, 'rd' | 'ld' | 'lu' | 'ru'] {
  for (let j = 0; j < s.n; j++) for (let i = 0; i < s.n; i++) {
    const d = allowedDirs(s, id, i, j);
    if (d.length) return [i, j, d[0]];
  }
  throw new Error('no lot');
}

describe('復刻品のデータ', () => {
  it('発掘で出るエクステ 1 つに 1 つ（いまの 17 商品とキーが重ならない）。ランクは出たセクタのランク', () => {
    const ids = new Set(Object.values(DIG_SITES).flatMap((d) => [...d.topics, ...d.finds]));
    expect(RELICS).toHaveLength(ids.size);
    for (const p of RELICS) {
      expect(isRelic(p.key)).toBe(true);
      expect(PRODUCTS.some((x) => x.key === p.key)).toBe(false);
      expect(PRODUCT[p.key]).toBe(p);
      expect(p.relic!.rank).toBe(p.relic!.ext < 2000 ? 'C' : 'U');
      expect(p.tech).toBeUndefined();
    }
    expect(relicOf(1122)?.name).toContain('復刻');
  });

  it('同じ遺物はいつも同じレシピ。素材はそのランクの発掘の素材（C：2 種・U：布・紙・宝石 1〜2 種＋ C の 1 種）', () => {
    for (const p of RELICS) {
      const r = relicRecipe(p.relic!.ext, p.relic!.rank);
      expect(relicRecipe(p.relic!.ext, p.relic!.rank)).toEqual(r);
      expect(p.recipe[p.relic!.rank]).toEqual(r);
      const ms = Object.keys(r) as Mat[];
      const total = Object.values(r).reduce<number>((a, q) => a + (q ?? 0), 0);
      if (p.relic!.rank === 'C') {
        expect(ms).toHaveLength(2);
        expect(ms.every((m) => DIG.C.mats.includes(m))).toBe(true);
        expect(total).toBe(6);
      } else {
        const u = ms.filter((m) => DIG.U.mats.includes(m));
        expect(u.length).toBeGreaterThanOrEqual(1);
        expect(u.length).toBeLessThanOrEqual(2);
        expect(ms.filter((m) => DIG.C.mats.includes(m))).toHaveLength(1);
        expect(total).toBeGreaterThanOrEqual(7);
        expect(total).toBeLessThanOrEqual(8);
      }
    }
  });

  it('売値は同じランクの商品の平均 × 1.25（±10%）', () => {
    const base = PRODUCTS.filter((p) => !p.tier);
    const avg = base.reduce((a, p) => a + p.price, 0) / base.length;
    for (const p of RELICS) {
      expect(p.price).toBeGreaterThanOrEqual(avg * DIG_BALANCE.relic.priceMul * 0.9 - 10);
      expect(p.price).toBeLessThanOrEqual(avg * DIG_BALANCE.relic.priceMul * 1.1 + 10);
    }
  });
});

describe('レシピの開き方', () => {
  it('研究 Lv3 になった瞬間に、会社で開く（Lv2 では開かない・2 回目は開かない）', () => {
    const s = newP1(1, 'C', 'c2');
    expect(research(s, EXT, RESEARCH_NEED[1])).toBeNull();
    expect(s.recipes[KEY]).toBeUndefined();
    expect(research(s, EXT)).toBe(KEY);
    expect(s.recipes[KEY]).toEqual({ at: s.day });
    expect(research(s, EXT, LV3 + 1)).toBeNull();
    expect(openRelics(s).map((p) => p.key)).toEqual([KEY]);
    expect(productsOf(s).map((p) => p.key)).toEqual([...PRODUCTS.map((p) => p.key), KEY]);
    // 開いたら、このセクタの需要が入る（ランクの需要 × 町の大きさ）
    expect(s.demand[KEY]).toBe(DIG_BALANCE.relic.demandBase * TIERS.C.demand);
  });

  it('掘って研究 Lv3 になると、打った結果と発掘作業の出土に「新しいレシピ」。お題は掘った時点で Lv5 なので即', () => {
    const s = newP1(1, 'C', 'c1');
    s.money = 1e7;
    const L = digLayout('c1', 0)!;
    s.dig!.sites[0].permit = true;
    const r = startRun(s, 0);
    if (typeof r === 'string') throw new Error(r);
    // （お題が岩盤にあっても掘れるように、深い層の許可 Lv1）
    setLevel(s, 'dig_deep', 1);
    const breakCell = (x: number, y: number): DigHit => {
      for (let k = 0; k < 20; k++) {
        const h = dig(s, x, y);
        if (typeof h === 'string') throw new Error(h);
        if (h.broke) return h;
      }
      throw new Error('not broken');
    };
    /** 埋まっているもの f の層まで、手前から掘る */
    const digTo = (f: DigFind) => {
      for (;;) {
        const h = breakCell(f.x, f.y);
        if (h.layer >= f.layer) return h;
      }
    };
    // 出土品：あと 1 個で Lv3 にしておく
    const f = L.finds.find((g) => g.item.kind === 'ext' && !g.item.topic)!;
    const id = (f.item as { id: number }).id;
    s.research[id] = LV3 - 1;
    const hit = digTo(f);
    expect(hit.recipe).toBe(relicKey(id));
    // お題：掘った時点で Lv5 → 即
    if (L.topic) {
      const ft = L.finds.find((g) => g.item.kind === 'ext' && !!g.item.topic)!;
      expect(digTo(ft).recipe).toBe(relicKey(L.topic));
    }
    const end = endRun(s)!;
    expect(end.got.recipes).toEqual(L.topic ? [relicKey(id), relicKey(L.topic)] : [relicKey(id)]);
  });

  it('研究ノートの 1 行：Lv3 で復刻品のレシピ／復刻品：作れる', () => {
    expect(relicLine({ id: EXT, lv: 2 })).toEqual([expect.stringContaining('Lv3'), false]);
    expect(relicLine({ id: EXT, lv: 3 })).toEqual([expect.any(String), true]);
    expect(relicLine({ id: 1032, lv: 5 })).toBeNull();
  });
});

describe('作る・売る', () => {
  it('技・魔法の釜・商品開発は要らない。レシピがまだなら理由、素材が足りなければ理由', () => {
    const s = town();
    const x = relicSku(KEY);
    expect(craftCheck(s, x, 10003)).toBe('relic');
    research(s, EXT);
    for (const m of Object.keys(s.mats) as Mat[]) s.mats[m] = 0;
    expect(craftCheck(s, x, 10003)).toBe('mats');
    expect(needFor(s, KEY)).toBeNull();
    s.mats = { iron: 12, wood: 12, clay: 12, glass: 12 };
    expect(craftCheck(s, x, 10003)).toBeNull();
    expect(startCraft(s, 0, x)).toBeNull();
    // Uncommon の遺物：布・紙・宝石のルートが開いていなければ「足りないもの」に出る（魔法の釜・開発は出ない）
    const u = DIG_SITES.u1.finds[0];
    research(s, u);
    const need = needFor(s, relicKey(u));
    expect(need?.kind).toBe('route');
    expect(skuParts(relicSku(relicKey(u)))[1]).toBe('U');
  });

  it('棚に並べると売れる（売上に入り、初めて売れた日から独占）。月次報告に「うち復刻品」', () => {
    const s = town();
    research(s, EXT);
    const fill = () => (s.mats = { iron: 12, wood: 12, clay: 12, glass: 12 });
    fill();
    const x = relicSku(KEY);
    s.slots[0].sku = x;
    expect(startCraft(s, 0, x)).toBeNull();
    const shop = s.buildings.find((b) => b.owner === 'me' && b.id === 'general_store')!;
    setShelf(s, shop.uid, 0, x);
    let rep = null;
    for (let d = 0; d < 70 && !s.recipes[KEY].sold; d++) {
      fill();
      step(s);
    }
    expect(s.recipes[KEY].sold).toBeGreaterThan(0);
    for (let d = 0; d < 40; d++) {
      fill();
      const r = step(s);
      if (r.report) rep = r.report;
    }
    expect(rep?.relic ?? 0).toBeGreaterThan(0);
    expect(rep?.bySeries[KEY]).toBe(rep?.relic);
    expect(skuPrice(x)).toBe(PRODUCT[KEY].price);
  });
});

describe('独占 → 後追い', () => {
  /** 毎月、自社だけが復刻品を売った月の締め */
  const close = (s: P1State) => {
    s.monthSales[KEY] = 30000;
    s.day += DAYS;
    return endMonth(s);
  };
  it('初めて売った月から monopolyMonths（v13：3）か月は、どの他社も真似しない。切れたら 1 社目が真似を始め（ニュース）、ENTRY_AFTER か月で 2 社目（飽和）', () => {
    const s = newP1(1, 'C', 'c2');
    research(s, EXT);
    expect(monopolyLeft(s, KEY)).toBe(DIG_BALANCE.relic.monopolyMonths);
    s.recipes[KEY].sold = s.day;
    const months = DIG_BALANCE.relic.monopolyMonths;
    for (let m = 1; m < months; m++) {
      const r = close(s);
      expect(sellersOf(s, KEY), `month ${m}`).toBe(0);
      expect(r.news).toEqual([]);
      expect(monopolyLeft(s, KEY)).toBe(months - m);
    }
    // 残り 1 か月：マインちゃんの助言の対象
    expect(relicEnding(s)?.key).toBe(KEY);
    // 独占が切れた月の締め：1 社目（ニュースは「真似しはじめた」）
    const r = close(s);
    expect(monopolyLeft(s, KEY)).toBe(0);
    expect(sellersOf(s, KEY)).toBe(1);
    expect(r.news).toHaveLength(1);
    expect(r.news[0]).toMatch(/\|copy$/);
    expect(r.news[0]).toContain(PRODUCT[KEY].name);
    // そのあとは gap の商品と同じ：ENTRY_AFTER か月で 2 社目（飽和）
    for (let m = 1; m < ENTRY_AFTER; m++) close(s);
    expect(sellersOf(s, KEY)).toBe(1);
    close(s);
    expect(sellersOf(s, KEY)).toBe(2);
  });

  it('まだ売っていない復刻品は、何か月たっても独占のまま（売った月から数える）', () => {
    const s = newP1(1, 'C', 'c2');
    research(s, EXT);
    for (let m = 0; m < 8; m++) {
      s.day += DAYS;
      endMonth(s);
    }
    expect(monopolyLeft(s, KEY)).toBe(DIG_BALANCE.relic.monopolyMonths);
    expect(sellersOf(s, KEY)).toBe(0);
  });
});

describe('市場データの組み立て', () => {
  it('復刻品は別のまとまり（開いた順・独占の残り・作れるか）。いつもの一覧には入れない。まだのものは研究 Lv の高い順のシルエット', () => {
    const s = newP1(1, 'C', 'c2');
    expect(relicMarket(s)).toEqual([]);
    const other = DIG_SITES.c2.finds[1];
    s.research[other] = 2;
    expect(relicsSoon(s).map((x) => [x.p.key, x.lv])).toEqual([[relicKey(other), 2]]);
    research(s, EXT);
    s.day += 3;
    research(s, other);
    const rows = relicMarket(s);
    expect(rows.map((r) => r.p.key)).toEqual([KEY, relicKey(other)]);
    expect(rows[0]).toMatchObject({ x: relicSku(KEY), sellers: 0, saturated: false, mine: false, need: null, left: DIG_BALANCE.relic.monopolyMonths, started: false });
    expect(rows[0].demand).toBeGreaterThan(0);
    expect(market(s).some((r) => isRelic(r.p.key))).toBe(false);
    expect(relicsSoon(s)).toEqual([]);
  });
});

describe('セーブ', () => {
  it('レシピと独占の開始の日が残る。以前のセーブ（recipes が無い）は、研究 Lv3 以上の遺物を開いて読む', () => {
    const s = newP1(1, 'C', 'c2');
    research(s, EXT);
    s.recipes[KEY].sold = 42;
    const back = deserializeP1(serializeP1(s))!;
    expect(back.recipes).toEqual(s.recipes);
    expect(monopolyEnd(back, KEY)).toBe(42 + DIG_BALANCE.relic.monopolyMonths * DAYS);
    const old = JSON.parse(serializeP1(s));
    delete old.recipes;
    const o2 = deserializeP1(JSON.stringify(old))!;
    expect(Object.keys(o2.recipes)).toEqual([KEY]);
    expect(o2.demand[KEY]).toBeGreaterThan(0);
  });
});
