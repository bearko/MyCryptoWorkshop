// 経営モードの画面（docs/EMPIRE_DESIGN.md 10 章・docs/design.md）。テストモードのときだけ読む（main.ts から動的 import）。
// 町を見下ろす机：左にお品書き、中央に地図、右に絵馬とかわら版、下に指示と「月を進める」。
// スマホ（599px 以下）は、地図・かわら版の 1 行・折りたたみの 3 行・ドック。詳しい情報は下から出るシート。
import './tokens.css';
import './empire.css';
import { cannibalMult, dist, freeCells, inRange } from '../../empire/area';
import type { EmpireState, MonthReport } from '../../empire/model';
import { regionStores } from '../../empire/nation';
import { rivalOf } from '../../empire/rivals';
import { advanceMonth, AREA_OPEN_COST, canPromote, homeSlots, letterFor, MAX_STORES, ownCells, phase1Done, plotsFor, storeCount, type Decisions } from '../../empire/sim';
import { activeStakeholders, supportOf, SUPPORT } from '../../empire/stakeholders';
import { BOARD_SEATS, meetingNow } from '../../empire/governance';
import { CROWNS, crownStats, FISCAL_MONTH, REGULATION, regulationLevel } from '../../empire/crowns';
import { landProfile } from '../../empire/lands';
import { boardCard, meetingCard, type BoardCandidate } from './govern';
import { courtCard, focusCard } from './landui';
import { branchCtx, branchHqCard, branchLens, isleStatus, isleTag, worldLandCard, worldPanel } from './worldui';
import { branchOf, foreignShare, GRADUATE, WORLD_LANDS } from '../../empire/world';
import { WorldScene } from '../../render/map/world';
import { mnaCard } from './mnaui';
import { auctionCard, draftTable, endingCard, legendPanel, slotCard, tableView } from './groupui';
import { ENDING_CROWNS, legendCrowns } from '../../empire/group';
import { t } from '../../i18n';
import { GridScene, type GridData } from '../../render/map/grid';
import { LandScene } from '../../render/map/land';
import { MapView, type MapTarget } from '../../render/map/view';
import { h } from '../dom';
import { hqCard2, hqCard3, letterCard, lotCard, plotCard, plotProfit, regionCard, reserved, ringiItems, ringiList, storeCard, type Ctx, type SoundKey } from './cards';
import { foundingTown, gridIndex, heats, plotCells, RAMEN, sectorGrid, storeCells, storeExt, townGrid } from './maps';
import { adviceOf, newsOf, voicesOf } from './notes';
import { bubble, chip, emaCard, kawaraban, panel, profitBars, riskMeters, row, sheet, supportMeters, svgIcon, type SheetState } from './parts';
import { CRISES, CRISIS, crisisUntil } from '../../empire/crisis';
import { companyTitle, crisisName, crownName, fitMark, focusLabel, kingName, monthLabel, money, plotLabel, shortMoney, storeName } from './text';

export { companyTitle, monthLabel, noteText, plotLabel, cellName } from './text';

/** 画面に出すヒーロー（加盟店のオーナー） */
export interface HeroFace {
  id: number;
  name: string;
  image: HTMLElement;
}

export interface EmpireViewOptions {
  /** 加盟の手紙をくれるヒーロー（いちばんの常連） */
  letterHero: HeroFace | null;
  /** id からヒーローの名前 */
  heroName: (id: number) => string;
  /** id からヒーローの絵（かわら版の挿絵） */
  heroImage?: (id: number) => HTMLElement | null;
  /** マインちゃんの絵（助言の顔） */
  mineImage?: () => HTMLElement;
  /** 役員会に迎えられる英雄（工房でスカウトした英雄） */
  boardCandidates?: () => BoardCandidate[];
  /** ランドの守り神の絵（キングの札に使う） */
  landImage?: (key: string) => HTMLElement | null;
  /** 効果音 */
  play?: (key: SoundKey) => void;
  /** 画面を閉じる */
  onClose?: () => void;
  /** テストモードのデバッグパネル（ヘッダーに TEST を出す） */
  onTest?: () => void;
}

type Panel = 'hq' | 'branch' | 'auction' | 'mna' | 'ringi' | 'news' | 'promote' | 'commands' | 'ledger' | 'voices' | 'board' | 'meeting' | 'focus' | 'court' | null;
type Selection = { kind: 'store' | 'plot' | 'lot' | 'region' | 'land' | 'slot'; id: number } | null;

const PHASE_NAME = () => ['', t('店主', 'Owner'), t('エリア', 'Area chain'), t('全国', 'National'), t('世界', 'Global'), t('グループ', 'Group')];

/** 地図の目標：フェーズごとの、次の格への条件 */
function goal(e: EmpireState): { label: string; value: string; done: boolean } {
  if (e.phase === 1) {
    const black = (() => {
      let n = 0;
      for (const r of [...e.history].reverse()) {
        if (r.profit > 0) n++;
        else break;
      }
      return Math.min(3, n);
    })();
    return { label: t('目標', 'Goal'), value: t(`店 ${Math.min(3, e.stores.length)}/3・黒字 ${black}/3 か月`, `Stores ${Math.min(3, e.stores.length)}/3 · black ${black}/3`), done: phase1Done(e) };
  }
  if (e.phase === 2 && e.area) {
    return {
      label: t('目標', 'Goal'),
      value: t(`店 ${e.stores.length}/12・相手 ${e.area.rivalStores.length}・センター ${e.area.centers.length ? '✓' : '—'}`, `Stores ${e.stores.length}/12 · rival ${e.area.rivalStores.length} · center ${e.area.centers.length ? '✓' : '—'}`),
      done: canPromote(e),
    };
  }
  if (e.phase >= 5 && e.group) {
    // フェーズ 5 の目標：渡れる全ランドの Legendary で 3 冠
    return { label: t('番付', 'Legendary'), value: t(`冠 ${legendCrowns(e)}/${ENDING_CROWNS}`, `Crowns ${legendCrowns(e)}/${ENDING_CROWNS}`), done: e.group.ended !== null };
  }
  if (e.phase >= 4 && e.world) {
    // フェーズ 4 の目標：本拠の外の 2 ランドで謁見、売上の 3 割を本拠の外で
    const aud = e.world.branches.filter((b) => b.court.audience).length;
    const share = Math.round(foreignShare(e) * 100);
    return { label: t('目標', 'Goal'), value: t(`謁見 ${aud}/${GRADUATE.audiences}・外 ${share}%/${GRADUATE.foreign * 100}%`, `Audiences ${aud}/${GRADUATE.audiences} · abroad ${share}%`), done: canPromote(e) };
  }
  if (e.nation) {
    const last12 = e.history.slice(-12).filter((r) => r.rivalRevenue !== undefined);
    const own = last12.reduce((a, r) => a + r.revenue, 0);
    const rival = last12.reduce((a, r) => a + (r.rivalRevenue ?? 0), 0);
    // フェーズ 3 の目標：売上 1 位と、政府の注目度（100 で謁見の招待）
    const att = Math.round(e.court?.attention ?? 0);
    return { label: t('売上', 'Sales'), value: t(`${shortMoney(own)}:${shortMoney(rival)}・注目 ${att}`, `${shortMoney(own)}:${shortMoney(rival)} · attn ${att}`), done: canPromote(e) };
  }
  return { label: '', value: '', done: false };
}

/** 数字とラベルのドット文字（DotGothic16）と本文（Zen Maru Gothic）。読めなければ代わりの文字で表示する */
function ensureFonts(): void {
  if (typeof document === 'undefined' || document.getElementById('ke-fonts')) return;
  const pre = h('link', { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossorigin: '' });
  const link = h('link', { id: 'ke-fonts', rel: 'stylesheet', href: 'https://fonts.googleapis.com/css2?family=DotGothic16&family=Zen+Maru+Gothic:wght@500;700&display=swap' });
  document.head.append(pre, link);
}

