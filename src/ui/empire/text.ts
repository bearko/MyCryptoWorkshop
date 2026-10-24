// 経営モードの言葉（会社の格、月、報告の一行、区画の呼び名）。画面の部品から使う。
import type { EmpireState, Note, PlotKind } from '../../empire/model';
import { rivalOf } from '../../empire/rivals';
import { STAKEHOLDERS, ULTIMATUM, type StakeholderId } from '../../empire/stakeholders';
import { isEn, t } from '../../i18n';
import { fmt } from '../dom';

/** 会社の格（フェーズごとの呼び名） */
export function companyTitle(e: Pick<EmpireState, 'name' | 'phase'>): string {
  const n = e.name;
  switch (e.phase) {
    case 1:
      return t(`${n}商店`, `${n} Store`);
    case 2:
      return t(`${n}商会`, `${n} Trading`);
    case 3:
      return t(`株式会社${n}`, `${n} Inc.`);
    case 4:
      return t(`${n}インターナショナル`, `${n} International`);
    default:
      return t(`${n}ホールディングス`, `${n} Holdings`);
  }
}

export const monthLabel = (month: number) => t(`${Math.floor(month / 12) + 1}年目 ${(month % 12) + 1}月`, `Year ${Math.floor(month / 12) + 1}, month ${(month % 12) + 1}`);
export const storeName = (id: number) => t(`${id}号店`, `Store ${id}`);
/**
 * 金額。日本語は「1億1,840万」「−7,810万」のように万・億で丸める（design/keieimode/README.md「言葉づかい」）。
 * 英語は工房と同じ fmt（1.18B など）
 */
export function money(v: number): string {
  const sign = v < 0 ? '−' : '';
  const a = Math.abs(Math.round(v));
  if (isEn) return sign + fmt(a);
  if (a < 10_000) return sign + a.toLocaleString('ja-JP');
  const oku = Math.floor(a / 1e8);
  const man = Math.floor((a % 1e8) / 1e4);
  if (oku >= 10_000) return sign + fmt(a);
  if (oku === 0) return `${sign}${man.toLocaleString('ja-JP')}万`; // i18n-ja（英語は上で返す）
  return `${sign}${oku.toLocaleString('ja-JP')}億${man ? `${man.toLocaleString('ja-JP')}万` : ''}`; // i18n-ja
}

/** 大きな数を短く（ヘッダーのチップなど）。「1.2億」「3,400万」 */
export function shortMoney(v: number): string {
  const sign = v < 0 ? '−' : '';
  const a = Math.abs(Math.round(v));
  if (isEn || a < 1e8) return sign + (isEn ? fmt(a) : money(a));
  const oku = a / 1e8;
  const digits = oku >= 100 ? 0 : oku >= 10 ? 1 : 2;
  const k = 10 ** digits;
  return `${sign}${(Math.floor(oku * k) / k).toLocaleString('ja-JP', { maximumFractionDigits: digits })}億`; // i18n-ja
}

/** 地図の区画の呼び名（A1〜H6） */
export const cellName = (w: number, i: number) => `${String.fromCharCode(65 + (i % w))}${Math.floor(i / w) + 1}`;

