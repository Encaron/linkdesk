# 插件角色系统 + iconLocation opt-IN

> 2026-08-02。**E5 第 2 层第 6 轮。** 数据插件不需要 React 组件。图标不声明不显示。
> 执行清单任务：E5#13、E5#14

---

## 一、前因

### 1.1 数据插件被迫写空壳

Python 插件（`plugins/user/python/`）当前被迫声明 `entry` + 写空 `index.tsx`：

```json
// plugins/user/python/plugin.json（当前）
{
  "name": "Python",
  "entry": "src/index.tsx",    // ← 被迫声明——不声明 langDefs 不生效
  "contributes": {
    "langDefs": [...]
  }
}
```

```tsx
// plugins/user/python/src/index.tsx（当前——空壳）
// 空组件——因为 langDefs 解析寄生在 loadViewPlugin 里
export default function PythonPlugin() {
  return null;
}
```

**根因：** `langDefs` 解析在 `loadViewPlugin()` 内部——不经过 `parseContributions`。`loader.ts` 只对 `manifest.entry` 存在的插件调 `loadViewPlugin()`。

**E5#12（插件加载归一化）修复后：** `langDefs` 解析移到 `parseContributions`——不需要 `entry`。但缺一个显式的 `pluginRole` 字段来区分"需要 UI"和"纯数据"。

### 1.2 iconLocation 默认 top——opt-OUT

**`viewRegistry.ts` L122-124：**

```typescript
export function getIconLocation(pluginId: string): "top" | "bottom" {
  return registry.get(pluginId)?.manifest.iconLocation ?? "top";
}
```

`?? "top"` = 没声明就默认显示图标 → opt-OUT。违背硬约束"opt-IN not opt-OUT"。

**受影响插件：** file-tree 和 marketplace 当前没声明 `iconLocation`——靠默认值 `"top"` 活着。

---

## 二、设计方案

### 2.1 插件角色——`pluginRole`

```typescript
// src/core/types.ts PluginManifest（加字段）
export interface PluginManifest {
  // ... 现有字段 ...

  /** 
   * 插件角色。默认自动推导：
   * - 有 entry → "view"（需要 React 组件渲染）
   * - 无 entry 但有 contributes（langDefs/themes）→ "data"（纯声明）
   */
  pluginRole?: "view" | "data";
}
```

**自动推导逻辑（`loader.ts` loadPluginLifecycle）：**

```typescript
function derivePluginRole(manifest: PluginManifest): "view" | "data" {
  if (manifest.pluginRole) return manifest.pluginRole;  // 显式声明优先
  if (manifest.entry) return "view";
  // 有 contributes 但无 entry = 纯数据
  if (manifest.contributes && Object.keys(manifest.contributes).length > 0) return "data";
  return "view";  // 兜底
}
```

**data 插件行为：**
- 不注册视图（`loadPluginComponent` 不调）
- 不创建 WebContentsView
- 图标栏不显示
- 侧栏不显示

### 2.2 iconLocation opt-IN

```typescript
// viewRegistry.ts L123（改默认值）
export function getIconLocation(pluginId: string): "top" | "bottom" | null {
  return registry.get(pluginId)?.manifest.iconLocation ?? null;
  //                                                      ^^^^
  //                                                "top" → null
}
```

**⚠️ 执行顺序——不可颠倒：**
1. 先补：file-tree/plugin.json + marketplace/plugin.json 加 `"iconLocation": "top"`
2. 再改：viewRegistry.ts 默认值 `null`

---

## 三、实现步骤

### E5#13a PluginManifest 加 pluginRole 字段（~3 行）

**文件：** `src/core/types.ts` L135 附近

```typescript
/** 插件角色。view=需要UI渲染、data=纯声明数据。默认从 entry/contributes 推导。 */
pluginRole?: "view" | "data";
```

### E5#13b plugin.schema.json 加定义（~5 行）

```json
"pluginRole": {
  "type": "string",
  "enum": ["view", "data"],
  "description": "插件角色。view=需要React组件渲染，data=纯声明数据。默认自动推导。"
}
```

### E5#13c loader.ts 自动推导（~8 行）

**文件：** `src/pluginLoader/loader.ts` `loadPluginLifecycle` 中

```typescript
const role = derivePluginRole(manifest);
if (role === "view" && manifest.entry) {
  await loadPluginComponent(pluginId, manifest);
}
// data 插件——不加载 React 组件
```

### E5#13d data 插件不注册视图（~3 行）

**文件：** `src/pluginLoader/loader.ts`

```typescript
// loadPluginComponent 只在 view role 时调用
// data 插件跳过——不注册到 viewRegistry、不创建 WebContentsView
```

### E5#13e Python 插件清理（~3 行）

**文件：** `plugins/user/python/plugin.json`

```diff
- "entry": "src/index.tsx",
+ "pluginRole": "data",
```

**文件：** `plugins/user/python/src/index.tsx` → **删除整个文件**

### E5#14a 先补——file-tree/plugin.json（~1 行）

```diff
+ "iconLocation": "top",
```

### E5#14b 先补——marketplace/plugin.json（~1 行）

```diff
+ "iconLocation": "top",
```

### E5#14c 再改——viewRegistry.ts L123（~1 行）

```diff
- return registry.get(pluginId)?.manifest.iconLocation ?? "top";
+ return registry.get(pluginId)?.manifest.iconLocation ?? null;
```

---

## 🔴 预测 Bug

### Bug E5-14a 🔴🔴🔴 图标栏图标消失——顺序搞反

**触发条件：** 先改 viewRegistry.ts 默认值 `null` → file-tree/marketplace 图标从 IconBar 消失 → 用户无法打开文件树和插件市场。

**🔥 防线——先补声明再改默认值：** E5#14a → E5#14b → E5#14c。不可颠倒。

**🛡️ 验证：** E5#14c 改完后立即检查 IconBar——file-tree 和 marketplace 图标必须存在。

---

### Bug E5-13a 🔴 data 插件误判——有 contributes 就是 data？

**触发条件：** 一个视图插件声明了 `entry` + `contributes.commands` → `derivePluginRole` 看到 contributes 非空 → 误判为 data → 视图不加载。

**🔥 防线——entry 优先：**
```typescript
function derivePluginRole(manifest: PluginManifest): "view" | "data" {
  if (manifest.pluginRole) return manifest.pluginRole;
  if (manifest.entry) return "view";  // ← 有 entry = view，不管 contributes 有什么
  return "data";
}
```

---

## 四、完工标准

- [ ] Python 插件零 React 代码——无 `entry`、无 `index.tsx`
- [ ] Python 语言高亮/补全正常
- [ ] file-tree/marketplace 图标正常显示
- [ ] 新数据插件（Rust/C++ langDefs）→ 不需要写任何 TypeScript 代码
- [ ] `grep "?? \"top\"" src/pluginLoader/viewRegistry.ts` 返回空（默认值已改为 null）
- [ ] `npm run check` 零错误

---

> **← E5 索引：** `../00-README.md`
> **← 执行清单：** `../05-执行清单.md` E5#13–#14
> **← 前置：** `插件加载归一化.md`（E5#12）——langDefs 迁移到 parseContributions
