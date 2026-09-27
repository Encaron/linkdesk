/**
 * E6#30.14b 壳 Badge/Capsule 基础件——小圆角徽标/胶囊（对标 VS Code badge，如详情页「内置」chip）。
 *   色走既有 --badge-background/--badge-foreground（= accent/on-accent 别名，主题可经 colorway 覆盖）；
 *   圆角 var(--radius-sm) / 字号 var(--font-size-2xs)（硬约束 1/6）。壳只给形状基础件——
 *   业务内容（文案/数据）由调用方决定（10-市场UI拥有权.md §四·二「数据自 catalog」）。
 *   消费方：marketplace 详情「内置」chip（mpd-badge-core 收编，E6#30.14b）。
 */
import type { ReactNode } from "react";
import { HINT_ATTR, HINT_DELAY_ATTR } from "../hint-tip/hintAttrs";
import "./Badge.css";

interface BadgeProps {
  children: ReactNode;
  /** 悬停提示（如完整值，超长截断场景） */
  title?: string;
}

function Badge({ children, title }: BadgeProps) {
  // 徽标上的 hint 一律是**揭示类**（文案 = 被截断的完整值）⇒ 延时归零，不等那 120ms（写法规约 §13 纪律一）。
  // 属性名走 `hintAttrs` 单一真相源——⛔ 别在这里写 "data-hint" 字面量。
  const hint = title ? { [HINT_ATTR]: title, [HINT_DELAY_ATTR]: "0" } : null;
  return (
    <span className="ldk-badge" {...hint}>
      {children}
    </span>
  );
}

export default Badge;
