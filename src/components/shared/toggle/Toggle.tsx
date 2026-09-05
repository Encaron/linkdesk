import "./Toggle.css"; // E6#54b：样式随组件（自全局 index.css 抽入）——@linkdesk/ui 消费方不依赖壳 index.css

interface ToggleProps {
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}

function Toggle({ checked, onChange, disabled }: ToggleProps) {
  return (
    <div
      className={`toggle${checked ? " on" : ""}${disabled ? " disabled" : ""}`}
      onClick={() => { if (!disabled) onChange(!checked); }}
      role="switch"
      aria-checked={checked}
    />
  );
}

export default Toggle;
