/**
 * 地図のマスを押したときの吹き出しの中身：名前・説明・建築者・所有者。
 * 自社の建物はデータと移転・撤去・設備投資、他社の店は調査（段階的にデータが分かる）。
 */
import { t } from '../../i18n';
import { DEF } from '../defs';
import { INTEL, P1B, PRODUCT, RIVALS, sku, skuParts } from './data';
import { poolCap, poolUsed, allowedDirs, assign, demolish, ground, intelLv, moveCost, occupant, refundOf, speed, staffOf, storageCap, type P1State, type PBuilding } from './model';
import { investList, jobOptions, openBuy, openShop, openWorkshop, rivalName, type Ctx } from './screens';
import { bar, btn, h, heroName, money, select, skuIcon, skuName } from './ui';

export interface TileHooks {
  /** 移転先を選ぶモードへ */
  move: (uid: number) => void;
  /** このマスに建てる（建築の帯を開く） */
  buildHere: (i: number, j: number) => void;
  close: () => void;
  /** 中身を作り直す */
  redraw: () => void;
}

const DESC: Record<string, string> = {
  warehouse: t('素材と、お店へ運ぶ前の商品をしまっておく倉庫。1 棟で置き場所が 200 個ふえます。倉庫が無いと、工房の物置（80 個）を超えては調達できません。', 'Stores materials and goods waiting to be hauled. Each adds 200 spaces; without one you can only stock 80 in the workshop.'),
  wholesale: t('素材を卸している問屋。調達係は工房からここまで歩いて買い付けに来ます。', 'The wholesaler that sells materials. Your buyer walks here from the workshop.'),
  workshop: t('Workshop から引き継いだ本店。作業台で商品をクラフトし、できた商品を倉庫に置きます。', 'Your head office, brought over from the Workshop. Crafters make goods here and store them.'),
  general_store: t('小さな物販店。最初は棚 1 つ。店員かアルバイトがいると開店します。', 'A small retail shop with one shelf to start. Opens when a clerk or part-timer is there.'),
  import: t('棚が 2 つある輸入品店。売り場が少し強いお店です。', 'An import store with two shelves and a bit more pull.'),
  boutique: t('棚が 2 つあり、売り場がとても強いお店です。', 'A shop with two shelves and strong pull.'),
  greengrocer: t('野菜や日用品を扱う、町の古いお店。', 'An old neighborhood shop for produce and daily goods.'),
  watch: t('小物も扱う、町の老舗。', 'A long-standing shop that also sells small goods.'),
  station: t('列車が止まる駅。人の行き来がいちばん多い場所です。', 'The train station, the busiest spot in the area.'),
  park: t('住民の憩いの場。休日は家族連れでにぎわいます。', 'Where residents relax. Busy with families on holidays.'),
  police: t('エリアの安全を守る交番。', 'The police box that keeps the area safe.'),
};
const HOME = t('エリアの住民が暮らす家。住民はお店の大事なお客さんです。', 'Homes of the area’s residents, your shops’ customers.');

function meta(rows: [string, string][]): HTMLElement {
  const m = h('div', 'isl-pop-meta');
  for (const [k, v] of rows) {
    const c = h('span', 'isl-chip');
    c.append(h('small', 'isl-dim', k), h('b', '', v));
    m.append(c);
  }
  return m;
}

function stat(grid: HTMLElement, k: string, v: string, cls = '') {
  const c = h('div', `isl-pop-stat ${cls}`);
  c.append(h('small', '', k), h('b', '', v));
  grid.append(c);
}

const rate = (rev: number, cost: number) => (rev > 0 ? `${Math.round(((rev - cost) / rev) * 100)}%` : '—');

