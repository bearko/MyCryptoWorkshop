/**
 * 最初の 1 か月のチュートリアル（見習い期間。マインちゃんの案内）。
 * 1 画面 1 メッセージ、1 段 1 要素。文は 2 文まで、最後は次にすること。固有名詞は [[ ]] で囲むと色がつく。
 * 新天地 → 工房（前の世界から持ってきた設備）→ ついてきた 3 人 → 作る → 素材 → お店 → 運ぶ → 初売上 →
 * SCM ダッシュボード → 締め → ランキング → スキルツリー（docs/ISLAND_PHASE1.md「チュートリアル」）。
 * 「サプライチェーン」「自動化」は先に言わない。つながりを体験したあと、ダッシュボードで詰まりが見えれば十分。
 *
 * 進み具合は P1State.tut（段の番号、TUT_DONE で終わり）。各段は done() が真になったら次へ進む。
 */
import { t } from '../../i18n';
import { myShops, type P1State } from './model';

export const TUT_DONE = 99;

/** 吹き出しのボタンで開く画面（main.ts が実際の関数に結びつける） */
export type TutGo = 'build' | 'workshop' | 'shop' | 'staff' | 'buy' | 'scm' | 'ranking' | 'skills';

/** マインちゃんの会話の 1 枚。show：一緒に見せる絵 */
export interface TutPage {
  text: string;
  show?: 'crew' | 'cycle' | 'gift';
  /** show: 'crew' のとき、前に出すヒーロー（ほかは少し暗く） */
  hero?: number;
}

export interface TutStep {
  id: string;
  /** 地図の上の吹き出しの一言（いまやること） */
  say: (s: P1State) => string;
  /** 吹き出しのボタン */
  act?: [string, TutGo];
  /** 光らせる場所：下の帯のタブ（'plan'）・小メニュー（'plan:build'）・⏩（'speed'） */
  hl?: string;
  /** 「建築」で光らせる建物 */
  card?: string;
  /** 画面を開いたときのマインちゃんの一言（画面の名前 → 文） */
  tips?: Partial<Record<string, (s: P1State) => string>>;
  /** この段に入ったときの会話（1 枚ずつ。最後の枚のボタンが ok で、act の画面を開く） */
  intro?: { pages: TutPage[]; ok: string };
  /** 次の段へ進む条件。seen：この段に入ってから開いて閉じた画面 */
  done: (s: P1State, seen: Set<string>) => boolean;
}

const anyShop = (s: P1State) => s.buildings.some((b) => b.owner === 'me' && (b.id === 'general_store' || b.id === 'import' || b.id === 'boutique'));
const sold = (s: P1State) => Object.values(s.monthUnits).some((n) => (n ?? 0) > 0) || s.reports.length > 0;

