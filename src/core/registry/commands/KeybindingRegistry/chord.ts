/**
 * KeybindingRegistry chord 状态机域——自 KeybindingRegistry.ts 拆出（E5.8#0d.10-8b）。
 * 双键序列（E2c #16）等待态：_chordState 属主 + 超时常量 + resetChord。
 * isChordPrefix 读 _bindings 属 registry 域（本模块不依赖 registry——单向无环）。
 * 依赖方向：chord → CoreEvents（CHORD_CHANGED）+ types；被 dispatch 消费。
 */

import { CUSTOM_EVENTS } from "../../../react/events/CoreEvents";
import type { ChordState } from "./types";

/** E5#102c: chord 第二键等待超时（ms） */
export const CHORD_TIMEOUT = 2000;

export const _chordState: ChordState = {
  isPending: false,
  firstKey: "",
  timer: null,
};

/** 重置 chord 状态——超时/第二键匹配/不匹配时调用。顺带通知状态栏清除提示。 */
export function resetChord(): void {
  if (_chordState.timer) {
    clearTimeout(_chordState.timer);
  }
  const wasPending = _chordState.isPending;
  _chordState.isPending = false;
  _chordState.firstKey = "";
  _chordState.timer = null;
  if (wasPending) {
    window.dispatchEvent(new CustomEvent(CUSTOM_EVENTS.CHORD_CHANGED, {
      detail: { isPending: false },
    }));
  }
}
