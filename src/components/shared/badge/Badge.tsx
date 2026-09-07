/**
 * E6#30.14b 壳 Badge/Capsule 基础件——小圆角徽标/胶囊（对标 VS Code badge，如详情页「内置」chip）。
 *   色走既有 --badge-background/--badge-foreground（= accent/on-accent 别名，主题可经 colorway 覆盖）；
 *   圆角 var(--radius-sm) / 字号 var(--font-size-2xs)（硬约束 1/6）。壳只给形状基础件——
 *   业务内容（文案/数据）由调用方决定（10-市场UI拥有权.md §四·二「数据自 catalog」）。
 *   消费方：marketplace 详情「内置」chip（mpd-badge-core 收编，E6#30.14b）。
 */
import type { ReactNode } from "react";
import "./Badge.css";

interface BadgeProps {
  children: ReactNode;
  /** 悬停提示（如完整值，超长截断场景） */
  title?: string;
}

function Badge({ children, title }: BadgeProps) {
  return (
    <span className="badge" title={title}>
      {children}
    </span>
  );
}

export default Badge;
