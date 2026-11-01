/**
 * アイランド（フェーズ 1）の高速自動プレイ：クリア時間の計測ハーネス（UI なし・モデル層だけ）。
 * 3 つの遊び方（最短 rta／通常 normal／100% full）で、セクタごとの「制覇（2 か月続けて 1 位）までの月数」と実時間の見積もりを出す。
 * 実行：`npm run island:sim`（tests/island-p1-sim.test.ts から呼ぶ。結果は console と docs/ISLAND_BALANCE.md）。
 * ゲームの数値（data.ts・式）は変えない。ここは計測だけ。
 */
import { writeFileSync } from 'node:fs';
import { aptitude, anyOfMet, ADS, DIG_BALANCE, DIG_PANELS, INVEST, MISSIONS, P1B, PRODUCT, PRODUCTS, SECTORS, SKILL, SKILLS, isResearch, maxLv, rpCost, type Skill, TIERS, UNCOMMON, sku, skuParts, techSkill, type Mat, type Sku, type Task, type Tier } from '../../src/island/p1/data';
import { managerApt, sectorDef } from '../../src/island/p1/company';
import { crowned, moveTo } from '../../src/island/p1/land';
import { MEET_IDLE_DAYS } from '../../src/island/p1/digmeet';
import {
  accept,
  allowedDirs,
  assign,
  build,
  buy,
  canBuild,
  claim,
  craftDays,
  dig,
  digNext,
  digPower,
  digSite,
  blast,
  blastCost,
  digLayouts,
  siteState,
  DUNGEON,
  autoExhibit,
  extRank,
  museumSlots,
  hasBlast,
  findCells,
  layerOpen,
  sessionSec,
  siteDiggable,
  skillLock,
  hasLetter,
  peekView,
  applyPermit,
  endRun,
  grantFirst,
  permitFee,
  siteTopic,
  startRun,
  presentLock,
  topicProgress,
  present,
  batchOf,
  develop,
  gapOf,
  gateToll,
  has,
  hasRoute,
  knownOf,
  needFor,
  recommend,
  tierOk,
  heroStats,
  hire,
  invest,
  investCost,
  invLv,
  learn,
  levelUp,
  levelLock,
  lvOf,
  nextLevelCost,
  myShops,
  myWorkshop,
  newP1,
  offeredMissions,
  openGate,
  poolCap,
  poolFree,
  poolUsed,
  priceOf,
  procItems,
  procLeft,
  procMats,
  recipeOf,
  runAd,
  sellEstimate,
  setPart,
  setShelf,
  shelfCount,
  siteInfo,
  stageCaps,
  bottleneck,
  whatIf,
  startCraft,
  step,
  toggleProcItem,
  tutSpot,
  unitCost,
  matPrice,
  LEARNABLE,
  openRing,
  ringOpen,
  ringsDue,
  setDustShop,
  skillSoon,
  skillTier,
  type P1State,
  type PBuilding,
  type Report,
  type Stage,
  productsOf,
} from '../../src/island/p1/model';

// ---------------------------------------------------------------- 実時間の単価（docs/ISLAND_UX_CHARTER.md「5. 進行とテンポ」）

/**
 * 1 日 1.2 秒・ひと月 36 秒。rta は ⏩（×4）常用でひと月 9 秒、行動 1 回 2 秒、月末ポーズ 10 秒。
 * normal は ×1 でひと月 36 秒、行動 1 回 4 秒、月末ポーズ 60 秒、チュートリアル 10 分。full は normal と同じ単価。
 */
export const SIM_TIME = {
  rta: { month: 9, action: 2, pause: 10, tutorial: 0, talk: 3 },
  normal: { month: 36, action: 4, pause: 60, tutorial: 600, talk: 20 },
  full: { month: 36, action: 4, pause: 60, tutorial: 600, talk: 20 },
} as const;

/**
 * v9：発掘作業の仮定（docs/ISLAND_BALANCE.md「v9 の計算・方針の変更」）。v10：発掘のスキルツリー（tree）。
 * - 1 回の発掘作業は現実の 15 秒（sessionSec。v10 は追加申請で延びる）。そのあいだもゲームの時間は流れる（ひと月の秒数 SIM_TIME.month で日数に直す：
 *   通常・100% は ×1 で 12.5 日、最短は ⏩ ×4 で 50 日）。作業のあいだに打つ数は 15 秒 × DIG_BALANCE.simTapsPerSec（1 秒に 4 打）を、作業の日数に均して打つ。
 * - 作業の時間はひと月の時間に重なるので、実時間には足さない（荒れ地を押して始める 1 回を行動 1 回に数える）。
 * - perMonth：ひと月に始める作業の回数のめやす（前の作業が終わってから。×1 では 1 回 12.5 日なので、続けて掘っても 2.4 回まで）。
 *   null は、前の作業が終わったらすぐ次を始める（続けて掘る）。
 * - target：打つマスの選び方。know＝配置を知っている（同じセクタはいつも同じ配置）→ お題の範囲を手前から。sweep（v11）＝覗き見が出ているマス → 取りかけ → 浅いマス。
 * - permit：次の荒れ地の発掘許可を申請する目安（申請料の何倍の資金があれば。最短はお題のある荒れ地だけ）。
 * - digger：発掘隊（作業のあいだだけ手伝う）の担当（0＝置かない／1＝いつも 1 人）。
 * - tree（v10）：発掘の枝のパネルの上げ方。'deep'＝お題のための「深い層の許可」Lv1 だけ（最短）／'share'＝月末に、月の売上の share（20%）を積み立てた枠で（買ったあとも 1 万 G 残るとき。研究の目利き Lv2 を先に）
 *   発掘のパネルの安い順に（お題が許可の無い層に残っていれば深い層の許可を先に。通常）／'all'＝ほかのスキルと同じく安い順にまとめて全部 Lv5 まで（100%）。
 *   以前の道具（ツルハシ・ランタン・発破の道具）はパネルに移ったので、道具は買わない。発破は「発破」のパネルがあれば使う。
 */
export const SIM_DIG = {
  rta: { perMonth: null as number | null, target: 'know', permit: 2, digger: 0, tree: 'deep' as 'deep' | 'share' | 'all', share: 0, dungeon: 0, museum: null as number | null },
  normal: { perMonth: 2 as number | null, target: 'sweep', permit: 5, digger: 0, tree: 'share' as 'deep' | 'share' | 'all', share: 0.2, dungeon: 1, museum: 40000 as number | null },
  full: { perMonth: null as number | null, target: 'sweep', permit: 1.5, digger: 1, tree: 'all' as 'deep' | 'share' | 'all', share: 0, dungeon: 3, museum: 20000 as number | null },
} as const;
/*
 * v12（発掘 v2 の 4 段目）：dungeon＝ひと月に潜る回数のめやす（掘れる荒れ地が無いときだけ。最短は潜らない＝今どおり）。
 * museum＝遺物の展示館を建てる目安（建てたあとも残る資金。null は建てない）。建てたら月末に価値の高い遺物から飾る（autoExhibit）。
 * 100% は資金に余裕があれば展示室の増築も。ダンジョンでは、上のランクの覗き見 → いちばん深いマス（縦に掘り進める）を打つ
 */
/** 作業 1 回のゲームの日数（その方針の速さで、現実の作業時間が何日か。s があればそのときの作業時間＝追加申請で延びる） */
export const runDays = (p: PolicyId, s?: P1State) => (s ? sessionSec(s) : DIG_BALANCE.sessionSec) / (SIM_TIME[p].month / 30);
/** 作業 1 回で手で打つ数（作業時間 × 1 秒に 4 打） */
export const runTaps = (s?: P1State) => (s ? sessionSec(s) : DIG_BALANCE.sessionSec) * DIG_BALANCE.simTapsPerSec;
/** 100%：セクタの荒れ地 4 か所をぜんぶ掘りきるまで次へ移らない（制覇のあと、この月数まで待つ） */
export const FULL_DIG_WAIT = 24;

/** 1 セクタの打ち切り（か月） */
export const MONTH_CAP = 120;

export type PolicyId = 'rta' | 'normal' | 'full';
export const POLICY_NAME: Record<PolicyId, string> = { rta: '最短', normal: '通常', full: '100%' };

// ---------------------------------------------------------------- 記録

export interface SectorRun {
  id: string;
  tier: Tier;
  /** 着いた日・開店の日・制覇の月の締めの日・離れた日（ゲームの日） */
  arrived: number;
  open: number | null;
  topDay: number | null;
  left: number | null;
  /** 制覇（2 か月続けて 1 位）までの月数（開店からの月の締めの回数）。v3 までは「1 位までの月数」 */
  months: number | null;
  /** 初めて 1 位になった月 */
  first: number | null;
  /** 制覇の月の売上・そのときの資金・スキル数 */
  rev: number;
  money: number;
  skills: number;
  /** 制覇までの行動の数・月の締めの数 / 離れるまで */
  actTop: number;
  pauseTop: number;
  act: number;
  pause: number;
  /** v10c：着いてから離れるまでの売上の合計・うち復刻品 */
  allRev: number;
  relicRev: number;
  /** v9：発掘（打った数：手・自動（発掘隊）・発破、作業の回数・許可の数、入った RP、研究パネルを開けた枚数、RP が足りなくて止まった月） */
  dig: DigRec;
  /** 月ごとの締め（順位・売上・資金・ボトルネック） */
  /** bn：ゲームの bottleneck()（月の締め）、read：人が読むボトルネック（readBn） */
  log: { m: number; rank: number; rev: number; top: number; money: number; bn: Stage | undefined; read: Stage }[];
}

export interface DigRec {
  /** 手で打った数（発掘作業のあいだ） */
  mid: number;
  /** 発掘作業の回数・発掘許可をもらった荒れ地の数 */
  runs: number;
  permits: number;
  auto: number;
  blast: number;
  rp: number;
  research: number;
  rpBlocked: number;
  /** 会話（発掘との出会い・研究成果の発表）の数 */
  talks: number;
  talksTop: number;
  /** お題がそろった月（着いてからの月の締めの回数）・依頼状を待った月（制覇のあと、依頼状が無くて移れなかった月） */
  topicsAt: number | null;
  letterWait: number;
  /** 掘りきった荒れ地の数・掘り残したマス（離れたとき） */
  done: number;
  left: number;
}
const newDigRec = (): DigRec => ({ mid: 0, runs: 0, permits: 0, auto: 0, blast: 0, rp: 0, research: 0, rpBlocked: 0, talks: 0, talksTop: 0, topicsAt: null, letterWait: 0, done: 0, left: 0 });

export interface RunResult {
  policy: PolicyId;
  seed: number;
  sectors: SectorRun[];
  /** 全部の行動の数（種類ごと） */
  actions: Record<string, number>;
  days: number;
  /** ゴールに届いた（rta：Uncommon で 1 位／normal：5 セクタ／full：全部） */
  done: boolean;
  /** 打ち切りの理由 */
  stop?: string;
  skillsAt: { id: string; day: number; sector: string }[];
  /** 100% のゴールの中身 */
  goal?: { crowns: number; skills: number; maxed?: number; levels?: number; missions: number; missing?: string[] };
  /** v8：お金の使い道（G）：お金パネル（開放・レベル上げ）・発掘の道具（発破の火薬代を含む）・関所と出店許可・最後に残った資金 */
  spend: { money: number; tools: number; fees: number; end: number };
  /** v8：研究パネルを開けた枚数（ランクごと）・C の研究パネルがそろったときにいたセクタの番号（1 始まり） */
  research: { C: number; U: number; allC: number | null };
  /** v10c：開いた復刻品のレシピの数（最後） */
  recipes: number;
  /** v12：復興・ダンジョン・展示館（最後に：復興した荒れ地の合計・ダンジョンの数・潜った回数・最深・見つけた上のランクの種類と数・展示館の収入の合計・節目） */
  v12: { revived: number; dungeons: number; dives: number; best: number; found: Record<'U' | 'R' | 'E' | 'L', number>; got: Record<'U' | 'R' | 'E' | 'L', number>; museum: boolean; income: number; marks: number };
}

// ---------------------------------------------------------------- 方針

/**
 * 枝の中で、普通の人が説明を読んで選ぶ順（詰まりを直すのに効く順）。
 * 「@id:段」は設備投資（その段まで。お店・倉庫は全部の棟を。v4：棚・作業台・荷車などはスキルから建物ごとの設備投資へ移った）
 */
const BRANCH_ORDER: Record<Stage, string[]> = {
  // v5：スキルツリー v2 の新しいパネル（ABC 分析・POS・自動発注・5S・ロット・カイゼン・定期便・配送ルート・VMD・ゴールデンゾーン など）。外周（U・R）は開いてから
  buy: ['stock1', 'bulk', 'abc', 'swift', '@stockroom:1', 'eye', 'pos', 'auto_order', 'stock2', 'bulk2', '@rack:1', 'stock3', 'contract', 'b_partner', 'direct'],
  craft: ['@bench:1', 'jig', 'five_s', 'chair', 'jig2', 'lot', 'kaizen', '@bench:2', 'pot', 'night', 'mold', 'line'],
  haul: ['loading', '@carts:1', 'shortcut', 'timetable', '@backroom:1', 'route_opt', '@truck:1', '@carts:2', 'hub', 'joint', 'crossdock', 'fleet'],
  sell: ['@shelves:1', 'host', '@staffroom:1', 'display', 'vmd', 'hours', 'shop2', 'golden', 'pop', '@shelves:2', 'set', 'point', 'shop3', 'b_sign', 'order', 'fair', 'concierge', 'b_premium'],
};
/** 詰まりの段 → スキルツリーの枝 */
const STAGE_BRANCH: Record<Stage, string> = { buy: 'buy', craft: 'craft', haul: 'logi', sell: 'shop' };
/** 詰まりの段 → その段の大きめの研究パネル（以前の ✨）。通常の方針は、RP がたまったら詰まりの段のものを取る */
const DUST_OF: Record<Stage, string> = { buy: 'd_buy', craft: 'd_craft', haul: 'd_logi', sell: 'd_shop' };
/**
 * 100% のゴール：Common・Uncommon の外周までの取れるパネル（Rare 以降のセクタはまだ遊べないので外周が開かない）。
 * v8：先に要るパネルが準備中のものは、いまは取れないので数えない（「技能の大会」は先に要るものを Uncommon の技「伝統工芸の継承」に替えたので、いまは 0 件）
 */
export const fullSkills = () => LEARNABLE().filter((k) => ['C', 'U'].includes(skillTier(k)) && !(k.requires ?? []).some((r) => SKILL[r] && skillSoon(SKILL[r])));

/** 最短：知っている人の取り方（アンコモンへ一直線、そのあと売り場と運搬）。「@id:段」は設備投資 */
const RTA_SKILLS = [
  'hire', '@bench:1', 'pot', 'route_cloth', 'route_paper', '@shelves:1', 'host', '@carts:1', 'loading', 'stock1', 'jig', 'bulk', '@stockroom:1', 'b_sign', 'shop2', 'route_gem', '@truck:1', '@bench:2', 'jig2', 'stock2', '@shelves:2', 'display', '@staffroom:1', 'shortcut', '@backroom:1', 'chair', 'lounge', 'shop3', 'swift',
  // v5（スキルツリー v2）：売り場を強くする工夫 → ✨ 名物店主 → Uncommon の外周 → 製造・物流・調達の工夫
  'vmd', 'golden', 'pos', 'point', 'set', 'd_shop', 'order', 'fair', 'flow', 'dyn', 'five_s', 'kaizen', 'lot', 'night', 'mold', 'timetable', 'route_opt', 'joint', 'abc', 'auto_order', 'inventory', 'erp', 'manual', 'incentive',
];

