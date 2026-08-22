/**
 * Pool React 入口——E5.6#7a + E5.6#11.5c + E5.7#2（单 zone 统一入口）。
 *
 * pool.html 加载此文件，Shell 负责创建 WebContentsView。
 * E5.7 极简Pool：无 ?zone= 路由——唯一 Pool 直接渲染 <PoolZoneShell layout={layout} />。
 *
 * 壳推送 PoolLayout JSON，池被动渲染——池不知道"世界为什么长这样"。
 * 缓冲回放模式防竞态：preload 就绪 ～ React mount 之间到达的布局先入缓冲，
 * onLayout 回调注册时回放 + 切换为实时推送。
 *
 * 🔴 Path B：池 = 哑渲染器。不 import 任何 @src/core/* 模块（import type 除外）。
 * 所有核心服务走 window.linkdesk.* → IPC → 壳唯一真相源。
 */

import { useState, useEffect, useRef, StrictMode, useTransition } from "react";
import ReactDOM from "react-dom/client";
import PoolZoneShell from "./PoolZoneShell";
import type { PoolLayout } from "../core/types/pool/poolLayout";
// E5.6#11 fix：池独立 WebContentsView——需加载基础 CSS（变量/字体/图标/间距）
import "../index.css";
import "@vscode/codicons/dist/codicon.css";
// E5.6#10f：池独立 WebContentsView 需初始化 i18n——模块级 init() + 订阅 lang:changed 广播
import "../i18n";

// ── PoolApp ──

function PoolApp() {
  // E5.7#1：PoolLayout v2 全量字段——初始为 null，首个 pushLayout 到达后渲染
  const [layout, setLayout] = useState<PoolLayout | null>(null);
  // E5.6#11-fix7：useTransition——切容器时 React 后台渲染新内容，前台保持旧内容，
  // Suspense fallback（"加载中..."）被抑制。新组件 ready 后无缝替换。
  const [, startTransition] = useTransition();

  // E5.6#11-fix6：闪烁修复——壳切侧栏容器时初始 push visible=false 导致池渲染 null 一帧。
  // 保留最后一个可见布局——切容器时旧内容保持显示，新布局到达后无缝替换。
  const lastVisibleLayout = useRef<PoolLayout | null>(null);

  // 接收壳推送的 PoolLayout——preload 缓冲回放 + onLayout 注册（E5.6#8b 不变）
  useEffect(() => {
    const poolApi = window.linkdesk?.pool;
    if (!poolApi) return;

    const unsub = poolApi.onLayout((next: PoolLayout) => {
      // 闪烁修复：visible 且有 views 时更新 lastVisibleLayout
      // E5.8#43-2：sidebar 缺省（脱出窗子集）→ 不更新（无侧栏可保）
      if (next.sidebar?.visible && (next.sidebar.views?.length ?? 0) > 0) {
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

  // 首个布局未到达前渲染 null（E5.7#1——v2 无空对象初始值，缓冲回放保证 ready 后立即到达）
  if (!layout) return null;

  // E5.6#11-fix6：侧栏防闪烁——当前 push 的 sidebar 不可见/空时，用上次可见的 sidebar 顶替。
  // 其余 zone 一律用当前布局。E5.7#2 之前此逻辑分发给 SidebarRenderer，现合并进唯一布局。
  // E5.8#43-2：sidebar 缺省（脱出窗子集）→ effectiveSidebar 恒 undefined（PoolZoneShell 不渲染侧栏 cell）
  const effectiveSidebar = layout.sidebar
    ? (layout.sidebar.visible && (layout.sidebar.views?.length ?? 0) > 0
      ? layout.sidebar
      : lastVisibleLayout.current?.sidebar ?? layout.sidebar)
    : undefined;

  // E5.7#2：唯一根组件——无 zone 路由
  return <PoolZoneShell layout={{ ...layout, sidebar: effectiveSidebar }} />;
}

// ── E5.6#7e：挂载到 pool.html 的 pool-root ──
ReactDOM.createRoot(document.getElementById("pool-root")!).render(
  <StrictMode>
    <PoolApp />
  </StrictMode>,
);
