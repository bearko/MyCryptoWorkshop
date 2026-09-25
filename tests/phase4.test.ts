import { describe, expect, it } from 'vitest';
import { seeded } from '../src/game/balance/autoplay';
import { lands, series } from '../src/game/catalog';
import { CONDITIONS, FIRST_EVENT_DAY, rollCondition, type DayCondition } from '../src/game/conditions';
import { migrate, newSave, parseSave, SAVE_VERSION, type SaveData } from '../src/game/save';
import { Shop, type Decision, type ShopEvent } from '../src/game/shop';
import { makeActor } from '../src/game/shop/actors';
import { DECISION_WAIT } from '../src/game/shop/decisions';
import { averageTierPay, salePrice } from '../src/game/stats';
import { fmt } from '../src/game/format';

const blade = series.find((s) => s.key === 'Blade')!;
const common = blade.items[0].id;
const rare = blade.items[2].id;
const FULL_SHELF = Array.from({ length: 12 }, () => common);

function saveWith(levels: Record<string, number>, patch: Partial<SaveData> = {}): SaveData {
  const save = newSave();
  Object.assign(save.levels, levels);
  return Object.assign(save, patch);
}

/**
 * Runs a shop for `seconds` (or until closing), answering decisions with `answer`
 * (default: their fallback), and collects its events.
 */
function run(shop: Shop, seconds: number, answer?: (d: Decision) => number): ShopEvent[] {
  const events: ShopEvent[] = [];
  shop.on((e) => events.push(e));
  for (let t = 0; t < seconds && !shop.over; t += 1 / 30) {
    const d = shop.pendingDecision;
    if (d) shop.decide(answer ? answer(d) : d.fallback);
    shop.update(1 / 30);
  }
  return events;
}

const types = (events: ShopEvent[]) => events.map((e) => e.type);

describe('save v5 and day conditions', () => {
  it('migrates a v4 save with a sunny forecast and no regulars', () => {
    const v4 = { ...newSave(), version: 4 } as Record<string, unknown>;
    delete v4.forecast;
    delete v4.regulars;
    const data = parseSave(JSON.stringify(v4));
    expect(data.version).toBe(SAVE_VERSION);
    expect(data.forecast).toEqual({ kind: 'sunny' });
    expect(data.regulars).toEqual([]);
    expect(migrate({ version: 4 }).version).toBe(SAVE_VERSION);
  });

  it('the first days are sunny; later every condition shows up, land days name a land', () => {
    const rand = seeded(1);
    for (let day = 1; day < FIRST_EVENT_DAY; day++) expect(rollCondition(day, rand).kind).toBe('sunny');
    const seen = new Set<string>();
    for (let i = 0; i < 500; i++) {
      const c = rollCondition(10, rand);
      seen.add(c.kind);
      if (c.kind === 'land') expect(lands.map((l) => l.key)).toContain(c.land);
    }
    expect([...seen].sort()).toEqual(Object.keys(CONDITIONS).sort());
  });

  it('closing the day forecasts the next one', () => {
    const save = saveWith({}, { day: 9 });
    const shop = new Shop(save, seeded(2));
    run(shop, 200);
    expect(save.day).toBe(10);
    expect(Object.keys(CONDITIONS)).toContain(save.forecast.kind);
  });
});

