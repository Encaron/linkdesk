/**
 * TransientToast——轻 Toast 单条渲染（01 契约 §四解剖：severity 图标 / 文本 / 1 动作 / ×）。
 * 壳想池画：本组件是壳 toast store `presentation:"toast"` 条目的**池侧哑渲染件**（DTO = ToastStackItem），
 * 计时/去重/降级路由/栈上限全在壳（toastRouting + pushToast）；× /动作经既有 `notif:dismiss` /
 * `notif:action` 事件回壳（与铃铛面板同一条回程管道——零新增 IPC、零新增壳侧订阅）。
 * 🔴 命名正典（01 契约 §一）：组件名 TransientToast（⛔ ToastHost——历史上撞名两次都被删）。
 */
import type { ToastStackItem } from "../../../core/types/pool/poolLayout";

/** 池 → 壳事件回程（与 StatusBarZone 的 emitNotif 同款——events.emit 直通壳 useSubscriptions 订阅） */
function emitToast(channel: string, payload?: unknown): void {
  window.linkdesk?.events?.emit(channel, payload);
}

/** severity 图标 glyph（aria-hidden——语义由文案承载，01 §四） */
const SEV_GLYPH: Record<string, string> = { info: "i", success: "✓", warning: "!" };

export default function TransientToast({ item, dismissLabel }: { item: ToastStackItem; dismissLabel?: string }) {
  return (
    <div className="ldk-tt" data-severity={item.severity} data-tt-id={item.id}>
      {item.icon !== false && (
        <span className="ldk-tt-sev" aria-hidden="true">
          {SEV_GLYPH[item.severity] ?? "i"}
        </span>
      )}
      <span className="ldk-tt-msg">{item.message}</span>
      {item.action && (
        <button
          type="button"
          className="ldk-tt-act"
          onClick={() => emitToast("notif:action", { id: item.id, index: 0 })}
        >
          {item.action.title}
        </button>
      )}
      {/* × 常驻占位（02 B23）：宽度恒定仅透明度变化——⛔ hover 才占位（历史 bug：文字被推走弹回） */}
      <button
        type="button"
        className="ldk-tt-x"
        aria-label={dismissLabel}
        onClick={() => emitToast("notif:dismiss", item.id)}
      >
        ✕
      </button>
    </div>
  );
}
