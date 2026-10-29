/**
 * 月次報告（ゲームのテンポを作る、月に一度のフィードバックと判断の画面）。
 * 0. 発表：全画面で「N年目・M月の売上」をドラムロールつきでカウントアップ → ポンと跳ねて金貨（売上 0 の月はマインちゃんの一言）
 * 1. 【KPI ①】売上報告：売上・先月比・利益・資金の変化（月初 → 月末）。内訳は折りたたみ。導線：スキルツリー
 * 2. 【KGI】企業ランキング（エリア）：順位と前月比、次の順位までの距離とゴール。ランキング表は折りたたみ（ゴールラインつき）
 * 3. 【KPI ②】月次売上推移：売上（左軸・折れ線）と利益（右軸・棒）。期間の切り替え、押すと吹き出し
 * 4. 【KPI ③】サプライチェーン管理：① 調達 → ② 製造 → ③ 物流 → ④ 販売 の数と詰まり。導線：SCM ダッシュボード
 * スマホ（390×844）では、折りたたみを閉じた状態でスクロールせずに 1 画面に収める。
 * docs/ISLAND_PHASE1.md「月の売上報告」。
 */
import { t } from '../../i18n';
import { assetUrl } from '../../render/images';
import { PRODUCT, TOP_STREAK, sku } from './data';
import { jamOf, type P1State, type Report, type Stage } from './model';
import { open, type Ctx } from './screens';
import { btn, h, money, rich, select, skuIcon } from './ui';

const STAGE_NAME: Record<Stage, string> = { buy: t('① 調達', '① Buy'), craft: t('② 製造', '② Craft'), haul: t('③ 物流', '③ Haul'), sell: t('④ 販売', '④ Sell') };
const STAGE_ICON: Record<Stage, string> = { buy: '🧱', craft: '🔨', haul: '🛒', sell: '🏪' };
/** 段ごとの直し方（ボトルネックのとき） */
const STAGE_HINT: Record<Stage, string> = {
  buy: t('素材が足りていません。調達係を置くか、スキル「調達枠の拡大」「まとめ買い」で仕入れを太くしましょう。', 'Materials are short. Assign a buyer or widen buying with the Bigger quota / Bulk buying skills.'),
  craft: t('作る数が足りていません。作業台を増やす（工房の設備投資）・段取りの改善（スキル）か、製造の得意なヒーローを置きましょう。', 'Crafting is the limit. Add a bench (workshop investment), Better jigs (skill), or put a better crafter on the bench.'),
  haul: t('運ぶ数が足りていません。荷車を増やす・小型トラック（工房の設備投資）、遠いお店には物流拠点を。', 'Hauling is the limit. More carts or a Small truck (workshop investment); a hub for far shops.'),
  sell: t('売れる数が頭打ちです。お店を増やす・棚を増やす（お店の設備投資）・接客の研修や VMD（スキル）や宣伝で、売り場を強くしましょう。', 'Sales are capped. More shops, more shelves (shop investment), customer service training or VMD (skills) or ads strengthen your stores.'),
};
/** スマホ用の短い版（2 行以内） */
const STAGE_HINT_SHORT: Record<Stage, string> = {
  buy: t('素材が足りない。調達係やスキルで仕入れを太く。', 'Short of materials. Add a buyer or buying skills.'),
  craft: t('作る数が足りない。作業台（設備投資）・スキル・職人を。', 'Crafting is short. Benches (investment), skills or a crafter.'),
  haul: t('運ぶ数が足りない。荷車（設備投資）・物流拠点を。', 'Hauling is short. Carts (investment) or a hub.'),
  sell: t('売れる数が頭打ち。お店・棚（設備投資）・宣伝で売り場を強く。', 'Sales are capped. Shops, shelves (investment) or ads.'),
};
/** 段を太くするスキル（スキルツリーの枝） */
const STAGE_BRANCH: Record<Stage, string> = { buy: 'buy', craft: 'craft', haul: 'logi', sell: 'shop' };

