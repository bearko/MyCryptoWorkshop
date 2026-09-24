import { t } from '../i18n';
import { fileImg, h } from './dom';

/** A screen rectangle (client pixels). */
export interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** Where the game is; a step only runs on its own screen. */
export type Place = 'day' | 'results' | 'tree';

export interface Step {
  id: string;
  place: Place;
  text: string;
  /** What to point at (null: nothing, e.g. a plain explanation). */
  target?: () => Box | null;
  /** The step may start (e.g. a thief is in the shop). Default: always. */
  when?: () => boolean;
  /** The step is finished. Steps without it are explanations closed with OK. */
  done?: () => boolean;
  /** Runs once when the step comes up (e.g. pans the tree to the node). */
  start?: () => void;
}

/**
 * マインちゃんのチュートリアル: guided steps over the first days. Each step dims the screen
 * around its target, points at it and explains in Mine-chan's bubble. The dimming never
 * blocks taps, so the player does the real thing; explanation steps (no `done`) pause the
 * day until OK. Finished steps are remembered in save.tips as `tut:<id>`; "Skip" ends the
 * tutorial for good.
 */
export class Tutorial {
  private readonly spot = h('div.tut-spot');
  private readonly hand = h('div.tut-hand', { 'aria-hidden': 'true' }, '👆');
  private readonly text = h('p.tut-text');
  private readonly okBtn = h('button.btn.btn-primary.small.tut-ok', {}, 'OK') as HTMLButtonElement;
  private readonly bubble: HTMLElement;
  private readonly root: HTMLElement;
  private current: Step | null = null;

  constructor(
    private readonly tips: string[],
    private readonly steps: Step[],
    mineImage: string,
    private readonly onChange: () => void = () => undefined,
  ) {
    const skip = h('button.btn.small.tut-skip', {}, t('チュートリアルをスキップ', 'Skip tutorial'));
    skip.addEventListener('click', () => this.skipAll());
    this.okBtn.addEventListener('click', () => this.finish());
    this.bubble = h(
      'div.tut-bubble',
      { role: 'dialog', 'aria-live': 'polite', 'aria-label': t('チュートリアル', 'Tutorial') },
      fileImg(mineImage, 'px tut-mine'),
      h('div.tut-body', {}, h('b.tut-name', {}, t('マインちゃん', 'Mine-chan')), this.text, h('div.tut-buttons', {}, skip, this.okBtn)),
    );
    this.root = h('div.tutorial', {}, this.spot, this.hand, this.bubble);
    this.root.hidden = true;
    document.body.append(this.root);
  }

  /** The tutorial was skipped or every step is done. */
  get over(): boolean {
    return this.tips.includes('tut:skip') || this.steps.every((s) => this.tips.includes(`tut:${s.id}`));
  }

  /** A step is on screen. */
  get showing(): boolean {
    return !!this.current;
  }

  /** An explanation is on screen: the day waits for OK. */
  get blocking(): boolean {
    return !!this.current && !this.current.done;
  }

  /** Whether unfinished steps remain for a place (the old one-off tips stay quiet then). */
  pending(place: Place): boolean {
    return !this.over && this.steps.some((s) => s.place === place && !this.tips.includes(`tut:${s.id}`));
  }

  /** Runs every frame (and on screen changes): advances, shows and positions the current step. */
  update(place: Place | null): void {
    if (this.over) return this.hide();
    if (!place) {
      if (this.current?.done?.()) this.finish();
      return this.hide();
    }
    // A step can finish by leaving its screen (e.g. "go to the skill tree"), so check first.
    if (this.current?.done?.()) this.finish();
    const cur = this.current;
    if (cur && (cur.place !== place || this.tips.includes(`tut:${cur.id}`))) this.current = null;
    if (!this.current) {
      // Steps run in order: the first unfinished one of this place, once it may start.
      const next = this.steps.find((s) => s.place === place && !this.tips.includes(`tut:${s.id}`));
      if (!next || (next.when && !next.when())) return this.hide();
      this.current = next;
      this.text.textContent = next.text;
      this.okBtn.hidden = !!next.done;
      this.root.hidden = false;
      this.bubble.classList.remove('show');
      void this.bubble.offsetWidth;
      this.bubble.classList.add('show');
      next.start?.();
      this.onChange();
    }
    this.place(this.current.target?.() ?? null);
  }

  private place(box: Box | null): void {
    const pad = 8;
    this.spot.hidden = !box;
    this.hand.hidden = !box;
    const vh = window.innerHeight;
    if (box) {
      Object.assign(this.spot.style, {
        left: `${box.left - pad}px`,
        top: `${box.top - pad}px`,
        width: `${box.width + pad * 2}px`,
        height: `${box.height + pad * 2}px`,
      });
      // The hand points up at the target from below (or down from above near the bottom).
      const below = box.top + box.height + 56 < vh;
      this.hand.classList.toggle('down', !below);
      Object.assign(this.hand.style, {
        left: `${box.left + box.width / 2 - 18}px`,
        top: below ? `${box.top + box.height + 4}px` : `${box.top - 48}px`,
      });
    }
    // The bubble sits in the half of the screen away from the target.
    const targetMid = box ? box.top + box.height / 2 : vh;
    this.bubble.classList.toggle('top', targetMid > vh * 0.5);
    this.bubble.classList.toggle('bottom', targetMid <= vh * 0.5);
  }

  private finish(): void {
    if (!this.current) return;
    this.tips.push(`tut:${this.current.id}`);
    this.current = null;
    this.hide();
    this.onChange();
  }

  private skipAll(): void {
    this.tips.push('tut:skip');
    this.current = null;
    this.hide();
    this.onChange();
  }

  private hide(): void {
    this.root.hidden = true;
  }
}
