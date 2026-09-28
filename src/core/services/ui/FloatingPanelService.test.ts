/**
 * FloatingPanelService 测试——E5.8#37 悬浮面板单实例桥 + 语言切换文案重推（2026-08-22 用户点修③）。
 * 覆盖：pushPanel 存 open DTO 底稿 / refreshPanelText 重推 refresh:true + 新标题/动作且不 settle promise /
 * 面板未开 → refreshPanelText no-op 零推送 / closePanel、handleFloatingPanelAction 后底稿失效（重推 no-op）/
 * 单实例语义（I8-10：同 viewId 聚焦复用 pending / 异 viewId 替换 settle 'replaced'）。
 * 渲染器经 registerFloatingPanelRenderer 挂 mock——断言 DTO 形状（显示文本铁律：标题/动作已是壳侧 t() 结果，池原样透传）。
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  registerFloatingPanelRenderer,
  pushPanel,
  closePanel,
  refreshPanelText,
  handleFloatingPanelAction,
  setBounds,
  reportGeometry,
  getLastGeometry,
} from "./FloatingPanelService";
import type { PoolFloatingPanelData } from "../../types/pool/poolFloatingPanel";

const { pushMock } = vi.hoisted(() => ({ pushMock: vi.fn() }));

/** 插件身份 + 显示文本全用明显虚构值（demo-plugin/demo-view + Demo View/Maximize）——测试 fixture 惰性字符串，
 *  服务不加载插件；真实插件名/真实 UI 文案（settings/设置/关闭…）一律不用，避免误导（2026-08-22 用户「没有硬编码」标准）。 */
function sampleOptions() {
  return {
    viewId: "demo-view",
    title: "Demo View",
    pluginId: "demo-plugin",
    renderPath: "/@fs/plugins/demo-plugin/src/views/DemoView.tsx",
    actions: [
      { id: "maximize", label: "Maximize", icon: "maximize", toggledIcon: "restore", toggledLabel: "Restore" },
      { id: "close", label: "Close", icon: "close" },
    ],
  };
}

beforeEach(() => {
  // 模块级单实例态（_currentViewId/_currentOpen/_pending）跨用例残留——closePanel() 归零（顺带推 open:false → 清 mock）
  registerFloatingPanelRenderer((data) => pushMock(data));
  closePanel();
  pushMock.mockClear();
});

function lastPush(): Extract<PoolFloatingPanelData, { open: true }> {
  return pushMock.mock.calls[pushMock.mock.calls.length - 1][0] as Extract<PoolFloatingPanelData, { open: true }>;
}

describe("refreshPanelText（语言切换文案重推）", () => {
  it("面板开着 → 重推 refresh:true + 新标题/动作，身份/几何字段不变，不 settle promise", async () => {
    const reason = pushPanel(sampleOptions());
    pushMock.mockClear(); // 清 pushPanel 的首次推

    refreshPanelText("Démo Vue", [{ id: "close", label: "Fermer", icon: "close" }]);

    const pushed = lastPush();
    expect(pushed.open).toBe(true);
    expect(pushed.viewId).toBe("demo-view"); // 身份不变（refresh 不是替换）
    expect(pushed.pluginId).toBe("demo-plugin");
    expect(pushed.renderPath).toBe(sampleOptions().renderPath);
    expect(pushed.title).toBe("Démo Vue");
    expect(pushed.actions).toEqual([{ id: "close", label: "Fermer", icon: "close" }]);
    expect(pushed.refresh).toBe(true); // 池据此跳过焦点获取

    // 不 settle promise——面板仍打开，consumer await 不到原因
    let settled = false;
    void reason.then(() => { settled = true; });
    await Promise.resolve();
    expect(settled).toBe(false);
  });

  it("面板未开 → no-op 零推送", () => {
    refreshPanelText("Démo Vue", [{ id: "close", label: "Fermer", icon: "close" }]);
    expect(pushMock).not.toHaveBeenCalled();
  });

  it("closePanel 后底稿失效——refreshPanelText no-op（面板已关，重推无意义）", () => {
    pushPanel(sampleOptions());
    closePanel();
    pushMock.mockClear();

    refreshPanelText("Démo Vue", [{ id: "close", label: "Fermer", icon: "close" }]);
    expect(pushMock).not.toHaveBeenCalled();
  });

  it("handleFloatingPanelAction（open-in/close）后底稿失效——refreshPanelText no-op", async () => {
    const reason = pushPanel(sampleOptions());
    handleFloatingPanelAction("close");
    pushMock.mockClear();

    refreshPanelText("Démo Vue", [{ id: "close", label: "Fermer", icon: "close" }]);
    expect(pushMock).not.toHaveBeenCalled();
    await expect(reason).resolves.toBe("close");
  });
});

