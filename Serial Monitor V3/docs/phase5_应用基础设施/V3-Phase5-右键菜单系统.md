# Phase 5 右键菜单系统设计

> VS Code 对标：`contributes.menus` + `MenuId` + `when` 条件
> Phase 5 做骨架（MenuId 定义 + MenuRegistry + 基础消费端）
> Phase 7 做 context key 条件系统（`when` 过滤）

---

## 一、为什么右键菜单是基础设施

### 不同位置、不同对象、不同菜单

VS Code 里点右键，菜单内容取决于**三个变量**：

```
菜单内容 = MenuId（"在哪儿点"） + 上下文（"点了什么"） + when（"当前什么状态"）
```

| 右键位置 | MenuId | 上下文 | 典型菜单项 |
|---------|--------|--------|-----------|
| 图标栏 | `ActivityBarContext` | 无 | 文件夹 / 搜索 / 源代码管理 / 扩展 / 移动位置 |
| 文件树 + 文件夹 | `ExplorerContext` | `isFolder` | 新建文件 / 新建文件夹 / 在终端中打开 / 查找 |
| 文件树 + `.html` | `ExplorerContext` | `langId=html` | 上面全部 + Open with Live Server / 在浏览器打开 |
| 文件树 + `.md` | `ExplorerContext` | `langId=markdown` | 上面全部 + MPE: 打开侧边预览 / MPE: 打开图形视图 |
| 扩展市场 + 主题插件 | `ExtensionContext` | `hasThemes` | 设置颜色主题 / 启用/禁用 / 卸载 / 复制 |
| 扩展市场 + 有配置的插件 | `ExtensionContext` | `hasConfiguration` | 上面全部 + **设置** |
| 标签页主区（编辑器） | `EditorContext` | `langId` | 剪切/复制/粘贴 / 格式化 / 转到定义 |
| MPE 预览标签页内 | `WebviewContext` | `webviewId=mpe` | Open Graph View / Export / Zoom / Theme |

**核心：同一个 MenuId（ExplorerContext）在不同上下文下返回不同菜单。** 不是硬编码 if/else——是 `when` 条件过滤。

### 如果不用 MenuId + when，会怎样

```typescript
// ❌ 硬编码——V2 模式
function getExplorerContextMenu(file: FileNode) {
  const items = [
    { label: "新建文件", action: newFile },
    { label: "新建文件夹", action: newFolder },
    { label: "复制", action: copy },
  ]
  if (file.extension === ".html") {
    items.push({ label: "Open with Live Server", action: liveServer })
  }
  if (file.extension === ".md") {
    items.push({ label: "MPE: 打开侧边预览", action: mpePreview })
  }
  return items
}

// ✅ MenuRegistry——VS Code 模式
const items = MenuService.getMenuItems(MenuId.ExplorerContext, {
  isFolder: file.isFolder,
  langId: file.language,
  resourcePath: file.path,
})
// Live Server 插件启动时注册了自己的菜单项 + when 条件
// MPE 插件也注册了自己的
// 核心的 getExplorerContextMenu 不需要知道它们的存在
```

---

## 二、V3 实现设计

### 2.1 MenuId 定义

```typescript
// src/core/menuTypes.ts
enum MenuId {
  /** 图标栏右键 */
  IconBar = "iconBar",

  /** 标签页标签右键 */
  TabContext = "tabContext",

  /** 标签页主内容区右键 */
  EditorContext = "editorContext",

  /** 扩展市场列表项右键（和齿轮同源） */
  ExtensionContext = "extensionContext",

  /** 卡片右键（Phase 6） */
  CardContext = "cardContext",

  /** 文件树右键（Phase 7） */
  ExplorerContext = "explorerContext",
}
```

### 2.2 MenuRegistry

```typescript
// src/core/MenuRegistry.ts
interface MenuItem {
  id: string;              // 命令 ID（引用 CommandRegistry）
  group?: string;          // 分组（"navigation", "edit", "extension"）
  when?: string;           // context key 条件（Phase 7）
}

class MenuRegistry {
  // 注册
  static registerMenu(menuId: MenuId, pluginId: string, items: MenuItem[]): void

  // 查询——消费端右键时调用
  static getMenuItems(menuId: MenuId, context: Record<string, unknown>): MenuItem[]

  // 获取原始注册表（调试用）
  static getAll(): Map<MenuId, MenuItem[]>
}
```

