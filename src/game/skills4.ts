// i18n-check: skip — node text is replaced from skillsEn.ts in English (tests/i18n.test.ts checks it).
// Phase 4 skill nodes: counters for the day's events (白虎, lower left), and new kinds of
// customers and vehicles (青龍, upper right). Positions are grid units with the root at 0,0;
// `node scripts/tree-grid.mjs` prints the layout.
import { icons, seriesIcon } from './catalog';
import { add, atLeast, mul, pow } from './effects';
import { FACTION_KEYS, FACTION_NAME } from './factions';
import type { SkillNode } from './skills';
import { staffNodes } from './skills3';
import { t } from '../i18n';

const node = (n: SkillNode): SkillNode => n;

export const PHASE4_NODES: SkillNode[] = [
  // ---- Cleaner (staff), a row left of 足止め罠
  ...staffNodes({
    role: 'cleaner', x: -3, row: { y: 2, requires: 'trap' }, hireCost: 4000,
    hire: [], hireDesc: t('雨の日の泥や宝箱の散らかりを片付け、霧の日のコインを拾う', 'Cleans up mud on rainy days and litter from chests, and picks up coins on foggy days'),
    up1: { name: t('モップがけ', 'Mopping'), desc: t('清掃係の足の速さ +15%', 'Cleaner speed +15%'), icon: icons.bufAgi, max: 5, effects: [mul('cleanerSpeed', 0.15)] },
    up2: { name: t('玄関マット', 'Doormat'), desc: t('雨の日に泥が持ち込まれる確率 -10%', 'Chance of mud on rainy days -10%'), icon: seriesIcon('Mantle', 1), max: 5, effects: [pow('mudChance', 0.9)] },
    aceDesc: t('足の速さ +40%、コインの価値 +50%', 'Speed +40%, coin value +50%'), ace: [mul('cleanerSpeed', 0.4), mul('coinValue', 0.5)],
  }),

  // ---- 白虎: weather, shop enemies, chests, decisions
  node({ id: 'umbrella', branch: 'byakko', name: '傘立て', desc: '雨の日に泥が持ち込まれる確率 -20%', icon: seriesIcon('Parasol'), x: -3, y: 3, max: 3, baseCost: 400, growth: 2, requires: ['guard'], effects: [pow('mudChance', 0.8)] }),
  node({ id: 'fogLantern', branch: 'byakko', name: '霧払いのランタン', desc: '霧の日の泥棒 -15%、落ちるコインの価値 +20%', icon: seriesIcon('Lantern', 1), x: -4, y: 3, max: 3, baseCost: 800, growth: 2, requires: ['umbrella'], effects: [pow('fogThieves', 0.85), mul('coinValue', 0.2)] }),
  node({ id: 'cryptid', branch: 'byakko', name: 'クリプタイドの守護', desc: 'クリプタイドが店を守り、店に入り込んだエネミーを雷で倒す', icon: seriesIcon('Orb', 2), x: -5, y: 3, max: 1, baseCost: 6000, growth: 1, requires: ['fogLantern'], effects: [atLeast('cryptid', 1)] }),
  node({ id: 'cryptidSpeed', branch: 'byakko', name: '雷の間隔', desc: 'クリプタイドの雷の間隔 -15%', icon: icons.bufInt, x: -6, y: 3, max: 5, baseCost: 3000, growth: 1.7, requires: ['cryptid'], effects: [pow('cryptidInterval', 0.85)] }),
  node({ id: 'storePestBounty', branch: 'byakko', name: '追い払いの報酬', desc: '店のエネミー退治の報酬 +50%', icon: icons.fear, x: -7, y: 3, max: 5, baseCost: 2000, growth: 1.7, requires: ['cryptidSpeed'], effects: [add('storePestBounty', 0.5)] }),
  node({ id: 'chestHunter', branch: 'byakko', name: '宝箱の気配', desc: '宝箱が飛んでくる間隔 -12%', icon: seriesIcon('Compass', 1), x: -2, y: 4, max: 5, baseCost: 600, growth: 1.6, requires: ['ward'], effects: [pow('chestInterval', 0.88)] }),
  node({ id: 'chestValue', branch: 'byakko', name: '宝箱の中身', desc: '宝箱の中身 +25%', icon: seriesIcon('Wallet', 2), x: -3, y: 4, max: 5, baseCost: 1000, growth: 1.7, requires: ['chestHunter'], effects: [mul('chestMult', 0.25)] }),
  node({ id: 'negotiation', branch: 'byakko', name: '値切り交渉', desc: '悪徳商人の買取価格 +4%（店頭価格の）', icon: seriesIcon('Sensu', 2), x: -4, y: 4, max: 5, baseCost: 1500, growth: 1.8, requires: ['chestValue'], effects: [add('merchantRate', 0.04)] }),
  node({ id: 'reform', branch: 'byakko', name: '改心の説得', desc: '捕まえた泥棒が改心を申し出る確率 +10%', icon: seriesIcon('Book', 1), x: -5, y: 4, max: 4, baseCost: 1200, growth: 1.8, requires: ['negotiation'], effects: [add('reformChance', 0.1)] }),
  node({ id: 'regularPay', branch: 'byakko', name: '常連の絆', desc: '常連客（改心した泥棒）の支払い +10%', icon: icons.hp, x: -6, y: 4, max: 5, baseCost: 2500, growth: 1.7, requires: ['reform'], effects: [add('regularPay', 0.1)] }),
  node({ id: 'blessing', branch: 'byakko', name: 'MAI の応援', desc: 'MAI のお手伝い（売上アップ）の時間 +25%', icon: icons.mai, x: -7, y: 4, max: 4, baseCost: 3000, growth: 2, requires: ['regularPay'], effects: [add('blessingPower', 0.25)] }),

  // ---- 青龍: faction regulars (row -1), vehicles (row -2), special customers (row -3)
  ...FACTION_KEYS.map((f, i) =>
    node({
      id: `fav_${f}`, branch: 'seiryu', name: t(`${FACTION_NAME[f]}の常連`, `${FACTION_NAME[f]} Regulars`), desc: t(`${FACTION_NAME[f]}のヒーローの支払い +8%`, `${FACTION_NAME[f]} heroes pay +8%`),
      icon: seriesIcon('Oriflamme', i % 5), x: 5 + i, y: -1, max: 5, baseCost: Math.round(5000 * Math.pow(1.5, i)), growth: 1.6,
      requires: [i === 0 ? 'wordOfMouth' : `fav_${FACTION_KEYS[i - 1]}`], effects: [add(`fav_${f}`, 0.08)],
    }),
  ),
  node({ id: 'festival', branch: 'seiryu', name: '屋台通り', desc: '市場の日の客足 +10%', icon: seriesIcon('Cherry blossom viewing Bento'), x: 10, y: -1, max: 5, baseCost: 20000, growth: 1.7, requires: ['fav_genbu'], effects: [add('festivalCrowd', 0.1)] }),
  node({ id: 'carriage', branch: 'seiryu', name: '乗合馬車', desc: '乗合馬車が 40 秒ごとに客を 4 人まとめて連れてくる', icon: seriesIcon('Horse', 3), x: 5, y: -2, max: 1, baseCost: 8000, growth: 1, requires: ['wordOfMouth'], effects: [atLeast('vehicle', 1)] }),
  node({ id: 'vehicleSize', branch: 'seiryu', name: '大型車両', desc: '乗り物で来る客 +1人', icon: seriesIcon('Two wheeled vehicle', 2), x: 6, y: -2, max: 5, baseCost: 6000, growth: 1.7, requires: ['carriage'], effects: [add('vehicleSize', 1)] }),
  node({ id: 'airship', branch: 'seiryu', name: '飛空艇', desc: '飛空艇が 55 秒ごとに客を 7 人まとめて連れてくる（乗合馬車の代わり）', icon: seriesIcon('Spaceship', 2), x: 7, y: -2, max: 1, baseCost: 60000, growth: 1, requires: ['vehicleSize'], effects: [atLeast('vehicle', 2)] }),
  node({ id: 'vehicleSpeed', branch: 'seiryu', name: '定期便', desc: '乗り物が来る間隔 -10%', icon: seriesIcon('Pocket Watch', 2), x: 8, y: -2, max: 5, baseCost: 20000, growth: 1.7, requires: ['airship'], effects: [pow('vehicleInterval', 0.9)] }),
  node({ id: 'landGate', branch: 'seiryu', name: 'ランドゲート', desc: 'ランドゲートが 70 秒ごとに客を 10 人まとめて連れてくる', icon: seriesIcon('Ferris wheel', 3), x: 9, y: -2, max: 1, baseCost: 500000, growth: 1, requires: ['vehicleSpeed'], effects: [atLeast('vehicle', 3)] }),
  node({ id: 'collectors', branch: 'seiryu', name: 'コレクターの来店', desc: '特定のシリーズを探すコレクター客が来る（見つければ ×2 で買う）。確率 +6%', icon: seriesIcon('Glasses', 1), x: 5, y: -3, max: 5, baseCost: 10000, growth: 1.7, requires: ['carriage'], effects: [add('collectorChance', 0.06)] }),
  node({ id: 'collectorPay', branch: 'seiryu', name: '蒐集家の熱意', desc: 'コレクター客の支払い +0.3倍', icon: seriesIcon('Monocle', 3), x: 6, y: -3, max: 5, baseCost: 12000, growth: 1.7, requires: ['collectors'], effects: [add('collectorPay', 0.3)] }),
  node({ id: 'owner', branch: 'seiryu', name: 'ランドオーナー招待', desc: 'ランドの日以外にもランドオーナーが来る（最高の品を ×3 で買う）。確率 +1%', icon: seriesIcon('Crown', 1), x: 7, y: -3, max: 5, baseCost: 40000, growth: 1.8, requires: ['collectorPay'], effects: [add('ownerChance', 0.01)] }),
  node({ id: 'ownerPay', branch: 'seiryu', name: 'VIP 待遇', desc: 'ランドオーナーの支払い +0.4倍', icon: seriesIcon('Crown', 4), x: 8, y: -3, max: 5, baseCost: 60000, growth: 1.8, requires: ['owner'], effects: [add('ownerPay', 0.4)] }),
  node({ id: 'legend', branch: 'seiryu', name: '伝説の来訪', desc: '伝説のヒーローが来店する確率 +8%/日（いる間は売上 2 倍）', icon: seriesIcon('Oriflamme', 4), x: 9, y: -3, max: 5, baseCost: 150000, growth: 1.9, requires: ['ownerPay'], effects: [add('legendChance', 0.08)] }),
];
