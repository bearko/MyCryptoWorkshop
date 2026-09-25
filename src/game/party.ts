import { attributeName, customers, heroById, series, type Hero } from './catalog';
import { add, mul, pow, type Effect } from './effects';
import { FACTION_BY_NAME, FACTION_NAME } from './factions';
import { LINE_IDS } from './lines';
import { t } from '../i18n';

/**
 * The hero party (英雄の酒場). Heroes are scouted in the skill tree (スカウト：<name>, Lv 1–5):
 * each one teaches the recipes of a few series (the later series are learned only this way) and
 * brings a skill. Before a business day the player puts up to five scouted heroes in the party;
 * they stand on the workshop balcony and use their skill whenever it has charged.
 */

export type SkillKind = 'sales' | 'crowd' | 'craft' | 'luck' | 'sweep' | 'rush' | 'wait' | 'vip' | 'wish' | 'restock' | 'study';

/** 1: 英雄の酒場 (series from Strawberry on), 2: 英雄の広間 (after Epic), 3: 伝説の間 (after Legendary). */
export type PartyTier = 1 | 2 | 3;

export interface PartyHeroDef {
  /** Hero id in the catalog. */
  id: number;
  tier: PartyTier;
  kind: SkillKind;
  /** Keys of the series whose recipes this hero teaches. */
  teaches: string[];
}

/**
 * The roster, by tier. Each hero teaches series that suit them (their ゆかりの品 where there is
 * one) and has a skill in keeping with who they were.
 */
