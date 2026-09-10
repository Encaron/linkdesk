/**
 * PluginLifecycle 事件总线——loader.ts 行为归一化。
 *
 * 🔥 为什么存在：
 *   5 个生命周期函数（install/uninstall/reinstall/enable/disable）各自独立维护
 *   5-6 个副作用（viewRegistry + configRegistry + iconOrder + toast + loadedIds + tabCleanup）
 *   = 30 个维护点。80 个 commit 修同一个伤口：改一个函数漏另一个。
 *
 * VS Code 模式：生产者只 fire 事件，消费端各自订阅。新增/删除消费端不改生产者。
 *
 * 设计依据：[[Phase5h-PluginLifecycle-行为归一化]]
 *
 * @see loader.ts —— 5 个函数只管触发此总线的事件
 */

import { CUSTOM_EVENTS } from "../../core/react/events/CoreEvents";
import i18n from "../../i18n";
import { pushToast, TOAST_TTL_ERROR, TOAST_TTL_SUCCESS } from "../../core/services/ui/NotificationService";
import { getPluginStateValue, setPluginStateValueSync, APP_PLUGIN_ID } from "../../core/services/plugins/PluginStateService";

// E5.8#9：事件定义抽到轻模块 lifecycle-events.ts——registrationTracker 直接 import 它，
// 避免 CommandRegistry → tracker → lifecycle → CommandRegistry 循环依赖。
// 本地 import（notifyPluginViews 引用 onPluginLifecycleChange）+ 重导出（既有调用面零改动）。
import { PluginLifecycle, onPluginLifecycleChange } from "./lifecycle-events";
export { PluginLifecycle, onPluginLifecycleChange } from "./lifecycle-events";
// 只重导出有消费方的类型——PluginUninstallEvent 全仓零 import（knip 实锤），不重导出
export type { PluginInstallEvent } from "./lifecycle-events";

/* ── 视图刷新——Emitter 模式（对标 viewRegistry 的 onDidRegister） ── */

function notifyPluginViews(): void {
  onPluginLifecycleChange.fire();
}

/* ── 消费端初始化（模块加载时注册，不依赖 App 启动顺序） ── */

let _consumersInitialized = false;