/** ゴールの順位（いまはエリア 1 位で固定。セクタのランクで変える余地）。制覇はこれを TOP_STREAK か月続ける */
const GOAL_RANK = 1;

export interface ReportHooks {
  openSkills: (branch?: string) => void;
  openSupply: () => void;
  openRanking: () => void;
  /** 効果音 */
  sfx?: (k: 'sale' | 'win' | 'levelup' | 'check' | 'report' | 'drum' | 'error') => void;
}

/** 通算の月 → 年目と月 */
const ym = (month: number) => ({ year: 1 + Math.floor((month - 1) / 12), month: ((month - 1) % 12) + 1 });

/** 報告のタイトル：「月次報告（1年目・3月）」 */
export function reportTitle(month: number): string {
  const d = ym(month);
  return t(`月次報告（${d.year}年目・${d.month}月）`, `Monthly report (Y${d.year} · M${d.month})`);
}

/** 舞い上がるコイン */
function coins(box: HTMLElement, n: number) {
  for (let k = 0; k < n; k++) {
    const c = h('i', 'isl-rp-coin');
    c.style.setProperty('--x', `${(Math.random() * 2 - 1) * 160}px`);
    c.style.setProperty('--d', `${(Math.random() * 0.5).toFixed(2)}s`);
    c.style.setProperty('--r', `${Math.round(Math.random() * 720 - 360)}deg`);
    box.append(c);
  }
}

/** 12,000 → 12k */
function kfmt(v: number): string {
  const a = Math.abs(v);
  const sgn = v < 0 ? '-' : '';
  if (a >= 1000) {
    const x = a / 1000;
    return `${sgn}${x >= 10 ? Math.round(x) : Math.round(x * 10) / 10}k`;
  }
  return `${sgn}${Math.round(a)}`;
}

// ---------------------------------------------------------------- 推移のグラフ

type Range = 3 | 6 | 12 | 0;
const RANGES: { value: Range; label: string }[] = [
  { value: 3, label: t('3 か月', '3 months') },
  { value: 6, label: t('6 か月', '6 months') },
  { value: 12, label: t('1 年', '1 year') },
  { value: 0, label: t('全期間', 'All') },
];
/** 選んだ期間（このブラウザに覚える） */
let chartRange: Range = (() => {
  try {
    const v = Number(localStorage.getItem('isl.chartRange'));
    return ([3, 6, 12, 0] as number[]).includes(v) && localStorage.getItem('isl.chartRange') != null ? (v as Range) : 6;
  } catch {
    return 6;
  }
})();
function setRange(v: Range) {
  chartRange = v;
  try {
    localStorage.setItem('isl.chartRange', String(v));
  } catch {
    // 覚えられなくても動く
  }
}

const NS = 'http://www.w3.org/2000/svg';
function mk(tag: string, attrs: Record<string, string | number>, text = '') {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  if (text) e.textContent = text;
  return e;
}

function monthLabel(m: number): string {
  const d = ym(m);
  return m > 12 ? t(`${d.year}年 ${d.month}月`, `Y${d.year} M${d.month}`) : t(`${d.month} 月`, `M${d.month}`);
}

