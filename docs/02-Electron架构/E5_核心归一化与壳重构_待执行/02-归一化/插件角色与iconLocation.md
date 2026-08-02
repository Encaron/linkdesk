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
function deriveAppearsIn(manifest: PluginManifest): Required<PluginManifest["appearsIn"]> {
  return {
    // 有 viewsContainers → 图标栏 top + 侧栏。对标旧 viewRole: "sidebarPrimary"
    iconBar: manifest.contributes?.viewsContainers ? "top" : undefined,
    // 有 viewsContainers → 侧栏。对标旧逻辑
    sidePanel: !!manifest.contributes?.viewsContainers,
    // 没有 viewsContainers 的视图插件 → 标签页。对标旧 viewRole: "tabOnly"
    tabBar: !!manifest.entry && !manifest.contributes?.viewsContainers,
    // 有 statusBar 声明 → 状态栏
    statusBar: !!(manifest.statusBar && manifest.statusBar.length > 0),
  };
}
```

**自动推导 = 零迁移成本。** 现有插件不改 `plugin.json` 也能正常工作——`appearsIn` 从已有字段推导。想精确控制的插件显式声明 `appearsIn` 覆盖自动推导。

### 旧字段废弃——不删，但不再消费

| 旧字段 | 替代 |
|------|------|
| `iconLocation` | `appearsIn.iconBar` |
| `viewRole` | `appearsIn.tabBar` / `appearsIn.sidePanel` |
| `keepSidebarOnFocus` | 侧栏行为统一由 ShellEvents 管理——不再需要这个字段 |

**标记 `@deprecated`。** E5 不删——防止旧插件炸。但所有消费方改为读 `appearsIn`。

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

#### E5#14d 标记旧字段 @deprecated（~5 行）

```typescript
/** @deprecated E5——请用 appearsIn.iconBar */
iconLocation?: "top" | "bottom";
/** @deprecated E5——请用 appearsIn.tabBar / appearsIn.sidePanel */
viewRole?: "sidebarPrimary" | "tabOnly";
/** @deprecated E5——侧栏行为统一由 ShellEvents 管理 */
keepSidebarOnFocus?: boolean;
```

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
- [ ] `iconLocation` / `viewRole` / `keepSidebarOnFocus` 标记 `@deprecated`——不删但不再消费
- [ ] `getViewPlugins()` 返回全部插件——过滤由消费方自己的 `appearsIn` 读取决定
- [ ] 自动推导覆盖 100% 现有插件——不改 plugin.json 也正常工作
- [ ] `npm run check` 零错误

---

> **← E5 索引：** `../00-README.md`
> **← 执行清单：** `../05-执行清单.md` E5#13、E5#14
> **← 关联：** E5#12 插件加载归一化——同轮
