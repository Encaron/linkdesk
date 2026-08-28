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

import { useCallback, useEffect, useRef, useState } from "react";
import type { TabState } from "../hooks/useTabManager";
import type { WindowShellState, WindowMode } from "./windows";
import { getDetachedWindows } from "../core/services/layout/LayoutService";
import type { PoolWindowBoundsPayload } from "../core/types/ipc/poolActions";
import { purgePoolCommandWindows } from "../core/registry/commands/CommandRegistry"; // E5.8#43-4：窗口关闭 → 归属表清该窗命令
// E5.8#46.2：资源事件跨窗广播——windowHost 是壳侧唯一订阅点（全窗事实来源）
import { shellEvents } from "../core/react/events/ShellEvents";
import { normalizePath } from "../core/utils/path/pathUtils"; // file:renamed label 派生（basename——壳桥只做路径语义，不派生资源概念）
import {
  reduceUpdateTabLabelBySourceId,
  reduceResourceRenamed,
  reduceResourceDeleted,
  reduceCloseBySourceId,
  reduceRemoveTabsByPlugin,
  reduceRemoveTabsUnderFolder,
} from "../hooks/useTabManager/reducers-tab"; // 脱出窗广播 reducer（与主窗 useTabManager 同源，语义归一）

/** E5.8#46.2：主窗资源联动动作集——windowHost 广播 effect 主窗分支经 ref 调用。
 *  命名与 useTabManager 稳定方法一一对应（useCallback [] 恒等）——主窗副作用归 useTabManager 真相源。 */
export interface MainResourceActions {
  renameResourceBySourceId(oldSourceId: string, newSourceId: string, label?: string): void;
  deleteResourceBySourceId(sourceId: string): void;
  updateTabLabelBySourceId(sourceId: string, label: string): void;
  closeTabBySourceId(sourceId: string): void;
  removeTabsByPlugin(pluginId: string): void;
  removeTabsUnderFolder(folderUri: string): void;
}

interface UseWindowHostOptions {
  /** 主窗标签页真相源（useTabManager）——活同步进注册表，主窗布局随标签操作即时重推 */
  mainTabState: TabState;
  /** E5.8#45：漂移面板窗关闭回调——壳消费关闭面板（I9-13 拍板 A：关窗即关会话，不回归主窗口）。
   *   OS ×（onWindowClosed）与壳驱动 closeWindow 双路径同触发。 */
  onDriftWindowClosed?: () => void;
  /** E5.8#46.2：主窗资源联动动作集——广播 effect 主窗分支消费（App 传入 useTabManager 方法；
   *  缺省 = 脱出窗仍广播、主窗不动——hook 可独立用于无主窗场景）。 */
  mainResourceActions?: MainResourceActions;
}

export interface UseWindowHostResult {
  /** 全部窗口状态注册表——usePoolSync 遍历就绪窗按模式策略组装布局并定向推送 */
  windows: WindowShellState[];
  /** 壳登记一个窗口 + 通知主进程建窗（#44 手势消费：被脱出的组归属该窗；#43-3 恢复传 bounds；
   *   #45 漂移面板传 mode:"drift"）。mode 缺省 "detached"。 */
  createWindow(windowId: string, tabState: TabState, bounds?: PoolWindowBoundsPayload["bounds"], mode?: WindowMode): void;
  /** 壳移除一个脱出窗口 + 通知主进程关窗（空窗自灭/非回归关闭） */
  closeWindow(windowId: string): void;
  /** 更新某窗口的 tabState（脱出窗标签操作——#44 TabBar 复用接线） */
  updateTabState(windowId: string, tabState: TabState): void;
}

/** 空窗 tabState——恢复窗用（#43-3 此刻无 tab，组归属随 #44 拖出后写入）；#45 漂移面板窗（恒空，主区空占位 I9-13）。
 *  #45-C panelDrift 复用——两消费方（恢复 effect 同模块 + panelDrift 建 drift 窗）。 */
export function emptyTabState(): TabState {
  return { groups: [], activeGroupId: "", root: { type: "leaf", groupId: "" } };
}

/** E5.8#46.2 跨窗资源广播——mapper 结果契约 */
export interface MapResourceWindowsResult {
  /** 映射后的窗口注册表（main 跳过；空窗不写回，原引用保留） */
  windows: WindowShellState[];
  /** reduce 后变空的脱出窗——壳调 closeWindow 空窗自灭（I9-8 窗口模式策略 autoClose） */
  emptyWindows: string[];
}

