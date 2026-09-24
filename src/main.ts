import './style.css';
import { Sound } from './audio';
import { catalog, getExtension, icons, RARITY_COLOR, RARITY_JA, staffFrames, workshopImages } from './game/catalog';
import { SCENE_H, SCENE_W, setSceneHeight, WORKSHOP_CROP } from './game/layout';
import { clearSave, loadSave, writeSave } from './game/save';
import { Shop, type DayReport, type ShopEvent } from './game/shop';
import { costOf, level, type SkillNode } from './game/skills';
import { assetUrl, preload } from './render/images';
import { SceneRenderer } from './render/scene';
import { collectionView } from './ui/collection';
import { fmt, h, icon } from './ui/dom';
import { TreeView } from './ui/tree';

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
const dayText = h('span.day-label');
const bgmBtn = h('button.btn.small.toggle', { onclick: () => toggleSetting('bgm') }, 'BGM');
const seBtn = h('button.btn.small.toggle', { onclick: () => toggleSetting('se') }, 'SE');
const topbar = h(
  'header.topbar',
  {},
  h('div.brand', {}, icon(icons.gum, 'px brand-icon'), h('div', {}, h('b', {}, 'My Crypto Workshop'), h('small', {}, 'マイクリ クラフト工房'))),
  h('div.gum', { title: '所持GUM' }, icon(icons.gum, 'px'), gumText),
  dayText,
  h(
    'div.settings',
    {},
    bgmBtn,
    seBtn,
    h('button.btn.small', { onclick: () => openCollection(), title: '図鑑' }, '📖'),
    h('button.btn.small', { onclick: () => openMenu(), title: 'メニュー' }, '☰'),
  ),
);

const workshop = h('div.workshop');
workshop.append(icon(workshopImages.workshop_base, 'ws-base', '工房'));
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

// HUD overlaid on the top-right of the scene (like Bookstore Incremental), so the whole screen
// is the workshop and the store while it is open.
const hudGum = h('span');
const hudDay = h('span.hud-day');
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
  h('div.hud-row', {}, h('span', {}, '本日'), hudRevenue),
  hudStats,
);
const gearBtn = h(
  'button.hud-gear',
  { 'aria-label': 'メニュー（一時停止）', title: 'メニュー（一時停止）', onclick: () => openPauseMenu() },
  h('span', {
    html: '<svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true"><circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" stroke-width="4" stroke-dasharray="3.2 3.1"/><circle cx="12" cy="12" r="6" fill="none" stroke="currentColor" stroke-width="2.4"/><circle cx="12" cy="12" r="2.2" fill="currentColor"/></svg>',
  }),
);
// Mine-chan's tips pop up briefly over the scene instead of occupying a side panel.
const naviImg = icon(staffFrames.mine[0].image, 'px navi-img');
const naviText = h('p.navi-text');
const naviToast = h('div.navi-toast', {}, naviImg, naviText);
naviToast.hidden = true;
const logList = h('ul.log');

const scene = h('div.scene', {}, workshop, canvas, hud, gearBtn, naviToast);
const renderer = new SceneRenderer(canvas);

const stage = h('main.stage', {}, scene);

const tree = new TreeView(save, {
  onBuy: buyNode,
  onStartDay: () => startDay(),
  onCollection: () => openCollection(),
});
tree.hide();

const modalRoot = h('div.modal-root');
const app = document.getElementById('app')!;
app.append(topbar, stage, tree.root, modalRoot);

// ------------------------------------------------------------------ state

let shop: Shop | null = null;
let paused = true;
let potClicks = 0;
let lastQueueTip = -99;
let modalOpen = 0;

function updateTopbar(): void {
  gumText.textContent = fmt(save.gum);
  dayText.textContent = `Day ${save.day}`;
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
  log(h('span.navi-log', {}, 'マインちゃん：', text));
}

