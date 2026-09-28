# M4 全链路验收器（`AI#44`）

**判据**（照抄设计，⛔ 别改写）：**任一通道可完整走通「开标签 → 执行命令 → 读通知 → 执行通知按钮」全链路**。
「任一通道」⇒ **CLI 与 MCP 各跑一遍**——两条皮**共用内核但皮不同**，皮的 bug 只会在自己那条上露。

`accept.mjs` 走的是**产品**（真 `cli/linkdeskctl` 子进程 ＋ 真 `cli/linkdeskctl mcp` 常驻 stdio 会话），
**不是** spike 那种注入式原型（原型在 [`../m4-spike/`](../m4-spike/README.md)，产品码零改动的旁路）。

---

## 一、前置：一只隔离实例（**🔴 别碰用户正在跑的那份**）

```bash
ISO="C:/Users/<你>/AppData/Local/Temp/ldk-ai44"
mkdir -p "$ISO"

# ① 门锁三开关（关着就连不进来——这正是 AI#39 的判据，测试得先开）
printf '{"ai.cli.enabled":true,"ai.mcp.enabled":true,"ai.auditLog.enabled":true}' > "$ISO/settings.json"

# ② 渲染层要 Vite dev server（隔离实例走 isDev 轨道）；插件家也指到隔离目录
LINKDESK_USER_PLUGINS_HOME="$ISO/plugins" npm run dev      # 另开一个终端，等它 listening

# ③ 起实例（= 等号形态是硬要求；空格形态 Electron 不认）
node_modules/electron/dist/electron.exe . --user-data-dir="$ISO" --remote-debugging-port=9444
```

跑的时候给验收器两个环境变量（README 与 `READINGS.txt` 里的读数都出自这套）：

```bash
export LINKDESK_USER_DATA="$ISO"          # 记录/账本/设置在哪（CLI 与 MCP 皮同用这一条发现通道）
export LINKDESK_CDP="http://127.0.0.1:9444"   # CDP 证人（第二个读面，绕开被验通道）
node scripts/dev/m4-fullchain/accept.mjs --channel cli     # 或 mcp / both
```

## 二、净态重启配方（**负控只在这一态下成立**）

`S1.1` 的负控要求「命令面里**还没有** `marketplace.retryInstall`」——即市场**模块尚未被导入**。
⚠️ 两处持久化都会把上次的标签复原回来（复原 ⇒ 视图挂载 ⇒ 命令挂牌），**只删盘上的那份不够**：

| 持久化 | 位置 |
|:--|:--|
| 池标签布局（**这条是主犯**） | 池页 `localStorage['layout:ws-1']`（`<ISO>/Local Storage/leveldb`） |
| 布局镜像 / 窗口状态 | `<ISO>/layout-ws-1.json`、`<ISO>/windows-state.json` |

⇒ 实测可行的做法：**停实例 → 清空 `<ISO>/`（只留 `plugins/`，然后把 `settings.json` 写回）→ 再起**。

```bash
taskkill //PID <记录里的 pid> //T //F
for f in "$ISO"/*; do b=$(basename "$f"); case "$b" in plugins|settings.json) ;; *) rm -rf "$f";; esac; done
```

非净态下**不给假绿**：`S1.1` 记「○ 跳过」，`S5.2`（负控留痕）随之失败——这是**如实**，不是回归。

## 三、验收器结构（读数 id ↔ 判据）

| 段 | 读数 | 判据里的哪一段 |
|:--|:--|:--|
| `S0.1/.2` | 记录 + **认人**（应答 pid == 记录 pid） | 前置（M5「谁在服务」教训复用） |
| `S0.3/.4` | **就绪门**：读面就绪 / 暖机命令通过（**时延如实记**） | 冷启动边界（见 §四） |
| `S1.1` | **负控**：命令面没有它 ⇒ `EUNKNOWN` | 白名单**运行期派生**（不是硬编码表） |
| `S1.2/.3/.4` | `open-tab` ⇒ `accepted` ⇒ `tabs` 回读 ⇒ **CDP 证人**（池标签条） | **开标签** |
| `S1.5` | 命令面 102 → 107（`marketplace.*` 新挂牌） | 「挂牌即进名单」 |
| `S2.1/.2` | 执行命令 ⇒ **确认门**（富卡，插件自绘按钮）⇒ 严格回执 | **执行命令** |
| `S2.3/.4` | 通知面板里那条**真带 `command`** 的失败通知 ⇒ CDP 证人 | **读通知** |
| `S3.1/.2` | 按钮事实随行（`command` + `args`）＋ 负控 `ENOTFOUND` | 读通知（`AI#2` 的 DTO 活着） |
| `S4.1–.4` | 按「重试」⇒ 第二道门 ⇒ **又跑出一条新通知**（双证人） | **执行通知按钮** |
| `S5.1/.2` | 账本：本轮 exec / notifyAction 成功条目 ＋ 被拒那条也在账上 | 账本（正门三件套） |
| `S6.*` | `AI#19` ①：装 → 打开 → 操作 → 挂牌 107 → 123 → **卸干净**（给下一腿留净态） | M5 挂账（**结论分别登记**） |
| `S7.*` | 负控 `ENOACTION`（真产品里 `onClick` 型按钮）＋ 复原 | ⛔ 不假装按得动 |

