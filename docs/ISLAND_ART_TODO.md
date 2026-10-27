# アイランド：PixelLab で作る素材のリスト

仮の絵（コードで描いたもの・ほかの絵の流用）や、まだ絵の無いものの一覧です。機能の開発が落ち着いたら、ここを上から PixelLab でまとめて作ります。

- **新しい機能で仮の絵を入れたら、必ずこの表に足す**（何を・どこで使っていて・いまの状態・PixelLab への指示）。
- 作り直したら「済」に移す。
- 建物の規格は `docs/ISLAND_MVP.md`（タイル 200×110、基準点は下から 31px、正面 rd と背面 lu の 2 枚、左右反転で 4 方向）。
- 建物の指示（desc・back）は `scripts/island/buildings.json` にも入れておくと `scripts/island/generate.py` でそのまま作れる。

## 優先度 高（フェーズ 1 の画面に出ている仮の絵）

| id | 名前 | 使う場所 | いまの状態 | 大きさ | PixelLab への指示（正面 / 背面） |
|---|---|---|---|---|---|
| warehouse | 倉庫 | フェーズ 1 の建築（置き場所 +200） | `scripts/island/warehouse.py` でコードで描いた煉瓦の倉庫 | 1 マス | 正面：a brick warehouse with a dark gable roof, a wide gray roller shutter door on the front, stacked wooden crates and a pallet by the door, paved front ／ 背面：replace the roller shutter with a plain brick wall with a small wooden door and two small windows |
| wholesale | 卸問屋 | 区画の端（調達係が歩いて買い付けに行く） | 商社（trading）の絵を流用 | 1 マス・高い | 正面：an old three-story wholesale merchant house with a dark tiled roof, a wide open ground floor stacked with sacks, barrels and crates of raw materials (iron ingots, lumber, clay, glass), a large hanging sign with a scale icon, paved front ／ 背面：remove the open front and the sign, and show a plain wall with a loading door and stacked lumber |

## 優先度 中（コードで描いた小物。いまのままでも遊べる）

| 素材 | 使う場所 | いまの状態 | 大きさ | メモ |
|---|---|---|---|---|
| 素材のアイコン 7 種（鉄・木材・粘土・ガラス・布・紙・宝石） | 調達・BOM・工房・調達係が持つ荷物 | `scripts/island/fx.py` の items() で描いた 24×24 | 24×24（地図では 32 に拡大） | MCH の素材の絵があれば、それを使うのが先 |
| 運搬の荷車 | 地図（工房とお店のあいだを走る） | `src/island/p1/render.ts` の cart() で四角を組み合わせて描いている | 30×20 ほど | 斜め上から見た木の荷車。左右反転で向きを変える |
| 道路のタイル 16 種（つながり方ごと） | 区画の道路 | `scripts/island/fx.py` の roads() | 200×200（タイル規格） | 角・T 字・十字・行き止まり。歩道の縁つき |

## 優先度 低（自由建築モードだけで使う）

| id | 名前 | いまの状態 |
|---|---|---|
| elephant_works | 象王の大工房（2 マス・高い） | 絵が無い（`PENDING_ART`。建てられない） |
| g9_hall | G9 の会議場（2 マス・高い） | 絵が無い（`PENDING_ART`） |
| robot_lab | 巨大ロボの研究所（2 マス・高い） | 絵が無い（`PENDING_ART`） |
| department | デパート | 背面（lu）が仮（生成回数が尽きたときの代わりの絵） |
| demon_castle | 魔王の城 | 背面（lu）が正面と同じ絵 |

## 作らなくてよいもの（コードで描くのがよいもの）

- 地面（草地・砂浜・海 2 コマ）、更地・足場・キラキラ：`scripts/island/fx.py`。規格どおりで、つなぎ目もそろっている。
- 吹き出し・製造の枠・売上の文字・置ける場所の緑と赤：画面の大きさに合わせて描くので、絵にしない。

## 済

（まだ無し）
