/**
 * useSyncSubscriptions——usePoolSync 订阅 effect 组（E5.8#0d.10-5b：自 usePoolSync.ts 拆出）。
 * 全部 12 个订阅：registry 变化重推（onDidChangeActiveViews/layoutEngine/ContextKeyService/
 * i18n/onDidRegister）→ setLayoutVersion bump；池→壳回调（onSidebarAction/onTabAction）；
 * 池事件往返（marketplace:updateBadge/CHORD_CHANGED/状态栏/toast/通知回传/视图拖放）。
 * 纯订阅零推送——布局组装在主 effect（聚合器）。状态 setter/ref 走入参，无内部 state。
 * 依赖方向：useSubscriptions → core services/registry + ./notif（_seenIds 共享）；无反向。
 */

import { useEffect } from "react";
import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import { useTranslation } from "react-i18next";
import type { LinkDeskAPI } from "../../core/api/linkdesk-api"; // E5.7#98：poolApiRef 类型正源
import type { PoolTabAction } from "../../core/types/ipc/tabActions"; // E5.7#96：池→壳 tab 动作 wire 契约
import type { SidebarAction } from "../../core/types/ipc/sidebarActions"; // E5.7#98：onSidebarAction 回调参数正源
import { ViewContainerService } from "../../core/services/layout/ViewContainerService";
import { layoutEngine } from "../../core/services/layout/LayoutEngine"; // E5.6#11-fix7：池◀按钮→壳 setZoneWidth("sidebar", 28)
import { ContextKeyService } from "../../core/registry/commands/ContextKeyService"; // E5.7#5：槽位按钮 when 过滤 + context 变化重推
import { getViewPlugin, onDidRegister, onDidUnregister } from "../../pluginLoader/viewRegistry";
import { onDidChangeStatusBar } from "../../core/services/ui/StatusBarService"; // E5.7#8：状态栏动态项变化订阅
import { CUSTOM_EVENTS } from "../../core/react/events/CoreEvents"; // E5.7#8：Chord 提示
import { shellEvents, type StatusBarEntry } from "../../core/react/events/ShellEvents";
import { subscribeToasts, dismissToast, getToasts, setToastsSuppressed } from "../../core/services/ui/toast";
import { _seenIds } from "./notif"; // 通知未读追踪——事件回传共享序列化侧同一实例

interface UseSyncSubscriptionsInput {
  poolApiRef: MutableRefObject<NonNullable<LinkDeskAPI["pool"]> | null>;
  onTabAction?: (action: PoolTabAction) => void; // E5.7#96：wire 契约定型
  setLayoutVersion: Dispatch<SetStateAction<number>>;
  setChordLabel: Dispatch<SetStateAction<string | null>>;
  setEventEntries: Dispatch<SetStateAction<StatusBarEntry[]>>;
  chordTimerRef: MutableRefObject<ReturnType<typeof setTimeout> | null>;
}

/**
 * 订阅 effect 组——池/壳事件与 registry 变化 → setLayoutVersion bump / state 写入。
 * 与 usePoolSync 主推送 effect 通过 setLayoutVersion/state 松耦合（主 effect deps 消费）。
 */
