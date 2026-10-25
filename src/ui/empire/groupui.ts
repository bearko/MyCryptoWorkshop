// フェーズ 5 企業グループの画面（docs/EMPIRE_DESIGN.md 10.13）：会議卓・業態カード・地主会・Legendary の番付・エンディング。
// どれも DOM を返すだけ。会議卓は地図のかわりに真ん中に置く（3×3 のマスと、マスの間のシナジーの線）。
import { BUSINESS, BUSINESSES, CORE_SLOT, linksAt, NEIGHBORS, SELL_BACK, synergizes, synergyLinks, tableProfit, type Business, type Table } from '../../empire/business';
import { CROWNS } from '../../empire/crowns';
import { hasNetwork, rivalBid } from '../../empire/group';
import { AUCTION, BID_LEVELS, bidCost, biddable, bidPrice, ENDING_CROWNS, legendCrowns, legendIndex, landsOf, plotCap, type Bid } from '../../empire/group';
import type { EmpireState } from '../../empire/model';
import { nationStores, regionStores } from '../../empire/nation';
import { OPEN_LANDS } from '../../empire/world';
import { t } from '../../i18n';
import { h } from '../dom';
import { card, type Ctx } from './cards';
import { costButton, panel, row, segmented, stepper, svgIcon } from './parts';
import { bidLabel, businessName, companyTitle, crownName, money, monthLabel, shortMoney } from './text';

/** 下書きを当てた会議卓 */
export const draftTable = (ctx: Pick<Ctx, 'e' | 'draft'>): Table => ctx.draft.table ?? ctx.e.group!.table;

const lack = (ctx: Ctx, cost: number) => (ctx.fundsLeft() < cost ? t(`資金があと ${money(cost - ctx.fundsLeft())} 足りません`, `${money(cost - ctx.fundsLeft())} short`) : null);

/** 会議卓（3×3 のマスと、隣り合うマスの間の線）。selected は選んだマス */
export function tableView(ctx: Ctx, selected: number | null, onSlot: (slot: number) => void): HTMLElement {
  const table = draftTable(ctx);
  const now = ctx.e.group!.table;
  const links = synergyLinks(table);
  const linked = (a: number, b: number) => links.some(([x, y]) => (x === a && y === b) || (x === b && y === a));
  const cells: HTMLElement[] = [];
  // 5×5 の格子：偶数の行と列がマス、そのあいだが線
  for (let gy = 0; gy < 5; gy++) {
    for (let gx = 0; gx < 5; gx++) {
      const sx = gx / 2;
      const sy = gy / 2;
      if (gx % 2 === 0 && gy % 2 === 0) {
        const slot = sy * 3 + sx;
        const b = table[slot];
        const isNew = !!b && !now.includes(b);
        const moved = !!b && now.includes(b) && now[slot] !== b;
        const n = b ? linksAt(table, slot) : 0;
        cells.push(
          h(
            'button.ke-slot',
            {
              type: 'button',
              class: `ke-slot ${b ? `is-filled is-${b}` : 'is-empty'} ${slot === CORE_SLOT ? 'is-core' : ''} ${isNew || moved ? 'is-planned' : ''}`,
              'aria-pressed': String(selected === slot),
              'aria-label': b ? t(`${businessName(b)}（線 ${n} 本）`, `${businessName(b)} (${n} links)`) : t('空いたマス', 'Empty slot'),
              onclick: () => onSlot(slot),
            },
            ...(b
              ? [
                  h('b.ke-slot-mark', { 'aria-hidden': 'true' }, t(BUSINESS[b].mark.ja, BUSINESS[b].mark.en)),
                  h('span.ke-slot-name', {}, businessName(b)),
                  b === 'store' ? h('span.ke-hint', {}, t(`${nationStoresOf(ctx.e)} 店`, `${nationStoresOf(ctx.e)} stores`)) : h('span.ke-figure', {}, `+${shortMoney(BUSINESS[b].profit * (1 + 0.25 * n))}`),
                  isNew ? h('span.ke-slot-badge', {}, t('置く予定', 'Planned')) : moved ? h('span.ke-slot-badge', {}, t('動かす', 'Move')) : null,
                ]
              : [svgIcon('plus', 20), h('span.ke-hint', {}, t('置く', 'Place'))]),
          ),
        );
      } else if (gx % 2 === 1 && gy % 2 === 0) {
        const a = sy * 3 + Math.floor(sx);
        cells.push(h('span', { class: `ke-link is-h ${linked(a, a + 1) ? 'is-on' : ''}`, 'aria-hidden': 'true' }));
      } else if (gx % 2 === 0 && gy % 2 === 1) {
        const a = Math.floor(sy) * 3 + sx;
        cells.push(h('span', { class: `ke-link is-v ${linked(a, a + 3) ? 'is-on' : ''}`, 'aria-hidden': 'true' }));
      } else cells.push(h('span.ke-link-gap', { 'aria-hidden': 'true' }));
    }
  }
  return h(
    'div.ke-table-wrap',
    {},
    h('div.ke-table', { role: 'group', 'aria-label': t('会議卓', 'Board table') }, ...cells),
    h('p.ke-table-sum', {}, t(`事業の利益 ${money(tableProfit(table))}／月・シナジーの線 ${links.length} 本`, `Business profit ${money(tableProfit(table))}/mo · ${links.length} synergy links`)),
  );
}

