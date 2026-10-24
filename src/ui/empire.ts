// 経営モードの画面（docs/EMPIRE_DESIGN.md 3・4.1 章）。報告を読み、決め、月を進める。
// テストモードのときだけ読む（main.ts から動的 import）。
import { newEmpire, type EmpireState, type MonthReport, type Note, type Plot, type PlotKind, type Store } from '../empire/model';
import { advanceMonth, canPromote, expectedDemand, FC_OPEN_COST, FC_SHARE, letterFor, MAX_STAFF, MAX_STORES, OPEN_COST, ORDER_RANGE, plotsFor, RENOVATE_COST, STAFF_NEEDED, type Decisions } from '../empire/sim';
import { rivalOf } from '../empire/rivals';
import { t } from '../i18n';
import { fmt, h } from './dom';

/** 会社の格（フェーズごとの呼び名） */
export function companyTitle(e: Pick<EmpireState, 'name' | 'phase'>): string {
  const n = e.name;
  switch (e.phase) {
    case 1:
      return t(`${n}商店`, `${n} Store`);
    case 2:
      return t(`${n}商会`, `${n} Trading`);
    case 3:
      return t(`株式会社${n}`, `${n} Inc.`);
    case 4:
      return t(`${n}インターナショナル`, `${n} International`);
    default:
      return t(`${n}ホールディングス`, `${n} Holdings`);
  }
}

export const monthLabel = (month: number) => t(`${Math.floor(month / 12) + 1}年目 ${(month % 12) + 1}月`, `Year ${Math.floor(month / 12) + 1}, month ${(month % 12) + 1}`);
const storeName = (id: number) => t(`${id}号店`, `Store ${id}`);
const money = (v: number) => `${v < 0 ? '−' : ''}${fmt(Math.abs(Math.round(v)))}`;

/** 地図の区画の呼び名（A1〜H6） */
export const cellName = (w: number, i: number) => `${String.fromCharCode(65 + (i % w))}${Math.floor(i / w) + 1}`;

/** 報告の一行（予兆を含む）。ライバルの名前と区画の呼び名に会社の状態を使う */
export function noteText(n: Note, e?: Pick<EmpireState, 'land' | 'area'>): string {
  const rival = rivalOf(e?.land);
  const rivalName = t(rival.company.ja, rival.company.en);
  const cell = (i: number) => cellName(e?.area?.w ?? 8, i);
  switch (n.kind) {
    case 'fatigue':
      return t(`${storeName(n.store)}の店主が眠そうです。人手が足りていません`, `The owner of ${storeName(n.store)} looks exhausted. The shifts are short-handed`);
    case 'waste':
      return t(`${storeName(n.store)}は売れ残りの廃棄が多めです。発注を絞ってもよさそうです`, `${storeName(n.store)} is throwing away a lot. Consider ordering less`);
    case 'stockout':
      return t(`${storeName(n.store)}で欠品が出ています。発注を増やすと売上が伸びそうです`, `${storeName(n.store)} ran out of stock. Ordering more could lift sales`);
    case 'opened':
      return t(`${storeName(n.store)}が開店しました！`, `${storeName(n.store)} is open!`);
    case 'shortOfFunds':
      return t('資金が足りず、できなかったことがあります', "Some plans couldn't go ahead: not enough funds");
    case 'storeLimit':
      return t('いまの会社の格では、これ以上は店を出せません', "The company can't run more stores at this stage");
    case 'phaseReady':
      return t('3 店舗で 3 か月続けて黒字！ 次の格へ上がる条件を満たしました', 'Three stores in the black for three months running: ready for the next stage!');
    case 'promoted':
      return t('会社の格が上がりました！', 'The company moved up a stage!');
    case 'rivalPlan':
      return t(`${rivalName}が ${cell(n.cell)} に出店を計画しているようです`, `${rivalName} seems to be planning a store at ${cell(n.cell)}`);
    case 'rivalOpened':
      return t(`${rivalName}が ${cell(n.cell)} に出店しました`, `${rivalName} opened a store at ${cell(n.cell)}`);
    case 'centerBuilt':
      return t(`${cell(n.cell)} に物流センターができました`, `A distribution center opened at ${cell(n.cell)}`);
    case 'crowded':
      return t(`${storeName(n.store)}は近くの店とお客さんを取り合っています`, `${storeName(n.store)} is competing for customers with nearby stores`);
  }
}

