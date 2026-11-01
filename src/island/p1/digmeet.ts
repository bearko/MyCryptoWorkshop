/**
 * 発掘との出会い・お題の発表・調査依頼状・助言・月次報告の 1 行（docs/ISLAND_PHASE1.md「地層の発掘と研究ポイント」の
 * 「お題・発表・調査依頼状」「発掘との出会い」）。ここは DOM を持たない決まりごと（テストできる純粋な関数）。画面は main.ts。
 */
import { t } from '../../i18n';
import { DEF } from '../defs';
import { DIG, DIG_PANELS, DIG_THEME, SECTOR_CHIEF, TOP_STREAK, type Tier } from './data';
import { sectorDef } from './company';
import { digLayout, digLayouts, extName, has, hasLetter, monopolyLeft, openRelics, permitFee, presentLock, sessionSec, topicProgress, topicsOf, wasteName, type DigGot, type P1State, type PBuilding, type Report } from './model';

// ---------------------------------------------------------------- 発掘との出会い（2 か月目の途中、初めて手が空いたとき）

/** 操作がないまま、この日数たったら出会う */
export const MEET_IDLE_DAYS = 5;

/** 荒れ地の「⛏ 発掘する」・町の長の印・発掘の助言を出してよい（出会いの会話＝国の役所からの手紙が終わった） */
export const digMet = (s: Pick<P1State, 'flags'>) => !!s.flags.digMeet;

/**
 * 出会いを出してよい：チュートリアル（見習い期間）が終わり、最初の月の締め（月末ポーズ）のあとで、
 * 時間が動いていて（月末ポーズではない）、このセクタに荒れ地があり、操作がないまま MEET_IDLE_DAYS 日たった。
 * 古いセーブで 2 か月目を過ぎているものも、読み込んだあとの次の空き時間に同じ出会いを出す（digMeet が無いので）。
 * 荒れ地を掘るのに工房は要らない（工房の裏の発掘場はやめた）
 */
export function meetReady(s: P1State, idleDays: number): boolean {
  if (digMet(s)) return false;
  if (typeof s.tut === 'number' && s.tut < 99) return false;
  if (!s.reports.length || s.monthPause || s.digRun) return false;
  if (!s.dig) return false;
  return idleDays >= MEET_IDLE_DAYS;
}

/** 出会いの会話（国の役所からの手紙。セリフ 1〜3。1 枚 2 文・最後は次にすること） */
export const MEET_LINES = (): string[] => [
  t('[[国の役所]]から手紙が届いたよ！ Lime は国策を変えて、いま[[復興]]の真っ最中なんだって。', 'A letter from the [[national office]]! Lime changed its policy and is in the middle of a [[revival]].'),
  t('町の[[荒れ地]]を掘って整地すれば、建物を建てられるようになる。昔の Lime が栄えていた頃の[[遺物]]も眠っているかも！', 'Dig and level the town’s [[wastelands]] and they become buildable. [[Relics]] from Lime’s golden age may lie beneath!'),
  t('1 か所目の[[発掘許可]]をもらったよ。光っている荒れ地をタップして、掘ってみよう！', 'We got our first [[dig permit]]. Tap the glowing wasteland and start digging!'),
];
/** 最初の発掘作業が終わったあと（セリフ 4） */
export const MEET_FOUND = (): string => t('遺物の[[エクステ]]を見つけると[[研究ポイント]]が貯まるよ。スキルツリーの四角いパネルを開いてみよう！', 'Finding relic [[extensions]] earns [[research points]]. Try opening a square panel in the skill tree!');

/** 出会いの最初の発掘作業のあいだ、発掘画面のマインちゃんの一言（壁の掘り方） */
export const MEET_WALL = (): string => t('壁のマスをタップすると、手前の土から 1 枚ずつはがれるよ。ひびの隙間に何か見えたら、そこを掘ってみよう！', 'Tap a cell in the wall to peel the soil off one layer at a time. If you glimpse something through a crack, dig there!');
/** 初めて覗き見が出たとき（1 回だけ。作業を止めない小さな吹き出し） */
export const PEEK_TIP = (): string => t('ひびの隙間に何か見える！ そのマスを掘り進めよう。', 'Something shows through the cracks! Keep digging that cell.');
/** 出会いの途中の、地図のマインちゃんの一言（いまやること） */
export function meetTip(s: Pick<P1State, 'flags' | 'dig' | 'digRun'>): string | null {
  const ph = s.flags.digMeet;
  // 荒れ地の無いセクタへ移ったら、荒れ地をタップ・掘る段の一言は出さない（戻れば続き）
  if ((ph === 'tap' || ph === 'open') && !s.dig) return null;
  if (ph === 'tap') return t('光っている[[荒れ地]]をタップして、「⛏ 発掘する」を押そう！', 'Tap the glowing [[wasteland]], then press “⛏ Dig”!');
  if (ph === 'open') return s.digRun ? MEET_WALL() : t('光っている[[荒れ地]]をタップして、「⛏ 発掘する」を押そう！', 'Tap the glowing [[wasteland]], then press “⛏ Dig”!');
  if (ph === 'skill') return t('光っている「[[スキル]]」タブから、四角い[[研究パネル]]を開いてみよう！', 'Open the glowing [[Skills]] tab and try a square [[research panel]]!');
  return null;
}

