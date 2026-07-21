# Phase 5h — 运行时动态加载

> 2026-07-21。取代 `import.meta.glob`，插件安装/卸载/启用/禁用全部即时生效，不刷新页面。
> Phase 5 的收官之战——之后 Phase 6/7/8 零框架改动。

---

## 〇、"黑箱"澄清

用户记忆中的讨论是关于 **VS Code Extension Host 模型**（独立进程沙箱，插件只能用 `vscode.*` API）vs **V3 同 WebView 模型**（插件和核心在同一个 JS 上下文，没有 API 白名单）。

**5h 不改变这个架构。** 5h 只改一件事：怎样把 JS bundle 加载进 WebView——从 `import.meta.glob`（构建时静态打包）换成运行时动态 `import()`。插件照样能 `import Leaflet`、`import THREE.js`、用 `<iframe>`/`<video>`——完整的 Web API 自由。

| | VS Code Extension Host | V3 当前 | V3 5h 后 |
|---|---|---|---|
| 进程隔离 | ✅ 独立进程 | ❌ 同 WebView | ❌ 同 WebView（不变） |
| API 限制 | `vscode.*` 白名单 | 无限制 | 无限制（不变） |
| 安装体验 | 即时生效 + toast | 全屏刷新 | 即时生效 + toast |
| 自由度 | 受限（"黑箱"） | 完全自由 | 完全自由（不变） |

**结论：5h 把 VS Code 的安装体验拿过来，但不要它的进程隔离限制。取长补短。**

---

## 一、当前状态 vs 5h 后

### 当前链路

```
用户安装插件
  → Rust 复制文件到 plugins/
  → loadPlugin() 检查 manifest 是否在 import.meta.glob 中
      ├── 在 glob 中（出厂预装）→ loadPlugin() 即时注册
      │     └── ⚠️ IconBar 不响应式——新图标可能不显示，等下次渲染
      └── 不在 glob 中（真正外部装）→ toast "重启后生效" [立即重启]
            └── 用户点 → window.location.reload()
                  ├── COM 口断开 ❌
                  ├── 标签页从 LayoutService 恢复（四轮持久化 bug 路径）
                  └── 新插件图标出现
```

### 5h 后链路

```
用户安装插件
  → Rust 复制文件到 plugins/
  → 文件监听器检测新目录 → 读 plugin.json
  → 动态 import(plugin://<id>/index.js) 加载 JS bundle
  → window.__v3_registerPlugin(manifest, exports) → 走和现在相同的注册路径
  → IconBar 响应式刷新 → 图标即时出现 ✅
  → toast "已安装：XXX"（无 [立即重启] 按钮）✅
  → 全程不刷新、COM 口不断 ✅
```

---

## 二、利弊总表

| 维度 | 当前（保留） | 5h（运行时加载） |
|---|---|---|
| **安装体验** | ❌ 重启 → 丢失所有运行时状态 | ✅ 即时生效，零中断 |
| **COM 口连续性** | ❌ 每次装插件断串口 | ✅ 不断 |
| **多插件连续安装** | ❌ 装 N 个 = 重启 N 次 | ✅ 装一个用一个 |
| **代码复杂度** | ✅ 简单——`import.meta.glob` 就 5 行 | ❌ +~400 行（独立构建/协议/运行时加载） |
| **构建复杂度** | ✅ 一次 `vite build` | ❌ N+1 次构建 + dev watch |
| **旧 bug 复生** | ✅ 不动 = 不引入 | ⚠️ 17 项风险点（见 §三） |
| **VS Code 对标** | ❌ 差一档 | ✅ 完全对标 |
| **Phase 6 铺路** | ❌ 文件树/主题浏览器要重启 | ✅ 零框架改动承诺成立 |
| **自由度** | ✅ 完全自由 | ✅ 完全自由（不变） |
| **F5 布局 bug 类** | ❌ 重启路径仍存在 | ✅ 安装路径不再触发重启 |
| **已卸载插件复活** | ❌ `import.meta.glob` 根因 | ✅ 根因物理消灭 |

