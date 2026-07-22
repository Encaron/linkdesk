# Phase 6c — 基础设施缺口

> 2026-07-22。从 [LinkDesk-Phase6-设计.md](./LinkDesk-Phase6-设计.md) §二 6c 展开。
>
> **性质：** 这些在旧 P6 里被当作"编辑能力的一部分"——但它们本身是框架能力。文件树需要 FileService，但 FileService 不依赖文件树。同理 WorkspaceService / DialogService / Chord / keybindings / 模糊搜索。把框架能力放在消费者 Phase = 底座不完整时写上层。

---

## 一、FileService（~80 行）

### 1.1 为什么是基础设施

Phase 5 的 `ConfigurationService` / `LayoutService` / `StorageService` 各自封装了 `readTextFile` / `writeTextFile`——这是 3 个服务各自实现同一件事。

**FileService 归一化后：** 所有 fs 操作走 FileService。ConfigurationService 读 settings.json → `FileService.readFile(path)`。文件树读目录 → `FileService.listDir(path)`。插件读自己的资源 → `FileService.readFile(path)`。**对标 VS Code `vscode.workspace.fs`。**

### 1.2 接口

```typescript
// src/core/FileService.ts

interface FileEntry {
  name: string;
  path: string;
  isDirectory: boolean;
  isFile: boolean;
  size?: number;
  modifiedAt?: number;
}

interface FileChangeEvent {
  path: string;
  type: "created" | "changed" | "deleted";
}

class FileService {
  async listDir(path: string): Promise<FileEntry[]>;
  async readFile(path: string): Promise<string>;
  async readBinaryFile(path: string): Promise<Uint8Array>;
  async writeFile(path: string, content: string): Promise<void>;
  async delete(path: string): Promise<void>;
  async exists(path: string): Promise<boolean>;
  async watch(path: string): Promise<Disposable>;  // → CoreEvents.onDidChangeFileSystem
}
```

### 1.3 Rust 端

```rust
// 新增 Tauri 命令：
#[tauri::command]
fn list_dir(path: String) -> Result<Vec<FileEntry>, String>;

#[tauri::command]
fn read_file(path: String) -> Result<String, String>;

#[tauri::command]
fn write_file(path: String, content: String) -> Result<(), String>;

#[tauri::command]
fn watch_dir(path: String) -> ...;  // 用 notify crate 监听文件变动
```

### 1.4 旧代码清理

FileService 建成后：
- `ConfigurationService` 的 fs 调用 → 改走 `FileService`
- `LayoutService` 的 fs 调用 → 同上
- `StorageService` 已经独立的读写 → 走 `FileService`（StorageService 管路径，FileService 管 I/O）

**这不是 Phase 6 的必做项——是"机会式"清理。** 如果改动超过 20 行就记 TODO，留给 Phase 7d（抛光）。

---

## 二、WorkspaceService（~80 行）

### 2.1 为什么是基础设施

"当前打开的文件夹"是一个全局概念：
- 文件树用它 → 知道以什么路径为根
- 欢迎页用它 → 显示"打开文件夹"还是"最近文件"
- 标题栏用它 → 显示文件夹名
- 设置用它 → Workspace scope 的 settings.json 路径

### 2.2 接口

```typescript
// src/core/WorkspaceService.ts

interface WorkspaceFolder {
  uri: string;        // "/home/user/stm32-project"
  name: string;       // "stm32-project"
  index: number;
}

class WorkspaceService {
  private _folders: WorkspaceFolder[] = [];

  get folders(): WorkspaceFolder[];
  get rootPath(): string | undefined;  // 第一个文件夹的路径

  async openFolder(): Promise<void>;   // Tauri dialog 选文件夹
  addFolder(path: string): void;
  removeFolder(path: string): void;

  onDidChangeFolders: Event<WorkspaceFolder[]>;
}
```

### 2.3 和 ConfigurationService 的关系

Phase 5 的 `ConfigurationService.setWorkspaceRoot(path)` 接口签名已定义——Phase 6c 只是实现它的调用：

```
WorkspaceService.openFolder()
  → 用户选 /home/user/stm32-project
    → ConfigurationService.setWorkspaceRoot("/home/user/stm32-project")
      → Workspace scope 的 settings.json 路径 = "/home/user/stm32-project/.linkdesk/settings.json"
```

