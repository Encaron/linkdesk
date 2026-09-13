/**
 * 壳「关于」命令——E6#57.14e/g。
 * 设计：`docs/02-Electron架构/E6_插件生态与发布/06-主软件更新/06-关于标签页.md` §4.1/§4.3。
 *
 * ## 一条命令 + 一条程序化命令，分工是「谁发起」
 *
 * | id | 谁发起 | 可见性 |
 * |:--|:--|:--|
 * | `app.about` | **人**——帮助菜单末项 / 齿轮菜单末项 / 命令面板（`#57.14g`） | 命令面板可见 |
 * | `app.aboutCopy` | **池**——关于页「复制」按钮 | `when: "false"` |
 *
 * ## 🔴 「复制」为什么是**命令**，不是新开一条 IPC 通道
 *
 * 与 `releaseNotesCommands.ts` 头注里那条**逐字同理**（本文件是同一取舍的第二个落点，不再复述全文）：
 * 池知道用户点了什么、壳才知道该做什么 ⇒ 走 `window.linkdesk.commands.execute`，
 * 零新通道、零新契约面。**注意本条比发行说明那三条还更硬**：剪贴板的写入口
 * （`ClipboardService`）在 core，池**够不着**，所以这条命令不是「更优雅」，是**唯一可行**的路。
 *
 * ## 🔴 「检查更新…」**不在这里**——复用 `update.checkForUpdates`
 *
 * 06 §4.3 明文「调 `update.checkForUpdates` 命令」。关于页那个按钮与帮助/齿轮菜单/TitleBar
 * 是**同一个入口的第四个落点**（E6#57.10「入口可多处，命令源唯一」）——池直接
 * `executePoolCommand("update.checkForUpdates")`，本文件不为它写第二份逻辑。
 * 顺带证明了一件事：`when: "false"` **不是**池调命令的必要条件（`when` 只管**可见性**，
 * 执行路径 `IpcBridgeHandler/commands.ts` 的 `commands:execute` 不做任何 when 过滤）——
 * 别照着「池只能调 when:false 的命令」这条想当然去改 `update.checkForUpdates`。
 *
 * ## 与 `updateCommands.ts` 的关系
 *
 * 同一族（主软件自身），但**不合并进那个文件**：那个文件的头注把边界写死为「只做入口，
 * 不做出声」，而本文件的 `app.aboutCopy` 要**出声**（推一条「已复制」到通知面）。
 * 混进去会让那条边界变成谎话——同 `releaseNotesCommands.ts` 的分家理由。
 * 命令族共用 `category: "帮助"`，在命令面板里仍是一组。
 */

import { registerCommand } from "../../registry/commands/CommandRegistry";
import { getCallbacks } from "../infra/CoreCallbacks";
import { APP_PLUGIN_ID } from "../../services/plugins/PluginStateService";
import i18n from "../../../i18n";
import { ABOUT_TAB_TYPE } from "../../utils/tabIdentity";

/**
 * 打开（或聚焦）关于标签页——`#57.14e` 的三个入口（帮助菜单 / 齿轮菜单 / 命令面板）都经
 * **命令 `app.about`** 汇到这一个函数。
 *
 * ⚠️ **不 export**（与 `openReleaseNotesTab` 的差别在此，不是因为漏写）：那个被
 * `releaseNotesOnLaunch` / `useUpdateNotifications` 两个文件跨模块调用，所以必须导出；
 * 本函数的唯一消费者就是**下面同一个文件里的命令 handler**。导出而无人 import = knip 报未用导出。
 *
 * 🔴 **顺序不能反**（`openReleaseNotesTab` 定下的同一条铁律）：`primeAbout()` **先**设态、
 * `openTab()` **后**开、`await` 放**最后**。反过来的话池第一帧读到的是上一次的载荷
 * （`state: "loading"` 的旧对象），且壳态要等下一次布局推送才有机会重推。
 *
 * ⚠️ **`openTab()` 的形参名是 `pluginId`，实际收的是 tab `type`**——壳直渲染视图没有 pluginId，
 * 它的身份**就是** type（同 `openReleaseNotesTab` 的注释）。
 *
 * 单例去重靠 `reduceOpenOrFocus`（按 `type` 查已有标签页）+ `SHELL_META[ABOUT_TAB_TYPE].singleton`，
 * 本函数不自判「有没有开过」——那是标签页状态层的职责，在命令里再判一遍就是两份真相源。
 */
