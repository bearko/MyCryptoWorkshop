/**
 * 地図のマスを押したときの吹き出しの中身：名前・説明・建築者・所有者。
 * 自社の建物はデータと移転・撤去・設備投資、他社の店は調査（段階的にデータが分かる）。
 */
import { t } from '../../i18n';
import { DEF } from '../defs';
import { INTEL, P1B, PRODUCT, STORE, rivalDef, sku, skuParts } from './data';
import { permitFee, permitLock, presentLock, runLock, sessionSec, siteProgress, siteTopic, topicProgress, topicsOf, wasteAt, wasteName, extName, gateToll, invLv, isGate, poolCap, poolUsed, allowedDirs, assign, demolish, ground, intelLv, moveCost, occupant, oneWay, myShops, refundOf, shopArea, sidePay, speed, staffOf, storageCap, type P1State, type PBuilding } from './model';
import { pickHero } from './heroui';
import { investList, openBuy, openShop, openWorkshop, pickClerk, rivalName, shopView, type Ctx } from './screens';
import { bar, btn, h, heroIcon, heroName, money, skuIcon, skuName } from './ui';
import { canPresent, chiefOf, digMet, isChiefHome } from './digmeet';
import { extIcon } from './digui';
import { DEEP_LOCK, standing } from './digview';

export interface TileHooks {
  /** 移転先を選ぶモードへ */
  move: (uid: number) => void;
  /** このマスに建てる（建築の帯を開く） */
  buildHere: (i: number, j: number) => void;
  close: () => void;
  /** 中身を作り直す */
  redraw: () => void;
  /** 関所の通行料を払う */
  gate: () => void;
  /** ランドマップを開く */
  land: () => void;
  /** 荒れ地 k で発掘作業（15 秒）を始める */
  dig?: (k: number) => void;
  /** 荒れ地 k の発掘許可を申請する */
  permit?: (k: number) => void;
  /** 研究ノートを開く */
  notes?: () => void;
  /** 町の長に研究成果を発表する */
  present?: () => void;
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
  station: t('列車が止まる駅。人の行き来がいちばん多く、駅の近くのお店にはお客さんがたくさん来ます。', 'The train station, the busiest spot in the area.'),
  park: t('住民の憩いの場。休日は家族連れでにぎわいます。', 'Where residents relax. Busy with families on holidays.'),
  police: t('エリアの安全を守る交番。', 'The police box that keeps the area safe.'),
  logistics: t('工房からトラックの定期便で商品を運び、近くのお店へ荷車で届ける物流拠点。工房から遠いお店の便が速くなります。', 'A hub: a truck shuttles goods here from the workshop, and carts deliver to nearby shops. Speeds up runs to far shops.'),
};
const HOME = t('エリアの住民が暮らす家。住民は近いお店ほどよく行きます（集合住宅は人が多い）。', 'Homes of the area’s residents. They shop at nearby stores (apartments hold more people).');

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
    if (isGate(b)) return { title: t('関所', 'Gate'), body: gate(s, body, hooks) };
    if (digMet(s) && isChiefHome(s, b)) return { title: t('町の長の家', 'Town head’s house'), body: chiefPop(s, body, hooks) };
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

