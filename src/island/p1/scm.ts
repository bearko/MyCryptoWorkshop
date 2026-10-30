/**
 * SCM ダッシュボード：① 調達 → ② 製造 → ③ 物流 → ④ 販売 の流れを、ヒーローとエクステの絵で見せる。
 * 段ごとに「ひと月に回せる数」を比べて、いちばん細いところ（ボトルネック）を目立たせ、
 * その場でヒーローの割り当て・スキル・雇う・建てる画面へ行けるようにする（docs/ISLAND_PHASE1.md「SCM ダッシュボード」）。
 */
import { t } from '../../i18n';
import { assetUrl } from '../../render/images';
import { DEF } from '../defs';
import { INVEST, MAT_KEYS, MATS, MARKET, PRODUCT, SKILL, SKILLS, TRANSPORT, skuPrice, type Mat, type Sku } from './data';
import { has, invest, skillLock, type PBuilding, jamOf, hasRoute, oneWay, shopArea, craftCheck, craftDays, learn, matDays, monthRevenue, myShops, myWorkshop, nextJam, poolCap, poolFree, poolUsed, sellInfo, speed, stageCaps, staffOf, storageCap, assign, whatIf, type GoodsWhy, type P1State, type SellInfo, type SellWhy, type Stage, type StageIf, type WhatIf } from './model';
import { pickHero, slot, TASK_NAME } from './heroui';
import { after, mineSay, mineTip, open, openAds, openBuy, openData, openHire, openShop, openStaff, openWorkshop, SHELF_TIP, type Ctx } from './screens';
import { openSkills } from './tree';
import { bar, btn, h, heroIcon, heroName, matIcon, money, rich, skuIcon, skuName } from './ui';

type Lamp = 'ok' | 'warn' | 'stop';
const LAMP_NAME: Record<Lamp, string> = { ok: t('順調', 'Running'), warn: t('注意', 'Watch'), stop: t('停止', 'Stopped') };
const STAGE: Record<Stage, { n: string; name: string; branch: string; what: string }> = {
  buy: { n: '①', name: t('調達', 'Buy'), branch: 'buy', what: t('素材', 'materials') },
  craft: { n: '②', name: t('製造', 'Craft'), branch: 'craft', what: t('作った', 'made') },
  haul: { n: '③', name: t('物流', 'Haul'), branch: 'logi', what: t('運んだ', 'hauled') },
  sell: { n: '④', name: t('販売', 'Sell'), branch: 'shop', what: t('売れた', 'sold') },
};

/** いま資金で取れる（資金だけが足りないものも含む）スキルか。外周・エンブレム・ブランド力・✨ のパネルは除く */
const canNow = (s: P1State, id: string) => {
  const k = SKILL[id];
  if (!k || k.dust) return false;
  const e = skillLock(s, k);
  return e === null || e === 'money';
};
/** まだ取れるスキル（先に要るものを取ってあるもの）を、その段の系統から 2 つ */
function nextSkills(s: P1State, branch: string) {
  return SKILLS.filter((k) => k.branch === branch && canNow(s, k.id)).slice(0, 2);
}

const ORDER: Stage[] = ['buy', 'craft', 'haul', 'sell'];

/** ダッシュボードの詰まり：月次報告（report.ts の reportJam）と同じ判定 */
export const scmJam = (s: P1State): Stage => jamOf(s);

/** 平均の単価：今月（無ければ先月）の売上 ÷ 売れた数。まだ売れていなければ、並べている・作っている商品の値段の平均 */
export function avgPrice(s: P1State): number {
  const units = Object.values(s.monthUnits).reduce<number>((a, n) => a + (n ?? 0), 0);
  const rev = Object.values(s.monthSales).reduce<number>((a, n) => a + (n ?? 0), 0);
  if (units > 0) return rev / units;
  const last = s.reports[s.reports.length - 1];
  if (last?.flow && last.flow.sold > 0) return last.revenue / last.flow.sold;
  const xs = [...myShops(s).flatMap((b) => s.shops[b.uid].shelves), ...s.slots.map((sl) => sl.sku)].filter((x): x is Sku => !!x);
  return xs.length ? xs.reduce((a, x) => a + skuPrice(x), 0) / xs.length : 0;
}

/**
 * 詰まりを太くしたときの見込み：次に細い段との差（個／月）× 平均の単価。
 * 止まっている段は 0 として数える。差が無ければ null
 */
export function jamGain(s: P1State, caps: ReturnType<typeof stageCaps>, bn: Stage): { n: number; g: number } | null {
  const cur = caps[bn].stopped ? 0 : caps[bn].perMonth;
  const others = ORDER.filter((k) => k !== bn && !caps[k].stopped).map((k) => caps[k].perMonth);
  if (!others.length) return null;
  const n = Math.round(Math.min(...others) - cur);
  if (n <= 0) return null;
  return { n, g: Math.round(n * avgPrice(s)) };
}

/** 「数字を上げるには」の 1 つ（buy：その場で設備を買う。short：資金が足りない） */
interface Up {
  label: string;
  sub: string;
  go: () => void;
  buy?: boolean;
  short?: boolean;
}

/** 段ごとの「人を置く」の名前 */
const PERSON_LABEL: Record<Exclude<Stage, 'sell'>, string> = {
  buy: t('調達係を置く', 'Assign a buyer'),
  craft: t('空いた作業台に職人を置く', 'Staff the free bench'),
  haul: t('運搬係をもう 1 人', 'One more hauler'),
};
/**
 * 段ごとの打ち手（whatIf）1 つを、ボタンに。見込み（+N 個／月）を先に出す。
 * 設備投資はその場で導入（チュートリアル中は出さない）、スキル・人はその画面へ。④ 販売は販売の内訳の打ち手と同じ
 */
