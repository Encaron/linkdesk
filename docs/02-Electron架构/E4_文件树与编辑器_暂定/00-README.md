# E4 — 文件树与 Monaco 编辑器（v2 重构版）

> 2026-07-29 重构→v2 重写。**E3 架构封板后 = E4。第一批消费者插件——文件树 + Monaco 编辑器。**
> **2026-07-29 架构重审：** VS Code Explorer 仅文件树 ~5,500 行（6 文件）。v1 39 任务 ~2,140 行严重低估。v2 重构为 42 任务按依赖链线性排列。
>
> **新结构——按架构层组织 + 唯一真相源 = `06-执行清单.md`（v2——17 轮 42 任务）。E3.6 已覆盖 ViewContainer 层。**
> ⚠️ 任务编号 `E4V#1–E4V#42` 独立于已完成的旧 `E4 #83–#95`（执行历史不冲突）。

---

## 文档导航

### 核心文档

| 文档 | 内容 |
|:--|------|
| `06-执行清单.md` | **🔥 唯一真相源。** 42 任务线性排列 + 致命 bug 速查 |
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

## 执行进度——20 轮 130 任务

> **E3.6 已完成：** ViewContainerService 桌子 + SidePanel 渲染循环 + 三插件迁移。
> R6/R8/R14 的 sidebar 相关任务基于 E3.6 架构，不返工。

| 轮次 | 内容 | 任务 | 完成 | 状态 |
|:--|------|:--:|:--:|:--:|
| R1 | 🔴 安全——递归数据损毁 | E4V#1-#3 +PRE +1b +Test3 | 7/7 | ✅ 2026-07-31 |
| R2 | 🔴 CompactFolder 三合一 | E4V#4-E4V#6 +6a +Test2 | 5/5 | ✅ 2026-07-31 |
| R3 | 数据模型扩展 + 配置接线 | E4V#7-E4V#11 + E4V#8a | 6/6 | ✅ 2026-07-31 |
| R4 | 🔴 Context Key 解阻塞 | E4V#12-E4V#13 | 2/2 | ✅ 2026-07-31 |
| R5 | 剪贴板服务 | E4V#14 | 1/1 | ✅ 2026-07-31 |
| R6 | UI 对齐 VS Code | E4V#15-E4V#16 | 2/2 | ✅ 2026-07-31 🔥 E4V#15b 已放弃 |
| R7 | 简单命令 handler | E4V#17-E4V#19 | 3/3 | ✅ 2026-07-31 |
| R8 | 新建文件/文件夹 + sticky（❌放弃）| E4V#20a–h | 21/28 | ✅ 功能完成，sticky 7 子项废弃 |
| R9 | 多选 | E4V#21-E4V#23 | 3/3 | ✅ 2026-08-01 |
| R10 | 编辑命令 handler | E4V#24-E4V#26 | 3/3 | ✅ 2026-08-01 |
| R11 | 行内重命名 | E4V#27 | 1/1 | ✅ 2026-08-01 |
| R12 | 打开文件 + 点击交互归一化 | E4V#28-E4V#29 + E4V#28a-e | 7/7 | ✅ 2026-08-01 |
| R13 | 定位与装饰 | E4V#30-E4V#31 | 2/2 | ✅ 2026-08-01 |
| R14 | 集成 | E4V#32-E4V#34k | 8/8 | ✅ 2026-08-01 |
| R15 | 🔥 活跃工作区 + Multi-root | E4V#35a-h + E4V#36a-c | 8/9 | ✅ 代码完成，E4V#35h 待 UI 验证 |
| R16 | 文件搜索 | E4V#37a-d + E4V#38 + E4V#39a-c | 8/8 | ✅ 2026-08-02 全部完成（含 Encaron UAT） |
| R17 | 🔥 Monaco 编辑器（🆕 22 任务）| E4V#40a–40w | 0/22 | ⬜ 准备开始 |
| R17.5 | 🛡️ vitest 防线 | E4V#Test1–Test5 | 2/5 | Test2 ✅ Test3 ✅ |
| R18 | ViewContainer 交互对齐 VS Code | E4V#43-E4V#50 | 0/8 | |
| R19 | 图标主题 | E4V#51-E4V#54 | 0/4 | |
| R19.5 | 🔧 响应式重构 + IPC隔离 + 路径归一化 | E4V#55/56/59/60 | 28/28 | ✅ 2026-08-02 |
| 🆕 | E4V#58 根文件夹列表 | E4V#58a-e | 0/5 | ⬜ |
| **合计** | | **130** | **95** | R15+R16 完成，R17 22 任务待开工 |

---

## 涉及架构改动

**接近零。** 全部走 `plugin.json` + React 组件。E1-E3 建的设施已就绪。仅 3 项核心新增（均有准入理由）：

| 新增项 | 位置 | 理由 |
|:--|:--|:--|
| `FileService.copy()` | `src/core/FileService.ts` | 🔥 弥补缺口——拖放/剪贴板依赖 ✅ 已修复 `5f0b9c7` |
| `EncodingService` | `src/core/encoding/EncodingService.ts` | 🔥 多消费方准入——file-tree 搜索 + editor |
| `closedTabStack` | `src/hooks/useTabManager.ts` | 🔥 Ctrl+Shift+T 恢复 ✅ |
| `monaco-languageclient` | `node_modules/` npm 依赖 | 🔥 语言插件 LSP 桥接——为 C/C++/Python 预留 ✅ 已安装 |

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
