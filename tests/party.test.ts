import { describe, expect, it } from 'vitest';
import { seeded } from '../src/game/balance/autoplay';
import { series } from '../src/game/catalog';
import { activeParty, memberTuning, PARTY_ROSTER, partySynergies, scoutId, skillCooldown, skillValue, suggestParty, TEACHER } from '../src/game/party';
import { buy } from '../src/game/purchase';
import { newSave, parseSave } from '../src/game/save';
import { Shop, type ShopEvent } from '../src/game/shop';
import { isAvailable, isVisible, skillById, unlockConditions } from '../src/game/skills';
import { computeStats } from '../src/game/stats';

const NOBUNAGA = 5001;
const GALILEO = 5027;

describe('hero party: scouting', () => {
  it('every series from Strawberry on is taught by exactly one hero, and none before it', () => {
    const first = series.findIndex((s) => s.key === 'Strawberry');
    series.forEach((_, i) => expect(TEACHER.has(i)).toBe(i >= first));
    expect(new Set(PARTY_ROSTER.map((d) => d.id)).size).toBe(PARTY_ROSTER.length);
  });

  it('taught recipes cannot be bought; scouting the hero teaches them', () => {
    const save = newSave(0);
    save.levels = { ...save.levels, storeHub: 1, 'recipe_Steering Wheel': 1, tavern: 1, heroHall: 1, epic: 1, legendary: 1, legendHall: 1 };
    const lion = skillById.get('recipe_Lion')!;
    expect(lion.grantedBy).toBe(scoutId(NOBUNAGA));
    expect(isAvailable(lion, save.levels)).toBe(false);
    expect(isVisible(lion, save.levels)).toBe(true);
    expect(unlockConditions(lion, save.levels)[0].text).toContain(skillById.get(scoutId(NOBUNAGA))!.name);
    save.gum = 1e12;
    expect(buy(save, lion)).toBe(false);
    expect(buy(save, skillById.get(scoutId(NOBUNAGA))!)).toBe(true);
    for (const key of ['Lion', 'Hamburger', 'Panjandrum']) expect(save.levels[`recipe_${key}`]).toBe(1);
    expect(computeStats(save.levels).seriesUnlocked).toContain(series.findIndex((s) => s.key === 'Lion'));
  });

  it('the tavern gives one party slot and 4 more can be bought', () => {
    expect(computeStats({ tavern: 1 }).partySlots).toBe(1);
    expect(computeStats({ tavern: 1, partySlot: 4 }).partySlots).toBe(5);
  });

  it('old saves: the party keeps only known heroes, and scouted heroes teach their recipes', () => {
    const save = newSave(0);
    const raw = JSON.parse(JSON.stringify(save));
    raw.party = [NOBUNAGA, 999999, NOBUNAGA];
    raw.levels[scoutId(NOBUNAGA)] = 2;
    const loaded = parseSave(JSON.stringify(raw));
    expect(loaded.party).toEqual([NOBUNAGA]);
    expect(loaded.levels.recipe_Lion).toBe(1);
    delete raw.party;
    expect(parseSave(JSON.stringify(raw)).party).toEqual([]);
  });
});

describe('hero party: support effects', () => {
  it('scouted heroes help the shop without being in the party, more with levels', () => {
    const base = computeStats({ lab: 1 });
    // 坂本龍馬 (集客): customer rate; ガリレオ (研究): research; both add to the sale price.
    const one = computeStats({ lab: 1, [scoutId(5008)]: 1, [scoutId(GALILEO)]: 1 });
    const five = computeStats({ lab: 1, [scoutId(5008)]: 5, [scoutId(GALILEO)]: 5 });
    expect(one.spawnInterval).toBeLessThan(base.spawnInterval);
    expect(five.spawnInterval).toBeLessThan(one.spawnInterval);
    expect(five.researchRate).toBeGreaterThan(one.researchRate);
    expect(one.priceMult).toBeGreaterThan(base.priceMult);
    // Every kind of hero does something of their own.
    for (const d of PARTY_ROSTER) {
      const stats = computeStats({ lab: 1, [scoutId(d.id)]: 3 }) as unknown as Record<string, unknown>;
      const changed = Object.keys(stats).filter((k) => k !== 'priceMult' && JSON.stringify(stats[k]) !== JSON.stringify((base as unknown as Record<string, unknown>)[k]));
      if (d.kind !== 'sales') expect(changed.length, d.kind).toBeGreaterThan(0);
    }
  });
});

