/**
 * 主题快照单测——04「启动过场」④A。镜像层零逻辑的判据：合法形状过、其余一律 null（不抛）。
 */
import { describe, it, expect } from "vitest";
import { validateThemeSnapshot } from "./snapshot";

const vars = { "--bg-window": "#1e1e1e", "--text-primary": "#e0e0e0", "--accent": "#4a9eff" };
const valid = { v: 1, type: "dark", vars };

describe("validateThemeSnapshot——合法形状", () => {
  it("v1 + type + 含关键键的 vars → 过", () => {
    expect(validateThemeSnapshot(JSON.stringify(valid))).toEqual(valid);
  });
});

describe("validateThemeSnapshot——一切不合法一律 null（现状兜底）", () => {
  it("null / 空 / 坏 JSON → null", () => {
    expect(validateThemeSnapshot(null)).toBeNull();
    expect(validateThemeSnapshot("")).toBeNull();
    expect(validateThemeSnapshot("not json{")).toBeNull();
  });

  it("版本不符 → null（快照升级后旧数据静默弃用）", () => {
    expect(validateThemeSnapshot(JSON.stringify({ ...valid, v: 2 }))).toBeNull();
    expect(validateThemeSnapshot(JSON.stringify({ type: "dark", vars }))).toBeNull();
  });

  it("type 缺失 / vars 非对象 → null", () => {
    expect(validateThemeSnapshot(JSON.stringify({ v: 1, vars }))).toBeNull();
    expect(validateThemeSnapshot(JSON.stringify({ v: 1, type: "", vars }))).toBeNull();
    expect(validateThemeSnapshot(JSON.stringify({ v: 1, type: "dark", vars: "x" }))).toBeNull();
  });

  it("关键键缺失（--bg-window / --text-primary）→ null", () => {
    expect(validateThemeSnapshot(JSON.stringify({ v: 1, type: "dark", vars: { "--accent": "#fff" } }))).toBeNull();
    expect(validateThemeSnapshot(JSON.stringify({ v: 1, type: "dark", vars: { "--bg-window": "", "--text-primary": "#fff" } }))).toBeNull();
  });
});