export const PARTY_ROSTER: PartyHeroDef[] = [
  // ---- Tier 1: 英雄の酒場
  { id: 2049, tier: 1, kind: 'wait', teaches: ['Flute', 'Clavia', 'Violin'] }, // ショパン
  { id: 2004, tier: 1, kind: 'sales', teaches: ['Horn', 'Harp', 'Drum'] }, // シューベルト
  { id: 2022, tier: 1, kind: 'crowd', teaches: ['Sweets', 'Strawberry', 'Tangerine', 'Grape'] }, // アンデルセン
  { id: 2024, tier: 1, kind: 'vip', teaches: ['Pierrot', 'Maracas', 'Lime'] }, // サロメ
  { id: 2048, tier: 1, kind: 'luck', teaches: ['Lithography', 'Graphite', 'Sage', 'Blueberry', 'Ruby'] }, // ルノワール
  { id: 3002, tier: 1, kind: 'restock', teaches: ['Knife', 'Twin Blade', 'Mantle'] }, // ダルタニャン
  { id: 3031, tier: 1, kind: 'rush', teaches: ['Whip', 'Arquebus', 'Hand cannon'] }, // ワイアット・アープ
  { id: 3025, tier: 1, kind: 'sweep', teaches: ['Mallet', 'Sickle', 'Yoroi'] }, // 真田幸村
  { id: 3017, tier: 1, kind: 'study', teaches: ['Erhu', 'Sitar', 'Staff'] }, // 三蔵法師
  { id: 3008, tier: 1, kind: 'wish', teaches: ['Glasses', 'Broomstick'] }, // ノストラダムス
  { id: 3042, tier: 1, kind: 'crowd', teaches: ['Ship', 'Sake'] }, // コロンブス
  // ---- Tier 2: 英雄の広間
  { id: 4025, tier: 2, kind: 'sales', teaches: ['Saihai', 'Oriflamme', 'Japanese dolls'] }, // 武田信玄
  { id: 4050, tier: 2, kind: 'wish', teaches: ['Orb', 'Moai'] }, // 司馬懿仲達
  { id: 4041, tier: 2, kind: 'craft', teaches: ['Imperial Magic Armor', 'Panda Machine', 'Combined Robots', 'Raygun'] }, // ニコラ・テスラ
  { id: 4007, tier: 2, kind: 'craft', teaches: ['Pocket Watch', 'Two wheeled vehicle', 'Ferris wheel', 'Node-Doll'] }, // トーマス・エジソン
  { id: 4014, tier: 2, kind: 'vip', teaches: ['Ribbon', 'Mirror', 'Pancake'] }, // マリー・アントワネット
  { id: 4021, tier: 2, kind: 'luck', teaches: ['Brush & pallete', 'Sweet Fluffy and chewy'] }, // ゴッホ
  { id: 3012, tier: 2, kind: 'wait', teaches: ['Skull', 'Talisman', 'Golem'] }, // 天草四郎
  { id: 3010, tier: 2, kind: 'sweep', teaches: ['Shuriken', 'Claw'] }, // 服部半蔵
  { id: 4045, tier: 2, kind: 'sales', teaches: ['Enhanced Sword', 'Gauntlet'] }, // ランスロット
  { id: 4017, tier: 2, kind: 'study', teaches: ['Monocle', 'Spaceship', 'SDN Medal'] }, // キュリー夫人
  { id: 1005, tier: 2, kind: 'crowd', teaches: ['Raft', 'Belt', 'Snowman'] }, // 伊能忠敬
  { id: 3040, tier: 2, kind: 'restock', teaches: ['Ammonite', 'Plesiosaurus', 'Megalodon', 'Longisquama', 'Pachycephalosaurus', 'Frog'] }, // ギルガメッシュ
  { id: 4029, tier: 2, kind: 'sweep', teaches: ['Pteranodon', 'Tyrannosaurus', 'Triceratops', 'Stegosaurus', 'Ridragon'] }, // ヤマトタケル
  { id: 4028, tier: 2, kind: 'luck', teaches: ['Grasshopper', 'Limulus', 'Moth', 'Scorpion', 'Weevil', 'Beetle', 'Bee', 'Butterfly'] }, // ダーウィン
  // ---- Tier 3: 伝説の間
  { id: 5008, tier: 3, kind: 'crowd', teaches: ['Haori', 'Swan boats', 'Ramen'] }, // 坂本龍馬
  { id: 5027, tier: 3, kind: 'study', teaches: ['Astronomical Model', 'Compass', 'Lantern', 'Aquarium'] }, // ガリレオ・ガリレイ
  { id: 5015, tier: 3, kind: 'craft', teaches: ['Shield System', 'RYU.phy', 'RYU.int', 'Cyber Staff', 'Cyber Sword'] }, // 諸葛亮
  { id: 5024, tier: 3, kind: 'luck', teaches: ['Sushi', 'Bonsai', 'Cherry blossom viewing Bento', 'Scissors'] }, // 葛飾北斎
  { id: 5012, tier: 3, kind: 'wait', teaches: ['Music Box', 'Chair', 'Apple'] }, // バッハ
  { id: 5021, tier: 3, kind: 'sweep', teaches: ['Magic Card', 'Summon Board', 'Mandragora', 'Nature Golem'] }, // 安倍晴明
  { id: 5032, tier: 3, kind: 'rush', teaches: ['Flail', 'Chakram', 'Knuckle Duster'] }, // 宮本武蔵
  { id: 5028, tier: 3, kind: 'wish', teaches: ['Javelin', 'Boomerang', 'Trap'] }, // 那須与一
  { id: 5016, tier: 3, kind: 'vip', teaches: ['Parasol', 'Bonnet', "Magical girl's Stick & Brooch", 'Strawberry Cake'] }, // クレオパトラ
  { id: 5018, tier: 3, kind: 'restock', teaches: ['Wallet', 'Wet Specimen', 'Nashi Pear'] }, // 始皇帝
  { id: 5006, tier: 3, kind: 'sales', teaches: ['Mace', 'Jewel Worm Dragon', 'Bird Chimera', 'Jewel Dragon', 'Beast Horn'] }, // アーサー王
  { id: 5011, tier: 3, kind: 'wait', teaches: ['Cat Teaser', 'Dollhouse', 'Plant-Insect'] }, // 卑弥呼
  { id: 5001, tier: 3, kind: 'sales', teaches: ['Lion', 'Hamburger', 'Panjandrum'] }, // 織田信長
];

