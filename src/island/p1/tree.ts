/**
 * スキルツリー v2（引っぱって動かせる木）。真ん中の「本社」から、事業の領域ごとに 8 本の枝がのびる：
 *   左 = ① 調達・左上 = 技・上 = ② 製造・右上 = ③ 物流・右 = システム・右下 = ④ 販売・下 = 経営・左下 = 人材。
 * 内側（Common）の段のさらに外へ、ランクごとの外周（Uncommon・Rare・Epic・Legendary）が同心円で広がる。
 * 外周は、そのランクのセクタに出店したあと、はじめてツリーを開いたときの演出で開く（Flags.rings）。
 * 2 区分：研究パネル（RP で開く・レベルなし）は四角（縁は枝の色）、お金パネル（資金で開く・Lv1〜5）は菱形（四角を 45° 回す。縁は金。絵と文字は傾けない）。
 * 形で見分けられるので、色だけに頼らない。大きめの研究パネル（以前の ✨）は枝の根もとの近くに二重の縁の四角で。線は「先に要るスキル」から引く（無ければ枝の根もと）。
 * docs/ISLAND_PHASE1.md「スキルツリー」。
 */
import { t } from '../../i18n';
import { assetUrl } from '../../render/images';
import { TIER_NAME } from './company';
import { BRANCHES, SKILL, SKILLS, TIERS, anyOfMet, fmtShown, isResearch, maxLv, rpCost, shownAt, shownOf, type Branch, type FxKind, type Mat, type Skill, type Sku, type Tier } from './data';
import { affordableSkills, bestSkillMove, has, hqOpen, learn, LEARNABLE, levelLock, levelUp, lvOf, nextLevelCost, openHQ, openRing, ringOpen, ringsDue, skillLock, skillTier, trainDays, trainingOf, trainees, type P1State } from './model';
import { after, mineTip, open, type Ctx } from './screens';
import { pickHero } from './heroui';
import { BOUNDS, HUBPOS, LABEL_A, LAYOUT, OUTER, POS, R0, RING_EDGE, RING_OUT, STEP, UNIT, polar } from './treelayout';
import { bar, btn, h, heroIcon, heroName, matIcon, money, plain, rich, skuIcon } from './ui';

/** ランドセクタの絵（はじまりの国 Lime） */
const TIER_IMG: Record<Tier, string> = { C: '04_Lime_1_Common', U: '04_Lime_2_Uncommon', R: '04_Lime_3_Rare', E: '04_Lime_4_Epic', L: '04_Lime_5_Legendary' };
const tierImg = (tier: Tier) => assetUrl(`mch/Image/LandSectors/${TIER_IMG[tier]}.png`);
const tierArea = (tier: Tier) => t(`${TIER_NAME[tier]} エリア`, `${TIER_NAME[tier]} area`);

/** パネルの絵：建物（b）・エクステ（sku）・素材（mat）・ヒーロー（hero）・絵文字（仮。docs/ISLAND_ART_TODO.md） */
const ICON: Record<string, { b?: string; sku?: Sku; mat?: Mat; hero?: number; emoji?: string }> = {
  host: { b: 'hotel' },
  display: { b: 'greengrocer' },
  vmd: { b: 'department' },
  pop: { emoji: '🏷️' },
  golden: { b: 'item' },
  set: { emoji: '🎁' },
  point: { emoji: '💳' },
  hours: { b: 'izakaya' },
  shop2: { b: 'import' },
  shop3: { b: 'boutique' },
  order: { b: 'board' },
  fair: { b: 'food_stalls' },
  concierge: { b: 'inn' },
  d_shop: { b: 'general_store' },
  jig: { sku: 'Scissors:C' },
  jig2: { sku: 'Mallet:C' },
  five_s: { emoji: '🧹' },
  lot: { b: 'assembly' },
  kaizen: { emoji: '💡' },
  chair: { b: 'rest_area' },
  pot: { sku: 'Sensu:U' },
  night: { emoji: '🌙' },
  mold: { sku: 'Lantern:U' },
  line: { b: 'factory' },
  d_craft: { b: 'workshop' },
  loading: { b: 'assembly' },
  shortcut: { b: 'survey' },
  route_opt: { emoji: '🗺️' },
  timetable: { b: 'station' },
  hub: { b: 'logistics' },
  crossdock: { b: 'warehouse' },
  joint: { emoji: '🤝' },
  fleet: { emoji: '🚚' },
  d_logi: { b: 'harbor' },
  route_cloth: { mat: 'cloth' },
  route_paper: { mat: 'paper' },
  route_gem: { mat: 'gem' },
  scoutmap: { b: 'lighthouse' },
  bulk: { b: 'wholesale' },
  bulk2: { b: 'trading' },
  stock1: { b: 'realty' },
  stock2: { b: 'bank' },
  stock3: { b: 'hq' },
  swift: { b: 'station' },
  eye: { b: 'jewelry' },
  abc: { emoji: '📊' },
  contract: { emoji: '📜' },
  direct: { emoji: '🌾' },
  d_buy: { b: 'trading' },
  hire: { b: 'school' },
  lounge: { b: 'cafe' },
  manual: { b: 'library' },
  shift: { emoji: '🗓️' },
  slots: { b: 'city_hall' },
  ojt: { b: 'training' },
  incentive: { emoji: '💰' },
  welfare: { b: 'hospital' },
  training: { b: 'school' },
  mgr: { b: 'government' },
  headhunt: { emoji: '🎯' },
  d_people: { b: 'arena' },
  pace1: { b: 'radio' },
  pace2: { b: 'power' },
  budget: { emoji: '🧮' },
  pdca: { emoji: '🔁' },
  pr: { b: 'media' },
  holding: { b: 'tower' },
  d_ops: { b: 'concert_hall' },
  pos: { emoji: '🧾' },
  auto_order: { emoji: '📨' },
  inventory: { emoji: '📦' },
  erp: { b: 'lab' },
  dyn: { emoji: '📈' },
  flow: { emoji: '👣' },
  forecast: { emoji: '🤖' },
  ec: { emoji: '🛒' },
  d_sys: { b: 'power' },
  b_sign: { b: 'media' },
  b_premium: { sku: 'Lantern:U' },
  b_partner: { b: 'harbor' },
  b_ads: { b: 'tower' },
  b_scout: { b: 'arena' },
  // 技：その技で作れるようになる商品のエクステ
  t_wood: { sku: 'Chair:C' },
  t_paper: { sku: 'Parasol:C' },
  t_metal: { sku: 'Knife:C' },
  t_glass: { sku: 'Goblet:C' },
  t_clay: { sku: 'Moai:C' },
  t_textile: { sku: 'Ribbon:C' },
  t_jewel: { sku: 'MusicBox:C' },
  t_master: { sku: 'MusicBox:U' },
  t_rare: { emoji: '💎' },
};

/**
 * 外周の追加のパネル（fx で書いたもの）の絵：効き目の種類ごとの建物（仮。docs/ISLAND_ART_TODO.md「スキルツリー v3 の外周のパネル」）。
 * 同じ種類のパネルが並んでも見分けられるように、候補を順に回す
 */
const KIND_ICON: Record<FxKind, string[]> = {
  pull: ['department', 'boutique', 'hotel', 'inn', 'item'],
  price: ['jewelry', 'wine_bar', 'boutique'],
  demand: ['amusement', 'park', 'arcade', 'food_stalls'],
  known: ['media', 'radio'],
  craftDays: ['factory', 'workshop', 'assembly'],
  lot: ['assembly', 'factory'],
  haulDays: ['logistics', 'station', 'harbor'],
  cartCap: ['warehouse', 'logistics'],
  matPrice: ['wholesale', 'trading'],
  procCap: ['trading', 'bank', 'wholesale'],
  buyDays: ['station', 'survey'],
  display: ['greengrocer', 'general_store'],
  stamina: ['rest_area', 'cafe'],
  rest: ['hospital', 'cafe', 'park'],
  apt: ['school', 'training', 'library'],
  wage: ['bank', 'realty'],
  upkeep: ['city_hall', 'bank'],
  ads: ['media', 'tower', 'radio'],
  brand: ['tower', 'concert_hall', 'media'],
  rally: ['guard', 'police'],
  manager: ['government', 'tower'],
  flow: ['lab', 'power'],
};
const kindIcon = (k: Skill) => {
  const kind = k.fx?.[0]?.kind;
  if (!kind) return null;
  const list = KIND_ICON[kind];
  const n = Number(k.id.match(/_(\d+)$/)?.[1] ?? 0);
  return { b: list[n % list.length] };
};
/** Epic・Legendary の外周：閉じていても名前を出して目標として見せる */
const isGoalTier = (k: Skill) => skillTier(k) === 'E' || skillTier(k) === 'L';

