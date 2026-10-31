/**
 * 地層の発掘と研究ポイント（docs/ISLAND_PHASE1.md「地層の発掘と研究ポイント」）：データと仕組み。
 * 配置・お題・ツルハシの回数・硬さ・研究レベルと RP・石板・道具・自動発掘・研究／お金パネル・✨ → RP・調査依頼状・古いセーブの移し替え。
 */
import { describe, expect, it } from 'vitest';
import { DIG, DIG_SITES, MISSIONS, MONEY_PANELS, RESEARCH_NEED, RP_GAIN, RP_PER_DUST, SKILL, SKILLS, START_RP, TABLETS, aptitude, isResearch, levelCost, maxLv, rpCost, researchLv } from '../src/island/p1/data';
import { moveTo } from '../src/island/p1/land';
import {
  addPicks,
  allowedDirs,
  assign,
  blast,
  build,
  claim,
  deserializeP1,
  dig,
  digCheck,
  digLayout,
  digNext,
  digPower,
  hasLetter,
  invest,
  learn,
  levelUp,
  lvOf,
  myWorkshop,
  newDig,
  newP1,
  openGate,
  peek,
  picksCap,
  present,
  presentLock,
  researchLeft,
  researchOf,
  serializeP1,
  setLevel,
  setShelf,
  step,
  topicProgress,
  type DigHit,
  type P1State,
} from '../src/island/p1/model';
import { SECTOR_KEYS } from '../src/island/p1/land';

const lot = (s: P1State, id: string): [number, number, 'rd' | 'ld' | 'lu' | 'ru'] => {
  for (let j = 0; j < s.n; j++) for (let i = 0; i < s.n; i++) { const d = allowedDirs(s, id, i, j); if (d.length) return [i, j, d[0]]; }
  throw new Error('no lot');
};
/** 工房を建てて、ツルハシの回数をたっぷり */
function site(seed = 1, sector = 'c1', tier: 'C' | 'U' = 'C'): P1State {
  const s = newP1(seed, tier, sector);
  s.money = 1e7;
  const b = build(s, 'workshop', ...lot(s, 'workshop'));
  if (typeof b === 'string') throw new Error(b);
  b.left = 0;
  return s;
}
/** そのマスが崩れるまで打つ（回数を足しながら） */
function breakCell(s: P1State, x: number, y: number): DigHit {
  for (let k = 0; k < 20; k++) {
    s.dig!.picks = Math.max(1, s.dig!.picks);
    const r = dig(s, x, y);
    if (typeof r === 'string') throw new Error(`${x},${y}: ${r}`);
    if (r.broke) return r;
  }
  throw new Error('not broken');
}
/** (x, y) まで上から掘り進めて、そのマスを崩す */
function digTo(s: P1State, x: number, y: number): DigHit {
  for (let yy = 0; yy < y; yy++) if (s.dig!.hp[yy * 7 + x] > 0) breakCell(s, x, yy);
  return breakCell(s, x, y);
}

