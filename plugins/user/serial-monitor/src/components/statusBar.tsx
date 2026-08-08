// 串口监视器状态栏组件——E2b #12a + #12b。
// TX/RX 实时计数 + 连接状态指示灯。
// loader.ts Vite glob plugins/* /statusBar.tsx 自动加载，
// StatusBar.tsx 优先用此组件渲染，替代 plugin.json 中静态文本。
// #12b：读 serial-monitor.statusBar.txrx / .connection 配置——Settings Editor 可显隐。
//
// E5.5#7 Bug A fix：壳侧渲染走 pluginState IPC（不再依赖 React Context——多 WebView 下 Context 隔离）。
import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";

const lk = () => (window as any).linkdesk;

/** 从 pluginState 读连接状态 + 订阅变更 */
function useIsOpen(): boolean {
  const [isOpen, setIsOpen] = useState(false);
  useEffect(() => {
    lk()?.pluginState?.get("serial-monitor", "isOpen").then((v: unknown) => {
      if (typeof v === "boolean") setIsOpen(v);
    }).catch(() => {});
    const unsub = lk()?.pluginState?.onChange("serial-monitor", "isOpen", (v: unknown) => {
      if (typeof v === "boolean") setIsOpen(v);
    });
    return () => unsub?.();
  }, []);
  return isOpen;
}

/** 从 pluginState 读 TX/RX 计数 */
function useSerialStats(): { txBytes: number; rxBytes: number } {
  const [stats, setStats] = useState({ txBytes: 0, rxBytes: 0 });
  useEffect(() => {
    const get = () => Promise.all([
      lk()?.pluginState?.get("serial-monitor", "txBytes").catch(() => 0) as Promise<number>,
      lk()?.pluginState?.get("serial-monitor", "rxBytes").catch(() => 0) as Promise<number>,
    ]).then(([tx, rx]) => setStats({ txBytes: (tx as number) || 0, rxBytes: (rx as number) || 0 }));
    get();
    const unsubTx = lk()?.pluginState?.onChange("serial-monitor", "txBytes", (v: unknown) => {
      setStats((p) => ({ ...p, txBytes: (v as number) || 0 }));
    });
    const unsubRx = lk()?.pluginState?.onChange("serial-monitor", "rxBytes", (v: unknown) => {
      setStats((p) => ({ ...p, rxBytes: (v as number) || 0 }));
    });
    return () => { unsubTx?.(); unsubRx?.(); };
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
  }, []);
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