### 2.3 插件声明——对标 VS Code `contributes.menus`

```json
// 终端插件的 plugin.json
{
  "name": "终端",
  "contributes": {
    "commands": [
      { "id": "terminal.clear", "title": "清空接收区" },
      { "id": "terminal.export", "title": "导出日志" },
      { "id": "terminal.pause", "title": "暂停接收" }
    ],
    "menus": {
      "tabContext": [
        { "command": "terminal.clear" },
        { "command": "terminal.export" }
      ],
      "editorContext": [
        { "command": "terminal.clear" },
        { "command": "terminal.pause" }
      ]
    }
  }
}
```

### 2.4 消费端（UI 组件右键时）

```typescript
// TabBar.tsx — 标签页右键
function onTabContextMenu(tab: Tab, e: React.MouseEvent) {
  const items = MenuService.getMenuItems(MenuId.TabContext, {
    tabType: tab.type,
    pluginId: tab.pluginId,
    dirty: tab.dirty,
  })
  showContextMenu(e.clientX, e.clientY, items)
}

// MainContent.tsx — 标签页内容区右键
function onEditorContextMenu(e: React.MouseEvent) {
  const items = MenuService.getMenuItems(MenuId.EditorContext, {
    pluginId: activePluginId,
  })
  showContextMenu(e.clientX, e.clientY, items)
}
```

---

## 三、场景实例

### 场景 1：终端标签页右键

```
条件：MenuId = TabContext, pluginId = "terminal"

菜单：
  ┌──────────────────────────┐
  │ 清空接收区      Ctrl+L   │  ← terminal/plugin.json 注册
  │ 导出日志        Ctrl+S   │  ← terminal/plugin.json 注册
  │ 暂停接收                  │  ← terminal/plugin.json 注册
  ├──────────────────────────┤
  │ 关闭                      │  ← 核心内置命令
  │ 关闭其他                  │
  │ 关闭右侧                  │
  ├──────────────────────────┤
  │ 向下分屏                  │  ← 核心内置命令
  │ 向右分屏                  │
  └──────────────────────────┘
```

实现：终端插件注册了 3 个 `tabContext` 菜单项 → `MenuService.getMenuItems` 返回它们 + 核心内置项。核心不知道"终端有哪些菜单项"。

### 场景 2：文档阅读器 + .md 文件右键（Phase 7 文件树）

```
条件：MenuId = ExplorerContext, langId = "markdown"

菜单：
  ┌──────────────────────────┐
  │ 新建文件                  │  ← 核心内置
  │ 新建文件夹                │
  │ 复制 / 剪切 / 粘贴        │
  ├──────────────────────────┤
  │ MPE: 打开侧边预览 Ctrl+K V│  ← MPE 插件注册（when: langId==markdown）
  │ MPE: 打开图形视图         │  ← MPE 插件注册
  ├──────────────────────────┤
  │ 文档阅读器：打开预览       │  ← 文档阅读器插件注册（when: langId==markdown）
  ├──────────────────────────┤
  │ Open with Live Server     │  ← Live Server 插件注册（when: langId==html）
  │                           │     ← 当前是 .md，不满足条件，不显示
  └──────────────────────────┘
```

关键：Live Server 注册了 `ExplorerContext` 菜单项 + `when: langId==html`。右键 `.md` 时，这个条件不满足——自动过滤掉。核心代码完全不知道 Live Server 的存在。

### 场景 3：扩展市场 + 两个不同插件

```
插件 A：GitHub Theme（有颜色主题，无 configuration）
插件 B：HTML CSS Support（有 configuration）

对 GitHub Theme 右键（ExtensionContext + hasColorThemes=true + hasConfiguration=false）：
  ┌──────────────────────────┐
  │ 设置颜色主题              │  ← when: hasColorThemes
  │ 启用 / 禁用               │
  │ 卸载                      │
  │ 复制 / 复制扩展 ID        │
  │ 下载 VSIX                 │
  └──────────────────────────┘

对 HTML CSS Support 右键（ExtensionContext + hasConfiguration=true）：
  ┌──────────────────────────┐
  │ 启用 / 禁用               │
  │ 卸载                      │
  │ 复制 / 复制扩展 ID        │
  │ 设置                      │  ← when: hasConfiguration ✨
  │ 下载 VSIX                 │
  └──────────────────────────┘
```

