/**
 * E5.8#99：实心 accent 动作按钮（按钮双轨制实心轨）——动作/提交，对标 VS Code。
 * ghost 轨（选择/分组）= SegmentedRadio。双轨约定：选什么用 ghost 分段，做什么用实心按钮。
 *
 * E6#30.14 variant——语义动作层级（10-市场UI拥有权.md §四·一：安装=success 填充 / 卸载=danger /
 * 禁用=ghost；视觉源 = mockup 02 st-*）：
 *   缺省   = 实心 accent（现状不变）——主操作
 *   success = 实心绿（--success）——正面主操作（安装 / 启用）
 *   danger  = 破坏性次级（danger 文本+边，非实心——destructive 不抢主操作眼）
 *   ghost   = 次级透明钮（text-secondary + separator 边）
 * 变体样式全走语义/主题 token，零硬编码 hex（硬约束 1）。variant = props 非配置项（零新配置）。
 *
 * 抽壳动机：动作按钮此前是 settings 插件 CSS 类 .settings-action-btn，却被壳共享组件
 * FilePathInput 消费——壳组件依赖插件 CSS 的倒置耦合。收编壳后 shell 组件零依赖插件样式，
 * 第三方插件直接用 <Button> 即得壳动作按钮（不用拷 CSS）。
 *
 * 消费方：settings renderHint:"action" 命令按钮、背景图三态按钮、FilePathInput「…」按钮、
 * marketplace 详情 action bar（禁用/启用/卸载，E6#30.14c）。
 */
import "./Button.css";

type ButtonVariant = "success" | "danger" | "ghost";

interface ButtonProps {
  children: React.ReactNode;
  onClick?: (e: React.MouseEvent<HTMLButtonElement>) => void;
  disabled?: boolean;
  title?: string;
  type?: "button" | "submit" | "reset";
  variant?: ButtonVariant;
}

function Button({ children, onClick, disabled, title, type = "button", variant }: ButtonProps) {
  const cls = variant ? `button button--${variant}` : "button";
  return (
    <button type={type} className={cls} onClick={onClick} disabled={disabled} title={title}>
      {children}
    </button>
  );
}

export default Button;
