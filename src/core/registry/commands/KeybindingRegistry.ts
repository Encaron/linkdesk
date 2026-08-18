/**
 * 快捷键注册表——对标 VS Code KeybindingService（聚合器门面）。
 * Phase 5 柱子 6.2：插件声明 contributes.keybindings → 全局键盘事件分发。
 *
 * 职责分工（Phase 5c 定规）：App.tsx capture handler 处理壳级快捷键；
 * 本 Registry 只处理插件快捷键（带 when 上下文）——App.tsx 匹配后 stopImmediatePropagation，本 Registry 不再触发。
 *
 * E5.8#0d.10-8e：拆 KeybindingRegistry/ 子模块后，本文件 = 聚合器——全量 re-export 22 公开符号，
 * 外部消费方 import 路径零变更（"./KeybindingRegistry" 命中文件，"./KeybindingRegistry/types" 命中子模块）。
 * 分层依赖（单向无环）：normalization（纯函数，零依赖）→ registry（注册表/_bindings 属主）→
 * persistence（keybindings.json 读写）→ dispatch（全局键盘事件分发，总入口层）。
 * 6 子模块：types · normalization · chord（双键状态机）· registry · persistence · dispatch。
 */

/* ── 类型 ── */
export type { Keybinding, KeybindingConflict } from "./KeybindingRegistry/types";
export type { KeyboardInput } from "../../types/ipc/keyboard"; // 保既有 import 路径（E5.7#97 归口 src/core/types/ipc/keyboard）

/* ── 规范化 ── */
export { keyboardInputToKeyString, keyboardEventToKeyString } from "./KeybindingRegistry/normalization";

/* ── Registry 注册表 ── */
export {
  keybindingResolver,
  registerKeybinding,
  removeKeybindingForCommand,
  resetKeybindingToDefault,
  unregisterPluginKeybindings,
  getKeybindings,
  findKeybindingForCommand,
  getKeybindingSyncData,
} from "./KeybindingRegistry/registry";

/* ── 持久化 ── */
export { saveUserKeybindings, initUserKeybindings, openKeybindingsSettings } from "./KeybindingRegistry/persistence";

/* ── 全局键盘事件分发 ── */
export {
  setKeybindingCaptureActive,
  isEditableElementFocused,
  handleKeyEvent,
  handleKeyInput,
  mountGlobalKeybindings,
  clearKeybindings,
} from "./KeybindingRegistry/dispatch";
