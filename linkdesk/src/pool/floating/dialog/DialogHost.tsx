/**
 * DialogHost——E5.7#17。池侧 Dialog 哑渲染器（浮层归一化设计.md §7）。
 *
 * 聪慧→哑数据流：壳 DialogService 桥（renderer 注册）把 options 序列化成 DTO 推送
 * （显示文本铁律——按钮文案已由壳侧 t() 解析，池原样渲染，零 useTranslation）。
 * Promise 的 resolve 闭包留壳——池只回传动作类型（confirm/cancel），壳侧 settle。
 *
 * 交互（设计 §7.2）：
 *   - Tab 键在 Dialog 内循环（焦点陷阱）
 *   - Escape → 关闭（alert 模式除外）
 *   - backdrop 点击 → 关闭（alert 模式除外）
 *   - Enter → 确认（对标壳 ConfirmDialog handleKeyDown）
 *   - 打开时聚焦 dialog 面板本身（对标壳 tabIndex=-1 focus——Enter 确认不误触取消按钮）
 *
 * 状态闭环：壳 push {open:false} 驱动关闭——池不本地关闭（哑）。
 * 无退场动画（对标壳 ConfirmDialog 即时卸载——行为零差异）。
 * Path B：不 import @src/core 运行时模块——类型 import type OK，Z_INDEX 走 constants。
 */

import { useState, useRef, useEffect, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { Z_INDEX } from "../../../constants";
import type { PoolDialogData } from "../../../core/types/pool/poolDialog";
import "./DialogHost.css";

/* ── 池 API 形状——global.d.ts 的 window.linkdesk 是宽松类型，此处收窄到精确形状 ── */

interface PoolDialogApi {
  onShow: (cb: (data: PoolDialogData) => void) => () => void;
  confirm: () => void;
  cancel: () => void;
}

/** 可聚焦元素选择器——对标壳 OverlayPortal trapFocus（E5#96k） */
const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),textarea:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])';

export default function DialogHost() {
  // ── 池 API 引用（E5#89 约定：window.linkdesk 直接访问，不做 (window as any) 断言） ──
  const apiRef = useRef<PoolDialogApi | null>(null);
  if (!apiRef.current) {
    apiRef.current = window.linkdesk?.dialogHost ?? null;
  }
  const api = apiRef.current;

  const [data, setData] = useState<PoolDialogData | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // ── 订阅壳推送（preload 缓冲+回放——硬约束 20 消费侧） ──
  useEffect(() => {
    if (!api) return;
    return api.onShow((d: PoolDialogData) => {
      setData(d);
      if (d.open) {
        // 聚焦 dialog 面板本身——对标壳 ConfirmDialog（Enter 确认不误触按钮）
        setTimeout(() => panelRef.current?.focus(), 50);
      }
    });
  }, [api]);

  // ── 键盘：Escape 关闭（alert 除外）+ Tab 焦点陷阱（设计 §7.2） ──
  useEffect(() => {
    if (!data || !data.open) return;
    // E5.8#1d EXEMPT：Path B（池不 import 壳组件）→ OverlayPortal↔DialogHost focus trap 孪生
    /* jscpd:ignore-start */
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (!data.isAlert) api?.cancel();
        return;
      }
      if (e.key !== "Tab") return;
      const el = panelRef.current;
      if (!el) return;
      const focusable = Array.from(el.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (focusable.length === 0) {
        e.preventDefault();
        return;
      }
      const firstEl = focusable[0];
      const lastEl = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === firstEl) {
        e.preventDefault();
        lastEl.focus();
      } else if (!e.shiftKey && document.activeElement === lastEl) {
        e.preventDefault();
        firstEl.focus();
      }
    };
    /* jscpd:ignore-end */
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [data, api]);

  if (!data || !data.open) return null;

  // Enter 确认——对标壳 ConfirmDialog handleKeyDown（在面板上监听）
  const handleKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      api?.confirm();
    }
  };

  return (
    <>
      {/* Backdrop——设计 §7.1：rgba(0,0,0,0.5)，zIndex dialog-1，点击关闭（alert 除外） */}
      <div
        className="dialog-host-backdrop"
        style={{ zIndex: Z_INDEX.dialog - 1 }}
        onClick={() => {
          if (!data.isAlert) api?.cancel();
        }}
      />
      {/* Modal——设计 §7.1：居中 50%/50%，minWidth 300，maxWidth 80vw，maxHeight 80vh */}
      <div
        ref={panelRef}
        className="dialog-host-panel"
        style={{ zIndex: Z_INDEX.dialog }}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
        role="dialog"
        aria-modal="true"
      >
        {data.title && <h3 className="dialog-host-title">{data.title}</h3>}
        <p className="dialog-host-message">{data.message}</p>
        <div className="dialog-host-actions">
          {!data.isAlert && (
            <button className="dialog-host-btn dialog-host-btn-secondary" onClick={() => api?.cancel()}>
              {data.cancelLabel}
            </button>
          )}
          <button className="dialog-host-btn dialog-host-btn-primary" onClick={() => api?.confirm()}>
            {data.confirmLabel}
          </button>
        </div>
      </div>
    </>
  );
}
