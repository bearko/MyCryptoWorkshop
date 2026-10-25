// 選んだ物の詳しい情報と、その場でできること（区画・店・エリア・本部・稟議）。
// 判断に要る数字（費用と見込み）は、必ずボタンの横に出す（docs/design.md 3 章）。
import { cannibalMult, CENTER_RANGE, dist, inRange } from '../../empire/area';
import type { EmpireState, MonthReport, Plot, Store } from '../../empire/model';
import {
  borrowable,
  collateral,
  ERA,
  HUB_COST,
  MANUAL_COST,
  MANUAL_UNLOCK,
  OPEN_COSTS,
  PB,
  perStoreDaily,
  regionStores,
  ROYALTY,
  SATISFACTION,
  SUPPORT_COST,
  TRAINEES,
  trainees,
  TRAINING_COST,
  type StoreType,
} from '../../empire/nation';
import { rivalOf } from '../../empire/rivals';
import {
  areaMult,
  landDemand,
  focusChangeCost,
  AREA_OPEN_COST,
  canIpo,
  CENTER_COST,
  expectedDemand,
  FC_OPEN_COST,
  FC_SHARE,
  ipoRaise,
  logistics,
  MAX_STAFF,
  MAX_STORES,
  MAX_SV,
  OPEN_COST,
  ORDER_RANGE,
  ownCells,
  POS_COST,
  RENOVATE_COST,
  STAFF_NEEDED,
  SV_SPAN,
  type Decisions,
} from '../../empire/sim';
import { t } from '../../i18n';
import { h } from '../dom';
import { costButton, row, segmented, stepper, svgIcon } from './parts';
import { bidLabel, businessName, cellName, defenseLabel, landRival, entryLabel, focusLabel, monthLabel, money, offeringLabel, plotLabel, pledgeLabel, storeName } from './text';
import { articlesField } from './govern';
import type { Articles } from '../../empire/governance';
import { FOCUS_CHANGE_PER_STORE, landProfile } from '../../empire/lands';
import { focusPicker } from './landui';
import { counterCost } from '../../empire/rivalai';
import { branchDecisionCost, branchOf, buyoutCost, ENTRY, entryCost, exitValue, routeCost } from '../../empire/world';
import { BUSINESS, SELL_BACK as SELL_BACK_RATE, tableChangeCost } from '../../empire/business';
const BUSINESS_COST = (b: keyof typeof BUSINESS) => BUSINESS[b].cost;
import { bidCost } from '../../empire/group';
import { isLegend, plotRoom } from '../../empire/nation';
import { diversifyCost, inspectCost } from '../../empire/crisis';
import { MNA, mboCost, RAID, stepPrice, tobPrice } from '../../empire/mna';

export type SoundKey = 'build' | 'sale' | 'rare' | 'win' | 'debuff' | 'fail' | 'helper' | 'unlock' | 'craft' | 'buff' | 'clean';

export interface Ctx {
  e: EmpireState;
  draft: Decisions;
  last: MonthReport | null;
  /** 下書きを変えて描き直す（音を鳴らすなら key） */
  set(fn: (d: Decisions) => Decisions, sound?: SoundKey): void;
  /** 今月の稟議を払ったあとに残る資金 */
  fundsLeft(): number;
  heroName(id: number): string;
}

/** 上場のときの定款の初期値（いまの 24 時間の方針を引き継ぐ） */
const defaultArticles = (force24: boolean): Articles => ({ force24, mix: 'balanced', dividend: 1 });

const pct = (v: number) => `${Math.round(v * 100)}%`;
const storeDecision = (d: Decisions, id: number, patch: NonNullable<Decisions['stores']>[number]): Decisions => ({ ...d, stores: { ...d.stores, [id]: { ...d.stores?.[id], ...patch } } });

/** 決定の下書きを当てた店（見込みの計算に使う） */
export function drafted(s: Store, d: Decisions): Store {
  const c = { ...d.all, ...d.stores?.[s.id] };
  const r = d.renovate ?? [];
  return { ...s, ...c, sign: s.sign || r.some((x) => x.store === s.id && x.kind === 'sign'), parking: s.parking || r.some((x) => x.store === s.id && x.kind === 'parking') };
}

const openCost = (p: Plot) => (p.owner !== null ? FC_OPEN_COST : OPEN_COST);

/** 今月の稟議（下書き）の合計 */
export function reserved(e: EmpireState, d: Decisions): number {
  return (
    (d.renovate ?? []).reduce((a, r) => a + RENOVATE_COST[r.kind], 0) +
    (d.open ?? []).reduce((a, p) => a + openCost(p), 0) +
    (d.openAt ?? []).length * AREA_OPEN_COST +
    (d.buildCenter ?? []).length * CENTER_COST +
    (d.pos && !e.pos ? POS_COST : 0) +
    (d.expand ?? []).reduce((a, x) => a + x.count * OPEN_COSTS[x.type] * (e.nation?.eraStrict ? ERA.strictCost : 1), 0) +
    (d.buildHub ?? []).length * HUB_COST +
    (d.training ?? 0) * TRAINING_COST +
    (d.manual && !e.nation?.manual ? MANUAL_COST : 0) +
    (d.pb ? PB.cost : 0) +
    (d.enter ? routeCost(e) + entryCost(d.enter.mode) : 0) +
    Object.entries(d.branches ?? {}).reduce((a, [land, bd]) => a + branchDecisionCost(e, land, bd), 0) +
    groupCost(e, d) +
    (d.inspect ? inspectCost(e) : 0) +
    (d.diversify ? diversifyCost(e) : 0) +
    mnaCost(e, d)
  );
}

/** M&A の下書きの費用：市場で買う・公開買付け・統合・防衛策 */
function mnaCost(e: EmpireState, d: Decisions): number {
  const m = d.mna;
  if (!m) return 0;
  return (
    (m.buy ?? []).reduce((a, land) => a + stepPrice(e, land), 0) +
    (m.tob ? tobPrice(e, m.tob.land, m.tob.premium) : 0) +
    (m.pmi ?? []).length * MNA.pmiCost +
    (m.defense === 'stable' ? RAID.stableCost : m.defense === 'mbo' ? mboCost(e) : 0)
  );
}

/** フェーズ 5 の下書きの費用：会議卓の並べ替え（外すと戻る）と、地主会の付け値（地主会の月だけ） */
function groupCost(e: EmpireState, d: Decisions): number {
  if (!e.group) return 0;
  const ch = d.table ? tableChangeCost(e.group.table, d.table) : { cost: 0, refund: 0 };
  const bids = e.month === e.group.nextAuction ? Object.values(d.bids ?? {}).reduce((a, b) => a + bidCost(e, b), 0) : 0;
  return ch.cost - ch.refund + bids;
}

