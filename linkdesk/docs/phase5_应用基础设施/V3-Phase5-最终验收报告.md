# Phase 5 最终验收报告

> 2026-07-21 | 5 份 Agent 审计 + 直接审查 | 分支 `phase5-app-infrastructure`
>
> **验收标准：** 精益求精 · 归一化 · AI 友好度 · 插件自由化 · VS Code 化 · 易操作 · 边界鲁棒

---

## 一、审计方法论

| 审计维度 | 方式 | 对标 |
|----------|------|------|
| **归一化** | Agent 全量 grep 搜索重复模式 + 直接审查关键文件 | [[normalization-boundaries]] / [[quality-commandments]] 第 2 条 |
| **AI 友好度** | Agent 逐文件审查注释质量 / 文件头 / 设计文档引用 | [[quality-commandments]] 第 1 条 / [[code-self-documenting]] |
| **插件自由化** | Agent 审查 core/ 领域知识泄漏 + API 白名单检查 | [[core-ignorance-principle]] / [[linkdesk-is-a-container-not-a-debugger]] |
| **VS Code 化** | Agent 逐服务对比 VS Code 源码 + 交互模式检查 | [[quality-commandments]] 第 4 条 / [[vscode-source-reference]] |
| **边界鲁棒** | Agent 审查事件清理 / 注册注销 / null 处理 / 竞态 / 错误边界 | [[ai-pre-commit-checklist]] 第三、四条 |
| **机械关卡** | tsc --noEmit + vitest run + git diff | [[ai-pre-commit-checklist]] 第五条 |

---

## 二、机械关卡结果

| 关卡 | 结果 |
|------|------|
| `tsc --noEmit` | ✅ 零错误 |
| `npx vitest run` | ✅ 141 tests passed（8 文件）|
| git diff vs master | +5141 / -766（49 文件）|
| `console.log` in `src/core/` | ✅ 零 |
| `console.log` in `src/pluginLoader/` | ⚠️ 17 处——应走 LogChannel（见 B6）|
| 硬编码 hex 颜色（CSS） | ✅ 零（`#0078d4` 是配置默认值，走 CSS 变量）|
| `@ts-expect-error` / `@ts-ignore` | ✅ 零 |
| `as any`（非测试） | ✅ 仅 3 处：loader.ts:264（MenuId cast）、tabIdentity.ts:142/168（动态属性访问）|

---

## 三、综合评分

| 维度 | 等级 | 一句话 |
|------|:--:|------|
| **归一化** | **B** | 骨架归一 ✅（ConfigApplier/Lifecycle/StorageService/autoId），18 项字符串/逻辑分散 |
| **插件自由** | **B+** | 架构干净，SerialContext 等 3 文件泄漏串口知识到 core |
| **AI 友好** | **B+** | 文件头/VS Code 对标/B 号追踪优秀，裸数字/硬编码版本号待修 |
| **VS Code 化** | **A-** | 10 项服务对标正确，Chord/模糊搜索/KeybindingResolver 简化版 |
| **边界鲁棒** | **B** | 错误隔离/幂等/双写正确，**3 HIGH 级漏洞**（见 §四）|
| **易操作** | **B+** | 即时生效/撤销/动态 UI，终端多实例 Phase 5.5 待修 |

### 综合：**B+**（A- 级架构 + B 级落细节 → 修完 Blocking 升至 A-）

---

## 四、问题清单（按优先级排序）

### 优先级说明

| 标记 | 含义 | 行动 |
|:--:|------|------|
| 🔴 **Blocking** | 不修会导致 Phase 5.5 建立在错误基础上——监听器泄漏导致渲染 bug、僵尸注册导致命令面板混乱、快捷键误删导致静默功能失效 | Phase 5.5 第一个 commit 前必须修 |
| 🟡 **Quick Win** | 不阻塞功能但显著降低质量——重复代码、魔法数字、LogChannel 绕过、常量分散 | Phase 5.5 第一个 commit 一起修 |
| 🟢 **Deferred** | 需要跨层改动（Rust + TS + Tauri）、需要新功能（Chord 状态机）、标注了 Phase 6 迁移目标 | Phase 6 处理 |

---

### 🔴 Blocking（4 项，~50 分钟）

