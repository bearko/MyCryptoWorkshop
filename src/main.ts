import './style.css';
import { CURRENCIES } from './game/currency';
import { conditionLabel, CONDITIONS } from './game/conditions';
import { ACHIEVEMENTS, DAILY_BONUS, dailyLabel, dailyValue } from './game/achievements';
import { confetti } from './ui/confetti';
import { cutin } from './ui/cutin';
import { Sound } from './audio';
import { catalog, customers, getExtension, icons, pests, RARITY_COLOR, RARITY_JA, series, staffFrames, thieves, workshopImages } from './game/catalog';
import { SCENE_H, SCENE_W, setSceneHeight, WORKSHOP_CROP } from './game/layout';
import { LINES, type LineId } from './game/lines';
import { EDITIONS, itemEdition, itemExt, itemName } from './game/items';
import { clearSave, exportCode, importCode, loadSave, SaveError, writeSave } from './game/save';
import { Shop, type DayReport, type Decision, type ExtraSource, type ShopEvent } from './game/shop';
import { buy } from './game/purchase';
import { computeStats } from './game/stats';
import type { SkillNode } from './game/skills';
import { assetUrl, preload } from './render/images';
import { SCENE_SPRITES, SceneRenderer } from './render/scene';
import { collectionView } from './ui/collection';
import { fileImg, fmt, h, icon } from './ui/dom';
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
const dustText = h('span.dust-amount', {}, '0');
const dustBox = h('div.dust', { title: 'ゴールドダスト' }, icon(icons.dust, 'px'), dustText);
const researchText = h('span.research-amount', {}, '0');
const researchBox = h('div.dust.research', { title: '研究ポイント' }, icon(CURRENCIES.research.icon, 'px'), researchText);
const emblemText = h('span.emblem-amount', {}, '0');
const emblemBox = h('div.dust.emblem', { title: 'エンブレム' }, icon(CURRENCIES.emblem.icon, 'px'), emblemText);
const dayText = h('span.day-label');
const bgmBtn = h('button.btn.small.toggle', { onclick: () => toggleSetting('bgm') }, 'BGM');
const seBtn = h('button.btn.small.toggle', { onclick: () => toggleSetting('se') }, 'SE');
const topbar = h(
  'header.topbar',
  {},
  h('div.brand', {}, icon(icons.gum, 'px brand-icon'), h('div', {}, h('b', {}, 'My Crypto Workshop'), h('small', {}, 'マイクリ クラフト工房'))),
  h('div.gum', { title: '所持GUM' }, icon(icons.gum, 'px'), gumText),
  dustBox,
  researchBox,
  emblemBox,
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
  h('div.hud-row', {}, h('span', {}, '本日'), hudRevenue),
  hudStats,
  hudEvent,
);
const gearBtn = h(
  'button.hud-gear',
  { 'aria-label': 'メニュー（一時停止）', title: 'メニュー（一時停止）', onclick: () => openPauseMenu() },
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
  dustText.textContent = fmt(save.resources.dust);
  const stats = computeStats(save.levels);
  dustBox.hidden = save.resources.dust <= 0 && stats.dismantleRarity < 0;
  researchText.textContent = fmt(save.resources.research);
  researchBox.hidden = save.resources.research <= 0 && stats.researchRate <= 0;
  emblemText.textContent = fmt(save.resources.emblem);
  emblemBox.hidden = save.resources.emblem <= 0 && save.achievements.length === 0;
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
    ...(save.dailies.length ? [h('h3', {}, '今日のデイリー依頼'), dailyList(r)] : []),
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
    h('div.menu-sound', {}, h('span', {}, 'サウンド'), soundBtn('bgm', 'BGM'), soundBtn('se', 'SE')),
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
          ['プレイ時間', `${Math.floor(save.meta.playSeconds / 3600)}時間${Math.floor((save.meta.playSeconds % 3600) / 60)}分`],
        ] as [string, string | number][]
      ).map(([k, v]) => h('div.stat-row', {}, h('span', {}, k), h('b', {}, String(v)))),
    ),
    h('p', {}, `実績（${save.achievements.length} / ${ACHIEVEMENTS.length}）`),
    achievementList(),
    saveTransfer(),
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

