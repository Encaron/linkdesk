/**
 * loadState.ts 状态机单元测试——E5.8#11 loader 生命周期状态机 + 诊断面。
 *
 * 覆盖：
 *   - 合法迁移链（pending→loading→active→unloading→disposed / loading→failed→loading）
 *   - 非法迁移 console.warn 不 throw 不改状态（诊断面不是看门狗）
 *   - failureReason 记录/重试清除
 *   - registeredEffects 诊断面（tracker 登记数）
 *   - unloadPlugin L6b 顺序机械保障（PLUGIN_REMOVED → onWillUninstall → onDidUninstall + 状态时序）
 *   - 坏插件验收：runtime 读盘失败 → 状态机 failed + 原因可查（真实 loadPlugin 路径）
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  markLoadStarted,
  markLoadSuccess,
  markLoadFailed,
  parkPending,
  unloadPlugin,
  orphanPlugin,
  getLoadDiagnostics,
  getLoadDiagnosticsSummary,
  clearLoadStates,
} from "./loadState";
import { PluginLifecycle, onPluginLifecycleChange } from "../lifecycle/lifecycle-events";
import { CUSTOM_EVENTS } from "../../core/react/events/CoreEvents";
import {
  trackRegistration,
  clearRegistrationLayers,
  registrationCount,
} from "../../core/registry/registrationTracker";
import { loadPlugin } from "./runtime";

// E5.7#95：测试夹具插件 ID——大写常量（linkdesk/no-plugin-id-hardcode 批准的常量通道）
const PID = "loadstate-test-plugin";
const OTHER_PLUGIN_ID = "other-plugin";
const BAD_PLUGIN_ID = "bad-plugin";

/* ── 每个测试前重置状态机 + 追踪器 ── */

function resetStateMachine(): void {
  clearLoadStates();
  clearRegistrationLayers();
}

/* ── 状态机——迁移链 + 非法迁移 ── */

describe("loadState 状态机——迁移", () => {
  beforeEach(() => {
    resetStateMachine();
  });

  it("未加载插件 → PENDING（默认态，registeredEffects 0）", () => {
    const diag = getLoadDiagnostics(PID);
    expect(diag.loadState).toBe("pending");
    expect(diag.failureReason).toBeUndefined();
    expect(diag.registeredEffects).toBe(0);
  });

  it("加载链：pending → loading → active → unloading → disposed", () => {
    markLoadStarted(PID);
    expect(getLoadDiagnostics(PID).loadState).toBe("loading");

    markLoadSuccess(PID);
    expect(getLoadDiagnostics(PID).loadState).toBe("active");

    unloadPlugin(PID, "uninstall", "测试插件");
    expect(getLoadDiagnostics(PID).loadState).toBe("disposed");
  });

  it("加载失败：loading → failed 记录原因；重试 markLoadStarted 清原因", () => {
    markLoadStarted(PID);
    markLoadFailed(PID, "plugin.json 读取失败: 磁盘损坏");
    expect(getLoadDiagnostics(PID)).toMatchObject({ loadState: "failed", failureReason: "plugin.json 读取失败: 磁盘损坏" });

    // 重试——failed → loading 清原因
    markLoadStarted(PID);
    expect(getLoadDiagnostics(PID)).toMatchObject({ loadState: "loading", failureReason: undefined });

    markLoadSuccess(PID);
    expect(getLoadDiagnostics(PID).loadState).toBe("active");
  });

  it("失败态也可被卸载（诚实清场到 disposed）", () => {
    markLoadStarted(PID);
    markLoadFailed(PID, "缺 entry");
    unloadPlugin(PID, "uninstall", "测试插件");
    expect(getLoadDiagnostics(PID).loadState).toBe("disposed");
  });

  it("disposed → loading（重装/启用）恢复", () => {
    markLoadStarted(PID);
    markLoadSuccess(PID);
    unloadPlugin(PID, "uninstall");
    markLoadStarted(PID);
    markLoadSuccess(PID);
    expect(getLoadDiagnostics(PID).loadState).toBe("active");
  });

  it("非法迁移 console.warn 不 throw 不改状态（active → loading 双重加载）", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      markLoadStarted(PID);
      markLoadSuccess(PID);
      // active → loading 非法——不生效
      markLoadStarted(PID);
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("非法状态迁移"));
      expect(getLoadDiagnostics(PID).loadState).toBe("active");
    } finally {
      warnSpy.mockRestore();
    }
  });

  it("非法迁移：pending → active 直接跳级 warn", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      markLoadSuccess(PID);
      expect(warnSpy).toHaveBeenCalled();
      expect(getLoadDiagnostics(PID).loadState).toBe("pending");
    } finally {
      warnSpy.mockRestore();
    }
  });

  it("卸载完成后 markLoadSuccess（迟到加载完成）被拒——状态保持 disposed", () => {
    // 模拟竞态：加载进行中 → 被卸载 → 迟到 applyPostLoadSteps 不得把插件变回 active
    markLoadStarted(PID);
    unloadPlugin(PID, "uninstall");
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      markLoadSuccess(PID);
      expect(warnSpy).toHaveBeenCalled();
      expect(getLoadDiagnostics(PID).loadState).toBe("disposed");
    } finally {
      warnSpy.mockRestore();
    }
  });
});

