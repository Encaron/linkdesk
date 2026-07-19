# V3 Phase 3.5 — 品质打磨

> 基于 impeccable + ui-ux-pro-max + web-design-guidelines 三个 skill 的全面审计结果，
> 在卡片架构（Phase 4）开工前，对 V3 进行系统性品质提升。
>
> 审计日期：2026-07-19  
> 审计范围：71 个源文件，6002 行 TS/TSX + CSS  
> 发现问题：38 个（3 严重 + 6 高 + 5 中 + 9 低，另有 15 条建议）

---

## 为什么是 Phase 3.5

Phase 3 完成了架构骨架——标签页、分屏、keep-alive、拖拽——这些是对的。但三个 skill 的对照审计暴露了骨架上的毛刺：

- **主题系统**：4 个核心区域硬编码暗色背景，亮色主题是假功能
- **i18n**：26 个 key 缺失 + 5 处硬编码中文，英文模式下 UI 显示中文
- **无障碍**：对比度不达标、无 focus-visible、无 aria-label
- **代码质量**：`any` 泛滥、魔法数字、z-index 靠 999

这些问题如果留到 Phase 6 再修，就是下一个 V2.6——改动量指数增长，用户体验看不出变化但代码翻了个底朝天。

Phase 3.5 的定位：**不改变任何功能，只让已有的功能更规范、更完整、更经得起切主题/切语言/键盘操作/屏幕阅读的考验。**

---

## 实施顺序（9 步）

### Step 1：i18n 归一化收尾 🔥

**目标：所有 UI 文字走 `t()`，英文模式零中文。**

| # | 任务 | 影响 |
|:--:|------|------|
| 1.1 | 补 26 个缺失的 i18n key — `zh.json` + `en.json` | ReceiveContextMenu / FilterMenu / SearchBar / CommandPalette / TerminalView 命令面板 / 快捷发送 |
| 1.2 | `ErrorBoundary.tsx:29` — `模块加载失败，请重启应用` → `t()` | 错误页面 |
| 1.3 | `WorkspaceView.tsx:23` — Phase 4 占位文字 → `t()` | 工作台视图 |
| 1.4 | `TopBar.tsx:67-70` — `title` 属性 → `t()` | 语言/主题切换按钮 |
| 1.5 | `useTabManager.ts:107-111` — `getDefaultLabel()` 返回值 → `t()` | 标签页默认标题 |
| 1.6 | `splitTree.ts:337,347,354-355` — 验证错误消息 → 英文或错误码 | 开发者消息，保持英文或中文不变均可，统一即可 |
| 1.7 | `ThemeEngine.ts:21` — `throw new Error` 中文 → 英文 | 库级异常 |

**检查点：`grep -r "[一-鿿]" src/ --include="*.tsx" --include="*.ts" | grep -v "//" | grep -v 't("'` 返回空（注释和 t() 调用除外）**

---

### Step 2：主题系统全覆盖 🔥

**目标：亮色主题真正可用。**

| # | 任务 | 文件 |
|:--:|------|------|
| 2.1 | 新增 3 个 CSS 变量：`--bg-icon-bar` / `--bg-side-panel` / `--bg-toolbar` | `index.css` (fallback) + `dark.json` + `light.json` |
| 2.2 | `IconBar.css:7` — `#18181B` → `var(--bg-icon-bar)` | 图标栏 |
| 2.3 | `SidePanel.css:2` — `#1E1E22` → `var(--bg-side-panel)` | 侧栏 |
| 2.4 | `TerminalView.css:8` — `#252528` → `var(--bg-card)`（已有变量，直接替换） | 终端视图 |
| 2.5 | `TerminalView.css:17` — `#1E1E22` → `var(--bg-toolbar)` | 终端工具栏 |
| 2.6 | 14 处 `rgba(255, 255, 255, ...)` 悬浮色 → 改用 CSS 变量或自适应方案 | 各 CSS 文件 |
| 2.7 | `index.css:124` `.toggle::after` — `background: white` → `var(--toggle-knob)` | Toggle 组件 |

**检查点：亮色主题下，图标栏/侧栏/终端/工具栏全部变色，无硬编码遗留。**

---

### Step 3：无障碍基线（a11y）🔥

**目标：键盘可操作、屏幕阅读器可理解、对比度达标。**

| # | 任务 | 影响 |
|:--:|------|------|
| 3.1 | `--text-muted` 对比度修复 — `#6A6A6A` → `#8A8A8A`（dark）/ `#999999` → `#767676`（light）| StatusBar / 侧栏 / 工具栏 / CM6 行号 |
| 3.2 | 建 z-index 语义变量 — `--z-dropdown` / `--z-sticky` / `--z-overlay-backdrop` / `--z-overlay` / `--z-modal` / `--z-toast` | 替换全部硬编码 z-index |
| 3.3 | 全局 `:focus-visible` 样式（2px accent 色环，不覆盖 `outline: none` 的设计意图，但提供键盘导航替代指示器） | 按钮 / 输入框 / 选择框 |
| 3.4 | 为 20+ 个交互元素补 `aria-label` | 按钮 / 输入框 / toggle / 图标按钮 |
| 3.5 | 图标栏 `role="navigation"` + 标签栏 `role="tablist"` | 语义角色 |

