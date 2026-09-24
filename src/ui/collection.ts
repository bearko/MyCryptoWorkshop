import { attributeName, customers, factionName, RARITIES, RARITY_COLOR, RARITY_JA, RARITY_LETTER, series } from '../game/catalog';
import { AFFINITY, affinityRank, HERO_SETS } from '../game/heroes';
import { EDITIONS } from '../game/items';
import type { SaveData } from '../game/save';
import { computeStats } from '../game/stats';
import { h, icon } from './dom';
import { t } from '../i18n';

/** Builds the collection (図鑑) dialog body: extensions and heroes on two tabs. */
export function collectionView(save: SaveData): HTMLElement {
  const panes = { ext: extensionView(save), hero: heroView(save) };
  const tabs = h('div.collection-tabs');
  const body = h('div.collection-body', {}, panes.ext);
  for (const [key, label] of [['ext', t('エクステンション', 'Extensions')], ['hero', t('ヒーロー', 'Heroes')]] as const) {
    tabs.append(
      h('button.btn.small.tab', {
        class: `btn small tab ${key === 'ext' ? 'on' : ''}`,
        onclick: (ev: Event) => {
          tabs.querySelectorAll('.tab').forEach((t) => t.classList.remove('on'));
          (ev.currentTarget as HTMLElement).classList.add('on');
          body.replaceChildren(panes[key]);
        },
      }, label),
    );
  }
  return h('div.collection-wrap', {}, tabs, body);
}

/** Heroes who have bought something, their affinity, and set progress. */
function heroView(save: SaveData): HTMLElement {
  const met = customers.filter((c) => (save.heroes[c.id] ?? 0) > 0).length;
  const info = h('div.collection-info', {}, t('ヒーローを選ぶと詳細が見られます', 'Select a hero to see details'));
  const sets = HERO_SETS.map((set) => {
    const have = set.heroes.filter((x) => (save.heroes[x.id] ?? 0) > 0).length;
    const done = (save.levels[set.id] ?? 0) > 0;
    return h('div.set-row', { class: `set-row ${done ? 'done' : ''}` }, h('span', {}, set.name), h('b', {}, done ? '✓' : `${have}/${set.heroes.length}`), h('small', {}, set.reward));
  });
  const grid = h('div.hero-grid');
  for (let r = 0; r < RARITIES.length; r++) {
    for (const c of customers.filter((x) => x.rarityIndex === r)) {
      const visits = save.heroes[c.id] ?? 0;
      const rank = affinityRank(visits);
      const cell = h('button.cell', {
        class: `cell ${visits ? 'has' : 'unknown'}`,
        style: `--rarity:${RARITY_COLOR[c.rarity]}`,
        'data-r': RARITY_LETTER[c.rarity],
        title: visits ? c.name : t('？？？', '???'),
        onclick: () =>
          info.replaceChildren(
            visits
              ? h(
                  'span',
                  {},
                  h('b', { style: `color:${RARITY_COLOR[c.rarity]}` }, c.name),
                  t(
                    `　${c.faction ?? ''}・パッシブ「${c.passive ?? ''}」　${(c.attributes ?? []).join(' / ')}　購入 ${visits} 回`,
                    `  ${factionName(c.faction ?? '')} · Passive "${c.passive ?? ''}"  ${(c.attributes ?? []).map(attributeName).join(' / ')}  Bought ${visits}×`,
                  ),
                  rank ? h('span.affinity', {}, t(`　${AFFINITY[rank - 1].name}（支払い +${Math.round(AFFINITY[rank - 1].pay * 100)}%）`, `  ${AFFINITY[rank - 1].name} (pays +${Math.round(AFFINITY[rank - 1].pay * 100)}%)`)) : '',
                )
              : h('span', {}, t(`まだ来店していません（${RARITY_JA[c.rarity]}の客層で来店）`, `Hasn't visited yet (comes with the ${RARITY_JA[c.rarity]} clientele)`)),
          ),
      });
      cell.append(icon(c.image, 'px'));
      if (rank) cell.append(h('span.affinity-badge', {}, '★'.repeat(rank)));
      grid.append(cell);
    }
  }
  return h(
    'div.collection',
    {},
    h('p.collection-summary', {}, t(`出会ったヒーロー ${met} / ${customers.length}　コンプリート `, `Heroes met ${met} / ${customers.length}  Sets complete `), h('b', {}, `${HERO_SETS.filter((x) => save.levels[x.id]).length} / ${HERO_SETS.length}`)),
    info,
    grid,
    h('h3', {}, t('コンプリート報酬（その属性・勢力・レア度のヒーロー全員が購入すると達成）', 'Set rewards (complete when every hero of that attribute, faction or rarity has bought something)')),
    h('div.set-list', {}, ...sets),
  );
}

