// 世界展開の画面（フェーズ 4、docs/EMPIRE_DESIGN.md 10.12）：海図の島の札、渡り方の 4 択、ランドの支社。どれも DOM を返すだけ。
//
// 渡ったランドの画面は、本拠の国の画面（エリアの札・エリアのカード・キングの札）をそのまま使う。
// そのために、渡ったランドを「本拠と同じ形の会社」に見立てた写し（branchLens）と、
// その下書きを Decisions.branches[ランド] に書き戻す指示の入れ物（branchCtx）を作る。
import type { EmpireState } from '../../empire/model';
import type { Decisions } from '../../empire/sim';
import { nationStores, TRAINEES, TRAINING_COST } from '../../empire/nation';
import { landProfile, type FoundingLand } from '../../empire/lands';
import {
  branchOf,
  buyoutCost,
  ENTRY,
  ENTRY_MODES,
  entryCost,
  exitValue,
  foreignShare,
  GRADUATE,
  OPEN_LANDS,
  routeCost,
  WORLD_LANDS,
  type Branch,
  type BranchDecision,
  type EntryMode,
} from '../../empire/world';
import { t } from '../../i18n';
import { h } from '../dom';
import { card, type Ctx } from './cards';
import { costButton, row, stepper, svgIcon } from './parts';
import { entryLabel, kingName, money, monthLabel, privilegeLabel } from './text';

/** 島の関わり：本拠・渡った・渡れる・まだ渡れない */
export type IsleStatus = 'home' | 'branch' | 'open' | 'closed';
export function isleStatus(e: EmpireState, land: string): IsleStatus {
  if (land === e.land) return 'home';
  if (branchOf(e, land)) return 'branch';
  return OPEN_LANDS.includes(land as FoundingLand) ? 'open' : 'closed';
}

/** 渡ったランドを、本拠と同じ形の会社に見立てた写し（画面だけに使う。書き換えない） */
export function branchLens(e: EmpireState, b: Branch): EmpireState {
  return {
    ...e,
    land: b.land,
    // 出店の規制の時代は本拠の国のもの。渡ったランドの出店には効かない
    nation: { ...b.nation, eraStrict: false },
    court: b.court,
    crowns: undefined,
    campaign: undefined,
    history: b.hist.map((x, i) => ({ month: e.month - b.hist.length + i, revenue: x.revenue, rivalRevenue: x.rival, inflow: 0, profit: 0, funds: 0, stores: [], notes: [] })),
  } as EmpireState;
}

/** 渡ったランドの下書き（出店・物流拠点・研修所・献上の品）を、本拠の下書きの形で読み書きする */
export function branchCtx(c: Ctx, b: Branch): Ctx {
  const toLocal = (d: Decisions): Decisions => {
    const bd = d.branches?.[b.land] ?? {};
    return { expand: bd.expand, buildHub: bd.buildHub, training: bd.training, offering: bd.offering };
  };
  return {
    ...c,
    e: branchLens(c.e, b),
    draft: toLocal(c.draft),
    set: (fn, sound) =>
      c.set((d) => {
        const nd = fn(toLocal(d));
        const next: BranchDecision = { ...d.branches?.[b.land], expand: nd.expand, buildHub: nd.buildHub, training: nd.training, offering: nd.offering };
        return { ...d, branches: { ...d.branches, [b.land]: next } };
      }, sound),
  };
}

/** ランドの支社の下書きを書き換える */
const setBranch = (ctx: Ctx, land: string, patch: Partial<BranchDecision>, sound?: Parameters<Ctx['set']>[1]) => ctx.set((d) => ({ ...d, branches: { ...d.branches, [land]: { ...d.branches?.[land], ...patch } } }), sound);

const lack = (ctx: Ctx, cost: number) => (ctx.fundsLeft() < cost ? t(`資金があと ${money(cost - ctx.fundsLeft())} 足りません`, `${money(cost - ctx.fundsLeft())} short`) : null);
const pct = (v: number) => `${Math.round(v * 100)}%`;