/** 町の長（セクター長）の家：お題の進み・研究成果の発表（そろっていなければ押せず、理由） */
function chiefPop(s: P1State, body: HTMLElement, hooks: TileHooks): HTMLElement {
  const chief = chiefOf(s.dig!.sector)!;
  const who = h('div', 'isl-row isl-chief-who');
  who.append(heroIcon(chief, 64), h('b', '', t(`町の長 ${heroName(chief)}`, `Town head ${heroName(chief)}`)));
  body.append(who, h('p', '', t('この町の長が住む家。町の荒れ地から「お題」の遺物を全部掘り出したら、ここで研究成果を発表しよう。上のランクの調査依頼状がもらえる。', 'Home of the town head. Dig up every target relic from this town’s wastelands, then present your findings here for a higher-rank survey request.')));
  const [a, n] = topicProgress(s);
  const row = h('div', 'isl-stock');
  for (const id of topicsOf(s.dig!.sector)) {
    const got = s.dig!.topics.includes(id);
    const c = h('span', `isl-chip isl-chief-topic ${got ? '' : 'is-unknown'}`);
    c.append(extIcon(id, 32), h('small', '', got ? extName(id) : t('？？？', '???')));
    row.append(c);
  }
  body.append(h('h4', '', t(`お題 ${a} / ${n}`, `Targets ${a} / ${n}`)), row);
  const acts = h('div', 'isl-row isl-pop-acts');
  const lock = presentLock(s);
  const go = btn(lock === 'done' ? t('発表済み', 'Presented') : t('📜 研究成果を発表する', '📜 Present findings'), () => hooks.present?.(), canPresent(s) ? 'is-on is-guide' : '');
  go.disabled = !canPresent(s);
  acts.append(go);
  body.append(acts);
  if (lock === 'not-yet') body.append(h('small', 'isl-warn', t(`お題がそろったら発表できる（あと ${n - a} つ）`, `Present once all targets are found (${n - a} to go)`)));
  else if (lock === 'done') body.append(h('small', 'isl-dim', t('このセクタの研究成果は発表済み（調査依頼状を受け取った）。', 'Already presented here (survey request received).')));
  return body;
}

/**
 * 荒れ地（未開拓エリア）の吹き出し：名前・許可の有無・掘った割合・お題の気配・ボタン
 * （許可が無い：📜 発掘許可を申請する／許可がある：⛏ 発掘する（15 秒）・📖 研究ノート／掘りきった：復興は近日）。
 * 発掘との出会いの前は「まだ発掘許可がない」だけ（チュートリアルの案内の邪魔をしない）
 */
function wastePop(s: P1State, k: number, body: HTMLElement, hooks: TileHooks): HTMLElement {
  const st = s.dig!.sites[k];
  const met = digMet(s);
  const state = st.done ? t('掘りきった', 'Fully dug') : st.permit ? t('発掘許可あり', 'Permit granted') : t('発掘許可なし', 'No permit');
  body.append(meta([[t('所有者', 'Owner'), t('Lime の国', 'Kingdom of Lime')], [t('状態', 'Status'), state]]));
  body.append(h('p', '', t('Lime が復興を進めている荒れ地。国の発掘許可をもらって掘りきると、建物を建てられるようになる。栄えていた頃の Lime の遺物が眠っている。', 'A wasteland Lime is reviving. Dig it out with a national permit and it becomes buildable. Relics of Lime’s golden age lie beneath.')));
  if (!met) {
    body.append(h('p', 'isl-dim', t('まだ発掘許可がない。', 'No dig permit yet.')));
    return body;
  }
  const grid = h('div', 'isl-pop-grid');
  stat(grid, t('掘った割合', 'Dug'), `${Math.round(siteProgress(s, k) * 100)}%`);
  const tp = siteTopic(s, k);
  if (tp !== 'none') stat(grid, t('お題', 'Target'), tp === 'found' ? t('見つけ済み', 'Found') : t('？ 何かが眠っている気配', '? Something sleeps here'), tp === 'found' ? '' : 'isl-gold');
  // 常駐（自動化）：作業していない日も、この荒れ地を発掘隊が掘っている
  const sd = standing(s);
  if (sd && sd.site === k && !s.digRun) stat(grid, t('発掘隊', 'Dig crew'), t(`常駐中：1 日 ${sd.perDay} 打`, `Standing: ${sd.perDay} strikes/day`), 'isl-good');
  body.append(grid);
  const acts = h('div', 'isl-row isl-pop-acts');
  if (st.done) {
    const b = btn(t('掘りきった（復興は近日）', 'Fully dug (revival coming soon)'), () => undefined);
    b.disabled = true;
    acts.append(b);
  } else if (!st.permit) {
    const fee = permitFee(s);
    const lock = permitLock(s, k);
    const b = btn(fee > 0 ? t(`📜 発掘許可を申請する（${money(fee)}）`, `📜 Apply for a dig permit (${money(fee)})`) : t('📜 発掘許可を申請する（無料）', '📜 Apply for a dig permit (free)'), () => hooks.permit?.(k), `isl-pop-permit ${lock ? '' : 'is-on'}`);
    b.disabled = !!lock;
    acts.append(b);
    body.append(acts);
    if (lock === 'money') body.append(h('small', 'isl-bad', t(`あと ${money(fee - s.money)}`, `${money(fee - s.money)} short`)));
    else body.append(h('small', 'isl-dim', t('国の役所に申請する。一度もらえば、何度でも掘れる（セクタの 1 か所目は無料）。', 'Apply at the national office. Once granted, dig as often as you like (a sector’s first permit is free).')));
    return body;
  } else {
    const meet = (s.flags.digMeet === 'tap' || (s.flags.digMeet === 'open' && !s.digRun)) && runLock(s, k) === null;
    const sec = sessionSec(s);
    const go = btn(t(`⛏ 発掘する（${sec} 秒）`, `⛏ Dig (${sec} s)`), () => hooks.dig?.(k), `isl-pop-dig is-on ${meet ? 'is-guide' : ''}`);
    const rl = runLock(s, k);
    go.disabled = rl !== null;
    acts.append(go);
    // いまの許可で掘れるマスが残っていない：深い層の許可が要る
    if (rl === 'deep') body.append(h('small', 'isl-warn', DEEP_LOCK()));
    if (hooks.notes) acts.append(btn(t('📖 研究ノート', '📖 Notebook'), () => hooks.notes?.()));
    if (s.monthPause) body.append(h('small', 'isl-warn', t('発掘を始めると、次の月が始まるよ（作業のあいだは時間が流れる）。', 'Digging starts the next month (time flows while you dig).')));
  }
  body.append(acts);
  return body;
}

