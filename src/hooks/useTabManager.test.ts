/**
 * useTabManager 纯函数测试 v4（TabGroup 模型 + SplitNode 递归树）。
 * 设计依据：[V3-Phase3-标签页分屏设计.md §3] + [V3-Phase3-补充-递归分屏.md]
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { FALLBACK_PLUGIN_ID } from "../core/utils/plugin/fallbackPluginId";
import {
  resetPluginCounter,
  resetFallbackCounter,
  createTabDefaults,
  allTabs,
  createInitialTabState,
  reduceCreateTab,
  reduceOpenOrFocus,
  reduceCloseTab,
  reduceMoveTab,
  reduceSplitTab,
  attemptSplitTab,   // M2 生长格 AI#55：分屏回执（noop/reason）——判定单点
  attemptSplitTabAt, // 同上（带落点面板/方向那一路）
  reduceUnsplit,
  reduceResetSplitSizes, // M2 AI#21：分屏比例整体复位
  attemptUpdateSplitSizes, // M2 生长格 AI#53：分屏比例精确设（回执——判定单点）
  reduceUpdateSplitSizes, // 同上的 `.state` 皮（池/鼠标路径）
  reduceSetDirty,
  reduceRestoreLayout,
  reduceRemoveTab,
  reduceInsertTab,
  reduceResourceRenamed,
  reduceResourceDeleted,
  reduceCloseBySourceId,
  reduceRemoveTabsByPlugin,
  reduceRemoveTabsUnderFolder,
  type Tab,
  type TabState,
  type LayoutData,
} from "./useTabManager";
import { getAllLeafGroupIds, treeDepth, MAX_TREE_DEPTH, type SplitNode } from "../core/utils/splitTree";
import { detectDropZone } from "../pool/hooks/tabDragTypes";
import { registerViewPlugin, clearRegistry } from "../pluginLoader/contributions/viewRegistry";
import { resolvePoolTabTitle } from "../core/utils/tabIdentity";
import { setManifestInIndex, forgetPluginIndex, cachePluginMetadata } from "../pluginLoader/resolution/state";

// E5.7#98：分支/叶子窄类型——替代 (x as any) 直取联合专属字段
type BranchNode = Extract<SplitNode, { type: "branch" }>;
type LeafNode = Extract<SplitNode, { type: "leaf" }>;

/* ── 辅助函数 ── */

function w(label: string, workspaceName: string): Tab {
  return createTabDefaults("workspace", { label, workspaceName });
}

function stateWithTabs(...tabs: Tab[]): TabState {
  return {
    groups: [{ id: "main", tabs, activeTabId: tabs[0]?.id ?? "" }],
    activeGroupId: "main",
    root: { type: "leaf", groupId: "main" },
  };
}

/** W7 前初始态的等价 fixture（main 单组带一条欢迎页）——分屏/移动/关闭等用例拿它当填充标签。
 *  W7 起 `createInitialTabState()` 返回**空 main 组**（零标签 ⇒ 池渲染空场），
 *  「有欢迎页」的旧形态自本 helper 显式造出，不再由初态隐式提供。 */
function withWelcome(): TabState {
  const fb = createTabDefaults(FALLBACK_PLUGIN_ID);
  return {
    groups: [{ id: "main", tabs: [fb], activeTabId: fb.id }],
    activeGroupId: "main",
    root: { type: "leaf", groupId: "main" },
  };
}

/** E5.8#44：双面板状态（g1/g2 各 1 tab，branch root）——跨窗口搬迁多面板 fixture（reduceRemoveTab/reduceInsertTab 共用） */
function twoGroupState(): TabState {
  return {
    groups: [
      { id: "g1", tabs: [w("Alpha", "demo_alpha")], activeTabId: "workspace-demo_alpha" },
      { id: "g2", tabs: [w("Beta", "demo_beta")], activeTabId: "workspace-demo_beta" },
    ],
    activeGroupId: "g1",
    root: {
      type: "branch", direction: "horizontal",
      children: [{ type: "leaf", groupId: "g1" }, { type: "leaf", groupId: "g2" }],
      sizes: [50, 50],
    },
  };
}

/** 04 焦点判据 fixture：A/B/C 三格单面板，activeIdx 指定焦点（0=A 1=B 2=C） */
function abcState(activeIdx: number): TabState {
  const tabs = [w("A", "demo_a"), w("B", "demo_b"), w("C", "demo_c")];
  return {
    groups: [{ id: "main", tabs, activeTabId: tabs[activeIdx].id }],
    activeGroupId: "main",
    root: { type: "leaf", groupId: "main" },
  };
}

beforeEach(() => {
  resetPluginCounter("terminal", 0);
  resetPluginCounter("workspace", 0);
  resetFallbackCounter(0);
  // E5.7#67：FALLBACK_META 硬编码表已删——workspace 的 identityField 走生产契约
  // （plugin.json tabBehavior.identityField），测试用 mock 注册表模拟插件声明。
  clearRegistry();
  registerViewPlugin({
    pluginId: "workspace",
    manifest: {
      name: "workspace",
      version: "1.0.0",
      tabBehavior: { identityField: "workspaceName" },
    },
  });
});

/* ── 工厂函数 ── */

describe("createTabDefaults", () => {
  it("终端 ID 递增", () => {
    expect(createTabDefaults("terminal").id).toBe("terminal-1");
    expect(createTabDefaults("terminal").id).toBe("terminal-2");
  });

  it("workspace ID 来自 workspaceName", () => {
    expect(createTabDefaults("workspace", { workspaceName: "heart_rate" }).id).toBe("workspace-heart_rate");
  });

  it("初始 dirty=false", () => {
    expect(createTabDefaults("terminal").dirty).toBe(false);
  });

  // E5#58：label 不查壳内硬编码表——manifest.name 优先，未知类型兜底 type（E5.7#67 表已整删）
  it("label 默认值", () => {
    expect(createTabDefaults("terminal").label).toBe("terminal");
    expect(createTabDefaults("workspace").label).toBe("workspace");
    expect(createTabDefaults("workspace", { workspaceName: "PID" }).label).toBe("PID");
    expect(createTabDefaults("settings").label).toBe("settings");
  });
});

/* ── 插件详情页标签名——第二名称来源（2026-09-30 用户实机立案） ──
 * 病灶：详情页标签名此前只查 viewRegistry，而该表只登记「有 entry 或侧栏容器」的插件
 * ⇒ 纯数据插件（主题/语言）与被禁用插件恒不在册，标签一律退成壳兜底文案「插件详情」
 * （用户可见：装的主题、随包语言包，详情页标题全叫「插件详情」）。
 * 用例驱动真索引 / 真缓存（setManifestInIndex / cachePluginMetadata）——不 mock 模块，走壳真实读取路径。 */