export function useSyncSubscriptions({
  poolApiRef, onTabAction, setLayoutVersion, setChordLabel, setEventEntries, chordTimerRef,
}: UseSyncSubscriptionsInput): void {
  // E5.7#5：语言切换订阅——t() 变化（切语言）会触发 layoutVersion bump → 主 effect 重推
  const { i18n } = useTranslation();

  // 订阅 ViewContainerService.onDidChangeActiveViews——reorder/setVisible 后触发重推
  useEffect(() => {
    const sub = ViewContainerService.onDidChangeActiveViews.event(() => {
      setLayoutVersion((v) => v + 1);
    });
    return () => sub();
  }, [setLayoutVersion]);

  // E5.7#9：侧栏宽度真相源改读 LayoutEngine（zoneBounds→props 链已随壳 DOM 删除）。
  // onDidChangeLayout → layoutVersion bump——setZoneWidth 折叠/展开、窗口 resize、
  // Phase 3 #13 拖拽 commit 后重推布局。App 侧只喂 setContainerSize。
  useEffect(() => {
    const unsub = layoutEngine.onDidChangeLayout(() => {
      setLayoutVersion((v) => v + 1);
    });
    return unsub;
  }, [setLayoutVersion]);

  // E5.7#5：context key 变化（槽位按钮 when / 菜单 when 语义）与语言切换（t() 文案）→ 重推布局。
  // 壳 TitleBar 用 onDidChangeContext 触发重渲染——池版等价物是 layoutVersion bump。
  useEffect(() => {
    const unsub = ContextKeyService.onDidChangeContext(() => {
      setLayoutVersion((v) => v + 1);
    });
    const onLangChanged = () => {
      setLayoutVersion((v) => v + 1);
    };
    i18n.on("languageChanged", onLangChanged);
    return () => {
      unsub();
      i18n.off("languageChanged", onLangChanged);
    };
  }, [i18n, setLayoutVersion]);

  // E5.7#6：Phase 5h Step 1 同款——插件注册/注销时重推（安装插件后图标栏即时更新）
  useEffect(() => {
    const unsub1 = onDidRegister.event(() => setLayoutVersion((v) => v + 1));
    const unsub2 = onDidUnregister.event(() => setLayoutVersion((v) => v + 1));
    return () => { unsub1(); unsub2(); };
  }, [setLayoutVersion]);

  // E5.6#11j：注册池→壳侧栏操作回调。池组件调用 pool.sidebarAction() →
  // 主进程转发 → 壳 preload → 此 handler → ViewContainerService 写方法。
  useEffect(() => {
    const poolApi = poolApiRef.current;
    if (!poolApi) return;
    const unsub = poolApi.onSidebarAction?.((action: SidebarAction) => {
      switch (action?.action) {
        case "reorder": {
          // E5.7#98：契约字段全可选——守卫缺字段载荷（原 any 直传会炸在服务内部）
          const { containerId, viewId, newIndex } = action;
          if (!containerId || viewId === undefined || newIndex === undefined) break;
          ViewContainerService.reorderView(containerId, viewId, newIndex);
          break;
        }
        case "setCollapsed": {
          if (action.pluginId === undefined || action.viewId === undefined || action.collapsed === undefined) break;
          // E5.8#41.9.2：复合键持久化——(pluginId, viewId)
          ViewContainerService.setCollapsed(action.pluginId, action.viewId, action.collapsed);
          setLayoutVersion((v) => v + 1);  // setCollapsed 不 fire 事件——手动触发重推
          break;
        }
        case "setVisible": {
          if (!action.containerId || action.viewId === undefined || action.visible === undefined) break;
          ViewContainerService.setVisible(action.containerId, action.viewId, action.visible);
          break;
        }
        // E5.7#13：分隔线拖拽 commit——resizeZone 钳制（与 E5.6 壳分隔线拖拽语义同款）
        // → onDidChangeLayout → layoutVersion bump → pushLayout 回执（真相源在壳）
        case "setSidebarWidth": {
          if (action.width === undefined) break;
          layoutEngine.resizeZone("sidebar", action.width);
          break;
        }
        // E5.6#11-fix7 + E5.7#10：池◀/▶按钮——转发 App 侧栏宿主状态机 doCollapse
        // （图标点击/池按钮/view 菜单三条折叠路径共用一个真相源 + preCollapseWidth 恢复）。
        // zone 宽变化 → onDidChangeLayout → 重推 layout → 池 collapsed 派生。
        case "toggleSidebarCollapse": {
          shellEvents.emit("sidebar:toggle", undefined);
          break;
        }
        // E5.6#16.5：updateSplitSizes 已迁移到 pool.tabAction 通道——此处不再处理
      }
    });
    return unsub;
  }, [poolApiRef, setLayoutVersion]);

  // E5.6#16.5：注册池→壳主区 tab 操作回调。池组件调用 pool.tabAction() →
  // 主进程转发 → 壳 preload → 此 handler → useTabManager 方法（通过 onTabAction 回调）。
  useEffect(() => {
    const poolApi = poolApiRef.current;
    if (!poolApi || !onTabAction) return;
    const unsub = poolApi.onTabAction?.((action: PoolTabAction) => {
      onTabAction(action);
    });
    return unsub;
  }, [onTabAction, poolApiRef]);

  // E5.6#11-fix：接收池侧 marketplace badge 更新事件→写入壳 ViewContainerService。
  // 池内 ViewContainerService 是空实例——marketplaceShared 的 updateAllBadges 改走 events.emit，
  // 壳监听到后写入壳 ViewContainerService → onDidChangeActiveViews 触发 layoutVersion bump → 重推布局。
  useEffect(() => {
    // E5.8#41.9.2：payload 带 pluginId/containerId（marketplace 插件自持身份，#41.8 §4 调用方 #3）——
    // 壳侧零硬编码插件 ID（硬约束 10），getView/registerView 复合寻址
    const unsub = window.linkdesk?.events?.on(
      "marketplace:updateBadge",
      (data: { pluginId: string; containerId: string; viewId: string; count: number }) => {
        const existing = ViewContainerService.getView(data.pluginId, data.viewId);
        if (!existing) return;
        // 防重推循环——badge 值未变则跳过
        if (existing.badge === data.count) return;
        ViewContainerService.registerView(data.pluginId, data.containerId, {
          id: data.viewId,
          title: existing.title,
          render: existing.render,
          badge: data.count,
        });
      }
    );
    return () => { unsub?.(); };
  }, []);

  // E5.7#8：Chord 状态——壳 StatusBar.tsx:90-115 CHORD_CHANGED 订阅迁入。
  // 按键名是技术标识符不走 i18n（E5.5#7-p9），字符串壳侧构建 → 池哑渲染。
  useEffect(() => {
    const handler = (e: Event) => {
      const { isPending, firstKey, failedKey } = (e as CustomEvent).detail as {
        isPending: boolean; firstKey?: string; failedKey?: string;
      };
      if (chordTimerRef.current) { clearTimeout(chordTimerRef.current); chordTimerRef.current = null; }
      if (isPending && firstKey) {
        const display = firstKey.replace(/\b\w/g, (c) => c.toUpperCase());
        setChordLabel(`(${display}) 已按下，正在等待第二键…`);
      } else if (failedKey && firstKey) {
        // 对标 VS Code："(Ctrl+K, unknown) is not a command"
        const f1 = firstKey.replace(/\b\w/g, (c) => c.toUpperCase());
        const f2 = failedKey.replace(/\b\w/g, (c) => c.toUpperCase());
        setChordLabel(`组合键 (${f1}, ${f2}) 不是命令`);
        chordTimerRef.current = setTimeout(() => setChordLabel(null), 3000);
      } else {
        setChordLabel(null);
      }
    };
    window.addEventListener(CUSTOM_EVENTS.CHORD_CHANGED, handler);
    return () => {
      window.removeEventListener(CUSTOM_EVENTS.CHORD_CHANGED, handler);
      if (chordTimerRef.current) clearTimeout(chordTimerRef.current);
    };
  }, [chordTimerRef, setChordLabel]);

  // E5.7#8：动态状态栏项 / 标签页切换 / toast 变更 / 事件条目 → 重推
  // （壳 StatusBar 的 setStatusBarTick + NotificationCenter 的 setNotifications 订阅迁入）
  useEffect(() => onDidChangeStatusBar.event(() => setLayoutVersion((v) => v + 1)), [setLayoutVersion]);
  useEffect(() => shellEvents.on("tab:focused", () => setLayoutVersion((v) => v + 1)), [setLayoutVersion]);
  // E5.7#6 补丁：图标拖拽换位 commit 回环——壳收到 icon:reordered 持久化后重推权威序，
  // 池 localIcons 对齐（真相源在壳；IconBarZone 拖拽期间忽略推送防闪跳）。
  useEffect(() => shellEvents.on("icon:reordered", () => setLayoutVersion((v) => v + 1)), [setLayoutVersion]);
  useEffect(() => subscribeToasts(() => setLayoutVersion((v) => v + 1)), [setLayoutVersion]);
  useEffect(() => {
    const unsub = shellEvents.on("statusbar:update", (entries) => {
      setEventEntries(entries);
    });
    return unsub;
  }, [setEventEntries]);

  // E5.7#8：池通知面板操作回传（events 往返）——壳 NotificationCenter 语义迁入：
  // 面板开闭 → setToastsSuppressed + 标记已读；单条关闭/全部清除 → dismissToast；
  // 动作点击 → 壳侧执行 onClick 闭包 + 关闭（闭包不可序列化，只能壳侧跑）。
  useEffect(() => {
    const events = window.linkdesk?.events;
    const offPanel = events?.on("notif:panel", (payload) => {
      // E5.7#97：通道契约——池 emit 只传 boolean（面板开闭态）
      if (typeof payload !== "boolean") return;
      setToastsSuppressed(payload);
      if (payload) {
        for (const n of getToasts()) _seenIds.add(n.id);
        setLayoutVersion((v) => v + 1);  // 标记已读不 fire toast 事件——手动重推
      }
    });
    const offDismiss = events?.on("notif:dismiss", (payload) => {
      if (typeof payload === "string") dismissToast(payload);
    });
    const offClearAll = events?.on("notif:clearAll", () => {
      getToasts().forEach((n) => dismissToast(n.id));
    });
    const offAction = events?.on("notif:action", (payload) => {
      const data = payload as { id?: unknown; index?: unknown } | null | undefined;
      if (!data || typeof data.id !== "string" || typeof data.index !== "number") return;
      const toast = getToasts().find((n) => n.id === data.id);
      const action = toast?.actions?.[data.index];
      if (action) { action.onClick(); dismissToast(data.id); }
    });
    return () => { offPanel?.(); offDismiss?.(); offClearAll?.(); offAction?.(); };
  }, [setLayoutVersion]);

  // E5.7#10：E4V#48 视图跨容器拖放 commit——池 IconBarZone drop → 壳 moveView。
  // 壳 IconBar handleIconDrop 语义迁入（toPluginId 解析目标插件首个容器；无 viewsContainers
  // 声明则无动作）。moveView 更新双容器活跃 views + 手动 bump 重推确认（真相源在壳）。
  useEffect(() => {
    const unsub = window.linkdesk?.events?.on("view:droppedOnIcon", (payload) => {
      // E5.7#97：通道契约——池 emit 只传 { viewId, fromContainerId, toPluginId } 三字符串
      const data = payload as { viewId?: unknown; fromContainerId?: unknown; toPluginId?: unknown } | null | undefined;
      if (!data || typeof data.viewId !== "string" || typeof data.fromContainerId !== "string" || typeof data.toPluginId !== "string") return;
      const toPlugin = getViewPlugin(data.toPluginId);
      const containers = toPlugin?.manifest.contributes?.viewsContainers as Record<string, unknown> | undefined;
      const toContainerId = containers ? Object.keys(containers)[0] : undefined;
      if (!toContainerId) return;
      ViewContainerService.moveView(data.viewId, data.fromContainerId, toContainerId);
      setLayoutVersion((v) => v + 1);
    });
    return () => { unsub?.(); };
  }, [setLayoutVersion]);
}
