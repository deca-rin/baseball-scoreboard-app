# 野球スコアボード

一人がスコアを入力すると、他の人がそれぞれのスマホでリアルタイムに見られる野球スコアボードです。
サーバー不要の静的サイト（HTML/CSS/JS のみ）で、同期には Firebase Realtime Database を使います。

- `index.html` … 入力用（スコアラーが操作する操縦席）
- `display.html` … 表示用（観戦者がスマホで見るゲーム風スコアボード）
- `history.html` … 過去の大会記録を大会名・日付で検索できる記録一覧ページ

## 1. Firebase のセットアップ（最初の1回だけ）

1. [Firebase コンソール](https://console.firebase.google.com/) にアクセスし、Google アカウントでログインして「プロジェクトを追加」で新規プロジェクトを作成する。
2. 左メニューの「構築」→「Realtime Database」→「データベースを作成」を選択。
   - ロケーションは任意（asia-southeast1 など）。
   - セキュリティルールは「テストモードで開始」を選択（身内利用向けの簡易設定。詳細は下記の注意点を参照）。
3. 左メニューの「プロジェクトの概要」の歯車 → 「プロジェクトの設定」→ 画面下部「マイアプリ」で「ウェブアプリを追加」（`</>` アイコン）。
4. アプリ名を適当に入力して登録すると、`firebaseConfig` オブジェクトが表示されるのでコピーする。
5. このプロジェクトの [`js/firebase-config.js`](js/firebase-config.js) を開き、`firebaseConfig` の中身をコピーした値に置き換えて保存する。

```js
export const firebaseConfig = {
  apiKey: "実際の値",
  authDomain: "実際の値",
  databaseURL: "実際の値",
  projectId: "実際の値",
  storageBucket: "実際の値",
  messagingSenderId: "実際の値",
  appId: "実際の値",
};
```

## 2. 使い方

1. `index.html` をスコアラー（入力する人）が開く。
2. 画面上部の「共有」パネルに表示される QR コードまたはリンクを、観戦者に共有する。
3. 観戦者はそのリンク（`display.html?room=xxxx`）を開けば、入力内容がリアルタイムに反映される。
4. チーム名・得点・ボール/ストライク/アウト・打順を操作すると、数秒以内に全員の画面に反映されます。

同じ `index.html` を開いた端末は、初回にランダムな4文字のルームコードを自動生成して URL に付与します。次回以降も同じ端末・同じブラウザなら同じルームコードが再利用されます（別の試合をしたい場合は URL の `?room=` を書き換えてください）。

### 大会記録の保存・検索

- 操縦席の「大会情報」欄で大会名・日付・開始時間を入力できます（`display.html` の見出しにも表示されます）。
- 試合が終わったら「💾 この試合を記録として保存」ボタンを押すと、その時点のスコア・打順が記録として保存されます。
- 「🔄 リセットして次の試合へ」を押すと、大会名・日付は引き継いだまま、得点やBSO・打順をまっさらな状態に戻せます（次の試合の入力を始める前に）。
- `history.html` を開くと、保存した記録を大会名（部分一致）や日付で検索し、スコアボードの詳細を確認できます。

## 3. どこからでもアクセスできるようにする（インターネット公開）

`index.html` / `display.html` は静的ファイルなので、GitHub Pages 等の無料ホスティングに置くだけで、外出先からでもアクセスできます（warikan-app と同じ要領です）。

```
git init
git add .
git commit -m "Add baseball scoreboard app"
git remote add origin https://github.com/<あなたのアカウント>/baseball-scoreboard-app.git
git push -u origin main
```

その後 GitHub リポジトリの Settings → Pages で公開すれば、`https://<アカウント>.github.io/baseball-scoreboard-app/` からアクセスできます。

## 4. セキュリティに関する注意

テストモードの Realtime Database ルールは「誰でも読み書き可能」です。ルームコードを知らない第三者が書き換えることは通常ありませんが、身内・友人内での利用を想定した簡易的な仕組みです。長期運用する場合は、Firebase コンソールの「ルール」タブで期限付きルールに変更するか、認証を追加することを検討してください。
