import { dailyLabel } from '../game/achievements';
import { series } from '../game/catalog';
import { orderHero, orderLabel } from '../game/orders';
import type { SaveData } from '../game/save';
import { computeStats } from '../game/stats';
import { t } from '../i18n';
import { h, icon } from './dom';

/** Today's orders (who comes for what), for the shop screen before opening. */
export function ordersList(save: SaveData): HTMLElement | null {
  const orders = save.orders;
  if (!orders.length) return null;
  const pay = computeStats(save.levels).orderPay;
  return h(
    'div.orders',
    {},
    h('h3', {}, t(`注文（${orders.length}件）`, `Orders (${orders.length})`)),
    ...orders.map((o) => {
      const hero = orderHero(o);
      return h(
        'div.order-row',
        {},
        icon(hero.image, 'px'),
        h('div', {}, h('b', {}, hero.name), h('span', {}, t(`${orderLabel(o)} を ×${pay} で買いに来る`, `Wants: ${orderLabel(o)} (pays ×${pay})`))),
        icon(series[o.series].items[o.minRarity].image, 'px'),
        h('small', {}, o.days > 1 ? t(`あと${o.days}日`, `${o.days} days left`) : t('今日まで', 'Due today')),
      );
    }),
  );
}

/** The day's requests (each pays an emblem), for the shop screen before opening. */
export function dailiesList(save: SaveData): HTMLElement | null {
  if (!save.dailies.length) return null;
  return h(
    'div.dailies',
    {},
    h('h3', {}, t('デイリー依頼（達成でエンブレム）', 'Daily requests (earn emblems)')),
    ...save.dailies.map((d) => h('div.daily-row', {}, h('span', {}, dailyLabel(d)), h('b', {}, '+1'))),
  );
}