const byId = new Map(PARTY_ROSTER.map((d) => [d.id, d]));
const seriesIndex = new Map(series.map((s, i) => [s.key, i]));

/** The roster entry of a hero, if they can join the party. */
export const partyDef = (id: number): PartyHeroDef | undefined => byId.get(id);

/** The hero (catalog data, in the current language) of a roster entry. */
export function partyHero(id: number): Hero {
  const hero = customers.find((c) => c.id === id);
  if (!hero) throw new Error(`party hero ${id} is not a customer`);
  return hero;
}

/** Skill tree node that scouts the hero (its level is the hero's level). */
export const scoutId = (heroId: number) => `scout_${heroId}`;

/** Hub that opens each tier's scouts. */
export const TIER_HALL: Record<PartyTier, string> = { 1: 'tavern', 2: 'heroHall', 3: 'legendHall' };

/** Series index → the hero who teaches its recipe. */
export const TEACHER = new Map<number, number>();
for (const d of PARTY_ROSTER) {
  for (const key of d.teaches) {
    const i = seriesIndex.get(key);
    if (i === undefined) throw new Error(`party: unknown series ${key}`);
    if (TEACHER.has(i)) throw new Error(`party: ${key} is taught twice`);
    TEACHER.set(i, d.id);
  }
}

/** Series indexes a hero teaches. */
export const taughtSeries = (d: PartyHeroDef): number[] => d.teaches.map((k) => seriesIndex.get(k)!);

export const MAX_PARTY = 5;
/** Seconds for a skill to charge at Lv 1 (each level takes 8% off). */
export const SKILL_COOLDOWN = 30;
/** How much stronger each tier's skills are. */
export const TIER_POWER: Record<PartyTier, number> = { 1: 1, 2: 1.6, 3: 2.5 };

export interface SkillValue {
  /** Multiplier bonus (sales, craft, luck), seconds of patience (wait) or payment multiplier (vip). */
  power: number;
  /** How long the effect lasts. */
  seconds: number;
  /** Customers, checkouts, items or research points. */
  count: number;
}

/** What a skill does at a hero level (1–5), tier and synergy boost. */
export function skillValue(kind: SkillKind, level: number, tier: PartyTier, boost = 1): SkillValue {
  const p = TIER_POWER[tier] * boost;
  const up = level - 1;
  const n = (base: number) => Math.max(1, Math.round(base * p));
  switch (kind) {
    case 'sales':
      return { power: (0.2 + 0.05 * up) * p, seconds: 8, count: 0 };
    case 'craft':
      return { power: (0.6 + 0.2 * up) * p, seconds: 10, count: 0 };
    case 'luck':
      return { power: (0.3 + 0.1 * up) * p, seconds: 10, count: 0 };
    case 'wait':
      return { power: Math.round((2 + level) * p), seconds: 15, count: 0 };
    case 'vip':
      return { power: Math.round((4 + 2 * level) * p), seconds: 0, count: 1 };
    case 'crowd':
      return { power: 0, seconds: 0, count: n(3 + level) };
    case 'rush':
      return { power: 0, seconds: 0, count: n(1 + level) };
    case 'wish':
      return { power: 0, seconds: 0, count: n(1 + 0.5 * level) };
    case 'restock':
      return { power: 0, seconds: 0, count: n(level) };
    case 'study':
      return { power: 0, seconds: 0, count: n(1 + level) };
    case 'sweep':
      return { power: 0, seconds: 6 + 2 * level, count: 0 };
  }
}

/** Every skill but 売上 also cheers the shop up: a short sales boost, the same for every kind. */
export function cheerValue(level: number, tier: PartyTier, boost = 1): SkillValue {
  return { power: 0.08 * TIER_POWER[tier] * boost * (1 + 0.25 * (level - 1)), seconds: 6, count: 0 };
}

