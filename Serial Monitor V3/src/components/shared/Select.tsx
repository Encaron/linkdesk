interface SelectProps {
  value: string;
  options: string[];
  onChange: (v: string) => void;
  disabled?: boolean;
}

function Select({ value, options, onChange, disabled }: SelectProps) {
  return (
    <select
      className="input select-input"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
    >
      {options.map((opt) => (
        <option key={opt} value={opt}>{opt}</option>
      ))}
    </select>
  );
}

export default Select;
