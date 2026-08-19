/**
 * IpcBridgeHandler 快捷键域——自 IpcBridgeHandler.ts 拆出（E5.8#0d.10-10f）。
 * 快捷键八方法（getKeybindings/getKeybindingConflicts/registerKeybinding/saveUserKeybindings/
 * removeKeybindingForCommand/resetKeybindingToDefault/findKeybindingForCommand/
 * setKeybindingCaptureActive）+ 快捷键变更订阅（_keybindingsUnsub 属主）verbatim。
 * 依赖方向：keybindings → KeybindingRegistry/CoreEvents + linkdesk-api（LinkDeskAPI 订阅类型）；被聚合器委派。
 */

import {
  getKeybindings, registerKeybinding, saveUserKeybindings,
  removeKeybindingForCommand, resetKeybindingToDefault,
  findKeybindingForCommand, setKeybindingCaptureActive,
  keybindingResolver, type Keybinding,
} from "../../../registry/commands/KeybindingRegistry";
import { CoreEvents } from "../../../react/events/CoreEvents"; // E5.5#7-p2: 快捷键变更广播
import type { LinkDeskAPI } from "../../../api/linkdesk-api";

let _keybindingsUnsub: (() => void) | null = null; // E5.5#7-p2

// ── 快捷键变更广播──

export function subscribeKeybindings(linkdesk: LinkDeskAPI): void {
  // E5.5#7-p2：快捷键变更广播——设置页快捷键子栏实时刷新
  _keybindingsUnsub = CoreEvents.onDidChangeKeybindings.event(() => {
    try { linkdesk.events?.emit("keybindings:changed", {}); } catch { /* 静默 */ }
  });
}

export function unsubscribeKeybindings(): void {
  _keybindingsUnsub?.();
  _keybindingsUnsub = null;
}

/** 快捷键八方法处理器——插件 WebView 零 @src/core import */
export async function handleKeybindingsMethod(method: string, args: unknown[]): Promise<unknown> {
  switch (method) {
    // ── E5.5#7-p2：快捷键 IPC——插件 WebView 零 @src/core import ──
    case "getKeybindings":
      return getKeybindings();
    case "getKeybindingConflicts":
      return keybindingResolver.detectConflicts();
    case "registerKeybinding": {
      const [binding] = args as [Keybinding];
      registerKeybinding(binding);
      break;
    }
    case "saveUserKeybindings":
      return saveUserKeybindings();
    case "removeKeybindingForCommand": {
      const [commandId] = args as [string];
      removeKeybindingForCommand(commandId);
      break;
    }
    case "resetKeybindingToDefault": {
      const [commandId] = args as [string];
      resetKeybindingToDefault(commandId);
      break;
    }
    case "findKeybindingForCommand": {
      const [commandId] = args as [string];
      return findKeybindingForCommand(commandId);
    }
    case "setKeybindingCaptureActive": {
      const [active] = args as [boolean];
      setKeybindingCaptureActive(active);
      break;
    }
    default:
      throw new Error(`未知的 plugins 方法: ${method}`);
  }
}