describe('地層の配置', () => {
  it('Common は 3 層・横 7 × 縦 30、Uncommon は 4 層・横 7 × 縦 40。Rare 以降は発掘場が無い', () => {
    const c = digLayout('c1')!;
    expect([c.tier, c.w, c.h, c.rows]).toEqual(['C', 7, 30, [0, 10, 20]]);
    const u = digLayout('u1')!;
    expect([u.tier, u.w, u.h, u.rows]).toEqual(['U', 7, 40, [0, 10, 20, 30]]);
    expect(digLayout('r1')).toBeNull();
    expect(newP1(1, 'R', 'r1').dig).toBeNull();
  });

  it('配置はセクタの種から決まり、ゲームの種が違っても同じ（何度遊んでも同じ配置）', () => {
    const a = newP1(1).dig!;
    const b = newP1(987654).dig!;
    expect(a.hp).toEqual(b.hp);
    expect(newDig('c1')!.hp).toEqual(a.hp);
    expect(newDig('c2')!.hp).not.toEqual(a.hp);
  });

  it('お題は各層にちょうど 1 つ（上の層から DIG_SITES の順）。石板は Common 1 枚・Uncommon 2 枚', () => {
    for (const id of Object.keys(DIG_SITES)) {
      const L = digLayout(id)!;
      const D = DIG[L.tier];
      D.layers.forEach((_, layer) => {
        const topics = L.cells.filter((c) => c.layer === layer && c.item?.kind === 'ext' && c.item.topic);
        expect(topics, `${id} 層 ${layer}`).toHaveLength(1);
        expect(topics[0].item).toMatchObject({ id: DIG_SITES[id].topics[layer] });
      });
      const tabs = L.cells.filter((c) => c.item?.kind === 'tablet');
      expect(tabs.length, id).toBe(L.tier === 'C' ? 1 : 2);
      // お題以外の出土品は、そのセクタの finds から（何度も出る）
      const finds = L.cells.filter((c) => c.item?.kind === 'ext' && !c.item.topic).map((c) => (c.item as { id: number }).id);
      for (const f of finds) expect(DIG_SITES[id].finds).toContain(f);
      expect(new Set(finds).size).toBeGreaterThan(DIG_SITES[id].finds.length / 2);
    }
  });

  it('出土品の数：Common はお題 3・お題以外 8、Uncommon はお題 4・お題以外 10。お題はほかのセクタの出土品に入らない', () => {
    const topics = Object.values(DIG_SITES).flatMap((x) => x.topics);
    const finds = new Set(Object.values(DIG_SITES).flatMap((x) => x.finds));
    expect(new Set(topics).size).toBe(topics.length);
    for (const t of topics) expect(finds.has(t)).toBe(false);
    for (const [id, x] of Object.entries(DIG_SITES)) {
      expect([x.topics.length, x.finds.length], id).toEqual(id.startsWith('c') ? [3, 8] : [4, 10]);
      for (const e of [...x.topics, ...x.finds]) expect(Math.floor(e / 1000), `${id} ${e}`).toBe(id.startsWith('c') ? 1 : 2);
    }
    // 石板は C 8 枚・U 10 枚・Rare 以降は枠だけ
    expect(TABLETS.filter((x) => !x.soon)).toHaveLength(18);
    expect(TABLETS.filter((x) => x.soon).length).toBeGreaterThan(0);
  });

  it('発掘場の進み具合はセクタごと（SECTOR_KEYS）', () => {
    expect(SECTOR_KEYS).toContain('dig');
  });
});

describe('ツルハシの回数と硬さ', () => {
  it('回数は自社のお店で売れたぶんだけたまり、上限で止まる（Common 30・Uncommon 60）', () => {
    const s = site(3);
    const shop = build(s, 'general_store', ...lot(s, 'general_store'));
    if (typeof shop === 'string') throw new Error(shop);
    shop.left = 1;
    step(s);
    assign(s, 10002, 'shop', shop.uid);
    setShelf(s, shop.uid, 0, 'Sensu:C');
    s.shops[shop.uid].shelf['Sensu:C'] = 10;
    s.shops[shop.uid].aw = 1;
    let sold = 0;
    s.dig!.picks = 0;
    for (let d = 0; d < 6; d++) sold += step(s).sales.length;
    expect(sold).toBeGreaterThan(0);
    expect(s.dig!.picks).toBe(Math.min(30, sold));
    addPicks(s, 999);
    expect(s.dig!.picks).toBe(30);
    expect(picksCap(newP1(1, 'U', 'u1'))).toBe(60);
  });

  it('回数が 0 なら打てない・届かないマスは打てない・工房が無いと掘れない', () => {
    const s = site();
    s.dig!.picks = 0;
    expect(digCheck(s, 0, 0)).toBe('no-picks');
    s.dig!.picks = 5;
    expect(digCheck(s, 0, 5)).toBe('far');
    expect(digCheck(s, 9, 0)).toBe('out');
    expect(digCheck(s, 0, 0)).toBeNull();
    const bare = newP1(1);
    bare.dig!.picks = 5;
    expect(dig(bare, 0, 0)).toBe('no-workshop');
  });

  it('1 回で 1 打。マスの硬さのぶん打つと崩れる（Common 1〜3・Uncommon 3〜5）', () => {
    const L = digLayout('c1')!;
    expect(Math.min(...L.cells.map((c) => c.hard))).toBe(1);
    expect(Math.max(...L.cells.map((c) => c.hard))).toBe(3);
    const U = digLayout('u1')!;
    expect(Math.min(...U.cells.map((c) => c.hard))).toBe(3);
    expect(Math.max(...U.cells.map((c) => c.hard))).toBe(5);
    // 岩盤（Common の 3 層目）の 2 回以上のマスまで掘って、回数どおりに崩れる
    const s = site();
    const k = L.cells.findIndex((c, i) => c.hard >= 2 && i % 7 === 0);
    const y = Math.floor(k / 7);
    for (let yy = 0; yy < y; yy++) if (s.dig!.hp[yy * 7] > 0) breakCell(s, 0, yy);
    s.dig!.picks = 10;
    const p0 = s.dig!.picks;
    let hits = 0;
    let r: DigHit | string;
    do {
      r = dig(s, 0, y);
      hits++;
    } while (typeof r !== 'string' && !r.broke);
    expect(hits).toBe(L.cells[k].hard);
    expect(s.dig!.picks).toBe(p0 - hits);
    expect(digCheck(s, 0, y)).toBe('dug');
  });

  it('掘り出したマスの隣は打てる（上から掘り進める）', () => {
    const s = site();
    breakCell(s, 3, 0);
    s.dig!.picks = 5;
    expect(digCheck(s, 3, 1)).toBeNull();
    expect(digCheck(s, 4, 1)).toBe('far');
  });
});

