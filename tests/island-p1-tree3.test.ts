/**
 * スキルツリー v3（docs/ISLAND_PHASE1.md「パネルのレベル」「汎用の効き目」「各ランクの枚数」）：
 * パネルのレベル（2〜5 段）・コストの倍率・効果の伸び・✨ のレベル・汎用の効き目（fx）・外周のボリューム。
 */
import { describe, expect, it } from 'vitest';
import { baseOf } from '../scripts/island/audit';
import { BRANCHES, LV_COST, SKILL, SKILLS, isResearch, levelCost, lvMulOf, maxLv, shownOf, sku } from '../src/island/p1/data';
import { craftDays, deserializeP1, gainSkill, fxSum, levelLock, levelUp, lvOf, matPrice, newP1, serializeP1, setLevel, skillPull, whatIf, type P1State } from '../src/island/p1/model';

const rich = (seed = 5): P1State => {
  const s = newP1(seed);
  s.money = 10_000_000;
  return s;
};

describe('パネルのレベル', () => {
  it('コストの倍率：段取りの改善 4,000 → 4,000／8,000／14,000／22,000／32,000（合計 cost × 20）', () => {
    expect(LV_COST.reduce((a, b) => a + b, 0)).toBe(20);
    const k = SKILL.jig;
    expect([1, 2, 3, 4, 5].map((lv) => levelCost(k, lv))).toEqual([4000, 8000, 14000, 22000, 32000]);
  });

  it('レベルを上げると資金が減り、効果が伸びる（Lv5 で 2 倍：クラフトの日数 −20% → −40%）', () => {
    const s = rich();
    const x = sku('Sensu', 'C');
    const d0 = craftDays(s, x);
    s.skills.push('jig');
    expect(craftDays(s, x)).toBeCloseTo(d0 * 0.8, 6);
    const m0 = s.money;
    for (let lv = 2; lv <= 5; lv++) expect(levelUp(s, 'jig')).toBeNull();
    expect(m0 - s.money).toBe(8000 + 14000 + 22000 + 32000);
    expect(lvOf(s, 'jig')).toBe(5);
    expect(craftDays(s, x)).toBeCloseTo(d0 * 0.6, 6);
    expect(levelUp(s, 'jig')).toBe('max');
  });

  it('未取得のパネルは上げられない・資金が足りなければ money', () => {
    const s = newP1(3);
    expect(levelLock(s, SKILL.host)).toBe('none');
    s.skills.push('host');
    s.money = 100;
    expect(levelUp(s, 'host')).toBe('money');
    expect(lvOf(s, 'host')).toBe(1);
  });

  it('最大レベル：お金パネル 5・研究パネル（解放型・以前の ✨ も）1・準備中 1', () => {
    for (const id of ['host', 'jig', 'shortcut', 'bulk', 'manual', 'budget', 'pos', 'u_shop_1']) expect(maxLv(SKILL[id]), id).toBe(5);
    for (const id of ['d_shop', 'hub', 'pot', 'shop2', 'route_cloth', 'hire', 't_wood', 'golden', 'u_shop_2']) expect(maxLv(SKILL[id]), id).toBe(1);
    expect(maxLv(SKILL.t_rare)).toBe(1);
    // 研究パネルには Lv2 からの効果は無い（説明に「Lv2〜」が出ない）
    for (const id of ['hub', 'pot', 'shop2', 'route_cloth', 'hire', 't_wood', 'timetable', 'pace1']) {
      expect(shownOf(SKILL[id]).up.length, id).toBe(0);
      expect(SKILL[id].note, id).not.toContain('Lv2');
    }
  });

  it('研究パネルはレベルを上げられない（開けたら完了）', () => {
    const s = rich();
    s.skills.push('d_shop', 'golden');
    expect(levelUp(s, 'd_shop')).toBe('max');
    expect(levelUp(s, 'golden')).toBe('max');
    expect(lvOf(s, 'golden')).toBe(1);
  });

  it('Common の内側のお金パネル 1 つなら、1 セクタの利益で Lv5 まで届く（Lv1〜最大の合計 ≤ 400,000 G）', () => {
    for (const k of SKILLS.filter((x) => !x.tier && !isResearch(x))) {
      let sum = 0;
      for (let lv = 1; lv <= maxLv(k); lv++) sum += levelCost(k, lv);
      expect(sum, k.id).toBeLessThanOrEqual(400_000);
    }
  });

  it('古いセーブはレベルが無い → 取ったパネルは全部 Lv1', () => {
    const s = rich();
    s.skills.push('host', 'jig');
    setLevel(s, 'jig', 3);
    const o = JSON.parse(serializeP1(s));
    expect(deserializeP1(JSON.stringify(o))!.skillLv.jig).toBe(3);
    delete o.skillLv;
    const old = deserializeP1(JSON.stringify(o))!;
    expect([lvOf(old, 'host'), lvOf(old, 'jig'), lvOf(old, 'bulk')]).toEqual([1, 1, 0]);
  });

  it('既存のパネル（掛け算型）：素材の値段 −15% → Lv3 で −22.5%', () => {
    const s = rich();
    s.skills.push('bulk');
    setLevel(s, 'bulk', 3);
    expect(matPrice(s, 'iron')).toBe(Math.round(150 * (1 - 0.15 * lvMulOf(3))));
  });

  it('SCM の打ち手に「○○を Lv2 に」が出る（いま上げられるレベル。見込みつき）', () => {
    const s = baseOf('j_craft');
    gainSkill(s, 'jig');
    const w = whatIf(s, 'craft').find((x) => x.move.kind === 'level' && x.move.id === 'jig');
    expect(w).toBeTruthy();
    if (w?.move.kind === 'level') expect([w.move.lv, w.move.cost]).toEqual([2, 8000]);
  });
});

