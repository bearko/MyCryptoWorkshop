/**
 * 発掘場と研究ノートの表示のための純粋な関数（DOM を持たない。tests/island-p1-digui.test.ts で確かめる）。
 * 画面は digui.ts。仕様は docs/ISLAND_PHASE1.md「地層の発掘と研究ポイント」の「15 秒の発掘」「研究ノート」。
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
  peek,
  reachable,
  researchLeft,
  researchOf,
  speed,
  topicProgress,
  siteProgress,
  wasteName,
  type DigErr,
  type DigGot,
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
  const left = s.dig!.sites[L.site].hp[k];
  if (left <= 0) return { x, y, layer: cell.layer, state: 'dug', crack: 0, taps: 0, peek: null };
  const hurt = cell.hard - left;
  const crack: 0 | 1 | 2 = hurt <= 0 ? 0 : left / cell.hard > 0.5 ? 1 : 2;
  return { x, y, layer: cell.layer, state: reachable(s, x, y) ? 'open' : 'far', crack, taps: Math.ceil(left / digPower(s)), peek: peek(s, x, y) };
}

/** パネルの上の 1 行：荒れ地の名前・掘った割合・RP・いまの層・お題の進み（SCM の詰まりは発掘作業のあいだは出さない） */
export interface DigStatus {
  /** 荒れ地の名前（「北の荒れ地」） */
  name: string;
  /** 掘った割合（0〜100） */
  pct: number;
  rp: number;
  layer: string;
  topics: [number, number];
  /** SCM のいちばん細い段（お店が無ければ null） */
  jam: Stage | null;
}
export function digStatus(s: P1State): DigStatus | null {
  const L = digSite(s);
  if (!L || !s.dig) return null;
  return {
    name: wasteName(L.sector, L.site),
    pct: Math.round(siteProgress(s, L.site) * 100),
    rp: s.rp ?? 0,
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

/** 発掘終了の札の行（今回の出土）：新発見・研究 Lv ↑・RP・素材・崩したマス */
export function gotLines(g: DigGot): [string, string][] {
  return [
    [t('新発見', 'New finds'), `${g.found}`],
    [t('研究 Lv ↑', 'Research Lv ↑'), `${g.lv}`],
    [t('研究ポイント', 'RP'), `+${g.rp}`],
    [t('素材', 'Materials'), `+${g.mat}`],
    [t('崩したマス', 'Cells cleared'), `${g.cells}`],
  ];
}

/** 打てない理由の文（画面に出す。選べないものには理由） */
export function digErrText(e: DigErr): string {
  switch (e) {
    case 'no-run':
      return t('発掘作業は終わった。荒れ地をタップすると、もう一度掘れるよ', 'The dig is over. Tap a wasteland to dig again');
    case 'far':
      return t('まだ手が届かない。上か隣のマスを先に掘ろう', 'Out of reach. Dig the cell above or beside it first');
    case 'dug':
      return t('もう掘ったマスだよ', 'Already dug');
    case 'no-site':
      return t('このセクタには荒れ地が無い（Rare 以降は準備中）', 'No wasteland in this sector (Rare and up: coming soon)');
    case 'no-blast':
      return t('発破の道具が無い（工房の設備投資で買える）', 'No blasting kit (buy it as a workshop investment)');
    case 'money':
      return t(`火薬代 ${BLAST.cost.toLocaleString('en-US')} G が足りない`, `Not enough funds for powder (${BLAST.cost.toLocaleString('en-US')} G)`);
    case 'out':
      return '';
  }
}

/** パネル全体で掘れない理由（掘れるなら null）：荒れ地が無い・発掘作業が終わった */
export function digBlock(s: P1State): DigErr | null {
  if (!digSite(s) || !s.dig) return 'no-site';
  if (!s.digRun) return 'no-run';
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

/** 発掘隊（発掘の担当。発掘作業のあいだだけ手伝う）と、1 日に打つ回数（適性の速さ × DIG_AUTO.perDay） */
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
