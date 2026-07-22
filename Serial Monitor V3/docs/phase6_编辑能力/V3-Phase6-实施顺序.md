# Phase 6 — 实施顺序

> 2026-07-21 初稿，2026-07-22 修订：加插件隔离前置条件。从 [Phase 5→6 通盘分析](../phase5_应用基础设施/V3-Phase5-Phase6-通盘分析.md) §四 提炼。
>
> **前提：** Phase 5h（运行时动态加载）✅ 已完成 + Phase 5.5（三栏交互对标 + **插件隔离第一层**）必须先完成。
> 5h 是最后一个"改框架"的 Phase——之后 Phase 5.5 是桥，Phase 6 是纯消费者（零框架改动）。
> 5.5 的 `viewRole: "sidebarPrimary"` 让文件树点击图标只切侧栏、不创建空标签页。
>
> **为什么隔离防线是 Phase 6 的前提：** Phase 6 开始加第二个、第三个插件——文件树、Monaco 编辑器、主题浏览器、语言选择器。每多一个插件，多一个崩溃向量。Error Boundary 兜底必须在插件数量膨胀**之前**就位，而不是事后补。详见 [插件隔离——物理上限与分层兜底](../phase5.5_交互对标/V3-Phase5.5-ErrorBoundary增强计划.md)。

---

## Phase 5.5 结界——做完这些才能进 Phase 6

Phase 5.5 交付物分两类：**交互对标**（三栏交互 VS Code 化）和**质量防线**（插件隔离 + 归一化）。两类同属 5.5，都是 Phase 6 的硬前提。

### A. 交互对标（三栏）

```
  ├── PluginManifest 加 viewRole 字段
  ├── App.tsx handleIconClick 改用 viewRole switch
  ├── marketplace → "sidebarPrimary"
  ├── terminal → "sidebarPrimary"
  ├── settings → "tabOnly"
  ├── workspace → "sidebarPrimary"
  └── 15 步 Bug 修复主线
```

### B. 质量防线（插件隔离 + 归一化）

```
  ├── @src alias 归一化——所有插件统一用 @src/ 引用核心模块（已完成 e4c7578）
  ├── Error Boundary 增强——pluginId + componentDidCatch + 重试按钮
  ├── Error Boundary 覆盖所有插件渲染点（主区 + 侧栏 + 壳视图）
  └── 详见 Plugin Isolation 计划文档
```

**验证标准：** 故意在 terminal 插件中抛异常 → fallback 显示"「终端」已崩溃 [重试]" + 控制台输出 stack + 其他标签页正常交互。侧栏同理。

---

## 实施链路

```
5h（运行时动态加载）→ 5.5（5.5-0a/0b 验收修复 → 5.5a-5.5c 三栏交互）→ Phase 6（零框架改动）

Phase 6 本身分五层——每层都先加新的，验证通过后再切旧的：
  6a（文件树基础闭环）→ 6b（编辑体验）→ 6c（主题/语言引擎）→ 6d（Profile+激活）→ 6e（壳+旧债）
```

---

## 第 -1 步：Phase 5h — 运行时动态加载（Phase 6 的前提 — ~400 行）

5h 解决架构级根因：`import.meta.glob({ eager: true })` 是 Vite 构建时解析——新插件文件在磁盘上，但 JS bundle 不知道 → 必须刷新页面。替换为运行时动态加载后，插件安装/卸载/启用/禁用全部即时生效。

详见 [Phase 5 设计 §9.2](../phase5_应用基础设施/V3-Phase5-设计.md) — 5h 章。

```
  ├── 插件独立构建脚本（Vite library mode，~100 行）
  ├── Tauri 自定义 "plugin://" 协议（Rust ~50 行）
  ├── 运行时加载器——替换 import.meta.glob（~150 行）
  ├── 插件注册契约——window.__v3_registerPlugin()（~30 行接口）
  ├── 安装/卸载即时生效——不刷新页面
  └── React 单例保证——插件和核心共用 React 实例
```

**5h 依赖 5g：** 5g 把 TabType 从联合类型改为 `string`、硬编码判断改为 plugin.json 声明——5h 的 loader 才能完全声明驱动，不需要 switch 插件 ID。

**5.5 受益于 5h：** 新插件安装后 viewRole 声明立即被读取 → 图标点击行为自动正确（sidebarPrimary/tabOnly）→ 不需要改 App.tsx。

---

## 第 0 步：Phase 5.5 — 三栏交互对标 VS Code（~150 行）

详见 [Phase 5.5 三栏交互对标](../phase5.5_交互对标/V3-Phase5.5-三栏交互对标.md)。

