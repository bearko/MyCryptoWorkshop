/**
 * フェーズ 1 の札：工房（クラフト）・お店・調達・従業員・市場データ・ランキング・スキル・月の報告。
 * どれも下から出る大きな札（sheet）。中身は state から毎回作り直す。
 */
import { t, isEn } from '../../i18n';
import { assetUrl, drawRef } from '../../render/images';
import { getExtension, heroById, heroFacesRight } from '../../game/catalog';
import raw from '../../generated/catalog.json';
import { DEF } from '../defs';
import {
  ADS,
  PROC,
  procNeed,
  BRANCHES,
  DEV,
  INTEL,
  INVESTS,
  LAND_COMPANIES,
  MISSIONS,
  PAY,
  MAT_KEYS,
  MATS,
  P1B,
  PRODUCT,
  PRODUCTS,
  RIVALS,
  SHOP,
  SKILLS,
  TASKS,
  UNCOMMON,
  WORLD_COMPANIES,
  aptitude,
  sku,
  skuParts,
  skuPrice,
  type Mat,
  type Rar,
  type Sku,
  type Task,
} from './data';
import {
  adBoost,
  fullUse,
  procCap,
  procItems,
  procLeft,
  procMats,
  procQty,
  setProcQty,
  toggleProcExtra,
  toggleProcItem,
  utilRate,
  areaRanking,
  assign,
  bonus,
  bonusCost,
  claim,
  devCost,
  develop,
  intelLv,
  invest,
  investCost,
  invLv,
  openMissions as missionList,
  raise,
  raiseStep,
  runAd,
  unitCost,
  type PBuilding,
  batchOf,
  buy,
  craftCheck,
  craftDays,
  has,
  myWarehouses,
  poolCap,
  poolFree,
  poolUsed,
  hire,
  learn,
  market,
  matPrice,
  monthRevenue,
  myShops,
  partMax,
  recommend,
  setPart,
  setRest,
  setShelf,
  speed,
  staffOf,
  startCraft,
  wageOf,
  heroStats,
  type P1State,
  type Report,
} from './model';
import { bar, btn, fmt, h, heroIcon, heroName, matIcon, money, sheet, skuIcon, skuName } from './ui';
import { bomRow, extCard, extSlot, jobLabel, lotsFromStock, pickExt, pickHero, profitPerDay, slot } from './heroui';

export interface Ctx {
  s: () => P1State;
  root: HTMLElement;
  save: () => void;
  /** 地図と上の帯を描き直す */
  refresh: () => void;
  toast: (text: string) => void;
  /** ✕ や外側を押して札を閉じた（下の帯のメニューも閉じる） */
  dismissed?: () => void;
  /** チュートリアル：この画面でマインちゃんが言うこと（無ければ null） */
  tip?: (screen: string) => string | null;
  /** 札を閉じて、その建物を置くモードへ */
  build?: (id: string) => void;
  /** チュートリアルのいまの段（tut.ts の id。終わっていれば null） */
  step?: () => string | null;
}

/** 画面の上にマインちゃんの一言（チュートリアル中） */
export function mineTip(ctx: Ctx, screen: string, body: HTMLElement) {
  const text = ctx.tip?.(screen);
  if (!text) return;
  const tip = h('div', 'isl-mine-tip is-tut');
  const mi = h('img');
  mi.src = assetUrl('mch/Image/Characters/navi_ain_speak_00_talk.png');
  mi.alt = '';
  tip.append(mi, h('p', '', text));
  body.append(tip);
}

/** 開いている札（1 日ごとに描き直す） */
let current: { render: () => void; close: () => void } | null = null;
export function refreshSheet() {
  const a = document.activeElement;
  if (current && !(a instanceof HTMLSelectElement)) current.render();
}
export const sheetOpen = () => !!current;
export function closeSheet() {
  current?.close();
  current = null;
}

export function open(ctx: Ctx, title: string, render: (body: HTMLElement) => void, onClose?: () => void) {
  closeSheet();
  const sh = sheet(
    ctx.root,
    title,
    () => {
      current = null;
      onClose?.();
      ctx.refresh();
    },
    () => ctx.dismissed?.(),
  );
  const draw = () => {
    const y = sh.body.scrollTop;
    sh.body.replaceChildren();
    render(sh.body);
    sh.body.scrollTop = y;
  };
  current = { render: draw, close: sh.close };
  draw();
  // チュートリアルで光らせた枠が見えるところまで送る
  const hot = sh.body.querySelector('.is-hot');
  if (hot && hot.getBoundingClientRect().bottom > sh.body.getBoundingClientRect().bottom) requestAnimationFrame(() => hot.scrollIntoView({ block: 'center' }));
}

export const after = (ctx: Ctx) => {
  ctx.save();
  ctx.refresh();
  current?.render();
};

const CRAFT_ERR: Record<string, string> = {
  pot: t('アンコモンには「魔法の釜」が要ります（スキル）', 'Uncommons need the Magic Pot (skill)'),
  dev: t('このアンコモンはまだ開発していません（営業企画 → 商品開発）', 'Develop this Uncommon first (Planning → Product development)'),
  skill: t(`アンコモンには製造の適性 ${UNCOMMON.minCraft} 以上の職人が要ります`, `Uncommons need a crafter with aptitude ${UNCOMMON.minCraft}+`),
  mats: t('素材が足りません（「調達」で買えます）', 'Not enough materials (buy them under Buy)'),
  full: t('置き場所がいっぱいで、できた商品を置けません（倉庫を建てるか、お店へ運びましょう）', 'No room for finished goods (build a warehouse or haul to shops)'),
  worker: t('職人を割り当ててください', 'Assign a crafter first'),
  busy: t('作業中です', 'Already working'),
};

/** 作れる商品（Common と、開発したアンコモン） */
function craftable(s: P1State): Sku[] {
  const out: Sku[] = PRODUCTS.map((p) => sku(p.key, 'C'));
  out.push(...PRODUCTS.filter((p) => s.dev.includes(p.key)).map((p) => sku(p.key, 'U')));
  return out;
}



// ---------------------------------------------------------------- 工房

