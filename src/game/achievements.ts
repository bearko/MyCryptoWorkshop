import { customers, series } from './catalog';
import { fmt } from './format';
import { HERO_SETS } from './heroes';
import type { SaveData } from './save';
import type { DayReport } from './shop/types';
import { STAFF_ROLES } from './staff';
import type { Stats } from './stats';
import { t } from '../i18n';

/**
 * Achievements (実績) and daily requests (デイリー依頼). Both pay out エンブレム, spent in the
 * 名誉 branch of the skill tree; achievements are checked at closing time.
 */
export interface Achievement {
  id: string;
  name: string;
  desc: string;
  /** Current value and target, for the progress bar. */
  progress: (save: SaveData) => [number, number];
  emblem: number;
}

const tiers = (id: string, name: string, unit: string, values: number[], value: (s: SaveData) => number, emblem = (i: number) => i + 1): Achievement[] =>
  values.map((target, i) => ({
    id: `${id}${i + 1}`,
    name: `${name} ${['I', 'II', 'III', 'IV', 'V', 'VI'][i]}`,
    desc: `${unit.replace('{n}', fmt(target))}`,
    progress: (s) => [value(s), target],
    emblem: emblem(i),
  }));

const totalItems = series.reduce((n, s) => n + s.items.length + (s.shin ? 1 : 0), 0);
const staffCount = (s: SaveData) => STAFF_ROLES.filter((r) => (s.levels[`hire_${r}`] ?? 0) > 0).length;
const aceCount = (s: SaveData) => STAFF_ROLES.filter((r) => (s.levels[`ace_${r}`] ?? 0) > 0).length;
const metCount = (s: SaveData) => customers.filter((c) => (s.heroes[c.id] ?? 0) > 0).length;
const setCount = (s: SaveData) => HERO_SETS.filter((x) => (s.levels[x.id] ?? 0) > 0).length;
const bestEdition = (s: SaveData) => Math.max(0, ...Object.values(s.bestEdition));
const hasShin = (s: SaveData) => (series.some((x) => x.shin && s.collection.includes(x.shin.id)) ? 1 : 0);

export const ACHIEVEMENTS: Achievement[] = [
  ...tiers('revenue', t('大商人', 'Merchant Prince'), t('累計売上 {n} GUM', 'Total sales of {n} GUM'), [1e4, 1e6, 1e8, 1e10, 1e12], (s) => s.totals.revenue, (i) => 2 * (i + 1)),
  ...tiers('best', t('繁盛店', 'Thriving Shop'), t('1日の売上 {n} GUM', '{n} GUM in one day'), [1e4, 1e6, 1e8, 1e10], (s) => s.bestDayRevenue, (i) => 2 * (i + 1)),
  ...tiers('sold', t('売り子', 'Salesperson'), t('{n} 個販売', 'Sell {n} items'), [100, 1000, 10000, 100000], (s) => s.totals.sold),
  ...tiers('collection', t('収集家', 'Collector'), t('図鑑 {n} 種', '{n} collection entries'), [50, 150, 300, 600, totalItems], (s) => s.collection.length, (i) => 2 * (i + 1)),
  ...tiers('heroes', t('顔が広い', 'Well Connected'), t('ヒーロー {n} 人が購入', '{n} heroes have bought something'), [25, 75, 150, customers.length], (s) => metCount(s), (i) => 2 * (i + 1)),
  ...tiers('sets', t('コンプリート', 'Completionist'), t('コンプリート {n} 件', 'Complete {n} hero sets'), [5, 20, HERO_SETS.length], (s) => setCount(s), (i) => 3 * (i + 1)),
  ...tiers('caught', t('捕り物名人', 'Thief Catcher'), t('泥棒を {n} 人捕まえる', 'Catch {n} thieves'), [10, 100, 500], (s) => s.totals.caught),
  ...tiers('pests', t('エネミー退治', 'Enemy Hunter'), t('エネミーを {n} 体退治', 'Chase off {n} enemies'), [20, 200, 1000], (s) => s.totals.pests),
  ...tiers('orders', t('御用達', 'Purveyor'), t('注文を {n} 件届ける', 'Deliver {n} orders'), [5, 50, 200], (s) => s.totals.orders, (i) => 2 * (i + 1)),
  ...tiers('chests', t('宝探し', 'Treasure Hunter'), t('宝箱を {n} 個開ける', 'Open {n} treasure chests'), [5, 50, 300], (s) => s.totals.chests),
  ...tiers('days', t('老舗', 'Old Establishment'), t('{n} 日営業', 'Stay open {n} days'), [10, 50, 100, 200], (s) => s.day - 1),
  ...tiers('staff', t('人材', 'Talent'), t('スタッフ {n} 人を雇う', 'Hire {n} staff'), [1, 6, STAFF_ROLES.length], (s) => staffCount(s)),
  ...tiers('aces', t('ヒーロー雇用', 'Hero Hires'), t('ヒーローを {n} 人雇う', 'Hire {n} heroes'), [1, 5, STAFF_ROLES.length], (s) => aceCount(s), (i) => 2 * (i + 1)),
  { id: 'golden', name: t('黄金の輝き', 'Golden Glow'), desc: t('「黄金」エディションを作る', 'Make a "Golden" edition'), progress: (s) => [bestEdition(s) >= 4 ? 1 : 0, 1], emblem: 5 },
  { id: 'shin', name: t('真打ち', 'The Real Deal'), desc: t('「真」の Legendary を作る', 'Make a Shin Legendary'), progress: (s) => [hasShin(s), 1], emblem: 5 },
];