/** E5.8#46.2：资源事件跨窗广播的纯映射——main 窗跳过（归 useTabManager 真相源，副作用走主窗方法），
 *  脱出窗逐窗 reduce(tabState)；reduce 后空窗收 emptyWindows 不写回（壳 closeWindow 关窗自灭）。
 *  全窗无变化 → 返回原 windows 引用（React bailout）——#46.12 死循环止血：setWindows 函数式更新器返回原引用即不触发重渲染。 */
export function mapResourceAcrossWindows(
  windows: WindowShellState[],
  reduce: (tabState: TabState) => TabState,
): MapResourceWindowsResult {
  const emptyWindows: string[] = [];
  let changed = false;
  const mapped = windows.map((w) => {
    if (w.mode === "main") return w;
    const next = reduce(w.tabState);
    if (next === w.tabState) return w;
    changed = true;
    // 空窗判定：groups 空 or 全部组 tabs 空（reduceRemoveAllTabs 单面板末 tab 删 → 空组保留）
    if (next.groups.length === 0 || next.groups.every((g) => g.tabs.length === 0)) {
      emptyWindows.push(w.windowId);
      return w;
    }
    return { ...w, tabState: next };
  });
  if (!changed) return { windows, emptyWindows };
  return { windows: mapped, emptyWindows };
}

/** E5.8#46.2：file:renamed 标签派生——壳桥只做路径语义（basename），不派生资源概念（label 语义归事件负载）。
 *  normalizePath 归一斜杠/盘符后取末段；空路径兜底原值。 */
function basenameOf(path: string): string {
  return normalizePath(path).split("/").pop() || path;
}

