# ContainerRole — 容器角色重构

> 对应任务：E36#TB-ROLE。**`title=""` hack → 显式 `role` 字段——消灭隐式分支、状态跨容器泄漏。**

---

## 零、设计基石——容器是大厅的公共桌子，不是声明者的私有财产

### file-tree 建桌子、Git 往上放东西——互不知道对方存在

```
file-tree 启动：
  "大厅，我要放一张叫 explorer 的桌子，标题写 资源管理器"
  → ViewContainerService.registerViewContainer("file-tree", { id: "explorer", title: "资源管理器" })
  → 大厅里多了一张桌子

file-tree 继续：
  "这张桌子上我要放一个叫 folders 的 view"
  → ViewContainerService.registerView("file-tree", "explorer", { id: "folders", render: FoldersView })
  → explorer 桌子上多了 FOLDERS

Git 插件启动：
  "大厅，explorer 桌子上我也要放一个叫 outline 的 view"
  → ViewContainerService.registerView("git", "explorer", { id: "outline", title: "大纲", render: OutlineView })
  → explorer 桌子上多了 OUTLINE
```

**Git 不知道 file-tree 的存在。Git 只知道大厅里有一张叫 explorer 的桌子。**

### SidePanel 消费——同样不知道谁放的

```
SidePanel 切换到 explorer：
  "大厅，explorer 桌子上现在有什么？"
  → ViewContainerService.getActiveViews("explorer")
  → [folders, outline]
  → 渲染两个 section——不区分哪个是 file-tree 放的、哪个是 Git 放的
```

### 三件事彼此独立

| 角色 | 动作 | 知道什么 |
|:--|:--|:--|
| file-tree | `registerViewContainer` | 建了 explorer 桌子，声明了图标→explorer 的映射 |
| file-tree | `registerView("explorer", ...)` | 往 explorer 放了一个 FOLDERS |
| Git | `registerView("explorer", ...)` | 往 explorer 放了一个 OUTLINE——**不知道 file-tree 的存在** |
| SidePanel | `getActiveViews("explorer")` | 读表渲染——**不知道 view 是哪个插件放的** |

### 不是"Git 往 file-tree 的侧栏放东西"

是"Git 往大厅的 explorer 桌子放东西"。**桌子不是 file-tree 的——桌子是大厅的。file-tree 只是第一个往上面放 view 的插件，同时声明了「点我的图标切到这张桌子」。**

### 对标圆形大厅模型

```
            ┌──────────────────────────────────────┐
            │  ViewContainerService（大厅的桌子）     │
            │                                      │
  file-tree │  ┌────────┐ ┌────────┐              │ Git 插件
  ─────────→│  │FOLDERS │ │OUTLINE │←─────────────│
            │  └────────┘ └────────┘              │
            │                                      │
            │  桌子不知道 FOLDERS 是文件树          │
            │  桌子不知道 OUTLINE 是 Git            │
            │  SidePanel 不知道谁放的——只读表渲染    │
            └──────────────────────────────────────┘
```

这就是 `registerView("git", "explorer", ...)` 第三个参数是 `"explorer"` 而不是 `"file-tree"` 的原因——**容器 ID 是大厅的命名空间，不是插件的命名空间。**

---

## 一、改之前（当前代码）

### hack：用 `title=""` 推断容器类型

```typescript
// SidePanel.tsx —— 靠 title 字符串猜角色
const toolbarViews = activeViews.filter((v) => v.title === "");
const sectionViews = activeViews.filter((v) => v.title !== "");
```

### 问题

