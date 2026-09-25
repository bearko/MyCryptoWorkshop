import { icons, merchants } from '../catalog';
import { FIRST_EVENT_DAY } from '../conditions';
import { fmt } from '../format';
import { COUNTER, DOOR, FLOOR_Y, HERO_PX } from '../layout';
import { averageTierPay, salePrice } from '../stats';
import type { Shop } from './index';
import type { Actor, Decision } from './types';
import { t } from '../../i18n';

/** MAI's sales blessing: price multiplier and how long it lasts (× blessingPower). */
export const BLESSING_MULT = 1.5;
export const BLESSING_TIME = 15;

/** Business seconds a visitor waits to be tapped before the fallback is taken. */
export const DECISION_WAIT = 20;

type Pending = Decision & {
  apply: (choice: number) => string;
  /** Rebuilds the offer from the shop as it is now (when opened); false if it no longer stands. */
  refresh?: () => boolean;
};

/**
 * Events that ask the player to choose. From FIRST_EVENT_DAY on, every business day has at
 * least one: the shady merchant or MAI arrives at a random time, and a caught thief may ask
 * to be forgiven. The visitor waits in the shop with a speech bubble while the day goes on;
 * tapping them opens the choice and pauses the day (view). Left alone for DECISION_WAIT
 * seconds, they take the fallback and go.
 */
export class Decisions {
  pending: Pending | null = null;
  private scheduledAt = -1;
  private reformOffered = false;
  private made = 0;

  constructor(private readonly shop: Shop) {
    if (shop.save.day >= FIRST_EVENT_DAY) this.scheduledAt = shop.stats.dayLength * shop.rand.range(0.25, 0.6);
  }

  /** The player has the choice open: the day waits. */
  get viewing(): boolean {
    return !!this.pending?.viewing;
  }

  update(dt: number): void {
    const shop = this.shop;
    const d = this.pending;
    if (d && !d.viewing && (d.waitLeft -= dt) <= 0) this.decide(d.fallback);
    if (this.pending || this.scheduledAt < 0 || shop.elapsed < this.scheduledAt) return;
    this.scheduledAt = -1;
    // One arrival a day: the merchant (when there is stock to buy) or MAI.
    if (this.stockValue() > 0 && shop.rand.next() < 0.5) this.offerMerchant();
    else this.offerBlessing();
  }

  get count(): number {
    return this.made;
  }

  private open(d: Omit<Pending, 'wait' | 'waitLeft' | 'viewing'>): void {
    const pending: Pending = { ...d, wait: DECISION_WAIT, waitLeft: DECISION_WAIT, viewing: false };
    this.pending = pending;
    this.shop.emit({ type: 'decision', decision: pending });
  }

  /** The visitor waiting at (x, y), if any (the tap target includes the speech bubble). */
  at(x: number, y: number): boolean {
    const d = this.pending;
    return !!d && !d.viewing && Math.abs(x - d.x) < 56 && y < d.y + 16 && y > d.y - HERO_PX - 96;
  }

  /** The player tapped the visitor: the up-to-date choice, and the day pauses until it is answered. */
  view(): Decision | null {
    const d = this.pending;
    if (!d) return null;
    if (d.refresh && !d.refresh()) {
      this.decide(d.fallback);
      return null;
    }
    d.viewing = true;
    return d;
  }

  /** Closed without choosing: the visitor waits again (the day resumes). */
  defer(): void {
    if (this.pending) this.pending.viewing = false;
  }

  /** At closing, a visitor still waiting takes the fallback. */
  settle(): void {
    if (this.pending) this.decide(this.pending.fallback);
  }

  /** Applies the player's choice and resumes the shop. */
  decide(choice: number): void {
    const d = this.pending;
    if (!d) return;
    this.pending = null;
    this.made++;
    const result = d.apply(Math.max(0, Math.min(d.options.length - 1, choice)));
    this.shop.report.decisions.push({ kind: d.kind, choice });
    this.shop.emit({ type: 'decided', kind: d.kind, choice, result });
  }

  // ---------------------------------------------------------------- shady merchant