export const TUT: TutStep[] = [
  {
    id: 'workshop',
    intro: {
      pages: [
        { text: t('ここが[[新天地]]のランド！ 今日から、私たちの新しい商売が始まるよ。', 'This is the [[new land]]! Our new business starts today.') },
        { text: t('このランドに名前を轟かせる、[[一大ブランド]]を築こう！', 'Let’s build a [[great brand]] this whole land will know!') },
        { text: t('引っ越しで多くは持ってこられなかったけど、[[工房]]の設備だけはなんとか運んできたよ。', 'We couldn’t bring much on the move, but we managed to carry the [[workshop]] tools.') },
        { text: t('まずは、新天地に工房を建て直そう！', 'First, let’s rebuild the workshop here!') },
      ],
      ok: t('建てる場所を選ぶ', 'Choose a spot'),
    },
    say: () => t('光っている[[工房]]を選んで、道路沿いの空き地に置こう！', 'Pick the glowing [[Workshop]] and place it on a lot by the road!'),
    act: [t('建築を開く', 'Open Build'), 'build'],
    hl: 'plan:build',
    card: 'workshop',
    done: (s) => s.buildings.some((b) => b.owner === 'me' && b.id === 'workshop'),
  },
  {
    id: 'wsWait',
    say: () => t('工事中だよ。右上の [[⏩]] で、時間を早められるよ。', 'Under construction. [[⏩]] at the top speeds time up.'),
    hl: 'speed',
    done: (s) => s.buildings.some((b) => b.owner === 'me' && b.id === 'workshop' && b.left <= 0),
  },
  {
    id: 'craft',
    intro: {
      pages: [
        { text: t('工房ができた！ 実はね、前の世界から [[3 人]]がついてきてくれたんだ。', 'The workshop is ready! Actually, [[three friends]] followed us from the old world.'), show: 'crew' },
        { text: t('まだみんな[[見習い]]で、腕はこれから。でも、ついてきてくれた気持ちがうれしいよね。', 'They are all [[apprentices]], still learning. But I’m so glad they came along.'), show: 'crew' },
        { text: t('まずは器用な[[MCHアーティスト]]に、工房の作業台を頼んでみよう！', 'First, let’s ask the handy [[MCH Artist]] to take the workshop bench!'), show: 'crew', hero: 10003 },
      ],
      ok: t('頼んでみる', 'Ask them'),
    },
    say: () => t('工房を開いて、器用な[[MCHアーティスト]]に作業台を頼もう。', 'Open the workshop and ask the handy [[MCH Artist]] to take the bench.'),
    act: [t('工房を開く', 'Open workshop'), 'workshop'],
    tips: {
      workshop: (s) =>
        s.slots[0].worker == null
          ? t('光っている四角をタップして、[[MCHアーティスト]]を選ぼう！', 'Tap the glowing square and choose [[MCH Artist]]!')
          : t('次は作るもの。持ってきた素材で作れる[[センス]]がおすすめだよ！', 'Now what to make. [[Sensu]] works with the materials we brought!'),
    },
    done: (s) => s.slots.some((sl) => sl.worker != null && !!sl.sku),
  },
  {
    id: 'mats',
    intro: {
      pages: [
        { text: t('作り始めたね！ でも、持ってきた[[素材]]はほんの少しだけ。', 'Crafting has started! But we only brought a few [[materials]].') },
        { text: t('[[卸問屋]]で、少し買い足しておこう。', 'Let’s top up at the [[wholesaler]].') },
      ],
      ok: t('調達を開く', 'Open buying'),
    },
    say: () => t('「SCM」→「調達」で、[[素材]]を買い足そう。', 'Top up [[materials]] under SCM → Buy.'),
    act: [t('調達を開く', 'Open buying'), 'buy'],
    hl: 'scm:buy',
    tips: {
      buy: (s) =>
        s.proc.bought > 0
          ? t('買えた！ 画面を閉じて、次へ進もう。', 'Done! Close this screen to move on.')
          : t('光っているボタンで、作るのに使う[[素材]]を 10 個買おう！', 'Tap the glowing button to buy 10 of the [[material]] you craft with!'),
    },
    done: (s, seen) => s.proc.bought > 0 && seen.has('buy'),
  },
  {
    id: 'shop',
    say: () => t('次は、作ったものを売る[[お店]]を建てよう！', 'Next, build a [[shop]] to sell what you make!'),
    act: [t('建築を開く', 'Open Build'), 'build'],
    hl: 'plan:build',
    card: 'general_store',
    done: anyShop,
  },
  {
    id: 'shopWait',
    say: () => t('お店の工事中だよ。[[⏩]] で早めよう。', 'The shop is being built. Speed up with [[⏩]].'),
    hl: 'speed',
    done: (s) => myShops(s).length > 0,
  },
  {
    id: 'sell',
    intro: {
      pages: [{ text: t('お店ができた！ 話し上手の[[MCHタクティシャン]]に、店番を頼もう。', 'The shop is open! Let’s ask the smooth-talking [[MCH Tactician]] to mind it.'), show: 'crew', hero: 10002 }],
      ok: t('お店を開く', 'Open the shop'),
    },
    say: () => t('お店を開いて、並べるものと店員を決めよう。', 'Open the shop and choose what to sell and who sells it.'),
    act: [t('お店を開く', 'Open shop'), 'shop'],
    tips: {
      shop: () => t('光っている四角をタップして、[[主力商品]]と[[店員]]を決めよう！', 'Tap the glowing squares to set the [[main product]] and the [[clerk]]!'),
    },
    done: (s) => myShops(s).some((b) => !!s.shops[b.uid].shelves[0] && (s.shops[b.uid].staff != null || s.shops[b.uid].part > 0)),
  },
  {
    id: 'haul',
    intro: {
      pages: [
        { text: t('あれ、工房でできた品がお店に届かない……。運ぶ人がいないんだ！', 'Hm? The goods from the workshop never reach the shop… Nobody carries them!') },
        { text: t('力持ちの[[MCHウォーリアー]]に、運ぶのを頼もう。', 'Let’s ask the strong [[MCH Warrior]] to carry them.'), show: 'crew', hero: 10001 },
      ],
      ok: t('配置を開く', 'Open Staff'),
    },
    say: () => t('「人事」→「ヒーローの配置」で、[[MCHウォーリアー]]に運ぶのを頼もう。', 'Under HR → Assign heroes, ask [[MCH Warrior]] to haul.'),
    act: [t('配置を開く', 'Open Staff'), 'staff'],
    hl: 'hr:staff',
    tips: {
      staff: () => t('③ 物流の光っている四角をタップして、[[MCHウォーリアー]]を選ぼう！', 'Tap the glowing square under ③ Haul and choose [[MCH Warrior]]!'),
    },
    done: (s) => s.staff.some((x) => x.task === 'transport'),
  },
  {
    id: 'firstSale',
    say: () => t('これで全部つながった！ [[⏩]] で、お客さんを待とう。', 'Everything is connected! Press [[⏩]] and wait for customers.'),
    hl: 'speed',
    done: sold,
  },
  {
    id: 'scm',
    intro: {
      pages: [
        { text: t('[[初売上]]、おめでとう！ 作って、運んで、売れた！', 'Your [[first sale]]! Made, carried and sold!'), show: 'cycle' },
        { text: t('お祝いに、ヒーローを雇える[[人材の募集]]を解放したよ！', 'To celebrate, I unlocked [[Recruiting]] so you can hire heroes!'), show: 'gift' },
        { text: t('流れ全体は、[[SCM ダッシュボード]]で見られるよ。のぞいてみよう！', 'You can see the whole flow on the [[SCM dashboard]]. Take a look!') },
      ],
      ok: t('見てみる', 'Take a look'),
    },
    say: () => t('「SCM」→「サプライチェーン」で、流れ全体を見てみよう。', 'See the whole flow under SCM → Supply chain.'),
    act: [t('ダッシュボードを開く', 'Open the dashboard'), 'scm'],
    hl: 'scm:flow',
    tips: {
      scm: () => t('赤く光っているのが、いちばん詰まっているところ。ここを直すほど、売上が伸びるよ！', 'The red glow marks the biggest jam. Fix it, and sales grow!'),
    },
    done: (_s, seen) => seen.has('scm'),
  },
  {
    id: 'month',
    say: () => t('あとは月末まで [[⏩]] で見守ろう。詰まったら、ダッシュボードで直してね。', 'Now watch with [[⏩]] until the month ends. If something jams, fix it on the dashboard.'),
    act: [t('ダッシュボード', 'Dashboard'), 'scm'],
    hl: 'speed',
    done: (s) => s.reports.length > 0,
  },
  {
    id: 'ranking',
    intro: {
      pages: [
        { text: t('1 か月目、おつかれさま！ この売上を、まわりの会社と比べてみよう。', 'Month one, done! Let’s compare these sales with the other companies.') },
        { text: t('目標は、[[エリア 1 位]]！', 'The goal: [[#1 in the area]]!') },
      ],
      ok: t('ランキングを見る', 'See the ranking'),
    },
    say: () => t('「マーケティング」→「企業ランキング」を見てみよう。', 'Check Marketing → Ranking.'),
    act: [t('ランキングを見る', 'See the ranking'), 'ranking'],
    hl: 'mkt:ranking',
    tips: {
      ranking: () => t('上にいる会社が、いまのライバル。ひとつずつ抜いていこう！', 'The companies above you are your rivals. Pass them one by one!'),
    },
    done: (_s, seen) => seen.has('ranking'),
  },
  {
    id: 'skills',
    intro: {
      pages: [
        { text: t('売上を伸ばすカギは、流れの[[詰まり]]をなくすこと。', 'The key to more sales: clear the [[jams]] in the flow.') },
        { text: t('そのための道具が[[スキルツリー]]。開いてみよう！', 'Your tool for that is the [[skill tree]]. Let’s open it!') },
      ],
      ok: t('スキルツリーへ', 'To the skill tree'),
    },
    say: () => t('真ん中の「スキルツリー」を開いてみよう。', 'Open the Skill tree in the middle.'),
    act: [t('スキルツリーを開く', 'Open skills'), 'skills'],
    hl: 'skill',
    tips: {
      skills: () => t('枝の横の札が、強くなるところ。ダッシュボードで赤い段の枝から伸ばそう！', 'The tag by each branch shows what it strengthens. Grow the branch of the red stage first!'),
    },
    done: (_s, seen) => seen.has('skills'),
  },
];

/** 最後の会話（見習い期間のおしまい） */
export const TUT_END: TutPage[] = [
  { text: t('見習い期間はここまで！ ここからは、あなたの思うままに。', 'That’s the end of the apprentice month! From here, it’s all yours.') },
  { text: t('このランドに、名前を轟かせよう！', 'Let’s make our name known across this land!') },
];

/** 以前のセーブ（チュートリアルが無かったころ）：工房があれば案内は済み */
export function tutOf(s: P1State): number {
  if (typeof s.tut === 'number') return s.tut;
  return s.buildings.some((b) => b.owner === 'me' && b.id === 'workshop') ? TUT_DONE : 0;
}
