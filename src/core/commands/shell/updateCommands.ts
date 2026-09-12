/**
 * 壳「主软件更新」入口命令——E6#57.10。
 * 设计：`docs/02-Electron架构/E6_插件生态与发布/06-主软件更新/03-菜单与入口设计.md` §2.2 命令表。
 *
 * **入口可多处，命令源唯一**（03 §三）：帮助菜单 / 齿轮菜单 / 命令面板 / TitleBar 按钮
 * 引用的都是本模块这两个 id——不在各入口各写一份逻辑。
 *
 * ⚠️ **本模块只做入口，不做出声**——点「检查更新…」之后的结果（已是最新 / 有新版本 /
 * 失败 + `[重试]`）由**通知面**消费状态机产出，那是 #57.12 的活（04-更新通知与交互）。
 * 这里**不 pushToast**：四个入口共用同一个通知面，多写一处就等于多一个真相源。
 *
 * 取用壳侧超额暴露的更新面走 `getShellUpdateApi()`（`src/hooks/useUpdateState.ts` 的
 * **全仓唯一转型处**）。用**动态 import** 而非顶层 import：同目录既有惯用法
 * （`coreCommands.ts` 的 DialogService / ClipboardService / ConfigurationService 十几处同款），
 * 好处是不给 `src/core/` 静态依赖图加一条指向 `src/hooks/`（React 模块）的新边——
 * 现状 core → hooks **只有 type-only import** 先例（`LayoutService.ts` / `tabIdentity.ts`）。
 */
import { registerCommand } from "../../registry/commands/CommandRegistry";
import { registerTitleBarContribution } from "../../registry/commands/MenuRegistry";
import { APP_PLUGIN_ID } from "../../services/plugins/PluginStateService";
import type { UpdateState } from "../../types/ipc/update";

/* ── E6#57.11：TitleBar 更新按钮的两个 context key —— 壳保留键 ── */

/** 显隐门控键：`true` = 有可处理的更新 ⇒ 按钮出现；缺省/`false` = **不占位**（不是画一个灰的） */
export const UPDATE_ACTIONABLE_KEY = "updateActionable";

/** 文字键：值是**中文 i18n key 原文**（不是译文）——翻译只在壳侧 `buildTitleBarSlots` 发生一次 */
export const UPDATE_BUTTON_LABEL_KEY = "updateButtonLabel";

/**
 * 九态 → 按钮文字（i18n key）。返回 `null` = 无话可说 ⇒ 按钮隐藏。
 *
 * 🔴 **`updating` 归「更新中」而不是隐藏**（2026-09-12 用户拍板）——这是**设计文档表格里没有的一格**
 * （`03-菜单与入口设计.md` §4.3 只写了三态）。原因：用户点完「重新启动」到软件真正退出之间有
 * 一段安装期，此时把按钮抽掉会让人以为「点了没反应」；留着「更新中」才是「你的点击生效了」。
 * 该格点击是 **no-op**（见下方 handler 的 `updating` 分支），符合「任何动作都会打架」。
 */
export function updateButtonKeyFor(state: UpdateState): string | null {
  switch (state.type) {
    case "available":
      return "下载更新";
    case "downloading":
    case "updating":
      return "更新中";
    case "downloaded":
    case "ready":
      return "重新启动";
    // uninitialized / disabled / idle / checking —— 无更新可处理，按钮不占位。
    // 尤其 `idle`：它同时承载「已是最新」与「上次失败了」，两者都**不该**把这个按钮点亮
    // （失败有它自己的出声面，#57.12 通知）。
    default:
      return null;
  }
}

/** 显隐门控的值——**由 {@link updateButtonKeyFor} 派生**，不写第二份 switch。
 *  两处各写一份九态判断 = 两份真相源，早晚一个改了另一个没改（按钮显示着却无文字/反过来的那种 bug）。 */
export function isUpdateActionable(state: UpdateState): boolean {
  return updateButtonKeyFor(state) !== null;
}

export function registerUpdateCommands(): void {
  registerCommand(APP_PLUGIN_ID, {
    // 恒显（03 §2.2 恒显原则）——**与 `app.update.mode` 无关**：
    // 「入口存在」不是「能力承诺」，而是「随时可查」承诺。manual 档只禁**后台自动检查**，
    // 不禁用户主动点（07-数据流通格式 §4.1：mode 管的是调度，不是入口）。
    id: "update.checkForUpdates",
    title: "检查更新…",
    category: "帮助",
    handler: async () => {
      const { getShellUpdateApi } = await import("../../../hooks/useUpdateState");
      const api = getShellUpdateApi();
      if (!api) return; // 非壳环境（vitest 无 preload / 纯 Vite 预览）——入口静默 no-op，不抛
      // context=true = **手动**检查。后台那条路是 useUpdateScheduler（auto 档 30s + 每 4h），
      // 不从这里走——两条路的唯一区别就是这个布尔（07 §4.1），记账在 UpdateService 里完全一致。
      await api.checkForUpdates(true);
    },
  });

  registerCommand(APP_PLUGIN_ID, {
    // 按当前状态分支的「处理更新」——TitleBar 按钮（#57.11）与四个入口共用本 id（03 §4.2）。
    id: "update.openUpdateFlow",
    title: "处理更新",
    category: "帮助",
    handler: async () => {
      const { getShellUpdateApi } = await import("../../../hooks/useUpdateState");
      const api = getShellUpdateApi();
      if (!api) return;
      // 读**服务端权威态**（getState），不是壳侧 hook 缓存——按钮点击与最后一次广播之间可能差一帧，
      // 而这一帧决定「按下去是开始下载还是重启安装」，取权威态。
      const state = await api.getState();
      // 九态映射（03 §4.3）：
      //   available                     → 开始下载
      //   downloaded / ready            → 重启并安装
      //   downloading                   → **不重复触发**（进度已在跑，重复调 = 再来一条下载链）
      //   updating                      → 安装已在进行，任何动作都会打架
      //   idle / checking / uninitialized / disabled → 无动作可做
      if (state.type === "available") {
        await api.downloadUpdate();
      } else if (state.type === "downloaded" || state.type === "ready") {
        // 抛错面（无安装器 / 校验失败）在此上抛——executeCommand 统一 catch → reportError
        // → 用户可见提示。本模块不自造提示通道（见文件头「只做入口」）。
        await api.quitAndInstall();
      }
    },
  });

  // E6#57.11：TitleBar 右槽按钮——本模块的**第四个入口**（文件头 :5 已列）。
  // 声明落在本模块而不是新开一处：这两个 id 与两个 context key 都在本文件；且这是**入口声明**
  // 不是「出声」，与文件头「只做入口，不做出声」不冲突（它只是把 command id 指过去，零逻辑复本）。
  // `label` 带 `$` 前缀 = context key 引用（见 MenuRegistry.TitleBarContribution.label 的 🔴 段）。
  registerTitleBarContribution(APP_PLUGIN_ID, "right", {
    command: "update.openUpdateFlow",
    label: `$${UPDATE_BUTTON_LABEL_KEY}`,
    when: UPDATE_ACTIONABLE_KEY,
  });
}
