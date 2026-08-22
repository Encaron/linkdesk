/**
 * App 布局持久化 hook——useLayoutPersistence：标签页/面板布局自动保存。
 * E5.8#0d.10-3f：自 App.tsx 拆出——beforeunload 同步写入（含面板状态）+ 标签页 100ms 防抖保存 +
 * 面板 100ms 防抖保存（onDidChangeLayout 触发，与上次落盘值比对）。
 * 依赖方向：persistence → core/services/layout（LayoutService/WorkspaceService/LayoutEngine）+ useTabManager 类型；
 * App 消费：useLayoutPersistence({ ready, tabState, panelActiveViewId })。无反向依赖。
 */

import { useEffect, useRef } from "react";
import { saveTabLayout, savePanelLayout, saveSidebarLayout, saveDetachedWindows, getPanelLayout, syncWriteLayout, type WorkspaceLayout, type DetachedWindowState } from "../core/services/layout/LayoutService";
import { syncWriteWorkspaceFolders } from "../core/services/layout/WorkspaceService";
import { layoutEngine, narrowPanelEdge, narrowSidebarEdge } from "../core/services/layout/LayoutEngine"; // E5.8#36.9：edge 窄化守卫（dock.edge 宽类型 → DTO 窄类型）
import type { TabState, LayoutData } from "../hooks/useTabManager";
import type { WindowShellState } from "./windows";

export interface LayoutPersistenceDeps {
  ready: boolean;
  tabState: TabState;
  panelActiveViewId: string | null;
  /** E5.8#31：底部面板显隐——两处保存（beforeunload + 防抖）合并落盘，防覆盖 */
  panelVisible: boolean;
  /** E5.8#43-3：壳窗口注册表——脱出窗 bounds 变化落盘数据源（moved/resized 上报 → 注册表 → 本 hook 持久化） */
  windows: WindowShellState[];
}

