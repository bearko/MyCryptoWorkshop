/**
 * 島づくり（試作）の建物の一覧。絵は public/island/b/<id>/ の rd.png（入口が右下）と lu.png（背面）。
 * 左下・右上はそれぞれを左右反転して描く。数値は試作の当たりで、遊びながら直す。
 */
import { t } from '../i18n';

export type Cat = 'home' | 'food' | 'shop' | 'gear' | 'biz' | 'public' | 'culture' | 'land';
export type Need = 'food' | 'goods' | 'fun' | 'faith' | 'health' | 'safety' | 'edu';
export type Boost = 'tax' | 'industry' | 'tourism' | 'approval' | 'immigration';

export interface Def {
  id: string;
  name: string;
  cat: Cat;
  /** 1 マスか 2 マスか */
  size: 1 | 2;
  /** 絵の高さが 280（2 マスは 340）。足場は 5 段 */
  tall: boolean;
  cost: number;
  /** 建てるのにかかる日数 */
  days: number;
  /** 1 か月の維持費 */
  upkeep: number;
  jobs: number;
  homes: number;
  serve: Partial<Record<Need, number>>;
  /** 人手がそろったときの 1 か月の売上 */
  income: number;
  /** 売上の種類。shop は客の数で、tourism は島の魅力で、industry は人手と後押しで決まる */
  kind: 'none' | 'shop' | 'industry' | 'tourism';
  appeal: number;
  boost: Partial<Record<Boost, number>>;
  /** 建てられるようになる人口 */
  unlock: number;
  /** 海か砂浜に接していないと建てられない */
  coastal?: boolean;
}

type Opt = Partial<Omit<Def, 'id' | 'name' | 'cat'>>;
const D = (id: string, name: string, cat: Cat, o: Opt): Def => ({
  id,
  name,
  cat,
  size: 1,
  tall: false,
  cost: 1000,
  days: 6,
  upkeep: 20,
  jobs: 0,
  homes: 0,
  serve: {},
  income: 0,
  kind: 'none',
  appeal: 0,
  boost: {},
  unlock: 0,
  ...o,
});

const home = (id: string, name: string, homes: number, cost: number, o: Opt = {}) =>
  D(id, name, 'home', { homes, cost, days: 4 + Math.round(cost / 1500), upkeep: Math.round(cost / 200), ...o });
const food = (id: string, name: string, serve: number, income: number, cost: number, unlock = 0, o: Opt = {}) =>
  D(id, name, 'food', { serve: { food: serve }, jobs: 4, income, kind: 'shop', cost, days: 6, upkeep: Math.round(cost / 50), unlock, ...o });
const shop = (id: string, name: string, serve: number, income: number, cost: number, unlock = 0, o: Opt = {}) =>
  D(id, name, 'shop', { serve: { goods: serve }, jobs: 5, income, kind: 'shop', cost, days: 7, upkeep: Math.round(cost / 50), unlock, ...o });
const shrine = (animal: string, land: string, en: string) =>
  D(`shrine_${animal}`, t(`守り神の祠（${land}）`, `Guardian shrine (${en})`), 'land', { serve: { faith: 120 }, cost: 1500, days: 6, upkeep: 15, appeal: 1, unlock: 30 });

