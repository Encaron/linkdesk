# M4 spike（`AI#31`）—— **一条 CLI 命令能不能真控制运行中的实例？**

> **归属**：**一次性原型 + 结论**。正式件是 `AI#32`–`AI#37`（`electron/services/aiBridge/` ＋ `cli/linkdeskctl/`）。
> 本夹的东西**不进软件产物、不进 `npm run check` 链、不占版本号**——它的唯一用途是「把未知退掉」，
> 然后**允许被删**（结论已回写 `AI-执行清单.md` 第 4 轮 `AI#31`）。
> 读数原件 = 同夹 [`READINGS.txt`](./READINGS.txt)（一次完整跑的 stdout，71 条读**全绿**）。

---

## 一、结论（一句话）

**✅ 通。** 一条 CLI 命令真能控制运行中的实例，且**四条判据全部有真机读数**：
① 一条命令 → 壳真执行 → **两个独立读面**都看到变化；② 软件没开时行为明确、**不挂死**；
③ 失败路径**六种故障分得开**、每种都说出下一步；④ 多实例下第二只**什么都不做**、第一只照常服务。

⇒ **`AI#32`–`AI#44` 可以按原设计铺开**，不必改判。但有 **1 条必办**（缺口①：未知命令静默成功，见 §五）
与 **6 条口径**（§六）要带进落地。

## 二、怎么跑（30 秒）

```bash
npm run dev                                      # ① Vite（dev 轨道，必须有 —— 见 §五 发现 ④）
node scripts/dev/m4-spike/accept.mjs             # ② 全部阶段（自查环境 + 起隔离实例 + 71 条读数）
node scripts/dev/m4-spike/accept.mjs --only mcp  # 单阶段调试
node scripts/dev/m4-spike/linkdeskctl.mjs --help # ③ 手玩 CLI（连不上时也照常可用）
```

实例的起法（脚本内部就这么干；手玩时照抄）：

```bash
NODE_OPTIONS="--require <本目录>/main-hook.cjs" LINKDESK_M4_SPIKE=tcp \
  node_modules/electron/dist/electron.exe . --user-data-dir="$TEMP/ldk-m4spike-$$"
```

## 三、四件东西

| 文件 | 是什么 | 正式归谁 |
|---|---|---|
| `main-hook.cjs` | **主进程侧**：通道（pipe/tcp）＋ token 校验 ＋ 操作表 ＋ 经壳信封转发 ＋ 操作账 ＋ 记录文件 | `AI#32`（`electron/services/aiBridge/index.ts`）＋ `AI#33`（`whitelist.ts`）|
| `bridge-client.mjs` | **通道发现 ＋ 一条请求 ＋ 错误分类法**（CLI/MCP/验收三处共用一份，⛔ 不许 fork） | `AI#32` 的客户端半 ＋ `AI#34` |
| `linkdeskctl.mjs` | **CLI 皮**：子命令、`--json`、`--help` 自省（含离线降级） | `AI#34` ＋ `AI#35` |
| `mcp-stdio.mjs` | **MCP 皮**：stdio JSON-RPC ＋ `tools/list` ＋ `tools/call` ＋ 冷启动三段行为 | `AI#36` ＋ `AI#37` |
| `accept.mjs` | **验收读数器**：把四条判据拆成 71 条具名读（含负控），全绿才退出 0 | `AI#44` 的验收骨架 |

**注入式而非改产品码**：全部跑在 `NODE_OPTIONS=--require` 注入里，**软件侧一行未改**
（`accept.mjs` 的 `decouple` 阶段每次跑都自证：`src/electron/packages/plugins/cli` 未提交改动 = 空）。

## 四、四条判据 → 读数

### 判据 ①：一条 CLI 命令真控制运行中实例（⛔ 非坐标）

**控制读数**（`app.openAiManual` = 真产品命令，开 AI 手册标签）：

```
tcp.exec 一条 CLI 命令被接受            {"commandId":"app.openAiManual","result":null}
tcp.证人①（本通道读取面）                before=false → after=true   tabs=welcome-2,release-notes,ai-manual
tcp.证人②（CDP 独立读面）                cdp tabs=welcome,release-notes,ai-manual
tcp.两个证人一致（本通道 ⊆ CDP）           bridge=true  cdp=true
pipe.管道下 exec 同一条命令也真控制得住        before=false → after=true
```

🔴 **证人②是本条判据的骨头**：它不是「用我的通道读我自己」，而是**绕开本通道**、用 CDP
在池页里读 `window.linkdesk.tabs.list()`（M1 `AI#4` 的读取面）。两个证人都说 `ai-manual` 出现了，
才叫「真到了壳」，不是「网关自己说自己成功」。

**认人读数**（M5 教训：存在 ≠ 是它）：

