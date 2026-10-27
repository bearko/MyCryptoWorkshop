/** フェーズ 1 の画面の小さな道具（DOM・数の書式・アイコン） */
import { getExtension, heroById } from '../../game/catalog';
import { isEn } from '../../i18n';
import { icon } from '../../ui/dom';
import { PRODUCT, skuParts, type Mat, type Sku } from './data';

export function h<K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', text = ''): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text) e.textContent = text;
  return e;
}

export function btn(text: string, on: () => void, cls = ''): HTMLButtonElement {
  const b = h('button', `isl-btn ${cls}`.trim(), text);
  b.type = 'button';
  b.addEventListener('click', (e) => {
    e.stopPropagation();
    on();
  });
  return b;
}

export const fmt = (n: number) => Math.round(n).toLocaleString('en-US');
export const money = (n: number) => `${fmt(n)} G`;

export function heroName(id: number): string {
  const x = heroById.get(id);
  return x ? (isEn ? x.nameEn : x.name) : `#${id}`;
}

export function heroIcon(id: number, size = 48): HTMLElement {
  const x = heroById.get(id);
  const e = icon(x?.image ?? '', 'px isl-hero');
  e.style.width = `${size}px`;
  e.style.height = `${size}px`;
  return e;
}

export function matIcon(m: Mat, size = 24): HTMLImageElement {
  const im = h('img', 'isl-mat');
  im.src = `${import.meta.env.BASE_URL}island/items/${m}.png`;
  im.alt = '';
  im.width = size;
  im.height = size;
  return im;
}

export function skuName(x: Sku): string {
  const [k, r] = skuParts(x);
  const e = getExtension(PRODUCT[k].ext[r]);
  return e.name;
}

export function skuIcon(x: Sku, size = 40): HTMLElement {
  const [k, r] = skuParts(x);
  const e = icon(getExtension(PRODUCT[k].ext[r]).image, 'px isl-ext');
  e.style.width = `${size}px`;
  e.style.height = `${size}px`;
  return e;
}

export function bar(v: number, color = 'var(--isl-good)'): HTMLElement {
  const b = h('i', 'isl-bar');
  b.style.setProperty('--v', `${Math.round(Math.max(0, Math.min(1, v)) * 100)}%`);
  b.style.setProperty('--c', color);
  return b;
}

/** 下から出る大きな札（工房・お店・調達など）。閉じると消える */
export function sheet(root: HTMLElement, title: string, onClose: () => void): { body: HTMLElement; close: () => void; el: HTMLElement } {
  const el = h('div', 'isl-sheet');
  const box = h('div', 'isl-sheet-box');
  const head = h('div', 'isl-sheet-head');
  const close = () => {
    el.remove();
    onClose();
  };
  head.append(h('h2', '', title), btn('✕', close));
  const body = h('div', 'isl-sheet-body');
  box.append(head, body);
  el.append(box);
  el.addEventListener('click', (e) => {
    if (e.target === el) close();
  });
  root.append(el);
  return { body, close, el };
}

export function select<T extends string | number>(options: { value: T; label: string; disabled?: boolean }[], value: T | null, on: (v: T) => void, empty?: string): HTMLSelectElement {
  const s = h('select', 'isl-select');
  if (empty !== undefined) {
    const o = h('option', '', empty);
    o.value = '';
    s.append(o);
  }
  for (const op of options) {
    const o = h('option', '', op.label);
    o.value = String(op.value);
    o.disabled = !!op.disabled;
    if (op.value === value) o.selected = true;
    s.append(o);
  }
  s.addEventListener('change', () => {
    const raw = s.value;
    const hit = options.find((op) => String(op.value) === raw);
    if (hit) on(hit.value);
  });
  return s;
}
