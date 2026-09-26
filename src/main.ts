import './style.css';
import { CURRENCIES } from './game/currency';
import { conditionLabel, CONDITIONS } from './game/conditions';
import { ACHIEVEMENTS, DAILY_BONUS, dailyLabel, dailyValue } from './game/achievements';
import { confetti, confettiSettings } from './ui/confetti';
import { cutin } from './ui/cutin';
import { Sound } from './audio';
import { catalog, customers, getExtension, icons, lands, pests, setColorAssist, RARITY_COLOR, RARITY_JA, series, staffFrames, thieves, workshopImages } from './game/catalog';
import { COUNTER, FLOOR_Y, HERO_PX, POT, setSceneHeight, SHELF_TOP, SHELF_X0, slotPos, WORKSHOP_CROP, WORKSHOP_H } from './game/layout';
import { LINES, type LineId } from './game/lines';
import { EDITIONS, itemEdition, itemExt, itemName } from './game/items';
import { exportCode, importCode, loadSave, newSave, SaveError, writeSave } from './game/save';
import { Shop, type DayReport, type Decision, type ExtraSource, type ShopEvent } from './game/shop';
import { autoBuy, buy } from './game/purchase';
import { relocate } from './game/prestige';
import { computeStats } from './game/stats';
import { level, skillById, type SkillNode } from './game/skills';
import { assetUrl, preload } from './render/images';
import { SCENE_SPRITES, SceneRenderer } from './render/scene';
import { collectionView } from './ui/collection';
import { fileImg, fmt, h, icon } from './ui/dom';
import { TreeView } from './ui/tree';
import { dailiesList, ordersList } from './ui/dayInfo';
import { rankingView } from './ui/ranking';
import { partyStrip, partyView } from './ui/party';
import { partyDef, partyHero, taughtSeries } from './game/party';
import { submit as submitRanking } from './net/leaderboard';
import { isEn, lang, setLang, t } from './i18n';
import { relocateView, statsView } from './ui/prestige';
import { Tutorial, type Box, type Place } from './ui/tutorial';

const save = loadSave();
const sound = new Sound();
sound.bgmOn = save.settings.bgm;
sound.seOn = save.settings.se;

// Facility overlays, back to front. They are <img> elements so animated GIFs play natively.
const OVERLAY_ORDER = [
  'conveyor',
  'capsule',
  'ambient_overlay_200',
  'ambient_overlay_325',
  'ambient_overlay_401',
  'ambient_overlay_402',
  'ambient_overlay_500',
  'magic_pot',
];
const FACILITY_NODES = new Set(['forge', 'conveyor', 'rare', 'lantern']);

// ------------------------------------------------------------------ layout

const gumText = h('span.gum-amount', {}, '0');
const dustText = h('span.dust-amount', {}, '0');
const dustBox = h('div.dust', { title: t('ゴールドダスト', 'Gold dust') }, icon(icons.dust, 'px'), dustText);
const researchText = h('span.research-amount', {}, '0');
const researchBox = h('div.dust.research', { title: t('研究ポイント', 'Research points') }, icon(CURRENCIES.research.icon, 'px'), researchText);
const emblemText = h('span.emblem-amount', {}, '0');
const emblemBox = h('div.dust.emblem', { title: t('エンブレム', 'Emblems') }, icon(CURRENCIES.emblem.icon, 'px'), emblemText);
const cpText = h('span.cp-amount', {}, '0');
const cpBox = h('div.dust.cp', { title: t('Cp（移転ポイント）', 'Cp (relocation points)') }, icon(CURRENCIES.cp.icon, 'px'), cpText);
const dayText = h('span.day-label');
const bgmBtn = h('button.btn.small.toggle', { onclick: () => toggleSetting('bgm') }, 'BGM');
const seBtn = h('button.btn.small.toggle', { onclick: () => toggleSetting('se') }, 'SE');
const topbar = h(
  'header.topbar',
  {},
  h('div.brand', {}, icon(icons.gum, 'px brand-icon'), h('div', {}, h('b', {}, 'My Crypto Workshop'), h('small', {}, t('マイクリ クラフト工房', 'MCH Craft Workshop')))),
  h('div.gum', { title: t('所持GUM', 'GUM') }, icon(icons.gum, 'px'), gumText),
  dustBox,
  researchBox,
  emblemBox,
  cpBox,
  dayText,
  h(
    'div.settings',
    {},
    bgmBtn,
    seBtn,
    h('button.btn.small', { onclick: () => openCollection(), title: t('図鑑', 'Collection') }, '📖'),
    h('button.btn.small', { onclick: () => openMenu(), title: t('メニュー', 'Menu') }, '☰'),
  ),
);

const workshop = h('div.workshop');
workshop.append(icon(workshopImages.workshop_base, 'ws-base', t('工房', 'Workshop')));
const overlayEls = new Map<string, HTMLImageElement>();
for (const key of OVERLAY_ORDER) {
  const el = document.createElement('img');
  el.className = 'ws-overlay';
  el.alt = '';
  el.hidden = true;
  el.draggable = false;
  overlayEls.set(key, el);
  workshop.append(el);
}
const canvas = h('canvas.scene-canvas') as HTMLCanvasElement;
// Canvas text picks kanji glyphs by language too (Japanese forms, not Chinese).
canvas.lang = lang;

// HUD overlaid on the top-right of the scene (like Bookstore Incremental), so the whole screen
// is the workshop and the store while it is open.
const hudGum = h('span');
const hudDay = h('span.hud-day');
const hudEvent = h('div.hud-event');
const hudTime = h('span.hud-time');
const hudBar = h('div.hud-bar-fill');
const hudRevenue = h('b');
const hudStats = h('div.hud-stats');
const hud = h(
  'div.hud',
  { 'aria-live': 'off' },
  h('div.hud-gum', {}, icon(icons.gum, 'px'), hudGum),
  h('div.hud-row', {}, hudDay, hudTime),
  h('div.hud-bar', {}, hudBar),
  h('div.hud-row', {}, h('span', {}, t('本日', 'Today')), hudRevenue),
  hudStats,
  hudEvent,
);
const gearBtn = h(
  'button.hud-gear',
  { 'aria-label': t('メニュー（一時停止）', 'Menu (pause)'), title: t('メニュー（一時停止）', 'Menu (pause)'), onclick: () => openPauseMenu() },
  h('span', {
    html: '<svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true"><circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" stroke-width="4" stroke-dasharray="3.2 3.1"/><circle cx="12" cy="12" r="6" fill="none" stroke="currentColor" stroke-width="2.4"/><circle cx="12" cy="12" r="2.2" fill="currentColor"/></svg>',
  }),
);
// Mine-chan's tips pop up briefly over the scene instead of occupying a side panel.
const naviImg = fileImg(staffFrames.mine[0].image, 'px navi-img');
const naviText = h('p.navi-text');
const naviToast = h('div.navi-toast', {}, naviImg, naviText);
naviToast.hidden = true;
const logList = h('ul.log');

// Before opening: the day's card with the open button, over the storefront.
const openDayBtn = h('button.btn.btn-primary.open-day', { onclick: () => openDay() }) as HTMLButtonElement;
const openInfo = h('p.open-info');
// Today's orders and daily requests (shown here instead of the skill tree).
const openExtras = h('div.open-extras');
// The party (英雄の酒場): who stands on the balcony today, and the button to change it.
const openParty = h('div.open-party');
const openCard = h('div.open-card', {}, openInfo, openExtras, openParty, openDayBtn);
// The switch to the skill tree, bottom right (the tree's "to the shop" button sits in the same spot).
const toTreeBtn = h('button.btn.nav-btn.to-tree', { onclick: () => showTree() }, t('🌳 スキルツリー', '🌳 Skill tree'));
const scene = h('div.scene', {}, workshop, canvas, hud, gearBtn, naviToast, openCard, toTreeBtn);
const renderer = new SceneRenderer(canvas);

const stage = h('main.stage', {}, scene);

const tree = new TreeView(save, {
  onBuy: buyNode,
  onShop: () => showShop(),
  onCollection: () => openCollection(),
  onRanking: () => openRanking(),
  onRelocate: () => openRelocate(),
  onRecipes: (heroId) => openRecipes(heroId),
});
tree.hide();

// ------------------------------------------------------------------ tutorial

/** A rectangle in scene coordinates, on screen. */
function sceneBox(x0: number, y0: number, x1: number, y1: number): Box {
  const a = renderer.toClient(x0, y0);
  const b = renderer.toClient(x1, y1);
  return { left: a.x, top: a.y, width: b.x - a.x, height: b.y - a.y };
}
const elBox = (selector: string): Box | null => {
  const el = document.querySelector(selector);
  const r = el?.getBoundingClientRect();
  return r && r.width > 0 ? { left: r.left, top: r.top, width: r.width, height: r.height } : null;
};
const firstDay = () => save.day === 1 && save.prestige.runs === 0;

