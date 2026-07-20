# ConfigurationApplier — 配置→应用归一化管道

> Phase 5f 前置：修掉"持久化到处拉屎"的根因，不是再修一个 bug。

## 一、问题：三个 bug，同一根因

| Bug | 现象 | 根因 |
|:--|------|------|
| **B55** | F5 后终端 12 设置丢失 | sync effect 和 init 竞态，需要 `terminalPrefsReady` ref 守卫 |
| **B63** | F5 后强调色丢失 | init 漏读 `app.accentColor` |
| **B64** | B63 修完仍丢 | `applyAccentColor` 放 `applyTheme` 之前→被异步覆盖 |

三个 bug 的共同根因：**没有统一的"配置→应用"管道。** 每个设置的 apply 代码散落在 App.tsx init 的不同位置，各自管各自的时序。忘一个→bug。

```
ConfigurationService 只管存储（读/写/通知）
应用逻辑散落在 App.tsx init 的各个位置：
  - theme: loadTheme().then(applyTheme)          ← 异步
  - language: i18n.changeLanguage()              ← 同步
  - accentColor: applyAccentColor()              ← 放错了时机（B64）
  - terminal.*: setTerminalPrefs() + guard ref   ← 需要 B55 的 ref 守卫
  - onDidChangeConfiguration: 4 个 if 分支       ← 散落
```

## 二、VS Code 对照——为什么我们不照抄

### VS Code 的做法：分布式

```
┌─ ConfigurationService ─┐
│  getValue(key)          │
│  onDidChange(event)     │  ← 所有消费者共享一个事件
│  updateValue(key, val)  │
└─────────────────────────┘
         ↑ 各自订阅
    ┌────┼────┬─────────┬──────────┐
    │    │    │         │          │
 Workbench  Editor  Terminal  StatusBar   ...
 主题引擎   颜色    选项      颜色
 (单独类)  (单独类) (单独类)  (单独类)
```

每个消费者：
```
class ThemeEngine {
  constructor(
    @IConfigurationService config,   // ← DI 注入，初始化已完成
    @IThemeService theme,
  ) {
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

### 为什么 V3 不能照抄

**1. React useEffect 时序 — 先渲染后应用 → 闪烁**

VS Code 类是构造时同步 apply → 首次渲染前颜色已就位。React `useEffect` 在 DOM 提交后才跑 → 用户看到 CSS 默认色 → 然后 apply → 换色。B64 就是这个时序 bug 的直接体现。

**2. 没有 DI 容器 — init 顺序靠手动 .then() 链**

VS Code 的 InstantiationService 保证 ConfigurationService 在所有消费者之前初始化完毕。V3 的 init 是 async IIFE 里手动排列：
```
await initConfigurationService()  // 必须先完成
registerConfiguration(...)         // 然后注册
// ... 然后各个 apply 散落
```
顺序错了 → 竞态（B55）。引入 DI 容器成本太高（~500 行 + 全部组件改 constructor 注入），不值得。

**3. Tauri event listener cleanup — generation counter 模式容易忘**

VS Code 靠 `this._register()` → `DisposableStore.dispose()` 自动清理。V3 的 `useEffect` cleanup 在 StrictMode 下 double-mount 时 Tauri `listen()` 的 Promise 还未 resolve → unlisten 是 undefined → 注册两份（B11）。强制所有 listener 用 generation counter 成本高且容易忘。

**4. onApply 不是偏离 VS Code，是适配 React**

VS Code 的思路是"配置定义和消费分离，消费者自己管理生命周期"。这在 DI + Disposable 体系下零 bug。但 React 没有这个体系 — 强行照抄等于在每个 useEffect 里手写时序 + cleanup，反而引入更多 B55/B64。

`onApply` 把 VS Code 的"消费者自己管"改成了"注册时声明，框架管"。**思想一致（配置和应用解耦）、实现适配（React 的声明式风格替代 DI 的命令式风格）。**

### 对比总结

| | VS Code | V3 当前（有 bug） | V3 方案 |
|:--|:--|:--|:--|
| 定义位置 | plugin.json contributes.configuration | registerConfiguration | registerConfiguration + **onApply** |
| 应用位置 | 各消费者的 constructor | App.tsx init 散落 | 框架自动调 onApply |
| 变更监听 | 各消费者的 onDidChangeConfiguration | onDidChangeConfiguration 4 个 if | 框架自动调 onApply |
| 生命周期 | DI disposable | useEffect cleanup（容易忘） | unregisterConfiguration 自动清 |
| 加新设置 | 写 consumer 类 + 注册 | 在 init 里找位置 + 判断时序 + 设 guard | **写 onApply（一步）** |
| 出 bug 概率 | 低（DI 保证） | **高（手动管）** | **低（框架管）** |

## 三、设计

### 核心思路

**配置的"怎么存"和"怎么用"写在一起——注册时声明 apply，框架保证调用时机。**

```typescript
// 之前：数据注册和应用逻辑分离
registerConfiguration("app", {
  properties: {
    "app.accentColor": { type: "string", default: "#0078d4" },
  },
});
// App.tsx init 里散落：if (cfgAccent) applyAccentColor(cfgAccent)  ← 容易漏
// onDidChangeConfiguration 里散落：if (key === "app.accentColor") applyAccentColor(value) ← 容易漏

