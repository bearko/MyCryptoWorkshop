import { icons } from '../game/catalog';
import type { SaveData } from '../game/save';
import { CURRENCIES } from '../game/currency';
import { STAFF_ROLES } from '../game/staff';
import { BRANCHES, costOf, isAvailable, isVisible, level, skillById, TREE_NODES, unlockConditions, type Levels, type SkillNode } from '../game/skills';
import { GEM_IDS, GEMS, LINE_IDS, LINES, type GemId } from '../game/lines';
import { balanceFor } from '../game/purchase';
import { GEM_COST } from '../game/shop/production';
import { isFeature } from '../game/features';
import { describeChanges } from '../game/statInfo';
import { computeStats } from '../game/stats';
import { fmt, h, icon, secs } from './dom';
import { t } from '../i18n';
import { partyDef, partyHero, SKILL_KIND_NAME, skillCooldown, skillText, skillValue } from '../game/party';

const UNIT = 104;
const MINIMAP_W = 150;
const MINIMAP_H = 110;

/** Grid-space bounds of the whole tree (for the minimap). */
const BOUNDS = TREE_NODES.reduce(
  (b, n) => ({ x0: Math.min(b.x0, n.x), x1: Math.max(b.x1, n.x), y0: Math.min(b.y0, n.y), y1: Math.max(b.y1, n.y) }),
  { x0: 0, x1: 0, y0: 0, y1: 0 },
);

/**
 * Where a jump chip takes you: the centre of the branch's nodes that can be bought now, else of
 * its visible nodes, else of the whole branch.
 */
function branchCenter(branch: string, levels: Levels): { x: number; y: number } {
  const all = TREE_NODES.filter((n) => n.branch === branch);
  const open = all.filter((n) => isAvailable(n, levels) && level(levels, n.id) < n.max);
  const seen = all.filter((n) => isVisible(n, levels));
  const nodes = open.length ? open : seen.length ? seen : all;
  return { x: nodes.reduce((a, n) => a + n.x, 0) / nodes.length, y: nodes.reduce((a, n) => a + n.y, 0) / nodes.length };
}

export interface TreeCallbacks {
  onBuy(node: SkillNode): void;
  /** The "back to the shop" button (bottom right). */
  onShop(): void;
  onCollection(): void;
  onRanking(): void;
  onRelocate(): void;
}

/** Closest zoom of the tree view. */
const MAX_ZOOM = 1.6;

/** Pannable skill-tree screen shown between business days. */
export class TreeView {
  readonly root: HTMLElement;
  private readonly world: HTMLElement;
  private readonly lines: SVGSVGElement;
  private readonly detail: HTMLElement;
  private readonly statsBox: HTMLElement;
  /** Back to the shop, bottom right (like the shop's button to the tree, in the same spot). */
  private readonly shopBtn: HTMLButtonElement;
  /** A business day is open (the tree was opened mid-day; the day waits). */
  private dayOpen = false;
  private shownOnce = false;
  private readonly moveBtn = h('button.btn.relocate-btn', {}, t('🧭 ランド移転（2周目へ）', '🧭 Relocate (start run 2)')) as HTMLButtonElement;
  /** Shown while a business day waits in the shop. */
  private readonly dayNote = h('p.tree-note');
  private side!: HTMLElement;
  private readonly buyList: HTMLElement;
  private readonly infusionBox: HTMLElement;
  private readonly minimap: HTMLCanvasElement;
  private readonly viewport: HTMLElement;
  private selected: string | null = null;
  private pan = { x: 0, y: 0 };
  private zoom = 0.85;
  private nodeEls = new Map<string, HTMLElement>();

