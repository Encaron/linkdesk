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
import { clearMenus, MENU_SLOTS } from "../../registry/commands/MenuRegistry";
import { ContextKeyService } from "../../registry/commands/ContextKeyService";
import { handleSettingsChannel } from "../../services/plugins/IpcBridgeHandler/ui";
import type { MenuItemDescriptor } from "../../api/linkdesk-api";
import {
  registerConfiguration,
  registerConfigurationDefaults,
  clearConfigurationRegistrations,
} from "../../registry/ConfigurationRegistry";
import { registerViewPlugin, clearRegistry } from "../../../pluginLoader/contributions/viewRegistry";
import { factorySlots } from "../../services/bootstrap/FactorySlots";
import { clearPluginStates } from "../../services/plugins/PluginStateService";
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
    // 2026-09-30「齿轮归壳」后设置插件不再声明 iconBar（齿轮改由壳自带 owned 按钮提供）——
    // fixture 与真 manifest 保持同形，免得下一个人照抄「设置插件声明 bottom」这个已被废除的写法
    appearsIn: { tabBar: tabCreatable },
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

describe("齿轮菜单——「设置」项空槽门控（2026-09-30 齿轮归壳 · 件 3）", () => {
  beforeEach(() => {
    clearRegistrationLayers();
    clearCommands();
    clearMenus();
    clearRegistry();
    clearConfigurationRegistrations();
    ContextKeyService.clear();
    registerSettingsCommands();
  });

  /** 经壳侧 menu:getItems 端到端（when 求值壳侧一站式——与 gearMenuWhen.test.ts 同一条路）。
   *  齿轮菜单的 context 是空对象（池 `context={{}}`）⇒ 命中全局 ContextKeyService 的值。 */
  const gearItems = async (): Promise<MenuItemDescriptor[]> =>
    await handleSettingsChannel("menu:getItems", [MENU_SLOTS.ExtensionGear, {}]) as MenuItemDescriptor[];

  it("settingsSlotFilled=false（槽空）⇒ 「设置」项不显示，其余项照旧", async () => {
    ContextKeyService.setValue("settingsSlotFilled", false);
    const items = await gearItems();
    expect(items.find((i) => i.command === "core.openSettings")).toBeFalsy();
    expect(items.find((i) => i.command === "theme.pick")).toBeTruthy();
    expect(items.find((i) => i.command === "app.about")).toBeTruthy();
  });

  it("settingsSlotFilled=true（槽里有套）⇒ 「设置」项回来", async () => {
    ContextKeyService.setValue("settingsSlotFilled", true);
    const items = await gearItems();
    expect(items.find((i) => i.command === "core.openSettings")).toBeTruthy();
  });

  it("键从未被设过（undefined）⇒ 项不显示——与 false 同判（首推之前不留空壳项）", async () => {
    const items = await gearItems();
    expect(items.find((i) => i.command === "core.openSettings")).toBeFalsy();
  });
});

/** 逃生舱用例的槽种子——只喂 factorySlots（本命令不读 viewRegistry，故不注册视图声明）。
 *  候选序即注册序：第 1 个 = 内置（默认套），第 2 个 = 第三方。
 *  ⚠️ 先 `refreshFromPlugins()`（测试环境无已加载插件 ⇒ 清空）：`initialize` 只覆盖不清理，
 *  不先清的话上一格用例的候选会残留 ⇒ 「槽空」用例根本造不出来（假绿最坏的那种）。 */
const THIRD_PARTY_ID = "settings-third";
function seedSlot(candidates: string[]): void {
  factorySlots.refreshFromPlugins();
  if (candidates.length === 0) return;
  factorySlots.initialize(
    candidates.map((pluginId) => ({
      pluginId,
      manifest: { pluginId, name: pluginId, factoryRole: "settings" } as unknown as PluginManifest,
    })),
  );
}