// 之后：数据和 apply 在一起
registerConfiguration("app", {
  properties: {
    "app.accentColor": {
      type: "string", default: "#0078d4",
      description: "自定义强调色",
      onApply: (v) => applyAccentColor(v),
    },
  },
});
// 框架保证：
// 1. init 完成后自动调一次 onApply(cfgAccent)
// 2. onDidChangeConfiguration → 自动调对应 key 的 onApply
// App.tsx init 和 onDidChangeConfiguration 里不再需要任何 app.accentColor 分支
```

### 类型扩展

```typescript
// ConfigurationRegistry.ts
interface ConfigurationProperty {
  type: "boolean" | "string" | "number";
  default: unknown;
  description: string;
  enum?: string[];
  minimum?: number;
  maximum?: number;
  onApply?: (value: unknown) => void;  // ← 新增：框架保证在 init + change 时调用
}
```

### Applier 服务

```typescript
// ConfigurationApplier.ts（新文件，~40 行）

// init 后调用一次——遍历所有注册的配置，对有 onApply 的执行 apply
export function applyAllConfigurations(): void

// onDidChangeConfiguration 时调用——只 apply 变化的 key
export function applyConfiguration(key: string, value: unknown): void

// 内部：从 ConfigurationRegistry.getMergedSchema() 读 onApply
```

### 调用点

```
App.tsx init():
  1. await initConfigurationService()
  2. registerConfiguration("app", { ... })     // 声明 + onApply
  3. registerConfiguration("terminal", { ... }) // 声明 + onApply（Phase 5f）
  4. await initPluginLoader()                   // 插件也注册 onApply
  5. applyAllConfigurations()                   // ← 统一触发，零竞态
  6. 其他初始化...

App.tsx onDidChangeConfiguration:
  1. setConfigurationValue(...) 内部 fire listeners
  2. applyConfiguration(key, value)             // ← 自动调对应 onApply
  3. 不再需要 if (key === "app.theme") ... 等分支
```

## 四、迁移的配置项

| 配置 key | 当前 apply 位置 | 迁移后 |
|:--|:--|:--|
| `app.theme` | App.tsx init + onDidChangeConfiguration if 块 | onApply: loadTheme+applyTheme |
| `app.language` | App.tsx init + onDidChangeConfiguration if 块 | onApply: i18n.changeLanguage |
| `app.accentColor` | App.tsx init + onDidChangeConfiguration if 块 | onApply: applyAccentColor |
| `terminal.*` (12 keys) | App.tsx init 逐个读 + sync effect + onDidChangeConfiguration | onApply: setTerminalPrefs per-key |

## 五、实施步骤

1. **类型扩展** — `ConfigurationProperty` 加 `onApply?: (value: unknown) => void`
2. **ConfigurationApplier** — 新建 `src/core/ConfigurationApplier.ts`：`applyAllConfigurations()` + `applyConfiguration(key, value)`
3. **迁移注册** — `App.tsx` 的 `registerConfiguration` 调用里加 `onApply`
4. **删除旧代码** — App.tsx init 里删：散落的 cfgTheme/cfgLang/cfgAccent apply 代码 + onDidChangeConfiguration 4 个 if 分支 + terminal.* sync effect + terminalPrefsReady guard ref
5. **调新管道** — init 末尾加 `applyAllConfigurations()`
6. **TypeScript + 测试** — 零错误 + 141 全过

## 六、为什么一劳永逸

**新设置只需两步，不会漏：**

```
步骤 1: registerConfiguration 里声明 { onApply: (v) => doSomething(v) }
步骤 2: 没了
```

框架自动处理：
- init 完成 → `applyAllConfigurations()` → 调 `onApply`
- 用户改设置 → `onDidChangeConfiguration` → `applyConfiguration(key, value)` → 调 `onApply`
- 插件卸载 → `unregisterConfiguration` → onApply 自动注销

**未来任何需要持久化的设置（现在还没想到的），加 `onApply` 就完事了。不需要碰 App.tsx 的 init 函数，不需要判断时序，不需要 guard ref。**
