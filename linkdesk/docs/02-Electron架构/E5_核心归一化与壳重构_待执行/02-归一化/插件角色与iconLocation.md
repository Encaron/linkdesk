# 声明式插件出现位置——appearsIn

> 2026-08-02。**E5 第 2 层第 6 轮。** 替代分散的 `iconLocation` + `viewRole` + `keepSidebarOnFocus`——插件声明自己出现在哪里，不声明就不出现。
> 执行清单任务：E5#13（pluginRole）、E5#14（appearsIn 替代旧字段）

---

## 一、前因——五个字段管同一件事

### 1.1 当前碎片

| 字段 | 做什么 | 问题 |
|------|--------|------|
| `iconLocation` | 图标在图标栏的位置 | 默认 `"top"` = opt-OUT——未声明也显示 |
| `viewRole` | "tabOnly" = 不在图标栏出现 | 和 `iconLocation` 互不知情——编辑器声明了 `tabOnly` 但 `getIconLocation` 仍返回 `"top"` |
| `keepSidebarOnFocus` | 切到此插件的标签页时侧栏不关 | 独立字段——和图标栏/侧栏的行为没关联 |
| `tabBehavior` | 标签页行为 | 又一层——图标栏和标签页的行为分在两个字段 |
| `pluginRole` | "view" vs "data" | 只区分"要不要 React 组件"——不管"出现在哪里" |

**五个字段分别管——但管的是同一件事：这个插件在界面里怎么出现。**

### 1.2 后果——编辑器出现在图标栏

`editor/plugin.json` 声明了 `"viewRole": "tabOnly"`——意思是"只在标签页出现"。

但 `getViewPlugins()` 返回全部插件。`getIconLocation()` 对未声明 `iconLocation` 的插件默认返回 `"top"`。**编辑器没声明 `iconLocation`，于是被当成 top 图标显示在图标栏。**

根因：五个字段是不同时期加的——没人回过头来合并。`viewRegistry.ts` 的 `getViewPlugins` 不做过滤，把判断推给了每个消费方。

### 1.3 Python 插件被迫写空壳

`pluginRole: "data"` 的语言插件不需要 UI——但 `loader.ts` 中 `langDefs` 解析寄生在 `loadViewPlugin` 里，迫使 Python 声明 `entry` + 写空 `index.tsx`。

---

## 二、解决方案——appearsIn

```typescript
// src/core/types.ts——PluginManifest 加字段

interface PluginManifest {
  // ... 现有字段 ...

  /**
   * 插件在界面中出现的位置。声明了什么就出现在哪里。
   * 不声明 = 不出现在这个位置。opt-IN。
   *
   * ✅ 正确——编辑器只在标签页出现：
   *   "appearsIn": { "tabBar": true }
   *
   * ✅ 正确——文件树在图标栏+侧栏出现：
   *   "appearsIn": { "iconBar": "top", "sidePanel": true }
   *
   * ❌ 错误——声明了 tabOnly 但没声明 iconBar → 被默认值拉进图标栏
   */
  appearsIn?: {
    /** 图标栏——"top"=上组，"bottom"=下组。不声明=不出现在图标栏 */
    iconBar?: "top" | "bottom";
    /** 侧栏——true=有侧栏视图容器。不声明=侧栏中无此插件 */
    sidePanel?: boolean;
    /** 标签页——true=可以作为标签页打开。不声明=不创建标签页 */
    tabBar?: boolean;
    /** 状态栏——true=有状态栏条目。不声明=状态栏中无此插件 */
    statusBar?: boolean;
  };
}
```

### 默认行为——自动推导，零声明可用

```typescript
// loader.ts——加载时自动推导 appearsIn
/**
 * 从 PluginManifest 推导 appearsIn。
 *
 * 推导规则：
 * - iconBar:  有 viewsContainers → "top"（出现在图标栏上部）
 *             无 viewsContainers → undefined（不出现）
 * - sidePanel: 有 viewsContainers → true（侧栏中有容器）
 * - tabBar:   有 entry 且无 viewsContainers → true（作为标签页打开）
 *             有 entry 且有 viewsContainers → false（通过侧栏访问，不做标签页）
 *             这是对标 VS Code：sidebar webview 和 editor tab 互斥
 * - statusBar: 有 statusBar 字段且非空 → true
 *
 * 显式声明 appearsIn 覆盖推导结果。旧字段 iconLocation/viewRole/keepSidebarOnFocus 不再消费。
 */
function deriveAppearsIn(manifest: PluginManifest): Required<PluginManifest["appearsIn"]> {
  return {
    iconBar: manifest.contributes?.viewsContainers ? "top" : undefined,
    sidePanel: !!manifest.contributes?.viewsContainers,
    // 🔥 前提：有 entry 且有 viewsContainers 的插件通过侧栏访问，不做标签页
    tabBar: !!manifest.entry && !manifest.contributes?.viewsContainers,
    statusBar: !!(manifest.statusBar && manifest.statusBar.length > 0),
  };
}
```