**判断：做 5h。** 收益远大于代价。17 项风险中 3 个 P0、6 个 P1——逐项缓解后可控。

---

## 三、风险全景图（17 项）

### 🔴 P0 — 硬阻塞（不解决 5h 不上）

| # | 风险 | 根因 | 缓解 | 行数 |
|---|---|---|---|---|
| 1 | **React 双实例 → hooks 炸** | 插件独立构建时如果 bundle 了自己的 React → 两个 `React.createContext` → hooks 报 "Invalid hook call" | Vite library mode 构建配置把 `react`/`react-dom`/`react-i18next` 标记为 external。构建后脚本扫描 bundle 检测是否含 `require("react")`。 | ~30 |
| 2 | **`plugin://` 路径穿越** | 恶意插件请求 `plugin://../../../src/main.ts` → 读取核心源码 | Rust 端 `Path::canonicalize()` + 前缀白名单检查。只允许 `plugins/` 下的文件。 | ~15 |
| 3 | **IconBar 不响应式** | `getViewPlugins()` 返回 Map 快照，viewRegistry 无变更通知机制 | viewRegistry 加 `onDidRegister`/`onDidUnregister` Event → IconBar `useEffect` 订阅 → `setState` 触发重渲染。**5h 前就要做**——即使不改加载机制，这也是当前 bug（安装出厂预装插件后图标不显示）。 | ~30 |

### 🟡 P1 — 重要但不阻塞

| # | 风险 | 缓解 | 行数 |
|---|---|---|---|
| 4 | **CSS 全局冲突** | 插件 CSS 文件自动包裹 `[data-plugin="<id>"]` 选择器——构建脚本处理。约定所有插件手动样式也遵守此规则。不是 5h 新引入的问题但安装变频繁后碰撞概率上升。 | ~20 |
| 5 | **依赖版本冲突** | 共享依赖（react/react-dom/react-i18next/i18next）走 externals。其余各自打包。和 VS Code 一样。 | ~20 |
| 6 | **动态注入内存泄漏** | 安装→卸载→重装循环：`uninstall` 时移除动态注入的 `<style>`/`<link>`。`import()` 的模块走浏览器缓存——二次 import 不重新下载。 | ~15 |
| 7 | **插件 bundle 语法错误 → 整体崩** | `import()` 用 `.catch()` 兜底 → toast "插件 XXX 加载失败：..." → 不阻断其他插件。 | ~10 |
| 8 | **活跃协议被卸载** | ProtocolRegistry 加 fallback：活跃协议被 `unregisterProtocol` → 自动切回内置 "bracket" 协议 + toast。 | ~15 |
| 9 | **安装时 loader 未就绪（竞态）** | `installPlugin` → 检查 `_initialized` → 未就绪则入队 → `initPluginLoader` 完成后消费队列。 | ~15 |

### 🟢 P2 — 可接受但需知道

| # | 风险 | 缓解 |
|---|---|---|
| 10 | 构建流水线复杂度 | `npm run dev` 新增 `vite build --watch` per-plugin。目前 4 个视图插件，每个构建 ~2s，总共可接受。 |
| 11 | 首次点击延迟 | 对标 VS Code "Activating..."——可接受。加 loading spinner。第二次点击浏览器缓存即即时。 |
| 12 | 部分失败（JS 成功 CSS 失败） | 功能正常但无样式——可接受。ErrorBoundary 保护 React 渲染。 |
| 13 | 核心 API 版本不匹配 | `window.__v3_registerPlugin` 参数保持向后兼容。`minAppVersion` 已有检查。 |
| 14 | 循环依赖 | 启动时全量扫描所有 plugin.json → 构建依赖图 → 检测循环。~30 行。按需做。 |
| 15 | `modulepreload` 预加载失效 | 不依赖。首次点击加载完全可接受。 |
| 16 | Source map 定位 | 构建时生成 source map → `plugin://` 协议也 serve source map。dev 模式下完整，prod 模式不暴露。 |
| 17 | `tauri dev` 热更新 | 插件源码变化 → Vite 重构建该插件 → loader 检测变化 → 热替换（HMR-lite：unregister → re-import → register）。 |