describe("插件详情页标签名——第二名称来源", () => {
  const DATA_PLUGIN_ID = "demo-theme";
  const GHOST_ID = "demo-ghost";
  /** 元数据缓存没有删除入口（那份缓存是「故意留的」——卸载后市场仍要能浏览详情），
   *  故缓存用例自带一个 id，不与上面几条共用。 */
  const CACHED_ID = "demo-cached";

  afterEach(() => {
    forgetPluginIndex(DATA_PLUGIN_ID);
    forgetPluginIndex(GHOST_ID);
  });

  it("纯数据插件（不在 viewRegistry、在索引）⇒ 用真名", () => {
    setManifestInIndex(DATA_PLUGIN_ID, { name: "Demo Theme", version: "1.0.0" });
    expect(createTabDefaults("plugin-detail", { pluginId: DATA_PLUGIN_ID }).label).toBe("Demo Theme");
  });

  it("detailPluginId 传入走同一条路（调用方两种字段写法等价）", () => {
    setManifestInIndex(DATA_PLUGIN_ID, { name: "Demo Theme", version: "1.0.0" });
    expect(createTabDefaults("plugin-detail", { detailPluginId: DATA_PLUGIN_ID }).label).toBe("Demo Theme");
  });

  it("viewRegistry 命中优先于索引（注册表里的 manifest 是运行时真相）", () => {
    registerViewPlugin({ pluginId: DATA_PLUGIN_ID, manifest: { name: "Registry Name", version: "1.0.0" } });
    setManifestInIndex(DATA_PLUGIN_ID, { name: "Index Name", version: "1.0.0" });
    expect(createTabDefaults("plugin-detail", { pluginId: DATA_PLUGIN_ID }).label).toBe("Registry Name");
  });

  // 禁用不改住所（只记名单、目录原地不动）⇒ 重启后 .disabled/ 里的插件不在索引里了，
  // 而市场「已禁用」列表照样开它的详情页——那一份名字只在元数据缓存里。
  it("跨会话被禁用的插件（索引已无、元数据缓存在）⇒ 从缓存取真名", () => {
    cachePluginMetadata(CACHED_ID, { name: "Demo Cached", version: "1.0.0" }, "disabled");
    expect(createTabDefaults("plugin-detail", { pluginId: CACHED_ID }).label).toBe("Demo Cached");
  });

  it("两条来源都不认识 ⇒ 仍退壳兜底文案", () => {
    expect(createTabDefaults("plugin-detail", { pluginId: GHOST_ID }).label).toBe("插件详情");
  });

  it("非详情页不吃索引兜底（索引不是「类型名」的第二来源）", () => {
    setManifestInIndex(DATA_PLUGIN_ID, { name: "Demo Theme", version: "1.0.0" });
    expect(createTabDefaults(DATA_PLUGIN_ID).label).toBe(DATA_PLUGIN_ID);
  });
});

/* ── E5.8#37.9.1：池 tab title 推流二次解析（标签栏"设置"仍中文根因回归） ── */

describe("resolvePoolTabTitle（E5.8#37.9.1）", () => {
  const dict: Record<string, string> = { "设置": "Settings", "插件市场": "Marketplace" };
  const t = (k: string) => dict[k] ?? k;

  it("label === manifest.name（zh 创建/zh 保存后切 en 的旧快照）→ 重解析为现语言", () => {
    // 用户实机报告：en 界面下标签栏「设置」仍中文——label 是 manifest.name 原样落盘，此处兜底重解析
    expect(resolvePoolTabTitle("设置", "设置", t)).toBe("Settings");
    expect(resolvePoolTabTitle("插件市场", "插件市场", t)).toBe("Marketplace");
  });

  it("label === t(manifest.name)（已是翻译名——en 保存后切 zh 恢复）→ 幂等重解析回现语言", () => {
    expect(resolvePoolTabTitle("Settings", "设置", t)).toBe("Settings");
  });

  it("identityField 派生 label（文件名/工作区名）→ 原样不动", () => {
    expect(resolvePoolTabTitle("main.ts", "编辑器", t)).toBe("main.ts");
    expect(resolvePoolTabTitle("PID", "workspace", t)).toBe("PID");
  });

  it("缺 key（第三方插件名字无译文）→ parseMissingKeyHandler 原样返回不吞掉", () => {
    expect(resolvePoolTabTitle("我的工具箱", "我的工具箱", t)).toBe("我的工具箱");
  });

  it("无 manifestName（非插件 tab）→ 透传", () => {
    expect(resolvePoolTabTitle("欢迎", undefined, t)).toBe("欢迎");
  });
});

/* ── 初始状态 ── */

describe("createInitialTabState（W7 起零标签）", () => {
  it("main 单空组 + 单 leaf——不再自动生成欢迎页保底标签", () => {
    const state = createInitialTabState();
    expect(state.groups).toHaveLength(1);
    expect(state.groups[0].id).toBe("main");
    expect(state.groups[0].tabs).toHaveLength(0);
    expect(state.groups[0].activeTabId).toBe("");
    expect(state.activeGroupId).toBe("main");
    expect(state.root.type).toBe("leaf");
    expect((state.root as LeafNode).groupId).toBe("main");
  });

  it("🔴 负控：五条清空路径末条移除后都不复活欢迎页（零标签 ⇒ 空组）", () => {
    // ① 逐个关（reduceCloseTab 单面板末条——原先是「自动替换为欢迎页」）
    const seed = withWelcome();
    const closed = reduceCloseTab(seed, seed.groups[0].tabs[0].id);
    expect(closed.closed).toBe(true);
    expect(allTabs(closed.state!)).toHaveLength(0);
    expect(closed.state!.groups[0].tabs).toHaveLength(0);
    expect(closed.state!.groups[0].activeTabId).toBe("");
    expect(closed.newActiveTabId).toBe("");
    // ② 按 sourceId 关 / ③ file:deleted / ④ 插件卸载 / ⑤ 文件夹移除
    const one = () => stateWithTabs(resTab("t1", "E:/demo/a.txt", "Alpha"));
    expect(allTabs(reduceCloseBySourceId(one(), "E:/demo/a.txt"))).toHaveLength(0);
    expect(allTabs(reduceResourceDeleted(one(), "E:/demo/a.txt"))).toHaveLength(0);
    expect(allTabs(reduceRemoveTabsByPlugin(stateWithTabs(resTab("t1", "E:/demo/a.txt", "Alpha", { pluginId: "demo-plugin" })), "demo-plugin"))).toHaveLength(0);
    expect(allTabs(reduceRemoveTabsUnderFolder(one(), "E:/demo"))).toHaveLength(0);
    // 负控：全流程里没有任何一处造出 fallback 标签
    expect(closed.state!.groups.every((g) => g.tabs.every((t) => t.type !== FALLBACK_PLUGIN_ID))).toBe(true);
  });
});

/* ── reduceCreateTab ── */

describe("reduceCreateTab", () => {
  it("创建终端标签页", () => {
    const prev = withWelcome();
    const r = reduceCreateTab(prev, "terminal");
    expect(r.state.groups[0].tabs).toHaveLength(2);
    expect(r.state.groups[0].activeTabId).toBe(r.createdId);
  });

  it("workspace 去重——同名聚焦不新增", () => {
    const prev = withWelcome();
    const r1 = reduceCreateTab(prev, "workspace", { workspaceName: "heart_rate" });
    expect(r1.state.groups[0].tabs).toHaveLength(2);

    const r2 = reduceCreateTab(r1.state, "workspace", { workspaceName: "heart_rate" });
    expect(r2.state.groups[0].tabs).toHaveLength(2);
    expect(r2.createdId).toBe(r1.createdId);
  });

  it("settings 单例去重（plugin.json tabBehavior.singleton 在集成环境中保证）", () => {
    // B78 归一化：旧测试依赖 generateId 硬编码返回相同字符串伪装单例（id 碰撞）。
    // 真正的单例由 getTabBehavior().singleton 在运行时保证（plugin.json 声明）。
    // 测试环境 viewRegistry 未初始化，singleton 标记不可用。
    // autoId 保证即使 reducer 未阻止创建（因 singleton 标记缺失），id 也不会碰撞。
    const prev = withWelcome();
    const r1 = reduceCreateTab(prev, "settings");
    const r2 = reduceCreateTab(r1.state, "settings");
    // B78 fix：autoId 计数器保证每次调用生成唯一 id，不会像旧 ("settings") 那样碰撞
    expect(r2.createdId).not.toBe(r1.createdId);
    // 两个标签页都存在于状态中（无 viewRegistry singleton 标记时 reducer 不阻止创建）
    expect(allTabs(r2.state)).toHaveLength(allTabs(r1.state).length + 1);
  });

  it("分屏时在 activeGroupId 组中创建", () => {
    // Phase 5 rootfix：预览替换改为 opt-IN——默认不复用已有 tab
    let state = withWelcome();
    const tr = reduceCreateTab(state, "terminal");
    state = reduceSplitTab(tr.state, tr.createdId, "horizontal");
    // Group A: [welcome], Group B: [terminal], active=Group B
    const r = reduceCreateTab(state, "workspace", { workspaceName: "pid" });
    // 不复用 terminal 预览 → [welcome] + [terminal] + [workspace] = 3
    expect(allTabs(r.state)).toHaveLength(3);
  });

  it("显式 pinned:false 触发预览替换（opt-IN）", () => {
    // Phase 5：pinned:false 显式请求预览模式 → 替换组内 unpinned tab
    let state = withWelcome();
    // terminal 默认 pinned:false（createTabDefaults）
    const tr = reduceCreateTab(state, "terminal");
    state = tr.state;
    expect(allTabs(state)).toHaveLength(2); // [welcome, terminal]
    // 显式 pinned:false 开 workspace → 预览替换 terminal
    const r = reduceCreateTab(state, "workspace", { workspaceName: "pid", pinned: false });
    expect(allTabs(r.state)).toHaveLength(2); // [welcome, workspace]——terminal 被替换
  });
});

