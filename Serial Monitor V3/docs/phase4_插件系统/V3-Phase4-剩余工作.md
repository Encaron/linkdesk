# Phase 4 完成记录

> 2026-07-20。对照 [V3-插件系统与UI重构设计.md](V3-插件系统与UI重构设计.md) 逐条审计代码后的完整差距 → 全部修复。
>
> **总计：28 commits，22 项完成，6 个 bug 修复。**

---

## 完成清单

### 初始差距 (10 项 → 全部完成)

| # | 项目 | Commit |
|---|------|--------|
| P0-3 | 补 settings/marketplace/workspace 的 plugin.json | `cc076b3` |
| P0-2 | StatusBar 走 getStatusBarContributions() | `7f75230` |
| P0-1 | 插件市场 UI（已安装列表 + 搜索 + 详情导航） | `c71b6d8` |
| P1-4 | loader theme/language 注册（ThemeEngine + i18next） | `4963e49` |
| P1-6 | 7 种错误处理 + 版本去重 | `4963e49` |
| P1-5 | 文件监听（骨架——待 Tauri fs 补完） | `4963e49` |
| P2-7 | PluginDetailView 连锁推荐（recommends/suggests/requires） | `e227827` |
| P2-8 | MainContent 硬编码 switch（保留安全网） | `1df1670` |
| P3-9 | 通知铃铛 + 通知历史面板 | `1df1670` |
| P3-10 | IconBar 动态化 + 拖拽排序 | `1df1670` `414976a` `8650187` |

### 对标 VS Code UX 重构

| 功能 | Commit |
|------|--------|
| 插件市场侧栏 | `06f122c` `63656a3` |
| codicons 字体图标 | `63656a3` `c0e5c0a` |
| 通知面板（fixed 定位） | `63656a3` |
| 插件详情页（extensionEditor） | `e8537dd` |
| 标签页同名区分（` (介绍)` 后缀） | `84f2387` |
| IconBar 单一蓝色光标 | `d0eb5cc` |
| 侧栏智能切换 | `3bf00aa` |
| IconBar 拖拽排序 | `414976a` `8650187` |
| 预览模式（斜体 + 单击替换/双击固定） | `aa0b44a` `e539bfa` `485ccd4` `44cb9ea` |
| 双击图标固定 | `6127cef` |
| 设置图标固定左下角 | `554e1f8` |
| 标签栏 VS Code tab sizing（fit 120→shrink 80→overflow scroll） | `bcec6ae` |
| 标签栏字体适配（min-width/font-size） | `ae0d18b` `048a6f4` |

---

## Bug 记录

### B36：Tauri v2 fs 插件持久化失败

**现象：** 快捷发送、图标顺序、布局等所有设置重启后丢失。

**根因：** Tauri v2 双权限体系——`capabilities/default.json` 只有 `core:default`，缺 `fs:default` 权限。fs 插件注册了但 IPC 命令被静默拒绝。

**修复：** `capabilities/default.json` 加 `fs:default` + `fs:allow-app-read-recursive` + `fs:allow-app-write-recursive`。（`9687a36`）**注意：**`tauri.conf.json` 的 `plugins.fs.scope` 是非法字段，报 `PluginInitialization` panic，不能用。（`d39200f`）

### B37：plugin-detail 标签页路由到终端组件

**现象：** 侧栏点"终端"→主区跳到终端收发页，不是详情页。

**根因：** `renderTabContent` 先查 `tab.pluginId`，plugin-detail 的 pluginId="terminal" 匹配到终端插件。

**修复：** plugin-detail 和 welcome 提前于插件路由判断。（`e8537dd`）

### B38：标签页同名导致的 IconBar 双重高亮

**现象：** 终端视图标签页和终端详情标签页都叫"终端"，图标栏同时高亮 📟 和详情页对应图标。

**根因：** plugin-detail 的 `pluginId`="terminal" 污染了 IconBar 的 `activePluginId` 检查。

**修复：** 分离 `detailPluginId`——plugin-detail 标签页不设 pluginId，用 detailPluginId 传目标插件。（`84f2387`）

### B39：侧栏跟着标签页切换跳走

**现象：** 打开 marketplace 侧栏后，点终端标签页→侧栏跳到终端设置。

**根因：** `useEffect` 在 `activeTabType` 变化时自动清除 `sidebarView`。

**修复：** 对标 VS Code——侧栏由 Activity Bar 图标控制，不随编辑器标签页变化。（`b2e34e7`）

### B40：双击侧栏插件不固定

**现象：** 侧栏双击插件→标签页仍是斜体预览，下次点别的还会被替换。

**根因：** 预览替换时只更新了 `detailPluginId` 和 `label`，没有同步传播 `opts.pinned`。

**修复：** `reduceCreateTab` 替换逻辑加 `pinned: opts.pinned === true ? true : existing.pinned`。（`485ccd4`）

### B41：标签栏字体被切

**现象：** "欢迎"的"迎"、"终端"的"端"右边被盖住。

**根因：** 旧 `min-width: 80px`，去掉 padding/icon/gap/关闭按钮后只剩 ~20px 给文字，中文 13px 单字 ~13px 刚好溢出。

**修复：** 对标 VS Code `fit(120px) → shrink(80px)`，加 CSS flex-shrink 让它自动缩放。`min-width: 80px; flex: 0 1 120px`。（`048a6f4` `bcec6ae`）

---

## 剩余未闭合

| 项目 | 状态 |
|------|------|
| P1-5 文件监听 | 骨架就绪，待 Tauri fs 命令 |
| 安装/卸载/禁用按钮 | Phase 5（需 Tauri fs 操作） |
| 插件市场在线搜索 | Phase 6+（需服务端） |
| 插件安全模型 | Phase 5+ |
| Git 插件 | Phase 5+（架构已预留） |
| 个人中心 | Phase 7+（图标栏底部位置已预留） |

---

## 架构预留（从本轮讨论确认）

| 功能 | 预留方式 |
|------|---------|
| Git 插件 | `plugins/git/` → type: "view"，独立调 invoke，不依赖终端 |
| 个人中心 | IconBar `BOTTOM_ICONS` Set，加一个 ID 即出现在设置上方 |
| 所有插件 | 六类插件接口（view/card/theme/language/protocol/resource）已就绪 |