export function openWorkshop(ctx: Ctx) {
  open(ctx, t('工房', 'Workshop'), (body) => {
    const s = ctx.s();
    mineTip(ctx, 'workshop', body);
    const scene = h('div', 'isl-craft-scene');
    scene.style.backgroundImage = `url("${assetUrl('mch/Image/CraftBackgrounds/Base/100.webp')}")`;
    const amb = h('img', 'isl-craft-amb');
    amb.src = assetUrl('mch/Image/CraftBackgrounds/Base/200.gif');
    amb.alt = '';
    scene.append(amb);
    if (has(s, 'pot')) {
      const pot = h('img', 'isl-craft-pot');
      pot.src = assetUrl('mch/Image/CraftBackgrounds/Stages/201.gif');
      pot.alt = '';
      scene.append(pot);
    }
    const crew = h('div', 'isl-craft-crew');
    for (const sl of s.slots) if (sl.worker != null) crew.append(heroIcon(sl.worker, 64));
    scene.append(crew);
    body.append(scene);

    // 作業台：職人の枠と、作るエクステの枠。エクステを選ぶとすぐ作り始める（続けて作る）
    s.slots.forEach((sl, k) => {
      const card = h('div', 'isl-card2 isl-bench');
      card.append(h('h3', '', t(`作業台 ${k + 1}`, `Workbench ${k + 1}`)));
      const row = h('div', 'isl-slots');
      row.append(
        slot(s, {
          label: t('職人', 'Crafter'),
          task: 'craft',
          hero: sl.worker,
          hot: ctx.step?.() === 'craft' && k === 0 && sl.worker == null,
          onTap: () =>
            pickHero(ctx.root, s, {
              title: t(`作業台 ${k + 1} の職人`, `Crafter for bench ${k + 1}`),
              task: 'craft',
              current: sl.worker,
              onPick: (v) => {
                if (v == null && sl.worker != null) assign(s, sl.worker, null);
                else if (v != null) assign(s, v, 'craft', k);
                after(ctx);
              },
            }),
        }),
        h('span', 'isl-slot-arrow', '→'),
        extSlot({
          label: t('作るもの', 'Making'),
          x: sl.sku,
          hot: ctx.step?.() === 'craft' && k === 0 && sl.worker != null && !sl.sku,
          sub: sl.sku ? (sl.repeat ? t('続けて作る', 'Repeating') : t('1 回だけ', 'Once')) : undefined,
          warn: !!sl.sku && !sl.running && !!craftCheck(s, sl.sku, sl.worker),
          onTap: () =>
            pickExt(ctx.root, s, {
              title: t(`作業台 ${k + 1} で作るもの`, `What bench ${k + 1} makes`),
              items: craftable(s),
              current: sl.sku,
              worker: sl.worker,
              badge: ctx.step?.() === 'craft' ? { x: sku(recommend(s), 'C'), text: t('マインちゃんのおすすめ', 'Mine-chan’s pick') } : null,
              onPick: (x) => {
                if (!x) return;
                if (sl.sku !== x) {
                  sl.sku = x;
                  sl.running = false;
                  sl.progress = 0;
                }
                sl.repeat = true;
                const e = sl.worker == null ? 'worker' : startCraft(s, k, x, true);
                if (e && e !== 'busy') ctx.toast(CRAFT_ERR[e] ?? e);
                else ctx.toast(t(`${skuName(x)}を作り始めました`, `Started making ${skuName(x)}`));
                after(ctx);
              },
            }),
        }),
      );
      card.append(row);
      if (sl.sku) card.append(bomRow(s, sl.sku, 24));
      const st = sl.worker != null ? staffOf(s, sl.worker) : null;
      if (sl.running && sl.sku) {
        const need = craftDays(s, sl.sku);
        const p = h('div', 'isl-field');
        const left = Math.max(0, Math.ceil((need - sl.progress) / (st ? speed(st, 'craft') : 1)));
        p.append(h('span', '', t('進み', 'Progress')), bar(sl.progress / need, 'var(--isl-gold)'), h('span', 'isl-dim', st?.resting ? t('休憩中', 'Resting') : t(`あと約 ${left} 日`, `~${left} days left`)));
        card.append(p);
      }
      const err = sl.worker == null ? 'worker' : sl.sku ? craftCheck(s, sl.sku, sl.worker) : null;
      if (err && !sl.running) card.append(h('p', 'isl-warn', CRAFT_ERR[err] ?? err));
      if (sl.sku) {
        const r = h('div', 'isl-row');
        r.append(
          btn(sl.repeat ? t('続けて作る：オン', 'Repeat: on') : t('続けて作る：オフ', 'Repeat: off'), () => {
            sl.repeat = !sl.repeat;
            if (sl.repeat && !sl.running && sl.worker != null && sl.sku) startCraft(s, k, sl.sku, true);
            after(ctx);
          }, sl.repeat ? 'is-on' : ''),
        );
        card.append(r);
      }
      body.append(card);
    });

    // 作れるエクステの見比べ（今の素材で、どれがいちばん効率がよいか）
    const cmp = h('div', 'isl-card2');
    cmp.append(h('h3', '', t('作れるエクステの見比べ', 'Compare extensions')), h('p', 'isl-dim', t('素材 → 商品のつながりと、今の素材で何ロット作れるか、1 日あたりの粗利。押すと作業台 1 で作ります。', 'Materials → product, lots your stock makes and gross profit per day. Tap to make it on bench 1.')));
    const list = [...craftable(s)].sort((a, b) => profitPerDay(s, b) - profitPerDay(s, a));
    const okList = list.filter((x) => lotsFromStock(s, x) > 0 && !craftCheck(s, x, s.slots[0]?.worker ?? null));
    const grid = h('div', 'isl-ext-grid');
    for (const x of list)
      grid.append(
        extCard(s, x, {
          worker: s.slots[0]?.worker ?? null,
          best: x === okList[0],
          on: s.slots.some((sl) => sl.sku === x),
          onTap: () => {
            const sl = s.slots[0];
            if (!sl) return;
            sl.sku = x;
            sl.running = false;
            sl.progress = 0;
            sl.repeat = true;
            const e = sl.worker == null ? 'worker' : startCraft(s, 0, x, true);
            if (e && e !== 'busy') ctx.toast(CRAFT_ERR[e] ?? e);
            after(ctx);
          },
        }),
      );
    cmp.append(grid);
    body.append(cmp);

    const stock = h('div', 'isl-card2');
    stock.append(h('h3', '', t('工房の倉庫（運ぶ前の商品）', 'Workshop storage (goods to haul)')));
    const sl = h('div', 'isl-stock');
    const entries = Object.entries(s.stock).filter(([, n]) => (n ?? 0) > 0) as [Sku, number][];
    if (!entries.length) sl.append(h('span', 'isl-dim', t('まだありません', 'Nothing yet')));
    for (const [x, n] of entries) {
      const c = h('span', 'isl-chip');
      c.append(skuIcon(x, 28), h('span', '', `${skuName(x)} ×${n}`));
      sl.append(c);
    }
    stock.append(sl, h('p', 'isl-dim', t('できた商品は、物流の担当がお店へ運びます。', 'Haulers carry finished goods to your shops.')));
    body.append(stock);
  });
}

// ---------------------------------------------------------------- お店

/** お店の中の小さな場面：窓・棚・店員・お客さん */
function shopScene(s: P1State, uid: number): HTMLCanvasElement {
  const c = h('canvas', 'isl-shop-scene');
  c.width = 320;
  c.height = 180;
  const ctx = c.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  const sh = s.shops[uid];
  const guests = [1001, 1002, 1005, 1008, 1011, 1014].filter((id) => heroById.has(id));
  let walkers: { hero: number; x: number; goal: number; wait: number; bob: number; shelf: number; facing?: number }[] = [];
  let nextAt = performance.now() + 600;
  let lastT = performance.now();
  const view = new Image();
  view.src = assetUrl(raw.windowView);
  let raf = 0;
  const startAt = performance.now();
  const draw = (now: number) => {
    if (!c.isConnected) {
      if (now - startAt > 500) return cancelAnimationFrame(raf);
    }
    ctx.fillStyle = '#5a3a24';
    ctx.fillRect(0, 0, 320, 180);
    if (view.complete && view.naturalWidth) ctx.drawImage(view, 0, 0, 320, 80);
    ctx.fillStyle = '#7a5434';
    ctx.fillRect(0, 80, 320, 100);
    ctx.fillStyle = '#8c6440';
    for (let x = 0; x < 320; x += 32) ctx.fillRect(x, 80, 2, 100);
    // 棚
    ctx.fillStyle = '#3a2416';
    ctx.fillRect(16, 60, 150, 70);
    sh.shelves.forEach((x, k) => {
      ctx.fillStyle = '#c9925a';
      ctx.fillRect(20, 70 + k * 20, 142, 4);
      if (!x) return;
      const n = Math.min(6, Math.ceil((sh.shelf[x] ?? 0) / 5));
      const [key, r] = skuParts(x);
      const ref = getExtension(PRODUCT[key].ext[r]).image;
      for (let i = 0; i < n; i++) drawRef(ctx, ref, 22 + i * 23, 52 + k * 20, 20, 20);
    });
    // レジと店員
    ctx.fillStyle = '#3a2416';
    ctx.fillRect(210, 110, 100, 26);
    ctx.fillStyle = '#d8b07a';
    ctx.fillRect(210, 110, 100, 5);
    const staff = sh.staff != null ? heroById.get(sh.staff) : null;
    if (staff) drawRef(ctx, staff.image, 236, 58, 56, 56);
    // お客さん（Workshop と同じ歩き方）：入口から入って棚を見て、レジで払って出ていく。ゆっくり来店する
    const dt = Math.min(100, now - lastT);
    lastT = now;
    if ((staff || sh.part > 0) && now >= nextAt && walkers.length < 2) {
      walkers.push({ hero: guests[Math.floor(Math.random() * guests.length)], x: 340, goal: 0, wait: 0, bob: 0, shelf: 60 + Math.random() * 80 });
      nextAt = now + 4200 + Math.random() * 3000;
    }
    const STOPS = 3;
    for (const w of walkers) {
      const stop = [{ x: w.shelf, wait: 1600 }, { x: 196, wait: 900 }, { x: 350, wait: 0 }][w.goal];
      if (w.wait > 0) w.wait -= dt;
      else {
        const dx = stop.x - w.x;
        const step = Math.sign(dx) * Math.min(Math.abs(dx), (dt / 1000) * 70);
        if (Math.abs(dx) > 1) {
          w.x += step;
          w.facing = dx < 0 ? -1 : 1;
          w.bob += dt / 100;
        } else {
          w.wait = stop.wait;
          w.goal++;
        }
      }
      const g = heroById.get(w.hero);
      if (!g) continue;
      const walking = w.wait <= 0;
      const hop = walking ? Math.abs(Math.sin(w.bob)) * 3 : 0;
      const flip = heroFacesRight(w.hero) ? (w.facing ?? -1) < 0 : (w.facing ?? -1) > 0;
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.beginPath();
      ctx.ellipse(w.x, 164, 12, 3.5, 0, 0, Math.PI * 2);
      ctx.fill();
      const px = w.x - (flip ? 64 - g.cx : g.cx) * (44 / 64);
      if (flip) {
        ctx.save();
        ctx.translate(px + 44, 122 - hop);
        ctx.scale(-1, 1);
        drawRef(ctx, g.image, 0, 0, 44, 44);
        ctx.restore();
      } else drawRef(ctx, g.image, px, 122 - hop, 44, 44);
    }
    walkers = walkers.filter((w) => w.goal < STOPS);
    raf = requestAnimationFrame(draw);
  };
  raf = requestAnimationFrame(draw);
  return c;
}

