/**
 * @vitest-environment jsdom
 * E5.8#50.22：ThemePicker 主题配方卡片单元测试。
 * listRecipes mock 数据（虚构配方名/配色名——硬约束 21 测试卫生）。
 * 覆盖：卡片渲染 / 单配色预览条 + 配色名徽标 / 多配色圆点 + 计数徽标 / 选中态 / 点卡片 onChange / 空态 / 键盘移动焦点。
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, fireEvent, cleanup } from "@testing-library/react";
import ThemePicker from "./ThemePicker";
import "@src/i18n"; // 装 parseMissingKeyHandler——{{count}} 插值在 jsdom 无资源时也替换（徽标计数断言）
import { MINT, FOREST, mockListRecipes } from "../theme-recipes.fixture";

afterEach(() => cleanup());

beforeEach(() => {
  // 每测试重设 theme API——listRecipes 由用例注入（as unknown as 收窄，同 dependencies.test 先例）
  const lk = window as unknown as { linkdesk?: { theme?: unknown } };
  if (lk.linkdesk) lk.linkdesk.theme = undefined;
});

function renderPicker(value = "demo-mint") {
  const onChange = vi.fn();
  const result = render(<ThemePicker value={value} onChange={onChange} />);
  return { ...result, onChange };
}

describe("ThemePicker", () => {
  it("渲染 listRecipes 返回的配方卡片（名称可见）", async () => {
    mockListRecipes([MINT, FOREST]);
    const { container } = renderPicker();
    // listRecipes 是 async IPC——等一帧
    await vi.waitFor(() => {
      expect(container.querySelectorAll(".theme-card")).toHaveLength(2);
    });
    expect(container.textContent).toContain("Demo Mint");
    expect(container.textContent).toContain("Demo Forest");
  });

  it("单配色配方——3 预览条 + 配色名徽标", async () => {
    mockListRecipes([FOREST]);
    const { container } = renderPicker("demo-forest");
    await vi.waitFor(() => {
      expect(container.querySelector(".theme-card")).toBeTruthy();
    });
    const card = container.querySelector(".theme-card")!;
    expect(card.querySelectorAll(".pv-bar")).toHaveLength(3);
    expect(card.querySelectorAll(".pv-dot")).toHaveLength(0);
    expect(card.querySelector(".badge")?.textContent).toBe("Gamma");
  });

  it("多配色配方——圆点（≤6）+ 计数徽标", async () => {
    mockListRecipes([MINT]);
    const { container } = renderPicker();
    await vi.waitFor(() => {
      expect(container.querySelector(".theme-card")).toBeTruthy();
    });
    const card = container.querySelector(".theme-card")!;
    expect(card.querySelectorAll(".pv-dot")).toHaveLength(2);
    expect(card.querySelector(".badge")?.textContent).toContain("2");
  });

  it("value 匹配 → 选中态（active class + aria-pressed）", async () => {
    mockListRecipes([MINT, FOREST]);
    const { container } = renderPicker("demo-forest");
    await vi.waitFor(() => {
      expect(container.querySelectorAll(".theme-card")).toHaveLength(2);
    });
    const cards = container.querySelectorAll(".theme-card");
    expect(cards[0].classList.contains("active")).toBe(false);
    expect(cards[1].classList.contains("active")).toBe(true);
    expect(cards[1].getAttribute("aria-pressed")).toBe("true");
  });

  it("点卡片 → onChange(recipeId)", async () => {
    mockListRecipes([MINT, FOREST]);
    const { container, onChange } = renderPicker();
    await vi.waitFor(() => {
      expect(container.querySelectorAll(".theme-card")).toHaveLength(2);
    });
    fireEvent.click(container.querySelectorAll(".theme-card")[1]!);
    expect(onChange).toHaveBeenCalledWith("demo-forest");
  });

  it("空列表 → 空态提示", async () => {
    mockListRecipes([]);
    const { container } = renderPicker();
    await vi.waitFor(() => {
      expect(container.querySelector(".theme-picker-empty")).toBeTruthy();
    });
  });

  it("listRecipes 不可用 → 空态兜底（不抛错）", async () => {
    const { container } = renderPicker();
    await vi.waitFor(() => {
      expect(container.querySelector(".theme-picker-empty")).toBeTruthy();
    });
  });

  it("键盘——ArrowRight 移动焦点到下一卡片", async () => {
    mockListRecipes([MINT, FOREST]);
    const { container } = renderPicker();
    await vi.waitFor(() => {
      expect(container.querySelectorAll(".theme-card")).toHaveLength(2);
    });
    const grid = container.querySelector(".theme-picker")!;
    fireEvent.keyDown(grid, { key: "ArrowRight" });
    const cards = container.querySelectorAll(".theme-card");
    expect(document.activeElement).toBe(cards[1]);
    expect(cards[1].getAttribute("tabindex")).toBe("0");
    expect(cards[0].getAttribute("tabindex")).toBe("-1");
  });
});
