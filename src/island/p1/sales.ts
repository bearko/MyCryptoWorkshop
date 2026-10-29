/**
 * SCM「販売管理」：自社のお店を一覧（カード 1 行ずつ）で見比べ、その場で店員・棚・アルバイトを変える。
 * 上に一括の操作（全店の主力商品・空き棚を埋める・店員のいないお店に待機中のヒーロー）。
 * 一覧のデータ（salesRows）と一括の操作は純粋な関数にして、vitest で確かめる。
 * docs/ISLAND_PHASE1.md「販売管理」。
 */
import { t } from '../../i18n';
import { DEF } from '../defs';
import { aptitude, SHOP, type Sku } from './data';
import { pickExt, rankEl } from './heroui';
import { assign, myShops, partMax, setPart, setShelf, shopArea, shopEstimates, staffOf, type P1State, type PBuilding, type Staff } from './model';
import { openSupply } from './scm';
import { after, craftable, mineTip, open, openShop, pickClerk, pickShelf, shelfMoved, type Ctx } from './screens';
import { bar, btn, h, heroIcon, heroName, money, skuIcon, skuName } from './ui';

/** 詰まりの札：商品未定・品切れ・休業中（売り場に人がいない）・店員なし（アルバイトだけ） */
export type SalesTag = 'unset' | 'out' | 'closed' | 'noclerk';
export const SALES_TAG: Record<SalesTag, string> = {
  unset: t('商品未定', 'No product'),
  out: t('品切れ', 'Sold out'),
  closed: t('休業中', 'Closed'),
  noclerk: t('店員なし', 'No clerk'),
};

export interface SalesRow {
  b: PBuilding;
  uid: number;
  /** お店の名前（建物名） */
  name: string;
  /** 商圏の家の数 */
  homes: number;
  staff: Staff | null;
  /** 店員の販売の適性 */
  apt: number;
  part: number;
  partMax: number;
  shelves: (Sku | null)[];
  /** 今月の売上 */
  rev: number;
  /** 売れる見込み／月（個） */
  est: number;
  /** 認知度（0〜1） */
  aw: number;
  tags: SalesTag[];
}
export type SalesSort = 'rev' | 'est' | 'aw';
export const SALES_SORT: Record<SalesSort, string> = { rev: t('売上順', 'By sales'), est: t('見込み順', 'By forecast'), aw: t('認知順', 'By awareness') };

/** お店ごとの詰まりの札 */
export function salesTags(s: P1State, uid: number): SalesTag[] {
  const sh = s.shops[uid];
  if (!sh) return [];
  const tags: SalesTag[] = [];
  const set = sh.shelves.filter((x): x is Sku => !!x);
  if (!set.length) tags.push('unset');
  else if (set.some((x) => (sh.shelf[x] ?? 0) <= 0 && (sh.storage[x] ?? 0) <= 0)) tags.push('out');
  if (sh.staff == null && sh.part === 0) tags.push('closed');
  else if (sh.staff == null) tags.push('noclerk');
  return tags;
}

/** 販売管理の一覧（純粋関数）。sort：売上順／見込み順／認知順（同じなら商圏の家の多い順） */
export function salesRows(s: P1State, sort: SalesSort = 'rev'): SalesRow[] {
  const est = shopEstimates(s);
  const rows = myShops(s)
    .filter((b) => !!s.shops[b.uid])
    .map((b): SalesRow => {
      const sh = s.shops[b.uid];
      const st = sh.staff != null ? staffOf(s, sh.staff) : null;
      return {
        b,
        uid: b.uid,
        name: DEF[b.id].name,
        homes: shopArea(s, b).homes,
        staff: st,
        apt: st ? Math.round(aptitude(st.stats, 'shop')) : 0,
        part: sh.part,
        partMax: partMax(s, b.uid),
        shelves: [...sh.shelves],
        rev: sh.rev,
        est: est[b.uid] ?? 0,
        aw: sh.aw ?? 1,
        tags: salesTags(s, b.uid),
      };
    });
  const key = (r: SalesRow) => (sort === 'rev' ? r.rev : sort === 'est' ? r.est : r.aw);
  return rows.sort((a, b) => key(b) - key(a) || b.homes - a.homes || a.uid - b.uid);
}

