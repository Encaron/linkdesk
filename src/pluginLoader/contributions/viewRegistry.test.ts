/**
 * getFloatingPanelViewId 测试——E5.8#39.5 子项 C 声明制注入条件（I8-3 声明即出现）。
 * 标签页右键「在悬浮面板中打开」注入条件 = 该插件声明 contributes.floatingPanel.viewId。
 * 覆盖：声明 → 返回 viewId（注入）/ 未声明 → null（不注入）/ 未注册 → null / 声明非字符串 → null（防坏值）。
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import type { ComponentType } from "react";
import { registerViewPlugin, getViewPlugin, getFloatingPanelViewId } from "./viewRegistry";
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

/* ── #9g 按需激活：registerViewPlugin component-less 占位 → componentful 升级 ── */

/** 真实 React 组件替身——测试只断言注册表持有性，不渲染 */
const FakeComponent = (() => ({})) as unknown as ComponentType<{ isActive: boolean }>;

describe("registerViewPlugin——延迟激活占位升级（E6#9g）", () => {
  // 独立清场——本 describe 不共享上方 disposers
  let disposers: Array<() => void> = [];
  beforeEach(() => {
    disposers = [];
  });
  afterEach(() => {
    for (const d of disposers) d();
  });

  it("启动占位（component 空）后激活（同版本实组件）→ 升级替代，registry 读得实组件", () => {
    const manifest: PluginManifest = { name: "Demo Alpha", version: "1.0.0" };
    // ① loader 启动注册 component-less 占位（#9g 延迟）
    disposers.push(registerViewPlugin({ pluginId: "demo-alpha", manifest }));
    expect(getViewPlugin("demo-alpha")?.component).toBeUndefined();

    // ② activatePlugin 升级——同版本但有实组件 → 允许替代（stub→实，旧 dedup 只认版本会误拒）
    disposers.push(registerViewPlugin({ pluginId: "demo-alpha", manifest, component: FakeComponent }));
    const entry = getViewPlugin("demo-alpha");
    expect(entry?.component).toBe(FakeComponent);
    expect(entry?.manifest).toBe(manifest);
  });

  it("component-less 重复注册（同版本、都无组件）→ 保留首个（占位不重复覆盖）", () => {
    const manifest: PluginManifest = { name: "Demo Beta", version: "1.0.0" };
    disposers.push(registerViewPlugin({ pluginId: "demo-beta", manifest }));
    // 第二次仍无组件的注册（entryless 兜底重注等）→ no-op 保留首个，disposer 无删除权
    const secondDisposer = registerViewPlugin({ pluginId: "demo-beta", manifest });
    secondDisposer();
    expect(getViewPlugin("demo-beta")?.component).toBeUndefined();
    expect(getViewPlugin("demo-beta")?.manifest).toBe(manifest);
  });

  it("升级后卸载 disposer 删除条目（升级 disposer 持删除权，旧占位 disposer 不复活）", () => {
    const manifest: PluginManifest = { name: "Demo Gamma", version: "1.0.0" };
    const stubDisposer = registerViewPlugin({ pluginId: "demo-gamma", manifest });
    const upgradeDisposer = registerViewPlugin({ pluginId: "demo-gamma", manifest, component: FakeComponent });
    upgradeDisposer(); // 卸载——删升级条目
    expect(getViewPlugin("demo-gamma")).toBeUndefined();
    stubDisposer(); // 旧占位 disposer no-op——不把条目复活
    expect(getViewPlugin("demo-gamma")).toBeUndefined();
  });
});