const tutorial = new Tutorial(
  save.tips,
  [
    // Day 1: crafting, selling and the register.
    { id: 'welcome', place: 'day', when: firstDay, text: t('いらっしゃいませ！ここはあなたのクラフト工房。わたしマインちゃんが、お店の回し方を案内するね！', "Welcome! This is your crafting workshop. I'm Mine-chan, and I'll show you how to run the shop!") },
    {
      id: 'pot',
      place: 'day',
      when: firstDay,
      text: t('魔法の壺をタップしてみて！タップするほどエクステンションが早くできあがるよ。', 'Tap the magic pot! The more you tap, the faster extensions get crafted.'),
      target: () => sceneBox(POT.hit.x0, POT.hit.y0, POT.hit.x1, POT.hit.y1),
      done: () => potClicks >= 6,
    },
    {
      id: 'shelf',
      place: 'day',
      when: firstDay,
      text: t('できた品は下のお店の棚に並ぶよ。来店したヒーローが気に入った品を買ってくれるんだ。', 'Finished items go onto the shelves in the shop below. Visiting heroes buy the ones they like.'),
      target: () => {
        const last = slotPos(Math.max(0, (shop?.shelfSlots ?? 3) - 1));
        return sceneBox(SHELF_X0 - 16, SHELF_TOP - 12, last.x + 40, FLOOR_Y + 12);
      },
    },
    {
      id: 'register',
      place: 'day',
      when: () => firstDay() && (shop?.queue.length ?? 0) > 0,
      text: t('お会計はカウンターのクリスくん。カウンターをタップすると会計を手伝えるよ！', 'Chris-kun rings customers up at the counter. Tap the counter to help check out!'),
      target: () => sceneBox(COUNTER.x0, COUNTER.top - HERO_PX - 20, COUNTER.x1, COUNTER.bottom),
      done: () => registerClicks >= 3 || (shop?.queue.length ?? 0) === 0,
    },
    {
      id: 'hold',
      place: 'day',
      when: () => firstDay() && (shop?.elapsed ?? 0) > 25,
      text: t('壺を長押しすると高速でクラフトできるよ。ゲージが赤くなる前に離さないと止まっちゃうから気をつけて！', "Hold the pot to craft at high speed. Let go before the gauge turns red, or it overheats and stops!"),
      target: () => sceneBox(POT.hit.x0, POT.hit.y0, POT.hit.x1, POT.hit.y1),
    },
    {
      id: 'hud',
      place: 'day',
      when: () => firstDay() && (shop?.elapsed ?? 0) > 30,
      text: t('右上が今日の売上と残り時間。閉店まで売り続けよう！', "Top right: today's sales and the time left. Keep selling until closing!"),
      target: () => elBox('.hud'),
    },
    {
      id: 'treeBtn',
      place: 'day',
      when: () => firstDay() && (shop?.elapsed ?? 0) > 34,
      text: t('右下のボタンで、いつでもスキルツリーに行けるよ。スキルツリーにいる間は営業の時間が止まるから安心してね。', 'The button at the bottom right takes you to the skill tree at any time. The day waits while you are there.'),
      target: () => elBox('.to-tree'),
    },
    // After day 1: results and the skill tree.
    {
      id: 'results',
      place: 'results',
      when: () => save.day === 2 && save.prestige.runs === 0,
      text: t('1日目おつかれさま！稼いだ GUM でスキルを習得して、工房を強くしよう。', 'Good work on day 1! Spend the GUM you earned on skills to grow the workshop.'),
      target: () => elBox('.results-modal .btn-primary'),
      done: () => place !== 'results',
    },
    {
      id: 'firstSkill',
      place: 'tree',
      when: () => save.day === 2 && save.prestige.runs === 0,
      text: t('まずは「壺の火力」。ノードを選んで、習得ボタン（またはもう一度タップ）で習得できるよ。', 'Start with "Pot Heat". Select the node, then press the learn button (or tap it again).'),
      start: () => tree.focusNode('craftSpeed'),
      target: () => elBox('[data-node="craftSpeed"]'),
      done: () => level(save.levels, 'craftSpeed') > 0 || save.gum < skillById.get('craftSpeed')!.baseCost,
    },
    {
      id: 'buyList',
      place: 'tree',
      when: () => save.day === 2 && save.prestige.runs === 0,
      text: t('今習得できるスキルはここに並ぶよ。「安い順にまとめて習得」で一気に習得もできる！', 'Skills you can afford are listed here. "Learn all, cheapest first" buys them in one go!'),
      target: () => elBox('.buy-list'),
    },
    {
      id: 'openDay',
      place: 'tree',
      when: () => save.day === 2 && save.prestige.runs === 0,
      text: t('準備ができたら、右下の「ショップへ」でお店に戻ろう！', "When you're ready, go back with \"To the shop\" at the bottom right!"),
      target: () => elBox('.to-shop'),
      done: () => place === 'day',
    },
    {
      id: 'openShop',
      place: 'day',
      when: () => save.day === 2 && save.prestige.runs === 0 && !!shop && !shop.started,
      text: t('「開店する」で 2 日目の営業を始めよう！', 'Press "Open" to start day 2!'),
      target: () => elBox('.open-day'),
      done: () => !!shop?.started,
    },
    // Day 2 and 3: thieves and workshop enemies, when the first one shows up.
    {
      id: 'thief',
      place: 'day',
      when: () => !!liveThief(),
      text: t('泥棒だ！赤く光っているヒーローは泥棒。品を持って逃げる前にタップで捕まえて！', 'A thief! Heroes glowing red are thieves. Tap them before they run off with an item!'),
      target: () => {
        const a = liveThief();
        return a ? sceneBox(a.x - 44, a.y - HERO_PX - 16, a.x + 44, a.y + 12) : null;
      },
      done: () => !liveThief(),
    },
    {
      id: 'pest',
      place: 'day',
      when: () => (shop?.pestList.length ?? 0) > 0,
      text: t('工房にエネミーが入り込んだ！いる間はクラフトが遅くなるよ。タップで追い払おう！', 'An enemy got into the workshop! It slows crafting while it stays. Tap it to chase it off!'),
      target: () => {
        const p = shop?.pestList[0];
        return p ? sceneBox(p.x - 40, p.y - 70, p.x + 40, p.y + 10) : null;
      },
      done: () => (shop?.pestList.length ?? 0) === 0,
    },
  ],
  staffFrames.mine[0].image,
  () => writeSave(save),
);

function liveThief() {
  return shop?.actors.find((a) => a.kind === 'thief' && a.state !== 'caught' && !a.gone && !(a.style?.disguise && (a.state === 'enter' || a.state === 'toShelf')));
}

const modalRoot = h('div.modal-root');
const app = document.getElementById('app')!;
// The home screen (full screen, under the dialogs).
const homeRoot = h('div.home', { role: 'main' });
homeRoot.hidden = true;
app.append(topbar, stage, tree.root, homeRoot, modalRoot);

// ------------------------------------------------------------------ state

let shop: Shop | null = null;
let paused = true;
let potClicks = 0;
let lastQueueTip = -99;
let modalOpen = 0;
let registerClicks = 0;
/** Which screen is up, for the tutorial. */
let place: Place | null = null;

function updateTopbar(): void {
  gumText.textContent = fmt(save.gum);
  dustText.textContent = fmt(save.resources.dust);
  const stats = computeStats(save.levels);
  dustBox.hidden = save.resources.dust <= 0 && stats.dismantleRarity < 0;
  researchText.textContent = fmt(save.resources.research);
  researchBox.hidden = save.resources.research <= 0 && stats.researchRate <= 0;
  emblemText.textContent = fmt(save.resources.emblem);
  emblemBox.hidden = save.resources.emblem <= 0 && save.achievements.length === 0;
  cpText.textContent = fmt(save.prestige.cp);
  cpBox.hidden = save.prestige.cp <= 0 && save.prestige.runs === 0;
  dayText.textContent = save.prestige.runs > 0 ? t(`${save.prestige.runs + 1}周目 Day ${save.day}`, `Run ${save.prestige.runs + 1} · Day ${save.day}`) : `Day ${save.day}`;
  bgmBtn.classList.toggle('off', !save.settings.bgm);
  seBtn.classList.toggle('off', !save.settings.se);
}

function toggleSetting(key: 'bgm' | 'se'): void {
  sound.unlock();
  save.settings[key] = !save.settings[key];
  if (key === 'bgm') sound.setBgm(save.settings.bgm);
  else sound.seOn = save.settings.se;
  writeSave(save);
  updateTopbar();
}

function applyOverlays(keys: string[]): void {
  for (const [key, el] of overlayEls) {
    const on = keys.includes(key);
    if (on && !el.getAttribute('src')) el.src = assetUrl(workshopImages[key]);
    el.hidden = !on;
  }
}

let naviHideTimer = 0;
function say(text: string): void {
  naviText.textContent = text;
  naviToast.hidden = false;
  naviToast.classList.remove('show');
  void naviToast.offsetWidth;
  naviToast.classList.add('show');
  window.clearTimeout(naviHideTimer);
  naviHideTimer = window.setTimeout(() => (naviToast.hidden = true), 3500 + text.length * 70);
  log(h('span.navi-log', {}, t('マインちゃん：', 'Mine-chan: '), text));
}

/** Shows a Mine-chan tip once per save. */
function tip(key: string, text: string): boolean {
  // One voice at a time: a tip waits (and comes back later) while the tutorial is talking.
  if (save.tips.includes(key) || tutorial.showing) return false;
  save.tips.push(key);
  say(text);
  return true;
}

function log(html: HTMLElement | string, cls = ''): void {
  const li = h('li', { class: cls });
  li.append(html);
  logList.prepend(li);
  while (logList.children.length > 30) logList.lastChild?.remove();
}

/** Play time as "1時間23分" / "1h 23m". */
const hoursMinutes = (sec: number) => t(`${Math.floor(sec / 3600)}時間${Math.floor((sec % 3600) / 60)}分`, `${Math.floor(sec / 3600)}h ${Math.floor((sec % 3600) / 60)}m`);

/** An item name coloured by rarity; editions get their own colour and a 【】 prefix. */
const extLabel = (code: number) => {
  const e = itemExt(code);
  const ed = EDITIONS[itemEdition(code)];
  return h('b', { style: `color:${ed.color || RARITY_COLOR[e.rarity]}` }, itemName(code));
};

// ------------------------------------------------------------------ modals

function openModal(title: string, body: HTMLElement, buttons: { label: string; primary?: boolean; onClick?: () => void }[], cls = ''): () => void {
  modalOpen++;
  const close = () => {
    if (!wrap.isConnected) return;
    wrap.remove();
    modalOpen--;
  };
  const wrap = h(
    'div.modal-backdrop',
    {},
    h(
      'div.modal',
      { class: `modal ${cls}`, role: 'dialog', 'aria-label': title },
      h('h2', {}, title),
      body,
      h(
        'div.modal-buttons',
        {},
        ...buttons.map((b) =>
          h(
            'button.btn',
            {
              class: b.primary ? 'btn btn-primary' : 'btn',
              onclick: () => {
                close();
                b.onClick?.();
              },
            },
            b.label,
          ),
        ),
      ),
    ),
  );
  modalRoot.append(wrap);
  return close;
}

/** In-day menu behind the gear icon. Opening it pauses the day (any open modal does). */
function openPauseMenu(): void {
  if (!shop || shop.over) return;
  const r = shop.report;
  const toggles = h(
    'div.pause-toggles',
    {},
    ...(['bgm', 'se'] as const).map((key) => {
      const btn = h('button.btn.toggle', { class: `btn toggle ${save.settings[key] ? '' : 'off'}` }, key === 'bgm' ? 'BGM' : 'SE');
      btn.addEventListener('click', () => {
        toggleSetting(key);
        btn.classList.toggle('off', !save.settings[key]);
      });
      return btn;
    }),
  );
  const logCopy = logList.cloneNode(true) as HTMLElement;
  const body = h(
    'div.pause',
    {},
    toggles,
    h('h3', {}, t(`Day ${save.day} 本日の成績`, `Day ${save.day}: today so far`)),
    h(
      'div.stat-grid',
      {},
      ...(
        [
          [t('売上', 'Sales'), `${fmt(r.revenue)} GUM`],
          [t('販売', 'Sold'), t(`${r.sold}個`, `${r.sold}`)],
          [t('来客', 'Customers'), t(`${r.customers}人`, `${r.customers}`)],
          [t('帰った客', 'Left unhappy'), t(`${r.lost}人`, `${r.lost}`)],
          [t('クラフト', 'Crafted'), t(`${r.crafted}個`, `${r.crafted}`)],
          [t('盗難 / 捕獲', 'Stolen / caught'), `${r.stolen} / ${r.caught}`],
        ] as [string, string][]
      ).map(([k, v]) => h('div.stat-row', {}, h('span', {}, k), h('b', {}, v))),
    ),
    ...(save.dailies.length ? [h('h3', {}, t('今日のデイリー依頼', 'Today\'s daily requests')), dailyList(r)] : []),
    ordersList(save),
    h('h3', {}, t('できごと', 'Events')),
    logCopy.children.length ? logCopy : h('p.muted', {}, t('まだ何も起きていません', 'Nothing has happened yet')),
  );
  openModal(t('一時停止中', 'Paused'), body, [
    { label: t('🏠 ホームへ', '🏠 Home'), onClick: () => showHome() },
    { label: t('📖 図鑑', '📖 Collection'), onClick: () => openCollection() },
    { label: t('🏆 ランキング', '🏆 Leaderboards'), onClick: () => openRanking() },
    { label: t('データ', 'Data'), onClick: () => openMenu() },
    { label: t('▶ 営業に戻る', '▶ Back to work'), primary: true },
  ]);
}

