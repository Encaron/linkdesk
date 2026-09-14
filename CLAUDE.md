# LinkDesk

> **Tauri v2 + React 18 + TypeScript → 🔥 迁移到 Electron。通用容器。** 比 VS Code 更高级：VS Code 核心嵌了 Monaco 编辑器甩不掉，LinkDesk 核心是空壳。万物皆插件。
>
> **Tauri 时代 P1-P6 🎉。E3 🎉。E4 🎉（2026-08-03）。E5 🎉（2026-08-04）。** 壳通信骨架 + 三通信机制 + linkdesk.* 20 命名空间 API + ESLint 防线。Per-Tab WebView 已废弃（E5.5#9，O(N) 进程→E5.7 极简Pool O(1) 取代）。
> **当前进度：** 🚀 E6 插件生态与发布（E4✅→E5✅→E5.6 封存→E5.7 极简Pool✅→**E5.8 归一化基建收官**→**E6：L4/L5 封站（2026-09-14）→ L7 插件源码外移进行中（7.0 判据先立 ✅、7.1 出口打通 ✅——六只插件自足构建 + 身份显式化 + SDK `pack` 通道，**仓外构建 7/7 实证**；**7.2 逐个迁移 ✅——18 只发货插件源码外移各自独立仓（`Encaron/linkdesk-plugin-<id>`，保历史）并已推送、壳仓 `plugins/` 只剩两只夹具、12 类绑定逐条给结论（软件 0.1.61→0.1.62 PATCH）；7.3 上架两步 🟡——第一步全绿（**18/18 已 publish 到各自仓**：Release + asset + 仓根 `marketplace.json`，asset 下载字节 sha256 与本地逐字节相同）+ 官方目录工具 `sync-official-catalog.mjs` + **装机验收前阶逐只读数全绿** + **「卸载后从网络装回」与「独立更新」两条链路实测成立**；🔴 **唯一未闭 = 18 只收录进官方目录 `Encaron/linkdesk-marketplace`**——候选已备好（`scratch/official-catalog.next.json`），**写别人的仓 ⇒ 等用户点头**；下一个 = 7.4 出厂种子保鲜（不依赖官方目录，可并行开工）**；AI 接力 = 一个会话只做一个轮次）**→L6 安全加固与出厂判定在即）。进度唯一真相源：`docs/02-Electron架构/E6_插件生态与发布/E6-执行清单.md`。工作分支 = `e6`；主线 `electron`（e5.8 已并回追平）。E5.7/E5.8 执行清单已封存。
> **仓库结构（2026-09-04 第 0.15/0.16 轮完成）：** git 根 / npm 根 / VS Code 打开根已**合一于 `E:/linkdesk` 单根**（`src/` `electron/` `docs/` `package.json` 直接可见，无 `linkdesk/` 套娃）；`Serial_C_Language/` 已永久删除；历史经 filter-repo 抽子树（3119 commits，hash 全变、内容全保）；远端 `origin` 已 6 分支强推对齐（2026-09-04 用户拍板）。

## 架构——圆形大厅模型

> 🔥 **2026-07-25 Encaron 发现。** LinkDesk = Link（连接）+ Desk（桌子）。名字不是巧合。

```
                     ┌─────────────────────────────────┐
                     │       圆 形 大 厅 (src/core/)     │
                     │  核心 = 桌子集合                   │
                     │                                  │
   ┌─────────┐       │  ┌──────┐ ┌──────┐ ┌──────┐    │       ┌─────────┐
   │ 文件树   │       │  │命令本│ │装饰本│ │配置本│    │       │  Git    │
   │ 房间    │───────│→ │(Cmd) │ │(Deco)│ │(Cfg) │←───│───────│ 房间    │
   └─────────┘       │  └──────┘ └──────┘ └──────┘    │       └─────────┘
                     │                                  │
   ┌─────────┐       │  ┌──────┐ ┌──────┐ ┌──────┐    │       ┌─────────┐
   │ 编辑器   │       │  │快捷键│ │文件  │ │文件关│    │       │ 终端    │
   │ 房间    │───────│→ │本    │ │读写桌│ │联本  │←───│───────│ 房间    │
   └─────────┘       │  └──────┘ └──────┘ └──────┘    │       └─────────┘
                     │                                  │
                     │   核心不知道名片上写了什么          │
                     │   只提供桌子 + 电话本              │
                     └─────────────────────────────────┘

插件 = 周边小房间（同一 Pool 渲染进程内，preload 沙箱隔离）
交流 = 走大厅的桌子（Registry/Service）——插件互不知道对方存在
后门 = IPC 数据管道（高频推流：串口数据等）——紧耦合，知道对方是谁
```

