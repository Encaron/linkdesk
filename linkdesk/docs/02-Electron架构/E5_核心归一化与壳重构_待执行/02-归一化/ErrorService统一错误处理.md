# 错误处理归一化——ErrorService

> 2026-08-02。**E5 新增任务。** 审计发现 5 种错误处理模式——静默吞/动态绕路/状态栏一闪/硬编码中文。
> 执行清单任务：E5#38（ErrorService 统一入口）、E5#39（逐处替换）

---

## 一、前因——五种错误处理

### 模式 1：FileService——静默吞掉（"别烦我"）

```typescript
// src/core/FileService.ts L39-53
function api() {
  return (window as any).linkdesk?.filesystem as { ... } | undefined;
}

export async function listDir(dirPath: string): Promise<FileEntry[]> {
  const a = api();
  if (!a) return [];  // ← IPC 不可用？返回空数组。调用方得到 []——以为是空目录
  return a.listDir(dirPath);  // ← 这里抛异常？冒泡到调用方——调用方可能没 catch
}
```

**所有 9 个 FileService 方法同一模式。** 没有 `console.error`，没有 toast。IPC 不可用时静默返回兜底值——调用方完全不知情。

### 模式 2：ConfigurationService——"什么都别说"

```typescript
// src/core/ConfigurationService.ts L137
for (const fn of _changeListeners) {
  try { fn(key, value, scope); } catch { /* 监听器异常不阻断 */ }
}
```

**监听器回调里 ref 为 null 炸了 → catch 吞掉 → UI 不刷新。** 用户改了配置但界面不动——开发者完全没有线索。

### 模式 3：CommandRegistry——"告诉用户，但绕过 DND"

```typescript
// src/core/CommandRegistry.ts L113-119
try { return await cmd.handler(token, ...args); }
catch (err) {
  console.error(`[CommandRegistry] 命令 "${commandId}" 执行出错:`, err);
  // 🔴 动态 import 绕过循环依赖——也绕过了 NotificationService 的 DND 过滤
  import("./toast").then(({ pushToast }) => {
    pushToast({ message: `命令 "${cmd.title}" 执行出错: ${msg}`, severity: "error" });
  });
}
```

**有 toast 是对的。** 但 `import("./toast")` 绕过了 `NotificationService.pushToast` 的 DND（勿扰）过滤——DND 模式下这个 toast 还是弹。根因：`CommandRegistry` 不能直接 import `NotificationService`——循环依赖。

### 模式 4：串口 App.tsx——"状态栏一闪"

```typescript
// src/App.tsx L83, L658, L669, L682
const [lastError, setLastError] = useState<string | null>(null);
catch (e: any) {
  setLastError(`串口操作失败：${e?.message || e}`);  // ← 硬编码中文 + 被后一个操作覆盖
}
```

**错误存进 React state → StatusBar 渲染。** 切标签页后状态栏不显示串口状态——用户看不到错过。而且没有 toast。

### 模式 5：plugin loader——"唯一正确的"

```typescript
// src/pluginLoader/loader.ts L32
import { pushToast, TOAST_TTL_ERROR } from "../core/NotificationService";
pushToast({ message: `插件 "${pluginId}" 加载失败: ...`, severity: "error", ttl: TOAST_TTL_ERROR });
```

**标准 toast 调用——走 NotificationService、受 DND 保护。** 但它是唯一的——其他模块都没跟上。

---

## 二、根因——不是写错了，是先后加的系统

```
时间线：
  串口 App.tsx      → 写时还没有 toast 系统 → setLastError
  FileService       → 一直没加错误处理
  ConfigurationService → "监听器不应该炸"——没有 reserve channel 报告
  toast 系统        → E3e 加的
  CommandRegistry   → toast 加了，但循环依赖堵路 → 绕路
  plugin loader     → 后来加代码 → 正确用了 NotificationService
```

**新代码对了，老代码没跟上。**

---

## 三、解决方案

### E5#38——新建 ErrorService（零依赖，谁都可以 import）

