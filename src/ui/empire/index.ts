// 経営モードの画面（docs/EMPIRE_DESIGN.md 10 章・docs/design.md）。テストモードのときだけ読む（main.ts から動的 import）。
// 町を見下ろす机：左にお品書き、中央に地図、右に絵馬とかわら版、下に指示と「月を進める」。
// スマホ（599px 以下）は、地図・かわら版の 1 行・折りたたみの 3 行・ドック。詳しい情報は下から出るシート。
import './tokens.css';
import './empire.css';
import { cannibalMult, dist, freeCells, inRange } from '../../empire/area';
import { newEmpire, type EmpireState, type MonthReport } from '../../empire/model';
import { regionStores } from '../../empire/nation';
import { rivalOf } from '../../empire/rivals';
import { advanceMonth, AREA_OPEN_COST, canPromote, letterFor, MAX_STORES, ownCells, phase1Done, plotsFor, storeCount, type Decisions } from '../../empire/sim';
import { t } from '../../i18n';
import { GridScene, type GridData } from '../../render/map/grid';
import { LandScene } from '../../render/map/land';
import { MapView, type MapTarget } from '../../render/map/view';
import { h } from '../dom';
import { hqCard2, hqCard3, letterCard, lotCard, plotCard, plotProfit, regionCard, reserved, ringiItems, ringiList, storeCard, type Ctx, type SoundKey } from './cards';
import { foundingTown, gridIndex, heats, phase1Cells, plotCells, RAMEN, sectorGrid, storeExt, townGrid } from './maps';
import { adviceOf, newsOf, voicesOf } from './notes';
import { bubble, chip, emaCard, kawaraban, panel, profitBars, row, sheet, svgIcon, type SheetState } from './parts';
import { companyTitle, monthLabel, money, plotLabel, shortMoney, storeName } from './text';

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
  /** 効果音 */
  play?: (key: SoundKey) => void;
  /** 画面を閉じる */
  onClose?: () => void;
  /** テストモードのデバッグパネル（ヘッダーに TEST を出す） */
  onTest?: () => void;
}

