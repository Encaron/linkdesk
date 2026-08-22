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

interface UseWindowHostOptions {
  /** 主窗标签页真相源（useTabManager）——活同步进注册表，主窗布局随标签操作即时重推 */
  mainTabState: TabState;
}

export interface UseWindowHostResult {
  /** 全部窗口状态注册表——usePoolSync 遍历就绪窗按模式策略组装布局并定向推送 */
  windows: WindowShellState[];
  /** 壳登记一个脱出窗口 + 通知主进程建窗（#44 手势消费：被脱出的组归属该窗） */
  createWindow(windowId: string, tabState: TabState): void;
  /** 壳移除一个脱出窗口 + 通知主进程关窗（空窗自灭/非回归关闭） */
  closeWindow(windowId: string): void;
  /** 更新某窗口的 tabState（脱出窗标签操作——#44 TabBar 复用接线） */
  updateTabState(windowId: string, tabState: TabState): void;
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
    });
    return unsub;
  }, []);

  /** 壳登记脱出窗口 + 主进程建窗（#44 手势接入点）——幂等：同 windowId 不重复登记 */
  const createWindow = useCallback((windowId: string, tabState: TabState) => {
    setWindows((prev) =>
      prev.some((w) => w.windowId === windowId) ? prev : [...prev, { windowId, mode: "detached", ready: false, tabState }],
    );
    window.linkdesk?.pool?.createWindow?.({ windowId });
  }, []);

  /** 壳移除脱出窗口 + 主进程关窗（空窗自灭/并回主窗口销毁——#44 消费） */
  const closeWindow = useCallback((windowId: string) => {
    setWindows((prev) => prev.filter((w) => w.windowId !== windowId));
    window.linkdesk?.pool?.closeWindow?.(windowId);
  }, []);

  /** 更新某窗口 tabState——脱出窗标签操作经它写注册表（#44 TabBar 复用接线） */
  const updateTabState = useCallback((windowId: string, tabState: TabState) => {
    setWindows((prev) => prev.map((w) => (w.windowId === windowId ? { ...w, tabState } : w)));
  }, []);

  return { windows, createWindow, closeWindow, updateTabState };
}
