/**
 * 発掘場と研究ノートの表示のための純粋な関数（DOM を持たない。tests/island-p1-digui.test.ts で確かめる）。
 * 画面は digui.ts。仕様は docs/ISLAND_PHASE1.md「地層の発掘と研究ポイント」の「発掘場の画面」「研究ノート」。
 */
import { t } from '../../i18n';
import { BLAST, DIG, DIG_AUTO, DIG_SITES, RESEARCH_NEED, TABLETS, type Tablet } from './data';
import { sectorDef } from './company';
import {
  digDepthLayer,
  digPower,
  digSite,
  extName,
  isDug,
  jamOf,
  myShops,
  myWorkshop,
  peek,
  picksCap,
  reachable,
  researchLeft,
  researchOf,
  speed,
  topicProgress,
  type DigErr,
  type DigHit,
  type DigItem,
  type P1State,
  type Stage,
} from './model';

/** マス 1 つの見え方 */
export interface CellView {
  x: number;
  y: number;
  /** 層の番号（0 が表） */
  layer: number;
  /** dug：崩れた穴／open：手が届く（押せる）／far：まだ届かない */
  state: 'dug' | 'open' | 'far';
  /** ひび（0：無傷・1：少し・2：あと少し） */
  crack: 0 | 1 | 2;
  /** いまの 1 打の強さで、あと何回打てば崩れるか（崩れていれば 0） */
  taps: number;
  /** ランタンで薄く見えている中身（崩れたマスは null。中身は受け取ったあと） */
  peek: DigItem | null;
}

/** マス (x, y) の見え方 */
export function cellView(s: P1State, x: number, y: number): CellView {
  const L = digSite(s)!;
  const k = y * L.w + x;
  const cell = L.cells[k];
  const left = s.dig!.hp[k];
  if (left <= 0) return { x, y, layer: cell.layer, state: 'dug', crack: 0, taps: 0, peek: null };
  const hurt = cell.hard - left;
  const crack: 0 | 1 | 2 = hurt <= 0 ? 0 : left / cell.hard > 0.5 ? 1 : 2;
  return { x, y, layer: cell.layer, state: reachable(s, x, y) ? 'open' : 'far', crack, taps: Math.ceil(left / digPower(s)), peek: peek(s, x, y) };
}

/** パネルの上の 1 行：ツルハシの回数・RP・いまの層・お題の進み・SCM の詰まり */
export interface DigStatus {
  picks: number;
  cap: number;
  /** 回数が上限（売れても増えない） */
  full: boolean;
  rp: number;
  layer: string;
  topics: [number, number];
  /** SCM のいちばん細い段（お店が無ければ null） */
  jam: Stage | null;
}
export function digStatus(s: P1State): DigStatus | null {
  const L = digSite(s);
  if (!L || !s.dig) return null;
  const cap = picksCap(s);
  return {
    picks: s.dig.picks,
    cap,
    full: s.dig.picks >= cap,
    rp: s.rp ?? 0,
    layer: DIG[L.tier].layers[digDepthLayer(s)].name,
    topics: topicProgress(s),
    jam: myShops(s).length ? jamOf(s) : null,
  };
}

/** 打てない理由の文（画面に出す。選べないものには理由） */
export function digErrText(e: DigErr): string {
  switch (e) {
    case 'no-picks':
      return t('ツルハシの回数が 0。お店で売れると増えるよ', 'No pick swings left. They refill as your shops sell');
    case 'far':
      return t('まだ手が届かない。上か隣のマスを先に掘ろう', 'Out of reach. Dig the cell above or beside it first');
    case 'dug':
      return t('もう掘ったマスだよ', 'Already dug');
    case 'no-workshop':
      return t('このセクタに工房が無いので掘れない。先に工房を建てよう', 'No workshop in this sector. Build one first');
    case 'no-site':
      return t('このセクタには発掘場が無い（Rare 以降は準備中）', 'No dig site in this sector (Rare and up: coming soon)');
    case 'no-blast':
      return t('発破の道具が無い（工房の設備投資で買える）', 'No blasting kit (buy it as a workshop investment)');
    case 'money':
      return t(`火薬代 ${BLAST.cost.toLocaleString('en-US')} G が足りない`, `Not enough funds for powder (${BLAST.cost.toLocaleString('en-US')} G)`);
    case 'out':
      return '';
  }
}

/** パネル全体で掘れない理由（掘れるなら null）：発掘場が無い・工房が無い・回数が 0 */
export function digBlock(s: P1State): DigErr | null {
  if (!digSite(s) || !s.dig) return 'no-site';
  if (!myWorkshop(s)) return 'no-workshop';
  if (s.dig.picks < 1) return 'no-picks';
  return null;
}

/**
 * 出土の演出の大きさ（憲章 3「手応えの演出は 1 つだけ大きく」）：
 * chip（打っただけ）→ crumble（崩れた）→ mat（素材）→ ext（エクステ。研究ノートへ吸い込まれる）→ tablet（石板の小さな窓）→ topic（お題。画面の中央に大きく）
 */
export type DigFx = 'chip' | 'crumble' | 'mat' | 'ext' | 'tablet' | 'topic';
const FX_ORDER: DigFx[] = ['chip', 'crumble', 'mat', 'ext', 'tablet', 'topic'];
export function fxOf(hit: DigHit): DigFx {
  if (!hit.broke) return 'chip';
  const it = hit.item;
  if (!it) return 'crumble';
  if (it.kind === 'mat') return 'mat';
  if (it.kind === 'tablet') return 'tablet';
  return it.topic ? 'topic' : 'ext';
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

/** パネルを開いたときに見せる行：いちばん深く崩れたマスの行（まだなら 0） */
export function focusRow(s: P1State): number {
  const L = digSite(s);
  if (!L || !s.dig) return 0;
  let deep = 0;
  for (let y = 0; y < L.h; y++) for (let x = 0; x < L.w; x++) if (isDug(s, x, y)) deep = y;
  return deep;
}

/** 自動発掘の人（発掘の担当）と、1 日に打つ回数（適性の速さ × DIG_AUTO.perDay） */
export function autoDiggers(s: P1State): { hero: number; perDay: number; resting: boolean }[] {
  if (!s.dig) return [];
  return s.staff.filter((x) => x.task === 'dig').map((x) => ({ hero: x.hero, perDay: Math.round(DIG_AUTO.perDay * speed(x, 'dig', s) * 10) / 10, resting: x.resting }));
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
  /** 次の研究 Lv まであと何個（Lv5 なら 0） */
  left: number;
}
/** そのセクタのお題（上の層から）とお題以外 */
export function noteEntries(s: P1State, sector: string): NoteEntry[] {
  const site = DIG_SITES[sector];
  if (!site) return [];
  const one = (id: number, topic: boolean): NoteEntry => ({ id, name: extName(id), topic, n: s.research?.[id] ?? 0, lv: researchOf(s, id), left: researchLeft(s, id) });
  return [...site.topics.map((id) => one(id, true)), ...site.finds.map((id) => one(id, false))];
}
/** 「次のレベルまで」の文 */
export function nextLvText(e: NoteEntry): string {
  if (!e.n) return t('まだ見つけていない', 'Not found yet');
  if (e.lv >= RESEARCH_NEED.length) return t('研究 Lv 最大', 'Research maxed');
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
