// ランドの個性の画面（M10a）：創業のときのランド選び、品ぞろえ。どれも DOM を返すだけ。
import { FOCUS_CHANGE_PER_STORE, FOCUSES, landProfile, type Focus, type LandProfile } from '../../empire/lands';
import { focusChangeCost, landDemand } from '../../empire/sim';
import { ATTENTION, attentionPerMonth, crownCount, KINGS, kingFit, kingWants, OFFERINGS, type Offering } from '../../empire/court';
import { phase3Done } from '../../empire/sim';
import type { FoundingLand } from '../../empire/lands';
import { t } from '../../i18n';
import { h } from '../dom';
import { card, type Ctx } from './cards';
import { costButton, row } from './parts';
import { fitMark, focusLabel, kingName, money, offeringLabel, privilegeLabel } from './text';

/** 創業のときのランドの札（守り神の絵・ランドの名前・国の形）。くわしくは landDetail */
export function landPickCard(p: LandProfile, image: HTMLElement | null, selected: boolean, onPick: () => void): HTMLElement {
  return h(
    'button.ke-land-card',
    { type: 'button', role: 'radio', 'aria-checked': String(selected), onclick: onPick },
    h('span.ke-land-face', {}, image),
    h('span.ke-land-head', {}, h('b', {}, p.key), h('span.ke-hint', {}, t(p.kind.ja, p.kind.en))),
  );
}

/** 選んだランドのくわしい説明（文化 3 行・特産品・守り神・キング） */
export function landDetail(p: LandProfile): HTMLElement {
  return h(
    'div.ke-land-detail',
    {},
    h('ul.ke-land-lines', {}, ...p.lines.map((l) => h('li', {}, t(l.ja, l.en)))),
    h('span.ke-land-meta', {}, t(`特産品 ${p.specialty.name.ja}・守り神 ${p.guardian.name.ja}・キング ${p.king.name.ja}（${p.king.likes.ja}）`, `Specialty ${p.specialty.name.en} · guardian ${p.guardian.name.en} · ${p.king.name.en} (likes ${p.king.likes.en})`)),
  );
}

/** 品ぞろえの 5 択（ランドの文化との合い方の印つき） */
export function focusPicker(land: string, current: Focus, onPick: (f: Focus) => void): HTMLElement {
  const fit = landProfile(land).fit;
  return h(
    'div.ke-focus-list',
    { role: 'radiogroup', 'aria-label': t('品ぞろえ', 'Product range') },
    ...FOCUSES.map((f) =>
      h(
        'button.ke-focus-btn',
        { type: 'button', role: 'radio', 'aria-checked': String(f === current), title: t(`客足 ×${fit[f].toFixed(2)}`, `Customers ×${fit[f].toFixed(2)}`), onclick: () => onPick(f) },
        h('b.ke-fit', { class: `ke-fit ${fit[f] >= 1.1 ? 'is-best' : fit[f] < 0.97 ? 'is-bad' : ''}` }, fitMark(fit[f])),
        h('span', {}, focusLabel(f)),
      ),
    ),
  );
}

/** 指示の「品ぞろえ」：いまのランドで当たる品ぞろえと、変える費用 */
export function focusCard(ctx: Ctx): HTMLElement {
  const { e, draft } = ctx;
  const p = landProfile(e.land);
  const now = e.focus ?? 'daily';
  const next = draft.focus ?? now;
  const cost = focusChangeCost(e);
  return card(
    t('品ぞろえ', 'Product range'),
    t(`${p.key}（${p.kind.ja}）の文化との合い方`, `How it fits ${p.key} (${p.kind.en})`),
    h('ul.ke-land-lines', {}, ...p.lines.map((l) => h('li', {}, t(l.ja, l.en)))),
    h('div.ke-paper', {}, row(t('いまの品ぞろえ', 'Now'), `${fitMark(p.fit[now])} ${focusLabel(now)}`), row(t('客足の倍率', 'Customers ×'), `×${landDemand(e).toFixed(2)}`)),
    focusPicker(e.land, next, (f) => ctx.set((d) => ({ ...d, focus: f === now ? undefined : f }), f === now ? undefined : 'build')),
    next !== now
      ? costButton(t(`「${focusLabel(next)}」に変える`, `Switch to ${focusLabel(next)}`), cost, () => ctx.set((d) => ({ ...d, focus: undefined })), { pressed: true })
      : h('p.ke-hint', {}, cost > 0 ? t(`変えるには店 1 店あたり ${money(FOCUS_CHANGE_PER_STORE)}（いま ${money(cost)}）`, `Switching costs ${money(FOCUS_CHANGE_PER_STORE)} per store (now ${money(cost)})`) : t('フェーズ 1 のうちは、無料で変えられます', 'Free to change while you are a single store')),
  );
}