// ---------------------------------------------------------------- 町の長（セクター長・シャドーヒーロー）

/** そのセクタの町の長のヒーロー（仮の絵。data.ts の SECTOR_CHIEF。発掘場の無いセクタは null） */
export const chiefOf = (sector: string): number | null => SECTOR_CHIEF[sector] ?? null;

const homeCache = new Map<string, number | null>();
/**
 * 町の長の家：町の既存の建物（住宅）のうち、公園にいちばん近いもの（仮。無ければ区画の真ん中に近いもの）。
 * 町の建物は動かないので、同じセクタはいつも同じ家。
 */
export function chiefHome(s: P1State): PBuilding | null {
  if (!s.dig || chiefOf(s.dig.sector) == null) return null;
  const key = `${s.dig.sector}:${s.seed}:${s.buildings.length}`;
  if (homeCache.has(key)) {
    const uid = homeCache.get(key);
    const b = s.buildings.find((x) => x.uid === uid);
    if (b) return b;
  }
  const park = s.buildings.find((b) => b.owner === 'town' && b.id === 'park');
  const [ci, cj] = park ? [park.i, park.j] : [(s.n - 1) / 2, (s.n - 1) / 2];
  let best: PBuilding | null = null;
  let bd = Infinity;
  for (const b of s.buildings) {
    if (b.owner !== 'town' || DEF[b.id]?.cat !== 'home') continue;
    const d = Math.abs(b.i - ci) + Math.abs(b.j - cj);
    if (d < bd || (d === bd && best && b.uid < best.uid)) {
      bd = d;
      best = b;
    }
  }
  homeCache.set(key, best?.uid ?? null);
  return best;
}
export const isChiefHome = (s: P1State, b: PBuilding) => chiefHome(s)?.uid === b.uid;

/** 研究成果を発表できる（出会いのあと・お題がそろった・まだ発表していない） */
export const canPresent = (s: P1State) => digMet(s) && presentLock(s) === null;

/** 発表で受け取る調査依頼状のランク（Common → U・Uncommon → R。もう持っていれば null） */
export function letterToGet(s: P1State): Tier | null {
  const L = s.dig ? digLayout(s.dig.sector) : null;
  if (!L) return null;
  const next: Tier = L.tier === 'C' ? 'U' : 'R';
  return hasLetter(s, next) ? null : next;
}

/** 発表の会話（3 枚：マインちゃん → 町の長 → 町の長）。who が null の枚はマインちゃん */
export function presentPages(s: P1State): { text: string; who: number | null }[] {
  const L = s.dig ? digLayout(s.dig.sector) : null;
  const chief = chiefOf(s.dig?.sector ?? '');
  const n = topicsOf(s.dig?.sector ?? '').length;
  const tier = L?.tier ?? 'C';
  const next = letterToGet(s);
  const nextName = next === 'U' ? 'Uncommon' : next === 'R' ? 'Rare' : '';
  return [
    { who: null, text: t(`[[町の長]]、この町の荒れ地からお題が ${n} つそろいました！ 研究の成果を聞いてください。`, `[[Town head]], we found all ${n} targets in this town’s wastelands! Please hear our findings.`) },
    {
      who: chief,
      text:
        tier === 'C'
          ? t('見事だ…。荒れ地の下には、栄えていた頃の Lime の[[職人の町]]が眠っていたのだな。', 'Remarkable… Beneath the wasteland lies the [[crafters’ town]] of Lime’s golden age.')
          : t('9 つのランドの品が、ひとつの地層から…。Lime は昔、ほかの国と[[交易]]でつながっていたのだな。', 'Goods of nine lands in one stratum… Long ago, Lime was linked to other lands by [[trade]].'),
    },
    {
      who: chief,
      text: next
        ? next === 'R'
          ? t(`その研究、もっと先の町でも続けてくれ。[[${nextName} の調査依頼状]]を書いておこう（Rare の町はまだ霧の向こうだがな）。`, `Carry this research further. I’ll write you a [[${nextName} survey request]] (though Rare towns are still beyond the mist).`)
          : t(`その研究、もっと大きな町でも続けてくれ。[[${nextName} の調査依頼状]]を書いておこう。`, `Carry this research to bigger towns. I’ll write you a [[${nextName} survey request]].`)
        : t('礼に、町の古い記録を見せよう。Lime の復興の足しにしてくれ。', 'As thanks, let me show you the town’s old records. Put them to work for Lime’s revival.'),
    },
  ];
}

