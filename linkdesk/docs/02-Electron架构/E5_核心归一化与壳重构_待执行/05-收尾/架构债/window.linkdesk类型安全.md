# `window.linkdesk` 类型安全——global.d.ts

> 2026-08-06。盲审建议。30 分钟投入，消除 `src/` 中 20+ 文件的 `(window as any).linkdesk`。
> 位于 E5 收尾 → `05-收尾/架构债/`

---

## 一、问题

全项目 ~20+ 文件使用 `(window as any).linkdesk` 访问插件 API。`tsconfig.json` 中 `strict: true`，但 `window.linkdesk` 没有类型声明 → 所有访问退化到 `any`——类型安全缺口。

```typescript
// 当前——全项目遍地
const lk = (window as any).linkdesk;
lk.tabs.create("editor", { ... });
lk.path.normalize(filePath);
```

---

## 二、修复方案

新建 `src/types/global.d.ts`：

```typescript
// src/types/global.d.ts
import type { LinkDeskAPI } from "../core/api/linkdesk-api";

declare global {
  interface Window {
    linkdesk?: LinkDeskAPI;
  }
}

export {};
```

`LinkDeskAPI` 已在 `src/core/api/linkdesk-api.ts` 定义（20 命名空间：`tabs`、`menu`、`dialog`、`configuration`、`workspace`、`filesystem`、`path`、`events`、`p2p`、`pluginRequest`、`serial`、`clipboard`、`env`、`language`、`contextKey`、`pluginState`、`commands`、`bridge`、`config`、`pluginViews`）。

### 第二步：逐文件清理 `(window as any).linkdesk`

```typescript
// 改前
const lk = (window as any).linkdesk;

// 改后
const lk = window.linkdesk;  // ← 类型安全，类型为 LinkDeskAPI | undefined
```

### 第三步：添加 `tsconfig.json` 引用

```json
{
  "include": ["src/**/*.ts", "src/**/*.tsx", "src/types/**/*.d.ts"]
}
```

如果 `src/types/` 已在 `include` 中（TypeScript 默认包含），跳过。

---

## 三、可能遇到的问题

### 1. 类型不完整

**风险：** `LinkDeskAPI` 可能未覆盖所有命名空间——部分 API 在 `linkdesk-api.ts` 之外定义。

**缓解：** 先 grep 全项目 `window.linkdesk?.` 的所有用法，列出实际使用的 API → 和 `LinkDeskAPI` 比对 → 补类型定义。

```bash
grep -r "linkdesk\." src/ plugins/ --include="*.ts" --include="*.tsx" | grep -v "node_modules" | grep -v "linkdesk-api"
```

### 2. 插件层和壳的 API 差异

**风险：** 插件 WebView 的 `window.linkdesk` 通过 `preload-plugin.ts` 注入，壳 WebView 通过 `preload-shell.ts` 注入——两套 API 不同。同一类型可能不准确。

**缓解：** `LinkDeskAPI` 定义"最大集合"（所有 API 命名空间），标记可选（`?`）。壳侧未注入的命名空间自然为 `undefined`，调用方判断即可。

### 3. 测试环境的 window.linkdesk

**风险：** `vitest.setup.ts` 已 mock `window.linkdesk`——如果 mock 和类型不一致，类型安全不保障。

**缓解：** mock 也引用 `LinkDeskAPI` 类型，编译期保证 mock 和实际 API 签名一致。

---

## 四、涉及文件

| 文件 | 改动 |
|:--|:--|
| `src/types/global.d.ts` | **新建**——`Window.linkdesk` 全局类型声明 |
| `src/core/api/linkdesk-api.ts` | 审计——确认 20 命名空间覆盖完整 |
| ~20+ 文件 | `(window as any).linkdesk` → `window.linkdesk` |

**改动量：** ~30 行新文件 + ~20 处替换。投入时间 ~30 分钟。

---
