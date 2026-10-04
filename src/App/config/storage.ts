/**
 * 「存储」声明——并入「通用」组（同 pluginId 二次注册 merge，对标 config/update.ts；
 * 04-软件更新/已落地/设置页-打开缓存目录 阶段 3，2026-10-03 定稿）。
 *
 * 🆕 **设置行案 D3（2026-10-04）＝ 两行并成一行**：`app.storage.openCacheDir` 一键同载
 *   「打开」动作 ＋「缓存在哪」只读读数（伴生声明正交化——01 §1.2 表第 ③ 行 `[按钮][只读路径]`）：
 *     · 主件 = `renderHint:"action"` ＋ `actionCommand: "storage.openCacheDir"`（按钮文案 = `description`）；
 *     · 伴生 = `statusCommand: "storage.cacheDirStatus"` ⇒ 按钮**右侧同排**一行等宽路径。
 *   🔴 合并行标题 = **主键名**（⛔ 不发明新名字）⇒ 行标签照旧是 `app.storage.openCacheDir`；
 *     而按钮文案与行说明**共用同一个 `description`** ⇒ 它必须短（长句会把按钮撑成横条）——
 *     原只读行那句「缓存目录——缓存文件实际存放的位置（只读，软件内不可改）」随键退役，不再复用。
 *
 * 🔴 **退役键（D3 合并的另一半）：`"app.storage.cacheDir"` 已不再声明**（旧两行版的 ② 行）。
 *   「退役**不腾位**」——它照旧留在宿主保留面账 `configKeys` 栏（**本 JSDoc 里的这处双引号字面量
 *   就是生成器的扫描点**，见 gen-host-reserved.mjs ②；登记见 scripts/host-reserved.json 的
 *   `retired[]`）。运行时真活口 = 主进程 `resolveEffectiveCacheDir()`
 *   （读 settings.json 平键，`electron/ipc/handlers/storage-handlers.ts`）——设置界面不再直读它，
 *   改读 `storage.cacheDirStatus` 命令（**取不抄**：解析唯一入口仍在主进程，落点契约铁律 3）。
 *
 * 🔴 软件内**没有「改缓存地址」这回事**（2026-10-02 用户澄清）：⛔ 不写 `uiHint:"directory"`——
 *   那等于「能改」，会画出可编辑路径框 ＋「选择文件夹」。将来真要改地址只在安装器侧（播种）。
 *   ⇒ 键值恒空字符串 = 「用默认位置」；`storage.cacheDirStatus` 运行时给**当前生效**路径。
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
      // 合并行（D3）——主件 = 动作按钮（actionCommand 落点 = 壳命令 storage.openCacheDir）
      //   伴生 = 只读路径（statusCommand 落点 = 壳命令 storage.cacheDirStatus，运行时读数、⛔ 不写死字符串）
      "app.storage.openCacheDir": {
        type: "string",
        group: t("存储"),
        default: "",
        renderHint: "action",
        actionCommand: "storage.openCacheDir",
        statusCommand: "storage.cacheDirStatus",
        title: t("缓存目录"),
        description: t("打开缓存目录"),
      },
    },
  });
}
