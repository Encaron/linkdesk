/**
 * @vitest-environment jsdom
 * E5.8#50.23：DynamicSelect 动态下拉单元测试。
 * 数据源 = window.linkdesk.theme.listRecipes() + configuration（app.theme 活动配方）；mock 虚构配方（硬约束 21）。
 * 覆盖：colorways 选项 = 活动配方配色（含预览色块）/ 无匹配配方空态 / sources 跟随主题置顶 + 按域过滤 /
 *       app.theme 变化重取（onChange 订阅）+ 选配色 onChange 回调。
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, fireEvent, screen, cleanup } from "@testing-library/react";
import DynamicSelect from "./DynamicSelect";
import { MINT, FOREST, SERIF, mockListRecipes, captureLifecycleChange } from "../theme-recipes.fixture";

afterEach(() => cleanup());

function getConfigStore(): Map<string, unknown> {
  return (globalThis as { __ldkConfigStore?: Map<string, unknown> }).__ldkConfigStore!;
}

/** 捕获 configuration.onChange 注册的 app.theme 回调——模拟活动配方切换 */
function captureThemeChange(): (v: unknown) => void {
  let captured: ((v: unknown) => void) | null = null;
  const lk = window as unknown as {
    linkdesk?: { configuration?: { onChange: (key: string, cb: (v: unknown) => void) => () => void } };
  };
  if (lk.linkdesk?.configuration) {
    lk.linkdesk.configuration.onChange = ((key: string, cb: (v: unknown) => void) => {
      if (key === "app.theme") captured = cb;
      return () => {};
    }) as typeof lk.linkdesk.configuration.onChange;
  }
  return (v: unknown) => { captured?.(v); };
}

beforeEach(() => {
  document.body.innerHTML = "";
  Element.prototype.scrollIntoView = vi.fn();
  getConfigStore().clear();
});

function renderSelect(props: {
  value?: string;
  optionsFrom?: string;
  domain?: string;
}) {
  const onChange = vi.fn();
  const result = render(
    <DynamicSelect
      value={props.value ?? ""}
      onChange={onChange}
      optionsFrom={props.optionsFrom ?? ""}
      domain={props.domain}
    />,
  );
  const open = () => fireEvent.click(result.container.querySelector(".selectbox-trigger")!);
  const dropdownItems = () =>
    Array.from(document.querySelectorAll(".selectbox-item")).map((el) => el.textContent ?? "");
  return { ...result, onChange, open, dropdownItems };
}

