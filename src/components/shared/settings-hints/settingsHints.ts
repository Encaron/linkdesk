/**
 * 设置控件词表**正典**（运行时值半边）——「设置控件-词表正典与共享化」判据 B 的落地物。
 *
 * ── 为什么住这一层 ──
 * `uiHint` / `renderHint` 是**宿主声明 ↔ 渲染层**之间的词表。声明的消费方（壳共享控件、
 * 设置插件、第三方设置插件）都要读到**同一份**名单 ⇒ 正典住 `@linkdesk/ui`
 * （判据 A：消费宿主声明的件，必须住在任何声明者与渲染者都取得到的层）。
 *
 * ── 与 contracts 的分工（一案两半，⛔ 别复制第三份）──
 * · **类型**半边住 `@linkdesk/contracts`（`SettingsUiHint` / `SettingsRenderHint`）——那是
 *   生成产物、纯类型、零运行时，写不出 `export const`；壳仓定义点在
 *   `src/core/api/linkdesk-api/types.ts`，随生成器进契约。
 * · **运行时值**半边 = 本件（哨兵两枚 ＋ 名单两枚 ＋ 类型守卫一枚）——`contracts` 给不了值。
 *
 * ── 🔴 本件纪律：纯 TS，零 React、零 DOM、零 @src/ 依赖 ──
 * 壳 core 会**反向 import** 本件（`services/ui/ThemeEngine/constants.ts` re-export 哨兵，
 * 保住插件与老调用方的既有 import 路径；见 02 E4b）。带进任何组件/DOM/宿主耦合，
 * 都会把核心的依赖图污染——共享层唯一的「core ← shared」边只许是这一条，且只许是纯值。
 */
import type { SettingsRenderHint, SettingsUiHint } from "@linkdesk/contracts";

/** 显式「无」哨兵——配置值字面量契约：`__none__` = **绝对无**（背景图无图 / 字体族落系统栈），
 *  与「空串 = 跟随主题」区分两语义（E5.8#87/#158）。跨边界契约：壳 core、共享控件、任何设置插件同读这一份。 */
export const CONFIG_NONE_SENTINEL = "__none__";

/** 混搭来源「跟随主题」哨兵——外观域 mix 来源键的缺省/播种值，也是来源徽标判定里
 *  「域来源未生效」的那一支（`deriveSourceBadge`）。同族跨边界字符串契约，与
 *  `CONFIG_NONE_SENTINEL` 一处一个正典（⛔ 不新开第二个「哨兵件」）。 */
export const MIX_FOLLOW_THEME_SENTINEL = "followTheme";

/** 声明式控件词表——14 枚，与 `SettingsUiHint` 联合类型一一对应（正典表本体见
 *  「设置控件-词表正典与共享化」01 §0.2）。
 *  ⚠️ 加值/改值必须**同笔**动三处：`SettingsUiHint`（contracts）· 本数组 · 作者面 schema description
 *  （轻门禁守同步）；漏一处 = 门禁红。
 *  ⚠️ `fileAssociationsManager`（第 4 波追加，13→14）**不是行内控件**：它声明在「默认打开方式」组的键上，
 *  表示该**整组**由设置插件渲染成「文件关联管理器」自定义视图（组内行无配置键）——渲染方是设置插件。
 */
export const SETTINGS_UI_HINTS: readonly SettingsUiHint[] = [
  "themePicker",
  "select",
  "accentSource",
  "slider",
  "image",
  "fontTone",
  "fontFamily",
  "color",
  "file",
  "directory",
  "fontSize",
  "segmented",
  "stringList",
  "fileAssociationsManager",
];

/** 渲染提示词表——3 枚（`renderHint` 的已知值）。
 *  ⚠️ `"color"` 是阶段 1.1 全量对账补上的第 3 值（壳 `app.accentColor` / `app.glassTint` 已用），
 *  漏了它 = 壳侧收窄类型当场红。 */
export const SETTINGS_RENDER_HINTS: readonly SettingsRenderHint[] = ["readonly", "action", "color"];

/** 名单 Set 化——渲染热路径上每键一次 O(1) 判定 */
const UI_HINT_SET: ReadonlySet<string> = new Set(SETTINGS_UI_HINTS);

/**
 * 词表守卫——「声明的 uiHint 是不是正典认识的形态」。
 *
 * 渲染层降级契约据此分流：**不认识 ⇒ 只读展示当前值 ＋ title 说明**（⛔ 不再落进可编辑文本框，
 * 防裸字符串写穿值域——`app.backgroundImage` 露 `__none__` 那类）。
 *
 * ⚠️ **「没声明」≠「未知」**：`undefined` / `""` 也要先由调用方判成「未声明」，那是大多数键的
 * 正常路径（按 `type` 渲染，一字不动，见 02 E2）。本守卫只管「值在不在正典里」。
 */
export function isSettingsUiHint(v: unknown): v is SettingsUiHint {
  return typeof v === "string" && UI_HINT_SET.has(v);
}
