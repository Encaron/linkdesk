/**
 * COM 口下拉框——E6#87b 从 components/ControlPanel.tsx 搬出（只搬不改）。
 *
 * E5.8#29（S14）：disabled={connected} 而非 isOpen——isOpen 是共享投影口状态，另一标签页
 * 开口会禁用本标签页换口；本会话口已开才禁用（per-tab 精确）。
 */

import { useTranslation } from "react-i18next";
import { SelectBox } from "@linkdesk/ui"; // E6#54c：共享控件走 @linkdesk/ui
import type { PortInfo } from "../../services/SerialContext";

export interface PortSelectProps {
  value: string;
  ports: PortInfo[];
  disabled: boolean;
  onChange: (port: string) => void;
  onOpen: () => void;
}

export function PortSelect({ value, ports, disabled, onChange, onOpen }: PortSelectProps) {
  const { t } = useTranslation();
  return (
    <SelectBox
      value={value}
      options={ports.map((p) => ({ value: p.name, label: p.name }))}
      onChange={onChange}
      onOpen={onOpen}
      disabled={disabled}
      placeholder={t("无可用串口")}
    />
  );
}
