/**
 * スキルツリー（Workshop のスキルツリーにならった、引っぱって動かせる木）。
 * 真ん中の「本社」から、事業の領域ごとに違う向きへ枝がのびる：
 *   左上 = ① 調達・上 = ② 製造（工房）・右上 = ③ 物流・右下 = ④ 販売（お店）・下 = 経営・左下 = 人材。
 * サプライチェーン（調達・製造・物流）の枝がいちばん豊か。パネルの絵は建物・エクステ・素材の絵を使う。
 * 線は「先に要るスキル」から引く（無ければ枝の根もと）。docs/ISLAND_PHASE1.md「スキルツリー」。
 */
import { t } from '../../i18n';
import { assetUrl } from '../../render/images';
import { BRANCHES, SKILL, SKILLS, type Mat, type Skill, type Sku } from './data';
import { has, learn, type P1State } from './model';
import { after, mineTip, open, type Ctx } from './screens';
import { btn, h, heroIcon, matIcon, money, skuIcon } from './ui';

type Branch = Skill['branch'];

/** 枝の向き（度。0 = 右、90 = 下）と、根もとから外へ並べる段（段ごとに横へ広げる） */
const LAYOUT: Record<Branch, { angle: number; rows: string[][]; color: string; stage?: string }> = {
  buy: { angle: -150, color: '#6fc6f0', stage: t('① 調達', '① Buy'), rows: [['route_cloth', 'stock1', 'bulk'], ['route_paper', 'swift', 'eye', 'tidy'], ['scoutmap', 'route_gem', 'stock2', 'bulk2', 'rack'], ['stock3']] },
  craft: { angle: -90, color: '#f2b544', stage: t('② 製造', '② Craft'), rows: [['bench2', 'jig'], ['pot', 'chair', 'jig2'], ['bench3']] },
  logi: { angle: -30, color: '#7ee08f', stage: t('③ 物流', '③ Haul'), rows: [['cart2', 'loading'], ['cart3', 'truck', 'shortcut', 'backroom'], ['hub']] },
  shop: { angle: 30, color: '#ff9f5a', stage: t('④ 販売', '④ Sell'), rows: [['shelf1', 'host', 'parttime'], ['shelf2', 'shop2', 'display'], ['shop3']] },
  ops: { angle: 90, color: '#c49bff', rows: [['pace1'], ['pace2']] },
  people: { angle: 150, color: '#ff8fb0', rows: [['hire', 'lounge']] },
};

/** パネルの絵：建物（b）・エクステ（sku）・素材（mat）・ヒーロー（hero）・絵文字（仮。docs/ISLAND_ART_TODO.md） */
const ICON: Record<string, { b?: string; sku?: Sku; mat?: Mat; hero?: number; emoji?: string }> = {
  shelf1: { b: 'general_store' },
  shelf2: { b: 'department' },
  host: { b: 'hotel' },
  parttime: { b: 'food_stalls' },
  display: { b: 'greengrocer' },
  shop2: { b: 'import' },
  shop3: { b: 'boutique' },
  bench2: { b: 'workshop' },
  jig: { sku: 'Scissors:C' },
  jig2: { sku: 'Mallet:C' },
  chair: { b: 'rest_area' },
  pot: { sku: 'Sensu:U' },
  bench3: { b: 'factory' },
  cart2: { emoji: '🛒' },
  cart3: { emoji: '🛒' },
  loading: { b: 'assembly' },
  shortcut: { b: 'survey' },
  truck: { emoji: '🚚' },
  backroom: { b: 'item' },
  hub: { b: 'logistics' },
  route_cloth: { mat: 'cloth' },
  route_paper: { mat: 'paper' },
  route_gem: { mat: 'gem' },
  scoutmap: { b: 'lighthouse' },
  bulk: { b: 'wholesale' },
  bulk2: { b: 'trading' },
  stock1: { b: 'realty' },
  stock2: { b: 'bank' },
  stock3: { b: 'hq' },
  swift: { b: 'station' },
  eye: { b: 'jewelry' },
  tidy: { b: 'garage_house' },
  rack: { b: 'warehouse' },
  hire: { b: 'school' },
  lounge: { b: 'cafe' },
  pace1: { b: 'radio' },
  pace2: { b: 'power' },
};

