/**
 * 会社ぜんたいの画面：ランドマップ（関所の先のセクタ・セクタマネージャー）・決算書（四半期の P/L・B/S）・ブランド力。
 * docs/ISLAND_PHASE1.md「ランドマップとセクタ」「決算書」「ブランド力」。
 */
import { t } from '../../i18n';
import { assetUrl } from '../../render/images';
import { BRAND, DIG_SITES, MANAGER, RESET, SECTORS, SKILLS, TIERS, aptitude, type SectorDef } from './data';
import { CAPITAL, TIER_NAME, brandPull, delegateCostOf, emptyLedger, managerRate, pl, quarters, revivePerMonth, RUIN, sectorDef, sectorState, sumLedger, tierLabel, type Balance, type Ledger, type RuinLike, type SectorState } from './company';
import { crowned, letterLock, hasBusiness, lastRank, letterLocked, moveTo, recOf, type MoveErr } from './land';
import { delegate, delegateLock, fundShort, rankUpTier, reviveView } from './reset';
import { balance, clearGoal, clearWaiting, date, lvMul, staffOf, type P1State } from './model';
import { clearCondText } from './digmeet';
import { pickHero, rankEl } from './heroui';
import { adjacent } from './world';
import { after, open, type Ctx } from './screens';
import { btn, h, heroIcon, heroName, money, rich } from './ui';

// ---------------------------------------------------------------- ランドマップ

/**
 * 地図の上の道（セクタどうしのつながり）。同じランクの中は、つながった地図の隣どうし（grid が上下左右に 1 違い）。
 * ランクの間は、上のランクへ進む道（つながった地図ではつながらない。ランクが違えば別の階層）。
 */
const ROADS: [string, string][] = [
  ...SECTORS.flatMap((a) => SECTORS.filter((b) => a.id < b.id && adjacent(a.id, b.id)).map((b): [string, string] => [a.id, b.id])),
  ['c3', 'u1'],
  ['c6', 'u2'],
  ['c8', 'u3'],
  ['u4', 'r1'],
  ['u5', 'r2'],
  ['r3', 'e1'],
  ['r4', 'e3'],
  ['r3', 'l1'],
  ['r4', 'l1'],
  ['e2', 'l1'],
];

/** ランドセクタの絵（MCH のランドセクタ。はじまりの国 Lime の 5 ランク） */
const TIER_IMG: Record<SectorDef['tier'], string> = { C: '1_Common', U: '2_Uncommon', R: '3_Rare', E: '4_Epic', L: '5_Legendary' };
export const sectorIcon = (tier: SectorDef['tier']) => assetUrl(`mch/Image/LandSectors/04_Lime_${TIER_IMG[tier]}.png`);

const TIER_NOTE: Record<SectorDef['tier'], string> = {
  C: t('いまと同じくらいの広さと商売敵。出店許可申請の費用も軽い。', 'About the same size and rivals as now. The permit is cheap.'),
  U: t('地図が広く、商売敵の規模が大きい。Common の商品は相手にされにくいので、エクステのランクアップが鍵（SCM の強化を楽しむセクタ）。', 'A wider map with bigger rivals. Common goods barely sell here, so ranking up your extensions is key.'),
  R: t('他社のお店が乱立する、栄えた市場。他店から客を奪う出店計画としのぎの削り合い（準備中）。', 'A crowded, thriving market where you win customers from rivals (coming soon).'),
  E: t('他社を M&A で買収できるセクタ（準備中）。', 'Acquire rivals through M&A (coming soon).'),
  L: t('ブランド力で売る総力戦。街そのものを作り変える（準備中）。', 'A brand-power showdown where you reshape the city (coming soon).'),
};

let sel: string | null = null;

const stateText = (s: P1State, d: SectorDef, st: SectorState): string => {
  switch (st) {
    case 'here':
      return t('いまここ', 'You are here');
    case 'mine': {
      const rec = s.land?.recs[d.id];
      const m = rec?.manager != null ? heroName(rec.manager) : null;
      return m ? t(`マネージャー：${m}`, `Manager: ${m}`) : t('出店済み', 'Opened');
    }
    case 'open':
      return t(`出店許可 ${money(d.fee)}`, `Permit ${money(d.fee)}`);
    case 'soon':
      return t('準備中', 'Coming soon');
    case 'locked':
      return t('まだ開放されていない', 'Locked');
    case 'cloud':
      return t('雲に覆われている', 'Under clouds');
  }
};

/** 開放の条件（Rare など） */
function needText(s: P1State, d: SectorDef): string {
  if (!d.need) return '';
  const have = (s.land?.mine ?? []).filter((x) => sectorDef(x).tier === d.need!.tier).length;
  const tier = tierLabel(d.need.tier);
  return t(`${tier}に ${d.need.n} つ出店で開放（いま ${have}/${d.need.n}）`, `Opens after opening in ${d.need.n} ${tier}s (now ${have}/${d.need.n})`);
}

const ERR: Record<MoveErr, string> = {
  'no-land': t('関所を開くと、ほかのセクタへ行けます', 'Open the gate to reach other sectors'),
  here: t('いまいるセクタです', 'You are already here'),
  cloud: t('雲に覆われていて、まだ行けません', 'Still under clouds'),
  locked: t('まだ開放されていません', 'Not unlocked yet'),
  soon: t('このセクタは準備中です', 'This sector is coming soon'),
  letter: '',
  money: t('資金が足りません', 'Not enough funds'),
  manager: t('セクタマネージャーを選んでください', 'Pick a sector manager'),
  busy: t('そのヒーローは、ほかのセクタのマネージャーです', 'That hero manages another sector'),
};