/** 画面を描き直しても、見ている場所・選んだスキルは覚えておく */
const view = { x: 0, y: 0, zoom: 0, sel: null as string | null };
/** 本社を開放した時刻（放射状に広がる演出のあいだ） */
let burst = 0;
const BURST_MS = 2600;
/** 外周が開く演出（ランク・始めた時刻・マインちゃんの一言まで進んだか） */
let ringFx: { tier: Tier; t0: number; talk: boolean } | null = null;
const RING_MS = 3400;
/** 本社のパネル（view.sel） */
const HQ = '@hq';
/** ダブルタップ（ダブルクリック）：同じパネルを続けて押したら開放する */
const DOUBLE_MS = 420;
let lastTap: { id: string; t: number } | null = null;
const isDouble = (id: string) => {
  const now = performance.now();
  const yes = !!lastTap && lastTap.id === id && now - lastTap.t < DOUBLE_MS;
  lastTap = yes ? null : { id, t: now };
  return yes;
};
/** チュートリアルで、この段に入ってから「人材の募集」へカメラを寄せたか */
let tutFocused = false;
/** いま開放したばかりのパネル（光の演出） */
let justLearned: { id: string; t: number } | null = null;
/** いまレベルを上げたばかりのパネル（ぽんと跳ねる） */
let justLeveled: { id: string; t: number } | null = null;

function iconOf(id: string, size: number): HTMLElement {
  const k = SKILL[id];
  if (k?.sealed) {
    const im = h('img', 'isl-tree-b isl-tree-sealimg');
    im.src = tierImg(skillTier(k));
    im.alt = '';
    im.draggable = false;
    return im;
  }
  const spec = ICON[id] ?? (k ? kindIcon(k) : null) ?? { emoji: '✦' };
  if (spec.b) {
    const im = h('img', 'isl-tree-b');
    im.src = assetUrl(`island/b/${spec.b}/rd.png`);
    im.alt = '';
    im.draggable = false;
    return im;
  }
  if (spec.sku) return skuIcon(spec.sku, size);
  if (spec.mat) return matIcon(spec.mat, size);
  if (spec.hero) return heroIcon(spec.hero, size);
  return h('span', 'isl-tree-emoji', spec.emoji ?? '✦');
}
/** 通貨の小さな絵（エンブレム） */
function curImg(kind: 'emblem', size = 18): HTMLImageElement {
  const im = h('img', 'isl-tree-curimg');
  im.src = assetUrl(`mch/Image/Icons/${kind}.webp`);
  im.alt = '';
  im.width = size;
  im.height = size;
  im.draggable = false;
  return im;
}

/** パネルの見え方：取った・修行中・取れる・資金（RP）不足・条件が足りない・外周が閉じている・封印・準備中 */
type State = 'done' | 'training' | 'open' | 'poor' | 'locked' | 'ring' | 'sealed' | 'soon';
function stateOf(s: P1State, k: Skill): State {
  const e = skillLock(s, k);
  if (e === null) return 'open';
  if (e === 'money' || e === 'rp') return 'poor';
  if (e === 'requires' || e === 'brand' || e === 'emblem') return 'locked';
  return e;
}
/** 条件の札（★30・🏅3） */
function condTags(s: P1State, k: Skill): HTMLElement | null {
  if (!k.brand && !k.emblem) return null;
  const box = h('span', 'isl-tree-tags');
  if (k.brand) box.append(h('span', `isl-tree-brand ${(s.brand ?? 0) >= k.brand ? 'is-ok' : ''}`, `★${k.brand}`));
  if (k.emblem) {
    const e = h('span', `isl-tree-emb ${(s.emblem ?? 0) >= k.emblem ? 'is-ok' : ''}`);
    e.append(curImg('emblem', 14), h('b', '', String(k.emblem)));
    box.append(e);
  }
  return box;
}
/** 値段の表示：研究パネルは「研 40」（RP）、お金パネルは資金 */
const priceOf = (k: Skill) => (isResearch(k) ? t(`研 ${rpCost(k)}`, `RP ${rpCost(k)}`) : money(k.cost));
/** 足りないぶん（RP・資金）。RP は発掘でしか貯まらないので、どこで貯まるかも添える */
const shortOf = (s: P1State, k: Skill) => (isResearch(k) ? t(`あと ${rpCost(k) - (s.rp ?? 0)} RP（発掘で貯まる）`, `${rpCost(k) - (s.rp ?? 0)} RP short (earn RP by digging)`) : t(`あと ${money(k.cost - s.money)} 足りない`, `${money(k.cost - s.money)} short`));
/** 区分の 1 行：■ 研究パネル（レベルなし）／◆ お金パネル（Lv 3 / 5）。形の記号と文字で（色だけに頼らない） */
function catLine(s: P1State, k: Skill, tut = false): HTMLElement {
  if (isResearch(k)) {
    const row = h('div', 'isl-tree-cat is-research');
    row.append(h('i', 'isl-tree-catmark'), h('span', '', t('研究パネル（レベルなし）', 'Research panel (no levels)')));
    return row;
  }
  const lv = lvOf(s, k.id);
  const mx = maxLv(k);
  const row = h('div', `isl-tree-cat is-money ${lv >= mx ? 'is-max' : ''}`);
  // チュートリアル中はレベルの段を出さない（案内の画面を変えない）
  const txt = tut ? t('お金パネル', 'Money panel') : lv >= mx ? t(`お金パネル（Lv ${lv} / ${mx}・最大）`, `Money panel (Lv ${lv} / ${mx}, max)`) : t(`お金パネル（Lv ${lv} / ${mx}）`, `Money panel (Lv ${lv} / ${mx})`);
  row.append(h('i', 'isl-tree-catmark'), h('span', '', txt));
  if (!tut && lv > 0) {
    const dots = h('span', 'isl-tree-dots');
    for (let i = 1; i <= mx; i++) dots.append(h('i', i <= lv ? 'is-on' : ''));
    row.append(dots);
  }
  return row;
}
/** 開くボタンの言い方：研究パネル「研究する 40 RP」、お金パネル「開放する 4,000 G」 */
const learnLabel = (k: Skill) => (isResearch(k) ? (k.train ? t(`研究して修行に出す ${rpCost(k)} RP`, `Research & train · ${rpCost(k)} RP`) : t(`研究する ${rpCost(k)} RP`, `Research · ${rpCost(k)} RP`)) : k.train ? t(`修行に出す ${money(k.cost)}`, `Start training · ${money(k.cost)}`) : t(`開放する ${money(k.cost)}`, `Unlock · ${money(k.cost)}`));
/** 値段の札（研究パネル：RP・お金パネル：資金） */
function costTag(k: Skill): HTMLElement {
  return h('span', `isl-tree-cost ${isResearch(k) ? 'is-rp' : 'is-g'} ${k.big ? 'is-dust' : ''}`, priceOf(k));
}
/** 技の修行の説明（取ったあと、職人が修行して身につける） */
const trainNote = (k: Skill) => t(`取ったあと、職人が修行して身につける（${k.train} 日。製造の適性が高いほど早い）。修行中の職人は作業台に立てない`, `After unlocking, a crafter trains to master it (${k.train} days, shorter with higher crafting aptitude). They can’t work a bench meanwhile`);
/** 修行中の札：職人・残りの日数・進み具合 */
function trainBox(s: P1State, k: Skill): HTMLElement | null {
  const tr = trainingOf(s, k.id);
  if (!tr) return null;
  const box = h('div', 'isl-tree-trainbox');
  const row = h('div', 'isl-row');
  row.append(heroIcon(tr.hero, 28), h('small', 'isl-gold', t(`${heroName(tr.hero)}が修行中（あと ${tr.left} 日）`, `${heroName(tr.hero)} is training (${tr.left} d left)`)));
  box.append(row, bar(1 - tr.left / tr.total, 'var(--isl-gold)'));
  return box;
}
/** ブランド力・エンブレムの条件（足りなければ 🔒、足りていれば ✓） */
const brandNeed = (s: P1State, k: Skill) => ((s.brand ?? 0) < (k.brand ?? 0) ? t(`🔒 ブランド力 ${k.brand} が要る（いま ${s.brand ?? 0}）`, `🔒 Needs brand ${k.brand} (now ${s.brand ?? 0})`) : t(`✓ ブランド力 ${k.brand}（いま ${s.brand ?? 0}）`, `✓ Brand ${k.brand} (now ${s.brand ?? 0})`));
const emblemNeed = (s: P1State, k: Skill) => ((s.emblem ?? 0) < (k.emblem ?? 0) ? t(`🔒 エンブレム ${k.emblem} が要る（いま ${s.emblem ?? 0}）`, `🔒 Needs ${k.emblem} emblem(s) (now ${s.emblem ?? 0})`) : t(`✓ エンブレム ${k.emblem}（いま ${s.emblem ?? 0}）`, `✓ ${k.emblem} emblem(s) (now ${s.emblem ?? 0})`));
const ringNeed = (k: Skill) => t(`${TIER_NAME[skillTier(k)]} のセクタに進出すると開く`, `Opens when you expand into a ${TIER_NAME[skillTier(k)]} sector`);
/** 「技を 3 つ」のような条件（anyOf）の札 */
const anyNeed = (s: P1State, k: Skill) => {
  const got = k.anyOf ? k.anyOf.ids.filter((r) => has(s, r)).length : 0;
  return t(`技を ${k.anyOf?.n} つ取ると開放できる（いま ${got}）`, `Unlocks after ${k.anyOf?.n} craft skills (now ${got})`);
};
/** 見えている名前（外周が閉じていれば「？」、封印は「???」） */
const shownName = (s: P1State, k: Skill) => (k.sealed ? '???' : !ringOpen(s, skillTier(k)) && !isGoalTier(k) ? '?' : k.name);
/** 枝の名前のラベル（詳細カードの名前の左に「（物流）」） */
const branchName = (k: Skill) => LAYOUT[k.branch].stage?.replace(/^[①②③④]\s*/, '') ?? BRANCHES.find((b) => b.key === k.branch)?.name ?? '';
function titleEl(s: P1State, k: Skill): HTMLElement {
  const b = h('b', 'isl-tree-title');
  b.append(h('small', 'isl-tree-brname', t(`（${branchName(k)}）`, `(${branchName(k)}) `)), document.createTextNode(shownName(s, k)));
  return b;
}
/** いまの効果と次のレベルの効果（「クラフトの日数 −30% → −35%」） */
function effLines(s: P1State, k: Skill): HTMLElement | null {
  const lv = lvOf(s, k.id);
  const mx = maxLv(k);
  const { base, up } = shownOf(k);
  if (!base.length && !up.length) return null;
  const box = h('div', 'isl-tree-eff');
  const line = (x: (typeof base)[number], isUp: boolean) => {
    const cur = shownAt(x, lv, isUp);
    const nx = lv < mx ? shownAt(x, lv + 1, isUp) : null;
    const r = h('div', 'isl-tree-effrow');
    r.append(h('span', '', x.label), h('b', '', cur ? fmtShown(x, cur) : t('なし', 'none')));
    if (nx != null && nx !== cur) r.append(h('span', 'isl-dim', '→'), h('b', 'isl-good', fmtShown(x, nx)));
    box.append(r);
  };
  for (const x of base) line(x, false);
  for (const x of up) line(x, true);
  return box;
}
/** そのパネルは、いまレベルを上げられるか（資金が足りて、最大でない） */
const canLevel = (s: P1State, k: Skill) => levelLock(s, k) === null;
/** 次のレベルの値段の表示 */
const nextPrice = (s: P1State, k: Skill) => money(nextLevelCost(s, k));