type Panel = 'hq' | 'ringi' | 'news' | 'promote' | 'commands' | 'ledger' | 'voices' | null;
type Selection = { kind: 'store' | 'plot' | 'lot' | 'region'; id: number } | null;

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
  if (e.nation) {
    const last12 = e.history.slice(-12).filter((r) => r.rivalRevenue !== undefined);
    const own = last12.reduce((a, r) => a + r.revenue, 0);
    const rival = last12.reduce((a, r) => a + (r.rivalRevenue ?? 0), 0);
    return { label: t('売上 対 ライバル', 'Sales vs rival'), value: `${shortMoney(own)} : ${shortMoney(rival)}`, done: canPromote(e) };
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
  root.append(head, chipsRow, desk, strip, folds, dock, pop, sheetHost);

  // ---------------------------------------------------------------- 地図
  const tags = h('div.ke-tags', { 'aria-hidden': 'true' });
  const tip = h('div.ke-tip', { role: 'tooltip', hidden: true });
  const selCard = h('div.ke-selcard-host', {});
  const tools = h('div.ke-tools', {});
  const advisorHost = h('div.ke-advisor-host', {});
  const coins = h('div.ke-coins', { 'aria-hidden': 'true' });
  let grid: GridScene | null = null;
  let land: LandScene | null = null;
  let sceneKey = '';
  const view = new MapView({
    onHover: (target, x, y) => showTip(target, x, y),
    onSelect: (target) => select(target),
    onCamera: () => placeOverlays(),
  });
  center.append(view.el, tags, coins, tools, advisorHost, selCard, tip);

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
    const cells = phase1Cells(area, 3);
    const plots = e.stores.length + (draft.open ?? []).length >= MAX_STORES[1] && !(draft.open ?? []).length ? [] : plotsFor(e);
    const pc = plotCells(area, plots, cells);
    return { area, cells, plots, pc };
  };

  /** 地図の場面を作り直す（形が変わったときだけ） */
  function syncMap(): void {
    let key = '';
    let data: GridData | null = null;
    let focus: { x: number; y: number } | undefined;
    let zoom = 1;
    if (e.phase === 1) {
      const { area, cells, plots, pc } = p1();
      key = `p1:${e.name}:${e.month}:${e.stores.map((s) => `${s.id}${s.sign ? 's' : ''}${s.parking ? 'p' : ''}`).join(',')}:${plots.length}`;
      if (key !== sceneKey) {
        data = townGrid(area, {
          own: e.stores.slice(0, 3).map((s, k) => ({ cell: cells[k], ext: storeExt(s), id: s.id })),
          rival: [],
          centers: [],
          targetKind: (c) => (cells.slice(0, e.stores.length).includes(c) ? 'store' : pc.includes(c) ? 'plot' : null),
        });
        // 区画の番号 → 店の id・候補の番号
        data.cells.forEach((cell) => {
          if (!cell.target) return;
          const c = cell.target.id;
          if (cell.target.kind === 'store') cell.target = { kind: 'store', id: e.stores[cells.indexOf(c)].id };
          else cell.target = { kind: 'plot', id: pc.indexOf(c) };
        });
        const f = gridIndex(area, cells[0]);
        focus = { x: ((f % (area.w + 2)) + 0.5) * 64, y: (Math.floor(f / (area.w + 2)) + 0.5) * 64 };
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
        });
      }
    } else if (e.nation) {
      if (regionView === null) {
        key = `p3:land:${e.month}:${e.nation.regions.map((r) => `${regionStores(r)}/${r.rival}/${r.hub ? 1 : 0}`).join(',')}`;
        if (key !== sceneKey) {
          land = new LandScene(
            e.land,
            e.nation.regions.map((r) => ({ rarity: r.rarity, own: regionStores(r), rival: r.rival, capacity: r.capacity, hub: r.hub || e.nation!.regions.indexOf(r) === 0, locked: r.locked })),
          );
          grid = null;
          sceneKey = key;
          view.setScene(land, { zoom: phone() ? 0.5 : 'fit', levels: phone() ? [0.5, 1, 2] : [1, 2] });
        }
        if (land) land.selected = selection?.kind === 'region' ? selection.id : null;
        placeOverlays();
        view.invalidate();
        return;
      }
      const r = e.nation.regions[regionView];
      key = `p3:area:${regionView}:${regionStores(r)}/${r.rival}/${r.hub}`;
      if (key !== sceneKey) data = regionView === 0 && e.area ? townGrid(e.area, { own: e.stores.filter((s) => s.cell !== null).map((s) => ({ cell: s.cell!, ext: storeExt(s), id: s.id })), rival: e.area.rivalStores, centers: e.area.centers, targetKind: () => null }) : sectorGrid(r, regionView + 1);
    }
    if (data) {
      grid = new GridScene(data);
      land = null;
      const keep = sceneKey.split(':').slice(0, 2).join(':') === key.split(':').slice(0, 2).join(':');
      sceneKey = key;
      view.setScene(grid, { focus, zoom: keep ? undefined : focus ? zoom : 'fit', keepCamera: keep, levels: phone() ? [0.5, 1, 2, 3] : [1, 2, 3] });
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
      e.stores.slice(0, 3).forEach((s, k) => selection?.kind === 'store' && selection.id === s.id && (get(gridIndex(area, cells[k])).selected = true));
      const best = plots.length ? plots.map((p, k) => ({ k, v: plotProfit(p) })).sort((a, b) => b.v - a.v)[0].k : -1;
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
    if (!grid) return null;
    const i = grid.cellOf(s.kind, s.id);
    return i >= 0 ? grid.cellRect(i) : null;
  }

  function placeOverlays(): void {
    // 国の板の札
    tags.replaceChildren();
    if (land && e.nation) {
      e.nation.regions.forEach((r, i) => {
        const pr = land!.plateRect(i);
        const p = view.toCss(pr.x, pr.y + pr.h + 4);
        const share = Math.round((regionStores(r) / Math.max(1, r.capacity)) * 100);
        const short = phone() && view.currentZoom < 1;
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
      const r = rivalOf(e.land);
      return t(r.company.ja, r.company.en);
    })();
    if (target.kind === 'store') {
      const s = e.stores.find((x) => x.id === target.id);
      const rep = last?.stores.find((r) => r.id === target.id);
      return s ? [storeName(s.id), rep ? t(`先月の利益 ${money(rep.profit)}`, `Profit ${money(rep.profit)}`) : plotLabel(s.plot), t('押すと設定', 'Click to set up')] : [];
    }
    if (target.kind === 'plot') {
      const p = p1().plots[target.id];
      return p ? [t(`空き区画：${plotLabel(p.kind)}`, `Vacant: ${plotLabel(p.kind)}`), t(`日販 ${money(p.base)}・家賃 ${money(p.rent)}`, `${money(p.base)}/day · rent ${money(p.rent)}`), t(`月の利益の見込み ${money(plotProfit(p))}`, `Est. ${money(plotProfit(p))}/mo`)] : [];
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
    if (target.kind === 'region' && e.nation) {
      const r = e.nation.regions[target.id];
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
    if (phone() && target) view.reveal(target, (root.clientHeight || 700) * 0.5);
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
    if (selection.kind === 'region' && e.nation)
      return regionCard(c, selection.id, () => {
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
      e = r.state;
      last = r.report;
      draft = {};
      fixed.clear();
      advisor = true;
      tuckAdvisor();
      busy = false;
      if (e.phase !== wasPhase) {
        selection = null;
        regionView = null;
        play('win');
      } else if (r.report.profit > prevBest && e.history.length > 3) play('rare');
      else if (r.report.notes.some((n) => ['shortOfFunds', 'investigationSoon', 'marginCall'].includes(n.kind))) play('fail');
      else if (r.report.notes.some((n) => ['fatigue', 'ownerUnrest', 'rivalPlan', 'landFalling'].includes(n.kind))) play('debuff');
      // 選んでいた物がもう無ければ外す
      if (selection?.kind === 'plot') selection = null;
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
    return [h('h1.ke-title', {}, companyTitle(e)), h('span.ke-pill', {}, t(`フェーズ${e.phase}　${PHASE_NAME()[e.phase]}`, `Phase ${e.phase} · ${PHASE_NAME()[e.phase]}`)), h('span.ke-spacer', {}), h('div.ke-chips', {}, ...chips), test, close].filter((x): x is HTMLElement => !!x);
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
    const delta = prev ? last.profit - prev.profit : 0;
    const race = (() => {
      if (!e.nation) return null;
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
        const best = plots.map((p, k) => ({ k, v: plotProfit(p) })).sort((a, b) => b.v - a.v)[0].k;
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
    if (e.phase >= 3 && e.nation) {
      const n = e.nation;
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
      cmds.push({ label: t('本部', 'Head office'), sub: t(`研修所 ${e.nation.trainingCenters}・品質 ${Math.round(e.nation.quality * 100)}%`, `Centers ${e.nation.trainingCenters} · quality ${Math.round(e.nation.quality * 100)}%`), band: 'ours', on: toggle('hq'), pressed: openPanel === 'hq' });
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
          : t('次の格（世界展開）は、次の更新で開きます。', 'The next stage (going global) opens in a later update.');
    return h(
      'div.ke-card',
      {},
      h('div.ke-card-head', {}, h('h3.ke-card-title', {}, t(`条件達成！ ${next}へ`, `Goal met! Become ${next}`))),
      h('p.ke-note', {}, text),
      e.phase <= 2 ? h('button.ke-btn.ke-btn-primary', { type: 'button', onclick: () => advance({ promote: true }) }, t(`${next}になって月を進める`, `Become ${next} and advance`)) : null,
    );
  }

  function panelBody(p: Panel): HTMLElement | null {
    const c = ctx();
    switch (p) {
      case 'hq':
        return e.phase >= 3 && e.nation ? hqCard3(c) : hqCard2(c);
      case 'ringi':
        return ringiList(c);
      case 'news':
        return newsList();
      case 'promote':
        return promoteCard();
      case 'ledger':
        return ledgerView();
      case 'voices':
        return h('div.ke-ema-list', {}, ...voicesView());
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
    ({ hq: t('本部', 'Head office'), ringi: t('今月の稟議', "This month's plans"), news: t('かわら版', 'Kawaraban'), promote: t('次の格へ', 'Next stage'), ledger: t('お品書き', 'Ledger'), voices: t('絵馬掛け', 'Voices'), commands: t('指示', 'Commands') })[p as Exclude<Panel, null>] ?? '';

  function monthButton(): HTMLElement {
    const items = ringiItems(e, draft);
    return h(
      'button.ke-month',
      { type: 'button', disabled: busy, onclick: () => advance() },
      h('span.ke-month-label', {}, t('月を進める', 'Next month')),
      items.length ? h('span.ke-month-sub', {}, t(`稟議 ${items.length} 件に判子`, `Stamp ${items.length} plan(s)`)) : null,
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
    if (grid || (land && phone())) {
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
    if (e.phase >= 3 && regionView !== null && e.nation) {
      const r = e.nation.regions[regionView];
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
      const title = sc ? (selection?.kind === 'region' ? t('エリア', 'Area') : t('区画', 'Plot')) : panelTitle(openPanel);
      sheetHost.replaceChildren(
        body && sheetState !== 'closed'
          ? sheet(title, body, sheetState, (s) => {
              sheetState = s;
              if (s === 'closed') {
                selection = null;
                openPanel = null;
              }
              render();
            })
          : h('span', {}),
      );
    } else {
      strip.replaceChildren();
      folds.replaceChildren();
      sheetHost.replaceChildren();
      left.replaceChildren(ledgerView());
      right.replaceChildren(panel('ke-voices', t('絵馬掛け', 'Voices'), ...voices), ...(kawa ? [kawa] : []));
      selCard.replaceChildren(
        sc
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
      const body = panelBody(openPanel);
      pop.replaceChildren(
        body
          ? h(
              'div.ke-pop',
              { role: 'dialog', 'aria-label': panelTitle(openPanel) },
              h('div.ke-pop-head', {}, h('h2.ke-panel-title', {}, panelTitle(openPanel)), h('button.ke-icon-btn', { type: 'button', 'aria-label': t('閉じる', 'Close'), onclick: () => ((openPanel = null), render()) }, svgIcon('close'))),
              h('div.ke-pop-body', {}, body),
            )
          : h('span', {}),
      );
    }
    syncMap();
    requestAnimationFrame(placeOverlays);
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
  return root;
}

/** マインちゃんの誘い：屋号を決めて会社を作る */
export function foundView(onFound: (e: EmpireState) => void, mineImg: HTMLElement, land: string | null): HTMLElement {
  ensureFonts();
  const input = h('input.ke-input', { type: 'text', maxlength: 12, value: t('マイクリ', 'MyCrypto'), 'aria-label': t('屋号', 'Company name') }) as HTMLInputElement;
  const seed = () => {
    const b = new Uint32Array(1);
    crypto.getRandomValues(b);
    return b[0];
  };
  return h(
    'div.ke.ke-found',
    {},
    h(
      'div.ke-advisor.ke-advisor-static',
      {},
      h('div.ke-advisor-face', {}, mineImg),
      h('p.ke-advisor-text', {}, t('店主さん、2 週間もかからずに黄金のエクステンションまで行けるなんて、もう立派な商売人です！ そろそろ、新しいお店を出してみませんか？ この工房は「本店」として、これまでどおり続けられます。', "Owner, you reach the golden extension in under two weeks. You're a real merchant now! How about opening a new store? This workshop carries on as the main shop, just as before.")),
    ),
    h('label.ke-field', {}, h('span.ke-field-label', {}, t('屋号', 'Company name')), input),
    h('p.ke-note', {}, t('本店の売上の一部が、営業日を終えるたびに会社の資金になります（会社のお金で工房は強くなりません）。', "Part of the main shop's sales goes into the company's funds after each business day (company money doesn't power up the workshop).")),
    h('button.ke-btn.ke-btn-primary', { type: 'button', onclick: () => onFound(newEmpire(input.value.trim().slice(0, 12) || t('マイクリ', 'MyCrypto'), seed(), land ?? 'Ocean')) }, t('お店を出す', 'Open a store')),
  );
}
