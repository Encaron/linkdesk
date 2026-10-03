/**
 * 「存储」两键声明——并入「通用」组（同 pluginId 二次注册 merge，对标 config/update.ts；
 * 04-软件更新/待抉择池/设置页-打开缓存目录 阶段 3，2026-10-03 定稿）。
 *
 * 本轮只落两行（照主图 08-设计图-设置页-减法版.html）：
 *   · `app.storage.openCacheDir`——**按钮行**（`renderHint:"action"` ＋ `actionCommand`；
 *     按钮文案 = `description`「打开缓存目录」——action 行只有这一个字符串可承载文案，
 *     先例 `config/aiBridge.ts` 的 `ai.mcp.openDetails`）。点了开**普通资源管理器窗口**（非模态）。
 *   · `app.storage.cacheDir`——**只读显示**（`renderHint:"readonly"` ＋ `statusCommand`），
 *     就地看见缓存现在在哪（用户长期诉求：「我很长时间不知道缓存文件放在哪里」）。
 *
 * 🔴 行序＝**按钮在上、只读在下**（2026-10-03 用户令对调）——与 aiBridge 那 5 组「状态行在前」
 *   的先后**相反，是有意为之**（先给动作、路径作说明）；顺序一旦落代码即视为定版，⛔ 别再动
 *   （跨态／跨版位置不轻易换，memory `ui-cross-state-invariance`）。
 *
 * 🔴 软件内**没有「改缓存地址」这回事**（2026-10-02 用户澄清）：⛔ 不写 `uiHint:"directory"`——
 *   那等于「能改」，会画出可编辑路径框 ＋「选择文件夹」。将来真要改地址只在安装器侧（播种）。
 *   ⇒ 键值恒空字符串 = 「用默认位置」；`storage.cacheDirStatus` 运行时给**当前生效**路径
 *   （解析唯一入口 = 主进程 storage-handlers，取不抄——落点契约铁律 3）。
 *
 * ⏸ 规格全留、本轮不落（不做 ≠ 作废）：「已用空间」`app.storage.used`（readonly＋3s 轮询）·
 *   「清除缓存」`app.storage.clear`（白名单只删可再生 ≈14.6 MB）· 齿轮声明项（本轮齿轮一项都不加）
 *   · 注册表种子链（上游＝安装器播种，已搬 ../安装器-更多配置/）。见本夹 01/02/05。
 *
 * 自 startup.ts 拆出（结构对标 config/update.ts）：t() 注入而非模块级捕获——语言切换重跑
 * （HMR/StrictMode）时注册文案取首语言。
 */
import { registerConfiguration } from "../../core/registry/ConfigurationRegistry";
import { APP_PLUGIN_ID } from "../../core/services/plugins/PluginStateService";

/** t() 类型——仅声明组取 key（同 config/update.ts） */
type ConfigT = (key: string) => string;

export function registerStorageConfiguration(t: ConfigT): void {
  registerConfiguration(APP_PLUGIN_ID, {
    title: t("存储"),
    properties: {
      // ① 按钮行（在上）——actionCommand 落点 = 壳命令 storage.openCacheDir（storageCommands.ts）
      "app.storage.openCacheDir": {
        type: "string",
        group: t("存储"),
        default: "",
        renderHint: "action",
        actionCommand: "storage.openCacheDir",
        description: t("打开缓存目录"),
      },
      // ② 只读路径行（在下）——statusCommand 落点 = 壳命令 storage.cacheDirStatus（运行时读数，⛔ 不写死字符串）
      "app.storage.cacheDir": {
        type: "string",
        group: t("存储"),
        default: "",
        renderHint: "readonly",
        statusCommand: "storage.cacheDirStatus",
        description: t("缓存目录——缓存文件实际存放的位置（只读，软件内不可改）"),
      },
    },
  });
}
