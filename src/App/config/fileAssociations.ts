/**
 * 「默认打开方式」配置组声明——壳注册第三配置贡献（pluginId `file-associations`，标题「默认打开方式」）。
 *
 * 是什么：文件打开方式管理器（设置页第二入口）的**声明位**——本组只声明**一个键**
 * （`workbench.fileAssociations`，即 D1 用户覆盖表本身），且该键带 `uiHint: "fileAssociationsManager"`。
 * 设置插件（官方 `settings`）见到这个 hint 就把**整组**渲染成自定义管理视图（竞争类型区＋按插件浏览区），
 * 组内行无配置键——这是 T2 §T2.6 的落点，先例 = `uiHint:"image"` 的 `app.backgroundImage`
 * （宿主声明 → 渲染方画 UI）。
 *
 * 🔴 为什么能注册这个键（第 4 波口径更新，否掉 D1 的「v1 不展示」）：D1 要防的是**泛型设置行**
 *   再画一份覆盖表（第二处真相源）。挂了 `fileAssociationsManager` 之后，泛型行的兜底编辑器
 *   （`ObjectEditor`）**永远轮不到它**——渲染方只有管理器一间；未知该 hint 的第三方设置插件走
 *   `UnknownHintControl`（只读展示），也不会落进可编辑框。⇒ 注册只换来「管理器有了合法挂载位」，
 *   D1 的原意（⛔ 不出现第二处写入面/第二处真相源）一字未动。
 *
 * 🔴 写面不在本组：覆盖表的写入唯一入口 = `fileAssociation.setDefault` / `.setDefaultBulk`
 *   （壳 IpcBridgeHandler → ConfigurationService 单写者）。本声明**不带 onApply**——它不是「被应用的值」，
 *   是「管理器这个视图」的挂载键（对标 `app.update.*` 的纯存储形态）。
 *   读面 = 主进程 registry-handlers 平键直读 settings.json（storage-handlers 同款先例）。
 *
 * 自 startup.ts 拆出（结构对标 config/appearance.ts）；t() 注入而非模块级捕获——
 * 语言切换重跑（HMR/StrictMode）时注册文案取首语言。
 */
import { registerConfiguration } from "../../core/registry/ConfigurationRegistry";
import { WORKBENCH_FILE_ASSOCIATIONS_KEY } from "../../core/services/files/FileAssociationService";

/** t() 类型——仅声明组取 key（同 config/appearance.ts） */
type ConfigT = (key: string) => string;

export function registerFileAssociationConfiguration(t: ConfigT): void {
  registerConfiguration("file-associations", {
    title: t("默认打开方式"),
    // 组副标题（contribution 级可选字段，一行小字）——说清「谁和谁同写一个真源」，
    // ⛔ 不写机制口诀（下拉写覆盖表那套进作者文档，用户界面只说结果）。
    subtitle: t("单击文件时由哪个插件打开——文件树右键「打开方式」与本页同写一处，两边即时互见"),
    properties: {
      [WORKBENCH_FILE_ASSOCIATIONS_KEY]: {
        type: "object",
        // 🔴 本键的**唯一**作用 = 把这组交给管理器渲染（见文件头）。组内不画泛型行 ⇒ 无「行标签」，
        //    故 title/description 只服务于「第三方设置插件/搜索索引」这两处兜底展示面。
        uiHint: "fileAssociationsManager",
        title: t("默认打开方式"),
        description: t("按类型或按插件管理文件的默认打开方式——「恢复自动」= 交回插件声明顺序"),
        default: {},
      },
    },
  });
}
