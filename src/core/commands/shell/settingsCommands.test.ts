/**
 * settingsCommands 测试——core.openSettings 的「首开形态」分支（声明制通用接缝）。
 * 覆盖：未声明形态 → 悬浮面板（= 现状，零回归）/ defaultForm:tab → 开标签页 /
 * formKey 交给用户 → 跟随键值 / 已有设置标签页 → 聚焦优先（两条路都不走）/
 * 声明 tab 却无可开标签页形态（appearsIn.tabBar 或 entry 缺）→ 落回面板（不静默无动作）。
 * 负控：形态 = tab 时**不许**再发 panel:reveal-floating——两向都断言，防「两条路都走」的静默双开。
 *
 * ⚠️ 形态值的读取层用 registerConfigurationDefaults（弱默认层）代替「用户改过」：读法是同一条
 * getConfigurationValue 合并链，本测试关心的是分支走向，不重复测设置页写盘（那有它自己的用例）。
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { clearRegistrationLayers } from "../../registry/registrationTracker";
import { executeCommand, clearCommands } from "../../registry/commands/CommandRegistry";
import { clearMenus } from "../../registry/commands/MenuRegistry";
import {
  registerConfiguration,
  registerConfigurationDefaults,
  clearConfigurationRegistrations,
} from "../../registry/ConfigurationRegistry";
import { registerViewPlugin, clearRegistry } from "../../../pluginLoader/contributions/viewRegistry";
import { factorySlots } from "../../services/bootstrap/FactorySlots";
import { shellEvents } from "../../react/events/ShellEvents";
import { updateCoreCallbacks, type CoreCallbacks } from "../infra/CoreCallbacks";
import { clearFloatingPanelFormDiagnostics } from "../../services/ui/floatingPanelForm";
import type { PluginManifest } from "../../api/types";
import { registerSettingsCommands } from "./settingsCommands";

const SETTINGS_ID = "settings";
const KEY = "settings.openForm";

/** CoreCallbacks 桩——只关心 openTab（开标签页）与 focusTabByPluginId（已有标签页则聚焦） */
let openTab: ReturnType<typeof vi.fn>;
let focusTabByPluginId: ReturnType<typeof vi.fn>;

/**
 * 悬浮面板那一条路的捕获器 = **emit 间谍**（不是 shellEvents.on 订阅）。
 * ⚠️ 不用 on：ShellEventBus.on 会**回放缓冲区里最近一次 payload**（防 emit 早于 on 的时序丢失），
 * 拿它当捕获器会把上一个用例的 emit 当成自己的——假绿/假红都来过。
 */
let emitSpy: ReturnType<typeof vi.spyOn>;
/** 【事件名, 载荷】元组——`mock.calls` 是 `any[]`，在此显式收窄，避免解构出隐式 any */
type EmitCall = [event: string, payload: { viewId: string; pluginId?: string }];
const reveals = (): Array<{ viewId: string; pluginId?: string }> =>
  (emitSpy.mock.calls as EmitCall[])
    .filter(([event]) => event === "panel:reveal-floating")
    .map(([, payload]) => payload);

/**
 * 造一只设置插件——floatingPanel 声明按用例给；tabBar/entry 可关掉（造「无可开标签页形态」）。
 * 声明进 viewRegistry（壳读声明的唯一源）+ factorySlots（core.openSettings 认激活套）。
 */
function seedSettings(opts: {
  floatingPanel?: Record<string, unknown>;
  tabCreatable?: boolean;
}): void {
  const tabCreatable = opts.tabCreatable !== false;
  const manifest = {
    pluginId: SETTINGS_ID,
    name: "设置",
    version: "1.0.19",
    entry: tabCreatable ? "src/index.tsx" : undefined,
    appearsIn: { iconBar: "bottom", tabBar: tabCreatable },
    factoryRole: "settings",
    contributes: opts.floatingPanel ? { floatingPanel: opts.floatingPanel } : {},
  } as unknown as PluginManifest;
  registerViewPlugin({ pluginId: SETTINGS_ID, manifest });
  factorySlots.initialize([{ pluginId: SETTINGS_ID, manifest }]);
}

