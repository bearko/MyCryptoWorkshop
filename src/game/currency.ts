import { icons } from './catalog';
import type { SaveData } from './save';

/** What skill nodes are paid with. */
export type Currency = 'gum' | 'dust' | 'research';

export const CURRENCIES: Record<Currency, { name: string; icon: string }> = {
  gum: { name: 'GUM', icon: icons.gum },
  dust: { name: 'ダスト', icon: icons.dust },
  research: { name: '研究pt', icon: icons.int },
};

export function balanceOf(save: SaveData, currency: Currency): number {
  if (currency === 'dust') return save.resources.dust;
  if (currency === 'research') return save.resources.research;
  return save.gum;
}

export function addTo(save: SaveData, currency: Currency, amount: number): void {
  if (currency === 'dust') save.resources.dust += amount;
  else if (currency === 'research') save.resources.research += amount;
  else save.gum += amount;
}
