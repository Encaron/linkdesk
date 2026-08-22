# ShellEvents 类型系统——壳内通信契约

> 2026-08-02。**E5 第 1 层第 1 轮。** 壳内四个区域解耦的前提——先有类型安全的通信协议。
> 执行清单任务：E5#1、E5#2

---

## 一、前因——为什么需要这个

### 1.1 现在的问题

壳内四个区域（IconBar / SidePanel / MainContent / StatusBar）通过 props 直接通信：

```tsx
// App.tsx（当前）
<IconBar
  icons={pluginList}              // App 知道插件列表
  activeIconId={sidebarView}      // App 知道侧栏状态
  onIconClick={handleIconClick}   // App 知道要点哪个图标
/>
<SidePanel
  activePluginId={sidebarView}    // App 知道侧栏显示谁
  onClose={handleCloseSidebar}    // App 知道怎么关
/>
```

**每个区域 import 至少一个邻居。改一个区域的内部逻辑 → 可能炸另外三个。**

### 1.2 目标

```typescript
// IconBar.tsx（改造后）
const handleClick = (pluginId: string) => {
  shellEvents.emit("icon:selected", pluginId);
};
// IconBar 不知道 SidePanel 存在。不知道点了图标之后会发生什么。
```

```
IconBar      ──emit("icon:selected")──→  SidePanel（订阅）
SidePanel    ──emit("sidebar:toggled")─→ IconBar（订阅）
MainContent  ──emit("tab:focused")─────→ SidePanel + StatusBar（订阅）
StatusBar    ──（只订阅，不 emit）
```

### 1.3 对标

| VS Code | LinkDesk |
|---------|----------|
| `IInstantiationService` + `Event` | `Emitter`（已有基础设施） |
| `IContextKeyService` | `ContextKeyService`（已有） |
| 无统一的 Shell Events 类型 | **ShellEvents 类型表（本任务）** |

---

## 二、设计方案

### 2.1 核心——ShellEvents 类型表

```typescript
// src/core/ShellEvents.ts —— 壳内通信唯一类型定义

/**
 * 壳内事件类型表。
 * 壳内四个区域（IconBar / SidePanel / MainContent / StatusBar）
 * 只通过这张表通信——不 import 对方。
 *
 * 加新事件 = 在这里加一行。tsc 自动检查所有 emit/on 的签名。
 */
export interface ShellEvents {
  // ── 图标栏 ──
  /** 用户点击图标栏图标。payload = pluginId */
  "icon:selected": string;
  /** 开始拖拽图标排序。payload = pluginId */
  "icon:drag-start": string;
  /** 拖拽排序完成。payload = 新 pluginId 顺序数组 */
  "icon:reordered": string[];

  // ── 侧栏 ──
  /** 侧栏展开/折叠。payload = 是否正在打开 */
  "sidebar:toggled": boolean;
  /** 侧栏容器切换。payload = 当前活跃 containerId，null = 无活跃容器。
   *  IconBar 订阅此事件更新高亮——不需要知道具体是谁触发的切换。 */
  "sidebar:containerChanged": string | null;

  // ── 标签页 ──
  /** 标签页切换。payload = 新聚焦的标签页信息 */
  "tab:focused": { pluginId: string; tabId: string };

  // ── 状态栏 ──
  /** 状态栏条目更新。payload = 新条目列表 */
  "statusbar:update": StatusBarEntry[];

  // ── 布局 ──
  /** 壳区域大小变化。payload = 区域 ID + 新尺寸 */
  "zone:resized": { zone: string; bounds: { x: number; y: number; width: number; height: number } };

  // ── 工作区 ──
  /** 活跃工作区切换 */
  "workspace:changed": string;  // activeWorkspaceUri
}

/**
 * 状态栏条目类型（从现有 StatusBar 接口提取）
 */
export interface StatusBarEntry {
  id: string;
  text: string;
  tooltip?: string;
  alignment: "left" | "right";
  priority?: number;
}
```

### 2.2 类型安全包装——基于现有 Emitter

