import { assetUrl } from '../render/images';

type Attrs = Record<string, string | number | boolean | undefined | ((ev: Event) => void)>;
type Child = Node | string | number | null | undefined | false;

/** Tiny hyperscript helper: h('div.card#id', { onclick }, children...). */
export function h<K extends keyof HTMLElementTagNameMap>(tag: K | string, attrs: Attrs = {}, ...children: Child[]): HTMLElement {
  const [name, ...rest] = tag.split(/(?=[.#])/);
  const el = document.createElement(name || 'div');
  for (const part of rest) {
    if (part.startsWith('.')) el.classList.add(part.slice(1));
    else if (part.startsWith('#')) el.id = part.slice(1);
  }
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === false) continue;
    if (typeof v === 'function') el.addEventListener(k.replace(/^on/, ''), v as EventListener);
    else if (k === 'style') el.setAttribute('style', String(v));
    else if (k === 'html') el.innerHTML = String(v);
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  for (const c of children) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

export function icon(path: string, cls = 'px', alt = ''): HTMLImageElement {
  const im = document.createElement('img');
  im.src = assetUrl(path);
  im.className = cls;
  im.alt = alt;
  im.draggable = false;
  return im;
}

export { fmt, secs } from '../game/format';
