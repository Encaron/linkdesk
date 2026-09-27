/**
 * floatingPanelForm 测试——「首开形态」判定链（声明制通用接缝）。
 * 覆盖：无声明 → null（= 现状行为）/ defaultForm 两值 / 非法 defaultForm → 当没声明 /
 * formKey 命中 → 值即形态 / 取值非法或读不到 → 降级 defaultForm / formKey 优先于 defaultForm /
 * 壳侧入口：声明读取 + **键注册门**（未注册的键不读——否则读的是壳的系统兜底，等于壳替作者编形态）。
 * 负控：非法值必须**落到** defaultForm（不是 null、不是猜另一个值）。
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  resolveOpenFormFromDeclaration,
  resolveFloatingPanelOpenForm,
  isFloatingPanelOpenForm,
  clearFloatingPanelFormDiagnostics,
} from "./floatingPanelForm";
import { registerViewPlugin, clearRegistry } from "../../../pluginLoader/contributions/viewRegistry";
import {
  registerConfiguration,
  registerConfigurationDefaults,
  clearConfigurationRegistrations,
} from "../../registry/ConfigurationRegistry";
import { clearRegistrationLayers } from "../../registry/registrationTracker";
import type { PluginManifest } from "../../api/types";

const PLUGIN_ID = "form-test-plugin";
const KEY = "form-test-plugin.openForm";

/** 注入式读取器：值表 → 读取函数（纯函数用例不碰注册表） */
const readerOf = (values: Record<string, unknown>) => (key: string) => values[key];

describe("resolveOpenFormFromDeclaration——判定链（纯函数）", () => {
  it("无声明 / null → null（没声明形态 = 调用方保持现状）", () => {
    expect(resolveOpenFormFromDeclaration(null, readerOf({}))).toBeNull();
    expect(resolveOpenFormFromDeclaration(undefined, readerOf({}))).toBeNull();
  });

  it("只声明 viewId → null（老声明零形态字段，语义不变）", () => {
    expect(resolveOpenFormFromDeclaration({}, readerOf({}))).toBeNull();
  });

  it("defaultForm 两个合法值原样返回（值即形态，无映射层）", () => {
    expect(resolveOpenFormFromDeclaration({ defaultForm: "tab" }, readerOf({}))).toBe("tab");
    expect(resolveOpenFormFromDeclaration({ defaultForm: "floatingPanel" }, readerOf({}))).toBe("floatingPanel");
  });

  it("defaultForm 非法值 → null（当没声明，不崩不猜）", () => {
    expect(resolveOpenFormFromDeclaration({ defaultForm: "panel" as never }, readerOf({}))).toBeNull();
    expect(resolveOpenFormFromDeclaration({ defaultForm: 1 as never }, readerOf({}))).toBeNull();
  });

  it("formKey 取值命中 → 用键值（用户改过就跟随）", () => {
    const decl = { formKey: KEY, defaultForm: "floatingPanel" as const };
    expect(resolveOpenFormFromDeclaration(decl, readerOf({ [KEY]: "tab" }))).toBe("tab");
    expect(resolveOpenFormFromDeclaration(decl, readerOf({ [KEY]: "floatingPanel" }))).toBe("floatingPanel");
  });

  it("负控：formKey 取值不在词汇表 / 读不到 → **落到 defaultForm**（不落 null、不猜另一个值）", () => {
    const decl = { formKey: KEY, defaultForm: "tab" as const };
    expect(resolveOpenFormFromDeclaration(decl, readerOf({ [KEY]: "middle" }))).toBe("tab");
    expect(resolveOpenFormFromDeclaration(decl, readerOf({ [KEY]: undefined }))).toBe("tab");
    expect(resolveOpenFormFromDeclaration(decl, readerOf({ [KEY]: true }))).toBe("tab");
    // 两者都不可用（无 defaultForm）→ 才轮到 null
    expect(resolveOpenFormFromDeclaration({ formKey: KEY }, readerOf({ [KEY]: "middle" }))).toBeNull();
  });

  it("formKey 与 defaultForm 并存 → formKey 优先（schema 已机械禁并存，此处钉住万一）", () => {
    const decl = { formKey: KEY, defaultForm: "tab" as const };
    expect(resolveOpenFormFromDeclaration(decl, readerOf({ [KEY]: "floatingPanel" }))).toBe("floatingPanel");
  });

  it("formKey 空串 / 空白 → 当没写（走 defaultForm）", () => {
    expect(resolveOpenFormFromDeclaration({ formKey: "", defaultForm: "tab" }, readerOf({}))).toBe("tab");
    expect(resolveOpenFormFromDeclaration({ formKey: "   ", defaultForm: "tab" }, readerOf({}))).toBe("tab");
  });

  it("isFloatingPanelOpenForm——词汇表只认两个字面量（大小写/类型都不放行）", () => {
    expect(isFloatingPanelOpenForm("tab")).toBe(true);
    expect(isFloatingPanelOpenForm("floatingPanel")).toBe(true);
    expect(isFloatingPanelOpenForm("Tab")).toBe(false);
    expect(isFloatingPanelOpenForm("")).toBe(false);
    expect(isFloatingPanelOpenForm(undefined)).toBe(false);
    expect(isFloatingPanelOpenForm(null)).toBe(false);
  });
});

