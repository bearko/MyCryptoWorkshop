/**
 * フェーズ 1「新天地で実績を上げろ」の画面。地図・上の帯・建てる帯・マインちゃんの案内・時間。
 * 仕様は docs/ISLAND_PHASE1.md。
 */
import '../island.css';
import './p1.css';
import { isEn, setLang, t } from '../../i18n';
import { assetUrl } from '../../render/images';
import { DEF } from '../defs';
import { effectDone, image, loading, pick, waterFrame, type Camera, type Effect } from '../render';
import { type Dir } from '../sim';
import { MATS, P1_BUILDINGS, P1B, PRODUCT, skuParts } from './data';
import {
  allowedDirs,
  build,
  canBuild,
  canPlaceAt,
  date,
  daysToClose,
  deserializeP1,
  monthRevenue,
  myShops,
  myWorkshop,
  newP1,
  occupant,
  recommend,
  serializeP1,
  step,
  turn,
  type P1State,
  type PlaceErr,
} from './model';
import { drawP1, type P1Ghost } from './render';
import { closeSheet, openBuy, openData, openRanking, openReport, openRival, openShop, openSkills, openStaff, openWorkshop, refreshSheet, sheetOpen, type Ctx } from './screens';
import { btn, h, money } from './ui';

const q = new URLSearchParams(location.search);
const TEST = q.get('test') === '2';
const SAVE = 'mycryptoisland.p1.v1';

function load(): P1State {
  try {
    const raw = localStorage.getItem(SAVE);
    const s = raw ? deserializeP1(raw) : null;
    if (s) return s;
  } catch {
    // 保存先が使えないときは新しく始める
  }
  return newP1();
}
let s = load();
function save() {
  try {
    localStorage.setItem(SAVE, serializeP1(s));
  } catch {
    // 保存できなくても遊べる
  }
}

const canvas = document.getElementById('isl-map') as HTMLCanvasElement;
const ctx2 = canvas.getContext('2d')!;
const root = document.getElementById('isl-ui')!;
let W = 0;
let H = 0;
let DPR = 1;
let dirty = true;
const cam: Camera = { x: 0, y: (s.n - 1) * 55, zoom: innerWidth < 600 ? 0.3 : 0.5 };
let speed = 1;
let placing: { id: string; dir: Dir; i: number; j: number } | null = null;
let selected: number | null = null;
const fx: Effect[] = [];

function resize() {
  DPR = Math.min(2, devicePixelRatio || 1);
  W = Math.round(visualViewport?.width ?? innerWidth);
  H = Math.round(visualViewport?.height ?? innerHeight);
  canvas.style.width = `${W}px`;
  canvas.style.height = `${H}px`;
  canvas.width = Math.round(W * DPR);
  canvas.height = Math.round(H * DPR);
  dirty = true;
  if (root.childElementCount) layout();
}
addEventListener('resize', resize);
visualViewport?.addEventListener('resize', resize);

// ---------------------------------------------------------------- お知らせ

const toasts = h('div', 'isl-toasts');
function toast(text: string) {
  const prev = toasts.lastElementChild as HTMLElement | null;
  if (prev && prev.dataset.text === text) {
    const n = Number(prev.dataset.n ?? 1) + 1;
    prev.dataset.n = String(n);
    prev.textContent = `${text} ×${n}`;
    return;
  }
  const e = h('div', 'isl-toast', text);
  e.dataset.text = text;
  toasts.append(e);
  setTimeout(() => e.remove(), 3300);
  while (toasts.children.length > 3) toasts.firstChild?.remove();
}

const ctx: Ctx = {
  s: () => s,
  root,
  save,
  refresh: () => renderAll(),
  toast,
};

// ---------------------------------------------------------------- 上の帯