/** 発表のあとのマインちゃんの一言（受け取る演出の中。最後は次にすること） */
export function presentAfter(letter: Tier | null): string {
  if (letter === 'U') return t('[[調査依頼状]]で、Uncommon のセクタに出店できるようになったよ。お金がたまったら、ランドマップから出店しよう！', 'With the [[survey request]], you can open in Uncommon sectors. Once you have the funds, open there from the land map!');
  if (letter === 'R') return t('[[Rare の調査依頼状]]をもらったよ。Rare の町への道が開いたら使えるはず。まずは研究ポイントでスキルを開こう！', 'We got a [[Rare survey request]]. It will help once the road to Rare towns opens. For now, spend research points on skills!');
  return t('[[研究ポイント]]が貯まったね。スキルツリーの四角いパネルを開こう！', 'Your [[research points]] grew. Open a square panel in the skill tree!');
}

// ---------------------------------------------------------------- 到着の案内（2 か所目から）のお題の 1 枚

/** 「この町の荒れ地には[[〇〇]]が眠っているはず。お題は 3 つ、そろったら町の長に発表しよう！」（荒れ地の無いセクタは null） */
export function topicsPage(sector: string): string | null {
  const theme = DIG_THEME[sector];
  const n = topicsOf(sector).length;
  if (!theme || !n) return null;
  return t(`この町の荒れ地には、栄えていた頃の[[${theme}]]が眠っているはず。お題は ${n} つ、そろったら[[町の長]]に発表しよう！`, `This town’s wastelands should hold [[${theme}]] from Lime’s golden age. There are ${n} targets — once you have them all, present to the [[town head]]!`);
}

// ---------------------------------------------------------------- マインちゃんの助言（発掘）

export type DigTipKey = 'present' | 'idle' | 'permit' | 'topic-one' | 'letter' | 'relic' | 'branch';
/**
 * 発掘の助言。tier は、いまの助言の並び（main.ts の tutorial）のどこに入れるか：
 * - high：受け取れるもの（お題がそろって発表できる）。依頼の報酬の受け取りと同じ所（休業・倉庫の「止まっている」の後）
 * - mid：もったいない・あと少し（許可のある荒れ地をしばらく掘っていない／次の荒れ地の許可が取れる／お題があと 1 つ）。
 *   素材が少ない・休んでいる人（お店が止まる）の後、1 位の守りの前（いつも出がちなので、止まっているものより下）
 * - low：次のランクへ（調査依頼状をもらったのに Uncommon に行っていない）。四半期の決算の後、ランドマップの紹介の前
 * site：ボタンで吹き出しを開く荒れ地
 */
export interface DigTip {
  key: DigTipKey;
  tier: 'high' | 'mid' | 'low';
  text: string;
  site?: number;
}
export const DIG_TIP_ORDER: DigTipKey[] = ['present', 'relic', 'idle', 'permit', 'topic-one', 'letter', 'branch'];
/** 発掘の枝が雲から出たあとの 1 回だけの一言（流れを止めない助言） */
export const BRANCH_TIP = () => t('[[発掘]]の枝ができたよ！ お金で[[追加申請]]をすると、1 回の発掘が長くなる。', 'A [[Digging]] branch appeared! Spend funds on [[Extra dig time]] to make each dig run longer.');
/** 「深い層の許可が要る」マスを初めて押したとき（発掘場のパネルの中に出す） */
export const DEEP_TIP = () => t('この奥の層は国の許可が要るんだ。スキルツリーの[[深い層の許可]]で掘れるようになるよ。', 'Deeper layers need the nation’s permit. Get the [[Deep-layer permit]] in the skill tree to dig there.');
/** 許可のある荒れ地を、この日数のあいだ掘っていなければ「15 秒だけ掘ってみよう」 */
export const DIG_IDLE_DAYS = 10;

