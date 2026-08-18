/**
 * 标签页 CRUD 纯状态转换层——创建/打开/聚焦/关闭/复制/标记/重排/固定。
 * E5.8#0d.10-2c：自 useTabManager.ts 拆出——不依赖 React Hook，纯函数输入 TabState 输出新 TabState。
 * 依赖方向：reducers-tab → defaults（createTabDefaults/ensureFallback/pickNextActive）+ types + core 工具；无反向。
 */

import type { CreateTabOptions } from "../../core/api/types";
import { getTabBehavior, findFallbackPlugin } from "../../pluginLoader/viewRegistry";
import { FALLBACK_PLUGIN_ID } from "../../core/utils/plugin/fallbackPluginId";
import { findTabByIdentity, isSameTabIdentity } from "../../core/utils/tabIdentity";
import { getAllLeafGroupIds, removeLeafFromTree } from "../../core/utils/splitTree";
import { allTabs, findGroup } from "./types";
import type { TabState, CreateTabResult, CloseTabResult } from "./types";
import { createTabDefaults, ensureFallback, pickNextActive } from "./defaults";

export function reduceCreateTab(
  prev: TabState,
  type: string,
  opts?: CreateTabOptions
): CreateTabResult {
  const all = allTabs(prev);
  const targetGroupId = opts?.targetGroupId ?? prev.activeGroupId;
  const makePinned = opts?.pinned === true;

  /* ── Step 1: VS Code findEditor —— 已有标签页？聚焦 + 可选 pin ── */
  const existing = findTabByIdentity(all, type, opts);
  if (existing) {
    const group = findGroup(prev, existing.id)!;
    // 调用方指定 pinned:true → 固定它（对标 VS Code：双击标签页 → doPin）
    const needPin = makePinned && !existing.pinned;
    const updatedTab = needPin ? { ...existing, pinned: true } : existing;
    const newGroups = prev.groups.map((g) =>
      g.id === group.id
        ? { ...g, tabs: g.tabs.map((t) => (t.id === existing.id ? updatedTab : t)), activeTabId: existing.id }
        : g
    );
    return { state: { ...prev, groups: newGroups, activeGroupId: group.id }, createdId: existing.id };
  }

  /* ── Step 2: 单例去重（settings 等） ── */
  if (getTabBehavior(type).singleton && all.some((t) => t.type === type || t.pluginId === type)) {
    const singleton = all.find((t) => t.type === type || t.pluginId === type)!;
    const group = findGroup(prev, singleton.id)!;
    return {
      state: { ...prev, activeGroupId: group.id, groups: prev.groups.map((g) => (g.id === group.id ? { ...g, activeTabId: singleton.id } : g)) },
      createdId: singleton.id,
    };
  }

  /* ── Step 3: VS Code preview replacement —— 显式 opt-IN（pinned:false）。
     Phase 5 rootfix：原逻辑 if (!makePinned) 是 opt-OUT——默认触发替换，
     导致每个调用方必须记住传 pinned:true，忘了就是 bug（V2.6 模式）。
     改为 opt-IN：只有显式传 pinned:false 才触发预览替换。
     对标 VS Code：editorGroupModel.openEditor({ pinned: false }) 表示"以预览模式打开"。
     预览标签页 = pinned=false 且非保底 */
  if (opts?.pinned === false) {
    const targetGroup = prev.groups.find((g) => g.id === targetGroupId);
    if (targetGroup) {
      // 对标 VS Code：同一身份=聚焦(Step 1已处理)，不同身份=替换预览。
      const previewTab = targetGroup.tabs.find(
        (t) => !t.pinned && !getTabBehavior(t.type).isFallback && !isSameTabIdentity(t, type, opts)
      );
      if (previewTab) {
        // 复用 preview 的 id（保持 keep-alive 的 TabPanePositioner key 不变，避免 React unmount）
        const newTab = { ...createTabDefaults(type, opts), pinned: false }; // E5#92: 不复用 preview id——防同 ID 双标签页
        const newGroups = prev.groups.map((g) =>
          g.id === targetGroupId
            ? { ...g, tabs: g.tabs.map((t) => (t.id === previewTab.id ? newTab : t)), activeTabId: newTab.id }
            : g
        );
        return { state: { ...prev, groups: newGroups, activeGroupId: targetGroupId }, createdId: newTab.id };
      }
    }
  }

  /* ── Step 4: 真正新建（无已有、无显式预览替换请求） ── */
  const newTab = createTabDefaults(type, opts);
  // E5#92b: ID 碰撞检测——generateId 基于 filePath 生成确定性 ID，旧文件再打开时可能与已存在标签页碰撞
  if (prev.groups.flatMap(g => g.tabs).some(t => t.id === newTab.id)) {
    newTab.id = `${newTab.id}-${Date.now()}`;
  }
  const targetGroup = prev.groups.find((g) => g.id === targetGroupId);
  if (!targetGroup) return { state: prev, createdId: "" };

  const newGroups = prev.groups.map((g) => {
    if (g.id !== targetGroupId) return g;
    return { ...g, tabs: [...g.tabs, newTab], activeTabId: newTab.id };
  });

  return {
    state: { ...prev, groups: newGroups, activeGroupId: targetGroupId },
    createdId: newTab.id,
  };
}

