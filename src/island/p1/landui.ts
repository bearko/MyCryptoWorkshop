/**
 * 会社ぜんたいの画面：ランドマップ（関所の先のセクタ・セクタマネージャー）・決算書（四半期の P/L・B/S）・ブランド力。
 * docs/ISLAND_PHASE1.md「ランドマップとセクタ」「決算書」「ブランド力」。
 */
import { t } from '../../i18n';
import { BRAND, MANAGER, SECTORS, SKILLS, TIERS, aptitude, type SectorDef } from './data';
import { CAPITAL, brandPull, emptyLedger, managerRate, pl, quarters, sectorDef, sectorState, sumLedger, tierLabel, type Balance, type Ledger, type SectorState } from './company';
import { hasBusiness, moveTo, recOf, type MoveErr } from './land';
import { balance, date, staffOf, type P1State } from './model';
import { pickHero, rankEl } from './heroui';
import { after, open, type Ctx } from './screens';
import { btn, h, heroIcon, heroName, money } from './ui';

// ---------------------------------------------------------------- ランドマップ

/** 地図の上の道（セクタどうしのつながり） */
const ROADS: [string, string][] = [
  ['c1', 'c2'],
  ['c1', 'c3'],
  ['c2', 'u1'],
  ['c3', 'u2'],
  ['c1', 'u2'],
  ['u1', 'r1'],
  ['u2', 'r1'],
  ['u1', 'e1'],
  ['r1', 'l1'],
  ['e1', 'l1'],
];

const TIER_NOTE: Record<SectorDef['tier'], string> = {
  C: t('いまと同じくらいの広さと商売敵。出店許可申請の費用も軽い。', 'About the same size and rivals as now. The permit is cheap.'),
  U: t('地図が広く、商売敵の規模が大きい。Common の商品は相手にされにくいので、エクステのランクアップが鍵（SCM の強化を楽しむセクタ）。', 'A wider map with bigger rivals. Common goods barely sell here, so ranking up your extensions is key.'),
  R: t('他社のお店が乱立する、栄えた市場。他店から客を奪う出店計画としのぎの削り合い（準備中）。', 'A crowded, thriving market where you win customers from rivals (coming soon).'),
  E: t('他社を M&A で買収できるセクタ（準備中）。', 'Acquire rivals through M&A (coming soon).'),
  L: t('ブランド力で売る総力戦。街そのものを作り変える（準備中）。', 'A brand-power showdown where you reshape the city (coming soon).'),
};

let sel: string | null = null;

const stateText = (s: P1State, d: SectorDef, st: SectorState): string => {
  switch (st) {
    case 'here':
      return t('いまここ', 'You are here');
    case 'mine': {
      const rec = s.land?.recs[d.id];
      const m = rec?.manager != null ? heroName(rec.manager) : null;
      return m ? t(`マネージャー：${m}`, `Manager: ${m}`) : t('出店済み', 'Opened');
    }
    case 'open':
      return t(`出店許可 ${money(d.fee)}`, `Permit ${money(d.fee)}`);
    case 'soon':
      return t('準備中', 'Coming soon');
    case 'locked':
      return t('まだ開放されていない', 'Locked');
    case 'cloud':
      return t('雲に覆われている', 'Under clouds');
  }
};

/** 開放の条件（Rare など） */
function needText(s: P1State, d: SectorDef): string {
  if (!d.need) return '';
  const have = (s.land?.mine ?? []).filter((x) => sectorDef(x).tier === d.need!.tier).length;
  const tier = tierLabel(d.need.tier);
  return t(`${tier}を ${d.need.n} 以上開拓で開放（いま ${have}）`, `Opens after ${d.need.n}+ ${tier}s (now ${have})`);
}

const ERR: Record<MoveErr, string> = {
  'no-land': t('関所を開くと、ほかのセクタへ行けます', 'Open the gate to reach other sectors'),
  here: t('いまいるセクタです', 'You are already here'),
  cloud: t('雲に覆われていて、まだ行けません', 'Still under clouds'),
  locked: t('まだ開放されていません', 'Not unlocked yet'),
  soon: t('このセクタは準備中です', 'This sector is coming soon'),
  money: t('資金が足りません', 'Not enough funds'),
  manager: t('セクタマネージャーを選んでください', 'Pick a sector manager'),
  busy: t('そのヒーローは、ほかのセクタのマネージャーです', 'That hero manages another sector'),
};

