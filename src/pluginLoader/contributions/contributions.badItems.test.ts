/**
 * parseContributions 坏项宽容单测——**壳侧根治**（E6#151/#152 层内例外第三次兑现）。
 *
 * 🔴 背景（根因，实测）：`contributes` 整块在**装载路径零形状校验**——`validateInstallManifest`
 * （discovery/manifest.ts）只校 `pluginId`/`version`/`name`；`public/schemas/plugin.schema.json`
 * 只喂**作者侧**校验器（SDK `validate.ts`）⇒ 手写清单写坏（`commands: [null]` 空槽、把数组写成
 * `{}`）会一路走进 `parseContributions`。修前各循环直读 `cmd.id` / `for...of`：一处坏项抛错被
 * `loadPluginLifecycle`（resolution/runtime.ts）那句 `catch { console.error }` 吞掉 ⇒ 该插件
 * **从这一项往后的全部贡献静默不注册**（菜单/快捷键/主题/视图容器/视图全丢——界面表现 =
 * 「插件装了、面板空着」），用户零提示、日志只有一行错。
 *
 * 本文件钉住修后的契约（与 `normalizeIconThemeMappings` 无效条目同款）：
 * **坏项跳过 + warn 一条带位置的信息，解析永不抛，其余项照常注册。**
 * ⚠️ 关键断言不是「不抛」，而是第 ② 组那句「**坏项不吃掉后面的贡献**」——那才是用户看到的伤害。
 *
 * 边界（本文件**不**覆盖，仍待另案）：项内**字段缺失**（如 command 无 `id`）不属本轮口径——
 * 本轮只管「这一项能不能安全递出去」；字段级语义判断仍在各 Registry。
 *
 * fixture 全虚构（硬约束 21）：demo-plugin / demo.cmd.alpha / Demo Alpha——不指真实插件。
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { parseContributions } from "./contributions";
import { clearCommands, getPluginCommands } from "../../core/registry/commands/CommandRegistry";
import { clearMenus, clearTitleBarContributions, getAllMenus, getMenuItems, MENU_SLOTS } from "../../core/registry/commands/MenuRegistry";
import { clearConfigurationRegistrations, getConfigurationDefaults, getPluginConfiguration } from "../../core/registry/ConfigurationRegistry";
import { ThemeRegistry } from "../../core/registry/appearance/ThemeRegistry";
import { ViewContainerService } from "../../core/services/layout/ViewContainerService";

/** 虚构插件 id（硬约束 21：测试夹具不用真插件名） */
const PLUGIN = "demo-plugin";
/** 视图注册的根 URL——夹具直给，绕开 resolveRuntimePluginRoot（那是 IPC 域） */
const PLUGIN_ROOT = "linkdesk://demo-plugin";

/** 一条合规主题声明（id 必须带本插件前缀——`dark` 是宿主保底配方 id，占它会走运行时仲裁②） */
const THEME = { id: `${PLUGIN}.dark`, label: "Demo Dark", uiTheme: "dark" as const, path: "dark.json" };

function resettledRegistries() {
  clearCommands();
  clearMenus();
  clearTitleBarContributions();
  clearConfigurationRegistrations();
  ViewContainerService.unregisterAll(PLUGIN);
  // LanguageRegistry / ThemeRegistry 的 unregisterAll 是 protected——经窄接口 cast 直调
  // （E5.7#98 替代 as any 的既有做法，见 loader.test.ts 同款）
  const unregisterAll = (r: unknown) => (r as { unregisterAll?: (pluginId: string) => void }).unregisterAll;
  try { unregisterAll(ThemeRegistry)?.(PLUGIN); } catch { /* 无注册项 */ }
}

let warn: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  resettledRegistries();
  warn = vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  warn.mockRestore();
});

describe("① 数组形 —— 空槽/非对象项跳过，好项照旧注册", () => {
  it("commands 里夹一个 null 空槽 → 好项照常注册，warn 一条并带下标记位", async () => {
    await parseContributions(PLUGIN, {
      commands: [null, { id: "demo.cmd.alpha", title: "Demo Alpha" }],
    });

    expect(getPluginCommands(PLUGIN)).toEqual(["demo.cmd.alpha"]);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0][0])).toContain("contributes.commands[0]");
  });

  it("整组全是空槽 → 零注册、不抛，只 warn 逐项", async () => {
    await parseContributions(PLUGIN, { commands: [null, undefined, "demo-string"] as never });

    expect(getPluginCommands(PLUGIN)).toEqual([]);
    expect(warn).toHaveBeenCalledTimes(3);
  });
});

