/**
 * 発掘場と研究ノートの表示のための純粋な関数（DOM を持たない。tests/island-p1-digui.test.ts で確かめる）。
 * 画面は digui.ts。仕様は docs/ISLAND_PHASE1.md「地層の発掘と研究ポイント」の「15 秒の発掘」「発掘場の画面」「研究ノート」。
 */
import { t } from '../../i18n';
import { DIG, DIG_AUTO, DIG_BALANCE, DIG_PANELS, DIG_SITES, relicOf, RESEARCH_NEED, SKILL, TABLETS, levelCost, maxLv, type Skill, type Tablet } from './data';
import { sectorDef } from './company';
import {
  autoRate,
  blastCost,
  crewCap,
  crewMul,
  deepLayers,
  digBranchOpen,
  digDepthLayer,
  digPower,
  DRILL_FUEL,
  hasAuto,
  layerOpen,
  lvOf,
  researchCap,
  researchCapped,
  ringOpen,
  sessionSec,
  skillLock,
  skillTier,
  standSite,
  digSite,
  extName,
  date,
  jamOf,
  monthRevenue,
  myShops,
  crackOf,
  peekView,
  researchLeft,
  researchOf,
  speed,
  topicProgress,
  siteProgress,
  wasteName,
  type DigErr,
  type DigGot,
  type DigHit,
  type PeekView,
  type P1State,
  type Stage,
} from './model';

/** マス 1 つの見え方（正面の壁） */
export interface CellView {
  x: number;
  y: number;
  /** いまの層（はがした枚数。0 が手前。いちばん奥まで掘ったら層の数） */
  layer: number;
  /** face：叩ける面／dug：いちばん奥まで掘った穴／locked：深い層の許可が要る（その層の面に 🔒）／wait：2 × 2 のものを、ほかのマスと待っている */
  state: 'face' | 'dug' | 'locked' | 'wait';
  /** ひび（いまの層の残りの硬さで 0：無傷・1・2・3：あと少し） */
  crack: 0 | 1 | 2 | 3;
  /** いまの 1 打の強さで、あと何回打てば 1 枚はがれるか（はがれない・待っていれば 0） */
  taps: number;
  /** ひびの隙間から見えるもの（無ければ null） */
  peek: PeekView | null;
  /** 面の色（いまの層の色。穴は荒れ地のいちばん奥の層の色） */
  color: string;
}

/** マス (x, y) の見え方 */
export function cellView(s: P1State, x: number, y: number): CellView {
  const L = digSite(s)!;
  const k = y * L.w + x;
  const st = s.dig!.sites[L.site];
  const d = st.depth[k];
  const layers = DIG[L.tier].layers;
  if (d >= L.depth) return { x, y, layer: d, state: 'dug', crack: 0, taps: 0, peek: null, color: layers[L.depth - 1].color };
  const left = st.hp[k];
  const hard = L.cells[k].hard[d];
  const state = !layerOpen(s, L, d) ? 'locked' : left <= 0 ? 'wait' : 'face';
  return { x, y, layer: d, state, crack: crackOf(left, hard), taps: left > 0 ? Math.ceil(left / digPower(s) - 1e-9) : 0, peek: peekView(s, x, y), color: layers[d].color };
}
/** いまの許可で掘れない最初の層（「🔒 深い層の許可が要る」の層。全部掘れるなら null） */
export function lockedLayer(s: P1State): number | null {
  const L = digSite(s);
  if (!L) return null;
  const n = deepLayers(s, L.tier);
  return n < DIG[L.tier].layers.length ? n : null;
}
/**
 * 壁に、ひびの隙間から形が分かるほど（40% 以上）見えているマスがある（初めての覗き見のマインちゃんの一言）。
 * 無傷のマスの細いひび（12%）・ランタンのうっすら（10〜20%）では出さない：叩いて割れ目が広がったとき
 */
