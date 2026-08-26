/**
 * FloatingLayerHost——E5.7#25 → E5.8#107 浮层权威。浮层唯一权威容器（🔴 自 Phase 6 提前——#14 前置：
 * portal root 不存在 = 菜单点不动）。
 *
 * 一个固定全窗容器 + 双平面 + 各浮层 portal root。浮层组件经 ReactDOM.createPortal 渲染进对应
 * root——浮层逻辑与调用方解耦，单宿主不分散。E5.8#107（主题系统最终最优根治 Phase 2）升格为
 * 浮层唯一权威：遮罩归 scrim-plane（无磨砂）、表面归 surface 平面（结构隔离地板统一磨砂）。
 *
 * DOM 拓扑（#ld-float-layer 固定 inset:0 z:2000 pointer-events:none，唯一权威）：
 *   ├── #ld-scrim-plane（pointer-events:auto）  ← 全部遮罩归位，无磨砂
 *   ├── #context-menu-root / #quick-pick-root / #dialog-root / #floating-panel-root（auto）
 *   ├── #toast-root（auto，toast 从「直挂容器」改根级）
 *   └── #overlay-root（auto，新增通用 surface 根；OverlayPortal 默认目标）
 *
 * 隔离地板（index.css）：#ld-float-layer > *:not(#ld-scrim-plane) > * 深度2 / > * > * 深度3
 *   backdrop-filter 统一磨砂——结构事实非类名知识，新浮层（含第三方）进层即隔离，零枚举零壳改动。
 *   深度 2/3 命中 OverlayPortal wrapper（0×0 空盒）天然豁免；scrim-plane 排除不磨砂。
 *
 * 拖拽幽灵排除裁决（#107）：icon-drag-preview（IconBarZone）+ MainZone 拖拽预览**不进层**——
 * 瞬态 mimetic 副本非文字表面，逐帧 backdrop-filter 纯开销；且 pointer-events:none 与层穿透一致。
 * 这是裁决不是漏项（写文件时注释，防后人误判为 bug）。
 *
 * 设计原则（浮层归一化设计.md §2）：
 *   - 默认穿透：容器 pointer-events: none——不阻挡正常交互
 *   - 根级 opt-in（#14/#17 补丁 2026-08-14）：各 portal root 统一 pointer-events: auto——
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
 * Toast 根级归位（#107）：#toast-root 承担布局（ToastHost.css 内）——position:fixed 右下角 +
 *   pointer-events:none，.toast-item 由 CSS 恢复 auto。容器#toast-root 零 inline 穿透设置——
 *   穿透链由 ToastHost.css 承担（避免容器 none 下渗 toast-item）。
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
      id="ld-float-layer"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: Z_INDEX.toast,
        pointerEvents: "none", // 默认穿透——交互由各 portal root 根级 opt-in（见头注释）
      }}
    >
      {/* 遮罩平面（#107 浮层权威）——全部满屏 scrim（quick-pick-backdrop / dialog-host-backdrop /
          floating-panel-backdrop / colorpicker-overlay / ContextMenu backdrop）经 createPortal 归位。
          静态 div 不建 stacking context——portal 遮罩内联 z-index 仍在层上下文参与自分层。
          pointer-events:auto（遮罩需接收点击——容器 none 下渗，本平面统一 opt-in）。 */}
      <div id="ld-scrim-plane" style={{ pointerEvents: "auto" }} />

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

      {/* 通用 surface 根（#107 浮层权威）——OverlayPortal 默认目标：ColorPicker / SelectBoxDropdown /
          dropdown-card（vta / panel-switcher / group-tab-plus-menu）/ status-bar-notif-panel 归位。 */}
      <div id="overlay-root" style={{ pointerEvents: "auto" }} />

      {/* ToastHost——#16 接入（设计 §2：Toast 始终在此，按需显示——空栈/null 自隐藏）。
          #107 根级归位：#toast-root 布局/穿透由 ToastHost.css 提供（.toast-container display:contents）。 */}
      <div id="toast-root">
        <ToastHost />
      </div>
    </div>
  );
}

export default FloatingLayerHost;
