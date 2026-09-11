/**
 * 收发设置——「编码」分组——E6#87b 从 views/SerialSettingsView.tsx 搬出（只搬不改）。
 */

import { useTranslation } from "react-i18next";
import { FormRow, SelectBox } from "@linkdesk/ui";
import type { SerialSession } from "../../hooks/useSerialSessions";
import type { SessionFormApi } from "./setters";

export interface CodingGroupProps {
  api: SessionFormApi;
  session: SerialSession;
}

export function CodingGroup({ api, session }: CodingGroupProps) {
  const { t } = useTranslation();
  const { mkSelect, mkSetter } = api;
  return (
    <div className="setting-group">
      <div className="setting-section-label">{t("编码")}</div>
      <FormRow label={t("接收模式")}>
        <SelectBox
          value={session.receiveMode}
          options={[
            { value: "text", label: t("文本") },
            { value: "hex", label: "HEX" },
          ]}
          onChange={(v) => mkSetter("receiveMode")(v)}
        />
      </FormRow>
      <FormRow label={t("接收编码")}>
        {mkSelect("receiveCoding", ["UTF-8", "GB2312", "Shift-JIS", "Latin-1"])}
      </FormRow>
      <FormRow label={t("发送模式")}>
        <SelectBox
          value={session.sendMode}
          options={[
            { value: "text", label: t("文本") },
            { value: "hex", label: "HEX" },
          ]}
          onChange={(v) => mkSetter("sendMode")(v)}
        />
      </FormRow>
      <FormRow label={t("发送编码")}>
        <SelectBox
          value={session.sendCoding}
          options={["UTF-8", "GB2312", "Shift-JIS", "Latin-1"]}
          onChange={(v) => mkSetter("sendCoding")(v)}
          disabled={session.sendMode === "hex"}
        />
      </FormRow>
    </div>
  );
}
