// 経営モードの画面（docs/EMPIRE_DESIGN.md 3・4.1 章）。報告を読み、決め、月を進める。
// テストモードのときだけ読む（main.ts から動的 import）。
import { newEmpire, type EmpireState, type MonthReport, type Note, type Plot, type PlotKind, type Store } from '../empire/model';
import { cannibalMult, CENTER_RANGE, dist, inRange } from '../empire/area';
import {
  advanceMonth,
  AREA_OPEN_COST,
  areaMult,
  canPromote,
  CENTER_COST,
  expectedDemand,
  FC_OPEN_COST,
  FC_SHARE,
  letterFor,
  logistics,
  MAX_STAFF,
  MAX_STORES,
  MAX_SV,
  OPEN_COST,
  ORDER_RANGE,
  ownCells,
  plotsFor,
  POS_COST,
  RENOVATE_COST,
  STAFF_NEEDED,
  SV_SPAN,
  type Decisions,
} from '../empire/sim';
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
export function noteText(n: Note, e?: Pick<EmpireState, 'land' | 'area' | 'nation'>): string {
  const rival = rivalOf(e?.land);
  const rivalName = t(rival.company.ja, rival.company.en);
  const cell = (i: number) => cellName(e?.area?.w ?? 8, i);
  const region = (i: number) => {
    const r = e?.nation?.regions[i];
    return r ? t(r.name.ja, r.name.en) : '?';
  };
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
    case 'hubBuilt':
      return t(`${region(n.region)}に物流拠点と工場ができました。ここから出店できます`, `A hub and factory opened in the ${region(n.region)}. You can open stores there now`);
    case 'needHub':
      return t(`${region(n.region)}には物流拠点がないので、出店できませんでした`, `No stores opened in the ${region(n.region)}: it has no hub yet`);
    case 'traineeLimit':
      return t(`研修所で育った店長・オーナーは月に ${n.trainees} 人まで。残りの出店は来月以降です`, `Only ${n.trainees} managers and owners finish training a month. The rest of the openings wait`);
    case 'qualityWarn':
      return t('「店によって品ぞろえや接客がまちまち」という声が届いています', 'Customers say the stores vary in stock and service');
    case 'manualReady':
      return t('品質が崩れてきました。いまならマニュアルにまとめられます', 'Quality is slipping. Now you know what to write in a manual');
    case 'ownerUnrest':
      return t(`加盟店のオーナーたちの不満が高まっています（満足度 ${n.satisfaction}）。24 時間の強制や近すぎる出店を見直しましょう`, `Franchise owners are growing unhappy (satisfaction ${n.satisfaction}). Rethink forced 24-hour opening and crowded openings`);
    case 'investigationSoon':
      return t('オーナーの会が当局に訴えました。2 か月後に調査が入ります', 'The owners took their case to the authorities. An investigation starts in two months');
    case 'investigation':
      return t(`当局の調査で、制裁金 ${fmt(Math.round(n.fine))} を払いました。24 時間の強制はやめさせられました`, `The investigation ended with a fine of ${fmt(Math.round(n.fine))}. Forced 24-hour opening had to stop`);
    case 'eraSoon':
      return n.strict
        ? t(`${monthLabel(n.month)}から、大きな店の出店規制がまた厳しくなるようです`, `From ${monthLabel(n.month)}, store-opening rules look set to tighten again`)
        : t(`外からの圧力で、${monthLabel(n.month)}から出店規制が緩むようです。ライバルも勢いづきます`, `Under outside pressure, store-opening rules loosen from ${monthLabel(n.month)}. Rivals will speed up too`);
    case 'eraChanged':
      return n.strict ? t('出店規制が厳しくなりました（月の出店に上限・費用が 3 割増し）', 'Opening rules tightened (a monthly cap, and openings cost 30% more)') : t('出店規制が緩みました。ライバルも出店を急いでいます', 'Opening rules loosened. Rivals are opening faster too');
    case 'eraCap':
      return t(`出店規制で、今月の出店は ${n.cap} 店までです`, `Opening rules cap this month at ${n.cap} stores`);
    case 'landSlowing':
      return t('地価の上がり方が鈍ってきました。土地を担保にした借入には気をつけましょう', 'Land prices are rising more slowly. Be careful with land-backed loans');
    case 'landFalling':
      return t('地価が下がり始めました。担保の値打ちが減っていきます', 'Land prices have started to fall. Your collateral is shrinking');
    case 'marginCall':
      return t(`担保割れで、借入 ${fmt(Math.round(n.amount))} を返すよう求められました`, `Collateral fell short: you had to repay ${fmt(Math.round(n.amount))} of loans`);
    case 'ipo':
      return t(`上場しました！ ${fmt(Math.round(n.raised))} を集めました（持分は薄まります）`, `You went public and raised ${fmt(Math.round(n.raised))} (your stake is diluted)`);
    case 'pbUp':
      return t(`PB（自社ブランド）を広げました（${n.level} 段目）。本店の工房の品が店に並びます`, `Private brand expanded (level ${n.level}). Goods from the main workshop hit the shelves`);
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
  /** フェーズ 2：地図で選んでいる区画 */
  let selected: number | null = null;
  const root = h('div.empire', {});
  const openCost = (p: Plot) => (p.owner !== null ? FC_OPEN_COST : OPEN_COST);

  const setStore = (id: number, patch: NonNullable<Decisions['stores']>[number]) => {
    draft = { ...draft, stores: { ...draft.stores, [id]: { ...draft.stores?.[id], ...patch } } };
    render();
  };
  const reserved = () =>
    (draft.renovate ?? []).reduce((a, r) => a + RENOVATE_COST[r.kind], 0) +
    (draft.open ?? []).reduce((a, p) => a + openCost(p), 0) +
    (draft.openAt ?? []).length * AREA_OPEN_COST +
    (draft.buildCenter ?? []).length * CENTER_COST +
    (draft.pos && !e.pos ? POS_COST : 0);
  const toggleIn = (key: 'openAt' | 'buildCenter', cell: number) => {
    const list = draft[key] ?? [];
    draft = { ...draft, [key]: list.includes(cell) ? list.filter((c) => c !== cell) : [...list, cell] };
    render();
  };
  const advance = (extra: Decisions = {}) => {
    const r = advanceMonth(e, { ...draft, ...extra });
    e = r.state;
    last = r.report;
    draft = {};
    picking = false;
    commit(e);
    render();
    root.scrollIntoView?.({ block: 'start' });
  };
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
      h('div.empire-store-head', {}, h('b', {}, storeName(s.id)), h('span.muted', {}, t(`見込み日販 ${fmt(Math.round(expectedDemand(s, e.month, areaMult(e, s))))}`, `Expected ${fmt(Math.round(expectedDemand(s, e.month, areaMult(e, s))))}/day`))),
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
    const next = companyTitle({ ...e, phase: Math.min(5, e.phase + 1) as EmpireState['phase'] });
    const ready = canPromote(e)
      ? h(
          'section.empire-ready',
          {},
          h('b', {}, t(`条件達成！ ${next}へ上がれます`, `Goal met! You can become ${next}`)),
          e.phase === 1
            ? h('p.muted', {}, t('エリアの地図に店を広げていく「エリアチェーン」になります。ライバルも同じ区画を狙ってきます。', 'You become an area chain, spreading stores across an area map. A rival will go after the same plots.'))
            : null,
          e.phase === 1
            ? h('button.btn.small.btn-primary', { onclick: () => advance({ promote: true }) }, t(`${next}になって月を進める`, `Become ${next} and go to next month`))
            : h('button.btn.small', { disabled: true }, t('次の格（全国チェーン）は次の更新で開きます', 'The next stage (national chain) opens in the next update')),
        )
      : null;
    const body = e.phase >= 2 && e.area ? areaBody() : [...(letterCard ? [letterCard] : []), h('section.empire-stores', {}, ...e.stores.map(storeCard)), openSection()];
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
      ...body,
      h('button.btn.btn-primary.empire-advance', { onclick: () => advance() }, t('▶ 月を進める', '▶ Next month')),
    );
  };

  /** フェーズ 2 から：地図・選んだ区画・本部の決定 */
  const areaBody = (): HTMLElement[] => {
    const area = e.area!;
    const rival = rivalOf(e.land);
    const rivalName = t(rival.company.ja, rival.company.en);
    const own = ownCells(e);
    const opens = draft.openAt ?? [];
    const centers = draft.buildCenter ?? [];
    const storeAt = (i: number) => e.stores.find((x) => x.cell === i);
    const cap = MAX_STORES[e.phase];
    const plan = area.rivalPlan;
    const maxBase = Math.max(...area.cells.map((c) => c.base));
    const minBase = Math.min(...area.cells.map((c) => c.base));
    const cellButton = (i: number) => {
      const st = storeAt(i);
      const rivalHere = area.rivalStores.includes(i);
      const centerHere = area.centers.includes(i);
      const heat = (area.cells[i].base - minBase) / Math.max(1, maxBase - minBase);
      const label = st ? String(st.id) : rivalHere ? [...rivalName][0] : centerHere ? '🏭' : opens.includes(i) ? '+' : centers.includes(i) ? '🏗' : '';
      const cls = [
        'empire-cell',
        st ? 'own' : '',
        rivalHere ? 'rival' : '',
        centerHere ? 'center' : '',
        opens.includes(i) || centers.includes(i) ? 'pending' : '',
        plan?.cell === i ? 'rival-plan' : '',
        inRange({ ...area, centers: [...area.centers, ...centers] }, i) ? 'in-range' : '',
        selected === i ? 'selected' : '',
      ].join(' ');
      const what = st ? storeName(st.id) : rivalHere ? rivalName : centerHere ? t('物流センター', 'Distribution center') : t('空き区画', 'Vacant plot');
      return h(
        'button',
        { class: cls, style: `background-color: hsl(36, 45%, ${16 + heat * 28}%)`, 'aria-label': `${cellName(area.w, i)} ${what}`, 'aria-pressed': String(selected === i), onclick: () => ((selected = selected === i ? null : i), render()) },
        label,
      );
    };
    const map = h('div.empire-map', { style: `grid-template-columns: repeat(${area.w}, 1fr)` }, ...area.cells.map((_, i) => cellButton(i)));
    const legend = h(
      'div.empire-legend.muted',
      {},
      t(`数字＝自店　赤い丸＝${rivalName}　🏭＝物流センター　！＝ライバルが狙う区画　明るいほど人通りが多い・枠＝配送圏`, `Number = your store · red = ${rivalName} · 🏭 = distribution center · ! = rival target · brighter = busier · outline = delivery range`),
    );
    const detail = (): HTMLElement | null => {
      if (selected === null) return h('p.muted.empire-detail', {}, t('地図の区画を押すと、くわしく見て出店や物流センターを決められます。', 'Tap a plot on the map to see details and plan a store or a distribution center.'));
      const i = selected;
      const c = area.cells[i];
      const st = storeAt(i);
      const head = h('h3', {}, cellName(area.w, i));
      if (st) {
        const l = logistics(e, st);
        return h(
          'section.empire-detail',
          {},
          head,
          h('p.muted', {}, t(`需要の倍率 ×${areaMult(e, st).toFixed(2)}（知名度・食い合い・SV）・配送費 ${fmt(l.delivery)}／月・原価率 ${Math.round(l.costRate * 100)}%`, `Demand ×${areaMult(e, st).toFixed(2)} (awareness, crowding, SV) · delivery ${fmt(l.delivery)}/month · cost rate ${Math.round(l.costRate * 100)}%`)),
          storeCard(st),
        );
      }
      if (area.rivalStores.includes(i)) return h('section.empire-detail', {}, head, h('p', {}, t(`${rivalName}（${opts.heroName(rival.hero)}）の店です。1 マス隣の店からお客さんを取っていきます。`, `A store of ${rivalName} (${opts.heroName(rival.hero)}). It takes customers from stores next to it.`)));
      if (area.centers.includes(i)) return h('section.empire-detail', {}, head, h('p', {}, t(`物流センター。${CENTER_RANGE} マス以内の店は配送費と原価率が下がります。`, `Distribution center. Stores within ${CENTER_RANGE} plots pay less for delivery and goods.`)));
      const nearOwn = own.filter((x) => dist(area, x, i) <= 1).length;
      const nearRival = area.rivalStores.filter((x) => dist(area, x, i) <= 1).length;
      const crowd = cannibalMult(area, i, [...own, ...opens.filter((x) => x !== i), i]);
      const canOpen = e.stores.length + opens.length < cap || opens.includes(i);
      return h(
        'section.empire-detail',
        {},
        head,
        h(
          'div.stat-grid',
          {},
          h('div.stat-row', {}, h('span', {}, t('基礎日販', 'Base sales')), h('b', {}, fmt(c.base))),
          h('div.stat-row', {}, h('span', {}, t('家賃', 'Rent')), h('b', {}, t(`${fmt(c.rent)}／月`, `${fmt(c.rent)}/mo`))),
          h('div.stat-row', {}, h('span', {}, t('となりの自店・ライバル', 'Next to: yours / rival')), h('b', {}, `${nearOwn} / ${nearRival}`)),
          h('div.stat-row', { class: `stat-row ${crowd < 0.85 ? 'bad' : ''}` }, h('span', {}, t('出したときの食い合い', 'Crowding if opened')), h('b', {}, `×${crowd.toFixed(2)}`)),
        ),
        plan?.cell === i ? h('p.bad', {}, t(`${rivalName}がこの区画を狙っています（${monthLabel(plan.month)}に出店の予定）。先に出せば防げます。`, `${rivalName} is after this plot (planned for ${monthLabel(plan.month)}). Opening here first blocks it.`)) : null,
        h(
          'div.empire-row',
          {},
          h('button.btn.small', { class: `btn small ${opens.includes(i) ? 'btn-primary' : ''}`, disabled: !canOpen || centers.includes(i), 'aria-pressed': String(opens.includes(i)), onclick: () => toggleIn('openAt', i) }, t(`ここに出店（${fmt(AREA_OPEN_COST)}）`, `Open here (${fmt(AREA_OPEN_COST)})`)),
          h('button.btn.small', { class: `btn small ${centers.includes(i) ? 'btn-primary' : ''}`, disabled: opens.includes(i), 'aria-pressed': String(centers.includes(i)), onclick: () => toggleIn('buildCenter', i) }, t(`物流センター（${fmt(CENTER_COST)}）`, `Distribution center (${fmt(CENTER_COST)})`)),
        ),
      );
    };
    const all = draft.all ?? {};
    const setAll = (patch: NonNullable<Decisions['all']>) => {
      draft = { ...draft, all: { ...draft.all, ...patch } };
      render();
    };
    const sv = draft.sv ?? e.sv;
    const advised = Math.ceil(e.stores.length / SV_SPAN);
    const hq = h(
      'section.empire-hq',
      {},
      h('h3', {}, t('本部', 'Headquarters')),
      h(
        'div.empire-row',
        {},
        h('span', {}, t('全店の発注', 'All: order')),
        ...[1.0, 1.1, 1.2].map((o) => h('button.btn.small', { class: `btn small ${all.order === o ? 'btn-primary' : ''}`, onclick: () => setAll({ order: o }) }, `×${o.toFixed(1)}`)),
      ),
      h(
        'div.empire-row',
        {},
        h('span', {}, t('全店の営業', 'All: hours')),
        ...([16, 24] as const).map((hrs) => h('button.btn.small', { class: `btn small ${all.hours === hrs ? 'btn-primary' : ''}`, onclick: () => setAll({ hours: hrs, staff: STAFF_NEEDED[hrs] }) }, t(`${hrs}時間（${STAFF_NEEDED[hrs]}人）`, `${hrs}h (${STAFF_NEEDED[hrs]} staff)`))),
      ),
      h(
        'div.empire-row',
        {},
        h('span', {}, 'SV'),
        h('button.btn.small', { onclick: () => ((draft = { ...draft, sv: Math.max(0, sv - 1) }), render()), 'aria-label': t('減らす', 'Fewer') }, '−'),
        h('b', { class: sv < advised ? 'bad' : '' }, t(`${sv}人`, `${sv}`)),
        h('button.btn.small', { onclick: () => ((draft = { ...draft, sv: Math.min(MAX_SV, sv + 1) }), render()), 'aria-label': t('増やす', 'More') }, '+'),
        h('span.muted', {}, t(`（1 人で ${SV_SPAN} 店。目安 ${advised} 人）`, `(${SV_SPAN} stores each · advised ${advised})`)),
      ),
      h(
        'div.empire-row',
        {},
        h('span', {}, 'POS'),
        e.pos
          ? h('span.empire-done', {}, t('✓ 導入済み', '✓ Installed'))
          : h('button.btn.small', { class: `btn small ${draft.pos ? 'btn-primary' : ''}`, 'aria-pressed': String(!!draft.pos), onclick: () => ((draft = { ...draft, pos: !draft.pos }), render()) }, t(`POS を入れる（${fmt(POS_COST)}）`, `Install POS (${fmt(POS_COST)})`)),
      ),
    );
    return [
      h('p.empire-rivalbar', {}, t(`${companyTitle(e)} ${e.stores.length} 店　対　${rivalName} ${area.rivalStores.length} 店`, `${companyTitle(e)} ${e.stores.length} vs ${rivalName} ${area.rivalStores.length}`), h('span.muted', {}, t(`（出店 ${e.stores.length + opens.length} / ${cap}）`, ` (planned ${e.stores.length + opens.length} / ${cap})`))),
      map,
      legend,
      ...[detail()].filter((x): x is HTMLElement => !!x),
      hq,
    ];
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