#### B1. SettingsView 监听器泄漏——`onDidChangeConfiguration` 从不取消订阅

- **文件：** `src/components/views/SettingsView.tsx:50-54`
- **严重度：** 🔴 HIGH
- **维度：** 边界鲁棒

**根因：**

```ts
// 当前代码——useEffect 无 cleanup
useEffect(() => {
  import("../../core/ConfigurationService").then(({ onDidChangeConfiguration }) => {
    onDidChangeConfiguration(() => setVersion((v) => v + 1));
  });
}, []);
```

`onDidChangeConfiguration()` 返回一个取消订阅函数 `() => void`，但代码没有捕获和返回它。每次 SettingsView mount，一个新的 listener 被永久添加到 `ConfigurationService._changeListeners` Set 中。

**不做会发生什么：**

- 用户打开/关闭设置页 N 次 → `_changeListeners` 中有 N 个重复 listener
- 每次任何配置变更 → `setVersion` 被调用 N 次 → N 次重复渲染
- React StrictMode（开发环境）double-mount → 每次访问设置页就泄漏 2 个 listener
- 长时间使用后 Settings Editor 响应越来越慢——用户感知的性能退化

**解法：**

```ts
useEffect(() => {
  let unsubscribe: (() => void) | undefined;
  import("../../core/ConfigurationService").then(({ onDidChangeConfiguration }) => {
    unsubscribe = onDidChangeConfiguration(() => setVersion((v) => v + 1));
  });
  return () => { unsubscribe?.(); };
}, []);
```

**验收：** mount → unmount → remount → 检查 `ConfigurationService._changeListeners.size` 始终为 1。

---

#### B2. 6 个 `unregister*` 函数定义但从不调用——卸载插件后注册表残留僵尸数据

- **文件：** `src/pluginLoader/loader.ts` + `src/pluginLoader/lifecycle.ts`
- **严重度：** 🔴 HIGH
- **维度：** 边界鲁棒 / 归一化

**根因：**

Phase 5 定义了 8 个 `unregister*` 函数：

| 函数 | 文件 | 定义行 | 是否被调用 |
|------|------|--------|:--:|
| `unregisterConfiguration` | ConfigurationRegistry.ts | 56 | ✅ lifecycle.ts:89 |
| `unregisterConfigurationDefaults` | ConfigurationRegistry.ts | 117 | ✅ lifecycle.ts:91 |
| `unregisterViewPlugin` | viewRegistry.ts | 92 | ✅ loader.ts:664, 739 |
| `unregisterPluginCommands` | CommandRegistry.ts | 61 | ❌ 从不调用 |
| `unregisterPluginKeybindings` | KeybindingRegistry.ts | 131 | ❌ 从不调用 |
| `unregisterPluginMenus` | MenuRegistry.ts | 95 | ❌ 从不调用 |
| `unregisterPluginProtocols` | ProtocolRegistry.ts | 52 | ❌ 从不调用 |
| `unregisterPluginCards` | CardRegistry.ts | 46 | ❌ 从不调用 |
| `unregisterPluginChannels` | LogChannel.ts | 102 | ❌ 从不调用 |

**不做会发生什么：**

- 用户卸载插件 A → 它的**命令**仍在命令面板中（点击后 `console.warn("尚未绑定 handler")`）
- 用户卸载插件 A → 它的**快捷键**仍然拦截键盘事件（触发无效命令）
- 用户卸载插件 A → 它的**右键菜单项**仍然出现（点击无效）
- 用户卸载插件 A → 它的**协议**仍在终端下拉框中（切换后解析失败）
- 用户卸载插件 A → 它的**日志频道**仍在内存中（最多 500 条/频道）
- 用户禁用再启用 → 旧注册表数据和新数据叠加（命令/菜单/快捷键出现两份）

**这是一个 V2.6 级问题：** 改了 `disablePlugin`/`uninstallPlugin` 但只清理了 3/9 的注册表。Phase 5h 的 PluginLifecycle 事件总线设计就是为了解决这个问题——`onWillUninstall` 事件已经触发，消费端只需要在 lifecycle.ts `initLifecycleConsumers()` 中加 6 行。

**解法：**

在 `lifecycle.ts` 的 `initLifecycleConsumers()` 中，`onWillUninstall` 消费端追加：

