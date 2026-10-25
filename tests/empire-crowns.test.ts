// 3 冠と規制、ライバル AI（M9）
import { describe, expect, it } from 'vitest';
import { restoreEmpire, type EmpireState, type Note } from '../src/empire/model';
import { regionStores } from '../src/empire/nation';
import { advanceMonth } from '../src/empire/sim';
import { breakup, crownStats, crownStep, crownsDueThisMonth, FISCAL_MONTH, REGULATION, regulationLevel } from '../src/empire/crowns';
import { CAMPAIGN, campaignStep, planCampaign, rivalExpand } from '../src/empire/rivalai';
import { newSave } from '../src/game/save';
import { testActions } from '../src/ui/testPanel';

const phase3 = () => advanceMonth(testActions.jumpPhase3(newSave(), 3).empire as EmpireState).state;

describe('3 冠', () => {
  it('3 月は 3 つとも、9 月はブランド力と影響力、ほかの月は影響力だけ確定する', () => {
    expect(crownsDueThisMonth(FISCAL_MONTH)).toHaveLength(3);
    expect(crownsDueThisMonth(FISCAL_MONTH + 6)).toEqual(['brand', 'influence']);
    expect(crownsDueThisMonth(FISCAL_MONTH + 1)).toEqual(['influence']);
  });

  it('物流拠点と研修所を増やすと影響力が上がり、規制のメーターも少し上がる', () => {
    const e = phase3();
    const a = crownStats(e)!;
    const more = { ...e, nation: { ...e.nation!, trainingCenters: e.nation!.trainingCenters + 5, regions: e.nation!.regions.map((r) => ({ ...r, hub: !r.locked })) } };
    const b = crownStats(more)!;
    expect(b.ours.influence).toBeGreaterThan(a.ours.influence);
    expect(b.share).toBeGreaterThan(a.share);
    expect(b.marketShare).toBeCloseTo(a.marketShare);
  });

  it('当局の調査を受けた月は、ブランドに傷が付く', () => {
    const e = phase3();
    const notes: Note[] = [{ kind: 'investigation', fine: 1 }];
    crownStep(e, notes, 1e9);
    expect(e.crowns!.shock).toBeGreaterThan(0);
  });

  it('指標の 1 位が入れ替わった月は、かわら版に載る', () => {
    const e = { ...phase3(), month: 12 * 3 + FISCAL_MONTH };
    e.crowns = { held: { scale: true, brand: true, influence: true }, shock: 0, overMonths: 0 };
    // ライバルの店を目いっぱいにして、こちらの指標を下回らせる
    e.nation = { ...e.nation!, regions: e.nation!.regions.map((r) => ({ ...r, rival: r.locked ? r.rival : r.capacity * 3 })) };
    const notes: Note[] = [];
    crownStep(e, notes, 1e9);
    expect(notes.some((n) => n.kind === 'crown' && !n.won)).toBe(true);
  });
});