/* ── E5.8#14：缺依赖挂起——pendingReason + parkPending ── */

describe("loadState 缺依赖挂起——parkPending + pendingReason", () => {
  beforeEach(() => {
    resetStateMachine();
  });

  it("挂起：loading → pending + 记录 pendingReason", () => {
    markLoadStarted(PID);
    parkPending(PID, "等待依赖: \"dep-plugin\"");
    expect(getLoadDiagnostics(PID)).toMatchObject({
      loadState: "pending",
      pendingReason: "等待依赖: \"dep-plugin\"",
    });
  });

  it("重载清 pendingReason：pending → loading → active", () => {
    markLoadStarted(PID);
    parkPending(PID, "等待依赖: \"dep-plugin\"");
    markLoadStarted(PID);  // 依赖就绪重载
    expect(getLoadDiagnostics(PID).pendingReason).toBeUndefined();
    markLoadSuccess(PID);
    expect(getLoadDiagnostics(PID).loadState).toBe("active");
  });

  it("未加载（默认 pending）挂起——只更新原因不告警", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      parkPending(PID, "等待依赖: \"dep-plugin\"");
      expect(warnSpy).not.toHaveBeenCalled();
    } finally {
      warnSpy.mockRestore();
    }
    expect(getLoadDiagnostics(PID)).toMatchObject({ loadState: "pending", pendingReason: "等待依赖: \"dep-plugin\"" });
  });

  it("挂起后卸载——pendingReason 清空 + 收敛到 disposed", () => {
    markLoadStarted(PID);
    parkPending(PID, "等待依赖: \"dep-plugin\"");
    unloadPlugin(PID, "uninstall", "测试插件");
    const diag = getLoadDiagnostics(PID);
    expect(diag.loadState).toBe("disposed");
    expect(diag.pendingReason).toBeUndefined();
  });
});

/* ── E5.8#15：连带卸载落点——orphanPlugin（active → unloading → pending） ── */

describe("loadState 连带卸载——orphanPlugin", () => {
  beforeEach(() => {
    resetStateMachine();
  });

  it("active → 连带卸载 → pending + pendingReason（卸载迁移图加 unloading → pending）", () => {
    markLoadStarted(PID);
    markLoadSuccess(PID);
    orphanPlugin(PID, ["dep-plugin"]);
    const diag = getLoadDiagnostics(PID);
    expect(diag.loadState).toBe("pending");
    expect(diag.pendingReason).toContain("dep-plugin");
  });

  it("重复连带卸载幂等——已 pending 跳过不双滚", () => {
    markLoadStarted(PID);
    markLoadSuccess(PID);
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      orphanPlugin(PID, ["dep-plugin"]);
      orphanPlugin(PID, ["dep-plugin"]);  // 第二次——守卫跳过
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("跳过"));
      expect(getLoadDiagnostics(PID).loadState).toBe("pending");
    } finally {
      warnSpy.mockRestore();
    }
  });

  it("不 fire onDidUninstall（连带卸载非用户卸载）", () => {
    const didUninstallSpy = vi.fn();
    const unsub = PluginLifecycle.onDidUninstall.event(didUninstallSpy);
    try {
      markLoadStarted(PID);
      markLoadSuccess(PID);
      orphanPlugin(PID, ["dep-plugin"]);
      expect(didUninstallSpy).not.toHaveBeenCalled();
    } finally {
      unsub();
    }
  });

  it("fire onPluginLifecycleChange（E5.8#15.5：挂起后 marketplace 列表即时变——连带不发 onDidUninstall，刷新信号由 orphan 补发）", () => {
    const fired = vi.fn();
    const unsub = onPluginLifecycleChange.event(fired);
    try {
      markLoadStarted(PID);
      markLoadSuccess(PID);
      orphanPlugin(PID, ["dep-plugin"]);
      expect(fired).toHaveBeenCalledTimes(1);
    } finally {
      unsub();
    }
  });

  it("返回连带结果（自身——顶层 unloadPlugin 聚合后果 toast 数据源）", () => {
    markLoadStarted(PID);
    markLoadSuccess(PID);
    const orphans = orphanPlugin(PID, ["dep-plugin"]);
    // loadState 测试面无 loadedPluginIds manifest → displayName 回退 pluginId
    expect(orphans).toEqual([{ pluginId: PID, displayName: PID }]);
  });

  it("守卫跳过时返回空数组（不参与聚合 toast）", () => {
    markLoadStarted(PID);
    markLoadSuccess(PID);
    orphanPlugin(PID, ["dep-plugin"]);  // 首次连带 → pending
    const second = orphanPlugin(PID, ["dep-plugin"]);  // 已 pending → 守卫
    expect(second).toEqual([]);
  });
});