/** 移る：いまのセクタに建物があれば、まずマネージャーを選ぶ（ランドマップの「出店する」・地図の「このセクタに進出」） */
export function startMove(ctx: Ctx, target: string) {
  const s = ctx.s();
  const cur = sectorDef(s.land!.cur);
  const go = (hero: number | null) => {
    const fresh = sectorState(s.land!, target) === 'open';
    // 開放の条件があるセクタ（Rare など）が、この出店で開くか
    const gated = SECTORS.filter((x) => x.need && sectorState(s.land!, x.id) === 'locked').map((x) => x.id);
    const e = moveTo(s, target, hero);
    if (e) {
      ctx.toast(e === 'letter' ? letterLock(s) : ERR[e]);
      ctx.sfx?.('error');
      return;
    }
    sel = null;
    ctx.save();
    ctx.moved?.(target, fresh, hero);
    const opened = gated.filter((id) => sectorState(s.land!, id) !== 'locked');
    if (opened.length === 1) ctx.toast(t(`${sectorDef(opened[0]).name}への道が開いた！（遊びは次の更新で）`, `The road to ${sectorDef(opened[0]).name} is open! (Playable in a future update)`));
    else if (opened.length) {
      const tier = tierLabel(sectorDef(opened[0]).tier);
      ctx.toast(t(`${tier} ${opened.length} つへの道が開いた！（遊びは次の更新で）`, `Roads to ${opened.length} ${tier}s are open! (Playable in a future update)`));
    }
  };
  if (!hasBusiness(s)) return go(null);
  pickHero(ctx.root, s, {
    title: t(`「${cur.name}」のセクタマネージャー`, `Manager for ${cur.name}`),
    task: 'manager',
    current: null,
    note: t(
      '離れているあいだ、このセクタの運営を任せるヒーローを選びます。能力値の合計が高いほど売上が上がりやすく、低いと下振れします（赤字もあります）。ほかのヒーローは一緒に移ります。',
      'Pick the hero who runs this sector while you are away. Higher total stats tend to raise sales; low ones can mean losses. Everyone else comes with you.',
    ),
    onPick: (hero) => hero != null && go(hero),
  });
}

/** 復興の札の 1 行：「🏚 復興 3 / 8 軒・支援金 残り 42,000 G・担当 ○○」 */
export function reviveLine(rv: NonNullable<ReturnType<typeof reviveView>>): string {
  const who = rv.hero != null ? t(`・担当 ${heroName(rv.hero)}`, ` · ${heroName(rv.hero)}`) : t('・担当なし', ' · no one assigned');
  const funded = rv.fund > 0 || (rv.rec.revive?.spent ?? 0) > 0;
  const fund = rv.out ? t('・支援金が尽きた', ' · funds ran out') : funded ? t(`・支援金 残り ${money(rv.fund)}`, ` · ${money(rv.fund)} left`) : t('・支援金なし', ' · no funds');
  return t(`🏚 復興 ${rv.fixed} / ${rv.all} 軒`, `🏚 Rebuilt ${rv.fixed} / ${rv.all}`) + fund + who;
}

/**
 * ランクアップの進出の確認（発掘 v2 の 7 段目）：失うもの・残るもの・マインちゃんの一言（寄付パネルを開く）・「進出する」「まだやめておく」。
 * 進出すると、いまのセクタのマネージャーを選んで（いまの流れ）、災害と徴収の演出（disaster.ts）へ
 */
export function openRankUp(ctx: Ctx, target: string) {
  const d = sectorDef(target);
  open(ctx, t(`${TIER_NAME[d.tier]} への進出`, `Expanding into ${TIER_NAME[d.tier]}`), (body) => {
    const s = ctx.s();
    body.classList.add('isl-rankup');
    const head = h('div', 'isl-rankup-head');
    const big = h('img', 'isl-land-dico');
    big.src = sectorIcon(d.tier);
    big.alt = '';
    head.append(big, h('b', '', t(`${TIER_NAME[d.tier]} へ進出すると、ランドの復興のため大きな災害と徴収が起きます`, `Expanding into ${TIER_NAME[d.tier]} brings a great disaster and a levy for the land’s recovery`)));
    body.append(head);
    const cols = h('div', 'isl-rankup-cols');
    const lose = h('div', 'isl-card2 isl-rankup-lose');
    lose.append(h('h3', '', t('失うもの', 'You lose')));
    const ul1 = h('ul');
    for (const x of [
      t(`所持金（全部。いま ${money(Math.max(0, Math.round(s.money)))}）`, `All funds (now ${money(Math.max(0, Math.round(s.money)))})`),
      t('すべてのセクタの建物（お店・工房・倉庫・展示館など。中の在庫・素材も）', 'Buildings in every sector (shops, workshops, warehouses, museum… with their stock and materials)'),
      t('お金で開けたパネル（菱形）', 'Panels bought with funds (diamonds)'),
      t('設備投資・アルバイト', 'Upgrades and part-timers'),
    ])
      ul1.append(h('li', '', x));
    lose.append(ul1);
    const keep = h('div', 'isl-card2 isl-rankup-keep');
    keep.append(h('h3', '', t('残るもの', 'You keep')));
    const ul2 = h('ul');
    for (const x of [
      t(`研究ポイント（いま ${Math.round(s.rp ?? 0).toLocaleString('en-US')} RP）`, `Research points (now ${Math.round(s.rp ?? 0).toLocaleString('en-US')} RP)`),
      t('RP で開けたパネル（研究パネル・無限パネル）', 'Panels opened with RP (research and ∞ panels)'),
      t('ヒーロー（能力値も）', 'Heroes (and their stats)'),
      t('研究ノートと研究 Lv・復刻品のレシピ', 'Research notes, research Lv and revival recipes'),
      t('制覇とエンブレム・ブランド力・調査依頼状', 'Conquests, emblems, brand and survey requests'),
      t('ダンジョンの最深記録・研究への寄付の回数', 'Deepest dungeon record and donation count'),
    ])
      ul2.append(h('li', '', x));
    keep.append(ul2);
    cols.append(lose, keep);
    body.append(cols);
    body.append(h('p', 'isl-dim', t(`新しい町は、ランドからの復興の支度金 ${money(RESET.grant)} で始めます。被災した町は、手で直すか、ヒーローに復興を任せられます。出店許可申請の費用はかかりません。`, `You start the new town with a ${money(RESET.grant)} recovery grant from the land. Ruined towns can be repaired by hand or left to a hero. No permit fee.`)));
    // マインちゃんの一言
    const say = h('div', 'isl-rankup-say');
    const mi = h('img', 'isl-dock-mine');
    mi.src = assetUrl('mch/Image/Characters/navi_ain_speak_00_talk.png');
    mi.alt = '';
    const p = h('p');
    p.append(rich(t('お金は徴収されちゃう。進出の前に[[研究への寄付]]で研究ポイントに変えておくと、あとで役に立つよ！', 'Your funds will be levied. Turn them into research points with a [[research donation]] before you go — it will pay off later!')));
    say.append(mi, p, btn(t('寄付パネルを開く', 'Open the donation panel'), () => ctx.skills?.('dig_donate')));
    body.append(say);
    const row = h('div', 'isl-row isl-rankup-acts');
    row.append(
      btn(t('進出する', 'Expand'), () => startMove(ctx, target), 'is-on is-danger'),
      btn(t('まだやめておく', 'Not yet'), () => openLand(ctx)),
    );
    body.append(row);
  });
}