describe('規制', () => {
  it('35% で注視、40% で制裁金、50% で分割の審査', () => {
    expect(regulationLevel(0.3)).toBe(0);
    expect(regulationLevel(0.36)).toBe(1);
    expect(regulationLevel(0.42)).toBe(2);
    expect(regulationLevel(0.5)).toBe(3);
  });

  it('シェアが 5 割を超えたまま半年続くと、店の一部をライバルへ売らされ、代金が入る', () => {
    const e = phase3();
    // ライバルを減らし、自店をエリアいっぱいに
    e.nation = { ...e.nation!, regions: e.nation!.regions.map((r) => (r.locked ? r : { ...r, rival: 0, direct: r.capacity })) };
    expect(crownStats(e)!.share).toBeGreaterThanOrEqual(REGULATION.breakup);
    const before = regionStoresAll(e);
    const funds = e.funds;
    const notes: Note[] = [];
    for (let i = 0; i < REGULATION.breakupMonths; i++) crownStep(e, notes, 1e9);
    expect(notes.some((n) => n.kind === 'breakupWarning')).toBe(true);
    const b = notes.find((n) => n.kind === 'breakup');
    expect(b).toBeDefined();
    expect(regionStoresAll(e)).toBe(before - (b!.kind === 'breakup' ? b!.stores : 0));
    expect(e.funds).toBeGreaterThan(funds - 1e9 * REGULATION.fineRate * 2 * REGULATION.breakupMonths);
  });

  it('40% を超えて 24 時間を強制していると、制裁金を払う', () => {
    const e = phase3();
    e.nation = { ...e.nation!, force24: true, regions: e.nation!.regions.map((r) => (r.locked ? r : { ...r, rival: 0, direct: Math.round(r.capacity * 0.7) })) };
    const lv = regulationLevel(crownStats(e)!.share);
    expect(lv).toBeGreaterThanOrEqual(2);
    const notes: Note[] = [];
    const f = e.funds;
    crownStep(e, notes, 1e9);
    expect(notes.some((n) => n.kind === 'regulationFine')).toBe(true);
    expect(e.funds).toBeLessThan(f);
  });

  it('分割では、どのエリアにも 1 店は残す', () => {
    const e = phase3();
    const n = { ...e.nation!, regions: e.nation!.regions.map((r) => (r.locked ? r : { ...r, direct: 1, fcOwner: 0, fcHq: 0 })) };
    breakup(n);
    expect(n.regions.filter((r) => !r.locked).every((r) => regionStores(r) >= 1)).toBe(true);
  });
});

describe('ライバル AI', () => {
  it('プレイヤーの店が多いエリアほど、ライバルが多く出す', () => {
    const e = phase3();
    const make = (ours: number) => ({ ...e.nation!, regions: e.nation!.regions.map((r, i) => ({ ...r, rival: 0, direct: i === 4 ? Math.round(r.capacity * ours) : 0, fcOwner: 0, fcHq: 0 })) });
    const quiet = make(0);
    const strong = make(0.6);
    rivalExpand(quiet, 1);
    rivalExpand(strong, 1);
    expect(strong.regions[4].rival).toBeGreaterThan(quiet.regions[4].rival);
    // 1 回の手で出す店の合計は変わらない
    const sum = (n: typeof quiet) => n.regions.reduce((a, r) => a + r.rival, 0);
    expect(sum(strong)).toBe(sum(quiet));
  });

  it('セール攻勢は、店のいちばん多いエリアに 1 か月前に予告してから 3 か月', () => {
    const e = phase3();
    const c = planCampaign(e.nation!, e.month)!;
    const most = e.nation!.regions.reduce((best, r, i, all) => (regionStores(r) > regionStores(all[best]) ? i : best), 0);
    expect(c.region).toBe(most);
    const notes: Note[] = [];
    expect(campaignStep(e.nation!, c, e.month, false, notes)).toBe(1);
    expect(notes.some((n) => n.kind === 'campaignSoon')).toBe(true);
    expect(campaignStep(e.nation!, c, c.start, false, notes)).toBe(CAMPAIGN.demand);
    expect(campaignStep(e.nation!, c, c.start + 1, true, notes)).toBe(1);
    expect(campaignStep(e.nation!, c, c.end, false, notes)).toBe(1);
  });

  it('対抗セールをすると、攻勢のあいだも売上は落ちないが、費用がかかる', () => {
    const e = phase3();
    const c = { region: 0, start: e.month, end: e.month + 3 };
    const base = advanceMonth({ ...e, campaign: c }).report;
    const counter = advanceMonth({ ...e, campaign: c }, { counter: true }).report;
    expect(counter.revenue).toBeGreaterThan(base.revenue);
    expect(counter.overhead!).toBeGreaterThan(base.overhead!);
  });
});

describe('セーブ', () => {
  it('3 冠とセール攻勢は保存して読み直せる', () => {
    const e = phase3();
    e.crowns = { held: { scale: true, brand: false, influence: true }, shock: 0.2, overMonths: 3 };
    e.campaign = { region: 2, start: 30, end: 33 };
    const back = restoreEmpire(JSON.parse(JSON.stringify(e)))!;
    expect(back.crowns).toEqual(e.crowns);
    expect(back.campaign).toEqual(e.campaign);
  });
});

function regionStoresAll(e: EmpireState): number {
  return e.nation!.regions.reduce((a, r) => a + regionStores(r), 0);
}
