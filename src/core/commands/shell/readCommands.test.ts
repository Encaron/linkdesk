/**
 * readCommands 测试——M2 `AI#62` 读数命令族（配置读 ／ 配置清单 ／ 布局读 ／ 容器与视图读）。
 *
 * 覆盖：
 *   - `getConfiguration`：五层合并读数（declared／userValue／effectiveValue）＋ 未知键**如实报**
 *     `declared:false` ＋ 两种调用形（逐位 / 单具名对象）等价 ＋ 坏参 ⇒ **载荷里的报错**（⛔ 不抛
 *     异常——抛会被壳侧 `reportError` 弹用户 toast）。
 *   - `listConfigurations`：分组清单（类型/默认/枚举/说明）＋ **不变量**：清单里每个键都能被
 *     `getConfiguration` 认下（贡献面与合并 schema 的键集一致，两家不许打架）。
 *   - `getLayout`：窗口容器尺寸 ＋ 侧栏/面板几何 ＋ 显隐（读面槽）＋ 负控：槽未注册 ⇒ **大声抛**。
 *   - `listViews`：容器 → 视图 ＋ 归属插件 ＋ 可见/折叠态 ＋ 负控级边界：**异插件同名视图**各归各的。
 *   - 四条命令都只挂门牌——零 `shellEvents.emit`（无新通道）。
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { clearRegistrationLayers } from "../../registry/registrationTracker";
import { executeCommandStrict, clearCommands } from "../../registry/commands/CommandRegistry";
import {
  registerConfiguration,
  clearConfigurationRegistrations,
  type ConfigurationContribution,
} from "../../registry/ConfigurationRegistry";
import { clearConfigurationCache, setConfigurationValue } from "../../services/configuration/ConfigurationService";
import { layoutEngine, type ZoneConfig } from "../../services/layout/LayoutEngine";
import { ViewContainerService } from "../../services/layout/ViewContainerService";
import { layoutSnapshot } from "../../services/plugins/readSnapshots";
import { clearPluginStates } from "../../services/plugins/PluginStateService";
import { shellEvents } from "../../react/events/ShellEvents";
import { registerReadCommands } from "./readCommands";

const CFG_PLUGIN = "read-test";
const PLUGIN_A = "read-test-a";
const PLUGIN_B = "read-test-b";

/** 夹具配置贡献——键取**非宿主前缀**（保护区只对非宿主身份生效，`readtest.*` 不撞保留面） */
const CFG: ConfigurationContribution = {
  title: "读数测试组",
  properties: {
    "readtest.theme": {
      type: "string",
      default: "dark",
      enum: ["dark", "light"],
      enumDescriptions: ["深色", "浅色"],
      description: "测试主题",
    },
    "readtest.fontSize": { type: "number", default: 14, description: "测试字号" },
  },
};

function freshConfig(): ConfigurationContribution {
  return JSON.parse(JSON.stringify(CFG));
}

/** 引擎构造器的默认 5 zone——**模块加载时抓一份**：测试会改 zone（如设侧栏宽），⛔ 不能每次现取；
 *  ⛔ 也不手抄字面量——手抄那份会和 panelCommands.test.ts 撞 jscpd 重复门（实测踩过）。 */
const DEFAULT_ZONES: readonly ZoneConfig[] = JSON.parse(JSON.stringify(layoutEngine.getAllZones()));

/** 壳运行期才加的那条（引擎默认里没有）——夹具补上，与真壳 6 zone 对齐 */
const RIGHT_SIDEBAR_ZONE: ZoneConfig = {
  zone: "rightSidebar",
  dock: { edge: "right", width: 300, minWidth: 180, maxWidth: 600 },
};

function resetEngine(): void {
  layoutEngine.setLayout([...(JSON.parse(JSON.stringify(DEFAULT_ZONES)) as ZoneConfig[]), RIGHT_SIDEBAR_ZONE]);
  layoutEngine.setContainerSize(1200, 800);
}

