/**
 * フェーズ 1「新天地で実績を上げろ」の画面。地図・上の帯・事業別メニュー（下の帯）・マスの吹き出し・マインちゃんの案内・時間。
 * 仕様は docs/ISLAND_PHASE1.md。
 */
import '../island.css';
import './p1.css';
import { Sound } from '../../audio';
import { heroById } from '../../game/catalog';
import { isEn, setLang, t } from '../../i18n';
import { assetUrl } from '../../render/images';
import { DEF } from '../defs';
import { effectDone, image, loading, pick, waterFrame, type Camera, type Effect } from '../render';
import { cells, type Dir } from '../sim';
import { DAY_BASE_MS, MATS, MISSIONS, P1_BUILDINGS, P1B, PACES, PRODUCT, RIVALS, SIDE, skuParts, STORE, type Mat } from './data';
import {
  allowedDirs,
  build,
  canBuild,
  canMoveTo,
  canPlaceAt,
  date,
  daysToClose,
  deserializeP1,
  doorOf,
  myWarehouses,
  poolFree,
  ground,
  roadPath,
  wholesaler,
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
  activeMissions,
  claim,
  forceHaul,
  recipeOf,
  depotInfo,
  missionProgress,
  siteInfo,
  gateOf,
  gateToll,
  openGate,
} from './model';
import { along, newAnim, type Walker } from './anim';
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
  openStaff,
  openWorkshop,
  refreshSheet,
  rivalName,
  sheetOpen,
  type Ctx,
  open as openSheet,
} from './screens';
import { openSupply } from './scm';
import { openSkills } from './tree';
import { openSide } from './side';
import { IslandSfx } from './sfx';
import { tileContent } from './tile';
import { actOf, hlOf, pointOf, TUT, TUT_DONE, TUT_END, tutFix, tutOf, type TutGo, type TutPage, type TutStep } from './tut';
import { btn, h, heroIcon, heroName, matIcon, money, plain, rich, skuIcon } from './ui';

const q = new URLSearchParams(location.search);
const TEST = q.get('test') === '2';
// 経済の数字を大きく変えたので v2（v1 のセーブは使わない）
const SAVE = 'mycryptoisland.p1.v2';
const GUIDE = 'mycryptoisland.p1.guide';
const SOUND = 'mycryptoisland.p1.sound';

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
// チュートリアルの段の並びが変わっていたら、今いるべき段に置き直す
tutFix(s);
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

// ---------------------------------------------------------------- 音（BGM と効果音は mycryptoheroes の音源）

const sound = new Sound();
let vol = { bgm: 1, se: 1 };
try {
  vol = { ...vol, ...(JSON.parse(localStorage.getItem(SOUND) ?? '{}') as Partial<typeof vol>) };
} catch {
  // 既定は両方あり
}
sound.setVolumes(vol);
sound.playBgm('bgmCraft');
// 効果音はコードで作った音（scripts/island/sfx.py）。BGM だけ mycryptoheroes の曲
const sfx = new IslandSfx();
sfx.level = vol.se;
// ブラウザは最初の操作まで音を出せない
// スマホは指を離したとき（pointerup・touchend・click）がユーザーの操作として数えられる。鳴るまで毎回試す
for (const ev of ['pointerdown', 'pointerup', 'touchend', 'click', 'keydown'])
  addEventListener(
    ev,
    () => {
      sound.unlock();
      sfx.unlock();
    },
    { capture: true },
  );
// ボタンを押したら軽いクリック音（会話の「次へ」はポン）
addEventListener(
  'click',
  (e) => {
    const b = e.target instanceof Element ? e.target.closest('button') : null;
    if (!b || b.disabled) return;
    sfx.play(b.closest('.isl-talk') ? 'page' : 'tap');
  },
  { capture: true },
);

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
  build: (id) => {
    closeSheet();
    startPlacing(id);
  },
  tip: (screen) => tutTip(screen),
  sfx: (k) => sfx.play(k),
  step: () => (tutOf(s) < TUT_DONE ? (TUT[tutOf(s)]?.id ?? null) : null),
  dismissed: () => {
    menu = null;
    sub = null;
    renderAll();
  },
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

