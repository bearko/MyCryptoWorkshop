/** フェーズ 1 の画面の小さな道具（DOM・数の書式・アイコン） */
import { allSeries, extensionById, heroById } from '../../game/catalog';
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

/** マインちゃんの文：[[ ]] で囲んだ固有名詞に色をつける */
export function rich(text: string): DocumentFragment {
  const f = document.createDocumentFragment();
  text.split(/\[\[(.+?)\]\]/).forEach((part, k) => {
    if (!part) return;
    f.append(k % 2 ? h('b', 'isl-em', part) : document.createTextNode(part));
  });
  return f;
}

/** [[ ]] を外した文（トーストなど色をつけない所） */
export const plain = (text: string) => text.replace(/\[\[(.+?)\]\]/g, '$1');

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

/** エクステの絵（ゲームで使うシリーズに無いエクステ＝発掘の遺物の一部も、カタログの全シリーズから） */
let allImages: Map<number, string> | null = null;
export function extImage(id: number): string {
  const e = extensionById.get(id);
  if (e) return e.image;
  allImages ??= new Map(allSeries.flatMap((x) => x.items.map((y) => [y.id, y.image] as const)));
  return allImages.get(id) ?? '';
}

export function skuName(x: Sku): string {
  const [k, r] = skuParts(x);
  const p = PRODUCT[k];
  // 復刻品は「復刻 ○○」
  if (p.relic) return p.name;
  return extensionById.get(p.ext[r])?.name ?? p.name;
}

export function skuIcon(x: Sku, size = 40): HTMLElement {
  const [k, r] = skuParts(x);
  const e = icon(extImage(PRODUCT[k].ext[r]), 'px isl-ext');
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
export function sheet(root: HTMLElement, title: string, onClose: () => void, onUser?: () => void): { body: HTMLElement; close: () => void; el: HTMLElement } {
  const el = h('div', 'isl-sheet');
  const box = h('div', 'isl-sheet-box');
  const head = h('div', 'isl-sheet-head');
  const close = () => {
    el.remove();
    onClose();
  };
  // ✕ や外側を押して閉じたとき（別の札に切り替えるときは呼ばない）
  const userClose = () => {
    close();
    onUser?.();
  };
  head.append(h('h2', '', title), btn('✕', userClose));
  const body = h('div', 'isl-sheet-body');
  box.append(head, body);
  el.append(box);
  el.addEventListener('click', (e) => {
    if (e.target === el) userClose();
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