function baseSetup(): void {
  clearRegistrationLayers();
  clearCommands();
  clearConfigurationRegistrations();
  clearConfigurationCache();
  clearPluginStates();
  resetEngine();
  registerConfiguration(CFG_PLUGIN, freshConfig());
  registerReadCommands();
}

const dummy = () => null;

/** 布局读数的测试侧形状——只声明被测字段，其余走 Record（⛔ 别用 any：`--max-warnings 0` 会红） */
interface LayoutReading {
  container: { width: number; height: number };
  sidebar: Record<string, unknown>;
  panel: Record<string, unknown>;
}

describe("readCommands——getConfiguration（AI#62 ① 配置读）", () => {
  beforeEach(baseSetup);

  it("已声明键 ⇒ declared:true ＋ 三层来源（没设过的层如实报 null）", async () => {
    const r = (await executeCommandStrict("workbench.action.getConfiguration", undefined, "readtest.theme")) as Record<string, unknown>;
    expect(r).toEqual({
      key: "readtest.theme",
      declared: true,
      defaultValue: "dark",
      userValue: null,
      workspaceValue: null,
      effectiveValue: "dark",
    });
  });

  it("用户层设过 ⇒ userValue/effectiveValue 跟随（与设置页同一个五层合并，⛔ 不是第二把尺）", async () => {
    try {
      await setConfigurationValue("readtest.theme", "light");
    } catch {
      /* 测试环境无持久化——内存已更新（照 ConfigurationService.test.ts 的先例） */
    }
    const r = (await executeCommandStrict("workbench.action.getConfiguration", undefined, "readtest.theme")) as Record<string, unknown>;
    expect(r.userValue).toBe("light");
    expect(r.effectiveValue).toBe("light"); // 用户层胜过 schema 默认
    expect(r.defaultValue).toBe("dark"); // 默认层不被写坏
  });

  it("未知键 ⇒ declared:false 如实报（⛔ 不静默给默认值：键名写错和「没设过」必须分得开）", async () => {
    const r = (await executeCommandStrict("workbench.action.getConfiguration", undefined, "no.such.key")) as Record<string, unknown>;
    expect(r).toMatchObject({ key: "no.such.key", declared: false, effectiveValue: null });
  });

  it("两种调用形等价——逐位 [\"readtest.theme\"] ＝ 单具名对象 {key:…}（arity=1 时 AI#52 展开不开，本命令自己认）", async () => {
    const positional = await executeCommandStrict("workbench.action.getConfiguration", undefined, "readtest.theme");
    const named = await executeCommandStrict("workbench.action.getConfiguration", undefined, { key: "readtest.theme" });
    expect(named).toEqual(positional);
  });

  it("坏参 ⇒ 载荷里的报错（⛔ 不抛异常、⛔ 不静默 no-op）", async () => {
    for (const bad of [undefined, "", "   ", { other: "x" }, 42]) {
      const r = (await executeCommandStrict("workbench.action.getConfiguration", undefined, bad)) as Record<string, unknown>;
      expect(r.key).toBeNull();
      expect(r.declared).toBe(false);
      expect(String(r.error)).toContain("key");
    }
  });

  it("首尾空白被剪——读的是同一个键（AI 拼串常见）", async () => {
    const r = (await executeCommandStrict("workbench.action.getConfiguration", undefined, "  readtest.theme  ")) as Record<string, unknown>;
    expect(r.key).toBe("readtest.theme");
    expect(r.declared).toBe(true);
  });
});

