import { series } from '../catalog';
import { EDITION_BASE_CHANCE, itemId, makeItem, type ItemCode } from '../items';
import { STATIONS } from '../layout';
import { LINE_IDS, LINES, type GemId, type LineId } from '../lines';
import { lineStats, rarityWeights, type LineStats } from '../stats';
import type { Shop } from './index';

/** 魔石 consumed per line per day when infused. */
export const GEM_COST = 2;
/** Seconds a line is jammed after overheating. */
export const JAM_SECONDS = 3;

/** One production line (magic pot, forge or capsule). */
export class Line {
  stats: LineStats;
  /** 魔石 infused for today, if any. */
  gem: GemId | null;
  progress = 0;
  /** Finished but nowhere to put it. */
  blocked = false;
  /** No unlocked recipe this line can make. */
  idle = false;
  pulse = 0;
  helperPulse = 0;
  /** 0–1; overheats at 1 while held. */
  heat = 0;
  holding = false;
  /** Seconds left of an overheat jam. */
  jam = 0;
  private helperTimer = 0;

  constructor(
    private readonly shop: Shop,
    readonly id: LineId,
    gem: GemId | null,
  ) {
    this.gem = gem;
    this.stats = this.computeStats();
  }

  /** Line stats from the shop's stats and today's 魔石. */
  computeStats(): Line['stats'] {
    const base = lineStats(this.shop.stats, this.id);
    const power = this.shop.stats.infusionPower;
    const gem = this.gem;
    return {
      ...base,
      craftTime: gem === 'ifrit' ? base.craftTime / (1 + 0.3 * power) : base.craftTime,
      doubleChance: gem === 'leviathan' ? base.doubleChance + 0.15 * power : base.doubleChance,
      luck: gem === 'tiamat' ? base.luck * (1 + 0.5 * power) : base.luck,
      editionLuck: gem === 'garuda' ? base.editionLuck * (1 + power) : base.editionLuck,
    };
  }

  get station() {
    return STATIONS[this.id];
  }

  /** Series indexes this line can craft right now. */
  recipes(): number[] {
    const families = LINES[this.id].families;
    return this.shop.stats.seriesUnlocked.filter((i) => families.includes(series[i].family));
  }

  update(dt: number, pestSlow: number): void {
    const shop = this.shop;
    const s = this.stats;
    this.pulse = Math.max(0, this.pulse - dt * 4);
    this.helperPulse = Math.max(0, this.helperPulse - dt * 3);
    this.idle = this.recipes().length === 0;
    if (this.idle) return;

    if (s.helperInterval > 0) {
      this.helperTimer += dt;
      if (this.helperTimer >= s.helperInterval) {
        this.helperTimer -= s.helperInterval;
        this.progress += s.craftClick;
        this.helperPulse = 1;
        shop.emit({ type: 'mine' });
      }
    }

    let rate = pestSlow;
    if (this.jam > 0) {
      this.jam = Math.max(0, this.jam - dt);
      rate = 0;
      this.heat = Math.max(0, this.heat - s.coolRate * dt);
    } else if (this.holding) {
      // Overclock: faster while held, but heat builds up.
      rate *= s.overclock;
      this.heat += s.heatRate * dt;
      if (this.heat >= 1) this.overheat();
    } else {
      this.heat = Math.max(0, this.heat - s.coolRate * dt);
    }

    this.progress += (dt / s.craftTime) * rate * shop.party.craftMult;
    this.blocked = false;
    while (this.progress >= 1) {
      // 特注受付: a waiting collector's (or order's) item first, straight into their hands.
      if (shop.stats.bespoke > 0 && this.craftBespoke()) {
        this.progress -= 1;
        continue;
      }
      if (!shop.stock.makeRoom()) {
        this.progress = 1;
        this.blocked = true;
        return;
      }
      this.progress -= 1;
      const count = shop.rand.next() < s.doubleChance ? 2 : 1;
      for (let i = 0; i < count && (i === 0 || shop.stock.makeRoom()); i++) this.craftOne();
    }
  }

