# My Crypto Workshop（マイクリ クラフト工房）

My Crypto Heroes の世界でエクステンション（装備品）をクラフトして売る、お店経営インクリメンタルゲームです。
モデルケースは [Bookstore Incremental](https://store.steampowered.com/app/4664470/Bookstore_Incremental/)。

- 魔法の壺でエクステンションをクラフト → 陳列棚に並べる → 来店したヒーローが購入 → GUM を獲得
- 泥棒（ヴィラン寄りのヒーロー）や工房荒らし（エネミー）をクリックで撃退
- 閉店後に、五勢力（朱雀・青龍・黄竜・白虎・玄武）の枝をもつスキルツリーで工房を強化

ゲームデザインは [docs/GAME_DESIGN.md](docs/GAME_DESIGN.md)、本格開発のロードマップは [docs/ROADMAP.md](docs/ROADMAP.md) を参照してください。

## 遊び方

| 操作 | 効果 |
| --- | --- |
| 魔法の壺（またはその横の進捗リング）をクリック | クラフトが進む |
| レジ（クリスくん）をクリック | 先頭の客の会計が進む |
| 赤く光るヒーローをクリック | 泥棒を捕まえて懸賞金を得る。盗まれた品も戻る。入口・天井・窓・煙など、ヒーローごとに現れ方が違い、何回かタップが必要な泥棒もいる |
| 工房を跳ね回るエネミーをクリック | 追い払う（いる間はクラフト速度が落ちる。日が進むと同時に複数出る） |
| 閉店後のスキルツリー | ノードを選んで習得。ドラッグで移動、ホイールで拡大縮小 |

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
| `npm run balance` | 自動プレイで進行ペースを計測し、`reports/balance-*.csv` と目標との比較表を出力（`-- 日数 シード` で指定可） |

開発サーバーでは `G` キーで +10,000 GUM、`E` キーでその日の営業を終了、`T` キーで泥棒を出現させられます（本番ビルドでは無効）。

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
    skills.ts    スキルツリーのノード定義
    stats.ts     ノードレベル → 能力値、価格・レアリティ計算
    shop.ts      1日分の営業シミュレーション
    layout.ts    シーン座標
    save.ts      セーブデータ
  render/      Canvas 描画（店頭・キャラクター・演出）
  ui/          DOM UI（スキルツリー、図鑑、共通ヘルパー）
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

本作は非公式の二次創作です。マイクリ画像の利用は [MCH デザインガイドライン](https://medium.com/mycryptoheroes/mch-design-guideline-ja-99ff0970ccdc) に従い、
非営利の範囲に限ります。営利目的での利用（有償販売など）は事前に MCH Co.,Ltd. への連絡が必要です。
