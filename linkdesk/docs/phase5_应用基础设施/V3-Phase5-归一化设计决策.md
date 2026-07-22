# Phase 5 归一化设计决策

> 两份归一化设计合并——ConfigurationApplier（配置→应用管道）和 PluginLifecycle（生命周期事件总线）。
> 共同主题：Phase 5 为什么要归一化、VS Code 怎么做、V3 怎么翻译。
>
> 合并自：V3-Phase5f-ConfigurationApplier-设计.md + V3-Phase5h-PluginLifecycle-行为归一化.md

---

## 一、为什么归一化是 Phase 5 必须做的

### 1.1 配置的根因：三个 bug，同一伤口

| Bug | 现象 | 根因 |
|:--|------|------|
| **B55** | F5 后终端 12 设置丢失 | sync effect 和 init 竞态，需要 `terminalPrefsReady` ref 守卫 |
| **B63** | F5 后强调色丢失 | init 漏读 `app.accentColor` |
| **B64** | B63 修完仍丢 | `applyAccentColor` 放 `applyTheme` 之前→被异步覆盖 |

三个 bug 的共同根因：**没有统一的"配置→应用"管道。** 每个设置的 apply 代码散落在 App.tsx init 的不同位置，各自管各自的时序。忘一个→bug。

### 1.2 生命周期的根因：80 个 commit，同一伤口

```bash
git log --oneline --all --grep="图标|icon.*order|F5.*丢|布局.*持|重装|reinstall|uninstall.*残留|B7[0-9]|beforeunload" | wc -l
# → 80 个 commit
```

Phase 5 做了存储层归一化（StorageService 是单一 I/O 路径）。**但行为层没归一化：**

```
installPlugin     → invoke → loadPlugin → registerView → [ ]iconOrder → toast → loadedIds
uninstallPlugin   → invoke → unregisterView → unregisterConfig → [✓]iconOrder → toast → loadedIds
reinstallPlugin   → invoke → loadPlugin → registerView → [✓]appendIconOrder → toast
enablePlugin      → disabledList → loadPlugin → registerView → [ ]iconOrder → toast
disablePlugin     → disabledList → unregisterView → unregisterConfig → [ ]iconOrder → toast → loadedIds
```

`[✓]` = 做了，`[ ]` = 漏了（或历史上漏过）。5 个生命周期函数 × 6 个副作用 = **30 个维护点。** 80 个 commit 的根因——改了一个函数，漏了另一个。

---

## 二、解决方案

### 2.1 ConfigurationApplier：配置定义和效果写在一起

**核心思路：** 配置的"怎么存"和"怎么用"写在一起——注册时声明 `onApply`，框架保证调用时机。

```typescript
// 之前：数据注册和应用逻辑分离 → 容易漏
registerConfiguration("app", { properties: { "app.accentColor": { type: "string", default: "#0078d4" } } });
// App.tsx init 里散落：if (cfgAccent) applyAccentColor(cfgAccent)
// onDidChangeConfiguration 里散落：if (key === "app.accentColor") applyAccentColor(value)

// 之后：数据和 apply 在一起 → 不会漏
registerConfiguration("app", {
  properties: {
    "app.accentColor": {
      type: "string", default: "#0078d4",
      description: "自定义强调色",
      onApply: (v) => applyAccentColor(v),  // ← 注册时声明，框架调用
    },
  },
});
```

**框架保证：**
1. init 完成后自动调一次 `onApply(currentValue)`
2. `setConfigurationValue` → 自动调对应 key 的 `onApply`
3. 插件卸载 → `unregisterConfiguration` → onApply 自动注销

**一劳永逸：** 新设置只需两步——`registerConfiguration` 里声明 `{ onApply: (v) => doSomething(v) }`，没了。不需要碰 App.tsx init 函数，不需要判断时序，不需要 guard ref。

### 2.2 PluginLifecycle：事件总线替代碎片化副作用

**核心思路：** 生产者只管 fire 事件，消费端各自订阅。新增/删除消费端不改生产者。

```typescript
// 生产者（5 个函数 → 只管触发事件）
async function installPlugin(sourcePath: string) {
  const pluginId = await invoke("install_plugin", { source: sourcePath });
  // ... load + register ...
  PluginLifecycle.onDidInstall.fire({ pluginId, manifest, reason: "install" });
  // done. 不关心谁在听。
}

// 消费端（各自独立订阅）
// 消费端 1：图标排序
PluginLifecycle.onDidInstall.event(({ pluginId, reason }) => {
  if (reason === "install" || reason === "reinstall") appendToIconOrder(pluginId);
});
// 消费端 2：配置注册清理
PluginLifecycle.onWillUninstall.event(({ pluginId }) => {
  unregisterConfiguration(pluginId);
  unregisterConfigurationDefaults(pluginId);
});
// 消费端 3：toast 通知
PluginLifecycle.onDidInstall.event(({ manifest, reason }) => {
  if (reason !== "startup") pushToast({ message: `已安装：${manifest.name}`, ... });
});
// 消费端 4：标签页清理
PluginLifecycle.onWillUninstall.event(({ pluginId }) => {
  window.dispatchEvent(new CustomEvent("plugin-removed", { detail: { pluginId } }));
});
// 消费端 5：视图刷新
PluginLifecycle.onDidUninstall.event(() => notifyPluginViews());
PluginLifecycle.onDidInstall.event(() => notifyPluginViews());
```

