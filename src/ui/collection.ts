import { customers, RARITIES, RARITY_COLOR, RARITY_JA, series } from '../game/catalog';
import { AFFINITY, affinityRank, HERO_SETS } from '../game/heroes';
import { EDITIONS } from '../game/items';
import type { SaveData } from '../game/save';
import { computeStats } from '../game/stats';
import { h, icon } from './dom';

/** Builds the collection (図鑑) dialog body: extensions and heroes on two tabs. */
export function collectionView(save: SaveData): HTMLElement {
  const panes = { ext: extensionView(save), hero: heroView(save) };
  const tabs = h('div.collection-tabs');
  const body = h('div.collection-body', {}, panes.ext);
  for (const [key, label] of [['ext', 'エクステンション'], ['hero', 'ヒーロー']] as const) {
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
  const info = h('div.collection-info', {}, 'ヒーローを選ぶと詳細が見られます');
  const sets = HERO_SETS.map((set) => {
    const have = set.heroes.filter((x) => (save.heroes[x.id] ?? 0) > 0).length;
    const done = (save.levels[set.id] ?? 0) > 0;
    return h('div.set-row', { class: `set-row ${done ? 'done' : ''}` }, h('span', {}, set.name), h('b', {}, done ? '✓' : `${have}/${set.heroes.length}`), h('small', {}, set.reward));
  });
  const grid = h('div.hero-grid');
  for (let r = RARITIES.length - 1; r >= 0; r--) {
    for (const c of customers.filter((x) => x.rarityIndex === r)) {
      const visits = save.heroes[c.id] ?? 0;
      const rank = affinityRank(visits);
      const cell = h('button.cell', {
        class: `cell ${visits ? 'has' : 'unknown'}`,
        style: `--rarity:${RARITY_COLOR[c.rarity]}`,
        title: visits ? c.name : '？？？',
        onclick: () =>
          info.replaceChildren(
            visits
              ? h(
                  'span',
                  {},
                  h('b', { style: `color:${RARITY_COLOR[c.rarity]}` }, c.name),
                  `　${c.faction ?? ''}・パッシブ「${c.passive ?? ''}」　${(c.attributes ?? []).join(' / ')}　購入 ${visits} 回`,
                  rank ? h('span.affinity', {}, `　${AFFINITY[rank - 1].name}（支払い +${Math.round(AFFINITY[rank - 1].pay * 100)}%）`) : '',
                )
              : h('span', {}, `まだ来店していません（${RARITY_JA[c.rarity]}の客層で来店）`),
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
    h('p.collection-summary', {}, `出会ったヒーロー ${met} / ${customers.length}　コンプリート `, h('b', {}, `${HERO_SETS.filter((x) => save.levels[x.id]).length} / ${HERO_SETS.length}`)),
    info,
    grid,
    h('h3', {}, 'コンプリート報酬（その属性・勢力・レア度のヒーロー全員が購入すると達成）'),
    h('div.set-list', {}, ...sets),
  );
}

/** Extensions crafted so far, by series and rarity. */
function extensionView(save: SaveData): HTMLElement {
  const stats = computeStats(save.levels);
  const owned = new Set(save.collection);
  const total = series.reduce((n, s) => n + s.items.length + (s.shin ? 1 : 0), 0);
  const info = h('div.collection-info', {}, '図鑑のアイコンを選ぶと詳細が見られます');

  const grid = h('div.collection-grid', { style: `grid-template-columns: 7.5em repeat(${RARITIES.length + 1}, 1fr)` });
  grid.append(
    h('div'),
    ...RARITIES.map((r) => h('div.col-head', { style: `color:${RARITY_COLOR[r]}` }, RARITY_JA[r])),
    h('div.col-head', { style: 'color:#ff5d8f' }, '真'),
  );
  series.forEach((s, si) => {
    const unlocked = stats.seriesUnlocked.includes(si);
    grid.append(h('div.row-head', { class: unlocked ? 'row-head' : 'row-head dim' }, s.name));
    for (const e of s.shin ? [...s.items, s.shin] : s.items) {
      const has = owned.has(e.id);
      const best = save.bestEdition[e.id] ?? 0;
      const label = `${e.shin ? '真 ' : ''}[${RARITY_JA[e.rarity]}] ${e.name}`;
      const cell = h('button.cell', {
        class: `cell ${has ? 'has' : 'unknown'}`,
        style: `--rarity:${RARITY_COLOR[e.rarity]}`,
        title: has ? e.name : '？？？',
        onclick: () => {
          info.replaceChildren(
            has
              ? h(
                  'span',
                  {},
                  h('b', { style: `color:${RARITY_COLOR[e.rarity]}` }, label),
                  `　${e.seriesName}シリーズ・スキル「${e.skill}」`,
                  best > 0 ? h('span', { style: `color:${EDITIONS[best].color}` }, `　最高エディション: ${EDITIONS[best].name}`) : '',
                )
              : h('span', {}, unlocked ? (e.shin ? 'Legendary の中からまれに生まれる「真」の逸品' : 'まだクラフトしたことがありません') : `レシピ「${s.name}」が必要です`),
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
      `登録 ${owned.size} / ${total}　販売価格ボーナス `,
      h('b', {}, `+${(stats.collectionBonus * owned.size * 100).toFixed(1)}%`),
    ),
    info,
    grid,
  );
}