**大厅通信（Registry/Command）**：松耦合——发布/订阅、发现服务、跨插件命令。不知道对方是谁。
**后门直连（IPC 数据管道）**：紧耦合——串口数据推流、高频实时通信。知道对方是谁。

**核心准入标准（三条同时满足才放 `src/core/`）：**
1. 多提供方——多个插件可能登记到这张桌子上
2. 多消费方——多个插件可能翻这张桌子
3. 桌子不知道内容——桌子本身不知道登记的信息是什么意思

三条有一条不满足 → 不放核心，放插件里。详见 memory `core-admission-criteria`。

标签页系统永不持有卡片注册表。卡片工作台是插件，不是架构第二层。

## 历史脉络（Tauri 时代 → E5.6 已封站）

> **来历一句话**：V2 留下「名字写死 = 功能写死」的血教训 → **V3** 定下「圆形大厅」模型（核心只是桌子集合）→ **Tauri 时代 P1-P6** 跑通全部基础设施（**终端插件是第一个验证载体，不是软件的定义**）→ **迁 Electron（E1）** → **E2** 底层加固 → **E3** 多 WebView 与壳收尾 → **E4** 做出文件树与 Monaco 编辑器两个插件 → **E5–E5.6** 核心归一化与壳重构。

> 🔴 **E5–E5.6 走的弯路（历史废案，只记结论）**：**多 WebView / Per-Tab WebView / 双 Pool —— 全部废弃**。Per-Tab 因 O(N) 个进程被否（E5.5#9）；**E5.7 用「极简 Pool」（O(1)）取代**，这才是今天的地基（memory `e5.7-extreme-simple-pool`）。E5.6 的「侧栏移入 Pool」只移了一半（#11），是日后 side panel 反复出问题的旧账。

> ✅ **这段时期做完、活到今天还在用的成果**（2026-09-13 已 grep 核实，不是印象）：**`linkdesk.*` 命名空间 API**（`electron/preload-pool/namespaces-*.ts`）· **ESLint 自定义防线**（`eslint.config.js` 的 `linkdesk/no-module-level-ipc-listener` 等，即硬约束 13/14 的机械兜底）。

> ⚠️ **旧账已清，别再当待办**：卸载相关的六项结构性改进（invoke 统一带日志 / 卸载单入口 `performUninstall()` / Rust error→前端 toast / invoke 顺序 Rust 先于前端 / ContextMenu 冒泡 / `window.confirm`→`showConfirm`）**2026-07-24 起陆续做完**。完整史见 memory `bug-atlas` §A1 §A3。

> 📚 **要查细节去这些地方**：Tauri 时代存档 `docs/01-Tauri_P1至P5.5/`（P1-P6 六期；三批 bug 修复的逐笔记录在 [P6-Bug修复完整记录.md](docs/01-Tauri_P1至P5.5/P6-交互对标/P6-Bug修复完整记录.md)）· Electron 各期存档 `docs/02-Electron架构/`（E3 / E3.5 / E3.6 / E5.5 / E5.6 / E5.7 / E5.8）· 完整脉络 memory `evolution-chronicle`。

## Phase 路线

> **Phase 5 = 最后一个改框架的 Phase。** 此后所有新功能——文件树、编辑器、卡片、逻辑分析仪、OLED——全写在 `plugins/` 里。`App.tsx` 和 `core/` 不再膨胀。