/** Short name of each kind of skill. */
export const SKILL_KIND_NAME: Record<SkillKind, string> = {
  sales: t('売上', 'Sales'),
  crowd: t('集客', 'Crowds'),
  craft: t('生産', 'Crafting'),
  luck: t('目利き', 'Rarity'),
  sweep: t('退治', 'Guard'),
  rush: t('会計', 'Checkout'),
  wait: t('足止め', 'Patience'),
  vip: t('来店', 'Visit'),
  wish: t('お目当て', 'Wishes'),
  restock: t('補充', 'Restock'),
  study: t('研究', 'Research'),
};

const x2 = (v: number) => (1 + v).toFixed(2).replace(/0$/, '');

/** What the skill does, with its numbers. */
export function skillText(kind: SkillKind, v: SkillValue, heroName: string): string {
  switch (kind) {
    case 'sales':
      return t(`${v.seconds}秒間、売上 ×${x2(v.power)}`, `Sales ×${x2(v.power)} for ${v.seconds}s`);
    case 'craft':
      return t(`${v.seconds}秒間、クラフト速度 ×${x2(v.power)}、最高レアとエディションの出やすさ ×${x2(v.power / 2)}`, `Crafting ×${x2(v.power)}, top-rarity and edition chance ×${x2(v.power / 2)} for ${v.seconds}s`);
    case 'luck':
      return t(`${v.seconds}秒間、最高レアとエディションの出やすさ ×${x2(v.power)}`, `Top-rarity and edition chance ×${x2(v.power)} for ${v.seconds}s`);
    case 'wait':
      return t(`店の客の待ち時間を元に戻し、${v.seconds}秒間 待てる時間 +${v.power}秒`, `Resets how long customers have waited, and they wait ${v.power}s longer for ${v.seconds}s`);
    case 'vip':
      return t(`${heroName}本人が来店し、棚でいちばん高い品を ×${v.power} で買う`, `${heroName} comes in and buys the priciest item on the shelves at ×${v.power}`);
    case 'crowd':
      return t(`客を ${v.count} 人呼び込む`, `Brings in ${v.count} customers`);
    case 'rush':
      return t(`レジに並ぶ客 ${v.count} 人の会計を一瞬で済ませる`, `Checks out ${v.count} customers in line at once`);
    case 'wish':
      return t(`コレクターや注文の客が探すシリーズの品を ${v.count} 個まで作って棚に出す`, `Crafts up to ${v.count} items of the series collectors and orders are after`);
    case 'restock':
      return t(`空いた棚をすべて埋め、さらに ${v.count} 個クラフトする`, `Fills every empty shelf slot and crafts ${v.count} more`);
    case 'study':
      return t(`研究ポイント +${v.count}`, `Research points +${v.count}`);
    case 'sweep':
      return t(`泥棒・エネミー・汚れを一掃し、${v.seconds}秒間 寄せつけない`, `Clears out thieves, enemies and messes, and keeps them away for ${v.seconds}s`);
  }
}

/** Seconds a hero's skill takes to charge at a level (before synergies). */
export const skillCooldown = (level: number) => SKILL_COOLDOWN * (1 - 0.08 * (Math.max(1, level) - 1));

export interface Synergy {
  kind: 'attribute' | 'faction';
  /** Attribute name, or faction name, as displayed. */
  name: string;
  /** Hero ids that share it. */
  members: number[];
  text: string;
}

