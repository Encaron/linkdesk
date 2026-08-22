# 03-02 — Context Key 矩阵 🔴

> 对标 VS Code `files.ts` — 14+ RawContextKey。快捷键 when 条件 + 右键菜单显隐 + 视图状态。
> 对应执行清单：**#6（P0 阻塞剪贴板+重命名）+ #7（P1 压缩导航+UI）**。
>
> 🔴 **阻塞 #19（重命名）、#17-#18（剪贴板）的 when 条件。**

---

## 一、VS Code 对标

| VS Code Key | 类型 | 用途 |
|:--|:--|------|
| `filesExplorerFocus` | boolean | 文件树聚焦 |
| `explorerResourceIsFolder` | boolean | 聚焦项是目录 |
| `explorerResourceIsRoot` | boolean | 聚焦项是根 |
| `explorerResourceCut` | boolean | 🔥 剪贴板有剪切项——粘贴命令 when 条件 |
| `explorerResourceReadonly` | boolean | 🔥 只读文件——禁止重命名/删除 |
| `explorerResourceMoveableToTrash` | boolean | Windows 回收站 vs 永久删除 |
| `explorerResourceAvailableEditorIds` | string | "打开方式…"编辑器列表 |
| `explorerViewletCompressedFocus` | boolean | 压缩节点聚焦 |
| `explorerViewletCompressedFirstFocus` | boolean | 压缩段首段聚焦 |
| `explorerViewletCompressedLastFocus` | boolean | 压缩段末段聚焦 |
| `viewHasSomeCollapsibleItem` | boolean | "全部折叠"按钮显隐 |
| `FoldersViewVisibleContext` | boolean | FOLDERS 视图可见 |
| `ExplorerFocusedContext` | boolean | Explorer viewlet 聚焦 |
| `OpenEditorsFocusedContext` | boolean | Open Editors 聚焦 |

## 二、当前实现 ✅（4 个）

| Key | 设置位置 | 何时设置 |
|:--|:--|------|
| `explorerFocus` | `FileTree.tsx` onFocus/onBlur | 容器获得/失去焦点 |
| `explorerItemIsFile` | `FileTree.tsx` useEffect (focusedUri) | 聚焦项是文件 |
| `explorerItemIsDir` | `FileTreeContextMenu.tsx` | 右键菜单弹出时 |
| `explorerItemIsRoot` | `FileTreeContextMenu.tsx` | 右键菜单弹出时 |

## 三、缺失——按优先级

### P0 🔴 阻塞后续任务

| Key | 用途 | 阻塞 |
|:--|------|:--:|
| `explorerResourceCut` | 剪贴板剪切态——粘贴 when 条件 | #26/#27 |
| `explorerResourceReadonly` | 只读文件禁止重命名/删除 when | #25 |
| `explorerResourceMoveableToTrash` | 回收站 vs 永久删除 | #25 |

### P1 ⚠️ 压缩导航依赖

| Key | 用途 | 阻塞 |
|:--|------|:--:|
| `explorerViewletCompressedFocus` | 压缩节点键盘导航 when | #7 #15 |
| `explorerViewletCompressedFirstFocus` | 压缩段首段导航 | #7 |
| `explorerViewletCompressedLastFocus` | 压缩段末段导航 | #7 |

### P2 🔵 UI 完善

| Key | 用途 |
|:--|------|
| `viewHasSomeCollapsibleItem` | 工具栏"全部折叠"按钮显隐 |
| `FoldersViewVisibleContext` | 大纲/时间线切换时 FOLDERS 可见性 |

## 四、实现方式

当前用 `ContextKeyService.setValue(key, value)`——对标 VS Code `IContextKeyService`。设置点：

```
FileTree.tsx onFocus/onBlur     → explorerFocus
FileTree.tsx useEffect          → explorerItemIsFile (per focusedUri)
FileTreeContextMenu.tsx mount   → explorerItemIsDir, explorerItemIsRoot
FileTreeContextMenu.tsx unmount → 清除（对标 VS Code——瞬态 key）
#20 新增                        → explorerResourceCut (剪贴板服务)
#20 新增                        → explorerResourceReadonly (FileTree 选中时)
```

## 五、AI 进场须知 🛡️

- **Context key 是瞬态的**——菜单关闭/sidebar 失焦时清除。对标 VS Code
- **新增 key → 先在本文档登记**——避免两个 key 做同一件事
- **when 条件语法：** `"explorerFocus && !inputFocus"` → `ContextKeyService.matches()` 求值
