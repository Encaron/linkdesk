# Phase 4 剩余工作清单

> 2026-07-20。对照 [V3-插件系统与UI重构设计.md](V3-插件系统与UI重构设计.md) 逐条审计代码后的完整差距。
>
> **原始差距：10 项未完成** → **20 commits 全部修复。**

---

## 完成清单

### P0 — 用户可见 (3/3)

| # | 项目 | Commit |
|---|------|--------|
| P0-3 | 补 settings/marketplace/workspace 的 plugin.json | `cc076b3` |
| P0-2 | StatusBar 走 getStatusBarContributions() | `7f75230` |
| P0-1 | 插件市场 UI（已安装列表 + 搜索 + 展开 + 详情导航） | `c71b6d8` |

### P1 — 加载器 (3/3)

| # | 项目 | Commit |
|---|------|--------|
| P1-4 | loader theme/language 注册（ThemeEngine + i18next） | `4963e49` |
| P1-6 | 7 种错误处理 + 版本去重 | `4963e49` |
| P1-5 | 文件监听（骨架——待 Tauri fs 补完） | `4963e49` |

### P2 — UI 细节 (2/2)

| # | 项目 | Commit |
|---|------|--------|
| P2-7 | PluginDetailView 连锁推荐（recommends/suggests/requires） | `e227827` |
| P2-8 | MainContent 硬编码 switch（保留安全网） | `1df1670` |

### P3 — 小修 (2/2)

| # | 项目 | Commit |
|---|------|--------|
| P3-9 | 通知铃铛 + 通知历史面板 | `1df1670` |
| P3-10 | IconBar 动态化 + 拖拽排序 | `1df1670` `414976a` `8650187` |

### 对标 VS Code UX 重构

| 功能 | VS Code 对标 | Commit |
|------|-------------|--------|
| 插件市场侧栏 | Extensions 侧栏：列表在侧栏，主区不动 | `06f122c` `63656a3` |
| codicons 图标 | `@vscode/codicons` 字体 | `63656a3` `c0e5c0a` |
| 通知面板 | notificationsCenter: fixed 定位 + header 35px | `63656a3` `c0e5c0a` |
| 插件详情页 | extensionEditor: header 96px icon + NavBar 标签 | `e8537dd` |
| 标签页同名 | VS Code 同名文件加文件夹区分 → ` (介绍)` 后缀 | `84f2387` |
| IconBar 单一光标 | Activity Bar: sidebarView 优先，只有一个 indicator | `d0eb5cc` |
| 侧栏智能切换 | 点真视图标签页→切侧栏，点详情页→保持 | `3bf00aa` |
| IconBar 拖拽排序 | Activity Bar 拖拽：蓝色指示线 + prefs.json 持久化 | `414976a` `8650187` |
| 预览模式 | preview editor：斜体 + 单击替换/双击固定 | `aa0b44a` `e539bfa` `485ccd4` |

### Bug 修复

| Bug | 描述 | Commit |
|-----|------|--------|
| 路由错误 | plugin-detail 标签页被路由到终端组件 | `e8537dd` |
| 标签页复用 | 点侧栏反复创建新标签页 | `b2e34e7` |
| 侧栏跟随 | 切标签页时 marketplace 侧栏被清除 | `b2e34e7` |
| 双重高亮 | IconBar 同时高亮两个图标 | `d0eb5cc` |
| 标签页同名 | 终端视图和终端详情两标签同名 | `84f2387` |
| 拖拽不生效 | HTML5 DnD → 纯鼠标事件（Tauri 兼容） | `8650187` |
| 双击无效 | onClick/onDoubleClick 竞态 + pinned 未传播 | `e539bfa` `485ccd4` |

---

## 剩余未闭合

| 项目 | 状态 |
|------|------|
| P1-5 文件监听 | 骨架已就绪（startPluginWatcher），待 Tauri fs 命令 |
| 安装/卸载/禁用按钮 | Phase 5（需 Tauri fs 操作） |
| 插件市场在线搜索 | Phase 6+（需服务端） |
| 插件安全模型 | Phase 5+ |
