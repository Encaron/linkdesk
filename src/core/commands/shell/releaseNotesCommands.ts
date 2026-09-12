/**
 * 壳「发行说明」命令——E6#57.13e/g。
 * 设计：`docs/02-Electron架构/E6_插件生态与发布/06-主软件更新/05-发行说明.md` §2.1/§2.5。
 *
 * ## 一条命令 + 三条程序化命令，分工是「谁发起」
 *
 * | id | 谁发起 | 可见性 |
 * |:--|:--|:--|
 * | `update.openReleaseNotes` | **人**——帮助菜单首项（`#57.13g`）/ 命令面板 | 命令面板可见 |
 * | `update.releaseNotesSelect` | **池**——左窄栏点某一版 | `when: "false"` |
 * | `update.releaseNotesRetry` | **池**——空态「重试」 | `when: "false"` |
 * | `update.releaseNotesDismissBanner` | **池**——横幅「知道了」 | `when: "false"` |
 *
 * ## 🔴 后三条为什么是**命令**，不是新开一条 IPC 通道
 *
 * 池要能「点一版就换正文」，而壳↔池的动作面**已经有**一条通用通道：
 * `window.linkdesk.commands.execute(id, undefined, ...args)`（池 → 主进程 → 壳
 * `IpcBridgeHandler/commands.ts` → `executeCommand`）。发行说明标签页的三种交互全是
 * 「池知道用户点了什么、壳才知道该做什么」，**恰好是命令这个词的定义**——所以走命令：
 * 零新通道、零新契约面、零新 DTO 字段（对比：真要开通道就得动 `channels.ts` + 双 preload +
 * 命名空间矩阵，那是给「壳与插件之间的通用能力」用的预算，不该花在一个标签页的三个按钮上）。
 *
 * ⚠️ **第二个实参必须显式传 `undefined`**——那是 token 占位槽（`commands:execute` 的
 * `const [commandId, token, ...rest] = args`，见 `IpcBridgeHandler/commands.ts:19`）。
 * 漏了它 ⇒ `version` 会被吃进 token 槽 ⇒ handler 收到空数组，**而且不报错**（静默失效）。
 *
 * ## 与 `updateCommands.ts` 的关系
 *
 * 同一族（`update.*`），但**不合并进那个文件**：那个文件的头注把边界写死为「只做入口，不做出声」，
 * 而本文件的四条里有一条要**改数据态**（`primeReleaseNotes`）。混进去会让那条边界变成谎话。
 * 两条命令族共用 `category: "帮助"`，在命令面板里仍是一组。
 */

import { registerCommand } from "../../registry/commands/CommandRegistry";
import { getCallbacks } from "../infra/CoreCallbacks";
import { APP_PLUGIN_ID } from "../../services/plugins/PluginStateService";
import { RELEASE_NOTES_TAB_TYPE } from "../../utils/tabIdentity";

/**
 * 打开（或聚焦）发行说明标签页——`#57.13d/e/g` 三个发起方**共用这一个函数**。
 *
 * 🔴 **顺序不能反**：`primeReleaseNotes()` **先**设态，`openTab()` **后**开。
 * 反过来的话，池在打开的那一帧读到的还是上一次的载荷（同 `usePoolSync` 主推送 effect 的
 * 「先 `setValue` 再组装推送」，`#57.11` 记过同款）。这里还不是「闪一下」的问题：
 * 池第一帧读到的 `state` 决定它画骨架还是画正文，而**壳态要等开 tab 之后才有机会重推**——
 * 池会一直停在旧态直到下一次布局推送。
 *
 * 单例去重靠 `reduceOpenOrFocus`（按 `type` 查已有标签页）+ `SHELL_META[type].singleton`，
 * 本函数不自己判「有没有开过」——那是标签页状态层的职责，在命令里再判一遍就是两份真相源。
 *
 * ⚠️ **`openTab()` 的形参名是 `pluginId`，实际收的是 tab `type`**（`tabCallbacks.ts:98`
 * 直接转给 `openOrFocusTab(type, …)`）。壳直渲染视图没有 pluginId，它的身份**就是** type
 * ——这是壳视图的既有形状（`resolvePoolTabTitle(activeTab.label, entry?.manifest.name, t)` 同理）。
 *
 * @param opts.banner 首启自动弹（`#57.13d`）——横幅 + `lastSeenVersion` 的账由调用方记
 * @param opts.version 通知面条目（`#57.13e`）定位到某一版
 */
