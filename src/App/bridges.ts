/**
 * App 壳↔池 UI 桥 hook——useUiBridges：聪慧→哑 桥接器集合。
 * E5.8#0d.10-3d：自 App.tsx 拆出——池 events 转发（icon:selected/reordered + panel:viewSelected/resize）+
 * QuickPick/Toast/Dialog 三哑桥 + 内存压力通知。
 * 依赖方向：bridges → core/services/ui（QuickPick/toast/Dialog/Notification）+ shellEvents + layoutEngine + i18n；
 * App 消费：useUiBridges({ setPanelActiveViewId })。无反向依赖。
 */

import { useEffect } from "react";
import { QuickPickService } from "../core/services/ui/QuickPickService";
import { serializeToasts, runToastAction, subscribeToasts, subscribeToastSuppressed, dismissToast, TOAST_TTL_INFO } from "../core/services/ui/toast";
import { registerDialogRenderers, type DialogOptions } from "../core/services/ui/DialogService";
import { pushToast } from "../core/services/ui/NotificationService";
import { shellEvents } from "../core/react/events/ShellEvents";
import { layoutEngine } from "../core/services/layout/LayoutEngine";
import { ViewContainerService } from "../core/services/layout/ViewContainerService"; // E5.8#34：面板切换器勾选显隐
import i18n from "../i18n";
import { showPanelCreatePicker } from "./panelCreatePicker"; // E5.8#32：面板 [+] 视图选择器

export interface UiBridgesDeps {
  setPanelActiveViewId: (v: string | null) => void;
  /** E5.8#32：面板激活视图 ref（App 同步）——panel:createView 桥 serialize 判断已激活勾选。ref 稳定 → 桥 effect 不重注册 */
  panelActiveViewIdRef: { current: string | null };
}

