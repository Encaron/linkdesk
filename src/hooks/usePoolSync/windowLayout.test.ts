/**
 * 按窗口组装 PoolLayout 纯函数测试——E5.8#43-2。
 *
 * 覆盖：窗口模式策略表 zones/tabBarCreate/titleBarMenu 声明驱动（main 全 zone + [+] 提供 +
 * 标题栏菜单随全局配置；detached 只 titleBar+groups 子集 + [+] 抑制 + 纯工作区无菜单栏
 * ——E5.8#46.15 拍板 7）、窗口标题随活动 tab（windowTitleFor）。
 * 纯函数零 React——fixture 直接构造 TabState/WindowShellState/WindowLayoutContext。
 * 测试插件 ID 一律虚构（demo-plugin）——viewRegistry 未注册 → getViewPlugin undefined
 * → resolvePoolTabTitle 走原样分支，断言与注册表状态解耦（硬约束 10/21 精神）。
 */

import { describe, it, expect } from "vitest";
import type { TFunction } from "i18next";
import type { TabState } from "../useTabManager/types";
import type { WindowShellState } from "../../App/windows";
import {
  assembleWindowLayout,
  windowTitleFor,
  serializeGroups,
  type WindowLayoutContext,
} from "./windowLayout";

/** 身份 t——壳 i18n key = 中文原文，纯函数测试不需要真字典 */
const t = ((key: string) => key) as unknown as TFunction;

function makeTabState(): TabState {
  const gid = "g1";
  return {
    groups: [
      {
        id: gid,
        activeTabId: "t1",
        tabs: [
          { id: "t1", type: "demo-plugin", pluginId: "demo-plugin", label: "Demo View", dirty: false },
        ],
      },
    ],
    activeGroupId: gid,
    root: { type: "leaf", groupId: gid },
  };
}

function makeWindow(overrides?: Partial<WindowShellState>): WindowShellState {
  return { windowId: "main", mode: "main", ready: true, tabState: makeTabState(), ...overrides };
}

function makeCtx(): WindowLayoutContext {
  return {
    titleBarBase: {
      logoUrl: "assets/logo.svg",
      menuBarVisible: true,
      // 非空菜单组——#46.15 测「脱出窗菜单栏抑制」需要全局有可抑制的菜单数据（虚构值，硬约束 21）
      menuGroups: [{ group: "demo-menu", label: "Demo Menu", items: [{ label: "Demo Item", command: "" }] }],
      slots: { left: [], right: [] },
      windowControls: { minimize: "最小化", maximize: "最大化", restore: "还原", close: "关闭", pin: "置顶", unpin: "取消置顶" },
    },
    iconBar: { icons: [], hamburgerVisible: false, navLabel: "nav" },
    sidebar: { visible: false, width: 0, containerId: null, containerTitle: "", views: [] },
    rightSidebar: { visible: false, width: 300, containerId: null, containerTitle: "", views: [] },
    panel: { visible: true, height: 220, activeViewId: "", views: [] },
    statusBar: { items: [], notif: { unread: 0, bellTitle: "", panelTitle: "", clearLabel: "", emptyLabel: "", dismissTitle: "", groups: [] } },
    creatableViews: [{ pluginId: "demo-plugin", label: "Demo View" }],
    // E5.8#45：面板已脱出（存在 drift 窗）→ true；测试各场景显式覆盖
    panelDetached: false,
    t,
  };
}

