# My Crypto Workshop（マイクリ クラフト工房）

My Crypto Heroes の世界でエクステンション（装備品）をクラフトして売る、お店経営インクリメンタルゲームです。
モデルケースは [Bookstore Incremental](https://store.steampowered.com/app/4664470/Bookstore_Incremental/)。

- 魔法の壺・鍛冶炉・具現化カプセルの 3 ラインでエクステンションをクラフト → 陳列棚に並べる → 来店したヒーローが購入 → GUM を獲得
- 鑑定済み〜黄金のエディション、Legendary の上をいく「真」。あふれた安物は分解炉でゴールドダストと魔石に
- 泥棒（ヴィラン寄りのヒーロー）や工房荒らし（エネミー）をクリックで撃退
- ヒーローをスタッフとして雇い（品出し・警備・行商・清掃など 12 職）、店に設備を置いて、手を離しても回る店へ
- 雨・霧・市場の日・ランドの日で変わる営業日。宝箱、店のエネミー、悪徳商人や MAI の来店など毎日の判断
- 全 173 シリーズ約 900 種のエクステンション図鑑とヒーロー図鑑、ゆかりの品の注文、実績とデイリー依頼
- 「黄金のエクステンション」を作るとクリア（約 6 時間）
- クリア後は **ランド移転** で 2 周目へ。移転先のクリプタイドの加護が重なり、Cp で「移転」の特典を習得。寄付係の名声、黒髭海賊団のレイド、番頭の自動習得、周回の統計
- 閉店後に、五勢力（朱雀・青龍・黄竜・白虎・玄武）＋店舗・研究・シリーズ・名誉・移転の枝をもつスキルツリーで工房を強化

ゲームデザインは [docs/GAME_DESIGN.md](docs/GAME_DESIGN.md)、本格開発のロードマップは [docs/ROADMAP.md](docs/ROADMAP.md) を参照してください。

## 遊び方

| 操作 | 効果 |
| --- | --- |
| 生産ライン（魔法の壺・鍛冶炉・カプセル、または進捗リング）をクリック | クラフトが進む |
| 生産ラインを長押し | オーバークロック（×3 速）。熱ゲージが満タンになると数秒止まる |
| レジ（クリスくん）をクリック | 先頭の客の会計が進む |
| 赤く光るヒーローをクリック | 泥棒を捕まえて懸賞金を得る。盗まれた品も戻る。入口・天井・窓・煙など、ヒーローごとに現れ方が違い、何回かタップが必要な泥棒もいる |
| 工房を跳ね回るエネミーをクリック | 追い払う（いる間はクラフト速度が落ちる。日が進むと同時に複数出る） |
| 店のエネミー・宝箱・泥・コインをクリック | 退治する / 開ける / 掃除する / 拾う |
| 悪徳商人・MAI・改心した泥棒 | 選択肢から選ぶ（12 秒で既定の選択肢） |
| レイド（2 周目から） | オレンジに光る黒髭海賊団を 2 回ずつタップ。全員捕まえるとエンブレム |
| ランド移転（クリア後） | スキルツリーの「ランド移転」ボタンまたはメニューから。移転先を選んで 2 回押す |
| 閉店後のスキルツリー | ノードを選んで習得（GUM・ゴールドダスト・研究ポイント・エンブレム・Cp）。ドラッグで移動、ホイールで拡大縮小。魔石の投入先もここで選ぶ |

営業中は画面全体が工房と店舗になり、所持GUM・残り時間・本日の売上は右上に重ねて表示されます。
左上の歯車アイコンで一時停止し、BGM/SE の切り替え、本日の成績、できごとの履歴、図鑑を確認できます。

進行は `localStorage` に自動保存されます（メニューから削除できます）。

## 開発

素材は [bearko/mycryptoheroes](https://github.com/bearko/mycryptoheroes) を Git サブモジュールとして参照しています。

```bash
git clone --recurse-submodules https://github.com/bearko/MyCryptoWorkshop.git
cd MyCryptoWorkshop
npm install
npm run dev      # http://localhost:5173
```

既存のクローンでは `git submodule update --init` を実行してください。
素材DBを別の場所に置いている場合は `MCH_ASSETS_DIR=/path/to/mycryptoheroes npm run dev` で指定できます。

| コマンド | 内容 |
| --- | --- |
| `npm run dev` | 開発サーバー（起動前に素材を同期） |
| `npm run build` | 型チェック＋本番ビルド（`dist/`） |
| `npm test` | ロジックのテストとバランスのスモークテスト |
| `npm run sync-assets` | 素材の同期だけを実行 |
| `node scripts/tree-grid.mjs` | スキルツリーのノード配置を文字で表示（新しいノードの置き場所を探す用） |
| `npm run balance` | 自動プレイで進行ペースを計測し、`reports/balance-*.csv` と目標との比較表を出力（`-- 日数 シード` で指定可。`-- 日数 シード 周回数` で周回ごとのクリア時間） |

開発サーバーでは `G` キーで +10,000 GUM、`E` キーでその日の営業を終了、`T` キーで泥棒を出現させ、`R` キーでレイドを起こせます（本番ビルドでは無効）。

### 素材の取り込み

`scripts/sync-assets.mjs` が素材DBから次のものを生成します（いずれも Git 管理外）。

- `src/generated/catalog.json` — 全シリーズ（Legacy / Modern、真シリーズ含む）、ヒーロー、エネミー、スタッフ、アイコン、音声のカタログ
- `public/mch-atlas/*.png` — 64px のドット絵（エクステンション・ヒーロー・エネミー）をまとめたスプライトシート。画像は `#ext-0/37` のようにシート名とセル番号で参照します
- `public/mch/**` — それ以外の画像・音声（工房背景、立ち絵、アイコン、BGM/SE）

ゲームで使うシリーズ・泥棒役・エネミーは [`src/game/content.json`](src/game/content.json) で指定します。
ここに挙げたものはスプライトシートの先頭にまとめられるので、最初の読み込みはシート数枚で済みます。

### ディレクトリ構成

```
src/
  game/        ゲームロジック（DOM非依存・テスト可能）
    catalog.ts   生成カタログの型付け
    content.json 使うシリーズ・系統・泥棒・エネミーの指定
    items.ts     商品コード（エディション）と基本価格
    lines.ts     生産ラインと魔石
    staff.ts     スタッフの職（雇うヒーローは content.json）
    currency.ts  GUM・ゴールドダスト・研究ポイント
    conditions.ts 営業日の状態（天候・市場の日・ランドの日）
    skills4.ts   Phase 4 のノード（清掃係・イベント対策・客層・乗り物）
    skills5.ts   Phase 5 のノード（シリーズ表・注文・名誉・クリア）
    heroes.ts    ヒーロー図鑑・好感度・コンプリート報酬
    orders.ts    注文（ゆかりの品）
    achievements.ts 実績とデイリー依頼
    prestige.ts  ランド移転（周回・Cp・名声・周回の記録）
    blessings.ts クリプタイドの加護（移転先ごとの永続ボーナス）
    skills6.ts   Phase 6 のノード（移転ブランチ・寄付係）
    skills3.ts   Phase 3 のノード（スタッフ・設備・研究）
    effects.ts   スキル効果の定義（データ）
    skills.ts    スキルツリーのノード定義
    stats.ts     ノードレベル → 能力値、価格・レアリティ計算
    shop/        1日分の営業シミュレーション（生産・在庫・分解炉・客・レジ・泥棒・エネミー・スタッフ・マーケット・
                 床のイベント hazards・来訪者 visitors・選択イベント decisions・レイド raid）
    balance/     自動プレイとペース目標（npm run balance）
    layout.ts    シーン座標
    purchase.ts  習得と番頭（自動習得）
    save.ts      セーブデータ（バージョン移行・引き継ぎコード）
  render/      Canvas 描画（店頭・キャラクター・演出）
  ui/          DOM UI（スキルツリー、図鑑、カットイン、紙吹雪、共通ヘルパー）
  audio.ts     BGM / SE
  main.ts      画面遷移とゲームループ
tests/         Vitest
docs/          ゲームデザインドキュメント
```

### デプロイ

`main` ブランチへの push で `.github/workflows/deploy.yml` が GitHub Pages にデプロイします。
リポジトリの Settings → Pages → Source を「GitHub Actions」にしてください。

## 素材とクレジット

- ヒーロー、エクステンション、エネミー、背景、アイコン、BGM/SE: My Crypto Heroes（© MCH Co.,Ltd.）。
  [bearko/mycryptoheroes](https://github.com/bearko/mycryptoheroes) に整理されたものを使用しています。
- クリスくん／マインちゃん ドット絵：こじもこ、マイクリくん 原画：こはる／ドット絵：こじもこ。
- 紙吹雪（`src/ui/confetti.ts`）とカットイン（`style.css` の `.mch-passive-cutin*`）は、同リポジトリの
  金宝箱演出・カットイン CSS（MIT License, © 2026 bearko）を移植・改変したものです。

本作は非公式の二次創作です。マイクリ画像の利用は [MCH デザインガイドライン](https://medium.com/mycryptoheroes/mch-design-guideline-ja-99ff0970ccdc) に従い、
非営利の範囲に限ります。営利目的での利用（有償販売など）は事前に MCH Co.,Ltd. への連絡が必要です。
