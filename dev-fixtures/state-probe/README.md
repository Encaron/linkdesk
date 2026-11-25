# state-probe（契约验收夹具 · ⛔ 不随壳发货）

T-B「状态命令约定」（[13-状态命令约定](../docs/04-软件更新/待抉择池/AI门外契约面补齐/13-状态命令约定.md)）的验证插件：
一个**无视图、只有命令**的最小纯软件插件，用来证明外部 AI 能走完
「读快照 → 改 → 回读确认 → 同键重试不重复 → 版本冲突自纠」全链路。

## 命令面

| 命令 | 风险 | 用途 |
|:--|:--|:--|
| `state-probe.readState` | R0 | 读状态快照（`value/stateVersion/updatedAt`） |
| `state-probe.writeValue` | R1 | 写值，回后置状态；带 `expectedVersion` 做版本前置；带 `idempotencyKey` 交给宿主回放 |
| `state-probe.reset` | R1 | 复位夹具状态（收尾用） |

## 为什么需要它

存量官方插件**没有一条**声明 `idempotencyKey` / `expectedVersion`——用真实插件验不了这条契约。
夹具是「第二个作者」样本：只读 `plugin.json` 的声明面（`params` / `returns` / `risk` / `activation`），
不读串口插件源码，把状态类插件该做的事做全。

## 怎么用

1. 把本目录拷进目标实例的插件家（`{userData}/plugins/state-probe/`，或 dev 的 `LINKDESK_USER_PLUGINS_HOME`）；
2. `linkdeskctl doctor --profile state-probe` —— 三条新断言（`a-state-keys` / `a-idempotent` / `a-conflict`）应全绿；
3. 手工验收：
   ```bash
   linkdeskctl exec state-probe.reset
   linkdeskctl exec state-probe.writeValue '{"value": 7, "idempotencyKey": "k1"}'   # stateVersion 1
   linkdeskctl exec state-probe.writeValue '{"value": 7, "idempotencyKey": "k1"}'   # replayed:true，版本仍是 1
   linkdeskctl exec state-probe.writeValue '{"value": 8, "expectedVersion": 0}'     # ECONFLICT + details.stateVersion=1
   ```

⛔ 这是验证夹具，不进 `bundled-plugins/`、不进官方目录、不随壳发货。
