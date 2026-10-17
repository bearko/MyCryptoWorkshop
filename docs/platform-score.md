# bearko.games 共通基盤（総合スコア・トロフィー・RTA）

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

## トロフィー（共通基盤の SPEC-001 9.4、ROADMAP 8.4）

| ID | 名前 | 条件 |
| --- | --- | --- |
| `workshop.day30` | 行列のできる人気店 | 30 日目の営業を終える |
| `workshop.legendary` | 千磨百錬 | 「MCH製法」を習得（Legendary） |
| `workshop.clear` | 黄金の工房 | 黄金のエクステンション（クリア） |
| `workshop.relocate` | 西廻り航路の夢 | ランド移転して 2 周目 |

- 条件は `src/net/platform.ts` の `trophyIds`（純関数、`tests/platform.test.ts`）。移転したあとは 1 周目の分も満たしているとみなす
- 送るのは起動したとき（前から遊んでいる人にも付く）・習得・閉店・移転のあと。同じ起動で同じ ID は 1 回だけ
- **1 つずつ順に送る**。未ログインの最初の 1 回で仮アカウントができるので、同時に送ると別々の仮アカウントに入る（ローカルの e2e で実際に起きた）

## RTA（共通基盤の SPEC-001 6.8、ROADMAP 8.4）

- レギュレーション `workshop-golden`：1 周目、Day 1 の開店から黄金のエクステンションの習得まで。区切り `epic` → `legendary` → `clear`
- ホームの「⏱ RTA で始める」（SDK が読めたときだけ出る）→ セーブを消す確認（2 回押す）→ 再読み込み → Day 1 の「開店する」で `rta.start`。印は sessionStorage（`mycryptoworkshop.rtaPending`）に置き、開店で消す
- 区切りは習得のたびに `rtaCheckpointsReached` を見て、まだ送っていないものを順に送る。`igtMs` はこの周回の営業時間（営業中ならその日の経過を足す）
- 経過時間は右下の「スキルツリー」ボタンのすぐ上に出る（`timerOffset`）。リセットでは `rta.abort`。再読み込み・タブを閉じると計測は SDK ごと消える
