// 経営モードの導入（docs/EMPIRE_DESIGN.md 10.18）。マインちゃんの提案から、最初の町の地図を開くまで。
// 1 つの場面で決めることは 1 つだけ：
//   1 提案   ：マインちゃんと話す → 新大陸に出店するか（する／今は工房を続ける）
//   2 大陸   ：4 つの大陸の地図 → どの大陸に出店するか（押すと国の形・地形・概要・特産品）
//   3 屋号   ：白い看板 → 屋号を書く（書くと看板が仕上がる演出）
//   4 入国   ：選んだ大陸へ寄っていく（決めることはない）
//   5 土地   ：ランドの 11 の土地 → 最初に開く Common の土地を選ぶ（選ぶとその土地へ寄っていく）
// 品ぞろえは、そのランドでいちばん当たるものを入れておく（あとで「品ぞろえ」から変えられる）。くわしい文化やキングは入国してから。
import './tokens.css';
import './empire.css';
import './intro.css';
import { bestFocus, FOUNDING_LANDS, landProfile, TERRAIN_TEXT, type FoundingLand } from '../../empire/lands';
import { newEmpire, type EmpireState } from '../../empire/model';
import { REGION_NAMES, RARITY_AREA } from '../../empire/nation';
import { t } from '../../i18n';
import { LandScene } from '../../render/map/land';
import { MapView, type MapTarget } from '../../render/map/view';
import { WorldScene } from '../../render/map/world';
import { h } from '../dom';
import type { SoundKey } from './cards';
import { companyTitle } from './text';

/** マインちゃんの全身の絵（あいさつ・話す・腕組み・笑顔・待つ） */
export type MinePose = 'greet' | 'talk' | 'cross' | 'smile' | 'idle';

export interface IntroOptions {
  /** そのポーズの絵（2 枚あれば口や手が動く） */
  mine: (pose: MinePose) => HTMLElement[];
  /** ランドの守り神の絵 */
  landImage?: (key: string) => HTMLElement | null;
  play?: (key: SoundKey) => void;
  onFound: (e: EmpireState) => void;
  onLater: () => void;
}

interface Line {
  pose: MinePose;
  text: string;
}

/** 4 つの大陸の置き場所（384×320 の海の中に 2×2。PC では 2 倍で全部が見える） */
const CONTINENT_POS: [number, number][] = [
  [36, 44],
  [204, 44],
  [36, 184],
  [204, 184],
];
const CONTINENT_W = 144;
const CONTINENT_H = 108;

/** Common の土地のひと言（REGION_NAMES の 0〜3） */
const COMMON_NOTES = [
  { ja: '駅に近く、人通りの多い町', en: 'Near the station, with plenty of foot traffic' }, // i18n-ja
  { ja: '港に荷が集まる、にぎやかな町', en: 'A busy town where cargo comes in' }, // i18n-ja
  { ja: '日当たりのよい、静かな住宅の町', en: 'A sunny, quiet residential town' }, // i18n-ja
  { ja: '見晴らしのよい、高台の町', en: 'A hilltop town with a fine view' }, // i18n-ja
];
const RARITY = ['Common', 'Uncommon', 'Rare', 'Epic', 'Legendary'];
/** エリアの名前から「（本拠）」を除く（創業の前なので、まだ本拠はない） */
const HOME_MARK = { ja: '（本拠）', en: ' (home)' }; // i18n-ja
const plain = (nm: { ja: string; en: string }) => t(nm.ja.replace(HOME_MARK.ja, ''), nm.en.replace(HOME_MARK.en, ''));

const reduced = () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
const seed = () => {
  const b = new Uint32Array(1);
  crypto.getRandomValues(b);
  return b[0];
};

