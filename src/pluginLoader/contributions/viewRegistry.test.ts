/**
 * getFloatingPanelViewId 测试——E5.8#39.5 子项 C 声明制注入条件（I8-3 声明即出现）。
 * 标签页右键「在悬浮面板中打开」注入条件 = 该插件声明 contributes.floatingPanel.viewId。
 * 覆盖：声明 → 返回 viewId（注入）/ 未声明 → null（不注入）/ 未注册 → null / 声明非字符串 → null（防坏值）。
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { registerViewPlugin, getFloatingPanelViewId, getTabOpenableViews, getTabCreatableViews } from "./viewRegistry";
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
    disposers.push(registerPlugin("demo-plugin", "demo-plugin-view"));
    expect(getFloatingPanelViewId("demo-plugin")).toBe("demo-plugin-view");
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

/* ── 能力判据 vs 两张菜单准入判据（W2，2026-10-02 拍板：白名单制缺省 false） ──
 * getTabOpenableViews = 能力（appearsIn.tabBar + entry）——命令/最近/恢复/悬浮面板 open-in 问的是它；
 * getTabCreatableViews = 展示准入（能力 ∧ standaloneOpenable === true）——欢迎页开始卡 + [+] 菜单同吃。
 * 元数据 stub 恒可开（可创建 ≠ 已注册组件；E6#62e 后 registry 只持元数据，渲染归池）——准入测试用同一
 * 种 stub 注册，证明准入过滤不引入「必须有组件」的额外条件。 */

describe("getTabOpenableViews / getTabCreatableViews——能力判据 ≠ 两张菜单准入判据（W2）", () => {
  // 独立清场
  let disposers: Array<() => void> = [];
  beforeEach(() => {
    disposers = [];
  });
  afterEach(() => {
    for (const d of disposers) d();
  });

  // 虚构夹具 id（硬约束 21）——大写常量通道（linkdesk/no-plugin-id-hardcode 批准的常量用法）
  const OPENABLE_ONLY_ID = "demo-delta"; // tabBar + entry，未声明准入
  const ADMITTED_ID = "demo-epsilon"; // tabBar + entry + standaloneOpenable:true
  const REFUSED_ID = "demo-zeta"; // 显式 standaloneOpenable:false
  const NON_TABBAR_ID = "demo-echo"; // tabBar:false

  function registerView(pluginId: string, appearsIn: NonNullable<PluginManifest["appearsIn"]>) {
    const manifest: PluginManifest = {
      name: pluginId,
      version: "1.0.0",
      entry: "src/index.tsx",
      appearsIn,
    };
    disposers.push(registerViewPlugin({ pluginId, manifest }));
  }

  it("appearsIn.tabBar + entry 的元数据 stub → 可开为标签页（能力判据；点击交池渲染）", () => {
    registerView(OPENABLE_ONLY_ID, { tabBar: true });
    expect(getTabOpenableViews().some((e) => e.pluginId === OPENABLE_ONLY_ID)).toBe(true);
  });

  it("声明 standaloneOpenable=true → 进两张创建菜单（准入判据）", () => {
    registerView(ADMITTED_ID, { tabBar: true, standaloneOpenable: true });
    expect(getTabCreatableViews().some((e) => e.pluginId === ADMITTED_ID)).toBe(true);
    expect(getTabOpenableViews().some((e) => e.pluginId === ADMITTED_ID)).toBe(true);
  });

  it("🔴 缺省负控：只声明 tabBar（不写 standaloneOpenable）→ 不进两张菜单，但**仍**可开为标签页", () => {
    registerView(OPENABLE_ONLY_ID, { tabBar: true });
    expect(getTabCreatableViews().some((e) => e.pluginId === OPENABLE_ONLY_ID)).toBe(false);
    // 语义分层：准入 ≠ 能力——同一条目在两把尺子上结论相反，正是本件要钉的那句话
    expect(getTabOpenableViews().some((e) => e.pluginId === OPENABLE_ONLY_ID)).toBe(true);
  });

  it("显式 standaloneOpenable=false → 不进两张菜单（白名单制：只有 true 放行）", () => {
    registerView(REFUSED_ID, { tabBar: true, standaloneOpenable: false });
    expect(getTabCreatableViews().some((e) => e.pluginId === REFUSED_ID)).toBe(false);
  });

  it("appearsIn.tabBar=false → 两把尺子都不进（能力判据未动，tabBar 仍是硬门）", () => {
    registerView(NON_TABBAR_ID, { tabBar: false, standaloneOpenable: true });
    expect(getTabCreatableViews().some((e) => e.pluginId === NON_TABBAR_ID)).toBe(false);
    expect(getTabOpenableViews().some((e) => e.pluginId === NON_TABBAR_ID)).toBe(false);
  });
});