```ts
// 消费端 6：注册表全量清理（Phase 5 验收发现——6 个 unregister* 从未被调用）
PluginLifecycle.onWillUninstall.event(({ pluginId }) => {
  // 卸载/禁用时清理所有注册表——归一化到一个地方
  import("../core/CommandRegistry").then((m) => m.unregisterPluginCommands(pluginId));
  import("../core/KeybindingRegistry").then((m) => m.unregisterPluginKeybindings(pluginId));
  import("../core/MenuRegistry").then((m) => m.unregisterPluginMenus(pluginId));
  import("../core/ProtocolRegistry").then((m) => m.unregisterPluginProtocols(pluginId));
  import("../core/CardRegistry").then((m) => m.unregisterPluginCards(pluginId));
  import("../core/LogChannel").then((m) => m.unregisterPluginChannels(pluginId));
});
```

> 注：`unregisterConfiguration` + `unregisterConfigurationDefaults` 已在此消费端（lines 88-91），无需重复添加。

**验收：** 安装一个有 commands + keybindings + menus + protocols 的插件 → 卸载 → 检查各注册表该 pluginId 条目为零。

---

#### B3. `unregisterPluginKeybindings` 忽略 `pluginId` 参数——调用会误删所有插件快捷键

- **文件：** `src/core/KeybindingRegistry.ts:131-138`
- **严重度：** 🔴 HIGH
- **维度：** 边界鲁棒 / 归一化

**根因：**

```ts
// 当前代码——_pluginId 前缀 _ 表示"未使用"，删除所有 source === "plugin" 的绑定
export function unregisterPluginKeybindings(_pluginId?: string): void {
  for (let i = _bindings.length - 1; i >= 0; i--) {
    if (_bindings[i].source === "plugin") {
      _bindings.splice(i, 1);
    }
  }
}
```

参数被声明为 `_pluginId`（TypeScript 约定：`_` 前缀 = 故意不使用），函数体检查 `source === "plugin"` 而非 `source === pluginId`。

**不做会发生什么：**

- B2 修复后，此函数被调用 → 卸载插件 A → 插件 B、C、D 的快捷键全部消失
- 用户禁用任意一个插件 → 所有插件的快捷键静默失效
- 这是一个 **静默功能丢失**——用户不会看到报错，只是快捷键突然不响应

**解法：**

```ts
export function unregisterPluginKeybindings(pluginId: string): void {
  for (let i = _bindings.length - 1; i >= 0; i--) {
    if (_bindings[i].source === pluginId) {
      _bindings.splice(i, 1);
    }
  }
}
```

> `_bindings` 中每个 entry 的 `source` 字段存储的是 pluginId（见 `registerKeybinding` 参数），不是字符串 `"plugin"`。用 `source === pluginId` 精确匹配。

**验收：** 注册插件 A 的快捷键 + 插件 B 的快捷键 → 调 `unregisterPluginKeybindings("A")` → 检查 A 的快捷键被移除、B 的快捷键仍在。

---

#### B4. 重复的 semver 比较——`versionGte` vs `compareVersions`

- **文件：** `src/pluginLoader/loader.ts:83-91` + `src/pluginLoader/viewRegistry.ts:44-52`
- **严重度：** 🔴 HIGH
- **维度：** 归一化

**根因：**

两段代码实现**完全相同的算法**（按 `.` 分割 → 比较 3 段数字），但返回类型不同。这是纯逻辑重复——改算法要改两处。

```ts
// loader.ts:83-91
function versionGte(a: string, b: string): boolean {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    if ((pa[i] || 0) > (pb[i] || 0)) return true;
    if ((pa[i] || 0) < (pb[i] || 0)) return false;
  }
  return true;
}

// viewRegistry.ts:44-52
function compareVersions(a: string, b: string): number {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    if ((pa[i] || 0) > (pb[i] || 0)) return 1;
    if ((pa[i] || 0) < (pb[i] || 0)) return -1;
  }
  return 0;
}
```

**不做会发生什么：**