/** Today's (or the next day's) requests, with progress when a day report is given. */
function dailyList(r?: DayReport): HTMLElement {
  return h(
    'div.daily-list',
    {},
    ...save.dailies.map((d) => {
      const v = r ? Math.min(d.target, dailyValue(d.kind, r)) : 0;
      const done = d.done || (r ? v >= d.target : false);
      return h('div.daily-row', { class: `daily-row ${done ? 'done' : ''}` }, h('span', {}, dailyLabel(d)), h('b', {}, done ? '✓' : r ? `${fmt(v)} / ${fmt(d.target)}` : `エンブレム +1`));
    }),
    h('small.muted', {}, `3つすべて達成でエンブレム +${DAILY_BONUS}`),
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
        h('small', {}, done ? '達成' : `エンブレム ${a.emblem}`),
      );
    }),
  );
}

/** Export / import of the save as a copy-pasteable code (for moving between devices or backups). */
function saveTransfer(): HTMLElement {
  const out = h('textarea.save-code', { readonly: true, rows: 3, 'aria-label': 'セーブコード', id: 'save-export' }) as HTMLTextAreaElement;
  const copyBtn = h('button.btn.small', {}, 'コードを表示してコピー');
  copyBtn.addEventListener('click', () => {
    writeSave(save);
    out.value = exportCode(save);
    out.hidden = false;
    out.select();
    navigator.clipboard?.writeText(out.value).then(
      () => (copyBtn.textContent = 'コピーしました'),
      () => (copyBtn.textContent = '選択中のコードをコピーしてください'),
    );
  });
  out.hidden = true;

  const input = h('textarea.save-code', { rows: 3, placeholder: 'MCW: で始まるセーブコードを貼り付け', 'aria-label': '読み込むセーブコード', id: 'save-import' }) as HTMLTextAreaElement;
  const msg = h('p.save-msg');
  const loadBtn = h('button.btn.small', {}, 'このコードを読み込む');
  loadBtn.addEventListener('click', () => {
    try {
      const data = importCode(input.value);
      if (loadBtn.dataset.armed !== '1') {
        loadBtn.dataset.armed = '1';
        loadBtn.textContent = '今のデータを上書きします。もう一度押すと読み込み';
        msg.textContent = `読み込むデータ: Day ${data.day}・${fmt(data.gum)} GUM`;
        msg.className = 'save-msg';
        return;
      }
      resetting = true;
      writeSave(data);
      location.reload();
    } catch (err) {
      msg.textContent = err instanceof SaveError ? err.message : 'セーブコードを読み込めませんでした';
      msg.className = 'save-msg error';
      loadBtn.dataset.armed = '';
      loadBtn.textContent = 'このコードを読み込む';
    }
  });
  return h(
    'div.save-transfer',
    {},
    h('p', {}, 'セーブデータの引き継ぎ'),
    h('div.save-row', {}, copyBtn),
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
    '素材: My Crypto Heroes（© MCH Co.,Ltd.）のヒーロー・エクステンション・エネミー・背景・サウンドを ',
    h('a', { href: 'https://github.com/bearko/mycryptoheroes', target: '_blank', rel: 'noopener' }, 'bearko/mycryptoheroes'),
    ' 経由で使用した非公式の二次創作です。クリスくん／マインちゃん ドット絵：こじもこ、マイクリくん 原画：こはる／ドット絵：こじもこ。紙吹雪とカットインの演出は同リポジトリの実装（MIT License）を移植しています。',
  );
}