/** Awards achievements newly reached. Returns them. */
export function checkAchievements(save: SaveData): Achievement[] {
  const done: Achievement[] = [];
  for (const a of ACHIEVEMENTS) {
    if (save.achievements.includes(a.id)) continue;
    const [v, target] = a.progress(save);
    if (v >= target) {
      save.achievements.push(a.id);
      save.resources.emblem += a.emblem;
      done.push(a);
    }
  }
  return done;
}

// ---------------------------------------------------------------- daily requests

export type DailyKind = 'sold' | 'rareSold' | 'caught' | 'pests' | 'revenue' | 'chests' | 'orders' | 'guests';

export interface Daily {
  kind: DailyKind;
  target: number;
  done: boolean;
}

const DAILY_TEXT: Record<DailyKind, string> = {
  sold: t('{n} 個売る', 'Sell {n} items'),
  rareSold: t('Rare 以上を {n} 個売る', 'Sell {n} Rare+ items'),
  caught: t('泥棒を {n} 人捕まえる', 'Catch {n} thieves'),
  pests: t('エネミーを {n} 体退治する', 'Chase off {n} enemies'),
  revenue: t('1日で {n} GUM 売り上げる', 'Earn {n} GUM in a day'),
  chests: t('宝箱を {n} 個開ける', 'Open {n} treasure chests'),
  orders: t('注文を {n} 件届ける', 'Deliver {n} orders'),
  guests: t('乗り物で {n} 人迎える', 'Welcome {n} customers by vehicle'),
};

export const dailyLabel = (d: Daily) => DAILY_TEXT[d.kind].replace('{n}', fmt(d.target));

/** How far today's report got on a request. */
export function dailyValue(kind: DailyKind, r: DayReport): number {
  switch (kind) {
    case 'sold':
      return r.sold;
    case 'rareSold':
      return r.rareSold;
    case 'caught':
      return r.caught;
    case 'pests':
      return r.pests;
    case 'revenue':
      return r.revenue;
    case 'chests':
      return r.chests;
    case 'orders':
      return r.ordersDone;
    case 'guests':
      return r.guests;
  }
}

/** Daily requests start on this day. */
export const DAILY_DAY = 3;
/** Emblems for finishing all of a day's requests (on top of one per request). */
export const DAILY_BONUS = 1;

/** Three requests for the next day, scaled to how the shop has been doing. */
export function rollDailies(save: SaveData, stats: Stats, report: DayReport, rand: () => number): Daily[] {
  if (save.day < DAILY_DAY) return [];
  const pool: Daily[] = [
    { kind: 'sold', target: Math.max(10, Math.round(report.sold * 1.1)), done: false },
    { kind: 'revenue', target: Math.max(100, Math.round(save.bestDayRevenue * 0.9)), done: false },
    { kind: 'caught', target: 2 + Math.floor(save.day / 30), done: false },
  ];
  if (stats.maxRarity >= 2) pool.push({ kind: 'rareSold', target: Math.max(3, Math.round(report.rareSold * 1.1)), done: false });
  if (save.day >= 5) pool.push({ kind: 'chests', target: 1 + Math.floor(rand() * 2), done: false });
  if (save.day >= 6) pool.push({ kind: 'pests', target: 2 + Math.floor(save.day / 40), done: false });
  if (stats.orderSlots > 0) pool.push({ kind: 'orders', target: 1, done: false });
  if (stats.vehicle > 0) pool.push({ kind: 'guests', target: Math.max(4, Math.round(report.guests * 0.9)), done: false });
  const picks: Daily[] = [];
  while (picks.length < 3 && pool.length) picks.push(pool.splice(Math.floor(rand() * pool.length), 1)[0]);
  return picks;
}

/** Marks requests met by today's report and pays their emblems. Returns the emblems earned. */
export function settleDailies(save: SaveData, report: DayReport): number {
  let emblems = 0;
  for (const d of save.dailies) {
    if (d.done || dailyValue(d.kind, report) < d.target) continue;
    d.done = true;
    emblems++;
  }
  if (save.dailies.length && save.dailies.every((d) => d.done)) emblems += DAILY_BONUS;
  save.resources.emblem += emblems;
  return emblems;
}
