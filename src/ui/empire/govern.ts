// 統治の画面（M8 後半）：役員会・株主総会・上場のときの定款。どれも DOM を返すだけ。
import type { EmpireState } from '../../empire/model';
import {
  BOARD_EFFECT,
  BOARD_SEATS,
  boardMods,
  DIVIDEND,
  MEETING,
  meetingNow,
  pledgeBase,
  pledgeKept,
  PLEDGE,
  trustOf,
  type Articles,
  type BoardKind,
  type BoardMember,
  type MeetingChoice,
  type PraiseTarget,
  type PromiseKind,
  type RivalCall,
} from '../../empire/governance';
import { rivalOf } from '../../empire/rivals';
import { supportOf } from '../../empire/stakeholders';
import { t } from '../../i18n';
import { h } from '../dom';
import { card, type Ctx } from './cards';
import { costButton, row, segmented, svgIcon } from './parts';
import { monthLabel, money, pledgeLabel, stakeName } from './text';

export interface BoardCandidate {
  id: number;
  name: string;
  kind: BoardKind;
  /** 酒場の技の種類の名前（売上・集客…） */
  kindName: string;
  power: number;
  image: () => HTMLElement;
}

const pct1 = (v: number) => `${(v * 100).toFixed(1).replace(/\.0$/, '')}%`;

/** 役員 1 人の効き目を、短い言葉で */
export function boardEffectText(kind: BoardKind, power: number): string {
  switch (kind) {
    case 'sales':
    case 'crowd':
      return t(`客足 +${pct1(power * BOARD_EFFECT.demand)}`, `Customers +${pct1(power * BOARD_EFFECT.demand)}`);
    case 'craft':
    case 'restock':
      return t(`原価 −${pct1(power * BOARD_EFFECT.costCut)}`, `Cost −${pct1(power * BOARD_EFFECT.costCut)}`);
    case 'luck':
      return t(`金利 −${pct1(Math.min(0.5, power * BOARD_EFFECT.interest))}`, `Interest −${pct1(Math.min(0.5, power * BOARD_EFFECT.interest))}`);
    case 'wait':
      return t(`従業員の支持 +${(power * BOARD_EFFECT.support).toFixed(1)}／月`, `Staff support +${(power * BOARD_EFFECT.support).toFixed(1)}/mo`);
    case 'wish':
      return t(`オーナーの満足 +${(power * BOARD_EFFECT.support).toFixed(1)}／月`, `Owner satisfaction +${(power * BOARD_EFFECT.support).toFixed(1)}/mo`);
    case 'vip':
      return t(`信任 +${(power * BOARD_EFFECT.support).toFixed(1)}／月`, `Trust +${(power * BOARD_EFFECT.support).toFixed(1)}/mo`);
    case 'rush':
    case 'study':
      return t(`品質の戻り +${pct1(power * BOARD_EFFECT.quality)}／月`, `Quality recovery +${pct1(power * BOARD_EFFECT.quality)}/mo`);
    case 'sweep':
      return t(`罰金 −${pct1(Math.min(0.5, power * BOARD_EFFECT.fine))}`, `Fines −${pct1(Math.min(0.5, power * BOARD_EFFECT.fine))}`);
  }
}

