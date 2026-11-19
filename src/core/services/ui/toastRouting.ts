/**
 * Toast 呈现路由——轻 Toast（TransientToast）的降级判据纯函数。
 *
 * 正典：底部Toast轻提示/01-API与组件契约.md §三（降级规则）＋ 02-边界清单.md §A/B/C 表。
 * 「客户端自动降级，不由调用方决定」——调用方只表达意图（我要一条轻提示），
 * 落在哪个面由本函数按内容判定；⛔ 调用方自己预判后改走 notifications（那是第二把尺）。
 *
 * 零 React 零依赖——单测直测（toastRouting.test.ts 覆盖 02 表 B1–B15 全行）；
 * panel 侧将来要复用同一判据时也 import 这里（⛔ 复制第二份规则）。
 */

/** 文本阈值常量（01 契约 §七·1：集中为常量，⛔ 散在组件里）——超过即整条降级面板（B3）。 */
export const TOAST_MAX_VISUAL_LEN = 96;

/** ttl 缺省与夹取区间（01 契约 §二：缺省 3000，夹取 [1500,10000]；≥8000 降级面板 B14）。 */
export const TOAST_TTL_DEFAULT = 3000;
export const TOAST_TTL_MIN = 1500;
export const TOAST_TTL_MAX = 10000;
/** 「用户想看一会儿」的降级线（B14）——显式 ttl 达到即走面板。 */
export const TOAST_TTL_PANEL_THRESHOLD = 8000;

/**
 * 宽字符判定——CJK 表意区（设计稿 05 的同一正则）＋ emoji/符号区（02 表 B6：
 * 「emoji/组合字符记 2 单位」。设计稿正则漏了 emoji 区段，按边界正典补齐——
 * u 旗标 + 码点区段：表意/兼容表意/全角形 + emoji 主区 + 箭头与杂项符号 + 旗帜区）。
 */
const WIDE_CHAR =
  /[\u2E80-\u9FFF\uF900-\uFAFF\uFF00-\uFFEF\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{1F1E6}-\u{1F1FF}\u{2190}-\u{21FF}\u{2B00}-\u{2BFF}]/u;

/**
 * 视觉宽度——CJK/emoji 记 2、其余记 1（02 表 B5/B6）。
 * 判据口径与 UI 显示无关：只用于 B1–B3 的三道坎（≤48 一行 / ≤96 两行 / >96 降级）。
 */
export function visualLen(s: string): number {
  let n = 0;
  for (const ch of s) n += WIDE_CHAR.test(ch) ? 2 : 1;
  return n;
}

/** 合法 severity 集合——契约只收 info/success/warning（error 走降级，见 01 §二注）。 */
const KNOWN_SEVERITIES = new Set(["info", "success", "warning", "error"]);

/**
 * 降级路由（01 契约 §三表，逐条对应）：
 *   ① severity === "error" → panel（B12：错误需要留存与诊断）
 *   ② actionCount > 1 → panel（B9：Toast 最多 1 个动作）
 *   ③ visualLen > 96 → panel（B3：超两行——⛔ 截断、⛔ 缩字号、⛔ 滚动）
 *   ④ 显式换行行数 > 2 → panel（B4，同 ③）
 *   ⑤ ttl ≥ 8000 → panel（B14：用户设置的长时说明「要看一会儿」）
 *   ⑥ 其余 → toast
 *
 * @param severity 非法值按 info 处理并 console.warn（B13 防御——warn 是防御输出，不算业务 IO）
 */
export function decidePresentation(input: {
  message: string;
  severity?: string;
  actionCount?: number;
  ttl?: number;
}): "toast" | "panel" {
  const { message } = input;
  const severity = input.severity ?? "info";
  const actionCount = input.actionCount ?? 0;
  const ttl = input.ttl;

  if (!KNOWN_SEVERITIES.has(severity)) {
    // B13：未知 severity 按 info 处理并出声——静默吞掉非法值 = 生产者拿着错severity不自知
    console.warn(`[toastRouting] 未知 severity "${severity}"，按 info 处理`);
  }
  if (severity === "error") return "panel";
  if (actionCount > 1) return "panel";
  if (visualLen(message) > TOAST_MAX_VISUAL_LEN) return "panel";
  const explicitLines = message.split("\n").length;
  if (explicitLines > 2) return "panel";
  if (typeof ttl === "number" && ttl >= TOAST_TTL_PANEL_THRESHOLD) return "panel";
  return "toast";
}

/**
 * ttl 规范化（B15）——夹取 [1500, 10000]；undefined/NaN → 缺省 3000。
 * 与 decidePresentation 分离：夹取是**参数规范化**（怎么存），降级是**路由判定**（去哪个面），
 * 两条正典各管一段；先夹取再判定（夹取后的值才进 B14 的 ≥8000 比对）。
 */
export function clampTtl(ttl?: number): number {
  if (typeof ttl !== "number" || Number.isNaN(ttl)) return TOAST_TTL_DEFAULT;
  return Math.min(TOAST_TTL_MAX, Math.max(TOAST_TTL_MIN, ttl));
}
