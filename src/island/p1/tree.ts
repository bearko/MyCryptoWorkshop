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
import { has, hqOpen, learn, openHQ, type P1State } from './model';
import { after, mineTip, open, type Ctx } from './screens';
import { btn, h, heroIcon, matIcon, money, skuIcon } from './ui';

type Branch = Skill['branch'];

/** 枝の向き（度。0 = 右、90 = 下）と、根もとから外へ並べる段（段ごとに横へ広げる） */
const LAYOUT: Record<Branch, { angle: number; rows: string[][]; color: string; stage?: string }> = {
  buy: { angle: -150, color: '#6fc6f0', stage: t('① 調達', '① Buy'), rows: [['route_cloth', 'stock1', 'bulk'], ['route_paper', 'swift', 'eye', 'tidy'], ['scoutmap', 'route_gem', 'stock2', 'bulk2', 'rack'], ['stock3']] },
  craft: { angle: -90, color: '#f2b544', stage: t('② 製造', '② Craft'), rows: [['bench2', 'jig'], ['pot', 'chair', 'jig2'], ['bench3']] },
  logi: { angle: -30, color: '#7ee08f', stage: t('③ 物流', '③ Haul'), rows: [['cart2', 'loading'], ['cart3', 'truck', 'hub', 'shortcut', 'backroom']] },
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
/** 本社を開放した時刻（放射状に広がる演出のあいだ） */
let burst = 0;
const BURST_MS = 2600;
/** 本社のパネル（view.sel） */
const HQ = '@hq';

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

const HQ_NOTE = t('会社のすべての事業の中心。開放すると、① 調達・② 製造・③ 物流・④ 販売・人材・経営の強化の枝が広がり、資金でスキルを習得できるようになります。', 'The heart of every business. Unlock it and upgrade branches spread out for Buying, Crafting, Hauling, Selling, People and Operations.');

/** 広がる演出：本社からの向きと遅れ */
function setBurst(el: HTMLElement, p: { x: number; y: number }) {
  el.style.setProperty('--dx', `${(-p.x * UNIT).toFixed(0)}px`);
  el.style.setProperty('--dy', `${(-p.y * UNIT).toFixed(0)}px`);
  el.style.setProperty('--d', `${(0.15 + Math.hypot(p.x, p.y) * 0.11).toFixed(2)}s`);
}

/** マウスを乗せたときの説明（PC） */
function skillCard(s: P1State, k: Skill): HTMLElement {
  const st = stateOf(s, k);
  const L = LAYOUT[k.branch];
  const c = h('div', 'isl-tree-hcard');
  c.style.setProperty('--br', L.color);
  const top = h('div', 'isl-row');
  top.append(iconOf(k.id, 36), h('b', '', k.name));
  c.append(top, h('p', '', k.note));
  if (L.stage) c.append(h('span', 'isl-tag is-good', t(`${L.stage}を強くする`, `Strengthens ${L.stage}`)));
  if (k.requires?.length) c.append(h('small', st === 'locked' ? 'isl-warn' : 'isl-dim', t(`先に要る：${k.requires.map((r) => (has(s, r) ? '✓' : '· ') + (SKILL[r]?.name ?? r)).join('　')}`, `Needs: ${k.requires.map((r) => SKILL[r]?.name ?? r).join(', ')}`)));
  c.append(h('small', st === 'open' ? 'isl-good' : st === 'poor' ? 'isl-warn' : 'isl-dim', st === 'done' ? t('習得済み', 'Learned') : st === 'locked' ? t(`${money(k.cost)}（まだ取れない）`, `${money(k.cost)} (locked)`) : st === 'poor' ? t(`${money(k.cost)}（あと ${money(k.cost - s.money)}）`, `${money(k.cost)} (${money(k.cost - s.money)} short)`) : t(`${money(k.cost)}・押して習得`, `${money(k.cost)} · click to learn`)));
  return c;
}
function hqCard(s: P1State, sealed: boolean): HTMLElement {
  const c = h('div', 'isl-tree-hcard');
  c.style.setProperty('--br', 'var(--isl-gold)');
  c.append(h('b', '', t('本社', 'HQ')), h('p', '', HQ_NOTE));
  c.append(h('small', sealed ? 'isl-good' : 'isl-dim', sealed ? t('押して開放（無料）', 'Click to unlock (free)') : t(`習得したスキル ${s.skills.length} / ${SKILLS.length}`, `Learned ${s.skills.length} / ${SKILLS.length}`)));
  return c;
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
    // 本社を開放するまでは、本社だけが見える
    const sealed = !hqOpen(s);
    const bursting = !sealed && performance.now() - burst < BURST_MS;
    if (sealed) {
      view.x = 0;
      view.y = 0;
    }
    body.classList.add('is-tree');
    const wrap = h('div', `isl-tree ${sealed ? 'is-sealed' : ''}`);
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
    const world = h('div', `isl-tree-world ${bursting ? 'is-burst' : ''}`);
    if (bursting) setTimeout(() => world.classList.remove('is-burst'), Math.max(0, BURST_MS - (performance.now() - burst)));
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
    /** 本社からの距離 → 広がる演出の遅れ（秒） */
    const delay = (p: { x: number; y: number }) => `${(Math.hypot(p.x, p.y) * 0.11).toFixed(2)}s`;
    const line = (a: { x: number; y: number }, b: { x: number; y: number }, color: string, on: boolean) => {
      if (sealed) return;
      const A = px(a);
      const B = px(b);
      const l = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      const len = Math.hypot(B.x - A.x, B.y - A.y);
      l.setAttribute('style', `--len:${len.toFixed(0)};--d:${delay(a)}`);
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
    const root = h('button', `isl-tree-root ${sealed ? 'is-sealed' : ''} ${view.sel === HQ ? 'is-sel' : ''}`);
    root.type = 'button';
    const rp = px({ x: 0, y: 0 });
    root.style.left = `${rp.x}px`;
    root.style.top = `${rp.y}px`;
    const hq = h('img', 'isl-tree-b');
    hq.src = assetUrl('island/b/hq/rd.png');
    hq.alt = '';
    hq.draggable = false;
    root.append(hq, h('b', '', t('本社', 'HQ')));
    if (sealed) root.append(h('span', 'isl-tree-cost', t('タップして開放', 'Tap to unlock')));
    root.addEventListener('click', (e) => {
      e.stopPropagation();
      if (moved) return;
      view.sel = HQ;
      after(ctx);
    });
    hover(root, () => hqCard(s, sealed));
    world.append(root);
    if (bursting) {
      // 本社から広がる光の輪
      for (let k = 0; k < 3; k++) {
        const wv = h('div', 'isl-tree-wave');
        wv.style.left = `${rp.x}px`;
        wv.style.top = `${rp.y}px`;
        wv.style.animationDelay = `${k * 0.35}s`;
        world.append(wv);
      }
    }
    if (!sealed) for (const br of BRANCHES) {
      const L = LAYOUT[br.key];
      const p = px(HUBPOS.get(br.key)!);
      const hub = h('div', 'isl-tree-hub');
      hub.style.left = `${p.x}px`;
      hub.style.top = `${p.y}px`;
      hub.style.setProperty('--br', L.color);
      setBurst(hub, HUBPOS.get(br.key)!);
      hub.append(h('b', '', br.name));
      if (L.stage) hub.append(h('small', '', L.stage));
      world.append(hub);
    }
    if (!sealed) for (const k of SKILLS) {
      const L = LAYOUT[k.branch];
      const p = px(POS.get(k.id)!);
      const st = stateOf(s, k);
      const n = h('button', `isl-tree-node is-${st} ${view.sel === k.id ? 'is-sel' : ''}`);
      n.type = 'button';
      n.style.left = `${p.x}px`;
      n.style.top = `${p.y}px`;
      n.style.setProperty('--br', L.color);
      setBurst(n, POS.get(k.id)!);
      hover(n, () => skillCard(s, k));
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
    if (view.sel === HQ) {
      const top = h('div', 'isl-tree-dtop');
      const ic = h('div', 'isl-tree-dicon');
      ic.style.setProperty('--br', 'var(--isl-gold)');
      const im = h('img', 'isl-tree-b');
      im.src = assetUrl('island/b/hq/rd.png');
      im.alt = '';
      ic.append(im);
      const txt = h('div');
      txt.append(h('b', '', t('本社', 'HQ')), h('p', '', HQ_NOTE));
      if (!sealed) txt.append(h('small', 'isl-dim', t(`習得したスキル ${s.skills.length} / ${SKILLS.length}`, `Learned ${s.skills.length} / ${SKILLS.length}`)));
      top.append(ic, txt);
      detail.append(top);
      if (sealed)
        detail.append(
          btn(
            t('本社を開放する', 'Unlock HQ'),
            () => {
              if (!openHQ(s)) return;
              burst = performance.now();
              view.sel = null;
              view.x = 0;
              view.y = 0;
              view.zoom = -1; // 描き直したあと、全体が見える大きさに
              ctx.sfx?.('clear');
              setTimeout(() => ctx.sfx?.('levelup'), 700);
              ctx.toast(t('本社を開放しました！ 強化の枝が広がります', 'HQ unlocked! Upgrade branches spread out'));
              ctx.save();
              after(ctx);
            },
            'is-on',
          ),
        );
    } else if (sel) {
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
    } else if (sealed) detail.append(h('p', 'isl-dim', t('真ん中の本社を押して、開放しましょう。開放すると、事業ごとの強化の枝が広がります。', 'Tap HQ in the middle to unlock it. Upgrade branches for each business will spread out.')));
    else detail.append(h('p', 'isl-dim', t('パネルを押すと、くわしい説明と「習得する」が出ます。真ん中の本社から、事業ごとに枝がのびています。', 'Tap a panel for details and Learn. Branches grow from HQ in the middle, one per business area.')));
    // ズーム
    const zoom = h('div', 'isl-tree-zoom');
    zoom.append(
      btn('+', () => ((view.zoom = Math.min(1.8, view.zoom * 1.2)), place())),
      btn('−', () => ((view.zoom = Math.max(0.3, view.zoom / 1.2)), place())),
      btn(t('全体', 'All'), () => {
        view.zoom = fit();
        view.x = (BOUNDS.x0 + BOUNDS.x1) / 2;
        view.y = (BOUNDS.y0 + BOUNDS.y1) / 2;
        place();
      }),
    );
    // PC：パネルにマウスを乗せると、くわしい説明
    const card = h('div', 'isl-tree-hover');
    card.hidden = true;
    function hover(el: HTMLElement, fill: () => HTMLElement) {
      if (!matchMedia('(hover: hover) and (pointer: fine)').matches) return;
      el.addEventListener('pointerenter', (e) => {
        if (e.pointerType !== 'mouse' || drag) return;
        card.replaceChildren(fill());
        card.hidden = false;
        const r = el.getBoundingClientRect();
        const w = wrap.getBoundingClientRect();
        const cw = Math.min(280, w.width - 16);
        card.style.width = `${cw}px`;
        let left = r.right - w.left + 10;
        if (left + cw > w.width - 8) left = r.left - w.left - cw - 10;
        card.style.left = `${Math.max(8, left)}px`;
        card.style.top = `${Math.max(8, Math.min(w.height - 160, r.top - w.top))}px`;
      });
      el.addEventListener('pointerleave', () => (card.hidden = true));
    }
    if (sealed) {
      chips.hidden = true;
      zoom.hidden = true;
    }
    wrap.append(vp, tip, chips, zoom, detail, card);
    body.append(wrap);

    const fit = () => Math.max(0.3, Math.min(1, Math.min(vp.clientWidth / span.w, vp.clientHeight / span.h) * 1.15));
    function place() {
      if (view.zoom < 0) view.zoom = fit();
      if (!view.zoom) view.zoom = innerWidth < 600 ? 0.62 : 0.8;
      const c = px({ x: view.x, y: view.y });
      world.style.transform = `translate(${vp.clientWidth / 2 - c.x * view.zoom}px, ${vp.clientHeight / 2 - c.y * view.zoom}px) scale(${view.zoom})`;
    }
    // 引っぱって動かす・2 本指でつまんで拡大縮小（スマホ）・ホイールで拡大（PC）
    const ZMIN = 0.3;
    const ZMAX = 1.8;
    const pts = new Map<number, { x: number; y: number }>();
    let drag: { x: number; y: number; vx: number; vy: number } | null = null;
    let pinch: { d0: number; z0: number; wx: number; wy: number } | null = null;
    let moved = false;
    /** 画面の点（client 座標）にある、木の上の位置 */
    const worldAt = (cx: number, cy: number, zoom = view.zoom) => {
      const r = vp.getBoundingClientRect();
      return { x: view.x + (cx - r.left - r.width / 2) / (UNIT * zoom), y: view.y + (cy - r.top - r.height / 2) / (UNIT * zoom) };
    };
    /** 木の上の位置 w が、画面の点 (cx, cy) に来るように動かす */
    const pinTo = (w: { x: number; y: number }, cx: number, cy: number) => {
      const r = vp.getBoundingClientRect();
      view.x = w.x - (cx - r.left - r.width / 2) / (UNIT * view.zoom);
      view.y = w.y - (cy - r.top - r.height / 2) / (UNIT * view.zoom);
    };
    const mid = () => {
      const [a, b] = [...pts.values()];
      return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, d: Math.hypot(a.x - b.x, a.y - b.y) };
    };
    vp.addEventListener('pointerdown', (e) => {
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pts.size === 2) {
        const m = mid();
        const w = worldAt(m.x, m.y);
        pinch = { d0: Math.max(10, m.d), z0: view.zoom, wx: w.x, wy: w.y };
        drag = null;
        moved = true;
        card.hidden = true;
      } else if (pts.size === 1) {
        drag = { x: e.clientX, y: e.clientY, vx: view.x, vy: view.y };
        moved = false;
      }
    });
    vp.addEventListener('pointermove', (e) => {
      if (!pts.has(e.pointerId)) return;
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pinch && pts.size >= 2) {
        const m = mid();
        view.zoom = Math.max(ZMIN, Math.min(ZMAX, (pinch.z0 * m.d) / pinch.d0));
        pinTo({ x: pinch.wx, y: pinch.wy }, m.x, m.y);
        place();
        return;
      }
      if (!drag) return;
      const dx = e.clientX - drag.x;
      const dy = e.clientY - drag.y;
      if (Math.hypot(dx, dy) > 6) {
        moved = true;
        card.hidden = true;
      }
      view.x = drag.vx - dx / (UNIT * view.zoom);
      view.y = drag.vy - dy / (UNIT * view.zoom);
      place();
    });
    const end = (e: PointerEvent) => {
      pts.delete(e.pointerId);
      if (pts.size < 2) pinch = null;
      // 2 本指のあと 1 本だけ残ったら、その指で引っぱり直す
      const rest = [...pts.values()][0];
      drag = rest ? { x: rest.x, y: rest.y, vx: view.x, vy: view.y } : null;
      if (!pts.size) setTimeout(() => (moved = false), 0);
    };
    vp.addEventListener('pointerup', end);
    vp.addEventListener('pointercancel', end);
    vp.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        const w = worldAt(e.clientX, e.clientY);
        view.zoom = Math.max(ZMIN, Math.min(ZMAX, view.zoom * (e.deltaY < 0 ? 1.12 : 1 / 1.12)));
        pinTo(w, e.clientX, e.clientY);
        place();
      },
      { passive: false },
    );
    requestAnimationFrame(place);
  });
}