function nationStoresOf(e: EmpireState): number {
  return landsOf(e).reduce((a, x) => a + nationStores(x.nation), 0);
}

/** 置いたときに線がつながる相手（そのマスの隣の、相性のよいカード） */
function partnersAt(table: Table, slot: number, b: Business): Business[] {
  return NEIGHBORS.filter(([x, y]) => x === slot || y === slot)
    .map(([x, y]) => table[x === slot ? y : x])
    .filter((o): o is Business => synergizes(b, o));
}

/** 選んだマスのカード：空いていれば置けるカードの一覧、置いてあれば効き目・外す・動かす */
export function slotCard(ctx: Ctx, slot: number, moving: number | null, onMove: (from: number | null) => void): HTMLElement {
  const table = draftTable(ctx);
  const b = table[slot];
  const setTable = (next: Table, sound?: Parameters<Ctx['set']>[1]) => ctx.set((d) => ({ ...d, table: next.some((x, i) => x !== ctx.e.group!.table[i]) ? next : undefined }), sound);
  if (b === 'store') {
    return card(businessName(b), t('会社の本業', 'Your core business'), h('p.ke-note', {}, t(BUSINESS.store.note.ja, BUSINESS.store.note.en)), partnerHint(table, slot, b));
  }
  if (b) {
    const d = BUSINESS[b];
    const wasPlaced = ctx.e.group!.table.includes(b);
    return card(
      businessName(b),
      t(`線 ${linksAt(table, slot)} 本・利益 +${money(d.profit * (1 + 0.25 * linksAt(table, slot)))}／月`, `${linksAt(table, slot)} links · +${money(d.profit * (1 + 0.25 * linksAt(table, slot)))}/mo`),
      h('p.ke-note', {}, t(d.note.ja, d.note.en)),
      partnerHint(table, slot, b),
      h(
        'div.ke-actions',
        {},
        costButton(moving === slot ? t('動かすのをやめる', 'Cancel move') : t('別のマスへ動かす', 'Move to another slot'), null, () => onMove(moving === slot ? null : slot), { pressed: moving === slot }),
        costButton(
          wasPlaced ? t(`外す（${money(d.cost * SELL_BACK)} 戻る）`, `Remove (+${money(d.cost * SELL_BACK)})`) : t('置くのをやめる', 'Cancel'),
          null,
          () => setTable(table.map((x) => (x === b ? null : x))),
        ),
      ),
      moving === slot ? h('p.ke-hint', {}, t('空いたマスを押すと、そこへ動かします（無料）', 'Tap an empty slot to move it there (free)')) : null,
    );
  }
  // 空いたマス：置けるカード（線がつながるものを先に）
  const free = BUSINESSES.filter((x) => !table.includes(x)).sort((x, y) => partnersAt(table, slot, y).length - partnersAt(table, slot, x).length);
  return card(
    t('空いたマス', 'Empty slot'),
    t('業態カードを置く（隣と相性がよければ線がつながる）', 'Place a business (links form with good neighbors)'),
    free.length
      ? h(
          'ul.ke-biz-list',
          {},
          ...free.map((x) => {
            const d = BUSINESS[x];
            const p = partnersAt(table, slot, x);
            return h(
              'li.ke-biz',
              {},
              h('b.ke-slot-mark', { 'aria-hidden': 'true', class: `ke-slot-mark is-${x}` }, t(d.mark.ja, d.mark.en)),
              h(
                'span.ke-biz-body',
                {},
                h('b', {}, businessName(x)),
                h('span.ke-hint', {}, t(d.note.ja, d.note.en)),
                h('span.ke-hint', {}, t(`利益 +${money(d.profit)}／月`, `+${money(d.profit)}/mo`), p.length ? h('b.ke-good', {}, t(` ・線 ${p.length} 本（${p.map(businessName).join('・')}）`, ` · ${p.length} link(s)`)) : null),
              ),
              costButton(t('置く', 'Place'), d.cost, () => setTable(table.map((y, i) => (i === slot ? x : y)), 'build'), { disabled: lack(ctx, d.cost), primary: p.length > 0 }),
            );
          }),
        )
      : h('p.ke-note', {}, t('置けるカードはもうありません。', 'No businesses left to place.')),
  );
}

