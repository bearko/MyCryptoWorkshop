// 報告の一行（Note）を、画面のどこに出すかで分ける（docs/design.md 1 章）：
// - 絵馬（Voice）：ステークホルダーの声と要望。直す手が 1 つに決まるものは、その場で押せるボタンを付ける
// - かわら版（News）：ライバルの動き・時代の変化・会社の出来事
// - マインちゃんの助言（Advice）：今月いちばん大事な 1 つ
import type { EmpireState, MonthReport, Note } from '../../empire/model';
import type { Decisions } from '../../empire/sim';
import { MAX_STAFF, OPEN_COST, ORDER_RANGE, STAFF_NEEDED } from '../../empire/sim';
import { rivalOf } from '../../empire/rivals';
import { t } from '../../i18n';
import { penalized, supportOf, type StakeholderId } from '../../empire/stakeholders';
import { meetingNow, pledgeKept, trustOf } from '../../empire/governance';
import { campaignActive, CAMPAIGN, counterCost } from '../../empire/rivalai';
import { REGULATION } from '../../empire/crowns';
import { pledgeProgress } from './govern';
import { CRISES, CRISIS, crisisUntil, diversifyCost, inspectCost } from '../../empire/crisis';
import { crisisName, demandText, kingName, money, monthLabel, noteText, pledgeLabel, stakeName, storeName } from './text';

export interface Voice {
  /** 誰の声か（常連客・問屋・店主・オーナー会・当局・銀行） */
  who: string;
  text: string;
  /** 期限など（あれば赤い文字） */
  due?: string;
  urgent?: boolean;
  /** 地図で見せる店 */
  store?: number;
  /** その場で直すボタン（押すと下書きに入る） */
  fix?: { label: string; apply: (d: Decisions, e: EmpireState) => Decisions };
  key: string;
}

export interface News {
  head: string;
  /** かわら版の挿絵：ライバルのヒーロー（id）か、会社のできごと（null） */
  hero: number | null;
  kind: 'rival' | 'era' | 'company';
  /** 地図で見せる区画 */
  cell?: number;
}

const storeDecision = (d: Decisions, id: number, patch: NonNullable<Decisions['stores']>[number]): Decisions => ({
  ...d,
  stores: { ...d.stores, [id]: { ...d.stores?.[id], ...patch } },
});

/** 期限までの残り（今月を含む） */
export const monthsLeft = (e: Pick<EmpireState, 'month'>, due: number) => Math.max(1, due - e.month + 1);

/** 要望の絵馬に付ける「その場で直す」手（決まった手が 1 つあるものだけ） */
function demandFix(who: StakeholderId, e: EmpireState): Voice['fix'] {
  const each = (patch: (s: EmpireState['stores'][number]) => NonNullable<Decisions['stores']>[number]) => (d: Decisions) => ({ ...d, stores: Object.fromEntries(e.stores.map((s) => [s.id, { ...d.stores?.[s.id], ...patch(s) }])) });
  if (e.phase <= 2) {
    if (who === 'wholesaler') return { label: t('全店の発注を減らす', 'Order less everywhere'), apply: each((s) => ({ order: Math.max(ORDER_RANGE[0], +(s.order - 0.1).toFixed(2)) })) };
    if (who === 'regulars') return { label: t('全店の発注と人手を足す', 'More stock and staff'), apply: each((s) => ({ order: Math.min(ORDER_RANGE[1], +(s.order + 0.1).toFixed(2)), staff: Math.max(s.staff, STAFF_NEEDED[s.hours]) })) };
    if (who === 'shotengai' && e.stores.some((s) => s.hours === 24)) return { label: t('24 時間をやめる', 'Stop 24-hour stores'), apply: each((s) => ({ hours: 16, staff: Math.max(s.staff, STAFF_NEEDED[16]) })) };
    return undefined;
  }
  if (who === 'staff' || who === 'regulars' || who === 'shotengai') return { label: t('今月の出店を半分に', 'Halve this month’s openings'), apply: (d) => ({ ...d, expand: (d.expand ?? []).map((x) => ({ ...x, count: Math.ceil(x.count / 2) })), ...(who === 'shotengai' ? { force24: false } : {}) }) };
  return undefined;
}