/** 売上（左軸・折れ線）と利益（右軸・棒）。押すとその月の吹き出し */
function chart(reports: Report[]): SVGSVGElement {
  const rs = chartRange ? reports.slice(-chartRange) : reports.slice();
  const W = 360;
  const H = 150;
  const padL = 30;
  const padR = 30;
  const padT = 10;
  const padB = 20;
  const plotH = H - padT - padB;
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svg.classList.add('isl-rp-chart');
  const n = Math.max(1, rs.length);
  const maxR = Math.max(1, ...rs.map((r) => r.revenue));
  const hiP = Math.max(1, ...rs.map((r) => r.profit));
  const loP = Math.min(0, ...rs.map((r) => r.profit));
  const step = (W - padL - padR) / n;
  const x = (k: number) => padL + step * (k + 0.5);
  const yR = (v: number) => padT + plotH * (1 - v / maxR);
  const yP = (v: number) => padT + (plotH * (hiP - v)) / (hiP - loP);
  // 目盛り（左＝売上、右＝利益）と薄い横線
  for (const v of [0, maxR / 2, maxR]) {
    svg.append(mk('line', { x1: padL, y1: yR(v), x2: W - padR, y2: yR(v), class: 'isl-rp-grid' }));
    svg.append(mk('text', { x: padL - 4, y: yR(v) + 3, 'text-anchor': 'end', class: 'isl-rp-yl is-l' }, kfmt(v)));
  }
  // 利益が全部赤字の月だけなら、0・中・最小（下）を出す
  const pTicks = hiP > 1 ? [0, hiP / 2, hiP] : [loP, loP / 2, 0];
  for (const v of pTicks) svg.append(mk('text', { x: W - padR + 4, y: yP(v) + 3, 'text-anchor': 'start', class: 'isl-rp-yl is-r' }, kfmt(v)));
  // 利益の 0 の線
  svg.append(mk('line', { x1: padL, y1: yP(0), x2: W - padR, y2: yP(0), class: 'isl-rp-zero' }));
  // 利益の棒（赤字は 0 の線から下へ）
  const bw = Math.min(26, step * 0.5);
  rs.forEach((r, k) => {
    const v = r.profit;
    const top = v >= 0 ? yP(v) : yP(0);
    const hgt = Math.max(1, Math.abs(yP(v) - yP(0)));
    svg.append(mk('rect', { x: x(k) - bw / 2, y: top, width: bw, height: hgt, rx: 3, class: `isl-rp-bar ${v < 0 ? 'is-neg' : ''}`, style: `--d:${k * 0.05}s` }));
  });
  // 売上の折れ線と点
  if (rs.length > 1) svg.append(mk('polyline', { points: rs.map((r, k) => `${x(k).toFixed(1)},${yR(r.revenue).toFixed(1)}`).join(' '), class: 'isl-rp-line' }));
  rs.forEach((r, k) => {
    svg.append(mk('circle', { cx: x(k), cy: yR(r.revenue), r: k === rs.length - 1 ? 4.5 : 3.2, class: `isl-rp-dot ${k === rs.length - 1 ? 'is-last' : ''}` }));
    svg.append(mk('text', { x: x(k), y: H - 6, 'text-anchor': 'middle', class: 'isl-rp-xl' }, monthLabel(r.month)));
  });
  // 吹き出し（押した月の上に）
  let tip: SVGGElement | null = null;
  let tipK = -1;
  const show = (k: number) => {
    tip?.remove();
    tip = null;
    if (k === tipK) {
      tipK = -1;
      return;
    }
    tipK = k;
    const r = rs[k];
    const tw = 104;
    const th = 46;
    const top = Math.min(yR(r.revenue), r.profit >= 0 ? yP(r.profit) : yP(0));
    const tx = Math.max(2, Math.min(W - tw - 2, x(k) - tw / 2));
    const ty = Math.max(2, top - th - 6);
    const g = document.createElementNS(NS, 'g') as SVGGElement;
    g.classList.add('isl-rp-tip');
    g.append(mk('rect', { x: tx, y: ty, width: tw, height: th, rx: 6 }));
    g.append(mk('text', { x: tx + 8, y: ty + 13, class: 'is-m' }, monthLabel(r.month)));
    g.append(mk('text', { x: tx + 8, y: ty + 26 }, t(`売上 ${money(r.revenue)}`, `Sales ${money(r.revenue)}`)));
    g.append(mk('text', { x: tx + 8, y: ty + 39, class: r.profit >= 0 ? 'is-good' : 'is-bad' }, t(`利益 ${r.profit < 0 ? '−' : ''}${money(Math.abs(r.profit))}`, `Profit ${r.profit < 0 ? '−' : ''}${money(Math.abs(r.profit))}`)));
    svg.append(g);
  };
  // 月ごとの縦の当たり判定（透明）
  rs.forEach((_r, k) => {
    const hit = mk('rect', { x: x(k) - step / 2, y: 0, width: step, height: H, class: 'isl-rp-hit', 'data-k': k });
    hit.addEventListener('click', (e) => {
      e.stopPropagation();
      show(k);
    });
    hit.addEventListener('pointerenter', (e) => {
      if ((e as PointerEvent).pointerType === 'mouse' && tipK !== k) show(k);
    });
    svg.append(hit);
  });
  svg.addEventListener('pointerleave', (e) => {
    if ((e as PointerEvent).pointerType === 'mouse' && tip) {
      tip.remove();
      tip = null;
      tipK = -1;
    }
  });
  return svg;
}