/** Shows a Mine-chan tip once per save. */
function tip(key: string, text: string): boolean {
  if (save.tips.includes(key)) return false;
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

const extLabel = (id: number) => {
  const e = getExtension(id);
  return h('b', { style: `color:${RARITY_COLOR[e.rarity]}` }, e.name);
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
    h('h3', {}, `Day ${save.day} 本日の成績`),
    h(
      'div.stat-grid',
      {},
      ...(
        [
          ['売上', `${fmt(r.revenue)} GUM`],
          ['販売', `${r.sold}個`],
          ['来客', `${r.customers}人`],
          ['帰った客', `${r.lost}人`],
          ['クラフト', `${r.crafted}個`],
          ['盗難 / 捕獲', `${r.stolen} / ${r.caught}`],
        ] as [string, string][]
      ).map(([k, v]) => h('div.stat-row', {}, h('span', {}, k), h('b', {}, v))),
    ),
    h('h3', {}, 'できごと'),
    logCopy.children.length ? logCopy : h('p.muted', {}, 'まだ何も起きていません'),
  );
  openModal('一時停止中', body, [
    { label: '📖 図鑑', onClick: () => openCollection() },
    { label: 'データ', onClick: () => openMenu() },
    { label: '▶ 営業に戻る', primary: true },
  ]);
}

function openCollection(): void {
  openModal('エクステンション図鑑', collectionView(save), [{ label: '閉じる' }], 'wide');
}

function openMenu(): void {
  const body = h(
    'div.menu',
    {},
    h('p', {}, '累計成績'),
    h(
      'div.stat-grid',
      {},
      ...(
        [
          ['累計売上', `${fmt(save.totals.revenue)} GUM`],
          ['販売数', save.totals.sold],
          ['来客数', save.totals.customers],
          ['クラフト数', save.totals.crafted],
          ['捕まえた泥棒', save.totals.caught],
          ['盗まれた数', save.totals.stolen],
          ['最高日商', `${fmt(save.bestDayRevenue)} GUM`],
        ] as [string, string | number][]
      ).map(([k, v]) => h('div.stat-row', {}, h('span', {}, k), h('b', {}, String(v)))),
    ),
    h(
      'button.btn.danger',
      {
        // Two-step confirmation in the page itself (window.confirm is unavailable in some embeds).
        onclick: (ev: Event) => {
          const btn = ev.currentTarget as HTMLButtonElement;
          if (btn.dataset.armed !== '1') {
            btn.dataset.armed = '1';
            btn.textContent = 'もう一度押すと削除します';
            return;
          }
          resetting = true;
          clearSave();
          location.reload();
        },
      },
      'セーブデータを削除',
    ),
    credits(),
  );
  openModal('メニュー', body, [{ label: '閉じる' }]);
}

function credits(): HTMLElement {
  return h(
    'p.credits',
    {},
    '素材: My Crypto Heroes（© MCH Co.,Ltd.）のヒーロー・エクステンション・エネミー・背景・サウンドを ',
    h('a', { href: 'https://github.com/bearko/mycryptoheroes', target: '_blank', rel: 'noopener' }, 'bearko/mycryptoheroes'),
    ' 経由で使用した非公式の二次創作です。クリスくん／マインちゃん ドット絵：こじもこ、マイクリくん 原画：こはる／ドット絵：こじもこ。',
  );
}

function showTitle(): void {
  const hasProgress = save.day > 1;
  const mine = icon(staffFrames.mine[0].image, 'px title-mine');
  let frame = 0;
  const anim = window.setInterval(() => {
    frame = (frame + 1) % staffFrames.mine.length;
    mine.src = assetUrl(staffFrames.mine[frame].image);
  }, 300);
  const body = h(
    'div.title',
    {},
    h('div.title-art', {}, icon(workshopImages.workshop_base, 'title-bg'), mine),
    h('p.title-lead', {}, 'エクステンションをクラフトして、来店するヒーローに売ろう。', h('br'), '稼いだ GUM で工房を強化して、伝説の工房を目指せ！'),
    hasProgress ? h('p.title-save', {}, `セーブデータ: Day ${save.day}・所持 ${fmt(save.gum)} GUM`) : null,
    credits(),
  );
  openModal(
    'My Crypto Workshop',
    body,
    [
      {
        label: hasProgress ? 'つづきから' : '開店する',
        primary: true,
        onClick: () => {
          window.clearInterval(anim);
          sound.unlock();
          if (hasProgress) showTree();
          else startDay();
        },
      },
    ],
    'title-modal',
  );
}