```
tcp.🔴 认人：应答 pid == 我们 spawn 的 pid    应答=37824  spawn=37824
pipe.管道下认人依旧对齐                     pid 一致
```

客户端**每次调用都先 `ping` 并把应答 pid 与记录里的 pid 逐字对齐**（不等即 `STALE_IDENTITY`）。

### 判据 ②：冷启动有明确行为（`AI#37`）

```
mcp(无记录).tools/list 立刻应答（⛔ 不挂死）      108ms
mcp(无记录).清单退回静态表并标明来源           静态表（离线）
mcp(无记录).linkdesk_status 离线可用（读文件面）   80ms  原因: NO_RECORD
mcp(无记录).要软件的工具 ⇒ isError + 可读原因      79ms（默认 WAIT_MS=0 ⇒ 不傻等）
mcp(等多久可配).WAIT_MS=800 真等约 800ms 再报原因  897ms
mcp(等多久可配).等满后如实说出「等了多久」          无法调用 tabs（等了 815ms）…
```

**三段答案（都可配）**：① `initialize`/`tools/list` **立刻应答**，不等软件；
② `linkdesk_status` **永远可用**（它读**文件面** = 记录文件 ⇒ 不需要软件运行，这就是「离线能力」）；
③ `LINKDESK_MCP_WAIT_MS`（默认 **0** = 不等）>0 时**真轮询等**，等满把「等了多久、为什么」写进错误文本。
**默认 0 是有意的**：MCP 客户端常在启动时批量试调工具，默认傻等会让它整段卡住。

### 判据 ③：失败路径有可读原因（「连不上」不是一种故障，是**六种**）

| 场景 | 机读 code | 人读一句 | 下一步 |
|---|---|---|---|
| 软件没跑过 / 指错目录 | `NO_RECORD` | 没有通道记录（找过 A · B · C） | 起软件 / 指对 `--user-data-dir` |
| 软件在跑、开关关着 | `SWITCH_OFF` | 软件在跑（pid 67040，linkdesk 0.2.21），但 **AI 接入开关是关的** | 去开开关（`AI#38.3`）|
| 想开但**监听失败** | `LAST_FAILED` | 软件在跑，但**通道没起来**：`EADDRINUSE` | 换端口重启 |
| 记录在、进程没了 | `APP_EXITED` | 记录说在 127.0.0.1:59827 监听，但那个 pid 已经不在了 —— **残留记录** | 重启软件 |
| 有进程、连被拒 | `REFUSED` | 连 … 被拒（pid 还活着） | 等它起完 / 查那只进程 |
| 应答了但凭据不对 | `EAUTH` | 凭据不对（token 不匹配） | 用新凭据（`AI#38.9`）|

**两类关键负控**（都实测）：错凭据 → `EAUTH`；表外操作（`rm -rf /`）→ `EOP`（网关**只有表里的操作**，⛔ 不给任意 JS）。

### 判据 ④：多实例不失控（`AI#41` 的单实例半）

```
multi.第二只自己退出了（单实例锁生效）        exitCode=0
multi.🔴 记录 pid 未被第二只改写            现在 pid=55608 原 pid=55608
multi.🔴 记录仍说 listening（没被改成失败）    listening=true lastError=null
multi.第一只照常服务（CLI 仍通、pid 不变）      pid=55608
multi.壳窗仍只有 1 只（第二只没开新窗）        shellWindows=1
```

**负控**（把启动门拆掉，`LINKDESK_M4_SPIKE_NO_LOCK_GUARD=1`）：

```
multi(负控).拆掉启动门 ⇒ 记录被第二只污染        pid 53528 → 64480
multi(负控).污染后 CLI 会误报                  code=APP_EXITED（把真在服务的第一只报成「已退出」）
```

⇒ **输掉锁的那个进程不许改写记录/抢绑端口**：不设门的话，第二只（明明整只进程马上要消失）
会把记录改成自己的 pid，于是 CLI 认错实例 —— 这正是 M5 那条「假绿」的同型病。

## 五、五个发现（都带读数，写给落地人）

### ① 注入件的头号坑：`--require` 早于 Electron 接线

`--require` 在 **Node 的 `pre_execution`** 阶段就跑，此刻 `require("electron").app` 还是 `undefined`
⇒ 顶层一碰 `app.getPath` 就 `TypeError`，**整只主进程起不来**（实测：白屏 + 无记录）。
解法：顶层只做「不碰 electron」的事，其余丢给 `setImmediate` 重试到真模块可用。
（`process.type === "browser"` 的守卫本身是有效的——渲染进程也会加载本 hook。）

### ② 启动点必须在「抢到单实例锁之后」（= 判据 ④ 的机制）

见上 §判据 ④ 的负控读数。

