# LinkDesk

> **Tauri v2 + React 18 + TypeScript → 🔥 迁移到 Electron。通用容器。** 比 VS Code 更高级：VS Code 核心嵌了 Monaco 编辑器甩不掉，LinkDesk 核心是空壳。万物皆插件。
>
> **Tauri 时代 P1-P6 🎉。E3 🎉。E4 🎉（2026-08-03）。E5 🎉（2026-08-04）。** 壳通信骨架 + 三通信机制 + linkdesk.* 20 命名空间 API + ESLint 防线。Per-Tab WebView 已废弃（E5.5#9，O(N) 进程→E5.7 极简Pool O(1) 取代）。
> **当前进度：** 🚀 E6 插件生态与发布（E4✅→E5✅→E5.6 封存→E5.7 极简Pool✅→**E5.8 归一化基建收官**→E6 开战）。进度唯一真相源：`docs/02-Electron架构/E6_插件生态与发布/E6-执行清单.md`。工作分支 = `e6`；主线 `electron`（e5.8 已并回追平）。E5.7/E5.8 执行清单已封存。
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

## 当前阶段——E4 收尾 → E5 铁轨

> **E4 文件树+Monaco 编辑器完工在即。E5 执行清单已就绪——4 层 15 轮 28 任务，~1,120 行。**
> **E5 是第一优先：先铺铁轨再跑 04/05 的火车。** 壳内低耦合+布局引擎做完后，FloatingPanel/终端系统/可拖出标签页每个从 4+ 文件改为 1 文件+1 行配置。
> **E5 执行清单：** `docs/02-Electron架构/E5_核心归一化与壳重构_待执行/05-执行清单.md`
>
> ---
>
> ## E3 历史记录（已封站）

> Phase 1-5 任务是建基础设施。终端插件作为第一个视图插件验证了全部基础设施——标签页分屏、命令系统、配置注册表、插件生命周期、数据管道。**以下终端相关条目是基础设施的验证载体，不是软件的定义。**

Phase 1-5h ✅ 完成
**Phase 5.5a ✅ — viewRole 声明系统（4 文件，−13/+11 行）**
**Phase 5.5b ✅ — `<SidebarSection>` 通用可折叠组件（2 文件，+191 行）**
**Phase 5.5c C1 ✅ — `useTerminalSessions` 会话数据层（1 文件，+244 行）**
**Phase 5.5c C2+C3 ✅ — 侧栏重写 + ControlPanel（4 文件，+857/−85 行），已验证通过**
**Phase 5.5c C4a ✅ — 终端数据源切换 ConfigurationService → useTerminalSessions（1 文件，+42/−74 行）**
**Phase 5.5c C4b ✅ — 修 3 个数据管道 Bug + 2 个连带修复（5 文件，+82/−5 行）**
  附带修复：Babel JSX 箭头歧义（`sessions.map` 提取变量）、CM6 初始化时序（占位改 CSS 显隐）
**Phase 5.5c C5 ✅ — plugin.json cleanup（删 contributes.configuration 71 行 / viewRole → sidebarPrimary / git rm toolbar.*，−220 行）**
**Phase 5.5c 🎉 完成。5.5 全部完成。**

**Bug 修复 session（2026-07-22）：**
- `304b6b1` 侧栏不同步标签页——TabActionsContext 加 focusTab+closeTab
- `1c80cd3` CM6 右键复制/全选失效——view.focus()
- `df260e1` F5 串口状态不同步——Rust get_serial_status
- `f476c21` Toggle 命令标签不随状态变——registerCommand 更新 title
- 📋 **12 个活跃 bug + 新 AI 执行路线图** → `docs/phase5.5_交互对标/V3-Phase5.5-Bug清单-2026-07-22.md`