/** いま出せる発掘の助言（優先の順。出会いの前・発掘作業のあいだは発表のほか無し） */
export function digTips(s: P1State): DigTip[] {
  if (!digMet(s) || s.flags.digMeet === 'tap') return [];
  const out: DigTip[] = [];
  if (canPresent(s)) out.push({ key: 'present', tier: 'high', text: t('お題が全部そろったね！ [[町の長]]の家で、研究成果を発表しよう。', 'All targets found! Present your findings at the [[town head]]’s house.') });
  const d = s.dig;
  // 復刻品の独占があと 1 か月：次の遺物を掘って、新しい復刻品を用意しよう（許可のある荒れ地へ）
  const ending = d && !s.digRun ? relicEnding(s) : null;
  if (d && ending) {
    const site = d.sites.findIndex((x, k) => k === d.cur && x.permit && !x.done);
    const any = d.sites.findIndex((x) => x.permit && !x.done);
    const k = site >= 0 ? site : any;
    if (k >= 0) out.push({ key: 'relic', tier: 'mid', site: k, text: t(`「${ending.name}」の独占はあと 1 か月。次の遺物を掘って、新しい[[復刻品]]を用意しよう！`, `The monopoly on ${ending.name} ends in a month. Dig up the next relic and get a new [[revival]] ready!`) });
  }
  if (d && !s.digRun) {
    const open = d.sites.map((x, k) => ({ x, k })).filter(({ x }) => x.permit && !x.done);
    if (open.length && s.day - (d.last ?? -1e9) >= DIG_IDLE_DAYS) {
      const k = (open.find(({ k }) => k === d.cur) ?? open[0]).k;
      const sec = sessionSec(s);
      out.push({ key: 'idle', tier: 'mid', site: k, text: t(`[[${wasteName(d.sector, k)}]]で ${sec} 秒だけ掘ってみよう！ 売れるのを待つあいだに、研究ポイントが貯まるよ。`, `Dig at the [[${wasteName(d.sector, k)}]] for just ${sec} seconds! Earn research points while sales come in.`) });
    }
    const no = d.sites.findIndex((x) => !x.permit);
    const fee = permitFee(s);
    if (no >= 0 && s.money >= fee)
      out.push({ key: 'permit', tier: 'mid', site: no, text: fee > 0 ? t(`次の荒れ地の[[発掘許可]]を申請しよう（申請料 ${fee.toLocaleString('en-US')} G）。[[${wasteName(d.sector, no)}]]をタップ！`, `Apply for the next [[dig permit]] (${fee.toLocaleString('en-US')} G). Tap the [[${wasteName(d.sector, no)}]]!`) : t(`このセクタの 1 か所目の[[発掘許可]]は無料だよ。[[${wasteName(d.sector, no)}]]をタップして申請しよう！`, `This sector’s first [[dig permit]] is free. Tap the [[${wasteName(d.sector, no)}]] and apply!`) });
  }
  if (d && presentLock(s) === 'not-yet') {
    const [a, b] = topicProgress(s);
    if (b - a === 1) {
      const rest = topicsOf(d.sector).findIndex((id) => !d.topics.includes(id));
      const id = topicsOf(d.sector)[rest];
      const site = digLayouts(d.sector).findIndex((L) => L.topic === id);
      const L = digLayout(d.sector, Math.max(0, site));
      const layer = L ? (DIG[L.tier].layers[rest]?.name ?? '') : '';
      out.push({ key: 'topic-one', tier: 'mid', site: site >= 0 ? site : undefined, text: t(`お題はあと 1 つ（[[${extName(id)}]]）！ [[${wasteName(d.sector, site)}]]の[[${layer}]]に眠っているよ。`, `Just one target left ([[${extName(id)}]])! It lies in the [[${layer}]] of the [[${wasteName(d.sector, site)}]].`) });
    }
  }
  // 調査依頼状をもらったのに、まだ Uncommon のセクタに出店していない（Common のセクタにいるあいだ）
  const inU = (s.tier ?? 'C') !== 'C' || (s.land?.mine ?? []).some((id) => sectorDef(id).tier !== 'C');
  if (hasLetter(s, 'U') && !inU && s.land) {
    const fee = Math.min(...(['u1', 'u2', 'u3', 'u4', 'u5'] as const).map((id) => sectorDef(id).fee));
    out.push({ key: 'letter', tier: 'low', text: t(`[[調査依頼状]]があるから、Uncommon のセクタに出店できるよ。入国料は ${fee.toLocaleString('en-US')} G から、ランドマップで選ぼう！`, `With the [[survey request]] you can open in Uncommon sectors. Permits start at ${fee.toLocaleString('en-US')} G — choose on the land map!`) });
  }
  // 発掘の枝が雲から出たあと、1 回だけ（発掘のパネルを 1 枚でも開けたら出さない）
  if (s.flags.digBranch === 'new' && !DIG_PANELS.some((id) => has(s, id))) out.push({ key: 'branch', tier: 'low', text: BRANCH_TIP() });
  return out.filter((x) => !s.digRun || x.key === 'present');
}

