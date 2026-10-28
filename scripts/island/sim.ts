/**
 * アイランド（フェーズ 1）の高速自動プレイ：クリア時間の計測ハーネス（UI なし・モデル層だけ）。
 * 3 つの遊び方（最短 rta／通常 normal／100% full）で、セクタごとの「1 位までの月数」と実時間の見積もりを出す。
 * 実行：`npm run island:sim`（tests/island-p1-sim.test.ts から呼ぶ。結果は console と docs/ISLAND_BALANCE.md）。
 * ゲームの数値（data.ts・式）は変えない。ここは計測だけ。
 */
import { writeFileSync } from 'node:fs';
import { aptitude, ADS, MISSIONS, P1B, PRODUCT, PRODUCTS, SECTORS, SKILL, SKILLS, TIERS, UNCOMMON, sku, skuParts, type Mat, type Sku, type Task, type Tier } from '../../src/island/p1/data';
import { managerApt, sectorDef } from '../../src/island/p1/company';
import { crowned, moveTo } from '../../src/island/p1/land';
import {
  accept,
  allowedDirs,
  assign,
  build,
  buy,
  canBuild,
  claim,
  craftDays,
  batchOf,
  develop,
  gateToll,
  has,
  heroStats,
  hire,
  invest,
  investCost,
  learn,
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
  startCraft,
  step,
  toggleProcItem,
  tutSpot,
  unitCost,
  matPrice,
  type P1State,
  type Report,
  type Stage,
} from '../../src/island/p1/model';

// ---------------------------------------------------------------- 実時間の単価（docs/ISLAND_UX_CHARTER.md「5. 進行とテンポ」）

/**
 * 1 日 1.2 秒・ひと月 36 秒。rta は ⏩（×4）常用でひと月 9 秒、行動 1 回 2 秒、月末ポーズ 10 秒。
 * normal は ×1 でひと月 36 秒、行動 1 回 4 秒、月末ポーズ 60 秒、チュートリアル 10 分。full は normal と同じ単価。
 */
export const SIM_TIME = {
  rta: { month: 9, action: 2, pause: 10, tutorial: 0 },
  normal: { month: 36, action: 4, pause: 60, tutorial: 600 },
  full: { month: 36, action: 4, pause: 60, tutorial: 600 },
} as const;

/** 1 セクタの打ち切り（か月） */
export const MONTH_CAP = 120;

export type PolicyId = 'rta' | 'normal' | 'full';
export const POLICY_NAME: Record<PolicyId, string> = { rta: '最短', normal: '通常', full: '100%' };

// ---------------------------------------------------------------- 記録

export interface SectorRun {
  id: string;
  tier: Tier;
  /** 着いた日・開店の日・1 位の月の締めの日・離れた日（ゲームの日） */
  arrived: number;
  open: number | null;
  topDay: number | null;
  left: number | null;
  /** 1 位までの月数（開店からの月の締めの回数） */
  months: number | null;
  /** 1 位の月の売上・そのときの資金・スキル数 */
  rev: number;
  money: number;
  skills: number;
  /** 1 位までの行動の数・月の締めの数 / 離れるまで */
  actTop: number;
  pauseTop: number;
  act: number;
  pause: number;
  /** 月ごとの締め（順位・売上・資金・ボトルネック） */
  /** bn：ゲームの bottleneck()（月の締め）、read：人が読むボトルネック（readBn） */
  log: { m: number; rank: number; rev: number; top: number; money: number; bn: Stage | undefined; read: Stage }[];
}

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
  goal?: { crowns: number; skills: number; missions: number };
}

// ---------------------------------------------------------------- 方針