**Bug 修复 session（2026-07-23，步 14）：**
- 归一化 `invokeBeforeCloseTab()` — Ctrl+W/[×]/中键三条关闭路径统一（viewRegistry.ts, TabBar.tsx, App.tsx）
- `loadPluginRuntime` 硬编码 `plugin://${id}/dist/index.js` → 改用 Vite `/@fs/` 端点 + Rust `resolve_plugin_path`
- `uninstallPlugin` 归一化：卸载=移文件+清禁用列表；`core:true` 插件不可卸载
- `reinstallPlugin` 同 session 热装 + 退出重进 /@fs/ 即时加载（零重启）
- `plugin.schema.json` `core` 字段语义补全 + `tabBehavior.invokeBeforeClose` 补录
- 注释清理 `loader.ts`：消灭"工厂插件""运行时插件"→ 用声明字段描述

详见 `docs/phase5_应用基础设施/V3-Phase5-设计.md`（命令系统 + 配置注册表 + 菜单系统 + 协议注册表 + context key + 快捷键 + scope）
详见 `docs/phase5.5_交互对标/V3-Phase5.5-设计.md`（三栏交互对标 VS Code）
详见 `docs/phase5_应用基础设施/V3-Phase5-最终验收报告.md`（Phase 5 验收——4 Blocking + 9 Quick Wins 已全部修完）
	- **S5** 归一化按钮：PluginDetailView 与侧栏用同一套判断逻辑（元数据缓存 status > 禁用列表）
	- **B86** 首次打开串口失败：`handleToggleOpen` 用 ref 替代闭包 state——ControlPanel 同事件循环内 setState + invoke 导致 portName 仍为空串
	- **B3** F5 刷新 session 自动恢复：useSession 首次 mount 自动创建 + localStorage 持久化 session 名 + 重命名 ✓/✕ 按钮 + 侧栏不随标签页切换跳转

**Bug 修复 session（2026-07-24，第二批 G 类 + 卸载根因）：**
- `cab2d4e` G7 Monaco Enter 闭包过期 → ref 桥接
- `683dd8b` G22 `parseInt("0") || 1000` → `isNaN(v) ? 1000 : v`
- `9727f9c` G1 合屏丢标签页 → reduceUnsplit 迁移 tabs 到存活面板
- `6ecc456` G3 F5 后计数器归零 ID 碰撞 → syncCountersAfterRestore
- `cf15db1` G10 3+ 面板拖拽目标随机 → findOtherContainer 返回 groupId
- `4299f51` 卸载弹窗 `window.confirm` → `showConfirm`（Tauri 兼容）
- `e5a5701` uninstallPlugin 重排序——Rust invoke 移到前端变更之前
- `b574d8f` ContextMenu 加 stopPropagation + marketplace 卸载命令加错误日志
- 🔥 **`aec1564` 卸载根因——Rust `fs::rename` → `copy_dir` + `fs::remove_dir_all`**（Windows Vite 文件锁致 rename 跨目录失败）
- 🔥 结构性改进待做：invoke 统一日志 / 卸载单入口 / Rust error→前端 toast。详见 memory `uninstall-bug-recurring`

**Bug 修复 session（2026-07-24，第三批代码质量）：**
- `239b734` A组——G18 CoreEvents `_Phase5EventCount` hack → TODO; G19 formatTimestamp 提取到 useSendData 导出; G20 StorageService 反斜杠跨平台修复
- `7c3b452` B组——F2 plugin.json 6 字段审计（viewRole 🔴 零消费）; F3 C4a 残留 grep 确认干净; G15 撤销 toast .catch
- `af2c638` C组——G4 listen 泄漏 → useTauriEvent; G5 render 改 ref → useEffect; G6 toLayoutData setState hack → ref; G12 duplicateTab 跨组 ID 检查
- G14 → **E2c #19a**（PluginDetailView 幽灵页——订阅 onDidUnregister）；G17 代码已不存在（之前已删）

**E1 迁移 Bug（2026-07-25）：**
- `e9bff65` 串口接收不到数据——serial-service 漏掉 Rust read_loop 100ms 超时冲刷（缝 bug）。设备不发 `\n` 时数据滞留缓冲区。修复：加 `flushTimer`。
> 详见 memory `e1-flush-timeout-bug.md`

