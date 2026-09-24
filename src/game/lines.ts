import type { Family } from './catalog';

/** The workshop's three production lines. */
export type LineId = 'pot' | 'forge' | 'capsule';
export const LINE_IDS: LineId[] = ['pot', 'forge', 'capsule'];

export const LINES: Record<LineId, { name: string; families: Family[]; note: string }> = {
  pot: { name: '魔法の壺', families: ['arcane', 'arms'], note: '魔導具と武具を何でも作れる' },
  forge: { name: '鍛冶炉', families: ['arms'], note: '武具専門。エディション付きが出やすい' },
  capsule: { name: '具現化カプセル', families: ['beast'], note: '幻獣専門。幻獣は高く売れる' },
};

/** 魔石 (gemstones) dropped by dismantling; infused into a line for a day-long boost. */
export type GemId = 'ifrit' | 'leviathan' | 'tiamat' | 'garuda';
export const GEM_IDS: GemId[] = ['ifrit', 'leviathan', 'tiamat', 'garuda'];

export const GEMS: Record<GemId, { name: string; effect: string }> = {
  ifrit: { name: 'イフリートの魔石', effect: 'クラフト速度 ×1.3' },
  leviathan: { name: 'リヴァイアサンの魔石', effect: '同時クラフト率 +15%' },
  tiamat: { name: 'ティアマトの魔石', effect: '最高レアの出やすさ ×1.5' },
  garuda: { name: 'ガルーダの魔石', effect: 'エディションの出やすさ ×2' },
};

/** Which 魔石 dismantling a family's item yields. */
export const FAMILY_GEM: Record<Family, GemId> = { arms: 'ifrit', arcane: 'leviathan', beast: 'garuda' };