const HQ_NOTE = t('会社のすべての事業の中心。開放すると、① 調達・② 製造・③ 物流・④ 販売・人材・経営・システム・技の強化の枝が広がり、資金でスキルを習得できるようになります。', 'The heart of every business. Unlock it and upgrade branches spread out for Buying, Crafting, Hauling, Selling, People, Operations, Systems and Crafts.');

/** 広がる演出：本社からの向きと遅れ */
function setBurst(el: HTMLElement, p: { x: number; y: number }, extra = 0) {
  el.style.setProperty('--dx', `${(-p.x * UNIT).toFixed(0)}px`);
  el.style.setProperty('--dy', `${(-p.y * UNIT).toFixed(0)}px`);
  el.style.setProperty('--d', `${(0.15 + extra + Math.hypot(p.x, p.y) * 0.11).toFixed(2)}s`);
}

/** パネルの説明の行（ホバーのカードと、下の説明の帯で同じもの） */
function infoLines(s: P1State, k: Skill, st: State): HTMLElement[] {
  const out: HTMLElement[] = [];
  const tier = skillTier(k);
  if (st === 'ring' || st === 'sealed') {
    out.push(h('small', 'isl-warn', ringNeed(k)));
    return out;
  }
  if (tier !== 'C') out.push(h('span', 'isl-tag is-tier', tierArea(tier)));
  if (st === 'soon') out.push(h('small', 'isl-warn', t('準備中（まだ取れない）', 'Coming soon (not available yet)')));
  if (k.requires?.length) {
    const need = k.requires.map((r) => (has(s, r) ? '✓' : '· ') + (SKILL[r]?.name ?? r)).join(t('　', '  '));
    out.push(h('small', st === 'locked' && k.requires.some((r) => !has(s, r)) ? 'isl-warn' : 'isl-dim', t(`先に要る：${need}`, `Needs: ${need}`)));
  }
  if (k.brand) out.push(h('small', (s.brand ?? 0) < k.brand ? 'isl-warn' : 'isl-good', brandNeed(s, k)));
  if (k.emblem) out.push(h('small', (s.emblem ?? 0) < k.emblem ? 'isl-warn' : 'isl-good', emblemNeed(s, k)));
  if (k.anyOf) out.push(h('small', anyOfMet(k, (r) => has(s, r)) ? 'isl-good' : 'isl-warn', anyNeed(s, k)));
  if (k.train && st !== 'done' && st !== 'training') out.push(h('small', 'isl-dim', trainNote(k)));
  const tb = trainBox(s, k);
  if (tb) out.push(tb);
  return out;
}

/** マウスを乗せたときの説明（PC） */
function skillCard(s: P1State, k: Skill, tut = false): HTMLElement {
  const st = stateOf(s, k);
  const L = LAYOUT[k.branch];
  const c = h('div', 'isl-tree-hcard');
  c.style.setProperty('--br', isResearch(k) ? L.color : 'var(--isl-gold)');
  const top = h('div', 'isl-row');
  top.append(iconOf(k.id, 36), titleEl(s, k));
  c.append(top);
  if (st !== 'ring' && st !== 'sealed' && st !== 'soon') c.append(catLine(s, k, tut));
  if ((st !== 'ring' || isGoalTier(k)) && !k.sealed) c.append(h('p', '', k.note));
  c.append(...infoLines(s, k, st));
  if (st === 'ring' || st === 'sealed' || st === 'soon') return c;
  if (st === 'done' && !tut) {
    const eff = effLines(s, k);
    if (eff) c.append(eff);
    const lv = lvOf(s, k.id);
    if (lv < maxLv(k)) c.append(h('small', canLevel(s, k) ? 'isl-good' : 'isl-dim', canLevel(s, k) ? t(`Lv ${lv + 1} に上げる ${nextPrice(s, k)}・ダブルクリック`, `Lv ${lv + 1} for ${nextPrice(s, k)} · double-click`) : t(`Lv ${lv + 1} に上げる ${nextPrice(s, k)}（足りない）`, `Lv ${lv + 1} for ${nextPrice(s, k)} (short)`)));
    return c;
  }
  const price = isResearch(k) ? `${rpCost(k)} RP` : priceOf(k);
  c.append(
    h(
      'small',
      st === 'open' ? 'isl-good' : st === 'poor' ? 'isl-warn' : 'isl-dim',
      st === 'done' ? (isResearch(k) ? t('研究済み', 'Researched') : t('開放済み', 'Unlocked')) : st === 'training' ? t('修行中', 'Training') : st === 'locked' ? t(`${price}（まだ取れない）`, `${price} (locked)`) : st === 'poor' ? t(`${price}（${shortOf(s, k)}）`, `${price} (${shortOf(s, k)})`) : t(`${learnLabel(k)}・ダブルクリック`, `${learnLabel(k)} · double-click`),
    ),
  );
  return c;
}
function hqCard(s: P1State, sealed: boolean): HTMLElement {
  const c = h('div', 'isl-tree-hcard');
  c.style.setProperty('--br', 'var(--isl-gold)');
  c.append(h('b', '', t('本社', 'HQ')), h('p', '', HQ_NOTE));
  c.append(h('small', sealed ? 'isl-good' : 'isl-dim', sealed ? t('ダブルクリックで開放（無料）', 'Double-click to unlock (free)') : t(`開放したスキル ${s.skills.length} / ${LEARNABLE().length}`, `Unlocked ${s.skills.length} / ${LEARNABLE().length}`)));
  return c;
}

