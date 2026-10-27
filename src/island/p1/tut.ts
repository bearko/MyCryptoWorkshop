/**
 * 最初の 1 か月のチュートリアル（マインちゃんの案内）。
 * ①調達 → ②製造 → ③物流 → ④販売 のサイクルを、建てる・ヒーローを置く・エクステを選ぶ・初売上まで順に体験し、
 * 最初の締めのあとにランキングと「ボトルネックを太くする」スキルツリーを紹介する（docs/ISLAND_PHASE1.md「チュートリアル」）。
 *
 * 進み具合は P1State.tut（段の番号、TUT_DONE で終わり）。各段は done() が真になったら次へ進む。
 */
import { t } from '../../i18n';
import { PRODUCT } from './data';
import { myShops, myWorkshop, recommend, type P1State } from './model';

export const TUT_DONE = 99;

/** 吹き出しのボタンで開く画面（main.ts が実際の関数に結びつける） */
export type TutGo = 'build' | 'workshop' | 'shop' | 'staff' | 'hire' | 'data' | 'buy' | 'scm' | 'ranking' | 'skills';

export interface TutStep {
  id: string;
  /** 地図の上の吹き出しの一言 */
  say: (s: P1State) => string;
  /** 吹き出しのボタン */
  act?: [string, TutGo];
  /** 光らせる場所：下の帯のタブ（'plan'）・小メニュー（'plan:build'）・⏩（'speed'） */
  hl?: string;
  /** 「建築」で光らせる建物 */
  card?: string;
  /** 画面を開いたときのマインちゃんの一言（画面の名前 → 文） */
  tips?: Partial<Record<string, (s: P1State) => string>>;
  /** この段に入ったときの説明（大きな札） */
  intro?: { title: string; body: string; cycle?: boolean; ok: string };
  /** 次の段へ進む条件。seen：この段に入ってから開いた画面 */
  done: (s: P1State, seen: Set<string>) => boolean;
}

const recName = (s: P1State) => PRODUCT[recommend(s)].name;
const shopBuilt = (s: P1State) => myShops(s).length > 0;
const anyShop = (s: P1State) => s.buildings.some((b) => b.owner === 'me' && (b.id === 'general_store' || b.id === 'import' || b.id === 'boutique'));
const sold = (s: P1State) => Object.values(s.monthUnits).some((n) => (n ?? 0) > 0) || s.reports.length > 0;