/** 役員会：5 席。座っている人と、迎えられる英雄 */
export function boardCard(ctx: Ctx, candidates: BoardCandidate[]): HTMLElement {
  const { e, draft } = ctx;
  const seated = draft.board ?? e.gov?.board ?? [];
  const byId = new Map(candidates.map((c) => [c.id, c]));
  const setBoard = (b: BoardMember[]) => ctx.set((d) => ({ ...d, board: b }), 'buff');
  const face = (id: number) => byId.get(id)?.image() ?? h('span.ke-face-empty', {});
  const total = boardMods({ board: seated, nextMeeting: 0, postponed: false, pledge: null, articles: null, rivalRushUntil: -1 });
  const free = candidates.filter((c) => !seated.some((s) => s.id === c.id)).sort((a, b) => b.power - a.power);
  return card(
    t(`役員会（${seated.length} / ${BOARD_SEATS} 席）`, `Board (${seated.length} / ${BOARD_SEATS})`),
    t('工房でスカウトした英雄に、役員として座ってもらえます。得意な技で全社に効きます', 'Heroes you scouted in the workshop can sit on the board. Their skill helps the whole company'),
    h(
      'ul.ke-seats',
      {},
      ...seated.map((m) => {
        const c = byId.get(m.id);
        return h(
          'li.ke-seat',
          {},
          h('span.ke-seat-face', {}, face(m.id)),
          h('span.ke-seat-text', {}, h('b', {}, c?.name ?? ctx.heroName(m.id)), h('span.ke-hint', {}, t(`${c?.kindName ?? ''}・${boardEffectText(m.kind, m.power)}`, `${c?.kindName ?? ''} · ${boardEffectText(m.kind, m.power)}`))),
          h('button.ke-icon-btn', { type: 'button', 'aria-label': t(`${c?.name ?? ''}に退いてもらう`, `Release ${c?.name ?? ''}`), onclick: () => setBoard(seated.filter((x) => x.id !== m.id)) }, svgIcon('close', 18)),
        );
      }),
      // 空いた席はまとめて 1 行（候補を下にスクロールせずに見せる）
      seated.length < BOARD_SEATS ? h('li.ke-seat.is-empty', {}, h('span.ke-hint', {}, t(`空席 ${BOARD_SEATS - seated.length}`, `${BOARD_SEATS - seated.length} empty seat(s)`))) : null,
    ),
    seated.length
      ? h(
          'div.ke-paper',
          {},
          total.demand > 1 ? row(t('客足', 'Customers'), `+${pct1(total.demand - 1)}`, 'good') : null,
          total.costCut > 0 ? row(t('原価', 'Cost'), `−${pct1(total.costCut)}`, 'good') : null,
          total.interest < 1 ? row(t('金利', 'Interest'), `−${pct1(1 - total.interest)}`, 'good') : null,
          total.quality > 0 ? row(t('品質の戻り', 'Quality recovery'), `+${pct1(total.quality)}`, 'good') : null,
          total.staff + total.owners + total.shareholders > 0 ? row(t('支持度（毎月）', 'Support (monthly)'), `+${(total.staff + total.owners + total.shareholders).toFixed(1)}`, 'good') : null,
        )
      : null,
    free.length
      ? h(
          'ul.ke-seats.is-candidates',
          { 'aria-label': t('迎えられる英雄', 'Heroes you can invite') },
          ...free.slice(0, 8).map((c) =>
            h(
              'li.ke-seat',
              {},
              h('span.ke-seat-face', {}, c.image()),
              h('span.ke-seat-text', {}, h('b', {}, c.name), h('span.ke-hint', {}, t(`${c.kindName}・${boardEffectText(c.kind, c.power)}`, `${c.kindName} · ${boardEffectText(c.kind, c.power)}`))),
              h(
                'button.ke-btn.ke-btn-small',
                { type: 'button', disabled: seated.length >= BOARD_SEATS, onclick: () => setBoard([...seated, { id: c.id, kind: c.kind, power: c.power }]) },
                t('迎える', 'Invite'),
              ),
            ),
          ),
        )
      : h('p.ke-note', {}, seated.length ? t('迎えられる英雄は、みな席に着いています。', 'Every scouted hero is already seated.') : t('工房の技能の木で英雄をスカウトすると、役員に迎えられます。', 'Scout heroes in the workshop skill tree to invite them onto the board.')),
  );
}

/** 約束の進み具合（いまの数字と目標） */
export function pledgeProgress(e: EmpireState): string | null {
  const p = e.gov?.pledge;
  if (!p) return null;
  const kept = pledgeKept(e, p);
  if (p.kind === 'revenue') {
    const now = pledgeBase(e, 'revenue');
    return t(`直近 12 か月の売上 ${money(now)}／目標 ${money(p.base * PLEDGE.revenueGrowth)}`, `12-month sales ${money(now)} / goal ${money(p.base * PLEDGE.revenueGrowth)}`);
  }
  if (p.kind === 'stores') return t(`店 ${pledgeBase(e, 'stores')}／目標 ${p.base + PLEDGE.stores}`, `Stores ${pledgeBase(e, 'stores')} / goal ${p.base + PLEDGE.stores}`);
  return kept ? t('ここまで赤字の月なし', 'No loss so far') : t('赤字の月がありました', 'There was a loss-making month');
}

