/**
 * フェーズ 1「新天地で実績を上げろ」の画面。地図・上の帯・事業別メニュー（下の帯）・マスの吹き出し・マインちゃんの案内・時間。
 * 仕様は docs/ISLAND_PHASE1.md。
 */
import '../island.css';
import './p1.css';
import { isEn, setLang, t } from '../../i18n';
import { assetUrl } from '../../render/images';
import { DEF } from '../defs';
import { effectDone, image, loading, pick, waterFrame, type Camera, type Effect } from '../render';
import { type Dir } from '../sim';
import { MATS, MISSIONS, P1_BUILDINGS, P1B, PRODUCT, skuParts } from './data';
import {
  allowedDirs,
  build,
  canBuild,
  canMoveTo,
  canPlaceAt,
  date,
  daysToClose,
  deserializeP1,
  monthRevenue,
  moveCost,
  myShops,
  myWorkshop,
  newP1,
  occupant,
  recommend,
  relocate,
  serializeP1,
  step,
  turn,
  type P1State,
  type PlaceErr,
} from './model';
import { drawP1, type P1Ghost } from './render';
import {
  closeSheet,
  openAds,
  openBom,
  openBuy,
  openData,
  openDev,
  openHire,
  openInvest,
  openMA,
  openMissions,
  openPayroll,
  openRanking,
  openReport,
  openShop,
  openSkills,
  openStaff,
  openSupply,
  openWorkshop,
  refreshSheet,
  rivalName,
  sheetOpen,
  type Ctx,
} from './screens';
import { tileContent } from './tile';
import { btn, h, money } from './ui';

const q = new URLSearchParams(location.search);
const TEST = q.get('test') === '2';
const SAVE = 'mycryptoisland.p1.v1';
const GUIDE = 'mycryptoisland.p1.guide';

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
let guideOn = true;
try {
  guideOn = localStorage.getItem(GUIDE) !== 'off';
} catch {
  // 既定は表示
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
/** 建てる（move があれば移転） */
let placing: { id: string; dir: Dir; i: number; j: number; move?: number } | null = null;
let selected: number | null = null;
/** 吹き出しを出しているマス */
let pop: [number, number] | null = null;
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
const statRank = h('button', 'isl-stat isl-stat-btn');
statRank.type = 'button';
statRank.addEventListener('click', () => openRanking(ctx));
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
hud.append(statMoney, statSales, statRank, statDate, h('div', 'isl-spacer'), speedBox);

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
}

// ---------------------------------------------------------------- 下の帯：事業別メニュー