function showTitle(): void {
  const hasProgress = save.day > 1;
  const mine = fileImg(staffFrames.mine[0].image, 'px title-mine');
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
  const extras: [ExtraSource, string][] = [
    ['bar', 'ポーションバー'],
    ['trial', '試し斬り'],
    ['market', 'マーケット'],
    ['peddler', '行商'],
    ['bonus', '会計係のボーナス'],
    ['chest', '宝箱'],
    ['coin', '拾ったコイン'],
    ['merchant', '悪徳商人への売却'],
  ];
  for (const [key, label] of extras) if (report.extras[key] > 0) rows.push([label, `+${fmt(report.extras[key])}`]);
  if (report.research > 0) rows.push(['研究ポイント', `+${report.research}`]);
  if (report.guests > 0) rows.push(['乗り物で来た客', `${report.guests}人`]);
  if (report.newHeroes.length > 0) rows.push(['初めて買ってくれたヒーロー', `${report.newHeroes.length}人`]);
  if (report.ordersDone > 0) rows.push(['届けた注文', `${report.ordersDone}件`]);
  if (report.dust > 0) rows.push(['分解で得たダスト', fmt(report.dust)]);
  const gemsGot = Object.values(report.gems).reduce((a, b) => a + (b ?? 0), 0);
  if (gemsGot > 0) rows.push(['分解で得た魔石', `${gemsGot}個`]);
  const body = h(
    'div.results',
    {},
    h('div.results-hero', {}, icon(staffFrames.chrisCheer, 'px results-chris'), h('div', {}, h('div.results-label', {}, '本日の売上'), h('div.results-revenue', {}, icon(icons.gum, 'px'), fmt(report.revenue)))),
    h('div.stat-grid', {}, ...rows.map(([k, v, c]) => h('div.stat-row', { class: `stat-row ${c ?? ''}` }, h('span', {}, k), h('b', {}, String(v))))),
    report.bestSale
      ? h('p.best-sale', {}, '最高額: ', h('b', {}, report.bestSale.hero), ' が ', extLabel(report.bestSale.item), ` を ${fmt(report.bestSale.price)} GUM で購入`)
      : null,
    report.sets.length ? h('p.best-sale', {}, '🏆 コンプリート達成: ', h('b', {}, report.sets.join('・'))) : null,
    report.achievements.length ? h('p.best-sale', {}, '🎖️ 実績: ', h('b', {}, report.achievements.join('・'))) : null,
    report.dailyEmblems > 0 ? h('p.best-sale', {}, `デイリー依頼を達成！ エンブレム +${report.dailyEmblems}`) : null,
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
  if (!buy(save, node)) return;
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
  } else if (shop.staffMembers.length > 0 && !save.tips.includes('staff')) {
    tip('staff', 'スタッフが店で働いているよ！足元の名札で役割がわかるよ。ヒーローを雇うともっと頼もしくなる！');
  } else if (shop.condition.kind !== 'sunny') {
    say(`Day ${save.day} 開店！今日は ${conditionLabel(shop.condition)}。${CONDITIONS[shop.condition.kind].desc}`);
  } else {
    say(`Day ${save.day} 開店！今日もがんばろう！`);
  }
}

const LOST_TEXT = {
  empty: ' は品切れで帰ってしまった…',
  queue: ' は待ちきれず帰ってしまった…',
  mess: ' は泥を踏んで怒って帰ってしまった…',
  scared: ' はエネミーに驚いて逃げ帰ってしまった…',
};

/** Seconds before a decision picks its fallback on its own (so an idle shop keeps going). */
const DECISION_SECONDS = 12;

