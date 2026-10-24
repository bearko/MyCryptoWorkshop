// 報告の一行（Note）を、画面のどこに出すかで分ける（docs/design.md 1 章）：
// - 絵馬（Voice）：ステークホルダーの声と要望。直す手が 1 つに決まるものは、その場で押せるボタンを付ける
// - かわら版（News）：ライバルの動き・時代の変化・会社の出来事
// - マインちゃんの助言（Advice）：今月いちばん大事な 1 つ
import type { EmpireState, MonthReport, Note } from '../../empire/model';
import type { Decisions } from '../../empire/sim';
import { MAX_STAFF, ORDER_RANGE, STAFF_NEEDED } from '../../empire/sim';
import { rivalOf } from '../../empire/rivals';
import { t } from '../../i18n';
import { monthLabel, noteText, storeName } from './text';

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

export function voicesOf(r: MonthReport | null, e: EmpireState): Voice[] {
  if (!r) return [];
  const out: Voice[] = [];
  const seen = new Set<string>();
  const add = (v: Voice) => {
    if (seen.has(v.key)) return;
    seen.add(v.key);
    out.push(v);
  };
  const store = (id: number) => e.stores.find((s) => s.id === id);
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
        out.push({ head: noteText(n, e), hero: null, kind: 'era' });
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
  const fatigue = has('fatigue');
  if (fatigue && 'store' in fatigue) return t(`${storeName(fatigue.store)}の店主が限界です。絵馬の「シフトを増やす」を押してください。`, `${storeName(fatigue.store)}'s owner is worn out. Press "Staff" on the plaque.`);
  if (has('investigationSoon')) return t('当局の調査が来ます。オーナーへの支援を厚くするか、24 時間の強制をやめましょう。', 'An investigation is coming. Support the owners or stop forcing 24 hours.');
  const plan = has('rivalPlan');
  if (plan && 'cell' in plan) return t('ライバルが「!」の区画を狙っています。先に出店すれば防げます。', 'The rival is after the plot marked "!". Open there first to block it.');
  if (has('stockout')) return t('品切れが出ています。発注を増やすと売上が伸びますよ。', 'You ran out of stock. Ordering more will lift sales.');
  if (has('waste')) return t('廃棄が多めです。発注を少し減らしてみませんか。', 'Lots of waste. Try ordering a little less.');
  if (r && r.profit < 0) return t('先月は赤字でした。お品書きで、どの費用が重いか見てみましょう。', 'Last month was in the red. Check the ledger for the heavy costs.');
  if (e.phase === 1)
    return e.stores.length < 3
      ? t('「出店」を押すと、町に候補の区画が光ります。家賃と見込みの売上を比べて選びましょう。', 'Press "Open" to light up candidate plots on the map. Compare rent with expected sales.')
      : t('3 店そろいました。3 か月続けて黒字なら、商会に上がれます。', 'Three stores! Three profitable months in a row and you move up.');
  if (e.phase === 2) return t('物流センターから 2 マスの配送圏に店を集めると、配送費が下がります。★はおすすめの区画です。', 'Cluster stores within 2 plots of a distribution center to cut delivery costs. ★ marks good plots.');
  if (e.phase === 3) return t('物流拠点を建てたエリアにだけ出店できます。研修所で育った人の数が、月に出せる店の数です。', 'You can only open where you built a hub. Trainees per month cap your openings.');
  return t('今月の稟議をそろえて、「月を進める」を押しましょう。', 'Line up this month’s plans and press "Next month".');
}
