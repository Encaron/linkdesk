/**
 * OverlayPortal——通用悬浮层容器。
 * E5#96：所有 overlay（ContextMenu/Toast/Dialog/ColorPicker/SelectBox）统一 portal 到 body，
 *        脱离 App.tsx zone wrapper 的层叠上下文，永远不会被分割线/图标栏/状态栏遮挡。
 *
 * 对标 E5#18 InlineInput 归一化——一个组件替代所有 overlay 的 portal 模式。
 * 未来 FloatingPanel / Tooltip / 底部终端面板等新悬浮 UI 默认使用此组件。
 */
import { createPortal } from "react-dom";

interface OverlayPortalProps {
  children: React.ReactNode;
}

export default function OverlayPortal({ children }: OverlayPortalProps) {
  return createPortal(children, document.body);
}