// ---------------------------------------------------------------- 一括の操作（純粋な操作。s を書き換えて、変えた数を返す）

/** 全店の主力商品（1 番目の棚）を x にする。替えたお店の数を返す（外した商品の棚の残りは裏へ：setShelf） */
export function setMainAll(s: P1State, x: Sku): number {
  let n = 0;
  for (const b of myShops(s)) {
    const sh = s.shops[b.uid];
    if (!sh || sh.shelves[0] === x) continue;
    if (setShelf(s, b.uid, 0, x)) n++;
  }
  return n;
}

/** 空き棚を全部 x で埋める。埋めた棚の数を返す */
export function fillEmptyShelves(s: P1State, x: Sku): number {
  let n = 0;
  for (const b of myShops(s)) {
    const sh = s.shops[b.uid];
    if (!sh) continue;
    sh.shelves.forEach((y, k) => {
      if (y) return;
      if (setShelf(s, b.uid, k, x)) n++;
    });
  }
  return n;
}

/** 空き棚の数 */
export const emptyShelfCount = (s: P1State) => myShops(s).reduce((a, b) => a + (s.shops[b.uid]?.shelves.filter((x) => !x).length ?? 0), 0);

/** 待機中（仕事なし・休憩中でない）のヒーロー */
export const freeHeroes = (s: P1State) => s.staff.filter((x) => x.task == null && !x.resting);

/**
 * 店員のいないお店に、いちばん向いている待機中のヒーローを置く。
 * 商圏の家の多いお店から順に、販売の適性が高い人を置く。置いた組を返す
 */
export function staffEmptyShops(s: P1State): { uid: number; hero: number }[] {
  const free = freeHeroes(s).sort((a, b) => aptitude(b.stats, 'shop') - aptitude(a.stats, 'shop'));
  const shops = myShops(s)
    .filter((b) => s.shops[b.uid] && s.shops[b.uid].staff == null)
    .sort((a, b) => shopArea(s, b).homes - shopArea(s, a).homes);
  const out: { uid: number; hero: number }[] = [];
  for (const b of shops) {
    const st = free.shift();
    if (!st) break;
    if (assign(s, st.hero, 'shop', b.uid) == null) out.push({ uid: b.uid, hero: st.hero });
  }
  return out;
}

// ---------------------------------------------------------------- 画面

let salesSort: SalesSort = 'rev';