/** 区画の呼び名 */
export function plotLabel(kind: PlotKind): string {
  switch (kind) {
    case 'home':
      return t('創業の地', 'Founding site');
    case 'station':
      return t('駅前', 'By the station');
    case 'office':
      return t('オフィス街', 'Office district');
    case 'school':
      return t('学校のそば', 'Near a school');
    case 'residential':
      return t('住宅街', 'Residential area');
    case 'suburb':
      return t('郊外の幹線道路', 'Suburban highway');
    case 'liquor':
      return t('酒屋からの転換', 'Converted liquor store');
  }
}

/** 画面に出すヒーロー（加盟店のオーナー） */
export interface HeroFace {
  id: number;
  name: string;
  image: HTMLElement;
}

export interface EmpireViewOptions {
  /** 加盟の手紙をくれるヒーロー（いちばんの常連） */
  letterHero: HeroFace | null;
  /** id からヒーロー（オーナーの名前） */
  heroName: (id: number) => string;
}

/** 決定の下書きを当てた店（画面の見込みに使う） */
function drafted(s: Store, d: Decisions): Store {
  const c = d.stores?.[s.id] ?? {};
  const r = d.renovate ?? [];
  return { ...s, ...c, sign: s.sign || r.some((x) => x.store === s.id && x.kind === 'sign'), parking: s.parking || r.some((x) => x.store === s.id && x.kind === 'parking') };
}

/**
 * 経営画面。`commit` は会社が変わるたびに呼ばれ、セーブに書く。
 * 決定は「月を進める」まで下書きで、改装・出店の支払いもそのときに起きる。
 */
