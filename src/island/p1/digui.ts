/**
 * 発掘場のパネルと研究ノート（docs/ISLAND_PHASE1.md「地層の発掘と研究ポイント」の「発掘場の画面」「研究ノート」）。
 *
 * - 発掘場は地図の工房の吹き出しから開く。**開いていても時間を止めない**（憲章 1-2 の例外：売れるのを待つあいだに掘る遊び）。
 *   シート（screens.ts の open）ではなく、地図の上に重ねるパネル。スマホは地図の下半分、PC は右の帯の横に縦長。
 * - 片手のタップで 1 打、長押しで同じマスを連続で打つ。月末ポーズのあいだも、たまった回数のぶんは掘れる（model.ts の dig）。
 * - 出土の演出は 1 つだけ大きく（憲章 3）：崩れたら小さく砕ける粒、エクステは絵が飛び出して研究ノートのボタンへ吸い込まれる、
 *   お題のときだけ画面の中央に大きく。石板は読み物の小さな窓。
 * 表示の計算は digview.ts（純粋な関数）。
 */
import { getExtension } from '../../game/catalog';
import { t } from '../../i18n';
import { icon } from '../../ui/dom';
import { BLAST, DIG, TABLET, type Mat } from './data';
import { assign, blast, dig, digSite, extName, hasBlast, picksCap, type DigErr, type DigHit, type DigItem } from './model';
import { autoDiggers, biggestFx, cellView, digBlock, digErrText, digStatus, findLabel, focusRow, fxOf, nextLvText, noteEntries, noteTablets, noteTabs, noteTotals, stars } from './digview';
import { pickHero } from './heroui';
import { open, refreshSheet, sheetOpen, type Ctx } from './screens';
import { btn, h, heroIcon, heroName, matIcon, money } from './ui';

/** 発掘場からほかの画面へ（main.ts が渡す） */
export interface DigHooks {
  /** SCM のサプライチェーンを開く（上の 1 行の詰まりを押した） */
  supply: () => void;
  /** 閉じた（地図の UI を描き直す） */
  closed: () => void;
  /** 打った（発掘との出会いの「最初の出土」を見る） */
  hit?: (hits: DigHit[]) => void;
}

const STAGE_NAME: Record<string, string> = { buy: t('① 調達', '① Buy'), craft: t('② 製造', '② Craft'), haul: t('③ 物流', '③ Haul'), sell: t('④ 販売', '④ Sell') };

/** エクステの絵（MCH の 64×64。整数倍か半分で） */
export function extIcon(id: number, size = 64): HTMLElement {
  const e = icon(getExtension(id).image, 'px isl-ext');
  e.style.width = `${size}px`;
  e.style.height = `${size}px`;
  return e;
}
/** 石板の仮の絵（CSS で描いた石の板。docs/ISLAND_ART_TODO.md） */
export function tabletIcon(size = 32): HTMLElement {
  const e = h('i', 'isl-tablet');
  e.style.setProperty('--sz', `${size}px`);
  return e;
}
function itemIcon(it: DigItem, size: number): HTMLElement {
  if (it.kind === 'ext') return extIcon(it.id, size);
  if (it.kind === 'mat') return matIcon(it.mat as Mat, size);
  return tabletIcon(size);
}

// ---------------------------------------------------------------- 発掘場のパネル

interface Panel {
  ctx: Ctx;
  hooks: DigHooks;
  el: HTMLElement;
  bar: HTMLElement;
  tools: HTMLElement;
  why: HTMLElement;
  scroll: HTMLElement;
  grid: HTMLElement;
  notes: HTMLButtonElement;
  cells: HTMLButtonElement[];
  sector: string;
  /** 次に押したマスで発破を使う */
  blastArm: boolean;
  /** 直前の「打てない理由」（数秒だけ出す） */
  err: { text: string; until: number } | null;
}
let P: Panel | null = null;
let saveTimer = 0;

export const digOpen = () => !!P;