function partnerHint(table: Table, slot: number, b: Business): HTMLElement {
  const want = BUSINESSES.filter((x) => synergizes(b, x));
  const now = partnersAt(table, slot, b);
  return h('p.ke-hint', {}, t(`相性のよい業態：${want.map(businessName).join('・')}${now.length ? `（いま ${now.length} 本つながっています）` : ''}`, `Good neighbors: ${want.map(businessName).join(', ')}`));
}

/** 左の列：Legendary の番付（渡れる全ランド × 3 冠） */
export function legendPanel(e: EmpireState, onLand: (land: string) => void): HTMLElement {
  const lands = landsOf(e);
  const held = legendCrowns(e);
  return panel(
    'ke-legend',
    t('Legendary の番付', 'Legendary rankings'),
    h('span.ke-panel-sub', {}, t(`冠 ${held} / ${ENDING_CROWNS}（全部そろうとエンディング）`, `${held} / ${ENDING_CROWNS} crowns (all of them ends the game)`)),
    h(
      'ul.ke-crown-list',
      {},
      ...OPEN_LANDS.map((land) => {
        const l = lands.find((x) => x.land === land);
        const r = l?.nation.regions[legendIndex(l.nation)];
        const rec = e.group?.legend[land];
        return h(
          'li',
          {},
          h(
            'button.ke-legend-row',
            { type: 'button', disabled: !l, onclick: () => onLand(land) },
            h('span.ke-crown-name', {}, land),
            h(
              'span.ke-crowns-chip',
              { role: 'img', 'aria-label': CROWNS.map((c) => `${crownName(c)} ${rec?.held[c] ? '1' : '2'}`).join(' ') },
              ...CROWNS.map((c) => {
                const ic = svgIcon('crown', 16);
                ic.classList.add('ke-crown');
                if (rec?.held[c]) ic.classList.add('is-held');
                return ic;
              }),
            ),
            h('span.ke-hint', {}, r ? t(`区画 ${r.plots ?? 0}:${r.rivalPlots ?? r.rival}`, `plots ${r.plots ?? 0}:${r.rivalPlots ?? r.rival}`) : t('まだ渡っていません', 'Not entered')),
          ),
        );
      }),
    ),
  );
}

