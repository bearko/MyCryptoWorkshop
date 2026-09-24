import type { Family } from './catalog';
import { t } from '../i18n';

/** The workshop's three production lines. */
export type LineId = 'pot' | 'forge' | 'capsule';
export const LINE_IDS: LineId[] = ['pot', 'forge', 'capsule'];

export const LINES: Record<LineId, { name: string; families: Family[]; note: string }> = {
  pot: { name: t('魔法の壺', 'Magic Pot'), families: ['arcane', 'arms'], note: t('魔導具と武具を何でも作れる', 'Makes any arcane item or arms') },
  forge: { name: t('鍛冶炉', 'Forge'), families: ['arms'], note: t('武具専門。エディション付きが出やすい', 'Arms only. Editions come up more often') },
  capsule: { name: t('具現化カプセル', 'Materialize Capsule'), families: ['beast'], note: t('幻獣専門。幻獣は高く売れる', 'Beasts only. Beasts sell for more') },
};

/** 魔石 (gemstones) dropped by dismantling; infused into a line for a day-long boost. */
export type GemId = 'ifrit' | 'leviathan' | 'tiamat' | 'garuda';
export const GEM_IDS: GemId[] = ['ifrit', 'leviathan', 'tiamat', 'garuda'];

export const GEMS: Record<GemId, { name: string; effect: string }> = {
  ifrit: { name: t('イフリートの魔石', 'Ifrit Stone'), effect: t('クラフト速度 ×1.3', 'Craft speed ×1.3') },
  leviathan: { name: t('リヴァイアサンの魔石', 'Leviathan Stone'), effect: t('同時クラフト率 +15%', 'Twin craft chance +15%') },
  tiamat: { name: t('ティアマトの魔石', 'Tiamat Stone'), effect: t('最高レアの出やすさ ×1.5', 'Top-rarity chance ×1.5') },
  garuda: { name: t('ガルーダの魔石', 'Garuda Stone'), effect: t('エディションの出やすさ ×2', 'Edition chance ×2') },
};

/** Which 魔石 dismantling a family's item yields. */
export const FAMILY_GEM: Record<Family, GemId> = { arms: 'ifrit', arcane: 'leviathan', beast: 'garuda' };