---

## 四、旧 bug 复生分析

| 近期 Bug | 根因 | 5h 会复生吗？ | 详情 |
|---|---|---|---|
| **B70** — 卸载后 Settings Editor 残留 | `unregisterConfiguration` 死代码 | ⚠️ 可能 | 5h 改卸载路径——新 uninstall 必须确认调了 `unregisterConfiguration`。写入 5h 测试清单 |
| **B72** — 图标回老位置 | `IconBar.loadOrder()` PreferenceService 兜底 | ✅ 不会 | PluginStateService 已是唯一真源。但 IconBar 响应式订阅回调中 `iconOrder` 读写需验证 |
| **F5 布局丢失**（四轮修） | Tauri 异步写盘竞态 | ✅ **根因消灭** | 5h 消灭了"安装→重启"路径——布局持久化不再在安装流程中被触发 |
| **已卸载插件 F5 复活** | `import.meta.glob` 保留旧路径 | ✅ **根因消灭** | 5h 移除 `import.meta.glob`——运行时加载直接读文件系统，不存在就是不存在 |
| **禁用插件 F5 复活** | disabled 列表读取时机 | ✅ 不会 | 5h 不改 disabled 逻辑 |
| **热加载 auto-reload 被误删** | enablePlugin 代码删改 | ✅ **代码消灭** | 5h 不需要 `window.location.reload()`——即时生效，auto-reload 代码直接删除 |
| **插件安装后空操作 PreferenceService** | 旧双写残留 | ✅ 不会 | 5f 已清除。5h 在 5f 之后 |

---

## 五、实施计划——拆 4 步

### Step 1：IconBar 响应式 + viewRegistry 事件系统（~40 行）

> **这是 5h 的前置条件。** 不管改不改加载机制，当前就有 bug：安装出厂预装插件后 IconBar 不更新，必须等下次渲染。

**交付：**
1. `viewRegistry.ts` 新增 `onDidRegister: EventEmitter<ViewPluginEntry>` 和 `onDidUnregister: EventEmitter<string>`
2. `registerViewPlugin()` 内部调 `onDidRegister.fire(entry)`
3. `unregisterViewPlugin()` 内部调 `onDidUnregister.fire(pluginId)`
4. `IconBar.tsx` 订阅两个事件 → `setState` 触发重渲染

**验证：**
- [ ] 安装插件 → IconBar 图标即时出现（不刷新）
- [ ] 卸载插件 → IconBar 图标即时消失
- [ ] mount → unmount → remount 不泄漏 listener

### Step 2：插件独立构建 + Tauri `plugin://` 协议（~120 行）

> 把每个插件单独打成 bundle + 注册自定义协议让 WebView 能加载它们。

**交付：**
1. **插件构建脚本** `scripts/build-plugin.ts`（~70 行）
   - 扫描 `plugins/*/plugin.json`
   - 对有 `entry` 的插件：Vite library mode 构建 → `plugins/<id>/dist/index.js`
   - externals：`react`/`react-dom`/`react-i18next`/`i18next`/`@tauri-apps/api`
   - CSS 处理：提取 CSS → `plugins/<id>/dist/style.css`（自动包裹 `[data-plugin="<id>"]`）
2. **Tauri 自定义协议** `plugin://`（Rust ~40 行）
   - 注册 `plugin://` scheme → 映射到 `plugins/` 目录
   - 路径穿越防护：`Path::canonicalize()` + 前缀检查
   - 返回 MIME 类型：`.js` → `text/javascript`，`.css` → `text/css`