1. **隐式约定**：`title=""` 表示 toolbar，`title≠""` 表示 section。含义藏在标题字符串里，新 AI 看不懂。
2. **动态标题不可用**：file-tree TB6 需要从 `""` 变成 `"linkdesk"` → 跨分支 unmount+remount → state 全丢。
3. **状态跨容器泄漏**：`toolbarHeight` 一个变量全 SidePanel 共享。marketplace 的 search view 高度残留到 explorer → section header `stickyTop` 偏移 → UI 错位（Bug 2）。
4. **if/else 膨胀**：目前 3 个分支（mergeHeader / toolbarViews / sectionViews）。串口监视器、outline、timeline 接入 → 每加一种行为加一个分支 → V2.6 式重复。

### 两个已踩的 Bug

| Bug | 症状 | 根因 | 教训 |
|:--|:--|:--|:--|
| TB6 动态标题 | title 变 → remount → state 丢 | `""`→`非""` 触发分支切换 | 角色不应绑在会变的数据上 |
| toolbarHeight 残留 | 切容器后 UI 错位 | 跨容器共享状态 | 状态应归属组件实例，不归属 SidePanel |

---

## 改之后

### 核心：`ViewDescriptor.role` 替代 `title=""` 判断

```typescript
// src/core/ViewContainerService.ts —— 加一个字段
export interface ViewDescriptor {
  // ...现有字段
  /** 容器角色——替代 title="" hack。默认 "section"。 */
  role?: "toolbar" | "section";
}
```

### plugin.json 改为声明式

```json
// marketplace plugin.json —— 改前
{ "id": "search", "title": "", "render": "...", "order": 0 }

// 改后
{ "id": "search", "title": "搜索", "role": "toolbar", "render": "...", "order": 0 }
```

`title` 不再承载"角色"语义——`title` 就是显示文字。`role` 决定渲染方式。

### plugin.schema.json 加 role 字段

```json
{
  "views": {
    "items": {
      "properties": {
        "role": {
          "type": "string",
          "enum": ["toolbar", "section"],
          "default": "section",
          "description": "容器角色——toolbar 粘顶不受覆盖，section 有折叠头和同级替换"
        }
      }
    }
  }
}
```

### SidePanel 拆为独立 Slot 组件

```
SidePanel（渲染循环——不再做分支判断）
│
├── <ToolbarSlot>                  ← role: "toolbar" 的 view
│     z-index: 2（最高，不被覆盖）
│     position: sticky; top: 0
│     ResizeObserver → 高度 → 流入 SectionStack
│     组件卸载 → 状态跟着销毁（不残留）
│
└── <SectionStack>                 ← role: "section" 的 view 集合
      stickyTop = 父 ToolbarSlot 高度
      │
      ├── <SidebarSection>         ← 同级兄弟，CSS 自动替换
      ├── <SidebarSection>
      └── ...
```

### 壳级父子关系——显式数据流

```
ToolbarSlot 高度变化
    │
    │  （ResizeObserver → setState，组件内部状态）
    ▼
SectionStack stickyTop={height}
    │
    │  （每个 section header 的 top 偏移 = 父层高度）
    ▼
SidebarSection header: position: sticky; top: {stickyTop}px
```

父 = ToolbarSlot 的高度。子 = SectionStack 的 stickyTop。兄弟 = SectionStack 内部同级 section，CSS `position: sticky` 自带替换行为。

无 toolbar 时（file-tree）→ ToolbarSlot 不渲染 → height=0 → SectionStack stickyTop=0 → 自然退化为无父层场景。**不需要"清零"——不存在就没有。**

### 不去除的现有逻辑

- `mergeHeaderWhenSingle` 保留——单 view 且容器声明 `mergeHeaderWhenSingle: true` 时隐藏 section header。这是容器级配置，不受 role 影响。
- ST1 sticky header 保留——`.sidebar-section-header` 的 `position: sticky` 是全局 CSS，所有 section 共享。
- ST2 同级替换保留——CSS 自带行为，不依赖 JS 逻辑。

---

## 角色定义

