// 経営モードの入口（docs/EMPIRE_DESIGN.md 1 章）：1 周のクリアがゲーム内 14 日未満になったら、マインちゃんが現れる。
// 本店（工房）の売上の一部が、営業日を終えるたびに会社の資金へ流れこむ（一方向）。
import type { EmpireState } from './model';
import type { Prestige } from '../game/prestige';

/** この営業日（Day 表示）より前に黄金のエクステンションを作れたら、経営モードが開く */
export const UNLOCK_CLEAR_DAY = 14;

/**
 * 経営モードを開けるか。clearDay はクリアした時点の Day。記録する前の周回は、
 * 移転までの営業日数（クリアの日より後ろにしかならない）が 14 日未満なら認める。
 */
export function empireUnlocked(p: Prestige): boolean {
  if (p.clearDay !== null && p.clearDay < UNLOCK_CLEAR_DAY) return true;
  return p.history.some((r) => (r.clearDay ?? null) !== null ? r.clearDay! < UNLOCK_CLEAR_DAY : r.clearSeconds !== null && r.days < UNLOCK_CLEAR_DAY);
}

/** 経営モードを一般公開したか（v2.0.0 で true にする）。それまではテストモードだけ */
export const EMPIRE_RELEASED = false;

/**
 * 経営モードの入口を出すか。テストモードでは、マインちゃんの登場から確かめやすいように
 * 登場条件を最初から満たしている扱いにする。
 */
export function empireOpen(o: { test: boolean; hasCompany: boolean; prestige: Prestige }): boolean {
  if (!o.test && !EMPIRE_RELEASED) return false;
  return o.hasCompany || o.test || empireUnlocked(o.prestige);
}

/** 本店からの送金：営業日の売上の 1%、1 日あたりの上限はフェーズごと（仮の値） */
export const TRANSFER_RATE = 0.01;
export const TRANSFER_CAP: Record<EmpireState['phase'], number> = { 1: 300_000, 2: 3_000_000, 3: 30_000_000, 4: 300_000_000, 5: 3_000_000_000 };

export function transferFor(revenue: number, phase: EmpireState['phase']): number {
  return Math.floor(Math.min(Math.max(0, revenue) * TRANSFER_RATE, TRANSFER_CAP[phase]));
}
