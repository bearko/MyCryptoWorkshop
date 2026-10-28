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
| gate（いまは guard を流用） | 関所 | ランドのふち（東）。通行料を払うと開通して、となりのランドセクタへ行ける | 「警備の詰所」（guard）の絵を流用。開通しても絵は変わらない（吹き出しだけ変わる） | 1 マス | 正面：a traditional checkpoint gate at the edge of a town: a wooden gatehouse with a tiled roof, a heavy closed wooden gate across a paved road, a striped barrier pole, a small guard booth and a toll sign with a coin icon ／ 背面：the same gatehouse seen from behind, gate closed, with a road leading away. 開通後の差分：gate doors wide open and the barrier pole raised |
| wholesale | 卸問屋 | 区画の端（調達係が歩いて買い付けに行く） | 商社（trading）の絵を流用 | 1 マス・高い | 正面：an old three-story wholesale merchant house with a dark tiled roof, a wide open ground floor stacked with sacks, barrels and crates of raw materials (iron ingots, lumber, clay, glass), a large hanging sign with a scale icon, paved front ／ 背面：remove the open front and the sign, and show a plain wall with a loading door and stacked lumber |

## 優先度 中（コードで描いた小物。いまのままでも遊べる）

| 素材 | 使う場所 | いまの状態 | 大きさ | メモ |
|---|---|---|---|---|
| ランドマップの島 | ランドマップ（`src/island/p1/landui.ts`） | SVG の緑の島の形と点線の道（コード） | 1 枚 800×500 ほど（横長）・スマホ用に 400×500 も | 上から見た島のイラスト。8 つのセクタの場所（data.ts の SECTORS の at）に町の小さな絵。道でつながる |
| ランドマップの雲 | ランドマップ（Epic・Legendary のセクタを隠す） | CSS の白い円を重ねたもの | 170×110 | もこもこの雲。少し透ける。ゆっくり横に揺らす |
| セクタの札の絵 | ランドマップの各セクタ（いまは文字の札） | 絵なし | 64×64 × 8 | はじまりの浜（砂浜の町）・風見の丘（風車）・湖のほとり・港町（港）・商人の坂（坂の商店街）・王都の市場（城下）・天空の商都・伝説の大都会 |
| スキル「ブランドの看板」など 5 つ | スキルツリー（ブランド力が要るパネル） | 建物・エクステの絵を流用（media・harbor・tower・arena・ランタン U） | 64×48 | 看板・取引先の握手・広告塔・憧れの職場（人が集まる建物）・高級品の棚 |
| 素材のアイコン 7 種（鉄・木材・粘土・ガラス・布・紙・宝石） | 調達・BOM・工房・調達係が持つ荷物 | `scripts/island/fx.py` の items() で描いた 24×24 | 24×24（地図では 32 に拡大） | MCH の素材の絵があれば、それを使うのが先 |
| 運搬の荷車 | 地図（工房とお店のあいだを走る） | `src/island/p1/render.ts` の cart() で四角を組み合わせて描いている | 30×20 ほど | 斜め上から見た木の荷車。左右反転で向きを変える |
| 物流・販売のアイコン（🛒・💰 の絵文字） | チュートリアルの 4 つの仕事の図（`src/island/p1/main.ts` の cycleEl） | 絵文字で代用 | 36×36 | 木の荷車（上の荷車と同じ絵でよい）／金貨の袋 |
| アルバイトの人形（👤 の絵文字） | お店の画面のアルバイトの −／＋ | 絵文字で代用 | 20×20 | 店のエプロンをつけた小さな人の立ち姿。いないときは灰色にするので 1 枚でよい |
| スキルツリーの荷車・トラックのパネル（🛒・🚚 の絵文字） | スキルツリー（荷車を増やす・荷車をさらに増やす・小型トラック） | 絵文字で代用（`src/island/p1/tree.ts` の ICON） | 64×48 | 木の荷車 2 台／小さな配送トラック（斜め上から） |
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
- チュートリアルの指差し（👇・👆）と光る枠：UI の目印なので絵文字と CSS のまま。

## 済

（まだ無し）
