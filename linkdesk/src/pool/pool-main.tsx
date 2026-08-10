/**
 * Pool React 入口——E5.6#7a。
 *
 * pool.html 加载此文件，Shell 负责创建 WebContentsView。
 * `?zone=sidebar` → SidebarPool，`?zone=main` → MainPool。
 *
 * 壳推送 PoolLayout JSON，池被动渲染——池不知道"世界为什么长这样"。
 * 缓冲回放模式防竞态：preload 就位 ～ React mount 之间到达的布局先入缓冲，
 * onLayout 回调注册时回放 + 切换为实时推送。
 *
 * 🔴 E5.6#8 前 window.linkdesk.pool 不存在——useEffect 安全降级。
 */

import { useState, useEffect, useRef, StrictMode, useTransition } from "react";
import ReactDOM from "react-dom/client";
import SidebarRenderer from "./SidebarRenderer";
import MainRenderer from "./MainRenderer";
import type { PoolLayout } from "../core/types/poolLayout";
// E5.6#11 fix：池独立 WebContentsView——需加载基础 CSS（变量/字体/图标/间距）
import "../index.css";
import "@vscode/codicons/dist/codicon.css";
// E5.6#10f：池独立 WebContentsView 需初始化 i18n——模块级 init() + 订阅 lang:changed 广播
import "../i18n";
// E5.6#11-fix7：池内命令本地执行——ContextMenu 点击命令时先查池内 CommandRegistry
import { executeCommand } from "../core/registry/CommandRegistry";
// E5.6#11-fix7：跨上下文桥接——壳 workspace:changed → 池 WorkspaceService 本地 emitter
import { triggerFoldersChanged } from "../core/services/WorkspaceService";
// E5.6#11-fix7：跨上下文桥接——壳 config:changed → 池 ConfigurationService 本地 cache+listener
import { applyRemoteConfigChange } from "../core/services/ConfigurationService";
// ── PoolApp ──

function PoolApp() {
  const zone = new URLSearchParams(window.location.search).get("zone");
  const [layout, setLayout] = useState<PoolLayout>({ groups: [] });
  // E5.6#11-fix7：useTransition——切容器时 React 后台渲染新内容，前台保持旧内容，
  // Suspense fallback（"加载中..."）被抑制。新组件 ready 后无缝替换。
  const [, startTransition] = useTransition();

  // E5.6#11-fix6：闪烁修复——壳切侧栏容器时初始 push visible=false 导致池渲染 null 一帧。
  // 保留最后一个可见布局——切容器时旧内容保持显示，新布局到达后无缝替换。
  const lastVisibleLayout = useRef<PoolLayout>({ groups: [] });

  // E5.6#11-fix3：SidebarPool 根背景——独立 WebContentsView 需要侧栏色调
  useEffect(() => {
    const root = document.getElementById("pool-root");
    if (root && zone === "sidebar") {
      root.style.background = "var(--bg-side-panel)";
    }
  }, [zone]);

  useEffect(() => {
    const poolApi = (window as any).linkdesk?.pool;
    if (!poolApi) return;

    const unsub = poolApi.onLayout((next: PoolLayout) => {
      // 闪烁修复：visible 且有 views 时更新 lastVisibleLayout
      if (next.sidebar?.visible && next.sidebar.views?.length > 0) {
        lastVisibleLayout.current = next;
      }
      // E5.6#11-fix7：Transition——React 后台渲染新布局，前台保持旧内容。
      // Suspense fallback 被抑制——无 "加载中..." 闪烁，新组件 ready 后无缝替换。
      startTransition(() => {
        setLayout(next);
      });
    });

    poolApi.ready();

    return () => { unsub?.(); };
  }, []);

  // E5.6#11-fix7：注册池内本地命令执行器——ContextMenu 点击命令时优先查池内 CommandRegistry
  // （explorer.rename / explorer.delete 等在池内注册），查不到时 fallback 到壳侧 IPC
  useEffect(() => {
    const lk = (window as any).linkdesk;
    if (!lk) return;
    lk.__registerCommandExecutor?.(async (id: string, ...args: any[]) => {
      return executeCommand(id, ...args);
    });
  }, []);

  // E5.6#11-fix7：F2/Delete 快捷键——池独立 WebContentsView，壳 keybinding 系统不跨进程。
  // 池侧 keydown 补上最常用的文件树快捷键。不拦截输入框/textarea/contentEditable。
  useEffect(() => {
    if (zone !== "sidebar") return;
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const tag = target?.tagName;
      // 不拦截文本编辑区域——内联重命名 input 等
      if (tag === "INPUT" || tag === "TEXTAREA" || target?.isContentEditable) return;
      if (e.key === "F2") {
        e.preventDefault();
        executeCommand("explorer.rename");
      } else if (e.key === "Delete") {
        e.preventDefault();
        executeCommand("explorer.delete");
      }
    };
    document.addEventListener("keydown", handler, true);
    return () => document.removeEventListener("keydown", handler, true);
  }, [zone]);

  // E5.6#11-fix7：跨上下文桥接——壳 IpcBridgeHandler 广播 workspace:changed/config:changed，
  // 池侧模块级单例（WorkspaceService/ConfigurationService）是独立实例，本地 emitter 永远不触发。
  // 此 effect 订阅 preload events 桥接到本地 core 服务。
  useEffect(() => {
    const events = (window as any).linkdesk?.events;
    if (!events) return;

    // workspace:changed → 池 WorkspaceService.onDidChangeFolders → FoldersView.syncRoots()
    const unsubWs = events.on("workspace:changed", () => {
      triggerFoldersChanged();
    });

    // config:changed → 池 ConfigurationService._userSettings + _changeListeners
    // preload 侧 _configCache 已缓冲 mount 前到达的事件，on() 注册时立即回放
    const unsubCfg = events.on("config:changed", (data: any) => {
      const { key, value } = (data as { key: string; value: any }) ?? {};
      if (key) applyRemoteConfigChange(key, value);
    });

    return () => { unsubWs?.(); unsubCfg?.(); };
  }, []);

  // 决定用哪个 sidebar 渲染——当前布局无内容时 fallback 到上次可见布局
  const effectiveSidebar = layout.sidebar?.visible && layout.sidebar.views?.length > 0
    ? layout.sidebar
    : lastVisibleLayout.current.sidebar;

  if (zone === "sidebar") {
    return <SidebarRenderer sidebar={effectiveSidebar} />;
  }
  if (zone === "main") {
    return <MainRenderer groups={layout.groups} />;
  }

  // zone 参数无效
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        height: "100%",
        color: "var(--text-muted, #888)",
        fontSize: 13,
        userSelect: "none",
      }}
    >
      Pool zone 参数无效: {zone || "(空)"}
    </div>
  );
}

// ── E5.6#7e：挂载到 pool.html 的 pool-root ──
ReactDOM.createRoot(document.getElementById("pool-root")!).render(
  <StrictMode>
    <PoolApp />
  </StrictMode>,
);