describe("core.resetSettingsToBuiltin——逃生舱（本案 4.3 · [01 §五] 判据 E13）", () => {
  beforeEach(() => {
    clearRegistrationLayers();
    clearCommands();
    clearMenus();
    clearRegistry();
    clearConfigurationRegistrations();
    ContextKeyService.clear();
    // 激活套是**落盘状态**（PluginStateService）——不清的话上一格用例 setActive 的结果会串进来，
    // 用例就先于断言互相污染了
    clearPluginStates();
    registerSettingsCommands();
  });

  /** 与上一块同一条端到端路（壳侧 when 求值一站式） */
  const gearItems = async (): Promise<MenuItemDescriptor[]> =>
    await handleSettingsChannel("menu:getItems", [MENU_SLOTS.ExtensionGear, {}]) as MenuItemDescriptor[];
  /** 兜底项——只在「有激活套且非内置」时该出现的那个 command id */
  const RESET = "core.resetSettingsToBuiltin";
  type Receipt = {
    reset: boolean; previous?: string | null; active?: string | null;
    reason?: string; noop?: boolean; error?: string;
  };

  it("激活套=第三方 ⇒ 齿轮给兜底项；执行后激活套回内置（落盘保持）＋ 回执如实", async () => {
    seedSlot([SETTINGS_ID, THIRD_PARTY_ID]);
    await factorySlots.setActive("settings", THIRD_PARTY_ID);
    expect(factorySlots.getActive("settings")).toBe(THIRD_PARTY_ID);

    // 旗子由 usePoolSync 推送（此处按推送后的值手设：有套 ＋ 非内置）
    ContextKeyService.setValue("settingsSlotFilled", true);
    ContextKeyService.setValue("settingsActiveIsBuiltin", false);
    const items = await gearItems();
    expect(items.find((i) => i.command === RESET)).toBeTruthy();
    // 原「设置」项照旧在（逃生舱是**加**一项，不是替换）
    expect(items.find((i) => i.command === "core.openSettings")).toBeTruthy();

    const r = await executeCommand(RESET) as Receipt;
    expect(r.reset).toBe(true);
    expect(r.previous).toBe(THIRD_PARTY_ID);
    expect(r.active).toBe(SETTINGS_ID);
    expect(factorySlots.getActive("settings")).toBe(SETTINGS_ID);
    expect(factorySlots.getPluginIds("settings")[0]).toBe(SETTINGS_ID); // 候选面一字未动
  });

  it("激活套就是内置 ⇒ 齿轮**不给**兜底项（不留空壳项）＋ 命令报 noop（不假装切了一次）", async () => {
    seedSlot([SETTINGS_ID, THIRD_PARTY_ID]);
    // 未 setActive ⇒ getActive 回退默认 = 内置
    expect(factorySlots.getActive("settings")).toBe(SETTINGS_ID);

    ContextKeyService.setValue("settingsSlotFilled", true);
    ContextKeyService.setValue("settingsActiveIsBuiltin", true);
    const items = await gearItems();
    expect(items.find((i) => i.command === RESET)).toBeFalsy();
    expect(items.find((i) => i.command === "core.openSettings")).toBeTruthy();

    const r = await executeCommand(RESET) as Receipt;
    expect(r.reset).toBe(false);
    expect(r.noop).toBe(true);
    expect(r.reason).toBe("already-builtin");
    expect(r.active).toBe(SETTINGS_ID);
  });

  it("槽空 ⇒ 命令报 no-slot（命令面板仍可达）；齿轮连「设置」项都没有", async () => {
    seedSlot([]);
    ContextKeyService.setValue("settingsSlotFilled", false);
    ContextKeyService.setValue("settingsActiveIsBuiltin", false);
    const items = await gearItems();
    expect(items.find((i) => i.command === RESET)).toBeFalsy();
    expect(items.find((i) => i.command === "core.openSettings")).toBeFalsy();

    const r = await executeCommand(RESET) as Receipt;
    expect(r.reset).toBe(false);
    expect(r.reason).toBe("no-slot");
  });

  it("回退后走正门 core.openSettings ⇒ 打到内置套（不重启即可再开设置页 = E13 的判据）", async () => {
    // 两只套都声明悬浮面板（openSettings 的最后一条路 = emit reveal-floating，载荷里带实际 pluginId）
    for (const pluginId of [SETTINGS_ID, THIRD_PARTY_ID]) {
      registerViewPlugin({
        pluginId,
        manifest: {
          pluginId,
          name: pluginId,
          factoryRole: "settings",
          contributes: { floatingPanel: { viewId: pluginId } },
        } as unknown as PluginManifest,
      });
    }
    const emitSpy = vi.spyOn(shellEvents, "emit");
    updateCoreCallbacks({ openTab: vi.fn(), focusTabByPluginId: vi.fn(() => false) } as unknown as CoreCallbacks);
    try {
      seedSlot([SETTINGS_ID, THIRD_PARTY_ID]);
      await factorySlots.setActive("settings", THIRD_PARTY_ID);
      await executeCommand(RESET);
      await executeCommand("core.openSettings");
      const reveals = (emitSpy.mock.calls as Array<[string, { pluginId?: string }]>)
        .filter(([event]) => event === "panel:reveal-floating");
      expect(reveals).toHaveLength(1);
      expect(reveals[0][1].pluginId).toBe(SETTINGS_ID);
    } finally {
      emitSpy.mockRestore();
      updateCoreCallbacks(null as unknown as CoreCallbacks);
    }
  });
});