/** マス (i, j) の吹き出しの中身 */
export function tileContent(ctx: Ctx, i: number, j: number, hooks: TileHooks): { title: string; body: HTMLElement } {
  const s = ctx.s();
  const body = h('div', 'isl-pop-body');
  const b = occupant(s, i, j);
  if (!b) return empty(s, i, j, body, hooks);
  const name = DEF[b.id].name;
  if (b.owner === 'me') return { title: name, body: mine(ctx, b, body, hooks) };
  if (b.owner === 'town') {
    const isHome = DEF[b.id].cat === 'home';
    if (b.id === 'wholesale') {
      body.append(meta([[t('建築者', 'Builder'), t('地元の工務店', 'Local builders')], [t('所有者', 'Owner'), t('卸問屋', 'Wholesaler')]]), h('p', '', DESC.wholesale));
      const trip = s.buyTrip;
      if (trip) body.append(h('p', 'isl-dim', t(`${heroName(trip.hero)}が買い付けの途中です（あと ${trip.left} 日）。`, `${heroName(trip.hero)} is on a buying trip (${trip.left} days left).`)));
      const row = h('div', 'isl-row');
      row.append(btn(t('調達を開く', 'Open buying'), () => openBuy(ctx), 'is-on'));
      body.append(row);
      return { title: name, body };
    }
    body.append(meta(isHome ? [[t('建築者', 'Builder'), t('地元の工務店', 'Local builders')], [t('所有者', 'Owner'), t('住民', 'Residents')]] : [[t('建築者', 'Builder'), t('エリアの自治体', 'Local government')], [t('所有者', 'Owner'), t('エリアの自治体', 'Local government')]]));
    body.append(h('p', '', isHome ? HOME : (DESC[b.id] ?? '')));
    if (isHome) body.append(h('p', 'isl-dim', t(`${DEF[b.id].homes} 世帯が暮らしています。`, `${DEF[b.id].homes} households live here.`)));
    return { title: name, body };
  }
  return { title: name, body: rival(ctx, b, body, hooks) };
}

function empty(s: P1State, i: number, j: number, body: HTMLElement, hooks: TileHooks) {
  const g = ground(s, i, j);
  if (g === 'road') {
    body.append(meta([[t('所有者', 'Owner'), t('エリアの自治体', 'Local government')]]), h('p', '', t('荷車やお客さんが通る道路。建物の入口は道路の方に向けます。', 'A road for carts and shoppers. Entrances must face a road.')));
    return { title: t('道路', 'Road'), body };
  }
  if (g === null) {
    const edge = i === -1 || j === -1 || i === s.n || j === s.n;
    body.append(h('p', '', edge ? t('区画のふちの砂浜。建物は建てられません。', 'The beach at the edge of the district. Nothing can be built here.') : t('海。その先には、まだ見ぬランドが広がっています。', 'The sea. Unknown lands lie beyond.')));
    return { title: edge ? t('砂浜', 'Beach') : t('海', 'Sea'), body };
  }
  const ok = allowedDirs(s, 'general_store', i, j).length > 0;
  body.append(meta([[t('所有者', 'Owner'), t('売り地', 'For sale')]]));
  body.append(h('p', '', ok ? t('道路に面した空き地。工房やお店を建てられます。', 'An empty lot facing a road. You can build here.') : t('道路に面していない空き地。建物は道路に面した場所にしか建てられません。', 'An empty lot away from the road. Buildings must face a road.')));
  if (ok) {
    const row = h('div', 'isl-row');
    row.append(btn(t('ここに建てる', 'Build here'), () => hooks.buildHere(i, j), 'is-on'));
    body.append(row);
  }
  return { title: t('空き地', 'Empty lot'), body };
}