| Phase | 内容 | 改框架？ | 状态 |
|:--:|------|:--:|:--:|
| **P1-P6** | **Tauri 时代——全部基础设施 + 48/48 bug** | ✅ | ✅ |
| **E1** | **Electron 迁移——换地基（7 步，~1,190 行）** | ✅ | ✅ |
| **E2** | **底层加固 + 侧栏扩展位（36/40 任务，~1,310 行）** | ✅ | ✅ E2a+E2b+E2c ✅，E2d 4 任务取消 |
| **E3** | **多 WebView + 壳收尾（103 任务，~3,602 行）🏁 架构最后一站** | ❌ | 🎉 E3a-j 全部完成 |
| **E4** | **文件树 + Monaco 编辑器（67 任务，~2,500 行）🏁 最后 E 编号** | ❌ | 🎉 全部完成（2026-08-03） |
| **E5** | **核心归一化与壳重构——铁轨** | ❌ | 🎉 E5–E5.6 完成（已封站）· **E5.7 极简 Pool ✅** · **E5.8 归一化基建 ✅** |
| **E6** | **插件生态与发布（L4 端到端验证 + L5 文档与发布 ✅ 封站 2026-09-14；剩 L6 安全加固 #48-52 与出厂判定）** | ❌ | 🚀 收官中——真相源 `docs/02-Electron架构/E6_插件生态与发布/E6-执行清单.md` |
| 之后 | E6 完成即出厂 → 持续迭代：04-软件更新（软件本体）+ 05-插件更新（各插件独立版本）。**出厂插件源码在仓外（各自 GitHub 仓，一插件一仓），随包靠构建期拉取最新已发布版，不靠源码住在壳里** | ❌ | 📋 |

> Phase 5 拆分为 5a-5h 八批次——每批交一个可用软件。详情存档在 [docs/01-Tauri_P1至P5.5/](docs/01-Tauri_P1至P5.5/)。

## 提交前自检

**🔥 机械操作，不是建议。** 每步必须执行，少一步不提交。

1. `npm run check` 全绿——一条命令 = 双工程 tsc 零错误（壳 + electron/）+ ESLint `--max-warnings 0`（硬约束 13/14 全绿，零警告才过）+ vitest 全绿 + 间距网格 + pool-css。**无"基线接受"——红灯必须修到绿灯才提交。**
2. `git diff --stat` 确认无调试日志残留（`console.log` / `debugger` / 临时注释）
3. `git diff --staged | grep -E 'pluginId === "[a-z]|case "[a-z].*":|BOTTOM_ICONS|PLUGIN_ICON_PATH'` 返回空（无新增插件 ID 硬编码）
4. **🔥 Vite deps 缓存自动清——`postinstall` 脚本会在每次 `npm install` 后自动 `rmSync node_modules/.vite`。** 极端情况（postinstall 被跳过、缓存仍有问题）→ 手动 `rm -rf node_modules/.vite` 再重启。（memory `toolbox-sop` §6.2）

详见 memory `ai-pre-commit-checklist.md`——五条：完整性（改 N 个漏 M 个？）/ 归一化（同一个逻辑只一处写？）/ 边界（空/null/竞态测了吗？）/ 注册注销（mount-unmount-remount 对吗？）/ 提交前机械操作。

## 硬约束（绝对不能违反）