**⚠️ 时序（比照 Phase 5f 的"懒加载时序歧义"）：**
`setWorkspaceRoot` 必须在任何 `useConfiguration()` 之前调用。如果 App.tsx 的某个 useEffect 在 WorkspaceService 初始化前触发了 `useConfiguration()` → Workspace scope 缺上下文。解法：`setWorkspaceRoot` 在 App.tsx 最早的同步代码中调用（React render 之前）。

### 2.4 和 Phase 7 文件树的关系

```
Phase 7 文件树消费：
  WorkspaceService.rootPath
    → FileService.listDir(rootPath)
      → 文件树渲染
        → FileService.watch(rootPath)
          → CoreEvents.onDidChangeFileSystem → 外部变动自动刷新
```

FileService 和 WorkspaceService 在 Phase 6 建好，Phase 7 文件树直接消费——不用自己处理路径/权限/I/O。

---

## 三、DialogService（~60 行，验收 D8）

### 3.1 现状

3 处 `window.confirm()`：
1. 关终端标签页确认（有串口连接时）
2. 插件卸载确认
3. 设置重置确认

### 3.2 接口

```typescript
// src/core/DialogService.ts

interface DialogOptions {
  title: string;
  message: string;
  confirmLabel?: string;   // 默认 "确定"
  cancelLabel?: string;    // 默认 "取消"
  type?: "info" | "warning" | "error";  // 默认 "warning"
}

class DialogService {
  async confirm(options: DialogOptions): Promise<boolean>;
  async alert(options: DialogOptions): Promise<void>;
}
```

### 3.3 React 组件

`<Dialog>` 组件走 CSS 变量（`var(--bg-card)` / `var(--text-primary)` / `var(--border)`），暗色/亮色主题自动适配。对标 VS Code 的 `vscode.window.showWarningMessage` 模态框。

**实现：** Portal 到 `document.body` → 遮罩层 + 居中卡片 + Enter 确认 / Escape 取消。

---

## 四、Chord 快捷键（~40 行，验收 D4）

### 4.1 对标 VS Code

VS Code 支持双键序列（chord）：`Ctrl+K Ctrl+S` → 打开键盘快捷键设置。第一个键进入 chord 模式，第二个键触发命令。

### 4.2 实现

```typescript
// KeybindingRegistry 加状态机：

interface ChordState {
  isPending: boolean;
  firstKey: Keybinding | null;
  timer: number | null;     // 500ms 超时
}

// 键盘事件处理：
if (chordState.isPending) {
  clearTimeout(chordState.timer);
  const fullChord = `${chordState.firstKey} ${pressedKey}`;
  const cmd = this.findCommand(fullChord);
  if (cmd) {
    execute(cmd);
  }
  // 无论是否匹配，退出 chord 模式
  this.resetChord();
  return;
}

// 单键匹配 → 先检查是不是 chord 的第一键
if (isFirstKeyOfChord(pressedKey)) {
  chordState.isPending = true;
  chordState.firstKey = pressedKey;
  chordState.timer = setTimeout(() => this.resetChord(), 500);
  return;
}

// 普通单键 → 直接执行
```

### 4.3 验证

```
Ctrl+K Ctrl+S → 触发命令 ✓
Ctrl+K 等 2s → 什么都不发生 ✓
Ctrl+K Ctrl+Z（未绑定）→ 什么都不发生 ✓
Ctrl+W（单键）→ 不受影响 ✓
```

---

## 五、keybindings.json（~50 行，验收 D6）

### 5.1 对标 VS Code

VS Code `keybindings.json` 允许用户自定义快捷键。格式：
```json
[
  { "key": "ctrl+w", "command": "workbench.action.closeActiveTab", "when": "editorFocus" },
  { "key": "ctrl+k ctrl+s", "command": "workbench.action.openKeybindingsSettings" }
]
```

### 5.2 实现

```
启动时：
  FileService.exists(".linkdesk/keybindings.json")
    → 有 → 读 JSON → 合并到 KeybindingRegistry（用户绑定覆盖出厂）
    → 无 → 用出厂默认

运行时：
  keybindings.json 被 FileService.watch 监控
    → 文件变动 → 重新读 → 更新绑定 → emit onDidChangeKeybindings

Command Palette 加命令：
  "workbench.action.openKeybindingsSettings"
    → Ctrl+K Ctrl+S
      → Monaco 打开 .linkdesk/keybindings.json（只读 → 用户手动另存）
      或者 Settings Editor 加一个 Keybindings 页面（更 VS Code 化）
```

