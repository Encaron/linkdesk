/**
 * FloatingLayerHost——E5.7#25。浮层统一容器（🔴 自 Phase 6 提前——#14 前置：portal root 不存在 = 菜单点不动）。
 *
 * 一个固定全窗容器 + 4 个 portal root。浮层组件（ContextMenu/QuickPick/Toast/Dialog/Tooltip）
 * 经 ReactDOM.createPortal 渲染进对应 root——浮层逻辑与调用方解耦，单宿主不分散。
 *
 * 设计原则（浮层归一化设计.md §2）：
 *   - 默认穿透：容器 pointer-events: none——不阻挡正常交互
 *   - 根级 opt-in（#14/#17 补丁 2026-08-14）：4 个 portal root 统一 pointer-events: auto——
 *     pointer-events 是继承属性，容器 none 沿 DOM 下渗；root 一处设 auto，任何浮层 portal
 *     进来默认可交互（忘设 = 正常工作，陷阱反转）。hosts 关闭时 return null 零 DOM →
 *     root 零 hit area → 默认穿透不受影响。
 *     🔴 教训：#14/#17 曾按"浮层显示时各自设 auto"实现——ContextMenu 菜单本体 / DialogHost
 *     漏设 → 池侧右键菜单点不动 + 无 hover、对话框点不动（壳侧消费者 portal 回退 body
 *     无此容器，掩盖了 bug）。"各自设"已废弃，auto 只写本文件一处。
 *   - 自分层：每个浮层类型独立 z-index——不互相压
 *   - portal 渲染：ReactDOM.createPortal——浮层逻辑和调用方解耦
 *   - 单宿主：一个 FloatingLayerHost——不分散到多个组件
 *
 * ToastHost 例外：直挂容器（不在 root 内）——其 CSS 自设 container none / toast-item auto。
 *
 * 容器 z-index = Z_INDEX.toast（浮层层级基准）——#26 常量表。
 */
import { Z_INDEX } from "../../../constants";
import QuickPickHost from "../../floating/quick-pick/QuickPickHost";
import ToastHost from "../../floating/toast/ToastHost";
import DialogHost from "../../floating/dialog/DialogHost";
import FloatingPanelHost from "../../floating/floating-panel/FloatingPanelHost"; // E5.8#37（Phase 8 类型 B）：壳内悬浮面板哑渲染

function FloatingLayerHost() {
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: Z_INDEX.toast,
        pointerEvents: "none", // 默认穿透——交互由各 portal root 根级 opt-in（见头注释）
      }}
    >
      {/* ContextMenu portal——#14 接入 */}
      <div id="context-menu-root" style={{ pointerEvents: "auto" }} />

      {/* QuickPick / CommandPalette portal——#15 接入：壳推 DTO，QuickPickHost 哑渲染 */}
      <div id="quick-pick-root" style={{ pointerEvents: "auto" }}>
        <QuickPickHost />
      </div>

      {/* Dialog / Modal portal——#17 接入：壳 DialogService 桥推 DTO，DialogHost 哑渲染 */}
      <div id="dialog-root" style={{ pointerEvents: "auto" }}>
        <DialogHost />
      </div>

      {/* Tooltip portal（如需要） */}
      <div id="tooltip-root" style={{ pointerEvents: "auto" }} />

      {/* FloatingPanel portal——#37 接入（Phase 8 类型 B）：壳 FloatingPanelService 桥推 DTO，
          FloatingPanelHost 哑渲染。容器固定元素 + Z_INDEX.floatingPanel（1500，I8-12）。
          根级 opt-in（§2 纪律）+ no-drag 豁免（硬约束 18——见 FloatingPanel.css）。 */}
      <div id="floating-panel-root" style={{ pointerEvents: "auto" }}>
        <FloatingPanelHost />
      </div>

      {/* ToastHost——#16 接入（设计 §2：Toast 始终在此，按需显示——空栈/null 自隐藏） */}
      <ToastHost />
    </div>
  );
}

export default FloatingLayerHost;
