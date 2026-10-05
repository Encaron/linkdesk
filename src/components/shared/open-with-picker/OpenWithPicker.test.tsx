/**
 * OpenWithPicker 口径单测——**一律居中 + 遮罩**（案 03 §3.0′，2026-10-05 用户改判）。
 *
 * 钉的是两条**坏了也不报错**的形状（分叉回来时测试必须出声）：
 *   ① 面板恒为居中模态：唯一形态 ⇒ ⛔ 不许再长出 `--centered` / `--clear` 之类的形态修饰类，
 *      也不许出现内联 `left/top`；
 *   ② `request.anchor` **被忽略**：传了锚点也必须居中、点击层也不许变透明——契约字段保留只为
 *      兼容已发布面（`@deprecated`），旧调用方（file-tree 右键）照传不误。
 * 其余几条是既有契约面：空态去市场 / 双动作按钮 / 按类型入口不留死钮 / 显式默认行。
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render } from "@testing-library/react";
import "../../../i18n";
import OpenWithPicker from "./OpenWithPicker";
import type { OpenWithHandler, OpenWithRequest } from "./types";

afterEach(() => cleanup());

const handler: OpenWithHandler = {
  pluginId: "demo-plugin",
  title: "演示处理器",
  typeLabel: "演示类型",
  isDefault: true,
  isAuto: true,
};

function renderPicker(request?: OpenWithRequest, handlers: OpenWithHandler[] = [handler]) {
  const spies = {
    onOpenOnce: vi.fn(),
    onSetDefault: vi.fn(),
    onSearchMarket: vi.fn(),
    onClose: vi.fn(),
  };
  render(
    <OpenWithPicker
      request={request ?? { uri: "C:/demo/样例.txt", name: "样例.txt", ext: "txt" }}
      handlers={handlers}
      {...spies}
    />,
  );
  return spies;
}

const panel = () => document.querySelector<HTMLElement>(".ldk-openwith")!;
const scrim = () => document.querySelector<HTMLElement>(".ldk-openwith-scrim")!;

describe("OpenWithPicker——一律居中 + 遮罩（案 03 §3.0′）", () => {
  it("恒居中：面板只有基类、无内联定位；遮罩恒着色（⛔ 无 --clear）", () => {
    renderPicker();

    expect(panel().className).toBe("ldk-openwith");
    expect(panel().getAttribute("style")).toBeNull(); // 居中由 CSS inset:0/margin:auto 承担
    expect(panel().getAttribute("aria-modal")).toBe("true");
    expect(panel().getAttribute("role")).toBe("dialog");

    expect(scrim().className).toBe("ldk-openwith-scrim");
  });

  it("🔴 回归：入参带 `anchor` 也必须居中——锚定态已废止（字段被忽略）", () => {
    renderPicker({ uri: "C:/demo/样例.txt", name: "样例.txt", ext: "txt", anchor: { x: 900, y: 700 } });

    expect(panel().getAttribute("style")).toBeNull(); // 旧实现会内联 left/top（就近弹出）
    expect(scrim().className).toBe("ldk-openwith-scrim"); // 旧实现会加 --clear（透明点击层）
  });

  it("点遮罩 = 关面板", () => {
    const spies = renderPicker();
    fireEvent.click(scrim());
    expect(spies.onClose).toHaveBeenCalledTimes(1);
  });

  it("空态：「在市场搜索阅读器」回调 onSearchMarket（面板去留由壳侧动作回执决定）", () => {
    const spies = renderPicker(undefined, []);
    expect(document.querySelector(".ldk-openwith-market")).toBeTruthy();
    fireEvent.click(document.querySelector(".ldk-openwith-market")!);
    expect(spies.onSearchMarket).toHaveBeenCalledTimes(1);
  });

  it("有处理器：双动作按钮各回各的 pluginId", () => {
    const spies = renderPicker();
    const acts = document.querySelectorAll<HTMLElement>(".ldk-openwith-act");
    expect(acts).toHaveLength(2); // 打开（仅此一次） ＋ 设为默认
    fireEvent.click(acts[0]!);
    fireEvent.click(acts[1]!);
    expect(spies.onOpenOnce).toHaveBeenCalledWith("demo-plugin");
    expect(spies.onSetDefault).toHaveBeenCalledWith("demo-plugin");
  });

  it("按类型入口（无 uri）：不留「打开（仅此一次）」死钮（E17/E39）", () => {
    renderPicker({ ext: "ts" });
    expect(document.querySelectorAll(".ldk-openwith-act")).toHaveLength(1);
  });

  it("显式默认（isAuto=false）：出「当前默认」行，「恢复自动」回 null", () => {
    const spies = renderPicker(undefined, [{ ...handler, isAuto: false }]);
    expect(document.querySelector(".ldk-openwith-cur")).toBeTruthy();
    fireEvent.click(document.querySelector(".ldk-openwith-auto")!);
    expect(spies.onSetDefault).toHaveBeenCalledWith(null);
  });
});
