import type { Hero } from '../catalog';
import { PARTY_SPOTS } from '../layout';
import { activeParty, cheerValue, memberTuning, partyDef, partyHero, scoutId, skillText, skillValue, type PartyHeroDef, type SkillKind } from '../party';
import type { Shop } from './index';

/** A hero of the party on the workshop balcony. */
export interface PartyMember {
  def: PartyHeroDef;
  hero: Hero;
  level: number;
  /** Seconds for the skill to charge (level and synergies). */
  cooldown: number;
  /** Skill strength from synergies (1 = none). */
  boost: number;
  /** 0–1: the skill fires at 1. */
  charge: number;
  x: number;
  y: number;
  /** Seconds since the skill last fired (drives the speech bubble); -1 before the first. */
  castT: number;
  /** What the last skill did, for the bubble and the log. */
  lastText: string;
  /** Out shopping in person (来店): not on the balcony until they leave. */
  away: boolean;
}

/** Buffs from skills that last a while. The same kind from several heroes stacks with diminishing returns. */
interface Buff {
  kind: 'sales' | 'craft' | 'luck' | 'wait';
  value: number;
  left: number;
}

/** Charge the party starts the day with, so the first skills come early (a little less for each next member, so they take turns). */
const START_CHARGE = 0.35;
/** No skills in the last seconds of the day. */
const QUIET_END = 2;

/**
 * The party at work: each member's skill charges and fires on its own. Other systems read the
 * running buffs (salesMult, craftMult, luckMult, patienceBonus) and `calm` (no thieves or
 * enemies arrive while it lasts).
 */
export class Party {
  members: PartyMember[] = [];
  salesMult = 1;
  craftMult = 1;
  luckMult = 1;
  /** Extra seconds customers wait at the shelf and the register. */
  patienceBonus = 0;
  /** Seconds left in which no thief or enemy comes in. */
  calm = 0;
  private buffs: Buff[] = [];

  constructor(private readonly shop: Shop) {
    this.build();
  }

  /** Lines the party up from the save (again at opening, after changes on the day's card). */
  build(): void {
    const { save, stats } = this.shop;
    const ids = activeParty(save.party, save.levels, stats.partySlots);
    this.members = ids.map((id, i) => {
      const def = partyDef(id)!;
      const level = save.levels[scoutId(id)] ?? 1;
      const spot = PARTY_SPOTS[i % PARTY_SPOTS.length];
      return { def, hero: partyHero(id), level, ...memberTuning(id, level, ids), charge: START_CHARGE - 0.08 * i, x: spot.x, y: spot.y, castT: -1, lastText: '', away: false };
    });
  }

  update(dt: number): void {
    const shop = this.shop;
    for (const b of this.buffs) b.left -= dt;
    this.buffs = this.buffs.filter((b) => b.left > 0);
    // The strongest buff of a kind counts in full, the next half, the next a quarter…
    const stacked = (kind: Buff['kind']) =>
      this.buffs
        .filter((b) => b.kind === kind)
        .map((b) => b.value)
        .sort((a, b) => b - a)
        .reduce((sum, v, i) => sum + v * Math.pow(0.5, i), 0);
    this.salesMult = 1 + stacked('sales');
    this.craftMult = 1 + stacked('craft');
    this.luckMult = 1 + stacked('luck');
    this.patienceBonus = stacked('wait');
    this.calm = Math.max(0, this.calm - dt);
    for (const m of this.members) {
      if (m.castT >= 0) m.castT += dt;
      if (m.away && !shop.actors.some((a) => a.special === 'vip' && a.hero.id === m.hero.id)) m.away = false;
      if (shop.timeLeft < QUIET_END || m.away) continue;
      m.charge += dt / m.cooldown;
      if (m.charge >= 1) {
        m.charge = 0;
        this.cast(m);
      }
    }
  }

  /** Fires a member's skill. */
  cast(m: PartyMember): void {
    const shop = this.shop;
    const kind: SkillKind = m.def.kind;
    const v = skillValue(kind, m.level, m.def.tier, m.boost);
    let text = skillText(kind, v, m.hero.name);
    switch (kind) {
      case 'sales':
      case 'craft':
      case 'luck':
        this.buffs.push({ kind, value: v.power, left: v.seconds });
        break;
      case 'wait':
        for (const a of shop.actors) if (a.kind === 'customer' && (a.state === 'waitShelf' || a.state === 'queue')) a.timer = 0;
        this.buffs.push({ kind: 'wait', value: v.power, left: v.seconds });
        break;
      case 'crowd':
        shop.visitors.bringGuests(v.count);
        break;
      case 'rush': {
        const n = shop.register.rush(v.count);
        if (n === 0) text = skillText(kind, { ...v, count: 0 }, m.hero.name);
        break;
      }
      case 'vip':
        if (shop.customers.spawnVip(m.hero, v.power)) m.away = true;
        break;
      case 'wish':
        shop.production.craftWanted(v.count);
        break;
      case 'restock':
        shop.production.fillShelf();
        shop.production.craftExtra(v.count);
        break;
      case 'study':
        shop.save.resources.research += v.count;
        shop.report.research += v.count;
        break;
      case 'sweep':
        shop.thieves.catchAll(m.hero.name);
        shop.hazards.sweep();
        shop.pests.clearAll();
        this.calm = Math.max(this.calm, v.seconds);
        break;
    }
    if (kind !== 'sales') {
      const cheer = cheerValue(m.level, m.def.tier, m.boost);
      this.buffs.push({ kind: 'sales', value: cheer.power, left: cheer.seconds });
    }
    m.castT = 0;
    m.lastText = text;
    shop.fx.push({ kind: 'hit', x: m.x, y: m.y - 40, t: 0 });
    shop.emit({ type: 'partySkill', hero: m.hero, kind, skill: m.hero.passive ?? '', text });
  }
}
