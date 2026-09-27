/**
 * formatKeyLabel 单测——04「悬停提示系统」件 1 抽出的**单权威**（原为 usePoolSync/titlebar.ts 私有副本）。
 *
 * 为什么值得测：这个函数同时喂**菜单 shortcut**与**提示条键帽**——两处显示不一致的根因就是
 * 「有一份没人管的副本」。刻度钉死在这里：谁把它改错，菜单与提示条会**一起**错（而不是只错一处、
 * 更难发现）。输入是注册表里的原始串形态（全小写、`+` 连接、空格分 chord）。
 */
import { describe, expect, it } from "vitest";
import { formatKeyLabel } from "./formatKeyLabel";

describe("formatKeyLabel 快捷键标签格式化（camel 各修饰键 + 单字母）", () => {
  it("单 chord：修饰键首字母大写 + 字母大写（ctrl+k → Ctrl+K）", () => {
    expect(formatKeyLabel("ctrl+k")).toBe("Ctrl+K");
  });

  it("三修饰键全转（ctrl+shift+alt+p → Ctrl+Shift+Alt+P）", () => {
    expect(formatKeyLabel("ctrl+shift+alt+p")).toBe("Ctrl+Shift+Alt+P");
  });

  it("chord 之间用单空格连接（ctrl+k ctrl+t → Ctrl+K Ctrl+T）", () => {
    expect(formatKeyLabel("ctrl+k ctrl+t")).toBe("Ctrl+K Ctrl+T");
  });

  it("大小写混写输入同样归一（Ctrl+K ctrl+T → Ctrl+K Ctrl+T）", () => {
    expect(formatKeyLabel("Ctrl+K ctrl+T")).toBe("Ctrl+K Ctrl+T");
  });

  it("无修饰键的单键**原样透传**（f5/escape 不变）——本函数只认 `+` 后的单字母，见下方缺口说明", () => {
    expect(formatKeyLabel("f5")).toBe("f5");
    expect(formatKeyLabel("escape")).toBe("escape");
  });

  // ⚠️ 已知缺口（不在本轮射程，记在这里免得下次当"新发现"）：单键名不做大小写归一 ⇒
  // 菜单与提示条的键帽会显示 `f5` / `escape`（VS Code 是 `F5` / `Escape`）。
  // 为什么不在本件顺手修：`\w` 首字母大写会造出 `Pageup` 这种**新的错**，要修得配一张
  // 键名映射表（F1-F12 / Escape / PageUp / PageDown / Home / End / Space…）——那是另一件，
  // 且会改动菜单今天已在显示的串（本轮口径：抽函数**不改行为**，原样搬）。
  // 本轮所有键位实测都是「修饰键 + 字母」形态（ctrl+k / ctrl+shift+p …），故不受影响。

  it("空串 ⇒ 空串（不抛——调用方各自判空，如菜单「无绑定不显示快捷键」）", () => {
    expect(formatKeyLabel("")).toBe("");
  });
});
