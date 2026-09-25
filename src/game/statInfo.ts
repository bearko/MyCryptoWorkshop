import { RARITIES, RARITY_JA, series } from './catalog';
import type { LineStat, NumStat } from './effects';
import { EDITIONS } from './items';
import { LINE_IDS, LINES } from './lines';
import { ROLES, STAFF_ROLES, staffHero } from './staff';
import { FACTION_KEYS, FACTION_NAME } from './factions';
import { secs } from './format';
import type { Stats } from './stats';
import { t } from '../i18n';

const pct = (v: number) => `${Math.round(v * 1000) / 10}%`;
const times = (v: number) => `×${v.toFixed(2)}`;

type Info = { label: string; format: (v: number) => string };

const LINE_STAT_INFO: Partial<Record<LineStat, Info>> = {
  unlocked: { label: t('稼働', 'Running'), format: (v) => (v > 0 ? t('稼働中', 'Running') : t('停止', 'Stopped')) },
  craftTime: { label: t('クラフト時間', 'Craft time'), format: secs },
  craftClick: { label: t('タップ1回の進み', 'Progress per tap'), format: pct },
  doubleChance: { label: t('同時クラフト率', 'Twin craft chance'), format: pct },
  luck: { label: t('最高レアの出やすさ', 'Top-rarity chance'), format: times },
  helperInterval: { label: t('マインちゃんのかき混ぜ間隔', "Mine-chan's stirring interval"), format: (v) => (v > 0 ? secs(v) : t('なし', 'None')) },
  overclock: { label: t('長押し中の速さ', 'Speed while held'), format: times },
  heatRate: { label: t('長押しの過熱ペース', 'Heat rate while held'), format: (v) => t(`${v.toFixed(2)}/秒`, `${v.toFixed(2)}/s`) },
  coolRate: { label: t('冷却ペース', 'Cooling rate'), format: (v) => t(`${v.toFixed(2)}/秒`, `${v.toFixed(2)}/s`) },
  editionLuck: { label: t('エディションの出やすさ', 'Edition chance'), format: times },
};