describe('研究レベルと研究ポイント', () => {
  it('研究レベル：掘った数 1・2・4・7・11 で Lv1〜5（Lv2・3・4・5 に重なり 1・2・3・4 個）', () => {
    expect([0, 1, 2, 3, 4, 6, 7, 10, 11, 20].map(researchLv)).toEqual([0, 1, 2, 2, 3, 3, 4, 4, 5, 5]);
    expect(RESEARCH_NEED).toEqual([1, 2, 4, 7, 11]);
  });

  it('新しいエクステを初めて掘ると +10 RP、Lv が上がると +5・+10・+15・+20（研究 Lv は会社で共有）', () => {
    const s = site();
    const L = digLayout('c1')!;
    const k = L.cells.findIndex((c) => c.item?.kind === 'ext' && !c.item.topic);
    const id = (L.cells[k].item as { id: number }).id;
    const rp0 = s.rp;
    const r = digTo(s, k % 7, Math.floor(k / 7));
    expect(r.first).toBe(true);
    expect(r.rp).toBe(RP_GAIN.C.first);
    expect(researchOf(s, id)).toBe(1);
    expect(researchLeft(s, id)).toBe(1);
    expect(s.rp - rp0).toBeGreaterThanOrEqual(RP_GAIN.C.first);
    // 重なりで Lv が上がる：Lv2（+5）・Lv5（+20）。別のセクタで同じエクステが出ても続きから（会社で共有）
    const others = L.cells.map((c, i) => [c, i] as const).filter(([c, i]) => i > k && c.item?.kind === 'ext' && !c.item.topic).map(([, i]) => i);
    const hitAt = (i: number, have: number) => {
      const x = i % 7;
      const y = Math.floor(i / 7);
      for (let yy = 0; yy < y; yy++) if (s.dig!.hp[yy * 7 + x] > 0) breakCell(s, x, yy);
      const eid = (L.cells[i].item as { id: number }).id;
      s.research[eid] = have;
      return breakCell(s, x, y);
    };
    const r2 = hitAt(others[0], 1);
    expect([r2.lv, r2.rp, r2.first]).toEqual([2, RP_GAIN.C.lv[0], undefined]);
    const r5 = hitAt(others[1], 10);
    expect([r5.lv, r5.rp]).toEqual([5, RP_GAIN.C.lv[3]]);
    const r0 = hitAt(others[2], 4);
    expect([r0.lv, r0.rp]).toEqual([undefined, 0]);
    // 別のセクタ（ユーホタウン）でも、鏡（1105）は続きから
    const c2 = site(1, 'c2');
    c2.research[1105] = 6;
    const L2 = digLayout('c2')!;
    const m = L2.cells.findIndex((c) => c.item?.kind === 'ext' && c.item.id === 1105);
    expect(m).toBeGreaterThanOrEqual(0);
    expect(digTo(c2, m % 7, Math.floor(m / 7)).lv).toBe(4);
    expect(s.dig!.month.found).toBeGreaterThan(0);
  });

  it('Uncommon のセクタでは +25・+12〜+50（表のとおり）', () => {
    expect(RP_GAIN.U).toEqual({ first: 25, lv: [12, 25, 38, 50], topic: 100, tablet: 50, present: 150 });
    const s = site(4, 'u1', 'U');
    const L = digLayout('u1')!;
    const k = L.cells.findIndex((c) => c.item?.kind === 'ext' && !c.item.topic);
    const r = digTo(s, k % 7, Math.floor(k / 7));
    expect(r.rp).toBe(25);
  });

  it('お題を掘るとその場で研究 Lv5・+40 RP（お題は各 1 つ）。そろえると発表できる', () => {
    const s = site();
    const L = digLayout('c1')!;
    expect(topicProgress(s)).toEqual([0, 3]);
    expect(presentLock(s)).toBe('not-yet');
    L.cells.forEach((c, k) => {
      if (c.item?.kind !== 'ext' || !c.item.topic) return;
      const rp0 = s.rp;
      const r = digTo(s, k % 7, Math.floor(k / 7));
      expect(r.item).toMatchObject({ topic: true });
      expect(r.lv).toBe(5);
      expect(s.rp - rp0).toBeGreaterThanOrEqual(RP_GAIN.C.topic);
      expect(researchOf(s, c.item.id)).toBe(5);
    });
    expect(topicProgress(s)).toEqual([3, 3]);
    expect(s.dig!.topics).toEqual(expect.arrayContaining(DIG_SITES.c1.topics));
  });

  it('石板を掘ると +20 RP、研究ノートに残る（読み物）', () => {
    const s = site();
    const L = digLayout('c1')!;
    const k = L.cells.findIndex((c) => c.item?.kind === 'tablet');
    const r = digTo(s, k % 7, Math.floor(k / 7));
    expect(r.item).toEqual({ kind: 'tablet', id: 'tab_c1' });
    expect(r.rp).toBe(RP_GAIN.C.tablet);
    expect(s.tablets).toEqual(['tab_c1']);
  });

  it('素材のマスは、そのセクタの素材が増える（Common：鉄・木材・粘土・ガラス）', () => {
    const s = site(1, 'c2');
    const L = digLayout('c2')!;
    const k = L.cells.findIndex((c) => c.item?.kind === 'mat');
    const it = L.cells[k].item as { mat: 'glass'; n: number };
    const m0 = s.mats[it.mat] ?? 0;
    digTo(s, k % 7, Math.floor(k / 7));
    expect(s.mats[it.mat]).toBeGreaterThanOrEqual(m0 + it.n);
    expect(DIG.C.mats).toContain(it.mat);
    // 湖の町（ガラス・粘土が特産）は、ガラスと粘土のマスが多め
    const mats = L.cells.filter((c) => c.item?.kind === 'mat').map((c) => (c.item as { mat: string }).mat);
    const n = (m: string) => mats.filter((x) => x === m).length;
    expect(n('glass') + n('clay')).toBeGreaterThan(n('iron') + n('wood'));
  });
});

