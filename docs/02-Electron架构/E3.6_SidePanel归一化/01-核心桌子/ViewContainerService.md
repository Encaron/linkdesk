# ViewContainerService —— 核心桌子

> 对应任务：E36#1 + E36#2

## 为什么是桌子

准入三条全满足：
1. **多提供方**——任何插件可 `registerView(containerId, descriptor)` 往任意容器注册 view
2. **多消费方**——SidePanel 渲染循环 + 未来底部面板都可以 `getViews(containerId)`
3. **桌子不知道内容**——不知道 FOLDERS 是文件树、不知道"收发设置"是串口的

和 `CommandRegistry`、`ConfigurationRegistry`、`FileDecorationRegistry` 同一模式。

## E36#1 ViewContainerService 类

**文件：** 新 `src/core/ViewContainerService.ts`  
**行数：** ~50 行

继承 `RegistryBase`（已有基类，`src/core/RegistryBase.ts`）——登记注销自动对称。插件卸载时基类自动调 `unregisterAll(pluginId)`。

```typescript
import { RegistryBase } from "./RegistryBase";
import { Emitter } from "./CoreEvents";

export interface ViewContainerDescriptor {
  title: string;
  icon?: string;
}

export interface ViewDescriptor {
  id: string;
  title: string;
  render: React.ComponentType;
}

export interface ViewContainerChangeEvent {
  containerId: string;
  views: ViewDescriptor[];
}

export class ViewContainerService extends RegistryBase {
  private containers = new Map<string, ViewContainerDescriptor>();
  // 两层 Map：外层 key = containerId，内层 key = viewId
  // 内层 Map 插入顺序 = 注册顺序 = 侧栏从上到下的渲染顺序
  private views = new Map<string, Map<string, ViewDescriptor>>();

  private _onDidChangeViews = new Emitter<ViewContainerChangeEvent>();
  readonly onDidChangeViews = this._onDidChangeViews.event;

  registerViewContainer(containerId: string, descriptor: ViewContainerDescriptor): void { ... }
  getViewContainer(containerId: string): ViewContainerDescriptor | undefined { ... }
  registerView(containerId: string, descriptor: ViewDescriptor): void { ... }
  getViews(containerId: string): ViewDescriptor[] { ... }

  // RegistryBase 要求实现
  unregisterAll(pluginId: string): void {
    // 遍历 this.views → 找到所有 pluginId 注册的 view → 删除 → fire onDidChangeViews
  }
}
```

**验证：**
1. `new ViewContainerService()` → `getViews("explorer")` 返回 `[]`
2. `registerView("explorer", { id: "test", title: "测试", render: TestView })` → `getViews("explorer")` 返回 `[{ id: "test", ... }]`
3. `unregisterAll("test-plugin")` → `getViews("explorer")` 回到 `[]`
4. 连续注册 3 个 view → `getViews` 返回顺序 = 注册顺序

## E36#2 plugin.schema.json 贡献点

**文件：** `public/schemas/plugin.schema.json`  
**行数：** ~25 行

让 `plugin.json` 可以声明 `viewsContainers` 和 `views`，JSON Schema 验证通过。

新增 schema 片段：
```json
{
  "contributes": {
    "properties": {
      "viewsContainers": {
        "type": "object",
        "description": "声明侧栏容器。点此插件图标时切换到此容器。",
        "patternProperties": {
          "^[a-z][a-z0-9-]*$": {
            "type": "object",
            "properties": {
              "title": { "type": "string" },
              "icon": { "type": "string" }
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
                "when": { "type": "string", "description": "Context key 条件" }
              },
              "required": ["id", "render"]
            }
          }
        }
      }
    }
  }
}
```

**验证：** 在任意 plugin.json 的 `contributes` 中加 `viewsContainers` 和 `views` → `npm run check` 零错误。