/**
 * v10：発掘の枝のパネルの次の一手（未取得なら開放、取得済みなら次の Lv）と値段。いま取れなければ null（資金だけが足りないときは値段を返す）
 */
export function digStep(s: P1State, id: string): { cost: number; run: () => string | null } | null {
  const k = SKILL[id];
  const lv = lvOf(s, id);
  if (lv === 0) {
    const e = skillLock(s, k);
    if (e !== null && e !== 'money') return null;
    return { cost: k.cost, run: () => learn(s, id) };
  }
  const e = levelLock(s, k);
  if (e !== null && e !== 'money') return null;
  return { cost: nextLevelCost(s, k), run: () => levelUp(s, id) };
}
/** まだ見つけていないお題が、いまの許可で掘れない層に眠っている（深い層の許可が要る） */
export function topicLocked(s: P1State): boolean {
  if (!s.dig) return false;
  return digLayouts(s.dig.sector).some((L) => {
    if (L.topic == null || s.dig!.topics.includes(L.topic)) return false;
    const f = L.finds.find((x) => x.item.kind === 'ext' && !!x.item.topic);
    return !!f && !layerOpen(s, L, f.layer);
  });
}
/** 深い層の許可の次の Lv に要るもの（先に要るパネルが無ければ、その根もとから） */
export const DEEP_CHAIN = ['dig_ext', 'dig_lamp', 'dig_deep'];
/** 「@id:段」→ 設備投資の id と段 */
const invOf = (x: string): { id: string; lv: number } | null => {
  if (!x.startsWith('@')) return null;
  const [id, lv] = x.slice(1).split(':');
  return { id, lv: Number(lv) || 1 };
};
/** 設備投資を付ける建物（工事が終わったもの）。工房は 1 つ、お店・倉庫は全部の棟 */
const invTargets = (s: P1State, id: string): PBuilding[] => s.buildings.filter((b) => b.owner === 'me' && b.left <= 0 && P1B[b.id]?.kind === INVEST[id]?.kind);

interface Ctx {
  /** v10：通常の方針の発掘の枝の枠（月の売上の 20% を積み立てる） */
  digBudget?: number;
  policy: PolicyId;
  /** 行く順のセクタ */
  route: string[];
  /** いま目指しているセクタの番号 */
  at: number;
  lineup: Sku[];
  lineupDirty: boolean;
  /** 今月建てたお店の数 */
  shopsThisMonth: number;
  /** 月末の判断をする（normal・full は月末ポーズでまとめて考える） */
  monthEnd: Report | null;
  lastBn: Stage | null;
  /** 使わないスキル（効き目の比較用） */
  ban: Set<string>;
  /** 1 か所目だけで止める（効き目の比較用） */
  onlyFirst: boolean;
  /** 打ち切り */
  stop?: string;
  /** v8：発掘（月の締めからの日数・手の速さの端数・最短の道） */
  dayInMonth: number;
  handCarry: number;
  /** v8：今月の月末に開けた研究パネルの数 */
  rpMoves: number;
  /** 最短：いま狙っているもの（DigFind の番号） */
  digGoal?: number;
  /** v9：いまの発掘作業の残りの日数・今月始めた作業の回数 */
  runLeft: number;
  runsMonth: number;
  /** v12：今月ダンジョンに潜った回数 */
  divesMonth?: number;
}

const DIRS = ['rd', 'ld', 'lu', 'ru'] as const;

/** 手の届く人（ほかのセクタのマネージャーと、技の修行中の人を除く） */
const crew = (s: P1State) => s.staff.filter((x) => x.task !== 'manager' && x.task !== 'train');
const craftApt = (hero: number, s: P1State) => aptitude(s.staff.find((x) => x.hero === hero)!.stats, 'craft');

/** 道路に面した空き地（建物ごと）。お店は下見でいちばん売れる所（遠いと運ぶのに日数がかかるので少し引く） */
function pickLot(s: P1State, id: string, first: boolean): [number, number, (typeof DIRS)[number]] | null {
  if (P1B[id].kind === 'workshop') return tutSpot(s, id);
  if (P1B[id].kind === 'shop') {
    if (first) return tutSpot(s, id);
    let best: [number, number, (typeof DIRS)[number]] | null = null;
    let score = -Infinity;
    for (let j = 0; j < s.n; j++)
      for (let i = 0; i < s.n; i++)
        for (const d of allowedDirs(s, id, i, j)) {
          const si = siteInfo(s, id, i, j, d);
          if (!si) continue;
          const v = si.units - 0.5 * si.fromMine - 1.5 * si.days;
          if (v > score) {
            score = v;
            best = [i, j, d];
          }
        }
    return best;
  }
  for (let j = 0; j < s.n; j++)
    for (let i = 0; i < s.n; i++) {
      const d = allowedDirs(s, id, i, j);
      if (d.length) return [i, j, d[0]];
    }
  return null;
}

/** その商品の素材のルートが全部ある（会社のルート ∪ セクタの特産） */
const routesOk = (s: P1State, x: Sku) => Object.keys(recipeOf(x)).every((m) => hasRoute(s, m as Mat));
/** その商品の技がある（技が要らない基礎の商品も true） */
const techOk = (s: P1State, key: string) => !PRODUCT[key].tech || has(s, techSkill(PRODUCT[key].tech!));
/** アンコモンを作れる職人（いまいる人） */
const uCrafters = (s: P1State) => crew(s).filter((x) => aptitude(x.stats, 'craft') >= UNCOMMON.minCraft);

/** 作業台ごとに作るもの：売れる見込み × 利益（作業台 1 つの月の量で頭打ち）の大きい順。アンコモンは作れるときだけ */
function chooseLineup(s: P1State, c: Ctx): Sku[] {
  const benches = Math.max(1, s.slots.length);
  // 並べられる種類：お店の棚の数（どのお店にも同じ並びを置く）
  const shopBs = s.buildings.filter((b) => b.owner === 'me' && P1B[b.id]?.kind === 'shop');
  // 棚はお店ごとの設備投資なので、いちばん棚の多いお店に合わせる（棚の少ないお店は前から並べる）
  const kinds = Math.max(1, Math.min(benches, Math.max(1, ...shopBs.map((b) => shelfCount(s, b)))));
  const tier = s.tier ?? 'C';
  const nU = uCrafters(s).length;
  const cands: { x: Sku; v: number; key: string }[] = [];
  // v10c：通常・100% は、開いた復刻品も並べる候補に（遺物のランクだけ。技・魔法の釜・商品開発は要らない）
  for (const p of c.policy === 'rta' ? PRODUCTS : productsOf(s)) {
    if (!techOk(s, p.key) || !tierOk(p, tier)) continue;
    for (const r of p.relic ? [p.relic.rank] : (['C', 'U'] as const)) {
      // 売れる見込み：飽和（他店で供給が足りている）を入れた見込み
      const est = Math.max(r === 'U' ? 4 : 1, sellEstimate(s, p.key, r));
      const x = sku(p.key, r);
      if (!routesOk(s, x)) continue;
      if (r === 'U' && (p.relic ? nU === 0 : !has(s, 'pot') || !s.dev.includes(p.key) || nU === 0)) continue;
      const pull = r === 'U' ? UNCOMMON.pull : TIERS[tier].commonPull;
      const perBench = ((30 * 0.85) / craftDays(s, x)) * batchOf(x);
      const units = Math.min(est * pull, perBench);
      cands.push({ x, v: units * (priceOf(s, x) - unitCost(s, x)), key: p.key });
    }
  }
  cands.sort((a, b) => b.v - a.v);
  const out: Sku[] = [];
  let usedU = 0;
  // 依頼で要る商品（100% だけ）：受けている依頼の商品を 1 台ぶん入れる
  if (c.policy === 'full') {
    const want: Record<string, string> = { sensu100: 'Sensu', lantern50: 'Lantern', c2_goblet: 'Goblet', c3_knife: 'Knife' };
    for (const [m, key] of Object.entries(want)) {
      if (s.missions[m] !== 'accepted' || out.length >= kinds) continue;
      if (out.some((x) => skuParts(x)[0] === key)) continue;
      const cand = cands.find((o) => o.key === key && (skuParts(o.x)[1] === 'C' || usedU < nU));
      if (cand) {
        out.push(cand.x);
        if (skuParts(cand.x)[1] === 'U') usedU++;
      }
    }
    // アンコモンを 5 個売る依頼
    if (s.missions.uncommon === 'accepted' && !out.some((x) => skuParts(x)[1] === 'U') && usedU < nU) {
      const cand = cands.find((o) => skuParts(o.x)[1] === 'U');
      if (cand && out.length < kinds) {
        out.push(cand.x);
        usedU++;
      }
    }
  }
  for (const o of cands) {
    if (out.length >= kinds) break;
    if (out.some((x) => skuParts(x)[0] === o.key)) continue;
    if (skuParts(o.x)[1] === 'U') {
      if (usedU >= nU) continue;
      usedU++;
    }
    out.push(o.x);
  }
  // 残りの作業台は、並べている商品を重ねて作る（アンコモンは職人がいるぶんだけ。いなければ雇うのを待つ）
  const base = out.length;
  for (let k = 0; out.length < benches && base > 0; k++) out.push(out[k % base]);
  return out;
}

// ---------------------------------------------------------------- 行動

export interface Action {
  kind: string;
  run: () => unknown;
  /** v8：お金パネル（開放・レベル上げ）・発掘の道具の支出を数える */
  tag?: 'money' | 'tool';
}
/** 成功した（null・true・建物） */
const ok = (r: unknown) => r === null || r === true || (typeof r === 'object' && r !== undefined);