function showResults(report: DayReport): void {
  const rows: [string, string | number, string?][] = [
    ['来客', `${report.customers}人`],
    ['販売', `${report.sold}個`],
    ['帰ってしまった客', `${report.lost}人`, report.lost ? 'bad' : ''],
    ['クラフト', `${report.crafted}個`],
  ];
  if (report.day >= 2) rows.push(['捕まえた泥棒', `${report.caught}人`], ['盗まれた商品', `${report.stolen}個`, report.stolen ? 'bad' : '']);
  if (report.day >= 3) rows.push(['退治したエネミー', `${report.pests}体`]);
  const body = h(
    'div.results',
    {},
    h('div.results-hero', {}, icon(staffFrames.chrisCheer, 'px results-chris'), h('div', {}, h('div.results-label', {}, '本日の売上'), h('div.results-revenue', {}, icon(icons.gum, 'px'), fmt(report.revenue)))),
    h('div.stat-grid', {}, ...rows.map(([k, v, c]) => h('div.stat-row', { class: `stat-row ${c ?? ''}` }, h('span', {}, k), h('b', {}, String(v))))),
    report.bestSale
      ? h('p.best-sale', {}, '最高額: ', h('b', {}, report.bestSale.hero), ' が ', extLabel(report.bestSale.item), ` を ${fmt(report.bestSale.price)} GUM で購入`)
      : null,
    report.newEntries.length
      ? h('div.new-entries', {}, h('div', {}, `図鑑に新しく登録 (${report.newEntries.length})`), h('div.new-icons', {}, ...report.newEntries.map((id) => icon(getExtension(id).image, 'px'))))
      : null,
  );
  openModal(`Day ${report.day} 閉店`, body, [{ label: 'スキルツリーへ', primary: true, onClick: () => showTree() }], 'results-modal');
}

// ------------------------------------------------------------------ flow

function showTree(): void {
  shop = null;
  paused = true;
  stage.hidden = true;
  document.body.classList.remove('in-day');
  naviToast.hidden = true;
  tree.show();
  sound.playBgm('bgmTree');
  updateTopbar();
}

function buyNode(node: SkillNode): void {
  const cost = costOf(node, level(save.levels, node.id));
  if (save.gum < cost) return;
  save.gum -= cost;
  save.levels[node.id] = level(save.levels, node.id) + 1;
  sound.play(FACILITY_NODES.has(node.id) ? 'build' : 'unlock');
  writeSave(save);
  updateTopbar();
}

function startDay(): void {
  tree.hide();
  document.body.classList.add('in-day');
  stage.hidden = false;
  logList.replaceChildren();
  fitScene(true);
  shop = new Shop(save);
  shop.on(onShopEvent);
  applyOverlays(shop.stats.overlays);
  paused = false;
  sound.playBgm('bgmShop');
  updateTopbar();
  if (save.day === 1) {
    tip('welcome', 'いらっしゃいませ！ここはあなたのクラフト工房。魔法の壺をクリックするとクラフトが早くなるよ！');
  } else if (save.day === 2) {
    tip('thiefWarn', '今日から泥棒が出るみたい…赤く光っているヒーローを見つけたらクリックで捕まえて！');
  } else if (save.day === 3) {
    tip('pestWarn', '工房にエネミーが入り込むことがあるよ。跳ね回るエネミーを見つけたらタップで追い払おう！');
  } else {
    say(`Day ${save.day} 開店！今日もがんばろう！`);
  }
}

