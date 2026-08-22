/**
 * useWindowHost——壳侧窗口注册表 hook（E5.8#43-2）。
 *
 * 壳 = 窗口策略真相源：持有全部窗口的 WindowShellState（main 活引用 useTabManager tabState +
 * 脱出窗自持 tabState），订阅池就绪流/OS 关窗，暴露壳驱动窗口生命周期的 API。
 * 消费方：usePoolSync（按注册表定向推布局）+ #44 脱出手势（createWindow/closeWindow/updateTabState）。
 *
 * 职责边界（#43 三层架构）：
 *   壳只做策略（mode → ready 标记/关窗移除），窗口实体生命周期（建/关/枚举）归主进程
 *   window-manager（createPoolWindow/closePoolWindow）——壳经 pool.createWindow/closeWindow IPC 驱动。
 *
 * 订阅（preload 缓冲语义）：
 *   onReady(windowId)        → 标记该窗 ready（脱出窗首次建窗后首推布局由它触发）
 *   onWindowClosed(windowId) → 按策略关窗×语义处理（detached=移除窗口状态；main=主进程管）
 */

import { useCallback, useEffect, useState } from "react";
import type { TabState } from "../hooks/useTabManager";
import type { WindowShellState } from "./windows";
import { getDetachedWindows } from "../core/services/layout/LayoutService";
import type { PoolWindowBoundsPayload } from "../core/types/ipc/poolActions";
import { purgePoolCommandWindows } from "../core/registry/commands/CommandRegistry"; // E5.8#43-4：窗口关闭 → 归属表清该窗命令

interface UseWindowHostOptions {
  /** 主窗标签页真相源（useTabManager）——活同步进注册表，主窗布局随标签操作即时重推 */
  mainTabState: TabState;
}

export interface UseWindowHostResult {
  /** 全部窗口状态注册表——usePoolSync 遍历就绪窗按模式策略组装布局并定向推送 */
  windows: WindowShellState[];
  /** 壳登记一个脱出窗口 + 通知主进程建窗（#44 手势消费：被脱出的组归属该窗；#43-3 恢复传 bounds） */
  createWindow(windowId: string, tabState: TabState, bounds?: PoolWindowBoundsPayload["bounds"]): void;
  /** 壳移除一个脱出窗口 + 通知主进程关窗（空窗自灭/非回归关闭） */
  closeWindow(windowId: string): void;
  /** 更新某窗口的 tabState（脱出窗标签操作——#44 TabBar 复用接线） */
  updateTabState(windowId: string, tabState: TabState): void;
}

/** 空脱出窗 tabState——恢复窗口用（#43-3 此刻无 tab，组归属随 #44 拖出后写入） */
function emptyTabState(): TabState {
  return { groups: [], activeGroupId: "", root: { type: "leaf", groupId: "" } };
}