type Menu = 'plan' | 'hr' | 'scm' | 'skill' | 'mkt' | 'sys';
interface Sub {
  key: string;
  name: string;
  note: string;
  go: () => void;
  needs?: 'workshop';
}
const SUBS: Record<Exclude<Menu, 'skill'>, Sub[]> = {
  plan: [
    { key: 'build', name: t('建築', 'Build'), note: t('工房・お店を建てる', 'Workshop and shops'), go: () => toggleSub('build') },
    { key: 'dev', name: t('商品開発', 'Products'), note: t('アンコモンを開発', 'Develop Uncommons'), go: () => openDev(ctx), needs: 'workshop' },
    { key: 'ma', name: 'M&A', note: t('買収・提携（準備中）', 'Deals (coming soon)'), go: () => openMA(ctx) },
  ],
  hr: [
    { key: 'staff', name: t('従業員', 'Staff'), note: t('仕事を割り当てる', 'Assign jobs'), go: () => openStaff(ctx) },
    { key: 'hire', name: t('人材登用', 'Recruiting'), note: t('ヒーローを雇う', 'Hire heroes'), go: () => openHire(ctx) },
    { key: 'pay', name: t('給与・労務', 'Pay & welfare'), note: t('給料・賞与・休み', 'Wages, bonuses, rest'), go: () => openPayroll(ctx) },
  ],
  scm: [
    { key: 'flow', name: t('サプライチェーン', 'Supply chain'), note: t('流れと詰まり', 'Flow and bottlenecks'), go: () => openSupply(ctx) },
    { key: 'bom', name: 'BOM', note: t('素材 → 商品', 'Materials → products'), go: () => openBom(ctx) },
    { key: 'buy', name: t('調達', 'Buy'), note: t('素材を買う・開拓', 'Buy and scout'), go: () => openBuy(ctx) },
  ],
  mkt: [
    { key: 'ads', name: t('宣伝広報', 'Advertising'), note: t('売り場を強くする', 'Boost your shops'), go: () => openAds(ctx), needs: 'workshop' },
    { key: 'missions', name: t('依頼', 'Requests'), note: t('ミッションの確認', 'Missions'), go: () => openMissions(ctx) },
    { key: 'data', name: t('市場調査データ', 'Market data'), note: t('売れ筋・ニーズ', 'Demand and sellers'), go: () => openData(ctx) },
    { key: 'ranking', name: t('企業ランキング', 'Ranking'), note: t('エリア・ランド・世界', 'Area, land, world'), go: () => openRanking(ctx) },
  ],
  sys: [
    { key: 'invest', name: t('設備投資', 'Investment'), note: t('建物ごとの設備', 'Per-building upgrades'), go: () => openInvest(ctx), needs: 'workshop' },
    { key: 'settings', name: t('設定', 'Settings'), note: t('言語・案内', 'Language, guide'), go: () => openSettings() },
    { key: 'data', name: t('セーブ', 'Save'), note: t('やり直す・工房へ', 'Restart, back'), go: () => openSaveMenu() },
    ...(TEST ? [{ key: 'test', name: t('テスト', 'Test'), note: '?test=2', go: () => openTest() }] : []),
  ],
};
const MENU_NAME: Record<Menu, string> = {
  plan: t('営業企画', 'Planning'),
  hr: t('人事', 'HR'),
  scm: 'SCM',
  skill: t('スキルツリー', 'Skill tree'),
  mkt: t('マーケティング', 'Marketing'),
  sys: t('システム', 'System'),
};
/** スマホの幅では短い名前 */
const MENU_SHORT: Record<Menu, string> = { plan: t('営業企画', 'Plan'), hr: t('人事', 'HR'), scm: 'SCM', skill: t('スキル', 'Skills'), mkt: t('マーケ', 'Mktg'), sys: t('システム', 'System') };
const MENU_ICON: Record<Menu, string> = { plan: '🏗', hr: '👥', scm: '🚚', skill: '✦', mkt: '📣', sys: '⚙' };

let menu: Menu | null = null;
let sub: string | null = null;

const foot = h('div', 'isl-foot');
const panel = h('div', 'isl-panel');
const subRow = h('div', 'isl-subs');
const cards = h('div', 'isl-cards');
panel.append(subRow, cards);
const tabbar = h('nav', 'isl-tabbar');
const tabBtns = {} as Record<Menu, HTMLButtonElement>;
const leftG = h('div', 'isl-tabgroup');
const rightG = h('div', 'isl-tabgroup');
for (const m of ['plan', 'hr', 'scm', 'skill', 'mkt', 'sys'] as Menu[]) {
  const b = h('button', `isl-tab ${m === 'skill' ? 'is-center' : ''}`);
  b.type = 'button';
  b.append(h('i', '', MENU_ICON[m]), h('span', 'is-full', MENU_NAME[m]), h('span', 'is-short', MENU_SHORT[m]));
  b.addEventListener('click', () => pickMenu(m));
  tabBtns[m] = b;
  if (m === 'skill') continue;
  (m === 'plan' || m === 'hr' || m === 'scm' ? leftG : rightG).append(b);
}
tabbar.append(leftG, tabBtns.skill, rightG);
foot.append(panel, tabbar);

const needWs = () => {
  toast(t('まずは工房を建てましょう', 'Build the workshop first'));
};

