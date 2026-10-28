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
import { SKILL } from './data';
import { DAYS, has, hqOpen, myShops, type P1State } from './model';

export const TUT_DONE = 99;

/** 吹き出しのボタンで開く画面（main.ts が実際の関数に結びつける） */
export type TutGo = 'build' | 'workshop' | 'shop' | 'staff' | 'hire' | 'buy' | 'scm' | 'ranking' | 'skills' | 'hr';

/** マインちゃんの会話の 1 枚。show：一緒に見せる絵 */
export interface TutPage {
  text: string;
  show?: 'crew' | 'cycle' | 'gift';
  /** show: 'gift' のときの中身（無ければ「人材の募集」） */
  gift?: { icon: string; title: string; note: string };
  /** show: 'crew' のとき、前に出すヒーロー（ほかは少し暗く） */
  hero?: number;
}

export interface TutStep {
  id: string;
  /** 右上の「ミッション」に出す、いまやること（短く） */
  goal: (s: P1State) => string;
  /** 小さなチェック（全部そろうと進む段の、途中の手ごたえ） */
  checks?: [string, (s: P1State, seen: Set<string>) => boolean][];
  /** 段をクリアしたときのマインちゃんのひとこと */
  praise?: string;
  /** 下の帯で、光らせる所のほかに開けてよいメニュー（チュートリアル中はほかをロック） */
  open?: string[];
  /** 地図の上の吹き出しの一言（いまやること） */
  say: (s: P1State) => string;
  /** 吹き出しのボタン（段の途中で変わるものは関数で） */
  act?: [string, TutGo] | ((s: P1State) => [string, TutGo]);
  /** 光らせる場所：下の帯のタブ（'plan'）・小メニュー（'plan:build'）・⏩（'speed'） */
  hl?: string | ((s: P1State) => string);
  /** この段に入るときに、カメラを寄せて見せる建物（できたもの・売れるところ） */
  focus?: 'workshop' | 'shop';
  /** 「建築」で光らせる建物 */
  card?: string;
  /** 画面を開いたときのマインちゃんの一言（画面の名前 → 文） */
  tips?: Partial<Record<string, (s: P1State) => string>>;
  /** この段に入ったときの会話（1 枚ずつ。最後の枚のボタンが ok で、act の画面を開く） */
  intro?: { pages: TutPage[]; ok: string };
  /** この段に入るときに、マインちゃんが援助する資金（足りないときだけ。0 なら無し） */
  grant?: (s: P1State) => number;
  /** 次の段へ進む条件。seen：この段に入ってから開いて閉じた画面 */
  done: (s: P1State, seen: Set<string>) => boolean;
}

/** 月の締めまでの日数（開店前は 30） */
const monthLeft = (s: P1State) => (s.open == null ? DAYS : DAYS - ((s.day - s.open) % DAYS));

/** 段の吹き出しのボタン・光らせる場所（関数でも文字でも） */
export const actOf = (st: TutStep, s: P1State) => (typeof st.act === 'function' ? st.act(s) : st.act);
export const hlOf = (st: TutStep, s: P1State) => (typeof st.hl === 'function' ? st.hl(s) : st.hl) ?? '';

/** 最初の 3 人のほかに、雇ったヒーローがいる */
const hired = (s: P1State) => s.staff.some((x) => ![10001, 10002, 10003].includes(x.hero));

const anyShop = (s: P1State) => s.buildings.some((b) => b.owner === 'me' && (b.id === 'general_store' || b.id === 'import' || b.id === 'boutique'));

