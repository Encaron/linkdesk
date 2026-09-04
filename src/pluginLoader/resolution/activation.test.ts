/**
 * #44 + #9g activationEvents 机制测试——推断 / 显式共存 / 延迟判定 / 触发总线。
 *
 * 从 #44 雏形（root activationEvents.test.ts，测内联判断）升级为对生产纯函数
 * （resolution/activation.ts）的真单元测试——#9g 把逻辑归一进该模块：
 *   1. inferActivationEvents——无字段时按 contributes 派生触发事件
 *   2. effectiveActivationEvents——显式优先，未写走推断（显式共存）
 *   3. shouldDeferActivation——延迟判定（entry/data/空/["*"] 边界）
 *   4. 触发总线——setActivationEventHandler / fireActivationEvent 薄转发
 *
 * fixture 恒虚构值（test-fixture-hygiene）：不指向真实插件名/UI 文案。
 */

import { describe, it, expect, vi } from "vitest";
import type { PluginManifest } from "../../core/api/types";
import {
  inferActivationEvents,
  effectiveActivationEvents,
  shouldDeferActivation,
  setActivationEventHandler,
  fireActivationEvent,
} from "./activation";

/** 最小可测 manifest 工厂——真实形状只放被测字段，其余省略 */
function m(overrides: Partial<PluginManifest> & { contributes?: Record<string, unknown> }): PluginManifest {
  return {
    name: "Demo Plugin",
    version: "1.0.0",
    ...overrides,
  };
}

describe("inferActivationEvents——按 contributes 派生", () => {
  it("fileAssociations → onLanguage:<ext>（无前导点，与 schema extension 一致）", () => {
    const events = inferActivationEvents(m({
      entry: "src/index.tsx",
      contributes: { fileAssociations: [{ extension: "py" }, { extension: "ts" }] },
    }));
    expect(events).toEqual(["onLanguage:py", "onLanguage:ts"]);
  });

  it("views 容器键 → onView:<containerId>", () => {
    const events = inferActivationEvents(m({
      contributes: { views: { alpha: [{ id: "v", render: "v.tsx" }], gamma: [] } },
    }));
    expect(events).toEqual(["onView:alpha", "onView:gamma"]);
  });

  it("commands[].id → onCommand:<id>", () => {
    const events = inferActivationEvents(m({
      contributes: { commands: [{ id: "demo.alpha", title: "Alpha" }, { id: "demo.beta", title: "Beta" }] },
    }));
    expect(events).toEqual(["onCommand:demo.alpha", "onCommand:demo.beta"]);
  });

  it("混合派生按 fileAssociations→views→commands 序去重", () => {
    const events = inferActivationEvents(m({
      entry: "src/index.tsx",
      contributes: {
        fileAssociations: [{ extension: "py" }],
        views: { alpha: [{ id: "v", render: "v.tsx" }] },
        commands: [{ id: "demo.open", title: "Open" }, { id: "demo.open", title: "Open 重复" }],
      },
    }));
    expect(events).toEqual(["onLanguage:py", "onView:alpha", "onCommand:demo.open"]);
  });

  it("空 / 未知 contributes 键（langDefs 等自定义）→ 空数组", () => {
    expect(inferActivationEvents(m({}))).toEqual([]);
    expect(inferActivationEvents(m({ contributes: { langDefs: [{ id: "python" }] } }))).toEqual([]);
  });
});

describe("effectiveActivationEvents——显式共存（显式优先，未写走推断）", () => {
  it("显式字段原样优先——不叠加推断", () => {
    const events = effectiveActivationEvents(m({
      activationEvents: ["onCommand:demo.only"],
      entry: "src/index.tsx",
      contributes: { fileAssociations: [{ extension: "py" }] },
    }));
    expect(events).toEqual(["onCommand:demo.only"]);
  });

  it("显式空数组 / [\"*\"] 也原样返回（= 立即加载语义信号）", () => {
    expect(effectiveActivationEvents(m({ activationEvents: [] }))).toEqual([]);
    expect(effectiveActivationEvents(m({ activationEvents: ["*"] }))).toEqual(["*"]);
  });

  it("未写字段 → 走推断", () => {
    const events = effectiveActivationEvents(m({
      contributes: { commands: [{ id: "demo.alpha", title: "Alpha" }] },
    }));
    expect(events).toEqual(["onCommand:demo.alpha"]);
  });
});

describe("shouldDeferActivation——延迟判定边界", () => {
  it("有 entry + 推断事件非空 → 延迟", () => {
    expect(shouldDeferActivation(m({
      entry: "src/index.tsx",
      contributes: { fileAssociations: [{ extension: "py" }] },
    }))).toBe(true);
  });

  it("有 entry + 显式具体事件 → 延迟", () => {
    expect(shouldDeferActivation(m({ entry: "src/index.tsx", activationEvents: ["onCommand:demo.x"] }))).toBe(true);
  });

  it("entryless 纯贡献（theme/lang）无 JS 可延迟 → 立即", () => {
    expect(shouldDeferActivation(m({ contributes: { themes: [{ id: "t", name: "T", file: "t.json" }] } }))).toBe(false);
  });

  it("pluginRole:data（python langDefs 提供方）安装即用 → 立即", () => {
    expect(shouldDeferActivation(m({
      entry: "src/index.tsx",
      pluginRole: "data",
      contributes: { langDefs: [{ id: "python" }] },
    }))).toBe(false);
  });

  it("显式 [\"*\"] 或 [] → 立即（对标 VS Code eager）", () => {
    expect(shouldDeferActivation(m({ entry: "src/index.tsx", activationEvents: ["*"] }))).toBe(false);
    expect(shouldDeferActivation(m({ entry: "src/index.tsx", activationEvents: [] }))).toBe(false);
  });

  it("无任何 contributes/事件 → 立即", () => {
    expect(shouldDeferActivation(m({ entry: "src/index.tsx" }))).toBe(false);
  });

  it("含 * 混排 → 立即（* = eager 语义优先）", () => {
    expect(shouldDeferActivation(m({ entry: "src/index.tsx", activationEvents: ["onCommand:demo.x", "*"] }))).toBe(false);
  });
});

describe("触发总线——薄转发", () => {
  it("未挂处理器 → fire 为空操作（loader 未就绪的静默窗口）", async () => {
    setActivationEventHandler(null);
    await expect(fireActivationEvent("onLanguage:py")).resolves.toBeUndefined();
  });

  it("挂处理器 → 原样转发事件", async () => {
    const handler = vi.fn(async () => {});
    setActivationEventHandler(handler);
    try {
      await fireActivationEvent("onView:alpha");
      expect(handler).toHaveBeenCalledWith("onView:alpha");
    } finally {
      setActivationEventHandler(null); // 清场——不污染其他测试
    }
  });
});
