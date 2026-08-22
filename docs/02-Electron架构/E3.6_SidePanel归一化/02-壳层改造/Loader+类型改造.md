# PluginManifest 类型 + loader 解析

> 对应任务：E36#5。**声明式注册的唯一入口——import 失败不能静默。**

---

## types.ts 新增类型

```typescript
// src/core/types.ts —— PluginContributes 接口扩展

interface PluginContributes {
  // ... 现有字段 ...

  /** 侧栏容器声明。点此插件图标→切换到该容器。对标 VS Code viewsContainers */
  viewsContainers?: Record<string, {
    title: string;
    icon?: string;
    /** 容器位置。默认 'sidebar'。对标 VS Code ViewContainerLocation */
    location?: 'sidebar' | 'panel' | 'auxiliarybar';
    /** 无活跃 view 时自动隐藏容器 */
    hideIfEmpty?: boolean;
    /** 同位置排序。小值靠前 */
    order?: number;
  }>;

  /** 往容器注册视图。key = 容器 ID。对标 VS Code views */
  views?: Record<string, Array<{
    id: string;
    title?: string;
    /** 组件模块路径。相对于插件目录。如 "src/views/FoldersView.tsx" */
    render: string;
    /** Context key when 条件——满足时才显示。对标 VS Code IViewDescriptor.when */
    when?: string;
    /** 容器内排序。小值在上 */
    order?: number;
    /** 初始折叠 */
    collapsed?: boolean;
    /** 用户可切换可见性（未来 Views 子菜单） */
    canToggleVisibility?: boolean;
    /** 用户可拖放 view 到其他容器（未来自定义布局） */
    canMoveView?: boolean;
    /** 默认隐藏——用户需手动从 Views 菜单开启 */
    hideByDefault?: boolean;
  }>>;
}
```

---

## loader.ts 新增解析逻辑

```typescript
// src/pluginLoader/loader.ts —— parseContributions 函数末尾

// ═══ 解析 viewsContainers——注册容器 ═══
if (manifest.contributes?.viewsContainers) {
  for (const [containerId, descriptor] of Object.entries(manifest.contributes.viewsContainers)) {
    ViewContainerService.registerViewContainer(pluginId, {
      id: containerId,
      title: descriptor.title,
      icon: descriptor.icon,
      location: descriptor.location ?? 'sidebar',
      hideIfEmpty: descriptor.hideIfEmpty ?? false,
      order: descriptor.order,
    });
  }
}

// ═══ 解析 views——动态 import 渲染组件 ═══
if (manifest.contributes?.views) {
  for (const [containerId, viewDefs] of Object.entries(manifest.contributes.views)) {
    for (const viewDef of viewDefs) {
      try {
        const renderModule = await import(/* @vite-ignore */ viewDef.render);
        const RenderComponent = renderModule.default ?? renderModule;

        ViewContainerService.registerView(pluginId, containerId, {
          id: viewDef.id,
          title: viewDef.title ?? "",
          render: RenderComponent,
          when: viewDef.when,
          order: viewDef.order,
          collapsed: viewDef.collapsed,
          canToggleVisibility: viewDef.canToggleVisibility,
          canMoveView: viewDef.canMoveView,
          hideByDefault: viewDef.hideByDefault,
        });
      } catch (e) {
        // 🔥 Bug 风险 9 防线——不静默吞错
        console.error(
          `[loader] ❌ 加载 view 失败: plugin="${pluginId}" container="${containerId}" render="${viewDef.render}"`,
          e
        );
        // 不抛——其他 view 继续加载
      }
    }
  }
}
```

---

## 🔥 Bug 防线

### 防线 1：L6 双路径归一化（Bug 风险 1）

**问题：** 声明式（plugin.json `contributes.views`）和命令式（`activate()` 中手动 `registerView`）是两条入口。如果不归一化，每次给声明式加字段就会漏掉命令式路径。

**修复：** 两条路径同走 `ViewContainerService.registerView()` 一个方法。loader 只负责解析 JSON + 动态 import——然后调用同一个 `registerView`。`activate()` 中的命令式调用也走同一个 `registerView`。

```
声明式路径: plugin.json → loader → parseContributions → registerView()
命令式路径: plugin.json → activate() → 业务逻辑 → registerView()
                                                              ↓
                                            同一个 ViewContainerService.registerView()
                                                              ↓
                                                      同一个 Map
```