  /** Everything on the (plain) shelf and in storage (not the showcase, not items in customers' hands). */
  private sellable(): { slots: number[]; storage: number } {
    const slots = this.shop.stock.slots.flatMap((s, i) => (!s.showcase && s.item !== null && s.claimedBy === null ? [i] : []));
    return { slots, storage: this.shop.stock.storage.length };
  }

  /**
   * What the stock would sell for to today's customers: the list price with the skill-tree
   * multipliers, times what the average customer of the current clientele pays (Uncommon ×1.25 …
   * Legendary ×2.2). The merchant offers a share of this.
   */
  private stockValue(): number {
    const shop = this.shop;
    const tierPay = averageTierPay(shop.stats.maxTier);
    const price = (code: number) => salePrice(code, shop.stats, shop.save.collection.length, 0, false) * tierPay;
    const { slots } = this.sellable();
    return slots.reduce((n, i) => n + price(shop.stock.slots[i].item!), 0) + shop.stock.storage.reduce((n, code) => n + price(code), 0);
  }

  private offerMerchant(): void {
    const shop = this.shop;
    const hero = shop.rand.pick(merchants);
    const d = {
      kind: 'merchant' as const,
      title: t(`悪徳商人 ${hero.name}`, `Shady Merchant ${hero.name}`),
      text: '',
      image: hero.image,
      facesRight: hero.facesRight,
      call: t('在庫、まとめて買うぞ？', "I'll buy your stock!"),
      x: DOOR.x - 90,
      y: FLOOR_Y + 70,
      options: [] as Decision['options'],
      fallback: 1,
      apply: (_choice: number) => '',
      // The offer is made for the stock as it is when the player listens.
      refresh: () => {
        const { slots, storage } = this.sellable();
        const count = slots.length + storage;
        const value = this.stockValue();
        if (count === 0 || value <= 0) return false;
        const offer = Math.max(1, Math.round(value * shop.stats.merchantRate));
        const pct = Math.round(shop.stats.merchantRate * 100);
        d.text = t(
          `「棚と倉庫の品 ${count} 個、まとめて ${fmt(offer)} GUM で買い取ってやろう。いつもの客に売る値段（合計 ${fmt(value)} GUM）の ${pct}% だが、今すぐ現金だぞ？」`,
          `"I'll take all ${count} items on your shelves and in storage for ${fmt(offer)} GUM. That's ${pct}% of what your customers would pay (${fmt(value)} GUM in all), but it's cash right now!"`,
        );
        d.options = [
          { label: t(`売る（+${fmt(offer)} GUM）`, `Sell (+${fmt(offer)} GUM)`), detail: t('ショーケース以外の品がなくなる', 'Everything but the showcase is gone') },
          { label: t('断る', 'Refuse'), detail: t('品はそのまま。いつも通り売る', 'Keep the stock and sell as usual') },
        ];
        d.apply = (choice) => {
          if (choice !== 0) return t(`${hero.name}は舌打ちして帰っていった`, `${hero.name} clicked their tongue and left`);
          const { slots: now } = this.sellable();
          for (const i of now) shop.stock.slots[i].item = null;
          shop.stock.storage = [];
          shop.addExtra('merchant', offer, COUNTER.x1 + 60, COUNTER.top - 40);
          return t(`${hero.name}に在庫を売り払った（+${fmt(offer)} GUM）`, `Sold the stock to ${hero.name} (+${fmt(offer)} GUM)`);
        };
        return true;
      },
    };
    d.refresh();
    this.open(d);
  }

  // ---------------------------------------------------------------- MAI's blessing

