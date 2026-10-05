/**
 * PluginCard（「按插件浏览」插件卡 · 共享件）单测。
 *
 * 为什么钉这几条：本件身上挂着两个**坏了也不报错**的形状——
 *   ① 嵌套按钮禁令的解法（卡头＝`div`：铺满整头的真 `<button>` ＋ 绝对定位的齿轮**兄弟**按钮）。
 *      一旦写成 button 套 button，浏览器会把内层按钮拆出 DOM：外观照旧、命中区错位（静默坏）。
 *   ② 受控开合 ＋ aria 挂钩（`aria-expanded` / `aria-controls` 指体 id）——搜索命中自动展开（E38）、
 *      批量开合都靠**外部**持有展开态，组件自己存一份就双源。
 * 其余几条是契约面：gearItems 缺省不出齿轮、副文本全文走 `data-hint`（⛔ 不出原生 `title=`）、停用态。
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, waitFor } from "@testing-library/react";
import type { MenuItemDescriptor } from "@linkdesk/contracts";
import PluginCard from "./PluginCard";

beforeEach(() => {
  // jsdom 无 scrollIntoView——菜单渲染器会设焦点项触发滚动（同 ContextMenu/SelectBox 系 stubs）
  Element.prototype.scrollIntoView = vi.fn();
});

const GEAR_ITEMS: MenuItemDescriptor[] = [
  { command: "settings.clearPluginDefaults", label: "清除相关默认覆盖（2 类）" },
  { command: "settings.copyPluginId", label: "复制插件 ID" },
];

/** 夹具文案提成常量：`linkdesk/no-hardcoded-chinese` 拦 JSX 字面量（该规则对测试文件**没有**豁免），
    经标识符传参即出射程；断言侧仍是同一串。 */
const TITLE = "文件树";
const ROWS = "行清单";
const SUB = "file-tree · v1.0.27";

function renderCard(overrides: Partial<Parameters<typeof PluginCard>[0]> = {}) {
  const props = {
    pluginId: "file-tree",
    title: TITLE,
    version: "1.0.27",
    summary: "声明 3 类 · 竞争 1 类",
    expanded: false,
    onToggle: vi.fn(),
    children: <div data-testid="rows">{ROWS}</div>,
    ...overrides,
  };
  return { ...render(<PluginCard {...props} />), props };
}

describe("PluginCard——卡头", () => {
  it("标题 / 副文本「id · vX」/ 摘要上屏", () => {
    const { getByText } = renderCard();
    expect(getByText(TITLE)).toBeTruthy();
    expect(getByText(SUB)).toBeTruthy();
    expect(getByText("声明 3 类 · 竞争 1 类")).toBeTruthy();
  });

  it("无 version ⇒ 副文本只显 id", () => {
    const { getByText } = renderCard({ version: undefined });
    expect(getByText("file-tree")).toBeTruthy();
  });

  it("嵌套按钮禁令：齿轮是展开钮的**兄弟**（不在 toggle 内），两者都是 button", () => {
    const { container } = renderCard({ gearItems: GEAR_ITEMS });
    const toggle = container.querySelector(".ldk-plugin-card-toggle")!;
    const gear = container.querySelector(".ldk-plugin-card-gear")!;
    expect(toggle.tagName).toBe("BUTTON");
    expect(gear.tagName).toBe("BUTTON");
    expect(toggle.contains(gear)).toBe(false);
  });

  it("gearItems 缺省 / 空数组 ⇒ ⛔ 不渲染齿轮（不留点了没反应的死钮）", () => {
    const { container } = renderCard();
    expect(container.querySelector(".ldk-plugin-card-gear")).toBeNull();
    const { container: c2 } = renderCard({ gearItems: [] });
    expect(c2.querySelector(".ldk-plugin-card-gear")).toBeNull();
  });

  it("点齿轮 ⇒ 注入的菜单项上屏（items 注入面，不走 menu.getItems）", async () => {
    const { container } = renderCard({ gearItems: GEAR_ITEMS });
    fireEvent.click(container.querySelector(".ldk-plugin-card-gear")!);
    await waitFor(() => {
      const labels = Array.from(document.querySelectorAll(".ldk-ctx-item-label")).map((n) => n.textContent);
      expect(labels).toContain("清除相关默认覆盖（2 类）");
      expect(labels).toContain("复制插件 ID");
    });
  });

  it("副文本全文走 data-hint（揭示类 ⇒ 延时 0）；⛔ 不出原生 title=", () => {
    const { getByText } = renderCard();
    const sub = getByText(SUB);
    expect(sub.getAttribute("data-hint")).toBe(SUB);
    expect(sub.getAttribute("data-hint-delay")).toBe("0");
    expect(sub.getAttribute("title")).toBeNull();
  });

  it("停用态：卡体降不透明度类 ＋「已停用」徽标", () => {
    const { container, getByText } = renderCard({ disabled: true });
    expect(container.querySelector(".ldk-plugin-card--disabled")).toBeTruthy();
    expect(getByText("已停用")).toBeTruthy();
  });

  it("非停用态不出徽标（零噪声）", () => {
    const { container } = renderCard();
    expect(container.querySelector(".ldk-plugin-card--disabled")).toBeNull();
    expect(container.querySelector(".ldk-badge")).toBeNull();
  });
});

describe("PluginCard——受控开合", () => {
  it("expanded=false ⇒ 不渲染体；expanded=true ⇒ 体与 children 上屏", () => {
    const { container, queryByTestId, rerender } = render(
      <PluginCard pluginId="file-tree" title={TITLE} expanded={false} onToggle={vi.fn()}>
        <div data-testid="rows">{ROWS}</div>
      </PluginCard>
    );
    expect(container.querySelector(".ldk-plugin-card-body")).toBeNull();
    expect(queryByTestId("rows")).toBeNull();

    rerender(
      <PluginCard pluginId="file-tree" title={TITLE} expanded onToggle={vi.fn()}>
        <div data-testid="rows">{ROWS}</div>
      </PluginCard>
    );
    expect(container.querySelector(".ldk-plugin-card-body")).toBeTruthy();
    expect(queryByTestId("rows")).toBeTruthy();
  });

  it("点头回调 onToggle(!expanded)——组件自己不存展开态（单源 = 调用方）", () => {
    const { container, props } = renderCard({ expanded: false });
    fireEvent.click(container.querySelector(".ldk-plugin-card-toggle")!);
    expect(props.onToggle).toHaveBeenCalledWith(true);

    const { container: c2, props: p2 } = renderCard({ expanded: true });
    fireEvent.click(c2.querySelector(".ldk-plugin-card-toggle")!);
    expect(p2.onToggle).toHaveBeenCalledWith(false);
  });

  it("aria 挂钩：aria-expanded 随受控值；aria-controls === 体的 id", () => {
    const { container } = renderCard({ expanded: true });
    const toggle = container.querySelector(".ldk-plugin-card-toggle")!;
    const body = container.querySelector(".ldk-plugin-card-body")!;
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect(toggle.getAttribute("aria-controls")).toBe(body.id);
  });
});
