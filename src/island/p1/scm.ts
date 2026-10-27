/**
 * SCM ダッシュボード：① 調達 → ② 製造 → ③ 物流 → ④ 販売 の流れを、ヒーローとエクステの絵で見せる。
 * 段ごとに「ひと月に回せる数」を比べて、いちばん細いところ（ボトルネック）を目立たせ、
 * その場でヒーローの割り当て・スキル・雇う・建てる画面へ行けるようにする（docs/ISLAND_PHASE1.md「SCM ダッシュボード」）。
 */
import { t } from '../../i18n';
import { assetUrl } from '../../render/images';
import { DEF } from '../defs';
import { MAT_KEYS, MATS, SKILLS, TRANSPORT, type Mat, type Sku } from './data';
import { bottleneck, oneWay, shopArea, craftCheck, craftDays, has, learn, matDays, monthRevenue, myShops, myWorkshop, poolCap, poolFree, poolUsed, speed, stageCaps, staffOf, storageCap, assign, type P1State, type Stage } from './model';
import { pickHero, slot, TASK_NAME } from './heroui';
import { after, mineTip, open, openAds, openBuy, openHire, openShop, openStaff, openWorkshop, type Ctx } from './screens';
import { openSkills } from './tree';
import { bar, btn, h, heroIcon, matIcon, money, skuIcon, skuName } from './ui';

type Lamp = 'ok' | 'warn' | 'stop';
const LAMP_NAME: Record<Lamp, string> = { ok: t('順調', 'Running'), warn: t('注意', 'Watch'), stop: t('停止', 'Stopped') };
const STAGE: Record<Stage, { n: string; name: string; branch: string; what: string }> = {
  buy: { n: '①', name: t('調達', 'Buy'), branch: 'buy', what: t('素材', 'materials') },
  craft: { n: '②', name: t('製造', 'Craft'), branch: 'craft', what: t('作った', 'made') },
  haul: { n: '③', name: t('物流', 'Haul'), branch: 'logi', what: t('運んだ', 'hauled') },
  sell: { n: '④', name: t('販売', 'Sell'), branch: 'shop', what: t('売れた', 'sold') },
};

/** まだ取れるスキル（先に要るものを取ってあるもの）を、その段の系統から 2 つ */
function nextSkills(s: P1State, branch: string) {
  return SKILLS.filter((k) => k.branch === branch && !has(s, k.id) && !(k.requires ?? []).some((r) => !has(s, r))).slice(0, 2);
}

function lampEl(l: Lamp): HTMLElement {
  return h('span', `isl-lamp is-${l}`, LAMP_NAME[l]);
}

const sumOf = (o: Partial<Record<string, number>>) => Object.values(o).reduce<number>((a, n) => a + (n ?? 0), 0);