export function introView(opts: IntroOptions): HTMLElement {
  const play = (k: SoundKey) => opts.play?.(k);
  const root = h('div.ke.ke-intro', { role: 'dialog', 'aria-label': t('マインちゃんの提案', "Mine-chan's proposal") });
  const later = h('button.ke-intro-later', { type: 'button', onclick: () => opts.onLater() }, t('あとで', 'Later'));
  const stage = h('div.ke-intro-stage', {});
  root.append(stage, later);

  let land: FoundingLand | null = null;
  let name = '';
  let view: MapView | null = null;
  const dropView = () => {
    view?.destroy();
    view = null;
  };

  // ------------------------------------------------------------ 話す（マインちゃんの全身と、下の会話の枠）

  /** マインちゃんの絵：話しているあいだは 2 枚を切り替える */
  function figure(pose: MinePose, talking: boolean, small = false): HTMLElement {
    const frames = opts.mine(pose);
    const box = h('div', { class: `ke-intro-mine ${small ? 'is-small' : ''}`, 'aria-hidden': 'true' }, ...frames);
    frames.forEach((f, i) => (f.hidden = i > 0));
    if (talking && frames.length > 1 && !reduced()) {
      let k = 0;
      const id = window.setInterval(() => {
        if (!box.isConnected) return window.clearInterval(id);
        k = (k + 1) % frames.length;
        frames.forEach((f, i) => (f.hidden = i !== k));
      }, 160);
      box.dataset.timer = String(id);
    }
    return box;
  }
  const stopFigure = (box: HTMLElement) => {
    window.clearInterval(Number(box.dataset.timer ?? 0));
    const frames = Array.from(box.children) as HTMLElement[];
    frames.forEach((f, i) => (f.hidden = i > 0));
  };

  /**
   * 会話：1 行ずつ文字が出る。押すと、出ている途中なら全部出し、出きっていれば次の行へ。
   * 最後の行のあと choices があればボタンを出し、無ければ done を呼ぶ
   */
  function talk(lines: Line[], done: () => void, choices?: { label: string; primary?: boolean; on: () => void }[]): void {
    let i = 0;
    let typing = 0;
    const box = h('div.ke-intro-talk', {});
    const textEl = h('p.ke-intro-text', { 'aria-live': 'polite' });
    const next = h('span.ke-intro-next', { 'aria-hidden': 'true' }, '▼');
    const actions = h('div.ke-intro-choices', {});
    const figHost = h('div.ke-intro-figure', {});
    const panel = h('div.ke-intro-box', {}, h('b.ke-intro-name', {}, t('マインちゃん', 'Mine-chan')), textEl, next, actions);
    box.append(figHost, panel);
    stage.replaceChildren(box);
    let fig: HTMLElement | null = null;
    const show = () => {
      const line = lines[i];
      fig = figure(line.pose, true);
      figHost.replaceChildren(fig);
      textEl.textContent = '';
      next.hidden = true;
      actions.replaceChildren();
      play('helper');
      const chars = [...line.text];
      let k = 0;
      window.clearInterval(typing);
      const finish = () => {
        window.clearInterval(typing);
        typing = 0;
        textEl.textContent = line.text;
        if (fig) stopFigure(fig);
        const last = i === lines.length - 1;
        if (last && choices) {
          actions.replaceChildren(...choices.map((c) => h('button', { type: 'button', class: `ke-btn ${c.primary ? 'ke-btn-primary' : ''} ke-intro-choice`, onclick: (ev: Event) => (ev.stopPropagation(), c.on()) }, c.label)));
          (actions.firstElementChild as HTMLElement | null)?.focus();
        } else next.hidden = false;
      };
      if (reduced()) return finish();
      typing = window.setInterval(() => {
        k++;
        textEl.textContent = chars.slice(0, k).join('');
        if (k >= chars.length) finish();
      }, 34);
      box.dataset.finish = '1';
      (box as HTMLElement & { finish?: () => void }).finish = finish;
    };
    const advance = () => {
      if (typing) return (box as HTMLElement & { finish?: () => void }).finish?.();
      if (actions.childElementCount) return;
      if (i < lines.length - 1) {
        i++;
        show();
      } else done();
    };
    box.addEventListener('click', advance);
    box.tabIndex = 0;
    box.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter' || ev.key === ' ') {
        ev.preventDefault();
        advance();
      }
    });
    show();
    box.focus();
  }

  /** 地図の上の、マインちゃんの小さな吹き出し */
  function bubble(pose: MinePose, text: string): HTMLElement {
    return h('div.ke-intro-bubble', {}, figure(pose, false, true), h('p', {}, text));
  }

  // ------------------------------------------------------------ 1 提案

  function propose(): void {
    talk(
      [
        { pose: 'greet', text: t('店主さん、おつかれさまです！ 工房の評判、すっかり広まっていますよ！', "Great work, Owner! Your workshop's name is everywhere now!") },
        { pose: 'talk', text: t('じつは……海の向こうに、新しい大陸があるんです。いくつもの国があって、文化も、当たる商売も、国ごとにちがうんですって。', 'You know... there is a new continent across the sea. It has many lands, each with its own culture and its own kind of business that sells.') },
        { pose: 'talk', text: t('工房とは別に会社をつくって、新大陸にお店を出してみませんか？ 小さな 1 軒から始めて、いつかは大陸じゅうに――！', 'How about founding a company, apart from the workshop, and opening a store over there? Start with one small shop, and someday, the whole continent!') },
        { pose: 'cross', text: t('お店の資金は、工房の売上から少しずつ送ります。会社のお金で工房が強くなるわけではないけれど……きっと、わくわくしますよ。', "Its funds come bit by bit from the workshop's sales. Company money won't power up the workshop, but... it will be exciting.") },
        { pose: 'smile', text: t('どうしますか？', 'What do you say?') },
      ],
      () => {},
      [
        {
          label: t('新大陸に出店する', 'Open a store on the new continent'),
          primary: true,
          on: () => talk([{ pose: 'greet', text: t('やったー！ では、出店する大陸を見に行きましょう！', "Yay! Then let's go look at where to open!") }], chooseLand),
        },
        {
          label: t('今は工房を続ける', 'Keep running the workshop for now'),
          on: () => talk([{ pose: 'talk', text: t('わかりました。気が変わったら、いつでもホームの「経営」から声をかけてくださいね。', 'Got it. If you change your mind, call me any time from "Company" on the home screen.') }], () => opts.onLater()),
        },
      ],
    );
  }

  // ------------------------------------------------------------ 2 大陸を選ぶ

  function worldScene(): WorldScene {
    return new WorldScene(
      FOUNDING_LANDS.map((k) => ({ land: k, status: 'open' as const })),
      { pos: CONTINENT_POS, w: CONTINENT_W, h: CONTINENT_H, width: 384, height: 344 },
    );
  }

  /** 地図の場面の枠（地図・札・吹き出し・ポップアップ） */
  function mapStage(): { host: HTMLElement; tags: HTMLElement; top: HTMLElement; pop: HTMLElement; v: MapView } {
    dropView();
    const tags = h('div.ke-tags', { 'aria-hidden': 'true' });
    const top = h('div.ke-intro-top', {});
    const pop = h('div.ke-intro-pop-host', {});
    const v = new MapView({ onSelect: (target) => onSelect(target), onCamera: () => placeTags() });
    view = v;
    // 上にマインちゃんの吹き出し、その下に地図（吹き出しが地図に重ならないように）
    const host = h('div.ke-intro-map', {}, top, h('div.ke-intro-mapwrap', {}, v.el, tags, pop));
    stage.replaceChildren(host);
    return { host, tags, top, pop, v };
  }
  let onSelect: (target: MapTarget | null) => void = () => {};
  let placeTags: () => void = () => {};

  function chooseLand(): void {
    const { tags, top, pop, v } = mapStage();
    const scene = worldScene();
    top.replaceChildren(bubble('talk', t('新大陸には、4 つの国があります。気になる国を押してみてください。', 'The new continent has four lands. Tap one that catches your eye.')));
    placeTags = () => {
      tags.replaceChildren(
        ...FOUNDING_LANDS.map((k, i) => {
          const r = scene.isleRect(i);
          const p = v.toCss(r.x, r.y + r.h + 8);
          return h('span.ke-tag.ke-intro-tag', { style: `left:${Math.round(p.x)}px;top:${Math.round(p.y)}px` }, h('b', {}, k), t(landProfile(k).kind.ja, landProfile(k).kind.en));
        }),
      );
    };
    onSelect = (target) => {
      if (!target || target.kind !== 'land') return;
      const k = FOUNDING_LANDS[target.id];
      scene.selected = target.id;
      v.invalidate();
      play('craft');
      pop.replaceChildren(landPopup(k, () => ((scene.selected = null), pop.replaceChildren(), v.invalidate())));
    };
    requestAnimationFrame(() => {
      v.setScene(scene, { zoom: 'fit', levels: [0.5, 1, 2] });
      placeTags();
    });
  }

  /** 大陸のポップアップ：国の形・地形・概要・特産品と、出店のボタン */
  function landPopup(k: FoundingLand, onClose: () => void): HTMLElement {
    const p = landProfile(k);
    return h(
      'div.ke-intro-pop',
      { role: 'dialog', 'aria-label': k },
      h('div.ke-intro-pop-head', {}, h('span.ke-land-face', {}, opts.landImage?.(k) ?? null), h('div', {}, h('h2.ke-intro-pop-title', {}, k), h('span.ke-hint', {}, t(p.kind.ja, p.kind.en)))),
      h('p.ke-intro-pop-lead', {}, t(p.summary.ja, p.summary.en)),
      h(
        'dl.ke-intro-facts',
        {},
        h('dt', {}, t('地形', 'Terrain')),
        h('dd', {}, t(TERRAIN_TEXT[p.terrain].ja, TERRAIN_TEXT[p.terrain].en)),
        h('dt', {}, t('特産品', 'Specialty')),
        h('dd', {}, t(p.specialty.name.ja, p.specialty.name.en)),
      ),
      h(
        'div.ke-intro-pop-actions',
        {},
        h('button.ke-btn.ke-btn-primary', { type: 'button', onclick: () => ((land = k), play('build'), naming()) }, t(`${k}に出店する`, `Open in ${k}`)),
        h('button.ke-btn', { type: 'button', onclick: onClose }, t('ほかの国も見る', 'Look at other lands')),
      ),
    );
  }

  // ------------------------------------------------------------ 3 屋号を決める

  function naming(): void {
    dropView();
    const k = land!;
    const input = h('input.ke-sign-input', { type: 'text', maxlength: 12, value: name || t('マイクリ', 'MyCrypto'), 'aria-label': t('屋号', 'Company name'), enterkeyhint: 'done' }) as HTMLInputElement;
    const suffix = h('span.ke-sign-suffix', {}, t('商店', 'Store'));
    const sign = h('div.ke-sign', {}, h('div.ke-sign-board', {}, input, suffix), h('div.ke-sign-legs', { 'aria-hidden': 'true' }));
    const say = h('p', {}, t(`${k}ですね！ では、いよいよお店の名前――屋号を決めましょう。最初の看板に書く、大事な名前です。`, `${k} it is! Now for the big one: your store's name. It goes on your very first signboard.`));
    const fig = h('div.ke-intro-figure', {}, figure('talk', false));
    const go = h('button.ke-btn.ke-btn-primary.ke-intro-go', { type: 'button' }, t('この名前で看板をつくる', 'Make the signboard'));
    const box = h('div.ke-intro-naming', {}, fig, h('div.ke-intro-naming-body', {}, h('div.ke-intro-say', {}, say), sign, go));
    stage.replaceChildren(box);
    const submit = () => {
      name = input.value.trim().slice(0, 12) || t('マイクリ', 'MyCrypto');
      go.remove();
      // 看板に 1 文字ずつ書き入れる
      const title = companyTitle({ name, phase: 1 });
      const letters = h('div.ke-sign-letters', { 'aria-label': title }, ...[...title].map((ch, i) => h('span', { style: `animation-delay:${reduced() ? 0 : i * 110}ms` }, ch)));
      sign.firstElementChild!.replaceChildren(letters);
      sign.classList.add('is-made');
      play('build');
      const after = reduced() ? 0 : [...title].length * 110 + 500;
      window.setTimeout(() => {
        if (!box.isConnected) return;
        play('rare');
        fig.replaceChildren(figure('smile', false));
        say.textContent = t(`「${title}」……すてきな名前！ さあ、${k}へ出発です！`, `"${title}"... what a great name! Off to ${k}!`);
        box.querySelector('.ke-intro-naming-body')!.append(h('button.ke-btn.ke-btn-primary.ke-intro-go', { type: 'button', onclick: () => sail() }, t('出発する', 'Set sail')));
        (box.querySelector('.ke-intro-go') as HTMLElement | null)?.focus();
      }, after);
    };
    go.addEventListener('click', submit);
    input.addEventListener('keydown', (ev) => ev.key === 'Enter' && submit());
    requestAnimationFrame(() => input.select());
  }

  // ------------------------------------------------------------ 4 入国（選んだ大陸へ寄っていく）

  /** 地図の一点へ寄っていく演出（終わったら then） */
  function zoomInto(v: MapView, r: { x: number; y: number; w: number; h: number }, then: () => void): void {
    if (reduced()) return then();
    const c = v.toCss(r.x + r.w / 2, r.y + r.h / 2);
    const el = v.el;
    el.style.transformOrigin = `${Math.round(c.x)}px ${Math.round(c.y)}px`;
    const a = el.animate(
      [
        { transform: 'scale(1)', opacity: 1 },
        { transform: 'scale(2.2)', opacity: 1, offset: 0.7 },
        { transform: 'scale(3.4)', opacity: 0 },
      ],
      { duration: 1100, easing: 'cubic-bezier(.5,0,.75,0)', fill: 'forwards' },
    );
    a.onfinish = then;
  }

  function sail(): void {
    const k = land!;
    const i = FOUNDING_LANDS.indexOf(k);
    const { top, v } = mapStage();
    const scene = worldScene();
    scene.selected = i;
    onSelect = () => {};
    placeTags = () => {};
    top.replaceChildren(h('p.ke-intro-caption', {}, t(`${k}へ向かいます`, `Heading for ${k}`)));
    requestAnimationFrame(() => {
      v.setScene(scene, { zoom: 'fit', levels: [0.5, 1, 2] });
      window.setTimeout(() => zoomInto(v, scene.isleRect(i), chooseSector), reduced() ? 0 : 700);
    });
  }

  // ------------------------------------------------------------ 5 最初の土地を選ぶ

  function chooseSector(): void {
    const k = land!;
    play('win');
    const { tags, top, pop, v } = mapStage();
    v.el.classList.add('ke-intro-fadein');
    const plates = REGION_NAMES.map((r) => ({ rarity: r.rarity, own: 0, rival: 0, capacity: RARITY_AREA[r.rarity].capacity, hub: false, locked: r.rarity > 0 }));
    const scene = new LandScene(k, plates);
    const commons = plates.map((p, i) => (p.rarity === 0 ? i : -1)).filter((i) => i >= 0);
    let step = 0;
    const say = (pose: MinePose, text: string) => top.replaceChildren(bubble(pose, text));
    const lines = [
      t(`ここが${k}です。全部で 11 の土地に分かれていて、奥へいくほど人の多い一等地。いちばん奥の Legendary は、世界じゅうの会社が競い合う大市場です。`, `This is ${k}. It is split into 11 areas; the farther in, the busier. The Legendary area at the heart is the grand market every company fights over.`),
      t('最初にお店を出せるのは、光っている Common の土地だけ。どこから始めましょう？', 'You can only start in a glowing Common area. Where shall we begin?'),
    ];
    const nextLine = () => {
      step++;
      if (step < lines.length - 1) {
        say('talk', lines[step]);
        top.append(h('button.ke-intro-more', { type: 'button', onclick: nextLine }, t('つぎへ', 'Next')));
        return;
      }
      // 最後の行：選べる Common の板が光る
      step = lines.length - 1;
      say('smile', lines[step]);
      scene.highlight = commons;
      v.invalidate();
    };
    say('talk', lines[0]);
    top.append(h('button.ke-intro-more', { type: 'button', onclick: nextLine }, t('つぎへ', 'Next')));
    placeTags = () => {
      tags.replaceChildren(
        ...plates.map((p, i) => {
          const r = scene.plateRect(i);
          const c = v.toCss(r.x, r.y + r.h + 4);
          const nm = REGION_NAMES[i];
          // 引いて見ているときは、まだ開けない土地の名前を省く（札が重ならないように）
          const short = v.currentZoom < 1 && p.rarity > 0;
          return h('span', { class: `ke-tag ${p.rarity === 0 ? 'is-pick' : ''} ${p.rarity === 4 ? 'is-legend' : ''}`, style: `left:${Math.round(c.x)}px;top:${Math.round(c.y)}px` }, h('span', { class: `ke-rar ke-rar-${p.rarity}` }, ['C', 'UC', 'R', 'E', 'L'][p.rarity]), short ? null : plain(nm));
        }),
      );
    };
    onSelect = (target) => {
      if (!target || target.kind !== 'region') return;
      const i = target.id;
      if (plates[i].rarity > 0) {
        say('cross', t(`そこは${RARITY[plates[i].rarity]}の土地。もっと大きな会社になってからです。まずは Common から始めましょう！`, `That's a ${RARITY[plates[i].rarity]} area, for when you're a bigger company. Start with a Common one!`));
        return;
      }
      if (!scene.highlight.length) {
        scene.highlight = commons;
        step = lines.length;
      }
      scene.selected = i;
      v.invalidate();
      play('craft');
      const nm = REGION_NAMES[i];
      pop.replaceChildren(
        h(
          'div.ke-intro-pop',
          { role: 'dialog', 'aria-label': t(nm.ja, nm.en) },
          h('div', {}, h('h2.ke-intro-pop-title', {}, plain(nm)), h('span.ke-hint', {}, 'Common')),
          h('p.ke-intro-pop-lead', {}, t(COMMON_NOTES[i].ja, COMMON_NOTES[i].en)),
          h(
            'div.ke-intro-pop-actions',
            {},
            h('button.ke-btn.ke-btn-primary', { type: 'button', onclick: () => found(i, scene.plateRect(i)) }, t('ここから始める', 'Start here')),
            h('button.ke-btn', { type: 'button', onclick: () => ((scene.selected = null), pop.replaceChildren(), v.invalidate()) }, t('ほかの土地も見る', 'Look at other areas')),
          ),
        ),
      );
    };
    requestAnimationFrame(() => {
      const hiDpi = typeof devicePixelRatio !== 'undefined' && devicePixelRatio >= 2;
      v.setScene(scene, { zoom: 'fit', levels: hiDpi ? [0.5, 1, 2] : [1, 2] });
      placeTags();
    });
  }

  /** 会社をつくる：選んだ土地へ寄っていき、最初の町の地図へ */
  function found(sector: number, rect: { x: number; y: number; w: number; h: number }): void {
    const k = land!;
    const e: EmpireState = { ...newEmpire(name || t('マイクリ', 'MyCrypto'), seed(), k, bestFocus(k)), homeSector: sector };
    const v = view;
    stage.querySelector('.ke-intro-pop-host')?.replaceChildren();
    stage.querySelector('.ke-intro-top')?.replaceChildren();
    stage.querySelector('.ke-tags')?.replaceChildren();
    if (!v) return opts.onFound(e);
    zoomInto(v, rect, () => {
      dropView();
      opts.onFound(e);
    });
  }

  const onKey = (ev: KeyboardEvent) => {
    if (ev.key === 'Escape' && root.isConnected && !document.querySelector('.modal-backdrop')) {
      ev.stopPropagation();
      opts.onLater();
    }
  };
  window.addEventListener('keydown', onKey, true);
  const mo = new MutationObserver(() => {
    if (!root.isConnected) {
      window.removeEventListener('keydown', onKey, true);
      dropView();
      mo.disconnect();
    }
  });
  queueMicrotask(() => root.parentNode && mo.observe(root.parentNode, { childList: true }));

  propose();
  return root;
}
