/**
 * 発掘画面と研究ノート（docs/ISLAND_PHASE1.md「地層の発掘と研究ポイント」の「15 秒の発掘」「発掘場の画面」「研究ノート」）。
 *
 * - 地図の荒れ地をタップ → 吹き出しの「⛏ 発掘する（15 秒）」で、**画面全体が発掘画面** になる（発掘作業）。
 *   町の描画は止める（main.ts。ゲームの計算はふだんどおり進む）。作業の始めと終わりは 0.3 秒の暗転。
 *   **発掘作業のあいだは時間を止めない**（憲章 1-2 の例外）。シート（screens.ts の open）ではなく、全部を覆う画面。
 * - 正面の壁（横 7 × 縦 9）：マスを叩くと手前の層から 1 枚ずつはがれる（どのマスも最初から叩ける。奥ほど硬い）。
 *   埋まっているものは、ひびの隙間から少しずつ見える（覗き見）。2 × 2 の大きいもの（Epic 以上）は 4 マスとも掘ると取れる。
 * - 片手のタップで 1 打、長押しで同じマスを連続で打つ（回数の制限は無い。打てるのは作業のあいだだけ）。
 * - 時間切れか「発掘を終える」で、画面の中に「発掘終了」の札（今回の出土）。月をまたいでいたら、そのあと main.ts がまとめ報告を出す。
 * - 出土の演出は 1 つだけ大きく（憲章 3）：はがれたら小さく砕ける粒、エクステは画面の中央に大きく出て研究ノートのボタンへ吸い込まれる、
 *   お題と大きな遺物（2 × 2）は画面全体。石板は読み物の小さな窓。
 * 表示の計算は digview.ts（純粋な関数）。
 */
import { t } from '../../i18n';
import { assetUrl } from '../../render/images';
import { icon } from '../../ui/dom';
import { PRODUCT, TABLET, type Mat } from './data';
import { RARITY_JA } from '../../game/catalog';
import { assign, blast, blastCost, blastSize, dig, digRepeatMs, digSite, drill, drillLen, DRILL_FUEL, extName, extRank, extRarity, hasBlast, hasDrill, layersOf, sessionSec, type DigErr, type DigHit, type DigItem, type DigLayout, type RunEnd } from './model';
import { DEEP_LOCK, DUNGEON_TAB, RARE_RELIC_NOTE, anyPeek, autoDiggers, biggestFx, cellView, crewCount, digBlock, digErrText, digRec, digSpec, digSpecText, digStatus, dungeonNotes, findLabel, fxOf, gotLines, lockedLayer, nextLvText, noteEntries, noteTablets, noteTabs, noteTotals, relicLine, runBar, stars, type CellView } from './digview';
import { DEEP_TIP, MEET_WALL, PEEK_TIP } from './digmeet';
import { pickHero } from './heroui';
import { open, refreshSheet, sheetOpen, type Ctx } from './screens';
import { btn, extImage, h, heroIcon, heroName, matIcon, money, rich } from './ui';

/** 発掘画面からほかの画面へ（main.ts が渡す） */
export interface DigHooks {
  /** 「発掘を終える」を押した（main.ts が endRun と発掘終了の札・まとめ報告を出す） */
  end: () => void;
  /** 閉じた（町の描画と地図の UI を戻す） */
  closed: () => void;
  /** 打った（掘りきった・発掘との出会い） */
  hit?: (hits: DigHit[]) => void;
  /** 「発掘を終える」を出さない（発掘との出会いの最初の 1 回は、時間切れの「発掘終了」を見せる） */
  noEnd?: () => boolean;
  /** 復刻品を工房で作る（発掘終了の札の「工房で作る」。市場データの「工房で作る」と同じ動き） */
  make?: (key: string) => void;
  /** スキルツリーのそのパネルへ（発掘終了の札の「次の強化のおすすめ」・作業の外で「🔒 深い層の許可が要る」を押した） */
  skill?: (id: string) => void;
  /** 「深い層の許可が要る」マスを初めて押した（マインちゃんの一言を出したら true を返す。main.ts が flags に記録） */
  deepTip?: () => boolean;
  /** 初めてひびの隙間から何か見えた（マインちゃんの一言を出したら true を返す。main.ts が flags に記録） */
  peekTip?: () => boolean;
  /** 発掘との出会いの最初の作業（壁の掘り方の一言を出す） */
  meetFirst?: () => boolean;
}

/** ランク → カタログのレアリティ */
const TIER_RARITY = { C: 'Common', U: 'Uncommon', R: 'Rare', E: 'Epic', L: 'Legendary' } as const;
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

// ---------------------------------------------------------------- ひび（仮。コードで描く割れ目。docs/ISLAND_ART_TODO.md）

/** 割れ目の形（48 × 48 の中の 3 本。1 本目がいちばん大きい）。マスごとに 4 つの形から選ぶ */
const CRACKS: string[][] = [
  ['M6 3 L17 15 L14 25 L24 33 L21 45', 'M41 5 L32 17 L37 26', 'M45 31 L34 35 L30 42'],
  ['M25 2 L22 14 L31 22 L26 32 L33 46', 'M3 19 L14 24 L22 22', 'M36 29 L46 24'],
  ['M2 10 L14 14 L21 26 L34 30 L46 40', 'M30 3 L28 14 L37 18', 'M9 41 L18 34 L25 37'],
  ['M45 4 L34 14 L36 24 L26 30 L20 45', 'M4 6 L12 17 L20 18', 'M7 32 L18 30 L22 39'],
];
const crackOfCell = (x: number, y: number) => CRACKS[(x * 7 + y * 3) % CRACKS.length];
/** 見える割合 → 割れ目の幅（48 の中で。12% は髪の毛ほど・40% で細く・90% でほぼ全部） */
const maskWidth = (frac: number) => Math.round((1 + frac * frac * 36) * 10) / 10;
/** 割れ目のマスク（白い線。この線の中だけアイコンが見える） */
function maskUrl(paths: string[], w: number): string {
  const d = paths.join(' ');
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 48 48'><path d='${d}' fill='none' stroke='white' stroke-width='${w}' stroke-linecap='round' stroke-linejoin='round'/></svg>`;
  return `url("data:image/svg+xml;utf8,${encodeURIComponent(svg)}")`;
}
const SVGNS = 'http://www.w3.org/2000/svg';
/** マスの面の割れ目（暗い線）：n 本・幅 w */
function crackSvg(paths: string[], n: number, w: number): SVGSVGElement {
  const svg = document.createElementNS(SVGNS, 'svg');
  svg.setAttribute('viewBox', '0 0 48 48');
  svg.setAttribute('class', 'isl-dig-crk');
  svg.setAttribute('aria-hidden', 'true');
  for (const d of paths.slice(0, n)) {
    const path = document.createElementNS(SVGNS, 'path');
    path.setAttribute('d', d);
    path.setAttribute('stroke-width', String(w));
    svg.append(path);
  }
  return svg;
}