/** 出ている要望（期限つき）。報告が無い月も出し続ける */
function demandVoices(e: EmpireState): Voice[] {
  return (e.stake?.demands ?? []).map((d) => {
    const left = monthsLeft(e, d.due);
    return {
      key: `demand-${d.who}`,
      who: t(`${stakeName(d.who)}（支持度 ${Math.round(supportOf(e, d.who))}）`, `${stakeName(d.who)} (support ${Math.round(supportOf(e, d.who))})`),
      text: demandText(d.who, e.phase),
      due: left <= 1 ? t('期限は今月', 'Due this month') : t(`期限まであと ${left} か月`, `${left} months left`),
      urgent: true,
      fix: demandFix(d.who, e),
    };
  });
}

/** 総会での約束（1 年後の答え合わせまで、絵馬に貼っておく） */
function pledgeVoice(e: EmpireState): Voice[] {
  const p = e.gov?.pledge;
  if (!p) return [];
  const kept = pledgeKept(e, p);
  return [
    {
      key: 'pledge',
      who: e.nation?.listed ? t(`株主（信任 ${Math.round(trustOf(e))}）`, `Shareholders (trust ${Math.round(trustOf(e))})`) : t(`銀行（信任 ${Math.round(trustOf(e))}）`, `Bank (trust ${Math.round(trustOf(e))})`),
      text: t(`約束：${pledgeLabel(p.kind)}。${pledgeProgress(e) ?? ''}`, `Pledge: ${pledgeLabel(p.kind)}. ${pledgeProgress(e) ?? ''}`),
      due: t(`${monthLabel(p.due)}の総会で答え合わせ`, `Checked at the ${monthLabel(p.due)} meeting`),
      urgent: !kept && p.due - e.month <= 3,
    },
  ];
}

/** ライバルのセール攻勢（予告から終わりまで）と、分割の審査 */
function rivalVoices(e: EmpireState): Voice[] {
  const out: Voice[] = [];
  const c = e.campaign;
  const n = e.nation;
  if (c && n && e.month < c.end) {
    const r = n.regions[c.region];
    const name = r ? t(r.name.ja, r.name.en) : '?';
    const active = campaignActive(c, e.month);
    out.push({
      key: 'campaign',
      who: t(`${name}の店長たち`, `Managers in ${name}`),
      text: active ? t(`ライバルの値下げで、お客さんが ${Math.round((1 - CAMPAIGN.demand) * 100)}% 減っています`, `The rival's price cuts took ${Math.round((1 - CAMPAIGN.demand) * 100)}% of our customers`) : t('来月からライバルが値下げしてくるそうです', 'The rival cuts prices here from next month'),
      due: t(`${monthLabel(c.end - 1)}まで`, `Until ${monthLabel(c.end - 1)}`),
      urgent: active,
      fix: active ? { label: t(`対抗セール（月 ${money(counterCost(n, c))}）`, `Counter-sale (${money(counterCost(n, c))}/mo)`), apply: (d) => ({ ...d, counter: true }) } : undefined,
    });
  }
  const over = e.crowns?.overMonths ?? 0;
  if (over > 0)
    out.push({
      key: 'breakup',
      who: t('当局', 'Authorities'),
      text: t('市場のシェアが 5 割を超えています。下がらなければ、店の一部を売るよう命じます', 'Your share is over half. Unless it falls, we will order a break-up'),
      due: t(`あと ${Math.max(1, REGULATION.breakupMonths - over)} か月`, `${Math.max(1, REGULATION.breakupMonths - over)} months left`),
      urgent: true,
    });
  return out;
}