```
  ├── PluginManifest 加 viewRole 字段（types.ts +3 行）
  ├── viewRegistry 存 viewRole（+1 行）
  ├── App.tsx handleIconClick 改用 viewRole switch（~20 行）
  ├── 删 tabIdentity.ts 的 isSidebarOnlyView 硬编码（-5 行）
  ├── marketplace → "sidebarPrimary"
  ├── terminal → "sidebarPrimary"（侧栏出会话列表，点会话才开标签页）
  ├── settings → "tabOnly"
  └── workspace → "sidebarPrimary"（侧栏出卡片列表，点卡片才开标签页）
```

**Bug 修复（在 5.5 期间）：**
- [修] 终端 COM 口多实例隔离——侧栏重写时做 tabId 隔离

---

## Phase 6 — 5 层递进

### 第 1 层：6a — 文件树基础闭环（8 项）

```
  ├── CoreEvents 加 onDidChangeFileSystem + onDidChangeWorkspaceFolders
  ├── FileService（封装 Tauri fs）+ Rust 端 list_dir / read_file / write_file / watch_dir 命令
  ├── FileAssociationService（后缀→命令反向索引）
  ├── WorkspaceService（单文件夹管理）
  ├── 文件树组件（系统视图，走 viewRegistry + WorkspaceService + FileService）
  │    ├── 侧栏工具栏：刷新按钮（对标 VS Code Explorer 刷新）
  │    ├── 键盘操作——对标 VS Code 源码 fileActions.contribution.ts：
  │    │   F2: 重命名（when: Explorer focus + !root + writable）→ 侧栏内触发，标签标题联动
  │    │   Delete: 移到回收站（when: Explorer focus + moveableToTrash）
  │    │   Shift+Delete: 永久删除（when: Explorer focus）
  │    │   Ctrl+X/C/V: 剪切/复制/粘贴（when: Explorer focus + writable）
  │    │   Ctrl+N: 新建文件（when: Explorer focus）
  │    │   Ctrl+Shift+N: 新建文件夹（when: Explorer focus）
  │    └── 右键菜单：MenuId.FileContext → MenuService 驱动
  ├── Monaco JSON 编辑器标签页（打开 settings.json）
  ├── 系统文件拖入窗口 → Tauri onDragDropEvent → FileAssociationService
  ├── Ctrl+Shift+T → Reopen Closed Tab
  ├── [修] JSON 按钮 alert → 直接开 Monaco JSON 编辑器标签页
  └── 验证：打开文件夹 → 文件树渲染 → F2 改名（标签标题同步更新）→ Delete 删除 ✅
```

### 第 2 层：6b — 编辑体验完整闭环（8 项）

```
  ├── SearchService（Ctrl+Shift+F 跨文件内容搜索）
  ├── 文件树 Ctrl/Shift 多选 + 批量操作右键菜单
  ├── EncodingService（编码检测/切换）
  ├── 拖拽文件树节点到编辑区
  ├── Settings Editor JSON schema 自动补全（Monaco + ConfigurationRegistry 动态生成）
  ├── 多工作区文件夹（WorkspaceService.addFolder / removeFolder）
  ├── 文件图标主题（IconThemeRegistry + contributes.iconThemes）
  ├── 文件装饰器框架（FileDecorationProvider 接口 + DecorationRegistry）
  └── 验证：Ctrl+Shift+F 搜索 → 多选文件 → 拖拽打开 → 编码切换 ✅
```

### 第 3 层：6c — 主题/语言引擎（5 项）

```
  ├── 主题系统插件化（ThemeRegistry + contributes.themes + 出厂迁移 + 退路）
  ├── 语言系统插件化（LanguageRegistry + contributes.languages + 出厂迁移 + 退路）
  ├── 主题浏览器 UI（Ctrl+K Ctrl+T——搜索/预览/即时切换）
  ├── 产品图标主题（Product Icon Theme）
  ├── 插件资源访问 API（getResourceUri）
  └── 验证：卸载全部主题 → 退路生效 → 恢复出厂主题 ✅
```

### 第 4 层：6d — Profile + 激活链路（5 项）