**事件定义：**
- `onDidInstall` — 插件已安装并注册完成（install/reinstall/enable/startup）
- `onWillUninstall` — 插件即将卸载/禁用（在 viewRegistry 注销之前）
- `onDidUninstall` — 插件已卸载/禁用完成（在 viewRegistry 注销之后）

**归一化效果：** 30 个维护点 → 8 个（3 事件 + 5 消费端）。改一个消费端不影响其他消费端。新增消费端 = 加一个订阅——不改任何现有代码。

---

## 三、VS Code 对照

### 3.1 VS Code 的做法：分布式订阅

```typescript
// VS Code：每个消费者自己管生命周期
class ThemeEngine {
  constructor(@IConfigurationService config, @IThemeService theme) {
    // 1. 构造时读
    const theme = this.config.getValue('workbench.colorTheme');
    this.apply(theme);
    // 2. 订阅变更
    this._register(this.config.onDidChangeConfiguration(e => {
      if (e.affectsConfiguration('workbench.colorTheme'))
        this.apply(this.config.getValue('workbench.colorTheme'));
    }));
  }
  // 3. dispose 自动取消订阅（_register → DisposableStore）
}
```

### 3.2 为什么 V3 不能照抄

**1. React useEffect 时序——先渲染后应用 → 闪烁。** VS Code 类是构造时同步 apply → 首次渲染前颜色已就位。React `useEffect` 在 DOM 提交后才跑 → 用户看到 CSS 默认色 → 然后 apply → 换色。B64 就是这个时序 bug。

**2. 没有 DI 容器——init 顺序靠手动。** VS Code 的 InstantiationService 保证 ConfigurationService 在所有消费者之前初始化完毕。V3 的 init 是 async IIFE 里手动排列——顺序错了 → 竞态（B55）。引入 DI 容器成本太高（~500 行 + 全部组件改 constructor 注入），不值得。

**3. Tauri event listener cleanup——generation counter 模式容易忘。** VS Code 靠 `this._register()` → `DisposableStore.dispose()` 自动清理。V3 的 `useEffect` cleanup 在 StrictMode 下轮子容易出错（B11）。

**4. `onApply` 不是偏离 VS Code——是适配 React。** VS Code 的"配置定义和消费分离，消费者自己管生命周期"在 DI + Disposable 体系下零 bug。React 没有这个体系——强行照抄等于在每个 useEffect 里手写时序 + cleanup，反而引入更多 bug。`onApply` 把"消费者自己管"改成了"注册时声明，框架管"——**思想一致（配置和应用解耦）、实现适配（React 声明式替代 DI 命令式）。**

### 3.3 VS Code 的 PluginLifecycle 模式

```typescript
// VS Code ExtensionService：
class ExtensionService {
  private readonly _onDidInstall = new Emitter<Extension>();
  readonly onDidInstall = this._onDidInstall.event;

  async install(extension: Extension): Promise<void> {
    await this._extensionsScanner.scanAndInstall(extension);
    this._registry.register(extension);
    this._onDidInstall.fire(extension);  // 通知所有消费端——不管消费端是谁
  }
}

// 消费端各自订阅，互不知道对方存在：
ActivityBarPainter  ← onDidInstall → this._addIcon(ext)
SettingsEditorModel ← onDidInstall → this._addConfigSection(ext)
ExtensionListView   ← onDidInstall → this._refreshList()
StatusBarService    ← onDidInstall → this._maybeShowReloadPrompt()
```

**关键属性：** 生产者只触发事件——不知道消费端是谁。消费端只订阅事件——不知道谁触发的。新增/删除消费端 = 加/删一个订阅——不改任何现有代码。

### 3.4 对比总结

| | VS Code 分布式 | V3 归一化方案 |
|:--|:--|:--|
| 定义位置 | plugin.json contributes.configuration | registerConfiguration + **onApply** |
| 应用位置 | 各消费者的 constructor | 框架自动调 onApply |
| 变更监听 | 各消费者独立订阅 onDidChangeConfiguration | 框架自动调 onApply |
| 生命周期管理 | DI disposable | unregisterConfiguration 自动清 |
| 加新设置 | 写 consumer 类 + 注册 | **写 onApply（一步）** |
| 出 bug 概率 | 低（DI 保证） | **低（框架管）** |
| Plugin 生命周期 | ExtensionService fire 事件，消费者独立订阅 | PluginLifecycle fire 事件，消费端独立订阅 |

---

## 四、相关文件

- [V3-Phase5-设计.md](V3-Phase5-设计.md) — Phase 5 主设计文档
- [V3-Phase5-承前启后.md](V3-Phase5-承前启后.md) — Phase 4→5 断层 + Phase 5→6 承接
- [[configuration-applier-pattern]] — ConfigurationApplier onApply 模式（memory）
- [[normalization-boundaries]] — 归一化边界（memory）
