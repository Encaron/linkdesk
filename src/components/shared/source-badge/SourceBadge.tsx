/**
 * SourceBadge——配置值的**来源**徽标（E5.8#87/#88 来源徽标的视觉收编）。
 *
 * 与 `EffectiveBadge` **分开两件**（D10 拍板）：一件答「这个值是谁写的」（来源），
 * 一件答「实际生效成什么」（生效 token 值）——两个问题、两份数据源，⛔ 不合并成一个多变种组件。
 *
 * 判据 C 同款分工：**判定不住这里**（来源是宿主按 `sourceKey`/基准种子/外观模式推出来的读数，
 * 随配置读面一起给），本件只把「哪种来源」画成徽标。
 *
 * 🔴 文案由**调用方**传（`label`，已 `t()`）——共享件零中文（硬约束 2）。
 * 图标（codicon 名）是**标识符不是 UI 文字**，由本件按来源定；第三方要换图标请提需求，
 * ⛔ 别在这里开 props 口子（一开口子就没收编了）。
 *
 * 降噪（E5.8#99 #6）：`theme`（跟随主题 = 默认态）**不显徽标**——「无徽标 = 主题来源」，
 * 清除覆盖后徽标消失即「一眼可见回主题」。故 props 只收可显示的两种来源；
 * 三值域（含 `theme`）仍由 `SourceBadgeSource` 表达，供宿主判定面与调用方显隐逻辑使用。
 */
import { HINT_ATTR } from "../hint-tip/hintAttrs";
import "./SourceBadge.css";

/** 来源域——宿主的读数语义（含默认态 `theme`）；⛔ 与 `EffectiveBadge` 的「生效值」不是一回事 */
export type SourceBadgeSource = "theme" | "user" | "mix";

/** 可显徽标的来源（降噪：`theme` 不显） */
export type SourceBadgeKind = Exclude<SourceBadgeSource, "theme">;

/** codicon 图标名（标识符，随 currentColor 主题化）——来源 → 图标，一处定义 */
const SOURCE_GLYPHS: Record<SourceBadgeKind, string> = {
  user: "codicon-edit",
  mix: "codicon-arrow-swap",
};

export interface SourceBadgeProps {
  /** 来源种类（可显示的两种；`theme` 由调用方自行不渲染） */
  source: SourceBadgeKind;
  /** 徽标文案（调用方 `t()` 已译，如「来源：用户覆盖」）——同时用作悬停提示 */
  label: string;
}

function SourceBadge({ source, label }: SourceBadgeProps) {
  // 属性名走 hintAttrs 单一真相源——⛔ 别在这里写 "data-hint" 字面量（与 Badge 同款纪律）
  const hint = { [HINT_ATTR]: label };
  return (
    <span className={`ldk-source-badge ldk-source-badge--${source}`} {...hint}>
      <span className={`codicon ${SOURCE_GLYPHS[source]}`} aria-hidden="true" />
      {label}
    </span>
  );
}

export default SourceBadge;
