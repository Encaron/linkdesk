// 串口监视器状态栏组件——E2b #12a + #12b。
// TX/RX 实时计数 + 连接状态指示灯。
// loader.ts Vite glob plugins/* /statusBar.tsx 自动加载，
// StatusBar.tsx 优先用此组件渲染，替代 plugin.json 中静态文本。
// #12b：读 serial-monitor.statusBar.txrx / .connection 配置——Settings Editor 可显隐。
//
// E5.5#7 Bug A fix：壳侧渲染走 pluginState IPC（不再依赖 React Context——多 WebView 下 Context 隔离）。
// E5.5#9l-fix：9l 将 key 改为 <sourceName>:isOpen / <sourceName>:txBytes / <sourceName>:rxBytes 格式——
// statusBar 用 events.on("plugin-state:changed") 通配订阅，从键名后缀匹配。
import { useState, useEffect } from "react";
// E5.7#98：plugin-state:changed 载荷走 events.on 泛型——wire 契约类型归口 src/core/types/ipc/events
// E5.8#20-c：契约化——events 载荷类型走 @linkdesk/contracts（零 @src/core）
import type { PluginStateChangedPayload } from "@linkdesk/contracts";
import { useTranslation } from "react-i18next";
import { SERIAL_MONITOR_PLUGIN_ID } from "../utils/pluginId";

const lk = () => window.linkdesk;

/** E5.5#9l-fix：从 plugin-state:changed 通配事件读连接状态——key 带端口前缀（如 COM3:isOpen） */
function useIsOpen(): boolean {
  const [isOpen, setIsOpen] = useState(false);
  useEffect(() => {
    const handler = (data: PluginStateChangedPayload) => {
      if (data?.pluginId !== SERIAL_MONITOR_PLUGIN_ID) return;
      const k: string = data.key ?? "";
      if (k.endsWith(":isOpen") && typeof data.value === "boolean") {
        setIsOpen(data.value);
      }
    };
    const unsub = lk()?.events?.on<PluginStateChangedPayload>("plugin-state:changed", handler);
    return () => unsub?.();
  }, []);
  return isOpen;
}

/** E5.5#9l-fix：从 plugin-state:changed 通配事件读 TX/RX 计数 */
function useSerialStats(): { txBytes: number; rxBytes: number } {
  const [stats, setStats] = useState({ txBytes: 0, rxBytes: 0 });
  useEffect(() => {
    const handler = (data: PluginStateChangedPayload) => {
      if (data?.pluginId !== SERIAL_MONITOR_PLUGIN_ID) return;
      const k: string = data.key ?? "";
      if (k.endsWith(":txBytes") && typeof data.value === "number") {
        setStats((p) => ({ ...p, txBytes: data.value as number }));
      }
      if (k.endsWith(":rxBytes") && typeof data.value === "number") {
        setStats((p) => ({ ...p, rxBytes: data.value as number }));
      }
    };
    const unsub = lk()?.events?.on<PluginStateChangedPayload>("plugin-state:changed", handler);
    return () => unsub?.();
  }, []);
  return stats;
}

/** 从 configuration IPC 读显隐配置（替代 useConfigurationValue——多 WebView 下不同步） */
function useStatusBarConfig(key: string, defaultValue: boolean): boolean {
  const [value, setValue] = useState(defaultValue);
  useEffect(() => {
    const fullKey = `serial-monitor.statusBar.${key}`;
    lk()?.configuration?.get(fullKey).then((v: unknown) => {
      if (typeof v === "boolean") setValue(v);
    }).catch(() => {});
    const unsub = lk()?.configuration?.onDidChangeConfiguration?.((k: string, v: unknown) => {
      if (k === fullKey && typeof v === "boolean") setValue(v);
    });
    return () => unsub?.();
  }, [key]);
  return value;
}

export default function SerialMonitorStatusBar() {
  const { t } = useTranslation();
  const isOpen = useIsOpen();
  const { txBytes, rxBytes } = useSerialStats();
  const showTxRx = useStatusBarConfig("txrx", true);
  const showConnection = useStatusBarConfig("connection", true);

  return (
    <>
      {showConnection && (
        <span
          title={isOpen ? t("已连接") : t("未连接")}
          style={{ color: isOpen ? "var(--serial-monitor-ok)" : "var(--text-muted)" }}
        >
          <span className="codicon codicon-circle-filled" />
        </span>
      )}
      {showConnection && showTxRx && (
        <span className="status-divider" />
      )}
      {showTxRx && (
        <span className="status-text">
          {isOpen ? "TX:" + txBytes + "  RX:" + rxBytes : "TX:--  RX:--"}
        </span>
      )}
    </>
  );
}
