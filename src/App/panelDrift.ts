/**
 * usePanelDrift——壳侧面板脱出（E5.8#45）。
 *
 * PanelZone ⤢ → events.emit("panel:detach") → 壳桥 → detachPanel()：
 * 建「漂移面板窗」（mode:"drift"）——面板专用窗（恒空 groups，主区空占位 I9-13 拍板 A），
 * 面板独占迁移（main 停推 panel / drift 窗恒推——usePoolSync panelDetached + assembleWindowLayout 裁决）。
 *
 * 三层架构（#43/#45）：壳 = 窗口策略真相源——本 hook 只做策略（生成 windowId + 建窗），
 * 窗口实体生命周期归主进程 window-manager（经 createWindow → pool.createWindow IPC 驱动）。
 *
 * 幂等：已有 drift 窗（面板已脱出）→ 不重复建（面板独占——面板恒只在一个窗口渲染）。
 * 默认 bounds：主窗级联偏移（脱出窗同款——新窗落在主窗旁）；主窗无 bounds → 缺省（主进程兜底）。
 *
 * 消费方：App.tsx useUiBridges（panel:detach 桥）。
 */

import { useCallback, useRef } from "react";
import type { TabState } from "../hooks/useTabManager";
import type { WindowShellState, WindowMode } from "./windows";
import type { PoolWindowBoundsPayload } from "../core/types/ipc/poolActions";
import { emptyTabState } from "./windows/windowHost";

export interface UsePanelDriftDeps {
  /** 壳窗口注册表（useWindowHost）——G6 ref 桥读最新（detach 幂等判定 + 级联 bounds），免重渲 */
  windows: WindowShellState[];
  createWindow: (windowId: string, tabState: TabState, bounds?: PoolWindowBoundsPayload["bounds"], mode?: WindowMode) => void;
}

export interface UsePanelDriftResult {
  /** 脱出面板到独立窗口——面板专用 drift 窗（独占：已有 drift 窗时 no-op，幂等） */
  detachPanel: () => void;
}

export function usePanelDrift({ windows, createWindow }: UsePanelDriftDeps): UsePanelDriftResult {
  // G6 ref 桥——windows 只读不 setState（windowRelocation 同款；detachPanel 每次读最新注册表）
  const windowsRef = useRef(windows);
  windowsRef.current = windows;

  const detachPanel = useCallback((): void => {
    // 幂等：已有漂移面板窗 → 面板已在外，不重复建（面板独占——恒只在一个窗口渲染）
    if (windowsRef.current.some((w) => w.mode === "drift")) return;
    // E5.8#46.17：默认 bounds 改「面板专属小窗」——不再照抄主窗尺寸（此前主窗一样大的窗里塞一条
    // 面板 + 大片空白，用户点名敷衍）。高 ≈ 标题栏(30) + 面板默认(220, persistence) + 余量 ≈ 280；
    // 宽收窄到 800 上限（面板独占全窗——配合 drift zones 去 groups）。主窗无 bounds（未移过）→ 缺省（主进程兜底）。
    const main = windowsRef.current.find((w) => w.mode === "main");
    const bounds: PoolWindowBoundsPayload["bounds"] | undefined = main?.bounds
      ? { x: main.bounds.x + 40, y: main.bounds.y + 40, width: Math.min(main.bounds.width, 800), height: 280 }
      : undefined;
    createWindow(crypto.randomUUID(), emptyTabState(), bounds, "drift");
  }, [createWindow]);

  return { detachPanel };
}