export function anyPeek(s: P1State, min = 0.4): boolean {
  const L = digSite(s);
  if (!L) return false;
  for (let y = 0; y < L.h; y++)
    for (let x = 0; x < L.w; x++) {
      const v = cellView(s, x, y).peek;
      if (v && !v.hint && v.frac >= min) return true;
    }
  return false;
}

/**
 * 発掘場のパネルの上の 1 行（小さく）：作業時間・1 打の強さ・掘れる層（「岩盤まで」）・研究 Lv の上限
 */
export interface DigSpec {
  sec: number;
  power: number;
  /** 掘れるいちばん深い層の名前 */
  deep: string;
  cap: number;
}
export function digSpec(s: P1State): DigSpec | null {
  const L = digSite(s);
  if (!L) return null;
  const layers = DIG[L.tier].layers;
  return { sec: sessionSec(s), power: digPower(s), deep: layers[Math.min(layers.length, deepLayers(s, L.tier)) - 1].name, cap: researchCap(s) };
}
export const digSpecText = (x: DigSpec): string[] => [t(`⏱ ${x.sec} 秒`, `⏱ ${x.sec} s`), t(`⛏ 1 打 ${x.power}`, `⛏ Power ${x.power}`), t(`${x.deep}まで`, `to ${x.deep}`), t(`研究 Lv 上限 ${x.cap}`, `Research cap Lv${x.cap}`)];
/** ロープの札 */
export const DEEP_LOCK = () => t('🔒 深い層の許可が要る（スキル → 発掘）', '🔒 Needs a deep-layer permit (Skills → Digging)');

/**
 * 発掘作業の終わりの札の「次の強化のおすすめ」：発掘の枝で、いま取れる（先に要るもの・外周がそろっている）パネルのうち、
 * 次の Lv がいちばん安いもの（未取得なら開放）。「発掘の追加申請 Lv2（4,000 G）で 21 秒に」。無ければ null。
 * prefer：このパネルを先に（「深い層の許可が要る」マスを押した作業のあとは、深い層の許可）
 */