/* ── 诊断面——registeredEffects ── */

describe("loadState 诊断面——registeredEffects", () => {
  beforeEach(() => {
    resetStateMachine();
  });

  it("tracker 登记数进入诊断（2 条 → registeredEffects 2）", () => {
    trackRegistration(PID, () => {});
    trackRegistration(PID, () => {});
    expect(getLoadDiagnostics(PID).registeredEffects).toBe(2);
  });

  it("卸载回滚后 registeredEffects 归零", () => {
    trackRegistration(PID, () => {});
    trackRegistration(PID, () => {});
    expect(getLoadDiagnostics(PID).registeredEffects).toBe(2);
    unloadPlugin(PID, "uninstall");
    expect(getLoadDiagnostics(PID).loadState).toBe("disposed");
    expect(getLoadDiagnostics(PID).registeredEffects).toBe(0);
  });

  it("per-plugin 隔离——其他插件的登记不影响本插件计数", () => {
    trackRegistration(OTHER_PLUGIN_ID, () => {});
    trackRegistration(OTHER_PLUGIN_ID, () => {});
    trackRegistration(PID, () => {});
    expect(getLoadDiagnostics(PID).registeredEffects).toBe(1);
  });

  it("getLoadDiagnosticsSummary 返回全量状态摘要", () => {
    markLoadStarted(PID);
    markLoadSuccess(PID);
    trackRegistration(PID, () => {});
    const summary = getLoadDiagnosticsSummary();
    const mine = summary.find((s) => s.pluginId === PID);
    expect(mine).toMatchObject({ loadState: "active", registeredEffects: 1 });
  });
});

/* ── unloadPlugin——L6b 顺序机械保障 ── */