export function closeDig() {
  if (!P) return;
  const hooks = P.hooks;
  flushSave();
  stopHold();
  P.el.remove();
  document.querySelector('.isl-dig-big')?.remove();
  P = null;
  hooks.closed();
}

function flushSave() {
  if (!saveTimer || !P) return;
  clearTimeout(saveTimer);
  saveTimer = 0;
  P.ctx.save();
}
/** 打つたびに保存すると重いので、少しまとめる */
function soonSave() {
  if (saveTimer) return;
  saveTimer = window.setTimeout(() => {
    saveTimer = 0;
    P?.ctx.save();
  }, 800);
}

export function openDig(ctx: Ctx, hooks: DigHooks) {
  const s = ctx.s();
  if (!digSite(s) || !s.dig) {
    ctx.toast(digErrText('no-site'));
    return;
  }
  if (P) closeDig();
  const el = h('section', 'isl-dig');
  el.setAttribute('aria-label', t('発掘場', 'Dig site'));
  // 地図のドラッグ・タップに渡さない
  el.addEventListener('pointerdown', (e) => e.stopPropagation());
  el.addEventListener('wheel', (e) => e.stopPropagation(), { passive: true });
  const head = h('div', 'isl-dig-head');
  const title = h('h2', '', t('⛏ 発掘場', '⛏ Dig site'));
  const notes = btn(t('📖 研究ノート', '📖 Notebook'), () => openNotes(ctx, { fromDig: hooks }), 'isl-dig-notes');
  const x = btn('✕', () => closeDig(), 'isl-dig-x');
  x.setAttribute('aria-label', t('閉じる', 'Close'));
  head.append(title, notes, x);
  const bar = h('div', 'isl-dig-bar');
  const tools = h('div', 'isl-dig-tools');
  const why = h('p', 'isl-dig-why');
  const scroll = h('div', 'isl-dig-scroll');
  const grid = h('div', 'isl-dig-grid');
  scroll.append(grid);
  el.append(head, bar, tools, why, scroll);
  ctx.root.append(el);
  P = { ctx, hooks, el, bar, tools, why, scroll, grid, notes, cells: [], sector: s.dig.sector, blastArm: false, err: null };
  buildGrid();
  refreshDig();
  // 上の帯・吹き出し・「次の月へ」の位置を合わせる
  ctx.refresh();
  // いちばん深く掘ったあたりを、上から 3 分の 1 に
  requestAnimationFrame(() => {
    if (!P) return;
    const row = focusRow(s);
    const c = P.cells[row * digSite(s)!.w];
    if (c) P.scroll.scrollTop = Math.max(0, c.offsetTop - P.scroll.clientHeight / 3);
  });
}

/** パネルの外枠の位置（地図のカメラを合わせるのに使う） */
export const digRect = () => P?.el.getBoundingClientRect() ?? null;

function buildGrid() {
  const p = P!;
  const s = p.ctx.s();
  const L = digSite(s)!;
  p.grid.replaceChildren();
  p.grid.style.setProperty('--w', String(L.w));
  p.cells = [];
  for (let y = 0; y < L.h; y++) {
    const layer = L.cells[y * L.w].layer;
    if (L.rows[layer] === y) {
      const st = DIG[L.tier].layers[layer];
      const lab = h('div', 'isl-dig-layer', st.name);
      lab.style.setProperty('--lc', st.color);
      p.grid.append(lab);
    }
    for (let x = 0; x < L.w; x++) {
      const b = h('button', 'isl-dig-cell');
      b.type = 'button';
      b.dataset.x = String(x);
      b.dataset.y = String(y);
      b.style.setProperty('--lc', DIG[L.tier].layers[layer].color);
      bindHold(b, x, y);
      p.cells.push(b);
      p.grid.append(b);
    }
  }
}

