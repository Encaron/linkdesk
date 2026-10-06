/**
 * @vitest-environment jsdom
 * ObjectEditor（尾巴 T2）：键改名／布尔开关／数字／文本／删行／加行的写盘语义，
 * 以及 🔴「新增行的键名是**数据**、不是文案」这条——它必须在共享层被钉住：
 * 本件零 useTranslation，件内不存在任何可被翻译成键名的路径。
 * 零 @src/core import——纯 UI 行为断言。
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import { render, fireEvent, cleanup } from "@testing-library/react";

import ObjectEditor from "./ObjectEditor";

afterEach(() => {
  cleanup();
});

const LABELS = {
  addLabel: "添加模式",
  deleteLabel: "删除",
  onLabel: "已启用",
  offLabel: "已禁用",
};

function setup(value: Record<string, unknown>, newKeyBase?: string) {
  const onChange = vi.fn();
  const utils = render(
    <ObjectEditor value={value} onChange={onChange} {...LABELS} newKeyBase={newKeyBase} />,
  );
  return { onChange, ...utils };
}

describe("ObjectEditor", () => {
  it("逐行渲染：键框 ＋ 冒号 ＋ 值体 ＋ 删行；布尔值出开关并带 props 注入的文案", () => {
    const { container } = setup({ a: true, b: "x" });
    const rows = container.querySelectorAll(".ldk-object-editor__row");
    expect(rows).toHaveLength(2);
    expect((rows[0].querySelector(".ldk-object-editor__key") as HTMLInputElement).value).toBe("a");
    const toggle = rows[0].querySelector(".ldk-object-editor__toggle") as HTMLElement;
    expect(toggle.getAttribute("aria-label")).toBe("已启用");
    expect(rows[1].querySelector(".ldk-object-editor__toggle")).toBeNull();
    expect((rows[1].querySelector(".ldk-object-editor__value") as HTMLInputElement).value).toBe("x");
    expect((container.querySelector(".ldk-object-editor__delete") as HTMLElement).getAttribute("aria-label")).toBe("删除");
  });

  it("布尔开关取反写回，其余键原样保留", () => {
    const { onChange, container } = setup({ a: false, b: "x" });
    fireEvent.click(container.querySelector(".ldk-object-editor__toggle") as HTMLElement);
    expect(onChange).toHaveBeenCalledWith({ a: true, b: "x" });
  });

  it("键改名走失焦，且**保序**（原位置换名，不挪到队尾）", () => {
    const { onChange, container } = setup({ a: 1, b: 2, c: 3 });
    const firstKey = container.querySelector(".ldk-object-editor__key") as HTMLInputElement;
    fireEvent.blur(firstKey, { target: { value: "z" } });
    expect(onChange).toHaveBeenCalledWith({ z: 1, b: 2, c: 3 });
    expect(Object.keys(onChange.mock.calls[0][0])).toEqual(["z", "b", "c"]);
  });

  it("同名失焦不写回（零抖动）", () => {
    const { onChange, container } = setup({ a: 1 });
    fireEvent.blur(container.querySelector(".ldk-object-editor__key") as HTMLInputElement, {
      target: { value: "a" },
    });
    expect(onChange).not.toHaveBeenCalled();
  });

  it("数字值失焦转 Number（字符串 \"42\" → 42）", () => {
    const { onChange, container } = setup({ n: 1 });
    fireEvent.blur(container.querySelector(".ldk-object-editor__value") as HTMLInputElement, {
      target: { value: "42" },
    });
    expect(onChange).toHaveBeenCalledWith({ n: 42 });
  });

  it("文本值失焦按字符串写回", () => {
    const { onChange, container } = setup({ s: "old" });
    fireEvent.blur(container.querySelector(".ldk-object-editor__value") as HTMLInputElement, {
      target: { value: "new" },
    });
    expect(onChange).toHaveBeenCalledWith({ s: "new" });
  });

  it("删行只摘该键，其余键序不变", () => {
    const { onChange, container } = setup({ a: 1, b: 2, c: 3 });
    fireEvent.click(container.querySelectorAll(".ldk-object-editor__delete")[1] as HTMLElement);
    expect(onChange).toHaveBeenCalledWith({ a: 1, c: 3 });
  });

  it("新增行键名 = newKeyBase（数据键名，⛔ 不翻译），初值 true，按钮文案来自 props", () => {
    const { onChange, container } = setup({ a: 1 }, "newPattern");
    const add = container.querySelector(".ldk-object-editor__add") as HTMLElement;
    expect(add.textContent).toContain("添加模式");
    fireEvent.click(add);
    expect(onChange).toHaveBeenCalledWith({ a: 1, newPattern: true });
  });

  it("基名被占则依次追加 1／2…（迁移前逐字一致的规则）", () => {
    const { onChange, container } = setup({ newPattern: true, newPattern1: false }, "newPattern");
    fireEvent.click(container.querySelector(".ldk-object-editor__add") as HTMLElement);
    expect(onChange).toHaveBeenCalledWith({
      newPattern: true,
      newPattern1: false,
      newPattern2: true,
    });
  });

  it("键集为空时只渲染加行按钮（零行 + 可加）", () => {
    const { container } = setup({});
    expect(container.querySelectorAll(".ldk-object-editor__row")).toHaveLength(0);
    expect(container.querySelector(".ldk-object-editor__add")).not.toBeNull();
  });
});