/** Phase 4 归一化：type 可以是内置 TabType 或自定义 pluginId */
export function reduceOpenOrFocus(
  prev: TabState,
  type: string,
  lastFocusedId?: string | null,
  createOpts?: CreateTabOptions,
): { state: TabState; focusedId: string | null } {
  const all = allTabs(prev);
  // 同时按 type 和 pluginId 匹配——归一化后两者等价
  const existing = all.filter((t) => t.type === type || t.pluginId === type);

  if (existing.length > 0) {
    const target = existing.find((t) => t.id === lastFocusedId) ?? existing[existing.length - 1];
    const group = findGroup(prev, target.id)!;
    return {
      state: {
        ...prev,
        activeGroupId: group.id,
        groups: prev.groups.map((g) => (g.id === group.id ? { ...g, activeTabId: target.id } : g)),
      },
      focusedId: target.id,
    };
  }

  // 隐式创建：传 opts（如 pinned:true）防止预览替换机制吃掉已有标签页
  const r = reduceCreateTab(prev, type, createOpts);
  if (r.createdId) {
    return { state: r.state, focusedId: r.createdId };
  }

  return { state: prev, focusedId: null };
}

export function reduceFocusTab(prev: TabState, tabId: string): TabState {
  const group = findGroup(prev, tabId);
  if (!group) return prev;
  return {
    ...prev,
    activeGroupId: group.id,
    groups: prev.groups.map((g) =>
      g.id === group.id ? { ...g, activeTabId: tabId } : g
    ),
  };
}

export function reduceCloseTab(prev: TabState, tabId: string): CloseTabResult {
  const group = findGroup(prev, tabId);
  if (!group) return { closed: false, tabId, reason: "blocked" };

  const tab = group.tabs.find((t) => t.id === tabId)!;

  // dirty 阻断
  if (tab.dirty) {
    return { closed: false, tabId, reason: "dirty" };
  }

  // 从组中移除
  const remaining = group.tabs.filter((t) => t.id !== tabId);

  // 该组变空
  if (remaining.length === 0) {
    const allLeafIds = getAllLeafGroupIds(prev.root);
    if (allLeafIds.length > 1) {
      // 多面板 → 移除该 leaf
      const result = removeLeafFromTree(prev.root, group.id);
      if (result) {
        const newGroups = prev.groups.filter((g) => g.id !== group.id);
        const survivingGroup = prev.groups.find((g) => g.id === result.survivingSiblingGroupId);
        const newState = ensureFallback({
          groups: newGroups,
          activeGroupId: result.survivingSiblingGroupId,
          root: result.tree,
        });
        return { closed: true, tabId, reason: "unsplit", state: newState, newActiveTabId: survivingGroup?.activeTabId ?? "" };
      }
    }
    // 单面板 + 最后一个标签页 → 全场 0 标签，ensureFallback 补欢迎页
    const fbId = findFallbackPlugin()?.pluginId ?? FALLBACK_PLUGIN_ID;
    const fb = createTabDefaults(fbId);
    const newGroups = prev.groups.map((g) =>
      g.id === group.id ? { ...g, tabs: [fb], activeTabId: fb.id } : g
    );
    return {
      closed: true, tabId,
      state: { ...prev, groups: newGroups, root: prev.root },
      newActiveTabId: fb.id,
    };
  }

  const newActiveId = pickNextActive(remaining, tabId);
  const newGroups = prev.groups.map((g) =>
    g.id === group.id ? { ...g, tabs: remaining, activeTabId: newActiveId } : g
  );

  return {
    closed: true, tabId,
    state: { ...prev, groups: newGroups },
    newActiveTabId: newActiveId,
  };
}

