/**
 * HintTip 属性契约——**单一真相源**（04「悬停提示系统」件 1）。
 *
 * 属性名只在这里写一遍：组件门面（`HintTip.tsx`）写、池内渲染器（`HintTipRenderer.tsx`）读、
 * 作者面文档（`03-插件制造/05-插件UI写法规例.md` §12）与 SDK 门禁（`no-native-title`）引用同一批字面量。
 * ⛔ 别处不许再写 `"data-hint"` 字面量——那是「两把尺子必然漂移」的经典入口。
 *
 * ── 为什么是属性式（设计详案 §二·②）──
 * 零新 `window.linkdesk.*` API、零新 IPC、零新 `contributes.*` ⇒ 整套契约面（d.ts / preload /
 * IpcBridgeHandler / api-cheatsheet）都不需要动；插件在自己 DOM 上写属性即可，**不需要 import 壳任何东西**
 * （插件独立铁律）。组件式（`<HintTip>`）只是这套属性的糖，见 `HintTip.tsx`。
 */

/** 提示主文案（说明类与揭示类通用——文案永远由调用方给，壳不下发任何用户可见句子） */
export const HINT_ATTR = "data-hint";
/** 命令 id——渲染器据此查壳推的命令表，取 label（当 title）＋快捷键 */
export const HINT_COMMAND_ATTR = "data-hint-command";
/* ⛔ 没有 `data-hint-note`（第二行注脚）——「注脚」是**案 C 的骨相**，用户 2026-09-27
   拍板选案 A 紧凑条（单行）⇒ B/C 不实现（参考图留档对照，规格卡已收敛成单一取值）。
   需要注脚的说明请用 `HintCard`（它本来就是管"有注脚的长说明"的那一件）——
   ⛔ 别在本件加回来：加回来 = 现场推翻已拍板的档位，且立刻多一个 i18n/门禁面。 */
/** 意图延时覆盖（毫秒，可选）——揭示类传 `"0"`（「看全被截断的字」要立刻，不该等） */
export const HINT_DELAY_ATTR = "data-hint-delay";
/** 首选方位覆盖（可选，`top` / `bottom` / `left` / `right`；缺省 `top`，贴不下自动翻面） */
export const HINT_PLACEMENT_ATTR = "data-hint-placement";

/** 委托监听的命中选择器——由上面两个字面量拼出，⛔ 不另写一份 */
export const HINT_SELECTOR = `[${HINT_ATTR}],[${HINT_COMMAND_ATTR}]`;

/**
 * 说明类默认意图延时（ms）——**比 `HintCard` 的 400ms 短**。
 * 依据：卡是「看一眼就走」的说明卡（防划过闪一下是首要目标）；条是跟手的轻提示
 * （用户要的是"别挡路但也别让我等"）。⛔ 不要往 400ms 对齐——那是另一件东西的节奏。
 * ⚠️ 具体值属体感判断（设计详案 §十一·3）：dev 实机试过才算数。
 */
export const DEFAULT_OPEN_DELAY_MS = 120;
