# ViewContainerService —— 核心桌子（v2 完整设计）

> 对应任务：E36#1 + E36#2。**对标 VS Code `IViewContainersRegistry` + `IViewsRegistry` + `IViewDescriptor`。**
> 2026-07-30 重写——不做简化，每个字段都现在就设计好。

## 为什么是桌子

准入三条全满足：
1. **多提供方**——任何插件可 `registerView(containerId, descriptor)` 往任意容器注册 view
2. **多消费方**——SidePanel + 未来底部面板 + 未来辅助侧栏都可以 `getViews(containerId)`
3. **桌子不知道内容**——不知道 FOLDERS 是文件树、不知道"收发设置"是串口的

## 地点枚举——对标 VS Code ViewContainerLocation

```typescript
// src/core/ViewContainerService.ts

/** 容器所在位置。对标 VS Code ViewContainerLocation。 */
export type ViewContainerLocation = 'sidebar' | 'panel' | 'auxiliarybar';
```

当前只消费 `'sidebar'`，但 API 接受全部三个值——底部面板和辅助侧栏到了直接能用。

---

## 容器描述符——对标 VS Code IViewContainerDescriptor

```typescript
export interface ViewContainerDescriptor {
  /** 容器 ID。命名：a-z + 连字符。如 "explorer" / "marketplace" / "serial-monitor" */
  id: string;
  /** 侧栏 header 显示的标题。如 "资源管理器" */
  title: string;
  /** 容器图标——覆盖插件自身的图标。可选。 */
  icon?: string;
  /** 位置。默认 'sidebar'。 */
  location?: ViewContainerLocation;
  /** 无活跃 view 时自动隐藏容器。对标 VS Code hideIfEmpty。默认 false。 */
  hideIfEmpty?: boolean;
  /** 同位置内的排序权重。小值靠前。 */
  order?: number;
  /** 容器内只有一个 view 时，隐藏 view header——标题合并到容器 header。对标 VS Code mergeViewWithContainerWhenSingleView */
  mergeHeaderWhenSingle?: boolean;
}
```

---

## View 描述符——对标 VS Code IViewDescriptor

```typescript
export interface ViewDescriptor {
  /** View 唯一 ID。命名：`<pluginId>.<name>` 或简写 `name`。如 "folders" / "sessions" */
  id: string;
  /** 显示标题——SidebarSection 的 header 文字。可为空字符串（不显示折叠头） */
  title: string;
  /** React 组件 */
  render: React.ComponentType;
  /** Context key when 条件——满足时才显示。null = 始终显示。对标 VS Code IViewDescriptor.when */
  when?: string;
  /** 同容器内的排序权重。小值在上。对标 VS Code IViewDescriptor.order */
  order?: number;
  /** 初始折叠状态。true = 首次渲染时折叠。对标 VS Code IViewDescriptor.collapsed */
  collapsed?: boolean;
  /** 用户可通过 Views 子菜单切换可见性。对标 VS Code IViewDescriptor.canToggleVisibility */
  canToggleVisibility?: boolean;
  /** 用户可将此 view 移到其他容器——未来拖放布局。对标 VS Code IViewDescriptor.canMoveView */
  canMoveView?: boolean;
  /** 默认隐藏——用户需手动从 Views 菜单开启。对标 VS Code IViewDescriptor.hideByDefault */
  hideByDefault?: boolean;
  /** 折叠头右侧的操作按钮——对标 VS Code view header actions。ReactNode——不可在 plugin.json 声明，仅命令式 registerView 使用 */
  actions?: React.ReactNode;
  /** 标题旁的副文字——如 OPEN EDITORS 下的 "(5 files)"。对标 VS Code ViewPane.titleDescription */
  titleDescription?: string;
  /** 单 view 且容器 mergeHeaderWhenSingle 时，容器 header 显示此标题替代容器 title。对标 VS Code singleViewPaneContainerTitle */
  singleViewPaneContainerTitle?: string;
  /** 控制 actions 的显隐时机。对标 VS Code ViewPaneShowActions */
  showActions?: 'always' | 'whenExpanded' | 'default';
  /** 标题 hover tooltip——标题截断时显示完整文字。对标 VS Code titleContainerHover */
  titleTooltip?: string;
}
```