/** 株主総会（上場前は銀行との面談）：演説の 3 択と、延期 */
export function meetingCard(ctx: Ctx): HTMLElement {
  const { e, draft } = ctx;
  const g = e.gov!;
  const listed = !!e.nation?.listed;
  const now = meetingNow(e);
  const c: MeetingChoice = draft.meeting ?? { praise: 'staff', rival: 'none', pledge: 'noLoss' };
  const pick = (patch: Partial<MeetingChoice>) => ctx.set((d) => ({ ...d, meeting: { ...c, ...d.meeting, ...patch }, postpone: undefined }));
  const trust = Math.round(trustOf(e));
  const line = g.postponed ? MEETING.passAfterPostpone : MEETING.pass;
  // 演説の効き目を足した、見込みの信任
  const expect = trust + (c.rival === 'declare' ? MEETING.declare : c.rival === 'hint' ? MEETING.hint : 0) + (listed && g.articles ? DIVIDEND[g.articles.dividend].trust : 0) + (g.pledge && e.month >= g.pledge.due ? (pledgeKept(e, g.pledge) ? MEETING.kept : -MEETING.broken) : 0);
  const rival = rivalOf(e.land);
  const progress = pledgeProgress(e);
  return card(
    listed ? t('株主総会', "Shareholders' meeting") : t('銀行との面談', 'Meeting the bank'),
    now ? t(`今月（${monthLabel(e.month)}）`, `This month (${monthLabel(e.month)})`) : t(`次は${monthLabel(g.nextMeeting)}`, `Next: ${monthLabel(g.nextMeeting)}`),
    h(
      'div.ke-paper',
      {},
      row(t('いまの信任', 'Trust now'), String(trust), trust < line ? 'bad' : ''),
      row(t('この演説での見込み', 'After this speech'), String(Math.max(0, Math.min(100, expect))), expect < line ? 'bad' : 'good'),
      row(t('決議が通る線', 'Needed to pass'), String(line)),
      g.pledge ? row(t(`去年の約束：${pledgeLabel(g.pledge.kind)}`, `Last pledge: ${pledgeLabel(g.pledge.kind)}`), pledgeKept(e, g.pledge) ? t('守れそう', 'On track') : t('届いていない', 'Behind'), pledgeKept(e, g.pledge) ? 'good' : 'bad') : null,
    ),
    progress ? h('p.ke-hint', {}, progress) : null,
    h(
      'div.ke-field.ke-field-stack',
      {},
      h('span.ke-field-label', {}, t('たたえる相手', 'Praise'), h('span.ke-hint', {}, t(`支持度 +${MEETING.praise}`, `Support +${MEETING.praise}`))),
      segmented<PraiseTarget>(
        t('たたえる相手', 'Praise'),
        (['owners', 'staff', 'regulars'] as const).map((w) => ({ value: w, text: t(`${stakeName(w)} ${Math.round(supportOf(e, w))}`, `${stakeName(w)} ${Math.round(supportOf(e, w))}`) })),
        c.praise,
        (v) => pick({ praise: v }),
      ),
    ),
    h(
      'div.ke-field.ke-field-stack',
      {},
      h('span.ke-field-label', {}, t(`${t(rival.company.ja, rival.company.en)}に触れる`, `On ${t(rival.company.ja, rival.company.en)}`), h('span.ke-hint', {}, t(`名指しは信任 +${MEETING.declare}、ただし半年ライバルが速まる`, `Naming them: trust +${MEETING.declare}, but they speed up for 6 months`))),
      segmented<RivalCall>(
        t('ライバル', 'Rival'),
        [
          { value: 'declare', text: t('名指し', 'Name them') },
          { value: 'hint', text: t(`遠回しに +${MEETING.hint}`, `Hint +${MEETING.hint}`) },
          { value: 'none', text: t('触れない', 'Skip') },
        ],
        c.rival,
        (v) => pick({ rival: v }),
      ),
    ),
    h(
      'div.ke-field.ke-field-stack',
      {},
      h('span.ke-field-label', {}, t('来年の約束', "Next year's pledge"), h('span.ke-hint', {}, t(`守れば信任 +${MEETING.kept}、破れば −${MEETING.broken}`, `Kept +${MEETING.kept}, broken −${MEETING.broken}`))),
      segmented<PromiseKind>(
        t('約束', 'Pledge'),
        (['revenue', 'stores', 'noLoss'] as const).map((k) => ({ value: k, text: pledgeLabel(k) })),
        c.pledge,
        (v) => pick({ pledge: v }),
      ),
    ),
    listed && g.articles ? articlesField(g.articles, c.amend ?? {}, (amend) => pick({ amend }), expect >= MEETING.amend) : null,
    now
      ? h(
          'div.ke-actions',
          {},
          costButton(draft.meeting ? t('✓ この原稿で臨む', '✓ Speech ready') : t('この原稿で臨む', 'Go with this speech'), null, () => pick({}), { pressed: !!draft.meeting, primary: !draft.meeting }),
          costButton(
            draft.postpone ? t('延期をやめる', 'Cancel postponing') : t(`${MEETING.postponeMonths} か月延ばす（信任 −${MEETING.postponeCost}）`, `Postpone ${MEETING.postponeMonths} months (trust −${MEETING.postponeCost})`),
            null,
            () => ctx.set((d) => ({ ...d, postpone: !d.postpone, meeting: d.postpone ? d.meeting : undefined }), draft.postpone ? undefined : 'debuff'),
            { pressed: !!draft.postpone, disabled: g.postponed && !draft.postpone ? t('延期は 1 年に 1 回まで', 'Only once a year') : null },
          ),
        )
      : h('p.ke-note', {}, t('総会の月になると、ここで演説を決めます。決めずに月を進めると、原稿なしで臨むことになり信任が下がります。', 'When the month comes, choose your speech here. Without one, trust falls.')),
  );
}