async function openAboutTab(): Promise<void> {
  // 动态 import（同 `updateCommands.ts` 的取舍）：不给 `src/core/` 的静态依赖图
  // 加一条指向 `src/hooks/`（React 模块）的新边。
  const { primeAbout } = await import("../../../hooks/useAbout");
  const loading = primeAbout(); // ① 先设态（同步段）
  getCallbacks()?.openTab(ABOUT_TAB_TYPE); // ② 再开 tab（同步，中间不许插 await）
  await loading; // ③ 取数落地才返回
}

export function registerAboutCommands(): void {
  registerCommand(APP_PLUGIN_ID, {
    // 恒显（无 when）——同 `update.checkForUpdates` / `update.openReleaseNotes` 的恒显原则：
    // 版本信息随时可查，没有「有更新才给你看关于页」这回事。
    // 两处菜单声明（帮助 `helpUpdate` / 齿轮 `update`，见 `#57.14g`）都指向本 id——
    // 菜单项的 label 归菜单（label 覆盖 title 是本职），本模块不重复声明。
    id: "app.about",
    title: "关于 LinkDesk",
    category: "帮助",
    handler: async () => {
      await openAboutTab();
    },
  });

  // 🔴 **标题刻意用英文标识符，不是漏翻译**——同 `releaseNotesCommands.ts` 的三条程序化命令：
  // `when: "false"` 的命令**任何界面都不渲染它**，这个字段是**调试标签**不是 UI 文字，
  // 不归硬约束 2 管、也不该往词典里塞一条永远查不到的死键。将来谁把 `when` 改成可见，谁负责补翻译。
  registerCommand(APP_PLUGIN_ID, {
    /** 关于页「复制」——全字段 `key: value` 多行文本进剪贴板 */
    id: "app.aboutCopy",
    title: "About: Copy",
    when: "false",
    handler: async () => {
      const { getAboutCopyText } = await import("../../../hooks/useAbout");
      // 拿不到数就当无事发生（**不往剪贴板写空串**——那会把用户原有的剪贴板内容冲掉）
      const text = getAboutCopyText();
      if (!text) return;

      const { writeClipboardText } = await import("../../services/ui/ClipboardService");
      writeClipboardText(text);

      // 出声归通知面（06 §4.3：落**通知面条目**「已复制」）。
      // 🔴 **不带 `wake`**——照既有「复制类动作」先例（`coreCommands.ts` 的
      // `workbench.action.copySettingId` / `copySettingAsJson`：同款 `pushToast` + `TOAST_TTL_INFO`、
      // 同样不唤醒）。唤醒白名单是收口的（18 档 §五 B，`shouldWake` 表达式只此一处）——
      // `#57.12` 的「当前已是最新版本」是为「点了菜单却像什么都没发生」开的**窄口径覆盖**，
      // 复制不在那一类，**别顺手把白名单放宽**（那会把面板一步步变成什么都弹）。
      const { pushToast, TOAST_TTL_INFO } = await import("../../services/ui/toast");
      pushToast({
        message: i18n.t("已复制"),
        // 来源 = 主软件（`usePoolSync/notif.ts` 的 `shellSourceName` 已有 `APP_PLUGIN_ID` 一行
        // ⇒ 「主软件」，零新映射）。复制的是**主软件的身份**，不是「主软件更新」。
        source: APP_PLUGIN_ID,
        ttl: TOAST_TTL_INFO,
      });
    },
  });

  // 🔴 **恒显（无 when）**——同 app.about：许可信息随时可查（E6#57.10e ④，2026-09-13 用户拍板 MIT）。
  // 呈现面 = 系统浏览器：`window.open` 被 E6#70c 的全局路由转交 `shell.openExternal`（VS Code
  // 「View License」先例）——零新增 API 面，不为一段静态文本造新呈现面。
  registerCommand(APP_PLUGIN_ID, {
    id: "app.viewLicense",
    title: "查看许可证",
    category: "帮助",
    handler: async () => {
      window.open(LICENSE_URL, "_blank");
    },
  });
}

/** LICENSE 全文的线上正本——GitHub 承载（2026-09-11 拍板不建官网）。⚠️ 生效前提 = LICENSE 已推到远端 */
// ⚠️ 2026-09-13 订正：写 `electron` 会 404——LICENSE 目前在 `e6` 分支（主线追平前不在默认分支上）。
//    `e6` 分支长存 ⇒ 链接长期有效；主线追平后此链接依旧成立（e6 不删）。0.1.60 已带旧链接出门，
//    本修随 0.1.61 生效（见 `#57.10e` 勾行的如实注）。
const LICENSE_URL = "https://github.com/Encaron/linkdesk/blob/e6/LICENSE";