  private overheat(): void {
    this.progress = 0;
    this.jam = JAM_SECONDS;
    this.heat = 0.6;
    this.holding = false;
    this.shop.fx.push({ kind: 'smoke', x: this.station.ring.x, y: this.station.ring.y, t: 0 });
    this.shop.emit({ type: 'overheat', line: this.id });
  }

  click(): void {
    if (this.jam > 0 || this.idle) return;
    this.progress += this.stats.craftClick;
    this.pulse = 1;
  }

  /** Rolls the next item; `want` fixes the series (and a lowest rarity), for a hero's お目当て skill. */
  private rollItem(want?: { series: number; minRarity: number }): ItemCode {
    const { stats, rand } = this.shop;
    // Party skills: 目利き, and half as much while an inventor's 生産 skill runs.
    const party = this.shop.party;
    const boost = party.luckMult * (1 + (party.craftMult - 1) * 0.5);
    const rolled = rand.weighted(rarityWeights(stats.maxRarity, stats.luck * this.stats.luck * boost));
    const rarity = want ? Math.min(stats.maxRarity, Math.max(want.minRarity, rolled)) : rolled;
    const recipes = this.recipes();
    // 量産 skills, today's orders and (コレクター優先) collectors in the shop make some series come up more often.
    const ordered = this.shop.visitors.orderedSeries;
    const collected = stats.collectorFocus > 0 ? this.shop.collectorSeries() : [];
    const index = want
      ? want.series
      : recipes[rand.weighted(recipes.map((i) => stats.seriesWeight[i] + (ordered.includes(i) ? stats.orderFocus : 0) + (collected.includes(i) ? stats.collectorFocus : 0)))];
    const s = series[index];
    let id = s.items[rarity].id;
    const shin = stats.shinChance + stats.seriesShin[index];
    if (rarity === 4 && s.shin && shin > 0 && rand.next() < shin) id = s.shin.id;
    let edition = 0;
    const luck = stats.editionLuck * this.stats.editionLuck * stats.seriesEdition[index] * boost;
    for (let ed = Math.min(stats.editionTier, EDITION_BASE_CHANCE.length - 1); ed >= 1; ed--) {
      if (rand.next() < EDITION_BASE_CHANCE[ed] * luck) {
        edition = ed;
        break;
      }
    }
    return makeItem(id, edition);
  }

  /** 特注受付: crafts the item a waiting collector or ordering customer is after, if this line can. */
  private craftBespoke(): boolean {
    const shop = this.shop;
    const recipes = this.recipes();
    const a = shop.actors.find(
      (c) =>
        c.kind === 'customer' &&
        c.state === 'waitShelf' &&
        c.item === null &&
        ((c.special === 'collector' && c.wants !== undefined && recipes.includes(c.wants)) || (c.special === 'order' && !!c.order && recipes.includes(c.order.series))),
    );
    if (!a) return false;
    const want = a.special === 'order' ? { series: a.order!.series, minRarity: a.order!.minRarity } : { series: a.wants!, minRarity: 0 };
    const code = this.makeItem(want);
    shop.customers.handOver(a, code);
    shop.fx.push({ kind: 'hit', x: a.x, y: a.y - 40, t: 0 });
    shop.emit({ type: 'bespoke', hero: a.hero, item: code });
    return true;
  }

  /** Crafts one item from this line's recipes and sends it to the shelf (or storage). */
  craftOne(want?: { series: number; minRarity: number }): void {
    this.shop.stock.receive(this.makeItem(want), this.station.from);
  }

  /** Rolls an item and records it (collection, best edition, totals); the caller places it. */
  private makeItem(want?: { series: number; minRarity: number }): ItemCode {
    const { save, report } = this.shop;
    const code = this.rollItem(want);
    const id = itemId(code);
    const edition = Math.floor(code / 100000);
    const isNew = !save.collection.includes(id);
    if (isNew) {
      save.collection.push(id);
      report.newEntries.push(id);
    }
    if (edition > (save.bestEdition[id] ?? 0)) save.bestEdition[id] = edition;
    report.crafted++;
    save.totals.crafted++;
    this.shop.emit({ type: 'craft', item: code, isNew, line: this.id });
    return code;
  }
}

