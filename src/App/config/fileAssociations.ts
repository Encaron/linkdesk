/**
 * 「默认打开方式」配置组声明——壳注册第三配置贡献（pluginId `file-associations`，标题「默认打开方式」）。
 *
 * 是什么：本组三个键、**两类形态**（C3c 形态改判，2026-10-06）：
 *   ① **挂载键** `workbench.fileAssociations`（＝D1 用户覆盖表本身）带 `uiHint: "fileAssociationsManager"`
 *      ——设置插件（官方 `settings`）见到这个 hint 就把**该组**渲染成自定义管理视图（竞争类型区＋
 *      按插件浏览区），组内行无配置键。这是 T2 §T2.6 的落点，先例 = `uiHint:"image"` 的
 *      `app.backgroundImage`（宿主声明 → 渲染方画 UI）。**不认识该 hint 的渲染器不渲染这一行**
 *      ——它是**隐藏位 hint**（C2b 定案）；名单见共享层 `SETTINGS_HIDDEN_HINTS`（正典一处，任何渲染器同读）。
 *   ② **OS 跟随开关** `app.osAssociations.followPlugins` **摘掉 hint**、改声明
 *      `group: t("系统「打开方式」登记")` ⇒ 任何渲染器按**通用布尔行**渲染，落在本组底部的二级子节下。
 *      🔴 D6 **翻案登记**（2026-10-06 用户改判）：原拍板是「OS 块降级为本组底部**折叠块**」
 *      （2026-10-04/05），现改判**二级子节**——「折叠块里塞通用行」的机械麻烦、以及「开关被折起来
 *      看不见」的混淆顾虑，改由**子节标题＋该行 description**承担（用户界面只说结果）。原
 *      `OsFollowBlock` 随之退役、不迁（共享化案阶段 1.2）。
 *   ③ `app.osAssociations.overrides`（稀疏例外表）**维持 hint**：v1 无界面是刻意决定，
 *      摘了 hint 反而让它落进 `ObjectEditor` 可编辑兜底＝新开一处写入面。
 *
 * 🔴 为什么能注册覆盖表键（第 4 波口径更新，否掉 D1 的「v1 不展示」）：D1 要防的是**泛型设置行**
 *   再画一份覆盖表（第二处真相源）。挂了 `fileAssociationsManager` 之后，泛型行的兜底编辑器
 *   （`ObjectEditor`）**永远轮不到它**——渲染方只有管理器一间；未知该 hint 的第三方设置插件
 *   按隐藏位语义**整行不画**，也不会落进可编辑框。⇒ 注册只换来「管理器有了合法挂载位」，
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
import {
  OS_ASSOCIATIONS_FOLLOW_PLUGINS_KEY,
  OS_ASSOCIATIONS_OVERRIDES_KEY,
  WORKBENCH_FILE_ASSOCIATIONS_KEY,
} from "../../core/services/files/FileAssociationService";

/** t() 类型——仅声明组取 key（同 config/appearance.ts） */
type ConfigT = (key: string) => string;

export function registerFileAssociationConfiguration(t: ConfigT): void {
  registerConfiguration("file-associations", {
    title: t("默认打开方式"),
    // 组副标题（contribution 级可选字段，一行小字）——说清「谁和谁同写一个真源」，
    // ⛔ 不写机制口诀（下拉写覆盖表那套进作者文档，用户界面只说结果）；⛔ 零插件名（C3d 泛称版）。
    subtitle: t("单击文件时由哪个插件打开——与文件右键菜单的「打开方式」同写一处，即时互见"),
    properties: {
      [WORKBENCH_FILE_ASSOCIATIONS_KEY]: {
        type: "object",
        // 🔴 本键的**唯一**作用 = 把管理器这个视图挂上去（见文件头）。它自己**没有行**：
        //    认识的渲染器画管理器、不认识的按隐藏位语义整行不画 ⇒ title/description 只服务于
        //    「搜索索引」这处兜底展示面。
        uiHint: "fileAssociationsManager",
        title: t("默认打开方式"),
        description: t("按类型或按插件管理文件的默认打开方式——「恢复自动」= 交回插件声明顺序"),
        default: {},
      },
      // ── T6（第 5 波）：OS 登记跟随插件（下折块两键，D6 定形态）──
      // 🔴 归属：D6 钉死「OS 块归**本组**」——故两项声明在本贡献点（同一个 `file-associations`
      //    组）里，由通用渲染引擎按 `group` 分节画出（⛔ 不放「通用 → 系统集成」节：
      //    那是安装器静态三项 `app.osIntegration.*` 的地盘，两者是静态半/动态半的分工，别混）。
      // 🔴 写面：两项都**不带 onApply**——真正干活的是主进程同步模块
      //    （`electron/services/os-associations-sync.ts`，触发点 = 插件装/卸 + 本键配置变化）。
      //    总开关在这里只是一个布尔值，落盘后由主进程平键直读（同覆盖表那套读法）。
      [OS_ASSOCIATIONS_FOLLOW_PLUGINS_KEY]: {
        type: "boolean",
        // 🔴 C3c 形态改判：**不挂 hint** ⇒ 落到通用布尔行（谁渲染都能操作，含不认识管理器 hint 的
        //    第三方渲染器——那是本案「最低保证」的可操作半）；`group` 把它归进本组底部的二级子节。
        group: t("系统「打开方式」登记"),
        title: t("跟随插件登记"),
        description: t(
          "插件装了就把它的文件类型加进系统「打开方式」，卸载就撤掉；关掉=停止登记并撤回运行期加的类型（安装包自带的类型不动，本页的默认设置不受影响）"
        ),
        default: true,
      },
      // 稀疏例外表：`{".pdf": false}` = 这一个类型不跟随。v1 无界面（本键⛔ 不画行——上面那个总开关
      // 是通用行，不在管理器里），留给将来高级位——故 title/description 同样只服务搜索索引这一处
      // 兜底展示面（认识的渲染器画管理器、不认识的整体不画，同挂载键；见 `SETTINGS_HIDDEN_HINTS`）。
      // 🔴 **维持 hint 是刻意的**：摘了它 ⇒ 落进 `ObjectEditor` 可编辑兜底＝新开一处写入面。
      [OS_ASSOCIATIONS_OVERRIDES_KEY]: {
        type: "object",
        uiHint: "fileAssociationsManager",
        title: t("跟随例外"),
        description: t('按类型单独关掉跟随，写法如 {".pdf": false}——无界面项，改配置文件使用'),
        default: {},
      },
    },
  });
}
