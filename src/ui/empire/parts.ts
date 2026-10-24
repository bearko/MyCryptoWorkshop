// 経営画面の部品（design/keieimode/components/）。どれも DOM を返すだけで、状態は持たない。
import type { MonthReport } from '../../empire/model';
import { t } from '../../i18n';
import { h } from '../dom';
import type { News, Voice } from './notes';
import { monthLabel, money } from './text';

type Child = Node | string | null | undefined | false;

/** 2px の線の SVG アイコン（操作の記号だけ。物は MCH のスプライトで示す） */
export function svgIcon(name: 'close' | 'chevron-down' | 'chevron-right' | 'chevron-up' | 'plus' | 'minus' | 'layers' | 'stamp' | 'back' | 'zoom-in' | 'zoom-out', size = 20): SVGSVGElement {
  const paths: Record<string, string> = {
    close: 'M6 6l12 12M18 6L6 18',
    'chevron-down': 'M6 9l6 6 6-6',
    'chevron-up': 'M6 15l6-6 6 6',
    'chevron-right': 'M9 6l6 6-6 6',
    plus: 'M12 5v14M5 12h14',
    minus: 'M5 12h14',
    'zoom-in': 'M11 4a7 7 0 1 0 0 14a7 7 0 1 0 0-14M11 8v6M8 11h6M16 16l4 4',
    'zoom-out': 'M11 4a7 7 0 1 0 0 14a7 7 0 1 0 0-14M8 11h6M16 16l4 4',
    layers: 'M12 4l8 4-8 4-8-4zM4 12l8 4 8-4M4 16l8 4 8-4',
    stamp: 'M9 4h6v6l3 3v3H6v-3l3-3zM5 20h14',
    back: 'M15 6l-6 6 6 6',
  };
  const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  s.setAttribute('width', String(size));
  s.setAttribute('height', String(size));
  s.setAttribute('viewBox', '0 0 24 24');
  s.setAttribute('fill', 'none');
  s.setAttribute('stroke', 'currentColor');
  s.setAttribute('stroke-width', '2');
  s.setAttribute('stroke-linecap', 'square');
  s.setAttribute('aria-hidden', 'true');
  const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  p.setAttribute('d', paths[name]);
  s.append(p);
  return s;
}

/** ヘッダーの数字（StatChip） */
export function chip(label: string, value: string, tone: 'plain' | 'ours' | 'rival' | 'paper' = 'paper', title?: string): HTMLElement {
  return h('span.ke-chip', { class: `ke-chip ke-tone-${tone}`, title }, label ? h('span.ke-chip-label', {}, label) : null, h('b.ke-figure', {}, value));
}

export function panel(cls: string, title: string | null, ...children: Child[]): HTMLElement {
  return h('section', { class: `ke-panel ${cls}` }, title ? h('h2.ke-panel-title', {}, title) : null, ...children);
}

/** 数を 1 つずつ増減する（−　値　＋）。的は 44px */
export function stepper(value: string, onMinus: (() => void) | null, onPlus: (() => void) | null, label: string): HTMLElement {
  return h(
    'div.ke-stepper',
    { role: 'group', 'aria-label': label },
    h('button.ke-step', { type: 'button', disabled: !onMinus, 'aria-label': t(`${label}を減らす`, `Less ${label}`), onclick: () => onMinus?.() }, svgIcon('minus', 18)),
    h('b.ke-figure', {}, value),
    h('button.ke-step', { type: 'button', disabled: !onPlus, 'aria-label': t(`${label}を増やす`, `More ${label}`), onclick: () => onPlus?.() }, svgIcon('plus', 18)),
  );
}

/** いくつかから 1 つ選ぶ（押してある方が紙の色） */
export function segmented<T>(label: string, options: { value: T; text: string }[], current: T, onPick: (v: T) => void): HTMLElement {
  return h(
    'div.ke-seg',
    { role: 'group', 'aria-label': label },
    ...options.map((o) => h('button.ke-seg-btn', { type: 'button', 'aria-pressed': String(o.value === current), onclick: () => onPick(o.value) }, o.text)),
  );
}

