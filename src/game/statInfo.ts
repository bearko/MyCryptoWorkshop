import { RARITIES, RARITY_JA, series } from './catalog';
import type { LineStat, NumStat } from './effects';
import { EDITIONS } from './items';
import { LINE_IDS, LINES } from './lines';
import { secs } from './format';
import type { Stats } from './stats';

const pct = (v: number) => `${Math.round(v * 1000) / 10}%`;
const times = (v: number) => `×${v.toFixed(2)}`;

type Info = { label: string; format: (v: number) => string };

const LINE_STAT_INFO: Partial<Record<LineStat, Info>> = {
  unlocked: { label: '稼働', format: (v) => (v > 0 ? '稼働中' : '停止') },
  craftTime: { label: 'クラフト時間', format: secs },
  craftClick: { label: 'タップ1回の進み', format: pct },
  doubleChance: { label: '同時クラフト率', format: pct },
  luck: { label: '最高レアの出やすさ', format: times },
  helperInterval: { label: 'マインちゃんのかき混ぜ間隔', format: (v) => (v > 0 ? secs(v) : 'なし') },
  overclock: { label: '長押し中の速さ', format: times },
  heatRate: { label: '長押しの過熱ペース', format: (v) => `${v.toFixed(2)}/秒` },
  coolRate: { label: '冷却ペース', format: (v) => `${v.toFixed(2)}/秒` },
  editionLuck: { label: 'エディションの出やすさ', format: times },
};

/** Player-facing label and formatter per stat. Stats without an entry are not shown. */
export const STAT_INFO: Partial<Record<NumStat | 'spawnInterval', Info>> = {
  dayLength: { label: '営業時間', format: (v) => `${Math.round(v)}秒` },
  maxRarity: { label: '最高レアリティ', format: (v) => RARITY_JA[RARITIES[v]] },
  luck: { label: '最高レアの出やすさ（全ライン）', format: times },
  storageCap: { label: '倉庫の容量', format: (v) => `${v}個` },
  shelfSlots: { label: '陳列スペース', format: (v) => `${v}枠` },
  spawnInterval: { label: '来客間隔', format: secs },
  groupChance: { label: '団体客の確率', format: pct },
  patience: { label: '棚の前で待つ時間', format: secs },
  queuePatience: { label: 'レジで待つ時間', format: secs },
  walkSpeed: { label: '客の移動速度', format: (v) => `${Math.round(v)}` },
  maxTier: { label: '来店する客層', format: (v) => `${RARITY_JA[RARITIES[v]]}ヒーローまで` },
  priceMult: { label: '販売価格', format: times },
  collectionBonus: { label: '図鑑1種あたりの価格ボーナス', format: pct },
  cashierTime: { label: '会計時間', format: secs },
  registers: { label: 'レジの台数', format: (v) => `${v}台` },
  registerClick: { label: 'レジタップ1回の進み', format: secs },
  tipChance: { label: 'チップの確率', format: pct },
  bountyMult: { label: '懸賞金', format: times },
  thiefSpeed: { label: '泥棒の逃げ足', format: times },
  stealTime: { label: '泥棒が盗む時間', format: secs },
  guardChance: { label: '警備の捕獲率', format: pct },
  pestInterval: { label: 'エネミーの出現間隔', format: times },
  pestBountyMult: { label: '退治報酬', format: times },
  editionTier: { label: '出るエディション', format: (v) => (v > 0 ? `${EDITIONS[v].name}まで` : 'なし') },
  editionLuck: { label: 'エディションの出やすさ（全ライン）', format: times },
  shinChance: { label: '「真」の出る確率（Legendary）', format: pct },
  dismantleRarity: { label: '分解炉で分解するレアリティ', format: (v) => (v >= 0 ? `${RARITY_JA[RARITIES[v]]}以下` : 'なし') },
  dustMult: { label: 'ゴールドダストの量', format: times },
  gemChance: { label: '魔石が出る確率', format: pct },
  infusion: { label: '魔石の投入', format: (v) => (v > 0 ? '可能' : '不可') },
  infusionPower: { label: '魔石の効果', format: times },
  packer: { label: '梱包機', format: (v) => (v > 0 ? '高い品から補充' : 'なし') },
  ...Object.fromEntries(
    LINE_IDS.flatMap((line) =>
      Object.entries(LINE_STAT_INFO).map(([k, info]) => [`${line}.${k}`, { label: `${LINES[line].name}: ${info!.label}`, format: info!.format }]),
    ),
  ),
};

export interface StatChange {
  label: string;
  from: string;
  to: string;
}

/** Lists what changes between two stat sets, in display form. */
export function describeChanges(before: Stats, after: Stats): StatChange[] {
  const changes: StatChange[] = [];
  for (const [key, info] of Object.entries(STAT_INFO)) {
    const a = before[key as keyof Stats] as number;
    const b = after[key as keyof Stats] as number;
    if (Math.abs(a - b) < 1e-9 || !info) continue;
    const from = info.format(a);
    const to = info.format(b);
    if (from !== to) changes.push({ label: info.label, from, to });
  }
  const newSeries = after.seriesUnlocked.filter((i) => !before.seriesUnlocked.includes(i));
  for (const i of newSeries) changes.push({ label: 'クラフトできるシリーズ', from: `${before.seriesUnlocked.length}種`, to: `${after.seriesUnlocked.length}種（+${series[i].name}）` });
  return changes;
}