describe('道具（工房の設備投資）', () => {
  it('ツルハシの新調：1 打の強さ +1（2 段）', () => {
    const s = site();
    expect(digPower(s)).toBe(1);
    const ws = myWorkshop(s)!;
    expect(invest(s, ws.uid, 'pick')).toBeNull();
    expect(digPower(s)).toBe(2);
    expect(invest(s, ws.uid, 'pick')).toBeNull();
    expect(digPower(s)).toBe(3);
    expect(invest(s, ws.uid, 'pick')).not.toBeNull();
    // 硬さ 3 のマスが 1 打で崩れる
    const L = digLayout('c1')!;
    const k = L.cells.findIndex((c) => c.hard === 3);
    for (let yy = 0; yy < Math.floor(k / 7); yy++) if (s.dig!.hp[yy * 7 + (k % 7)] > 0) breakCell(s, k % 7, yy);
    s.dig!.picks = 1;
    const r = dig(s, k % 7, Math.floor(k / 7));
    expect(typeof r !== 'string' && r.broke).toBe(true);
  });

  it('ランタン：手が届くマスの 1 段下の出土品が見える（無いと見えない）', () => {
    const s = site();
    const L = digLayout('c1')!;
    // 1 段目のどこかを崩す → その下（2 段目）は手が届く、3 段目はランタンで見える
    breakCell(s, 0, 0);
    const want = (y: number) => L.cells[y * 7].item;
    expect(peek(s, 0, 2)).toBeNull();
    invest(s, myWorkshop(s)!.uid, 'lantern');
    expect(peek(s, 0, 2)).toEqual(want(2));
    expect(peek(s, 0, 1)).toEqual(want(1));
    expect(peek(s, 0, 4)).toBeNull();
  });

  it('発破：ツルハシ 1 回と火薬代で 3 × 3 を一度に崩す（道具が無いと使えない）', () => {
    const s = site();
    s.dig!.picks = 5;
    expect(blast(s, 3, 0)).toBe('no-blast');
    invest(s, myWorkshop(s)!.uid, 'blast');
    const m0 = s.money;
    const r = blast(s, 3, 0);
    if (typeof r === 'string') throw new Error(r);
    expect(r).toHaveLength(6);
    expect(r.every((x) => x.broke)).toBe(true);
    expect(s.dig!.picks).toBe(4);
    expect(s.money).toBe(m0 - 1000);
  });
});