export interface DigRec {
  id: string;
  lv: number;
  cost: number;
  text: string;
}
export function digRec(s: P1State, prefer?: string): DigRec | null {
  if (!digBranchOpen(s)) return null;
  const cand: { k: Skill; lv: number; cost: number }[] = [];
  for (const id of DIG_PANELS) {
    const k = SKILL[id];
    const lv = lvOf(s, id);
    if (lv >= maxLv(k) || !ringOpen(s, skillTier(k))) continue;
    if (lv === 0) {
      const e = skillLock(s, k);
      if (e !== null && e !== 'money') continue;
    }
    cand.push({ k, lv: lv + 1, cost: levelCost(k, lv + 1) });
  }
  if (!cand.length) return null;
  cand.sort((a, b) => a.cost - b.cost);
  // prefer がまだ取れなければ、その先に要るパネル（根もとへたどる）を先に
  const chain = (id: string | undefined): string[] => (id && SKILL[id] ? [id, ...(SKILL[id].requires ?? []).flatMap((r) => chain(r))] : []);
  const pick = chain(prefer).map((id) => cand.find((x) => x.k.id === id)).find((x) => !!x) ?? cand[0];
  return { id: pick.k.id, lv: pick.lv, cost: pick.cost, text: recText(s, pick.k, pick.lv, pick.cost) };
}
const TR = DIG_BALANCE.tree;
const lvAt = (xs: number[], lv: number) => xs[Math.min(xs.length, lv) - 1];
/** おすすめの文：「発掘の追加申請 Lv2（4,000 G）で 21 秒に」 */
function recText(s: P1State, k: Skill, lv: number, cost: number): string {
  const head = t(`${k.name} Lv${lv}（${cost.toLocaleString('en-US')} G）`, `${k.name} Lv${lv} (${cost.toLocaleString('en-US')} G)`);
  const L = digSite(s);
  const cur = lvOf(s, k.id);
  switch (k.id) {
    case 'dig_ext':
    case 'u_dig_ext2': {
      const add = (k.id === 'dig_ext' ? TR.ext : TR.ext2);
      const sec = Math.min(TR.maxSec, sessionSec(s) - (cur ? lvAt(add, cur) : 0) + lvAt(add, lv));
      return t(`${head}で ${sec} 秒に`, `${head}: ${sec} s per run`);
    }
    case 'dig_power':
    case 'u_dig_power2': {
      const add = k.id === 'dig_power' ? TR.power : TR.power2;
      const p = digPower(s) - (cur ? lvAt(add, cur) : 0) + lvAt(add, lv);
      return p > digPower(s) ? t(`${head}で 1 打の強さ ${p} に`, `${head}: strike power ${p}`) : t(`${head}で 会心 ${Math.round(lvAt(TR.crit, lv) * 100)}%`, `${head}: ${Math.round(lvAt(TR.crit, lv) * 100)}% critical`);
    }
    case 'dig_speed':
      return t(`${head}で 長押し ${DIG_BALANCE.repeatMs - lvAt(TR.repeat, lv)} ms ごとに`, `${head}: hold every ${DIG_BALANCE.repeatMs - lvAt(TR.repeat, lv)} ms`);
    case 'dig_deep': {
      const tier = L?.tier ?? 'C';
      const n = Math.max(TR.deep[tier][Math.min(5, lv)], deepLayers(s, tier));
      const name = DIG[tier].layers[Math.min(DIG[tier].layers.length, n) - 1].name;
      return t(`${head}で ${name}まで掘れる`, `${head}: dig down to ${name}`);
    }
    case 'dig_study':
      return lv <= 2 ? t(`${head}で 研究 Lv 上限 ${TR.cap[lv]}`, `${head}: research cap Lv${TR.cap[lv]}`) : t(`${head}で 深い層の研究 ×${TR.deepMul[lv]}`, `${head}: deep-layer research ×${TR.deepMul[lv]}`);
    case 'dig_office':
      return t(`${head}で 発掘隊 ${TR.office[lv]} 人まで`, `${head}: crew up to ${TR.office[lv]}`);
    case 'dig_lamp':
      return t(`${head}で ${lvAt(TR.lamp, lv)} 枚手前から見える`, `${head}: glimpse finds ${lvAt(TR.lamp, lv)} layers ahead`);
    case 'dig_blast':
      return lv === 1 ? t(`${head}で 発破が使える`, `${head}: unlock blasting`) : t(`${head}で 発破 ${lvAt(TR.blastSize, lv)} × ${lvAt(TR.blastSize, lv)}・${lvAt(TR.blastCost, lv).toLocaleString('en-US')} G`, `${head}: ${lvAt(TR.blastSize, lv)} × ${lvAt(TR.blastSize, lv)} blast for ${lvAt(TR.blastCost, lv).toLocaleString('en-US')} G`);
    case 'dig_drill':
      return t(`${head}で 奥へ ${lvAt(TR.drill, lv)} 層`, `${head}: ${lvAt(TR.drill, lv)} layers deeper`);
    default: {
      const line = k.note.split(t('（', ' ('))[0];
      return t(`${head}：${line}`, `${head}: ${line}`);
    }
  }
}

/**
 * 発掘画面の小さな帯：荒れ地の名前・日付（ゲーム内。時間が流れていることが分かる）・今月の売上・RP・今回の出土（新発見・Lv↑）・
 * 掘った割合・いまの層・お題の進み（SCM の詰まりは発掘作業のあいだは出さない）
 */
