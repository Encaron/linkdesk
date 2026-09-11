/**
 * 波特率输入——E6#87b 从 components/ControlPanel.tsx 搬出（只搬不改）。
 *
 * E5.8#30.17（审视 ④）壳通用 Combobox：候选快捷 + 手输任意非标值。
 */

import { useTranslation } from "react-i18next";
import { Combobox } from "@linkdesk/ui"; // E6#54c：共享控件走 @linkdesk/ui
import { BAUD_RATES } from "./constants";

export interface BaudInputProps {
  value: string;
  onChange: (baud: string) => void;
}

export function BaudInput({ value, onChange }: BaudInputProps) {
  const { t } = useTranslation();
  return (
    <Combobox
      value={value}
      options={BAUD_RATES}
      onChange={onChange}
      title={t("波特率")}
      inputMode="numeric"
    />
  );
}