/** 政府とキング：注目度、招待の条件、謁見の献上の品、授かった特権 */
/** branch：渡ったランドのキング（謁見はフェーズ 4 の卒業に数える） */
export function courtCard(ctx: Ctx, image: HTMLElement | null, branch = false): HTMLElement {
  const { e, draft } = ctx;
  const p = landProfile(e.land);
  const c = e.court;
  const att = Math.round(c?.attention ?? 0);
  const first = phase3Done(e);
  const wants = kingWants(e);
  const fit = kingFit(e);
  const pick = (o: Offering) => ctx.set((d) => ({ ...d, offering: d.offering === o ? undefined : o }), 'build');
  return card(
    t(`${kingName(e.land)}と政府`, `${kingName(e.land)} and the government`),
    t(`${p.key}（${p.kind.ja}）のキング。好むもの：${p.king.likes.ja}`, `King of ${p.key}. Likes: ${p.king.likes.en}`),
    h(
      'div.ke-court-head',
      {},
      h('span.ke-land-face', {}, image),
      h(
        'div.ke-court-meter',
        {},
        h('span.ke-field-label', {}, t(`政府の注目度 ${att} / 100`, `Government attention ${att} / 100`)),
        h('meter', { min: 0, max: 100, low: ATTENTION.stages[0], high: ATTENTION.stages[1], optimum: 100, value: att }),
        h('span.ke-hint', {}, c?.audience ? t('謁見は成りました', 'Audience granted') : t(`1 か月に +${attentionPerMonth(e).toFixed(1)}（冠 ${crownCount(e)} つ・キングの好みに ${Math.round(fit * 100)}%）`, `+${attentionPerMonth(e).toFixed(1)}/month (${crownCount(e)} crowns · ${Math.round(fit * 100)}% to the king's taste)`)),
      ),
    ),
    h(
      'div.ke-paper.is-wide',
      {},
      row(t('キングの好みに合う商い', "The king's taste"), t(wants.ja, wants.en), fit >= 1 ? 'good' : ''),
      row(branch ? t('このランドで売上 1 位', 'First in sales in this land') : t('本拠ランドで売上 1 位', 'First in sales at home'), first ? t('✓', '✓') : t('まだ', 'Not yet'), first ? 'good' : 'bad'),
      row(t('注目度 100', 'Attention 100'), att >= 100 ? t('✓', '✓') : `${att}`, att >= 100 ? 'good' : ''),
    ),
    c?.invited && !c.audience
      ? h(
          'div.ke-field.ke-field-stack',
          {},
          h('span.ke-field-label', {}, t('謁見の招待が届いています。献上の品を選んで、月を進めると謁見に臨みます', 'You are invited. Choose an offering, then advance the month')),
          h(
            'div.ke-focus-list',
            { role: 'radiogroup', 'aria-label': t('献上の品', 'Offering') },
            ...OFFERINGS.map((o) => h('button.ke-focus-btn', { type: 'button', role: 'radio', 'aria-checked': String(draft.offering === o), onclick: () => pick(o) }, h('span', {}, offeringLabel(o)))),
          ),
          h('span.ke-hint', {}, t(`${kingName(e.land)}が好むのは「${p.king.likes.ja}」。キングの好みに十分合った商いなら、どの品でも成ります（献金を除く）`, `${kingName(e.land)} likes ${p.king.likes.en}. If your business already suits the king, any offering but gold works`)),
        )
      : null,
    c?.privileges.length
      ? h('div.ke-paper', {}, ...c.privileges.map((v) => row(t('特権', 'Privilege'), privilegeLabel(v), 'good')))
      : branch
        ? h('p.ke-hint', {}, t(`謁見が成ると、このランドで特権「${privilegeLabel(KINGS[(p.key as FoundingLand)]?.privilege ?? 'harbor')}」を授かります。本拠の外の 2 ランドで謁見が成ると、フェーズ 4 の卒業に近づきます`, `An audience grants "${privilegeLabel(KINGS[(p.key as FoundingLand)]?.privilege ?? 'harbor')}" in this land. Audiences in two lands abroad count toward graduating phase 4`))
        : h('p.ke-hint', {}, t(`謁見が成ると、特権「${privilegeLabel(KINGS[(p.key as FoundingLand)]?.privilege ?? 'harbor')}」を授かり、フェーズ 3 を卒業できます`, `An audience grants the privilege "${privilegeLabel(KINGS[(p.key as FoundingLand)]?.privilege ?? 'harbor')}" and lets you graduate phase 3`)),
  );
}
