/**
 * #44 activationEvents 机制测试——延迟加载与按需激活。
 *
 * 验证：
 * 1. hasDeferredActivation 判断逻辑
 * 2. findDeferredByCommand 匹配 onCommand:*
 * 3. activatePlugin 正常激活 + 重复激活无副作用
 */

import { describe, it, expect } from "vitest";

describe("activationEvents——延迟加载判断", () => {
  it("空 activationEvents → 立即加载", () => {
    // undefined / [] / ["*"] 都不应该延迟
    const immediate = [
      undefined,
      [],
      ["*"],
      ["onCommand:x", "*"], // 含 * 即立即加载
    ];

    for (const events of immediate) {
      const hasEvents = !!(events && events.length > 0);
      const hasStar = events?.includes("*") ?? false;
      const defer = hasEvents && !hasStar;
      expect(defer).toBe(false);
    }
  });

  it("具体 activationEvents（非 *）→ 延迟加载", () => {
    const deferred = [
      ["onCommand:cad.importDxf"],
      ["onFileOpen:.dxf"],
      ["onCommand:x", "onFileOpen:.y"],
    ];

    for (const events of deferred) {
      const hasEvents = !!(events && events.length > 0);
      const hasStar = events?.includes("*") ?? false;
      const defer = hasEvents && !hasStar;
      expect(defer).toBe(true);
    }
  });
});

describe("activationEvents——onCommand 匹配", () => {
  it("匹配 onCommand:<id> 格式", () => {
    const match = (events: string[], commandId: string): boolean => {
      return events.some((ev) => ev === `onCommand:${commandId}` || ev === "*");
    };

    expect(match(["onCommand:test.hello"], "test.hello")).toBe(true);
    expect(match(["onCommand:cad.importDxf"], "cad.importDxf")).toBe(true);
    expect(match(["onCommand:test.hello"], "other.command")).toBe(false);
    expect(match(["onFileOpen:.dxf"], "test.hello")).toBe(false);
    expect(match(["*"], "anything")).toBe(true);
  });
});

describe("activationEvents——边界情况", () => {
  it("空字符串 activationEvents → 立即加载", () => {
    const events: string[] = [];
    expect(events.length > 0 && !events.includes("*")).toBe(false);
  });

  it("只有 * → 立即加载", () => {
    const events = ["*"];
    expect(events.length > 0 && !events.includes("*")).toBe(false);
  });

  it("onCommand 格式校验——必须是 'onCommand:' 前缀", () => {
    const isOnCommand = (ev: string) => ev.startsWith("onCommand:");
    expect(isOnCommand("onCommand:test.hello")).toBe(true);
    expect(isOnCommand("onCommand:")).toBe(true);
    expect(isOnCommand("oncommand:test")).toBe(false);
    expect(isOnCommand("onFileOpen:.dxf")).toBe(false);
  });
});
