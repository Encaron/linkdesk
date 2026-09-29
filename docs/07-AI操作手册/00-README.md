# AI 操作手册（LinkDesk）

> **一句话**：让**不读源码的 AI** 知道「LinkDesk 能操作什么、怎么操作、什么够不着」。
>
> **读者**：① 在用户机器上干活、**手里没有源码也没有 npm 包**的 AI（本手册随安装包发货，是它唯一的读物）
> ② 插件作者（怎么让自己的插件「生来可被 AI 操作」）③ 维护者（改完代码要知道哪些文档要同笔改）。
>
> **本手册自己也在判据里**：判据③「可查」＝ 操作知识有单一真相源文档，任意 AI 不读源码即可上手——这份就是那个落点。

## 一、达标定义（三条判据，缺一不算）

| 判据 | 含义 | 在本手册的落点 |
|:--|:--|:--|
| **可读** | 界面每一处状态（布局／标签页／通知／对话框／面板）都有**契约级读取路径**，不靠读 DOM 猜 | [01-操作路径总览](01-操作路径总览.md) §三「读状态」 |
| **可操作** | 每个用户可做的动作，**至少一条非鼠标路径**（命令／API／CLI）——手势可以是手感，但不得是唯一路径 | [02-命令与API索引](02-命令与API索引.md) ＋ [03-按任务操作](03-按任务操作.md) |
| **可查** | 操作知识有单一真相源文档 | 本手册（＋[04-手势隐藏规则](04-手势隐藏规则.md)／[05-够不着清单与安装版路径](05-够不着清单与安装版路径.md)） |

**操作质量判据（用户口径）**：达标 = **结构化操作**（读结构化状态 → 调命令/API 带参数 → 读结构化结果），
**不是**「截图 → 视觉理解 → 猜坐标点击 → 再看截图」。后者是软件没给 AI 门时的**兜底流派**（慢、脆、不精确、不可验证）。
本手册全部内容都朝「**给正门**」方向：AI 不需要看屏幕，它需要的是**数据与命令**——甚至能做到人做不到的（批量、精确值、可重复、可脚本）。

**边界（⛔ 不承诺的事，防预期落空）**：

1. **OS 层动作够不着**——移动/贴边窗口本身、把文件从资源管理器拖进窗口、让用户去点系统文件对话框等。
   如实列册于 [05-够不着清单与安装版路径](05-够不着清单与安装版路径.md)，**不算达标范围**。
2. **AI 是操作员，不是值守员**——AI 只在被调用时做事。「到时间自动执行」这类**持续逻辑归软件/插件**；
   AI 可以把它**配置**好，但守着时间执行的不是 AI。
3. **插件业务动作的覆盖度取决于插件作者**——框架不知道插件是干什么的（核心无知原则）。插件把动作
   **注册为命令** ⇒ 自动进入 AI 操作清单；没注册 ⇒ AI 做不到（**不**用模拟点击兜底）。

## 二、目录

| 章 | 内容 | 什么时候读 |
|:--|:--|:--|
| **00** | 本章——判据、目录、任务导航、软件自述 | 先读这一页 |
| [01-操作路径总览](01-操作路径总览.md) | 三层门（命令／API／CLI+MCP）· 读状态→调命令→读结果 · 谁在哪（池／壳） | 第一次上手，或想知道「有没有 API 能做 X」 |
| [02-命令与API索引](02-命令与API索引.md) | **全索引（机器生成）**：84 条宿主命令 + 46 个命名空间 / 252 个方法 | 找具体命令 id / 方法名 / 参数 |
| [03-按任务操作](03-按任务操作.md) | 配方：标签页 · 分屏与嵌套 · 通知 · 面板与侧栏 · 设置与主题 · 串口 · 布局问答 | 「我要做某件事」时 |
| [04-手势隐藏规则](04-手势隐藏规则.md) | 屏幕上那些动作的**隐藏门控**（拖拽相位等）＋ 为什么别走手势 | 你的操作「调了没反应」时 |
| [05-够不着清单与安装版路径](05-够不着清单与安装版路径.md) | A 类够不着 · 安装版启动／静默装／userData 文件面／更新后重连 | 在**安装版**上干活时 |
| [06-CDP坑表](06-CDP坑表.md) | 开发期实机操作（CDP）的坑与正解 + 本仓 driver 库 | 要用 CDP 驱动界面时 |
| [07-如何接入](07-如何接入.md) | **怎么把 AI 接上**：门锁与钥匙（开关/token）· 三路手把手（CLI／MCP／丢手册）· 软件自述三件 · ✅ **已发货**（CLI `linkdeskctl` ＋ MCP；设置页「AI 接入」一键开） | 要接 AI 时（用户读前三节；AI 读自举） |

## 三、任务导航

### 3.1 十二个用户实例（验收清单——每例都应能在本手册查到「怎么做」）