分支：`phase5.5` → 将重命名为 `phase6`（Tauri 冻结），新分支 `electron` 开始迁移。Git 锚点 `52730fc`。

## Phase 路线

> **Phase 5 = 最后一个改框架的 Phase。** 此后所有新功能——文件树、编辑器、卡片、逻辑分析仪、OLED——全写在 `plugins/` 里。`App.tsx` 和 `core/` 不再膨胀。

| Phase | 内容 | 改框架？ | 状态 |
|:--:|------|:--:|:--:|
| **P1-P6** | **Tauri 时代——全部基础设施 + 48/48 bug** | ✅ | ✅ |
| **E1** | **Electron 迁移——换地基（7 步，~1,190 行）** | ✅ | ✅ |
| **E2** | **底层加固 + 侧栏扩展位（36/40 任务，~1,310 行）** | ✅ | ✅ E2a+E2b+E2c ✅，E2d 4 任务取消 |
| **E3** | **多 WebView + 壳收尾（103 任务，~3,602 行）🏁 架构最后一站** | ❌ | 🎉 E3a-j 全部完成 |
| **E4** | **文件树 + Monaco 编辑器（67 任务，~2,500 行）🏁 最后 E 编号** | ❌ | 🎉 全部完成（2026-08-03） |
| **E5** | **核心归一化与壳重构（79 任务，~2,070 行）——铁轨** | ❌ | 🔥 L1 壳通信骨架 ✅（E5#1-#8）→ L2-L4 待执行 |
| 之后 | 04-出厂制造（FloatingPanel/终端/悬浮窗）→ 05-版本更新（v1.1-v1.6）→ 卡片工作台 | ❌ | 📋 |

> Phase 5 拆分为 5a-5h 八批次——每批交一个可用软件。拆分细节见 `docs/phase5_应用基础设施/V3-Phase5-设计.md` §九。

## 提交前自检

**🔥 机械操作，不是建议。** 每步必须执行，少一步不提交。

