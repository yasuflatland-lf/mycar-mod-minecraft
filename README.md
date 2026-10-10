# mycar-mod-minecraft

MrCrayfish's Vehicle Mod に近い遊び方を、Minecraft Bedrock Edition の Add-on（Behavior Pack + Resource Pack + Script API）で実現するプロジェクトです。

想定する遊び方: 自宅 LAN の Bedrock Dedicated Server で、PC（キーボード）とスマホ（タッチ）から一緒に遊ぶ。

## 状態

走行コア（1 台の SUV に乗って運転できる）を実装中。設計の判断は `docs/adr/`、手動テストの手順は `docs/manual-test.md` にある。

## 開発

```sh
mise install && pnpm install
pnpm test            # 単体テスト・性質ベーステスト・層の依存の検査
pnpm run build       # TypeScript を Behavior Pack にまとめる
pnpm run model       # 車のモデルとテクスチャを生成する
pnpm run server:up   # 開発用の BDS を Docker で起動する
pnpm run test:game   # ゲーム内テスト
```

## 開発環境

Node と pnpm のバージョンは `mise.toml` で固定しています。[mise](https://mise.jdx.dev/) を入れてから、次を実行します。

```sh
mise install
pnpm install
```
