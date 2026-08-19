/**
 * Keybinding 归一化层——自 KeybindingRegistry.ts 拆出（E5.8#0d.10-8a）后归位 utils/（E5.8#1b）。
 * 键盘输入/快捷键字符串 → 规范化键位串纯函数，零模块态零 React。
 * 跨进程共享（壳 renderer/主进程/池 preload 三端 import 同一权威源，防 E5.7#79 +→= 修复漂移复发）：
 *   - 壳侧：src/core/registry/commands/KeybindingRegistry（dispatch/registry）+ 对外 re-export
 *   - 主进程：electron/windows/keyboard-router.ts（before-input-event 归一化）
 *   - 池 preload：electron/preload-pool/namespaces-plugin.ts（window.linkdesk.keybindings 镜像）
 *   - 壳 preload：electron/preload-shell.ts（window.linkdesk.keybindings 镜像）
 * 依赖方向：本模块 → types（KeyboardInput type）；无反向。electron 侧运行时 import 需 .js 扩展（CommonJS）。
 */

import type { KeyboardInput } from "../types/ipc/keyboard";

/**
 * 规范化快捷键字符串 → 可比较的形式。
 * "Ctrl+K" → "ctrl+k", "CTRL+SHIFT+B" → "ctrl+shift+b"
 */
function normalizeKey(key: string): string {
  return key
    .toLowerCase()
    .split("+")
    .map((k) => k.trim())
    .sort(compareModifiers)
    .join("+");
}

/** 特殊键映射——KeyboardEvent.key → 规范化短名 */
const KEY_MAP: Record<string, string> = {
  ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right",
  Escape: "escape", Enter: "enter", Tab: "tab", Backspace: "backspace",
  Delete: "delete", Home: "home", End: "end", PageUp: "pageup", PageDown: "pagedown",
  " ": "space",
};

const MODIFIER_KEYS = new Set(["control", "shift", "alt", "meta"]);
const MODIFIER_ORDER = ["ctrl", "shift", "alt", "meta"];

/** 修饰键优先排序器——ctrl > shift > alt > meta，非修饰键按 localeCompare（normalizeKey 与 keyboardInputToKeyString 共用，E5.8#1c 去重） */
function compareModifiers(a: string, b: string): number {
  const ai = MODIFIER_ORDER.indexOf(a);
  const bi = MODIFIER_ORDER.indexOf(b);
  if (ai !== -1 && bi !== -1) return ai - bi;
  if (ai !== -1) return -1;
  if (bi !== -1) return 1;
  return a.localeCompare(b);
}

/** 纯数据 → 规范化快捷键字符串——主进程和壳侧共用 */
export function keyboardInputToKeyString(input: KeyboardInput): string {
  const parts: string[] = [];
  if (input.ctrlKey) parts.push("ctrl");
  if (input.shiftKey) parts.push("shift");
  if (input.altKey) parts.push("alt");
  if (input.metaKey) parts.push("meta");

  if (!input.key) return "";
  let key = KEY_MAP[input.key] ?? input.key.toLowerCase();
  // E5.7#79：物理键归一化——"+" 是 "=" 的上档字符（US 布局），Ctrl+Shift+=（= Ctrl+加号）
  // 与 Ctrl+= 同物理键。"+" 在键位串中是分隔符（normalizeKey 无法表达）——按键侧归一化为 "="。
  if (key === "+") key = "=";
  if (MODIFIER_KEYS.has(key)) return "";

  parts.push(key);
  return parts.sort(compareModifiers).join("+");
}

/**
 * KeyboardEvent → 规范化快捷键字符串。
 * 对标 VS Code 的键盘事件到 keybinding 的映射。
 */
export function keyboardEventToKeyString(e: KeyboardEvent): string {
  return keyboardInputToKeyString({
    ctrlKey: e.ctrlKey,
    shiftKey: e.shiftKey,
    altKey: e.altKey,
    metaKey: e.metaKey,
    key: e.key,
    code: e.code,
  });
}

export { normalizeKey };