1. **所有颜色走 CSS 变量 `var(--xxx)`**，禁止硬编码 hex
2. **所有 UI 文字走 `t()`**，禁止硬编码中文（i18n key = 中文原文）
3. **标签页系统不持有卡片注册表**（Phase 3→4 硬边界——卡片工作台是插件，卡片状态归插件自持；原 CardRegistry 骨架已随 E5.7#45.7 整删，未来重建亦不得进标签页系统）
4. **workspace.json 禁止嵌套**，必须是一层平铺数组
5. **IPC 事件订阅必须用 generation counter 模式**（B11 教训，`useIpcEvent` 已内置）
6. **`setState` 函数式更新器内部不写副作用**（B25 教训）
7. **组件只实现 OnData(fields) + OnSend**，不改路由/壳/其他组件
8. **ProtocolParser 是独立可替换模块，RingBuffer 接口 `{ cardId, value }` 是硬边界**——开发阶段只用方括号协议，但任何代码不得写死"只有这一种协议"。Phase 4 协议插件系统通车时，只换解析器不改下游。
9. **核心无知原则**（memory `core-ignorance-principle.md`）：核心不知道软件是干什么的。只定义"怎么接"，不定义"接什么"。往核心加东西前先问：加了之后核心变得更"知道自己是干什么的"了吗？是 → 别加，做成插件
10. **禁止在 core/ 或 pluginLoader/ 中写死插件 ID。** 禁止 `if (pluginId === "terminal")` / `switch (pluginId) { case "terminal": ... }` / `PLUGIN_ICON_PATH["terminal"]` / `BOTTOM_ICONS = ["settings"]` 等任何形式的插件 ID 字面量硬编码。所有插件差异性行为走 plugin.json 声明（`viewRole` / `tabBehavior` / `iconLocation` / `keepSidebarOnFocus` 等字段）→ Registry 模式消费。**Phase 5g 把 `TabType` 从 8 个联合类型改成 `string` 就是为了消灭这个模式——不要再写回来。**
11. **插件身份唯一来源是 plugin.json 声明字段。** 禁止用文件位置、目录名、是否在 Vite glob 中、是否在源码树里来推断插件属性。**🔴 其中「插件身份 id」= 顶层 `pluginId` 字段（E6#98g 起进 schema 并要求显式声明）——发布后永不可变；`derivePluginId` 的目录名/zip 基名兜底只为兼容存量第三方插件，`validate` 会对缺声明打黄灯，官方插件 20 只已全部显式声明。** `core: true` 定义卸载按钮隐藏（纯 UI 防误删旗标——无行为特权，API/命令层可卸可禁，卸载走 removed 墓碑，见 E6#18），`tabBehavior` 定义标签页行为，`entry` 定义入口文件——所有属性都在 `PluginManifest` 类型和 JSON Schema 中有对应字段。代码注释中禁止发明 schema 里没有的分类名词（如"工厂插件""内置插件"）——用字段名：`core: true 的插件`、`glob 中的插件`。
12. **🔥 禁止硬编码路径——所有资产路径走 `getAssetPath()`（`src/core/utils/assetPath.ts`）。** 禁止手写 `/assets/...`、`/icons/...`、`/plugins/...` 等绝对路径字面量。打包后 Electron 走 `file://` 协议，绝对路径全部炸裂。dev 模式 `http://localhost:1420` 能工作只是巧合。插件作者的自定义图标也必须走这条路——`resolvePluginIcon` 已内置。
13. **🔥 async 初始化函数必须防 StrictMode 双重 effect 竞态。** `init*()` 有 `_initialized` guard 不够——第一次调用是 async，第二次可能在第一次完成前到达。第二次调必须返回第一次的进行中 Promise（`_loadingPromise`），不能直接 return undefined。详见 memory `invisible-bugs-lesson-59c.md` Bug 1。
14. **🔥 useEffect 有回调 prop（onChange/onHighlight/onSelect 等）做非 DOM 副作用时，必须加活跃守卫。** 组件 `return null` 不代表 effect 不跑——React effect 只看挂载不看 DOM。守卫模式：`if (!open) return;` / `if (!isActive) return;`，且 `open`/`isActive` 必须纳入依赖数组。**写完后 grep 同组件的其他 effect——所有 effect 应有同样的守卫，漏掉的就是 bug。** 详见 memory `invisible-bugs-lesson-59c.md` Bug 2。
15. **🔥🔥🔥 出了隐形 bug 不要猜——`git checkout` 逐 commit 二分定位。** 静态分析死胡同就立刻跳版本，`git checkout -f <commit>` 测完一个再跳。找到最后一个正常版本和第一个异常版本之间的 diff，bug 就在那个 commit 里。不要墨迹。
16. **🔥🔥🔥🔥 任何 CSS / 样式 / 配色 / 字体 / 间距 / 布局 / UI 外观改动前，必须先通过 `Skill` 工具调用合适的设计 skill 拿设计系统（默认 `ui-ux-pro-max`；风格方向可竞标引入 taste 系/impeccable，见 memory `design-skills-inventory`），禁止凭感觉手写。** 不调用 skill = 违反硬约束。调完后落地设计 token 到 CSS 变量，不要硬编码 hex/px。
17. **🔥 `useRef` 不得用于影响渲染输出的状态。** ref 更新不触发重渲染——React 输出和实际状态脱节。异步拿到数据 → ref 更新 → 组件不知道 → 下次任何事件触发重渲染时突然切到"新状态"→ UI 跳变/空白。渲染决策（显隐、内容切换、列表过滤）走 `useState`。ref 仅用于：DOM 引用、前值对比（不渲染）、generation counter。**教训：** #58e 用 ref 存 WebView ID → 切标签页时第二帧跳空 div → 全插件标签页空白。
18. **🔥 Electron 窗口顶部 30px 是 `-webkit-app-region: drag` 拖拽区。** `position: fixed` 叠加层（弹窗/下拉/tooltip）放在 `top: 0` 范围内→OS 截鼠标事件做窗口拖拽。`z-index` 无效——这是 OS 级别的。所有 fixed 叠加层必须 `top: 30px`（或更高）避开 TitleBar 拖拽区。**教训：** ☰ 子面板 `top: 0` →上半部分被 TitleBar drag region 截事件 → 子面板消失 (9e6f936→8ff7a68)。
19. **🔥 禁止模块级 `_initialized` guard + IPC 监听器注册。** 模块级函数 = 导入就执行 = 永不清理。壳 fallback 的 IPC 监听器在 WebView 就绪后成为僵尸回调（E3j #81 教训）。正确做法：一次性数据拉取（`_initOnce`）走模块级，IPC 监听器走 React `useEffect` + 引用计数（mount 注册 / unmount 清理）。ESLint `linkdesk/no-module-level-ipc-listener` 机械拦截。
20. **🔥 preload 脚本的 IPC 监听器必须在模块顶层注册（`ipcRenderer.on` 在 `contextBridge.exposeInMainWorld` 之前），用缓冲+回放模式。** React `useEffect` 内注册太晚——IPC 事件可能在 mount 前到达。模式：模块级常驻 `ipcRenderer.on(channel, handler)` → push 到 `_buffer` → `onReady(cb)` 调用时回放 `_buffer` + 设置 `_active=true` 停止缓冲。**教训：** E5#11l Bug 4——`notifyReady` 在 `onReady` useEffect 之前到达，事件静默丢失，多 WebView 间歇性失效。详见 memory `multi-webview-bug-atlas` §A Bug 4。
21. **🔥 测试 fixture 禁止真实插件名 + 真实 UI 文案（含英文，如 `"Settings"` 就是 settings 插件的英文标题）。** 测试桩数据（`viewId`/`pluginId`/`renderPath`/`title`/动作 `label`）一律用明显虚构值（`demo-plugin`/`demo-view`、`Demo View`/`Démo Vue`、`Alpha`/`Beta`/`Gamma`）——测试替身不指向真实插件，避免读者/AI 误以为存在运行时引用（硬约束 10 生产代码禁令向测试豁免区的延伸；2026-08-22 用户拍板）。**边界：** 断言被测代码产出的真实行为文案（如 i18n 输出"已隐藏"）不算违规；loader/FactorySlots 等验证真实接线而必须用真 id 的测试除外。不做 ESLint 机械规则——非时序 bug，且真 id 合法出现场景多，机械拦截必然误伤。
22. **🔥 软件侧用户可见变更提交前，必须调用 version-bump skill 判定变更类别（feat/fix/breaking）并报告版本号判定。** 改动 `src/` 或 `electron/` 代码的 commit，message 必须带类别前缀（`feat:`/`fix:`/`breaking:`，可含 E6#编号，如 `feat:E6#xxx …`）。**三层机械兜底（E6#57.15e 立，2026-09-13 用户拍板升级为硬拦）**：① `scripts/check-version-bump.mjs` 挂在 lefthook 的 **`commit-msg`** 钩子上——**不带前缀 ⇒ 提交被 git 拒绝**，覆盖所有提交者与所有提交方式（`-m` / `-F` / 编辑器 / heredoc；唯一豁免 = `Merge …` 合并提交，且不静默）；② `scripts/check-changelog-section.mjs` 在**每次 `npm run check`** 上验「`package.json` 的版本号在 `CHANGELOG.md` 里有非空段」——**bump 版本号必须同笔写 `## v<新版本>` 段**；③ 发布门禁脚本（E6#57.15d）在发版那一下再拦一次。**违反=红灯——禁止「代码更新上去了版本号没更」**（2026-08-31 用户拍板；判据见 [.claude/skills/version-bump/SKILL.md](.claude/skills/version-bump/SKILL.md)）。逃生口 `git commit --no-verify` 跳过全部 git 钩子（git 机制，如实记着）。