describe('自動発掘（仕事「発掘」）', () => {
  it('適性は 0.6 × PHY ＋ 0.2 × AGI ＋ 0.2 × INT', () => {
    expect(aptitude({ hp: 100, phy: 50, int: 20, agi: 10 }, 'dig')).toBeCloseTo(0.6 * 50 + 0.2 * 10 + 0.2 * 20, 6);
  });

  it('たまった回数を 1 日に数回ぶんゆっくり使って掘る（回数が無ければ掘らない）', () => {
    const s = site();
    expect(assign(s, 10001, 'dig')).toBeNull();
    s.dig!.picks = 30;
    const res = step(s);
    const n = res.dug?.length ?? 0;
    expect(n).toBeGreaterThanOrEqual(1);
    expect(n).toBeLessThanOrEqual(6);
    expect(s.dig!.picks).toBe(30 - n);
    s.dig!.picks = 0;
    expect(step(s).dug).toBeUndefined();
    // 手で掘るほうが速い：30 回は 1 日でも使える
    s.dig!.picks = 30;
    let manual = 0;
    for (let k = 0; k < 30; k++) {
      const at = digNext(s)!;
      if (typeof dig(s, at[0], at[1]) !== 'string') manual++;
    }
    expect(manual).toBe(30);
  });

  it('発掘場の無いセクタでは発掘の仕事に就けない', () => {
    const s = newP1(1, 'R', 'r1');
    expect(assign(s, 10001, 'dig')).toBe('no-site');
  });
});

