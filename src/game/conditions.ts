import { lands } from './catalog';

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
  sunny: { name: '晴れ', icon: '☀️', desc: 'いつも通りの営業日' },
  rain: { name: '雨', icon: '☔', desc: '客が泥を持ち込み、踏んだ客が怒って帰ることがある。客足は少し鈍る' },
  fog: { name: 'ロンドンの霧', icon: '🌫️', desc: '客がコインを落としやすい。客のふりをした泥棒が増える' },
  festival: { name: '市場の日', icon: '🎪', desc: '客が多く、乗り物で来る団体も増える' },
  land: { name: 'ランドの日', icon: '🏰', desc: 'ランドのクリプタイドとランドオーナーが訪れる' },
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
  return `${CONDITIONS[c.kind].icon} ${CONDITIONS[c.kind].name}${land ? `（${land.name}）` : ''}`;
}