// ---------------------------------------------------------------- 発掘画面（全画面）

interface Panel {
  ctx: Ctx;
  hooks: DigHooks;
  el: HTMLElement;
  title: HTMLElement;
  endBtn: HTMLButtonElement;
  timer: HTMLElement;
  fill: HTMLElement;
  sec: HTMLElement;
  info: HTMLElement;
  spec: HTMLElement;
  tools: HTMLElement;
  why: HTMLElement;
  wallBox: HTMLElement;
  wall: HTMLElement;
  legend: HTMLElement;
  notes: HTMLButtonElement;
  cells: HTMLButtonElement[];
  /** マス 1 つの大きさ（px） */
  cs: number;
  sector: string;
  site: number;
  /** いま描いている壁（ダンジョンは入るたびに作り直すので、壁そのもので見分ける） */
  lay: DigLayout | null;
  /** 次に押したマスで発破を使う */
  blastArm: boolean;
  /** 次に押したマスで掘削ドリル（奥へ） */
  drillArm: boolean;
  /** この作業で「深い層の許可が要る」マスを押した（終わりの札のおすすめを深い層の許可に） */
  deepHit: boolean;
  /** 直前の「打てない理由」・お知らせ（数秒だけ出す） */
  err: { text: string; until: number; good?: boolean } | null;
  /** 残り 3 秒の音を鳴らした秒 */
  ticked: number;
  /** 発掘終了の札を出している */
  over: boolean;
  resize: () => void;
}
let P: Panel | null = null;
let saveTimer = 0;

export const digOpen = () => !!P;