function onShopEvent(e: ShopEvent): void {
  switch (e.type) {
    case 'craft': {
      const ext = getExtension(e.item);
      if (e.isNew && ext.rarityIndex >= 2) {
        sound.play('rare');
        log(h('span', {}, h('span.tag.new', {}, 'NEW'), ` [${RARITY_JA[ext.rarity]}] `, extLabel(e.item), ' が完成！'), 'rare');
      } else {
        sound.play(ext.rarityIndex >= 3 ? 'rare' : 'craft');
        if (e.isNew) log(h('span', {}, h('span.tag.new', {}, 'NEW'), ' ', extLabel(e.item), ' が完成'));
      }
      break;
    }
    case 'sale':
      sound.play('sale');
      log(h('span', {}, h('b', {}, e.hero.name), ' が ', extLabel(e.item), ' を購入 ', h('span.gum-text', {}, `+${fmt(e.price)}`), e.tip ? h('span.tag', {}, 'チップ') : ''));
      break;
    case 'lost':
      sound.play('debuff');
      log(h('span', {}, h('b', {}, e.hero.name), e.reason === 'empty' ? ' は品切れで帰ってしまった…' : ' は待ちきれず帰ってしまった…'), 'bad');
      if (e.reason === 'empty') tip('lostEmpty', '棚が空っぽでお客さんが帰っちゃった…「壺の火力」でクラフトを早くしよう！');
      else tip('lostQueue', 'レジが混みすぎて帰っちゃった！カウンターをクリックして会計を手伝うか「クリスくん研修」を！');
      break;
    case 'thief':
      sound.play('debuff');
      log(h('span', {}, '泥棒 ', h('b.villain', {}, e.hero.name), ` が現れた！（${e.style.trait}）`), 'bad');
      if (e.style.entry === 'ceiling') tip('ceiling', '天井からロープで降りてくる泥棒もいるよ！上にも注意して！');
      else if (e.style.entry === 'window') tip('window', '窓から飛び込んでくる泥棒だ！窓から逃げられる前にタップ！');
      else if (e.style.disguise) tip('disguise', 'お客さんのふりをした泥棒がいるみたい…商品に手を伸ばした瞬間を狙って！');
      else if (e.style.hp > 1) tip('tough', 'しぶとい泥棒は何回かタップしないと捕まらないよ！');
      break;
    case 'thiefHit':
      sound.play('hit');
      break;
    case 'stolen':
      sound.play('fail');
      log(h('span', {}, h('b.villain', {}, e.hero.name), ' に ', extLabel(e.item), ' を盗まれた！'), 'bad');
      tip('stolen', '盗まれちゃった…！赤く光る泥棒は逃げる前にクリック！「マイクリくん警備」も頼りになるよ');
      break;
    case 'caught':
      sound.play('hit');
      log(h('span', {}, e.byGuard ? 'マイクリくんが ' : '', h('b.villain', {}, e.hero.name), ' を捕まえた！ 懸賞金 ', h('span.gum-text', {}, `+${fmt(e.bounty)}`)), 'good');
      break;
    case 'pest':
      sound.play('debuff');
      log(h('span', {}, 'エネミー ', h('b.villain', {}, e.name), ' が工房に入り込んだ！クラフト速度ダウン'), 'bad');
      break;
    case 'pestCleared':
      sound.play('hit');
      log(h('span', {}, 'エネミーを追い払った！ ', h('span.gum-text', {}, `+${fmt(e.reward)}`)), 'good');
      break;
    case 'mine':
      break;
    case 'dayEnd':
      sound.play('win');
      writeSave(save);
      updateTopbar();
      window.setTimeout(() => showResults(e.report), 500);
      break;
  }
}

// ------------------------------------------------------------------ input

function hitTest(x: number, y: number): 'thief' | 'pest' | 'pot' | 'register' | null {
  if (!shop) return null;
  if (shop.thiefAt(x, y)) return 'thief';
  if (shop.pestAt(x, y)) return 'pest';
  if (shop.isOnPot(x, y)) return 'pot';
  if (shop.isOnRegister(x, y)) return 'register';
  return null;
}

