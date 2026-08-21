/**
 * App 杂项生命周期 hook——useAppLifecycle：窗口/插件/状态同步订阅的聚合。
 * E5.8#0d.10-3c：自 App.tsx 拆出——unhandledrejection 兜底 / 插件卸载自动关闭侧栏+标签页 /
 * context key 同步（activeEditor）/ 图标排序持久化 / LayoutEngine 容器尺寸 / 配置→React 同步 /
 * 自定义事件（输出面板/工作区恢复/设置）+ 频道显示。
 * 依赖方向：lifecycle → core 服务/registry + pluginLoader；App 消费：useAppLifecycle({ setTheme, setLang, sidebarView, setSidebarView })。无反向。
 */

import { useCallback, useEffect, useRef } from "react";
import { reportError } from "../core/services/bootstrap/ErrorService";
import { getViewPlugin } from "../pluginLoader/viewRegistry";
import { CUSTOM_EVENTS } from "../core/react/events/CoreEvents";
import { shellEvents } from "../core/react/events/ShellEvents";
import { layoutEngine } from "../core/services/layout/LayoutEngine";
import { setConfigurationValue, onDidChangeConfiguration } from "../core/services/configuration/ConfigurationService";
import { setPluginStateValue, APP_PLUGIN_ID } from "../core/services/plugins/PluginStateService";
import { ContextKeyService } from "../core/registry/commands/ContextKeyService";
import { factorySlots } from "../core/services/bootstrap/FactorySlots";
import { onDidRequestShowChannel } from "../core/services/ui/LogChannel";

export interface AppLifecycleDeps {
  setTheme: (v: string) => void;
  setLang: (v: "zh" | "en") => void;
  sidebarView: string | null;
  setSidebarView: (v: string | null) => void;
}