/* ── reduceOpenOrFocus ── */

describe("reduceOpenOrFocus", () => {
  it("终端存在则聚焦", () => {
    let state = withWelcome();               // [welcome]
    state = reduceCreateTab(state, "terminal").state;   // [welcome, terminal-1]
    const r = reduceOpenOrFocus(state, "terminal", "terminal-1");
    expect(r.focusedId).toBe("terminal-1");
  });

  it("终端不存在则隐式创建", () => {
    const prev = stateWithTabs(w("PID", "pid"));
    const r = reduceOpenOrFocus(prev, "terminal");
    expect(r.focusedId).not.toBeNull();
    expect(allTabs(r.state).some((t) => t.type === "terminal")).toBe(true);
  });

  it("workspace 不存在则隐式创建（Phase 4 归一化——任何 type 都可隐式创建）", () => {
    const prev = withWelcome();
    const r = reduceOpenOrFocus(prev, "workspace");
    expect(r.focusedId).not.toBeNull();
    expect(allTabs(r.state).some((t) => t.type === "workspace")).toBe(true);
  });
});

/* ── reduceMoveTab ── */

describe("reduceMoveTab", () => {
  it("移动标签页到另一个组", () => {
    let state = withWelcome();                      // [welcome]
    state = reduceCreateTab(state, "terminal").state;         // [welcome, terminal-1]
    state = reduceSplitTab(state, "terminal-1", "horizontal"); // [welcome] | [terminal-1]

    expect(state.groups).toHaveLength(2);
    const leafIds = getAllLeafGroupIds(state.root);
    expect(leafIds).toHaveLength(2);

    const g1 = state.groups.find((g) => g.id === leafIds[0])!;
    const g2 = state.groups.find((g) => g.id === leafIds[1])!;
    expect(g1).toBeDefined();
    expect(g2).toBeDefined();
    expect(g1.tabs).toHaveLength(1);
    expect(g2.tabs).toHaveLength(1);

    const next = reduceMoveTab(state, g1.tabs[0].id, g2.id);
    const g2New = next.groups.find((g) => g.id === g2.id)!;
    expect(g2New.tabs).toHaveLength(2);
  });

  it("E5.8#51：跨组拖拽带插入缝 → 中插（竖杠落点），缺省 append 末尾", () => {
    // 构造：左组 [welcome, demo-view-2]、右组 [demo-view-1]——把 demo-view-2 拖到右组中间（insertIndex 0）
    let state = withWelcome();
    state = reduceCreateTab(state, "demo-view").state; // [welcome, demo-view-1]
    state = reduceCreateTab(state, "demo-view").state; // [welcome, demo-view-1, demo-view-2]
    state = reduceSplitTab(state, "demo-view-1", "horizontal"); // [welcome, demo-view-2] | [demo-view-1]
    const leafIds = getAllLeafGroupIds(state.root);
    const gLeft = state.groups.find((g) => g.id === leafIds[0])!;
    const gRight = state.groups.find((g) => g.id === leafIds[1])!;

    // 带插入缝 → 中插：目标组 [demo-view-1] ← demo-view-2 @0 → [demo-view-2, demo-view-1]
    const mid = reduceMoveTab(state, gLeft.tabs[1].id, gRight.id, 0);
    const gRightMid = mid.groups.find((g) => g.id === gRight.id)!;
    expect(gRightMid.tabs.map((t) => t.id)).toEqual(["demo-view-2", "demo-view-1"]);

    // 缺省 → append 末尾（第三方裸 moveTab 语义）：目标组 [demo-view-1] ← demo-view-2 → [demo-view-1, demo-view-2]
    const end = reduceMoveTab(state, gLeft.tabs[1].id, gRight.id);
    const gRightEnd = end.groups.find((g) => g.id === gRight.id)!;
    expect(gRightEnd.tabs.map((t) => t.id)).toEqual(["demo-view-1", "demo-view-2"]);
  });
});

/* ── reduceCloseTab ── */

describe("reduceCloseTab", () => {
  it("关闭普通标签页", () => {
    let state = withWelcome();
    state = reduceCreateTab(state, "workspace", { workspaceName: "pid" }).state;
    const r = reduceCloseTab(state, "workspace-pid");
    expect(r.closed).toBe(true);
    expect(allTabs(r.state!)).toHaveLength(1);
  });

  it("W7：关闭最后一个标签页 → 保留空组（不再自动替换为欢迎页——零标签 ⇒ 池渲染空场）", () => {
    const prev = withWelcome();
    const r = reduceCloseTab(prev, prev.groups[0].tabs[0].id);
    expect(r.closed).toBe(true);
    expect(allTabs(r.state!)).toHaveLength(0);
    expect(r.state!.groups[0].tabs).toHaveLength(0);
    expect(r.state!.groups[0].activeTabId).toBe("");
    expect(r.newActiveTabId).toBe("");
    // 负控：欢迎页没有「重生」
    expect(allTabs(r.state!).some((t) => t.type === FALLBACK_PLUGIN_ID)).toBe(false);
  });

  it("dirty 标签页拒绝关闭", () => {
    let state = withWelcome();
    state = reduceCreateTab(state, "workspace", { workspaceName: "pid" }).state;
    state = reduceSetDirty(state, "workspace-pid", true);
    const r = reduceCloseTab(state, "workspace-pid");
    expect(r.closed).toBe(false);
    expect(r.reason).toBe("dirty");
  });

  it("关闭分屏面板中的标签页 → unsplit", () => {
    let state = withWelcome();                     // [welcome]
    state = reduceCreateTab(state, "terminal").state;        // [welcome, terminal-1]
    state = reduceSplitTab(state, "terminal-1", "horizontal"); // [welcome] | [terminal-1]
    const r = reduceCloseTab(state, "terminal-1");
    expect(r.closed).toBe(true);
    expect(getAllLeafGroupIds(r.state!.root)).toHaveLength(1);
  });

  // ── 04「标签栏关闭焦点跳第一格」（2026-09-27 用户拍板）──

  it("🔴 关非焦点标签 ⇒ 焦点原地不动（关 style.css 不抢 app123.c 的焦点）", () => {
    const tabs = abcState(2).groups[0].tabs; // 焦点在 C
    const r = reduceCloseTab(abcState(2), tabs[0].id); // 关掉非焦点的 A
    expect(r.closed).toBe(true);
    expect(r.state!.groups[0].activeTabId).toBe(tabs[2].id); // 仍在 C
  });

  it("🔴 关掉焦点标签 ⇒ 去右邻（对标 VS Code；旧实现恒落第一格）", () => {
    const tabs = abcState(1).groups[0].tabs; // 焦点在中间的 B
    const r = reduceCloseTab(abcState(1), tabs[1].id);
    expect(r.closed).toBe(true);
    expect(r.state!.groups[0].activeTabId).toBe(tabs[2].id); // 右邻 C
  });

  it("🔴 关掉末尾的焦点标签 ⇒ 右邻没了退左邻", () => {
    const tabs = abcState(2).groups[0].tabs;
    const r = reduceCloseTab(abcState(2), tabs[2].id);
    expect(r.closed).toBe(true);
    expect(r.state!.groups[0].activeTabId).toBe(tabs[1].id); // 左邻 B
  });
});

