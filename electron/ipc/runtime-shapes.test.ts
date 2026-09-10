/**
 * runtime-shapes.ts 运行期契约校验测试——E5.8#22.5。
 *
 * 被测产物：contracts/runtime-shapes.ts（自动生成，validateWire 查表）。
 * 设计验收 §7：
 *   1. 正确载荷 → 返回空数组（形状通过）；
 *   2. 垃圾输入（null/undefined/错型/嵌套损坏）→ never-throw，返回错误串；
 *   3. 错配 → 错误串含字段路径（channel + 期望/实收）；
 *   4. 未注册通道 → null（无断言，安全降级）。
 */
import { describe, it, expect } from "vitest";
import { validateWire } from "../../contracts/runtime-shapes";

/** 合法 PoolLayout——最小字段集（titleBar/iconBar/sidebar/groups/statusBar 必有） */
const validPoolLayout = {
  version: 2 as const,
  titleBar: {
    title: "LinkDesk",
    logoUrl: "linkdesk://assets/logo.png",
    menuBarVisible: true,
    menuGroups: [{ group: "file", label: "文件", items: [{ label: "新建", command: "file.new" }] }],
    slots: { left: [], right: [] },
    windowControls: { minimize: "最小化", maximize: "最大化", restore: "还原", close: "关闭", pin: "置顶", unpin: "取消置顶" },
  },
  iconBar: {
    icons: [{ pluginId: "terminal", icon: { kind: "lucide", name: "terminal" }, label: "终端", location: "top" as const }],
    hamburgerVisible: true,
    navLabel: "导航",
    hamburger: { title: "菜单", groups: [] },
  },
  sidebar: {
    visible: true,
    width: 260,
    containerId: "file-explorer",
    containerTitle: "资源管理器",
    views: [{ id: "folders", title: "资源管理器", pluginId: "file-tree", renderPath: "file-tree" }],
  },
  groups: [{ id: "g1", flex: 1, activeTabId: "t1", tabs: [{ id: "t1", pluginId: "terminal", title: "终端" }] }],
  statusBar: {
    items: [],
    notif: { unread: 0, bellTitle: "通知", panelTitle: "通知中心", clearLabel: "清除", emptyLabel: "暂无通知", dismissTitle: "关闭", groups: [] },
  },
};

describe("validateWire——正确载荷返回空数组", () => {
  it("config:changed 正确", () => {
    expect(validateWire("config:changed", { key: "editor.fontSize", value: 14 })).toEqual([]);
  });
  it("theme:changed 正确", () => {
    expect(validateWire("theme:changed", { themeType: "dark", variables: { "--bg": "#000" } })).toEqual([]);
  });
  it("accent:changed 正确", () => {
    expect(validateWire("accent:changed", { variables: { "--accent": "#0af" } })).toEqual([]);
  });
  it("plugin-state:changed 正确", () => {
    expect(validateWire("plugin-state:changed", { pluginId: "serial", key: "connected", value: true })).toEqual([]);
  });
  it("tab:activated 正确（含可选 filePath 缺省）", () => {
    expect(validateWire("tab:activated", { tabId: "t1", pluginId: "terminal" })).toEqual([]);
  });
  it("workspace:activeChanged 正确", () => {
    expect(validateWire("workspace:activeChanged", { uri: "file:///a.ts" })).toEqual([]);
  });
  it("settings:requestGroup 正确", () => {
    expect(validateWire("settings:requestGroup", { pluginId: "terminal" })).toEqual([]);
  });
  it("settings:scrollTo 正确", () => {
    expect(validateWire("settings:scrollTo", { key: "appearance" })).toEqual([]);
  });
  it("serial:stats 正确（portName 必填 + tx/rx 可选缺省）", () => {
    expect(validateWire("serial:stats", { portName: "COM3", tx: 10, rx: 20 })).toEqual([]);
    expect(validateWire("serial:stats", { portName: "COM3" })).toEqual([]);
  });
  it("serial:data 正确（E5.8#28 载荷对象化——portName + text）", () => {
    expect(validateWire("serial:data", { portName: "COM3", text: "S500" })).toEqual([]);
  });
  it("serial:system 正确（E5.8#28 载荷对象化 + #30.11 type 分类——status/error）", () => {
    expect(validateWire("serial:system", { portName: "COM3", message: "---- 已打开串行端口 COM3 ----", type: "status" })).toEqual([]);
    expect(validateWire("serial:system", { portName: "COM3", message: "串口已被打开", type: "error" })).toEqual([]);
  });
  it("serial:system 缺 type 报错（E5.8#30.11——分类标签契约必填）", () => {
    expect(validateWire("serial:system", { portName: "COM3", message: "串口已打开" })).not.toEqual([]);
  });
  it("pool:quickpick 正确", () => {
    expect(validateWire("pool:quickpick", { open: true, placeholder: "选择", items: [{ key: "0", searchText: "a", label: "A" }] })).toEqual([]);
  });
  it("pool:dialog 正确（open:true + alert 分支）", () => {
    expect(validateWire("pool:dialog", { open: true, title: "确认", message: "确定？", isAlert: false })).toEqual([]);
  });
  it("pool:dialog 正确（open:false 分支）", () => {
    expect(validateWire("pool:dialog", { open: false })).toEqual([]);
  });
  it("pool:layout 正确（完整布局快照）", () => {
    expect(validateWire("pool:layout", validPoolLayout)).toEqual([]);
  });
});