/** 移る：いまのセクタに建物があれば、まずマネージャーを選ぶ */
function startMove(ctx: Ctx, target: string) {
  const s = ctx.s();
  const cur = sectorDef(s.land!.cur);
  const go = (hero: number | null) => {
    const fresh = sectorState(s.land!, target) === 'open';
    const e = moveTo(s, target, hero);
    if (e) {
      ctx.toast(ERR[e]);
      ctx.sfx?.('error');
      return;
    }
    sel = null;
    ctx.save();
    ctx.moved?.(target, fresh, hero);
  };
  if (!hasBusiness(s)) return go(null);
  pickHero(ctx.root, s, {
    title: t(`「${cur.name}」のセクタマネージャー`, `Manager for ${cur.name}`),
    task: 'manager',
    current: null,
    note: t(
      '離れているあいだ、このセクタの運営を任せるヒーローを選びます。能力値の合計が高いほど売上が上がりやすく、低いと下振れします（赤字もあります）。ほかのヒーローは一緒に移ります。',
      'Pick the hero who runs this sector while you are away. Higher total stats tend to raise sales; low ones can mean losses. Everyone else comes with you.',
    ),
    onPick: (hero) => hero != null && go(hero),
  });
}

/** セクタのランクの札 */
function tierPill(tier: SectorDef['tier']): HTMLElement {
  const p = h('span', `isl-tier is-${tier.toLowerCase()}`, tier);
  p.style.setProperty('--tc', TIERS[tier].color);
  return p;
}

export function openLand(ctx: Ctx) {
  open(ctx, t('ランドマップ', 'Land map'), (body) => {
    const s = ctx.s();
    const land = s.land;
    if (!land) {
      body.append(h('p', 'isl-dim', t('ランドのふちの関所を開くと、ほかのランドセクタへ行けるようになります。', 'Open the gate at the edge of the land to reach other sectors.')));
      return;
    }
    sel ??= land.cur;
    const intro = h('p', 'isl-dim', t('いまいるランドの全体図。ほかのセクタに出店すると、いまのセクタはセクタマネージャーが運営し、利益の一部が本社に入ります。', 'The whole land. When you open in another sector, a sector manager runs this one and sends part of the profit to HQ.'));
    const map = h('div', 'isl-land');
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 100 100');
    svg.setAttribute('preserveAspectRatio', 'none');
    svg.classList.add('isl-land-svg');
    // 島の形
    const isle = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    isle.setAttribute('d', 'M8,62 C2,40 14,22 30,20 C40,6 62,4 74,14 C90,16 98,34 92,48 C98,64 88,84 70,90 C54,98 30,96 18,88 C6,82 4,72 8,62 Z');
    isle.setAttribute('class', 'isl-land-isle');
    svg.append(isle);
    for (const [a, b] of ROADS) {
      const A = sectorDef(a).at;
      const B = sectorDef(b).at;
      const l = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      l.setAttribute('x1', `${A[0]}`);
      l.setAttribute('y1', `${A[1]}`);
      l.setAttribute('x2', `${B[0]}`);
      l.setAttribute('y2', `${B[1]}`);
      const on = land.mine.includes(a) && land.mine.includes(b);
      l.setAttribute('class', `isl-land-road ${on ? 'is-on' : ''}`);
      svg.append(l);
    }
    map.append(svg);
    // 雲（Epic・Legendary のあたり）
    for (const d of SECTORS.filter((x) => x.cloud && sectorState(land, x.id) === 'cloud')) {
      const c = h('div', 'isl-land-cloud');
      c.style.left = `${d.at[0]}%`;
      c.style.top = `${d.at[1]}%`;
      map.append(c);
    }
    for (const d of SECTORS) {
      const st = sectorState(land, d.id);
      const n = h('button', `isl-land-node is-${st} ${sel === d.id ? 'is-sel' : ''}`);
      n.type = 'button';
      n.style.left = `${d.at[0]}%`;
      n.style.top = `${d.at[1]}%`;
      n.style.setProperty('--tc', TIERS[d.tier].color);
      n.append(tierPill(d.tier), h('b', '', st === 'cloud' ? '???' : d.name), h('small', '', stateText(s, d, st)));
      if (st === 'here') n.append(h('span', 'isl-land-pin', '📍'));
      if (st === 'locked') n.append(h('span', 'isl-land-lock', '🔒'));
      // マウスを乗せると開放の条件（PC）
      const tipText = st === 'locked' ? needText(s, d) : st === 'cloud' ? t('雲に覆われていて、まだ行けない', 'Hidden under clouds') : '';
      if (tipText) n.append(h('span', 'isl-land-tip', tipText));
      n.addEventListener('click', () => {
        sel = d.id;
        ctx.sfx?.('tap');
        after(ctx);
      });
      map.append(n);
    }
    body.append(intro, map, detail(ctx, s, sel));
  });
}