/** Heroes sharing an attribute charge faster; three or more of one faction have stronger skills. */
export function partySynergies(ids: number[]): Synergy[] {
  const heroes = ids.map((id) => heroById.get(id)).filter((h): h is NonNullable<typeof h> => !!h);
  const out: Synergy[] = [];
  const byAttr = new Map<string, number[]>();
  for (const h of heroes) for (const a of h.attributes ?? []) byAttr.set(a, [...(byAttr.get(a) ?? []), h.id]);
  for (const [attr, members] of byAttr) {
    if (members.length < 2) continue;
    const pct = Math.min(40, 10 * (members.length - 1));
    out.push({ kind: 'attribute', name: attributeName(attr), members, text: t(`スキルの溜まる時間 -${pct}%`, `Skills charge ${pct}% faster`) });
  }
  const byFaction = new Map<string, number[]>();
  for (const h of heroes) if (h.faction) byFaction.set(h.faction, [...(byFaction.get(h.faction) ?? []), h.id]);
  for (const [faction, members] of byFaction) {
    if (members.length < 3) continue;
    const key = FACTION_BY_NAME[faction];
    out.push({ kind: 'faction', name: key ? FACTION_NAME[key] : faction, members, text: t('スキルの効果 +20%', 'Skill effects +20%') });
  }
  return out;
}

/** A party member's charge time and skill boost with the rest of the party. */
export function memberTuning(id: number, level: number, party: number[]): { cooldown: number; boost: number } {
  let cut = 0;
  let boost = 1;
  for (const s of partySynergies(party)) {
    if (!s.members.includes(id)) continue;
    if (s.kind === 'attribute') cut = Math.max(cut, Math.min(0.4, 0.1 * (s.members.length - 1)));
    else boost = 1.2;
  }
  return { cooldown: skillCooldown(level) * (1 - cut), boost };
}

/** Scouted heroes (level ≥ 1), in roster order. */
export function scoutedHeroes(levels: Record<string, number>): PartyHeroDef[] {
  return PARTY_ROSTER.filter((d) => (levels[scoutId(d.id)] ?? 0) > 0);
}

/** The party that takes the floor: saved members that are scouted, up to the slots. */
export function activeParty(party: number[], levels: Record<string, number>, slots: number): number[] {
  return [...new Set(party)].filter((id) => (levels[scoutId(id)] ?? 0) > 0).slice(0, Math.max(0, slots));
}

/** Rough value of each kind of skill to sales, for the suggested party. */
const KIND_WEIGHT: Record<SkillKind, number> = { sales: 1, crowd: 0.9, craft: 0.9, vip: 0.8, luck: 0.7, wish: 0.7, rush: 0.6, restock: 0.6, wait: 0.5, sweep: 0.4, study: 0.3 };

/** おまかせ: the strongest scouted heroes for the slots (tier, level, then kind of skill). */
export function suggestParty(levels: Record<string, number>, slots: number): number[] {
  const score = (d: PartyHeroDef) => TIER_POWER[d.tier] * (1 + 0.25 * ((levels[scoutId(d.id)] ?? 1) - 1)) * KIND_WEIGHT[d.kind];
  return scoutedHeroes(levels)
    .sort((a, b) => score(b) - score(a))
    .slice(0, Math.max(0, slots))
    .map((d) => d.id);
}

/** How much each tier's support effects are worth (per hero level). */
const SUPPORT_TIER: Record<PartyTier, number> = { 1: 1, 2: 1.5, 3: 2 };

/**
 * サポート効果: what a scouted hero does for the shop per level, in the party or not (their
 * kind of skill, as a lasting bonus). Every hero level also adds 0.5% to the sale price.
 */
export function supportEffects(d: PartyHeroDef): Effect[] {
  const k = SUPPORT_TIER[d.tier];
  const base = [mul('priceMult', 0.005, 'heroes')];
  switch (d.kind) {
    case 'sales':
      return [mul('priceMult', 0.005 + 0.01 * k, 'heroes')];
    case 'crowd':
      return [...base, mul('spawnRate', 0.01 * k, 'heroes')];
    case 'craft':
      return [...base, ...LINE_IDS.map((l): Effect => pow(`${l}.craftTime`, 1 - 0.01 * k))];
    case 'luck':
      return [...base, add('luck', 0.02 * k)];
    case 'sweep':
      return [...base, pow('thiefSpeed', 1 - 0.01 * k), add('bountyMult', 0.1 * k)];
    case 'rush':
      return [...base, pow('cashierTime', 1 - 0.015 * k)];
    case 'wait':
      return [...base, add('patience', 0.2 * k), add('queuePatience', 0.2 * k)];
    case 'vip':
      return [...base, add('ownerPay', 0.1 * k)];
    case 'wish':
      return [...base, add('collectorPay', 0.05 * k), add('orderPay', 0.1 * k)];
    case 'restock':
      return [...base, pow('restockTime', 1 - 0.015 * k)];
    case 'study':
      return [...base, mul('researchRate', 0.02 * k, 'heroes')];
  }
}