describe("validateWire——错配返回字段路径", () => {
  it("theme:changed 缺 variables", () => {
    const errs = validateWire("theme:changed", { themeType: "dark" });
    expect(errs).toBeTruthy();
    expect(errs!.join("\n")).toContain("payload.variables");
  });
  it("config:changed key 错型", () => {
    const errs = validateWire("config:changed", { key: 42, value: 1 });
    expect(errs!.join("\n")).toContain('payload.key');
  });
  it("tab:activated pluginId 错型", () => {
    const errs = validateWire("tab:activated", { tabId: "t1", pluginId: 3 });
    expect(errs!.join("\n")).toContain('payload.pluginId');
  });
  it("pool:dialog 收到 open:true 缺 message", () => {
    const errs = validateWire("pool:dialog", { open: true, title: "t", message: "m", isAlert: false });
    // 正确——上面是合法载荷；改造缺 message
    const errs2 = validateWire("pool:dialog", { open: true, title: "t", isAlert: false });
    expect(errs2).toBeTruthy();
    expect(errs2!.join("\n")).toContain("payload.message");
    expect(errs).toEqual([]);
  });
  it("pool:layout 收到 version 漂移（3 ≠ 2）", () => {
    const errs = validateWire("pool:layout", { ...validPoolLayout, version: 3 });
    expect(errs!.join("\n")).toContain("payload.version");
  });
  it("serial:stats rx 错型", () => {
    const errs = validateWire("serial:stats", { rx: "二十" });
    expect(errs!.join("\n")).toContain('payload.rx');
  });
});

describe("validateWire——垃圾输入 never-throw（生产不崩）", () => {
  const channels = [
    "config:changed", "theme:changed", "accent:changed", "plugin-state:changed",
    "tab:activated", "workspace:activeChanged", "settings:requestGroup", "settings:scrollTo",
    "serial:stats", "pool:layout", "pool:quickpick", "pool:dialog",
  ];
  const garbage = [null, undefined, 42, "str", true, [], [1, 2], { a: 1 }, { x: () => 1 }, NaN, Symbol("s")];

  it("全注册通道 × 全垃圾输入 → 返回错误串而非抛异常", () => {
    for (const ch of channels) {
      for (const g of garbage) {
        expect(() => validateWire(ch, g), `channel=${ch} garbage=${String(g)}`).not.toThrow();
        const r = validateWire(ch, g);
        expect(r).not.toBeNull(); // 已注册通道必有断言结果（错误串或空）
        expect(Array.isArray(r)).toBe(true);
      }
    }
  });

  it("嵌套损坏（数组元素错型）→ 报元素路径不抛异常", () => {
    expect(() => validateWire("pool:quickpick", { open: true, placeholder: "p", items: [{ key: 0 }] })).not.toThrow();
    const errs = validateWire("pool:quickpick", { open: true, placeholder: "p", items: [{ key: 0 }] });
    expect(errs!.join("\n")).toContain("payload.items[0].key");
  });
});

describe("validateWire——未注册通道返回 null（安全降级）", () => {
  it("未知通道 null", () => {
    expect(validateWire("no-such:channel", { any: true })).toBeNull();
  });
});
