# E4 — 文件树与 Monaco 编辑器（架构重构版）

> 2026-07-29 重构。**E3 架构封板后 = E4。第一批消费者插件——文件树 + Monaco 编辑器。**
> **2026-07-29 架构重审：** VS Code Explorer 仅文件树 ~5,500 行（6 文件）。E4 旧设计 39 任务 ~2,140 行严重低估。详见 `00.9-Explorer架构重审.md`。
>
> **新结构——按架构层组织，对标 VS Code 源文件分层。**

---

## 文档导航

### 核心文档

| 文档 | 内容 |
|:--|------|
| `06-执行清单.md` | **🔥 唯一真相源。** 从 1 开始编号，7 层 44 任务 |
| `00.5-UI布局规格.md` | CSS token + wireframe + 状态矩阵——**开发前必读** |
| `00.9-Explorer架构重审.md` | VS Code 源码分析 + 8 层差距分析 + 重构建议 |
| [filetree-preview.html](filetree-preview.html) | 🎨 🔥🔥🔥 **AI 进场第一步——浏览器打开看完整 UI 效果** |
| `📦 已归档/` | 旧设计文档（E4a-E4f）——历史参考，不再更新 |

### 架构层设计文档（待建——按需创建）

| 层 | 对标 VS Code | 文档 | 状态 |
|:--|:--|:--|:--:|
| 数据模型 | `explorerModel.ts`（526 行） | `01-数据模型/` | 📋 待建 |
| 视图与渲染 | `explorerViewer.ts`（2,117 行） | `02-视图与渲染/` | 📋 待建 |
| 视图容器 | `explorerView.ts`（1,145 行） | `03-视图容器/` | 📋 待建 |
| 命令系统 | `fileActions.ts`（1,416 行） | `04-命令系统/` | 📋 待建 |
| 配置系统 | `IFilesConfiguration` | `05-配置系统/` | 📋 待建 |

---

## 执行进度——7 层 44 任务

| 层 | 内容 | 任务数 | 完成 | 未完成 |
|:--|------|:--:|:--:|:--:|
| 1-数据模型 | ExplorerItem / FileTreeModel / URI归一化 / pathUtils | 9 | 6 | 3 |
| 2-视图与渲染 | 虚拟滚动 / 节点 / 图标 / 压缩 / 拖放 / 键盘 / CSS | 7 | 7 | 0 |
| 3-视图容器 | 侧栏 / 欢迎视图 / plugin.json / ContextKey | 4 | 3 | 1 |
| 4-命令系统 | 右键菜单 / 快捷键 / Compact修复 / 多选 / 重命名 / 剪贴板 / 命令实现 / 集成接口 | 11 | 2 | 9 |
| 5-文件搜索 | SearchView / FileSearcher / SearchReplace / 导航 | 4 | 0 | 4 |
| 6-工作区与持久化 | Multi-root / 持久化 / 配置清单 / 最近 / revealInOS | 5 | 0 | 5 |
| 7-Monaco编辑器 | React包装 / Encoding / Schema / 标签页 | 4 | 0 | 4 |
| **合计** | | **44** | **18** | **26** |

---

## 涉及架构改动

**接近零。** 全部走 `plugin.json` + React 组件。E1-E3 建的设施已就绪。仅 3 项核心新增（均有准入理由）：

| 新增项 | 位置 | 理由 |
|:--|:--|:--|
| `FileService.copy()` | `src/core/FileService.ts` | 🔥 弥补缺口——拖放/剪贴板依赖 ✅ 已修复 `5f0b9c7` |
| `EncodingService` | `src/core/encoding/EncodingService.ts` | 🔥 多消费方准入——file-tree 搜索 + editor |
| `closedTabStack` | `src/hooks/useTabManager.ts` | 🔥 Ctrl+Shift+T 恢复 |

---

## 完工标准

- 点 📁 图标 → 侧栏显示文件树 → 展开目录 → 看到文件（虚拟滚动，万级不卡）
- 双击 .json/.md/.txt → Monaco 编辑器打开 → 语法高亮 + IntelliSense
- 右键文件 → 15 项菜单完整（MenuRegistry 注册，Git 可注入）
- F2 重命名 → 行内编辑 → Enter 确认 → Esc 取消
- F5 刷新 → 展开/选中/滚动恢复
- Ctrl+Shift+F → 搜索面板 → 跨文件结果
- 拖放文件移动/复制 → OS 拖入 + 树内拖拽

---

> **← 上一 Phase：** `../E3_多WebView与壳收尾_暂定/`
> **🏁 E 编号到此为止。** E4 是最后的 E 编号。