describe('hero party: formation', () => {
  it('only scouted heroes take the floor, up to the slots', () => {
    const levels = { [scoutId(NOBUNAGA)]: 1, [scoutId(GALILEO)]: 1 };
    expect(activeParty([GALILEO, 2049, NOBUNAGA], levels, 5)).toEqual([GALILEO, NOBUNAGA]);
    expect(activeParty([GALILEO, NOBUNAGA], levels, 1)).toEqual([GALILEO]);
    expect(suggestParty(levels, 1)).toEqual([NOBUNAGA]);
  });

  it('shared attributes charge faster; three of a faction are stronger', () => {
    // 織田信長 and 坂本龍馬 share 銃火器; 武田信玄 makes three of 青龍.
    const party = [NOBUNAGA, 5008, 4025];
    const kinds = partySynergies(party).map((s) => s.kind);
    expect(kinds).toContain('attribute');
    expect(kinds).toContain('faction');
    const tuned = memberTuning(NOBUNAGA, 1, party);
    expect(tuned.cooldown).toBeLessThan(skillCooldown(1));
    expect(tuned.boost).toBeGreaterThan(1);
    expect(memberTuning(GALILEO, 1, [GALILEO]).boost).toBe(1);
  });

  it('levels make skills stronger and faster', () => {
    expect(skillValue('sales', 5, 3).power).toBeGreaterThan(skillValue('sales', 1, 3).power);
    expect(skillValue('sales', 1, 3).power).toBeGreaterThan(skillValue('sales', 1, 1).power);
    expect(skillCooldown(5)).toBeLessThan(skillCooldown(1));
  });
});

describe('hero party: in the shop', () => {
  function shopWith(party: number[]): { shop: Shop; events: ShopEvent[] } {
    const save = newSave(0);
    save.day = 40;
    save.levels = { ...save.levels, tavern: 1, partySlot: 4 };
    for (const id of party) save.levels[scoutId(id)] = 3;
    save.party = party;
    const shop = new Shop(save, seeded(3));
    const events: ShopEvent[] = [];
    shop.on((e) => events.push(e));
    return { shop, events };
  }

  it('the party stands on the balcony and uses its skills during the day', () => {
    const { shop, events } = shopWith([NOBUNAGA, GALILEO]);
    expect(shop.party.members.map((m) => m.hero.id)).toEqual([NOBUNAGA, GALILEO]);
    const research = shop.save.resources.research;
    let boosted = false;
    while (!shop.over) {
      shop.update(1 / 30);
      if (shop.party.salesMult > 1.3) boosted = true;
    }
    const casts = events.filter((e) => e.type === 'partySkill');
    expect(casts.length).toBeGreaterThanOrEqual(2);
    expect(boosted).toBe(true);
    // ガリレオ's 研究 skill.
    expect(shop.save.resources.research).toBeGreaterThan(research);
  });

  it('a party change before opening is picked up when the doors open', () => {
    const save = newSave(0);
    save.levels = { ...save.levels, tavern: 1, [scoutId(NOBUNAGA)]: 1 };
    const shop = new Shop(save, seeded(1), { waitToOpen: true });
    expect(shop.party.members).toHaveLength(0);
    save.party = [NOBUNAGA];
    shop.start();
    expect(shop.party.members).toHaveLength(1);
  });
});