const hud = h('div', 'isl-hud');
const statMoney = h('div', 'isl-stat');
const statSales = h('div', 'isl-stat');
const statRank = h('div', 'isl-stat');
const statDate = h('div', 'isl-stat');
const SPEEDS = [0, 1, 4];
const speedBtns = SPEEDS.map((v) =>
  btn(v === 0 ? '⏸' : v === 1 ? '▶' : '⏩', () => {
    speed = v;
    renderHud();
  }),
);
const speedBox = h('div', 'isl-speed');
speedBox.append(...speedBtns);
const menu = h('div', 'isl-menu');
const mBuy = btn(t('調達', 'Buy'), () => openBuy(ctx));
const mStaff = btn(t('従業員', 'Staff'), () => openStaff(ctx));
const mData = btn(t('データ', 'Data'), () => openData(ctx));
const mRank = btn(t('ランキング', 'Ranking'), () => openRanking(ctx));
const mSkill = btn(t('スキル', 'Skills'), () => openSkills(ctx));
menu.append(mBuy, mStaff, mData, mRank, mSkill, btn('☰', openMenu));
if (TEST) menu.append(btn(t('テスト', 'Test'), openTest, 'is-danger'));
hud.append(statMoney, statSales, statRank, statDate, h('div', 'isl-spacer'), speedBox, menu);

function renderHud() {
  statMoney.className = `isl-stat ${s.money < 0 ? 'is-bad' : ''}`;
  const lm = t('資金', 'Funds');
  statMoney.innerHTML = `<small>${lm}</small><b>${money(s.money)}</b>`;
  const ls = t('今月の売上', 'Sales this month');
  statSales.innerHTML = `<small>${ls}</small><b>${money(monthRevenue(s))}</b>`;
  const last = s.reports[s.reports.length - 1];
  statRank.hidden = !last;
  const lr = t('エリア', 'Area');
  if (last) statRank.innerHTML = `<small>${lr}</small><b>${t(`${last.rank} 位`, `#${last.rank}`)}</b>`;
  const d = date(s);
  statDate.textContent = d ? (isEn ? `Y${d.year} M${d.month} D${d.day}` : `${d.year} 年目 ${d.month} 月 ${d.day} 日`) : t(`開業準備 ${s.day + 1} 日目`, `Prep day ${s.day + 1}`); // i18n-ja
  speedBtns.forEach((b, k) => b.classList.toggle('is-on', SPEEDS[k] === speed));
  const ws = !!myWorkshop(s);
  mBuy.disabled = !ws;
  mStaff.disabled = !ws;
  mRank.hidden = !s.flags.ranking;
  mSkill.disabled = !ws;
}

// ---------------------------------------------------------------- 建てる帯

const buildBar = h('div', 'isl-build');
const cards = h('div', 'isl-cards');
buildBar.append(cards);
const ERR: Record<PlaceErr, string> = {
  ground: t('空き地にだけ建てられます', 'Build on empty lots only'),
  taken: t('ほかの建物があります', 'Something is already there'),
  road: t('道路に面した場所にだけ建てられます（入口は道路側）', 'Must face a road (entrance toward the road)'),
  money: t('資金が足りません', 'Not enough funds'),
  locked: t('まだ建てられません', 'Not available yet'),
  soon: t('準備中です（スキルツリーで解放予定）', 'Coming soon (unlocked by skills)'),
  limit: t('工房は 1 つまでです', 'Only one workshop for now'),
};

function lockNote(id: string): string {
  const b = P1B[id];
  if (b.soon) return t('準備中', 'Coming soon');
  if (b.kind === 'workshop') return s.buildings.some((x) => x.owner === 'me' && x.id === 'workshop') ? t('建設済み', 'Built') : t('無料', 'Free');
  if (b.kind === 'shop' && !s.buildings.some((x) => x.owner === 'me' && x.id === 'workshop')) return t('工房のあと', 'After the workshop');
  if (b.requires && !s.skills.includes(b.requires)) return t('スキルで解放', 'Unlock by skill');
  return money(b.cost);
}

function renderBuild() {
  cards.replaceChildren(
    ...P1_BUILDINGS.map((b) => {
      const err = canBuild(s, b.id);
      const locked = !!err && err !== 'money';
      const c = h('button', `isl-card ${locked ? 'is-locked' : ''} ${placing?.id === b.id ? 'is-on' : ''}`);
      c.type = 'button';
      const im = image(`b/${b.id}/rd.png`).cloneNode() as HTMLImageElement;
      im.alt = '';
      const cost = b.kind === 'workshop' && !err ? t('無料', 'Free') : lockNote(b.id);
      c.append(im, h('b', '', DEF[b.id].name), h('span', '', cost));
      c.addEventListener('click', () => {
        const e = canBuild(s, b.id);
        if (e) {
          toast(ERR[e]);
          return;
        }
        selected = null;
        placing = placing?.id === b.id ? null : { id: b.id, dir: 'rd', i: Math.floor(s.n / 2), j: Math.floor(s.n / 2) };
        if (placing) fitDir();
        renderAll();
      });
      return c;
    }),
  );
}