describe('decision events', () => {
  it('from day 4 every business day asks at least one question; before that none', () => {
    for (let seed = 1; seed <= 6; seed++) {
      const early = run(new Shop(saveWith({}, { day: FIRST_EVENT_DAY - 1, shelf: FULL_SHELF }), seeded(seed)), 200);
      expect(types(early)).not.toContain('decision');
      const later = run(new Shop(saveWith({}, { day: FIRST_EVENT_DAY, shelf: FULL_SHELF }), seeded(seed)), 200);
      expect(types(later).filter((t) => t === 'decision').length, `seed ${seed}`).toBeGreaterThanOrEqual(1);
    }
  });

  it('a visitor waits in the shop while the day goes on; opening the choice pauses it', () => {
    const shop = new Shop(saveWith({}, { day: 6, shelf: FULL_SHELF }), seeded(3));
    for (let i = 0; i < 30 * 60 && !shop.pendingDecision; i++) shop.update(1 / 30);
    const d = shop.pendingDecision!;
    expect(d).not.toBeNull();
    expect(d.viewing).toBe(false);
    // The day goes on while they wait, and they can be tapped where they stand.
    const at = shop.elapsed;
    for (let i = 0; i < 30; i++) shop.update(1 / 30);
    expect(shop.elapsed).toBeGreaterThan(at);
    expect(shop.decisionAt(d.x, d.y - 40)).toBe(true);
    expect(shop.decisionAt(d.x + 300, d.y)).toBe(false);
    // Tapped: the choice is shown and the day stops.
    expect(shop.viewDecision()).toBe(d);
    const paused = shop.elapsed;
    for (let i = 0; i < 30; i++) shop.update(1 / 30);
    expect(shop.elapsed).toBe(paused);
    // "Later": they wait again and the day resumes.
    shop.deferDecision();
    shop.update(1 / 30);
    expect(shop.elapsed).toBeGreaterThan(paused);
    shop.decide(d.fallback);
    expect(shop.pendingDecision).toBeNull();
  });

  it('left alone, the visitor takes the fallback after a while', () => {
    const shop = new Shop(saveWith({}, { day: 6, shelf: FULL_SHELF }), seeded(3));
    const events: ShopEvent[] = [];
    shop.on((e) => events.push(e));
    for (let i = 0; i < 30 * 60 && !shop.pendingDecision; i++) shop.update(1 / 30);
    const d = shop.pendingDecision!;
    for (let i = 0; i < 30 * (DECISION_WAIT + 1) && shop.pendingDecision; i++) shop.update(1 / 30);
    expect(shop.pendingDecision).toBeNull();
    expect(events.find((e) => e.type === 'decided')).toMatchObject({ kind: d.kind, choice: d.fallback });
  });

  it('selling to the shady merchant empties shelf and storage for cash', () => {
    for (let seed = 1; seed < 40; seed++) {
      const save = saveWith({ conveyor: 1 }, { day: 6, shelf: FULL_SHELF, storage: [common, common] });
      const shop = new Shop(save, seeded(seed));
      let sold = false;
      run(shop, 30, (d) => {
        if (d.kind !== 'merchant') return d.fallback;
        sold = true;
        return 0;
      });
      if (!sold) continue;
      expect(shop.report.extras.merchant).toBeGreaterThan(0);
      return;
    }
    throw new Error('no merchant came in 40 days');
  });

  it("the merchant's offer is its rate of what today's customers would pay, and that is what it pays", () => {
    for (let seed = 1; seed < 60; seed++) {
      // Epic customers come (they pay up to ×1.8): the offer counts that, not the Common price.
      const save = saveWith({ conveyor: 1, tier1: 1, tier2: 1, tier3: 1, negotiation: 2 }, { day: 6, shelf: Array.from({ length: 12 }, () => rare), storage: [rare, rare] });
      const shop = new Shop(save, seeded(seed));
      let expected = 0;
      run(shop, 30, (d) => {
        if (d.kind !== 'merchant') return d.fallback;
        const codes = [...shop.stock.slots.filter((s) => !s.showcase && s.item !== null && s.claimedBy === null).map((s) => s.item!), ...shop.stock.storage];
        const list = codes.reduce((n, code) => n + salePrice(code, shop.stats, save.collection.length, 0, false), 0);
        expected = Math.round(list * averageTierPay(shop.stats.maxTier) * shop.stats.merchantRate);
        expect(averageTierPay(shop.stats.maxTier)).toBeGreaterThan(1.3);
        expect(d.text).toContain(fmt(expected));
        expect(d.text).toContain(`${Math.round(shop.stats.merchantRate * 100)}%`);
        return 0;
      });
      if (!expected) continue;
      expect(shop.report.extras.merchant).toBe(expected);
      return;
    }
    throw new Error('no merchant came in 60 days');
  });

  it("MAI can fill every empty shelf slot", () => {
    for (let seed = 1; seed < 40; seed++) {
      const shop = new Shop(saveWith({ shelf: 5 }, { day: 6 }), seeded(seed));
      let filled = -1;
      shop.on((e) => {
        if (e.type === 'decided' && e.kind === 'mai') filled = shop.slots.filter((s) => s.item !== null || s.incoming).length;
      });
      run(shop, 60, (d) => (d.kind === 'mai' ? 1 : d.fallback));
      if (filled < 0) continue;
      expect(filled).toBe(shop.shelfSlots);
      return;
    }
    throw new Error('MAI never came in 40 days');
  });

  it('a forgiven thief becomes a regular instead of paying a bounty', () => {
    const save = saveWith({ reform: 4 }, { day: 8, shelf: Array.from({ length: 12 }, () => rare) });
    const shop = new Shop(save, seeded(5));
    const events: ShopEvent[] = [];
    shop.on((e) => events.push(e));
    for (let i = 0; i < 30 * 200 && !shop.over && save.regulars.length === 0; i++) {
      const d = shop.pendingDecision;
      if (d) shop.decide(d.kind === 'reform' ? 1 : d.fallback);
      shop.update(1 / 30);
      const thief = shop.actors.find((a) => a.kind === 'thief' && a.state !== 'caught' && !a.gone);
      if (thief) for (let k = 0; k < 4; k++) shop.clickThief(thief);
    }
    expect(save.regulars.length).toBe(1);
    const caught = events.find((e) => e.type === 'caught' && e.bounty === 0);
    expect(caught).toBeDefined();
  });
});

