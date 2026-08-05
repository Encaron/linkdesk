# App 启动集成测试

> 2026-08-06。盲审建议：App.tsx 的 `initAll()` 链有 7 步异步初始化，任何一步静默失败都可能导致半残启动。一个 mock 所有依赖 + 验证 layout restore 的测试就能兜底。
> 位于 E5 收尾 → `05-收尾/功能补全/`

---

## 一、问题

`App.tsx` 的初始化链路：

```
initAll()
  → init i18n
  → init ConfigurationService
  → init PluginStateService
  → init LayoutService
  → load plugins (loader.ts ~1569 行)
  → restore layout
  → ShellEvents emit ready
```

7 步异步，全串行。任何一步 fail → 后面的都不执行 → 半残启动（白屏 / 无侧栏 / 无图标 / 无标签页 / 配置不生效 / 布局错乱）。

当前验证方式：E5#56 E2E 冒烟测试——5 条**手动**操作。无自动化集成测试。

---

## 二、测试范围

### 核心场景（必须有）

1. **全链路正常启动：** mock 所有依赖 → `initAll()` → 验证 layout restore + 插件加载完成
2. **i18n 失败：** mock `i18n.init` reject → 验证 fallback 英文 + 不崩溃
3. **ConfigurationService 失败：** mock reject → 验证默认配置生效 + 不白屏
4. **LayoutService 失败：** mock reject → 验证默认布局（单面板）生效
5. **插件加载失败：** loader 抛异常 → 验证保底标签页（welcome）出现

### 边界场景（加分）

6. **StrictMode 双重 mount：** `initAll()` 被调两次 → 第二次立即返回（`_initialized` guard）
7. **异步时序：** layout restore 在插件加载完成**之前**不执行

---

## 三、修复方案

### 测试框架

项目已有 vitest + `vitest.setup.ts`（mock `window.linkdesk`）。本测试继续用 vitest。

### 架构准备——initAll 可测试化

当前 `initAll()` 可能是 App.tsx 内部的私有函数。要测试需要：

**方案 A：提取为独立模块**

```typescript
// src/core/services/AppInitializer.ts
export async function initAll(deps: InitDeps): Promise<InitResult> {
  // 7 步初始化，依赖通过参数注入
}

interface InitDeps {
  i18n: { init: () => Promise<void> };
  configService: ConfigurationService;
  pluginState: PluginStateService;
  layoutService: LayoutService;
  loader: { loadAllPlugins: () => Promise<void> };
}
```

**方案 B：mock window.linkdesk 注入失败**

不改架构——mock `window.linkdesk.configuration.get` / `window.linkdesk.pluginState.get` 等返回 reject。

### 示例测试

```typescript
// src/__tests__/AppInit.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

describe("App 启动链路", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("全链路正常启动 → layout restore", async () => {
    // mock 所有依赖成功
    const { initAll } = await import("../core/AppInitializer");
    const result = await initAll(mockDeps);
    expect(result.layoutRestored).toBe(true);
    expect(result.pluginsLoaded).toBeGreaterThan(0);
  });

  it("i18n 失败 → fallback 英文，不崩溃", async () => {
    mockDeps.i18n.init = vi.fn().mockRejectedValue(new Error("i18n failed"));
    const result = await initAll(mockDeps);
    expect(result.i18nReady).toBe(false);
    expect(result.crashed).toBe(false);
  });

  it("LayoutService 失败 → 默认布局", async () => {
    mockDeps.layoutService.restore = vi.fn().mockRejectedValue(new Error("layout failed"));
    const result = await initAll(mockDeps);
    expect(result.layoutRestored).toBe(false);
    expect(result.crashed).toBe(false);
  });

  it("插件加载失败 → welcome 保底", async () => {
    mockDeps.loader.loadAllPlugins = vi.fn().mockRejectedValue(new Error("loader failed"));
    const result = await initAll(mockDeps);
    expect(result.fallbackActive).toBe(true);
  });
});
```

---

## 四、可能遇到的问题

### 1. initAll 紧耦合 App.tsx

**风险：** 初始化逻辑内嵌在 App.tsx useEffect 中——不像 E5#44 提取命令那样容易抽离。

**缓解：** 先提取——对标 E5#44 的 `coreCommands` 拆分。把 App.tsx 中 `useEffect` 的 init 链提到独立函数/模块。

### 2. mock 代价高

**风险：** 全链路涉及 i18n、ConfigurationService、PluginStateService、LayoutService、loader、ShellEvents——mock 8+ 个依赖。

**缓解：** 不是 E2E 测试（不需要真实 Electron），是**集成测试**（验证错误传播和退化逻辑）。mock 越多越好——精确控制失败点。

### 3. 测试和实际行为偏差

**风险：** mock 的 reject 行为可能和真实失败行为不一致（如真实 i18n.init 可能部分成功）。

**缓解：** 集成测试只验证"失败后不崩溃 + 有兜底"，不验证"失败后状态和真实一致"——那是 E2E 的职责。

---

## 五、涉及文件

| 文件 | 改动 |
|:--|:--|
| `src/core/services/AppInitializer.ts` | **新建**——提取 App.tsx init 链为可测试函数 |
| `src/App.tsx` | useEffect → 调 `initAll(deps)` |
| `src/__tests__/AppInit.test.ts` | **新建**——5+ 条集成测试 |

**改动量：** ~100 行提取 + ~80 行测试。投入时间 ~1-2h。

---