export function moveUp(ctx: Ctx, s: P1State, w: StageIf): Up {
  const gain = t(`+${Math.round(w.units)} 個／月`, `+${Math.round(w.units)} / mo`);
  const m = w.move;
  switch (m.kind) {
    case 'invest': {
      const b = s.buildings.find((x) => x.uid === m.uid);
      const short = s.money < m.cost;
      return {
        label: m.id === 'bench' ? t(`${INVEST[m.id].name}（職人つき）`, `${INVEST[m.id].name} (staffed)`) : INVEST[m.id].name,
        sub: short ? t(`${gain}・あと ${money(m.cost - s.money)}`, `${gain} · ${money(m.cost - s.money)} short`) : t(`${gain}・設備投資 ${money(m.cost)}`, `${gain} · invest ${money(m.cost)}`),
        buy: true,
        short,
        go: () => {
          const e = invest(s, m.uid, m.id);
          if (e === 'money') {
            ctx.sfx?.('error');
            ctx.toast(t('資金が足りません', 'Not enough funds'));
          } else if (!e) {
            ctx.sfx?.('spend');
            ctx.toast(t(`「${INVEST[m.id].name}」を導入しました（${b ? DEF[b.id].name : ''}）`, `Installed: ${INVEST[m.id].name} (${b ? DEF[b.id].name : ''})`));
          }
          after(ctx);
          // 作業台を増やしたら、人を置く画面へ
          if (!e && m.id === 'bench') openWorkshop(ctx);
        },
      };
    }
    case 'skill':
      return { label: SKILL[m.id].name, sub: t(`${gain}・スキル ${money(m.cost)}`, `${gain} · skill ${money(m.cost)}`), go: () => openSkills(ctx, m.id) };
    case 'level':
      return { label: t(`${SKILL[m.id].name}を Lv${m.lv} に`, `${SKILL[m.id].name} to Lv${m.lv}`), sub: t(`${gain}・レベル上げ ${money(m.cost)}`, `${gain} · level up ${money(m.cost)}`), short: s.money < m.cost, go: () => openSkills(ctx, m.id) };
    case 'person': {
      const who = m.hire ? t(`雇う：${heroName(m.hero)}（月給 ${money(m.cost)}）`, `Hire ${heroName(m.hero)} (${money(m.cost)}/mo)`) : heroName(m.hero);
      const label = m.replace != null ? t(`${TASK_NAME[m.task]}の得意な人に替える`, `A better ${TASK_NAME[m.task]} hand`) : PERSON_LABEL[w.stage as Exclude<Stage, 'sell'>];
      return { label, sub: t(`${gain}・${who}`, `${gain} · ${who}`), go: () => (m.hire ? openHire(ctx) : openStaff(ctx)) };
    }
    case 'build': {
      const short = s.money < m.cost;
      return {
        label: t(`${DEF[m.id].name}を建てる`, `Build a ${DEF[m.id].name}`),
        sub: short ? t(`${gain}・あと ${money(m.cost - s.money)}`, `${gain} · ${money(m.cost - s.money)} short`) : t(`${gain}・建築 ${money(m.cost)}`, `${gain} · build ${money(m.cost)}`),
        short,
        go: () => ctx.build?.(m.id),
      };
    }
    case 'sell': {
      const u = whatIfUp(ctx, s, m.w);
      return { label: u.label, sub: gain, go: u.go };
    }
  }
}

/** その段の数字を上げる手：見込み（whatIf）の大きい順に（スマホ 2 つ・PC 3 つ）。チュートリアル中は設備投資を出さない */
function upsOf(ctx: Ctx, s: P1State, list: StageIf[]): Up[] {
  const n = innerWidth < 600 ? 2 : 3;
  const tut = !!ctx.step?.();
  return list
    .filter((w) => w.ok && !(tut && w.move.kind === 'invest'))
    .slice(0, n)
    .map((w) => moveUp(ctx, s, w));
}

// ---------------------------------------------------------------- ④ 販売の内訳（docs/ISLAND_PHASE1.md「販売の内訳」）

const pct = (v: number) => `${Math.round(v * 100)}%`;
const shopLabel = (s: P1State, b: PBuilding) => {
  const all = myShops(s).filter((x) => x.id === b.id);
  return all.length > 1 ? `${DEF[b.id].name} ${all.indexOf(b) + 1}` : DEF[b.id].name;
};
/** 打ち手の効き目：+N 個／月（≒ +M G） */
const gainText = (w: WhatIf) => {
  const n = Math.round(w.units);
  // 効かない手は小数 1 桁（+1.6 を「+2」と丸めて「効かない」と並べない）
  const d = Math.round(w.units * 10) / 10;
  if (!w.ok) return d < 0 ? t(`${d} 個／月（減る）`, `${d} / mo (fewer)`) : t(`+${Math.max(0, d)} 個／月（いまは効かない）`, `+${Math.max(0, d)} / mo (no effect now)`);
  return t(`+${n} 個／月（≒ +${money(w.yen)}）`, `+${n} / mo (≈ +${money(w.yen)})`);
};
/** 打ち手 1 つの名前・説明・行き先 */
function whatIfUp(ctx: Ctx, s: P1State, w: WhatIf): { label: string; sub: string; go: () => void } {
  const shop = w.uid != null ? s.buildings.find((b) => b.uid === w.uid) : undefined;
  const at = shop ? shopLabel(s, shop) : '';
  switch (w.kind) {
    case 'goods': {
      const name = PRODUCT[w.key ?? '']?.name ?? w.key ?? '';
      return {
        label: t(`別の商品「${name}」を並べる`, `Stock another item: ${name}`),
        sub: w.replace ? t(`${at}の「${skuName(w.replace)}」と入れ替え（市場データ）`, `Swap ${skuName(w.replace)} at ${at} (market data)`) : t(`${at}の空き棚に（市場データ）`, `On a free shelf at ${at} (market data)`),
        go: () => openData(ctx),
      };
    }
    case 'shelf': {
      const name = PRODUCT[w.key ?? '']?.name ?? w.key ?? '';
      return {
        label: t('棚 +1（別の商品を並べると売上が増える）', 'Shelf +1 (a new item adds sales)'),
        sub: t(`${at}の設備投資 ${money(w.cost ?? 0)}・「${name}」を並べる`, `Invest ${money(w.cost ?? 0)} at ${at}, stock ${name}`),
        go: () => {
          if (w.uid == null) return;
          const e = invest(s, w.uid, 'shelves');
          if (e === 'money') {
            ctx.sfx?.('error');
            ctx.toast(t('資金が足りません', 'Not enough funds'));
            return;
          }
          if (!e) {
            ctx.sfx?.('spend');
            ctx.toast(t(`「${INVEST.shelves.name}」を導入しました（${at}）`, `Installed: ${INVEST.shelves.name} (${at})`));
          }
          after(ctx);
          openShop(ctx, w.uid);
          if (!e) mineSay(ctx, SHELF_TIP());
        },
      };
    }
    case 'shop':
      return {
        label: myShops(s).length >= 2 ? t('次のお店を建てる', 'Build another shop') : t('2 軒目のお店を建てる', 'Build a 2nd shop'),
        sub: w.hot ? t('お客さんの多い区画に・売り場の人つき（建築）', 'In a busy block, staffed (build)') : t('まだ届いていない家の近くに・売り場の人つき（建築）', 'Near homes you don’t reach yet, staffed (build)'),
        go: () => ctx.build?.('general_store', w.at),
      };
    case 'pull':
      return { label: t('売り場の強さ +15%', 'Shop pull +15%'), sub: t('接客の研修・看板・ブランド力', 'Service training, signboards, brand'), go: () => openSkills(ctx, canNow(s, 'host') ? 'host' : 'shop') };
    case 'known':
      return { label: t('認知を 100% に', 'Make items fully known'), sub: t('宣伝（マーケ）', 'Advertising (marketing)'), go: () => openAds(ctx) };
    case 'part':
      return { label: t('アルバイト +1', 'One more part-timer'), sub: t(`${at}（お店の画面）`, `${at} (shop screen)`), go: () => w.uid != null && openShop(ctx, w.uid) };
    case 'fixtures':
      return { label: t('陳列の什器 +1', 'Display fixtures +1'), sub: t(`${at}（お店の設備投資）`, `${at} (shop investment)`), go: () => w.uid != null && openShop(ctx, w.uid) };
  }
}

const WHY_NAME: Record<SellWhy, string> = {
  capacity: t('お店の処理力（品出し）が足りない', 'Shops can’t shelve fast enough'),
  demand: t('並べている商品の需要が小さい／他社と取り合っている', 'Your items have little demand or are shared with rivals'),
  far: t('遠くて届かないお客さんが多い', 'Many customers live too far away'),
  known: t('新しい商品がまだ知られていない', 'Your new items aren’t known yet'),
  rival: t('他社の売り場が強い', 'Rival shops pull harder'),
};
const GOODS_WHY: Record<GoodsWhy, string> = {
  saturated: t('飽和', 'Saturated'),
  known: t('認知が低い', 'Little known'),
  far: t('遠い', 'Far'),
  rival: t('他社が強い', 'Rivals strong'),
  ok: t('取れている', 'Doing well'),
};

