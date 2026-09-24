// Phase 6: the 移転 branch, paid in Cp from moving to a new land. Its levels survive every move.
// It sits below the research branch.
import { icons, lands, seriesIcon } from './catalog';
import { add, mul, pow, type Effect } from './effects';
import { LINE_IDS } from './lines';
import type { SkillNode } from './skills';
import { staffNodes } from './skills3';

const P = (n: Omit<SkillNode, 'branch' | 'currency' | 'growth'> & { growth?: number }): SkillNode => ({ growth: 1.5, ...n, branch: 'prestige', currency: 'cp' });

export const PHASE6_NODES: SkillNode[] = [
  // Charity clerk (staff, paid in GUM): a row left of the cleaner, once 寄付の心得 is learned.
  ...staffNodes({
    role: 'charity', x: -7, row: { y: 2, requires: 'hire_cleaner', requiresAll: ['charityUnlock'] }, hireCost: 20000,
    hire: [], hireDesc: '閉店時に倉庫の売れ残り（安い順に 5 個）を寄付して名声を得る',
    up1: { name: 'チャリティ箱', desc: '寄付する数 +5個', icon: seriesIcon('Wallet', 1), max: 5, effects: [add('charityLoad', 5)] },
    up2: { name: '慈善家の輪', desc: '寄付で得る名声 +20%', icon: icons.hp, max: 5, effects: [mul('fameMult', 0.2)] },
    aceDesc: '寄付で得る名声 +100%', ace: [mul('fameMult', 1)],
  }),
  P({ id: 'relocation', name: '移転の心得', desc: '移転の特典の入口。Cp（クリア後にランドを移転すると手に入る）で習得する。販売価格 +10%', icon: lands[0].cryptid, x: 7, y: 11, max: 1, baseCost: 1, growth: 1, requires: [], effects: [mul('priceMult', 0.1, 'prestige')] }),
  P({ id: 'startGum', name: '移転資金', desc: '次の周回を 1,000 → 10万 → 1,000万 → 10億 GUM から始める', icon: icons.gum, x: 8, y: 10, max: 4, baseCost: 2, growth: 2, requires: ['relocation'], effects: [add('startGum', 1)] }),
  P({ id: 'oldShop', name: '老舗の味', desc: '販売価格 +25%', icon: icons.emblem, x: 8, y: 11, max: 10, baseCost: 2, requires: ['relocation'], effects: [mul('priceMult', 0.25, 'prestige')] }),
  P({ id: 'craftsman', name: '熟練の職人', desc: '全ラインのクラフト時間 -10%', icon: icons.bufPhy, x: 8, y: 12, max: 5, baseCost: 3, requires: ['relocation'], effects: LINE_IDS.map((l): Effect => pow(`${l}.craftTime`, 0.9)) }),
  P({ id: 'keepRecipes', name: '引き継ぎのレシピ帳', desc: '移転しても最初のレシピ 5 つを持っていく', icon: seriesIcon('Book', 4), x: 9, y: 10, max: 4, baseCost: 4, growth: 2, requires: ['startGum'], effects: [add('keepRecipes', 1)] }),
  P({ id: 'longQueue', name: '行列のできる店', desc: '来客ペース +15%', icon: icons.bufAgi, x: 9, y: 11, max: 5, baseCost: 3, requires: ['oldShop'], effects: [mul('spawnRate', 0.15, 'prestige')] }),
  P({ id: 'dawn', name: '夜明けの開店', desc: '1日の営業時間 +6秒', icon: icons.sleep, x: 9, y: 12, max: 5, baseCost: 2, requires: ['craftsman'], effects: [add('dayLength', 6)] }),
  P({ id: 'cpBoost', name: '名声の器', desc: '移転で得る Cp +20%', icon: icons.cp, x: 10, y: 10, max: 5, baseCost: 5, growth: 1.6, requires: ['keepRecipes'], effects: [mul('cpMult', 0.2)] }),
  P({ id: 'memory', name: '図鑑の記憶', desc: '図鑑1種あたりの価格ボーナス +0.05%', icon: seriesIcon('Moai', 2), x: 10, y: 11, max: 4, baseCost: 4, growth: 1.6, requires: ['longQueue'], effects: [add('collectionBonus', 0.0005)] }),
  P({ id: 'scholar', name: '研究の蓄積', desc: '研究ポイント +50%', icon: icons.int, x: 10, y: 12, max: 5, baseCost: 3, requires: ['dawn'], effects: [mul('researchRate', 0.5, 'prestige')] }),
  P({ id: 'charityUnlock', name: '寄付の心得', desc: '「寄付係」を雇えるようになる（売れ残りを寄付して名声 → Cp）', icon: seriesIcon('Wallet', 3), x: 11, y: 10, max: 1, baseCost: 3, growth: 1, requires: ['cpBoost'], effects: [add('charity', 1)] }),
  P({ id: 'autoBuyer', name: '番頭', desc: '閉店後、GUM のスキルを安い順に自動で習得する（メニューで切り替え）', icon: seriesIcon('Pocket Watch', 3), x: 11, y: 11, max: 1, baseCost: 6, growth: 1, requires: ['memory'], effects: [add('autoBuyer', 1)] }),
  P({ id: 'raidReward', name: '海賊討伐の報奨', desc: 'レイドを撃退したときの報酬 +50%', icon: seriesIcon('Ship', 4), x: 11, y: 12, max: 3, baseCost: 4, growth: 1.6, requires: ['scholar'], effects: [mul('raidReward', 0.5)] }),
];
