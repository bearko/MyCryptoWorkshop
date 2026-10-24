// 生成するドット絵の共通パレット（docs/pixel-rules.md「色」）。昼の町。
// 地図の UI 側の色（自社の青緑・ライバルの赤など）は design/keieimode/tokens.json に合わせてある。
import { key, ramp } from './core.mjs';

export const OUTLINE = [24, 24, 24, 255];
export const SKIN = [232, 196, 160, 255];

export const PAL = {
  grass: ramp(92, 0.32, 0.7),
  road: ramp(38, 0.22, 0.86, { warm: true, dv: 0.08 }),
  plaza: ramp(40, 0.14, 0.88, { warm: true, dv: 0.07 }),
  wall: ramp(40, 0.12, 0.95, { warm: true, dv: 0.1 }),
  roofA: ramp(14, 0.55, 0.78, { warm: true }),
  roofB: ramp(212, 0.38, 0.62),
  roofC: ramp(30, 0.4, 0.7, { warm: true }),
  ours: ramp(172, 0.66, 0.7),
  rival: ramp(356, 0.62, 0.8, { warm: true }),
  neutral: ramp(24, 0.13, 0.6, { warm: true }),
  leaf: ramp(110, 0.48, 0.58),
  trunk: ramp(24, 0.5, 0.5, { warm: true }),
  water: ramp(200, 0.4, 0.75),
  sand: ramp(46, 0.3, 0.9, { warm: true, dv: 0.07 }),
  glass: ramp(200, 0.25, 0.82),
  field: ramp(52, 0.45, 0.78, { warm: true }),
  lantern: ramp(40, 0.72, 0.95, { warm: true, dv: 0.12 }),
};

/** パレットのすべての色（検査に使う） */
export const PALETTE = new Set([OUTLINE, SKIN, ...Object.values(PAL).flat()].map(key));

/** 区画の縁の色（持ち主）。地図の描画（src/render/map）と同じ値 */
export const OWNER_EDGE = { ours: PAL.ours[1], rival: PAL.rival[1], neutral: PAL.neutral[1] };