/** 1 日ごと・打つたびに：上の 1 行・道具・マス目を描き直す（パネルを作り直さない） */
export function refreshDig() {
  const p = P;
  if (!p) return;
  const s = p.ctx.s();
  if (!s.dig || !digSite(s)) return closeDig();
  if (s.dig.sector !== p.sector) {
    p.sector = s.dig.sector;
    buildGrid();
  }
  const st = digStatus(s)!;
  // 上の 1 行：SCM の詰まり（赤）・ツルハシの回数・RP・いまの層・お題の進み
  p.bar.replaceChildren();
  if (st.jam) {
    const j = btn(t(`詰まり ${STAGE_NAME[st.jam]}`, `Jam ${STAGE_NAME[st.jam]}`), () => p.hooks.supply(), 'isl-dig-jam');
    j.title = t('SCM のいちばん細いところ（押すとサプライチェーン）', 'Narrowest SCM stage (tap for the supply chain)');
    p.bar.append(j);
  }
  const chip = (cls: string, k: string, v: string) => {
    const c = h('span', `isl-dig-chip ${cls}`);
    c.append(h('small', '', k), h('b', '', v));
    p.bar.append(c);
    return c;
  };
  chip(st.full ? 'is-full' : st.picks ? '' : 'is-zero', '⛏', `${st.picks} / ${st.cap}`).title = st.full ? t('上限。いま売れても増えないので、掘ろう', 'At the cap: sales add no more until you dig') : t('ツルハシの回数（お店で 1 個売れるごとに +1）', 'Pick swings (+1 per item sold)');
  chip('is-rp', t('研', 'RP'), `${st.rp}`);
  chip('', t('層', 'Layer'), st.layer);
  chip(st.topics[0] >= st.topics[1] ? 'is-done' : '', t('お題', 'Targets'), `${st.topics[0]} / ${st.topics[1]}`);
  // 道具：発破（買ってあれば）・自動発掘の人
  p.tools.replaceChildren();
  if (hasBlast(s)) {
    const b = btn(p.blastArm ? t('💥 発破：掘るマスを押す（やめる）', '💥 Blast: tap a cell (cancel)') : t(`💥 発破（1 回 ${money(BLAST.cost)}）`, `💥 Blast (${money(BLAST.cost)} each)`), () => {
      p.blastArm = !p.blastArm;
      p.ctx.sfx?.('tap');
      refreshDig();
    }, `isl-dig-blast ${p.blastArm ? 'is-on' : ''}`);
    b.title = t('ツルハシ 1 回と火薬代で、押したマスを真ん中に 3 × 3 を一度に崩す', 'One swing plus powder clears 3 × 3 around the cell');
    if (s.money < BLAST.cost) {
      b.disabled = true;
      b.title = digErrText('money');
    }
    p.tools.append(b);
  }
  const auto = autoDiggers(s);
  const who = h('button', `isl-dig-auto ${auto.length ? '' : 'is-empty'}`);
  who.type = 'button';
  if (auto.length) {
    for (const a of auto.slice(0, 2)) who.append(heroIcon(a.hero, 28));
    const per = auto.reduce((v, a) => v + (a.resting ? 0 : a.perDay), 0);
    who.append(h('span', '', t(`自動発掘 1 日 ${Math.round(per * 10) / 10} 回`, `Auto ${Math.round(per * 10) / 10}/day`)));
    if (auto.every((a) => a.resting)) who.append(h('small', 'isl-bad', t('休憩中', 'Resting')));
  } else who.append(h('span', '', t('＋ 自動発掘の担当', '+ Auto digger')));
  who.addEventListener('click', (e) => {
    e.stopPropagation();
    pickDigger();
  });
  p.tools.append(who);
  // 打てない理由（パネル全体：回数 0 など）。直前に押したマスの理由は数秒だけ
  const block = digBlock(s);
  const now = performance.now();
  const msg = p.err && p.err.until > now ? p.err.text : block ? digErrText(block) : p.blastArm ? t('発破：手が届くマスを押すと、まわり 3 × 3 も一度に崩れる', 'Blast: tap a reachable cell to clear the 3 × 3 around it') : st.full ? t('ツルハシの回数が上限。いま売れても増えないので、掘ろう！', 'Swings are at the cap: dig so sales keep adding more!') : t('光っているマスをタップで 1 打、長押しで続けて打つ', 'Tap a lit cell to strike, hold to keep striking');
  p.why.textContent = msg;
  p.why.className = `isl-dig-why ${(p.err && p.err.until > now) || block ? 'is-bad' : st.full ? 'is-warn' : ''}`;
  p.el.classList.toggle('is-blast', p.blastArm);
  paintCells();
}