export function openShop(ctx: Ctx, uid: number) {
  const s0 = ctx.s();
  const b = s0.buildings.find((x) => x.uid === uid);
  if (!b) return;
  const name = DEF[b.id].name;
  open(ctx, name, (body) => {
    mineTip(ctx, 'shop', body);
    const s = ctx.s();
    const sh = s.shops[uid];
    if (!sh) {
      body.append(h('p', '', t('工事が終わると開けます。', 'Opens when construction is done.')));
      return;
    }
    body.append(shopScene(s, uid));
    const info = h('div', 'isl-card2');
    info.append(h('h3', '', t('今月の売上', 'Sales this month')), h('p', 'isl-big', money(sh.rev)));
    const sat = h('div', 'isl-field');
    sat.append(h('span', '', t('お客さんの満足', 'Customer mood')), bar(sh.sat, sh.sat > 0.8 ? 'var(--isl-good)' : 'var(--isl-bad)'));
    info.append(sat, h('p', 'isl-dim', t('棚が空になる日が続くと満足が下がり、売れにくくなります。', 'Empty shelves lower the mood and slow sales.')));
    body.append(info);

    // 棚：四角い枠にエクステの絵。押すとエクステを選ぶ
    const shelves = h('div', 'isl-card2');
    shelves.append(h('h3', '', t('棚（左が主力商品）', 'Shelves (left is the main product)')));
    const row = h('div', 'isl-slots');
    sh.shelves.forEach((x, k) => {
      row.append(
        extSlot({
          label: k === 0 ? t('主力商品', 'Main') : t(`棚 ${k + 1}`, `Shelf ${k + 1}`),
          x,
          hot: ctx.step?.() === 'sell' && k === 0 && !x,
          sub: x ? t(`棚 ${sh.shelf[x] ?? 0}・裏 ${sh.storage[x] ?? 0}`, `shelf ${sh.shelf[x] ?? 0}, back ${sh.storage[x] ?? 0}`) : undefined,
          warn: !!x && (sh.shelf[x] ?? 0) <= 0 && (sh.storage[x] ?? 0) <= 0,
          onTap: () =>
            pickExt(ctx.root, s, {
              title: k === 0 ? t('主力商品を選ぶ', 'Choose the main product') : t(`棚 ${k + 1} に並べるもの`, `What shelf ${k + 1} sells`),
              items: craftable(s),
              current: x,
              allowNone: true,
              making: s.slots.map((y) => y.sku).filter((y): y is Sku => !!y),
              badge: (() => {
                const m = s.slots.find((y) => y.sku)?.sku;
                return m ? { x: m, text: t('工房で作っている', 'Being crafted') } : null;
              })(),
              note: t('工房で作っているエクステを並べましょう。他社が少なく需要の大きいものほど売れます。', 'Shelve what your workshop makes. Items with high demand and few rivals sell best.'),
              onPick: (v) => {
                setShelf(s, uid, k, v);
                after(ctx);
              },
            }),
        }),
      );
    });
    shelves.append(row);
    if (!has(s, 'shelf1')) shelves.append(h('p', 'isl-dim', t('棚はスキル「棚を増やす」で増やせます。', 'Add shelves with the “More shelves” skill.')));
    body.append(shelves);

    const crew = h('div', 'isl-card2');
    crew.append(h('h3', '', t('売り場の人', 'Floor staff')));
    const r2 = h('div', 'isl-slots');
    r2.append(
      slot(s, {
        label: t('店員', 'Clerk'),
        task: 'shop',
        hero: sh.staff,
        hot: ctx.step?.() === 'sell' && sh.staff == null && sh.part === 0,
        onTap: () =>
          pickHero(ctx.root, s, {
            title: t(`${name}の店員`, `Clerk for ${name}`),
            task: 'shop',
            current: sh.staff,
            onPick: (v) => {
              if (v == null && sh.staff != null) assign(s, sh.staff, null);
              else if (v != null) assign(s, v, 'shop', uid);
              after(ctx);
            },
          }),
      }),
    );
    // アルバイト：人の形を並べて、＋／−
    const pt = h('div', 'isl-part');
    pt.append(h('small', 'isl-slot-label', t('アルバイト', 'Part-timers')));
    const people = h('div', 'isl-part-people');
    for (let k = 0; k < partMax(s); k++) people.append(h('span', `isl-person ${k < sh.part ? 'is-on' : ''}`, '👤'));
    const pr = h('div', 'isl-row');
    const minus = btn('−', () => {
      setPart(s, uid, sh.part - 1);
      after(ctx);
    });
    const plus = btn('+', () => {
      setPart(s, uid, sh.part + 1);
      after(ctx);
    });
    minus.disabled = sh.part <= 0;
    plus.disabled = sh.part >= partMax(s);
    pr.append(minus, plus);
    pt.append(people, pr, h('small', 'isl-dim', t(`1 人 1 日 ${SHOP.partTimeWage} G`, `${SHOP.partTimeWage} G/day each`)));
    r2.append(pt);
    crew.append(r2, h('p', 'isl-dim', t('店員かアルバイトがいれば、届いた商品を棚に並べて自動で売ります。販売は INT が高いヒーローが得意です。', 'With a clerk or part-timer, deliveries are shelved and sold automatically. High-INT heroes sell best.')));
    body.append(crew);
  });
}

// ---------------------------------------------------------------- 調達