/**
 * 被災した町（ほかのセクタ）の復興の箱：進み・支援金・担当・「復興を任せる」（ヒーローと支援金）。お題と出土品は手で掘る
 */
function reviveBox(ctx: Ctx, s: P1State, id: string): HTMLElement {
  const rv = reviveView(s, id)!;
  const box = h('div', 'isl-land-mgr isl-revive-box');
  box.append(h('p', rv.out ? 'isl-bad' : 'isl-warn', reviveLine(rv)));
  const bar0 = h('div', 'isl-revive-bar');
  const fill = h('span');
  fill.style.width = `${Math.round((rv.fixed / Math.max(1, rv.all)) * 100)}%`;
  bar0.append(fill);
  box.append(bar0);
  if (rv.hero != null && (rv.fund > 0 || rv.rec.revive!.spent > 0)) {
    const st = staffOf(s, rv.hero);
    const per = st ? revivePerMonth(st.stats) : 1;
    box.append(h('small', 'isl-dim', t(`${heroName(rv.hero)}が毎月の締めで 1 か月に ${per} 軒ずつ直していく（1 軒は手で直す値段の ${RESET.delegate.costMul} 倍）。直ったお店の割合で、マネージャーの売上が戻る。`, `${heroName(rv.hero)} rebuilds ${per} per month at each close (${RESET.delegate.costMul}× the hand-repair price). Manager sales return as shops come back.`)));
  } else box.append(h('small', 'isl-dim', t('ヒーローに復興支援金を送ると、毎月の締めで廃墟を直していってくれる（手で直すより割高だけど、自動で進む）。', 'Send recovery funds to a hero and they rebuild the ruins at each monthly close (pricier than by hand, but automatic).')));
  box.append(h('small', 'isl-gold', t('⛏ お題と出土品は手で掘ろう（任せた町でも、荒れ地はまた掘れる）', '⛏ Dig the targets and finds yourself (the wastelands can be dug again)')));
  const row = h('div', 'isl-row');
  row.append(btn(rv.fund > 0 || rv.rec.revive!.spent > 0 ? t('支援金を送る・担当を替える', 'Send funds / change hero') : t('🏗 復興を任せる', '🏗 Leave the recovery'), () => openDelegate(ctx, id), 'is-on'));
  box.append(row);
  return box;
}

/** 復興を任せる画面：担当（いまの担当 or ほかのヒーロー）と、送る支援金（3 つの額） */
export function openDelegate(ctx: Ctx, id: string, hero0?: number) {
  const d = sectorDef(id);
  open(ctx, t(`「${d.name}」の復興を任せる`, `Leave ${d.name}’s recovery`), (body) => {
    const s = ctx.s();
    const rv = reviveView(s, id);
    if (!rv) {
      body.append(h('p', 'isl-dim', t('この町は被災していません。', 'This town was not hit.')));
      return;
    }
    const hero = hero0 ?? rv.hero ?? (recOf(s, id).manager ?? null);
    body.append(h('p', '', reviveLine(rv)));
    // 担当
    const who = h('div', 'isl-card2 isl-delegate-who');
    who.append(h('h3', '', t('担当のヒーロー', 'Hero in charge')));
    const st = hero != null ? staffOf(s, hero) : null;
    if (st) {
      const per = revivePerMonth(st.stats);
      const r = h('div', 'isl-row');
      r.append(heroIcon(st.hero, 48), h('b', '', heroName(st.hero)), rankEl(aptitude(st.stats, 'manager')), h('small', 'isl-dim', t(`1 か月に ${per} 軒`, `${per} per month`)));
      who.append(r);
      who.append(h('small', 'isl-good', t('復興の担当は、毎月 能力値が大きく伸びる（2 つが +2〜3）', 'The hero in charge grows a lot each month (two stats +2–3)')));
    } else who.append(h('p', 'isl-warn', t('担当を選んでください', 'Pick a hero')));
    who.append(
      btn(t('ヒーローを選ぶ', 'Pick a hero'), () =>
        pickHero(ctx.root, s, {
          title: t(`「${d.name}」の復興の担当`, `Recovery lead for ${d.name}`),
          task: 'manager',
          current: null,
          note: t('能力値の平均が高いほど、1 か月に直せる数が多い（1〜3 軒）。担当になったヒーローは、能力値が大きく伸びます。', 'Higher average stats rebuild more per month (1–3). The hero in charge grows a lot.'),
          onPick: (h0) => h0 != null && openDelegate(ctx, id, h0),
        }),
      ),
    );
    body.append(who);
    // 支援金
    const fundBox = h('div', 'isl-card2 isl-delegate-fund');
    fundBox.append(h('h3', '', t('復興支援金を送る（所持金から）', 'Send recovery funds (from your funds)')));
    const short = fundShort(s, id);
    const bs = ((recOf(s, id).snap?.buildings as RuinLike[] | undefined) ?? []).filter((b) => b.owner === RUIN);
    const cheap = bs.map((b) => delegateCostOf(b.id)).sort((a, b) => a - b);
    fundBox.append(h('small', 'isl-dim', t(`残り ${bs.length} 軒を直しきるには、あと ${money(short)}（1 軒 ${money(cheap[0] ?? 0)}〜）`, `${money(short)} more to rebuild the last ${bs.length} (from ${money(cheap[0] ?? 0)} each)`)));
    const grid = h('div', 'isl-delegate-grid');
    for (const v of RESET.delegate.funds) {
      // この額で直せる見込み（安い順）
      let left = v + rv.fund;
      let n = 0;
      for (const c of cheap) {
        if (left < c) break;
        left -= c;
        n++;
      }
      const e = hero != null ? delegateLock(s, id, hero, v) : 'hero';
      const b = btn('', () => {
        if (hero == null) return;
        const r = delegate(s, id, hero, v);
        if (r) {
          ctx.toast(r === 'money' ? t('資金が足りません', 'Not enough funds') : t('いまは任せられません', 'Cannot assign now'));
          ctx.sfx?.('error');
          return;
        }
        ctx.sfx?.('spend');
        ctx.toast(t(`${heroName(hero)}に「${d.name}」の復興を任せた（支援金 ${money(v)}）`, `${heroName(hero)} now leads ${d.name}’s recovery (${money(v)})`));
        openLand(ctx);
        ctx.delegated?.(id);
      }, e ? '' : 'is-on');
      b.classList.add('isl-delegate-amt');
      b.append(h('b', '', money(v)), h('small', '', t(`${n} 軒ぶんの見込み`, `about ${n} buildings`)));
      if (e === 'money') b.append(h('small', 'isl-bad', t(`あと ${money(v - s.money)}`, `${money(v - s.money)} short`)));
      b.disabled = !!e;
      grid.append(b);
    }
    fundBox.append(grid);
    body.append(fundBox);
    body.append(h('small', 'isl-gold', t('⛏ 自動でやってくれるのは、お店の復興と売上まで。お題と出土品は自分で掘りに行こう。', '⛏ The hero handles shops and sales. Dig the targets and finds yourself.')));
  });
}

