/**
 * AI 确认卡载荷（2026-11-25 · 弹窗族归一 v5）。
 *
 * 三个 AI 权限弹窗（敏感动作 / 提权 / 完全访问二次确认）共用**同一张卡**：
 *   HEADER（动作名+一句后果）/ TARGET（对象或档位变化）/ DETAIL（可选表格）/ AI NOTE（仅 AI 发起）/
 *   FOOT NOTE（责任说明，按钮左侧）/ ACTIONS。
 *
 * 🔴 主进程没有 i18n：载荷里所有 `*Key` 都是 i18n key，由池侧 `useTranslation()` 翻译。
 *    `aiReason` 是 AI 提供的原文（用户数据），⛔ 不翻译。
 * 🔴 这是**呈现载荷**，不是判定：档位/风险/是否放行仍在壳（`policy/`），卡片只画与收集点头。
 */

/** 卡片种类——只影响文案槽位与配色，不改变确认语义 */
export type AiConfirmKind = "action" | "elevation" | "full";

/** 表格一行（「现在 → 之后」；tone 决定右侧颜色） */
export interface AiConfirmRow {
  labelKey: string;
  /** 二选一：i18n key 或原样文本（用户数据） */
  fromKey?: string;
  fromText?: string;
  toKey?: string;
  toText?: string;
  tone?: "allow" | "ask" | "deny" | "plain";
}

export interface AiConfirmTarget {
  /** 单字符图标（不是 emoji；如 ▤ / ◈ / ⇧） */
  icon: string;
  /** 单行标题：二选一 */
  titleKey?: string;
  titleText?: string;
  /** 档位变化专用：当前档 / 目标档（i18n key） */
  fromKey?: string;
  toKey?: string;
  /** 第二行说明：二选一 */
  metaKey?: string;
  metaText?: string;
  /** 右上角徽标（i18n key，如「可撤销」「需你批准」） */
  chipKey?: string;
}

export interface AiConfirmCardPayload {
  kind: AiConfirmKind;
  titleKey: string;
  subtitleKey?: string;
  target: AiConfirmTarget;
  /** 可选「现在 → 之后」表格（提权/安装类用）；敏感动作不需要 */
  rows?: AiConfirmRow[];
  /** AI 提供的原因原文——只有 AI 发起的请求才有；手动操作时为空 */
  aiReason?: string;
  /** 后果说明（固定文案，i18n key） */
  effectKey?: string;
  /** 责任说明（固定文案，i18n key）——渲染在按钮左侧 */
  responsibilityKey: string;
  confirmKey: string;
  cancelKey: string;
  /** 完全访问 = 红色警示（含顶部高危条与大号圆点） */
  danger?: boolean;
  /** 完全访问的后果条目（i18n key 列表） */
  consequences?: string[];
}

/** DialogHost 的宿主视图 id（与安装卡的 `plugin-install-confirm` 同级） */
export const AI_CONFIRM_HOST_VIEW = "ai-confirm";

/** 传输包装：`dialog:confirm` 的富内容形态（沿用既有通道，⛔ 零新 IPC） */
export interface AiConfirmDialogRequest {
  hostView: typeof AI_CONFIRM_HOST_VIEW;
  payload: AiConfirmCardPayload;
}