/** 置こうとしているマスで、入口を道路に向けられる向きにそろえる */
function fitDir() {
  if (!placing) return;
  const ok = allowedDirs(s, placing.id, placing.i, placing.j);
  if (ok.length && !ok.includes(placing.dir)) placing.dir = ok[0];
}

const placeBox = h('div', 'isl-place');
function tryPlace() {
  if (!placing) return;
  const r = build(s, placing.id, placing.i, placing.j, placing.dir);
  if (typeof r === 'string') toast(ERR[r]);
  else {
    toast(t(`${DEF[placing.id].name}の工事を始めました（${P1B[placing.id].days} 日）`, `Started building: ${DEF[placing.id].name} (${P1B[placing.id].days} days)`));
    placing = null;
    save();
  }
  renderAll();
}
function renderPlace() {
  dirty = true;
  placeBox.hidden = !placing;
  canvas.classList.toggle('is-placing', !!placing);
  if (!placing) return;
  const err = canPlaceAt(s, placing.id, placing.i, placing.j, placing.dir);
  const name = DEF[placing.id].name;
  const msg = err ? ERR[err] : t('— 地図で場所を選んで「建てる」', '— pick a spot, then Build');
  const r = h('div', 'isl-row');
  const go = btn(t('建てる', 'Build'), tryPlace, 'is-on');
  go.disabled = !!err;
  const rot = btn(t('向きを変える', 'Rotate'), () => {
    if (!placing) return;
    const ok = allowedDirs(s, placing.id, placing.i, placing.j);
    if (ok.length) placing.dir = ok[(ok.indexOf(placing.dir) + 1) % ok.length];
    renderPlace();
  });
  rot.disabled = allowedDirs(s, placing.id, placing.i, placing.j).length < 2;
  r.append(
    go,
    rot,
    btn(t('やめる', 'Cancel'), () => {
      placing = null;
      renderAll();
    }),
  );
  placeBox.replaceChildren(h('p', '', `${name}  ${msg}`), h('p', 'isl-dim', t('道路に面していない場所には置けません。入口は道路の方にしか向けられません。', 'Buildings must face a road, and the entrance can only point toward it.')), r);
}

// ---------------------------------------------------------------- マインちゃんの案内

const advisor = h('div', 'isl-advisor');
const mine = h('img');
mine.src = assetUrl('mch/Image/Characters/navi_ain_speak_00_talk.png');
mine.alt = '';
const bubbleBox = h('div', 'isl-bubble');
advisor.append(mine, bubbleBox);
let hiddenTip = '';

