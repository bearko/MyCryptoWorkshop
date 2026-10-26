/**
 * 島づくり（試作）の入口。地図の操作、建てる帯、選んだ建物の札、暮らしの札、マインちゃんの助言。
 * 仕様は docs/ISLAND_MVP.md。
 */
import './island.css';
import { isEn, setLang, t } from '../i18n';
import { CATS, DEF, DEFS, NEEDS, POLICIES, type Cat, type Def } from './defs';
import { art, draw, effectDone, pick, type Camera, type Effect, type Ghost } from './render';
import {
  DAYS_PER_MONTH,
  DIRS,
  ELECTION,
  GOAL,
  boosts,
  canPlace,
  cells,
  coverage,
  date,
  demolish,
  deserialize,
  happiness,
  homes,
  jobs,
  newGame,
  newMilestones,
  occupant,
  place,
  rotate,
  serialize,
  flags,
  endMonth,
  staffing,
  step,
  togglePolicy,
  won,
  workers,
  type Dir,
  type PlaceError,
  type State,
} from './sim';

/** ?test=2 で開いたとき（工房の ?test=2 から来る）。テスト用の札を出す */
const TEST = new URLSearchParams(location.search).get('test') === '2';
const SAVE = 'mycryptoisland.save.v1';
const fmt = (n: number) => Math.round(n).toLocaleString('en-US');
const money = (n: number) => `${fmt(n)} G`;

// ---------------------------------------------------------------- 状態

function load(): State {
  try {
    const raw = localStorage.getItem(SAVE);
    const s = raw ? deserialize(raw) : null;
    if (s) return s;
  } catch {
    // 保存先が使えないときは新しい島で始める
  }
  return newGame();
}
let s = load();
function save() {
  try {
    localStorage.setItem(SAVE, serialize(s));
  } catch {
    // 保存できなくても遊べる
  }
}

const canvas = document.getElementById('isl-map') as HTMLCanvasElement;
const ctx = canvas.getContext('2d')!;
const root = document.getElementById('isl-ui')!;
let W = 0;
let H = 0;
const cam: Camera = { x: 0, y: (s.n - 1) * 55, zoom: 0.5 };
let speed = 1;
let placing: { def: Def; dir: Dir; i: number; j: number } | null = null;
let selected: number | null = null;
let tab: Cat = 'home';
const fx: Effect[] = [];
let lifeOpen = false;
let policyOpen = false;
let confirmDemolish = false;