export interface DigStatus {
  /** 荒れ地の名前（「北の荒れ地」） */
  name: string;
  /** 日付（「1 年目 2 月 12 日」） */
  date: string;
  /** 今月の売上 */
  sales: number;
  /** 掘った割合（0〜100） */
  pct: number;
  rp: number;
  /** 今回の作業の新発見・研究 Lv ↑ */
  found: number;
  lvUp: number;
  layer: string;
  topics: [number, number];
  /** SCM のいちばん細い段（お店が無ければ null） */
  jam: Stage | null;
}
export function digStatus(s: P1State): DigStatus | null {
  const L = digSite(s);
  if (!L || !s.dig) return null;
  const d = date(s);
  return {
    name: wasteName(L.sector, L.site),
    date: d ? t(`${d.year} 年目 ${d.month} 月 ${d.day} 日`, `Y${d.year} M${d.month} D${d.day}`) : t(`開業準備 ${s.day + 1} 日目`, `Prep day ${s.day + 1}`),
    sales: monthRevenue(s),
    pct: Math.round(siteProgress(s, L.site) * 100),
    rp: s.rp ?? 0,
    found: s.digRun?.got.found ?? 0,
    lvUp: s.digRun?.got.lv ?? 0,
    layer: DIG[L.tier].layers[digDepthLayer(s)].name,
    topics: topicProgress(s),
    jam: myShops(s).length ? jamOf(s) : null,
  };
}

/** 発掘作業の残り時間のバー：残りの秒（小数 1 桁）・残りの割合・残り 5 秒で赤く点滅（warn）・残り 3 秒で音（tick） */
export function runBar(s: Pick<P1State, 'digRun'>): { sec: string; frac: number; warn: boolean; tick: boolean } | null {
  const r = s.digRun;
  if (!r) return null;
  const sec = r.left / 1000;
  return { sec: (Math.ceil(sec * 10) / 10).toFixed(1), frac: r.total > 0 ? r.left / r.total : 0, warn: sec <= 5, tick: sec <= 3 };
}

/** 発掘終了の札の行（今回の出土）：新発見・研究 Lv ↑・RP・素材・はがした層 */
export function gotLines(g: DigGot): [string, string][] {
  return [
    [t('新発見', 'New finds'), `${g.found}`],
    [t('研究 Lv ↑', 'Research Lv ↑'), `${g.lv}`],
    [t('研究ポイント', 'RP'), `+${g.rp}`],
    [t('素材', 'Materials'), `+${g.mat}`],
    [t('はがした層', 'Layers peeled'), `${g.cells}`],
    // 復刻品のレシピが開いた（研究 Lv3）
    ...(g.recipes?.length ? [[t('新レシピ', 'New recipes'), `${g.recipes.length}`] as [string, string]] : []),
  ];
}

/** 打てない理由の文（画面に出す。選べないものには理由）。money は火薬代・燃料代（cost） */
export function digErrText(e: DigErr, cost = DIG_BALANCE.tree.blastCost[0]): string {
  switch (e) {
    case 'no-run':
      return t('発掘作業は終わった。荒れ地をタップすると、もう一度掘れるよ', 'The dig is over. Tap a wasteland to dig again');
    case 'wait':
      return t('大きな遺物（2 × 2）が埋まっている。まわりのマスも同じ深さまで掘ろう', 'A large relic (2 × 2) is buried here. Dig the other cells to the same depth');
    case 'dug':
      return t('このマスはいちばん奥まで掘った', 'This cell is dug to the back');
    case 'no-site':
      return t('このセクタには荒れ地が無い（Rare 以降は準備中）', 'No wasteland in this sector (Rare and up: coming soon)');
    case 'deep':
      return t('この奥の層は国の許可が要る（スキル → 発掘の「深い層の許可」）', 'Deeper layers need a national permit (Skills → Digging: Deep-layer permit)');
    case 'no-blast':
      return t('発破が無い（スキル → 発掘の「発破」）', 'No blasting (Skills → Digging: Blasting)');
    case 'no-drill':
      return t('掘削ドリルが無い（スキル → 発掘の「掘削ドリル」）', 'No drill (Skills → Digging: Drill)');
    case 'money':
      return t(`${cost === DRILL_FUEL ? '燃料代' : '火薬代'} ${cost.toLocaleString('en-US')} G が足りない`, `Not enough funds (${cost.toLocaleString('en-US')} G)`);
    case 'out':
      return '';
  }
  return '';
}
/** いまの発破の火薬代（スキルの Lv で安くなる） */
export const blastPrice = (s: P1State) => blastCost(s);

