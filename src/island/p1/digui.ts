/**
 * 発掘場のパネルと研究ノート（docs/ISLAND_PHASE1.md「地層の発掘と研究ポイント」の「15 秒の発掘」「研究ノート」）。
 *
 * - 地図の荒れ地をタップ → 吹き出しの「⛏ 発掘する（15 秒）」で、その荒れ地の断面のパネルを開く（発掘作業）。
 *   **発掘作業のあいだは時間を止めない**（憲章 1-2 の例外）。シート（screens.ts の open）ではなく、地図の上に重ねるパネル。
 *   スマホは地図の下半分、PC は右の帯の横に縦長。パネルの上に残り時間のバー（現実の秒。残り 5 秒で赤く点滅）。
 * - 片手のタップで 1 打、長押しで同じマスを連続で打つ（回数の制限は無い。打てるのは作業のあいだだけ）。
 * - 時間切れか「発掘を終える」で、パネルの中に「発掘終了」の札（今回の出土）。月をまたいでいたら、そのあと main.ts がまとめ報告を出す。
 * - 出土の演出は 1 つだけ大きく（憲章 3）：崩れたら小さく砕ける粒、エクステは絵が飛び出して研究ノートのボタンへ吸い込まれる、
 *   お題のときだけ画面の中央に大きく。石板は読み物の小さな窓。
 * 表示の計算は digview.ts（純粋な関数）。
 */
import { t } from '../../i18n';
import { icon } from '../../ui/dom';
import { BLAST, DIG, PRODUCT, TABLET, type Mat } from './data';
import { assign, blast, dig, digRepeatMs, digSite, extName, hasBlast, type DigErr, type DigHit, type DigItem, type RunEnd } from './model';
import { autoDiggers, biggestFx, cellView, digBlock, digErrText, digStatus, findLabel, focusRow, fxOf, gotLines, nextLvText, noteEntries, noteTablets, noteTabs, noteTotals, relicLine, runBar, stars } from './digview';
import { pickHero } from './heroui';
import { open, refreshSheet, sheetOpen, type Ctx } from './screens';
import { btn, extImage, h, heroIcon, heroName, matIcon, money } from './ui';

/** 発掘場からほかの画面へ（main.ts が渡す） */
export interface DigHooks {
  /** 「発掘を終える」を押した（main.ts が endRun と発掘終了の札・まとめ報告を出す） */
  end: () => void;
  /** 閉じた（地図の UI を描き直す） */
  closed: () => void;
  /** 打った（掘りきった・発掘との出会い） */
  hit?: (hits: DigHit[]) => void;
  /** 「発掘を終える」を出さない（発掘との出会いの最初の 1 回は、時間切れの「発掘終了」を見せる） */
  noEnd?: () => boolean;
  /** 復刻品を工房で作る（発掘終了の札の「工房で作る」。市場データの「工房で作る」と同じ動き） */
  make?: (key: string) => void;
}

