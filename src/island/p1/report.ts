/**
 * 月の売上報告（ゲームのテンポを作る、月に一度のフィードバックと判断の画面）。
 * 1. 稼いだ額（数字が転がって上がる・コインの演出）と利益・資金の増減
 * 2. エリアの順位の発表（上がった ↑・下がった ↓・1 位 👑。ランキングは 1 行ずつ出す）
 * 3. 売上と利益の推移のグラフ（最近 6 か月）
 * 4. 流れの図（① 調達 → ② 製造 → ③ 物流 → ④ 販売 の数と、詰まっているところ）。スマホでもスクロールせずに見えるよう 1 行で
 * 5. 次の一手（ボトルネックのヒントと、スキルツリー・ダッシュボード・ランキングへの導線）
 * docs/ISLAND_PHASE1.md「月の売上報告」。
 */
import { t } from '../../i18n';
import { assetUrl } from '../../render/images';
import { PRODUCT, SKILLS, sku } from './data';
import { bottleneck, stageCaps, type P1State, type Report, type Stage } from './model';
import { open, type Ctx } from './screens';
import { btn, h, money, rich, skuIcon } from './ui';

const STAGE_NAME: Record<Stage, string> = { buy: t('① 調達', '① Buy'), craft: t('② 製造', '② Craft'), haul: t('③ 物流', '③ Haul'), sell: t('④ 販売', '④ Sell') };
const STAGE_ICON: Record<Stage, string> = { buy: '🧱', craft: '🔨', haul: '🛒', sell: '🏪' };
/** 段ごとの「次の一手」（ボトルネックのとき） */
const STAGE_HINT: Record<Stage, string> = {
  buy: t('素材が足りていません。調達係を置くか、スキル「調達枠の拡大」「まとめ買い」で仕入れを太くしましょう。', 'Materials are short. Assign a buyer or widen buying with the Bigger quota / Bulk buying skills.'),
  craft: t('作る数が足りていません。作業台を増やす・段取りの改善（スキル）か、製造の得意なヒーローを置きましょう。', 'Crafting is the limit. Add a bench or Better jigs (skills), or put a better crafter on the bench.'),
  haul: t('運ぶ数が足りていません。荷車を増やす・小型トラック（スキル）、遠いお店には物流拠点を。', 'Hauling is the limit. More carts or a Small truck (skills); a hub for far shops.'),
  sell: t('売れる数が頭打ちです。お店を増やす・棚を増やす・案内係の育成（スキル）や宣伝で、売り場を強くしましょう。', 'Sales are capped. More shops, more shelves, Train hosts (skills) or ads strengthen your stores.'),
};
/** 段を太くするスキル（スキルツリーの枝） */
const STAGE_BRANCH: Record<Stage, string> = { buy: 'buy', craft: 'craft', haul: 'logi', sell: 'shop' };

export interface ReportHooks {
  openSkills: (branch?: string) => void;
  openSupply: () => void;
  openRanking: () => void;
  /** 効果音 */
  sfx?: (k: 'sale' | 'win' | 'levelup' | 'check' | 'report') => void;
}

