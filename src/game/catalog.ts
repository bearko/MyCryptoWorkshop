import raw from '../generated/catalog.json';

export const RARITIES = ['Common', 'Uncommon', 'Rare', 'Epic', 'Legendary'] as const;
export type Rarity = (typeof RARITIES)[number];

export const RARITY_JA: Record<Rarity, string> = {
  Common: 'コモン',
  Uncommon: 'アンコモン',
  Rare: 'レア',
  Epic: 'エピック',
  Legendary: 'レジェンド',
};

export const RARITY_COLOR: Record<Rarity, string> = {
  Common: '#b9b9b9',
  Uncommon: '#63d471',
  Rare: '#4fa8ff',
  Epic: '#c77dff',
  Legendary: '#ffb627',
};

export interface Extension {
  id: number;
  name: string;
  rarity: Rarity;
  rarityIndex: number;
  seriesIndex: number;
  seriesName: string;
  skill: string;
  image: string;
}

export interface Hero {
  id: number;
  name: string;
  rarity: Rarity;
  rarityIndex: number;
  faction?: string;
  passive?: string;
  image: string;
}

export interface Frame {
  image: string;
  ms: number;
}

export const catalog = raw;

export const series = raw.series.map((s, seriesIndex) => ({
  key: s.key,
  name: s.name,
  items: s.items.map(
    (e): Extension => ({
      id: e.id,
      name: e.name,
      rarity: e.rarity as Rarity,
      rarityIndex: RARITIES.indexOf(e.rarity as Rarity),
      seriesIndex,
      seriesName: s.name,
      skill: e.skill,
      image: e.image,
    }),
  ),
}));

export const extensionById = new Map<number, Extension>(series.flatMap((s) => s.items).map((e) => [e.id, e]));

export function getExtension(id: number): Extension {
  const e = extensionById.get(id);
  if (!e) throw new Error(`unknown extension ${id}`);
  return e;
}

const toHero = (h: { id: number; name: string; rarity: string; faction?: string; passive?: string; image: string }): Hero => ({
  ...h,
  rarity: h.rarity as Rarity,
  rarityIndex: RARITIES.indexOf(h.rarity as Rarity),
});

export const customers: Hero[] = raw.customers.map(toHero);
export const customersByTier: Hero[][] = RARITIES.map((r) => customers.filter((c) => c.rarity === r));
export const thieves: Hero[] = raw.thieves.map(toHero);
export const pests = raw.pests;
export const workshopImages = raw.workshop as Record<string, string>;
export const staffFrames = raw.staff as {
  chris: Frame[];
  chrisCheer: string;
  mine: Frame[];
  maycri: Frame[];
};
export const icons = raw.icons;
export const audioFiles = raw.audio as Record<string, string>;