同一个 MenuId，同一套代码，因为上下文不同返回不同菜单。"设置"只在插件有 configuration 时才出现。

### 场景 4：CAD 插件 + .dxf 文件右键（未来）

```
条件：MenuId = ExplorerContext, resourceExtname = ".dxf"

菜单：
  ┌──────────────────────────┐
  │ 新建文件 / 文件夹 / 复制   │  ← 核心内置
  ├──────────────────────────┤
  │ CAD: 打开                  │  ← CAD 插件注册（when: resourceExtname==.dxf）
  │ CAD: 导出为 PDF            │  ← CAD 插件注册
  │ CAD: 导出为 STL            │  ← CAD 插件注册
  ├──────────────────────────┤
  │ 在集成终端中打开           │  ← 核心
  └──────────────────────────┘
```

CAD 插件作者只需要在自己的 `plugin.json` 里声明菜单项 + `when` 条件。不需要改 V3 一行核心代码。

---

## 四、和齿轮菜单的关系

你在扩展市场里点齿轮，其实**和右键是同一个数据源**：

```typescript
// 齿轮菜单 = MenuId.ExtensionContext 的另一种触发方式
<button onClick={e => {
  const items = MenuService.getMenuItems(MenuId.ExtensionContext, {
    pluginId: plugin.id,
    hasConfiguration: !!plugin.manifest.contributes?.configuration,
    hasColorThemes: !!plugin.manifest.themes,
    isEnabled: !isPluginDisabled(plugin.id),
  })
  showDropdown(e.clientX, e.clientY, items)
}}>
  <span className="codicon codicon-gear" />
</button>
```

**齿轮和右键，都是 `MenuService.getMenuItems()`**。不是两套系统。

---

## 五、Phase 5 vs Phase 7 分工

| 能力 | Phase 5 | Phase 7 |
|------|:--:|:--:|
| MenuId 定义 | ✅ 全部定义 | — |
| MenuRegistry 注册/查询 | ✅ | — |
| 标签页右键 | ✅ | — |
| 标签页内容区右键 | ✅ | — |
| 扩展市场齿轮/右键 | ✅ | — |
| 图标栏右键 | ⚠️ 骨架 | ✅ |
| `when` 条件（context key） | ❌ | ✅ |
| 文件树右键 | ❌（需文件树） | ✅ |
| 插件声明菜单项 + when | ⚠️ 声明格式就绪，when 不生效 | ✅ when 生效 |

Phase 5 搭骨架：MenuId + MenuRegistry + 消费端（标签页右键、编辑器右键、扩展市场齿轮）。

Phase 7 加灵魂：`when` 条件让同一个 MenuId 在不同上下文返回不同菜单。但 Phase 5 已经能让**不同 MenuId 返回不同菜单**了——这足够让终端插件注册自己的右键菜单项。

---

## 六、和其他柱子的关系

```
plugin.json
  ├── contributes.commands (柱子 1)
  │     └── CommandRegistry — "有哪些命令"
  │
  └── contributes.menus (柱子 3)
        └── MenuRegistry — "哪些命令出现在哪些右键位置"
             引用 CommandRegistry 中的命令 ID

右键流程：
  1. UI 组件检测到右键事件
  2. 调用 MenuService.getMenuItems(menuId, context)
  3. MenuService 查 MenuRegistry → 拿到该 menuId 下所有菜单项
  4. (Phase 7) 用 context key 过滤 when 条件
  5. 返回最终菜单项列表
  6. UI 组件渲染右键菜单
  7. 用户点某个菜单项 → CommandRegistry.execute(commandId)
```

**菜单项引用命令 ID，命令 ID 引用处理器。** 三者独立注册，通过 ID 关联。