function mine(ctx: Ctx, b: PBuilding, body: HTMLElement, hooks: TileHooks): HTMLElement {
  const s = ctx.s();
  const kind = P1B[b.id]?.kind;
  body.append(meta([[t('建築者', 'Builder'), t('あなたの会社', 'Your company')], [t('所有者', 'Owner'), t('あなたの会社', 'Your company')]]));
  body.append(h('p', '', DESC[b.id] ?? ''));
  const grid = h('div', 'isl-pop-grid');
  if (b.left > 0) {
    stat(grid, t('状態', 'Status'), t(`工事中（あと ${b.left} 日）`, `Building (${b.left} d left)`), 'is-wide');
    body.append(grid);
    return body;
  }
  if (kind === 'shop') {
    const sh = s.shops[b.uid];
    const st = sh?.staff != null ? staffOf(s, sh.staff) : null;
    const open = (st && !st.resting) || (sh?.part ?? 0) > 0;
    stat(grid, t('状態', 'Status'), open ? t('営業中', 'Open') : t('休業中（売り場に人がいません）', 'Closed (nobody on the floor)'), `is-wide ${open ? '' : 'is-bad'}`);
    if (sh) {
      stat(grid, t('今月の売上', 'Sales this month'), money(sh.rev));
      stat(grid, t('今月の粗利率', 'Gross margin'), rate(sh.rev, sh.cost));
      stat(grid, t('先月の売上', 'Last month'), sh.last ? money(sh.last.rev) : '—');
      stat(grid, t('先月の利益率', 'Last month margin'), sh.last ? rate(sh.last.rev, sh.last.cost) : '—');
      body.append(grid);
      const goods = h('div', 'isl-stock');
      sh.shelves.forEach((x) => {
        if (!x) return;
        const c = h('span', 'isl-chip');
        c.append(skuIcon(x, 24), h('small', '', t(`${skuName(x)} 棚 ${sh.shelf[x] ?? 0}・裏 ${sh.storage[x] ?? 0}`, `${skuName(x)} shelf ${sh.shelf[x] ?? 0}, back ${sh.storage[x] ?? 0}`)));
        goods.append(c);
      });
      if (!goods.childElementCount) goods.append(h('small', 'isl-warn', t('並べる商品が決まっていません', 'No product chosen')));
      body.append(goods, h('small', 'isl-dim', t(`裏に置ける数 ${storageCap(b)}・利益率は維持費も含めた月の数字（今月の粗利率は素材代とアルバイト代だけ）`, `Backroom ${storageCap(b)}. Last month’s margin includes upkeep; this month’s counts materials and part-timers only.`)));
    }
  } else if (kind === 'warehouse') {
    stat(grid, t('置き場所（全体）', 'Storage (total)'), t(`${poolUsed(s)} / ${poolCap(s)} 個`, `${poolUsed(s)} / ${poolCap(s)}`), 'is-wide');
    body.append(grid);
  } else if (kind === 'workshop') {
    stat(grid, t('作業台', 'Benches'), `${s.slots.length}`);
    stat(grid, t('動いている作業台', 'Working'), `${s.slots.filter((x) => x.running).length}`);
    stat(grid, t('今月作った数', 'Made this month'), t(`${s.ws.made} 個`, `${s.ws.made}`));
    stat(grid, t('今月作った価値', 'Value made'), money(s.ws.value));
    stat(grid, t('先月作った数', 'Last month'), s.ws.last ? t(`${s.ws.last.made} 個`, `${s.ws.last.made}`) : '—');
    stat(grid, t('置き場所', 'Storage'), t(`${poolUsed(s)} / ${poolCap(s)} 個`, `${poolUsed(s)} / ${poolCap(s)}`));
    stat(grid, t('運ぶ前の商品', 'Goods to haul'), t(`${Object.values(s.stock).reduce<number>((a, n) => a + (n ?? 0), 0)} 個`, `${Object.values(s.stock).reduce<number>((a, n) => a + (n ?? 0), 0)}`));
    body.append(grid);
  }

  const acts = h('div', 'isl-row isl-pop-acts');
  if (kind === 'warehouse') acts.append(btn(t('調達を開く', 'Open buying'), () => openBuy(ctx), 'is-on'));
  else acts.append(btn(kind === 'workshop' ? t('工房を開く', 'Open workshop') : t('お店を開く', 'Open shop'), () => (kind === 'workshop' ? openWorkshop(ctx) : openShop(ctx, b.uid)), 'is-on'));
  const mv = btn(t(`移転 ${money(moveCost(b))}`, `Move ${money(moveCost(b))}`), () => hooks.move(b.uid));
  mv.disabled = s.money < moveCost(b);
  acts.append(mv);
  if (b.id === 'workshop') {
    const x = btn(t('撤去（本店はできません）', 'Demolish (not the head office)'), () => undefined);
    x.disabled = true;
    acts.append(x);
  } else
    acts.append(
      btn(t(`撤去（${money(refundOf(b))} 戻る）`, `Demolish (+${money(refundOf(b))})`), () => {
        confirmBox(body, t(`${DEF[b.id].name}を撤去しますか？ 棚と裏の商品は工房の倉庫に戻ります。`, `Demolish ${DEF[b.id].name}? Goods go back to the workshop.`), () => {
          demolish(s, b.uid);
          ctx.toast(t(`${DEF[b.id].name}を撤去しました`, `Demolished ${DEF[b.id].name}`));
          ctx.save();
          ctx.refresh();
          hooks.close();
        });
      }, 'is-danger'),
    );
  body.append(acts, h('small', 'isl-dim', t(`移転すると約 ${Math.max(1, Math.ceil((P1B[b.id]?.days ?? 2) / 2))} 日休業します。在庫と設備はそのままです。`, `Moving closes it for about ${Math.max(1, Math.ceil((P1B[b.id]?.days ?? 2) / 2))} days; stock and upgrades stay.`)));
  if (kind === 'shop' || kind === 'workshop') body.append(h('h4', '', t('設備投資', 'Capital investment')), investList(ctx, b, hooks.redraw));
  return body;
}