---

## ViewContainerModel——每个容器的内部状态模型

对标 VS Code `ViewContainerModel`（`viewDescriptorService.ts` → `ViewContainerModel` 类）。

```typescript
/**
 * 容器级状态——跟踪每个容器的活跃 view 集合。
 * 内部类，不暴露给插件作者。SidePanel 消费。
 */
class ViewContainerModel {
  /** 此容器注册的全部 view（含不可见的） */
  allViewDescriptors: ViewDescriptor[] = [];
  /** 当前可见的 view（满足 when 条件 + 未被用户隐藏） */
  get activeViewDescriptors(): ViewDescriptor[];
  /** view 可见性变更事件 */
  onDidChangeActiveViewDescriptors: Emitter<{ added: ViewDescriptor[]; removed: ViewDescriptor[] }>;
  
  /** 设置单个 view 的可见性（用户手动切换或 when 条件变化） */
  setVisible(viewId: string, visible: boolean): void;
  /** 查询单个 view 是否可见 */
  isVisible(viewId: string): boolean;
}
```

---

## ViewContainerService 完整 API

```typescript
export class ViewContainerService extends RegistryBase {
  // 🔴 排序说明：RegistryBase 构造函数自动注册 onWillUninstall 处理程序。
  // 如果 lifecycle.ts 导入 ViewContainerService（E36#4.7 需要），ES 模块提升意味着
  // ViewContainerService 的构造函数在 lifecycle.ts 主体代码之前运行——
  // 因此自动处理程序在 PLUGIN_REMOVED dispatch（L163）之前注册。
  // 执行顺序变为：unregisterAll → dispatchEvent(PLUGIN_REMOVED) → revertContainerIfCurrent。
  //
  // 🔥 缓解措施：revertContainerIfCurrent 从 getViewPlugin().manifest 读取——
  // PluginManifest，而不是 ViewContainerService 数据。即使 unregisterAll 先运行，
  // PluginManifest 在 viewRegistry 中仍然可用（它稍后在生命周期中被清除）。
  // 因此 revertContainerIfCurrent 在任一顺序下都能工作。
  //
  // 🔥 E36#4.7 的显式处理程序（在 lifecycle.ts L165 之后）作为安全网——如果自动处理程序
  // 已经清理过了，则对 unregisterAll 的第二次调用是幂等的。关键是 PLUGIN_REMOVED 的
  // DOM 事件监听器在设置 sidebarView(null) 之前仍然可以读取 manifest。

  // ═══ 容器管理 ═══
  
  /** 注册容器——返回已存在的同 ID 容器（幂等）。对标 VS Code IViewContainersRegistry.registerViewContainer */
  registerViewContainer(pluginId: string, descriptor: ViewContainerDescriptor): void;
  /** 获取容器描述符。对标 VS Code IViewContainersRegistry.get */
  getViewContainer(id: string): ViewContainerDescriptor | undefined;
  /** 获取指定位置的全部容器。对标 VS Code IViewContainersRegistry.getViewContainers */
  getViewContainers(location?: ViewContainerLocation): ViewContainerDescriptor[];
  
  // ═══ View 管理 ═══
  
  /** 注册 view——同一 pluginId+id 重复调用 = 更新。对标 VS Code IViewsRegistry.registerViews */
  registerView(pluginId: string, containerId: string, descriptor: ViewDescriptor): void;
  /** 获取容器全部已注册 view（含不可见的）。对标 VS Code IViewsRegistry.getViews */
  getViews(containerId: string): ViewDescriptor[];
  /** 获取容器当前可见的 view。对标 VS Code ViewContainerModel.activeViewDescriptors */
  getActiveViews(containerId: string): ViewDescriptor[];
  /** 按 view id 查找。对标 VS Code IViewsRegistry.getView */
  getView(id: string): ViewDescriptor | undefined;
  
  // ═══ 可见性 ═══
  
  /** 设置 view 可见性（用户手动切换或 when 条件变化）。对标 VS Code ViewContainerModel.setVisible */
  setVisible(containerId: string, viewId: string, visible: boolean): void;
  /** 查询 view 可见性。对标 VS Code ViewContainerModel.isVisible */
  isVisible(containerId: string, viewId: string): boolean;
  
  // ═══ 事件 ═══
  
  /** 容器注册/注销事件 */
  readonly onDidChangeContainers: Event<{ added: ViewContainerDescriptor[]; removed: ViewContainerDescriptor[] }>;
  /** 某容器 views 集合发生变化 */
  readonly onDidChangeViews: Event<{ containerId: string; views: ViewDescriptor[] }>;
  /** 某容器活跃 views 集合发生变化 */
  readonly onDidChangeActiveViews: Event<{ containerId: string; added: ViewDescriptor[]; removed: ViewDescriptor[] }>;
  
  // ═══ 清理（RegistryBase 钩子） ═══
  
  unregisterAll(pluginId: string): void;
}
```