describe("单实例语义（I8-10）", () => {
  it("同 viewId 再 push → 复用现有 promise（聚焦 no-op），不重复推 DTO", async () => {
    const r1 = pushPanel(sampleOptions());
    pushMock.mockClear();

    const r2 = pushPanel(sampleOptions());
    expect(r2).toBe(r1); // 同一 promise——关闭时两个 consumer 都收到原因
    expect(pushMock).not.toHaveBeenCalled(); // 已开同面板 → 零推送
    closePanel(); // 关闭 → settle，同 promise 两方都收到
    await expect(r2).resolves.toBe("programmatic");
  });

  it("异 viewId 再 push → 替换：旧 promise settle 'replaced'，新面板推送", async () => {
    const oldReason = pushPanel(sampleOptions());
    pushMock.mockClear();

    const newReason = pushPanel({ ...sampleOptions(), viewId: "other-view", title: "Other", pluginId: "other-plugin" });
    await expect(oldReason).resolves.toBe("replaced"); // 旧 consumer 不永远挂起
    expect(lastPush().viewId).toBe("other-view"); // 新面板推送给池
    expect(newReason).not.toBe(oldReason);
  });

  it("同 viewId 但异插件（双设置套同名 viewId 并存）→ 替换内容而非同视图聚焦（E5.8#41.16 复合键）", async () => {
    const oldReason = pushPanel(sampleOptions()); // demo-view / demo-plugin
    pushMock.mockClear();

    const newReason = pushPanel({ ...sampleOptions(), pluginId: "demo-plugin-b" }); // 同 viewId 异插件
    await expect(oldReason).resolves.toBe("replaced"); // 裸 viewId 会误判"同视图已开"→ 零推送；复合键 = 异面板 → 替换
    expect(lastPush().pluginId).toBe("demo-plugin-b");
    expect(lastPush().viewId).toBe("demo-view");
    expect(newReason).not.toBe(oldReason);
  });
});

/* ── M2 `AI#20`：非鼠标路径（几何设定）+ 可读面（几何镜像） ── */

describe("setBounds（AI#20 几何设定——非鼠标路径）", () => {
  it("面板已开 → 推 DTO 带 bounds + refresh:true（重推不重开，不抢焦点）", () => {
    pushPanel(sampleOptions());
    pushMock.mockClear();

    setBounds({ top: 120, left: 90 });

    const pushed = lastPush();
    expect(pushed.open).toBe(true);
    expect(pushed.bounds).toEqual({ top: 120, left: 90 });
    expect(pushed.refresh).toBe(true); // 面板已开——池跳过焦点获取
    expect(pushed.viewId).toBe("demo-view"); // 身份不变
  });

  it("bounds:null → 推「回默认居中大卡」语义（池侧回退到 CSS 默认）", () => {
    pushPanel(sampleOptions());
    pushMock.mockClear();

    setBounds(null);
    expect(lastPush().bounds).toBeNull();
  });

  it("面板未开 → no-op 零推送（⛔ 不凭几何无中生有开面板）", () => {
    setBounds({ top: 1 });
    expect(pushMock).not.toHaveBeenCalled();
  });

  it("⛔ 只推不存——bounds 不进底稿：随后 refreshPanelText 重推不带旧几何", () => {
    pushPanel(sampleOptions());
    setBounds({ top: 120, left: 90, width: 500, height: 450 });
    pushMock.mockClear();

    refreshPanelText("Démo Vue", [{ id: "close", label: "Fermer", icon: "close" }]);

    const pushed = lastPush();
    // 病根：若把 bounds 写进 _currentOpen，语言切换重推会带上这条旧几何，把用户后来拖过的面板弹回去
    expect(pushed.bounds).toBeUndefined();
    expect(pushed.title).toBe("Démo Vue");
  });
});

describe("几何镜像（AI#20 可读面）", () => {
  const GEOMETRY = { top: 120, left: 90, width: 500, height: 450, viewId: "demo-view", pluginId: "demo-plugin", maximized: false };

  it("reportGeometry 覆盖式落值，getLastGeometry 读回", () => {
    reportGeometry(GEOMETRY);
    expect(getLastGeometry()).toEqual(GEOMETRY);

    reportGeometry({ ...GEOMETRY, top: 200 });
    expect(getLastGeometry()!.top).toBe(200); // 覆盖不是累积
  });

  it("pushPanel（开新面板）清镜像——防读到上一个面板的几何（新几何等池上报）", () => {
    pushPanel(sampleOptions());
    reportGeometry(GEOMETRY);
    expect(getLastGeometry()).not.toBeNull();

    pushPanel({ ...sampleOptions(), viewId: "other-view", pluginId: "other-plugin" });
    expect(getLastGeometry()).toBeNull();
  });

  it("closePanel / handleFloatingPanelAction 清镜像（无面板 = 无几何）", () => {
    pushPanel(sampleOptions());
    reportGeometry(GEOMETRY);
    closePanel();
    expect(getLastGeometry()).toBeNull();

    pushPanel(sampleOptions());
    reportGeometry(GEOMETRY);
    handleFloatingPanelAction("close");
    expect(getLastGeometry()).toBeNull();
  });
});
