/**
 * useWebViewSync —— 多 WebView 生命周期归一化 hook
 *
 * E5#81：从 MainContent.tsx 抽取 3 effect + 3 state + 2 ref。
 * 管理插件 WebView 的 ready / bounds / 可见性 / 超时全生命周期。
 *
 * 收束 Bug ①-⑥：
 *   - readyWebViewIds 加入 bounds sync 依赖（Bug ①）
 *   - 无标签页不启动 5s 超时（Bug ②）
 *   - webViewTimeout 可逆（Bug ③）
 *   - onReady 回调在模块级缓冲（Bug ④，preload-shell.ts 层修复）
 *   - prev 在 async 前捕获（Bug ⑤）
 *   - bounds 计算用 callback ref 替代 querySelector（Bug ⑥）
 */
import { useState, useEffect, useRef, useCallback } from "react";
import type { TabState } from "./useTabManager";

export interface WebViewSyncResult {
  /** JS 已就绪的插件 WebView ID 集合 */
  readyWebViewIds: Set<string>;
  /** bounds IPC 已确认的插件 WebView ID 集合 */
  webViewBoundsReady: Set<string>;
  /** 5s 超时回退的插件 ID 集合（bounds 就绪后自动清除） */
  webViewTimeout: Set<string>;
  /** 注册 group 内容区 DOM 元素——替代 querySelector（Bug ⑥） */
  registerPoolRef: (groupId: string) => (el: HTMLElement | null) => void;
  /** 插件卸载时清除所有 WebView 状态 */
  resetWebViewState: (pluginId: string) => void;
}

