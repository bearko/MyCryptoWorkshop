/**
 * スキルツリー v2 の配置（DOM なし。tree.ts とテストが使う）。
 * 9 本の枝：もとの 8 本は 41.75° ずつ（もとの 45° から少し詰めて、最大 11.4° 回した）、そのあいだ（③ 物流とシステムのあいだ）に
 * 細めの 9 本目「発掘」（26°。外周のパネルは 1 段 3 枚まで）。内側（Common）の段を根もとから外へ、外周（U・R・E・L）は同じ半径の同心円に並べる。
 * docs/ISLAND_PHASE1.md「スキルツリー」。
 */
import { t } from '../../i18n';
import { SKILLS, type Branch, type Tier } from './data';
import { ROW_CAP } from './skillsx';

/** スキルのランク（外周）。無ければ C */
const tierOf = (k: { tier?: Tier }): Tier => k.tier ?? 'C';

/** 枝の向き（度。0 = 右、90 = 下）と、内側（Common）の段（根もとから外へ。段ごとに横へ広げる）。外周のパネルはデータの tier から自動で並べる */
export const LAYOUT: Record<Branch, { angle: number; rows: string[][]; color: string; stage?: string }> = {
  buy: { angle: 178.4, color: '#6fc6f0', stage: t('① 調達', '① Buy'), rows: [['stock1', 'bulk'], ['route_cloth', 'swift', 'eye'], ['route_paper', 'abc', 'stock2', 'bulk2'], ['scoutmap', 'route_gem', 'stock3']] },
  tech: { angle: -139.9, color: '#e6d36a', rows: [['t_wood', 't_paper'], ['t_metal', 't_clay', 't_glass'], ['t_textile', 't_jewel', 't_master']] },
  craft: { angle: -98.1, color: '#f2b544', stage: t('② 製造', '② Craft'), rows: [['jig', 'pot'], ['jig2', 'lot', 'five_s'], ['kaizen', 'chair']] },
  logi: { angle: -56.4, color: '#7ee08f', stage: t('③ 物流', '③ Haul'), rows: [['loading'], ['shortcut', 'timetable'], ['route_opt', 'hub']] },
  // 発掘（9 本目。発掘 v2 の 2 段目）：根もと＝追加申請・ツルハシ。左（物流の側）が深さと発掘隊、右（システムの側）が威力・速さ・仕掛け
  dig: { angle: -22.5, color: '#d0945a', rows: [['dig_ext', 'dig_power'], ['dig_lamp', 'dig_office', 'dig_speed'], ['dig_deep', 'dig_crew', 'dig_reach', 'dig_blast'], ['dig_study', 'dig_drill']] },
  sys: { angle: 11.4, color: '#5fe0d0', rows: [['pos'], ['auto_order', 'inventory']] },
  shop: { angle: 53.1, color: '#ff9f5a', stage: t('④ 販売', '④ Sell'), rows: [['host', 'display'], ['shop2', 'vmd', 'pop'], ['shop3', 'golden', 'point', 'hours'], ['set']] },
  ops: { angle: 94.9, color: '#c49bff', rows: [['pace1', 'budget'], ['pace2', 'pdca']] },
  people: { angle: 136.6, color: '#ff8fb0', rows: [['hire', 'lounge'], ['manual', 'slots', 'shift'], ['ojt', 'incentive', 'welfare']] },
};
/** 枝ごとの外周の 1 段の枚数（無ければランクの ROW_CAP）。細い発掘の枝は 3 枚ずつ */
export const BR_CAP: Partial<Record<Branch, number>> = { dig: 3 };
/** もとの 8 本の枝の幅（度）。外周の段の半径は、ROW_CAP 枚がこの幅に収まる大きさから */
export const WEDGE = 41.75;


export const UNIT = 96;
/**
 * パネルの大きさ（単位：UNIT）：どのパネルも同じ大きさのひし形（正方形を 45° 回す）。PANEL はひし形の外接の幅（角から角まで。64px）。
 * 中のアイコンは正立のまま、ひし形の内側に収まる正方形（幅の半分＝32px。64×64 のエクステの絵はちょうど 1/2）
 */
