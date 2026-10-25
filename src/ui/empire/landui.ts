// ランドの個性の画面（M10a）：創業のときのランド選び、品ぞろえ。どれも DOM を返すだけ。
import { FOCUS_CHANGE_PER_STORE, FOCUSES, landProfile, type Focus, type LandProfile } from '../../empire/lands';
import { focusChangeCost, landDemand } from '../../empire/sim';
import { t } from '../../i18n';
import { h } from '../dom';
import { card, type Ctx } from './cards';
import { costButton, row } from './parts';
import { fitMark, focusLabel, money } from './text';

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
