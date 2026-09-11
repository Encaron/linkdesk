/**
 * 收发设置——「握手信号」分组——E6#87b 从 views/SerialSettingsView.tsx 搬出（只搬不改）。
 *
 * E5.8#30.18（拍板：命令条放不下 → 移侧栏收发设置）。
 * DTR/RTS 术语无中文，label 直接术语；开关 = 打开时初始电平 + 运行中切换直发（onHandshakeChange）。
 */

import { useTranslation } from "react-i18next";
import { FormRow, Toggle } from "@linkdesk/ui";
import type { SerialSession } from "../../hooks/useSerialSessions";

export interface HandshakeGroupProps {
  session: SerialSession;
  onHandshakeChange: (key: "dtr" | "rts", v: boolean) => void;
}

export function HandshakeGroup({ session, onHandshakeChange }: HandshakeGroupProps) {
  const { t } = useTranslation();
  return (
    <div className="setting-group">
      <div className="setting-section-label">{t("握手信号")}</div>
      <FormRow label="DTR">
        <Toggle checked={Boolean(session.dtr)} onChange={(v) => onHandshakeChange("dtr", v)} />
      </FormRow>
      <FormRow label="RTS">
        <Toggle checked={Boolean(session.rts)} onChange={(v) => onHandshakeChange("rts", v)} />
      </FormRow>
    </div>
  );
}
