/**
 * ContextMenu（全软件统一菜单渲染器）单测——**子面板的键帽透传**。
 *
 * 为什么钉这一条：`mapChildren` 是「父项 children → 子面板项」的唯一递归口，它漏字段时
 * **顶层照旧正常**（顶层走 `resolved` 那条，`shortcut: item.shortcut` 单列着），只有子面板静默丢
 * ——2026-10-04 用户立案实测：「汉堡菜单那里，快捷键也要」。触发路径 = 汉堡把**同组贡献项折进
 * 「组标签容器」**（`usePoolSync/titlebar.ts` 的 `buildHamburgerGroupItems`）后，插件项从一级
 * 挪进子面板 ⇒ 键帽当场消失；顶栏的嵌套子菜单（查看→界面→主侧栏）吃同一个 bug。
 *
 * 判据分三层，缺一不可：
 *   ① 正控：children 带 shortcut ⇒ hover 出的子面板里**有**键帽（且文本是壳已格式化的显示串）；
 *   ② 负控：子面板里**没有** shortcut 的项不得长出键帽（不是「有 children 就画一个」）；
 *   ③ 孙级：两层嵌套也透传（防只修一层——`查看→界面→主侧栏` 就是两层）。
 * ⛔ 本件不做格式化（`Ctrl+K Ctrl+T` 已是壳侧 `formatKeyLabel` 的产物，池哑渲染）。
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, waitFor } from "@testing-library/react";
import type { MenuItemDescriptor } from "@src/core/api/linkdesk-api";
import ContextMenu from "./ContextMenu";

beforeEach(() => {
  // jsdom 无 scrollIntoView 实现——hover 弹子面板会设焦点项、触发滚动 effect（同 SelectBox 系 stubs）
  Element.prototype.scrollIntoView = vi.fn();
});

/** 子面板里的键帽文本（顶层与子面板同用 `.ldk-ctx-item-shortcut`——按出现顺序取） */
const shortcutTexts = (): string[] =>
  Array.from(document.querySelectorAll(".ldk-ctx-item-shortcut")).map((el) => el.textContent ?? "");

/** 打开菜单并 hover 到指定 label 的父项上（子面板是 hover 弹出，不是点出来的） */
async function hoverParent(label: string): Promise<void> {
  const parent = await waitFor(() => {
    const el = Array.from(document.querySelectorAll(".ldk-ctx-item-label")).find((n) => n.textContent === label);
    if (!el) throw new Error(`父项「${label}」没渲染出来`);
    return el;
  });
  fireEvent.mouseEnter(parent.closest(".ldk-ctx-item")!);
}

function renderMenu(items: MenuItemDescriptor[]): void {
  render(
    <ContextMenu
      menuId="demo-menu"
      anchor={{ x: 10, y: 10 }}
      items={items}
      onClose={vi.fn()}
      variant="overlay"
    />
  );
}

describe("ContextMenu 子面板键帽——children 递归不许丢 shortcut", () => {
  it("正控——父项 children 带 shortcut ⇒ hover 弹的子面板里出现该键帽", async () => {
    renderMenu([
      {
        command: "",
        label: "编辑",
        children: [
          { command: "demo.cut", label: "剪切", shortcut: "Ctrl+X" },
          { command: "demo.copy", label: "复制", shortcut: "Ctrl+C" },
        ],
      },
    ]);

    await hoverParent("编辑");
    await waitFor(() => expect(shortcutTexts()).toEqual(["Ctrl+X", "Ctrl+C"]));
  });

  it("负控——子面板里无 shortcut 的项不长键帽（不是「进子面板就画一个」）", async () => {
    renderMenu([
      {
        command: "",
        label: "编辑",
        children: [
          { command: "demo.cut", label: "剪切", shortcut: "Ctrl+X" },
          { command: "demo.paste", label: "粘贴" },
        ],
      },
    ]);

    await hoverParent("编辑");
    // 两项都渲染出来，但键帽只有「剪切」那一个——「粘贴」不带 shortcut 就是不带
    await waitFor(() => {
      const labels = Array.from(document.querySelectorAll(".ldk-ctx-item-label")).map((n) => n.textContent);
      expect(labels).toContain("剪切");
      expect(labels).toContain("粘贴");
    });
    expect(shortcutTexts()).toEqual(["Ctrl+X"]);
  });

  it("孙级——两层嵌套同样透传（查看→界面→主侧栏 那条路）", async () => {
    renderMenu([
      {
        command: "",
        label: "查看",
        children: [
          {
            command: "",
            label: "界面",
            children: [{ command: "workbench.action.toggleSidebarVisibility", label: "主侧栏", shortcut: "Ctrl+B" }],
          },
        ],
      },
    ]);

    await hoverParent("查看");
    await hoverParent("界面");
    await waitFor(() => expect(shortcutTexts()).toEqual(["Ctrl+B"]));
  });

  it("顶层项键帽照旧（递归那一笔没把顶层弄坏）", async () => {
    renderMenu([{ command: "demo.openSettings", label: "打开设置", shortcut: "Ctrl+," }]);

    await waitFor(() => expect(shortcutTexts()).toEqual(["Ctrl+,"]));
  });
});