/** セクタのランクの札 */
function tierPill(tier: SectorDef['tier']): HTMLElement {
  const p = h('span', `isl-tier is-${tier.toLowerCase()}`, tier);
  p.style.setProperty('--tc', TIERS[tier].color);
  return p;
}

export function openLand(ctx: Ctx) {
  open(ctx, t('ランドマップ', 'Land map'), (body) => {
    const s = ctx.s();
    const land = s.land;
    if (!land) {
      body.append(h('p', 'isl-dim', t('ランドのふちの関所を開くと、ほかのランドセクタへ行けるようになります。', 'Open the gate at the edge of the land to reach other sectors.')));
      return;
    }
    sel ??= land.cur;
    const intro = h('p', 'isl-dim', t('いまいるランドの全体図。ほかのセクタに出店すると、いまのセクタはセクタマネージャーが運営し、利益の一部が本社に入ります。', 'The whole land. When you open in another sector, a sector manager runs this one and sends part of the profit to HQ.'));
    const map = h('div', 'isl-land');
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 100 100');
    svg.setAttribute('preserveAspectRatio', 'none');
    svg.classList.add('isl-land-svg');
    // 島の形
    const isle = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    isle.setAttribute('d', 'M4,62 C0,48 6,36 14,32 C14,18 30,12 42,10 C46,2 58,2 62,8 C76,10 88,16 88,30 C96,36 100,50 97,62 C100,76 98,94 86,97 C66,100 34,100 14,97 C2,95 0,76 4,62 Z');
    isle.setAttribute('class', 'isl-land-isle');
    svg.append(isle);
    for (const [a, b] of ROADS) {
      const A = sectorDef(a).at;
      const B = sectorDef(b).at;
      const l = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      l.setAttribute('x1', `${A[0]}`);
      l.setAttribute('y1', `${A[1]}`);
      l.setAttribute('x2', `${B[0]}`);
      l.setAttribute('y2', `${B[1]}`);
      const on = land.mine.includes(a) && land.mine.includes(b);
      l.setAttribute('class', `isl-land-road ${on ? 'is-on' : ''}`);
      svg.append(l);
    }
    map.append(svg);
    // 雲（Epic・Legendary のあたり）
    for (const d of SECTORS.filter((x) => x.cloud && sectorState(land, x.id) === 'cloud')) {
      const c = h('div', 'isl-land-cloud');
      c.style.left = `${d.at[0]}%`;
      c.style.top = `${d.at[1]}%`;
      map.append(c);
    }
    for (const d of SECTORS) {
      const st = sectorState(land, d.id);
      const n = h('button', `isl-land-node is-${st} ${sel === d.id ? 'is-sel' : ''}`);
      n.type = 'button';
      n.style.left = `${d.at[0]}%`;
      n.style.top = `${d.at[1]}%`;
      n.style.setProperty('--tc', TIERS[d.tier].color);
      // 札：アイコン（左上にランクの丸い札）＋その下に名前
      const ico = h('span', 'isl-land-ico');
      const img = h('img');
      img.src = sectorIcon(d.tier);
      img.alt = '';
      img.draggable = false;
      ico.append(img, h('span', `isl-land-rank is-${d.tier.toLowerCase()}`, d.tier));
      const name = st === 'cloud' ? '???' : d.name;
      n.append(ico, h('b', 'isl-land-name', name));
      n.setAttribute('aria-label', name);
      // KGI（2 か月続けてエリア 1 位＝制覇）の達成と、最新の順位
      if (st === 'here' || st === 'mine') {
        const rk = lastRank(s, d.id);
        const crown = crowned(s, d.id);
        // 札の右上：KGI（1 位）を達成したセクタは 👑 だけ、まだなら最新の順位
        // 1 位を 2 か月続けたのに発表がまだ（いまいるセクタ）：「👑 発表待ち」
        const wait = st === 'here' && clearWaiting(s);
        if (rk || crown) ico.append(h('small', `isl-land-kgi ${crown ? 'is-crown' : ''}`, crown ? t('👑 達成', '👑 Done') : wait ? t('👑 発表待ち', '👑 Present') : t(`${rk} 位`, `#${rk}`)));
      }
      if (st === 'here') n.append(h('span', 'isl-land-pin', '📍'));
      // 被災した町（ランクアップの災害。発掘 v2 の 7 段目）：札に「🏚 被災」・復興の進み
      const rv = st === 'here' || st === 'mine' ? reviveView(s, d.id) : null;
      if (rv && rv.ruins > 0) n.append(h('span', 'isl-land-ruin', rv.hero != null && rv.fund > 0 ? t(`🏗 ${rv.fixed}/${rv.all}`, `🏗 ${rv.fixed}/${rv.all}`) : t('🏚 被災', '🏚 Hit')));
      const noLetter = letterLocked(s, d.id);
      if (st === 'locked' || noLetter) ico.append(h('span', 'isl-land-lock', '🔒'));
      // マウスを乗せると一言の特徴・状態・開放の条件（PC。スマホは押すと下の説明に）
      // 上の段は下に、端の札は内側に出す（地図の外で切れないように）
      const tip = h('span', `isl-land-tip ${d.at[1] < 35 ? 'is-below' : ''} ${d.at[0] < 20 ? 'is-l' : d.at[0] > 80 ? 'is-r' : ''}`);
      if (st === 'cloud') tip.append(h('span', '', t('雲に覆われていて、まだ行けない', 'Hidden under clouds')));
      else {
        tip.append(h('b', '', d.name), h('small', 'isl-dim', stateText(s, d, st)));
        if (d.profile.tag) tip.append(h('span', 'isl-land-tag', d.profile.tag));
        if (st === 'locked') tip.append(h('span', 'isl-warn', needText(s, d)));
        if (noLetter) tip.append(h('span', 'isl-warn', letterLock(s)));
        if (rv && rv.ruins > 0) tip.append(h('span', 'isl-warn', reviveLine(rv)));
        if (st === 'open' && !noLetter && rankUpTier(s, d.id)) tip.append(h('span', 'isl-warn', t('⚠ 進出すると、ランドの復興のため災害と徴収が起きる', '⚠ Expanding here brings a disaster and a levy')));
      }
      n.append(tip);
      n.addEventListener('click', () => {
        sel = d.id;
        ctx.sfx?.('tap');
        after(ctx);
      });
      map.append(n);
    }
    body.append(intro, map, detail(ctx, s, sel));
  });
}

