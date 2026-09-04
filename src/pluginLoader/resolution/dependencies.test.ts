/**
 * dependencies.ts 依赖编排测试——E5.8#14 + #15。
 *
 * 覆盖：
 *   - 纯函数：getDependencyIds（requires 主 + extensionDependencies 兼容并集）/ findMissingDeps
 *     （就绪 = loadedPluginIds）/ detectDependencyCycle（自环 + 传递环 + 未知节点死胡同）
 *     / formatPendingReason（挂起文案单源）/ findActiveConsumers（活跃消费方发现）
 *   - 集成（真实 loadPlugin 运行时路径）：钉序（依赖后加载也正确编排）/ 缺依赖永挂起 /
 *     传递链拓扑序 / 传递环 fail-loud / 自环 fail-loud
 *   - #15 依赖消失连带卸载 + 自动重载：卸载链（消费方逆拓扑序先退 + 重装自动 ACTIVE）/
 *     禁用链（连带挂起 + 启用自动 ACTIVE）/ 传递连带（深层先退）/ 禁用优先（不复活）/
 *     挂起消费方可禁用（操作层回退）/ 卸载清挂起登记
 *   - #15.5 PENDING 用户可见面：list 数据源含挂起插件 + pendingReason（marketplace 列表/详情
 *     数据源）/ getLoadedPluginManifests 保持只含已加载（AppInitializer 计数语义不回归）/
 *     连带卸载 → 后果 toast（一次连带一次通知，深层聚合）+ 池刷新信号
 *   - #16 适配 + 五态测试：零改动兼容（无 requires 插件 ACTIVE + 零挂起足迹）/ 重载全景
 *     （挂起 → ACTIVE 清原因清登记 → 连带再挂起 → 回归再 ACTIVE）。有依赖/缺依赖/循环
 *     已由 #14 钉序/缺依赖永挂起/传递环/自环盖住，此处补独缺两态。
 *
 * 运行时插件 mock 面：readManifest 按插件 ID 返回 manifest（glob 外 → isRuntime 路径）。
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  getDependencyIds,
  findMissingDeps,
  detectDependencyCycle,
  formatPendingReason,
  findActiveConsumers,
} from "./dependencies";
import { loadedPluginIds, _deferredPlugins, _pendingPlugins, _loadingPromises } from "./state";
import { clearLoadStates, getLoadDiagnostics, getLoadDiagnosticsSummary, unloadPlugin } from "./loadState";
import { clearRegistrationLayers } from "../../core/registry/registrationTracker";
import { loadPlugin } from "./runtime";
import { shouldWatcherSkip } from "../loader";  // E5.8#24 回归：watcher 跳过已失败/已挂起插件
import { disablePlugin, getLoadedPluginManifests, getListPluginManifests } from "../lifecycle/lifecycle-ops";
import { PluginLifecycle, onPluginLifecycleChange } from "../lifecycle/lifecycle-events";
import { clearPluginStates } from "../../core/services/plugins/PluginStateService";
import type { PluginManifest } from "../../core/api/types";

// E5.8#15.5：连带后果 toast——mock pushToast 观察连带通知（loadState.unloadPlugin 直接 import，
// vi.mock 模块级替换才能拦截）。vi.hoisted 保证 mock 工厂引用同一实例。
const { pushToast } = vi.hoisted(() => ({ pushToast: vi.fn() }));
vi.mock("../../core/services/ui/NotificationService", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../core/services/ui/NotificationService")>();
  return { ...actual, pushToast };
});

// E5.7#95：测试夹具插件 ID——大写常量（linkdesk/no-plugin-id-hardcode 批准的常量通道）
const CONSUMER_ID = "dep-consumer";
const DEP_A_ID = "dep-a";
const DEP_B_ID = "dep-b";
const GRANDCHILD_ID = "dep-grandchild";
const LEGACY_ID = "dep-legacy";  // #16 零改动兼容——无 requires 的老插件
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

describe("dependencies 纯函数——formatPendingReason", () => {
  it("引号分隔 pluginId 列表（单源文案，park + orphan 共用）", () => {
    expect(formatPendingReason([DEP_A_ID, DEP_B_ID]))
      .toBe(`等待依赖: "${DEP_A_ID}"、"${DEP_B_ID}"`);
  });

  it("空列表 → 前缀空串（防御性）", () => {
    expect(formatPendingReason([])).toBe("等待依赖: ");
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
    clearPluginStates(); // #15 禁用优先测试写 disabledPlugins——测试间互不泄漏
    manifests = new Map();
  }

  function mockPlugins(): void {
    (window as unknown as { linkdesk: unknown }).linkdesk = {
      plugins: {
        resolvePath: async () => `/plugins/test`,
        listDirs: async () => [],
        // E6#9a/c：pluginsApi 守卫要求壳面六法齐全（1.2-2a 新契约）——测试直呼 loadPlugin 不走
        // discoverInstalled，listAll/readAllManifests 只需存在通过守卫；manifest 走 readManifest mock。
        listAll: async () => [],
        listDisabledDirs: async () => [],
        readManifest: async (id: string) => JSON.stringify(manifests.get(id) ?? {}),
        readAllManifests: async () => ({}),
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

  it("E5.8#24 回归：watcher 跳过已失败/已挂起插件（防 2s 轮询反复重入弹 toast）", async () => {
    // 复现路径：依赖环 fail-loud 后插件不进 loadedPluginIds → 若 watcher 每 2s 重载则反复弹环 toast。
    manifests.set(CYCLE_A_ID, manifestOf("环A", [CYCLE_B_ID]));
    manifests.set(CYCLE_B_ID, manifestOf("环B", [CYCLE_A_ID]));
    manifests.set(LONELY_ID, manifestOf("孤独插件", [MISSING_DEP]));  // 缺依赖永挂起

    await loadPlugin(CYCLE_A_ID, "startup");
    await loadPlugin(CYCLE_B_ID, "startup");  // 环 fail-loud
    await loadPlugin(LONELY_ID, "startup");   // 缺依赖挂起

    // 已失败（环）——watcher 跳过，不再重载
    expect(getLoadDiagnostics(CYCLE_B_ID).loadState).toBe("failed");
    expect(shouldWatcherSkip(CYCLE_B_ID)).toBe(true);
    // 已挂起（缺依赖）——跳过；sweep 依赖就绪自动补载，不需轮询
    expect(getLoadDiagnostics(LONELY_ID).pendingReason).toContain(MISSING_DEP);
    expect(shouldWatcherSkip(LONELY_ID)).toBe(true);
    // 未尝试过的插件——loadState "pending" 但无 pendingReason → 不跳过，正常加载
    expect(shouldWatcherSkip("never-attempted")).toBe(false);
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

  /* ── E5.8#15：依赖消失连带卸载 + 自动重载 ── */

  describe("#15 依赖消失连带卸载 + 自动重载", () => {
    /** 标准两条链种子——消费者 requires 依赖A，均加载为 ACTIVE */
    async function seedConsumerChain(): Promise<void> {
      manifests.set(CONSUMER_ID, manifestOf("消费者", [DEP_A_ID]));
      manifests.set(DEP_A_ID, manifestOf("依赖A"));
      await loadPlugin(CONSUMER_ID, "startup");  // 依赖未就绪 → 挂起
      await loadPlugin(DEP_A_ID, "startup");     // 依赖加载 → sweep 补载消费方
      expect(loadedPluginIds.has(CONSUMER_ID)).toBe(true);
      expect(loadedPluginIds.has(DEP_A_ID)).toBe(true);
    }

    /** 记录 onWillUninstall 触发顺序（逆拓扑序断言用） */
    function trackUninstallOrder(): { order: string[]; unsub: () => void } {
      const order: string[] = [];
      const unsub = PluginLifecycle.onWillUninstall.event(({ pluginId }) => { order.push(pluginId); });
      return { order, unsub };
    }

    it("卸载链：依赖卸载 → 消费方连带降级 PENDING（逆拓扑序先退）；重装 → 自动 ACTIVE", async () => {
      await seedConsumerChain();
      // findActiveConsumers——连带发现源（消费方被找到，非消费方不被误报）
      expect(findActiveConsumers(DEP_A_ID)).toContain(CONSUMER_ID);
      expect(findActiveConsumers(CONSUMER_ID)).toEqual([]);

      // 逆拓扑序：消费方先退（回滚期可查询依赖注册表贡献）、依赖后退
      const { order, unsub } = trackUninstallOrder();
      unloadPlugin(DEP_A_ID, "uninstall");
      unsub();
      expect(order).toEqual([CONSUMER_ID, DEP_A_ID]);
      expect(getLoadDiagnostics(CONSUMER_ID)).toMatchObject({
        loadState: "pending",
        pendingReason: expect.stringContaining(DEP_A_ID),
      });
      expect(getLoadDiagnostics(DEP_A_ID).loadState).toBe("disposed");
      expect(loadedPluginIds.has(CONSUMER_ID)).toBe(false);
      expect(_pendingPlugins.has(CONSUMER_ID)).toBe(true); // 挂起登记留存——重装可补载

      // 依赖重装 → 消费方自动 ACTIVE（sweep 在 loadPlugin 完成点触发）
      await loadPlugin(DEP_A_ID, "reinstall");
      expect(getLoadDiagnostics(DEP_A_ID).loadState).toBe("active");
      expect(getLoadDiagnostics(CONSUMER_ID).loadState).toBe("active");
      expect(loadedPluginIds.has(CONSUMER_ID)).toBe(true);
    });

    it("禁用/启用同链：依赖禁用 → 消费方连带挂起；启用 → 自动 ACTIVE", async () => {
      await seedConsumerChain();
      unloadPlugin(DEP_A_ID, "disable");   // 禁用 = 等价卸载 → 连带
      expect(getLoadDiagnostics(CONSUMER_ID).loadState).toBe("pending");
      expect(loadedPluginIds.has(CONSUMER_ID)).toBe(false);

      await loadPlugin(DEP_A_ID, "enable");  // 启用 = 等价重装 → sweep 补载
      expect(getLoadDiagnostics(CONSUMER_ID).loadState).toBe("active");
      expect(loadedPluginIds.has(CONSUMER_ID)).toBe(true);
    });

    it("传递连带：深层消费方先退（逆拓扑序），全部落 PENDING", async () => {
      manifests.set(GRANDCHILD_ID, manifestOf("孙消费", [CONSUMER_ID]));
      manifests.set(CONSUMER_ID, manifestOf("消费者", [DEP_A_ID]));
      manifests.set(DEP_A_ID, manifestOf("依赖A"));

      await loadPlugin(CONSUMER_ID, "startup");   // 挂起
      await loadPlugin(GRANDCHILD_ID, "startup"); // 挂起（等 C）
      await loadPlugin(DEP_A_ID, "startup");      // sweep 级联补载 C → 孙
      expect(loadedPluginIds.has(GRANDCHILD_ID)).toBe(true);
      expect(loadedPluginIds.has(CONSUMER_ID)).toBe(true);

      const { order, unsub } = trackUninstallOrder();
      unloadPlugin(DEP_A_ID, "uninstall");
      unsub();
      expect(order).toEqual([GRANDCHILD_ID, CONSUMER_ID, DEP_A_ID]);  // 深层消费方先退
      expect(loadedPluginIds.has(GRANDCHILD_ID)).toBe(false);
      expect(loadedPluginIds.has(CONSUMER_ID)).toBe(false);
      expect(getLoadDiagnostics(GRANDCHILD_ID).pendingReason).toContain(CONSUMER_ID);
      expect(getLoadDiagnostics(CONSUMER_ID).pendingReason).toContain(DEP_A_ID);
    });

    it("禁用优先端到端：连带挂起 → 显式禁用（操作层回退）→ 依赖回归不自动激活（不复活）", async () => {
      await seedConsumerChain();
      unloadPlugin(DEP_A_ID, "disable");   // 依赖禁用 → 连带挂起
      expect(getLoadDiagnostics(CONSUMER_ID).loadState).toBe("pending");

      const res = await disablePlugin(CONSUMER_ID);  // 显式禁用挂起消费方（getMutableManifest 回退 _pendingPlugins）
      expect(res.success).toBe(true);
      expect(_pendingPlugins.has(CONSUMER_ID)).toBe(false);
      expect(getLoadDiagnostics(CONSUMER_ID).loadState).toBe("disposed");

      await loadPlugin(DEP_A_ID, "enable");  // 依赖回归 → sweep：消费方禁用优先 → 不复活
      expect(loadedPluginIds.has(CONSUMER_ID)).toBe(false);
      expect(getLoadDiagnostics(CONSUMER_ID).loadState).toBe("disposed");
    });

    it("卸载清挂起登记：缺依赖挂起后被正式卸载 → 清挂起 + 收敛到 disposed", async () => {
      manifests.set(CONSUMER_ID, manifestOf("消费者", [MISSING_DEP]));
      await loadPlugin(CONSUMER_ID, "startup");  // 缺依赖挂起
      expect(getLoadDiagnostics(CONSUMER_ID).loadState).toBe("pending");
      expect(_pendingPlugins.has(CONSUMER_ID)).toBe(true);

      unloadPlugin(CONSUMER_ID, "uninstall");
      expect(_pendingPlugins.has(CONSUMER_ID)).toBe(false);
      expect(getLoadDiagnostics(CONSUMER_ID).loadState).toBe("disposed");
    });
  });

  /* ── E5.8#15.5：PENDING 用户可见面——list 数据源 + 连带后果 toast ── */

  describe("#15.5 PENDING 用户可见面——list 数据源 + 连带后果 toast", () => {
    /** 种子：消费者 requires 依赖A——消费者先挂起，依赖加载后 sweep 补载成 ACTIVE */
    async function seedPair(): Promise<void> {
      manifests.set(CONSUMER_ID, manifestOf("消费者", [DEP_A_ID]));
      manifests.set(DEP_A_ID, manifestOf("依赖A"));
      await loadPlugin(CONSUMER_ID, "startup");
      await loadPlugin(DEP_A_ID, "startup");
    }

    beforeEach(() => {
      pushToast.mockClear();
    });

    it("list 数据源含挂起插件 + pendingReason（缺依赖启动 → marketplace 可见 PENDING + 原因可读）", async () => {
      manifests.set(CONSUMER_ID, manifestOf("消费者", [DEP_A_ID]));
      await loadPlugin(CONSUMER_ID, "startup");  // 缺依赖挂起

      const list = getListPluginManifests();
      const mine = list.find((p) => p.pluginId === CONSUMER_ID);
      expect(mine?.pendingReason).toBe(`等待依赖: "${DEP_A_ID}"`);
      expect(mine?.manifest.name).toBe("消费者");
    });

    it("list 数据源含已加载插件（无 pendingReason）；未知插件不进", async () => {
      manifests.set(DEP_A_ID, manifestOf("依赖A"));
      await loadPlugin(DEP_A_ID, "startup");

      const list = getListPluginManifests();
      expect(list.find((p) => p.pluginId === DEP_A_ID)?.pendingReason).toBeUndefined();
      expect(list.some((p) => p.pluginId === MISSING_DEP)).toBe(false);
    });

    it("getLoadedPluginManifests 保持只含已加载（挂起不混入——AppInitializer 计数语义）", async () => {
      manifests.set(CONSUMER_ID, manifestOf("消费者", [DEP_A_ID]));
      await loadPlugin(CONSUMER_ID, "startup");  // 挂起

      expect(getListPluginManifests().some((p) => p.pluginId === CONSUMER_ID)).toBe(true);
      expect(getLoadedPluginManifests().some((p) => p.pluginId === CONSUMER_ID)).toBe(false);
    });

    it("连带卸载 → 挂起插件进 list + 后果 toast（一次连带一次通知）+ 池刷新信号", async () => {
      await seedPair();
      const fired = vi.fn();
      const unsub = onPluginLifecycleChange.event(fired);
      try {
        unloadPlugin(DEP_A_ID, "uninstall");

        const list = getListPluginManifests();
        expect(list.find((p) => p.pluginId === CONSUMER_ID)?.pendingReason).toContain(DEP_A_ID);
        expect(pushToast).toHaveBeenCalledWith(expect.objectContaining({
          message: expect.stringContaining("消费者"),
          severity: "warning",
        }));
        expect(fired).toHaveBeenCalledTimes(1);  // orphan 补发池刷新（连带不发 onDidUninstall）
      } finally {
        unsub();
      }
    });

    it("无连带卸载不弹后果 toast（叶插件只有自身装卸通知）", async () => {
      manifests.set(DEP_A_ID, manifestOf("依赖A"));
      await loadPlugin(DEP_A_ID, "startup");
      pushToast.mockClear();

      unloadPlugin(DEP_A_ID, "uninstall");
      expect(pushToast).not.toHaveBeenCalled();
    });

    it("传递连带 toast 列出全部消费方（深层聚合——一次通知带全名单）", async () => {
      await seedPair();  // 消费者 + 依赖A 均 ACTIVE
      manifests.set(GRANDCHILD_ID, manifestOf("孙消费", [CONSUMER_ID]));
      await loadPlugin(GRANDCHILD_ID, "startup");  // 消费者已就绪 → 直接 ACTIVE
      pushToast.mockClear();

      unloadPlugin(DEP_A_ID, "uninstall");
      expect(pushToast).toHaveBeenCalledTimes(1);  // 聚合——不按消费方逐个弹
      const msg = (pushToast.mock.calls[0][0] as { message: string }).message;
      expect(msg).toContain("孙消费");
      expect(msg).toContain("消费者");
      expect(msg).toContain(DEP_A_ID);
    });
  });

  /* ── E5.8#16：适配 + 五态测试——无依赖/有依赖/缺依赖/循环/重载（#14/#15 已盖大半，这里补零改动兼容 + 重载全景） ── */

  describe("#16 适配 + 五态测试", () => {
    it("零改动兼容：无 requires 插件加载 ACTIVE——零挂起足迹，行为与依赖编排前一致", async () => {
      manifests.set(LEGACY_ID, manifestOf("老插件"));
      await loadPlugin(LEGACY_ID, "startup");
      expect(loadedPluginIds.has(LEGACY_ID)).toBe(true);
      expect(getLoadDiagnostics(LEGACY_ID)).toMatchObject({ loadState: "active", pendingReason: undefined });
      expect(_pendingPlugins.has(LEGACY_ID)).toBe(false);
      expect(getListPluginManifests().find((p) => p.pluginId === LEGACY_ID)?.pendingReason).toBeUndefined();
    });

    it("重载五态全景：挂起 → 依赖出现 ACTIVE（清原因+清登记）→ 依赖消失连带再挂起 → 回归再 ACTIVE", async () => {
      manifests.set(CONSUMER_ID, manifestOf("消费者", [DEP_A_ID]));
      manifests.set(DEP_A_ID, manifestOf("依赖A"));

      await loadPlugin(CONSUMER_ID, "startup");
      expect(getLoadDiagnostics(CONSUMER_ID).loadState).toBe("pending");
      expect(_pendingPlugins.has(CONSUMER_ID)).toBe(true);

      await loadPlugin(DEP_A_ID, "startup");
      expect(getLoadDiagnostics(CONSUMER_ID).loadState).toBe("active");
      expect(getLoadDiagnostics(CONSUMER_ID).pendingReason).toBeUndefined();  // 重载清原因
      expect(_pendingPlugins.has(CONSUMER_ID)).toBe(false);                   // sweep 清登记

      unloadPlugin(DEP_A_ID, "uninstall");
      expect(getLoadDiagnostics(CONSUMER_ID).loadState).toBe("pending");
      expect(getLoadDiagnostics(CONSUMER_ID).pendingReason).toContain(DEP_A_ID);

      await loadPlugin(DEP_A_ID, "reinstall");
      expect(getLoadDiagnostics(CONSUMER_ID).loadState).toBe("active");
      expect(loadedPluginIds.has(CONSUMER_ID)).toBe(true);
    });
  });
});
