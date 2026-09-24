// Phase 3 skill nodes: shop staff, facilities, sales automation and research.
// Positions (grid units, root at 0,0): staff hang below the 黄竜 column (hires on row 7, their
// upgrades below), facilities run right from 団体客 on row 1, research sits bottom-right.
import { icons, seriesIcon } from './catalog';
import { add, atLeast, mul, pow, type Effect } from './effects';
import { LINE_IDS } from './lines';
import type { SkillNode } from './skills';
import { ROLES, staffHero, type StaffRole } from './staff';

export interface StaffPlan {
  role: StaffRole;
  /** Column of the role (its hire node sits on row 7). */
  x: number;
  /** Laid out as a row going left from (x, y) instead of a column (and what the hire requires). */
  row?: { y: number; requires: string };
  hireCost: number;
  hire: Effect[];
  hireDesc: string;
  up1: { name: string; desc: string; icon: string; max: number; effects: Effect[] };
  up2: { name: string; desc: string; icon: string; max: number; effects: Effect[] };
  aceDesc: string;
  ace: Effect[];
}

// Hires run outward from the centre in the order they are expected to be bought.
const STAFF: StaffPlan[] = [
  {
    role: 'stocker', x: 0, hireCost: 10000,
    hire: [pow('restockTime', 0.5)], hireDesc: '棚への補充間隔 -50%',
    up1: { name: '品出しの手際', desc: '棚への補充間隔 -15%', icon: icons.bufAgi, max: 5, effects: [pow('restockTime', 0.85)] },
    up2: { name: '台車', desc: '倉庫の容量 +2', icon: seriesIcon('Chair'), max: 5, effects: [add('storageCap', 2)] },
    aceDesc: '補充間隔 -40%、倉庫の容量 +5', ace: [pow('restockTime', 0.6), add('storageCap', 5)],
  },
  {
    role: 'host', x: 1, hireCost: 30000,
    hire: [pow('browseTime', 0.7), add('patience', 1.5)], hireDesc: '客が品を選ぶ時間 -30%、棚の前で待つ時間 +1.5秒',
    up1: { name: 'おもてなしの心', desc: '棚とレジで待つ時間 +1秒', icon: icons.hp, max: 5, effects: [add('patience', 1), add('queuePatience', 1)] },
    up2: { name: '道案内', desc: '客の移動速度 +6%', icon: seriesIcon('Compass'), max: 5, effects: [mul('walkSpeed', 0.06)] },
    aceDesc: '品を選ぶ時間 -40%、来客ペース +5%', ace: [pow('browseTime', 0.6), mul('spawnRate', 0.05)],
  },
  {
    role: 'promoter', x: -1, hireCost: 50000,
    hire: [mul('spawnRate', 0.15)], hireDesc: '来客ペース +15%',
    up1: { name: 'チラシ配り', desc: '来客ペース +3%', icon: seriesIcon('Scrolls'), max: 10, effects: [mul('spawnRate', 0.03)] },
    up2: { name: '名調子', desc: '団体客の確率 +4%', icon: seriesIcon('Horn'), max: 5, effects: [add('groupChance', 0.04)] },
    aceDesc: '来客ペース +20%', ace: [mul('spawnRate', 0.2)],
  },
  {
    role: 'consultant', x: 2, hireCost: 90000,
    hire: [add('upsell', 0.25), mul('priceMult', 0.05)], hireDesc: '高い品を勧める確率 +25%、販売価格 +5%',
    up1: { name: '話術', desc: '高い品を勧める確率 +5%', icon: icons.bufInt, max: 5, effects: [add('upsell', 0.05)] },
    up2: { name: '心づけ', desc: 'チップの確率 +4%', icon: seriesIcon('Wallet'), max: 5, effects: [add('tipChance', 0.04)] },
    aceDesc: '販売価格 +10%', ace: [mul('priceMult', 0.1)],
  },
  {
    role: 'guard', x: -2, hireCost: 70000,
    hire: [], hireDesc: '泥棒を追いかけて捕まえる',
    up1: { name: '健脚', desc: '警備係の足の速さ +10%', icon: icons.bufAgi, max: 5, effects: [mul('guardSpeed', 0.1)] },
    up2: { name: '捕り物の手柄', desc: '懸賞金 +30%', icon: seriesIcon('Whip'), max: 5, effects: [add('bountyMult', 0.3)] },
    aceDesc: '足の速さ +30%、泥棒の逃げ足 -15%', ace: [mul('guardSpeed', 0.3), pow('thiefSpeed', 0.85)],
  },
  {
    role: 'accountant', x: 3, hireCost: 250000,
    hire: [add('closingBonus', 0.03)], hireDesc: '閉店時に売上の3%をボーナスとして上乗せ',
    up1: { name: '複式簿記', desc: '閉店時の売上ボーナス +1%', icon: seriesIcon('Book'), max: 5, effects: [add('closingBonus', 0.01)] },
    up2: { name: 'そろばん', desc: '会計時間 -5%', icon: seriesIcon('Pocket Watch'), max: 5, effects: [pow('cashierTime', 0.95)] },
    aceDesc: '閉店時の売上ボーナス +5%', ace: [add('closingBonus', 0.05)],
  },
  {
    role: 'exterminator', x: -3, hireCost: 150000,
    hire: [], hireDesc: '工房のエネミーを追い払う',
    up1: { name: '虫取り網', desc: '退治係の足の速さ +15%', icon: icons.bufAgi, max: 5, effects: [mul('hunterSpeed', 0.15)] },
    up2: { name: '標本づくり', desc: '退治報酬 +50%', icon: seriesIcon('Wet Specimen'), max: 5, effects: [add('pestBountyMult', 0.5)] },
    aceDesc: '足の速さ +30%、エネミーの出現間隔 +30%', ace: [mul('hunterSpeed', 0.3), add('pestInterval', 0.3)],
  },
  {
    role: 'appraiser', x: 4, hireCost: 800000,
    hire: [mul('editionLuck', 0.2, 'appraisal')], hireDesc: 'エディションの出やすさ +20%',
    up1: { name: 'ルーペ', desc: 'エディションの出やすさ +5%', icon: seriesIcon('Monocle'), max: 5, effects: [mul('editionLuck', 0.05, 'appraisal')] },
    up2: { name: '審美眼', desc: '最高レアの出やすさ +10%（全ライン）', icon: seriesIcon('Glasses'), max: 5, effects: [add('luck', 0.1)] },
    aceDesc: 'エディションの出やすさ +30%、「真」の確率 +2%', ace: [mul('editionLuck', 0.3, 'appraisal'), add('shinChance', 0.02)],
  },
  {
    role: 'delivery', x: -4, hireCost: 400000,
    hire: [pow('marketInterval', 0.7), add('marketRate', 0.05)], hireDesc: 'マーケット出品の間隔 -30%、買取価格 +5%',
    up1: { name: '早馬', desc: '出品の間隔 -10%', icon: seriesIcon('Horse', 2), max: 5, effects: [pow('marketInterval', 0.9)] },
    up2: { name: '丁寧な梱包', desc: 'マーケットの買取価格 +2%', icon: seriesIcon('Ribbon'), max: 5, effects: [add('marketRate', 0.02)] },
    aceDesc: 'マーケットの買取価格 +10%', ace: [add('marketRate', 0.1)],
  },
  {
    role: 'researcher', x: 5, hireCost: 2000000,
    hire: [add('researchRate', 1)], hireDesc: '研究ポイントを 1分に1pt 生み出す',
    up1: { name: '研究費', desc: '研究ポイント +0.5/分', icon: seriesIcon('Astronomical Model'), max: 10, effects: [add('researchRate', 0.5)] },
    up2: { name: '学会発表', desc: '研究ポイント +10%', icon: seriesIcon('Scrolls', 3), max: 5, effects: [mul('researchRate', 0.1)] },
    aceDesc: '研究ポイント +50%', ace: [mul('researchRate', 0.5)],
  },
  {
    role: 'peddler', x: -5, hireCost: 1200000,
    hire: [], hireDesc: '倉庫の品を持って町へ売りに行く（売値 80%）',
    up1: { name: '大きな背負子', desc: '行商で持ち出す数 +1', icon: seriesIcon('Mantle'), max: 4, effects: [add('peddlerLoad', 1)] },
    up2: { name: '近道', desc: '行商の往復時間 -10%', icon: seriesIcon('Boots'), max: 5, effects: [pow('peddlerTrip', 0.9)] },
    aceDesc: '行商の売値 +30%', ace: [add('peddlerRate', 0.3)],
  },
];