/* ── reduceSplitTab + reduceUnsplit ── */

describe("reduceSplitTab", () => {
  it("创建分屏：拆出一个标签页到新 leaf", () => {
    let state = withWelcome();                    // [welcome]
    state = reduceCreateTab(state, "terminal").state;       // [welcome, terminal-1]
    const next = reduceSplitTab(state, "terminal-1", "horizontal");
    const leafIds = getAllLeafGroupIds(next.root);
    expect(leafIds).toHaveLength(2);
    expect(next.root.type).toBe("branch");
    expect((next.root as BranchNode).direction).toBe("horizontal");
    expect((next.root as BranchNode).sizes).toEqual([50, 50]);
    expect(next.groups).toHaveLength(2);
  });

  it("源组只有 1 个 tab → 阻止分屏（防止空面板）", () => {
    // 先创建 2-pane，然后尝试拆分 solo-tab 组
    let state = withWelcome();                     // [welcome]
    state = reduceCreateTab(state, "terminal").state;        // [welcome, t1]
    state = reduceSplitTab(state, "terminal-1", "horizontal"); // [welcome] | [t1]
    // terminal-1 在 solo 组中（只有它自己），尝试分屏它 → 应被阻止
    const next = reduceSplitTab(state, "terminal-1", "vertical");
    expect(getAllLeafGroupIds(next.root)).toHaveLength(2);   // 仍是 2 pane，未变
  });

  it("3-pane：源组有 ≥2 个 tab 时可创建多级分屏", () => {
    let state = withWelcome();                      // [welcome]
    state = reduceCreateTab(state, "terminal").state;         // [welcome, t1]
    state = reduceCreateTab(state, "terminal").state;         // [welcome, t1, t2]
    state = reduceSplitTab(state, "terminal-2", "horizontal"); // [welcome,t1] | [t2]
    // 源组（[welcome,t1]）还有 2 个 tab，可以继续分屏
    state = reduceSplitTab(state, "terminal-1", "vertical");   // [welcome] | [t1]  (左侧上下) | [t2] 右侧
    const leafIds = getAllLeafGroupIds(state.root);
    expect(leafIds).toHaveLength(3);
    expect(state.root.type).toBe("branch");
  });

  it("深度限制：超过 MAX_TREE_DEPTH 忽略", () => {
    // 创建深度为 MAX_TREE_DEPTH 的树，再分裂应返回原状态
    let state = withWelcome();
    // 每分裂一次深度+1
    for (let i = 0; i < 4; i++) {
      state = reduceCreateTab(state, "terminal").state;
      const lastTab = state.groups.find((g) => g.id === state.activeGroupId)?.tabs.slice(-1)[0];
      if (lastTab && i < 3) {
        state = reduceSplitTab(state, lastTab.id, "vertical");
      }
    }
    // 第4次 split 应被忽略（深度已达上限）
    // 此时应有 <= 4 个 leaf
    expect(getAllLeafGroupIds(state.root).length).toBeLessThanOrEqual(4);
  });
});

/* ── M2 生长格 AI#55：分屏回执（attemptSplitTab / attemptSplitTabAt）──
 * 「没做成」过去是静默：单标签组自切回原状态、超层回原状态、tabId 找不到回原状态——三种**同形**，
 * 命令面于是只有 `ok=true`，AI 只能靠截图猜。本组钉住三件事：
 *   ① 拒绝要**说得出是哪种**（`noop` ＋ `reason`，字面量可分辨）；
 *   ② 被拒的那几次**状态引用不变**（没白吃组号、没造空组、同一条标签不会同时在两个组里）；
 *   ③ 既有**成功语义一字不改**（自切：源组少一条、新叶多一条；跨组：源叶被摘、标签以兄弟叶并入）。 */

/** AI#55：一棵已达 MAX_TREE_DEPTH 的树（4 级；每个叶子 2 条标签 ⇒ 拒绝的原因只可能是「深度」） */
function depthMaxState(): TabState {
  const groups: TabState["groups"] = ["g1", "g2", "g3", "g4"].map((id, i) => {
    const tabs = [w(`L${i}a`, "ws"), w(`L${i}b`, "ws")];
    return { id, tabs, activeTabId: tabs[0].id };
  });
  const leaf = (id: string): SplitNode => ({ type: "leaf", groupId: id });
  return {
    groups,
    activeGroupId: "g1",
    root: {
      type: "branch",
      direction: "vertical",
      sizes: [50, 50],
      children: [
        {
          type: "branch",
          direction: "vertical",
          sizes: [50, 50],
          children: [
            { type: "branch", direction: "vertical", sizes: [50, 50], children: [leaf("g1"), leaf("g2")] },
            leaf("g3"),
          ],
        },
        leaf("g4"),
      ],
    },
  };
}

describe("attemptSplitTab —— AI#55 分屏回执", () => {
  it("正常自切：`ok` 且**无** noop（= 树真的变了），源组少一条、新叶多一条", () => {
    let state = withWelcome();                      // [welcome]
    const fallbackId = state.groups[0].tabs[0].id;            // 欢迎页 id 由计数器生成——从状态里取，不写死
    state = reduceCreateTab(state, "terminal").state;         // [welcome, t1]
    state = reduceCreateTab(state, "terminal").state;         // [welcome, t1, t2]

    const attempt = attemptSplitTab(state, "terminal-1", "horizontal");

    expect(attempt.result).toEqual({ ok: true });             // 无 noop 字段
    expect(getAllLeafGroupIds(attempt.state.root)).toHaveLength(2);
    const source = attempt.state.groups.find((g) => g.tabs.some((t) => t.id === fallbackId))!;
    expect(source.tabs.map((t) => t.id)).toEqual([fallbackId, "terminal-2"]);
    const moved = attempt.state.groups.find((g) => g.tabs.some((t) => t.id === "terminal-1"))!;
    expect(moved.tabs).toHaveLength(1);
  });

  it("源组只剩这一条标签 ⇒ noop ＋ reason:'single-tab'，且状态引用不变（不造空组、不双开）", () => {
    let state = withWelcome();
    state = reduceCreateTab(state, "terminal").state;          // [welcome, t1]
    state = reduceSplitTab(state, "terminal-1", "horizontal"); // [welcome] | [t1]

    const attempt = attemptSplitTab(state, "terminal-1", "vertical");

    expect(attempt.result).toEqual({ ok: true, noop: true, reason: "single-tab" });
    expect(attempt.state).toBe(state);                         // 同一引用 ⇒ 树/组表都没动
    // 老路在单叶树上会「同一条标签留在两个组里」（同 id 双开）——现在这条不可能
    expect(attempt.state.groups.filter((g) => g.tabs.some((t) => t.id === "terminal-1"))).toHaveLength(1);
  });

  it("树深已达 MAX_TREE_DEPTH ⇒ noop ＋ reason:'max-depth'", () => {
    const state = depthMaxState();
    expect(treeDepth(state.root)).toBe(MAX_TREE_DEPTH);

    const attempt = attemptSplitTab(state, state.groups[0].tabs[0].id, "horizontal");

    expect(attempt.result).toEqual({ ok: true, noop: true, reason: "max-depth" });
    expect(attempt.state).toBe(state);
  });

  it("tabId 不在任何组 ⇒ noop ＋ reason:'no-such-tab'（多数 = 它刚被关掉）", () => {
    let state = withWelcome();
    state = reduceCreateTab(state, "terminal").state;

    const attempt = attemptSplitTab(state, "已经关掉的-id", "horizontal");

    expect(attempt.result).toEqual({ ok: true, noop: true, reason: "no-such-tab" });
    expect(attempt.state).toBe(state);
  });
});