/** 参入方式の説明 */
function modeNote(m: EntryMode): string {
  return {
    direct: t('0 店から。遅いが、利益はまるごと', 'From zero stores. Slow, but all profit is yours'),
    license: t(`提携先が月に ${ENTRY.licensePerMonth} 店ずつ増やし、売上の ${pct(ENTRY.licenseRoyalty)} を受け取る。${ENTRY.licenseBreak} か月で独立を言い出す`, `A local partner adds ${ENTRY.licensePerMonth} stores a month and pays you ${pct(ENTRY.licenseRoyalty)} of sales. Wants independence after ${ENTRY.licenseBreak} months`),
    jv: t(`最初から ${ENTRY.jvStores} 店。利益は半分ずつ。あとで残りを買い取れる`, `${ENTRY.jvStores} stores from day one. Profit split in half; buy the rest later`),
    acquire: t(`現地のチェーンから ${ENTRY.acquireStores} 店を買う。統合までの ${ENTRY.integrateMonths} か月は客足 ${pct(1 - ENTRY.integrateDemand)} 減`, `Buy ${ENTRY.acquireStores} stores from a local chain. Customers fall ${pct(1 - ENTRY.integrateDemand)} for ${ENTRY.integrateMonths} months while you integrate`),
  }[m];
}

/** 海図の島を選んだときのカード：文化・キング・関わり、渡れるなら 4 つの渡り方 */
export function worldLandCard(ctx: Ctx, land: string, image: HTMLElement | null, onView: (land: string) => void): HTMLElement {
  const { e, draft } = ctx;
  const status = isleStatus(e, land);
  const open = OPEN_LANDS.includes(land as FoundingLand);
  const p = landProfile(land);
  const sub = open ? t(`${p.kind.ja}・${kingName(land)}`, `${p.kind.en} · ${kingName(land)}`) : t('まだ航路がありません', 'No route yet');
  const head = h('div.ke-court-head', {}, h('span.ke-land-face', {}, image), open ? h('ul.ke-land-lines', {}, ...p.lines.map((l) => h('li', {}, t(l.ja, l.en)))) : h('p.ke-note', {}, t('このランドへは、まだ渡れません（グループになってから）。', 'You cannot cross here yet (it opens later).')));
  if (status === 'home') {
    return card(
      t(`${land}（本拠）`, `${land} (home)`),
      sub,
      head,
      h('div.ke-paper.is-wide', {}, row(t('自社の店', 'Your stores'), String(e.nation ? nationStores(e.nation) : 0), 'good'), row(t('特権', 'Privilege'), e.court?.privileges.map(privilegeLabel).join(t('・', ' · ')) || '—')),
      h('button.ke-link', { type: 'button', onclick: () => onView(land) }, t('本拠の国を見る', 'View your home land'), svgIcon('chevron-right', 16)),
    );
  }
  const b = branchOf(e, land);
  if (b) {
    const own = nationStores(b.nation);
    return card(
      land,
      sub,
      head,
      h(
        'div.ke-paper.is-wide',
        {},
        row(t('渡り方', 'Entry'), entryLabel(b.mode)),
        row(t('自社の店', 'Your stores'), b.partner ? t(`${own}（提携先 ${b.partner}）`, `${own} (partner ${b.partner})`) : String(own), 'good'),
        row(t('現地化', 'Localization'), pct(b.local), b.local >= 0.95 ? 'good' : ''),
        row(t('キングとの謁見', 'Audience'), b.court.audience ? t('✓ 成った', '✓ Granted') : b.court.invited ? t('招待あり', 'Invited') : t(`注目度 ${Math.round(b.court.attention)}`, `Attention ${Math.round(b.court.attention)}`), b.court.audience ? 'good' : ''),
      ),
      h('button.ke-link', { type: 'button', onclick: () => onView(land) }, t('このランドを見る', 'View this land'), svgIcon('chevron-right', 16)),
    );
  }
  const others = Math.round(e.world?.others[land] ?? 0);
  if (!open || status === 'closed') {
    return card(land, sub, head, h('div.ke-paper.is-wide', {}, row(t('ほかの会社の店', "Other companies' stores"), String(others), 'bad')));
  }
  const route = routeCost(e);
  const chosen = draft.enter?.land === land ? draft.enter.mode : null;
  const already = draft.enter && draft.enter.land !== land ? draft.enter.land : null;
  const pick = (m: EntryMode) => ctx.set((d) => ({ ...d, enter: chosen === m ? undefined : { land, mode: m } }), chosen === m ? undefined : 'build');
  return card(
    land,
    sub,
    head,
    h(
      'div.ke-paper.is-wide',
      {},
      row(t('キングの好み', "The king's taste"), t(p.king.likes.ja, p.king.likes.en)),
      row(t('ほかの会社の店', "Other companies' stores"), others ? t(`${others} 店（毎月増える）`, `${others} (growing)`) : t('まだ 0 店', 'None yet'), others ? 'bad' : 'good'),
      row(t('航路を開く', 'Open the route'), money(route)),
    ),
    h(
      'div.ke-field.ke-field-stack',
      {},
      h('span.ke-field-label', {}, t('渡り方', 'How to enter'), h('span.ke-hint', {}, already ? t(`今月は${already}へ渡る予定です（1 か月に 1 ランド）`, `You are crossing to ${already} this month (one land a month)`) : t('Common の 1 エリアから小さく始めます', 'You start small, in one Common area'))),
      h(
        'div.ke-entry-list',
        { role: 'radiogroup', 'aria-label': t('渡り方', 'How to enter') },
        ...ENTRY_MODES.map((m) => {
          const cost = route + entryCost(m);
          const short = chosen === m ? null : lack(ctx, cost);
          return h(
            'button.ke-entry',
            { type: 'button', role: 'radio', 'aria-checked': String(chosen === m), disabled: !!short && chosen !== m, onclick: () => pick(m) },
            h('span.ke-entry-head', {}, h('b', {}, entryLabel(m)), h('b.ke-figure', {}, money(cost))),
            h('span.ke-hint', {}, short ?? modeNote(m)),
          );
        }),
      ),
    ),
  );
}

