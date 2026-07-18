import { useTranslation } from "react-i18next";
import { useTerminalPrefs, type TerminalPrefs } from "../core/TerminalPrefsContext";
import "./TerminalSidebar.css";

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div
      className={`toggle${checked ? " on" : ""}`}
      onClick={() => onChange(!checked)}
      role="switch"
      aria-checked={checked}
    />
  );
}

function Select({
  value,
  options,
  onChange,
}: {
  value: string;
  options: string[];
  onChange: (v: string) => void;
}) {
  return (
    <select className="input select-input" value={value} onChange={(e) => onChange(e.target.value)}>
      {options.map((opt) => (
        <option key={opt} value={opt}>{opt}</option>
      ))}
    </select>
  );
}

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
        <div className="setting-row">
          <label>{t("时间戳")}</label>
          <Select value={prefs.timestampFormat} options={timeFormats}
            onChange={(v) => update({ timestampFormat: v })} />
        </div>
        <div className="setting-row">
          <label>{t("消息回显")}</label>
          <Toggle checked={prefs.showEcho}
            onChange={(v) => update({ showEcho: v })} />
        </div>
        <div className="setting-row">
          <label>{t("行号显示")}</label>
          <Toggle checked={prefs.showLineNumbers}
            onChange={(v) => update({ showLineNumbers: v })} />
        </div>
        <div className="setting-row">
          <label>{t("系统消息独立显示")}</label>
          <Toggle checked={prefs.separateSystemLog}
            onChange={(v) => update({ separateSystemLog: v })} />
        </div>
      </div>

      <div className="setting-group">
        <div className="setting-group-title">{t("发送")}</div>
        <div className="setting-row">
          <label>{t("换行符")}</label>
          <Select value={prefs.lineEnding} options={lineEndings}
            onChange={(v) => update({ lineEnding: v })} />
        </div>
        <div className="setting-row">
          <label>{t("定时发送")}</label>
          <Toggle checked={prefs.autoRepeat}
            onChange={(v) => update({ autoRepeat: v })} />
        </div>
        {prefs.autoRepeat && (
          <div className="setting-row">
            <label>{t("间隔(ms)")}</label>
            <input className="input" type="number" value={prefs.repeatInterval}
              style={{ width: 80 }}
              onChange={(e) => update({ repeatInterval: parseInt(e.target.value) || 1000 })} />
          </div>
        )}
        <div className="setting-row">
          <label>{t("发送后清空")}</label>
          <Toggle checked={prefs.autoClear}
            onChange={(v) => update({ autoClear: v })} />
        </div>
      </div>

      <div className="setting-group">
        <div className="setting-group-title">{t("编码")}</div>
        <div className="setting-row">
          <label>{t("接收模式")}</label>
          <Select value={prefs.receiveMode} options={["文本", "HEX"]}
            onChange={(v) => update({ receiveMode: v as TerminalPrefs["receiveMode"] })} />
        </div>
        <div className="setting-row">
          <label>{t("接收编码")}</label>
          <Select value={prefs.receiveCoding} options={["UTF-8", "GBK", "ASCII", "Latin-1"]}
            onChange={(v) => update({ receiveCoding: v })} />
        </div>
        <div className="setting-row">
          <label>{t("发送模式")}</label>
          <Select value={prefs.sendMode} options={["文本", "HEX"]}
            onChange={(v) => update({ sendMode: v as TerminalPrefs["sendMode"] })} />
        </div>
        <div className="setting-row">
          <label>{t("发送编码")}</label>
          <Select value={prefs.sendCoding} options={["UTF-8", "GBK", "ASCII", "Latin-1"]}
            onChange={(v) => update({ sendCoding: v })} />
        </div>
      </div>
    </div>
  );
}

const timeFormats = ["HH:mm:ss", "HH:mm:ss:fff", "无"];
const lineEndings = ["\\r\\n", "\\n", "\\r"];

export default TerminalSidebar;