/** 造一只已注册的声明插件（registry 是真源——壳侧入口经此读声明） */
function seedPlugin(floatingPanel?: Record<string, unknown>): void {
  registerViewPlugin({
    pluginId: PLUGIN_ID,
    manifest: {
      pluginId: PLUGIN_ID,
      name: "形态测试",
      version: "1.0.0",
      entry: "src/index.tsx",
      appearsIn: { tabBar: true },
      contributes: floatingPanel ? { floatingPanel } : {},
    } as unknown as PluginManifest,
  });
}

/** 注册形态配置键（键的 default = 作者默认形态） */
function seedFormKey(defaultForm: string): void {
  registerConfiguration(PLUGIN_ID, {
    title: "形态测试",
    properties: {
      [KEY]: { type: "string", default: defaultForm, enum: ["floatingPanel", "tab"], description: "打开形态" },
    },
  });
}

describe("resolveFloatingPanelOpenForm——壳侧入口（声明 + 配置）", () => {
  beforeEach(() => {
    clearRegistrationLayers();
    clearRegistry();
    clearConfigurationRegistrations();
    clearFloatingPanelFormDiagnostics();
  });

  it("未声明 / 只声明 viewId → null（零回归：现状行为原样）", () => {
    expect(resolveFloatingPanelOpenForm(PLUGIN_ID)).toBeNull();
    seedPlugin({ viewId: "v" });
    expect(resolveFloatingPanelOpenForm(PLUGIN_ID)).toBeNull();
  });

  it("defaultForm:tab → 'tab'（定死不给用户入口的那档）", () => {
    seedPlugin({ viewId: "v", defaultForm: "tab" });
    expect(resolveFloatingPanelOpenForm(PLUGIN_ID)).toBe("tab");
  });

  it("formKey 指向已注册键 → 键的 default 即作者默认形态（用户没动过时读它）", () => {
    seedPlugin({ viewId: "v", formKey: KEY });
    seedFormKey("floatingPanel");
    expect(resolveFloatingPanelOpenForm(PLUGIN_ID)).toBe("floatingPanel");
  });

  it("formKey + 值被改（弱默认层）→ 跟随改后的值", () => {
    seedPlugin({ viewId: "v", formKey: KEY });
    seedFormKey("floatingPanel");
    registerConfigurationDefaults(PLUGIN_ID, { [KEY]: "tab" });
    expect(resolveFloatingPanelOpenForm(PLUGIN_ID)).toBe("tab");
  });

  it("formKey 指向**未注册**的键 → 不读（出声一次）+ 降级 defaultForm", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      seedPlugin({ viewId: "v", formKey: KEY, defaultForm: "tab" });
      expect(resolveFloatingPanelOpenForm(PLUGIN_ID)).toBe("tab");
      expect(resolveFloatingPanelOpenForm(PLUGIN_ID)).toBe("tab"); // 第二次不再出声
      const mine = warn.mock.calls.filter((c) => String(c[0]).includes("formKey"));
      expect(mine).toHaveLength(1);
      expect(String(mine[0][0])).toContain(KEY);
    } finally {
      warn.mockRestore();
    }
  });

  it("键已注册但值是坏数据 → 降级 defaultForm（不拿坏值当形态）", () => {
    seedPlugin({ viewId: "v", formKey: KEY, defaultForm: "floatingPanel" });
    seedFormKey("tab");
    registerConfigurationDefaults(PLUGIN_ID, { [KEY]: "sidePanel" });
    expect(resolveFloatingPanelOpenForm(PLUGIN_ID)).toBe("floatingPanel");
  });
});
