/**
 * Pool React 入口——E5.6#7a + E5.6#11.5c。
 *
 * pool.html 加载此文件，Shell 负责创建 WebContentsView。
 * `?zone=sidebar` → SidebarPool，`?zone=main` → MainPool。
 *
 * 壳推送 PoolLayout JSON，池被动渲染——池不知道"世界为什么长这样"。
 * 缓冲回放模式防竞态：preload 就位 ～ React mount 之间到达的布局先入缓冲，
 * onLayout 回调注册时回放 + 切换为实时推送。
 *
 * 🔴 Path B：池 = 哑渲染器。不 import 任何 @src/core/* 模块（import type 除外）。
 * 所有核心服务走 window.linkdesk.* → IPC → 壳唯一真相源。
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

  // 接收壳推送的 PoolLayout——preload 缓冲回放 + onLayout 注册
  useEffect(() => {
    const poolApi = (window as any).linkdesk?.pool;
    if (!poolApi) return;

    const unsub = poolApi.onLayout((next: PoolLayout) => {
      // 闪烁修复：visible 且有 views 时更新 lastVisibleLayout
      if (next.sidebar?.visible && next.sidebar.views?.length > 0) {
        lastVisibleLayout.current = next;
      }
      // Transition——React 后台渲染新布局，前台保持旧内容。
      // Suspense fallback 被抑制——无 "加载中..." 闪烁，新组件 ready 后无缝替换。
      startTransition(() => {
        setLayout(next);
      });
    });

    poolApi.ready();

    return () => { unsub?.(); };
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
