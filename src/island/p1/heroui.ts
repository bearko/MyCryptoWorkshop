/**
 * ヒーローとエクステを「絵で選ぶ」ための部品：担当の枠・ヒーローを選ぶ引き出し・エクステのカード（素材 → 商品）・エクステを選ぶ引き出し。
 * プルダウンや数字の入力の代わりに使う（docs/ISLAND_PHASE1.md「人とモノを絵で扱う」）。
 */
import { t } from '../../i18n';
import { DEF } from '../defs';
import { MATS, PRODUCT, RIVALS, SECTORS, TASKS, UNCOMMON, aptitude, skuParts, skuPrice, type Mat, type Sku, type Task } from './data';
import { batchOf, craftCheck, craftDays, has, recipeOf, staffOf, unitCost, type P1State, type Staff } from './model';
import { bar, btn, h, heroIcon, heroName, matIcon, money, skuIcon, skuName } from './ui';

export const TASK_NAME: Record<Task, string> = { ...(Object.fromEntries(TASKS.map((x) => [x.key, x.name])) as Record<Task, string>), side: t('バイト', 'Part-time'), manager: t('セクタマネージャー', 'Sector manager') };

/**
 * 適性のランク：0〜100 の数を G・F・E・D・C・B・A・S の 8 段に。
 * 見習いの 3 人は G〜F（得意な仕事だけ F）。最初に雇えるコモンは良くて E、D があればすごい。
 * S はレジェンダリーの得意な仕事くらい。区切りは RANK_AT。
 */
export const RANKS = ['G', 'F', 'E', 'D', 'C', 'B', 'A', 'S'] as const;
export type Rank = (typeof RANKS)[number];
/** F・E・D・C・B・A・S になる適性の下限 */
export const RANK_AT = [30, 42, 55, 62, 69, 77, 85];
export const aptN = (apt: number) => Math.max(0, Math.min(100, Math.round(apt)));
export function rankOf(apt: number): Rank {
  const n = aptN(apt);
  for (let k = RANKS.length - 1; k > 0; k--) if (n >= RANK_AT[k - 1]) return RANKS[k];
  return 'G';
}
/** ランクと数（「E 45」） */
export function rankEl(apt: number): HTMLElement {
  const r = rankOf(apt);
  const e = h('span', `isl-rankv is-${r.toLowerCase()}`);
  e.append(h('b', '', r), h('small', '', `${aptN(apt)}`));
  return e;
}

/** レーダーチャートの軸の順：サプライチェーンの 4 つ（調達 → 製造 → 運搬 → 販売）、そのあと開拓・調査 */
const RADAR: Task[] = ['buy', 'craft', 'transport', 'shop', 'intel', 'explore'];
const SVG = 'http://www.w3.org/2000/svg';
const svg = <K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number>) => {
  const e = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  return e;
};

/** 仕事ごとの適性のレーダーチャート。角ごとに仕事の名前とランク・数 */
export function radar(stats: Parameters<typeof aptitude>[0], size = 210): SVGSVGElement {
  const R = 62;
  const cx = 105;
  const cy = 100;
  const root = svg('svg', { viewBox: '0 0 210 200', width: size, height: Math.round((size * 200) / 210), class: 'isl-radar', role: 'img' });
  const pt = (k: number, r: number) => {
    const a = -Math.PI / 2 + (k * 2 * Math.PI) / RADAR.length;
    return [cx + Math.cos(a) * r, cy + Math.sin(a) * r];
  };
  // 目盛り（25・50・75・100）
  for (const f of [0.25, 0.5, 0.75, 1]) root.append(svg('polygon', { points: RADAR.map((_, k) => pt(k, R * f).join(',')).join(' '), class: f === 1 ? 'isl-radar-edge' : 'isl-radar-ring' }));
  RADAR.forEach((_, k) => {
    const [x, y] = pt(k, R);
    root.append(svg('line', { x1: cx, y1: cy, x2: x, y2: y, class: 'isl-radar-ring' }));
  });
  const vals = RADAR.map((task) => aptitude(stats, task));
  root.append(svg('polygon', { points: vals.map((v, k) => pt(k, (R * aptN(v)) / 100).join(',')).join(' '), class: 'isl-radar-area' }));
  vals.forEach((v, k) => {
    const [x, y] = pt(k, (R * aptN(v)) / 100);
    root.append(svg('circle', { cx: x, cy: y, r: 2.6, class: 'isl-radar-dot' }));
  });
  // 角のラベル：仕事の名前、その下にランクと数
  RADAR.forEach((task, k) => {
    const [x, y] = pt(k, R + 20);
    const anchor = Math.abs(x - cx) < 4 ? 'middle' : x > cx ? 'start' : 'end';
    const dx = anchor === 'start' ? -6 : anchor === 'end' ? 6 : 0;
    const name = svg('text', { x: x + dx, y: y - 4, 'text-anchor': anchor, class: 'isl-radar-name' });
    name.textContent = TASK_NAME[task];
    const r = rankOf(vals[k]);
    const val = svg('text', { x: x + dx, y: y + 10, 'text-anchor': anchor, class: `isl-radar-val is-${r.toLowerCase()}` });
    const rk = svg('tspan', { class: 'isl-radar-rank' });
    rk.textContent = r;
    const n = svg('tspan', { dx: 3 });
    n.textContent = `${aptN(vals[k])}`;
    val.append(rk, n);
    root.append(name, val);
  });
  return root;
}

