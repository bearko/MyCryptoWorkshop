import { describe, expect, it } from 'vitest';
import { allowedDirs, assign, build, canPlaceAt, canSwap, jamOf, newP1, releaseForSwap, restDaysLeft, restRateOf, swapStops, setShelf, stageCaps, startCraft, step, type P1State } from '../src/island/p1/model';
import { reportJam } from '../src/island/p1/report';
import { jamGain, scmJam } from '../src/island/p1/scm';
import { canRelease, pickable, pickHooks, pickKind, releaseHero, swapOn } from '../src/island/p1/heroui';
import { TUT } from '../src/island/p1/tut';

function lot(s: P1State, id: string): [number, number, 'rd' | 'ld' | 'ru' | 'lu'] {
  for (let j = 0; j < s.n; j++)
    for (let i = 0; i < s.n; i++) {
      const ds = allowedDirs(s, id, i, j);
      if (ds.length && !canPlaceAt(s, id, i, j, ds[0])) return [i, j, ds[0]];
    }
  throw new Error('no lot');
}

/** 工房とよろず屋を建て、3 人を製造・物流・販売に置いて作り始める */
function running(seed = 1): { s: P1State; uid: number } {
  const s = newP1(seed);
  const [a, b, d] = lot(s, 'workshop');
  build(s, 'workshop', a, b, d);
  for (let k = 0; k < 4; k++) step(s);
  const [x, y, e] = lot(s, 'general_store');
  const shop = build(s, 'general_store', x, y, e);
  if (typeof shop === 'string') throw new Error(shop);
  for (let k = 0; k < 5; k++) step(s);
  assign(s, 10003, 'craft', 0);
  assign(s, 10001, 'transport');
  assign(s, 10002, 'shop', shop.uid);
  setShelf(s, shop.uid, 0, 'Sensu:C');
  startCraft(s, 0, 'Sensu:C');
  return { s, uid: shop.uid };
}

/** 月の締めまで進めて、その日の報告を返す */
function toClose(s: P1State) {
  for (let k = 0; k < 80; k++) {
    const r = step(s);
    if (r.report) return r.report;
  }
  throw new Error('no report');
}

describe('詰まりの判定：月次報告と SCM ダッシュボードが同じ', () => {
  it('締めた時点の状態で、報告の詰まり＝ダッシュボードの詰まり＝ひと月に流せる数のいちばん少ない段', () => {
    for (const seed of [1, 2, 3]) {
      const { s } = running(seed);
      const r = toClose(s);
      expect(r.bottleneck).toBeDefined();
      expect(reportJam(s, r)).toBe(scmJam(s));
      expect(r.bottleneck).toBe(jamOf(s));
      const c = stageCaps(s);
      const min = Math.min(...(['buy', 'craft', 'haul', 'sell'] as const).map((k) => (c[k].stopped ? 0 : c[k].perMonth)));
      expect(c[r.bottleneck!].stopped ? 0 : c[r.bottleneck!].perMonth).toBe(min);
    }
  });
  it('手持ちの素材で足りて買わなかった月（調達の実績 0）でも、調達を詰まりにしない', () => {
    const { s } = running(1);
    // 調達係はいない。素材は手持ちで十分（その月は何も買わない）
    s.mats.wood = 999;
    s.mats.cloth = 999;
    s.mats.paper = 999;
    const r = toClose(s);
    expect(r.flow?.bought ?? 0).toBe(0);
    expect(r.bottleneck).not.toBe('buy');
    expect(reportJam(s, r)).toBe(scmJam(s));
  });
  it('古い報告（詰まりの保存が無い）は、いまの状態で同じ判定をする', () => {
    const { s } = running(1);
    const r = toClose(s);
    const old = { ...r, bottleneck: undefined };
    expect(reportJam(s, old)).toBe(scmJam(s));
  });
  it('詰まりを太くしたときの見込みは「次に細い段との差」', () => {
    const { s } = running(1);
    const c = stageCaps(s);
    const bn = jamOf(s);
    const g = jamGain(s, c, bn);
    const others = (['buy', 'craft', 'haul', 'sell'] as const).filter((k) => k !== bn && !c[k].stopped).map((k) => c[k].perMonth);
    const n = Math.round(Math.min(...others) - (c[bn].stopped ? 0 : c[bn].perMonth));
    if (n > 0) expect(g?.n).toBe(n);
    else expect(g).toBeNull();
  });
});

