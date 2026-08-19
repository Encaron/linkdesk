/**
 * 外观/语言/主题/LangDef/协议/日志/状态栏/文件关联/对话框/ContextKey
 * register() 返 disposer 契约测试（E5.8#10-2 + #10-3）。
 *
 * 验收核心：注册→dispose→查询为空（每 Registry 独立钉）。
 * 附：同名覆盖 dispose 不误删后注册者（设计 §8 风险表）+ PluginLifecycle.onWillUninstall 自动回滚
 * + 无 pluginId / 全局作用域（fallback、壳级渲染器、external getter）不追踪。
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { PluginLifecycle } from "../../pluginLoader/lifecycle-events";
import { clearRegistrationLayers } from "./registrationTracker";
import { ThemeRegistry } from "./appearance/ThemeRegistry";
import { IconRegistry } from "./appearance/IconRegistry";
import { LanguageRegistry } from "./languages/LanguageRegistry";
import { registerTheme, getAvailableThemes, unregisterTheme } from "../services/ui/ThemeEngine";
import { registerLangDef, getLangDef, getAllLangDefs, clearLangDefs } from "./languages/LangDefRegistry";
import { registerProtocol, listProtocols, getProtocol, setActiveProtocol, getActiveProtocolId, clearProtocols } from "./ProtocolRegistry";
import { createLogChannel, getLogChannels, clearLogChannels } from "../services/ui/LogChannel";
import { createStatusBarItem, getDynamicStatusBarItems, clearStatusBarItems } from "../services/ui/StatusBarService";
import { registerFileAssociation, getPluginsFor, getAssociationsForPlugin, clearFileAssociations } from "../services/files/FileAssociationService";
import { registerDialogRenderers, confirm } from "../services/ui/DialogService";
import { ContextKeyService } from "./commands/ContextKeyService";

const PID = "registry-disposer-test";
const PID_OTHER = "registry-disposer-test-other";

describe("ThemeRegistry — register() 返 disposer", () => {
  beforeEach(() => {
    clearRegistrationLayers();
    for (const t of ThemeRegistry.getAll()) ThemeRegistry.unregister(t.id);
  });

  it("注册→dispose→has/getAll 为空", () => {
    const dispose = ThemeRegistry.register({ id: "td1", label: "T1", uiTheme: "dark", path: "a.json" }, PID);
    expect(ThemeRegistry.has("td1")).toBe(true);

    dispose();

    expect(ThemeRegistry.has("td1")).toBe(false);
    expect(ThemeRegistry.getAll().some((t) => t.id === "td1")).toBe(false);
  });

  it("同名覆盖——旧注册者 dispose 不删后注册者主题（防误删）", () => {
    const disposeA = ThemeRegistry.register({ id: "td2", label: "A", uiTheme: "dark", path: "a.json" }, PID);
    const disposeB = ThemeRegistry.register({ id: "td2", label: "B", uiTheme: "dark", path: "b.json" }, PID_OTHER);

    disposeA(); // 不再占位——不得删 B 的主题

    expect(ThemeRegistry.has("td2")).toBe(true);
    expect(ThemeRegistry.getAll().find((t) => t.id === "td2")!.label).toBe("B");

    disposeB();
    expect(ThemeRegistry.has("td2")).toBe(false);
  });

  it("fire onWillUninstall → 主题自动逆序回滚", () => {
    ThemeRegistry.register({ id: "td3", label: "T3", uiTheme: "dark", path: "c.json" }, PID);

    PluginLifecycle.onWillUninstall.fire({ pluginId: PID, reason: "uninstall" });

    expect(ThemeRegistry.has("td3")).toBe(false);
  });
});

describe("IconRegistry — register() 返 disposer", () => {
  beforeEach(() => {
    clearRegistrationLayers();
  });

  it("register（图标主题）注册→dispose→has 为空", () => {
    const dispose = IconRegistry.register({ id: "id1", label: "I1", path: "a.json" }, PID);
    expect(IconRegistry.has("id1")).toBe(true);

    dispose();

    expect(IconRegistry.has("id1")).toBe(false);
  });

  it("registerIcon 注册→dispose→hasIcon 为空", () => {
    const dispose = IconRegistry.registerIcon("shared-icon", {
      description: "shared",
      default: { fontCharacter: "" },
    }, PID);
    expect(IconRegistry.hasIcon("shared-icon")).toBe(true);

    dispose();

    expect(IconRegistry.hasIcon("shared-icon")).toBe(false);
  });

  it("fire onWillUninstall → 图标主题 + 共享图标自动回滚", () => {
    IconRegistry.register({ id: "id2", label: "I2", path: "b.json" }, PID);
    IconRegistry.registerIcon("shared2", { description: "s", default: {} }, PID);

    PluginLifecycle.onWillUninstall.fire({ pluginId: PID, reason: "uninstall" });

    expect(IconRegistry.has("id2")).toBe(false);
    expect(IconRegistry.hasIcon("shared2")).toBe(false);
  });
});

describe("LanguageRegistry — register() 返 disposer", () => {
  beforeEach(() => {
    clearRegistrationLayers();
  });

  it("注册→dispose→has/getAll 为空", () => {
    const dispose = LanguageRegistry.register({ id: "ja", label: "日本語", path: "ja.json" }, PID);
    expect(LanguageRegistry.has("ja")).toBe(true);

    dispose();

    expect(LanguageRegistry.has("ja")).toBe(false);
    expect(LanguageRegistry.getAll().some((l) => l.id === "ja")).toBe(false);
  });

  it("fire onWillUninstall → 语言自动逆序回滚", () => {
    LanguageRegistry.register({ id: "fr", label: "Français", path: "fr.json" }, PID);

    PluginLifecycle.onWillUninstall.fire({ pluginId: PID, reason: "uninstall" });

    expect(LanguageRegistry.has("fr")).toBe(false);
  });
});

describe("ThemeEngine — registerTheme() 返 disposer", () => {
  beforeEach(() => {
    clearRegistrationLayers();
    for (const name of getAvailableThemes()) unregisterTheme(name);
  });

  it("注册→dispose→getAvailableThemes 不含", () => {
    const dispose = registerTheme({ name: "TE1", type: "dark", colors: {} }, PID);
    expect(getAvailableThemes()).toContain("TE1");

    dispose();

    expect(getAvailableThemes()).not.toContain("TE1");
  });

  it("无 pluginId（fallback）不追踪——卸载只滚插件主题，fallback 存活", () => {
    const disposeFallback = registerTheme({ name: "Fallback", type: "dark", colors: {} }); // 非插件域
    registerTheme({ name: "PluginTheme", type: "dark", colors: {} }, PID);

    PluginLifecycle.onWillUninstall.fire({ pluginId: PID, reason: "uninstall" });

    expect(getAvailableThemes()).not.toContain("PluginTheme"); // 追踪 → 已滚
    expect(getAvailableThemes()).toContain("Fallback");        // 未追踪 → 存活

    disposeFallback();
    expect(getAvailableThemes()).not.toContain("Fallback");
  });
});

describe("LangDefRegistry — registerLangDef() 返 disposer（E5.8#10-3）", () => {
  beforeEach(() => {
    clearRegistrationLayers();
    clearLangDefs();
  });

  it("注册→dispose→getLangDef/getAllLangDefs 为空", () => {
    const dispose = registerLangDef(PID, { id: "ld1", extensions: [".xyz", "abc"] });
    expect(getLangDef(".xyz")).toBeDefined();
    expect(getLangDef("abc")).toBeDefined();

    dispose();

    expect(getLangDef(".xyz")).toBeUndefined();
    expect(getLangDef("abc")).toBeUndefined();
    expect(getAllLangDefs().size).toBe(0);
  });

  it("同名覆盖——旧注册者 dispose 不删新注册者条目 + 反向索引不误清", () => {
    const defA = { id: "ldA", extensions: [".q1"] };
    const defB = { id: "ldB", extensions: [".q1"] };
    const disposeA = registerLangDef(PID, defA);
    registerLangDef(PID_OTHER, defB);

    disposeA(); // .q1 已被 B 覆盖——A 不得删

    expect(getLangDef(".q1")).toBe(defB);
  });

  it("fire onWillUninstall → 语言定义自动逆序回滚", () => {
    registerLangDef(PID, { id: "ld3", extensions: [".m3"] });

    PluginLifecycle.onWillUninstall.fire({ pluginId: PID, reason: "uninstall" });

    expect(getLangDef(".m3")).toBeUndefined();
  });
});

describe("ProtocolRegistry — registerProtocol() 返 disposer（E5.8#10-3）", () => {
  beforeEach(() => {
    clearRegistrationLayers();
    clearProtocols();
  });

  it("注册→dispose→listProtocols 不含 + 活跃协议回退", () => {
    const dispose = registerProtocol({ id: "pr1", name: "PR1", pluginId: PID, mode: "text" });
    expect(listProtocols().some((p) => p.id === "pr1")).toBe(true);
    setActiveProtocol("pr1");
    expect(getActiveProtocolId()).toBe("pr1");

    dispose();

    expect(listProtocols().some((p) => p.id === "pr1")).toBe(false);
    expect(getActiveProtocolId()).toBe("bracket");
  });

  it("同名覆盖——旧注册者 dispose 不删新协议", () => {
    const disposeA = registerProtocol({ id: "pr2", name: "A", pluginId: PID, mode: "text" });
    registerProtocol({ id: "pr2", name: "B", pluginId: PID_OTHER, mode: "text" });

    disposeA();

    expect(listProtocols().some((p) => p.id === "pr2")).toBe(true);
    expect(getProtocol("pr2")!.name).toBe("B");
  });

  it("fire onWillUninstall → 协议自动逆序回滚", () => {
    registerProtocol({ id: "pr3", name: "PR3", pluginId: PID, mode: "text" });

    PluginLifecycle.onWillUninstall.fire({ pluginId: PID, reason: "uninstall" });

    expect(listProtocols().some((p) => p.id === "pr3")).toBe(false);
  });
});

describe("LogChannel — createLogChannel() 追踪（E5.8#10-3）", () => {
  beforeEach(() => {
    clearRegistrationLayers();
    clearLogChannels();
  });

  it("channel.dispose() → getLogChannels 不含", () => {
    const ch = createLogChannel(PID, "LC1");
    expect(getLogChannels().some((c) => c.id === ch.id)).toBe(true);

    ch.dispose();

    expect(getLogChannels().some((c) => c.id === ch.id)).toBe(false);
  });

  it("fire onWillUninstall → 频道自动逆序回滚", () => {
    createLogChannel(PID, "LC2");

    PluginLifecycle.onWillUninstall.fire({ pluginId: PID, reason: "uninstall" });

    expect(getLogChannels().some((c) => c.name === "LC2")).toBe(false);
  });

  it("重复创建返回既有频道——仅 fresh-create 追踪，已 dispose 后重放无害", () => {
    const ch1 = createLogChannel(PID, "LC3");
    const ch2 = createLogChannel(PID, "LC3");
    expect(ch1).toBe(ch2);

    ch1.dispose();
    PluginLifecycle.onWillUninstall.fire({ pluginId: PID, reason: "uninstall" }); // 重放——幂等
    expect(getLogChannels().some((c) => c.id === ch1.id)).toBe(false);
  });
});

describe("StatusBarService — createStatusBarItem() 追踪（E5.8#10-3）", () => {
  beforeEach(() => {
    clearRegistrationLayers();
    clearStatusBarItems();
  });

  it("fire onWillUninstall → 动态状态栏项自动逆序回滚", () => {
    createStatusBarItem(PID, "sb1", { label: "SB1" });
    expect(getDynamicStatusBarItems().some((i) => i.id === "sb1")).toBe(true);

    PluginLifecycle.onWillUninstall.fire({ pluginId: PID, reason: "uninstall" });

    expect(getDynamicStatusBarItems().some((i) => i.id === "sb1")).toBe(false);
  });

  it("handle.dispose 幂等——双重调用无害", () => {
    const handle = createStatusBarItem(PID, "sb2", { label: "SB2" });
    handle.dispose();
    handle.dispose(); // 已删——第二次 no-op
    expect(getDynamicStatusBarItems().some((i) => i.id === "sb2")).toBe(false);
  });
});

describe("FileAssociationService — registerFileAssociation() 返 disposer（E5.8#10-3）", () => {
  beforeEach(() => {
    clearRegistrationLayers();
    clearFileAssociations();
  });

  it("注册→dispose→getPluginsFor 空 + 反向索引清空", () => {
    const dispose = registerFileAssociation({ extension: ".fake1", pluginId: PID, command: "openFile" });
    expect(getPluginsFor(".fake1").length).toBe(1);

    dispose();

    expect(getPluginsFor(".fake1")).toEqual([]);
    expect(getAssociationsForPlugin(PID)).toEqual([]);
  });

  it("同插件重复注册返回 no-op disposer——首注册者持删除权", () => {
    const disposeA = registerFileAssociation({ extension: ".fake2", pluginId: PID });
    const disposeB = registerFileAssociation({ extension: ".fake2", pluginId: PID });

    disposeB(); // no-op

    expect(getPluginsFor(".fake2").length).toBe(1);

    disposeA();
    expect(getPluginsFor(".fake2")).toEqual([]);
  });

  it("fire onWillUninstall → 文件关联自动逆序回滚", () => {
    registerFileAssociation({ extension: ".fake3", pluginId: PID });

    PluginLifecycle.onWillUninstall.fire({ pluginId: PID, reason: "uninstall" });

    expect(getPluginsFor(".fake3")).toEqual([]);
  });
});

describe("DialogService — registerDialogRenderers() 返 disposer 不 track（E5.8#10-3 全局作用域）", () => {
  it("dispose → 渲染器已撤，confirm 回退 window.confirm", async () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockImplementation(() => true);
    try {
      const dispose = registerDialogRenderers(async () => false, async () => {});
      dispose();

      expect(await confirm({ title: "t", message: "m" })).toBe(true); // 回退——mock 的 window.confirm
    } finally {
      confirmSpy.mockRestore();
    }
  });

  it("引用级守卫——dispose 只撤自己的渲染器，后注册者存活", async () => {
    const disposeA = registerDialogRenderers(async () => true, async () => {});
    const disposeB = registerDialogRenderers(async () => false, async () => {});

    disposeA();

    expect(await confirm({ title: "t", message: "m" })).toBe(false); // B 的渲染器存活

    disposeB();

    const confirmSpy = vi.spyOn(window, "confirm").mockImplementation(() => true);
    try {
      expect(await confirm({ title: "t", message: "m" })).toBe(true); // 全部撤完——回退
    } finally {
      confirmSpy.mockRestore();
    }
  });
});

describe("ContextKeyService — registerExternalGetter() 返 disposer 不 track（E5.8#10-3 全局作用域）", () => {
  beforeEach(() => {
    ContextKeyService.clear();
  });

  it("dispose → external getter 移除，回退 _state", () => {
    ContextKeyService.setValue("k", "state-val");
    const dispose = ContextKeyService.registerExternalGetter((key) => (key === "k" ? "getter-val" : undefined));

    expect(ContextKeyService.getValue("k")).toBe("getter-val"); // getter 优先

    dispose();

    expect(ContextKeyService.getValue("k")).toBe("state-val"); // 回退 _state
  });

  it("不 track——fire onWillUninstall 后 getter 存活（全局作用域，设计 §5）", () => {
    const dispose = ContextKeyService.registerExternalGetter(() => "survived");

    PluginLifecycle.onWillUninstall.fire({ pluginId: "any-plugin", reason: "uninstall" });

    expect(ContextKeyService.getValue("anything")).toBe("survived");

    dispose();
  });
});