export function reduceForceCloseTab(prev: TabState, tabId: string): CloseTabResult {
  const group = findGroup(prev, tabId);
  if (!group) return { closed: false, tabId, reason: "blocked" };
  // 清除 dirty 标志后走正常关闭——不可变更新到 tab 层级
  const cleaned: TabState = {
    ...prev,
    groups: prev.groups.map((g) => ({
      ...g,
      tabs: g.tabs.map((t) => (t.id === tabId ? { ...t, dirty: false } : t)),
    })),
  };
  return reduceCloseTab(cleaned, tabId);
}

/** 复制标签页——新 ID、新实例、相同属性。对标 VS Code Shift+拖 */
export function reduceDuplicateTab(prev: TabState, tabId: string): TabState | null {
  const group = findGroup(prev, tabId);
  if (!group) return null;
  const tab = group.tabs.find((t) => t.id === tabId);
  if (!tab) return null;

  // 创建副本——generateId 自增确保新 ID（如 terminal-3 → terminal-4）。
  // 若 generateId 不做自增（如 workspace 按 workspaceName 生成同名 ID），追加后缀防冲突。
  const copy = createTabDefaults(
    tab.type,
    { workspaceName: tab.workspaceName, filePath: tab.filePath, label: tab.label }
  );
  // G12：跨组检查 ID 碰撞——不只查当前组，多面板时同名 workspace 可能在不同组
  if (prev.groups.flatMap(g => g.tabs).some(t => t.id === copy.id)) {
    copy.id = `${copy.id}-copy-${Date.now()}`;
  }
  copy.dirty = false;

  const newGroups = prev.groups.map((g) =>
    g.id === group.id
      ? { ...g, tabs: [...g.tabs, copy] }
      : g
  );

  return { ...prev, groups: newGroups, activeGroupId: group.id };
}

export function reduceSetDirty(prev: TabState, tabId: string, dirty: boolean): TabState {
  return {
    ...prev,
    groups: prev.groups.map((g) => ({
      ...g,
      tabs: g.tabs.map((t) => (t.id === tabId ? { ...t, dirty } : t)),
    })),
  };
}

export function reduceUpdateTabLabel(prev: TabState, tabId: string, label: string): TabState {
  return {
    ...prev,
    groups: prev.groups.map((g) => ({
      ...g,
      tabs: g.tabs.map((t) => (t.id === tabId ? { ...t, label } : t)),
    })),
  };
}

/** 标签栏内拖拽重排——在组内交换位置 */
export function reduceReorderTab(prev: TabState, tabId: string, toIndex: number): TabState {
  const group = findGroup(prev, tabId);
  if (!group) return prev;
  const fromIndex = group.tabs.findIndex((t) => t.id === tabId);
  if (fromIndex === -1) return prev;
  const newTabs = [...group.tabs];
  const [moved] = newTabs.splice(fromIndex, 1);
  newTabs.splice(toIndex, 0, moved);
  return {
    ...prev,
    groups: prev.groups.map((g) =>
      g.id === group.id ? { ...g, tabs: newTabs } : g
    ),
  };
}

/** 对标 VS Code：双击标签页 → 固定/取消固定（预览模式 ↔ 固定） */
export function reducePinTab(prev: TabState, tabId: string): TabState {
  const group = findGroup(prev, tabId);
  if (!group) return prev;
  return {
    ...prev,
    groups: prev.groups.map((g) => {
      if (g.id !== group.id) return g;
      return {
        ...g,
        tabs: g.tabs.map((t) => (t.id === tabId ? { ...t, pinned: !t.pinned } : t)),
      };
    }),
  };
}
