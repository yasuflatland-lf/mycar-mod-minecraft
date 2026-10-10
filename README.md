# mycar-mod-minecraft

MrCrayfish's Vehicle Mod に近い遊び方を、Minecraft Bedrock Edition の Add-on（Behavior Pack + Resource Pack + Script API）で実現するプロジェクトです。

想定する遊び方: 自宅 LAN の Bedrock Dedicated Server で、PC（キーボード）とスマホ（タッチ）から一緒に遊ぶ。

## 状態

検討中です。最初のサブプロジェクトは「走行コア」（乗車、アーケード寄りの加速・慣性・旋回、タイヤの回転と車体の傾き）です。

## 開発環境

Node と pnpm のバージョンは `mise.toml` で固定しています。[mise](https://mise.jdx.dev/) を入れてから、次を実行します。

```sh
mise install
pnpm install
```
