import type { ReactNode } from "react";

interface FormRowProps {
  label: string;
  children: ReactNode;
}

function FormRow({ label, children }: FormRowProps) {
  return (
    <div className="form-row">
      <label>{label}</label>
      {children}
    </div>
  );
}

export default FormRow;
