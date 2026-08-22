# 插件市场美化 — E3.5 生态美化

> 2026-07-29 启动。E3.5 并行轨道第三个专题——插件市场全量 UI/UX 审计与整改。
> 范围：侧栏列表、插件详情页。UI 边界判定、布局、配色、图标、动效、无障碍。不改操作逻辑。
> **⚠️ MarketplaceView 引导页无法到达（三栏设计——点图标只激活侧栏），不纳入审计。**

## 架构总览

插件市场由两个可达 UI 表面组成（主区 MarketplaceView 引导页永远不可达）：

```
┌─ MarketplaceSidebar（侧栏 280px）──┬─ MainContent（主区）──────────────┐
│                                    │                                  │
│  [+ 安装]                          │  MarketplaceView（引导页）        │
│  [🔍 搜索插件...              ]    │  ┌────────────────────────────┐  │
│                                    │  │       🧩                    │  │
│  ── 已安装 (3) ──                  │  │    插件管理                 │  │
│  │ 🎨 默认主题    v1.0.0          │  │  已安装 9 个插件            │  │
│  │   提供亮色/暗色两套主题   ⚙    │  │  在左侧侧栏中浏览...        │  │
│  │ 🔌 串口监视器  v1.0.0          │  └────────────────────────────┘  │
│  │   ...                      ⚙    │                                  │
│  │ ...                             │  PluginDetailView（插件详情）    │
│  ── 内置 (6) ──                    │  ┌────────────────────────────┐  │
│  │ ...                     ⚙      │  │ [icon] 插件名  v1.0.0       │  │
│  ── 已禁用 (1) ──                  │  │ 作者 | 描述                 │  │
│  │ ...                     ▶      │  │ [禁用] [卸载]               │  │
│  ── 待安装 (1) ──                  │  │ ─────────────────────────  │  │
│  │ ...                     安装    │  │ [详情] [更新日志]           │  │
│                                    │  │ ...详细信息...              │  │
│                                    │  └────────────────────────────┘  │
└────────────────────────────────────┴──────────────────────────────────┘
```

## 文件清单

| 文件 | 行数 | 职责 |
|------|------|------|
| `plugins/marketplace/src/index.tsx` | 35 | ⚠️ **死代码**——主区引导页，永远不可达 |
| `plugins/marketplace/src/sidebar.tsx` | 552 | **侧栏列表**——搜索 + 四分区（已安装/内置/已禁用/待安装）+ 齿轮菜单 |
| `plugins/marketplace/src/MarketplaceView.css` | 276 | ⚠️ **死代码**——引导页样式，大部分未使用 |
| `plugins/marketplace/src/MarketplaceSidebar.css` | 360 | 侧栏——header/搜索框/分区标题/插件项/齿轮按钮/安装按钮 |
| `src/components/views/PluginDetailView.tsx` | 395 | **插件详情页**——Header + ActionBar + TabBar + Details/Changelog |
| `src/components/views/PluginDetailView.css` | 410 | 详情页全部样式——header/按钮/navbar/信息侧栏/推荐列表/changelog |

## 设计 DNA（现有）

- **对标 VS Code Extensions 面板**——分区折叠、搜索过滤、齿轮菜单、单击预览/双击固定
- **配色**：CSS 变量覆盖（`var(--bg-card)` / `var(--accent)` / `var(--text-muted)` 等）
- **字体**：系统默认（Inter / system-ui），版本号/ID 用 monospace
- **插件图标**：三态——codicon 字体图标 / emoji / 自定义图片（`PluginIcon` 组件）
- **Hover 操作**：`opacity: 0 → 1` 渐变揭示齿轮按钮
- **单击/双击**：300ms 计时器区分——单击预览，双击固定

## 整改方向

参见：
- [01-全量审计.md](./01-全量审计.md) — 问题清单
- [02-设计方向.md](./02-设计方向.md) — 设计决策与整改方案

## 整体预览

👉 **[preview-整改预览.html](./preview-整改预览.html)** — 浏览器打开，右上角切换暗色/浅色主题。左侧 MarketplaceSidebar + 右侧 PluginDetailView，展示整改后全貌 + 底部整改对照表。