export function openSales(ctx: Ctx) {
  open(ctx, t('販売管理', 'Sales management'), (body) => {
    const s = ctx.s();
    mineTip(ctx, 'sales', body);
    const rows = salesRows(s, salesSort);
    const items = () => craftable(s, !!ctx.step?.());
    const making = s.slots.map((y) => y.sku).filter((y): y is Sku => !!y);
    const badge = making[0] ? { x: making[0], text: t('工房で作っている', 'Being crafted') } : null;

    // 上：並び替えと「販売の内訳」
    const top = h('div', 'isl-sales-top');
    const sorts = h('div', 'isl-sales-sort');
    sorts.setAttribute('role', 'group');
    for (const k of Object.keys(SALES_SORT) as SalesSort[])
      sorts.append(
        btn(SALES_SORT[k], () => {
          salesSort = k;
          ctx.sfx?.('tap');
          after(ctx);
        }, salesSort === k ? 'is-on' : ''),
      );
    top.append(sorts, btn(t('販売の内訳（ダッシュボード）', 'Sales breakdown (dashboard)'), () => openSupply(ctx, { breakdown: true }), 'isl-sales-dash'));
    body.append(top);

    // 一括の操作
    const bulk = h('div', 'isl-card2 isl-sales-bulk');
    bulk.append(h('h3', '', t('一括で変える', 'Change all at once')), h('p', 'isl-dim', t('お店ごとに同じ操作をくり返さなくてよいように。外した商品の棚の残りは裏に戻ります。', 'So you don’t repeat the same step per shop. Items taken off a shelf go to the back room.')));
    const row = h('div', 'isl-row');
    const pickAll = (title: string, note: string, apply: (x: Sku) => void) =>
      pickExt(ctx.root, s, { title, items: items(), current: null, making, badge, note, onPick: (x) => x && apply(x) });
    const bMain = btn(t('全店の主力商品をまとめて替える…', 'Change every shop’s main product…'), () =>
      pickAll(t('全店の主力商品にするもの', 'Main product for every shop'), t('全部のお店の 1 番目の棚をこの商品にします。', 'Every shop’s first shelf will sell this.'), (x) => {
        const n = setMainAll(s, x);
        ctx.sfx?.('tap');
        ctx.toast(n ? t(`全店の主力商品を${skuName(x)}にしました（${n} 軒）`, `Main product set to ${skuName(x)} in ${n} shop(s)`) : t(`もう全店の主力商品が${skuName(x)}です`, `${skuName(x)} is already the main product everywhere`));
        after(ctx);
      }),
    );
    const empty = emptyShelfCount(s);
    const bFill = btn(t(`空き棚（${empty}）をまとめて埋める…`, `Fill all ${empty} empty shelves…`), () =>
      pickAll(t('空き棚に並べるもの', 'What to put on empty shelves'), t('全部のお店の空いている棚にこの商品を並べます。', 'Every empty shelf in every shop will sell this.'), (x) => {
        const n = fillEmptyShelves(s, x);
        ctx.sfx?.('tap');
        ctx.toast(t(`空き棚 ${n} つに${skuName(x)}を並べました`, `${skuName(x)} put on ${n} empty shelf(ves)`));
        after(ctx);
      }),
    );
    bFill.disabled = empty === 0;
    const noClerk = rows.filter((r) => r.staff == null).length;
    const free = freeHeroes(s).length;
    const bStaff = btn(t('店員のいないお店に、いちばん向いている待機中のヒーローを置く', 'Put the best free hero in each shop without a clerk'), () => {
      const put = staffEmptyShops(s);
      ctx.sfx?.('tap');
      const shopName = (uid: number) => DEF[s.buildings.find((b) => b.uid === uid)?.id ?? '']?.name ?? '';
      const who = put.map((p) => t(`${shopName(p.uid)}に${heroName(p.hero)}`, `${heroName(p.hero)} to ${shopName(p.uid)}`)).join(t('・', ', '));
      ctx.toast(put.length ? t(`${who}を置きました`, `Assigned ${who}`) : t('置ける人がいません', 'Nobody free to assign'));
      after(ctx);
    });
    bStaff.disabled = noClerk === 0 || free === 0;
    row.append(bMain, bFill, bStaff);
    bulk.append(row);
    const notes: string[] = [];
    if (empty === 0) notes.push(t('空き棚はありません', 'No empty shelves'));
    if (noClerk === 0) notes.push(t('どのお店にも店員がいます', 'Every shop has a clerk'));
    else if (free === 0) notes.push(t(`店員のいないお店 ${noClerk} 軒。待機中のヒーローがいません（人材登用で雇えます）`, `${noClerk} shop(s) without a clerk, but nobody is free (hire under Recruiting)`));
    else notes.push(t(`店員のいないお店 ${noClerk} 軒・待機中 ${free} 人`, `${noClerk} shop(s) without a clerk · ${free} free hero(es)`));
    bulk.append(h('p', 'isl-dim', notes.join(t('・', ' · '))));
    body.append(bulk);

    // 一覧
    if (!rows.length) {
      body.append(h('p', 'isl-dim', t('お店がまだありません。「営業企画」→「建築」で建てましょう。', 'No shops yet. Build one under Planning → Build.')));
      return;
    }
    const list = h('div', 'isl-sales-list');
    for (const r of rows) {
      const sh = s.shops[r.uid];
      const card = h('div', `isl-card2 isl-sales-row ${r.tags.length ? 'is-jam' : ''}`);
      // 名前・場所・札
      const name = h('button', 'isl-sales-name');
      name.type = 'button';
      name.append(h('b', '', r.name), h('small', 'isl-dim', t(`商圏の家 ${r.homes} 軒`, `${r.homes} homes nearby`)));
      if (r.tags.length) {
        const tags = h('div', 'isl-sales-tags');
        for (const k of r.tags) tags.append(h('span', `isl-tag ${k === 'closed' || k === 'unset' ? 'is-bad' : 'is-warn'}`, SALES_TAG[k]));
        name.append(tags);
      }
      name.addEventListener('click', () => openShop(ctx, r.uid));
      card.append(name);
      // 店員（顔・ランク。押して替える）
      const clerk = h('button', `isl-sales-clerk ${r.staff ? '' : 'is-empty'}`);
      clerk.type = 'button';
      clerk.append(h('small', 'isl-slot-label', t('店員', 'Clerk')));
      if (r.staff) clerk.append(heroIcon(r.staff.hero, 40), rankEl(r.apt));
      else clerk.append(h('span', 'isl-slot-plus', '+'));
      if (r.staff?.resting) clerk.append(h('span', 'isl-slot-tag', t('休憩中', 'Resting')));
      clerk.addEventListener('click', () => pickClerk(ctx, r.uid, () => after(ctx)));
      card.append(clerk);
      // アルバイト −／＋
      const part = h('div', 'isl-sales-part');
      part.append(h('small', 'isl-slot-label', t('アルバイト', 'Part-timers')));
      const pr = h('div', 'isl-row');
      const minus = btn('−', () => {
        setPart(s, r.uid, sh.part - 1);
        after(ctx);
      });
      const plus = btn('+', () => {
        setPart(s, r.uid, sh.part + 1);
        after(ctx);
      });
      minus.disabled = r.part <= 0;
      plus.disabled = r.part >= r.partMax;
      pr.append(minus, h('b', '', `${r.part}`), plus);
      part.append(pr, h('small', 'isl-dim', t(`${SHOP.partTimeWage} G／日`, `${SHOP.partTimeWage} G/day`)));
      card.append(part);
      // 棚（絵と名前。空き棚は「＋」。押して替える）
      const shelves = h('div', 'isl-sales-shelves');
      r.shelves.forEach((x, k) => {
        const b = h('button', `isl-sales-shelf ${x ? '' : 'is-empty'} ${x && (sh.shelf[x] ?? 0) <= 0 && (sh.storage[x] ?? 0) <= 0 ? 'is-warn' : ''}`);
        b.type = 'button';
        b.append(h('small', 'isl-slot-label', k === 0 ? t('主力', 'Main') : t(`棚 ${k + 1}`, `Shelf ${k + 1}`)));
        if (x) b.append(skuIcon(x, 36), h('small', 'isl-sales-shelf-name', skuName(x)));
        else b.append(h('span', 'isl-slot-plus', '+'));
        b.addEventListener('click', () => pickShelf(ctx, r.uid, k, () => after(ctx), shelfMoved(ctx)));
        shelves.append(b);
      });
      card.append(shelves);
      // 数字：今月の売上・売れる見込み・認知度
      const nums = h('div', 'isl-sales-nums');
      const num = (label: string, value: HTMLElement | string) => {
        const d = h('div');
        d.append(h('small', 'isl-dim', label), typeof value === 'string' ? h('b', '', value) : value);
        nums.append(d);
      };
      num(t('今月の売上', 'Sales this month'), money(r.rev));
      num(t('売れる見込み／月', 'Forecast / mo'), t(`${r.est} 個`, `${r.est} pcs`));
      const awEl = h('div', 'isl-sales-aw');
      awEl.append(bar(r.aw, 'var(--isl-gold)'), h('b', '', `${Math.round(r.aw * 100)}%`));
      num(t('認知度', 'Awareness'), awEl);
      card.append(nums);
      list.append(card);
    }
    body.append(list);
  });
}