/** エクステの絵（MCH の 64×64。整数倍か半分で） */
export function extIcon(id: number, size = 64): HTMLElement {
  const e = icon(extImage(id), 'px isl-ext');
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
  title: HTMLElement;
  endBtn: HTMLButtonElement;
  timer: HTMLElement;
  fill: HTMLElement;
  sec: HTMLElement;
  bar: HTMLElement;
  tools: HTMLElement;
  why: HTMLElement;
  scroll: HTMLElement;
  grid: HTMLElement;
  notes: HTMLButtonElement;
  cells: HTMLButtonElement[];
  sector: string;
  site: number;
  /** 次に押したマスで発破を使う */
  blastArm: boolean;
  /** 直前の「打てない理由」（数秒だけ出す） */
  err: { text: string; until: number } | null;
  /** 残り 3 秒の音を鳴らした秒 */
  ticked: number;
  /** 発掘終了の札を出している */
  over: boolean;
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

/** 発掘作業のパネルを開く（発掘作業のあいだだけ。s.digRun の荒れ地の断面） */
export function openDig(ctx: Ctx, hooks: DigHooks) {
  const s = ctx.s();
  if (!digSite(s) || !s.dig) {
    ctx.toast(digErrText('no-site'));
    return;
  }
  if (P) closeDig();
  const el = h('section', 'isl-dig');
  el.setAttribute('aria-label', t('発掘作業', 'Digging'));
  // 地図のドラッグ・タップに渡さない
  el.addEventListener('pointerdown', (e) => e.stopPropagation());
  el.addEventListener('wheel', (e) => e.stopPropagation(), { passive: true });
  const head = h('div', 'isl-dig-head');
  const title = h('h2', '');
  const notes = btn(t('📖 研究ノート', '📖 Notebook'), () => openNotes(ctx, { fromDig: hooks }), 'isl-dig-notes');
  const endBtn = btn(t('発掘を終える', 'Stop digging'), () => (P?.over ? closeDig() : hooks.end()), 'isl-dig-end');
  head.append(title, notes, endBtn);
  // 残り時間のバー（現実の秒）
  const timer = h('div', 'isl-dig-timer');
  const fill = h('i', 'isl-dig-timer-fill');
  const sec = h('b', 'isl-dig-timer-sec');
  timer.append(fill, h('span', 'isl-dig-timer-k', t('⏱ 残り', '⏱ Left')), sec);
  const bar = h('div', 'isl-dig-bar');
  const tools = h('div', 'isl-dig-tools');
  const why = h('p', 'isl-dig-why');
  const scroll = h('div', 'isl-dig-scroll');
  const grid = h('div', 'isl-dig-grid');
  scroll.append(grid);
  el.append(head, timer, bar, tools, why, scroll);
  ctx.root.append(el);
  P = { ctx, hooks, el, title, endBtn, timer, fill, sec, bar, tools, why, scroll, grid, notes, cells: [], sector: s.dig.sector, site: s.dig.cur, blastArm: false, err: null, ticked: 99, over: false };
  buildGrid();
  refreshDig();
  refreshTimer();
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

/** 毎フレーム（main.ts）：残り時間のバー。残り 5 秒で赤く点滅、残り 3 秒から 1 秒ごとに音 */
export function refreshTimer() {
  const p = P;
  if (!p) return;
  const s = p.ctx.s();
  const rb = runBar(s);
  p.timer.hidden = !rb && !p.over;
  if (!rb) {
    p.fill.style.width = '0%';
    p.sec.textContent = t('0.0 秒', '0.0 s');
    p.timer.classList.remove('is-warn');
    return;
  }
  p.fill.style.width = `${(rb.frac * 100).toFixed(1)}%`;
  const txt = t(`${rb.sec} 秒`, `${rb.sec} s`);
  if (p.sec.textContent !== txt) p.sec.textContent = txt;
  p.timer.classList.toggle('is-warn', rb.warn);
  const whole = Math.ceil(Number(rb.sec));
  if (rb.tick && whole < p.ticked && whole > 0) {
    p.ticked = whole;
    p.ctx.sfx?.('tap');
  }
}

/** 1 日ごと・打つたびに：上の 1 行・道具・マス目を描き直す（パネルを作り直さない） */
export function refreshDig() {
  const p = P;
  if (!p) return;
  const s = p.ctx.s();
  if (!s.dig || !digSite(s)) return closeDig();
  if (s.dig.sector !== p.sector || s.dig.cur !== p.site) {
    p.sector = s.dig.sector;
    p.site = s.dig.cur;
    buildGrid();
  }
  const st = digStatus(s)!;
  p.title.textContent = t(`⛏ ${st.name}`, `⛏ ${st.name}`);
  // 「発掘を終える」：作業のあいだ（出会いの最初の 1 回は出さない）。札を出したあとは ✕（町に戻る）
  p.endBtn.textContent = p.over ? '✕' : t('発掘を終える', 'Stop digging');
  p.endBtn.hidden = !p.over && !!p.hooks.noEnd?.();
  p.endBtn.setAttribute('aria-label', p.over ? t('町に戻る', 'Back to town') : t('発掘を終える', 'Stop digging'));
  // 上の 1 行：掘った割合・RP・いまの層・お題の進み（SCM の詰まりは、作業のあいだは出さない：発掘に集中）
  p.bar.replaceChildren();
  const chip = (cls: string, k: string, v: string) => {
    const c = h('span', `isl-dig-chip ${cls}`);
    c.append(h('small', '', k), h('b', '', v));
    p.bar.append(c);
    return c;
  };
  chip('', t('掘った', 'Dug'), `${st.pct}%`);
  chip('is-rp', t('研', 'RP'), `${st.rp}`);
  chip('', t('層', 'Layer'), st.layer);
  chip(st.topics[0] >= st.topics[1] ? 'is-done' : '', t('お題', 'Targets'), `${st.topics[0]} / ${st.topics[1]}`);
  // 道具：発破（買ってあれば）・発掘隊
  p.tools.replaceChildren();
  if (hasBlast(s)) {
    const b = btn(p.blastArm ? t('💥 発破：掘るマスを押す（やめる）', '💥 Blast: tap a cell (cancel)') : t(`💥 発破（1 回 ${money(BLAST.cost)}）`, `💥 Blast (${money(BLAST.cost)} each)`), () => {
      p.blastArm = !p.blastArm;
      p.ctx.sfx?.('tap');
      refreshDig();
    }, `isl-dig-blast ${p.blastArm ? 'is-on' : ''}`);
    b.title = t('火薬代で、押したマスを真ん中に 3 × 3 を一度に崩す', 'Pay for powder to clear 3 × 3 around the cell');
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
    who.append(h('span', '', t(`発掘隊 1 日 ${Math.round(per * 10) / 10} 回`, `Dig crew ${Math.round(per * 10) / 10}/day`)));
    if (auto.every((a) => a.resting)) who.append(h('small', 'isl-bad', t('休憩中', 'Resting')));
  } else who.append(h('span', '', t('＋ 発掘隊の担当', '+ Dig crew')));
  who.addEventListener('click', (e) => {
    e.stopPropagation();
    pickDigger();
  });
  p.tools.append(who);
  // 打てない理由（パネル全体：作業が終わった など）。直前に押したマスの理由は数秒だけ
  const block = p.over ? null : digBlock(s);
  const now = performance.now();
  const msg = p.err && p.err.until > now ? p.err.text : block ? digErrText(block) : p.blastArm ? t('発破：手が届くマスを押すと、まわり 3 × 3 も一度に崩れる', 'Blast: tap a reachable cell to clear the 3 × 3 around it') : t('光っているマスをタップで 1 打、長押しで続けて打つ（何回でも打てる）', 'Tap a lit cell to strike, hold to keep striking (no limit)');
  p.why.textContent = msg;
  p.why.className = `isl-dig-why ${(p.err && p.err.until > now) || block ? 'is-bad' : ''}`;
  p.el.classList.toggle('is-blast', p.blastArm);
  paintCells();
}

/**
 * 発掘終了の札（今回の出土）を 1.2 秒。月をまたいでいたら then（まとめ報告）へ。
 * またいでいなければ「⛏ もう一度（15 秒）」「町に戻る」（6 秒たったら町に戻る）
 */
export function showEndCard(end: RunEnd, o: { then?: () => void; again?: () => void; after?: () => void }) {
  const p = P;
  if (!p) {
    o.then?.();
    o.after?.();
    return;
  }
  p.over = true;
  stopHold();
  p.blastArm = false;
  p.el.querySelector('.isl-dig-endcard')?.remove();
  const card = h('div', 'isl-dig-endcard');
  const box = h('div', 'isl-dig-endbox');
  box.append(h('b', 'isl-dig-endtitle', t('⛏ 発掘終了', '⛏ Dig over')), h('small', 'isl-dim', t('今回の出土', 'This dig')));
  const g = h('div', 'isl-dig-endgrid');
  for (const [k, v] of gotLines(end.got)) {
    const c = h('span', 'isl-dig-endstat');
    c.append(h('small', '', k), h('b', '', v));
    g.append(c);
  }
  box.append(g);
  if (end.done) box.append(h('p', 'isl-gold', t('この荒れ地は掘りきった！（復興は近日）', 'This wasteland is fully dug! (Revival coming soon)')));
  // 新しいレシピ（復刻品）：エクステの絵 64px と「工房で作る」
  const recipes = end.got.recipes ?? [];
  if (recipes.length) box.append(recipeCards(recipes, (key) => p.hooks.make?.(key)));
  const acts = h('div', 'isl-row isl-dig-endacts');
  box.append(acts);
  card.append(box);
  p.el.append(card);
  p.ctx.sfx?.('check');
  refreshDig();
  refreshTimer();
  window.setTimeout(() => {
    if (P !== p || !p.el.isConnected) return;
    if (end.crossed && o.then) {
      closeDig();
      o.then();
      return;
    }
    if (o.again && !end.done) acts.append(btn(t('⛏ もう一度（15 秒）', '⛏ Again (15 s)'), () => o.again?.(), 'is-on'));
    acts.append(btn(t('町に戻る', 'Back to town'), () => closeDig()));
    o.after?.();
    // 新しいレシピがあるときは、自分で閉じるまで残す（「工房で作る」を押せるように）
    if (!recipes.length)
      window.setTimeout(() => {
        if (P === p && p.over && p.el.isConnected) closeDig();
      }, 6000);
  }, 1200);
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
      if (r !== 'more' || !P) return stopHold();
      hold.timer = window.setTimeout(loop, digRepeatMs(P.ctx.s()));
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
  if (!p || p.over) return 'err';
  const s = p.ctx.s();
  // 作業が終わった（時間切れの直後）：何もしない
  if (!s.digRun) return 'err';
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
    }
    // 復刻品のレシピが開いた：作業を止めない小さな札（まとめは発掘終了の札）
    if (hit.recipe) {
      const key = hit.recipe;
      window.setTimeout(() => recipePing(key), delay + 600);
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
/** 新しいレシピ（作業中）：パネルの上に小さく「📜 新しいレシピ！『復刻 ○○』」。作業は止めない */
function recipePing(key: string) {
  const p = P;
  if (!p) return;
  const prod = PRODUCT[key];
  if (!prod?.relic) return;
  p.ctx.sfx?.('check');
  const f = h('div', 'isl-dig-recipe');
  f.append(extIcon(prod.relic.ext, 32), h('b', '', t(`📜 新しいレシピ！「${prod.name}」`, `📜 New recipe! ${prod.name}`)));
  p.el.append(f);
  window.setTimeout(() => f.remove(), 2600);
}
/** 新しいレシピの札（発掘終了の札の中）：エクステの絵 64px・「『復刻 ○○』を工房で作れるようになった」・「工房で作る」 */
export function recipeCards(keys: string[], make: (key: string) => void): HTMLElement {
  const box = h('div', 'isl-dig-recipes');
  box.append(h('b', 'isl-gold', t(`📜 新しいレシピ！（${keys.length}）`, `📜 New recipes! (${keys.length})`)));
  for (const key of keys) {
    const prod = PRODUCT[key];
    if (!prod?.relic) continue;
    const row = h('div', 'isl-dig-recipe-row');
    const txt = h('div', 'isl-col');
    txt.append(h('b', '', prod.name), h('small', '', t(`「${prod.name}」を工房で作れるようになった`, `You can now make ${prod.name} in the workshop`)));
    row.append(extIcon(prod.relic.ext, 64), txt, btn(t('工房で作る', 'Make it'), () => make(key), 'is-on'));
    box.append(row);
  }
  return box;
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
    title: t('発掘隊の担当', 'Dig crew'),
    task: 'dig',
    current: cur,
    note: t('数字は「発掘」の適性（PHY 重視）。発掘作業のあいだだけ、同じ荒れ地を 1 日に数回ぶん手伝って掘ります（手で掘るほうが速い。作業していないときは働かず、疲れない）。', 'Numbers are Digging aptitude (mostly PHY). They help on the same wasteland a few times a day, only while you dig (by hand is faster; idle otherwise, no fatigue).'),
    onPick: (hero) => {
      if (hero == null) {
        if (cur != null) assign(s, cur, null);
      } else {
        const e = assign(s, hero, 'dig', null);
        if (e) p.ctx.toast(t('この人は、いまは発掘の担当にできません', 'This hero can’t dig right now'));
        else p.ctx.toast(t(`${heroName(hero)}が発掘隊になりました`, `${heroName(hero)} joined the dig crew`));
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
        if (!x.visited) b.title = t('まだ出店していないセクタ（出店すると、ここの荒れ地を掘れる）', 'Not opened yet (open a shop there to dig)');
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
        } else b.append(h('small', 'isl-dim', t('この町の荒れ地のどこかに眠っている', 'Somewhere under this town’s wastelands')));
        tl.append(b);
      }
      body.append(tl);
      const foot = h('div', 'isl-row');
      if (tabsHere?.here && s.dig && o.fromDig && s.digRun) foot.append(btn(t('⛏ 発掘に戻る', '⛏ Back to digging'), () => closeNotes(), 'is-on'));
      else if (tabsHere && !tabsHere.visited) foot.append(h('small', 'isl-dim', t('このセクタに出店すると、ここの荒れ地を掘れます。', 'Open a shop in this sector to dig here.')));
      body.append(foot);
    },
    () => {
      noteTab = null;
      // 発掘場から開いたときは、閉じたら発掘場に戻る（ほかの画面に切り替えたときは戻らない）
      if (o.fromDig) {
        const back = o.fromDig;
        window.setTimeout(() => {
          if (!sheetOpen() && !P && ctx.s().dig && ctx.s().digRun) openDig(ctx, back);
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
  // 復刻品：研究 Lv3 でレシピ（見つけたものだけ）
  const rl = e.n ? relicLine(e) : null;
  if (rl) c.append(h('small', `isl-note-relic ${rl[1] ? 'is-on' : ''}`, rl[0]));
  if (e.n) c.title = t(`研究 Lv${e.lv}（掘った数 ${e.n}）`, `Research Lv${e.lv} (dug ${e.n})`);
  return c;
}