/** 発掘画面を閉じる（0.3 秒で暗転して町へ。町の描画は main.ts が戻す） */
export function closeDig() {
  if (!P) return;
  const p = P;
  const hooks = p.hooks;
  flushSave();
  stopHold();
  removeEventListener('resize', p.resize);
  document.querySelector('.isl-dig-big')?.remove();
  P = null;
  p.el.classList.add('is-out');
  p.el.style.pointerEvents = 'none';
  window.setTimeout(() => p.el.remove(), 300);
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

/** 発掘画面を開く（発掘作業のあいだだけ。s.digRun の荒れ地の壁）。note：最初に出すひとこと */
export function openDig(ctx: Ctx, hooks: DigHooks, note?: string) {
  const s = ctx.s();
  if (!digSite(s) || !s.dig) {
    ctx.toast(digErrText('no-site'));
    return;
  }
  let fresh = true;
  if (P) {
    fresh = false;
    const old = P;
    P = null;
    removeEventListener('resize', old.resize);
    old.el.remove();
  }
  const el = h('section', `isl-dig ${fresh ? 'is-in' : ''}`);
  el.setAttribute('aria-label', t('発掘作業', 'Digging'));
  // 地図のドラッグ・タップに渡さない
  el.addEventListener('pointerdown', (e) => e.stopPropagation());
  el.addEventListener('wheel', (e) => e.stopPropagation(), { passive: true });
  // 1. 上の帯：荒れ地の名前・残り時間のバー・「発掘を終える」
  const top = h('div', 'isl-dig-top');
  const head = h('div', 'isl-dig-head');
  const title = h('h2', '');
  const endBtn = btn(t('発掘を終える', 'Stop digging'), () => (P?.over ? closeDig() : hooks.end()), 'isl-dig-end');
  head.append(title, endBtn);
  const timer = h('div', 'isl-dig-timer');
  const fill = h('i', 'isl-dig-timer-fill');
  const sec = h('b', 'isl-dig-timer-sec');
  timer.append(fill, h('span', 'isl-dig-timer-k', t('⏱ 残り', '⏱ Left')), sec);
  const spec = h('div', 'isl-dig-spec');
  top.append(head, timer, spec);
  // 2. 小さな帯：日付・今月の売上・RP・今回の出土・掘った割合・お題
  const info = h('div', 'isl-dig-info');
  // 3. 壁
  const wallBox = h('div', 'isl-dig-wallbox');
  const wall = h('div', 'isl-dig-wall');
  const legend = h('div', 'isl-dig-legend');
  wallBox.append(wall);
  // 4. 下の帯：ひとこと・道具・発掘隊・研究ノート
  const foot = h('div', 'isl-dig-foot');
  const why = h('p', 'isl-dig-why');
  const tools = h('div', 'isl-dig-tools');
  const notes = btn(t('📖 研究ノート', '📖 Notebook'), () => openNotes(ctx, { fromDig: hooks }), 'isl-dig-notes');
  foot.append(legend, why, tools);
  el.append(top, info, wallBox, foot);
  ctx.root.append(el);
  const resize = () => fitWall();
  P = { ctx, hooks, el, title, endBtn, timer, fill, sec, info, spec, tools, why, wallBox, wall, legend, notes, cells: [], cs: 40, sector: s.dig.sector, site: s.dig.cur, lay: null, blastArm: false, drillArm: false, deepHit: false, err: note ? { text: note, until: performance.now() + 3500, good: true } : null, ticked: 99, over: false, resize };
  addEventListener('resize', resize);
  buildWall();
  refreshDig();
  refreshTimer();
  fitWall();
  requestAnimationFrame(() => fitWall());
  // 上の帯・吹き出し・「次の月へ」の位置を合わせる
  ctx.refresh();
  // 発掘との出会いの最初の作業：壁の掘り方（作業を止めない小さな吹き出し）
  if (hooks.meetFirst?.()) mineSay(MEET_WALL(), 9000);
}

/** 発掘画面の外枠（main.ts が「次の月へ」の位置に使う） */
export const digRect = () => P?.el.getBoundingClientRect() ?? null;

/** 壁のマスの大きさを、画面の幅・高さいっぱいの正方形に合わせる */
function fitWall() {
  const p = P;
  if (!p) return;
  const L = digSite(p.ctx.s());
  if (!L) return;
  // （開くときの拡大の動きに左右されないように、変形の前の大きさで）
  const r = { width: p.wallBox.clientWidth, height: p.wallBox.clientHeight };
  // 箱の余白（6 × 2）と壁のふち（6 × 2）・マスの間（3）を除いた、いっぱいの正方形
  const gap = 3;
  const pad = 26;
  const cs = Math.max(24, Math.floor(Math.min((r.width - pad - gap * (L.w - 1)) / L.w, (r.height - pad - gap * (L.h - 1)) / L.h)));
  if (cs === p.cs && p.wall.style.getPropertyValue('--cs')) return;
  p.cs = cs;
  p.wall.style.setProperty('--cs', `${cs}px`);
  // 覗き見のアイコンの大きさが変わるので描き直す
  for (const c of p.cells) delete c.dataset.k;
  paintCells();
}

function buildWall() {
  const p = P!;
  const s = p.ctx.s();
  const L = digSite(s)!;
  p.lay = L;
  p.el.classList.toggle('is-dungeon', !!L.dungeon);
  p.wall.replaceChildren();
  p.wall.style.setProperty('--w', String(L.w));
  p.wall.style.setProperty('--h', String(L.h));
  p.wall.style.setProperty('--hole', layersOf(L)[L.depth - 1].color);
  p.cells = [];
  for (let y = 0; y < L.h; y++)
    for (let x = 0; x < L.w; x++) {
      const b = h('button', 'isl-dig-cell');
      b.type = 'button';
      b.dataset.x = String(x);
      b.dataset.y = String(y);
      bindHold(b, x, y);
      p.cells.push(b);
      p.wall.append(b);
    }
}

/** 層の並び（手前 → 奥。掘れない層は 🔒。押すと「深い層の許可が要る」） */
function paintLegend() {
  const p = P!;
  const s = p.ctx.s();
  const L = digSite(s)!;
  const lock = lockedLayer(s);
  const key = `${L.tier}|${L.dungeon ? 'd' : 'w'}|${lock}`;
  if (p.legend.dataset.k === key) return;
  p.legend.dataset.k = key;
  p.legend.replaceChildren(h('small', 'isl-dim', t('手前', 'Front')));
  layersOf(L).forEach((st, n) => {
    const locked = lock != null && n >= lock;
    const c = h(locked ? 'button' : 'span', `isl-dig-lay ${locked ? 'is-locked' : ''}`);
    c.style.setProperty('--lc', st.color);
    c.append(h('i'), document.createTextNode(`${locked ? '🔒' : ''}${st.name}`));
    if (locked && c instanceof HTMLButtonElement) {
      c.type = 'button';
      c.title = DEEP_LOCK();
      c.addEventListener('click', (e) => {
        e.stopPropagation();
        deepPressed();
      });
    }
    if (n > 0) p.legend.append(h('small', 'isl-dim', '›'));
    p.legend.append(c);
  });
  p.legend.append(h('small', 'isl-dim', t('奥', 'Back')));
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

/** 1 日ごと・打つたびに：帯・道具・壁を描き直す（画面を作り直さない） */
export function refreshDig() {
  const p = P;
  if (!p) return;
  const s = p.ctx.s();
  if (!s.dig || !digSite(s)) return closeDig();
  if (s.dig.sector !== p.sector || s.dig.cur !== p.site || digSite(s) !== p.lay) {
    p.sector = s.dig.sector;
    p.site = s.dig.cur;
    buildWall();
    fitWall();
  }
  // 上の帯の小さな 1 行：作業時間・1 打の強さ・掘れる層・研究 Lv の上限
  const sp = digSpec(s);
  p.spec.replaceChildren(...(sp ? digSpecText(sp).map((x) => h('b', '', x)) : []));
  const st = digStatus(s)!;
  p.title.textContent = t(`⛏ ${st.name}`, `⛏ ${st.name}`);
  // 「発掘を終える」：作業のあいだ（出会いの最初の 1 回は出さない）。札を出したあとは ✕（町に戻る）
  p.endBtn.textContent = p.over ? t('✕ 町に戻る', '✕ Back to town') : t('発掘を終える', 'Stop digging');
  p.endBtn.hidden = !p.over && !!p.hooks.noEnd?.();
  p.endBtn.setAttribute('aria-label', p.over ? t('町に戻る', 'Back to town') : t('発掘を終える', 'Stop digging'));
  // 小さな帯：日付（時間が流れている）・今月の売上・RP・今回の出土・掘った割合・お題（SCM の詰まりは、作業のあいだは出さない：発掘に集中）
  p.info.replaceChildren();
  const chip = (cls: string, k: string, v: string) => {
    const c = h('span', `isl-dig-chip ${cls}`);
    if (k) c.append(h('small', '', k));
    c.append(h('b', '', v));
    p.info.append(c);
    return c;
  };
  chip('is-date', '📅', st.date);
  chip('is-sales', t('売上', 'Sales'), money(st.sales));
  chip('is-rp', t('研', 'RP'), `${st.rp}`);
  chip('is-got', t('出土', 'Finds'), t(`新 ${st.found}・Lv↑ ${st.lvUp}`, `New ${st.found} · Lv↑ ${st.lvUp}`));
  if (st.dungeon) {
    // ダンジョン：この作業でいちばん深くはがした層と最深記録・掘れる層（深い層の許可）
    const dg = st.dungeon;
    chip(`is-deep ${dg.deep > 0 && dg.deep >= dg.best ? 'is-done' : ''}`, t('最深', 'Deepest'), t(`${dg.deep} 層（記録 ${dg.best}）`, `${dg.deep} (best ${dg.best})`));
    chip(dg.limit < dg.all ? 'is-lock' : '', t('掘れる', 'Can dig'), t(`${dg.limit} / ${dg.all} 層`, `${dg.limit} / ${dg.all}`));
  } else {
    chip('', t('掘った', 'Dug'), `${st.pct}%`);
    chip(st.topics[0] >= st.topics[1] ? 'is-done' : '', t('お題', 'Targets'), `${st.topics[0]} / ${st.topics[1]}`);
  }
  // 道具：発破・掘削ドリル（スキル → 発掘で開いていれば）・発掘隊・研究ノート
  p.tools.replaceChildren();
  if (hasBlast(s)) {
    const bc = blastCost(s);
    const n = blastSize(s);
    const b = btn(p.blastArm ? t('💥 発破：マスを押す（やめる）', '💥 Blast: tap a cell (cancel)') : t(`💥 発破 ${n}×${n}（${money(bc)}）`, `💥 Blast ${n}×${n} (${money(bc)})`), () => {
      p.blastArm = !p.blastArm;
      p.drillArm = false;
      p.ctx.sfx?.('tap');
      refreshDig();
    }, `isl-dig-blast ${p.blastArm ? 'is-on' : ''}`);
    b.title = t(`火薬代で、押したマスを真ん中に ${n} × ${n} の いまの層を 1 枚ずつ一度にはがす`, `Pay for powder to peel one layer off the ${n} × ${n} around the cell`);
    if (s.money < bc) {
      b.disabled = true;
      b.title = digErrText('money', bc);
    }
    p.tools.append(b);
  }
  if (hasDrill(s)) {
    const n = drillLen(s);
    const b = btn(p.drillArm ? t('🔩 ドリル：マスを押す（やめる）', '🔩 Drill: tap a cell (cancel)') : t(`🔩 ドリル 奥へ ${n}（${money(DRILL_FUEL)}）`, `🔩 Drill ${n} deep (${money(DRILL_FUEL)})`), () => {
      p.drillArm = !p.drillArm;
      p.blastArm = false;
      p.ctx.sfx?.('tap');
      refreshDig();
    }, `isl-dig-drill ${p.drillArm ? 'is-on' : ''}`);
    b.title = t(`燃料代で、押したマス 1 つを奥へ ${n} 層一気にはがす`, `Pay for fuel to peel ${n} layers off one cell`);
    if (s.money < DRILL_FUEL) {
      b.disabled = true;
      b.title = digErrText('money', DRILL_FUEL);
    }
    p.tools.append(b);
  }
  const auto = autoDiggers(s);
  const who = h('button', `isl-dig-auto ${auto.length ? '' : 'is-empty'}`);
  who.type = 'button';
  if (auto.length) {
    for (const a of auto.slice(0, 2)) who.append(heroIcon(a.hero, 28));
    const per = auto.reduce((v, a) => v + (a.resting ? 0 : a.perDay), 0);
    const [cn, cap] = crewCount(s);
    who.append(h('span', '', t(`発掘隊 ${cn}/${cap}・1 日 ${Math.round(per * 10) / 10} 打`, `Crew ${cn}/${cap} · ${Math.round(per * 10) / 10}/day`)));
    if (auto.every((a) => a.resting)) who.append(h('small', 'isl-bad', t('休憩中', 'Resting')));
  } else who.append(h('span', '', t('＋ 発掘隊', '+ Dig crew')));
  who.addEventListener('click', (e) => {
    e.stopPropagation();
    pickDigger();
  });
  p.tools.append(who, p.notes);
  // ひとこと：打てない理由（画面全体：作業が終わった など）・直前に押したマスの理由（数秒だけ）・道具の使い方・掘り方
  const block = p.over ? null : digBlock(s);
  const now = performance.now();
  const bn = blastSize(s);
  const live = p.err && p.err.until > now;
  const msg = live
    ? p.err!.text
    : block
      ? digErrText(block)
      : p.blastArm
        ? t(`発破：マスを押すと、まわり ${bn} × ${bn} の いまの層が 1 枚ずつはがれる`, `Blast: tap a cell to peel one layer off the ${bn} × ${bn} around it`)
        : p.drillArm
          ? t(`ドリル：マスを押すと、そのマスが奥へ ${drillLen(s)} 層はがれる`, `Drill: tap a cell to peel ${drillLen(s)} layers off it`)
          : t('マスをタップで 1 打（手前の層から 1 枚ずつはがれる）・長押しで続けて打つ', 'Tap a cell to strike (peels one layer at a time) · hold to keep striking');
  p.why.textContent = msg;
  p.why.className = `isl-dig-why ${live && p.err!.good ? 'is-warn' : live || block ? 'is-bad' : ''}`;
  p.el.classList.toggle('is-blast', p.blastArm);
  p.el.classList.toggle('is-drill', p.drillArm);
  paintLegend();
  paintCells();
  // 初めてひびの隙間から何か見えた：マインちゃんの小さな一言（1 回だけ・作業は止めない）
  if (!p.over && s.digRun && !p.el.querySelector('.isl-dig-mine') && anyPeek(s) && p.hooks.peekTip?.()) mineSay(PEEK_TIP(), 6000);
}

/** 発掘画面の中のマインちゃんの小さな吹き出し（作業を止めない。OK か時間で消える） */
function mineSay(text: string, ms: number) {
  const p = P;
  if (!p) return;
  p.el.querySelector('.isl-dig-mine')?.remove();
  const w = h('div', 'isl-dig-mine');
  const mi = h('img');
  mi.src = assetUrl('mch/Image/Characters/navi_ain_speak_00_talk.png');
  mi.alt = '';
  const txt = h('p');
  txt.append(rich(text));
  w.append(mi, txt, btn('OK', () => w.remove(), 'is-on'));
  p.el.append(w);
  window.setTimeout(() => w.isConnected && w.remove(), ms);
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
  p.drillArm = false;
  p.el.querySelector('.isl-dig-mine')?.remove();
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
  // ダンジョン：最深記録（初めての層に届いたら「新記録！」）
  if (end.isDungeon) {
    const rec = h('p', `isl-dig-deeprec ${end.record ? 'is-new' : ''}`);
    rec.append(h('b', '', t(`最深 ${end.deep ?? 0} 層`, `Deepest: layer ${end.deep ?? 0}`)));
    if (end.record) rec.append(h('span', 'isl-dig-newrec', t('新記録！', 'New record!')));
    box.append(rec);
  }
  if (end.found != null) box.append(h('p', 'isl-gold', t('この荒れ地は掘りきった！ 底から古い石の階段が…ダンジョンの入り口が見つかった！', 'This wasteland is fully dug! Old stone stairs at the bottom… a dungeon entrance!')));
  else if (end.revived) box.append(h('p', 'isl-gold', t(`この荒れ地は掘りきった！ 町に戻ると復興するよ（家 +${end.revived.homes}）`, `This wasteland is fully dug! It will be revived back in town (homes +${end.revived.homes})`)));
  else if (end.done) box.append(h('p', 'isl-gold', t('この荒れ地は掘りきった！', 'This wasteland is fully dug!')));
  // 新しいレシピ（復刻品）：エクステの絵 64px と「工房で作る」
  const recipes = end.got.recipes ?? [];
  if (recipes.length) box.append(recipeCards(recipes, (key) => p.hooks.make?.(key)));
  // 次の強化のおすすめ（いちばん安い発掘のパネルの次の Lv。「深い層の許可が要る」マスを押した作業のあとは、深い層の許可）
  const rec = digRec(p.ctx.s(), p.deepHit ? 'dig_deep' : undefined);
  if (rec && p.hooks.skill) {
    const rb = btn('', () => {
      const go = p.hooks.skill;
      closeDig();
      go?.(rec.id);
    }, 'isl-dig-rec');
    rb.replaceChildren(h('small', '', t('次の強化のおすすめ（スキル → 発掘）', 'Next upgrade (Skills → Digging)')), document.createTextNode(`▶ ${rec.text}`));
    box.append(rb);
  }
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
    const sec = sessionSec(p.ctx.s());
    if (o.again && !end.done) acts.append(btn(end.isDungeon ? t(`⛏ もう一度潜る（${sec} 秒）`, `⛏ Dive again (${sec} s)`) : t(`⛏ もう一度（${sec} 秒）`, `⛏ Again (${sec} s)`), () => o.again?.(), 'is-on'));
    acts.append(btn(t('町に戻る', 'Back to town'), () => closeDig()));
    o.after?.();
    // 新しいレシピがあるときは、自分で閉じるまで残す（「工房で作る」を押せるように）
    if (!recipes.length)
      window.setTimeout(() => {
        if (P === p && p.over && p.el.isConnected) closeDig();
      }, 6000);
  }, 1200);
}

