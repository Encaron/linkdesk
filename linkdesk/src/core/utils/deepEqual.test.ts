/**
 * deepEqual 单元测试——JSON 可序列化值深比较。
 * E5.8 bug 修复配套：diffUserSettings 浅比较→深比较，settings.json 回写循环终结。
 */

import { describe, it, expect } from "vitest";
import { deepEqual } from "./deepEqual";

describe("deepEqual — JSON 可序列化值深比较", () => {
  it("原始值——值相等", () => {
    expect(deepEqual(1, 1)).toBe(true);
    expect(deepEqual("a", "a")).toBe(true);
    expect(deepEqual(true, true)).toBe(true);
    expect(deepEqual(null, null)).toBe(true);
    expect(deepEqual(undefined, undefined)).toBe(true);
  });

  it("原始值——值不等", () => {
    expect(deepEqual(1, 2)).toBe(false);
    expect(deepEqual("a", "b")).toBe(false);
    expect(deepEqual(null, undefined)).toBe(false);
    expect(deepEqual(true, "true")).toBe(false);
  });

  it("NaN === NaN（Object.is 语义）", () => {
    expect(deepEqual(NaN, NaN)).toBe(true);
  });

  it("对象同内容不同引用 → 相等（键序无关）", () => {
    expect(deepEqual({ a: 1, b: 2 }, { b: 2, a: 1 })).toBe(true);
  });

  it("对象同内容不同引用 → 相等（JSON 重新解析场景——bug 根因）", () => {
    const a = {
      "app.theme": "Light",
      "files.exclude": { "**/node_modules": true, "**/.git": true },
    };
    const b = JSON.parse(JSON.stringify(a)); // 模拟 reloadUserSettings 的 file→parse 新引用
    expect(deepEqual(a, b)).toBe(true);
  });

  it("对象值不同 → 不等", () => {
    expect(deepEqual({ a: 1 }, { a: 2 })).toBe(false);
    expect(deepEqual({ a: 1 }, { a: 1, b: 2 })).toBe(false);
    expect(deepEqual({ a: 1 }, {})).toBe(false);
  });

  it("嵌套对象不同 → 不等（保守上报不遗漏）", () => {
    expect(deepEqual({ a: { b: { c: 1 } } }, { a: { b: { c: 2 } } })).toBe(false);
  });

  it("数组——逐位比较（顺序敏感）", () => {
    expect(deepEqual([1, 2, 3], [1, 2, 3])).toBe(true);
    expect(deepEqual([1, 2, 3], [3, 2, 1])).toBe(false);
    expect(deepEqual([1, 2], [1, 2, 3])).toBe(false);
  });

  it("数组 vs 对象 → 不等", () => {
    expect(deepEqual([], {})).toBe(false);
  });
});