/** 注册形态键（键名与 plugin.json 声明的 formKey 对应；default = 作者默认形态） */
function seedFormKey(defaultForm: string): void {
  registerConfiguration(SETTINGS_ID, {
    title: "设置插件",
    properties: {
      [KEY]: { type: "string", default: defaultForm, enum: ["floatingPanel", "tab"], description: "打开形态" },
    },
  });
}

describe("core.openSettings——首开形态分支（声明制）", () => {
  beforeEach(() => {
    clearRegistrationLayers();
    clearCommands();
    clearMenus();
    clearRegistry();
    clearConfigurationRegistrations();
    clearFloatingPanelFormDiagnostics();
    openTab = vi.fn(() => "tab-1");
    focusTabByPluginId = vi.fn(() => false);
    updateCoreCallbacks({ openTab, focusTabByPluginId } as unknown as CoreCallbacks);
    emitSpy = vi.spyOn(shellEvents, "emit");
    registerSettingsCommands();
  });

  afterEach(() => {
    emitSpy.mockRestore();
    updateCoreCallbacks(null as unknown as CoreCallbacks);
  });

  it("未声明形态 → 悬浮面板（现状行为一字不改）", async () => {
    seedSettings({ floatingPanel: { viewId: "settings" } });
    await executeCommand("core.openSettings");
    expect(reveals()).toEqual([{ viewId: "settings", pluginId: SETTINGS_ID }]);
    expect(openTab).not.toHaveBeenCalled();
  });

  it("defaultForm:tab → 开标签页；🔴 且不再发悬浮面板（负控：两条路只能走一条）", async () => {
    seedSettings({ floatingPanel: { viewId: "settings", defaultForm: "tab" } });
    await executeCommand("core.openSettings");
    expect(openTab).toHaveBeenCalledWith(SETTINGS_ID);
    expect(reveals()).toEqual([]);
  });

  it("defaultForm:floatingPanel → 悬浮面板（作者显式定死仍是面板）", async () => {
    seedSettings({ floatingPanel: { viewId: "settings", defaultForm: "floatingPanel" } });
    await executeCommand("core.openSettings");
    expect(reveals()).toHaveLength(1);
    expect(openTab).not.toHaveBeenCalled();
  });

  it("formKey 交给用户——键值 = tab → 标签页；键值 = floatingPanel → 面板", async () => {
    seedSettings({ floatingPanel: { viewId: "settings", formKey: KEY } });
    seedFormKey("floatingPanel");

    await executeCommand("core.openSettings");
    expect(reveals()).toHaveLength(1); // 键 default = 作者默认形态（面板）
    expect(openTab).not.toHaveBeenCalled();

    registerConfigurationDefaults(SETTINGS_ID, { [KEY]: "tab" }); // 用户改过（弱默认层代表"值被改写"）
    await executeCommand("core.openSettings");
    expect(openTab).toHaveBeenCalledWith(SETTINGS_ID);
    expect(reveals()).toHaveLength(1); // 仍是第一次那一条——没有第二条
  });

  it("已有设置标签页 → 聚焦优先：两条路都不走（形态只作用于「第一次打开」）", async () => {
    focusTabByPluginId.mockReturnValue(true);
    seedSettings({ floatingPanel: { viewId: "settings", defaultForm: "tab" } });
    await executeCommand("core.openSettings");
    expect(focusTabByPluginId).toHaveBeenCalledWith(SETTINGS_ID);
    expect(openTab).not.toHaveBeenCalled();
    expect(reveals()).toEqual([]);
  });

  it("声明 tab 但该插件无可开标签页形态（appearsIn.tabBar / entry 缺）→ 落回面板，不静默无动作", async () => {
    seedSettings({ floatingPanel: { viewId: "settings", defaultForm: "tab" }, tabCreatable: false });
    await executeCommand("core.openSettings");
    expect(openTab).not.toHaveBeenCalled();
    expect(reveals()).toHaveLength(1);
  });

  it("formKey 指向未注册键（作者写错字）→ 降级 defaultForm，不崩", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      seedSettings({ floatingPanel: { viewId: "settings", formKey: KEY, defaultForm: "tab" } });
      await executeCommand("core.openSettings");
      expect(openTab).toHaveBeenCalledWith(SETTINGS_ID);
      expect(reveals()).toEqual([]);
    } finally {
      warn.mockRestore();
    }
  });
});