describe("loadState unloadPlugin——L6b 顺序机械保障", () => {
  let unsub: Array<() => void> = [];

  beforeEach(() => {
    resetStateMachine();
    unsub = [];
  });

  afterEach(() => {
    unsub.forEach((u) => { try { u(); } catch { /* 已清理 */ } });
  });

  it("事件顺序 + 状态时序：PLUGIN_REMOVED → onWillUninstall → onDidUninstall", () => {
    const order: string[] = [];
    let stateDuringWill: string | undefined;
    let stateDuringDid: string | undefined;

    const onRemoved = (): void => { order.push("PLUGIN_REMOVED"); };
    window.addEventListener(CUSTOM_EVENTS.PLUGIN_REMOVED, onRemoved);
    unsub.push(() => window.removeEventListener(CUSTOM_EVENTS.PLUGIN_REMOVED, onRemoved));

    unsub.push(PluginLifecycle.onWillUninstall.event(() => {
      order.push("onWillUninstall");
      stateDuringWill = getLoadDiagnostics(PID).loadState;
    }));
    unsub.push(PluginLifecycle.onDidUninstall.event(() => {
      order.push("onDidUninstall");
      stateDuringDid = getLoadDiagnostics(PID).loadState;
    }));

    markLoadStarted(PID);
    markLoadSuccess(PID);
    unloadPlugin(PID, "uninstall", "测试插件");

    expect(order).toEqual(["PLUGIN_REMOVED", "onWillUninstall", "onDidUninstall"]);
    expect(stateDuringWill).toBe("unloading");  // rollback 执行区间
    expect(stateDuringDid).toBe("disposed");    // rollback 已完成
  });

  it("tracker 逆序回滚在 onWillUninstall 内同步完成", () => {
    const rolledBack: string[] = [];
    let stateWhenRolledBack: string | undefined;
    trackRegistration(PID, () => rolledBack.push("d2"));
    trackRegistration(PID, () => rolledBack.push("d1"));

    unsub.push(PluginLifecycle.onWillUninstall.event(() => {
      stateWhenRolledBack = getLoadDiagnostics(PID).loadState;
    }));

    markLoadStarted(PID);
    markLoadSuccess(PID);
    unloadPlugin(PID, "uninstall", "测试插件");

    expect(rolledBack).toEqual(["d1", "d2"]);          // LIFO 逆序
    expect(stateWhenRolledBack).toBe("unloading");      // 回滚发生在 unloading 区间
    expect(registrationCount(PID)).toBe(0);
  });

  it("重复卸载 warn + 不双发事件", () => {
    const events: string[] = [];
    unsub.push(PluginLifecycle.onWillUninstall.event(() => events.push("will")));
    unsub.push(PluginLifecycle.onDidUninstall.event(() => events.push("did")));
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    try {
      markLoadStarted(PID);
      markLoadSuccess(PID);
      unloadPlugin(PID, "uninstall");
      unloadPlugin(PID, "uninstall");  // 第二次——已 disposed
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("重复卸载"));
      expect(events).toEqual(["will", "did"]);  // 只发一轮
      expect(getLoadDiagnostics(PID).loadState).toBe("disposed");
    } finally {
      warnSpy.mockRestore();
    }
  });

  it("卸载未加载的插件（pending）→ 照常收敛到 disposed", () => {
    unloadPlugin(PID, "uninstall", "测试插件");
    expect(getLoadDiagnostics(PID).loadState).toBe("disposed");
  });

  it("reason 透传：disable 与 uninstall 事件载荷一致", () => {
    const reasons: string[] = [];
    let displayNames: Array<string | undefined> = [];
    unsub.push(PluginLifecycle.onWillUninstall.event((e) => reasons.push(e.reason)));
    unsub.push(PluginLifecycle.onDidUninstall.event((e) => displayNames.push(e.displayName)));

    markLoadStarted(PID);
    markLoadSuccess(PID);
    unloadPlugin(PID, "disable", "测试插件");
    expect(reasons).toEqual(["disable"]);
    expect(displayNames).toEqual(["测试插件"]);
  });
});

/* ── 坏插件验收——runtime 读盘失败 → 状态可查原因（真实 loadPlugin 路径） ── */

describe("loadState 坏插件验收——runtime 读盘失败", () => {
  const ORIG = (window as unknown as { linkdesk?: unknown }).linkdesk;

  beforeEach(() => {
    resetStateMachine();
    // 壳 preload 注入面——readManifest 抛错模拟坏插件目录（plugin.json 损坏/不可读）
    (window as unknown as { linkdesk: unknown }).linkdesk = {
      plugins: {
        resolvePath: async () => `/plugins/${BAD_PLUGIN_ID}`,
        listDirs: async () => [],
        // E6#9a/c：pluginsApi 守卫要求壳面六法齐全——测试直呼 loadPlugin 走 runtime 读盘路径
        listAll: async () => [],
        listDisabledDirs: async () => [],
        readManifest: async () => { throw new Error("JSON parse 失败: Unexpected token }"); },
        readAllManifests: async () => ({}),
      },
    };
  });

  afterEach(() => {
    (window as unknown as { linkdesk?: unknown }).linkdesk = ORIG;
  });

  it("读盘抛错 → loadPlugin 后 getLoadDiagnostics 显示 failed + 原因可查", async () => {
    await loadPlugin(BAD_PLUGIN_ID, "startup");
    const diag = getLoadDiagnostics(BAD_PLUGIN_ID);
    expect(diag.loadState).toBe("failed");
    expect(diag.failureReason).toContain("plugin.json 读取失败");
    expect(diag.failureReason).toContain("JSON parse 失败");
  });

  it("诊断摘要包含失败插件——启动收尾日志数据源", async () => {
    await loadPlugin(BAD_PLUGIN_ID, "startup");
    const summary = getLoadDiagnosticsSummary();
    const mine = summary.find((s) => s.pluginId === BAD_PLUGIN_ID);
    expect(mine?.loadState).toBe("failed");
  });
});
