/**
 * keybindingNormalization 单测——04 池「双段快捷键注册被打乱」的回归钉（2026-09-27）。
 *
 * 旧实现的 bug：`normalizeKey` 对**整串**键位 `split("+")`——空格不是分隔符，双段（chord）
 * 第二段的修饰键被并进第一段参与排序 ⇒ `ctrl+k ctrl+h` 归一化成 `ctrl+h+k ctrl`，
 * 注册进去的键与按下时拼出的键对不上 ⇒ **静默死键**（不报错、不进冲突表）。
 * 「能不能用」完全取决于第二段字母是否 ≥ k（`ctrl+k ctrl+t/l/q` 纯属侥幸不变）。
 *
 * 覆盖两个方向（04 池档案 §建议修法的要求）：
 *   - 打乱侧：第二段字母 a–j 的 chord（`ctrl+k ctrl+h` 等）必须保持段界；
 *   - 不变侧：既有两条 chord（`ctrl+k ctrl+t/l`）与单段行为零回归。
 * 外加一条注册级端到端——chord 死键的**症状**在 `getKeybindingSyncData`（主进程查表源），
 * 单测纯函数不够，要钉住注册路径产出的段界是好的。
 * fixture 全虚构（demo-plugin，硬约束 21）。
 */

import { describe, it, expect, afterEach } from "vitest";
import { normalizeKey } from "./keybindingNormalization";
import { registerKeybinding, getKeybindingSyncData, clearBindings } from "../registry/commands/KeybindingRegistry/registry";

describe("normalizeKey——单段（既有行为不回归）", () => {
  it("小写归一 + 修饰键排序（ctrl > shift > alt > meta）", () => {
    expect(normalizeKey("Ctrl+K")).toBe("ctrl+k");
    expect(normalizeKey("CTRL+SHIFT+B")).toBe("ctrl+shift+b");
    expect(normalizeKey("alt+CTRL+shift+x")).toBe("ctrl+shift+alt+x");
  });

  it("键名两侧的空格被吃掉", () => {
    expect(normalizeKey("ctrl + k")).toBe("ctrl+k");
  });
});

describe("normalizeKey——双段（chord）保持段界（本档主判据）", () => {
  it("🔴 打乱侧：第二段字母 a–j 的 chord 不再被打散", () => {
    expect(normalizeKey("ctrl+k ctrl+h")).toBe("ctrl+k ctrl+h");
    expect(normalizeKey("ctrl+k ctrl+g")).toBe("ctrl+k ctrl+g");
  });

  it("🔴 第二段带修饰键：每段**各自**排序，空格是段分隔符不是可排序 token", () => {
    expect(normalizeKey("ctrl+k ctrl+shift+p")).toBe("ctrl+k ctrl+shift+p");
    expect(normalizeKey("ctrl+alt+k ctrl+alt+p")).toBe("ctrl+alt+k ctrl+alt+p");
  });

  it("不变侧：既有两条 chord（theme.pick / selectLanguage）与输入大小写无关地照旧", () => {
    expect(normalizeKey("ctrl+k ctrl+t")).toBe("ctrl+k ctrl+t");
    expect(normalizeKey("ctrl+k ctrl+l")).toBe("ctrl+k ctrl+l");
    expect(normalizeKey("Ctrl+K Ctrl+T")).toBe("ctrl+k ctrl+t");
  });
});

describe("normalizeKey——注册路径端到端（chord 死键的症状面）", () => {
  afterEach(() => {
    clearBindings();
  });

  it("注册 `ctrl+k ctrl+h` ⇒ 同步给主进程的 chordCombos/chordPrefixes 段界正确", () => {
    registerKeybinding({ key: "ctrl+k ctrl+h", command: "demo.chordCmd", source: "plugin", pluginId: "demo-plugin" });
    const data = getKeybindingSyncData();
    expect(data.chordCombos).toContain("ctrl+k ctrl+h");
    expect(data.chordPrefixes).toContain("ctrl+k");
  });
});
