// Pacing targets from docs/ROADMAP.md §5, checked by `npm run balance`.
import { SKILLS } from '../skills';
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
  { label: 'Epic 解放', targetMin: 90, reached: (r) => r.maxRarity >= 3 },
  { label: 'Legendary 解放', targetMin: 210, reached: (r) => r.maxRarity >= 4 },
  { label: 'スキルツリー全習得', targetMin: 420, reached: (r) => r.nodesMaxed >= SKILLS.length },
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
