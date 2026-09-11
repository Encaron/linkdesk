/**
 * 串口监视器插件入口——E6#87b：主视图搬去 views/SerialMonitorView（见该文件头注），
 * 本文件只剩**模块顶层声明式接线**（菜单项注册 + beforeClose 通道）+ default export 转出。
 *
 * 设计依据：[V3-Phase4-串口监视器插件化设计.md]
 */

// E5.8#30.16（P8）：PoolTab——beforeClose handler 接收的标签页快照类型（契约导出，第三方插件同路径）
import type { PoolTab } from "@linkdesk/contracts";
import { getSessionById } from "./hooks/useSerialSessions";
// E5.8#30.16（P8）：getOpenPorts（本会话口是否开）+ closePortFromModule（关串口咽喉）——beforeClose handler 用
import { getOpenPorts, closePortFromModule } from "./services/SerialContext";
// E5.8#30.16（P8）：handler 非 React 环境（模块顶层注册）——用全局 i18n 实例 t()（与 useTranslation 同源）
import i18n from "i18next";
// E6#87b：原 SerialMonitorView.css（591 行）按分节拆三件——按原级联顺序导入（外壳 → 接收 → 发送）
import "./styles/SerialMonitorView.css";
import "./styles/SerialMonitorView-receive.css";
import "./styles/SerialMonitorView-send.css";

// E5#116: 右键菜单注册——模块顶层 IPC，单/多 WebView 统一通路。
// ipcRenderer.invoke → main → 壳 IpcBridgeHandler → registerMenuItems → 壳的 _menus。
// 模块顶层执行 → preload 运行在页面 JS 之前 → window.linkdesk 此时已就绪。
// 🔥 E5.6#16.7k-fix：加 label 属性。壳 IpcBridgeHandler 的 getCommands() 查不到
// 池侧 _poolCommands 的命令→title=undefined。有 label 时 ContextMenu t(item.label) 正常显示。
window.linkdesk?.menu?.registerItems?.("editorContext", "serial-monitor", [
  { command: "serial-monitor.copy", group: "clipboard", label: "复制" },
  { command: "serial-monitor.selectAll", group: "selection", label: "全选" },
  { command: "serial-monitor.clear", group: "edit", label: "清空" },
]);
window.linkdesk?.menu?.registerItems?.("quickSendContext", "serial-monitor", [
  { command: "serial-monitor.quickSendEdit", group: "edit", label: "编辑" },
  { command: "serial-monitor.quickSendDelete", group: "danger", label: "删除" },
]);

// E5.8#30.16（P8）：通用「beforeClose 可取消」通道——插件注册自己的关闭前 handler（壳重建的通用通道，非串口业务）。
// 串口逻辑：关开着串口的标签页 → 强确认「会话正在使用 {{port}}，将断开连接」（与 #30.13 P9 共用同一 key）→
// 确认后先关串口再允许关（防数据丢失）；取消则标签页/串口双保留。防循环：handler 内 closePort 走
// closePortFromModule（只关串口，不再触发关闭确认链）；防重入由壳 GroupTabBar closingRef 兜底（确认后 closePort 恰好一次）。
// plugin.json `tabBehavior.invokeBeforeClose: "close_port"` 保留作声明信号（schema 兼容，壳不再消费其命令名）。
window.linkdesk?.pool?.registerBeforeClose?.("serial-monitor", async (tab: PoolTab): Promise<boolean> => {
  const session = getSessionById(tab.sourceId ?? tab.id);
  if (!session || !session.port) return true; // 无会话/未选口——放行
  if (!getOpenPorts().has(session.port)) return true; // 本会话口没开着——放行（关标签页不影响串口）
  // 开着串口——按「关闭时提示」配置决定是否弹确认（P9 统一提示体系，默认开）
  let promptOnClose = true;
  try {
    promptOnClose = (await window.linkdesk?.configuration?.get?.("serial-monitor.confirmOnClose")) !== false;
  } catch { /* 读配置失败按默认开——宁多提示勿静默断口 */ }
  if (promptOnClose) {
    const confirmed = await window.linkdesk?.dialog?.confirm?.(
      i18n.t("会话正在使用 {{port}}，将断开连接", { port: session.port })
    );
    if (!confirmed) return false; // 取消——标签页/串口双保留
  }
  // 确认（或配置关闭提示）——关串口恰好一次，走灯写入咽喉（#30.9，归一性）
  await closePortFromModule(session.port);
  return true; // 允许关
});

export { default } from "./views/SerialMonitorView";