3. **npm scripts** `package.json` 新增（~10 行）
   - `build:plugins` — 构建所有插件
   - `dev:plugins` — watch 模式构建所有插件
   - `dev` — 并发：vite dev + dev:plugins

**验证：**
- [ ] `npm run build:plugins` → 每个插件输出 `dist/index.js` + `dist/style.css`
- [ ] 浏览器访问 `plugin://terminal/index.js` → 返回 JS 内容
- [ ] 浏览器访问 `plugin://../../../src/main.ts` → 403/404（路径穿越防护）
- [ ] `npm run dev` → 两个进程并发，插件变化自动重构建

### Step 3：运行时加载器 + 注册契约（~180 行）

> 替换 loader.ts 中的 `import.meta.glob` + `loadPlugin()` 为动态加载。

**交付：**
1. **`runtimeLoader.ts`**（~120 行）
   - `initRuntimeLoader()` — 启动时调用 `list_plugin_dirs` → 逐个 `loadPluginRuntime(id)`
   - `loadPluginRuntime(pluginId)` — 动态 `import(plugin://<id>/index.js)` → 等插件调 `__v3_registerPlugin` → 完成注册
   - `injectPluginCSS(pluginId)` — 动态创建 `<link rel="stylesheet" href="plugin://<id>/style.css">`
   - **和现有 `loadPlugin` 的关系：** 核心变化是 "入口怎么拿到"——从 `import.meta.glob` 切到 `import(plugin://...)`。拿到 exports 后，`parseContributions`/`registerViewPlugin` 等下游逻辑完全不变。**归一化原则：不改已有注册逻辑。**
2. **`window.__v3_registerPlugin(manifest, exports)`**（~30 行）
   - 插件 JS 的入口约定：执行完 `window.__v3_registerPlugin(manifest, exports)`
   - 核心收到后走 `loadPlugin(pluginId)` 的已有逻辑
   - 超时保护：3s 内插件没调 → toast 报错
3. **卸载清理**（~30 行）
   - `uninstallPlugin` → `unregister*` + `removePluginCSS(id)` + `deletePluginBundle(id)`
   - `disablePlugin` → 同 uninstall 但不删文件
   - `enablePlugin` → `loadPluginRuntime(id)` 即时生效（不再需要 reload）

**验证：**
- [ ] `npx tauri dev` 正常启动，所有已有插件加载
- [ ] 安装新插件 → 图标即时出现（不刷新）
- [ ] 卸载插件 → 图标即时消失 + CSS 移除
- [ ] 禁用/启用 → 即时生效
- [ ] F5 刷新 → 插件状态保持
- [ ] 3s 超时 → 错误插件不阻断其他插件加载
- [ ] 现有 141 测试全过

### Step 4：构建流水线整合 + 全量回归（~60 行）

> 清理 `import.meta.glob` 残留 + 旧的 `window.location.reload()` 路径 + F5 验证。

**交付：**
1. **删除 `import.meta.glob`** —— loader.ts 中 3 个 glob 调用移除
2. **删除 `window.location.reload()`** —— enablePlugin/installPlugin/reinstallPlugin 中的 reload 全删
3. **删除 `startPluginWatcher`** —— 轮询被运行时事件替代（安装时主动通知，不需要每 2s 轮询）
4. **更新 `vite.config.ts`** —— 移除 `scanPluginEntries()` + `pluginEntries` 相关代码
5. **更新 `CLAUDE.md`** + **`当前状态.md`** —— Phase 5h 标记完成
6. **全量回归** —— `验证清单.md` 全部通过

**验证：**
- [ ] 终端收发正常
- [ ] F5 刷新 → 所有插件正确加载
- [ ] 主题/语言/扩展/命令 全部正常
- [ ] 设置页正常
- [ ] `npx tsc --noEmit` 零错误
- [ ] `npx vitest run` 全过

---

## 六、依赖链

