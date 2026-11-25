# device-probe（设备会话验收夹具 · ⛔ 不随壳发货）

Block 3a「设备会话共享契约」的**第二个作者**样本：只用宿主 `linkdesk.device.*`（tcp transport）
实现 acquire/release/getState/recover，**不 import 串口插件任何代码**。

## 命令面

| 命令 | 风险 | 用途 |
|:--|:--|:--|
| `device-probe.acquire` | R1 | `{endpoint, owner?}` → `{sessionId, state}` |
| `device-probe.release` | R1 | `{sessionId, owner?}` → `{released, already?}`（幂等） |
| `device-probe.state` | R0 | `{endpoint?}` → `{sessions}`（四字段） |
| `device-probe.recover` | R1 | `{sessionId}` → `{recovered, sessionId?, ms}` |

## 怎么验

1. 起一个 TCP 回环服务（任何能 listen 的进程即可），记下地址；
2. 把**整个目录**拷进实例插件家（`{userData}/plugins/device-probe/`）——必须作为**已装/已加载插件**运行：
   能力闸要求属主是已加载插件，且本 manifest 根字段必须保留 `"deviceTransports": ["tcp"]`
   （未声明 ⇒ 只保留存量 serial，tcp 会被 `ECAPABILITY` 拒）。⛔ 不要用 `owner:"ghost"`/未知 id 绕过能力闸；
   隔离实例请用 `--user-data-dir` 指向自己的插件家，⛔ 改主 userData；
3. `linkdeskctl doctor --profile device-probe --endpoint 127.0.0.1:<port>` ——
   `a-device-truth`（状态如实/幂等释放）与 `a-device-owner`（EBUSY/EBADARGS）应变真绿；
4. 手工拔“线”：停掉回环服务 → `device-probe.state` 应 `open:false/stale:true`；
   再起服务 → `device-probe.recover` 应 `recovered:true` 且耗时可见。

⛔ 这是验证夹具，不进 `bundled-plugins/`、不进官方目录、不随壳发货。
