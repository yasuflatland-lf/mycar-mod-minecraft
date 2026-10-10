# 0011. 開発用サーバーは Docker の BDS で raknet を使う

- 状態: 承認
- 日付: 2026-10-10

## 状況

開発中は、Add-on を入れた BDS を手元で動かし、LAN の PC とスマホから接続して確かめる。BDS は Linux 版を Docker（`itzg/minecraft-bedrock-server`）で動かす。

BDS の初期値 `transport=nethernet` では待ち受けポートが毎回ランダムに決まり、Docker のポート転送（19132/udp）が届かなかった。Mac 自身からの接続にも応答しなかった。

## 決定

- 開発用サーバーは Docker の BDS で動かし、`TRANSPORT: raknet` を指定して 19132 番で待ち受ける
- Behavior Pack と Resource Pack はリポジトリのディレクトリをコンテナにマウントする。スクリプトだけの変更は `/reload` で反映し、エンティティ定義と Resource Pack の変更はサーバーを再起動する
- Resource Pack を変えたら、マニフェストのバージョンを上げる。上げないと、端末に保存された古いパックが使われる
- ワールドのデータ（`server/data/`）は git の管理外にする

## 結果

- PC とスマホから、Mac の LAN の IP アドレスとポート 19132 で接続できる
- Docker のネットワークのアドレスプールが使い切られている環境では、`network_mode: bridge` を指定する必要があった