/** 足りないときの理由（押せないボタンの下に出す） */
const lack = (ctx: Ctx, cost: number) => (ctx.fundsLeft() < cost ? t(`資金があと ${money(cost - ctx.fundsLeft())} 足りません`, `${money(cost - ctx.fundsLeft())} short`) : null);

export function card(title: string, sub: string | null, ...children: (Node | null | false)[]): HTMLElement {
  return h('div.ke-card', {}, h('div.ke-card-head', {}, h('h3.ke-card-title', {}, title), sub ? h('span.ke-card-sub', {}, sub) : null), ...children.filter((c): c is Node => !!c));
}

// ---------------------------------------------------------------- 店（フェーズ 1〜2）

export function storeCard(ctx: Ctx, orig: Store): HTMLElement {
  const { e, draft } = ctx;
  const s = drafted(orig, draft);
  const rep = ctx.last?.stores.find((r) => r.id === s.id);
  const need = STAFF_NEEDED[s.hours];
  const daily = expectedDemand(s, e.month, areaMult(e, s) * landDemand(e));
  const renov = (kind: 'sign' | 'parking', label: string, effect: string) => {
    if (orig[kind]) return h('span.ke-done', {}, t(`✓ ${label}`, `✓ ${label}`));
    const on = (draft.renovate ?? []).some((r) => r.store === s.id && r.kind === kind);
    return costButton(
      t(`${label}（${effect}）`, `${label} (${effect})`),
      RENOVATE_COST[kind],
      () =>
        ctx.set((d) => {
          const rest = (d.renovate ?? []).filter((r) => !(r.store === s.id && r.kind === kind));
          return { ...d, renovate: on ? rest : [...rest, { store: s.id, kind }] };
        }, on ? undefined : 'build'),
      { pressed: on, disabled: on ? null : lack(ctx, RENOVATE_COST[kind]) },
    );
  };
  const orderPct = Math.round(s.order * 100);
  return card(
    storeName(s.id),
    s.owner !== null ? t(`${plotLabel(s.plot)}・加盟店（${ctx.heroName(s.owner)}）`, `${plotLabel(s.plot)} · franchise (${ctx.heroName(s.owner)})`) : t(`${plotLabel(s.plot)}・直営`, `${plotLabel(s.plot)} · company-run`),
    h(
      'div.ke-paper',
      {},
      rep ? row(t('先月の売上', 'Sales last month'), money(rep.revenue)) : null,
      rep ? row(t('先月の利益', 'Profit last month'), money(rep.profit), rep.profit < 0 ? 'bad' : 'good') : null,
      row(t('見込みの日販', 'Expected daily sales'), money(Math.round(daily))),
      s.owner !== null ? row(t('本部の取り分', 'HQ share'), t(`粗利の ${pct(FC_SHARE)}`, `${pct(FC_SHARE)} of margin`)) : row(t('家賃', 'Rent'), t(`${money(s.rent)}／月`, `${money(s.rent)}/mo`)),
    ),
    h(
      'div.ke-field',
      {},
      h('span.ke-field-label', {}, t('発注の多さ', 'Order size'), h('span.ke-hint', {}, t('多いと欠品が減り、廃棄が増える', 'More: fewer stock-outs, more waste'))),
      stepper(
        `×${(orderPct / 100).toFixed(2)}`,
        s.order > ORDER_RANGE[0] + 1e-9 ? () => ctx.set((d) => storeDecision(d, s.id, { order: Math.max(ORDER_RANGE[0], +(s.order - 0.05).toFixed(2)) })) : null,
        s.order < ORDER_RANGE[1] - 1e-9 ? () => ctx.set((d) => storeDecision(d, s.id, { order: Math.min(ORDER_RANGE[1], +(s.order + 0.05).toFixed(2)) })) : null,
        t('発注', 'order'),
      ),
    ),
    h(
      'div.ke-field',
      {},
      h('span.ke-field-label', {}, t('営業時間', 'Hours'), h('span.ke-hint', {}, t('24 時間は夜も売れるが、4 人要る', '24h sells at night too but needs 4 staff'))),
      segmented(
        t('営業時間', 'Hours'),
        [
          { value: 16, text: t('16 時間', '16h') },
          { value: 24, text: t('24 時間', '24h') },
        ],
        s.hours,
        (v) => ctx.set((d) => storeDecision(d, s.id, { hours: v as 16 | 24, staff: Math.max(s.staff, STAFF_NEEDED[v as 16 | 24]) })),
      ),
    ),
    h(
      'div.ke-field',
      {},
      h('span.ke-field-label', {}, t('シフト', 'Shifts'), h('span', { class: `ke-hint ${s.staff < need ? 'ke-bad' : ''}` }, t(`回すには ${need} 人`, `${need} needed`))),
      stepper(
        t(`${s.staff} 人`, `${s.staff}`),
        s.staff > 0 ? () => ctx.set((d) => storeDecision(d, s.id, { staff: s.staff - 1 })) : null,
        s.staff < MAX_STAFF ? () => ctx.set((d) => storeDecision(d, s.id, { staff: s.staff + 1 })) : null,
        t('シフト', 'staff'),
      ),
    ),
    s.fatigue > 0 ? h('div.ke-field', {}, h('span.ke-field-label', {}, t('店主の疲れ', 'Owner fatigue')), h('meter', { min: 0, max: 100, low: 40, high: 60, optimum: 0, value: s.fatigue })) : null,
    h('div.ke-actions', {}, renov('sign', t('看板', 'Sign'), t('客 +8%', '+8% customers')), renov('parking', t('駐車場', 'Parking'), t('客 +12%', '+12% customers'))),
  );
}

// ---------------------------------------------------------------- 出店候補（フェーズ 1）

/** 候補の区画の、ざっくりした月の利益（16 時間・発注 ×1.1・原価 75%） */
/** 候補の区画の、月の利益の見込み（ランドの文化と人の多さ、家賃の倍率をかける） */
export const plotProfit = (p: Plot, e?: Pick<EmpireState, 'land' | 'focus'>) => {
  const d = e ? landDemand(e) : 1;
  const r = e ? landProfile(e.land).rent : 1;
  return Math.round(p.base * d * 30 * (p.owner !== null ? 0.25 * FC_SHARE : 0.25) - p.rent * r - (p.owner !== null ? 0 : 3 * 90_000));
};