canvas.addEventListener('pointerdown', (ev) => {
  if (!shop || paused) return;
  sound.unlock();
  const { x, y } = renderer.toScene(ev.clientX, ev.clientY);
  const target = hitTest(x, y);
  if (target === 'thief') shop.clickThief(shop.thiefAt(x, y)!);
  else if (target === 'pest') shop.clickPest(shop.pestAt(x, y)!);
  else if (target === 'pot') {
    shop.clickPot();
    potClicks++;
  } else if (target === 'register') shop.clickRegister();
});
canvas.addEventListener('pointermove', (ev) => {
  const { x, y } = renderer.toScene(ev.clientX, ev.clientY);
  canvas.style.cursor = hitTest(x, y) ? 'pointer' : 'default';
});

if (import.meta.env.DEV) {
  // Debug shortcuts for local development: G = +GUM, E = end the day, T = spawn a thief.
  window.addEventListener('keydown', (ev) => {
    if (ev.key === 'g') {
      save.gum += 10000;
      updateTopbar();
      tree.refresh();
    }
    if (ev.key === 'e' && shop) shop.timeLeft = 0;
    if (ev.key === 't' && shop) shop.thieves.spawn();
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
  const running = shop && !paused && modalOpen === 0 && !document.hidden;
  if (shop && running) {
    shop.update(dt);
    if (shop.queue.length >= 3 && tip('queue', 'レジに行列ができてる！カウンターをクリックすると会計を手伝えるよ')) lastQueueTip = shop.elapsed;
    if (shop.craftBlocked) tip('full', '棚がいっぱいでクラフトが止まっちゃった！「陳列棚増設」や「搬送レーン」で置き場所を増やそう');
    if (shop.pestList.length) tip('pest', 'エネミーが工房を荒らしてる！跳ね回るエネミーをタップで追い払って！');
  }
  if (shop) {
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
  requestAnimationFrame(frame);
}

function updateHud(s: Shop): void {
  const t = Math.max(0, s.timeLeft);
  hudGum.textContent = fmt(save.gum);
  hudDay.textContent = `Day ${save.day}`;
  hudTime.textContent = `残り${t.toFixed(0)}秒`;
  hudTime.classList.toggle('hurry', t <= 5 && !s.over);
  hudBar.style.width = `${(t / s.stats.dayLength) * 100}%`;
  hudRevenue.textContent = `+${fmt(s.report.revenue)}`;
  const r = s.report;
  hudStats.textContent = `販売${r.sold} 来客${r.customers} 帰${r.lost} 盗${r.stolen}`;
  hudStats.classList.toggle('warn', r.lost + r.stolen > 0);
}

/**
 * Sizes the scene to fill the viewport. On tall screens the storefront grows (relayout=true,
 * only before a day starts); otherwise the scene keeps its aspect ratio and is letterboxed.
 */
function fitScene(relayout = false): void {
  const W = window.innerWidth;
  const H = window.innerHeight;
  if (relayout) setSceneHeight((1000 * H) / W);
  const width = Math.min(W, (H * SCENE_W) / SCENE_H);
  scene.style.width = `${Math.floor(width)}px`;
  scene.style.height = `${Math.floor((width * SCENE_H) / SCENE_W)}px`;
  workshop.style.top = `${(-WORKSHOP_CROP / SCENE_H) * 100}%`;
  workshop.style.height = `${(1000 / SCENE_H) * 100}%`;
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

updateTopbar();
stage.hidden = true;
void preload([
  workshopImages.workshop_base,
  catalog.windowView,
  icons.gum,
  ...staffFrames.chris.map((f) => f.image),
  ...staffFrames.mine.map((f) => f.image),
]).then(() => {
  document.body.classList.add('loaded');
  showTitle();
  requestAnimationFrame(frame);
});
