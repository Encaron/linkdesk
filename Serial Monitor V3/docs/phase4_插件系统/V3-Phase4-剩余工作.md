# Phase 4 完成记录

> 2026-07-20。对照 [V3-插件系统与UI重构设计.md](V3-插件系统与UI重构设计.md) 逐条审计代码后的完整差距 → 全部修复。
>
> **总计：33 commits，22 项完成，11 个 bug 修复（B36-B46）。**

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

## Phase 4.3 生命周期闭环（2026-07-20）✅

> commit `f9a2570`。安装/卸载/禁用/启用 + 文件监听 P1-5。10 文件 +627/-28。

| 功能 | 说明 |
|------|------|
| Rust `list_plugin_dirs` | 枚举 plugins/ 子目录 |
| Rust `install_plugin` | 复制目录到 plugins/ |
| Rust `uninstall_plugin` | 移到 plugins/.disabled/ |
| `disablePlugin(id)` | 写 prefs + 注销 |
| `enablePlugin(id)` | 清 prefs + 重加载（view 需重启） |
| `uninstallPlugin(id)` | Rust 移目录 + 注销 + toast |
| `installPlugin(path)` | Rust 复制 + 热加载 |
| `startPluginWatcher()` | 2s 轮询 → 真正工作 |
| PluginDetailView 按钮 | 卸载/禁用→可用 |
| MarketplaceSidebar | "已禁用"分区 + 启用按钮 |

### 剩余未闭合

| 项目 | 状态 |
|------|------|
| 插件市场在线搜索 | Phase 6+（需服务端） |
| 插件安全模型 | Phase 5+ |
| Git 插件 | Phase 5+（架构已预留） |
| 个人中心 | Phase 7+（图标栏底部位置已预留） |

---

## Phase 4.4 — 对标 VS Code 消除核心硬编码 🔥🔥🔥

> **核心原则：** VS Code 源码里找不到 `if (extensionId === "...")`。所有 UI 走 contribution points。
> **目标：** 卸载终端 → 图标栏消失 + 侧栏消失 + 主区消失 + 状态栏消失。接新插件无需改核心代码。

### 当前硬编码泄漏点（7 处）

| # | 文件:行 | 硬编码内容 | VS Code 做法 |
|---|---------|-----------|-------------|
| 1 | `StatusBar.tsx:68,80` | `if (item.pluginId === "terminal")` 特殊渲染连接状态+TX/RX | 插件提供 `statusBar.tsx` 组件自己渲染 |
| 2 | `SidePanel.tsx:11,64-67` | `import TerminalSidebar` + `case "terminal"/"workspace"/"settings"` fallback | 侧栏只从 registry 读 `sidebarComponent` |
| 3 | `MainContent.tsx:67,77-93` | `switch(tab.type)` 5 个 per-type fallback | registry 查不到→通用"不可用"占位 |
| 4 | `IconBar.tsx:21-26` | `PLUGIN_ICON_PATH` 硬编码 4 个 ID→图片路径 | 从 `manifest.icon` + `iconSource` 动态读 |
| 5 | `TabBar.tsx:73-74` | "+" 菜单硬编码 "新建终端"/"新建工作台" | 从 `getViewPlugins()` 动态生成 |
| 6 | `useTabManager.ts:147-150` | `getDefaultLabel` switch on TabType | 从 `viewRegistry` 读 `manifest.name` |
| 7 | `App.tsx:24,187,195-196,422` | `ViewId` type + marketplace 特判 + `?? "terminal"` | 无特判 |

### 改动清单

#### Step 1：Terminal 插件自包含
- [ ] **`plugins/terminal/statusBar.tsx`** — 新建。读 `SerialContext` 渲染连接状态 + TX/RX
- [ ] **`plugins/terminal/plugin.json`** — 确保 `icon`/`iconSource` 字段完整

#### Step 2：类型 + 加载器
- [ ] **`core/types.ts`** — `ViewPluginEntry` 加 `statusBarComponent?: React.ComponentType`
- [ ] **`pluginLoader/loader.ts`** — `import.meta.glob` 扫描 `statusBar.tsx` → 动态 `import()` → 注册

#### Step 3：消除核心 7 处硬编码
- [ ] **`StatusBar.tsx`** — 删 `if (pluginId==="terminal")`；有 `statusBarComponent`→渲染组件，没有→静态 label
- [ ] **`SidePanel.tsx`** — 删 `import TerminalSidebar` + 所有 `if (effectiveType===...)`；只留 `getViewPlugin(id)?.sidebarComponent`
- [ ] **`MainContent.tsx`** — 删 `switch(tab.type)`；只保留 welcome/plugin-detail 壳路由，其余走 viewRegistry
- [ ] **`IconBar.tsx`** — 删 `PLUGIN_ICON_PATH`；从 manifest 读：codicon→CSS class，svg→`<img>`，无→`/assets/icons/{id}.png` 兜底
- [ ] **`TabBar.tsx`** — "+" 菜单从 `getViewPlugins()` 动态生成
- [ ] **`useTabManager.ts`** — `getDefaultLabel` 优先查 `viewRegistry`
- [ ] **`App.tsx`** — 删 `ViewId` + marketplace 特判 + `?? "terminal"` → `?? "welcome"`

