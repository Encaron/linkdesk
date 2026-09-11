/**
 * 开关类命令注册（含动态标题）——E6#87b 从 src/index.tsx 的 SerialMonitorView 搬出（只搬不改）。
 *
 * E5.7 Bug C 补全：meta 恢复 E5.6 动态标题语义——registerCommand(id, handler, meta)
 * 重注册覆盖壳注册表 title，命令面板标题随状态翻转（暂停/继续、开启/关闭）。
 * handler 重注册保留：状态变化后闭包仍经 getActiveCmd() 现取，无过期闭包风险。
 */

import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { SEND_MODE_HEX, SEND_MODE_TEXT } from "../../constants";
import { getActiveCmd } from "../../services/commandBridge";
import type { SerialSettings } from "./settings";

export interface ToggleCommandsOptions {
  settings: SerialSettings;
  paused: boolean;
}

export function useToggleCommands({ settings, paused }: ToggleCommandsOptions) {
  const { t } = useTranslation();
  const { sendMode, showEcho, showLineNumbers, separateSystemLog, autoRepeat, autoClear } = settings;

  useEffect(() => {
    const lk = window.linkdesk;
    const reg = lk?.commands?.registerCommand;
    if (!reg) return;
    const cat = t("串口监视器");

    reg("serial-monitor.togglePause", async () => {
      getActiveCmd()!.setPaused((p) => !p);
    }, { title: t("暂停接收"), category: cat });
    reg("serial-monitor.toggleSendMode", async () => {
      getActiveCmd()!.setSendMode(getActiveCmd()!.sendMode === SEND_MODE_HEX ? SEND_MODE_TEXT : SEND_MODE_HEX);
    }, { title: t("切换到 HEX 发送"), category: cat });
    reg("serial-monitor.toggleEcho", async () => {
      getActiveCmd()!.setShowEcho(!getActiveCmd()!.showEcho);
    }, { title: t("关闭消息回显"), category: cat });
    reg("serial-monitor.toggleLineNumbers", async () => {
      getActiveCmd()!.setShowLineNumbers(!getActiveCmd()!.showLineNumbers);
    }, { title: t("隐藏行号"), category: cat });
    reg("serial-monitor.toggleSystemLog", async () => {
      getActiveCmd()!.setSeparateSystemLog(!getActiveCmd()!.separateSystemLog);
    }, { title: t("关闭系统消息独立显示"), category: cat });
    reg("serial-monitor.toggleAutoRepeat", async () => {
      getActiveCmd()!.setAutoRepeat(!getActiveCmd()!.autoRepeat);
    }, { title: t("关闭自动重发"), category: cat });
    reg("serial-monitor.toggleAutoClear", async () => {
      getActiveCmd()!.setAutoClear(!getActiveCmd()!.autoClear);
    }, { title: t("关闭自动清屏"), category: cat });
  }, [t]);

  useEffect(() => {
    window.linkdesk?.commands?.registerCommand?.(
      "serial-monitor.togglePause",
      async () => {
        getActiveCmd()!.setPaused((p) => !p);
      },
      { title: paused ? t("继续接收") : t("暂停接收"), category: t("串口监视器") },
    );
  }, [paused, t]);

  useEffect(() => {
    window.linkdesk?.commands?.registerCommand?.(
      "serial-monitor.toggleSendMode",
      async () => {
        getActiveCmd()!.setSendMode(getActiveCmd()!.sendMode === SEND_MODE_HEX ? SEND_MODE_TEXT : SEND_MODE_HEX);
      },
      { title: sendMode === SEND_MODE_HEX ? t("切换到文本发送") : t("切换到 HEX 发送"), category: t("串口监视器") },
    );
  }, [sendMode, t]);

  useEffect(() => {
    window.linkdesk?.commands?.registerCommand?.(
      "serial-monitor.toggleEcho",
      async () => {
        getActiveCmd()!.setShowEcho(!getActiveCmd()!.showEcho);
      },
      { title: showEcho ? t("关闭消息回显") : t("开启消息回显"), category: t("串口监视器") },
    );
  }, [showEcho, t]);

  useEffect(() => {
    window.linkdesk?.commands?.registerCommand?.(
      "serial-monitor.toggleLineNumbers",
      async () => {
        getActiveCmd()!.setShowLineNumbers(!getActiveCmd()!.showLineNumbers);
      },
      { title: showLineNumbers ? t("隐藏行号") : t("显示行号"), category: t("串口监视器") },
    );
  }, [showLineNumbers, t]);

  useEffect(() => {
    window.linkdesk?.commands?.registerCommand?.(
      "serial-monitor.toggleSystemLog",
      async () => {
        getActiveCmd()!.setSeparateSystemLog(!getActiveCmd()!.separateSystemLog);
      },
      { title: separateSystemLog ? t("关闭系统消息独立显示") : t("开启系统消息独立显示"), category: t("串口监视器") },
    );
  }, [separateSystemLog, t]);

  useEffect(() => {
    window.linkdesk?.commands?.registerCommand?.(
      "serial-monitor.toggleAutoRepeat",
      async () => {
        getActiveCmd()!.setAutoRepeat(!getActiveCmd()!.autoRepeat);
      },
      { title: autoRepeat ? t("关闭自动重发") : t("开启自动重发"), category: t("串口监视器") },
    );
  }, [autoRepeat, t]);

  useEffect(() => {
    window.linkdesk?.commands?.registerCommand?.(
      "serial-monitor.toggleAutoClear",
      async () => {
        getActiveCmd()!.setAutoClear(!getActiveCmd()!.autoClear);
      },
      { title: autoClear ? t("关闭自动清屏") : t("开启自动清屏"), category: t("串口监视器") },
    );
  }, [autoClear, t]);
}