/** 1 日 1 回の判断：行動のリストを返す */
export function policy(s: P1State, c: Ctx): Action[] {
  const acts: Action[] = [];
  let budget = s.money;
  const spend = (v: number) => (budget -= v);
  // 手元に残す資金：ひと月の決まった費用（給与・維持費・アルバイト）＋ 少し
  const fixed = s.staff.reduce((a, x) => a + x.wage, 0) + s.buildings.filter((b) => b.owner === 'me').reduce((a, b) => a + (P1B[b.id]?.upkeep ?? 0), 0) + Object.values(s.shops).reduce((a, sh) => a + sh.part * 900, 0);
  const reserve = (c.policy === 'rta' ? 3000 : 6000) + fixed;
  const saving = s.cleared && c.at + 1 < c.route.length;

  // ---- 依頼：達成したら受け取る・空きがあれば受ける
  for (const m of MISSIONS) if (s.missions[m.id] === 'done') acts.push({ kind: 'claim', run: () => claim(s, m.id) });
  const accepted = MISSIONS.filter((m) => s.missions[m.id] === 'accepted').length;
  if (accepted < 3) for (const m of offeredMissions(s).slice(0, 3 - accepted)) acts.push({ kind: 'accept', run: () => accept(s, m.id) });

  // ---- 工房
  const wsAny = s.buildings.find((b) => b.owner === 'me' && b.id === 'workshop');
  if (!wsAny) {
    const lot = pickLot(s, 'workshop', true);
    if (lot) acts.push({ kind: 'build', run: () => build(s, 'workshop', ...lot) });
    return acts;
  }
  const ws = myWorkshop(s);

  // ---- 外周：そのランクのセクタに出店したら、スキルツリーを開いて外周を開く（演出を見る）
  for (const tier of ringsDue(s)) openRing(s, tier);
  // ---- 名物店主（✨）：選んだお店がなければ、いちばん売れているお店に
  if (has(s, 'd_shop') && (s.dustShop == null || !s.shops[s.dustShop])) {
    const best = myShops(s).sort((a, b) => (s.shops[b.uid].last?.rev ?? s.shops[b.uid].rev) - (s.shops[a.uid].last?.rev ?? s.shops[a.uid].rev))[0];
    if (best) acts.push({ kind: 'skill', run: () => setDustShop(s, best.uid) || null });
  }
  // ---- スキル（人材の募集はチュートリアルでも取る）
  const pending = new Set<string>();
  let rpUsed = 0;
  const learnable = (id: string) => {
    const k = SKILL[id];
    if (!k) return false;
    // 技の修行は 1 つずつ（修行中・同じ日にもう 1 つ取ろうとしているときは待つ）
    if (k.train && (s.training || [...pending].some((x) => SKILL[x]?.train))) return false;
    // v5：外周（開いていない）・封印・準備中・エンブレム。v8：研究パネルは RP。v10：発掘の枝は出会いのあと（雲の中は取れない）・先に要るパネルの Lv
    if (k.sealed || skillSoon(k) || !ringOpen(s, skillTier(k)) || (s.emblem ?? 0) < (k.emblem ?? 0)) return false;
    if (k.branch === 'dig' && skillLock(s, k) === 'hidden') return false;
    if (isResearch(k) && (s.rp ?? 0) - rpUsed < rpCost(k)) return false;
    return !has(s, id) && !pending.has(id) && !c.ban.has(id) && !(k.requires ?? []).some((r) => (!has(s, r) && !pending.has(r)) || (has(s, r) && lvOf(s, r) < (k.reqLv?.[r] ?? 1))) && anyOfMet(k, (r) => has(s, r) || pending.has(r)) && (s.brand ?? 0) >= (k.brand ?? 0);
  };
  /** 設備投資「@id:段」：その段に届いていない建物ぜんぶ（無ければ取れない） */
  const invNeed = (x: string) => {
    const iv = invOf(x)!;
    if (c.ban.has(`@${iv.id}`) || pending.has(x)) return [];
    // 1 つ下の段まで来ている建物だけ（下の段は、枝の順で先に取る）
    return invTargets(s, iv.id).filter((b) => invLv(b, iv.id) === iv.lv - 1 && investCost(b, iv.id) != null);
  };
  const invCost = (x: string) => invNeed(x).reduce((a, b) => a + (investCost(b, invOf(x)!.id) ?? 0), 0);
  const takeInv = (x: string, keep = reserve) => {
    const bs = invNeed(x);
    const cost = invCost(x);
    if (!bs.length || budget < cost + keep) return false;
    spend(cost);
    pending.add(x);
    const iv = invOf(x)!;
    for (const b of bs) acts.push({ kind: 'invest', run: () => invest(s, b.uid, iv.id) });
    return true;
  };
  /** レベル上げ「lv:id」（v7）：次のレベル（v8：お金パネルだけ） */
  const lvTok = (id: string) => (id.startsWith('lv:') ? SKILL[id.slice(3)] : null);
  const lvCan = (k: Skill) => {
    if (pending.has(`lv:${k.id}`) || c.ban.has(k.id)) return false;
    const e = levelLock(s, k);
    return e === null || e === 'money';
  };
  const take = (id: string, keep = reserve) => {
    if (invOf(id)) return takeInv(id, keep);
    const lk = lvTok(id);
    if (lk) {
      const cost = nextLevelCost(s, lk);
      if (!lvCan(lk) || budget < cost + keep) return false;
      spend(cost);
      pending.add(id);
      acts.push({ kind: 'skill', run: () => levelUp(s, lk.id), tag: lk.branch === 'dig' ? 'tool' : 'money' });
      return true;
    }
    const research = isResearch(SKILL[id] ?? ({} as Skill));
    if (!learnable(id) || (!research && budget < SKILL[id].cost + keep)) return false;
    if (research) rpUsed += rpCost(SKILL[id]);
    else spend(SKILL[id].cost);
    pending.add(id);
    acts.push({ kind: 'skill', run: () => learn(s, id), tag: research ? undefined : SKILL[id].branch === 'dig' ? 'tool' : 'money' });
    return true;
  };
  /** 取れる（スキル：条件を満たしている／設備投資：その段に届いていない建物がある） */
  const can = (id: string) => (invOf(id) ? invNeed(id).length > 0 : lvTok(id) ? lvCan(lvTok(id)!) : learnable(id));
  const costOf = (id: string) => (invOf(id) ? invCost(id) : lvTok(id) ? nextLevelCost(s, lvTok(id)!) : SKILL[id] && isResearch(SKILL[id]) ? 0 : SKILL[id].cost);
  if (!has(s, 'hire')) take('hire', 0);

  // ---- お店（最初の 1 軒）
  const shopsAll = s.buildings.filter((b) => b.owner === 'me' && P1B[b.id]?.kind === 'shop');
  const shopKind = () => (canBuild(s, 'boutique') === null || (canBuild(s, 'boutique') === 'money' && has(s, 'shop3')) ? 'boutique' : has(s, 'shop2') ? 'import' : 'general_store');
  const buildShop = (kind = 'general_store') => {
    if (budget < P1B[kind].cost + reserve) return false;
    const lot = pickLot(s, kind, shopsAll.length === 0 && c.policy !== 'rta');
    if (!lot) return false;
    spend(P1B[kind].cost);
    c.shopsThisMonth++;
    acts.push({ kind: 'build', run: () => build(s, kind, ...lot) });
    return true;
  };
  if (shopsAll.length === 0 && ws) buildShop();
  if (!ws) return acts;

  // ---- 作るもの（月の締め・作業台が増えた・開発できた・セクタに着いたとき）
  if (c.lineupDirty || c.lineup.length !== s.slots.length) {
    c.lineup = chooseLineup(s, c);
    c.lineupDirty = false;
  }
  const lineup = c.lineup;

  // ---- 資金が尽きたら他店でバイト（マインちゃんの案内）。手の空いた人、いなければ調達係・運搬係から
  // 資金が 0 を切ったら始め、5,000 G に戻るまで続ける
  const rescue = s.money < 5000 && (s.money < 0 || crew(s).some((x) => x.task === 'side'));
  if (s.money < 0 && !crew(s).some((x) => x.task === 'side')) {
    const pick = crew(s).find((x) => x.task == null) ?? (s.money < 0 ? crew(s).find((x) => x.task === 'buy') : undefined);
    if (pick) acts.push({ kind: 'side', run: () => assign(s, pick.hero, 'side', s.rivals[0].id) });
  }
  // ---- 人の割り当て（いまの担当を優先して入れ替えを少なく）
  const people = crew(s).filter((x) => x.task !== 'intel' && !(rescue && x.task === 'side'));
  const used = new Set<number>();
  const want: { task: Task; target: number | string | null; apt: Task; min?: number; cur: number | null }[] = [];
  s.slots.forEach((sl, k) => {
    const x = lineup[k];
    if (!x) return;
    want.push({ task: 'craft', target: k, apt: 'craft', min: skuParts(x)[1] === 'U' ? UNCOMMON.minCraft : 0, cur: sl.worker });
  });
  // アンコモンの台を先に（適性の条件があるので）
  want.sort((a, b) => (b.min ?? 0) - (a.min ?? 0));
  for (const b of myShops(s)) want.push({ task: 'shop', target: b.uid, apt: 'shop', cur: s.shops[b.uid]?.staff ?? null });
  const haulers = crew(s).filter((x) => x.task === 'transport').map((x) => x.hero);
  const nHaul = Math.max(1, Math.min(3, c.policy === 'rta' ? (myShops(s).length >= 3 ? 2 : 1) : haulers.length || 1));
  for (let k = 0; k < nHaul; k++) want.push({ task: 'transport', target: null, apt: 'transport', cur: haulers[k] ?? null });
  const buyer = crew(s).find((x) => x.task === 'buy')?.hero ?? null;
  if (has(s, 'hire') || crew(s).length > 3) want.push({ task: 'buy', target: null, apt: 'buy', cur: buyer });
  let hired = false;
  for (const w of want) {
    let hero: number | null = null;
    if (w.cur != null && !used.has(w.cur) && people.some((x) => x.hero === w.cur) && craftOk(s, w.cur, w)) hero = w.cur;
    if (hero == null) {
      const free = people.filter((x) => !used.has(x.hero) && craftOk(s, x.hero, w)).sort((a, b) => aptitude(b.stats, w.apt) - aptitude(a.stats, w.apt));
      // ほかの担当からは引き抜かない（いま担当のない人だけ）。アンコモンの職人だけは引き抜く
      // （運搬係・調達係が 1 人しかいないときは引き抜かない。抜くと ③ 物流・① 調達が止まり、売上が 0 になって雇い直せなくなる）
      const only = (task: Task) => crew(s).filter((y) => y.task === task).length <= 1;
      const idle = free.filter((x) => x.task == null || (x.task === 'side' && !rescue) || (w.min && x.task !== 'craft' && !((x.task === 'transport' || x.task === 'buy') && only(x.task))));
      hero = idle[0]?.hero ?? null;
    }
    if (hero == null) {
      // 雇う（1 日 1 人）
      if (!hired && has(s, 'hire') && budget > 3000 + reserve / 2) {
        const pick = [...s.hirePool].filter((id) => (w.min ? aptitude(heroStatsOf(id), 'craft') >= w.min : true)).sort((a, b) => aptitude(heroStatsOf(b), w.apt) - aptitude(heroStatsOf(a), w.apt))[0];
        if (pick != null) {
          hired = true;
          spend(1000);
          acts.push({ kind: 'hire', run: () => hire(s, pick) });
          const tgt = w.target;
          acts.push({ kind: 'assign', run: () => assign(s, pick, w.task, tgt) });
          used.add(pick);
        }
      }
      continue;
    }
    used.add(hero);
    const st = s.staff.find((x) => x.hero === hero)!;
    if (st.task !== w.task || st.target !== w.target) {
      const tgt = w.target;
      acts.push({ kind: 'assign', run: () => assign(s, hero!, w.task, tgt) });
    }
  }

  // ---- 作業台：作るものを始める（自動製造）。素材の買い付けの品目もそろえる
  const want2 = lineup.slice(0, s.slots.length);
  const kindsNow = [...new Set(want2)];
  const cur = procItems(s);
  if (s.proc.items.length || want2.some((x) => !cur.includes(x)) || cur.some((x) => !want2.includes(x))) {
    for (const x of kindsNow) if (!s.proc.items.includes(x)) acts.push({ kind: 'proc', run: () => (toggleProcItem(s, x), null) });
    for (const x of s.proc.items) if (!kindsNow.includes(x)) acts.push({ kind: 'proc', run: () => (toggleProcItem(s, x), null) });
  }
  s.slots.forEach((sl, k) => {
    const x = want2[k];
    if (!x || sl.running) return;
    if (sl.sku === x && sl.repeat) return;
    acts.push({ kind: 'craft', run: () => startCraft(s, k, x) });
  });

  // ---- 素材：調達係がいないうちは手で買う（12 日ぶん）
  const hasBuyer = crew(s).some((x) => x.task === 'buy');
  if (!hasBuyer) {
    for (const { m } of procMats(s)) {
      const need = want2.reduce((a, x) => a + ((recipeOf(x)[m] ?? 0) * 30) / craftDays(s, x), 0);
      const have = s.mats[m] ?? 0;
      if (have >= (need * 5) / 30) continue;
      const q = Math.floor(Math.min((need * 12) / 30 - have, procLeft(s), poolFree(s), budget / matPrice(s, m)));
      if (q > 0) {
        spend(q * matPrice(s, m));
        acts.push({ kind: 'buy', run: () => buy(s, m, q) });
      }
    }
  }

  // ---- 倉庫：置き場所が 85% を超えたら（2 棟まで）
  const whs = s.buildings.filter((b) => b.owner === 'me' && b.id === 'warehouse').length;
  if (poolUsed(s) > poolCap(s) * 0.85 && whs < 2 && !s.buildings.some((b) => b.owner === 'me' && b.id === 'warehouse' && b.left > 0)) {
    const lot = pickLot(s, 'warehouse', false);
    if (lot && budget > P1B.warehouse.cost + reserve) {
      spend(P1B.warehouse.cost);
      acts.push({ kind: 'build', run: () => build(s, 'warehouse', ...lot) });
    }
  }

  // ---- お店：棚・アルバイト
  for (const b of myShops(s)) {
    const sh = s.shops[b.uid];
    // 並べたい商品のうち棚に無いものを、並べなくなった商品・重なった棚・空の棚と替える（順番は気にしない）
    const left = (z: Sku) => (s.stock[z] ?? 0) + Object.values(s.shops).reduce((a, q) => a + (q.storage[z] ?? 0) + (q.shelf[z] ?? 0), 0) + s.trips.reduce((a, t) => a + (t.cargo[z] ?? 0), 0);
    const plan = [...sh.shelves];
    const missing = kindsNow.filter((y) => !plan.includes(y));
    plan.forEach((x, k) => {
      const dup = x != null && plan.indexOf(x) !== k;
      if (x && kindsNow.includes(x) && !dup) return;
      // 古い商品が残っているうちは、新しい商品ができるまで売り切る
      const i = missing.findIndex((y) => x == null || dup || left(y) > 0);
      if (i < 0) return;
      const y = missing.splice(i, 1)[0];
      plan[k] = y;
      acts.push({ kind: 'shelf', run: () => setShelf(s, b.uid, k, y) });
    });
    // アルバイト：1 人（店員が休む日も開けておく）。「アルバイトの採用」で増やせる上限までは増やさない
    if (sh.part === 0 && !rescue) acts.push({ kind: 'part', run: () => setPart(s, b.uid, 1) });
  }

  // ---- 調査の依頼：手の空いた人に
  if (s.missions.research === 'accepted') {
    const idle = crew(s).find((x) => x.task == null && !used.has(x.hero));
    if (idle) acts.push({ kind: 'assign', run: () => assign(s, idle.hero, 'intel', s.rivals[0].id) });
  }

  // ---- 方針ごとの投資
  const bnNow = c.lastBn;
  const develops = () => {
    if (!has(s, 'pot') || s.lab) return;
    // アンコモンの価値が高い順。素材のルートが無ければルートのスキルを先に
    const order = PRODUCTS.filter((p) => techOk(s, p.key) && tierOk(p, s.tier ?? 'C'))
      .map((p) => p.key)
      .filter((k) => !s.dev.includes(k))
      .sort((a, b) => uValue(s, b) - uValue(s, a));
    for (const k of order) {
      const x = sku(k, 'U');
      if (!routesOk(s, x)) {
        for (const m of Object.keys(recipeOf(x)) as Mat[]) if (!s.routes.includes(m)) for (const r of routeChain(m)) take(r, 0);
        continue;
      }
      const cost = Math.round(PRODUCT[k].price * 4);
      if (budget < cost + reserve) return;
      spend(cost);
      acts.push({ kind: 'dev', run: () => develop(s, k) });
      return;
    }
  };
  /**
   * リサーチ（2 か所目以降）：市場データのおすすめ（recommend）と、このセクタの gap の商品に要る
   * 技 → 素材のルート →（Uncommon 以上）魔法の釜 → 商品開発 を順に取る。1 日に 1 つの商品ぶん
   */
  const researching = () => {
    if (!s.land || s.land.mine[0] === s.sector) return;
    const keys = [...new Set([recommend(s), ...gapOf(s)])].filter((k) => gapOf(s).includes(k));
    for (const key of keys) {
      const need = needFor(s, key);
      if (!need) continue;
      // 修行中：終わるまで待つあいだに、その商品の素材のルートを先に取っておく
      if (need.kind === 'tech' && s.training?.id === need.skill) {
        for (const m of Object.keys(recipeOf(sku(key, 'C'))) as Mat[]) if (!hasRoute(s, m)) for (const r of routeChain(m)) take(r, reserve / 2);
        return;
      }
      if (need.kind === 'tech') take(need.skill, reserve / 2);
      else if (need.kind === 'route') for (const r of routeChain(need.mat)) take(r, reserve / 2);
      else if (need.kind === 'pot') take('pot', 0);
      else if (need.kind === 'dev' && !s.lab && !pending.has('dev')) {
        const cost = Math.round(PRODUCT[key].price * 4);
        if (budget >= cost + reserve / 2) {
          spend(cost);
          pending.add('dev');
          acts.push({ kind: 'dev', run: () => develop(s, key) });
        }
      }
      return;
    }
  };
  if (!saving) researching();
  // 2 か所目以降：設備は建物ごと（セクタごと）なので、建てたら入れ直す。工房は作業台 → 荷車、お店は棚から
  if (!saving && s.land && s.land.mine[0] !== s.sector && c.policy !== 'rta') for (const x of ['@bench:1', '@carts:1', '@shelves:1']) take(x, reserve / 2);
  // 新商品の認知：gap の商品を並べたら、駅のポスター（30 日）で早く広める
  const gapOnShelf = myShops(s).some((b) => s.shops[b.uid].shelves.some((x) => x && gapOf(s).includes(skuParts(x)[0]) && knownOf(s, skuParts(x)[0]) < 1));
  if (gapOnShelf && (s.ads.poster ?? 0) <= 0) {
    const ad = ADS.find((a) => a.id === 'poster')!;
    if (budget >= ad.cost + reserve / 2) {
      spend(ad.cost);
      acts.push({ kind: 'ad', run: () => runAd(s, 'poster') });
    }
  }
  const wantU = (s.tier ?? 'C') !== 'C' || c.policy === 'rta';
  if (c.policy === 'rta') {
    if (!saving) {
      // 決まった順に 1 つずつ。資金が足りない所で止まって貯める（安いものに流れない）
      type Step = () => 'skip' | 'wait';
      const sk = (id: string): Step => () => {
        // 設備投資で、付ける工房・お店がまだ無い（これから建つ・工事中）なら待つ（できたらすぐ付ける）。倉庫は建てないこともあるので待たない
        const iv = invOf(id);
        const kind = iv ? INVEST[iv.id]?.kind : null;
        if (iv && !can(id) && kind !== 'warehouse' && !invTargets(s, iv.id).length) return 'wait';
        if (!can(id)) return 'skip';
        return take(id) ? 'skip' : 'wait';
      };
      const shopUpTo = (n: number, onlyIfSell: boolean): Step => () => {
        if (shopsAll.length >= n) return 'skip';
        if (onlyIfSell && (bnNow !== 'sell' || shopsAll.some((b) => b.left > 0))) return 'skip';
        return buildShop(shopKind()) ? 'skip' : 'wait';
      };
      const dev1: Step = () => {
        if (!has(s, 'pot') || s.dev.length || s.lab) return 'skip';
        const before = acts.length;
        develops();
        return acts.length > before ? 'skip' : 'wait';
      };
      const devMore: Step = () => {
        if (!has(s, 'pot') || s.lab) return 'skip';
        develops();
        return 'skip';
      };
      const signs: Step = () => {
        for (const b of myShops(s)) {
          const cst = investCost(b, 'sign');
          if (cst == null) continue;
          if (budget < cst + reserve) return 'wait';
          spend(cst);
          acts.push({ kind: 'invest', run: () => invest(s, b.uid, 'sign') });
        }
        return 'skip';
      };
      const ad = (id: string): Step => () => {
        const x = ADS.find((a) => a.id === id)!;
        if ((s.ads[id] ?? 0) > 0 || !myShops(s).length) return 'skip';
        if (budget < x.cost + reserve) return 'wait';
        spend(x.cost);
        acts.push({ kind: 'ad', run: () => runAd(s, id) });
        return 'skip';
      };
      const queue: Step[] = [sk('hire'), shopUpTo(2, false), sk('@shelves:1'), sk('@bench:1'), sk('pot'), sk('route_cloth'), sk('route_paper'), dev1, sk('@shelves:1'), sk('host'), shopUpTo(5, true), sk('loading'), sk('@carts:1'), sk('stock1'), ad('poster'), sk('jig'), sk('bulk'), sk('@stockroom:1'), sk('b_sign'), sk('shop2'), sk('route_gem'), devMore, signs, ...RTA_SKILLS.map(sk), ad('flyer')];
      for (const q of queue) if (q() === 'wait') break;
    }
    // アンコモンの職人がいなければ、候補から雇っておく
    if (has(s, 'pot') && uCrafters(s).length < Math.min(2, s.slots.length) && !hired && budget > 4000) hireU(s, acts, () => (hired = true));
  } else {
    // 通常・100%：月末にまとめて考える
    const r = c.monthEnd;
    if (wantU && !saving) {
      // Uncommon のセクタに着いたら、案内に従って魔法の釜 → 商品開発
      take('pot', 0);
      develops();
      if (has(s, 'pot') && uCrafters(s).length === 0 && !hired) hireU(s, acts, () => (hired = true));
    } else if (has(s, 'pot')) develops();
    // マインちゃんの助言（タオックスの前半）：作業台が 1 台なら、2 台にすると作る数が倍（工房 → 設備投資）
    if (r && !saving && (s.sector ?? 'c1') === 'c1' && !s.cleared) take('@bench:1', reserve / 2);
    if (r && !saving) {
      const bn = c.lastBn ?? 'sell';
      // 売り場が細ければ、まずお店を 1 軒（月 1 軒まで。棚 2 の輸入品店は資金に余裕があるとき）
      if (bn === 'sell' && c.shopsThisMonth === 0 && shopsAll.every((b) => b.left <= 0) && shopsAll.length < 5) {
        const kind = shopKind();
        buildShop(budget > P1B[kind].cost * 3 + reserve ? kind : 'general_store');
      }
      let cap = budget * 0.6;
      let n = 0;
      // v6（通常）：SCM ダッシュボードの「上げるには」と同じ見込み（whatIf）の大きい順に、詰まりの段の手を 2 つまで
      // v7：100% も同じ（開放とレベル上げを見込みの大きい順に混ぜる）
      n = byWhatIf(s, c, bn, cap, { take, spend, budget: () => budget, reserve, acts, hired: () => hired, setHired: () => (hired = true), buildShop: () => buildShop(shopKind()) });
      // 詰まっている段の枝から。取れるものが無ければ、次に細い段の枝から
      const caps = stageCaps(s);
      const order = n > 0 ? [] : [bn, ...(['buy', 'craft', 'haul', 'sell'] as Stage[]).filter((k) => k !== bn).sort((a, b) => caps[a].perMonth - caps[b].perMonth)];
      for (const st of order) {
        for (const id of BRANCH_ORDER[st]) {
          if (n >= 2) break;
          if (!can(id) || costOf(id) > cap) continue;
          const cost = costOf(id);
          if (take(id, 0)) {
            cap -= cost;
            n++;
          }
        }
        if (n > 0) break;
      }
      // v8：RP が残っていれば、詰まりの段の枝の研究パネルを説明の順（BRANCH_ORDER）→ 同じ枝の安い順に（見込みの手と合わせて RP_MOVES まで）
      if (c.policy === 'normal') {
        const ids = [...BRANCH_ORDER[bn].filter((id) => !invOf(id)), ...SKILLS.filter((k) => k.branch === STAGE_BRANCH[bn] && isResearch(k) && !k.big).sort((a, b) => rpCost(a) - rpCost(b)).map((k) => k.id)];
        for (const id of ids) {
          if (c.rpMoves >= RP_MOVES) break;
          if (SKILL[id] && isResearch(SKILL[id]) && can(id) && take(id, 0)) c.rpMoves++;
        }
      }
      // RP がたまったら、詰まりの段の大きめの研究パネル（どこを重点的に伸ばすか）。100% は下でまとめて取る
      if (c.policy === 'normal') take(DUST_OF[bn] ?? 'd_logi', 0) || take('d_logi', 0);
      // 売り場が細いのに枝で取れるものが無ければ、お店（月 1 軒まで）・チラシ・看板
      if (bn === 'sell') {
        const ad = ADS[0];
        if ((s.ads.flyer ?? 0) <= 0 && budget > ad.cost + reserve * 2) {
          spend(ad.cost);
          acts.push({ kind: 'ad', run: () => runAd(s, 'flyer') });
        }
        const b0 = myShops(s).find((b) => investCost(b, 'sign') != null);
        if (b0 && budget > investCost(b0, 'sign')! + reserve * 2) {
          spend(investCost(b0, 'sign')!);
          acts.push({ kind: 'invest', run: () => invest(s, b0.uid, 'sign') });
        }
      }
      // 運ぶのが細ければ、運搬係をもう 1 人
      if (bn === 'haul' && crew(s).filter((x) => x.task === 'transport').length < 2 && !hired && has(s, 'hire')) {
        const pick = [...s.hirePool].sort((a, b) => aptitude(heroStatsOf(b), 'transport') - aptitude(heroStatsOf(a), 'transport'))[0];
        if (pick != null && budget > 3000) {
          hired = true;
          acts.push({ kind: 'hire', run: () => hire(s, pick) });
          acts.push({ kind: 'assign', run: () => assign(s, pick, 'transport') });
        }
      }
      // 100%：残りのスキルと設備投資も、資金の 4 割までで安い順に
      if (c.policy === 'full') {
        let rest = budget * 0.4;
        // v7：レベル上げ（lv:id）も。ゴールは C・U の取れるパネルをすべて Lv 最大
        const all = [...SKILLS.map((k) => k.id), ...SKILLS.filter((k) => ['C', 'U'].includes(skillTier(k))).map((k) => `lv:${k.id}`), ...Object.values(INVEST).flatMap((x) => x.cost.map((_, k) => `@${x.id}:${k + 1}`))].filter(can).sort((a, b) => costOf(a) - costOf(b));
        for (const id of all) {
          const cost = costOf(id);
          if (!can(id) || cost > rest) continue;
          if (take(id, 0)) rest -= cost;
        }
      }
    }
    // 100%：宣伝を 2 種類同時にする依頼（エムケーシティ）
    if (c.policy === 'full' && s.missions.u3_ads === 'accepted') {
      for (const a of ['flyer', 'event'] as const) {
        const ad = ADS.find((x) => x.id === a)!;
        if ((s.ads[a] ?? 0) <= 0 && budget > ad.cost) {
          spend(ad.cost);
          acts.push({ kind: 'ad', run: () => runAd(s, a) });
        }
      }
    }
    if (c.policy === 'full' && s.missions.ad === 'accepted' && (s.ads.flyer ?? 0) <= 0 && budget > 1500) acts.push({ kind: 'ad', run: () => runAd(s, 'flyer') });
    if (c.policy === 'full' && s.missions.two_shops === 'accepted' && shopsAll.length < 2 && c.shopsThisMonth === 0) buildShop();
  }
  return acts;
}