#### Step 4：图标映射统一
- [ ] **`PluginDetailView.tsx`** — 删 `PLUGIN_ICON`，从 manifest 读
- [ ] **`MarketplaceSidebar.tsx`** — 删 `PLUGIN_ICON_PATH` + `PLUGIN_CODICON`，从 manifest 读

#### Step 5：卸载关闭标签页
- [ ] **`loader.ts`** — `uninstallPlugin`/`disablePlugin` 时 dispatch `plugin-removed` 自定义事件
- [ ] **`App.tsx`** — 监听事件，关闭所有 `tab.pluginId === 被卸载ID` 的标签页

#### Step 6：验证
- [ ] `cargo check` Rust 编译
- [ ] `npx tsc --noEmit` TypeScript
- [ ] `npx vitest run` 109 测试

### 预期效果

**卸载终端前：**
```
┌────┬──────────┬──────────────────────────────┐
│ 📟  │  Terminal │ [📟 COM3]                    │
│ 📊  │  Sidebar  ├──────────────────────────────┤
│ 🧩  │           │ CM6 接收区                    │
│ ⚙   │           │ Monaco 发送栏                  │
├────┴──────────┴──────────────────────────────┤
│ ● COM3 已连接 │ TX:1,234  RX:56,789 │ ☀ 中 🔔 │
└──────────────────────────────────────────────┘
```

**卸载终端后：**
```
┌────┬──────────┬──────────────────────────────┐
│ 📊  │  (空)    │ [欢迎]  LinkDesk              │
│ 🧩  │          ├──────────────────────────────┤
│ ⚙   │          │ 欢迎页                        │
│     │          │                              │
├────┴──────────┴──────────────────────────────┤
│                                    │ ☀ 中 🔔 │
└──────────────────────────────────────────────┘
```
- 📟 图标消失
- 侧栏回到空状态
- 终端标签页自动关闭
- 状态栏终端项（连接状态+TX/RX）消失
- 插件市场终端出现在"已禁用"分区，可重新启用

### 架构预留

| 功能 | 预留方式 |
|------|---------|
| Git 插件 | `plugins/git/` → type: "view"，独立调 invoke，不依赖终端 |
| 个人中心 | IconBar `BOTTOM_ICONS` Set，加一个 ID 即出现在设置上方 |
| 所有插件 | 六类插件接口（view/card/theme/language/protocol/resource）已就绪 |

---

## Phase 4.2 追加 Bug（B42-B46）

### B42：PluginDetailView hooks 顺序不一致 → 白屏
- `useMemo` 在 `if (!pluginId) return` 之后 → hooks 数量随 pluginId 变化。修：所有 hooks 移到条件返回前。（`15ba1b0`）
- **教训：React Rules of Hooks——hooks 永远在组件顶层。**

### B43：图标栏拖拽完全不可用
- 三次尝试：HTML5 DnD → mouse 事件 → click-to-swap → 最终 window 级 mouse + portal 拖影（对标 TabBar）。（`37bcf2e` `d4f51de` `11aa649`）
- 根因：`ordered` 每帧重建 → `useEffect` 每帧重注册 → mousemove 丢失
- **教训：Tauri/WebView2 拖拽 = window 事件 + portal + 全部 ref 避免 effect 重注册。**

### B44：图标栏 300ms 点击延迟
- 计时器区分单击/双击。修：去掉计时器，图标栏只响应单击。（`f7f84bd`）
- **教训：Activity Bar 不需要双击——对标 VS Code 即可。**

### B45：getDefaultLabel 硬编码
- terminal/workspace/settings/marketplace 标签名硬编码。修：优先从 viewRegistry 读 manifest.name。（`117e320`）
- **教训：标签名应是插件数据，不是代码逻辑。**

### B46：CSS 硬编码 hex
- `#e74c3c`、`#cca700`、`#fff` 散落各处。修：统一定义 `--error` / `--warning` / `--badge-text`。（`117e320`）
- **教训：所有颜色走 CSS 变量——硬约束不能放松。**

### B47：npm run dev 持久化竞态
- `_useLocalStorage` 初始 false + `initPrefs()` 异步 → savePrefs 在 init 完成前走 Tauri 路径 → 报错。
- 修：`savePrefs` 先写 localStorage（同步安全），再试探 Tauri。`isTauri()` 加 `window.__TAURI__` 检查防误判。（`50a41fa` `9681c52`）
- **教训：异步初始化期间的安全默认值至关重要。**

### B48：identifier 改名 → 数据丢失
- `com.serial-monitor.v3` → `com.linkdesk.app` → `appDataDir()` 路径变 → 旧 prefs.json 找不到。
- 预期行为，开发期可接受。最终定为 `com.linkdesk.app`。

---

## 品牌重命名（2026-07-20）

| 项 | 旧 | 新 |
|----|----|----|
| 软件名 | Serial Monitor V3 | **LinkDesk** |
| 窗口标题 | Serial Monitor V3 | **LinkDesk** |
| 标识符 | com.serial-monitor.v3 | **com.linkdesk.app** |
| 图标 | 嵌入式风格 | **NodeDesk 六边形三节点** |
| 色调 | #0E639C | **#0078D4** (VS Code 蓝) |
| 欢迎页标题 | Serial Monitor | **LinkDesk** |
| i18n | "serial port" | **"data source"** |