/** いまの仕事（短く） */
export function jobLabel(s: P1State, st: Staff): string {
  switch (st.task) {
    case 'craft':
      return t(`製造・作業台 ${(st.target as number) + 1}`, `Craft · bench ${(st.target as number) + 1}`);
    case 'transport':
      return t('物流', 'Haul');
    case 'shop': {
      const b = s.buildings.find((x) => x.uid === st.target);
      return t(`販売・${b ? DEF[b.id].name : ''}`, `Sell · ${b ? DEF[b.id].name : ''}`);
    }
    case 'buy':
      return t('調達', 'Buying');
    case 'explore':
      return t(`開拓・${MATS[st.target as Mat]?.name ?? ''}`, `Scout · ${MATS[st.target as Mat]?.name ?? ''}`);
    case 'intel':
      return t(`調査・${RIVALS.find((r) => r.id === st.target)?.name ?? ''}`, `Research · ${RIVALS.find((r) => r.id === st.target)?.name ?? ''}`);
    case 'side':
      return t(`バイト・${RIVALS.find((r) => r.id === st.target)?.name ?? ''}`, `Part-time · ${RIVALS.find((r) => r.id === st.target)?.name ?? ''}`);
    case 'manager':
      return t(`マネージャー・${SECTORS.find((x) => x.id === st.target)?.name ?? ''}`, `Manager · ${SECTORS.find((x) => x.id === st.target)?.name ?? ''}`);
    default:
      return t('待機中', 'Free');
  }
}

/** スタミナの細い棒 */
function stamina(st: Staff): HTMLElement {
  const v = st.stamina / st.stats.hp;
  return bar(v, v > 0.3 ? 'var(--isl-good)' : 'var(--isl-bad)');
}

/**
 * 担当の枠（四角）。ヒーローがいれば顔・名前・その仕事の適性、いなければ「＋」。
 * 押すと onTap（ふつうはヒーローを選ぶ引き出しを開く）。
 */
export function slot(s: P1State, o: { label: string; task: Task; hero: number | null; onTap: () => void; hot?: boolean; onRemove?: () => void }): HTMLElement {
  const b = h('button', `isl-slot ${o.hero == null ? 'is-empty' : ''} ${o.hot ? 'is-hot' : ''}`);
  b.type = 'button';
  b.append(h('small', 'isl-slot-label', o.label));
  const st = o.hero != null ? staffOf(s, o.hero) : null;
  if (st) {
    const apt = Math.round(aptitude(st.stats, o.task));
    b.append(heroIcon(st.hero, 52), h('b', 'isl-slot-name', heroName(st.hero)), rankEl(apt), stamina(st));
    if (st.resting) b.append(h('span', 'isl-slot-tag', t('休憩中', 'Resting')));
    if (o.onRemove) {
      const x = h('span', 'isl-slot-x', '×');
      x.title = t('外す', 'Remove');
      x.addEventListener('click', (e) => {
        e.stopPropagation();
        o.onRemove?.();
      });
      b.append(x);
    }
  } else b.append(h('span', 'isl-slot-plus', '+'), h('small', 'isl-slot-hint', t('タップで割り当て', 'Tap to assign')));
  b.addEventListener('click', o.onTap);
  return b;
}

/** 引き出し（下から出る小さな窓）。閉じる関数を返す */
function drawer(root: HTMLElement, title: string, note: string, fill: (box: HTMLElement, close: () => void) => void): () => void {
  const el = h('div', 'isl-picker');
  const box = h('div', 'isl-picker-box');
  const head = h('div', 'isl-picker-head');
  const close = () => el.remove();
  head.append(h('h3', '', title), btn('✕', close));
  box.append(head);
  if (note) box.append(h('p', 'isl-dim', note));
  const body = h('div', 'isl-picker-body');
  box.append(body);
  fill(body, close);
  el.append(box);
  el.addEventListener('click', (e) => {
    if (e.target === el) close();
  });
  root.append(el);
  return close;
}

