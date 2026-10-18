# bearko.games 共通基盤（総合スコア・アチーブメント・RTA）

bearko.games の総合スコア（[bearko/mycryptoportfolio の SPEC-002](https://github.com/bearko/mycryptoportfolio/blob/claude/game-portfolio-page-4afqbc/docs/specs/SPEC-002-total-score.md) 3.7）に参加する。

- ランキングを送るとき（1 日の終わり・クリア）に、あわせて共通基盤の SDK で成績を送る（`src/net/platform.ts`）。点の計算は共通基盤のサーバー
- 送る成績：`day`（30 日目に届いたことがあれば 30 以上）、`clearBest`（周回込みの最速クリア。営業日の秒数）、`total`・`run`（将来の見直し用。今は点に効かない）
- 点：30 日目 1,000 ／ クリア 5,000 ＋ 5,000 × 2 時間 ÷ 最速クリアタイム
- 積み上げなので 1 日の終わりは通知を出さず、クリアのときだけ自己ベストの通知を出す
- SDK（`https://bearko.games/sdk/v1.js`）は `index.html` の head で、ゲーム本体（Vite が head に入れる module）より先に読む。読めない・通信に失敗しても何もしない
- 今の Workshop のランキング（Google ログイン）とは別。アカウントのつなぎ込みは共通基盤の SPEC-001 4.5 で今後

## 総合ランキングへの導線（MyCryptoPortfolio#29）

- ランキングの画面（`src/ui/ranking.ts`）の下に「bearko.games の総合ランキング ↗」と添え書き。行き先は `https://bearko.games/score/?game=workshop`（共通基盤のタイトル別ランキング）
- 新しいタブで開く（再読み込みすると RTA の計測が消えるため）。前からのランキング（Upstash）はそのまま

## アチーブメント（旧トロフィー。共通基盤の SPEC-001 9.4・SPEC-008、ROADMAP 8.4）

bearko.games では「アチーブメント」と呼ぶ（MyCryptoPortfolio SPEC-008）。名前と絵は共通基盤の `platform/trophies.js` が決める（下の表は MyCryptoPortfolio の `docs/ACHIEVEMENT_CATALOG.md` の写し）。
来訪（`workshop.visit`）は SDK が送るので、ゲームからは送らない。

**ヒーロー名鑑**（No.045〜055）

| ID | 名鑑 | 名前 | 条件 | 判定 |
| --- | --- | --- | --- | --- |
| `workshop.day1` | No.045 大長今（Common） | 李氏朝鮮、宮廷医女 | 1 日目の営業を終える | `day >= 2`（閉店で 2 になる）。移転したあとは常に |
| `workshop.brave` | No.046 花木蘭（Uncommon） | 三綱五常 | 「ブレイブ製法」を習得する | Rare をクラフトできる（`maxRarity >= 2`）。移転したあとは常に（クリアの前提） |
| `workshop.capsule` | No.047 シュレディンガー（Uncommon） | シュレディンガーの猫 | 具現化カプセルを動かす | `levels.capsuleLine > 0`。クリアの前提ではないので、移転したあとでも補わない |
| `workshop.day30` | No.048 サンタクロース（Uncommon） | プレゼント・フォー・ユー | 30 日目の営業を終える | `ranking.day30` か `day > 30`。移転したあとは常に |
| `workshop.imperial` | No.049 ラファエロ（Rare） | システィーナの聖母 | 「インペリアル製法」を習得する | Epic をクラフトできる（`maxRarity >= 3`）。移転したあとは常に（クリアの前提） |
| `workshop.legendhall` | No.050 パーシヴァル（Rare） | 聖杯探索 | 伝説の間を開く | `levels.legendHall > 0`、または移転で残る「称号の間」（伝説の間が前提）を持っている。移転しただけでは補わない（クリアの前提ではない） |
| `workshop.legendary` | No.051 ルーベンス（Rare） | 黄金の工房 | 「MCH製法」を習得（Legendary） | `maxRarity >= 4`。移転したあとは常に |
| `workshop.clear` | No.052 ゴッホ（Epic） | ひまわり | 黄金のエクステンション（クリア） | `cleared > 0`。移転したあとは常に |
| `workshop.relocate` | No.053 マルコ・ポーロ（Epic） | 東方見聞録 | ランド移転して 2 周目 | `prestige.runs >= 1` |
| `workshop.loop3` | No.054 フランシス・ドレーク（Epic） | 女王直属海賊 | 3 周目を始める | `prestige.runs >= 2` |
| `workshop.versepass` | No.055 レオナルド・ダ・ビンチ（Legendary） | モナリザ | 「MCH Verse Pass」を習得する | `levels.versePass > 0`（移転しても残る） |

**エクステンション**

| ID | 絵 | 名前 | 条件 | 判定 |
| --- | --- | --- | --- | --- |
| `workshop.firstsale` | デカ盛りもやしラーメン（Epic） | 分け入っても分け入っても白い山 | 初めて販売する | `totals.sold >= 1`（通算。移転しても残る） |
| `workshop.caught` | モロッサス（Epic） | ドッグファイト | 泥棒を初めて捕まえる | `totals.caught >= 1` |
| `workshop.sold1000` | 絶品龍骨ラーメン（Legendary） | 千載一遇の至杯 | 通算 1,000 個販売する | `totals.sold >= 1000` |

- 条件は `src/net/platform.ts` の `trophyIds`（純関数、`tests/platform.test.ts`）。移転で消える値（スキル・日数）は、移転したあとなら必ず通ったもの（クリアの前提）だけ満たしているとみなす
- 送るのは起動したとき（前から遊んでいる人にも付く）・習得・閉店・移転のあと。営業中は、通算の販売数が 1 個目・1,000 個目になった瞬間と、泥棒を初めて捕まえた瞬間にも送る。同じ起動で同じ ID は 1 回だけ
- 共通基盤の定義が公開されるまでは、新しい ID は共通基盤が知らない ID としてはじくだけ（遊びには影響しない）
- **1 つずつ順に送る**。未ログインの最初の 1 回で仮アカウントができるので、同時に送ると別々の仮アカウントに入る（ローカルの e2e で実際に起きた）

## RTA（共通基盤の SPEC-001 6.8、ROADMAP 8.4）

- レギュレーション `workshop-golden`：1 周目、Day 1 の開店から黄金のエクステンションの習得まで。区切り `epic` → `legendary` → `clear`
- ホームの「⏱ RTA で始める」（SDK が読めたときだけ出る）→ セーブを消す確認（2 回押す）→ 再読み込み → Day 1 の「開店する」で `rta.start`。印は sessionStorage（`mycryptoworkshop.rtaPending`）に置き、開店で消す
- 区切りは習得のたびに `rtaCheckpointsReached` を見て、まだ送っていないものを順に送る。`igtMs` はこの周回の営業時間（営業中ならその日の経過を足す）
- 経過時間は右下の「スキルツリー」ボタンのすぐ上に出る（`timerOffset`）。リセットでは `rta.abort`。再読み込み・タブを閉じると計測は SDK ごと消える
