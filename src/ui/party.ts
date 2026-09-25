import { attributeName, series } from '../game/catalog';
import { FACTION_BY_NAME, FACTION_NAME } from '../game/factions';
import { activeParty, MAX_PARTY, memberTuning, PARTY_ROSTER, partyHero, partySynergies, scoutId, SKILL_KIND_NAME, skillText, skillValue, suggestParty, supportText, taughtSeries, type PartyHeroDef } from '../game/party';
import type { SaveData } from '../game/save';
import { computeStats } from '../game/stats';
import { t } from '../i18n';
import { h, icon } from './dom';

const TIER_LABEL = { 1: t('酒場', 'Tavern'), 2: t('広間', 'Hall'), 3: t('伝説', 'Legend') };

/**
 * パーティ編成: pick up to the party slots from the scouted heroes (tap a card to add or remove
 * it), with the synergies of the current line-up and an おまかせ button. Changes are saved at
 * once through `persist`, and `onChange` refreshes whatever shows the party.
 */
export function partyView(save: SaveData, persist: () => void, onChange: () => void): HTMLElement {
  const slots = computeStats(save.levels).partySlots;
  const head = h('div.party-slots');
  const synergyBox = h('div.party-synergies');
  const list = h('div.party-roster');
  const scouted = PARTY_ROSTER.filter((d) => (save.levels[scoutId(d.id)] ?? 0) > 0);

  const current = () => activeParty(save.party, save.levels, slots);
  const setParty = (ids: number[]) => {
    save.party = ids;
    persist();
    render();
    onChange();
  };

  function card(d: PartyHeroDef, members: number[]): HTMLElement {
    const hero = partyHero(d.id);
    const level = save.levels[scoutId(d.id)] ?? 1;
    const inParty = members.includes(d.id);
    const { cooldown, boost } = memberTuning(d.id, level, inParty ? members : [...members, d.id]);
    const skill = skillText(d.kind, skillValue(d.kind, level, d.tier, boost), hero.name);
    const faction = hero.faction ? FACTION_BY_NAME[hero.faction] : undefined;
    const full = !inParty && members.length >= slots;
    return h(
      'button.party-card',
      {
        class: `party-card ${inParty ? 'in' : ''} ${full ? 'full' : ''}`,
        'aria-pressed': String(inParty),
        onclick: () => {
          if (inParty) setParty(members.filter((id) => id !== d.id));
          else if (!full) setParty([...members, d.id]);
        },
      },
      icon(hero.image, 'px party-card-img'),
      h(
        'div.party-card-body',
        {},
        h(
          'div.party-card-head',
          {},
          h('b', {}, hero.name),
          h('span.party-lv', {}, `Lv${level}`),
          h('span.party-tier', {}, TIER_LABEL[d.tier]),
          faction ? h('span.party-faction', {}, FACTION_NAME[faction]) : null,
        ),
        h('div.party-skill', {}, h('span.party-kind', {}, SKILL_KIND_NAME[d.kind]), `「${hero.passive}」 `, skill, h('small', {}, t(` （${Math.round(cooldown)}秒ごと）`, ` (every ${Math.round(cooldown)}s)`))),
        h('small.party-support', {}, t('サポート（常時）: ', 'Support (always): '), supportText(d, level)),
        h('small.party-attrs', {}, (hero.attributes ?? []).map(attributeName).join(' / '), ' · ', t('レシピ: ', 'Recipes: '), taughtSeries(d).map((i) => series[i].name).join(t('・', ', '))),
      ),
      inParty ? h('span.party-check', {}, '✓') : null,
    );
  }

  function render(): void {
    const members = current();
    head.replaceChildren(
      h('span.party-count', {}, t(`パーティ ${members.length} / ${slots}人`, `Party ${members.length} / ${slots}`)),
      ...Array.from({ length: Math.min(MAX_PARTY, slots) }, (_, i) => {
        const id = members[i];
        return id !== undefined
          ? h('button.party-slot', { title: partyHero(id).name, onclick: () => setParty(members.filter((m) => m !== id)) }, icon(partyHero(id).image, 'px party-icon'))
          : h('span.party-slot.empty', {}, '+');
      }),
    );
    const synergies = partySynergies(members);
    synergyBox.replaceChildren(
      h('b', {}, t('シナジー', 'Synergies')),
      synergies.length
        ? h('ul', {}, ...synergies.map((s) => h('li', {}, h('span.party-kind', {}, s.name), ` ×${s.members.length}: ${s.text}`)))
        : h('small.muted', {}, t('同じ属性のヒーロー2人でスキルが早く溜まり、同じ陣営3人でスキルの効果が上がる', 'Two heroes sharing an attribute charge faster; three of one faction have stronger skills')),
    );
    list.replaceChildren(...scouted.map((d) => card(d, members)));
  }

  const auto = h('button.btn.small', { onclick: () => setParty(suggestParty(save.levels, slots)) }, t('おまかせ編成', 'Auto-pick'));
  const clear = h('button.btn.small', { onclick: () => setParty([]) }, t('全員外す', 'Clear'));
  render();
  const locked = PARTY_ROSTER.length - scouted.length;
  return h(
    'div.party',
    {},
    h('p.muted.small-print', {}, t('パーティのヒーローは工房のバルコニーに立ち、スキルが溜まるたびに発動する。編成は開店前に変えられる。', 'Party heroes stand on the workshop balcony and use their skill whenever it charges. Change the party before opening.')),
    head,
    h('div.party-actions', {}, auto, clear),
    synergyBox,
    list,
    locked > 0 ? h('p.muted.small-print', {}, t(`ほかに ${locked} 人のヒーローがスキルツリーの「英雄」でスカウトを待っている`, `${locked} more heroes are waiting to be scouted in the Heroes branch of the skill tree`)) : null,
  );
}

/** The party as a row of small icons (for the day's card). */
export function partyStrip(save: SaveData): HTMLElement | null {
  const slots = computeStats(save.levels).partySlots;
  if (slots <= 0) return null;
  const members = activeParty(save.party, save.levels, slots);
  return h(
    'div.party-strip',
    {},
    ...members.map((id) => icon(partyHero(id).image, 'px party-icon')),
    ...Array.from({ length: Math.max(0, slots - members.length) }, () => h('span.party-slot.empty', {}, '+')),
  );
}