/**
 * v6（通常の方針）：詰まりの段の打ち手を、見込み（whatIf：+N 個／月）の大きい順に、月の予算（cap）の中で 2 つまで。
 * 設備投資・スキル・人を置く・倉庫・④ 販売の打ち手（お店・アルバイト・什器・棚・宣伝・売り場の強さ）。取った数を返す
 */
interface WhatIfHooks {
  take: (id: string, keep?: number) => boolean;
  spend: (v: number) => number;
  budget: () => number;
  reserve: number;
  acts: Action[];
  hired: () => boolean;
  setHired: () => void;
  buildShop: () => boolean;
}
/** v8：月末に開ける研究パネルの数の上限（見込みの大きい順） */
const RP_MOVES = 2;
function byWhatIf(s: P1State, c: Ctx, bn: Stage, cap: number, k: WhatIfHooks): number {
  let n = 0;
  // 1 個あたりの粗利（先月の売上 ÷ 売れた数 − 素材代）。月々の費用（維持費・給料・アルバイト代）が、増える粗利より大きい手は取らない
  const r = c.monthEnd;
  const price = r && r.flow && r.flow.sold > 0 ? r.revenue / r.flow.sold : 1000;
  const xs = s.slots.map((x) => x.sku).filter((x): x is Sku => !!x);
  const margin = price - (xs.length ? xs.reduce((a, x) => a + unitCost(s, x), 0) / xs.length : 0);
  const monthly = (w: (typeof list)[number]): number => {
    const m = w.move;
    if (m.kind === 'person') return m.hire ? m.cost : 0;
    if (m.kind === 'build') return P1B[m.id]?.upkeep ?? 0;
    if (m.kind === 'sell' && m.w.kind === 'shop') return (P1B.general_store.upkeep ?? 0) + 900 + 300;
    if (m.kind === 'sell' && m.w.kind === 'part') return 900;
    return 0;
  };
  const list = whatIf(s, bn);
  // v8：研究パネル（RP で開く）は資金の手（2 つまで）と別に数える。見込みの大きい順に、RP があるだけ（RP_MOVES まで）
  c.rpMoves = 0;
  for (const w of list) {
    if (n >= 2 && c.rpMoves >= RP_MOVES) break;
    if (!w.ok || w.units * margin <= monthly(w)) continue;
    const m = w.move;
    if (m.kind === 'skill' && isResearch(SKILL[m.id])) {
      if (c.rpMoves < RP_MOVES && k.take(m.id, 0)) c.rpMoves++;
      continue;
    }
    if (n >= 2) continue;
    if (m.kind === 'invest') {
      if (c.ban.has(`@${m.id}`) || m.cost > cap || k.budget() < m.cost + k.reserve / 2) continue;
      k.spend(m.cost);
      cap -= m.cost;
      const uid = m.uid;
      const id = m.id;
      k.acts.push({ kind: 'invest', run: () => invest(s, uid, id) });
      n++;
    } else if (m.kind === 'skill') {
      if (SKILL[m.id].cost > cap || !k.take(m.id, 0)) continue;
      cap -= SKILL[m.id].cost;
      n++;
    } else if (m.kind === 'level') {
      // レベル上げ（v7）：見込みの大きい順に、開放と混ぜて
      if (m.cost > cap || k.budget() < m.cost + k.reserve / 2) continue;
      k.spend(m.cost);
      cap -= m.cost;
      const id = m.id;
      k.acts.push({ kind: 'skill', run: () => levelUp(s, id), tag: 'money' });
      n++;
    } else if (m.kind === 'person') {
      if (m.hire && (k.hired() || k.budget() < 3000 + k.reserve / 2)) continue;
      const hero = m.hero;
      const task = m.task;
      const target = m.target;
      if (m.hire) {
        k.setHired();
        k.acts.push({ kind: 'hire', run: () => hire(s, hero) });
      }
      if (m.replace != null) {
        const old = m.replace;
        k.acts.push({ kind: 'assign', run: () => assign(s, old, null) });
      }
      k.acts.push({ kind: 'assign', run: () => assign(s, hero, task, target) });
      n++;
    } else if (m.kind === 'build') {
      if (m.cost > cap || k.budget() < m.cost + k.reserve) continue;
      const lot = pickLot(s, m.id, false);
      if (!lot) continue;
      k.spend(m.cost);
      cap -= m.cost;
      const id = m.id;
      k.acts.push({ kind: 'build', run: () => build(s, id, ...lot) });
      n++;
    } else {
      const x = m.w;
      const b = x.uid != null ? s.buildings.find((y) => y.uid === x.uid) : undefined;
      if (x.kind === 'shop') {
        if (c.shopsThisMonth === 0 && k.buildShop()) n++;
      } else if (x.kind === 'part' && b) {
        const uid = b.uid;
        k.acts.push({ kind: 'part', run: () => setPart(s, uid, s.shops[uid].part + 1) });
        n++;
      } else if ((x.kind === 'fixtures' || x.kind === 'shelf') && b) {
        const id = x.kind === 'shelf' ? 'shelves' : 'fixtures';
        const cost = investCost(b, id);
        if (cost == null || c.ban.has(`@${id}`) || cost > cap || k.budget() < cost + k.reserve / 2) continue;
        k.spend(cost);
        cap -= cost;
        const uid = b.uid;
        k.acts.push({ kind: 'invest', run: () => invest(s, uid, id) });
        c.lineupDirty = true;
        n++;
      } else if (x.kind === 'pull') {
        if (['host', 'b_sign', 'concierge', 'pos', 'flow'].some((id) => SKILL[id].cost <= cap && k.take(id, 0))) n++;
      } else if (x.kind === 'known') {
        const ad = ADS.find((a) => a.id === 'poster')!;
        if ((s.ads.poster ?? 0) > 0 || k.budget() < ad.cost + k.reserve) continue;
        k.spend(ad.cost);
        k.acts.push({ kind: 'ad', run: () => runAd(s, 'poster') });
        n++;
      }
      // goods（別の商品）は、作るものの決め直し（chooseLineup）にまかせる
    }
  }
  return n;
}

function hireU(s: P1State, acts: Action[], done: () => void) {
  const pick = [...s.hirePool].filter((id) => aptitude(heroStatsOf(id), 'craft') >= UNCOMMON.minCraft).sort((a, b) => aptitude(heroStatsOf(b), 'craft') - aptitude(heroStatsOf(a), 'craft'))[0];
  if (pick == null) return;
  done();
  acts.push({ kind: 'hire', run: () => hire(s, pick) });
}

/** 担当の条件（アンコモンの台は製造の適性 31 以上） */
function craftOk(s: P1State, hero: number, w: { min?: number }) {
  return !w.min || craftApt(hero, s) >= w.min;
}

const heroStatsOf = (id: number) => heroStats(id);

/**
 * 人が SCM の画面から読むボトルネック。調達係がいると調達の量は製造に合わせて決まる（procQty）ので、
 * 調達と製造の棒が同じ長さになり、ゲームの bottleneck() は並んだときに先の「調達」を返す。人は同じ長さなら製造を直すので、そう読む。
 */
export function readBn(s: P1State): Stage {
  const c = stageCaps(s);
  const bn = bottleneck(c);
  // 調達係が休んでいる日は、手元の素材だけで数えるので棒が短く出る。担当がいれば同じく製造として読む
  const buyer = s.staff.some((x) => x.task === 'buy');
  if (bn === 'buy' && ((!c.buy.stopped && c.buy.perMonth >= c.craft.perMonth * 0.98) || buyer)) {
    const rest = (['craft', 'haul', 'sell'] as Stage[]).reduce((a, k) => (c[k].perMonth < c[a].perMonth ? k : a), 'craft' as Stage);
    return rest;
  }
  return bn;
}

/** 宝石は紙のあと、紙は布のあと（スキルの順） */
function routeChain(m: Mat): string[] {
  if (m === 'cloth') return ['route_cloth'];
  if (m === 'paper') return ['route_cloth', 'route_paper'];
  if (m === 'gem') return ['route_cloth', 'route_paper', 'route_gem'];
  return [];
}

