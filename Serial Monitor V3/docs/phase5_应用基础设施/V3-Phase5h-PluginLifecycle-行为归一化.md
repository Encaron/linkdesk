# PluginLifecycle 事件总线——loader.ts 行为归一化

> 2026-07-21。Phase 5h 完成后，loader.ts 的行为层碎片化问题暴露——80 个 commit 修同一个伤口。
> 在 5.5 之前把 5 个生命周期函数的 6 个副作用归一化到一个事件总线。

---

## 〇、为什么要现在做

### 数据

```bash
git log --oneline --all --grep="图标|icon.*order|F5.*丢|布局.*持|重装|reinstall|uninstall.*残留|B7[0-9]|beforeunload" | wc -l
# → 80 个 commit
```

Phase 5 做了存储层归一化（StorageService 是单一 I/O 路径，PreferenceService → PluginStateService 迁移完成）。**但行为层没归一化。**

### 当前状态：5 × 6 = 30 个维护点

```
installPlugin     → invoke → loadPlugin → registerView → [ ]iconOrder → toast → loadedIds
uninstallPlugin   → invoke → unregisterView → unregisterConfig → [✓]iconOrder → toast → loadedIds
reinstallPlugin   → invoke → loadPlugin → registerView → [✓]appendIconOrder → toast
enablePlugin      → disabledList → loadPlugin → registerView → [ ]iconOrder → toast
disablePlugin     → disabledList → unregisterView → unregisterConfig → [ ]iconOrder → toast → loadedIds
```

`[✓]` = 做了，`[ ]` = 漏了（或历史上漏过）。

每个函数独立维护 5-6 个副作用清单。80 个 commit 的根因完全一样——**改了一个函数，漏了另一个。** B76 是 `loadPlugin` vs `loadPluginRuntime` 分流错误，B77 是 `appendToIconOrder` 遗漏 + 异步时序，B72 是 `unregisterConfiguration` 遗漏。

### 归一化做了存储层，但漏了行为层

```
存储层 ✅ 归一化：
  PreferenceService ─┐
  ConfigurationService ├──→ StorageService（单一 read/write 原语）
  PluginStateService  ─┤
  LayoutService       ─┘

行为层 ❌ 碎片化：
  installPlugin   ─┐
  uninstallPlugin  ├──→ registerView + registerConfig + iconOrder + toast + loadedIds + ...
  reinstallPlugin  ─┤     ↑ 每个函数独立维护这份清单，无人监督
  enablePlugin    ─┤
  disablePlugin   ─┘
```

---

## 一、VS Code 模式

```typescript
// VS Code ExtensionService（简化）：
class ExtensionService {
  private readonly _onDidInstall = new Emitter<Extension>();
  readonly onDidInstall = this._onDidInstall.event;

  async install(extension: Extension): Promise<void> {
    // 只做文件操作
    await this._extensionsScanner.scanAndInstall(extension);
    this._registry.register(extension);
    // 通知所有消费端——不管消费端是谁
    this._onDidInstall.fire(extension);
  }
}

// 消费端各自订阅，互不知道对方存在：
ActivityBarPainter  ← onDidInstall → this._addIcon(ext)
SettingsEditorModel ← onDidInstall → this._addConfigSection(ext)
ExtensionListView   ← onDidInstall → this._refreshList()
StatusBarService    ← onDidInstall → this._maybeShowReloadPrompt()
```

**关键属性：**
- 生产者只管触发事件——不知道消费端是谁、有几个
- 消费端只管订阅事件——不知道是谁触发的、什么时候触发
- 新增消费端 = 加一个订阅——不改任何现有代码
- 删除消费端 = 删一个订阅——不影响其他消费端

---

## 二、V3 翻译

### 事件定义

```typescript
// src/pluginLoader/lifecycle.ts
import { Emitter } from "../core/CoreEvents";
import type { ViewPluginEntry } from "../core/types";

export const PluginLifecycle = {
  /** 插件已安装并注册完成（install / reinstall / enable / 启动加载） */
  onDidInstall: new Emitter<{ pluginId: string; manifest: PluginManifest; entry: ViewPluginEntry }>(),

  /** 插件即将卸载（uninstall / disable）——在 unregister 之前触发 */
  onWillUninstall: new Emitter<{ pluginId: string }>(),

  /** 插件已卸载完成（uninstall / disable）——在 unregister 之后触发 */
  onDidUninstall: new Emitter<{ pluginId: string }>(),
};
```

### 生产者（5 个函数 → 只管触发事件）