describe('hazards', () => {
  const day = (kind: DayCondition['kind'], levels: Record<string, number> = {}, patch: Partial<SaveData> = {}) =>
    new Shop(saveWith({ ad: 10, ...levels }, { day: 10, shelf: FULL_SHELF, forecast: { kind }, ...patch }), seeded(11));

  it('rain brings mud in, and the cleaner mops it up', () => {
    const muddy = run(day('rain'), 60);
    expect(types(muddy)).toContain('mess');
    const cleaned = run(day('rain', { hire_cleaner: 1 }), 60);
    expect(cleaned.some((e) => e.type === 'cleaned' && e.byStaff)).toBe(true);
  });

  it('fog makes customers drop coins that can be picked up', () => {
    const shop = day('fog', { price: 5 });
    let picked = 0;
    for (let i = 0; i < 30 * 90 && !shop.over; i++) {
      const d = shop.pendingDecision;
      if (d) shop.decide(d.fallback);
      shop.update(1 / 30);
      for (const c of [...shop.hazards.coins]) if (shop.clickHazard(c.x, c.y)) picked++;
    }
    expect(picked).toBeGreaterThan(0);
    expect(shop.report.extras.coin).toBeGreaterThan(0);
  });

  it("the cryptid strikes down enemies that get into the shop", () => {
    const events = run(day('sunny', { cryptid: 1 }), 200);
    expect(events.some((e) => e.type === 'storePestCleared' && e.by === 'cryptid')).toBe(true);
  });

  it('treasure chests can be opened with a tap and leave litter', () => {
    const shop = day('sunny', { chestHunter: 5 });
    const events: ShopEvent[] = [];
    shop.on((e) => events.push(e));
    for (let i = 0; i < 30 * 120 && !shop.over && !events.some((e) => e.type === 'chest'); i++) {
      const d = shop.pendingDecision;
      if (d) shop.decide(d.fallback);
      shop.update(1 / 30);
      const c = shop.hazards.chests.find((x) => x.x < 800);
      if (c) shop.clickHazard(c.x, c.y);
    }
    expect(types(events)).toContain('chest');
    expect(shop.hazards.messes.some((m) => m.kind === 'litter')).toBe(true);
  });
});

describe('customers and visitors', () => {
  it('vehicles bring guilds of customers', () => {
    const shop = new Shop(saveWith({ carriage: 1, dayLength: 5 }, { day: 10, shelf: FULL_SHELF }), seeded(4));
    const events = run(shop, 200);
    expect(types(events)).toContain('vehicle');
    expect(shop.report.guests).toBeGreaterThan(0);
  });

  it('collectors pay double for the series they want, and faction regulars pay more', () => {
    const shop = new Shop(saveWith({ collectors: 1, fav_suzaku: 2 }), seeded(1));
    const a = makeActor(shop, 'customer', { id: 1, name: 'x', rarity: 'Common', rarityIndex: 0, faction: '朱雀', passive: '', image: '' }, 0);
    a.special = 'collector';
    a.wants = blade.items[0].seriesIndex;
    expect(shop.customers.payMult(a, common)).toBeCloseTo(2 * 1.16);
    a.wants = (blade.items[0].seriesIndex + 1) % series.length;
    expect(shop.customers.payMult(a, common)).toBeCloseTo(1.16);
  });

  it('a land day brings a land owner and the land cryptid', () => {
    const shop = new Shop(saveWith({ dayLength: 3 }, { day: 10, shelf: FULL_SHELF, forecast: { kind: 'land', land: lands[0].key } }), seeded(6));
    const events = run(shop, 200);
    expect(events.some((e) => e.type === 'special' && e.kind === 'owner')).toBe(true);
    expect(events.some((e) => e.type === 'visit' && e.visit.kind === 'cryptid')).toBe(true);
  });
});
