# まなびログをRenderで公開

Renderで「New → Blueprint」を選び、このリポジトリのmainブランチを接続します。
ルートの render.yaml が Node.js Web Service と PostgreSQL を同じリージョンに作成し、接続情報を自動で設定します。
作成前に両方のプランが Free と表示されていることを確認します。公開後、Web Serviceの詳細に表示される onrender.com URL を使います。

旧サービスの学習履歴は、新規データベースに自動で移行されません。
無料PostgreSQLの利用期限はRenderのダッシュボードで確認できます。