**自动推导 = 零迁移成本。** 现有插件不改 `plugin.json` 也能正常工作——`appearsIn` 从已有字段推导。想精确控制的插件显式声明 `appearsIn` 覆盖自动推导。

### 旧字段——直接删除

| 旧字段 | 替代 |
|------|------|
| `iconLocation` | `appearsIn.iconBar` |
| `viewRole` | `appearsIn.tabBar` / `appearsIn.sidePanel` |
| `keepSidebarOnFocus` | 侧栏行为统一由 ShellEvents 管理 |

**只有 4 个官方插件（editor/file-tree/marketplace/serial-monitor），全部在 E5#14e-g 中迁移。旧字段从类型定义、plugin.json、消费方代码中全部删除。零兼容层。**

### 各消费方改为读 appearsIn

```typescript
// viewRegistry.ts——不再需要 getIconLocation、getTabCreatableViews 等
// 只暴露一个查询
export function getAppearsIn(pluginId: string): Required<PluginManifest["appearsIn"]> {
  const manifest = registry.get(pluginId)?.manifest;
  return manifest?._appearsIn ?? deriveAppearsIn(manifest ?? {});
}
// _appearsIn 在 loader.ts 加载时计算并缓存——避免每次推导
```

```typescript
// IconBar.tsx——只显示 appearsIn.iconBar 的插件
const plugins = getViewPlugins().filter(p => getAppearsIn(p.pluginId).iconBar);
```

```typescript
// TabBar/WelcomeView——只创建 appearsIn.tabBar 的插件的标签页
const tabCreatable = getViewPlugins().filter(p => getAppearsIn(p.pluginId).tabBar);
```

---

## 三、具体改动

### E5#13 pluginRole 字段（~3 行）

```typescript
// types.ts
pluginRole?: "view" | "data";  // E5#12 加载归一化后——data 插件不需要 React 组件
```

### E5#14 appearsIn 替代旧字段

#### E5#14a PluginManifest 加 appearsIn 类型（~10 行）

**文件：** `src/core/types.ts`

```typescript
appearsIn?: {
  iconBar?: "top" | "bottom";
  sidePanel?: boolean;
  tabBar?: boolean;
  statusBar?: boolean;
};
```

#### E5#14b loader.ts——加载时计算 `_appearsIn`（~15 行）

**文件：** `src/pluginLoader/loader.ts`

```typescript
// loadPluginLifecycle 中——解析完 manifest 后
manifest._appearsIn = {
  iconBar: manifest.appearsIn?.iconBar ?? (manifest.contributes?.viewsContainers ? "top" : undefined),
  sidePanel: manifest.appearsIn?.sidePanel ?? !!manifest.contributes?.viewsContainers,
  tabBar: manifest.appearsIn?.tabBar ?? (!!manifest.entry && !manifest.contributes?.viewsContainers),
  statusBar: manifest.appearsIn?.statusBar ?? !!(manifest.statusBar?.length),
};
```

#### E5#14c 消费方改为读 appearsIn（~15 行）

- **`IconBar.tsx`**——过滤 `iconBar` 字段。`getIconLocation` 调用改为 `getAppearsIn`
- **`TabBar/WelcomeView`**——过滤 `tabBar` 字段。`getTabCreatableViews` 调用改为 `getAppearsIn`
- **`SidePanel`**——过滤 `sidePanel` 字段。不再判断 `viewsContainers`

#### E5#14d 删除旧字段（~10 行）

从 `PluginManifest` 类型定义、`plugin.schema.json`、`viewRegistry.ts` 中全部删除 `iconLocation`、`viewRole`、`keepSidebarOnFocus`。4 个插件已在 E5#14e-g 迁移到 `appearsIn`。

#### E5#14e 🔴 编辑器 plugin.json——补显式声明（~3 行）

```json
// 旧
"viewRole": "tabOnly"

// 新
"appearsIn": { "tabBar": true }
// 不声明 iconBar → 不出现在图标栏。不声明 sidePanel → 没有侧栏
```

#### E5#14f 🔴 file-tree/marketplace plugin.json——补显式声明（~2 行×2）

```json
// file-tree
"appearsIn": { "iconBar": "top", "sidePanel": true }

// marketplace
"appearsIn": { "iconBar": "top", "sidePanel": true }
```

---

## 四、和数据插件的关系

**`pluginRole: "data"` 的插件不需要 `appearsIn`。** 数据插件在 `loadPluginLifecycle` 中跳过 React 组件加载——自然不注册到 viewRegistry——消费方根本看不到它。

Python 插件（E5#13e）：
```json
{ "pluginRole": "data", "contributes": { "langDefs": [...] } }
// 不需要 appearsIn、不需要 entry、不需要 index.tsx
```

