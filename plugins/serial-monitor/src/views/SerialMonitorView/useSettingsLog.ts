/**
 * 设置变更系统消息——E6#87b 从 src/index.tsx 的 SerialMonitorView 搬出（只搬不改）。
 *
 * C4a 迁移恢复：设置变更时打印系统消息。旧代码通过 onDidChangeConfiguration 订阅实现，
 * C4a 切到 session 后删除；现用 prevRef 比较实现——每次提交后检查变更，对标旧行为。
 *
 * ⚠️ 本 effect 的写入目标是接收区 CM6——必须在接收区 CM6 mount effect **之后**跑
 *    （它检查 cmView.current；首帧为 null 时只置 cmReady=false，不算变更）。
 *    调用顺序：门面里排在 useReceiveEditor 之后。
 */

import { useRef, useEffect } from "react";
import { useTranslation } from "react-i18next";
import type { EditorView } from "@codemirror/view";
import type { LineType } from "../../types";
import type { SerialSettings } from "./settings";

export interface SettingsLogOptions {
  cmView: React.MutableRefObject<EditorView | null>;
  appendLine: (text: string, color: LineType) => void;
  settings: SerialSettings;
}

export function useSettingsLog({ cmView, appendLine, settings }: SettingsLogOptions) {
  const { t } = useTranslation();
  const { showEcho, showLineNumbers, separateSystemLog, timestampFormat, autoRepeat, repeatInterval } = settings;

  const prevSettingsRef = useRef<{
    showEcho: boolean | null; showLineNumbers: boolean | null; separateSystemLog: boolean | null;
    timestampFormat: string | null; autoRepeat: boolean | null; repeatInterval: number | null;
    cmReady: boolean;
  }>({ showEcho: null, showLineNumbers: null, separateSystemLog: null, timestampFormat: null, autoRepeat: null, repeatInterval: null, cmReady: false });

  useEffect(() => {
    if (!cmView.current) { prevSettingsRef.current.cmReady = false; return; }
    const p = prevSettingsRef.current;
    const init = !p.cmReady;
    const cmp = <T,>(prev: T | null, cur: T, msg: string) => { if (prev !== null && prev !== cur) appendLine(msg, "system"); };

    cmp(p.showEcho, showEcho, t("---- {{name}}：{{value}} ----", { name: t("消息回显"), value: showEcho ? t("开") : t("关") }));
    cmp(p.showLineNumbers, showLineNumbers, t("---- {{name}}：{{value}} ----", { name: t("行号显示"), value: showLineNumbers ? t("开") : t("关") }));
    cmp(p.separateSystemLog, separateSystemLog, t("---- {{name}}：{{value}} ----", { name: t("系统消息独立显示"), value: separateSystemLog ? t("开") : t("关") }));
    cmp(p.timestampFormat, timestampFormat, t("---- {{name}}：{{value}} ----", { name: t("时间戳"), value: timestampFormat === "无" ? t("关") : timestampFormat }));
    if (!init) {
      cmp(p.autoRepeat, autoRepeat,
        autoRepeat
          ? t("---- 定时发送：开（每 {{interval}} ms）----", { interval: repeatInterval })
          : t("---- 定时发送：关 ----"));
    }

    prevSettingsRef.current = { showEcho, showLineNumbers, separateSystemLog, timestampFormat, autoRepeat, repeatInterval, cmReady: true };
  }, [cmView, appendLine, showEcho, showLineNumbers, separateSystemLog, timestampFormat, autoRepeat, repeatInterval, t]);
}