function tutorial(): { text: string; action?: [string, () => void] } {
  const ws = s.buildings.find((b) => b.owner === 'me' && b.id === 'workshop');
  const shops = s.buildings.filter((b) => b.owner === 'me' && P1B[b.id]?.kind === 'shop');
  const rec = PRODUCT[recommend(s)].name;
  if (!ws) return { text: t('新天地へようこそ！まずは Workshop から引き継いだ「工房」を建てましょう。下の帯から工房を選び、道路に面した空き地へ。入口は道路の方にしか向けられません。', 'Welcome to the new land! First, build the Workshop you brought from home. Pick it below and place it on a lot facing a road — the entrance can only face the road.') };
  if (ws.left > 0) return { text: t('工房の工事中です。⏩ で時間を早められます。', 'The workshop is under construction. ⏩ speeds things up.') };
  if (!s.flags.data) return { text: t('何を売るか決める前に、このエリアの市場データを見てみましょう。今売れている商品、まだ誰も扱っていない商品、国民のニーズが分かります。', 'Before choosing what to sell, check the market data: what sells now, what nobody sells yet, and what people want.'), action: [t('データを見る', 'Open data'), () => openData(ctx)] };
  if (!shops.length) return { text: t(`データによると「${rec}」がよさそう！次はお店（よろず屋）を建てましょう。道路に面した場所に。`, `The data says ${rec} looks promising! Next, build a shop (General store) facing a road.`) };
  if (shops.every((b) => b.left > 0)) return { text: t('お店の工事中です。開店した日から 1 か月目の営業が始まります。その間に工房で商品を作り始めましょう。', 'The shop is being built. Your first business month starts the day it opens. Start crafting meanwhile.'), action: [t('工房を開く', 'Open workshop'), () => openWorkshop(ctx)] };
  const crafting = s.slots.some((sl) => sl.running);
  const stockAny = Object.values(s.stock).some((n) => (n ?? 0) > 0) || s.trips.length > 0 || myShops(s).some((b) => Object.values(s.shops[b.uid].storage).some((n) => (n ?? 0) > 0) || Object.values(s.shops[b.uid].shelf).some((n) => (n ?? 0) > 0));
  if (!crafting && !stockAny) return { text: t(`工房を押して「${rec}」を作りましょう。職人はバランスの良い MCHアーティストが向いています。`, `Tap the workshop and make ${rec}. The well-balanced MCH Artist is the best crafter.`), action: [t('工房を開く', 'Open workshop'), () => openWorkshop(ctx)] };
  if (!s.staff.some((x) => x.task === 'transport')) return { text: t('できた商品をお店へ運ぶ人を決めましょう。運搬は PHY の高い MCHウォーリアーが得意です。', 'Choose who hauls goods to the shop. MCH Warrior, with high PHY, is the best hauler.'), action: [t('従業員を開く', 'Open staff'), () => openStaff(ctx)] };
  const shop = myShops(s)[0];
  const sh = shop ? s.shops[shop.uid] : null;
  if (sh && (!sh.shelves[0] || (sh.staff == null && sh.part === 0))) return { text: t(`お店を押して、主力商品を「${rec}」に、店員を決めましょう。販売は INT の高い MCHタクティシャンが得意です。`, `Tap the shop, set ${rec} as the main product and choose a clerk. MCH Tactician, with high INT, sells best.`), action: [t('お店を開く', 'Open shop'), () => shop && openShop(ctx, shop.uid)] };
  if (!s.reports.length) return { text: t('準備ができました！お店を開いた日から 1 か月ごとに売上を締めます。素材が切れないように「調達」しながら、最初の売上報告を待ちましょう。', 'All set! Sales are closed every month from the day your shop opened. Keep materials stocked under Buy and wait for the first sales report.') };
  // 1 か月たってから
  const low = (Object.keys(MATS) as (keyof typeof MATS)[]).find((m) => s.slots.some((sl) => sl.sku && PRODUCT[skuParts(sl.sku)[0]].recipe[skuParts(sl.sku)[1]][m] && (s.mats[m] ?? 0) < 10));
  if (low) return { text: t(`${MATS[low].name}が残り少なくなっています。「調達」で買い足しましょう。`, `${MATS[low].name} is running low. Buy more under Buy.`), action: [t('調達を開く', 'Open buy'), () => openBuy(ctx)] };
  if (s.staff.some((x) => x.resting)) return { text: t('休んでいる従業員がいます。人手が足りないときは、スキル「人材の募集」でヒーローを雇えます。', 'Someone is resting. If you are short-handed, hire heroes via the Recruiting skill.') };
  const last = s.reports[s.reports.length - 1];
  if (s.cleared) return { text: t('エリア 1 位、おめでとうございます！フェーズ 2 は準備中です。このまま会社を育てられます。', 'Congratulations on #1 in the area! Phase 2 is coming. You can keep growing the company.') };
  if (last.rank > 1) return { text: t(`いまエリア ${last.rank} 位。1 位の${last.area[0].name}を抜くには、棚や作業台を増やしたり、アンコモンで単価を上げたりしましょう（スキル）。`, `You are #${last.rank} in the area. To pass ${last.area[0].name}, add shelves and benches or raise prices with Uncommons (skills).`), action: [t('スキルを開く', 'Open skills'), () => openSkills(ctx)] };
  return { text: t('いい調子です！', 'Nice work!') };
}

