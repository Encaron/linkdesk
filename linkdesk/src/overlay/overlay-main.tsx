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
  requestId: string;
  type: string;
  payload: unknown;
}

interface OverlayState {
  requestId: string | null;
  type: string | null;
  payload: unknown;
}

// ── E5.6#22b：分隔线类型——壳 push split-lines 命令时传入 ──
interface SplitLine {
  orientation: "vertical" | "horizontal";
  x: number;
  y: number;
  width: number;
  height: number;
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
      cursor: "default",
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
      cursor: "default",
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
      cursor: "default",
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
      cursor: "default",
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

// ── E5.6#22b：SplitLines——始终渲染的分隔线，独立于 activeOverlay ──

function SplitLines({ lines }: { lines: SplitLine[] }) {
  if (!lines || lines.length === 0) return null;

  return (
    <>
      {lines.map((line, i) => (
        <div
          key={`split-${i}`}
          style={{
            position: "absolute",
            left: `${line.x}px`,
            top: `${line.y}px`,
            width: `${line.width}px`,
            height: `${line.height}px`,
            cursor: line.orientation === "vertical" ? "col-resize" : "row-resize",
            pointerEvents: "auto",
            zIndex: "var(--overlay-z-splitter)",
            background: "transparent",
            transition: "background 0.15s",
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.06)";
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLElement).style.background = "transparent";
          }}
        />
      ))}
    </>
  );
}

// ── OverlayApp ──

function OverlayApp() {
  // ── E5.6#22b：state 按 type 路由到不同 slot ──
  // splitLines——独立 state，始终渲染（多条分隔线）
  const [splitLines, setSplitLines] = useState<{ lines: SplitLine[] }>({ lines: [] });
  // activeOverlay——互斥 state，新命令替换旧（右键菜单/命令面板/dialog）
  const [activeOverlay, setActiveOverlay] = useState<OverlayState>({ requestId: null, type: null, payload: null });

  // ── 接收渲染命令——按 type 路由到对应 state slot ──
  const handleCommand = useCallback((cmd: OverlayCommand) => {
    switch (cmd.type) {
      case "split-lines":
        // 分隔线——独立更新，不影响 activeOverlay
        setSplitLines(cmd.payload as { lines: SplitLine[] });
        break;
      case "dismiss":
        setActiveOverlay({ requestId: null, type: null, payload: null });
        break;
      default:
        // 右键菜单 / 命令面板 / dialog——互斥，新开替换旧
        setActiveOverlay({ requestId: cmd.requestId, type: cmd.type, payload: cmd.payload });
        break;
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
      // selectbox / colorpicker / modal → #24/#24.5
      default:
        return null;
    }
  })() : null;

  // 🔥 临时——验证 OverlayWindow 存在（E5.6#21 验证，验完删）
  const debugBorder = (
    <div style={{
      position: "fixed", inset: 0,
      border: "3px solid #ff00ff",
      pointerEvents: "none",
      zIndex: 9999,
    }}>
      <div style={{
        position: "absolute", top: 4, right: 8,
        background: "#ff00ff", color: "#fff",
        padding: "2px 8px", borderRadius: "0 0 4px 4px",
        fontSize: "11px", fontFamily: "monospace",
        pointerEvents: "none",
      }}>
        OverlayWindow ✓
      </div>
    </div>
  );

  return <>{debugBorder}<SplitLines lines={splitLines.lines} />{overlay}</>;
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
