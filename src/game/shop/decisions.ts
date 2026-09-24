import { icons, merchants } from '../catalog';
import { FIRST_EVENT_DAY } from '../conditions';
import { fmt } from '../format';
import { COUNTER, HERO_PX } from '../layout';
import { salePrice } from '../stats';
import type { Shop } from './index';
import type { Actor, Decision } from './types';

/** MAI's sales blessing: price multiplier and how long it lasts (× blessingPower). */
export const BLESSING_MULT = 1.5;
export const BLESSING_TIME = 15;

type Pending = Decision & { apply: (choice: number) => string };

/**
 * Events that ask the player to choose. From FIRST_EVENT_DAY on, every business day has at
 * least one: the shady merchant or MAI arrives at a random time, and a caught thief may ask
 * to be forgiven. The shop pauses until the choice is made (see Shop.decide).
 */
export class Decisions {
  pending: Pending | null = null;
  private scheduledAt = -1;
  private reformOffered = false;
  private made = 0;

  constructor(private readonly shop: Shop) {
    if (shop.save.day >= FIRST_EVENT_DAY) this.scheduledAt = shop.stats.dayLength * shop.rand.range(0.25, 0.6);
  }

  update(): void {
    const shop = this.shop;
    if (this.pending || this.scheduledAt < 0 || shop.elapsed < this.scheduledAt) return;
    this.scheduledAt = -1;
    // One arrival a day: the merchant (when there is stock to buy) or MAI.
    if (this.stockValue() > 0 && shop.rand.next() < 0.5) this.offerMerchant();
    else this.offerBlessing();
  }

  get count(): number {
    return this.made;
  }

  private open(d: Pending): void {
    this.pending = d;
    this.shop.emit({ type: 'decision', decision: { kind: d.kind, title: d.title, text: d.text, image: d.image, options: d.options, fallback: d.fallback } });
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

  /** Everything on the (plain) shelf and in storage, at shop price. */
  private sellable(): { slots: number[]; storage: number } {
    const slots = this.shop.stock.slots.flatMap((s, i) => (!s.showcase && s.item !== null && s.claimedBy === null ? [i] : []));
    return { slots, storage: this.shop.stock.storage.length };
  }

  private stockValue(): number {
    const shop = this.shop;
    const price = (code: number) => salePrice(code, shop.stats, shop.save.collection.length, 0, false);
    const { slots } = this.sellable();
    return slots.reduce((n, i) => n + price(shop.stock.slots[i].item!), 0) + shop.stock.storage.reduce((n, code) => n + price(code), 0);
  }

  private offerMerchant(): void {
    const shop = this.shop;
    const hero = shop.rand.pick(merchants);
    const { slots, storage } = this.sellable();
    const count = slots.length + storage;
    const offer = Math.max(1, Math.round(this.stockValue() * shop.stats.merchantRate));
    const pct = Math.round(shop.stats.merchantRate * 100);
    this.open({
      kind: 'merchant',
      title: `悪徳商人 ${hero.name}`,
      text: `「棚と倉庫の品 ${count} 個、まとめて ${fmt(offer)} GUM で買い取ってやろう。店頭価格の ${pct}% だが、今すぐ現金だぞ？」`,
      image: hero.image,
      options: [
        { label: `売る（+${fmt(offer)} GUM）`, detail: 'ショーケース以外の品がなくなる' },
        { label: '断る', detail: '品はそのまま。いつも通り売る' },
      ],
      fallback: 1,
      apply: (choice) => {
        if (choice !== 0) return `${hero.name}は舌打ちして帰っていった`;
        const { slots: now } = this.sellable();
        for (const i of now) shop.stock.slots[i].item = null;
        shop.stock.storage = [];
        shop.addExtra('merchant', offer, COUNTER.x1 + 60, COUNTER.top - 40);
        return `${hero.name}に在庫を売り払った（+${fmt(offer)} GUM）`;
      },
    });
  }

  // ---------------------------------------------------------------- MAI's blessing

  private offerBlessing(): void {
    const shop = this.shop;
    const secs = Math.round(BLESSING_TIME * shop.stats.blessingPower);
    this.open({
      kind: 'mai',
      title: 'MAI が遊びに来た！',
      text: '「今日もおつかれさま！ひとつだけお手伝いしてあげる。どれにする？」',
      image: icons.mai,
      options: [
        { label: `売上 ${BLESSING_MULT} 倍（${secs}秒）`, detail: `この間に売れた品は ${BLESSING_MULT} 倍の値段になる` },
        { label: '棚を全部埋める', detail: '空いている棚に、今作れる品を並べる' },
        { label: '泥棒とエネミーを追い払う', detail: '今いる泥棒とエネミーを退治。今日はもう泥棒が来ない' },
      ],
      fallback: 0,
      apply: (choice) => {
        if (choice === 0) {
          shop.visitors.boost(BLESSING_MULT, secs);
          return `MAI の応援で ${secs} 秒間 売上 ${BLESSING_MULT} 倍！`;
        }
        if (choice === 1) {
          const n = shop.production.fillShelf();
          return `MAI が棚に ${n} 個並べてくれた！`;
        }
        const caught = shop.thieves.clearAll();
        for (const p of [...shop.hazards.pests]) shop.hazards.defeat(p, 'cryptid');
        for (const p of [...shop.pests.list]) shop.pests.click(p);
        return `MAI が泥棒 ${caught} 人を追い払った！`;
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
      title: `${thief.hero.name}が改心したいと言っている`,
      text: '「出来心だったんだ…もう盗みはしない。これからは客としてこの店に通わせてくれないか？」',
      image: thief.hero.image,
      options: [
        { label: `懸賞金を受け取る（+${fmt(bounty)} GUM）`, detail: '役人に引き渡す' },
        { label: '許して常連客にする', detail: `懸賞金はなし。以後ときどき来店し、代金を +${pay}% 多く払う` },
      ],
      fallback: 0,
      apply: (choice) => {
        if (choice === 0) {
          shop.addGum(bounty, thief.x, thief.y - HERO_PX - 30);
          return `懸賞金 ${fmt(bounty)} GUM を受け取った`;
        }
        shop.save.regulars.push(thief.hero.id);
        return `${thief.hero.name}が常連客になった！`;
      },
    });
    return true;
  }
}