// ------------------------------------------------------------------ display & accessibility

/** Quality actually used (auto can drop to low for this session on a slow device). */
let autoLow = false;
function applyDisplaySettings(): void {
  const st = save.settings;
  setColorAssist(st.colorAssist);
  document.body.classList.toggle('color-assist', st.colorAssist);
  document.body.classList.toggle('reduce-motion', st.reduceMotion);
  confettiSettings.enabled = !st.reduceMotion;
  renderer.quality = st.quality === 'low' || (st.quality === 'auto' && autoLow) ? 'low' : 'high';
}

/** Frame times while the day runs; a slow device switches to low quality (auto only). */
const frameSamples: number[] = [];
function watchFrameRate(dt: number): void {
  if (save.settings.quality !== 'auto' || autoLow) return;
  frameSamples.push(dt);
  if (frameSamples.length < 120) return;
  const avg = frameSamples.reduce((a, b) => a + b, 0) / frameSamples.length;
  frameSamples.length = 0;
  if (avg > 1 / 36) {
    autoLow = true;
    applyDisplaySettings();
  }
}

/** Events shown on screen as well as heard: always while sound effects are off, or when asked. */
function alertOnScreen(text: string, kind: 'bad' | 'good' | 'rare' = 'bad'): void {
  if (save.settings.se && !save.settings.alerts) return;
  const chip = h('div.alert-chip', { class: `alert-chip ${kind}`, role: 'status' }, text);
  scene.append(chip);
  scene.classList.remove('alert-bad', 'alert-good', 'alert-rare');
  void scene.offsetWidth;
  scene.classList.add(`alert-${kind}`);
  window.setTimeout(() => chip.remove(), 1800);
}

/** Settings rows for the menu: quality, color vision, motion, on-screen alerts. */
function displaySettings(): HTMLElement {
  const toggle = (key: 'colorAssist' | 'reduceMotion' | 'alerts', label: string) => {
    const btn = h('button.btn.small.toggle', { 'aria-pressed': String(save.settings[key]) }, save.settings[key] ? 'ON' : 'OFF') as HTMLButtonElement;
    const sync = () => {
      btn.textContent = save.settings[key] ? 'ON' : 'OFF';
      btn.classList.toggle('off', !save.settings[key]);
      btn.setAttribute('aria-pressed', String(save.settings[key]));
    };
    btn.addEventListener('click', () => {
      save.settings[key] = !save.settings[key];
      applyDisplaySettings();
      writeSave(save);
      sync();
    });
    sync();
    return h('div.menu-sound', {}, h('span', {}, label), btn);
  };
  const QUALITY = { auto: t('自動', 'Auto'), high: t('高', 'High'), low: t('低（軽い）', 'Low (light)') } as const;
  const qBtn = h('button.btn.small', {}) as HTMLButtonElement;
  const syncQ = () => (qBtn.textContent = QUALITY[save.settings.quality] + (save.settings.quality === 'auto' && autoLow ? t('：低', ': low') : ''));
  qBtn.addEventListener('click', () => {
    const order = ['auto', 'high', 'low'] as const;
    save.settings.quality = order[(order.indexOf(save.settings.quality) + 1) % order.length];
    autoLow = false;
    applyDisplaySettings();
    writeSave(save);
    syncQ();
  });
  syncQ();
  return h(
    'div.menu-display',
    {},
    h('div.menu-sound', {}, h('span', {}, t('画質', 'Graphics')), qBtn),
    toggle('colorAssist', t('色覚サポート（レア度の色と文字）', 'Color-vision support (rarity colors & letters)')),
    toggle('reduceMotion', t('動きを減らす（紙吹雪・アニメーション）', 'Reduce motion (confetti, animations)')),
    toggle('alerts', t('できごとを画面にも表示（効果音オフ時は常に表示）', 'Show events on screen (always when sound effects are off)')),
  );
}

/** 日本語 / English switch (reloads the page in the other language). */
function langSwitch(): HTMLElement {
  const opt = (code: 'ja' | 'en', label: string) =>
    h('button.btn.small.toggle', { class: `btn small toggle ${lang === code ? '' : 'off'}`, 'aria-pressed': String(lang === code), onclick: () => lang !== code && (writeSave(save), setLang(code)) }, label);
  return h('div.menu-sound', {}, h('span', {}, t('言語 / Language', 'Language / 言語')), opt('ja', '日本語'), opt('en', 'English')); // i18n-ja
}

/** The 番頭 on/off switch (the menu). */
function autoBuyBtn(): HTMLElement {
  const btn = h('button.btn.small.toggle', {}, 'ON') as HTMLButtonElement;
  const sync = () => {
    btn.classList.toggle('off', !save.settings.autoBuy);
    btn.textContent = save.settings.autoBuy ? 'ON' : 'OFF';
  };
  btn.addEventListener('click', () => {
    save.settings.autoBuy = !save.settings.autoBuy;
    writeSave(save);
    sync();
  });
  sync();
  return btn;
}

function openStats(): void {
  openModal(t('統計', 'Statistics'), statsView(save), [{ label: t('閉じる', 'Close') }], 'wide');
}

/** ランド移転 (after the clear): choose a land, confirm, start the next run. */
function openRelocate(): void {
  if (computeStats(save.levels).cleared <= 0) return;
  const close = openModal(
    t('ランド移転', 'Relocation'),
    relocateView(save, (land) => {
      close();
      // A day still open is left behind: the workshop moves.
      shop = null;
      const record = relocate(save, land);
      writeSave(save);
      sound.play('helper');
      confetti(2500);
      const home = lands.find((l) => l.key === land)!;
      openModal(
        t(`${home.name} へ移転した！`, `Moved to ${home.name}!`),
        h(
          'div.gold-chest',
          {},
          icon(home.cryptid, 'px'),
          h('p', {}, t(`${record.run}周目の工房は伝説となり、Cp +${fmt(record.cp)} を手に入れた。${home.name}のクリプタイドが新しい工房を見守っている。`, `Your run-${record.run} workshop became a legend and earned Cp +${fmt(record.cp)}. The ${home.name} cryptid watches over the new workshop.`)),
          h('p.muted', {}, t('スキルツリー右下の「移転」ブランチで Cp を使おう。', 'Spend Cp in the Relocation branch at the bottom right of the skill tree.')),
        ),
        [{ label: t(`${record.run + 1}周目を始める`, `Start run ${record.run + 1}`), primary: true, onClick: () => showTree() }],
        'gold-chest-modal',
      );
      tree.refresh();
      updateTopbar();
    }),
    [{ label: t('やめる', 'Cancel') }],
    'wide',
  );
}

function openRanking(): void {
  openModal(t('🏆 ランキング', '🏆 Leaderboards'), rankingView(save, () => writeSave(save)), [{ label: t('閉じる', 'Close') }], 'wide');
}

/** Sends the records to the leaderboards (joined players only; failures are silent). */
function sendRanking(lastDay = 0): void {
  submitRanking(save, lastDay).catch(() => undefined);
}

function openCollection(): void {
  openModal(t('図鑑', 'Collection'), collectionView(save), [{ label: t('閉じる', 'Close') }], 'wide');
}

/** The menu (the home screen's 設定 opens it without the in-game actions). */
function openMenu(fromHome = false): void {
  // Sound toggles live here too: the topbar hides them on narrow screens.
  const soundBtn = (key: 'bgm' | 'se', label: string) => {
    const btn = h('button.btn.small.toggle', {}, label) as HTMLButtonElement;
    const sync = () => btn.classList.toggle('off', !save.settings[key]);
    btn.addEventListener('click', () => {
      toggleSetting(key);
      sync();
    });
    sync();
    return btn;
  };
  const body = h(
    'div.menu',
    {},
    h('div.menu-sound', {}, h('span', {}, t('サウンド', 'Sound')), soundBtn('bgm', 'BGM'), soundBtn('se', 'SE')),
    langSwitch(),
    displaySettings(),
    computeStats(save.levels).autoBuyer > 0 ? h('div.menu-sound', {}, h('span', {}, t('番頭の自動習得', 'Head clerk auto-buy')), autoBuyBtn()) : null,
    h(
      'div.menu-actions',
      {},
      fromHome ? null : h('button.btn.small', { onclick: () => (closeMenu(), showHome()) }, t('🏠 ホームへ', '🏠 Home')),
      h('button.btn.small', { onclick: () => openStats() }, t('📊 統計・周回の記録', '📊 Statistics & runs')),
      fromHome ? null : h('button.btn.small', { onclick: () => openRanking() }, t('🏆 ランキング', '🏆 Leaderboards')),
      !fromHome && computeStats(save.levels).cleared > 0 ? h('button.btn.small', { onclick: () => openRelocate() }, t('🧭 ランド移転', '🧭 Relocate')) : null,
    ),
    h('p', {}, t('累計成績', 'Lifetime stats')),
    h(
      'div.stat-grid',
      {},
      ...(
        [
          [t('累計売上', 'Total sales'), `${fmt(save.totals.revenue)} GUM`],
          [t('販売数', 'Items sold'), save.totals.sold],
          [t('来客数', 'Customers'), save.totals.customers],
          [t('クラフト数', 'Items crafted'), save.totals.crafted],
          [t('捕まえた泥棒', 'Thieves caught'), save.totals.caught],
          [t('盗まれた数', 'Items stolen'), save.totals.stolen],
          [t('最高日商', 'Best day'), `${fmt(save.bestDayRevenue)} GUM`],
          [t('プレイ時間', 'Play time'), hoursMinutes(save.meta.playSeconds)],
        ] as [string, string | number][]
      ).map(([k, v]) => h('div.stat-row', {}, h('span', {}, k), h('b', {}, String(v)))),
    ),
    h('p', {}, t(`実績（${save.achievements.length} / ${ACHIEVEMENTS.length}）`, `Achievements (${save.achievements.length} / ${ACHIEVEMENTS.length})`)),
    achievementList(),
    saveTransfer(),
    credits(),
  );
  const closeMenu = openModal(fromHome ? t('設定', 'Settings') : t('メニュー', 'Menu'), body, [{ label: t('閉じる', 'Close') }]);
}

/** Today's (or the next day's) requests, with progress when a day report is given. */
function dailyList(r?: DayReport): HTMLElement {
  return h(
    'div.daily-list',
    {},
    ...save.dailies.map((d) => {
      const v = r ? Math.min(d.target, dailyValue(d.kind, r)) : 0;
      const done = d.done || (r ? v >= d.target : false);
      return h('div.daily-row', { class: `daily-row ${done ? 'done' : ''}` }, h('span', {}, dailyLabel(d)), h('b', {}, done ? '✓' : r ? `${fmt(v)} / ${fmt(d.target)}` : t(`エンブレム +1`, `Emblem +1`)));
    }),
    h('small.muted', {}, t(`3つすべて達成でエンブレム +${DAILY_BONUS}`, `All three: Emblems +${DAILY_BONUS}`)),
  );
}