export function initLifecycleConsumers(): void {
  if (_consumersInitialized) return;
  _consumersInitialized = true;

  /* ─── 消费端 1：图标排序 ─── */

  PluginLifecycle.onDidInstall.event(({ pluginId, reason }) => {
    if (reason === "install" || reason === "reinstall") {
      // 新装/重装 → 追加到图标栏末尾
      updateIconOrder(pluginId, "append");
    }
    // 'enable'/'startup' → 保持原位——不操作 iconOrder
  });

  PluginLifecycle.onWillUninstall.event(({ pluginId, reason }) => {
    if (reason === "uninstall") {
      // 卸载 → 从 iconOrder 移除（下次重装时排到末尾）
      updateIconOrder(pluginId, "remove");
    }
    // 'disable' → 保留 iconOrder 位置（下次启用时恢复原位）
  });

  // E5.8#12：消费端 2/2b 已删——所有 register() 的 per-entry disposer 经 registrationTracker
  // （模块加载时订阅 onWillUninstall）在 fire 内自动逆序回滚，卸载清理全机械，无手动 unregister*。
  // E5.8#11：卸载路径全部收口到 loadState.unloadPlugin（唯一 fire 生产方）——onWillUninstall/
  // onDidUninstall 只在合法状态迁移上发，顺序由迁移图机械保障（L6b）；notifyPluginRemoved
  // 被 unloadPlugin 调用（本模块定义，loadState 消费）。

  /* ─── 消费端 3：toast 通知 ─── */

  // E6#73h（D2）：本处是 **install 族唯一发声口**——`loadInstalledPlugin` 成功分支那条「已安装：X v1.0」
  // 已删（一次安装弹两条「已安装」，措辞还不一样，用户以为装了两遍）。选本处而非那条的理由：
  // ① install reason 还有第二条腿（`loader.ts:277` 外部拷入源码树的 watcher 路径）**不经过**
  //    loadInstalledPlugin——删本处会让那条腿彻底静默；
  // ② 版本号这里也拿得到（事件带 manifest）⇒ 选本处信息量不减。
  // E6#73h（D3）：全句走 i18n（硬约束 2——通知链此前系统性硬编码中文，英文界面下中英混排）。
  PluginLifecycle.onDidInstall.event(({ pluginId, manifest, reason }) => {
    const name = manifest?.name ?? pluginId;
    if (reason === "startup") return; // 启动加载不弹 toast
    // 'update'（E6#11c）→ 更新专属 toast 由 updatePlugin 发（带 v旧→v新）——此处跳过防双 toast
    // （且「已安装」措辞对更新是误导）
    if (reason === "update") return;
    // 版本号缺失（watcher 腿的 manifest 可能没有 version）→ 退回不带版本的说法，
    // 不落成尾巴光秃秃的「已安装：X v」。
    const msg = reason === "enable"
      ? i18n.t("已启用：{{name}}", { name })
      : manifest?.version
        ? i18n.t("已安装：{{name}} v{{version}}", { name, version: manifest.version })
        : i18n.t("已安装：{{name}}", { name });
    pushToast({
      message: `${msg}${i18n.t("（即时生效）")}`,
      source: pluginId,
      severity: "info",
      ttl: TOAST_TTL_SUCCESS,
      // E6#73b（18 档 §五 B ②）：安装终态进唤醒白名单——这是新建条目（「新状态」），
      // 且 R5-5 明确要求「装成功也要冒出来」。缺省判据（error ∨ 带按钮）够不着它：
      // 装成功是 info、无按钮，靠缺省就是静默。
      // ⚠️ `enable`（启用）不是 job、不在 §五 B ② 的四类里——照旧不唤醒，别顺手放宽。
      wake: reason !== "enable",
    });
  });

  /**
   * E6#73f（K7）：撤销动作失败**必须出声**。
   * 此前两条 撤销 onClick 只 `console.error` —— 而点击动作时 useSubscriptions 已经**先无条件
   * dismissToast**（先删提示再执行动作）⇒ 撤销失败 = 提示消失 + 插件没恢复 ⇒ **用户以为撤销成功了**
   * （18 档 K7）。错误走 error toast，写明插件名（同 73h D5 的「结论句带名」口径）。
   */
  function notifyUndoFailed(pluginId: string, name: string, e: unknown): void {
    console.error("[lifecycle] 撤销失败:", e);
    pushToast({
      message: i18n.t("未能恢复「{{name}}」：{{detail}}", {
        name,
        detail: e instanceof Error ? e.message : String(e),
      }),
      // source 归插件 id——失败条落回那条「已禁用/已卸载」所在的同一个面板分组，用户正看着的地方
      source: pluginId,
      severity: "error",
      ttl: TOAST_TTL_ERROR,
    });
  }

  PluginLifecycle.onDidUninstall.event(({ pluginId, reason, displayName, restorable }) => {
    // 'update'（E6#11c）→ 旧实例退场不发「已禁用」toast、不给「撤销→启用」动作——更新完成由
    // onDidInstall 侧接报；同插件的卸载/禁用才有 撤销 语义
    if (reason === "update") return;
    const name = displayName ?? pluginId;
    // E6#73h（D3）：全句 + 动作标签走 i18n（此前整段硬编码中文——英文界面下中英混排）
    const msg = reason === "uninstall"
      ? i18n.t("已卸载：{{name}}", { name })
      : i18n.t("已禁用：{{name}}", { name });
    // E6#18c：卸载的 撤销 只在保留可恢复副本（restorable，app 树 .disabled 坟场）时给——userData 家
    // 卸载 = 目录真删 + removed 墓碑，无副本可撤销（死钮）；真恢复 = 市场/手装 zip（#18 拍板 ④）。
    // 禁用恒可撤销（enable 恢复状态即可）。consumer 端 3 是本处 toast 唯一源（uninstallPlugin 不再自弹）。
    pushToast({
      message: msg,
      source: pluginId,
      severity: "info",
      ttl: TOAST_TTL_ERROR,
      actions:
        reason === "uninstall"
          ? restorable
            ? [{ label: i18n.t("撤销"), isPrimary: true, onClick: () => {
                // 动态 import 避免循环依赖
                import("../loader").then((m) => m.reinstallPlugin(pluginId))
                  .catch((e) => notifyUndoFailed(pluginId, name, e));
              }}]
            : undefined
          : [{ label: i18n.t("撤销"), isPrimary: true, onClick: () => {
              import("../loader").then((m) => m.enablePlugin(pluginId))
                .catch((e) => notifyUndoFailed(pluginId, name, e));
            }}],
    });
  });

  /* ─── 消费端 5：视图刷新通知（CustomEvent + 版本标记双保险） ─── */

  PluginLifecycle.onDidUninstall.event(() => { notifyPluginViews(); });
  PluginLifecycle.onDidInstall.event(() => { notifyPluginViews(); });

  /* ─── 消费端 6：IPC 广播——安装/卸载通知到唯一 Pool（E5.7#83） ─── */

  // plugin:installed / plugin:uninstalled 带 pluginId 载荷——池侧按插件精确反应
  // （全量刷新走泛化 nudge plugin-lifecycle:changed；本通道供按插件消费方）。
  // 链：壳 events.emit → 主进程 onPluginEmit → broadcast → 池 events.on（同 plugin:installProgress）。
  // 只在 install/reinstall/uninstall/update 触发——enable/disable/startup 是状态切换非装卸，不进。
  PluginLifecycle.onDidInstall.event(({ pluginId, manifest, reason }) => {
    // 'update'（E6#11c）= 新版替换落盘完成——也是"装上"，并入 plugin:installed 让消费方刷新版本
    if (reason !== "install" && reason !== "reinstall" && reason !== "update") return;
    try {
      window.linkdesk?.events?.emit("plugin:installed", {
        pluginId,
        version: manifest?.version,
        reason,
      });
    } catch { /* 广播失败不阻塞生命周期 */ }
  });

  PluginLifecycle.onDidUninstall.event(({ pluginId, reason }) => {
    if (reason !== "uninstall") return;
    try {
      window.linkdesk?.events?.emit("plugin:uninstalled", { pluginId, reason });
    } catch { /* 广播失败不阻塞生命周期 */ }
  });
}