/** 杂项生命周期订阅——全部独立 window/事件总线监听，注册一次（deps 稳定） */
export function useAppLifecycle({ setTheme, setLang, sidebarView, setSidebarView }: AppLifecycleDeps): void {
  // E3.6 Bug 2/7 防线：revertContainerIfCurrent 先于 forceCloseTab
  // 用 ref 桥接——sidebarView 由 App 传入，render 阶段赋值闭包读最新值（避免 TDZ）
  const sidebarViewRef = useRef<string | null>(null);
  sidebarViewRef.current = sidebarView;

  const revertContainerIfCurrent = useCallback((pluginId: string) => {
    const current = sidebarViewRef.current;
    if (!current) return;
    const plugin = getViewPlugin(pluginId);
    const containers = plugin?.manifest.contributes?.viewsContainers as Record<string, unknown> | undefined;
    if (!containers) return;
    const containerIds = Object.keys(containers);
    if (containerIds.includes(current)) {
      setSidebarView(null);
    }
  }, [setSidebarView]);

  // E5#88d：全局 unhandledrejection 兜底——防止 init 链等异步流程静默失败
  useEffect(() => {
    const handler = (event: PromiseRejectionEvent) => {
      // E5.6#9h：extension-file:// 主题文件 404 是 @codingame 已知无害错误，
      // VS Code 1.90+ light_modern.json 不在 monaco-languageclient 的打包中。
      // defineThemeSafe 已有 vs/vs-dark 兜底，功能不受影响。
      const msg = event.reason?.message ?? String(event.reason);
      if (msg.includes("extension-file://") && msg.includes("Not Found")) {
        event.preventDefault();
        return;
      }
      reportError({ message: "未捕获的 Promise 拒绝", source: "App", error: event.reason, silent: true });
    };
    window.addEventListener("unhandledrejection", handler);
    return () => window.removeEventListener("unhandledrejection", handler);
  }, []);

  // Phase 4.4：监听插件卸载/禁用事件，自动关闭关联标签页
  useEffect(() => {
    const handler = (e: Event) => {
      const { pluginId } = (e as CustomEvent).detail as { pluginId: string };
      // 🔥 E36#4.5：关闭侧栏在先——需要 ViewContainerService 还有数据时读 manifest
      revertContainerIfCurrent(pluginId);
      // E5#5e-ii：useTabManager 订阅此事件关闭标签页
      shellEvents.emit("plugin:removed", { pluginId });
    };
    window.addEventListener(CUSTOM_EVENTS.PLUGIN_REMOVED, handler);
    return () => window.removeEventListener(CUSTOM_EVENTS.PLUGIN_REMOVED, handler);
  }, [revertContainerIfCurrent]);

  /* ── Phase 5d：运行时 context key 更新 ── */
  // 对标 VS Code setContext——标签页状态变更时同步更新全局 context key 状态机

  // E5#5e-ii-b：activeEditor——订阅 tab:focused 替代旧的 activePluginId 派生
  useEffect(() => {
    const unsub = shellEvents.on("tab:focused", ({ pluginId }) => {
      ContextKeyService.setValue("activeEditor", pluginId ?? null);
    });
    return unsub;
  }, []);

  // E5#7d：订阅 icon:reordered——IconBar 拖拽排序后持久化到 PluginStateService
  useEffect(() => {
    const unsub = shellEvents.on("icon:reordered", (ids) => {
      setPluginStateValue(APP_PLUGIN_ID, "iconOrder", ids);
    });
    return unsub;
  }, []);

  /* ---- E5#9f：LayoutEngine 壳布局——E5.7#9 起只喂容器尺寸 ---- */
  // E5.7#12.5：Pool bounds 推流已删（主进程 syncPoolBounds 接管，WCV 满窗零偏移）。
  // LayoutEngine 仍需喂容器尺寸——侧栏几何真相源（usePoolSync 读 sidebar 宽度、
  // App 侧栏宿主状态机 setZoneWidth 折叠、#13 拖拽 commit resizeZone）。零偏移——无 TITLE_BAR_HEIGHT。
  // E5.7#31：LayoutEngine 保留（清单"整删"前提过时——折叠真相源 + 钳制双活链），此 effect 不删。
  useEffect(() => {
    const updateSize = () => layoutEngine.setContainerSize(window.innerWidth, window.innerHeight);
    updateSize();
    window.addEventListener("resize", updateSize);
    return () => {
      window.removeEventListener("resize", updateSize);
    };
  }, []);

  // Phase 5f：ConfigurationApplier 归一化——setConfigurationValue 自动调 onApply。
  // 此 listener 只做 React state 同步（theme/language——app shell 需要）。
  // terminal.* 变更由 useConfiguration hook 在终端组件内部响应。
  // setTheme/setLang 是 useState 稳定 setter——deps 恒不变，effect 仅注册一次（等价原 []）。
  useEffect(() => {
    const unsub = onDidChangeConfiguration((key, value) => {
      if (key === "app.theme") setTheme(value as string);
      if (key === "app.language") setLang(value as "zh" | "en");
    });
    return unsub;
  }, [setTheme, setLang]);

  /* ---- QuickPick 归一化（E5.5#7-p12）——所有浮层共用一个 QuickPick，QuickPickService 管理状态 ---- */
  useEffect(() => {
    // 保留——非 QuickPick 事件（输出面板 / 工作区 / 设置）
    const onOutput = () => { shellEvents.emit("icon:selected", "output"); };
    window.addEventListener(CUSTOM_EVENTS.SHOW_OUTPUT, onOutput);
    const onRestoreWorkspace = (e: Event) => {
      const detail = (e as CustomEvent).detail as {
        layout?: { tabs?: { groups: unknown[]; activeGroupId: string }; cards?: unknown[] };
        settings?: Record<string, unknown>;
      };
      if (detail.layout?.tabs?.groups?.length) { /* workspace:restore 事件由 useTabManager 接管 */ }
      if (detail.settings) {
        for (const [key, value] of Object.entries(detail.settings)) {
          try { setConfigurationValue(key, value); } catch { /* skip */ }
        }
      }
    };
    window.addEventListener(CUSTOM_EVENTS.RESTORE_WORKSPACE, onRestoreWorkspace);
    const onOpenSettings = () => {
      // E5.8#41.12 🪡 概念生效接缝：一对多后走 getActive（读持久化激活套；无记录/已卸载回退默认=内置）
      const settingsId = factorySlots.getActive("settings") ?? "welcome";
      shellEvents.emit("icon:selected", settingsId);
    };
    window.addEventListener(CUSTOM_EVENTS.OPEN_SETTINGS, onOpenSettings);
    return () => {
      window.removeEventListener(CUSTOM_EVENTS.SHOW_OUTPUT, onOutput);
      window.removeEventListener(CUSTOM_EVENTS.RESTORE_WORKSPACE, onRestoreWorkspace);
      window.removeEventListener(CUSTOM_EVENTS.OPEN_SETTINGS, onOpenSettings);
    };
  }, []);

  // E3f #54：插件调 channel.show() → 自动打开输出面板并切换到该频道
  useEffect(() => {
    const unsub = onDidRequestShowChannel.event((_channelId: string) => {
      shellEvents.emit("icon:selected", "output");
    });
    return unsub;
  }, []);
}