export const TUT: TutStep[] = [
  {
    id: 'hello',
    say: () => t('ようこそ！', 'Welcome!'),
    intro: {
      title: t('ようこそ、新天地へ！', 'Welcome to the new land!'),
      body: t(
        'ここでは、エクステを作って売る会社を育てます。お店の売上は、下の 4 つの仕事がつながってはじめて生まれます。それぞれにヒーローを置けば、サイクルが自動で回りはじめます。最初の 1 か月は、わたしが順番に案内しますね！',
        'Here you grow a company that makes and sells Extensions. Sales only happen when the four jobs below connect. Put a hero on each and the cycle runs by itself. I’ll guide you through your first month!',
      ),
      cycle: true,
      ok: t('はじめる', 'Let’s start'),
    },
    done: () => false,
  },
  {
    id: 'workshop',
    say: () => t('まずは工房を建てましょう。下の「営業企画」→「建築」で工房を選んで、道路に面した空き地へ。入口は道路の方にしか向けられません。', 'First, build the workshop: Planning → Build, then place it on a lot facing a road (the entrance faces the road).'),
    act: [t('建築を開く', 'Open Build'), 'build'],
    hl: 'plan:build',
    card: 'workshop',
    done: (s) => !!s.buildings.find((b) => b.owner === 'me' && b.id === 'workshop'),
  },
  {
    id: 'wsWait',
    say: () => t('工事中です。右上の ⏩ で時間を早められます。そのあいだに、地図のマスを押してみてください。建物の詳しい情報が見られます。', 'Under construction. ⏩ at the top speeds time up. Meanwhile, tap a tile on the map to see what is there.'),
    hl: 'speed',
    done: (s) => !!myWorkshop(s),
  },
  {
    id: 'data',
    say: () => t('何を売るか決める前に、市場データを見てみましょう（「マーケティング」→「市場調査データ」）。', 'Before choosing what to sell, check the market data (Marketing → Market data).'),
    act: [t('データを見る', 'Open data'), 'data'],
    hl: 'mkt:data',
    tips: {
      data: (s) => t(`このエリアで、商品ごとに月に何個ほしい人がいるか（ニーズ）と、何社が売っているかの表です。ニーズが大きくて、売っている会社が少ないものがねらい目。いまなら「${recName(s)}」がおすすめです！`, `Monthly demand in this area and how many companies sell each item. Big demand and few sellers is the sweet spot. Right now ${recName(s)} looks best!`),
    },
    done: (s) => s.flags.data,
  },
  {
    id: 'shop',
    say: (s) => t(`「${recName(s)}」を売るお店を建てましょう。「建築」でよろず屋を選んで、道路に面した場所へ。`, `Build a shop to sell ${recName(s)}: pick the General store under Build and place it facing a road.`),
    act: [t('建築を開く', 'Open Build'), 'build'],
    hl: 'plan:build',
    card: 'general_store',
    done: anyShop,
  },
  {
    id: 'craft',
    say: () => t('② 製造の準備です。工房を開いて、作業台に職人を置き、作るエクステを選びましょう。', 'Now ② Craft: open the workshop, put a crafter on the bench and choose an Extension to make.'),
    act: [t('工房を開く', 'Open workshop'), 'workshop'],
    tips: {
      workshop: (s) =>
        s.slots[0].worker == null
          ? t('作業台の「職人」の四角をタップして、ヒーローを選びます。★が多いほど製造に向いています（いちばん向いているのは MCHアーティスト）。', 'Tap the Crafter square on the bench and pick a hero. More ★ means better at crafting (MCH Artist fits best).')
          : t(`次は「作るもの」の四角をタップ。カードには、素材 → エクステの組み合わせ（BOM）と、「今の素材で何ロット作れるか」「1 日あたりの粗利」が出ます。見比べて「${recName(s)}」を選びましょう。`, `Next, tap the Making square. Each card shows the materials → Extension recipe, how many lots your stock covers and the profit per day. Compare them and pick ${recName(s)}.`),
    },
    done: (s) => s.slots.some((sl) => sl.worker != null && !!sl.sku),
  },
  {
    id: 'haul',
    say: () => t('③ 物流：できたエクステをお店へ運ぶ係を決めます。「人事」→「ヒーローの配置」で ③ 物流の枠にヒーローを置きましょう。', 'Now ③ Haul: choose who carries goods to the shop. Under HR → Staff, put a hero in the ③ Haul slot.'),
    act: [t('配置を開く', 'Open staff'), 'staff'],
    hl: 'hr:staff',
    tips: {
      staff: () => t('ここが 4 つの仕事の配置表です。③ 物流の「＋」をタップして、PHY の高い MCHウォーリアーを選びましょう。下の「待機中のヒーロー」を押してから枠を押しても置けます。', 'This is the job board for the four stages. Tap + under ③ Haul and choose MCH Warrior (high PHY). You can also tap a free hero below, then a slot.'),
    },
    done: (s) => s.staff.some((x) => x.task === 'transport'),
  },
  {
    id: 'shopWait',
    say: () => t('お店の工事が終わるのを待ちましょう。⏩ で進められます。', 'Wait for the shop to finish. ⏩ speeds things up.'),
    hl: 'speed',
    done: shopBuilt,
  },
  {
    id: 'sell',
    say: (s) => t(`④ 販売：お店を開いて、並べる商品に「${recName(s)}」を、店員に INT の高い MCHタクティシャンを置きましょう。`, `Now ④ Sell: open the shop, put ${recName(s)} on the shelf and MCH Tactician (high INT) at the counter.`),
    act: [t('お店を開く', 'Open shop'), 'shop'],
    tips: {
      shop: () => t('光っている四角をタップ！「主力商品」で棚に並べるエクステを、「店員」で売り場に立つヒーローを選びます。店員もアルバイトもいないと、お店は休業になります。', 'Tap the glowing squares! Main picks the Extension for the shelf, Clerk picks the hero at the counter. With no clerk and no part-timers the shop stays closed.'),
    },
    done: (s) => myShops(s).some((b) => !!s.shops[b.uid].shelves[0] && (s.shops[b.uid].staff != null || s.shops[b.uid].part > 0)),
  },
  {
    id: 'firstSale',
    say: () => t('これで ② 製造 → ③ 物流 → ④ 販売 がつながりました！ ⏩ で進めて、荷車が運び、お客さんが買いに来るのを見守りましょう。', '② Craft → ③ Haul → ④ Sell are connected! Press ⏩ and watch the cart deliver and customers come to buy.'),
    hl: 'speed',
    done: sold,
  },
  {
    id: 'buyer',
    intro: {
      title: t('はじめての売上！', 'Your first sale!'),
      body: t(
        'おめでとうございます！工房で作ったエクステが、荷車でお店に届いて、お客さんに売れました。これがサイクルです。でも、素材は最初に持ってきた分だけ。このままだと工房が止まってしまいます。残る ① 調達の係を雇いましょう。今回は、わたしから「人材の募集」のスキルをプレゼントします！',
        'Congratulations! The Extension you crafted reached the shop by cart and sold. That’s the cycle. But your materials are only what you brought, and the workshop will stop soon. Let’s hire someone for ① Buy. I’ll give you the Recruiting skill as a gift!',
      ),
      cycle: true,
      ok: t('雇いに行く', 'Go recruit'),
    },
    say: () => t('① 調達：「人事」→「人材登用」でヒーローを 1 人雇って、「ヒーローの配置」の ① 調達の枠に置きましょう。', '① Buy: hire one hero under HR → Recruiting, then put them in the ① Buy slot on the Staff screen.'),
    act: [t('人材登用を開く', 'Open recruiting'), 'hire'],
    hl: 'hr:hire',
    tips: {
      hire: () => t('雇ったヒーローには毎月お給料がかかります。調達は、INT と AGI がほどよく高いヒーローが向いています。雇ったら「ヒーローの配置」の ① 調達へ！', 'Hired heroes get a monthly wage. Buying suits heroes with fairly high INT and AGI. After hiring, put them in ① Buy on the Staff screen!'),
      staff: () => t('雇ったヒーローは「待機中のヒーロー」にいます。① 調達の「＋」をタップして選びましょう。', 'Your new hero is under Free heroes. Tap + under ① Buy and choose them.'),
    },
    done: (s) => s.staff.some((x) => x.task === 'buy'),
  },
  {
    id: 'buyQty',
    say: () => t('調達係が卸問屋まで歩いて、素材を買ってきます。「SCM」→「調達」で、月にどれだけ買うかを確かめましょう。', 'The buyer walks to the wholesaler for materials. Check how much to buy per month under SCM → Buy.'),
    act: [t('調達を開く', 'Open buy'), 'buy'],
    hl: 'scm:buy',
    tips: {
      buy: () => t('棒の白い印が先月使った量、金色の印が工房が 100% 動いたときの量です。はじめは自動で見込みに合わせてあります。−／＋で増やすと在庫に余裕ができますが、置き場所がいっぱいだと買えません。', 'On each bar, the white mark is last month’s use and the gold mark is what the workshop needs at 100%. It starts on auto. + adds slack, but you can’t buy past your storage.'),
    },
    done: (_s, seen) => seen.has('buy'),
  },
  {
    id: 'scm',
    say: () => t('最後に、いちばん大事な画面です。「SCM」→「サプライチェーン」を開きましょう。', 'Last, the most important screen: open SCM → Supply chain.'),
    act: [t('SCM ダッシュボードを開く', 'Open the SCM dashboard'), 'scm'],
    hl: 'scm:flow',
    tips: {
      scm: () => t('これが SCM ダッシュボード！ 4 つの段の「ひと月に回せる数」を比べて、いちばん細いところ（ボトルネック）を赤く光らせます。赤や黄色のランプの段から直せば OK。四角をタップすれば、その場でヒーローも入れ替えられます。', 'This is the SCM dashboard! It compares how much each of the four stages can handle per month and lights the narrowest one (the bottleneck) in red. Fix red and yellow stages first. Tap a square to swap heroes right here.'),
    },
    done: (_s, seen) => seen.has('scm'),
  },
  {
    id: 'month',
    say: () => t('準備ばっちりです！あとは月末の締めまで ⏩ で進めましょう。気になったら、いつでも SCM ダッシュボードへ。', 'All set! Press ⏩ until the month closes. Check the SCM dashboard any time.'),
    act: [t('SCM ダッシュボード', 'SCM dashboard'), 'scm'],
    hl: 'speed',
    done: (s) => s.reports.length > 0,
  },
  {
    id: 'ranking',
    intro: {
      title: t('企業ランキングを紹介します', 'Meet the company ranking'),
      body: t(
        'はじめての売上報告、おつかれさまでした！会社の月の売上は「企業ランキング」で、エリア別・ランド別・世界全体と比べられます。まずは、同じエリアの同業他社を月の売上で抜いて、エリア 1 位を目指しましょう！',
        'Well done on your first sales report! The company ranking compares monthly sales by area, by land and worldwide. First, beat the rival retailers in your area and become #1!',
      ),
      ok: t('ランキングを見る', 'Open ranking'),
    },
    say: () => t('「マーケティング」→「企業ランキング」で、エリアの順位を見てみましょう。上の順位を押しても開けます。', 'Check your area rank under Marketing → Ranking (or tap your rank at the top).'),
    act: [t('ランキングを見る', 'Open ranking'), 'ranking'],
    hl: 'mkt:ranking',
    tips: {
      ranking: () => t('同じエリアの会社と、月の売上でくらべた順位です。1 位の会社の売上が、いまの目標。差を縮めるには、売上を決めている「サイクルのいちばん細いところ」を太くすることです。', 'Your rank by monthly sales among companies in this area. The leader’s sales are your target. To close the gap, widen the narrowest part of your cycle.'),
    },
    done: (_s, seen) => seen.has('ranking'),
  },
  {
    id: 'skills',
    intro: {
      title: t('カギは、サプライチェーンを太くすること', 'The key: widen your supply chain'),
      body: t(
        '1 か月やってみて分かったとおり、売上は ① 調達 → ② 製造 → ③ 物流 → ④ 販売 の「いちばん細いところ」で決まります。ボトルネックを見つけて太くし、また次のボトルネックを太くする。これがこのゲームの核心です。そのための道具がスキルツリー。調達・工房・物流・お店の枝が、それぞれの段を太くします。',
        'As you saw this month, sales are set by the narrowest of ① Buy → ② Craft → ③ Haul → ④ Sell. Find the bottleneck, widen it, then the next one: that is the heart of this game. Your tool is the skill tree: the Buying, Workshop, Logistics and Shops branches each widen one stage.',
      ),
      cycle: true,
      ok: t('スキルツリーへ', 'To the skill tree'),
    },
    say: () => t('真ん中の「スキルツリー」を開いてみましょう。', 'Open the Skill tree in the middle of the bar.'),
    act: [t('スキルツリーを開く', 'Open skills'), 'skills'],
    hl: 'skill',
    tips: {
      skills: () => t('お店（棚・案内係）は ④ 販売、工房（作業台・段取り）は ② 製造、物流（荷車・トラック）は ③ 物流、調達（素材のルート・倉庫）は ① 調達を太くします。SCM ダッシュボードで赤く光った段の枝から伸ばすのがコツ。ダッシュボードからもそのまま習得できます。', 'Shops widen ④ Sell, Workshop widens ② Craft, Logistics widens ③ Haul, Buying widens ① Buy. Grow the branch of the stage glowing red on the SCM dashboard — you can learn skills right there too.'),
    },
    done: (_s, seen) => seen.has('skills'),
  },
];

/** 最後の札（チュートリアルのおしまい） */
export const TUT_END = {
  title: t('案内はここまで！', 'That’s the tour!'),
  body: t(
    'ここからは自由に会社を育てましょう。迷ったら SCM ダッシュボードを開いて、赤く光ったボトルネックから。エリア 1 位を目指して、がんばってください！',
    'From here, grow the company your way. When in doubt, open the SCM dashboard and start with the bottleneck glowing red. Go for #1 in the area!',
  ),
};

/** 以前のセーブ（チュートリアルが無かったころ）：工房があれば案内は済み */
export function tutOf(s: P1State): number {
  if (typeof s.tut === 'number') return s.tut;
  return s.buildings.some((b) => b.owner === 'me' && b.id === 'workshop') ? TUT_DONE : 0;
}
