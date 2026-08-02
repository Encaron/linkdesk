# 壳内低耦合——StatusBar 改造

> 2026-08-02。**E5 第 1 层第 2 轮。** StatusBar 只订阅事件——不 import IconBar/SidePanel/MainContent。
> 执行清单任务：E5#6

---

## 一、当前状态——最不耦合的子组件

### 1.1 Props（来自 App.tsx L876-882——5 个 prop）

```typescript
// StatusBar.tsx L20-26
interface StatusBarProps {
  error?: string | null;       // 串口错误信息
  theme?: string;              // 当前主题名（显示用）
  lang?: "zh" | "en";          // 当前语言（显示用）
  onToggleTheme?: () => void;  // 主题切换回调
  onToggleLang?: () => void;   // 语言切换回调
}
```

### 1.2 直接依赖（绕过 App props——已经是最佳实践）

| 依赖 | 行号 | 方式 |
|------|:--:|------|
| `getStatusBarContributions()` | L38 | 直接读 viewRegistry——插件声明式条目 |
| `getDynamicStatusBarItems()` | L38 | 直接读 StatusBarService——动态条目 |
| `onDidChangeStatusBar.event` | L33-35 | 订阅动态条目变化 |
| `getViewPlugin(pluginId)` | L91 | 查插件是否有 statusBarComponent |
| `executeCommand(item.onClick!)` | L119 | 条目点击走命令系统 |
| `NotificationCenter` | L166 | **直接渲染另一个壳组件** |

**StatusBar 已经是解耦的黄金标准：** 大部分数据从服务层拿、不依赖 App 的复杂 props。

**改造量极小——主要是事件订阅替代 props + 移出 NotificationCenter。**

---

## 二、改造方案

### 2.1 目标

```typescript
// StatusBar.tsx（改造后）
interface StatusBarProps {
  style: { position: "fixed"; x: number; y: number; width: number; height: number };
  // 不再需要 error/theme/lang/onToggleTheme/onToggleLang props
}

// 主题/语言信息 → 从 ConfigurationService 直接读（当前已在用）
// 标签页切换 → 订阅 shellEvents
// NotificationCenter → App.tsx 渲染在独立 slot
```

### 2.2 具体改动

#### E5#6a 取消 import 邻居（−3 行）

```diff
- import { NotificationCenter } from "./NotificationCenter";
+ // NotificationCenter 由 App 渲染在独立 slot——不再寄生在 StatusBar 内
```

**L166——删 `<NotificationCenter />` 渲染。**

#### E5#6b 订阅 tab:focused 事件（~5 行）

```typescript
import { shellEvents } from "@src/core/ShellEvents";

// 取代 onToggleTheme / onToggleLang props
useEffect(() => {
  const unsub = shellEvents.on("tab:focused", ({ pluginId, tabId }) => {
    // 更新状态栏——显示当前活跃插件的条目
    // 当前这个逻辑已经在 StatusBarService 中——订阅 onDidChangeStatusBar 即可
  });
  return unsub;
}, []);
```

#### E5#6c 订阅 statusbar:update 事件（~5 行）

```typescript
useEffect(() => {
  const unsub = shellEvents.on("statusbar:update", (entries) => {
    // 动态更新状态栏条目
    setDynamicEntries(entries);
  });
  return unsub;
}, []);
```

#### E5#6d useEffect cleanup（~5 行）

```typescript
useEffect(() => {
  const unsub1 = shellEvents.on("tab:focused", handleTabFocused);
  const unsub2 = shellEvents.on("statusbar:update", handleStatusBarUpdate);
  const unsub3 = onDidChangeStatusBar.event(forceUpdate);
  return () => { unsub1(); unsub2(); unsub3.dispose(); };
}, []);
```

#### E5#6e 主题/语言切换走命令系统（~3 行）

```typescript
// 当前 onToggleTheme / onToggleLang 回调
// 改造后——走命令系统（已在用 executeCommand）
const handleToggleTheme = () => {
  executeCommand("workbench.action.selectTheme");
};
const handleToggleLang = () => {
  executeCommand("workbench.action.selectLanguage");
};
```

**这些命令已在 `coreCommands.ts` 中注册——不依赖 App props。**

#### E5#6f 删 NotificationCenter 渲染

**L166 删：**
```diff
- {notificationCenterOpen && <NotificationCenter />}
```

**NotificationCenter 去 App.tsx 的独立 slot（或浮动面板）。**

---

## 🔴 预测 Bug

### Bug E5-6a 🔴 和弦键盘显示（chord）——全局 window 事件

**当前：** L63-87——StatusBar 订阅 `window CUSTOM_EVENTS.CHORD_CHANGED` 显示和弦键（如 `Ctrl+K` 等待第二个键）。

**这是 StatusBar 的内部功能。** 不受解耦影响——保留不变。

---

### Bug E5-6b 🔴 getConfigurationValue 在组件外调用——闭包过期

**当前：** L103——`getConfigurationValue<boolean>(configKey)` 在 filter closure 中调用——不在 React 渲染上下文内 → 配置变化后不会触发重过滤。

**这是已存在的 bug——不属于 E5。** 修复方式：移到 `useEffect` 或订阅 `onDidChangeConfiguration`。可在 E5 后处理。

---

## 三、涉及文件

| 文件 | 改动 | 行数 |
|------|------|:--:|
| `src/components/StatusBar.tsx` | 删 NotificationCenter 渲染、删 props、加事件订阅 | ~10 |
| `src/App.tsx` | 删 error/theme/lang 等 prop 传递、加 NotificationCenter slot | −5 / +5（E5#7 做） |

---

## 四、完工标准

- [ ] StatusBar 不再接收 error/theme/lang/onToggleTheme/onToggleLang props
- [ ] 标签页切换 → StatusBar 自动更新（通过事件 + StatusBarService）
- [ ] 主题/语言切换走命令系统——和当前行为一致
- [ ] 和弦键盘提示（Ctrl+K...）正常
- [ ] NotificationCenter 移到 App 的独立 slot
- [ ] `npm run check` 零错误

---

> **← E5 索引：** `../00-README.md`
> **← 执行清单：** `../05-执行清单.md` E5#6
> **← 前置：** `ShellEvents类型系统.md`（E5#1–#2）