/** 報告の一行（予兆を含む）。ライバルの名前と区画の呼び名に会社の状態を使う */
export function noteText(n: Note, e?: Pick<EmpireState, 'land' | 'area' | 'nation'> & Partial<Pick<EmpireState, 'phase'>>): string {
  const rival = rivalOf(e?.land);
  const rivalName = t(rival.company.ja, rival.company.en);
  const cell = (i: number) => cellName(e?.area?.w ?? 8, i);
  const region = (i: number) => {
    const r = e?.nation?.regions[i];
    return r ? t(r.name.ja, r.name.en) : '?';
  };
  switch (n.kind) {
    case 'fatigue':
      return t(`${storeName(n.store)}の店主が眠そうです。人手が足りていません`, `The owner of ${storeName(n.store)} looks exhausted. The shifts are short-handed`);
    case 'waste':
      return t(`${storeName(n.store)}は売れ残りの廃棄が多めです。発注を絞ってもよさそうです`, `${storeName(n.store)} is throwing away a lot. Consider ordering less`);
    case 'stockout':
      return t(`${storeName(n.store)}で欠品が出ています。発注を増やすと売上が伸びそうです`, `${storeName(n.store)} ran out of stock. Ordering more could lift sales`);
    case 'opened':
      return t(`${storeName(n.store)}が開店しました！`, `${storeName(n.store)} is open!`);
    case 'shortOfFunds':
      return t('資金が足りず、できなかったことがあります', "Some plans couldn't go ahead: not enough funds");
    case 'storeLimit':
      return t('いまの会社の格では、これ以上は店を出せません', "The company can't run more stores at this stage");
    case 'phaseReady':
      return t('3 店舗で 3 か月続けて黒字！ 次の格へ上がる条件を満たしました', 'Three stores in the black for three months running: ready for the next stage!');
    case 'promoted':
      return t('会社の格が上がりました！', 'The company moved up a stage!');
    case 'rivalPlan':
      return t(`${rivalName}が ${cell(n.cell)} に出店を計画しているようです`, `${rivalName} seems to be planning a store at ${cell(n.cell)}`);
    case 'rivalOpened':
      return t(`${rivalName}が ${cell(n.cell)} に出店しました`, `${rivalName} opened a store at ${cell(n.cell)}`);
    case 'centerBuilt':
      return t(`${cell(n.cell)} に物流センターができました`, `A distribution center opened at ${cell(n.cell)}`);
    case 'hubBuilt':
      return t(`${region(n.region)}に物流拠点と工場ができました。ここから出店できます`, `A hub and factory opened in the ${region(n.region)}. You can open stores there now`);
    case 'needHub':
      return t(`${region(n.region)}には物流拠点がないので、出店できませんでした`, `No stores opened in the ${region(n.region)}: it has no hub yet`);
    case 'traineeLimit':
      return t(`研修所で育った店長・オーナーは月に ${n.trainees} 人まで。残りの出店は来月以降です`, `Only ${n.trainees} managers and owners finish training a month. The rest of the openings wait`);
    case 'qualityWarn':
      return t('「店によって品ぞろえや接客がまちまち」という声が届いています', 'Customers say the stores vary in stock and service');
    case 'manualReady':
      return t('品質が崩れてきました。いまならマニュアルにまとめられます', 'Quality is slipping. Now you know what to write in a manual');
    case 'ownerUnrest':
      return t(`加盟店のオーナーたちの不満が高まっています（満足度 ${n.satisfaction}）。24 時間の強制や近すぎる出店を見直しましょう`, `Franchise owners are growing unhappy (satisfaction ${n.satisfaction}). Rethink forced 24-hour opening and crowded openings`);
    case 'investigationSoon':
      return t('オーナーの会が当局に訴えました。2 か月後に調査が入ります', 'The owners took their case to the authorities. An investigation starts in two months');
    case 'investigation':
      return t(`当局の調査で、制裁金 ${fmt(Math.round(n.fine))} を払いました。24 時間の強制はやめさせられました`, `The investigation ended with a fine of ${fmt(Math.round(n.fine))}. Forced 24-hour opening had to stop`);
    case 'eraSoon':
      return n.strict
        ? t(`${monthLabel(n.month)}から、大きな店の出店規制がまた厳しくなるようです`, `From ${monthLabel(n.month)}, store-opening rules look set to tighten again`)
        : t(`外からの圧力で、${monthLabel(n.month)}から出店規制が緩むようです。ライバルも勢いづきます`, `Under outside pressure, store-opening rules loosen from ${monthLabel(n.month)}. Rivals will speed up too`);
    case 'eraChanged':
      return n.strict ? t('出店規制が厳しくなりました（月の出店に上限・費用が 3 割増し）', 'Opening rules tightened (a monthly cap, and openings cost 30% more)') : t('出店規制が緩みました。ライバルも出店を急いでいます', 'Opening rules loosened. Rivals are opening faster too');
    case 'eraCap':
      return t(`出店規制で、今月の出店は ${n.cap} 店までです`, `Opening rules cap this month at ${n.cap} stores`);
    case 'landSlowing':
      return t('地価の上がり方が鈍ってきました。土地を担保にした借入には気をつけましょう', 'Land prices are rising more slowly. Be careful with land-backed loans');
    case 'landFalling':
      return t('地価が下がり始めました。担保の値打ちが減っていきます', 'Land prices have started to fall. Your collateral is shrinking');
    case 'marginCall':
      return t(`担保割れで、借入 ${fmt(Math.round(n.amount))} を返すよう求められました`, `Collateral fell short: you had to repay ${fmt(Math.round(n.amount))} of loans`);
    case 'ipo':
      return t(`上場しました！ ${fmt(Math.round(n.raised))} を集めました（持分は薄まります）`, `You went public and raised ${fmt(Math.round(n.raised))} (your stake is diluted)`);
    case 'demand':
      return t(`${stakeName(n.who)}から要望：${demandText(n.who, e?.phase)}`, `${stakeName(n.who)} asks: ${demandText(n.who, e?.phase)}`);
    case 'demandMet':
      return t(`${stakeName(n.who)}の要望に応えました`, `You met ${stakeName(n.who)}'s request`);
    case 'ultimatum':
      return ultimatumText(n.who, n.months);
    case 'pbUp':
      return t(`PB（自社ブランド）を広げました（${n.level} 段目）。本店の工房の品が店に並びます`, `Private brand expanded (level ${n.level}). Goods from the main workshop hit the shelves`);
    case 'crowded':
      return t(`${storeName(n.store)}は近くの店とお客さんを取り合っています`, `${storeName(n.store)} is competing for customers with nearby stores`);
  }
}

