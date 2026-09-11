/**
 * 合屏迁移快照（读回 / 落档）——E6#87b 从 src/index.tsx 的 SerialMonitorView 搬出（只搬不改）。
 *
 * E5.8#30.14（P4）：方向 c——不走会话级持久化（太重）也不走跨组 keep-alive（违背 B22）。
 * 只快照接收区内容（CM6 行 + RingBuffer），连接状态靠 _initOnce 自动恢复。
 *
 * 🔴 调用顺序：本 hook 必须排在接收区 CM6 mount（useReceiveEditorMount）**之后**——
 *    「RingBuffer 落档」effect 的 cleanup 要早于 CM6 cleanup 跑（React cleanup 逆序），
 *    这样 CM6 cleanup 读 prev 时能合并到本 effect 已写入的 ring，两份不互相覆盖。
 */

import { useEffect } from "react";
import type { EditorView } from "@codemirror/view";
import { _receiveSnapshots } from "../../services/receiveSnapshots";
import { getSessionById } from "../../hooks/useSerialSessions";
import type { RingBuffer } from "../../utils/RingBuffer";
import type { LineType, ReceiveItem } from "../../types";

export interface ReceiveSnapshotsOptions {
  sourceId?: string;
  cmView: React.MutableRefObject<EditorView | null>;
  hexView: React.MutableRefObject<EditorView | null>;
  dualPaneRef: React.MutableRefObject<boolean>;
  ringBuffer: React.MutableRefObject<RingBuffer<ReceiveItem>>;
  appendLine: (text: string, color: LineType) => void;
  appendToView: (view: EditorView | null, text: string, color: LineType) => void;
}

export function useReceiveSnapshots(o: ReceiveSnapshotsOptions): void {
  const { sourceId, hexView, dualPaneRef, ringBuffer, appendLine, appendToView } = o;

  // E5.8#30.14（P4）：mount 恢复——跨组 remount 时从 _receiveSnapshots 读回接收区历史。
  // CM6 逐行 appendLine 重放（行色 + 时间戳 mark 由 appendLine 复用运行时路径重算，零新逻辑）；
  // E5.8#30.19a：双栏开 → 同步重放 hexLines 到 HEX 栏（直接 appendToView，零新逻辑）；
  // RingBuffer 逐条 write 回填（后续 data 连续衔接）。平时无快照 → 直接 no-op。
  // deps 含 appendLine 是保险：设置变更触发重跑时快照已删 → 空 return，无害。
  useEffect(() => {
    if (!sourceId) return;
    const snap = _receiveSnapshots.get(sourceId);
    if (!snap) return;
    _receiveSnapshots.delete(sourceId);
    for (const it of snap.lines) appendLine(it.text, it.type);
    if (dualPaneRef.current && hexView.current) {
      for (const it of snap.hexLines) appendToView(hexView.current, it.text, it.type);
    }
    for (const it of snap.ring) ringBuffer.current.write(it);
  }, [sourceId, appendLine, appendToView, dualPaneRef, hexView, ringBuffer]);

  // E5.8#30.14（P4）：unmount 快照 RingBuffer——与 CM6 快照（useReceiveEditorMount cleanup）合并为同一份。
  // React cleanup 逆序执行：本 effect 后声明 → cleanup 先跑，CM6 view 仍存活，
  // 故 CM6 cleanup 读 prev 时能合并到本 effect 已写入的 ring，两份不互相覆盖。
  useEffect(() => {
    // useRef 持有 RingBuffer 实例、从不重赋——局部引用等价于 current，且避开
    // exhaustive-deps 对「ref 值可能在 cleanup 时变化」的保守告警（DOM ref 才需防）。
    const rb = ringBuffer.current;
    return () => {
      if (!sourceId || !getSessionById(sourceId)) return;
      const ring = rb.drainAll();
      if (ring.length === 0) return;
      const prev = _receiveSnapshots.get(sourceId);
      _receiveSnapshots.set(sourceId, { lines: prev?.lines ?? [], hexLines: prev?.hexLines ?? [], ring });
    };
  }, [sourceId, ringBuffer]);
}