export const DEFS: Def[] = [
  // ---------------------------------------------------------------- 住宅
  home('house', t('2 階建ての住宅', 'Two-story house'), 6, 1200),
  home('cottage', t('平屋', 'Cottage'), 4, 900),
  home('garage_house', t('車庫つきの家', 'House with garage'), 6, 1500, { appeal: 0.5 }),
  home('japanese_house', t('和風の家', 'Japanese house'), 6, 1600, { appeal: 1 }),
  home('manor', t('洋館', 'Manor'), 8, 2600, { appeal: 2, unlock: 60 }),
  home('apartment', t('小さなアパート', 'Small apartment'), 18, 3600, { unlock: 40 }),
  home('tower', t('マンション', 'Apartment tower'), 48, 12000, { tall: true, days: 14, unlock: 150 }),
  // ---------------------------------------------------------------- 飲食店
  food('ramen', t('ラーメン屋', 'Ramen shop'), 40, 260, 1800),
  food('sushi', t('寿司屋', 'Sushi bar'), 30, 340, 2600, 20),
  food('bento', t('弁当屋', 'Bento shop'), 50, 200, 1400),
  food('burger', t('ハンバーガー屋', 'Burger diner'), 50, 260, 2000, 10),
  food('cafe', t('カフェ', 'Cafe'), 35, 240, 1800, 0, { appeal: 1 }),
  food('cake', t('ケーキ屋', 'Pastry shop'), 30, 260, 2000, 20, { appeal: 1 }),
  food('bakery', t('パン屋', 'Bakery'), 45, 220, 1600, 10),
  food('restaurant', t('レストラン', 'Restaurant'), 40, 380, 3000, 60, { appeal: 1 }),
  food('izakaya', t('居酒屋', 'Izakaya'), 45, 300, 2200, 30, { serve: { food: 45, fun: 15 } }),
  food('soba', t('そば・うどん屋', 'Noodle house'), 40, 240, 1800, 20),
  food('yakiniku', t('焼肉屋', 'Barbecue house'), 35, 360, 2800, 60),
  food('chinese', t('中華料理店', 'Chinese restaurant'), 45, 320, 2600, 40),
  food('pizza', t('ピザ屋', 'Pizzeria'), 40, 280, 2200, 40),
  food('curry', t('カレー屋', 'Curry house'), 40, 240, 1800, 30),
  food('icecream', t('アイスクリーム屋', 'Ice cream parlor'), 30, 220, 1600, 30, { serve: { food: 30, fun: 10 }, appeal: 1 }),
  food('fruit_parlor', t('フルーツパーラー', 'Fruit parlor'), 30, 300, 2400, 80, { appeal: 1 }),
  food('wine_bar', t('ワインバー', 'Wine bar'), 25, 380, 3000, 120, { serve: { food: 25, fun: 20 }, appeal: 1 }),
  food('food_stalls', t('屋台村', 'Food stalls'), 60, 280, 2000, 50, { serve: { food: 60, fun: 15 }, jobs: 6 }),
  // ---------------------------------------------------------------- 物販
  shop('general_store', t('よろず屋', 'General store'), 60, 260, 2000),
  shop('workshop', t('工房（本店）', 'Workshop'), 40, 420, 3200, 30, { appeal: 2 }),
  shop('jewelry', t('宝飾店', 'Jewelry boutique'), 25, 600, 4500, 150, { appeal: 1 }),
  shop('boutique', t('ブティック', 'Fashion boutique'), 35, 480, 3800, 100, { appeal: 1 }),
  shop('watch', t('時計店', 'Watch shop'), 25, 500, 4000, 120),
  shop('import', t('輸入品店', 'Import store'), 50, 400, 3000, 80),
  shop('greengrocer', t('青果店', 'Greengrocer'), 60, 240, 1600, 10, { serve: { goods: 30, food: 30 } }),
  shop('department', t('デパート', 'Department store'), 320, 2600, 26000, 300, { size: 2, tall: true, jobs: 30, days: 20, appeal: 4 }),
  // ---------------------------------------------------------------- 武器屋・防具屋・道具屋
  D('weapon', t('武器屋', 'Weapon shop'), 'gear', { serve: { goods: 30, safety: 30 }, jobs: 5, income: 480, kind: 'shop', cost: 3600, days: 8, upkeep: 70, appeal: 1, unlock: 80 }),
  D('armor', t('防具屋', 'Armor shop'), 'gear', { serve: { goods: 30, safety: 30 }, jobs: 5, income: 460, kind: 'shop', cost: 3600, days: 8, upkeep: 70, appeal: 1, unlock: 80 }),
  D('item', t('道具屋', 'Item shop'), 'gear', { serve: { goods: 40, health: 30 }, jobs: 5, income: 420, kind: 'shop', cost: 3200, days: 8, upkeep: 60, appeal: 1, unlock: 60 }),
  // ---------------------------------------------------------------- 会社の施設
  D('hq', t('本社ビル', 'Company headquarters'), 'biz', { tall: true, jobs: 60, income: 3200, kind: 'industry', cost: 22000, days: 18, upkeep: 500, appeal: 2, boost: { tax: 0.1 }, unlock: 200 }),
  D('logistics', t('物流拠点', 'Logistics center'), 'biz', { size: 2, jobs: 30, income: 1300, kind: 'industry', cost: 9000, days: 12, upkeep: 200, boost: { industry: 0.1 }, unlock: 80 }),
  D('factory', t('工場', 'Factory'), 'biz', { size: 2, jobs: 50, income: 2200, kind: 'industry', cost: 12000, days: 14, upkeep: 260, appeal: -2, unlock: 50 }),
  D('training', t('研修所', 'Training center'), 'biz', { jobs: 8, cost: 4000, days: 8, upkeep: 80, serve: { edu: 60 }, boost: { industry: 0.1 }, unlock: 80 }),
  D('bank', t('銀行', 'Bank'), 'biz', { jobs: 10, income: 600, kind: 'industry', cost: 6000, days: 10, upkeep: 120, boost: { tax: 0.15 }, unlock: 100 }),
  D('realty', t('不動産屋', 'Real estate office'), 'biz', { jobs: 4, income: 300, kind: 'industry', cost: 2400, days: 6, upkeep: 40, boost: { immigration: 3 }, unlock: 20 }),
  D('media', t('瓦版社', 'Newspaper office'), 'biz', { jobs: 8, income: 300, kind: 'industry', cost: 3500, days: 8, upkeep: 60, boost: { approval: 5 }, unlock: 60 }),
  D('power', t('発電所', 'Power plant'), 'biz', { size: 2, jobs: 20, cost: 14000, days: 16, upkeep: 400, appeal: -2, boost: { industry: 0.25 }, unlock: 120 }),
  D('inn', t('旅館', 'Japanese inn'), 'biz', { jobs: 6, income: 600, kind: 'tourism', cost: 4000, days: 8, upkeep: 60, appeal: 1, unlock: 40 }),
  D('hotel', t('ホテル', 'Hotel'), 'biz', { tall: true, jobs: 20, income: 1900, kind: 'tourism', cost: 16000, days: 16, upkeep: 260, appeal: 1, unlock: 200 }),
  D('trading', t('商社', 'Trading company'), 'biz', { tall: true, jobs: 25, income: 1600, kind: 'industry', cost: 14000, days: 14, upkeep: 220, boost: { tourism: 0.1 }, unlock: 150 }),
  D('harbor', t('港と海運', 'Harbor'), 'biz', { size: 2, jobs: 25, income: 1400, kind: 'industry', cost: 11000, days: 14, upkeep: 180, boost: { immigration: 5, tourism: 0.15 }, unlock: 60, coastal: true }),
  D('survey', t('調査室', 'Survey office'), 'biz', { jobs: 6, cost: 3000, days: 6, upkeep: 60, boost: { industry: 0.05, tourism: 0.05 }, unlock: 100 }),
  D('lab', t('開発室', 'Research lab'), 'biz', { jobs: 12, income: 900, kind: 'industry', cost: 8000, days: 12, upkeep: 160, boost: { industry: 0.1 }, unlock: 250 }),
  D('arcade', t('アーケード', 'Covered arcade'), 'biz', { size: 2, serve: { goods: 120, fun: 40 }, jobs: 12, income: 900, kind: 'shop', cost: 9000, days: 12, upkeep: 160, appeal: 2, unlock: 150 }),
  D('guard', t('警備の詰所', 'Security post'), 'biz', { serve: { safety: 140 }, jobs: 4, cost: 2000, days: 5, upkeep: 50, unlock: 40 }),
  // ---------------------------------------------------------------- 公共
  D('station', t('駅', 'Train station'), 'public', { size: 2, jobs: 10, cost: 15000, days: 16, upkeep: 200, appeal: 3, boost: { immigration: 15, tourism: 0.2 }, unlock: 100 }),
  D('city_hall', t('市役所', 'City hall'), 'public', { size: 2, tall: true, jobs: 20, cost: 20000, days: 18, upkeep: 300, appeal: 2, boost: { approval: 10, tax: 0.1 }, unlock: 150 }),
  D('government', t('政府機関', 'Government office'), 'public', { size: 2, tall: true, jobs: 25, cost: 24000, days: 20, upkeep: 360, boost: { approval: 5, tax: 0.1 }, unlock: 300 }),
  D('assembly', t('地主会の会館', 'Landowners hall'), 'public', { jobs: 4, cost: 3000, days: 7, upkeep: 50, boost: { approval: 3 }, unlock: 50 }),
  D('hospital', t('病院', 'Hospital'), 'public', { size: 2, tall: true, serve: { health: 420 }, jobs: 30, cost: 18000, days: 18, upkeep: 320, unlock: 120 }),
  D('police', t('交番', 'Police box'), 'public', { serve: { safety: 120 }, jobs: 3, cost: 1500, days: 5, upkeep: 40, unlock: 30 }),
  D('park', t('公園', 'Park'), 'public', { serve: { fun: 60 }, cost: 800, days: 4, upkeep: 10, appeal: 2 }),
  // ---------------------------------------------------------------- 地域への投資
  D('rest_area', t('休憩所', 'Rest area'), 'culture', { serve: { fun: 40 }, cost: 600, days: 3, upkeep: 8, appeal: 1 }),
  D('concert_hall', t('ホール', 'Concert hall'), 'culture', { size: 2, serve: { fun: 300 }, jobs: 10, income: 500, kind: 'tourism', cost: 9000, days: 14, upkeep: 160, appeal: 3, unlock: 150 }),
  D('library', t('図書館', 'Library'), 'culture', { serve: { edu: 160 }, jobs: 5, cost: 3000, days: 8, upkeep: 60, appeal: 1, unlock: 50 }),
  D('school', t('学校', 'School'), 'culture', { size: 2, serve: { edu: 420 }, jobs: 15, cost: 10000, days: 14, upkeep: 200, unlock: 100 }),
  D('circus', t('サーカス', 'Circus'), 'culture', { size: 2, serve: { fun: 260 }, jobs: 12, income: 700, kind: 'tourism', cost: 8000, days: 10, upkeep: 140, appeal: 3, unlock: 200 }),
  D('amusement', t('遊園地', 'Amusement park'), 'culture', { size: 2, tall: true, serve: { fun: 620 }, jobs: 25, income: 2200, kind: 'tourism', cost: 30000, days: 22, upkeep: 400, appeal: 6, unlock: 400 }),
  // ---------------------------------------------------------------- ランドの特別な建物と守り神の祠
  D('sea_palace', t('海王の宮殿', 'Sea King palace'), 'land', { size: 2, tall: true, jobs: 20, income: 3200, kind: 'tourism', cost: 60000, days: 30, upkeep: 500, appeal: 12, boost: { approval: 5 }, unlock: 500, coastal: true }),
  D('lighthouse', t('港町の灯台', 'Harbor lighthouse'), 'land', { tall: true, jobs: 2, cost: 5000, days: 10, upkeep: 40, appeal: 3, boost: { tourism: 0.1 }, unlock: 60, coastal: true }),
  D('demon_castle', t('魔王の城', 'Demon King castle'), 'land', { size: 2, tall: true, jobs: 20, income: 3200, kind: 'tourism', cost: 60000, days: 30, upkeep: 500, appeal: 12, boost: { approval: 5 }, unlock: 500 }),
  D('underground', t('地下街の入口', 'Underground mall gate'), 'land', { serve: { goods: 150 }, jobs: 10, income: 900, kind: 'shop', cost: 9000, days: 12, upkeep: 140, appeal: 2, unlock: 250 }),
  D('tiger_estate', t('虎王の館', 'Tiger King estate'), 'land', { size: 2, jobs: 15, income: 2400, kind: 'tourism', cost: 45000, days: 26, upkeep: 400, appeal: 10, boost: { tax: 0.1 }, unlock: 500 }),
  D('dragon_palace', t('龍王の宮殿', 'Dragon King palace'), 'land', { size: 2, tall: true, jobs: 20, income: 3200, kind: 'tourism', cost: 60000, days: 30, upkeep: 500, appeal: 12, boost: { approval: 5 }, unlock: 500 }),
  D('elephant_works', t('象王の大工房', 'Elephant King works'), 'land', { size: 2, tall: true, jobs: 60, income: 4200, kind: 'industry', cost: 60000, days: 30, upkeep: 600, appeal: 8, boost: { industry: 0.2 }, unlock: 500 }),
  D('g9_hall', t('G9 の会議場', 'G9 summit hall'), 'land', { size: 2, tall: true, jobs: 20, income: 2000, kind: 'tourism', cost: 50000, days: 28, upkeep: 450, appeal: 10, boost: { approval: 8 }, unlock: 500 }),
  D('arena', t('大会の闘技場', 'Tournament arena'), 'land', { size: 2, serve: { fun: 400 }, jobs: 20, income: 2400, kind: 'tourism', cost: 36000, days: 24, upkeep: 380, appeal: 8, unlock: 400 }),
  D('radio', t('ラジオ局', 'Radio station'), 'land', { tall: true, jobs: 8, cost: 8000, days: 12, upkeep: 120, appeal: 2, boost: { approval: 6, immigration: 4 }, unlock: 200 }),
  D('cat_manor', t('猫王の館', 'Cat Queen manor'), 'land', { size: 2, jobs: 15, income: 2000, kind: 'tourism', cost: 45000, days: 26, upkeep: 400, appeal: 10, boost: { immigration: 10 }, unlock: 500 }),
  D('pirate_base', t('海賊団の本拠', 'Pirate base'), 'land', { size: 2, jobs: 25, income: 2600, kind: 'tourism', cost: 40000, days: 24, upkeep: 400, appeal: 9, boost: { tourism: 0.2 }, unlock: 450, coastal: true }),
  D('board', t('流星街の掲示板', 'Meteor town board'), 'land', { jobs: 2, cost: 4000, days: 6, upkeep: 30, appeal: 2, boost: { approval: 3 }, unlock: 150 }),
  D('robot_lab', t('巨大ロボの研究所', 'Giant robot lab'), 'land', { size: 2, tall: true, jobs: 40, income: 3600, kind: 'industry', cost: 70000, days: 34, upkeep: 600, appeal: 12, boost: { industry: 0.2 }, unlock: 600 }),
  shrine('turtle', 'Ocean', 'Ocean'),
  shrine('rooster', 'Strawberry', 'Strawberry'),
  shrine('tiger', 'Tangerine', 'Tangerine'),
  shrine('dragon', 'Lime', 'Lime'),
  shrine('elephant', 'Graphite', 'Graphite'),
  shrine('snake', 'Grape', 'Grape'),
  shrine('bull', 'Sage', 'Sage'),
  shrine('dog', 'Blueberry', 'Blueberry'),
  shrine('monkey', 'Ruby', 'Ruby'),
];