/** 資金の表示（減ったときは数字が下がっていく演出） */
let shownMoney = s.money;
let moneyAnim: { from: number; to: number; t0: number } | null = null;
/** 日が進む間の増減は演出しない（買い物や建築など、操作で減ったときだけ） */
let ticking = false;
const moneyLabel = h('b');
function moneyText(v: number) {
  moneyLabel.textContent = money(v);
}
function renderHud() {
  statMoney.className = `isl-stat ${s.money < 0 ? 'is-bad' : ''} ${moneyAnim ? 'is-spending' : ''}`;
  if (!statMoney.firstChild) statMoney.append(h('small', '', t('資金', 'Funds')), moneyLabel);
  const spent = shownMoney - s.money;
  if (!ticking && spent >= 1 && !moneyAnim) {
    moneyAnim = { from: shownMoney, to: s.money, t0: performance.now() };
    const fly = h('span', 'isl-spend', `−${money(spent)}`);
    statMoney.append(fly);
    setTimeout(() => fly.remove(), 1200);
    sfx.play('spend');
    statMoney.classList.add('is-spending');
  } else if (!moneyAnim) {
    shownMoney = s.money;
    moneyText(s.money);
  }
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
    { key: 'build', name: t('建築', 'Build'), note: t('工房・お店・倉庫', 'Workshop, shops, storage'), go: () => undefined },
    { key: 'dev', name: t('商品開発', 'Products'), note: t('アンコモンを開発', 'Develop Uncommons'), go: () => openDev(ctx), needs: 'workshop' },
    { key: 'side', name: t('他店でバイト', 'Part-time'), note: t('資金が足りないとき', 'When funds run low'), go: () => openSide(ctx) },
    { key: 'ma', name: 'M&A', note: t('買収・提携（準備中）', 'Deals (coming soon)'), go: () => openMA(ctx) },
  ],
  hr: [
    { key: 'staff', name: t('ヒーローの配置', 'Assign heroes'), note: t('4 つの仕事に置く', 'Four jobs'), go: () => openStaff(ctx) },
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
    { key: 'missions', name: t('依頼', 'Requests'), note: t('受ける・報酬', 'Accept, rewards'), go: () => openMissions(ctx) },
    { key: 'data', name: t('市場調査データ', 'Market data'), note: t('売れ筋・ニーズ', 'Demand and sellers'), go: () => openData(ctx) },
    { key: 'ranking', name: t('企業ランキング', 'Ranking'), note: t('エリア・ランド・世界', 'Area, land, world'), go: () => openRanking(ctx) },
  ],
  sys: [
    { key: 'invest', name: t('設備投資', 'Investment'), note: t('建物ごとの設備', 'Per-building upgrades'), go: () => openInvest(ctx), needs: 'workshop' },
    { key: 'pace', name: t('進行速度', 'Game speed'), note: t('標準・1.5 倍・2 倍', 'Normal, 1.5×, 2×'), go: () => openPace() },
    { key: 'settings', name: t('設定', 'Settings'), note: t('言語・案内・音・人通り', 'Language, guide, sound, crowd'), go: () => openSettings() },
    { key: 'save', name: t('セーブ', 'Save'), note: t('やり直す・工房へ', 'Restart, back'), go: () => openSaveMenu() },
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

/** 下の帯のタブ：押すと 1 つ目のサブタブの画面まで開く。もう一度押すと閉じる */
function pickMenu(m: Menu) {
  const ws = !!myWorkshop(s);
  if (menuLocked(m)) return lockedNote();
  if (m !== 'plan' && m !== 'mkt' && m !== 'sys' && !ws) return needWs();
  closePop();
  if (menu === m) return closeMenu();
  if (placing && !placing.move) placing = null;
  menu = m;
  sub = null;
  if (m === 'skill') {
    closeSheet();
    openSkills(ctx);
    renderAll();
    return;
  }
  // チュートリアル中は、いま開いてほしい小メニューから開く
  const ts = tutStep();
  const [hm, hk] = (ts ? hlOf(ts, s) : '').split(':');
  const target = hm === m && hk ? SUBS[m].find((x) => x.key === hk) : undefined;
  const first = target ?? SUBS[m].find((x) => !(x.needs === 'workshop' && !ws) && !subLocked(m, x.key)) ?? SUBS[m][0];
  openSub(first);
}

/** サブタブ：画面を切り替える（下の帯は出したまま） */
function openSub(x: Sub) {
  if (menu && menu !== 'skill' && subLocked(menu, x.key)) return lockedNote();
  if (x.needs === 'workshop' && !myWorkshop(s)) return needWs();
  sub = x.key;
  if (x.key !== 'build' && placing && !placing.move) placing = null;
  closeSheet();
  x.go();
  renderAll();
}

function closeMenu() {
  menu = null;
  sub = null;
  if (placing && !placing.move) placing = null;
  closeSheet();
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
  panel.hidden = !menu || menu === 'skill' || !!placing?.move;
  // チュートリアル：次に押すところを光らせる
  const tk = tutOf(s);
  const step = tk < TUT_DONE ? TUT[tk] : undefined;
  const [hm, hk] = (step ? hlOf(step, s) : '').split(':');
  for (const m of Object.keys(tabBtns) as Menu[]) {
    tabBtns[m].classList.toggle('is-guide', !placing && hm === m && (menu !== m || (m === 'skill' && !sheetOpen())));
    tabBtns[m].classList.toggle('is-lock', menuLocked(m));
  }
  speedBtns[2].classList.toggle('is-guide', hm === 'speed' && speed !== 4);
  if (!menu || menu === 'skill') return;
  subRow.replaceChildren(
    ...SUBS[menu as Exclude<Menu, 'skill'>].map((x) => {
      const b = h('button', `isl-sub ${sub === x.key ? 'is-on' : ''} ${x.needs === 'workshop' && !ws ? 'is-off' : ''} ${hm === menu && hk === x.key && sub !== x.key ? 'is-guide' : ''} ${subLocked(menu as Menu, x.key) ? 'is-lock' : ''}`);
      b.type = 'button';
      b.append(h('b', '', x.name), h('small', '', x.note));
      if (x.key === 'missions' && ready) b.classList.add('has-dot');
      b.addEventListener('click', () => openSub(x));
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
      const tk = tutOf(s);
      const guide = tk < TUT_DONE && TUT[tk]?.card === b.id;
      const c = h('button', `isl-card ${locked ? 'is-locked' : ''} ${placing?.id === b.id && !placing.move ? 'is-on' : ''} ${guide ? 'is-guide' : ''}`);
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
        const at = buildAt ?? undefined;
        buildAt = null;
        startPlacing(b.id, { at });
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

// 置くときの画面：右上に「選択中」と戻る、建物のそばに理由・建てる・回す
const selBox = h('div', 'isl-selbox');
const ghostUi = h('div', 'isl-ghost-ui');
const placeBox = h('div', 'isl-place');
placeBox.hidden = true;

/** 置けるマス（置くときだけ。地図のほかのマスは暗くする） */
let placeCache: { key: string; set: Set<number> } | null = null;
function placeable(): Set<number> | null {
  if (!placing) return null;
  const key = `${placing.id}:${placing.move ?? ''}:${s.buildings.length}:${s.nextUid}`;
  if (placeCache?.key === key) return placeCache.set;
  const set = new Set<number>();
  for (let j = 0; j < s.n; j++) for (let i = 0; i < s.n; i++) if (allowedDirs(s, placing.id, i, j, placing.move).length) set.add(j * s.n + i);
  placeCache = { key, set };
  return set;
}

/** 画面の真ん中のマス */
const centerCell = () => pick(cam, W, H, W / 2, H / 2);

/** 置くモードを始める（at があればそのマスへ） */
function startPlacing(id: string, opts: { move?: number; at?: [number, number]; dir?: Dir } = {}) {
  closePop();
  menu = null;
  sub = null;
  const [i, j] = opts.at ?? centerCell();
  placing = { id, dir: opts.dir ?? 'rd', i, j, move: opts.move };
  fitDir();
  if (opts.at) tweenTo(i, j);
  sfx.play('move');
  renderAll();
}

/** 置く建物を (i, j) へ。マスが変わったら音を鳴らす */
function setGhost(i: number, j: number) {
  if (!placing || (placing.i === i && placing.j === j)) return;
  placing.i = i;
  placing.j = j;
  fitDir();
  sfx.play('move');
  renderPlace();
}

/** マスを画面の真ん中へ動かす */
function tweenTo(i: number, j: number) {
  tween = { x0: cam.x, y0: cam.y, x1: (i - j) * 100, y1: (i + j) * 55, t0: performance.now() };
}

/** 置けない理由（短く。地図の建物のそばに出す） */
function reasonOf(err: PlaceErr | null): string {
  if (!err || !placing) return '';
  if (err === 'ground') {
    const onRoad = cells(DEF[placing.id], placing.i, placing.j, placing.dir).some(([x, y]) => ground(s, x, y) === 'road');
    return onRoad ? t('道路には置けません', 'Not on a road') : t('ここには置けません', 'Can’t build here');
  }
  if (err === 'taken') return t('建物があります', 'Already built on');
  if (err === 'road') return t('道路に面していません', 'Doesn’t face a road');
  if (err === 'money') return t('資金が足りません', 'Not enough funds');
  return ERR[err];
}

function tryPlace() {
  if (!placing) return;
  const err = placeErr();
  if (err) {
    sfx.play('error');
    return;
  }
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
      // お金が減るときは資金の演出で同じ音が鳴る。無料（工房）のときだけここで鳴らす
      if (!P1B[placing.id].cost) sfx.play('place');
      else setTimeout(() => sfx.play('place'), 120);
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
  root.classList.toggle('is-placing', !!placing);
  canvas.classList.toggle('is-placing', !!placing);
  selBox.hidden = !placing;
  ghostUi.hidden = !placing;
  if (!placing) return;
  const moving = placing.move != null;
  const name = DEF[placing.id].name;
  selBox.replaceChildren(
    h('div', 'isl-sel-name', moving ? t(`移転：${name}`, `Moving: ${name}`) : t(`選択中：${name}`, `Selected: ${name}`)),
    btn(t('戻る', 'Back'), () => {
      const was = placing;
      placing = null;
      // 建築から来たときは建物の一覧へ戻る
      if (was && was.move == null) {
        menu = 'plan';
        sub = 'build';
      }
      renderAll();
    }),
  );
  const err = placeErr();
  const dirs = allowedDirs(s, placing.id, placing.i, placing.j, ignoreOf());
  const row = h('div', 'isl-row');
  if (err) row.append(h('span', 'isl-reason', reasonOf(err)));
  else {
    const cost = moving ? moveCost(s.buildings.find((b) => b.uid === placing!.move)!) : P1B[placing.id].cost;
    row.append(btn(moving ? t(`ここへ移転 ${money(cost)}`, `Move here ${money(cost)}`) : cost ? t(`建てる ${money(cost)}`, `Build ${money(cost)}`) : t('建てる', 'Build'), tryPlace, 'is-on'));
  }
  if (dirs.length > 1)
    row.append(
      btn('↻', () => {
        if (!placing) return;
        const ok = allowedDirs(s, placing.id, placing.i, placing.j, ignoreOf());
        if (ok.length) placing.dir = ok[(ok.indexOf(placing.dir) + 1) % ok.length];
        sfx.play('move', 0.7);
        renderPlace();
      }, 'isl-rot'),
    );
  ghostUi.classList.toggle('is-bad', !!err);
  ghostUi.replaceChildren(...siteCard(placing.id, placing.i, placing.j, placing.dir, placing.move), row);
  placeGhostUi();
}

/**
 * 出店の下見：お店なら、ここでの見込み（月に何個）・他社と自社のお店から取る数・近くの家・工房からの日数。
 * 物流拠点なら、お店ごとの片道の日数がどう縮むか。
 */
function siteCard(id: string, i: number, j: number, dir: Dir, move?: number): HTMLElement[] {
  const kind = P1B[id]?.kind;
  if (kind === 'shop') {
    // 移転の下見は、いまのお店を外して考える
    const self = move != null ? s.buildings.find((b) => b.uid === move) : null;
    const saved = self ? s.buildings.splice(s.buildings.indexOf(self), 1) : [];
    const info = siteInfo(s, id, i, j, dir);
    if (saved.length) s.buildings.push(...saved);
    if (!info) return [];
    const c = h('div', 'isl-site');
    // チュートリアル：お店の場所の選び方を一言
    const say = tutStep()?.tips?.place?.(s);
    if (say) {
      const p = h('p', 'isl-site-tip');
      p.append(rich(say));
      c.append(p);
    }
    const name = PRODUCT[info.key]?.name ?? info.key;
    const head = h('div', 'isl-site-head');
    head.append(h('small', '', t(`${name}の見込み`, `${name} forecast`)), h('b', '', t(`月 ${Math.round(info.units)} 個`, `${Math.round(info.units)}/mo`)));
    c.append(head);
    const rows = h('div', 'isl-site-rows');
    const row = (label: string, v: string, cls = '') => {
      const r = h('div', `isl-site-row ${cls}`);
      r.append(h('span', '', label), h('b', '', v));
      rows.append(r);
    };
    row(t('近くの家', 'Homes nearby'), t(`${info.homes} 軒`, `${info.homes}`));
    if (info.fromRivals >= 0.5) row(t('他社から奪う', 'Taken from rivals'), t(`${info.fromRivals.toFixed(1)} 個`, `${info.fromRivals.toFixed(1)}`), 'is-good');
    if (info.rivals) row(t('近くの競合', 'Rivals nearby'), t(`${info.rivals} 社`, `${info.rivals}`), 'is-warn');
    if (info.fromMine >= 0.5) row(t('自社の店と取り合い', 'Cannibalized'), t(`−${info.fromMine.toFixed(1)} 個`, `−${info.fromMine.toFixed(1)}`), 'is-bad');
    row(t('工房から', 'From workshop'), info.days < 0.5 ? t('すぐ近く', 'Right nearby') : t(`片道 ${info.days.toFixed(1)} 日`, `${info.days.toFixed(1)} d one way`), info.days > 2.5 ? 'is-warn' : '');
    c.append(rows);
    return [c];
  }
  if (kind === 'depot') {
    const list = depotInfo(s, i, j, dir);
    const c = h('div', 'isl-site');
    const head = h('div', 'isl-site-head');
    head.append(h('small', '', t('お店までの片道', 'One way to shops')));
    c.append(head);
    const rows = h('div', 'isl-site-rows');
    if (!list.length) rows.append(h('small', 'isl-dim', t('お店がまだありません', 'No shops yet')));
    for (const x of list) {
      const r = h('div', `isl-site-row ${x.after < x.before - 0.05 ? 'is-good' : ''}`);
      r.append(h('span', '', DEF[x.shop.id].name), h('b', '', x.after < x.before - 0.05 ? t(`${x.before.toFixed(1)} → ${x.after.toFixed(1)} 日`, `${x.before.toFixed(1)} → ${x.after.toFixed(1)} d`) : t(`${x.before.toFixed(1)} 日（変わらない）`, `${x.before.toFixed(1)} d (no change)`)));
      rows.append(r);
    }
    c.append(rows);
    return [c];
  }
  return [];
}

/** 理由・建てるボタンを、置く建物の真下に */
function placeGhostUi() {
  if (!placing || ghostUi.hidden) return;
  const sx = ((placing.i - placing.j) * 100 - cam.x) * cam.zoom + W / 2;
  const sy = ((placing.i + placing.j) * 55 - cam.y) * cam.zoom + H / 2;
  ghostUi.style.left = `${Math.round(sx)}px`;
  ghostUi.style.top = `${Math.round(sy + 60 * cam.zoom + 8)}px`;
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
      startPlacing(b.id, { move: uid, at: [b.i, b.j], dir: b.dir });
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
    gate: () => payGate(),
  });
  popTitle.textContent = title;
  popBody.replaceChildren(body);
  popBody.scrollTop = y;
  popEl.hidden = false;
  placePop();
  dirty = true;
}
/** 関所の通行料を払って開通する */
function payGate() {
  const toll = gateToll(s);
  if (!openGate(s)) {
    sfx.play('error');
    return;
  }
  sfx.play('spend');
  setTimeout(() => sfx.play('win'), 160);
  closePop();
  save();
  renderAll();
  const g = gateOf(s);
  if (g) centerOn(g.i, g.j);
  talk(
    [
      { text: t(`通行料 ${money(toll)} を納めて、[[関所]]が開いたよ！`, `You paid the ${money(toll)} toll and the [[gate]] is open!`) },
      { text: t('この先は、となりのランドセクタ。新しいお客さんと、新しいライバルが待っているはずだよ。', 'Beyond lies the next land sector, with new customers and new rivals.') },
      { text: t('次のセクタの準備はまだ途中なんだ。整うまで、このエリアで会社を育てておこうね！', 'The next sector is still being prepared. Until then, keep growing the company here!') },
    ],
    t('楽しみ！', 'Can’t wait!'),
    () => renderAll(),
  );
}

/** 関所のマスを開く（カメラも寄せる） */
function showGate() {
  const g = gateOf(s);
  if (g) openPop(g.i, g.j);
}

/** 吹き出しを、マスの真下に（しっぽはマスを指す） */
function placePop() {
  if (!pop || popEl.hidden) return;
  const b = selected != null ? s.buildings.find((x) => x.uid === selected) : null;
  const [i, j] = b ? [b.i, b.j] : pop;
  const sx = ((i - j) * 100 - cam.x) * cam.zoom + W / 2;
  const sy = ((i + j) * 55 - cam.y) * cam.zoom + H / 2;
  // PC は右端に縦のメニュー（下には無い）。そのぶん横を空け、下は画面の端まで使う
  const fr = foot.getBoundingClientRect();
  const rail = fr.height > fr.width;
  const right = rail ? fr.left : W;
  const w = Math.min(400, right - 16);
  const left = Math.max(8, Math.min(right - w - 8, sx - w / 2));
  const top = sy + 40 * cam.zoom + 12;
  const bottom = rail ? H - 8 : fr.top - 8;
  popEl.style.width = `${w}px`;
  popEl.style.left = `${left}px`;
  popEl.style.top = `${top}px`;
  popEl.style.maxHeight = `${Math.max(140, bottom - top)}px`;
  popTail.style.left = `${Math.max(16, Math.min(w - 16, sx - left))}px`;
}

/** カメラをマスへ動かす（吹き出しが下に入るよう、マスは画面の上のほうへ） */
let tween: { x0: number; y0: number; x1: number; y1: number; t0: number; z0?: number; z1?: number; dur?: number } | null = null;
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

// ---------------------------------------------------------------- チュートリアル中のロック

const tutStep = (): TutStep | undefined => {
  const k = tutOf(s);
  return k < TUT_DONE ? TUT[k] : undefined;
};

/** チュートリアル中、いまの段で使わないメニューはロック（システムはいつでも開ける） */
function menuLocked(m: Menu): boolean {
  const st = tutStep();
  if (!st || m === 'sys') return false;
  const [hm] = hlOf(st, s).split(':');
  return hm !== m && !(st.open ?? []).includes(m);
}

/** 光らせている小メニューがあれば、同じメニューのほかの小メニューはロック */
function subLocked(m: Menu, key: string): boolean {
  const st = tutStep();
  if (!st || m === 'sys') return false;
  const [hm, hk] = hlOf(st, s).split(':');
  if (hm === m) return !!hk && hk !== key;
  return menuLocked(m);
}

function lockedNote() {
  const st = tutStep();
  sfx.play('error');
  if (st) toast(plain(t(`いまは「${st.goal(s)}」をしよう！`, `For now: ${st.goal(s)}!`)));
}

// ---------------------------------------------------------------- 右上の「ミッション」（いまやること・受けた依頼）

const missionBox = h('div', 'isl-missions');
let missionKey = '';
let missionFold = false;
/** いまクリアした段（チェックと取り消し線を見せてから、次の段へ入れ替える） */
let cleared: { goal: string; checks: string[]; until: number } | null = null;
/** いま付いたチェック（この 1 回の描き直しだけ、ポンと出す） */
let justChecked = new Set<string>();
let prevChecks = new Map<string, boolean>();

function renderMissions() {
  const st = tutStep();
  const now = performance.now();
  const showCleared = (!!cleared && now < cleared.until) || !!pendingClear;
  // 小さなチェックが付いた瞬間に音
  if (st?.checks && !showCleared) {
    for (const [label, ok] of st.checks) {
      const v = ok(s, seenNow());
      const key = `${st.id}:${label}`;
      if (v && prevChecks.get(key) === false) {
        justChecked.add(key);
        sfx.play('check');
      }
      prevChecks.set(key, v);
    }
  }
  const active = activeMissions(s);
  const items: unknown[] = [missionFold, pendingClear, showCleared ? cleared : null, st && !showCleared ? [st.id, st.goal(s), (st.checks ?? []).map(([l, ok]) => [l, ok(s, seenNow())])] : null, active.map((m) => [m.id, s.missions[m.id], missionProgress(s, m.id)]), [...justChecked]];
  const key = JSON.stringify(items);
  missionBox.hidden = !!placing || (!st && !showCleared && !active.length);
  if (key === missionKey) return;
  missionKey = key;
  const head = h('button', 'isl-missions-head');
  head.type = 'button';
  head.append(h('b', '', t('ミッション', 'Missions')), h('span', '', missionFold ? '▸' : '▾'));
  head.addEventListener('click', () => {
    missionFold = !missionFold;
    renderMissions();
  });
  const list = h('div', 'isl-missions-list');
  list.hidden = missionFold;
  if (pendingClear) {
    // 画面を閉じるまでは、チェックだけ付けて待つ（はんこと取り消し線は地図に戻ってから）
    const row = h('div', 'isl-mis is-tut is-waiting');
    row.append(h('span', 'isl-mis-box', '✓'), h('b', 'isl-mis-text', pendingClear.goal));
    for (const label of pendingClear.checks) row.append(h('small', 'isl-mis-check is-on', `✓ ${label}`));
    list.append(row);
  } else if (showCleared && cleared) {
    const row = h('div', 'isl-mis is-tut is-cleared');
    row.append(h('span', 'isl-mis-box', '✓'), h('b', 'isl-mis-text', cleared.goal), h('span', 'isl-mis-stamp', t('クリア！', 'Clear!')));
    for (const label of cleared.checks) row.append(h('small', 'isl-mis-check is-on', `✓ ${label}`));
    list.append(row);
  } else if (st) {
    const row = h('button', `isl-mis is-tut ${cleared ? 'is-new' : ''}`);
    row.type = 'button';
    row.append(h('span', 'isl-mis-box', ''), h('b', 'isl-mis-text', st.goal(s)));
    for (const [label, ok] of st.checks ?? []) {
      const v = ok(s, seenNow());
      const k2 = `${st.id}:${label}`;
      row.append(h('small', `isl-mis-check ${v ? 'is-on' : ''} ${justChecked.has(k2) ? 'is-just' : ''}`, (v ? '✓ ' : '· ') + label));
    }
    const a = actOf(st, s);
    if (a) {
      row.append(h('small', 'isl-mis-go', `${a[0]} ▶`));
      row.addEventListener('click', () => tutGo(a[1]));
    }
    list.append(row);
  }
  for (const m of active) {
    const done = s.missions[m.id] === 'done';
    const row = h('div', `isl-mis ${done ? 'is-done' : ''}`);
    row.append(h('span', 'isl-mis-box', done ? '✓' : ''), h('b', 'isl-mis-text', m.title));
    const pr = missionProgress(s, m.id);
    row.append(h('small', 'isl-dim', pr && !done ? t(`${m.text}（${pr[0]} / ${pr[1]}）`, `${m.text} (${pr[0]} / ${pr[1]})`) : m.text));
    if (done)
      row.append(
        btn(t(`報酬 ${money(m.reward)} を受け取る`, `Claim ${money(m.reward)}`), () => {
          if (!claim(s, m.id)) {
            sfx.play('clear');
            toast(t(`報酬 ${money(m.reward)} を受け取りました`, `Received ${money(m.reward)}`));
          }
          save();
          renderAll();
        }, 'is-on'),
      );
    list.append(row);
  }
  justChecked = new Set();
  missionBox.replaceChildren(head, list);
}

/** マインちゃんのほめ言葉（上に少しだけ出る） */
function praise(text: string) {
  for (const old of root.querySelectorAll('.isl-praise')) old.remove();
  const e = h('div', 'isl-praise');
  const im = h('img');
  im.src = assetUrl('mch/Image/Characters/navi_ain_cross_01_smile.png');
  im.alt = '';
  const p = h('p');
  p.append(rich(text));
  e.append(im, p);
  root.append(e);
  setTimeout(() => e.remove(), 2600);
}

/** 下の帯の小メニューをコードから開く（チュートリアルの吹き出し・撮影スクリプト用） */
function goSub(m: Exclude<Menu, 'skill'>, key: string) {
  const x = SUBS[m].find((y) => y.key === key);
  if (!x) return;
  menu = m;
  openSub(x);
}

// ---------------------------------------------------------------- チュートリアル（tut.ts の段を進める）

/** この段に入ってから閉じた画面（「見た」の判定は閉じたときにする。読んでいる途中で案内が消えないように） */
let tutSeen = new Set<string>();
let tutOpen: string | null = null;
/** 閉じた画面と、いま開いている画面（ミッションの小さなチェック用） */
const seenNow = () => (tutOpen ? new Set([...tutSeen, tutOpen]) : tutSeen);

// 地図の建物を指さす（チュートリアルで、建物の中を開いてほしいとき）
const pointEl = h('div', 'isl-point', '👈');
pointEl.hidden = true;
function updatePoint() {
  const what = pointOf(tutStep());
  const b = what === 'workshop' ? myWorkshop(s) : what === 'shop' ? myShops(s)[0] : undefined;
  const show = !!b && !placing && !pop && !sheetOpen() && !root.querySelector('.isl-modal');
  pointEl.hidden = !show;
  if (!show || !b) return;
  const x = ((b.i - b.j) * 100 - cam.x) * cam.zoom + W / 2;
  const y = ((b.i + b.j) * 55 - cam.y) * cam.zoom + H / 2;
  // 建物の右横から指さす（上は施設の吹き出し、右上はミッションと重なるので）
  pointEl.style.left = `${Math.round(x + 95 * cam.zoom)}px`;
  pointEl.style.top = `${Math.round(y - 70 * cam.zoom)}px`;
}
let tutIntro = -1;
/** クリアの手ごたえを見せてから、次の会話を出す */
let tutIntroAfter = 0;
/** クリアしたが、まだ手ごたえを見せていない段（画面を開いているあいだにクリアしたとき） */
let pendingClear: { goal: string; checks: string[]; praise?: string; focus?: 'workshop' | 'shop' } | null = null;
/** クリアの手ごたえを見せる長さ（建物へ寄るときは少し長く） */
const CELEBRATE_MS = 2200;

/** 自分の工房・お店へカメラを寄せる（チュートリアルで、できたものを見せる） */
function focusOn(what: 'workshop' | 'shop') {
  const b = what === 'workshop' ? myWorkshop(s) ?? s.buildings.find((x) => x.owner === 'me' && x.id === 'workshop') : myShops(s)[0] ?? s.buildings.find((x) => x.owner === 'me' && P1B[x.id]?.kind === 'shop');
  if (!b) return;
  const z = innerWidth < 600 ? 0.75 : 1;
  // 建物の絵は基準のマスより上に伸びるので、少し上を真ん中に
  tween = { x0: cam.x, y0: cam.y, x1: (b.i - b.j) * 100, y1: (b.i + b.j) * 55 - 40, t0: performance.now(), z0: cam.zoom, z1: z, dur: 900 };
}

function tutGo(go: TutGo) {
  if (go === 'build') openBuildTab();
  else if (go === 'workshop' || go === 'shop') {
    // 建物の中の画面は、地図の建物から開いてもらう（次から自分で開けるように）。ここではカメラを寄せて指さすだけ
    closeSheet();
    closePop();
    menu = null;
    sub = null;
    focusOn(go);
  } else if (go === 'staff') goSub('hr', 'staff');
  else if (go === 'hire') goSub('hr', 'hire');
  else if (go === 'ranking') goSub('mkt', 'ranking');
  else if (go === 'buy') goSub('scm', 'buy');
  else if (go === 'scm') goSub('scm', 'flow');
  else if (go === 'skills') pickMenu('skill');
  renderAll();
}

/** 画面の上のマインちゃんの一言。その段に決まった一言が無ければ、いまやることを言う */
function tutTip(screen: string): string | null {
  const k = tutOf(s);
  if (k >= TUT_DONE || !TUT[k]) return null;
  if (tutOpen && tutOpen !== screen) tutSeen.add(tutOpen);
  tutOpen = screen;
  const st = TUT[k];
  const tip = st.tips?.[screen];
  if (tip) return tip(s);
  return st.intro && !actOf(st, s) ? null : st.say(s);
}

const tutFree = () => !placing && !sheetOpen() && !pop && !root.querySelector('.isl-modal');

/** 段の条件を見て進める。新しい段に説明の札があれば、画面が空いたときに出す */
function tutTick() {
  let k = tutOf(s);
  if (k >= TUT_DONE) {
    sideIntro();
    return;
  }
  if (tour) return;
  if (s.tut !== k) s.tut = k;
  if (tutOpen && !sheetOpen()) {
    tutSeen.add(tutOpen);
    tutOpen = null;
  }
  let moved = false;
  while (k < TUT.length && TUT[k].done(s, tutSeen)) {
    k++;
    moved = true;
    tutSeen = new Set();
  }
  if (moved) {
    const done = TUT[k - 1];
    s.tut = k;
    save();
    // クリアの手ごたえは、地図が見えるとき（画面を閉じたあと）に出す
    pendingClear = { goal: done.goal(s), checks: (done.checks ?? []).map(([l]) => l), praise: done.praise, focus: TUT[k]?.focus };
    if (sheetOpen()) refreshSheet();
  }
  // 地図が見えたら：建物へ寄って、右上のミッションにチェックと取り消し線、音、マインちゃんのひとこと。
  // 一拍おいてから（CELEBRATE_MS）、次の会話へ
  // 建物の吹き出しから開いた画面を閉じたら、吹き出しも閉じて、地図でクリアを見せる
  if (pendingClear && pop && !sheetOpen() && !placing) closePop();
  if (pendingClear && tutFree()) {
    const c = pendingClear;
    pendingClear = null;
    const now = performance.now();
    const hold = c.focus ? CELEBRATE_MS + 900 : CELEBRATE_MS;
    cleared = { goal: c.goal, checks: c.checks, until: now + hold };
    tutIntroAfter = now + hold + 200;
    sfx.play('clear');
    if (c.praise) praise(c.praise);
    if (c.focus) focusOn(c.focus);
    setTimeout(() => renderAll(), hold + 250);
  }
  if (pendingClear) return;
  if (k >= TUT.length) {
    if (!tutFree() || performance.now() < tutIntroAfter) return;
    s.tut = TUT_DONE;
    save();
    talk(TUT_END, t('はじめる', 'Let’s go'), () => {
      speed = 1;
      renderAll();
    });
    return;
  }
  const st = TUT[k];
  // 初売上のお祝い：ヒーローを雇えるように「人材の募集」を贈る
  if (st.id === 'scm' && !s.skills.includes('hire')) {
    s.skills.push('hire');
    save();
  }
  // 初売上までの流れを、地図の上で順に見せる（スキップできない）
  if (st.id === 'firstSale' && !s.flags.tour && tutFree() && performance.now() >= tutIntroAfter) {
    startTour();
    return;
  }
  if (st.intro && tutIntro !== k && tutFree() && performance.now() >= tutIntroAfter) {
    tutIntro = k;
    talk(st.intro.pages, st.intro.ok, () => {
      const a = actOf(st, s);
      if (a) tutGo(a[1]);
      else renderAll();
    });
  }
}

/** 資金が少なくなったら、一度だけマインちゃんが「他店でバイト」を紹介する */
function sideIntro() {
  if (s.flags.side || s.money > SIDE.rescue || !tutFree() || !myWorkshop(s)) return;
  s.flags.side = true;
  save();
  talk(
    [
      { text: t('資金が少なくなってきたね……。このままだと、素材もお給料も払えなくなっちゃう。', 'Funds are getting low… At this rate we can’t pay for materials or wages.') },
      { text: t('そんなときは、ヒーローに[[他店でバイト]]してもらおう！ 日給がもらえて、腕が上がることもあるよ。', 'When that happens, send heroes to [[work part-time]] at other stores! They earn a daily wage and might even improve.') },
      { text: t('「営業企画」→「他店でバイト」か、地図の他社のお店から頼めるよ。', 'Use Planning → Part-time, or tap a rival store on the map.') },
    ],
    t('バイトを探す', 'Find work'),
    () => goSub('plan', 'side'),
  );
}

// ---------------------------------------------------------------- 初売上までの流れの案内（①調達 → ②製造 → ③物流 → ④販売。スキップできない）

type TourKey = 'intro' | 'buy' | 'craft' | 'haul' | 'sell' | 'end';
type TourEv = 'made' | 'dropped' | 'sold';
interface TourStage {
  key: TourKey;
  label: string;
  /** はじめの一言・できごとのあとの一言 */
  say: string;
  then?: string;
  /** 待つできごと（無ければ一言を読む時間だけ） */
  wait?: TourEv;
  /** ゲームの速さ（できごとを待つあいだ） */
  speed: number;
}
const TOUR: TourStage[] = [
  { key: 'intro', label: '', say: t('準備ばっちり！ ここから、エクステが売れるまでの流れを一緒に見てみよう。', 'All set! Let’s watch how an Extension gets from start to sale.'), speed: 0 },
  { key: 'buy', label: t('① 調達', '① Buy'), say: t('まずは[[① 調達]]。卸問屋から、工房へ素材が届くよ。', 'First, [[① Buy]]: materials travel from the wholesaler to the workshop.'), then: t('素材がないと、工房は何も作れないんだ。', 'Without materials, the workshop can’t make anything.'), speed: 0.3 },
  { key: 'craft', label: t('② 製造', '② Craft'), say: t('[[② 製造]]。職人が作業台でセンスを作っているよ。建物のまわりの輪が一周したら、できあがり！', '[[② Craft]]: the crafter is making Sensu. When the ring around the building completes, a batch is done!'), then: t('できた！ 作るには、何日か時間がかかるんだね。', 'Done! Crafting takes a few days.'), wait: 'made', speed: 1 },
  { key: 'haul', label: t('③ 物流', '③ Haul'), say: t('[[③ 物流]]。できたセンスを、荷車がお店まで運ぶよ。', '[[③ Haul]]: a cart carries the Sensu to the shop.'), then: t('お店に着いた！ 遠いお店ほど、運ぶのに日数がかかるよ。', 'Delivered! The farther the shop, the longer it takes.'), wait: 'dropped', speed: 1 },
  { key: 'sell', label: t('④ 販売', '④ Sell'), say: t('[[④ 販売]]。棚に並んだら、お客さんが来るのを待とう。', '[[④ Sell]]: once it’s on the shelf, we wait for customers.'), then: t('売れた！ お客さんが買ってくれて、はじめて売上になるんだ。', 'Sold! Sales only happen when a customer buys.'), wait: 'sold', speed: 4 },
  { key: 'end', label: '', say: t('① 調達 → ② 製造 → ③ 物流 → ④ 販売。どれか 1 つでも止まると、売上も止まるよ。', '① Buy → ② Craft → ③ Haul → ④ Sell. If any one stops, sales stop too.'), speed: 0 },
];
/** 一言を読む時間（ミリ秒） */
const TOUR_READ = 3200;
/** できごとを待つ長さの上限（来なければ先へ） */
const TOUR_WAIT = 45000;

let tourReport: Parameters<typeof showReport>[0] | null = null;
let tour: { k: number; t0: number; ev: number | null; deliver?: { t0: number; dur: number; hero: number; mat: Mat } } | null = null;
const tourEl = h('div', 'isl-tour');
tourEl.hidden = true;

function startTour() {
  closeSheet();
  closePop();
  menu = null;
  sub = null;
  placing = null;
  tour = { k: 0, t0: performance.now(), ev: null };
  root.classList.add('is-tour');
  tourEl.hidden = false;
  tourStage();
}

/** 段に入る：カメラを寄せ、速さを決め、一言を出す */
function tourStage() {
  if (!tour) return;
  const st = TOUR[tour.k];
  tour.t0 = performance.now();
  tour.ev = null;
  speed = st.speed;
  renderHud();
  if (st.key === 'buy') {
    const mat = (s.slots.find((x) => x.sku)?.sku ? (Object.keys(recipeOf(s.slots.find((x) => x.sku)!.sku!))[0] as Mat) : 'wood') ?? 'wood';
    tour.deliver = { t0: performance.now(), dur: 4200, hero: GUESTS[3] ?? 1004, mat };
    const wh = wholesaler(s);
    if (wh) tween = { x0: cam.x, y0: cam.y, x1: (wh.i - wh.j) * 100, y1: (wh.i + wh.j) * 55 - 40, t0: performance.now(), z0: cam.zoom, z1: innerWidth < 600 ? 0.7 : 0.95, dur: 900 };
  } else {
    tour.deliver = undefined;
    if (st.key === 'haul') forceHaul(s);
    if (st.key === 'craft' || st.key === 'haul') focusOn('workshop');
    if (st.key === 'sell') focusOn('shop');
  }
  tourRender();
}

function tourOn(ev: TourEv | null, ev2: TourEv | null = null) {
  if (!tour) return;
  const st = TOUR[tour.k];
  if (tour.ev == null && st.wait && (ev === st.wait || ev2 === st.wait)) {
    tour.ev = performance.now();
    // ゆっくりにして、一言を読んでもらう（動きは止めない）
    speed = 0.3;
    sfx.play('check');
    tourRender();
  }
}

/** 毎フレーム：カメラで追いかける・時間で先へ進む */
function tourFrame(now: number) {
  if (!tour) return;
  const st = TOUR[tour.k];
  // 荷車・届ける人を追いかける
  let target: [number, number] | null = null;
  if (st.key === 'buy' && anim.buyer) {
    const p = along(anim.buyer.path, anim.buyer.k > 0.5 ? (1 - anim.buyer.k) * 2 : anim.buyer.k * 2);
    target = [p.i, p.j];
  }
  if (st.key === 'haul') {
    const trip = s.trips.find((x) => !x.dropped && myShops(s).some((b) => b.uid === x.to));
    const to = trip ? s.buildings.find((b) => b.uid === trip.to) : null;
    const from = trip ? ((trip.from != null ? s.buildings.find((b) => b.uid === trip.from) : null) ?? myWorkshop(s)) : null;
    if (trip && to && from) {
      const path = pathOf(doorOf(from), doorOf(to));
      if (path && path.length > 1) {
        const k = Math.min(1, (1 - (trip.left - acc / dayMs()) / trip.total) * 2);
        const p = along(path, Math.max(0, k));
        target = [p.i, p.j];
      }
    }
  }
  // スポットライト：届ける人・荷車を追い、工房・お店は建物に
  const bld = st.key === 'craft' || (st.key === 'haul' && !target) ? myWorkshop(s) : st.key === 'sell' ? myShops(s)[0] : null;
  if (!target && bld) target = [bld.i, bld.j];
  anim.spot = target ? { i: target[0], j: target[1], r: st.key === 'buy' || (st.key === 'haul' && !bld) ? 150 : 210 } : null;
  if (target && !tween && (st.key === 'buy' || st.key === 'haul')) {
    cam.x += ((target[0] - target[1]) * 100 - cam.x) * 0.08;
    cam.y += ((target[0] + target[1]) * 55 - 30 - cam.y) * 0.08;
  }
  dirty = true;
  // 次へ進む：待つできごとが無い段は読む時間、ある段はできごと（か上限）のあと読む時間
  const read = st.key === 'buy' ? 4400 : TOUR_READ;
  if (st.key === 'buy' && tour.ev == null && now - tour.t0 > 4300) {
    tour.ev = now;
    // 届いた素材：作業台で 2 回作れるぶん（この案内のあいだに、工房が止まらないように）
    const sl = s.slots.find((x) => x.sku);
    if (sl?.sku) for (const [m, q] of Object.entries(recipeOf(sl.sku))) s.mats[m as Mat] = Math.max(s.mats[m as Mat] ?? 0, (q ?? 0) * 2);
    sfx.play('check');
    tourRender();
  }
  if (st.wait && tour.ev == null && now - tour.t0 > TOUR_WAIT) {
    tour.ev = now;
    tourRender();
  }
  const ready = st.wait || st.key === 'buy' ? tour.ev != null && now - tour.ev > TOUR_READ : now - tour.t0 > read;
  if (!ready) return;
  if (tour.k < TOUR.length - 1) {
    tour.k++;
    tourStage();
    return;
  }
  // おしまい
  tour = null;
  anim.spot = null;
  root.classList.remove('is-tour');
  tourEl.hidden = true;
  s.flags.tour = true;
  speed = 1;
  save();
  renderAll();
  if (tourReport) {
    const r = tourReport;
    tourReport = null;
    showReport(r);
  }
}

function tourRender() {
  if (!tour) return;
  const st = TOUR[tour.k];
  const steps = h('div', 'isl-tour-steps');
  TOUR.filter((x) => x.label).forEach((x) => {
    const idx = TOUR.indexOf(x);
    steps.append(h('span', `isl-tour-step ${idx === tour!.k ? 'is-on' : idx < tour!.k ? 'is-done' : ''}`, x.label));
  });
  const box = h('div', 'isl-talk-box isl-tour-box');
  const mine = h('img', 'isl-talk-mine');
  mine.src = assetUrl(tour.ev != null ? 'mch/Image/Characters/navi_ain_cross_01_smile.png' : 'mch/Image/Characters/navi_ain_speak_00_talk.png');
  mine.alt = '';
  const text = h('p', 'isl-talk-text');
  text.append(rich(tour.ev != null && st.then ? st.then : st.say));
  const wait = h('small', 'isl-tour-wait', st.wait && tour.ev == null ? t('見守っていてね…', 'Watch…') : '');
  box.append(mine, h('b', 'isl-talk-name', t('マインちゃん', 'Mine-chan')), text, wait);
  tourEl.replaceChildren(steps, box);
}

/**
 * マインちゃんの会話：1 枚 1 メッセージ。押すと次の枚、最後の枚は ok のボタン。
 * 開いているあいだは時間が止まる（.isl-modal）。
 */
function talk(pages: TutPage[], ok: string, then: () => void) {
  const m = h('div', 'isl-modal isl-talk');
  const stage = h('div', 'isl-talk-stage');
  const box = h('div', 'isl-talk-box');
  const mine = h('img', 'isl-talk-mine');
  mine.alt = '';
  const name = h('b', 'isl-talk-name', t('マインちゃん', 'Mine-chan'));
  const text = h('p', 'isl-talk-text');
  const foot = h('div', 'isl-talk-foot');
  box.append(mine, name, text, foot);
  m.append(stage, box);
  let k = 0;
  const show = () => {
    const pg = pages[k];
    const last = k === pages.length - 1;
    mine.src = assetUrl(last ? 'mch/Image/Characters/navi_ain_cross_01_smile.png' : 'mch/Image/Characters/navi_ain_speak_00_talk.png');
    text.replaceChildren(rich(pg.text));
    stage.replaceChildren();
    if (pg.show === 'crew') stage.append(crewEl(pg.hero));
    else if (pg.show === 'cycle') stage.append(cycleEl());
    else if (pg.show === 'gift') stage.append(giftEl());
    stage.hidden = !pg.show;
    foot.replaceChildren(h('small', 'isl-dim', `${k + 1} / ${pages.length}`));
    foot.append(
      last
        ? btn(ok, () => {
            m.remove();
            then();
          }, 'is-on')
        : btn(t('次へ ▶', 'Next ▶'), () => next()),
    );
  };
  const next = () => {
    if (k < pages.length - 1) {
      k++;
      show();
    }
  };
  // 文のあたりを押しても次へ（最後の枚はボタンで）
  box.addEventListener('click', (e) => {
    if (!(e.target instanceof HTMLButtonElement)) next();
  });
  show();
  root.append(m);
}

/** 前の世界からついてきた 3 人（hero を前に出す） */
function crewEl(hero?: number): HTMLElement {
  const row = h('div', 'isl-crew');
  const role: Record<number, string> = {
    10003: t('手先が器用', 'Handy'),
    10002: t('話し上手', 'Smooth talker'),
    10001: t('力持ち', 'Strong'),
  };
  for (const id of [10003, 10002, 10001]) {
    const c = h('div', `isl-crew-one ${hero == null || hero === id ? '' : 'is-back'} ${hero === id ? 'is-on' : ''}`);
    c.append(heroIcon(id, 72), h('b', '', heroName(id)), h('small', '', role[id]));
    row.append(c);
  }
  return row;
}

/** お祝いの品（スキル「人材の募集」） */
function giftEl(): HTMLElement {
  const c = h('div', 'isl-gift');
  c.append(h('span', 'isl-gift-icon', '🎁'), h('b', '', t('人材の募集', 'Recruiting')), h('small', '', t('ヒーローを雇えるようになる', 'You can hire heroes')));
  return c;
}

/** ①調達 → ②製造 → ③物流 → ④販売 の図。担当がいる段に ✓ */
function cycleEl(): HTMLElement {
  const row = h('div', 'isl-cycle');
  const on = {
    buy: s.staff.some((x) => x.task === 'buy'),
    craft: s.slots.some((sl) => sl.worker != null && !!sl.sku),
    haul: s.staff.some((x) => x.task === 'transport'),
    sell: myShops(s).some((b) => s.shops[b.uid].staff != null || s.shops[b.uid].part > 0),
  };
  const items: [keyof typeof on, string, string, HTMLElement][] = [
    ['buy', t('① 調達', '① Buy'), t('素材を買う', 'Buy materials'), matIcon('wood' as Mat, 36)],
    ['craft', t('② 製造', '② Craft'), t('工房で作る', 'Craft'), skuIcon('Sensu:C', 36)],
    ['haul', t('③ 物流', '③ Haul'), t('お店へ運ぶ', 'Deliver'), h('span', 'isl-cycle-emoji', '🛒')],
    ['sell', t('④ 販売', '④ Sell'), t('お店で売る', 'Sell'), h('span', 'isl-cycle-emoji', '💰')],
  ];
  items.forEach(([k, name, note, icon], i) => {
    const c = h('div', `isl-cycle-step ${on[k] ? 'is-on' : ''}`);
    c.append(icon, h('b', '', name), h('small', '', note));
    if (on[k]) c.append(h('span', 'isl-cycle-ok', '✓'));
    row.append(c);
    if (i < items.length - 1) row.append(h('span', 'isl-cycle-arrow', '▶'));
  });
  return row;
}

function tutorial(): { text: string; action?: [string, () => void] } {
  const tk = tutOf(s);
  if (tk < TUT_DONE && TUT[tk]) {
    const st = TUT[tk];
    const a = actOf(st, s);
    return { text: st.say(s), action: a ? [a[0], () => tutGo(a[1])] : undefined };
  }
  const ws = s.buildings.find((b) => b.owner === 'me' && b.id === 'workshop');
  const shops = s.buildings.filter((b) => b.owner === 'me' && P1B[b.id]?.kind === 'shop');
  const rec = PRODUCT[recommend(s)].name;
  if (!ws) return { text: t('新天地へようこそ！まずは Workshop から引き継いだ「工房」を建てましょう。下の「営業企画」→「建築」から工房を選び、道路に面した空き地へ。入口は道路の方にしか向けられません。', 'Welcome to the new land! First, build the Workshop you brought from home: Planning → Build, then place it on a lot facing a road — the entrance can only face the road.'), action: [t('建築を開く', 'Open Build'), openBuildTab] };
  if (ws.left > 0) return { text: t('工房の工事中です。⏩ で時間を早められます。地図のマスを押すと、建物の詳しい情報が見られます。', 'The workshop is under construction. ⏩ speeds things up. Tap any tile on the map for details.') };
  if (!s.flags.data) return { text: t('[[市場データ]]で、売れ筋と、まだ誰も売っていない商品が分かるよ（「マーケティング」→「市場調査データ」）。', 'The [[market data]] shows what sells and what nobody sells yet (Marketing → Market data).'), action: [t('データを見る', 'Open data'), () => openData(ctx)] };
  if (!shops.length) return { text: t(`データによると「${rec}」がよさそう！次はお店（よろず屋）を建てましょう。道路に面した場所に。`, `The data says ${rec} looks promising! Next, build a shop (General store) facing a road.`), action: [t('建築を開く', 'Open Build'), openBuildTab] };
  if (shops.every((b) => b.left > 0)) return { text: t('お店の工事中です。開店した日から 1 か月目の営業が始まります。その間に工房で商品を作り始めましょう。', 'The shop is being built. Your first business month starts the day it opens. Start crafting meanwhile.'), action: [t('工房を開く', 'Open workshop'), () => openWorkshop(ctx)] };
  const crafting = s.slots.some((sl) => sl.running);
  const stockAny = Object.values(s.stock).some((n) => (n ?? 0) > 0) || s.trips.length > 0 || myShops(s).some((b) => Object.values(s.shops[b.uid].storage).some((n) => (n ?? 0) > 0) || Object.values(s.shops[b.uid].shelf).some((n) => (n ?? 0) > 0));
  if (!crafting && !stockAny) return { text: t(`工房で「${rec}」を作りましょう。職人はバランスの良い MCHアーティストが向いています。`, `Make ${rec} in the workshop. The well-balanced MCH Artist is the best crafter.`), action: [t('工房を開く', 'Open workshop'), () => openWorkshop(ctx)] };
  if (!s.staff.some((x) => x.task === 'transport')) return { text: t('できた商品をお店へ運ぶ人を決めましょう（「人事」→「ヒーローの配置」）。運搬は PHY の高い MCHウォーリアーが得意です。', 'Choose who hauls goods to the shop (HR → Assign heroes). MCH Warrior, with high PHY, is the best hauler.'), action: [t('配置を開く', 'Open staff'), () => openStaff(ctx)] };
  const shop = myShops(s)[0];
  const sh = shop ? s.shops[shop.uid] : null;
  if (sh && !sh.shelves[0]) return { text: t(`お店で、主力商品を「${rec}」に、店員を決めましょう。販売は INT の高い MCHタクティシャンが得意です。`, `In the shop, set ${rec} as the main product and choose a clerk. MCH Tactician, with high INT, sells best.`), action: [t('お店を開く', 'Open shop'), () => shop && openShop(ctx, shop.uid)] };
  const closed = myShops(s).find((b) => s.shops[b.uid].staff == null && s.shops[b.uid].part === 0);
  if (closed) return { text: t(`${DEF[closed.id].name}に店員がいないので休業中です。店員かアルバイトを決めましょう。販売は INT の高いヒーローが得意です。`, `${DEF[closed.id].name} is closed: nobody on the floor. Choose a clerk or part-timer. High-INT heroes sell best.`), action: [t('お店を開く', 'Open shop'), () => openShop(ctx, closed.uid)] };
  if (poolFree(s) <= 4 && !myWarehouses(s).length && !s.buildings.some((b) => b.owner === 'me' && b.id === 'warehouse')) return { text: t(`工房の物置（${STORE.base} 個）がいっぱいです。このままでは素材を買えず、できた商品も置けません。「建築」で倉庫を建てましょう。`, `The workshop stockroom (${STORE.base}) is full: you can’t buy materials or store goods. Build a warehouse under Build.`), action: [t('建築を開く', 'Open Build'), openBuildTab] };
  if (MISSIONS.some((m) => s.missions[m.id] === 'done')) return { text: t('依頼を達成しました！「マーケティング」→「依頼」で報酬を受け取りましょう。', 'You completed a request! Claim the reward under Marketing → Requests.'), action: [t('依頼を開く', 'Open requests'), () => openMissions(ctx)] };
  if (s.money <= SIDE.rescue && !s.staff.some((x) => x.task === 'side'))
    return { text: t('資金が少なくなってきたね。ヒーローに[[他店でバイト]]してもらえば、日給でお金を稼げるよ。腕が上がることもあるんだ！', 'Funds are running low. Send a hero to [[work part-time]] at another store for a daily wage. They might even improve!'), action: [t('バイトを探す', 'Find work'), () => goSub('plan', 'side')] };
  if (!activeMissions(s).length && !MISSIONS.some((m) => s.missions[m.id] === 'claimed')) return { text: t('町の人から[[依頼]]が届いているよ。「マーケティング」→「依頼」で受けてみよう！', 'People in town sent you [[requests]]. Accept one under Marketing → Requests!'), action: [t('依頼を開く', 'Open requests'), () => openMissions(ctx)] };
  if (!s.reports.length) return { text: t('準備ができました！お店を開いた日から 1 か月ごとに売上を締めます。流れが詰まっていないかは「SCM」→「サプライチェーン」で確かめられます。', 'All set! Sales close every month from the day your shop opened. Check for bottlenecks under SCM → Supply chain.'), action: [t('サプライチェーンを見る', 'Open supply chain'), () => openSupply(ctx)] };
  // 1 か月たってから
  const low = (Object.keys(MATS) as (keyof typeof MATS)[]).find((m) => s.slots.some((sl) => sl.sku && PRODUCT[skuParts(sl.sku)[0]].recipe[skuParts(sl.sku)[1]][m] && (s.mats[m] ?? 0) < 10));
  const buyer = s.staff.some((x) => x.task === 'buy');
  if (low && !buyer) return { text: t(`${MATS[low].name}が残り少なくなっています。「SCM」→「調達」で調達係を決めると、月の量を毎日自動で買い付けてくれます。`, `${MATS[low].name} is running low. Assign a buyer under SCM → Buy to purchase the monthly amounts automatically.`), action: [t('調達を開く', 'Open buy'), () => openBuy(ctx)] };
  if (low) return { text: t(`${MATS[low].name}が残り少なくなっています。「調達」で月の量を増やすか、いますぐ買い足しましょう（月の上限に注意）。`, `${MATS[low].name} is running low. Raise its monthly amount under Buy or buy some now (mind the monthly limit).`), action: [t('調達を開く', 'Open buy'), () => openBuy(ctx)] };
  if (s.staff.some((x) => x.resting)) return { text: t('休んでいる従業員がいます。「人事」→「給与・労務」の賞与ですぐ元気にできます。人手が足りないときは「人材登用」で雇えます。', 'Someone is resting. A bonus (HR → Pay & welfare) refreshes them at once; hire more under Recruiting.'), action: [t('給与・労務を開く', 'Open pay'), () => openPayroll(ctx)] };
  const last = s.reports[s.reports.length - 1];
  if (s.cleared && !s.gateOpen) return { text: t(`エリア 1 位、おめでとう！ランドのふちの[[関所]]は、通行料 ${money(gateToll(s))} で開通できるよ。開けると、となりのランドセクタへ進めるんだ。`, `Congratulations on #1 in the area! The [[gate]] at the edge of the land opens for a ${money(gateToll(s))} toll and leads to the next land sector.`), action: [t('関所を見る', 'View the gate'), () => showGate()] };
  if (s.cleared) return { text: t('関所が開通しました！となりのランドセクタは準備中です。このまま会社を育てられます。', 'The gate is open! The next land sector is coming soon. Keep growing the company.') };
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
  const p = h('p');
  p.append(rich(tip.text));
  p.addEventListener('click', () => {
    hiddenTip = tip.text;
    advisor.hidden = true;
  });
  bubbleBox.replaceChildren(p);
  if (tip.action) bubbleBox.append(btn(tip.action[0], tip.action[1], 'is-on'));
}

// ---------------------------------------------------------------- システム・お祝い

function modal(title: string, body: string | HTMLElement, actions: [string, () => void, string?][], face = false) {
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
  box.append(head, typeof body === 'string' ? h('p', '', body) : body, row);
  m.append(box);
  root.append(m);
}

/**
 * システムの画面（設定・進行速度・セーブ・テスト）。ほかの事業と同じく札で開くので、サブタブで切り替えられる。
 * buttons は描き直すたびに作り直す（押したあとの表示が変わるため）
 */
function sysSheet(title: string, note: string, buttons: () => [string, () => void, string?][]) {
  openSheet(ctx, title, (body) => {
    body.append(h('p', 'isl-dim', note));
    const list = h('div', 'isl-sys-list');
    for (const [label, on, cls] of buttons())
      list.append(
        btn(
          label,
          () => {
            on();
            refreshSheet();
            renderAll();
          },
          cls,
        ),
      );
    body.append(list);
  });
}

function openSettings() {
  sysSheet(t('設定', 'Settings'), t('言語・マインちゃんの案内・音・街の人通りを切り替えます。', 'Language, Mine-chan’s guide, sound and crowd.'), () => [
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
      },
    ],
    [vol.bgm > 0 ? t('BGM を消す', 'BGM off') : t('BGM を流す', 'BGM on'), () => setVol({ bgm: vol.bgm > 0 ? 0 : 1 })],
    [vol.se > 0 ? t('効果音を消す', 'Sound effects off') : t('効果音を出す', 'Sound effects on'), () => setVol({ se: vol.se > 0 ? 0 : 1 })],
    [
      t(`街の人通り：${CROWD_LEVELS[crowdLevel].name}`, `Crowd: ${CROWD_LEVELS[crowdLevel].name}`),
      () => {
        crowdLevel = (crowdLevel + 1) % CROWD_LEVELS.length;
        try {
          localStorage.setItem(CROWD_KEY, CROWD_LEVELS[crowdLevel].key);
        } catch {
          // 保存できなくても切り替える
        }
        toast(t(`街の人通り：${CROWD_LEVELS[crowdLevel].name}（重いときは少なく）`, `Crowd: ${CROWD_LEVELS[crowdLevel].name} (lower it if the game feels slow)`));
      },
    ],
    ...(tutOf(s) < TUT_DONE
      ? [
          [
            t('チュートリアルを終える', 'End the tutorial'),
            () => {
              s.tut = TUT_DONE;
              save();
            },
          ] as [string, () => void],
        ]
      : []),
  ]);
}

/** 進行速度：標準・1.5 倍・2 倍（スキルで選べるようになる） */
function openPace() {
  sysSheet(
    t('進行速度', 'Game speed'),
    t(`いまは ${s.pace ?? 1} 倍（1 日 ${(dayMs() / 1000).toFixed(1)} 秒・ひと月 ${Math.round((dayMs() * 30) / 1000)} 秒）。速くするには、スキルツリー（経営）の「業務の効率化」「業務の自動化」が要ります。⏩ はその場だけの早送りです。`, `Now ${s.pace ?? 1}× (a day is ${(dayMs() / 1000).toFixed(1)} s, a month ${Math.round((dayMs() * 30) / 1000)} s). Faster speeds need the Operations skills. ⏩ is a temporary fast-forward.`),
    () =>
      PACES.map((x): [string, () => void, string?] => {
        const ok = !x.skill || s.skills.includes(x.skill);
        return [
          !ok ? t(`${x.v} 倍（スキルで解放）`, `${x.v}× (skill)`) : x.v === 1 ? t('標準', 'Normal') : t(`${x.v} 倍`, `${x.v}×`),
          () => {
            if (!ok) {
              toast(t('スキルツリーの「経営」で解放できます', 'Unlock it in the Operations skills'));
              return;
            }
            s.pace = x.v;
            save();
          },
          x.v === (s.pace ?? 1) ? 'is-on' : '',
        ];
      }),
  );
}

function setVol(v: Partial<typeof vol>) {
  vol = { ...vol, ...v };
  sound.setVolumes(vol);
  sfx.level = vol.se;
  try {
    localStorage.setItem(SOUND, JSON.stringify(vol));
  } catch {
    // 保存できなくても切り替える
  }
}

function openSaveMenu() {
  sysSheet(t('セーブ', 'Save'), t('フェーズ 1「新天地で実績を上げろ」。進み具合はこのブラウザに自動で保存されます。', 'Phase 1: “Make your name in the new land”. Progress is saved in this browser automatically.'), () => [
    [
      t('最初から', 'Start over'),
      () =>
        modal(t('最初からやり直しますか？', 'Start over?'), t('いまの会社は消えます。', 'Your current company will be lost.'), [
          [t('やり直す', 'Start over'), () => restart(), 'is-danger'],
          [t('やめる', 'Cancel'), () => undefined],
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
  sysSheet(t('テスト用', 'Test tools'), t('?test=2 のときだけ出ます。', 'Shown only with ?test=2.'), () => [
    [t('資金 +50,000', 'Funds +50,000'), () => (s.money += 50000)],
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

/** 広い画面（PC）では、事業別メニューを画面の右に縦に並べる。スマホは下の帯のまま */
const RAIL = matchMedia('(min-width: 1000px) and (min-height: 560px) and (orientation: landscape)');
RAIL.addEventListener('change', () => renderAll());
function layout() {
  const rail = RAIL.matches;
  root.classList.toggle('is-rail', rail);
  root.style.setProperty('--rail-w', rail ? `${Math.round(foot.getBoundingClientRect().width)}px` : '0px');
  const top = hud.getBoundingClientRect().bottom + 8;
  // 画面（札）は上の帯の下から下の帯の上まで。まわりに地図が少し見える
  root.style.setProperty('--hud-h', `${Math.round(top)}px`);
  root.style.setProperty('--foot-h', rail ? '0px' : `${Math.round(innerHeight - foot.getBoundingClientRect().top)}px`);
  const bottom = rail ? 12 : innerHeight - foot.getBoundingClientRect().top + 8;
  advisor.style.bottom = `${bottom}px`;
  toasts.style.top = `${placing ? selBox.getBoundingClientRect().bottom + 8 : top}px`;
  selBox.style.top = `${hud.getBoundingClientRect().top}px`;
  placePop();
}
function renderAll() {
  dirty = true;
  tutTick();
  renderMissions();
  renderHud();
  renderFoot();
  renderPlace();
  renderAdvisor();
  layout();
}
root.append(hud, pointEl, missionBox, tourEl, toasts, advisor, placeBox, popEl, foot, selBox, ghostUi);
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
    if (placing) setGhost(...centerCell());
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
      // 置くときは、地図を動かすと建物が画面の真ん中のマスへ
      if (placing) setGhost(...centerCell());
    }
    return;
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
    // 置いている建物のマスをもう一度押すと建てる。ほかのマスなら、そこを真ん中にして建物を動かす
    if (placing.i === i && placing.j === j) tryPlace();
    else {
      setGhost(i, j);
      tweenTo(i, j);
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
    if (placing) setGhost(...centerCell());
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

/** 1 日の長さ（ms）。標準 1.2 秒で、スキルで選べる進行速度で短くなる */
const dayMs = () => DAY_BASE_MS / (s.pace ?? 1);
let acc = 0;

// ---------------------------------------------------------------- 地図の上の動き（サイクルを見せる）

const anim = newAnim();
const pathCache = new Map<string, [number, number][] | null>();
function pathOf(a: [number, number], b: [number, number]) {
  const k = `${a}|${b}|${s.seed}`;
  if (!pathCache.has(k)) pathCache.set(k, roadPath(s, a, b));
  return pathCache.get(k) ?? null;
}
/** お客さんになるヒーロー（Common） */
const GUESTS = [1001, 1002, 1003, 1005, 1006, 1008, 1009, 1011, 1013, 1014, 1016, 1018].filter((id) => heroById.has(id));

/** 売れたら、近くの家からお客さんが歩いてきて、着いたら売上が浮かぶ */
function spawnCustomers(sales: { uid: number; yen: number }[]) {
  sales.forEach((x, k) => {
    const shop = s.buildings.find((b) => b.uid === x.uid);
    const homes = s.buildings.filter((b) => b.owner === 'town' && DEF[b.id].cat === 'home');
    let path: [number, number][] | null = null;
    if (shop && homes.length && anim.walkers.length < 40) {
      const near = [...homes].sort((a, b) => Math.abs(a.i - shop.i) + Math.abs(a.j - shop.j) - (Math.abs(b.i - shop.i) + Math.abs(b.j - shop.j))).slice(0, 10);
      const home = near[Math.floor(Math.random() * near.length)];
      path = pathOf(doorOf(home), doorOf(shop));
    }
    if (!path || path.length < 2) {
      addCoin(x.uid, x.yen, anim.clock);
      return;
    }
    anim.walkers.push({ hero: GUESTS[Math.floor(Math.random() * GUESTS.length)] ?? 1001, path, t0: anim.clock + k * 260, dur: Math.max(900, path.length * 190), uid: x.uid, yen: x.yen });
  });
}
function addCoin(uid: number, yen: number, t: number) {
  const list = anim.coins.get(uid) ?? [];
  list.push({ yen, t });
  while (list.length > 12) list.shift();
  anim.coins.set(uid, list);
  sfx.play('sale');
  if (tour) tourOn('sold');
}
// ---------------------------------------------------------------- 街の人通り（他社のお客さん・駅を行き交う人・散歩する人）

const CROWD_KEY = 'mycryptoisland.p1.crowd';
const CROWD_LEVELS = [
  { key: 'many', n: 30, name: t('多い', 'Busy') },
  { key: 'normal', n: 18, name: t('ふつう', 'Normal') },
  { key: 'few', n: 8, name: t('少ない', 'Quiet') },
  { key: 'none', n: 0, name: t('なし', 'Off') },
] as const;
let crowdLevel = 1;
try {
  const k = CROWD_LEVELS.findIndex((x) => x.key === localStorage.getItem(CROWD_KEY));
  if (k >= 0) crowdLevel = k;
} catch {
  // 既定はふつう
}
let nextCrowd = 0;
let roadCells: [number, number][] = [];
const anyOf = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)];
/** 道のりのひとつ（他社のお店へ・駅と家・散歩） */
function crowdPath(): [number, number][] | null {
  if (!roadCells.length) for (let j = 0; j < s.n; j++) for (let i = 0; i < s.n; i++) if (ground(s, i, j) === 'road') roadCells.push([i, j]);
  const homes = s.buildings.filter((b) => b.owner === 'town' && DEF[b.id].cat === 'home');
  const near = (b: { i: number; j: number }) => [...homes].sort((x, y) => Math.abs(x.i - b.i) + Math.abs(x.j - b.j) - (Math.abs(y.i - b.i) + Math.abs(y.j - b.j))).slice(0, 10);
  const r = Math.random();
  if (r < 0.4) {
    // 他社のお店：強い会社ほどお客さんが多い。入っていく人と、出てきて帰る人
    const stores = s.buildings.filter((b) => RIVALS.some((x) => x.id === b.owner));
    if (!stores.length || !homes.length) return null;
    const weight = (b: (typeof stores)[number]) => Object.values(s.rivals.find((x) => x.id === b.owner)?.sells ?? {}).reduce<number>((a, v) => a + (v ?? 0), 0.5);
    let w = Math.random() * stores.reduce((a, b) => a + weight(b), 0);
    let store = stores[0];
    for (const b of stores) if ((w -= weight(b)) <= 0) {
      store = b;
      break;
    }
    const home = anyOf(near(store));
    const p = pathOf(doorOf(home), doorOf(store));
    return p && Math.random() < 0.4 ? [...p].reverse() : p;
  }
  if (r < 0.7) {
    // 駅を行き交う人
    const st = s.buildings.find((b) => b.id === 'station');
    if (!st || !homes.length) return null;
    const p = pathOf(doorOf(st), doorOf(anyOf(homes)));
    return p && Math.random() < 0.5 ? [...p].reverse() : p;
  }
  // 散歩：道路の上をぶらぶら（ときどき公園へ）
  const park = s.buildings.find((b) => b.id === 'park');
  const a = anyOf(roadCells);
  const b = park && Math.random() < 0.35 ? doorOf(park) : anyOf(roadCells.filter(([i, j]) => Math.abs(i - a[0]) + Math.abs(j - a[1]) > 4 && Math.abs(i - a[0]) + Math.abs(j - a[1]) < 14));
  return b ? pathOf(a, b) : null;
}
/** 人通りを目標の人数に保つ（はじめは歩いている途中の人も置いて、街がすぐにぎわうように） */
function tickCrowd() {
  const target = CROWD_LEVELS[crowdLevel].n;
  anim.crowd = anim.crowd.filter((w) => anim.clock < w.t0 + w.dur);
  if (anim.crowd.length >= target) return;
  // 最初（とても少ないとき）は、歩いている途中の人を置いてすぐにぎわわせる
  const fresh = anim.crowd.length < target / 3;
  if (!fresh && anim.clock < nextCrowd) return;
  nextCrowd = anim.clock + 120 + Math.random() * 160;
  const p = crowdPath();
  if (!p || p.length < 3) return;
  const dur = p.length * (340 + Math.random() * 140);
  anim.crowd.push({ hero: anyOf(GUESTS) ?? 1001, path: p, t0: fresh ? anim.clock - Math.random() * dur * 0.7 : anim.clock, dur });
}

/** 時計を進めて、着いたお客さんの売上を出す */
function tickAnim(dtGame: number) {
  anim.clock += dtGame;
  tickCrowd();
  for (const w of anim.walkers) {
    if (!w.done && anim.clock >= w.t0 + w.dur) {
      w.done = true;
      if (w.uid != null && w.yen != null) addCoin(w.uid, w.yen, anim.clock);
    }
  }
  anim.walkers = anim.walkers.filter((w: Walker) => !w.done);
  anim.plus = anim.plus.filter((p) => anim.clock - p.t < 1500);
  // 調達係：往復の進み
  const trip = s.buyTrip;
  const ws = myWorkshop(s);
  const wh = wholesaler(s);
  if (trip && ws && wh) {
    const path = pathOf(doorOf(ws), doorOf(wh));
    const k = Math.max(0, Math.min(1, (trip.total - trip.left + acc / dayMs()) / trip.total));
    const carry = (Object.keys(trip.cargo)[0] ?? null) as Mat | null;
    anim.buyer = path ? { hero: trip.hero, path, k, carry } : null;
  } else anim.buyer = null;
  // 流れの案内：卸問屋から工房へ、素材を届ける人
  if (tour?.deliver && ws && wh) {
    const path = pathOf(doorOf(ws), doorOf(wh));
    const f = Math.min(1, (performance.now() - tour.deliver.t0) / tour.deliver.dur);
    if (path) anim.buyer = { hero: tour.deliver.hero, path, k: 0.5 + f * 0.5, carry: tour.deliver.mat };
  }
}
const animating = () => anim.crowd.length > 0 || anim.walkers.length > 0 || !!anim.buyer || anim.plus.length > 0 || s.slots.some((sl) => sl.running) || [...anim.coins.values()].some((l) => l.some((c) => anim.clock - c.t < 2600));
let lastDraw = 0;
let last = performance.now();
let lastWater = -1;

/** 日を進める（報告が出たら止めて見せる） */
function advance(days: number) {
  ticking = true;
  for (let k = 0; k < days; k++) {
    // 流れの案内を見ているあいだの日数は、最初の月の締めまでの日数に数えない（案内の途中や直後に締めが来ないように）
    if (tour && s.open !== null && !s.reports.length) s.open++;
    const r = step(s);
    for (const b of r.finished) {
      fx.push({ uid: b.uid, start: performance.now() });
      toast(t(`${DEF[b.id].name}が完成しました！`, `${DEF[b.id].name} is complete!`));
      sfx.play('done');
    }
    if (r.crafted.length) sfx.play('craft');
    const wsb = myWorkshop(s);
    if (wsb) for (const m of r.made) anim.plus.push({ uid: wsb.uid, n: m.n, t: anim.clock });
    if (r.sales.length) spawnCustomers(r.sales);
    if (tour) tourOn(r.made.length > 0 ? 'made' : null, r.delivered.some((x) => x.n > 0 && myShops(s).some((b) => b.uid === x.to)) ? 'dropped' : null);
    if (r.missions.length) sfx.play('mission');
    for (const g of r.grew) toast(t(`${heroName(g.hero)}の ${g.stat.toUpperCase()} が 1 上がりました（バイトの経験）`, `${heroName(g.hero)}’s ${g.stat.toUpperCase()} rose by 1 (part-time work)`));
    if (r.procLv) {
      toast(t(`調達ランクが Lv.${r.procLv} に上がりました`, `Buying rank is now Lv.${r.procLv}`));
      sfx.play('levelup');
    }
    for (const x of r.crafted) toast(t(`${PRODUCT[skuParts(x)[0]].name}ができました`, `${PRODUCT[skuParts(x)[0]].name} crafted`));
    for (const m of r.routes) toast(t(`${MATS[m].name}のルートを開拓しました！`, `Opened a ${MATS[m].name} route!`));
    for (const x of r.intel) toast(t(`${rivalName(x.rid)}の調査が段階 ${x.lv} に進みました`, `Research on ${rivalName(x.rid)} reached stage ${x.lv}`));
    for (const k2 of r.developed) toast(t(`${PRODUCT[k2].name}のアンコモンを開発しました！`, `Developed the ${PRODUCT[k2].name} Uncommon!`));
    for (const id of r.missions) toast(t(`依頼「${MISSIONS.find((m) => m.id === id)?.title ?? ''}」を達成しました`, `Request done: ${MISSIONS.find((m) => m.id === id)?.title ?? ''}`));
    if (r.report) {
      save();
      // 流れの案内のあいだは、終わってから出す
      if (tour) tourReport = r.report;
      else showReport(r.report);
      break;
    }
  }
  refreshSheet();
  if (pop && !(document.activeElement instanceof HTMLSelectElement && popEl.contains(document.activeElement))) renderPop();
  renderAll();
  ticking = false;
}

function showReport(r: NonNullable<ReturnType<typeof step>['report']>) {
  speed = 0;
  sfx.play(r.rank === 1 ? 'win' : 'report');
  closePop();
  openReport(ctx, r, () => {
    if (tutOf(s) < TUT_DONE) {
      // チュートリアル中は、ランキングの紹介を案内の段（tut.ts の ranking）で出す
      s.flags.ranking = true;
      save();
      renderAll();
    } else if (!s.flags.ranking) {
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
      modal(t('フェーズ 1 クリア！', 'Phase 1 cleared!'), t(`エリアで売上 1 位になりました！新天地での実績は十分です。ランドのふちの関所は、通行料 ${money(gateToll(s))} を納めると開通し、となりのランドセクタへ進めます。`, `You are #1 in area sales! You have made your name in the new land. The gate at the edge of the land opens for a ${money(gateToll(s))} toll and leads to the next land sector.`), [[t('関所を見る', 'View the gate'), () => ((speed = 1), showGate(), renderHud()), 'is-on'], [t('続ける', 'Keep going'), () => ((speed = 1), renderHud())]], true);
    } else {
      speed = 1;
      renderHud();
    }
  });
}

const uiHold = () => !!placing || !!menu || !!pop || sheetOpen() || !!root.querySelector('.isl-modal');
let lastHeld = false;

function frame(now: number) {
  const dt = Math.min(250, now - last);
  last = now;
  // 建てているとき・メニューや画面・吹き出しを開いているときは、ゲームの時間を止める
  const held = uiHold();
  if (held !== lastHeld) {
    lastHeld = held;
    statDate.classList.toggle('is-held', held);
  }
  if (!held) acc += dt * speed;
  if (!held && speed > 0) tickAnim(dt * speed);
  anim.frac = held || speed === 0 ? anim.frac : Math.min(1, acc / dayMs());
  anim.speed = speed || 1;
  anim.dayMs = dayMs();
  let changed = false;
  while (acc >= dayMs() && speed > 0) {
    acc -= dayMs();
    changed = true;
    advance(1);
  }
  if (moneyAnim) {
    const k = Math.min(1, (now - moneyAnim.t0) / 700);
    shownMoney = moneyAnim.from + (moneyAnim.to - moneyAnim.from) * (1 - (1 - k) ** 2);
    moneyText(shownMoney);
    if (k >= 1) {
      shownMoney = moneyAnim.to;
      moneyAnim = null;
      statMoney.classList.remove('is-spending');
      renderHud();
    }
  }
  if (tween) {
    const k = Math.min(1, (now - tween.t0) / (tween.dur ?? 320));
    const e = 1 - (1 - k) ** 3;
    cam.x = tween.x0 + (tween.x1 - tween.x0) * e;
    cam.y = tween.y0 + (tween.y1 - tween.y0) * e;
    if (tween.z0 != null && tween.z1 != null) cam.zoom = tween.z0 + (tween.z1 - tween.z0) * e;
    if (k >= 1) tween = null;
    dirty = true;
  }
  updatePoint();
  if (tour) tourFrame(now);
  for (let k = fx.length - 1; k >= 0; k--) if (effectDone(fx[k], now)) fx.splice(k, 1);
  const wf = waterFrame(now);
  if (changed || fx.length || wf !== lastWater || loading()) dirty = true;
  // 動いているものがあるときは、30 コマ/秒ほどで描き直す
  if (!held && speed > 0 && now - lastDraw > 33 && animating()) dirty = true;
  lastWater = wf;
  if (dirty) {
    dirty = false;
    const ghost: P1Ghost | null = placing ? { id: placing.id, i: placing.i, j: placing.j, dir: placing.dir, ok: !placeErr(), area: P1B[placing.id]?.kind === 'shop' } : null;
    lastDraw = now;
    drawP1(ctx2, s, cam, W, H, DPR, now, fx, ghost, placing?.move ?? selected, pop && selected == null ? pop : null, placeable(), anim);
    placePop();
    placeGhostUi();
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
  placing: () => (placing ? { ...placing } : null),
  anim: () => anim,
  pop: (i: number, j: number) => {
    openPop(i, j);
    renderAll();
  },
  menu: (m: Menu | null) => (m ? pickMenu(m) : ((menu = null), renderAll())),
  /** 下の帯の小メニューを開く（撮影スクリプト用） */
  sub: goSub,
  bgm: () => ({ key: sound.currentBgm(), playing: sound.bgmPlaying(), sfx: sfx.info() }),
  tick: () => renderAll(),
};
