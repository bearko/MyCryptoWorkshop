import { icons } from '../game/catalog';
import type { SaveData } from '../game/save';
import { CURRENCIES } from '../game/currency';
import { BRANCHES, costOf, isAvailable, isVisible, level, SKILLS, skillById, type SkillNode } from '../game/skills';
import { GEM_IDS, GEMS, LINE_IDS, LINES, type GemId } from '../game/lines';
import { balanceFor } from '../game/purchase';
import { GEM_COST } from '../game/shop/production';
import { describeChanges } from '../game/statInfo';
import { computeStats } from '../game/stats';
import { fmt, h, icon, secs } from './dom';

const UNIT = 104;
const MINIMAP_W = 150;
const MINIMAP_H = 110;

/** Grid-space bounds of the whole tree (for the minimap). */
const BOUNDS = SKILLS.reduce(
  (b, n) => ({ x0: Math.min(b.x0, n.x), x1: Math.max(b.x1, n.x), y0: Math.min(b.y0, n.y), y1: Math.max(b.y1, n.y) }),
  { x0: 0, x1: 0, y0: 0, y1: 0 },
);

/** Grid-space centre of each branch (for the jump chips). */
function branchCenter(branch: string): { x: number; y: number } {
  const nodes = SKILLS.filter((n) => n.branch === branch);
  return { x: nodes.reduce((a, n) => a + n.x, 0) / nodes.length, y: nodes.reduce((a, n) => a + n.y, 0) / nodes.length };
}

export interface TreeCallbacks {
  onBuy(node: SkillNode): void;
  onStartDay(): void;
  onCollection(): void;
}

