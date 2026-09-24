import { h, icon } from './dom';

/** How long a cut-in stays on screen (ms), after sliding in. */
const HOLD_MS = 1300;
const SLIDE_MS = 250;

/**
 * The My Crypto Heroes passive-skill cut-in: a skewed band slides across the scene with the
 * hero's sprite and the skill name. Styles are in style.css (.mch-passive-cutin*), adapted
 * from vendor/mycryptoheroes/Style/Cutins/passive_skill_cutin.css.
 */
export function cutin(parent: HTMLElement, image: string, name: string, skill: string, side: 'ally' | 'opponent' = 'ally'): void {
  const band = h(
    'div.mch-passive-cutin',
    { class: `mch-passive-cutin mch-passive-cutin--${side} mch-passive-cutin-enter`, 'aria-live': 'polite' },
    h('div.mch-passive-cutin__shine', { class: `mch-passive-cutin__shine mch-passive-cutin__shine--${side}` }),
    h(
      'div.mch-passive-cutin-unit',
      {},
      h('div.mch-passive-cutin-unit__image', {}, icon(image, 'px')),
      h('div.cutin-text', {}, h('div.cutin-name', {}, name), h('p.mch-passive-cutin-unit__skill-name', {}, skill)),
    ),
  );
  parent.append(band);
  // Next frame: slide in; then hold, slide out and remove.
  requestAnimationFrame(() => requestAnimationFrame(() => band.classList.replace('mch-passive-cutin-enter', 'mch-passive-cutin-enter-to')));
  window.setTimeout(() => band.classList.replace('mch-passive-cutin-enter-to', 'mch-passive-cutin-leave-to'), SLIDE_MS + HOLD_MS);
  window.setTimeout(() => band.remove(), SLIDE_MS * 2 + HOLD_MS + 100);
}