/** ヒーローを選ぶ引き出し：その仕事の適性が高い順。待機中のヒーローには印 */
export function pickHero(root: HTMLElement, s: P1State, o: { title: string; task: Task; current: number | null; onPick: (hero: number | null) => void; note?: string }) {
  // ほかのセクタでマネージャーをしている人は、ここにはいない
  const list = [...s.staff].filter((x) => x.task !== 'manager').sort((a, b) => aptitude(b.stats, o.task) - aptitude(a.stats, o.task));
  const best = list[0] ? aptitude(list[0].stats, o.task) : 0;
  drawer(root, o.title, o.note ?? t(`数字は「${TASK_NAME[o.task]}」の適性です。待機中のヒーローから選ぶと、ほかの仕事が空きません。`, `Numbers are ${TASK_NAME[o.task]} aptitude. Picking a free hero leaves other jobs covered.`), (body, close) => {
    const grid = h('div', 'isl-pick-grid');
    for (const st of list) {
      const apt = Math.round(aptitude(st.stats, o.task));
      const free = st.task == null;
      const card = h('button', `isl-hero-pick ${st.hero === o.current ? 'is-on' : ''} ${free ? 'is-free' : ''}`);
      card.type = 'button';
      card.append(heroIcon(st.hero, 56), h('b', '', heroName(st.hero)), rankEl(apt), stamina(st), h('small', free ? 'isl-good' : 'isl-dim', st.hero === o.current ? t('いまの担当', 'Current') : jobLabel(s, st)));
      if (Math.round(best) === apt) card.append(h('span', 'isl-best', t('いちばん向いている', 'Best fit')));
      card.addEventListener('click', () => {
        close();
        o.onPick(st.hero);
      });
      grid.append(card);
    }
    body.append(grid);
    if (o.current != null)
      body.append(
        btn(t('担当を外す', 'Unassign'), () => {
          close();
          o.onPick(null);
        }),
      );
  });
}

// ---------------------------------------------------------------- エクステ（素材 → 商品）

/** 素材 → 商品のつながり（BOM）：素材のアイコン×数 → エクステ×できる数 */
export function bomRow(s: P1State, x: Sku, size = 22): HTMLElement {
  const row = h('div', 'isl-bom-row');
  for (const [m, q] of Object.entries(recipeOf(x))) {
    const have = s.mats[m as Mat] ?? 0;
    const c = h('span', `isl-bom-mat ${have < (q ?? 0) ? 'is-bad' : ''}`);
    c.title = `${MATS[m as Mat].name} ${have}`;
    c.append(matIcon(m as Mat, size), h('small', '', `×${q}`));
    row.append(c);
  }
  row.append(h('span', 'isl-bom-arrow', '→'));
  const out = h('span', 'isl-bom-out');
  out.append(skuIcon(x, size + 6), h('small', '', `×${batchOf(x)}`));
  row.append(out);
  return row;
}

/** いまの素材で作れるロット数 */
export function lotsFromStock(s: P1State, x: Sku): number {
  let n = Infinity;
  for (const [m, q] of Object.entries(recipeOf(x))) n = Math.min(n, Math.floor((s.mats[m as Mat] ?? 0) / (q ?? 1)));
  return Number.isFinite(n) ? n : 0;
}

/** 1 作業台・1 日あたりの粗利（効率の目安） */
export const profitPerDay = (s: P1State, x: Sku) => ((skuPrice(x) - unitCost(s, x)) * batchOf(x)) / craftDays(s, x);