export function plotCard(ctx: Ctx, p: Plot, planned: boolean, onToggle: () => void): HTMLElement {
  const { e, draft } = ctx;
  const cap = MAX_STORES[e.phase];
  const count = e.stores.length + (draft.open ?? []).length;
  const full = !planned && count >= cap;
  const est = plotProfit(p, ctx.e);
  return card(
    plotLabel(p.kind),
    t('今月の空き区画（来月には入れ替わる）', "This month's vacant plot (changes next month)"),
    h(
      'div.ke-paper',
      {},
      row(t('基礎日販', 'Base sales/day'), money(p.base)),
      row(t('家賃', 'Rent'), p.rent ? t(`${money(p.rent)}／月`, `${money(p.rent)}/mo`) : t('なし', 'none')),
      row(t('月の利益の見込み', 'Est. monthly profit'), money(est), est < 0 ? 'bad' : 'good'),
    ),
    costButton(planned ? t('出店を取り消す', 'Cancel opening') : t('ここに出店する', 'Open here'), openCost(p), onToggle, {
      pressed: planned,
      primary: !planned,
      disabled: planned ? null : full ? t(`いまの格では ${cap} 店までです`, `Up to ${cap} stores at this stage`) : lack(ctx, openCost(p)),
    }),
  );
}

export function letterCard(ctx: Ctx, hero: { name: string; image: HTMLElement }, letter: Plot, planned: boolean, onToggle: () => void): HTMLElement {
  const cap = MAX_STORES[ctx.e.phase];
  const full = !planned && ctx.e.stores.length + (ctx.draft.open ?? []).length >= cap;
  return h(
    'div.ke-letter',
    {},
    h('div.ke-letter-face', {}, hero.image),
    h(
      'div.ke-letter-body',
      {},
      h('b', {}, t(`${hero.name}から手紙`, `A letter from ${hero.name}`)),
      h('p', {}, t('「うちの酒屋を、あなたの店の看板で続けたいのです。土地と店はこちらで持ちます」', '"I\'d like to keep my liquor store going under your sign. I own the land and the shop."')),
      h('div.ke-paper', {}, row(t('基礎日販', 'Base sales/day'), money(letter.base)), row(t('家賃', 'Rent'), t('なし', 'none')), row(t('本部の取り分', 'HQ share'), t(`粗利の ${pct(FC_SHARE)}`, `${pct(FC_SHARE)} of margin`))),
      costButton(planned ? t('加盟を取り消す', 'Cancel') : t('加盟を受ける', 'Accept'), FC_OPEN_COST, onToggle, { pressed: planned, primary: !planned, disabled: planned ? null : full ? t(`いまの格では ${cap} 店までです`, `Up to ${cap} stores`) : lack(ctx, FC_OPEN_COST) }),
    ),
  );
}

// ---------------------------------------------------------------- 区画（フェーズ 2）

export function lotCard(ctx: Ctx, i: number): HTMLElement {
  const { e, draft } = ctx;
  const area = e.area!;
  const rival = rivalOf(e.land);
  const rivalName = t(rival.company.ja, rival.company.en);
  const st = e.stores.find((x) => x.cell === i);
  const name = cellName(area.w, i);
  if (st) {
    const l = logistics(e, st);
    const c = storeCard(ctx, st);
    c.querySelector('.ke-paper')?.append(row(t('配送費', 'Delivery'), t(`${money(l.delivery)}／月`, `${money(l.delivery)}/mo`)), row(t('原価率', 'Cost rate'), pct(l.costRate)), row(t('需要の倍率', 'Demand ×'), `×${areaMult(e, st).toFixed(2)}`));
    c.querySelector('.ke-card-sub')!.textContent = `${name}　${c.querySelector('.ke-card-sub')!.textContent}`;
    return c;
  }
  if (area.rivalStores.includes(i)) return card(name, rivalName, h('p.ke-note', {}, t(`${rivalName}（${ctx.heroName(rival.hero)}）の店です。1 マス隣の店からお客さんを取っていきます。`, `A store of ${rivalName} (${ctx.heroName(rival.hero)}). It takes customers from stores next to it.`)));
  if (area.centers.includes(i)) return card(name, t('物流センター', 'Distribution center'), h('p.ke-note', {}, t(`${CENTER_RANGE} マス以内の店は、配送費と原価率が下がります。`, `Stores within ${CENTER_RANGE} plots pay less for delivery and goods.`)));
  const c = area.cells[i];
  const own = ownCells(e);
  const opens = draft.openAt ?? [];
  const centers = draft.buildCenter ?? [];
  const nearOwn = own.filter((x) => dist(area, x, i) <= 1).length;
  const nearRival = area.rivalStores.filter((x) => dist(area, x, i) <= 1).length;
  const crowd = cannibalMult(area, i, [...own, ...opens.filter((x) => x !== i), i]);
  const covered = inRange({ ...area, centers: [...area.centers, ...centers] }, i);
  const cap = MAX_STORES[e.phase];
  const planned = opens.includes(i);
  const plannedCenter = centers.includes(i);
  const full = !planned && e.stores.length + opens.length >= cap;
  const plan = area.rivalPlan;
  return card(
    name,
    t('空き区画', 'Vacant plot'),
    plan?.cell === i ? h('p.ke-alert', {}, t(`${rivalName}がこの区画を狙っています（${monthLabel(plan.month)}）。先に出せば防げます。`, `${rivalName} is after this plot (${monthLabel(plan.month)}). Open first to block it.`)) : null,
    h(
      'div.ke-paper',
      {},
      row(t('基礎日販', 'Base sales/day'), money(c.base)),
      row(t('家賃', 'Rent'), t(`${money(c.rent)}／月`, `${money(c.rent)}/mo`)),
      row(t('となりの自店・ライバル', 'Next to: yours / rival'), `${nearOwn} / ${nearRival}`),
      row(t('出したときの食い合い', 'Crowding if opened'), `×${crowd.toFixed(2)}`, crowd < 0.85 ? 'bad' : ''),
      row(t('物流センターの配送圏', 'Delivery range'), covered ? t('入っている', 'inside') : t('外', 'outside'), covered ? 'good' : 'bad'),
    ),
    h(
      'div.ke-actions',
      {},
      costButton(planned ? t('出店を取り消す', 'Cancel') : t('ここに出店', 'Open here'), AREA_OPEN_COST, () => ctx.set((d) => ({ ...d, openAt: planned ? (d.openAt ?? []).filter((x) => x !== i) : [...(d.openAt ?? []), i], buildCenter: (d.buildCenter ?? []).filter((x) => x !== i) }), planned ? undefined : 'build'), {
        pressed: planned,
        primary: !planned,
        disabled: planned ? null : full ? t(`いまの格では ${cap} 店までです`, `Up to ${cap} stores`) : lack(ctx, AREA_OPEN_COST),
      }),
      costButton(plannedCenter ? t('センターを取り消す', 'Cancel center') : t('物流センター', 'Distribution center'), CENTER_COST, () => ctx.set((d) => ({ ...d, buildCenter: plannedCenter ? (d.buildCenter ?? []).filter((x) => x !== i) : [...(d.buildCenter ?? []), i], openAt: (d.openAt ?? []).filter((x) => x !== i) }), plannedCenter ? undefined : 'build'), {
        pressed: plannedCenter,
        disabled: plannedCenter ? null : lack(ctx, CENTER_COST),
      }),
    ),
  );
}

