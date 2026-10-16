# bearko.games 共通基盤の総合スコア

bearko.games の総合スコア（[bearko/mycryptoportfolio の SPEC-002](https://github.com/bearko/mycryptoportfolio/blob/claude/game-portfolio-page-4afqbc/docs/specs/SPEC-002-total-score.md) 3.7）に参加する。

- ランキングを送るとき（1 日の終わり・クリア）に、あわせて共通基盤の SDK で成績を送る（`src/net/platform.ts`）。点の計算は共通基盤のサーバー
- 送る成績：`day`（30 日目に届いたことがあれば 30 以上）、`clearBest`（周回込みの最速クリア。営業日の秒数）、`total`・`run`（将来の見直し用。今は点に効かない）
- 点：30 日目 1,000 ／ クリア 5,000 ＋ 5,000 × 2 時間 ÷ 最速クリアタイム
- 積み上げなので 1 日の終わりは通知を出さず、クリアのときだけ自己ベストの通知を出す
- SDK（`https://bearko.games/sdk/v1.js`）は `index.html` の head で、ゲーム本体（Vite が head に入れる module）より先に読む。読めない・通信に失敗しても何もしない
- 今の Workshop のランキング（Google ログイン）とは別。アカウントのつなぎ込みは共通基盤の SPEC-001 4.5 で今後