function resize() {
  const dpr = Math.min(2, devicePixelRatio || 1);
  W = innerWidth;
  H = innerHeight;
  canvas.width = Math.round(W * dpr);
  canvas.height = Math.round(H * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
addEventListener('resize', resize);
resize();

// ---------------------------------------------------------------- 小さな DOM の道具

function h<K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', text = ''): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text) e.textContent = text;
  return e;
}
function btn(text: string, on: () => void, cls = ''): HTMLButtonElement {
  const b = h('button', `isl-btn ${cls}`.trim(), text);
  b.type = 'button';
  b.addEventListener('click', (e) => {
    e.stopPropagation();
    on();
  });
  return b;
}

// ---------------------------------------------------------------- お知らせ

const toasts = h('div', 'isl-toasts');
function toast(text: string) {
  const e = h('div', 'isl-toast', text);
  toasts.append(e);
  setTimeout(() => e.remove(), 3300);
  while (toasts.children.length > 4) toasts.firstChild?.remove();
}

// ---------------------------------------------------------------- 上の帯

const hud = h('div', 'isl-hud');
const statMoney = h('div', 'isl-stat');
const statPop = h('div', 'isl-stat');
const statApp = h('div', 'isl-stat');
const statDate = h('div', 'isl-stat');
const speedBox = h('div', 'isl-speed');
const SPEEDS = [0, 1, 4];
const speedBtns = SPEEDS.map((v) =>
  btn(v === 0 ? '⏸' : v === 1 ? '▶' : '⏩', () => {
    speed = v;
    renderHud();
  }),
);
speedBox.append(...speedBtns);
hud.append(
  statMoney,
  statPop,
  statApp,
  statDate,
  h('div', 'isl-spacer'),
  speedBox,
  btn(t('暮らし', 'Life'), () => {
    lifeOpen = !lifeOpen;
    policyOpen = false;
    renderLife();
    renderPolicy();
  }),
  btn(t('政策', 'Policy'), () => {
    policyOpen = !policyOpen;
    lifeOpen = false;
    renderLife();
    renderPolicy();
  }),
  btn('☰', openMenu),
);
if (TEST) hud.append(btn(t('テスト', 'Test'), openTest, 'is-danger'));

/** テスト用の札：資金・工事・時間・解放を手早く動かす */
function openTest() {
  modal(t('テスト用', 'Test tools'), t('?test=2 のときだけ出ます。', 'Shown only with ?test=2.'), [
    [t('資金 +50,000', 'Funds +50,000'), () => ((s.money += 50000), renderAll())],
    [t('工事をすべて終える', 'Finish all construction'), () => {
      for (const b of s.buildings) if (b.left > 0) { b.left = 0; fx.push({ uid: b.uid, start: performance.now() }); }
      renderAll();
    }],
    [t('1 か月進める', 'Advance a month'), () => {
      s.day += 30 - (s.day % 30);
      endMonth(s);
      renderAll();
    }],
    [flags.unlockAll ? t('解放を元に戻す', 'Restore unlocks') : t('すべての建物を解放', 'Unlock all buildings'), () => ((flags.unlockAll = !flags.unlockAll), renderAll())],
  ]);
}

function renderHud() {
  statMoney.className = `isl-stat ${s.money < 0 ? 'is-bad' : ''}`;
  const lm = t('資金', 'Funds');
  statMoney.innerHTML = `<small>${lm}</small><b>${money(s.money)}</b>`;
  const lp = t('人口', 'People');
  statPop.innerHTML = `<small>${lp}</small><b>${fmt(s.pop)}</b><small>/ ${fmt(homes(s))}</small>`;
  statApp.className = `isl-stat ${s.approval < 40 ? 'is-bad' : ''}`;
  const la = t('支持率', 'Approval');
  statApp.innerHTML = `<small>${la}</small><b>${s.approval}%</b>`;
  const d = date(s.day);
  statDate.textContent = isEn ? `Y${d.year} M${d.month} D${d.day}` : `${d.year} 年目 ${d.month} 月 ${d.day} 日`; // i18n-ja
  speedBtns.forEach((b, k) => b.classList.toggle('is-on', SPEEDS[k] === speed));
}

// ---------------------------------------------------------------- 建てる帯

const build = h('div', 'isl-build');
const tabs = h('div', 'isl-tabs');
const cards = h('div', 'isl-cards');
build.append(tabs, cards);

function renderBuild() {
  tabs.replaceChildren(
    ...CATS.map((c) =>
      btn(
        c.name,
        () => {
          tab = c.key;
          renderBuild();
        },
        c.key === tab ? 'is-on' : '',
      ),
    ),
  );
  cards.replaceChildren(
    ...DEFS.filter((d) => d.cat === tab).map((d) => {
      const locked = s.pop < d.unlock && !flags.unlockAll;
      const c = h('button', `isl-card ${locked ? 'is-locked' : ''} ${placing?.def.id === d.id ? 'is-on' : ''}`);
      c.type = 'button';
      const im = art(d.id, 'rd').cloneNode() as HTMLImageElement;
      im.alt = '';
      im.loading = 'lazy';
      c.append(im, h('b', '', d.name), h('span', '', locked ? t(`人口 ${d.unlock} で解放`, `Unlocks at ${d.unlock} people`) : money(d.cost)));
      c.addEventListener('click', () => {
        if (locked) {
          toast(t(`人口が ${d.unlock} 人になると建てられます`, `Available when ${d.unlock} people live here`));
          return;
        }
        selected = null;
        placing = placing?.def.id === d.id ? null : { def: d, dir: placing?.dir ?? 'rd', i: Math.floor(s.n / 2), j: Math.floor(s.n / 2) };
        renderAll();
      });
      return c;
    }),
  );
}

// ---------------------------------------------------------------- 置くときの札

const placeBox = h('div', 'isl-place');
const ERR: Record<PlaceError, string> = {
  ground: t('草地にだけ建てられます', 'Build on grass only'),
  taken: t('ほかの建物があります', 'Something is already there'),
  money: t('資金が足りません', 'Not enough funds'),
  locked: t('まだ建てられません', 'Not unlocked yet'),
  coast: t('海の近くにだけ建てられます', 'Must be next to the sea'),
};
function tryPlace() {
  if (!placing) return;
  const r = place(s, placing.def.id, placing.i, placing.j, placing.dir);
  if (typeof r === 'string') toast(ERR[r]);
  else {
    toast(t(`${placing.def.name}の工事を始めました（${placing.def.days} 日）`, `Started building: ${placing.def.name} (${placing.def.days} days)`));
    save();
  }
  renderAll();
}
function renderPlace() {
  placeBox.hidden = !placing;
  canvas.classList.toggle('is-placing', !!placing);
  if (!placing) return;
  const err = canPlace(s, placing.def, placing.i, placing.j, placing.dir);
  const d = placing.def;
  placeBox.replaceChildren(
    h('p', '', [d.name, money(d.cost), err ? `— ${ERR[err]}` : t('— 地図で場所を選んで「建てる」', '— pick a spot, then Build')].join('  ')),
    (() => {
      const r = h('div', 'isl-row');
      r.append(
        btn(t('建てる', 'Build'), tryPlace, 'is-on'),
        btn(t('向きを変える', 'Rotate'), () => {
          if (placing) placing.dir = DIRS[(DIRS.indexOf(placing.dir) + 1) % 4];
          renderPlace();
        }),
        btn(t('やめる', 'Cancel'), () => {
          placing = null;
          renderAll();
        }),
      );
      r.firstElementChild?.toggleAttribute('disabled', !!err);
      return r;
    })(),
  );
}

// ---------------------------------------------------------------- 選んだ建物の札

const info = h('div', 'isl-info');
function needText(d: Def) {
  return NEEDS.filter((n) => d.serve[n.key])
    .map((n) => `${n.name} ${d.serve[n.key]}`)
    .join(t('・', ', '));
}
function renderInfo() {
  const b = selected != null ? s.buildings.find((x) => x.uid === selected) : null;
  info.hidden = !b;
  if (!b) return;
  const d = DEF[b.id];
  const dl = h('dl');
  const row = (k: string, v: string) => dl.append(h('dt', '', k), h('dd', '', v));
  row(t('状態', 'Status'), b.left > 0 ? t(`工事中（あと ${b.left} 日）`, `Under construction (${b.left} days left)`) : t('営業中', 'Open'));
  if (d.homes) row(t('住める人', 'Homes'), `${d.homes}`);
  if (d.jobs) row(t('働き口', 'Jobs'), t(`${d.jobs}（人手 ${Math.round(staffing(s) * 100)}%）`, `${d.jobs} (staffed ${Math.round(staffing(s) * 100)}%)`));
  if (needText(d)) row(t('満たすもの', 'Serves'), needText(d));
  if (d.income) row(t('売上の目安', 'Income'), t(`${money(d.income)} / 月`, `${money(d.income)} / mo`));
  if (d.appeal) row(t('魅力', 'Appeal'), `${d.appeal > 0 ? '+' : ''}${d.appeal}`);
  row(t('維持費', 'Upkeep'), t(`${money(d.upkeep)} / 月`, `${money(d.upkeep)} / mo`));
  const r = h('div', 'isl-row');
  r.append(
    btn(t('向きを変える', 'Rotate'), () => {
      if (!rotate(s, b.uid)) toast(t('この向きには置けません', 'No room in that direction'));
      save();
      renderInfo();
    }),
    btn(
      confirmDemolish ? t('もう一度押すと取り壊す', 'Press again to demolish') : t('取り壊す', 'Demolish'),
      () => {
        if (!confirmDemolish) {
          confirmDemolish = true;
          renderInfo();
          return;
        }
        const back = demolish(s, b.uid);
        toast(t(`取り壊しました（${money(back)} 戻りました）`, `Demolished (${money(back)} refunded)`));
        selected = null;
        confirmDemolish = false;
        save();
        renderAll();
      },
      'is-danger',
    ),
    btn(t('閉じる', 'Close'), () => {
      selected = null;
      renderAll();
    }),
  );
  info.replaceChildren(h('h2', '', d.name), dl, r);
}

// ---------------------------------------------------------------- 暮らしの札

const life = h('div', 'isl-life');
function renderLife() {
  life.hidden = !lifeOpen;
  if (!lifeOpen) return;
  const cov = coverage(s);
  const meter = (name: string, v: number, off = false) => {
    const m = h('div', `isl-meter ${off ? 'is-off' : ''}`);
    const bar = h('i');
    bar.style.setProperty('--v', `${Math.round(v * 100)}%`);
    bar.style.setProperty('--c', v >= 0.8 ? 'var(--isl-good)' : v >= 0.5 ? 'var(--isl-gold)' : 'var(--isl-bad)');
    m.append(h('span', '', name), bar, h('span', '', `${Math.round(v * 100)}%`));
    return m;
  };
  const w = workers(s);
  const parts: HTMLElement[] = [h('h3', '', t('暮らしの満たされ具合', 'How life is going'))];
  parts.push(meter(t('満足度', 'Happiness'), happiness(s)));
  for (const n of NEEDS) parts.push(meter(n.name, cov[n.key], s.pop < n.from));
  parts.push(meter(t('仕事', 'Jobs'), w === 0 ? 1 : Math.min(1, jobs(s) / w)));
  parts.push(meter(t('人手', 'Staff'), staffing(s)));
  if (s.last) {
    const m = s.last;
    parts.push(h('h3', '', t('先月', 'Last month')));
    parts.push(h('div', '', t(`売上 +${fmt(m.income)}　税 +${fmt(m.tax)}　維持費 −${fmt(m.upkeep)}`, `Sales +${fmt(m.income)}  Tax +${fmt(m.tax)}  Upkeep −${fmt(m.upkeep)}`)));
    const sign = m.moved >= 0 ? '+' : '';
    parts.push(h('div', '', t(`人の出入り ${sign}${m.moved}`, `Moved in/out ${sign}${m.moved}`)));
  }
  const b = boosts(s);
  if (b.approval || b.tax || b.immigration) parts.push(h('div', '', t(`後押し：支持 +${b.approval}・税 +${Math.round(b.tax * 100)}%・移住 +${b.immigration}`, `Boosts: approval +${b.approval}, tax +${Math.round(b.tax * 100)}%, arrivals +${b.immigration}`)));
  const left = monthsToElection();
  parts.push(h('div', '', t(`次の選挙まで ${left} か月（支持率 ${ELECTION.pass}% で続投）`, `Election in ${left} months (${ELECTION.pass}% approval to stay)`)));
  parts.push(h('div', '', t(`目標：人口 ${GOAL.pop}・支持率 ${GOAL.approval}%`, `Goal: ${GOAL.pop} people and ${GOAL.approval}% approval`)));
  life.replaceChildren(...parts);
}

function monthsToElection() {
  const month = Math.floor(s.day / DAYS_PER_MONTH);
  return ELECTION.everyMonths - (month % ELECTION.everyMonths);
}

// ---------------------------------------------------------------- 政策の札

const policy = h('div', 'isl-life');
function renderPolicy() {
  policy.hidden = !policyOpen;
  if (!policyOpen) return;
  const parts: HTMLElement[] = [h('h3', '', t('政策', 'Policies')), h('div', '', t('出している間、毎月の費用がかかります。', 'Active policies cost money every month.'))];
  for (const p of POLICIES) {
    const on = s.policies.includes(p.id);
    const locked = s.pop < p.unlock;
    const row = h('div', 'isl-policy');
    const b = btn(
      locked ? t(`人口 ${p.unlock}`, `${p.unlock} people`) : on ? t('やめる', 'Stop') : t('出す', 'Enact'),
      () => {
        const now = togglePolicy(s, p.id);
        toast(now ? t(`「${p.name}」を出しました`, `Enacted: ${p.name}`) : t(`「${p.name}」をやめました`, `Stopped: ${p.name}`));
        save();
        renderPolicy();
        renderLife();
      },
      on ? 'is-on' : '',
    );
    b.disabled = locked;
    const text = h('div');
    text.append(h('b', '', p.name), h('small', '', p.note));
    row.append(text, b);
    parts.push(row);
  }
  policy.replaceChildren(...parts);
}

// ---------------------------------------------------------------- マインちゃん

const advisor = h('div', 'isl-advisor');
const mine = h('img');
mine.src = `${import.meta.env.BASE_URL}mch/Image/Characters/navi_ain_speak_00_talk.png`;
mine.alt = '';
const bubble = h('p');
advisor.append(mine, bubble);
let hiddenTip = '';
bubble.addEventListener('click', () => {
  hiddenTip = bubble.textContent ?? '';
  advisor.hidden = true;
});

function tip(): string {
  const cov = coverage(s);
  const built = s.buildings.length;
  if (built === 0) return t('ようこそ、島の新しい長さん！まずは「住宅」から家を建てましょう。住む人がいないと島は始まりません。', 'Welcome, new island chief! Start by building a home from Homes. No residents, no island.');
  if (homes(s) === 0) return t('工事が終わるまで少し待ちましょう。▶ を ⏩ にすると早く進みます。', 'Wait for the work to finish. Switch ▶ to ⏩ to speed up.');
  const left = monthsToElection();
  if (left <= 3 && s.approval < ELECTION.pass + 5) return t(`あと ${left} か月で選挙です。支持率が ${ELECTION.pass}% 以上ないと島の長を続けられません。「政策」の減税やお祭りが効きます。`, `Election in ${left} months. You need ${ELECTION.pass}% approval to stay. Try a tax cut or a festival under Policy.`);
  if (s.money < 0) return t('赤字です！維持費の高い建物を減らすか、お店や会社で売上を増やしましょう。', 'We are in the red! Cut costly upkeep or add shops and businesses.');
  if (cov.food < 0.8) return t('食べる所が足りません。「飲食」からお店を建てましょう。', 'Not enough places to eat. Build something from Food.');
  if (cov.goods < 0.8) return t('買い物できるお店が足りません。「物販」を見てみてください。', 'Not enough shops. Take a look at Shops.');
  if (s.pop >= homes(s) * 0.95) return t('家がいっぱいです。人に来てもらうには、住宅を増やしましょう。', 'Homes are full. Build more so people can move in.');
  const lack = NEEDS.find((n) => s.pop >= n.from && cov[n.key] < 0.6);
  if (lack) return t(`「${lack.name}」が足りないようです。満たす建物を建てると満足度が上がります。`, `People lack ${lack.name.toLowerCase()}. Buildings that provide it raise happiness.`);
  if (staffing(s) < 0.8) return t('人手が足りず、お店や会社が回っていません。住宅を増やしましょう。', 'Short of staff — shops and businesses are not running fully. Build more homes.');
  if (workers(s) > jobs(s) * 1.2 && s.pop > 20) return t('仕事が足りません。「会社」の建物は働き口と税収を増やします。', 'Not enough jobs. Business buildings add jobs and taxes.');
  if (built < 12) return t('いい調子です！住宅・食事・お店をバランスよく増やしていきましょう。', 'Nice! Keep growing homes, food and shops together.');
  return t(`人口 ${GOAL.pop} 人・支持率 ${GOAL.approval}% を目指しましょう。魅力の高い建物は人と観光客を呼びます。`, `Aim for ${GOAL.pop} people and ${GOAL.approval}% approval. Appealing buildings draw people and tourists.`);
}
function renderAdvisor() {
  advisor.style.display = placing ? 'none' : '';
  const text = tip();
  if (text === hiddenTip) return;
  if (advisor.hidden && text !== hiddenTip) advisor.hidden = false;
  if (bubble.textContent !== text) bubble.textContent = text;
}

// ---------------------------------------------------------------- メニュー・お祝い

function modal(title: string, body: string, actions: [string, () => void, string?][]) {
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
  box.append(h('h2', '', title), h('p', '', body), row);
  m.append(box);
  m.addEventListener('click', (e) => {
    if (e.target === m) m.remove();
  });
  root.append(m);
}
function openMenu() {
  const before = speed;
  speed = 0;
  renderHud();
  modal(t('メニュー', 'Menu'), t('島づくりは試作版です。進み具合はこのブラウザに保存されます。', 'This island builder is a prototype. Progress is saved in this browser.'), [
    [t('続ける', 'Resume'), () => ((speed = before || 1), renderHud()), 'is-on'],
    [
      t('新しい島', 'New island'),
      () =>
        modal(t('新しい島で始めますか？', 'Start a new island?'), t('いまの島は消えます。', 'The current island will be lost.'), [
          [
            t('始める', 'Start'),
            () => {
              s = newGame();
              selected = null;
              placing = null;
              save();
              speed = 1;
              renderAll();
            },
            'is-danger',
          ],
          [t('やめる', 'Cancel'), () => ((speed = before || 1), renderHud())],
        ]),
    ],
    [isEn ? '日本語' : 'English', () => setLang(isEn ? 'ja' : 'en')], // i18n-ja
    [t('工房へ戻る', 'Back to the Workshop'), () => location.assign(`${import.meta.env.BASE_URL}index.html`)],
  ]);
}

// ---------------------------------------------------------------- 配置

function layout() {
  const top = hud.getBoundingClientRect().bottom + 8;
  const bottom = innerHeight - build.getBoundingClientRect().top + 8;
  placeBox.style.bottom = `${bottom}px`;
  info.style.bottom = `${bottom}px`;
  life.style.top = `${top}px`;
  policy.style.top = `${top}px`;
  advisor.style.bottom = `${bottom + (placing || selected != null ? (placing ? placeBox : info).getBoundingClientRect().height + 8 : 0)}px`;
  toasts.style.top = `${top}px`;
}
function renderAll() {
  renderHud();
  renderBuild();
  renderPlace();
  renderInfo();
  renderLife();
  renderPolicy();
  renderAdvisor();
  layout();
}
root.append(hud, toasts, advisor, life, policy, placeBox, info, build);
renderAll();

// ---------------------------------------------------------------- 地図の操作

const pts = new Map<number, { x: number; y: number }>();
let drag: { x: number; y: number; cx: number; cy: number; moved: boolean } | null = null;
let pinch: { d: number; zoom: number } | null = null;
const ZOOMS = [0.25, 0.5, 1, 2];
const clampZoom = (z: number) => Math.max(0.25, Math.min(2, z));

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
    return;
  }
  if (drag) {
    const dx = e.clientX - drag.x;
    const dy = e.clientY - drag.y;
    if (Math.hypot(dx, dy) > 6) drag.moved = true;
    if (drag.moved) {
      cam.x = drag.cx - dx / cam.zoom;
      cam.y = drag.cy - dy / cam.zoom;
    }
    return;
  }
  if (placing && e.pointerType === 'mouse') {
    const [i, j] = pick(cam, W, H, e.clientX, e.clientY);
    if (i !== placing.i || j !== placing.j) {
      placing.i = i;
      placing.j = j;
      renderPlace();
    }
  }
});
function up(e: PointerEvent) {
  pts.delete(e.pointerId);
  if (pinch) {
    if (pts.size < 2) pinch = null;
    return;
  }
  const d = drag;
  drag = null;
  if (!d || d.moved) return;
  const [i, j] = pick(cam, W, H, e.clientX, e.clientY);
  if (placing) {
    // マウスはその場で建てる。指は 1 回目で場所を選び、同じマスをもう一度押すと建てる
    if (e.pointerType === 'mouse' || (placing.i === i && placing.j === j)) {
      placing.i = i;
      placing.j = j;
      tryPlace();
    } else {
      placing.i = i;
      placing.j = j;
      renderPlace();
    }
    return;
  }
  const b = occupant(s, i, j);
  selected = b ? b.uid : null;
  confirmDemolish = false;
  renderAll();
}
canvas.addEventListener('pointerup', up);
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
    const next = e.deltaY < 0 ? ZOOMS[Math.min(ZOOMS.length - 1, k + 1)] : ZOOMS[Math.max(0, k - (ZOOMS[k] === cam.zoom ? 1 : 0))];
    cam.zoom = next;
  },
  { passive: false },
);
addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    placing = null;
    selected = null;
    renderAll();
  } else if (e.key === 'r' || e.key === 'R') {
    if (placing) placing.dir = DIRS[(DIRS.indexOf(placing.dir) + 1) % 4];
    else if (selected != null) rotate(s, selected);
    renderAll();
  } else if (e.key === ' ') {
    e.preventDefault();
    speed = speed ? 0 : 1;
    renderHud();
  } else if (e.key === '1' || e.key === '2' || e.key === '3') {
    speed = [1, 4, 0][Number(e.key) - 1];
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
let celebrated = won(s);
function frame(now: number) {
  const dt = Math.min(250, now - last);
  last = now;
  acc += dt * speed;
  let changed = false;
  while (acc >= DAY_MS) {
    acc -= DAY_MS;
    const r = step(s);
    changed = true;
    for (const b of r.finished) {
      fx.push({ uid: b.uid, start: now });
      toast(t(`${DEF[b.id].name}が完成しました！`, `${DEF[b.id].name} is complete!`));
    }
    if (r.month) {
      const m = r.month;
      toast(t(`月末：売上 +${fmt(m.income)}・税 +${fmt(m.tax)}・維持費 −${fmt(m.upkeep)}`, `Month end: sales +${fmt(m.income)}, tax +${fmt(m.tax)}, upkeep −${fmt(m.upkeep)}`));
      if (m.moved > 0) toast(t(`${m.moved} 人が引っ越してきました`, `${m.moved} people moved in`));
      if (m.moved < 0) toast(t(`${-m.moved} 人が島を出ていきました`, `${-m.moved} people left the island`));
      for (const p of newMilestones(s)) {
        const opened = DEFS.filter((d) => d.unlock === p).length;
        toast(t(`人口 ${p} 人！${opened ? `新しい建物が ${opened} 種類建てられます` : ''}`, `${p} people!${opened ? ` ${opened} new buildings unlocked` : ''}`));
      }
      if (r.election) {
        speed = 0;
        const e = r.election;
        if (e.won)
          modal(t('選挙で続投が決まりました！', 'Re-elected!'), t(`支持率 ${e.approval}%。あと 2 年、島づくりを任されました。`, `${e.approval}% approval. The island is yours for two more years.`), [[t('続ける', 'Keep going'), () => ((speed = 1), renderHud()), 'is-on']]);
        else
          modal(t('選挙に負けてしまいました…', 'You lost the election…'), t(`支持率 ${e.approval}%（${ELECTION.pass}% に届かず）。試作なので、このまま続けることもできます。`, `${e.approval}% approval (below ${ELECTION.pass}%). This is a prototype, so you may keep playing.`), [
            [t('新しい島で', 'New island'), () => { s = newGame(); selected = null; placing = null; save(); speed = 1; renderAll(); }, 'is-on'],
            [t('このまま続ける', 'Keep playing'), () => ((speed = 1), renderHud())],
          ]);
      } else if (monthsToElection() === 3) toast(t('3 か月後に選挙があります', 'Election in 3 months'));
      if (!celebrated && won(s)) {
        celebrated = true;
        speed = 0;
        modal(t('島が栄えました！', 'The island is thriving!'), t(`人口 ${fmt(s.pop)} 人・支持率 ${s.approval}%。このまま島づくりを続けられます。`, `${fmt(s.pop)} people and ${s.approval}% approval. You can keep building.`), [[t('続ける', 'Keep going'), () => ((speed = 1), renderHud()), 'is-on']]);
      }
      save();
    }
  }
  for (let k = fx.length - 1; k >= 0; k--) if (effectDone(fx[k], now)) fx.splice(k, 1);
  if (changed) {
    renderHud();
    renderBuild();
    renderAdvisor();
    if (selected != null) renderInfo();
    if (lifeOpen) renderLife();
    if (placing) renderPlace();
    layout();
  }
  const ghost: Ghost | null = placing ? { def: placing.def, i: placing.i, j: placing.j, dir: placing.dir, ok: !canPlace(s, placing.def, placing.i, placing.j, placing.dir) } : null;
  draw(ctx, s, cam, W, H, now, fx, ghost, selected);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// 動作確認用（ブラウザのコンソールや撮影スクリプトから）
(window as unknown as { islandDebug: unknown }).islandDebug = {
  state: () => s,
  cells,
  setState: (next: State) => {
    s = next;
    renderAll();
  },
};
