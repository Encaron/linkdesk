# Monaco 编辑器插件

> 2026-07-24。从旧 P7b 拆分——Monaco 是重型编辑器，需要独立 WebContentsView（E3a 提供）。
> **性质：** 纯插件——`import * as monaco from 'monaco-editor'` → React 组件。

---

## 一、定位

Monaco 编辑器插件对标 VS Code 的文本编辑器。壳不知道 Monaco 的存在——壳只看到"有个标签页，里面是插件 X 的 WebContentsView"。

```
plugins/editor/
├── plugin.json          → contributes.editors
├── EditorView.tsx       → Monaco 编辑器 React 包装
└── index.tsx            → 导出
```

---

## 二、任务清单

### 任务 1：Monaco JSON 编辑器标签页（~80 行）

基础编辑器组件——语法高亮、IntelliSense、多标签页。打开 `.json` / `.md` / `.txt` 等文件。

### 任务 2：文件编码检测/切换（~60 行）

EncodingService——检测文件编码（UTF-8/GBK/Shift-JIS）→ 编辑器自动选编码。状态栏显示当前编码，点击切换。

### 任务 3：Settings Editor JSON schema 提示/自动补全（~50 行）

Monaco 编辑器读取 `plugin.schema.json` → 编辑 `settings.json` / `keybindings.json` 时自动补全 + 悬停提示 + 验证。

### 任务 4：Reopen Closed Tab（Ctrl+Shift+T）（~30 行）

```typescript
// useTabManager reducer
case 'closeTab':
  closedTabStack.push(action.tab);
  if (closedTabStack.length > 10) closedTabStack.shift();
case 'reopenClosedTab':
  const last = closedTabStack.pop();
  if (last) createTab(last);
```

> 注：这是壳级功能（useTabManager），但消费端主要是编辑器标签页。不碰架构，只是加一条 command + reducer case。

---

## 三、汇总

| # | 任务 | 行数 |
|:--:|------|:--:|
| 1 | Monaco JSON 编辑器标签页 | ~80 |
| 2 | 文件编码检测/切换（EncodingService） | ~60 |
| 3 | Settings Editor JSON schema 自动补全 | ~50 |
| 4 | Reopen Closed Tab（Ctrl+Shift+T） | ~30 |
| **合计** | | **~220 行** |

---

## 四、依赖

- **E3a**：独立 WebContentsView——Monaco 是重型库（~5MB），必须独立进程
- **E2c FileService**：读文件内容
- **E2c FileAssociationService**：双击文件 → 匹配到编辑器插件

---

> **← 文件树插件：** `01-文件树插件.md`
> **插件索引：** `00-README.md`