/** Player-facing label and formatter per stat. Stats without an entry are not shown. */
export const STAT_INFO: Partial<Record<NumStat | 'spawnInterval', Info>> = {
  dayLength: { label: t('営業時間', 'Business hours'), format: (v) => t(`${Math.round(v)}秒`, `${Math.round(v)}s`) },
  maxRarity: { label: t('最高レアリティ', 'Top rarity'), format: (v) => RARITY_JA[RARITIES[v]] },
  luck: { label: t('最高レアの出やすさ（全ライン）', 'Top-rarity chance (all lines)'), format: times },
  storageCap: { label: t('倉庫の容量', 'Storage capacity'), format: (v) => t(`${v}個`, `${v}`) },
  shelfSlots: { label: t('陳列スペース', 'Display slots'), format: (v) => t(`${v}枠`, `${v} slots`) },
  spawnInterval: { label: t('来客間隔', 'Customer interval'), format: secs },
  groupChance: { label: t('団体客の確率', 'Group chance'), format: pct },
  patience: { label: t('棚の前で待つ時間', 'Wait at the shelf'), format: secs },
  queuePatience: { label: t('レジで待つ時間', 'Wait at the register'), format: secs },
  walkSpeed: { label: t('客の移動速度', 'Customer walking speed'), format: (v) => `${Math.round(v)}` },
  maxTier: { label: t('来店する客層', 'Clientele'), format: (v) => t(`${RARITY_JA[RARITIES[v]]}ヒーローまで`, `Up to ${RARITY_JA[RARITIES[v]]} heroes`) },
  priceMult: { label: t('販売価格', 'Sale price'), format: times },
  collectionBonus: { label: t('図鑑1種あたりの価格ボーナス', 'Price bonus per collection entry'), format: pct },
  cashierTime: { label: t('会計時間', 'Checkout time'), format: secs },
  registers: { label: t('レジの台数', 'Registers'), format: (v) => t(`${v}台`, `${v}`) },
  registerClick: { label: t('レジタップ1回の進み', 'Progress per register tap'), format: secs },
  tipChance: { label: t('チップの確率', 'Tip chance'), format: pct },
  bountyMult: { label: t('懸賞金', 'Bounty'), format: times },
  thiefSpeed: { label: t('泥棒の逃げ足', 'Thief speed'), format: times },
  stealTime: { label: t('泥棒が盗む時間', 'Time to steal'), format: secs },
  guardChance: { label: t('警備の捕獲率', 'Guard catch rate'), format: pct },
  pestInterval: { label: t('エネミーの出現間隔', 'Enemy interval'), format: times },
  pestBountyMult: { label: t('退治報酬', 'Extermination reward'), format: times },
  editionTier: { label: t('出るエディション', 'Editions'), format: (v) => (v > 0 ? t(`${EDITIONS[v].name}まで`, `Up to ${EDITIONS[v].name}`) : t('なし', 'None')) },
  editionLuck: { label: t('エディションの出やすさ（全ライン）', 'Edition chance (all lines)'), format: times },
  shinChance: { label: t('「真」の出る確率（Legendary）', 'Shin chance (Legendary)'), format: pct },
  dismantleRarity: { label: t('分解炉で分解するレアリティ', 'Dismantled rarities'), format: (v) => (v >= 0 ? t(`${RARITY_JA[RARITIES[v]]}以下`, `${RARITY_JA[RARITIES[v]]} and below`) : t('なし', 'None')) },
  dustMult: { label: t('ゴールドダストの量', 'Gold dust yield'), format: times },
  gemChance: { label: t('魔石が出る確率', 'Magic stone chance'), format: pct },
  infusion: { label: t('魔石の投入', 'Stone infusion'), format: (v) => (v > 0 ? t('可能', 'Available') : t('不可', 'Unavailable')) },
  infusionPower: { label: t('魔石の効果', 'Magic stone effect'), format: times },
  packer: { label: t('梱包機', 'Packer'), format: (v) => (v > 0 ? t('高い品から補充', 'Pricier items first') : t('なし', 'None')) },
  restockTime: { label: t('棚への補充間隔', 'Restock interval'), format: secs },
  browseTime: { label: t('客が品を選ぶ時間', 'Choosing time'), format: secs },
  upsell: { label: t('高い品を勧める確率', 'Upsell chance'), format: pct },
  closingBonus: { label: t('閉店時の売上ボーナス', 'Closing sales bonus'), format: pct },
  guardSpeed: { label: t('警備係の足の速さ', 'Guard speed'), format: (v) => `${Math.round(v)}` },
  hunterSpeed: { label: t('退治係の足の速さ', 'Exterminator speed'), format: (v) => `${Math.round(v)}` },
  researchRate: { label: t('研究ポイント', 'Research points'), format: (v) => t(`${v.toFixed(1)}/分`, `${v.toFixed(1)}/min`) },
  market: { label: t('マーケット出品', 'Market listing'), format: (v) => (v > 0 ? t('あり', 'Yes') : t('なし', 'None')) },
  marketInterval: { label: t('出品の間隔', 'Listing interval'), format: secs },
  marketRate: { label: t('マーケットの買取価格', 'Market price'), format: pct },
  peddlerTrip: { label: t('行商の往復時間', 'Peddling round trip'), format: secs },
  peddlerLoad: { label: t('行商で持ち出す数', 'Items per trip'), format: (v) => t(`${v}個`, `${v}`) },
  peddlerRate: { label: t('行商の売値', 'Peddling price'), format: pct },
  autoRegisters: { label: t('自動レジ', 'Self-checkouts'), format: (v) => t(`${v}台`, `${v}`) },
  batchChance: { label: t('まとめ会計の確率', 'Batch checkout chance'), format: pct },
  rug: { label: t('高級絨毯', 'Luxury rug'), format: (v) => (v > 0 ? `Lv${v}` : t('なし', 'None')) },
  potionStand: { label: t('ポーション配布台', 'Potion stand'), format: (v) => (v > 0 ? t('あり', 'Yes') : t('なし', 'None')) },
  barChance: { label: t('ポーションバーに寄る確率', 'Potion bar chance'), format: pct },
  barPrice: { label: t('ポーション1杯の値段（買い物の）', 'Potion price (of purchase)'), format: pct },
  trialChance: { label: t('試し斬りする確率', 'Test-cutting chance'), format: pct },
  trialFee: { label: t('試し斬り料（買い物の）', 'Test-cutting fee (of purchase)'), format: pct },
  showcaseSlots: { label: t('ショーケース', 'Showcase'), format: (v) => t(`${v}枠`, `${v} slots`) },
  showcaseMult: { label: t('ショーケースの価格', 'Showcase price'), format: times },
  cleanerSpeed: { label: t('清掃係の足の速さ', 'Cleaner speed'), format: (v) => `${Math.round(v)}` },
  mudChance: { label: t('雨の日に泥が持ち込まれる確率', 'Mud chance on rainy days'), format: pct },
  coinValue: { label: t('落ちたコインの価値（買い物の）', 'Dropped coin value (of purchase)'), format: pct },
  storePestBounty: { label: t('店のエネミー退治の報酬', 'Shop enemy reward'), format: times },
  cryptid: { label: t('クリプタイドの守護', "Cryptid's guard"), format: (v) => (v > 0 ? t('あり', 'Yes') : t('なし', 'None')) },
  cryptidInterval: { label: t('クリプタイドの雷の間隔', 'Cryptid lightning interval'), format: secs },
  chestInterval: { label: t('宝箱が飛んでくる間隔', 'Treasure chest interval'), format: times },
  chestMult: { label: t('宝箱の中身', 'Chest contents'), format: times },
  vehicle: { label: t('乗り物', 'Vehicle'), format: (v) => [t('なし', 'None'), t('乗合馬車', 'Stagecoach'), t('飛空艇', 'Airship'), t('ランドゲート', 'Land gate')][v] ?? t('なし', 'None') },
  vehicleSize: { label: t('乗り物で来る客（追加）', 'Extra customers per vehicle'), format: (v) => t(`+${v}人`, `+${v}`) },
  vehicleInterval: { label: t('乗り物が来る間隔', 'Vehicle interval'), format: times },
  collectorChance: { label: t('コレクター客の確率', 'Collector chance'), format: pct },
  collectorPay: { label: t('コレクター客の支払い', 'Collector payment'), format: times },
  ownerChance: { label: t('ランドオーナーが来る確率', 'Land owner chance'), format: pct },
  ownerPay: { label: t('ランドオーナーの支払い', 'Land owner payment'), format: times },
  merchantRate: { label: t('商人の買取価格', "Merchant's offer"), format: pct },
  reformChance: { label: t('泥棒が改心を申し出る確率', 'Thief reform chance'), format: pct },
  regularPay: { label: t('常連客の支払い', 'Regulars\' payment'), format: times },
  blessingPower: { label: t('MAI のお手伝いの時間', "MAI's help duration"), format: times },
  legendChance: { label: t('伝説のヒーローが来る確率（1日）', 'Legendary hero chance (per day)'), format: pct },
  fogThieves: { label: t('霧の日の泥棒の多さ', 'Thieves on foggy days'), format: times },
  festivalCrowd: { label: t('市場の日の客足', 'Market-day crowds'), format: times },
  affinityPower: { label: t('顔なじみ・常連の支払いボーナス', 'Familiar-face/regular payment bonus'), format: times },
  orderSlots: { label: t('同時に受けられる注文', 'Orders at a time'), format: (v) => t(`${v}件`, `${v}`) },
  orderPay: { label: t('注文の品の値段', 'Ordered item price'), format: times },
  orderFocus: { label: t('注文のシリーズのクラフトされやすさ', 'Ordered series craft weight'), format: (v) => `+${v * 100}%` },
  ...Object.fromEntries(FACTION_KEYS.map((f) => [`fav_${f}`, { label: t(`${FACTION_NAME[f]}のヒーローの支払い`, `${FACTION_NAME[f]} hero payment`), format: (v: number) => `+${Math.round(v * 100)}%` }])),
  ...Object.fromEntries(
    STAFF_ROLES.map((r) => [`staff_${r}`, { label: ROLES[r].job, format: (v: number) => (v > 0 ? staffHero(r, v).name : t('なし', 'None')) }]),
  ),
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
  for (const i of newSeries) changes.push({ label: t('クラフトできるシリーズ', 'Craftable series'), from: t(`${before.seriesUnlocked.length}種`, `${before.seriesUnlocked.length}`), to: t(`${after.seriesUnlocked.length}種（+${series[i].name}）`, `${after.seriesUnlocked.length} (+${series[i].name})`) });
  return changes;
}