/** 費用つきのボタン。押せない理由があれば、そのまま下に出す */
export function costButton(text: string, cost: number | null, onClick: () => void, opts: { pressed?: boolean; disabled?: string | null; primary?: boolean } = {}): HTMLElement {
  return h(
    'div.ke-cost',
    {},
    h(
      'button.ke-btn',
      { type: 'button', class: `ke-btn ${opts.primary ? 'ke-btn-primary' : ''}`, 'aria-pressed': opts.pressed === undefined ? undefined : String(opts.pressed), disabled: !!opts.disabled, onclick: onClick },
      h('span', {}, text),
      cost !== null ? h('span.ke-figure.ke-btn-cost', {}, money(cost)) : null,
    ),
    opts.disabled ? h('span.ke-why', {}, opts.disabled) : null,
  );
}

/** 紙の上の「名前　値」の行 */
export function row(label: string, value: string, tone: '' | 'good' | 'bad' = ''): HTMLElement {
  return h('div.ke-row', {}, h('span', {}, label), h('b', { class: `ke-figure ${tone ? `ke-${tone}` : ''}` }, value));
}

/** 直近の利益を、1 か月 1 本の棒で（ドットの格子にそろえた SVG） */
export function profitBars(history: MonthReport[]): HTMLElement {
  const last = history.slice(-12);
  const w = 12 * 14;
  const hgt = 48;
  const max = Math.max(1, ...last.map((r) => Math.abs(r.profit)));
  const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  s.setAttribute('viewBox', `0 0 ${w} ${hgt}`);
  s.setAttribute('width', String(w));
  s.setAttribute('height', String(hgt));
  s.setAttribute('shape-rendering', 'crispEdges');
  s.setAttribute('role', 'img');
  s.setAttribute('aria-label', t(`直近 ${last.length} か月の利益`, `Profit, last ${last.length} months`));
  s.classList.add('ke-bars');
  const mid = hgt / 2;
  const base = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
  base.setAttribute('x', '0');
  base.setAttribute('y', String(mid));
  base.setAttribute('width', String(w));
  base.setAttribute('height', '1');
  base.setAttribute('class', 'ke-bars-base');
  s.append(base);
  last.forEach((r, i) => {
    const bh = Math.max(2, Math.round((Math.abs(r.profit) / max) * (mid - 2)));
    const b = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    b.setAttribute('x', String(i * 14 + 3));
    b.setAttribute('width', '8');
    b.setAttribute('y', String(r.profit >= 0 ? mid - bh : mid + 1));
    b.setAttribute('height', String(bh));
    b.setAttribute('class', r.profit >= 0 ? 'ke-bar-good' : 'ke-bar-bad');
    const tip = document.createElementNS('http://www.w3.org/2000/svg', 'title');
    tip.textContent = `${monthLabel(r.month)}　${money(r.profit)}`;
    b.append(tip);
    s.append(b);
  });
  return s as unknown as HTMLElement;
}

/** 絵馬（ステークホルダーの声）。直す手があれば、その場のボタン */
export function emaCard(v: Voice, onFix: (() => void) | null, onFocus: (() => void) | null, fixed: boolean): HTMLElement {
  return h(
    'article.ke-ema',
    { class: `ke-ema ${v.urgent ? 'is-urgent' : ''}` },
    h('span.ke-ema-who', {}, v.who),
    h('p.ke-ema-text', {}, v.text),
    v.due ? h('span.ke-ema-due', {}, v.due) : null,
    v.fix || onFocus
      ? h(
          'div.ke-ema-actions',
          {},
          v.fix && onFix ? h('button.ke-btn.ke-btn-small', { type: 'button', 'aria-pressed': String(fixed), onclick: onFix }, fixed ? t(`✓ ${v.fix.label}`, `✓ ${v.fix.label}`) : v.fix.label) : null,
          onFocus ? h('button.ke-link', { type: 'button', onclick: onFocus }, t('地図で見る', 'Show on map')) : null,
        )
      : null,
  );
}

