# openInTerminal 配置化

> 2026-08-02。**E5 第 3 层第 11 轮。** 右键"在终端中打开"不再硬编码 PowerShell。
> 执行清单任务：E5#22

---

## 一、前因

### 1.1 当前硬编码

**`electron/main.ts` L121-129：**

```typescript
ipcMain.handle('shell:openInTerminal', async (_e, dirPath: string) => {
  const cmd = process.platform === 'win32'
    ? `start powershell -NoExit -Command "cd '${dirPath}'"`
    : `open -a Terminal "${dirPath}"`;
  exec(cmd, (err) => {
    if (err) console.error('[shell:openInTerminal] 启动终端失败:', err);
  });
});
```

- Windows → 硬编码 PowerShell
- macOS → 硬编码 Terminal.app
- Linux → 无处理（走 else 分支——实际调 macOS 命令）

### 1.2 目标

用户可在设置中选择终端：PowerShell / cmd / Windows Terminal / Git Bash。配置读写走 `ConfigurationService`，main 进程通过 IPC 读取。

---

## 二、设计方案

### 2.1 配置项声明——预设 + 自定义

```json
// plugins/builtin/file-tree/plugin.json contributes.configuration
{
  "terminal.external.windowsExec": {
    "type": "string",
    "enum": ["powershell", "cmd", "wt", "git-bash", "custom"],
    "default": "powershell",
    "enumDescriptions": {
      "powershell": "PowerShell（Windows 默认）",
      "cmd": "命令提示符",
      "wt": "Windows Terminal",
      "git-bash": "Git Bash",
      "custom": "自定义命令…"
    },
    "description": "右键'在终端中打开'时使用的外部终端。选'自定义'后在下方的命令模板中填写启动命令。"
  },
  "terminal.external.customCommand": {
    "type": "string",
    "default": "",
    "description": "自定义终端启动命令。用 {{dirPath}} 表示目标目录。例: wt -d \"{{dirPath}}\""
  }
}
```

**5 个预设 + `custom` 走模板。** 不是 4 个硬编码选项——不封死。用户填 `wsl`、`alacritty`、`wezterm` 都行。

### 2.2 main.ts handler 改造

```typescript
// electron/main.ts L121-129（改造后）

ipcMain.handle('shell:openInTerminal', async (_e, dirPath: string) => {
  if (process.platform === 'win32') {
    // 读配置——通过 IPC 从渲染进程获取
    const terminalExe = await getConfigurationValue('terminal.external.windowsExec') || 'powershell';
    
    let cmd: string;
    switch (terminalExe) {
      case 'cmd':
        cmd = `start cmd /K "cd /d "${dirPath}""`;
        break;
      case 'wt':
        cmd = `wt -d "${dirPath}"`;
        break;
      case 'git-bash':
        cmd = `start "" "${gitBashPath}" --cd="${dirPath}"`;
        break;
      case 'custom':
        // 🔥 不硬编码——读用户填的模板，替换 {{dirPath}} 占位符
        const customCmd = await getConfigurationValue('terminal.external.customCommand') || '';
        cmd = customCmd.replace(/\{\{dirPath\}\}/g, dirPath);
        if (!cmd) { console.error('[shell:openInTerminal] 自定义命令为空'); return; }
        break;
      case 'powershell':
      default:
        cmd = `start powershell -NoExit -Command "cd '${dirPath}'"`;
        break;
    }
    exec(cmd, (err) => {
      if (err) console.error('[shell:openInTerminal] 启动终端失败:', err);
    });
  } else if (process.platform === 'darwin') {
    exec(`open -a Terminal "${dirPath}"`, (err) => {
      if (err) console.error('[shell:openInTerminal] 启动终端失败:', err);
    });
  } else {
    // Linux
    exec(`xdg-open "${dirPath}"`, (err) => {
      if (err) console.error('[shell:openInTerminal] 启动终端失败:', err);
    });
  }
});
```