/**
 * 報告の詰まり：締めの時点で保存した値（Report.bottleneck = jamOf）。SCM ダッシュボードと同じ判定。
 * 古いセーブで保存が無ければ、いまの状態で同じ判定をする（実績の数の少なさでは決めない）
 */
export const reportJam = (s: P1State, r: Report): Stage => r.bottleneck ?? jamOf(s);

/** 流れの図：① → ② → ③ → ④ の実績の数。詰まり（reportJam）の段を赤く */
function flowRow(s: P1State, r: Report): HTMLElement {
  const bn = reportJam(s, r);
  const f = r.flow ?? { bought: 0, made: 0, hauled: 0, sold: 0 };
  const vals: Record<Stage, number> = { buy: f.bought, craft: f.made, haul: f.hauled, sell: f.sold };
  const max = Math.max(1, ...Object.values(vals));
  const row = h('div', 'isl-rp-flow');
  (['buy', 'craft', 'haul', 'sell'] as Stage[]).forEach((k, i) => {
    if (i) row.append(h('span', 'isl-rp-arrow', '▶'));
    const c = h('div', `isl-rp-stage ${k === bn ? 'is-bn' : ''}`);
    const bar = h('div', 'isl-rp-sbar');
    const fill = h('i');
    fill.style.height = `${Math.max(6, Math.round((vals[k] / max) * 100))}%`;
    bar.append(fill);
    c.append(h('span', 'isl-rp-sicon', STAGE_ICON[k]), bar, h('b', '', `${vals[k]}`), h('small', '', STAGE_NAME[k]));
    if (k === bn) c.append(h('span', 'isl-rp-bnmark', t('詰まり', 'Jam')));
    row.append(c);
  });
  return row;
}

/** カードの見出し行：種別チップ＋見出し＋右端に導線のボタン */
function cardHead(tag: string, kgi: boolean, title: string, right?: HTMLElement, note = ''): HTMLElement {
  const row = h('div', 'isl-rp-head');
  const h3 = h('h3', '', title);
  // 見出しの補足（スマホでは隠す）
  if (note) h3.append(h('span', 'isl-rp-note', note));
  row.append(h('span', `isl-rp-tag ${kgi ? 'is-kgi' : ''}`, tag), h3);
  if (right) row.append(right);
  return row;
}

/** 前月比のチップ */
function diffChip(cur: number, prev: number): HTMLElement {
  const d = cur - prev;
  return h('span', `isl-rp-diff ${d >= 0 ? 'is-up' : 'is-down'}`, d >= 0 ? t(`先月比 +${money(d)}`, `+${money(d)} vs last`) : t(`先月比 −${money(-d)}`, `−${money(-d)} vs last`));
}