function confirmBox(body: HTMLElement, text: string, yes: () => void) {
  body.querySelector('.isl-pop-confirm')?.remove();
  const c = h('div', 'isl-pop-confirm');
  const row = h('div', 'isl-row');
  row.append(btn(t('撤去する', 'Demolish'), yes, 'is-danger'), btn(t('やめる', 'Cancel'), () => c.remove()));
  c.append(h('p', '', text), row);
  body.append(c);
  c.scrollIntoView({ block: 'nearest' });
}

function rival(ctx: Ctx, b: PBuilding, body: HTMLElement, hooks: TileHooks): HTMLElement {
  const s = ctx.s();
  const rid = b.owner;
  const company = rivalName(rid);
  const def = RIVALS.find((r) => r.id === rid);
  const st = s.rivals.find((r) => r.id === rid);
  body.append(meta([[t('建築者', 'Builder'), company], [t('所有者', 'Owner'), company]]));
  body.append(h('p', '', t(`同じエリアで物販をしている同業他社「${company}」のお店です。`, `A store of ${company}, a retail rival in your area.`) + (DESC[b.id] ? ` ${DESC[b.id]}` : '')));
  const lv = intelLv(s, rid);
  const last = s.rivalLast[rid];
  const grid = h('div', 'isl-pop-grid');
  stat(grid, t('先月の売上（公開）', 'Last month (public)'), last ? money(last.total) : '—', 'is-wide');
  body.append(grid);

  const box = h('div', 'isl-intel');
  box.append(h('h4', '', t(`調査 ${lv} / ${INTEL.length}`, `Research ${lv} / ${INTEL.length}`)));
  const secret = (k: string, open: boolean, fill: (el: HTMLElement) => void) => {
    const row = h('div', `isl-intel-row ${open ? '' : 'is-locked'}`);
    row.append(h('small', 'isl-dim', k));
    const v = h('div', 'isl-stock');
    if (open) fill(v);
    else v.append(h('b', '', '???'));
    row.append(v);
    box.append(row);
  };
  secret(t('① 扱っている商品と売り場の強さ', '① Products and pull'), lv >= 1, (v) => {
    for (const [k, w] of Object.entries(st?.sells ?? {})) {
      if (!w) continue;
      const c = h('span', 'isl-chip');
      c.append(skuIcon(sku(k, 'C'), 22), h('small', '', `${PRODUCT[k].name} ${w.toFixed(1)}`));
      v.append(c);
    }
  });
  secret(t('② 先月の売上（商品別）', '② Last month by product'), lv >= 2, (v) => {
    const by = Object.entries(last?.by ?? {}).filter(([, n]) => (n ?? 0) > 0);
    if (!by.length) v.append(h('small', '', t('まだ月の締めがありません', 'No month closed yet')));
    for (const [k, n] of by) v.append(h('span', 'isl-chip', `${PRODUCT[k].name} ${money(n ?? 0)}`));
    if (last) v.append(h('span', 'isl-chip', t(`エクステ以外 ${money(Math.max(0, last.total - by.reduce((a, [, n]) => a + (n ?? 0), 0)))}`, `Other ${money(Math.max(0, last.total - by.reduce((a, [, n]) => a + (n ?? 0), 0)))}`)));
  });
  secret(t('③ 利益率と伸び', '③ Margin and growth'), lv >= 3, (v) => {
    v.append(h('span', 'isl-chip', t(`利益率 ${Math.round((def?.margin ?? 0) * 100)}%`, `Margin ${Math.round((def?.margin ?? 0) * 100)}%`)), h('span', 'isl-chip', t('毎月 1% ずつ強くなる', 'Grows 1% a month')));
  });

  const who = s.staff.find((x) => x.task === 'intel' && x.target === rid);
  if (lv >= INTEL.length) box.append(h('p', 'isl-good', t('調査は完了しました。', 'Research complete.')));
  else if (who) {
    const done = s.intel[rid] ?? 0;
    const prev = INTEL[lv - 1] ?? 0;
    const next = INTEL[lv];
    const days = Math.ceil((next - done) / Math.max(0.1, speed(who, 'intel')));
    box.append(h('p', '', t(`${heroName(who.hero)}が調査中：次の段階まで約 ${days} 日`, `${heroName(who.hero)} is researching: ~${days} days to the next stage`)), bar((done - prev) / (next - prev), 'var(--isl-gold)'));
  } else {
    const row = h('div', 'isl-row');
    const ops = jobOptions(s).filter((o) => o.value === `intel:${rid}`);
    if (ops.length)
      row.append(
        select(
          s.staff.map((x) => ({ value: x.hero, label: `${heroName(x.hero)}（${t('調査', 'Research')} ${Math.round(speed(x, 'intel') * 53)}）` })), // i18n-ja
          null,
          (v) => {
            assign(s, v, 'intel', rid);
            ctx.toast(t(`${heroName(v)}が${company}の調査を始めました`, `${heroName(v)} started researching ${company}`));
            ctx.save();
            ctx.refresh();
            hooks.redraw();
          },
          t('ヒーローを調査に出す…', 'Send a hero to research…'),
        ),
      );
    box.append(row, h('small', 'isl-dim', t('調査は INT と AGI が高いヒーローが得意です。調査中はほかの仕事をしません。', 'High INT and AGI heroes research best. They do nothing else meanwhile.')));
  }
  body.append(box);

  const acts = h('div', 'isl-row isl-pop-acts');
  for (const label of [t('妨害工作', 'Sabotage'), t('買収提案', 'Acquisition offer')]) {
    const x = btn(`🔒 ${label}`, () => undefined);
    x.disabled = true;
    acts.append(x);
  }
  body.append(acts, h('small', 'isl-dim', t('妨害工作と買収提案は、スキルツリーで解放する予定です（準備中）。', 'Sabotage and acquisitions will unlock in the skill tree (coming soon).')));
  void skuParts;
  return body;
}