const UNIT = 96;
const R0 = 3.4;
const STEP = 1.4;
/** 枝の根もと（ハブ）の距離 */
const HUB = 1.45;

/** 木の上の位置（単位：UNIT）。本社が (0, 0) */
const POS = new Map<string, { x: number; y: number }>();
const HUBPOS = new Map<Branch, { x: number; y: number }>();
for (const [br, L] of Object.entries(LAYOUT) as [Branch, (typeof LAYOUT)[Branch]][]) {
  const a = (L.angle * Math.PI) / 180;
  HUBPOS.set(br, { x: Math.cos(a) * HUB, y: Math.sin(a) * HUB });
  L.rows.forEach((row, k) => {
    const r = R0 + STEP * k;
    row.forEach((id, i) => {
      const off = ((i - (row.length - 1) / 2) * 1.2) / r;
      POS.set(id, { x: Math.cos(a + off) * r, y: Math.sin(a + off) * r });
    });
  });
}
// 並べ忘れたスキルは、その枝のいちばん外へ
for (const k of SKILLS) if (!POS.has(k.id)) POS.set(k.id, { x: 0, y: 0 });

const BOUNDS = [...POS.values()].reduce((b, p) => ({ x0: Math.min(b.x0, p.x), x1: Math.max(b.x1, p.x), y0: Math.min(b.y0, p.y), y1: Math.max(b.y1, p.y) }), { x0: 0, x1: 0, y0: 0, y1: 0 });

/** 画面を描き直しても、見ている場所・選んだスキルは覚えておく */
const view = { x: 0, y: 0, zoom: 0, sel: null as string | null };

function iconOf(id: string, size: number): HTMLElement {
  const spec = ICON[id] ?? { emoji: '✦' };
  if (spec.b) {
    const im = h('img', 'isl-tree-b');
    im.src = assetUrl(`island/b/${spec.b}/rd.png`);
    im.alt = '';
    im.draggable = false;
    return im;
  }
  if (spec.sku) return skuIcon(spec.sku, size);
  if (spec.mat) return matIcon(spec.mat, size);
  if (spec.hero) return heroIcon(spec.hero, size);
  return h('span', 'isl-tree-emoji', spec.emoji ?? '✦');
}

type State = 'done' | 'open' | 'poor' | 'locked';
function stateOf(s: P1State, k: Skill): State {
  if (has(s, k.id)) return 'done';
  if (k.requires?.some((r) => !has(s, r))) return 'locked';
  return s.money >= k.cost ? 'open' : 'poor';
}