/** E5.8#43-3：注册表脱出窗子集 → 持久化形状（windowId + bounds；无 bounds 不落盘——未移过/未恢复的窗不建持久化记录） */
function serializeDetachedWindows(windows: WindowShellState[]): DetachedWindowState[] {
  return windows
    .filter((w) => w.mode === "detached" && w.bounds)
    .map((w) => ({ windowId: w.windowId, bounds: w.bounds! }));
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
export function useLayoutPersistence({ ready, tabState, panelActiveViewId, panelVisible, windows }: LayoutPersistenceDeps): void {
  const layoutSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const layoutInitialized = useRef(false);
  const tabStateRef = useRef(tabState);
  tabStateRef.current = tabState;
  const windowsRef = useRef(windows);
  windowsRef.current = windows;

  // beforeunload 读最新激活视图（handler 注册一次 deps []——闭包会过期，ref 同步）
  const panelActiveViewIdRef = useRef(panelActiveViewId);
  panelActiveViewIdRef.current = panelActiveViewId;
  const panelVisibleRef = useRef(panelVisible);
  panelVisibleRef.current = panelVisible;

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
        // E5.8#36.9：位置/对齐同显隐合并落盘——防抖保存可能未覆盖，退出时兜底写入
        const panelZone = layoutEngine.getZone("panel");
        const panelEdge = narrowPanelEdge(panelZone?.dock?.edge);
        const panelEdgeIsVertical = panelEdge === "left" || panelEdge === "right";
        if (panelActive || getPanelLayout()) {
          layout.panel = {
            height: panelHeight ?? 220,
            ...(panelEdgeIsVertical
              ? { width: layoutEngine.getBounds("panel")?.width ?? panelZone?.dock?.width ?? 300 }
              : {}),
            edge: panelEdge,
            align: panelZone?.dock?.align ?? "center",
            ...(panelActive ? { activeViewId: panelActive } : {}),
            visible: panelVisibleRef.current, // E5.8#31：显隐合并落盘——防抖保存可能未覆盖
          };
        }
        // E5.8#36.9：侧栏边——beforeunload 兜底落盘（防抖保存可能未覆盖）
        layout.sidebar = { edge: narrowSidebarEdge(layoutEngine.getZone("sidebar")?.dock?.edge) };
        // E5.8#43-3（A6/I9-14）：脱出窗 bounds 兜底落盘——防抖保存可能未覆盖，退出时同步写入
        const detached = serializeDetachedWindows(windowsRef.current);
        if (detached.length) layout.detachedWindows = detached;
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
  // E5.8#36.9：+ 位置/对齐/宽度真相源同为 LayoutEngine（dockTo/setAlign/resizeZone）；
  // 侧栏边锁步保存（同 onDidChangeLayout 触发）。
  // 两路触发：panelActiveViewId 变化（effect 重跑）/ onDidChangeLayout（拖拽/换位/换边后）。
  // 与上次落盘值比对——窗口 resize/sidebar 变化也 fire onDidChangeLayout，不变不写盘。
  const panelSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const panelSaveInitialized = useRef(false);
  const lastSavedPanelRef = useRef<{ height: number; edge: string; align: string; width?: number; activeViewId?: string; visible?: boolean } | null>(null);
  const lastSavedSidebarEdgeRef = useRef<"left" | "right">(narrowSidebarEdge(layoutEngine.getZone("sidebar")?.dock?.edge));
  useEffect(() => {
    if (!ready) return;
    if (!panelSaveInitialized.current) {
      // 首轮跳过——恢复（resizeZoneHeight 直设 + activeViewId 恢复 + dockTo/setAlign 恢复）不该立刻写回盘。
      // 恢复后 activeViewId 变化会触发本 effect 重跑进入正常保存。
      panelSaveInitialized.current = true;
      return;
    }
    const doSave = () => {
      // E5.8#36.9：面板边/对齐/轴尺寸真相源 = LayoutEngine（壳不镜像 state）——与高度同源读取
      const panelZone = layoutEngine.getZone("panel");
      const edge = narrowPanelEdge(panelZone?.dock?.edge);
      const align = panelZone?.dock?.align ?? "center";
      const bounds = layoutEngine.getBounds("panel");
      const height = bounds?.height ?? panelZone?.dock?.height ?? 220;
      const isVertical = edge === "left" || edge === "right";
      const width = isVertical ? (bounds?.width ?? panelZone?.dock?.width ?? 300) : undefined;
      // E5.8#31：合并显隐（ref 读活值）——toggle 立即落盘 + 本防抖保存同源同字段，最终一致
      const state = {
        height,
        ...(isVertical ? { width } : {}),
        edge,
        align,
        ...(panelActiveViewId ? { activeViewId: panelActiveViewId } : {}),
        visible: panelVisibleRef.current,
      };
      const last = lastSavedPanelRef.current;
      if (last && last.height === height && last.edge === edge && last.align === align && last.width === width
          && last.activeViewId === panelActiveViewId && last.visible === panelVisibleRef.current) return;
      lastSavedPanelRef.current = state;
      void savePanelLayout(state).catch((e) => { console.error("[App] 保存面板布局失败:", e); });

      // E5.8#36.9：侧栏边锁步保存——dockTo 换边 → onDidChangeLayout → 本防抖 → 落盘（#37.6 消费方）
      const sidebarEdge = narrowSidebarEdge(layoutEngine.getZone("sidebar")?.dock?.edge);
      if (lastSavedSidebarEdgeRef.current !== sidebarEdge) {
        lastSavedSidebarEdgeRef.current = sidebarEdge;
        void saveSidebarLayout({ edge: sidebarEdge }).catch((e) => { console.error("[App] 保存侧栏布局失败:", e); });
      }
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

  // E5.8#43-3（A6/I9-14）：脱出窗 bounds 落盘——100ms 防抖（主进程 moved/resized 上报 → 注册表更新 → 本 effect 落盘）。
  // 与上次落盘指纹比对——main tabState 活同步也触发 windows 变化，脱出子集不变不写盘。
  // 首轮跳过：恢复（restore 建窗 + bounds 回填）不该立刻写回盘。
  const detachedSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const detachedInitialized = useRef(false);
  const lastSavedDetachedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!ready) return;
    if (!detachedInitialized.current) {
      detachedInitialized.current = true;
      return;
    }
    const doSave = () => {
      const detached = serializeDetachedWindows(windows);
      const fingerprint = JSON.stringify(detached);
      if (lastSavedDetachedRef.current === fingerprint) return;
      lastSavedDetachedRef.current = fingerprint;
      void saveDetachedWindows(detached).catch((e) => { console.error("[App] 保存脱出窗布局失败:", e); });
    };
    if (detachedSaveTimer.current) clearTimeout(detachedSaveTimer.current);
    detachedSaveTimer.current = setTimeout(doSave, 100);
    return () => {
      if (detachedSaveTimer.current) clearTimeout(detachedSaveTimer.current);
    };
  }, [windows, ready]);
}