export function openBuy(ctx: Ctx) {
  open(ctx, t('調達', 'Buying'), (body) => {
    const s = ctx.s();
    mineTip(ctx, 'buy', body);
    // ランクと上限
    const rank = h('div', 'isl-card2');
    const need = procNeed(s.proc.lv);
    const bonus = (has(s, 'stock1') ? 30 : 0) + (has(s, 'stock2') ? 60 : 0);
    rank.append(
      h('h3', '', t(`調達ランク Lv.${s.proc.lv}`, `Buying rank Lv.${s.proc.lv}`)),
      bar(s.proc.lv >= PROC.maxLv ? 1 : s.proc.exp / need, 'var(--isl-gold)'),
      h('p', 'isl-dim', s.proc.lv >= PROC.maxLv ? t('最高ランクです', 'Max rank') : t(`次のランクまで ${Math.ceil(need - s.proc.exp)}（買った数と買い付けの回数で上がります）`, `${Math.ceil(need - s.proc.exp)} to the next rank (raised by units and purchases)`)),
      h('p', 'isl-big', t(`今月 ${s.proc.bought} / ${procCap(s)} 個`, `This month ${s.proc.bought} / ${procCap(s)}`)),
      h('p', poolFree(s) <= 0 ? 'isl-warn' : 'isl-dim', myWarehouses(s).length ? t(`置き場所（工房の物置＋倉庫 ${myWarehouses(s).length}）：${poolUsed(s)} / ${poolCap(s)} 個`, `Storage (workshop + ${myWarehouses(s).length} warehouse(s)): ${poolUsed(s)} / ${poolCap(s)}`) : t(`置き場所（工房の物置）：${poolUsed(s)} / ${poolCap(s)} 個。いっぱいになったら「建築」で倉庫を建てましょう`, `Storage (workshop): ${poolUsed(s)} / ${poolCap(s)}. Build a warehouse when it fills up`)),
      h('p', 'isl-dim', bonus ? t(`月に買える素材の数の上限です。ランクが上がると増えます（スキルで +${bonus}%）。`, `Monthly limit on materials bought. Grows with rank (skills +${bonus}%).`) : t('月に買える素材の数の上限です。ランクが上がると増えます。スキル「調達枠の拡大」でも増やせます。', 'Monthly limit on materials bought. Grows with rank and the “Bigger buying quota” skill.')),
    );
    body.append(rank);

    // 調達係
    const crew = h('div', 'isl-card2');
    const buyer = s.staff.find((x) => x.task === 'buy');
    const row = h('div', 'isl-slots');
    row.append(buyerSlot(ctx, s));
    crew.append(h('h3', '', t('自動の買い付け', 'Automatic buying')), row);
    crew.append(
      h(
        'p',
        buyer ? (buyer.resting ? 'isl-warn' : 'isl-dim') : 'isl-warn',
        !buyer ? t('調達係がいないので、自動では買いません。下の量は、調達係を決めると毎日少しずつ買い付けます。', 'No buyer: nothing is bought automatically. Assign one to buy the amounts below a little every day.') : buyer.resting ? t('調達係が休憩中なので、いまは買い付けが止まっています。', 'The buyer is resting; buying is paused.') : t('調達係が工房から卸問屋まで歩いて行き、往復の日数ぶんの「月の量」を買って帰ります（月の上限・資金・置き場所の中で）。適性が高いほど速く歩き、ランクも早く上がります。', 'The buyer walks from the workshop to the wholesaler and brings back what the trip’s days need from the monthly amounts (within the limit, funds and storage). Higher aptitude walks faster and raises the rank faster.'),
      ),
    );
    const u = utilRate(s.utilLast);
    crew.append(h('p', 'isl-dim', u == null ? t('先月の工房の稼働率：まだ記録がありません', 'Workshop utilization last month: no record yet') : t(`先月の工房の稼働率：${Math.round(u * 100)}%`, `Workshop utilization last month: ${Math.round(u * 100)}%`)));
    body.append(crew);

    // 作りたいエクステ
    const want = h('div', 'isl-card2');
    want.append(h('h3', '', t('作りたいエクステ', 'Extensions to make')), h('p', 'isl-dim', t('選ぶと、必要な素材が下で自動で選ばれます（最初は作業台で作っているもの）。', 'Their materials are selected below automatically (defaults to what the benches make).')));
    const chips = h('div', 'isl-stock');
    const items = procItems(s);
    for (const x of craftable(s)) {
      const c = h('button', `isl-chip isl-pick ${items.includes(x) ? 'is-on' : ''}`);
      c.type = 'button';
      c.append(skuIcon(x, 24), h('small', '', skuName(x)));
      c.addEventListener('click', () => {
        toggleProcItem(s, x);
        after(ctx);
      });
      chips.append(c);
    }
    want.append(chips);
    body.append(want);

    // 素材ごとの月の量
    body.append(h('h3', '', t('素材ごとの月の量', 'Monthly amount per material')));
    const picked = procMats(s);
    const full = fullUse(s);
    // 買い付ける素材を上に
    const order = [...MAT_KEYS].sort((a, b) => Number(!picked.some((x) => x.m === a)) - Number(!picked.some((x) => x.m === b)));
    for (const m of order) {
      const card = h('div', 'isl-card2 isl-matrow');
      const route = s.routes.includes(m);
      const sel = picked.find((x) => x.m === m);
      const top = h('div', 'isl-row');
      top.append(matIcon(m, 32), h('b', '', MATS[m].name), h('span', 'isl-dim', t(`在庫 ${s.mats[m] ?? 0}・1 個 ${matPrice(s, m)} G`, `have ${s.mats[m] ?? 0}, ${matPrice(s, m)} G each`)));
      if (route) {
        if (sel?.from === 'item') top.append(h('span', 'isl-chip is-on', t('エクステから', 'From extensions')));
        else
          top.append(
            btn(sel ? t('調達から外す', 'Remove') : t('調達に追加', 'Add'), () => {
              toggleProcExtra(s, m);
              after(ctx);
            }, sel ? '' : 'is-on'),
          );
      }
      card.append(top);
      if (route && sel) {
        const q = s.proc.qty[m];
        const n = procQty(s, m);
        const last0 = s.matUsedLast ? (s.matUsedLast[m] ?? 0) : null;
        // 月の量：数字を打つ代わりに、−／＋と、先月・100% の印がついた棒で
        const f = h('div', 'isl-qty');
        const max = Math.max(10, n, last0 ?? 0, full[m] ?? 0) * 1.25;
        const meter = h('div', 'isl-qty-meter');
        const fill = h('i', 'isl-qty-fill');
        fill.style.width = `${(n / max) * 100}%`;
        meter.append(fill);
        if (last0 != null) {
          const mk = h('i', 'isl-qty-mark');
          mk.style.left = `${(last0 / max) * 100}%`;
          mk.title = t('先月の消費', 'Used last month');
          meter.append(mk);
        }
        const mk2 = h('i', 'isl-qty-mark is-full');
        mk2.style.left = `${((full[m] ?? 0) / max) * 100}%`;
        mk2.title = t('100% 動いたとき', 'At 100%');
        meter.append(mk2);
        const steps = h('div', 'isl-row');
        steps.append(
          btn('−10', () => (setProcQty(s, m, n - 10), after(ctx))),
          btn('−1', () => (setProcQty(s, m, n - 1), after(ctx))),
          h('b', 'isl-qty-n', t(`${n} 個／月`, `${n}/mo`)),
          btn('+1', () => (setProcQty(s, m, n + 1), after(ctx))),
          btn('+10', () => (setProcQty(s, m, n + 10), after(ctx))),
        );
        if (full[m]) steps.append(btn(t('100% に合わせる', 'Match 100%'), () => (setProcQty(s, m, full[m] ?? 0), after(ctx))));
        if (q && !q.auto) steps.append(btn(t('自動に戻す', 'Back to auto'), () => (setProcQty(s, m, null), after(ctx))));
        f.append(meter, steps, h('small', 'isl-dim', q && !q.auto ? t('手で決めた量', 'Set by you') : (s.matUsedLast?.[m] ?? 0) > 0 ? t('先月と同じ（自動）', 'Same as last month (auto)') : t('100% 動いたときの見込み（自動）', 'Estimate at 100% (auto)')));
        card.append(f);
        const last = s.matUsedLast ? (s.matUsedLast[m] ?? 0) : null;
        const ref = [last == null ? t('先月の消費：記録なし', 'Last month: no record') : t(`先月の消費 ${last} 個`, `Used last month: ${last}`)];
        if (u != null && u < 0.995) ref.push(t(`稼働率 100% なら ${full[m] ?? 0} 個`, `${full[m] ?? 0} at 100% utilization`));
        else if (last == null) ref.push(t(`工房が 100% 動けば ${full[m] ?? 0} 個`, `${full[m] ?? 0} if the workshop runs 100%`));
        card.append(h('p', 'isl-dim', ref.join(t('・', ' · '))));
      }
      if (route) {
        const spot = h('div', 'isl-row');
        spot.append(h('small', 'isl-dim', t('いますぐ買う', 'Buy now')));
        for (const k of [10, 50]) {
          const b = btn(`+${k} (${money(matPrice(s, m) * k)})`, () => {
            const e = buy(s, m, k);
            if (e === 'money') ctx.toast(t('資金が足りません', 'Not enough funds'));
            else if (e === 'cap') ctx.toast(t('今月の調達の上限を超えます', 'Over this month’s buying limit'));
            else if (e === 'storage') ctx.toast(t('置き場所がありません（倉庫を建てましょう）', 'No storage room (build a warehouse)'));
            after(ctx);
          });
          b.disabled = s.money < matPrice(s, m) * k || procLeft(s) < k || poolFree(s) < k;
          spot.append(b);
        }
        card.append(spot);
      } else {
        const scout = s.staff.find((x) => x.task === 'explore' && x.target === m);
        if (scout) card.append(h('p', '', t(`${heroName(scout.hero)}が開拓中`, `${heroName(scout.hero)} is scouting`)), bar(scout.explore / MATS[m].exploreDays));
        else {
          const r = h('div', 'isl-row');
          r.append(h('span', 'isl-dim', t(`ルートが無い（開拓 ${MATS[m].exploreDays} 日〜）`, `No route (scouting from ${MATS[m].exploreDays} days)`)));
          r.append(
            btn(t('ヒーローを開拓に出す', 'Send a scout'), () =>
              pickHero(ctx.root, s, {
                title: t(`${MATS[m].name}のルートを開拓する`, `Scout a ${MATS[m].name} route`),
                task: 'explore',
                current: null,
                onPick: (v) => {
                  if (v == null) return;
                  assign(s, v, 'explore', m);
                  ctx.toast(t(`${heroName(v)}が${MATS[m].name}のルートを開拓しに出かけました`, `${heroName(v)} went scouting for a ${MATS[m].name} route`));
                  after(ctx);
                },
              }),
            ),
          );
          card.append(r);
        }
      }
      body.append(card);
    }
  });
}

// ---------------------------------------------------------------- 従業員

export function jobOptions(s: P1State) {
  const out: { value: string; label: string }[] = [{ value: 'none', label: t('なし（休ませる）', 'None (rest)') }];
  s.slots.forEach((_sl, k) => out.push({ value: `craft:${k}`, label: t(`製造：作業台 ${k + 1}`, `Craft: bench ${k + 1}`) }));
  out.push({ value: 'transport', label: t('運搬', 'Haul') });
  out.push({ value: 'buy', label: t('調達（自動の買い付け）', 'Buying (automatic)') });
  for (const b of myShops(s)) out.push({ value: `shop:${b.uid}`, label: t(`販売：${DEF[b.id].name}`, `Sell: ${DEF[b.id].name}`) });
  for (const m of MAT_KEYS) if (!s.routes.includes(m)) out.push({ value: `explore:${m}`, label: t(`開拓：${MATS[m].name}`, `Scout: ${MATS[m].name}`) });
  for (const r of s.rivals) if (intelLv(s, r.id) < INTEL.length) out.push({ value: `intel:${r.id}`, label: t(`調査：${rivalName(r.id)}`, `Research: ${rivalName(r.id)}`) });
  return out;
}

export const rivalName = (rid: string) => RIVALS.find((x) => x.id === rid)?.name ?? rid;

/** 仕事の選択肢の値を割り当てに直す */
export function applyJob(s: P1State, hero: number, v: string) {
  const [task, target] = v.split(':');
  if (task === 'none') assign(s, hero, null);
  else if (task === 'transport') assign(s, hero, 'transport');
  else if (task === 'buy') assign(s, hero, 'buy');
  else if (task === 'explore') assign(s, hero, 'explore', target as Mat);
  else if (task === 'intel') assign(s, hero, 'intel', target);
  else assign(s, hero, task as Task, Number(target));
}