/** 危機の予兆（メーターが予兆の線を超えているあいだ）と、起きた危機の効き目 */
function crisisVoices(e: EmpireState): Voice[] {
  const c = e.crisis;
  if (!c || e.phase < 3) return [];
  const out: Voice[] = [];
  for (const id of CRISES) {
    const until = crisisUntil(e, id);
    const v = Math.round(c.meters[id]);
    if (v < CRISIS.sign && until === null) continue;
    const fix: Voice['fix'] =
      id === 'food'
        ? { label: t(`品質点検（${money(inspectCost(e))}）`, `Inspect (${money(inspectCost(e))})`), apply: (d) => ({ ...d, inspect: true }) }
        : id === 'supply'
          ? { label: t(`仕入れ先を分ける（${money(diversifyCost(e))}）`, `Spread suppliers (${money(diversifyCost(e))})`), apply: (d) => ({ ...d, diversify: true }) }
          : { label: t('今月の出店を半分に', 'Halve this month’s openings'), apply: (d) => ({ ...d, expand: (d.expand ?? []).map((x) => ({ ...x, count: Math.ceil(x.count / 2) })) }) };
    out.push({
      key: `crisis-${id}`,
      who: { food: t('お客さんの声', 'Customers'), supply: t('仕入れ担当', 'Purchasing'), overgrow: t('現場の店長たち', 'Store managers') }[id],
      text: until !== null ? noteText({ kind: 'crisis', crisis: id }, e) : noteText({ kind: 'crisisSign', crisis: id }, e),
      due: until !== null ? t(`${monthLabel(until - 1)}まで`, `Until ${monthLabel(until - 1)}`) : t(`${crisisName(id)}のおそれ ${v} / 100`, `${crisisName(id)} risk ${v} / 100`),
      urgent: true,
      fix: until === null ? fix : undefined,
    });
  }
  return out;
}

export function voicesOf(r: MonthReport | null, e: EmpireState): Voice[] {
  if (!r) return [...crisisVoices(e), ...rivalVoices(e), ...demandVoices(e), ...pledgeVoice(e)];
  const out: Voice[] = [...crisisVoices(e), ...rivalVoices(e), ...demandVoices(e), ...pledgeVoice(e)];
  const seen = new Set<string>();
  const add = (v: Voice) => {
    if (seen.has(v.key)) return;
    seen.add(v.key);
    out.push(v);
  };
  const store = (id: number) => e.stores.find((s) => s.id === id);
  for (const v of out) seen.add(v.key);
  for (const n of r.notes) {
    switch (n.kind) {
      case 'stockout': {
        const s = store(n.store);
        add({
          key: `stockout-${n.store}`,
          who: t('常連客', 'Regulars'),
          text: t(`${storeName(n.store)}で品切れ。買えずに帰りました`, `${storeName(n.store)} ran out; we left empty-handed`),
          store: n.store,
          fix: s && s.order < ORDER_RANGE[1] ? { label: t('発注を増やす', 'Order more'), apply: (d) => storeDecision(d, n.store, { order: Math.min(ORDER_RANGE[1], +(s.order + 0.1).toFixed(2)) }) } : undefined,
        });
        break;
      }
      case 'waste': {
        const s = store(n.store);
        add({
          key: `waste-${n.store}`,
          who: t('問屋', 'Wholesaler'),
          text: t(`${storeName(n.store)}は売れ残りの廃棄が多めです`, `${storeName(n.store)} is throwing a lot away`),
          store: n.store,
          fix: s && s.order > ORDER_RANGE[0] ? { label: t('発注を減らす', 'Order less'), apply: (d) => storeDecision(d, n.store, { order: Math.max(ORDER_RANGE[0], +(s.order - 0.1).toFixed(2)) }) } : undefined,
        });
        break;
      }
      case 'fatigue': {
        const s = store(n.store);
        const need = s ? STAFF_NEEDED[s.hours] : 3;
        add({
          key: `fatigue-${n.store}`,
          who: t(`店主（${storeName(n.store)}）`, `Owner (${storeName(n.store)})`),
          text: t('人手が足りず、眠くてたまりません', "We're short-handed and I'm exhausted"),
          urgent: true,
          store: n.store,
          fix: s && s.staff < Math.min(MAX_STAFF, need) ? { label: t(`シフトを ${need} 人に`, `Staff ${need}`), apply: (d) => storeDecision(d, n.store, { staff: need }) } : undefined,
        });
        break;
      }
      case 'crowded':
        add({ key: `crowded-${n.store}`, who: t('常連客', 'Regulars'), text: t(`${storeName(n.store)}のまわりは店が多すぎて、どこも混んでいない`, `Too many stores around ${storeName(n.store)}`), store: n.store });
        break;
      case 'qualityWarn':
        add({ key: 'quality', who: t('常連客', 'Regulars'), text: t('店によって品ぞろえや接客がまちまち', 'Stock and service vary from store to store') });
        break;
      case 'manualReady':
        add({ key: 'manual', who: t('従業員', 'Staff'), text: t('いまなら、うまくいく店のやり方をマニュアルにまとめられます', "Now we know what to write in a manual"), fix: { label: t('マニュアルを整える', 'Write the manual'), apply: (d) => ({ ...d, manual: true }) } });
        break;
      case 'ownerUnrest':
        add({
          key: 'owners',
          who: t(`加盟オーナー会（満足度 ${n.satisfaction}）`, `Franchise owners (satisfaction ${n.satisfaction})`),
          text: t('24 時間の強制や近すぎる出店をやめてほしい', 'Stop forcing 24 hours and opening too close'),
          urgent: n.satisfaction < 40,
          fix: e.nation?.force24 ? { label: t('24 時間の強制をやめる', 'Stop forcing 24h'), apply: (d) => ({ ...d, force24: false }) } : { label: t('支援を 1 段上げる', 'More support'), apply: (d, s) => ({ ...d, support: Math.min(3, (d.support ?? s.nation?.support ?? 0) + 1) }) },
        });
        break;
      case 'investigationSoon':
        add({ key: 'investigation', who: t('当局', 'Authorities'), text: t('オーナー会の訴えで、調査に入ります', 'Following the owners’ complaint, we will investigate'), due: e.nation?.investigation != null ? t(`${monthLabel(e.nation.investigation)}に調査`, `Investigation in ${monthLabel(e.nation.investigation)}`) : undefined, urgent: true });
        break;
      case 'landSlowing':
      case 'landFalling':
      case 'marginCall':
        add({ key: 'bank', who: t('銀行', 'Bank'), text: noteText(n, e), urgent: n.kind !== 'landSlowing' });
        break;
      case 'shortOfFunds':
        add({ key: 'funds', who: t('経理', 'Accounts'), text: t('資金が足りず、できなかったことがあります', "Some plans couldn't go ahead: not enough funds"), urgent: true });
        break;
      case 'needHub':
      case 'traineeLimit':
      case 'eraCap':
      case 'storeLimit':
        add({ key: n.kind, who: t('本部', 'Head office'), text: noteText(n, e) });
        break;
      default:
        break;
    }
  }
  return out;
}