function detail(ctx: Ctx, s: P1State, id: string): HTMLElement {
  const land = s.land!;
  const d = sectorDef(id);
  const st = sectorState(land, id);
  const T = TIERS[d.tier];
  const box = h('div', 'isl-card2 isl-land-detail');
  const top = h('div', 'isl-row');
  const big = h('img', 'isl-land-dico');
  big.src = sectorIcon(d.tier);
  big.alt = '';
  big.style.setProperty('--tc', TIERS[d.tier].color);
  top.append(big, tierPill(d.tier), h('b', 'isl-land-dname', st === 'cloud' ? '???' : d.name), h('small', 'isl-dim', tierLabel(d.tier)));
  box.append(top);
  if (st === 'cloud') {
    box.append(h('p', '', t('雲に覆われていて、まだ移動できない。', 'Covered in clouds. You cannot go there yet.')));
    return box;
  }
  if (d.profile.tag) box.append(h('p', 'isl-land-dtag', d.profile.tag));
  box.append(h('p', '', TIER_NOTE[d.tier]));
  if (d.teaser) box.append(h('p', 'isl-gold', d.teaser));
  if (st === 'here' || st === 'mine') {
    const rk = lastRank(s, id);
    box.append(h('p', crowned(s, id) ? 'isl-good' : 'isl-dim', crowned(s, id) ? t(`👑 このセクタを制覇しました（2 か月続けて 1 位＋研究成果の発表。最新 ${rk ?? 1} 位）`, `👑 Conquered: #1 two months running + findings (latest #${rk ?? 1})`) : rk ? t(`目標：2 か月続けてエリア 1 位＋研究成果の発表（最新 ${rk} 位）`, `Goal: #1 in the area two months running + present findings (latest #${rk})`) : t('目標：2 か月続けてエリア 1 位＋研究成果の発表（まだ月の締めがありません）', 'Goal: #1 in the area two months running + present findings (no monthly close yet)')));
    // 制覇の条件の進み（発掘 v2 の 5 段目）：いまいるセクタは「1 位を 2 か月 ✔／研究成果の発表 1 / 3 お題」、ほかのセクタは発表済みか
    if (!crowned(s, id)) {
      if (st === 'here') {
        const g = clearGoal(s);
        if (g.all > 0) box.append(h('p', g.top && !g.present ? 'isl-gold' : 'isl-dim', clearCondText(g.streak, g)[0]));
      } else if (DIG_SITES[id]) box.append(h('p', 'isl-dim', s.presented.includes(id) ? t('研究成果の発表 ✔（あとは 1 位を 2 か月）', 'Findings presented ✔ (now #1 for 2 months)') : t('研究成果の発表：まだ（このセクタのお題をそろえよう）', 'Findings: not yet (find this sector’s targets)')));
    }
  }
  const grid = h('div', 'isl-land-stats');
  const stat = (k: string, v: string) => {
    const c = h('div', 'isl-pop-stat');
    c.append(h('small', '', k), h('b', '', v));
    grid.append(c);
  };
  stat(t('地図', 'Map'), t(`${T.n}×${T.n} マス`, `${T.n}×${T.n}`));
  stat(t('商売敵の規模', 'Rivals'), `×${T.rival}`);
  stat(t('お客さん', 'Customers'), `×${T.demand}`);
  stat(t('Common の売れやすさ', 'Common goods'), `×${T.commonPull}`);
  box.append(grid);
  const row = h('div', 'isl-row');
  if (st === 'here') {
    box.append(h('p', 'isl-good', t('いまこのセクタを経営しています。', 'You are running this sector now.')));
    const rv = reviveView(s, id);
    if (rv && rv.ruins > 0) box.append(h('p', 'isl-warn', t(`🏚 この町は被災しています（廃墟 ${rv.ruins} 軒）。廃墟をタップして修繕しよう。ほかの町へ移るときは、ヒーローに復興を任せられます。`, `🏚 This town was hit (${rv.ruins} ruins). Tap a ruin to repair it. When you move on, you can leave the recovery to a hero.`)));
  } else if (st === 'open' && letterLocked(s, id)) {
    // 調査依頼状が無い（Uncommon 以上）：押せず、理由
    const b = btn(t(`出店する（出店許可申請 ${money(d.fee)}）`, `Open here (permit ${money(d.fee)})`), () => undefined);
    b.disabled = true;
    row.append(b);
    box.append(h('p', 'isl-warn', letterLock(s)));
  } else if (st === 'open' && rankUpTier(s, id)) {
    // 会社として初めて上のランクへ（発掘 v2 の 7 段目）：先に確認の画面（失うもの・残るもの）。出店許可申請の費用は取らない
    row.append(btn(t(`${TIER_NAME[d.tier]} へ進出する…`, `Expand into ${TIER_NAME[d.tier]}…`), () => openRankUp(ctx, id), 'is-on'));
    box.append(h('p', 'isl-warn', t(`⚠ ${TIER_NAME[d.tier]} へ進出すると、ランドの復興のため大きな災害と徴収が起きます（出店許可申請の費用はかかりません）。`, `⚠ Expanding into ${TIER_NAME[d.tier]} brings a great disaster and a levy for the land’s recovery (no permit fee).`)));
  } else if (st === 'open') {
    const b = btn(t(`出店する（出店許可申請 ${money(d.fee)}）`, `Open here (permit ${money(d.fee)})`), () => startMove(ctx, id), 'is-on');
    b.disabled = s.money < d.fee;
    row.append(b);
    if (s.money < d.fee) box.append(h('small', 'isl-warn', t(`あと ${money(d.fee - s.money)} 足りません。`, `${money(d.fee - s.money)} short.`)));
    if (hasBusiness(s)) box.append(h('small', 'isl-dim', t('いまのセクタは、セクタマネージャーに任せます（次に選びます）。', 'You will pick a manager for the current sector next.')));
  } else if (st === 'mine') {
    const rv = reviveView(s, id);
    if (rv && rv.ruins > 0) box.append(reviveBox(ctx, s, id));
    else box.append(managerBox(ctx, s, id));
    row.append(btn(t('このセクタへ移動する', 'Go to this sector'), () => startMove(ctx, id), 'is-on'));
  } else if (st === 'locked') {
    box.append(h('p', 'isl-warn', needText(s, d)));
  } else if (st === 'soon') {
    box.append(h('p', 'isl-dim', t('開放されました！ このセクタの遊びは準備中です。', 'Unlocked! This sector is coming soon.')));
  }
  if (row.childElementCount) box.append(row);
  return box;
}

