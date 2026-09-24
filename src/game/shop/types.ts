import type { Hero } from '../catalog';
import type { ThiefStyle } from '../thieves';

export type Rng = () => number;

export interface Slot {
  item: number | null;
  /** An item is flying toward this slot. */
  incoming: boolean;
  /** Entity id of the customer or thief that is heading for this item. */
  claimedBy: number | null;
}

export type ActorState =
  | 'enter'
  | 'toShelf'
  | 'browse'
  | 'waitShelf'
  | 'toQueue'
  | 'queue'
  | 'leave'
  | 'steal'
  | 'flee'
  | 'caught';

export type Mood = 'none' | 'happy' | 'angry' | 'thinking';

export interface Actor {
  id: number;
  kind: 'customer' | 'thief';
  hero: Hero;
  tier: number;
  x: number;
  y: number;
  tx: number;
  ty: number;
  speed: number;
  state: ActorState;
  timer: number;
  slot: number;
  item: number | null;
  mood: Mood;
  facing: 1 | -1;
  bob: number;
  paid?: number;
  /** Waypoints to walk through before the current target. */
  path: { x: number; y: number }[];
  style?: ThiefStyle;
  /** Taps left before a thief is caught. */
  hp: number;
  hitFlash: number;
  /** Hanging from a rope (ceiling route). */
  rope: boolean;
  /** Removed at the end of this frame. */
  gone: boolean;
}

export interface Flyer {
  item: number;
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  t: number;
  dur: number;
  dest: { kind: 'slot'; index: number } | { kind: 'storage' };
}

export interface Popup {
  text: string;
  x: number;
  y: number;
  t: number;
  color: string;
  icon?: 'gum';
}

export interface Pest {
  id: number;
  name: string;
  image: string;
  /** Feet position; pests hop from spot to spot around the workshop. */
  x: number;
  y: number;
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  hopT: number;
  hopDur: number;
  wait: number;
  life: number;
  t: number;
}

/** Short-lived visual effect (smoke puff, hit burst). */
export interface Fx {
  kind: 'smoke' | 'hit';
  x: number;
  y: number;
  t: number;
}

export interface DayReport {
  day: number;
  revenue: number;
  sold: number;
  customers: number;
  lost: number;
  stolen: number;
  caught: number;
  pests: number;
  crafted: number;
  newEntries: number[];
  bestSale: { price: number; item: number; hero: string } | null;
}

export type ShopEvent =
  | { type: 'craft'; item: number; isNew: boolean }
  | { type: 'sale'; price: number; item: number; hero: Hero; tip: boolean }
  | { type: 'lost'; hero: Hero; reason: 'empty' | 'queue' }
  | { type: 'thief'; hero: Hero; style: ThiefStyle }
  | { type: 'thiefHit'; hero: Hero; hpLeft: number }
  | { type: 'stolen'; hero: Hero; item: number }
  | { type: 'caught'; hero: Hero; bounty: number; byGuard: boolean }
  | { type: 'pest'; name: string }
  | { type: 'pestCleared'; reward: number }
  | { type: 'mine' }
  | { type: 'dayEnd'; report: DayReport };
