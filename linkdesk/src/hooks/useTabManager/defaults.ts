/**
 * 标签页默认值工厂层——createTabDefaults + 组计数器 + 保底/初始状态。
 * E5.8#0d.10-2b：自 useTabManager.ts 拆出——模块级 _groupCounter 状态属主在此。
 * 依赖方向：defaults → types + core/utils/tabIdentity + pluginLoader/viewRegistry（纯数据，无反向）；
 * reducers-tab/reducers-layout 消费 createGroup/ensureFallback/pickNextActive/syncGroupCounterFromGroups。
 */

import type { CreateTabOptions } from "../../core/api/types";
import { findFallbackPlugin } from "../../pluginLoader/viewRegistry";
import { FALLBACK_PLUGIN_ID } from "../../core/utils/plugin/fallbackPluginId";
import { getDefaultLabel, resolveLegacyPluginId, getMeta, isPluginDetailView } from "../../core/utils/tabIdentity";
import { allTabs } from "./types";
import type { Tab, TabGroup, TabState, TabType } from "./types";

/** 重新导出 tabIdentity 的计数器工具（测试兼容）——计数器状态消费入口统一走本模块 */
export { resetPluginCounter, syncCountersAfterRestore, resetFallbackCounter } from "../../core/utils/tabIdentity";

/* ── 默认值工厂 ── */

/** type 可能是内置 TabType 或自定义 pluginId——创建 Tab 时统一对待 */
export function createTabDefaults(
  type: string,
  opts?: CreateTabOptions
): Tab {
  // 壳内部插件详情视图：pluginId 不设（避免污染 IconBar 高亮），用 detailPluginId
  const isDetail = isPluginDetailView(type);
  const detailPluginId = opts?.detailPluginId ?? opts?.pluginId;
  const pluginId = isDetail
    ? undefined
    : (opts?.pluginId ?? resolveLegacyPluginId(type) ?? type);

  const label = opts?.label ?? getDefaultLabel(type, opts);

  const base: Tab = {
    id: getMeta(type).generateId(opts),
    type: type as TabType,
    label,
    workspaceName: opts?.workspaceName,
    filePath: opts?.filePath,
    dirty: false,
    pluginId,
    detailPluginId: isDetail ? detailPluginId : opts?.detailPluginId,
    sourceId: opts?.sourceId,
    pinned: opts?.pinned ?? false,  // VS Code: 新标签页默认预览模式
  };

  // sourceId 默认值：跨组移动/事件寻址用此 ID。
  // 若类型声明了 identityField（如 editor→filePath, workspace→workspaceName），
  // 则默认取该字段的值——壳不知道具体插件是什么，只知道有 identityField 就用它。
  if (!base.sourceId) {
    const idField = getMeta(type).identityField;
    if (idField && opts) {
      const idValue = (opts as Record<string, unknown>)[idField] as string | undefined;
      base.sourceId = idValue ?? base.id;
    } else {
      base.sourceId = base.id;
    }
  }

  return base;
}

/* ── 辅助 ── */

/** 组 ID 全局计数器——模块状态属主（reducers-layout 经 syncGroupCounterFromGroups 同步，不直接读写） */
let _groupCounter = 0;

/** 创建组——ID 由计数器保证全局唯一（group-1/group-2/…） */
export function createGroup(tabs: Tab[] = []): TabGroup {
  _groupCounter++;
  return {
    id: `group-${_groupCounter}`,
    tabs,
    activeTabId: tabs[0]?.id ?? "",
  };
}

/** E5.6#9f：恢复布局后同步 _groupCounter——防止模块级计数器归零导致 group-1 重复 key */
export function syncGroupCounterFromGroups(groups: Pick<TabGroup, "id">[]): void {
  _groupCounter = Math.max(
    _groupCounter,
    ...groups.map((g) => {
      const m = g.id.match(/^group-(\d+)$/);
      return m ? parseInt(m[1]) : 0;
    }),
  );
}

/** Phase 4：只在全场标签页数为 0 时才补保底标签页（对标浏览器——全关才重生） */
export function ensureFallback(state: TabState): TabState {
  const all = allTabs(state);
  if (all.length === 0) {
    const fallbackId = findFallbackPlugin()?.pluginId ?? FALLBACK_PLUGIN_ID;
    const fb = createTabDefaults(fallbackId);
    const mainGroup = state.groups.find((g) => g.id === state.activeGroupId) ?? state.groups[0];
    if (mainGroup) {
      mainGroup.tabs = [fb];
      mainGroup.activeTabId = fb.id;
    }
  }
  return state;
}

/** 选焦点标签页——关掉后选相邻的 */
export function pickNextActive(tabs: Tab[], closedId: string): string {
  const idx = tabs.findIndex((t) => t.id === closedId);
  if (idx === -1) return tabs[0]?.id ?? "";
  const next = tabs[idx + 1] || tabs[idx - 1];
  return next?.id ?? "";
}

/* ── 初始状态 ── */

export function createInitialTabState(): TabState {
  // Phase 4：查 viewRegistry 找 isFallback 插件，没有则降级到 welcome
  const fallbackId = findFallbackPlugin()?.pluginId ?? FALLBACK_PLUGIN_ID;
  const fb = createTabDefaults(fallbackId);
  return {
    groups: [{ id: "main", tabs: [fb], activeTabId: fb.id }],
    activeGroupId: "main",
    root: { type: "leaf", groupId: "main" },
  };
}
