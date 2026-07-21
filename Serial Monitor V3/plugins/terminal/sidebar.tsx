/**
 * 终端侧栏设置。
 * Phase 4 Step B4：从 src/components/TerminalSidebar.tsx 迁移。
 * Phase 5f：TerminalPrefsContext 删除——改用 useConfiguration 直连 ConfigurationService。
 *   对标 VS Code：每个设置项独立订阅 workspace.getConfiguration().get(key)。
 */

import { useTranslation } from "react-i18next";
import { useConfiguration } from "../../src/core/useConfiguration";
import Toggle from "../../src/components/shared/Toggle";
import Select from "../../src/components/shared/Select";
import FormRow from "../../src/components/shared/FormRow";
import "./TerminalSidebar.css";

const timeFormats = ["HH:mm:ss", "HH:mm:ss:fff", "无"];
const lineEndings = ["\\r\\n", "\\n", "\\r"];

function TerminalSidebar() {
  const { t } = useTranslation();

  // Phase 5f：每个设置项独立 useConfiguration——对标 VS Code workspace.getConfiguration().get(key)
  const [timestampFormat, setTimestampFormat] = useConfiguration<string>("terminal.timestampFormat");
  const [showEcho, setShowEcho] = useConfiguration<boolean>("terminal.showEcho");
  const [showLineNumbers, setShowLineNumbers] = useConfiguration<boolean>("terminal.showLineNumbers");
  const [separateSystemLog, setSeparateSystemLog] = useConfiguration<boolean>("terminal.separateSystemLog");
  const [lineEnding, setLineEnding] = useConfiguration<string>("terminal.lineEnding");
  const [autoRepeat, setAutoRepeat] = useConfiguration<boolean>("terminal.autoRepeat");
  const [repeatInterval, setRepeatInterval] = useConfiguration<number>("terminal.repeatInterval");
  const [autoClear, setAutoClear] = useConfiguration<boolean>("terminal.autoClear");
  const [receiveMode, setReceiveMode] = useConfiguration<string>("terminal.receiveMode");
  const [receiveCoding, setReceiveCoding] = useConfiguration<string>("terminal.receiveCoding");
  const [sendMode, setSendMode] = useConfiguration<string>("terminal.sendMode");
  const [sendCoding, setSendCoding] = useConfiguration<string>("terminal.sendCoding");

  return (
    <div className="terminal-sidebar">
      <div className="setting-group">
        <div className="setting-group-title">{t("显示")}</div>
        <FormRow label={t("时间戳")}>
          <Select value={timestampFormat} options={timeFormats}
            onChange={(v) => setTimestampFormat(v)} />
        </FormRow>
        <FormRow label={t("消息回显")}>
          <Toggle checked={showEcho}
            onChange={(v) => setShowEcho(v)} />
        </FormRow>
        <FormRow label={t("行号显示")}>
          <Toggle checked={showLineNumbers}
            onChange={(v) => setShowLineNumbers(v)} />
        </FormRow>
        <FormRow label={t("系统消息独立显示")}>
          <Toggle checked={separateSystemLog}
            onChange={(v) => setSeparateSystemLog(v)} />
        </FormRow>
      </div>

      <div className="setting-group">
        <div className="setting-group-title">{t("发送")}</div>
        <FormRow label={t("换行符")}>
          <Select value={lineEnding} options={lineEndings}
            onChange={(v) => setLineEnding(v)} />
        </FormRow>
        <FormRow label={t("定时发送")}>
          <Toggle checked={autoRepeat}
            onChange={(v) => setAutoRepeat(v)} />
        </FormRow>
        {autoRepeat && (
          <FormRow label={t("间隔(ms)")}>
            <input className="input" type="number" value={repeatInterval}
              style={{ width: 80 }}
              onChange={(e) => setRepeatInterval(parseInt(e.target.value) || 1000)} />
          </FormRow>
        )}
        <FormRow label={t("发送后清空")}>
          <Toggle checked={autoClear}
            onChange={(v) => setAutoClear(v)} />
        </FormRow>
      </div>

      <div className="setting-group">
        <div className="setting-group-title">{t("编码")}</div>
        <FormRow label={t("接收模式")}>
          <Select value={receiveMode}
            options={[{ value: "text", label: t("文本") }, { value: "hex", label: "HEX" }]}
            onChange={(v) => setReceiveMode(v)} />
        </FormRow>
        <FormRow label={t("接收编码")}>
          <Select value={receiveCoding} options={["UTF-8", "GB2312", "Shift-JIS", "Latin-1"]}
            onChange={(v) => setReceiveCoding(v)} />
        </FormRow>
        <FormRow label={t("发送模式")}>
          <Select value={sendMode}
            options={[{ value: "text", label: t("文本") }, { value: "hex", label: "HEX" }]}
            onChange={(v) => setSendMode(v)} />
        </FormRow>
        <FormRow label={t("发送编码")}>
          <Select
            value={sendCoding}
            options={["UTF-8", "GB2312", "Shift-JIS", "Latin-1"]}
            onChange={(v) => setSendCoding(v)}
            disabled={sendMode === "hex"}
          />
        </FormRow>
      </div>
    </div>
  );
}

export default TerminalSidebar;