/** エクステのカード：絵・名前・値段・素材 → 商品・今の素材で何ロット・効率・需要と競合 */
export function extCard(s: P1State, x: Sku, o: { worker?: number | null; on?: boolean; best?: boolean; badge?: string; making?: boolean; onTap?: () => void; compact?: boolean } = {}): HTMLElement {
  const [k, r] = skuParts(x);
  const p = PRODUCT[k];
  const card = h(o.onTap ? 'button' : 'div', `isl-ext-card ${o.on ? 'is-on' : ''} ${o.best || o.badge ? 'is-best' : ''}`);
  if (card instanceof HTMLButtonElement) card.type = 'button';
  const top = h('div', 'isl-ext-top');
  const name = h('div');
  name.append(h('b', '', skuName(x)), h('div', 'isl-gold', money(skuPrice(x))));
  top.append(skuIcon(x, o.compact ? 40 : 52), name);
  card.append(top, bomRow(s, x));
  const tags = h('div', 'isl-ext-tags');
  const lots = lotsFromStock(s, x);
  if (o.making) tags.append(h('span', 'isl-tag is-good', t('工房で作っている', 'Being crafted')));
  const err = craftCheck(s, x, o.worker ?? null);
  if (r === 'U' && err === 'skill') tags.append(h('span', 'isl-tag is-bad', t(`製造の適性 ${UNCOMMON.minCraft} 以上が要る`, `Needs aptitude ${UNCOMMON.minCraft}+`)));
  tags.append(h('span', `isl-tag ${lots > 0 ? 'is-good' : 'is-bad'}`, lots > 0 ? t(`今の素材で ${lots} ロット`, `${lots} lots from stock`) : t('素材が足りない', 'Not enough materials')));
  tags.append(h('span', 'isl-tag', t(`${batchOf(x)} 個／${craftDays(s, x).toFixed(1)} 日`, `${batchOf(x)} / ${craftDays(s, x).toFixed(1)} d`)));
  tags.append(h('span', 'isl-tag', t(`粗利 ${money(profitPerDay(s, x))}／日`, `${money(profitPerDay(s, x))}/day`)));
  if (!o.compact) {
    const sellers = s.rivals.filter((v) => (v.sells[k] ?? 0) > 0).length;
    tags.append(h('span', 'isl-tag', t(`需要 ${Math.round(s.demand[k] ?? p.demand)}／月`, `Demand ${Math.round(s.demand[k] ?? p.demand)}/mo`)), h('span', `isl-tag ${sellers ? '' : 'is-good'}`, sellers ? t(`他社 ${sellers} 社`, `${sellers} rivals`) : t('他社なし', 'No rivals')));
  }
  card.append(tags);
  if (o.badge) card.append(h('span', 'isl-best', o.badge));
  else if (o.best) card.append(h('span', 'isl-best', t('いちばん効率がよい', 'Most efficient')));
  if (o.onTap) card.addEventListener('click', o.onTap);
  return card;
}

/** エクステを選ぶ引き出し：効率（粗利／日）の高い順。今の素材で作れるものの中でいちばんに印 */
export function pickExt(
  root: HTMLElement,
  s: P1State,
  o: { title: string; items: Sku[]; current: Sku | null; worker?: number | null; note?: string; onPick: (x: Sku | null) => void; allowNone?: boolean; badge?: { x: Sku; text: string } | null; making?: Sku[] },
) {
  const list = [...o.items].sort((a, b) => profitPerDay(s, b) - profitPerDay(s, a));
  // 印をつけたもの（おすすめ・工房で作っているもの）を先頭に
  if (o.badge && list.includes(o.badge.x)) list.splice(0, 0, ...list.splice(list.indexOf(o.badge.x), 1));
  const ok = list.filter((x) => lotsFromStock(s, x) > 0 && !craftCheck(s, x, o.worker ?? null));
  const best = ok[0] ?? null;
  drawer(root, o.title, o.note ?? t('素材 → 商品のつながりと、今の素材で何ロット作れるか、1 日あたりの粗利を見比べて選びましょう。', 'Compare materials → product, how many lots your stock makes, and gross profit per day.'), (body, close) => {
    const grid = h('div', 'isl-ext-grid');
    for (const x of list)
      grid.append(
        extCard(s, x, {
          worker: o.worker,
          on: x === o.current,
          best: !o.badge && x === best,
          badge: o.badge?.x === x ? o.badge.text : undefined,
          making: o.making?.includes(x),
          onTap: () => {
            close();
            o.onPick(x);
          },
        }),
      );
    body.append(grid);
    if (o.allowNone && o.current)
      body.append(
        btn(t('並べない', 'Clear'), () => {
          close();
          o.onPick(null);
        }),
      );
  });
}

/** エクステの四角い枠（棚・作業台の「作るもの」） */
export function extSlot(o: { label: string; x: Sku | null; sub?: string; onTap: () => void; warn?: boolean; hot?: boolean }): HTMLElement {
  const b = h('button', `isl-slot isl-ext-slot ${o.x ? '' : 'is-empty'} ${o.warn ? 'is-warn' : ''} ${o.hot ? 'is-hot' : ''}`);
  b.type = 'button';
  b.append(h('small', 'isl-slot-label', o.label));
  if (o.x) b.append(skuIcon(o.x, 52), h('b', 'isl-slot-name', skuName(o.x)));
  else b.append(h('span', 'isl-slot-plus', '+'), h('small', 'isl-slot-hint', t('タップで選ぶ', 'Tap to choose')));
  if (o.sub) b.append(h('small', 'isl-dim', o.sub));
  b.addEventListener('click', o.onTap);
  return b;
}

void has;
