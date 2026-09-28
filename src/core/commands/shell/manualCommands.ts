/**
 * 壳「AI 操作手册」命令——M3 `AI#16`。
 * 任务档案：`docs/04-软件更新/待抉择池/AI友好化-全自动操作/03-任务档案/M3-手册.md`（`AI#16` 的「软件内入口」半）。
 *
 * ## 只有一条命令，而且它必须存在
 *
 * | id | 谁发起 | 可见性 |
 * |:--|:--|:--|
 * | `app.openAiManual` | **人**——帮助菜单（`helpLearn` 锚位）＋ 命令面板 | 命令面板可见 |
 *
 * 与 `aboutCommands.ts` 的差别：那边还有第二条程序化命令（`app.aboutCopy`，池按钮的落点），
 * 本视图的章切换是纯视图态（`useState`）⇒ **没有池→壳的动作需要落成命令**，一条就够，
 * 不为「凑对称」加一条无人调用的命令（无死代码）。
 *
 * ## 🔴 顺序铁律（`openReleaseNotesTab` 定下的，第三处同款）
 *
 * `primeAiManual()` **先**设态 → `openTab()` **后**开 → `await` 放**最后**。
 * 反过来的话池第一帧读到的是上一次的载荷（`loading` 的旧对象），而壳态要等下一次布局推送
 * 才有机会重推——池会一直停在旧态。
 *
 * ## 为什么读手册也走「命令」而不是直接开标签页
 *
 * 与 `app.about` / `update.openReleaseNotes` 逐字同理（E6#57.10「入口可多处，命令源唯一」）：
 * 菜单项的 `command` 指向本 id，命令面板也列本 id——**两个入口一条命令**，
 * 手感（菜单）与可达性（命令面板 / `executeCommand`）各走各的门进来，落到同一处。
 * 顺带这一条本身就属于手册讲的「非鼠标路径」：AI 可以
 * `await linkdesk.commands.executeCommand("app.openAiManual", undefined)` 把手册页打开。
 */

import { registerCommand } from "../../registry/commands/CommandRegistry";
import { getCallbacks } from "../infra/CoreCallbacks";
import { APP_PLUGIN_ID } from "../../services/plugins/PluginStateService";
import { AI_MANUAL_TAB_TYPE } from "../../utils/tabIdentity";

/**
 * 打开（或聚焦）AI 操作手册标签页——菜单项与命令面板**共用这一个函数**。
 *
 * 单例去重靠 `reduceOpenOrFocus`（按 `type` 查已有标签页）+ `SHELL_META[AI_MANUAL_TAB_TYPE].singleton`，
 * 本函数不自判「有没有开过」——那是标签页状态层的职责，在命令里再判一遍就是两份真相源。
 *
 * ⚠️ **`openTab()` 的形参名是 `pluginId`，实际收的是 tab `type`**（同两个兄弟命令的注释）：
 * 壳直渲染视图没有 pluginId，它的身份**就是** type。
 */
async function openAiManualTab(): Promise<void> {
  // 动态 import（同 `updateCommands.ts` 的取舍）：不给 `src/core/` 的静态依赖图
  // 加一条指向 `src/hooks/`（React 模块）的新边。
  const { primeAiManual } = await import("../../../hooks/useAiManual");
  const loading = primeAiManual(); // ① 先设态（同步段）
  getCallbacks()?.openTab(AI_MANUAL_TAB_TYPE); // ② 再开 tab（同步，中间不许插 await）
  await loading; // ③ 取数落地才返回
}

/** 命令 id 常量——壳内引用点（M4 `AI#38.6` 的设置页 action 键 `ai.guide.openManual`）共用一份，
 *  ⛔ 别在配置声明里写字面量（gen-host-reserved 的 configKeys 扫描器会把 src/App/config 里的
 *  `"app.*"` 字面量当宿主配置键收账，E5.8#78 扫描口径不分上下文）。 */
export const OPEN_AI_MANUAL_COMMAND_ID = "app.openAiManual";

export function registerManualCommands(): void {
  registerCommand(APP_PLUGIN_ID, {
    // 恒显（无 when）——同 app.about / app.viewLicense 的恒显原则：
    // 操作手册随时可查，没有「什么时候才给你看手册」这回事。**离线恒可读**（手册随包，
    // 不联网也要能打开——`AI#16` 的风险条目明写「⛔ 别做成需要联网才能看」）。
    id: OPEN_AI_MANUAL_COMMAND_ID,
    title: "AI 操作手册",
    category: "帮助",
    description: "打开（或聚焦）AI 操作手册标签页：命令面、契约 API 与按任务操作的配方",
    handler: async () => {
      await openAiManualTab();
    },
  });
}