### ③ 监听失败不许静默（= 判据 ③ 的机制）

`EADDRINUSE` 时把 `lastError` 写进记录 —— 否则**「软件在跑但通道没起来」与「开关关着」在客户端不可分辨**
（同 M5 的 CDP 端口不重试结论）。

### ④ 🔴 dev 轨道可能发着**过期模块**（环境坑，⛔ 与 M4 无关但会骗你一轮）

实测现象：**新建实例**也卡在启动图，壳 `#root` 永远空 ⇒ 主进程转给壳的每条请求都超时（读数是 4 条互相矛盾的假红）。
真因（`ELECTRON_ENABLE_LOGGING=1` 抓到的）：

```
Uncaught SyntaxError: The requested module '/src/core/commands/shell/panelCommands.ts?t=…'
  does not provide an export named 'resolvePanelChecked'
  （来自 IpcBridgeHandler/ui.ts —— 磁盘源码两边都自洽，是 **Vite 的变换缓存过期**）
```

治法：`touch` 那两个文件让 Vite 重新变换（或重启 Vite）。⛔ **新建实例躲不过**（不是 HMR 的问题）。
⇒ 故 `accept.mjs` 加了一条 **preflight**（Vite 可达 + 壳缝就绪），把「环境坏了」与「通道坏了」**分开报**，
并把 `#成功读数` 交给 `READINGS.txt` 而不是让人凭记忆。

### ⑤ 🔴 缺口①：未知命令**静默成功**（既有行为，⛔ 不是本棒引入）

```
tcp.缺口①：未知命令被静默接受       exit=0 result={"commandId":"no.such.command.xyz","result":null}
tcp.缺口①.后果：账本把它记成 ok=true  [{"op":"exec","arg":"no.such.command.xyz","ok":true,"code":null,"ms":1}]
```

根因：`CommandRegistry.executeCommand`（`src/core/registry/commands/CommandRegistry.ts:392`）未注册时只
`console.warn` 后 `return undefined`；handler 抛错也只 `reportError` 后返回 undefined。
⇒ **调用方（含 AI）无法从返回值分辨「做了」与「没做」**，账本也随之失真（`AI#43` 的判据是「日志 =
真实调用记录」，而「成功」在这里不等于「真做了」）。

**必办项（带进 `AI#32`/`AI#33`）**：网关要么**先查存在性**（白名单/命令清单是运行期派生的，查得到），
要么要求壳侧命令执行**回传真结果**（成功/失败/异常），二者至少一件。⚠️ 这是**产品面行为**（影响壳内命令路径
与插件），改它要走设计门（硬约束 16 / `design-flow`），⛔ spike 不动它 —— 本棒只把现象变成读数。

## 六、落地口径（`AI#32`–`AI#44` 逐格）

| 格 | 本棒给出的口径 |
|---|---|
| `AI#32` 内核网关 | ① 落 `electron/services/aiBridge/`；② **启动点 = `app.whenReady()` ＋ `app.hasSingleInstanceLock()` 双门**（发现②）；③ **监听失败写 `lastError`**（发现③）；④ 与壳的缝**复用既有 `bridge:*` 信封**（新增 requestId 前缀即可，**0 条新 IPC 通道**）；⑤ 地址/端口**全是配置**（见 §七）；⑥ 必办 = 缺口①|
| `AI#33` 白名单 | 形态实测有效：**操作表每条自带 `help`/`params`，`describe` 从同一张表派生** ⇒ 清单与真实现不可能漂移（`linkdeskctl --help` 的「静态表 vs 实例清单」对账**差集双向空**）。落地照抄这个形状 |
| `AI#34` CLI | 🔴 **通道发现不是「猜端口」而是「读记录文件」**；userData 候选要**两个都试**（dev = `%APPDATA%\linkdesk`，打包 = `%APPDATA%\LinkDesk`，来自 electron-builder 的 `productName`）。PATH 已现成，不用补安装器项 |
| `AI#35` `--help` 自省 | 已在原型里跑通：**在线时附「运行中实例自省」＋ 双向对账**；**离线时降级为静态骨架并如实标注**（`norecord.--help 离线照常可用`）|
| `AI#36` MCP 皮 | stdio 手搓 JSON-RPC 可行且省事（Windows 上 **无端口、无防火墙弹窗**）；⛔ stdout 只放协议报文 |
| `AI#37` 冷启动 | 三段答案见 §判据 ②；**默认不傻等**是设计选择，`WAIT_MS` 可配 |
| `AI#38.x` 设置页 | 本棒**用环境变量代开**（按交办，设置面归 `AI#38`）。`AI#38.3` 的三个开关就是 `LINKDESK_M4_SPIKE`/`_HOST`/`_PORT` 的正式化；`AI#38.4` 的状态行**有真数据源**（`ping` 给 pid / endpoint / uptime，⛔ 不写死字符串）|
| `AI#39` 默认关 | **判据 ④ 的门锁语义已在读数里**：`off` ⇒ **不建任何监听**（连管道都不建），但留一条记录 ⇒ 客户端能说出「软件在跑、开关是关的」。这就是「门锁/钥匙」相对裸 CDP 的差别 |
| `AI#40` 安装器/PATH | 本条未碰安装器；但要带一条：**CLI 必须先找对 userData**（上面 `AI#34` 的候选表）|
| `AI#41` 多窗口/单实例 | 单实例半 = §判据 ④（含负控）；⚠️ **多窗口半未做**：原型 `sourceWindowId` 固定 `"main"`，多窗下**必然要按目标窗路由** —— 这正是 `AI#41` 的活 |
| `AI#42` 安全评估 | 原型给了三件**可评估的实体**：`timingSafeEqual` 凭据校验、**表外操作即拒**（`EOP` 读数）、**地址/端口可配**（§七）。⚠️ 跨机绑定时**没有任何对端认证/TLS** —— 开口子前必须补，这是 `AI#42` 的题 |
| `AI#43` 日志/账本 | 账本**先记后判**（含被拒的调用，读数：`每条都有 ok 字段`）；⚠️ 缺口①说明账本当前**会记假成功** ⇒ 「成功」要取壳侧真结果，不是「传输成功」 |
| `AI#44` 全链验收 | 直接复用 `accept.mjs` 的四条判据结构（每条判据 = 正控 + **负控**）；`AI#19` ①（CLI/MCP 装插件→打开→操作）只需在此之上加「装插件」一条链 |