/** かわら版：見出し 1 本と挿絵。ほかの記事は押すと開く */
export function kawaraban(news: News[], heroImg: (id: number) => HTMLElement | null, onOpen: (() => void) | null): HTMLElement | null {
  if (!news.length) return null;
  const top = news[0];
  return h(
    'section.ke-kawara',
    { role: onOpen ? 'button' : undefined, tabindex: onOpen ? 0 : undefined, onclick: () => onOpen?.(), onkeydown: (ev: Event) => (ev as KeyboardEvent).key === 'Enter' && onOpen?.() },
    top.hero !== null ? h('div.ke-kawara-pic', {}, heroImg(top.hero)) : null,
    h(
      'div.ke-kawara-body',
      {},
      h('span.ke-kawara-tag', {}, t('かわら版', 'Kawaraban')),
      h('b.ke-kawara-head', {}, top.head),
      news.length > 1 ? h('span.ke-kawara-more', {}, t(`ほか ${news.length - 1} 件`, `${news.length - 1} more`)) : null,
    ),
  );
}

/** マインちゃんの吹き出し */
export function bubble(face: HTMLElement, text: string, onClose: () => void): HTMLElement {
  return h(
    'div.ke-advisor',
    { role: 'status' },
    h('div.ke-advisor-face', {}, face),
    h('p.ke-advisor-text', {}, text),
    h('button.ke-advisor-close', { type: 'button', 'aria-label': t('閉じる', 'Close'), onclick: onClose }, svgIcon('close', 16)),
  );
}

/** スマホの下から出るシート（3 段：閉じる・半分・全体） */
export type SheetState = 'closed' | 'half' | 'full';

export function sheet(title: string, body: HTMLElement, state: SheetState, onState: (s: SheetState) => void, tabs?: { label: string; active: boolean; on: () => void }[]): HTMLElement {
  let startY = 0;
  let dragging = false;
  const grip = h('button.ke-sheet-grip', {
    type: 'button',
    'aria-label': state === 'full' ? t('シートを半分に', 'Half sheet') : t('シートを広げる', 'Expand sheet'),
    onclick: () => onState(state === 'full' ? 'half' : 'full'),
  });
  grip.addEventListener('pointerdown', (ev) => {
    startY = (ev as PointerEvent).clientY;
    dragging = true;
  });
  grip.addEventListener('pointerup', (ev) => {
    if (!dragging) return;
    dragging = false;
    const dy = (ev as PointerEvent).clientY - startY;
    if (dy > 60) onState(state === 'full' ? 'half' : 'closed');
    else if (dy < -60) onState('full');
  });
  return h(
    'section.ke-sheet',
    { class: `ke-sheet is-${state}`, role: 'dialog', 'aria-label': title },
    grip,
    h(
      'div.ke-sheet-head',
      {},
      tabs
        ? h('div.ke-tabs', { role: 'tablist', 'aria-label': title }, ...tabs.map((tb) => h('button.ke-tab', { type: 'button', role: 'tab', 'aria-selected': String(tb.active), onclick: tb.on }, tb.label)))
        : h('h2.ke-sheet-title', {}, title),
      h('button.ke-icon-btn', { type: 'button', 'aria-label': t('閉じる', 'Close'), onclick: () => onState('closed') }, svgIcon('close')),
    ),
    h('div.ke-sheet-body', {}, body),
  );
}

/** ステークホルダーの支持度（0〜100）。40 の線を割ると要望が出る。重しが効いていれば、その残り */
export function supportMeters(items: { name: string; value: number; note?: string }[], line = 40): HTMLElement {
  return h(
    'ul.ke-support',
    { 'aria-label': t('支持度', 'Support') },
    ...items.map((it) =>
      h(
        'li.ke-support-row',
        { title: t(`${it.name}の支持度 ${Math.round(it.value)}（${line} を割ると要望が出る）`, `${it.name}: support ${Math.round(it.value)} (requests below ${line})`) },
        h('span.ke-support-name', {}, it.name),
        h(
          'span.ke-support-bar',
          {},
          h('span', { class: it.value < line ? 'is-bad' : it.value < line + 10 ? 'is-warn' : 'is-good', style: `width:${Math.max(2, Math.min(100, Math.round(it.value)))}%` }),
          h('i.ke-support-line', { style: `left:${line}%` }),
        ),
        h('b', { class: `ke-figure ${it.value < line ? 'ke-bad' : ''}` }, String(Math.round(it.value))),
        it.note ? h('span.ke-support-note', {}, it.note) : null,
      ),
    ),
  );
}