固定名称，不用"三栏中间那个"。详见 `docs/总体设计/V3-部件命名规范.md`

速查：图标栏（最左 42px）→ 侧栏 → 主区（标签页内容）。主区顶部是标签栏。最上面是顶栏。最下面是状态栏。

## 关键设计——不要改

- **keep-alive：所有面板绝对定位平级渲染，CSS display 切换**（不是 `{isActive && <View />}`——改成条件渲染会丢 CM6/Monaco 状态）
- **平铺方案（B22）：面板 key=groupId 永远不变**（不是递归 flex 嵌套——改回嵌套 → 分屏/合屏 unmount 面板）
- **独立 RingBuffer 多消费者**（不是 Pub/Sub——串口数据是流不是事件，每个消费者需要完整历史）
- **drop zone 照抄 VS Code**：SPLIT_THRESHOLD=0.25 + 左右优先（不自创算法）
- **递归分屏 SplitNode 树**：`leaf | branch(direction, [child, child], sizes)`，MAX_TREE_DEPTH=4

## Phase 4 架构决策（详见 memory `design-decisions.md`）

- **插件 = 独立构建产物。** Vite 将 `plugins/` 下每个插件独立打包为 `dist/plugins/<pluginId>.js`。`.tsx` 插件重启生效，`.json` 插件即时生效（对标 VS Code）
- **核心不认 pluginId。** 标签页行为（保底/单例/关闭确认）由 `plugin.json` 的 `tabBehavior` 声明，核心读 registry 不 switch on type
- **`useSendData` 在 Phase 4 提取到 core。** 发送管道（编码→invoke→回显→历史）独立于 TerminalView，Phase 5 卡片直接复用
- **欢迎页是壳的兜底，不是插件。** 对标浏览器新标签页，通过 `tabBehavior.isFallback` 声明
- **插件详情页只读 `plugin.json`。** 不引入 README 等第二种格式
- **命名不绑版本号。** 不用 "V3" 当品牌名，插件 ID 不带版本号前缀

