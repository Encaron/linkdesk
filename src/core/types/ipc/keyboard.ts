/**
 * Keyboard wire contract—E5.7#97 (plan §3.1: cross-stack protocol values consolidated).
 *
 * Once defined twice: electron/keyboard-router.ts and KeybindingRegistry.ts each declared
 * KeyboardInput—changing a field on one side silently broke the other. This module defines it in one place; main process/shell/pool, three ends import type.
 */

/** Keyboard input snapshot—the executeShortcut payload forwarded after the main process normalizes before-input-event */
export interface KeyboardInput {
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
  metaKey: boolean;
  key: string;
  code: string;
}

/**
 * E5.8#46.8: the executeShortcut payload forwarded by the main process's before-input-event—keyboard snapshot + source-window stamp.
 * KeyboardInput stays pure (keyboard fields only); the source is a required field on the composed type (attachKeyboardRouting always has windowId).
 * The shell dispatch uses it to arbitrate shortcuts by the focused window (Ctrl+W closes this window's tab)—isomorphic to ShellTabAction's top-level sourceWindowId (#46.4 normalization).
 */
export interface ForwardedKeyboardInput extends KeyboardInput {
  sourceWindowId: string;
}

/** Shell→main-process shortcut table sync payload (KeybindingRegistry.getKeybindingSyncData output) */
export interface KeybindingSyncData {
  shortcuts: string[];
  chordPrefixes: string[];
  chordCombos: string[];
}