describe("attemptSplitTabAt —— AI#55 分屏回执（跨组拖拽）", () => {
  it("拖到别组边缘：源叶被摘、标签以兄弟叶并入——既有语义不变，回执 `ok`", () => {
    let state = withWelcome();
    state = reduceCreateTab(state, "terminal").state;           // [welcome, t1]
    state = reduceCreateTab(state, "terminal").state;           // [welcome, t1, t2]
    const targetGroupId = state.groups[0].id;                   // 目标 = 源组（拖到自己的边缘）
    state = reduceSplitTab(state, "terminal-2", "horizontal");   // [welcome,t1] | [t2]
    const fromGroupId = state.groups.find((g) => g.tabs.some((t) => t.id === "terminal-2"))!.id;

    const attempt = attemptSplitTabAt(state, "terminal-2", "vertical", targetGroupId, "right");

    expect(attempt.result).toEqual({ ok: true });
    expect(attempt.state.groups.some((g) => g.id === fromGroupId)).toBe(false); // 源叶被摘
    const owner = attempt.state.groups.find((g) => g.tabs.some((t) => t.id === "terminal-2"))!;
    expect(owner.id).not.toBe(fromGroupId);                     // 落进新叶
    expect(getAllLeafGroupIds(attempt.state.root)).toHaveLength(2); // 摘一叶 + 添一叶
    expect(owner.tabs).toHaveLength(1);
  });

  it("落点面板已消失 ⇒ noop ＋ reason:'no-such-target'", () => {
    let state = withWelcome();
    state = reduceCreateTab(state, "terminal").state;           // [welcome, t1]

    const attempt = attemptSplitTabAt(state, "terminal-1", "horizontal", "group-已经没了", "right");

    expect(attempt.result).toEqual({ ok: true, noop: true, reason: "no-such-target" });
    expect(attempt.state).toBe(state);
  });
});

describe("reduceUnsplit", () => {
  it("取消分屏——指定 groupId 的 leaf 被移除", () => {
    let state = withWelcome();                     // [welcome]
    state = reduceCreateTab(state, "terminal").state;        // [welcome, terminal-1]
    state = reduceSplitTab(state, "terminal-1", "horizontal"); // [welcome] | [terminal-1]
    const leafIds = getAllLeafGroupIds(state.root);
    const next = reduceUnsplit(state, leafIds[1]); // unsplit the new group
    expect(getAllLeafGroupIds(next.root)).toHaveLength(1);
    expect(next.groups).toHaveLength(1);
  });
});

/* ── 嵌套对照 fixture（两个 describe 共用：AI#21 整体复位 ／ AI#53 精确设）── */

/** root(70/30) → 左 g1；右 branch(20/80) → g2/g3。
 *  先序分支号：**1 = root**、**2 = 右侧内层**（`_updateBranchSizesByIndex` 的前序计数）。 */
function nestedState(): TabState {
  return {
    groups: [
      { id: "g1", tabs: [w("Alpha", "demo_alpha")], activeTabId: "workspace-demo_alpha" },
      { id: "g2", tabs: [w("Beta", "demo_beta")], activeTabId: "workspace-demo_beta" },
      { id: "g3", tabs: [w("Gamma", "demo_gamma")], activeTabId: "workspace-demo_gamma" },
    ],
    activeGroupId: "g1",
    root: {
      type: "branch", direction: "horizontal",
      children: [
        { type: "leaf", groupId: "g1" },
        {
          type: "branch", direction: "vertical",
          children: [{ type: "leaf", groupId: "g2" }, { type: "leaf", groupId: "g3" }],
          sizes: [20, 80],
        },
      ],
      sizes: [70, 30],
    },
  };
}

/* ── reduceResetSplitSizes（M2 AI#21：分屏比例整体复位的非鼠标路径）── */

describe("reduceResetSplitSizes", () => {
  it("所有分支递归回 50/50（含嵌套分支），叶子与分组原样保留", () => {
    const next = reduceResetSplitSizes(nestedState());
    const root = next.root as BranchNode;
    expect(root.sizes).toEqual([50, 50]);
    expect((root.children[1] as BranchNode).sizes).toEqual([50, 50]);
    // 叶子结构不动
    expect((root.children[0] as LeafNode).groupId).toBe("g1");
    expect(getAllLeafGroupIds(next.root)).toEqual(["g1", "g2", "g3"]);
    expect(next.groups).toHaveLength(3);
    expect(next.activeGroupId).toBe("g1");
  });

  it("未分屏（root = leaf）→ 原状态引用（React bailout，零重渲染）", () => {
    const state = stateWithTabs(w("Alpha", "demo_alpha"));
    expect(reduceResetSplitSizes(state)).toBe(state);
  });

  it("全分支已是 50/50 → 原状态引用（幂等，不产生新对象）", () => {
    const state = twoGroupState(); // root sizes [50, 50]
    expect(reduceResetSplitSizes(state)).toBe(state);
  });

  it("仅一层不均衡 → 只换 root 引用，未变动的子树引用保持", () => {
    const state = nestedState();
    const rootBefore = state.root as BranchNode;
    const leftLeafBefore = rootBefore.children[0];
    const rightBranchBefore = rootBefore.children[1] as BranchNode;

    const next = reduceResetSplitSizes(state);
    const rootAfter = next.root as BranchNode;

    expect(rootAfter).not.toBe(rootBefore);
    expect(rootAfter.sizes).toEqual([50, 50]);
    expect(rootAfter.children[0]).toBe(leftLeafBefore); // 叶子原引用
    expect(rootAfter.children[1]).not.toBe(rightBranchBefore); // 子分支比例变了 → 新对象
  });

  it("对已有分屏状态调用两次 → 第二次起原引用（幂等收敛）", () => {
    const once = reduceResetSplitSizes(nestedState());
    expect(reduceResetSplitSizes(once)).toBe(once);
  });
});

/* ── attemptUpdateSplitSizes（M2 生长格 `AI#53`：分屏比例精确设 ＋ 回执）── */