/** マス 1 つを描く（面の色・奥まった影・ひび・覗き見・あと何回・🔒） */
function paintCell(b: HTMLButtonElement, v: CellView, idle: boolean, cs: number) {
  const pk = v.peek;
  const key = `${v.state}|${v.layer}|${v.crack}|${v.taps}|${pk ? `${pk.item.kind}${'id' in pk.item ? pk.item.id : ''}${'mat' in pk.item ? pk.item.mat : ''}:${pk.frac}:${pk.part}:${pk.hint ? 1 : 0}` : ''}|${idle}|${cs}`;
  if (b.dataset.k === key) return;
  b.dataset.k = key;
  b.className = `isl-dig-cell is-${v.state} ${idle ? 'is-idle' : ''} ${pk?.hint ? 'is-hint' : ''} ${pk && !pk.hint ? 'is-peek' : ''}`;
  b.style.setProperty('--lc', v.color);
  b.style.setProperty('--d', String(Math.min(4, v.layer)));
  b.replaceChildren();
  b.disabled = v.state === 'dug';
  b.setAttribute(
    'aria-label',
    v.state === 'dug'
      ? t('いちばん奥まで掘ったマス', 'Dug to the back')
      : v.state === 'locked'
        ? t('深い層の許可が要る', 'Needs a deep-layer permit')
        : v.state === 'wait'
          ? t('大きな遺物：まわりのマスも掘ろう', 'Large relic: dig the cells around it')
          : t(`あと ${v.taps} 回で 1 枚はがれる`, `${v.taps} more strikes to peel`),
  );
  if (v.state === 'dug') return;
  const [x, y] = [v.x, v.y];
  const paths = crackOfCell(x, y);
  const seen = pk && !pk.hint ? pk : null;
  // 割れ目：いまの層の残りの硬さで 1〜3 本。無傷でも中身があれば細いひび 1 本（よく見ると分かる程度）。見える割合が大きいほど幅が広い
  const lines = Math.max(v.crack, seen ? 1 : 0, seen && seen.frac >= 0.4 ? 2 : 0, seen && seen.frac >= 0.7 ? 3 : 0);
  const mw = seen ? maskWidth(seen.frac) : 0;
  const faint = !!seen && seen.frac < 0.3;
  if (lines) b.append(crackSvg(paths, lines, seen && !faint ? mw + 3 : faint ? 1.4 : 1.6 + v.crack * 0.9));
  if (seen) {
    const wrap = h('span', `isl-dig-peek ${seen.item.kind === 'ext' && seen.item.topic ? 'is-topic' : ''} is-${seen.item.kind} ${faint ? 'is-faint' : ''}`);
    const m = maskUrl(paths.slice(0, lines), mw);
    wrap.style.setProperty('mask-image', m);
    wrap.style.setProperty('-webkit-mask-image', m);
    const big = seen.size[0] > 1 || seen.size[1] > 1;
    const sz = seen.item.kind === 'ext' ? Math.round(cs * (big ? 2 : 1) * 0.92 + (big ? 3 : 0)) : Math.round(cs * 0.72);
    const ic = itemIcon(seen.item, sz);
    ic.classList.add('isl-dig-peekic');
    if (big) {
      ic.style.left = `${Math.round(-seen.part[0] * (cs + 3) + cs * 0.04)}px`;
      ic.style.top = `${Math.round(-seen.part[1] * (cs + 3) + cs * 0.04)}px`;
      wrap.classList.add('is-big');
    }
    wrap.append(ic);
    b.append(wrap);
  }
  if (v.state === 'locked') b.append(h('span', 'isl-dig-lock', '🔒'));
  if (v.state === 'face' && v.crack > 0) {
    const pips = h('span', 'isl-dig-pips');
    for (let i = 0; i < Math.min(5, v.taps); i++) pips.append(h('i'));
    b.append(pips);
  }
}