```typescript
// src/core/ShellEvents.ts（续）

import { Emitter, Event } from "./CoreEvents";

/**
 * 类型安全的壳内事件总线。
 * 基于现有 Emitter 基础设施——不改底层，只加类型层。
 */
export class ShellEventBus {
  private _emitters = new Map<string, Emitter<any>>();

  /**
   * 发送事件。tsc 检查 payload 类型。
   * shellEvents.emit("icon:selected", "marketplace");        // ✅
   * shellEvents.emit("icon:selected", { id: "x" });          // ❌ tsc 报错
   * shellEvents.emit("nonexistent", ...);                     // ❌ tsc 报错
   */
  emit<K extends keyof ShellEvents>(event: K, payload: ShellEvents[K]): void {
    const emitter = this._emitters.get(event);
    if (emitter) {
      emitter.fire(payload);
    }
    // dev 模式事件追踪
    if (process.env.NODE_ENV === "development") {
      console.log(
        `[ShellEvents] emit "${event}" →`,
        typeof payload === "object" ? JSON.stringify(payload) : payload
      );
    }
  }

  /**
   * 订阅事件。tsc 检查 handler 签名。
   * 返回 unsubscribe 函数——调用方必须在 useEffect cleanup 中调用。
   */
  on<K extends keyof ShellEvents>(
    event: K,
    handler: (payload: ShellEvents[K]) => void
  ): () => void {
    if (!this._emitters.has(event)) {
      this._emitters.set(event, new Emitter<any>());
    }
    const emitter = this._emitters.get(event)!;
    const disposable = emitter.event(handler);

    return () => disposable.dispose();
  }

  /** 移除某个事件的所有订阅者 */
  dispose(event: keyof ShellEvents): void {
    this._emitters.delete(event);
  }
}

/** 全局单例——壳内通信唯一枢纽 */
export const shellEvents = new ShellEventBus();
```

### 2.3 为什么基于 Emitter 而不是新建

- `Emitter` 是 E3 已经验证的基础设施——`CoreEvents.ts` 中所有核心事件都用它
- `Event<T>` 接口已有 `dispose()` 模式——E3j #77 事件系统归一化后已经稳定
- 不加新依赖、不改底层——只在上面加类型层

---

## 三、实现步骤

### E5#1a 新建 src/core/ShellEvents.ts（~30 行）

**内容：** `ShellEvents` 接口定义——全部壳内事件。

**验证：** `tsc --noEmit` 零错误。`ShellEvents` 类型可被 import。

### E5#1b ShellEventBus 类（~20 行）

**内容：** `emit<K>` + `on<K>` 类型安全方法。

```typescript
// 关键实现细节：
emit<K extends keyof ShellEvents>(event: K, payload: ShellEvents[K]): void {
  // 1. 查找或创建该事件的 Emitter
  // 2. fire(payload)
  // 3. dev 模式 console.log 事件流
}

on<K extends keyof ShellEvents>(
  event: K,
  handler: (payload: ShellEvents[K]) => void
): () => void {
  // 1. 查找或创建该事件的 Emitter
  // 2. 订阅 handler
  // 3. 返回 unsubscribe 函数——关键：调用方必须在 useEffect cleanup 调用
}
```

**验证：**
```typescript
// 编译通过
shellEvents.emit("icon:selected", "marketplace");
shellEvents.on("icon:selected", (pluginId: string) => { ... });  // pluginId 类型推断为 string

// 编译失败——tsc 当场报错
shellEvents.emit("icon:selected", { id: "x" });  // ❌ 不是 string
shellEvents.on("icon:selected", (x: number) => {});  // ❌ handler 签名不对
```

### E5#1c 事件追踪（dev 模式）（~15 行）

**内容：** `emit()` 内部 dev 模式打印事件流。每个 handler 执行耗时测量。

```typescript
if (process.env.NODE_ENV === "development") {
  const start = performance.now();
  emitter.fire(payload);
  const elapsed = (performance.now() - start).toFixed(1);
  console.log(
    `[ShellEvents] emit "${event}" →`,
    typeof payload === "object" ? JSON.stringify(payload) : payload,
    `(${elapsed}ms)`
  );
}
```

**dev 模式控制台输出示例：**
```
[ShellEvents] emit "icon:selected" → "marketplace" (0.3ms)
[ShellEvents] emit "sidebar:toggled" → true (0.1ms)
[ShellEvents] emit "tab:focused" → {"pluginId":"serial-monitor","tabId":"serial-1"} (0.2ms)
```

### E5#2a 基于现有 Emitter 基础设施（~10 行）

**内容：** `ShellEventBus` 内部用 `Emitter` 类——不是新建事件系统。

```typescript
import { Emitter } from "./CoreEvents";  // 现有基础设施
```

**验证：** `CoreEvents.ts` 的 `Emitter` 类零改动。

### E5#2b 导出单例（~3 行）

```typescript
export const shellEvents = new ShellEventBus();
```

**验证：** 任何组件 `import { shellEvents } from "@src/core/ShellEvents"`——所有组件共享同一个总线。

---

## 🔴 预测 Bug——git 历史十堂课

### Bug E5-1a 🔴🔴🔴 事件类型漂移——emit 和 on 签名不匹配

**历史：** E3j #77 events 系统——`emit("serial:rawData", data)` payload 是 any。没有编译器保证 emit 和 on 的参数类型一致。

**E5 触发条件：** 一个 AI 改 IconBar emit 签名 → SidePanel 的 on handler 拿到的类型不对 → 运行时静默炸。

