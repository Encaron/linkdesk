# 05-插件更新 · 以 VS Code 打开插件（蓝图）

> 状态：📋 **蓝图起头**（2026-10-04 用户点名，未立项未拍板）。源码仓尚未建（立项时起 `E:\linkdesk-plugins\official\open-in-vscode`）。
> 一句话：对标 AI Agent 网页右上角那颗「Open in VS Code」——在标题栏/文件树/命令面板三处把**当前文件或工作区**用 VS Code 拉起；机制是 `vscode://file/<路径>` 系统协议，**不改壳的核心，只等壳案 T4 的一扇受控门**。

## 一、定位与用户故事

用户原话：「类似于很多现在的 AI agent 它在右上角顶部那里有一个以 VS Code 打开的那个按钮。我们可以把它做成插件。」——注意它是**桥接件**：LinkDesk 不做 VS Code 的功能，只做「把东西递出去」。

## 二、机制（为什么可行）

VS Code 安装时向 OS 注册了 `vscode://` 协议：`vscode://file/<绝对路径>`（文件、**目录**都认，路径需 URI 编码）即拉起并定位。LinkDesk 侧唯一缺口 = 插件面没有 `openExternal`（取证：`electron/windows/external-links.ts:29` 仅主进程内部用）⇒ 依赖壳案 [T4 受控通道](../../04-软件更新/已落地/文件打开方式与贡献点/01-方案与落点契约.md)（scheme 白名单，`vscode:` 属"OS 已注册协议"）。**T4 是本插件唯一的硬依赖。**

## 三、贡献什么

| 声明 | 作用 |
|:--|:--|
| `contributes.commands` | `openInVscode.openFile`（当前活动文件）／`openInVscode.openWorkspace`（当前工作区根目录）——进命令面板 |
| `contributes.titleBar` | **右上角那颗钮**（用户点名的主形态）——titleBar 左右槽位按钮是现成贡献面（`contributions.ts:201-215`），声明即出现 |
| `contributes.menus.fileContext` | 文件/文件夹右键「以 VS Code 打开」（`when` 按壳案 T3 公共键收敛，如仅文件/仅目录） |
| `contributes.configuration`（可选） | `openInVscode.executableHint`？**不做**——协议由 OS 解析，不猜 exe 路径（无硬编码原则） |

## 四、失败面（立项时逐条给判据）

1. **未装 VS Code** → OS 无 handler，`openExternal` 回执失败 → toast 引 `code.visualstudio.com`（串走 lang-defaults 链）。
2. **路径编码**：空格/中文/反斜杠 → `encodeURI` 规则单测钉死（Windows 绝对路径转 `file` URI 的口径，VS Code 文档为准）。
3. **未保存的编辑器内容**：本插件只递**磁盘上的文件**——内存未存改动不属于本件（如实写进说明，避免「我改了没生效」错觉）。

## 五、任务布置（立项时展开）

1. 本夹展开 → 拍板三处入口做几处（titleBar 必做）。
2. 等壳案 T4 落地（或同批攒批）→ 起仓 → 声明＋命令 → 三门 → publish → 收录（不进种子）。
3. 验收：右键 .md →「以 VS Code 打开」→ VS Code 定位该文件；右键文件夹 → 打开为工作区；未装 VS Code → toast。

## 六、依赖与边界

- 硬依赖：壳案 **T4**（openExternal 通道）。软依赖：T3（context key 收敛菜单显隐，无它则菜单恒显、点了对非文件项报错——故 T3 未落时 `when` 先写宽、判据降级）。
- 不做「打开方式注册」（那是 OS 安装器层，壳案 T6）；不做对其他编辑器/IDE 的N个变体按钮——**任何作者都能照本插件三分钟做出「以 Cursor 打开」**，机制通用，这正是万物皆插件的意思。