function pickMenu(m: Menu) {
  const ws = !!myWorkshop(s);
  if (m === 'skill') {
    if (!ws) return needWs();
    menu = null;
    sub = null;
    openSkills(ctx);
    renderAll();
    return;
  }
  if (!ws && (m === 'hr' || m === 'scm')) return needWs();
  closePop();
  if (menu === m) {
    menu = null;
    sub = null;
  } else {
    menu = m;
    sub = null;
  }
  if (placing && !placing.move && sub !== 'build') placing = null;
  renderAll();
}

function toggleSub(k: string) {
  sub = sub === k ? null : k;
  if (sub !== 'build') placing = null;
  renderAll();
}

function renderFoot() {
  for (const m of Object.keys(tabBtns) as Menu[]) tabBtns[m].classList.toggle('is-on', menu === m);
  const ws = !!myWorkshop(s);
  tabBtns.hr.classList.toggle('is-off', !ws);
  tabBtns.scm.classList.toggle('is-off', !ws);
  tabBtns.skill.classList.toggle('is-off', !ws);
  const ready = MISSIONS.some((m) => s.missions[m.id] === 'done');
  tabBtns.mkt.classList.toggle('has-dot', ready);
  panel.hidden = !menu || !!placing?.move;
  if (!menu) return;
  subRow.replaceChildren(
    ...SUBS[menu as Exclude<Menu, 'skill'>].map((x) => {
      const b = h('button', `isl-sub ${sub === x.key ? 'is-on' : ''} ${x.needs === 'workshop' && !ws ? 'is-off' : ''}`);
      b.type = 'button';
      b.append(h('b', '', x.name), h('small', '', x.note));
      if (x.key === 'missions' && ready) b.classList.add('has-dot');
      b.addEventListener('click', () => {
        if (x.needs === 'workshop' && !ws) return needWs();
        x.go();
        if (x.key !== 'build') renderAll();
      });
      return b;
    }),
  );
  cards.hidden = sub !== 'build';
  subRow.hidden = !!placing;
  if (sub === 'build') renderBuild();
}

// ---------------------------------------------------------------- 建てる

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

/** 「ここに建てる」で選んだマス */
let buildAt: [number, number] | null = null;

function renderBuild() {
  cards.replaceChildren(
    ...P1_BUILDINGS.map((b) => {
      const err = canBuild(s, b.id);
      const locked = !!err && err !== 'money';
      const c = h('button', `isl-card ${locked ? 'is-locked' : ''} ${placing?.id === b.id && !placing.move ? 'is-on' : ''}`);
      c.type = 'button';
      const im = image(`b/${b.id}/rd.png`).cloneNode() as HTMLImageElement;
      im.alt = '';
      c.append(im, h('b', '', DEF[b.id].name), h('span', '', lockNote(b.id)));
      c.addEventListener('click', () => {
        const e = canBuild(s, b.id);
        if (e) {
          toast(ERR[e]);
          return;
        }
        selected = null;
        closePop();
        const [i, j] = buildAt ?? [Math.floor(s.n / 2), Math.floor(s.n / 2)];
        placing = placing?.id === b.id && !placing.move ? null : { id: b.id, dir: 'rd', i, j };
        buildAt = null;
        if (placing) fitDir();
        renderAll();
      });
      return c;
    }),
  );
}

const ignoreOf = () => placing?.move;
/** 置こうとしているマスで、入口を道路に向けられる向きにそろえる */
function fitDir() {
  if (!placing) return;
  const ok = allowedDirs(s, placing.id, placing.i, placing.j, ignoreOf());
  if (ok.length && !ok.includes(placing.dir)) placing.dir = ok[0];
}
const placeErr = () => (placing ? (placing.move != null ? canMoveTo(s, placing.move, placing.i, placing.j, placing.dir) : canPlaceAt(s, placing.id, placing.i, placing.j, placing.dir)) : null);

