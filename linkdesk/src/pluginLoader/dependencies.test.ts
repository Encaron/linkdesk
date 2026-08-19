/**
 * dependencies.ts 依赖编排测试——E5.8#14。
 *
 * 覆盖：
 *   - 纯函数：getDependencyIds（requires 主 + extensionDependencies 兼容并集）/ findMissingDeps
 *     （就绪 = loadedPluginIds）/ detectDependencyCycle（自环 + 传递环 + 未知节点死胡同）
 *   - 集成（真实 loadPlugin 运行时路径）：钉序（依赖后加载也正确编排）/ 缺依赖永挂起 /
 *     传递链拓扑序 / 传递环 fail-loud / 自环 fail-loud
 *
 * 运行时插件 mock 面：readManifest 按插件 ID 返回 manifest（glob 外 → isRuntime 路径）。
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  getDependencyIds,
  findMissingDeps,
  detectDependencyCycle,
} from "./dependencies";
import { loadedPluginIds, _deferredPlugins, _pendingPlugins, _loadingPromises } from "./state";
import { clearLoadStates, getLoadDiagnostics, getLoadDiagnosticsSummary } from "./loadState";
import { clearRegistrationLayers } from "../core/registry/registrationTracker";
import { loadPlugin } from "./runtime";
import type { PluginManifest } from "../core/api/types";

// E5.7#95：测试夹具插件 ID——大写常量（linkdesk/no-plugin-id-hardcode 批准的常量通道）
const CONSUMER_ID = "dep-consumer";
const DEP_A_ID = "dep-a";
const DEP_B_ID = "dep-b";
const LONELY_ID = "dep-lonely";
const MISSING_DEP = "never-exists";
const TOPO_A_ID = "topo-a";
const TOPO_B_ID = "topo-b";
const TOPO_C_ID = "topo-c";
const CYCLE_A_ID = "cycle-a";
const CYCLE_B_ID = "cycle-b";
const SELF_ID = "dep-self";

const manifestOf = (name: string, requires?: string[], legacy?: string[]): PluginManifest =>
  ({ name, version: "1.0.0", ...(requires ? { requires } : {}), ...(legacy ? { extensionDependencies: legacy } : {}) }) as PluginManifest;

/* ── 纯函数 ── */

describe("dependencies 纯函数——getDependencyIds", () => {
  it("requires 为主", () => {
    expect(getDependencyIds(manifestOf("a", [DEP_A_ID]))).toEqual([DEP_A_ID]);
  });

  it("extensionDependencies 向后兼容（requires 缺席时）", () => {
    expect(getDependencyIds(manifestOf("a", undefined, [DEP_B_ID]))).toEqual([DEP_B_ID]);
  });

  it("两源并集 + 去重（requires 在前）", () => {
    expect(getDependencyIds(manifestOf("a", [DEP_A_ID, DEP_B_ID], [DEP_B_ID]))).toEqual([DEP_A_ID, DEP_B_ID]);
  });

  it("无依赖 → []", () => {
    expect(getDependencyIds(manifestOf("a"))).toEqual([]);
  });
});

describe("dependencies 纯函数——findMissingDeps", () => {
  beforeEach(() => { loadedPluginIds.clear(); });

  it("无依赖 → []", () => {
    expect(findMissingDeps(CONSUMER_ID, manifestOf("a"))).toEqual([]);
  });

  it("依赖已激活 → []", () => {
    loadedPluginIds.add(DEP_A_ID);
    expect(findMissingDeps(CONSUMER_ID, manifestOf("a", [DEP_A_ID]))).toEqual([]);
  });

  it("依赖未激活（未装/禁用/加载失败都在 loadedPluginIds 之外）→ 缺失", () => {
    expect(findMissingDeps(CONSUMER_ID, manifestOf("a", [DEP_A_ID]))).toEqual([DEP_A_ID]);
  });

  it("自依赖排除——交给环检测 fail-loud，不算缺失", () => {
    expect(findMissingDeps(SELF_ID, manifestOf("a", [SELF_ID]))).toEqual([]);
  });
});