- 如果 semver 规则需要支持 pre-release tag（如 `3.1.0-alpha.1`），只改一处 → 另一处行为不一致
- 如果发现 bug（如 `"10.0.0" < "9.0.0"` 因为 `"1" < "9"` 当字符串比较——虽然当前 split+Number 已避免），只修一处 → 另一处仍错
- **V2.6 教训重现：** 同一个算法两个副本 = 早晚不一致

**解法：**

新建 `src/pluginLoader/semverUtils.ts`：

```ts
/**
 * semver 工具——归一化 loader.ts 和 viewRegistry.ts 的版本比较。
 * 当前只支持 X.Y.Z 格式（不含 pre-release tag）。pre-release 支持在 Phase 6 追加。
 */

/** 比较两个 semver 版本。返回 >0 如果 a>b，<0 如果 a<b，0 如果相等。 */
export function compareVersions(a: string, b: string): number {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    if ((pa[i] || 0) > (pb[i] || 0)) return 1;
    if ((pa[i] || 0) < (pb[i] || 0)) return -1;
  }
  return 0;
}

/** a >= b ? */
export function versionGte(a: string, b: string): boolean {
  return compareVersions(a, b) >= 0;
}
```

然后 `loader.ts` 和 `viewRegistry.ts` 都从此文件 import。

**验收：** 确保 `versionGte` 内部调 `compareVersions`（不是两份算法），现有行为不变。

---

### 🟡 Quick Wins（9 项，~75 分钟）

#### B5. `"welcome"` 字符串硬编码 7+ 处

- **文件：** `viewRegistry.ts:88`, `tabIdentity.ts:65`, `useTabManager.ts:136/159/336`, `App.tsx:123/654/661`, `MainContent.tsx:53`, `TabBar.tsx:89`, `LayoutService.ts:24`
- **严重度：** 🟡 MEDIUM
- **维度：** 归一化

**为什么：** 欢迎页的 pluginId 是系统内置常量。如果未来改名（如 `"home"` 对标 VS Code "Getting Started"），当前需要改 10+ 处。

**不做会发生什么：** 改名遗漏一处 → 启动无 fallback → 用户看到空白页。

**解法：** 在 `viewRegistry.ts` 导出 `export const FALLBACK_PLUGIN_ID = "welcome";`，全部引用替换。

---

#### B6. `pluginLoader` 17 处 `console.log` 绕过 LogChannel

- **文件：** `src/pluginLoader/loader.ts`
- **严重度：** 🟡 MEDIUM
- **维度：** 归一化 / AI 友好度

**为什么：** Phase 5 建了 `LogChannel`（对标 VS Code Output panel，开发者诊断用），但 loader 全部诊断信息走 `console.log`——开发者无法在 Output 面板看到插件加载日志。

**不做会发生什么：** 用户报告插件加载问题 → 开发者只能说"打开浏览器控制台"而不是"打开 Output 面板看 pluginLoader 频道"——破坏 VS Code 化体验。

**解法：**

```ts
// loader.ts 顶部
import { createLogChannel } from "../core/LogChannel";
const channel = createLogChannel("pluginLoader");

// 将所有 console.log("[pluginLoader] ...") 替换为 channel.appendLine("...")
// 17 处。保留 console.warn（生产警告）和 console.error（生产错误）。
```

---

#### B7. `"app"` 插件 ID 硬编码 10+ 处

- **文件：** `coreCommands.ts:147/166`, `App.tsx:159`, `registerBuiltinProtocols.ts:45`, `IconBar.tsx:34/40`, `loader.ts:117/138/622/631`, `lifecycle.ts:148/151/154/162/164/166`
- **严重度：** 🟡 MEDIUM
- **维度：** 归一化

**为什么：** `"app"` 是壳级注册使用的特殊 pluginId（对标 VS Code 内置命令的来源标识）。10+ 处硬编码 = 改一处漏一处。

**不做会发生什么：** 改名遗漏 → 壳配置/命令的 `pluginId` 不一致 → `getPluginStateValue("app", ...)` 读不到数据。

**解法：** 在 `PluginStateService.ts` 导出 `export const APP_PLUGIN_ID = "app";`，全部引用替换。

---

#### B8. CustomEvent 名称字符串无常量——不一致的事件模型

- **文件：** `coreCommands.ts:55/65`, `App.tsx:377-378/567`, `lifecycle.ts:131`
- **严重度：** 🟡 MEDIUM
- **维度：** 归一化 / VS Code 化

