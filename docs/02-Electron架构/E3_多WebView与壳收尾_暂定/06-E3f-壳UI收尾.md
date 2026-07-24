# E3f — 壳 UI 收尾

> 2026-07-24。从旧 P7d 拆分——壳的最后体验打磨：标题栏、菜单、输出面板、欢迎页、Workspace、会话持久化。
> **性质：** 纯 TS/React + Electron 窗口 API。不涉及多进程通信。
> **依赖：** E3a（多 WebView 就绪——输出面板和欢迎页跨进程可用）

---

## 一、标题栏暗色化

Electron `BrowserWindow` 的 `titleBarStyle` / `backgroundColor` → 暗色标题栏匹配 LinkDesk 暗色主题。

纯 Electron 配置，~20 行。

---

## 二、菜单栏——hamburger + menubar 双模式，同一数据源

### 2.1 为什么是双模式

**对标 VS Code 的做法。** VS Code 有两套菜单渲染：

| 平台 | 菜单位置 | 实现 |
|------|------|------|
| 桌面版（Windows/macOS/Linux） | 窗口顶部原生菜单栏——File / Edit / Selection / View / Go / Run / Terminal / Help | Electron `Menu.setApplicationMenu()` |
| 浏览器版（vscode.dev） | 标题栏左侧 ☰ 图标 → 点击弹出下拉菜单 | 纯 HTML/CSS 下拉层 |

**两套渲染共享同一份菜单数据。** VS Code 的 `MenuRegistry` 存储菜单项树（label + command + when 条件 + keybinding 提示），桌面版喂给 Electron `Menu.buildFromTemplate()`，浏览器版喂给 React `<MenuBar>` 组件。菜单项的新增/删除/显隐——改数据层，两个渲染目标自动同步。

**LinkDesk 同理。** 虽然长时间内会在桌面端（Electron），但架构不应绑死桌面。`MenuRegistry` 数据模型已在 Phase 5 建好——多级嵌套、when 条件、command 绑定、accelerator 提示——缺的只是第二个渲染目标。

### 2.2 双模式设计

```
设置项: "menuStyle": "hamburger" | "menubar"    默认 "hamburger"

              MenuRegistry (数据源——已有，不新增)
               ├── 壳级菜单：File / Edit / View / Help
               ├── 插件贡献：contributes.menus (menuBar 位置)
               └── onDidChange → 渲染目标自动同步
                      │
          ┌───────────┴───────────┐
          │                       │
    hamburger 渲染器          menubar 渲染器
    (全平台可用，默认)         (Electron 桌面端)
          │                       │
    <HamburgerMenu />        Menu.buildFromTemplate()
    position:fixed 下拉       → Menu.setApplicationMenu()
    ~90 行 React             ~20 行适配函数
```

- **hamburger**（默认）：全平台一致。Electron 桌面能用，未来浏览器版也能用。不依赖 OS 原生菜单 API——菜单颜色跟随主题，不和标题栏打架。对标 VS Code 浏览器版。
- **menubar**：桌面用户可选。Electron `Menu.buildFromTemplate()` 吃的是类似的树形结构——写一个适配函数把 `MenuRegistry` 的 menu tree 转成 Electron `MenuItem` constructor 格式。macOS 上菜单在屏幕顶部，Windows/Linux 上嵌在窗口标题栏下方。`menuService.onDidChange → Menu.setApplicationMenu()` 订阅即可。

**为什么默认 hamburger 而不是 menubar：**
1. 一套代码全平台跑——不需要为不同 OS 写不同的菜单逻辑
2. 菜单颜色跟随 LinkDesk 主题——原生菜单栏在 Windows 上不受 CSS 控制，深色主题下白菜单栏割裂
3. 插件贡献的菜单项在 ☰ 里自动出现——和原生菜单栏完全相同的可见性
4. 用户想要原生体验时切到 menubar——只是一个设置项，不是架构改动

### 2.3 菜单内容（两种模式共享）

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