describe('ヒーロー選びの見分け', () => {
  it('待機中・いまの担当・ほかの担当・休憩中を見分け、選べるのは待機中といまの担当だけ', () => {
    const { s } = running(1);
    const warrior = s.staff.find((x) => x.hero === 10001)!;
    const artist = s.staff.find((x) => x.hero === 10003)!;
    // 物流の枠を開いた引き出し：いまの担当はウォーリアー
    expect(pickKind(warrior, 10001)).toBe('current');
    expect(pickable(pickKind(warrior, 10001))).toBe(true);
    // 同じ引き出しで、作業台のアーティストはほかの担当（灰色・選べない・✕ で外せる）
    expect(pickKind(artist, 10001)).toBe('busy');
    expect(pickable('busy')).toBe(false);
    expect(canRelease(artist, 10001)).toBe(true);
    expect(canRelease(warrior, 10001)).toBe(false);
  });
  it('✕ で担当を外すと、その担当が空いて選べる状態になる', () => {
    const { s } = running(1);
    const artist = s.staff.find((x) => x.hero === 10003)!;
    expect(s.slots[0].worker).toBe(10003);
    expect(releaseHero(s, 10003)).toBe(true);
    expect(artist.task).toBeNull();
    expect(s.slots[0].worker).toBeNull();
    expect(pickKind(artist, null)).toBe('free');
    expect(pickable(pickKind(artist, null))).toBe(true);
    // もう担当が無いので、外すものは無い
    expect(releaseHero(s, 10003)).toBe(false);
  });
  it('休憩中（スタミナ切れ）のヒーローは選べない（担当を外しても休憩中のまま）', () => {
    const { s } = running(1);
    const clerk = s.staff.find((x) => x.hero === 10002)!;
    clerk.resting = true;
    clerk.stamina = 1;
    expect(pickKind(clerk, null)).toBe('resting');
    expect(pickable(pickKind(clerk, null))).toBe(false);
    expect(releaseHero(s, 10002)).toBe(true);
    expect(pickKind(clerk, null)).toBe('resting');
    expect(pickable(pickKind(clerk, null))).toBe(false);
  });
});

describe('チュートリアル：調達の段は自分でタブを押す', () => {
  it('素材の段は lesson（SCM → 調達）で、画面へ直接は飛ばさない', () => {
    const mats = TUT.find((x) => x.id === 'mats')!;
    expect(mats.lesson).toBe(true);
    expect(mats.autoGo).toBeFalsy();
    expect(mats.hl).toBe('scm:buy');
    // 前の段（工房の設定）の会話の最後の枚が、SCM タブへの案内
    const craft = TUT.find((x) => x.id === 'craft')!;
    expect(craft.sheetTalk?.pages.at(-1)?.text).toContain('SCM');
  });
  it('運ぶ段のあと・ダッシュボードの段は、画面の ✕ を光らせる', () => {
    expect(TUT.find((x) => x.id === 'firstSale')?.closeOn).toContain('staff');
    expect(TUT.find((x) => x.id === 'scm')?.closeOn).toContain('scm');
  });
});

describe('ヒーロー選び：ほかの担当の人を押して付け替え', () => {
  it('付け替え：元の担当から外して（「担当を外す」と同じ）、新しい担当に付けられる', () => {
    const { s } = running(1);
    const artist = s.staff.find((x) => x.hero === 10003)!;
    expect(canSwap(artist)).toBe(true);
    expect(releaseForSwap(s, 10003)).toEqual({ task: 'craft', target: 0 });
    expect(s.slots[0].worker).toBeNull();
    expect(artist.task).toBeNull();
    expect(assign(s, 10003, 'buy')).toBeNull();
    expect(artist.task).toBe('buy');
  });
  it('元の場所が止まるか：唯一の運搬係・作るものがある作業台・アルバイトのいないお店は止まる', () => {
    const { s, uid } = running(1);
    expect(swapStops(s, 10001, 'shop')).toBe(true);
    // 運搬係 → 運搬係（同じ仕事へ）なら止まらない
    expect(swapStops(s, 10001, 'transport')).toBe(false);
    expect(swapStops(s, 10003, 'transport')).toBe(true);
    expect(swapStops(s, 10002, 'craft')).toBe(true);
    s.shops[uid].part = 1;
    expect(swapStops(s, 10002, 'craft')).toBe(false);
    // 運搬係がもう 1 人いれば、止まらない
    const extra = { ...s.staff[0], hero: 99999, task: 'transport' as const, target: null };
    s.staff.push(extra);
    expect(swapStops(s, 10001, 'shop')).toBe(false);
  });
  it('休憩中・修行中・待機中は付け替えない。休憩中は「あと N 日」が出る', () => {
    const { s } = running(1);
    const clerk = s.staff.find((x) => x.hero === 10002)!;
    clerk.resting = true;
    clerk.stamina = 0;
    expect(canSwap(clerk)).toBe(false);
    expect(releaseForSwap(s, 10002)).toBeNull();
    expect(clerk.task).toBe('shop');
    expect(restDaysLeft(s, clerk)).toBe(Math.ceil((clerk.stats.hp * 0.8) / restRateOf(s)));
    clerk.resting = false;
    expect(restDaysLeft(s, clerk)).toBe(0);
    assign(s, 10002, null);
    expect(canSwap(clerk)).toBe(false);
  });
  it('チュートリアル中は付け替えを出さない（今どおり灰色で押せない）', () => {
    const { s } = running(1);
    const artist = s.staff.find((x) => x.hero === 10003)!;
    pickHooks.tutorial = () => true;
    expect(swapOn(artist)).toBe(false);
    pickHooks.tutorial = () => false;
    expect(swapOn(artist)).toBe(true);
    pickHooks.tutorial = undefined;
  });
});