/** パネル全体で掘れない理由（掘れるなら null）：荒れ地が無い・発掘作業が終わった */
export function digBlock(s: P1State): DigErr | null {
  if (!digSite(s) || !s.dig) return 'no-site';
  if (!s.digRun) return 'no-run';
  return null;
}

/**
 * 出土の演出の大きさ（憲章 3「手応えの演出は 1 つだけ大きく」）：
 * chip（打っただけ）→ crumble（1 枚はがれた）→ mat（素材）→ ext（エクステ。画面の中央に出て研究ノートへ吸い込まれる）→ tablet（石板の小さな窓）→
 * epic（Epic 以上の大きな遺物（2 × 2）。画面全体）→ topic（お題。画面全体）
 */
export type DigFx = 'chip' | 'crumble' | 'mat' | 'ext' | 'tablet' | 'epic' | 'topic';
const FX_ORDER: DigFx[] = ['chip', 'crumble', 'mat', 'ext', 'tablet', 'epic', 'topic'];
export function fxOf(hit: DigHit): DigFx {
  if (!hit.broke) return 'chip';
  const it = hit.item;
  if (!it) return 'crumble';
  if (it.kind === 'mat') return 'mat';
  if (it.kind === 'tablet') return 'tablet';
  if (it.topic) return 'topic';
  return hit.span && hit.span.w * hit.span.h > 1 ? 'epic' : 'ext';
}
/** いくつかのマスを一度に崩したとき（発破）：いちばん大きい演出 */
export const biggestFx = (hits: DigHit[]): DigFx => hits.map(fxOf).reduce<DigFx>((a, b) => (FX_ORDER.indexOf(b) > FX_ORDER.indexOf(a) ? b : a), 'chip');

/** エクステが出たときの札（新発見／研究 Lv の上がり／もう 1 つ） */
export function findLabel(hit: DigHit): string {
  if (hit.item?.kind !== 'ext') return '';
  if (hit.item.topic) return t('お題を発見！', 'Found a target!');
  if (hit.first) return t('新発見！', 'New find!');
  if (hit.lv) return t(`研究 Lv${hit.lv}`, `Research Lv${hit.lv}`);
  return t('研究ノートへ', 'To the notebook');
}

/** 発掘隊（発掘の担当。発掘作業のあいだ手伝う）と、作業中の 1 日に打つ回数（適性の速さ × DIG_AUTO.perDay × 発掘隊の手際） */
export function autoDiggers(s: P1State): { hero: number; perDay: number; resting: boolean }[] {
  if (!s.dig) return [];
  return s.staff.filter((x) => x.task === 'dig').map((x) => ({ hero: x.hero, perDay: Math.round(DIG_AUTO.perDay * speed(x, 'dig', s) * crewMul(s) * 10) / 10, resting: x.resting }));
}
/** 発掘隊の人数 / 上限（発掘隊の役所） */
export const crewCount = (s: P1State): [number, number] => [s.staff.filter((x) => x.task === 'dig').length, crewCap(s)];
/**
 * 常駐（自動化）：作業していない日に掘る荒れ地と、1 日に打つ数（休んでいない隊の合計 × 常駐の速さ）。
 * 常駐が無い・隊がいない・掘れる荒れ地が無ければ null
 */
export function standing(s: P1State): { site: number; perDay: number; heroes: number[] } | null {
  if (!s.dig || !hasAuto(s)) return null;
  const crew = s.staff.filter((x) => x.task === 'dig' && !x.resting);
  const k = standSite(s);
  if (!crew.length || k < 0) return null;
  const per = crew.reduce((v, x) => v + DIG_AUTO.perDay * speed(x, 'dig', s) * crewMul(s) * autoRate(s), 0);
  return { site: k, perDay: Math.round(per * 10) / 10, heroes: crew.map((x) => x.hero) };
}

/** 研究 Lv の ★（★ が Lv、☆ が残り。5 つ） */
export const stars = (lv: number) => '★'.repeat(lv) + '☆'.repeat(Math.max(0, 5 - lv));