/** アンコモンのひと月の粗利の目安（作業台 1 つ） */
function uValue(s: P1State, key: string) {
  const x = sku(key, 'U');
  const units = Math.min(Math.max(4, sellEstimate(s, key, 'U')) * UNCOMMON.pull, ((30 * 0.85) / craftDays(s, x)) * batchOf(x));
  return units * (priceOf(s, x) - unitCost(s, x));
}


// ---------------------------------------------------------------- 発掘（v8。v11：正面の壁を手前から奥へ）

/** 掘り残したマスの数（荒れ地 4 か所の合計。いちばん奥まで掘っていないマス） */
export const digLeft = (s: P1State) => (s.dig ? s.dig.sites.reduce((a, x, k) => a + x.depth.filter((v) => v < (digLayouts(s.dig!.sector)[k]?.depth ?? 0)).length, 0) : 0);
/** いま掘っている荒れ地の進み */
const curSt = (s: P1State) => siteState(s, s.dig!.cur)!;
/** マス k のいまの層を打てる（掘りきっていない・掘ってよい層・2 × 2 を待っていない） */
const canHit = (s: P1State, k: number) => {
  const L = digSite(s)!;
  const st = curSt(s);
  return st.depth[k] < L.depth && st.hp[k] > 0 && layerOpen(s, L, st.depth[k]);
};

/**
 * 配置を知っている人（最短）：まだのお題（なければ石板・エクステ）のうち、取るまでに打つ回数がいちばん少ないものを狙い、
 * その範囲のマスを手前から打つ。狙いは c.digGoal にとっておき、取れたら選び直す
 */
function knowTarget(s: P1State, c: Ctx): [number, number] | null {
  const L = digSite(s);
  if (!L || !s.dig) return null;
  const st = curSt(s);
  const pw = digPower(s);
  // 取るまでの打つ回数（範囲のマスの、その層まで。掘れない層があれば Infinity）
  const cost = (i: number) => {
    const f = L.finds[i];
    let v = 0;
    for (const k of findCells(L, f)) {
      if (st.depth[k] > f.layer) return Infinity;
      for (let n = st.depth[k]; n <= f.layer; n++) {
        if (!layerOpen(s, L, n)) return Infinity;
        v += Math.ceil((n === st.depth[k] ? st.hp[k] : L.cells[k].hard[n]) / pw - 1e-9);
      }
    }
    return v;
  };
  const live = (i: number) => {
    const it = L.finds[i].item;
    if (it.kind === 'ext' && it.topic && s.dig!.topics.includes(it.id)) return false;
    if (it.kind === 'tablet' && s.tablets.includes(it.id)) return false;
    return cost(i) < Infinity;
  };
  if (c.digGoal == null || !L.finds[c.digGoal] || !live(c.digGoal)) {
    c.digGoal = undefined;
    const idx = L.finds.map((_, i) => i).filter(live);
    const rank = (i: number) => {
      const it = L.finds[i].item;
      return it.kind === 'ext' && it.topic ? 3 : it.kind === 'tablet' ? 2 : it.kind === 'ext' ? 1 : 0;
    };
    const top = Math.max(0, ...idx.map(rank));
    const pickOne = idx.filter((i) => rank(i) === top && top > 0).sort((a, b) => cost(a) - cost(b))[0];
    if (pickOne == null) return digNext(s);
    c.digGoal = pickOne;
  }
  const f = L.finds[c.digGoal];
  const k = findCells(L, f).filter((x) => canHit(s, x) && st.depth[x] <= f.layer).sort((a, b) => st.depth[a] - st.depth[b])[0];
  return k == null ? digNext(s) : [k % L.w, Math.floor(k / L.w)];
}

/** 覗き見が出ているマス（お題 → 石板 → エクステ → 素材。手前のものほど先）→ 取りかけ・浅いマス（digNext） */
function sweepTarget(s: P1State): [number, number] | null {
  const L = digSite(s);
  if (!L || !s.dig) return null;
  let best: [number, number] | null = null;
  let score = 0;
  for (let k = 0; k < L.w * L.h; k++) {
    if (!canHit(s, k)) continue;
    const x = k % L.w;
    const y = Math.floor(k / L.w);
    const v = peekView(s, x, y);
    if (!v || v.hint) continue;
    const it = v.item;
    const rank = it.kind === 'ext' && it.topic ? 4 : it.kind === 'tablet' ? 3 : it.kind === 'ext' ? 2 : 1;
    const sc = rank * 100 - v.ahead * 10 + v.frac;
    if (sc > score) {
      score = sc;
      best = [x, y];
    }
  }
  return best ?? digNext(s);
}

/**
 * v12：ダンジョンでは、上のランクの遺物の覗き見（いまの層。Epic 以上の 2 × 2 は取りかけの範囲）→ いちばん深いマス（縦に掘り進める。同じなら打ちかけ・真ん中寄り）
 */
function deepTarget(s: P1State): [number, number] | null {
  const L = digSite(s);
  if (!L || !s.dig) return null;
  const st = curSt(s);
  let best: [number, number] | null = null;
  let score = -Infinity;
  for (let k = 0; k < L.w * L.h; k++) {
    if (!canHit(s, k)) continue;
    const x = k % L.w;
    const y = Math.floor(k / L.w);
    const v = peekView(s, x, y);
    const up = v && !v.hint && v.ahead === 0 && v.item.kind === 'ext' && extRank(v.item.id) !== 'C' && extRank(v.item.id) !== L.tier ? 1e6 : 0;
    const sc = up + st.depth[k] * 1000 + (st.hp[k] < L.cells[k].hard[st.depth[k]] ? 500 : 0) - (Math.abs(x - 3) + Math.abs(y - 4));
    if (sc > score) {
      score = sc;
      best = [x, y];
    }
  }
  return best;
}
const digTarget = (s: P1State, c: Ctx) => (s.digRun?.site === DUNGEON ? deepTarget(s) : SIM_DIG[c.policy].target === 'know' ? knowTarget(s, c) : sweepTarget(s));

/** 手で n 回まで打つ（発破が使えれば、条件のときは発破）。打った数を返す */
function handDig(s: P1State, c: Ctx, n: number, rec: DigRec, useBlast: () => boolean, spendTools: (v: number) => void): number {
  let k = 0;
  while (k < n && s.digRun) {
    const at = digTarget(s, c);
    if (!at) break;
    if (hasBlast(s) && s.money >= blastCost(s) && useBlast()) {
      const bc = blastCost(s);
      const r = blast(s, at[0], at[1]);
      if (typeof r !== 'string') {
        rec.blast++;
        spendTools(bc);
        k++;
        continue;
      }
    }
    if (typeof dig(s, at[0], at[1]) === 'string') break;
    k++;
  }
  return k;
}

/**
 * 次に掘る荒れ地（許可があって掘りきっていない所）：最短は、まだのお題のある荒れ地（無ければ石板・エクステの残り）。
 * 通常・100% は、いま掘っている所を掘りきるまで → まだ眠っているお題のある所 → 番号の順
 */
function pickSite(s: P1State, p: PolicyId, c?: Ctx): number | null {
  const d = s.dig!;
  // v10：いまの許可で掘れるマスが残っている所だけ（深い層の許可が要る所は、許可を取るまで掘らない）
  const open = d.sites.map((x, k) => ({ x, k })).filter(({ x, k }) => x.permit && !x.done && siteDiggable(s, k)).map(({ k }) => k);
  // v12：掘れる荒れ地が無ければ、ダンジョンに潜る（ひと月に SIM_DIG.dungeon 回まで。最短は潜らない）
  if (!open.length) return c && d.dungeon && (c.divesMonth ?? 0) < SIM_DIG[p].dungeon ? DUNGEON : null;
  const hidden = open.filter((k) => siteTopic(s, k) === 'hidden');
  if (p === 'rta') return hidden[0] ?? open.find((k) => k === d.cur) ?? open[0];
  if (open.includes(d.cur)) return d.cur;
  return hidden[0] ?? open[0];
}
/** 次の荒れ地の発掘許可を申請する（資金が申請料の rate 倍あれば。最短は、まだのお題のある荒れ地だけ） */
function askPermits(s: P1State, p: PolicyId, rate: number): number {
  const d = s.dig!;
  let n = 0;
  for (let guard = 0; guard < 4; guard++) {
    const open = d.sites.filter((x, k) => x.permit && !x.done && siteDiggable(s, k)).length;
    const cand = d.sites.map((x, k) => ({ x, k })).filter(({ x }) => !x.permit);
    const pick = p === 'rta' ? cand.find(({ k }) => siteTopic(s, k) === 'hidden') : open === 0 || p === 'full' ? cand.find(({ k }) => siteTopic(s, k) === 'hidden') ?? cand[0] : undefined;
    if (!pick) break;
    const fee = permitFee(s);
    if (fee > 0 && s.money < fee * rate + 5000) break;
    if (typeof applyPermit(s, pick.k) === 'string') break;
    n++;
  }
  return n;
}

// ---------------------------------------------------------------- ルート

const byFee = (tier: Tier) => SECTORS.filter((x) => x.tier === tier && !x.cloud && !x.soon && x.id !== 'c1').sort((a, b) => a.fee - b.fee || a.id.localeCompare(b.id)).map((x) => x.id);
export function routeOf(p: PolicyId): string[] {
  if (p === 'rta') return ['c1', byFee('U')[0]];
  if (p === 'normal') return ['c1', ...byFee('C').slice(0, 2), ...byFee('U').slice(0, 2)];
  return ['c1', ...byFee('C'), ...byFee('U')];
}

// ---------------------------------------------------------------- 1 回の自動プレイ

export interface RunOpts {
  ban?: string[];
  /** 最初のセクタで 制覇したら止める */
  onlyFirst?: boolean;
  /** 月の締めごとに呼ぶ（調べもの用） */
  onMonth?: (s: P1State, sector: string, month: number) => void;
}