/** The support effect in words, for `level` levels (0.5% sale price per level included). */
export function supportText(d: PartyHeroDef, level: number): string {
  const k = SUPPORT_TIER[d.tier] * level;
  const pct = (v: number) => `${Math.round(v * 1000) / 10}%`;
  const price = t(`販売価格 +${pct(0.005 * level)}`, `sale price +${pct(0.005 * level)}`);
  switch (d.kind) {
    case 'sales':
      return t(`販売価格 +${pct((0.005 + 0.01 * SUPPORT_TIER[d.tier]) * level)}`, `Sale price +${pct((0.005 + 0.01 * SUPPORT_TIER[d.tier]) * level)}`);
    case 'crowd':
      return t(`来客ペース +${pct(0.01 * k)}、${price}`, `Customer rate +${pct(0.01 * k)}, ${price}`);
    case 'craft':
      return t(`クラフト時間 -${pct(1 - Math.pow(1 - 0.01 * SUPPORT_TIER[d.tier], level))}、${price}`, `Craft time -${pct(1 - Math.pow(1 - 0.01 * SUPPORT_TIER[d.tier], level))}, ${price}`);
    case 'luck':
      return t(`最高レアの出やすさ +${Math.round(2 * k)}%、${price}`, `Top-rarity chance +${Math.round(2 * k)}%, ${price}`);
    case 'sweep':
      return t(`泥棒の逃げ足 -${pct(1 - Math.pow(1 - 0.01 * SUPPORT_TIER[d.tier], level))}・懸賞金 +${pct(0.1 * k)}、${price}`, `Thief speed -${pct(1 - Math.pow(1 - 0.01 * SUPPORT_TIER[d.tier], level))}, bounty +${pct(0.1 * k)}, ${price}`);
    case 'rush':
      return t(`会計時間 -${pct(1 - Math.pow(1 - 0.015 * SUPPORT_TIER[d.tier], level))}、${price}`, `Checkout time -${pct(1 - Math.pow(1 - 0.015 * SUPPORT_TIER[d.tier], level))}, ${price}`);
    case 'wait':
      return t(`棚とレジで待つ時間 +${Math.round(2 * k) / 10}秒、${price}`, `Customers wait ${Math.round(2 * k) / 10}s longer, ${price}`);
    case 'vip':
      return t(`ランドオーナーの支払い +${(0.1 * k).toFixed(1)}倍、${price}`, `Land owners pay +${(0.1 * k).toFixed(1)}×, ${price}`);
    case 'wish':
      return t(`コレクター客の支払い +${(0.05 * k).toFixed(2)}倍・注文の品 +${(0.1 * k).toFixed(1)}倍、${price}`, `Collectors pay +${(0.05 * k).toFixed(2)}×, ordered items +${(0.1 * k).toFixed(1)}×, ${price}`);
    case 'restock':
      return t(`棚への補充間隔 -${pct(1 - Math.pow(1 - 0.015 * SUPPORT_TIER[d.tier], level))}、${price}`, `Restock interval -${pct(1 - Math.pow(1 - 0.015 * SUPPORT_TIER[d.tier], level))}, ${price}`);
    case 'study':
      return t(`研究ポイント +${pct(0.02 * k)}、${price}`, `Research points +${pct(0.02 * k)}, ${price}`);
  }
}