function renderAdvisor() {
  advisor.style.display = placing || sheetOpen() ? 'none' : '';
  const tip = tutorial();
  if (tip.text === hiddenTip) return;
  advisor.hidden = false;
  const p = h('p', '', tip.text);
  p.addEventListener('click', () => {
    hiddenTip = tip.text;
    advisor.hidden = true;
  });
  bubbleBox.replaceChildren(p);
  if (tip.action) bubbleBox.append(btn(tip.action[0], tip.action[1], 'is-on'));
}

// ---------------------------------------------------------------- メニュー・お祝い

function modal(title: string, body: string, actions: [string, () => void, string?][], face = false) {
  const m = h('div', 'isl-modal');
  const box = h('div');
  const row = h('div', 'isl-row');
  for (const [label, on, cls] of actions)
    row.append(
      btn(
        label,
        () => {
          m.remove();
          on();
        },
        cls,
      ),
    );
  const head = h('div', 'isl-row');
  if (face) {
    const im = h('img', 'isl-modal-mine');
    im.src = assetUrl('mch/Image/Characters/navi_ain_cross_01_smile.png');
    im.alt = '';
    head.append(im);
  }
  head.append(h('h2', '', title));
  box.append(head, h('p', '', body), row);
  m.append(box);
  root.append(m);
}

function openMenu() {
  const before = speed;
  speed = 0;
  renderHud();
  modal(t('メニュー', 'Menu'), t('フェーズ 1「新天地で実績を上げろ」。進み具合はこのブラウザに保存されます。', 'Phase 1: “Make your name in the new land”. Progress is saved in this browser.'), [
    [t('続ける', 'Resume'), () => ((speed = before || 1), renderHud()), 'is-on'],
    [
      t('最初から', 'Start over'),
      () =>
        modal(t('最初からやり直しますか？', 'Start over?'), t('いまの会社は消えます。', 'Your current company will be lost.'), [
          [t('やり直す', 'Start over'), () => restart(), 'is-danger'],
          [t('やめる', 'Cancel'), () => ((speed = before || 1), renderHud())],
        ]),
    ],
    [isEn ? '日本語' : 'English', () => setLang(isEn ? 'ja' : 'en')], // i18n-ja
    [t('工房へ戻る', 'Back to the Workshop'), () => location.assign(`${import.meta.env.BASE_URL}index.html`)],
  ]);
}

function restart() {
  s = newP1();
  selected = null;
  placing = null;
  closeSheet();
  save();
  speed = 1;
  renderAll();
}

function openTest() {
  modal(t('テスト用', 'Test tools'), t('?test=2 のときだけ出ます。', 'Shown only with ?test=2.'), [
    [t('資金 +50,000', 'Funds +50,000'), () => ((s.money += 50000), renderAll())],
    [
      t('工事をすべて終える', 'Finish all construction'),
      () => {
        for (const b of s.buildings) if (b.owner === 'me' && b.left > 0) b.left = 1;
        advance(1);
      },
    ],
    [t('1 か月進める', 'Advance a month'), () => advance(daysToClose(s))],
    [t('最初から', 'Start over'), () => restart()],
    [t('自由建築モードへ', 'Free-build mode'), () => location.assign(`${import.meta.env.BASE_URL}island.html?test=2&mode=free`)],
  ]);
}

// ---------------------------------------------------------------- 配置

function layout() {
  const top = hud.getBoundingClientRect().bottom + 8;
  const bottom = innerHeight - buildBar.getBoundingClientRect().top + 8;
  placeBox.style.bottom = `${bottom}px`;
  advisor.style.bottom = `${bottom}px`;
  toasts.style.top = `${top}px`;
}
function renderAll() {
  dirty = true;
  renderHud();
  renderBuild();
  renderPlace();
  renderAdvisor();
  layout();
}
root.append(hud, toasts, advisor, placeBox, buildBar);
resize();
renderAll();

// ---------------------------------------------------------------- 地図の操作