**为什么：** 项目已有 `Emitter<T>` 系统（CoreEvents/PluginLifecycle/viewRegistry/LogChannel 都用了），但 3 个内部 IPC 仍用 `window.dispatchEvent(new CustomEvent(...))`。String literal 在 dispatch 端和 listen 端各写一遍——改名漏一端就断开通信。

**不做会发生什么：** 命令面板打不开（`"v3-show-palette"` 拼错）、视图切换失败（`"v3-open-view"` 拼错）、插件卸载后标签页不关闭（`"plugin-removed"` 拼错）。

**解法（两步）：**

1. 提取常量（立即做）：
```ts
// CoreEvents.ts
export const CUSTOM_EVENTS = {
  SHOW_PALETTE: "v3-show-palette",
  OPEN_VIEW: "v3-open-view",
  PLUGIN_REMOVED: "plugin-removed",
} as const;
```

2. CustomEvent → Emitter 迁移（Phase 6）：
   - `"v3-show-palette"` → `executeCommand("workbench.action.showCommands")`
   - `"v3-open-view"` → Emitter 事件
   - `"plugin-removed"` → 已被 `PluginLifecycle.onWillUninstall` 覆盖——lifecycle.ts line 131 的 CustomEvent 是冗余的双重通知

---

#### B9. Toast TTL 裸数字 10 处——无注释、无常量

- **文件：** `loader.ts`（`ttl: 8000`×4, `ttl: 5000`×4）, `lifecycle.ts`（`ttl: 6000`, `ttl: 8000`）
- **严重度：** 🟡 MEDIUM
- **维度：** AI 友好度

**为什么：** 裸数字不表达意图——为什么错误 toast 8 秒、成功 5 秒、信息 6 秒？AI 读到 `ttl: 8000` 无法判断这是"给用户时间读错误诊断"还是"随便写的"。

**不做会发生什么：** 未来调整 toast 时长 → 逐处改，漏一处 → 某个 toast 时长不一致。

**解法：** 在 `toast.ts` 或新建 `toastConstants.ts` 中：
```ts
/** 错误 toast 持续更久——用户需要时间读诊断信息 */
export const TOAST_TTL_ERROR = 8000;
/** 成功 toast 短提示——操作完成后快速消失 */
export const TOAST_TTL_SUCCESS = 5000;
/** 信息 toast 中等——不紧急但有用 */
export const TOAST_TTL_INFO = 6000;
```

---

#### B10. `getAppVersion()` 返回硬编码 `"3.0.0"`——注释与实际不一致

- **文件：** `src/pluginLoader/loader.ts:78-80`
- **严重度：** 🟡 MEDIUM
- **维度：** AI 友好度

**为什么：** 注释写"从 package.json 读取"但实际返回硬编码字符串。任何版本号升级都不会触发 minAppVersion 检查的行为变化——插件版本检查形同虚设。

**不做会发生什么：** 发 3.1.0 → `minAppVersion: "3.1.0"` 的插件仍被加载（因为 `getAppVersion()` 永远返回 `"3.0.0"`）→ 插件崩溃、用户不知道原因。

**解法：** 加 TODO 注释标记 Phase 6 修复（读取实际 package.json），保留硬编码但明确标注：
```ts
/** TODO Phase 6：从 package.json 动态读取（需要 Vite define 或 import.meta.env）。
 *  当前硬编码——发版前手动更新此行。 */
function getAppVersion(): string {
  return "3.0.0";
}
```

---

#### B11. `useTabManager` 返回 16 个函数无分组注释

- **文件：** `src/hooks/useTabManager.ts:909-928`
- **严重度：** 🟡 MEDIUM
- **维度：** AI 友好度

**为什么：** 16 个函数平铺在返回对象中——新 AI 读这段代码无法快速定位"创建标签页的函数是哪个"。

**不做会发生什么：** 新 AI 浪费时间通读全部 930 行才能理解返回接口的形状。