const HIRE_ROW = 7;

export function staffNodes(plan: StaffPlan): SkillNode[] {
  const { role, x, row } = plan;
  // Position of the k-th node of the chain (hire, upgrade 1, upgrade 2, ace).
  const at = (k: number) => (row ? { x: x - k, y: row.y } : { x, y: HIRE_ROW + k });
  const { job, work } = ROLES[role];
  const first = staffHero(role, 1);
  const ace = staffHero(role, 2);
  // Each hire requires the one next to it, closer to the centre column.
  const neighbour = row ? row.requires : x === 0 ? 'storeHub' : `hire_${STAFF.find((p) => p.x === (x > 0 ? x - 1 : x + 1))!.role}`;
  const cost = plan.hireCost;
  return [
    {
      id: `hire_${role}`, branch: 'store', name: `${job}：${first.name}`,
      desc: `${first.name}を${job}として雇う。${work}。${plan.hireDesc}`,
      icon: first.image, ...at(0), max: 1, baseCost: cost, growth: 1, requires: [neighbour],
      effects: [atLeast(`staff_${role}`, 1), ...plan.hire],
    },
    {
      id: `${role}_1`, branch: 'store', name: plan.up1.name, desc: `${job}: ${plan.up1.desc}`, icon: plan.up1.icon,
      ...at(1), max: plan.up1.max, baseCost: Math.round(cost * 0.4), growth: 1.8, requires: [`hire_${role}`], effects: plan.up1.effects,
    },
    {
      id: `${role}_2`, branch: 'store', name: plan.up2.name, desc: `${job}: ${plan.up2.desc}`, icon: plan.up2.icon,
      ...at(2), max: plan.up2.max, baseCost: Math.round(cost * 0.6), growth: 1.9, requires: [`${role}_1`], effects: plan.up2.effects,
    },
    {
      id: `ace_${role}`, branch: 'store', name: `ヒーロー雇用：${ace.name}`,
      desc: `${job}を${ace.name}に任せる。パッシブ「${ace.passive}」: ${plan.aceDesc}`,
      icon: ace.image, ...at(3), max: 1, baseCost: cost * 25, growth: 1, requires: [`${role}_2`],
      effects: [atLeast(`staff_${role}`, 2), ...plan.ace],
    },
  ];
}