/** ツリーの上の通貨の帯：資金・研究ポイント・★ ブランド力・🏅 エンブレム */
function currencyBar(s: P1State): HTMLElement {
  const bar0 = h('div', 'isl-tree-cur');
  const item = (cls: string, label: string, value: string, im?: HTMLElement) => {
    const c = h('span', `isl-tree-curitem ${cls}`);
    if (im) c.append(im);
    c.append(h('small', '', label), h('b', '', value));
    bar0.append(c);
  };
  item('is-money', t('資金', 'Funds'), money(s.money));
  // スマホでは見出し（small）を隠すので、数字の側に「RP」「★」を付ける
  item('is-rp', t('研究ポイント', 'Research'), `${s.rp ?? 0} RP`);
  item('is-brand', t('ブランド力', 'Brand'), `★ ${s.brand ?? 0}`);
  item('is-emblem', t('エンブレム', 'Emblems'), String(s.emblem ?? 0), curImg('emblem'));
  return bar0;
}

/** 枝の真ん中（内側の段の真ん中）。チップ・SCM ダッシュボードから飛ぶ先 */
function branchCenter(br: Branch) {
  const L = LAYOUT[br];
  return polar((L.angle * Math.PI) / 180, R0 + (STEP * (L.rows.length - 1)) / 2);
}