function paintCells() {
  const p = P!;
  const s = p.ctx.s();
  const L = digSite(s)!;
  const none = !!digBlock(s);
  for (let k = 0; k < p.cells.length; k++) {
    const x = k % L.w;
    const y = Math.floor(k / L.w);
    const v = cellView(s, x, y);
    const b = p.cells[k];
    const key = `${v.state}|${v.crack}|${v.taps}|${v.peek ? JSON.stringify(v.peek) : ''}|${none}`;
    if (b.dataset.k === key) continue;
    b.dataset.k = key;
    b.className = `isl-dig-cell is-${v.state} ${v.crack ? `is-crack${v.crack}` : ''} ${none && v.state === 'open' ? 'is-idle' : ''}`;
    b.replaceChildren();
    b.disabled = v.state === 'dug';
    b.setAttribute('aria-label', v.state === 'dug' ? t('掘ったマス', 'Dug') : v.state === 'open' ? t(`あと ${v.taps} 回で崩れる`, `${v.taps} more strikes`) : t('まだ手が届かない', 'Out of reach'));
    if (v.peek) {
      const pk = h('span', `isl-dig-peek ${v.peek.kind === 'ext' && v.peek.topic ? 'is-topic' : ''}`);
      pk.append(itemIcon(v.peek, 32));
      b.append(pk);
    }
    if (v.state === 'open') {
      const pips = h('span', 'isl-dig-pips');
      for (let i = 0; i < Math.min(5, v.taps); i++) pips.append(h('i'));
      b.append(pips);
    }
  }
}

// ---------------------------------------------------------------- 打つ（タップで 1 打・長押しで連続）

let hold: { timer: number; x: number; y: number; px: number; py: number; repeating: boolean; id: number } | null = null;
function stopHold() {
  if (!hold) return;
  clearTimeout(hold.timer);
  hold = null;
}
function bindHold(b: HTMLButtonElement, x: number, y: number) {
  b.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    stopHold();
    hold = { timer: 0, x, y, px: e.clientX, py: e.clientY, repeating: false, id: e.pointerId };
    // 長押し：少し待ってから、同じマスを続けて打つ（崩れたら止まる）
    const loop = () => {
      if (!hold) return;
      hold.repeating = true;
      const r = strike(hold.x, hold.y);
      if (r !== 'more') return stopHold();
      hold.timer = window.setTimeout(loop, 170);
    };
    hold.timer = window.setTimeout(loop, 380);
  });
  b.addEventListener('pointermove', (e) => {
    if (hold && !hold.repeating && Math.hypot(e.clientX - hold.px, e.clientY - hold.py) > 10) stopHold();
  });
  b.addEventListener('pointerup', () => {
    if (!hold) return;
    const rep = hold.repeating;
    stopHold();
    // 長押しで打っていなければ、指を離したときに 1 打（スクロールしようとしたときは打たない）
    if (!rep) strike(x, y);
  });
  b.addEventListener('pointercancel', () => stopHold());
  b.addEventListener('pointerleave', () => stopHold());
  // キーボード（Enter・Space）
  b.addEventListener('click', (e) => {
    e.stopPropagation();
    if (e.detail === 0) strike(x, y);
  });
}

