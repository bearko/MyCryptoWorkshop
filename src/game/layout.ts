// Scene coordinates. The scene is 1000 logical px wide. The workshop illustration (1000×1000)
// is shown cropped: its top WORKSHOP_CROP px are hidden, so it fills scene y 0–980. The
// storefront is drawn below it, from y 980 down to SCENE_H. SCENE_H grows on tall (phone)
// screens so the storefront fills the screen; the workshop never changes. Storefront furniture
// is sized to the ~64px heroes.

export const SCENE_W = 1000;
export const MIN_SCENE_H = 1320;
export const MAX_SCENE_H = 1900;
export let SCENE_H = MIN_SCENE_H;
export const WORKSHOP_CROP = 20;
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
/** Where the back wall meets the floor. */
export const FLOOR_Y = TOP + 112;
export const SHOP_LANE_Y = FLOOR_Y + 70;
/** Customers queue here, in front of the counter. Lower on taller storefronts. */
export let QUEUE_LANE_Y = FLOOR_Y + 160;
/** Doorway in the back wall (customers enter and leave here). */
export const DOOR = { x: 925, y: FLOOR_Y + 4, x0: 895, x1: 955, top: FLOOR_Y - 96 };
export let COUNTER = { x0: 34, x1: 186, top: FLOOR_Y + 118, bottom: FLOOR_Y + 162 };
export let CHRIS_POS = { x: 100, y: FLOOR_Y + 128 };
/** Decorative rug between the shelves and the counter (null when there is no room). */
export let RUG: { x0: number; x1: number; y0: number; y1: number } | null = null;

/**
 * Sets the scene height (clamped to MIN/MAX_SCENE_H) and lays out the storefront floor.
 * Call before a business day starts; actors keep their coordinates for the whole day.
 */
export function setSceneHeight(h: number): void {
  SCENE_H = Math.round(Math.min(MAX_SCENE_H, Math.max(MIN_SCENE_H, h)));
  const extra = SCENE_H - MIN_SCENE_H;
  // The queue/counter moves down only part of the extra height so walks stay short.
  QUEUE_LANE_Y = FLOOR_Y + 160 + Math.round(extra * 0.4);
  COUNTER = { x0: 34, x1: 186, top: QUEUE_LANE_Y - 42, bottom: QUEUE_LANE_Y + 2 };
  CHRIS_POS = { x: 100, y: QUEUE_LANE_Y - 32 };
  // A large rug covers the lower floor on tall storefronts.
  const rugTop = SHOP_LANE_Y + 40;
  const rugBottom = SCENE_H - 50;
  RUG = extra > 120 ? { x0: 230, x1: 820, y0: rugTop, y1: rugBottom } : null;
}

/** Extra walking-speed factor so longer walks on tall storefronts take about the same time. */
export function walkScale(): number {
  return 1 + (QUEUE_LANE_Y - (FLOOR_Y + 160)) / 300;
}
/** Storefront window on the back wall, and the ceiling; both are thief routes. */
export const WINDOW = { x: 120, y: TOP + 84, x0: 60, x1: 180, top: TOP + 24 };
export const CEILING_Y = TOP + 8;

/** Heroes and enemies are drawn at about their native 64px. */
export const HERO_PX = 61;
export const PEST_PX = 72;
export const MAYCRI_POS = { x: 860, y: FLOOR_Y + 60 };

export const SHELF_UNIT_W = 88;
export const SHELF_UNIT_GAP = 40;
export const SHELF_X0 = 280;
export const SHELF_TOP = FLOOR_Y - 96;
/** Item centre y for the upper and lower shelf boards. */
export const SHELF_ROW_Y = [FLOOR_Y - 66, FLOOR_Y - 28];
export const SHELF_ITEM_PX = 32;
export const SLOTS_PER_UNIT = 4;
export const MAX_SLOTS = 12;

export function slotPos(index: number): { x: number; y: number } {
  const unit = Math.floor(index / SLOTS_PER_UNIT);
  const within = index % SLOTS_PER_UNIT;
  const row = Math.floor(within / 2);
  const col = within % 2;
  const x0 = SHELF_X0 + unit * (SHELF_UNIT_W + SHELF_UNIT_GAP);
  return { x: x0 + 24 + col * 40, y: SHELF_ROW_Y[row] };
}

export function queuePos(index: number): { x: number; y: number } {
  return { x: 212 + index * 38, y: QUEUE_LANE_Y };
}