/** スキルツリーを開く。focus：その枝を真ん中に（SCM ダッシュボード・チュートリアルから） */
export function openSkills(ctx: Ctx, focus?: string) {
  if (focus && SKILL[focus] && POS.has(focus)) {
    // スキルのパネルを真ん中に、選んだ状態で（市場データ・マインちゃんの助言から）
    const p = POS.get(focus)!;
    view.x = p.x;
    view.y = p.y;
    view.sel = focus;
  } else if (focus && LAYOUT[focus as Branch]) {
    const c = branchCenter(focus as Branch);
    view.x = c.x;
    view.y = c.y;
  }
  open(ctx, t('スキルツリー', 'Skill tree'), (body) => {
    const s = ctx.s();
    // 本社を開放するまでは、本社だけが見える
    const sealed = !hqOpen(s);
    // チュートリアル（人材の募集を開放する段）：開放してよいのはこのパネルだけ。ほかは押せる（説明は見られる）が、開放はマインちゃんが止める
    const only = ctx.step?.() === 'recruit' ? 'hire' : null;
    const target = only && !sealed && !has(s, only) ? only : null;
    if (!only) tutFocused = false;
    const bursting = !sealed && performance.now() - burst < BURST_MS;
    // 外周の開放：そのランクのセクタに出店したあと、はじめて開いたとき（チュートリアル中・本社の開放前は待つ）
    if (!ringFx && !sealed && !ctx.step?.()) {
      const due = ringsDue(s);
      if (due.length && openRing(s, due[0])) {
        ringFx = { tier: due[0], t0: performance.now(), talk: false };
        view.sel = null;
        view.x = 0;
        view.y = 0;
        view.zoom = -1;
        ctx.save();
        ctx.sfx?.('clear');
        setTimeout(() => ctx.sfx?.('win'), 900);
      }
    }
    const fx = ringFx;
    if (sealed) {
      view.x = 0;
      view.y = 0;
    }
    body.classList.add('is-tree');
    const wrap = h('div', `isl-tree ${sealed ? 'is-sealed' : ''} ${fx ? 'is-ringfx' : ''}`);
    const tip = h('div', 'isl-tree-tip');
    mineTip(ctx, 'skills', tip);
    // 上：通貨の帯と、枝へ飛ぶチップ
    const top = h('div', 'isl-tree-top');
    const cur = currencyBar(s);
    const chips = h('div', 'isl-tree-chips');
    const chipEls = new Map<Branch, HTMLElement>();
    for (const br of BRANCHES) {
      const L = LAYOUT[br.key];
      const c = h('button', 'isl-tree-chip');
      c.type = 'button';
      c.style.setProperty('--br', L.color);
      // 数えるのは開いているエリアのパネル（閉じた外周は目標なので数えない）
      const mine = SKILLS.filter((k) => k.branch === br.key && !k.sealed && !k.soon && ringOpen(s, skillTier(k)));
      const got = mine.filter((k) => has(s, k.id)).length;
      c.append(h('b', '', br.name), h('small', '', L.stage ? `${L.stage} ${got}/${mine.length}` : `${got}/${mine.length}`));
      c.addEventListener('click', () => {
        const p = branchCenter(br.key);
        view.x = p.x;
        view.y = p.y;
        place();
      });
      chipEls.set(br.key, c);
      chips.append(c);
    }
    // 通貨の帯の右：「上げられる：N」（いまの RP と資金で取れる研究パネルの開放＋お金パネルの開放・レベル上げ）。押すと、いちばん見込みの大きいものへカメラを寄せる
    const nCan = sealed || only ? 0 : affordableSkills(s).length;
    if (nCan > 0) {
      const can = h('button', 'isl-tree-curitem is-can');
      can.type = 'button';
      can.append(h('small', '', t('上げられる', 'Can upgrade')), h('b', '', String(nCan)), h('span', 'isl-tree-canup', '▲'));
      can.addEventListener('click', () => {
        const best = bestSkillMove(s);
        if (!best) return;
        flyTo(best.id);
      });
      cur.append(can);
    }
    top.append(tip, cur, chips);
    // 木
    /** マインちゃんが止める（チュートリアル中に、ほかのパネルを開放しようとした） */
    const stop = h('div', 'isl-tree-stop');
    stop.hidden = true;
    let stopT = 0;
    const halt = () => {
      ctx.sfx?.('error');
      const mi = h('img');
      mi.src = assetUrl('mch/Image/Characters/navi_ain_speak_00_talk.png');
      mi.alt = '';
      stop.replaceChildren(mi, h('p', '', t('ちょっと待って！ いまは光っている四角い「人材の募集」を研究しよう！', 'Wait! For now, research the glowing square Recruiting panel!')));
      stop.hidden = false;
      stop.classList.remove('is-shake');
      void stop.offsetWidth;
      stop.classList.add('is-shake');
      clearTimeout(stopT);
      stopT = window.setTimeout(() => (stop.hidden = true), 2600);
    };
    const fail = (text: string) => {
      ctx.sfx?.('error');
      ctx.toast(text);
    };
    /** 開放する（パネルのボタン・ダブルタップ） */
    const tryLearn = (k: Skill) => {
      if (only && k.id !== only) return halt();
      // 技：修行に出す職人を選んでから（修行は 1 つずつ）
      if (k.train && !has(s, k.id) && skillLock(s, k) === null) {
        if (trainingOf(s, k.id)) return;
        if (s.training) return fail(plain(t(`いまは${heroName(s.training.hero)}が「${SKILL[s.training.id]?.name ?? ''}」を修行中です（あと ${s.training.left} 日）。修行は 1 つずつ`, `${heroName(s.training.hero)} is training ${SKILL[s.training.id]?.name ?? ''} (${s.training.left} d left). One at a time`)));
        if (!trainees(s).length) return fail(t('修行に出せる職人がいません', 'No crafter is free to train'));
        pickHero(ctx.root, s, {
          title: t(`「${k.name}」の修行に出す職人`, `Who trains in ${k.name}?`),
          task: 'craft',
          current: null,
          note: t(`製造の適性が高いほど早く身につきます（${k.train} 日から最大 −40%）。修行のあいだ、その職人は作業台に立てません（終わったら元の配置に戻ります）。`, `Higher crafting aptitude learns faster (${k.train} days, up to −40%). The crafter leaves their bench while training and returns afterwards.`),
          extra: (st) => t(`修行 ${trainDays(s, k.id, st)} 日`, `${trainDays(s, k.id, st)} days`),
          badge: t('いちばん早く身につく', 'Fastest learner'),
          onPick: (hero) => {
            if (hero == null) return;
            const e = learn(s, k.id, hero);
            if (e) fail(e === 'money' || e === 'rp' ? shortOf(s, k) : t('いまは修行に出せません', 'Can’t start training now'));
            else {
              ctx.sfx?.('done');
              ctx.toast(t(`${heroName(hero)}が「${k.name}」の修行を始めました（${s.training?.total ?? 0} 日）`, `${heroName(hero)} started training in ${k.name} (${s.training?.total ?? 0} days)`));
              justLearned = { id: k.id, t: performance.now() };
              view.sel = k.id;
            }
            after(ctx);
          },
        });
        return;
      }
      const e = learn(s, k.id);
      if (e === 'money') fail(t(`資金が足りません（あと ${money(k.cost - s.money)}）`, `Not enough funds (${money(k.cost - s.money)} short)`));
      else if (e === 'brand') fail(plain(brandNeed(s, k)));
      else if (e === 'emblem') fail(plain(emblemNeed(s, k)));
      else if (e === 'rp') fail(t(`研究ポイントが足りません（${rpCost(k)} が要る・いま ${s.rp ?? 0}）`, `Not enough RP (needs ${rpCost(k)}, have ${s.rp ?? 0})`));
      else if (e === 'ring' || e === 'sealed') fail(ringNeed(k));
      else if (e === 'soon') fail(t('準備中です', 'Coming soon'));
      else if (e === 'requires') fail(t('先に要るスキルがあります', 'Learn the required skills first'));
      else if (!e) {
        ctx.sfx?.('levelup');
        ctx.toast(isResearch(k) ? t(`研究ポイント ${rpCost(k)} で「${k.name}」を開放しました`, `Unlocked ${k.name} with ${rpCost(k)} RP`) : t(`「${k.name}」を開放しました`, `Unlocked: ${k.name}`));
        justLearned = { id: k.id, t: performance.now() };
        view.sel = k.id;
      }
      after(ctx);
    };
    /** レベルを上げる（詳細カードのボタン・取得済みのパネルのダブルタップ）。チュートリアル中は上げない */
    const tryLevel = (k: Skill) => {
      if (only) return halt();
      const e = levelUp(s, k.id);
      if (e === 'money') return fail(t(`資金が足りません（あと ${money(nextLevelCost(s, k) - s.money)}）`, `Not enough funds (${money(nextLevelCost(s, k) - s.money)} short)`));
      if (e === 'max') return fail(t('最大レベルです', 'Already at max level'));
      if (e) return fail(t('いまは上げられません', 'Can’t level up now'));
      ctx.sfx?.('levelup');
      ctx.toast(t(`「${k.name}」を Lv ${lvOf(s, k.id)} に上げました`, `${k.name} is now Lv ${lvOf(s, k.id)}`));
      justLeveled = { id: k.id, t: performance.now() };
      view.sel = k.id;
      after(ctx);
    };
    const unlockHQ = () => {
      if (!openHQ(s)) return;
      burst = performance.now();
      view.sel = null;
      view.x = 0;
      view.y = 0;
      view.zoom = -1; // 描き直したあと、全体が見える大きさに
      ctx.sfx?.('clear');
      setTimeout(() => ctx.sfx?.('levelup'), 700);
      ctx.toast(t('本社を開放しました！ 強化の枝が広がります', 'HQ unlocked! Upgrade branches spread out'));
      ctx.save();
      after(ctx);
    };
    const vp = h('div', 'isl-tree-vp');
    const world = h('div', `isl-tree-world ${bursting ? 'is-burst' : ''}`);
    if (bursting) setTimeout(() => world.classList.remove('is-burst'), Math.max(0, BURST_MS - (performance.now() - burst)));
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.classList.add('isl-tree-lines');
    const span = { w: (BOUNDS.x1 - BOUNDS.x0 + 4) * UNIT, h: (BOUNDS.y1 - BOUNDS.y0 + 4) * UNIT };
    const ox = (-BOUNDS.x0 + 2) * UNIT;
    const oy = (-BOUNDS.y0 + 2) * UNIT;
    svg.setAttribute('width', `${span.w}`);
    svg.setAttribute('height', `${span.h}`);
    world.style.width = `${span.w}px`;
    world.style.height = `${span.h}px`;
    world.append(svg);
    const px = (p: { x: number; y: number }) => ({ x: ox + p.x * UNIT, y: oy + p.y * UNIT });
    /** 本社からの距離 → 広がる演出の遅れ（秒） */
    const delay = (p: { x: number; y: number }) => `${(Math.hypot(p.x, p.y) * 0.11).toFixed(2)}s`;
    const NS = 'http://www.w3.org/2000/svg';
    // ランクのエリアの境目（同心円）と札
    if (!sealed)
      for (const tier of OUTER) {
        const on = ringOpen(s, tier);
        const c0 = px({ x: 0, y: 0 });
        const c = document.createElementNS(NS, 'circle');
        c.setAttribute('cx', `${c0.x}`);
        c.setAttribute('cy', `${c0.y}`);
        c.setAttribute('r', `${RING_EDGE[tier] * UNIT}`);
        c.setAttribute('stroke', TIERS[tier].color);
        c.setAttribute('class', `isl-tree-ringline ${on ? 'is-on' : ''} ${fx?.tier === tier ? 'is-glow' : ''}`);
        svg.append(c);
        const lp = px(polar(LABEL_A, RING_EDGE[tier]));
        const lab = h('div', `isl-tree-ringlab ${on ? 'is-on' : ''} ${fx?.tier === tier ? 'is-glow' : ''}`);
        lab.style.left = `${lp.x}px`;
        lab.style.top = `${lp.y}px`;
        lab.style.setProperty('--tc', TIERS[tier].color);
        const im = h('img');
        im.src = tierImg(tier);
        im.alt = '';
        im.draggable = false;
        lab.append(im, h('b', '', tierArea(tier)));
        if (!on) lab.append(h('small', '', t('🔒 進出すると開く', '🔒 Expand to open')));
        world.append(lab);
      }
    // 外周が開く演出：本社から金色の輪が広がる
    if (fx && !sealed) {
      const c0 = px({ x: 0, y: 0 });
      for (let k = 0; k < 3; k++) {
        const wv = h('div', 'isl-tree-ringwave');
        const d = 2 * RING_EDGE[fx.tier] * UNIT;
        wv.style.left = `${c0.x}px`;
        wv.style.top = `${c0.y}px`;
        wv.style.width = `${d}px`;
        wv.style.height = `${d}px`;
        wv.style.margin = `${-d / 2}px 0 0 ${-d / 2}px`;
        wv.style.animationDelay = `${0.2 + k * 0.4}s`;
        world.append(wv);
      }
    }
    const line = (a: { x: number; y: number }, b: { x: number; y: number }, color: string, cls: string) => {
      if (sealed) return;
      const A = px(a);
      const B = px(b);
      const l = document.createElementNS(NS, 'line');
      const len = Math.hypot(B.x - A.x, B.y - A.y);
      l.setAttribute('style', `--len:${len.toFixed(0)};--d:${delay(a)}`);
      l.setAttribute('x1', `${A.x}`);
      l.setAttribute('y1', `${A.y}`);
      l.setAttribute('x2', `${B.x}`);
      l.setAttribute('y2', `${B.y}`);
      l.setAttribute('stroke', color);
      l.setAttribute('class', cls);
      svg.append(l);
    };
    // 本社 → 枝の根もと → スキル
    for (const br of BRANCHES) {
      const L = LAYOUT[br.key];
      const hub = HUBPOS.get(br.key)!;
      line({ x: 0, y: 0 }, hub, L.color, 'is-on');
      for (const k of SKILLS.filter((x) => x.branch === br.key)) {
        const p = POS.get(k.id)!;
        const tier = skillTier(k);
        const closed = !ringOpen(s, tier) || !!k.sealed;
        const cls = `${has(s, k.id) ? 'is-on' : ''} ${closed ? 'is-closed' : ''} ${k.big ? 'is-dust' : ''}`;
        if (k.sealed) {
          // 封印：ひとつ内側の外周の最後のパネル（無ければ根もと）から
          const inner = SKILLS.filter((x) => x.branch === br.key && !x.big && OUTER.indexOf(skillTier(x)) === OUTER.indexOf(tier) - 1);
          line(inner.length ? POS.get(inner[Math.floor(inner.length / 2)].id)! : hub, p, L.color, cls);
          continue;
        }
        const from = k.requires?.length ? k.requires.map((r) => POS.get(r)!) : [hub];
        for (const f of from) line(f, p, L.color, cls);
      }
    }
    const root = h('button', `isl-tree-root ${sealed ? 'is-sealed' : ''} ${view.sel === HQ ? 'is-sel' : ''}`);
    root.type = 'button';
    const rp = px({ x: 0, y: 0 });
    root.style.left = `${rp.x}px`;
    root.style.top = `${rp.y}px`;
    const hq = h('img', 'isl-tree-b');
    hq.src = assetUrl('island/b/hq/rd.png');
    hq.alt = '';
    hq.draggable = false;
    root.append(hq, h('b', '', t('本社', 'HQ')));
    if (sealed) root.append(h('span', 'isl-tree-cost', t('タップして開放', 'Tap to unlock')));
    root.addEventListener('click', (e) => {
      e.stopPropagation();
      if (moved) return;
      if (isDouble(HQ) && sealed) return unlockHQ();
      view.sel = HQ;
      after(ctx);
    });
    hover(root, () => hqCard(s, sealed));
    world.append(root);
    if (bursting) {
      // 本社から広がる光の輪
      for (let k = 0; k < 3; k++) {
        const wv = h('div', 'isl-tree-wave');
        wv.style.left = `${rp.x}px`;
        wv.style.top = `${rp.y}px`;
        wv.style.animationDelay = `${k * 0.35}s`;
        world.append(wv);
      }
    }
    if (!sealed)
      for (const br of BRANCHES) {
        const L = LAYOUT[br.key];
        const p = px(HUBPOS.get(br.key)!);
        const hub = h('div', 'isl-tree-hub');
        hub.style.left = `${p.x}px`;
        hub.style.top = `${p.y}px`;
        hub.style.setProperty('--br', L.color);
        setBurst(hub, HUBPOS.get(br.key)!);
        hub.append(h('b', '', br.name));
        if (L.stage) hub.append(h('small', '', L.stage));
        world.append(hub);
      }
    // 外周の演出：開くランクのパネルを、枝の順に本社から飛び出させる
    const fxOrder = fx ? SKILLS.filter((k) => skillTier(k) === fx.tier) : [];
    if (!sealed)
      for (const k of SKILLS) {
        const L = LAYOUT[k.branch];
        const p = px(POS.get(k.id)!);
        const st = stateOf(s, k);
        const tier = skillTier(k);
        // 形：研究パネルは四角・お金パネルは菱形（閉じた外周の「?」は形を見せない）
        const shape = isResearch(k) || (st === 'ring' && !isGoalTier(k)) || k.sealed ? 'is-research' : 'is-money';
        const n = h('button', `isl-tree-node ${shape} is-${st} ${view.sel === k.id ? 'is-sel' : ''} ${k.brand ? 'is-brand' : ''} ${k.big ? 'is-dust' : ''} ${tier !== 'C' ? `is-tier-${tier}` : ''}`);
        n.type = 'button';
        n.style.left = `${p.x}px`;
        n.style.top = `${p.y}px`;
        n.style.setProperty('--br', L.color);
        n.style.setProperty('--tc', TIERS[tier].color);
        setBurst(n, POS.get(k.id)!);
        if (fx && tier === fx.tier) {
          n.classList.add('is-ringpop');
          setBurst(n, POS.get(k.id)!, 0.6 + fxOrder.indexOf(k) * 0.07);
        }
        hover(n, () => skillCard(s, k, !!only));
        if (st === 'ring' && !isGoalTier(k)) {
          // 外周が閉じている：薄い輪郭と「？」（目標として存在だけ見せる）
          n.append(h('span', 'isl-tree-q', '?'));
        } else if (st === 'ring') {
          // Epic・Legendary：名前を出して、目標として見せる（取れない）
          n.classList.add('is-goal');
          n.append(iconOf(k.id, 44), h('span', 'isl-tree-name', k.name), h('span', 'isl-tree-mark', '🔒'));
        } else {
          n.append(iconOf(k.id, 44), h('span', 'isl-tree-name', shownName(s, k)));
          const tags = condTags(s, k);
          if (tags && st !== 'sealed') n.append(tags);
          if (st === 'done') {
            const lv = lvOf(s, k.id);
            const mx = maxLv(k);
            n.append(h('span', 'isl-tree-mark', '✓'));
            // レベルの札（右下）。最大は金の縁、上げられるものは ▲ がゆっくり光る
            if (mx > 1 && !only) n.append(h('span', `isl-tree-lv ${lv >= mx ? 'is-max' : ''}`, `Lv${lv}`));
            if (lv >= mx && mx > 1) n.classList.add('is-max');
            else if (!only && canLevel(s, k)) n.append(h('span', 'isl-tree-up', '▲'));
          }
          else if (st === 'locked') n.append(h('span', 'isl-tree-mark', '🔒'));
          else if (st === 'training') n.append(h('span', 'isl-tree-mark', '⏳'));
          else if (st === 'soon') n.append(h('span', 'isl-tree-cost', t('準備中', 'Soon')));
          else if (st !== 'sealed') n.append(costTag(k));
        }
        // 技：修行の日数の札と、修行中の進み具合
        const tr = trainingOf(s, k.id);
        if (tr) {
          n.append(h('span', 'isl-tree-cost', t(`あと ${tr.left} 日`, `${tr.left} d left`)));
          const pb = bar(1 - tr.left / tr.total, 'var(--isl-gold)');
          pb.classList.add('isl-tree-prog');
          n.append(pb);
        } else if (k.train && st !== 'done' && st !== 'ring' && st !== 'soon') n.append(h('span', 'isl-tree-train', t(`修行 ${k.train} 日`, `${k.train}-day training`)));
        if (target === k.id) n.classList.add('is-hot');
        if (justLearned?.id === k.id && performance.now() - justLearned.t < 1500) n.classList.add('is-learned');
        if (justLeveled?.id === k.id && performance.now() - justLeveled.t < 900) n.classList.add('is-lvup');
        n.addEventListener('click', (e) => {
          e.stopPropagation();
          if (moved) return;
          // 続けて 2 回押したら開放（取れないものは何もしない。チュートリアル中のほかのパネルはマインちゃんが止める）
          if (isDouble(k.id)) {
            if (only && k.id !== only) return halt();
            if (st === 'open' || st === 'poor') return tryLearn(k);
            // 取得済み：次のレベルへ（チュートリアル中は上げない）
            if (st === 'done' && !only && lvOf(s, k.id) < maxLv(k)) return tryLevel(k);
          }
          view.sel = k.id;
          after(ctx);
        });
        world.append(n);
      }
    vp.append(world);
    // 選んだスキルの説明と「習得する」
    const detail = h('div', 'isl-tree-detail');
    const sel = view.sel ? SKILL[view.sel] : null;
    if (view.sel === HQ) {
      const top2 = h('div', 'isl-tree-dtop');
      const ic = h('div', 'isl-tree-dicon');
      ic.style.setProperty('--br', 'var(--isl-gold)');
      const im = h('img', 'isl-tree-b');
      im.src = assetUrl('island/b/hq/rd.png');
      im.alt = '';
      ic.append(im);
      const txt = h('div');
      txt.append(h('b', '', t('本社', 'HQ')), h('p', '', HQ_NOTE));
      if (!sealed) txt.append(h('small', 'isl-dim', t(`開放したスキル ${s.skills.length} / ${LEARNABLE().length}`, `Unlocked ${s.skills.length} / ${LEARNABLE().length}`)));
      top2.append(ic, txt);
      detail.append(top2);
      if (sealed) detail.append(btn(t('本社を開放する', 'Unlock HQ'), () => unlockHQ(), 'is-on'));
    } else if (sel) {
      const st = stateOf(s, sel);
      const L = LAYOUT[sel.branch];
      const top2 = h('div', 'isl-tree-dtop');
      const ic = h('div', `isl-tree-dicon ${isResearch(sel) ? 'is-research' : 'is-money'} ${sel.big ? 'is-dust' : ''}`);
      ic.style.setProperty('--br', L.color);
      if (st === 'ring' && !isGoalTier(sel)) ic.append(h('span', 'isl-tree-q', '?'));
      else ic.append(iconOf(sel.id, 48));
      const txt = h('div');
      txt.append(titleEl(s, sel));
      // 区分：研究パネル（レベルなし）／お金パネル（Lv 3 / 5）
      if (st !== 'ring' && st !== 'sealed' && st !== 'soon') txt.append(catLine(s, sel, !!only));
      // 取ったパネルで数字の効果の行があるものは、説明の代わりに「いまの効果 → 次のレベル」を出す
      if ((st !== 'ring' || isGoalTier(sel)) && !sel.sealed && !(st === 'done' && !only && shownOf(sel).base.length)) txt.append(h('p', '', sel.note));
      txt.append(...infoLines(s, sel, st));
      // チュートリアル中はレベルの段を出さない（案内の画面を変えない）
      if (st === 'done' && !only) {
        const eff = effLines(s, sel);
        if (eff) txt.append(eff);
      }
      top2.append(ic, txt);
      const tr = trainingOf(s, sel.id);
      const lv = lvOf(s, sel.id);
      const mx = maxLv(sel);
      const label =
        st === 'done'
          ? isResearch(sel)
            ? t('研究済み', 'Researched')
            : only
            ? t('開放済み', 'Unlocked')
            : lv >= mx
            ? t('最大レベル', 'Max level')
            : t(`Lv ${lv + 1} に上げる ${nextPrice(s, sel)}`, `Level up to ${lv + 1} · ${nextPrice(s, sel)}`)
          : tr
            ? t(`修行中（あと ${tr.left} 日）`, `Training (${tr.left} d left)`)
            : st === 'ring' || st === 'sealed'
              ? t('まだ開いていない', 'Not open yet')
              : st === 'soon'
                ? t('準備中', 'Coming soon')
                : st === 'locked'
                  ? t('まだ開放できない', 'Locked')
                  : st === 'poor' && isResearch(sel)
                    ? shortOf(s, sel)
                    : learnLabel(sel);
      const levelable = st === 'done' && lv < mx && !only;
      const b = btn(label, () => (st === 'done' ? tryLevel(sel) : tryLearn(sel)), st === 'open' || (levelable && canLevel(s, sel)) ? `is-on ${sel.big ? 'is-dust' : ''}` : '');
      // チュートリアル中のほかのパネルは、押せるがマインちゃんが止める
      b.disabled = levelable ? !canLevel(s, sel) : st !== 'open' && !(only && sel.id !== only && st !== 'done');
      if (levelable && !canLevel(s, sel)) top2.append(h('small', 'isl-warn', t(`あと ${money(nextLevelCost(s, sel) - s.money)} 足りない`, `${money(nextLevelCost(s, sel) - s.money)} short`)));
      if (levelable && canLevel(s, sel)) top2.append(h('small', 'isl-dim', t('取ったパネルをダブルタップしても上げられます', 'Double-tap an unlocked panel to level it up too')));
      // 研究パネルの RP 不足はボタンに「あと N RP（発掘で貯まる）」と書く
      if (st === 'poor' && !isResearch(sel)) top2.append(h('small', 'isl-warn', shortOf(s, sel)));
      if (st === 'open') top2.append(h('small', 'isl-dim', isResearch(sel) ? t('パネルをダブルタップしても研究できます', 'Double-tap a panel to research it too') : t('パネルをダブルタップしても開放できます', 'Double-tap a panel to unlock it too')));
      detail.append(top2, b);
    } else if (sealed) detail.append(h('p', 'isl-dim', t('真ん中の本社を押して、開放しましょう。開放すると、事業ごとの強化の枝が広がります。', 'Tap HQ in the middle to unlock it. Upgrade branches for each business will spread out.')));
    else detail.append(h('p', 'isl-dim', t('四角は研究パネル（研究ポイントで開く・レベルなし）、菱形はお金パネル（資金で開く・Lv5 まで上げられる）。パネルを押すと説明が出ます（ダブルタップでも開く）。', 'Squares are research panels (RP, no levels); diamonds are money panels (funds, up to Lv5). Tap a panel for details (or double-tap to unlock).')));
    // ズーム
    const zoom = h('div', 'isl-tree-zoom');
    zoom.append(
      btn('+', () => ((view.zoom = Math.min(ZMAX, view.zoom * 1.2)), place())),
      btn('−', () => ((view.zoom = Math.max(ZMIN, view.zoom / 1.2)), place())),
      btn(t('全体', 'All'), () => {
        view.zoom = fit();
        view.x = 0;
        view.y = 0;
        place();
      }),
    );
    // PC：パネルにマウスを乗せると、くわしい説明
    const card = h('div', 'isl-tree-hover');
    card.hidden = true;
    function hover(el: HTMLElement, fill: () => HTMLElement) {
      if (!matchMedia('(hover: hover) and (pointer: fine)').matches) return;
      el.addEventListener('pointerenter', (e) => {
        if (e.pointerType !== 'mouse' || drag || ringFx) return;
        card.replaceChildren(fill());
        card.hidden = false;
        const r = el.getBoundingClientRect();
        const w = wrap.getBoundingClientRect();
        const cw = Math.min(280, w.width - 16);
        card.style.width = `${cw}px`;
        let left = r.right - w.left + 10;
        if (left + cw > w.width - 8) left = r.left - w.left - cw - 10;
        card.style.left = `${Math.max(8, left)}px`;
        card.style.top = `${Math.max(8, Math.min(w.height - 160, r.top - w.top))}px`;
      });
      el.addEventListener('pointerleave', () => (card.hidden = true));
    }
    if (sealed) {
      chips.hidden = true;
      cur.hidden = true;
      zoom.hidden = true;
    }
    wrap.append(vp, top, zoom, detail, card, stop);
    // 外周が開く演出：終わるまで操作を受けない。最後にマインちゃんの一言と「OK」
    if (fx) {
      const curtain = h('div', 'isl-tree-curtain');
      const left = Math.max(0, RING_MS - (performance.now() - fx.t0));
      const say = () => {
        if (!curtain.isConnected) return;
        fx.talk = true;
        const box = h('div', 'isl-tree-ringtalk');
        const mi = h('img');
        mi.src = assetUrl('mch/Image/Characters/navi_ain_speak_00_talk.png');
        mi.alt = '';
        const p = h('p');
        p.append(rich(t(`[[${tierArea(fx.tier)}]]が開いた！ 外周のパネルが取れるようになったよ。🏅 エンブレムが要るものもあるから、セクタを制覇して集めよう`, `The [[${tierArea(fx.tier)}]] is open! Outer panels are now available. Some need 🏅 emblems, so conquer sectors to collect them`)));
        const ok = btn(t('OK', 'OK'), () => {
          ringFx = null;
          after(ctx);
        }, 'is-on');
        const col = h('div', 'isl-tree-ringtalk-body');
        col.append(p, ok);
        box.append(mi, col);
        curtain.append(box);
        curtain.classList.add('is-talk');
      };
      if (fx.talk || left <= 0) say();
      else setTimeout(say, left);
      wrap.append(curtain);
    }
    body.append(wrap);
    // チュートリアル：開放できたら ✕ を光らせて、元の画面に戻ってもらう
    const closeBtn = wrap.closest('.isl-sheet')?.querySelector('.isl-sheet-head .isl-btn');
    closeBtn?.classList.toggle('is-guide', !!only && has(s, only));
    // チュートリアル：本社が開いたら、「人材の募集」へカメラを寄せる（広がる演出が終わってから）
    if (target && !tutFocused) {
      tutFocused = true;
      const goTo = POS.get(target)!;
      const from = { x: view.x, y: view.y, z: view.zoom };
      const wait = bursting ? Math.max(0, BURST_MS - (performance.now() - burst)) + 200 : 300;
      setTimeout(() => {
        if (!world.isConnected) return;
        const z1 = innerWidth < 600 ? 0.8 : 0.95;
        const t0 = performance.now();
        const a = { x: view.x, y: view.y, z: view.zoom > 0 ? view.zoom : from.z > 0 ? from.z : 0.6 };
        // 下にマインちゃんの一言と説明の帯があるので、パネルは画面の上のほう（高さの 35%）に
        const lift = (vp.clientHeight * 0.15) / (UNIT * z1);
        const anim = (now: number) => {
          if (!world.isConnected) return;
          const k = Math.min(1, (now - t0) / 900);
          const e = 1 - Math.pow(1 - k, 3);
          view.x = a.x + (goTo.x - a.x) * e;
          view.y = a.y + (goTo.y + lift - a.y) * e;
          view.zoom = a.z + (z1 - a.z) * e;
          place();
          if (k < 1) requestAnimationFrame(anim);
        };
        requestAnimationFrame(anim);
      }, wait);
    }

    /** 全体が見える大きさ（内側だけのときは外周のぶんを入れない） */
    // 開いているいちばん外のエリアまで（閉じた外周は、ひとつ外の境目の円がちょうど見えるくらい。開く演出のあいだはそのエリアまで）
    const openTop = [...OUTER].reverse().find((x) => ringOpen(s, x));
    const fitR = fx ? RING_OUT[fx.tier] + 0.9 : openTop ? RING_OUT[openTop] + 0.9 : RING_EDGE.U + 0.35;
    const fit = () => Math.max(ZMIN, Math.min(1, Math.min(vp.clientWidth, vp.clientHeight) / (2 * fitR * UNIT)));
    /** いま見ている枝のチップを光らせる（スマホでは横スクロールの帯の中で見える所へ） */
    let curBr: Branch | null = null;
    const markChip = () => {
      const r = Math.hypot(view.x, view.y);
      let best: Branch | null = null;
      if (r > 1.2) {
        const a = Math.atan2(view.y, view.x);
        let bd = Infinity;
        for (const br of BRANCHES) {
          const d = Math.abs(Math.atan2(Math.sin(a - (LAYOUT[br.key].angle * Math.PI) / 180), Math.cos(a - (LAYOUT[br.key].angle * Math.PI) / 180)));
          if (d < bd) {
            bd = d;
            best = br.key;
          }
        }
      }
      if (best === curBr) return;
      curBr = best;
      for (const [k, el] of chipEls) el.classList.toggle('is-cur', k === best);
      const el = best ? chipEls.get(best) : null;
      if (el && chips.scrollWidth > chips.clientWidth) {
        const l = el.offsetLeft - chips.offsetLeft;
        if (l < chips.scrollLeft || l + el.offsetWidth > chips.scrollLeft + chips.clientWidth) chips.scrollLeft = Math.max(0, l - (chips.clientWidth - el.offsetWidth) / 2);
      }
    };
    /** そのパネルへカメラを寄せて選ぶ（「上げられる：N」から） */
    function flyTo(id: string) {
      const goTo = POS.get(id);
      if (!goTo) return;
      view.sel = id;
      const t0 = performance.now();
      const a = { x: view.x, y: view.y, z: view.zoom };
      const z1 = Math.max(a.z, innerWidth < 600 ? 0.7 : 0.85);
      const lift = (vp.clientHeight * 0.12) / (UNIT * z1);
      const anim = (now: number) => {
        if (!world.isConnected) return;
        const k = Math.min(1, (now - t0) / 700);
        const e = 1 - Math.pow(1 - k, 3);
        view.x = a.x + (goTo.x - a.x) * e;
        view.y = a.y + (goTo.y + lift - a.y) * e;
        view.zoom = a.z + (z1 - a.z) * e;
        place();
        if (k < 1) requestAnimationFrame(anim);
        else after(ctx);
      };
      requestAnimationFrame(anim);
    }
    function place() {
      if (view.zoom < 0) view.zoom = fit();
      if (!view.zoom) view.zoom = innerWidth < 600 ? 0.62 : 0.8;
      const c = px({ x: view.x, y: view.y });
      world.style.transform = `translate(${vp.clientWidth / 2 - c.x * view.zoom}px, ${vp.clientHeight / 2 - c.y * view.zoom}px) scale(${view.zoom})`;
      markChip();
    }
    // 引っぱって動かす・2 本指でつまんで拡大縮小（スマホ）・ホイールで拡大（PC）
    const ZMIN = 0.18;
    const ZMAX = 1.8;
    const pts = new Map<number, { x: number; y: number }>();
    let drag: { x: number; y: number; vx: number; vy: number } | null = null;
    let pinch: { d0: number; z0: number; wx: number; wy: number } | null = null;
    let moved = false;
    /** 画面の点（client 座標）にある、木の上の位置 */
    const worldAt = (cx: number, cy: number, zoom = view.zoom) => {
      const r = vp.getBoundingClientRect();
      return { x: view.x + (cx - r.left - r.width / 2) / (UNIT * zoom), y: view.y + (cy - r.top - r.height / 2) / (UNIT * zoom) };
    };
    /** 木の上の位置 w が、画面の点 (cx, cy) に来るように動かす */
    const pinTo = (w: { x: number; y: number }, cx: number, cy: number) => {
      const r = vp.getBoundingClientRect();
      view.x = w.x - (cx - r.left - r.width / 2) / (UNIT * view.zoom);
      view.y = w.y - (cy - r.top - r.height / 2) / (UNIT * view.zoom);
    };
    const mid = () => {
      const [a, b] = [...pts.values()];
      return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, d: Math.hypot(a.x - b.x, a.y - b.y) };
    };
    vp.addEventListener('pointerdown', (e) => {
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pts.size === 2) {
        const m = mid();
        const w = worldAt(m.x, m.y);
        pinch = { d0: Math.max(10, m.d), z0: view.zoom, wx: w.x, wy: w.y };
        drag = null;
        moved = true;
        card.hidden = true;
      } else if (pts.size === 1) {
        drag = { x: e.clientX, y: e.clientY, vx: view.x, vy: view.y };
        moved = false;
      }
    });
    vp.addEventListener('pointermove', (e) => {
      if (!pts.has(e.pointerId)) return;
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pinch && pts.size >= 2) {
        const m = mid();
        view.zoom = Math.max(ZMIN, Math.min(ZMAX, (pinch.z0 * m.d) / pinch.d0));
        pinTo({ x: pinch.wx, y: pinch.wy }, m.x, m.y);
        place();
        return;
      }
      if (!drag) return;
      const dx = e.clientX - drag.x;
      const dy = e.clientY - drag.y;
      if (Math.hypot(dx, dy) > 6) {
        moved = true;
        card.hidden = true;
      }
      view.x = drag.vx - dx / (UNIT * view.zoom);
      view.y = drag.vy - dy / (UNIT * view.zoom);
      place();
    });
    const end = (e: PointerEvent) => {
      pts.delete(e.pointerId);
      if (pts.size < 2) pinch = null;
      // 2 本指のあと 1 本だけ残ったら、その指で引っぱり直す
      const rest = [...pts.values()][0];
      drag = rest ? { x: rest.x, y: rest.y, vx: view.x, vy: view.y } : null;
      if (!pts.size) setTimeout(() => (moved = false), 0);
    };
    vp.addEventListener('pointerup', end);
    vp.addEventListener('pointercancel', end);
    vp.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        const w = worldAt(e.clientX, e.clientY);
        view.zoom = Math.max(ZMIN, Math.min(ZMAX, view.zoom * (e.deltaY < 0 ? 1.12 : 1 / 1.12)));
        pinTo(w, e.clientX, e.clientY);
        place();
      },
      { passive: false },
    );
    requestAnimationFrame(place);
    // スマホ：説明の帯が高くなっても、ズームのボタンが隠れないように
    requestAnimationFrame(() => {
      if (innerWidth < 600 && detail.isConnected) zoom.style.bottom = `${detail.offsetHeight + 16}px`;
    });
  });
}
