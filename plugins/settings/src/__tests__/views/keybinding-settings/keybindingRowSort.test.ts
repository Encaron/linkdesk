/**
 * E5.8#184 快捷键设置行排序——纯函数单测（settings 插件无组件测试基建，比较器抽纯函数直测）。
 * 规则对齐 VS Code compareKeybindingData 第一优先级：有绑定的命令浮顶 → 同组内标题字母序（zh）。
 * fixture 用虚构值（硬约束 21：Demo / Alpha / Beta / Gamma；「—」为无绑定约定显示值）。
 */

import { describe, it, expect } from "vitest";
import { compareKeybindingRows, KeybindingSortRow } from "../../../views/keybinding-settings/keybindingRowSort";

describe("E5.8#184 compareKeybindingRows", () => {
  it("有绑定的行浮在无绑定之上", () => {
    const bound = { title: "Demo View", key: "ctrl+b" };
    const unbound = { title: "Alpha", key: "—" };
    expect(compareKeybindingRows(bound, unbound)).toBeLessThan(0);
    expect(compareKeybindingRows(unbound, bound)).toBeGreaterThan(0);
  });

  it("无绑定行之间按标题字母序", () => {
    const rows: KeybindingSortRow[] = [
      { title: "Beta", key: "—" },
      { title: "Alpha", key: "—" },
      { title: "Gamma", key: "—" },
    ];
    rows.sort(compareKeybindingRows);
    expect(rows.map((r) => r.title)).toEqual(["Alpha", "Beta", "Gamma"]);
  });

  it("有绑定行之间按标题字母序（中文标题 zh locale 按拼音）", () => {
    const rows: KeybindingSortRow[] = [
      { title: "侧栏", key: "ctrl+b" },
      { title: "打开设置", key: "ctrl+," },
      { title: "切换面板", key: "ctrl+p" },
    ];
    rows.sort(compareKeybindingRows);
    // 拼音序：侧(cè) < 打(dǎ) < 切(qiē)
    expect(rows.map((r) => r.title)).toEqual(["侧栏", "打开设置", "切换面板"]);
  });

  it("绑定优先全局成立——无绑定行永不插队", () => {
    const rows: KeybindingSortRow[] = [
      { title: "Alpha", key: "—" },
      { title: "Zeta", key: "ctrl+z" },
      { title: "Alpha Mid", key: "—" },
    ];
    rows.sort(compareKeybindingRows);
    // Zeta（有绑定）浮顶，两个无绑定按标题序沉底
    expect(rows.map((r) => r.title)).toEqual(["Zeta", "Alpha", "Alpha Mid"]);
  });

  it("同标题稳定——比较器不依赖插入顺序（title 相同返回 0）", () => {
    expect(compareKeybindingRows({ title: "Demo", key: "ctrl+a" }, { title: "Demo", key: "ctrl+a" })).toBe(0);
    expect(compareKeybindingRows({ title: "Demo", key: "—" }, { title: "Demo", key: "—" })).toBe(0);
  });
});