export function useWindowHost({ mainTabState, onDriftWindowClosed, mainResourceActions }: UseWindowHostOptions): UseWindowHostResult {
  // 初始只有主窗——ready:true（主池可立即接收布局，preload 缓冲回放；onReady('main') 仅确认）
  const [windows, setWindows] = useState<WindowShellState[]>(() => [
    { windowId: "main", mode: "main", ready: true, tabState: mainTabState },
  ]);

  // E5.8#45：windows 活引用——onWindowClosed/closeWindow 判 drift 模式走 ref（setState 更新器恒纯，硬约束 6）
  const windowsRef = useRef(windows);
  windowsRef.current = windows;
  // onDriftWindowClosed 稳定 ref——effect 依赖 [] 注册一次，回调体读活值
  const onDriftWindowClosedRef = useRef(onDriftWindowClosed);
  onDriftWindowClosedRef.current = onDriftWindowClosed;
  // E5.8#46.2：主窗资源联动动作集稳定 ref——广播 effect 依赖 [] 恒等注册，回调体读活值（#46.12 死循环止血：闭包不抓动作集）
  const mainResourceActionsRef = useRef(mainResourceActions);
  mainResourceActionsRef.current = mainResourceActions;

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
      // E5.8#45：漂移面板窗判定走 ref（闭包外读）——setState 更新器内不写副作用（硬约束 6）
      const isDrift = windowsRef.current.find((w) => w.windowId === windowId)?.mode === "drift";
      setWindows((prev) => {
        const entry = prev.find((w) => w.windowId === windowId);
        if (!entry || entry.mode === "main") return prev;
        return prev.filter((w) => w.windowId !== windowId);
      });
      // E5.8#45：漂移面板窗关闭 = 关闭面板（I9-13 拍板 A——关窗即关会话，不回归主窗口）
      if (isDrift) onDriftWindowClosedRef.current?.();
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

  /** 壳登记窗口 + 主进程建窗（#44 手势接入点；#43-3 恢复传 bounds；#45 漂移面板传 mode:"drift"）——
   *  幂等：同 windowId 不重复登记。mode 缺省 "detached"（既有调用零改动）。 */
  const createWindow = useCallback(
    (windowId: string, tabState: TabState, bounds?: PoolWindowBoundsPayload["bounds"], mode: WindowMode = "detached") => {
      setWindows((prev) =>
        prev.some((w) => w.windowId === windowId)
          ? prev
          : [...prev, { windowId, mode, ready: false, tabState, ...(bounds ? { bounds } : {}) }],
      );
      // E5.8#43-3：恢复路径带持久化 bounds → 主进程 createPoolWindow 应用（重启新建）或复用忽略（F5）
      // E5.8#44 实机修复诊断：hasAPI 区分「壳 preload 未暴露」vs「主进程未收到」两态（写 protocol-debug.log）
      console.error(`[shell] createWindow IPC → windowId=${windowId} bounds=${JSON.stringify(bounds ?? null)} hasAPI=${typeof window.linkdesk?.pool?.createWindow}`);
      window.linkdesk?.pool?.createWindow?.({ windowId, ...(bounds ?? {}) });
    },
    [],
  );

  /** 壳移除窗口 + 主进程关窗（空窗自灭/并回主窗口销毁——#44 消费；#45 漂移面板窗经它关闭=关闭面板） */
  const closeWindow = useCallback((windowId: string) => {
    // E5.8#45：漂移判定走 ref（更新器外读）——更新器恒纯（硬约束 6）
    const isDrift = windowsRef.current.find((w) => w.windowId === windowId)?.mode === "drift";
    setWindows((prev) => prev.filter((w) => w.windowId !== windowId));
    window.linkdesk?.pool?.closeWindow?.(windowId);
    // E5.8#45：漂移面板窗关闭 = 关闭面板（I9-13 拍板 A——关窗即关会话，不回归主窗口）
    if (isDrift) onDriftWindowClosedRef.current?.();
    // E5.8#43-4（③ 归属表清理）：壳驱动关窗同样销毁池 → 摘除该窗命令归属（同 onWindowClosed 理由）
    purgePoolCommandWindows(windowId);
  }, []);

  /** E5.8#46.2：脱出窗跨窗广播应用——函数式 setWindows（React 串行应用不丢并发更新）+ reduce 后空窗纯移除
   *  （自灭注册表侧 I9-8）；IPC 关窗副作用在更新器外（硬约束 6）。空窗预判读 windowsRef 最近提交态
   *  （事件 handler 串行 + 幂等 reduce 判定稳定）；mapResourceAcrossWindows 无变化返原引用 = React bailout（#46.12 止血）。 */
  const applyToDetached = useCallback(
    (reduce: (state: TabState) => TabState) => {
      const { emptyWindows } = mapResourceAcrossWindows(windowsRef.current, reduce);
      setWindows((prev) => {
        const r = mapResourceAcrossWindows(prev, reduce);
        return r.windows.filter((w) => !emptyWindows.includes(w.windowId));
      });
      for (const id of emptyWindows) closeWindow(id);
    },
    [closeWindow],
  );

  // E5.8#46.2：资源事件跨窗广播——windowHost 唯一订阅点（壳侧，全窗事实来源）。
  // 主窗分支经 mainResourceActionsRef 调 useTabManager 方法（更新器外副作用）；脱出窗分支 applyToDetached
  // 更新注册表 → usePoolSync 布局重推 → 脱出窗 UI 同步。6 事件族：file:renamed/deleted（文件树）、
  // tab:updateLabelBySourceId/closeBySourceId（tabs API）、plugin:removed（卸载）、workspace:folderRemoved（工作区）。
  // 🔥 #46.12 死循环止血铁律：effect deps [] 恒等注册（windows/tabState 变化绝不复订阅）；主窗方法调用在
  // setWindows 更新器外；无事件重发射；mapResourceAcrossWindows bailout 拦截无变化重渲染。
  useEffect(() => {
    const main = mainResourceActionsRef.current;
    const unsubs = [
      shellEvents.on("file:renamed", ({ oldPath, newPath }) => {
        const label = basenameOf(newPath);
        main?.renameResourceBySourceId(oldPath, newPath, label);
        applyToDetached((s) => reduceResourceRenamed(s, oldPath, newPath, label));
      }),
      shellEvents.on("file:deleted", ({ filePath }) => {
        main?.deleteResourceBySourceId(filePath);
        applyToDetached((s) => reduceResourceDeleted(s, filePath));
      }),
      shellEvents.on("tab:updateLabelBySourceId", ({ sourceId, label }) => {
        main?.updateTabLabelBySourceId(sourceId, label);
        applyToDetached((s) => reduceUpdateTabLabelBySourceId(s, sourceId, label));
      }),
      shellEvents.on("tab:closeBySourceId", ({ sourceId }) => {
        main?.closeTabBySourceId(sourceId);
        applyToDetached((s) => reduceCloseBySourceId(s, sourceId));
      }),
      shellEvents.on("plugin:removed", ({ pluginId }) => {
        main?.removeTabsByPlugin(pluginId);
        applyToDetached((s) => reduceRemoveTabsByPlugin(s, pluginId));
      }),
      shellEvents.on("workspace:folderRemoved", ({ folderUri }) => {
        main?.removeTabsUnderFolder(folderUri);
        applyToDetached((s) => reduceRemoveTabsUnderFolder(s, folderUri));
      }),
    ];
    return () => {
      unsubs.forEach((u) => u());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- deps [] 恒等注册是 #46.12 死循环止血的铁律（闭包读 ref 活值）
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