function heroCard(s: P1State, hero: number, stats: ReturnType<typeof heroStats>): HTMLElement {
  const card = h('div', 'isl-hero-card');
  const top = h('div', 'isl-row');
  const name = h('div');
  name.append(h('b', '', heroName(hero)), h('div', 'isl-dim', `HP ${stats.hp} / PHY ${stats.phy} / INT ${stats.int} / AGI ${stats.agi}`));
  top.append(heroIcon(hero, 56), name);
  card.append(top);
  const apts = h('div', 'isl-apts');
  const best = TASKS.reduce((a, x) => (aptitude(stats, x.key) > aptitude(stats, a.key) ? x : a), TASKS[0]);
  for (const x of TASKS) {
    const v = aptitude(stats, x.key);
    const chip = h('span', `isl-apt ${x.key === best.key ? 'is-best' : ''}`);
    chip.title = x.note;
    chip.append(h('span', '', x.name), h('b', '', `${Math.round(v)}`));
    apts.append(chip);
  }
  card.append(apts);
  void s;
  return card;
}

/** 調達係の枠（1 人） */
function buyerSlot(ctx: Ctx, s: P1State): HTMLElement {
  const buyer = s.staff.find((x) => x.task === 'buy');
  return slot(s, {
    label: t('調達係', 'Buyer'),
    task: 'buy',
    hero: buyer?.hero ?? null,
    onTap: () =>
      pickHero(ctx.root, s, {
        title: t('調達の担当', 'Buyer'),
        task: 'buy',
        current: buyer?.hero ?? null,
        onPick: (v) => {
          for (const x of s.staff) if (x.task === 'buy' && x.hero !== v) assign(s, x.hero, null);
          if (v != null) {
            assign(s, v, 'buy');
            ctx.toast(t(`${heroName(v)}が調達係になりました`, `${heroName(v)} is now the buyer`));
          }
          after(ctx);
        },
      }),
  });
}

/** 待機中のヒーローを選んでから枠を押すと、そのまま割り当てる */
let holding: number | null = null;

export function openStaff(ctx: Ctx) {
  holding = null;
  open(ctx, t('ヒーローの配置', 'Hero assignment'), (body) => {
    const s = ctx.s();
    mineTip(ctx, 'staff', body);
    body.append(h('p', 'isl-dim', t('① 調達 → ② 製造 → ③ 物流 → ④ 販売 の枠にヒーローを置くと、サイクルが自動で回ります。枠を押すと向いているヒーローの順に出ます。下の「待機中」のヒーローを押してから枠を押しても置けます。', 'Put heroes in ① Buy → ② Craft → ③ Haul → ④ Sell and the cycle runs by itself. Tap a slot to see the best fits, or tap a free hero below, then a slot.')));
    const put = (task: Task, target: number | string | null, title: string, current: number | null, remove?: () => void) => () => {
      if (holding != null) {
        if (task === 'buy') for (const x of s.staff) if (x.task === 'buy' && x.hero !== holding) assign(s, x.hero, null);
        if (remove && current != null) remove();
        assign(s, holding, task, target);
        holding = null;
        after(ctx);
        return;
      }
      pickHero(ctx.root, s, {
        title,
        task,
        current,
        onPick: (v) => {
          if (task === 'buy') for (const x of s.staff) if (x.task === 'buy' && x.hero !== v) assign(s, x.hero, null);
          if (v == null) {
            if (current != null) assign(s, current, null);
          } else {
            if (remove && current != null && current !== v) remove();
            assign(s, v, task, target);
          }
          after(ctx);
        },
      });
    };
    const lanes = h('div', 'isl-lanes');
    body.append(lanes);
    const lane = (n: string, title: string, slots: HTMLElement[], note: string) => {
      const c = h('div', 'isl-card2 isl-lane');
      const head = h('div', 'isl-row');
      head.append(h('span', 'isl-lane-n', n), h('h3', '', title));
      c.append(head, h('p', 'isl-dim', note));
      const row = h('div', 'isl-slots');
      row.append(...slots);
      c.append(row);
      lanes.append(c);
    };
    const hot = holding != null;
    // ① 調達
    const buyer = s.staff.find((x) => x.task === 'buy');
    lane('①', t('調達', 'Buy'), [slot(s, { label: t('調達係', 'Buyer'), task: 'buy', hero: buyer?.hero ?? null, hot: hot || (ctx.step?.() === 'buyer' && !buyer), onTap: put('buy', null, t('調達の担当', 'Buyer'), buyer?.hero ?? null), onRemove: buyer ? () => (assign(s, buyer.hero, null), after(ctx)) : undefined })], t('卸問屋まで歩いて素材を買い付ける（適性：INT 寄りのバランス）', 'Walks to the wholesaler to buy materials (balanced, a bit more INT)'));
    // ② 製造
    lane(
      '②',
      t('製造', 'Craft'),
      s.slots.map((sl, k) => slot(s, { label: t(`作業台 ${k + 1}`, `Bench ${k + 1}`), task: 'craft', hero: sl.worker, hot, onTap: put('craft', k, t(`作業台 ${k + 1} の職人`, `Crafter for bench ${k + 1}`), sl.worker), onRemove: sl.worker != null ? () => (assign(s, sl.worker!, null), after(ctx)) : undefined })),
      t('工房でエクステを作る（適性：3 つの能力のバランス）', 'Makes extensions in the workshop (balance of all three stats)'),
    );
    // ③ 物流：今いる運搬係＋空きの枠（3 人まで）
    const haulers = s.staff.filter((x) => x.task === 'transport');
    const hs = haulers.map((x) => slot(s, { label: t('運搬係', 'Hauler'), task: 'transport', hero: x.hero, hot, onTap: put('transport', null, t('物流の担当', 'Hauler'), x.hero, () => assign(s, x.hero, null)), onRemove: () => (assign(s, x.hero, null), after(ctx)) }));
    if (haulers.length < 3) hs.push(slot(s, { label: t('運搬係', 'Hauler'), task: 'transport', hero: null, hot: hot || (ctx.step?.() === 'haul' && !haulers.length), onTap: put('transport', null, t('物流の担当', 'Hauler'), null) }));
    lane('③', t('物流', 'Haul'), hs, t('工房からお店へ荷車で運ぶ（適性：PHY 重視）', 'Carts goods from the workshop to shops (mostly PHY)'));
    // ④ 販売
    const shops = myShops(s);
    lane(
      '④',
      t('販売', 'Sell'),
      shops.length ? shops.map((b) => slot(s, { label: DEF[b.id].name, task: 'shop', hero: s.shops[b.uid].staff, hot, onTap: put('shop', b.uid, t(`${DEF[b.id].name}の店員`, `Clerk for ${DEF[b.id].name}`), s.shops[b.uid].staff), onRemove: s.shops[b.uid].staff != null ? () => (assign(s, s.shops[b.uid].staff!, null), after(ctx)) : undefined })) : [h('p', 'isl-dim', t('お店が開いたら店員を置けます', 'Assign a clerk once a shop opens'))],
      t('お店で棚に並べて売る（適性：INT 重視）', 'Shelves and sells in a shop (mostly INT)'),
    );
    // そのほかの仕事
    const others = s.staff.filter((x) => x.task === 'explore' || x.task === 'intel');
    if (others.length) {
      const c = h('div', 'isl-card2');
      c.append(h('h3', '', t('そのほかの仕事', 'Other jobs')));
      const row = h('div', 'isl-stock');
      for (const x of others) {
        const chip = h('span', 'isl-chip');
        chip.append(heroIcon(x.hero, 28), h('small', '', heroName(x.hero) + t('・', ' · ') + jobLabel(s, x)));
        row.append(chip);
      }
      c.append(row);
      body.append(c);
    }
    // 待機中のヒーロー
    const free = s.staff.filter((x) => x.task == null);
    const bench = h('div', 'isl-card2 isl-bench-free');
    bench.append(h('h3', '', t(`待機中のヒーロー（${free.length}）`, `Free heroes (${free.length})`)));
    if (!free.length) bench.append(h('p', 'isl-dim', t('全員が仕事中です。人手が足りなければ「人材登用」で雇えます。', 'Everyone is working. Hire more under Recruiting.')));
    const grid = h('div', 'isl-pick-grid');
    for (const x of free) {
      const card = h('button', `isl-hero-pick is-free ${holding === x.hero ? 'is-on' : ''}`);
      card.type = 'button';
      const best = TASKS.filter((k) => k.key !== 'explore' && k.key !== 'intel').reduce((a, k) => (aptitude(x.stats, k.key) > aptitude(x.stats, a.key) ? k : a));
      card.append(heroIcon(x.hero, 56), h('b', '', heroName(x.hero)), h('small', 'isl-good', t(`向いている：${best.name}`, `Best at: ${best.name}`)), h('small', 'isl-dim', `HP ${x.stats.hp} / PHY ${x.stats.phy} / INT ${x.stats.int} / AGI ${x.stats.agi}`));
      card.addEventListener('click', () => {
        holding = holding === x.hero ? null : x.hero;
        current?.render();
      });
      grid.append(card);
    }
    bench.append(grid);
    if (holding != null) bench.append(h('p', 'isl-good', t(`${heroName(holding)}を選んでいます。置きたい枠を押してください。`, `${heroName(holding)} selected. Tap a slot.`)));
    const links = h('div', 'isl-row');
    links.append(btn(t('人材登用（雇う）', 'Recruit'), () => openHire(ctx), 'is-on'), btn(t('給与・労務', 'Pay & welfare'), () => openPayroll(ctx)));
    bench.append(links);
    body.append(bench);
  });
}