export function openSupply(ctx: Ctx) {
  open(ctx, t('SCM ダッシュボード', 'SCM dashboard'), (body) => {
    const s = ctx.s();
    mineTip(ctx, 'scm', body);
    const caps = stageCaps(s);
    const ws = myWorkshop(s);
    const shops = myShops(s);
    const buyer = s.staff.find((x) => x.task === 'buy');
    const haulers = s.staff.filter((x) => x.task === 'transport');
    const stock = sumOf(s.stock);

    // ---------------------------------------------------------------- 段ごとの状態と課題
    const issues: Record<Stage, { lamp: Lamp; lines: string[]; acts: [string, () => void, string?][] }> = {
      buy: { lamp: 'ok', lines: [], acts: [[t('調達を開く', 'Open buying'), () => openBuy(ctx), 'is-on']] },
      craft: { lamp: 'ok', lines: [], acts: [[t('工房を開く', 'Open workshop'), () => openWorkshop(ctx), 'is-on']] },
      haul: { lamp: 'ok', lines: [], acts: [[t('ヒーローの配置', 'Assign heroes'), () => openStaff(ctx), 'is-on']] },
      sell: { lamp: 'ok', lines: [], acts: [] },
    };
    const worse = (k: Stage, l: Lamp, line: string) => {
      const order: Lamp[] = ['ok', 'warn', 'stop'];
      if (order.indexOf(l) > order.indexOf(issues[k].lamp)) issues[k].lamp = l;
      issues[k].lines.push(line);
    };
    // ① 調達
    const days = matDays(s);
    if (!buyer) {
      worse('buy', caps.buy.stopped ? 'stop' : 'warn', t('調達係がいないので、素材は手で買っています。ヒーローを雇って調達係にすると自動になります。', 'No buyer: you buy by hand. Hire a hero as buyer to automate it.'));
      issues.buy.acts.push([t('人材登用', 'Recruit'), () => openHire(ctx)]);
    } else if (buyer.resting) worse('buy', 'warn', t('調達係が休憩中です。', 'The buyer is resting.'));
    const tripLeft = s.buyTrip ? s.buyTrip.left : null;
    if (days != null && days < 4) {
      if (tripLeft != null) worse('buy', 'warn', t(`素材が残り少なめ。調達係があと ${tripLeft} 日で買い付けから戻ります。`, `Materials are low; the buyer returns in ${tripLeft} d.`));
      else worse('buy', days < 1 ? 'stop' : 'warn', t(`素材があと約 ${Math.max(0, Math.floor(days))} 日ぶんしかありません。`, `Only ~${Math.max(0, Math.floor(days))} days of materials left.`));
    }
    if (poolFree(s) <= 2) {
      worse('buy', 'stop', t('置き場所がいっぱいで、これ以上買えません。倉庫を建てましょう。', 'Storage is full; build a warehouse to buy more.'));
      issues.buy.acts.push([t('倉庫を建てる', 'Build a warehouse'), () => ctx.build?.('warehouse')]);
    }
    // ② 製造
    if (!ws) worse('craft', 'stop', t('工房がありません。', 'No workshop yet.'));
    s.slots.forEach((sl, k) => {
      const st = sl.worker != null ? staffOf(s, sl.worker) : null;
      if (!st) worse('craft', 'stop', t(`作業台 ${k + 1} に職人がいません。`, `Bench ${k + 1} has no crafter.`));
      else if (!sl.sku) worse('craft', 'stop', t(`作業台 ${k + 1} で作るものが決まっていません。`, `Bench ${k + 1} has nothing to make.`));
      else if (st.resting) worse('craft', 'warn', t(`作業台 ${k + 1} の職人が休憩中です。`, `Bench ${k + 1}'s crafter is resting.`));
      else if (!sl.running) {
        const e = craftCheck(s, sl.sku, sl.worker);
        if (e === 'mats')
          worse(
            'craft',
            tripLeft != null ? 'warn' : 'stop',
            tripLeft != null ? t(`作業台 ${k + 1}：素材待ち（調達係があと ${tripLeft} 日で戻ります）。`, `Bench ${k + 1}: waiting for materials (buyer back in ${tripLeft} d).`) : t(`作業台 ${k + 1}：素材が足りません。`, `Bench ${k + 1}: not enough materials.`),
          );
        else if (e === 'full') worse('craft', 'stop', t(`作業台 ${k + 1}：置き場所がいっぱいです。`, `Bench ${k + 1}: storage is full.`));
      }
    });
    // 作っているのに、どのお店にも並べていない
    for (const x of new Set(s.slots.map((y) => y.sku).filter((y): y is Sku => !!y)))
      if (shops.length && !shops.some((b) => s.shops[b.uid].shelves.includes(x))) worse('craft', 'warn', t(`「${skuName(x)}」を並べているお店がありません。`, `No shop sells ${skuName(x)}.`));
    // ③ 物流
    if (!haulers.length && shops.length) worse('haul', 'stop', t('物流の担当がいないので、商品がお店に届きません。', 'No hauler: goods never reach the shops.'));
    else if (haulers.every((x) => x.resting) && haulers.length) worse('haul', 'warn', t('運搬係が全員休憩中です。', 'All haulers are resting.'));
    if (stock > TRANSPORT.cap * 2) worse('haul', 'warn', t(`工房に運ぶ前の商品が ${stock} 個たまっています。`, `${stock} goods are waiting at the workshop.`));
    // 工房から遠いお店：運ぶのに日数がかかる（物流拠点・トラックで縮む）
    for (const b of shops) {
      const way = oneWay(s, b);
      if (way.days > 2.5) {
        worse('haul', 'warn', t(`${DEF[b.id].name}は工房から遠く、片道 ${way.days.toFixed(1)} 日かかります。`, `${DEF[b.id].name} is far: ${way.days.toFixed(1)} days one way.`));
        if (!issues.haul.acts.some((a) => a[2] === 'hub')) issues.haul.acts.push(has(s, 'hub') ? [t('物流拠点を建てる', 'Build a hub'), () => ctx.build?.('logistics'), 'hub'] : [t('物流拠点を調べる', 'About hubs'), () => openSkills(ctx, 'logi'), 'hub']);
      }
    }
    // ④ 販売
    if (!shops.length) {
      worse('sell', 'stop', t('お店がありません。', 'No shop yet.'));
      issues.sell.acts.push([t('お店を建てる', 'Build a shop'), () => ctx.build?.('general_store'), 'is-on']);
    }
    for (const b of shops) {
      const sh = s.shops[b.uid];
      const st = sh.staff != null ? staffOf(s, sh.staff) : null;
      const name = DEF[b.id].name;
      if (!sh.shelves[0]) worse('sell', 'stop', t(`${name}：並べる商品が決まっていません。`, `${name}: no product chosen.`));
      if (!st && sh.part === 0) worse('sell', 'stop', t(`${name}：売り場に人がいません。`, `${name}: nobody on the floor.`));
      else if (st?.resting && sh.part === 0) worse('sell', 'warn', t(`${name}：店員が休憩中です。`, `${name}: the clerk is resting.`));
      const main = sh.shelves[0];
      const making = s.slots.map((y) => y.sku).filter((y): y is Sku => !!y);
      if (main && !making.includes(main) && (sh.shelf[main] ?? 0) <= 0 && (sh.storage[main] ?? 0) <= 0 && !(s.stock[main] ?? 0))
        worse('sell', 'stop', t(`${name}：「${skuName(main)}」は工房で作っていません。作っているものを並べましょう。`, `${name}: ${skuName(main)} isn't being crafted. Shelve what you make.`));
      else if (main && (sh.shelf[main] ?? 0) <= 0 && (sh.storage[main] ?? 0) <= 0) worse('sell', 'warn', t(`${name}：主力商品が品切れです。`, `${name}: the main product is sold out.`));
      if ((sh.aw ?? 1) < 0.7) worse('sell', 'warn', t(`${name}：まだ知られていません（認知度 ${Math.round((sh.aw ?? 1) * 100)}%）。宣伝すると早く広まります。`, `${name}: not well known yet (${Math.round((sh.aw ?? 1) * 100)}%). Ads help.`));
    }
    if (shops.length) issues.sell.acts.push([t('お店を開く', 'Open shop'), () => openShop(ctx, shops[0].uid), 'is-on'], [t('宣伝広報', 'Advertising'), () => openAds(ctx)]);

    // ボトルネック：止まっている段があればそこ（流れの上から）、無ければ回せる数がいちばん少ない段
    const ORDER: Stage[] = ['buy', 'craft', 'haul', 'sell'];
    const bn = ORDER.find((k) => issues[k].lamp === 'stop') ?? bottleneck(caps);

    // ---------------------------------------------------------------- 見出し：ボトルネック
    const top = h('div', `isl-scm-head is-${issues[bn].lamp}`);
    const mine = h('img', 'isl-scm-mine');
    mine.src = assetUrl('mch/Image/Characters/navi_ain_speak_00_talk.png');
    mine.alt = '';
    const words = h('div');
    words.append(
      h('small', '', t('いまのボトルネック', 'Current bottleneck')),
      h('b', 'isl-scm-bn', `${STAGE[bn].n} ${STAGE[bn].name}`),
      h('p', '', issues[bn].lines[0] ?? t('いちばん細いところです。ここを太くすると、サイクル全体の売上が伸びます。', 'This is the narrowest stage. Widen it and the whole cycle sells more.')),
    );
    const kpi = h('div', 'isl-scm-kpi');
    const last = s.reports[s.reports.length - 1];
    kpi.append(h('span', '', t(`今月の売上 ${money(monthRevenue(s))}`, `This month ${money(monthRevenue(s))}`)), h('span', '', last ? t(`エリア ${last.rank} 位`, `Area #${last.rank}`) : t('エリア順位：締めのあと', 'Area rank: after close')));
    top.append(mine, words, kpi);
    body.append(top);

    // ---------------------------------------------------------------- 段ごとの「ひと月に回せる数」
    const meter = h('div', 'isl-card2 isl-scm-caps');
    meter.append(h('h3', '', t('ひと月に回せる数（商品の数）', 'Monthly capacity (products)')));
    const max = Math.max(1, ...(['buy', 'craft', 'haul', 'sell'] as Stage[]).map((k) => caps[k].perMonth));
    for (const k of ['buy', 'craft', 'haul', 'sell'] as Stage[]) {
      const row = h('div', `isl-cap-row ${k === bn ? 'is-bn' : ''}`);
      row.append(h('span', 'isl-cap-name', `${STAGE[k].n} ${STAGE[k].name}`), bar(caps[k].perMonth / max, k === bn ? 'var(--isl-bad)' : issues[k].lamp === 'warn' ? 'var(--isl-gold)' : 'var(--isl-good)'), h('b', '', caps[k].stopped ? t('止まっている', 'stopped') : t(`${caps[k].perMonth} 個`, `${caps[k].perMonth}`)));
      row.addEventListener('click', () => cards[k]?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
      meter.append(row);
    }
    meter.append(h('small', 'isl-dim', t('いちばん短い棒がボトルネック。販売は「棚に商品があれば売れそうな数」、調達は「調達係の月の量（いなければ手元の素材）でまかなえる数」です。', 'The shortest bar is the bottleneck. Sell = what would sell with stocked shelves; Buy = what the monthly buying (or current stock) supports.')));
    body.append(meter);

    // ---------------------------------------------------------------- 流れ：4 つの段
    const flow = h('div', 'isl-scm');
    const made = s.ws.made;
    const hauled = s.ws.hauled ?? 0;
    const sold = sumOf(s.monthUnits);
    const pipe = (label: string, n: number) => {
      const p = h('div', 'isl-scm-pipe');
      p.append(h('span', 'isl-scm-arrow', '▶'), h('b', '', `${n}`), h('small', '', t(`今月${label}`, `${label} this month`)));
      return p;
    };
    const cards: Partial<Record<Stage, HTMLElement>> = {};
    const card = (k: Stage, heroes: HTMLElement[], visual: HTMLElement[]) => {
      const c = h('div', `isl-scm-stage is-${issues[k].lamp} ${k === bn ? 'is-bn' : ''}`);
      cards[k] = c;
      const head = h('div', 'isl-scm-stage-head');
      head.append(h('span', 'isl-lane-n', STAGE[k].n), h('h3', '', STAGE[k].name), lampEl(issues[k].lamp));
      c.append(head);
      const main = h('div', 'isl-scm-main');
      const hs = h('div', 'isl-slots is-small');
      hs.append(...heroes);
      const vis = h('div', 'isl-scm-vis');
      vis.append(...visual);
      main.append(hs, vis);
      c.append(main);
      for (const line of issues[k].lines.slice(0, 3)) c.append(h('p', issues[k].lamp === 'stop' ? 'isl-scm-issue is-stop' : 'isl-scm-issue', line));
      const acts = h('div', 'isl-row');
      for (const [label, go, cls] of issues[k].acts) acts.append(btn(label, go, cls));
      c.append(acts);
      // その段を太くするスキル：その場で習得できる
      const sks = k === bn ? nextSkills(s, STAGE[k].branch) : [];
      const box = h('div', 'isl-scm-skills');
      if (sks.length) box.append(h('small', 'isl-dim', t('ボトルネックを太くするスキル', 'Skills to widen the bottleneck')));
      for (const sk of sks) {
        const b = h('button', 'isl-scm-skill');
        b.type = 'button';
        b.append(h('b', '', sk.name), h('small', '', sk.note), h('span', 'isl-gold', money(sk.cost)));
        b.disabled = s.money < sk.cost;
        b.addEventListener('click', () => {
          const e = learn(s, sk.id);
          if (e === 'money') ctx.toast(t('資金が足りません', 'Not enough funds'));
          else if (!e) ctx.toast(t(`「${sk.name}」を習得しました`, `Learned: ${sk.name}`));
          after(ctx);
        });
        box.append(b);
      }
      box.append(btn(t('スキルツリーで見る', 'Open skill tree'), () => openSkills(ctx, STAGE[k].branch)));
      c.append(box);
      return c;
    };
    const assignSlot = (label: string, task: 'buy' | 'craft' | 'transport' | 'shop', hero: number | null, target: number | null) =>
      slot(s, {
        label,
        task,
        hero,
        onTap: () =>
          pickHero(ctx.root, s, {
            title: t(`${label}（${TASK_NAME[task]}）`, `${label} (${TASK_NAME[task]})`),
            task,
            current: hero,
            onPick: (v) => {
              if (task === 'buy') for (const x of s.staff) if (x.task === 'buy' && x.hero !== v) assign(s, x.hero, null);
              if (v == null) {
                if (hero != null) assign(s, hero, null);
              } else {
                if (task === 'transport' && hero != null && hero !== v) assign(s, hero, null);
                assign(s, v, task, target);
              }
              after(ctx);
            },
          }),
      });

    // ① 調達：素材の在庫・置き場所・調達係の往復
    const mats = h('div', 'isl-stock');
    mats.append(h('small', 'isl-scm-cap', t('素材の在庫', 'Materials')));
    for (const m of MAT_KEYS) {
      if (!s.routes.includes(m) && !(s.mats[m] ?? 0)) continue;
      const c = h('span', `isl-chip ${(s.mats[m] ?? 0) < 6 ? 'is-bad' : ''}`);
      c.append(matIcon(m as Mat, 22), h('small', '', `${s.mats[m] ?? 0}`));
      mats.append(c);
    }
    const storage = h('div', 'isl-field');
    storage.append(h('span', '', t('置き場所', 'Storage')), bar(poolUsed(s) / poolCap(s), poolFree(s) <= 2 ? 'var(--isl-bad)' : 'var(--isl-good)'), h('small', 'isl-dim', `${poolUsed(s)} / ${poolCap(s)}`));
    const trip = h('div', 'isl-scm-trip');
    const tr = s.buyTrip;
    const k = tr ? (tr.total - tr.left) / tr.total : 0;
    const track = h('div', 'isl-trip-track');
    track.append(h('span', 'isl-trip-end', t('工房', 'Workshop')), h('span', 'isl-trip-end is-right', t('卸問屋', 'Wholesaler')));
    if (tr) {
      const who = h('span', 'isl-trip-who');
      who.style.left = `${(k < 0.5 ? k * 2 : (1 - k) * 2) * 100}%`;
      who.append(heroIcon(tr.hero, 28));
      track.append(who);
    }
    const cargo = tr ? Object.entries(tr.cargo).map(([m, n]) => `${MATS[m as Mat].name}×${n}`).join(t('・', ', ')) : '';
    trip.append(track, h('small', 'isl-dim', tr ? t(`買い付け中：あと ${tr.left} 日で ${cargo} が届く`, `On a trip: ${cargo} arrives in ${tr.left} d`) : buyer ? t('工房で次の買い付けを待っています', 'Waiting at the workshop') : t('調達係がいません', 'No buyer')));
    flow.append(card('buy', [assignSlot(t('調達係', 'Buyer'), 'buy', buyer?.hero ?? null, null)], [mats, storage, trip]));
    flow.append(pipe(STAGE.buy.what, s.proc.bought));

    // ② 製造：作業台ごとに、職人 → エクステと進み
    const benches = h('div', 'isl-scm-benches');
    s.slots.forEach((sl, i) => {
      const r = h('div', 'isl-scm-bench');
      const st = sl.worker != null ? staffOf(s, sl.worker) : null;
      const p = sl.running && sl.sku && st ? sl.progress / craftDays(s, sl.sku) : 0;
      r.append(h('small', 'isl-dim', t(`台 ${i + 1}`, `#${i + 1}`)), sl.sku ? skuIcon(sl.sku as Sku, 32) : h('span', 'isl-slot-plus', '?'), bar(p, 'var(--isl-gold)'), h('small', '', sl.sku ? (st?.resting ? t('休憩中', 'resting') : sl.running ? `${Math.round(p * 100)}%` : t('止まっている', 'idle')) : t('未定', 'unset')));
      if (sl.sku && st && !st.resting) r.append(h('small', 'isl-dim', t(`${(craftDays(s, sl.sku) / speed(st, 'craft')).toFixed(1)} 日/ロット`, `${(craftDays(s, sl.sku) / speed(st, 'craft')).toFixed(1)} d/lot`)));
      benches.append(r);
    });
    flow.append(card('craft', s.slots.map((sl, i) => assignSlot(t(`作業台 ${i + 1}`, `Bench ${i + 1}`), 'craft', sl.worker, i)), [benches]));
    flow.append(pipe(STAGE.craft.what, made));

    // ③ 物流：工房で待つ商品 → 走っている荷車
    const wait = h('div', 'isl-stock');
    wait.append(h('small', 'isl-scm-cap', t('工房で出荷待ち', 'Waiting to ship')));
    const waiting = Object.entries(s.stock).filter(([, n]) => (n ?? 0) > 0) as [Sku, number][];
    if (!waiting.length) wait.append(h('small', 'isl-dim', t('工房で待っている商品はありません', 'Nothing waiting at the workshop')));
    for (const [x, n] of waiting) {
      const c = h('span', 'isl-chip');
      c.append(skuIcon(x, 22), h('small', '', `×${n}`));
      wait.append(c);
    }
    const carts = h('div', 'isl-scm-carts');
    for (const tp of s.trips) {
      const to = s.buildings.find((b) => b.uid === tp.to);
      const r = h('div', 'isl-field');
      const from = tp.from != null ? s.buildings.find((b) => b.uid === tp.from) : null;
      const via = from && from.id !== 'workshop' ? t('（拠点から）', ' (from hub)') : '';
      r.append(heroIcon(tp.hauler, 24), h('span', '', tp.dropped ? t(`🛒 帰り道${via}`, `🛒 returning${via}`) : `🛒 → ${to ? DEF[to.id].name : ''}${via}`), bar(1 - tp.left / tp.total, 'var(--isl-gold)'), h('small', 'isl-dim', t(`あと ${Math.ceil(tp.left)} 日`, `${Math.ceil(tp.left)} d left`)));
      carts.append(r);
    }
    if (!s.trips.length) carts.append(h('small', 'isl-dim', t('いま走っている荷車はありません', 'No carts on the road')));
    const hs = haulers.map((x) => assignSlot(t('運搬係', 'Hauler'), 'transport', x.hero, null));
    if (haulers.length < 3) hs.push(assignSlot(t('運搬係', 'Hauler'), 'transport', null, null));
    flow.append(card('haul', hs, [wait, carts]));
    flow.append(pipe(STAGE.haul.what, hauled));

    // ④ 販売：お店ごとに、主力商品・棚と裏・認知度・今月の売上
    const shopRows = h('div', 'isl-scm-shops');
    for (const b of shops) {
      const sh = s.shops[b.uid];
      const r = h('div', 'isl-scm-shop');
      const main = sh.shelves[0];
      const name = h('div');
      name.append(h('b', '', DEF[b.id].name), h('small', 'isl-gold', money(sh.rev)));
      r.append(main ? skuIcon(main, 32) : h('span', 'isl-slot-plus', '?'), name);
      const bars = h('div', 'isl-scm-shop-bars');
      const on = main ? sh.shelf[main] ?? 0 : 0;
      const back = main ? sh.storage[main] ?? 0 : 0;
      const f1 = h('div', 'isl-field');
      f1.append(h('small', '', t('棚', 'Shelf')), bar(on / 10, on ? 'var(--isl-good)' : 'var(--isl-bad)'), h('small', 'isl-dim', `${on}`));
      const f2 = h('div', 'isl-field');
      f2.append(h('small', '', t('裏', 'Back')), bar(back / storageCap(b, s)), h('small', 'isl-dim', `${back}`));
      const f3 = h('div', 'isl-field');
      f3.append(h('small', '', t('認知度', 'Known')), bar(sh.aw ?? 1, 'var(--isl-gold)'), h('small', 'isl-dim', `${Math.round((sh.aw ?? 1) * 100)}%`));
      bars.append(f1, f2, f3);
      r.append(bars);
      const area = shopArea(s, b);
      r.append(h('small', `isl-scm-area ${area.rivals.length || area.mine ? 'is-warn' : ''}`, t(`近くの家 ${area.homes}・競合 ${area.rivals.length}・片道 ${area.way.days.toFixed(1)} 日${area.mine ? `・自社の店と近い` : ''}`, `${area.homes} homes · ${area.rivals.length} rivals · ${area.way.days.toFixed(1)} d${area.mine ? ' · near own shop' : ''}`)));
      r.addEventListener('click', () => openShop(ctx, b.uid));
      shopRows.append(r);
    }
    flow.append(card('sell', shops.map((b) => assignSlot(DEF[b.id].name, 'shop', s.shops[b.uid].staff, b.uid)), [shopRows]));
    flow.append(h('div', 'isl-scm-end', t(`今月 ${STAGE.sell.what} ${sold} 個・${money(monthRevenue(s))}`, `${sold} ${STAGE.sell.what} this month · ${money(monthRevenue(s))}`)));
    body.append(flow);
  });
}