function showDecision(d: Decision): void {
  sound.play(d.kind === 'merchant' ? 'debuff' : 'helper');
  let left = DECISION_SECONDS;
  const timer = h('div.decision-timer');
  let done = false;
  const choose = (i: number) => {
    if (done) return;
    done = true;
    window.clearInterval(tick);
    close();
    shop?.decide(i);
  };
  const body = h(
    'div.decision',
    {},
    h('div.decision-head', {}, icon(d.image, 'px'), h('p.decision-text', {}, d.text)),
    ...d.options.map((o, i) =>
      h('button.btn.decision-option', { onclick: () => choose(i) }, h('b', {}, o.label), h('small', {}, o.detail)),
    ),
    timer,
  );
  const update = () => (timer.textContent = `${left} 秒後に「${d.options[d.fallback].label}」を選びます`);
  update();
  const tick = window.setInterval(() => {
    left--;
    update();
    if (left <= 0) choose(d.fallback);
  }, 1000);
  const close = openModal(d.title, body, [], 'decision-modal');
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
    h('div.gold-chest', {}, h('div.gold-chest-head', {}, '★ GOLD CHEST ★'), icon(ext.image, 'px'), h('p', {}, extLabel(code), ' が完成！')),
    [{ label: 'やった！', primary: true }],
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
        log(h('span', {}, h('span.tag.edition', {}, ext.shin ? '真' : EDITIONS[edition].name), ' ', extLabel(e.item), ` が${LINES[e.line].name}で完成！`), 'rare');
        tip('edition', 'エディション付きの品ができたよ！鑑定済み・刻印入り…と、珍しいほど高く売れるんだ');
      } else if (e.isNew && ext.rarityIndex >= 2) {
        sound.play('rare');
        log(h('span', {}, h('span.tag.new', {}, 'NEW'), ` [${RARITY_JA[ext.rarity]}] `, extLabel(e.item), ' が完成！'), 'rare');
      } else {
        sound.play(ext.rarityIndex >= 3 ? 'rare' : 'craft');
        if (e.isNew) log(h('span', {}, h('span.tag.new', {}, 'NEW'), ' ', extLabel(e.item), ' が完成'));
      }
      break;
    }
    case 'dismantle':
      tip('dismantle', '置き場所がいっぱいの時は、分解炉が安い品をゴールドダストと魔石に変えてくれるよ！');
      break;
    case 'overheat':
      sound.play('fail');
      log(h('span', {}, `${LINES[e.line].name}が過熱して止まった！（3秒）`), 'bad');
      tip('overheat', '熱くなりすぎて失敗しちゃった…長押しはゲージが赤くなる前に離そう！');
      break;
    case 'sale':
      sound.play('sale');
      log(h('span', {}, h('b', {}, e.hero.name), ' が ', extLabel(e.item), ' を購入 ', h('span.gum-text', {}, `+${fmt(e.price)}`), e.tip ? h('span.tag', {}, 'チップ') : ''));
      break;
    case 'lost':
      sound.play('debuff');
      log(h('span', {}, h('b', {}, e.hero.name), LOST_TEXT[e.reason]), 'bad');
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
      log(h('span', {}, e.byGuard ? `${e.guard ?? 'マイクリくん'}が ` : '', h('b.villain', {}, e.hero.name), ' を捕まえた！ 懸賞金 ', h('span.gum-text', {}, `+${fmt(e.bounty)}`)), 'good');
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
    case 'orderDone':
      sound.play('rare');
      log(h('span', {}, h('b', {}, e.hero.name), ' が注文の ', extLabel(e.item), ' を受け取った！ ', h('span.gum-text', {}, `+${fmt(e.price)}`)), 'rare');
      break;
    case 'decision':
      showDecision(e.decision);
      break;
    case 'decided':
      log(h('span', {}, e.result), 'good');
      break;
    case 'visit':
      sound.play('helper');
      if (shop) cutin(scene, e.visit.image, e.visit.name, e.visit.skill, 'ally');
      log(
        h('span', {}, h('b', {}, e.visit.name), e.visit.kind === 'cryptid' ? ' が現れて店を清めた！' : ' が来店！しばらく売上 2 倍！'),
        'rare',
      );
      break;
    case 'vehicle':
      sound.play('buff');
      log(h('span', {}, `${['', '乗合馬車', '飛空艇', 'ランドゲート'][e.kind]}で ${e.count} 人の団体客が到着！`), 'good');
      break;
    case 'special':
      if (e.kind === 'owner') {
        sound.play('buff');
        log(h('span', {}, 'ランドオーナー ', h('b', {}, e.hero.name), ' が来店！最高の品を高く買ってくれる'), 'rare');
      } else if (e.kind === 'collector') {
        log(h('span', {}, 'コレクター ', h('b', {}, e.hero.name), ' が探し物をしている'));
        tip('collector', '吹き出しにシリーズを出しているのはコレクター客！そのシリーズを並べておくと 2 倍で買ってくれるよ');
      } else if (e.kind === 'order') {
        log(h('span', {}, h('b', {}, e.hero.name), ' が注文の品を受け取りに来た'), 'rare');
        tip('orderCome', '注文したヒーローが来たよ！注文の品が棚にあれば高く買ってくれる。吹き出しの品を確認してね');
      } else if (e.kind === 'regular') {
        log(h('span', {}, '常連客の ', h('b', {}, e.hero.name), ' が来てくれた'));
      }
      break;
    case 'chest':
      sound.play('rare');
      log(h('span', {}, '宝箱を開けた！ ', e.reward === 'gum' ? h('span.gum-text', {}, `+${fmt(e.amount)}`) : e.reward === 'dust' ? `ダスト +${e.amount}` : `魔石 +${e.amount}`), 'good');
      break;
    case 'storePest':
      sound.play('debuff');
      log(h('span', {}, 'エネミー ', h('b.villain', {}, e.name), ' が店に入り込んだ！客が怖がっている'), 'bad');
      tip('storePest', '店にエネミーが！近くのお客さんが怖がって帰っちゃうよ。2回タップで追い払おう');
      break;
    case 'storePestCleared':
      sound.play(e.by === 'cryptid' ? 'zap' : 'hit');
      log(h('span', {}, e.by === 'cryptid' ? 'クリプタイドの雷でエネミーを倒した！ ' : '店のエネミーを追い払った！ ', h('span.gum-text', {}, `+${fmt(e.reward)}`)), 'good');
      break;
    case 'mess':
      if (e.kind === 'mud') tip('mud', '雨の日はお客さんが泥を持ち込むよ。踏んだお客さんは怒って帰ることも…タップで掃除しよう！');
      else tip('litter', '宝箱の箱が散らかっちゃった。タップで片付けよう');
      break;
    case 'cleaned':
      if (!e.byStaff) sound.play('clean');
      break;
    case 'extra':
      if (e.source === 'peddler') {
        sound.play('sale');
        log(h('span', {}, '行商人が町から帰ってきた！ ', h('span.gum-text', {}, `+${fmt(e.amount)}`)), 'good');
      } else if (e.source === 'bonus') {
        log(h('span', {}, '会計係の閉店ボーナス ', h('span.gum-text', {}, `+${fmt(e.amount)}`)), 'good');
      } else if (e.source === 'market') {
        tip('market', '棚がいっぱいの間は、倉庫の余りをマーケットで売ってくれるよ！');
      } else if (e.source === 'bar') {
        tip('bar', 'ポーションバーでひと休みしていくお客さんもいるみたい！');
      }
      break;
    case 'batch':
      tip('batch', 'まとめ会計！次のお客さんも一緒に会計したよ');
      break;
    case 'research':
      tip('research', '研究者が研究ポイントを見つけたよ！スキルツリーの「研究」で使えるよ');
      break;
    case 'dayEnd':
      sound.play('win');
      save.meta.playSeconds += Math.round(shop?.elapsed ?? 0);
      writeSave(save);
      updateTopbar();
      window.setTimeout(() => showResults(e.report), 500);
      break;
  }
}