// ---------------------------------------------------------------- 人材登用

export function openHire(ctx: Ctx) {
  open(ctx, t('人材登用', 'Recruiting'), (body) => {
    const s = ctx.s();
    mineTip(ctx, 'hire', body);
    if (!has(s, 'hire')) {
      body.append(h('p', 'isl-warn', t('スキル「人材の募集」（人材）を習得すると、ヒーローを雇えるようになります。', 'Learn the Recruiting skill (People) to hire heroes.')));
      return;
    }
    {
      const free = s.staff.filter((x) => x.task == null).length;
      if (free) {
        const go = h('div', 'isl-row');
        go.append(btn(t(`待機中のヒーロー ${free} 人を配置する`, `Assign ${free} free hero(es)`), () => openStaff(ctx), 'is-on'));
        body.append(go);
      }
      body.append(h('p', 'isl-dim', t('雇えるヒーローは毎月入れ替わります。数字は仕事ごとの適性です。', 'The candidates change every month. Numbers are aptitude per task.')));
      // チュートリアル（調達係を雇う段）：調達にいちばん向いている人に印
      const recBuy = ctx.step?.() === 'buyer' ? [...s.hirePool].sort((a, b) => aptitude(heroStats(b), 'buy') - aptitude(heroStats(a), 'buy'))[0] : null;
      for (const id of s.hirePool) {
        const stats = heroStats(id);
        const card = heroCard(s, id, stats);
        if (id === recBuy) {
          card.classList.add('is-rec');
          card.append(h('span', 'isl-best', t('調達にいちばん向いている', 'Best buyer')));
        }
        const r = h('div', 'isl-row');
        r.append(
          btn(t(`雇う（月給 ${money(wageOf(id))}）`, `Hire (${money(wageOf(id))}/mo)`), () => {
            hire(s, id);
            ctx.toast(t(`${heroName(id)}が仲間になりました`, `${heroName(id)} joined`));
            after(ctx);
          }, 'is-on'),
        );
        card.append(r);
        body.append(card);
      }
    }
  });
}

// ---------------------------------------------------------------- 市場データ

export function openData(ctx: Ctx) {
  const s0 = ctx.s();
  s0.flags.data = true;
  ctx.save();
  open(ctx, t('市場データ（このエリア）', 'Market data (this area)'), (body) => {
    const s = ctx.s();
    mineTip(ctx, 'data', body);
    const rows = market(s);
    const maxD = Math.max(...rows.map((r) => r.demand));
    const rec = recommend(s);
    const tip = h('div', 'isl-mine-tip');
    const mi = h('img');
    mi.src = assetUrl('mch/Image/Characters/navi_ain_speak_00_talk.png');
    mi.alt = '';
    tip.append(mi, h('p', '', t(`「${PRODUCT[rec].name}」は国民の需要が大きいのに、まだ扱っている会社が少ないみたい。最初の主力商品にぴったりです！`, `${PRODUCT[rec].name} is in high demand, yet few companies sell it. A perfect first main product!`)));
    body.append(tip);
    const table = h('div', 'isl-data');
    const head = h('div', 'isl-data-row is-head');
    for (const x of [t('商品', 'Item'), t('国民のニーズ（月）', 'Demand / mo'), t('売っている会社', 'Sellers'), t('値段', 'Price'), t('素材', 'Materials')]) head.append(h('span', '', x));
    table.append(head);
    for (const r of rows) {
      const row = h('div', `isl-data-row ${r.p.key === rec ? 'is-rec' : ''}`);
      const n = h('span', 'isl-row');
      n.append(skuIcon(sku(r.p.key, 'C'), 32), h('b', '', r.p.name));
      const d = h('span', 'isl-col');
      d.append(bar(r.demand / maxD, 'var(--isl-gold)'), h('small', '', t(`${r.demand} 個`, `${r.demand} pcs`)));
      const who = s.rivals.filter((x) => (x.sells[r.p.key] ?? 0) > 0).map((x) => RIVALS.find((y) => y.id === x.id)?.name ?? '');
      const sellers = h('span', 'isl-col');
      sellers.append(h('b', '', r.sellers ? t(`${r.sellers} 社`, `${r.sellers}`) : t('まだ無し', 'None yet')), h('small', 'isl-dim', who.join(t('・', ', '))));
      const mats = h('span', 'isl-row');
      for (const [m, q] of Object.entries(r.p.recipe.C)) {
        const c = h('span', 'isl-chip');
        c.append(matIcon(m as Mat, 18), h('small', '', `×${q}`));
        mats.append(c);
      }
      row.append(n, d, sellers, h('span', '', money(r.p.price)), mats);
      table.append(row);
    }
    body.append(table, h('p', 'isl-dim', t('売れ筋：他社がよく売っているのはランタンと鋏。競争が激しいので、最初は避けるのがおすすめです。', 'Best sellers: rivals sell many lanterns and scissors. Competition is tough there, so avoid them at first.')));
  });
}

// ---------------------------------------------------------------- ランキング

export function openRanking(ctx: Ctx, tab: 'area' | 'land' | 'world' = 'area') {
  open(ctx, t('企業ランキング（月の売上）', 'Company ranking (monthly sales)'), (body) => {
    const s = ctx.s();
    mineTip(ctx, 'ranking', body);
    const last = s.reports[s.reports.length - 1];
    const mine = last?.revenue ?? monthRevenue(s);
    const tabs = h('div', 'isl-row');
    for (const [k, label] of [['area', t('エリア', 'Area')], ['land', t('ランド', 'Land')], ['world', t('世界', 'World')]] as const)
      tabs.append(btn(label, () => openRanking(ctx, k), tab === k ? 'is-on' : ''));
    body.append(tabs);
    const list = h('ol', 'isl-rank');
    const row = (name: string, sales: number, me: boolean, n: number) => {
      const li = h('li', me ? 'is-me' : '');
      li.append(h('span', 'isl-rank-n', `${n}`), h('span', '', me ? t('あなたの会社', 'Your company') : name), h('b', '', money(sales)));
      list.append(li);
    };
    if (tab === 'area') {
      const rows = last ? last.area : areaRanking(s, mine, Object.fromEntries(s.rivals.map((r) => [r.id, r.base])));
      rows.forEach((r, k) => row(r.name, r.sales, r.me, k + 1));
      body.append(h('p', 'isl-dim', t('同じエリアで物販をしている同業他社です。ここで 1 位になるのがフェーズ 1 の目標です。', 'Retail rivals in your area. Reaching #1 here clears Phase 1.')));
    } else if (tab === 'land') {
      const rows = [...LAND_COMPANIES.map(([n, v]) => ({ name: n, sales: v, me: false })), { name: '', sales: mine, me: true }].sort((a, b) => b.sales - a.sales);
      rows.forEach((r, k) => row(r.name, r.sales, r.me, k + 1));
    } else {
      WORLD_COMPANIES.forEach(([n, v], k) => row(n, v, false, k + 1));
      const est = Math.max(9, Math.round(4000 / Math.max(1, Math.log10(Math.max(10, mine)))));
      const li = h('li', 'is-me');
      li.append(h('span', 'isl-rank-n', fmt(est * 37)), h('span', '', t('あなたの会社', 'Your company')), h('b', '', money(mine)));
      list.append(h('li', 'isl-dim', '…'), li);
    }
    body.append(list);
  });
}

// ---------------------------------------------------------------- スキル

/** スキルの枝が太くするサプライチェーンの段 */
const SKILL_STAGE: Partial<Record<string, string>> = { buy: t('① 調達', '① Buy'), craft: t('② 製造', '② Craft'), logi: t('③ 物流', '③ Haul'), shop: t('④ 販売', '④ Sell') };

export function openSkills(ctx: Ctx, focus?: string) {
  open(ctx, t('スキルツリー', 'Skill tree'), (body) => {
    const s = ctx.s();
    mineTip(ctx, 'skills', body);
    body.append(h('p', 'isl-dim', t('会社の資金で、お店・工房・物流・調達・人材を強くします。', 'Spend company funds to grow shops, workshop, logistics, buying and people.')));
    const cols = h('div', 'isl-skills');
    for (const br of BRANCHES) {
      const col = h('div', `isl-skill-col ${focus === br.key ? 'is-focus' : ''}`);
      const head = h('h3', '', br.name);
      const stage = SKILL_STAGE[br.key];
      if (stage) head.append(h('span', 'isl-tag is-good', stage));
      col.append(head);
      for (const k of SKILLS.filter((x) => x.branch === br.key)) {
        const done = has(s, k.id);
        const blocked = k.requires?.some((r) => !has(s, r));
        const card = h('div', `isl-skill ${done ? 'is-done' : blocked ? 'is-locked' : ''}`);
        card.append(h('b', '', k.name), h('small', '', k.note));
        if (blocked) card.append(h('small', 'isl-dim', t(`先に：${k.requires!.map((r) => SKILLS.find((x) => x.id === r)?.name).join('・')}`, `Needs: ${k.requires!.map((r) => SKILLS.find((x) => x.id === r)?.name).join(', ')}`)));
        const b = btn(done ? t('習得済み', 'Learned') : money(k.cost), () => {
          const e = learn(s, k.id);
          if (e === 'money') ctx.toast(t('資金が足りません', 'Not enough funds'));
          else if (!e) ctx.toast(t(`「${k.name}」を習得しました`, `Learned: ${k.name}`));
          after(ctx);
        }, done ? '' : 'is-on');
        b.disabled = done || !!blocked || s.money < k.cost;
        card.append(b);
        col.append(card);
      }
      cols.append(col);
    }
    body.append(cols);
  });
  if (focus) requestAnimationFrame(() => ctx.root.querySelector('.isl-skill-col.is-focus')?.scrollIntoView({ block: 'start' }));
}

