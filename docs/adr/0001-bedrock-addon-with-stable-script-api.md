# 0001. Bedrock の Add-on として作り、Script API は安定版だけを使う

- 状態: 承認
- 日付: 2026-10-10

## 状況

MrCrayfish's Vehicle Mod に近い遊び方を、Minecraft Bedrock Edition で実現したい。Bedrock には Java 版の Forge や Fabric のようにゲーム本体を拡張する仕組みがなく、作れるのは Add-on（Behavior Pack と Resource Pack）である。動きの制御には、JSON のエンティティ定義と Script API（`@minecraft/server`）を使う。

Script API には安定版とベータ版がある。ベータ版はワールドで実験機能を有効にする必要があり、ゲームの更新で互換性なく変わることがある。遊ぶ環境は自宅 LAN の Bedrock Dedicated Server（BDS）で、PC とスマホが参加する。

## 決定

- Behavior Pack・Resource Pack・Script API の Add-on として作る
- Script API は安定版の `@minecraft/server` 2.x だけを使う。ベータ API と実験機能は使わない
- スクリプトは TypeScript で書き、esbuild で 1 ファイルにまとめて Behavior Pack に入れる

## 結果

- ゲームの更新で動かなくなる危険が小さい。必要な入力 API（`InputInfo.getMovementVector()`）は v1.21.70 で安定版になっていて、ベータに頼らずに済む
- ベータにしかない API が必要になったら、この ADR を見直す
- スクリプトはサーバー側でしか動かない。クライアント側で車の動きを先回りして計算する手段はない（0002 の制約の原因）
