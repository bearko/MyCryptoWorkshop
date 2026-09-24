import { lands } from '../game/catalog';
import { BLESSINGS, cpForRun, fameBonus, runRevenue, START_GUM } from '../game/prestige';
import type { SaveData } from '../game/save';
import { level } from '../game/skills';
import { computeStats } from '../game/stats';
import { fileImg, fmt, h, icon } from './dom';
import { t } from '../i18n';

const hm = (seconds: number) => t(`${Math.floor(seconds / 3600)}時間${Math.floor((seconds % 3600) / 60)}分`, `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`);
const landName = (key: string | null) => lands.find((l) => l.key === key)?.name ?? t('始まりの地', 'The first land');

/**
 * ランド移転: pick the land to move to (its cryptid's blessing stacks), see the Cp it pays,
 * and confirm twice. Only offered after the clear.
 */
export function relocateView(save: SaveData, onMove: (land: string) => void): HTMLElement {
  const stats = computeStats(save.levels);
  const cp = cpForRun(save);
  let chosen: string | null = null;
  const confirm = h('button.btn.btn-primary.relocate-go', {}, t('移転先を選んでください', 'Choose where to move')) as HTMLButtonElement;
  confirm.disabled = true;
  const cards = lands.map((land) => {
    const b = BLESSINGS[land.key];
    const lv = level(save.levels, `bless_${land.key}`);
    const card = h(
      'button.land-card',
      {
        onclick: () => {
          chosen = land.key;
          for (const c of cards) c.classList.toggle('on', c === card);
          delete confirm.dataset.armed;
          confirm.disabled = false;
          confirm.textContent = t(`${land.name} へ移転する`, `Move to ${land.name}`);
        },
      },
      h('div.land-card-view', {}, fileImg(land.view, 'land-card-bg'), icon(land.cryptid, 'px land-card-cryptid')),
      h('b', {}, land.name),
      h('span.land-card-bless', {}, `${b.name}${lv ? ` Lv${lv}→${lv + 1}` : ''}`),
      h('small', {}, b.desc),
    );
    if (land.key === save.prestige.home) card.classList.add('home');
    return card;
  });
  confirm.addEventListener('click', () => {
    if (!chosen) return;
    if (confirm.dataset.armed !== '1') {
      confirm.dataset.armed = '1';
      confirm.textContent = t('もう一度押すと移転します（やり直せません）', 'Press again to move (this can\'t be undone)');
      return;
    }
    onMove(chosen);
  });
  const nextGum = START_GUM[Math.min(START_GUM.length - 1, stats.startGum)];
  return h(
    'div.relocate',
    {},
    h(
      'p',
      {},
      t('工房を新しいランドへ移し、1日目からやり直します。移転先のクリプタイドが工房を守り、その加護（重ねがけ可）がずっと続きます。', 'Move the workshop to a new land and start again from Day 1. The land\'s cryptid guards the workshop, and its blessing (which stacks) lasts forever.'),
    ),
    h(
      'div.stat-grid',
      {},
      ...(
        [
          [t('この周回の売上', 'Sales this run'), `${fmt(runRevenue(save))} GUM`],
          [t('名声', 'Fame'), t(`${fmt(save.prestige.fame)}（Cp ×${fameBonus(save.prestige.fame).toFixed(2)}）`, `${fmt(save.prestige.fame)} (Cp ×${fameBonus(save.prestige.fame).toFixed(2)})`)],
          [t('もらえる Cp', 'Cp you get'), `+${fmt(cp)}`],
          [t('次の周回の所持金', 'GUM next run'), `${fmt(nextGum)} GUM`],
        ] as [string, string][]
      ).map(([k, v]) => h('div.stat-row', {}, h('span', {}, k), h('b', {}, v))),
    ),
    h('p.muted', {}, t('引き継ぐもの: 図鑑・ヒーロー図鑑とコンプリート報酬・実績・エンブレムと名誉・加護・移転スキル・常連客・累計成績', 'Kept: collection, hero book and set rewards, achievements, emblems and honor, blessings, relocation skills, regulars, lifetime stats')),
    h('p.muted', {}, t('リセットされるもの: GUM・日数・その他のスキル・在庫・ダスト・魔石・研究pt・注文・依頼', 'Reset: GUM, days, other skills, stock, dust, stones, research points, orders, requests')),
    h('div.land-cards', {}, ...cards),
    confirm,
  );
}