/** All production lines. */
export class Production {
  readonly lines: Line[];

  constructor(private readonly shop: Shop) {
    const { stats } = shop;
    this.lines = LINE_IDS.filter((id) => stats[`${id}.unlocked`] > 0).map((id) => new Line(shop, id, null));
  }

  /** At opening: infuse today's 魔石 into each line, if the player has enough of it. */
  infuse(): void {
    const { stats, save } = this.shop;
    for (const line of this.lines) {
      const gem = stats.infusion > 0 ? (save.infusion[line.id] ?? null) : null;
      if (gem === null || save.resources.gems[gem] < GEM_COST) continue;
      save.resources.gems[gem] -= GEM_COST;
      line.gem = gem;
      line.stats = line.computeStats();
    }
  }

  /** Skills bought during the day: refreshed line stats, and newly unlocked lines start up. */
  applyStats(): void {
    const stats = this.shop.stats;
    for (const line of this.lines) line.stats = line.computeStats();
    for (const id of LINE_IDS) {
      if (stats[`${id}.unlocked`] > 0 && !this.lines.some((l) => l.id === id)) this.lines.push(new Line(this.shop, id, null));
    }
    this.lines.sort((a, b) => LINE_IDS.indexOf(a.id) - LINE_IDS.indexOf(b.id));
  }

  /** Crafts an item for every empty shelf slot (MAI's blessing). Returns how many. */
  fillShelf(): number {
    const lines = this.lines.filter((l) => l.recipes().length > 0);
    if (!lines.length) return 0;
    const free = this.shop.stock.slots.filter((s) => !s.showcase && s.item === null && !s.incoming).length;
    for (let i = 0; i < free; i++) lines[i % lines.length].craftOne();
    return free;
  }

  /** Crafts `count` more items, wherever there is room (a hero's 補充 skill). Returns how many. */
  craftExtra(count: number): number {
    const lines = this.lines.filter((l) => l.recipes().length > 0);
    let made = 0;
    for (let i = 0; i < count && lines.length && this.shop.stock.makeRoom(); i++, made++) lines[i % lines.length].craftOne();
    return made;
  }

  /**
   * お目当て: crafts items of the series that collectors in the shop and today's orders are after
   * (an order's item at its rarity or better), up to `count`; any left over are crafted as usual.
   */
  craftWanted(count: number): number {
    const shop = this.shop;
    const wants = [
      ...shop.save.orders.map((o) => ({ series: o.series, minRarity: o.minRarity })),
      ...shop.collectorSeries(true).map((i) => ({ series: i, minRarity: 0 })),
    ].filter((w, k, all) => all.findIndex((x) => x.series === w.series) === k);
    let made = 0;
    for (const w of wants) {
      if (made >= count || !shop.stock.makeRoom()) break;
      const line = this.lines.find((l) => l.recipes().includes(w.series));
      if (!line) continue;
      line.craftOne(w);
      made++;
    }
    return made + this.craftExtra(count - made);
  }

  line(id: LineId): Line | undefined {
    return this.lines.find((l) => l.id === id);
  }

  update(dt: number): void {
    // Each pest in the workshop slows every line.
    const pestSlow = Math.max(0, Math.max(0.3, 1 - 0.35 * this.shop.pests.list.length));
    for (const line of this.lines) line.update(dt, pestSlow);
  }

  /** The line whose station (or progress ring) is under the point. */
  lineAt(x: number, y: number): Line | null {
    for (const line of this.lines) {
      const { ring, hit } = line.station;
      if (Math.hypot(x - ring.x, y - ring.y) < 50) return line;
      if (x >= hit.x0 && x <= hit.x1 && y >= hit.y0 && y <= hit.y1) return line;
    }
    return null;
  }

  releaseAll(): void {
    for (const line of this.lines) line.holding = false;
  }
}