describe("attemptUpdateSplitSizes —— AI#53 设比例回执", () => {
  it("anchor 路（AI 的常用形）：该组所在分支精确设成 [70, 30]，组表与叶子一字不动", () => {
    const state = twoGroupState(); // root = branch(g1 | g2)，sizes [50, 50]
    const attempt = attemptUpdateSplitSizes(state, "g2", [70, 30]);

    expect(attempt.result).toEqual({ ok: true }); // 无 noop ⇒ 写入发生
    const root = attempt.state.root as BranchNode;
    expect(root.sizes).toEqual([70, 30]);
    expect(getAllLeafGroupIds(attempt.state.root)).toEqual(["g1", "g2"]);
    expect(attempt.state.groups).toBe(state.groups); // 组表原引用（只换树）
  });

  it("branchIndex 路（深树精确）：内层分支 [20, 80] → [30, 70]，外层 [70, 30] 不动", () => {
    const attempt = attemptUpdateSplitSizes(nestedState(), "", [30, 70], 2);

    expect(attempt.result).toEqual({ ok: true });
    const root = attempt.state.root as BranchNode;
    expect((root.children[1] as BranchNode).sizes).toEqual([30, 70]);
    expect(root.sizes).toEqual([70, 30]); // 外层未被牵连
  });

  it("两路同给 ⇒ branchIndex 优先（既有 B35 语义不变）", () => {
    // anchor 指向外层（g1 的父分支 = root），branchIndex 指向内层 ⇒ 改的是内层
    const attempt = attemptUpdateSplitSizes(nestedState(), "g1", [30, 70], 2);

    const root = attempt.state.root as BranchNode;
    expect((root.children[1] as BranchNode).sizes).toEqual([30, 70]);
    expect(root.sizes).toEqual([70, 30]);
  });

  it("未分屏（root = leaf）⇒ noop ＋ reason:'not-split'，状态引用不变", () => {
    const state = stateWithTabs(w("Alpha", "demo_alpha"));
    const attempt = attemptUpdateSplitSizes(state, "main", [70, 30]);

    expect(attempt.result).toEqual({ ok: true, noop: true, reason: "not-split" });
    expect(attempt.state).toBe(state);
  });

  it("anchor 不在树里 ⇒ noop ＋ reason:'no-such-group'（⛔ 不静默当没给）", () => {
    const state = twoGroupState();
    const attempt = attemptUpdateSplitSizes(state, "已经合掉的-g9", [70, 30]);

    expect(attempt.result).toEqual({ ok: true, noop: true, reason: "no-such-group" });
    expect(attempt.state).toBe(state);
  });

  it("只给 branchIndex 而树里没这条 ⇒ noop ＋ reason:'no-such-branch'", () => {
    const state = nestedState(); // 只有 1、2 两条分支
    const attempt = attemptUpdateSplitSizes(state, "", [70, 30], 9);

    expect(attempt.result).toEqual({ ok: true, noop: true, reason: "no-such-branch" });
    expect(attempt.state).toBe(state);
  });

  it("载荷坏 ⇒ ok:false ＋ reason:'bad-sizes'（形状坏在调用方，状态引用不变）", () => {
    const state = twoGroupState();
    const bad: unknown[] = [[], [70], [70, 30, 10], ["a", 30], [-1, 101], [0, 100], [Number.NaN, 50], "70,30", null];

    for (const sizes of bad) {
      const attempt = attemptUpdateSplitSizes(state, "g2", sizes as [number, number]);
      expect(attempt.result, `sizes=${JSON.stringify(sizes)}`).toEqual({ ok: false, noop: true, reason: "bad-sizes" });
      expect(attempt.state).toBe(state);
    }
  });

  it("branchIndex 非整数 ⇒ ok:false ＋ reason:'bad-branch-index'（字符串/小数都算载荷坏）", () => {
    const state = nestedState();
    for (const idx of ["2", 1.5, Number.NaN]) {
      const attempt = attemptUpdateSplitSizes(state, "g1", [70, 30], idx as unknown as number);
      expect(attempt.result, `branchIndex=${String(idx)}`).toEqual({ ok: false, noop: true, reason: "bad-branch-index" });
      expect(attempt.state).toBe(state);
    }
  });

  it("定位两路都没给（空 anchor ＋ 无 index）⇒ ok:false ＋ reason:'no-anchor-id'", () => {
    const state = twoGroupState();
    const attempt = attemptUpdateSplitSizes(state, "", [70, 30]);

    expect(attempt.result).toEqual({ ok: false, noop: true, reason: "no-anchor-id" });
    expect(attempt.state).toBe(state);
  });

  it("`≤ 0` 的 branchIndex 视作**没给**（老代码 `> 0` 守卫的兼容）⇒ 走 anchor 路照样命中", () => {
    const attempt = attemptUpdateSplitSizes(nestedState(), "g1", [70, 30], 0);

    expect(attempt.result).toEqual({ ok: true });
    expect((attempt.state.root as BranchNode).sizes).toEqual([70, 30]); // root（g1 的父分支）
  });

  it("设成与当前相同的值：`ok` 无 noop——「写入发生」与「值变了」是两件事（⛔ 不冒充没做）", () => {
    const state = twoGroupState(); // 已是 [50, 50]
    const attempt = attemptUpdateSplitSizes(state, "g1", [50, 50]);

    expect(attempt.result).toEqual({ ok: true });
    expect((attempt.state.root as BranchNode).sizes).toEqual([50, 50]);
  });

  it("`.state` 皮（`reduceUpdateSplitSizes`，池/鼠标路径）与 attempt 结果同一份树", () => {
    const state = nestedState();
    const skinned = reduceUpdateSplitSizes(state, "", [40, 60], 2);
    const attempted = attemptUpdateSplitSizes(state, "", [40, 60], 2).state;

    expect(skinned).toEqual(attempted);
    expect(((skinned.root as BranchNode).children[1] as BranchNode).sizes).toEqual([40, 60]);
  });
});

/* ── reduceRestoreLayout ── */

describe("reduceRestoreLayout", () => {
  it("恢复保存的布局（新格式 root）", () => {
    const term = createTabDefaults("terminal");
    term.id = "terminal-1";
    const ws = w("PID", "pid");

    const saved: LayoutData = {
      groups: [{ id: "main", tabs: [term, ws], activeTabId: ws.id }],
      activeGroupId: "main",
      root: { type: "leaf", groupId: "main" },
    };

    const restored = reduceRestoreLayout(saved);
    expect(allTabs(restored)).toHaveLength(2);
    expect(restored.activeGroupId).toBe("main");
  });

  it("旧格式迁移：split → root", () => {
    const term = createTabDefaults("terminal");
    term.id = "terminal-1";
    const ws = w("PID", "pid");
    ws.id = "workspace-pid";

    const saved: LayoutData = {
      groups: [
        { id: "g1", tabs: [term], activeTabId: term.id },
        { id: "g2", tabs: [ws], activeTabId: ws.id },
      ],
      activeGroupId: "g1",
      // 旧格式——没有 root，只有 split
      split: { direction: "vertical", groupIds: ["g1", "g2"], sizes: [30, 70] },
    };

    const restored = reduceRestoreLayout(saved);
    expect(getAllLeafGroupIds(restored.root)).toHaveLength(2);
    expect(restored.root.type).toBe("branch");
  });

  it("Phase 4：恢复布局尊重保存内容——不强制插入欢迎页", () => {
    const ws = w("PID", "pid");
    const saved: LayoutData = {
      groups: [{ id: "main", tabs: [ws], activeTabId: ws.id }],
      activeGroupId: "main",
      root: { type: "leaf", groupId: "main" },
    };

    const restored = reduceRestoreLayout(saved);
    expect(allTabs(restored)).toHaveLength(1);
    expect(allTabs(restored)[0].type).toBe("workspace");
  });
});

/* ── 集成场景 ── */

describe("集成场景", () => {
  it("启动 → 开 workspace → 分屏 → 关分屏", () => {
    // Phase 5 rootfix：默认不复用预览——terminal 不替换 workspace
    let s = withWelcome();
    expect(allTabs(s)).toHaveLength(1);

    s = reduceCreateTab(s, "workspace", { workspaceName: "heart_rate" }).state;
    expect(allTabs(s)).toHaveLength(2); // [welcome, workspace]

    const tr = reduceCreateTab(s, "terminal");
    s = tr.state;
    const termId = tr.createdId;
    expect(allTabs(s)).toHaveLength(3); // [welcome, workspace, terminal]——不复用

    s = reduceSplitTab(s, termId, "horizontal");
    expect(getAllLeafGroupIds(s.root)).toHaveLength(2);
    expect(s.groups).toHaveLength(2);

    const r = reduceCloseTab(s, termId);
    expect(r.closed).toBe(true);
    expect(getAllLeafGroupIds(r.state!.root)).toHaveLength(1);
  });
});