  constructor(
    private readonly save: SaveData,
    private readonly cb: TreeCallbacks,
  ) {
    this.lines = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    this.lines.classList.add('tree-lines');
    this.world = h('div.tree-world');
    this.world.append(this.lines);
    for (const [key, b] of Object.entries(BRANCHES)) {
      if (key === 'root') continue;
      const pos = { suzaku: [-4.4, -7], seiryu: [11.4, -2.2], kouryu: [9.8, 3], byakko: [-8.8, 3.5], genbu: [-9.4, 0.4], store: [-1.5, 11.3], research: [9, 5.3], series: [-16, -32], honor: [13, -8.6], prestige: [9, 12.1], party: [-14, 4.6] }[key]!;
      this.world.append(
        h('div.branch-label', { style: `left:${pos[0] * UNIT}px;top:${pos[1] * UNIT}px;color:${b.color}` }, h('b', {}, b.name), h('span', {}, b.role)),
      );
    }
    for (const node of TREE_NODES) {
      const el = h('button.node', {
        'data-node': node.id,
        style: `left:${node.x * UNIT}px;top:${node.y * UNIT}px;--branch:${BRANCHES[node.branch].color}`,
        onclick: (ev: Event) => {
          ev.stopPropagation();
          if (this.selected === node.id) this.tryBuy(node);
          else this.select(node.id);
        },
      });
      el.append(icon(node.icon, 'px node-icon'), h('span.node-level'), h('span.node-bar'));
      // Nodes that add something new (staff, items, facilities…) get the ornate frame.
      if (isFeature(node.id)) el.classList.add('feature');
      this.nodeEls.set(node.id, el);
      this.world.append(el);
    }

    const viewport = h('div.tree-viewport');
    viewport.append(this.world);
    this.viewport = viewport;
    this.attachPan(viewport);

    this.detail = h('div.tree-detail');
    this.statsBox = h('div.tree-stats');
    this.buyList = h('div.buy-list');
    this.infusionBox = h('div.infusion');
    this.shopBtn = h('button.btn.nav-btn.to-shop', { onclick: () => this.cb.onShop() }, t('🏪 ショップへ', '🏪 To the shop')) as HTMLButtonElement;
    this.moveBtn.addEventListener('click', () => this.cb.onRelocate());

    // Minimap: tap to jump there.
    this.minimap = h('canvas.tree-minimap', { width: MINIMAP_W * 2, height: MINIMAP_H * 2, 'aria-label': t('スキルツリー全体図', 'Skill tree overview') }) as HTMLCanvasElement;
    const jump = (ev: PointerEvent) => {
      const r = this.minimap.getBoundingClientRect();
      const gx = BOUNDS.x0 - 1 + ((ev.clientX - r.left) / r.width) * (BOUNDS.x1 - BOUNDS.x0 + 2);
      const gy = BOUNDS.y0 - 1 + ((ev.clientY - r.top) / r.height) * (BOUNDS.y1 - BOUNDS.y0 + 2);
      this.panTo(gx, gy);
    };
    this.minimap.addEventListener('pointerdown', (ev) => {
      // Only a first finger navigates by the minimap; a second one belongs to a pinch.
      if (!ev.isPrimary) return;
      ev.stopPropagation();
      jump(ev);
      this.minimap.setPointerCapture(ev.pointerId);
    });
    this.minimap.addEventListener('pointermove', (ev) => {
      if (this.minimap.hasPointerCapture(ev.pointerId)) jump(ev);
    });

    // Branch chips: jump to a faction's branch.
    const chips = h(
      'div.branch-chips',
      {},
      ...Object.entries(BRANCHES).map(([key, b]) =>
        h(
          'button.branch-chip',
          {
            style: `--branch:${b.color}`,
            onclick: () => {
              const c = key === 'root' ? { x: 0, y: 0 } : branchCenter(key, this.save.levels);
              this.panTo(c.x, c.y);
            },
          },
          b.name,
        ),
      ),
    );

    const zoomButtons = h(
      'div.tree-zoom',
      {},
      h('button.btn.small', { onclick: () => this.setZoom(this.zoom * 1.2), 'aria-label': t('ズームイン', 'Zoom in') }, '+'),
      h('button.btn.small', { onclick: () => this.setZoom(this.zoom / 1.2), 'aria-label': t('ズームアウト', 'Zoom out') }, '−'),
      h('button.btn.small', { onclick: () => this.center(), 'aria-label': t('中央へ', 'Center') }, '◎'),
      h('button.btn.small', { onclick: () => this.overview(), 'aria-label': t('全体を表示', 'Whole tree'), title: t('全体を表示', 'Whole tree') }, '⤢'),
    );

    this.root = h(
      'section.tree-view',
      {},
      h('div.tree-stage', {}, viewport, chips, this.minimap, zoomButtons),
      (this.side = h(
        'div.tree-side',
        {},
        // The selected node first, so its name and effect show without scrolling.
        this.detail,
        this.dayNote,
        this.moveBtn,
        this.buyList,
        this.infusionBox,
        h('div.tree-links', {}, h('button.btn', { onclick: () => this.cb.onCollection() }, t('📖 図鑑を見る', '📖 Collection')), h('button.btn', { onclick: () => this.cb.onRanking() }, t('🏆 ランキング', '🏆 Leaderboards'))),
        this.statsBox,
        h('p.tree-help', {}, t('ノードを選んで習得ボタン（またはもう一度タップ）で強化。ドラッグで移動、ホイールまたはピンチで拡大縮小。', 'Select a node, then press the buy button (or tap it again) to learn it. Drag to pan; scroll or pinch to zoom.')),
      )),
      this.shopBtn,
    );
  }