/** フェーズ 2 の本部：全店の方針・SV・POS */
export function hqCard2(ctx: Ctx): HTMLElement {
  const { e, draft } = ctx;
  const all = draft.all ?? {};
  const sv = draft.sv ?? e.sv;
  const advised = Math.ceil(e.stores.length / SV_SPAN);
  return card(
    t('本部の方針', 'Head office'),
    t('全店にまとめて効く', 'Applies to every store'),
    h('div.ke-field', {}, h('span.ke-field-label', {}, t('全店の発注', 'Order (all)')), segmented(t('全店の発注', 'Order (all)'), [1.0, 1.1, 1.2].map((o) => ({ value: o, text: `×${o.toFixed(1)}` })), all.order ?? -1, (o) => ctx.set((d) => ({ ...d, all: { ...d.all, order: o } })))),
    h(
      'div.ke-field',
      {},
      h('span.ke-field-label', {}, t('全店の営業', 'Hours (all)')),
      segmented(
        t('全店の営業', 'Hours (all)'),
        ([16, 24] as const).map((x) => ({ value: x, text: t(`${x} 時間（${STAFF_NEEDED[x]} 人）`, `${x}h (${STAFF_NEEDED[x]})`) })),
        all.hours ?? -1,
        (x) => ctx.set((d) => ({ ...d, all: { ...d.all, hours: x as 16 | 24, staff: STAFF_NEEDED[x as 16 | 24] } })),
      ),
    ),
    h(
      'div.ke-field',
      {},
      h('span.ke-field-label', {}, 'SV', h('span', { class: `ke-hint ${sv < advised ? 'ke-bad' : ''}` }, t(`1 人で ${SV_SPAN} 店・目安 ${advised} 人`, `${SV_SPAN} stores each · advised ${advised}`))),
      stepper(t(`${sv} 人`, `${sv}`), sv > 0 ? () => ctx.set((d) => ({ ...d, sv: sv - 1 })) : null, sv < MAX_SV ? () => ctx.set((d) => ({ ...d, sv: sv + 1 })) : null, 'SV'),
    ),
    e.pos
      ? h('span.ke-done', {}, t('✓ POS 導入済み', '✓ POS installed'))
      : costButton(t('POS を入れる（天気のぶれを発注に織りこむ）', 'Install POS (weather-aware orders)'), POS_COST, () => ctx.set((d) => ({ ...d, pos: !d.pos }), draft.pos ? undefined : 'build'), { pressed: !!draft.pos, disabled: draft.pos ? null : lack(ctx, POS_COST) }),
  );
}

// ---------------------------------------------------------------- エリア（フェーズ 3）

const RARITY_NAME = ['Common', 'Uncommon', 'Rare', 'Epic', 'Legendary'];

