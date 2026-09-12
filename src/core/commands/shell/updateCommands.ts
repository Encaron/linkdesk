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
import { APP_PLUGIN_ID } from "../../services/plugins/PluginStateService";

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
}
