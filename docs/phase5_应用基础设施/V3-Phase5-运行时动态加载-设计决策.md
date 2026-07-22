# Phase 5h — 运行时动态加载：设计决策

> 精简自 V3-Phase5h-运行时动态加载-设计.md（17KB → 去掉实施计划和实施记录，保留设计决策）。
> 取代 `import.meta.glob`，插件安装/卸载/启用/禁用全部即时生效，不刷新页面。

---

## 〇、"黑箱"澄清

用户讨论的"黑箱"是指 **VS Code Extension Host 模型**（独立进程沙箱，插件只能用 `vscode.*` API）vs **V3 同 WebView 模型**（插件和核心在同一个 JS 上下文，没有 API 白名单）。

**5h 不改变这个架构。** 5h 只改一件事：怎样把 JS bundle 加载进 WebView——从 `import.meta.glob`（构建时静态打包）换成运行时动态 `import()`。插件照样能 `import Leaflet`、`import THREE.js`、用 `<iframe>`/`<video>`——完整的 Web API 自由。

| | VS Code Extension Host | V3 当前 | V3 5h 后 |
|---|---|---|---|
| 进程隔离 | ✅ 独立进程 | ❌ 同 WebView | ❌ 同 WebView（不变） |
| API 限制 | `vscode.*` 白名单 | 无限制 | 无限制（不变） |
| 安装体验 | 即时生效 + toast | 全屏刷新 | 即时生效 + toast |
| 自由度 | 受限 | 完全自由 | 完全自由（不变） |

**结论：5h 把 VS Code 的安装体验拿过来，但不要它的进程隔离限制。**

---

## 一、当前状态 vs 5h 后

### 当前

```
用户安装插件
  → Rust 复制文件到 plugins/
  → loadPlugin() 检查 manifest 是否在 import.meta.glob 中
      ├── 在 glob 中 → 即时注册（但 IconBar 不响应式——图标可能不显示）
      └── 不在 glob 中 → toast "重启后生效" [立即重启]
            └── 用户点 → window.location.reload()
                  ├── COM 口断开 ❌
                  ├── 标签页从 LayoutService 恢复
                  └── 新插件图标出现
```

### 5h 后

```
用户安装插件
  → Rust 复制文件到 plugins/
  → 文件监听器检测新目录 → 读 plugin.json
  → 动态 import(plugin://<id>/index.js) 加载 JS bundle
  → window.__v3_core__ API → 走和工厂插件相同的注册路径
  → IconBar 响应式刷新 → 图标即时出现 ✅
  → toast "已安装：XXX"（无 [立即重启] 按钮）✅
  → 全程不刷新、COM 口不断 ✅
```

---

## 二、利弊总表

| 维度 | 当前 | 5h |
|---|---|---|
| **安装体验** | ❌ 重启 → 丢失运行时状态 | ✅ 即时生效，零中断 |
| **COM 口连续性** | ❌ 每次装插件断串口 | ✅ 不断 |
| **代码复杂度** | ✅ `import.meta.glob` 就 5 行 | ❌ +~400 行 |
| **构建复杂度** | ✅ 一次 `vite build` | ❌ N+1 次构建 + dev watch |
| **VS Code 对标** | ❌ 差一档 | ✅ 完全对标 |
| **Phase 6 铺路** | ❌ 文件树/主题浏览器要重启 | ✅ 零框架改动承诺成立 |
| **自由度** | ✅ 完全自由 | ✅ 完全自由（不变） |
| **已卸载插件复活** | ❌ `import.meta.glob` 根因 | ✅ 根因物理消灭 |

---

## 三、风险全景图（17 项——前 9 项关键）

### 🔴 P0 — 硬阻塞

| # | 风险 | 缓解 |
|---|---|---|
| 1 | **React 双实例 → hooks 炸** | 构建配置把 `react`/`react-dom`/`react-i18next` 标记为 external |
| 2 | **`plugin://` 路径穿越** | Rust 端 `Path::canonicalize()` + 前缀检查 |
| 3 | **IconBar 不响应式** | viewRegistry 加 `onDidRegister`/`onDidUnregister` Emitter 事件 |

### 🟡 P1 — 重要

| # | 风险 | 缓解 |
|---|---|---|
| 4 | CSS 全局冲突 | 构建脚本自动包裹 `[data-plugin="<id>"]` 选择器 |
| 5 | 依赖版本冲突 | react/react-dom/i18next 走 externals，其余各自打包 |
| 6 | 动态注入内存泄漏 | 卸载时移除动态注入的 `<style>`/`<link>` |
| 7 | 插件 bundle 语法错误 | `import()` 用 `.catch()` 兜底 → toast → 不阻断其他插件 |
| 8 | 活跃协议被卸载 | ProtocolRegistry fallback：自动切回 "bracket" 协议 |
| 9 | 安装时 loader 未就绪 | 入队 → initPluginLoader 完成后消费队列 |

---

## 四、旧 bug 复生分析

| Bug | 根因 | 5h 会复生？ |
|---|---|---|
| **B70** — 卸载后配置残留 | `unregisterConfiguration` 死代码 | ⚠️ 可能——5h 卸载路径需确认调了 unregister |
| **F5 布局丢失** | Tauri 异步写盘竞态 | ✅ 根因消灭——不再走"安装→重启"路径 |
| **已卸载插件 F5 复活** | `import.meta.glob` 保留旧路径 | ✅ 根因消灭——运行时加载直接读文件系统 |
| **热加载 auto-reload 误删** | enablePlugin 代码删改 | ✅ 代码消灭——即时生效，不再需要 reload |

---

## 五、不做的东西

| 不做 | 理由 | 以后 |
|------|------|:--:|
| VS Code Extension Host（进程隔离） | 牺牲自由度 | 永不 |
| 插件依赖图/循环检测 | 4 个插件不需要 | Phase 7+ |
| 插件按需激活（lazy activationEvents） | Phase 6+ 才需要 | Phase 6 |
| 插件签名/安全校验 | 桌面应用——用户自己装插件 | Phase 8+ |

---

## 六、相关文档

- [V3-Phase5-设计.md](V3-Phase5-设计.md) — Phase 5 主设计文档
- [V3-Phase5-归一化设计决策.md](V3-Phase5-归一化设计决策.md) — PluginLifecycle 事件总线（5h 的一部分）
- [V3-Phase5-承前启后.md](V3-Phase5-承前启后.md) — Phase 4→5 断层 + Phase 5→6 承接
- [[b78-workspace-tab-id-collision]] — B78 generateId 归一化（5h 修复）
- [[b76-factory-plugin-loadpath]] — B76 工厂插件加载路径（5h 修复）
