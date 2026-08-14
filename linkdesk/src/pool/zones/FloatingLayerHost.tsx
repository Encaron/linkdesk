/**
 * FloatingLayerHost——E5.7#25。浮层统一容器（🔴 自 Phase 6 提前——#14 前置：portal root 不存在 = 菜单点不动）。
 *
 * 一个固定全窗容器 + 4 个 portal root。浮层组件（ContextMenu/QuickPick/Toast/Dialog/Tooltip）
 * 经 ReactDOM.createPortal 渲染进对应 root——浮层逻辑与调用方解耦，单宿主不分散。
 *
 * 设计原则（浮层归一化设计.md §2）：
 *   - 默认穿透：容器 pointer-events: none——不阻挡正常交互；浮层显示时各自设 pointer-events: auto
 *   - 自分层：每个浮层类型独立 z-index——不互相压
 *   - portal 渲染：ReactDOM.createPortal——浮层逻辑和调用方解耦
 *   - 单宿主：一个 FloatingLayerHost——不分散到多个组件
 *
 * 容器 z-index = Z_INDEX.toast（浮层层级基准）——#26 常量表。
 */
import { Z_INDEX } from "../../constants";
import QuickPickHost from "../floating/QuickPickHost";
import ToastHost from "../floating/ToastHost";

function FloatingLayerHost() {
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: Z_INDEX.toast,
        pointerEvents: "none", // 默认穿透——浮层显示时各自设 pointer-events: auto
      }}
    >
      {/* ContextMenu portal——#14 接入 */}
      <div id="context-menu-root" />

      {/* QuickPick / CommandPalette portal——#15 接入：壳推 DTO，QuickPickHost 哑渲染 */}
      <div id="quick-pick-root">
        <QuickPickHost />
      </div>

      {/* Dialog / Modal portal——#17 接入 */}
      <div id="dialog-root" />

      {/* Tooltip portal（如需要） */}
      <div id="tooltip-root" />

      {/* ToastHost——#16 接入（设计 §2：Toast 始终在此，按需显示——空栈/null 自隐藏） */}
      <ToastHost />
    </div>
  );
}

export default FloatingLayerHost;