**通知是怎么造出来的**（本棒摸清的真产品路径，⛔ 不是为测试造的假货）：
市场安装失败 ⇒ `settleInstallFailure` ⇒ **常驻错误 toast**（`source:"marketplace"`）＋
`actions:[{id:"retry", label:"重试", command:"marketplace.retryInstall", args:[{pluginId, downloadUrl}]}]`。
造它只需一次**必然失败**的安装：`downloadUrl` 指 `http://127.0.0.1:9/...`（端口 9 = discard ⇒ 立刻
`ECONNREFUSED`，不依赖外网、不等超时）。

## 四、已知边界（**实测，不是猜的**——写在这里免得下一棒当回归**）

1. **冷启动窗口**：记录文件**先**写 `listening`，壳**后**才能应答读。Vite 模块图冷时（首次起实例）
   这一段可达 ~20–30s，期间 `describe` / `exec` 一律 `ESHELLTIMEOUT`「壳无应答（8000ms）」——
   而 CDP 看 UI 其实已经在动。⇒ 验收器用 `S0.3/S0.4` **就绪门**等它活（等待时长记成读数），
   ⛔ 不要在没有门的情况下判红。热启动时这一门是 0.0–0.2s。
2. **两个超时**：内核 `shellRequest` 默认 **8s**（`ESHELLTIMEOUT`）；池内命令执行 **10s**
   （`src/core/registry/commands/CommandRegistry.ts` 的 `POOL_EXEC_TIMEOUT_MS`）。
   ⇒ 「执行命令」那一步**门必须在 8s 内点上**（验收器是「发出去就轮询门」，实测 132–829ms 出现）；
   门晾着不点 ⇒ 先等来 `ESHELLTIMEOUT`，再等来池的「池内执行超时（10 秒）」通知。
3. **账目条目的粒度**：`exec` 记 `commandId`、`install` 记 `source`，**`notifyAction` 记 `null`**
   （`electron/services/aiBridge/index.ts` 的 `keyArg`）⇒ 账上看得见「按过一次按钮」，
   看不见按的是**哪条**通知的哪个按钮。本棒如实记为残余（不在本格判据内）。
4. **两条皮共用内核**：同一份操作表 / 同一份错误分类法（`cli/linkdeskctl/lib/bridge-client.mjs`）
   ⇒ 两腿读数的高度一致是**设计使然**，差异只该出现在「协议壳」那一层
   （如 MCP 的 `tools/call` 正文里带 `[EUNKNOWN]` 字样、CLI 走 `--json` 信封）。

## 五、读数原件

- **`READINGS.txt`** —— 两腿各一次**完整跑**的 stdout ＋ 真 MCP 客户端（Claude Code）对接读数
  ＋ 离线三段读数 ＋ **附段：`gate-accept.mjs` 的 AI#29 读数**。PID / 端口 / 临时路径每次不同。

## 五之二、同夹第二件验收器：`gate-accept.mjs`（`AI#29` 敏感动作的确认回路）

`accept.mjs` 的链是**业务链**，确认门只是顺带被点了一下；`gate-accept.mjs` 专打**门本身**——
判据「敏感动作有统一确认回路，且该回路**不是唯一鼠标路径**」：

```bash
# 同一只隔离实例上跑（前置与 accept.mjs 完全相同；两件互不替代，都跑）
LINKDESK_USER_DATA=<iso> LINKDESK_CDP=http://127.0.0.1:9444 node scripts/dev/m4-fullchain/gate-accept.mjs
… --json
```

读数五段：① 自述面（`describe.askFirst`，含**反面**「AI 没有应答面」）② 名单外不问 ③ 键盘两腿
（**Esc = 拒 ⇒ `EUSERDENIED`** ／ **Enter = 准 ⇒ ok**，优先 CDP 真按键，降级时如实标 `dom`）
④ 账本两读面（CLI `log` ＋ 盘上 `ai-bridge-log.jsonl`）⑤ 负控（不存在的命令不问）。

⚠️ **三条验收器自身的坑**（首跑实测，写在这里免得下一棒当回归）：

1. **门出现 ≠ 门接得住键盘**：`DialogHost` 收到 show 后 **50ms** 才聚焦面板，而 Enter 的监听挂在面板上
   ⇒ 门刚出现就打字，Enter 会打在 `BODY` 上（同期 Escape 照旧生效——它是 `window` 监听）。验收器等
   「焦点落到面板」再打字，并单列一条 `门接得住键盘` 读数。
2. **面板消失晚 1–2 帧** ⇒ `门已收` 是**轮询**读数（≤2.5s），⛔ 不是 0ms 快照。
3. **CDP 真按键的 target 看页面聚焦态**：窗未被 OS 聚焦时键事件落在 `BODY` ⇒ Enter 打不到面板、Escape 能到。
   真用户按键天然是聚焦窗，不受影响；验收器在这种情况下降级 DOM 合成 `KeyboardEvent`（仍不碰鼠标）。

## 六、真 MCP 客户端（本棒实测：Claude Code CLI `2.1.233`）

配置形态**照产品自己产出的那份**（`cli/linkdeskctl/lib/mcp-config.mjs`：`mcpServers.linkdesk` +
`command:"linkdeskctl"` + `args:["mcp"]`）；本机开发态把 `command` 换成 `node`、
`args` 指到仓内 `cli/linkdeskctl/linkdeskctl.mjs`，并用 `env.LINKDESK_USER_DATA` 指向隔离实例：

```bash
claude -p "调用 linkdesk_status 和 linkdesk_ping…" \
  --mcp-config "$ISO/claude-mcp.json" --strict-mcp-config \
  --allowedTools "mcp__linkdesk" --output-format stream-json --verbose
```

`--strict-mcp-config` = **⛔ 不碰用户自己的 MCP 配置**；`--allowedTools "mcp__linkdesk"` = 只放行这只 server。