describe("assembleWindowLayout 按窗口模式策略组装", () => {
  it("main 推全 zone——图标栏/侧栏/右栏/面板/状态栏全含，[+] 提供创建菜单", () => {
    const layout = assembleWindowLayout(makeWindow(), makeCtx());
    expect(layout.iconBar).toBeDefined();
    expect(layout.sidebar).toBeDefined();
    expect(layout.rightSidebar).toBeDefined();
    expect(layout.panel).toBeDefined();
    expect(layout.statusBar).toBeDefined();
    expect(layout.creatableViews).toHaveLength(1);
  });

  it("detached 只推 titleBar+groups 子集——图标栏/侧栏/右栏/面板/状态栏全缺省，[+] 抑制", () => {
    const layout = assembleWindowLayout(makeWindow({ windowId: "w2", mode: "detached" }), makeCtx());
    expect(layout.titleBar).toBeDefined();
    expect(layout.groups).toHaveLength(1);
    expect(layout.iconBar).toBeUndefined();
    expect(layout.sidebar).toBeUndefined();
    expect(layout.rightSidebar).toBeUndefined();
    expect(layout.panel).toBeUndefined();
    expect(layout.statusBar).toBeUndefined();
    expect(layout.creatableViews).toEqual([]);
  });

  it("标题栏菜单按模式策略（E5.8#46.15 拍板 7）——main 随全局配置；detached/drift 恒抑制", () => {
    // main 默认（titlebar 菜单样式）：menuBarVisible=true + 菜单组照推
    const mainLayout = assembleWindowLayout(makeWindow(), makeCtx());
    expect(mainLayout.titleBar?.menuBarVisible).toBe(true);
    expect(mainLayout.titleBar?.menuGroups).toHaveLength(1);
    // main hamburger 模式（menuBarVisible=false）：随全局配置照推（菜单不渲染但配置保留）
    const hamburgerCtx = makeCtx();
    hamburgerCtx.titleBarBase.menuBarVisible = false;
    const mainHamburger = assembleWindowLayout(makeWindow(), hamburgerCtx);
    expect(mainHamburger.titleBar?.menuBarVisible).toBe(false);
    expect(mainHamburger.titleBar?.menuGroups).toHaveLength(1);
    // detached：纯工作区窗口无菜单栏——menuBarVisible 恒 false + 菜单组不推（拍板 7）
    const detachedLayout = assembleWindowLayout(makeWindow({ windowId: "w2", mode: "detached" }), makeCtx());
    expect(detachedLayout.titleBar?.menuBarVisible).toBe(false);
    expect(detachedLayout.titleBar?.menuGroups).toEqual([]);
    // drift：同（面板专用窗也是纯工作区）
    const driftLayout = assembleWindowLayout(
      makeWindow({
        windowId: "d1",
        mode: "drift",
        tabState: { groups: [], activeGroupId: "", root: { type: "leaf", groupId: "" } },
      }),
      makeCtx(),
    );
    expect(driftLayout.titleBar?.menuBarVisible).toBe(false);
    expect(driftLayout.titleBar?.menuGroups).toEqual([]);
  });

  it("布局携带该窗口自身 tabState——groups/root/activeGroupId 随窗", () => {
    const win = makeWindow({ windowId: "w2", mode: "detached" });
    const layout = assembleWindowLayout(win, makeCtx());
    expect(layout.groups[0].id).toBe("g1");
    expect(layout.groups[0].activeTabId).toBe("t1");
    expect(layout.root).toEqual({ type: "leaf", groupId: "g1" });
    expect(layout.activeGroupId).toBe("g1");
  });

  it("drift 推 titleBar+groups+panel——空 tabState 恒空 groups、面板独占（ctx.panelDetached=false 时仍推）", () => {
    // 漂移面板窗真实构造 = emptyTabState（面板专用窗，主区空占位 I9-13）——fixture 对齐
    const win = makeWindow({
      windowId: "d1",
      mode: "drift",
      tabState: { groups: [], activeGroupId: "", root: { type: "leaf", groupId: "" } },
    });
    const layout = assembleWindowLayout(win, makeCtx());
    expect(layout.titleBar).toBeDefined();
    expect(layout.groups).toEqual([]); // 恒空（主区空占位）
    expect(layout.panel).toBeDefined();
    expect(layout.iconBar).toBeUndefined();
    expect(layout.sidebar).toBeUndefined();
    expect(layout.rightSidebar).toBeUndefined();
    expect(layout.statusBar).toBeUndefined();
    expect(layout.creatableViews).toEqual([]);
  });

  it("面板独占性——存在 drift 窗（ctx.panelDetached=true）时 main 停推 panel、drift 窗仍推", () => {
    const mainWin = makeWindow(); // mode:main
    const driftWin = makeWindow({ windowId: "d1", mode: "drift" });
    const ctx = makeCtx();
    ctx.panelDetached = true;
    expect(assembleWindowLayout(mainWin, ctx).panel).toBeUndefined();
    expect(assembleWindowLayout(driftWin, ctx).panel).toBeDefined();
  });
});

describe("windowTitleFor 窗口标题随活动 tab", () => {
  it("有活动 tab → 返回该 tab 标题（未注册插件走原样分支）", () => {
    expect(windowTitleFor(makeWindow(), t)).toBe("Demo View");
  });

  it("无任何 tab → 兜底应用名 LinkDesk", () => {
    const empty: WindowShellState = {
      windowId: "w2",
      mode: "detached",
      ready: true,
      tabState: { groups: [], activeGroupId: "", root: { type: "leaf", groupId: "" } },
    };
    expect(windowTitleFor(empty, t)).toBe("LinkDesk");
  });
});

describe("serializeGroups 标签页序列化", () => {
  it("未注册插件安全兜底——title 原样、无图标、非壳内部渲染、普通关闭行为", () => {
    const groups = serializeGroups(makeTabState(), t);
    expect(groups).toHaveLength(1);
    const tab = groups[0].tabs[0];
    expect(tab.id).toBe("t1");
    expect(tab.pluginId).toBe("demo-plugin");
    expect(tab.title).toBe("Demo View");
    // resolved=null（未注册插件）→ resolved?.src ?? resolved?.emoji = undefined（可选链在 null 上返回 undefined）
    expect(tab.icon).toBeUndefined();
    expect(tab.shellRendered).toBe(false);
    expect(tab.closeBehavior).toBe("normal");
  });
});