/** マネージャーが運営しているセクタ：担当・先月の結果・投資の割合 */
function managerBox(ctx: Ctx, s: P1State, id: string): HTMLElement {
  const rec = recOf(s, id);
  const box = h('div', 'isl-land-mgr');
  if (!rec.snap) {
    box.append(h('p', 'isl-dim', t('まだお店がありません。', 'No business here yet.')));
    return box;
  }
  const m = rec.manager != null ? staffOf(s, rec.manager) : null;
  const who = h('div', 'isl-row');
  if (m && m.task === 'manager') {
    const apt = aptitude(m.stats, 'manager');
    who.append(heroIcon(m.hero, 44), h('b', '', heroName(m.hero)), rankEl(apt), h('small', 'isl-dim', t(`売上の目安 ×${managerRate(apt).toFixed(2)}`, `Sales ×${managerRate(apt).toFixed(2)}`)));
  } else who.append(h('b', 'isl-warn', t('マネージャー不在（売上が大きく下がります）', 'No manager (sales drop a lot)')));
  who.append(
    btn(t('替える', 'Change'), () =>
      pickHero(ctx.root, s, {
        title: t(`「${sectorDef(id).name}」のセクタマネージャー`, `Manager for ${sectorDef(id).name}`),
        task: 'manager',
        current: null,
        onPick: (hero) => {
          if (hero == null) return;
          const old = rec.manager != null ? staffOf(s, rec.manager) : null;
          if (old && old.task === 'manager' && old.target === id) {
            old.task = null;
            old.target = null;
          }
          const nx = staffOf(s, hero);
          if (!nx) return;
          if (nx.task) ctx.toast(t('いまの仕事を外して、マネージャーにしました', 'Moved from their current job'));
          nx.task = 'manager';
          nx.target = id;
          // ほかの仕事の枠からは外す
          for (const sl of s.slots) if (sl.worker === hero) sl.worker = null;
          for (const sh of Object.values(s.shops)) if (sh.staff === hero) sh.staff = null;
          rec.manager = hero;
          after(ctx);
        },
      }),
    ),
  );
  box.append(who);
  if (rec.base) box.append(h('small', 'isl-dim', t(`離れたときの月の売上 ${money(rec.base.rev)}・投資の合計 ${money(rec.capital)}`, `Sales when you left ${money(rec.base.rev)} · invested ${money(rec.capital)}`)));
  else box.append(h('small', 'isl-warn', t('離れる前に月の締めが無かったので、売上はまだ立ちません。戻って 1 か月営業しましょう。', 'No monthly close before you left, so it earns nothing yet. Come back and run it for a month.')));
  const last = rec.log[rec.log.length - 1];
  if (last) {
    const r = h('div', 'isl-land-stats');
    const stat = (k: string, v: string, cls = '') => {
      const c = h('div', `isl-pop-stat ${cls}`);
      c.append(h('small', '', k), h('b', '', v));
      r.append(c);
    };
    stat(t('先月の売上', 'Last sales'), money(last.rev));
    stat(t('利益', 'Profit'), money(last.profit), last.profit < 0 ? 'is-bad' : 'is-good');
    stat(t('このセクタへ投資', 'Reinvested'), money(last.invest));
    stat(t('本社へ', 'To HQ'), money(last.toHQ), last.toHQ < 0 ? 'is-bad' : '');
    box.append(r);
  }
  // 投資の割合
  const inv = h('div', 'isl-row isl-land-invest');
  inv.append(h('small', 'isl-dim', t('利益のうち、このセクタへ投資する割合', 'Share of profit reinvested here')));
  for (const v of MANAGER.choices) {
    const b = btn(`${Math.round(v * 100)}%`, () => {
      rec.invest = v;
      after(ctx);
    }, rec.invest === v ? 'is-on' : '');
    inv.append(b);
  }
  box.append(inv, h('small', 'isl-dim', t(`投資 1 G で、このセクタの月の売上が ${MANAGER.roi} G 伸びます（戻ってきたときは、お客さんが増えています）。`, `Each 1 G reinvested raises monthly sales by ${MANAGER.roi} G (and brings more customers when you return).`)));
  return box;
}