describe("readCommands——listConfigurations（可发现性那一半）", () => {
  beforeEach(baseSetup);

  it("分组清单：插件分组 ＋ 逐键 类型/默认/说明（enum 声明了才出）", async () => {
    const r = (await executeCommandStrict("workbench.action.listConfigurations")) as {
      count: number;
      groups: Array<{ pluginId: string; title: string; keys: Array<Record<string, unknown>> }>;
    };
    const group = r.groups.find((g) => g.pluginId === CFG_PLUGIN);
    expect(group?.title).toBe("读数测试组");
    const theme = group?.keys.find((k) => k.key === "readtest.theme");
    expect(theme).toMatchObject({
      type: "string",
      default: "dark",
      enum: ["dark", "light"],
      description: "测试主题",
    });
    // 没声明 enum 的键 ⇒ 不带该字段（⛔ 不填 [] 占位——空枚举会被读成「一个允许值都没有」）
    const fontSize = group?.keys.find((k) => k.key === "readtest.fontSize");
    expect(fontSize).toBeDefined();
    expect("enum" in (fontSize as Record<string, unknown>)).toBe(false);
    expect(r.count).toBeGreaterThanOrEqual(2);
  });

  it("可发现性闭环：清单里**每个**键都能被 getConfiguration 认下（贡献面↔合并 schema 键集一致）", async () => {
    const r = (await executeCommandStrict("workbench.action.listConfigurations")) as {
      groups: Array<{ keys: Array<{ key: string }> }>;
    };
    const keys = r.groups.flatMap((g) => g.keys.map((k) => k.key));
    expect(keys).toContain("readtest.theme");
    for (const key of keys) {
      const one = (await executeCommandStrict("workbench.action.getConfiguration", undefined, key)) as Record<string, unknown>;
      expect(one.declared).toBe(true);
    }
  });
});

describe("readCommands——getLayout（AI#62 ② 布局读）", () => {
  let off: (() => void) | null = null;

  beforeEach(() => {
    baseSetup();
    off = layoutSnapshot.register(() => ({
      sidebarVisible: true,
      panelVisible: false,
      panelActiveViewId: "out-log",
      sidebarView: "read-test-a",
    }));
  });

  afterEach(() => {
    off?.();
    off = null;
  });

  it("容器尺寸 ＋ 侧栏/面板几何 ＋ 显隐（读数与壳 state 同一帧）", async () => {
    const r = (await executeCommandStrict("workbench.action.getLayout")) as unknown as LayoutReading;
    expect(r.container).toEqual({ width: 1200, height: 800 });
    expect(r.sidebar).toMatchObject({
      visible: true,
      view: "read-test-a",
      edge: "left",
      width: 280,
      collapsedWidth: 4,
      minWidth: 170,
      maxWidth: 600,
    });
    expect(r.sidebar.bounds).toMatchObject({ width: 280 });
    expect(r.panel).toMatchObject({
      visible: false,
      activeViewId: "out-log",
      edge: "bottom",
      align: "center",
      height: 220,
      minHeight: 120,
      maxHeight: 600,
    });
  });

  it("几何跟随写侧命令（AI#21 改宽度 → 读数当场变——写读同一权威）", async () => {
    const { registerPanelCommands } = await import("./panelCommands");
    registerPanelCommands();
    await executeCommandStrict("workbench.action.setSidebarWidth", undefined, 333);
    const r = (await executeCommandStrict("workbench.action.getLayout")) as unknown as LayoutReading;
    expect(r.sidebar.width).toBe(333);
  });

  it("负控：读面槽未注册 ⇒ 大声抛（⛔ 不返回空世界假装答了）", async () => {
    off?.();
    off = null;
    await expect(executeCommandStrict("workbench.action.getLayout")).rejects.toThrow(/layoutSnapshot/);
  });
});

