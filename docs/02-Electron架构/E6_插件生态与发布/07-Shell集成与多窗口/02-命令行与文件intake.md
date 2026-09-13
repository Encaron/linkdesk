# 02 — 命令行与文件 intake（E6#46a-c）

> 目标：从任何入口（双击文件关联、右键菜单、命令行参数）把**文件**送进已有窗口的编辑器打开、把**文件夹**送成新窗口的 workspace——对标 VS Code 的 `code file.txt` / `code C:\project`。

## 一、intake 源（三条，全部汇到同一个路由器）

| 源 | 平台/时机 | 触发点 | 落点 |
|----|----------|--------|------|
| 启动 argv | 全平台，首次启动 | `app.whenReady` 前的 `process.argv`（打包版：`argv[0]`=exe，后面是用户参数；dev 版要先过滤 vite/electron 开关） | `parseLaunchPaths()`（01 文档 Step 1 已建） |
| `second-instance` | 全平台，已有实例在跑 | 第二实例的 argv 随事件携带 | 同上解析 → 路由 |
| `open-file` | **仅 macOS**，可能在 `whenReady` 完成前触发 | 拖到 Dock 图标 / Finder 双击关联文件 | 🔴 必须缓存：`whenReady` 前收到就 push 进 `pendingOpenFiles`，ready 后统一消费（清单 #46a 原文点名的坑） |

Windows 的文件关联/右键菜单最终都表现为「带参数启动 exe」→ 走 argv / second-instance 两源，`open-file` 是 macOS 专属补全。三条源共用一个 `routeLaunchItems(items)` 路由器（01 文档 Step 1/Step 6），**不允许三处各写一份路由逻辑**（归一化）。

## 二、路由规则（拍板行为）

```
routeLaunchItems(parseLaunchPaths 结果):
  folders → 每个文件夹 createWorkspaceWindow(folder)   ← #47（01 文档 Step 3/6）
  files   → 焦点窗 webContents.send(IPC.workspace.openPath, { paths })
            （无窗？不可能——单实例锁保证 first 实例至少有一窗；
             边界：窗正关到一半 → 退化为 createWorkspaceWindow() 空窗再 send）
```

- 同一 argv 里既有文件又有文件夹（`linkdesk file.txt D:\proj`）：VS Code 行为 = 全部开进**一个**窗口。**取 VS Code 行为**：files 并入 folders 指向的窗（ folders 非空 → 建一窗，files 也 send 给它；folders 空 → 焦点窗）。此行为写进 #46a 验收判据。
- 路径不存在：启动时解析已过滤（01 文档 Step 1），router 不再二次校验。

## 三、壳侧消费（#46b）

### 3.1 主进程侧 handler（已有，不新建）

`fileAssociation.getPluginFor(ext)` 已是主进程直答（`registry-handlers.ts:54`，E5.7#50 拉直），数据源 = 插件 `contributes.fileAssociations` 声明（[06-plugin.json规范.md](../../../03-插件制造/06-plugin.json规范.md) L113）→ FileAssociationService。**无匹配 → 返回空，壳 fallback editor**——"editor" 是 `viewRole` 声明的角色消费，**禁止写死某个插件 id**（硬约束 10）。

### 3.2 壳侧 intake listener（新增，壳级功能不进插件）

- **位置**：壳 App 层（对标 B79 教训——「卸载所有插件后命令行打开还得能用」⇒ listener 放壳，不走任何插件）；通过既有 `useIpcEvent` 模式订阅 `IPC.workspace.openPath`（generation counter 防线内置，硬约束 5）。
- **处理流程**（每条 path）：
  1. 主进程发来的**已是分类结果**（folder 不走这条通道）——但壳仍做一次 `statSync` 防御（主进程分类与 send 之间文件可能被删；失败 → pushToast「文件不存在」，静默丢弃）；
  2. 取扩展名 → `linkdesk.fileAssociation.getPluginFor(ext)`（`preload-shell.ts:289` 已暴露）；
  3. 有匹配插件 → 走「双击文件打开」的同一命令链：`explorer.openFile`（`plugins/file-tree` 注册，file-tree:50）为现状链路；**实施时以该命令的现有实现为准调用/复用，不复制它的逻辑**；
  4. 无匹配 → fallback：当前激活编辑器标签打开（纯文本兜底，与文件树双击未关联类型的行为一致——实施时核对该兜底现状并保持同形）；
  5. 同一文件已在某标签打开 → 聚焦既有标签（对标编辑器习惯，判据写进 #46b 验收）。
- **文件夹 → addFolder**：folders 在主进程路由层就分走了（开新窗），壳侧 `openPath` 通道只收文件。清单 #46b 原文「文件夹 → addFolder」描述的是**单窗时代**的行为，多窗后文件夹一律新窗（01 文档决策）——此为对 #46b 原文的第二处订正。

## 四、验收（#46a-c；#46c 实机半在批 C）

| 判据 | 验法 |
|------|------|
| dev 命令行文件 | `npm run electron:dev -- E:\某测试.txt`（**不许用 `E:\_testfiles`**——用户资产禁碰；自建临时目录）→ 编辑器打开 |
| dev 命令行文件夹 | 带文件夹路径 → 新窗 + 文件树该根 |
| 二实例文件 | 已开窗后再次带文件参数启动 → 焦点窗编辑器打开，不新开进程 |
| 二实例文件夹 | 已开窗后带另一文件夹 → 再开一窗 |
| 无匹配扩展名 | 改名的陌生扩展 → fallback 打开不报错 |
| 已开标签去重 | 同文件两次 → 第二次聚焦不重开 |
| macOS open-file（**代码级验收**） | `whenReady` 前事件入缓存数组、ready 后消费——单测覆盖（无 mac 实机，判据 = 缓存逻辑单测 + 注释标明实机未验） |
| 实机安装版 | `linkdesk.exe file.txt` / 右键 / 双击关联文件 → 同上（批 C，#46c） |