/** Extensions crafted so far, by series and rarity. */
function extensionView(save: SaveData): HTMLElement {
  const stats = computeStats(save.levels);
  const owned = new Set(save.collection);
  const total = series.reduce((n, s) => n + s.items.length + (s.shin ? 1 : 0), 0);
  const info = h('div.collection-info', {}, t('図鑑のアイコンを選ぶと詳細が見られます', 'Select an icon to see details'));

  const grid = h('div.collection-grid', { style: `grid-template-columns: 7.5em repeat(${RARITIES.length + 1}, 1fr)` });
  grid.append(
    h('div'),
    ...RARITIES.map((r) => h('div.col-head', { style: `color:${RARITY_COLOR[r]}` }, RARITY_JA[r])),
    h('div.col-head', { style: 'color:#ff5d8f' }, t('真', 'Shin')),
  );
  series.forEach((s, si) => {
    const unlocked = stats.seriesUnlocked.includes(si);
    grid.append(h('div.row-head', { class: unlocked ? 'row-head' : 'row-head dim' }, s.name));
    for (const e of s.shin ? [...s.items, s.shin] : s.items) {
      const has = owned.has(e.id);
      const best = save.bestEdition[e.id] ?? 0;
      const shinTag = e.shin ? t('真 ', 'Shin ') : '';
      const label = `${shinTag}[${RARITY_JA[e.rarity]}] ${e.name}`;
      const cell = h('button.cell', {
        class: `cell ${has ? 'has' : 'unknown'}`,
        style: `--rarity:${RARITY_COLOR[e.rarity]}`,
        'data-r': RARITY_LETTER[e.rarity],
        title: has ? e.name : t('？？？', '???'),
        onclick: () => {
          info.replaceChildren(
            has
              ? h(
                  'span',
                  {},
                  h('b', { style: `color:${RARITY_COLOR[e.rarity]}` }, label),
                  t(`　${e.seriesName}シリーズ・スキル「${e.skill}」`, `  ${e.seriesName} series · Skill "${e.skill}"`),
                  best > 0 ? h('span', { style: `color:${EDITIONS[best].color}` }, t(`　最高エディション: ${EDITIONS[best].name}`, `  Best edition: ${EDITIONS[best].name}`)) : '',
                )
              : h('span', {}, unlocked ? (e.shin ? t('Legendary の中からまれに生まれる「真」の逸品', 'A rare "Shin" masterpiece born from Legendaries') : t('まだクラフトしたことがありません', 'Not crafted yet')) : t(`レシピ「${s.name}」が必要です`, `Needs the ${s.name} recipe`)),
          );
        },
      });
      cell.append(icon(e.image, 'px'));
      if (has && best > 0) cell.append(h('span.edition-dot', { style: `background:${EDITIONS[best].color}`, title: EDITIONS[best].name }));
      grid.append(cell);
    }
    if (!s.shin) grid.append(h('div'));
  });

  return h(
    'div.collection',
    {},
    h(
      'p.collection-summary',
      {},
      t(`登録 ${owned.size} / ${total}　販売価格ボーナス `, `Collected ${owned.size} / ${total}  Sale price bonus `),
      h('b', {}, `+${(stats.collectionBonus * owned.size * 100).toFixed(1)}%`),
    ),
    info,
    grid,
  );
}
