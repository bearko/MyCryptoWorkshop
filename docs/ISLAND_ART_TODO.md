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
| ランドマップの地図画像 | ランドマップ（`src/island/p1/landui.ts` の `openLand`）。いまは SVG の緑の島の形と点線の道（コード） | SVG の島（コード） | 640×640（島全体のイラスト。PixelLab で生成予定） | 上から見た「はじまりの国 Lime」の島全体。下から Common 2 段（4＋4）・Uncommon 5・Rare 4・Epic 3・Legendary 1（いちばん上）の 21 の町の場所（data.ts の SECTORS の at、0〜100）に小さな町。上の段ほど大きな町、いちばん上は城下町。点線の道でつながる。セクタの札（アイコン＋名前）を上に重ねるので、町の絵は控えめに |
| ランドマップの雲 | ランドマップ（Epic・Legendary のセクタを隠す） | CSS の白い円を重ねたもの | 170×110 | もこもこの雲。少し透ける。ゆっくり横に揺らす |
| セクタの札の絵（21 セクタ別） | ランドマップの各セクタの札 | MCH のランドセクタの絵（`04_Lime_<n>_<Rank>.png`）をランクごとに 1 枚、同じランクのセクタで共用 | 64×64 × 21 | いまのままでも遊べる。余裕があれば土地柄の差分：湖（ユーホタウン）・丘（リデル・ヒルズ）・港（ウメコタウン）・坂の商店街（エムケーシティ）・祭り（オマツリタウン）・桜（サクラコシティ）・織物（ゴリ・ラグズ）・大都市（ザックシティ）など |
| ランドマップの王冠（👑 の絵文字） | ランドマップのセクタの札と説明（そのセクタで 1 位になったことがある＝KGI 達成）・ランド制覇のお祝いの見出し（`landui.ts`・`main.ts` の sectorChecks） | 絵文字で代用 | 16×16・32×32 | 小さな金の王冠。札の文字の横に並ぶので、輪郭のはっきりしたもの |
| セクタごとの他社のお店 80 軒 | タオックス以外の Common 7・Uncommon 5 のセクタの同業他社（`data.ts` の SECTORS の profile.rivals）。地図の他社の店 | タオックスと同じ町の建物を流用（import・general_store・greengrocer・watch） | 1 マス（建物の規格） | そのままでも遊べる。余裕があれば土地柄の差分：リデル・ヒルズは風車のついた金物屋・ユーホタウンはガラス窓の多い工芸店・ウメコタウンは帆布の日よけの店・エムケーシティは幟の立つ坂の店・オマツリタウンは提灯の下がった屋台風の店・サクラコシティは桜の木のそばの和紙店 |
| 他社の店・住宅の Rare 以降の豪華版 | Rare・Epic・Legendary のセクタの地図（他社の店と住宅。いまは Common と同じ絵） | Common と同じ町の建物 | 1 マス（建物の規格）。他社の店 4 種＋住宅 6 種 | 地方の町 → 都会の景色の差を出す：Rare は 3〜4 階建ての商店ビル・タイル張りの集合住宅、Epic はガラス張りの百貨店・高層マンション、Legendary は金の装飾の旗艦店・タワーマンション。正面／背面は Common の各建物と同じ構図で |
| 建築のカテゴリのアイコン 6 つ | 建築の一覧のタブ（本店・お店・物流・倉庫・飲食・娯楽・大型施設） | 絵文字で代用（🏠🛍️📦🍜🎡🏭） | 32×32 | 小さな建物のシルエット 6 種 |
| 「？」のパネル | 建築の一覧で、まだ条件を満たしていない建物 | CSS の斜線と大きな「?」 | 130×130 | 布をかけた建物・霧の中の建物のシルエット（中身が分からないもの）。1 枚でよい |
| スキル「ブランドの看板」など 5 つ | スキルツリー（ブランド力が要るパネル） | 建物・エクステの絵を流用（media・harbor・tower・arena・ランタン U） | 64×48 | 看板・取引先の握手・広告塔・憧れの職場（人が集まる建物）・高級品の棚 |
| スキル「匠の技」 | スキルツリーの技の枝（`src/island/p1/tree.ts` の ICON の t_master。技を 3 つ取ると開放） | オルゴールのアンコモン（2165）のエクステの絵を流用 | 64×48 | 職人の道具一式（金の槌・彫刻刀・やすり）が革のロールに並んだ絵。ほかの技のパネル（作れる商品のエクステ）と並ぶので、商品ではなく「腕前」と分かるもの |
| 素材のアイコン 7 種（鉄・木材・粘土・ガラス・布・紙・宝石） | 調達・BOM・工房・調達係が持つ荷物 | `scripts/island/fx.py` の items() で描いた 24×24 | 24×24（地図では 32 に拡大） | MCH の素材の絵があれば、それを使うのが先 |
| 運搬の荷車 | 地図（工房とお店のあいだを走る） | `src/island/p1/render.ts` の cart() で四角を組み合わせて描いている | 30×20 ほど | 斜め上から見た木の荷車。左右反転で向きを変える |
| 物流・販売のアイコン（🛒・💰 の絵文字） | チュートリアルの 4 つの仕事の図（`src/island/p1/main.ts` の cycleEl） | 絵文字で代用 | 36×36 | 木の荷車（上の荷車と同じ絵でよい）／金貨の袋 |
| アルバイトの人形（👤 の絵文字） | お店の画面のアルバイトの −／＋ | 絵文字で代用 | 20×20 | 店のエプロンをつけた小さな人の立ち姿。いないときは灰色にするので 1 枚でよい |
| スキルツリーの荷車・トラックのパネル（🛒・🚚 の絵文字） | スキルツリー（荷車を増やす・荷車をさらに増やす・小型トラック） | 絵文字で代用（`src/island/p1/tree.ts` の ICON） | 64×48 | 木の荷車 2 台／小さな配送トラック（斜め上から） |
| 技の修行中の印（⏳ の絵文字） | スキルツリーの技のパネルの右上（修行中。`src/island/p1/tree.ts` の is-training）。パネルの下の進み具合の棒と「修行 N 日」の札は CSS | 絵文字で代用 | 24×24 | 小さな金づちと砂時計（修行中＝腕を磨いている途中）。丸い札の中に入るので、輪郭のはっきりしたもの |
| 売上報告の金貨 | 月の売上報告の「稼いだ額」（`src/island/p1/report.ts` の coins）。舞い散る金貨 | CSS の黄色い丸 | 16×16 | GUM の金貨（HUD の G の絵と同じ図柄）。1 枚でよい |
| 売上報告の 4 つの仕事のアイコン（🧱🔨🛒🏪 の絵文字） | 月の売上報告「この月の流れ」（`report.ts` の STAGE_ICON） | 絵文字で代用 | 28×28 | 素材の箱（調達）・金づち（製造）・木の荷車（物流。上の荷車と同じ絵でよい）・お店の正面（販売） |
| 道路のタイル 16 種（つながり方ごと） | 区画の道路 | `scripts/island/fx.py` の roads() | 200×200（タイル規格） | 角・T 字・十字・行き止まり。歩道の縁つき |

- 商品 17（技が要る 12 を足した。`data.ts` の PRODUCTS）は、どれも MCH のエクステ（Common 1xxx・Uncommon 2xxx）の絵と名前をそのまま使うので、仮の絵は無い。技の枝の 7 つ（木工〜宝飾）のパネルも、その技で作れる商品のエクステの絵（椅子・傘・ナイフ・ゴブレット・モアイ・リボン・オルゴール）なので仮ではない。仮なのは上の「匠の技」だけ。

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