describe("DynamicSelect", () => {
  it("colorways——选项 = 活动配方（app.theme）配色", async () => {
    getConfigStore().set("app.theme", "demo-mint");
    mockListRecipes([MINT, FOREST]);
    const { open, dropdownItems } = renderSelect({ optionsFrom: "theme.colorways" });
    open();
    await screen.findByText("Beta");
    const items = dropdownItems();
    expect(items).toContain("Alpha");
    expect(items).toContain("Beta");
    expect(items).not.toContain("Gamma"); // 非活动配方配色不列
  });

  it("colorways——选项带预览色块（ColorwayMeta.preview.accent）", async () => {
    getConfigStore().set("app.theme", "demo-mint");
    mockListRecipes([MINT]);
    const { open } = renderSelect({ optionsFrom: "theme.colorways" });
    open();
    await screen.findByText("Alpha");
    const swatches = Array.from(document.querySelectorAll(".selectbox-swatch"));
    expect(swatches.length).toBe(2);
    expect(swatches[0].getAttribute("style")).toContain("rgb(62, 158, 140)"); // 预览色块 = 配色 accent（#3E9E8C，jsdom 归一为 rgb）
  });

  it("colorways——value 匹配配色 → 触发器显示预览色块 + 配色名", async () => {
    getConfigStore().set("app.theme", "demo-mint");
    mockListRecipes([MINT]);
    const { container } = renderSelect({ optionsFrom: "theme.colorways", value: "dew" });
    await screen.findByText("Alpha");
    const trigger = container.querySelector(".selectbox-label")!;
    expect(trigger.textContent).toBe("Alpha");
    const swatch = trigger.querySelector(".selectbox-swatch");
    expect(swatch?.getAttribute("style")).toContain("rgb(62, 158, 140)");
  });

  it("colorways——无匹配配方 → 空下拉（无匹配项）", async () => {
    getConfigStore().set("app.theme", "demo-ghost"); // 不存在的配方
    mockListRecipes([MINT]);
    const { open } = renderSelect({ optionsFrom: "theme.colorways" });
    open();
    await screen.findByText("无匹配项");
  });

  it("sources——颜色域「跟随主题」置顶 + 配方×配色粒度（决策 B，每配色一选项）", async () => {
    mockListRecipes([MINT, FOREST, SERIF]);
    const { open, dropdownItems } = renderSelect({ optionsFrom: "theme.sources", domain: "colors" });
    open();
    await screen.findByText("Demo Mint·Alpha");
    const items = dropdownItems();
    expect(items[0]).toBe("跟随主题");
    expect(items).toContain("Demo Mint·Alpha");
    expect(items).toContain("Demo Mint·Beta"); // 同配方两配色各一选项
    expect(items).toContain("Demo Forest·Gamma");
    expect(items).not.toContain("Demo Serif"); // 只贡献 font 域——colors 行排除
  });

  it("sources——font 域过滤只列贡献 font 的配方", async () => {
    mockListRecipes([MINT, SERIF]);
    const { open, dropdownItems } = renderSelect({ optionsFrom: "theme.sources", domain: "font" });
    open();
    await screen.findByText("Demo Serif");
    const items = dropdownItems();
    expect(items[0]).toBe("跟随主题");
    expect(items).toContain("Demo Serif");
    expect(items).not.toContain("Demo Mint");
  });

  it("sources——无 domain → 全部配方（含「跟随主题」）", async () => {
    mockListRecipes([MINT, SERIF]);
    const { open, dropdownItems } = renderSelect({ optionsFrom: "theme.sources" });
    open();
    await screen.findByText("Demo Mint");
    const items = dropdownItems();
    expect(items[0]).toBe("跟随主题");
    expect(items).toContain("Demo Mint");
    expect(items).toContain("Demo Serif");
  });

  it("colorways——app.theme 变化（onChange 订阅）→ 重取新配方配色", async () => {
    getConfigStore().set("app.theme", "demo-mint");
    const triggerThemeChange = captureThemeChange();
    mockListRecipes([MINT, FOREST]);
    const { open, dropdownItems } = renderSelect({ optionsFrom: "theme.colorways" });
    open();
    await screen.findByText("Alpha");
    expect(dropdownItems()).toContain("Beta");

    // 活动配方切到 demo-forest——只贡献单配色 Gamma
    getConfigStore().set("app.theme", "demo-forest");
    triggerThemeChange("demo-forest");
    await screen.findByText("Gamma");
    const items = dropdownItems();
    expect(items).toContain("Gamma");
    expect(items).not.toContain("Alpha");
  });

  it("选配色 → onChange(配色 id)", async () => {
    getConfigStore().set("app.theme", "demo-mint");
    mockListRecipes([MINT]);
    const { open, onChange } = renderSelect({ optionsFrom: "theme.colorways" });
    open();
    await screen.findByText("Alpha");
    fireEvent.click(screen.getByText("Beta"));
    expect(onChange).toHaveBeenCalledWith("tea");
  });

  it("listRecipes 不可用 → 空下拉（不抛错）", async () => {
    const { open } = renderSelect({ optionsFrom: "theme.sources", domain: "colors" });
    open();
    await screen.findByText("无匹配项");
  });

  it("插件生命周期变化（onPluginLifecycleChange）→ 重取配方（E5.8#60 F1.3）", async () => {
    const triggerLifecycle = captureLifecycleChange();
    mockListRecipes([MINT]);
    const { open, dropdownItems } = renderSelect({ optionsFrom: "theme.sources", domain: "colors" });
    open();
    await screen.findByText("Demo Mint·Alpha");
    expect(dropdownItems()).not.toContain("Demo Forest·Gamma");
    // 热装新配方 → 配方集变化 → sources 选项刷新（含新配方，colors 行）
    mockListRecipes([MINT, FOREST]);
    triggerLifecycle();
    await screen.findByText("Demo Forest·Gamma");
    const items = dropdownItems();
    expect(items).toContain("Demo Forest·Gamma");
    expect(items[0]).toBe("跟随主题"); // 置顶项不被刷新破坏
  });
});
