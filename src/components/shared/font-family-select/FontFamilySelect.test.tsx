/**
 * @vitest-environment jsdom
 * E5.8#50.20：FontFamilySelect 通用字族化单元测试。
 * monoOnly 双模式 / 「跟随主题」选项与复位 / 当前值边界（非系统值只显示不提供下拉选项）/ 选择回调。
 * jsdom 无 queryLocalFonts + canvas 2D → 走 FALLBACK 列表（全字族模式）；
 * mono 模式 isMonospace 全 false → 列表为空（只测占位符与无「跟随主题」）。
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, fireEvent, screen, cleanup } from "@testing-library/react";
import FontFamilySelect from "./FontFamilySelect";

beforeEach(() => {
  // OverlayPortal 用 window/document——清 body 残留 portal
  document.body.innerHTML = "";
  // jsdom 无 scrollIntoView 实现——滚动高亮项 stub（SelectBox 同款滚动 effect）
  Element.prototype.scrollIntoView = vi.fn();
  // jsdom canvas 2D 走慢速真实字体加载（measureText 触发字体 fallback，等宽判 19 族会超时）——
  // mock 快速测量：等宽判定用固定宽度 = 恒等宽命中（FALLBACK_MONO 全过），确定性 + 不超时
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
    font: "",
    measureText: () => ({ width: 4 }),
  } as unknown as CanvasRenderingContext2D);
});

afterEach(() => cleanup());

function renderSelect(overrides: Record<string, unknown> = {}) {
  const onChange = vi.fn();
  const props = { value: "", onChange, ...overrides };
  const result = render(<FontFamilySelect {...props} />);
  const triggerLabel = () => result.container.querySelector(".selectbox-label")?.textContent ?? "";
  const dropdownItems = () =>
    Array.from(document.querySelectorAll(".selectbox-item")).map((el) => el.textContent ?? "");
  const open = () => fireEvent.click(result.container.querySelector(".selectbox-trigger")!);
  return { ...result, onChange, triggerLabel, dropdownItems, open };
}

describe("FontFamilySelect", () => {
  it("全字族模式——空值 = 跟随主题（占位符）", () => {
    const { triggerLabel } = renderSelect({ monoOnly: false });
    expect(triggerLabel()).toBe("跟随主题");
  });

  it("全字族模式——下拉含「跟随主题」复位选项置顶 + 比例族（非等宽也在列）", async () => {
    const { open, dropdownItems } = renderSelect({ monoOnly: false });
    open();
    // 等 fallback 字体列表微任务落地
    await screen.findByText("Times New Roman");
    const items = dropdownItems();
    expect(items[0]).toBe("跟随主题"); // 复位选项置顶
    expect(items).toContain("Times New Roman"); // 比例族在列
  });

  it("全字族模式——非系统当前值（资产族名）只显示不提供下拉选项", async () => {
    const { open, triggerLabel, dropdownItems } = renderSelect({ monoOnly: false, value: "__ld_demo_serif" });
    expect(triggerLabel()).toBe("__ld_demo_serif"); // 触发按钮显示真实值（只显示）
    open();
    await screen.findByText("Times New Roman"); // 列表已加载
    expect(dropdownItems()).not.toContain("__ld_demo_serif"); // 下拉不含资产族名（不提供选项）
  });

  it("全字族模式——选字体 → onChange 传族名", async () => {
    const { open, onChange } = renderSelect({ monoOnly: false });
    open();
    const target = await screen.findByText("SimSun");
    fireEvent.click(target);
    expect(onChange).toHaveBeenCalledWith("SimSun");
  });

  it("全字族模式——选「跟随主题」→ onChange('')（复位）", () => {
    const { open, onChange } = renderSelect({ monoOnly: false, value: "SimSun" });
    open();
    const followTheme = Array.from(document.querySelectorAll(".selectbox-item"))
      .find((n) => n.textContent === "跟随主题")!;
    fireEvent.click(followTheme);
    expect(onChange).toHaveBeenCalledWith("");
  });

  it("等宽模式（缺省）——空值显示「选择等宽字体…」，下拉只列等宽族、无「跟随主题」选项", async () => {
    const { open, triggerLabel, dropdownItems } = renderSelect({}); // monoOnly 缺省 = true
    expect(triggerLabel()).toBe("选择等宽字体…");
    open();
    await screen.findByText("Consolas"); // mock 测量恒等宽 → FALLBACK_MONO 全列
    const items = dropdownItems();
    expect(items).toContain("Consolas"); // 等宽族在列
    expect(items).not.toContain("跟随主题"); // 等宽模式无主题跟随概念
  });
});