export function regionCard(ctx: Ctx, ri: number, onEnter: () => void): HTMLElement {
  const { e, draft } = ctx;
  const n = e.nation!;
  const r = n.regions[ri];
  const rival = rivalOf(e.land);
  const rivalName = t(rival.company.ja, rival.company.en);
  const expand = draft.expand ?? [];
  const hubs = draft.buildHub ?? [];
  const staff = trainees(n) + (draft.training ?? 0) * TRAINEES.perCenter;
  const people = n.eraStrict ? Math.min(staff, ERA.strictCap) : staff;
  const used = expand.reduce((a, x) => a + x.count, 0);
  const planned = (type: StoreType) => expand.find((x) => x.region === ri && x.type === type)?.count ?? 0;
  const setPlan = (type: StoreType, count: number) =>
    ctx.set((d) => {
      const rest = (d.expand ?? []).filter((x) => !(x.region === ri && x.type === type));
      return { ...d, expand: count > 0 ? [...rest, { region: ri, type, count }] : rest };
    });
  const own = regionStores(r);
  const plannedHere = (['direct', 'fcOwner', 'fcHq'] as const).reduce((a, k) => a + planned(k), 0);
  const canOpen = (r.hub || ri === 0 || hubs.includes(ri)) && !r.locked;
  // Legendary は地主会で落札した区画の数まで
  const legend = isLegend(r) && !r.locked;
  const room = plotRoom(r);
  const share = (x: number) => Math.round((x / Math.max(1, r.capacity)) * 100);
  const typeLabel: Record<StoreType, string> = { direct: t('直営', 'Company-run'), fcOwner: t('加盟（オーナーの土地）', 'Franchise (owner land)'), fcHq: t('加盟（本部の土地）', 'Franchise (HQ land)') };
  const typeNote: Record<StoreType, string> = {
    direct: t('利益まるごと・人件費と家賃も本部', 'All profit; HQ pays staff and rent'),
    fcOwner: t(`粗利の ${pct(ROYALTY.fcOwner)}`, `${pct(ROYALTY.fcOwner)} of margin`),
    fcHq: t(`粗利の ${pct(ROYALTY.fcHq)}・家賃は本部`, `${pct(ROYALTY.fcHq)} of margin; HQ pays rent`),
  };
  const cost = (type: StoreType) => OPEN_COSTS[type] * (n.eraStrict ? ERA.strictCost : 1);
  return card(
    t(r.name.ja, r.name.en),
    t(`${RARITY_NAME[r.rarity]}　${r.locked ? 'フェーズ 5 で開く' : `入りきる目安 ${r.capacity} 店`}`, `${RARITY_NAME[r.rarity]} · ${r.locked ? 'opens in phase 5' : `room ~${r.capacity}`}`),
    h(
      'div.ke-share',
      { role: 'img', 'aria-label': t(`自社 ${own} 店・${rivalName} ${r.rival} 店・目安 ${r.capacity}`, `Yours ${own}, ${rivalName} ${r.rival}, room ${r.capacity}`) },
      h('span.ke-share-ours', { style: `width:${Math.min(100, share(own))}%` }),
      plannedHere ? h('span.ke-share-plan', { style: `width:${Math.min(100 - share(own), share(plannedHere))}%` }) : null,
      h('span.ke-share-rival', { style: `width:${Math.min(100, share(r.rival))}%` }),
    ),
    h(
      'div.ke-paper',
      {},
      row(t('自社の店', 'Your stores'), plannedHere ? t(`${own}（+${plannedHere}）`, `${own} (+${plannedHere})`) : String(own), 'good'),
      row(rivalName, String(r.rival), 'bad'),
      row(t('1 店の日販', 'Daily sales per store'), money(Math.round(perStoreDaily(r, n.quality)))),
      legend ? row(t('区画（自社・ライバル）', 'Plots (you · rival)'), `${r.plots ?? 0} · ${r.rivalPlots ?? r.rival}`, room > 0 ? 'good' : '') : null,
      row(t('物流拠点', 'Hub'), r.hub || ri === 0 ? t('あり', 'yes') : hubs.includes(ri) ? t('今月建てる', 'this month') : t('なし', 'none'), r.hub || ri === 0 || hubs.includes(ri) ? 'good' : 'bad'),
    ),
    r.locked
      ? h('p.ke-note', {}, t('Legendary のエリアは、グループ（フェーズ 5）になってから競りで区画を取りに行きます。', 'Legendary areas open in phase 5, where plots are won at auction.'))
      : !(r.hub || ri === 0)
        ? costButton(hubs.includes(ri) ? t('物流拠点を取り消す', 'Cancel hub') : t('物流拠点と工場を建てる', 'Build hub and factory'), HUB_COST, () => ctx.set((d) => ({ ...d, buildHub: hubs.includes(ri) ? hubs.filter((x) => x !== ri) : [...hubs, ri] }), hubs.includes(ri) ? undefined : 'build'), {
            pressed: hubs.includes(ri),
            primary: !hubs.includes(ri),
            disabled: hubs.includes(ri) ? null : lack(ctx, HUB_COST),
          })
        : null,
    canOpen
      ? h(
          'div.ke-expand',
          {},
          h('span.ke-field-label', {}, t('今月の出店', 'Openings this month'), h('span', { class: `ke-hint ${used >= people ? 'ke-bad' : ''}` }, t(`研修で育った人 ${people - used} / ${people} 人`, `${people - used} / ${people} trainees left`))),
          ...(['direct', 'fcOwner', 'fcHq'] as const).map((type) =>
            h(
              'div.ke-expand-row',
              {},
              h('span.ke-expand-name', {}, typeLabel[type], h('span.ke-hint', {}, t(`${money(cost(type))}・${typeNote[type]}`, `${money(cost(type))} · ${typeNote[type]}`))),
              stepper(String(planned(type)), planned(type) > 0 ? () => setPlan(type, planned(type) - 1) : null, used < people && plannedHere < room && ctx.fundsLeft() >= cost(type) ? () => setPlan(type, planned(type) + 1) : null, typeLabel[type]),
            ),
          ),
        )
      : null,
    legend ? h('p.ke-hint', {}, room > 0 ? t(`落札した区画に、あと ${room} 店出せます`, `${room} more stores fit on your plots`) : t('区画は年に 1 度の地主会で落札します（指示の「地主会」）', 'Win plots at the yearly auction (Commands → Auction)')) : null,
    h('button.ke-link', { type: 'button', onclick: onEnter }, t('エリアの地図を見る', 'View the area map'), svgIcon('chevron-right', 16)),
  );
}