function paintCells() {
  const p = P!;
  const s = p.ctx.s();
  const L = digSite(s)!;
  const none = !!digBlock(s);
  for (let k = 0; k < p.cells.length; k++) paintCell(p.cells[k], cellView(s, k % L.w, Math.floor(k / L.w)), none, p.cs);
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
    // 長押し：少し待ってから、同じマスを続けて打つ（その層がはがれたら止まる）
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
    // 長押しで打っていなければ、指を離したときに 1 打
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

/** 打つ：'more'（まだはがれていない）／'broke'／'err' */
function strike(x: number, y: number): 'more' | 'broke' | 'err' {
  const p = P;
  if (!p || p.over) return 'err';
  const s = p.ctx.s();
  // 作業が終わった（時間切れの直後）：何もしない
  if (!s.digRun) return 'err';
  const useBlast = p.blastArm;
  const useDrill = !useBlast && p.drillArm;
  const r = useBlast ? blast(s, x, y) : useDrill ? drill(s, x, y) : dig(s, x, y);
  if (typeof r === 'string') {
    if (r === 'deep') return deepPressed(x, y), 'err';
    fail(x, y, r, useDrill ? DRILL_FUEL : blastCost(s));
    return 'err';
  }
  // 広く掘る：隣のマスに当たった結果も（extra）
  const hits = Array.isArray(r) ? r : [r, ...(r.extra ?? [])];
  if (useBlast) p.blastArm = false;
  if (useDrill) p.drillArm = false;
  p.err = null;
  soonSave();
  showHits(hits, useBlast, useDrill);
  p.hooks.hit?.(hits);
  // 資金・RP の帯と吹き出しを描き直す
  p.ctx.refresh();
  refreshDig();
  const main = hits[0];
  if (main?.wait) p.err = { text: digErrText('wait'), until: performance.now() + 2200 };
  return hits.some((h2) => h2.broke) ? 'broke' : main?.wait ? 'err' : 'more';
}

/**
 * 「深い層の許可が要る」マス・層の札を押した：画面のひとことと、初めてならマインちゃんの一言。
 * 作業の外（札のあと）なら、スキルツリーの「深い層の許可」へ。作業のあいだは、終わりの札のおすすめを深い層の許可にする
 */
function deepPressed(x?: number, y?: number) {
  const p = P;
  if (!p) return;
  const s = p.ctx.s();
  if (!s.digRun && p.hooks.skill) {
    const go = p.hooks.skill;
    closeDig();
    go('dig_deep');
    return;
  }
  p.deepHit = true;
  p.ctx.sfx?.('error');
  if (x != null && y != null) {
    const c = cellAt(x, y);
    if (c) {
      c.classList.remove('is-shake');
      void c.offsetWidth;
      c.classList.add('is-shake');
    }
  }
  p.err = { text: `${DEEP_LOCK()}　${digErrText('deep')}`, until: performance.now() + 2600 };
  if (p.hooks.deepTip?.()) mineSay(DEEP_TIP(), 7000);
  refreshDig();
  window.setTimeout(() => P && refreshDig(), 2700);
}

function fail(x: number, y: number, e: DigErr, cost?: number) {
  const p = P!;
  p.ctx.sfx?.('error');
  p.err = { text: digErrText(e, cost), until: performance.now() + 2600 };
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

function showHits(hits: DigHit[], wasBlast: boolean, wasDrill = false) {
  const p = P!;
  const big = biggestFx(hits);
  // 会心（2 倍）：マスの上に「会心！」
  for (const hit of hits.filter((x) => x.crit)) {
    const c = cellAt(hit.x, hit.y);
    if (!c) continue;
    const r = c.getBoundingClientRect();
    const pr = p.el.getBoundingClientRect();
    const f = h('b', 'isl-dig-crit', t('会心！', 'Critical!'));
    f.style.left = `${r.left - pr.left + r.width / 2}px`;
    f.style.top = `${r.top - pr.top}px`;
    p.el.append(f);
    window.setTimeout(() => f.remove(), 800);
  }
  // ドリル：同じマスが奥へ何度も沈む（発破と同じくらいの大きさの演出）
  if (wasDrill) {
    p.el.classList.add('is-drillboom');
    window.setTimeout(() => P?.el.classList.remove('is-drillboom'), 450);
    const c = cellAt(hits[0]?.x ?? 0, hits[0]?.y ?? 0);
    if (c) {
      c.style.setProperty('--n', String(hits.length));
      c.classList.remove('is-drillhit');
      void c.offsetWidth;
      c.classList.add('is-drillhit');
    }
  }
  // 音：はがれるたびに「ゴツッ」（奥の層ほど低く硬い音）。エクステ・石板は宝箱の音、お題・大きな遺物は採掘完了の音（大きい演出のときだけ）
  const deep = Math.max(0, ...hits.map((x) => x.layer));
  p.ctx.sfx?.('dig', 1 + deep * 0.18, 1 - deep * 0.13);
  if (big === 'topic' || big === 'epic') window.setTimeout(() => p.ctx.sfx?.('mining'), 120);
  else if (big === 'rare') {
    window.setTimeout(() => p.ctx.sfx?.('treasure'), 90);
    window.setTimeout(() => p.ctx.sfx?.('levelup'), 420);
  } else if (big === 'ext' || big === 'tablet') window.setTimeout(() => p.ctx.sfx?.('treasure'), 90);
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
    if (wasBlast) {
      c.classList.remove('is-peel');
      void c.offsetWidth;
      c.classList.add('is-peel');
    }
    // 置き場所がいっぱいなら、入ったぶんだけ（「置き場所がいっぱい」）
    if (f === 'mat' && hit.item?.kind === 'mat') floatUp(c, matIcon(hit.item.mat as Mat, 24), hit.matFull ? (hit.mat ? t(`+${hit.mat}（置き場所がいっぱい）`, `+${hit.mat} (storage full)`) : t('置き場所がいっぱい', 'Storage full')) : `+${hit.mat ?? hit.item.n}`);
    else if (f === 'ext' && hit.item?.kind === 'ext') {
      const it = hit.item;
      window.setTimeout(() => flyToNotes(c, it.id, findLabel(hit), hit.rp), delay);
      delay += 220;
    } else if (f === 'rare' && hit.item?.kind === 'ext') {
      // Rare：中くらいの演出（作業は止めない）→ 研究ノートへ
      const it = hit.item;
      window.setTimeout(() => rareFind(c, it.id, hit), delay);
      delay += 400;
    }
    // 復刻品のレシピが開いた：作業を止めない小さな札（まとめは発掘終了の札）
    if (hit.recipe) {
      const key = hit.recipe;
      window.setTimeout(() => recipePing(key), delay + 600);
    }
    if (f === 'tablet' && hit.item?.kind === 'tablet') {
      const id = hit.item.id;
      window.setTimeout(() => readTablet(id, hit.rp), 350);
    } else if ((f === 'topic' || f === 'epic') && hit.item?.kind === 'ext') {
      const it = hit.item;
      window.setTimeout(() => bigFind(it.id, hit.rp, f === 'topic', hit), 250);
    }
  }
}

function shake(c: HTMLElement) {
  c.classList.remove('is-hit');
  void c.offsetWidth;
  c.classList.add('is-hit');
}
/** 砕ける粒（はがれたら多めに、層の色で） */
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
/** エクステ：マスから画面の中央に大きく出て（札と RP）、研究ノートのボタンへ吸い込まれる */
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
  f.style.setProperty('--cx', `${Math.round(innerWidth / 2 - sx)}px`);
  f.style.setProperty('--cy', `${Math.round(innerHeight * 0.42 - sy)}px`);
  f.style.setProperty('--tx', `${Math.round(nb.left + nb.width / 2 - sx)}px`);
  f.style.setProperty('--ty', `${Math.round(nb.top + nb.height / 2 - sy)}px`);
  p.ctx.root.append(f);
  window.setTimeout(() => {
    f.remove();
    if (!P) return;
    P.notes.classList.remove('is-gulp');
    void P.notes.offsetWidth;
    P.notes.classList.add('is-gulp');
  }, 1500);
}
/** 新しいレシピ（作業中）：画面の上に小さく「📜 新しいレシピ！『復刻 ○○』」。作業は止めない */
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
/** 石板：読み物の小さな窓（画面の中。時間は止めない） */
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
/** ダンジョンの奥の Rare：壁の上に中くらいの札（光・絵 96px・「Rare の遺物！」・RP）。作業は止めない。2.4 秒で研究ノートへ */
function rareFind(c: HTMLElement, id: number, hit: DigHit) {
  const p = P;
  if (!p) return;
  p.el.querySelector('.isl-dig-rare')?.remove();
  const w = h('div', 'isl-dig-rare');
  w.append(h('i', 'isl-dig-rare-rays'), h('span', 'isl-dig-rare-tag', t(`${RARITY_JA.Rare}の遺物！`, 'A Rare relic!')), extIcon(id, 96), h('b', '', extName(id)), h('small', '', `${findLabel(hit)}${hit.rp ? t(`・研究 +${hit.rp}`, ` · RP +${hit.rp}`) : ''}`));
  p.el.append(w);
  window.setTimeout(() => {
    w.remove();
    if (P) flyToNotes(c, id, '', 0);
  }, 2400);
}
/** お題・大きな遺物（2 × 2）：画面全体に大きく（絵・名前・札・RP・進み）。タップで閉じる（時間は止めない） */
function bigFind(id: number, rp: number, topic: boolean, hit: DigHit) {
  const p = P;
  if (!p) return;
  document.querySelector('.isl-dig-big')?.remove();
  const s = p.ctx.s();
  const st = digStatus(s);
  const rk = topic ? null : extRank(id);
  const w = h('div', `isl-dig-big ${topic ? '' : 'is-epic'} ${rk === 'L' ? 'is-legend' : ''}`);
  const box = h('div', 'isl-dig-big-box');
  const rays = h('i', 'isl-dig-big-rays');
  const rname = RARITY_JA[extRarity(id) as keyof typeof RARITY_JA] ?? '';
  const tag = topic ? t('お題を発見！', 'Target found!') : t(`${rname}の大きな遺物を発見！`, `A large ${rname} relic!`);
  const sub = topic ? t(`研究 Lv5・研究ポイント +${rp}`, `Research Lv5 · RP +${rp}`) : `${findLabel(hit)}${rp ? t(`・研究ポイント +${rp}`, ` · RP +${rp}`) : ''}`;
  box.append(rays, h('span', 'isl-dig-big-tag', tag), extIcon(id, 128), h('b', 'isl-dig-big-name', extName(id)), h('span', 'isl-dig-big-rp', sub));
  if (topic && st) box.append(h('small', 'isl-dig-big-prog', st.topics[0] >= st.topics[1] ? t(`お題 ${st.topics[0]} / ${st.topics[1]}：全部そろった！ 町の長に発表しよう`, `Targets ${st.topics[0]} / ${st.topics[1]}: all found! Present to the town head`) : t(`お題 ${st.topics[0]} / ${st.topics[1]}`, `Targets ${st.topics[0]} / ${st.topics[1]}`)));
  if (!topic) box.append(h('small', 'isl-dig-big-prog', t(`4 マスぶんの大きな遺物（${rname}）。本来このセクタでは手に入らない！`, `A 4-cell ${rname} relic — not normally found here!`)));
  box.append(h('small', 'isl-dig-big-tap', t('▶ タップで閉じる', '▶ Tap to close')));
  w.append(box);
  const close = () => w.remove();
  w.addEventListener('click', close);
  w.addEventListener('pointerdown', (e) => e.stopPropagation());
  p.ctx.root.append(w);
  window.setTimeout(close, 5000);
}

