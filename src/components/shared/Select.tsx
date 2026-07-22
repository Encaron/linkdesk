interface SelectOption {
  value: string;
  label: string;
}

interface SelectProps {
  value: string;
  options: string[] | SelectOption[];
  onChange: (v: string) => void;
  disabled?: boolean;
}

function isSelectOption(o: string | SelectOption): o is SelectOption {
  return typeof o === "object" && "value" in o && "label" in o;
}

function Select({ value, options, onChange, disabled }: SelectProps) {
  return (
    <select
      className="input select-input"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
    >
      {options.map((opt) =>
        isSelectOption(opt)
          ? <option key={opt.value} value={opt.value}>{opt.label}</option>
          : <option key={opt} value={opt}>{opt}</option>
      )}
    </select>
  );
}

export default Select;
