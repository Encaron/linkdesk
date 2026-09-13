# 05-插件更新 · 串口监视器（`plugins/serial-monitor`）补丁档案

> 2026-09-13 建。**状态：待拍板候选（未开工、零代码改动）。**
> 本夹 = 该插件的补丁档案集；命名取插件显示名「串口监视器」。⚠️ 与 [`../Serial-Simulator/`](../Serial-Simulator/README.md)（串口模拟器，另一个插件）不是一回事；也与 [`../终端系统/`](../终端系统/00-README.md)（真 shell）不是一回事。
> 现状：本插件**无实施中的补丁**——当前唯一候选 = 下方右键菜单双注册。

---

## 一、候选补丁：右键菜单项「双注册」重复显示

**现象。** 串口监视器的接收区右键，菜单里「复制」「全选」「清空」**各出现两次**；`togglePause`（暂停/继续）只出现一次。

**🔥 2026-09-13 补充核实（用户只报了接收区，实际多一处）。** 同一毛病还有第二处：**快捷发送药丸右键**（`menuId="quickSendContext"`）里「编辑」「删除」也**各出现两次**，而「填充」只出现一次——同一条"两份都注册过的才重复"的规律。

## 二、根因（三处证据，全链核实）

| 环节 | 事实 | 证据 |
|:--|:--|:--|
| ① 声明式那份 | `contributes.menus.editorContext` 声明 4 条（copy / selectAll / clear / togglePause），**每条都带** `when: "activeEditor == 'serial-monitor'"`（togglePause 另加 `sourceOpen`）；`quickSendContext` 声明 3 条（Fill / Edit / Delete） | `plugins/serial-monitor/plugin.json`（menus 段） |
| ② 运行时那份 | 模块顶层又调了一次 `registerItems`：`editorContext` 3 条（copy / selectAll / clear，**不带 when**、带 `label: "复制"` 等）+ `quickSendContext` 2 条（Edit / Delete，带 label） | `plugins/serial-monitor/src/index.tsx:25-35` |
| ③ 判重为什么兜不住 | 幂等键 = **command + pluginId + when**（when 并入身份键，`E5.8#37.6` 拍板的正确设计——为「移动到左侧/右侧」同命令 ID、仅 when 区分而设）。①的 when 是字符串、②的 when 是 `null` ⇒ **判重键不同 ⇒ 两份都算不同菜单项、都进注册表** | `src/core/registry/commands/MenuRegistry.ts:118-135` |

**反证成立：** `togglePause`（只在①）与 `quickSendFill`（只在①）都不重复——重复项恰好是①②都注册过的那五条。用户推断的机制与代码完全一致。

**消费方（现象发生地）：** 接收区右键 `plugins/serial-monitor/src/views/SerialMonitorView/ReceiveArea.tsx:62`（`menuId="editorContext"`）；药丸右键 `plugins/serial-monitor/src/views/SerialMonitorView/QuickSendBar.tsx:73`（`menuId="quickSendContext"`）。

## 三、历史成因（插件自证）

`src/index.tsx:20-24` 头注写明：运行时那份是 **`E5.6#16.7k-fix`** 的补丁——当时壳侧 `getCommands()` 查不到池侧 `_poolCommands` 的命令，菜单项 `title` 解析成 `undefined` → 显示空白 → 于是插件侧注册时手动带 `label`。后来 `plugin.json` 的声明式贡献（带 when 门控）也补齐了，**两份并存至今无人收敛**（属"补丁打完没回收"的陈账）。

## 四、普查结论（2026-09-13 全仓 grep）

全仓 `menu.registerItems` 只有 **3 处**：

| 插件 | 注册的 menuId | 是否与自己的 plugin.json 重叠 |
|:--|:--|:--|
| **serial-monitor** | `editorContext` + `quickSendContext` | 🔴 **两处都重叠**（本候选补丁） |
| editor | `editorContext` | 否——单源（其 plugin.json 不声明 editorContext） |
| file-tree | `FileContext` + `MenuBar` | 否——单源（其 plugin.json 无 menus 段） |

⇒ **不是系统性缺陷，是 serial-monitor 一家的历史遗留**，无需"全仓迁移"大任务。

## 五、修法二选一 + 前置核查（待拍板）

| 方案 | 做法 | 评价 |
|:--|:--|:--|
| **A（推荐）** | 留 `plugin.json`、删 `src/index.tsx` 的运行时注册 | 符合声明式正统；**白得 `when` 门控**（其它编辑器上下文里不再误显示串口各项） |
| B | 留 `index.tsx`、删 `plugin.json` 段 | 改动最小，但丢 when 门控与声明式风格，不算收口 |

**方案 A 的前置核查（唯一跨侧疑点，动手前必须先跑）：** 删掉运行时注册后，壳侧能否从 `contributes.commands` 解析出这三条命令的 `title`？——当年带 label 正是为了绕这个。判据分两支：

- **核查通过**（壳侧已能解析）⇒ 纯插件侧删除，本补丁一条任务收口；
- **核查不通过** ⇒ **壳侧「插件声明命令的 title 在菜单里解析不出」是一个独立缺口**，另立 **04-软件更新** 项（软件本体），本补丁在该项之后收口（依赖关系记在这里，两件事不混成一件事）。

**顺带要一并收敛的漂移：** 两份注册的 `group` 还不一致——`editorContext`：plugin.json 用 `edit` / `serial-monitor`，index.tsx 用 `clipboard` / `selection` / `edit`；`quickSendContext`：plugin.json 用 `edit` / `delete`，index.tsx 用 `edit` / `danger`。收敛后 **group 以 plugin.json 为准**（声明式那份是设计过的分组）。

## 六、可选机械门禁（堵复发，待拍板）

「插件 runtime `registerItems` 的 `(menuId, command)` 若已在**同插件** plugin.json 的 `contributes.menus` 里声明过 → 红」——把同款双注册在 `npm run check` 上堵死（照 `check-contributes` 家族做法）。做不做待拍板；不做的话，本补丁属于"修一次就算"，下次谁再手写一份 runtime 注册没人拦。

## 七、发布路径（与 file-tree 同款账）

serial-monitor 是 `distribution: builtin` **随包插件**（`bundled-plugins/serial-monitor.linkdesk-plugin`，version 1.0.8 = 源码同版）⇒ 修完必须：① bump 插件自身 version（门禁 `check-bundled-version-bump` 对「同版 + 内容指纹变」红拦）② 重打 zip 并同步进 `bundled-plugins/`。**实机验收须在 fresh userData 或 `--force-rematerialize-bundled` 下跑**；已有安装的用户拿到修复的路径 = 全新安装 / 清空插件目录 / 未来 bundled 上架市场按版本更新（真欠账 `E6#26b`）。详见 [文件树 00-README 的「发布路径」段](../文件树/00-README.md)、memory `version-and-release` §3.1。

## 八、立项后验收（用户视角）

1. 接收区右键 → 「复制」「全选」「清空」**各一次**，`togglePause` 仍一次，顺序/分组正常，文案不空缺。
2. 快捷发送药丸右键 → 「填充」「编辑」「删除」**各一次**。
3. **在别的编辑器上下文里右键 → 不再出现串口那几项**（`when` 门控白得的收益）。
4. 亮/暗主题各过一遍；右键菜单定位、点击后动作生效（复制进剪贴板、清空真的清空）。
