/**
 * SelectBoxDropdown 定位测试（E5.8#69）。
 * 回归守卫：定位是 effect 量测状态（非渲染期同步读 rect 快照）——
 * ① 滚动重算跟随触发器（修复脱附）；② 无布局变化的重渲染不重读 rect（修复点击错位）。
 *
 * 挂载时序：生产是 {open && <Dropdown/>} 条件后挂载（触发器 wrapper 先 commit、ref 已 attach，
 * dropdown 单独 commit 挂载）→ 测试两段式模拟：先 render 触发器（open=false），再 rerender 挂
 * dropdown。单段一次性 render 会触发「祖先 ref 后 attach」竞态（组件内 passive effect 兜底覆盖，
 * 但测试守生产主路径）。
 *
 * jsdom 默认 getBoundingClientRect 全 0——原型级 mockImplementation（每次调用读当前 rectValue，
 * 测试改 rectValue 驱动滚动重算）驱动触发器 rect。
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, fireEvent, cleanup } from "@testing-library/react";
import { useRef } from "react";
import type { ReactNode } from "react";
import SelectBoxDropdown from "./SelectBoxDropdown";

/** 原型级 mock——render 前生效（layout effect 量测读到它）；mockImplementation 每次读当前值 */
let rectValue = { top: 100, bottom: 130, left: 50, width: 200 };
let rectSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  rectValue = { top: 100, bottom: 130, left: 50, width: 200 };
  rectSpy = vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(() => rectValue as DOMRect);
});
afterEach(() => {
  rectSpy.mockRestore();
  cleanup();
});

/** 触发器 wrapper + 条件挂载的 dropdown——模拟生产 {open && <Dropdown/>} 时序 */
function Harness({ open = true, children }: { open?: boolean; children?: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  return (
    <div data-testid="trigger" ref={ref}>
      {open && (
        <SelectBoxDropdown containerRef={ref} onClose={() => {}}>
          {children ?? <li>demo-option</li>}
        </SelectBoxDropdown>
      )}
    </div>
  );
}

function getDropdown(): HTMLElement {
  const dd = document.body.querySelector(".ldk-selectbox-dropdown") as HTMLElement;
  if (!dd) throw new Error("dropdown not mounted");
  return dd;
}

describe("SelectBoxDropdown — 定位 effect 量测（E5.8#69 回归守卫）", () => {
  it("打开时按触发器 rect 定位（left / top=bottom+2 / minWidth）", () => {
    const { rerender } = render(<Harness open={false} />);
    rerender(<Harness open />); // 条件后挂载——dropdown 单独 commit，ref 已就绪
    const dd = getDropdown();
    expect(dd.style.left).toBe("50px");
    expect(dd.style.top).toBe("132px"); // bottom 130 + 2
    expect(dd.style.minWidth).toBe("200px");
  });

  it("滚动重算——面板跟随触发器移动（修复脱附）", () => {
    const { rerender } = render(<Harness open={false} />);
    rerender(<Harness open />);
    const dd = getDropdown();
    expect(dd.style.top).toBe("132px");

    // 触发器随滚动上移 60px → 滚动事件 → 重算 → 面板跟随
    rectValue = { top: 40, bottom: 70, left: 50, width: 200 };
    fireEvent.scroll(window);
    expect(dd.style.top).toBe("72px"); // 70 + 2——跟随触发器
    expect(dd.style.left).toBe("50px");
  });

  it("无布局变化的重渲染不重读 rect——position 状态稳定（修复点击错位）", () => {
    const { rerender } = render(<Harness open={false} />);
    rerender(<Harness open />);
    const dd = getDropdown();
    expect(dd.style.top).toBe("132px");

    // 重渲染（children 变化）——rect 未变 → position 应保持不变
    rerender(<Harness open>{<li>another-option</li>}</Harness>);
    expect(dd.style.top).toBe("132px");
    expect(dd.style.left).toBe("50px");
  });

  it("rect 变化 + 重渲染（无滚动）→ 不自动重读——position 保持旧值（量测只在 scroll/resize/open）", () => {
    const { rerender } = render(<Harness open={false} />);
    rerender(<Harness open />);
    const dd = getDropdown();
    expect(dd.style.top).toBe("132px");

    // rect 变了（布局移动）但无 scroll/resize 事件 → 纯重渲染不重读
    rectValue = { top: 300, bottom: 330, left: 50, width: 200 };
    rerender(<Harness open>{<li>third-option</li>}</Harness>);
    expect(dd.style.top).toBe("132px"); // 仍旧位置——证明非渲染期快照
  });
});