/** 枝の中で、普通の人が説明を読んで選ぶ順（詰まりを直すのに効く順） */
const BRANCH_ORDER: Record<Stage, string[]> = {
  buy: ['stock1', 'bulk', 'swift', 'tidy', 'eye', 'stock2', 'bulk2', 'rack', 'stock3', 'b_partner'],
  craft: ['bench2', 'jig', 'chair', 'jig2', 'bench3', 'pot'],
  haul: ['loading', 'cart2', 'shortcut', 'backroom', 'truck', 'cart3', 'hub'],
  sell: ['shelf1', 'host', 'parttime', 'display', 'shop2', 'shelf2', 'shop3', 'b_sign', 'b_premium'],
};

/** 最短：知っている人の取り方（アンコモンへ一直線、そのあと売り場と運搬） */
const RTA_SKILLS = ['hire', 'bench2', 'pot', 'route_cloth', 'route_paper', 'shelf1', 'host', 'cart2', 'loading', 'stock1', 'jig', 'bulk', 'tidy', 'b_sign', 'shop2', 'route_gem', 'truck', 'bench3', 'jig2', 'stock2', 'shelf2', 'display', 'parttime', 'shortcut', 'backroom', 'chair', 'lounge', 'shop3', 'swift'];

interface Ctx {
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
}

const DIRS = ['rd', 'ld', 'lu', 'ru'] as const;

/** 手の届く人（ほかのセクタのマネージャーを除く） */
const crew = (s: P1State) => s.staff.filter((x) => x.task !== 'manager');
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

/** その商品の素材のルートが全部ある */
const routesOk = (s: P1State, x: Sku) => Object.keys(recipeOf(x)).every((m) => s.routes.includes(m as Mat));
/** アンコモンを作れる職人（いまいる人） */
const uCrafters = (s: P1State) => crew(s).filter((x) => aptitude(x.stats, 'craft') >= UNCOMMON.minCraft);