export function runOnce(p: PolicyId, seed: number, o: RunOpts = {}): RunResult {
  const s = newP1(seed);
  const c: Ctx = { policy: p, route: routeOf(p), at: 0, lineup: [], lineupDirty: true, shopsThisMonth: 0, monthEnd: null, lastBn: null, ban: new Set(o.ban ?? []), onlyFirst: !!o.onlyFirst, dayInMonth: 0, handCarry: 0, rpMoves: 0, runLeft: 0, runsMonth: 0, divesMonth: 0 };
  const res: RunResult = { policy: p, seed, sectors: [], actions: {}, days: 0, done: false, skillsAt: [], spend: { money: 0, tools: 0, fees: 0, end: 0 }, research: { C: 0, U: 0, allC: null }, recipes: 0, v12: { revived: 0, dungeons: 0, dives: 0, best: 0, found: { U: 0, R: 0, E: 0, L: 0 }, got: { U: 0, R: 0, E: 0, L: 0 }, museum: false, income: 0, marks: 0 } };
  /** v12：復興した荒れ地（セクタを離れるときに足す） */
  let revivedDone = 0;
  const newRun = (id: string): SectorRun => ({ id, tier: sectorDef(id).tier, arrived: s.day, open: null, topDay: null, left: null, months: null, first: null, rev: 0, money: 0, skills: 0, actTop: 0, pauseTop: 0, act: 0, pause: 0, allRev: 0, relicRev: 0, dig: newDigRec(), log: [] });
  const D = SIM_DIG[p];
  const cResearch = SKILLS.filter((k) => skillTier(k) === 'C' && isResearch(k) && !skillSoon(k)).map((k) => k.id);
  let progress = { got: -1, claimed: -1, day: 0 };
  let cur = newRun('c1');
  res.sectors.push(cur);
  let skillsSeen = 0;
  const invSeen: { n: number; sector: string | undefined; by: Record<string, number> } = { n: 0, sector: s.sector, by: {} };
  const allSkills = fullSkills().length;
  const fullMissions = MISSIONS.length;

  for (let guard = 0; guard < 30 * 600; guard++) {
    // ---- 判断と行動（v8：この日が月末ポーズか。RP の支出は、入った RP を数えるのに使う）
    const atPause = c.monthEnd != null;
    const rpStart = s.rp ?? 0;
    let rpSpent = 0;
    const acts = policy(s, c);
    c.monthEnd = null;
    for (const a of acts) {
      const m0 = s.money;
      const rp0 = s.rp ?? 0;
      const r = a.run();
      rpSpent += Math.max(0, rp0 - (s.rp ?? 0));
      if (!ok(r)) continue;
      if (a.tag === 'money') res.spend.money += m0 - s.money;
      if (a.tag === 'tool') res.spend.tools += m0 - s.money;
      res.actions[a.kind] = (res.actions[a.kind] ?? 0) + 1;
      cur.act++;
      if (cur.topDay == null) cur.actTop++;
    }
    if (s.skills.length > skillsSeen) {
      for (const id of s.skills.slice(skillsSeen)) {
        res.skillsAt.push({ id, day: s.day, sector: s.sector ?? 'c1' });
        if (SKILL[id] && isResearch(SKILL[id])) cur.dig.research++;
      }
      if (res.research.allC == null && cResearch.every((id) => has(s, id))) res.research.allC = c.at + 1;
      skillsSeen = s.skills.length;
      c.lineupDirty = true;
    }
    // 設備投資（効き目の比較で外せるように「@id」で記録。作業台・棚が増えたら作るものを決め直す）
    for (const a of acts) if (a.kind === 'invest') c.lineupDirty = true;
    const invNow = s.buildings.filter((b) => b.owner === 'me').reduce((a, b) => a + Object.values(b.inv ?? {}).reduce<number>((x, v) => x + (v ?? 0), 0), 0);
    if (invNow > invSeen.n || invSeen.sector !== s.sector) {
      if (invSeen.sector === s.sector)
        for (const b of s.buildings.filter((x) => x.owner === 'me'))
          for (const [id, lv] of Object.entries(b.inv ?? {})) {
            const k = `${b.uid}:${id}`;
            if ((lv ?? 0) > (invSeen.by[k] ?? 0)) res.skillsAt.push({ id: `@${id}`, day: s.day, sector: s.sector ?? 'c1' });
            invSeen.by[k] = lv ?? 0;
          }
      else invSeen.by = {};
      invSeen.n = invNow;
      invSeen.sector = s.sector;
    }

    // ---- 発掘（v9。SIM_DIG：15 秒の発掘作業・許可・道具・発掘隊・発表）
    // 発掘との出会い：最初の月の締めのあと、操作がないまま 5 日（月の途中はふつう手が空く）。1 か所目の許可は手紙で済む
    if (!s.flags.digMeet && s.reports.length >= 1 && c.dayInMonth >= MEET_IDLE_DAYS && s.dig && !atPause) {
      s.flags.digMeet = 'done';
      grantFirst(s);
      cur.dig.permits++;
      cur.dig.talks++;
      if (cur.topDay == null) cur.dig.talksTop++;
    }
    if (s.flags.digMeet && s.dig) {
      const [got, all] = topicProgress(s);
      const nextId = c.route[c.at + 1];
      const needLetter = !!nextId && sectorDef(nextId).tier === 'U' && !hasLetter(s, 'U');
      const waiting = !!s.cleared && needLetter && got < all;
      const spendTools = (v: number) => (res.spend.tools += v);
      // v10：発掘の枝（以前の道具はパネルに移った）。最短：お題が許可の無い層に残っていれば、深い層の許可の次の Lv（根もとから）。
      // 通常：月末に、その月の売上の 20% までを、発掘のパネルの安い順に（お題が許可の無い層にあれば深い層の許可を先に）。100%：方針のスキルの一覧でまとめて
      const take = (id: string, keep: number) => {
        const st = digStep(s, id);
        if (!st || s.money < st.cost + keep) return 0;
        const m0 = s.money;
        if (st.run() != null) return 0;
        spendTools(m0 - s.money);
        res.actions.skill = (res.actions.skill ?? 0) + 1;
        cur.act++;
        if (cur.topDay == null) cur.actTop++;
        return m0 - s.money;
      };
      const deepNext = () => DEEP_CHAIN.find((id) => lvOf(s, id) === 0) ?? 'dig_deep';
      // 掘れずに止まっている（許可のある荒れ地に、いまの許可で掘れるマスが無い）・お題が許可の無い層にある
      const blocked = s.dig.sites.some((x, k) => x.permit && !x.done && !siteDiggable(s, k));
      if (D.tree === 'deep' && topicLocked(s)) take(deepNext(), 3000);
      // 通常・100%：掘れずに止まっている・お題が許可の無い層にあれば、深い層の許可を先に（売上の 20% の枠や、制覇のあと資金をためている月に関係なく。
      // 止まったままだと RP が入らず、研究パネルが開けなくなる）
      if (D.tree !== 'deep' && (blocked || topicLocked(s)) && lvOf(s, 'dig_deep') < 5) take(deepNext(), 10000);
      if (D.tree === 'share' && atPause) {
        // 枠は月の売上の 20% を積み立てる（使わなかったぶんは翌月へ。1 枚がその月の枠より高くても、たまれば買える）
        c.digBudget = (c.digBudget ?? 0) + (s.reports.at(-1)?.revenue ?? 0) * D.share;
        let cap = c.digBudget;
        for (let guard = 0; guard < 20; guard++) {
          // 研究 Lv の上限（研究の目利き Lv2 まで）を先に：上限で止まっていたエクステの Lv と RP がまとめて入る（RP が尽きて研究パネルが開けなくなるのを防ぐ）
          const study = lvOf(s, 'dig_study') < 2 ? (['dig_ext', 'dig_lamp', 'dig_deep', 'dig_study'].find((id) => lvOf(s, id) === 0) ?? 'dig_study') : null;
          const need = topicLocked(s) ? deepNext() : study;
          const cand = need ? [need] : [...DIG_PANELS].filter((id) => digStep(s, id)).sort((a, b) => digStep(s, a)!.cost - digStep(s, b)!.cost);
          const id = cand[0];
          const st = id ? digStep(s, id) : null;
          if (!st || st.cost > cap) break;
          // 余裕があるとき：その月の売上の 20% の枠の中で、買ったあとも 1 万 G 残る
          const v = take(id, 10000);
          if (!v) break;
          cap -= v;
        }
        c.digBudget = cap;
      }
      // v12：遺物の展示館（復興した土地ができたら。会社で 1 つ）を建てて、月末に価値の高い遺物から飾る。100% は展示室の増築も
      if (D.museum != null && atPause) {
        if (!s.museum?.at && canBuild(s, 'museum') == null && s.money >= (P1B.museum?.cost ?? 0) + D.museum) {
          let at: [number, number, (typeof DIRS)[number]] | null = null;
          for (let j = 0; j < s.n && !at; j++) for (let i = 0; i < s.n && !at; i++) {
            const dd = allowedDirs(s, 'museum', i, j);
            if (dd.length) at = [i, j, dd[0]];
          }
          if (at && typeof build(s, 'museum', ...at) !== 'string') {
            res.actions.build = (res.actions.build ?? 0) + 1;
            cur.act++;
          }
        }
        if (s.museum?.at) {
          if (autoExhibit(s)) cur.act++;
          const mb = s.buildings.find((b) => b.id === 'museum' && b.uid === s.museum?.at?.uid);
          const cost = mb ? investCost(mb, 'hall') : null;
          if (p === 'full' && mb && mb.left <= 0 && cost != null && s.money > cost * 2 + 50000 && (s.museum.items.filter((x) => x != null).length >= museumSlots(s)) && invest(s, mb.uid, 'hall') == null) {
            res.actions.invest = (res.actions.invest ?? 0) + 1;
            cur.act++;
            autoExhibit(s);
          }
        }
      }
      // 発掘許可：資金に余裕があれば、次の荒れ地を申請する（月末か、掘れる荒れ地が無くなったとき）
      if (!s.digRun && (atPause || pickSite(s, p) == null)) {
        const n = askPermits(s, p, D.permit);
        if (n) {
          cur.dig.permits += n;
          res.actions.permit = (res.actions.permit ?? 0) + n;
          cur.act += n;
          if (cur.topDay == null) cur.actTop += n;
        }
      }
      // 発掘隊（作業のあいだだけ手伝う）
      const want = D.digger;
      const diggers = s.staff.filter((x) => x.task === 'dig').length;
      if (diggers < want && s.money > 20000) {
        const idle = crew(s).filter((x) => x.task == null).sort((a, b) => aptitude(b.stats, 'dig') - aptitude(a.stats, 'dig'))[0];
        let hero = idle?.hero ?? null;
        if (hero == null) {
          const pick = [...s.hirePool].sort((a, b) => aptitude(heroStatsOf(b), 'dig') - aptitude(heroStatsOf(a), 'dig'))[0];
          if (pick != null && has(s, 'hire') && hire(s, pick) == null) {
            hero = pick;
            res.actions.hire = (res.actions.hire ?? 0) + 1;
            cur.act++;
          }
        }
        if (hero != null && assign(s, hero, 'dig') == null) {
          res.actions.assign = (res.actions.assign ?? 0) + 1;
          cur.act++;
        }
      }
      // 発破を使う（「発破」のパネルがあれば）：依頼状を待っていてお題が残っている（最短・通常）／資金に余裕がある（100%）
      const useBlast = () => (p === 'full' ? s.money > 50000 : waiting && s.money > blastCost(s) + (p === 'rta' ? 3000 : 10000));
      // 発掘作業を始める：前の作業が終わっていて、今月の回数のめやすに届いていない（null は続けて）。通常は月の前半と後半に 1 回ずつ
      const due = D.perMonth == null || (c.runsMonth < D.perMonth && c.dayInMonth >= c.runsMonth * (30 / D.perMonth) + 2);
      if (!s.digRun && due) {
        const k = pickSite(s, p, c);
        if (k != null && typeof startRun(s, k) !== 'string') {
          c.runLeft = runDays(p, s);
          c.runsMonth++;
          if (k === DUNGEON) {
            c.divesMonth = (c.divesMonth ?? 0) + 1;
            res.v12.dives++;
          }
          cur.dig.runs++;
          c.digGoal = undefined;
          res.actions.dig = (res.actions.dig ?? 0) + 1;
          cur.act++;
          if (cur.topDay == null) cur.actTop++;
        }
      }
      // 作業のあいだ：1 日ぶんの手（15 秒で 60 打を、作業の日数に均して）
      if (s.digRun) {
        c.handCarry += runTaps(s) / runDays(p, s);
        const m = Math.floor(c.handCarry);
        c.handCarry -= m;
        cur.dig.mid += handDig(s, c, m, cur.dig, useBlast, spendTools);
      }
      if (cur.dig.topicsAt == null && topicProgress(s)[0] >= all && all > 0) cur.dig.topicsAt = cur.log.length;
      // お題がそろったら、町の長に発表する（会話）
      if (presentLock(s) === null && typeof present(s) !== 'string') {
        res.actions.present = (res.actions.present ?? 0) + 1;
        cur.act++;
        cur.dig.talks++;
        if (cur.topDay == null) {
          cur.actTop++;
          cur.dig.talksTop++;
        }
      }
    }

    // ---- 1 日（v9：作業のあいだは発掘隊も打つ。作業の日数が尽きた・荒れ地を掘りきったら作業を終える）
    const d = step(s);
    cur.dig.auto += d.dug?.length ?? 0;
    if (s.digRun) {
      c.runLeft -= 1;
      if (c.runLeft <= 0 || s.dig?.sites[s.digRun.site]?.done) {
        endRun(s);
        c.handCarry = 0;
      }
    }
    cur.dig.rp += (s.rp ?? 0) - rpStart + rpSpent;
    c.dayInMonth++;
    if (d.developed.length || d.finished.length) c.lineupDirty = true;
    if (cur.open == null && s.open != null) cur.open = s.open;
    // 日々の詰まり（最短は毎日見る）
    if (p === 'rta' && myShops(s).length) c.lastBn = readBn(s);
    if (d.report) {
      const r = d.report;
      if (process.env.SIM_DEBUG) {
        const cc = stageCaps(s);
        console.log(`m${r.month} rank${r.rank} rev${Math.round(r.revenue / 1000)}k flow ${JSON.stringify(r.flow)} caps ${cc.buy.perMonth}/${cc.craft.perMonth}/${cc.haul.perMonth}/${cc.sell.perMonth} shops ${myShops(s).length} slots ${s.slots.map((x) => x.sku + '@' + x.worker).join(',')} staff ${s.staff.map((x) => x.task).join(',')} money ${Math.round(s.money)} skills ${s.skills.length}`);
      }
      cur.pause++;
      if (cur.topDay == null) cur.pauseTop++;
      cur.allRev += r.revenue;
      cur.relicRev += r.relic ?? 0;
      // v8：月の締め。RP が足りなくて止まった月＝詰まりの段に効く研究パネルがあるのに、どれも RP が足りない
      c.dayInMonth = 0;
      c.runsMonth = 0;
      c.divesMonth = 0;
      res.v12.income += r.museum?.income ?? 0;
      {
        const useful = whatIf(s, readBn(s)).filter((w) => w.ok && w.move.kind === 'skill' && isResearch(SKILL[w.move.id]));
        if (useful.length && useful.every((w) => w.move.kind === 'skill' && rpCost(SKILL[w.move.id]) > (s.rp ?? 0))) cur.dig.rpBlocked++;
      }
      {
        const nextId = c.route[c.at + 1];
        if (s.cleared && cur.topDay != null && nextId && sectorDef(nextId).tier === 'U' && !hasLetter(s, 'U')) cur.dig.letterWait++;
      }
      cur.log.push({ m: r.month, rank: r.rank, rev: r.revenue, top: Math.max(...r.area.filter((x) => !x.me).map((x) => x.sales)), money: Math.round(s.money), bn: r.bottleneck, read: readBn(s) });
      o.onMonth?.(s, cur.id, r.month);
      c.monthEnd = r;
      if (p !== 'rta') c.lastBn = readBn(s);
      c.shopsThisMonth = 0;
      c.lineupDirty = true;
      if (r.rank === 1 && r.revenue > 0 && cur.first == null) cur.first = r.month;
      // 制覇（2 か月続けて 1 位）の月
      if (s.cleared && cur.topDay == null) {
        cur.topDay = s.day;
        cur.months = r.month;
        cur.rev = r.revenue;
        cur.money = Math.round(s.money);
        cur.skills = s.skills.length;
        if (c.onlyFirst) {
          res.done = true;
          break;
        }
      }
      if (cur.topDay == null && r.month >= MONTH_CAP) {
        res.stop = `${cur.id} で ${MONTH_CAP} か月たっても制覇できない`;
        break;
      }
    }

    // ---- 制覇したら（2 か月続けて 1 位）、次のセクタへ（100% は依頼を済ませてから）
    if (s.cleared && cur.topDay != null) {
      const next = c.route[c.at + 1];
      const sectorMissionsLeft = MISSIONS.some((m) => m.sector === s.sector && s.missions[m.id] !== 'claimed');
      if (!next) {
        if (p !== 'full') {
          res.done = true;
          break;
        }
        // 100%：全スキル・全依頼まで続ける
        const claimed = MISSIONS.filter((m) => s.missions[m.id] === 'claimed').length;
        // v8：C・U の取れるパネルをすべて開放（お金パネルは Lv 最大）
        const got = fullSkills().filter((k) => lvOf(s, k.id) >= maxLv(k)).length;
        if (got >= allSkills && claimed >= fullMissions) {
          res.done = true;
          break;
        }
        // v8：12 か月、パネルも依頼も進まなければ打ち切る（RP が足りない・掘る所が無い）
        if (got !== progress.got || claimed !== progress.claimed) progress = { got, claimed, day: s.day };
        if (s.day - progress.day > 30 * 12 || s.day - (cur.topDay ?? 0) > 30 * MONTH_CAP) {
          const rest = fullSkills().filter((k) => lvOf(s, k.id) < maxLv(k));
          res.stop = `全スキル・全依頼に届かない（残り ${rest.length} 枚：研究パネル ${rest.filter(isResearch).length} 枚・RP ${rest.filter(isResearch).reduce((a, k) => a + rpCost(k), 0)} が要る・いま ${Math.round(s.rp ?? 0)} RP）`;
          break;
        }
        continue;
      }
      if (p === 'full' && sectorMissionsLeft && s.day - cur.topDay < 30 * 12) continue;
      // v8：100% は発掘場をぜんぶ掘ってから。Uncommon へは調査依頼状が要る（Common のセクタのお題をそろえて発表する）
      if (p === 'full' && digLeft(s) > 0 && s.day - cur.topDay < 30 * FULL_DIG_WAIT) continue;
      if (sectorDef(next).tier === 'U' && !hasLetter(s, 'U')) continue;
      // 関所 → 出店許可（費用 ＋ 立ち上げの資金）
      const fee = sectorDef(next).fee;
      const start = p === 'rta' ? 8000 : 12000;
      if (!s.land) {
        if (s.money < gateToll(s) + fee + start) continue;
        const g0 = s.money;
        if (!openGate(s)) continue;
        res.spend.fees += g0 - s.money;
        res.actions.gate = (res.actions.gate ?? 0) + 1;
        cur.act++;
      }
      if (s.money < fee + start) continue;
      // マネージャー：最短は最も適性の高い人。通常・100% は、アンコモンの職人を 1 人は手元に残す
      const cands = crew(s).sort((a, b) => managerApt(b.stats) - managerApt(a.stats));
      let mgr = cands[0];
      if (p !== 'rta') {
        const keep = cands.filter((x) => aptitude(x.stats, 'craft') >= UNCOMMON.minCraft);
        if (keep.length === 1) mgr = cands.find((x) => x !== keep[0]) ?? mgr;
      }
      if (s.digRun) endRun(s);
      cur.dig.left = digLeft(s);
      cur.dig.done = s.dig?.sites.filter((x) => x.done).length ?? 0;
      revivedDone += s.dig?.sites.filter((x) => x.revived).length ?? 0;
      res.v12.best = Math.max(res.v12.best, s.dig?.dungeon?.best ?? 0);
      const f0 = s.money;
      const e = moveTo(s, next, mgr?.hero ?? null);
      res.spend.fees += Math.max(0, f0 - s.money);
      if (e) {
        res.stop = `${next} へ移れない（${e}）`;
        break;
      }
      res.actions.move = (res.actions.move ?? 0) + 1;
      cur.act++;
      cur.left = s.day;
      c.at++;
      cur = newRun(next);
      res.sectors.push(cur);
      c.lineup = [];
      c.lineupDirty = true;
      c.lastBn = null;
      c.shopsThisMonth = 0;
      c.digGoal = undefined;
      c.dayInMonth = 0;
    }
  }
  if (!res.done && !res.stop) res.stop = '日数の上限';
  if (cur.left == null) {
    cur.left = s.day;
    cur.dig.left = digLeft(s);
  }
  res.days = s.day;
  res.spend.end = Math.round(s.money);
  res.recipes = Object.keys(s.recipes ?? {}).length;
  // v12：復興・ダンジョン・見つけた上のランクの遺物（研究ノート：種類と、掘った数）・展示館
  res.v12.revived = revivedDone + (s.dig?.sites.filter((x) => x.revived).length ?? 0);
  res.v12.dungeons = s.dungeons?.length ?? 0;
  res.v12.best = Math.max(res.v12.best, s.dig?.dungeon?.best ?? 0);
  for (const [id, n] of Object.entries(s.research ?? {})) {
    const rk = extRank(Number(id));
    if (rk === 'C' || !(n > 0)) continue;
    // Uncommon は、Common のセクタのダンジョンで出たものだけでなく、Uncommon のセクタの荒れ地のものも入る（R・E・L はダンジョンだけ）
    res.v12.found[rk]++;
    res.v12.got[rk] += Math.floor(n);
  }
  res.v12.museum = !!s.museum?.at;
  res.v12.marks = s.museum?.marks ?? 0;
  res.research.C = SKILLS.filter((k) => skillTier(k) === 'C' && isResearch(k) && has(s, k.id)).length;
  res.research.U = SKILLS.filter((k) => skillTier(k) === 'U' && isResearch(k) && has(s, k.id)).length;
  if (p === 'full') {
    const crowns = SECTORS.filter((x) => (x.tier === 'C' || x.tier === 'U') && !x.cloud && !x.soon).filter((x) => crowned(s, x.id)).length;
    res.goal = { crowns, skills: fullSkills().filter((k) => has(s, k.id)).length, maxed: fullSkills().filter((k) => lvOf(s, k.id) >= maxLv(k)).length, levels: fullSkills().reduce((a, k) => a + lvOf(s, k.id), 0), missions: MISSIONS.filter((m) => s.missions[m.id] === 'claimed').length, missing: MISSIONS.filter((m) => s.missions[m.id] !== 'claimed').map((m) => m.id) };
  }
  return res;
}