// ------------------------------------------------------------------ input

function hitTest(x: number, y: number): 'hazard' | 'thief' | 'pest' | 'line' | 'register' | null {
  if (!shop) return null;
  if (shop.hazardAt(x, y)) return 'hazard';
  if (shop.thiefAt(x, y)) return 'thief';
  if (shop.pestAt(x, y)) return 'pest';
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
  if (!shop || paused) return;
  sound.unlock();
  const { x, y } = renderer.toScene(ev.clientX, ev.clientY);
  const target = hitTest(x, y);
  if (target === 'hazard') shop.clickHazard(x, y);
  else if (target === 'thief') shop.clickThief(shop.thiefAt(x, y)!);
  else if (target === 'pest') shop.clickPest(shop.pestAt(x, y)!);
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
        tip('overclock', '長押しすると高速でクラフトできるよ！でも熱くなりすぎると失敗しちゃうから、ゲージが赤くなる前に離してね');
      }, HOLD_DELAY),
    };
  } else if (target === 'register') shop.clickRegister();
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
// Long-press on touch devices would otherwise open the context menu.
canvas.addEventListener('contextmenu', (ev) => ev.preventDefault());

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
    if (shop.lines.some((l) => l.blocked)) tip('full', '棚がいっぱいでクラフトが止まっちゃった！「陳列棚増設」や「搬送レーン」で置き場所を増やそう');
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
  const boost = s.visitors.boostTime;
  hudEvent.textContent = boost > 0 ? `✨ 売上 ×${s.visitors.salesMult} あと${boost.toFixed(0)}秒` : s.condition.kind !== 'sunny' ? conditionLabel(s.condition) : '';
  hudEvent.hidden = !hudEvent.textContent;
  hudEvent.classList.toggle('boost', boost > 0);
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
  showTitle();
  requestAnimationFrame(frame);
});
