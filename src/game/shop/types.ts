import type { Hero } from '../catalog';
import type { GemId, LineId } from '../lines';
import type { Order } from '../orders';
import type { StaffRole } from '../staff';
import type { ThiefStyle } from '../thieves';

export type Rng = () => number;

export interface Slot {
  item: number | null;
  /** Item centre on the shelf or in the showcase. */
  x: number;
  y: number;
  /** Showcase slot: only valuable items, sold at a premium. */
  showcase: boolean;
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
  | 'toBar'
  | 'drink'
  | 'toTrial'
  | 'trial'
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
  /** Price multiplier for the item in hand (showcase items sell at a premium). */
  priceBonus: number;
  /** Special customers: collectors want one series, land owners buy the best, regulars are reformed thieves, guilds come by vehicle. */
  special?: 'collector' | 'owner' | 'regular' | 'guild' | 'order';
  /** The order an ordering customer came for. */
  order?: Order;
  /** Series index a collector is looking for. */
  wants?: number;
  /** Seconds before this customer can be bothered by mud again. */
  mudCooldown: number;
  /** Waypoints to walk through before the current target. */
  path: { x: number; y: number }[];
  style?: ThiefStyle;
  /** One of the pirates of a raid. */
  raider?: boolean;
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
  /** 'away' = shipped out of the shop (market sales). */
  dest: { kind: 'slot'; index: number } | { kind: 'storage' } | { kind: 'dismantle' } | { kind: 'away' };
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

/** Revenue that does not come from the register. */
export type ExtraSource = 'bar' | 'trial' | 'market' | 'peddler' | 'bonus' | 'chest' | 'coin' | 'merchant' | 'raid';

/** Mud (rainy days) or litter (from opened chests) on the shop floor. */
export interface Mess {
  id: number;
  x: number;
  y: number;
  kind: 'mud' | 'litter';
  t: number;
}

/** A coin a customer dropped in the fog; tap (or the cleaner) picks it up. */
export interface Coin {
  id: number;
  x: number;
  y: number;
  value: number;
  t: number;
}

/** An enemy wandering the shop floor, scaring customers. */
export interface StorePest {
  id: number;
  name: string;
  image: string;
  x: number;
  y: number;
  tx: number;
  ty: number;
  hp: number;
  hitFlash: number;
  t: number;
}

/** A treasure chest drifting across the shop on a balloon. */
export interface Chest {
  id: number;
  x: number;
  y: number;
  vx: number;
  t: number;
}

/** A helper or VIP visiting for a while (cryptid, legendary hero). */
export interface Visit {
  kind: 'cryptid' | 'legend';
  name: string;
  image: string;
  /** The hero's passive skill, shown in the cut-in. */
  skill: string;
  x: number;
  y: number;
  t: number;
  dur: number;
}

/** A choice the player has to make; the shop pauses until it is answered. */
export interface Decision {
  kind: 'merchant' | 'reform' | 'mai';
  title: string;
  text: string;
  image: string;
  options: { label: string; detail: string }[];
  /** Chosen automatically if the player does not answer in time (and by idle play). */
  fallback: number;
}

/** A staff member at work in the shop or the workshop. */
export interface StaffMember {
  role: StaffRole;
  hero: Hero;
  ace: boolean;
  x: number;
  y: number;
  homeX: number;
  homeY: number;
  facing: 1 | -1;
  bob: number;
  /** Brief highlight when the staff member does something (0–1). */
  pulse: number;
  /** idle: at the post · walk: heading somewhere · away: out of the shop · return: heading back. */
  state: 'idle' | 'walk' | 'away' | 'return';
  /** Out of the shop (the peddler on a trip). */
  away: boolean;
  timer: number;
  /** Items the peddler is carrying. */
  bag: number[];
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
  /** Gold dust and 魔石 from the dismantler. */
  dust: number;
  gems: Partial<Record<GemId, number>>;
  /** Research points earned. */
  research: number;
  extras: Record<ExtraSource, number>;
  /** Customers who arrived by vehicle. */
  guests: number;
  /** Decisions made today (kind → option index). */
  decisions: { kind: Decision['kind']; choice: number }[];
  /** Heroes who bought something for the first time today. */
  newHeroes: number[];
  /** Hero sets completed today (names). */
  sets: string[];
  /** Orders filled today. */
  ordersDone: number;
  /** Rare-or-better items sold, and chests opened (for daily requests). */
  rareSold: number;
  chests: number;
  /** Achievements earned and emblems from requests at closing. */
  achievements: string[];
  dailyEmblems: number;
  /** Fame from the charity clerk's donations (items donated). */
  fame: number;
  donated: number;
  /** The pirate raid today, if one came. */
  raid: RaidResult | null;
}

export interface RaidResult {
  pirates: number;
  caught: number;
  /** All pirates caught without losing an item. */
  won: boolean;
  reward: number;
  emblems: number;
}

export type ShopEvent =
  | { type: 'raidWarn'; pirates: number }
  | { type: 'raidStart'; pirates: number }
  | { type: 'raidEnd'; result: RaidResult }
  | { type: 'donate'; items: number; fame: number }
  | { type: 'craft'; item: number; isNew: boolean; line: LineId }
  | { type: 'overheat'; line: LineId }
  | { type: 'dismantle'; item: number; dust: number; gem: GemId | null }
  | { type: 'sale'; price: number; item: number; hero: Hero; tip: boolean }
  | { type: 'lost'; hero: Hero; reason: 'empty' | 'queue' | 'mess' | 'scared' }
  | { type: 'thief'; hero: Hero; style: ThiefStyle }
  | { type: 'thiefHit'; hero: Hero; hpLeft: number }
  | { type: 'stolen'; hero: Hero; item: number }
  | { type: 'caught'; hero: Hero; bounty: number; byGuard: boolean; guard?: string }
  | { type: 'pest'; name: string }
  | { type: 'pestCleared'; reward: number }
  | { type: 'mine' }
  | { type: 'extra'; source: ExtraSource; amount: number }
  | { type: 'batch' }
  | { type: 'research'; points: number }
  | { type: 'mess'; kind: Mess['kind'] }
  | { type: 'cleaned'; byStaff: boolean }
  | { type: 'chest'; reward: 'gum' | 'dust' | 'gem'; amount: number }
  | { type: 'storePest'; name: string }
  | { type: 'storePestCleared'; reward: number; by: 'tap' | 'cryptid' }
  | { type: 'vehicle'; kind: number; count: number }
  | { type: 'special'; kind: NonNullable<Actor['special']>; hero: Hero }
  | { type: 'visit'; visit: Visit }
  | { type: 'decision'; decision: Decision }
  | { type: 'decided'; kind: Decision['kind']; choice: number; result: string }
  | { type: 'orderDone'; hero: Hero; item: number; price: number }
  | { type: 'dayEnd'; report: DayReport };