/** Achievements with progress bars. */
function achievementList(): HTMLElement {
  return h(
    'div.achievement-list',
    {},
    ...ACHIEVEMENTS.map((a) => {
      const [v, target] = a.progress(save);
      const done = save.achievements.includes(a.id);
      return h(
        'div.achievement',
        { class: `achievement ${done ? 'done' : ''}` },
        h('b', {}, a.name),
        h('span', {}, a.desc),
        h('div.achievement-bar', {}, h('div', { style: `width:${Math.min(100, (v / target) * 100)}%` })),
        h('small', {}, done ? t('達成', 'Done') : t(`エンブレム ${a.emblem}`, `Emblems ${a.emblem}`)),
      );
    }),
  );
}

/** Export / import of the save as a copy-pasteable code (for moving between devices or backups). */
function saveTransfer(): HTMLElement {
  const out = h('textarea.save-code', { readonly: true, rows: 3, 'aria-label': t('セーブコード', 'Save code'), id: 'save-export' }) as HTMLTextAreaElement;
  const copyBtn = h('button.btn.small', {}, t('コードを表示してコピー', 'Show and copy the code'));
  copyBtn.addEventListener('click', () => {
    writeSave(save);
    out.value = exportCode(save);
    out.hidden = false;
    out.select();
    navigator.clipboard?.writeText(out.value).then(
      () => (copyBtn.textContent = t('コピーしました', 'Copied')),
      () => (copyBtn.textContent = t('選択中のコードをコピーしてください', 'Copy the selected code')),
    );
  });
  out.hidden = true;

  const input = h('textarea.save-code', { rows: 3, placeholder: t('MCW: で始まるセーブコードを貼り付け', 'Paste a save code starting with MCW:'), 'aria-label': t('読み込むセーブコード', 'Save code to load'), id: 'save-import' }) as HTMLTextAreaElement;
  const msg = h('p.save-msg');
  const loadBtn = h('button.btn.small', {}, t('このコードを読み込む', 'Load this code'));
  loadBtn.addEventListener('click', () => {
    try {
      const data = importCode(input.value);
      if (loadBtn.dataset.armed !== '1') {
        loadBtn.dataset.armed = '1';
        loadBtn.textContent = t('今のデータを上書きします。もう一度押すと読み込み', 'This overwrites your current data. Press again to load');
        msg.textContent = t(`読み込むデータ: Day ${data.day}・${fmt(data.gum)} GUM`, `Data to load: Day ${data.day} · ${fmt(data.gum)} GUM`);
        msg.className = 'save-msg';
        return;
      }
      resetting = true;
      writeSave(data);
      location.reload();
    } catch (err) {
      msg.textContent = err instanceof SaveError ? err.message : t('セーブコードを読み込めませんでした', 'Could not load the save code');
      msg.className = 'save-msg error';
      loadBtn.dataset.armed = '';
      loadBtn.textContent = t('このコードを読み込む', 'Load this code');
    }
  });
  // The same code as a file: download it, or pick one to fill the box above (then confirm as usual).
  const fileBtn = h('button.btn.small', {}, t('ファイルに保存', 'Save to file'));
  fileBtn.addEventListener('click', () => {
    writeSave(save);
    const url = URL.createObjectURL(new Blob([exportCode(save)], { type: 'text/plain' }));
    const a = h('a', { href: url, download: `mycryptoworkshop-day${save.day}.mcwsave` }) as HTMLAnchorElement;
    document.body.append(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
  const picker = h('input', { type: 'file', accept: '.mcwsave,.txt,text/plain', hidden: true, 'aria-label': t('セーブファイル', 'Save file') }) as HTMLInputElement;
  picker.addEventListener('change', () => {
    const file = picker.files?.[0];
    if (!file) return;
    void file.text().then((text) => {
      input.value = text.trim();
      loadBtn.dataset.armed = '';
      loadBtn.click();
    });
    picker.value = '';
  });
  const pickBtn = h('button.btn.small', { onclick: () => picker.click() }, t('ファイルから読み込む', 'Load from file'));
  return h(
    'div.save-transfer',
    {},
    h('p', {}, t('セーブデータの引き継ぎ', 'Transfer save data')),
    h('div.save-row', {}, copyBtn, fileBtn, pickBtn, picker),
    out,
    input,
    h('div.save-row', {}, loadBtn),
    msg,
  );
}

function credits(): HTMLElement {
  return h(
    'p.credits',
    {},
    t(
      '素材: My Crypto Heroes（© MCH Co.,Ltd.）のヒーロー・エクステンション・エネミー・背景・サウンドを ',
      'An unofficial fan work using My Crypto Heroes (© MCH Co.,Ltd.) heroes, extensions, enemies, backgrounds and sounds via ',
    ),
    h('a', { href: 'https://github.com/bearko/mycryptoheroes', target: '_blank', rel: 'noopener' }, 'bearko/mycryptoheroes'),
    t(
      ' 経由で使用した非公式の二次創作です。クリスくん／マインちゃん ドット絵：こじもこ、マイクリくん 原画：こはる／ドット絵：こじもこ。紙吹雪とカットインの演出は同リポジトリの実装（MIT License）を移植しています。',
      '. Chris-kun / Mine-chan pixel art: Kojimoko; Maycri-kun original art: Koharu, pixel art: Kojimoko. The confetti and cut-in effects are ported from that repository (MIT License).',
    ),
  );
}

// ------------------------------------------------------------------ home

let homeAnim = 0;
/** Where the player was when they went home (Play goes back there). */
let homeFrom: Place | null = null;

/** The home screen: play, settings, leaderboards, quit, and reset (bottom left). */
function showHome(): void {
  if (place) homeFrom = place;
  place = null;
  paused = true;
  const hasProgress = save.day > 1 || save.prestige.runs > 0;
  const mine = fileImg(staffFrames.mine[0].image, 'px home-mine');
  let f = 0;
  window.clearInterval(homeAnim);
  homeAnim = window.setInterval(() => {
    f = (f + 1) % staffFrames.mine.length;
    mine.src = assetUrl(staffFrames.mine[f].image);
  }, 300);
  const button = (label: string, onclick: () => void, cls = '') => h(`button.btn.home-btn${cls}`, { onclick }, label);
  homeRoot.replaceChildren(
    h('div.home-bg', {}, icon(workshopImages.workshop_base, 'home-bg-img')),
    h(
      'div.home-main',
      {},
      h('h1.home-logo', {}, 'My Crypto Workshop', h('small', {}, t('マイクリ クラフト工房', 'A crafting shop in the world of My Crypto Heroes'))),
      mine,
      h(
        'nav.home-menu',
        { 'aria-label': t('ホーム', 'Home') },
        button(t('▶ プレイする', '▶ Play'), playFromHome, '.btn-primary.home-play'),
        hasProgress ? h('p.home-save', {}, t(`Day ${save.day}・所持 ${fmt(save.gum)} GUM`, `Day ${save.day} · ${fmt(save.gum)} GUM`)) : null,
        button(t('⚙ 設定', '⚙ Settings'), () => openMenu(true)),
        button(t('🏆 ランキング', '🏆 Leaderboards'), () => openRanking()),
        button(t('終了する', 'Quit'), quitGame),
      ),
    ),
    h('button.btn.small.danger.home-reset', { onclick: () => openReset() }, t('リセット', 'Reset')),
    h('p.home-credit', {}, t('非公式の二次創作です（素材 © MCH Co.,Ltd.）', 'An unofficial fan work (assets © MCH Co.,Ltd.)')),
  );
  homeRoot.hidden = false;
  document.body.classList.add('at-home');
}

function leaveHome(): void {
  window.clearInterval(homeAnim);
  homeRoot.hidden = true;
  document.body.classList.remove('at-home');
}

function playFromHome(): void {
  sound.unlock();
  leaveHome();
  const from = homeFrom;
  homeFrom = null;
  if (from === 'tree') showTree();
  else if (shop || save.day > 1 || save.prestige.runs > 0) showShop();
  else startDay();
}

/** Saves and closes the window; a browser tab can't be closed by the page, so it says goodbye instead. */
function quitGame(): void {
  writeSave(save);
  window.clearInterval(homeAnim);
  window.close();
  window.setTimeout(() => {
    if (window.closed) return;
    homeRoot.replaceChildren(
      h('div.home-bg', {}, icon(workshopImages.workshop_base, 'home-bg-img')),
      h(
        'div.home-main.home-end',
        {},
        fileImg(staffFrames.mine[0].image, 'px home-mine'),
        h('h2', {}, t('おつかれさまでした！', 'Thanks for playing!')),
        h('p', {}, t('セーブしました。このタブ（またはアプリ）を閉じると終了します。', 'Your game is saved. Close this tab (or app) to quit.')),
        h('button.btn.home-btn', { onclick: () => showHome() }, t('ホームに戻る', 'Back to home')),
      ),
    );
  }, 300);
}

/** リセット: erases the progress and starts over (settings and the leaderboard entry stay). */
function openReset(): void {
  const confirm = h('button.btn.danger', {}, t('リセットする', 'Reset')) as HTMLButtonElement;
  confirm.addEventListener('click', () => {
    // Two presses (window.confirm is unavailable in some embeds).
    if (confirm.dataset.armed !== '1') {
      confirm.dataset.armed = '1';
      confirm.textContent = t('もう一度押すとセーブデータを消します', 'Press again to erase your save');
      return;
    }
    resetting = true;
    const fresh = newSave();
    fresh.settings = save.settings;
    // Same player on the leaderboards; the records there are kept (each board keeps the best).
    fresh.ranking = { ...save.ranking, day30: null };
    writeSave(fresh);
    location.reload();
  });
  openModal(
    t('リセット', 'Reset'),
    h(
      'div.reset',
      {},
      h('p', {}, t('セーブデータを消して、Day 1 から始めます。スキル・GUM・図鑑・実績・周回の記録はすべて消え、元に戻せません。', 'Erase your save and start again from Day 1. Skills, GUM, the collection, achievements and run history are all lost, and this cannot be undone.')),
      h('p.muted', {}, t('残るもの: 設定（サウンド・言語・表示）、ランキングの参加情報と登録済みの記録', 'Kept: settings (sound, language, display) and your leaderboard entry and records')),
      confirm,
    ),
    [{ label: t('キャンセル', 'Cancel') }],
  );
}

function showResults(report: DayReport, auto: SkillNode[] = []): void {
  const rows: [string, string | number, string?][] = [
    [t('来客', 'Customers'), t(`${report.customers}人`, `${report.customers}`)],
    [t('販売', 'Sold'), t(`${report.sold}個`, `${report.sold}`)],
    [t('帰ってしまった客', 'Left unhappy'), t(`${report.lost}人`, `${report.lost}`), report.lost ? 'bad' : ''],
    [t('クラフト', 'Crafted'), t(`${report.crafted}個`, `${report.crafted}`)],
  ];
  if (report.day >= 2) rows.push([t('捕まえた泥棒', 'Thieves caught'), t(`${report.caught}人`, `${report.caught}`)], [t('盗まれた商品', 'Items stolen'), t(`${report.stolen}個`, `${report.stolen}`), report.stolen ? 'bad' : '']);
  if (report.day >= 3) rows.push([t('退治したエネミー', 'Enemies chased off'), t(`${report.pests}体`, `${report.pests}`)]);
  const extras: [ExtraSource, string][] = [
    ['bar', t('ポーションバー', 'Potion bar')],
    ['trial', t('試し斬り', 'Test-cutting range')],
    ['market', t('マーケット', 'Market')],
    ['peddler', t('行商', 'Peddling')],
    ['bonus', t('会計係のボーナス', 'Accountant\'s bonus')],
    ['chest', t('宝箱', 'Treasure chests')],
    ['coin', t('拾ったコイン', 'Coins picked up')],
    ['merchant', t('商人への売却', 'Sold to the merchant')],
    ['raid', t('海賊の懸賞金', 'Pirate bounties')],
  ];
  for (const [key, label] of extras) if (report.extras[key] > 0) rows.push([label, `+${fmt(report.extras[key])}`]);
  if (report.research > 0) rows.push([t('研究ポイント', 'Research points'), `+${report.research}`]);
  if (report.guests > 0) rows.push([t('乗り物で来た客', 'Customers by vehicle'), t(`${report.guests}人`, `${report.guests}`)]);
  if (report.newHeroes.length > 0) rows.push([t('初めて買ってくれたヒーロー', 'New heroes who bought'), t(`${report.newHeroes.length}人`, `${report.newHeroes.length}`)]);
  if (report.ordersDone > 0) rows.push([t('届けた注文', 'Orders delivered'), t(`${report.ordersDone}件`, `${report.ordersDone}`)]);
  if (report.dust > 0) rows.push([t('分解で得たダスト', 'Dust from dismantling'), fmt(report.dust)]);
  if (report.donated > 0) rows.push([t('寄付した品', 'Items donated'), t(`${report.donated}個`, `${report.donated}`)], [t('名声', 'Fame'), `+${fmt(report.fame)}`]);
  if (report.raid) rows.push([t('海賊を撃退', 'Pirates repelled'), t(`${report.raid.caught} / ${report.raid.pirates}人`, `${report.raid.caught} / ${report.raid.pirates}`), report.raid.won ? '' : 'bad']);
  const gemsGot = Object.values(report.gems).reduce((a, b) => a + (b ?? 0), 0);
  if (gemsGot > 0) rows.push([t('分解で得た魔石', 'Stones from dismantling'), t(`${gemsGot}個`, `${gemsGot}`)]);
  const body = h(
    'div.results',
    {},
    h('div.results-hero', {}, icon(staffFrames.chrisCheer, 'px results-chris'), h('div', {}, h('div.results-label', {}, t('本日の売上', 'Today\'s sales')), h('div.results-revenue', {}, icon(icons.gum, 'px'), fmt(report.revenue)))),
    h('div.stat-grid', {}, ...rows.map(([k, v, c]) => h('div.stat-row', { class: `stat-row ${c ?? ''}` }, h('span', {}, k), h('b', {}, String(v))))),
    report.bestSale
      ? h(
          'p.best-sale',
          {},
          ...(isEn
            ? ['Best sale: ', h('b', {}, report.bestSale.hero), ' bought ', extLabel(report.bestSale.item), ` for ${fmt(report.bestSale.price)} GUM`]
            : ['最高額: ', h('b', {}, report.bestSale.hero), ' が ', extLabel(report.bestSale.item), ` を ${fmt(report.bestSale.price)} GUM で購入`]), // i18n-ja
        )
      : null,
    report.sets.length ? h('p.best-sale', {}, t('🏆 コンプリート達成: ', '🏆 Set complete: '), h('b', {}, report.sets.join(t('・', ', ')))) : null,
    report.achievements.length ? h('p.best-sale', {}, t('🎖️ 実績: ', '🎖️ Achievements: '), h('b', {}, report.achievements.join(t('・', ', ')))) : null,
    report.dailyEmblems > 0 ? h('p.best-sale', {}, t(`デイリー依頼を達成！ エンブレム +${report.dailyEmblems}`, `Daily requests done! Emblems +${report.dailyEmblems}`)) : null,
    report.raid?.won ? h('p.best-sale', {}, t(`☠ 黒髭海賊団を完全撃退！ エンブレム +${report.raid.emblems}`, `☠ Blackbeard's pirates fully repelled! Emblems +${report.raid.emblems}`)) : null,
    auto.length
      ? h(
          'p.best-sale',
          {},
          t(`番頭が ${auto.length} 件習得: `, `The head clerk learned ${auto.length}: `),
          h('b', {}, [...new Set(auto.map((n) => n.name))].slice(0, 6).join(t('・', ', ')) + (new Set(auto.map((n) => n.name)).size > 6 ? t(' ほか', ' and more') : '')),
        )
      : null,
    report.newEntries.length
      ? h('div.new-entries', {}, h('div', {}, t(`図鑑に新しく登録 (${report.newEntries.length})`, `New in the collection (${report.newEntries.length})`)), h('div.new-icons', {}, ...report.newEntries.map((id) => icon(getExtension(id).image, 'px'))))
      : null,
  );
  place = 'results';
  openModal(
    t(`Day ${report.day} 閉店`, `Day ${report.day}: closed`),
    body,
    [
      { label: t('ショップへ', 'To the shop'), onClick: () => showShop() },
      { label: t('スキルツリーへ', 'To the skill tree'), primary: true, onClick: () => showTree() },
    ],
    'results-modal',
  );
}

// ------------------------------------------------------------------ flow

/**
 * The skill tree. It can be opened at any time: an open business day waits (paused) and picks
 * up where it left off with the new skills; a day not yet opened is set up again on return.
 */
function showTree(): void {
  place = 'tree';
  if (shop && (!shop.started || shop.over)) shop = null;
  const dayOpen = !!shop;
  paused = true;
  endPress();
  stage.hidden = true;
  document.body.classList.remove('in-day');
  naviToast.hidden = true;
  tree.setDayOpen(dayOpen);
  tree.show();
  sound.playBgm('bgmTree');
  updateTopbar();
}

function buyNode(node: SkillNode): void {
  if (!buy(save, node)) return;
  sound.play(FACILITY_NODES.has(node.id) ? 'build' : 'unlock');
  writeSave(save);
  updateTopbar();
  if (node.id === 'goldenExtension') {
    // The clear time goes up right away.
    sendRanking();
    showEnding();
  }
}

/** The clear screen: the golden extension, and how the run went. */
function showEnding(): void {
  sound.play('win');
  confetti(6000);
  const played = save.meta.playSeconds;
  const rows: [string, string][] = [
    [t('営業日数', 'Days open'), t(`${save.day - 1}日`, `${save.day - 1}`)],
    [t('プレイ時間', 'Play time'), hoursMinutes(played)],
    [t('累計売上', 'Total sales'), `${fmt(save.totals.revenue)} GUM`],
    [t('販売数', 'Items sold'), t(`${fmt(save.totals.sold)}個`, `${fmt(save.totals.sold)}`)],
    [t('図鑑', 'Collection'), t(`${save.collection.length}種`, `${save.collection.length}`)],
    [t('出会ったヒーロー', 'Heroes met'), t(`${customers.filter((c) => (save.heroes[c.id] ?? 0) > 0).length}人`, `${customers.filter((c) => (save.heroes[c.id] ?? 0) > 0).length}`)],
    [t('実績', 'Achievements'), `${save.achievements.length} / ${ACHIEVEMENTS.length}`],
  ];
  openModal(
    t('伝説の工房', 'A Legendary Workshop'),
    h(
      'div.gold-chest',
      {},
      h('div.gold-chest-head', {}, '★ GAME CLEAR ★'),
      icon(series[0].items[4].image, 'px'),
      h('p', {}, t('黄金のエクステンションが完成した！あなたの工房は、マイクリの世界で伝説として語り継がれるだろう。', 'The golden extension is done! Your workshop will be told as a legend across the world of My Crypto Heroes.')),
      h('div.stat-grid', {}, ...rows.map(([k, v]) => h('div.stat-row', {}, h('span', {}, k), h('b', {}, v)))),
      h('p.muted', {}, t('このまま営業を続けることも、工房を新しいランドへ移転して 2 周目を始めることもできます（スキルツリーの「ランド移転」から）。', 'You can keep running the shop, or move the workshop to a new land and start run 2 (from "Relocate" in the skill tree).')),
      credits(),
    ),
    [{ label: t('ランド移転へ', 'Relocate'), primary: true, onClick: () => openRelocate() }, { label: t('営業を続ける', 'Keep going') }],
    'gold-chest-modal',
  );
}

/**
 * The shop screen: the open day (resumed, with skills bought meanwhile applied), or the
 * storefront of the next day, waiting for the open button.
 */
function showShop(): void {
  place = 'day';
  tree.hide();
  document.body.classList.add('in-day');
  stage.hidden = false;
  if (shop && shop.started && !shop.over) {
    fitScene(false);
    shop.applyLevels();
    applyOverlays(shop.stats.overlays);
    sound.playBgm(shop.raid.active ? 'bgmRaid' : 'bgmShop');
  } else {
    prepareDay();
    sound.playBgm('bgmShop');
  }
  paused = false;
  updateOpenCard();
  updateTopbar();
}

/** Sets up the next business day, closed until the open button. */
/** Party heroes who have used their skill today (their first one gets the cut-in). */
const partyIntroduced = new Set<number>();

function prepareDay(): void {
  logList.replaceChildren();
  partyIntroduced.clear();
  fitScene(true);
  shop = new Shop(save, Math.random, { waitToOpen: true });
  shop.on(onShopEvent);
  applyOverlays(shop.stats.overlays);
}

function updateOpenCard(): void {
  const waiting = !!shop && !shop.started;
  openCard.hidden = !waiting;
  if (!waiting) return;
  const c = save.forecast;
  openInfo.replaceChildren(h('b', {}, `Day ${save.day}`), ' ', conditionLabel(c), h('br'), h('small', {}, CONDITIONS[c.kind].desc));
  const extras = [ordersList(save), dailiesList(save)].filter((e): e is HTMLElement => !!e);
  openExtras.replaceChildren(...extras);
  openExtras.hidden = !extras.length;
  openDayBtn.textContent = t(`▶ Day ${save.day} 開店する`, `▶ Open for Day ${save.day}`);
  const strip = partyStrip(save);
  openParty.hidden = !strip;
  if (strip) {
    openParty.replaceChildren(strip, h('button.btn.small.party-edit', { onclick: () => openPartyEditor() }, t('⚔ パーティ編成', '⚔ Party')));
    if (!save.party.length) tip('party', t('英雄の酒場ができたよ！スキルツリーの「英雄」でヒーローをスカウトして、開店前に「パーティ編成」でバルコニーに立ってもらおう', 'The tavern is open! Scout heroes in the Heroes branch of the skill tree, then put them on the balcony with "Party" before opening'));
  }
}

/** A scouted (or scoutable) hero's recipes: each series, what its recipe does, and whether it is learned. */
function openRecipes(heroId: number): void {
  const def = partyDef(heroId);
  if (!def) return;
  const hero = partyHero(heroId);
  const rows = taughtSeries(def).map((i) => {
    const s = series[i];
    const node = skillById.get(`recipe_${s.key}`);
    const learned = level(save.levels, `recipe_${s.key}`) > 0;
    return h(
      'div.recipe-row',
      { class: `recipe-row ${learned ? 'learned' : ''}` },
      icon(s.items[4].image, 'px recipe-icon'),
      h(
        'div',
        {},
        h('b', {}, s.name),
        node ? h('p', {}, node.desc) : null,
        h('div.recipe-items', {}, ...s.items.map((it) => icon(it.image, 'px', it.name))),
      ),
      h('span.recipe-state', {}, learned ? t('✓ 習得済み', '✓ Learned') : t('未習得', 'Not yet')),
    );
  });
  openModal(t(`${hero.name}が教えるレシピ`, `Recipes from ${hero.name}`), h('div.recipe-list', {}, ...rows), [{ label: t('閉じる', 'Close'), primary: true }]);
}

/** パーティ編成 (before opening): changes show on the balcony at once. */
function openPartyEditor(): void {
  openModal(
    t('パーティ編成', 'Party'),
    partyView(
      save,
      () => writeSave(save),
      () => {
        if (shop && !shop.started) shop.party.build();
        updateOpenCard();
      },
    ),
    [{ label: t('決定', 'Done'), primary: true }],
    'wide',
  );
}

/** New game (title): straight into day 1. */
function startDay(): void {
  showShop();
  openDay();
}

/** The open button: the day begins. */
function openDay(): void {
  if (!shop || shop.started) return;
  shop.start();
  registerClicks = 0;
  updateOpenCard();
  if (save.day <= 3 && tutorial.pending('day')) {
    // The tutorial introduces the first days.
  } else if (save.day === 1) {
    tip('welcome', t('いらっしゃいませ！ここはあなたのクラフト工房。魔法の壺をクリックするとクラフトが早くなるよ！', 'Welcome! This is your crafting workshop. Click the magic pot to craft faster!'));
  } else if (save.day === 2) {
    tip('thiefWarn', t('今日から泥棒が出るみたい…赤く光っているヒーローを見つけたらクリックで捕まえて！', 'Thieves may show up from today... If you see a hero glowing red, click to catch them!'));
  } else if (save.day === 3) {
    tip('pestWarn', t('工房にエネミーが入り込むことがあるよ。跳ね回るエネミーを見つけたらタップで追い払おう！', 'Enemies sometimes get into the workshop. Tap the bouncing enemies to chase them off!'));
  } else if (shop.staffMembers.length > 0 && !save.tips.includes('staff')) {
    tip('staff', t('スタッフが店で働いているよ！足元の名札で役割がわかるよ。ヒーローを雇うともっと頼もしくなる！', 'Your staff are at work! Their name tags show their jobs. Hire heroes to make them even better!'));
  } else if (shop.condition.kind !== 'sunny') {
    say(t(`Day ${save.day} 開店！今日は ${conditionLabel(shop.condition)}。${CONDITIONS[shop.condition.kind].desc}`, `Day ${save.day}: open! Today: ${conditionLabel(shop.condition)}. ${CONDITIONS[shop.condition.kind].desc}`));
  } else {
    say(t(`Day ${save.day} 開店！今日もがんばろう！`, `Day ${save.day}: open! Let's do our best today!`));
  }
}

const LOST_TEXT = {
  empty: t(' は品切れで帰ってしまった…', ' left: nothing on the shelves...'),
  queue: t(' は待ちきれず帰ってしまった…', ' got tired of waiting and left...'),
  mess: t(' は泥を踏んで怒って帰ってしまった…', ' stepped in mud and stormed off...'),
  scared: t(' はエネミーに驚いて逃げ帰ってしまった…', ' was scared off by an enemy...'),
};

/** Options can be chosen only after this long, so a tap meant for the shop does not pick one. */
const DECISION_ARM_MS = 600;

/**
 * The choice of a visitor the player tapped (the day is paused meanwhile). "Later" closes it
 * and the visitor waits again.
 */
function showDecision(d: Decision): void {
  let done = false;
  const buttons = d.options.map((o, i) => {
    const b = h('button.btn.decision-option', { onclick: () => choose(i) }, h('b', {}, o.label), h('small', {}, o.detail)) as HTMLButtonElement;
    b.disabled = true;
    return b;
  });
  const choose = (i: number) => {
    if (done) return;
    done = true;
    close();
    shop?.decide(i);
  };
  window.setTimeout(() => buttons.forEach((b) => (b.disabled = false)), DECISION_ARM_MS);
  const body = h('div.decision', {}, h('div.decision-head', {}, icon(d.image, 'px'), h('p.decision-text', {}, d.text)), ...buttons);
  const close = openModal(d.title, body, [{ label: t('あとで決める', 'Decide later'), onClick: () => ((done = true), shop?.deferDecision()) }], 'decision-modal');
}

/** The MCH gold-chest moment, for the first Epic / Legendary / 真 / golden edition. */
function goldChest(code: number): boolean {
  const ext = itemExt(code);
  const edition = itemEdition(code);
  const key = ext.shin ? 'firstShin' : edition === 4 ? 'firstGolden' : ext.rarityIndex === 4 ? 'firstLegendary' : ext.rarityIndex === 3 ? 'firstEpic' : null;
  if (!key || save.tips.includes(key)) return false;
  save.tips.push(key);
  sound.play('win');
  confetti(3000);
  openModal(
    'CONGRATULATIONS',
    h('div.gold-chest', {}, h('div.gold-chest-head', {}, '★ GOLD CHEST ★'), icon(ext.image, 'px'), h('p', {}, extLabel(code), t(' が完成！', ' is done!'))),
    [{ label: t('やった！', 'Hooray!'), primary: true }],
    'gold-chest-modal',
  );
  return true;
}

function onShopEvent(e: ShopEvent): void {
  switch (e.type) {
    case 'craft': {
      const ext = itemExt(e.item);
      const edition = itemEdition(e.item);
      goldChest(e.item);
      if (edition > 0 || ext.shin) {
        sound.play('rare');
        alertOnScreen(t('✨ エディション品！', '✨ Edition item!'), 'rare');
        log(h('span', {}, h('span.tag.edition', {}, ext.shin ? t('真', 'Shin') : EDITIONS[edition].name), ' ', extLabel(e.item), t(` が${LINES[e.line].name}で完成！`, ` finished in the ${LINES[e.line].name}!`)), 'rare');
        tip('edition', t('エディション付きの品ができたよ！鑑定済み・刻印入り…と、珍しいほど高く売れるんだ', 'You made an edition item! Appraised, Engraved... the rarer the edition, the higher the price'));
      } else if (e.isNew && ext.rarityIndex >= 2) {
        sound.play('rare');
        log(h('span', {}, h('span.tag.new', {}, 'NEW'), ` [${RARITY_JA[ext.rarity]}] `, extLabel(e.item), t(' が完成！', ' is done!')), 'rare');
      } else {
        sound.play(ext.rarityIndex >= 3 ? 'rare' : 'craft');
        if (e.isNew) log(h('span', {}, h('span.tag.new', {}, 'NEW'), ' ', extLabel(e.item), t(' が完成', ' is done')));
      }
      break;
    }
    case 'dismantle':
      tip('dismantle', t('置き場所がいっぱいの時は、分解炉が安い品をゴールドダストと魔石に変えてくれるよ！', 'When there\'s no room, the dismantler turns cheap items into gold dust and magic stones!'));
      break;
    case 'overheat':
      sound.play('fail');
      alertOnScreen(t(`🔥 ${LINES[e.line].name}が過熱！`, `🔥 ${LINES[e.line].name} overheated!`));
      log(h('span', {}, t(`${LINES[e.line].name}が過熱して止まった！（3秒）`, `The ${LINES[e.line].name} overheated and stopped! (3s)`)), 'bad');
      tip('overheat', t('熱くなりすぎて失敗しちゃった…長押しはゲージが赤くなる前に離そう！', 'It got too hot... Let go before the gauge turns red!'));
      break;
    case 'sale':
      sound.play('sale');
      log(h('span', {}, h('b', {}, e.hero.name), t(' が ', ' bought '), extLabel(e.item), t(' を購入 ', ' '), h('span.gum-text', {}, `+${fmt(e.price)}`), e.tip ? h('span.tag', {}, t('チップ', 'Tip')) : ''));
      break;
    case 'lost':
      sound.play('debuff');
      alertOnScreen(t('😢 お客さんが帰った', '😢 A customer left'));
      log(h('span', {}, h('b', {}, e.hero.name), LOST_TEXT[e.reason]), 'bad');
      if (e.reason === 'empty') tip('lostEmpty', t('棚が空っぽでお客さんが帰っちゃった…「壺の火力」でクラフトを早くしよう！', 'The shelves were empty and a customer left... Speed up crafting with "Pot Heat"!'));
      else tip('lostQueue', t('レジが混みすぎて帰っちゃった！カウンターをクリックして会計を手伝うか「クリスくん研修」を！', 'The line was too long and they left! Click the counter to help check out, or get "Train Chris-kun"!'));
      break;
    case 'thief':
      sound.play('debuff');
      alertOnScreen(t(`⚠ 泥棒 ${e.hero.name}！`, `⚠ Thief: ${e.hero.name}!`));
      log(h('span', {}, t('泥棒 ', 'Thief '), h('b.villain', {}, e.hero.name), t(` が現れた！（${e.style.trait}）`, ` appeared! (${e.style.trait})`)), 'bad');
      if (e.style.entry === 'ceiling') tip('ceiling', t('天井からロープで降りてくる泥棒もいるよ！上にも注意して！', 'Some thieves drop from the ceiling on a rope! Watch above too!'));
      else if (e.style.entry === 'window') tip('window', t('窓から飛び込んでくる泥棒だ！窓から逃げられる前にタップ！', 'A thief jumping in through the window! Tap before they escape the same way!'));
      else if (e.style.disguise) tip('disguise', t('お客さんのふりをした泥棒がいるみたい…商品に手を伸ばした瞬間を狙って！', 'A thief is posing as a customer... Catch them the moment they reach for an item!'));
      else if (e.style.hp > 1) tip('tough', t('しぶとい泥棒は何回かタップしないと捕まらないよ！', 'Tough thieves take several taps to catch!'));
      break;
    case 'thiefHit':
      sound.play('hit');
      break;
    case 'stolen':
      sound.play('fail');
      alertOnScreen(t('💢 盗まれた！', '💢 Stolen!'));
      log(h('span', {}, h('b.villain', {}, e.hero.name), t(' に ', ' stole '), extLabel(e.item), t(' を盗まれた！', '!')), 'bad');
      tip('stolen', t('盗まれちゃった…！赤く光る泥棒は逃げる前にクリック！「マイクリくん警備」も頼りになるよ', 'Something got stolen...! Click red-glowing thieves before they escape. "Maycri-kun on Guard" helps too'));
      break;
    case 'caught':
      sound.play('hit');
      log(
        h(
          'span',
          {},
          e.byGuard ? t(`${e.guard ?? 'マイクリくん'}が `, `${e.guard ?? 'Maycri-kun'} caught `) : t('', 'Caught '),
          h('b.villain', {}, e.hero.name),
          t(' を捕まえた！ 懸賞金 ', '! Bounty '),
          h('span.gum-text', {}, `+${fmt(e.bounty)}`),
        ),
        'good',
      );
      break;
    case 'pest':
      sound.play('debuff');
      alertOnScreen(t(`👾 工房にエネミー！`, `👾 Enemy in the workshop!`));
      log(h('span', {}, t('エネミー ', 'Enemy '), h('b.villain', {}, e.name), t(' が工房に入り込んだ！クラフト速度ダウン', ' got into the workshop! Crafting slows down')), 'bad');
      break;
    case 'pestCleared':
      sound.play('hit');
      log(h('span', {}, t('エネミーを追い払った！ ', 'Chased off an enemy! '), h('span.gum-text', {}, `+${fmt(e.reward)}`)), 'good');
      break;
    case 'mine':
      break;
    case 'orderDone':
      sound.play('rare');
      log(h('span', {}, h('b', {}, e.hero.name), t(' が注文の ', ' picked up their order: '), extLabel(e.item), t(' を受け取った！ ', '! '), h('span.gum-text', {}, `+${fmt(e.price)}`)), 'rare');
      break;
    case 'decision':
      // The visitor waits in the shop with a speech bubble; tapping them opens the choice.
      // The same flash-of-inspiration sound as a treasure chest.
      sound.play('rare');
      log(h('span', {}, h('b', {}, e.decision.title), t('（タップで話を聞く）', ' (tap to talk)')), 'rare');
      tip('decisionTap', t('吹き出しを出している人がいるよ！タップすると話を聞けるよ。しばらく放っておくと、いつもの返事をして帰っちゃう', 'Someone with a speech bubble wants to talk! Tap them to hear them out. Leave them for a while and they take the usual answer and go'));
      break;
    case 'decided':
      // MAI's help takes effect.
      if (e.kind === 'mai') sound.play('buff');
      log(h('span', {}, e.result), 'good');
      break;
    case 'visit':
      // They appear (the treasure-chest sound), then their skill takes effect with the cut-in.
      sound.play('rare');
      window.setTimeout(() => sound.play('buff'), 700);
      if (shop) cutin(scene, e.visit.image, e.visit.name, e.visit.skill, 'ally', e.visit.effect);
      log(
        h('span', {}, h('b', {}, e.visit.name), e.visit.kind === 'cryptid' ? t(' が現れた！', ' appeared! ') : t(' が来店！', ' is here! '), e.visit.effect),
        'rare',
      );
      break;
    case 'bespoke':
      log(h('span', {}, t('特注: ', 'Made to order: '), h('b', {}, e.hero.name), t(' に ', ' gets '), itemName(e.item), t(' を手渡した', '')), 'good');
      break;
    case 'settled':
      log(h('span', {}, h('b', {}, e.hero.name), t(' は代わりの品を買うことにした', ' settles for something else')));
      break;
    case 'partySkill':
      sound.play('buff');
      // The first skill of each hero in a day gets the cut-in; after that, their bubble on the balcony.
      if (shop && !partyIntroduced.has(e.hero.id)) {
        partyIntroduced.add(e.hero.id);
        cutin(scene, e.hero.image, e.hero.name, e.skill, 'ally', e.text);
      }
      log(h('span', {}, h('b', {}, e.hero.name), `「${e.skill}」 `, e.text), 'rare');
      break;
    case 'vehicle':
      sound.play('buff');
      const vehicle = ['', t('乗合馬車', 'stagecoach'), t('飛空艇', 'airship'), t('ランドゲート', 'land gate')][e.kind];
      log(h('span', {}, t(`${vehicle}で ${e.count} 人の団体客が到着！`, `A group of ${e.count} arrived by ${vehicle}!`)), 'good');
      break;
    case 'special':
      if (e.kind === 'owner') {
        sound.play('buff');
        log(h('span', {}, t('ランドオーナー ', 'Land owner '), h('b', {}, e.hero.name), t(' が来店！最高の品を高く買ってくれる', ' is here! They pay well for the best item')), 'rare');
      } else if (e.kind === 'collector') {
        log(h('span', {}, t('コレクター ', 'Collector '), h('b', {}, e.hero.name), t(' が探し物をしている', ' is looking for something')));
        tip('collector', t('吹き出しにシリーズを出しているのはコレクター客！そのシリーズを並べておくと 2 倍で買ってくれるよ', 'Customers showing a series in their bubble are collectors! Stock that series and they\'ll pay double'));
      } else if (e.kind === 'order') {
        log(h('span', {}, h('b', {}, e.hero.name), t(' が注文の品を受け取りに来た', ' came to pick up their order')), 'rare');
        tip('orderCome', t('注文したヒーローが来たよ！注文の品が棚にあれば高く買ってくれる。吹き出しの品を確認してね', 'A hero who ordered is here! If the ordered item is on the shelf, they pay a lot. Check their bubble'));
      } else if (e.kind === 'regular') {
        log(h('span', {}, t('常連客の ', 'Your regular '), h('b', {}, e.hero.name), t(' が来てくれた', ' dropped by')));
      }
      break;
    case 'chest':
      sound.play('rare');
      log(
        h('span', {}, t('宝箱を開けた！ ', 'Opened a chest! '), e.reward === 'gum' ? h('span.gum-text', {}, `+${fmt(e.amount)}`) : e.reward === 'dust' ? t(`ダスト +${e.amount}`, `Dust +${e.amount}`) : t(`魔石 +${e.amount}`, `Stones +${e.amount}`)),
        'good',
      );
      break;
    case 'storePest':
      sound.play('debuff');
      alertOnScreen(t('👾 店にエネミー！', '👾 Enemy in the shop!'));
      log(h('span', {}, t('エネミー ', 'Enemy '), h('b.villain', {}, e.name), t(' が店に入り込んだ！客が怖がっている', ' got into the shop! Customers are scared')), 'bad');
      tip('storePest', t('店にエネミーが！近くのお客さんが怖がって帰っちゃうよ。2回タップで追い払おう', 'An enemy in the shop! Nearby customers will get scared and leave. Tap twice to chase it off'));
      break;
    case 'storePestCleared':
      sound.play(e.by === 'cryptid' ? 'zap' : 'hit');
      log(h('span', {}, e.by === 'cryptid' ? t('クリプタイドの雷でエネミーを倒した！ ', "The cryptid's lightning struck an enemy down! ") : t('店のエネミーを追い払った！ ', 'Chased an enemy out of the shop! '), h('span.gum-text', {}, `+${fmt(e.reward)}`)), 'good');
      break;
    case 'mess':
      if (e.kind === 'mud') tip('mud', t('雨の日はお客さんが泥を持ち込むよ。踏んだお客さんは怒って帰ることも…タップで掃除しよう！', 'On rainy days customers track in mud. Anyone who steps in it may leave angry... Tap to clean it!'));
      else tip('litter', t('宝箱の箱が散らかっちゃった。タップで片付けよう', 'The chest left a mess. Tap to tidy up'));
      break;
    case 'cleaned':
      if (!e.byStaff) sound.play('clean');
      break;
    case 'extra':
      if (e.source === 'peddler') {
        sound.play('sale');
        log(h('span', {}, t('行商人が町から帰ってきた！ ', 'The peddler is back from town! '), h('span.gum-text', {}, `+${fmt(e.amount)}`)), 'good');
      } else if (e.source === 'bonus') {
        log(h('span', {}, t('会計係の閉店ボーナス ', "Accountant's closing bonus "), h('span.gum-text', {}, `+${fmt(e.amount)}`)), 'good');
      } else if (e.source === 'market') {
        tip('market', t('棚がいっぱいの間は、倉庫の余りをマーケットで売ってくれるよ！', 'While the shelves are full, spare stock is sold on the market!'));
      } else if (e.source === 'bar') {
        tip('bar', t('ポーションバーでひと休みしていくお客さんもいるみたい！', 'Some customers stop for a break at the potion bar!'));
      }
      break;
    case 'batch':
      tip('batch', t('まとめ会計！次のお客さんも一緒に会計したよ', 'Batch checkout! The next customer was rung up too'));
      break;
    case 'research':
      tip('research', t('研究者が研究ポイントを見つけたよ！スキルツリーの「研究」で使えるよ', 'The researcher found research points! Spend them in the Research branch of the skill tree'));
      break;
    case 'raidWarn':
      sound.play('debuff');
      alertOnScreen(t('☠ 海賊の襲撃！', '☠ Pirate raid!'));
      sound.playBgm('bgmRaid');
      cutin(scene, thieves.find((x) => x.id === 4036)?.image ?? thieves[0].image, thieves.find((x) => x.id === 4036)?.name ?? '', t(`黒髭海賊団 ${e.pirates}人が襲来！`, `${e.pirates} of Blackbeard's pirates attack!`), 'opponent');
      log(h('span', {}, h('span.tag.raid', {}, 'RAID'), t(` 黒髭海賊団 ${e.pirates}人が店に向かっている！`, ` ${e.pirates} of Blackbeard's pirates are heading for the shop!`)), 'bad');
      tip('raid', t('海賊の襲撃（レイド）だ！オレンジに光る海賊は2回タップで捕まえられるよ。全員捕まえるとエンブレムがもらえる！', 'A pirate raid! Tap the orange-glowing pirates twice to catch them. Catch them all to earn emblems!'));
      break;
    case 'raidStart':
      log(h('span', {}, h('span.tag.raid', {}, 'RAID'), t(' 海賊が乗り込んできた！', ' The pirates are storming in!')), 'bad');
      break;
    case 'raidEnd':
      sound.play(e.result.won ? 'win' : 'fail');
      sound.playBgm('bgmShop');
      if (e.result.won) confetti(1500);
      log(
        h(
          'span',
          {},
          h('span.tag.raid', {}, 'RAID'),
          e.result.won ? t(' 黒髭海賊団を完全撃退！', " Blackbeard's pirates fully repelled!") : t(` 海賊 ${e.result.caught}/${e.result.pirates}人を捕まえた`, ` Caught ${e.result.caught}/${e.result.pirates} pirates`),
          e.result.reward ? h('span.gum-text', {}, ` +${fmt(e.result.reward)}`) : '',
          e.result.emblems ? t(` エンブレム +${e.result.emblems}`, ` Emblems +${e.result.emblems}`) : '',
        ),
        e.result.won ? 'rare' : '',
      );
      break;
    case 'donate':
      log(h('span', {}, t(`寄付係が ${e.items} 個を寄付した（名声 +${fmt(e.fame)}）`, `The charity clerk donated ${e.items} items (fame +${fmt(e.fame)})`)));
      break;
    case 'dayEnd':
      sound.play('win');
      save.meta.playSeconds += Math.round(shop?.elapsed ?? 0);
      {
        const auto = autoBuy(save);
        writeSave(save);
        sendRanking(e.report.revenue);
        updateTopbar();
        window.setTimeout(() => showResults(e.report, auto), 500);
      }
      break;
  }
}

// ------------------------------------------------------------------ input

function hitTest(x: number, y: number): 'hazard' | 'thief' | 'pest' | 'decision' | 'line' | 'register' | null {
  if (!shop) return null;
  if (shop.hazardAt(x, y)) return 'hazard';
  if (shop.thiefAt(x, y)) return 'thief';
  if (shop.pestAt(x, y)) return 'pest';
  if (shop.decisionAt(x, y)) return 'decision';
  if (shop.lineAt(x, y)) return 'line';
  if (shop.isOnRegister(x, y)) return 'register';
  return null;
}

/** A press on a production line: a tap crafts a little; holding past HOLD_DELAY overclocks it. */
const HOLD_DELAY = 250;
let press: { pointer: number; line: LineId; timer: number } | null = null;

function endPress(): void {
  if (!press) return;
  window.clearTimeout(press.timer);
  shop?.holdLine(press.line, false);
  press = null;
}

canvas.addEventListener('pointerdown', (ev) => {
  if (!shop || paused || !shop.started) return;
  sound.unlock();
  const { x, y } = renderer.toScene(ev.clientX, ev.clientY);
  const target = hitTest(x, y);
  if (target === 'hazard') shop.clickHazard(x, y);
  else if (target === 'thief') shop.clickThief(shop.thiefAt(x, y)!);
  else if (target === 'pest') shop.clickPest(shop.pestAt(x, y)!);
  else if (target === 'decision') {
    const d = shop.viewDecision();
    if (d) showDecision(d);
  }
  else if (target === 'line') {
    const line = shop.lineAt(x, y)!;
    shop.clickLine(line);
    potClicks++;
    endPress();
    canvas.setPointerCapture(ev.pointerId);
    press = {
      pointer: ev.pointerId,
      line,
      timer: window.setTimeout(() => {
        shop?.holdLine(line, true);
        tip('overclock', t('長押しすると高速でクラフトできるよ！でも熱くなりすぎると失敗しちゃうから、ゲージが赤くなる前に離してね', 'Hold to craft at high speed! But if it gets too hot it fails, so let go before the gauge turns red'));
      }, HOLD_DELAY),
    };
  } else if (target === 'register') {
    shop.clickRegister();
    registerClicks++;
  }
});
for (const type of ['pointerup', 'pointercancel', 'lostpointercapture'] as const) {
  canvas.addEventListener(type, (ev) => {
    if (press && ev.pointerId === press.pointer) endPress();
  });
}
canvas.addEventListener('pointermove', (ev) => {
  const { x, y } = renderer.toScene(ev.clientX, ev.clientY);
  canvas.style.cursor = hitTest(x, y) ? 'pointer' : 'default';
});
// Keyboard: Space taps (and, held, overclocks) the magic pot, Enter helps at the register,
// Escape opens the menu.
let spaceHeld = false;
window.addEventListener('keydown', (ev) => {
  const typing = ev.target instanceof HTMLTextAreaElement || ev.target instanceof HTMLInputElement;
  if (typing || !shop || paused || !shop.started || modalOpen > 0) return;
  if (ev.code === 'Space') {
    ev.preventDefault();
    if (ev.repeat) {
      if (!spaceHeld) shop.holdLine('pot', true);
      spaceHeld = true;
      return;
    }
    shop.clickLine('pot');
    potClicks++;
  } else if (ev.code === 'Enter') {
    ev.preventDefault();
    shop.clickRegister();
    registerClicks++;
  } else if (ev.code === 'Escape') {
    openPauseMenu();
  }
});
window.addEventListener('keyup', (ev) => {
  if (ev.code === 'Space' && spaceHeld) {
    spaceHeld = false;
    shop?.holdLine('pot', false);
  }
});
// Long-press on touch devices would otherwise open the context menu.
canvas.addEventListener('contextmenu', (ev) => ev.preventDefault());

if (import.meta.env.DEV) {
  // Debug shortcuts for local development: G = +GUM, E = end the day, T = spawn a thief, R = raid.
  window.addEventListener('keydown', (ev) => {
    if (ev.key === 'g') {
      save.gum += 10000;
      updateTopbar();
      tree.refresh();
    }
    if (ev.key === 'e' && shop) shop.timeLeft = 0;
    if (ev.key === 't' && shop) shop.thieves.spawn();
    if (ev.key === 'r' && shop) shop.raid.startNow();
  });
}

let resetting = false;
document.addEventListener('visibilitychange', () => {
  if (document.hidden && !resetting) writeSave(save);
});

// ------------------------------------------------------------------ loop

let last = performance.now();
let uiTimer = 0;

function frame(now: number): void {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  const running = shop && shop.started && !paused && modalOpen === 0 && !document.hidden && !tutorial.blocking;
  if (shop && running) {
    shop.update(dt);
    watchFrameRate(dt);
    if (shop.queue.length >= 3 && tip('queue', t('レジに行列ができてる！カウンターをクリックすると会計を手伝えるよ', 'There\'s a line at the register! Click the counter to help check out'))) lastQueueTip = shop.elapsed;
    if (shop.lines.some((l) => l.blocked)) tip('full', t('棚がいっぱいでクラフトが止まっちゃった！「陳列棚増設」や「搬送レーン」で置き場所を増やそう', 'The shelves are full and crafting stopped! Make room with "More Shelves" or "Conveyor Lane"'));
    if (shop.pestList.length) tip('pest', t('エネミーが工房を荒らしてる！跳ね回るエネミーをタップで追い払って！', 'An enemy is wrecking the workshop! Tap the bouncing enemy to chase it off!'));
  }
  if (shop && !stage.hidden) {
    renderer.render(shop, now, {
      pot: save.day === 1 && potClicks < 5,
      register: shop.queue.length >= 3 && shop.elapsed - lastQueueTip < 6,
    });
    uiTimer -= dt;
    if (uiTimer <= 0) {
      uiTimer = 0.1;
      updateHud(shop);
    }
  }
  tutorial.update(modalOpen > 0 && place === 'day' ? null : place);
  requestAnimationFrame(frame);
}

function updateHud(s: Shop): void {
  const left = Math.max(0, s.timeLeft);
  hudGum.textContent = fmt(save.gum);
  hudDay.textContent = `Day ${save.day}`;
  hudTime.textContent = !s.started ? t('開店前', 'Not open yet') : t(`残り${left.toFixed(0)}秒`, `${left.toFixed(0)}s left`);
  hudTime.classList.toggle('hurry', left <= 5 && !s.over);
  hudBar.style.width = `${(left / s.stats.dayLength) * 100}%`;
  hudRevenue.textContent = `+${fmt(s.report.revenue)}`;
  const r = s.report;
  hudStats.textContent = t(`販売${r.sold} 来客${r.customers} 帰${r.lost} 盗${r.stolen}`, `Sold ${r.sold} · In ${r.customers} · Left ${r.lost} · Stolen ${r.stolen}`);
  hudStats.classList.toggle('warn', r.lost + r.stolen > 0);
  const boost = s.visitors.boostTime;
  const raid = s.raid.active;
  hudEvent.textContent = raid
    ? s.raid.countdown > 0
      ? t(`☠ 黒髭海賊団 襲来まで ${Math.ceil(s.raid.countdown)}秒`, `☠ Blackbeard's pirates in ${Math.ceil(s.raid.countdown)}s`)
      : t(`☠ レイド！ 残り ${s.raid.left}人`, `☠ Raid! ${s.raid.left} left`)
    : boost > 0 ? t(`✨ 売上 ×${s.visitors.salesMult} あと${boost.toFixed(0)}秒`, `✨ Sales ×${s.visitors.salesMult} for ${boost.toFixed(0)}s`) : s.condition.kind !== 'sunny' ? conditionLabel(s.condition) : '';
  hudEvent.hidden = !hudEvent.textContent;
  hudEvent.classList.toggle('boost', boost > 0 && !raid);
  hudEvent.classList.toggle('raid', raid);
}

/**
 * Sizes the scene to fill the viewport. On tall screens the storefront grows (relayout=true,
 * only before a day starts); otherwise the scene keeps its aspect ratio and is letterboxed.
 */
/** Screens at least this wide (width / height) show the workshop and the storefront side by side. */
const SIDE_BY_SIDE = 1.3;

function fitScene(relayout = false): void {
  const W = window.innerWidth;
  const H = window.innerHeight;
  const side = W / H >= SIDE_BY_SIDE;
  renderer.side = side;
  scene.classList.toggle('side', side);
  // Side by side, the storefront is as tall as the workshop; stacked, it fills the phone's height.
  if (relayout) setSceneHeight(side ? WORKSHOP_H * 2 : (1000 * H) / W);
  const vw = renderer.viewW;
  const vh = renderer.viewH;
  const width = Math.min(W, (H * vw) / vh);
  scene.style.width = `${Math.floor(width)}px`;
  scene.style.height = `${Math.floor((width * vh) / vw)}px`;
  workshop.style.width = side ? '50%' : '';
  workshop.style.top = `${(-WORKSHOP_CROP / vh) * 100}%`;
  workshop.style.height = `${(1000 / vh) * 100}%`;
}
window.addEventListener('resize', () => {
  if (!stage.hidden) fitScene(false);
});

// Animate the navi portrait.
let naviFrame = 0;
window.setInterval(() => {
  naviFrame = (naviFrame + 1) % staffFrames.mine.length;
  naviImg.src = assetUrl(staffFrames.mine[naviFrame].image);
}, 300);

// ------------------------------------------------------------------ boot

document.documentElement.lang = lang;
applyDisplaySettings();

// Offline play (PWA): the service worker is built into dist/ only. Embeds that forbid service
// workers (sandboxed previews) simply play online.
if (import.meta.env.PROD && 'serviceWorker' in navigator && window.isSecureContext) {
  navigator.serviceWorker.register('./sw.js').catch(() => undefined);
}
if (isEn) document.querySelector('meta[name=description]')?.setAttribute('content', 'An incremental shop game in the world of My Crypto Heroes: craft extensions and sell them (unofficial fan work)');

updateTopbar();
stage.hidden = true;
void preload([
  workshopImages.workshop_base,
  catalog.windowView,
  icons.gum,
  // Sprite sheets holding the extensions, customers, thieves and pests in use.
  ...series.map((x) => x.items[0].image),
  ...customers.map((c) => c.image),
  ...thieves.map((t) => t.image),
  ...pests.map((p) => p.image),
  ...staffFrames.chris.map((f) => f.image),
  ...staffFrames.mine.map((f) => f.image),
  ...SCENE_SPRITES,
]).then(() => {
  document.body.classList.add('loaded');
  showHome();
  requestAnimationFrame(frame);
});