## 七、「留口子」硬要求（用户 2026-09-28 拍板）怎么落的

| 要求 | 原型怎么答 | 读数 |
|---|---|---|
| 内核不许假设调用方在本机 | 代码里**没有一处**「非本机即拒」的判断；地址取自 `LINKDESK_M4_SPIKE_HOST` | `bind.地址取自配置（记录里就是 127.0.0.2）` ＋ `该地址上一条命令真通` ＋ 负控 `同端口在 127.0.0.1 上无人听` |
| 绑定地址可配 | 同上；**回环是默认值（配置的结果），不是代码假设** | 同上 |
| 凭据机制可扩展 | 校验收敛到**一处** `tokenOk()`（`timingSafeEqual`），换机制只改这一处；凭据**与地址分家**（两个文件） | `tcp.✗ 负控：错凭据被拒（EAUTH）` |
| 白名单/日志不依赖来源 | 操作表与账本**与传输无关**（pipe/tcp 同一张表、同一本账） | `pipe.管道下也走得到壳` / `pipe.管道下 exec 真控制得住` |

⚠️ **诚实边界**：**跨机绑定没实测**（只测了 `127.0.0.2` 这个「另一个回环地址」，证明地址是配置项；
⛔ 没有验「真开到 0.0.0.0 / 局域网」）。跨机一旦开口子，**对端认证/TLS/限速**都还没影 —— 见 `AI#42`。

## 八、没验的 / 边界（⛔ 别当成验过）

- **打包态（安装版）未验**：本棒全跑 **dev 轨道**。打包态要多验两条：userData 目录名（`LinkDesk` 大小写）、
  以及 `--require` 注入**不存在**（正式件是把代码编译进主进程，不靠注入）。
- **优雅退出盖章未跑读数**：`will-quit` 写 `listening:false` ＋ `exitedAt` 只在码上；本棒的 `dead` 读数是
  **强杀**路径（`taskkill /F` ⇒ `will-quit` 不跑 ⇒ 记录是残留）。客户端靠 **pid 判活**兜住两条路。
- **跨机/局域网绑定**：见 §七。
- **多窗口路由**：见 §六 `AI#41`。
- **原生 MCP 客户端对接**（真 Claude/VS Code 里挂上本 server）：未验，只用 stdio 报文直连验过协议三件
  （`initialize` / `tools/list` / `tools/call`）。
- **缺口①（命令静默成功）**：只记了现象与后果，**没修**（产品面行为，要走设计门）。

## 九、记忆与正典指针

- 正典：`docs/04-软件更新/已落地/AI友好化-全自动操作/03-任务档案/M4-通道.md`（本格 `AI#31`）＋ `01-设计.md §9.3`
- 复用件：`scripts/dev/`（D0 驱动：`lib/cdp.mjs` 的 CDP 读面就是本棒的「证人②」）
- 记忆：`exclusive-resource-handover-and-probe-strength`（M5：独占资源交接 ＋ 探针强度 ⇒ 本棒的「认人」与「启动门」直接来自它）
- 读数原件：[`READINGS.txt`](./READINGS.txt)