function detail(ctx: Ctx, s: P1State, id: string): HTMLElement {
  const land = s.land!;
  const d = sectorDef(id);
  const st = sectorState(land, id);
  const T = TIERS[d.tier];
  const box = h('div', 'isl-card2 isl-land-detail');
  const top = h('div', 'isl-row');
  top.append(tierPill(d.tier), h('b', 'isl-land-dname', st === 'cloud' ? '???' : d.name), h('small', 'isl-dim', tierLabel(d.tier)));
  box.append(top);
  if (st === 'cloud') {
    box.append(h('p', '', t('雲に覆われていて、まだ移動できない。', 'Covered in clouds. You cannot go there yet.')));
    return box;
  }
  box.append(h('p', '', TIER_NOTE[d.tier]));
  const grid = h('div', 'isl-land-stats');
  const stat = (k: string, v: string) => {
    const c = h('div', 'isl-pop-stat');
    c.append(h('small', '', k), h('b', '', v));
    grid.append(c);
  };
  stat(t('地図', 'Map'), t(`${T.n}×${T.n} マス`, `${T.n}×${T.n}`));
  stat(t('商売敵の規模', 'Rivals'), `×${T.rival}`);
  stat(t('お客さん', 'Customers'), `×${T.demand}`);
  stat(t('Common の売れやすさ', 'Common goods'), `×${T.commonPull}`);
  box.append(grid);
  const row = h('div', 'isl-row');
  if (st === 'here') {
    box.append(h('p', 'isl-good', t('いまこのセクタを経営しています。', 'You are running this sector now.')));
  } else if (st === 'open') {
    const b = btn(t(`出店する（出店許可申請 ${money(d.fee)}）`, `Open here (permit ${money(d.fee)})`), () => startMove(ctx, id), 'is-on');
    b.disabled = s.money < d.fee;
    row.append(b);
    if (s.money < d.fee) box.append(h('small', 'isl-warn', t(`あと ${money(d.fee - s.money)} 足りません。`, `${money(d.fee - s.money)} short.`)));
    if (hasBusiness(s)) box.append(h('small', 'isl-dim', t('いまのセクタは、セクタマネージャーに任せます（次に選びます）。', 'You will pick a manager for the current sector next.')));
  } else if (st === 'mine') {
    box.append(managerBox(ctx, s, id));
    row.append(btn(t('このセクタへ移動する', 'Go to this sector'), () => startMove(ctx, id), 'is-on'));
  } else if (st === 'locked') {
    box.append(h('p', 'isl-warn', needText(s, d)));
  } else if (st === 'soon') {
    box.append(h('p', 'isl-dim', t('開放されました！ このセクタの遊びは準備中です。', 'Unlocked! This sector is coming soon.')));
  }
  if (row.childElementCount) box.append(row);
  return box;
}