/* ── detectDropZone ── */

describe("detectDropZone", () => {
  const rect: DOMRect = { left: 100, top: 100, width: 400, height: 300 } as DOMRect;

  it("左 → left, 右 → right, 上 → up, 下 → down, 中 → center, 外 → null", () => {
    expect(detectDropZone(140, 250, rect)).toBe("left");
    expect(detectDropZone(450, 250, rect)).toBe("right");
    expect(detectDropZone(300, 130, rect)).toBe("up");
    expect(detectDropZone(300, 350, rect)).toBe("down");
    expect(detectDropZone(300, 250, rect)).toBe("center");
    expect(detectDropZone(50, 250, rect)).toBeNull();
  });
});

/* ── E5.8#44：跨窗口搬迁 reducer——detach/merge 源侧摘除（reduceRemoveTab）+ 目标侧插入（reduceInsertTab） ── */

describe("reduceRemoveTab（E5.8#44）", () => {
  it("摘除 tab → 返回 removedTab + 组内剩余保留", () => {
    const s = stateWithTabs(w("Alpha", "demo_alpha"), w("Beta", "demo_beta"));
    const r = reduceRemoveTab(s, "workspace-demo_alpha");
    expect(r.removedTab?.id).toBe("workspace-demo_alpha");
    expect(r.state.groups[0].tabs.map((t) => t.id)).toEqual(["workspace-demo_beta"]);
    expect(r.state.groups[0].activeTabId).toBe("workspace-demo_beta");
  });

  it("单面板最后一个 tab 摘走 → 保留空组（main 可空 ⇒ 空场；detached 由壳关窗自灭）", () => {
    const s = stateWithTabs(w("Alpha", "demo_alpha"));
    const r = reduceRemoveTab(s, "workspace-demo_alpha");
    expect(r.removedTab?.id).toBe("workspace-demo_alpha");
    expect(r.state.groups).toHaveLength(1);
    expect(r.state.groups[0].tabs).toHaveLength(0);
    expect(r.state.groups[0].activeTabId).toBe("");
  });

  it("多面板组空 → 摘除该 leaf（同 reduceCloseTab unsplit 语义）", () => {
    const s = twoGroupState();
    const r = reduceRemoveTab(s, "workspace-demo_alpha");
    expect(r.removedTab?.id).toBe("workspace-demo_alpha");
    expect(getAllLeafGroupIds(r.state.root)).toHaveLength(1);
    expect(r.state.groups).toHaveLength(1);
    expect(r.state.groups[0].id).toBe("g2");
    expect(r.state.activeGroupId).toBe("g2");
  });

  it("tab 不存在 → 原样返回 + removedTab null", () => {
    const s = stateWithTabs(w("Alpha", "demo_alpha"));
    const r = reduceRemoveTab(s, "workspace-nope");
    expect(r.removedTab).toBeNull();
    expect(r.state).toBe(s);
  });

  it("🔴 摘除非焦点 tab → 源组焦点不动（跨窗搬走旁边的格子，本组焦点零移动——同 reduceCloseTab 判据）", () => {
    const tabs = abcState(2).groups[0].tabs;
    const r = reduceRemoveTab(abcState(2), tabs[0].id);
    expect(r.state.groups[0].activeTabId).toBe(tabs[2].id);
  });
});

describe("reduceInsertTab（E5.8#44）", () => {
  it("缺省 targetGroupId → 插入 activeGroupId 组尾 + 激活该 tab", () => {
    const s = stateWithTabs(w("Alpha", "demo_alpha"));
    const next = reduceInsertTab(s, w("Beta", "demo_beta"));
    expect(next.groups[0].tabs.map((t) => t.id)).toEqual(["workspace-demo_alpha", "workspace-demo_beta"]);
    expect(next.groups[0].activeTabId).toBe("workspace-demo_beta");
    expect(next.activeGroupId).toBe("main");
  });

  it("指定 targetGroupId → 插入该组（多面板）", () => {
    const s = twoGroupState();
    const next = reduceInsertTab(s, w("Gamma", "demo_gamma"), "g2");
    expect(next.groups.find((g) => g.id === "g2")!.tabs.map((t) => t.id)).toEqual(["workspace-demo_beta", "workspace-demo_gamma"]);
    expect(next.activeGroupId).toBe("g2");
  });

  it("空状态（groups: []）→ 原样返回（防御——空窗该被壳关，不 insert）", () => {
    const s: TabState = { groups: [], activeGroupId: "", root: { type: "leaf", groupId: "" } };
    const next = reduceInsertTab(s, w("Alpha", "demo_alpha"));
    expect(next).toBe(s);
  });

  it("E5.8#46.10：指定 index → splice 中插（竖线缝隙落位，非组尾追加）", () => {
    const s = stateWithTabs(w("Alpha", "demo_alpha"), w("Beta", "demo_beta"), w("Gamma", "demo_gamma"));
    const next = reduceInsertTab(s, w("Delta", "demo_delta"), "main", 1);
    expect(next.groups[0].tabs.map((t) => t.id)).toEqual(
      ["workspace-demo_alpha", "workspace-demo_delta", "workspace-demo_beta", "workspace-demo_gamma"],
    );
  });

  it("E5.8#46.10：index 越界 / 负数 → push 组尾（保守落位——竖线永不撒谎）", () => {
    const s = stateWithTabs(w("Alpha", "demo_alpha"), w("Beta", "demo_beta"));
    expect(reduceInsertTab(s, w("Gamma", "demo_gamma"), "main", 99).groups[0].tabs.map((t) => t.id))
      .toEqual(["workspace-demo_alpha", "workspace-demo_beta", "workspace-demo_gamma"]);
    expect(reduceInsertTab(s, w("Gamma", "demo_gamma"), "main", -1).groups[0].tabs.map((t) => t.id))
      .toEqual(["workspace-demo_alpha", "workspace-demo_beta", "workspace-demo_gamma"]);
  });
});

/* ── E5.8#46.2 资源事件族——跨窗资源联动纯 reducer（虚构 fixture：demo-view / E:/demo/* 路径）── */

function resTab(id: string, sourceId: string, label: string, opts?: Partial<Tab>): Tab {
  return { id, type: "demo-view", label, sourceId, filePath: sourceId, dirty: false, pinned: true, ...opts };
}

describe("reduceResourceRenamed（E5.8#46.2）", () => {
  it("sourceId 命中 → 迁移 sourceId + label（label 从事件负载来）", () => {
    const s = stateWithTabs(resTab("t1", "E:/demo/a.txt", "Alpha"), resTab("t2", "E:/demo/b.txt", "Beta"));
    const next = reduceResourceRenamed(s, "E:/demo/a.txt", "E:/demo/c.txt", "Gamma");
    expect(next.groups[0].tabs[0]).toMatchObject({ sourceId: "E:/demo/c.txt", filePath: "E:/demo/c.txt", label: "Gamma" });
    expect(next.groups[0].tabs[1]).toMatchObject({ sourceId: "E:/demo/b.txt", label: "Beta" });
  });

  it("非文件资源（无 filePath）→ 迁 sourceId + label，filePath 保持 undefined", () => {
    const s = stateWithTabs(resTab("t1", "session-demo-1", "Alpha", { filePath: undefined }));
    const next = reduceResourceRenamed(s, "session-demo-1", "session-demo-2", "Gamma");
    expect(next.groups[0].tabs[0]).toMatchObject({ sourceId: "session-demo-2", label: "Gamma" });
    expect(next.groups[0].tabs[0].filePath).toBeUndefined();
  });

  it("省略 label → 保留原 label（壳只迁身份，label 归调用方）", () => {
    const s = stateWithTabs(resTab("t1", "E:/demo/a.txt", "Alpha"));
    const next = reduceResourceRenamed(s, "E:/demo/a.txt", "E:/demo/c.txt");
    expect(next.groups[0].tabs[0]).toMatchObject({ sourceId: "E:/demo/c.txt", label: "Alpha" });
  });

});

