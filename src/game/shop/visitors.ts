import { customersByTier } from '../catalog';
import { landOf } from '../conditions';
import { DOOR, FLOOR_Y } from '../layout';
import type { Shop } from './index';
import type { Order } from '../orders';
import type { Visit } from './types';
import { t } from '../../i18n';

/** Vehicles that bring a guild of customers at once. Index = stats.vehicle. */
export const VEHICLES = [
  null,
  { name: t('乗合馬車', 'Stagecoach'), size: 4, interval: 40 },
  { name: t('飛空艇', 'Airship'), size: 7, interval: 55 },
  { name: t('ランドゲート', 'Land Gate'), size: 10, interval: 70 },
];

const GUEST_GAP = 0.35;
const VISIT_TIME = 15;

/**
 * Who comes by besides ordinary customers: guilds by vehicle, a land's cryptid on its land
 * day, and now and then a legendary hero whose presence doubles sales for a while.
 */
export class Visitors {
  visits: Visit[] = [];
  /** Sale price multiplier while a legendary hero (or MAI's blessing) is around. */
  salesMult = 1;
  private boostLeft = 0;
  /** Last vehicle arrival, for the banner over the door. */
  arrival: { kind: number; t: number } | null = null;
  private vehicleTimer = 0;
  private guestsLeft = 0;
  private guestTimer = 0;
  private cryptidAt = -1;
  private legendAt = -1;
  /** When each of today's orders comes in (seconds into the day). */
  private orderTimes: { at: number; order: Order }[];

  constructor(private readonly shop: Shop) {
    const { rand, stats, condition } = shop;
    const day = stats.dayLength;
    if (condition.kind === 'land') this.cryptidAt = day * rand.range(0.3, 0.6);
    const legend = stats.legendChance + (condition.kind === 'festival' ? 0.25 : 0);
    if (rand.next() < legend) this.legendAt = day * rand.range(0.35, 0.7);
    this.orderTimes = shop.save.orders.map((order) => ({ at: day * rand.range(0.15, 0.55), order }));
  }

  /** Series someone ordered for today (crafting leans toward them). */
  get orderedSeries(): number[] {
    return this.shop.save.orders.map((o) => o.series);
  }

  /** Doubles (or multiplies) sales for `seconds`. */
  boost(mult: number, seconds: number): void {
    this.salesMult = Math.max(this.salesMult, mult);
    this.boostLeft = Math.max(this.boostLeft, seconds);
  }

  get boostTime(): number {
    return this.boostLeft;
  }

  update(dt: number): void {
    const shop = this.shop;
    const { stats } = shop;
    this.boostLeft = Math.max(0, this.boostLeft - dt);
    if (this.boostLeft <= 0) this.salesMult = 1;
    if (this.arrival) this.arrival.t += dt;
    for (const v of this.visits) v.t += dt;
    this.visits = this.visits.filter((v) => v.t < v.dur);

    // Vehicles (none in the last seconds of the day)
    const vehicle = VEHICLES[stats.vehicle];
    if (vehicle && shop.timeLeft > 8) {
      this.vehicleTimer += dt;
      const interval = vehicle.interval * stats.vehicleInterval * (shop.condition.kind === 'festival' ? 0.6 : 1);
      if (this.vehicleTimer >= interval) {
        this.vehicleTimer = 0;
        const count = vehicle.size + stats.vehicleSize;
        this.guestsLeft += count;
        this.arrival = { kind: stats.vehicle, t: 0 };
        shop.emit({ type: 'vehicle', kind: stats.vehicle, count });
      }
    }
    if (this.guestsLeft > 0) {
      this.guestTimer += dt;
      if (this.guestTimer >= GUEST_GAP) {
        this.guestTimer = 0;
        if (shop.customers.spawnGuest()) this.guestsLeft--;
        else this.guestsLeft = 0;
      }
    }

    // Heroes coming in for their orders
    for (const t of this.orderTimes) {
      if (t.at >= 0 && shop.elapsed >= t.at) {
        t.at = -1;
        if (shop.save.orders.includes(t.order)) shop.customers.spawnOrder(t.order);
      }
    }

    // The land's cryptid visits on its land day and clears the floor.
    if (this.cryptidAt >= 0 && shop.elapsed >= this.cryptidAt) {
      this.cryptidAt = -1;
      const land = landOf(shop.condition);
      if (land) this.arrive({ kind: 'cryptid', name: t(`${land.name}のクリプタイド`, `${land.name} Cryptid`), image: land.cryptid, skill: t('ランドの守護', 'Land Guardian'), x: DOOR.x - 120, y: FLOOR_Y + 40, t: 0, dur: VISIT_TIME });
      shop.hazards.sweep();
    }
    // A legendary hero drops in: sales ×2 while they are here.
    if (this.legendAt >= 0 && shop.elapsed >= this.legendAt) {
      this.legendAt = -1;
      const hero = shop.rand.pick(customersByTier[4]);
      this.arrive({ kind: 'legend', name: hero.name, image: hero.image, skill: hero.passive ?? '', x: DOOR.x - 60, y: FLOOR_Y + 70, t: 0, dur: VISIT_TIME });
      this.boost(2, VISIT_TIME);
    }
  }

  private arrive(v: Visit): void {
    this.visits.push(v);
    this.shop.emit({ type: 'visit', visit: v });
  }
}