export function useWebViewSync(
  tabState: TabState,
  isShellRenderedTab: (type: string) => boolean,
): WebViewSyncResult {
  // ── State ──
  const [readyWebViewIds, setReadyWebViewIds] = useState<Set<string>>(new Set());
  const [webViewBoundsReady, setWebViewBoundsReady] = useState<Set<string>>(new Set());
  const [webViewTimeout, setWebViewTimeout] = useState<Set<string>>(new Set());

  // ── Refs ──
  const webViewTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const pluginViewsRef = useRef<Map<string, { groupId: string; isFocused: boolean }>>(new Map());
  const poolRefs = useRef<Map<string, HTMLElement>>(new Map());
  const tabStateRef = useRef(tabState);
  tabStateRef.current = tabState;

  // ── Callback ref：精确注册 group 内容区 DOM 元素，替代 querySelector ──
  const registerPoolRef = useCallback((groupId: string) => (el: HTMLElement | null) => {
    if (el) poolRefs.current.set(groupId, el);
    else poolRefs.current.delete(groupId);
  }, []);

  // ── 插件卸载时清除状态 ──
  const resetWebViewState = useCallback((pluginId: string) => {
    setReadyWebViewIds((prev) => { const next = new Set(prev); next.delete(pluginId); return next; });
    setWebViewBoundsReady((prev) => { const next = new Set(prev); next.delete(pluginId); return next; });
    setWebViewTimeout((prev) => { const next = new Set(prev); next.delete(pluginId); return next; });
    const timer = webViewTimers.current.get(pluginId);
    if (timer) { clearTimeout(timer); webViewTimers.current.delete(pluginId); }
  }, []);

  // ── Effect 1：onReady 监听 + 5s 超时 ──
  // eslint-disable-next-line linkdesk/no-ipc-listener-in-effect -- preload-shell.ts 模块级 _readyBuffer 已缓冲 mount 前事件（Bug ④ 修复），useEffect 内注册安全
  useEffect(() => {
    const pv = (window as any).linkdesk?.pluginViews;
    if (!pv?.onReady) return;
    return pv.onReady((pluginId: string) => {
      setReadyWebViewIds((prev) => {
        if (prev.has(pluginId)) return prev;
        const next = new Set(prev);
        next.add(pluginId);
        return next;
      });
      // 5s 超时——只有存在活跃标签页时才计时（Bug ②）
      if (!webViewTimers.current.has(pluginId)) {
        const timer = setTimeout(() => {
          const hasActiveTab = tabStateRef.current.groups.some((g: { tabs: Array<{ pluginId?: string; id: string }>; activeTabId: string }) =>
            g.tabs.some((t: { pluginId?: string; id: string }) => t.pluginId === pluginId && t.id === g.activeTabId));
          if (!hasActiveTab) return;
          console.warn(`[MainContent] ⚠️ WebView "${pluginId}" 5s 未完全就绪，回退 React fallback`);
          setWebViewTimeout((prev) => {
            if (prev.has(pluginId)) return prev;
            const next = new Set(prev);
            next.add(pluginId);
            return next;
          });
          webViewTimers.current.delete(pluginId);
        }, 5000);
        webViewTimers.current.set(pluginId, timer);
      }
    });
  }, []);

  // ── Effect 2：bounds 就绪 → 清除 timer + 恢复超时标记（Bug ③）──
  useEffect(() => {
    for (const pluginId of webViewBoundsReady) {
      const timer = webViewTimers.current.get(pluginId);
      if (timer) {
        clearTimeout(timer);
        webViewTimers.current.delete(pluginId);
      }
      setWebViewTimeout((prev) => {
        if (!prev.has(pluginId)) return prev;
        const next = new Set(prev);
        next.delete(pluginId);
        return next;
      });
    }
  }, [webViewBoundsReady]);

  // ── Effect 3：bounds sync + setVisible（Bug ① dep + Bug ⑤ prev 时序 + Bug ⑥ ref）──
  useEffect(() => {
    const pv = (window as any).linkdesk?.pluginViews;
    if (!pv) return;

    const currentStates = new Map<string, { groupId: string; isFocused: boolean }>();
    for (const g of tabState.groups) {
      for (const tab of g.tabs) {
        if (tab.pluginId && !isShellRenderedTab(tab.type)) {
          const isActiveInGroup = tab.id === g.activeTabId;
          currentStates.set(tab.pluginId, {
            groupId: g.id,
            isFocused: isActiveInGroup && g.id === tabState.activeGroupId,
          });
        }
      }
    }

    // 🔥 在 async 调用前 snap prev（Bug ⑤）
    const prev = pluginViewsRef.current;
    pv.getAllIds?.()?.then((ids: string[]) => {
      const registeredSet = new Set(ids);
      for (const [pluginId, state] of currentStates) {
        if (!registeredSet.has(pluginId)) continue;
        const prevState = prev.get(pluginId);
        if (prevState?.isFocused !== state.isFocused) {
          pv.setVisible(pluginId, state.isFocused);
        }
      }
      for (const pluginId of prev.keys()) {
        if (!currentStates.has(pluginId) && registeredSet.has(pluginId)) {
          pv.setVisible(pluginId, false);
        }
      }
      if (ids.length > 0) {
        requestAnimationFrame(() => {
          for (const [pluginId, state] of currentStates) {
            if (state.isFocused && registeredSet.has(pluginId)) {
              // 🔥 callback ref 替代 querySelector（Bug ⑥）
              const pool = poolRefs.current.get(state.groupId);
              if (pool) {
                const rect = pool.getBoundingClientRect();
                pv.setBounds(pluginId, {
                  x: Math.round(rect.x),
                  y: Math.round(rect.y),
                  width: Math.round(rect.width),
                  height: Math.round(rect.height),
                }).then(() => {
                  setWebViewBoundsReady((prev) => {
                    if (prev.has(pluginId)) return prev;
                    const next = new Set(prev);
                    next.add(pluginId);
                    return next;
                  });
                }).catch((err: unknown) => {
                  console.warn(`[MainContent] setBounds failed for ${pluginId}:`, err);
                });
              }
            }
          }
        });
      }
    }).catch((err: unknown) => {
      console.warn('[MainContent] WebView 同步失败:', err);
    });

    pluginViewsRef.current = currentStates;
  }, [tabState.groups, tabState.activeGroupId, readyWebViewIds]); // Bug ①: readyWebViewIds 加入 deps

  // ── Effect 4：editor openFile IPC ──
  useEffect(() => {
    for (const g of tabState.groups) for (const t of g.tabs) {
      if (t.pluginId === "editor" && t.sourceId) {
        const fp = t.sourceId;
        (window as any).linkdesk?.bridge?.requestToPlugin?.("editor", "openFile", { filePath: fp }).catch(() => {});
      }
    }
  }, [tabState.groups, readyWebViewIds, webViewBoundsReady]);

  return { readyWebViewIds, webViewBoundsReady, webViewTimeout, registerPoolRef, resetWebViewState };
}