**🔥 防线——ShellEvents 类型表 + 泛型 emit/on：**
```typescript
// shellEvents.emit 的泛型确保 tsc 检查：
emit<K extends keyof ShellEvents>(event: K, payload: ShellEvents[K]): void
// 写错 → tsc 当场报错，不等到运行时
```

**🛡️ vitest：**
```typescript
// ShellEvents.test.ts
it("emit 和 on 类型匹配——tsc 编译期保证", () => {
  // 以下代码如果编译通过 = 类型正确
  shellEvents.on("icon:selected", (pluginId: string) => {
    expect(typeof pluginId).toBe("string");
  });
  shellEvents.emit("icon:selected", "marketplace");
});
```

---

### Bug E5-1b 🔴🔴 事件订阅泄漏——unmount 忘清理

**历史：** E3j #81——`_initIPC()` 模块级注册 IPC 监听器，永不清理→壳 fallback 切空 div 后僵尸回调。**已有 ESLint 规则 `no-module-level-ipc-listener` 机械拦截模块级注册——但 useEffect cleanup 缺失无机械拦截。**

**E5 触发条件：** 四个区域各有 2-4 个 `shellEvents.on()` → 总共 8-16 个事件订阅。任一区域 unmount 时忘调 unsubscribe → 僵尸回调。

**🔥 防线——文档强制模式：**
```typescript
// ✅ 正确——useEffect cleanup 返回 unsubscribe
useEffect(() => {
  const unsub1 = shellEvents.on("icon:selected", handleIconSelected);
  const unsub2 = shellEvents.on("sidebar:toggled", handleSidebarToggled);
  return () => { unsub1(); unsub2(); };  // ← 🔥 这行忘了 = 内存泄漏 + 僵尸回调
}, []);

// ❌ 错误——模块级注册（ESLint 已拦截）
shellEvents.on("icon:selected", handleIconSelected);  // 永不清理
```

**🛡️ 代码审查检查项：** 每个 `shellEvents.on()` 调用点 → grep 所在函数的 cleanup path → 确认有对应的 unsubscribe。

---

### Bug E5-1c 🔴 事件风暴——两个区域互相触发形成死循环

**历史：** 无直接历史——这是 ShellEvents 的新生风险。

**E5 触发条件：**
```
IconBar emit("icon:selected") 
  → SidePanel on("icon:selected") → 切换容器 → emit("sidebar:toggled", true)
    → IconBar on("sidebar:toggled") → 更新高亮 → emit("icon:selected", ...)  ← 死循环！
```

**🔥 防线——emit 内部 guard：**
```typescript
emit<K extends keyof ShellEvents>(event: K, payload: ShellEvents[K]): void {
  // 🛡️ 防重入——同一个事件正在处理中时跳过
  if (this._processing.has(event)) return;
  this._processing.add(event);
  try {
    this._emitters.get(event)?.fire(payload);
  } finally {
    this._processing.delete(event);
  }
}
```

**🛡️ dev 模式检测：** 同一事件 100ms 内 emit 超过 10 次 → console.warn 警告可能死循环。

---

## 四、涉及文件与影响面

| 文件 | 改动 | 行数 |
|------|------|:--:|
| 新 `src/core/ShellEvents.ts` | ShellEvents 接口 + ShellEventBus 类 + 单例导出 | ~80 |
| `src/core/CoreEvents.ts` | 零改动——Emitter 已就绪 | 0 |
| `src/App.tsx` | E5#7 中改造——不再 import 四个区域 | 0（本轮） |
| `src/components/IconBar.tsx` | E5#3 中改造——只 emit 事件 | 0（本轮） |
| `src/components/SidePanel.tsx` | E5#4 中改造——只订阅事件 | 0（本轮） |
| `src/components/MainContent.tsx` | E5#5 中改造——只订阅+emit 事件 | 0（本轮） |
| `src/components/StatusBar.tsx` | E5#6 中改造——只订阅事件 | 0（本轮） |

**本任务只在核心加一张桌子。四个区域的改造在 E5#3–#8 中执行。** 不碰任何现有组件代码。

---

## 五、完工标准

- [ ] `ShellEvents` 接口定义全部壳内事件
- [ ] `ShellEventBus` 类——emit/on 类型安全
- [ ] dev 模式打印完整事件流
- [ ] `shellEvents` 单例导出
- [ ] `npm run check` 零错误（tsc + ESLint + vitest）
- [ ] vitest `ShellEvents.test.ts`——emit/on 类型匹配、unsubscribe 清理、事件追踪输出、防重入 guard
- [ ] 类型测试——错误的 emit 签名 → tsc 报错（手动验证）
- [ ] 现有功能不受影响——ShellEvents 尚未被任何组件使用，零风险

---

> **← E5 索引：** `../00-README.md`
> **← 执行清单：** `../05-执行清单.md` E5#1–#2
> **→ 下一专题：** `壳内低耦合-IconBar改造.md`（E5#3）