```typescript
// src/core/ErrorService.ts

/**
 * 统一错误报告——全项目唯一入口。
 * 零依赖——不 import 任何可能形成循环依赖的模块。
 *
 * @param opts.message - 用户可见错误信息（走 t()）
 * @param opts.source  - 来源（"serial-monitor" / "file-tree" / "core"）
 * @param opts.error   - 原始 Error 对象（console.error 用）
 * @param opts.severity - toast 类型，默认 "error"
 * @param opts.silent   - true = 只 console.error，不 toast
 */
export function reportError(opts: {
  message: string;
  source?: string;
  error?: unknown;
  severity?: "error" | "warning" | "info";
  silent?: boolean;
}): void {
  // 1. 始终 console.error——开发者必见
  const src = opts.source || "core";
  console.error(`[${src}] ${opts.message}`, opts.error);

  // 2. 非静默 → toast（用户可见）
  if (!opts.silent) {
    // 动态 import 避免反向依赖——toast.ts 是最底层模块
    import("../core/toast").then(({ pushToast }) => {
      pushToast({
        message: opts.message,
        severity: opts.severity || "error",
        source: opts.source,
      });
    });
  }
}
```

**为什么 `toast.ts` 不会形成循环依赖：** `toast.ts` 是纯数据队列——不 import 任何核心服务。它是依赖图的叶子节点。`ErrorService` import 叶子节点——安全。

### E5#39——逐处替换

#### E5#39a FileService

```diff
- export async function listDir(dirPath: string): Promise<FileEntry[]> {
-   const a = api();
-   if (!a) return [];
-   return a.listDir(dirPath);
+ export async function listDir(dirPath: string): Promise<FileEntry[]> {
+   const a = api();
+   if (!a) { reportError({ message: "filesystem API 不可用", source: "core", silent: true }); return []; }
+   try {
+     return await a.listDir(dirPath);
+   } catch (e) {
+     reportError({ message: `listDir 失败: ${dirPath}`, source: "core", error: e });
+     return [];
+   }
```

**所有 9 个方法同样的 try/catch + reportError 包装。** 保留兜底返回值——不改变调用方的逻辑，但加日志。

#### E5#39b ConfigurationService——监听器至少打日志

```diff
for (const fn of _changeListeners) {
-  try { fn(key, value, scope); } catch { /* 监听器异常不阻断 */ }
+  try { fn(key, value, scope); } catch (e) {
+    console.error("[ConfigurationService] 监听器异常:", e);
+  }
}
```

#### E5#39c CommandRegistry——用 ErrorService，不再 import toast

```diff
catch (err) {
-  console.error(`[CommandRegistry] 命令 "${commandId}" 执行出错:`, err);
-  import("./toast").then(({ pushToast }) => {
-    pushToast({ message: `命令 "${cmd.title}" 执行出错: ${msg}`, severity: "error" });
-  });
+  reportError({
+    message: t("命令执行出错: {{name}}", { name: cmd.title }),
+    source: "core",
+    error: err,
+  });
```

#### E5#39d App.tsx 串口——setLastError → reportError

```diff
catch (e: any) {
-  setLastError(`串口操作失败：${e?.message || e}`);
+  reportError({
+    message: t("串口操作失败: {{msg}}", { msg: e?.message || String(e) }),
+    source: "serial-monitor",
+    error: e,
+  });
```

#### E5#39e loader/lifecycle——pushToast → reportError

```diff
- pushToast({ message: `插件 "${pluginId}" 加载失败: ${msg}`, severity: "error", ttl: TOAST_TTL_ERROR });
+ reportError({ message: t("插件加载失败: {{id}}", { id: pluginId }), source: pluginId, error: e });
```

---

## 四、完工标准

- [ ] `reportError()` 是全局唯一错误入口——grep `pushToast\|setLastError\|import.*toast.*pushToast` 仅 ErrorService 和 NotificationService 中有
- [ ] FileService 所有方法有 try/catch + reportError——IPC 错误开发者可见
- [ ] ConfigurationService 监听器异常 console.error 可见
- [ ] CommandRegistry 不再动态 import toast——走 ErrorService
- [ ] 串口错误 toast 可见 + 状态栏显示（通过 reportError + 订阅 ShellEvents）
- [ ] `npm run check` 零错误

---

> **← E5 索引：** `../00-README.md`
> **← 执行清单：** `../05-执行清单.md` E5#38、E5#39