## 反模式——不要做

- 不要自创算法，照抄 VS Code
- 不要改 flex 元素拖拽时的 width（用 opacity 留占位）
- 不要嵌套卡片（card in card）
- 不要手写 Tauri listen()——用 `useTauriEvent` hook
- 不要说"架构不支持"——检查六类插件接口。视图/卡片/协议/主题/语言/资源，新功能落在哪一类？每类都是窄接口，不碰架构
- **不要把壳级功能放在插件里。** 自检："卸载所有插件后，这个功能还能用吗？" 不能 → listener/渲染必须放在 App.tsx 或 core/，绝不在 plugins/ 里。B79 教训：CommandPalette 寄生在 terminal 插件 → 没终端时 Ctrl+Shift+P 无效。
- **不要说"这个功能插件做不了"——插件没有 API 白名单。** 插件代码和核心代码在同一个 WebView 里跑，React 组件就是 React 组件。`import Leaflet`、`import THREE.js`、`<iframe>`、`<video>`——核心代码能用的 JS 库和 Web API，插件全能用。视图插件的契约只有 `{ isActive: boolean }`，之外全是标准 React 自由发挥
- **不要把终端当成软件的定义。** 终端是第一个视图插件，串口是第一个数据源。LinkDesk 不是"串口调试器"——跟 VS Code 不是"代码编辑器"一样。核心只有标签页+分屏+数据管道+注册表——不知道终端是什么、不知道串口是什么

## 常发已知问题（老毛病——改到相关处先看这个）

> 完整表在 memory `ui-debug-checklist` / `bug-atlas`；这里只记**反复回来的**。