/** フェーズ 3 の本部：研修・品質・オーナー・時代・借入・PB・上場 */
export function hqCard3(ctx: Ctx): HTMLElement {
  const { e, draft } = ctx;
  const n = e.nation!;
  const support = draft.support ?? n.support;
  const force24 = draft.force24 ?? n.force24;
  const fcCount = n.regions.reduce((a, r) => a + r.fcOwner + r.fcHq, 0);
  const room = borrowable(n);
  const training = draft.training ?? 0;
  return card(
    t('本部', 'Head office'),
    n.eraStrict ? t(`出店規制が厳しい時代（${monthLabel(n.eraChange)}まで・月 ${ERA.strictCap} 店）`, `Strict era until ${monthLabel(n.eraChange)} (${ERA.strictCap}/month)`) : t(`出店規制が緩い時代（${monthLabel(n.eraChange)}まで・ライバルも速い）`, `Loose era until ${monthLabel(n.eraChange)} (rivals are fast too)`),
    h(
      'div.ke-field',
      {},
      h('span.ke-field-label', {}, t('研修所', 'Training centers'), h('span.ke-hint', {}, t(`1 つで月に ${TRAINEES.perCenter} 人育つ（${money(TRAINING_COST)}）`, `${TRAINEES.perCenter} trainees/month each (${money(TRAINING_COST)})`))),
      stepper(training ? `${n.trainingCenters} +${training}` : String(n.trainingCenters), training > 0 ? () => ctx.set((d) => ({ ...d, training: training - 1 })) : null, ctx.fundsLeft() >= TRAINING_COST ? () => ctx.set((d) => ({ ...d, training: training + 1 }), 'build') : null, t('研修所', 'centers')),
    ),
    h(
      'div.ke-field',
      {},
      h('span.ke-field-label', {}, t('品質', 'Quality'), h('span.ke-hint', {}, pct(n.quality))),
      h('meter', { min: 0.5, max: 1, low: 0.85, high: 0.95, optimum: 1, value: n.quality }),
      n.manual
        ? h('span.ke-done', {}, t('✓ マニュアル', '✓ Manual'))
        : costButton(t('マニュアルを整える', 'Write a manual'), MANUAL_COST, () => ctx.set((d) => ({ ...d, manual: !d.manual })), { pressed: !!draft.manual, disabled: n.quality >= MANUAL_UNLOCK ? t('品質が崩れてからでないと、何を書けばよいか分かりません', "You can't know what to write until quality slips") : draft.manual ? null : lack(ctx, MANUAL_COST) }),
    ),
    fcCount > 0
      ? h(
          'div.ke-field',
          {},
          h('span.ke-field-label', {}, t('加盟オーナー', 'Franchise owners'), h('span', { class: `ke-hint ${n.satisfaction < SATISFACTION.warn ? 'ke-bad' : ''}` }, t(`満足度 ${Math.round(n.satisfaction)}`, `satisfaction ${Math.round(n.satisfaction)}`))),
          h('meter', { min: 0, max: 100, low: SATISFACTION.complaint, high: SATISFACTION.warn, optimum: 100, value: n.satisfaction }),
          segmented(
            t('24 時間営業', '24-hour opening'),
            [
              { value: false, text: t('求めない', 'Optional') },
              { value: true, text: t('24 時間を求める（売上 +12%）', 'Require 24h (+12% sales)') },
            ],
            force24,
            (v) => ctx.set((d) => ({ ...d, force24: v }), v ? 'debuff' : undefined),
          ),
          h(
            'div.ke-field-inline',
            {},
            h('span', {}, t('支援', 'Support'), h('span.ke-hint', {}, t(`1 段で 1 店 ${money(SUPPORT_COST)}／月`, `${money(SUPPORT_COST)}/store/mo per level`))),
            segmented(
              t('支援', 'Support'),
              [0, 1, 2, 3].map((v) => ({ value: v, text: String(v) })),
              support,
              (v) => ctx.set((d) => ({ ...d, support: v })),
            ),
          ),
        )
      : null,
    h(
      'div.ke-field',
      {},
      h('span.ke-field-label', {}, t('借入', 'Loans'), h('span.ke-hint', {}, t(`担保 ${money(collateral(n))}・地価 ×${n.landIndex.toFixed(2)}`, `collateral ${money(collateral(n))} · land ×${n.landIndex.toFixed(2)}`))),
      h('div.ke-paper', {}, row(t('いまの借入', 'Borrowed'), money(n.loans)), row(t('あと借りられる', 'Can borrow'), money(room))),
      h(
        'div.ke-actions',
        {},
        costButton(draft.borrow ? t('借りるのをやめる', 'Cancel borrowing') : t('上限まで借りる', 'Borrow the max'), null, () => ctx.set((d) => ({ ...d, borrow: d.borrow ? undefined : room })), { pressed: !!draft.borrow, disabled: room <= 0 && !draft.borrow ? t('担保がありません', 'No collateral') : null }),
        costButton(draft.repay ? t('返すのをやめる', 'Cancel repaying') : t('全額返す', 'Repay all'), null, () => ctx.set((d) => ({ ...d, repay: d.repay ? undefined : n.loans })), { pressed: !!draft.repay, disabled: n.loans <= 0 && !draft.repay ? t('借入はありません', 'No loans') : null }),
      ),
    ),
    h(
      'div.ke-field.ke-field-stack',
      {},
      h('span.ke-field-label', {}, t('品ぞろえ', 'Product range'), h('span.ke-hint', {}, t(`変えると店 1 店あたり ${money(FOCUS_CHANGE_PER_STORE)}（いま ${money(focusChangeCost(e))}）`, `${money(FOCUS_CHANGE_PER_STORE)} per store to switch (now ${money(focusChangeCost(e))})`))),
      focusPicker(e.land, draft.focus ?? e.focus ?? 'daily', (f) => ctx.set((d) => ({ ...d, focus: f === (e.focus ?? 'daily') ? undefined : f }))),
    ),
    h(
      'div.ke-field',
      {},
      h('span.ke-field-label', {}, 'PB', h('span.ke-hint', {}, t(`${n.pb} / ${PB.max} 段・本店の工房の品が店に並ぶ（原価 −1.5%・客 +2%）`, `${n.pb} / ${PB.max} · workshop goods on the shelves`))),
      n.pb < PB.max ? costButton(t('PB を広げる', 'Expand PB'), PB.cost, () => ctx.set((d) => ({ ...d, pb: !d.pb }), draft.pb ? undefined : 'build'), { pressed: !!draft.pb, disabled: draft.pb ? null : lack(ctx, PB.cost) }) : h('span.ke-done', {}, t('✓ 5 段', '✓ max')),
    ),
    h(
      'div.ke-field',
      {},
      h('span.ke-field-label', {}, t('上場', 'IPO')),
      n.listed
        ? h('span.ke-done', {}, t(`✓ 上場済み（持分 ${pct(n.ownership)}）`, `✓ Listed (stake ${pct(n.ownership)})`))
        : costButton(t(`上場する（約 ${money(ipoRaise(e))} を集める・持分が薄まる）`, `Go public (raise ~${money(ipoRaise(e))}, dilutes your stake)`), null, () => ctx.set((d) => ({ ...d, ipo: !d.ipo })), { pressed: !!draft.ipo, disabled: canIpo(e) ? null : t('直近 12 か月の売上 300 億から', 'From 30B sales in the last 12 months') }),
      // 上場するなら、定款の 3 つの方針もここで決める
      draft.ipo && !n.listed ? articlesField(draft.articles ?? defaultArticles(n.force24), {}, (p) => ctx.set((d) => ({ ...d, articles: { ...(d.articles ?? defaultArticles(n.force24)), ...p } }))) : null,
    ),
  );
}

// ---------------------------------------------------------------- 稟議（今月の下書き）

export interface RingiItem {
  label: string;
  cost: number;
  cancel: (d: Decisions) => Decisions;
}