---

## 五、完工标准

- [ ] `appearsIn` 是唯一决定"插件出现在哪里"的字段
- [ ] IconBar 只显示 `appearsIn.iconBar` 的插件——编辑器不出现
- [ ] TabBar 只创建 `appearsIn.tabBar` 的插件标签页
- [ ] SidePanel 只显示 `appearsIn.sidePanel` 的插件容器
- [ ] `iconLocation` / `viewRole` / `keepSidebarOnFocus` 从类型定义、schema、消费方全部删除
- [ ] `getViewPlugins()` 返回全部插件——过滤由消费方自己的 `appearsIn` 读取决定
- [ ] 自动推导覆盖 100% 现有插件——不改 plugin.json 也正常工作
- [ ] `npm run check` 零错误

---

## 六、🆕 WebView 创建逻辑也应由 appearsIn 决定

> 2026-08-04。**E5#10 诊断中发现：当前 WebView 创建只看"有没有 React 组件"，不看"组件跑在谁的进程里"。**

### 6.1 当前逻辑的缺口

```
if (Component) {
  registerViewPlugin(entry)     ← 有组件就注册为视图插件
  pluginViews.create(pluginId)  ← 有组件就创建 WebView
}
```

**问题：** 一个纯状态栏插件（如时钟插件）有 React 组件，组件渲染在壳的状态栏里，不需要独立 WebView。但当前逻辑会为它创建一个空占的 WebView。

`pluginRole` 只能区分"有 UI / 无 UI"，不能区分"UI 跑在壳里 / UI 跑在自己 WebView 里"。

### 6.2 正确逻辑

```
WebView 是否创建 = pluginRole === "view" && (appearsIn.tabBar || appearsIn.sidePanel)
```

只有需要**独立渲染面**（标签页或侧栏）的插件才创建 WebView。纯状态栏插件（`appearsIn.statusBar` 但没有 `tabBar`/`sidePanel`）的组件跑在壳进程里，不创建 WebView。

### 6.3 在各插件上的效果

| 插件 | tabBar | sidePanel | 需要 WebView？ |
|:--|:--:|:--:|:--:|
| editor | ✅ | - | ✅ 需要 |
| serial-monitor | ✅ | ✅ | ✅ 需要 |
| settings | ✅ | - | ✅ 需要 |
| marketplace | - | ✅ | ✅ 需要 |
| file-tree | - | ✅ | ✅ 需要 |
| workspace | ✅ | - | ✅ 需要 |
| python | - | - | ❌ pluginRole=data, 跳过 |
| 纯状态栏插件（未来） | - | - | ❌ 只有 statusBar, 壳内渲染 |

### 6.4 执行清单补充

此逻辑在 E5#14（appearsIn 替代旧字段）完成后实施：
- loader.ts 中 `pluginViews.create()` 调用加 `appearsIn` 判断
- 依赖 E5#13（pluginRole）+ E5#14（appearsIn）

---

---

## 七、🆕 E5.8 修正——entryless 视图插件也可出现在图标栏

> 2026-08-21。**E5.8#37.9.2.3 修复本章"完工标准"与实际实现的偏差。**

§二 完工标准声称「`getViewPlugins()` 返回全部插件」——实际从 E5#12 起 `registerViewPlugin`
只对有 `entry` 的插件调用（`role="data"` 派生跳过 entryless），**entryless 视图插件
（panel-demo / demo-en 加 entry 前）即使声明 `appearsIn.iconBar` 也被静默丢弃**。
schema 允许这么声明、运行时零报错 = 潜伏缺口（E5.7#63.7 引入第一个 entryless 视图插件时才暴露）。

**修复（壳级，通用通道）：**
- `runtime.ts` Step 4：entryless 且含**侧栏**视图容器（`hasSidebarContainers`，location 默认 sidebar；
  panel/auxiliarybar 不算——图标栏语义 = 打开侧栏容器）的插件注册 component-less 条目进 viewRegistry。
- `ViewPluginEntry.component` 改可选——entryless 条目的组件由 ViewContainerService 经
  `contributes.views[].render` 加载，viewRegistry 只作元数据/图标入口。
- `getTabCreatableViews()` / `findFallbackPlugin()` 加 `entry` 守卫——component-less 注册只服务
  图标栏，绝不成为标签页（标签页渲染靠 entry）。

**结论（data 插件仍无图标，本修复不放松 E5#13）：** Python 语言包等零侧栏容器的数据插件
仍不进 viewRegistry、无图标——E5#13/#14 的设计意图完好。被修的是「**能渲染侧栏视图**但
entryless 的插件也该能拿到图标」这一组合。

> **← E5 索引：** `../00-README.md`
> **← 执行清单：** `../05-执行清单.md` E5#13、E5#14
> **← 关联：** E5#12 插件加载归一化——同轮