/** 定款の 3 つの方針（上場のとき・総会で変えるとき） */
export function articlesField(current: Articles, patch: Partial<Articles>, onChange: (p: Partial<Articles>) => void, canAmend = true): HTMLElement {
  const a = { ...current, ...patch };
  return h(
    'div.ke-field.ke-field-stack',
    {},
    h('span.ke-field-label', {}, t('定款', 'Articles'), h('span.ke-hint', {}, canAmend ? t('上場のあとは、総会の決議（信任 50 から）で変えられます', 'After listing, change them by a meeting resolution (trust 50+)') : t(`変えるには信任 ${MEETING.amend} が要ります`, `Needs trust ${MEETING.amend} to amend`))),
    segmented<boolean>(
      t('24 時間の強制', '24-hour rule'),
      [
        { value: true, text: t('24 時間を求めてよい', 'May require 24h') },
        { value: false, text: t('求めない', 'Never require') },
      ],
      a.force24,
      (v) => onChange({ ...patch, force24: v }),
    ),
    segmented<Articles['mix']>(
      t('店の形', 'Store mix'),
      [
        { value: 'direct', text: t('直営中心', 'Mostly own') },
        { value: 'balanced', text: t('半々', 'Balanced') },
        { value: 'franchise', text: t('加盟中心', 'Mostly franchise') },
      ],
      a.mix,
      (v) => onChange({ ...patch, mix: v }),
    ),
    segmented<Articles['dividend']>(
      t('配当', 'Dividend'),
      [
        { value: 0, text: t('なし', 'None') },
        { value: 1, text: t(`利益の ${DIVIDEND[1].rate * 100}%`, `${DIVIDEND[1].rate * 100}% of profit`) },
        { value: 2, text: t(`${DIVIDEND[2].rate * 100}%`, `${DIVIDEND[2].rate * 100}%`) },
      ],
      a.dividend,
      (v) => onChange({ ...patch, dividend: v }),
    ),
  );
}