| role | header | sticky | z-index | 同级行为 | 例子 |
|:--|:--|:--|:--|:--|:--|
| `toolbar` | 无 | 粘顶 | 2（最高） | 始终在最上面，不被任何 section 覆盖 | marketplace 搜索框 |
| `section`（默认） | 有 ▼ + 标题 | stickyTop = 父层高度 | 1 | 同级替换——下一个顶走上一个 | FOLDERS、已安装、会话列表 |

---

## 迁移步骤

### 1. 类型 + schema（~10 行）

- `ViewDescriptor` 加 `role?: "toolbar" | "section"`
- `plugin.schema.json` views items 加 role 字段
- `PluginContributes` 类型加 role

### 2. loader 解析（~3 行）

`parseContributions` 中 view 解析传递 `role` 字段到 `registerView`

### 3. SidePanel 拆 Slot（~50 行）

- 新建 `src/components/shared/ToolbarSlot.tsx`——toolbar view 渲染 + ResizeObserver + `onHeightChange` 回调
- 新建 `src/components/shared/SectionStack.tsx`——section view 列表 + `stickyTop` prop
- `SidePanel.tsx` 简化为：按 role 分组 → `<ToolbarSlot>` + `<SectionStack>`

### 4. 插件改造（~5 行）

- marketplace `plugin.json`：SearchView `"title":""` → `"title":"搜索"` + `"role":"toolbar"`
- file-tree `plugin.json`：去掉 `title: " "` 占位 hack，改回 `"title":""`（TB6 动态填充）

### 5. 去死代码（~10 行）

- `SidePanel.tsx` 去 `title=""` 分支 + `mergeHeader` 中的 `noHeader` hack
- `FoldersView.tsx` TB6 `" "` fallback → `""`（role 已显式，title 可安全为空）

---

## 为什么这个设计消灭了 Bug 2

```
重构前：
  toolbarHeight = useState(0)         ← SidePanel 的状态
  marketplace 设 28 → 切容器 → 28 残留
  → 需要手动"清零"

重构后：
  ToolbarSlot 组件内：useState(0)     ← ToolbarSlot 自己的状态
  ToolbarSlot 销毁 → 状态跟着组件销毁
  → SectionStack 永远看不到旧 ToolbarSlot 的数据
```

**状态归属改变——从"SidePanel 的全局变量"变成"ToolbarSlot 组件的局部变量"。** 组件销毁 = 状态消失，React 生命周期保证。

---

## 串口监视器接入验证

串口监视器声明两个 section 角色 view：

```json
{
  "views": {
    "serial-monitor": [
      { "id": "sessions", "title": "会话列表", "role": "section", "order": 0 },
      { "id": "settings", "title": "收发设置", "role": "section", "order": 1 }
    ]
  }
}
```

SidePanel 渲染：ToolbarSlot 不渲染（无 toolbar view）→ SectionStack stickyTop=0 → 两个 SidebarSection，各自有 sticky header，同级替换。**零额外代码。**

---

## 文件

| 文件 | 改动 |
|:--|:--|
| `src/core/ViewContainerService.ts` | `ViewDescriptor` +1 字段 |
| `src/core/types.ts` | `PluginContributes` views 加 role |
| `public/schemas/plugin.schema.json` | views items 加 role |
| `src/pluginLoader/loader.ts` | parseContributions 传 role |
| 新 `src/components/shared/ToolbarSlot.tsx` | ~30 行 |
| 新 `src/components/shared/SectionStack.tsx` | ~25 行 |
| `src/components/SidePanel.tsx` | 改 ~55 −40 |
| `plugins/builtin/marketplace/plugin.json` | SearchView title + role |
| `plugins/builtin/file-tree/plugin.json` | 去 `title: " "` 占位 |
| `plugins/builtin/file-tree/src/views/FoldersView.tsx` | TB6 fallback `" "`→`""` |

**行数：** ~130 行净改动（+85 新 / −45 死代码）

---

> **← 索引：** `00-README.md`
> **← 依属：** `SidePanel改造.md`
> **→ 执行清单：** `../05-执行清单.md`