| # | 用户原话（意） | 怎么做 | 状态 |
|:--:|:--|:--|:--:|
| 1 | AI 造一个全新**主题插件** | 作者文档《插件制造·主题制作》（本手册不含作者面） | ✅ 现成 |
| 2 | AI 把它**发布上网** | 发布流程（作者面文档） | ✅ 现成 |
| 3 | 添加第三方作者的**市场源** | 功能在，但**命令面缺** ⇒ 今天只能界面点 | ⛔ 只能界面点 |
| 4 | 左侧面板移到**右侧** | `workbench.action.toggleSidebarPosition` | ✅ 现成 |
| 5 | 底部面板**隐藏某个插件** | `workbench.action.togglePanelViewVisibility`（实参**平铺两个**：`containerId` → `viewId`，⛔ 不是一个对象——handler 按位置取；见 03 章例 5） | ✅ 现成 |
| 6 | 同时**打开五个插件的标签页** | `linkdesk.tabs.create(pluginId)` / `openOrFocus(pluginId)` 循环 | ✅ 现成 |
| 7 | 在某个插件标签页里**做某件事** | = 该插件注册的命令（`linkdesk.commands.getCommands()` 里查） | ⚠️ 看插件 |
| 8 | **两个 JSON 文件对比** | 两条命令：`file-tree.selectForCompare` → `file-tree.compareWithSelected`（参数 `{uri:"路径"}`；两步手势 = 两行调用）。⚠️ 需先 `open-tab file-tree`（视图挂载后这批命令才注册） | ✅ 现成（需装 file-tree 插件） |
| 9 | 串口侧栏「**打开消息回显**」 | 插件注册的 toggle 型命令（标题随状态动态变） | ✅ 现成 |
| 10 | 给 MCU **发东西 + AI 自己转编码** | 命令：`serial-monitor.send(sendMode, data, portName?, encoding?)`、`serial-monitor.setSendCoding`；API：`linkdesk.serial.sendText(text, enc, portName)`、`linkdesk.encoding.detect/decode/encode` | ✅ 现成（需装 serial-monitor 插件） |
| 11 | **嵌套分屏**（左→右上下→右下再左右） | `linkdesk.pool.tabAction({action:"splitTab", direction, targetGroupId})` 逐层分裂；比例用 `{action:"updateSplitSizes", anchorGroupId, sizes:[a,b]}` | ✅ 现成 |
| 12 | **空间定位问答**（「串口监视器在最右下角那一块」） | `linkdesk.tabs.list()`（全窗标签清单）／`linkdesk.pool.getLayout()`（本窗布局树） | ✅ 现成 |

出处：`docs/04-软件更新/待抉择池/AI友好化-全自动操作/01-设计.md` §十（用户逐例提问的逐条对账）。

### 3.2 日常动作速查

| 我要… | 走哪条路 |
|:--|:--|
| 执行任意命令 | `await linkdesk.commands.executeCommand("<id>", undefined, ...参数)`（🔴 开头的 `undefined` 不能省，见 [02 章 §一](02-命令与API索引.md)） |
| 知道**有哪些**命令（含插件命令） | `await linkdesk.commands.getCommands()` |
| 开／聚焦／关标签页 | `linkdesk.tabs.create(pluginId)` / `openOrFocus` / `close(tabId)` / `focus(tabId)` |
| 看**现在开着什么** | `linkdesk.tabs.list()`（全窗，含每组活跃位）· `linkdesk.pool.getLayout()`（本窗树） |
| 读**通知**（含「为什么弹」「按了会跑哪条命令」） | `linkdesk.notifications.list()`（`wake` / `ttl` / `actions[].command+args`） |
| 点通知上的**按钮** | 读 `actions[i].command` + `args`，照它 `executeCommand`——与手点同一条路径 |
| 分屏／并屏／移标签／改分屏比例 | `linkdesk.pool.tabAction({action: "splitTab" \| "moveTab" \| "updateSplitSizes" \| …})` |
| 底部面板／视图显隐、侧栏 | 命令 `workbench.action.togglePanel*` / `toggleSidebar*` / `toggleViewVisibility` |
| 悬浮面板打开某视图 | 命令 `workbench.action.revealFloatingPanel`（`viewId`, `pluginId?`） |
| 改设置项 | `linkdesk.configuration.get/set`（或直接改 `userData/settings.json`，见 [05 章](05-够不着清单与安装版路径.md)） |
| 切主题／切语言 | 命令 `theme.pick` / `workbench.action.selectLanguage`；或 `linkdesk.theme.apply/getAvailable` |
| 开某个文件（已知路径） | `linkdesk.tabs.create("editor", { filePath })`（对照 `CreateTabOptions`） |
| 读／写文件（受控路径） | `linkdesk.filesystem.*`（`readTextFile` / `writeTextFile` / `listDir` / `watch` …） |
| 打开**本手册**（软件内，不依赖源码） | 命令 `app.openAiManual`（菜单：帮助 → AI 操作手册） |

## 四、软件自述（AI 自己问路的三件）

不查手册、直接问软件（**运行时真源**，永远比手册新）：

1. `await linkdesk.commands.getCommands()` —— 全量命令（含每条 `description` + `params`）。
2. `await linkdesk.pool.getLayout()` / `linkdesk.tabs.list()` / `linkdesk.notifications.list()` —— 当前状态。
3. **（软件外）** `linkdeskctl --help`（CLI 自省）与 MCP 的 `tools/list`（AI 客户端直接拿到工具清单）——怎么开关、怎么配、今天走哪条绕行路：[07-如何接入](07-如何接入.md)。

## 五、本手册的维护（改之前先读这段）

- **02 章的两段生成区是机器生成的**：`npm run manual:build` 刷新；`npm run check` 逐字节盯漂
  （门禁 = `src/core/commands/aiManualIndex.test.ts`）。⛔ 别手改生成区——改了会被判红。
- **手写章（00／01／03／04／05／06／07）改完必须跑 `npm run check`**：其中 `check-doc-links.mjs` 会校验
  本目录所有相对链接**真实存在**（链到还没建的章节会红）。
- **载体**：随安装包发货 ＋ 软件内可打开——**已接线**：安装版落 `resources/ai-manual/`（本目录 8 个 `.md` 原样副本），
  软件内入口 = 菜单 **帮助 → AI 操作手册**（命令 `app.openAiManual`，池侧壳视图 `ai-manual`）。
- 本节引用的路径、命令 id、API 名一律**以运行时真源为准**（02 章两张表就是它们的快照）。