```
5f（持久化归一化）✅
  └── 5g（类型系统去硬编码）✅
        └── 5h（运行时动态加载）📋 ← 当前
              ├── Step 1（IconBar 响应式）—— 前置，5h 前就要做
              ├── Step 2（独立构建 + 协议）—— 核心改造
              ├── Step 3（运行时加载器）—— 依赖 Step 1+2
              └── Step 4（清理 + 回归）—— 依赖 Step 3
                    └── 5.5（三栏交互对标 VS Code）📋
```

**Step 1 不依赖 Step 2/3——可以先做。** Step 2+3 可以合在一起交（构建 + 加载器不可分割验证）。

---

## 七、停止标准（每步）

- [ ] `npx tsc --noEmit` 零错误
- [ ] `npx vitest run` 全部通过
- [ ] `npx tauri dev` 窗口正常打开
- [ ] 终端收发正常
- [ ] 本步特定验证项全部通过
- [ ] git commit——一步一个 commit

---

## 八、不做的东西

| 不做 | 理由 | 以后 |
|------|------|:--:|
| VS Code Extension Host（进程隔离） | 牺牲自由度——插件不能用任意 Web API | 永不 |
| 插件依赖图/循环检测 | P2——4 个插件不需要 | Phase 7+ |
| `modulepreload` 预加载 | 不需要——首次点击加载可接受 | 永不 |
| 插件按需激活（lazy activationEvents） | Phase 6+ 才需要 | Phase 6 |
| 插件签名/安全校验 | 桌面应用——用户自己装插件 | Phase 8+ |
| 插件更新/版本管理 | Phase 6+ 才需要 | Phase 6 |
| 运行时插件 core 模块 externalization 100% | Vite resolveId 拦截在 library mode + 非标准 root 下有死角。当前双 singleton 问题影响：运行时插件的 registerCommand 等调用走的是插件 bundle 内的 CommandRegistry 副本而非核心实例——命令面板不显示其命令。**不影响视图渲染、不影响 useSendData/useConfiguration 等 hooks（这些走 React context 传递）** | Phase 6 引入正式插件 SDK（`@v3/sdk`）后解决 |

---

## 九、实施记录

### Step 1 ✅ — viewRegistry 事件系统 + IconBar 响应式
- commit: `c06d9c5`
- viewRegistry: `onDidRegister` / `onDidUnregister` Emitter 事件
- IconBar: 订阅事件 → `pluginVersion` 计数器 → useMemo 重算图标列表

### Step 2 ✅ — plugin:// 协议 + 独立构建 + 运行时加载器
- commit: `56c1e38`
- Rust: `plugin_protocol.rs` — `plugin://` 自定义协议 (~80行)
- 构建: `scripts/build-plugins.mjs` — Vite library mode 独立构建 (~170行)
- API: `v3Api.ts` — `window.__v3_core__` 运行时 API 命名空间
- Loader: `loadPluginRuntime()` — 运行时插件发现+加载
- `installPlugin`/`enablePlugin`/`reinstallPlugin` — 即时生效（不再 reload）
- npm scripts: `build:plugins` / `dev:plugins`

### Step 3 ✅ — B76/B77 修复 + 文件监听器 + 微任务时序
- commits: `6c544fe`, `ba49853`, `4303b12`, `b1141c3`, `ac2fc0d`
- B76: 工厂/运行时插件分流——`loadPlugin` vs `loadPluginRuntime`
- B77: `appendToIconOrder` + `setPluginStateValueSync` 同步写内存——React 渲染前 iconOrder 已就绪
- `startPluginWatcher`: 新插件分流到 `loadPlugin`/`loadPluginRuntime`
- 🔥 核心教训见 memory `v3-pitfalls.md` Phase 5h 章

### Step 4 ✅ — 清理 + 文档
- commits: `4bf4b79`, `4efe993`
- 删除废弃 `build-plugins.ts`
- 设计文档实施记录补完
- B76/B77 memory 记录 + MEMORY.md 更新
- `v3-pitfalls.md` 新增 Phase 5h 章
