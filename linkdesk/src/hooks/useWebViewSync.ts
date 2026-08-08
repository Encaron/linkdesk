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

/** 插件 WebView API facade——归一化 window.linkdesk 访问，消硬编码 */
/** E5.5#9g：pluginId→instanceId——所有参数改为 instanceId，create 多传 pluginId */
export interface PluginViewsAPI {
  onReady(cb: (instanceId: string) => void): () => void;
  getAllIds(): Promise<string[]>;
  getInstanceIdsForPlugin?(pluginId: string): Promise<string[]>;
  setVisible(instanceId: string, visible: boolean): void;
  setBounds(instanceId: string, bounds: { x: number; y: number; width: number; height: number }): Promise<void>;
  /** E5.5#3c：关闭标签页时进入保活宽限期（60s，超时真销毁） */
  scheduleDestroy(instanceId: string): void;
  /** E5.5#3c：重开标签页时尝试从宽限期恢复。返回 true=复用成功 */
  cancelDestroy(instanceId: string): Promise<boolean>;
  /** E5.5#9 宽限期恢复——按 pluginId 查找旧 instanceId，用于 rekey */
  findGraceInstance?(pluginId: string): Promise<string | undefined>;
  /** E5.5#9 宽限期恢复——旧 instanceId → 新 instanceId 重映射 */
  rekeyInstance?(oldInstanceId: string, newInstanceId: string): Promise<boolean>;
  /** plugin-view:reload——插件重载（预留） */
  reload?(instanceId: string): void;
  /** E5.5#9：创建 WebView——(instanceId, pluginId) */
  create(instanceId: string, pluginId: string): void;
  /** E5.5#7 Bug B fix：切换标签页后转移键盘焦点到插件 WebView */
  focus(instanceId: string): void;
}

export interface WebViewSyncResult {
  /** JS 已就绪的实例 WebView ID（= tab.id）集合 */
  readyWebViewIds: Set<string>;
  /** bounds IPC 已确认的实例 WebView ID 集合 */
  webViewBoundsReady: Set<string>;
  /** 5s 超时回退的实例 ID 集合（bounds 就绪后自动清除） */
  webViewTimeout: Set<string>;
  /** 注册 group 内容区 DOM 元素——替代 querySelector（Bug ⑥） */
  registerPoolRef: (groupId: string) => (el: HTMLElement | null) => void;
  /** 插件卸载时清除所有实例 WebView 状态 */
  resetWebViewState: (pluginId: string) => void;
}

