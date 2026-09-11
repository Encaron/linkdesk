/**
 * 收发设置——「显示」分组——E6#87b 从 views/SerialSettingsView.tsx 搬出（只搬不改）。
 * JSX 一字不改从 sidebar.tsx L372-448 搬出（去掉外层 SidebarSection）。
 */

import { useTranslation } from "react-i18next";
import { FormRow } from "@linkdesk/ui";
import type { SessionFormApi } from "./setters";

export interface DisplayGroupProps {
  api: SessionFormApi;
  timeFormats: string[];
}

export function DisplayGroup({ api, timeFormats }: DisplayGroupProps) {
  const { t } = useTranslation();
  const { mkSelect, mkToggle } = api;
  return (
    <div className="setting-group">
      <div className="setting-section-label">{t("显示")}</div>
      <FormRow label={t("时间戳")}>
        {mkSelect("timestampFormat", timeFormats)}
      </FormRow>
      <FormRow label={t("消息回显")}>
        {mkToggle("showEcho")}
      </FormRow>
      <FormRow label={t("行号显示")}>
        {mkToggle("showLineNumbers")}
      </FormRow>
      <FormRow label={t("系统消息独立显示")}>
        {mkToggle("separateSystemLog")}
      </FormRow>
      {/* E5.8#30.19a：HEX+ASCII 双栏——per-COM 记忆（随会话联动），开 = 接收区并排两栏 */}
      <FormRow label={t("HEX+ASCII 双栏")}>
        {mkToggle("hexAsciiDualPane")}
      </FormRow>
      {/* E5.8#30.19b：不可见字符转义——`\n`/`\r`/`\t` 等显示为可见符号（随会话联动） */}
      <FormRow label={t("不可见字符转义")}>
        {mkToggle("escapeInvisibleChars")}
      </FormRow>
      {/* E5.8#30.20：自动保存接收区——端口关闭 + 应用退出时落盘，防数据丢失（随会话联动，默认开=数据安全优先） */}
      <FormRow label={t("自动保存接收区")}>
        {mkToggle("autoSaveReceive")}
      </FormRow>
    </div>
  );
}
