# E4 — 文件树与 Monaco 编辑器

> 2026-07-25。**E3 架构封板后 = E4。第一批消费者插件——文件树 + Monaco 编辑器。**
> **E4 是最后一个 E 编号。此后全是插件，不占编号。**
> **🔥 文件树 = 第 5 个工厂插件。比终端重要——它是平台的"文件入口"，被设置/Git/AI/智能体调用。**

---

## 定位

| | |
|---|---|
| Phase | **E4**——第一批消费者插件（39 任务，~2,060 行） |
| 输入 | E3 完成——多 WebView + 主题/语言跨进程 + Profile 就绪 |
| 输出 | 文件树侧栏视图 + Monaco 编辑器标签页 + 跨插件命令 API + 文件搜索 + 多工作区 |
| 依赖 | E3 完成（E3a 多 WebView + E2c FileService + E2c FileAssociationService） |

## 子任务

| # | 内容 | 任务数 | 来源 |
|---|---|---|---|
| E4a | **文件树核心渲染**——数据模型 + 树组件 + 虚拟滚动 + 侧栏注册 + 欢迎视图 + 紧凑文件夹 + 排除模式 | 8 | 新——对标 VS Code Explorer 核心 |
| E4b | **文件树交互操作**——右键菜单(全量18项) + 键盘导航 + 快捷键 + 拖放 + 多选 + 行内重命名 + 剪贴板 | 7 | 新——对标 VS Code Explorer 交互 |
| E4c | **文件树集成接口**——FileAssociation 消费 + revealInExplorer(RevealResult) + FileDecorationProvider 消费(E3f注册中心) + 跨插件命令 API 契约 | 5 | 新——平台公共 API |
| E4d | **文件搜索**——搜索 UI + 结果树 + 替换 + include/exclude 模式 + 编码检测 + 结果导航 | 5 | 新——对标 VS Code Search |
| E4e | **工作区与持久化**——Multi-root + .linkdesk-workspace + 状态持久化(展开/选中/滚动) + 配置项清单 | 5 | 新——对标 VS Code Workspace |
| E4f | **Monaco 编辑器**——编辑器包装 + 编码检测 + JSON schema + 多标签页 + dirty + Ctrl+Shift+T | 4 | 新——对标 VS Code Editor |

总计 **39 任务，~2,060 行**（含 5 项前置 #83-#87）。E4 执行时重新审定行数。
任务 ID `#83`–`#121`，承接 E3 的 `#24`–`#82g`。进度见 `07-执行清单.md`（**唯一真相源**）。
**🔥 UI 布局规格：** `00.5-UI布局规格.md`——整体 wireframe + 设计 token + 状态矩阵 + 动画规格。**开发前必读，不凭感觉写 CSS。**
**🎨 交互预览：** [filetree-preview.html](filetree-preview.html)——浏览器打开查看文件树 + 装饰器 badge + twistie 动画效果。

## 为什么不是 15 任务

第一版设计把"文件树"当一个整体，11 任务。但文件树不是"一个功能"——是 VS Code Explorer + Search + Workspace + Editor 的完整复刻

## 为什么不是 15 任务

第一版设计把"文件树"当一个整体，11 任务。但文件树不是"一个功能"——是 VS Code Explorer 的完整复刻：

- **核心渲染**（数据模型/虚拟树/侧栏）——不单是"画一棵树"。VS Code 的 `AsyncDataTree` 有虚拟滚动、懒加载、渐进渲染。这些不是"以后优化"——是第一天就要有的。
- **交互操作**（右键菜单/键盘/拖放/剪贴板）——每一类都是独立系统。右键菜单 18 项不是 "copy 几个 div"——每项的 when 条件、多选行为、撤销支持都要设计。
- **集成接口**（revealInExplorer / FileDecorationProvider）——**这些是公共 API。** 设置、Git、AI 调用它们。API 设计错了 → 所有调用方都要跟着改 → 这就是 V2.6 的根因。
- **文件搜索**——VS Code 把它独立成一个 Viewlet (`SearchView`)，不是 Explorer 的子功能。Ctrl+Shift+F 打开的是搜索面板，不是文件树。
- **工作区与持久化**——F5 刷新后展开状态、选中状态、滚动位置全部丢失 → 用户每次重启都从零展开 → 这不是"以后加"的功能。
- **Monaco 编辑器**——编辑器的 dirty 管理、编码回退、JSON schema 自动补全——每项都是独立功能。

## 涉及架构改动

