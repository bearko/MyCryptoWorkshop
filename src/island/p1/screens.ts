/**
 * フェーズ 1 の札：工房（クラフト）・お店・調達・従業員・市場データ・ランキング・スキル・月の報告。
 * どれも下から出る大きな札（sheet）。中身は state から毎回作り直す。
 */
import { t, isEn } from '../../i18n';
import { assetUrl, drawRef } from '../../render/images';
import { getExtension, heroById } from '../../game/catalog';
import raw from '../../generated/catalog.json';
import { DEF } from '../defs';
import {
  ADS,
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
  speedOf,
  type Mat,
  type Rar,
  type Sku,
  type Task,
} from './data';
import {
  adBoost,
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
  myWorkshop,
  openMissions as missionList,
  raise,
  raiseStep,
  runAd,
  storageCap,
  unitCost,
  type PBuilding,
  batchOf,
  buy,
  craftCheck,
  craftDays,
  has,
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
  staffOf,
  startCraft,
  wageOf,
  heroStats,
  type P1State,
  type Report,
} from './model';
import { bar, btn, fmt, h, heroIcon, heroName, matIcon, money, select, sheet, skuIcon, skuName } from './ui';

export interface Ctx {
  s: () => P1State;
  root: HTMLElement;
  save: () => void;
  /** 地図と上の帯を描き直す */
  refresh: () => void;
  toast: (text: string) => void;
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

function open(ctx: Ctx, title: string, render: (body: HTMLElement) => void, onClose?: () => void) {
  closeSheet();
  const sh = sheet(ctx.root, title, () => {
    current = null;
    onClose?.();
    ctx.refresh();
  });
  const draw = () => {
    const y = sh.body.scrollTop;
    sh.body.replaceChildren();
    render(sh.body);
    sh.body.scrollTop = y;
  };
  current = { render: draw, close: sh.close };
  draw();
}

const after = (ctx: Ctx) => {
  ctx.save();
  ctx.refresh();
  current?.render();
};

const CRAFT_ERR: Record<string, string> = {
  pot: t('アンコモンには「魔法の釜」が要ります（スキル）', 'Uncommons need the Magic Pot (skill)'),
  dev: t('このアンコモンはまだ開発していません（営業企画 → 商品開発）', 'Develop this Uncommon first (Planning → Product development)'),
  skill: t(`アンコモンには製造の適性 ${UNCOMMON.minCraft} 以上の職人が要ります`, `Uncommons need a crafter with aptitude ${UNCOMMON.minCraft}+`),
  mats: t('素材が足りません（「調達」で買えます）', 'Not enough materials (buy them under Buy)'),
  worker: t('職人を割り当ててください', 'Assign a crafter first'),
  busy: t('作業中です', 'Already working'),
};

/** 作れる商品（Common と、開発したアンコモン） */
function craftable(s: P1State): Sku[] {
  const out: Sku[] = PRODUCTS.map((p) => sku(p.key, 'C'));
  out.push(...PRODUCTS.filter((p) => s.dev.includes(p.key)).map((p) => sku(p.key, 'U')));
  return out;
}

function recipeRow(s: P1State, x: Sku): HTMLElement {
  const [k, r] = skuParts(x);
  const row = h('div', 'isl-recipe');
  for (const [m, q] of Object.entries(PRODUCT[k].recipe[r as Rar])) {
    const have = s.mats[m as Mat] ?? 0;
    const chip = h('span', `isl-chip ${have < (q ?? 0) ? 'is-bad' : ''}`);
    chip.append(matIcon(m as Mat, 20), h('span', '', `×${q} (${have})`));
    row.append(chip);
  }
  row.append(h('span', 'isl-dim', t(`→ ${batchOf(x)} 個`, `→ ${batchOf(x)} pcs`)));
  return row;
}

function staffLabel(s: P1State, hero: number, task: Task): string {
  const st = staffOf(s, hero);
  const apt = st ? Math.round(aptitude(st.stats, task)) : 0;
  const tname = TASKS.find((x) => x.key === task)?.name ?? '';
  return `${heroName(hero)}（${tname} ${apt}）`; // i18n-ja
}

// ---------------------------------------------------------------- 工房

export function openWorkshop(ctx: Ctx) {
  open(ctx, t('工房', 'Workshop'), (body) => {
    const s = ctx.s();
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

    s.slots.forEach((sl, k) => {
      const card = h('div', 'isl-card2');
      card.append(h('h3', '', t(`作業台 ${k + 1}`, `Workbench ${k + 1}`)));
      const workers = s.staff.map((st) => ({ value: st.hero, label: staffLabel(s, st.hero, 'craft') }));
      const row1 = h('div', 'isl-field');
      row1.append(
        h('span', '', t('職人', 'Crafter')),
        select(workers, sl.worker, (v) => {
          assign(s, v, 'craft', k);
          after(ctx);
        }, t('（だれもいない）', '(nobody)')),
      );
      const row2 = h('div', 'isl-field');
      const items = craftable(s).map((x) => ({ value: x, label: `${skuName(x)} (${money(skuPrice(x))})` }));
      let pickSku: Sku = sl.sku ?? sku(recommend(s), 'C');
      row2.append(
        h('span', '', t('作るもの', 'Make')),
        select(items, pickSku, (v) => {
          pickSku = v;
          sl.sku = v;
          sl.running = false;
          sl.progress = 0;
          after(ctx);
        }),
      );
      card.append(row1, row2, recipeRow(s, pickSku));
      const st = sl.worker != null ? staffOf(s, sl.worker) : null;
      if (sl.running && sl.sku) {
        const need = craftDays(s, sl.sku);
        const p = h('div', 'isl-field');
        p.append(h('span', '', t('進み', 'Progress')), bar(sl.progress / need), h('span', 'isl-dim', st?.resting ? t('休憩中', 'Resting') : t(`あと約 ${Math.max(0, Math.ceil((need - sl.progress) / (st ? speedOf(aptitude(st.stats, 'craft')) : 1)))} 日`, `~${Math.max(0, Math.ceil((need - sl.progress) / (st ? speedOf(aptitude(st.stats, 'craft')) : 1)))} days left`)));
        card.append(p);
      }
      const err = sl.worker == null ? 'worker' : craftCheck(s, pickSku, sl.worker);
      if (err && !sl.running) card.append(h('p', 'isl-warn', CRAFT_ERR[err] ?? err));
      const row3 = h('div', 'isl-row');
      const rep = h('label', 'isl-check');
      const cb = h('input');
      cb.type = 'checkbox';
      cb.checked = sl.repeat;
      cb.addEventListener('change', () => {
        sl.repeat = cb.checked;
        after(ctx);
      });
      rep.append(cb, h('span', '', t('できたら続けて作る', 'Keep making')));
      const go = btn(sl.running ? t('作業中', 'Working') : t('クラフト開始', 'Start crafting'), () => {
        const e = startCraft(s, k, pickSku, sl.repeat);
        if (e) ctx.toast(CRAFT_ERR[e] ?? e);
        else ctx.toast(t(`${skuName(pickSku)}を作り始めました`, `Started making ${skuName(pickSku)}`));
        after(ctx);
      }, 'is-on');
      go.disabled = sl.running || !!err;
      row3.append(go, rep);
      card.append(row3);
      body.append(card);
    });

    const stock = h('div', 'isl-card2');
    stock.append(h('h3', '', t('工房の倉庫（できた商品）', 'Workshop storage (finished goods)')));
    const list = h('div', 'isl-stock');
    const entries = Object.entries(s.stock).filter(([, n]) => (n ?? 0) > 0) as [Sku, number][];
    if (!entries.length) list.append(h('span', 'isl-dim', t('まだありません', 'Nothing yet')));
    for (const [x, n] of entries) {
      const c = h('span', 'isl-chip');
      c.append(skuIcon(x, 28), h('span', '', `${skuName(x)} ×${n}`));
      list.append(c);
    }
    stock.append(list, h('p', 'isl-dim', t('できた商品は、運搬係がお店へ運びます（従業員で「運搬」を割り当て）。', 'A hauler carries finished goods to your shops (assign Haul under Staff).')));
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
    // お客さん：店員がいれば行き来する
    if (staff || sh.part > 0) {
      for (let k = 0; k < 3; k++) {
        const tt = ((now / 1000 + k * 2.3) % 7) / 7;
        const x = 330 - tt * 360;
        const g = heroById.get(guests[(k + Math.floor(now / 7000)) % guests.length]);
        if (g) {
          ctx.save();
          ctx.translate(x + 20, 124);
          ctx.scale(-1, 1);
          drawRef(ctx, g.image, -20, 0, 40, 40);
          ctx.restore();
        }
      }
    }
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

    const shelves = h('div', 'isl-card2');
    shelves.append(h('h3', '', t('棚（0 番が主力商品）', 'Shelves (the first is your main product)')));
    const known = craftable(s);
    sh.shelves.forEach((x, k) => {
      const row = h('div', 'isl-field');
      row.append(
        h('span', '', k === 0 ? t('主力商品', 'Main product') : t(`棚 ${k + 1}`, `Shelf ${k + 1}`)),
        select(known.map((v) => ({ value: v, label: skuName(v) })), x, (v) => {
          setShelf(s, uid, k, v);
          after(ctx);
        }, t('（並べない）', '(empty)')),
      );
      if (x) row.append(h('span', 'isl-dim', t(`棚 ${sh.shelf[x] ?? 0}・裏 ${sh.storage[x] ?? 0}`, `shelf ${sh.shelf[x] ?? 0}, back ${sh.storage[x] ?? 0}`)));
      shelves.append(row);
    });
    if (!has(s, 'shelf1')) shelves.append(h('p', 'isl-dim', t('棚はスキル「棚を増やす」で増やせます。', 'Add shelves with the “More shelves” skill.')));
    body.append(shelves);

    const crew = h('div', 'isl-card2');
    crew.append(h('h3', '', t('売り場の人', 'Floor staff')));
    const r1 = h('div', 'isl-field');
    r1.append(
      h('span', '', t('店員', 'Clerk')),
      select(s.staff.map((st) => ({ value: st.hero, label: staffLabel(s, st.hero, 'shop') })), sh.staff, (v) => {
        assign(s, v, 'shop', uid);
        after(ctx);
      }, t('（だれもいない）', '(nobody)')),
    );
    const r2 = h('div', 'isl-field');
    const minus = btn('−', () => {
      setPart(s, uid, sh.part - 1);
      after(ctx);
    });
    const plus = btn('+', () => {
      setPart(s, uid, sh.part + 1);
      after(ctx);
    });
    plus.disabled = sh.part >= partMax(s);
    r2.append(h('span', '', t('アルバイト', 'Part-timers')), minus, h('b', '', `${sh.part} / ${partMax(s)}`), plus, h('span', 'isl-dim', t(`1 人 1 日 ${SHOP.partTimeWage} G`, `${SHOP.partTimeWage} G/day each`)));
    crew.append(r1, r2, h('p', 'isl-dim', t('店員かアルバイトがいれば、届いた商品を棚に並べて自動で売ります。販売は INT が高いヒーローが得意です。', 'With a clerk or part-timer, deliveries are shelved and sold automatically. High-INT heroes sell best.')));
    body.append(crew);
  });
}

// ---------------------------------------------------------------- 調達

export function openBuy(ctx: Ctx) {
  open(ctx, t('調達', 'Buy materials'), (body) => {
    const s = ctx.s();
    body.append(h('p', 'isl-dim', t('クラフトに使う素材を買います。ルートの無い素材は、従業員の「開拓」かスキルで買えるようになります。', 'Buy materials for crafting. Materials without a route open up by scouting (Staff) or skills.')));
    for (const m of MAT_KEYS) {
      const card = h('div', 'isl-card2 isl-matrow');
      const open = s.routes.includes(m);
      const left = h('div', 'isl-row');
      left.append(matIcon(m, 32), h('b', '', MATS[m].name), h('span', 'isl-dim', t(`在庫 ${s.mats[m] ?? 0}`, `have ${s.mats[m] ?? 0}`)));
      card.append(left);
      if (open) {
        const row = h('div', 'isl-row');
        row.append(h('span', '', t(`1 個 ${matPrice(s, m)} G`, `${matPrice(s, m)} G each`)));
        for (const q of [10, 50]) {
          const b = btn(`+${q} (${money(matPrice(s, m) * q)})`, () => {
            const e = buy(s, m, q);
            if (e) ctx.toast(t('資金が足りません', 'Not enough funds'));
            after(ctx);
          });
          b.disabled = s.money < matPrice(s, m) * q;
          row.append(b);
        }
        card.append(row);
      } else {
        const scout = s.staff.find((x) => x.task === 'explore' && x.target === m);
        if (scout) {
          card.append(h('p', '', t(`${heroName(scout.hero)}が開拓中`, `${heroName(scout.hero)} is scouting`)), bar(scout.explore / MATS[m].exploreDays));
        } else {
          const row = h('div', 'isl-row');
          row.append(h('span', 'isl-dim', t(`ルートが無い（開拓 ${MATS[m].exploreDays} 日〜）`, `No route (scouting from ${MATS[m].exploreDays} days)`)));
          row.append(
            select(s.staff.map((st) => ({ value: st.hero, label: staffLabel(s, st.hero, 'explore') })), null, (v) => {
              assign(s, v, 'explore', m);
              ctx.toast(t(`${heroName(v)}が${MATS[m].name}のルートを開拓しに出かけました`, `${heroName(v)} went scouting for a ${MATS[m].name} route`));
              after(ctx);
            }, t('開拓に行かせる…', 'Send a scout…')),
          );
          card.append(row);
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
  else if (task === 'explore') assign(s, hero, 'explore', target as Mat);
  else if (task === 'intel') assign(s, hero, 'intel', target);
  else assign(s, hero, task as Task, Number(target));
}

function jobValue(st: { task: Task | null; target: number | string | null }): string {
  if (!st.task) return 'none';
  if (st.task === 'transport') return 'transport';
  return `${st.task}:${st.target}`;
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

export function openStaff(ctx: Ctx) {
  open(ctx, t('従業員', 'Staff'), (body) => {
    const s = ctx.s();
    body.append(h('p', 'isl-dim', t('作業ごとに向き・不向きがあります（数字が適性）。HP はスタミナで、働くと減り、少なくなると自動で休みます。', 'Each task suits different heroes (numbers are aptitude). HP is stamina: it drops while working, and heroes rest when it runs low.')));
    for (const st of s.staff) {
      const card = heroCard(s, st.hero, st.stats);
      const row = h('div', 'isl-field');
      row.append(h('span', '', t('スタミナ', 'Stamina')), bar(st.stamina / st.stats.hp, st.stamina / st.stats.hp > 0.3 ? 'var(--isl-good)' : 'var(--isl-bad)'), h('span', 'isl-dim', st.resting ? t('休憩中', 'Resting') : `${Math.round(st.stamina)}/${st.stats.hp}`));
      const job = h('div', 'isl-field');
      job.append(
        h('span', '', t('仕事', 'Job')),
        select(jobOptions(s), jobValue(st), (v) => {
          applyJob(s, st.hero, v);
          after(ctx);
        }),
      );
      const r = h('div', 'isl-row');
      r.append(
        btn(st.resting ? t('休憩をやめる', 'Stop resting') : t('休ませる', 'Rest'), () => {
          setRest(s, st.hero, !st.resting);
          after(ctx);
        }),
      );
      if (st.wage) r.append(h('span', 'isl-dim', t(`月給 ${money(st.wage)}`, `Wage ${money(st.wage)}/mo`)));
      card.append(row, job, r);
      body.append(card);
    }
  });
}

// ---------------------------------------------------------------- 人材登用

export function openHire(ctx: Ctx) {
  open(ctx, t('人材登用', 'Recruiting'), (body) => {
    const s = ctx.s();
    if (!has(s, 'hire')) {
      body.append(h('p', 'isl-warn', t('スキル「人材の募集」（人材）を習得すると、ヒーローを雇えるようになります。', 'Learn the Recruiting skill (People) to hire heroes.')));
      return;
    }
    {
      body.append(h('p', 'isl-dim', t('雇えるヒーローは毎月入れ替わります。数字は仕事ごとの適性です。', 'The candidates change every month. Numbers are aptitude per task.')));
      for (const id of s.hirePool) {
        const stats = heroStats(id);
        const card = heroCard(s, id, stats);
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

export function openSkills(ctx: Ctx) {
  open(ctx, t('スキルツリー', 'Skill tree'), (body) => {
    const s = ctx.s();
    body.append(h('p', 'isl-dim', t('会社の資金で、お店・工房・物流・調達・人材を強くします。', 'Spend company funds to grow shops, workshop, logistics, buying and people.')));
    const cols = h('div', 'isl-skills');
    for (const br of BRANCHES) {
      const col = h('div', 'isl-skill-col');
      col.append(h('h3', '', br.name));
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

/** 流れの詰まり（いちばん大事なもの 1 つずつ） */
function bottlenecks(s: P1State): string[] {
  const out: string[] = [];
  const shops = myShops(s);
  const ws = myWorkshop(s);
  if (!ws || !shops.length) return out;
  const short = s.slots.find((sl) => sl.sku && sl.worker != null && craftCheck(s, sl.sku, sl.worker) === 'mats' && !sl.running);
  if (short) out.push(t('素材が足りず、作業台が止まっています（調達）。', 'A workbench is idle for lack of materials (Buy).'));
  if (s.slots.some((sl) => sl.worker == null)) out.push(t('職人のいない作業台があります（従業員）。', 'A workbench has no crafter (Staff).'));
  const stock = Object.values(s.stock).reduce<number>((a, n) => a + (n ?? 0), 0);
  const haulers = s.staff.filter((x) => x.task === 'transport' && !x.resting).length;
  if (stock > 0 && !haulers) out.push(t('運搬係がいない（休憩中）ので、工房に商品がたまっています。', 'No active hauler: goods are piling up in the workshop.'));
  else if (stock > 150) out.push(t('工房に商品がたまっています。荷車・トラック・運搬係を増やしましょう。', 'Goods are piling up in the workshop. Add carts, trucks or haulers.'));
  for (const b of shops) {
    const sh = s.shops[b.uid];
    const st = sh.staff != null ? staffOf(s, sh.staff) : null;
    const back = Object.values(sh.storage).reduce<number>((a, n) => a + (n ?? 0), 0);
    if ((!st || st.resting) && sh.part === 0) out.push(t(`${DEF[b.id].name}：売り場に人がいません。`, `${DEF[b.id].name}: nobody on the floor.`));
    else if (sh.shelves.some((x) => x && (sh.shelf[x] ?? 0) === 0) && back === 0) out.push(t(`${DEF[b.id].name}：棚も裏も空です。もっと作って運びましょう。`, `${DEF[b.id].name}: shelves and backroom are empty. Make and haul more.`));
    if (!sh.shelves.some((x) => x)) out.push(t(`${DEF[b.id].name}：並べる商品が決まっていません。`, `${DEF[b.id].name}: no product chosen.`));
  }
  return out;
}

export function openSupply(ctx: Ctx) {
  open(ctx, t('サプライチェーン', 'Supply chain'), (body) => {
    const s = ctx.s();
    const issues = bottlenecks(s);
    const note = h('div', `isl-card2 ${issues.length ? 'is-warn' : ''}`);
    note.append(h('h3', '', issues.length ? t('流れが詰まっているところ', 'Bottlenecks') : t('流れは順調です', 'Everything flows')));
    for (const x of issues) note.append(h('p', 'isl-warn', x));
    body.append(note);
    const flow = h('div', 'isl-flow');
    const step = (title: string, lines: (string | HTMLElement)[]) => {
      const c = h('div', 'isl-flow-step');
      c.append(h('b', '', title));
      for (const l of lines) c.append(typeof l === 'string' ? h('span', '', l) : l);
      flow.append(c);
    };
    const mats = h('div', 'isl-stock');
    for (const m of MAT_KEYS) {
      if (!s.routes.includes(m) && !(s.mats[m] ?? 0)) continue;
      const c = h('span', `isl-chip ${(s.mats[m] ?? 0) < 10 ? 'is-bad' : ''}`);
      c.append(matIcon(m, 18), h('small', '', `${s.mats[m] ?? 0}`));
      mats.append(c);
    }
    step(t('① 調達（素材）', '① Buy (materials)'), [mats]);
    step(
      t('② クラフト（工房）', '② Craft (workshop)'),
      s.slots.map((sl, k) => {
        const st = sl.worker != null ? staffOf(s, sl.worker) : null;
        const state = !st ? t('職人なし', 'no crafter') : st.resting ? t('休憩中', 'resting') : sl.running && sl.sku ? `${skuName(sl.sku)} ${Math.round((sl.progress / craftDays(s, sl.sku)) * 100)}%` : t('止まっている', 'idle');
        return t(`作業台 ${k + 1}：${state}`, `Bench ${k + 1}: ${state}`);
      }),
    );
    const stock = Object.entries(s.stock).filter(([, n]) => (n ?? 0) > 0) as [Sku, number][];
    step(t('③ 工房の倉庫', '③ Workshop storage'), stock.length ? stock.map(([x, n]) => `${skuName(x)} ×${n}`) : [t('空', 'empty')]);
    const haulers = s.staff.filter((x) => x.task === 'transport');
    step(t('④ 運搬', '④ Haul'), [t(`運搬係 ${haulers.length} 人・運んでいる便 ${s.trips.length}`, `${haulers.length} haulers, ${s.trips.length} trips on the road`), t(`1 便 ${Math.round(20 * (has(s, 'truck') ? 2.5 : 1))} 個まで`, `Up to ${Math.round(20 * (has(s, 'truck') ? 2.5 : 1))} per trip`)]);
    step(
      t('⑤ 陳列（お店）', '⑤ Shelve (shops)'),
      myShops(s).map((b) => {
        const sh = s.shops[b.uid];
        const back = Object.values(sh.storage).reduce<number>((a, n) => a + (n ?? 0), 0);
        const on = Object.values(sh.shelf).reduce<number>((a, n) => a + (n ?? 0), 0);
        return t(`${DEF[b.id].name}：棚 ${on}・裏 ${back}/${storageCap(b)}`, `${DEF[b.id].name}: shelf ${on}, back ${back}/${storageCap(b)}`);
      }),
    );
    step(t('⑥ 販売', '⑥ Sell'), [t(`今月の売上 ${money(monthRevenue(s))}`, `This month ${money(monthRevenue(s))}`), ...Object.entries(s.monthUnits).map(([k, n]) => t(`${PRODUCT[k].name} ${n} 個`, `${PRODUCT[k].name} ${n}`))]);
    body.append(flow);
  });
}

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