  /** Whether a business day is open while the tree is shown (a note says it waits in the shop). */
  setDayOpen(open: boolean): void {
    this.dayOpen = open;
  }

  show(): void {
    this.root.hidden = false;
    // Keep the view where the player left it when coming back from the shop.
    if (!this.shownOnce) this.center();
    this.shownOnce = true;
    this.select(this.selected ?? this.suggest());
  }

  hide(): void {
    this.root.hidden = true;
  }

  /** Picks the cheapest affordable node so the detail card starts with something useful. */
  private suggest(): string {
    const buyable = TREE_NODES.filter((n) => isAvailable(n, this.save.levels) && level(this.save.levels, n.id) < n.max);
    buyable.sort((a, b) => costOf(a, level(this.save.levels, a.id)) - costOf(b, level(this.save.levels, b.id)));
    // Something the player can afford now, else the cheapest.
    const affordable = buyable.find((n) => balanceFor(this.save, n) >= costOf(n, level(this.save.levels, n.id)));
    return (affordable ?? buyable[0])?.id ?? 'root';
  }

  private center(): void {
    const vp = this.world.parentElement!;
    const rect = vp.getBoundingClientRect();
    this.pan = { x: rect.width / 2 + 40, y: rect.height / 2 };
    this.applyTransform();
  }

  /** Zooms all the way out onto the middle of the whole tree. */
  private overview(): void {
    this.zoom = this.clampZoom(0);
    this.panTo((BOUNDS.x0 + BOUNDS.x1) / 2, (BOUNDS.y0 + BOUNDS.y1) / 2);
  }

  /** Zoom limits: zoomed all the way out, the whole tree fits in the view (on a phone, too). */
  private clampZoom(z: number): number {
    const r = this.viewport.getBoundingClientRect();
    const margin = 1.5;
    const fit = Math.min(r.width / ((BOUNDS.x1 - BOUNDS.x0 + margin * 2) * UNIT), r.height / ((BOUNDS.y1 - BOUNDS.y0 + margin * 2) * UNIT));
    const min = r.width > 0 ? Math.min(0.35, fit) : 0.35;
    return Math.min(MAX_ZOOM, Math.max(min, z));
  }

  /** Zoom buttons: around the middle of the view. */
  private setZoom(z: number): void {
    const r = this.viewport.getBoundingClientRect();
    this.zoomAt(z, r.width / 2, r.height / 2);
  }

  private applyTransform(): void {
    this.world.style.transform = `translate(${this.pan.x}px, ${this.pan.y}px) scale(${this.zoom})`;
    this.drawMinimap();
  }