  private offerBlessing(): void {
    const shop = this.shop;
    const secs = Math.round(BLESSING_TIME * shop.stats.blessingPower);
    this.open({
      kind: 'mai',
      title: t('MAI が遊びに来た！', 'MAI dropped by!'),
      call: t('お手伝いするよ！', 'Need a hand?'),
      x: 560,
      y: FLOOR_Y + 220,
      text: t('「今日もおつかれさま！ひとつだけお手伝いしてあげる。どれにする？」', '"Good work today! I\'ll help you with one thing. Which will it be?"'),
      image: icons.mai,
      options: [
        { label: t(`売上 ${BLESSING_MULT} 倍（${secs}秒）`, `Sales ×${BLESSING_MULT} (${secs}s)`), detail: t(`この間に売れた品は ${BLESSING_MULT} 倍の値段になる`, `Items sold meanwhile go for ${BLESSING_MULT}× the price`) },
        { label: t('棚を全部埋める', 'Fill every shelf'), detail: t('空いている棚に、今作れる品を並べる', 'Stock every empty slot with items you can make now') },
        { label: t('泥棒とエネミーを追い払う', 'Chase off thieves and enemies'), detail: t('今いる泥棒とエネミーを退治。今日はもう泥棒が来ない', 'Clears out current thieves and enemies. No more thieves today') },
      ],
      fallback: 0,
      apply: (choice) => {
        if (choice === 0) {
          shop.visitors.boost(BLESSING_MULT, secs);
          return t(`MAI の応援で ${secs} 秒間 売上 ${BLESSING_MULT} 倍！`, `MAI's cheer: sales ×${BLESSING_MULT} for ${secs}s!`);
        }
        if (choice === 1) {
          const n = shop.production.fillShelf();
          return t(`MAI が棚に ${n} 個並べてくれた！`, `MAI stocked ${n} items on the shelves!`);
        }
        const caught = shop.thieves.clearAll();
        for (const p of [...shop.hazards.pests]) shop.hazards.defeat(p, 'cryptid');
        for (const p of [...shop.pests.list]) shop.pests.click(p);
        return t(`MAI が泥棒 ${caught} 人を追い払った！`, `MAI chased off ${caught} thieves!`);
      },
    });
  }

  // ---------------------------------------------------------------- thief reform

  /**
   * A thief caught by a tap may beg to be let off (once a day). Returns true if the decision
   * opened; the bounty is then paid (or not) by the choice.
   */
  offerReform(thief: Actor, bounty: number): boolean {
    const shop = this.shop;
    if (this.pending || this.reformOffered || shop.save.day < FIRST_EVENT_DAY) return false;
    if (shop.save.regulars.includes(thief.hero.id) || shop.rand.next() >= shop.stats.reformChance) return false;
    this.reformOffered = true;
    const pay = Math.round((shop.stats.regularPay - 1) * 100);
    this.open({
      kind: 'reform',
      title: t(`${thief.hero.name}が改心したいと言っている`, `${thief.hero.name} wants to turn over a new leaf`),
      call: t('話を聞いてくれ…', 'Hear me out...'),
      facesRight: thief.hero.facesRight,
      x: Math.max(120, Math.min(860, thief.x)),
      y: Math.max(FLOOR_Y + 40, thief.y),
      text: t('「出来心だったんだ…もう盗みはしない。これからは客としてこの店に通わせてくれないか？」', '"It was a moment of weakness... I\'ll never steal again. Will you let me come back as a customer?"'),
      image: thief.hero.image,
      options: [
        { label: t(`懸賞金を受け取る（+${fmt(bounty)} GUM）`, `Take the bounty (+${fmt(bounty)} GUM)`), detail: t('役人に引き渡す', 'Hand them over to the guards') },
        { label: t('許して常連客にする', 'Forgive them and make them a regular'), detail: t(`懸賞金はなし。以後ときどき来店し、代金を +${pay}% 多く払う`, `No bounty. They visit now and then and pay +${pay}%`) },
      ],
      fallback: 0,
      apply: (choice) => {
        if (choice === 0) {
          shop.addGum(bounty, thief.x, thief.y - HERO_PX - 30);
          return t(`懸賞金 ${fmt(bounty)} GUM を受け取った`, `Received a bounty of ${fmt(bounty)} GUM`);
        }
        shop.save.regulars.push(thief.hero.id);
        return t(`${thief.hero.name}が常連客になった！`, `${thief.hero.name} became a regular!`);
      },
    });
    return true;
  }
}