- **文件树 / 侧栏 sticky**：双层滚动架构（`.file-tree-scroll` + `.side-panel-content`）与 CSS `position: sticky` **不兼容**——sticky 的祖先链上都不是真正的滚动容器。E4V#57 曾因此放弃重做，动它之前先读 memory `evolution-chronicle` 的「`e4-sticky` 重做前提」。
- **编辑器 / Monaco 颜色不跟、token 错乱**：两条已知根因——① **异步竞态**（`StandaloneWorkbenchThemeService` 抢在初始化前设主题，见 memory `bug-atlas` **B4**）；② **全局污染**（Pool 下 `window.monaco` 是共享单例，任何插件 `defineTheme`/`setTheme` 都会污染全局，见 memory `multi-webview-bug-atlas`）。**插件首选 CM6；必须用 Monaco 也绝不调 `defineTheme`/`setTheme`。**

## 开发命令

```bash
# 🔥 提交前必跑——一条命令 = 双工程 tsc + ESLint --max-warnings 0 + vitest + 网格/pool-css
npm run check

npm run lint         # 单独跑 ESLint（含硬约束 13/14 自定义规则）
npm run dev          # 纯前端预览（Vite）
npm run electron:dev # 完整 Electron 桌面应用（E1 步 1 后可用）
npm run tauri dev    # Tauri 桌面应用（phase6 分支退路）
npx tsc --noEmit     # TypeScript 检查
npx vitest run       # 单元测试（会涨：2026-09 时 168 文件 / 2,342 例）
```

## 关键文件

| 你要做什么 | 读这个 |
|------|------|
| 🔥 写 Electron 代码前 | **`docs/02-Electron架构/00-元文档/00-旧Bug预警与新生风险.md`** — 48 个旧 bug 哪些会回来、哪些新 bug 会出现 |
| 🔥🔥🔥 迁移执行——每步检查项 | **`docs/02-Electron架构/00-元文档/00-迁移执行守则.md`** — 10 个 bug 模式 + 6 个新风险 → 每步/每任务的具体检查项清单 |
| 🔥 E1 执行前必读 | **`docs/02-Electron架构/E1_Electron迁移_暂定/10-迁移方案缺口补丁.md`** — 7 个缺口（Vite/main.ts/测试/dev workflow/entry/RingBuffer/G14/preload防御/plugin-handlers完整性） |
| 🔥 全方案审计 | **`docs/02-Electron架构/00-元文档/00-全方案步进审计.md`** — 29 份文档 + 18 个源文件逐步推演 + 两轮审计 20 项缺失已全部修复 |
| 🔥🔥🔥 加文件前——确认放哪个目录 | **`docs/开发管理/壳目录规范.md`** — core/pool/components/hooks 每个子目录语义和准入标准。E5#42→#36k 的教训——先查此表再加文件 |
| 理解架构 | `docs/开发管理/当前状态.md` |
| 🔥🔥 改壳边界 | **`docs/02-Electron架构/通道范式·设备插件独立.md`** — 改壳=加通用通道≠加设备业务（E5.8 Phase 6.5 用户拍板）。写壳代码/提议改壳前必读 |
| Phase 4 设计 | `docs/phase4_插件系统/` |
| Phase 3.5 任务 | `docs/phase3_标签页分屏/V3-Phase3.5-品质打磨.md` |
| 标签页/分屏设计 | `docs/phase3_标签页分屏/V3-Phase3-标签页分屏设计.md` |
| 部件名称 | `docs/总体设计/V3-部件命名规范.md` |
| 写插件 | **`docs/03-插件制造/`**——00-README 概览 / 01-API契约 / 02-生命周期 / 03-contributes / 04-分发 / 05-UI写法规约 / 06-plugin.json规范 / plugin.schema.json |
| 🔥 插件源码外移与上架（L7） | **`docs/02-Electron架构/E6_插件生态与发布/插件源码外移层/00-整理档案.md`**——源码真相源在插件仓、壳仓只留产物；九轮任务 + 交接.md（AI 一会话一轮接力） |
| 已确认决策 | memory `design-decisions.md` |
| 已知坑 | memory `bug-atlas` |
| 主题系统 | memory `theme-system.md` |
| 新 AI 进场（ZCode / Codex） | 根目录 **`AGENTS.md`**——指针文件，指到本文件与记忆索引；**记忆库重组时同笔更新它** |
