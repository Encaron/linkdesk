/**
 * 分节副标题件（M4 `AI#38.12` · P-3 拍板 A）——**通用原语**（`@linkdesk/ui`，任何插件可 import）。
 *
 * 用途：分区大标题 / 分节小标题（`group`）下面的一行说明小字——设置页从
 * configuration contribution 的 `subtitle` / `groupDescriptions` 读到即渲染（零侵入：
 * 未声明 = 不渲染）。🔴 就是文字（不做可点，用户拍板「控件形态尽量基础」）。
 */
import type { ReactNode } from "react";
import "./SectionSubtitle.css";

interface SectionSubtitleProps {
  children: ReactNode;
}

function SectionSubtitle({ children }: SectionSubtitleProps) {
  if (children === null || children === undefined || children === "") return null;
  return <div className="ldk-section-subtitle">{children}</div>;
}

export default SectionSubtitle;