/** 打つ：'more'（まだ崩れていない）／'broke'／'err' */
function strike(x: number, y: number): 'more' | 'broke' | 'err' {
  const p = P;
  if (!p) return 'err';
  const s = p.ctx.s();
  const useBlast = p.blastArm;
  const r = useBlast ? blast(s, x, y) : dig(s, x, y);
  if (typeof r === 'string') {
    fail(x, y, r);
    return 'err';
  }
  const hits = Array.isArray(r) ? r : [r];
  if (useBlast) p.blastArm = false;
  p.err = null;
  soonSave();
  showHits(hits, useBlast);
  p.hooks.hit?.(hits);
  // 上の帯（RP・資金）と吹き出しを描き直す
  p.ctx.refresh();
  refreshDig();
  return hits.some((h2) => h2.broke) ? 'broke' : 'more';
}

function fail(x: number, y: number, e: DigErr) {
  const p = P!;
  p.ctx.sfx?.('error');
  p.err = { text: digErrText(e), until: performance.now() + 2600 };
  const c = cellAt(x, y);
  if (c) {
    c.classList.remove('is-shake');
    void c.offsetWidth;
    c.classList.add('is-shake');
  }
  refreshDig();
  window.setTimeout(() => P && refreshDig(), 2700);
}

const cellAt = (x: number, y: number) => {
  const p = P;
  if (!p) return null;
  const L = digSite(p.ctx.s());
  return L ? (p.cells[y * L.w + x] ?? null) : null;
};

// ---------------------------------------------------------------- 出土の演出

function showHits(hits: DigHit[], wasBlast: boolean) {
  const p = P!;
  const big = biggestFx(hits);
  // 音：打つたびに「ゴツッ」。エクステ・石板は宝箱の音、お題は採掘完了の音（大きい演出のときだけ）
  p.ctx.sfx?.('dig');
  if (big === 'topic') window.setTimeout(() => p.ctx.sfx?.('mining'), 120);
  else if (big === 'ext' || big === 'tablet') window.setTimeout(() => p.ctx.sfx?.('treasure'), 90);
  else if (big === 'mat') window.setTimeout(() => p.ctx.sfx?.('check'), 90);
  if (wasBlast) p.el.classList.add('is-boom');
  window.setTimeout(() => P?.el.classList.remove('is-boom'), 400);
  let delay = 0;
  for (const hit of hits) {
    const f = fxOf(hit);
    const c = cellAt(hit.x, hit.y);
    if (!c) continue;
    if (f === 'chip') {
      shake(c);
      dust(c, 3, false);
      continue;
    }
    dust(c, 8, true);
    if (f === 'mat' && hit.item?.kind === 'mat') floatUp(c, matIcon(hit.item.mat as Mat, 24), `+${hit.item.n}`);
    else if (f === 'ext' && hit.item?.kind === 'ext') {
      const it = hit.item;
      window.setTimeout(() => flyToNotes(c, it.id, findLabel(hit), hit.rp), delay);
      delay += 160;
    } else if (f === 'tablet' && hit.item?.kind === 'tablet') {
      const id = hit.item.id;
      window.setTimeout(() => readTablet(id, hit.rp), 350);
    } else if (f === 'topic' && hit.item?.kind === 'ext') {
      const it = hit.item;
      window.setTimeout(() => bigTopic(it.id, hit.rp), 250);
    }
  }
}

