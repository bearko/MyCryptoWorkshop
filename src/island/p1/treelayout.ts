/**
 * スキルツリー v2 の配置（DOM なし。tree.ts とテストが使う）。
 * 8 本の枝を 45° ずつ、内側（Common）の段を根もとから外へ、外周（U・R・E・L）は同じ半径の同心円に並べる。
 * docs/ISLAND_PHASE1.md「スキルツリー」。
 */
import { t } from '../../i18n';
import { SKILLS, type Branch, type Tier } from './data';
import { ROW_CAP } from './skillsx';

/** スキルのランク（外周）。無ければ C */
const tierOf = (k: { tier?: Tier }): Tier => k.tier ?? 'C';

/** 枝の向き（度。0 = 右、90 = 下）と、内側（Common）の段（根もとから外へ。段ごとに横へ広げる）。外周のパネルはデータの tier から自動で並べる */
export const LAYOUT: Record<Branch, { angle: number; rows: string[][]; color: string; stage?: string }> = {
  buy: { angle: 180, color: '#6fc6f0', stage: t('① 調達', '① Buy'), rows: [['stock1', 'bulk'], ['route_cloth', 'swift', 'eye'], ['route_paper', 'abc', 'stock2', 'bulk2'], ['scoutmap', 'route_gem', 'stock3']] },
  tech: { angle: -135, color: '#e6d36a', rows: [['t_wood', 't_paper'], ['t_metal', 't_clay', 't_glass'], ['t_textile', 't_jewel', 't_master']] },
  craft: { angle: -90, color: '#f2b544', stage: t('② 製造', '② Craft'), rows: [['jig', 'pot'], ['jig2', 'lot', 'five_s'], ['kaizen', 'chair']] },
  logi: { angle: -45, color: '#7ee08f', stage: t('③ 物流', '③ Haul'), rows: [['loading'], ['shortcut', 'timetable'], ['route_opt', 'hub']] },
  sys: { angle: 0, color: '#5fe0d0', rows: [['pos'], ['auto_order', 'inventory']] },
  shop: { angle: 45, color: '#ff9f5a', stage: t('④ 販売', '④ Sell'), rows: [['host', 'display'], ['shop2', 'vmd', 'pop'], ['shop3', 'golden', 'point', 'hours'], ['set']] },
  ops: { angle: 90, color: '#c49bff', rows: [['pace1', 'budget'], ['pace2', 'pdca']] },
  people: { angle: 135, color: '#ff8fb0', rows: [['hire', 'lounge'], ['manual', 'slots', 'shift'], ['ojt', 'incentive', 'welfare']] },
};


export const UNIT = 96;
/** 内側（Common）の段：1 段目の半径・段の間・パネルの間（弧の長さ） */
export const R0 = 3.6;
export const STEP = 1.25;
export const GAP = 1.15;
/** 枝の根もと（ハブ）の距離 */
export const HUB = 1.45;
/** 大きめの研究パネル（以前の ✨）：根もとの近く（枝の向きから少し横へ） */
export const DUST_R = 2.5;
export const DUST_A = 0.42;
/**
 * 外周（ランクのエリア）：枝ごとに、そのランクのパネルを内側の段から外へ ROW_CAP 枚ずつ並べる（Common の内側と同じ流儀）。
 * 段の半径は、ROW_CAP 枚が隣の枝と重ならない大きさから。ランクのあいだに境目の円（RING_EDGE）。
 */
export const OUTER: Tier[] = ['U', 'R', 'E', 'L'];
/** ランクごとの段の半径（内側から） */
export const RING_ROWS = {} as Record<Tier, number[]>;
/** ランクのいちばん内側の段（RING_R）と、いちばん外の段（RING_OUT）・境目の円（RING_EDGE） */
export const RING_R = { C: 0 } as Record<Tier, number>;
export const RING_OUT = { C: R0 + STEP * 3 } as Record<Tier, number>;
export const RING_EDGE = { C: 0 } as Record<Tier, number>;
/** 外周のパネルの並び（枝・ランクごと。既存のパネル → 追加のパネル → ✨） */
const outerList = (br: Branch, tier: Tier) => [...SKILLS.filter((k) => k.branch === br && tierOf(k) === tier && !k.big), ...SKILLS.filter((k) => k.branch === br && tierOf(k) === tier && k.big)].map((k) => k.id);
{
  let r = 9.0;
  const SPAN = Math.PI / 4;
  for (const tier of OUTER) {
    const cap = ROW_CAP[tier as Exclude<Tier, 'C'>];
    r = Math.max(r, (GAP * (cap - 1) + 1.15) / SPAN);
    const rows = Math.max(1, ...(Object.keys(LAYOUT) as Branch[]).map((br) => Math.ceil(outerList(br, tier).length / cap)));
    RING_EDGE[tier] = r - 0.85;
    RING_R[tier] = r;
    RING_ROWS[tier] = Array.from({ length: rows }, (_, k) => r + STEP * k);
    RING_OUT[tier] = RING_ROWS[tier][rows - 1];
    r = RING_OUT[tier] + 1.6;
  }
}
/** エリアの札を置く向き（枝と枝のあいだ：製造と物流のあいだ） */
export const LABEL_A = (-67.5 * Math.PI) / 180;
/** 木の上の位置（単位：UNIT）。本社が (0, 0) */
export const POS = new Map<string, { x: number; y: number }>();
export const HUBPOS = new Map<Branch, { x: number; y: number }>();
export const polar = (a: number, r: number) => ({ x: Math.cos(a) * r, y: Math.sin(a) * r });
for (const [br, L] of Object.entries(LAYOUT) as [Branch, (typeof LAYOUT)[Branch]][]) {
  const a = (L.angle * Math.PI) / 180;
  HUBPOS.set(br, polar(a, HUB));
  const row = (ids: string[], r: number) => ids.forEach((id, i) => POS.set(id, polar(a + ((i - (ids.length - 1) / 2) * GAP) / r, r)));
  L.rows.forEach((ids, k) => row(ids, R0 + STEP * k));
  for (const tier of OUTER) {
    const cap = ROW_CAP[tier as Exclude<Tier, 'C'>];
    const ids = outerList(br, tier);
    RING_ROWS[tier].forEach((r, k) => row(ids.slice(k * cap, (k + 1) * cap), r));
  }
  for (const k of SKILLS) if (k.branch === br && k.big && tierOf(k) === 'C') POS.set(k.id, polar(a + DUST_A, DUST_R));
}
// 並べ忘れたスキルは、その枝の根もとの外へ（テストで 0 件を確かめる）
export const UNPLACED = SKILLS.filter((k) => !POS.has(k.id)).map((k) => k.id);
for (const id of UNPLACED) POS.set(id, { x: 0, y: 0 });
/** パネルの位置（テスト用：重なっていないか） */
export const treePos = (id: string) => POS.get(id) ?? null;

export const BOUNDS = [...POS.values()].reduce((b, p) => ({ x0: Math.min(b.x0, p.x), x1: Math.max(b.x1, p.x), y0: Math.min(b.y0, p.y), y1: Math.max(b.y1, p.y) }), { x0: 0, x1: 0, y0: 0, y1: 0 });