/** 区画の呼び名 */
export function plotLabel(kind: PlotKind): string {
  switch (kind) {
    case 'home':
      return t('創業の地', 'Founding site');
    case 'station':
      return t('駅前', 'By the station');
    case 'office':
      return t('オフィス街', 'Office district');
    case 'school':
      return t('学校のそば', 'Near a school');
    case 'residential':
      return t('住宅街', 'Residential area');
    case 'suburb':
      return t('郊外の幹線道路', 'Suburban highway');
    case 'liquor':
      return t('酒屋からの転換', 'Converted liquor store');
  }
}

/** ステークホルダーの呼び名 */
export function stakeName(who: StakeholderId): string {
  const d = STAKEHOLDERS.find((x) => x.id === who)!;
  return t(d.name.ja, d.name.en);
}

/** 要望の中身（支持度が下がった理由と、戻す手） */
export function demandText(who: StakeholderId, phase = 1): string {
  switch (who) {
    case 'regulars':
      if (phase >= 3) return t('急いで増やした店の品ぞろえと接客が荒れています。出店をゆるめるか、マニュアルを', 'Rushed stores have poor shelves and service. Slow down or write the manual');
      return t('品切れや混雑が続いています。品ぞろえと接客を戻してほしい', 'Too many stock-outs and crowds. Bring back the shelves and service');
    case 'wholesaler':
      return t('売れ残りの廃棄が多すぎます。発注をしぼってほしい', 'Far too much is thrown away. Order less');
    case 'shotengai':
      return t('24 時間の店や、近すぎる出店をひかえてほしい', 'Fewer 24-hour stores, and stop opening so close together');
    case 'staff':
      return t('人が育つ前に店を増やさないでほしい', 'Stop opening stores faster than people can be trained');
    case 'owners':
      return t('24 時間の強制や近すぎる出店をやめてほしい', 'Stop forcing 24 hours and opening too close');
    case 'shareholders':
      return t('赤字が続いています。利益を戻してほしい', 'Losses keep coming. Get back to profit');
  }
}

/** 最後通告（期限までに応えられなかったとき）。何が起きて、いつまで続くか */
export function ultimatumText(who: StakeholderId, months: number): string {
  switch (who) {
    case 'regulars':
      return t(`常連客が離れました。${months} か月、客足が ${Math.round((1 - ULTIMATUM.regulars.demand) * 100)}% 落ちます`, `Regulars walked away: ${Math.round((1 - ULTIMATUM.regulars.demand) * 100)}% fewer customers for ${months} months`);
    case 'wholesaler':
      return t(`問屋が卸値を上げました。${months} か月、原価が上がります`, `The wholesaler raised prices for ${months} months`);
    case 'shotengai':
      return t(`商店街の地主が家賃を ${Math.round((ULTIMATUM.shotengai.rent - 1) * 100)}% 上げました（${months} か月）`, `Landlords raised rent ${Math.round((ULTIMATUM.shotengai.rent - 1) * 100)}% for ${months} months`);
    case 'staff':
      return t('従業員がストライキ。今月は客足が落ちます', 'Staff on strike: fewer customers this month');
    case 'shareholders':
      return t(`銀行が貸し出しの枠を半分にしました（${months} か月）`, `The bank halved your credit line for ${months} months`);
    case 'owners':
      return t('加盟オーナー会が当局に訴えました', 'The franchise owners went to the authorities');
  }
}