function shake(c: HTMLElement) {
  c.classList.remove('is-hit');
  void c.offsetWidth;
  c.classList.add('is-hit');
}
/** 砕ける粒（崩れたら多めに、層の色で） */
function dust(c: HTMLElement, n: number, broke: boolean) {
  const p = P!;
  const r = c.getBoundingClientRect();
  const pr = p.el.getBoundingClientRect();
  for (let i = 0; i < n; i++) {
    const d = h('i', `isl-dig-dust ${broke ? 'is-big' : ''}`);
    d.style.left = `${r.left - pr.left + r.width / 2}px`;
    d.style.top = `${r.top - pr.top + r.height / 2}px`;
    d.style.setProperty('--lc', c.style.getPropertyValue('--lc'));
    const a = (Math.PI * 2 * i) / n + Math.random() * 0.6;
    const dist = (broke ? 22 : 12) + Math.random() * (broke ? 18 : 8);
    d.style.setProperty('--dx', `${Math.round(Math.cos(a) * dist)}px`);
    d.style.setProperty('--dy', `${Math.round(Math.sin(a) * dist + (broke ? 14 : 6))}px`);
    p.el.append(d);
    window.setTimeout(() => d.remove(), 650);
  }
}
/** 素材：アイコンが少し浮いて消える */
function floatUp(c: HTMLElement, ic: HTMLElement, text: string) {
  const p = P!;
  const r = c.getBoundingClientRect();
  const pr = p.el.getBoundingClientRect();
  const f = h('div', 'isl-dig-float');
  f.append(ic, h('b', '', text));
  f.style.left = `${r.left - pr.left + r.width / 2}px`;
  f.style.top = `${r.top - pr.top}px`;
  p.el.append(f);
  window.setTimeout(() => f.remove(), 1200);
}
/** エクステ：絵が飛び出して、研究ノートのボタンへ吸い込まれる（＋RP） */
function flyToNotes(c: HTMLElement, id: number, label: string, rp: number) {
  const p = P;
  if (!p) return;
  const r = c.getBoundingClientRect();
  const nb = p.notes.getBoundingClientRect();
  const f = h('div', 'isl-dig-fly');
  f.append(extIcon(id, 64), h('b', '', label), ...(rp ? [h('small', '', t(`研究 +${rp}`, `RP +${rp}`))] : []));
  const sx = r.left + r.width / 2;
  const sy = r.top + r.height / 2;
  f.style.left = `${sx}px`;
  f.style.top = `${sy}px`;
  f.style.setProperty('--tx', `${Math.round(nb.left + nb.width / 2 - sx)}px`);
  f.style.setProperty('--ty', `${Math.round(nb.top + nb.height / 2 - sy)}px`);
  p.ctx.root.append(f);
  window.setTimeout(() => {
    f.remove();
    if (!P) return;
    P.notes.classList.remove('is-gulp');
    void P.notes.offsetWidth;
    P.notes.classList.add('is-gulp');
  }, 1300);
}
/** 石板：読み物の小さな窓（パネルの中。時間は止めない） */
function readTablet(id: string, rp: number) {
  const p = P;
  if (!p) return;
  p.el.querySelector('.isl-dig-read')?.remove();
  const tab = TABLET[id];
  if (!tab) return;
  const w = h('div', 'isl-dig-read');
  const head = h('div', 'isl-dig-read-head');
  head.append(tabletIcon(32), h('b', '', t(`石板「${tab.title}」`, `Tablet: ${tab.title}`)));
  w.append(head, h('p', '', tab.text));
  if (rp) w.append(h('small', 'isl-gold', t(`研究 +${rp} RP・研究ノートに残りました`, `RP +${rp} · saved to your notebook`)));
  w.append(btn(t('閉じる', 'Close'), () => w.remove(), 'is-on'));
  p.el.append(w);
}
/** お題：画面の中央に大きく（絵・名前・「お題を発見！」・RP・進み）。タップで閉じる（時間は止めない） */
function bigTopic(id: number, rp: number) {
  const p = P;
  if (!p) return;
  document.querySelector('.isl-dig-big')?.remove();
  const s = p.ctx.s();
  const st = digStatus(s);
  const w = h('div', 'isl-dig-big');
  const box = h('div', 'isl-dig-big-box');
  const rays = h('i', 'isl-dig-big-rays');
  box.append(rays, h('span', 'isl-dig-big-tag', t('お題を発見！', 'Target found!')), extIcon(id, 128), h('b', 'isl-dig-big-name', extName(id)), h('span', 'isl-dig-big-rp', t(`研究 Lv5・研究ポイント +${rp}`, `Research Lv5 · RP +${rp}`)));
  if (st) box.append(h('small', 'isl-dig-big-prog', st.topics[0] >= st.topics[1] ? t(`お題 ${st.topics[0]} / ${st.topics[1]}：全部そろった！ 町の長に発表しよう`, `Targets ${st.topics[0]} / ${st.topics[1]}: all found! Present to the town head`) : t(`お題 ${st.topics[0]} / ${st.topics[1]}`, `Targets ${st.topics[0]} / ${st.topics[1]}`)));
  box.append(h('small', 'isl-dig-big-tap', t('▶ タップで閉じる', '▶ Tap to close')));
  w.append(box);
  const close = () => w.remove();
  w.addEventListener('click', close);
  w.addEventListener('pointerdown', (e) => e.stopPropagation());
  p.ctx.root.append(w);
  window.setTimeout(close, 5000);
}