// ---------------------------------------------------------------- 月の報告・他社の店

export function openReport(ctx: Ctx, r: Report, then?: () => void) {
  open(
    ctx,
    t(`${r.month} か月目の売上報告`, `Month ${r.month} sales report`),
    (body) => {
      const sum = h('div', 'isl-card2');
      sum.append(h('h3', '', t('売上', 'Sales')), h('p', 'isl-big', money(r.revenue)));
      const by = h('div', 'isl-stock');
      for (const [k, v] of Object.entries(r.bySeries)) {
        if (!v) continue;
        const c = h('span', 'isl-chip');
        c.append(skuIcon(sku(k, 'C'), 24), h('span', '', `${PRODUCT[k].name} ${money(v)}`));
        by.append(c);
      }
      sum.append(by);
      const cost = r.costs;
      sum.append(
        h('p', 'isl-dim', t(`費用：素材 ${fmt(cost.materials)}・建物とスキル ${fmt(cost.build)}・維持費 ${fmt(cost.upkeep)}・給料 ${fmt(cost.wages)}・アルバイト ${fmt(cost.part)}`, `Costs: materials ${fmt(cost.materials)}, building & skills ${fmt(cost.build)}, upkeep ${fmt(cost.upkeep)}, wages ${fmt(cost.wages)}, part-timers ${fmt(cost.part)}`)),
        h('p', '', t(`利益 ${money(r.profit)}`, `Profit ${money(r.profit)}`)),
      );
      body.append(sum);
      const rank = h('div', 'isl-card2');
      rank.append(h('h3', '', t(`エリアの順位：${r.rank} 位`, `Area rank: #${r.rank}`)));
      const list = h('ol', 'isl-rank');
      r.area.forEach((x, k) => {
        const li = h('li', x.me ? 'is-me' : '');
        li.append(h('span', 'isl-rank-n', `${k + 1}`), h('span', '', x.me ? t('あなたの会社', 'Your company') : x.name), h('b', '', money(x.sales)));
        list.append(li);
      });
      rank.append(list);
      body.append(rank);
      for (const n of r.news) {
        const [who, what] = n.split('|');
        body.append(h('p', 'isl-warn', t(`${who}が「${what}」の販売を始めました。`, `${who} started selling ${what}.`)));
      }
    },
    then,
  );
}

// ---------------------------------------------------------------- 給与・労務

export function openPayroll(ctx: Ctx) {
  open(ctx, t('給与・労務', 'Pay & welfare'), (body) => {
    const s = ctx.s();
    const total = s.staff.reduce((a, st) => a + st.wage, 0);
    const head = h('div', 'isl-card2');
    head.append(h('h3', '', t('月の給料の合計', 'Monthly payroll')), h('p', 'isl-big', money(total)), h('p', 'isl-dim', t('給料は月の締めに払います。最初からいる 3 人は創業メンバーなので、昇給するまでは 0 G です。', 'Wages are paid at each month’s close. The three founders earn 0 G until you give them a raise.')));
    body.append(head);
    for (const st of s.staff) {
      const card = h('div', 'isl-hero-card');
      const top = h('div', 'isl-row');
      const name = h('div');
      const lv = st.lv ?? 0;
      name.append(h('b', '', heroName(st.hero)), h('div', 'isl-dim', t(`月給 ${money(st.wage)}・昇給 ${lv}/${PAY.raiseMax}（作業の速さ +${Math.round(lv * PAY.raiseSpeed * 100)}%）`, `Wage ${money(st.wage)}, raises ${lv}/${PAY.raiseMax} (work +${Math.round(lv * PAY.raiseSpeed * 100)}%)`)));
      top.append(heroIcon(st.hero, 48), name);
      const sta = h('div', 'isl-field');
      sta.append(h('span', '', t('スタミナ', 'Stamina')), bar(st.stamina / st.stats.hp, st.stamina / st.stats.hp > 0.3 ? 'var(--isl-good)' : 'var(--isl-bad)'), h('span', 'isl-dim', st.resting ? t('休憩中', 'Resting') : `${Math.round(st.stamina)}/${st.stats.hp}`));
      const row = h('div', 'isl-row');
      const b1 = btn(t(`賞与 ${money(bonusCost(st))}（スタミナ満タン）`, `Bonus ${money(bonusCost(st))} (full stamina)`), () => {
        if (bonus(s, st.hero)) ctx.toast(t('資金が足りません', 'Not enough funds'));
        else ctx.toast(t(`${heroName(st.hero)}が元気になりました`, `${heroName(st.hero)} is refreshed`));
        after(ctx);
      });
      b1.disabled = s.money < bonusCost(st) || st.stamina >= st.stats.hp;
      const b2 = btn(lv >= PAY.raiseMax ? t('昇給（上限）', 'Raise (max)') : t(`昇給（月給 +${money(raiseStep(st.hero))}）`, `Raise (+${money(raiseStep(st.hero))}/mo)`), () => {
        raise(s, st.hero);
        ctx.toast(t(`${heroName(st.hero)}を昇給しました`, `Gave ${heroName(st.hero)} a raise`));
        after(ctx);
      });
      b2.disabled = lv >= PAY.raiseMax;
      const b3 = btn(st.resting ? t('休憩をやめる', 'Stop resting') : t('休ませる', 'Rest'), () => {
        setRest(s, st.hero, !st.resting);
        after(ctx);
      });
      row.append(b1, b2, b3);
      card.append(top, sta, row);
      body.append(card);
    }
    body.append(h('p', 'isl-dim', has(s, 'lounge') ? t('休憩室があるので、スタミナの戻りが 1.5 倍です。', 'The lounge makes stamina recover 1.5× faster.') : t('スキル「休憩室」（人材）で、スタミナの戻りが速くなります。', 'The Lounge skill (People) speeds up stamina recovery.')));
  });
}

// ---------------------------------------------------------------- SCM

export function openBom(ctx: Ctx) {
  open(ctx, t('BOM（素材 → 商品）', 'BOM (materials → products)'), (body) => {
    const s = ctx.s();
    body.append(h('p', 'isl-dim', t('1 回のクラフトに使う素材と、できる数・日数・1 個あたりの素材代と粗利です（素材はいまの値段）。', 'Materials per craft, output, days, and material cost and gross margin per item (at current prices).')));
    const table = h('div', 'isl-data isl-bom');
    const head = h('div', 'isl-data-row is-head');
    for (const x of [t('商品', 'Item'), t('素材', 'Materials'), t('できる数・日数', 'Output · days'), t('値段', 'Price'), t('素材代 / 個', 'Cost / item'), t('粗利 / 個', 'Margin / item')]) head.append(h('span', '', x));
    table.append(head);
    for (const p of PRODUCTS)
      for (const r of ['C', 'U'] as Rar[]) {
        const x = sku(p.key, r);
        const row = h('div', `isl-data-row ${r === 'U' && !s.dev.includes(p.key) ? 'is-locked' : ''}`);
        const n = h('span', 'isl-row');
        n.append(skuIcon(x, 28), h('b', '', skuName(x)));
        const mats = h('span', 'isl-row');
        for (const [m, q] of Object.entries(p.recipe[r])) {
          const c = h('span', 'isl-chip');
          c.append(matIcon(m as Mat, 18), h('small', '', `×${q}`));
          mats.append(c);
        }
        const uc = unitCost(s, x);
        row.append(n, mats, h('span', '', t(`${batchOf(x)} 個・${craftDays(s, x).toFixed(1)} 日`, `${batchOf(x)} · ${craftDays(s, x).toFixed(1)} d`)), h('span', '', money(skuPrice(x))), h('span', '', money(uc)), h('span', '', `${money(skuPrice(x) - uc)} (${Math.round(((skuPrice(x) - uc) / skuPrice(x)) * 100)}%)`));
        table.append(row);
      }
    body.append(table);
  });
}

// ---------------------------------------------------------------- 営業企画