**接近零。** 全部走 `plugin.json` + React 组件。E1-E3 建的设施已就绪。仅 3 项核心新增（均有准入理由）：

| 新增项 | 位置 | 理由 |
|---|---|---|
| `FileService.copy()` | `src/core/FileService.ts` | 🔥 弥补缺口——底层 API 有定义但未导出。E4b 拖放/剪贴板依赖 |
| `EncodingService` | `src/core/encoding/EncodingService.ts` | 🔥 多消费方准入——file-tree 搜索 + editor 都需编码检测 |
| `closedTabStack` | `src/hooks/useTabManager.ts` | 🔥 Ctrl+Shift+T 恢复关闭标签页——~10 行 |

| 已有设施 | E4 消费 | 来源 |
|---|---|---|
| `FileService.*` | 读/写/删/建/监听/列目录 + 🔥 **copy() 前置补缺** | E2c #13 + E4 前置 |
| `FileAssociationService.*` | 扩展名→编辑器映射 | E2c #13a |
| `DialogService.confirm()` | 删除确认 / 覆盖确认 / 拖放确认 | E2c #15 |
| `WorkspaceService.*` | 多根工作区 | E2c #14 |
| `KeybindingRegistry` | F2/Delete/Ctrl+XCV/Ctrl+Shift+F | E2c #16-#17a |
| `ContextKeyService` | 右键菜单 when 条件 + 快捷键 when | 已有 |
| `MenuRegistry` | 🔥 **`MenuId.FileContext`——文件树注册 + Git 注入** | 已有 |
| `CoreEvents.onDidChangeFileSystem` | 外部文件操作→刷新 | E2c #19 |
| `lastSidebar` | 📁 图标 toggle 侧栏 | E2d 已验证 |
| `FactorySlots` | 声明为 settings 插槽消费者 | E2c #19e |
| E3a 多 WebView | 文件树独立进程 + Monaco 独立进程 | E3 |
| `FileDecorationRegistry` | 🔥 **前置——E3f #59b 必须完工** | E3f #59b |
| `PluginStateService` | 🔥 **E4e 状态持久化统一入口** | 已有 |
| `EncodingService` | 🔥 **在核心——file-tree 搜索 + editor 共享** | E4 前置 |
| `setDirty(tabId, bool)` | 🔥 **壳已提供——编辑器消费，不新建命令** | useTabManager |
| `plugins/factory/` + `plugins/market/` 目录分离 | 🔥 **前置——~40 行 loader.ts glob + install 目标** | E4 前置 |
| `closedTabStack` | 🔥 **前置——useTabManager 加 ~10 行** | E4 前置 |

## 完工标准

- 点 📁 图标 → 侧栏显示文件树 → 展开目录 → 看到文件（含虚拟滚动，万级文件不卡）
- 双击 .json/.md/.txt → Monaco 编辑器打开 → 语法高亮 + IntelliSense
- 右键文件 → 18 项菜单完整（MenuRegistry 注册，Git 可注入）→ 重命名/删除/新建/剪切/复制/粘贴/复制路径/在文件管理器中显示/打开方式… 全有
- F2 重命名 → 行内编辑 → Enter 确认 → Esc 取消 → 文件名冲突时提示覆盖
- 设置页 "在文件树中显示 settings.json" → 文件树展开定位 + 高亮 + 滚动到可见区域
- F5 刷新 → 文件树恢复展开状态 + 选中状态 + 滚动位置
- Ctrl+Shift+F → 搜索面板 → 输入关键词 → 跨文件结果树 → 点结果打开编辑器到对应行
- 拖 .json 文件到窗口 → 文件树接收 → 复制到工作区 → 树刷新
- 多工作区 → 两个根文件夹 → 各自独立展开 → 拖放可移动文件跨根

## 历史参考

- 对标 VS Code Explorer + Search + Editor——memory `vscode-source-reference.md`
- 文件树 = 第 5 个工厂插件——memory `file-tree-foundational-plugin.md`
- 工厂插件定义——memory `factory-vs-marketplace-plugins.md`
- 临时 JSON 弹窗退役——memory `settings-json-dialog-temporary.md`
- VS Code 源码阅读方法——memory `vscode-source-reference.md`

---

> **← 上一 Phase：** `../E3_多WebView与壳收尾_暂定/`
> **🏁 E 编号到此为止。** E4 是最后的 E 编号。#83-#121 是最后 39 个有编号的任务。此后全是 `plugin.json` + `index.tsx`。