/** マネージャーが運営しているセクタ：担当・先月の結果・投資の割合 */
function managerBox(ctx: Ctx, s: P1State, id: string): HTMLElement {
  const rec = recOf(s, id);
  const box = h('div', 'isl-land-mgr');
  if (!rec.snap) {
    box.append(h('p', 'isl-dim', t('まだお店がありません。', 'No business here yet.')));
    return box;
  }
  const m = rec.manager != null ? staffOf(s, rec.manager) : null;
  const who = h('div', 'isl-row');
  if (m && m.task === 'manager') {
    const apt = aptitude(m.stats, 'manager');
    who.append(heroIcon(m.hero, 44), h('b', '', heroName(m.hero)), rankEl(apt), h('small', 'isl-dim', t(`売上の目安 ×${managerRate(apt).toFixed(2)}`, `Sales ×${managerRate(apt).toFixed(2)}`)));
  } else who.append(h('b', 'isl-warn', t('マネージャー不在（売上が大きく下がります）', 'No manager (sales drop a lot)')));
  who.append(
    btn(t('替える', 'Change'), () =>
      pickHero(ctx.root, s, {
        title: t(`「${sectorDef(id).name}」のセクタマネージャー`, `Manager for ${sectorDef(id).name}`),
        task: 'manager',
        current: null,
        onPick: (hero) => {
          if (hero == null) return;
          const old = rec.manager != null ? staffOf(s, rec.manager) : null;
          if (old && old.task === 'manager' && old.target === id) {
            old.task = null;
            old.target = null;
          }
          const nx = staffOf(s, hero);
          if (!nx) return;
          if (nx.task) ctx.toast(t('いまの仕事を外して、マネージャーにしました', 'Moved from their current job'));
          nx.task = 'manager';
          nx.target = id;
          // ほかの仕事の枠からは外す
          for (const sl of s.slots) if (sl.worker === hero) sl.worker = null;
          for (const sh of Object.values(s.shops)) if (sh.staff === hero) sh.staff = null;
          rec.manager = hero;
          after(ctx);
        },
      }),
    ),
  );
  box.append(who);
  if (rec.base) box.append(h('small', 'isl-dim', t(`離れたときの月の売上 ${money(rec.base.rev)}・投資の合計 ${money(rec.capital)}`, `Sales when you left ${money(rec.base.rev)} · invested ${money(rec.capital)}`)));
  else box.append(h('small', 'isl-warn', t('離れる前に月の締めが無かったので、売上はまだ立ちません。戻って 1 か月営業しましょう。', 'No monthly close before you left, so it earns nothing yet. Come back and run it for a month.')));
  const last = rec.log[rec.log.length - 1];
  if (last) {
    const r = h('div', 'isl-land-stats');
    const stat = (k: string, v: string, cls = '') => {
      const c = h('div', `isl-pop-stat ${cls}`);
      c.append(h('small', '', k), h('b', '', v));
      r.append(c);
    };
    stat(t('先月の売上', 'Last sales'), money(last.rev));
    stat(t('利益', 'Profit'), money(last.profit), last.profit < 0 ? 'is-bad' : 'is-good');
    stat(t('このセクタへ投資', 'Reinvested'), money(last.invest));
    stat(t('本社へ', 'To HQ'), money(last.toHQ), last.toHQ < 0 ? 'is-bad' : '');
    box.append(r);
  }
  // 投資の割合
  const inv = h('div', 'isl-row isl-land-invest');
  inv.append(h('small', 'isl-dim', t('利益のうち、このセクタへ投資する割合', 'Share of profit reinvested here')));
  for (const v of MANAGER.choices) {
    const b = btn(`${Math.round(v * 100)}%`, () => {
      rec.invest = v;
      after(ctx);
    }, rec.invest === v ? 'is-on' : '');
    inv.append(b);
  }
  box.append(inv, h('small', 'isl-dim', t(`投資 1 G で、このセクタの月の売上が ${MANAGER.roi} G 伸びます（戻ってきたときは、お客さんが増えています）。`, `Each 1 G reinvested raises monthly sales by ${MANAGER.roi} G (and brings more customers when you return).`)));
  return box;
}

// ---------------------------------------------------------------- 決算書（四半期の P/L・B/S）

let qSel: number | null = null;