  /** Centres the view on a grid position. */
  private panTo(gx: number, gy: number): void {
    const rect = this.viewport.getBoundingClientRect();
    this.pan = { x: rect.width / 2 - gx * UNIT * this.zoom, y: rect.height / 2 - gy * UNIT * this.zoom };
    this.applyTransform();
  }

  private drawMinimap(): void {
    const ctx = this.minimap.getContext('2d');
    if (!ctx) return;
    const W = this.minimap.width;
    const H = this.minimap.height;
    const spanX = BOUNDS.x1 - BOUNDS.x0 + 2;
    const spanY = BOUNDS.y1 - BOUNDS.y0 + 2;
    const mx = (gx: number) => ((gx - BOUNDS.x0 + 1) / spanX) * W;
    const my = (gy: number) => ((gy - BOUNDS.y0 + 1) / spanY) * H;
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = 'rgba(15,9,5,0.85)';
    ctx.fillRect(0, 0, W, H);
    const levels = this.save.levels;
    for (const n of TREE_NODES) {
      if (!isVisible(n, levels)) continue;
      const lv = level(levels, n.id);
      const color = BRANCHES[n.branch].color;
      ctx.globalAlpha = lv > 0 ? 1 : isAvailable(n, levels) ? 0.8 : 0.3;
      ctx.fillStyle = color;
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(mx(n.x), my(n.y), 5, 0, Math.PI * 2);
      if (lv > 0) ctx.fill();
      else ctx.stroke();
    }
    ctx.globalAlpha = 1;
    // Current view rectangle
    const rect = this.viewport.getBoundingClientRect();
    const gx0 = -this.pan.x / (UNIT * this.zoom);
    const gy0 = -this.pan.y / (UNIT * this.zoom);
    const gx1 = (rect.width - this.pan.x) / (UNIT * this.zoom);
    const gy1 = (rect.height - this.pan.y) / (UNIT * this.zoom);
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.strokeRect(mx(gx0), my(gy0), mx(gx1) - mx(gx0), my(gy1) - my(gy0));
  }