```typescript
// installPlugin:
async function installPlugin(sourcePath: string) {
  const pluginId = await invoke("install_plugin", { source: sourcePath });
  // ... load + register ...
  PluginLifecycle.onDidInstall.fire({ pluginId, manifest, entry });
  // done. 不关心谁在听。
}

// uninstallPlugin:
async function uninstallPlugin(pluginId: string) {
  PluginLifecycle.onWillUninstall.fire({ pluginId });
  await invoke("uninstall_plugin", { pluginId });
  // ... unregister ...
  PluginLifecycle.onDidUninstall.fire({ pluginId });
}

// enablePlugin / disablePlugin / reinstallPlugin —— 同样模式
```

### 消费端（各自独立订阅）

```typescript
// ─── 消费端 1：图标排序 ───
// src/pluginLoader/lifecycleConsumers.ts（或各自模块内）
PluginLifecycle.onDidInstall.event(({ pluginId }) => {
  appendToIconOrder(pluginId);          // ← B77 再也不会漏
});

PluginLifecycle.onWillUninstall.event(({ pluginId }) => {
  removeFromIconOrder(pluginId);        // ← B72 再也不会漏
});

// ─── 消费端 2：配置注册清理 ───
PluginLifecycle.onWillUninstall.event(({ pluginId }) => {
  unregisterConfiguration(pluginId);     // ← B70 再也不会漏
  unregisterConfigurationDefaults(pluginId);
});

// ─── 消费端 3：toast 通知 ───
PluginLifecycle.onDidInstall.event(({ manifest }) => {
  pushToast({ message: `已安装：${manifest.name}`, ... });
});

PluginLifecycle.onDidUninstall.event(({ pluginId }) => {
  const entry = getViewPlugin(pluginId);
  pushToast({ message: `已卸载：${entry?.manifest.name ?? pluginId}`, ... });
});

// ─── 消费端 4：标签页关闭 ───
PluginLifecycle.onWillUninstall.event(({ pluginId }) => {
  window.dispatchEvent(new CustomEvent("plugin-removed", { detail: { pluginId } }));
});
```

---

## 三、影响范围

### 改什么

| 文件 | 改动 | 行数 |
|------|------|:--:|
| `loader.ts` | 5 个函数删掉副作用清单，改为 `fire(event)` | ~-40 |
| **新** `lifecycle.ts` | 事件定义 + `appendToIconOrder`/`removeFromIconOrder` + 消费端初始化 | ~+100 |
| **删** `loader.ts` 中分散的 toast/iconOrder/config 操作 | 集中到 lifecycle.ts | ~-60 |
| IconBar.tsx | 删 `loadOrder()` 函数内联调用（改用事件驱动） | ~0（已在用 getPluginStateValue） |
| **净变化** | | **~+40 行** |

### 不改什么

- `registerViewPlugin` / `unregisterViewPlugin` —— 继续在 viewRegistry 中
- `loadPlugin` / `loadPluginRuntime` —— 继续管加载逻辑
- `parseContributions` —— 继续管 plugin.json → Registry 解析
- `PluginStateService` / `StorageService` —— 存储层已归一化，不动
- IconBar 的 useMemo 响应式 —— Step 1 已做，不动
- `setPluginStateValueSync` —— B77 修法，保留

### 回归风险

**几乎为零。** 因为改动只是把现有副作用代码从一个文件搬到另一个文件、从分散调用改为事件触发——逻辑不变，调用顺序不变（`onWillUninstall` → unregister → `onDidUninstall` → `onDidInstall`）。

---

## 四、和 5.5 的关系

5.5 做的是 **UI 层交互对标 VS Code**（viewRole 声明、侧栏控制面板、标签页改名）。PluginLifecycle 是 **loader 层行为归一化**，两者互不重叠：

```
5h Step 4（本次）        5.5（下一步）
───────                  ──────
loader.ts 行为归一化      侧栏控制面板组件
PluginLifecycle 事件总线  viewRole 消费 → 侧栏/标签页行为
appendixIconOrder 集中    标签页改名 UI
toast 集中               ...
```

5.5 可以**消费** PluginLifecycle 事件（比如 `onDidInstall` → 按 `viewRole` 决定开不开标签页），但不依赖它。

---

## 五、停止标准

- [ ] `npx tsc --noEmit` 零错误
- [ ] `npx vitest run` 全过（141）
- [ ] 卸载→撤销 → 图标即时出现，位置在末尾
- [ ] 卸载→撤销 → F5 → 图标仍在末尾
- [ ] 禁用→启用 → 图标保留原位
- [ ] 安装/卸载/重装 toast 正常
- [ ] 终端收发正常