**解法：** 在 return 语句中加分组注释：
```ts
return {
  // ── 生命周期（创建/关闭/聚焦）──
  createTab, closeTab, closeOtherTabs, closeRightTabs, setActiveTab, forceCloseTab,

  // ── 布局（分屏/合屏/调整大小）──
  splitTab, unsplitGroup, resizeGroup,

  // ── 持久化（恢复/导出/同步写入）──
  restoreLayout, toLayoutData, syncWriteLayout,

  // ── 工具（查找/状态）──
  findGroupByTabId, getActiveTab, resetCounters,
};
```

---

#### B12. `mountGlobalKeybindings()` 返回值丢弃——HMR 场景下可能重复注册

- **文件：** `App.tsx:203`
- **严重度：** 🟡 MEDIUM
- **维度：** 边界鲁棒

**为什么：** `mountGlobalKeybindings()` 返回 `() => void` cleanup 函数（移除 `keydown` listener），但调用方丢弃了它。

**不做会发生什么：** React StrictMode 或 HMR → startup useEffect 跑两次 → 两个 capture-phase `keydown` listener → 每次按键触发两次命令执行。

**解法：**
```ts
// App.tsx startup useEffect 中
const cleanupKeybindings = mountGlobalKeybindings();
// ... 在 cleanup 中调用
return () => { cleanupKeybindings(); /* 其他 cleanup */ };
```
> 注：当前 startup useEffect（line 144）无 cleanup return——需要整体加 return 或把 keybinding mount 移到有 cleanup 的独立 useEffect。

---

#### B13. Plugin watcher interval 永不停止

- **文件：** `App.tsx:200` + `loader.ts:897-926`
- **严重度：** 🟡 MEDIUM
- **维度：** 边界鲁棒

**为什么：** `startPluginWatcher()` 创建 `setInterval(fn, 2000)`，`stopPluginWatcher()` 已定义但从未被调用。`setInterval` 在组件树销毁后仍然运行。

**不做会发生什么：** HMR → 新 watcher 创建，旧 watcher 仍在跑 → N 个间隔同时轮询 → 不必要的 Tauri IPC 调用 + 重复加载同一插件。

**解法：** 在 App.tsx startup useEffect（或新 cleanup useEffect）的返回函数中调 `stopPluginWatcher()`。

---

### 🟢 Deferred（8 项，Phase 6 处理）

#### D1. Tauri fs API 在 4 个服务中重复 7 处

- **文件：** `ConfigurationService.ts`(×2), `LayoutService.ts`(×2), `PreferenceService.ts`(×2), `StorageService.ts`(×1)
- **严重度：** 🟢 已标注
- **为什么 Defer：** 代码中已标注"Phase 6 WorkspaceService 接管后删除此段"。这些 workspace 路径不在 appDataDir 下，StorageService 的 key→path 映射不支持。Phase 6 WorkspaceService 统一接管后自然归一化。

---

#### D2. `SerialContext.tsx` / `useSendData.ts` 串口领域代码在 core/

- **文件：** `src/core/SerialContext.tsx`, `src/core/useSendData.ts`
- **严重度：** 🟢 已标注
- **为什么 Defer：** [[normalization-boundaries]] 明确标注："已有代码不急着改——改一个名字要改 Rust + TS + Tauri event 三层，风险高"。Phase 6 配合 terminal 插件重构统一迁移。

---

#### D3. `CoreEvents.onDidChangePortState` + `ContextKeyService` `"portOpen"`/`"portName"`——Port 术语泄漏

- **严重度：** 🟢 已标注
- **为什么 Defer：** 同上——跨 Rust/TS/Tauri event 三层。且 plugin.json 中 `when` 子句已使用 `"portOpen"`——改了会破坏已有插件。Phase 6 统一做 Source 术语迁移。

---

#### D4. Chord 快捷键（如 `Ctrl+K Ctrl+S`）未实现

- **严重度：** 🟢 新功能
- **为什么 Defer：** 这是新功能开发，不是 bug。需要实现 Chord 状态机（监听 first key → 等待 second key → 超时 fallback）。Phase 6 对标 VS Code `KeybindingChord`。

---

#### D5. 命令面板无模糊搜索——用 `String.includes`

- **严重度：** 🟢 功能增强
- **为什么 Defer：** 当前 substring 搜索满足 Phase 5 需求。Phase 6.5（抛光）对标 VS Code 打分排序模糊匹配。

---

#### D6. 无 `keybindings.json` 用户自定义快捷键