// ---------------------------------------------------------------- 実時間

/** セクタの区切りの実時間（秒）。until：'top'＝制覇まで、'left'＝離れるまで */
export function secOf(p: PolicyId, r: SectorRun, until: 'top' | 'left'): number | null {
  const T = SIM_TIME[p];
  const end = until === 'top' ? r.topDay : r.left;
  if (end == null) return null;
  const days = end - r.arrived;
  // v9：発掘作業（15 秒）のあいだも時間は流れるので、ひと月の時間に重なる（始める操作は行動 1 回）。足すのは会話（出会い・発表）
  const dig = (until === 'top' ? r.dig.talksTop : r.dig.talks) * T.talk;
  return (days / 30) * T.month + (until === 'top' ? r.actTop : r.act) * T.action + (until === 'top' ? r.pauseTop : r.pause) * T.pause + dig;
}
export const totalSec = (x: RunResult) => SIM_TIME[x.policy].tutorial + x.sectors.reduce((a, r) => a + (secOf(x.policy, r, 'left') ?? 0), 0);

// ---------------------------------------------------------------- 表

const fmtMin = (sec: number) => `${Math.round(sec / 60)} 分`;
const fmtH = (sec: number) => `${(sec / 3600).toFixed(1)} h`;
const fmtG = (v: number) => `${Math.round(v / 1000).toLocaleString('en-US')}k`;
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);
const range = (xs: number[], f: (v: number) => string = (v) => String(v)) => (xs.length ? (Math.min(...xs) === Math.max(...xs) ? f(xs[0]) : `${f(Math.min(...xs))}〜${f(Math.max(...xs))}`) : '—');

export interface Report2 {
  runs: RunResult[];
  ablation: { skill: string; base: number; without: number; n: number }[];
  /** 技を 1 つも取らない「通常」（gap の商品を立ち上げず、基礎の商品だけで戦う）。新しい商材が要るかの確かめ */
  noTech?: RunResult[];
  ms: number;
}

const sectorName = (id: string) => `${sectorDef(id).name}（${id}）`;

export function tables(rep: Report2): string {
  const out: string[] = [];
  const pols: PolicyId[] = ['rta', 'normal', 'full'];
  const seeds = [...new Set(rep.runs.map((r) => r.seed))];
  out.push('### 表 1：方針 × セクタの「制覇（2 か月続けて 1 位）までの月数」');
  out.push('');
  out.push(`シード ${seeds.join('・')} の平均（最小〜最大）。月数は開店からの月の締めの回数。「初の 1 位」は初めて 1 位になった月（v3 までの「1 位までの月数」と同じもの）。売上・資金は制覇した月の締めの時点。実時間は着いてから制覇の締めまで（単価は下の SIM_TIME）。`);
  out.push('');
  out.push('| 方針 | セクタ | ランク | 制覇までの月数 | 初の 1 位 | 制覇の月の売上 | そのときの資金 | スキル数 | 実時間（制覇まで） | 制覇できた |');
  out.push('|---|---|---|---|---|---|---|---|---|---|');
  for (const p of pols) {
    const runs = rep.runs.filter((r) => r.policy === p);
    for (const id of routeOf(p)) {
      const rs = runs.map((r) => r.sectors.find((x) => x.id === id)).filter((x): x is SectorRun => !!x);
      const tops = rs.filter((x) => x.months != null);
      const months = tops.map((x) => x.months!);
      const secs = tops.map((x) => secOf(p, x, 'top')!);
      const reach = `${tops.length}/${runs.length}${rs.length < runs.length ? `（未到達 ${runs.length - rs.length}）` : ''}${rs.length > tops.length ? `（制覇できない ${rs.length - tops.length}）` : ''}`;
      const firsts = rs.map((x) => x.first).filter((v): v is number => v != null);
      out.push(
        `| ${POLICY_NAME[p]} | ${sectorName(id)} | ${sectorDef(id).tier} | ${tops.length ? `${mean(months).toFixed(1)}（${range(months)}）` : '制覇できない'} | ${firsts.length ? `${mean(firsts).toFixed(1)}（${range(firsts)}）` : '—'} | ${tops.length ? `${fmtG(mean(tops.map((x) => x.rev)))}（${range(tops.map((x) => x.rev), fmtG)}）` : '—'} | ${tops.length ? fmtG(mean(tops.map((x) => x.money))) : '—'} | ${tops.length ? mean(tops.map((x) => x.skills)).toFixed(0) : '—'} | ${tops.length ? `${fmtMin(mean(secs))}（${range(secs, fmtMin)}）` : '—'} | ${reach} |`,
      );
    }
  }
  out.push('');
  out.push('### 表 2：方針ごとの合計と、憲章の目標との差');
  out.push('');
  out.push('合計は、着いてから次のセクタへ移るまで（制覇のあと資金をためる月も含む）＋ チュートリアル。Rare 以降は未実装なので「—」。');
  out.push('');
  out.push('| 方針 | 回ったセクタ | 合計の月数（ゲーム内） | 行動の数 | 合計の実時間 | うち Common | うち Uncommon | Rare〜Legendary | 憲章の目標（Lime 全体） | 目標の配分での C＋U の目安 | 差 |');
  out.push('|---|---|---|---|---|---|---|---|---|---|---|');
  const target: Record<PolicyId, { label: string; cu: [number, number] }> = {
    // rta：1 セクタ 15 分 × C1・U1（Common やや短め）→ 25〜30 分
    rta: { label: '2 h（C〜L）', cu: [25 * 60, 30 * 60] },
    // normal：1 セクタ 40〜45 分 × C3・U2 → 200〜225 分（Common やや短め）
    normal: { label: '5〜6 h', cu: [190 * 60, 225 * 60] },
    // full：Lime 21 セクタのうち C8・U5。8 h 以上を 21 セクタで割ると 1 セクタ 23 分以上 → 13 セクタで 5 h 以上
    full: { label: '8 h 以上', cu: [5 * 3600, 6 * 3600] },
  };
  for (const p of pols) {
    const runs = rep.runs.filter((r) => r.policy === p);
    const tot = runs.map(totalSec);
    const byTier = (tier: Tier) => runs.map((x) => x.sectors.filter((r) => r.tier === tier).reduce((a, r) => a + (secOf(p, r, 'left') ?? 0), 0) + (tier === 'C' ? SIM_TIME[p].tutorial : 0));
    const months = runs.map((x) => x.days / 30);
    const acts = runs.map((x) => Object.values(x.actions).reduce((a, b) => a + b, 0));
    const done = runs.filter((x) => x.done).length;
    const visited = mean(runs.map((x) => x.sectors.filter((r) => r.months != null).length));
    const tg = target[p];
    const m = mean(tot);
    const diff = m < tg.cu[0] ? `目安より ${fmtMin(tg.cu[0] - m)} 短い` : m > tg.cu[1] ? `目安より ${fmtMin(m - tg.cu[1])} 長い` : '目安の範囲';
    out.push(
      `| ${POLICY_NAME[p]} | 制覇 ${visited.toFixed(1)} / ${routeOf(p).length}（完走 ${done}/${runs.length}） | ${mean(months).toFixed(1)}（${range(months.map((v) => Math.round(v)))}） | ${Math.round(mean(acts))} | ${fmtH(m)}（${range(tot, fmtH)}） | ${fmtH(mean(byTier('C')))} | ${fmtH(mean(byTier('U')))} | — | ${tg.label} | ${fmtH(tg.cu[0])}〜${fmtH(tg.cu[1])} | ${diff} |`,
    );
  }
  out.push('');
  // v10c：復刻品（研究 Lv3 で開く新商品）の売上の割合
  out.push('### 表 3：復刻品（v10c。研究 Lv3 で開く新商品）');
  out.push('');
  out.push('開いたレシピの数（最後）と、売上の合計（着いてから離れるまで）のうち復刻品の割合。最短は復刻品を並べない（いままでどおり）。');
  out.push('');
  out.push('| 方針 | 開いたレシピ | 復刻品の売上（合計） | 売上の合計 | 復刻品の割合 | うち Common | うち Uncommon |');
  out.push('|---|---|---|---|---|---|---|');
  for (const p of pols) {
    const runs = rep.runs.filter((r) => r.policy === p);
    const sum = (f: (r: SectorRun) => number, tier?: Tier) => mean(runs.map((x) => x.sectors.filter((r) => !tier || r.tier === tier).reduce((a, r) => a + f(r), 0)));
    const pct = (tier?: Tier) => {
      const all = sum((r) => r.allRev, tier);
      return all > 0 ? `${((sum((r) => r.relicRev, tier) / all) * 100).toFixed(1)}%` : '—';
    };
    out.push(`| ${POLICY_NAME[p]} | ${mean(runs.map((x) => x.recipes)).toFixed(1)}（${range(runs.map((x) => x.recipes))}） | ${fmtG(sum((r) => r.relicRev))} | ${fmtG(sum((r) => r.allRev))} | ${pct()} | ${pct('C')} | ${pct('U')} |`);
  }
  out.push('');
  // v12：復興・ダンジョン・遺物の展示館
  out.push('### 表 4：復興・ダンジョン・遺物の展示館（v12。発掘 v2 の 4 段目）');
  out.push('');
  out.push('最後の時点（3 シードの平均。最小〜最大）。復興は回ったセクタの合計（4 か所目はダンジョン）。見つけた上のランクの遺物は研究ノートの種類（掘った数）。Uncommon は Uncommon のセクタの荒れ地の出土品も入る（Rare・Epic・Legendary はダンジョンの奥だけ）。展示館の収入は入館料の合計。');
  out.push('');
  out.push('| 方針 | 復興した荒れ地 | ダンジョン | 潜った回数 | 最深 | Uncommon | Rare | Epic | Legendary | 展示館 | 展示館の収入（合計） | 節目 |');
  out.push('|---|---|---|---|---|---|---|---|---|---|---|---|');
  for (const p of pols) {
    const runs = rep.runs.filter((r) => r.policy === p);
    const v = (f: (x: RunResult['v12']) => number) => runs.map((r) => f(r.v12));
    const mr = (f: (x: RunResult['v12']) => number, d = 1) => `${mean(v(f)).toFixed(d)}（${range(v(f))}）`;
    const rk = (k: 'U' | 'R' | 'E' | 'L') => `${mean(v((x) => x.found[k])).toFixed(1)} 種（${mean(v((x) => x.got[k])).toFixed(1)} 個）`;
    out.push(`| ${POLICY_NAME[p]} | ${mr((x) => x.revived)} | ${mr((x) => x.dungeons)} | ${mr((x) => x.dives)} | ${mr((x) => x.best)} | ${rk('U')} | ${rk('R')} | ${rk('E')} | ${rk('L')} | ${runs.filter((r) => r.v12.museum).length}/${runs.length} | ${fmtG(mean(v((x) => x.income)))}（${range(v((x) => x.income), fmtG)}） | ${mr((x) => x.marks)} |`);
  }
  out.push('');
  out.push('実時間の単価（`SIM_TIME`）：');
  out.push('');
  out.push('| 方針 | ひと月 | 行動 1 回 | 月末ポーズ | チュートリアル | 会話 1 回（v8） | 発掘作業 1 回（v9） |');
  out.push('|---|---|---|---|---|---|---|');
  for (const p of pols) out.push(`| ${POLICY_NAME[p]} | ${SIM_TIME[p].month} 秒 | ${SIM_TIME[p].action} 秒 | ${SIM_TIME[p].pause} 秒 | ${SIM_TIME[p].tutorial / 60} 分 | ${SIM_TIME[p].talk} 秒 | ${DIG_BALANCE.sessionSec} 秒（ゲームの ${runDays(p).toFixed(1)} 日） |`);
  out.push('');
  out.push('発掘作業（15 秒）のあいだも時間は流れるので、ひと月の時間に重なる（荒れ地を押して始める 1 回を行動 1 回に数える）。会話は発掘との出会いと研究成果の発表。');
  out.push('');
  out.push(`発掘作業の仮定（\`SIM_DIG\`。1 回 ${DIG_BALANCE.sessionSec} 秒 × 1 秒に ${DIG_BALANCE.simTapsPerSec} 打 ＝ ${runTaps()} 打を、作業の日数に均して打つ）：`);
  out.push('');
  out.push('| 方針 | ひと月の作業 | 打つマス | 発掘許可 | 発掘隊 | 発掘の枝（v10） |');
  out.push('|---|---|---|---|---|---|');
  const per = (p: PolicyId) => (SIM_DIG[p].perMonth == null ? `前の作業が終わったらすぐ次（続けて掘る。ひと月に ${(30 / runDays(p)).toFixed(1)} 回まで）` : `${SIM_DIG[p].perMonth} 回（月の前半と後半）`);
  const tgt = (p: PolicyId) => (SIM_DIG[p].target === 'know' ? '配置を知っている：まだのお題のある荒れ地 → お題（無ければ石板・エクステ）の範囲を、取るまでの打つ回数が少ないものから手前の層へ' : 'v11：覗き見が出ているマス（お題 → 石板 → エクステ → 素材）→ 取りかけ・打ちかけ → 浅いマス（いまの荒れ地を掘りきるまで）→ お題の気配のある荒れ地');
  const pm = (p: PolicyId) => (p === 'rta' ? `まだのお題のある荒れ地だけ（申請料の ${SIM_DIG[p].permit} 倍＋5,000 G あれば）` : p === 'normal' ? `掘れる荒れ地が無くなったら次の 1 か所（申請料の ${SIM_DIG[p].permit} 倍＋5,000 G あれば）` : `資金が申請料の ${SIM_DIG[p].permit} 倍＋5,000 G あれば、月末にあるだけ`);
  const dg = (p: PolicyId) => (SIM_DIG[p].digger === 0 ? '置かない' : 'いつも 1 人');
  const tl = (p: PolicyId) => (SIM_DIG[p].tree === 'deep' ? 'お題が許可の無い層に残っていれば、深い層の許可 Lv1（根もとの追加申請・ランタンから）だけ' : SIM_DIG[p].tree === 'share' ? `月末に、月の売上の ${Math.round(SIM_DIG[p].share * 100)}% を積み立てた枠で（買ったあとも 1 万 G 残るとき）研究の目利き Lv2 → 安い順に（掘れずに止まっている・お題が許可の無い層にあれば、枠に関係なく深い層の許可を先に）。発破を持っていて依頼状を待っていれば発破` : 'ほかのスキルと同じく安い順にまとめて全部 Lv5 まで（掘れずに止まっていれば、資金をためている月も深い層の許可を先に）。資金 5 万 G 以上なら発破');
  for (const p of pols) out.push(`| ${POLICY_NAME[p]} | ${per(p)} | ${tgt(p)} | ${pm(p)} | ${dg(p)} | ${tl(p)} |`);
  return out.join('\n');
}