export const PANEL = 2 / 3;
/** 内側（Common）の段：1 段目の半径・段の間・パネルの間（弧の長さ）。パネルのすき間はひし形の幅の 0.8〜1 枚分（前は 1.25・1.15） */
export const R0 = 3.6;
export const STEP = 1.3;
export const GAP = 1.22;
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
const outerList = (br: Branch, tier: Tier) => [...SKILLS.filter((k) => k.branch === br && tierOf(k) === tier && !k.big && !k.donate), ...SKILLS.filter((k) => k.branch === br && tierOf(k) === tier && k.big)].map((k) => k.id);
const capOf = (br: Branch, tier: Tier) => BR_CAP[br] ?? ROW_CAP[tier as Exclude<Tier, 'C'>];
{
  let r = 9.0;
  const SPAN = (WEDGE * Math.PI) / 180;
  for (const tier of OUTER) {
    const cap = ROW_CAP[tier as Exclude<Tier, 'C'>];
    r = Math.max(r, (GAP * (cap - 1) + 1.15) / SPAN);
    const rows = Math.max(1, ...(Object.keys(LAYOUT) as Branch[]).map((br) => Math.ceil(outerList(br, tier).length / capOf(br, tier))));
    RING_EDGE[tier] = r - 0.85;
    RING_R[tier] = r;
    RING_ROWS[tier] = Array.from({ length: rows }, (_, k) => r + STEP * k);
    RING_OUT[tier] = RING_ROWS[tier][rows - 1];
    r = RING_OUT[tier] + 1.6;
  }
}
/** エリアの札を置く向き（枝と枝のあいだ：製造と物流のあいだ） */
export const LABEL_A = (-76.5 * Math.PI) / 180;
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
    const cap = capOf(br, tier);
    const ids = outerList(br, tier);
    RING_ROWS[tier].forEach((r, k) => row(ids.slice(k * cap, (k + 1) * cap), r));
  }
  for (const k of SKILLS) if (k.branch === br && k.big && tierOf(k) === 'C') POS.set(k.id, polar(a + DUST_A, DUST_R));
  // 研究への寄付（発掘の枝。発掘 v2 の 6 段目）：大きめの研究パネルと同じ、根もとの近くの横
  for (const k of SKILLS) if (k.branch === br && k.donate) POS.set(k.id, polar(a + DUST_A, DUST_R));
}
// 並べ忘れたスキルは、その枝の根もとの外へ（テストで 0 件を確かめる）
export const UNPLACED = SKILLS.filter((k) => !POS.has(k.id)).map((k) => k.id);
for (const id of UNPLACED) POS.set(id, { x: 0, y: 0 });
/** パネルの位置（テスト用：重なっていないか） */
export const treePos = (id: string) => POS.get(id) ?? null;

/**
 * つながりの線：from（先に要るパネル。null は枝の根もと＝ハブ）→ to。先に要るものが無ければ根もとから。
 * 封印（sealed）は、ひとつ内側の外周のまんなかのパネル（無ければ根もと）から
 */
export type TreeEdge = { from: string | null; to: string; br: Branch };
export const EDGES: TreeEdge[] = [];
for (const br of Object.keys(LAYOUT) as Branch[]) {
  for (const k of SKILLS.filter((x) => x.branch === br)) {
    if (k.sealed) {
      const tier = tierOf(k);
      const inner = SKILLS.filter((x) => x.branch === br && !x.big && OUTER.indexOf(tierOf(x)) === OUTER.indexOf(tier) - 1);
      EDGES.push({ from: inner.length ? inner[Math.floor(inner.length / 2)].id : null, to: k.id, br });
      continue;
    }
    if (k.requires?.length) for (const r of k.requires) EDGES.push({ from: r, to: k.id, br });
    else EDGES.push({ from: null, to: k.id, br });
  }
}
/** 線の端の位置（木の上。null は枝の根もと） */
export const edgeEnd = (id: string | null, br: Branch) => (id ? POS.get(id)! : HUBPOS.get(br)!);
/**
 * 線をパネルのひし形の縁で切る：中心 c から向き (ux, uy) に進んで、ひし形（L1 の半径 r）の縁に着くまでの距離。
 * ひし形は |x| + |y| ≤ r なので、r / (|ux| + |uy|)
 */
