/**
 * 壳「存储」命令——「打开缓存目录」设置行的数据出口（04-软件更新/已落地/设置页-打开缓存目录 阶段 3）。
 *
 * ## 两条命令
 *
 * | id | 谁发起 | 形态 |
 * |:--|:--|:--|
 * | `storage.openCacheDir` | 设置页「存储」按钮行（`app.storage.openCacheDir` 的 `actionCommand`） | 动作 |
 * | `storage.cacheDirStatus` | 设置页「存储」只读路径行（`app.storage.cacheDir` 的 `statusCommand`） | 只读数据源 |
 *
 * 路径解析与 openPath 全在主进程（`window.linkdesk.storage.*`，壳侧独有面——调用侧全 `?.` 兜底；
 * M4 AI#38.12 通用件同款：
 * 只读行值来自运行时数据源 ⛔ 不写死字符串；解析唯一入口 = storage-handlers，取不抄）。
 * 动作失败 fail-loud 落 console（debug 日志）＋ toast 告知——⛔ 不假装打开成功。
 */

import { registerCommand } from "../../registry/commands/CommandRegistry";
import { APP_PLUGIN_ID } from "../../services/plugins/PluginStateService";
import i18n from "../../../i18n";

export function registerStorageCommands(): void {
  registerCommand(APP_PLUGIN_ID, {
    id: "storage.openCacheDir",
    title: "打开缓存目录",
    category: "首选项",
    description: "在系统资源管理器中打开当前生效的缓存目录（目录不存在时先建再开）",
    params: [],
    handler: async () => {
      try {
        await window.linkdesk?.storage?.revealCache();
      } catch (e) {
        console.error("[storage.openCacheDir] 打开缓存目录失败:", e);
        const { pushToast, TOAST_TTL_ERROR } = await import("../../services/ui/toast");
        pushToast({ message: i18n.t("打开缓存目录失败"), ttl: TOAST_TTL_ERROR });
      }
    },
  });

  registerCommand(APP_PLUGIN_ID, {
    id: "storage.cacheDirStatus",
    title: "缓存目录",
    category: "首选项",
    description: "当前生效的缓存目录路径（只读数据源，供设置页状态行取用）",
    params: [],
    handler: async () => (await window.linkdesk?.storage?.cacheDir()) ?? "",
  });
}