/**
 * 卸载/禁用前通知壳关闭相关标签页 + 侧栏视图（E5.8#12 移自消费端 4）。
 * 🔥 必须在本插件的 onWillUninstall.fire() 之前调用——App/lifecycle.ts 的
 * revertContainerIfCurrent 要读 getViewPlugin(pluginId).manifest（viewRegistry 还在）。
 * tracker 回滚在 fire 内自动删除 viewRegistry 条目——若先 fire 再通知，侧栏回退会静默失效。
 */
export function notifyPluginRemoved(pluginId: string): void {
  window.dispatchEvent(new CustomEvent(CUSTOM_EVENTS.PLUGIN_REMOVED, { detail: { pluginId } }));
}

/* ── 图标排序辅助（和 loader.ts 共享——放在这里归一化） ── */

/**
 * B72/B77 归一化：图标排序更新——"append" 追加到末尾，"remove" 从列表中移除。
 * 同步写内存缓存——确保 React 渲染前生效。
 */
function updateIconOrder(pluginId: string, mode: "append" | "remove"): void {
  try {
    const order = getPluginStateValue<string[]>(APP_PLUGIN_ID, "iconOrder") ?? [];
    const filtered = order.filter((id) => id !== pluginId);
    if (mode === "append") filtered.push(pluginId);
    setPluginStateValueSync(APP_PLUGIN_ID, "iconOrder", filtered);
    // 异步落盘——不阻塞
    import("../../core/services/plugins/PluginStateService").then(({ setPluginStateValue }) => {
      setPluginStateValue(APP_PLUGIN_ID, "iconOrder", filtered).catch((e) => { console.error("[lifecycle] 保存图标排序失败:", e); });
    });
  } catch { /* 非关键路径 */ }
}