/** 開幕の発表（全画面）。終わったら done */
function reveal(ctx: Ctx, r: Report, hooks: ReportHooks, top1: boolean, alive: () => boolean, done: () => void) {
  const d = ym(r.month);
  const ov = h('div', 'isl-rp-reveal');
  const box = h('div', 'isl-rp-rvbox');
  const coinBox = h('div', 'isl-rp-coins');
  const num = h('b', 'isl-rp-rvnum', '0 G');
  box.append(h('small', 'isl-rp-rvlabel', t(`${d.year}年目・${d.month}月の売上`, `Sales · Y${d.year} M${d.month}`)), coinBox, num);
  ov.append(box, h('small', 'isl-rp-rvtap', t('タップで続ける', 'Tap to continue')));
  ctx.root.append(ov);
  let over = false;
  let timer = 0;
  const finish = () => {
    if (over) return;
    over = true;
    clearTimeout(timer);
    ov.classList.add('is-out');
    setTimeout(() => ov.remove(), 260);
    done();
  };
  ov.addEventListener('click', (e) => {
    e.stopPropagation();
    finish();
  });
  const later = () => {
    timer = window.setTimeout(finish, 1200);
  };
  // 売上 0：ドラムロールなし。灰色の 0 G とマインちゃんの一言
  if (r.revenue <= 0) {
    num.classList.add('is-zero');
    const say = h('div', 'isl-rp-rvsay');
    const mi = h('img', 'isl-rp-mine');
    mi.src = assetUrl('mch/Image/Characters/navi_ain_speak_00_talk.png');
    mi.alt = '';
    say.append(mi, h('p', '', t('今月は売れなかった…。商品がお店に届いているか、店員がいるかを確かめよう。', 'Nothing sold this month… Check that goods reach the shop and that someone is on the floor.')));
    box.append(say);
    hooks.sfx?.('check');
    later();
    return;
  }
  const to = r.revenue;
  const ms = 1400;
  const t0 = performance.now();
  hooks.sfx?.('drum');
  const tick = (now: number) => {
    if (over) return;
    if (!alive()) {
      ov.remove();
      over = true;
      return;
    }
    const k = Math.min(1, (now - t0) / ms);
    const e = 1 - Math.pow(1 - k, 2);
    // 途中は下 3 桁が転がる。最後の 15% で正確な値へ
    const jitter = k < 0.85 ? Math.floor(Math.random() * 1000) : 0;
    const v = k < 1 ? Math.min(to, Math.max(0, Math.round(to * e) + (to >= 1000 ? jitter - 500 : 0))) : to;
    num.textContent = money(v);
    if (k < 1) {
      requestAnimationFrame(tick);
      return;
    }
    num.classList.add('is-hit');
    coins(coinBox, Math.min(24, 8 + Math.floor(to / 3000)));
    hooks.sfx?.(top1 ? 'win' : 'sale');
    later();
  };
  requestAnimationFrame(tick);
}