const pts = new Map<number, { x: number; y: number }>();
let drag: { x: number; y: number; cx: number; cy: number; moved: boolean } | null = null;
let pinch: { d: number; zoom: number } | null = null;
const ZOOMS = [0.25, 0.5, 1, 2];
const clampZoom = (z: number) => Math.max(0.2, Math.min(2, z));
const local = (e: PointerEvent) => {
  const r = canvas.getBoundingClientRect();
  return pick(cam, W, H, e.clientX - r.left, e.clientY - r.top);
};

canvas.addEventListener('pointerdown', (e) => {
  canvas.setPointerCapture(e.pointerId);
  pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (pts.size === 2) {
    const [a, b] = [...pts.values()];
    pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), zoom: cam.zoom };
    drag = null;
  } else drag = { x: e.clientX, y: e.clientY, cx: cam.x, cy: cam.y, moved: false };
});
canvas.addEventListener('pointermove', (e) => {
  if (pts.has(e.pointerId)) pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (pinch && pts.size === 2) {
    const [a, b] = [...pts.values()];
    cam.zoom = clampZoom((pinch.zoom * Math.hypot(a.x - b.x, a.y - b.y)) / pinch.d);
    dirty = true;
    return;
  }
  if (drag) {
    const dx = e.clientX - drag.x;
    const dy = e.clientY - drag.y;
    if (Math.hypot(dx, dy) > 6) drag.moved = true;
    if (drag.moved) {
      cam.x = drag.cx - dx / cam.zoom;
      cam.y = drag.cy - dy / cam.zoom;
      dirty = true;
    }
    return;
  }
  if (placing && e.pointerType === 'mouse') {
    const [i, j] = local(e);
    if (i !== placing.i || j !== placing.j) {
      placing.i = i;
      placing.j = j;
      fitDir();
      renderPlace();
    }
  }
});
canvas.addEventListener('pointerup', (e) => {
  pts.delete(e.pointerId);
  if (pinch) {
    if (pts.size < 2) pinch = null;
    return;
  }
  const d = drag;
  drag = null;
  if (!d || d.moved) return;
  const [i, j] = local(e);
  if (placing) {
    if (e.pointerType === 'mouse' || (placing.i === i && placing.j === j)) {
      placing.i = i;
      placing.j = j;
      fitDir();
      tryPlace();
    } else {
      placing.i = i;
      placing.j = j;
      fitDir();
      renderPlace();
    }
    return;
  }
  const b = occupant(s, i, j);
  selected = b ? b.uid : null;
  dirty = true;
  if (b) {
    if (b.owner === 'me') {
      if (b.left > 0) toast(t(`工事中（あと ${b.left} 日）`, `Under construction (${b.left} days left)`));
      else if (b.id === 'workshop') openWorkshop(ctx);
      else if (P1B[b.id]?.kind === 'shop') openShop(ctx, b.uid);
    } else if (b.owner === 'town') toast(DEF[b.id].name);
    else openRival(ctx, b.owner, b.id);
  }
  renderAll();
});
canvas.addEventListener('pointercancel', (e) => {
  pts.delete(e.pointerId);
  drag = null;
  pinch = null;
});
canvas.addEventListener(
  'wheel',
  (e) => {
    e.preventDefault();
    const k = ZOOMS.findIndex((z) => z >= cam.zoom - 1e-6);
    cam.zoom = e.deltaY < 0 ? ZOOMS[Math.min(ZOOMS.length - 1, k + 1)] : ZOOMS[Math.max(0, k - (ZOOMS[k] === cam.zoom ? 1 : 0))];
    dirty = true;
  },
  { passive: false },
);
addEventListener('keydown', (e) => {
  if ((e.target as HTMLElement)?.tagName === 'SELECT') return;
  if (e.key === 'Escape') {
    placing = null;
    selected = null;
    closeSheet();
    renderAll();
  } else if (e.key === 'r' || e.key === 'R') {
    if (placing) {
      const ok = allowedDirs(s, placing.id, placing.i, placing.j);
      if (ok.length) placing.dir = ok[(ok.indexOf(placing.dir) + 1) % ok.length];
    } else if (selected != null) turn(s, selected);
    renderAll();
  } else if (e.key === ' ') {
    e.preventDefault();
    speed = speed ? 0 : 1;
    renderHud();
  }
});
addEventListener('visibilitychange', () => {
  if (document.hidden) save();
});