---

## 六、命令面板模糊搜索（~40 行，验收 D5）

### 6.1 现状

`CommandPalette.tsx` 用 `String.includes` 做 substring 匹配。输入 "tgl" 匹配不到 "Toggle Terminal"。

### 6.2 对标 VS Code

VS Code 的 `fuzzyScore` 函数（`src/vs/base/common/filters.ts`）打分规则：
- 首字母连续匹配 → 高分
- 中间连续匹配 → 中分
- 跳跃匹配 → 低分
- 不匹配 → 0

### 6.3 实现（不引入 fuse.js——自研 ~30 行）

```typescript
function fuzzyScore(query: string, target: string): number {
  query = query.toLowerCase();
  target = target.toLowerCase();

  let score = 0;
  let qi = 0;
  let consecutive = 0;

  for (let ti = 0; ti < target.length && qi < query.length; ti++) {
    if (target[ti] === query[qi]) {
      qi++;
      consecutive++;
      // 首字母匹配加分
      if (ti === 0 || target[ti - 1] === " " || target[ti - 1] === ".") {
        score += 10;
      }
      // 连续匹配加分
      if (consecutive > 1) {
        score += 5;
      } else {
        score += 1;
      }
    } else {
      consecutive = 0;
    }
  }

  // 全部字符匹配 → 返回分数，否则 0
  return qi === query.length ? score : 0;
}
```

### 6.4 验证

```
命令面板输入 "tgl"
  → "Toggle 消息回显" 排第一（首字母匹配 + 连续匹配）
  → "Toggle 行号" 排第二
  → "Toggle ..." 其他排后面

命令面板输入 "关闭"
  → "关闭消息回显" / "关闭终端" 排前面
```

---

## 七、CoreEvents 补漏（~20 行）

```typescript
// src/core/CoreEvents.ts

// Phase 6 新增两个事件发射器：
onDidChangeFileSystem: Event<FileChangeEvent[]>;
onDidChangeWorkspaceFolders: Event<WorkspaceFolder[]>;

// Phase 5 已有的：
onDidExecuteCommand / onDidChangeConfiguration / onDidChangeContextKey / ...
```

**用途：**
- `onDidChangeFileSystem` → FileService.watch 检测到外部文件变动 → emit → 文件树自动刷新
- `onDidChangeWorkspaceFolders` → WorkspaceService 文件夹变化 → emit → 欢迎页/标题栏/文件树联动

---

## 八、验证标准

```
FileService:
  listDir("/tmp") → 返回文件列表
  writeFile + readFile → 内容一致
  watch → 外部修改文件 → emit FileChangeEvent

WorkspaceService:
  openFolder() → Tauri dialog → rootPath 更新
  onDidChangeFolders → 订阅者收到通知

DialogService:
  3 处 window.confirm() 全部替换为 DialogService
  暗色/亮色主题下样式正确

Chord:
  Ctrl+K Ctrl+S 触发 → Ctrl+K 等 2s 无反应
  单键快捷键不受影响

keybindings.json:
  修改后即时生效 → 删除后回退到出厂

模糊搜索:
  输入 "tgl" → 匹配到 "Toggle..." 并排在前面

CoreEvents:
  tsc 零错误——新增事件类型定义正确
```

---

## 九、相关文档

- [LinkDesk-Phase6-设计.md](./LinkDesk-Phase6-设计.md) — 主设计文档
- [LinkDesk-Phase6-终端归一化.md](./LinkDesk-Phase6-终端归一化.md) — 6b SerialContext 迁出 + 术语迁移
- [LinkDesk-Phase7-文件树与编辑.md](../phase7_多WebView与编辑能力_暂定/LinkDesk-Phase7-文件树与编辑.md) — Phase 7 文件树消费 FileService/WorkspaceService
- [Phase 5 设计](../phase5_应用基础设施/V3-Phase5-设计.md) — ConfigurationService（已有 `setWorkspaceRoot` 接口签名）