export function useWindowHost({ mainTabState }: UseWindowHostOptions): UseWindowHostResult {
  // 初始只有主窗——ready:true（主池可立即接收布局，preload 缓冲回放；onReady('main') 仅确认）
  const [windows, setWindows] = useState<WindowShellState[]>(() => [
    { windowId: "main", mode: "main", ready: true, tabState: mainTabState },
  ]);

  // main tabState 活同步进注册表——真相源 = useTabManager（任一标签操作 → 主窗布局重推）
  useEffect(() => {
    setWindows((prev) => prev.map((w) => (w.windowId === "main" ? { ...w, tabState: mainTabState } : w)));
  }, [mainTabState]);

  // 池 React 挂载完毕 → 标记就绪 → usePoolSync 按 windowId 定向推布局（脱出窗首次建窗后首推由此触发）
  useEffect(() => {
    const poolApi = window.linkdesk?.pool;
    if (!poolApi) return;
    const unsub = poolApi.onReady?.((windowId: string) => {
      setWindows((prev) =>
        prev.some((w) => w.windowId === windowId)
          ? prev.map((w) => (w.windowId === windowId ? { ...w, ready: true } : w))
          : prev,
      );
    });
    return unsub;
  }, []);

  // OS 关窗（用户点 × / 系统关窗）→ 按模式策略关窗×语义处理：
  // detached=移除窗口状态（窗口内全部 tab 随窗关闭，非回归）；main=主进程生命周期管（不处理）
  useEffect(() => {
    const poolApi = window.linkdesk?.pool;
    if (!poolApi) return;
    const unsub = poolApi.onWindowClosed?.((windowId: string) => {
      setWindows((prev) => {
        const entry = prev.find((w) => w.windowId === windowId);
        if (!entry || entry.mode === "main") return prev;
        return prev.filter((w) => w.windowId !== windowId);
      });
      // E5.8#43-4（③ 归属表清理）：onWindowClosed 仅脱出池窗触发（主窗关闭走 app.quit 不走本 IPC）——
      // 摘除该窗注册的全部命令归属。池窗销毁无 unregister IPC（池进程没了），不清理 → 路由仍
      // 指向已关窗 → 定向发空视图 → 10s 超时。
      purgePoolCommandWindows(windowId);
    });
    return unsub;
  }, []);

  // E5.8#43-3（I9-14 A6）：主进程 moved/resized 上报 → 更新该窗注册表 bounds——
  // 壳注册表是窗口状态唯一真相源，bounds 变化即持久化数据源（落盘由 useLayoutPersistence 消费）。
  // main 窗也更新（注册表信息完整），但 main 不持久化（主进程创建，非脱出窗）。
  useEffect(() => {
    const poolApi = window.linkdesk?.pool;
    if (!poolApi) return;
    const unsub = poolApi.onWindowBoundsChanged?.((payload: PoolWindowBoundsPayload) => {
      setWindows((prev) =>
        prev.some((w) => w.windowId === payload.windowId)
          ? prev.map((w) => (w.windowId === payload.windowId ? { ...w, bounds: payload.bounds } : w))
          : prev,
      );
    });
    return unsub;
  }, []);

  /** 壳登记脱出窗口 + 主进程建窗（#44 手势接入点；#43-3 恢复传 bounds）——幂等：同 windowId 不重复登记 */
  const createWindow = useCallback((windowId: string, tabState: TabState, bounds?: PoolWindowBoundsPayload["bounds"]) => {
    setWindows((prev) =>
      prev.some((w) => w.windowId === windowId) ? prev : [...prev, { windowId, mode: "detached", ready: false, tabState, ...(bounds ? { bounds } : {}) }],
    );
    // E5.8#43-3：恢复路径带持久化 bounds → 主进程 createPoolWindow 应用（重启新建）或复用忽略（F5）
    window.linkdesk?.pool?.createWindow?.({ windowId, ...(bounds ?? {}) });
  }, []);

  /** 壳移除脱出窗口 + 主进程关窗（空窗自灭/并回主窗口销毁——#44 消费） */
  const closeWindow = useCallback((windowId: string) => {
    setWindows((prev) => prev.filter((w) => w.windowId !== windowId));
    window.linkdesk?.pool?.closeWindow?.(windowId);
    // E5.8#43-4（③ 归属表清理）：壳驱动关窗同样销毁池 → 摘除该窗命令归属（同 onWindowClosed 理由）
    purgePoolCommandWindows(windowId);
  }, []);

  /** 更新某窗口 tabState——脱出窗标签操作经它写注册表（#44 TabBar 复用接线） */
  const updateTabState = useCallback((windowId: string, tabState: TabState) => {
    setWindows((prev) => prev.map((w) => (w.windowId === windowId ? { ...w, tabState } : w)));
  }, []);

  // E5.8#43-3（I9-15）：重启/F5 恢复脱出窗——读持久化清单逐窗重建（createWindow 上方已定义）。
  // 主进程幂等：F5 复用既有窗（bounds 保持实际值），重启新建（bounds 给 createPoolWindow 越界钳制）。
  // 幂等重跑安全（createWindow 壳侧 + 主进程双侧幂等）——StrictMode/HMR 双跑不重复登记。
  useEffect(() => {
    for (const d of getDetachedWindows()) {
      createWindow(d.windowId, emptyTabState(), d.bounds);
    }
  }, [createWindow]);

  return { windows, createWindow, closeWindow, updateTabState };
}
