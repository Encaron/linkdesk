# 05-插件更新 · 串口监视器（`Encaron/linkdesk-plugin-serial-monitor`）补丁档案

> 2026-09-13 建。✅ **2026-09-29 收口＋发版——右键菜单「双注册」已修（serial-monitor 1.0.29）。**
> 本夹 = 该插件的补丁档案集；命名取插件显示名「串口监视器」。⚠️ 与 [`../Serial-Simulator/`](../Serial-Simulator/README.md)（串口模拟器，另一个插件）不是一回事；也与 [`../终端系统/`](../终端系统/00-README.md)（真 shell）不是一回事。
> ⚠️ 本插件**今天不随包**（账 `bundled-plugins.lock.json` 里 `seed: false`，纯市场）——本档 §七 旧版「随包」那套说法已作废，订正见该段。

## ○、收口读数（2026-09-29）

| 项 | 读数 |
|:--|:--|
| 改法 | **方案 A**——删插件 `src/index.tsx` 的运行时 `registerItems`，菜单只剩 `plugin.json` 的 `contributes.menus` 一个源 |
| 修法前置核查 | ✅ **通过**（§五 那条「壳侧解析不出声明命令 title」的疑点今天已不成立——证据见该段） |
| 插件仓提交 | `00cd371`（rebase 后远端 = `344feaa`）· 已推 |
| Release | [`v1.0.29`](https://github.com/Encaron/linkdesk-plugin-serial-monitor/releases/tag/v1.0.29)（asset 174.4 KB） |
| 资产取证 | 下载解包：`plugin.json.version == 1.0.29` · **包内 `registerItems` 出现 0 次**（修的东西真在包里）· tag `v1.0.29` → `344feaa`（正是那笔修复提交） |
| 官方目录收录 | `3519c9a`（只增改自己这 1 条，其余 17 条逐字节原样） |
| 出厂种子账 | `bundled-plugins.lock.json` 已刷 1.0.29（纯市场条目，**仅记账**——箱内 6 只不变） |
| 本仓腿 | `npm run test` 27 文件 / 326 例全绿 · `npm run verify` 六段全绿（声明面 24 名归属零偏离 · 字典 132 key） |
| 壳侧 | **零改动** |
| 仍未做 | §六 那把机械门禁（可选、待拍板） |
| 待实测 | §八 五条（用户装机看效果） |

---

## 一、候选补丁：右键菜单项「双注册」重复显示（✅ 已修 · 下面是立案时的原始记录）

**现象。** 串口监视器的接收区右键，菜单里「复制」「全选」「清空」**各出现两次**；`togglePause`（暂停/继续）只出现一次。

**🔥 2026-09-13 补充核实（用户只报了接收区，实际多一处）。** 同一毛病还有第二处：**快捷发送药丸右键**（`menuId="quickSendContext"`）里「编辑」「删除」也**各出现两次**，而「填充」只出现一次——同一条"两份都注册过的才重复"的规律。

**✅ 修完的一处用户可见变化：** 接收区那一项文案从运行时手写的那份「清空」变成命令声明里的标题「**清空接收区**」（其余五项文字不变）。分组随声明式那份（接收区 = 复制/全选 一组 ＋ 清空接收区/切换接收暂停 一组；药丸 = 回填到发送区/编辑 一组 ＋ 删除 一组）。

## 二、根因（三处证据，全链核实）

> 路径口径：`plugins/serial-monitor/*` 是**当年壳仓里的路径**；源码 2026-09-14 已外移（现住 `E:\linkdesk-plugins\official\serial-monitor`），壳仓今天只有它的产物。下表保留原路径作出处。

| 环节 | 事实 | 证据 |
|:--|:--|:--|
| ① 声明式那份 | `contributes.menus.editorContext` 声明 4 条（copy / selectAll / clear / togglePause），**每条都带** `when: "activeEditor == 'serial-monitor'"`（togglePause 另加 `sourceOpen`）；`quickSendContext` 声明 3 条（Fill / Edit / Delete） | 插件仓 `plugin.json`（menus 段） |
| ② 运行时那份 | 模块顶层又调了一次 `registerItems`：`editorContext` 3 条（copy / selectAll / clear，**不带 when**、带 `label: "复制"` 等）+ `quickSendContext` 2 条（Edit / Delete，带 label） | 插件仓 `src/index.tsx`（原 `:25-35`；**1.0.29 已删**） |
| ③ 判重为什么兜不住 | 幂等键 = **command + pluginId + when**（when 并入身份键，`E5.8#37.6` 拍板的正确设计——为「移动到左侧/右侧」同命令 ID、仅 when 区分而设）。①的 when 是字符串、②的 when 是 `null` ⇒ **判重键不同 ⇒ 两份都算不同菜单项、都进注册表** | 壳 `src/core/registry/commands/MenuRegistry.ts`（判重分支；行号已漂，按 `duplicate` 变量定位） |

**反证成立：** `togglePause`（只在①）与 `quickSendFill`（只在①）都不重复——重复项恰好是①②都注册过的那五条。用户推断的机制与代码完全一致。
**这条反证也是修复的安全垫：** `togglePause` 只活在声明式那份里，而它在右键菜单里**一直只出现一次** ⇒ 声明式这条路在现场本来就是通的（→ §五 前置核查）。

**消费方（现象发生地）：** 接收区右键 `ReceiveArea.tsx`（`menuId="editorContext"`）；药丸右键 `QuickSendBar.tsx`（`menuId="quickSendContext"`）。

## 三、历史成因（插件自证）

`src/index.tsx` 的头注写明：运行时那份是 **`E5.6#16.7k-fix`** 的补丁——当时壳侧 `getCommands()` 查不到池侧 `_poolCommands` 的命令，菜单项 `title` 解析成 `undefined` → 显示空白 → 于是插件侧注册时手动带 `label`。后来 `plugin.json` 的声明式贡献（带 when 门控）也补齐了，**两份并存至今无人收敛**（属"补丁打完没回收"的陈账）。

## 四、普查结论（2026-09-13 全仓 grep）

全仓 `menu.registerItems` 只有 **3 处**：

| 插件 | 注册的 menuId | 是否与自己的 plugin.json 重叠 |
|:--|:--|:--|
| **serial-monitor** | `editorContext` + `quickSendContext` | 🔴 **两处都重叠**（本候选补丁 · ✅ 1.0.29 已删） |
| editor | `editorContext` | 否——单源（其 `plugin.json` 不声明 `menus`，且**运行时那份不带 label**，靠命令 title 显示 ⇒ 它本身就是「声明式解析已通」的活证据） |
| file-tree | `FileContext` + `MenuBar` | 否——单源（当年 `plugin.json` 无 menus 段；**2026-09-29 的 FT# 专项已改成声明式**，源码里 ⛔ 不再手写槽位） |

⇒ **不是系统性缺陷，是 serial-monitor 一家的历史遗留**，无需"全仓迁移"大任务。

## 五、修法二选一 + 前置核查（✅ 已按方案 A 收口 · 前置核查通过）

| 方案 | 做法 | 评价 |
|:--|:--|:--|
| **A（选定并实施）** | 留 `plugin.json`、删 `src/index.tsx` 的运行时注册 | 符合声明式正统；**白得 `when` 门控**（其它编辑器上下文里不再误显示串口各项） |
| B | 留 `index.tsx`、删 `plugin.json` 段 | 改动最小，但丢 when 门控与声明式风格，不算收口 |

**方案 A 的前置核查（唯一跨侧疑点）：** 删掉运行时注册后，壳侧能否从 `contributes.commands` 解析出这三条命令的 `title`？——当年带 label 正是为了绕这个。

**✅ 核查结论（2026-09-29 实测，通过——本条**纯插件侧**即可收口，不欠 04-软件更新 任何一项）：**

1. **壳的 loader 把 `contributes.commands` 连 `title` 一起注册进壳的 CommandRegistry**（`src/pluginLoader/contributions/contributions.ts`，`placeholder: true` 的元数据条目）——时机 = 插件装载，**与视图是否 mount 无关**。
2. **菜单取显示文字就读这份表**：`title: cmd?.title ? i18n.t(cmd.title) : cmd?.title`（`src/core/services/plugins/IpcBridgeHandler/ui.ts` 的 `menu:getItems`），渲染侧兜底 `label: item.label ?? item.title ?? item.command`（`ContextMenu.tsx`）。当年的缺口（池侧 `_poolCommands` 壳看不见）另由 `E5.7 Bug C` 的**池 → 壳元数据单向同步**（`registerPoolCommandMetadata`）补上。
3. **现场反证两条**：插件自己的 `togglePause`（只在声明式那份）一直正常显示；editor 的运行时注册**完全不带 label**，其右键菜单在生产里也一直正常 ⇒「无 label 走命令 title」这条路今天就是通的。

**顺带收敛的漂移（已做）：** 两份注册的 `group` 不一致（`editorContext`：plugin.json 用 `edit` / `serial-monitor`，运行时用 `clipboard` / `selection` / `edit`；`quickSendContext`：plugin.json 用 `edit` / `delete`，运行时用 `edit` / `danger`）——删掉运行时那份后 **group 自然以 plugin.json 为准**。

## 六、可选机械门禁（堵复发 —— ⏳ 仍未做，待拍板）

「插件 runtime `registerItems` 的 `(menuId, command)` 若已在**同插件** plugin.json 的 `contributes.menus` 里声明过 → 红」——把同款双注册在 `npm run check` 上堵死（照 `check-contributes` 家族做法）。**本轮没做**（属壳仓的活，且当时是候选）。不做的话，本补丁属于"修一次就算"，下次谁再手写一份 runtime 注册没人拦。
> 📌 相关但**不等价**：SDK 从 file-tree 那轮长出的腿 `linkdesk/no-menu-slot-case`（`packages/plugin-sdk/src/eslint/checks/menu-slots.ts`）管的是**槽位名大小写**，**管不到**双注册这件事——别误以为已经有了。
> 本轮在**插件侧**留了一道便宜的拦：`AGENTS.md` 写成硬规矩「右键菜单只有一个源（`contributes.menus`），⛔ 别再写运行时注册」＋ `src/index.tsx` 原址留注释说明为什么不能再写。

## 七、发布路径（✅ 已按实情走完；⚠️ 旧版此段两处说法作废）

**旧版（2026-09-13）写的是：** serial-monitor 是 `distribution: builtin` **随包插件**（`bundled-plugins/serial-monitor.linkdesk-plugin`），修完必须 ① bump version ② 重打 zip 同步进 `bundled-plugins/`，且实机验收须在 fresh userData / `--force-rematerialize-bundled` 下跑。

**🔴 订正（2026-09-29 实录）——这两条今天都不成立：**

- **`distribution` 字段已经不存在了**——今天的插件分发形态由账 `bundled-plugins.lock.json` 的 `seed` 布尔声明（**数据，不是代码**）。serial-monitor = **`seed: false`（纯市场）**；`bundled-plugins/` 箱里只有 6 只（editor / file-tree / lang-defaults / marketplace / settings / theme-defaults）。
- ⇒ **没有「重打 zip 进 bundled-plugins」这一环**，也**没有 `--force-rematerialize-bundled` 这个验收前提**：用户从**市场**装这只插件，拿到的是 Release 资产。

**实走的路径（照 release-discipline 三 · 插件轴）：** bump `plugin.json` ＋ `package.json` **同值**（1.0.28 → 1.0.29）→ `npm run build` → commit ＋ push（publish 有两道前置断言：工作区干净 ＋ 本地 HEAD 已推）→ `npm run publish`（Release `v1.0.29`）→ **官方目录收录**（`3519c9a`）→ `npm run sync:bundled -- --latest`（纯市场条目仅记账）。

**老用户怎么拿到修复：** 装的是市场版 ⇒ 在市场里对这只插件点**更新**（版本号抬高后市场出可更新徽标）。⚠️ 这与「随包种子更新」（真欠账 `E6#26b`）是**两条不同的路**，别混。详见 [文件树 00-README 的「发布路径」段](../文件树/00-README.md)、memory `version-and-release` §3.1。

## 八、立项后验收（用户视角 —— ⏳ 待实机实测）

> 装机方式：市场里对「串口监视器」**更新到 1.0.29**（纯市场插件，`seed:false`，不走随包种子）。

1. 接收区右键 → 「复制」「全选」**各一次**，「清空接收区」**一次**（⚠️ 文案从旧版的「清空」变成「清空接收区」——本次唯一用户可见的文字变化），「切换接收暂停」一次（且只在数据源打开时出现）。
2. 快捷发送药丸右键 → 「回填到发送区」「编辑」「删除」**各一次**。
3. **在别的编辑器上下文里右键 → 不再出现串口那几项**（`when` 门控白得的收益）。
4. 亮/暗主题各过一遍；右键菜单定位、点击后动作生效（复制进剪贴板、清空真的清空）。
5. 分组看一遍：接收区 = 「复制 / 全选」一组 ＋「清空接收区 / 切换接收暂停」一组（两组之间应有分隔线）；药丸 = 「回填到发送区 / 编辑」一组 ＋「删除」一组。