export function newsOf(r: MonthReport | null, e: EmpireState): News[] {
  if (!r) return [];
  const rival = rivalOf(e.land);
  const out: News[] = [];
  for (const n of r.notes) {
    switch (n.kind) {
      case 'rivalPlan':
      case 'rivalOpened':
        out.push({ head: noteText(n, e), hero: rival.hero, kind: 'rival', cell: n.cell });
        break;
      case 'eraSoon':
      case 'eraChanged':
      case 'investigation':
      case 'ultimatum':
        out.push({ head: noteText(n, e), hero: null, kind: 'era' });
        break;
      case 'campaignSoon':
      case 'campaign':
        out.push({ head: noteText(n, e), hero: rival.hero, kind: 'rival' });
        break;
      case 'breakup':
      case 'breakupWarning':
      case 'regulationFine':
      case 'regulationWatch':
      case 'breakupCleared':
        out.push({ head: noteText(n, e), hero: null, kind: 'era' });
        break;
      case 'attention':
      case 'audienceInvite':
      case 'audience':
      case 'crown':
      case 'demandMet':
      case 'meetingHeld':
      case 'meetingPostponed':
      case 'pledgeResult':
      case 'meetingSoon':
        out.push({ head: noteText(n, e), hero: null, kind: 'company' });
        break;
      // フェーズ 4〜5
      case 'entered':
      case 'exited':
      case 'jvBuyout':
      case 'licenseWarning':
      case 'licenseBroke':
      case 'crisis':
        out.push({ head: noteText(n, e), hero: null, kind: 'era' });
        break;
      case 'crisisAction':
      case 'auctionSoon':
      case 'auction':
      case 'legendCrown':
      case 'tableChanged':
      case 'ending':
        out.push({ head: noteText(n, e), hero: null, kind: 'company' });
        break;
      case 'opened':
      case 'centerBuilt':
      case 'hubBuilt':
      case 'ipo':
      case 'pbUp':
      case 'promoted':
      case 'phaseReady':
        out.push({ head: noteText(n, e), hero: null, kind: 'company' });
        break;
      default:
        break;
    }
  }
  // ライバルの記事を先に
  return out.sort((a, b) => Number(b.kind === 'rival') - Number(a.kind === 'rival'));
}

