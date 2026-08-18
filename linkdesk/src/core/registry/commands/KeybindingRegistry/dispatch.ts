/**
 * KeybindingRegistry 分发域——自 KeybindingRegistry.ts 拆出（E5.8#0d.10-8d）。
 * 全局键盘事件分发：_captureActive 属主 + 可编辑检测 + handleKeyEvent/handleKeyInput + mountGlobalKeybindings
 * + clearKeybindings（组合清理——registry.clearBindings + persistence.clearPersistence + chord.resetChord）。
 * 依赖方向：dispatch → registry/chord/normalization/persistence + CommandRegistry + CoreEvents；无反向（总入口层）。
 */

import { executeCommand, hasHandler } from "../CommandRegistry";
import { CoreEvents, CUSTOM_EVENTS } from "../../../react/events/CoreEvents";
import type { KeyboardInput } from "../../../types/ipc/keyboard";
import { keyboardInputToKeyString, keyboardEventToKeyString } from "./normalization";
import { isChordPrefix, keybindingResolver, clearBindings, getKeybindingSyncData } from "./registry";
import { _chordState, resetChord, CHORD_TIMEOUT } from "./chord";
import { clearPersistence } from "./persistence";

/** E3f #59-D：行内编辑活跃时阻止全局快捷键分发——防止 chord 状态机冲突 */
let _captureActive = false;
export function setKeybindingCaptureActive(active: boolean): void { _captureActive = active; }

/**
 * 🔥 检测当前聚焦元素是否为可编辑元素（input/textarea/select/contentEditable）。
 * 若是，快捷键分发应放行——让浏览器原生处理 Ctrl+C/V/A/Z 等。
 * 一劳永逸：新组件加原生 input 不需要手动设任何东西。
 */
export function isEditableElementFocused(): boolean {
  const el = document.activeElement;
  if (!el) return false;
  const tag = el.tagName.toLowerCase();
  return tag === "input" || tag === "textarea" || tag === "select"
    || (el as HTMLElement).isContentEditable;
}

/**
 * 全局 keydown 处理器——对标 VS Code 的键盘事件分发。
 * 挂到 window 上，App 启动时调用一次。
 *
 * E2c #16：支持 chord（双键序列）——如 Ctrl+K Ctrl+S。
 */
export function handleKeyEvent(e: KeyboardEvent): boolean {
  if (_captureActive) return false; // E3f #59-D：行内编辑优先
  // 🔥 DOM 直检——不依赖组件手动设 context key，永不遗漏
  if (isEditableElementFocused()) return false;
  const keyString = keyboardEventToKeyString(e);
  if (!keyString) return false; // modifier 键自己

  // ── Chord 第二键 ──
  if (_chordState.isPending) {
    // 忽略重复的同一按键——键盘重复（key repeat）会发送相同的 keydown
    if (keyString === _chordState.firstKey) return true;
    const firstKey = _chordState.firstKey; // 保存——resetChord 会清掉
    resetChord(); // 清除 timer + 清除状态栏提示
    const fullChord = `${firstKey} ${keyString}`;

    const winner = keybindingResolver.resolve(fullChord);
    if (winner && hasHandler(winner.command)) {
      e.preventDefault();
      e.stopImmediatePropagation();
      executeCommand(winner.command, undefined, ...(winner.args ?? []));
      return true;
    }
    // chord 第二键不匹配 → 通知状态栏显示错误提示（对标 VS Code）
    window.dispatchEvent(new CustomEvent(CUSTOM_EVENTS.CHORD_CHANGED, {
      detail: { isPending: false, failedKey: keyString, firstKey },
    }));
    return false;
  }

  // ── Chord 第一键：检查此 key 是否有子 chord ──
  if (isChordPrefix(keyString)) {
    _chordState.isPending = true;
    _chordState.firstKey = keyString;
    _chordState.timer = setTimeout(resetChord, CHORD_TIMEOUT); // 2s 无第二键 → 取消
    window.dispatchEvent(new CustomEvent(CUSTOM_EVENTS.CHORD_CHANGED, {
      detail: { isPending: true, firstKey: keyString },
    }));
    e.preventDefault();
    return true; // 消费了事件——等待第二键
  }

  // ── 单键匹配——Resolver 仲裁（E2c #17a） ──
  const winner = keybindingResolver.resolve(keyString);
  if (winner && hasHandler(winner.command)) {
    e.preventDefault();
    e.stopImmediatePropagation();
    executeCommand(winner.command, undefined, ...(winner.args ?? []));
    return true;
  }

  return false;
}