describe('汎用の効き目（fx）', () => {
  it('取ったパネルの fx の合計（レベルで ×1.25 ずつ）。パネルを足せば効く', () => {
    const s = rich();
    const k = SKILL.u_shop_1;
    expect(k.fx?.[0].kind).toBe('pull');
    const p0 = skillPull(s);
    expect(fxSum(s, 'pull')).toBe(0);
    s.skills.push('u_shop_1');
    expect(fxSum(s, 'pull')).toBeCloseTo(k.fx![0].v, 6);
    expect(skillPull(s)).toBeCloseTo(p0 * (1 + k.fx![0].v), 6);
    setLevel(s, 'u_shop_1', 5);
    expect(fxSum(s, 'pull')).toBeCloseTo(k.fx![0].v * 2, 6);
  });

  it('ロット・ブランド力は数で足す（v × レベル）。そのパネルは研究パネルなので Lv1 の値', () => {
    const s = rich();
    const lot = SKILLS.find((k) => k.tier === 'U' && k.fx?.[0].kind === 'lot')!;
    expect(maxLv(lot)).toBe(1);
    s.skills.push(lot.id);
    expect(fxSum(s, 'lot')).toBe(lot.fx![0].v);
    // 仕組み（監査・テストの setLevel）：数で足す効き目は v × レベル
    setLevel(s, lot.id, 3);
    expect(fxSum(s, 'lot')).toBe(lot.fx![0].v * 3);
  });

  it('研究パネルになった解放型（人材の募集）は、Lv2 からの効果を持たない', () => {
    const s = rich();
    s.skills.push('hire');
    setLevel(s, 'hire', 3);
    expect(fxSum(s, 'wage')).toBe(0);
  });
});

