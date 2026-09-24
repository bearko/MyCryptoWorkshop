import { pirates } from '../catalog';
import { HERO_PX, WINDOW } from '../layout';
import { thiefStyle } from '../thieves';
import type { Shop } from './index';
import type { Actor, RaidResult } from './types';

/** Seconds of warning before the pirates come in, and between two pirates. */
export const RAID_WARNING = 4;
const RAID_INTERVAL = 0.7;
/** Day from which raids can come (from the second run on). */
export const RAID_FIRST_DAY = 8;

/** Pirates in a raid on `day`. */
export const raidSize = (day: number) => Math.min(12, 5 + Math.floor(day / 15));

/**
 * レイド: from the second run on, the 黒髭海賊団 sometimes storms the shop — a warning, then a
 * wave of tough pirates (2 taps each) that go for the best items. Every pirate caught pays
 * a bounty (× 海賊討伐の報奨); catching them all also pays emblems.
 */
export class Raid {
  private at = -1;
  private phase: 'none' | 'warn' | 'active' | 'done' = 'none';
  private timer = 0;
  private toSpawn = 0;
  private pirates = 0;
  private readonly raiders: Actor[] = [];

  constructor(private readonly shop: Shop) {
    const { save, stats } = shop;
    if (save.prestige.runs < 1 || save.day < RAID_FIRST_DAY) return;
    if (shop.rand.next() >= stats.raidChance) return;
    this.at = stats.dayLength * shop.rand.range(0.3, 0.5);
    this.pirates = raidSize(save.day);
  }

  /** Brings a raid in right now (debug shortcut). */
  startNow(): void {
    if (this.phase !== 'none') return;
    this.at = this.shop.elapsed;
    this.pirates = raidSize(this.shop.save.day);
  }

  /** A raid is coming today (known from the start of the day). */
  get scheduled(): boolean {
    return this.at >= 0;
  }

  /** Warning or pirates in the shop: the scene plays the raid BGM and banner. */
  get active(): boolean {
    return this.phase === 'warn' || this.phase === 'active';
  }

  /** Seconds until the pirates burst in (during the warning). */
  get countdown(): number {
    return this.phase === 'warn' ? Math.max(0, RAID_WARNING - this.timer) : 0;
  }

  /** Pirates still to deal with. */
  get left(): number {
    return this.toSpawn + this.raiders.filter((a) => !a.gone && a.state !== 'caught').length;
  }

  update(dt: number): void {
    const shop = this.shop;
    if (this.phase === 'none') {
      if (this.at < 0 || shop.elapsed < this.at) return;
      this.phase = 'warn';
      this.timer = 0;
      shop.emit({ type: 'raidWarn', pirates: this.pirates });
      return;
    }
    this.timer += dt;
    if (this.phase === 'warn') {
      if (this.timer < RAID_WARNING) return;
      this.phase = 'active';
      this.timer = RAID_INTERVAL;
      this.toSpawn = this.pirates;
      shop.emit({ type: 'raidStart', pirates: this.pirates });
    }
    if (this.phase !== 'active') return;
    // MAI chased the thieves off: the rest of the crew turns back.
    if (shop.thieves.suppressed) this.toSpawn = 0;
    if (this.toSpawn > 0 && this.timer >= RAID_INTERVAL) {
      this.timer = 0;
      this.toSpawn--;
      const hero = pirates[(this.pirates - this.toSpawn - 1) % pirates.length];
      const base = thiefStyle(hero.id);
      const a = shop.thieves.spawn(hero, { ...base, entry: this.toSpawn % 2 ? 'window' : base.entry, hp: Math.max(2, base.hp), trait: '黒髭海賊団' });
      a.raider = true;
      this.raiders.push(a);
    }
    if (this.toSpawn === 0 && this.raiders.every((a) => a.gone || a.state === 'caught')) this.finish();
  }

  /** Settles the raid (also at closing, when pirates are still in the shop). */
  finish(): void {
    if (!this.active) return;
    const shop = this.shop;
    this.phase = 'done';
    const pirates = this.raiders.length;
    // Closed before the crew came in: no raid after all.
    if (pirates === 0) return;
    const caught = this.raiders.filter((a) => a.state === 'caught').length;
    const won = caught === pirates;
    const reward = Math.round(shop.thieves.bounty() * 3 * caught * shop.stats.raidReward);
    const emblems = won ? 2 : caught * 2 >= pirates ? 1 : 0;
    if (reward > 0) shop.addExtra('raid', reward, WINDOW.x + 80, WINDOW.y + HERO_PX);
    shop.save.resources.emblem += emblems;
    const result: RaidResult = { pirates, caught, won, reward, emblems };
    shop.report.raid = result;
    shop.emit({ type: 'raidEnd', result });
  }
}
