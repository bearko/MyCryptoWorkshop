// i18n-check: skip — developer tooling (balance report).
// Pacing targets from docs/ROADMAP.md §5, checked by `npm run balance`.
import { TREE_NODES } from '../skills';
import type { DayRow } from './autoplay';

export interface Milestone {
  label: string;
  /** Target in minutes of in-game play. */
  targetMin: number;
  /** When the milestone is reached in a simulated run. */
  reached: (row: DayRow) => boolean;
}

export const MILESTONES: Milestone[] = [
  { label: 'Uncommon 解放', targetMin: 5, reached: (r) => r.maxRarity >= 1 },
  { label: '2号機（鍛冶炉）', targetMin: 30, reached: (r) => r.lines >= 2 },
  { label: '最初のスタッフ', targetMin: 45, reached: (r) => r.staff >= 1 },
  { label: '3号機（カプセル）', targetMin: 60, reached: (r) => r.lines >= 3 },
  { label: 'Epic 解放', targetMin: 90, reached: (r) => r.maxRarity >= 3 },
  { label: 'Legendary 解放', targetMin: 210, reached: (r) => r.maxRarity >= 4 },
  { label: 'クリア（黄金のエクステンション）', targetMin: 150, reached: (r) => r.cleared },
  { label: 'スキルツリー全習得', targetMin: 420, reached: (r) => r.nodesMaxed >= TREE_NODES.length },
];

export interface MilestoneResult {
  label: string;
  targetMin: number;
  day: number | null;
  minutes: number | null;
}

export function evaluate(rows: DayRow[]): MilestoneResult[] {
  return MILESTONES.map((m) => {
    const row = rows.find(m.reached);
    return { label: m.label, targetMin: m.targetMin, day: row?.day ?? null, minutes: row ? Math.round(row.playSeconds / 6) / 10 : null };
  });
}