export function empireView(initial: EmpireState, commit: (e: EmpireState) => void, opts: EmpireViewOptions): HTMLElement {
  let e = initial;
  let draft: Decisions = {};
  let last: MonthReport | null = initial.history.at(-1) ?? null;
  /** 出店候補を広げているか */
  let picking = false;
  const root = h('div.empire', {});
  const openCost = (p: Plot) => (p.owner !== null ? FC_OPEN_COST : OPEN_COST);

  const setStore = (id: number, patch: NonNullable<Decisions['stores']>[number]) => {
    draft = { ...draft, stores: { ...draft.stores, [id]: { ...draft.stores?.[id], ...patch } } };
    render();
  };
  const reserved = () => (draft.renovate ?? []).reduce((a, r) => a + RENOVATE_COST[r.kind], 0) + (draft.open ?? []).reduce((a, p) => a + openCost(p), 0);
  const addOpen = (p: Plot) => {
    draft = { ...draft, open: [...(draft.open ?? []), p] };
    picking = false;
    render();
  };
  const samePlot = (a: Plot, b: Plot) => a.kind === b.kind && a.base === b.base && a.rent === b.rent && a.owner === b.owner;

  const storeCard = (orig: Store) => {
    const s = drafted(orig, draft);
    const rep = last?.stores.find((r) => r.id === s.id);
    const need = STAFF_NEEDED[s.hours];
    const renovate = (kind: 'sign' | 'parking', label: string) => {
      if (orig[kind]) return h('span.empire-done', {}, `✓ ${label}`);
      const on = (draft.renovate ?? []).some((r) => r.store === s.id && r.kind === kind);
      return h(
        'button.btn.small',
        {
          class: `btn small ${on ? 'btn-primary' : ''}`,
          'aria-pressed': String(on),
          onclick: () => {
            const rest = (draft.renovate ?? []).filter((r) => !(r.store === s.id && r.kind === kind));
            draft = { ...draft, renovate: on ? rest : [...rest, { store: s.id, kind }] };
            render();
          },
        },
        t(`${label}（${fmt(RENOVATE_COST[kind])}）`, `${label} (${fmt(RENOVATE_COST[kind])})`),
      );
    };
    const order = h('input', { type: 'range', min: ORDER_RANGE[0], max: ORDER_RANGE[1], step: 0.05, value: s.order, 'aria-label': t('発注の多さ', 'Order size') }) as HTMLInputElement;
    order.addEventListener('change', () => setStore(s.id, { order: Number(order.value) }));
    order.addEventListener('input', () => (orderLabel.textContent = `×${Number(order.value).toFixed(2)}`));
    const orderLabel = h('b', {}, `×${s.order.toFixed(2)}`);
    return h(
      'div.empire-store',
      {},
      h('div.empire-store-head', {}, h('b', {}, storeName(s.id)), h('span.muted', {}, t(`見込み日販 ${fmt(Math.round(expectedDemand(s, e.month)))}`, `Expected ${fmt(Math.round(expectedDemand(s, e.month)))}/day`))),
      h(
        'div.empire-store-plot.muted',
        {},
        s.owner !== null
          ? t(`${plotLabel(s.plot)}・加盟店（オーナー ${opts.heroName(s.owner)}）・粗利の ${Math.round(FC_SHARE * 100)}% が本部へ`, `${plotLabel(s.plot)} · franchise (owner ${opts.heroName(s.owner)}) · HQ gets ${Math.round(FC_SHARE * 100)}% of the margin`)
          : t(`${plotLabel(s.plot)}・直営・家賃 ${fmt(s.rent)}`, `${plotLabel(s.plot)} · company-run · rent ${fmt(s.rent)}`),
      ),
      rep ? h('div.empire-store-last', {}, t(`先月　売上 ${money(rep.revenue)}・利益 `, `Last month: sales ${money(rep.revenue)} · profit `), h('b', { class: rep.profit < 0 ? 'bad' : 'good' }, money(rep.profit))) : null,
      h('label.empire-row', {}, h('span', {}, t('発注', 'Order')), order, orderLabel),
      h(
        'div.empire-row',
        {},
        h('span', {}, t('営業時間', 'Hours')),
        ...([16, 24] as const).map((hrs) => h('button.btn.small', { class: `btn small ${s.hours === hrs ? 'btn-primary' : ''}`, 'aria-pressed': String(s.hours === hrs), onclick: () => setStore(s.id, { hours: hrs }) }, t(`${hrs}時間`, `${hrs}h`))),
      ),
      h(
        'div.empire-row',
        {},
        h('span', {}, t('シフト', 'Shifts')),
        h('button.btn.small', { onclick: () => setStore(s.id, { staff: Math.max(0, s.staff - 1) }), 'aria-label': t('減らす', 'Fewer') }, '−'),
        h('b', { class: s.staff < need ? 'bad' : '' }, t(`${s.staff}人`, `${s.staff}`)),
        h('button.btn.small', { onclick: () => setStore(s.id, { staff: Math.min(MAX_STAFF, s.staff + 1) }), 'aria-label': t('増やす', 'More') }, '+'),
        h('span.muted', {}, t(`（回すには ${need} 人）`, `(${need} needed)`)),
      ),
      s.fatigue > 0 ? h('div.empire-row', {}, h('span', {}, t('店主の疲れ', 'Owner fatigue')), h('meter', { min: 0, max: 100, low: 40, high: 60, optimum: 0, value: s.fatigue })) : null,
      h('div.empire-row', {}, h('span', {}, t('改装', 'Upgrades')), renovate('sign', t('看板', 'Sign')), renovate('parking', t('駐車場', 'Parking'))),
    );
  };

  const render = () => {
    const pendingOpen = (draft.open ?? []).length;
    const cap = MAX_STORES[e.phase];
    const canOpen = e.stores.length + pendingOpen < cap;
    const letter = opts.letterHero ? letterFor(e, opts.letterHero.id) : null;
    const letterTaken = !!letter && (draft.open ?? []).some((p) => samePlot(p, letter));
    const openSection = () =>
      h(
        'section.empire-open',
        {},
        h(
          'div.empire-row',
          {},
          h('button.btn.small', { disabled: !canOpen, 'aria-expanded': String(picking), onclick: () => ((picking = !picking), render()) }, t(`＋ 新しい店を出す（${fmt(OPEN_COST)}）`, `+ Open a new store (${fmt(OPEN_COST)})`)),
          h('span.muted', {}, t(`${e.stores.length + pendingOpen} / ${cap} 店`, `${e.stores.length + pendingOpen} / ${cap} stores`)),
        ),
        picking && canOpen
          ? h(
              'div.empire-plots',
              {},
              h('p.muted', {}, t('今月の空き区画です。来月には入れ替わります。', "This month's vacant plots. They change next month.")),
              ...plotsFor(e)
                .filter((p) => !(draft.open ?? []).some((q) => samePlot(p, q)))
                .map((p) =>
                  h(
                    'button.empire-plot',
                    { onclick: () => addOpen(p) },
                    h('b', {}, plotLabel(p.kind)),
                    h('span', {}, t(`基礎日販 ${fmt(p.base)}`, `Base ${fmt(p.base)}/day`)),
                    h('span', {}, t(`家賃 ${fmt(p.rent)}／月`, `Rent ${fmt(p.rent)}/month`)),
                  ),
                ),
            )
          : null,
        ...(draft.open ?? []).map((p, i) =>
          h(
            'div.empire-row.empire-pending',
            {},
            h('span', {}, t(`出店の予定：${plotLabel(p.kind)}（${fmt(openCost(p))}）`, `Planned: ${plotLabel(p.kind)} (${fmt(openCost(p))})`)),
            h('button.btn.small', { onclick: () => ((draft = { ...draft, open: draft.open!.filter((_, j) => j !== i) }), render()) }, t('取り消す', 'Cancel')),
          ),
        ),
      );
    const letterCard =
      letter && opts.letterHero && !letterTaken
        ? h(
            'section.empire-letter',
            {},
            opts.letterHero.image,
            h(
              'div',
              {},
              h('b', {}, t(`${opts.letterHero.name}から手紙が届きました`, `A letter from ${opts.letterHero.name}`)),
              h('p', {}, t(`「うちの酒屋を、あなたのお店の看板で続けたいのです。土地と店はこちらで持ちます」（基礎日販 ${fmt(letter.base)}・家賃なし・粗利の ${Math.round(FC_SHARE * 100)}% が本部へ）`, `"I'd like to keep my liquor store going under your sign. I own the land and the shop." (base ${fmt(letter.base)}/day · no rent · HQ gets ${Math.round(FC_SHARE * 100)}% of the margin)`)),
              h('button.btn.small.btn-primary', { disabled: !canOpen, onclick: () => addOpen(letter) }, t(`加盟を受ける（${fmt(FC_OPEN_COST)}）`, `Accept (${fmt(FC_OPEN_COST)})`)),
            ),
          )
        : null;
    const ready = canPromote(e)
      ? h(
          'section.empire-ready',
          {},
          h('b', {}, t(`条件達成！ ${companyTitle({ ...e, phase: 2 })}へ上がれます`, `Goal met! You can become ${companyTitle({ ...e, phase: 2 })}`)),
          h('button.btn.small', { disabled: true }, t('次の格（エリアチェーン）は次の更新で開きます', 'The next stage (area chain) opens in the next update')),
        )
      : null;
    root.replaceChildren(
      h(
        'div.empire-head',
        {},
        h('div', {}, h('div.empire-title', {}, companyTitle(e)), h('div.muted', {}, t(`${monthLabel(e.month)}・${e.stores.length} 店`, `${monthLabel(e.month)} · ${e.stores.length} store(s)`))),
        h('div.empire-funds', {}, h('span.muted', {}, t('資金', 'Funds')), h('b', {}, money(e.funds)), reserved() > 0 ? h('small.muted', {}, t(`（予定の支払い ${fmt(reserved())}）`, `(planned ${fmt(reserved())})`)) : null),
      ),
      last
        ? h(
            'section.empire-report',
            {},
            h('h3', {}, t(`${monthLabel(last.month)}の報告`, `Report: ${monthLabel(last.month)}`)),
            h(
              'div.stat-grid',
              {},
              h('div.stat-row', {}, h('span', {}, t('売上', 'Sales')), h('b', {}, money(last.revenue))),
              h('div.stat-row', { class: `stat-row ${last.profit < 0 ? 'bad' : ''}` }, h('span', {}, t('利益', 'Profit')), h('b', {}, money(last.profit))),
              h('div.stat-row', {}, h('span', {}, t('本店からの送金', 'From the main shop')), h('b', {}, money(last.inflow ?? 0))),
            ),
            last.notes.length ? h('ul.empire-notes', {}, ...last.notes.map((n) => h('li', { class: n.kind === 'opened' ? 'good' : '' }, noteText(n, e)))) : null,
          )
        : h('p.empire-intro', {}, t('お店の設定を決めて「月を進める」を押すと、1 か月の結果が出ます。発注は多いと欠品が減って廃棄が増え、少ないとその逆です。', 'Set up the store and press "Next month" to see how a month goes. Ordering more means fewer stock-outs but more waste, and less means the opposite.')),
      ...(ready ? [ready] : []),
      ...(letterCard ? [letterCard] : []),
      h('section.empire-stores', {}, ...e.stores.map(storeCard)),
      openSection(),
      h(
        'button.btn.btn-primary.empire-advance',
        {
          onclick: () => {
            const r = advanceMonth(e, draft);
            e = r.state;
            last = r.report;
            draft = {};
            picking = false;
            commit(e);
            render();
            root.scrollIntoView?.({ block: 'start' });
          },
        },
        t('▶ 月を進める', '▶ Next month'),
      ),
    );
  };
  render();
  return root;
}

