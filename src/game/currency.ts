import { icons } from './catalog';
import type { SaveData } from './save';
import { t } from '../i18n';

/** What skill nodes are paid with. */
export type Currency = 'gum' | 'dust' | 'research' | 'emblem' | 'cp';

export const CURRENCIES: Record<Currency, { name: string; icon: string }> = {
  gum: { name: 'GUM', icon: icons.gum },
  dust: { name: t('ダスト', 'Dust'), icon: icons.dust },
  research: { name: t('研究pt', 'RP'), icon: icons.int },
  emblem: { name: t('エンブレム', 'Emblems'), icon: icons.emblem },
  cp: { name: 'Cp', icon: icons.cp },
};

export function balanceOf(save: SaveData, currency: Currency): number {
  if (currency === 'dust') return save.resources.dust;
  if (currency === 'research') return save.resources.research;
  if (currency === 'emblem') return save.resources.emblem;
  if (currency === 'cp') return save.prestige.cp;
  return save.gum;
}

export function addTo(save: SaveData, currency: Currency, amount: number): void {
  if (currency === 'dust') save.resources.dust += amount;
  else if (currency === 'research') save.resources.research += amount;
  else if (currency === 'emblem') save.resources.emblem += amount;
  else if (currency === 'cp') save.prestige.cp += amount;
  else save.gum += amount;
}