export const DEF: Record<string, Def> = Object.fromEntries(DEFS.map((d) => [d.id, d]));

export const CATS: { key: Cat; name: string }[] = [
  { key: 'home', name: t('住宅', 'Homes') },
  { key: 'food', name: t('飲食', 'Food') },
  { key: 'shop', name: t('物販', 'Shops') },
  { key: 'gear', name: t('武器・防具・道具', 'Gear') },
  { key: 'biz', name: t('会社', 'Business') },
  { key: 'public', name: t('公共', 'Public') },
  { key: 'culture', name: t('文化', 'Culture') },
  { key: 'land', name: t('特別', 'Landmarks') },
];

export const NEEDS: { key: Need; name: string; from: number; weight: number }[] = [
  { key: 'food', name: t('食事', 'Food'), from: 0, weight: 0.22 },
  { key: 'goods', name: t('買い物', 'Shopping'), from: 0, weight: 0.14 },
  { key: 'faith', name: t('信仰', 'Faith'), from: 30, weight: 0.08 },
  { key: 'fun', name: t('娯楽', 'Fun'), from: 30, weight: 0.12 },
  { key: 'safety', name: t('治安', 'Safety'), from: 60, weight: 0.1 },
  { key: 'health', name: t('医療', 'Health'), from: 100, weight: 0.1 },
  { key: 'edu', name: t('教育', 'Education'), from: 150, weight: 0.06 },
];