插件贡献顶级菜单组（`contributes.menus` 中 `location: "menuBar"` 的项）→ 两种模式自动多一项。~90 行（hamburger 渲染器）+ ~20 行（menubar 适配函数）+ ~10 行（menuStyle 配置项注册）= ~120 行。

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

---

## 七、终端会话持久化

Phase 5.5c 的会话数据存在内存（`useTerminalSessions` 模块级单例）。加磁盘持久化：

```
软件关闭 → 最后一次 sessions 快照写入 .linkdesk/sessions.json
软件启动 → loadSessionsFromDisk() → 恢复到内存
```

消费 E2c FileService。~30 行。

---

## 八、Developer 工具

### DevTools 管理命令

E3 多 WebView 后每个插件有独立 DevTools——手动逐个右键→Inspect 不可行。提供一个壳命令：

```
Ctrl+Shift+P → "Developer: Toggle Plugin DevTools"
  → QuickPick 列出所有运行中的插件 WebView
  → 选一个 → 打开/关闭它的 DevTools（detach 模式，独立窗口）
```

底层调 `WindowManager.toggleDevTools(pluginId)`（E3a #24 新增）。只在非打包模式可用。

---

## 九、设置页增强——快捷键子栏

### 对标 VS Code

VS Code 的 Keyboard Shortcuts 页面：左侧 "User Settings" / "Keyboard Shortcuts" 两个 tab，右侧显示快捷键表格——命令名、绑定、来源、when 条件。双击改绑定，冲突红字提示。

### 实现

设置页改双 tab 结构：

```
Settings Editor
├── [设置] [快捷键]        ← 两个 tab
├── 设置 tab → 现有 GUI（下拉框/复选框/输入框）
└── 快捷键 tab → 表格视图
      ├── 搜索（实时过滤）
      ├── 列：命令名 / 快捷键 / 来源 / when 条件
      ├── 双击行 → 弹窗 "按下新快捷键" → 冲突自动高亮
      └── 右键 → 重置绑定 / 复制命令 ID
```

数据源：`KeybindingRegistry.getKeybindings()`——所有已注册快捷键（builtin + plugin + user）。用户覆盖写入 `keybindings.json`（消费 E2c #17），优先级 user > plugin > builtin 自动生效。

**这不需要新基础设施。** `KeybindingRegistry` 已就绪，`keybindings.json` 读写已就绪（E2c #17）。只差 GUI。

~60 行。

---

## 十、任务清单

| # | 任务 | 行数 | 独立验证 |
|:--:|------|:--:|------|
| 51 | 标题栏暗色化——Electron titleBarStyle/backgroundColor | ~20 | 标题栏颜色 = 主题色 |
| 52 | 菜单栏双模式——hamburger（默认）+ menubar（Electron 原生），共享 MenuRegistry 数据源 | ~120 | 点击 ☰ → 四组菜单；切 menubar → 原生菜单栏内容一致 |
| 53 | 齿轮菜单完整版——context key 驱动 5 项 | ~40 | 齿轮 → 配置/查看日志 跳到对应位置 |
| 54 | 输出面板 UI——频道选择器 + 日志列表 + 清空/导出 | ~80 | 切频道 → 日志内容切换 |
| 55 | 欢迎页集成——三种状态切换 + recentFolders | ~40 | 打开文件夹 → 状态 B → 关闭 → 状态 A |
| 56 | Workspace 导入导出 | ~50 | 导出 → 导入 → 布局/设置复原 |
| 57 | 终端会话持久化——sessions.json 读写 | ~30 | 关闭 → 重启 → 会话列表恢复 |
| 58 | **Developer: Toggle Plugin DevTools**——QuickPick + WindowManager.toggleDevTools | ~10 | Ctrl+Shift+P → 选插件 → DevTools 弹出/关闭 |
| 59 | **设置页快捷键子栏**——双 tab + 表格视图 + 冲突检测 | ~60 | 打开设置→快捷键 tab→所有快捷键可搜索→双击改绑定→冲突红字 |
| **合计** | | **~450 行** | |

---

## 十一、验证标准

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
