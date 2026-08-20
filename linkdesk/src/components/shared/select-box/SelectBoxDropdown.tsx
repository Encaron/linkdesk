/**
 * SelectBoxDropdown——SelectBox/Combobox 共用下拉面板。E5.8#30.17。
 *
 * 定位 + Portal + 列表骨架一处写（jscpd 0 克隆门禁：两组件不再各写一份 dropdown 结构）。
 * 视觉走 SelectBox.css 的 .selectbox-dropdown/list 类——一个视觉语言一处写。
 * 选项渲染（.selectbox-item）由宿主提供——SelectBox 与 Combobox 的交互模型不同
 * （点击 select vs 输入过滤），候选渲染留在各自组件。
 */

import type { KeyboardEvent as ReactKeyboardEvent, ReactNode, RefObject } from "react";
import OverlayPortal from "../overlay-portal/OverlayPortal";

interface SelectBoxDropdownProps {
  /** 触发容器——定位锚点（面板对齐其下缘） */
  containerRef: RefObject<HTMLElement>;
  /** 外部点击/Escape 关闭（OverlayPortal 统一处理） */
  onClose: () => void;
  /** 键盘导航（Enter/方向键）——宿主组件实现（选项模型不同） */
  onKeyDown?: (e: ReactKeyboardEvent) => void;
  listRef?: RefObject<HTMLUListElement>;
  /** 可选搜索区（SelectBox >8 选项时）——渲染在列表上方 */
  search?: ReactNode;
  children: ReactNode;
}

export default function SelectBoxDropdown({ containerRef, onClose, onKeyDown, listRef, search, children }: SelectBoxDropdownProps) {
  return (
    <OverlayPortal onClose={onClose} triggerRef={containerRef}>
      <div
        className="selectbox-dropdown"
        onKeyDown={onKeyDown}
        style={{
          position: "fixed",
          left: containerRef.current?.getBoundingClientRect().left ?? 0,
          top: (containerRef.current?.getBoundingClientRect().bottom ?? 0) + 2,
          minWidth: containerRef.current?.getBoundingClientRect().width,
          // 动态 maxWidth——面板不超过窗口右边缘 - 24px 呼吸，不硬编码固定值
          maxWidth: window.innerWidth - (containerRef.current?.getBoundingClientRect().left ?? 0) - 24,
        }}
      >
        {search}
        <ul ref={listRef} className="selectbox-list" tabIndex={-1}>
          {children}
        </ul>
      </div>
    </OverlayPortal>
  );
}
