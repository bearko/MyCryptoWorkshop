// Scene coordinates. The scene is 1000 logical px wide. The workshop illustration (1000×1000)
// is shown cropped: its top WORKSHOP_CROP px are hidden, so it fills scene y 0–980. The
// storefront is drawn below it, from y 980 down to SCENE_H. SCENE_H grows on tall (phone)
// screens so the storefront fills the screen; the workshop never changes. Storefront furniture
// is sized to the ~64px heroes.

export const SCENE_W = 1000;
export const MIN_SCENE_H = 1440;
/** Tallest storefront: as tall as the workshop, for the side-by-side layout on wide screens. */
export const MAX_SCENE_H = 1960;
export let SCENE_H = MIN_SCENE_H;
export const WORKSHOP_CROP = 20;
export const WORKSHOP_H = 1000 - WORKSHOP_CROP;

/** Converts a y coordinate on the workshop illustration to scene space. */
const wy = (y: number) => y - WORKSHOP_CROP;

/** The magic pot in the illustration; `hit` covers the whole pot (handles and lid bubbles too). */
export const POT = { x: 815, y: wy(780), mouthY: wy(715), hit: { x0: 680, y0: wy(660), x1: 960, y1: wy(935) } };
/**
 * Spots in the workshop where pests land and hop between (feet positions). All in the middle and
 * lower workshop: the top is left to the HUD and Mine-chan's tips, which would hide them.
 */
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
  { x: 330, y: wy(600) },
  { x: 780, y: wy(590) },
  { x: 200, y: wy(810) },
  { x: 90, y: wy(890) },
  { x: 800, y: wy(760) },
];
/** Craft progress ring, on the floor to the left of the pot. */
export const CRAFT_RING = { x: 668, y: wy(690) };

/** Where each production line sits in the workshop: its progress ring, where finished items fly from, and its tap area. */
export const STATIONS = {
  pot: { ring: CRAFT_RING, from: { x: POT.x, y: POT.mouthY }, hit: POT.hit },
  forge: { ring: { x: 300, y: wy(560) }, from: { x: 175, y: wy(600) }, hit: { x0: 40, y0: wy(520), x1: 300, y1: wy(700) } },
  capsule: { ring: { x: 640, y: wy(470) }, from: { x: 770, y: wy(520) }, hit: { x0: 680, y0: wy(370), x1: 870, y1: wy(630) } },
};
export const MINE_POS = { x: 620, y: wy(930) };
/** Where the heroes of the party stand: on the balcony, left of the HUD (feet positions). */
export const PARTY_SPOTS = [
  { x: 150, y: wy(365) },
  { x: 235, y: wy(365) },
  { x: 320, y: wy(365) },
  { x: 405, y: wy(365) },
  { x: 490, y: wy(365) },
];
/** The fireplace doubles as the 分解炉 (dismantler). */
export const DISMANTLER = { x: 62, y: wy(590) };
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
/** Rug on the lower floor, below the queue (null when there is no room). */
export let RUG: { x0: number; x1: number; y0: number; y1: number } | null = null;

type Point = { x: number; y: number };

/** Where each staff role stands (feet position). Mobile staff return here between jobs. */
export let STAFF_POSTS: Record<string, Point> = {};
/** Potion bar under the counter: the bar top, and where a customer stands to drink. */
export let POTION_BAR = { x0: 16, x1: 196, y: 0, spot: { x: 110, y: 0 } };
/** 試し斬り場 (trial area) in the lower right: the straw dummy and where the customer stands. */
export let TRIAL = { dummy: { x: 920, y: 0 }, spot: { x: 850, y: 0 } };
/** Free potion stand against the back wall, next to the door. */
export const POTION_STAND = { x: 836, y: FLOOR_Y - 2 };
/** Showcase unit on the back wall, between the shelves and the potion stand. */
export const SHOWCASE = { x0: 676, x1: 776, top: FLOOR_Y - 104 };
export const MAX_SHOWCASE = 4;

/** Item centre of showcase slot `i` (2 × 2, filled top row first). */
export function showcasePos(i: number): Point {
  return { x: SHOWCASE.x0 + 28 + (i % 2) * 44, y: SHELF_ROW_Y[Math.floor(i / 2)] };
}

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
  // Lower floor, below the queue: bar (left), rug with desks (middle), trial area (right).
  const bottom = SCENE_H - 28;
  const rugTop = QUEUE_LANE_Y + 36;
  const rugBottom = bottom - 58;
  RUG = rugBottom - rugTop > 36 ? { x0: 236, x1: 660, y0: rugTop, y1: rugBottom } : null;
  POTION_BAR = { x0: 16, x1: 196, y: bottom - 44, spot: { x: 118, y: bottom - 6 } };
  TRIAL = { dummy: { x: 930, y: bottom - 16 }, spot: { x: 868, y: bottom - 10 } };
  STAFF_POSTS = {
    stocker: { x: 236, y: FLOOR_Y + 34 },
    cleaner: { x: 150, y: FLOOR_Y + 48 },
    charity: { x: 56, y: FLOOR_Y + 50 },
    consultant: { x: 726, y: FLOOR_Y + 40 },
    host: { x: 872, y: SHOP_LANE_Y + 34 },
    promoter: { x: 966, y: FLOOR_Y + 46 },
    guard: { x: 228, y: SHOP_LANE_Y + 46 },
    peddler: { x: 760, y: QUEUE_LANE_Y + 64 },
    accountant: { x: 300, y: bottom },
    researcher: { x: 420, y: bottom },
    appraiser: { x: 540, y: bottom },
    // In the workshop
    exterminator: { x: 470, y: wy(700) },
    delivery: { x: 268, y: wy(760) },
  };
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
/** Slots on the back wall's shelves (3 units). */
export const WALL_SLOTS = 12;
/** 陳列台: display tables in front of the shop lane (4 units), filled after the wall shelves. */
export const TABLE_UNITS = 4;
export const MAX_SLOTS = WALL_SLOTS + TABLE_UNITS * SLOTS_PER_UNIT;
/** Top of the display tables, just below the shop lane (customers browse them from the lane). */
export const TABLE_TOP = SHOP_LANE_Y + 38;
/** Item centre y for the back and front rows standing on a table top. */
export const TABLE_ROW_Y = [TABLE_TOP - 8, TABLE_TOP + 6];
export const TABLE_H = 50;

export function slotPos(index: number): { x: number; y: number } {
  const table = index >= WALL_SLOTS;
  const i = table ? index - WALL_SLOTS : index;
  const unit = Math.floor(i / SLOTS_PER_UNIT);
  const within = i % SLOTS_PER_UNIT;
  const row = Math.floor(within / 2);
  const col = within % 2;
  const x0 = SHELF_X0 + unit * (SHELF_UNIT_W + SHELF_UNIT_GAP);
  return { x: x0 + 24 + col * 40, y: (table ? TABLE_ROW_Y : SHELF_ROW_Y)[row] };
}

export function queuePos(index: number): { x: number; y: number } {
  return { x: 212 + index * 38, y: QUEUE_LANE_Y };
}

// Default layout until the game measures the screen (also used by tests and the balance sim).
setSceneHeight(MIN_SCENE_H);