/** 地主会：ランドごとの Legendary の区画と、付け値 */
export function auctionCard(ctx: Ctx): HTMLElement {
  const { e, draft } = ctx;
  const g = e.group!;
  const now = e.month === g.nextAuction;
  const network = hasNetwork(e);
  const setBid = (land: string, bid: Bid | undefined) => ctx.set((d) => {
    const bids = { ...d.bids };
    if (bid && bid.plots > 0) bids[land] = bid;
    else delete bids[land];
    return { ...d, bids: Object.keys(bids).length ? bids : undefined };
  }, bid ? 'build' : undefined);
  return card(
    t('地主会（Legendary の区画の競り）', "Landowners' auction (Legendary plots)"),
    now ? t('今月が地主会です。欲しい区画の数と付け値を決めて、月を進めます', 'The auction is this month. Set plots and price, then advance') : t(`次は ${monthLabel(g.nextAuction)}（年に 1 度）`, `Next: ${monthLabel(g.nextAuction)} (once a year)`),
    h('p.ke-hint', {}, t(`1 回に ${AUCTION.offered} 区画まで。付け値の高いほうが先に取り、払うのは自分の付け値です。1 社が持てるのはエリアの区画の半分まで（当局の決まり）。`, `Up to ${AUCTION.offered} plots each time. The higher bid takes first and pays its own price. No company may hold over half the area's plots.`)),
    ...landsOf(e).map(({ land, nation }) => {
      const r = nation.regions[legendIndex(nation)];
      if (!r || r.locked) return null;
      const bid = draft.bids?.[land];
      const max = biddable(r);
      const rec = g.legend[land];
      const plots = bid?.plots ?? 0;
      const level = bid?.level ?? 'market';
      return h(
        'div.ke-field.ke-field-stack.ke-auction',
        {},
        h('span.ke-field-label', {}, t(`${land}・${r.name.ja}`, `${land} · ${r.name.en}`), h('span.ke-hint', {}, t(`自社 ${r.plots ?? 0}・ライバル ${r.rivalPlots ?? r.rival}・上限 ${plotCap(r)}（店 ${regionStores(r)}）`, `You ${r.plots ?? 0} · rival ${r.rivalPlots ?? r.rival} · cap ${plotCap(r)} (stores ${regionStores(r)})`))),
        rec?.rivalPrice ? h('span.ke-hint', {}, t(`前回のライバルの付け値：1 区画 ${money(rec.rivalPrice)}`, `Rival's last bid: ${money(rec.rivalPrice)} per plot`)) : null,
        network ? h('span.ke-hint.ke-good', {}, t(`団長の情報網：今回のライバルの付け値は 1 区画 ${money(Math.round(rivalBid(g, land)))}`, `The Chief's network: the rival bids ${money(Math.round(rivalBid(g, land)))} per plot this time`)) : null,
        now && max > 0
          ? h(
              'div.ke-auction-row',
              {},
              stepper(`${plots} / ${max}`, plots > 0 ? () => setBid(land, { plots: plots - 1, level }) : null, plots < max && ctx.fundsLeft() >= bidPrice(level) ? () => setBid(land, { plots: plots + 1, level }) : null, t('区画', 'plots')),
              segmented(t('付け値', 'Bid'), BID_LEVELS.map((v) => ({ value: v, text: `${bidLabel(v)} ${shortMoney(bidPrice(v))}` })), level, (v) => setBid(land, { plots: Math.max(plots, 1), level: v })),
            )
          : h('span.ke-hint', {}, max > 0 ? t(`この地主会では、あと ${max} 区画まで`, `Up to ${max} more plots at the auction`) : t('上限まで持っています', 'At the cap')),
        now && plots > 0 ? h('span.ke-figure', {}, t(`落札したら ${money(bidCost(e, { plots, level }))}`, `If won: ${money(bidCost(e, { plots, level }))}`)) : null,
        now && max > 0 && !plots ? costButton(t(`上限まで強気で（${max} 区画）`, `Bid high for all ${max}`), bidCost(e, { plots: max, level: 'high' }), () => setBid(land, { plots: max, level: 'high' }), { disabled: lack(ctx, bidCost(e, { plots: max, level: 'high' })) }) : null,
      );
    }),
  );
}

/** エンディング（財閥） */
export function endingCard(e: EmpireState, image: HTMLElement | null, onClose: () => void): HTMLElement {
  const g = e.group!;
  const years = Math.floor(e.month / 12);
  return h(
    'div.ke-card.ke-ending',
    { role: 'dialog', 'aria-label': t('エンディング', 'Ending') },
    h('div.ke-ending-face', {}, image),
    h('h2.ke-ending-title', {}, companyTitle({ ...e, phase: 5 })),
    h('p.ke-note', {}, t('1 軒のよろず屋から始めた商いは、渡れる全ランドの大市場で 3 冠をそろえ、世界に名の知れたグループになりました。', 'What began as one general store now holds all three crowns in every Legendary market. The group is known across the world.')),
    h(
      'div.ke-paper.is-wide',
      {},
      row(t('創業から', 'Since founding'), t(`${years} 年 ${e.month % 12} か月`, `${years} y ${e.month % 12} m`)),
      row(t('グループになってから', 'As a group'), t(`${(g.ended ?? e.month) - g.since} か月`, `${(g.ended ?? e.month) - g.since} months`)),
      row(t('店', 'Stores'), String(landsOf(e).reduce((a, x) => a + nationStores(x.nation), 0)), 'good'),
      row(t('会議卓の事業', 'Businesses'), String(g.table.filter((b) => b && b !== 'store').length)),
      row(t('Legendary の冠', 'Legendary crowns'), `${legendCrowns(e)} / ${ENDING_CROWNS}`, 'good'),
    ),
    h('p.ke-hint', {}, t('このまま経営を続けられます。冠を守り続けましょう。', 'You can keep running the company. Hold on to your crowns.')),
    h('button.ke-btn.ke-btn-primary', { type: 'button', onclick: onClose }, t('経営を続ける', 'Keep going')),
  );
}
