import { lands } from '../game/catalog';
import { BLESSINGS, cpForRun, fameBonus, runRevenue, START_GUM } from '../game/prestige';
import type { SaveData } from '../game/save';
import { level } from '../game/skills';
import { computeStats } from '../game/stats';
import { fileImg, fmt, h, icon } from './dom';

const hm = (seconds: number) => `${Math.floor(seconds / 3600)}時間${Math.floor((seconds % 3600) / 60)}分`;
const landName = (key: string | null) => lands.find((l) => l.key === key)?.name ?? '始まりの地';

/**
 * ランド移転: pick the land to move to (its cryptid's blessing stacks), see the Cp it pays,
 * and confirm twice. Only offered after the clear.
 */
export function relocateView(save: SaveData, onMove: (land: string) => void): HTMLElement {
  const stats = computeStats(save.levels);
  const cp = cpForRun(save);
  let chosen: string | null = null;
  const confirm = h('button.btn.btn-primary.relocate-go', {}, '移転先を選んでください') as HTMLButtonElement;
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
          confirm.textContent = `${land.name} へ移転する`;
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
      confirm.textContent = 'もう一度押すと移転します（やり直せません）';
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
      '工房を新しいランドへ移し、1日目からやり直します。移転先のクリプタイドが工房を守り、その加護（重ねがけ可）がずっと続きます。',
    ),
    h(
      'div.stat-grid',
      {},
      ...(
        [
          ['この周回の売上', `${fmt(runRevenue(save))} GUM`],
          ['名声', `${fmt(save.prestige.fame)}（Cp ×${fameBonus(save.prestige.fame).toFixed(2)}）`],
          ['もらえる Cp', `+${fmt(cp)}`],
          ['次の周回の所持金', `${fmt(nextGum)} GUM`],
        ] as [string, string][]
      ).map(([k, v]) => h('div.stat-row', {}, h('span', {}, k), h('b', {}, v))),
    ),
    h('p.muted', {}, '引き継ぐもの: 図鑑・ヒーロー図鑑とコンプリート報酬・実績・エンブレムと名誉・加護・移転スキル・常連客・累計成績'),
    h('p.muted', {}, 'リセットされるもの: GUM・日数・その他のスキル・在庫・ダスト・魔石・研究pt・注文・依頼'),
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
      h('td', {}, `${r.run}周目`),
      h('td', {}, landName(r.land)),
      h('td', {}, `${r.days}日`),
      h('td', {}, r.clearSeconds !== null ? hm(r.clearSeconds) : '—'),
      h('td', {}, fmt(r.revenue)),
      h('td', {}, `+${fmt(r.cp)}`),
    ),
  );
  const best = p.history.filter((r) => r.clearSeconds !== null).map((r) => r.clearSeconds!);
  return h(
    'div.stats-view',
    {},
    h('h3', {}, `${p.runs + 1}周目（${landName(p.home)}）`),
    h(
      'div.stat-grid',
      {},
      row('営業日数', `${save.day - 1}日`),
      row('プレイ時間', hm(now)),
      row('売上', `${fmt(runRevenue(save))} GUM`),
      row('名声', fmt(p.fame)),
      row('クリア', p.clearSeconds !== null ? hm(p.clearSeconds) : 'まだ'),
      row('所持 Cp', fmt(p.cp)),
    ),
    p.history.length
      ? h(
          'div.run-table-wrap',
          {},
          h(
            'table.run-table',
            {},
            h('thead', {}, h('tr', {}, ...['周回', 'ランド', '日数', 'クリア', '売上', 'Cp'].map((t) => h('th', {}, t)))),
            h('tbody', {}, ...history),
          ),
        )
      : h('p.muted', {}, 'クリア後にランド移転すると、周回の記録がここに並びます。'),
    best.length ? h('p.muted', {}, `最速クリア: ${hm(Math.min(...best))}`) : null,
    blessings.length
      ? h(
          'div.bless-list',
          {},
          h('h3', {}, 'クリプタイドの加護'),
          ...blessings.map((l) =>
            h('div.bless-row', {}, icon(l.cryptid, 'px'), h('b', {}, `${BLESSINGS[l.key].name} Lv${level(save.levels, `bless_${l.key}`)}`), h('span', {}, BLESSINGS[l.key].desc)),
          ),
        )
      : null,
    h(
      'div.stat-grid',
      {},
      row('全周回の売上', `${fmt(save.totals.revenue)} GUM`),
      row('最高日商', `${fmt(Math.max(p.bestDay, save.bestDayRevenue))} GUM`),
      row('総プレイ時間', hm(save.meta.playSeconds)),
      row('移転回数', `${p.runs}回`),
    ),
  );
}