describe('スキルツリーの 2 区分', () => {
  it('お金パネルは技を除く 7 本 × 5 ランクの 35 枚（Lv5 まで）、残りは研究パネル（レベルなし）', () => {
    const money = SKILLS.filter((k) => !isResearch(k));
    expect(money).toHaveLength(35);
    expect(Object.values(MONEY_PANELS.C).sort()).toEqual(['budget', 'bulk', 'host', 'jig', 'manual', 'pos', 'shortcut']);
    for (const tier of ['C', 'U', 'R', 'E', 'L'] as const) {
      const ids = Object.values(MONEY_PANELS[tier]);
      expect(ids, tier).toHaveLength(7);
      for (const id of ids) {
        expect(SKILL[id], id).toBeTruthy();
        expect(SKILL[id].tier ?? 'C').toBe(tier);
        expect(maxLv(SKILL[id]), id).toBe(5);
        expect(SKILL[id].branch).not.toBe('tech');
      }
    }
    for (const k of SKILLS.filter(isResearch)) {
      expect(maxLv(k), k.id).toBe(1);
      expect(rpCost(k), k.id).toBeGreaterThan(0);
    }
    expect(SKILLS.filter(isResearch).length).toBe(SKILLS.length - 35);
  });

  it('RP の値段：Common 平均 50 前後（20〜80）・Uncommon 平均 120 前後・Rare 以降 2.5 倍ずつ・大きめの研究パネルは約 2.5 倍・人材の募集は 30', () => {
    const avg = (tier: string) => {
      const r = SKILLS.filter((k) => (k.tier ?? 'C') === tier && isResearch(k) && !k.big);
      return r.reduce((a, k) => a + rpCost(k), 0) / r.length;
    };
    expect(avg('C')).toBeGreaterThan(45);
    expect(avg('C')).toBeLessThan(55);
    for (const k of SKILLS.filter((x) => !x.tier && isResearch(x) && !x.big)) {
      expect(rpCost(k), k.id).toBeGreaterThanOrEqual(20);
      expect(rpCost(k), k.id).toBeLessThanOrEqual(80);
    }
    expect(avg('U')).toBeGreaterThan(110);
    expect(avg('U')).toBeLessThan(130);
    expect(avg('R') / avg('U')).toBeCloseTo(2.5, 1);
    expect(avg('E') / avg('R')).toBeCloseTo(2.5, 1);
    expect(avg('L') / avg('E')).toBeCloseTo(2.5, 1);
    for (const k of SKILLS.filter((x) => x.big)) expect(rpCost(k) / avg(k.tier ?? 'C'), k.id).toBeCloseTo(2.5, 0);
    expect(rpCost(SKILL.hire)).toBe(START_RP);
  });

  it('研究パネルは RP で開く（資金は減らない）。お金パネルは資金で開き、レベルも資金で上がる', () => {
    const s = newP1(2);
    s.money = 1e6;
    expect(s.rp).toBe(30);
    const m0 = s.money;
    expect(learn(s, 'display')).toBeNull();
    expect([s.money, s.rp]).toEqual([m0, 30 - rpCost(SKILL.display)]);
    s.rp = 0;
    expect(learn(s, 'lounge')).toBe('rp');
    expect(learn(s, 'host')).toBeNull();
    expect(s.money).toBe(m0 - SKILL.host.cost);
    expect(levelUp(s, 'host')).toBeNull();
    expect(lvOf(s, 'host')).toBe(2);
    expect(s.money).toBe(m0 - SKILL.host.cost - levelCost(SKILL.host, 2));
    expect(levelUp(s, 'display')).toBe('max');
    s.money = 0;
    expect(learn(s, 'jig')).toBe('money');
  });

  it('依頼の ✨ 報酬は RP に（1 ✨ = 40 RP）', () => {
    expect(RP_PER_DUST).toBe(40);
    const s = newP1(3);
    s.missions.c2_top = 'done';
    claim(s, 'c2_top');
    expect(s.rp).toBe(30 + 40);
    expect(MISSIONS.every((m) => !('dust' in m))).toBe(true);
  });
});