/** 渡ったランドの支社：研修所・現地化・提携先の買い取り・撤退 */
export function branchHqCard(ctx: Ctx, b: Branch): HTMLElement {
  const { e } = ctx;
  const bd = ctx.draft.branches?.[b.land] ?? {};
  const training = bd.training ?? 0;
  const buy = buyoutCost(b, e.month);
  const breakIn = b.opened + ENTRY.licenseBreak - e.month;
  const integrating = e.month < b.integrateUntil;
  const own = nationStores(b.nation);
  return card(
    t(`${b.land}の支社`, `${b.land} branch`),
    t(`${entryLabel(b.mode)}・${monthLabel(b.opened)}に渡った`, `${entryLabel(b.mode)} · since ${monthLabel(b.opened)}`),
    h(
      'div.ke-paper.is-wide',
      {},
      row(t('自社の店', 'Your stores'), String(own), 'good'),
      b.mode === 'jv' ? row(t('こちらの取り分', 'Your stake'), pct(b.stake), b.stake >= 1 ? 'good' : '') : null,
      b.mode === 'license' ? row(t('提携先の店', "Partner's stores"), t(`${b.partner} 店（売上の ${pct(ENTRY.licenseRoyalty)}）`, `${b.partner} (${pct(ENTRY.licenseRoyalty)} of sales)`)) : null,
      b.mode === 'license' ? row(t('独立を言い出すまで', 'Until independence'), breakIn > 0 ? t(`あと ${breakIn} か月`, `${breakIn} months`) : t('今月', 'This month'), breakIn <= 3 ? 'bad' : '') : null,
      integrating ? row(t('統合', 'Integration'), t(`${monthLabel(b.integrateUntil)}まで客足 −${pct(1 - ENTRY.integrateDemand)}`, `Customers −${pct(1 - ENTRY.integrateDemand)} until ${monthLabel(b.integrateUntil)}`), 'bad') : null,
    ),
    h(
      'div.ke-field',
      {},
      h('span.ke-field-label', {}, t('研修所', 'Training centers'), h('span.ke-hint', {}, t(`このランドの店長を育てる。1 つで月に ${TRAINEES.perCenter} 人（${money(TRAINING_COST)}）`, `Trains managers here: ${TRAINEES.perCenter}/month each (${money(TRAINING_COST)})`))),
      stepper(training ? `${b.nation.trainingCenters} +${training}` : String(b.nation.trainingCenters), training > 0 ? () => setBranch(ctx, b.land, { training: training - 1 || undefined }) : null, ctx.fundsLeft() >= TRAINING_COST ? () => setBranch(ctx, b.land, { training: training + 1 }, 'build') : null, t('研修所', 'centers')),
    ),
    h(
      'div.ke-field',
      {},
      h('span.ke-field-label', {}, t('現地化', 'Localization'), h('span.ke-hint', {}, t(`${pct(b.local)}・本拠の型のままだと客足が落ちる。月に ${pct(ENTRY.localMonthly)} ずつ慣れる`, `${pct(b.local)} · your home format loses customers here; it adapts ${pct(ENTRY.localMonthly)} a month`))),
      h('meter', { min: 0.8, max: 1, low: 0.9, high: 0.97, optimum: 1, value: b.local }),
      b.local >= 1
        ? h('span.ke-done', {}, t('✓ すっかり根づきました', '✓ Fully local'))
        : costButton(t(`現地の人を雇って合わせる（+${pct(ENTRY.localizeStep)}）`, `Hire locals to adapt (+${pct(ENTRY.localizeStep)})`), ENTRY.localizeCost, () => setBranch(ctx, b.land, { localize: !bd.localize || undefined }, bd.localize ? undefined : 'build'), { pressed: !!bd.localize, disabled: bd.localize ? null : lack(ctx, ENTRY.localizeCost) }),
    ),
    buy > 0
      ? h(
          'div.ke-field',
          {},
          h('span.ke-field-label', {}, b.mode === 'jv' ? t('合弁の残り半分を買い取る', "Buy out the JV partner's half") : t('独立する提携先を買い取る', 'Buy out the leaving licensee')),
          costButton(bd.buyout ? t('買い取るのをやめる', 'Cancel the buyout') : t('買い取る', 'Buy out'), buy, () => setBranch(ctx, b.land, { buyout: !bd.buyout || undefined }, bd.buyout ? undefined : 'build'), { pressed: !!bd.buyout, primary: b.mode === 'license' && !bd.buyout, disabled: bd.buyout ? null : lack(ctx, buy) }),
        )
      : null,
    h(
      'div.ke-field',
      {},
      h('span.ke-field-label', {}, t('撤退', 'Leave'), h('span.ke-hint', {}, t(`店を売って引き上げる（+${money(exitValue(b))}）。現地化の知見は残り、また渡るときに効く`, `Sell up and leave (+${money(exitValue(b))}). The local know-how stays for next time`))),
      costButton(bd.exit ? t('撤退をやめる', 'Stay') : t('このランドから撤退する', 'Leave this land'), null, () => setBranch(ctx, b.land, { exit: !bd.exit || undefined }, bd.exit ? undefined : 'debuff'), { pressed: !!bd.exit }),
    ),
    h('p.ke-hint', {}, t('物流拠点と出店は、地図のエリアの札から決めます。このランドのキングの札は、指示の「キング」から。', 'Hubs and openings are set from the area plates on the map; the king of this land is under Commands.')),
  );
}

