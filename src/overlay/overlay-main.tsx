/**
 * OverlayWindow React 入口——E5.6#21c。
 *
 * overlay.html 加载此文件。对标 src/pool/pool-main.tsx——Pool 被动接收布局，
 * OverlayWindow 被动接收渲染命令（OverlayCommand）。
 *
 * OverlayWindow = 哑渲染器：
 *   - 接收 overlay:render IPC → onCommand 回调 → 渲染对应浮层容器
 *   - 用户交互 → overlay.sendResult() → 壳侧 Promise resolve
 *   - 不执行业务逻辑——不知道命令 ID 是什么、菜单项来自哪个插件
 *
 * 浮层容器：
 *   - 右键菜单 / 命令面板 / Toast / Dialog / SelectBox / ColorPicker / Modal
 *   - 分割线（SplitLines——始终渲染，由壳 syncLayout 推送位置）
 *   - 每个容器按需显示（display toggle），不是创建/销毁
 */

import { useState, useEffect, useCallback, StrictMode } from "react";
import ReactDOM from "react-dom/client";

// ── 类型 ──
interface OverlayCommand {
  type: string;
  payload: unknown;
}

interface OverlayState {
  type: string | null;
  payload: unknown;
}

// ── OverlayWindow 侧的 window.linkdesk（preload-overlay.ts 通过 contextBridge 注入） ──
// 类型窄化——不覆写全局 Window 接口（global.d.ts 已有 Record<string, any>）。
// 使用 const 引用 + 类型断言，保持本文件内类型安全。
type OverlayApi = {
  overlay: {
    ready(): void;
    onCommand(cb: (cmd: OverlayCommand) => void): void;
    sendResult(requestId: string, type: string, result: unknown): void;
  };
  events: {
    on(channel: string, cb: (payload: unknown) => void): () => void;
  };
};
function getOverlayApi(): OverlayApi {
  return window.linkdesk as unknown as OverlayApi;
}

// ── 浮层容器组件（占位——#23/#24 实施时替换为完整渲染） ──

function OverlayContextMenuPlaceholder({ payload }: { payload: unknown }) {
  const data = payload as Record<string, unknown> | undefined;
  return (
    <div style={{
      position: "absolute",
      left: `${(data?.anchor as { x: number })?.x ?? 0}px`,
      top: `${(data?.anchor as { y: number })?.y ?? 0}px`,
      background: "var(--background, #252526)",
      border: "1px solid var(--border, #454545)",
      borderRadius: "4px",
      padding: "8px 0",
      minWidth: "160px",
      zIndex: "var(--overlay-z-context-menu)",
      pointerEvents: "auto",
    }}>
      <div style={{ padding: "4px 16px", fontSize: "12px", color: "var(--foreground, #ccc)" }}>
        [Overlay] Context Menu: {(data?.menuId as string) ?? "?"}
      </div>
    </div>
  );
}

function OverlayCommandPalettePlaceholder() {
  return (
    <div style={{
      position: "absolute",
      top: "20%",
      left: "50%",
      transform: "translateX(-50%)",
      background: "var(--background, #252526)",
      border: "1px solid var(--border, #454545)",
      borderRadius: "6px",
      padding: "12px 16px",
      minWidth: "400px",
      zIndex: "var(--overlay-z-command-palette)",
      pointerEvents: "auto",
    }}>
      <div style={{ fontSize: "13px", color: "var(--foreground, #ccc)" }}>
        [Overlay] Command Palette (Ctrl+Shift+P)
      </div>
    </div>
  );
}

function OverlayToastPlaceholder({ payload }: { payload: unknown }) {
  const data = payload as Record<string, unknown> | undefined;
  return (
    <div style={{
      position: "absolute",
      top: "40px",
      right: "16px",
      background: "var(--background, #252526)",
      border: "1px solid var(--border, #454545)",
      borderRadius: "4px",
      padding: "8px 16px",
      zIndex: "var(--overlay-z-toast)",
      pointerEvents: "auto",
    }}>
      <span style={{ fontSize: "12px", color: "var(--foreground, #ccc)" }}>
        {(data?.message as string) ?? "[Overlay] Toast"}
      </span>
    </div>
  );
}

function OverlayDialogPlaceholder({ payload }: { payload: unknown }) {
  const data = payload as Record<string, unknown> | undefined;
  return (
    <div style={{
      position: "absolute",
      top: "50%",
      left: "50%",
      transform: "translate(-50%, -50%)",
      background: "var(--background, #252526)",
      border: "1px solid var(--border, #454545)",
      borderRadius: "8px",
      padding: "20px",
      minWidth: "300px",
      zIndex: "var(--overlay-z-dialog)",
      pointerEvents: "auto",
    }}>
      <div style={{ fontSize: "14px", fontWeight: "bold", color: "var(--foreground, #ccc)", marginBottom: "8px" }}>
        {(data?.title as string) ?? "[Overlay] Dialog"}
      </div>
      <div style={{ fontSize: "12px", color: "var(--foreground-secondary, #999)", marginBottom: "16px" }}>
        {(data?.message as string) ?? ""}
      </div>
      <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
        <button style={{ padding: "4px 12px", fontSize: "12px" }}>取消</button>
        <button style={{ padding: "4px 12px", fontSize: "12px" }}>确认</button>
      </div>
    </div>
  );
}

// ── OverlayApp ──

function OverlayApp() {
  const [activeOverlay, setActiveOverlay] = useState<OverlayState>({ type: null, payload: null });

  // ── 接收渲染命令 ──
  const handleCommand = useCallback((cmd: OverlayCommand) => {
    if (cmd.type === "dismiss") {
      setActiveOverlay({ type: null, payload: null });
    } else {
      setActiveOverlay({ type: cmd.type, payload: cmd.payload });
    }
  }, []);

  useEffect(() => {
    // 注册 onCommand——对标 pool-main.tsx 的 onLayout
    const api = getOverlayApi();
    api.overlay.onCommand(handleCommand);
    // 标记就绪——之后 IPC 直接推 handleCommand，不再缓冲
    api.overlay.ready();
  }, [handleCommand]);

  // ── 渲染活跃的浮层容器 ──
  const overlay = activeOverlay.type ? (() => {
    switch (activeOverlay.type) {
      case "context-menu":
      case "hamburger-menu":
        return <OverlayContextMenuPlaceholder payload={activeOverlay.payload} />;
      case "command-palette":
        return <OverlayCommandPalettePlaceholder />;
      case "toast":
        return <OverlayToastPlaceholder payload={activeOverlay.payload} />;
      case "dialog":
        return <OverlayDialogPlaceholder payload={activeOverlay.payload} />;
      // selectbox / colorpicker / modal / split-lines → #24/#24.5/#22
      default:
        return null;
    }
  })() : null;

  return <>{overlay}</>;
}

// ── 挂载 ──
const rootEl = document.getElementById("overlay-root");
if (rootEl) {
  ReactDOM.createRoot(rootEl).render(
    <StrictMode>
      <OverlayApp />
    </StrictMode>
  );
}
