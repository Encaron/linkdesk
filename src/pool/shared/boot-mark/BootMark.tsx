/**
 * BootMark——池首帧品牌过场（04「启动过场」④B，2026-09-27）。
 *
 * 首份布局到达前池渲染本组件（pool-main.tsx 的 `!layout` 分支）——主题色底 + 中央 logo，
 * 消灭「半截框架」「图标逐个蹦」的裸露过程。**Path B 红线内纯展示**：不 import @src/core/*。
 *
 * 两条纪律（01-设计 §4.2/§九 5）：
 * - **150ms 延迟出现**——快启动根本看不到它，杜绝「logo 闪一下又没了」；
 * - **零文案**——logo 是既有 assets/logo.svg（与标题栏/关于页同源资产），字标 LinkDesk 是
 *   品牌名（不进 i18n，同 useAbout 的 "GitHub" 判据）；`role="status"` + aria-label 复用既有
 *   词条「加载中...」（不触发 lang-defaults 发版）。
 */
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import "./BootMark.css";

export function BootMark({ fading = false }: { fading?: boolean }): React.ReactElement {
  const { t } = useTranslation();
  // 150ms 延迟出现——快于阈值不渲染，杜绝闪烁（fading 形态 = 布局已到，直接可见等淡出）
  const [visible, setVisible] = useState(fading);
  useEffect(() => {
    if (fading) return;
    const timer = setTimeout(() => setVisible(true), 150);
    return () => clearTimeout(timer);
  }, [fading]);

  return (
    <div
      className={`ldk-boot-mark${visible ? " visible" : ""}${fading ? " fading" : ""}`}
      role="status"
      aria-label={t("加载中...")}
    >
      <img className="ldk-boot-mark-logo" src="assets/logo.svg" alt="" draggable={false} />
      <span className="ldk-boot-mark-wordmark">LinkDesk</span>
    </div>
  );
}
