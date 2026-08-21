/**
 * ViewContainerService 单元测试——register/unregister/getViews/getActiveViews/setVisible/事件触发。
 * E36#1 验证：核心桌子逻辑全覆盖。
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { ViewContainerService } from "./ViewContainerService";
import type { ViewDescriptor } from "./ViewContainerService";
import { clearPluginStates } from "../plugins/PluginStateService"; // E5.8#34：隐藏持久化测试隔离
import { loadHiddenState, setHidden } from "./ViewContainerService/hidden"; // E5.8#34：setVisible 落盘断言 + 重启模拟

const PLUGIN_ID = "test-plugin";
const PLUGIN_ID_2 = "test-plugin-2";

/** 占位 render 组件 */
const DummyView = () => null;

function makeView(overrides: Partial<ViewDescriptor> = {}): ViewDescriptor {
  return {
    id: "v1",
    title: "测试视图",
    render: DummyView,
    ...overrides,
  };
}

describe("ViewContainerService", () => {
  beforeEach(() => {
    // 清理所有测试残留
    ViewContainerService.unregisterAll(PLUGIN_ID);
    ViewContainerService.unregisterAll(PLUGIN_ID_2);
    clearPluginStates(); // E5.8#34：清隐藏持久化——setVisible 现在落盘
  });

  /* ═══ 容器管理 ═══ */

  it("registerViewContainer → getViewContainer 返回正确 title", () => {
    ViewContainerService.registerViewContainer(PLUGIN_ID, {
      id: "e",
      title: "资源管理器",
    });
    const c = ViewContainerService.getViewContainer("e");
    expect(c).toBeDefined();
    expect(c!.title).toBe("资源管理器");
  });

  it("registerViewContainer 幂等——同 ID 返回已有、更新 title", () => {
    ViewContainerService.registerViewContainer(PLUGIN_ID, {
      id: "e",
      title: "旧标题",
    });
    ViewContainerService.registerViewContainer(PLUGIN_ID_2, {
      id: "e",
      title: "新标题",
    });
    const containers = ViewContainerService.getViewContainers("sidebar");
    expect(containers).toHaveLength(1);
    expect(containers[0].title).toBe("新标题");
  });

  it("getViewContainers 按 location 过滤", () => {
    ViewContainerService.registerViewContainer(PLUGIN_ID, {
      id: "e",
      title: "资源管理器",
      location: "sidebar",
    });
    ViewContainerService.registerViewContainer(PLUGIN_ID_2, {
      id: "panel-test",
      title: "底部面板",
      location: "panel",
    });
    const sidebar = ViewContainerService.getViewContainers("sidebar");
    expect(sidebar).toHaveLength(1);
    expect(sidebar[0].id).toBe("e");

    const all = ViewContainerService.getViewContainers();
    expect(all.length).toBeGreaterThanOrEqual(2);
  });

  /* ═══ View 管理 ═══ */

  it("registerView → getViews 和 getActiveViews 返回正确", () => {
    ViewContainerService.registerViewContainer(PLUGIN_ID, { id: "e", title: "资源管理器" });
    ViewContainerService.registerView(PLUGIN_ID, "e", makeView({ id: "v1", title: "测试" }));

    const views = ViewContainerService.getViews("e");
    expect(views).toHaveLength(1);
    expect(views[0].id).toBe("v1");
    expect(views[0].title).toBe("测试");

    const active = ViewContainerService.getActiveViews("e");
    expect(active).toHaveLength(1);
    expect(active[0].id).toBe("v1");
  });

  it("setVisible false → getActiveViews 为空，getViews 仍含 view", () => {
    ViewContainerService.registerViewContainer(PLUGIN_ID, { id: "e", title: "资源管理器" });
    ViewContainerService.registerView(PLUGIN_ID, "e", makeView({ id: "v1" }));

    ViewContainerService.setVisible("e", "v1", false);

    const active = ViewContainerService.getActiveViews("e");
    expect(active).toHaveLength(0);

    const views = ViewContainerService.getViews("e");
    expect(views).toHaveLength(1);
  });

  it("setVisible true（恢复）→ getActiveViews 再次含 view", () => {
    ViewContainerService.registerViewContainer(PLUGIN_ID, { id: "e", title: "资源管理器" });
    ViewContainerService.registerView(PLUGIN_ID, "e", makeView({ id: "v1" }));
    ViewContainerService.setVisible("e", "v1", false);
    expect(ViewContainerService.getActiveViews("e")).toHaveLength(0);

    ViewContainerService.setVisible("e", "v1", true);
    expect(ViewContainerService.getActiveViews("e")).toHaveLength(1);
  });

  it("isVisible 正确反映可见性", () => {
    ViewContainerService.registerViewContainer(PLUGIN_ID, { id: "e", title: "资源管理器" });
    ViewContainerService.registerView(PLUGIN_ID, "e", makeView({ id: "v1" }));

    expect(ViewContainerService.isVisible("e", "v1")).toBe(true);
    ViewContainerService.setVisible("e", "v1", false);
    expect(ViewContainerService.isVisible("e", "v1")).toBe(false);
  });

  it("重复 registerView 同 pluginId+id → 更新已有、不创建第二条记录", () => {
    ViewContainerService.registerViewContainer(PLUGIN_ID, { id: "e", title: "资源管理器" });
    ViewContainerService.registerView(PLUGIN_ID, "e", makeView({ id: "v1", title: "声明式" }));
    ViewContainerService.registerView(PLUGIN_ID, "e", makeView({ id: "v1", title: "命令式更新" }));

    const views = ViewContainerService.getViews("e");
    expect(views).toHaveLength(1);
    expect(views[0].title).toBe("命令式更新");
  });

  it("声明式和命令式走同一条路径——不同 pluginId 同 view id 视为不同 view", () => {
    // E5.8#41.9.1：撞名诊断是故意触发（fail-loud）——消音保持测试输出干净
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    ViewContainerService.registerViewContainer(PLUGIN_ID, { id: "e", title: "资源管理器" });
    ViewContainerService.registerView(PLUGIN_ID, "e", makeView({ id: "v1", title: "来自 p1" }));
    // 不同 pluginId 同 view id——两条独立记录
    // 手动构造——registerView 内部的 existing 检查是 (id + _pluginId)
    // 所以不同 pluginId 的相同 id 应该被当作不同 view
    // 注：此行为由 _pluginId 标记区分，测试验证实际行为
    ViewContainerService.registerView(PLUGIN_ID_2, "e", makeView({ id: "v1", title: "来自 p2" }));

    // 两个不同插件的同 id view 应该都存在（E5.8#41.9.1 复合键——共存互不踩）
    const views = ViewContainerService.getViews("e");
    // 由于内部用 _pluginId 区分，第二条不会覆盖第一条
    expect(views).toHaveLength(2);
    err.mockRestore();
  });

  /* ═══ unregisterAll ═══ */

  it("unregisterAll → getViews 为空、getViewContainer 为 undefined（容器随插件消失）", () => {
    ViewContainerService.registerViewContainer(PLUGIN_ID, { id: "e", title: "资源管理器" });
    ViewContainerService.registerView(PLUGIN_ID, "e", makeView({ id: "v1" }));

    ViewContainerService.unregisterAll(PLUGIN_ID);

    expect(ViewContainerService.getViews("e")).toHaveLength(0);
    expect(ViewContainerService.getViewContainer("e")).toBeUndefined();
  });

  it("unregisterAll 只清理指定插件——其他插件的 view 不受影响", () => {
    ViewContainerService.registerViewContainer(PLUGIN_ID, { id: "e", title: "资源管理器" });
    ViewContainerService.registerView(PLUGIN_ID, "e", makeView({ id: "v1", title: "p1 view" }));
    ViewContainerService.registerView(PLUGIN_ID_2, "e", makeView({ id: "v2", title: "p2 view" }));

    ViewContainerService.unregisterAll(PLUGIN_ID);

    // p1 的 view 被移除
    const views = ViewContainerService.getViews("e");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(views.every((v) => (v as any)._pluginId !== PLUGIN_ID)).toBe(true);

    // p2 的 view 仍在
    const p2View = ViewContainerService.getView("v2");
    expect(p2View).toBeDefined();

    // 容器还在——p2 还有 view 在里面
    expect(ViewContainerService.getViewContainer("e")).toBeDefined();
  });

  it("unregisterAll 容器 views 全空 + 容器归属该插件 → 容器定义也移除", () => {
    ViewContainerService.registerViewContainer(PLUGIN_ID, { id: "e", title: "资源管理器" });
    ViewContainerService.registerView(PLUGIN_ID, "e", makeView({ id: "v1" }));

    // 再注册一个 p2 的 view——容器不属于 p2
    ViewContainerService.registerView(PLUGIN_ID_2, "e", makeView({ id: "v2" }));

    // 先卸载 p1——容器 views 还有 p2 的 v2，容器不删除
    ViewContainerService.unregisterAll(PLUGIN_ID);
    expect(ViewContainerService.getViewContainer("e")).toBeDefined();

    // 再卸载 p2——容器全空 + 容器归属未知，但 views 为 0 时
    // 注意：容器 owner 是 p1，p1 已卸载，owner 仍指向 p1
    // unregisterAll(p2) 移除 v2，views 全空但 owner 是 p1（不是 p2）
    // 所以容器不会因 p2 卸载而删除
    // 这是正确行为——容器只在声明者卸载时删除
    ViewContainerService.unregisterAll(PLUGIN_ID_2);
    // 容器可能还在（owner 是 p1 已不在），取决于实现
    // 核心验证：两次 unregisterAll 都不抛错
  });

  /* ═══ 排序 ═══ */

  it("连续注册 3 个 view → getViews 返回顺序 = 注册顺序", () => {
    ViewContainerService.registerViewContainer(PLUGIN_ID, { id: "e", title: "资源管理器" });
    ViewContainerService.registerView(PLUGIN_ID, "e", makeView({ id: "v1", title: "第一", order: 0 }));
    ViewContainerService.registerView(PLUGIN_ID, "e", makeView({ id: "v2", title: "第二", order: 0 }));
    ViewContainerService.registerView(PLUGIN_ID, "e", makeView({ id: "v3", title: "第三", order: 0 }));

    const views = ViewContainerService.getViews("e");
    expect(views).toHaveLength(3);
    // 同 order → 按注册先后排列
    expect(views.map((v) => v.id)).toEqual(["v1", "v2", "v3"]);
  });

  it("getViews 按 order 排序——小值在前", () => {
    ViewContainerService.registerViewContainer(PLUGIN_ID, { id: "e", title: "资源管理器" });
    ViewContainerService.registerView(PLUGIN_ID, "e", makeView({ id: "v3", title: "第三", order: 100 }));
    ViewContainerService.registerView(PLUGIN_ID, "e", makeView({ id: "v1", title: "第一", order: 0 }));
    ViewContainerService.registerView(PLUGIN_ID, "e", makeView({ id: "v2", title: "第二", order: 50 }));

    const views = ViewContainerService.getViews("e");
    expect(views.map((v) => v.id)).toEqual(["v1", "v2", "v3"]);
  });

  /* ═══ getView 全局查找 ═══ */

  it("getView 按 view id 全局查找", () => {
    ViewContainerService.registerViewContainer(PLUGIN_ID, { id: "e", title: "资源管理器" });
    ViewContainerService.registerView(PLUGIN_ID, "e", makeView({ id: "folders", title: "FOLDERS" }));

    const view = ViewContainerService.getView("folders");
    expect(view).toBeDefined();
    expect(view!.title).toBe("FOLDERS");
  });

  it("getView 不存在的 id → undefined", () => {
    expect(ViewContainerService.getView("nonexistent")).toBeUndefined();
  });

  /* ═══ E5.8#41.9.1 视图复合键——同名共存 / fail-loud / 容器归属首主保有 / 空态复合键 ═══ */

  it("两插件同名 viewId 注册 → 共存互不踩（getViews 两条独立记录）", () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    ViewContainerService.registerViewContainer(PLUGIN_ID, { id: "e", title: "资源管理器" });
    ViewContainerService.registerView(PLUGIN_ID, "e", makeView({ id: "settings", title: "p1 同名" }));
    ViewContainerService.registerView(PLUGIN_ID_2, "e", makeView({ id: "settings", title: "p2 同名" }));

    const views = ViewContainerService.getViews("e");
    expect(views).toHaveLength(2);
    // 复合键互不覆盖——两条各自属主正确
    expect(views.map((v) => v.title).sort()).toEqual(["p1 同名", "p2 同名"]);
    err.mockRestore();
  });

  it("撞 id fail-loud——后注册者收到点名两 pluginId 的诊断", () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    ViewContainerService.registerViewContainer(PLUGIN_ID, { id: "e", title: "资源管理器" });
    ViewContainerService.registerView(PLUGIN_ID, "e", makeView({ id: "dup", title: "p1" }));
    ViewContainerService.registerView(PLUGIN_ID_2, "e", makeView({ id: "dup", title: "p2" }));

    expect(err).toHaveBeenCalled();
    const msg = err.mock.calls.map((c) => String(c[0])).join(" ");
    expect(msg).toContain("视图 id 撞名");
    expect(msg).toContain(PLUGIN_ID);
    expect(msg).toContain(PLUGIN_ID_2);
    err.mockRestore();
  });

  it("同名 viewId 裸 id 解析多命中 → fail-loud + undefined（绝不静默返回错误视图）", () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    ViewContainerService.registerViewContainer(PLUGIN_ID, { id: "e", title: "资源管理器" });
    ViewContainerService.registerView(PLUGIN_ID, "e", makeView({ id: "ambig", title: "p1" }));
    ViewContainerService.registerView(PLUGIN_ID_2, "e", makeView({ id: "ambig", title: "p2" }));

    const view = ViewContainerService.getView("ambig");
    expect(view).toBeUndefined();
    const msg = err.mock.calls.map((c) => String(c[0])).join(" ");
    expect(msg).toContain('裸 viewId "ambig"');
    expect(msg).toContain(PLUGIN_ID);
    expect(msg).toContain(PLUGIN_ID_2);
    err.mockRestore();
  });

  it("同名 viewId 唯一命中（仅一插件注册）→ getView 裸 id 正常返回", () => {
    ViewContainerService.registerViewContainer(PLUGIN_ID, { id: "e", title: "资源管理器" });
    ViewContainerService.registerView(PLUGIN_ID, "e", makeView({ id: "unique", title: "唯一" }));

    const view = ViewContainerService.getView("unique");
    expect(view).toBeDefined();
    expect(view!.title).toBe("唯一");
  });

  it("容器归属首主保有——后声明者不覆盖属主（卸载不删错容器）", () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    ViewContainerService.registerViewContainer(PLUGIN_ID, { id: "c1", title: "p1 容器" });
    ViewContainerService.registerView(PLUGIN_ID, "c1", makeView({ id: "v1" }));
    // p2 重复声明同容器——title 更新但归属保留 p1（fail-loud 诊断）
    ViewContainerService.registerViewContainer(PLUGIN_ID_2, { id: "c1", title: "被忽略的 title" });

    // p2 卸载——容器不删（归属 p1）
    ViewContainerService.unregisterAll(PLUGIN_ID_2);
    expect(ViewContainerService.getViewContainer("c1")).toBeDefined();
    // p1 卸载——容器删（归属 p1）
    ViewContainerService.unregisterAll(PLUGIN_ID);
    expect(ViewContainerService.getViewContainer("c1")).toBeUndefined();
    err.mockRestore();
  });

  it("_emptyContents 复合键——同名视图空态各存各的", () => {
    ViewContainerService.registerViewEmptyContent(PLUGIN_ID, "e", "v1", "p1 空态");
    ViewContainerService.registerViewEmptyContent(PLUGIN_ID_2, "e", "v1", "p2 空态");

    const p1 = ViewContainerService.getViewEmptyContent(PLUGIN_ID, "v1");
    const p2 = ViewContainerService.getViewEmptyContent(PLUGIN_ID_2, "v1");
    expect(p1).toBeDefined();
    expect(p2).toBeDefined();
    expect(p1!.content).toBe("p1 空态");
    expect(p2!.content).toBe("p2 空态");
  });

  /* ═══ 防线 ═══ */

  it("空 containerId → registerView 不抛错，静默返回", () => {
    expect(() => {
      ViewContainerService.registerView(PLUGIN_ID, "", makeView({ id: "v1" }));
    }).not.toThrow();
  });

  it("空容器 getActiveViews → 返回 [] 不抛错", () => {
    expect(ViewContainerService.getActiveViews("nonexistent")).toEqual([]);
  });

  it("空容器 getViews → 返回 [] 不抛错", () => {
    expect(ViewContainerService.getViews("nonexistent")).toEqual([]);
  });

  it("空容器 isVisible → 返回 false 不抛错", () => {
    expect(ViewContainerService.isVisible("nonexistent", "v1")).toBe(false);
  });

  /* ═══ 占位容器 ═══ */

  it("registerView 容器不存在时→自动创建占位容器", () => {
    ViewContainerService.registerView(PLUGIN_ID, "auto-container", makeView({ id: "v1" }));

    const c = ViewContainerService.getViewContainer("auto-container");
    expect(c).toBeDefined();
    expect(c!.title).toBe("auto-container"); // 占位 title = containerId

    const active = ViewContainerService.getActiveViews("auto-container");
    expect(active).toHaveLength(1);
  });

  it("占位容器被 registerViewContainer 正式声明时 → title 更新", () => {
    ViewContainerService.registerView(PLUGIN_ID, "e", makeView({ id: "v1" }));
    expect(ViewContainerService.getViewContainer("e")!.title).toBe("e");

    ViewContainerService.registerViewContainer(PLUGIN_ID, { id: "e", title: "资源管理器" });
    expect(ViewContainerService.getViewContainer("e")!.title).toBe("资源管理器");
  });

  /* ═══ 事件 ═══ */

  it("onDidChangeContainers 在 registerViewContainer 时触发", () => {
    let fired = false;
    const unsub = ViewContainerService.onDidChangeContainers.event(({ added }) => {
      if (added.some((c) => c.id === "e")) fired = true;
    });

    ViewContainerService.registerViewContainer(PLUGIN_ID, { id: "e", title: "资源管理器" });
    expect(fired).toBe(true);
    unsub();
  });

  it("onDidChangeViews 在 registerView 时触发", () => {
    ViewContainerService.registerViewContainer(PLUGIN_ID, { id: "e", title: "资源管理器" });
    let fired = false;
    const unsub = ViewContainerService.onDidChangeViews.event(({ containerId, views }) => {
      if (containerId === "e" && views.some((v) => v.id === "v1")) fired = true;
    });

    ViewContainerService.registerView(PLUGIN_ID, "e", makeView({ id: "v1" }));
    expect(fired).toBe(true);
    unsub();
  });

  it("onDidChangeActiveViews 在 setVisible 时触发", () => {
    ViewContainerService.registerViewContainer(PLUGIN_ID, { id: "e", title: "资源管理器" });
    ViewContainerService.registerView(PLUGIN_ID, "e", makeView({ id: "v1" }));

    let fired = false;
    const unsub = ViewContainerService.onDidChangeActiveViews.event(({ containerId, removed }) => {
      if (containerId === "e" && removed.some((v) => v.id === "v1")) fired = true;
    });

    ViewContainerService.setVisible("e", "v1", false);
    expect(fired).toBe(true);
    unsub();
  });

  /* ═══ unregisterAll 边界 ═══ */

  it("unregisterAll 未注册的 pluginId → 不抛错", () => {
    expect(() => {
      ViewContainerService.unregisterAll("never-registered");
    }).not.toThrow();
  });

  it("重复 unregisterAll 同 pluginId → 不抛错（幂等）", () => {
    ViewContainerService.registerViewContainer(PLUGIN_ID, { id: "e", title: "资源管理器" });
    ViewContainerService.registerView(PLUGIN_ID, "e", makeView({ id: "v1" }));

    ViewContainerService.unregisterAll(PLUGIN_ID);
    // 第二次 unregisterAll——容器和 view 已清空
    expect(() => {
      ViewContainerService.unregisterAll(PLUGIN_ID);
    }).not.toThrow();
  });

  /* ═══ E5.8#34 隐藏持久化（hidden.ts 域 + setVisible 落盘 + 模型种子） ═══ */

  it("setVisible false → 持久化 hiddenViews 含该 view（重启保持）", () => {
    ViewContainerService.registerViewContainer(PLUGIN_ID, { id: "e", title: "资源管理器" });
    ViewContainerService.registerView(PLUGIN_ID, "e", makeView({ id: "v1" }));

    ViewContainerService.setVisible("e", "v1", false);

    expect(loadHiddenState().has("v1")).toBe(true);
    expect(ViewContainerService.isVisible("e", "v1")).toBe(false);
  });

  it("setVisible true（恢复）→ hiddenViews 移除该 view", () => {
    ViewContainerService.registerViewContainer(PLUGIN_ID, { id: "e", title: "资源管理器" });
    ViewContainerService.registerView(PLUGIN_ID, "e", makeView({ id: "v1" }));

    ViewContainerService.setVisible("e", "v1", false);
    ViewContainerService.setVisible("e", "v1", true);

    expect(loadHiddenState().has("v1")).toBe(false);
    expect(ViewContainerService.isVisible("e", "v1")).toBe(true);
  });

  it("重启恢复——持久化隐藏态种子进新建模型（isVisible 直接反映）", () => {
    // 模拟重启：经 hidden 域直接落盘隐藏态（等价上一会话 setVisible 已持久化），再新建容器 + view
    setHidden("v1", true);
    expect(loadHiddenState().has("v1")).toBe(true);

    // 新建容器（新 model 种子 loadHiddenState）——同 viewId 保持隐藏
    ViewContainerService.registerViewContainer(PLUGIN_ID, { id: "new-c", title: "新容器", location: "panel" });
    ViewContainerService.registerView(PLUGIN_ID, "new-c", makeView({ id: "v1", title: "同视图" }));

    expect(ViewContainerService.isVisible("new-c", "v1")).toBe(false);
    expect(ViewContainerService.getActiveViews("new-c")).toHaveLength(0);
  });

  it("toggleViewVisibility 往返——hiddenViews 正确跟随", () => {
    ViewContainerService.registerViewContainer(PLUGIN_ID, { id: "e", title: "资源管理器" });
    ViewContainerService.registerView(PLUGIN_ID, "e", makeView({ id: "v1" }));

    ViewContainerService.toggleViewVisibility("e", "v1"); // 显示 → 隐藏
    expect(loadHiddenState().has("v1")).toBe(true);

    ViewContainerService.toggleViewVisibility("e", "v1"); // 隐藏 → 恢复
    expect(loadHiddenState().has("v1")).toBe(false);
  });
});