/** 統計: the current run, every past run and the blessings so far. */
export function statsView(save: SaveData): HTMLElement {
  const p = save.prestige;
  const now = save.meta.playSeconds - p.runStartSeconds;
  const row = (k: string, v: string) => h('div.stat-row', {}, h('span', {}, k), h('b', {}, v));
  const blessings = lands.filter((l) => level(save.levels, `bless_${l.key}`) > 0);
  const history = p.history.map((r) =>
    h(
      'tr',
      {},
      h('td', {}, t(`${r.run}周目`, `Run ${r.run}`)),
      h('td', {}, landName(r.land)),
      h('td', {}, t(`${r.days}日`, `${r.days}`)),
      h('td', {}, r.clearSeconds !== null ? hm(r.clearSeconds) : '—'),
      h('td', {}, fmt(r.revenue)),
      h('td', {}, `+${fmt(r.cp)}`),
    ),
  );
  const best = p.history.filter((r) => r.clearSeconds !== null).map((r) => r.clearSeconds!);
  return h(
    'div.stats-view',
    {},
    h('h3', {}, t(`${p.runs + 1}周目（${landName(p.home)}）`, `Run ${p.runs + 1} (${landName(p.home)})`)),
    h(
      'div.stat-grid',
      {},
      row(t('営業日数', 'Days open'), t(`${save.day - 1}日`, `${save.day - 1}`)),
      row(t('プレイ時間', 'Play time'), hm(now)),
      row(t('売上', 'Sales'), `${fmt(runRevenue(save))} GUM`),
      row(t('名声', 'Fame'), fmt(p.fame)),
      row(t('クリア', 'Clear'), p.clearSeconds !== null ? hm(p.clearSeconds) : t('まだ', 'Not yet')),
      row(t('所持 Cp', 'Cp held'), fmt(p.cp)),
    ),
    p.history.length
      ? h(
          'div.run-table-wrap',
          {},
          h(
            'table.run-table',
            {},
            h('thead', {}, h('tr', {}, ...[t('周回', 'Run'), t('ランド', 'Land'), t('日数', 'Days'), t('クリア', 'Clear'), t('売上', 'Sales'), 'Cp'].map((label) => h('th', {}, label)))),
            h('tbody', {}, ...history),
          ),
        )
      : h('p.muted', {}, t('クリア後にランド移転すると、周回の記録がここに並びます。', 'After the clear, relocate to a new land and your runs will be listed here.')),
    best.length ? h('p.muted', {}, t(`最速クリア: ${hm(Math.min(...best))}`, `Fastest clear: ${hm(Math.min(...best))}`)) : null,
    blessings.length
      ? h(
          'div.bless-list',
          {},
          h('h3', {}, t('クリプタイドの加護', 'Cryptid blessings')),
          ...blessings.map((l) =>
            h('div.bless-row', {}, icon(l.cryptid, 'px'), h('b', {}, `${BLESSINGS[l.key].name} Lv${level(save.levels, `bless_${l.key}`)}`), h('span', {}, BLESSINGS[l.key].desc)),
          ),
        )
      : null,
    h(
      'div.stat-grid',
      {},
      row(t('全周回の売上', 'Sales, all runs'), `${fmt(save.totals.revenue)} GUM`),
      row(t('最高日商', 'Best day'), `${fmt(Math.max(p.bestDay, save.bestDayRevenue))} GUM`),
      row(t('総プレイ時間', 'Total play time'), hm(save.meta.playSeconds)),
      row(t('移転回数', 'Relocations'), t(`${p.runs}回`, `${p.runs}`)),
    ),
  );
}