export function openMonthReport(ctx: Ctx, r: Report, hooks: ReportHooks, then?: () => void) {
  const s = ctx.s();
  const idx = s.reports.indexOf(r);
  const prev = idx > 0 ? s.reports[idx - 1] : idx < 0 && s.reports.length ? s.reports[s.reports.length - 1] : null;
  const upto = idx >= 0 ? s.reports.slice(0, idx + 1) : [...s.reports, r];
  /** 発表が終わったか（終わるまでは本体を隠す） */
  let shown = false;
  /** 本体のカードの出る演出・順位のポン（最初の 1 回だけ） */
  let animated = false;
  let bodyEl: HTMLElement | null = null;
  open(
    ctx,
    reportTitle(r.month),
    (body) => {
      bodyEl = body;
      body.classList.add('is-report');
      body.closest('.isl-sheet')?.classList.add('is-report-sheet');
      body.classList.toggle('is-wait', !shown);
      const cards: HTMLElement[] = [];

      // ---- ① 【KPI ①】売上報告
      const bn = reportJam(s, r);
      const c1 = h('div', 'isl-card2 isl-rp-card');
      c1.append(cardHead(t('KPI ①', 'KPI 1'), false, t('売上報告', 'Sales'), btn(t('投資：スキルツリー', 'Invest: Skills'), () => hooks.openSkills(STAGE_BRANCH[bn]), 'isl-rp-go')));
      const grid = h('div', 'isl-rp-sales');
      const left = h('div', 'isl-rp-col');
      left.append(h('small', 'isl-rp-k', t('売上', 'Sales')), h('b', `isl-rp-rev ${r.revenue <= 0 ? 'is-zero' : ''}`, money(r.revenue)));
      if (prev) left.append(diffChip(r.revenue, prev.revenue));
      const right = h('div', 'isl-rp-col');
      right.append(h('small', 'isl-rp-k', t('利益', 'Profit')), h('b', `isl-rp-pf ${r.profit >= 0 ? 'is-good' : 'is-bad'}`, (r.profit >= 0 ? '+' : '−') + money(Math.abs(r.profit))));
      right.append(h('small', 'isl-rp-k', t('資金の変化', 'Cash')));
      if (r.money) {
        right.append(h('span', 'isl-rp-cash', `${money(r.money.start)} → ${money(r.money.end)}`));
      } else right.append(h('span', 'isl-rp-cash', '—'));
      // 増減とブランド力の増えは 1 行に
      const sub = h('span', 'isl-rp-subrow');
      if (r.money) {
        const dm = r.money.end - r.money.start;
        sub.append(h('small', `isl-rp-dm ${dm >= 0 ? 'is-good' : 'is-bad'}`, t(`（${dm >= 0 ? '+' : '−'}${money(Math.abs(dm))}）`, `(${dm >= 0 ? '+' : '−'}${money(Math.abs(dm))})`)));
      }
      if (r.brand) sub.append(h('small', 'isl-rp-brand', `★ +${r.brand}`));
      if (sub.childElementCount) right.append(sub);
      grid.append(left, right);
      c1.append(grid);
      // 月次 PDCA（スキル）：来月の見込み
      if (r.forecast) {
        const fc = h('p', 'isl-rp-fc');
        fc.append(h('span', 'isl-tag is-good', t('月次 PDCA', 'Monthly PDCA')), h('span', '', t(`来月の見込み：売上 ${money(r.forecast.sales)}・利益 `, `Next month: sales ${money(r.forecast.sales)}, profit `)), h('b', r.forecast.profit >= 0 ? 'isl-good' : 'isl-bad', (r.forecast.profit >= 0 ? '+' : '−') + money(Math.abs(r.forecast.profit))));
        c1.append(fc);
      }
      // 内訳（折りたたみ）
      const detail = h('details', 'isl-rp-detail');
      detail.append(h('summary', '', t('売上の内訳（商品ごとの売上・費用）', 'Breakdown (sales by product, costs)')));
      const by = h('div', 'isl-stock');
      for (const [k, v] of Object.entries(r.bySeries)) {
        if (!v) continue;
        const c = h('span', 'isl-chip');
        c.append(skuIcon(sku(k, 'C'), 22), h('span', '', `${PRODUCT[k].name} ${money(v)}`));
        by.append(c);
      }
      const cost = r.costs;
      detail.append(by, h('p', 'isl-dim', t(`費用：素材 ${money(cost.materials)}・建物とスキル ${money(cost.build)}・維持費 ${money(cost.upkeep)}・給料 ${money(cost.wages)}・アルバイト ${money(cost.part)}・宣伝 ${money(cost.ads ?? 0)}`, `Costs: materials ${money(cost.materials)}, buildings & skills ${money(cost.build)}, upkeep ${money(cost.upkeep)}, wages ${money(cost.wages)}, part-timers ${money(cost.part)}, ads ${money(cost.ads ?? 0)}`)));
      for (const n of r.news) {
        const [who, what] = n.split('|');
        detail.append(h('p', 'isl-warn', t(`${who}が「${what}」の販売を始めました。`, `${who} started selling ${what}.`)));
      }
      c1.append(detail);
      cards.push(c1);

      // ---- ② 【KGI】企業ランキング（エリア）
      const c2 = h('div', 'isl-card2 isl-rp-card isl-rp-rank');
      c2.append(cardHead('KGI', true, t('企業ランキング', 'Company ranking'), btn(t('目標確認：企業ランキング', 'Goal: Ranking'), () => hooks.openRanking(), 'isl-rp-go'), t('（エリア）', ' (area)')));
      const prevRank = prev?.rank ?? null;
      const moved = prevRank != null ? prevRank - r.rank : 0;
      const head = h('div', 'isl-rp-rankhead');
      const num = h('b', `isl-rp-ranknum ${animated ? 'is-done' : ''}`, t(`現在 ${r.rank} 位`, `Now #${r.rank}`));
      head.append(num);
      if (r.rank === 1) head.append(h('span', 'isl-rp-crown', '👑'));
      if (prevRank == null) head.append(h('span', 'isl-rp-move is-new', t('初登場', 'New entry')));
      else if (moved > 0) head.append(h('span', 'isl-rp-move is-up', t(`↑ ${moved} ランクアップ！`, `↑ Up ${moved}!`)));
      else if (moved < 0) head.append(h('span', 'isl-rp-move is-down', t(`↓ ${-moved} ランクダウン`, `↓ Down ${-moved}`)));
      else head.append(h('span', 'isl-rp-move', t('→ キープ', '→ Held')));
      // ゴール：2 か月続けて 1 位（制覇）。1 位の月は「いま n / 2」
      const streak = r.streak ?? (r.rank === 1 ? 1 : 0);
      const conquered = streak >= TOP_STREAK;
      // スマホは短い文（順位の行に収める）
      const goalK = h('b', `isl-rp-goalk ${conquered ? 'is-done' : ''}`);
      const [goalLong, goalShort] = conquered
        ? [t(`制覇！ ${TOP_STREAK} か月続けて 1 位`, `Conquered! #1 for ${TOP_STREAK} months`), t('👑 制覇！', '👑 Conquered!')]
        : streak > 0
          ? [t(`ゴール：${TOP_STREAK} か月続けて 1 位（いま ${streak} / ${TOP_STREAK}）`, `Goal: #1 for ${TOP_STREAK} months in a row (${streak} / ${TOP_STREAK})`), t(`ゴール：${TOP_STREAK} か月続けて 1 位（いま ${streak} / ${TOP_STREAK}）`, `Goal: #1 for ${TOP_STREAK} months in a row (${streak} / ${TOP_STREAK})`)]
          : [t(`ゴール：${TOP_STREAK} か月続けて 1 位`, `Goal: #1 for ${TOP_STREAK} months in a row`), t(`ゴール：${TOP_STREAK} か月連続 1 位`, `Goal: #1 × ${TOP_STREAK} months`)];
      goalK.append(h('span', 'is-long', goalLong), h('span', 'is-short', goalShort));
      head.append(goalK);
      c2.append(head);
      const me = r.area.findIndex((x) => x.me);
      const mySales = me >= 0 ? r.area[me].sales : r.revenue;
      let gap = '';
      if (me > 0) gap = t(`次の順位（${me} 位の${r.area[me - 1].name}）まで あと ${money(Math.max(0, r.area[me - 1].sales - mySales))}`, `${money(Math.max(0, r.area[me - 1].sales - mySales))} to #${me} (${r.area[me - 1].name})`);
      else if (me === 0 && r.area.length > 1) gap = t(`2 位の${r.area[1].name}との差 ${money(Math.max(0, mySales - r.area[1].sales))}（守り切ろう！）`, `${money(Math.max(0, mySales - r.area[1].sales))} ahead of #2 ${r.area[1].name} — hold on!`);
      if (streak > 0 && !conquered) {
        // 1 回目の 1 位：マインちゃんの一言（来月も守れば制覇）と、2 位との差を 1 行に（スマホで報告を 1 画面に収める）
        const say = h('div', 'isl-rp-say');
        const mi = h('img', 'isl-rp-mine');
        mi.src = assetUrl('mch/Image/Characters/navi_ain_speak_00_talk.png');
        mi.alt = '';
        const p = h('p');
        p.append(rich(t('来月も守り切れたら[[制覇]]だよ！', 'Hold on next month and the sector is [[yours]]!')));
        say.append(mi, p);
        if (me === 0 && r.area.length > 1) say.append(h('small', 'isl-rp-lead', t(`2 位との差 ${money(Math.max(0, mySales - r.area[1].sales))}`, `${money(Math.max(0, mySales - r.area[1].sales))} ahead of #2`)));
        c2.append(say);
        body.classList.add('has-say');
      } else if (gap) c2.append(h('p', 'isl-rp-goal', gap));
      const rk = h('details', 'isl-rp-detail');
      rk.append(h('summary', '', t('ランキング表', 'Ranking table')));
      const list = h('ol', 'isl-rank isl-rp-list');
      r.area.forEach((x, k) => {
        const li = h('li', x.me ? 'is-me' : '');
        li.style.setProperty('--d', `${k * 0.05}s`);
        li.append(h('span', 'isl-rank-n', `${k + 1}`), h('span', '', x.me ? t('あなたの会社', 'Your company') : x.name), h('b', '', money(x.sales)));
        list.append(li);
        if (k + 1 === GOAL_RANK && r.area.length > GOAL_RANK) list.append(h('li', 'isl-rp-goalline', t('── ゴールライン ──', '── Goal line ──')));
      });
      rk.append(list);
      c2.append(rk);
      cards.push(c2);

      // ---- ③ 【KPI ②】月次売上推移
      const c3 = h('div', 'isl-card2 isl-rp-card');
      const wrap = h('div', 'isl-rp-chartwrap');
      let svg = chart(upto);
      const sel = select(RANGES, chartRange, (v) => {
        setRange(v);
        const next = chart(upto);
        svg.replaceWith(next);
        svg = next;
      });
      sel.classList.add('isl-rp-range');
      c3.append(cardHead(t('KPI ②', 'KPI 2'), false, t('月次売上推移', 'Monthly trend'), sel));
      const legend = h('div', 'isl-rp-legend');
      legend.append(h('span', 'is-line', t('売上（左軸）', 'Sales (left)')), h('span', 'is-bar', t('利益（右軸）', 'Profit (right)')));
      wrap.append(svg, legend);
      c3.append(wrap);
      cards.push(c3);

      // ---- ④ 【KPI ③】サプライチェーン管理
      const c4 = h('div', 'isl-card2 isl-rp-card');
      c4.append(cardHead(t('KPI ③', 'KPI 3'), false, t('サプライチェーン管理', 'Supply chain'), btn(t('分析：SCM ダッシュボード', 'Analyze: SCM'), () => hooks.openSupply(), 'isl-rp-go'), t('（SCM）', ' (SCM)')));
      const note = h('small', 'isl-rp-bnnote');
      note.append(
        h('span', 'is-long', t('詰まり＝ひと月に流せる数がいちばん少ない段（SCM ダッシュボードと同じ）', 'Jam = the stage that can move the fewest per month (same as the SCM dashboard)')),
        h('span', 'is-short', t('詰まり＝ひと月に流せる数が最少の段（SCM と同じ）', 'Jam = fewest per month (same as SCM)')),
      );
      c4.append(flowRow(s, r), note);
      const hint = h('p', 'isl-rp-hint');
      const long = h('span', 'is-long');
      long.append(rich(t(`[[${STAGE_NAME[bn]}]]が詰まっています。${STAGE_HINT[bn]}`, `[[${STAGE_NAME[bn]}]] is the jam. ${STAGE_HINT[bn]}`)));
      const short = h('span', 'is-short');
      short.append(rich(t(`[[${STAGE_NAME[bn]}]]が詰まり。${STAGE_HINT_SHORT[bn]}`, `[[${STAGE_NAME[bn]}]] jam. ${STAGE_HINT_SHORT[bn]}`)));
      hint.append(long, short);
      c4.append(hint);
      cards.push(c4);

      cards.forEach((c, k) => c.style.setProperty('--d', `${k * 0.08}s`));
      body.append(...cards);
    },
    then,
  );
  const alive = () => !!bodyEl?.isConnected;
  reveal(ctx, r, hooks, r.rank === 1, alive, () => {
    shown = true;
    const body = bodyEl;
    if (!body || !body.isConnected) return;
    body.classList.remove('is-wait');
    body.classList.add('is-in');
    const num = body.querySelector('.isl-rp-ranknum');
    setTimeout(() => {
      num?.classList.add('is-show');
      if (prev && prev.rank > r.rank) hooks.sfx?.('levelup');
    }, 420);
    setTimeout(() => {
      animated = true;
      body.classList.remove('is-in');
      body.querySelectorAll('.isl-rp-ranknum').forEach((e) => e.classList.add('is-done'));
    }, 1300);
  });
}
