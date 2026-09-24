import { DOOR, FLOOR_Y, HERO_PX, SCENE_H, SHOP_LANE_Y, STAFF_POSTS, walkScale } from '../layout';
import { STAFF_ROLES, staffHero, type StaffRole } from '../staff';
import { itemEdition, itemExt, itemValue } from '../items';
import { salePrice } from '../stats';
import type { Shop } from './index';
import type { StaffMember } from './types';

/** Seconds the peddler waits at the post between trips. */
const PEDDLER_REST = 2;
const CATCH_RANGE = 40;

/** Steps a staff member toward a point. Returns true on arrival. */
function walk(m: StaffMember, x: number, y: number, speed: number, dt: number): boolean {
  const dx = x - m.x;
  const dy = y - m.y;
  const d = Math.hypot(dx, dy);
  if (d < 2) {
    m.x = x;
    m.y = y;
    return true;
  }
  const step = Math.min(d, speed * dt);
  m.x += (dx / d) * step;
  m.y += (dy / d) * step;
  if (Math.abs(dx) > 1) m.facing = dx < 0 ? -1 : 1;
  m.bob += dt * 10;
  return false;
}

/** The shop's hired staff: who is on duty, and what the moving ones do each frame. */
export class Staff {
  readonly members: StaffMember[] = [];
  /** Research points not yet whole. */
  private research = 0;
  private promoterTimer = 0;

  constructor(private readonly shop: Shop) {
    for (const role of STAFF_ROLES) {
      const lv = shop.stats[`staff_${role}`];
      if (lv <= 0) continue;
      const post = STAFF_POSTS[role];
      this.members.push({
        role,
        hero: staffHero(role, lv),
        ace: lv >= 2,
        x: post.x,
        y: post.y,
        homeX: post.x,
        homeY: post.y,
        facing: post.x > 500 ? -1 : 1,
        bob: 0,
        pulse: 0,
        state: 'idle',
        away: false,
        timer: 0,
        bag: [],
      });
    }
    shop.on((e) => {
      if (e.type === 'sale') this.cheer('accountant');
      else if (e.type === 'craft' && e.item >= 100000) this.cheer('appraiser');
    });
  }

  get(role: StaffRole): StaffMember | undefined {
    return this.members.find((m) => m.role === role);
  }

  /** A short reaction (hop / glow) when a staff member's work pays off. */
  cheer(role: StaffRole): void {
    const m = this.get(role);
    if (m) m.pulse = 1;
  }

  update(dt: number): void {
    const shop = this.shop;
    for (const m of this.members) {
      m.pulse = Math.max(0, m.pulse - dt * 2.5);
      m.timer += dt;
      switch (m.role) {
        case 'stocker':
          if (shop.stock.restocked) m.pulse = 1;
          break;
        case 'promoter':
          this.promoterTimer += dt;
          if (this.promoterTimer > 5) {
            this.promoterTimer = 0;
            m.pulse = 1;
          }
          break;
        case 'guard':
          this.updateGuard(m, dt);
          break;
        case 'exterminator':
          this.updateExterminator(m, dt);
          break;
        case 'researcher':
          this.updateResearcher(m, dt);
          break;
        case 'peddler':
          this.updatePeddler(m, dt);
          break;
        case 'cleaner':
          this.updateCleaner(m, dt);
          break;
        default:
          break;
      }
    }
  }

  /** Chases the nearest thief that is still loose; catches it on contact. */
  private updateGuard(m: StaffMember, dt: number): void {
    const shop = this.shop;
    let target = null;
    let best = Infinity;
    for (const a of shop.actors) {
      if (a.kind !== 'thief' || a.state === 'caught' || a.gone) continue;
      const d = Math.hypot(a.x - m.x, a.y - m.y);
      if (d < best) {
        best = d;
        target = a;
      }
    }
    const speed = shop.stats.guardSpeed * walkScale();
    if (!target) {
      walk(m, m.homeX, m.homeY, speed * 0.6, dt);
      return;
    }
    // The guard stays on the floor; thieves on a rope are caught once they land.
    walk(m, target.x, Math.min(SCENE_H - 20, Math.max(FLOOR_Y + 20, target.y)), speed, dt);
    if (Math.hypot(target.x - m.x, target.y - m.y) < CATCH_RANGE) {
      m.pulse = 1;
      shop.thieves.catch(target, true, m.hero.name);
    }
  }

  /** Runs after pests in the workshop and shoos them away. */
  private updateExterminator(m: StaffMember, dt: number): void {
    const shop = this.shop;
    let target = null;
    let best = Infinity;
    for (const p of shop.pests.list) {
      const d = Math.hypot(p.x - m.x, p.y - m.y);
      if (d < best) {
        best = d;
        target = p;
      }
    }
    if (!target) {
      walk(m, m.homeX, m.homeY, shop.stats.hunterSpeed * 0.5, dt);
      return;
    }
    walk(m, target.x, target.y, shop.stats.hunterSpeed, dt);
    if (Math.hypot(target.x - m.x, target.y - m.y) < CATCH_RANGE) {
      m.pulse = 1;
      shop.pests.click(target);
    }
  }