/** マインちゃんの誘い：屋号を決めて会社を作る */
export function foundView(onFound: (e: EmpireState) => void, mineImg: HTMLElement, land: string | null): HTMLElement {
  const input = h('input.empire-name', { type: 'text', maxlength: 12, value: t('マイクリ', 'MyCrypto'), 'aria-label': t('屋号', 'Company name') }) as HTMLInputElement;
  const seed = () => {
    const b = new Uint32Array(1);
    crypto.getRandomValues(b);
    return b[0];
  };
  return h(
    'div.empire-found',
    {},
    h('div.empire-found-mine', {}, mineImg, h('p', {}, t('店主さん、2 週間もかからずに黄金のエクステンションまで行けるなんて、もう立派な商売人です！ そろそろ、新しいお店を出してみませんか？ この工房は「本店」として、これまでどおり続けられます。', "Owner, you reach the golden extension in under two weeks. You're a real merchant now! How about opening a new store? This workshop carries on as the main shop, just as before."))),
    h('label.empire-row', {}, h('span', {}, t('屋号', 'Company name')), input),
    h('p.muted', {}, t('本店の売上の一部が、営業日を終えるたびに会社の資金になります（会社のお金で工房は強くなりません）。', "Part of the main shop's sales goes into the company's funds after each business day (company money doesn't power up the workshop).")),
    h('button.btn.btn-primary', { onclick: () => onFound(newEmpire(input.value.trim().slice(0, 12) || t('マイクリ', 'MyCrypto'), seed(), land ?? 'Ocean')) }, t('お店を出す', 'Open a store')),
  );
}
