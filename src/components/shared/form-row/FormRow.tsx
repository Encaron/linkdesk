import type { ReactNode } from "react";
import "./FormRow.css"; // E6#54b：样式随组件（自全局 index.css 抽入）——@linkdesk/ui 消费方不依赖壳 index.css

interface FormRowProps {
  label: string;
  children: ReactNode;
}

function FormRow({ label, children }: FormRowProps) {
  return (
    <div className="ldk-form-row">
      <label>{label}</label>
      {children}
    </div>
  );
}

export default FormRow;
