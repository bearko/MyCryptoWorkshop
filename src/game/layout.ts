// Scene coordinates. The scene is 1000×1320 logical px. The workshop illustration (1000×1000)
// is shown cropped: its top WORKSHOP_CROP px are hidden, so it fills scene y 0–850. The
// storefront is drawn below it (y 850–1320).

export const SCENE_W = 1000;
export const SCENE_H = 1320;
export const WORKSHOP_CROP = 150;
export const WORKSHOP_H = 1000 - WORKSHOP_CROP;

/** Converts a y coordinate on the workshop illustration to scene space. */
const wy = (y: number) => y - WORKSHOP_CROP;

export const POT = { x: 815, y: wy(780), mouthY: wy(715), hit: { x0: 700, y0: wy(680), x1: 930, y1: wy(930) } };
/** Spots in the workshop where pests land and hop between (feet positions). */
export const PEST_SPOTS = [
  { x: 470, y: wy(690) },
  { x: 600, y: wy(650) },
  { x: 560, y: wy(730) },
  { x: 120, y: wy(690) },
  { x: 250, y: wy(650) },
  { x: 520, y: wy(860) },
  { x: 640, y: wy(830) },
  { x: 905, y: wy(650) },
  { x: 710, y: wy(640) },
  { x: 420, y: wy(310) },
  { x: 560, y: wy(330) },
  { x: 250, y: wy(320) },
  { x: 90, y: wy(890) },
  { x: 800, y: wy(760) },
];
/** Craft progress ring, on the floor to the left of the pot. */
export const CRAFT_RING = { x: 668, y: wy(690) };
export const MINE_POS = { x: 620, y: wy(930) };
export const STORAGE_POS = { x: 150, y: wy(720) };

const TOP = WORKSHOP_H;
export const FLOOR_Y = TOP + 165;
export const SHOP_LANE_Y = TOP + 360;
export const QUEUE_LANE_Y = TOP + 425;
export const DOOR_X = 1050;
export const COUNTER = { x0: 24, x1: 262, top: TOP + 262, bottom: TOP + 380 };
export const CHRIS_POS = { x: 150, y: TOP + 290 };
/** Storefront window (above the counter) and ceiling, used as thief routes. */
export const WINDOW = { x: 140, y: TOP + 120 };
export const CEILING_Y = TOP + 22;

/** Heroes and enemies are drawn at about their native 64px. */
export const HERO_PX = 61;
export const PEST_PX = 72;
export const MAYCRI_POS = { x: 900, y: TOP + 300 };

export const SHELF_UNIT_W = 156;
export const SHELF_UNIT_GAP = 26;
export const SHELF_X0 = 318;
export const SHELF_TOP = TOP + 52;
export const SHELF_ROW_Y = [TOP + 104, TOP + 188];
export const SLOTS_PER_UNIT = 4;
export const MAX_SLOTS = 12;

export function slotPos(index: number): { x: number; y: number } {
  const unit = Math.floor(index / SLOTS_PER_UNIT);
  const within = index % SLOTS_PER_UNIT;
  const row = Math.floor(within / 2);
  const col = within % 2;
  const x0 = SHELF_X0 + unit * (SHELF_UNIT_W + SHELF_UNIT_GAP);
  return { x: x0 + 42 + col * 72, y: SHELF_ROW_Y[row] };
}

export function queuePos(index: number): { x: number; y: number } {
  return { x: 292 + index * 38, y: QUEUE_LANE_Y };
}