1. `npm run check` 全绿——一条命令 = 双工程 tsc 零错误（壳 + electron/）+ ESLint `--max-warnings 0`（硬约束 13/14 全绿，零警告才过）+ vitest 全绿 + 间距网格 + pool-css。**无"基线接受"——红灯必须修到绿灯才提交。**
2. `git diff --stat` 确认无调试日志残留（`console.log` / `debugger` / 临时注释）
3. `git diff --staged | grep -E 'pluginId === "[a-z]|case "[a-z].*":|BOTTOM_ICONS|PLUGIN_ICON_PATH'` 返回空（无新增插件 ID 硬编码）
4. **🔥 Vite deps 缓存自动清——`postinstall` 脚本会在每次 `npm install` 后自动 `rmSync node_modules/.vite`。** 极端情况（postinstall 被跳过、缓存仍有问题）→ 手动 `rm -rf node_modules/.vite` 再重启。（memory `vite-cache-after-import-fix.md`）

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
11. **插件身份唯一来源是 plugin.json 声明字段。** 禁止用文件位置、目录名、是否在 Vite glob 中、是否在源码树里来推断插件属性。`core: true` 定义不可卸载，`tabBehavior` 定义标签页行为，`entry` 定义入口文件——所有属性都在 `PluginManifest` 类型和 JSON Schema 中有对应字段。代码注释中禁止发明 schema 里没有的分类名词（如"工厂插件""内置插件"）——用字段名：`core: true 的插件`、`glob 中的插件`。
12. **🔥 禁止硬编码路径——所有资产路径走 `getAssetPath()`（`src/core/utils/assetPath.ts`）。** 禁止手写 `/assets/...`、`/icons/...`、`/plugins/...` 等绝对路径字面量。打包后 Electron 走 `file://` 协议，绝对路径全部炸裂。dev 模式 `http://localhost:1420` 能工作只是巧合。插件作者的自定义图标也必须走这条路——`resolvePluginIcon` 已内置。
13. **🔥 async 初始化函数必须防 StrictMode 双重 effect 竞态。** `init*()` 有 `_initialized` guard 不够——第一次调用是 async，第二次可能在第一次完成前到达。第二次调必须返回第一次的进行中 Promise（`_loadingPromise`），不能直接 return undefined。详见 memory `invisible-bugs-lesson-59c.md` Bug 1。
14. **🔥 useEffect 有回调 prop（onChange/onHighlight/onSelect 等）做非 DOM 副作用时，必须加活跃守卫。** 组件 `return null` 不代表 effect 不跑——React effect 只看挂载不看 DOM。守卫模式：`if (!open) return;` / `if (!isActive) return;`，且 `open`/`isActive` 必须纳入依赖数组。**写完后 grep 同组件的其他 effect——所有 effect 应有同样的守卫，漏掉的就是 bug。** 详见 memory `invisible-bugs-lesson-59c.md` Bug 2。
15. **🔥🔥🔥 出了隐形 bug 不要猜——`git checkout` 逐 commit 二分定位。** 静态分析死胡同就立刻跳版本，`git checkout -f <commit>` 测完一个再跳。找到最后一个正常版本和第一个异常版本之间的 diff，bug 就在那个 commit 里。不要墨迹。
16. **🔥🔥🔥🔥 任何 CSS / 样式 / 配色 / 字体 / 间距 / 布局 / UI 外观改动前，必须先通过 `Skill` 工具调用合适的设计 skill 拿设计系统（默认 `ui-ux-pro-max`；风格方向可竞标引入 taste 系/impeccable，见 memory `design-skills-inventory`），禁止凭感觉手写。** 不调用 skill = 违反硬约束。调完后落地设计 token 到 CSS 变量，不要硬编码 hex/px。
17. **🔥 `useRef` 不得用于影响渲染输出的状态。** ref 更新不触发重渲染——React 输出和实际状态脱节。异步拿到数据 → ref 更新 → 组件不知道 → 下次任何事件触发重渲染时突然切到"新状态"→ UI 跳变/空白。渲染决策（显隐、内容切换、列表过滤）走 `useState`。ref 仅用于：DOM 引用、前值对比（不渲染）、generation counter。**教训：** #58e 用 ref 存 WebView ID → 切标签页时第二帧跳空 div → 全插件标签页空白。
18. **🔥 Electron 窗口顶部 30px 是 `-webkit-app-region: drag` 拖拽区。** `position: fixed` 叠加层（弹窗/下拉/tooltip）放在 `top: 0` 范围内→OS 截鼠标事件做窗口拖拽。`z-index` 无效——这是 OS 级别的。所有 fixed 叠加层必须 `top: 30px`（或更高）避开 TitleBar 拖拽区。**教训：** ☰ 子面板 `top: 0` →上半部分被 TitleBar drag region 截事件 → 子面板消失 (9e6f936→8ff7a68)。
19. **🔥 禁止模块级 `_initialized` guard + IPC 监听器注册。** 模块级函数 = 导入就执行 = 永不清理。壳 fallback 的 IPC 监听器在 WebView 就绪后成为僵尸回调（E3j #81 教训）。正确做法：一次性数据拉取（`_initOnce`）走模块级，IPC 监听器走 React `useEffect` + 引用计数（mount 注册 / unmount 清理）。ESLint `linkdesk/no-module-level-ipc-listener` 机械拦截。
20. **🔥 preload 脚本的 IPC 监听器必须在模块顶层注册（`ipcRenderer.on` 在 `contextBridge.exposeInMainWorld` 之前），用缓冲+回放模式。** React `useEffect` 内注册太晚——IPC 事件可能在 mount 前到达。模式：模块级常驻 `ipcRenderer.on(channel, handler)` → push 到 `_buffer` → `onReady(cb)` 调用时回放 `_buffer` + 设置 `_active=true` 停止缓冲。**教训：** E5#11l Bug 4——`notifyReady` 在 `onReady` useEffect 之前到达，事件静默丢失，多 WebView 间歇性失效。详见 memory [[e5-multi-webview-6-bugs]] Bug 4。
21. **🔥 测试 fixture 禁止真实插件名 + 真实 UI 文案（含英文，如 `"Settings"` 就是 settings 插件的英文标题）。** 测试桩数据（`viewId`/`pluginId`/`renderPath`/`title`/动作 `label`）一律用明显虚构值（`demo-plugin`/`demo-view`、`Demo View`/`Démo Vue`、`Alpha`/`Beta`/`Gamma`）——测试替身不指向真实插件，避免读者/AI 误以为存在运行时引用（硬约束 10 生产代码禁令向测试豁免区的延伸；2026-08-22 用户拍板）。**边界：** 断言被测代码产出的真实行为文案（如 i18n 输出"已隐藏"）不算违规；loader/FactorySlots 等验证真实接线而必须用真 id 的测试除外。不做 ESLint 机械规则——非时序 bug，且真 id 合法出现场景多，机械拦截必然误伤。
22. **🔥 软件侧用户可见变更提交前，必须调用 version-bump skill 判定变更类别（feat/fix/breaking）并报告版本号判定。** 改动 `src/` 或 `electron/` 代码的 commit，message 必须带类别前缀（`feat:`/`fix:`/`breaking:`，可含 E6#编号，如 `feat:E6#xxx …`）；机械兜底 = `scripts/check-version-bump.mjs`（PreToolUse hook，警告档）+ 发布门禁脚本（E6#57.15d）。**违反=红灯——禁止「代码更新上去了版本号没更」**（2026-08-31 用户拍板；判据见 [.claude/skills/version-bump/SKILL.md](.claude/skills/version-bump/SKILL.md)）。