/** 独占が残り 1 か月の復刻品（売り始めて独占中のもの。いくつかあれば先に開いたもの） */
export function relicEnding(s: P1State) {
  return openRelics(s).find((p) => s.recipes[p.key]?.sold != null && monopolyLeft(s, p.key) === 1) ?? null;
}

// ---------------------------------------------------------------- 月次報告の「今月の出土品」

/** 報告の 1 行の数（新発見・研究 Lv ↑・RP）。発掘場の無いセクタの報告・古い報告は null */
export function digReportLine(r: Pick<Report, 'dig'>): { found: number; lv: number; rp: number } | null {
  return r.dig ? { found: r.dig.found, lv: r.dig.lv, rp: r.dig.rp } : null;
}
/** 報告の 1 行の文（長い版・スマホの短い版） */
export function digReportText(d: { found: number; lv: number; rp: number }): [string, string] {
  if (!d.found && !d.lv && !d.rp) return [t('今月の出土品はなし。荒れ地で 15 秒だけ掘ってみよう', 'Nothing dug up this month. Try 15 seconds at a wasteland'), t('なし（荒れ地で 15 秒）', 'None (15 s at a wasteland)')];
  return [t(`新発見 ${d.found}・研究 Lv ↑ ${d.lv}・RP +${d.rp}`, `New ${d.found} · Research Lv ↑ ${d.lv} · RP +${d.rp}`), t(`新発見 ${d.found}・Lv ↑ ${d.lv}・RP +${d.rp}`, `New ${d.found} · Lv ↑ ${d.lv} · RP +${d.rp}`)];
}

// ---------------------------------------------------------------- 発掘作業のまとめ報告（作業のあいだに締めた月）

/** 通算の月 → 年目と月 */
const ym = (month: number) => ({ year: 1 + Math.floor((month - 1) / 12), month: ((month - 1) % 12) + 1 });

/** まとめ報告 1 枚の中身（report.ts の openDigSummary が描く） */
export interface DigSummary {
  /** 「発掘中の報告（1 年目・3 月〜4 月）」 */
  title: string;
  /** 月ごとの売上（小さな棒） */
  months: { month: number; label: string; revenue: number }[];
  /** 期間の売上の合計 */
  total: number;
  /** 順位の変化（作業の前の月 → 最新の月。前が無ければ null） */
  rankFrom: number | null;
  rankTo: number;
  /** 資金（期間のはじめ → 終わり） */
  money: { start: number; end: number } | null;
  /** 今回の出土 */
  got: DigGot;
  /** 期間のうちに制覇した（2 か月続けて 1 位） */
  conquered: boolean;
  /** 期間の売上のうち復刻品のぶん */
  relic: number;
  /** 最新の月の報告（「くわしい報告を見る」・詰まり） */
  latest: Report;
}
/** 発掘作業のあいだに締めた月（held。古い順・1 か月以上）をまとめる（純粋な関数） */
export function digSummary(s: Pick<P1State, 'reports'>, held: Report[], got: DigGot): DigSummary {
  const first = held[0];
  const latest = held[held.length - 1];
  const a = ym(first.month);
  const b = ym(latest.month);
  const range =
    held.length === 1 || first.month === latest.month
      ? t(`${a.year} 年目・${a.month} 月`, `Y${a.year} · M${a.month}`)
      : a.year === b.year
        ? t(`${a.year} 年目・${a.month} 月〜${b.month} 月`, `Y${a.year} · M${a.month}–${b.month}`)
        : t(`${a.year} 年目・${a.month} 月〜${b.year} 年目・${b.month} 月`, `Y${a.year} M${a.month} – Y${b.year} M${b.month}`);
  const idx = s.reports.indexOf(first);
  const before = idx > 0 ? s.reports[idx - 1] : null;
  return {
    title: t(`発掘中の報告（${range}）`, `Report while digging (${range})`),
    months: held.map((r) => ({ month: r.month, label: t(`${ym(r.month).month} 月`, `M${ym(r.month).month}`), revenue: r.revenue })),
    total: held.reduce((v, r) => v + r.revenue, 0),
    rankFrom: before?.rank ?? null,
    rankTo: latest.rank,
    money: first.money && latest.money ? { start: first.money.start, end: latest.money.end } : null,
    got,
    conquered: held.some((r) => (r.streak ?? 0) >= TOP_STREAK),
    relic: held.reduce((v, r) => v + (r.relic ?? 0), 0),
    latest,
  };
}