**为什么不是 `applyPostLoadSteps` 模式（E3b #36j1）：** E3b 的 `loadPlugin`↔`loadPluginRuntime` 是两条完全独立的函数，提取共享步骤是必需的重构。E3.6 的声明式+命令式本质上都是"调 `registerView`"——不需要中间层。关键是 `registerView` 接受完整的 `ViewDescriptor` 类型——不丢弃字段。

### 防线 2：动态 import 失败不静默（Bug 风险 9）

**问题：** `import(viewDef.render)` 失败 → 如果不 catch → 整个 `parseContributions` 中断 → 所有后续 view 丢失。如果 catch 了但不 log → 插件作者写错路径 → 功能缺失 → 无法排查。

**修复：** try/catch 外裹 + `console.error` 明确报：plugin 名、container 名、失败路径。**不抛——其他 view 继续加载。**

```typescript
// ❌ 错误写法——中断全部 view 加载
const module = await import(viewDef.render);

// ❌ 错误写法——静默吞错
try { await import(viewDef.render); } catch {}

// ✅ 正确写法——报错 + 继续
try {
  const module = await import(viewDef.render);
} catch (e) {
  console.error(`[loader] ❌ 加载 view 失败: plugin="${pluginId}" container="${containerId}" render="${viewDef.render}"`, e);
  // 不抛——continue 到下一条 viewDef
}
```

### 防线 3：全部字段传递——不丢数据

**问题：** loader 解析 `viewDef` JSON 对象 → 构造 `ViewDescriptor` → 调 `registerView`。如果中间漏掉某个字段（如 `canMoveView`），插件作者在 plugin.json 写了但数据没进 Map → 未来 UI 消费时取不到。

**修复：** `registerView` 调用传递 `viewDef` 的全部字段——不遗漏任何一个。

```typescript
// ❌ 错误——只传部分字段
registerView(pluginId, containerId, {
  id: viewDef.id,
  title: viewDef.title ?? "",
  render: RenderComponent,
  // 漏了 when/order/collapsed/canToggleVisibility/canMoveView/hideByDefault
});

// ✅ 正确——全量传递
registerView(pluginId, containerId, {
  id: viewDef.id,
  title: viewDef.title ?? "",
  render: RenderComponent,
  when: viewDef.when,
  order: viewDef.order,
  collapsed: viewDef.collapsed,
  canToggleVisibility: viewDef.canToggleVisibility,
  canMoveView: viewDef.canMoveView,
  hideByDefault: viewDef.hideByDefault,
});
```

---

## 声明式 vs 命令式——两种注册方式共存

| | 声明式 | 命令式 |
|------|------|------|
| 注册位置 | `plugin.json` `contributes.views` | `index.tsx` `activate()` 中 |
| 谁调用 | loader `parseContributions` | 插件自己的代码 |
| 适合什么 | 静态 view——标题不变、数量固定 | 动态 view——标题随数据变化、数量动态 |
| 例子 | marketplace 四个分组、file-tree FOLDERS | serial-monitor 收发设置（标题 `"收发设置 — COM3"`） |
| 更新方式 | 改 plugin.json → 重启插件 | 运行时调 `registerView({ title: "新标题" })`——同一 pluginId+viewId = 更新而非重复注册 |

---

## 向后兼容

**不删除** 旧的 `sidebar` 字段解析逻辑——迁移期间（R2→R3）两套系统共存。R2 完成后 SidePanel 不再查 `sidebarComponent`，但 loader 仍解析 `sidebar` 字段（不影响 UI）。R3 逐个插件迁移后旧字段成死数据。R4（E36#10）删除。

---

## 文件

- `src/core/types.ts`——`PluginContributes` 加 `viewsContainers?` + `views?`（~18 行）
- `src/pluginLoader/loader.ts`——`parseContributions` 加 viewsContainers + views 解析（~35 行）

**改动：** ~53 行

---

## 验证

- [ ] plugin.json 声明 views → loader 自动注册 → `ViewContainerService.getViews()` 可查
- [ ] render 路径写错 → Console 红色报错 + 其他 view 正常
- [ ] 旧 `sidebar` 字段 → loader 不崩（向后兼容）
- [ ] 全部字段（canMoveView/canToggleVisibility/hideByDefault）正确存入 ViewContainerService