/** マインちゃんの今月のひと言（いちばん大事な 1 つ）。無ければフェーズごとの手ほどき */
export function adviceOf(r: MonthReport | null, e: EmpireState, ready: boolean): string {
  const has = (k: Note['kind']) => r?.notes.find((n) => n.kind === k);
  if (ready) return t('条件を満たしました！ 下の「次の格へ」から、会社を大きくできます。', 'Goal met! Use "Next stage" below to grow the company.');
  const sign = CRISES.find((id) => (e.crisis?.meters[id] ?? 0) >= CRISIS.sign && crisisUntil(e, id) === null);
  if (sign) return t(`${crisisName(sign)}の予兆です！ 絵馬掛けのボタンで、起きる前に手を打っておきましょう。`, `Signs of a ${crisisName(sign).toLowerCase()}! Use the button on the plaque before it strikes.`);
  if ((e.crowns?.overMonths ?? 0) > 0) return t('シェアが 5 割を超え、当局が分割の審査を始めました。出店を止めるか、加盟店を手放してシェアを下げましょう。', 'Over half the market: a break-up review began. Stop opening or shed stores.');
  if (e.campaign && campaignActive(e.campaign, e.month)) return t('ライバルの値下げ攻勢です。絵馬の「対抗セール」で客足を守れます（費用がかかります）。', 'A rival price war. Use the counter-sale on the plaque to keep customers (it costs money).');
  if (e.court?.invited && !e.court.audience) return t(`${kingName(e.land)}から謁見の招待です！ 下の「${kingName(e.land)}」で献上の品を選んでから、月を進めましょう。`, `${kingName(e.land)} invites you! Pick an offering under "${kingName(e.land)}", then advance.`);
  // 渡ったランドのキングからの招待と、ライセンスの独立
  const invitedAbroad = e.world?.branches.find((b) => b.court.invited && !b.court.audience);
  if (invitedAbroad) return t(`${invitedAbroad.land}の${kingName(invitedAbroad.land)}から謁見の招待です！ 海図から${invitedAbroad.land}を開き、「${kingName(invitedAbroad.land)}」で献上の品を選びましょう。`, `${kingName(invitedAbroad.land)} of ${invitedAbroad.land} invites you! Open ${invitedAbroad.land} from the chart and pick an offering.`);
  const lic = has('licenseWarning');
  if (lic && 'land' in lic) return t(`${lic.land}の提携先が独立を言い出しそうです。その月に支社の「買い取る」を選ばないと、店ごとライバルになります。`, `Your licensee in ${lic.land} wants out. Buy them out from the branch that month, or they become a rival.`);
  if (meetingNow(e)) return e.nation?.listed ? t('今月は株主総会です。下の「株主総会」で、たたえる相手・ライバル・来年の約束を決めましょう。', "It's the shareholders' meeting this month. Choose your speech under \"Shareholders\".") : t('今月は銀行との面談です。下の「銀行と面談」で、話すことを決めましょう。', 'You meet the bank this month. Choose what to say under "Bank meeting".');
  const last = (e.stake?.demands ?? []).find((d) => monthsLeft(e, d.due) <= 1);
  if (last) return t(`${stakeName(last.who)}の要望の期限は今月です。絵馬の手を打たないと、最後通告になります。`, `${stakeName(last.who)}'s request is due this month. Act on the plaque or face an ultimatum.`);
  const hit = (['regulars', 'wholesaler', 'shotengai', 'staff', 'shareholders'] as const).find((w) => penalized(e, w));
  if (hit && r?.notes.some((n) => n.kind === 'ultimatum')) return t(`${stakeName(hit)}の最後通告がしばらく効きます。同じことを繰り返さないようにしましょう。`, `${stakeName(hit)}'s ultimatum will bite for a while. Don't repeat it.`);
  const fatigue = has('fatigue');
  if (fatigue && 'store' in fatigue) return t(`${storeName(fatigue.store)}の店主が限界です。絵馬の「シフトを増やす」を押してください。`, `${storeName(fatigue.store)}'s owner is worn out. Press "Staff" on the plaque.`);
  if (has('investigationSoon')) return t('当局の調査が来ます。オーナーへの支援を厚くするか、24 時間の強制をやめましょう。', 'An investigation is coming. Support the owners or stop forcing 24 hours.');
  const plan = has('rivalPlan');
  if (plan && 'cell' in plan) return t('ライバルが「!」の区画を狙っています。先に出店すれば防げます。', 'The rival is after the plot marked "!". Open there first to block it.');
  if (has('stockout')) return t('品切れが出ています。発注を増やすと売上が伸びますよ。', 'You ran out of stock. Ordering more will lift sales.');
  if (has('waste')) return t('廃棄が多めです。発注を少し減らしてみませんか。', 'Lots of waste. Try ordering a little less.');
  if (r && r.profit < 0) return t('先月は赤字でした。お品書きで、どの費用が重いか見てみましょう。', 'Last month was in the red. Check the ledger for the heavy costs.');
  if (e.phase === 1) {
    if (e.stores.length >= 3) return t('3 店そろいました。3 か月続けて黒字なら、商会に上がれます。', 'Three stores! Three profitable months in a row and you move up.');
    if (e.funds < OPEN_COST)
      return t(`2 号店には ${money(OPEN_COST)} かかります。それまでは 1 号店の発注と営業時間を整えて、黒字を積みましょう。点線の区画が出店の候補です。`, `A new store costs ${money(OPEN_COST)}. Until then, tune store 1's orders and hours. Dashed plots are candidates.`);
    return t('点線の区画が出店の候補です（★がおすすめ）。押すと、家賃と見込みの利益を比べられます。', 'Dashed plots are candidates (★ is the best). Tap one to compare rent and expected profit.');
  }
  if (e.phase === 2) return t('物流センターから 2 マスの配送圏に店を集めると、配送費が下がります。★はおすすめの区画です。', 'Cluster stores within 2 plots of a distribution center to cut delivery costs. ★ marks good plots.');
  if (e.phase >= 5 && e.group) {
    if (e.month === e.group.nextAuction) return t('今月は地主会です。指示の「地主会」で、Legendary の区画の数と付け値を決めましょう。', 'The auction is this month. Set Legendary plots and bids under "Auction".');
    if (e.group.table.filter(Boolean).length <= 1) return t('会議卓の空いたマスを押して、業態カードを置きましょう。相性のよいカードが隣り合うと、シナジーの線がつながります。', 'Tap an empty slot on the board table to place a business. Good neighbors link up.');
    return t('Legendary エリアで、ライバルより多くの区画と店を持つと 3 冠に近づきます。会議卓のブランド力と影響力も効きますよ。', 'More plots and stores than the rival in each Legendary area bring the crowns closer. The table adds brand and influence too.');
  }
  if (e.phase >= 4 && e.world) {
    if (!e.world.branches.length) return t('海図の島を押すと、渡り方と費用が出ます。遅れて渡るほど、ほかの会社の店が増えていますよ。', 'Tap an island on the chart to see how to enter and what it costs. The longer you wait, the more rivals there are.');
    return t('渡ったランドでは、研修所を建てて店長を育て、Common のエリアから広げます。そのランドのキングの好みに合わせると、注目が集まります。', 'In a new land, build a training center and grow from the Common area. Suit the local king to draw attention.');
  }
  if (e.phase === 3) return t('物流拠点を建てたエリアにだけ出店できます。研修所で育った人の数が、月に出せる店の数です。', 'You can only open where you built a hub. Trainees per month cap your openings.');
  return t('今月の稟議をそろえて、「月を進める」を押しましょう。', 'Line up this month’s plans and press "Next month".');
}
