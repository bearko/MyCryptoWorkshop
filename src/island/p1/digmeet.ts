/**
 * 発掘との出会い・お題の発表・調査依頼状・助言・月次報告の 1 行（docs/ISLAND_PHASE1.md「地層の発掘と研究ポイント」の
 * 「お題・発表・調査依頼状」「発掘との出会い」）。ここは DOM を持たない決まりごと（テストできる純粋な関数）。画面は main.ts。
 */
import { t } from '../../i18n';
import { DEF } from '../defs';
import { DIG, DIG_THEME, SECTOR_CHIEF, type Tier } from './data';
import { sectorDef } from './company';
import { digSite, extName, hasLetter, myWorkshop, picksCap, presentLock, topicProgress, topicsOf, type P1State, type PBuilding, type Report } from './model';

// ---------------------------------------------------------------- 発掘との出会い（2 か月目の途中、初めて手が空いたとき）

/** 操作がないまま、この日数たったら出会う */
export const MEET_IDLE_DAYS = 5;

/** 発掘場の吹き出し（工房の「⛏ 発掘場」）・町の長の印・発掘の助言を出してよい（出会いの会話が終わった） */
export const digMet = (s: Pick<P1State, 'flags'>) => !!s.flags.digMeet;

/**
 * 出会いを出してよい：チュートリアル（見習い期間）が終わり、最初の月の締め（月末ポーズ）のあとで、
 * 時間が動いていて（月末ポーズではない）、このセクタに発掘場と完成した工房があり、操作がないまま MEET_IDLE_DAYS 日たった。
 * 古いセーブで 2 か月目を過ぎているものも、読み込んだあとの次の空き時間に同じ出会いを出す（digMeet が無いので）。
 */
export function meetReady(s: P1State, idleDays: number): boolean {
  if (digMet(s)) return false;
  if (typeof s.tut === 'number' && s.tut < 99) return false;
  if (!s.reports.length || s.monthPause) return false;
  if (!s.dig || !digSite(s)) return false;
  const ws = myWorkshop(s);
  if (!ws || ws.left > 0) return false;
  return idleDays >= MEET_IDLE_DAYS;
}

/** 出会いの会話（セリフ 1〜3。1 枚 2 文・最後は次にすること） */
export const MEET_LINES = (): string[] => [
  t('工房の裏から、古い[[エクステ]]が出てきたよ！ 実は私、この世界の歴史をずっと研究しているんだ。', 'An old [[extension]] turned up behind the workshop! Actually, I’ve been studying this world’s history all along.'),
  t('この世界は、なぜ 9 つに分かれているのか。地層を掘れば、きっと手がかりが見つかるはず。', 'Why is this world split into nine? Dig through the strata and we’re sure to find clues.'),
  t('お店で売れるたびに[[ツルハシ]]を振れるよ。売れるのを待つあいだに、光っている発掘場を掘ってみよう！', 'Every sale gives you a [[pick]] swing. While you wait for sales, try digging at the glowing dig site!'),
];
/** 最初の出土のあと（セリフ 4） */
export const MEET_FOUND = (): string => t('新しいエクステを見つけると[[研究ポイント]]が貯まるよ。スキルツリーの四角いパネルを開いてみよう！', 'New extensions earn [[research points]]. Try opening a square panel in the skill tree!');

/** 出会いの途中の、地図のマインちゃんの一言（いまやること） */
export function meetTip(s: Pick<P1State, 'flags' | 'dig'>): string | null {
  const ph = s.flags.digMeet;
  // 発掘場の無いセクタへ移ったら、工房をタップ・掘る段の一言は出さない（戻れば続き）
  if ((ph === 'tap' || ph === 'open') && !digSite(s)) return null;
  if (ph === 'tap') return t('地図の[[工房]]をタップして、光っている「⛏ 発掘場」を押そう！', 'Tap the [[workshop]] on the map, then press the glowing “⛏ Dig site”!');
  if (ph === 'open') return t('光っているマスをタップして、掘ってみよう！ 長押しで続けて打てるよ。', 'Tap a glowing cell to dig! Hold to keep swinging.');
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
  const L = digSite(s);
  if (!L) return null;
  const next: Tier = L.tier === 'C' ? 'U' : 'R';
  return hasLetter(s, next) ? null : next;
}