describe("② 🔴 坏项不吃掉后面的贡献（修前用户看到的伤害就是这个）", () => {
  it("commands[0] 是 null 时，紧随其后的 menus / keybindings / themes 仍全部注册", async () => {
    await parseContributions(PLUGIN, {
      commands: [null],
      menus: { [MENU_SLOTS.EditorContext]: [{ command: "demo.cmd.alpha" }] },
      keybindings: [null, { command: "demo.cmd.alpha", key: "ctrl+demo" }],
      themes: [THEME],
    });

    // 修前：第一项就抛 ⇒ 这三组一条都进不来（这正是「插件装了、面板空着」的成因）
    expect(getMenuItems(MENU_SLOTS.EditorContext).some((i) => i.command === "demo.cmd.alpha")).toBe(true);
    expect(ThemeRegistry.getAll().some((t) => t.pluginId === PLUGIN && t.label === "Demo Dark")).toBe(true);
    expect(warn).toHaveBeenCalledTimes(2); // commands[0] ＋ keybindings[0]
  });

  it("views 里一个容器写坏，不吃掉另一个容器的视图", async () => {
    await parseContributions(
      PLUGIN,
      {
        viewsContainers: { "demo-container": { title: "Demo Container" }, "demo-bad": null },
        views: {
          "demo-container": [null, { id: "demo-view", title: "Demo View", render: "views/Demo.tsx" }],
          "demo-empty": "nope",
        },
      },
      PLUGIN_ROOT
    );

    expect(ViewContainerService.getViewContainer("demo-container")?.title).toBe("Demo Container");
    expect(ViewContainerService.getView(PLUGIN, "demo-view")?.id).toBe("demo-view");
    expect(ViewContainerService.getViewContainer("demo-bad")).toBeUndefined();
  });
});

describe("③ 形状写错（数组 ↔ 表 写反）—— 整项跳过 + warn，不抛", () => {
  it("commands 写成对象（该是数组）→ 整项跳过、零注册，不抛", async () => {
    await parseContributions(PLUGIN, { commands: { id: "demo.cmd.alpha" } as never });

    expect(getPluginCommands(PLUGIN)).toEqual([]);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0][0])).toContain("contributes.commands 不是数组");
  });

  it("menus 写成数组（该是键值表）→ 整组跳过，同清单的 commands 照常注册", async () => {
    await parseContributions(PLUGIN, {
      commands: [{ id: "demo.cmd.alpha", title: "Demo Alpha" }],
      menus: [{ command: "demo.cmd.alpha" }] as never,
    });

    expect(getPluginCommands(PLUGIN)).toEqual(["demo.cmd.alpha"]);
    expect(getAllMenus().size).toBe(0);
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it("configuration / configurationDefaults 形状不对 → 各自跳过 + warn，其余贡献照常", async () => {
    await parseContributions(PLUGIN, {
      configuration: "nope",
      configurationDefaults: 42,
      themes: [THEME],
    });

    expect(getPluginConfiguration(PLUGIN)).toBeUndefined();
    expect(getConfigurationDefaults()).toEqual({});
    expect(ThemeRegistry.getAll().some((t) => t.pluginId === PLUGIN)).toBe(true);
    expect(warn).toHaveBeenCalledTimes(2);
  });

  it("titleBar 整项形状不对 → 跳过不抛（left/right 两槽都空）", async () => {
    await parseContributions(PLUGIN, { titleBar: "nope" });

    expect(warn).toHaveBeenCalledTimes(1);
  });
});

describe("④ 正控 —— 合规清单零误报（宽容层不吃好数据）", () => {
  it("五组齐全的合规清单 → 全组注册，且 warn 一次不响", async () => {
    await parseContributions(
      PLUGIN,
      {
        commands: [{ id: "demo.cmd.alpha", title: "Demo Alpha" }],
        menus: { [MENU_SLOTS.EditorContext]: [{ command: "demo.cmd.alpha" }] },
        keybindings: [{ command: "demo.cmd.alpha", key: "ctrl+demo" }],
        configuration: { title: "Demo Settings", properties: { "demo.setting.alpha": { type: "string" } } },
        configurationDefaults: { "demo.setting.alpha": "demo" },
        themes: [THEME],
        titleBar: { left: [{ command: "demo.cmd.alpha", order: 10 }] },
        viewsContainers: { "demo-container": { title: "Demo Container" } },
        views: { "demo-container": [{ id: "demo-view", title: "Demo View", render: "views/Demo.tsx" }] },
      },
      PLUGIN_ROOT
    );

    expect(getPluginCommands(PLUGIN)).toEqual(["demo.cmd.alpha"]);
    expect(getMenuItems(MENU_SLOTS.EditorContext)).toHaveLength(1);
    expect(getPluginConfiguration(PLUGIN)?.title).toBe("Demo Settings");
    expect(getConfigurationDefaults()["demo.setting.alpha"]).toBe("demo");
    expect(ThemeRegistry.getAll().some((t) => t.pluginId === PLUGIN)).toBe(true);
    expect(ViewContainerService.getView(PLUGIN, "demo-view")?.id).toBe("demo-view");
    expect(warn).toHaveBeenCalledTimes(0);
  });

  it("空清单（无 contributes）→ 静默无事（不因缺省而 warn）", async () => {
    await parseContributions(PLUGIN, {});

    expect(warn).toHaveBeenCalledTimes(0);
    expect(getPluginCommands(PLUGIN)).toEqual([]);
  });
});