export function empireView(initial: EmpireState, commit: (e: EmpireState) => void, opts: EmpireViewOptions): HTMLElement {
  ensureFonts();
  let e = initial;
  let draft: Decisions = {};
  let last: MonthReport | null = initial.history.at(-1) ?? null;
  let selection: Selection = null;
  let openPanel: Panel = null;
  let sheetState: SheetState = 'closed';
  let advisor = true;
  let advisorTimer = 0;
  /** 助言の吹き出しは 8 秒で顔のボタンにしまう（地図を隠しっぱなしにしない） */
  const tuckAdvisor = () => {
    window.clearTimeout(advisorTimer);
    advisorTimer = window.setTimeout(() => {
      if (!advisor || !root.isConnected) return;
      advisor = false;
      render();
    }, 8000);
  };
  let overlay: 'none' | 'heat' | 'range' = 'none';
  let chipsOpen = false;
  /** フェーズ 3：国の板を見ているか、どのエリアの地図に入っているか */
  let regionView: number | null = null;
  /** フェーズ 4：世界の海図・本拠・渡ったランドのどれを見ているか */
  let at: string = initial.phase >= 5 ? 'table' : initial.phase >= 4 ? 'world' : 'home';
  /** フェーズ 5：会議卓で動かそうとしているカードのマス */
  let moving: number | null = null;
  /** エンディングの画面を閉じたか（その月の報告で 1 度だけ開く） */
  let endingOpen = (initial.history.at(-1)?.notes ?? []).some((n) => n.kind === 'ending');
  /** 今月、絵馬の「その場のボタン」を押したもの */
  const fixed = new Set<string>();
  let busy = false;
  const play = (k: SoundKey) => opts.play?.(k);
  const mq = typeof matchMedia !== 'undefined' ? matchMedia('(max-width: 599px)') : null;
  const phone = () => !!mq?.matches;

  const root = h('div.ke', { role: 'region', 'aria-label': t('経営', 'Company') });
  const head = h('header.ke-head', {});
  const chipsRow = h('div.ke-chips-row', {});
  const left = h('aside.ke-left', {});
  const center = h('section.ke-center', {});
  const right = h('aside.ke-right', {});
  const desk = h('main.ke-desk', {}, left, center, right);
  const strip = h('div.ke-strip', {});
  const folds = h('nav.ke-folds', { 'aria-label': t('会社の状況', 'Company status') });
  const dock = h('nav.ke-dock', { 'aria-label': t('指示', 'Commands') });
  const pop = h('div.ke-pop-host', {});
  const sheetHost = h('div.ke-sheet-host', {});
  const endHost = h('div.ke-end-host', {});
  root.append(head, chipsRow, desk, strip, folds, dock, pop, sheetHost, endHost);

  // ---------------------------------------------------------------- 地図
  const tags = h('div.ke-tags', { 'aria-hidden': 'true' });
  const tip = h('div.ke-tip', { role: 'tooltip', hidden: true });
  const selCard = h('div.ke-selcard-host', {});
  const tools = h('div.ke-tools', {});
  const advisorHost = h('div.ke-advisor-host', {});
  const coins = h('div.ke-coins', { 'aria-hidden': 'true' });
  /** フェーズ 5 の会議卓（地図のかわりに真ん中に出す） */
  const tableHost = h('div.ke-table-host', { hidden: true });
  let grid: GridScene | null = null;
  let land: LandScene | null = null;
  let world: WorldScene | null = null;
  let sceneKey = '';
  /** 詳しい情報のカードのために地図をずらした選択 */
  let nudged = '';
  const view = new MapView({
    onHover: (target, x, y) => showTip(target, x, y),
    onSelect: (target) => select(target),
    onCamera: () => placeOverlays(),
  });
  center.append(view.el, tableHost, tags, coins, tools, advisorHost, selCard, tip);

  /** 見ている渡ったランド（海図・本拠を見ているときは null） */
  const branchAt = () => (e.phase >= 4 && at !== 'world' && at !== 'home' && at !== 'table' ? (branchOf(e, at) ?? null) : null);
  const atWorld = () => e.phase >= 4 && !!e.world && at === 'world';
  const atTable = () => e.phase >= 5 && !!e.group && at === 'table';
  /** 国の画面に出す会社（渡ったランドを見ているときは、そのランドに見立てた写し） */
  const lens = (): EmpireState => {
    const b = branchAt();
    return b ? branchLens(e, b) : e;
  };
  const lctx = (): Ctx => {
    const b = branchAt();
    return b ? branchCtx(ctx(), b) : ctx();
  };
  /** 海図・本拠・渡ったランドへ移る */
  const goTo = (where: string) => {
    at = where === e.land ? 'home' : where;
    regionView = null;
    moving = null;
    selection = null;
    openPanel = null;
    sheetState = 'closed';
    play('craft');
    render();
  };

  const ctx = (): Ctx => ({
    e,
    draft,
    last,
    set: (fn, sound) => {
      draft = fn(draft);
      if (sound) play(sound);
      render();
    },
    fundsLeft: () => e.funds - reserved(e, draft),
    heroName: opts.heroName,
  });

  /** フェーズ 1 の町の区画（飾りの町に、自社の店と候補を置く） */
  const p1 = () => {
    const area = foundingTown(e);
    const cells = storeCells(area, e.stores);
    const plots = e.stores.length + (draft.open ?? []).length >= MAX_STORES[1] && !(draft.open ?? []).length ? [] : plotsFor(e);
    const pc = plotCells(area, plots, cells);
    return { area, cells, plots, pc };
  };

  /** 地図の場面を作り直す（形が変わったときだけ） */
  /** 会議卓のマスを押す：動かしているカードがあれば空いたマスへ動かす。なければそのマスを選ぶ */
  function onSlot(slot: number): void {
    const table = draftTable(ctx());
    if (moving !== null && !table[slot]) {
      const next = [...table];
      next[slot] = next[moving];
      next[moving] = null;
      draft = { ...draft, table: next.some((x, i) => x !== e.group!.table[i]) ? next : undefined };
      moving = null;
      selection = { kind: 'slot', id: slot };
      play('build');
      render();
      return;
    }
    moving = null;
    select({ kind: 'slot', id: slot, x: 0, y: 0, w: 0, h: 0 });
  }

  function syncMap(): void {
    // フェーズ 5 の会議卓：地図を隠して、会議卓を出す
    const tbl = atTable();
    view.el.hidden = tbl;
    tableHost.hidden = !tbl;
    if (tbl) {
      tableHost.replaceChildren(tableView(ctx(), selection?.kind === 'slot' ? selection.id : null, onSlot));
      tags.replaceChildren();
      return;
    }
    let key = '';
    let data: GridData | null = null;
    let focus: { x: number; y: number } | undefined;
    let zoom = 1;
    if (e.phase === 1) {
      const { area, cells, plots, pc } = p1();
      key = `p1:${e.name}:${e.month}:${e.stores.map((s) => `${s.id}${s.sign ? 's' : ''}${s.parking ? 'p' : ''}`).join(',')}:${plots.length}`;
      if (key !== sceneKey) {
        data = townGrid(area, {
          own: e.stores.map((s, k) => ({ cell: cells[k], ext: storeExt(s), id: s.id })),
          rival: [],
          centers: [],
          targetKind: (c) => (cells.includes(c) ? 'store' : pc.includes(c) ? 'plot' : null),
          land: landProfile(e.land),
        });
        // 区画の番号 → 店の id・候補の番号
        data.cells.forEach((cell) => {
          if (!cell.target) return;
          const c = cell.target.id;
          if (cell.target.kind === 'store') cell.target = { kind: 'store', id: e.stores[cells.indexOf(c)].id };
          else cell.target = { kind: 'plot', id: pc.indexOf(c) };
        });
        // 店と候補がまとめて見えるよう、その外接矩形の真ん中に寄せる
        const gs = [...cells, ...pc].map((c) => gridIndex(area, c));
        const xs = gs.map((g) => g % (area.w + 2));
        const ys = gs.map((g) => Math.floor(g / (area.w + 2)));
        focus = { x: ((Math.min(...xs) + Math.max(...xs)) / 2 + 0.5) * 64, y: ((Math.min(...ys) + Math.max(...ys)) / 2 + 0.5) * 64 };
        zoom = phone() ? 1 : 2;
      }
    } else if (e.phase === 2 && e.area) {
      const a = e.area;
      key = `p2:${e.month}:${e.stores.map((s) => `${s.cell}${s.sign ? 's' : ''}${s.parking ? 'p' : ''}`).join(',')}:${a.rivalStores.join(',')}:${a.centers.join(',')}`;
      if (key !== sceneKey) {
        data = townGrid(a, {
          own: e.stores.filter((s) => s.cell !== null).map((s) => ({ cell: s.cell!, ext: storeExt(s), id: s.id })),
          rival: a.rivalStores,
          centers: a.centers,
          targetKind: () => 'lot',
          land: landProfile(e.land),
        });
      }
    } else if (atWorld()) {
      const isles = WORLD_LANDS.map((k) => ({ land: k as string, status: isleStatus(e, k) }));
      key = `p4:world:${isles.map((i) => i.status).join(',')}`;
      if (key !== sceneKey) {
        world = new WorldScene(isles);
        land = null;
        grid = null;
        sceneKey = key;
        const hiDpi = typeof devicePixelRatio !== 'undefined' && devicePixelRatio >= 2;
        view.setScene(world, { zoom: phone() ? 0.5 : 'fit', levels: phone() || hiDpi ? [0.5, 1, 2] : [1, 2] });
      }
      if (world) world.selected = selection?.kind === 'land' ? selection.id : null;
      placeOverlays();
      view.invalidate();
      return;
    } else if (lens().nation) {
      const v = lens();
      const nat = v.nation!;
      if (regionView === null) {
        key = `p3:land:${at}:${e.month}:${nat.regions.map((r) => `${regionStores(r)}/${r.rival}/${r.hub ? 1 : 0}`).join(',')}`;
        if (key !== sceneKey) {
          land = new LandScene(
            v.land,
            nat.regions.map((r, i) => ({ rarity: r.rarity, own: regionStores(r), rival: r.rival, capacity: r.capacity, hub: r.hub || i === 0, locked: r.locked })),
            branchAt() ? undefined : homeSlots(e),
          );
          grid = null;
          world = null;
          sceneKey = key;
          // 国の全図（640 ドット）が入らない幅でも、画素が 2 倍以上の画面なら 0.5 倍（1 ドット＝1 画素）まで引いて全体を見せる
          const hiDpi = typeof devicePixelRatio !== 'undefined' && devicePixelRatio >= 2;
          view.setScene(land, { zoom: phone() ? 0.5 : 'fit', levels: phone() || hiDpi ? [0.5, 1, 2] : [1, 2] });
        }
        if (land) land.selected = selection?.kind === 'region' ? selection.id : null;
        placeOverlays();
        view.invalidate();
        return;
      }
      const r = nat.regions[regionView];
      key = `p3:area:${at}:${regionView}:${regionStores(r)}/${r.rival}/${r.hub}`;
      if (key !== sceneKey) data = regionView === 0 && e.area && !branchAt() ? townGrid(e.area, { own: e.stores.filter((s) => s.cell !== null).map((s) => ({ cell: s.cell!, ext: storeExt(s), id: s.id })), rival: e.area.rivalStores, centers: e.area.centers, targetKind: () => null, land: landProfile(e.land) }) : sectorGrid(r, regionView + 1, landProfile(v.land));
    }
    if (data) {
      grid = new GridScene(data);
      land = null;
      world = null;
      const keep = sceneKey.split(':').slice(0, 2).join(':') === key.split(':').slice(0, 2).join(':');
      sceneKey = key;
      // スマホは原寸（1 倍）で、指でずらして見る（docs/design.md「スマホの規則」）。広いエリアだけ 0.5 倍まで引ける
      view.setScene(grid, { focus, zoom: keep ? undefined : focus ? zoom : phone() ? 1 : 'fit', keepCamera: keep, levels: phone() ? [0.5, 1, 2, 3] : [1, 2, 3] });
    }
    if (grid) {
      grid.overlay = overlay;
      grid.marks = marks();
    }
    placeOverlays();
    view.invalidate();
  }

  /** 区画の印（選択・予定・ライバルの狙い・おすすめ・色分け） */
  function marks() {
    const m = new Map<number, import('../../render/map/grid').CellMarks>();
    const get = (gi: number) => {
      let v = m.get(gi);
      if (!v) m.set(gi, (v = {}));
      return v;
    };
    if (e.phase === 1) {
      const { area, cells, plots, pc } = p1();
      e.stores.forEach((s, k) => selection?.kind === 'store' && selection.id === s.id && (get(gridIndex(area, cells[k])).selected = true));
      const best = plots.length ? plots.map((p, k) => ({ k, v: plotProfit(p, e) })).sort((a, b) => b.v - a.v)[0].k : -1;
      plots.forEach((p, k) => {
        const gi = gridIndex(area, pc[k]);
        const v = get(gi);
        v.candidate = true;
        if (k === best) v.recommended = true;
        if ((draft.open ?? []).some((q) => q.kind === p.kind && q.base === p.base && q.rent === p.rent)) {
          v.planned = 'open';
          v.ghostExt = RAMEN + 1000;
        }
        if (selection?.kind === 'plot' && selection.id === k) v.selected = true;
      });
      return m;
    }
    if (e.phase === 2 && e.area) {
      const a = e.area;
      const hs = heats(a);
      const own = ownCells(e);
      const opens = draft.openAt ?? [];
      const centers = [...a.centers, ...(draft.buildCenter ?? [])];
      // おすすめ：食い合いが少なく、配送圏に入り、人通りの多い空き区画の上位 3 つ
      const free = freeCells(a, new Set([...own, ...opens, ...(draft.buildCenter ?? [])]));
      const score = (i: number) => a.cells[i].base * cannibalMult(a, i, [...own, ...opens, i]) - a.cells[i].rent / 30 + (centers.some((c) => dist(a, c, i) <= 2) ? 20_000 : 0);
      const recs = e.stores.length + opens.length < MAX_STORES[2] ? [...free].sort((x, y) => score(y) - score(x)).slice(0, 3) : [];
      a.cells.forEach((_, i) => {
        const v = get(gridIndex(a, i));
        v.heat = hs[i];
        v.inRange = inRange({ ...a, centers }, i);
        if (opens.includes(i)) {
          v.planned = 'open';
          v.ghostExt = RAMEN + 1000;
        }
        if ((draft.buildCenter ?? []).includes(i)) v.planned = 'center';
        if (a.rivalPlan?.cell === i) v.rivalPlan = true;
        if (recs.includes(i)) v.recommended = true;
        if (selection?.kind === 'lot' && selection.id === i) v.selected = true;
      });
    }
    return m;
  }

  // ---------------------------------------------------------------- 地図の上の部品

  function targetRect(s: Selection): { x: number; y: number; w: number; h: number } | null {
    if (!s) return null;
    if (s.kind === 'region' && land) return land.plateRect(s.id);
    if (s.kind === 'land' && world) return world.isleRect(s.id);
    if (!grid) return null;
    const i = grid.cellOf(s.kind, s.id);
    return i >= 0 ? grid.cellRect(i) : null;
  }

  function placeOverlays(): void {
    // 国の板の札
    tags.replaceChildren();
    // 海図の島の札（ランドの名前と、関わり）
    if (world) {
      WORLD_LANDS.forEach((k, i) => {
        const ir = world!.isleRect(i);
        const p = view.toCss(ir.x, ir.y + ir.h + 8);
        const st = isleStatus(e, k);
        // 引いて見ているときは名前だけ（札どうしが重ならないように）
        const short = view.currentZoom < 1;
        tags.append(h('span.ke-tag', { class: `ke-tag ke-isle-tag is-${st}`, style: `left:${Math.round(p.x)}px;top:${Math.round(p.y)}px` }, h('span', { class: `ke-isle-dot is-${st}` }), k, short ? null : h('b.ke-figure', {}, isleTag(e, k))));
      });
    }
    const ln = lens().nation;
    if (land && ln) {
      ln.regions.forEach((r, i) => {
        const pr = land!.plateRect(i);
        const p = view.toCss(pr.x, pr.y + pr.h + 4);
        const share = Math.round((regionStores(r) / Math.max(1, r.capacity)) * 100);
        const short = view.currentZoom < 1;
        const tag = h(
          'span.ke-tag',
          { class: `ke-tag ${r.locked ? 'is-locked' : ''} ${r.rarity === 4 ? 'is-legend' : ''}`, style: `left:${Math.round(p.x)}px;top:${Math.round(p.y)}px` },
          h('span', { class: `ke-rar ke-rar-${r.rarity}` }, ['C', 'UC', 'R', 'E', 'L'][r.rarity]),
          short ? null : t(r.name.ja, r.name.en),
          h('b.ke-figure', {}, r.locked ? t('P5', 'P5') : regionStores(r) ? `${share}%` : short ? '—' : t('未進出', '—')),
        );
        tags.append(tag);
      });
      // 地図の右端・下端からはみ出す札は、内側に寄せる
      requestAnimationFrame(() => {
        const W = center.clientWidth;
        for (const el of Array.from(tags.children) as HTMLElement[]) {
          const x = parseFloat(el.style.left);
          if (x + el.offsetWidth > W - 4) el.style.left = `${Math.max(4, W - 4 - el.offsetWidth)}px`;
        }
      });
    }
    // PC：選んだ物の詳しい情報を、その横に
    if (!phone() && selection) {
      const r = targetRect(selection);
      const card = selCard.firstElementChild as HTMLElement | null;
      if (r && card) {
        const a = view.toCss(r.x, r.y);
        const b = view.toCss(r.x + r.w, r.y + r.h);
        const W = center.clientWidth;
        const H = center.clientHeight;
        const cw = Math.min(320, W - 24);
        const ch = card.offsetHeight || 300;
        const x = b.x + 12 + cw < W - 8 ? b.x + 12 : a.x - 12 - cw >= 8 ? a.x - 12 - cw : Math.max(8, W - cw - 8);
        // 横に置く場所がなく、選んだ物にかぶるなら、地図のほうを左へずらす（1 回だけ）
        const key = `${selection.kind}:${selection.id}`;
        if (x < b.x && x + cw > a.x && nudged !== key) {
          nudged = key;
          const dx = b.x - (W - cw - 20);
          if (dx > 0) {
            view.panBy(dx / view.artScaleCss, 0);
            return;
          }
        }
        const y = Math.max(8, Math.min(H - ch - 8, a.y - 8));
        card.style.left = `${Math.round(x)}px`;
        card.style.top = `${Math.round(y)}px`;
        card.style.width = `${Math.round(cw)}px`;
      }
    }
  }

  function showTip(target: MapTarget | null, x: number, y: number): void {
    if (!target || phone()) {
      tip.hidden = true;
      return;
    }
    const lines = tipLines(target);
    if (!lines.length) {
      tip.hidden = true;
      return;
    }
    tip.replaceChildren(h('b', {}, lines[0]), ...lines.slice(1).map((l) => h('span', {}, l)));
    tip.hidden = false;
    const W = center.clientWidth;
    tip.style.left = `${Math.round(Math.min(W - 220, x + 16))}px`;
    tip.style.top = `${Math.round(y + 18)}px`;
  }

  function tipLines(target: MapTarget): string[] {
    const rivalName = (() => {
      const r = rivalOf(lens().land);
      return t(r.company.ja, r.company.en);
    })();
    if (target.kind === 'store') {
      const s = e.stores.find((x) => x.id === target.id);
      const rep = last?.stores.find((r) => r.id === target.id);
      return s ? [storeName(s.id), rep ? t(`先月の利益 ${money(rep.profit)}`, `Profit ${money(rep.profit)}`) : plotLabel(s.plot), t('押すと設定', 'Click to set up')] : [];
    }
    if (target.kind === 'plot') {
      const p = p1().plots[target.id];
      return p ? [t(`空き区画：${plotLabel(p.kind)}`, `Vacant: ${plotLabel(p.kind)}`), t(`日販 ${money(p.base)}・家賃 ${money(p.rent)}`, `${money(p.base)}/day · rent ${money(p.rent)}`), t(`月の利益の見込み ${money(plotProfit(p, e))}`, `Est. ${money(plotProfit(p, e))}/mo`)] : [];
    }
    if (target.kind === 'lot' && e.area) {
      const a = e.area;
      const i = target.id;
      const s = e.stores.find((x) => x.cell === i);
      if (s) {
        const rep = last?.stores.find((r) => r.id === s.id);
        return [storeName(s.id), rep ? t(`先月の利益 ${money(rep.profit)}`, `Profit ${money(rep.profit)}`) : ''];
      }
      if (a.rivalStores.includes(i)) return [rivalName, t('となりの店から客を取る', 'Takes customers next door')];
      if (a.centers.includes(i)) return [t('物流センター', 'Distribution center'), t('2 マス以内の配送費が下がる', 'Cheaper delivery within 2 plots')];
      return [t('空き区画', 'Vacant plot'), t(`日販 ${money(a.cells[i].base)}・家賃 ${money(a.cells[i].rent)}`, `${money(a.cells[i].base)}/day · rent ${money(a.cells[i].rent)}`), t(`出店 ${money(AREA_OPEN_COST)}`, `Open ${money(AREA_OPEN_COST)}`)];
    }
    if (target.kind === 'land') {
      const k = WORLD_LANDS[target.id];
      const st = isleStatus(e, k);
      return [k, { home: t('本拠', 'Home'), branch: t('渡ったランド', 'Branch'), open: t('渡れる。押すと渡り方', 'Open: click to see how to enter'), closed: t('まだ渡れません', 'Not open yet') }[st], isleTag(e, k)];
    }
    if (target.kind === 'region' && lens().nation) {
      const r = lens().nation!.regions[target.id];
      return [t(r.name.ja, r.name.en), r.locked ? t('フェーズ 5 で開く', 'Opens in phase 5') : t(`自社 ${regionStores(r)}・${rivalName} ${r.rival}・目安 ${r.capacity}`, `Yours ${regionStores(r)} · rival ${r.rival} · room ${r.capacity}`)];
    }
    return [];
  }

  function select(target: MapTarget | null): void {
    tip.hidden = true;
    advisor = false;
    const next: Selection = target ? { kind: target.kind as NonNullable<Selection>['kind'], id: target.id } : null;
    if (next && selection && next.kind === selection.kind && next.id === selection.id) {
      selection = null;
      sheetState = 'closed';
    } else {
      selection = next;
      openPanel = null;
      if (next) {
        sheetState = 'half';
        play('craft');
      } else sheetState = 'closed';
    }
    render();
    if (phone() && target && target.kind !== 'slot') view.reveal(target, (root.clientHeight || 700) * 0.5);
  }

  /** 選んだ物の詳しい情報（PC は地図の横、スマホはシート） */
  function selectionCard(): HTMLElement | null {
    if (!selection) return null;
    const c = ctx();
    if (selection.kind === 'store') {
      const s = e.stores.find((x) => x.id === selection!.id);
      return s ? storeCard(c, s) : null;
    }
    if (selection.kind === 'plot') {
      const p = p1().plots[selection.id];
      if (!p) return null;
      const planned = (draft.open ?? []).some((q) => q.kind === p.kind && q.base === p.base && q.rent === p.rent);
      return plotCard(c, p, planned, () => {
        draft = { ...draft, open: planned ? (draft.open ?? []).filter((q) => !(q.kind === p.kind && q.base === p.base && q.rent === p.rent)) : [...(draft.open ?? []), p] };
        if (!planned) play('build');
        render();
      });
    }
    if (selection.kind === 'lot' && e.area) return lotCard(c, selection.id);
    if (selection.kind === 'slot' && e.group) return slotCard(c, selection.id, moving, (from) => ((moving = from), render()));
    if (selection.kind === 'land') {
      const k = WORLD_LANDS[selection.id];
      return worldLandCard(c, k, opts.landImage?.(k) ?? null, goTo);
    }
    if (selection.kind === 'region' && lens().nation)
      return regionCard(lctx(), selection.id, () => {
        regionView = selection!.id;
        selection = null;
        sheetState = 'closed';
        render();
      });
    return null;
  }

  // ---------------------------------------------------------------- 月を進める（タイムラプス）

  function advance(extra: Decisions = {}): void {
    if (busy) return;
    busy = true;
    const prevBest = Math.max(-Infinity, ...e.history.map((r) => r.profit));
    const r = advanceMonth(e, { ...draft, ...extra });
    play('sale');
    const reduce = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    // 店の上に売上の硬貨がはねる
    coins.replaceChildren();
    const pops: { x: number; y: number; text: string; good: boolean }[] = [];
    if (grid && (e.phase === 1 || e.phase === 2)) {
      for (const rep of r.report.stores) {
        const i = grid.cellOf('store', rep.id) >= 0 ? grid.cellOf('store', rep.id) : e.area ? (() => {
          const s = e.stores.find((x) => x.id === rep.id);
          return s?.cell != null ? gridIndex(e.area!, s.cell) : -1;
        })() : -1;
        if (i < 0) continue;
        const rc = grid.cellRect(i);
        const p = view.toCss(rc.x + rc.w / 2, rc.y);
        pops.push({ x: p.x, y: p.y, text: `${rep.profit >= 0 ? '+' : ''}${shortMoney(rep.profit)}`, good: rep.profit >= 0 });
      }
    }
    if (!pops.length) pops.push({ x: center.clientWidth / 2, y: center.clientHeight / 2, text: `${r.report.profit >= 0 ? '+' : ''}${shortMoney(r.report.profit)}`, good: r.report.profit >= 0 });
    pops.forEach((p, k) => coins.append(h('span.ke-coin', { class: `ke-coin ${p.good ? '' : 'is-bad'}`, style: `left:${Math.round(p.x)}px;top:${Math.round(p.y)}px;animation-delay:${k * 60}ms` }, p.text)));
    if (grid) grid.rush = 5;
    root.classList.add('is-advancing');
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      root.removeEventListener('pointerdown', skip, true);
      root.classList.remove('is-advancing');
      if (grid) grid.rush = 0;
      coins.replaceChildren();
      const wasPhase = e.phase;
      const wasReady = canPromote(e);
      e = r.state;
      last = r.report;
      draft = {};
      fixed.clear();
      advisor = true;
      tuckAdvisor();
      busy = false;
      if (r.report.notes.some((n) => n.kind === 'ending')) {
        endingOpen = true;
        play('win');
      } else if (r.report.notes.some((n) => n.kind === 'audience' && n.success)) play('win');
      else if (e.phase !== wasPhase) {
        selection = null;
        regionView = null;
        if (e.phase >= 4) at = e.phase >= 5 ? 'table' : 'world';
        play('win');
      } else if (!wasReady && canPromote(e)) play('unlock');
      else if (r.report.profit > prevBest && e.history.length > 3) play('rare');
      else if (r.report.notes.some((n) => ['shortOfFunds', 'investigationSoon', 'marginCall', 'ultimatum'].includes(n.kind) || (n.kind === 'meetingHeld' && !n.passed))) play('fail');
      else if (r.report.notes.some((n) => n.kind === 'breakup' || (n.kind === 'crown' && !n.won))) play('fail');
      else if (r.report.notes.some((n) => n.kind === 'crown' && n.won)) play('rare');
      else if (r.report.notes.some((n) => n.kind === 'meetingHeld' || (n.kind === 'pledgeResult' && n.kept))) play('buff');
      else if (r.report.notes.some((n) => ['fatigue', 'ownerUnrest', 'rivalPlan', 'landFalling', 'demand'].includes(n.kind))) play('debuff');
      else if (r.report.notes.some((n) => n.kind === 'demandMet')) play('clean');
      // 選んでいた物がもう無ければ外す（撤退したランドを見ていたら海図へ）
      if (selection?.kind === 'plot') selection = null;
      if (at !== 'world' && at !== 'home' && at !== 'table' && !branchAt()) ((at = 'world'), (regionView = null), (selection = null));
      openPanel = null;
      sheetState = 'closed';
      commit(e);
      render();
    };
    const skip = () => finish();
    root.addEventListener('pointerdown', skip, true);
    window.setTimeout(finish, reduce ? 0 : 1300);
  }

  // ---------------------------------------------------------------- 画面の部品

  function headView(): HTMLElement[] {
    const g = goal(e);
    const res = reserved(e, draft);
    const funds = chip(t('資金', 'Funds'), money(e.funds), 'paper', res ? t(`稟議を払うと ${money(e.funds - res)}`, `After plans: ${money(e.funds - res)}`) : undefined);
    if (res) funds.append(h('small.ke-chip-note', {}, `−${shortMoney(res)}`));
    const chips = [
      chip('', monthLabel(e.month), 'plain'),
      funds,
      chip(t('店', 'Stores'), String(storeCount(e)), 'ours'),
      g.label ? chip(g.label, g.value, g.done ? 'ours' : 'paper') : null,
      crownChip(),
    ].filter((x): x is HTMLElement => !!x);
    const test = opts.onTest ? h('button.ke-test', { type: 'button', title: t('テストモードのデバッグパネル', 'Test-mode debug panel'), onclick: () => opts.onTest?.() }, 'TEST') : null;
    const close = h('button.ke-icon-btn.ke-close', { type: 'button', 'aria-label': t('経営画面を閉じる', 'Close the company screen'), onclick: () => opts.onClose?.() }, svgIcon('close'));
    if (phone()) {
      chipsRow.replaceChildren(...(chipsOpen ? chips : []));
      chipsRow.hidden = !chipsOpen;
      return [
        h('h1.ke-title', {}, companyTitle(e)),
        h('span.ke-pill', {}, `P${e.phase}`),
        h('span.ke-spacer', {}),
        h('span.ke-chip.ke-tone-paper.ke-funds-pill', {}, h('b.ke-figure', {}, shortMoney(e.funds))),
        h('button.ke-icon-btn', { type: 'button', 'aria-expanded': String(chipsOpen), 'aria-label': t('会社の数字を開く', 'Show company figures'), onclick: () => ((chipsOpen = !chipsOpen), render()) }, svgIcon(chipsOpen ? 'chevron-up' : 'chevron-down')),
        test,
        close,
      ].filter((x): x is HTMLElement => !!x);
    }
    chipsRow.hidden = true;
    const where = branchAt() ? ` → ${at}` : atWorld() ? t('・海図', ' · chart') : atTable() ? t('・会議卓', ' · table') : '';
    return [h('h1.ke-title', {}, companyTitle(e)), h('span.ke-pill', { title: t(`${landProfile(e.land).key}（${landProfile(e.land).kind.ja}）`, `${landProfile(e.land).key} (${landProfile(e.land).kind.en})`) }, t(`フェーズ${e.phase}　${PHASE_NAME()[e.phase]}・${e.land}${where}`, `Phase ${e.phase} · ${PHASE_NAME()[e.phase]} · ${e.land}${where}`)), h('span.ke-spacer', {}), h('div.ke-chips', {}, ...chips), test, close].filter((x): x is HTMLElement => !!x);
  }

  /** ヘッダーの 3 冠（持っている冠が金色） */
  function crownChip(): HTMLElement | null {
    if (!e.nation || !e.crowns) return null;
    const held = e.crowns.held;
    const names = CROWNS.map((c) => held[c] ? t(`${crownName(c)} 1 位`, `${crownName(c)} 1st`) : t(`${crownName(c)} 2 位`, `${crownName(c)} 2nd`)).join(t('・', ' · '));
    return h(
      'span.ke-chip',
      { class: 'ke-chip ke-tone-plain', title: names, role: 'img', 'aria-label': t(`3 冠：${names}`, `Crowns: ${names}`) },
      h('span.ke-crowns-chip', {}, ...CROWNS.map((c) => {
        const ic = svgIcon('crown', 18);
        ic.classList.add('ke-crown');
        if (held[c]) ic.classList.add('is-held');
        return ic;
      })),
    );
  }

  /** Legendary の番付（フェーズ 5） */
  function legendView(): HTMLElement | null {
    return e.group ? legendPanel(e, (land) => goTo(land)) : null;
  }

  /** 3 冠の表と規制のメーター（フェーズ 3 から） */
  function crownsPanel(): HTMLElement | null {
    const st = crownStats(e);
    if (!st) return null;
    const held = e.crowns?.held;
    const fmt = (c: (typeof CROWNS)[number], v: number) => (c === 'scale' ? shortMoney(v) : String(v));
    const when = { scale: t(`${FISCAL_MONTH + 1}月の決算`, `FY end (month ${FISCAL_MONTH + 1})`), brand: t('3月・9月', 'Mar · Sep'), influence: t('毎月', 'Monthly') };
    const lv = regulationLevel(st.share);
    const pctOf = (v: number) => `${Math.round(v * 100)}%`;
    const pos = (v: number) => `${Math.min(100, (v / 0.6) * 100)}%`;
    const over = e.crowns?.overMonths ?? 0;
    const status = [
      t('当局は気にしていません', 'No concern from the authorities'),
      t('当局が注視しています', 'The authorities are watching'),
      t('24 時間の強制や混みすぎたエリアに制裁金がかかります', 'Forcing 24h or crowding areas draws fines'),
      t(`分割の審査中：あと ${Math.max(0, REGULATION.breakupMonths - over)} か月で店の一部を売らされます`, `Break-up review: ${Math.max(0, REGULATION.breakupMonths - over)} months left`),
    ][lv];
    return panel(
      'ke-crowns',
      t('3 冠', 'Three crowns'),
      h(
        'ul.ke-crown-list',
        {},
        ...CROWNS.map((c) => {
          const ic = svgIcon('crown', 16);
          ic.classList.add('ke-crown');
          if (held?.[c]) ic.classList.add('is-held');
          const win = st.ours[c] > st.rival[c];
          return h(
            'li.ke-crown-row',
            { title: when[c] },
            h('span.ke-crown-name', {}, ic, crownName(c)),
            h('b', { class: `ke-figure ${win ? 'ke-good' : ''}` }, fmt(c, st.ours[c])),
            h('span.ke-hint', {}, t('対', 'vs')),
            h('b', { class: 'ke-figure ke-bad' }, fmt(c, st.rival[c])),
          );
        }),
      ),
      h('p.ke-hint', {}, t(`売上規模は ${FISCAL_MONTH + 1} 月の決算、ブランド力は 3 月と 9 月、影響力は毎月決まります`, `Scale is decided at the fiscal year end, brand in Mar and Sep, influence every month`)),
      h(
        'div.ke-reg',
        { title: t(`市場のシェア ${pctOf(st.marketShare)}＋影響力の重み`, `Market share ${pctOf(st.marketShare)} + influence`) },
        h('span.ke-field-label', {}, t(`規制のメーター ${pctOf(st.share)}`, `Regulation ${pctOf(st.share)}`)),
        h('div.ke-reg-bar', {}, h('span', { class: `is-${lv}`, style: `width:${pos(st.share)}` }), ...[REGULATION.watch, REGULATION.fines, REGULATION.breakup].map((v) => h('i.ke-reg-tick', { style: `left:${pos(v)}` }))),
        h('div.ke-reg-scale', { 'aria-hidden': 'true' }, ...[REGULATION.watch, REGULATION.breakup].map((v) => h('span', { style: `left:${pos(v)}` }, pctOf(v)))),
        h('span', { class: `ke-hint ${lv >= 2 ? 'ke-bad' : ''}` }, status),
      ),
    );
  }

  function ledgerView(): HTMLElement {
    if (!last) {
      return panel(
        'ke-ledger',
        t('お品書き', 'Ledger'),
        h('p.ke-note', {}, t('まだ報告はありません。店の設定を決めて「月を進める」を押すと、1 か月の勘定がここに並びます。', 'No report yet. Set up your store and press "Next month" to see the month here.')),
      );
    }
    const prev = e.history.at(-2);
    const sum = (f: (s: MonthReport['stores'][number]) => number) => last!.stores.reduce((a, s) => a + f(s), 0);
    const rows: HTMLElement[] = [row(t('売上', 'Sales'), money(last.revenue))];
    if (last.stores.length) {
      rows.push(row(t('原価（仕入れ）', 'Cost of goods'), money(-sum((s) => s.purchases))));
      rows.push(row(t('人件費', 'Labor'), money(-sum((s) => s.labor))));
      rows.push(row(t('家賃', 'Rent'), money(-sum((s) => s.rent))));
      const waste = sum((s) => s.waste);
      if (waste > 0) rows.push(row(t('うち廃棄', 'of which waste'), money(-waste), 'bad'));
    } else rows.push(row(t('店とエリアの利益', 'Store profit'), money(last.profit + (last.overhead ?? 0))));
    if (last.overhead) rows.push(row(t('本部の費用', 'Head office'), money(-last.overhead)));
    if (last.inflow) rows.push(row(t('本店からの送金', 'From the main shop'), money(last.inflow), 'good'));
    if (last.foreignRevenue) rows.splice(1, 0, row(t('うち本拠の外の売上', 'of which abroad'), money(last.foreignRevenue), 'good'));
    if (last.mnaDividend) rows.push(row(t('傘下の会社からの配当', 'Dividends from subsidiaries'), money(last.mnaDividend), 'good'));
    if (last.groupProfit) rows.push(row(t('会議卓の事業の利益', 'Group businesses'), money(last.groupProfit), 'good'));
    const delta = prev ? last.profit - prev.profit : 0;
    // 本拠ランドの売上の比べ合いは、3 冠の「売上規模」と同じなので、3 冠の表が出てからは省く
    const race = (() => {
      if (!e.nation || e.crowns) return null;
      const l12 = e.history.slice(-12).filter((r) => r.rivalRevenue !== undefined);
      const own = l12.reduce((a, r) => a + r.revenue, 0);
      const rival = l12.reduce((a, r) => a + (r.rivalRevenue ?? 0), 0);
      const share = own + rival ? Math.round((own / (own + rival)) * 100) : 50;
      const rv = rivalOf(e.land);
      return h(
        'div.ke-race',
        {},
        h('span.ke-field-label', {}, t('本拠ランドの売上（直近 12 か月）', 'Home-land sales (12 months)')),
        h('div.ke-race-bar', { role: 'img', 'aria-label': t(`自社 ${share}%`, `Yours ${share}%`) }, h('span.ke-race-ours', { style: `width:${share}%` }), h('span.ke-race-rival', { style: `width:${100 - share}%` })),
        h('div.ke-race-legend', {}, h('span.ke-good', {}, t(`自社 ${shortMoney(own)}`, `You ${shortMoney(own)}`)), h('span.ke-bad', {}, `${t(rv.company.ja, rv.company.en)} ${shortMoney(rival)}`)),
        l12.length < 12 ? h('span.ke-hint', {}, t(`${l12.length} / 12 か月（そろったら比べます）`, `${l12.length} / 12 months`)) : null,
      );
    })();
    return panel(
      'ke-ledger',
      t('お品書き', 'Ledger'),
      h('span.ke-panel-sub', {}, t(`${monthLabel(last.month)}の勘定`, `${monthLabel(last.month)}`)),
      h('div.ke-ledger-rows', {}, ...rows),
      h('div.ke-profit', {}, h('span', {}, t('利益', 'Profit')), h('b', { class: `ke-figure-lg ${last.profit < 0 ? 'ke-bad' : ''}` }, money(last.profit)), prev ? h('span', { class: delta >= 0 ? 'ke-good' : 'ke-bad' }, t(`先月より ${delta >= 0 ? '+' : ''}${money(delta)}`, `${delta >= 0 ? '+' : ''}${money(delta)} vs last month`)) : null),
      e.history.length > 1 ? profitBars(e.history) : null,
      race,
    );
  }

  /** 支持度の一覧（いまのフェーズで顔を出しているステークホルダー） */
  function supportView(): HTMLElement {
    return supportMeters(
      activeStakeholders(e).map((s) => {
        const p = e.stake?.penalties.find((x) => x.who === s.id && e.month < x.until);
        return { name: t(s.name.ja, s.name.en), value: supportOf(e, s.id), note: p ? t(`通告 あと ${p.until - e.month} か月`, `${p.until - e.month} mo`) : undefined };
      }),
      SUPPORT.demandBelow,
    );
  }

  /** 危機のメーター（フェーズ 3 から） */
  function riskView(): HTMLElement | null {
    const c = e.crisis;
    // 低いうちは出さない（どれかが 40 を超えるか、危機が起きているときだけ）
    if (!c || e.phase < 3 || !CRISES.some((id) => c.meters[id] >= 40 || crisisUntil(e, id) !== null)) return null;
    return h(
      'div.ke-risk-block',
      {},
      h('span.ke-field-label', {}, t('危機のおそれ', 'Crisis risk')),
      riskMeters(
        CRISES.map((id) => {
          const until = crisisUntil(e, id);
          return { name: crisisName(id), value: c.meters[id], note: until !== null ? t(`発生中・${monthLabel(until - 1)}まで`, `Active until ${monthLabel(until - 1)}`) : undefined };
        }),
        CRISIS.sign,
      ),
    );
  }

  function voicesView(): HTMLElement[] {
    const vs = voicesOf(last, e);
    const letter = e.phase === 1 && opts.letterHero ? letterFor(e, opts.letterHero.id) : null;
    const letterPlanned = !!letter && (draft.open ?? []).some((p) => p.owner !== null && p.base === letter.base);
    const out: HTMLElement[] = [];
    if (letter && opts.letterHero)
      out.push(
        letterCard(ctx(), opts.letterHero, letter, letterPlanned, () => {
          draft = { ...draft, open: letterPlanned ? (draft.open ?? []).filter((p) => p.owner === null) : [...(draft.open ?? []), letter] };
          if (!letterPlanned) play('build');
          render();
        }),
      );
    for (const v of vs)
      out.push(
        emaCard(
          v,
          v.fix
            ? () => {
                if (fixed.has(v.key)) return;
                fixed.add(v.key);
                draft = v.fix!.apply(draft, e);
                play('buff');
                render();
              }
            : null,
          v.store !== undefined && (e.phase === 1 || e.area) ? () => focusStore(v.store!) : null,
          fixed.has(v.key),
        ),
      );
    if (!out.length) out.push(h('p.ke-note', {}, t('いまは、急ぎの声はありません。', 'No urgent voices right now.')));
    return out;
  }

  /** 右の列：店の成績（フェーズ 1〜2）。利益の少ない店から並べ、押すと地図でその店を開く */
  function storesPanel(): HTMLElement | null {
    if (!last || !last.stores.length || e.phase > 2) return null;
    const rows = [...last.stores].sort((a, b) => a.profit - b.profit).slice(0, 6);
    return panel(
      'ke-list-panel',
      t('店の成績（先月）', 'Stores (last month)'),
      h(
        'ul.ke-list',
        {},
        ...rows.map((r) =>
          h(
            'li',
            {},
            h(
              'button.ke-list-row',
              { type: 'button', onclick: () => focusStore(r.id) },
              h('span', {}, storeName(r.id)),
              h('span.ke-list-bar', {}, h('span', { class: r.profit >= 0 ? 'is-good' : 'is-bad', style: `width:${Math.min(100, Math.round((Math.abs(r.profit) / Math.max(1, ...last!.stores.map((x) => Math.abs(x.profit)))) * 100))}%` })),
              h('b', { class: `ke-figure ${r.profit < 0 ? 'ke-bad' : 'ke-good'}` }, shortMoney(r.profit)),
            ),
          ),
        ),
      ),
    );
  }

  /** 右の列：エリアの一覧（フェーズ 3）。地図の板と同じものを、数字で比べられるように */
  function regionsPanel(): HTMLElement | null {
    if (atWorld()) return worldPanel(e, selection?.kind === 'land' ? WORLD_LANDS[selection.id] : null, (i) => select({ kind: 'land', id: i, ...(world?.isleRect(i) ?? { x: 0, y: 0, w: 0, h: 0 }) }));
    // 会議卓から：本拠や渡ったランドを押すとその国へ、まだのランドは海図へ
    if (atTable()) return worldPanel(e, null, (i) => goTo(['home', 'branch'].includes(isleStatus(e, WORLD_LANDS[i])) ? WORLD_LANDS[i] : 'world'));
    const nat = lens().nation;
    if (!nat || regionView !== null) return null;
    return panel(
      'ke-list-panel',
      t('エリア', 'Areas'),
      h(
        'ul.ke-list',
        {},
        h('li.ke-list-head', { 'aria-hidden': 'true' }, h('span.ke-list-name', {}, ''), h('span', {}, t('自社', 'Ours')), h('span', {}, t('他社', 'Rival')), h('span.ke-list-hub', {}, '')),
        ...nat.regions.map((r, i) =>
          h(
            'li',
            {},
            h(
              'button.ke-list-row',
              { type: 'button', 'aria-pressed': String(selection?.kind === 'region' && selection.id === i), onclick: () => select({ kind: 'region', id: i, ...(land?.plateRect(i) ?? { x: 0, y: 0, w: 0, h: 0 }) }) },
              h('span', { class: `ke-rar ke-rar-${r.rarity}` }, ['C', 'UC', 'R', 'E', 'L'][r.rarity]),
              h('span.ke-list-name', {}, t(r.name.ja, r.name.en)),
              h('span.ke-figure', { class: 'ke-figure ke-good' }, r.locked ? '—' : String(regionStores(r))),
              h('span.ke-figure', { class: 'ke-figure ke-bad' }, String(r.rival)),
              h('span.ke-list-hub', { title: t('物流拠点', 'Hub') }, r.hub || i === 0 ? t('拠点', 'hub') : ''),
            ),
          ),
        ),
      ),
    );
  }

  function focusStore(id: number): void {
    const s = e.stores.find((x) => x.id === id);
    if (!s) return;
    selection = e.phase === 1 ? { kind: 'store', id } : s.cell !== null ? { kind: 'lot', id: s.cell } : null;
    openPanel = null;
    sheetState = 'half';
    render();
    const r = targetRect(selection);
    if (r) view.reveal(r, phone() ? (root.clientHeight || 700) * 0.5 : 0);
  }

  function newsList(): HTMLElement {
    const news = newsOf(last, e);
    if (!news.length) return h('p.ke-note', {}, t('今月のかわら版はありません。', 'No news this month.'));
    return h('ul.ke-news', {}, ...news.map((n) => h('li', {}, n.hero !== null ? h('span.ke-news-pic', {}, opts.heroImage?.(n.hero) ?? null) : null, h('span', {}, n.head))));
  }

  /** 下の指示ボタン（フェーズごと） */
  function commands(): { label: string; sub: string; band: 'ours' | 'lantern' | 'rival'; on: () => void; pressed?: boolean }[] {
    const cmds: ReturnType<typeof commands> = [];
    const toggle = (p: Panel) => () => {
      openPanel = openPanel === p ? null : p;
      selection = null;
      sheetState = openPanel ? 'half' : 'closed';
      render();
    };
    if (e.phase === 1) {
      const s1 = e.stores[0];
      cmds.push({ label: t('店の設定', 'Store'), sub: s1 ? t(`発注 ×${s1.order.toFixed(2)}・${s1.hours} 時間`, `×${s1.order.toFixed(2)} · ${s1.hours}h`) : '', band: 'ours', on: () => focusStore(e.stores[0].id), pressed: selection?.kind === 'store' });
      const plots = p1().plots;
      if (plots.length) {
        const best = plots.map((p, k) => ({ k, v: plotProfit(p, e) })).sort((a, b) => b.v - a.v)[0].k;
        cmds.push({
          label: t('出店', 'Open'),
          sub: t(`${e.stores.length + (draft.open ?? []).length} / 3 店`, `${e.stores.length + (draft.open ?? []).length} / 3`),
          band: 'ours',
          pressed: selection?.kind === 'plot',
          on: () => {
            selection = { kind: 'plot', id: best };
            openPanel = null;
            sheetState = 'half';
            render();
            const r = targetRect(selection);
            if (r) view.reveal(r, phone() ? (root.clientHeight || 700) * 0.5 : 0);
          },
        });
      }
    }
    if (e.phase === 2 && e.area) {
      const best = (() => {
        const m = marks();
        for (const [gi, v] of m) if (v.recommended) return gi;
        return -1;
      })();
      const a = e.area;
      const lotOf = (gi: number) => (Math.floor(gi / (a.w + 2)) - 1) * a.w + ((gi % (a.w + 2)) - 1);
      if (best >= 0)
        cmds.push({
          label: t('出店', 'Open'),
          sub: t(`${e.stores.length + (draft.openAt ?? []).length} / 30 店・★おすすめ`, `${e.stores.length + (draft.openAt ?? []).length} / 30 · ★ picks`),
          band: 'ours',
          pressed: selection?.kind === 'lot' && !e.stores.some((s) => s.cell === selection!.id),
          on: () => {
            selection = { kind: 'lot', id: lotOf(best) };
            openPanel = null;
            sheetState = 'half';
            render();
            const r = targetRect(selection);
            if (r) view.reveal(r, phone() ? (root.clientHeight || 700) * 0.5 : 0);
          },
        });
      cmds.push({
        label: t('配送圏', 'Delivery'),
        sub: a.centers.length ? t(`センター ${a.centers.length}`, `${a.centers.length} center(s)`) : t('センターなし', 'no center'),
        band: 'ours',
        pressed: overlay === 'range',
        on: () => {
          overlay = overlay === 'range' ? 'none' : 'range';
          render();
        },
      });
      cmds.push({ label: t('本部の方針', 'Head office'), sub: t(`SV ${draft.sv ?? e.sv} 人・POS ${e.pos ? '✓' : '—'}`, `SV ${draft.sv ?? e.sv} · POS ${e.pos ? '✓' : '—'}`), band: 'ours', on: toggle('hq'), pressed: openPanel === 'hq' });
    }
    if (e.phase >= 5 && e.group) {
      // フェーズ 5：会議卓・地主会はどの画面からも
      const g = e.group;
      if (!atTable()) cmds.push({ label: t('会議卓', 'Board table'), sub: t(`冠 ${legendCrowns(e)}/${ENDING_CROWNS}`, `${legendCrowns(e)}/${ENDING_CROWNS} crowns`), band: 'ours', on: () => goTo('table') });
      const now = e.month === g.nextAuction;
      const bids = Object.keys(draft.bids ?? {}).length;
      cmds.push({ label: t('地主会', 'Auction'), sub: now ? (bids ? t(`✓ ${bids} ランドに付け値`, `✓ ${bids} bid(s)`) : t('今月・付け値を決める', 'This month: bid')) : monthLabel(g.nextAuction), band: now || g.nextAuction === e.month + 1 ? 'lantern' : 'ours', on: toggle('auction'), pressed: openPanel === 'auction' });
      if (atTable()) {
        cmds.push({ label: t('世界の海図', 'World chart'), sub: t(`${(e.world?.branches.length ?? 0) + 1} ランド`, `${(e.world?.branches.length ?? 0) + 1} lands`), band: 'ours', on: () => goTo('world') });
        cmds.push({ label: t('本拠を見る', 'Home land'), sub: e.land, band: 'ours', on: () => goTo(e.land) });
      }
      if (g.ended !== null && atTable()) cmds.push({ label: t('エンディング', 'Ending'), sub: companyTitle(e), band: 'lantern', on: () => ((endingOpen = true), render()) });
    }
    if (atWorld()) {
      // 世界の海図：渡れるランドを選ぶ・本拠や渡ったランドを見る
      const next = WORLD_LANDS.findIndex((k) => isleStatus(e, k) === 'open');
      if (next >= 0)
        cmds.push({
          label: t('渡る', 'Cross'),
          sub: draft.enter ? t(`✓ ${draft.enter.land}`, `✓ ${draft.enter.land}`) : t(`${WORLD_LANDS[next]}など`, `${WORLD_LANDS[next]} etc.`),
          band: draft.enter ? 'lantern' : 'ours',
          pressed: selection?.kind === 'land',
          on: () => {
            const i = draft.enter ? WORLD_LANDS.indexOf(draft.enter.land as (typeof WORLD_LANDS)[number]) : next;
            selection = { kind: 'land', id: i };
            openPanel = null;
            sheetState = 'half';
            render();
          },
        });
      cmds.push({ label: t('本拠を見る', 'Home land'), sub: e.land, band: 'ours', on: () => goTo(e.land) });
      for (const b of e.world?.branches ?? []) {
        const c = b.court;
        cmds.push({ label: b.land, sub: c.audience ? t('謁見済み', 'Audience held') : c.invited ? t('招待が届いています', 'You are invited') : t(`${regionStores(b.nation.regions[0])}+ 店`, `${regionStores(b.nation.regions[0])}+ stores`), band: c.invited && !c.audience ? 'lantern' : 'ours', on: () => goTo(b.land) });
      }
    }
    const v = lens();
    if (e.phase >= 3 && v.nation && !atWorld() && !atTable()) {
      const n = v.nation;
      const br = branchAt();
      if (e.phase >= 4 && regionView === null) cmds.push({ label: t('世界へ戻る', 'World chart'), sub: br ? t(`いま ${br.land}`, `now ${br.land}`) : t(`いま ${e.land}（本拠）`, `now ${e.land} (home)`), band: 'ours', on: () => goTo('world') });
      if (regionView === null) {
        // 出店できるエリアのうち、空きがいちばん多いところ
        const open = n.regions.map((r, i) => ({ r, i })).filter(({ r, i }) => !r.locked && (r.hub || i === 0));
        const target = open.sort((a, b) => b.r.capacity - regionStores(b.r) - (a.r.capacity - regionStores(a.r)))[0];
        if (target)
          cmds.push({
            label: t('出店', 'Open'),
            sub: t(`${t(target.r.name.ja, target.r.name.en)}など`, `${target.r.name.en} etc.`),
            band: 'ours',
            pressed: selection?.kind === 'region',
            on: () => {
              selection = { kind: 'region', id: target.i };
              openPanel = null;
              sheetState = 'half';
              render();
            },
          });
      }
      if (regionView !== null) cmds.push({ label: t('国へ戻る', 'Back to land'), sub: t('11 エリア', '11 areas'), band: 'ours', on: () => ((regionView = null), (selection = null), render()) });
      if (br) cmds.push({ label: t('支社', 'Branch'), sub: t(`研修所 ${n.trainingCenters}・現地化 ${Math.round(br.local * 100)}%`, `Centers ${n.trainingCenters} · local ${Math.round(br.local * 100)}%`), band: 'ours', on: toggle('branch'), pressed: openPanel === 'branch' });
      else cmds.push({ label: t('本部', 'Head office'), sub: t(`研修所 ${n.trainingCenters}・品質 ${Math.round(n.quality * 100)}%`, `Centers ${n.trainingCenters} · quality ${Math.round(n.quality * 100)}%`), band: 'ours', on: toggle('hq'), pressed: openPanel === 'hq' });
      // 政府とキング：注目度、招待が来たら光る
      {
        const c = v.court;
        const offering = br ? draft.branches?.[br.land]?.offering : draft.offering;
        const sub = c?.audience ? t('謁見済み', 'Audience held') : c?.invited ? (offering ? t('✓ 献上の品あり', '✓ Offering ready') : t('招待が届いています', 'You are invited')) : t(`注目度 ${Math.round(c?.attention ?? 0)}`, `Attention ${Math.round(c?.attention ?? 0)}`);
        cmds.push({ label: kingName(v.land), sub, band: c?.invited && !c.audience ? 'lantern' : 'ours', on: toggle('court'), pressed: openPanel === 'court' });
      }
      const seated = (draft.board ?? e.gov?.board ?? []).length;
      cmds.push({ label: t('役員会', 'Board'), sub: t(`${seated} / ${BOARD_SEATS} 席`, `${seated} / ${BOARD_SEATS} seats`), band: 'ours', on: toggle('board'), pressed: openPanel === 'board' });
    }
    // 役員会と株主総会は会社全体のもの（海図を見ていても出す）
    if (e.phase >= 3 && e.nation && (atWorld() || atTable())) {
      const seated = (draft.board ?? e.gov?.board ?? []).length;
      cmds.push({ label: t('役員会', 'Board'), sub: t(`${seated} / ${BOARD_SEATS} 席`, `${seated} / ${BOARD_SEATS} seats`), band: 'ours', on: toggle('board'), pressed: openPanel === 'board' });
    }
    if (e.phase >= 4 && e.nation) {
      // M&A：買収を仕掛けられて防衛策がまだなら光る
      const raid = e.mna?.raid;
      const owned = Object.values(e.mna?.holdings ?? {}).filter((x) => x.control).length;
      cmds.push({ label: t('M&A', 'M&A'), sub: raid && !raid.defense ? t('買収を仕掛けられています', 'Takeover bid!') : owned ? t(`傘下 ${owned} 社`, `${owned} controlled`) : t('ライバルの株', 'Rival shares'), band: raid && !raid.defense ? 'lantern' : 'ours', on: toggle('mna'), pressed: openPanel === 'mna' });
    }
    if (e.phase >= 3 && e.nation) {
      // 株主総会（上場前は銀行との面談）：その月と、前の月だけ出す
      if (e.gov && (meetingNow(e) || e.gov.nextMeeting === e.month + 1)) {
        const now = meetingNow(e);
        const name = e.nation.listed ? t('株主総会', 'Shareholders') : t('銀行と面談', 'Bank meeting');
        cmds.push({ label: name, sub: now ? (draft.meeting ? t('✓ 原稿あり', '✓ Speech ready') : draft.postpone ? t('延期する', 'Postponing') : t('今月・原稿を決める', 'This month: speech')) : t('来月', 'Next month'), band: now ? 'lantern' : 'ours', on: () => (toggle('meeting')(), openPanel === 'meeting' && phone() && ((sheetState = 'full'), render())), pressed: openPanel === 'meeting' });
      }
    }
    // 品ぞろえ（フェーズ 1〜2。フェーズ 3 は指示が多いので、本部のカードの中で変える）
    if (e.phase <= 2) {
      const f = draft.focus ?? e.focus ?? 'daily';
      cmds.push({ label: t('品ぞろえ', 'Range'), sub: `${fitMark(landProfile(e.land).fit[f])} ${focusLabel(f)}`, band: 'ours', on: toggle('focus'), pressed: openPanel === 'focus' });
    }
    if (canPromote(e)) cmds.push({ label: t('次の格へ', 'Next stage'), sub: companyTitle({ ...e, phase: Math.min(5, e.phase + 1) as EmpireState['phase'] }), band: 'lantern', on: toggle('promote'), pressed: openPanel === 'promote' });
    return cmds;
  }

  function promoteCard(): HTMLElement {
    const next = companyTitle({ ...e, phase: Math.min(5, e.phase + 1) as EmpireState['phase'] });
    const text =
      e.phase === 1
        ? t('エリアの地図に店を広げていく「エリアチェーン」になります。ライバルも同じ区画を狙ってきます。', 'You become an area chain, spreading stores across an area map. A rival will go after the same plots.')
        : e.phase === 2
          ? t('本拠ランドの 11 エリアへ広げる「全国チェーン」になります。物流拠点を先に建て、研修所で育てた人の数だけ出店します。', 'You become a national chain across the 11 areas of your home land. Build hubs first, and open as many stores as your training centers can staff.')
          : e.phase === 3
            ? t(
                `ほかのランドへ渡る「世界チェーン」になります。航路を開き、ランドごとに Common の 1 エリアから小さく始め直します（直営・ライセンス・合弁・買収の 4 つの渡り方）。本拠の外の ${GRADUATE.audiences} ランドでキングとの謁見が成り、売上の ${GRADUATE.foreign * 100}% を本拠の外で上げると、次の格です。`,
                `You become a global chain. Open sea routes and start small again in each land, from one Common area (direct, license, joint venture or acquisition). Win audiences with ${GRADUATE.audiences} kings abroad and earn ${GRADUATE.foreign * 100}% of sales outside your home land to move up.`,
              )
            : e.phase === 4
              ? t(
                  '企業グループ「ホールディングス」になります。各ランドの Legendary エリア（大市場）が開き、年に 1 度の地主会で区画を競り落とします。会議卓に業態カードを並べてグループを組み、渡れる全ランドの Legendary で 3 冠をそろえるとエンディングです。',
                  'You become a holding group. The Legendary market in each land opens, and its plots are won at a yearly auction. Build the group on the board table, and hold all three crowns in every Legendary area to reach the ending.',
                )
              : '';
    return h(
      'div.ke-card',
      {},
      h('div.ke-card-head', {}, h('h3.ke-card-title', {}, t(`条件達成！ ${next}へ`, `Goal met! Become ${next}`))),
      h('p.ke-note', {}, text),
      e.phase <= 4 ? h('button.ke-btn.ke-btn-primary', { type: 'button', onclick: () => advance({ promote: true }) }, t(`${next}になって月を進める`, `Become ${next} and advance`)) : null,
    );
  }

  function panelBody(p: Panel): HTMLElement | null {
    const c = ctx();
    switch (p) {
      case 'hq':
        return e.phase >= 3 && e.nation ? hqCard3(c) : hqCard2(c);
      case 'auction':
        return e.group ? auctionCard(c) : null;
      case 'mna':
        return e.phase >= 4 ? mnaCard(c) : null;
      case 'branch': {
        const b = branchAt();
        return b ? branchHqCard(c, b) : null;
      }
      case 'ringi':
        return ringiList(c);
      case 'news':
        return newsList();
      case 'promote':
        return promoteCard();
      case 'board':
        return boardCard(c, opts.boardCandidates?.() ?? []);
      case 'focus':
        return focusCard(c);
      case 'court':
        return courtCard(lctx(), opts.landImage?.(landProfile(lens().land).key) ?? null, !!branchAt());
      case 'meeting':
        return e.gov ? meetingCard(c) : null;
      case 'ledger':
        return h('div.ke-ema-list', {}, ledgerView(), ...[legendView(), crownsPanel()].filter((x): x is HTMLElement => !!x));
      case 'voices':
        return h('div.ke-ema-list', {}, supportView(), riskView(), ...voicesView());
      case 'commands':
        return h(
          'div.ke-cmd-list',
          {},
          ...commands().map((cmd) =>
            h(
              'button.ke-cmd',
              {
                type: 'button',
                class: `ke-cmd ke-band-${cmd.band}`,
                onclick: () => {
                  cmd.on();
                },
              },
              h('b', {}, cmd.label),
              h('span.ke-figure', {}, cmd.sub),
            ),
          ),
        );
      default:
        return null;
    }
  }

  const panelTitle = (p: Panel) =>
    ({ hq: t('本部', 'Head office'), auction: t('地主会', 'Auction'), mna: t('M&A', 'M&A'), branch: t(`${at}の支社`, `${at} branch`), ringi: t('稟議', 'Plans'), news: t('かわら版', 'News'), promote: t('次の格へ', 'Next stage'), board: t('役員会', 'Board'), focus: t('品ぞろえ', 'Product range'), court: kingName(lens().land), meeting: e.nation?.listed ? t('株主総会', "Shareholders' meeting") : t('銀行との面談', 'Bank meeting'), ledger: t('帳簿', 'Ledger'), voices: t('声', 'Voices'), commands: t('指示', 'Commands') })[p as Exclude<Panel, null>] ?? '';

  function monthButton(): HTMLElement {
    const items = ringiItems(e, draft);
    return h(
      'button.ke-month',
      { type: 'button', disabled: busy, onclick: () => advance() },
      h('span.ke-month-label', {}, t('月を進める', 'Next month')),
      meetingNow(e) && !draft.meeting && !draft.postpone
        ? h('span.ke-month-sub', {}, t('総会の原稿がまだです', 'No speech yet'))
        : items.length
          ? h('span.ke-month-sub', {}, t(`稟議 ${items.length} 件に判子`, `Stamp ${items.length} plan(s)`))
          : null,
    );
  }

  function ringiButton(): HTMLElement {
    const items = ringiItems(e, draft);
    const total = reserved(e, draft);
    return h(
      'button.ke-ringi-btn',
      { type: 'button', 'aria-pressed': String(openPanel === 'ringi'), onclick: () => ((openPanel = openPanel === 'ringi' ? null : 'ringi'), (selection = null), render()) },
      svgIcon('stamp', 18),
      h('span', {}, t(`稟議 ${items.length} 件`, `${items.length} plan(s)`)),
      total ? h('b.ke-figure', {}, `−${shortMoney(total)}`) : null,
    );
  }

  function toolsView(): HTMLElement[] {
    const out: HTMLElement[] = [];
    if (!atTable() && (grid || (land && phone()) || (world && phone()))) {
      const [lo, hi] = view.zoomLimits;
      out.push(
        h('button.ke-tool', { type: 'button', 'aria-label': t('拡大', 'Zoom in'), disabled: view.currentZoom >= hi, onclick: () => (view.stepZoom(1), render()) }, svgIcon('zoom-in')),
        h('button.ke-tool', { type: 'button', 'aria-label': t('縮小', 'Zoom out'), disabled: view.currentZoom <= lo, onclick: () => (view.stepZoom(-1), render()) }, svgIcon('zoom-out')),
      );
    }
    if (e.phase === 2 && grid) {
      const ov = (k: 'heat' | 'range', label: string) => h('button.ke-tool.ke-tool-text', { type: 'button', 'aria-pressed': String(overlay === k), onclick: () => ((overlay = overlay === k ? 'none' : k), render()) }, label);
      out.push(ov('heat', t('人通り', 'Traffic')), ov('range', t('配送圏', 'Delivery')));
    }
    if (e.phase >= 4 && !atWorld() && !atTable() && regionView === null) out.unshift(h('button.ke-tool.ke-tool-text', { type: 'button', onclick: () => goTo('world') }, svgIcon('back', 18), t('世界の海図へ', 'World chart')));
    if (e.phase >= 3 && regionView !== null && lens().nation) {
      const r = lens().nation!.regions[regionView];
      out.unshift(h('button.ke-tool.ke-tool-text', { type: 'button', onclick: () => ((regionView = null), (selection = null), render()) }, svgIcon('back', 18), t(`国へ戻る（${t(r.name.ja, r.name.en)}）`, `Back (${r.name.en})`)));
    }
    return out;
  }

  // ---------------------------------------------------------------- 描く

  function render(): void {
    const isPhone = phone();
    root.classList.toggle('ke-phone', isPhone);
    head.replaceChildren(...headView());
    const voices = voicesView();
    const news = newsOf(last, e);
    const kawa = kawaraban(news, (id) => opts.heroImage?.(id) ?? null, () => ((openPanel = 'news'), (selection = null), (sheetState = 'half'), render()));
    // 地図の上：道具・助言・選んだ物
    tools.replaceChildren(...toolsView());
    const ready = canPromote(e);
    advisorHost.replaceChildren(
      advisor && opts.mineImage
        ? bubble(opts.mineImage(), adviceOf(last, e, ready), () => {
            advisor = false;
            render();
          })
        : opts.mineImage
          ? h(
              'button.ke-mine-btn',
              { type: 'button', 'aria-label': t('マインちゃんの助言を開く', "Open Mine-chan's advice"), onclick: () => ((advisor = true), tuckAdvisor(), play('helper'), render()) },
              opts.mineImage(),
              voicesOf(last, e).some((v) => v.urgent) || ready ? h('span.ke-dot', {}) : null,
            )
          : h('span', {}),
    );
    const sc = selectionCard();
    if (isPhone) {
      left.replaceChildren();
      right.replaceChildren();
      selCard.replaceChildren();
      strip.replaceChildren(
        news.length
          ? h('button.ke-strip-btn', { type: 'button', onclick: () => ((openPanel = 'news'), (selection = null), (sheetState = 'half'), render()) }, h('b.ke-strip-tag', {}, t('かわら版', 'News')), h('span.ke-strip-text', {}, news[0].head), svgIcon('chevron-right', 16))
          : h('span.ke-strip-empty', {}, monthLabel(e.month)),
      );
      const vs = voicesOf(last, e);
      const urgent = vs.filter((v) => v.urgent).length;
      const items = ringiItems(e, draft);
      const fold = (p: Panel, name: string, value: string, note: string, tone: string) =>
        h('button.ke-fold', { type: 'button', 'aria-expanded': String(openPanel === p), onclick: () => ((openPanel = openPanel === p ? null : p), (selection = null), (sheetState = openPanel ? 'half' : 'closed'), render()) }, h('b', {}, name), h('span.ke-spacer', {}), h('span.ke-figure', {}, value), h('span', { class: `ke-fold-note ${tone}` }, note), svgIcon('chevron-right', 18));
      const delta = last && e.history.at(-2) ? last.profit - e.history.at(-2)!.profit : 0;
      folds.replaceChildren(
        fold('ledger', t('帳簿', 'Ledger'), last ? t(`利益 ${shortMoney(last.profit)}`, `Profit ${shortMoney(last.profit)}`) : '—', last && e.history.length > 1 ? `${delta >= 0 ? '+' : ''}${shortMoney(delta)}` : '', delta >= 0 ? 'ke-good' : 'ke-bad'),
        fold('voices', t('声', 'Voices'), t(`${vs.length} 件`, `${vs.length}`), urgent ? t(`急ぎ ${urgent}`, `${urgent} urgent`) : '', urgent ? 'ke-bad' : ''),
        fold('ringi', t('稟議', 'Plans'), t(`${items.length} 件`, `${items.length}`), reserved(e, draft) ? `−${shortMoney(reserved(e, draft))}` : '', ''),
      );
      dock.replaceChildren(
        h('button.ke-cmd.ke-band-ours.ke-cmd-phone', { type: 'button', 'aria-expanded': String(openPanel === 'commands'), onclick: () => ((openPanel = openPanel === 'commands' ? null : 'commands'), (selection = null), (sheetState = openPanel ? 'half' : 'closed'), render()) }, h('b', {}, t('指示', 'Commands')), canPromote(e) ? h('span.ke-dot', { 'aria-label': t('次の格へ上がれます', 'Ready to move up') }) : null),
        monthButton(),
      );
      pop.replaceChildren();
      const body = sc ?? panelBody(openPanel);
      const title = sc ? (sc.querySelector('.ke-card-title')?.textContent ?? t('区画', 'Plot')) : panelTitle(openPanel);
      // 帳簿・声・稟議・かわら版は、シートの上のタブで切り替える（閉じずに 1 回で）
      const tabbed: Panel[] = ['ledger', 'voices', 'ringi', 'news'];
      const tabs =
        !sc && tabbed.includes(openPanel)
          ? tabbed.map((p) => ({
              label: panelTitle(p),
              active: p === openPanel,
              on: () => {
                openPanel = p;
                render();
              },
            }))
          : undefined;
      sheetHost.replaceChildren(
        body && sheetState !== 'closed'
          ? sheet(
              title,
              body,
              sheetState,
              (s) => {
                sheetState = s;
                if (s === 'closed') {
                  selection = null;
                  openPanel = null;
                }
                render();
              },
              tabs,
            )
          : h('span', {}),
      );
    } else {
      strip.replaceChildren();
      folds.replaceChildren();
      sheetHost.replaceChildren();
      left.replaceChildren(ledgerView(), ...[legendView(), crownsPanel()].filter((x): x is HTMLElement => !!x));
      right.replaceChildren(panel('ke-voices', t('絵馬掛け', 'Voices'), supportView(), riskView(), ...voices), ...[storesPanel(), regionsPanel(), kawa].filter((x): x is HTMLElement => !!x));
      // 会議卓のマスのカードは、地図の横ではなく右の窓に出す
      const slotSel = selection?.kind === 'slot';
      selCard.replaceChildren(
        sc && !slotSel
          ? h(
              'div.ke-selcard',
              {},
              h('button.ke-icon-btn.ke-selcard-close', { type: 'button', 'aria-label': t('閉じる', 'Close'), onclick: () => ((selection = null), render()) }, svgIcon('close', 18)),
              sc,
            )
          : h('span', {}),
      );
      dock.replaceChildren(
        h(
          'div.ke-cmds',
          {},
          ...commands().map((cmd) =>
            h(
              'button.ke-cmd',
              { type: 'button', class: `ke-cmd ke-band-${cmd.band}`, 'aria-pressed': cmd.pressed === undefined ? undefined : String(!!cmd.pressed), onclick: cmd.on },
              h('b', {}, cmd.label),
              h('span.ke-figure', {}, cmd.sub),
            ),
          ),
        ),
        h('span.ke-spacer', {}),
        ringiButton(),
        monthButton(),
      );
      const body = slotSel ? sc : panelBody(openPanel);
      const popTitle = slotSel ? t('会議卓', 'Board table') : panelTitle(openPanel);
      pop.replaceChildren(
        body
          ? h(
              'div.ke-pop',
              { role: 'dialog', 'aria-label': popTitle },
              h('div.ke-pop-head', {}, h('h2.ke-panel-title', {}, popTitle), h('button.ke-icon-btn', { type: 'button', 'aria-label': t('閉じる', 'Close'), onclick: () => ((openPanel = null), (selection = null), (moving = null), render()) }, svgIcon('close'))),
              h('div.ke-pop-body', {}, body),
            )
          : h('span', {}),
      );
    }
    syncMap();
    requestAnimationFrame(placeOverlays);
    // エンディング（その月の報告で 1 度、会議卓の指示からもう一度）
    endHost.replaceChildren(
      endingOpen && e.group
        ? h('div.ke-end-backdrop', {}, endingCard(e, opts.mineImage?.() ?? null, () => ((endingOpen = false), render())))
        : h('span', {}),
    );
  }

  // Esc：まずシート・詳細・パネルを閉じる（経営画面ごと閉じるのはそのあと）
  const onKey = (ev: KeyboardEvent) => {
    // ほかのモーダル（デバッグパネルなど）が上に開いているときは、そちらが先
    if (ev.key !== 'Escape' || !root.isConnected || document.querySelector('.modal-backdrop')) return;
    if (selection || openPanel || sheetState !== 'closed') {
      ev.stopPropagation();
      ev.preventDefault();
      selection = null;
      openPanel = null;
      sheetState = 'closed';
      render();
    }
  };
  window.addEventListener('keydown', onKey, true);
  mq?.addEventListener?.('change', () => root.isConnected && render());
  const mo = new MutationObserver(() => {
    if (!root.isConnected) {
      window.removeEventListener('keydown', onKey, true);
      view.destroy();
      mo.disconnect();
    }
  });
  queueMicrotask(() => root.parentNode && mo.observe(root.parentNode, { childList: true }));

  render();
  tuckAdvisor();
  // テストモードだけ：撮影・自動テストから地図の物の位置を引けるように
  if (opts.onTest) {
    Object.assign(root, {
      keDebug: {
        /** kind・id の物の中心（画面の座標）。見えていなければ null */
        point: (kind: string, id: number) => {
          if (kind === 'slot') {
            const el = root.querySelectorAll('.ke-slot')[id] as HTMLElement | undefined;
            const b = el?.getBoundingClientRect();
            return b ? { x: b.left + b.width / 2, y: b.top + b.height / 2 } : null;
          }
          const r = targetRect({ kind: kind as NonNullable<Selection>['kind'], id });
          if (!r) return null;
          const p = view.toCss(r.x + r.w / 2, r.y + r.h / 2);
          const c = view.canvas.getBoundingClientRect();
          return { x: c.left + p.x, y: c.top + p.y };
        },
        state: () => ({ e, draft, selection, openPanel, sheetState }),
      },
    });
  }
  return root;
}

export { introView } from './intro';