export function openDev(ctx: Ctx) {
  open(ctx, t('商品開発', 'Product development'), (body) => {
    const s = ctx.s();
    body.append(h('p', 'isl-dim', t(`アンコモンを開発すると、値段 ${UNCOMMON.price} 倍・売り場の強さ ${UNCOMMON.pull} 倍の商品を作れます。開発には「魔法の釜」（スキル・工房）が要り、1 つずつ ${DEV.days} 日かかります。作るには製造の適性 ${UNCOMMON.minCraft} 以上の職人が要ります。`, `Developing an Uncommon gives ${UNCOMMON.price}× price and ${UNCOMMON.pull}× pull. Needs the Magic Pot skill; one at a time, ${DEV.days} days each. Crafting needs aptitude ${UNCOMMON.minCraft}+.`)));
    if (!has(s, 'pot')) body.append(h('p', 'isl-warn', t('スキルツリーの「魔法の釜」で解放されます。', 'Unlocked by the Magic Pot skill.')));
    for (const p of PRODUCTS) {
      const card = h('div', 'isl-card2 isl-dev');
      const row = h('div', 'isl-row');
      row.append(skuIcon(sku(p.key, 'C'), 40), h('span', 'isl-dim', '→'), skuIcon(sku(p.key, 'U'), 40));
      const name = h('div');
      name.append(h('b', '', `${skuName(sku(p.key, 'C'))} → ${skuName(sku(p.key, 'U'))}`), h('div', 'isl-dim', t(`${money(p.price)} → ${money(skuPrice(sku(p.key, 'U')))}`, `${money(p.price)} → ${money(skuPrice(sku(p.key, 'U')))}`)));
      row.append(name);
      card.append(row);
      if (s.dev.includes(p.key)) card.append(h('p', 'isl-good', t('開発済み（工房で作れます）', 'Developed (craft it in the workshop)')));
      else if (s.lab?.key === p.key) card.append(h('div', 'isl-field'), bar(1 - s.lab.left / DEV.days, 'var(--isl-gold)'), h('p', 'isl-dim', t(`開発中：あと ${s.lab.left} 日`, `In development: ${s.lab.left} days left`)));
      else {
        const b = btn(t(`開発する ${money(devCost(p.key))}（${DEV.days} 日）`, `Develop ${money(devCost(p.key))} (${DEV.days} d)`), () => {
          const e = develop(s, p.key);
          if (e === 'money') ctx.toast(t('資金が足りません', 'Not enough funds'));
          else if (!e) ctx.toast(t(`${skuName(sku(p.key, 'U'))}の開発を始めました`, `Started developing ${skuName(sku(p.key, 'U'))}`));
          after(ctx);
        }, 'is-on');
        b.disabled = !has(s, 'pot') || !!s.lab || s.money < devCost(p.key);
        card.append(b);
      }
      body.append(card);
    }
  });
}

export function openMA(ctx: Ctx) {
  open(ctx, t('M&A', 'M&A'), (body) => {
    body.append(h('p', 'isl-dim', t('他社との買収や提携は、スキルツリーで解放する予定です（準備中）。他社のお店をタップして「調査」しておくと、交渉に使えるデータが集まります。', 'Acquisitions and alliances will be unlocked in the skill tree (coming soon). Research rival stores (tap them on the map) to gather data for negotiations.')));
    for (const [name, note] of [
      [t('買収提案', 'Acquisition offer'), t('他社のお店を買い取り、自社のお店にする', 'Buy a rival store and make it yours')],
      [t('業務提携', 'Alliance'), t('他社と組んで、素材や商品を融通しあう', 'Team up with a rival to share materials and goods')],
      [t('妨害工作', 'Sabotage'), t('他社の売り場を一時的に弱くする', 'Weaken a rival store for a while')],
    ]) {
      const card = h('div', 'isl-skill is-locked');
      card.append(h('b', '', name), h('small', '', note), h('small', 'isl-dim', t('スキルツリーで解放（準備中）', 'Skill tree (coming soon)')));
      body.append(card);
    }
  });
}

// ---------------------------------------------------------------- マーケティング

export function openAds(ctx: Ctx) {
  open(ctx, t('宣伝広報', 'Advertising'), (body) => {
    const s = ctx.s();
    const now = adBoost(s);
    body.append(h('p', 'isl-dim', now > 0 ? t(`いま自社のお店の売り場の強さが +${Math.round(now * 100)}% です。`, `Your shops have +${Math.round(now * 100)}% pull right now.`) : t('宣伝すると、しばらくの間、自社のすべてのお店が売れやすくなります。種類の違う宣伝は重ねられます。', 'Ads make all your shops sell better for a while. Different ads stack.')));
    for (const a of ADS) {
      const card = h('div', 'isl-card2');
      const left = s.ads[a.id] ?? 0;
      card.append(h('h3', '', a.name), h('p', 'isl-dim', a.note));
      if (left > 0) card.append(bar(left / a.days, 'var(--isl-gold)'), h('p', '', t(`実施中：あと ${left} 日`, `Running: ${left} days left`)));
      else {
        const b = btn(t(`実施する ${money(a.cost)}`, `Run ${money(a.cost)}`), () => {
          const e = runAd(s, a.id);
          if (e === 'money') ctx.toast(t('資金が足りません', 'Not enough funds'));
          else if (!e) ctx.toast(t(`「${a.name}」を始めました`, `Started: ${a.name}`));
          after(ctx);
        }, 'is-on');
        b.disabled = s.money < a.cost;
        card.append(b);
      }
      body.append(card);
    }
  });
}

export function openMissions(ctx: Ctx) {
  open(ctx, t('依頼（ミッション）', 'Requests (missions)'), (body) => {
    const s = ctx.s();
    body.append(h('p', 'isl-dim', t('エリアの人たちからの依頼です。達成すると報酬がもらえます。1 つ受け取ると次の依頼が届きます。', 'Requests from people in the area. Complete them for a reward; claiming one brings the next.')));
    const list = missionList(s);
    if (!list.length) body.append(h('p', '', t('いまある依頼はすべて片づけました！', 'All requests are done for now!')));
    for (const m of list) {
      const done = s.missions[m.id] === 'done';
      const card = h('div', `isl-card2 isl-mission ${done ? 'is-done' : ''}`);
      card.append(h('small', 'isl-dim', m.from), h('h3', '', m.title), h('p', '', m.text));
      const row = h('div', 'isl-row');
      row.append(h('b', 'isl-gold', t(`報酬 ${money(m.reward)}`, `Reward ${money(m.reward)}`)));
      const b = btn(done ? t('報酬を受け取る', 'Claim') : t('達成していません', 'Not yet'), () => {
        if (!claim(s, m.id)) ctx.toast(t(`報酬 ${money(m.reward)} を受け取りました`, `Received ${money(m.reward)}`));
        after(ctx);
      }, done ? 'is-on' : '');
      b.disabled = !done;
      row.append(b);
      card.append(row);
      body.append(card);
    }
    const n = MISSIONS.filter((m) => s.missions[m.id] === 'claimed').length;
    body.append(h('p', 'isl-dim', t(`受け取った依頼 ${n} / ${MISSIONS.length}`, `Claimed ${n} / ${MISSIONS.length}`)));
  });
}

// ---------------------------------------------------------------- システム（設備投資）

/** 建物 1 つの設備投資の一覧（タイルの吹き出しとシステム画面で使う） */
export function investList(ctx: Ctx, b: PBuilding, onDone: () => void): HTMLElement {
  const s = ctx.s();
  const box = h('div', 'isl-invest');
  const kind = P1B[b.id]?.kind;
  for (const x of INVESTS.filter((v) => v.kind === kind)) {
    const lv = invLv(b, x.id);
    const cost = investCost(b, x.id);
    const row = h('div', 'isl-invest-row');
    const name = h('div');
    name.append(h('b', '', `${x.name}${x.cost.length > 1 ? `  ${lv}/${x.cost.length}` : lv ? ' ✓' : ''}`), h('small', 'isl-dim', x.note));
    const go = btn(cost == null ? t('最大', 'Max') : money(cost), () => {
      const e = invest(s, b.uid, x.id);
      if (e === 'money') ctx.toast(t('資金が足りません', 'Not enough funds'));
      else if (!e) ctx.toast(t(`「${x.name}」を導入しました`, `Installed: ${x.name}`));
      ctx.save();
      ctx.refresh();
      onDone();
    }, cost == null ? '' : 'is-on');
    go.disabled = cost == null || s.money < cost || b.left > 0;
    row.append(name, go);
    box.append(row);
  }
  return box;
}

export function openInvest(ctx: Ctx) {
  open(ctx, t('設備投資', 'Capital investment'), (body) => {
    const s = ctx.s();
    body.append(h('p', 'isl-dim', t('建物ごとに設備を良くします。地図で自社の建物をタップしても投資できます。', 'Upgrade each of your buildings. You can also invest by tapping a building on the map.')));
    const mine = s.buildings.filter((b) => b.owner === 'me' && P1B[b.id]?.kind !== 'food');
    if (!mine.length) body.append(h('p', '', t('まだ建物がありません。', 'No buildings yet.')));
    for (const b of mine) {
      const card = h('div', 'isl-card2');
      card.append(h('h3', '', DEF[b.id].name + (b.left > 0 ? t(`（工事中 あと ${b.left} 日）`, ` (building, ${b.left} d)`) : '')), investList(ctx, b, () => current?.render()));
      body.append(card);
    }
  });
}

export const P1B_NAME = (id: string) => (P1B[id] ? DEF[id].name : id);
void isEn;