// ---------------------------------------------------------------- 時間

const DAY_MS = 600;
let acc = 0;
let last = performance.now();
let lastWater = -1;

/** 日を進める（報告が出たら止めて見せる） */
function advance(days: number) {
  for (let k = 0; k < days; k++) {
    const r = step(s);
    for (const b of r.finished) {
      fx.push({ uid: b.uid, start: performance.now() });
      toast(t(`${DEF[b.id].name}が完成しました！`, `${DEF[b.id].name} is complete!`));
    }
    for (const x of r.crafted) toast(t(`${PRODUCT[skuParts(x)[0]].name}ができました`, `${PRODUCT[skuParts(x)[0]].name} crafted`));
    for (const m of r.routes) toast(t(`${MATS[m].name}のルートを開拓しました！`, `Opened a ${MATS[m].name} route!`));
    if (r.report) {
      save();
      showReport(r.report);
      break;
    }
  }
  refreshSheet();
  renderAll();
}

function showReport(r: NonNullable<ReturnType<typeof step>['report']>) {
  speed = 0;
  openReport(ctx, r, () => {
    if (!s.flags.ranking) {
      s.flags.ranking = true;
      save();
      modal(
        t('企業ランキングを紹介します', 'Meet the company ranking'),
        t('はじめての売上報告、おつかれさまでした！会社の月の売上は「企業ランキング」で、エリア別・ランド別・世界全体と比べられます。まずは、同じエリアに出店している同業他社を月の売上で抜いて、エリア 1 位を目指しましょう！', 'Well done on your first sales report! The company ranking compares monthly sales by area, by land and worldwide. First, beat the rival retailers in your area and become #1 here!'),
        [[t('ランキングを見る', 'Open ranking'), () => openRanking(ctx), 'is-on']],
        true,
      );
    } else if (s.cleared && !s.flags.clearSeen) {
      s.flags.clearSeen = true;
      save();
      modal(t('フェーズ 1 クリア！', 'Phase 1 cleared!'), t('エリアで売上 1 位になりました！新天地での実績は十分です。フェーズ 2 は準備中です。このまま会社を育てられます。', 'You are #1 in area sales! You have made your name in the new land. Phase 2 is coming; you can keep growing the company.'), [[t('続ける', 'Keep going'), () => ((speed = 1), renderHud()), 'is-on']], true);
    } else {
      speed = 1;
      renderHud();
    }
  });
}

function frame(now: number) {
  const dt = Math.min(250, now - last);
  last = now;
  if (!sheetOpen() || speed > 0) acc += dt * speed;
  let changed = false;
  while (acc >= DAY_MS && speed > 0) {
    acc -= DAY_MS;
    changed = true;
    advance(1);
  }
  for (let k = fx.length - 1; k >= 0; k--) if (effectDone(fx[k], now)) fx.splice(k, 1);
  const wf = waterFrame(now);
  if (changed || fx.length || wf !== lastWater || loading()) dirty = true;
  lastWater = wf;
  if (dirty) {
    dirty = false;
    const ghost: P1Ghost | null = placing ? { id: placing.id, i: placing.i, j: placing.j, dir: placing.dir, ok: !canPlaceAt(s, placing.id, placing.i, placing.j, placing.dir) } : null;
    drawP1(ctx2, s, cam, W, H, DPR, now, fx, ghost, selected);
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

(window as unknown as { islandDebug: unknown }).islandDebug = {
  state: () => s,
  setState: (next: P1State) => {
    s = next;
    renderAll();
  },
  advance,
  cam,
  /** マスの画面上の位置（撮影スクリプト用） */
  screenOf: (i: number, j: number) => ({ x: ((i - j) * 100 - cam.x) * cam.zoom + W / 2, y: ((i + j) * 55 - cam.y) * cam.zoom + H / 2 }),
  allowed: (id: string) => {
    for (let j = 0; j < s.n; j++) for (let i = 0; i < s.n; i++) if (allowedDirs(s, id, i, j).length && !canPlaceAt(s, id, i, j, allowedDirs(s, id, i, j)[0])) return [i, j];
    return null;
  },
  dirs: (id: string, i: number, j: number) => allowedDirs(s, id, i, j),
};