/** スキルツリーを開く。focus：その枝を真ん中に（SCM ダッシュボード・チュートリアルから） */
export function openSkills(ctx: Ctx, focus?: string) {
  if (focus && LAYOUT[focus as Branch]) {
    const L = LAYOUT[focus as Branch];
    const a = (L.angle * Math.PI) / 180;
    const r = R0 + (STEP * (L.rows.length - 1)) / 2;
    view.x = Math.cos(a) * r;
    view.y = Math.sin(a) * r;
  }
  open(ctx, t('スキルツリー', 'Skill tree'), (body) => {
    const s = ctx.s();
    body.classList.add('is-tree');
    const wrap = h('div', 'isl-tree');
    const tip = h('div', 'isl-tree-tip');
    mineTip(ctx, 'skills', tip);
    // 枝へ飛ぶチップ
    const chips = h('div', 'isl-tree-chips');
    for (const br of BRANCHES) {
      const L = LAYOUT[br.key];
      const c = h('button', 'isl-tree-chip');
      c.type = 'button';
      c.style.setProperty('--br', L.color);
      const got = SKILLS.filter((k) => k.branch === br.key && has(s, k.id)).length;
      const all = SKILLS.filter((k) => k.branch === br.key).length;
      c.append(h('b', '', br.name), h('small', '', L.stage ? `${L.stage} ${got}/${all}` : `${got}/${all}`));
      c.addEventListener('click', () => {
        const a = (L.angle * Math.PI) / 180;
        const r = R0 + (STEP * (L.rows.length - 1)) / 2;
        view.x = Math.cos(a) * r;
        view.y = Math.sin(a) * r;
        place();
      });
      chips.append(c);
    }
    // 木
    const vp = h('div', 'isl-tree-vp');
    const world = h('div', 'isl-tree-world');
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.classList.add('isl-tree-lines');
    const span = { w: (BOUNDS.x1 - BOUNDS.x0 + 4) * UNIT, h: (BOUNDS.y1 - BOUNDS.y0 + 4) * UNIT };
    const ox = (-BOUNDS.x0 + 2) * UNIT;
    const oy = (-BOUNDS.y0 + 2) * UNIT;
    svg.setAttribute('width', `${span.w}`);
    svg.setAttribute('height', `${span.h}`);
    world.style.width = `${span.w}px`;
    world.style.height = `${span.h}px`;
    world.append(svg);
    const px = (p: { x: number; y: number }) => ({ x: ox + p.x * UNIT, y: oy + p.y * UNIT });
    const line = (a: { x: number; y: number }, b: { x: number; y: number }, color: string, on: boolean) => {
      const A = px(a);
      const B = px(b);
      const l = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      l.setAttribute('x1', `${A.x}`);
      l.setAttribute('y1', `${A.y}`);
      l.setAttribute('x2', `${B.x}`);
      l.setAttribute('y2', `${B.y}`);
      l.setAttribute('stroke', color);
      l.setAttribute('class', on ? 'is-on' : '');
      svg.append(l);
    };
    // 本社 → 枝の根もと → スキル
    for (const [br, L] of Object.entries(LAYOUT) as [Branch, (typeof LAYOUT)[Branch]][]) {
      const hub = HUBPOS.get(br)!;
      line({ x: 0, y: 0 }, hub, L.color, true);
      for (const id of L.rows.flat()) {
        const k = SKILL[id];
        if (!k) continue;
        const from = k.requires?.length ? k.requires.map((r) => POS.get(r)!) : [hub];
        for (const f of from) line(f, POS.get(id)!, L.color, has(s, id));
      }
    }
    const root = h('div', 'isl-tree-root');
    const rp = px({ x: 0, y: 0 });
    root.style.left = `${rp.x}px`;
    root.style.top = `${rp.y}px`;
    const hq = h('img', 'isl-tree-b');
    hq.src = assetUrl('island/b/hq/rd.png');
    hq.alt = '';
    root.append(hq, h('b', '', t('本社', 'HQ')));
    world.append(root);
    for (const br of BRANCHES) {
      const L = LAYOUT[br.key];
      const p = px(HUBPOS.get(br.key)!);
      const hub = h('div', 'isl-tree-hub');
      hub.style.left = `${p.x}px`;
      hub.style.top = `${p.y}px`;
      hub.style.setProperty('--br', L.color);
      hub.append(h('b', '', br.name));
      if (L.stage) hub.append(h('small', '', L.stage));
      world.append(hub);
    }
    for (const k of SKILLS) {
      const L = LAYOUT[k.branch];
      const p = px(POS.get(k.id)!);
      const st = stateOf(s, k);
      const n = h('button', `isl-tree-node is-${st} ${view.sel === k.id ? 'is-sel' : ''}`);
      n.type = 'button';
      n.style.left = `${p.x}px`;
      n.style.top = `${p.y}px`;
      n.style.setProperty('--br', L.color);
      n.append(iconOf(k.id, 44), h('span', 'isl-tree-name', k.name));
      if (st === 'done') n.append(h('span', 'isl-tree-mark', '✓'));
      else if (st === 'locked') n.append(h('span', 'isl-tree-mark', '🔒'));
      else n.append(h('span', 'isl-tree-cost', money(k.cost)));
      n.addEventListener('click', (e) => {
        e.stopPropagation();
        if (moved) return;
        view.sel = k.id;
        after(ctx);
      });
      world.append(n);
    }
    vp.append(world);
    // 選んだスキルの説明と「習得する」
    const detail = h('div', 'isl-tree-detail');
    const sel = view.sel ? SKILL[view.sel] : null;
    if (sel) {
      const st = stateOf(s, sel);
      const L = LAYOUT[sel.branch];
      const top = h('div', 'isl-tree-dtop');
      const ic = h('div', 'isl-tree-dicon');
      ic.style.setProperty('--br', L.color);
      ic.append(iconOf(sel.id, 48));
      const txt = h('div');
      const nm = h('b', '', sel.name);
      txt.append(nm, h('p', '', sel.note));
      if (L.stage) txt.append(h('span', 'isl-tag is-good', t(`${L.stage}を強くする`, `Strengthens ${L.stage}`)));
      if (sel.requires?.length) {
        const need = sel.requires.map((r) => (has(s, r) ? '✓' : '· ') + (SKILL[r]?.name ?? r)).join(t('　', '  '));
        txt.append(h('small', st === 'locked' ? 'isl-warn' : 'isl-dim', t(`先に要る：${need}`, `Needs: ${need}`)));
      }
      top.append(ic, txt);
      const b = btn(st === 'done' ? t('習得済み', 'Learned') : st === 'locked' ? t('まだ取れない', 'Locked') : t(`習得する（${money(sel.cost)}）`, `Learn (${money(sel.cost)})`), () => {
        const e = learn(s, sel.id);
        if (e === 'money') ctx.toast(t('資金が足りません', 'Not enough funds'));
        else if (!e) ctx.toast(t(`「${sel.name}」を習得しました`, `Learned: ${sel.name}`));
        after(ctx);
      }, st === 'open' ? 'is-on' : '');
      b.disabled = st !== 'open';
      if (st === 'poor') top.append(h('small', 'isl-warn', t(`あと ${money(sel.cost - s.money)} 足りない`, `${money(sel.cost - s.money)} short`)));
      detail.append(top, b);
    } else detail.append(h('p', 'isl-dim', t('パネルを押すと、くわしい説明と「習得する」が出ます。真ん中の本社から、事業ごとに枝がのびています。', 'Tap a panel for details and Learn. Branches grow from HQ in the middle, one per business area.')));
    // ズーム
    const zoom = h('div', 'isl-tree-zoom');
    zoom.append(
      btn('+', () => ((view.zoom = Math.min(1.4, view.zoom * 1.2)), place())),
      btn('−', () => ((view.zoom = Math.max(0.35, view.zoom / 1.2)), place())),
      btn(t('全体', 'All'), () => {
        view.zoom = fit();
        view.x = (BOUNDS.x0 + BOUNDS.x1) / 2;
        view.y = (BOUNDS.y0 + BOUNDS.y1) / 2;
        place();
      }),
    );
    wrap.append(vp, tip, chips, zoom, detail);
    body.append(wrap);

    const fit = () => Math.max(0.35, Math.min(1, Math.min(vp.clientWidth / span.w, vp.clientHeight / span.h) * 1.15));
    function place() {
      if (!view.zoom) view.zoom = innerWidth < 600 ? 0.62 : 0.8;
      const c = px({ x: view.x, y: view.y });
      world.style.transform = `translate(${vp.clientWidth / 2 - c.x * view.zoom}px, ${vp.clientHeight / 2 - c.y * view.zoom}px) scale(${view.zoom})`;
    }
    // 引っぱって動かす・ホイールで拡大
    let drag: { x: number; y: number; vx: number; vy: number } | null = null;
    let moved = false;
    vp.addEventListener('pointerdown', (e) => {
      drag = { x: e.clientX, y: e.clientY, vx: view.x, vy: view.y };
      moved = false;
    });
    vp.addEventListener('pointermove', (e) => {
      if (!drag) return;
      const dx = e.clientX - drag.x;
      const dy = e.clientY - drag.y;
      if (Math.hypot(dx, dy) > 6) moved = true;
      view.x = drag.vx - dx / (UNIT * view.zoom);
      view.y = drag.vy - dy / (UNIT * view.zoom);
      place();
    });
    const end = () => {
      drag = null;
      setTimeout(() => (moved = false), 0);
    };
    vp.addEventListener('pointerup', end);
    vp.addEventListener('pointercancel', end);
    vp.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        view.zoom = Math.max(0.35, Math.min(1.4, view.zoom * (e.deltaY < 0 ? 1.12 : 1 / 1.12)));
        place();
      },
      { passive: false },
    );
    requestAnimationFrame(place);
  });
}
