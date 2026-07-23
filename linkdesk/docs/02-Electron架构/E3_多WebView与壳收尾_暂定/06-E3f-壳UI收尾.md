# E3f — 壳 UI 收尾

> 2026-07-24。从旧 P7d 拆分——壳的最后体验打磨：标题栏、菜单、输出面板、欢迎页、Workspace、会话持久化。
> **性质：** 纯 TS/React + Electron 窗口 API。不涉及多进程通信。
> **依赖：** E3a（多 WebView 就绪——输出面板和欢迎页跨进程可用）

---

## 一、标题栏暗色化

Electron `BrowserWindow` 的 `titleBarStyle` / `backgroundColor` → 暗色标题栏匹配 LinkDesk 暗色主题。

纯 Electron 配置，~20 行。

---

## 二、☰ 汉堡菜单（基础四组）

对标 VS Code 浏览器版的 ☰ 图标。走 MenuService——不是硬编码。

```
  File
    ├ Open Folder…              Ctrl+K Ctrl+O
    ├ Open Recent ▼
    ├ Import Workspace…
    ├ Export Workspace…
    ├ Exit                      Alt+F4

  Edit
    ├ Undo / Redo              Ctrl+Z / Ctrl+Y
    ├ Cut / Copy / Paste / Select All

  View
    ├ Command Palette…          Ctrl+Shift+P
    ├ Toggle Sidebar            Ctrl+B
    ├ Settings…                 Ctrl+,
    ├ Theme ▼ / Language ▼

  Help
    ├ About / Open Log Folder
```

插件贡献顶级菜单组 → ☰ 自动多一项。~90 行。

---

## 三、齿轮菜单完整版

```
插件 → 齿轮菜单：
  ├── 启用 / 禁用         → 已有
  ├── 卸载               → 已有
  ├── 配置 [插件名]...    → 跳到 Settings Editor 对应分组
  ├── 查看日志            → 打开 Output 面板对应频道
  └── 重新安装            → 已有
```

齿轮菜单内容 = `MenuService.getMenuItems(MenuId.ExtensionGear, context)`——不是硬编码列表。~40 行。

---

## 四、输出面板 UI

Phase 5 建了 `LogChannel` 数据通道，但查看器 UI 没做。

```
输出面板：
  ├── 频道选择器（"终端" / "协议-SBQ" / "CAD" / "通用"）
  ├── 日志列表（等宽字体、按 source 着色、自动滚动）
  └── 清空 / 导出按钮
```

对标 VS Code Output 面板。~80 行。

---

## 五、欢迎页集成

```
状态 A：未打开文件夹 → "打开文件夹" 按钮 + recentFolders 列表
状态 B：已打开文件夹 → 文件树显示内容 + 标题栏显示文件夹名
状态 C：关闭文件夹 → 回到 A
```

Phase 4 欢迎页已有 `recentViews`。加 `recentFolders`。~40 行。

---

## 六、Workspace 导入导出

导入：Electron dialog 选 `.linkdesk-workspace` → 解压到 workspace 目录 → WorkspaceService.addFolder。
导出：WorkspaceService.activeFolder → 打包 `workspace.json` + settings + 卡片数据 → 另存为。~50 行。

---

## 七、终端会话持久化

Phase 5.5c 的会话数据存在内存（`useTerminalSessions` 模块级单例）。加磁盘持久化：

```
软件关闭 → 最后一次 sessions 快照写入 .linkdesk/sessions.json
软件启动 → loadSessionsFromDisk() → 恢复到内存
```

消费 E2c FileService。~30 行。

---

## 八、任务清单

| # | 任务 | 行数 | 独立验证 |
|:--:|------|:--:|------|
| — | 标题栏暗色化——Electron titleBarStyle/backgroundColor | ~20 | 标题栏颜色 = 主题色 |
| — | ☰ 基础四组——File/Edit/View/Help 走 MenuService | ~90 | 点击 ☰ → 四组菜单 → 每个项可用 |
| — | 齿轮菜单完整版——context key 驱动 5 项 | ~40 | 齿轮 → 配置/查看日志 跳到对应位置 |
| — | 输出面板 UI——频道选择器 + 日志列表 + 清空/导出 | ~80 | 切频道 → 日志内容切换 |
| — | 欢迎页集成——三种状态切换 + recentFolders | ~40 | 打开文件夹 → 状态 B → 关闭 → 状态 A |
| — | Workspace 导入导出 | ~50 | 导出 → 导入 → 布局/设置复原 |
| — | 终端会话持久化——sessions.json 读写 | ~30 | 关闭 → 重启 → 会话列表恢复 |
| **合计** | | **~350 行** | |

---

## 九、验证标准

```
标题栏 → 暗色背景匹配主题
☰ 菜单 → File/Edit/View/Help 四项可用 → 快捷键显示正确
齿轮菜单 → 5 项由 context key 驱动 → 禁用态正常
输出面板 → 按频道切换 → 日志着色 → 清空/导出正常
欢迎页 → 三种状态切换 → recentFolders 列表可点击
Workspace → 导出 → 导入 → 布局复原
会话持久化 → F5 刷新 → 会话名恢复
```

---

> **← 上一份：** `05-E3e-通知系统.md`
> **→ 下一份：** `07-E3g-API与V2兼容.md`
> **E3 索引：** `00-README.md`
