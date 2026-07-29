# E4 — 文件树与 Monaco 编辑器（v2 重构版）

> 2026-07-29 重构→v2 重写。**E3 架构封板后 = E4。第一批消费者插件——文件树 + Monaco 编辑器。**
> **2026-07-29 架构重审：** VS Code Explorer 仅文件树 ~5,500 行（6 文件）。v1 39 任务 ~2,140 行严重低估。v2 重构为 42 任务按依赖链线性排列。
>
> **新结构——按架构层组织 + 唯一真相源 = `06-执行清单.md`（v2——18 轮 47 任务）。**
> ⚠️ 任务编号 `E4V#1–E4V#47` 独立于已完成的旧 `E4 #83–#95`（执行历史不冲突）。

---

## 文档导航

### 核心文档

| 文档 | 内容 |
|:--|------|
| `06-执行清单.md` | **🔥 唯一真相源。** 47 任务线性排列 + 致命 bug 速查 |
| `00.5-UI布局规格.md` | CSS token + wireframe + 状态矩阵——**开发前必读** |
| `00.9-Explorer架构重审.md` | VS Code 源码分析 + 8 层差距——**理解为什么这样做** |
| [filetree-preview.html](filetree-preview.html) | 🎨 🔥🔥🔥 **AI 进场第一步——浏览器打开看完整 UI 效果** |
| `📦 已归档/` | 旧设计文档（E4a-E4f + v1 清单）——历史参考，不再更新 |

### 专题设计文档

| 专题 | 文档 | 说明 |
|:--|:--|:--|
| 数据模型 | `01-数据模型/` | FileTreeModel + ExplorerItem |
| 树渲染器 | `02-视图与渲染/01-树渲染器.md` | FileTree + FileTreeNode |
| 压缩控制器 | `02-视图与渲染/02-压缩控制器.md` | 🔴 CompactFolder Bug A/B/C + 修复方案 |
| 过滤器 | `02-视图与渲染/03-过滤器.md` | FileExcludeFilter |
| 拖放系统 | `02-视图与渲染/05-拖放系统.md` | 🔴 OS 拖入递归嵌套 + executeSafeDrop |
| 侧栏容器 | `03-视图容器/01-侧栏与面包屑.md` | sidebar.tsx + ViewContainer 约束 |
| Context Key | `03-视图容器/02-ContextKey矩阵.md` | 🔴 14+ key 对标 + 阻塞分析 |
| 命令规范 | `04-命令系统/01-命令ID规范.md` | 16 命令 ID + 命名规范 |
| 文件操作 | `04-命令系统/02-文件操作命令.md` | newFile/delete/rename handler |
| 导航命令 | `04-命令系统/03-导航命令.md` | revealInExplorer/openToSide |
| 右键菜单 | `04-命令系统/04-右键菜单贡献.md` | FileContext 菜单结构 |
| 菜单栏 | `04-命令系统/05-菜单栏贡献.md` | MenuBar 对标 VS Code |
| 配置系统 | `05-配置系统/01-配置项清单与归属.md` | 20+ 配置项归属 |

---

## 执行进度——18 轮 47 任务

| 轮次 | 内容 | 任务 | 完成 | 状态 |
|:--|------|:--:|:--:|:--:|
| R1 | 🔴 安全——递归数据损毁 | E4V#1-E4V#3 | 0/3 | 🔴 先修 |
| R2 | 🔴 CompactFolder 三合一 | E4V#4-E4V#6 | 0/3 | 🔴 先修 |
| R3 | 数据模型扩展 | E4V#7-E4V#11 | 0/5 | |
| R4 | 🔴 Context Key 解阻塞 | E4V#12-E4V#13 | 0/2 | 🔴 先修 |
| R5 | 剪贴板服务 | E4V#14 | 0/1 | |
| R6 | UI 对齐 VS Code | E4V#15-E4V#16 | 0/2 | |
| R7 | 简单命令 handler | E4V#17-E4V#19 | 0/3 | |
| R8 | 新建文件/文件夹 | E4V#20 | 0/1 | |
| R9 | 多选 | E4V#21-E4V#23 | 0/3 | |
| R10 | 编辑命令 handler | E4V#24-E4V#26 | 0/3 | |
| R11 | 行内重命名 | E4V#27 | 0/1 | |
| R12 | 打开文件 | E4V#28-E4V#29 | 0/2 | |
| R13 | 定位与装饰 | E4V#30-E4V#31 | 0/2 | |
| R14 | ViewContainer——侧栏桌子化 | E4V#32-E4V#36 | 0/5 | 🔴 必须做 |
| R15 | 集成 | E4V#37-E4V#39 | 0/3 | |
| R16 | Multi-root 工作区 | E4V#40-E4V#41 | 0/2 | |
| R17 | 文件搜索 | E4V#42-E4V#44 | 0/3 | |
| R18 | Monaco 编辑器 | E4V#45-E4V#47 | 0/3 | |
| **合计** | | **47** | **0** | |

---

## 涉及架构改动

**接近零。** 全部走 `plugin.json` + React 组件。E1-E3 建的设施已就绪。仅 3 项核心新增（均有准入理由）：

| 新增项 | 位置 | 理由 |
|:--|:--|:--|
| `FileService.copy()` | `src/core/FileService.ts` | 🔥 弥补缺口——拖放/剪贴板依赖 ✅ 已修复 `5f0b9c7` |
| `EncodingService` | `src/core/encoding/EncodingService.ts` | 🔥 多消费方准入——file-tree 搜索 + editor |
| `closedTabStack` | `src/hooks/useTabManager.ts` | 🔥 Ctrl+Shift+T 恢复 ✅ |

---

## 完工标准

- 点 📁 图标 → 侧栏显示文件树 → 展开目录 → 看到文件（虚拟滚动，万级不卡）
- 双击 .json/.md/.txt → Monaco 编辑器打开 → 语法高亮 + IntelliSense
- 右键文件 → 15 项菜单完整（MenuRegistry 注册，Git 可注入）
- F2 重命名 → 行内编辑 → Enter 确认 → Esc 取消
- F5 刷新 → 展开/选中/滚动恢复
- Ctrl+Shift+F → 搜索面板 → 跨文件结果
- 拖放文件移动/复制 → OS 拖入 + 树内拖拽（executeSafeDrop 归一化）

---

> **← 上一 Phase：** `../E3_多WebView与壳收尾_暂定/`
> **🏁 E 编号到此为止。** E4 是最后的 E 编号。
