# Phase 5 右键菜单系统设计

> VS Code 对标：`contributes.menus` + `MenuId` + `when` 条件
> Phase 5 做完整闭环——MenuId 定义 + MenuRegistry + 消费端 + context key when 过滤（见主设计文档柱子 6）

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
| 文件树 + 文件夹 | `FileContext` | `isFolder` | 新建文件 / 新建文件夹 / 在终端中打开 / 查找 |
| 文件树 + `.html` | `FileContext` | `langId=html` | 上面全部 + Open with Live Server / 在浏览器打开 |
| 文件树 + `.md` | `FileContext` | `langId=markdown` | 上面全部 + MPE: 打开侧边预览 / MPE: 打开图形视图 |
| 扩展市场 + 主题插件 | `ExtensionGear` | `hasThemes` | 设置颜色主题 / 启用/禁用 / 卸载 / 复制 |
| 扩展市场 + 有配置的插件 | `ExtensionGear` | `hasConfiguration` | 上面全部 + **设置** |
| 标签页主区（编辑器） | `EditorContext` | `langId` | 剪切/复制/粘贴 / 格式化 / 转到定义 |
| MPE 预览标签页内 | `WebviewContext` | `webviewId=mpe` | Open Graph View / Export / Zoom / Theme |

**核心：同一个 MenuId（FileContext）在不同上下文下返回不同菜单。** 不是硬编码 if/else——是 `when` 条件过滤。

### 如果不用 MenuId + when，会怎样

```typescript
// ❌ 硬编码——V2 模式
function getFileContextMenu(file: FileNode) {
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
const items = MenuService.getMenuItems(MenuId.FileContext, {
  isFolder: file.isFolder,
  langId: file.language,
  resourcePath: file.path,
})
// Live Server 插件启动时注册了自己的菜单项 + when 条件
// MPE 插件也注册了自己的
// 核心的 getFileContextMenu 不需要知道它们的存在
```

---

## 二、V3 实现设计

### 2.1 MenuId 定义

> 和主设计文档 §柱子3 完全一致——这里是详细消费端说明，那边是唯一权威定义。

```typescript
// src/core/menuTypes.ts
enum MenuId {
  /** Ctrl+Shift+P 命令面板 */
  CommandPalette = "commandPalette",

  /** 标签栏标签右键 */
  TabContext = "tabContext",

  /** 标签页主内容区右键（终端接收区、编辑器等） */
  EditorContext = "editorContext",

  /** 插件市场齿轮菜单 */
  ExtensionGear = "extensionGear",

  /** ☰ 汉堡菜单栏（Phase 6 消费） */
  MenuBar = "menuBar",

  /** 文件树右键（Phase 6 消费） */
  FileContext = "fileContext",

  /** 卡片右键（Phase 7 消费） */
  CardContext = "cardContext",

  /** 快捷发送药丸右键 */
  QuickSendContext = "quickSendContext",

  /** 图标栏右键 */
  IconBar = "iconBar",
}
```

### 2.2 MenuRegistry

```typescript
// src/core/MenuRegistry.ts
interface MenuItem {
  id: string;              // 命令 ID（引用 CommandRegistry）
  group?: string;          // 分组（"navigation", "edit", "extension"）
  when?: string;           // context key 条件（Phase 5 实现——见主设计文档柱子 6）
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

### 场景 2：文档阅读器 + .md 文件右键（Phase 6 文件树）

```
条件：MenuId = FileContext, langId = "markdown"

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

关键：Live Server 注册了 `FileContext` 菜单项 + `when: langId==html`。右键 `.md` 时，这个条件不满足——自动过滤掉。核心代码完全不知道 Live Server 的存在。

### 场景 3：扩展市场 + 两个不同插件

```
插件 A：GitHub Theme（有颜色主题，无 configuration）
插件 B：HTML CSS Support（有 configuration）

对 GitHub Theme 右键（ExtensionGear + hasColorThemes=true + hasConfiguration=false）：
  ┌──────────────────────────┐
  │ 设置颜色主题              │  ← when: hasColorThemes
  │ 启用 / 禁用               │
  │ 卸载                      │
  │ 复制 / 复制扩展 ID        │
  │ 下载 VSIX                 │
  └──────────────────────────┘

对 HTML CSS Support 右键（ExtensionGear + hasConfiguration=true）：
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
条件：MenuId = FileContext, resourceExtname = ".dxf"

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
// 齿轮菜单 = MenuId.ExtensionGear 的另一种触发方式
<button onClick={e => {
  const items = MenuService.getMenuItems(MenuId.ExtensionGear, {
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

## 五、Phase 5 完整闭环

Phase 5 做完整闭环：MenuId 定义 + MenuRegistry + 消费端（标签页右键、编辑器右键、扩展市场齿轮）+ context key when 条件过滤。见主设计文档柱子 3（菜单系统）和柱子 6（context key）。

后延的只是新 MenuId 消费端：Phase 6 文件树右键（MenuId.FileContext）、Phase 7 卡片右键（MenuId.CardContext）。不改变菜单系统的注册/查询机制。

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
  4. 用 ContextKeyService 过滤 when 条件（Phase 5 实现）
  5. 返回最终菜单项列表
  6. UI 组件渲染右键菜单
  7. 用户点某个菜单项 → CommandRegistry.execute(commandId)
```

