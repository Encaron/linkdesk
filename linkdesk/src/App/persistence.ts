/**
 * App 布局持久化 hook——useLayoutPersistence：标签页/面板布局自动保存。
 * E5.8#0d.10-3f：自 App.tsx 拆出——beforeunload 同步写入（含面板状态）+ 标签页 100ms 防抖保存 +
 * 面板 100ms 防抖保存（onDidChangeLayout 触发，与上次落盘值比对）。
 * 依赖方向：persistence → core/services/layout（LayoutService/WorkspaceService/LayoutEngine）+ useTabManager 类型；
 * App 消费：useLayoutPersistence({ ready, tabState, panelActiveViewId })。无反向依赖。
 */

import { useEffect, useRef } from "react";
import { saveTabLayout, savePanelLayout, getPanelLayout, syncWriteLayout, type WorkspaceLayout } from "../core/services/layout/LayoutService";
import { syncWriteWorkspaceFolders } from "../core/services/layout/WorkspaceService";
import { layoutEngine } from "../core/services/layout/LayoutEngine";
import type { TabState, LayoutData } from "../hooks/useTabManager";

export interface LayoutPersistenceDeps {
  ready: boolean;
  tabState: TabState;
  panelActiveViewId: string | null;
}

/** 标签页组序列化——beforeunload 与 100ms 防抖保存共用同一形状（E5.8#1c 去重） */
function serializeGroups(
  groups: TabState["groups"],
  activeGroupId: LayoutData["activeGroupId"],
  root: LayoutData["root"],
): LayoutData {
  return {
    groups: groups.map((g) => ({
      id: g.id,
      tabs: g.tabs.map((t) => ({
        id: t.id, type: t.type, label: t.label, dirty: t.dirty,
        workspaceName: t.workspaceName, filePath: t.filePath,
        pluginId: t.pluginId, detailPluginId: t.detailPluginId,
        sourceId: t.sourceId, pinned: t.pinned,
      })),
      activeTabId: g.activeTabId,
    })),
    activeGroupId,
    root,
  };
}

/** 布局持久化——tabState/panel 全真相源在壳，App 自己负责保存。三个独立 effect（beforeunload 注册一次，闭包经 ref 读活值） */
export function useLayoutPersistence({ ready, tabState, panelActiveViewId }: LayoutPersistenceDeps): void {
  const layoutSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const layoutInitialized = useRef(false);
  const tabStateRef = useRef(tabState);
  tabStateRef.current = tabState;

  // beforeunload 读最新激活视图（handler 注册一次 deps []——闭包会过期，ref 同步）
  const panelActiveViewIdRef = useRef(panelActiveViewId);
  panelActiveViewIdRef.current = panelActiveViewId;

  // beforeunload——F5 刷新/关闭窗口时同步写入
  useEffect(() => {
    const onBeforeUnload = () => {
      try {
        const s = tabStateRef.current;
        const layout: WorkspaceLayout = {
          tabs: serializeGroups(s.groups, s.activeGroupId, s.root),
          cards: [],
        };
        // E5.7#63.7：面板状态同样读活值（防抖保存可能未落盘）——syncWriteLayout 整体替换缓存，
        // 不带上 panel 会在退出时冲掉面板状态。仅面板被用过（有激活视图/有历史状态）时写入。
        const panelActive = panelActiveViewIdRef.current;
        const panelHeight = layoutEngine.getBounds("panel")?.height;
        if (panelActive || getPanelLayout()) {
          layout.panel = {
            height: panelHeight ?? 220,
            ...(panelActive ? { activeViewId: panelActive } : {}),
          };
        }
        syncWriteLayout(layout);
        syncWriteWorkspaceFolders(); // E5.5#0e：退出/刷新时同步保存工作区文件夹列表
      } catch { /* 静默 */ }
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, []);

  // 100ms 防抖保存——标签页/分屏变更后自动持久化。
  // E5.7 迁移补：ready 前不保存——迁入 App 后此 effect 首轮 mount 就跑（StrictMode 双跑），
  // 恢复（ready）之前 tabState 为空，保存空布局会覆盖磁盘上的持久化 → 重启后标签页全丢。
  useEffect(() => {
    if (!ready) return;
    if (!layoutInitialized.current) {
      layoutInitialized.current = true;
      return;
    }
    const doSave = () => {
      saveTabLayout(serializeGroups(tabState.groups, tabState.activeGroupId, tabState.root)).catch((e) => { console.error("[App] 保存标签页布局失败:", e); });
    };
    if (layoutSaveTimer.current) clearTimeout(layoutSaveTimer.current);
    layoutSaveTimer.current = setTimeout(doSave, 100);
    return () => {
      if (layoutSaveTimer.current) clearTimeout(layoutSaveTimer.current);
    };
  }, [tabState.groups, tabState.activeGroupId, tabState.root, ready]);

  // E5.7#63.7：面板布局状态持久化——100ms 防抖（标签页保存同款）。
  // 高度真相源 = LayoutEngine（App 不镜像 height state）；激活视图 = App state。
  // 两路触发：panelActiveViewId 变化（effect 重跑）/ onDidChangeLayout（拖拽 resizeZoneHeight 后）。
  // 与上次落盘值比对——窗口 resize/sidebar 变化也 fire onDidChangeLayout，不变不写盘。
  const panelSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const panelSaveInitialized = useRef(false);
  const lastSavedPanelRef = useRef<{ height: number; activeViewId?: string } | null>(null);
  useEffect(() => {
    if (!ready) return;
    if (!panelSaveInitialized.current) {
      // 首轮跳过——恢复（resizeZoneHeight 直设 + activeViewId 恢复）不该立刻写回盘。
      // 恢复后 activeViewId 变化会触发本 effect 重跑进入正常保存。
      panelSaveInitialized.current = true;
      return;
    }
    const doSave = () => {
      const height = layoutEngine.getBounds("panel")?.height ?? 220;
      const state = { height, ...(panelActiveViewId ? { activeViewId: panelActiveViewId } : {}) };
      const last = lastSavedPanelRef.current;
      if (last && last.height === height && last.activeViewId === panelActiveViewId) return;
      lastSavedPanelRef.current = state;
      void savePanelLayout(state).catch((e) => { console.error("[App] 保存面板布局失败:", e); });
    };
    const schedule = () => {
      if (panelSaveTimer.current) clearTimeout(panelSaveTimer.current);
      panelSaveTimer.current = setTimeout(doSave, 100);
    };
    schedule();
    const unsub = layoutEngine.onDidChangeLayout(schedule);
    return () => {
      unsub();
      if (panelSaveTimer.current) clearTimeout(panelSaveTimer.current);
    };
  }, [ready, panelActiveViewId]);
}
