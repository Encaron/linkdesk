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

⇒ 实测可行的做法：**停实例 → 清空 `<ISO>/`（把 `settings.json` 写回）→ 再起**。
🔴 **`plugins/` 要不要一起清，看跑哪件**（2026-09-29 会话 13 实测）：

- 跑 **`accept.mjs`**（含 `S6` 装/卸整链）⇒ **`plugins/` 必须一起清**——留着它，`serial-monitor` 的目录还在，`S6.1` 会当场报「已存在安装目录」= **幻影失败**（首跑 41/42 就是这个）。
- 跑 **`gate-accept.mjs` / `examples.mjs`**（不装插件）⇒ `plugins/` 留不留都行。

```bash
# 净态（连插件家一起清；settings.json 随后写回）
for f in "$ISO"/*; do b=$(basename "$f"); case "$b" in settings.json) ;; *) rm -rf "$f";; esac; done
```

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
- **`READINGS-AI45.txt`**（会话 13）—— §七 验收 1–7 全量真跑读数（CLI 39/39 · MCP 41/41 · 门 24/24 ×2 · **首跑 41/42 的实例残留说明**）。
- **`examples.mjs` ＋ `READINGS-AI46-examples.txt`**（会话 13）—— §十 12 例 ＋ §八 三场景的**可重跑**验收器与定稿读数（34 条：✔ 28 · ✗ 0 · ○ 6）。用法：同一条 `LINKDESK_USER_DATA` / `LINKDESK_CDP` 环境下 `node scripts/dev/m4-fullchain/examples.mjs`。

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

## 六、会话 13（`AI#45`–`AI#47`）新增坑与口径（**实测，不是猜的**）

1. **隔离实例要显式钉界面语言**：`settings.json` 里写 `"app.language":"zh"`。验收器有按**中文文案**匹配的判据
   （确认门文案统一、提示条等），不钉语言会因语言兜底而匹配不上（表现像「门没弹」）。
2. **Vite deps 缓存过期会打断插件模块加载**：隔离实例走 dev 轨道，`node_modules/.vite` 陈旧时插件视图模块加载失败
   （白屏／`describe` 迟迟不就绪）。修法 = 删 `node_modules/.vite` 再起 dev（仓内 `postinstall` 平时会自动清；
   手工起 dev 的场合要自己管）。
3. **hover-only 面的口径（重要）**：`CSS.forcePseudoState` 在**深层既有节点**上实测只改 `matches()`、**不改计算样式**
   ⇒ 靠它验 hover 面会得到**假绿**。可信做法 = `scripts/dev/driver.mjs --mode mouse`（**元素锚定**：先取元素
   再落到它的中心，⛔ 不推算坐标、不看窗口位置）；用了指针的读数**如实标注**，别写成「非坐标」。（细节见
   [01-设计.md §三](../../../docs/04-软件更新/已落地/AI友好化-全自动操作/01-设计.md) 与收口报告 §五。）
4. **宿主命令读「位置实参」**：`params[].name` 是**具名**声明，但 handler 取的是 `args[0]/args[1]`
   ⇒ 照具名对象调用（`{containerId, viewId}`）会**静默无效**（`ok:true` 却没做事）。验收器一律按**平铺实参**调。
   （⇒ 生长格 `AI#52`：执行面要不要兼容具名对象。）
5. **命令注册时机 = 视图挂载时**：`file-tree.*` 这类命令**没挂载视图就不在命令面**，照 id 直接调会 `EUNKNOWN`
   ⇒ 验收脚本要先 `open-tab` 再调（⇒ 生长格 `AI#54`）。同样：`commands.getCommands()` 是**异步**的，读面必须 await 后再断言。

---

## 七、真 MCP 客户端（本棒实测：Claude Code CLI `2.1.233`）

配置形态**照产品自己产出的那份**（`cli/linkdeskctl/lib/mcp-config.mjs`：`mcpServers.linkdesk` +
`command:"linkdeskctl"` + `args:["mcp"]`）；本机开发态把 `command` 换成 `node`、
`args` 指到仓内 `cli/linkdeskctl/linkdeskctl.mjs`，并用 `env.LINKDESK_USER_DATA` 指向隔离实例：

```bash
claude -p "调用 linkdesk_status 和 linkdesk_ping…" \
  --mcp-config "$ISO/claude-mcp.json" --strict-mcp-config \
  --allowedTools "mcp__linkdesk" --output-format stream-json --verbose
```

`--strict-mcp-config` = **⛔ 不碰用户自己的 MCP 配置**；`--allowedTools "mcp__linkdesk"` = 只放行这只 server。
