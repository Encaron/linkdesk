/**
 * KeybindingHint（键帽）单测——04「悬停提示系统」件 1（用户拍板③「统一到键帽」）。
 *
 * 它是全软件**唯一**的快捷键长相（右键菜单 + 提示条 + 命令面板三处同吃）——所以钉的是
 * 「已格式化串 → 键帽切分」这一步的边界：chord 用空格分、chord 内用 `+` 分、空串不出空壳。
 * ⛔ 本件不做格式化（那是壳侧 `core/utils/formatKeyLabel` 的活，池层拿到的已是显示串）。
 */
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import KeybindingHint from "./KeybindingHint";

describe("KeybindingHint 键帽渲染", () => {
  it("单 chord 两键 ⇒ 两个 kbd + 一个 `+` 分隔（Ctrl+K）", () => {
    const { container } = render(<KeybindingHint label="Ctrl+K" />);
    const kbds = container.querySelectorAll("kbd");
    expect(Array.from(kbds).map((k) => k.textContent)).toEqual(["Ctrl", "K"]);
    expect(container.textContent).toBe("Ctrl+K");
    expect(container.querySelector(".ldk-keybinding-hint-sep")).not.toBeNull();
  });

  it("两 chord ⇒ 四个 kbd（Ctrl/K/Ctrl/T）、两组、chord 之间靠**间距类**分开而非 `+`（Ctrl+K Ctrl+T）", () => {
    const { container } = render(<KeybindingHint label="Ctrl+K Ctrl+T" />);
    expect(Array.from(container.querySelectorAll("kbd")).map((k) => k.textContent)).toEqual(["Ctrl", "K", "Ctrl", "T"]);
    expect(container.querySelectorAll(".ldk-keybinding-hint-chord")).toHaveLength(2);
    expect(container.querySelectorAll(".ldk-keybinding-hint-chord--spaced")).toHaveLength(1);
    // 两段的间隔**只由 CSS margin 承担**（DOM 里不插空格文本）——故 textContent 连着写。
    // 这样键帽宽度不被空格撑开（空格宽度随字体变），间隔是一个固定 6px。
    expect(container.textContent).toBe("Ctrl+KCtrl+T");
  });

  it("className ⇒ 与根类并列（调用方只做布局落位，如右键菜单的槽位）", () => {
    render(<KeybindingHint label="Ctrl+W" className="ldk-ctx-item-shortcut" />);
    const root = screen.getByText("Ctrl").closest(".ldk-keybinding-hint")!;
    expect(root.className).toBe("ldk-keybinding-hint ldk-ctx-item-shortcut");
  });

  it("保底④：空串 / 纯空白 ⇒ null（不出空键帽壳）", () => {
    expect(render(<KeybindingHint label="" />).container.innerHTML).toBe("");
    expect(render(<KeybindingHint label="   " />).container.innerHTML).toBe("");
  });

  it("乱写的多余空格/加号不产生空键帽（split 后过滤空段）", () => {
    const { container } = render(<KeybindingHint label="Ctrl+ K" />);
    expect(Array.from(container.querySelectorAll("kbd")).map((k) => k.textContent)).toEqual(["Ctrl", "K"]);
  });
});