/** 政策：毎月の費用と引き換えに、島全体を後押しする（いくつでも同時に出せる） */
export interface Policy {
  id: string;
  name: string;
  note: string;
  cost: number;
  boost: Partial<Record<Boost, number>>;
  /** 税の倍率（減税なら 1 未満） */
  taxRate?: number;
  unlock: number;
}

export const POLICIES: Policy[] = [
  { id: 'tax_cut', name: t('減税', 'Tax cut'), note: t('税収 −25%・支持 +8', 'Tax −25%, approval +8'), cost: 0, boost: { approval: 8 }, taxRate: 0.75, unlock: 0 },
  { id: 'welcome', name: t('移住の支援', 'Settler support'), note: t('月 400 G・移住 +6', '400 G/mo, arrivals +6'), cost: 400, boost: { immigration: 6 }, unlock: 20 },
  { id: 'tourism', name: t('観光の宣伝', 'Tourism campaign'), note: t('月 600 G・観光の売上 +30%', '600 G/mo, tourism +30%'), cost: 600, boost: { tourism: 0.3 }, unlock: 80 },
  { id: 'festival', name: t('島のお祭り', 'Island festival'), note: t('月 900 G・支持 +6・移住 +2', '900 G/mo, approval +6, arrivals +2'), cost: 900, boost: { approval: 6, immigration: 2 }, unlock: 150 },
  { id: 'industry', name: t('産業の振興', 'Industry drive'), note: t('月 800 G・会社の売上 +15%・支持 −3', '800 G/mo, industry +15%, approval −3'), cost: 800, boost: { industry: 0.15, approval: -3 }, unlock: 100 },
];