export function openBooks(ctx: Ctx) {
  open(ctx, t('決算書', 'Financial statements'), (body) => {
    const s = ctx.s();
    const books = s.books;
    const qs = books ? quarters(books) : [];
    // いまの四半期（途中）：締めた月 ＋ 今月のここまで
    const doneMonths = books?.months.length ?? 0;
    const inQ = doneMonths % 3;
    const curL = sumLedger([...(books?.months.slice(doneMonths - inQ).map((x) => x.l) ?? []), books?.cur ?? emptyLedger()]);
    const curQ = Math.floor(doneMonths / 3) + 1;
    const list = [...qs.filter((q) => q.done).map((q) => ({ q: q.q, l: q.l, bs: q.bs, label: t(`第 ${q.q} 四半期`, `Q${q.q}`), done: true })), { q: curQ, l: curL, bs: balance(s) as Balance, label: t(`第 ${curQ} 四半期（途中）`, `Q${curQ} (in progress)`), done: false }];
    if (qSel == null || !list.some((x) => x.q === qSel)) qSel = list[list.length - 1].q;
    body.append(h('p', 'isl-dim', t('会社ぜんたいの決算書（簡易版）。会社の月はゲームの最初から 30 日ごとに締め、3 か月で 1 四半期です。ほかのセクタの利益は「他セクタからの利益」に入ります。', 'Company-wide statements (simplified). Company months close every 30 days from the start; 3 months make a quarter. Profit from managed sectors is listed separately.')));
    const chips = h('div', 'isl-books-chips');
    for (const x of list) chips.append(btn(x.label, () => ((qSel = x.q), after(ctx)), x.q === qSel ? 'is-on' : ''));
    body.append(chips);
    const cur = list.find((x) => x.q === qSel)!;
    const p = pl(cur.l);
    const wrap = h('div', 'isl-books');
    wrap.append(plTable(p), bsTable(cur.bs, s));
    body.append(wrap);
    if (!cur.done) body.append(h('small', 'isl-dim', t(`いまは ${inQ + 1} か月目の途中です。四半期が終わると、マインちゃんが知らせます。`, `Month ${inQ + 1} of this quarter is in progress.`)));
    const d = date(s);
    void d;
  });
}

function row(tbl: HTMLElement, k: string, v: number, cls = '') {
  const r = h('div', `isl-books-row ${cls}`);
  r.append(h('span', '', k), h('b', v < 0 ? 'isl-bad' : '', money(v || 0)));
  tbl.append(r);
}

function plTable(p: ReturnType<typeof pl>): HTMLElement {
  const l: Ledger = p.l;
  const tbl = h('div', 'isl-card2 isl-books-tbl');
  tbl.append(h('h3', '', t('損益計算書（P/L）', 'Income statement (P/L)')));
  row(tbl, t('売上高', 'Sales'), p.sales, 'is-head');
  row(tbl, t('売上原価（素材）', 'Cost of goods (materials)'), -p.cogs, 'is-sub');
  row(tbl, t('売上総利益', 'Gross profit'), p.gross, 'is-sum');
  row(tbl, t('販売費・一般管理費', 'SG&A'), -p.sga, 'is-head');
  row(tbl, t('　給料', '  Wages'), -l.wages, 'is-sub');
  row(tbl, t('　アルバイト', '  Part-timers'), -l.part, 'is-sub');
  row(tbl, t('　維持費', '  Upkeep'), -l.upkeep, 'is-sub');
  row(tbl, t('　宣伝', '  Advertising'), -l.ads, 'is-sub');
  row(tbl, t('営業利益', 'Operating profit'), p.op, 'is-sum');
  row(tbl, t('営業外の収入', 'Other income'), p.nonop, 'is-head');
  row(tbl, t('　他店でバイト', '  Part-time work'), l.side, 'is-sub');
  row(tbl, t('　依頼の報酬', '  Request rewards'), l.other, 'is-sub');
  row(tbl, t('　他セクタからの利益', '  From managed sectors'), l.managed, 'is-sub');
  row(tbl, t('投資・特別な支出', 'Investment & special'), -p.special, 'is-head');
  row(tbl, t('　建物・スキル・設備', '  Buildings, skills, upgrades'), -l.build, 'is-sub');
  row(tbl, t('　通行料・出店許可申請', '  Tolls & permits'), -l.fees, 'is-sub');
  row(tbl, t('当期の利益', 'Net profit'), p.net, 'is-total');
  return tbl;
}

function bsTable(bs: Balance | null, s: P1State): HTMLElement {
  const b = bs ?? balance(s);
  const tbl = h('div', 'isl-card2 isl-books-tbl');
  tbl.append(h('h3', '', t('貸借対照表（B/S）', 'Balance sheet (B/S)')));
  const assets = b.cash + b.stock + b.buildings + b.invest;
  row(tbl, t('資産', 'Assets'), assets, 'is-head');
  row(tbl, t('　現金', '  Cash'), b.cash, 'is-sub');
  row(tbl, t('　在庫（素材・商品）', '  Inventory'), b.stock, 'is-sub');
  row(tbl, t('　建物', '  Buildings'), b.buildings, 'is-sub');
  row(tbl, t('　他セクタへの投資', '  Invested in sectors'), b.invest, 'is-sub');
  row(tbl, t('負債（借入金）', 'Liabilities (loans)'), 0, 'is-head');
  row(tbl, t('純資産', 'Equity'), assets, 'is-head');
  row(tbl, t('　資本金', '  Capital'), CAPITAL, 'is-sub');
  row(tbl, t('　利益剰余金', '  Retained earnings'), assets - CAPITAL, 'is-sub');
  tbl.append(h('small', 'isl-dim', t('建物は買った値段のまま（減価償却なし）。借入はまだありません。', 'Buildings at cost (no depreciation). No loans yet.')));
  return tbl;
}

