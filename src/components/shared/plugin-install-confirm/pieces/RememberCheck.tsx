/**
 * 「记住本次选择」复选框 —— 安装确认卡与批量更新汇总卡共用（2026-11-24 去重）。
 * 受控哑件：值/文案由调用方传入，⛔ 不持状态、不调桥。
 */

export function RememberCheck({
  remember,
  onRememberChange,
}: {
  remember: { checked: boolean; label: string };
  onRememberChange?: (checked: boolean) => void;
}) {
  return (
    <label className="ldk-pic-check">
      <input
        type="checkbox"
        checked={remember.checked}
        onChange={(e) => onRememberChange?.(e.target.checked)}
      />
      <span>{remember.label}</span>
    </label>
  );
}