export function ringiItems(e: EmpireState, d: Decisions): RingiItem[] {
  const out: RingiItem[] = [];
  const region = (i: number) => {
    const r = e.nation?.regions[i];
    return r ? t(r.name.ja, r.name.en) : '?';
  };
  for (const [id, patch] of Object.entries(d.stores ?? {})) {
    const s = e.stores.find((x) => x.id === Number(id));
    if (!s) continue;
    const parts: string[] = [];
    if (patch.order !== undefined && patch.order !== s.order) parts.push(t(`発注 ×${patch.order.toFixed(2)}`, `order ×${patch.order.toFixed(2)}`));
    if (patch.hours !== undefined && patch.hours !== s.hours) parts.push(t(`${patch.hours} 時間`, `${patch.hours}h`));
    if (patch.staff !== undefined && patch.staff !== s.staff) parts.push(t(`シフト ${patch.staff} 人`, `staff ${patch.staff}`));
    if (parts.length) out.push({ label: t(`${storeName(s.id)}：${parts.join('・')}`, `${storeName(s.id)}: ${parts.join(' · ')}`), cost: 0, cancel: (x) => ({ ...x, stores: Object.fromEntries(Object.entries(x.stores ?? {}).filter(([k]) => k !== id)) }) });
  }
  if (d.all && Object.keys(d.all).length) out.push({ label: t('全店の方針', 'All-store policy'), cost: 0, cancel: (x) => ({ ...x, all: undefined }) });
  for (const r of d.renovate ?? []) out.push({ label: t(`${storeName(r.store)}：${r.kind === 'sign' ? '看板' : '駐車場'}`, `${storeName(r.store)}: ${r.kind === 'sign' ? 'sign' : 'parking'}`), cost: RENOVATE_COST[r.kind], cancel: (x) => ({ ...x, renovate: (x.renovate ?? []).filter((y) => !(y.store === r.store && y.kind === r.kind)) }) });
  (d.open ?? []).forEach((p, i) => out.push({ label: t(`出店：${plotLabel(p.kind)}`, `Open: ${plotLabel(p.kind)}`), cost: openCost(p), cancel: (x) => ({ ...x, open: (x.open ?? []).filter((_, j) => j !== i) }) }));
  for (const c of d.openAt ?? []) out.push({ label: t(`出店：${cellName(e.area?.w ?? 8, c)}`, `Open: ${cellName(e.area?.w ?? 8, c)}`), cost: AREA_OPEN_COST, cancel: (x) => ({ ...x, openAt: (x.openAt ?? []).filter((y) => y !== c) }) });
  for (const c of d.buildCenter ?? []) out.push({ label: t(`物流センター：${cellName(e.area?.w ?? 8, c)}`, `Center: ${cellName(e.area?.w ?? 8, c)}`), cost: CENTER_COST, cancel: (x) => ({ ...x, buildCenter: (x.buildCenter ?? []).filter((y) => y !== c) }) });
  if (d.sv !== undefined && d.sv !== e.sv) out.push({ label: t(`SV ${d.sv} 人`, `SV ${d.sv}`), cost: 0, cancel: (x) => ({ ...x, sv: undefined }) });
  if (d.pos && !e.pos) out.push({ label: 'POS', cost: POS_COST, cancel: (x) => ({ ...x, pos: undefined }) });
  for (const x of d.expand ?? []) {
    const name = { direct: t('直営', 'company-run'), fcOwner: t('加盟', 'franchise'), fcHq: t('加盟（本部の土地）', 'franchise (HQ land)') }[x.type];
    out.push({ label: t(`${region(x.region)}：${name} +${x.count}`, `${region(x.region)}: ${name} +${x.count}`), cost: x.count * OPEN_COSTS[x.type] * (e.nation?.eraStrict ? ERA.strictCost : 1), cancel: (y) => ({ ...y, expand: (y.expand ?? []).filter((z) => z !== x) }) });
  }
  for (const ri of d.buildHub ?? []) out.push({ label: t(`${region(ri)}：物流拠点`, `${region(ri)}: hub`), cost: HUB_COST, cancel: (x) => ({ ...x, buildHub: (x.buildHub ?? []).filter((y) => y !== ri) }) });
  if (d.training) out.push({ label: t(`研修所 +${d.training}`, `Training center +${d.training}`), cost: d.training * TRAINING_COST, cancel: (x) => ({ ...x, training: undefined }) });
  if (d.manual && !e.nation?.manual) out.push({ label: t('マニュアル', 'Manual'), cost: MANUAL_COST, cancel: (x) => ({ ...x, manual: undefined }) });
  if (d.force24 !== undefined && d.force24 !== e.nation?.force24) out.push({ label: d.force24 ? t('加盟店に 24 時間を求める', 'Require 24h') : t('24 時間の強制をやめる', 'Stop forcing 24h'), cost: 0, cancel: (x) => ({ ...x, force24: undefined }) });
  if (d.support !== undefined && d.support !== e.nation?.support) out.push({ label: t(`オーナー支援 ${d.support} 段`, `Owner support ${d.support}`), cost: 0, cancel: (x) => ({ ...x, support: undefined }) });
  if (d.borrow) out.push({ label: t(`借入 ${money(d.borrow)}`, `Borrow ${money(d.borrow)}`), cost: -d.borrow, cancel: (x) => ({ ...x, borrow: undefined }) });
  if (d.repay) out.push({ label: t(`返済 ${money(d.repay)}`, `Repay ${money(d.repay)}`), cost: d.repay, cancel: (x) => ({ ...x, repay: undefined }) });
  if (d.pb) out.push({ label: t('PB を広げる', 'Expand PB'), cost: PB.cost, cancel: (x) => ({ ...x, pb: undefined }) });
  if (d.ipo) out.push({ label: t('上場', 'IPO'), cost: 0, cancel: (x) => ({ ...x, ipo: undefined, articles: undefined }) });
  if (d.board) out.push({ label: t(`役員会：${d.board.length} 席`, `Board: ${d.board.length} seats`), cost: 0, cancel: (x) => ({ ...x, board: undefined }) });
  if (d.meeting) out.push({ label: t(`総会の演説：${pledgeLabel(d.meeting.pledge)}`, `Speech: ${pledgeLabel(d.meeting.pledge)}`), cost: 0, cancel: (x) => ({ ...x, meeting: undefined }) });
  if (d.postpone) out.push({ label: t('総会を延期', 'Postpone the meeting'), cost: 0, cancel: (x) => ({ ...x, postpone: undefined }) });
  if (d.offering) out.push({ label: t(`謁見の献上：${offeringLabel(d.offering)}`, `Offering: ${offeringLabel(d.offering)}`), cost: 0, cancel: (x) => ({ ...x, offering: undefined }) });
  if (d.focus && d.focus !== (e.focus ?? 'daily')) out.push({ label: t(`品ぞろえ：${focusLabel(d.focus)}`, `Range: ${focusLabel(d.focus)}`), cost: focusChangeCost(e), cancel: (x) => ({ ...x, focus: undefined }) });
  if (d.enter) out.push({ label: t(`${d.enter.land}へ渡る（${entryLabel(d.enter.mode)}）`, `Cross to ${d.enter.land} (${entryLabel(d.enter.mode)})`), cost: routeCost(e) + entryCost(d.enter.mode), cancel: (x) => ({ ...x, enter: undefined }) });
  for (const [land, bd] of Object.entries(d.branches ?? {})) {
    const b = branchOf(e, land);
    if (!b) continue;
    const name = (ri: number) => {
      const r = b.nation.regions[ri];
      return r ? t(r.name.ja, r.name.en) : '?';
    };
    const drop = (patch: Partial<typeof bd>) => (x: Decisions): Decisions => ({ ...x, branches: { ...x.branches, [land]: { ...x.branches?.[land], ...patch } } });
    for (const x of bd.expand ?? []) {
      const kind = { direct: t('直営', 'company-run'), fcOwner: t('加盟', 'franchise'), fcHq: t('加盟（本部の土地）', 'franchise (HQ land)') }[x.type];
      out.push({ label: t(`${land}・${name(x.region)}：${kind} +${x.count}`, `${land} · ${name(x.region)}: ${kind} +${x.count}`), cost: x.count * OPEN_COSTS[x.type], cancel: (y) => drop({ expand: (y.branches?.[land]?.expand ?? []).filter((z) => !(z.region === x.region && z.type === x.type)) })(y) });
    }
    for (const ri of bd.buildHub ?? []) out.push({ label: t(`${land}・${name(ri)}：物流拠点`, `${land} · ${name(ri)}: hub`), cost: HUB_COST, cancel: (y) => drop({ buildHub: (y.branches?.[land]?.buildHub ?? []).filter((z) => z !== ri) })(y) });
    if (bd.training) out.push({ label: t(`${land}：研修所 +${bd.training}`, `${land}: training center +${bd.training}`), cost: bd.training * TRAINING_COST, cancel: drop({ training: undefined }) });
    if (bd.localize) out.push({ label: t(`${land}：現地化`, `${land}: localize`), cost: ENTRY.localizeCost, cancel: drop({ localize: undefined }) });
    if (bd.buyout) out.push({ label: t(`${land}：提携先の買い取り`, `${land}: buy out the partner`), cost: buyoutCost(b, e.month), cancel: drop({ buyout: undefined }) });
    if (bd.offering) out.push({ label: t(`${land}・謁見の献上：${offeringLabel(bd.offering)}`, `${land} · offering: ${offeringLabel(bd.offering)}`), cost: 0, cancel: drop({ offering: undefined }) });
    if (bd.exit) out.push({ label: t(`${land}から撤退`, `Leave ${land}`), cost: -exitValue(b), cancel: drop({ exit: undefined }) });
  }
  for (const land of d.mna?.buy ?? []) out.push({ label: t(`${landRival(land)}の株を ${Math.round(MNA.step * 100)}% 買う`, `Buy ${Math.round(MNA.step * 100)}% of ${landRival(land)}`), cost: stepPrice(e, land), cancel: (x) => ({ ...x, mna: { ...x.mna, buy: (x.mna?.buy ?? []).filter((y) => y !== land) } }) });
  if (d.mna?.tob) {
    const tob = d.mna.tob;
    out.push({ label: t(`${landRival(tob.land)}に公開買付け（上乗せ ${Math.round(tob.premium * 100)}%）`, `Tender offer for ${landRival(tob.land)} (+${Math.round(tob.premium * 100)}%)`), cost: tobPrice(e, tob.land, tob.premium), cancel: (x) => ({ ...x, mna: { ...x.mna, tob: undefined } }) });
  }
  for (const land of d.mna?.pmi ?? []) out.push({ label: t(`${landRival(land)}との統合`, `Integrate ${landRival(land)}`), cost: MNA.pmiCost, cancel: (x) => ({ ...x, mna: { ...x.mna, pmi: (x.mna?.pmi ?? []).filter((y) => y !== land) } }) });
  if (d.mna?.defense) out.push({ label: t(`買収の防衛：${defenseLabel(d.mna.defense)}`, `Defense: ${defenseLabel(d.mna.defense)}`), cost: d.mna.defense === 'stable' ? RAID.stableCost : d.mna.defense === 'mbo' ? mboCost(e) : 0, cancel: (x) => ({ ...x, mna: { ...x.mna, defense: undefined } }) });
  if (d.inspect) out.push({ label: t('全店の品質点検', 'Inspect every store'), cost: inspectCost(e), cancel: (x) => ({ ...x, inspect: undefined }) });
  if (d.diversify) out.push({ label: t('仕入れ先を分ける', 'Spread suppliers'), cost: diversifyCost(e), cancel: (x) => ({ ...x, diversify: undefined }) });
  if (d.table && e.group) {
    const ch = tableChangeCost(e.group.table, d.table);
    for (const b of ch.added) out.push({ label: t(`会議卓に置く：${businessName(b)}`, `Place: ${businessName(b)}`), cost: BUSINESS_COST(b), cancel: (x) => ({ ...x, table: undefined }) });
    for (const b of ch.removed) out.push({ label: t(`会議卓から外す：${businessName(b)}`, `Remove: ${businessName(b)}`), cost: -BUSINESS_COST(b) * SELL_BACK_RATE, cancel: (x) => ({ ...x, table: undefined }) });
    if (!ch.added.length && !ch.removed.length) out.push({ label: t('会議卓の並べ替え', 'Rearrange the table'), cost: 0, cancel: (x) => ({ ...x, table: undefined }) });
  }
  if (e.group && e.month === e.group.nextAuction)
    for (const [land, b] of Object.entries(d.bids ?? {})) out.push({ label: t(`地主会：${land} ${b.plots} 区画（${bidLabel(b.level)}）`, `Auction: ${land} ${b.plots} plots (${bidLabel(b.level)})`), cost: bidCost(e, b), cancel: (x) => ({ ...x, bids: Object.fromEntries(Object.entries(x.bids ?? {}).filter(([k]) => k !== land)) }) });
  if (d.counter && e.campaign && e.nation) out.push({ label: t('対抗セール', 'Counter-sale'), cost: counterCost(e.nation, e.campaign), cancel: (x) => ({ ...x, counter: undefined }) });
  return out;
}

