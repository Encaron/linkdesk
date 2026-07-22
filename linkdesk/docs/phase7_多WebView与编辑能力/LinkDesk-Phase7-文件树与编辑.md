# Phase 7b — 文件树与编辑

> 2026-07-22。从 [LinkDesk-Phase7-设计.md](./LinkDesk-Phase7-设计.md) §二 7b 展开。
> **性质：** 第一个非终端消费者插件——验证多 WebView 底座 + Phase 6 基础设施。

---

## 一、前置条件——Phase 6 提供

文件树诞生时，以下基础设施已就绪（Phase 6c）：

```
FileService
  → 文件树 listDir(rootPath) → 渲染文件列表
  → Monaco readFile(path) → 编辑 JSON
  → watch(rootPath) → 外部变动自动刷新

WorkspaceService
  → rootPath → 文件树的根
  → openFolder() → 欢迎页/标题栏/文件树 三处入口

KeybindingRegistry + Chord
  → F2 重命名（when: Explorer focus + !root + writable）
  → Delete 移到回收站（when: Explorer focus）
  → Ctrl+X/C/V 剪切复制粘贴
  → Ctrl+Shift+F 跨文件搜索

CoreEvents.onDidChangeFileSystem
  → FileService.watch 检测外部变动 → emit → 文件树自动刷新

CoreEvents.onDidChangeWorkspaceFolders
  → WorkspaceService 文件夹变化 → emit → 欢迎页/标题栏/文件树联动
```

---

## 二、文件关联系统

**问题：** 文件树双击 `demo.md` → 系统不知道用什么插件打开。

Phase 5 没有"哪种文件由哪个插件打开"的注册机制。命令系统能注册"我能干什么"，但不能声明"我对什么文件感兴趣"。

**plugin.json 新增 `contributes.fileAssociations`：**

```json
{
  "contributes": {
    "fileAssociations": [
      { "extension": ".md", "command": "docReader.open", "label": "Markdown 阅读器" },
      { "extension": ".dxf", "command": "cad.openFile", "label": "CAD 查看器" }
    ]
  }
}
```

**FileAssociationService（~60 行）：**

```typescript
class FileAssociationService {
  private extToCommands = new Map<string, { pluginId: string; command: string }[]>()

  register(pluginId: string, associations: FileAssociation[]): void
  getCommandFor(extension: string): { pluginId: string; command: string } | undefined
  getPluginsFor(extension: string): { pluginId: string; command: string; label: string }[]
  getAllExtensions(): string[]
}

// 文件树双击/右键"打开"：
const match = FileAssociationService.getCommandFor(".md")
if (match) CommandRegistry.execute(match.command, { filePath })

// 文件树右键"打开方式…"子菜单：
const plugins = FileAssociationService.getPluginsFor(".md")
// → 动态生成子菜单，每项对应一个插件的命令
```

---

## 三、系统文件拖入窗口打开

**场景：** 用户从桌面拖 `board.dxf` 到软件窗口 → FileAssociationService 匹配 → 打开 CAD 插件。

Tauri v2 的 `onDragDropEvent`（window 级）支持监听文件拖入。

```typescript
// App.tsx 或 MainContent（~50 行）
const { listen } = await import('@tauri-apps/api/event')
listen('tauri://drag-drop', (event) => {
  const files = event.payload.paths as string[]
  for (const path of files) {
    const ext = path.substring(path.lastIndexOf('.'))
    const match = FileAssociationService.getCommandFor(ext)
    if (match) {
      CommandRegistry.execute(match.command, { filePath: path })
    }
  }
})
```

---

## 四、Reopen Closed Tab（Ctrl+Shift+T）

**对标 VS Code：** `Ctrl+Shift+T` 撤销关闭标签页。

```typescript
// useTabManager reducer 改动（~30 行）
case 'closeTab':
  closedTabStack.push(action.tab)
  if (closedTabStack.length > 10) closedTabStack.shift()
  // ... 原有删除逻辑

case 'reopenClosedTab':
  const last = closedTabStack.pop()
  if (last) createTab(last)  // 恢复到原来的 group
```

---

## 五、Monaco JSON 编辑器标签页

**对标 VS Code：** `Preferences: Open Settings (JSON)` + `Preferences: Open Workspace Settings (JSON)`。

```
Ctrl+Shift+P → "打开设置 (JSON)" → 新标签页 → Monaco 编辑 settings.json
Ctrl+Shift+P → "打开工作区设置 (JSON)" → Monaco 编辑 .linkdesk/settings.json

编辑 → Ctrl+S 保存 → ConfigurationService 检测文件变动
  → emit onDidChangeConfiguration → 所有 useConfiguration() 组件刷新
```