/** 頭打ちの理由の説明（数字つき）と、すぐの打ち手 */
function whyLine(ctx: Ctx, s: P1State, info: SellInfo, best: WhatIf | undefined): { text: string; act: [string, () => void] } {
  const demand = Math.round(info.goods.reduce((a, g) => a + g.demand, 0));
  switch (info.why) {
    case 'capacity': {
      const shop = myShops(s)[0];
      return {
        text: t(`需要からは月 ${Math.round(info.potential)} 個売れるのに、お店が棚に並べられるのは月 ${Math.round(info.capacity)} 個。品出しを速くすると、そのぶん売れます。`, `Demand allows ${Math.round(info.potential)} / mo, but your shops shelve only ${Math.round(info.capacity)} / mo. Faster shelving sells the difference.`),
        act: [t('お店を開く（アルバイト・陳列の什器）', 'Open the shop (part-timers, fixtures)'), () => shop && openShop(ctx, shop.uid)],
      };
    }
    case 'demand':
      return {
        text:
          info.satShare >= 0.5
            ? t(`並べている商品の需要の ${pct(info.satShare)} は、他社 2 社以上が扱う飽和した商品です（売り場の強さ ×${MARKET.saturated}）。棚やお店を増やしても伸びません。`, `${pct(info.satShare)} of your items’ demand is saturated by 2+ rivals (pull ×${MARKET.saturated}). More shelves or shops won’t help.`)
            : t(`並べている商品の需要 月 ${demand} 個のうち、もう ${pct(info.share)} を取れています。これより先は別の商品で。`, `You already take ${pct(info.share)} of your items’ ${demand} / mo demand. Grow with another item.`),
        act: [t('市場データで別の商品を探す', 'Find another item (market data)'), () => openData(ctx)],
      };
    case 'far':
      return {
        text: t(`お客さんの ${pct(info.far)} は、どのお店からも遠い（4 マス以上）家に住んでいます。同じ場所にお店を足しても、自社どうしで取り合うだけです。`, `${pct(info.far)} of customers live 4+ tiles from every shop. A shop next to yours only splits your own customers.`),
        act: [t('離れた区画に 2 軒目', 'A 2nd shop far away'), () => ctx.build?.('general_store', best?.kind === 'shop' ? best.at : undefined)],
      };
    case 'known':
      return {
        text: t(`並べている商品の認知は平均 ${pct(info.known)}。知られていないぶん、売り場の強さが下がっています。`, `Your items are ${pct(info.known)} known on average, which cuts your pull.`),
        act: [t('宣伝する', 'Advertise'), () => openAds(ctx)],
      };
    default:
      return {
        text: t(`自社の取り分は ${pct(info.share)}。同じ商品を売る他社の売り場のほうが強く、お客さんが流れています。`, `Your share is ${pct(info.share)}; rivals selling the same items pull harder.`),
        act: [t('売り場を強くする（スキル）', 'Stronger shops (skills)'), () => openSkills(ctx, canNow(s, 'host') ? 'host' : 'shop')],
      };
  }
}

/** 商品の「なぜ取れていないか」の 1 行 */
function goodsReason(s: P1State, g: SellInfo['goods'][number]): string {
  const rivals = s.rivals.filter((r) => (r.sells[g.key] ?? 0) > 0).length;
  switch (g.why) {
    case 'saturated':
      return t(`他社 ${rivals} 社が扱っていて飽和（売り場の強さ ×${MARKET.saturated}）。棚を増やしても伸びません。別の商品と入れ替えを。`, `${rivals} rivals sell it: saturated (pull ×${MARKET.saturated}). Swap it for another item.`);
    case 'known':
      return t(`まだ知られていません（認知 ${pct(g.known)}）。並べている日と宣伝で育ちます。`, `Not well known yet (${pct(g.known)}). It grows on shelves and with ads.`);
    case 'far':
      return t(`お客さんの ${pct(g.far)} が、この商品を並べているどのお店からも遠い。離れた家の近くのお店にも並べましょう。`, `${pct(g.far)} of customers are far from every shop stocking it. Stock it at a shop near them.`);
    case 'rival':
      return t(`他社 ${rivals} 社と取り合っています（取り分 ${pct(g.share)}）。看板・接客・ブランド力で売り場を強く。`, `Shared with ${rivals} rival(s) (share ${pct(g.share)}). Strengthen with signs, service and brand.`);
    default:
      return t(`よく取れています（取り分 ${pct(g.share)}）。伸ばすなら別の商品か、遠い家の近くに 2 軒目。`, `Doing well (${pct(g.share)}). To grow: another item, or a 2nd shop near far homes.`);
  }
}

