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

## 二、VS Code 对照

VS Code 也不做"集中 apply"，但它的架构让这事不出 bug：

```
ConfigurationService.getValue(key)
ConfigurationService.onDidChangeConfiguration(event)
  → 50+ 消费者各自订阅
  → 各自过滤 affectsConfiguration(key)
  → 各自重新 apply
```

**VS Code 能这么做因为：**
- DI 容器（InstantiationService）— 初始化顺序自动保证
- Disposable 模式 — 每个消费者 constructor/dispose 生命周期严格
- 不在 React 里 — 没有 useEffect 的"渲染后才跑"时序问题

**V3 不能直接照搬因为：**
- React `useEffect` 在渲染后跑 → 有颜色闪烁（B64 的症状）
- Tauri event listener cleanup 需要 generation counter 模式（B11）
- 没有 DI 容器 → init 顺序手动 `.then()` 链 → 竞态（B55）

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