export function ringiList(ctx: Ctx): HTMLElement {
  const items = ringiItems(ctx.e, ctx.draft);
  if (!items.length) return h('p.ke-note', {}, t('今月の稟議はまだありません。地図の区画や、下の指示から決めると、ここに並びます。', 'No plans yet. Decisions you make on the map or in the commands below line up here.'));
  const total = reserved(ctx.e, ctx.draft);
  return h(
    'div.ke-ringi',
    {},
    h(
      'ul.ke-ringi-list',
      {},
      ...items.map((it) =>
        h(
          'li.ke-ringi-item',
          {},
          h('span.ke-ringi-stamp', { 'aria-hidden': 'true' }, t('承', 'OK')),
          h('span.ke-ringi-label', {}, it.label),
          it.cost ? h('b', { class: `ke-figure ${it.cost < 0 ? 'ke-good' : ''}` }, it.cost < 0 ? `+${money(-it.cost)}` : money(it.cost)) : null,
          h('button.ke-icon-btn', { type: 'button', 'aria-label': t(`${it.label}を取り消す`, `Cancel ${it.label}`), onclick: () => ctx.set(it.cancel) }, svgIcon('close', 16)),
        ),
      ),
    ),
    h('div.ke-paper', {}, row(t('支払いの合計', 'Total'), money(total)), row(t('払ったあとの資金', 'Funds after'), money(ctx.e.funds - total), ctx.e.funds - total < 0 ? 'bad' : '')),
  );
}