/** 関所：通行料を払うと開通して、次のランドセクタへ行ける */
function gate(s: P1State, body: HTMLElement, hooks: TileHooks): HTMLElement {
  body.append(meta([[t('管理者', 'Keeper'), t('ランドの自治体', 'Land government')], [t('この先', 'Beyond'), t('となりのランドセクタ', 'Next land sector')]]));
  body.append(h('p', '', t('ランドのふちにある関所。この先は、まだ見ぬとなりのランドセクタです。まとまった通行料を納めると開通し、次のセクタへ進めるようになります。', 'A gate at the edge of the land. Beyond lies the next land sector. Pay the toll to open it and move on.')));
  if (s.gateOpen) {
    body.append(h('p', 'isl-gold', t('開通済み！ 関所の先のセクタは、ランドマップから行けます。', 'Open! Reach the sectors beyond from the land map.')));
    const row = h('div', 'isl-row');
    row.append(btn(t('ランドマップを開く', 'Open the land map'), () => hooks.land(), 'is-on'));
    body.append(row);
    return body;
  }
  const toll = gateToll(s);
  const grid = h('div', 'isl-pop-grid');
  stat(grid, t('通行料', 'Toll'), money(toll), 'isl-gold');
  stat(grid, t('資金', 'Funds'), money(s.money));
  body.append(grid);
  body.append(h('p', 'isl-dim', t('通行料は、このエリアで 1 位の会社のひと月の売上くらい。エリア 1 位を取れるくらい稼げたら、開けられます。', 'The toll is about one month of sales of the #1 company here. Once you earn like the area leader, you can open it.')));
  const row = h('div', 'isl-row');
  const pay = btn(t(`${money(toll)} を払って開通する`, `Pay ${money(toll)} to open`), () => hooks.gate(), 'is-on');
  pay.disabled = s.money < toll;
  row.append(pay);
  body.append(row);
  if (s.money < toll) body.append(h('small', 'isl-dim', t(`あと ${money(toll - s.money)} 足りません。`, `${money(toll - s.money)} short.`)));
  return body;
}