```
  ├── Profile 系统（ProfileService + loadProfile / switchProfile）⚠️ 五维验证
  ├── activationEvents（onCommand / onFileOpen / onPortOpen——按需激活）
  ├── extensionDependencies（加载前检查：依赖缺失 → toast → 不加载）
  ├── 齿轮菜单完整版（context key 驱动——Profile 切换时菜单联动）
  ├── 输出面板 UI（LogChannel 消费端——Profile 切换时频道变化）
  ├── 终端会话持久化——终端侧栏加会话列表 + [+ 新建] + 双击恢复
  │   详见 [V3-Phase6-终端会话持久化.md](./V3-Phase6-终端会话持久化.md)
  └── 验证：切 Profile → 插件列表+settings+主题+语言+布局 五维全变 ✅
```

### 第 5 层：6e — 壳完善 + 清旧债（8 项）

```
  ├── 欢迎页集成 + recentFolders
  ├── 标题栏暗色化 + 系统菜单 + ☰ 基础四组
  ├── Workspace 导入导出
  ├── [D2] SerialContext/useSendData 移出 core/——迁入 terminal 插件
  ├── [D3] portOpen/portName → sourceOpen/sourceName 术语迁移（Rust+TS+Tauri）
  ├── [D4] Chord 快捷键——KeybindingRegistry 加 Chord 状态机
  ├── [D6] keybindings.json 用户自定义快捷键——读写/合并/优先级
  ├── [D8] DialogService 自定义 React UI——替换 3 处 window.confirm()
  └── 验证：Ctrl+K Ctrl+S 触发命令 + keybindings.json 修改后即时生效 ✅
```

---

## 核心原则

- **先加新的，验证通过后再切旧的。** 每个 Step 都产出可运行的软件。旧的始终在，直到新的确认 OK 才切。
- **Phase 6 不新增 Registry 类型。** 全消费 Phase 5 的 Registry，零框架改动。
- **每层独立验证。** 6a 跑通才进 6b，6b 跑通才进 6c。不并行。

### 6c Profile 系统专项验证（五维）

Profile 切换是最容易出"半完成态"的操作——不是代码写错了，是漏了一个维度没切。每次切 Profile 必须验证五个维度全部变化：

| # | 维度 | 验证方法 | 失败后果 |
|:--:|------|------|------|
| 1 | 插件加载列表 | `PluginStateService.getAll()` → 检查 enabled/disabled 集合 | Profile A 的插件在 Profile B 仍然活跃，或反过来 |
| 2 | settings 值 | `ConfigurationService.inspect(key)` → 检查 effectiveValue | 切 Profile 后波特率/主题仍是上一个 Profile 的值——"配置残留"类 bug |
| 3 | 主题 CSS 变量 | `getComputedStyle(document.body).getPropertyValue('--bg')` | UI 颜色半新半旧——最显眼的 bug |
| 4 | 语言 | `i18next.language` + UI 文字实际显示 | 菜单中文、设置英文——碎片化体验 |
| 5 | 布局（标签页+工作区） | 检查 tabs[] 列表 + activeGroupId + workspace root | 上一个 Profile 的标签页残留，或 workspace 没切换 |

**Profile 切换不是"改一个变量"——是批量执行 enablePlugins + disablePlugins + applySettings + switchTheme + switchLanguage + openWorkspace。** 六个操作任何一个失败都不能静默——必须 toast 报告哪个操作失败了、当前是什么状态。对标 VS Code：Profile 切换失败时，VS Code 回退到切换前的状态。

### 6a WorkspaceService ↔ ConfigurationService 时序

`ConfigurationService.setWorkspaceRoot(path)` 在 Phase 5 已定义接口签名，Phase 6a 的 WorkspaceService 初始化时调用它。**注意时序：** 如果任何 `useConfiguration()` 在 `setWorkspaceRoot` 之前被调用，Workspace scope 解析会缺上下文——和 Phase 5f 的"懒加载时序歧义"（commit `6f3d6ba`）同类问题。解法：`setWorkspaceRoot` 在 App.tsx 的初始化阶段（React render 之前或最早的 useEffect）同步调用。

---

## 验证路径

每一个 Step 都产出可运行的软件：

1. 先建暗线（Rust 命令 + Service 层）
2. 再接明线（UI 视图 + 交互入口）
3. 最后打通循环（Profile 切换 → 批量启用/禁用 → activationEvents 按需加载 → 文件关联 → 拖入 → 全部串起来）

---

## 相关文档

- [Phase 6 设计](./V3-Phase6-设计.md) — 28 项任务 + 隐藏任务
- [终端会话持久化](./V3-Phase6-终端会话持久化.md)
- [Phase 5→6 通盘分析（桥接文档）](../phase5_应用基础设施/V3-Phase5-Phase6-通盘分析.md)
- [Phase 6.5 抛光与补齐](../phase6.5_抛光/V3-Phase6.5-抛光与补齐.md)
