# Phase 6 — 实施顺序

> 2026-07-21。从 [Phase 5→6 通盘分析](../phase5_应用基础设施/V3-Phase5-Phase6-通盘分析.md) §四 提炼。
>
> **前提：** Phase 5h（运行时动态加载）✅ 已完成 + Phase 5.5（三栏交互对标）必须先完成。
> 5h 是最后一个"改框架"的 Phase——之后 Phase 5.5 是桥，Phase 6 是纯消费者（零框架改动）。
> 5.5 的 `viewRole: "sidebarPrimary"` 让文件树点击图标只切侧栏、不创建空标签页。

---

## 实施链路

```
5h（运行时动态加载）→ 5.5（三栏交互对标）→ Phase 6（零框架改动）

Phase 6 本身分三层——每层都先加新的，验证通过后再切旧的：
  6a（文件树基础闭环）→ 6b（编辑体验完整闭环）→ 6c（主题/语言引擎 + 壳完善）
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

## Phase 6 — 3 层递进

### 第 1 层：6a — 文件树基础闭环（7 项）

```
  ├── CoreEvents 加 onDidChangeFileSystem + onDidChangeWorkspaceFolders
  ├── FileService（封装 Tauri fs）+ Rust 端 list_dir / read_file / write_file / watch_dir 命令
  ├── FileAssociationService（后缀→命令反向索引）
  ├── WorkspaceService（单文件夹管理）
  ├── 文件树组件（系统视图，走 viewRegistry + WorkspaceService + FileService）
  ├── Monaco JSON 编辑器标签页（打开 settings.json）
  ├── 系统文件拖入窗口 → Tauri onDragDropEvent → FileAssociationService
  ├── Ctrl+Shift+T → Reopen Closed Tab
  ├── [修] JSON 按钮 alert → 直接开 Monaco JSON 编辑器标签页
  └── 验证：打开文件夹 → 文件树渲染 → 双击文件 → 关联插件打开 ✅
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

### 第 3 层：6c — 主题/语言引擎 + Profile + 壳完善（13 项）

```
  ├── 主题系统插件化（ThemeRegistry + contributes.themes + 出厂 Dark/Light 迁移 + 退路）
  ├── 语言系统插件化（LanguageRegistry + contributes.languages + 出厂 en/zh 迁移 + 退路）
  ├── 主题浏览器 UI（Ctrl+K Ctrl+T）
  ├── Profile 系统（ProfileService + loadProfile / switchProfile）
  ├── activationEvents + extensionDependencies（loader 升级）
  ├── 齿轮菜单完整版（context key 驱动）
  ├── 输出面板 UI（LogChannel 消费端）
  ├── 标题栏暗色化 + 系统菜单（文件/打开/导入/导出）+ ☰ 基础四组
  ├── Workspace 导入导出 + 欢迎页集成 + recentFolders
  ├── 插件资源访问 API（getResourceUri）+ ResourceService
  ├── 终端会话持久化——终端侧栏加会话列表 + [+ 新建] + 双击恢复（消费 6a 的 FileService + WorkspaceService）
  │   详见 [V3-Phase6-终端会话持久化.md](./V3-Phase6-终端会话持久化.md)
  └── 验证：卸载全部主题 → 退路生效 → 切 Profile → 批量换插件+设置+主题 ✅
```

---

## 核心原则

- **先加新的，验证通过后再切旧的。** 每个 Step 都产出可运行的软件。旧的始终在，直到新的确认 OK 才切。
- **Phase 6 不新增 Registry 类型。** 全消费 Phase 5 的 Registry，零框架改动。
- **每层独立验证。** 6a 跑通才进 6b，6b 跑通才进 6c。不并行。

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