/** 自動発掘の担当を選ぶ（ヒーローのカード） */
function pickDigger() {
  const p = P;
  if (!p) return;
  const s = p.ctx.s();
  const cur = s.staff.find((x) => x.task === 'dig')?.hero ?? null;
  pickHero(p.ctx.root, s, {
    title: t('自動発掘の担当', 'Auto digger'),
    task: 'dig',
    current: cur,
    note: t('数字は「発掘」の適性（PHY 重視）。たまったツルハシの回数を、1 日に数回ぶんゆっくり使って掘ります（手で掘るほうが速い）。', 'Numbers are Digging aptitude (mostly PHY). They slowly spend saved swings a few times a day (digging by hand is faster).'),
    onPick: (hero) => {
      if (hero == null) {
        if (cur != null) assign(s, cur, null);
      } else {
        const e = assign(s, hero, 'dig', null);
        if (e) p.ctx.toast(t('この人は、いまは発掘の担当にできません', 'This hero can’t dig right now'));
        else p.ctx.toast(t(`${heroName(hero)}が発掘の担当になりました`, `${heroName(hero)} is now digging`));
      }
      p.ctx.save();
      p.ctx.refresh();
      refreshDig();
    },
  });
}

// ---------------------------------------------------------------- 研究ノート

let noteTab: string | null = null;