/** 右の列：世界の一覧と、フェーズ 4 の卒業の進み具合 */
export function worldPanel(e: EmpireState, selected: string | null, onPick: (i: number) => void): HTMLElement {
  const audiences = e.world?.branches.filter((b) => b.court.audience).length ?? 0;
  const share = foreignShare(e);
  return h(
    'div.ke-panel.ke-list-panel',
    {},
    h('h2.ke-panel-title', {}, t('世界', 'World')),
    h(
      'div.ke-paper.is-wide',
      {},
      row(t('本拠の外で謁見', 'Audiences abroad'), `${audiences} / ${GRADUATE.audiences}`, audiences >= GRADUATE.audiences ? 'good' : ''),
      row(t('本拠の外の売上', 'Sales abroad'), `${pct(share)} / ${pct(GRADUATE.foreign)}`, share >= GRADUATE.foreign ? 'good' : ''),
    ),
    h(
      'ul.ke-list',
      {},
      ...WORLD_LANDS.map((land, i) => {
        const st = isleStatus(e, land);
        const b = branchOf(e, land);
        const value = st === 'home' ? t('本拠', 'Home') : b ? t(`${nationStores(b.nation)} 店`, `${nationStores(b.nation)}`) : st === 'open' ? t('渡れる', 'Open') : '—';
        const king = b?.court.audience || (st === 'home' && e.court?.audience) ? svgIcon('crown', 14) : null;
        if (king) king.classList.add('ke-crown', 'is-held');
        return h(
          'li',
          {},
          h(
            'button.ke-list-row',
            { type: 'button', 'aria-pressed': String(selected === land), onclick: () => onPick(i) },
            h('span', { class: `ke-isle-dot is-${st}` }),
            h('span.ke-list-name', {}, land),
            king ?? h('span', {}),
            h('span', { class: `ke-figure ${st === 'open' ? 'ke-good' : ''}` }, value),
          ),
        );
      }),
    ),
  );
}

/** 島の札の文字（海図の下に出す） */
export function isleTag(e: EmpireState, land: string): string {
  const st = isleStatus(e, land);
  const b = branchOf(e, land);
  if (st === 'home') return t('本拠', 'Home');
  if (b) return t(`${nationStores(b.nation)} 店`, `${nationStores(b.nation)}`);
  if (st === 'open') return t('渡れる', 'Open');
  return '—';
}
