import type { FactionKey } from './effects';

export const FACTION_KEYS: FactionKey[] = ['suzaku', 'seiryu', 'kouryu', 'byakko', 'genbu'];

/** Heroes' faction names in the asset database → stat keys. */
export const FACTION_BY_NAME: Record<string, FactionKey> = {
  朱雀: 'suzaku',
  青龍: 'seiryu',
  黄竜: 'kouryu',
  白虎: 'byakko',
  玄武: 'genbu',
};

export const FACTION_NAME: Record<FactionKey, string> = { suzaku: '朱雀', seiryu: '青龍', kouryu: '黄竜', byakko: '白虎', genbu: '玄武' };
