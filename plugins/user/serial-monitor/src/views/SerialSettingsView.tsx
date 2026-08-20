/**
 * SerialSettingsView——串口监视器收发设置 view。
 * E36#8.4：从 sidebar.tsx 搬出设置 helpers + 三个 setting-group。不包 SidebarSection——SidePanel 渲染循环统一包。
 *
 * 对标 VS Code Explorer 下半 = 文件属性（收发设置，随选中会话联动）。
 */

import { useCallback, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useSerialSessions } from "../hooks/useSerialSessions";
import type { SerialSession } from "../hooks/useSerialSessions";
// E5.8#30.18：DTR/RTS 运行中切换直发（带端口）+ 口开判断——侧栏开关不只看会话，还驱动硬件电平
import { useSerialContext, getOpenPorts } from "../services/SerialContext";
import Toggle from "@src/components/shared/toggle/Toggle";
import SelectBox from "@src/components/shared/select-box/SelectBox";
import FormRow from "@src/components/shared/form-row/FormRow";
import "../styles/SerialMonitorSidebar.css";

const RAW_TIME_FORMATS = ["HH:mm:ss", "HH:mm:ss:fff", "无"];
const lineEndings = ["\\r\\n", "\\n", "\\r"];

export default function SerialSettingsView() {
  const { t } = useTranslation();
  const timeFormats = RAW_TIME_FORMATS.map((f) => f === "无" ? t("无") : f);
  const { activeSession, activeSessionId, updateSession } = useSerialSessions();
  const { actions } = useSerialContext();
  const { setDtr, setRts } = actions;

  // E5.8#30.18：DTR/RTS 开关——写会话（per-COM 配置态）+ 口开着才直发硬件（显式传会话口，per-tab 精确）。
  // 打开时初始电平由 openPort action 应用（ControlPanel 透传 handshake）——本处只管运行中切换。
  const handleHandshakeChange = useCallback(
    (key: "dtr" | "rts", v: boolean) => {
      if (!activeSessionId) return;
      updateSession(activeSessionId, { [key]: v } as Partial<SerialSession>);
      const port = activeSession?.port;
      if (port && getOpenPorts().has(port)) {
        const act = key === "dtr" ? setDtr : setRts;
        act(port, v).catch((e) => console.error(`[serial-monitor] 设置 ${key.toUpperCase()} 失败:`, e));
      }
    },
    [activeSessionId, updateSession, activeSession?.port, setDtr, setRts],
  );

  // ── 设置辅助：从 activeSession 读 / 通过 updateSession 写 ──
  // 一字不改从 sidebar.tsx L248-285 搬出

  const mkSetter = useCallback(
    <K extends keyof SerialSession>(key: K) =>
      (value: SerialSession[K]) => {
        if (activeSessionId) {
          updateSession(activeSessionId, { [key]: value } as Partial<SerialSession>);
        }
      },
    [activeSessionId, updateSession],
  );

  const mkToggle = useCallback(
    (key: keyof SerialSession) => {
      const value = activeSession?.[key];
      const setter = mkSetter(key);
      return (
        <Toggle
          checked={Boolean(value)}
          onChange={(v) => setter(v as SerialSession[typeof key])}
        />
      );
    },
    [activeSession, mkSetter],
  );

  const mkSelect = useCallback(
    (key: keyof SerialSession, options: string[] | { value: string; label: string }[]) => {
      const value = activeSession?.[key];
      const setter = mkSetter(key);
      return (
        <SelectBox
          value={String(value ?? "")}
          options={options}
          onChange={(v) => setter(v as SerialSession[typeof key])}
        />
      );
    },
    [activeSession, mkSetter],
  );

  // ── 动态标题——随 activeSession.name 变化更新 ViewDescriptor ──
  // registerView 同一 (pluginId, id) 重复调用 = 更新已有（不创建第二条记录）
  useEffect(() => {
    const title = activeSession?.name
      ? `${t("收发设置")} — ${activeSession.name}`
      : t("收发设置");
    window.linkdesk?.viewContainer?.registerView?.("serial-monitor", "serial-monitor", {
      id: "settings",
      title,
    });
  }, [activeSession?.name, t]);

  // ── 无活跃会话时显示占位 ──

  if (!activeSession) {
    return (
      <div className="session-settings-placeholder">
        {t("选择一个会话以编辑收发设置")}
      </div>
    );
  }

  // ── 有活跃会话时显示三个 setting-group ──
  // JSX 一字不改从 sidebar.tsx L372-448 搬出（去掉外层 SidebarSection）

  return (
    <>
      {/* 显示 group */}
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
      </div>

      {/* 发送行为 group */}
      <div className="setting-group">
        <div className="setting-section-label">{t("发送行为")}</div>
        <FormRow label={t("换行符")}>
          {mkSelect("lineEnding", lineEndings)}
        </FormRow>
        <FormRow label={t("定时发送")}>
          {mkToggle("autoRepeat")}
        </FormRow>
        {activeSession.autoRepeat && (
          <FormRow label={t("间隔(ms)")}>
            <input
              className="input"
              type="number"
              value={activeSession.repeatInterval}
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
      </div>

      {/* 编码 group */}
      <div className="setting-group">
        <div className="setting-section-label">{t("编码")}</div>
        <FormRow label={t("接收模式")}>
          <SelectBox
            value={activeSession.receiveMode}
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
            value={activeSession.sendMode}
            options={[
              { value: "text", label: t("文本") },
              { value: "hex", label: "HEX" },
            ]}
            onChange={(v) => mkSetter("sendMode")(v)}
          />
        </FormRow>
        <FormRow label={t("发送编码")}>
          <SelectBox
            value={activeSession.sendCoding}
            options={["UTF-8", "GB2312", "Shift-JIS", "Latin-1"]}
            onChange={(v) => mkSetter("sendCoding")(v)}
            disabled={activeSession.sendMode === "hex"}
          />
        </FormRow>
      </div>

      {/* 握手信号 group——E5.8#30.18（拍板：命令条放不下 → 移侧栏收发设置） */}
      {/* DTR/RTS 术语无中文，label 直接术语；开关 = 打开时初始电平 + 运行中切换直发（handleHandshakeChange） */}
      <div className="setting-group">
        <div className="setting-section-label">{t("握手信号")}</div>
        <FormRow label="DTR">
          <Toggle checked={Boolean(activeSession.dtr)} onChange={(v) => handleHandshakeChange("dtr", v)} />
        </FormRow>
        <FormRow label="RTS">
          <Toggle checked={Boolean(activeSession.rts)} onChange={(v) => handleHandshakeChange("rts", v)} />
        </FormRow>
      </div>
    </>
  );
}