/** 作業台ごとに作るもの：売れる見込み × 利益（作業台 1 つの月の量で頭打ち）の大きい順。アンコモンは作れるときだけ */
function chooseLineup(s: P1State, c: Ctx): Sku[] {
  const benches = Math.max(1, s.slots.length);
  // 並べられる種類：お店の棚の数（どのお店にも同じ並びを置く）
  const shopIds = s.buildings.filter((b) => b.owner === 'me' && P1B[b.id]?.kind === 'shop').map((b) => b.id);
  const kinds = Math.max(1, Math.min(benches, ...(shopIds.length ? shopIds.map((id) => shelfCount(s, id)) : [1])));
  const tier = s.tier ?? 'C';
  const nU = uCrafters(s).length;
  const cands: { x: Sku; v: number; key: string }[] = [];
  for (const p of PRODUCTS) {
    const est = Math.max(4, sellEstimate(s, p.key));
    for (const r of ['C', 'U'] as const) {
      const x = sku(p.key, r);
      if (!routesOk(s, x)) continue;
      if (r === 'U' && (!has(s, 'pot') || !s.dev.includes(p.key) || nU === 0)) continue;
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
    const want: Record<string, string> = { sensu100: 'Sensu', lantern50: 'Lantern', c2_lantern: 'Lantern', c3_mallet: 'Mallet' };
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

  // ---- スキル（人材の募集はチュートリアルでも取る）
  const pending = new Set<string>();
  const learnable = (id: string) => {
    const k = SKILL[id];
    return k && !has(s, id) && !pending.has(id) && !c.ban.has(id) && !(k.requires ?? []).some((r) => !has(s, r) && !pending.has(r)) && (s.brand ?? 0) >= (k.brand ?? 0);
  };
  const take = (id: string, keep = reserve) => {
    if (!learnable(id) || budget < SKILL[id].cost + keep) return false;
    spend(SKILL[id].cost);
    pending.add(id);
    acts.push({ kind: 'skill', run: () => learn(s, id) });
    return true;
  };
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
      const idle = free.filter((x) => x.task == null || (x.task === 'side' && !rescue) || (w.min && x.task !== 'craft'));
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
    const order = PRODUCTS.map((p) => p.key)
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
  const wantU = (s.tier ?? 'C') !== 'C' || c.policy === 'rta';
  if (c.policy === 'rta') {
    if (!saving) {
      // 決まった順に 1 つずつ。資金が足りない所で止まって貯める（安いものに流れない）
      type Step = () => 'skip' | 'wait';
      const sk = (id: string): Step => () => {
        if (!learnable(id)) return 'skip';
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
      const queue: Step[] = [sk('hire'), shopUpTo(2, false), sk('shelf1'), sk('bench2'), sk('pot'), sk('route_cloth'), sk('route_paper'), dev1, sk('shelf1'), sk('host'), shopUpTo(5, true), sk('loading'), sk('cart2'), sk('stock1'), ad('poster'), sk('jig'), sk('bulk'), sk('tidy'), sk('b_sign'), sk('shop2'), sk('route_gem'), devMore, signs, ...RTA_SKILLS.map(sk), ad('flyer')];
      for (const q of queue) if (q() === 'wait') break;
    }
    // アンコモンの職人がいなければ、候補から雇っておく
    if (has(s, 'pot') && uCrafters(s).length < Math.min(2, s.slots.length) && !hired && budget > 4000) hireU(s, acts, () => (hired = true));
  } else {
    // 通常・100%：月末にまとめて考える
    const r = c.monthEnd;
    if (wantU && !saving) {
      // Uncommon のセクタに着いたら、案内に従って魔法の釜 → 商品開発
      take('bench2', 0);
      take('pot', 0);
      develops();
      if (has(s, 'pot') && uCrafters(s).length === 0 && !hired) hireU(s, acts, () => (hired = true));
    } else if (has(s, 'pot')) develops();
    if (r && !saving) {
      const bn = c.lastBn ?? 'sell';
      // 売り場が細ければ、まずお店を 1 軒（月 1 軒まで。棚 2 の輸入品店は資金に余裕があるとき）
      if (bn === 'sell' && c.shopsThisMonth === 0 && shopsAll.every((b) => b.left <= 0) && shopsAll.length < 5) {
        const kind = shopKind();
        buildShop(budget > P1B[kind].cost * 3 + reserve ? kind : 'general_store');
      }
      let cap = budget * 0.6;
      let n = 0;
      // 詰まっている段の枝から。取れるものが無ければ、次に細い段の枝から
      const caps = stageCaps(s);
      const order = [bn, ...(['buy', 'craft', 'haul', 'sell'] as Stage[]).filter((k) => k !== bn).sort((a, b) => caps[a].perMonth - caps[b].perMonth)];
      for (const st of order) {
        for (const id of BRANCH_ORDER[st]) {
          if (n >= 2) break;
          if (!learnable(id) || SKILL[id].cost > cap) continue;
          if (take(id, 0)) {
            cap -= SKILL[id].cost;
            n++;
          }
        }
        if (n > 0) break;
      }
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
      // 100%：残りのスキルも、資金の 4 割までで安い順に
      if (c.policy === 'full') {
        let rest = budget * 0.4;
        for (const k of [...SKILLS].sort((a, b) => a.cost - b.cost)) {
          if (!learnable(k.id) || k.cost > rest) continue;
          if (take(k.id, 0)) rest -= k.cost;
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
  const units = Math.min(Math.max(4, sellEstimate(s, key)) * UNCOMMON.pull, ((30 * 0.85) / craftDays(s, x)) * batchOf(x));
  return units * (priceOf(s, x) - unitCost(s, x));
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
  /** 最初のセクタで 1 位になったら止める */
  onlyFirst?: boolean;
}

export function runOnce(p: PolicyId, seed: number, o: RunOpts = {}): RunResult {
  const s = newP1(seed);
  const c: Ctx = { policy: p, route: routeOf(p), at: 0, lineup: [], lineupDirty: true, shopsThisMonth: 0, monthEnd: null, lastBn: null, ban: new Set(o.ban ?? []), onlyFirst: !!o.onlyFirst };
  const res: RunResult = { policy: p, seed, sectors: [], actions: {}, days: 0, done: false, skillsAt: [] };
  const newRun = (id: string): SectorRun => ({ id, tier: sectorDef(id).tier, arrived: s.day, open: null, topDay: null, left: null, months: null, rev: 0, money: 0, skills: 0, actTop: 0, pauseTop: 0, act: 0, pause: 0, log: [] });
  let cur = newRun('c1');
  res.sectors.push(cur);
  let skillsSeen = 0;
  const allSkills = SKILLS.length;
  const fullMissions = MISSIONS.length;

  for (let guard = 0; guard < 30 * 600; guard++) {
    // ---- 判断と行動
    const acts = policy(s, c);
    c.monthEnd = null;
    for (const a of acts) {
      const r = a.run();
      if (!ok(r)) continue;
      res.actions[a.kind] = (res.actions[a.kind] ?? 0) + 1;
      cur.act++;
      if (cur.topDay == null) cur.actTop++;
    }
    if (s.skills.length > skillsSeen) {
      for (const id of s.skills.slice(skillsSeen)) res.skillsAt.push({ id, day: s.day, sector: s.sector ?? 'c1' });
      skillsSeen = s.skills.length;
      c.lineupDirty = true;
    }

    // ---- 1 日
    const d = step(s);
    if (d.developed.length || d.finished.length) c.lineupDirty = true;
    if (cur.open == null && s.open != null) cur.open = s.open;
    // 日々の詰まり（最短は毎日見る）
    if (p === 'rta' && myShops(s).length) c.lastBn = readBn(s);
    if (d.report) {
      const r = d.report;
      cur.pause++;
      if (cur.topDay == null) cur.pauseTop++;
      cur.log.push({ m: r.month, rank: r.rank, rev: r.revenue, top: Math.max(...r.area.filter((x) => !x.me).map((x) => x.sales)), money: Math.round(s.money), bn: r.bottleneck, read: readBn(s) });
      c.monthEnd = r;
      if (p !== 'rta') c.lastBn = readBn(s);
      c.shopsThisMonth = 0;
      c.lineupDirty = true;
      if (r.rank === 1 && cur.topDay == null) {
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
        res.stop = `${cur.id} で ${MONTH_CAP} か月たっても 1 位になれない`;
        break;
      }
    }

    // ---- 1 位になったら、次のセクタへ（100% は依頼を済ませてから）
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
        if (s.skills.length >= allSkills && claimed >= fullMissions) {
          res.done = true;
          break;
        }
        if (s.day - (cur.topDay ?? 0) > 30 * MONTH_CAP) {
          res.stop = '全スキル・全依頼に届かない';
          break;
        }
        continue;
      }
      if (p === 'full' && sectorMissionsLeft && s.day - cur.topDay < 30 * 12) continue;
      // 関所 → 出店許可（費用 ＋ 立ち上げの資金）
      const fee = sectorDef(next).fee;
      const start = p === 'rta' ? 8000 : 12000;
      if (!s.land) {
        if (s.money < gateToll(s) + fee + start) continue;
        if (!openGate(s)) continue;
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
      const e = moveTo(s, next, mgr?.hero ?? null);
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
    }
  }
  if (!res.done && !res.stop) res.stop = '日数の上限';
  if (cur.left == null) cur.left = s.day;
  res.days = s.day;
  if (p === 'full') {
    const crowns = SECTORS.filter((x) => (x.tier === 'C' || x.tier === 'U') && !x.cloud && !x.soon).filter((x) => crowned(s, x.id)).length;
    res.goal = { crowns, skills: s.skills.length, missions: MISSIONS.filter((m) => s.missions[m.id] === 'claimed').length };
  }
  return res;
}

// ---------------------------------------------------------------- 実時間

/** セクタの区切りの実時間（秒）。until：'top'＝1 位まで、'left'＝離れるまで */
export function secOf(p: PolicyId, r: SectorRun, until: 'top' | 'left'): number | null {
  const T = SIM_TIME[p];
  const end = until === 'top' ? r.topDay : r.left;
  if (end == null) return null;
  const days = end - r.arrived;
  return (days / 30) * T.month + (until === 'top' ? r.actTop : r.act) * T.action + (until === 'top' ? r.pauseTop : r.pause) * T.pause;
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
  ms: number;
}

const sectorName = (id: string) => `${sectorDef(id).name}（${id}）`;

export function tables(rep: Report2): string {
  const out: string[] = [];
  const pols: PolicyId[] = ['rta', 'normal', 'full'];
  const seeds = [...new Set(rep.runs.map((r) => r.seed))];
  out.push('### 表 1：方針 × セクタの「1 位までの月数」');
  out.push('');
  out.push(`シード ${seeds.join('・')} の平均（最小〜最大）。月数は開店からの月の締めの回数。売上・資金は 1 位になった月の締めの時点。実時間は着いてから 1 位の締めまで（単価は下の SIM_TIME）。`);
  out.push('');
  out.push('| 方針 | セクタ | ランク | 1 位までの月数 | 1 位の月の売上 | そのときの資金 | スキル数 | 実時間（1 位まで） | 1 位になれた |');
  out.push('|---|---|---|---|---|---|---|---|---|');
  for (const p of pols) {
    const runs = rep.runs.filter((r) => r.policy === p);
    for (const id of routeOf(p)) {
      const rs = runs.map((r) => r.sectors.find((x) => x.id === id)).filter((x): x is SectorRun => !!x);
      const tops = rs.filter((x) => x.months != null);
      const months = tops.map((x) => x.months!);
      const secs = tops.map((x) => secOf(p, x, 'top')!);
      const reach = `${tops.length}/${runs.length}${rs.length < runs.length ? `（未到達 ${runs.length - rs.length}）` : ''}${rs.length > tops.length ? `（1 位になれない ${rs.length - tops.length}）` : ''}`;
      out.push(
        `| ${POLICY_NAME[p]} | ${sectorName(id)} | ${sectorDef(id).tier} | ${tops.length ? `${mean(months).toFixed(1)}（${range(months)}）` : '1 位になれない'} | ${tops.length ? `${fmtG(mean(tops.map((x) => x.rev)))}（${range(tops.map((x) => x.rev), fmtG)}）` : '—'} | ${tops.length ? fmtG(mean(tops.map((x) => x.money))) : '—'} | ${tops.length ? mean(tops.map((x) => x.skills)).toFixed(0) : '—'} | ${tops.length ? `${fmtMin(mean(secs))}（${range(secs, fmtMin)}）` : '—'} | ${reach} |`,
      );
    }
  }
  out.push('');
  out.push('### 表 2：方針ごとの合計と、憲章の目標との差');
  out.push('');
  out.push('合計は、着いてから次のセクタへ移るまで（1 位のあと資金をためる月も含む）＋ チュートリアル。Rare 以降は未実装なので「—」。');
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
      `| ${POLICY_NAME[p]} | 1 位 ${visited.toFixed(1)} / ${routeOf(p).length}（完走 ${done}/${runs.length}） | ${mean(months).toFixed(1)}（${range(months.map((v) => Math.round(v)))}） | ${Math.round(mean(acts))} | ${fmtH(m)}（${range(tot, fmtH)}） | ${fmtH(mean(byTier('C')))} | ${fmtH(mean(byTier('U')))} | — | ${tg.label} | ${fmtH(tg.cu[0])}〜${fmtH(tg.cu[1])} | ${diff} |`,
    );
  }
  out.push('');
  out.push('実時間の単価（`SIM_TIME`）：');
  out.push('');
  out.push('| 方針 | ひと月 | 行動 1 回 | 月末ポーズ | チュートリアル |');
  out.push('|---|---|---|---|---|');
  for (const p of pols) out.push(`| ${POLICY_NAME[p]} | ${SIM_TIME[p].month} 秒 | ${SIM_TIME[p].action} 秒 | ${SIM_TIME[p].pause} 秒 | ${SIM_TIME[p].tutorial / 60} 分 |`);
  return out.join('\n');
}

/** 詰まりの観察（数字だけ。文章は docs に手で書く） */
export function observations(rep: Report2): string {
  const out: string[] = [];
  out.push('### 計測の生データ（観察のもと）');
  out.push('');
  out.push('ボトルネック（1 位になるまでの月の締め）の分布：ゲームの表示（`bottleneck()`）/ 人の読み（`readBn`：調達と製造の棒が同じ長さなら製造）');
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
  out.push('月末の資金（1 位になるまで）：最小・最大・「3,000 G 未満」の月・「10 万 G 以上」の月');
  out.push('');
  out.push('| 方針 | セクタ | 最小 | 最大 | 3,000 G 未満 | 10 万 G 以上 | 1 位の月の 1 位の他社の売上 |');
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
    out.push(`スキルの効き目（通常の方針・タオックスだけ・シード ${[...new Set(rep.runs.map((r) => r.seed))].join('・')}）：そのスキルを取らせないときの「1 位までの月数」`);
    out.push('');
    out.push('| スキル | ふつう | 取らないとき | 差 |');
    out.push('|---|---|---|---|');
    for (const a of rep.ablation) out.push(`| ${SKILL[a.skill]?.name ?? a.skill}（${a.skill}） | ${a.base.toFixed(1)} | ${a.without.toFixed(1)} | ${(a.without - a.base >= 0 ? '+' : '') + (a.without - a.base).toFixed(1)} |`);
    out.push('');
  }
  out.push('行動の内訳（3 シードの平均）：');
  out.push('');
  out.push('| 方針 | ' + ['build', 'assign', 'hire', 'skill', 'craft', 'proc', 'buy', 'shelf', 'part', 'ad', 'invest', 'dev', 'accept', 'claim', 'gate', 'move'].join(' | ') + ' |');
  out.push('|---|' + '---|'.repeat(16));
  for (const p of ['rta', 'normal', 'full'] as PolicyId[]) {
    const runs = rep.runs.filter((x) => x.policy === p);
    out.push(`| ${POLICY_NAME[p]} | ` + ['build', 'assign', 'hire', 'skill', 'craft', 'proc', 'buy', 'shelf', 'part', 'ad', 'invest', 'dev', 'accept', 'claim', 'gate', 'move'].map((k) => Math.round(mean(runs.map((r) => r.actions[k] ?? 0)))).join(' | ') + ' |');
  }
  out.push('');
  const fulls = rep.runs.filter((x) => x.policy === 'full');
  if (fulls.length) {
    out.push(`100% のゴールの到達（${fulls.length} シード）：` + fulls.map((r) => `seed ${r.seed}：👑 ${r.goal?.crowns}/13・スキル ${r.goal?.skills}/${SKILLS.length}・依頼 ${r.goal?.missions}/${MISSIONS.length}${r.stop ? `（${r.stop}）` : ''}`).join('／'));
    out.push('');
  }
  const stops = rep.runs.filter((r) => r.stop && r.policy !== 'full');
  if (stops.length) {
    out.push('打ち切り：' + stops.map((r) => `${POLICY_NAME[r.policy]} seed ${r.seed}：${r.stop}`).join('／'));
    out.push('');
  }
  return out.join('\n');
}

// ---------------------------------------------------------------- まとめて回す

export const SEEDS = [1, 2, 3];

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
  return { runs, ablation, ms: performance.now() - t0 };
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