export const TUT: TutStep[] = [
  {
    id: 'workshop',
    goal: (_s) => t('工房を建てる', 'Build the workshop'),
    praise: t('いい場所！ 工事が始まったよ。', 'Nice spot! Construction has started.'),
    intro: {
      pages: [
        { text: t('ここが[[新天地]]のランド！ 今日から、私たちの新しい商売が始まるよ。', 'This is the [[new land]]! Our new business starts today.') },
        { text: t('このランドに名前を轟かせる、[[一大ブランド]]を築こう！', 'Let’s build a [[great brand]] this whole land will know!') },
        { text: t('引っ越しで多くは持ってこられなかったけど、[[工房]]の設備だけはなんとか運んできたよ。', 'We couldn’t bring much on the move, but we managed to carry the [[workshop]] tools.') },
        { text: t('まずは、新天地に工房を建て直そう！', 'First, let’s rebuild the workshop here!') },
      ],
      ok: t('建てる場所を選ぶ', 'Choose a spot'),
    },
    say: () => t('[[工房]]は、エクステを作る場所。光っている工房を選んで、道路沿いに置こう！', 'The [[workshop]] is where Extensions are made. Pick the glowing one and place it by a road!'),
    act: [t('建築を開く', 'Open Build'), 'build'],
    hl: 'plan:build',
    card: 'workshop',
    done: (s) => s.buildings.some((b) => b.owner === 'me' && b.id === 'workshop'),
  },
  {
    id: 'wsWait',
    focus: 'workshop',
    goal: (_s) => t('工房の完成を待つ（⏩ で早送り）', 'Wait for the workshop (⏩ to speed up)'),
    praise: t('工房が完成！', 'The workshop is ready!'),
    say: () => t('工事中だよ。右上の [[⏩]] で、時間を早められるよ。', 'Under construction. [[⏩]] at the top speeds time up.'),
    hl: 'speed',
    done: (s) => s.buildings.some((b) => b.owner === 'me' && b.id === 'workshop' && b.left <= 0),
  },
  {
    id: 'craft',
    focus: 'workshop',
    goal: (_s) => t('工房で作るものを決める', 'Start crafting in the workshop'),
    praise: t('センスを作り始めたよ！', 'Sensu crafting has started!'),
    intro: {
      pages: [
        { text: t('[[工房]]ができたね！ ここで、いろんなエクステを作っていくよ。', 'The [[workshop]] is ready! This is where we’ll make all kinds of Extensions.') },
        { text: t('実はね、前の世界から [[3 人]]がついてきてくれたんだ。', 'Actually, [[three friends]] followed us from the old world.'), show: 'crew' },
        { text: t('まだみんな[[見習い]]で、腕はこれから。でも、ついてきてくれた気持ちがうれしいよね。', 'They are all [[apprentices]], still learning. But I’m so glad they came along.'), show: 'crew' },
        { text: t('まずは器用な[[MCHアーティスト]]に、工房の作業台を頼んでみよう！', 'First, let’s ask the handy [[MCH Artist]] to take the workshop bench!'), show: 'crew', hero: 10003 },
        { text: t('建物の中は、地図の建物をタップすると開けるよ。指さしている[[工房]]をタップしてみよう！', 'You open a building by tapping it on the map. Tap the [[workshop]] I’m pointing at!') },
      ],
      ok: t('やってみる', 'Let’s try'),
    },
    say: (s) =>
      s.slots.some((sl) => sl.worker != null)
        ? t('次は作るもの。地図の[[工房]]をタップして「工房を開く」から、作るエクステを選ぼう！', 'Next, what to make. Tap the [[workshop]] on the map, then Open workshop, and pick an Extension!')
        : t('地図の[[工房]]をタップして、吹き出しの「工房を開く」を押そう。中で[[MCHアーティスト]]に作業台を頼むよ！', 'Tap the [[workshop]] on the map, then Open workshop. Inside, ask [[MCH Artist]] to take the bench!'),
    act: [t('工房の場所へ', 'Show the workshop'), 'workshop'],
    tips: {
      workshop: (s) =>
        s.slots[0].worker == null
          ? t('光っている四角をタップして、[[MCHアーティスト]]を選ぼう！', 'Tap the glowing square and choose [[MCH Artist]]!')
          : t('次は作るもの。持ってきた素材で作れる[[センス]]がおすすめだよ！', 'Now what to make. [[Sensu]] works with the materials we brought!'),
    },
    checks: [
      [t('地図の工房をタップして開く', 'Tap the workshop and open it'), (_s, seen) => seen.has('workshop')],
      [t('作業台に職人を置く', 'Put a crafter on the bench'), (s) => s.slots.some((sl) => sl.worker != null)],
      [t('作るエクステを選ぶ', 'Choose what to make'), (s) => s.slots.some((sl) => !!sl.sku)],
    ],
    done: (s) => s.slots.some((sl) => sl.worker != null && !!sl.sku),
  },
  {
    id: 'mats',
    goal: (_s) => t('卸問屋に素材を注文する', 'Order materials from the wholesaler'),
    praise: t('これで当分、作り続けられるね！', 'That keeps the bench busy for a while!'),
    intro: {
      pages: [
        { text: t('作り始めたね！ でも、持ってきた[[素材]]はほんの少しだけ。', 'Crafting has started! But we only brought a few [[materials]].') },
        { text: t('[[卸問屋]]に、ロット単位で注文しておこう。納期になると届けてくれるよ。', 'Let’s order a lot from the [[wholesaler]]. They deliver on the due day.') },
      ],
      ok: t('調達を開く', 'Open buying'),
    },
    say: () => t('[[素材]]が切れると、工房は止まってしまう。「SCM」→「調達」で注文しよう！', 'Without [[materials]], the workshop stops. Order under SCM → Buy!'),
    act: [t('調達を開く', 'Open buying'), 'buy'],
    hl: 'scm:buy',
    tips: {
      buy: (s) =>
        s.proc.bought > 0
          ? t('注文できた！ 納期になると、問屋の人が[[工房]]まで運んでくれるよ。画面を閉じよう。', 'Ordered! On the due day, the wholesaler’s staff carries it to the [[workshop]]. Close this screen.')
          : t('光っているボタンで、作るのに使う[[素材]]を 1 ロット注文しよう！', 'Tap the glowing button to order 1 lot of the [[material]] you craft with!'),
    },
    checks: [
      [t('素材を 1 ロット注文する', 'Order 1 lot of materials'), (s) => s.proc.bought > 0],
      [t('調達の画面を閉じる', 'Close the buying screen'), (_s, seen) => seen.has('buy')],
    ],
    done: (s, seen) => s.proc.bought > 0 && seen.has('buy'),
  },
  {
    id: 'shop',
    goal: (_s) => t('お店を建てる', 'Build a shop'),
    praise: t('お店の工事が始まったよ！', 'Shop construction has started!'),
    say: () => t('作ったエクステは、[[お店]]で売るよ。光っている「よろず屋」を道路沿いに建てよう！', 'Extensions are sold in a [[shop]]. Build the glowing General store by a road!'),
    act: [t('建築を開く', 'Open Build'), 'build'],
    hl: 'plan:build',
    card: 'general_store',
    tips: {
      place: () => t('お客さんは近いお店に来るよ。[[家の多い所]]で、工房から近い場所がおすすめ。置く前に出る「見込み」を見比べてね！', 'Customers go to nearby shops. A spot with [[many homes]], close to the workshop, is best. Compare the forecast before you build!'),
    },
    done: anyShop,
  },
  {
    id: 'shopWait',
    focus: 'shop',
    goal: (_s) => t('お店の完成を待つ（⏩ で早送り）', 'Wait for the shop (⏩ to speed up)'),
    praise: t('お店が完成！', 'The shop is ready!'),
    say: () => t('お店の工事中だよ。[[⏩]] で早めよう。', 'The shop is being built. Speed up with [[⏩]].'),
    hl: 'speed',
    done: (s) => myShops(s).length > 0,
  },
  {
    id: 'sell',
    focus: 'shop',
    goal: (_s) => t('お店の開店準備をする', 'Get the shop ready'),
    praise: t('開店準備ばっちり！', 'The shop is all set!'),
    intro: {
      pages: [
        { text: t('[[お店]]ができたね！ 工房で作ったエクステは、ここに並べて売るよ。', 'The [[shop]] is ready! Extensions from the workshop are sold here.') },
        { text: t('話し上手の[[MCHタクティシャン]]に、店番を頼もう。', 'Let’s ask the smooth-talking [[MCH Tactician]] to mind it.'), show: 'crew', hero: 10002 },
        { text: t('[[お店]]を地図でタップすると、店内の様子が見られるよ。', 'Tap the [[shop]] on the map to look inside.') },
      ],
      ok: t('やってみる', 'Let’s try'),
    },
    say: () => t('店員がいないと、お店は開かないよ。地図の[[お店]]をタップして、店内の[[＋]]から並べるものと店員を決めよう！', 'No clerk, no business. Tap the [[shop]] on the map and use the [[+]] spots inside to choose what to sell and who sells it!'),
    act: [t('お店の場所へ', 'Show the shop'), 'shop'],
    tips: {
      shop: () => t('光っている四角をタップして、[[主力商品]]と[[店員]]を決めよう！', 'Tap the glowing squares to set the [[main product]] and the [[clerk]]!'),
    },
    checks: [
      [t('地図のお店をタップする', 'Tap the shop on the map'), (_s, seen) => seen.has('shop') || seen.has('shopPop')],
      [t('並べる主力商品を決める', 'Choose the main product'), (s) => myShops(s).some((b) => !!s.shops[b.uid].shelves[0])],
      [t('店員を置く', 'Put a clerk in'), (s) => myShops(s).some((b) => s.shops[b.uid].staff != null || s.shops[b.uid].part > 0)],
    ],
    done: (s) => myShops(s).some((b) => !!s.shops[b.uid].shelves[0] && (s.shops[b.uid].staff != null || s.shops[b.uid].part > 0)),
  },
  {
    id: 'haul',
    goal: (_s) => t('運ぶ人を決める', 'Choose who carries goods'),
    praise: t('荷車が走り出したよ！', 'The cart is on its way!'),
    intro: {
      pages: [
        { text: t('あれ、工房でできた品がお店に届かない……。運ぶ人がいないんだ！', 'Hm? The goods from the workshop never reach the shop… Nobody carries them!') },
        { text: t('力持ちの[[MCHウォーリアー]]に、運ぶのを頼もう。', 'Let’s ask the strong [[MCH Warrior]] to carry them.'), show: 'crew', hero: 10001 },
      ],
      ok: t('配置を開く', 'Open Staff'),
    },
    say: () => t('工房の品は、誰かが運ばないとお店に並ばないよ。「人事」→「ヒーローの配置」で[[MCHウォーリアー]]に頼もう！', 'Goods only reach the shop if someone carries them. Ask [[MCH Warrior]] under HR → Assign heroes!'),
    act: [t('配置を開く', 'Open Staff'), 'staff'],
    hl: 'hr:staff',
    tips: {
      staff: () => t('③ 物流の光っている四角をタップして、[[MCHウォーリアー]]を選ぼう！', 'Tap the glowing square under ③ Haul and choose [[MCH Warrior]]!'),
    },
    done: (s) => s.staff.some((x) => x.task === 'transport'),
  },
  {
    id: 'firstSale',
    focus: 'shop',
    goal: () => t('売れるまでの流れを見る', 'Watch how a sale happens'),
    say: () => t('エクステが売れるまでの流れを、一緒に見てみよう！', 'Let’s watch how an Extension gets sold!'),
    done: (s) => !!s.flags.tour,
  },
  {
    id: 'scm',
    focus: 'shop',
    goal: (_s) => t('SCM ダッシュボードを見る', 'Check the SCM dashboard'),
    praise: t('これで流れの見方はばっちり！', 'Now you know how to read the flow!'),
    intro: {
      pages: [
        { text: t('[[初売上]]、おめでとう！ 作って、運んで、売れた！', 'Your [[first sale]]! Made, carried and sold!'), show: 'cycle' },
        { text: t('流れ全体は、[[SCM ダッシュボード]]で見られるよ。のぞいてみよう！', 'You can see the whole flow on the [[SCM dashboard]]. Take a look!') },
      ],
      ok: t('見てみる', 'Take a look'),
    },
    say: () => t('どこが詰まっているかは、ダッシュボードでひと目で分かるよ。「SCM」→「サプライチェーン」を開こう！', 'The dashboard shows at a glance where things jam. Open SCM → Supply chain!'),
    act: [t('ダッシュボードを開く', 'Open the dashboard'), 'scm'],
    hl: 'scm:flow',
    tips: {
      scm: () => t('赤く光っているのが、いちばん詰まっているところ。ここを直すほど、売上が伸びるよ！', 'The red glow marks the biggest jam. Fix it, and sales grow!'),
    },
    done: (_s, seen) => seen.has('scm'),
  },
  {
    id: 'recruit',
    goal: (_s) => t('スキルツリーで「人材の募集」を開放する', 'Unlock Recruiting in the skill tree'),
    praise: t('人材の募集を開放できた！', 'Recruiting is unlocked!'),
    intro: {
      pages: [
        { text: t('ダッシュボードの [[① 調達]]を見て。調達係がいないから、いまは素材を手で買うしかないんだ。', 'Look at [[① Buy]] on the dashboard. With no buyer, you can only buy materials by hand.') },
        { text: t('素材を買い付けてくれるヒーローを雇いたいね。でも、ヒーローを雇うには[[人材の募集]]が要るんだ。', 'Let’s hire a hero to buy materials. But hiring needs [[Recruiting]] first.') },
        { text: t('[[人材の募集]]は、[[スキルツリー]]で開放できるよ。行ってみよう！', 'You unlock [[Recruiting]] in the [[skill tree]]. Let’s go!') },
      ],
      ok: t('スキルツリーへ', 'To the skill tree'),
    },
    grant: (s) => {
      const need = (SKILL.hire?.cost ?? 0) - s.money;
      return need > 0 ? Math.ceil(need / 1000) * 1000 : 0;
    },
    say: (s) =>
      has(s, 'hire')
        ? t('開放できた！ スキルツリーの ✕ で、元の画面に戻ろう。', 'Unlocked! Close the skill tree with ✕.')
        : hqOpen(s)
          ? t('光っている[[人材の募集]]をダブルタップして開放しよう！', 'Double-tap the glowing [[Recruiting]] panel to unlock it!')
          : t('真ん中の「スキルツリー」を開いて、まずは[[本社]]を開放しよう。', 'Open the Skill tree and unlock [[HQ]] first.'),
    act: [t('スキルツリーを開く', 'Open skills'), 'skills'],
    hl: 'skill',
    checks: [
      [t('スキルツリーを開く', 'Open the skill tree'), (s, seen) => seen.has('skills') || hqOpen(s)],
      [t('真ん中の本社を開放する', 'Unlock HQ in the middle'), (s) => hqOpen(s)],
      [t('人材の募集を開放する', 'Unlock Recruiting'), (s) => has(s, 'hire')],
    ],
    tips: {
      skills: (s) =>
        has(s, 'hire')
          ? t('開放できた！ 右上の [[✕]] で、元の画面に戻ろう！', 'Unlocked! Use [[✕]] at the top right to go back!')
          : hqOpen(s)
            ? t('枝は[[事業ごと]]（① 調達〜④ 販売・人材・経営）に分かれているよ。光っている[[人材の募集]]をダブルタップして開放しよう！', 'Branches are split by [[business]]: Buy, Craft, Haul, Sell, People, Operations. For now, double-tap the glowing [[Recruiting]] panel!')
            : t('真ん中の[[本社]]をタップして、「本社を開放する」を押そう！', 'Tap [[HQ]] in the middle and press Unlock HQ!'),
    },
    done: (s, seen) => has(s, 'hire') && hqOpen(s) && seen.has('skills'),
  },
  {
    id: 'hire',
    goal: () => t('調達係を雇って置く', 'Hire and place a buyer'),
    praise: t('これで素材は、毎日自動で届くよ！', 'Now materials arrive by themselves every day!'),
    say: (s) =>
      hired(s)
        ? t('雇えた！ 「人事」→「ヒーローの配置」で、[[① 調達]]の四角に置こう。', 'Hired! Put them in the [[① Buy]] square under HR → Assign heroes.')
        : s.flags.hireUnlocked
          ? t('「人事」→「人材登用」で、[[調達]]が得意なヒーローを雇おう。', 'Hire a hero good at [[buying]] under HR → Recruiting.')
          : t('スキルを開放したよ！ 光っている「[[人事]]」タブを開いてみよう。', 'Skill unlocked! Open the glowing [[HR]] tab.'),
    act: (s) => (hired(s) ? [t('配置を開く', 'Open Staff'), 'staff'] : s.flags.hireUnlocked ? [t('人材登用を開く', 'Open recruiting'), 'hire'] : [t('人事を開く', 'Open HR'), 'hr']),
    hl: (s) => (hired(s) ? 'hr:staff' : s.flags.hireUnlocked ? 'hr:hire' : 'hr'),
    checks: [
      [t('人材登用で 1 人雇う', 'Hire one hero'), (s) => hired(s)],
      [t('① 調達の四角に置く', 'Put them in ① Buy'), (s) => s.staff.some((x) => x.task === 'buy')],
    ],
    tips: {
      hire: (s) =>
        hired(s)
          ? t('雇えた！ 上のボタンで「ヒーローの配置」へ行こう。', 'Hired! Use the button at the top to go to Assign heroes.')
          : t('光っているのが、[[調達]]にいちばん向いているヒーロー。グラフの「調達」のランクを見てね。「雇う」を押そう！', 'The glowing card is the best [[buyer]] — check the Buy rank on the chart. Tap Hire!'),
      staff: () => t('① 調達の光っている四角をタップして、雇ったヒーローを選ぼう！', 'Tap the glowing square under ① Buy and choose your new hero!'),
    },
    done: (s) => s.staff.some((x) => x.task === 'buy'),
  },
  {
    id: 'month',
    goal: (s) => t(`1 か月目を締める（あと ${monthLeft(s)} 日）`, `Close month one (${monthLeft(s)} days left)`),
    praise: t('1 か月、おつかれさま！', 'Month one, done!'),
    say: () => t('あとは月末まで [[⏩]] で見守ろう。詰まったら、ダッシュボードで直してね。', 'Now watch with [[⏩]] until the month ends. If something jams, fix it on the dashboard.'),
    act: [t('ダッシュボード', 'Dashboard'), 'scm'],
    hl: 'speed',
    open: ['scm', 'hr'],
    done: (s) => s.reports.length > 0,
  },
  {
    id: 'ranking',
    goal: (_s) => t('企業ランキングを見る', 'Check the company ranking'),
    praise: t('ライバルが分かったね！', 'Now you know your rivals!'),
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
];

/** 最後の会話（見習い期間のおしまい） */
export const TUT_END: TutPage[] = [
  { text: t('見習い期間はここまで！ ここからは、あなたの思うままに。', 'That’s the end of the apprentice month! From here, it’s all yours.') },
  { text: t('このランドに、名前を轟かせよう！', 'Let’s make our name known across this land!') },
];

/**
 * 段の並びを変えたら上げる。セーブの段の番号が古い並びのものなら、条件を見て今いるべき段に置き直す
 * （古い番号のままだと、まだ工房で何も作っていないのに「素材」の段になる、などが起きる）。
 */
export const TUT_VERSION = 4;

/** いまの段で、地図で指さす建物（中を開いてほしいとき） */
export const pointOf = (st: TutStep | undefined): 'workshop' | 'shop' | null => (st?.id === 'craft' ? 'workshop' : st?.id === 'sell' ? 'shop' : null);

export function tutFix(s: P1State) {
  if (typeof s.tut !== 'number' || s.tut >= TUT_DONE || s.tutV === TUT_VERSION) {
    s.tutV = TUT_VERSION;
    return;
  }
  let k = 0;
  while (k < TUT.length && TUT[k].done(s, new Set())) k++;
  s.tut = k;
  s.tutV = TUT_VERSION;
}

/** 以前のセーブ（チュートリアルが無かったころ）：工房があれば案内は済み */
export function tutOf(s: P1State): number {
  if (typeof s.tut === 'number') return s.tut;
  return s.buildings.some((b) => b.owner === 'me' && b.id === 'workshop') ? TUT_DONE : 0;
}