已有基础：Phase 2 的终端发送栏已有 Monaco 单行编辑器。扩展到多行 JSON 编辑 = 换 `language: 'json'` + readonly: false。~80 行。

---

## 六、任务清单

| # | 任务 | 说明 |
|:--:|------|------|
| 1 | 文件树视图——📁 图标栏 → 侧栏/标签页（viewRole: sidebarPrimary，对标 VS Code Explorer） | 新视图插件 |
| 2 | 文件树键盘操作——F2/Delete/Ctrl+XCV/Ctrl+N/Ctrl+Shift+N，全部带 when 条件对标 VS Code | 交互规范 |
| 3 | 文件关联——FileAssociationService + contributes.fileAssociations | 新贡献类型 + 新服务 |
| 4 | 系统文件拖入 + Reopen Closed Tab（Ctrl+Shift+T） | 交互入口 + 壳功能 |
| 5 | Monaco JSON 编辑器标签页（打开 settings.json / keybindings.json） | 新标签页类型 |
| 6 | Tauri fs API 归一化清理——3 个服务 7 处重复 I/O 改为走 FileService（P6c 已建） | 清旧债 |
| 7 | 文件搜索（Ctrl+Shift+F 跨文件内容搜索） | 新功能 |
| 8 | 文件树多选/批量操作 | 交互增强 |
| 9 | 文件编码检测/切换（EncodingService） | 新服务 |
| 10 | 拖拽文件树节点到编辑区 | 交互增强 |
| 11 | Settings Editor JSON schema 提示/自动补全 | Monaco 增强 |
| 12 | 多工作区文件夹（Multi-root） | WorkspaceService 升级 |
| 13 | 文件图标主题（File Icon Theme） | 新贡献类型 |
| 14 | 文件装饰器框架（FileDecorationProvider 接口 + DecorationRegistry） | 新扩展点 |

---

## 七、用户怎么访问文件树——📁 图标栏图标

对标 VS Code Activity Bar 最上面的 📁 Explorer 图标。文件树注册为系统视图插件：

```
plugins/file-tree/plugin.json → { "name": "文件树", "icon": "folder", "iconSource": "codicon", "sidebar": "sidebar.tsx" }
  → viewRegistry 注册 → IconBar 出现 📁 图标
    → 单击 📁 → 侧栏显示文件树（对标 VS Code Explorer 侧栏）
    → 双击 📁 → 文件树变成独立标签页（两层容器的自然能力）
```

Phase 4 的基础设施（viewRegistry + IconBar 动态化 + SidePanel 切换）已经支持这个模式——和终端插件完全相同的注册路径。文件树不需要特殊通道。

---

## 八、"打开文件夹"入口 + 欢迎页集成

**三种状态：**

```
状态 A：未打开文件夹
  → 文件树区域显示 "打开文件夹" 按钮 + 最近列表
  → 欢迎页的"最近"区域同步显示

状态 B：已打开文件夹
  → 文件树显示文件夹内容
  → 标题栏显示文件夹名（对标 VS Code 窗口标题）

状态 C：用户关闭文件夹
  → 回到状态 A
```

Phase 4 的欢迎页已有 `recentViews`（最近打开的标签页）。Phase 7 加 `recentFolders`（最近打开的文件夹）。

---

## 九、多 WebView 注意事项

- 文件树在独立 WebView 中运行
- `FileService.listDir()` 通过 IPC 调用壳侧的 FileService
- 文件树右键菜单走 IPC → 壳侧 MenuService 渲染（壳 WebView 渲染更简单，文件树只负责发"我被右键了"的 IPC 事件）
- Phase 6c 的 DialogService 已就绪——删除文件确认用 `DialogService.confirm()`，不再用 `window.confirm()`

### 禁止写死插件 ID

提交前 grep：`git diff --staged | grep -E 'pluginId === "file-tree"'` → 必须返回空。文件树走 `viewRole: "sidebarPrimary"` 声明，和 terminal 完全相同路径。

---

## 十、相关文档

- [LinkDesk-Phase7-设计.md](./LinkDesk-Phase7-设计.md) — Phase 7 主设计
- [LinkDesk-Phase7-多WebView架构.md](./LinkDesk-Phase7-多WebView架构.md) — 文件树运行的 WebView 底座
- [LinkDesk-Phase6-基础设施缺口.md](../phase6_底层加固/LinkDesk-Phase6-基础设施缺口.md) — FileService / WorkspaceService（文件树直接消费）
- [LinkDesk-Phase6-设计.md](../phase6_底层加固/LinkDesk-Phase6-设计.md) — Phase 6 前置条件总览