describe('調査依頼状', () => {
  /** いまの Common のセクタのお題を全部掘る */
  const allTopics = (s: P1State) => {
    const L = digLayout(s.dig!.sector)!;
    L.cells.forEach((c, k) => {
      if (c.item?.kind === 'ext' && c.item.topic && s.dig!.hp[k] > 0) digTo(s, k % 7, Math.floor(k / 7));
    });
  };

  it('調査依頼状が無いと Uncommon に出店できない。Common のお題をそろえて発表すると +60 RP と調査依頼状', () => {
    const s = site(5);
    openGate(s);
    expect(hasLetter(s, 'U')).toBe(false);
    expect(moveTo(s, 'u1', null)).toBe('letter');
    expect(present(s)).toBe('not-yet');
    allTopics(s);
    const rp0 = s.rp;
    expect(present(s)).toEqual({ rp: RP_GAIN.C.present, letter: 'U' });
    expect(s.rp - rp0).toBe(60);
    expect(present(s)).toBe('done');
    expect(hasLetter(s, 'U')).toBe(true);
    expect(moveTo(s, 'u1', 10001)).toBeNull();
    expect(s.sector).toBe('u1');
    // 着いたセクタは新しい発掘場（Uncommon・回数 0）
    expect(s.dig).toMatchObject({ sector: 'u1', picks: 0 });
  });

  it('Common どうしの移動はいまのまま（依頼状は要らない）。戻ると発掘場は離れたときのまま', () => {
    const s = site(6);
    openGate(s);
    breakCell(s, 2, 0);
    const hp = [...s.dig!.hp];
    expect(moveTo(s, 'c2', 10001)).toBeNull();
    expect(s.dig!.sector).toBe('c2');
    expect(moveTo(s, 'c1', 10002)).toBeNull();
    expect(s.dig!.hp).toEqual(hp);
  });
});

describe('セーブ', () => {
  it('新しいゲームは版 2・30 RP。発掘の進み・研究ノートはセーブに残る', () => {
    const s = site();
    expect([s.v, s.rp]).toEqual([2, 30]);
    breakCell(s, 0, 0);
    s.research[1011] = 3;
    s.tablets = ['tab_c1'];
    s.letters = ['U'];
    const back = deserializeP1(serializeP1(s))!;
    expect(back.dig!.hp).toEqual(s.dig!.hp);
    expect(back.research[1011]).toBe(3);
    expect(back.tablets).toEqual(['tab_c1']);
    expect(back.letters).toEqual(['U']);
  });

  it('古いセーブ（版 1）：研究パネルのレベル上げぶんを資金に戻して Lv1 に。お金パネルのレベルはそのまま。✨ は 40 RP ずつ。開始時の 30 RP は無し', () => {
    const s = newP1(7);
    for (const id of ['host', 'golden', 'jig', 'lounge', 'd_shop']) s.skills.push(id);
    setLevel(s, 'host', 3);
    setLevel(s, 'golden', 3);
    setLevel(s, 'lounge', 2);
    setLevel(s, 'd_shop', 3);
    const o = JSON.parse(serializeP1(s));
    o.v = 1;
    o.dust = 2;
    delete o.rp;
    delete o.research;
    delete o.tablets;
    delete o.letters;
    delete o.presented;
    delete o.dig;
    const m0 = o.money;
    const old = deserializeP1(JSON.stringify(o))!;
    expect(old.v).toBe(2);
    expect(old.skills).toEqual(expect.arrayContaining(['host', 'golden', 'jig', 'lounge', 'd_shop']));
    expect([lvOf(old, 'host'), lvOf(old, 'golden'), lvOf(old, 'lounge'), lvOf(old, 'd_shop')]).toEqual([3, 1, 1, 1]);
    const refund = levelCost(SKILL.golden, 2) + levelCost(SKILL.golden, 3) + levelCost(SKILL.lounge, 2);
    expect(old.money).toBe(m0 + refund);
    // ✨ 2 つ ＋ 名物店主の Lv2・3 に払った ✨4・✨5 → 11 × 40 RP
    expect(old.rp).toBe((2 + 4 + 5) * 40);
    expect(old.dig?.sector).toBe('c1');
    expect(old.letters).toEqual([]);
    expect('dust' in old).toBe(false);
  });

  it('古いセーブで、すでに Uncommon に出店していれば調査依頼状を持っている', () => {
    const s = newP1(8);
    s.land = { cur: 'c1', mine: ['c1', 'u1'], recs: {} };
    const o = JSON.parse(serializeP1(s));
    o.v = 1;
    delete o.letters;
    expect(deserializeP1(JSON.stringify(o))!.letters).toEqual(['U']);
    const o2 = JSON.parse(serializeP1(newP1(8, 'U', 'u2')));
    o2.v = 1;
    delete o2.letters;
    const u = deserializeP1(JSON.stringify(o2))!;
    expect(u.letters).toEqual(['U']);
    expect(u.dig?.sector).toBe('u2');
  });
});
