/**
 * 只读文本展示件（M4 `AI#38.12` · P-2 拍板 A）——**通用原语**，与 Toggle/SelectBox 同层级
 * （`@linkdesk/ui` 单实例供给，任何插件可 import）。
 *
 * 用途：设置页 `renderHint: "readonly"` 的状态行（值来自 `statusCommand` 运行时数据源，
 * ⛔ 不来自配置存储）＋ 多行只读明细（如 AI 接入的开放范围）。🔴 就是文字——不做可点、
 * 不做悬停花活（用户拍板「控件形态尽量基础」；§0.6 反例 = file-tree ignore 控件）。
 * 零状态、零回调：渲染什么完全由 `value` 决定。
 */
import "./ReadOnlyText.css";

interface ReadOnlyTextProps {
  /** 展示文本（多行用 \n 分隔） */
  value: string;
  /** true = 多行块（明细清单；pre-wrap 保留换行）；缺省 = 单行（状态值，等宽字体） */
  multiline?: boolean;
}

function ReadOnlyText({ value, multiline }: ReadOnlyTextProps) {
  if (!value) return null; // 空值不占位（数据源还没就绪时的缺省形态）
  return <span className={`ldk-readonly-text${multiline ? " multiline" : ""}`}>{value}</span>;
}

export default ReadOnlyText;
