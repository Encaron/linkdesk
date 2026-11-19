/**
 * TransientToastStack——轻 Toast 栈容器（01 契约 §六：队列布局/堆叠上限/hover 暂停）。
 * 数据 = PoolLayout.toastStack（壳推帧；store 变化经壳 subscribeToasts 的 layoutVersion bump 自动重推）。
 * 计时真相 = 壳算好的 `expiresAt` 时间戳——本组件 100ms 拍子比对 now：
 *   B21 hover / B22 焦点进入 = 全栈暂停（pausedRef）；B34 最小化期间拍子被节流、恢复按时间戳一次判清；
 *   B27 reduced-motion 由 CSS 降级动画。过期 / × / Esc 都经 `notif:dismiss` 回壳（单一写入路径 dismissToast）。
 * 🔴 栈上限 3 与同 key 合并在**壳**（TOAST_MAX_STACK / pushToast）——本组件只画，不裁不并。
 * 挂载点 = PoolZoneShell（池渲染根，layout 在手——照 HintTipRenderer「池根无条件挂载」同款理由）。
 */
import { useEffect, useRef } from "react";
import type { ToastStackLayout } from "../../../core/types/pool/poolLayout";
import { Z_INDEX } from "../../../constants";
import TransientToast from "./TransientToast";
import "./transient-toast.css";

/** 池 → 壳事件回程（与 StatusBarZone 的 emitNotif 同款） */
function emitToast(channel: string, payload?: unknown): void {
  window.linkdesk?.events?.emit(channel, payload);
}

export default function TransientToastStack({ stack }: { stack?: ToastStackLayout }) {
  const items = stack?.items ?? [];
  const pausedRef = useRef(false);
  const itemsRef = useRef(items);
  itemsRef.current = items;

  // 过期巡查——恒挂 100ms 拍子（空栈时一次数组遍历的空转，不值当挂/卸抖动）。
  // ⚠️ 不用 setTimeout 逐条挂：暂停/恢复/合并重置都要逐条重排，time-based 巡查一处搞定。
  useEffect(() => {
    const timer = setInterval(() => {
      if (pausedRef.current) return;
      const now = Date.now();
      for (const it of itemsRef.current) {
        if (now >= it.expiresAt) emitToast("notif:dismiss", it.id);
      }
    }, 100);
    return () => clearInterval(timer);
  }, []);

  // B22：Esc 关闭当前条——焦点所在条（data-tt-id 回溯）；焦点不在条上则关最新一条
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== "Escape") return;
    const focused = (e.target as HTMLElement).closest("[data-tt-id]");
    const id = focused?.getAttribute("data-tt-id") ?? items[items.length - 1]?.id;
    if (id) emitToast("notif:dismiss", id);
  };

  // 零条目 = 零 DOM（穿透纪律：root/容器零 hit area）
  if (items.length === 0) return null;

  return (
    <div
      className="ldk-tt-stack"
      style={{ zIndex: Z_INDEX.transientToast }}
      role="status"
      aria-live="polite"
      onMouseEnter={() => { pausedRef.current = true; }}
      onMouseLeave={() => { pausedRef.current = false; }}
      onFocusCapture={() => { pausedRef.current = true; }}
      onBlurCapture={(e) => {
        // 焦点在栈内条目间移动（× → 动作钮）不解除暂停——只有整栈退出才恢复（B21 全栈暂停）
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) pausedRef.current = false;
      }}
      onKeyDown={onKeyDown}
    >
      {items.map((item) => (
        <TransientToast key={item.id} item={item} dismissLabel={stack?.dismissLabel} />
      ))}
    </div>
  );
}