export async function openReleaseNotesTab(opts?: { banner?: boolean; version?: string }): Promise<void> {
  // 动态 import（同 `updateCommands.ts` 的取舍）：不给 `src/core/` 的静态依赖图
  // 加一条指向 `src/hooks/`（React 模块）的新边。
  const { primeReleaseNotes } = await import("../../../hooks/useReleaseNotes");
  // 🔴 **这三行的顺序与「谁 await 谁」都是硬要求**：
  //   ① 这里拿到的 `loading` 是**浮动 Promise**——`primeReleaseNotes` 不是 `async`，
  //      函数体（设态 + 发 loading）在上面那句就已经同步跑完了，返回的只是取数的尾巴；
  //   ② `openTab` 必须紧跟着**同步**发出，中间不许插 await（插了 = 池第一帧读旧态）；
  //   ③ **`await` 放在 `openTab` 之后**——`#57.13d` 需要「取数结束」这个时刻来判
  //      「失败下次再试」，而它绝不能以推迟开标签页为代价。
  const loading = primeReleaseNotes(opts); // 先设态（同步段）
  getCallbacks()?.openTab(RELEASE_NOTES_TAB_TYPE); // 再开 tab（同步）
  await loading; // 取数落地才返回——本函数返回时的态可供调用方直接判定
}

export function registerReleaseNotesCommands(): void {
  registerCommand(APP_PLUGIN_ID, {
    // 帮助菜单首项（`#57.13g`）。恒显——「入口存在」不是「有更新才给你看」，
    // 用户想查历史版本说明随时可查（与 `update.checkForUpdates` 的恒显原则同源，03 §2.2）。
    id: "update.openReleaseNotes",
    title: "显示发行说明",
    category: "帮助",
    handler: async () => {
      await openReleaseNotesTab();
    },
  });

  // ── 以下三条：池侧动作的落点。`when: "false"` = 不进命令面板，仅供 API 调用
  //    （同 `quickPickCommand.ts:65` 的先例）。每条都只做一件事，判定全在 `useReleaseNotes` 里。──
  //
  // 🔴 **标题刻意用英文标识符，不是漏翻译**：`when: "false"` 的命令**任何界面都不渲染它**
  //    （命令面板按 when 过滤掉、右键菜单也不会挂），所以这个字段是**调试标签**不是 UI 文字，
  //    不归硬约束 2 管、也不该往词典里塞三条永远查不到的死键。先例 = `quickPickCommand.ts:64`
  //    的 `title: "QuickPick"`（同类程序化命令的既有写法）。**将来谁把 `when` 改成可见，谁负责补翻译。**

  registerCommand(APP_PLUGIN_ID, {
    /** 左窄栏点了某一版——`args[0]` = 版本号（无 `v` 前缀） */
    id: "update.releaseNotesSelect",
    title: "Release Notes: Select Version",
    when: "false",
    handler: async (...args: unknown[]) => {
      const version = args[0];
      // 🔴 类型守卫不是防御性编程的摆设：这条命令**跨进程**到达（池 → 主进程 → 壳），
      // 中间的 args 是纯数据。收到非字符串时静默丢弃，比让 `loadReleaseNotes(undefined)`
      // 悄悄退回「取最新一版」好——那会把「点了 A 版却显示最新版」变成一个查不出的 bug。
      if (typeof version !== "string" || !version) return;
      const { selectReleaseNotesVersion } = await import("../../../hooks/useReleaseNotes");
      selectReleaseNotesVersion(version);
    },
  });

  registerCommand(APP_PLUGIN_ID, {
    /** 空态「重试」——重试当前那一版（不是「取最新」：用户上一步想看什么，就再来一次） */
    id: "update.releaseNotesRetry",
    title: "Release Notes: Retry",
    when: "false",
    handler: async () => {
      const { retryReleaseNotes } = await import("../../../hooks/useReleaseNotes");
      retryReleaseNotes();
    },
  });

  registerCommand(APP_PLUGIN_ID, {
    /** 横幅「知道了」——**只收横幅**，不记 `lastSeenVersion`（那是「弹过没」的账，两回事） */
    id: "update.releaseNotesDismissBanner",
    title: "Release Notes: Dismiss Banner",
    when: "false",
    handler: async () => {
      const { dismissReleaseNotesBanner } = await import("../../../hooks/useReleaseNotes");
      dismissReleaseNotesBanner();
    },
  });
}