**检查点：Tab 键全程可见焦点，VoiceOver/NVDA 能朗读所有按钮功能。**

---

### Step 4：动效规范化

| # | 任务 | 文件 |
|:--:|------|------|
| 4.1 | `@keyframes tab-enter / tab-exit` — `max-width`+`padding` → `transform`+`opacity` | [TabBar.css:239-255](src/components/TabBar.css) |
| 4.2 | 全项目加 `@media (prefers-reduced-motion: reduce) { *, *::before, *::after { animation-duration: 0.01ms !important; transition-duration: 0.01ms !important; } }` | `index.css` |
| 4.3 | 80ms 过渡 → 拉齐到 120ms | [TabBar.css:185,220](src/components/TabBar.css) |

---

### Step 5：TypeScript 类型收窄

| # | 任务 | 文件 |
|:--:|------|------|
| 5.1 | `MainContent` 8 个 `any` props → 精确类型（`TabType` / `DropZone` / `React.RefObject`） | [MainContent.tsx](src/components/MainContent.tsx) |
| 5.2 | `TabBar` `opts?: any` → `{ workspaceName?: string }` | [TabBar.tsx](src/components/TabBar.tsx) |
| 5.3 | `TerminalView` Monaco `any` → `monaco.editor.IStandaloneCodeEditor` 等 | [TerminalView.tsx](src/components/views/TerminalView.tsx) |

---

### Step 6：代码质量 — 去重 + 常量化

| # | 任务 | 文件 |
|:--:|------|------|
| 6.1 | 发送逻辑去重 — 抽 `performSend()` 统一 `handleSend` / `handleQuickSend` / 自动发送 | [TerminalView.tsx](src/components/views/TerminalView.tsx) |
| 6.2 | 魔法数字常量化 — `MAX_DOC_LINES=2000` / `TRIM_KEEP_LINES=500` / `RING_BUFFER_CAPACITY=512` 等 | TerminalView.tsx |
| 6.3 | `DataConverter.ts` + TerminalView HEX 校验逻辑统一 | 两文件 |
| 6.4 | `ViewId` 过渡类型别名 → 改用 `TabType` | [App.tsx:18](src/App.tsx) |

---

### Step 7：测试补强

| # | 任务 | 说明 |
|:--:|------|------|
| 7.1 | `useDragReorder` 测试（至少覆盖 reorder↔split 状态机 + mouseup 两种结束方式） | 273 行零测试 → 至少 10 个用例 |
| 7.2 | `reduceSplitTabAt` 测试 | 当前只测了 reduceSplitTab |
| 7.3 | `reduceDuplicateTab` 测试（Shift+拖复制） | 未覆盖 |
| 7.4 | `vitest.config.ts` 显式配置文件 | 替代隐式默认 |

---

### Step 8：间距 + 触摸目标规范化

| # | 任务 |
|:--:|------|
| 8.1 | 建 `--space-*` CSS 变量（4/8/12/16/24/32），替换散落的 hardcoded padding/margin/gap |
| 8.2 | 图标栏 `gap: 2px` → `4px`（最低 4px间距） |
| 8.3 | 工具栏按钮 `gap: 4px` → `8px` |
| 8.4 | 关闭按钮 18px → 28px、折叠按钮 22px → 28px |

---

### Step 9：配置 + 文档收尾

| # | 任务 |
|:--:|------|
| 9.1 | `PreferenceService.listWorkspaces()` — 加 TODO 标记，注明 Phase 4 实现 |
| 9.2 | `tsconfig.json` / `tauri.conf.json` 审查（CSP、schema URL） |
| 9.3 | 移除未使用的 `tsx` devDependency（确认未被 CLI 使用后） |
| 9.4 | 更新 `docs/当前状态.md` 反映 Phase 3.5 完成 |
| 9.5 | 更新 `MEMORY.md` 和 memory 文件 |

---

## 不改的内容（有意识的技术债务）

| # | 问题 | 理由 |
|:--|------|------|
| 1 | 按钮 < 44×44px WCAG 目标尺寸 | 桌面应用不强制——鼠标精度远高于手指。VS Code 的关闭按钮也是 18px。保持现状，不做无意义的放大 |
| 2 | Monaco 打包体积 ~150KB | 发送栏需要语法高亮，textarea 无法替代。Phase 6 评估 |
| 3 | TerminalView ~950 行 | 拆分风险 > 收益。正确路径是抽 `useSend` hook，留到 Phase 4 |
| 4 | DTR/RTS UI / 数据位/停止位/校验 | Rust 命令就绪但 UI 未加——串口功能需求，不是品质问题 |
| 5 | 新数据 50ms 蓝色闪烁 | P2 打磨项，不影响功能 |

---

## 预期耗时

