/**
 * FloatingPanelDemoView——E5.8#39.5 第二声明者验证载体视图。
 * 标签页 + 壳内悬浮面板双上下文渲染（entry 重导出本组件）：
 *   主区标签页右键「在悬浮面板中打开」（I8-3 声明即出现）→ 浮层渲染同一组件。
 * 交互 = 计数按钮——顺带验证 keep-alive（标签页/浮层切走再切回状态不丢）。
 * 视图契约只有 { isActive }——其余渲染全自由发挥。
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";

interface FloatingPanelDemoViewProps {
  isActive?: boolean;
}

export default function FloatingPanelDemoView({ isActive }: FloatingPanelDemoViewProps) {
  const { t } = useTranslation();
  const [count, setCount] = useState(0);

  return (
    <div style={{ padding: 16, fontFamily: "var(--font-family, sans-serif)" }}>
      <h3 style={{ margin: "0 0 8px" }}>{t("悬浮面板演示")}</h3>
      <p style={{ margin: "0 0 12px", opacity: 0.8 }}>
        {t("标签页右键「在悬浮面板中打开」→ 此视图在壳内悬浮面板显示（I8-3 声明即出现）")}
        {isActive ? " · " + t("活跃中") : ""}
      </p>
      <button
        type="button"
        onClick={() => setCount((c) => c + 1)}
        style={{ padding: "4px 12px", cursor: "pointer" }}
      >
        {t("点击计数：{{count}}", { count })}
      </button>
    </div>
  );
}