/** 研究ノート（図鑑）：セクタごとのタブ（いまのセクタが先頭）・エクステの絵と研究 Lv の ★・お題の印・石板の読み物 */
export function openNotes(ctx: Ctx, o: { fromDig?: DigHooks; sector?: string } = {}) {
  const s0 = ctx.s();
  noteTab = o.sector ?? s0.sector ?? 'c1';
  if (o.fromDig) closeDig();
  open(
    ctx,
    t('研究ノート', 'Research notebook'),
    (body) => {
      const s = ctx.s();
      const tabs = noteTabs(s);
      if (!tabs.some((x) => x.id === noteTab)) noteTab = tabs[0]?.id ?? null;
      const tot = noteTotals(s);
      const sum = h('div', 'isl-note-sum');
      sum.append(h('span', '', t(`見つけた出土品 ${tot.found} / ${tot.all} 種`, `Finds ${tot.found} / ${tot.all}`)), h('span', '', t(`石板 ${tot.tablets} / ${tot.allTablets} 枚`, `Tablets ${tot.tablets} / ${tot.allTablets}`)), h('b', 'isl-note-rp', t(`研究ポイント ${s.rp ?? 0}`, `RP ${s.rp ?? 0}`)));
      body.append(sum);
      const row = h('div', 'isl-note-tabs');
      for (const x of tabs) {
        const b = btn(`${x.here ? '📍 ' : ''}${x.name}`, () => {
          noteTab = x.id;
          ctx.sfx?.('tap');
          refreshSheet();
        }, `isl-note-tab ${x.id === noteTab ? 'is-on' : ''} ${x.visited ? '' : 'is-far'}`);
        if (!x.visited) b.title = t('まだ出店していないセクタ（出店すると、ここの地層を掘れる）', 'Not opened yet (open a shop there to dig)');
        row.append(b);
      }
      body.append(row);
      if (!noteTab) return;
      const list = noteEntries(s, noteTab);
      const tabsHere = tabs.find((x) => x.id === noteTab);
      // お題（上の層から）
      body.append(h('h4', 'isl-note-h', t('お題（各層に 1 つ。そろえて町の長に発表）', 'Targets (one per layer; find all and present)')));
      const tg = h('div', 'isl-note-grid');
      for (const e of list.filter((x) => x.topic)) tg.append(noteCard(e));
      body.append(tg);
      body.append(h('h4', 'isl-note-h', t('出土品（何度も出る。重なるほど研究 Lv が上がる）', 'Finds (repeat finds raise research level)')));
      const fg = h('div', 'isl-note-grid');
      for (const e of list.filter((x) => !x.topic)) fg.append(noteCard(e));
      body.append(fg);
      // 石板（読み物）
      body.append(h('h4', 'isl-note-h', t('石板', 'Tablets')));
      const tl = h('div', 'isl-note-tablets');
      for (const { tab, read } of noteTablets(s, noteTab)) {
        const b = h('button', `isl-note-tablet ${read ? '' : 'is-unread'}`);
        b.type = 'button';
        b.append(tabletIcon(32), h('b', '', read ? tab.title : t('？？？（まだ見つけていない）', '??? (not found yet)')));
        if (read) {
          const txt = h('p', '', tab.text);
          txt.hidden = true;
          b.append(txt);
          b.addEventListener('click', () => {
            txt.hidden = !txt.hidden;
            b.classList.toggle('is-open', !txt.hidden);
          });
        } else b.append(h('small', 'isl-dim', t('この町の地層のどこかに眠っている', 'Somewhere in this town’s strata')));
        tl.append(b);
      }
      body.append(tl);
      const foot = h('div', 'isl-row');
      if (tabsHere?.here && s.dig && o.fromDig) foot.append(btn(t('⛏ 発掘場に戻る', '⛏ Back to the dig site'), () => closeNotes(), 'is-on'));
      else if (tabsHere && !tabsHere.visited) foot.append(h('small', 'isl-dim', t('このセクタに出店すると、ここの地層を掘れます。', 'Open a shop in this sector to dig here.')));
      body.append(foot);
    },
    () => {
      noteTab = null;
      // 発掘場から開いたときは、閉じたら発掘場に戻る（ほかの画面に切り替えたときは戻らない）
      if (o.fromDig) {
        const back = o.fromDig;
        window.setTimeout(() => {
          if (!sheetOpen() && !P && ctx.s().dig) openDig(ctx, back);
        }, 0);
      }
    },
  );
}

/** 研究ノートを閉じる（発掘場から開いたときは、閉じると発掘場に戻る） */
function closeNotes() {
  const x = document.querySelector<HTMLButtonElement>('.isl-sheet-head .isl-btn');
  x?.click();
}

function noteCard(e: ReturnType<typeof noteEntries>[number]): HTMLElement {
  const c = h('div', `isl-note-card ${e.n ? '' : 'is-unknown'} ${e.topic ? 'is-topic' : ''}`);
  if (e.topic) c.append(h('span', 'isl-note-topic', t('お題', 'Target')));
  const pic = h('span', 'isl-note-pic');
  pic.append(extIcon(e.id, 64));
  c.append(pic, h('b', 'isl-note-name', e.n ? e.name : t('？？？', '???')), h('span', `isl-note-stars ${e.lv >= 5 ? 'is-max' : ''}`, stars(e.lv)), h('small', 'isl-dim', nextLvText(e)));
  if (e.n) c.title = t(`研究 Lv${e.lv}（掘った数 ${e.n}）`, `Research Lv${e.lv} (dug ${e.n})`);
  return c;
}

/** 吹き出し・助言で使う：いまのツルハシの回数（無ければ null） */
export function picksLine(s: ReturnType<Ctx['s']>): string | null {
  if (!s.dig || !digSite(s)) return null;
  return `${s.dig.picks} / ${picksCap(s)}`;
}
