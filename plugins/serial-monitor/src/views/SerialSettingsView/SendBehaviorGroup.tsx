/**
 * 收发设置——「发送行为」分组——E6#87b 从 views/SerialSettingsView.tsx 搬出（只搬不改）。
 */

import { useTranslation } from "react-i18next";
import { FormRow } from "@linkdesk/ui";
import type { SerialSession } from "../../hooks/useSerialSessions";
import { LINE_ENDINGS } from "./constants";
import type { SessionFormApi } from "./setters";

export interface SendBehaviorGroupProps {
  api: SessionFormApi;
  session: SerialSession;
}

export function SendBehaviorGroup({ api, session }: SendBehaviorGroupProps) {
  const { t } = useTranslation();
  const { mkSelect, mkToggle, mkSetter } = api;
  return (
    <div className="setting-group">
      <div className="setting-section-label">{t("发送行为")}</div>
      <FormRow label={t("换行符")}>
        {mkSelect("lineEnding", LINE_ENDINGS)}
      </FormRow>
      <FormRow label={t("定时发送")}>
        {mkToggle("autoRepeat")}
      </FormRow>
      {session.autoRepeat && (
        <FormRow label={t("间隔(ms)")}>
          <input
            className="input"
            type="number"
            value={session.repeatInterval}
            style={{ width: 80 }}
            onChange={(e) => {
              const v = parseInt(e.target.value);
              mkSetter("repeatInterval")(isNaN(v) ? 1000 : v);
            }}
          />
        </FormRow>
      )}
      <FormRow label={t("发送后清空")}>
        {mkToggle("autoClear")}
      </FormRow>
      {/* E5.8#30.21：打开即发初始化序列——打开端口自动发送 quickSends 序列（归一化复用，随会话联动，默认关=不无故发包） */}
      <FormRow label={t("打开即发初始化序列")}>
        {mkToggle("sendInitOnOpen")}
      </FormRow>
    </div>
  );
}
