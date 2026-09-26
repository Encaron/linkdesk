/**
 * ViewSkeleton——内容加载骨架（04「启动过场」④C，2026-09-27）。
 *
 * 替换 PluginComponent 的「加载中...」纯文字 fallback。规格（01-设计 §4.3，与关于页 mockup
 * Frame 3 同一语言）：标题条 + 卡片块 ×2 + 行条 ×4（宽梯度），条高 12 / 间距 8 / 圆角 4。
 *
 * 两条纪律：
 * - **100ms 出现延迟**——本地 chunk 毫秒级，快于阈值根本不出现（不闪）；loaded 即整体卸载。
 * - **零新 i18n**——骨架条 aria-hidden，容器 role="status" + aria-label 复用既有词条「加载中...」。
 *   Path B 红线内纯展示：不 import @src/core/*。
 */
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import "./ViewSkeleton.css";

export function ViewSkeleton(): React.ReactElement | null {
  const { t } = useTranslation();
  // 100ms 延迟——快于阈值不渲染（设计 §4.3 出现延迟），杜绝快加载闪烁
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setVisible(true), 100);
    return () => clearTimeout(timer);
  }, []);

  if (!visible) return null;

  return (
    <div className="ldk-view-skeleton" role="status" aria-label={t("加载中...")}>
      <div className="ldk-view-skeleton-title" aria-hidden="true" />
      <div className="ldk-view-skeleton-card" aria-hidden="true" />
      <div className="ldk-view-skeleton-card" aria-hidden="true" />
      <div className="ldk-view-skeleton-row w100" aria-hidden="true" />
      <div className="ldk-view-skeleton-row w85" aria-hidden="true" />
      <div className="ldk-view-skeleton-row w60" aria-hidden="true" />
      <div className="ldk-view-skeleton-row w85" aria-hidden="true" />
    </div>
  );
}