/** 発表の会話（3 枚：マインちゃん → 町の長 → 町の長）。who が null の枚はマインちゃん */
export function presentPages(s: P1State): { text: string; who: number | null }[] {
  const L = digSite(s);
  const chief = chiefOf(s.dig?.sector ?? '');
  const n = topicsOf(s.dig?.sector ?? '').length;
  const tier = L?.tier ?? 'C';
  const next = letterToGet(s);
  const nextName = next === 'U' ? 'Uncommon' : next === 'R' ? 'Rare' : '';
  return [
    { who: null, text: t(`[[町の長]]、この町の地層からお題が ${n} つそろいました！ 研究の成果を聞いてください。`, `[[Town head]], we found all ${n} targets in this town’s strata! Please hear our findings.`) },
    {
      who: chief,
      text:
        tier === 'C'
          ? t('見事だ…。この町の下には、昔の[[職人の町]]が眠っていたのだな。', 'Remarkable… So an old [[crafters’ town]] lies beneath ours.')
          : t('9 つのランドの品が、ひとつの地層から…。世界はもとは[[ひとつ]]だったのかもしれん。', 'Goods of nine lands in one stratum… Perhaps the world was once [[one]].'),
    },
    {
      who: chief,
      text: next
        ? next === 'R'
          ? t(`その研究、もっと先の町でも続けてくれ。[[${nextName} の調査依頼状]]を書いておこう（Rare の町はまだ霧の向こうだがな）。`, `Carry this research further. I’ll write you a [[${nextName} survey request]] (though Rare towns are still beyond the mist).`)
          : t(`その研究、もっと大きな町でも続けてくれ。[[${nextName} の調査依頼状]]を書いておこう。`, `Carry this research to bigger towns. I’ll write you a [[${nextName} survey request]].`)
        : t('礼に、町の古い記録を見せよう。研究の足しにしてくれ。', 'As thanks, let me show you the town’s old records. Use them in your research.'),
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

/** 「この町の地層には[[〇〇]]が眠っているはず。お題は 3 つ、そろったら町の長に発表しよう！」（発掘場の無いセクタは null） */
export function topicsPage(sector: string): string | null {
  const theme = DIG_THEME[sector];
  const n = topicsOf(sector).length;
  if (!theme || !n) return null;
  return t(`この町の地層には[[${theme}]]が眠っているはず。お題は ${n} つ、そろったら[[町の長]]に発表しよう！`, `This town’s strata should hold [[${theme}]]. There are ${n} targets — once you have them all, present to the [[town head]]!`);
}

// ---------------------------------------------------------------- マインちゃんの助言（発掘）

export type DigTipKey = 'picks-full' | 'present' | 'topic-one' | 'letter';
/**
 * 発掘の助言。tier は、いまの助言の並び（main.ts の tutorial）のどこに入れるか：
 * - high：受け取れるもの（お題がそろって発表できる）。依頼の報酬の受け取りと同じ所（休業・倉庫の「止まっている」の後）
 * - mid：もったいない・あと少し（ツルハシの回数が上限＝売れても増えない／お題があと 1 つ）。
 *   素材が少ない・休んでいる人（お店が止まる）の後、1 位の守りの前（いつも出がちなので、止まっているものより下）
 * - low：次のランクへ（調査依頼状をもらったのに Uncommon に行っていない）。四半期の決算の後、ランドマップの紹介の前
 */
export interface DigTip {
  key: DigTipKey;
  tier: 'high' | 'mid' | 'low';
  text: string;
}
export const DIG_TIP_ORDER: DigTipKey[] = ['present', 'picks-full', 'topic-one', 'letter'];

/** いま出せる発掘の助言（優先の順。出会いの前は無し） */
export function digTips(s: P1State): DigTip[] {
  if (!digMet(s) || s.flags.digMeet === 'tap') return [];
  const out: DigTip[] = [];
  const L = digSite(s);
  const ws = myWorkshop(s);
  if (canPresent(s)) out.push({ key: 'present', tier: 'high', text: t('お題が全部そろったね！ [[町の長]]の家で、研究成果を発表しよう。', 'All targets found! Present your findings at the [[town head]]’s house.') });
  if (L && s.dig && ws && ws.left <= 0) {
    const cap = picksCap(s);
    if (s.dig.picks >= cap) out.push({ key: 'picks-full', tier: 'mid', text: t(`[[ツルハシ]]の回数が上限（${cap} / ${cap}）だよ。いま売れても増えないから、発掘場で掘ろう！`, `Your [[pick]] swings are at the cap (${cap} / ${cap}). Sales add no more — dig at the dig site!`) });
  }
  if (L && s.dig && presentLock(s) === 'not-yet') {
    const [a, b] = topicProgress(s);
    if (b - a === 1) {
      const rest = topicsOf(s.dig.sector).findIndex((id) => !s.dig!.topics.includes(id));
      const layer = DIG[L.tier].layers[rest]?.name ?? '';
      const id = topicsOf(s.dig.sector)[rest];
      out.push({ key: 'topic-one', tier: 'mid', text: t(`お題はあと 1 つ（[[${extName(id)}]]）！ [[${layer}]]のどこかに眠っているよ。`, `Just one target left ([[${extName(id)}]])! It lies somewhere in the [[${layer}]].`) });
    }
  }
  // 調査依頼状をもらったのに、まだ Uncommon のセクタに出店していない（Common のセクタにいるあいだ）
  const inU = (s.tier ?? 'C') !== 'C' || (s.land?.mine ?? []).some((id) => sectorDef(id).tier !== 'C');
  if (hasLetter(s, 'U') && !inU && s.land) {
    const fee = Math.min(...(['u1', 'u2', 'u3', 'u4', 'u5'] as const).map((id) => sectorDef(id).fee));
    out.push({ key: 'letter', tier: 'low', text: t(`[[調査依頼状]]があるから、Uncommon のセクタに出店できるよ。入国料は ${fee.toLocaleString('en-US')} G から、ランドマップで選ぼう！`, `With the [[survey request]] you can open in Uncommon sectors. Permits start at ${fee.toLocaleString('en-US')} G — choose on the land map!`) });
  }
  return out;
}

// ---------------------------------------------------------------- 月次報告の「今月の出土品」

/** 報告の 1 行の数（新発見・研究 Lv ↑・RP）。発掘場の無いセクタの報告・古い報告は null */
export function digReportLine(r: Pick<Report, 'dig'>): { found: number; lv: number; rp: number } | null {
  return r.dig ? { found: r.dig.found, lv: r.dig.lv, rp: r.dig.rp } : null;
}
/** 報告の 1 行の文（長い版・スマホの短い版） */
export function digReportText(d: { found: number; lv: number; rp: number }): [string, string] {
  if (!d.found && !d.lv && !d.rp) return [t('今月の出土品はなし。お店で売れるとツルハシを振れるよ', 'Nothing dug up this month. Each sale gives a pick swing'), t('なし（売れるとツルハシ +1）', 'None (1 swing per sale)')];
  return [t(`新発見 ${d.found}・研究 Lv ↑ ${d.lv}・RP +${d.rp}`, `New ${d.found} · Research Lv ↑ ${d.lv} · RP +${d.rp}`), t(`新発見 ${d.found}・Lv ↑ ${d.lv}・RP +${d.rp}`, `New ${d.found} · Lv ↑ ${d.lv} · RP +${d.rp}`)];
}