// ---------------------------------------------------------------- 決算書（四半期の P/L・B/S）

let qSel: number | null = null;

export function openBooks(ctx: Ctx) {
  open(ctx, t('決算書', 'Financial statements'), (body) => {
    const s = ctx.s();
    const books = s.books;
    const qs = books ? quarters(books) : [];
    // いまの四半期（途中）：締めた月 ＋ 今月のここまで
    const doneMonths = books?.months.length ?? 0;
    const inQ = doneMonths % 3;
    const curL = sumLedger([...(books?.months.slice(doneMonths - inQ).map((x) => x.l) ?? []), books?.cur ?? emptyLedger()]);
    const curQ = Math.floor(doneMonths / 3) + 1;
    const list = [...qs.filter((q) => q.done).map((q) => ({ q: q.q, l: q.l, bs: q.bs, label: t(`第 ${q.q} 四半期`, `Q${q.q}`), done: true })), { q: curQ, l: curL, bs: balance(s) as Balance, label: t(`第 ${curQ} 四半期（途中）`, `Q${curQ} (in progress)`), done: false }];
    if (qSel == null || !list.some((x) => x.q === qSel)) qSel = list[list.length - 1].q;
    body.append(h('p', 'isl-dim', t('会社ぜんたいの決算書（簡易版）。会社の月はゲームの最初から 30 日ごとに締め、3 か月で 1 四半期です。ほかのセクタの利益は「他セクタからの利益」に入ります。', 'Company-wide statements (simplified). Company months close every 30 days from the start; 3 months make a quarter. Profit from managed sectors is listed separately.')));
    const chips = h('div', 'isl-books-chips');
    for (const x of list) chips.append(btn(x.label, () => ((qSel = x.q), after(ctx)), x.q === qSel ? 'is-on' : ''));
    body.append(chips);
    const cur = list.find((x) => x.q === qSel)!;
    const p = pl(cur.l);
    const wrap = h('div', 'isl-books');
    wrap.append(plTable(p), bsTable(cur.bs, s));
    body.append(wrap);
    if (!cur.done) body.append(h('small', 'isl-dim', t(`いまは ${inQ + 1} か月目の途中です。四半期が終わると、マインちゃんが知らせます。`, `Month ${inQ + 1} of this quarter is in progress.`)));
    const d = date(s);
    void d;
  });
}

function row(tbl: HTMLElement, k: string, v: number, cls = '') {
  const r = h('div', `isl-books-row ${cls}`);
  r.append(h('span', '', k), h('b', v < 0 ? 'isl-bad' : '', money(v || 0)));
  tbl.append(r);
}

function plTable(p: ReturnType<typeof pl>): HTMLElement {
  const l: Ledger = p.l;
  const tbl = h('div', 'isl-card2 isl-books-tbl');
  tbl.append(h('h3', '', t('損益計算書（P/L）', 'Income statement (P/L)')));
  row(tbl, t('売上高', 'Sales'), p.sales, 'is-head');
  row(tbl, t('売上原価（素材）', 'Cost of goods (materials)'), -p.cogs, 'is-sub');
  row(tbl, t('売上総利益', 'Gross profit'), p.gross, 'is-sum');
  row(tbl, t('販売費・一般管理費', 'SG&A'), -p.sga, 'is-head');
  row(tbl, t('　給料', '  Wages'), -l.wages, 'is-sub');
  row(tbl, t('　アルバイト', '  Part-timers'), -l.part, 'is-sub');
  row(tbl, t('　維持費', '  Upkeep'), -l.upkeep, 'is-sub');
  row(tbl, t('　宣伝', '  Advertising'), -l.ads, 'is-sub');
  row(tbl, t('営業利益', 'Operating profit'), p.op, 'is-sum');
  row(tbl, t('営業外の収入', 'Other income'), p.nonop, 'is-head');
  row(tbl, t('　他店でバイト', '  Part-time work'), l.side, 'is-sub');
  row(tbl, t('　依頼の報酬', '  Request rewards'), l.other, 'is-sub');
  row(tbl, t('　他セクタからの利益', '  From managed sectors'), l.managed, 'is-sub');
  if (l.museum) row(tbl, t('　展示館の入館料', '  Museum admissions'), l.museum, 'is-sub');
  row(tbl, t('投資・特別な支出', 'Investment & special'), -p.special, 'is-head');
  row(tbl, t('　建物・スキル・設備', '  Buildings, skills, upgrades'), -l.build, 'is-sub');
  row(tbl, t('　通行料・出店許可申請', '  Tolls & permits'), -l.fees, 'is-sub');
  // 発掘 v2 の 7 段目：ランクアップの災害（特別損失・特別利益）
  if (l.levy) row(tbl, t('　特別損失：復興の徴収', '  Special loss: recovery levy'), -l.levy, 'is-sub');
  if (l.grant) row(tbl, t('　特別利益：復興の支度金', '  Special gain: recovery grant'), l.grant, 'is-sub');
  row(tbl, t('当期の利益', 'Net profit'), p.net, 'is-total');
  return tbl;
}

