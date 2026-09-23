import { RARITIES, RARITY_COLOR, RARITY_JA, series } from '../game/catalog';
import type { SaveData } from '../game/save';
import { computeStats } from '../game/stats';
import { h, icon } from './dom';

/** Builds the collection (図鑑) dialog body. */
export function collectionView(save: SaveData): HTMLElement {
  const stats = computeStats(save.levels);
  const owned = new Set(save.collection);
  const total = series.reduce((n, s) => n + s.items.length, 0);
  const info = h('div.collection-info', {}, '図鑑のアイコンを選ぶと詳細が見られます');

  const grid = h('div.collection-grid', { style: `grid-template-columns: 7.5em repeat(${RARITIES.length}, 1fr)` });
  grid.append(h('div'), ...RARITIES.map((r) => h('div.col-head', { style: `color:${RARITY_COLOR[r]}` }, RARITY_JA[r])));
  series.forEach((s, si) => {
    const unlocked = stats.seriesUnlocked.includes(si);
    grid.append(h('div.row-head', { class: unlocked ? 'row-head' : 'row-head dim' }, s.name));
    for (const e of s.items) {
      const has = owned.has(e.id);
      const cell = h('button.cell', {
        class: `cell ${has ? 'has' : 'unknown'}`,
        style: `--rarity:${RARITY_COLOR[e.rarity]}`,
        title: has ? e.name : '？？？',
        onclick: () => {
          info.replaceChildren(
            has
              ? h('span', {}, h('b', { style: `color:${RARITY_COLOR[e.rarity]}` }, `[${RARITY_JA[e.rarity]}] ${e.name}`), `　${e.seriesName}シリーズ・スキル「${e.skill}」`)
              : h('span', {}, unlocked ? 'まだクラフトしたことがありません' : `レシピ「${s.name}」が必要です`),
          );
        },
      });
      cell.append(icon(e.image, 'px'));
      grid.append(cell);
    }
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
