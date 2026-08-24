/**
 * SelectBoxDropdown——SelectBox/Combobox 共用下拉面板。E5.8#30.17。
 *
 * 定位 + Portal + 列表骨架一处写（jscpd 0 克隆门禁：两组件不再各写一份 dropdown 结构）。
 * 视觉走 SelectBox.css 的 .selectbox-dropdown/list 类——一个视觉语言一处写。
 * 选项渲染（.selectbox-item）由宿主提供——SelectBox 与 Combobox 的交互模型不同
 * （点击 select vs 输入过滤），候选渲染留在各自组件。
 *
 * E5.8#69：定位改 effect 量测（post-paint）+ resize/scroll 重算，非渲染期同步读 rect——
 * 渲染期读是快照：① 滚动后面板钉旧坐标脱附（悬浮在触发器外）；② 任意 re-render
 * （悬停 focusIdx / 异步选项到达 / 搜索输入）重读 rect → 面板跳变 → mousedown/mouseup
 * 目标错位 → 点击落空「有时选不了 / 点不了」（bug 8/10 实机复现根因）。改后：
 * 面板跟随触发器滚动（scroll 捕获阶段收任意滚动容器），re-render 用稳定 position 状态不重读。
 *
 * 量测时序：layout effect 同步量测（paint 前，无闪烁）。但 React commit 是叶子先序——
 * 若触发器与下拉**同一 commit** 挂载（如测试 harness 一次性 render），祖先 host 的 ref
 * 在子组件 layout effect 之后才 attach → 当时读到 null。生产 SelectBox 是 {open && <Dropdown/>}
 * 条件后挂载（单独 commit，ref 早已就绪）不受影响；这里再补一个 passive effect 兜底
 * （全 commit 后 ref 已 attach），挂载时序无关化——消费方无需知道"必须先挂触发器"契约。
 */

import { useState, useLayoutEffect, useEffect, useCallback } from "react";
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

/** 定位初值——useLayoutEffect 在 paint 前同步量测覆盖，初值不呈现 */
const INITIAL_POS = { left: 0, top: 0, width: 100, maxWidth: 300 };

export default function SelectBoxDropdown({ containerRef, onClose, onKeyDown, listRef, search, children }: SelectBoxDropdownProps) {
  const [pos, setPos] = useState(INITIAL_POS);

  // E5.8#69：量测函数——position 是状态非渲染期快照。ref 为空直接跳过（不 set）。
  const measure = useCallback(() => {
    const r = containerRef.current?.getBoundingClientRect();
    if (!r) return;
    const next = {
      left: Math.round(r.left),
      top: Math.round(r.bottom) + 2,
      width: Math.round(r.width),
      maxWidth: Math.round(window.innerWidth - r.left - 24),
    };
    // 值未变不 set——scroll 高频帧不触发无谓重渲染
    setPos((prev) =>
      prev.left === next.left && prev.top === next.top && prev.width === next.width && prev.maxWidth === next.maxWidth
        ? prev
        : next,
    );
  }, [containerRef]);

  // layout effect 同步量测（paint 前无闪烁）+ resize/scroll（捕获阶段，滚动不冒泡但
  // capture 收任意滚动容器）重算 → 面板跟随触发器。
  useLayoutEffect(() => {
    measure();
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [measure]);

  // 兜底：同 commit 祖先 ref 后 attach 时序下 layout effect 量不到 → 全 commit 后（ref 已
  // 就绪）补量一次。生产条件挂载本不会触发；此为挂载时序无关化（见头注释）。
  useEffect(() => {
    if (!containerRef.current) measure();
  }, [containerRef, measure]);

  return (
    <OverlayPortal onClose={onClose} triggerRef={containerRef}>
      <div
        className="selectbox-dropdown"
        onKeyDown={onKeyDown}
        style={{
          position: "fixed",
          left: pos.left,
          top: pos.top,
          minWidth: pos.width,
          // 动态 maxWidth——面板不超过窗口右边缘 - 24px 呼吸，不硬编码固定值
          maxWidth: pos.maxWidth,
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
