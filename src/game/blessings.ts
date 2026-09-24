import { lands } from './catalog';
import { add, mul, pow, type Effect } from './effects';
import { LINE_IDS } from './lines';
import type { SkillNode } from './skills';
import { t } from '../i18n';

/** Each land's cryptid blessing (per relocation to that land; stacks). */
export const BLESSINGS: Record<string, { name: string; desc: string; effects: Effect[] }> = {
  Ocean: { name: t('潮騒の加護', 'Blessing of the Tide'), desc: t('来客ペース +15%', 'Customer rate +15%'), effects: [mul('spawnRate', 0.15, 'bless')] },
  Strawberry: { name: t('甘露の加護', 'Blessing of Nectar'), desc: t('販売価格 +20%', 'Sale price +20%'), effects: [mul('priceMult', 0.2, 'bless')] },
  Tangerine: { name: t('陽光の加護', 'Blessing of Sunlight'), desc: t('全ラインのクラフト時間 -8%', 'Craft time -8% (all lines)'), effects: LINE_IDS.map((l): Effect => pow(`${l}.craftTime`, 0.92)) },
  Lime: { name: t('若葉の加護', 'Blessing of Young Leaves'), desc: t('研究ポイント +30%、最高レアの出やすさ +10%', 'Research points +30%, top-rarity chance +10%'), effects: [mul('researchRate', 0.3, 'bless'), add('luck', 0.1)] },
  Graphite: { name: t('鋼の加護', 'Blessing of Steel'), desc: t('泥棒の逃げ足 -8%、懸賞金 +50%', 'Thief speed -8%, bounty +50%'), effects: [pow('thiefSpeed', 0.92), add('bountyMult', 0.5)] },
  Grape: { name: t('葡萄酒の加護', 'Blessing of Wine'), desc: t('エディションの出やすさ +20%', 'Edition chance +20%'), effects: [mul('editionLuck', 0.2, 'bless')] },
  Sage: { name: t('賢者の加護', 'Blessing of the Sage'), desc: t('スタッフの足の速さ +15%、補充間隔 -10%', 'Staff speed +15%, restock interval -10%'), effects: [mul('guardSpeed', 0.15, 'bless'), mul('hunterSpeed', 0.15, 'bless'), mul('cleanerSpeed', 0.15, 'bless'), pow('restockTime', 0.9)] },
  Blueberry: { name: t('青空の加護', 'Blessing of the Blue Sky'), desc: t('乗り物で来る客 +2人、乗り物の間隔 -8%', 'Customers per vehicle +2, vehicle interval -8%'), effects: [add('vehicleSize', 2), pow('vehicleInterval', 0.92)] },
  Ruby: { name: t('紅玉の加護', 'Blessing of Ruby'), desc: t('ゴールドダスト +30%、魔石が出る確率 +10%', 'Gold dust +30%, magic stone chance +10%'), effects: [mul('dustMult', 0.3, 'bless'), add('gemChance', 0.1)] },
};

/** Blessings as hidden skill nodes: their level is the number of moves to that land. */
export const BLESSING_NODES: SkillNode[] = lands.map((land, i) => ({
  id: `bless_${land.key}`,
  branch: 'prestige',
  name: t(`${land.name}：${BLESSINGS[land.key].name}`, `${land.name}: ${BLESSINGS[land.key].name}`),
  desc: BLESSINGS[land.key].desc,
  icon: land.cryptid,
  x: 2000 + i,
  y: 2000,
  max: 99,
  baseCost: 0,
  growth: 1,
  requires: [],
  effects: BLESSINGS[land.key].effects,
  hidden: true,
}));

