# AGENTS.md — SUPERNOVA

AIエージェント向けの開発ガイド。このリポジトリで作業する前に必ず読むこと。

## プロジェクト概要

**SUPERNOVA** は、タップ融合パズルのWebゲーム(スマホ最優先)。
タイル=元素で、融合すると原子番号が合算される。恒星内元素合成(鉄で止まる→超新星→ブラックホール)という実際の天体物理をゲームルールに写像しているのが独自性。

- オーナー: Tono(tonosaki.shuntaro@gmail.com / GitHub: tonochan)
- 動機: 自分がハマるゲームを自作して開発者目線を学ぶ + 知育要素(元素記号の学習)
- 本番: https://tonochan.github.io/supernova/
- ベータ: https://tonochan.github.io/supernova/beta/
- リポジトリ: https://github.com/tonochan/supernova (public)
- 関連KB: `tono HQ/20_Projects/140_Supernova_Game.md`(概要・判断ログ)

## ゲームルール(現行仕様)

- 5×5盤面。タイルは色つきの「星屑」で、H(水素=1)などの軽い元素として上から降る
- **隣接する同色グループ(2枚以上・数字不問)をタップで融合**。原子番号は合計、**色は保存される**
- 序盤は3色(red/yellow/green)。そのゲームで初めて超新星を作ると4色目(blue)が降りはじめる
- **Fe(26)=`NOVA_AT` 以上で超新星(nova)化**(白タイル)。novaはnova同士のみ融合
- **Og(118)超え=`HOLE_AT`(119)でブラックホール(hole)化**。holeはhole同士のみ融合
- 隣接する融合可能ペアが消滅したらゲームオーバー
- スコア=融合で生まれた値の累計。ベストは localStorage `supernova-best`
- 降ってくる元素: H/He/Li/Be の重み付きランダム(軽いほど高頻度)。最大タイルの成長で上限拡大(nova後→C、60超→O、hole後→Ne)。`spawnValue()` 参照
- 発見した元素はミニ周期表に点灯(localStorage `supernova-found`、0はブラックホールの印)

## UI/UX の重要な設計判断

- **色がマッチングキー**(数字ではない)。v1は数字=色で「盤面がバラけて続かない」とオーナー評価→色保存に変更した経緯がある。ここを崩さない
- 同色の隣接タイルは1つのブロブとして見た目が一体化(`updateConnections()` が隙間・角丸・ベベルを制御)
- 融合で次段階(nova/hole)に進むグループは**タイル本体が内側から明滅**(`will-nova` クラス)。外側へのdrop-shadowは「隣が光って見える」ためNG(修正済みの過去バグ)
- 記号の周りの**進捗リング**: 色タイルは value/26、novaは value/118 が12時から時計回りに塗られる
- タイルには元素記号+原子番号(左上、周期表風)+元素名キャプション
- 成長表現: 値が上がるほど色が深くなり(`COLOR_RAMP`)、中心に「熱い核」の光(`bgFor()`)
- 日英切替: デフォルトは `navigator.language`(ja→日本語)。手動切替は localStorage `supernova-lang`。UI文字列は `game.js` の `STR`、日本語元素名は `ELEMENT_NAMES_JA`
- リスタートは「戻るボタン(↺)→確認モーダル→タイトル→あそぶ」の動線。直接の「はじめから」ボタンは意図的に廃止

## 技術構成

- **Vanilla JS + HTML + CSS のみ。ビルドなし、依存なし**。この方針を維持する(フレームワーク導入はオーナーに確認)
- ファイル: `index.html` / `style.css` / `game.js` の3枚 + `.github/workflows/deploy.yml`
- フォント: Fredoka(英数字)+ Zen Maru Gothic(日本語)。Google Fonts
- 効果音: WebAudioでその場で合成(`blip()`)。音声ファイルなし
- ローカル起動: `python3 -m http.server 8420`(`.claude/launch.json` の `supernova`)

## デプロイ / ブランチ運用

- GitHub Actions(`deploy.yml`)が **main→gh-pagesルート、beta→gh-pages/beta/** に配信(peaceiris/actions-gh-pages、keep_files: true)
- GitHub Pages の配信元は **gh-pages ブランチ**
- **開発は beta ブランチで行い、betaへのpushは確認不要**(オーナー指示)。ベータURLで実機確認→OKが出たらmainへff-merge
- **mainへのマージ(本番反映)は必ずオーナーの確認を取る**
- Pagesが自動再ビルドしない場合: `gh api -X POST repos/tonochan/supernova/pages/builds`
- コミットは小さく。オーナーは動作を自分で確認してから本番に出したい人

## タスク管理

- **GitHub Issues** で管理する(日本語でよい。オーナーの言葉を残す)
- AIが実装したら、Issueは勝手にクローズせず「実装済み(betaで確認可能)」とコメントしてレビュー待ちにする
- 着手前に `gh issue list` で現状を確認すること

## 法務・ブランディング上の注意

- 他作品のゲーム名を、このリポジトリのコード・文言・宣伝に出さない
- 街・ビル・シティ等の用語は名前/コード/文言から排除済み(パクリ感回避のオーナー意向)。復活させない
- 元素データ(記号・名前)は事実情報でパブリックドメイン

## 未実装のアイデア(優先度はIssue参照)

- リプレイモード(手順の見返し・自動再生)— 重いので後回し指定あり
- PWA化(manifest+アイコン、オフライン対応、ホーム画面追加の体験向上)
- Aboutモーダル(着想元への謝辞+作者+GitHubリンク)
- 詰み救済メカニクス、効果音の充実、スコアバランス調整