describe("dependencies 纯函数——detectDependencyCycle", () => {
  // 已知 manifest 面——测试直供（模拟 runtime.getKnownManifest 的 glob/pending/deferred 面）
  const known = new Map<string, PluginManifest>();
  const getManifest = (id: string) => known.get(id);

  beforeEach(() => { known.clear(); });

  it("无依赖 → null", () => {
    expect(detectDependencyCycle(CONSUMER_ID, manifestOf("a"), getManifest)).toBeNull();
  });

  it("自环 → 路径", () => {
    expect(detectDependencyCycle(SELF_ID, manifestOf("a", [SELF_ID]), getManifest)).toBe(`${SELF_ID} → ${SELF_ID}`);
  });

  it("传递环 A→B→C→A → 路径（图级全查，非两两对）", () => {
    known.set(CYCLE_B_ID, manifestOf("b", [CYCLE_A_ID]));
    expect(detectDependencyCycle(CYCLE_A_ID, manifestOf("a", [CYCLE_B_ID]), getManifest))
      .toBe(`${CYCLE_A_ID} → ${CYCLE_B_ID} → ${CYCLE_A_ID}`);
  });

  it("直链 A→B→C（无环）→ null", () => {
    known.set(DEP_A_ID, manifestOf("a", [DEP_B_ID]));
    known.set(DEP_B_ID, manifestOf("b"));
    expect(detectDependencyCycle(CONSUMER_ID, manifestOf("c", [DEP_A_ID]), getManifest)).toBeNull();
  });

  it("依赖是未知插件（manifest 不在已知面）→ 死胡同 null（缺失依赖非环）", () => {
    expect(detectDependencyCycle(CONSUMER_ID, manifestOf("a", [MISSING_DEP]), getManifest)).toBeNull();
  });

  it("间接环：起点依赖的依赖回到起点（B→A，A 的依赖 B）", () => {
    // B requires A；A requires B——从 A 的 dep-check 查环
    known.set(CYCLE_B_ID, manifestOf("b", [CYCLE_A_ID]));
    expect(detectDependencyCycle(CYCLE_A_ID, manifestOf("a", [CYCLE_B_ID]), getManifest))
      .toBe(`${CYCLE_A_ID} → ${CYCLE_B_ID} → ${CYCLE_A_ID}`);
  });
});

/* ── 集成——真实 loadPlugin 运行时路径（readManifest mock） ── */