function bsTable(bs: Balance | null, s: P1State): HTMLElement {
  const b = bs ?? balance(s);
  const tbl = h('div', 'isl-card2 isl-books-tbl');
  tbl.append(h('h3', '', t('貸借対照表（B/S）', 'Balance sheet (B/S)')));
  const assets = b.cash + b.stock + b.buildings + b.invest;
  row(tbl, t('資産', 'Assets'), assets, 'is-head');
  row(tbl, t('　現金', '  Cash'), b.cash, 'is-sub');
  row(tbl, t('　在庫（素材・商品）', '  Inventory'), b.stock, 'is-sub');
  row(tbl, t('　建物', '  Buildings'), b.buildings, 'is-sub');
  row(tbl, t('　他セクタへの投資', '  Invested in sectors'), b.invest, 'is-sub');
  row(tbl, t('負債（借入金）', 'Liabilities (loans)'), 0, 'is-head');
  row(tbl, t('純資産', 'Equity'), assets, 'is-head');
  row(tbl, t('　資本金', '  Capital'), CAPITAL, 'is-sub');
  row(tbl, t('　利益剰余金', '  Retained earnings'), assets - CAPITAL, 'is-sub');
  tbl.append(h('small', 'isl-dim', t('建物は買った値段のまま（減価償却なし）。借入はまだありません。', 'Buildings at cost (no depreciation). No loans yet.')));
  return tbl;
}

// ---------------------------------------------------------------- ブランド力

export function openBrand(ctx: Ctx) {
  open(ctx, t('ブランド力', 'Brand power'), (body) => {
    const s = ctx.s();
    const v = s.brand ?? 0;
    const top = h('div', 'isl-card2 isl-brand-top');
    top.append(h('small', 'isl-dim', t('いまのブランド力', 'Brand power')), h('b', 'isl-brand-big', `★ ${v}`), h('small', 'isl-good', t(`売り場の強さ +${Math.round((brandPull(v, lvMul(s, 'd_ops')) - 1) * 100)}%（最大 +${Math.round(BRAND.pullCap * (1 + lvMul(s, 'd_ops')) * 100)}%）`, `Shop pull +${Math.round((brandPull(v, lvMul(s, 'd_ops')) - 1) * 100)}% (max +${Math.round(BRAND.pullCap * (1 + lvMul(s, 'd_ops')) * 100)}%)`)));
    body.append(top);
    // ブランド力が要るスキル
    const sk = h('div', 'isl-card2');
    sk.append(h('h3', '', t('ブランド力で開くスキル', 'Skills unlocked by brand')));
    for (const k of SKILLS.filter((x) => x.brand).sort((a, b) => (a.brand ?? 0) - (b.brand ?? 0))) {
      // v2：ブランド力が要るパネルは外周（Uncommon・Rare）。外周が開いていなければ、エリアの名前を添える
      const tier = k.tier ?? 'C';
      const closed = tier !== 'C' && !s.flags.rings?.includes(tier);
      const r = h('div', `isl-brand-skill ${v >= (k.brand ?? 0) && !closed ? 'is-on' : ''}`);
      r.append(h('b', '', `★ ${k.brand}`), h('span', '', k.name), h('small', 'isl-dim', closed ? t(`${k.note}（${TIER_NAME[tier]} のセクタに進出すると開く）`, `${k.note} (opens in a ${TIER_NAME[tier]} sector)`) : k.note));
      sk.append(r);
    }
    body.append(sk);
    const how = h('div', 'isl-card2');
    how.append(h('h3', '', t('上がるとき・下がるとき', 'What moves it')));
    const ul = h('ul', 'isl-brand-how');
    for (const line of [
      t(`ランドセクタを制覇（2 か月続けて 1 位）：+${BRAND.sectorTop}（そのあと守った月は +${BRAND.stayTop}）`, `Conquer a land sector (#1 two months running): +${BRAND.sectorTop} (+${BRAND.stayTop} each month you stay)`),
      t(`順位が上がる：1 つにつき +${BRAND.rankUp}`, `Rank up: +${BRAND.rankUp} per place`),
      t(`依頼を達成：+${BRAND.mission}・アンコモンを開発：+${BRAND.uncommon}・関所を開通：+${BRAND.gate}`, `Request: +${BRAND.mission} · Uncommon: +${BRAND.uncommon} · Gate: +${BRAND.gate}`),
      t(`新しいセクタに出店：Common +${BRAND.enter.C}・Uncommon +${BRAND.enter.U}`, `Open in a new sector: Common +${BRAND.enter.C} · Uncommon +${BRAND.enter.U}`),
      t(`順位が 2 つ以上下がる：1 つにつき −${BRAND.rankDown}`, `Rank falls 2+ places: −${BRAND.rankDown} per place`),
      t(`不祥事が発覚する（妨害工作など。これから）：−${BRAND.scandal}`, `Scandals (sabotage, later): −${BRAND.scandal}`),
    ])
      ul.append(h('li', '', line));
    how.append(ul);
    body.append(how);
    const log = h('div', 'isl-card2');
    log.append(h('h3', '', t('最近の動き', 'Recent changes')));
    if (!s.brandLog?.length) log.append(h('p', 'isl-dim', t('まだありません。最初の売上や依頼の達成で上がります。', 'Nothing yet. Your first sale or request will raise it.')));
    for (const e of s.brandLog ?? []) {
      const r = h('div', 'isl-brand-log');
      r.append(h('b', e.d > 0 ? 'isl-good' : 'isl-bad', `${e.d > 0 ? '+' : ''}${e.d}`), h('span', '', e.why), h('small', 'isl-dim', dayLabel(s, e.day)));
      log.append(r);
    }
    body.append(log);
  });
}

function dayLabel(s: P1State, day: number): string {
  const d = date({ day, open: s.open });
  return d ? t(`${d.year} 年目 ${d.month} 月 ${d.day} 日`, `Y${d.year} M${d.month} D${d.day}`) : t(`${day} 日目`, `Day ${day}`);
}