function empty(s: P1State, i: number, j: number, body: HTMLElement, hooks: TileHooks) {
  const wk = wasteAt(s, i, j);
  if (wk >= 0 && s.dig) return { title: wasteName(s.dig.sector, wk), body: wastePop(s, wk, body, hooks) };
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
  const redo = () => {
    ctx.save();
    ctx.refresh();
    hooks.redraw();
  };
  // お店：いちばん上に店内の様子（店員・主力商品が決まっていなければ、その場で決める枠）
  if (kind === 'shop' && b.left <= 0 && s.shops[b.uid]) body.append(shopView(ctx, b.uid, redo));
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
    if (open) stat(grid, t('状態', 'Status'), t('営業中', 'Open'), 'is-wide');
    else {
      // 休業中：理由のすぐ横に、直すボタン
      const c = h('div', 'isl-pop-stat is-wide is-bad isl-pop-act');
      const txt = h('div');
      txt.append(h('small', '', t('状態', 'Status')), h('b', '', st?.resting ? t('休業中（店員が休憩中）', 'Closed (clerk resting)') : t('休業中（売り場に人がいません）', 'Closed (nobody on the floor)')));
      c.append(txt, btn(t('ヒーローを配置', 'Assign a hero'), () => pickClerk(ctx, b.uid, redo), 'is-on'));
      grid.append(c);
    }
    if (sh) {
      stat(grid, t('今月の売上', 'Sales this month'), money(sh.rev));
      stat(grid, t('今月の粗利率', 'Gross margin'), rate(sh.rev, sh.cost));
      stat(grid, t('先月の売上', 'Last month'), sh.last ? money(sh.last.rev) : '—');
      stat(grid, t('先月の利益率', 'Last month margin'), sh.last ? rate(sh.last.rev, sh.last.cost) : '—');
      // 商圏：近くの家・競合・自社の店、工房（拠点）からの片道
      const area = shopArea(s, b);
      stat(grid, t('近くの家', 'Homes nearby'), t(`${area.homes} 軒`, `${area.homes}`));
      stat(grid, t('近くの競合', 'Rivals nearby'), area.rivals.length ? area.rivals.map((r) => rivalName(r)).join(t('・', ', ')) : t('なし', 'None'), area.rivals.length ? 'is-bad' : '');
      stat(grid, t('工房から', 'From workshop'), area.way.from && area.way.from.id !== 'workshop' ? t(`片道 ${area.way.days.toFixed(1)} 日（物流拠点から）`, `${area.way.days.toFixed(1)} d (via hub)`) : t(`片道 ${area.way.days.toFixed(1)} 日`, `${area.way.days.toFixed(1)} d one way`), area.way.days > 2.5 ? 'is-bad' : '');
      if (area.mine) stat(grid, t('近くの自社の店', 'Own shops nearby'), t(`${area.mine} 軒（お客さんを取り合う）`, `${area.mine} (they share customers)`), 'is-bad');
      body.append(grid);
      const goods = h('div', 'isl-stock');
      sh.shelves.forEach((x) => {
        if (!x) return;
        const c = h('span', 'isl-chip');
        c.append(skuIcon(x, 24), h('small', '', t(`${skuName(x)} 棚 ${sh.shelf[x] ?? 0}・裏 ${sh.storage[x] ?? 0}`, `${skuName(x)} shelf ${sh.shelf[x] ?? 0}, back ${sh.storage[x] ?? 0}`)));
        goods.append(c);
      });
      if (!goods.childElementCount) goods.append(h('small', 'isl-warn', t('並べる商品が決まっていません', 'No product chosen')));
      body.append(goods, h('small', 'isl-dim', t(`裏に置ける数 ${storageCap(b, s)}・利益率は維持費も含めた月の数字（今月の粗利率は素材代とアルバイト代だけ）`, `Backroom ${storageCap(b, s)}. Last month’s margin includes upkeep; this month’s counts materials and part-timers only.`)));
    }
  } else if (kind === 'depot') {
    const served = myShops(s).filter((x) => oneWay(s, x).from?.uid === b.uid);
    stat(grid, t('ここから運ぶお店', 'Shops served from here'), served.length ? served.map((x) => DEF[x.id].name).join(t('・', ', ')) : t('なし（工房からのほうが近い）', 'None (the workshop is closer)'), 'is-wide');
    body.append(grid, h('small', 'isl-dim', t('工房からここまではトラックの定期便で速く運び、ここから近くのお店へ荷車で届けます。遠くにお店を出したら、そのそばに建てましょう。', 'A truck shuttles goods here from the workshop; carts deliver from here to nearby shops. Build one near your far shops.')));
  } else if (kind === 'warehouse') {
    stat(grid, t('置き場所（全体）', 'Storage (total)'), t(`${poolUsed(s)} / ${poolCap(s)} 個`, `${poolUsed(s)} / ${poolCap(s)}`), 'is-wide');
    stat(grid, t('この倉庫', 'This warehouse'), t(`${STORE.warehouse + 100 * invLv(b, 'rack')} 個`, `${STORE.warehouse + 100 * invLv(b, 'rack')}`), 'is-wide');
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
  else {
    // チュートリアル：建物の中の画面は、ここから開くと覚えてもらう
    const step = ctx.step?.();
    const guide = step === 'craft' && kind === 'workshop';
    acts.append(btn(kind === 'workshop' ? t('工房を開く', 'Open workshop') : t('お店を開く', 'Open shop'), () => (kind === 'workshop' ? openWorkshop(ctx) : openShop(ctx, b.uid)), guide ? 'is-on is-guide' : 'is-on'));
  }
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
  if (kind === 'shop' || kind === 'workshop' || kind === 'warehouse') body.append(h('h4', '', t('設備投資', 'Capital investment')), investList(ctx, b, hooks.redraw));
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
  const def = rivalDef(rid);
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
    row.append(
      btn(t('ヒーローを調査に出す', 'Send a hero to research'), () =>
        pickHero(ctx.root, s, {
          title: t(`${company}を調査する`, `Research ${company}`),
          task: 'intel',
          current: null,
          onPick: (v) => {
            if (v == null) return;
            assign(s, v, 'intel', rid);
            ctx.toast(t(`${heroName(v)}が${company}の調査を始めました`, `${heroName(v)} started researching ${company}`));
            ctx.save();
            ctx.refresh();
            hooks.redraw();
          },
        }),
      ),
    );
    box.append(row, h('small', 'isl-dim', t('調査は INT と AGI が高いヒーローが得意です。調査中はほかの仕事をしません。', 'High INT and AGI heroes research best. They do nothing else meanwhile.')));
  }
  body.append(box);

  // 出店の作戦：近くで同じ商品を売ると、このお店のお客さんを取り合える
  box.append(h('small', 'isl-dim', t('このお店の近くで同じ商品を売ると、お客さんを取り合えます（このお店の売上も減ります）。離れた場所に出せば、取り合わずに新しいお客さんに届きます。', 'Selling the same items near this store means fighting over its customers (its sales drop too). A shop farther away reaches new customers instead.')));

  // 他店でバイト：ヒーローをこのお店で働かせて、日給をもらう
  const side = h('div', 'isl-intel');
  side.append(h('h4', '', t('このお店でバイト', 'Work part-time here')));
  const workers = s.staff.filter((x) => x.task === 'side' && x.target === rid);
  for (const w of workers) {
    const r = h('div', 'isl-row');
    r.append(h('span', '', t(`${heroName(w.hero)}がバイト中（日給 ${money(sidePay(w))}）`, `${heroName(w.hero)} working (${money(sidePay(w))}/day)`)), btn(t('呼び戻す', 'Call back'), () => {
      assign(s, w.hero, null);
      ctx.save();
      ctx.refresh();
      hooks.redraw();
    }));
    side.append(r);
  }
  side.append(
    btn(t('ヒーローをバイトに出す', 'Send a hero to work here'), () => sendSide(ctx, rid, company, hooks.redraw), 'is-on'),
    h('small', 'isl-dim', t('日給がもらえ、ときどき能力が上がります。バイト中は自社の仕事をしません。', 'Earns a daily wage and sometimes raises a stat. They skip company work meanwhile.')),
  );
  body.append(side);

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

/** ヒーローを他社のお店へバイトに出す（引き出しで選ぶ） */
export function sendSide(ctx: Ctx, rid: string, company: string, done: () => void) {
  const s = ctx.s();
  pickHero(ctx.root, s, {
    title: t(`${company}でバイト`, `Part-time at ${company}`),
    task: 'side',
    current: null,
    note: t('販売が得意なヒーローほど日給が高くなります。待機中のヒーローを出すと、自社の仕事が空きません。', 'Better sellers earn more. Sending a free hero keeps your own jobs covered.'),
    onPick: (v) => {
      if (v == null) return;
      assign(s, v, 'side', rid);
      const st = staffOf(s, v);
      ctx.toast(t(`${heroName(v)}が${company}でバイトを始めました（日給 ${money(st ? sidePay(st) : 0)}）`, `${heroName(v)} started part-time at ${company} (${money(st ? sidePay(st) : 0)}/day)`));
      ctx.save();
      ctx.refresh();
      done();
    },
  });
}