| Step | 内容 | 预估 |
|:--:|------|:--:|
| 1 | i18n 收尾（26 key + 5 硬编码） | 30min |
| 2 | 主题全覆盖（3 新变量 + 4 修复 + 14 rgba） | 30min |
| 3 | 无障碍基线（对比度 + z-index + focus + aria） | 45min |
| 4 | 动效规范化 | 15min |
| 5 | TypeScript 类型收窄 | 20min |
| 6 | 代码质量去重 + 常量化 | 30min |
| 7 | 测试补强 | 45min |
| 8 | 间距 + 触摸目标 | 20min |
| 9 | 配置 + 文档收尾 | 15min |
| **总计** | | **~4 小时** |

---

## 完成标准

- [ ] `grep` 硬编码 hex（`#[0-9a-fA-F]{6}`）在 `.tsx/.css` 中返回空（CSS 变量定义和 rgba 除外）
- [ ] `grep` 硬编码中文（非注释/非 t() 内）在 `.tsx/.ts` 中返回空
- [ ] `grep` `z-index: [0-9]` 在 `.css` 中返回空（全部替换为 `var(--z-*)`）
- [ ] 亮色主题截图：图标栏/侧栏/终端/工具栏全部跟随主题
- [ ] 英文模式截图：无中文 UI 文字
- [ ] Tab 键全程可见焦点
- [ ] `npx tsc --noEmit` 零错误
- [ ] `npx vitest run` 全部通过（≥ 当前 91 个）
- [ ] `npx tauri dev` 正常运行

---

## 补充：架构评价暴露的 AI 入口缺口（Step 10）

> 2026-07-19 — 两轮架构评价（impeccable + ui-ux-pro-max 审计 + 独立架构评审）共识：
> 架构骨架 8.5/10 分，但"AI 能安全操作"这件事上缺两层：
> **入口层**（新 AI 30 秒内理解项目）+ **护栏层**（自动化规则防止 AI 犯错）。

### 缺口 1：CLAUDE.md — 项目级 AI 入口

Memory 系统在 `~/.claude/projects/` 是私有目录。clone 仓库后新 AI 看到的是裸仓库。
`CLAUDE.md` 不是复制 memory，是浓缩——新 AI 30 秒读完能理解：这是什么、什么架构、什么不能碰、去哪找更多。

### 缺口 2：workspace.schema.json — AI 不靠猜字段名

workspace.json 是平铺数组——好。但 AI 加卡片时字段名叫 `id` 还是 `cardId`？有没有 `minW` 约束？
一个最小 schema（只定义 Phase 3 已有结构，Phase 4 字段留 `additionalProperties`）让 AI 生成合法 JSON 的概率从 ~85% 提到 ~99%。

### 缺口 3：硬约束自动化 — 从"人记"到"机器执行"

| 约束 | 当前 | 应有 |
|------|------|------|
| 标签页系统不 import CardRegistry | 靠 code review | ESLint `no-restricted-imports` |
| 所有颜色走 CSS 变量 | 靠人工 grep | stylelint `color-no-hex` |
| 所有 UI 文字走 t() | 靠人工 grep | ESLint `no-restricted-syntax` 禁止 JSX 中文 |

差的是几行配置，不是架构改动。

### 缺口 4：反直觉设计标注 — 防 AI "优化"

- **keep-alive `display:none`**：AI 直觉是改成 `{isActive && <View />}`——这一改标签页切换丢状态
- **平铺方案**：AI 直觉是"为什么不用嵌套 flex？"——改回递归 → B22 回归
- **独立 RingBuffer 多消费者**：AI 直觉是"为什么不换 Pub/Sub？"——串口数据是流不是事件

这些反直觉的正确设计需要显式注释，否则 AI 会把它们"优化"掉。

### 缺口 5：B13 的根本原则

当前 solo tab 分屏阻止。但空组问题不只在 split——move/close 都可能导致组变空。
原则：**每次写 reducer 时遍历所有"组变空"的路径，每个路径都有清理逻辑或显式阻止。**

### 缺口 6：平铺方案的隐性复杂度

递归 flex：嵌套层级 = 视觉层级，z-index/焦点/活跃面板天然继承。
平铺方案（B22）：所有面板平级，需要显式管理 z-index（✅ 已修）、焦点边框、活跃面板标识。

### 架构评分（外部评价）

| 维度 | 评分 | 对应 Phase 3.5 |
|------|:--:|------|
| 概念纯度 | 9/10 | — |
| 扩展性 | 9/10 | — |
| AI 可操作性 | 8/10 | ⬜ 缺口 1+2 |
| 防退化 | 7/10 | ⬜ 缺口 3 |
| 对标正确性 | 9/10 | — |
| 渲染可靠性 | 8/10 | ⬜ 缺口 4+6 |
| 历史教训利用 | 9/10 | — |
| 整体 | 8.5/10 | — |

### Step 10 实施

| # | 任务 | 产出 |
|:--:|------|------|
| 10.1 | 创建 `CLAUDE.md` | 项目根 |
| 10.2 | 创建 `workspace.schema.json`（最小版） | `public/schemas/` |
| 10.3 | ESLint `no-restricted-imports` + stylelint 规则 | `.eslintrc` / `.stylelintrc` |
| 10.4 | keep-alive/平铺方案/RingBuffer 注释标注 | 源码关键位置 |