export const PHASE3_NODES: SkillNode[] = [
  // ---- Staff (below 黄竜)
  {
    id: 'storeHub', branch: 'store', name: '店舗経営', desc: 'スタッフを雇えるようになる。店の格が上がり販売価格 +5%',
    icon: seriesIcon('Crown'), x: 0, y: 6, max: 1, baseCost: 8000, growth: 1, requires: ['brand'], effects: [mul('priceMult', 0.05)],
  },
  ...STAFF.flatMap(staffNodes),

  // ---- Sales automation (黄竜)
  { id: 'autoRegister', branch: 'kouryu', name: '自動レジ', desc: 'セルフレジを1台置く（会計はクリスくんの1.6倍かかる）', icon: seriesIcon('Music Box'), x: 1, y: 5, max: 2, baseCost: 8000, growth: 5, requires: ['register'], effects: [add('autoRegisters', 1)] },
  { id: 'batch', branch: 'kouryu', name: 'まとめ会計', desc: '8%の確率で、会計のついでに次の客も会計する', icon: seriesIcon('Wallet', 2), x: 2, y: 5, max: 5, baseCost: 10000, growth: 1.7, requires: ['autoRegister'], effects: [add('batchChance', 0.08)] },
  { id: 'market', branch: 'kouryu', name: 'マーケット出品', desc: '棚が埋まっている間、倉庫の余りを1個ずつ通販で売る（買取は店頭価格の40%）', icon: seriesIcon('Ship'), x: -1, y: 5, max: 1, baseCost: 6000, growth: 1, requires: ['register'], effects: [atLeast('market', 1)] },
  { id: 'marketSpeed', branch: 'kouryu', name: '出品の段取り', desc: '出品の間隔 -10%', icon: icons.bufAgi, x: -2, y: 5, max: 5, baseCost: 5000, growth: 1.6, requires: ['market'], effects: [pow('marketInterval', 0.9)] },
  { id: 'marketRate', branch: 'kouryu', name: '相場の読み', desc: 'マーケットの買取価格 +3%', icon: seriesIcon('Compass', 2), x: -3, y: 5, max: 5, baseCost: 8000, growth: 1.7, requires: ['marketSpeed'], effects: [add('marketRate', 0.03)] },

  // ---- Facilities (right of 団体客)
  { id: 'decor', branch: 'store', name: '内装工事', desc: '店の床に設備を置けるようになる。来客ペース +5%', icon: seriesIcon('Chair', 2), x: 4, y: 1, max: 1, baseCost: 3000, growth: 1, requires: ['group'], effects: [mul('spawnRate', 0.05)] },
  { id: 'rug', branch: 'store', name: '高級絨毯', desc: '客が品を選ぶ時間 -8%、棚の前で待つ時間 +0.4秒', icon: seriesIcon('Mantle', 2), x: 5, y: 1, max: 5, baseCost: 4000, growth: 1.7, requires: ['decor'], effects: [add('rug', 1), pow('browseTime', 0.92), add('patience', 0.4)] },
  { id: 'potionStand', branch: 'store', name: 'ポーション配布台', desc: '入口で無料のポーションを配る。客の移動速度 +8%', icon: seriesIcon('Goblet'), x: 6, y: 1, max: 5, baseCost: 7000, growth: 1.7, requires: ['rug'], effects: [atLeast('potionStand', 1), mul('walkSpeed', 0.08)] },
  { id: 'potionTaste', branch: 'store', name: 'ポーションの味', desc: '棚とレジで待つ時間 +0.5秒', icon: seriesIcon('Apple'), x: 6, y: 0, max: 5, baseCost: 9000, growth: 1.7, requires: ['potionStand'], effects: [add('patience', 0.5), add('queuePatience', 0.5)] },
  { id: 'potionBar', branch: 'store', name: 'ポーションバー', desc: '買い物を終えた客の6%が一杯飲んでいく（買い物の20%）', icon: seriesIcon('Sake'), x: 7, y: 1, max: 5, baseCost: 12000, growth: 1.7, requires: ['potionStand'], effects: [add('barChance', 0.06)] },
  { id: 'barMenu', branch: 'store', name: '新メニュー', desc: 'ポーション1杯の値段 +3%（買い物の）', icon: seriesIcon('Pancake'), x: 7, y: 0, max: 5, baseCost: 16000, growth: 1.7, requires: ['potionBar'], effects: [add('barPrice', 0.03)] },
  { id: 'trial', branch: 'store', name: '試し斬り場', desc: '買い物を終えた客の5%が買った装備を試していく（買い物の25%）', icon: seriesIcon('Enhanced Sword'), x: 8, y: 1, max: 5, baseCost: 40000, growth: 1.8, requires: ['potionBar'], effects: [add('trialChance', 0.05)] },
  { id: 'trialFee', branch: 'store', name: '試し斬り料', desc: '試し斬り料 +3%（買い物の）', icon: seriesIcon('Katana', 2), x: 8, y: 0, max: 5, baseCost: 60000, growth: 1.8, requires: ['trial'], effects: [add('trialFee', 0.03)] },
  { id: 'showcase', branch: 'store', name: 'ショーケース', desc: 'Rare 以上・エディション品を飾る特別な棚 +1枠（価格 ×1.5）', icon: seriesIcon('Crown', 2), x: 9, y: 1, max: 4, baseCost: 150000, growth: 3, requires: ['trial'], effects: [add('showcaseSlots', 1)] },
  { id: 'showcaseLight', branch: 'store', name: 'ショーケースの照明', desc: 'ショーケースの価格 +0.1倍', icon: seriesIcon('Lantern'), x: 9, y: 0, max: 5, baseCost: 300000, growth: 2, requires: ['showcase'], effects: [add('showcaseMult', 0.1)] },

  // ---- Research (paid with research points, bottom right)
  { id: 'lab', branch: 'research', name: '研究室', desc: '研究ブランチを開く。研究ポイント +0.5/分', icon: seriesIcon('Astronomical Model', 2), x: 6, y: 7, max: 1, baseCost: 3, growth: 1, requires: ['hire_researcher'], effects: [add('researchRate', 0.5)], currency: 'research' },
  { id: 'rsEconomy', branch: 'research', name: '経営学', desc: '販売価格 +4%', icon: seriesIcon('Wallet', 3), x: 7, y: 7, max: 5, baseCost: 8, growth: 1.7, requires: ['lab'], effects: [mul('priceMult', 0.04)], currency: 'research' },
  { id: 'rsAlchemy', branch: 'research', name: '錬金術研究', desc: '全ラインのクラフト時間 -5%', icon: seriesIcon('Orb'), x: 7, y: 6, max: 5, baseCost: 6, growth: 1.6, requires: ['lab'], effects: LINE_IDS.map((l) => pow(`${l}.craftTime`, 0.95)), currency: 'research' },
  { id: 'rsPsychology', branch: 'research', name: '心理学', desc: '棚とレジで待つ時間 +1秒、高い品が選ばれる確率 +3%', icon: seriesIcon('Mirror'), x: 7, y: 8, max: 5, baseCost: 5, growth: 1.6, requires: ['lab'], effects: [add('patience', 1), add('queuePatience', 1), add('upsell', 0.03)], currency: 'research' },
  { id: 'rsStatistics', branch: 'research', name: '統計学', desc: '最高レアの出やすさ +15%（全ライン）', icon: seriesIcon('Book', 3), x: 8, y: 6, max: 5, baseCost: 8, growth: 1.6, requires: ['rsAlchemy'], effects: [add('luck', 0.15)], currency: 'research' },
  { id: 'rsMetallurgy', branch: 'research', name: '冶金学', desc: 'エディションの出やすさ +8%', icon: seriesIcon('Hammer', 3), x: 8, y: 7, max: 5, baseCost: 16, growth: 1.7, requires: ['rsEconomy'], effects: [mul('editionLuck', 0.08, 'appraisal')], currency: 'research' },
  { id: 'rsLogistics', branch: 'research', name: '物流学', desc: '倉庫の容量 +2、棚への補充間隔 -8%', icon: seriesIcon('Ship', 2), x: 8, y: 8, max: 5, baseCost: 8, growth: 1.6, requires: ['rsPsychology'], effects: [add('storageCap', 2), pow('restockTime', 0.92)], currency: 'research' },
  { id: 'rsAstronomy', branch: 'research', name: '天文学', desc: '1日の営業時間 +4秒', icon: seriesIcon('Astronomical Model', 4), x: 9, y: 6, max: 5, baseCost: 15, growth: 1.6, requires: ['rsStatistics'], effects: [add('dayLength', 4)], currency: 'research' },
  { id: 'rsEconomics', branch: 'research', name: '経済学', desc: '閉店時の売上ボーナス +1%、マーケットの買取価格 +2%', icon: seriesIcon('Wallet', 4), x: 9, y: 7, max: 5, baseCost: 20, growth: 1.7, requires: ['rsMetallurgy'], effects: [add('closingBonus', 0.01), add('marketRate', 0.02)], currency: 'research' },
  { id: 'rsSecurity', branch: 'research', name: '防犯学', desc: '泥棒の逃げ足 -8%、警備係の足の速さ +8%', icon: seriesIcon('Shield', 3), x: 9, y: 8, max: 5, baseCost: 10, growth: 1.6, requires: ['rsLogistics'], effects: [pow('thiefSpeed', 0.92), mul('guardSpeed', 0.08)], currency: 'research' },
  { id: 'rsBiology', branch: 'research', name: '生物学', desc: 'カプセルの最高レアの出やすさ +20%', icon: seriesIcon('Ammonite', 3), x: 10, y: 6, max: 5, baseCost: 15, growth: 1.6, requires: ['rsAstronomy'], effects: [add('capsule.luck', 0.2)], currency: 'research' },
  { id: 'rsArchaeology', branch: 'research', name: '考古学', desc: '図鑑1種あたりの価格ボーナス +0.1%', icon: seriesIcon('Moai'), x: 10, y: 7, max: 5, baseCost: 15, growth: 1.6, requires: ['rsEconomics'], effects: [add('collectionBonus', 0.001)], currency: 'research' },
  { id: 'rsAutomation', branch: 'research', name: '自動化理論', desc: '自動レジ +1台', icon: seriesIcon('Combined Robots'), x: 10, y: 8, max: 1, baseCost: 60, growth: 1, requires: ['rsSecurity'], effects: [add('autoRegisters', 1)], currency: 'research' },
  { id: 'rsGrandTheory', branch: 'research', name: '大統一理論', desc: '販売価格 +25%', icon: seriesIcon('Orb', 4), x: 11, y: 7, max: 1, baseCost: 400, growth: 1, requires: ['rsArchaeology'], effects: [mul('priceMult', 0.25)], currency: 'research' },
];