- **严重度：** 🟢 新功能
- **为什么 Defer：** Phase 6 用户配置基础设施完工后实现。

---

#### D7. PreferenceService 完全拆除

- **严重度：** 🟢 已标注
- **为什么 Defer：** 11 个字段已迁移 9 个，剩余 `window`（窗口位置）+ `pluginsInstallPath`。Phase 6 完成后删除 `PreferenceService.ts`。

> **2026-07-21 修订：已提前到 Phase 5.5-0。** 理由：5.5-0 已将验收报告的全部 Blocking + Quick Wins 纳入第一个 commit，Prefs 迁移是同一类"打扫战场"工作——5 个常量提取（B5-B9）已经改到 PreferenceService 的消费者，顺手把僵尸对象删掉比等到 Phase 6 更安全。Phase 6 新 AI 不会看到这个文件并误用。

---

#### D8. `window.confirm()` 3 处——应走 DialogService

- **文件：** `App.tsx:588`, `DialogService.ts:92`, `PluginDetailView.tsx:80`
- **严重度：** 🟢 LOW
- **为什么 Defer：** DialogService 在 Phase 5 已定义但未实现自定义 UI（`showConfirm` 的 `custom` renderer 未注册）。Phase 6 实现 `<Dialog>` React 组件后迁移。

---

## 五、Phase 5 核心成就（不受上述问题影响）

这些是 Phase 5 真正交付的工程价值——审计确认正确：

| 成就 | 说明 |
|------|------|
| **ConfigurationApplier** | 配置→应用归一化管道。"定义+效果"写在一起，框架包办调用时机。消灭了 B55/B63/B64（持久化到处拉屎）的根因 |
| **PluginLifecycle 事件总线** | 5 个生命周期函数 × 6 个副作用 → 3 个事件 + 5 个消费端。80 个 commit 修同一个伤口的历史结束 |
| **StorageService 双写** | localStorage 同步（F5 安全）+ 文件异步（持久化）。消灭了 4 个服务各自 I/O 的根因 |
| **TabType = string** | 核心不认 pluginId。任何字符串即合法类型。插件新增类型不需要改核心 |
| **autoId() 模式** | 消灭 4 个 generateId 硬编码——B78 工作台 id 碰撞修复 |
| **BOTTOM_ICONS 删除** | `iconLocation` 从 plugin.json 读——settings 不再是唯一底部图标 |
| **plugin:// 运行时加载** | 安装插件即时生效，不刷新窗口 |
| **B2 元数据缓存** | 卸载后仍可浏览插件详情——不依赖文件系统 |
| **B78 布局迁移** | 旧硬编码 tab id 自动迁移——idempotent + crash-safe |

---

## 六、验收结论

**Phase 5 通过验收。进入 Phase 5.5 条件满足。**

Phase 5 的架构骨架达到了 A- 水平——ConfigurationApplier、PluginLifecycle、StorageService、TabType=string、autoId——这些是不可逆转的工程进步。

有 4 个 Blocking 问题（监听器泄漏 + 僵尸注册 + 快捷键误删 + semver 重复）是落细节的漏洞，不是架构缺陷。修掉它们后 Phase 5 升至 **A-**。

**建议：** Phase 5.5 第一个 commit 包含 §四 的全部 Blocking + Quick Wins（13 项，~2h），然后从一个干净的基础开始 Phase 5.5 核心工作。

---

## 七、审计方法附录

| Agent | 角色 | 搜索范围 | 花费 |
|------|------|------|------|
| 归一化审计 | 全量 grep 重复模式 + 常量硬编码扫描 | src/ 全目录 | ~166s |
| AI 友好度审计 | 逐文件注释质量 / 文件头 / 设计文档引用 | 21 文件深度阅读 | ~165s |
| 插件自由化审计 | core/ 领域知识泄漏 + API 白名单检查 | 全 core/ + pluginLoader/ + schema | ~133s |
| VS Code 对标审计 | 逐服务对比 VS Code 源码 | 10 服务深度对比 | ~168s |
| 边界鲁棒审计 | 事件清理 / 注册注销 / null / 竞态 / 错误边界 | 全 src/ | ~275s |
| 直接审查 | 关键文件语义分析 | 20+ 文件 | ~贯穿全程 |
