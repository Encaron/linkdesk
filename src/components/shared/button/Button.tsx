/**
 * E5.8#99：实心 accent 动作按钮（按钮双轨制实心轨）——动作/提交，对标 VS Code。
 * ghost 轨（选择/分组）= SegmentedRadio。双轨约定：选什么用 ghost 分段，做什么用实心按钮。
 *
 * 抽壳动机：动作按钮此前是 settings 插件 CSS 类 .settings-action-btn，却被壳共享组件
 * FilePathInput 消费——壳组件依赖插件 CSS 的倒置耦合。收编壳后 shell 组件零依赖插件样式，
 * 第三方插件直接用 <Button> 即得壳动作按钮（不用拷 CSS）。
 *
 * 消费方：settings renderHint:"action" 命令按钮、背景图三态按钮、FilePathInput「…」按钮。
 */
import "./Button.css";

interface ButtonProps {
  children: React.ReactNode;
  onClick?: (e: React.MouseEvent<HTMLButtonElement>) => void;
  disabled?: boolean;
  title?: string;
  type?: "button" | "submit" | "reset";
}

function Button({ children, onClick, disabled, title, type = "button" }: ButtonProps) {
  return (
    <button type={type} className="button" onClick={onClick} disabled={disabled} title={title}>
      {children}
    </button>
  );
}

export default Button;