// ---------------------------------------------------------------- ブランド力

export function openBrand(ctx: Ctx) {
  open(ctx, t('ブランド力', 'Brand power'), (body) => {
    const s = ctx.s();
    const v = s.brand ?? 0;
    const top = h('div', 'isl-card2 isl-brand-top');
    top.append(h('small', 'isl-dim', t('いまのブランド力', 'Brand power')), h('b', 'isl-brand-big', `★ ${v}`), h('small', 'isl-good', t(`売り場の強さ +${Math.round((brandPull(v) - 1) * 100)}%（最大 +${Math.round(BRAND.pullCap * 100)}%）`, `Shop pull +${Math.round((brandPull(v) - 1) * 100)}% (max +${Math.round(BRAND.pullCap * 100)}%)`)));
    body.append(top);
    // ブランド力が要るスキル
    const sk = h('div', 'isl-card2');
    sk.append(h('h3', '', t('ブランド力で開くスキル', 'Skills unlocked by brand')));
    for (const k of SKILLS.filter((x) => x.brand).sort((a, b) => (a.brand ?? 0) - (b.brand ?? 0))) {
      const r = h('div', `isl-brand-skill ${v >= (k.brand ?? 0) ? 'is-on' : ''}`);
      r.append(h('b', '', `★ ${k.brand}`), h('span', '', k.name), h('small', 'isl-dim', k.note));
      sk.append(r);
    }
    body.append(sk);
    const how = h('div', 'isl-card2');
    how.append(h('h3', '', t('上がるとき・下がるとき', 'What moves it')));
    const ul = h('ul', 'isl-brand-how');
    for (const line of [
      t(`ランドセクタで 1 位になる：+${BRAND.sectorTop}（守った月は +${BRAND.stayTop}）`, `#1 in a land sector: +${BRAND.sectorTop} (+${BRAND.stayTop} each month you stay)`),
      t(`順位が上がる：1 つにつき +${BRAND.rankUp}`, `Rank up: +${BRAND.rankUp} per place`),
      t(`依頼を達成：+${BRAND.mission}・アンコモンを開発：+${BRAND.uncommon}・関所を開通：+${BRAND.gate}`, `Request: +${BRAND.mission} · Uncommon: +${BRAND.uncommon} · Gate: +${BRAND.gate}`),
      t(`新しいセクタに出店：Common +${BRAND.enter.C}・Uncommon +${BRAND.enter.U}`, `Open in a new sector: Common +${BRAND.enter.C} · Uncommon +${BRAND.enter.U}`),
      t(`順位が 2 つ以上下がる：1 つにつき −${BRAND.rankDown}`, `Rank falls 2+ places: −${BRAND.rankDown} per place`),
      t(`不祥事が発覚する（妨害工作など。これから）：−${BRAND.scandal}`, `Scandals (sabotage, later): −${BRAND.scandal}`),
    ])
      ul.append(h('li', '', line));
    how.append(ul);
    body.append(how);
    const log = h('div', 'isl-card2');
    log.append(h('h3', '', t('最近の動き', 'Recent changes')));
    if (!s.brandLog?.length) log.append(h('p', 'isl-dim', t('まだありません。最初の売上や依頼の達成で上がります。', 'Nothing yet. Your first sale or request will raise it.')));
    for (const e of s.brandLog ?? []) {
      const r = h('div', 'isl-brand-log');
      r.append(h('b', e.d > 0 ? 'isl-good' : 'isl-bad', `${e.d > 0 ? '+' : ''}${e.d}`), h('span', '', e.why), h('small', 'isl-dim', dayLabel(s, e.day)));
      log.append(r);
    }
    body.append(log);
  });
}

function dayLabel(s: P1State, day: number): string {
  const d = date({ day, open: s.open });
  return d ? t(`${d.year} 年目 ${d.month} 月 ${d.day} 日`, `Y${d.year} M${d.month} D${d.day}`) : t(`${day} 日目`, `Day ${day}`);
}
