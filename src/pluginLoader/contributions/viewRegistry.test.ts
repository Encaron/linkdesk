/**
 * getFloatingPanelViewId 测试——E5.8#39.5 子项 C 声明制注入条件（I8-3 声明即出现）。
 * 标签页右键「在悬浮面板中打开」注入条件 = 该插件声明 contributes.floatingPanel.viewId。
 * 覆盖：声明 → 返回 viewId（注入）/ 未声明 → null（不注入）/ 未注册 → null / 声明非字符串 → null（防坏值）。
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { registerViewPlugin, getFloatingPanelViewId } from "./viewRegistry";
import type { PluginManifest } from "../../core/api/types";

/** 注册最小视图插件条目——floatingPanelViewId 提供时给 manifest 附 contributes.floatingPanel。返回 disposer。 */
function registerPlugin(pluginId: string, floatingPanelViewId?: string): () => void {
  const manifest: PluginManifest = { name: pluginId, version: "1.0.0" };
  if (floatingPanelViewId !== undefined) {
    (manifest as { contributes?: Record<string, unknown> }).contributes = {
      floatingPanel: { viewId: floatingPanelViewId },
    };
  }
  return registerViewPlugin({ pluginId, manifest });
}

describe("getFloatingPanelViewId（E5.8#39.5 子项 C——标签页右键注入声明条件）", () => {
  let disposers: Array<() => void> = [];
  beforeEach(() => {
    disposers = [];
  });
  afterEach(() => {
    for (const d of disposers) d();
  });

  it("声明 contributes.floatingPanel.viewId → 返回 viewId（注入「在悬浮面板中打开」）", () => {
    disposers.push(registerPlugin("panel-demo", "panel-demo-view"));
    expect(getFloatingPanelViewId("panel-demo")).toBe("panel-demo-view");
  });

  it("未声明 floatingPanel → null（不注入——多数插件无此声明）", () => {
    disposers.push(registerPlugin("terminal"));
    expect(getFloatingPanelViewId("terminal")).toBeNull();
  });

  it("未注册的插件 id → null（无声明 no-op 不崩）", () => {
    expect(getFloatingPanelViewId("never-registered")).toBeNull();
  });

  it("声明了但 viewId 非字符串 → null（防坏值穿透）", () => {
    disposers.push(registerPlugin("bad-decl", 123 as unknown as string));
    expect(getFloatingPanelViewId("bad-decl")).toBeNull();
  });
});