/** 壳↔池 UI 桥接器集合——全部独立 window/服务订阅，注册一次（setPanelActiveViewId 是 useState 稳定 setter，deps 恒不变） */
export function useUiBridges({ setPanelActiveViewId, panelActiveViewIdRef }: UiBridgesDeps): void {
  // E5.7#6：桥接池图标栏点击——池 events.emit("icon:selected") → 主进程 plugin:emit →
  // 壳 plugin:push → linkdesk.events.on → 转壳内 shellEvents（消费方 App/useTabManager 开标签）。
  useEffect(() => {
    const unsub = window.linkdesk?.events?.on("icon:selected", (payload) => {
      // E5.7#97：events 载荷面 unknown——通道契约：池 emit 只传 pluginId 字符串
      if (typeof payload === "string") shellEvents.emit("icon:selected", payload);
    });
    return () => { unsub?.(); };
  }, []);

  // E5.7#6 补丁：桥接池图标拖拽换位——池 events.emit("icon:reordered") → 主进程 plugin:emit →
  // 壳 plugin:push → linkdesk.events.on → 转壳内 shellEvents → 上方 E5#7d 订阅持久化 iconOrder，
  // usePoolSync 订阅重推 → 池收到壳确认的权威序（真相源在壳——#13 乐观本地 + commit 同款）。
  useEffect(() => {
    const unsub = window.linkdesk?.events?.on("icon:reordered", (payload) => {
      // E5.7#97：通道契约——池 emit 只传 string[]（重排后的 iconOrder 全量）
      if (Array.isArray(payload)) shellEvents.emit("icon:reordered", payload as string[]);
    });
    return () => { unsub?.(); };
  }, []);

  // E5.8#25.1：桥接池文件资源事件——文件树 emit file:deleted/file:renamed → 主进程 broadcast
  // （plugin:push 发壳+发池）→ 本桥 → shellEvents → 壳 TabManager 集中联动（E5#54b 订阅：
  // deleted→forceCloseTab 关标签、renamed→迁移 label+sourceId+filePath）。模式级通用——
  // 未来任何插件 emit 资源事件走同款桥加一行即联动（零专一化命名；tabs 不需新 API，壳已内置 sourceId 迁移）。
  useEffect(() => {
    const events = window.linkdesk?.events;
    const offDeleted = events?.on("file:deleted", (payload) => {
      const filePath = (payload as { filePath?: unknown } | null | undefined)?.filePath;
      if (typeof filePath !== "string") return;
      shellEvents.emit("file:deleted", { filePath });
      // 删除联动 toast——对标串口侧栏关闭会话即删标签的即时反馈
      pushToast({ message: i18n.t("文件已删除，标签已关闭"), severity: "info", ttl: TOAST_TTL_INFO });
    });
    const offRenamed = events?.on("file:renamed", (payload) => {
      const d = payload as { oldPath?: unknown; newPath?: unknown } | null | undefined;
      if (!d || typeof d.oldPath !== "string" || typeof d.newPath !== "string") return;
      shellEvents.emit("file:renamed", { oldPath: d.oldPath, newPath: d.newPath });
    });
    return () => { offDeleted?.(); offRenamed?.(); };
  }, []);

  // E5.7#63.7：桥接池面板事件（icon:selected 同款通道）——
  //   panel:viewSelected → App state（usePoolSync 重推 activeViewId，真相源在壳）
  //   panel:resize      → LayoutEngine resizeZoneHeight 钳制 → onDidChangeLayout → 重推回执（#13 同款）
  //   panel:createView  → Phase 12 面板创建消费——三件套范围外，暂无人监听（池 emit 零订阅 = no-op）
  //   panel:toggleViewVisibility → ViewContainerService（E5.8#34 切换器勾选显隐——setVisible 落盘 +
  //     fire onDidChangeActiveViews → usePoolSync layoutVersion 重推回执，全自动）
  useEffect(() => {
    const events = window.linkdesk?.events;
    const offSelect = events?.on("panel:viewSelected", (payload) => {
      // E5.7#97：通道契约——池 emit 只传 viewId 字符串
      if (typeof payload === "string") setPanelActiveViewId(payload);
    });
    const offResize = events?.on("panel:resize", (payload) => {
      // E5.7#97：通道契约——池 emit 只传 { height: number }。Number.isFinite 单守卫即排除
      // undefined/NaN/字符串——双保险防坏值
      const height = (payload as { height?: unknown } | null | undefined)?.height;
      if (typeof height === "number" && Number.isFinite(height)) {
        layoutEngine.resizeZoneHeight("panel", height);
      }
    });
    const offToggleVis = events?.on("panel:toggleViewVisibility", (payload) => {
      // E5.7#97：通道契约——池 emit 只传 { containerId, viewId } 双字符串，双守卫防坏值
      const p = (payload ?? {}) as { containerId?: unknown; viewId?: unknown };
      if (typeof p.containerId === "string" && typeof p.viewId === "string") {
        ViewContainerService.toggleViewVisibility(p.containerId, p.viewId);
      }
    });
    return () => { offSelect?.(); offResize?.(); offToggleVis?.(); };
  }, [setPanelActiveViewId]);

  // E5.8#32：桥接池面板 [+] 新建视图——panel:createView（现网 emit 零监听 no-op——#88 ③）→
  // QuickPick 视图选择器（showPanelCreatePicker 壳侧构建 + QuickPick 桥推 DTO，复用 #15 现成链路）。
  // 无 panel 贡献容器时 picker 列表空（QuickPick 空态）——命令无可见效果。
  useEffect(() => {
    const unsub = window.linkdesk?.events?.on("panel:createView", () => {
      showPanelCreatePicker(setPanelActiveViewId, panelActiveViewIdRef);
    });
    return () => { unsub?.(); };
  }, [setPanelActiveViewId, panelActiveViewIdRef]);

  // E5.7#15：QuickPick 聪慧→哑桥——壳状态序列化成 DTO 推池 QuickPickHost 哑渲染，
  // 池动作（select/highlight/close/itemAction）按 key 回传，壳重解析原始 item 执行回调。
  useEffect(() => {
    const poolApi = window.linkdesk?.pool;
    if (!poolApi?.pushQuickPick || !poolApi?.onQuickPickAction) return;

    const push = () => {
      const st = QuickPickService.getState<unknown>();
      if (!st || !st.open) {
        poolApi.pushQuickPick({ open: false, placeholder: "", items: [] });
        return;
      }
      poolApi.pushQuickPick({
        open: true,
        placeholder: st.placeholder,
        prefix: st.prefix,
        items: st.items.map((it) => st.serialize(it)),
      });
    };

    const unsubChange = QuickPickService.onChange(push);

    // 池动作回传——按 key 重解析原始 item（函数无法过 IPC，壳侧执行）。
    // 动作用查表分发——避免 lowercase 字面量比较（no-restricted-syntax 误报规则）
    const unsubAction = poolApi.onQuickPickAction((action: { type: string; key?: string; actionId?: string }) => {
      const st = QuickPickService.getState<unknown>();
      if (!st || !st.open) return;
      const item = action.key !== undefined
        ? st.items.find((it) => st.getKey(it) === action.key)
        : undefined;
      const handlers: Record<string, () => void> = {
        // 对标壳 QuickPick handleSelect——先 onSelect 再 onClose
        select: () => {
          if (item !== undefined) {
            st.onSelect(item);
            st.onClose();
          }
        },
        highlight: () => {
          if (item !== undefined) st.onHighlight?.(item);
        },
        close: () => st.onClose(),
        itemAction: () => {
          if (item !== undefined && action.actionId !== undefined) st.onItemAction?.(item, action.actionId);
        },
      };
      handlers[action.type]?.();
    });

    // 挂载时同步当前状态——防桥接前已打开的面板
    push();

    return () => {
      unsubChange();
      unsubAction();
    };
  }, []);

  // E5.7#16：Toast 聪慧→哑桥——壳 toast 服务序列化全量快照推池 ToastHost 哑渲染，
  // 池动作（dismiss/action）按 id + actionId 回传，壳重解析 onClick 闭包执行。
  useEffect(() => {
    const poolApi = window.linkdesk?.pool;
    if (!poolApi?.pushToast || !poolApi?.onToastAction) return;

    const push = () => poolApi.pushToast(serializeToasts());

    const unsubToasts = subscribeToasts(push);
    const unsubSuppressed = subscribeToastSuppressed(push);

    // 池动作回传——按 id + actionId 重解析（onClick 闭包不过 IPC，壳侧执行）。
    // 动作用查表分发——避免 lowercase 字面量比较（no-restricted-syntax 误报规则）
    const unsubAction = poolApi.onToastAction((action: { type: string; id: string; actionId?: string }) => {
      const handlers: Record<string, () => void> = {
        dismiss: () => dismissToast(action.id),
        action: () => {
          if (action.actionId !== undefined) runToastAction(action.id, action.actionId);
        },
      };
      handlers[action.type]?.();
    });

    // 挂载时同步当前状态——防桥接前已弹出的 toast
    push();

    return () => {
      unsubToasts();
      unsubSuppressed();
      unsubAction();
    };
  }, []);

  // E5.7#39：内存压力通知——主进程单 Pool 采样超 1GB → toast 服务 → 池 ToastHost 哑渲染（#16 桥）。
  // 注册/清理（硬约束 19）——壳崩重建后新窗口重新注册。
  useEffect(() => {
    const poolApi = window.linkdesk?.pool;
    if (!poolApi?.onMemoryPressure) return;
    const unsub = poolApi.onMemoryPressure((data: { totalRSS: number; threshold: number }) => {
      const mb = Math.round(data.totalRSS / 1024);
      pushToast({
        message: i18n.t("内存压力：界面进程内存占用过高（{{mb}} MB）", { mb }),
        severity: "warning",
        ttl: TOAST_TTL_INFO,
      });
    });
    return unsub;
  }, []);

  // E5.7#17：Dialog 聪慧→哑桥——桥接 renderer 注册到 DialogService（服务零改动），
  // 池 DialogHost 哑渲染，动作回传 settle Promise。
  // #18：壳 ConfirmDialog 组件已删——本桥是 DialogService renderer 的唯一注册方。
  useEffect(() => {
    const poolApi = window.linkdesk?.pool;
    if (!poolApi?.pushDialog || !poolApi?.onDialogAction) return;

    // 单一待决对话框（对标壳 ConfirmDialog 单 state——后开覆盖先开，行为零差异）
    let pending: { settle: (v: boolean) => void } | null = null;

    const pushOpen = (options: DialogOptions, isAlert: boolean) => {
      poolApi.pushDialog({
        open: true,
        title: options.title,
        message: options.message,
        // 显示文本铁律——按钮文案壳侧 t() 解析（池原样渲染）
        confirmLabel: options.confirmLabel ?? i18n.t("确定"),
        cancelLabel: options.cancelLabel ?? i18n.t("取消"),
        isAlert,
      });
    };

    const confirmRenderer = (options: DialogOptions): Promise<boolean> =>
      new Promise<boolean>((resolve) => {
        pending = { settle: resolve };
        pushOpen(options, false);
      });

    const alertRenderer = (options: DialogOptions): Promise<void> =>
      new Promise<void>((resolve) => {
        pending = { settle: () => resolve() };
        pushOpen(options, true);
      });

    // E5.8#10：返 disposer——卸载时引用级撤自己（unregisterDialogRenderers 已删）
    const unregisterRenderers = registerDialogRenderers(confirmRenderer, alertRenderer);

    // 池动作回传——先推关闭再 settle（settle 后消费方可能立即再开——
    // 若关闭推在 settle 之后，stale close 会覆盖新开对话框）。
    // 动作用查表分发——避免 lowercase 字面量比较（no-restricted-syntax 误报规则）
    const unsubAction = poolApi.onDialogAction((action: { type: string }) => {
      poolApi.pushDialog({ open: false });
      const p = pending;
      pending = null;
      const handlers: Record<string, () => void> = {
        confirm: () => p?.settle(true),
        cancel: () => p?.settle(false),
      };
      handlers[action.type]?.();
    });

    return () => {
      unsubAction();
      unregisterRenderers();
    };
  }, []);
}