// ---------------------------------------------------------------- 研究ノート

/** 研究ノートのタブ（発掘場のあるセクタ）：いまのセクタが先頭、次に出店したセクタ、残りはランドの順 */
export interface NoteTab {
  id: string;
  name: string;
  here: boolean;
  visited: boolean;
}
export function noteTabs(s: P1State): NoteTab[] {
  const cur = s.sector ?? 'c1';
  const mine = s.land?.mine ?? [cur];
  const ids = Object.keys(DIG_SITES);
  const rank = (id: string) => (id === cur ? 0 : mine.includes(id) ? 1 : 2);
  return ids
    .map((id, k) => ({ id, k }))
    .sort((a, b) => rank(a.id) - rank(b.id) || a.k - b.k)
    .map(({ id }) => ({ id, name: sectorDef(id).name, here: id === cur, visited: id === cur || mine.includes(id) }));
}

/** 研究ノートの 1 行（エクステ） */
export interface NoteEntry {
  id: number;
  name: string;
  topic: boolean;
  /** 掘った数（0 は未発見＝シルエット） */
  n: number;
  lv: number;
  /** 次の研究 Lv まであと何個（Lv5・上限なら 0） */
  left: number;
  /** 研究 Lv の上限で止まっている（数は貯めている） */
  capped?: boolean;
}
/** そのセクタのお題（上の層から）とお題以外 */
export function noteEntries(s: P1State, sector: string): NoteEntry[] {
  const site = DIG_SITES[sector];
  if (!site) return [];
  const one = (id: number, topic: boolean): NoteEntry => ({ id, name: extName(id), topic, n: Math.floor(s.research?.[id] ?? 0), lv: researchOf(s, id), left: researchLeft(s, id), capped: researchCapped(s, id) });
  return [...site.topics.map((id) => one(id, true)), ...site.finds.map((id) => one(id, false))];
}
/** 研究ノートの復刻品の 1 行（研究 Lv3 で開く／開いた）。復刻品の無い遺物は null。[文, 開いた] */
export function relicLine(e: Pick<NoteEntry, 'id' | 'lv'>): [string, boolean] | null {
  if (!relicOf(e.id)) return null;
  return e.lv >= DIG_BALANCE.relic.openLv ? [t('復刻品：作れる', 'Revival: can make'), true] : [t(`Lv${DIG_BALANCE.relic.openLv} で復刻品のレシピ`, `Revival recipe at Lv${DIG_BALANCE.relic.openLv}`), false];
}
/** 「次のレベルまで」の文 */
export function nextLvText(e: NoteEntry): string {
  if (!e.n) return t('まだ見つけていない', 'Not found yet');
  if (e.lv >= RESEARCH_NEED.length) return t('研究 Lv 最大', 'Research maxed');
  if (e.capped) return t('上限（研究の目利きで上がる）', 'Capped (raise with Keen research)');
  return t(`次のレベルまで あと ${e.left} 個`, `${e.left} more to next level`);
}
/** そのセクタの石板（読んだか） */
export function noteTablets(s: P1State, sector: string): { tab: Tablet; read: boolean }[] {
  return TABLETS.filter((x) => x.sector === sector).map((tab) => ({ tab, read: (s.tablets ?? []).includes(tab.id) }));
}
/** 研究ノートの見出し：見つけた種類 / 全部（発掘場のあるセクタすべて。同じエクステは 1 つに数える） */
export function noteTotals(s: P1State): { found: number; all: number; tablets: number; allTablets: number } {
  const ids = new Set(Object.values(DIG_SITES).flatMap((x) => [...x.topics, ...x.finds]));
  const found = [...ids].filter((id) => (s.research?.[id] ?? 0) > 0).length;
  const real = TABLETS.filter((x) => !x.soon);
  return { found, all: ids.size, tablets: real.filter((x) => (s.tablets ?? []).includes(x.id)).length, allTablets: real.length };
}