describe("readCommands——listViews（AI#62 ③ 容器与视图读）", () => {
  beforeEach(baseSetup);

  afterEach(() => {
    ViewContainerService.unregisterAll(PLUGIN_A);
    ViewContainerService.unregisterAll(PLUGIN_B);
    clearPluginStates();
  });

  it("容器 → 视图 ＋ 归属插件 ＋ 可见/折叠态", async () => {
    ViewContainerService.registerViewContainer(PLUGIN_A, { id: "read-out", title: "输出", location: "panel" });
    ViewContainerService.registerView(PLUGIN_A, "read-out", { id: "out-log", title: "输出日志", render: dummy });
    ViewContainerService.registerView(PLUGIN_A, "read-out", {
      id: "out-problems",
      title: "问题",
      render: dummy,
      hideByDefault: true,
    });

    const r = (await executeCommandStrict("workbench.action.listViews")) as {
      count: number;
      containers: Array<{ id: string; title: string; location: string; views: Array<Record<string, unknown>> }>;
    };
    const c = r.containers.find((x) => x.id === "read-out");
    expect(c).toMatchObject({ title: "输出", location: "panel" });
    expect(c?.views).toHaveLength(2);
    expect(c?.views[0]).toMatchObject({
      id: "out-log",
      pluginId: PLUGIN_A,
      title: "输出日志",
      visible: true,
      collapsed: false,
    });
    // 声明面字段随行（hideByDefault 只在声明时出现）
    expect(c?.views[0]).not.toHaveProperty("hideByDefault");
    expect(c?.views[1]).toMatchObject({ id: "out-problems", hideByDefault: true });
  });

  it("显隐翻转 ⇒ 读数跟随（读数就是模型答案，不是镜像副本）", async () => {
    ViewContainerService.registerViewContainer(PLUGIN_A, { id: "read-out", title: "输出", location: "panel" });
    ViewContainerService.registerView(PLUGIN_A, "read-out", { id: "out-log", title: "输出日志", render: dummy });

    ViewContainerService.setVisible("read-out", "out-log", false);
    const r = (await executeCommandStrict("workbench.action.listViews")) as {
      containers: Array<{ id: string; views: Array<Record<string, unknown>> }>;
    };
    expect(r.containers.find((x) => x.id === "read-out")?.views[0].visible).toBe(false);
  });

  it("负控级边界：异插件**同名视图**共存 ⇒ 各归各的插件（配对反查，⛔ 不按裸 id join）", async () => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    ViewContainerService.registerViewContainer(PLUGIN_A, { id: "read-shared", title: "共享", location: "sidebar" });
    ViewContainerService.registerView(PLUGIN_A, "read-shared", { id: "panel", title: "A 的面板", render: dummy });
    ViewContainerService.registerView(PLUGIN_B, "read-shared", { id: "panel", title: "B 的面板", render: dummy });

    const r = (await executeCommandStrict("workbench.action.listViews")) as {
      containers: Array<{ id: string; views: Array<Record<string, unknown>> }>;
    };
    const views = r.containers.find((x) => x.id === "read-shared")?.views ?? [];
    expect(views).toHaveLength(2);
    expect(views.map((v) => [v.pluginId, v.title])).toEqual([
      [PLUGIN_A, "A 的面板"],
      [PLUGIN_B, "B 的面板"],
    ]);
    errSpy.mockRestore();
  });

  it("空容器也如实列出（views:[]——「注册了但没视图」与「没这个容器」不是一回事）", async () => {
    ViewContainerService.registerViewContainer(PLUGIN_A, { id: "read-empty", title: "空", location: "sidebar" });
    const r = (await executeCommandStrict("workbench.action.listViews")) as {
      containers: Array<{ id: string; views: unknown[] }>;
    };
    expect(r.containers.find((x) => x.id === "read-empty")?.views).toEqual([]);
  });
});

describe("readCommands——四条命令都只挂门牌（零新通道）", () => {
  beforeEach(baseSetup);

  it("执行不 emit shellEvents（读数命令不引入任何副作用通道）", async () => {
    const off = layoutSnapshot.register(() => ({
      sidebarVisible: false,
      panelVisible: false,
      panelActiveViewId: null,
      sidebarView: null,
    }));
    const emitSpy = vi.spyOn(shellEvents, "emit");
    await executeCommandStrict("workbench.action.getConfiguration", undefined, "readtest.theme");
    await executeCommandStrict("workbench.action.listConfigurations");
    await executeCommandStrict("workbench.action.getLayout");
    await executeCommandStrict("workbench.action.listViews");
    expect(emitSpy).not.toHaveBeenCalled();
    emitSpy.mockRestore();
    off();
  });
});
