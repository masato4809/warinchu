# わりんちゅ

登録なしでも使える、リンク共有型の割り勘Webアプリです。任意でChatGPTログインを使うと、この端末で開いた割り勘の履歴と精算状況を一覧表示できます。

## 主な機能

- 登録不要の割り勘グループ作成・共有
- メンバー別の立替記録と自動精算
- 「未精算」「支払い済み」「精算不要」の状態表示
- レシート画像の端末内OCR
- 精算内容のPDF印刷
- 任意のSign in with ChatGPTと暗号化履歴
- スマートフォン対応

## プライバシー設計

グループの名前、メンバー、明細、金額、履歴要約はブラウザ内でAES-GCM暗号化されます。復号鍵は共有URLのフラグメントと端末のローカルストレージに保持され、サーバーには送信されません。

サーバーに保存されるもの:

- グループIDと暗号文
- 編集用トークン
- ログイン履歴を紐付けるサイト固有ユーザーID
- 更新日時

公開リポジトリに含めていないもの:

- 本番サイトのプロジェクトID
- 本番・ローカルのデータベース
- 環境変数、認証トークン、Cookie
- ビルド成果物と作業用アーカイブ

ログイン済みでも、新しい端末では共有リンクを一度開いて復号鍵を受け取るまで履歴内容を表示できません。

## ローカル起動

Node.js 22.13以降が必要です。

```bash
npm ci
npm run dev
```

表示されたローカルURLをブラウザで開いてください。ローカル開発ではChatGPTログインのテスト用ユーザーが提供されます。

## DBマイグレーション

```bash
npm run db:generate
npm run build
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0000_unknown_victor_mancha.sql
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0001_magenta_mister_fear.sql
```

## デプロイ

このプロジェクトはCloudflare Workers互換のVinext構成です。Codex Sitesで公開する場合は `.openai/hosting.example.json` を `.openai/hosting.json` にコピーし、Sites側で新しいプロジェクトIDとD1バインディングを設定してください。

既存の公開サイトのプロジェクトIDやデータは、このリポジトリには含まれていません。