  /**
   * Drag to pan; two fingers pinch to zoom (around the point between them); the wheel zooms around
   * the cursor. A tap that ends a drag or pinch does not select a node.
   */
  private attachPan(vp: HTMLElement): void {
    const pointers = new Map<number, { x: number; y: number }>();
    let drag: { x: number; y: number; px: number; py: number } | null = null;
    let pinch: { dist: number; zoom: number; wx: number; wy: number } | null = null;
    let moved = false;
    const local = (x: number, y: number) => {
      const r = vp.getBoundingClientRect();
      return { x: x - r.left, y: y - r.top };
    };
    const startPinch = () => {
      const [a, b] = [...pointers.values()];
      const mid = local((a.x + b.x) / 2, (a.y + b.y) / 2);
      // The world point under the fingers' midpoint stays under it while zooming.
      pinch = { dist: Math.hypot(a.x - b.x, a.y - b.y) || 1, zoom: this.zoom, wx: (mid.x - this.pan.x) / this.zoom, wy: (mid.y - this.pan.y) / this.zoom };
      drag = null;
    };
    const down = (e: PointerEvent) => {
      if (pointers.has(e.pointerId)) return;
      // The first finger of a new gesture: forget any touch whose end we missed.
      if (e.isPrimary) pointers.clear();
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.size === 1) {
        moved = false;
        pinch = null;
        drag = { x: e.clientX, y: e.clientY, px: this.pan.x, py: this.pan.y };
      } else {
        moved = true;
        startPinch();
      }
    };
    vp.addEventListener('pointerdown', down);
    // A second finger joins the pinch wherever it lands (on the minimap or zoom buttons, too).
    window.addEventListener(
      'pointerdown',
      (e) => {
        if (pointers.size > 0 && e.pointerType === 'touch' && !e.isPrimary) down(e);
      },
      true,
    );
    window.addEventListener('pointermove', (e) => {
      if (!pointers.has(e.pointerId)) return;
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pinch && pointers.size >= 2) {
        const [a, b] = [...pointers.values()];
        const mid = local((a.x + b.x) / 2, (a.y + b.y) / 2);
        this.zoom = this.clampZoom((pinch.zoom * Math.hypot(a.x - b.x, a.y - b.y)) / pinch.dist);
        this.pan = { x: mid.x - pinch.wx * this.zoom, y: mid.y - pinch.wy * this.zoom };
        this.applyTransform();
      } else if (drag) {
        const dx = e.clientX - drag.x;
        const dy = e.clientY - drag.y;
        if (Math.abs(dx) + Math.abs(dy) > 6) moved = true;
        this.pan = { x: drag.px + dx, y: drag.py + dy };
        this.applyTransform();
      }
    });
    const end = (e: PointerEvent) => {
      if (!pointers.delete(e.pointerId)) return;
      pinch = null;
      // One finger left after a pinch: keep panning from where it is.
      const rest = [...pointers.values()][0];
      drag = rest ? { x: rest.x, y: rest.y, px: this.pan.x, py: this.pan.y } : null;
    };
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', end);
    // Swallow the click that ends a drag or pinch (it is not a tap on a node).
    vp.addEventListener(
      'click',
      (e) => {
        if (!moved) return;
        e.stopPropagation();
        e.preventDefault();
        moved = false;
      },
      true,
    );
    vp.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        const p = local(e.clientX, e.clientY);
        this.zoomAt(this.zoom * (e.deltaY < 0 ? 1.1 : 1 / 1.1), p.x, p.y);
      },
      { passive: false },
    );
  }

  /** Zooms keeping the viewport point (px, py) fixed. */
  private zoomAt(z: number, px: number, py: number): void {
    const next = this.clampZoom(z);
    const wx = (px - this.pan.x) / this.zoom;
    const wy = (py - this.pan.y) / this.zoom;
    this.zoom = next;
    this.pan = { x: px - wx * next, y: py - wy * next };
    this.applyTransform();
  }

  /** Selects a node and pans to it (the tutorial points at it). */
  focusNode(id: string): void {
    if (this.selected !== id) this.select(id, true);
  }

  private select(id: string, pan = false): void {
    this.selected = id;
    const node = skillById.get(id);
    if (pan && node) this.panTo(node.x, node.y);
    this.refresh();
    // The detail card is at the top of the panel: show it whole.
    this.side.scrollTop = 0;
  }

  /** 魔石 infusion picker for tomorrow's business day (one 魔石 type per line). */
  private renderInfusion(): void {
    const stats = computeStats(this.save.levels);
    this.infusionBox.replaceChildren();
    if (stats.infusion <= 0) return;
    const gems = this.save.resources.gems;
    this.infusionBox.append(
      h('h3', {}, t('魔石の投入（次の営業日）', 'Stone infusion (next business day)')),
      h('p.infusion-help', {}, t(`ラインごとに1種類。1日あたり魔石${GEM_COST}個を使います。`, `One kind per line. Uses ${GEM_COST} stones per day.`)),
      h('div.gem-stock', {}, ...GEM_IDS.map((g) => h('span', { title: GEMS[g].name }, icon(icons.gems[g], 'px'), `×${gems[g]}`))),
    );
    for (const line of LINE_IDS) {
      if (stats[`${line}.unlocked`] <= 0) continue;
      const current = this.save.infusion[line] ?? null;
      const choose = (g: GemId | null) => {
        if (g) this.save.infusion[line] = g;
        else delete this.save.infusion[line];
        this.refresh();
      };
      this.infusionBox.append(
        h(
          'div.infusion-row',
          {},
          h('span.infusion-line', {}, LINES[line].name),
          h('button.gem-choice', { class: `gem-choice ${current === null ? 'on' : ''}`, onclick: () => choose(null), title: t('投入しない', 'No stone') }, t('なし', 'None')),
          ...GEM_IDS.map((g) =>
            h(
              'button.gem-choice',
              {
                class: `gem-choice ${current === g ? 'on' : ''} ${gems[g] < GEM_COST ? 'short' : ''}`,
                onclick: () => choose(g),
                title: `${GEMS[g].name}: ${GEMS[g].effect}`,
              },
              icon(icons.gems[g], 'px'),
            ),
          ),
        ),
      );
      if (current) this.infusionBox.append(h('p.infusion-effect', {}, t(`${GEMS[current].effect}${gems[current] < GEM_COST ? '（魔石が足りません）' : ''}`, `${GEMS[current].effect}${gems[current] < GEM_COST ? ' (not enough stones)' : ''}`)));
    }
  }

  /** Buys up to `count` levels of a node while affordable. Returns levels bought. */
  private buyLevels(node: SkillNode, count: number): number {
    let bought = 0;
    while (bought < count) {
      const lv = level(this.save.levels, node.id);
      if (!isAvailable(node, this.save.levels) || lv >= node.max || balanceFor(this.save, node) < costOf(node, lv)) break;
      this.cb.onBuy(node);
      bought++;
    }
    return bought;
  }

  /** Nodes buyable right now, cheapest first. */
  private affordable(): { node: SkillNode; cost: number }[] {
    const levels = this.save.levels;
    return TREE_NODES.filter((n) => isAvailable(n, levels) && level(levels, n.id) < n.max)
      .map((node) => ({ node, cost: costOf(node, level(levels, node.id)) }))
      .filter((o) => o.cost <= balanceFor(this.save, o.node))
      .sort((a, b) => a.cost - b.cost);
  }

  /** Buys the cheapest affordable level repeatedly until nothing is affordable. */
  private buyCheapestRepeatedly(): void {
    let guard = 0;
    for (let next = this.affordable()[0]; next && guard < 500; next = this.affordable()[0], guard++) this.cb.onBuy(next.node);
    this.refresh();
  }

  private tryBuy(node: SkillNode): void {
    const lv = level(this.save.levels, node.id);
    if (!isAvailable(node, this.save.levels) || lv >= node.max) return;
    const cost = costOf(node, lv);
    if (balanceFor(this.save, node) < cost) return;
    this.cb.onBuy(node);
    const el = this.nodeEls.get(node.id);
    el?.classList.remove('bought');
    void el?.offsetWidth;
    el?.classList.add('bought');
    this.refresh();
  }

  refresh(): void {
    const levels = this.save.levels;
    // Nodes
    for (const node of TREE_NODES) {
      const el = this.nodeEls.get(node.id)!;
      const lv = level(levels, node.id);
      const visible = isVisible(node, levels);
      const available = isAvailable(node, levels);
      const maxed = lv >= node.max;
      const affordable = available && !maxed && balanceFor(this.save, node) >= costOf(node, lv);
      el.hidden = !visible;
      el.classList.toggle('locked', !available);
      el.classList.toggle('owned', lv > 0);
      el.classList.toggle('maxed', maxed);
      // Learned but with levels left to buy: a progress bar and a highlighted level badge.
      el.classList.toggle('growing', lv > 0 && !maxed);
      el.classList.toggle('affordable', affordable);
      el.classList.toggle('selected', this.selected === node.id);
      el.style.setProperty('--progress', String(lv / node.max));
      const badge = el.querySelector('.node-level')!;
      badge.textContent = maxed ? (node.max > 1 ? 'MAX' : '✓') : node.max > 1 ? `${lv}/${node.max}` : '';
      badge.classList.toggle('max', maxed);
      el.title = available || node.grantedBy ? node.name : t('？？？', '???');
    }
    // Lines
    const parts: string[] = [];
    for (const node of TREE_NODES) {
      if (!isVisible(node, levels)) continue;
      for (const r of node.requires) {
        const p = skillById.get(r);
        if (!p || !isVisible(p, levels)) continue;
        const active = level(levels, r) > 0 && level(levels, node.id) > 0;
        const cls = active ? 'on' : level(levels, r) > 0 ? 'open' : 'off';
        parts.push(
          `<line class="${cls}" style="--branch:${BRANCHES[node.branch].color}" x1="${p.x * UNIT}" y1="${p.y * UNIT}" x2="${node.x * UNIT}" y2="${node.y * UNIT}"/>`,
        );
      }
    }
    this.lines.innerHTML = parts.join('');

    // Start button
    this.moveBtn.hidden = computeStats(levels).cleared <= 0;
    this.moveBtn.textContent = t(`🧭 ランド移転（${this.save.prestige.runs + 2}周目へ）`, `🧭 Relocate (start run ${this.save.prestige.runs + 2})`);
    this.dayNote.hidden = !this.dayOpen;
    this.dayNote.textContent = t(`Day ${this.save.day} の営業中。ショップに戻ると続きから（ここで習得したスキルはすぐ反映）`, `Day ${this.save.day} is open. Back in the shop it picks up where it left off (with the skills you learn here)`);

    // Detail card
    const node = this.selected ? skillById.get(this.selected) : undefined;
    this.detail.replaceChildren();
    if (node) {
      const lv = level(levels, node.id);
      const available = isAvailable(node, levels);
      const maxed = lv >= node.max;
      const cost = costOf(node, lv);
      const b = BRANCHES[node.branch];
      this.detail.append(
        h(
          'div.detail-head',
          {},
          icon(node.icon, 'px detail-icon'),
          h('div', {}, h('div.detail-branch', { style: `color:${b.color}` }, t(`${b.name}・${b.role}`, `${b.name} · ${b.role}`), isFeature(node.id) ? h('span.feature-tag', {}, t('✦ 新要素', '✦ New feature')) : null), h('div.detail-name', {}, available || node.grantedBy ? node.name : t('？？？', '???'))),
        ),
        available
          ? h('p.detail-desc', {}, node.desc)
          : h(
              'div.detail-desc',
              {},
              h('p', {}, t('解放条件', 'To unlock')),
              h('ul.detail-conditions', {}, ...unlockConditions(node, levels).map((c) => h('li', { class: c.met ? 'met' : '' }, c.met ? '✓ ' : '• ', c.text))),
            ),
        h('div.detail-level', {}, node.max > 1 ? `Lv ${lv} / ${node.max}` : maxed ? t('習得済み', 'Learned') : t('未習得', 'Not learned')),
        scoutPreview(node, lv) ?? '',
      );
      if (available && !maxed) {
        // Exact effect of the next level, from the node's effect data.
        const changes = describeChanges(computeStats(levels), computeStats({ ...levels, [node.id]: lv + 1 }));
        if (changes.length) {
          this.detail.append(
            h('ul.detail-changes', {}, ...changes.map((c) => h('li', {}, h('span', {}, c.label), h('b', {}, `${c.from} → ${c.to}`)))),
          );
        }
        const can = balanceFor(this.save, node) >= cost;
        this.detail.append(
          h(
            'button.btn.btn-buy',
            { disabled: !can, onclick: () => this.tryBuy(node) },
            icon(CURRENCIES[node.currency ?? 'gum'].icon, 'px gum-icon'),
            t(` ${fmt(cost)} で${lv > 0 ? '強化' : '習得'}`, ` ${lv > 0 ? 'Upgrade' : 'Learn'} for ${fmt(cost)}`),
          ),
        );
        // How many more levels the current GUM covers.
        let n = 0;
        let total = 0;
        while (lv + n < node.max && total + costOf(node, lv + n) <= balanceFor(this.save, node)) total += costOf(node, lv + n++);
        if (n >= 2) {
          this.detail.append(
            h(
              'button.btn.small.btn-buy-max',
              {
                onclick: () => {
                  this.buyLevels(node, n);
                  this.refresh();
                },
              },
              t(`まとめて Lv+${n}（${fmt(total)} ${CURRENCIES[node.currency ?? 'gum'].name}）`, `Buy Lv+${n} (${fmt(total)} ${CURRENCIES[node.currency ?? 'gum'].name})`),
            ),
          );
        }
      }
    }

    // Everything affordable right now
    const options = this.affordable();
    this.buyList.replaceChildren();
    if (options.length) {
      this.buyList.append(
        h('h3', {}, t(`今習得できるスキル（${options.length}）`, `Skills you can learn now (${options.length})`)),
        ...options.slice(0, 8).map(({ node: n, cost: c }) =>
          h(
            'button.buy-item',
            { class: `buy-item ${n.id === this.selected ? 'selected' : ''}`, style: `--branch:${BRANCHES[n.branch].color}`, onclick: () => this.select(n.id, true) },
            icon(n.icon, 'px'),
            h('span.buy-name', {}, n.name, n.max > 1 ? h('small', {}, ` Lv${level(levels, n.id) + 1}`) : ''),
            h('span.buy-cost', { class: `buy-cost ${n.currency ?? ''}` }, fmt(c)),
          ),
        ),
        h('button.btn.small', { onclick: () => this.buyCheapestRepeatedly() }, t('安い順にまとめて習得', 'Learn all, cheapest first')),
      );
    }
    this.renderInfusion();
    this.drawMinimap();

    // Stats summary
    const s = computeStats(levels);
    const rows: [string, string][] = [
      [t('営業時間', 'Business hours'), t(`${s.dayLength}秒`, `${s.dayLength}s`)],
      [t('クラフト時間', 'Craft time'), secs(s['pot.craftTime'])],
      [t('陳列スペース', 'Display'), t(`${s.shelfSlots}枠${s.storageCap ? ` + 倉庫${s.storageCap}` : ''}`, `${s.shelfSlots} slots${s.storageCap ? ` + ${s.storageCap} storage` : ''}`)],
      [t('来客間隔', 'Customer interval'), secs(s.spawnInterval)],
      [t('会計時間', 'Checkout'), t(`${secs(s.cashierTime)} × ${s.registers}台`, `${secs(s.cashierTime)} × ${s.registers}`)],
      [t('価格倍率', 'Price multiplier'), `×${s.priceMult.toFixed(2)}`],
      [t('図鑑ボーナス', 'Collection bonus'), `+${(s.collectionBonus * this.save.collection.length * 100).toFixed(0)}%`],
      [t('シリーズ', 'Series'), `${s.seriesUnlocked.length}`],
    ];
    const staff = STAFF_ROLES.filter((r) => s[`staff_${r}`] > 0).length;
    if (staff > 0) rows.push([t('スタッフ', 'Staff'), `${staff}`]);
    if (s.researchRate > 0) rows.push([t('研究ポイント', 'Research'), t(`${s.researchRate.toFixed(1)}/分`, `${s.researchRate.toFixed(1)}/min`)]);
    this.statsBox.replaceChildren(h('h3', {}, t('工房のステータス', 'Workshop stats')), ...rows.map(([k, v]) => h('div.stat-row', {}, h('span', {}, k), h('b', {}, v))));
  }
}

/** A scout node's skill now and at the next level. */
function scoutPreview(node: SkillNode, lv: number): HTMLElement | null {
  const def = node.branch === 'party' && node.id.startsWith('scout_') ? partyDef(Number(node.id.slice(6))) : undefined;
  if (!def) return null;
  const hero = partyHero(def.id);
  const at = (l: number) => skillText(def.kind, skillValue(def.kind, l, def.tier), hero.name);
  const rows = [lv > 0 ? h('li', {}, h('span', {}, `Lv${lv}`), at(lv)) : null, lv < node.max ? h('li', {}, h('span', {}, `Lv${lv + 1}`), at(lv + 1)) : null];
  return h('ul.detail-skill', {}, h('li.detail-skill-name', {}, `「${hero.passive}」〈${SKILL_KIND_NAME[def.kind]}〉 ${t(`${Math.round(skillCooldown(Math.max(1, lv)))}秒ごと`, `every ${Math.round(skillCooldown(Math.max(1, lv)))}s`)}`), ...rows);
}