const placeBox = h('div', 'isl-place');
function tryPlace() {
  if (!placing) return;
  const name = DEF[placing.id].name;
  if (placing.move != null) {
    const e = relocate(s, placing.move, placing.i, placing.j, placing.dir);
    if (e) toast(ERR[e]);
    else {
      toast(t(`${name}の移転を始めました`, `Moving ${name}`));
      placing = null;
      save();
    }
  } else {
    const r = build(s, placing.id, placing.i, placing.j, placing.dir);
    if (typeof r === 'string') toast(ERR[r]);
    else {
      toast(t(`${name}の工事を始めました（${P1B[placing.id].days} 日）`, `Started building: ${name} (${P1B[placing.id].days} days)`));
      placing = null;
      menu = null;
      sub = null;
      save();
    }
  }
  renderAll();
}
function renderPlace() {
  dirty = true;
  placeBox.hidden = !placing;
  canvas.classList.toggle('is-placing', !!placing);
  if (!placing) return;
  const err = placeErr();
  const name = DEF[placing.id].name;
  const moving = placing.move != null;
  const msg = err ? ERR[err] : moving ? t('— 移転先を選んで「ここへ移転」', '— pick the new spot, then Move here') : t('— 地図で場所を選んで「建てる」', '— pick a spot, then Build');
  const r = h('div', 'isl-row');
  const go = btn(moving ? t(`ここへ移転（${money(moveCost(s.buildings.find((b) => b.uid === placing!.move)!))}）`, `Move here (${money(moveCost(s.buildings.find((b) => b.uid === placing!.move)!))})`) : t('建てる', 'Build'), tryPlace, 'is-on');
  go.disabled = !!err;
  const rot = btn(t('向きを変える', 'Rotate'), () => {
    if (!placing) return;
    const ok = allowedDirs(s, placing.id, placing.i, placing.j, ignoreOf());
    if (ok.length) placing.dir = ok[(ok.indexOf(placing.dir) + 1) % ok.length];
    renderPlace();
  });
  rot.disabled = allowedDirs(s, placing.id, placing.i, placing.j, ignoreOf()).length < 2;
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

// ---------------------------------------------------------------- マスの吹き出し

const popEl = h('div', 'isl-pop');
const popHead = h('div', 'isl-pop-head');
const popTitle = h('h3');
const popBody = h('div', 'isl-pop-scroll');
const popTail = h('i', 'isl-pop-tail');
popHead.append(popTitle, btn('✕', () => closePop()));
popEl.append(popTail, popHead, popBody);
popEl.hidden = true;
popEl.addEventListener('pointerdown', (e) => e.stopPropagation());

function openPop(i: number, j: number) {
  pop = [i, j];
  menu = null;
  sub = null;
  placing = null;
  const b = occupant(s, i, j);
  selected = b ? b.uid : null;
  renderPop();
  centerOn(b ? b.i : i, b ? b.j : j);
}
function closePop() {
  if (!pop) return;
  pop = null;
  selected = null;
  popEl.hidden = true;
  dirty = true;
}
function renderPop() {
  if (!pop) return;
  // 撤去・移転で建物がなくなったら、いまのマスで作り直す
  if (selected != null && !s.buildings.some((b) => b.uid === selected)) selected = null;
  const y = popBody.scrollTop;
  const { title, body } = tileContent(ctx, pop[0], pop[1], {
    move: (uid) => {
      const b = s.buildings.find((x) => x.uid === uid);
      if (!b) return;
      closePop();
      menu = null;
      placing = { id: b.id, dir: b.dir, i: b.i, j: b.j, move: uid };
      renderAll();
    },
    buildHere: (i, j) => {
      closePop();
      buildAt = [i, j];
      menu = 'plan';
      sub = 'build';
      renderAll();
    },
    close: () => closePop(),
    redraw: () => renderPop(),
  });
  popTitle.textContent = title;
  popBody.replaceChildren(body);
  popBody.scrollTop = y;
  popEl.hidden = false;
  placePop();
  dirty = true;
}
/** 吹き出しを、マスの真下に（しっぽはマスを指す） */
function placePop() {
  if (!pop || popEl.hidden) return;
  const b = selected != null ? s.buildings.find((x) => x.uid === selected) : null;
  const [i, j] = b ? [b.i, b.j] : pop;
  const sx = ((i - j) * 100 - cam.x) * cam.zoom + W / 2;
  const sy = ((i + j) * 55 - cam.y) * cam.zoom + H / 2;
  const w = Math.min(400, W - 16);
  const left = Math.max(8, Math.min(W - w - 8, sx - w / 2));
  const top = sy + 40 * cam.zoom + 12;
  const bottom = foot.getBoundingClientRect().top - 8;
  popEl.style.width = `${w}px`;
  popEl.style.left = `${left}px`;
  popEl.style.top = `${top}px`;
  popEl.style.maxHeight = `${Math.max(140, bottom - top)}px`;
  popTail.style.left = `${Math.max(16, Math.min(w - 16, sx - left))}px`;
}

/** カメラをマスへ動かす（吹き出しが下に入るよう、マスは画面の上のほうへ） */
let tween: { x0: number; y0: number; x1: number; y1: number; t0: number } | null = null;
function centerOn(i: number, j: number) {
  const hudBottom = hud.getBoundingClientRect().bottom;
  const ty = Math.max(hudBottom + 40 + 150 * cam.zoom, H * 0.28);
  const wx = (i - j) * 100;
  const wy = (i + j) * 55;
  tween = { x0: cam.x, y0: cam.y, x1: wx, y1: wy - (ty - H / 2) / cam.zoom, t0: performance.now() };
}

// ---------------------------------------------------------------- マインちゃんの案内

const advisor = h('div', 'isl-advisor');
const mine = h('img');
mine.src = assetUrl('mch/Image/Characters/navi_ain_speak_00_talk.png');
mine.alt = '';
const bubbleBox = h('div', 'isl-bubble');
advisor.append(mine, bubbleBox);
let hiddenTip = '';

function openBuildTab() {
  menu = 'plan';
  sub = 'build';
  renderAll();
}

function tutorial(): { text: string; action?: [string, () => void] } {
  const ws = s.buildings.find((b) => b.owner === 'me' && b.id === 'workshop');
  const shops = s.buildings.filter((b) => b.owner === 'me' && P1B[b.id]?.kind === 'shop');
  const rec = PRODUCT[recommend(s)].name;
  if (!ws) return { text: t('新天地へようこそ！まずは Workshop から引き継いだ「工房」を建てましょう。下の「営業企画」→「建築」から工房を選び、道路に面した空き地へ。入口は道路の方にしか向けられません。', 'Welcome to the new land! First, build the Workshop you brought from home: Planning → Build, then place it on a lot facing a road — the entrance can only face the road.'), action: [t('建築を開く', 'Open Build'), openBuildTab] };
  if (ws.left > 0) return { text: t('工房の工事中です。⏩ で時間を早められます。地図のマスを押すと、建物の詳しい情報が見られます。', 'The workshop is under construction. ⏩ speeds things up. Tap any tile on the map for details.') };
  if (!s.flags.data) return { text: t('何を売るか決める前に、市場データを見てみましょう。今売れている商品、まだ誰も扱っていない商品、国民のニーズが分かります（「マーケティング」→「市場調査データ」）。', 'Before choosing what to sell, check the market data (Marketing → Market data): what sells now, what nobody sells yet, and what people want.'), action: [t('データを見る', 'Open data'), () => openData(ctx)] };
  if (!shops.length) return { text: t(`データによると「${rec}」がよさそう！次はお店（よろず屋）を建てましょう。道路に面した場所に。`, `The data says ${rec} looks promising! Next, build a shop (General store) facing a road.`), action: [t('建築を開く', 'Open Build'), openBuildTab] };
  if (shops.every((b) => b.left > 0)) return { text: t('お店の工事中です。開店した日から 1 か月目の営業が始まります。その間に工房で商品を作り始めましょう。', 'The shop is being built. Your first business month starts the day it opens. Start crafting meanwhile.'), action: [t('工房を開く', 'Open workshop'), () => openWorkshop(ctx)] };
  const crafting = s.slots.some((sl) => sl.running);
  const stockAny = Object.values(s.stock).some((n) => (n ?? 0) > 0) || s.trips.length > 0 || myShops(s).some((b) => Object.values(s.shops[b.uid].storage).some((n) => (n ?? 0) > 0) || Object.values(s.shops[b.uid].shelf).some((n) => (n ?? 0) > 0));
  if (!crafting && !stockAny) return { text: t(`工房で「${rec}」を作りましょう。職人はバランスの良い MCHアーティストが向いています。`, `Make ${rec} in the workshop. The well-balanced MCH Artist is the best crafter.`), action: [t('工房を開く', 'Open workshop'), () => openWorkshop(ctx)] };
  if (!s.staff.some((x) => x.task === 'transport')) return { text: t('できた商品をお店へ運ぶ人を決めましょう（「人事」→「従業員」）。運搬は PHY の高い MCHウォーリアーが得意です。', 'Choose who hauls goods to the shop (HR → Staff). MCH Warrior, with high PHY, is the best hauler.'), action: [t('従業員を開く', 'Open staff'), () => openStaff(ctx)] };
  const shop = myShops(s)[0];
  const sh = shop ? s.shops[shop.uid] : null;
  if (sh && !sh.shelves[0]) return { text: t(`お店で、主力商品を「${rec}」に、店員を決めましょう。販売は INT の高い MCHタクティシャンが得意です。`, `In the shop, set ${rec} as the main product and choose a clerk. MCH Tactician, with high INT, sells best.`), action: [t('お店を開く', 'Open shop'), () => shop && openShop(ctx, shop.uid)] };
  const closed = myShops(s).find((b) => s.shops[b.uid].staff == null && s.shops[b.uid].part === 0);
  if (closed) return { text: t(`${DEF[closed.id].name}に店員がいないので休業中です。店員かアルバイトを決めましょう。販売は INT の高いヒーローが得意です。`, `${DEF[closed.id].name} is closed: nobody on the floor. Choose a clerk or part-timer. High-INT heroes sell best.`), action: [t('お店を開く', 'Open shop'), () => openShop(ctx, closed.uid)] };
  if (MISSIONS.some((m) => s.missions[m.id] === 'done')) return { text: t('依頼を達成しました！「マーケティング」→「依頼」で報酬を受け取りましょう。', 'You completed a request! Claim the reward under Marketing → Requests.'), action: [t('依頼を開く', 'Open requests'), () => openMissions(ctx)] };
  if (!s.reports.length) return { text: t('準備ができました！お店を開いた日から 1 か月ごとに売上を締めます。流れが詰まっていないかは「SCM」→「サプライチェーン」で確かめられます。', 'All set! Sales close every month from the day your shop opened. Check for bottlenecks under SCM → Supply chain.'), action: [t('サプライチェーンを見る', 'Open supply chain'), () => openSupply(ctx)] };
  // 1 か月たってから
  const low = (Object.keys(MATS) as (keyof typeof MATS)[]).find((m) => s.slots.some((sl) => sl.sku && PRODUCT[skuParts(sl.sku)[0]].recipe[skuParts(sl.sku)[1]][m] && (s.mats[m] ?? 0) < 10));
  if (low) return { text: t(`${MATS[low].name}が残り少なくなっています。「SCM」→「調達」で買い足しましょう。`, `${MATS[low].name} is running low. Buy more under SCM → Buy.`), action: [t('調達を開く', 'Open buy'), () => openBuy(ctx)] };
  if (s.staff.some((x) => x.resting)) return { text: t('休んでいる従業員がいます。「人事」→「給与・労務」の賞与ですぐ元気にできます。人手が足りないときは「人材登用」で雇えます。', 'Someone is resting. A bonus (HR → Pay & welfare) refreshes them at once; hire more under Recruiting.'), action: [t('給与・労務を開く', 'Open pay'), () => openPayroll(ctx)] };
  const last = s.reports[s.reports.length - 1];
  if (s.cleared) return { text: t('エリア 1 位、おめでとうございます！フェーズ 2 は準備中です。このまま会社を育てられます。', 'Congratulations on #1 in the area! Phase 2 is coming. You can keep growing the company.') };
  if (!Object.keys(s.intel).length) {
    const top = last.area.find((x) => !x.me);
    return { text: t(`いまエリア ${last.rank} 位。他社のお店をタップすると「調査」で売上の中身が分かります。まずは${top?.name ?? '他社'}を調べてみましょう。`, `You are #${last.rank} in the area. Tap a rival store to research its sales. Try ${top?.name ?? 'a rival'} first.`) };
  }
  if (last.rank > 1) return { text: t(`いまエリア ${last.rank} 位。1 位の${last.area[0].name}を抜くには、棚や作業台を増やしたり（スキルツリー）、アンコモンで単価を上げたり（商品開発）、宣伝したりしましょう。`, `You are #${last.rank} in the area. To pass ${last.area[0].name}, add shelves and benches (skills), raise prices with Uncommons (products) or advertise.`), action: [t('スキルツリーを開く', 'Open skills'), () => openSkills(ctx)] };
  return { text: t('いい調子です！', 'Nice work!') };
}

function renderAdvisor() {
  advisor.style.display = placing || sheetOpen() || pop || !guideOn ? 'none' : '';
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

// ---------------------------------------------------------------- システム・お祝い

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

function openSettings() {
  modal(t('設定', 'Settings'), t('表示の言語と、マインちゃんの案内を切り替えます。', 'Switch the language and Mine-chan’s guide.'), [
    [isEn ? '日本語' : 'English', () => setLang(isEn ? 'ja' : 'en')], // i18n-ja
    [
      guideOn ? t('案内を隠す', 'Hide guide') : t('案内を出す', 'Show guide'),
      () => {
        guideOn = !guideOn;
        try {
          localStorage.setItem(GUIDE, guideOn ? 'on' : 'off');
        } catch {
          // 保存できなくても切り替える
        }
        renderAll();
      },
    ],
    [t('閉じる', 'Close'), () => undefined, 'is-on'],
  ]);
}

function openSaveMenu() {
  const before = speed;
  speed = 0;
  renderHud();
  modal(t('セーブ', 'Save'), t('フェーズ 1「新天地で実績を上げろ」。進み具合はこのブラウザに自動で保存されます。', 'Phase 1: “Make your name in the new land”. Progress is saved in this browser automatically.'), [
    [t('続ける', 'Resume'), () => ((speed = before || 1), renderHud()), 'is-on'],
    [
      t('最初から', 'Start over'),
      () =>
        modal(t('最初からやり直しますか？', 'Start over?'), t('いまの会社は消えます。', 'Your current company will be lost.'), [
          [t('やり直す', 'Start over'), () => restart(), 'is-danger'],
          [t('やめる', 'Cancel'), () => ((speed = before || 1), renderHud())],
        ]),
    ],
    [t('工房へ戻る', 'Back to the Workshop'), () => location.assign(`${import.meta.env.BASE_URL}index.html`)],
  ]);
}

function restart() {
  s = newP1();
  selected = null;
  placing = null;
  closePop();
  closeSheet();
  menu = null;
  sub = null;
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
  const bottom = innerHeight - foot.getBoundingClientRect().top + 8;
  // 置くときの札は上に（地図の下半分は帯でふさがるので）
  placeBox.style.top = `${top}px`;
  placeBox.style.bottom = 'auto';
  advisor.style.bottom = `${bottom}px`;
  toasts.style.top = `${placing ? placeBox.getBoundingClientRect().bottom + 8 : top}px`;
  placePop();
}
function renderAll() {
  dirty = true;
  renderHud();
  renderFoot();
  renderPlace();
  renderAdvisor();
  layout();
}
root.append(hud, toasts, advisor, placeBox, popEl, foot);
// 始めたばかりなら、建築の帯を開いておく
if (!s.buildings.some((b) => b.owner === 'me')) {
  menu = 'plan';
  sub = 'build';
}
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
  tween = null;
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
  if (menu) {
    menu = null;
    sub = null;
  }
  openPop(i, j);
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
    closePop();
    closeSheet();
    menu = null;
    sub = null;
    renderAll();
  } else if (e.key === 'r' || e.key === 'R') {
    if (placing) {
      const ok = allowedDirs(s, placing.id, placing.i, placing.j, ignoreOf());
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
    for (const x of r.intel) toast(t(`${rivalName(x.rid)}の調査が段階 ${x.lv} に進みました`, `Research on ${rivalName(x.rid)} reached stage ${x.lv}`));
    for (const k2 of r.developed) toast(t(`${PRODUCT[k2].name}のアンコモンを開発しました！`, `Developed the ${PRODUCT[k2].name} Uncommon!`));
    for (const id of r.missions) toast(t(`依頼「${MISSIONS.find((m) => m.id === id)?.title ?? ''}」を達成しました`, `Request done: ${MISSIONS.find((m) => m.id === id)?.title ?? ''}`));
    if (r.report) {
      save();
      showReport(r.report);
      break;
    }
  }
  refreshSheet();
  if (pop && !(document.activeElement instanceof HTMLSelectElement && popEl.contains(document.activeElement))) renderPop();
  renderAll();
}

function showReport(r: NonNullable<ReturnType<typeof step>['report']>) {
  speed = 0;
  closePop();
  openReport(ctx, r, () => {
    if (!s.flags.ranking) {
      s.flags.ranking = true;
      save();
      modal(
        t('企業ランキングを紹介します', 'Meet the company ranking'),
        t('はじめての売上報告、おつかれさまでした！会社の月の売上は「企業ランキング」で、エリア別・ランド別・世界全体と比べられます（「マーケティング」→「企業ランキング」、上の順位を押しても開けます）。まずは、同じエリアに出店している同業他社を月の売上で抜いて、エリア 1 位を目指しましょう！', 'Well done on your first sales report! The company ranking compares monthly sales by area, by land and worldwide (Marketing → Ranking, or tap your rank at the top). First, beat the rival retailers in your area and become #1 here!'),
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
  if (tween) {
    const k = Math.min(1, (now - tween.t0) / 320);
    const e = 1 - (1 - k) ** 3;
    cam.x = tween.x0 + (tween.x1 - tween.x0) * e;
    cam.y = tween.y0 + (tween.y1 - tween.y0) * e;
    if (k >= 1) tween = null;
    dirty = true;
  }
  for (let k = fx.length - 1; k >= 0; k--) if (effectDone(fx[k], now)) fx.splice(k, 1);
  const wf = waterFrame(now);
  if (changed || fx.length || wf !== lastWater || loading()) dirty = true;
  lastWater = wf;
  if (dirty) {
    dirty = false;
    const ghost: P1Ghost | null = placing ? { id: placing.id, i: placing.i, j: placing.j, dir: placing.dir, ok: !placeErr() } : null;
    drawP1(ctx2, s, cam, W, H, DPR, now, fx, ghost, placing?.move ?? selected, pop && selected == null ? pop : null);
    placePop();
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
  pop: (i: number, j: number) => {
    openPop(i, j);
    renderAll();
  },
  menu: (m: Menu | null) => (m ? pickMenu(m) : ((menu = null), renderAll())),
};
