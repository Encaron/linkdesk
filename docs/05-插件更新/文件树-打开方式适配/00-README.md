# 05-插件更新 · 文件树-打开方式适配（蓝图）

> 状态：📋 **蓝图起头**（2026-10-04，与壳案[文件打开方式与贡献点](../../04-软件更新/待抉择池/文件打开方式与贡献点/00-README.md)配套；实施归 file-tree 仓 `E:\linkdesk-plugins\official\file-tree`，收口后档案归还本仓 `docs/`）。
> 一句话：文件树是「打开方式」机制的**第一个消费者**——好消息是**基础链路零改动**（单击查关联表早已在跑），本夹只列它要做的四格适配；目标：未来视频播放器等任何新插件进来，**只改新插件自己，文件树一行不动**。

## 〇、为什么文件树几乎不用动（先说结论）

取证（2026-10-04 三路源码）：`FoldersView.doOpenFile`（`src/views/FoldersView.tsx:122-131`）单击时已经先查 `lk.fileAssociation.getPluginFor(ext)`、按结果开对应插件的标签，查不到传空串由壳兜底。⇒ **PDF/图片阅读器装上即接管、卸载即退回，文件树一个字节都不用改**。它要做的只有下面四格「配角活」。

## 一、适配格（F1–F4）

| # | 格 | 内容 | 对应壳案任务 |
|:--:|:--|:--|:--|
| F1 | **实现 `openWith` 占位** | `file-tree.openWith` 是自家 placeholder 命令（`FileTreeContextMenu/commands/navigation.ts:63`）——实现为**选择器 UI**：列该扩展名全部 handler＋默认标记＋「仅此一次／始终」；「始终」写用户覆盖表。**UI 住文件树（呈现归插件），数据来自宿主新只读面 `listHandlersFor`（判定归壳）**——换一套文件树插件，选择器跟着走 | T2 |
| F2 | **注入公共 context key** | 在现有私有旗子注入点（`Menu.tsx:25-50`）增注公共键 `resourceExtname`（带点小写）——第三方菜单 `when` 才能按扩展名显隐。键名进宿主保留账（写权限=file-tree，与 `settingsSlotFilled` 同构） | T3 |
| F3 | **打开行为归一** | 现状分叉：FoldersView 查不到**落编辑器兜底**、SearchView 查不到**静默不打开**（`SearchView/openMatch.ts:11-21`）——统一改走壳侧同一解析纯函数 `resolveOpenTarget`：有 handler 开之、无 handler 开兜底页。两处行为一致才算修完 | T2.2 |
| F4 | **菜单声明对齐规范** | 本仓 `contributes.menus.fileContext` 的 18 项按壳案 T5 定稿的 group/when 规范自查；若命名拍板有变（D2 附带项）本仓 plugin.json 同笔改 | T5 |

## 二、不变项（写了就是给别人看的护栏）

- 18 项右键菜单**原样**——第三方是**合并进槽位**（`MenuRegistry` 合并＋when 过滤），不存在替换；本仓菜单项一个不挪。
- 单击/双击语义（预览/锁定，`useClickPreview`）不动。
- `getOpenFileFn` 桥接（`FoldersView.tsx:140-143`）不动——换的只是它背后壳侧解析器的内涵。

## 三、判据（与壳案验收联动）

1. 装/卸 PDF 阅读器，文件树**零改动零重发**而行为正确切换（这就是「只改自己」的机械证明）。
2. F1 选择器：多只插件声明同一扩展名时列出全部、默认标记随覆盖表走。
3. F3：搜索结果双击与文件树单击同一文件行为一致。
4. 仓内三门＋`npm run check` 全绿；本仓发版照插件轴自主链。

## 四、依赖

F1/F3 吃壳案 T2 的宿主面与解析函数；F2 对应壳案 T3（键名与写权限口径随 D2 拍板）。**F1–F4 都不阻塞四只阅读器插件的 MVP**——阅读器先走，适配随后攒批。
