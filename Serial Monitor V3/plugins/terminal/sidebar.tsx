/**
 * 终端侧栏设置。
 * Phase 4 Step B4：从 src/components/TerminalSidebar.tsx 迁移。
 */

import { useTranslation } from "react-i18next";
import { useTerminalPrefs, type TerminalPrefs } from "../../src/core/TerminalPrefsContext";
import Toggle from "../../src/components/shared/Toggle";
import Select from "../../src/components/shared/Select";
import FormRow from "../../src/components/shared/FormRow";
import "./TerminalSidebar.css";

const timeFormats = ["HH:mm:ss", "HH:mm:ss:fff", "无"];
const lineEndings = ["\\r\\n", "\\n", "\\r"];

function TerminalSidebar() {
  const { t } = useTranslation();
  const { prefs, setPrefs } = useTerminalPrefs();

  const update = (patch: Partial<TerminalPrefs>) => {
    setPrefs({ ...prefs, ...patch });
  };

  return (
    <div className="terminal-sidebar">
      <div className="setting-group">
        <div className="setting-group-title">{t("显示")}</div>
        <FormRow label={t("时间戳")}>
          <Select value={prefs.timestampFormat} options={timeFormats}
            onChange={(v) => update({ timestampFormat: v })} />
        </FormRow>
        <FormRow label={t("消息回显")}>
          <Toggle checked={prefs.showEcho}
            onChange={(v) => update({ showEcho: v })} />
        </FormRow>
        <FormRow label={t("行号显示")}>
          <Toggle checked={prefs.showLineNumbers}
            onChange={(v) => update({ showLineNumbers: v })} />
        </FormRow>
        <FormRow label={t("系统消息独立显示")}>
          <Toggle checked={prefs.separateSystemLog}
            onChange={(v) => update({ separateSystemLog: v })} />
        </FormRow>
      </div>

      <div className="setting-group">
        <div className="setting-group-title">{t("发送")}</div>
        <FormRow label={t("换行符")}>
          <Select value={prefs.lineEnding} options={lineEndings}
            onChange={(v) => update({ lineEnding: v })} />
        </FormRow>
        <FormRow label={t("定时发送")}>
          <Toggle checked={prefs.autoRepeat}
            onChange={(v) => update({ autoRepeat: v })} />
        </FormRow>
        {prefs.autoRepeat && (
          <FormRow label={t("间隔(ms)")}>
            <input className="input" type="number" value={prefs.repeatInterval}
              style={{ width: 80 }}
              onChange={(e) => update({ repeatInterval: parseInt(e.target.value) || 1000 })} />
          </FormRow>
        )}
        <FormRow label={t("发送后清空")}>
          <Toggle checked={prefs.autoClear}
            onChange={(v) => update({ autoClear: v })} />
        </FormRow>
      </div>

      <div className="setting-group">
        <div className="setting-group-title">{t("编码")}</div>
        <FormRow label={t("接收模式")}>
          <Select value={prefs.receiveMode}
            options={[{ value: "text", label: t("文本") }, { value: "hex", label: "HEX" }]}
            onChange={(v) => update({ receiveMode: v as TerminalPrefs["receiveMode"] })} />
        </FormRow>
        <FormRow label={t("接收编码")}>
          <Select value={prefs.receiveCoding} options={["UTF-8", "GB2312", "Shift-JIS", "Latin-1"]}
            onChange={(v) => update({ receiveCoding: v })} />
        </FormRow>
        <FormRow label={t("发送模式")}>
          <Select value={prefs.sendMode}
            options={[{ value: "text", label: t("文本") }, { value: "hex", label: "HEX" }]}
            onChange={(v) => update({ sendMode: v as TerminalPrefs["sendMode"] })} />
        </FormRow>
        <FormRow label={t("发送编码")}>
          <Select
            value={prefs.sendCoding}
            options={["UTF-8", "GB2312", "Shift-JIS", "Latin-1"]}
            onChange={(v) => update({ sendCoding: v })}
            disabled={prefs.sendMode === "hex"}
          />
        </FormRow>
      </div>
    </div>
  );
}

export default TerminalSidebar;