/** ④ 販売の内訳（まとめ・打ち手の見込み・商品ごと・お店ごと）。販売が詰まりのときは開いた状態 */
function sellBreakdown(ctx: Ctx, s: P1State, info: SellInfo, ws: WhatIf[], openNow: boolean): HTMLDetailsElement {
  const box = h('details', 'isl-sellx');
  box.open = openNow;
  const sm = h('summary');
  sm.append(h('b', '', t('④ 販売の内訳', '④ Sales breakdown')), h('small', 'isl-dim', t('売れる数が頭打ちの理由と、効く打ち手', 'Why sales are capped, and what helps')));
  box.append(sm);

  // まとめの 1 行
  const okW = ws.filter((w) => w.ok);
  const why = whyLine(ctx, s, info, okW.find((w) => w.kind === 'shop') ?? ws.find((w) => w.kind === 'shop'));
  const head = h('div', `isl-sellx-why is-${info.why}`);
  const lead = h('p');
  lead.append(rich(t(`売れる数が頭打ちの理由：[[${WHY_NAME[info.why]}]]`, `Why sales are capped: [[${WHY_NAME[info.why]}]]`)));
  head.append(lead, h('small', '', why.text));
  const lim = h('div', 'isl-sellx-lim');
  const limRow = (label: string, n: number, on: boolean) => {
    const r = h('span', on ? 'is-on' : '');
    r.append(h('small', '', label), h('b', '', t(`${Math.round(n)} 個／月`, `${Math.round(n)} / mo`)));
    return r;
  };
  lim.append(limRow(t('需要から取れる数', 'From demand'), info.potential, info.why !== 'capacity'), h('span', 'isl-sellx-min', t('と', 'vs')), limRow(t('お店の処理力（品出し）', 'Shelving capacity'), info.capacity, info.why === 'capacity'), h('small', 'isl-dim', t('小さいほうが販売の数字', 'The smaller one is the Sell number')));
  // その理由の打ち手の見込み（見込みを先に出す。効かないときはそう言う）
  const KIND: Record<SellWhy, WhatIf['kind'][]> = { capacity: ['part', 'fixtures'], demand: ['goods', 'shelf'], far: ['shop'], known: ['known'], rival: ['pull'] };
  const mineW = ws.filter((w) => KIND[info.why].includes(w.kind)).sort((a, b) => b.units - a.units)[0];
  const act = h('div', 'isl-sellx-act');
  act.append(btn(why.act[0], why.act[1], 'is-on'));
  if (mineW) {
    const best = okW[0];
    const note = mineW.ok
      ? t(`見込み ${gainText(mineW)}`, `Expected ${gainText(mineW)}`)
      : best
        ? t(`見込みは ${gainText(mineW)}。いまいちばん効くのは「${whatIfUp(ctx, s, best).label}」（+${Math.round(best.units)} 個／月）`, `Expected ${gainText(mineW)}. Best now: ${whatIfUp(ctx, s, best).label} (+${Math.round(best.units)} / mo)`)
        : t(`見込みは ${gainText(mineW)}`, `Expected ${gainText(mineW)}`);
    act.append(h('small', mineW.ok ? 'isl-good' : 'isl-dim', note));
  }
  head.append(lim, act);
  box.append(head);

  // 打ち手ごとの見込み（効き目の大きい順に 3 つ）
  box.append(h('h4', '', t('打ち手ごとの見込み', 'What each move would add')));
  const list = h('div', 'isl-sellx-ifs');
  const row = (w: WhatIf, k: number | null) => {
    const u = whatIfUp(ctx, s, w);
    const b = h('button', `isl-sellx-if ${w.ok ? '' : 'is-off'}`);
    b.type = 'button';
    const left = h('span');
    left.append(h('b', '', u.label), h('small', '', u.sub));
    b.append(h('span', 'isl-sellx-rank', k != null ? `${k + 1}` : '–'), left, h('span', w.ok ? 'isl-sellx-gain' : 'isl-sellx-gain is-off', gainText(w)));
    b.addEventListener('click', () => u.go());
    return b;
  };
  okW.slice(0, 3).forEach((w, k) => list.append(row(w, k)));
  if (!okW.length) list.append(h('p', 'isl-dim', t('いまの候補では、どれも +2 個／月に届きません。まずは月が進むのを待つか、下の表で商品とお店を見直しましょう。', 'No move adds 2+ / mo right now. Check the items and shops below.')));
  box.append(list);
  const off = [...okW.slice(3), ...ws.filter((w) => !w.ok)];
  if (off.length) {
    const more = h('details', 'isl-sellx-more');
    more.append(h('summary', '', t(`ほかの手（いまはあまり効かない ${off.length}）`, `Other moves (little effect now: ${off.length})`)));
    for (const w of off) more.append(row(w, null));
    box.append(more);
  }

  // 商品ごとの表
  box.append(h('h4', '', t('商品ごと（並べている商品）', 'By item (on your shelves)')));
  const gt = h('div', 'isl-sellx-scroll');
  const table = h('table', 'isl-sellx-table');
  const thead = h('tr');
  for (const x of [t('商品', 'Item'), t('エリアの需要／月', 'Area demand / mo'), t('自社の取り分', 'Your share'), t('他社', 'Rivals'), t('認知', 'Known'), t('いま売れる見込み／月', 'Expected now / mo')]) thead.append(h('th', '', x));
  table.append(thead);
  for (const g of info.goods) {
    const tr = h('tr', 'is-tap');
    const units = h('td');
    units.append(h('b', '', t(`${Math.round(g.units)} 個`, `${Math.round(g.units)}`)));
    const name = h('td');
    const nm = h('span', 'isl-row');
    nm.append(skuIcon(g.x, 24), h('b', '', PRODUCT[g.key]?.name ?? g.key));
    name.append(nm, h('small', g.why === 'ok' ? 'isl-good' : 'isl-warn', `▸ ${GOODS_WHY[g.why]}`));
    const share = h('td', g.share < 0.3 ? 'isl-bad' : 'isl-good', pct(g.share));
    const riv = h('td', g.saturated ? 'isl-bad' : '', g.sellers ? (g.saturated ? t(`${g.sellers} 社（飽和）`, `${g.sellers} (saturated)`) : t(`${g.sellers} 社`, `${g.sellers}`)) : t('なし', 'None'));
    tr.append(name, h('td', '', t(`${Math.round(g.demand)} 個`, `${Math.round(g.demand)}`)), share, riv, h('td', g.known < 0.7 ? 'isl-warn' : '', pct(g.known)), units);
    const why2 = h('tr', 'isl-sellx-reason');
    why2.hidden = true;
    const td = h('td');
    td.append(h('div', 'isl-sellx-reason-in', goodsReason(s, g)));
    td.colSpan = 6;
    why2.append(td);
    tr.addEventListener('click', () => {
      why2.hidden = !why2.hidden;
      tr.classList.toggle('is-open', !why2.hidden);
    });
    table.append(tr, why2);
  }
  gt.append(table);
  box.append(gt, h('small', 'isl-dim isl-sellx-note', t('行を押すと、その商品が取れていない理由。取り分 30% 未満は赤。', 'Tap a row for why. Shares under 30% are red.')));

  // お店ごとの表
  box.append(h('h4', '', t('お店ごと', 'By shop')));
  const st = h('div', 'isl-sellx-scroll');
  const t2 = h('table', 'isl-sellx-table');
  const h2 = h('tr');
  for (const x of [t('お店', 'Shop'), t('商圏の家（届く需要の割合）', 'Homes in reach (share of demand)'), t('自社の重なり', 'Overlap with own shops'), t('他社の近さ', 'Nearest rival'), t('並べている商品', 'Items')]) h2.append(h('th', '', x));
  t2.append(h2);
  for (const r of info.shops) {
    const tr = h('tr', 'is-tap');
    const ov = h('td', r.overlap >= 0.5 ? 'isl-bad' : '');
    ov.append(h('b', '', pct(r.overlap)));
    if (r.overlap >= 0.5) ov.append(h('small', 'isl-bad', t('2 軒目の意味が薄い', 'Little gain from this shop')));
    const goods = h('td');
    const gs = h('span', 'isl-row');
    for (const x of r.goods) gs.append(skuIcon(x, 22));
    goods.append(gs);
    tr.append(
      h('td', '', shopLabel(s, r.b)),
      h('td', '', t(`${r.homes} 軒（${pct(r.reach)}）`, `${r.homes} (${pct(r.reach)})`)),
      ov,
      h('td', r.rivals ? 'isl-warn' : '', r.rivalDist == null ? t('なし', 'None') : r.rivals ? t(`近くに ${r.rivals} 社（${r.rivalDist} マス）`, `${r.rivals} nearby (${r.rivalDist} tiles)`) : t(`${r.rivalDist} マス先`, `${r.rivalDist} tiles away`)),
      goods,
    );
    tr.addEventListener('click', () => openShop(ctx, r.b.uid));
    t2.append(tr);
  }
  st.append(t2);
  box.append(st, h('small', 'isl-dim isl-sellx-note', t('家ごとに、自社は「いちばん来やすいお店 1 軒」ぶんしか売れません。重なりが大きいお店どうしは、同じお客さんを取り合っています。', 'Each home buys from only your single most convenient shop. Shops with big overlap split the same customers.')));
  return box;
}

function lampEl(l: Lamp): HTMLElement {
  return h('span', `isl-lamp is-${l}`, LAMP_NAME[l]);
}

const sumOf = (o: Partial<Record<string, number>>) => Object.values(o).reduce<number>((a, n) => a + (n ?? 0), 0);

