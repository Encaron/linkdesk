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

import { useState, useEffect, StrictMode } from "react";
import ReactDOM from "react-dom/client";
import SidebarRenderer from "./SidebarRenderer";
import MainRenderer from "./MainRenderer";
import type { PoolLayout } from "../core/types/poolLayout";
// E5.6#11 fix：池独立 WebContentsView——需加载基础 CSS（变量/字体/图标/间距）
import "../index.css";
import "@vscode/codicons/dist/codicon.css";
// E5.6#10f：池独立 WebContentsView 需初始化 i18n——模块级 init() + 订阅 lang:changed 广播
import "../i18n";
// E5.6#11-fix5：池内命令路由——ContextMenu 右键命令（explorer.delete 等）默认走 IPC→壳 CommandRegistry，
// 壳侧 handler 操作壳侧 model（hidden SidePanel）→ 池内 UI 不更新。
// 覆盖 lk.commands.executeCommand：池内注册的命令走本地 CommandRegistry，其余回退 IPC。
import { executeCommand, getCommands } from "../core/registry/CommandRegistry";

// ── PoolApp ──

function PoolApp() {
  const zone = new URLSearchParams(window.location.search).get("zone");
  const [layout, setLayout] = useState<PoolLayout>({ groups: [] });

  // E5.6#11-fix3：SidebarPool 根背景——独立 WebContentsView 需要侧栏色调，
  // 不能复用 #pool-root { background: var(--bg-window) }。
  useEffect(() => {
    const root = document.getElementById("pool-root");
    if (root && zone === "sidebar") {
      root.style.background = "var(--bg-side-panel)";
    }
  }, [zone]);

  useEffect(() => {
    const poolApi = (window as any).linkdesk?.pool;
    if (!poolApi) {
      // E5.6#8 前 preload 尚未暴露 pool API——静默等待
      return;
    }

    const unsub = poolApi.onLayout((next: PoolLayout) => {
      setLayout(next);
    });

    // 池就绪通知壳——壳收到 pool:ready 后开始 pushLayout
    poolApi.ready();

    return () => {
      unsub?.();
    };
  }, []);

  // E5.6#11-fix5：池内命令路由——本地注册的命令（如 explorer.delete/explorer.rename）
  // 走池内 CommandRegistry → handler 读写池内 FileTreeHandle/model → UI 即时更新。
  // 未注册命令（如 tabs:create/config:get）回退 IPC→壳。
  useEffect(() => {
    const lk = (window as any).linkdesk;
    if (!lk?.commands) return;

    const origExec = lk.commands.executeCommand;

    lk.commands.executeCommand = async function (this: any, id: string, ...args: any[]) {
      const localCmds = getCommands();
      if (localCmds.some((c) => c.id === id)) {
        try {
          return await executeCommand(id, ...args);
        } catch (e) {
          console.error("[pool] 本地命令执行失败，回退 IPC:", id, e);
        }
      }
      return origExec(id, ...args);
    };

    return () => {
      lk.commands.executeCommand = origExec;
    };
  }, []);

  if (zone === "sidebar") {
    return <SidebarRenderer sidebar={layout.sidebar} />;
  }
  if (zone === "main") {
    return <MainRenderer groups={layout.groups} />;
  }

  // zone 参数无效——URL 参数缺失或非法
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
