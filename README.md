# DAYTRACE

毎日の登校、勉強、課題を記録するローカルファーストのWebアプリです。計画・課題・勉強履歴などは端末内（IndexedDB）に保存し、設定画面からGoogle Driveを使ってスマホとPCで手動同期できます。アプリ用のサーバーやGoogleアカウントのパスワード入力は不要です。

## 公開URL

GitHub Pages: https://pipipi1212.github.io/routine_stamps/

スマホとPCの両方でこの同じURLを開き、ホーム画面に追加して利用できます。HTTPSのため位置情報機能も利用できます。

## Google Drive同期の初期設定

最初にGoogle CloudでOAuthクライアントIDを作成します。Google Cloud Consoleでプロジェクトを選び、Google Drive APIを有効にして、OAuth 2.0 クライアントIDを「ウェブアプリケーション」として作成してください。

- 承認済みの JavaScript 生成元に `https://pipipi1212.github.io` を追加
- ローカル開発でも使う場合は `http://localhost:8000` も追加
- OAuth同意画面がテスト状態の場合、テストユーザーに利用するGoogleアカウントを追加
- 作成されたクライアントID（`...apps.googleusercontent.com`）をDAYTRACEの「設定」→「スマホ・PCのデータ共有」に入力し、Google連携設定を保存
- PCとスマホの両方に同じクライアントIDを設定し、Googleアカウントで同期を実行

[Google Drive APIを有効にする](https://console.cloud.google.com/apis/library/drive.googleapis.com) · [OAuthクライアントの作成手順](https://developers.google.com/identity/oauth2/web/guides/get-google-api-clientid) · [ブラウザ向けトークンモデル](https://developers.google.com/identity/oauth2/web/guides/use-token-model)

DAYTRACEはGoogle Driveの非表示アプリデータ領域（`appDataFolder`）だけを使います。ファイル一覧や他のDriveファイルにはアクセスしません。認証トークンはブラウザのメモリだけで使い、保存しません。Googleの仕様上、トークンが期限切れになったら同期ボタンから再度許可します。

## 同期内容とプライバシー

- 登校予定、チェックイン結果、課題、完了した勉強セッション、週間目標、スタンプを共有
- GPSの緯度・経度はクラウドに送らない（距離や判定結果は同期）
- 実行中・一時停止中のタイマーはその端末に留め、完了後に同期
- 同期は自動ではなく、記録した各端末で「今すぐ同期」を押す方式
- 端末別の同期ファイルを読み合わせて統合するため、片方の端末がもう片方の履歴全体を置き換えない
- 同期は追加・更新を統合します。端末から削除した個別データの削除は他端末に伝播しません

Google Driveを使わない場合も、端末内で単独利用できます。端末のブラウザデータを消す前に、設定のバックアップ機能も利用してください。

## ローカル起動

```powershell
node serve.mjs
```

PCでは `http://localhost:8000` を開きます。GitHub Pagesへ配置する場合、HTML/CSSとJavaScriptファイルをすべてリポジトリのルートに置いてください。

## 含まれる機能

- ホーム、日別計画、登校チェックイン、課題管理、勉強タイマー、コレクション、振り返り、設定
- IndexedDB保存、JSONバックアップ、オフライン起動の補助
- JSTの期限判定、GPS距離判定、日次・週次の勉強集計、スタンプ
- Google Driveアプリデータ領域を使った端末間の手動同期

大学の座標は初期設定されていません。チェックインを使う場合、大学の設定を端末で行ってください。
