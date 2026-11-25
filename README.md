# まなびログ

科目・学習日・時間・メモを記録し、科目別の学習時間と合計時間を振り返るサーバーサイドWebアプリです。

## ソースコード

`manabi-log-source.zip` を展開してください。アプリ、データベースの定義、ローカル起動用設定が入っています。

| ファイル | 内容 |
| --- | --- |
| `app/page.tsx` | 学習記録の一覧とサーバー側の集計 |
| `app/records/route.ts` | 入力の検証、記録の追加と削除 |
| `db/schema.ts` | 学習記録テーブルの定義 |
| `drizzle/` | テーブルを作成するマイグレーション |

## ローカル起動

Node.js 22.13 以上で、展開先のディレクトリから順に実行します。

```sh
npm ci
npm run build
node -e "const fs = require('node:fs'); fs.cpSync('drizzle', 'dist/server/migrations', { recursive: true });"
npm run db:local
npm start
```

ターミナルに表示されたローカルURLを開きます。学習記録はブラウザーの Cookie に紐づけて管理します。