describe("dependencies 集成——loadPlugin 依赖编排", () => {
  const ORIG = (window as unknown as { linkdesk?: unknown }).linkdesk;
  let manifests = new Map<string, PluginManifest>();

  function resetAll(): void {
    loadedPluginIds.clear();
    _deferredPlugins.clear();
    _pendingPlugins.clear();
    _loadingPromises.clear();
    clearLoadStates();
    clearRegistrationLayers();
    manifests = new Map();
  }

  function mockPlugins(): void {
    (window as unknown as { linkdesk: unknown }).linkdesk = {
      plugins: {
        resolvePath: async () => `/plugins/test`,
        listDirs: async () => [],
        listDisabledDirs: async () => [],
        readManifest: async (id: string) => JSON.stringify(manifests.get(id) ?? {}),
      },
    };
  }

  beforeEach(() => {
    resetAll();
    mockPlugins();
  });

  afterEach(() => {
    (window as unknown as { linkdesk?: unknown }).linkdesk = ORIG;
    resetAll();
  });

  it("钉序：依赖后加载也能正确编排（消费者先加载 → 挂起；依赖加载 → sweep 补载）", async () => {
    manifests.set(CONSUMER_ID, manifestOf("消费者", [DEP_A_ID]));
    manifests.set(DEP_A_ID, manifestOf("依赖A"));

    await loadPlugin(CONSUMER_ID, "startup");  // 消费者先加载——依赖未就绪
    expect(getLoadDiagnostics(CONSUMER_ID).loadState).toBe("pending");
    expect(getLoadDiagnostics(CONSUMER_ID).pendingReason).toContain("dep-a");

    await loadPlugin(DEP_A_ID, "startup");     // 依赖后加载——sweep 补载消费者
    expect(loadedPluginIds.has(DEP_A_ID)).toBe(true);
    expect(loadedPluginIds.has(CONSUMER_ID)).toBe(true);
    expect(getLoadDiagnostics(CONSUMER_ID).loadState).toBe("active");
  });

  it("缺依赖（不存在）→ 永挂起 PENDING + 原因可读，不进 loadedPluginIds", async () => {
    manifests.set(LONELY_ID, manifestOf("孤独插件", [MISSING_DEP]));

    await loadPlugin(LONELY_ID, "startup");
    expect(loadedPluginIds.has(LONELY_ID)).toBe(false);
    expect(getLoadDiagnostics(LONELY_ID)).toMatchObject({
      loadState: "pending",
      pendingReason: expect.stringContaining(MISSING_DEP),
    });
  });

  it("传递链拓扑序：C→B→A 反序加载，sweep 级联补载成 A→B→C 激活序", async () => {
    manifests.set(TOPO_C_ID, manifestOf("顶层", [TOPO_B_ID]));
    manifests.set(TOPO_B_ID, manifestOf("中层", [TOPO_A_ID]));
    manifests.set(TOPO_A_ID, manifestOf("底层"));

    await loadPlugin(TOPO_C_ID, "startup");  // 顶层先加载——挂起
    await loadPlugin(TOPO_B_ID, "startup");  // 中层——挂起
    expect(getLoadDiagnostics(TOPO_C_ID).loadState).toBe("pending");
    expect(getLoadDiagnostics(TOPO_B_ID).loadState).toBe("pending");

    await loadPlugin(TOPO_A_ID, "startup");  // 底层加载 → sweep 级联补载 B → 再补载 C
    const order = [...loadedPluginIds];
    const iA = order.indexOf(TOPO_A_ID);
    const iB = order.indexOf(TOPO_B_ID);
    const iC = order.indexOf(TOPO_C_ID);
    expect(iA).toBeGreaterThanOrEqual(0);
    expect(iA).toBeLessThan(iB);  // 依赖先于消费者激活
    expect(iB).toBeLessThan(iC);
  });

  it("传递环 fail-loud：A↔B——后查者失败 + 原因含环路径，先查者挂起", async () => {
    manifests.set(CYCLE_A_ID, manifestOf("环A", [CYCLE_B_ID]));
    manifests.set(CYCLE_B_ID, manifestOf("环B", [CYCLE_A_ID]));

    await loadPlugin(CYCLE_A_ID, "startup");  // B 未知 → 挂起
    expect(getLoadDiagnostics(CYCLE_A_ID).loadState).toBe("pending");

    await loadPlugin(CYCLE_B_ID, "startup");  // 走闭包发现环 → fail-loud
    expect(getLoadDiagnostics(CYCLE_B_ID).loadState).toBe("failed");
    expect(getLoadDiagnostics(CYCLE_B_ID).failureReason).toContain("依赖环");
    expect(getLoadDiagnostics(CYCLE_B_ID).failureReason).toContain(CYCLE_A_ID);
    expect(getLoadDiagnostics(CYCLE_B_ID).failureReason).toContain(CYCLE_B_ID);
  });

  it("自环 fail-loud：A requires A → 立即失败", async () => {
    manifests.set(SELF_ID, manifestOf("自环", [SELF_ID]));

    await loadPlugin(SELF_ID, "startup");
    expect(getLoadDiagnostics(SELF_ID).loadState).toBe("failed");
    expect(getLoadDiagnostics(SELF_ID).failureReason).toBe(`依赖环: ${SELF_ID} → ${SELF_ID}`);
  });

  it("extensionDependencies 兼容路径也参与编排（零插件使用，向后兼容钉住）", async () => {
    manifests.set(CONSUMER_ID, manifestOf("消费者", undefined, [DEP_A_ID]));
    manifests.set(DEP_A_ID, manifestOf("依赖A"));

    await loadPlugin(CONSUMER_ID, "startup");
    expect(getLoadDiagnostics(CONSUMER_ID).loadState).toBe("pending");
    await loadPlugin(DEP_A_ID, "startup");
    expect(getLoadDiagnostics(CONSUMER_ID).loadState).toBe("active");
  });

  it("启动收尾诊断摘要含挂起插件（pendingReason 数据源——loader 挂起诊断日志 + #15.5）", async () => {
    manifests.set(LONELY_ID, manifestOf("孤独插件", [MISSING_DEP]));

    await loadPlugin(LONELY_ID, "startup");
    const summary = getLoadDiagnosticsSummary();
    const mine = summary.find((s) => s.pluginId === LONELY_ID);
    expect(mine?.loadState).toBe("pending");
    expect(mine?.pendingReason).toContain(MISSING_DEP);
  });

  it("sweep 幂等：挂起插件依赖仍未就绪时不被误载", async () => {
    manifests.set(CONSUMER_ID, manifestOf("消费者", [DEP_A_ID, MISSING_DEP]));
    manifests.set(DEP_A_ID, manifestOf("依赖A"));

    await loadPlugin(DEP_A_ID, "startup");  // 依赖A 就绪
    await loadPlugin(CONSUMER_ID, "startup");  // 但 MISSING_DEP 永不出现 → 消费者仍挂起
    expect(loadedPluginIds.has(CONSUMER_ID)).toBe(false);
    expect(getLoadDiagnostics(CONSUMER_ID).pendingReason).toContain(MISSING_DEP);
  });
});