/**
 * E5.5#7-p8：主进程转发的键盘事件处理——纯数据输入，无 DOM event。
 * 逻辑与 handleKeyEvent 一致，但不调用 preventDefault/stopImmediatePropagation（无 event 对象）。
 * 返回 true 表示壳消费了此按键（应已 preventDefault 在主进程侧）。
 */
export function handleKeyInput(input: KeyboardInput): boolean {
  if (_captureActive) return false;
  if (isEditableElementFocused()) return false;
  const keyString = keyboardInputToKeyString(input);
  if (!keyString) return false;

  // ── Chord 第二键 ──
  if (_chordState.isPending) {
    if (keyString === _chordState.firstKey) return true;
    const firstKey = _chordState.firstKey;
    resetChord();
    const fullChord = `${firstKey} ${keyString}`;
    const winner = keybindingResolver.resolve(fullChord);
    if (winner && hasHandler(winner.command)) {
      executeCommand(winner.command, undefined, ...(winner.args ?? []));
      return true;
    }
    window.dispatchEvent(new CustomEvent(CUSTOM_EVENTS.CHORD_CHANGED, {
      detail: { isPending: false, failedKey: keyString, firstKey },
    }));
    return false;
  }

  // ── Chord 第一键 ──
  if (isChordPrefix(keyString)) {
    _chordState.isPending = true;
    _chordState.firstKey = keyString;
    _chordState.timer = setTimeout(resetChord, CHORD_TIMEOUT);
    window.dispatchEvent(new CustomEvent(CUSTOM_EVENTS.CHORD_CHANGED, {
      detail: { isPending: true, firstKey: keyString },
    }));
    return true;
  }

  // ── 单键匹配 ──
  const winner = keybindingResolver.resolve(keyString);
  if (winner && hasHandler(winner.command)) {
    executeCommand(winner.command, undefined, ...(winner.args ?? []));
    return true;
  }

  return false;
}

/**
 * 挂载全局键盘监听——App 启动时调用一次（在 App.tsx 壳级 handler 之后注册）。
 *
 * 只处理插件声明的 contributes.keybindings。壳级快捷键由 App.tsx 的
 * capture handler 拦截——它匹配后调用 stopImmediatePropagation，
 * 本 handler 不会收到。
 *
 * 返回 disposable 函数（测试/热重载用）。
 */
export function mountGlobalKeybindings(): () => void {
  const handler = (e: KeyboardEvent) => {
    handleKeyEvent(e);
  };
  window.addEventListener("keydown", handler, true); // capture phase——先于浏览器处理

  // E5.5#7-p7：接收主进程 before-input-event 转发的快捷键
  const linkdesk = window.linkdesk;
  let forwardCleanup: (() => void) | null = null;
  if (linkdesk?.keybindings?.onForwardedEvent) {
    forwardCleanup = linkdesk.keybindings.onForwardedEvent((input: KeyboardInput) => {
      handleKeyInput(input);
    });
  }

  // E5.5#7-p7：同步快捷键表到主进程（异步——keybindings 可能尚未全部注册）
  const doSync = () => {
    if (linkdesk?.keybindings?.syncToMainProcess) {
      linkdesk.keybindings.syncToMainProcess(getKeybindingSyncData());
    }
  };
  // 首次同步——稍延迟，等插件 keybindings 注册完毕
  setTimeout(doSync, 0);
  // 快捷键变更时重同步
  const _onChangeCleanup = CoreEvents.onDidChangeKeybindings.event(doSync);

  return () => {
    window.removeEventListener("keydown", handler, true);
    if (forwardCleanup) forwardCleanup();
    if (_onChangeCleanup) _onChangeCleanup();
  };
}

/** 清空注册表（测试用）——组合清理各域属主态 */
export function clearKeybindings(): void {
  clearBindings();
  clearPersistence();
  resetChord();
}