### 2.3 配置读取——main 进程如何获取 ConfigurationService 的值

**问题：** `ConfigurationService` 在渲染进程——main 进程无法直接 import。

**方案：** main 进程通过 IPC 从渲染进程获取配置值（已有基础设施——`ipcMain.handle`）。

```typescript
// 在 handler 中加 IPC 调用获取配置
// electron/main.ts
ipcMain.handle('shell:openInTerminal', async (_e, dirPath: string, terminalExe?: string) => {
  // terminalExe 由渲染进程的调用方传入——调用方已从 ConfigurationService 读取
  const exe = terminalExe || 'powershell';
  // ...
});

// 渲染进程调用方：
// FileTreeContextMenu.tsx
const terminalExe = ConfigurationService.get<string>('terminal.external.windowsExec');
await linkdesk().shell.openInTerminal({ dirPath, terminalExe });
```

**更简单的方案——渲染进程传参：** 调用方从 `ConfigurationService` 读配置 → 传给 IPC handler。main 进程不需要自己读配置——它只是命令执行器。

---

## 三、实现步骤

### E5#22a 配置项声明（~10 行）

**文件：** `plugins/builtin/file-tree/plugin.json` `contributes.configuration.properties`

```json
"terminal.external.windowsExec": {
  "type": "string",
  "enum": ["powershell", "cmd", "wt", "git-bash"],
  "default": "powershell",
  "enumDescriptions": {
    "powershell": "PowerShell（Windows 默认）",
    "cmd": "命令提示符",
    "wt": "Windows Terminal",
    "git-bash": "Git Bash"
  },
  "description": "右键'在终端中打开'时使用的外部终端"
}
```

### E5#22b main.ts handler 改造（~15 行）

**文件：** `electron/main.ts` L121-129

**内容：**
1. handler 接收 `terminalExe` 参数
2. `switch (terminalExe)` → 生成对应命令
3. 保留默认 `powershell` 兜底

### E5#22c 调用方传参（~3 行）

**文件：** `plugins/builtin/file-tree/src/FileTreeContextMenu.tsx`（openInTerminal handler，E4V#19 位置）

```typescript
const terminalExe = ConfigurationService.get<string>('terminal.external.windowsExec');
await linkdesk().shell.openInTerminal({ dirPath, terminalExe });
```

---

## 🔴 预测 Bug

### Bug E5-22a 🔴 Git Bash 路径硬编码——用户可能装在 D 盘

**触发条件：** `C:\Program Files\Git\git-bash.exe` 不存在 → exec 失败。

**🔥 防线——多路径 fallback：**
```typescript
case 'git-bash': {
  const paths = [
    'C:\\Program Files\\Git\\git-bash.exe',
    'C:\\Program Files (x86)\\Git\\git-bash.exe',
    `${process.env.LOCALAPPDATA}\\Programs\\Git\\git-bash.exe`,
  ];
  const gitBash = paths.find(p => fs.existsSync(p));
  if (gitBash) {
    cmd = `start "" "${gitBash}" --cd="${dirPath}"`;
  } else {
    console.error('[shell:openInTerminal] Git Bash 未找到');
    return;
  }
}
```

---

### Bug E5-22b 🔴 Linux 无处理

**触发条件：** Linux 用户右键"在终端中打开"→ 走到 macOS 分支 → macOS 命令在 Linux 无效。

**🔥 防线：** 加 `else` 分支——Linux 走 `xdg-open`（或默认终端 `x-terminal-emulator`）。

---

## 四、完工标准

- [ ] 设置里 `terminal.external.windowsExec` 可选 powershell/cmd/wt/git-bash
- [ ] 选 cmd → 右键目录→在终端中打开→弹出 cmd
- [ ] 选 wt → 弹出 Windows Terminal
- [ ] 默认 powershell——和改前行为一致
- [ ] `npm run check` 零错误

---

> **← E5 索引：** `../00-README.md`
> **← 执行清单：** `../05-执行清单.md` E5#22