/** 詰まりの観察（数字だけ。文章は docs に手で書く） */
export function observations(rep: Report2): string {
  const out: string[] = [];
  out.push('### 計測の生データ（観察のもと）');
  out.push('');
  out.push('ボトルネック（制覇するまでの月の締め）の分布：ゲームの表示（`bottleneck()`）/ 人の読み（`readBn`：調達と製造の棒が同じ長さなら製造）');
  out.push('');
  out.push('| 方針 | ランク | 月数 | 調達 | 製造 | 運搬 | 販売 |');
  out.push('|---|---|---|---|---|---|---|');
  for (const p of ['rta', 'normal', 'full'] as PolicyId[]) {
    for (const tier of ['C', 'U'] as Tier[]) {
      const cnt: Record<string, [number, number]> = { buy: [0, 0], craft: [0, 0], haul: [0, 0], sell: [0, 0] };
      let n = 0;
      for (const r of rep.runs.filter((x) => x.policy === p))
        for (const sec of r.sectors.filter((x) => x.tier === tier))
          for (const l of sec.log) {
            if (sec.months != null && l.m > sec.months) continue;
            n++;
            if (l.bn) cnt[l.bn][0]++;
            cnt[l.read][1]++;
          }
      if (!n) continue;
      const f = (k: string) => `${cnt[k][0]} / ${cnt[k][1]}`;
      out.push(`| ${POLICY_NAME[p]} | ${tier} | ${n} | ${f('buy')} | ${f('craft')} | ${f('haul')} | ${f('sell')} |`);
    }
  }
  out.push('');
  out.push('月末の資金（制覇するまで）：最小・最大・「3,000 G 未満」の月・「10 万 G 以上」の月');
  out.push('');
  out.push('| 方針 | セクタ | 最小 | 最大 | 3,000 G 未満 | 10 万 G 以上 | 制覇の月の 1 位の他社の売上 |');
  out.push('|---|---|---|---|---|---|---|');
  for (const p of ['rta', 'normal', 'full'] as PolicyId[]) {
    for (const id of routeOf(p)) {
      const logs = rep.runs.filter((x) => x.policy === p).flatMap((r) => r.sectors.filter((x) => x.id === id).flatMap((x) => x.log.filter((l) => x.months == null || l.m <= x.months)));
      if (!logs.length) continue;
      const tops = rep.runs.filter((x) => x.policy === p).flatMap((r) => r.sectors.filter((x) => x.id === id && x.months != null).map((x) => x.log.find((l) => l.m === x.months)!.top));
      out.push(`| ${POLICY_NAME[p]} | ${id} | ${fmtG(Math.min(...logs.map((l) => l.money)))} | ${fmtG(Math.max(...logs.map((l) => l.money)))} | ${logs.filter((l) => l.money < 3000).length} | ${logs.filter((l) => l.money >= 100000).length} | ${tops.length ? fmtG(mean(tops)) : '—'} |`);
    }
  }
  out.push('');
  if (rep.ablation.length) {
    out.push(`スキル・設備投資の効き目（通常の方針・タオックスだけ・シード ${[...new Set(rep.runs.map((r) => r.seed))].join('・')}）：それを取らせないときの「制覇までの月数」。「@」は設備投資`);
    out.push('');
    out.push('| スキル・設備投資 | ふつう | 取らないとき | 差 |');
    out.push('|---|---|---|---|');
    for (const a of rep.ablation) out.push(`| ${SKILL[a.skill]?.name ?? INVEST[a.skill.slice(1)]?.name ?? a.skill}（${a.skill}） | ${a.base.toFixed(1)} | ${a.without.toFixed(1)} | ${(a.without - a.base >= 0 ? '+' : '') + (a.without - a.base).toFixed(1)} |`);
    out.push('');
  }
  if (rep.noTech?.length) {
    const base = rep.runs.filter((r) => r.policy === 'normal');
    out.push(`技なしとの比べ（通常の方針・シード ${rep.noTech.map((r) => r.seed).join('・')}）：技を 1 つも取らず、基礎の商品（多くは他店で供給が足りている）だけで戦ったときの「制覇までの月数」。${MONTH_CAP} か月で制覇できなければ「なれない」`);
    out.push('');
    out.push('| セクタ | ふつう | 技なし | 技なしで制覇できた |');
    out.push('|---|---|---|---|');
    for (const id of routeOf('normal')) {
      const m = (rs: RunResult[]) => rs.map((r) => r.sectors.find((x) => x.id === id)?.months).filter((v): v is number => v != null);
      const a = m(base);
      const b = m(rep.noTech);
      const reached = rep.noTech.filter((r) => r.sectors.some((x) => x.id === id)).length;
      out.push(`| ${sectorName(id)} | ${a.length ? mean(a).toFixed(1) : '—'} | ${b.length ? `${mean(b).toFixed(1)}（${range(b)}）` : 'なれない'} | ${b.length}/${reached}${reached < rep.noTech.length ? `（未到達 ${rep.noTech.length - reached}）` : ''} |`);
    }
    out.push('');
  }
  out.push(digObservations(rep));
  const KINDS = ['build', 'assign', 'hire', 'skill', 'craft', 'proc', 'buy', 'shelf', 'part', 'ad', 'invest', 'dev', 'accept', 'claim', 'gate', 'move', 'dig', 'permit', 'present'];
  out.push('行動の内訳（3 シードの平均。v9：dig＝発掘作業（15 秒）を始めた回、permit＝発掘許可の申請、present＝研究成果の発表）：');
  out.push('');
  out.push('| 方針 | ' + KINDS.join(' | ') + ' |');
  out.push('|---|' + '---|'.repeat(KINDS.length));
  for (const p of ['rta', 'normal', 'full'] as PolicyId[]) {
    const runs = rep.runs.filter((x) => x.policy === p);
    out.push(`| ${POLICY_NAME[p]} | ` + KINDS.map((k) => Math.round(mean(runs.map((r) => r.actions[k] ?? 0)))).join(' | ') + ' |');
  }
  out.push('');
  const fulls = rep.runs.filter((x) => x.policy === 'full');
  if (fulls.length) {
    out.push(`100% のゴールの到達（${fulls.length} シード）：` + fulls.map((r) => `seed ${r.seed}：👑 ${r.goal?.crowns}/13・スキル ${r.goal?.skills}/${fullSkills().length}（C・U の取れるパネル。大きめの研究パネル ${fullSkills().filter((k) => k.big).length} 枚を含む）・Lv 最大 ${r.goal?.maxed}/${fullSkills().length}（レベルの合計 ${r.goal?.levels}/${fullSkills().reduce((a, k) => a + maxLv(k), 0)}）・依頼 ${r.goal?.missions}/${MISSIONS.length}${r.goal?.missing?.length ? `（残り：${r.goal.missing.join('・')}）` : ''}${r.stop ? `（${r.stop}）` : ''}`).join('／'));
    out.push('');
  }
  const stops = rep.runs.filter((r) => r.stop && r.policy !== 'full');
  if (stops.length) {
    out.push('打ち切り：' + stops.map((r) => `${POLICY_NAME[r.policy]} seed ${r.seed}：${r.stop}`).join('／'));
    out.push('');
  }
  return out.join('\n');
}

/** v8：発掘と研究ポイント・お金の使い道の表（数字だけ） */
export function digObservations(rep: Report2): string {
  const out: string[] = [];
  const pols: PolicyId[] = ['rta', 'normal', 'full'];
  out.push('発掘と研究ポイント（v9。セクタごと・3 シードの平均。打った数は着いてから離れるまで。研究パネルは、そのセクタにいるあいだに開けた枚数。「RP 不足」は、詰まりの段に効く研究パネルがあるのにどれも RP が足りなかった月の締め。「お題」はお題がそろった月（着いてからの月の締め）、「依頼状待ち」は制覇のあと依頼状が無くて Uncommon へ移れなかった月。「掘りきり」は離れたときに掘りきった荒れ地の数（4 か所のうち））：');
  out.push('');
  out.push('| 方針 | セクタ | 作業の回数 | 許可 | 手 | 発掘隊 | 発破 | 入った RP | 研究パネル | RP 不足の月 | お題 | 依頼状待ち | 掘りきり | 掘り残し（マス） |');
  out.push('|---|---|---|---|---|---|---|---|---|---|---|---|---|---|');
  for (const p of pols) {
    const runs = rep.runs.filter((r) => r.policy === p);
    for (const id of routeOf(p)) {
      const rs = runs.map((r) => r.sectors.find((x) => x.id === id)).filter((x): x is SectorRun => !!x);
      if (!rs.length) continue;
      const m = (f: (d: DigRec) => number) => Math.round(mean(rs.map((x) => f(x.dig))));
      const tops = rs.map((x) => x.dig.topicsAt).filter((v): v is number => v != null);
      out.push(
        `| ${POLICY_NAME[p]} | ${sectorName(id)} | ${m((d) => d.runs)} | ${mean(rs.map((x) => x.dig.permits)).toFixed(1)} | ${m((d) => d.mid)} | ${m((d) => d.auto)} | ${m((d) => d.blast)} | ${m((d) => d.rp)} | ${m((d) => d.research)} | ${m((d) => d.rpBlocked)} | ${tops.length ? `${mean(tops).toFixed(1)}（${tops.length}/${rs.length}）` : '—'} | ${m((d) => d.letterWait)} | ${mean(rs.map((x) => x.dig.done)).toFixed(1)} | ${m((d) => d.left)} |`,
      );
    }
  }
  out.push('');
  const cN = SKILLS.filter((k) => skillTier(k) === 'C' && isResearch(k) && !skillSoon(k)).length;
  const uN = fullSkills().filter((k) => skillTier(k) === 'U' && isResearch(k)).length;
  out.push(`研究パネルを開けた枚数（最後に）と、お金の使い道（G。3 シードの平均）。C の研究パネル ${cN} 枚・U の研究パネル ${uN} 枚（いま取れるもの）。「C がそろったセクタ」は Common の研究パネルを全部開けたときにいたセクタの番号（回った順。1 か所目＝1）：`);
  out.push('');
  out.push('| 方針 | C の研究パネル | U の研究パネル | C がそろったセクタ | お金パネル（開放・レベル上げ。発掘の枝を除く） | 発掘の枝（開放・レベル上げ・火薬代・燃料代） | 関所・出店許可 | 最後に残った資金 |');
  out.push('|---|---|---|---|---|---|---|---|');
  for (const p of pols) {
    const runs = rep.runs.filter((r) => r.policy === p);
    if (!runs.length) continue;
    const all = runs.map((r) => r.research.allC).filter((v): v is number => v != null);
    out.push(
      `| ${POLICY_NAME[p]} | ${mean(runs.map((r) => r.research.C)).toFixed(0)} / ${cN} | ${mean(runs.map((r) => r.research.U)).toFixed(0)} / ${uN} | ${all.length ? `${mean(all).toFixed(1)}（${all.length}/${runs.length}）` : 'そろわない'} | ${fmtG(mean(runs.map((r) => r.spend.money)))} | ${fmtG(mean(runs.map((r) => r.spend.tools)))} | ${fmtG(mean(runs.map((r) => r.spend.fees)))} | ${fmtG(mean(runs.map((r) => r.spend.end)))} |`,
    );
  }
  out.push('');
  return out.join('\n');
}

// ---------------------------------------------------------------- まとめて回す

export const SEEDS = [1, 2, 3];
/** 技の枝のスキル（技なしの比較で外す） */
export const TECH_SKILLS = SKILLS.filter((k) => k.branch === 'tech').map((k) => k.id);

export function runAll(seeds = SEEDS, opts: { ablation?: boolean } = {}): Report2 {
  const t0 = performance.now();
  const runs: RunResult[] = [];
  for (const p of ['rta', 'normal', 'full'] as PolicyId[]) for (const seed of seeds) runs.push(runOnce(p, seed));
  const ablation: Report2['ablation'] = [];
  if (opts.ablation) {
    // 通常の方針がタオックスで取ったスキルを 1 つずつ外す
    const base = seeds.map((seed) => runOnce('normal', seed, { onlyFirst: true }));
    const baseM = mean(base.map((r) => r.sectors[0].months ?? MONTH_CAP));
    const taken = [...new Set(base.flatMap((r) => r.skillsAt.filter((k) => k.sector === 'c1' && k.day <= (r.sectors[0].topDay ?? Infinity)).map((k) => k.id)))].filter((id) => id !== 'hire');
    for (const id of taken) {
      const rs = seeds.map((seed) => runOnce('normal', seed, { onlyFirst: true, ban: [id] }));
      ablation.push({ skill: id, base: baseM, without: mean(rs.map((r) => r.sectors[0].months ?? MONTH_CAP)), n: rs.length });
    }
    ablation.sort((a, b) => a.without - a.base - (b.without - b.base));
  }
  const noTech = opts.ablation ? seeds.map((seed) => runOnce('normal', seed, { ban: TECH_SKILLS })) : undefined;
  return { runs, ablation, noTech, ms: performance.now() - t0 };
}

/** docs/ISLAND_BALANCE.md の「自動で書く」部分を差し替える（前後の手書きの文はそのまま） */
export const AUTO_BEGIN = '<!-- island:sim:begin（npm run island:sim が書き換える。手で直さない） -->';
export const AUTO_END = '<!-- island:sim:end -->';
export function writeDoc(path: string, rep: Report2, existing: string | null) {
  const body = [AUTO_BEGIN, '', `最終更新：npm run island:sim（${rep.runs.length} 回の自動プレイ・計測 ${(rep.ms / 1000).toFixed(1)} 秒）`, '', tables(rep), '', observations(rep), AUTO_END].join('\n');
  let doc: string;
  if (existing && existing.includes(AUTO_BEGIN) && existing.includes(AUTO_END)) doc = existing.slice(0, existing.indexOf(AUTO_BEGIN)) + body + existing.slice(existing.indexOf(AUTO_END) + AUTO_END.length);
  else doc = `# アイランドのバランス（自動プレイの計測）\n\n${body}\n`;
  writeFileSync(path, doc);
  return doc;
}