export const rimDist = (ux: number, uy: number, r = PANEL / 2) => r / Math.max(1e-6, Math.abs(ux) + Math.abs(uy));
/**
 * 線が、ほかのパネルの上を横切るときは、ゆるい弧にする（曲げる量。単位：UNIT。正は進む向きの左）。
 * 横切るパネルが無ければ 0。どちらに曲げても横切るなら、横切るパネルが少ない側
 */
export function edgeBend(a: { x: number; y: number }, b: { x: number; y: number }, skip: (id: string) => boolean): number {
  // 近くのパネルだけ調べる（弧が膨らむぶん＋ひし形の半分の外は見ない）
  const pad = 1.6 + PANEL;
  const near = [...POS].filter(([id, p]) => !skip(id) && p.x > Math.min(a.x, b.x) - pad && p.x < Math.max(a.x, b.x) + pad && p.y > Math.min(a.y, b.y) - pad && p.y < Math.max(a.y, b.y) + pad);
  const hits = (bend: number) => near.filter(([, p]) => curveNear(a, b, bend, p, PANEL / 2 + 0.06)).length;
  let bestN = hits(0);
  if (!bestN) return 0;
  // 小さい曲げから順に（同じ数なら曲げの小さいほう）。左右を交互に
  let best = 0;
  for (let k = 1; k <= 16 && bestN; k++)
    for (const m of [k * 0.1, -k * 0.1]) {
      const n = hits(m);
      if (n < bestN) {
        best = m;
        bestN = n;
        if (!n) break;
      }
    }
  return Math.round(best * 10) / 10;
}
let bends: Map<TreeEdge, number> | null = null;
/** どの線をどれだけ曲げるか（配置は変わらないので、はじめて使うときに 1 回だけ数える） */
export function edgeBends(): Map<TreeEdge, number> {
  if (bends) return bends;
  bends = new Map();
  for (const e of EDGES) {
    const m = edgeBend(edgeEnd(e.from, e.br), edgeEnd(e.to, e.br), (id) => id === e.from || id === e.to);
    if (m) bends.set(e, m);
  }
  return bends;
}
/** 弧（2 次ベジェ。制御点は真ん中から横へ bend×2）の上の点 */
export function curveAt(a: { x: number; y: number }, b: { x: number; y: number }, bend: number, t: number) {
  const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  const nx = -(b.y - a.y) / len;
  const ny = (b.x - a.x) / len;
  const cx = (a.x + b.x) / 2 + nx * bend * 2;
  const cy = (a.y + b.y) / 2 + ny * bend * 2;
  const u = 1 - t;
  return { x: u * u * a.x + 2 * u * t * cx + t * t * b.x, y: u * u * a.y + 2 * u * t * cy + t * t * b.y, cx, cy };
}
/** 弧が、点 p のひし形（L1 の半径 r）に入るか */
export function curveNear(a: { x: number; y: number }, b: { x: number; y: number }, bend: number, p: { x: number; y: number }, r: number) {
  for (let i = 1; i < 60; i++) {
    const q = curveAt(a, b, bend, i / 60);
    if (Math.abs(q.x - p.x) + Math.abs(q.y - p.y) < r) return true;
  }
  return false;
}

export const BOUNDS = [...POS.values()].reduce((b, p) => ({ x0: Math.min(b.x0, p.x), x1: Math.max(b.x1, p.x), y0: Math.min(b.y0, p.y), y1: Math.max(b.y1, p.y) }), { x0: 0, x1: 0, y0: 0, y1: 0 });