/** SCM ダッシュボード。breakdown：④ 販売の内訳を開いた状態にして、そこまで送る（販売管理の「販売の内訳」から） */
export function openSupply(ctx: Ctx, opt: { breakdown?: boolean } = {}) {
  let toBreakdown = !!opt.breakdown;
  open(ctx, t('SCM ダッシュボード', 'SCM dashboard'), (body) => {
    const s = ctx.s();
    mineTip(ctx, 'scm', body);
    const caps = stageCaps(s);
    const ws = myWorkshop(s);
    const shops = myShops(s);
    const buyer = s.staff.find((x) => x.task === 'buy');
    const haulers = s.staff.filter((x) => x.task === 'transport');
    const stock = sumOf(s.stock);

    // ---------------------------------------------------------------- 段ごとの状態と課題
    const issues: Record<Stage, { lamp: Lamp; lines: string[]; acts: [string, () => void, string?][] }> = {
      buy: { lamp: 'ok', lines: [], acts: [[t('調達を開く', 'Open buying'), () => openBuy(ctx), 'is-on']] },
      craft: { lamp: 'ok', lines: [], acts: [[t('工房を開く', 'Open workshop'), () => openWorkshop(ctx), 'is-on']] },
      haul: { lamp: 'ok', lines: [], acts: [[t('ヒーローの配置', 'Assign heroes'), () => openStaff(ctx), 'is-on']] },
      sell: { lamp: 'ok', lines: [], acts: [] },
    };
    const worse = (k: Stage, l: Lamp, line: string) => {
      const order: Lamp[] = ['ok', 'warn', 'stop'];
      if (order.indexOf(l) > order.indexOf(issues[k].lamp)) issues[k].lamp = l;
      issues[k].lines.push(line);
    };
    // ① 調達
    const days = matDays(s);
    if (!buyer) {
      worse('buy', caps.buy.stopped ? 'stop' : 'warn', t('調達係がいないので、素材は手で買っています。ヒーローを雇って調達係にすると自動になります。', 'No buyer: you buy by hand. Hire a hero as buyer to automate it.'));
      issues.buy.acts.push([t('人材登用', 'Recruit'), () => openHire(ctx)]);
    } else if (buyer.resting) worse('buy', 'warn', t('調達係が休憩中です。', 'The buyer is resting.'));
    const tripLeft = s.buyTrip ? Math.max(1, Math.ceil(s.buyTrip.left)) : null;
    if (days != null && days < 4) {
      if (tripLeft != null) worse('buy', 'warn', t(`素材が残り少なめ。調達係があと ${tripLeft} 日で買い付けから戻ります。`, `Materials are low; the buyer returns in ${tripLeft} d.`));
      else worse('buy', days < 1 ? 'stop' : 'warn', t(`素材があと約 ${Math.max(0, Math.floor(days))} 日ぶんしかありません。`, `Only ~${Math.max(0, Math.floor(days))} days of materials left.`));
    }
    if (poolFree(s) <= 2) {
      worse('buy', 'stop', t('置き場所がいっぱいで、これ以上買えません。倉庫を建てましょう。', 'Storage is full; build a warehouse to buy more.'));
      issues.buy.acts.push([t('倉庫を建てる', 'Build a warehouse'), () => ctx.build?.('warehouse')]);
    }
    // ② 製造
    if (!ws) worse('craft', 'stop', t('工房がありません。', 'No workshop yet.'));
    s.slots.forEach((sl, k) => {
      const st = sl.worker != null ? staffOf(s, sl.worker) : null;
      if (!st) worse('craft', 'stop', t(`作業台 ${k + 1} に職人がいません。`, `Bench ${k + 1} has no crafter.`));
      else if (!sl.sku) worse('craft', 'stop', t(`作業台 ${k + 1} で作るものが決まっていません。`, `Bench ${k + 1} has nothing to make.`));
      else if (st.resting) worse('craft', 'warn', t(`作業台 ${k + 1} の職人が休憩中です。`, `Bench ${k + 1}'s crafter is resting.`));
      else if (!sl.running) {
        const e = craftCheck(s, sl.sku, sl.worker);
        if (e === 'mats')
          worse(
            'craft',
            tripLeft != null ? 'warn' : 'stop',
            tripLeft != null ? t(`作業台 ${k + 1}：素材待ち（調達係があと ${tripLeft} 日で戻ります）。`, `Bench ${k + 1}: waiting for materials (buyer back in ${tripLeft} d).`) : t(`作業台 ${k + 1}：素材が足りません。`, `Bench ${k + 1}: not enough materials.`),
          );
        else if (e === 'full') worse('craft', 'stop', t(`作業台 ${k + 1}：置き場所がいっぱいです。`, `Bench ${k + 1}: storage is full.`));
      }
    });
    // 作っているのに、どのお店にも並べていない
    for (const x of new Set(s.slots.map((y) => y.sku).filter((y): y is Sku => !!y)))
      if (shops.length && !shops.some((b) => s.shops[b.uid].shelves.includes(x))) worse('craft', 'warn', t(`「${skuName(x)}」を並べているお店がありません。`, `No shop sells ${skuName(x)}.`));
    // ③ 物流
    if (!haulers.length && shops.length) worse('haul', 'stop', t('物流の担当がいないので、商品がお店に届きません。', 'No hauler: goods never reach the shops.'));
    else if (haulers.every((x) => x.resting) && haulers.length) worse('haul', 'warn', t('運搬係が全員休憩中です。', 'All haulers are resting.'));
    if (stock > TRANSPORT.cap * 2) worse('haul', 'warn', t(`工房に運ぶ前の商品が ${stock} 個たまっています。`, `${stock} goods are waiting at the workshop.`));
    // 工房から遠いお店：運ぶのに日数がかかる（物流拠点・トラックで縮む）
    for (const b of shops) {
      const way = oneWay(s, b);
      if (way.days > 2.5) {
        worse('haul', 'warn', t(`${DEF[b.id].name}は工房から遠く、片道 ${way.days.toFixed(1)} 日かかります。`, `${DEF[b.id].name} is far: ${way.days.toFixed(1)} days one way.`));
        if (!issues.haul.acts.some((a) => a[2] === 'hub')) issues.haul.acts.push(has(s, 'hub') ? [t('物流拠点を建てる', 'Build a hub'), () => ctx.build?.('logistics'), 'hub'] : [t('物流拠点を調べる', 'About hubs'), () => openSkills(ctx, 'logi'), 'hub']);
      }
    }
    // ④ 販売
    if (!shops.length) {
      worse('sell', 'stop', t('お店がありません。', 'No shop yet.'));
      issues.sell.acts.push([t('お店を建てる', 'Build a shop'), () => ctx.build?.('general_store'), 'is-on']);
    }
    for (const b of shops) {
      const sh = s.shops[b.uid];
      const st = sh.staff != null ? staffOf(s, sh.staff) : null;
      const name = DEF[b.id].name;
      if (!sh.shelves[0]) worse('sell', 'stop', t(`${name}：並べる商品が決まっていません。`, `${name}: no product chosen.`));
      if (!st && sh.part === 0) worse('sell', 'stop', t(`${name}：売り場に人がいません。`, `${name}: nobody on the floor.`));
      else if (st?.resting && sh.part === 0) worse('sell', 'warn', t(`${name}：店員が休憩中です。`, `${name}: the clerk is resting.`));
      const main = sh.shelves[0];
      const making = s.slots.map((y) => y.sku).filter((y): y is Sku => !!y);
      if (main && !making.includes(main) && (sh.shelf[main] ?? 0) <= 0 && (sh.storage[main] ?? 0) <= 0 && !(s.stock[main] ?? 0))
        worse('sell', 'stop', t(`${name}：「${skuName(main)}」は工房で作っていません。作っているものを並べましょう。`, `${name}: ${skuName(main)} isn't being crafted. Shelve what you make.`));
      else if (main && (sh.shelf[main] ?? 0) <= 0 && (sh.storage[main] ?? 0) <= 0) worse('sell', 'warn', t(`${name}：主力商品が品切れです。`, `${name}: the main product is sold out.`));
      if ((sh.aw ?? 1) < 0.7) worse('sell', 'warn', t(`${name}：まだ知られていません（認知度 ${Math.round((sh.aw ?? 1) * 100)}%）。宣伝すると早く広まります。`, `${name}: not well known yet (${Math.round((sh.aw ?? 1) * 100)}%). Ads help.`));
    }
    if (shops.length) issues.sell.acts.push([t('お店を開く', 'Open shop'), () => openShop(ctx, shops[0].uid), 'is-on'], [t('宣伝広報', 'Advertising'), () => openAds(ctx)]);

    // 詰まり：月次報告と同じ判定（ひと月に流せる数がいちばん少ない段。jamOf）。段のランプ（停止・注意）は状態の表示だけ
    const bn = scmJam(s);

    // ---------------------------------------------------------------- 見出し：ボトルネック
    const top = h('div', `isl-scm-head is-${issues[bn].lamp}`);
    const mine = h('img', 'isl-scm-mine');
    mine.src = assetUrl('mch/Image/Characters/navi_ain_speak_00_talk.png');
    mine.alt = '';
    const words = h('div');
    words.append(
      h('small', '', t('いまの詰まり（ボトルネック）', 'Current jam (bottleneck)')),
      h('b', 'isl-scm-bn', `${STAGE[bn].n} ${STAGE[bn].name}`),
      h('p', '', issues[bn].lines[0] ?? t('いちばん細いところです。ここを太くすると、サイクル全体の売上が伸びます。', 'This is the narrowest stage. Widen it and the whole cycle sells more.')),
    );
    const kpi = h('div', 'isl-scm-kpi');
    const last = s.reports[s.reports.length - 1];
    kpi.append(h('span', '', t(`今月の売上 ${money(monthRevenue(s))}`, `This month ${money(monthRevenue(s))}`)), h('span', '', last ? t(`エリア ${last.rank} 位`, `Area #${last.rank}`) : t('エリア順位：締めのあと', 'Area rank: after close')));
    top.append(mine, words, kpi);
    body.append(top);

    // ---------------------------------------------------------------- 数字の見方（スマホでは折りたたみ）
    const how = h('details', 'isl-scm-how');
    if (innerWidth >= 600) how.open = true;
    const howP = h('p');
    howP.append(
      rich(
        t(
          '4 つの段を商品が流れます。数字は[[その段がひと月に流せる商品の数]]です。数字は大きいほどよく、[[いちばん小さい段が詰まり]]（赤）。詰まりの段より多くは売れないので、そこを太くするのが近道。全部をそろえる必要はなく、詰まりを順に直していきます。',
          'Goods flow through four stages. Each number is [[how many products that stage can move per month]]. Bigger is better; [[the smallest stage is the jam]] (red). You can’t sell more than the jam allows, so widen it first. No need to even out everything — fix the jams one by one.',
        ),
      ),
    );
    const howSell = h('p');
    howSell.append(
      rich(
        t(
          '④ 販売は「並べている商品の需要のうち自社が取れる数」（とお店の品出しの速さの小さいほう）。棚やお店を増やしただけでは増えず、[[別の商品・遠い家の近くの 2 軒目・売り場の強さ・認知]]で増えます。',
          '④ Sell is how much of your items’ demand you can take (or how fast shops shelve, whichever is smaller). More shelves or shops alone won’t raise it; [[another item, a 2nd shop near far homes, stronger shops, or awareness]] will.',
        ),
      ),
    );
    how.append(h('summary', '', t('数字の見方', 'How to read the numbers')), howP, howSell);
    body.append(how);

    // ---------------------------------------------------------------- 4 つの段：ひと月に流せる数・数字を上げるには
    const sum = h('div', 'isl-scm-sum');
    const max = Math.max(1, ...ORDER.map((k) => caps[k].perMonth));
    const gain = jamGain(s, caps, bn);
    // ④ 販売の内訳と打ち手の見込み（お店があるときだけ）。ほかの段も、打ち手ごとの見込み（whatIf）
    const sInfo = shops.length ? sellInfo(s) : null;
    const moves: Record<Stage, StageIf[]> = { buy: whatIf(s, 'buy'), craft: whatIf(s, 'craft'), haul: whatIf(s, 'haul'), sell: sInfo ? whatIf(s, 'sell') : [] };
    const ifs: WhatIf[] = moves.sell.map((w) => (w.move.kind === 'sell' ? w.move.w : null)).filter((w): w is WhatIf => !!w);
    let sellBox: HTMLDetailsElement | null = null;
    // 見込みのある手が無いときの行き先（④ 販売は内訳、ほかはその段の画面）
    const fallback: Record<Stage, Up> = {
      buy: { label: t('調達を開く', 'Open buying'), sub: t('いま効く手が見つからない', 'No move helps right now'), go: () => openBuy(ctx) },
      craft: { label: t('工房を開く', 'Open workshop'), sub: t('いま効く手が見つからない', 'No move helps right now'), go: () => openWorkshop(ctx) },
      haul: { label: t('スキルツリーで見る', 'Open skill tree'), sub: t('いま効く手が見つからない', 'No move helps right now'), go: () => openSkills(ctx, 'logi') },
      sell: {
        label: t('販売の内訳を見る', 'Sales breakdown'),
        sub: t('なぜ頭打ちか', 'Why it’s capped'),
        go: () => {
          if (!sellBox) return;
          sellBox.open = true;
          sellBox.scrollIntoView({ behavior: 'smooth', block: 'start' });
        },
      },
    };
    ORDER.forEach((k, i) => {
      if (i) sum.append(h('span', 'isl-scm-sum-arrow', '▶'));
      const c = h('div', `isl-scm-sumcard ${k === bn ? 'is-bn' : ''}`);
      const head = h('div', 'isl-scm-sumhead');
      head.append(h('b', '', `${STAGE[k].n} ${STAGE[k].name}`));
      if (k === bn) head.append(h('span', 'isl-scm-jam', t('詰まり', 'Jam')));
      c.append(head);
      c.append(h('small', 'isl-scm-sumlabel', t('ひと月に流せる数（個）', 'Per month (pcs)')));
      c.append(h('b', `isl-scm-sumnum ${caps[k].stopped ? 'is-stop' : ''}`, caps[k].stopped ? t('止まっている', 'Stopped') : `${caps[k].perMonth}`));
      c.append(bar(caps[k].stopped ? 0 : caps[k].perMonth / max, k === bn ? 'var(--isl-bad)' : issues[k].lamp === 'warn' ? 'var(--isl-gold)' : 'var(--isl-good)'));
      if (k === bn && gain) {
        const g = h('small', 'isl-scm-gain');
        g.append(
          h('span', 'is-long', t(`ここを太くすると、売上は最大で +${gain.n} 個／月（≒ +${money(gain.g)}）`, `Widen this: up to +${gain.n} sold / mo (≈ +${money(gain.g)})`)),
          h('span', 'is-short', t(`太くすると最大 +${gain.n} 個／月（≒ +${money(gain.g)}）`, `Up to +${gain.n} / mo (≈ +${money(gain.g)})`)),
        );
        c.append(g);
      }
      const ups = upsOf(ctx, s, moves[k]);
      if (!ups.length && (k !== 'sell' || sInfo)) ups.push(fallback[k]);
      if (ups.length) {
        const box = h('div', 'isl-scm-ups');
        const cap = h('small', 'isl-dim');
        cap.append(h('span', 'is-long', t('数字を上げるには', 'To raise it')), h('span', 'is-short', t('上げるには', 'Raise')));
        box.append(cap);
        for (const u of ups) {
          const b = h('button', `isl-scm-up ${u.buy ? 'is-buy' : ''}`);
          b.type = 'button';
          b.append(h('b', '', u.label), h('small', u.short ? 'isl-bad' : '', u.sub));
          if (u.short) b.classList.add('is-poor');
          b.addEventListener('click', (e) => {
            e.stopPropagation();
            u.go();
          });
          box.append(b);
        }
        c.append(box);
      }
      c.addEventListener('click', () => cards[k]?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
      sum.append(c);
    });
    body.append(sum);
    // 次に細くなる段：いまの詰まりを 30% 太くしたら、次はどこが詰まるか
    const nx = nextJam(s, caps);
    const nextEl = h('p', `isl-scm-next ${nx.same ? 'is-same' : ''}`);
    nextEl.append(
      rich(
        caps[bn].stopped
          ? t(`[[${STAGE[bn].n} ${STAGE[bn].name}]]を動かすと、次は[[${STAGE[nx.next].n} ${STAGE[nx.next].name}]]（${nx.n} 個／月）が詰まります。`, `Get [[${STAGE[bn].n} ${STAGE[bn].name}]] moving and [[${STAGE[nx.next].n} ${STAGE[nx.next].name}]] (${nx.n} / mo) jams next.`)
          : nx.same
            ? t(`[[${STAGE[bn].n} ${STAGE[bn].name}]]は、30% 太くしてもまだ詰まりです。思い切って太くしよう。`, `Even 30% wider, [[${STAGE[bn].n} ${STAGE[bn].name}]] is still the jam. Widen it boldly.`)
            : t(`ここ（${STAGE[bn].n}）を太くすると、次は[[${STAGE[nx.next].n} ${STAGE[nx.next].name}]]（${nx.n} 個／月）が詰まります。`, `Widen this (${STAGE[bn].n}) and [[${STAGE[nx.next].n} ${STAGE[nx.next].name}]] (${nx.n} / mo) jams next.`),
      ),
    );
    body.append(nextEl);
    if (sInfo) {
      sellBox = sellBreakdown(ctx, s, sInfo, ifs, bn === 'sell' || toBreakdown);
      body.append(sellBox);
      if (toBreakdown) {
        toBreakdown = false;
        const box = sellBox;
        requestAnimationFrame(() => box.scrollIntoView({ block: 'start' }));
      }
    }

    // ---------------------------------------------------------------- 流れ：4 つの段
    const flow = h('div', 'isl-scm');
    const made = s.ws.made;
    const hauled = s.ws.hauled ?? 0;
    const sold = sumOf(s.monthUnits);
    const pipe = (label: string, n: number) => {
      const p = h('div', 'isl-scm-pipe');
      p.append(h('span', 'isl-scm-arrow', '▶'), h('b', '', `${n}`), h('small', '', t(`今月${label}`, `${label} this month`)));
      return p;
    };
    const cards: Partial<Record<Stage, HTMLElement>> = {};
    const card = (k: Stage, heroes: HTMLElement[], visual: HTMLElement[]) => {
      const c = h('div', `isl-scm-stage is-${issues[k].lamp} ${k === bn ? 'is-bn' : ''}`);
      cards[k] = c;
      const head = h('div', 'isl-scm-stage-head');
      head.append(h('span', 'isl-lane-n', STAGE[k].n), h('h3', '', STAGE[k].name), lampEl(issues[k].lamp));
      c.append(head);
      const main = h('div', 'isl-scm-main');
      const hs = h('div', 'isl-slots is-small');
      hs.append(...heroes);
      const vis = h('div', 'isl-scm-vis');
      vis.append(...visual);
      main.append(hs, vis);
      c.append(main);
      for (const line of issues[k].lines.slice(0, 3)) c.append(h('p', issues[k].lamp === 'stop' ? 'isl-scm-issue is-stop' : 'isl-scm-issue', line));
      const acts = h('div', 'isl-row');
      for (const [label, go, cls] of issues[k].acts) acts.append(btn(label, go, cls));
      c.append(acts);
      // その段を太くするスキル：その場で習得できる
      const sks = k === bn ? nextSkills(s, STAGE[k].branch) : [];
      const box = h('div', 'isl-scm-skills');
      if (sks.length) box.append(h('small', 'isl-dim', t('詰まりを太くするスキル', 'Skills to widen the jam')));
      for (const sk of sks) {
        const b = h('button', 'isl-scm-skill');
        b.type = 'button';
        b.append(h('b', '', sk.name), h('small', '', sk.note), h('span', 'isl-gold', money(sk.cost)));
        b.disabled = s.money < sk.cost;
        b.addEventListener('click', () => {
          const e = learn(s, sk.id);
          if (e === 'money') ctx.toast(t('資金が足りません', 'Not enough funds'));
          else if (!e) ctx.toast(t(`「${sk.name}」を習得しました`, `Learned: ${sk.name}`));
          after(ctx);
        });
        box.append(b);
      }
      box.append(btn(t('スキルツリーで見る', 'Open skill tree'), () => openSkills(ctx, STAGE[k].branch)));
      c.append(box);
      return c;
    };
    const assignSlot = (label: string, task: 'buy' | 'craft' | 'transport' | 'shop', hero: number | null, target: number | null) =>
      slot(s, {
        label,
        task,
        hero,
        onTap: () =>
          pickHero(ctx.root, s, {
            title: t(`${label}（${TASK_NAME[task]}）`, `${label} (${TASK_NAME[task]})`),
            task,
            current: hero,
            onPick: (v) => {
              if (task === 'buy') for (const x of s.staff) if (x.task === 'buy' && x.hero !== v) assign(s, x.hero, null);
              if (v == null) {
                if (hero != null) assign(s, hero, null);
              } else {
                if (task === 'transport' && hero != null && hero !== v) assign(s, hero, null);
                assign(s, v, task, target);
              }
              after(ctx);
            },
          }),
      });

    // ① 調達：素材の在庫・置き場所・調達係の往復
    const mats = h('div', 'isl-stock');
    mats.append(h('small', 'isl-scm-cap', t('素材の在庫', 'Materials')));
    for (const m of MAT_KEYS) {
      if (!hasRoute(s, m) && !(s.mats[m] ?? 0)) continue;
      const c = h('span', `isl-chip ${(s.mats[m] ?? 0) < 6 ? 'is-bad' : ''}`);
      c.append(matIcon(m as Mat, 22), h('small', '', `${s.mats[m] ?? 0}`));
      mats.append(c);
    }
    const storage = h('div', 'isl-field');
    storage.append(h('span', '', t('置き場所', 'Storage')), bar(poolUsed(s) / poolCap(s), poolFree(s) <= 2 ? 'var(--isl-bad)' : 'var(--isl-good)'), h('small', 'isl-dim', `${poolUsed(s)} / ${poolCap(s)}`));
    const trip = h('div', 'isl-scm-trip');
    const tr = s.buyTrip;
    const k = tr ? (tr.total - tr.left) / tr.total : 0;
    const track = h('div', 'isl-trip-track');
    track.append(h('span', 'isl-trip-end', t('工房', 'Workshop')), h('span', 'isl-trip-end is-right', t('卸問屋', 'Wholesaler')));
    if (tr) {
      const who = h('span', 'isl-trip-who');
      who.style.left = `${(k < 0.5 ? k * 2 : (1 - k) * 2) * 100}%`;
      who.append(heroIcon(tr.hero, 28));
      track.append(who);
    }
    const cargo = tr ? Object.entries(tr.cargo).map(([m, n]) => `${MATS[m as Mat].name}×${n}`).join(t('・', ', ')) : '';
    trip.append(track, h('small', 'isl-dim', tr ? t(`買い付け中：あと ${Math.max(1, Math.ceil(tr.left))} 日で ${cargo} が届く`, `On a trip: ${cargo} arrives in ${Math.max(1, Math.ceil(tr.left))} d`) : buyer ? t('工房で次の買い付けを待っています', 'Waiting at the workshop') : t('調達係がいません', 'No buyer')));
    flow.append(card('buy', [assignSlot(t('調達係', 'Buyer'), 'buy', buyer?.hero ?? null, null)], [mats, storage, trip]));
    flow.append(pipe(STAGE.buy.what, s.proc.bought));

    // ② 製造：作業台ごとに、職人 → エクステと進み
    const benches = h('div', 'isl-scm-benches');
    s.slots.forEach((sl, i) => {
      const r = h('div', 'isl-scm-bench');
      const st = sl.worker != null ? staffOf(s, sl.worker) : null;
      const p = sl.running && sl.sku && st ? sl.progress / craftDays(s, sl.sku) : 0;
      r.append(h('small', 'isl-dim', t(`台 ${i + 1}`, `#${i + 1}`)), sl.sku ? skuIcon(sl.sku as Sku, 32) : h('span', 'isl-slot-plus', '?'), bar(p, 'var(--isl-gold)'), h('small', '', sl.sku ? (st?.resting ? t('休憩中', 'resting') : sl.running ? `${Math.round(p * 100)}%` : t('止まっている', 'idle')) : t('未定', 'unset')));
      if (sl.sku && st && !st.resting) r.append(h('small', 'isl-dim', t(`${(craftDays(s, sl.sku) / speed(st, 'craft', s)).toFixed(1)} 日/ロット`, `${(craftDays(s, sl.sku) / speed(st, 'craft', s)).toFixed(1)} d/lot`)));
      benches.append(r);
    });
    flow.append(card('craft', s.slots.map((sl, i) => assignSlot(t(`作業台 ${i + 1}`, `Bench ${i + 1}`), 'craft', sl.worker, i)), [benches]));
    flow.append(pipe(STAGE.craft.what, made));

    // ③ 物流：工房で待つ商品 → 走っている荷車
    const wait = h('div', 'isl-stock');
    wait.append(h('small', 'isl-scm-cap', t('工房で出荷待ち', 'Waiting to ship')));
    const waiting = Object.entries(s.stock).filter(([, n]) => (n ?? 0) > 0) as [Sku, number][];
    if (!waiting.length) wait.append(h('small', 'isl-dim', t('工房で待っている商品はありません', 'Nothing waiting at the workshop')));
    for (const [x, n] of waiting) {
      const c = h('span', 'isl-chip');
      c.append(skuIcon(x, 22), h('small', '', `×${n}`));
      wait.append(c);
    }
    const carts = h('div', 'isl-scm-carts');
    for (const tp of s.trips) {
      const to = s.buildings.find((b) => b.uid === tp.to);
      const r = h('div', 'isl-field');
      const from = tp.from != null ? s.buildings.find((b) => b.uid === tp.from) : null;
      const via = from && from.id !== 'workshop' ? t('（拠点から）', ' (from hub)') : '';
      r.append(heroIcon(tp.hauler, 24), h('span', '', tp.dropped ? t(`🛒 帰り道${via}`, `🛒 returning${via}`) : `🛒 → ${to ? DEF[to.id].name : ''}${via}`), bar(1 - tp.left / tp.total, 'var(--isl-gold)'), h('small', 'isl-dim', t(`あと ${Math.ceil(tp.left)} 日`, `${Math.ceil(tp.left)} d left`)));
      carts.append(r);
    }
    if (!s.trips.length) carts.append(h('small', 'isl-dim', t('いま走っている荷車はありません', 'No carts on the road')));
    const hs = haulers.map((x) => assignSlot(t('運搬係', 'Hauler'), 'transport', x.hero, null));
    if (haulers.length < 3) hs.push(assignSlot(t('運搬係', 'Hauler'), 'transport', null, null));
    flow.append(card('haul', hs, [wait, carts]));
    flow.append(pipe(STAGE.haul.what, hauled));

    // ④ 販売：お店ごとに、主力商品・棚と裏・認知度・今月の売上
    const shopRows = h('div', 'isl-scm-shops');
    for (const b of shops) {
      const sh = s.shops[b.uid];
      const r = h('div', 'isl-scm-shop');
      const main = sh.shelves[0];
      const name = h('div');
      name.append(h('b', '', DEF[b.id].name), h('small', 'isl-gold', money(sh.rev)));
      r.append(main ? skuIcon(main, 32) : h('span', 'isl-slot-plus', '?'), name);
      const bars = h('div', 'isl-scm-shop-bars');
      const on = main ? sh.shelf[main] ?? 0 : 0;
      const back = main ? sh.storage[main] ?? 0 : 0;
      const f1 = h('div', 'isl-field');
      f1.append(h('small', '', t('棚', 'Shelf')), bar(on / 10, on ? 'var(--isl-good)' : 'var(--isl-bad)'), h('small', 'isl-dim', `${on}`));
      const f2 = h('div', 'isl-field');
      f2.append(h('small', '', t('裏', 'Back')), bar(back / storageCap(b, s)), h('small', 'isl-dim', `${back}`));
      const f3 = h('div', 'isl-field');
      f3.append(h('small', '', t('認知度', 'Known')), bar(sh.aw ?? 1, 'var(--isl-gold)'), h('small', 'isl-dim', `${Math.round((sh.aw ?? 1) * 100)}%`));
      bars.append(f1, f2, f3);
      r.append(bars);
      const area = shopArea(s, b);
      r.append(h('small', `isl-scm-area ${area.rivals.length || area.mine ? 'is-warn' : ''}`, t(`近くの家 ${area.homes}・競合 ${area.rivals.length}・片道 ${area.way.days.toFixed(1)} 日${area.mine ? `・自社の店と近い` : ''}`, `${area.homes} homes · ${area.rivals.length} rivals · ${area.way.days.toFixed(1)} d${area.mine ? ' · near own shop' : ''}`)));
      r.addEventListener('click', () => openShop(ctx, b.uid));
      shopRows.append(r);
    }
    flow.append(card('sell', shops.map((b) => assignSlot(DEF[b.id].name, 'shop', s.shops[b.uid].staff, b.uid)), [shopRows]));
    flow.append(h('div', 'isl-scm-end', t(`今月 ${STAGE.sell.what} ${sold} 個・${money(monthRevenue(s))}`, `${sold} ${STAGE.sell.what} this month · ${money(monthRevenue(s))}`)));
    body.append(flow);
  });
}