/** 数字が転がって上がる */
function countUp(el: HTMLElement, to: number, ms = 1100, prefix = '', suffix = ' G') {
  const t0 = performance.now();
  const tick = (now: number) => {
    const k = Math.min(1, (now - t0) / ms);
    const e = 1 - Math.pow(1 - k, 3);
    el.textContent = `${prefix}${Math.round(to * e).toLocaleString('en-US')}${suffix}`;
    if (k < 1 && el.isConnected) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

/** 舞い上がるコイン */
function coins(box: HTMLElement, n: number) {
  for (let k = 0; k < n; k++) {
    const c = h('i', 'isl-rp-coin');
    c.style.setProperty('--x', `${(Math.random() * 2 - 1) * 120}px`);
    c.style.setProperty('--d', `${(Math.random() * 0.5).toFixed(2)}s`);
    c.style.setProperty('--r', `${Math.round(Math.random() * 720 - 360)}deg`);
    box.append(c);
  }
}

/** 売上と利益の推移（最近 6 か月）。SVG の折れ線 ＋ 棒 */
function chart(reports: Report[]): HTMLElement {
  const rs = reports.slice(-6);
  const W = 320;
  const H = 120;
  const padL = 8;
  const padR = 8;
  const padT = 14;
  const padB = 22;
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svg.classList.add('isl-rp-chart');
  // 上は売上・利益の最大、下は赤字の最小（0 の線が中に入るように）
  const hi = Math.max(1, ...rs.map((r) => Math.max(r.revenue, r.profit)));
  const lo = Math.min(0, ...rs.map((r) => r.profit));
  const n = rs.length;
  const x = (k: number) => padL + ((W - padL - padR) * (k + 0.5)) / n;
  const y = (v: number) => padT + ((H - padT - padB) * (hi - v)) / (hi - lo);
  const y0 = y(0);
  const mk = (tag: string, attrs: Record<string, string | number>) => {
    const e = document.createElementNS('http://www.w3.org/2000/svg', tag);
    for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
    return e;
  };
  // 0 の線
  svg.append(mk('line', { x1: padL, y1: y0, x2: W - padR, y2: y0, class: 'isl-rp-zero' }));
  // 利益の棒（赤字は下へ）
  const bw = Math.min(28, ((W - padL - padR) / n) * 0.45);
  rs.forEach((r, k) => {
    const v = r.profit;
    const top = v >= 0 ? y(v) : y0;
    const hgt = Math.max(1, Math.abs(y(v) - y0));
    svg.append(mk('rect', { x: x(k) - bw / 2, y: top, width: bw, height: hgt, rx: 3, class: `isl-rp-bar ${v < 0 ? 'is-neg' : ''}`, style: `--d:${k * 0.08}s` }));
  });
  // 売上の折れ線
  const pts = rs.map((r, k) => `${x(k).toFixed(1)},${y(r.revenue).toFixed(1)}`).join(' ');
  svg.append(mk('polyline', { points: pts, class: 'isl-rp-line' }));
  rs.forEach((r, k) => {
    svg.append(mk('circle', { cx: x(k), cy: y(r.revenue), r: k === n - 1 ? 5 : 3.5, class: `isl-rp-dot ${k === n - 1 ? 'is-last' : ''}` }));
    const lbl = mk('text', { x: x(k), y: H - 6, 'text-anchor': 'middle', class: 'isl-rp-xl' });
    lbl.textContent = t(`${r.month} 月`, `M${r.month}`);
    svg.append(lbl);
  });
  const wrap = h('div', 'isl-rp-chartwrap');
  const legend = h('div', 'isl-rp-legend');
  legend.append(h('span', 'is-line', t('売上', 'Sales')), h('span', 'is-bar', t('利益', 'Profit')));
  wrap.append(svg, legend);
  return wrap;
}

/** 流れの図：① → ② → ③ → ④ の数。細いところを赤く */
function flowRow(s: P1State, r: Report): HTMLElement {
  const caps = stageCaps(s);
  const bn = r.bottleneck ?? bottleneck(caps);
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

export function openMonthReport(ctx: Ctx, r: Report, hooks: ReportHooks, then?: () => void) {
  const s = ctx.s();
  const prev = s.reports.length >= 2 ? s.reports[s.reports.length - 2] : null;
  const first = !prev;
  open(
    ctx,
    t(`${r.month} か月目の売上報告`, `Month ${r.month} sales report`),
    (body) => {
      body.classList.add('is-report');
      // ---- 1. 稼いだ額
      const hero = h('div', 'isl-rp-hero');
      const coinBox = h('div', 'isl-rp-coins');
      hero.append(coinBox);
      hero.append(h('small', 'isl-rp-label', t(`${r.month} か月目の売上`, `Month ${r.month} sales`)));
      const big = h('b', 'isl-rp-big', '0 G');
      hero.append(big);
      const diff = prev ? r.revenue - prev.revenue : 0;
      if (prev) hero.append(h('span', `isl-rp-diff ${diff >= 0 ? 'is-up' : 'is-down'}`, diff >= 0 ? t(`先月より +${money(diff)}`, `+${money(diff)} vs last month`) : t(`先月より −${money(-diff)}`, `−${money(-diff)} vs last month`)));
      const kpis = h('div', 'isl-rp-kpis');
      const kpi = (label: string, value: string, cls = '') => {
        const c = h('div', `isl-rp-kpi ${cls}`);
        c.append(h('small', '', label), h('b', '', value));
        kpis.append(c);
      };
      kpi(t('利益', 'Profit'), (r.profit >= 0 ? '+' : '−') + money(Math.abs(r.profit)), r.profit >= 0 ? 'is-good' : 'is-bad');
      const dm = r.money ? r.money.end - r.money.start : null;
      if (dm != null) kpi(t('資金の増減', 'Cash change'), (dm >= 0 ? '+' : '−') + money(Math.abs(dm)), dm >= 0 ? 'is-good' : 'is-bad');
      if (r.brand) kpi(t('ブランド力', 'Brand'), `★ +${r.brand}`, 'is-gold');
      hero.append(kpis);
      body.append(hero);
      setTimeout(() => {
        countUp(big, r.revenue);
        coins(coinBox, Math.min(18, 6 + Math.floor(r.revenue / 3000)));
        hooks.sfx?.('sale');
      }, 150);

      // ---- 2. 順位の発表
      const rankBox = h('div', 'isl-card2 isl-rp-rank');
      const prevRank = prev?.rank ?? null;
      const moved = prevRank != null ? prevRank - r.rank : 0;
      const head = h('div', 'isl-rp-rankhead');
      const num = h('b', 'isl-rp-ranknum', t(`${r.rank} 位`, `#${r.rank}`));
      head.append(h('small', '', t('エリアの順位', 'Area rank')), num);
      if (r.rank === 1) head.append(h('span', 'isl-rp-crown', '👑'));
      if (moved > 0) head.append(h('span', 'isl-rp-move is-up', t(`↑ ${moved} ランクアップ！`, `↑ Up ${moved}!`)));
      else if (moved < 0) head.append(h('span', 'isl-rp-move is-down', t(`↓ ${-moved} ランクダウン`, `↓ Down ${-moved}`)));
      else if (prevRank != null) head.append(h('span', 'isl-rp-move', t('→ キープ', '→ Held')));
      rankBox.append(head);
      const list = h('ol', 'isl-rank isl-rp-list');
      r.area.forEach((x, k) => {
        const li = h('li', x.me ? 'is-me' : '');
        li.style.setProperty('--d', `${0.5 + k * 0.18}s`);
        li.append(h('span', 'isl-rank-n', `${k + 1}`), h('span', '', x.me ? t('あなたの会社', 'Your company') : x.name), h('b', '', money(x.sales)));
        list.append(li);
      });
      rankBox.append(list);
      // 1 つ上との差
      const me = r.area.findIndex((x) => x.me);
      if (me > 0) rankBox.append(h('small', 'isl-dim', t(`1 つ上の${r.area[me - 1].name}まで、あと ${money(r.area[me - 1].sales - r.revenue)}`, `${money(r.area[me - 1].sales - r.revenue)} behind ${r.area[me - 1].name}`)));
      body.append(rankBox);
      setTimeout(() => {
        num.classList.add('is-show');
        hooks.sfx?.(r.rank === 1 ? 'win' : moved > 0 ? 'levelup' : 'check');
      }, 900);

      // ---- 3. 推移
      if (!first) {
        const g = h('div', 'isl-card2');
        g.append(h('h3', '', t('売上と利益の推移', 'Sales & profit trend')), chart(s.reports));
        body.append(g);
      }

      // ---- 4. 流れの図
      const flow = h('div', 'isl-card2');
      flow.append(h('h3', '', t('この月の流れ（商品の数）', 'This month’s flow (units)')), flowRow(s, r));
      const bn = r.bottleneck ?? bottleneck(stageCaps(s));
      const hint = h('p', 'isl-rp-hint');
      hint.append(rich(t(`[[${STAGE_NAME[bn]}]]が詰まっています。${STAGE_HINT[bn]}`, `[[${STAGE_NAME[bn]}]] is the jam. ${STAGE_HINT[bn]}`)));
      flow.append(hint);
      body.append(flow);

      // 売れた内訳
      const by = h('div', 'isl-stock');
      for (const [k, v] of Object.entries(r.bySeries)) {
        if (!v) continue;
        const c = h('span', 'isl-chip');
        c.append(skuIcon(sku(k, 'C'), 22), h('span', '', `${PRODUCT[k].name} ${money(v)}`));
        by.append(c);
      }
      const cost = r.costs;
      const detail = h('details', 'isl-rp-detail');
      const sum = h('summary', '', t('内訳を見る（商品ごとの売上・費用）', 'Details (sales by product, costs)'));
      detail.append(sum, by, h('p', 'isl-dim', t(`費用：素材 ${money(cost.materials)}・建物とスキル ${money(cost.build)}・維持費 ${money(cost.upkeep)}・給料 ${money(cost.wages)}・アルバイト ${money(cost.part)}・宣伝 ${money(cost.ads ?? 0)}`, `Costs: materials ${money(cost.materials)}, buildings & skills ${money(cost.build)}, upkeep ${money(cost.upkeep)}, wages ${money(cost.wages)}, part-timers ${money(cost.part)}, ads ${money(cost.ads ?? 0)}`)));
      for (const n of r.news) {
        const [who, what] = n.split('|');
        detail.append(h('p', 'isl-warn', t(`${who}が「${what}」の販売を始めました。`, `${who} started selling ${what}.`)));
      }
      body.append(detail);

      // ---- 5. 次の一手
      const next = h('div', 'isl-card2 isl-rp-next');
      const mi = h('img', 'isl-rp-mine');
      mi.src = assetUrl('mch/Image/Characters/navi_ain_speak_00_talk.png');
      mi.alt = '';
      const txt = h('div');
      const canSkill = SKILLS.some((k) => !s.skills.includes(k.id) && s.money >= k.cost && !(k.requires ?? []).some((q) => !s.skills.includes(q)));
      const say = h('p');
      say.append(rich(canSkill ? t(`稼いだ ${money(s.money)} で、スキルツリーの[[${STAGE_NAME[bn]}]]の枝を伸ばそう！`, `Spend your ${money(s.money)} on the [[${STAGE_NAME[bn]}]] branch of the skill tree!`) : t('資金がたまったら、スキルツリーで詰まりを太くしよう。', 'Once you have funds, widen the jam in the skill tree.')));
      txt.append(h('b', '', t('次の一手', 'Next move')), say);
      next.append(mi, txt);
      const acts = h('div', 'isl-rp-acts');
      acts.append(btn(t('スキルツリーへ', 'Skill tree'), () => hooks.openSkills(STAGE_BRANCH[bn]), 'is-on'), btn(t('ダッシュボード', 'Dashboard'), () => hooks.openSupply()), btn(t('企業ランキング', 'Ranking'), () => hooks.openRanking()));
      next.append(acts);
      body.append(next);
    },
    then,
  );
}