---

## 两层事件——对标 VS Code

VS Code 有两层事件，我们也照做：

| 事件 | 触发时机 | 消费方 |
|------|------|------|
| `onDidChangeViews` | registerView / unregisterAll——views 集合变了 | SidePanel 全量重渲染 |
| `onDidChangeActiveViews` | setVisible / when 条件变化——活跃 views 变了 | SidePanel 增量更新（未来优化） |

`onDidChangeContainers` | registerViewContainer / unregisterAll——容器集合变了 | App.tsx（sidebarView 状态校验） |

---

## plugin.schema.json 贡献点——完整字段

```json
{
  "contributes": {
    "viewsContainers": {
      "type": "object",
      "description": "声明侧栏容器。点此插件图标时切换到此容器。",
      "patternProperties": {
        "^[a-z][a-z0-9-]*$": {
          "type": "object",
          "properties": {
            "title": { "type": "string" },
            "icon": { "type": "string" },
            "location": { "type": "string", "enum": ["sidebar", "panel", "auxiliarybar"] },
            "hideIfEmpty": { "type": "boolean" },
            "order": { "type": "number" }
          },
          "required": ["title"]
        }
      }
    },
    "views": {
      "type": "object",
      "description": "往容器注册视图。key = 容器 ID。",
      "patternProperties": {
        "^[a-z][a-z0-9-]*$": {
          "type": "array",
          "items": {
            "type": "object",
            "properties": {
              "id": { "type": "string" },
              "title": { "type": "string" },
              "render": { "type": "string", "description": "视图组件的模块路径" },
              "when": { "type": "string", "description": "Context key 条件" },
              "order": { "type": "number" },
              "collapsed": { "type": "boolean", "description": "初始折叠" },
              "canToggleVisibility": { "type": "boolean" },
              "canMoveView": { "type": "boolean" },
              "hideByDefault": { "type": "boolean" }
            },
            "required": ["id", "render"]
          }
        }
      }
    }
  }
}
```

所有字段现在就声明在 schema 里——插件作者立即能写，即使部分字段 SidePanel 暂时不消费（如 `canMoveView`）也不影响。未来消费时只需改 SidePanel 渲染逻辑，不碰 schema、不改 plugin.json。

---

## 验证

1. `registerViewContainer("p1", { id: "explorer", title: "资源管理器" })` → `getViewContainer("explorer").title === "资源管理器"`
2. `registerView("p1", "explorer", { id: "v1", title: "测试", render: TestView })` → `getViews("explorer").length === 1`
3. `getActiveViews("explorer")` → `[{ id: "v1", ... }]`（无 when 条件 = 默认可见）
4. `setVisible("explorer", "v1", false)` → `getActiveViews("explorer")` → `[]`
5. `unregisterAll("p1")` → `getViews("explorer")` → `[]`、`getViewContainer("explorer")` → `undefined`
6. 连续注册 3 个 view → `getViews` 返回顺序 = 注册顺序
7. 重复 `registerView("p1", "explorer", { id: "v1", title: "新标题", ... })` → view 更新
8. `onDidChangeViews` 事件正确触发
9. `onDidChangeActiveViews` 事件在可见性变化时正确触发