export function useWebViewSync(
  tabState: TabState,
  isShellRenderedTab: (type: string) => boolean,
  pv: PluginViewsAPI | undefined,
): WebViewSyncResult {
  // ── State ──
  const [readyWebViewIds, setReadyWebViewIds] = useState<Set<string>>(new Set());
  const [webViewBoundsReady, setWebViewBoundsReady] = useState<Set<string>>(new Set());
  const [webViewTimeout, setWebViewTimeout] = useState<Set<string>>(new Set());

  // ── Refs ──
  const webViewTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  /** E5.5#9g：key = instanceId (tab.id)，value 含 pluginId 供同步 + 反查 */
  const pluginViewsRef = useRef<Map<string, { pluginId: string; groupId: string; isVisible: boolean }>>(new Map());
  const poolRefs = useRef<Map<string, HTMLElement>>(new Map());
  const tabStateRef = useRef(tabState);
  tabStateRef.current = tabState;

  // ── Callback ref：精确注册 group 内容区 DOM 元素，替代 querySelector ──
  const registerPoolRef = useCallback((groupId: string) => (el: HTMLElement | null) => {
    if (el) poolRefs.current.set(groupId, el);
    else poolRefs.current.delete(groupId);
  }, []);

  // ── 插件卸载时清除所有实例状态 ──
  const resetWebViewState = useCallback((pluginId: string) => {
    const instanceIds: string[] = [];
    for (const [iid, s] of pluginViewsRef.current) {
      if (s.pluginId === pluginId) instanceIds.push(iid);
    }
    setReadyWebViewIds((prev) => { const next = new Set(prev); for (const iid of instanceIds) next.delete(iid); return next; });
    setWebViewBoundsReady((prev) => { const next = new Set(prev); for (const iid of instanceIds) next.delete(iid); return next; });
    setWebViewTimeout((prev) => { const next = new Set(prev); for (const iid of instanceIds) next.delete(iid); return next; });
    for (const iid of instanceIds) {
      const timer = webViewTimers.current.get(iid);
      if (timer) { clearTimeout(timer); webViewTimers.current.delete(iid); }
    }
  }, []);

  // ── Effect 1：onReady 监听 + 5s 超时 ──
  // eslint-disable-next-line linkdesk/no-ipc-listener-in-effect -- preload-shell.ts 模块级 _readyBuffer 已缓冲 mount 前事件（Bug ④ 修复），useEffect 内注册安全
  useEffect(() => {
    if (!pv?.onReady) return;
    return pv.onReady((instanceId: string) => {
      setReadyWebViewIds((prev) => {
        if (prev.has(instanceId)) return prev;
        const next = new Set(prev);
        next.add(instanceId);
        return next;
      });
      // 5s 超时——只有存在活跃标签页时才计时（Bug ②）。instanceId = tab.id，直接按 id 查
      if (!webViewTimers.current.has(instanceId)) {
        const timer = setTimeout(() => {
          const hasActiveTab = tabStateRef.current.groups.some((g: { tabs: Array<{ id: string }>; activeTabId: string }) =>
            g.tabs.some((t: { id: string }) => t.id === instanceId && t.id === g.activeTabId));
          if (!hasActiveTab) return;
          console.warn(`[MainContent] ⚠️ WebView "${instanceId}" 5s 未完全就绪，回退 React fallback`);
          setWebViewTimeout((prev) => {
            if (prev.has(instanceId)) return prev;
            const next = new Set(prev);
            next.add(instanceId);
            return next;
          });
          webViewTimers.current.delete(instanceId);
        }, 5000);
        webViewTimers.current.set(instanceId, timer);
      }
    });
  }, []);

  // ── Effect 2：bounds 就绪 → 清除 timer + 恢复超时标记（Bug ③）──
  useEffect(() => {
    for (const instanceId of webViewBoundsReady) {
      const timer = webViewTimers.current.get(instanceId);
      if (timer) {
        clearTimeout(timer);
        webViewTimers.current.delete(instanceId);
      }
      setWebViewTimeout((prev) => {
        if (!prev.has(instanceId)) return prev;
        const next = new Set(prev);
        next.delete(instanceId);
        return next;
      });
    }
  }, [webViewBoundsReady]);

  // ── ResizeObserver → 触发 bounds sync（侧栏/窗口 resize/分屏 全覆盖）──
  const [layoutVersion, setLayoutVersion] = useState(0);
  const observerRef = useRef<ResizeObserver | null>(null);
  useEffect(() => {
    if (!observerRef.current) {
      observerRef.current = new ResizeObserver(() => setLayoutVersion(v => v + 1));
    }
    for (const el of poolRefs.current.values()) observerRef.current.observe(el);
    return () => observerRef.current?.disconnect();
  }, [tabState.groups]);

  // ── Effect 3：bounds sync + setVisible（Bug ① dep + Bug ⑤ prev 时序 + Bug ⑥ ref）──
  useEffect(() => {
    if (!pv) return;
    // E5.5#3e-fix：isVisible = 本组的活跃标签页（不绑 activeGroupId）。
    // 分屏两个 group 时各自独立显示——否则非聚焦 group 的 WebView 被 setVisible(false) 变空白。
    // E5.5#9g：key = instanceId (tab.id)，value 含 pluginId 供反查 + rekey。
    const isSplit = tabState.groups.length > 1;
    const currentStates = new Map<string, { pluginId: string; groupId: string; isVisible: boolean }>();
    for (const g of tabState.groups) {
      for (const tab of g.tabs) {
        if (tab.pluginId && !isShellRenderedTab(tab.type)) {
          const isActiveInGroup = tab.id === g.activeTabId;
          currentStates.set(tab.id, {
            pluginId: tab.pluginId,
            groupId: g.id,
            // 分屏：每个 group 的活跃标签页都可见。单 group：行为不变。
            isVisible: isActiveInGroup && (isSplit || g.id === tabState.activeGroupId),
          });
        }
      }
    }

    // 🔥 在 async 调用前 snap prev（Bug ⑤）
    const prev = pluginViewsRef.current;
    pv.getAllIds?.()?.then((ids: string[]) => {
      const registeredSet = new Set(ids);
      for (const [instanceId, state] of currentStates) {
        const prevState = prev.get(instanceId);
        // E5.5#9g-fix：新实例创建不受 registeredSet 约束——首次运行时 getAllIds() 返回空，
        // 若用 registeredSet.has() 守卫则创建代码永远不可达，形成死锁。
        // 修复：!prevState 分支提到 registeredSet 检查之前，用 continue 跳过 setVisible。
        if (!prevState) {
          if (pv.findGraceInstance && pv.rekeyInstance) {
            pv.findGraceInstance(state.pluginId).then((oldIid) => {
              if (oldIid) {
                pv.rekeyInstance!(oldIid, instanceId).then(() => {
                  pv.cancelDestroy(instanceId).then((reused) => {
                    if (reused) {
                      console.log(`[useWebViewSync] "${state.pluginId}#${instanceId.slice(-6)}" 从宽限期恢复（rekey ${oldIid.slice(-6)}→${instanceId.slice(-6)}）——零重建`);
                      setReadyWebViewIds((prev) => { const next = new Set(prev); next.add(instanceId); return next; });
                    } else {
                      console.log(`[useWebViewSync] "${state.pluginId}#${instanceId.slice(-6)}" rekey 后宽限期已过——重建 WebView`);
                      setReadyWebViewIds((prev) => { const next = new Set(prev); next.delete(instanceId); return next; });
                      setWebViewBoundsReady((prev) => { const next = new Set(prev); next.delete(instanceId); return next; });
                      pv.create(instanceId, state.pluginId);
                    }
                  }).catch(() => {});
                }).catch(() => {});
              } else {
                console.log(`[useWebViewSync] "${state.pluginId}#${instanceId.slice(-6)}" 无宽限期旧实例——创建新 WebView`);
                pv.create(instanceId, state.pluginId);
              }
            }).catch(() => {});
          } else {
            pv.create(instanceId, state.pluginId);
          }
          continue; // E5.5#9g-fix：跳过 setVisible——WebView 尚未注册，下次 Effect 3 会处理
        }
        // 已有实例：需要 WebView 已注册才能 setVisible/setBounds
        if (!registeredSet.has(instanceId)) continue;
        if (prevState?.isVisible !== state.isVisible) {
          pv.setVisible(instanceId, state.isVisible);
        }
      }
      for (const instanceId of prev.keys()) {
        if (!currentStates.has(instanceId) && registeredSet.has(instanceId)) {
          // E5.5#3c：标签页关闭 → 不立即销毁，进入 60s 保活宽限期
          pv.scheduleDestroy(instanceId);
          // E5.5#3d：立即清 ready 状态——防 MainContent IPC 效应在重开时误发到已销毁的 WebView
          setReadyWebViewIds((prev) => { const next = new Set(prev); next.delete(instanceId); return next; });
          setWebViewBoundsReady((prev) => { const next = new Set(prev); next.delete(instanceId); return next; });
        }
      }
      if (ids.length > 0) {
        requestAnimationFrame(() => {
          for (const [instanceId, state] of currentStates) {
            if (state.isVisible && registeredSet.has(instanceId)) {
              // 🔥 callback ref 替代 querySelector（Bug ⑥）
              const pool = poolRefs.current.get(state.groupId);
              if (pool) {
                const rect = pool.getBoundingClientRect();
                pv.setBounds(instanceId, {
                  x: Math.round(rect.x),
                  y: Math.round(rect.y),
                  width: Math.round(rect.width),
                  height: Math.round(rect.height),
                }).then(() => {
                  setWebViewBoundsReady((prev) => {
                    if (prev.has(instanceId)) return prev;
                    const next = new Set(prev);
                    next.add(instanceId);
                    return next;
                  });
                }).catch((err: unknown) => {
                  console.warn(`[MainContent] setBounds failed for ${instanceId}:`, err);
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
  }, [tabState.groups, tabState.activeGroupId, readyWebViewIds, layoutVersion]); // Bug ①: readyWebViewIds + E5.5#3f: ResizeObserver→layoutVersion 全覆盖

  return { readyWebViewIds, webViewBoundsReady, webViewTimeout, registerPoolRef, resetWebViewState };
}