固定名称，不用"三栏中间那个"。详见 `docs/总体设计/V3-部件命名规范.md`

速查：图标栏（最左 42px）→ 侧栏 → 主区（标签页内容）。主区顶部是标签栏。最上面是顶栏。最下面是状态栏。

## 关键设计——不要改

- **keep-alive：所有面板绝对定位平级渲染，CSS display 切换**（不是 `{isActive && <View />}`——改成条件渲染会丢 CM6/Monaco 状态）
- **平铺方案（B22）：面板 key=groupId 永远不变**（不是递归 flex 嵌套——改回嵌套 → 分屏/合屏 unmount 面板）
- **独立 RingBuffer 多消费者**（不是 Pub/Sub——串口数据是流不是事件，每个消费者需要完整历史）
- **drop zone 照抄 VS Code**：SPLIT_THRESHOLD=0.25 + 左右优先（不自创算法）
- **递归分屏 SplitNode 树**：`leaf | branch(direction, [child, child], sizes)`，MAX_TREE_DEPTH=4

## Phase 4 架构决策（详见 memory `phase4-design-decisions.md`）

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

## 开发命令

```bash
# 🔥 提交前必跑——一条命令 = 双工程 tsc + ESLint --max-warnings 0 + vitest + 网格/pool-css
npm run check

npm run lint         # 单独跑 ESLint（含硬约束 13/14 自定义规则）
npm run dev          # 纯前端预览（Vite）
npm run electron:dev # 完整 Electron 桌面应用（E1 步 1 后可用）
npm run tauri dev    # Tauri 桌面应用（phase6 分支退路）
npx tsc --noEmit     # TypeScript 检查
npx vitest run       # 单元测试（151 个）
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
| 已确认决策 | memory `design-decisions.md` + `phase4-design-decisions.md` |
| 已知坑 | memory `v3-pitfalls.md` + `phase3-drag-bugs.md` |
| 主题系统 | memory `theme-system.md` |
