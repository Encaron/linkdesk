# Phase 4 剩余工作清单

> 2026-07-20。对照 [V3-插件系统与UI重构设计.md](V3-插件系统与UI重构设计.md) 逐条审计代码后的完整差距。
>
> **审计方法：** 通读设计文档全部 11 章 → 逐文件检查 `src/` + `plugins/` → 对照代码行。
>
> **总计：10 项未完成**（设计 Steps 1-4 估 ~600 行，实际完成约 60%）

---

## 概览

```
完成度：约 60%
├── ✅ 核心基础设施（加载器/viewRegistry/toast/欢迎页/终端插件化）— 完成
├── ❌ 插件市场 UI — 整个空白（stub）
├── ❌ 状态栏贡献点框架 — 代码有，StatusBar 不用
├── ❌ 连锁推荐 UI — 完全没做
├── ❌ loader 完整性 — 缺校验/注册/监听
└── ❌ settings/marketplace 没有 plugin.json，仍是硬编码
```

---

## P0 — 用户可见的功能空白（3 项）

### 1. 插件市场 UI 整个空白

**现状：** [MainContent.tsx:86](../../src/components/MainContent.tsx#L86)
```tsx
case "marketplace":
  return <div>插件管理 — Phase 5</div>;
```

**设计要求（§5）：**
- 侧栏插件列表：已安装 / 可安装分类
- 搜索过滤
- 安装 / 卸载 / 禁用按钮
- 拖 `.v3p` 文件离线安装
- 图标栏 🧩 → 侧栏切换为插件列表

**涉及文件：**
- `src/components/MainContent.tsx` — 替换 marketplace stub
- `src/components/SidePanel.tsx` — marketplace 侧栏返回 null，需补
- 新建：`src/components/views/MarketplaceView.tsx` 或侧栏组件

---

### 2. StatusBar 不走贡献点框架

**现状：** `viewRegistry.getStatusBarContributions()` 已实现，`terminal/plugin.json` 已声明 statusBar 条目——但 StatusBar.tsx 全部硬编码 props（isOpen/txBytes/rxBytes/theme/lang），完全不调贡献点。

**设计要求（§3.6）：**
> 状态栏从左到右渲染——核心全局项（中:EN、☀、🔔）→ 插件贡献项（按加载顺序）

**涉及文件：** `src/components/StatusBar.tsx`

---

### 3. settings/workspace/marketplace 缺 plugin.json

**现状：** `plugins/` 下只有 `terminal/` 一个插件文件夹。设计 §2 要求：
- `settings` — `"core": true` 核心控制面，不可卸载
- `marketplace` — `"core": true` 核心控制面，不可卸载
- `workspace` — 出厂预装，可卸载

这三者目前靠 MainContent switch 硬编码渲染，不经过 viewRegistry。

**涉及文件：**
- 新建 `plugins/settings/plugin.json`
- 新建 `plugins/marketplace/plugin.json`
- 新建 `plugins/workspace/plugin.json`
- `src/components/MainContent.tsx` — 消除 switch 回退
- `src/components/IconBar.tsx` — 消除 BUILTIN_ICONS 硬编码

---

## P1 — 加载器不完整（3 项）

### 4. theme/language 注册是空壳

**现状：** [loader.ts:96-100](../../src/pluginLoader/loader.ts#L96-L100)
```typescript
case "theme":
case "language":
  console.log(`[pluginLoader] ${manifest.type} 插件 "${pluginId}" — Phase 4 预留`);
  break;
```

**设计要求（§4 Step 1）：**
- `type: "theme"` → `ThemeEngine.register()`
- `type: "language"` → `i18next.addResourceBundle()`
- 支持 `themes` / `languages` 数组（一个插件包多个子条目）

**涉及文件：**
- `src/pluginLoader/loader.ts`
- `src/core/ThemeEngine.ts`（确认 register 接口）

---

### 5. 文件监听未实现

**现状：** 插件只在 App 启动时 `initPluginLoader()` 一次，无 Tauri fs watch。

**设计要求（§4 "文件监听与热加载"）：**
- Tauri fs watch `plugins/` 目录
- 新增/修改 JSON 插件 → 即时生效
- `.tsx` 插件变更 → toast 提示重启
- `.v3p` 拖入 → 解压 + 加载

**涉及文件：** `src/pluginLoader/loader.ts`（新增 watch 逻辑）

---

### 6. 7 种错误处理缺 5 种

**现状：** loader 只做了"缺 type"+"缺 entry"两种检查。

**设计要求（§4 "校验与错误处理"）：**

| # | 错误类型 | 要求行为 | 现状 |
|---|---------|---------|------|
| 1 | plugin.json 不存在 | 跳过，日志 | 隐式（glob 不匹配）|
| 2 | plugin.json 格式错误 | 跳过，toast | ❌ 未处理 |
| 3 | 缺少 type | 跳过 | ✅ |
| 4 | type 未知 | 跳过 | 只 console.log，无 toast |
| 5 | 缺少 entry | 跳过，toast | ✅ |
| 6 | minAppVersion > 当前版本 | 跳过，标记"需升级" | ❌ |
| 7 | 同名插件重复 | 优先高版本，toast | ❌ |

另外缺 JSON Schema 校验（`plugin.schema.json` 已存在但 loader 不用）。

**涉及文件：** `src/pluginLoader/loader.ts`

---

## P2 — UI 细节缺失（2 项）

### 7. PluginDetailView 无连锁推荐

**现状：** `PluginManifest` 类型定义了 `recommends` / `suggests` / `requires`，详情页完全不渲染。也没有安装/卸载按钮。

**设计要求（§6.1-6.5）：**
- 推荐/可选/依赖区域，带勾选框
- 安装按钮 → 下载主插件 + 勾选的推荐插件
- 卸载时检查反向推荐 → 警告弹窗
- 循环推荐检测

**涉及文件：** `src/components/views/PluginDetailView.tsx`

---

### 8. MainContent 仍 switch on type

**现状：** [MainContent.tsx:66-89](../../src/components/MainContent.tsx#L66-L89) — 查不到 viewRegistry 时回退到 8 路 switch（terminal/workspace/settings/oled/editor/welcome/plugin-detail/marketplace）。

其中 settings/workspace 应该走 viewRegistry（补 plugin.json 后），marketplace 需替换为空白的 MarketplaceView。

**涉及文件：** `src/components/MainContent.tsx`

---

## P3 — 小修小补（2 项）

### 9. 通知铃铛图标未实现

**设计要求（§3.5）：** 状态栏右侧 🔔 显示未读计数，点击弹出通知历史面板（最近 20 条）。

**涉及文件：** `src/components/StatusBar.tsx`、`src/core/toast.ts`

---

### 10. IconBar 出厂图标硬编码

**现状：** `BUILTIN_ICONS` 写死 4 个图标路径，`getPluginEmoji()` 硬编码 emoji 映射——都不读 manifest.icon / manifest.iconSource。

补完 P0-3（settings/marketplace/workspace 的 plugin.json）后，这个可以一并消除。

**涉及文件：** `src/components/IconBar.tsx`

---

## 修复顺序建议

| 顺序 | 项目 | 理由 |
|:--:|------|------|
| 1 | P0-3: 补 plugin.json（settings/marketplace/workspace） | 纯 JSON，不改逻辑，为后续消除硬编码打基础 |
| 2 | P0-2: StatusBar 走贡献点框架 | 改动小，效果明显 |
| 3 | P1-4/5/6: loader 补完 | theme/language 注册 + 7 错误 + 文件监听 |
| 4 | P0-1: 插件市场 UI | 工作量最大，但设计已完备 |
| 5 | P2-7: 连锁推荐 | PluginDetailView 补 recommends/suggests/requires |
| 6 | P2-8/P3-9/10: 去硬编码残留 | 收尾 |

---

## 不在 Phase 4 范围的（设计 Steps 5-9）

以下在设计 §10 中标注为"依赖 Phase 5/6+"，本次不修：

- Step 5: 卡片 + 协议插件加载（~80 行）
- Step 6: 插件市场在线搜索/社区商店（~400 行）——注：本地管理（已安装/可安装/拖.v3p）属于 Phase 4
- Step 7: 插件连锁推荐完整流程（~100 行）
- Step 8: 数据源插件（~200 行，Rust 侧重构）
- Step 9: 插件安全模型（~80 行）
- §8.5: Profile 配置文件（远期）
- §8: 沙箱/进程隔离（Phase 8+）