describe("reduceResourceDeleted（E5.8#46.2）", () => {
  it("命中 sourceId/filePath → 关闭其标签，其余保留", () => {
    const s = stateWithTabs(resTab("t1", "E:/demo/a.txt", "Alpha"), resTab("t2", "E:/demo/b.txt", "Beta"));
    const next = reduceResourceDeleted(s, "E:/demo/a.txt");
    expect(next.groups[0].tabs.map((t) => t.id)).toEqual(["t2"]);
  });

  it("同资源双面板副本全关 → 组移除摘叶", () => {
    const s: TabState = {
      groups: [
        { id: "g1", tabs: [resTab("t1", "E:/demo/a.txt", "Alpha")], activeTabId: "t1" },
        { id: "g2", tabs: [resTab("t2", "E:/demo/a.txt", "Alpha"), resTab("t3", "E:/demo/b.txt", "Beta")], activeTabId: "t2" },
      ],
      activeGroupId: "g1",
      root: {
        type: "branch", direction: "horizontal",
        children: [{ type: "leaf", groupId: "g1" }, { type: "leaf", groupId: "g2" }],
        sizes: [50, 50],
      },
    };
    const next = reduceResourceDeleted(s, "E:/demo/a.txt");
    expect(next.groups.flatMap((g) => g.tabs).map((t) => t.id)).toEqual(["t3"]);
    expect(next.groups).toHaveLength(1);
  });

  it("末 tab 命中 → 单面板保留空组（fallback 归壳决策）", () => {
    const s = stateWithTabs(resTab("t1", "E:/demo/a.txt", "Alpha"));
    const next = reduceResourceDeleted(s, "E:/demo/a.txt");
    expect(next.groups).toHaveLength(1);
    expect(next.groups[0].tabs).toHaveLength(0);
    expect(next.groups[0].activeTabId).toBe("");
  });

  it("dirty tab 也删（资源消失无保存对象，不查 dirty）", () => {
    const s = stateWithTabs(resTab("t1", "E:/demo/a.txt", "Alpha", { dirty: true }));
    expect(reduceResourceDeleted(s, "E:/demo/a.txt").groups[0].tabs).toHaveLength(0);
  });

});

describe("reduceCloseBySourceId（E5.8#46.2）", () => {
  it("非 dirty 命中 sourceId → 关闭", () => {
    const s = stateWithTabs(resTab("t1", "E:/demo/a.txt", "Alpha"));
    const next = reduceCloseBySourceId(s, "E:/demo/a.txt");
    expect(next.groups[0].tabs).toHaveLength(0);
  });

  it("dirty 命中 → 静默阻断（防丢数据，原引用）", () => {
    const s = stateWithTabs(resTab("t1", "E:/demo/a.txt", "Alpha", { dirty: true }));
    expect(reduceCloseBySourceId(s, "E:/demo/a.txt")).toBe(s);
  });

  it("id 命中（findTabBySourceId：sourceId || id 双命中）", () => {
    const s = stateWithTabs(resTab("t1", "E:/demo/a.txt", "Alpha"));
    const next = reduceCloseBySourceId(s, "t1");
    expect(next.groups[0].tabs).toHaveLength(0);
  });

  it("混合 dirty/非 dirty 同资源 → 只关非 dirty（dirty 保留）", () => {
    const s = stateWithTabs(resTab("t1", "E:/demo/a.txt", "Alpha"), resTab("t2", "E:/demo/a.txt", "Alpha", { dirty: true }));
    const next = reduceCloseBySourceId(s, "E:/demo/a.txt");
    expect(next.groups[0].tabs.map((t) => t.id)).toEqual(["t2"]);
  });

});

describe("reduceRemoveTabsByPlugin（E5.8#46.2）", () => {
  it("pluginId 命中 → 关闭其全部标签", () => {
    const s = stateWithTabs(
      resTab("t1", "E:/demo/a.txt", "Alpha", { pluginId: "demo-plugin" }),
      resTab("t2", "E:/demo/b.txt", "Beta", { pluginId: "demo-plugin" }),
      resTab("t3", "E:/demo/c.txt", "Gamma", { pluginId: "other-plugin" }),
    );
    const next = reduceRemoveTabsByPlugin(s, "demo-plugin");
    expect(next.groups[0].tabs.map((t) => t.id)).toEqual(["t3"]);
  });

  it("type 命中（归一化后 type === pluginId）", () => {
    const s = stateWithTabs(resTab("t1", "E:/demo/a.txt", "Alpha", { pluginId: "demo-plugin" }));
    const next = reduceRemoveTabsByPlugin(s, "demo-view");
    expect(next.groups[0].tabs).toHaveLength(0);
  });

});

describe("reduceRemoveTabsUnderFolder（E5.8#46.2）", () => {
  it("folderUri 前缀命中（filePath）→ 关闭其下标签", () => {
    const s = stateWithTabs(
      resTab("t1", "E:/demo/a.txt", "Alpha"),
      resTab("t2", "E:/demo/sub/b.txt", "Beta"),
      resTab("t3", "E:/other/c.txt", "Gamma"),
    );
    const next = reduceRemoveTabsUnderFolder(s, "E:/demo");
    expect(next.groups[0].tabs.map((t) => t.id)).toEqual(["t3"]);
  });

  it("无 filePath 的资源按 sourceId 前缀匹配", () => {
    const s = stateWithTabs(
      resTab("t1", "E:/demo/session-1", "Alpha", { filePath: undefined }),
      resTab("t2", "E:/other/session-2", "Beta", { filePath: undefined }),
    );
    const next = reduceRemoveTabsUnderFolder(s, "E:/demo");
    expect(next.groups[0].tabs.map((t) => t.id)).toEqual(["t2"]);
  });

  it("前缀边界不误删——E:/demo 不匹配 E:/demo2/*", () => {
    const s = stateWithTabs(resTab("t1", "E:/demo2/a.txt", "Alpha"), resTab("t2", "E:/demo/a.txt", "Beta"));
    const next = reduceRemoveTabsUnderFolder(s, "E:/demo");
    expect(next.groups[0].tabs.map((t) => t.id)).toEqual(["t1"]);
  });

  it("反斜杠路径归一化后命中（Windows 盘符大小写统一）", () => {
    const s = stateWithTabs(resTab("t1", "e:\\demo\\a.txt", "Alpha"), resTab("t2", "E:/other/b.txt", "Beta"));
    const next = reduceRemoveTabsUnderFolder(s, "E:/demo");
    expect(next.groups[0].tabs.map((t) => t.id)).toEqual(["t2"]);
  });

});

describe("资源事件族——无命中 → 原引用（React bailout，参数化单处定义）", () => {
  const base = stateWithTabs(resTab("t1", "E:/demo/a.txt", "Alpha"));
  it.each<[string, (s: TabState) => TabState]>([
    ["reduceResourceRenamed", (s) => reduceResourceRenamed(s, "E:/demo/nope.txt", "E:/demo/c.txt")],
    ["reduceResourceDeleted", (s) => reduceResourceDeleted(s, "E:/demo/nope.txt")],
    ["reduceCloseBySourceId", (s) => reduceCloseBySourceId(s, "E:/demo/nope.txt")],
    ["reduceRemoveTabsByPlugin", (s) => reduceRemoveTabsByPlugin(s, "nope-plugin")],
    ["reduceRemoveTabsUnderFolder", (s) => reduceRemoveTabsUnderFolder(s, "E:/nope")],
  ])("%s — 无命中 → 原引用", (_name, fn) => {
    expect(fn(base)).toBe(base);
  });
});
