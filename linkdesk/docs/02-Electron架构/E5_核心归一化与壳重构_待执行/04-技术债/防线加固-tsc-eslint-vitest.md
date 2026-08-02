# 防线加固——tsc 盲区、vitest 环境、ESLint 违例

> 2026-08-02。**E5 新增任务。** tsc 不扫 `plugins/user/`、vitest 用 node 环境导致 10 测试失败、2 个硬约束违例。
> 执行清单任务：E5#45、E5#46、E5#47

---

## 一、vitest `environment: "node"` → `"jsdom"`

### 现状

```typescript
// vitest.config.ts L7
environment: "node",
```

**10 个测试失败。** 全部在 `FileTreeDnD.test.ts`——测试调用链最终到 `DialogService.showConfirm` → `window.confirm` → node 环境没有 `window`。

### 修复

```diff
- environment: "node",
+ environment: "jsdom",
```

**jsdom 提供 `window` / `document` 等浏览器 API。** LinkDesk 是 Electron 应用，测试必须模拟浏览器环境。

### 验证

```bash
npx vitest run  # 270/270 通过，零失败
```

---

## 二、tsconfig `exclude: ["plugins/user"]` → 删除

### 现状

```json
// tsconfig.json L24
"exclude": ["plugins/user"]
```

**`plugins/user/serial-monitor/` 不受 tsc 保护。** 导入拼写错、类型错误——全静默。已发生过的事故：`TREE_TREE_ITEM_HEIGHT` 多写前缀（E3.6 Bug 5 `40368c3`）。

### 修复

```diff
- "include": ["src", "plugins/builtin"],
- "exclude": ["plugins/user"]
+ "include": ["src", "plugins/builtin", "plugins/user"]
```

**ESLint 已覆盖 `plugins/user/`（E3.6#14 验证通过）。** tsc 也必须覆盖——类型错误和 import 错误需要编译期拦截。

### 验证

```bash
npx tsc --noEmit  # 检查是否出现新的类型错误。如果有 → 修掉再提交
```

---

## 三、2 个 CardRegistry ESLint error

### 现状

| 文件 | 行 | 内容 |
|------|:--:|------|
| `src/pluginLoader/lifecycle.ts` | L24 | `import '../core/CardRegistry'` |
| `src/core/__tests__/RegistryLifecycle.test.ts` | L16 | `import '../CardRegistry'` |

**硬约束 #3：标签页系统不持有/访问/导入 CardRegistry。**

### 调查

`lifecycle.ts` 导入 CardRegistry 做什么？如果是在 `PLUGIN_REMOVED` 时做清理——应该改为通过 Emitter 事件而非直接 import。`lifecycle.ts` 已有 `PLUGIN_REMOVED` 事件——CardRegistry 自己订阅清理自己。

`RegistryLifecycle.test.ts` 是测试文件——测试 CardRegistry 是否正确清理。如果 lifecycle 不再直接调 CardRegistry——测试也应改为事件驱动。

### 修复

**调查后决定——修复 lifecycle 或更新 ESLint 规则允许 `lifecycle.ts` + `__tests__/` 特例。** 不作为 E5 的强制执行——视调查结果定。

---

## 实现步骤

### E5#45 vitest 环境

- [ ] **E5#45** `vitest.config.ts` L7——`environment: "node"` → `"jsdom"` | 1 行
- [ ] 验证——`npx vitest run` 270/270 通过

### E5#46 tsconfig 覆盖

- [ ] **E5#46** `tsconfig.json`——`exclude: ["plugins/user"]` → 删除，`include` 加 `"plugins/user"` | −1/+1
- [ ] 验证——`npx tsc --noEmit` 零错误（如果有新错误→先修）

### E5#47 CardRegistry ESLint error

- [ ] **E5#47a** 调查 `lifecycle.ts` L24 的 CardRegistry import——是否可通过 Emitter 替代 | ~10 行调查
- [ ] **E5#47b** 如有新 tsc 错误（E5#46 暴露的）→ 一并修 | 视情况

---

> **← E5 索引：** `../00-README.md`
> **← 执行清单：** `../05-执行清单.md` E5#45–#47