  /** Mops up the nearest mud or litter and picks up dropped coins. */
  private updateCleaner(m: StaffMember, dt: number): void {
    const { hazards, stats } = this.shop;
    const targets = [...hazards.messes, ...hazards.coins];
    let target = null;
    let best = Infinity;
    for (const t of targets) {
      const d = Math.hypot(t.x - m.x, t.y - m.y);
      if (d < best) {
        best = d;
        target = t;
      }
    }
    const speed = stats.cleanerSpeed * walkScale();
    if (!target) {
      walk(m, m.homeX, m.homeY, speed * 0.6, dt);
      return;
    }
    if (walk(m, target.x, target.y, speed, dt) || best < 12) {
      m.pulse = 1;
      if ('value' in target) hazards.pickUp(target);
      else hazards.clean(target, true);
    }
  }

  private updateResearcher(m: StaffMember, dt: number): void {
    const shop = this.shop;
    this.research += (shop.stats.researchRate / 60) * dt;
    while (this.research >= 1) {
      this.research -= 1;
      shop.save.resources.research++;
      shop.report.research++;
      m.pulse = 1;
      shop.popups.push({ text: '+1 研究pt', x: m.x - 30, y: m.y - HERO_PX - 20, t: 0, color: '#c9a8ff' });
      shop.emit({ type: 'research', points: 1 });
    }
  }

  /** Takes the cheapest stock out of the door, comes back later with the takings. */
  private updatePeddler(m: StaffMember, dt: number): void {
    const shop = this.shop;
    const { stats } = shop;
    const speed = shop.stats.walkSpeed * walkScale() * 1.1;
    switch (m.state) {
      case 'idle':
        if (m.timer < PEDDLER_REST || !shop.stock.hasSurplus()) break;
        for (let i = 0; i < stats.peddlerLoad; i++) {
          const code = shop.stock.takeCheapest();
          if (code === null) break;
          m.bag.push(code);
        }
        m.state = 'walk';
        break;
      case 'walk':
        if (m.y > SHOP_LANE_Y + 1 && m.x < DOOR.x - 1) walk(m, m.x, SHOP_LANE_Y, speed, dt);
        else if (walk(m, DOOR.x, DOOR.y, speed, dt)) {
          m.state = 'away';
          m.away = true;
          m.timer = 0;
        }
        break;
      case 'away':
        if (m.timer >= stats.peddlerTrip) {
          m.state = 'return';
          m.away = false;
        }
        break;
      case 'return':
        if (walk(m, m.homeX, m.homeY, speed, dt)) {
          this.payPeddler(m);
          m.state = 'idle';
          m.timer = 0;
        }
        break;
    }
  }

  /** Fame for donating one item: (1 + rarity)² × (edition + 1). */
  static fameOf(code: number): number {
    return (1 + itemExt(code).rarityIndex) ** 2 * (itemEdition(code) + 1);
  }

  /** The charity clerk gives away the cheapest items in storage for fame (→ Cp on the next move). */
  private donate(m: StaffMember): void {
    const shop = this.shop;
    const stock = shop.stock.storage;
    const n = Math.min(stock.length, Math.round(shop.stats.charityLoad));
    if (n <= 0) return;
    const order = stock.map((code, i) => ({ code, i })).sort((a, b) => itemValue(a.code) - itemValue(b.code)).slice(0, n);
    const gone = new Set(order.map((o) => o.i));
    shop.stock.storage = stock.filter((_, i) => !gone.has(i));
    const fame = Math.round(order.reduce((s, o) => s + Staff.fameOf(o.code), 0) * shop.stats.fameMult);
    shop.save.prestige.fame += fame;
    shop.report.fame += fame;
    shop.report.donated += n;
    m.pulse = 1;
    shop.popups.push({ text: `名声 +${fame}`, x: m.x, y: m.y - HERO_PX - 30, t: 0, color: '#7fe3ff' });
    shop.emit({ type: 'donate', items: n, fame });
  }

  private payPeddler(m: StaffMember): void {
    if (m.bag.length === 0) return;
    const shop = this.shop;
    const total = m.bag.reduce((sum, code) => sum + salePrice(code, shop.stats, shop.save.collection.length, 1, false), 0);
    m.bag = [];
    m.pulse = 1;
    shop.addExtra('peddler', Math.max(1, Math.round(total * shop.stats.peddlerRate)), m.x, m.y - HERO_PX - 30);
  }

  /** At closing: the peddler's takings come in, and the accountant adds the closing bonus. */
  closeDay(): void {
    const shop = this.shop;
    const charity = this.get('charity');
    if (charity) this.donate(charity);
    const peddler = this.get('peddler');
    if (peddler) this.payPeddler(peddler);
    const accountant = this.get('accountant');
    const bonus = Math.round(shop.report.revenue * shop.stats.closingBonus);
    if (accountant && bonus > 0) {
      accountant.pulse = 1;
      shop.addExtra('bonus', bonus, accountant.x, accountant.y - HERO_PX - 30);
    }
  }
}
