import { lands } from './catalog';
import { t } from '../i18n';

/**
 * Each business day has a condition, forecast the evening before so the player can prepare
 * (a cleaner for rain, a guard for fog, …).
 */
export type ConditionKind = 'sunny' | 'rain' | 'fog' | 'festival' | 'land';

export interface DayCondition {
  kind: ConditionKind;
  /** Land key for a land day (see catalog lands). */
  land?: string;
}

export const CONDITIONS: Record<ConditionKind, { name: string; icon: string; desc: string }> = {
  sunny: { name: t('晴れ', 'Sunny'), icon: '☀️', desc: t('いつも通りの営業日', 'An ordinary business day') },
  rain: { name: t('雨', 'Rain'), icon: '☔', desc: t('客が泥を持ち込み、踏んだ客が怒って帰ることがある。客足は少し鈍る', 'Customers track in mud; anyone who steps in it may leave angry. Slightly fewer customers') },
  fog: { name: t('ロンドンの霧', 'London Fog'), icon: '🌫️', desc: t('客がコインを落としやすい。客のふりをした泥棒が増える', 'Customers drop coins more often. More thieves pose as customers') },
  festival: { name: t('市場の日', 'Market Day'), icon: '🎪', desc: t('客が多く、乗り物で来る団体も増える', 'More customers, and more groups arrive by vehicle') },
  land: { name: t('ランドの日', 'Land Day'), icon: '🏰', desc: t('ランドのクリプタイドとランドオーナーが訪れる', 'A land\'s cryptid and land owner come to visit') },
};

/** Relative odds of each condition from day 4 on (the first days are always sunny). */
const ODDS: [ConditionKind, number][] = [
  ['sunny', 40],
  ['rain', 20],
  ['fog', 15],
  ['festival', 15],
  ['land', 10],
];

export const FIRST_EVENT_DAY = 4;

/** Rolls the condition of `day`. */
export function rollCondition(day: number, rand: () => number): DayCondition {
  if (day < FIRST_EVENT_DAY) return { kind: 'sunny' };
  const total = ODDS.reduce((n, [, w]) => n + w, 0);
  let r = rand() * total;
  for (const [kind, w] of ODDS) {
    r -= w;
    if (r < 0) return kind === 'land' ? { kind, land: lands[Math.floor(rand() * lands.length)].key } : { kind };
  }
  return { kind: 'sunny' };
}

export function landOf(c: DayCondition) {
  return c.land ? lands.find((l) => l.key === c.land) : undefined;
}

/** Display name, e.g. "ランドの日（Ocean）". */
export function conditionLabel(c: DayCondition): string {
  const land = landOf(c);
  return `${CONDITIONS[c.kind].icon} ${CONDITIONS[c.kind].name}${land ? t(`（${land.name}）`, ` (${land.name})`) : ''}`;
}
