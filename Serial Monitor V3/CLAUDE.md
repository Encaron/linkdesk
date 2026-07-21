# LinkDesk

> Tauri v2 + React 18 + TypeScript — **通用容器**。比 VS Code 更高级：VS Code 核心嵌了 Monaco 编辑器甩不掉，LinkDesk 核心是空壳。万物皆插件。

## 架构：两层容器

```
外层：标签页 + 递归分屏（VS Code 编辑器组模型）
  └── 标签页拖拽/分屏/合并，keep-alive 绝对定位平铺
内层：卡片网格（Phase 7）
  └── react-grid-layout 拖拽重排，workspace.json 平铺数组
硬边界：标签页系统永不 import CardRegistry，唯一接触点 = Tab.workspaceName: string
```

## 当前阶段

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

详见 `docs/phase5_应用基础设施/V3-Phase5-设计.md`（命令系统 + 配置注册表 + 菜单系统 + 协议注册表 + context key + 快捷键 + scope）
详见 `docs/phase5.5_交互对标/V3-Phase5.5-设计.md`（三栏交互对标 VS Code）
详见 `docs/phase5_应用基础设施/V3-Phase5-最终验收报告.md`（Phase 5 验收——4 Blocking + 9 Quick Wins 已全部修完）
分支：`phase5.5`

## Phase 路线

| Phase | 内容 | 改框架？ | 状态 |
|:--:|------|:--:|:--:|
| **5a** | Registry 暗线（Command/Config/Menu/Protocol + ContextKey + Keybinding + CoreEvents + 11盲区）+ 迁移双写 + Settings Editor 骨架 | ✅ | ✅ |
| **5b** | 右键菜单归一化——`<ContextMenu>` 统一组件（backdrop + 四种失焦）| ✅ | ✅ |
| **5c** | 命令面板 + 齿轮菜单走 Registry（替代硬编码） | ✅ | ✅ |
| **5d** | context key + when 条件打通（4 核心 key 运行时更新 + 菜单/命令过滤 + plugin.json 声明 when + 31 个解析器测试） | ✅ | ✅ |
| **5e** | 协议下拉框 + 终端 12 设置项迁移 + 接收编码/HEX 模式 + Settings Editor 中文标签 | ✅ | ✅ |
| **5f** | StorageService + 删旧双写 + 终端专用通道拆除（10 项） | ✅ | ✅ |
| **5g** | 类型系统去硬编码——TabType 动态化 + plugin.json 声明驱动（7 项） | ✅ | ✅ |
| **5h** | 运行时动态加载 + PluginLifecycle 归一化 + B1/B2/B78 修复（19 commits，~900 行）| ✅ | ✅ |
| **5.5** | **三栏交互对标 VS Code + Phase 5 验收修复（5.5-0a ✅ → 5.5-0b ✅ → 5.5a ✅ → 5.5b ✅ → 5.5c C1 ✅ C2+C3 ✅ C4a ✅ C4b ✅ C5 ✅）** | ❌ | ✅ |
| 6 | 编辑能力——文件树 + 文件编辑 + 主题/语言引擎 + Profile + 壳（5 层：6a/6b/6c/6d/6e，33 项）→ `docs/phase6_编辑能力/` | ❌ | 📋 |
| **6.5** | **抛光与补齐——通知系统/通用 API/视觉 polish（10 项，3 批；Phase 6 完成后串行执行）** | ❌ | 📋 |
| 7 | 卡片工作台 + 数据管道（纯插件）| ❌ | 📋 |
| 8 | OLED（独立插件）| ❌ | 📋 |

> Phase 5 拆分为 5a-5h 八批次——每批交一个可用软件。拆分细节见 `docs/phase5_应用基础设施/V3-Phase5-设计.md` §九。

## 提交前自检

**🔥 机械操作，不是建议。** `npx tsc --noEmit` 零错误 + `npx vitest run` 全过 + `git diff --stat` 确认无调试日志残留 + **`git diff --staged \| grep -E 'pluginId === "[a-z]|case "[a-z].*":|BOTTOM_ICONS|PLUGIN_ICON_PATH'` 返回空（无新增插件 ID 硬编码）。**

详见 memory `ai-pre-commit-checklist.md`——五条：完整性（改 N 个漏 M 个？）/ 归一化（同一个逻辑只一处写？）/ 边界（空/null/竞态测了吗？）/ 注册注销（mount-unmount-remount 对吗？）/ 提交前机械操作。

## 硬约束（绝对不能违反）

1. **所有颜色走 CSS 变量 `var(--xxx)`**，禁止硬编码 hex
2. **所有 UI 文字走 `t()`**，禁止硬编码中文（i18n key = 中文原文）
3. **标签页系统不 import CardRegistry**（Phase 3→4 硬边界）
4. **workspace.json 禁止嵌套**，必须是一层平铺数组
5. **Tauri `listen()` 必须用 generation counter 模式**（B11 教训）
6. **`setState` 函数式更新器内部不写副作用**（B25 教训）
7. **组件只实现 OnData(fields) + OnSend**，不改路由/壳/其他组件
8. **ProtocolParser 是独立可替换模块，RingBuffer 接口 `{ cardId, value }` 是硬边界**——开发阶段只用方括号协议，但任何代码不得写死"只有这一种协议"。Phase 4 协议插件系统通车时，只换解析器不改下游。
9. **核心无知原则**（memory `core-ignorance-principle.md`）：核心不知道软件是干什么的。只定义"怎么接"，不定义"接什么"。往核心加东西前先问：加了之后核心变得更"知道自己是干什么的"了吗？是 → 别加，做成插件
10. **禁止在 core/ 或 pluginLoader/ 中写死插件 ID。** 禁止 `if (pluginId === "terminal")` / `switch (pluginId) { case "terminal": ... }` / `PLUGIN_ICON_PATH["terminal"]` / `BOTTOM_ICONS = ["settings"]` 等任何形式的插件 ID 字面量硬编码。所有插件差异性行为走 plugin.json 声明（`viewRole` / `tabBehavior` / `iconLocation` / `keepSidebarOnFocus` 等字段）→ Registry 模式消费。**Phase 5g 把 `TabType` 从 8 个联合类型改成 `string` 就是为了消灭这个模式——不要再写回来。**

完整版：`docs/` + memory 系统

## 部件命名

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

## 开发命令

```bash
npm run dev          # 纯前端预览
npx tauri dev        # 完整桌面应用
npx tsc --noEmit     # TypeScript 检查
npx vitest run       # 单元测试（91 个）
```

改 Tauri 配置（tauri.conf.json / Cargo.toml / lib.rs）后 → 先 `cargo check` → 零错误再 `tauri dev`。

## 关键文件

| 你要做什么 | 读这个 |
|------|------|
| 理解架构 | `docs/开发管理/当前状态.md` |
| Phase 4 设计 | `docs/phase4_插件系统/` |
| Phase 3.5 任务 | `docs/phase3_标签页分屏/V3-Phase3.5-品质打磨.md` |
| 标签页/分屏设计 | `docs/phase3_标签页分屏/V3-Phase3-标签页分屏设计.md` |
| 部件名称 | `docs/总体设计/V3-部件命名规范.md` |
| 写插件 | `docs/插件开发/`——plugin.json 规范 + 视图/协议插件开发指南 + **插件 UI 写法规约（🔥 右键菜单/持久化/快捷键规则）** + JSON Schema |
| 已确认决策 | memory `design-decisions.md` + `phase4-design-decisions.md` |
| 已知坑 | memory `v3-pitfalls.md` + `phase3-drag-bugs.md` |
| 主题系统 | memory `theme-system.md` |
