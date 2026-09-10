/**
 * useSubscriptions——通知面板回传 handler 单测（E6#73f S4）。
 * 覆盖：池面板「全部清除」/ 单条 × 回传 → **跳过尚无结果（progress）的条目**，
 * 它们只能由创建它们的句柄收掉（18 档 A2：安装跑到 10% 时点「全部清除」，
 * 若连进度条一起清掉，此后整个安装期屏幕上零反馈、装完才突然冒一条）。
 *
 * 被测面只是 12 个订阅里的通知那一组；其余订阅靠 window.linkdesk / registry 桩空转（不触发即 no-op）。
 * fixture 全虚构（硬约束 21：demo-plugin / 演示消息）。
 * @vitest-environment jsdom
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { useRef } from "react";
import { useSyncSubscriptions } from "./useSubscriptions";
import { pushToast, dismissToast, getToasts, setNotifPanelOpen } from "../../core/services/ui/toast";
import { _seenIds } from "./notif";

type Handler = (payload: unknown) => void;

/** 池侧事件桩——捕获壳回传 handler，测试里手动 fire（真实通道走 preload events.on） */
const handlers = new Map<string, Set<Handler>>();
function fire(channel: string, payload: unknown): void {
  for (const cb of handlers.get(channel) ?? []) cb(payload);
}

function installEventsStub(): void {
  const events = {
    on: (channel: string, cb: Handler) => {
      if (!handlers.has(channel)) handlers.set(channel, new Set());
      handlers.get(channel)!.add(cb);
      return () => { handlers.get(channel)?.delete(cb); };
    },
    emit: vi.fn(),
    off: vi.fn(),
  };
  (window as unknown as { linkdesk: unknown }).linkdesk = { events, pool: {} };
}

function clearStore(): void {
  for (const n of getToasts()) dismissToast(n.id);
  _seenIds.clear();
  setNotifPanelOpen(false);
}

beforeEach(() => {
  handlers.clear();
  installEventsStub();
  clearStore();
});

afterEach(() => {
  clearStore();
  delete (window as unknown as { linkdesk?: unknown }).linkdesk;
});

/** 挂载 hook——12 个订阅里只有通知那组会被 fire 触发，其余保持空转 */
function mount() {
  return renderHook(() => {
    const poolApiRef = useRef(null);
    const chordTimerRef = useRef(null);
    useSyncSubscriptions({
      poolApiRef,
      setLayoutVersion: () => {},
      setChordLabel: () => {},
      setEventEntries: () => {},
      chordTimerRef,
    });
  });
}

describe("E6#73f S4：用户移除跳过进行中条目", () => {
  it("notif:clearAll 只清已有结果的，进度条留下（等句柄收）", () => {
    mount();
    const running = pushToast({ message: "演示消息 装到一半", source: "demo-plugin", progress: true, ttl: 0 });
    pushToast({ message: "演示消息 一条结果", source: "demo-plugin", ttl: 0 });

    fire("notif:clearAll", undefined);

    const left = getToasts();
    expect(left).toHaveLength(1);
    expect(left[0]!.id).toBe(running);
  });

  it("notif:dismiss 对进度条静默 no-op（面板侧也隐藏这类行的 ×，此处是壳侧兜底）", () => {
    mount();
    const running = pushToast({ message: "演示消息 装到一半", source: "demo-plugin", progress: true, ttl: 0 });
    pushToast({ message: "演示消息 普通", source: "demo-plugin", ttl: 0 });

    fire("notif:dismiss", running);
    expect(getToasts().map((t) => t.id)).toContain(running);

    // 非进度条目照旧可关（现状不回归）
    const normal = getToasts().find((t) => t.id !== running)!;
    fire("notif:dismiss", normal.id);
    expect(getToasts().map((t) => t.id)).toEqual([running]);
  });

  it("句柄收条走 dismissToast 直调——不受面板回传的 S4 门禁影响（进度条真能收掉）", () => {
    mount();
    const running = pushToast({ message: "演示消息 装到一半", source: "demo-plugin", progress: true, ttl: 0 });
    dismissToast(running); // = cancelNotification 走的路径
    expect(getToasts()).toHaveLength(0);
  });

  it("载荷类型不符 / 目标不存在 → 静默 no-op（通道契约宽容）", () => {
    mount();
    pushToast({ message: "演示消息 普通", source: "demo-plugin", ttl: 0 });
    fire("notif:dismiss", 123);
    fire("notif:dismiss", "toast-not-exist");
    expect(getToasts()).toHaveLength(1);
  });
});