/** Pannable skill-tree screen shown between business days. */
export class TreeView {
  readonly root: HTMLElement;
  private readonly world: HTMLElement;
  private readonly lines: SVGSVGElement;
  private readonly detail: HTMLElement;
  private readonly statsBox: HTMLElement;
  private readonly startBtn: HTMLButtonElement;
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
      const pos = { suzaku: [-4.4, -7], seiryu: [6.6, -1.2], kouryu: [9.8, 3], byakko: [-3.2, 3.4], genbu: [-9.4, 0.4], store: [-6.8, 8.5], research: [9, 9.2] }[key]!;
      this.world.append(
        h('div.branch-label', { style: `left:${pos[0] * UNIT}px;top:${pos[1] * UNIT}px;color:${b.color}` }, h('b', {}, b.name), h('span', {}, b.role)),
      );
    }
    for (const node of SKILLS) {
      const el = h('button.node', {
        style: `left:${node.x * UNIT}px;top:${node.y * UNIT}px;--branch:${BRANCHES[node.branch].color}`,
        onclick: (ev: Event) => {
          ev.stopPropagation();
          if (this.selected === node.id) this.tryBuy(node);
          else this.select(node.id);
        },
      });
      el.append(icon(node.icon, 'px node-icon'), h('span.node-level'));
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
    this.startBtn = h('button.btn.btn-primary.start-day', { onclick: () => this.cb.onStartDay() }) as HTMLButtonElement;

    // Minimap: tap to jump there.
    this.minimap = h('canvas.tree-minimap', { width: MINIMAP_W * 2, height: MINIMAP_H * 2, 'aria-label': 'スキルツリー全体図' }) as HTMLCanvasElement;
    const jump = (ev: PointerEvent) => {
      const r = this.minimap.getBoundingClientRect();
      const gx = BOUNDS.x0 - 1 + ((ev.clientX - r.left) / r.width) * (BOUNDS.x1 - BOUNDS.x0 + 2);
      const gy = BOUNDS.y0 - 1 + ((ev.clientY - r.top) / r.height) * (BOUNDS.y1 - BOUNDS.y0 + 2);
      this.panTo(gx, gy);
    };
    this.minimap.addEventListener('pointerdown', (ev) => {
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
              const c = key === 'root' ? { x: 0, y: 0 } : branchCenter(key);
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
      h('button.btn.small', { onclick: () => this.setZoom(this.zoom * 1.2), 'aria-label': 'ズームイン' }, '＋'),
      h('button.btn.small', { onclick: () => this.setZoom(this.zoom / 1.2), 'aria-label': 'ズームアウト' }, '－'),
      h('button.btn.small', { onclick: () => this.center(), 'aria-label': '中央へ' }, '◎'),
    );

    this.root = h(
      'section.tree-view',
      {},
      h('div.tree-stage', {}, viewport, chips, this.minimap, zoomButtons),
      h(
        'div.tree-side',
        {},
        this.startBtn,
        h('p.tree-help', {}, 'ノードを選んで習得ボタン（またはもう一度タップ）で強化。ドラッグで移動、ホイールで拡大縮小。'),
        this.detail,
        this.infusionBox,
        this.buyList,
        h('button.btn', { onclick: () => this.cb.onCollection() }, '📖 図鑑を見る'),
        this.statsBox,
      ),
    );
  }

  show(): void {
    this.root.hidden = false;
    this.center();
    this.select(this.selected ?? this.suggest());
  }

  hide(): void {
    this.root.hidden = true;
  }

  /** Picks the cheapest affordable node so the detail card starts with something useful. */
  private suggest(): string {
    const buyable = SKILLS.filter((n) => isAvailable(n, this.save.levels) && level(this.save.levels, n.id) < n.max);
    buyable.sort((a, b) => costOf(a, level(this.save.levels, a.id)) - costOf(b, level(this.save.levels, b.id)));
    return buyable[0]?.id ?? 'root';
  }

  private center(): void {
    const vp = this.world.parentElement!;
    const rect = vp.getBoundingClientRect();
    this.pan = { x: rect.width / 2 + 40, y: rect.height / 2 };
    this.applyTransform();
  }

  private setZoom(z: number): void {
    this.zoom = Math.min(1.6, Math.max(0.45, z));
    this.applyTransform();
  }

  private applyTransform(): void {
    this.world.style.transform = `translate(${this.pan.x}px, ${this.pan.y}px) scale(${this.zoom})`;
    this.renderInfusion();
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
    for (const n of SKILLS) {
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

  private attachPan(vp: HTMLElement): void {
    let drag: { x: number; y: number; px: number; py: number; moved: boolean } | null = null;
    vp.addEventListener('pointerdown', (e) => {
      drag = { x: e.clientX, y: e.clientY, px: this.pan.x, py: this.pan.y, moved: false };
    });
    window.addEventListener('pointermove', (e) => {
      if (!drag) return;
      const dx = e.clientX - drag.x;
      const dy = e.clientY - drag.y;
      if (Math.abs(dx) + Math.abs(dy) > 4) drag.moved = true;
      this.pan = { x: drag.px + dx, y: drag.py + dy };
      this.applyTransform();
    });
    window.addEventListener('pointerup', () => (drag = null));
    vp.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        this.setZoom(this.zoom * (e.deltaY < 0 ? 1.1 : 1 / 1.1));
      },
      { passive: false },
    );
  }

  private select(id: string, pan = false): void {
    this.selected = id;
    const node = skillById.get(id);
    if (pan && node) this.panTo(node.x, node.y);
    this.refresh();
  }

  /** 魔石 infusion picker for tomorrow's business day (one 魔石 type per line). */
  private renderInfusion(): void {
    const stats = computeStats(this.save.levels);
    this.infusionBox.replaceChildren();
    if (stats.infusion <= 0) return;
    const gems = this.save.resources.gems;
    this.infusionBox.append(
      h('h3', {}, '魔石の投入（次の営業日）'),
      h('p.infusion-help', {}, `ラインごとに1種類。1日あたり魔石${GEM_COST}個を使います。`),
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
          h('button.gem-choice', { class: `gem-choice ${current === null ? 'on' : ''}`, onclick: () => choose(null), title: '投入しない' }, 'なし'),
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
      if (current) this.infusionBox.append(h('p.infusion-effect', {}, `${GEMS[current].effect}${gems[current] < GEM_COST ? '（魔石が足りません）' : ''}`));
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
    return SKILLS.filter((n) => isAvailable(n, levels) && level(levels, n.id) < n.max)
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
    for (const node of SKILLS) {
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
      el.classList.toggle('affordable', affordable);
      el.classList.toggle('selected', this.selected === node.id);
      el.querySelector('.node-level')!.textContent = node.max > 1 ? `${lv}/${node.max}` : maxed ? '✓' : '';
      el.title = available ? node.name : '？？？';
    }
    // Lines
    const parts: string[] = [];
    for (const node of SKILLS) {
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
    this.startBtn.textContent = `▶ Day ${this.save.day} 開店する`;

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
          h('div', {}, h('div.detail-branch', { style: `color:${b.color}` }, `${b.name}・${b.role}`), h('div.detail-name', {}, available ? node.name : '？？？')),
        ),
        h('p.detail-desc', {}, available ? node.desc : '前のスキルを習得すると解放されます'),
        h('div.detail-level', {}, node.max > 1 ? `Lv ${lv} / ${node.max}` : maxed ? '習得済み' : '未習得'),
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
            ` ${fmt(cost)} で${lv > 0 ? '強化' : '習得'}`,
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
              `まとめて Lv+${n}（${fmt(total)} ${CURRENCIES[node.currency ?? 'gum'].name}）`,
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
        h('h3', {}, `今習得できるスキル（${options.length}）`),
        ...options.slice(0, 8).map(({ node: n, cost: c }) =>
          h(
            'button.buy-item',
            { class: `buy-item ${n.id === this.selected ? 'selected' : ''}`, style: `--branch:${BRANCHES[n.branch].color}`, onclick: () => this.select(n.id, true) },
            icon(n.icon, 'px'),
            h('span.buy-name', {}, n.name, n.max > 1 ? h('small', {}, ` Lv${level(levels, n.id) + 1}`) : ''),
            h('span.buy-cost', { class: `buy-cost ${n.currency ?? ''}` }, fmt(c)),
          ),
        ),
        h('button.btn.small', { onclick: () => this.buyCheapestRepeatedly() }, '安い順にまとめて習得'),
      );
    }
    this.renderInfusion();
    this.drawMinimap();

    // Stats summary
    const s = computeStats(levels);
    const rows: [string, string][] = [
      ['営業時間', `${s.dayLength}秒`],
      ['クラフト時間', secs(s['pot.craftTime'])],
      ['陳列スペース', `${s.shelfSlots}枠${s.storageCap ? ` + 倉庫${s.storageCap}` : ''}`],
      ['来客間隔', secs(s.spawnInterval)],
      ['会計時間', `${secs(s.cashierTime)} × ${s.registers}台`],
      ['価格倍率', `×${s.priceMult.toFixed(2)}`],
      ['図鑑ボーナス', `+${(s.collectionBonus * this.save.collection.length * 100).toFixed(0)}%`],
      ['シリーズ', `${s.seriesUnlocked.length}種`],
    ];
    this.statsBox.replaceChildren(h('h3', {}, '工房のステータス'), ...rows.map(([k, v]) => h('div.stat-row', {}, h('span', {}, k), h('b', {}, v))));
  }
}
