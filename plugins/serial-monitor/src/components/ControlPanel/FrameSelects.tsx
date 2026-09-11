/**
 * 帧格式选择器——E6#87b 从 components/ControlPanel.tsx 搬出（只搬不改）。
 *
 * 8N1 = 数据位/停止位组合（E5.8#30.17）+ 校验位独立选择器（无/奇/偶）。
 */

import { useTranslation } from "react-i18next";
import { SelectBox } from "@linkdesk/ui"; // E6#54c：共享控件走 @linkdesk/ui
import { FRAME_FORMATS } from "./constants";

export interface FrameSelectsProps {
  frameFormat: string;
  parity: string;
  parityOptions: { value: string; label: string }[];
  onFrameChange: (value: string) => void;
  onParityChange: (value: string) => void;
}

export function FrameSelects({
  frameFormat, parity, parityOptions, onFrameChange, onParityChange,
}: FrameSelectsProps) {
  const { t } = useTranslation();
  return (
    <>
      {/* 8N1——数据位/停止位组合选择器（E5.8#30.17） */}
      <SelectBox
        value={frameFormat}
        options={FRAME_FORMATS}
        onChange={onFrameChange}
        title={`${t("数据位")}/${t("停止位")}`}
        className="control-select-narrow"
      />

      {/* 校验位——独立选择器（E5.8#30.17）：无/奇/偶 */}
      <SelectBox
        value={parity}
        options={parityOptions}
        onChange={onParityChange}
        title={t("校验")}
      />
    </>
  );
}
