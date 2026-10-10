# Architecture Decision Records

設計上の判断と、その理由を記録する。形式は Michael Nygard の ADR（状況・決定・結果）に従う。判断を覆すときは、元の ADR を書き換えず、新しい ADR を追加して元の状態を「置き換え済み」にする。

| 番号 | 判断 | 状態 |
|---|---|---|
| [0001](0001-bedrock-addon-with-stable-script-api.md) | Bedrock の Add-on として作り、Script API は安定版だけを使う | 承認 |
| [0002](0002-script-driven-vehicle-movement.md) | 走行はスクリプトで速度を与える方式にする | 承認 |
| [0003](0003-friction-compensation-and-axis-wall-detection.md) | 地面摩擦を推定して補正し、壁との衝突は軸ごとに判定する | 承認 |
| [0004](0004-two-block-step-up-by-look-ahead.md) | 2 段の段差はスクリプトの先読みで越える | 承認 |
| [0005](0005-touch-throttle-compensation.md) | スマホのジョイスティックのアクセル量を補正する | 承認 |
| [0006](0006-ram-damage-and-occupant-protection.md) | 衝突ダメージの判定と、乗員を常に守る扱い | 承認 |
| [0007](0007-seats-and-driver.md) | 座席と運転者の決め方 | 承認 |
| [0008](0008-vehicle-item-and-breaking.md) | 車の出し入れ | 承認 |
| [0009](0009-vehicle-model-conventions.md) | 車のモデルの規約と、正方形の当たり判定の受け入れ | 承認 |
| [0010](0010-testing-strategy.md) | テストの方針 | 承認 |
| [0011](0011-dev-server-docker-raknet.md) | 開発用サーバーは Docker の BDS で raknet を使う | 承認 |
| [0012](0012-ddd-layered-architecture.md) | ドメイン・アプリケーション・インフラストラクチャの 3 層に分ける | 承認 |

判断の根拠になった計測と実機テストは、スパイク（PR #1）の `spike/README.md` にある。