**菜单项引用命令 ID，命令 ID 引用处理器。** 三者独立注册，通过 ID 关联。

---

## 六、归一化——统一 ContextMenu UI 组件 + 统一失焦行为

### 6.1 当前问题

Phase 4 有**三个**各自独立的右键菜单实现，互不共享代码：

| # | 位置 | 文件 | 触发 | 失焦方式 | 问题 |
|:--:|------|------|------|------|------|
| 1 | 标签页右键 | `TabBar.tsx:126-197` | `onContextMenu` | backdrop click + Escape | ✅ 较完整 |
| 2 | 终端接收区右键 | `ReceiveContextMenu.tsx:14-31` | CM6 DOM `contextmenu` 事件 | overlay click | ❌ 无 Escape，无 window blur |
| 3 | 快捷发送右键 | `terminal/index.tsx:912-915` | `onContextMenu` | overlay click | ❌ 内联 JSX，连组件都不是 |

**三个实现 → 三种失焦行为 → 三种定位方式 → 三种样式。** 这就是 V2 的"同一 bug 三处出现"。

**V2 历史教训（用户原话）：** V2 时代右键菜单常有"点击空白处菜单不消失""移动窗口菜单还留在原地（失焦不关）"的问题。V3 也有过一次（git 历史可查）。

### 6.2 归一化方案——一个共享 `<ContextMenu>` 组件

```typescript
// src/components/shared/ContextMenu.tsx（~60 行）
interface ContextMenuProps {
  menuId: MenuId;                // MenuId.EditorContext / MenuId.tabContext
  anchor: { x: number; y: number };  // 菜单弹出位置
  context?: Record<string, unknown>;  // 传给 when 条件的上下文
  onClose: () => void;
}

function ContextMenu({ menuId, anchor, context, onClose }: ContextMenuProps) {
  const items = MenuService.getMenuItems(menuId, context);

  // ── 归一化失焦：三种方式关闭菜单 ──
  useEffect(() => {
    // 1. Escape 键
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    // 2. 窗口失焦（移动窗口/Alt+Tab）
    const onBlur = () => onClose();
    // 3. 滚动——菜单跟着内容滚动会错位，关了更安全
    const onScroll = () => onClose();

    window.addEventListener("keydown", onKey);
    window.addEventListener("blur", onBlur);
    window.addEventListener("scroll", onScroll, true); // capture phase
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [onClose]);

  return (
    <>
      {/* backdrop：点击外部 → 关闭（对标 VS Code context menu block layer）*/}
      <div
        className="ctx-backdrop"
        onClick={onClose}
        onContextMenu={(e) => { e.preventDefault(); onClose(); }}
      />
      <div
        className="ctx-menu"
        style={{ position: "fixed", left: anchor.x, top: anchor.y }}
      >
        {items.map((item) => (
          <div key={item.id} className="ctx-item" onClick={() => {
            CommandRegistry.execute(item.command);
            onClose();
          }}>
            {item.label}
            {item.keybinding && <span className="ctx-shortcut">{item.keybinding}</span>}
          </div>
        ))}
      </div>
    </>
  );
}
```

**三种统一的失焦方式，每一个 `<ContextMenu>` 渲染实例都会自动注册：**

| 方式 | 事件 | 对标 |
|------|------|------|
| 点击外部（backdrop） | `onClick` on backdrop div | VS Code context menu block layer |
| 键盘 | `Escape` keydown | 所有桌面右键菜单的标准行为 |
| 窗口失焦 | `window.blur` | 用户移动窗口/Alt+Tab → 菜单自动消失 |
| 滚动 | `window.scroll`（capture） | 菜单跟着内容滚动会错位 |

**所有右键菜单渲染——标签页右键、接收区右键、快捷发送右键、插件注册的右键——全部走这一个 `<ContextMenu>` 组件。** 修一个 bug 全受益。

### 6.3 迁移清单——Phase 5 必须全部替换

```
☐ #1 标签页右键 → <ContextMenu menuId="tabContext">
    菜单元数据从硬编码数组迁到 MenuService 注册

☐ #2 终端接收区右键 → <ContextMenu menuId="editorContext">
    终端 plugin.json 声明菜单项：复制/全选/清空/暂停
    ReceiveContextMenu.tsx → 删除

☐ #3 快捷发送右键 → <ContextMenu menuId="quickSendContext">
    删除 terminal/index.tsx 内联 JSX

☐ #4 新增：齿轮菜单 → <ContextMenu menuId="extensionGear">
    已有简化版（Phase 4），改用 <ContextMenu> 渲染，内容从 MenuService 读

☐ #5 新建 shared/ContextMenu.tsx + shared/ContextMenu.css
    backdrop + 菜单面板 + 三种失焦 + z-index 分层
```

**验证清单（Phase 5 做完后逐个确认）：**

```
☐ 打开标签页右键菜单 → 点空白处 → 菜单消失
☐ 打开标签页右键菜单 → 按 Escape → 菜单消失
☐ 打开标签页右键菜单 → 拖动/移动窗口 → 菜单消失（window.blur）
☐ 打开接收区右键菜单 → 滚动 CM6 → 菜单消失（scroll capture）
☐ 齿轮菜单同样通过以上四条
☐ 同时打开两个右键菜单 → 不可能——backdrop 阻断第二次右键
```