const CREW_NOTE = () => t('数字は「発掘」の適性（PHY 重視）。発掘作業のあいだ、同じ荒れ地を 1 日に数回ぶん手伝って掘ります（手で掘るほうが速い。常駐（スキル → 発掘）があれば、作業していない日も掘ります）。', 'Numbers are Digging aptitude (mostly PHY). They help on the same wasteland a few times a day while you dig (by hand is faster; with the standing crew skill they dig on other days too).');
/** 自動発掘の担当を選ぶ（ヒーローのカード） */
function pickDigger() {
  const p = P;
  if (!p) return;
  const s = p.ctx.s();
  // 発掘隊の人数の上限（スキル → 発掘隊の役所）。上限まで付いていれば、選ぶと最初の人と入れ替える
  const [cn, cap] = crewCount(s);
  const full = cn >= cap;
  const cur = full ? (s.staff.find((x) => x.task === 'dig')?.hero ?? null) : null;
  const capNote = full ? t(`発掘隊は ${cap} 人まで（いま ${cn} 人。スキル → 発掘の「発掘隊の役所」で増える）。選ぶと${cur != null ? heroName(cur) : ''}と入れ替えます。`, `Crew limit ${cap} (now ${cn}; raise it with Dig crew office). Picking swaps out ${cur != null ? heroName(cur) : ''}.`) : t(`発掘隊 ${cn} / ${cap} 人。`, `Crew ${cn} / ${cap}.`);
  pickHero(p.ctx.root, s, {
    title: t('発掘隊の担当', 'Dig crew'),
    task: 'dig',
    current: cur,
    note: capNote + CREW_NOTE(),
    onPick: (hero) => {
      if (hero == null) {
        if (cur != null) assign(s, cur, null);
      } else {
        if (full && cur != null && hero !== cur && s.staff.find((x) => x.hero === hero)?.task !== 'dig') assign(s, cur, null);
        const e = assign(s, hero, 'dig', null);
        const say = (text: string, good = false) => P && (P.err = { text, until: performance.now() + 2600, good });
        if (e === 'crew-full') say(t(`発掘隊は ${cap} 人まで（スキル → 発掘の「発掘隊の役所」で増える）`, `Crew limit is ${cap} (raise it with Dig crew office)`));
        else if (e) say(t('この人は、いまは発掘の担当にできません', 'This hero can’t dig right now'));
        else say(t(`${heroName(hero)}が発掘隊になりました`, `${heroName(hero)} joined the dig crew`), true);
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
      // ダンジョン：入り口が見つかったセクタごとに、奥で出る上のランクの遺物（未発見はシルエット）
      if (noteTab === DUNGEON_TAB) {
        body.append(h('p', 'isl-dim isl-note-dnote', RARE_RELIC_NOTE()));
        for (const d of dungeonNotes(s)) {
          body.append(h('h4', 'isl-note-h', d.best != null ? t(`${d.name}のダンジョン（最深 ${d.best} 層）`, `${d.name} dungeon (deepest ${d.best})`) : t(`${d.name}のダンジョン`, `${d.name} dungeon`)));
          for (const r of d.ranks) {
            const g = h('div', 'isl-note-grid');
            for (const e of r.items) g.append(noteCard(e, r.tier));
            const rn = RARITY_JA[TIER_RARITY[r.tier]];
            body.append(h('small', `isl-note-rank is-${r.tier}`, t(`${rn}（奥の層ほど出やすい）`, `${rn} (more likely deeper)`)), g);
          }
        }
        return;
      }
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

function noteCard(e: ReturnType<typeof noteEntries>[number], tier?: string): HTMLElement {
  const c = h('div', `isl-note-card ${e.n ? '' : 'is-unknown'} ${e.topic ? 'is-topic' : ''} ${tier ? `is-r${tier}` : ''}`);
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