describe('外周のボリューム（Uncommon 以降）', () => {
  it('各ランクの外周は 52〜60 枚（大きめの研究パネルを除く）、大きめの研究パネル（以前の ✨）は枝ごとに 1 枚。効果はすべて fx か既存の効き目', () => {
    // 発掘の枝（9 本目。お金パネルだけ・大きめの研究パネルなし）は別に数える（tests/island-p1-dig2b.test.ts）
    const BR = BRANCHES.filter((b) => b.key !== 'dig');
    for (const tier of ['U', 'R', 'E', 'L'] as const) {
      const all = SKILLS.filter((k) => k.tier === tier && k.branch !== 'dig');
      const n = all.filter((k) => !k.big).length;
      expect(n, tier).toBeGreaterThanOrEqual(52);
      expect(n, tier).toBeLessThanOrEqual(60);
      for (const b of BR) expect(all.filter((k) => k.big && k.branch === b.key), `${tier} ${b.key}`).toHaveLength(1);
    }
  });

  it('E・L のパネルは名前があり（???でない）、各ランク・各枝の最初の 2 枚にエンブレム', () => {
    for (const k of SKILLS.filter((x) => x.tier === 'E' || x.tier === 'L')) {
      expect(k.name).not.toBe('???');
      expect(k.sealed).toBeFalsy();
    }
    for (const tier of ['U', 'R', 'E', 'L'] as const)
      for (const b of BRANCHES) {
        const first = SKILLS.filter((k) => k.tier === tier && k.branch === b.key && !k.big && k.id.startsWith(`${tier.toLowerCase()}_`)).slice(0, 2);
        for (const k of first) expect(k.emblem, k.id).toBeGreaterThan(0);
      }
  });

  it('新しいパネルの値段はランクの範囲（U 15,000〜60,000・R 60,000〜250,000・E 250,000〜1,000,000・L 1,000,000〜4,000,000）', () => {
    const R = { U: [15000, 60000], R: [60000, 250000], E: [250000, 1000000], L: [1000000, 4000000] } as const;
    // （発掘の枝の Uncommon は 20,000〜80,000。tests/island-p1-dig2b.test.ts）
    for (const k of SKILLS.filter((x) => /^[urel]_/.test(x.id) && !x.big && x.branch !== 'dig')) {
      const [lo, hi] = R[k.tier as keyof typeof R];
      expect(k.cost, k.id).toBeGreaterThanOrEqual(lo);
      expect(k.cost, k.id).toBeLessThanOrEqual(hi);
    }
  });
});

describe('先に要るパネル：Common・Uncommon は Common・Uncommon だけで条件がそろう', () => {
  it('取れる C・U のパネルは、先に要るもの（requires・anyOf）を辿っても、準備中・Rare 以降のパネルに当たらない', async () => {
    const { LEARNABLE, skillSoon, skillTier } = await import('../src/island/p1/model');
    const { anyOfMet } = await import('../src/island/p1/data');
    const low = (id: string) => !!SKILL[id] && ['C', 'U'].includes(skillTier(SKILL[id])) && !skillSoon(SKILL[id]);
    // C・U で取れるパネルだけを使って、取れるものを広げていく（requires・anyOf がそろうまで）
    const got = new Set<string>();
    for (let changed = true; changed; ) {
      changed = false;
      for (const k of SKILLS) {
        if (got.has(k.id) || !low(k.id)) continue;
        if ((k.requires ?? []).every((r) => got.has(r)) && anyOfMet(k, (r) => got.has(r))) {
          got.add(k.id);
          changed = true;
        }
      }
    }
    const stuck = LEARNABLE()
      .filter((k) => ['C', 'U'].includes(skillTier(k)) && !got.has(k.id))
      .map((k) => `${k.id}（${k.name}）← ${[...(k.requires ?? []), ...(k.anyOf?.ids ?? [])].join('・')}`);
    expect(stuck).toEqual([]);
  });

  it('Uncommon の技の大きめの研究パネル「技能の大会」は、Uncommon の技「伝統工芸の継承」が先に要る（準備中のレアの技ではない）', () => {
    expect(SKILL.u_tech_d.requires).toEqual(['u_tech_1']);
    expect(SKILL.u_tech_1.tier).toBe('U');
  });
});
