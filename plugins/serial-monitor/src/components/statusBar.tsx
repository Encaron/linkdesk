// 串口监视器状态栏组件——E2b #12a + #12b。
// 连接状态指示灯 + 打开口数 (N)（E5.8#30.12 P6：TX/RX 已删除并归位接收区工具栏 per-tab）。
// E6#62d：manifest appearsIn.statusBar 声明路径（src/components/statusBar.tsx）→ loader 拼归一 URL，
// 池 PoolStatusBarComponent 动态 import 渲染（取代 plugin.json 静态文本条目）；SDK 打包编成根
// statusBar.bundle.js 进 .linkdesk-plugin（dist manifest 该字段改写指向编译表面）。
// #12b：读 serial-monitor.statusBar.connection 配置——Settings Editor 可显隐。
//
// E5.5#7 Bug A fix：壳侧渲染走 pluginState IPC（不再依赖 React Context——多 WebView 下 Context 隔离）。
// E5.5#9l-fix：9l 将 key 改为 <sourceName>:isOpen 格式——statusBar 用 events.on("plugin-state:changed")
// 通配订阅，从键名后缀匹配。E5.5#9l 同款 per-tab 隔离。
import { useState, useEffect } from "react";
// E5.7#98：plugin-state:changed 载荷走 events.on 泛型——wire 契约类型归口 src/core/types/ipc/events
// E5.8#20-c：契约化——events 载荷类型走 @linkdesk/contracts（零 @src/core）
import type { PluginStateChangedPayload } from "@linkdesk/contracts";
import { useTranslation } from "react-i18next";
import { SERIAL_MONITOR_PLUGIN_ID } from "../utils/pluginId";
// E5.8#54：灯 + (N) 同组对齐样式（serial-status-conn/led）
import "../styles/StatusBar.css";
// E5.8#29：活动会话口——状态栏只显示活动标签页的口（多口下各标签页各亮各的）
import { useSerialSessions } from "../hooks/useSerialSessions";
// E5.8#30.12（P6）：打开口计数——状态栏 (N)（≥2 才显示数字，开 1 个只亮灯）
import { useOpenPortCount } from "../services/SerialContext";

const lk = () => window.linkdesk;

/** E5.8#29：只响应活动会话口的连接状态——key = `${port}:isOpen`（原通配后缀会叠加所有口） */
function useIsOpen(port: string | null): boolean {
  const [isOpen, setIsOpen] = useState(false);
  useEffect(() => {
    setIsOpen(false); // 切口时重置——新口真实状态等事件到来
    if (!port) return;
    let cancelled = false;
    // E5.8#54：播种真实状态——plugin-state:changed 事件不重放，旧 :isOpen 写入此刻收不到
    //（点标签切活动口时「先强制灭灯再等事件」→ 事件永不来 → 灯卡灭）。初始 mount/换口直接读
    // pluginState 权威值，事件只兜底后续变化（通用「事件不重放」解法）。
    lk()?.pluginState?.get(SERIAL_MONITOR_PLUGIN_ID, `${port}:isOpen`).then((v) => {
      if (!cancelled && typeof v === "boolean") setIsOpen(v);
    }).catch(() => {});
    const handler = (data: PluginStateChangedPayload) => {
      if (data?.pluginId !== SERIAL_MONITOR_PLUGIN_ID) return;
      const k: string = data.key ?? "";
      if (k === `${port}:isOpen` && typeof data.value === "boolean") {
        setIsOpen(data.value);
      }
    };
    const unsub = lk()?.events?.on<PluginStateChangedPayload>("plugin-state:changed", handler);
    return () => {
      cancelled = true;
      unsub?.();
    };
  }, [port]);
  return isOpen;
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
  // E5.8#29：活动会话口——状态栏灯/(N) 跟随活动标签页，切标签页时自动换口
  const { sessions, activeSessionId } = useSerialSessions();
  const port = sessions.find((s) => s.id === activeSessionId)?.port ?? null;
  const isOpen = useIsOpen(port);
  const openPortCount = useOpenPortCount(); // E5.8#30.12：全局打开口数
  const showConnection = useStatusBarConfig("connection", true);

  return (
    <>
      {showConnection && (
        /* E5.8#54：灯 + (N) 同组 inline-flex——垂直中线对齐 + 紧凑 gap，不再各占外部 gap 产生大间距 */
        <span className="serial-status-conn">
          <span
            className="serial-status-led"
            title={isOpen ? t("已连接") : t("未连接")}
            style={{ color: isOpen ? "var(--serial-monitor-ok)" : "var(--text-muted)" }}
          >
            <span className="codicon codicon-circle-filled" />
          </span>
          {/* E5.8#30.12：口数 (N)——≥2 才显示数字，开 1 个只亮灯；随 connection 配置一并显隐 */}
          {openPortCount >= 2 && (
            <span className="status-text">{`(${openPortCount})`}</span>
          )}
        </span>
      )}
    </>
  );
}
