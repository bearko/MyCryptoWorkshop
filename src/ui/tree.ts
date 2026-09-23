import { icons } from '../game/catalog';
import type { SaveData } from '../game/save';
import { BRANCHES, costOf, isAvailable, isVisible, level, SKILLS, skillById, type SkillNode } from '../game/skills';
import { computeStats } from '../game/stats';
import { fmt, h, icon, secs } from './dom';

const UNIT = 104;

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
      const pos = { suzaku: [0, -6.1], seiryu: [6.1, 0], kouryu: [0, 6.1], byakko: [-3.2, 4.8], genbu: [-9, -0.3] }[key]!;
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
    this.attachPan(viewport);

    this.detail = h('div.tree-detail');
    this.statsBox = h('div.tree-stats');
    this.startBtn = h('button.btn.btn-primary.start-day', { onclick: () => this.cb.onStartDay() }) as HTMLButtonElement;

    this.root = h(
      'section.tree-view',
      {},
      viewport,
      h(
        'div.tree-side',
        {},
        this.startBtn,
        h('p.tree-help', {}, 'ノードを選んで習得ボタン（またはもう一度クリック）で強化。ドラッグで移動、ホイールで拡大縮小。'),
        this.detail,
        h('button.btn', { onclick: () => this.cb.onCollection() }, '📖 図鑑を見る'),
        this.statsBox,
      ),
      h(
        'div.tree-zoom',
        {},
        h('button.btn.small', { onclick: () => this.setZoom(this.zoom * 1.2), 'aria-label': 'ズームイン' }, '＋'),
        h('button.btn.small', { onclick: () => this.setZoom(this.zoom / 1.2), 'aria-label': 'ズームアウト' }, '－'),
        h('button.btn.small', { onclick: () => this.center(), 'aria-label': '中央へ' }, '◎'),
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

  private select(id: string): void {
    this.selected = id;
    this.refresh();
  }

  private tryBuy(node: SkillNode): void {
    const lv = level(this.save.levels, node.id);
    if (!isAvailable(node, this.save.levels) || lv >= node.max) return;
    const cost = costOf(node, lv);
    if (this.save.gum < cost) return;
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
      const affordable = available && !maxed && this.save.gum >= costOf(node, lv);
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
        const can = this.save.gum >= cost;
        this.detail.append(
          h(
            'button.btn.btn-buy',
            { disabled: !can, onclick: () => this.tryBuy(node) },
            icon(icons.gum, 'px gum-icon'),
            ` ${fmt(cost)} で${lv > 0 ? '強化' : '習得'}`,
          ),
        );
      }
    }

    // Stats summary
    const s = computeStats(levels);
    const rows: [string, string][] = [
      ['営業時間', `${s.dayLength}秒`],
      ['クラフト時間', secs(s.craftTime)],
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
