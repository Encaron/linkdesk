/**
 * 壳级快捷键声明——对标 VS Code 内置 keybindings。
 * E5#44-5：从 coreCommands.ts 提取。
 */

import { registerKeybinding } from "../registry/KeybindingRegistry";

/** 壳级内置快捷键——新快捷键只需加一条到这里。 */
export const CORE_KEYBINDINGS: Array<{ command: string; key: string; args?: unknown[] }> = [
  { command: "core.openSettings",             key: "ctrl+," },
  { command: "workbench.action.showCommands", key: "ctrl+shift+p" },
  { command: "workbench.action.selectTheme",  key: "ctrl+k ctrl+t" },
  { command: "workbench.action.selectLanguage", key: "ctrl+k ctrl+l" },
  { command: "workbench.action.closeActiveTab", key: "ctrl+w" },
  { command: "workbench.action.reopenClosedEditor", key: "ctrl+shift+t" },
  { command: "workbench.action.nextTab",      key: "ctrl+tab" },
  { command: "workbench.action.nextTab",      key: "ctrl+shift+tab", args: [{ shift: true }] },
  { command: "workbench.action.toggleSplit",  key: "ctrl+\\" },
  // E5.7#84：侧栏显隐——VS Code 标准 Ctrl+B（矩阵场景 1 验证点）
  { command: "workbench.action.toggleSidebarVisibility", key: "ctrl+b" },
  { command: "workbench.action.focusNthTab",  key: "ctrl+1", args: [{ n: 1 }] },
  { command: "workbench.action.focusNthTab",  key: "ctrl+2", args: [{ n: 2 }] },
  { command: "workbench.action.focusNthTab",  key: "ctrl+3", args: [{ n: 3 }] },
  { command: "workbench.action.focusNthTab",  key: "ctrl+4", args: [{ n: 4 }] },
  { command: "workbench.action.focusNthTab",  key: "ctrl+5", args: [{ n: 5 }] },
  { command: "workbench.action.focusNthTab",  key: "ctrl+6", args: [{ n: 6 }] },
  { command: "workbench.action.focusNthTab",  key: "ctrl+7", args: [{ n: 7 }] },
  { command: "workbench.action.focusNthTab",  key: "ctrl+8", args: [{ n: 8 }] },
  { command: "workbench.action.focusNthTab",  key: "ctrl+9", args: [{ n: 9 }] },

  // ── E5#16：剪贴板——壳统一注册，按焦点上下文分发到 Provider ──
  { command: "core.clipboardCopy",   key: "ctrl+c" },
  { command: "core.clipboardPaste",  key: "ctrl+v" },
  { command: "core.clipboardCut",    key: "ctrl+x" },
  { command: "core.selectAll",       key: "ctrl+a" },
  { command: "core.delete",          key: "delete" },
  { command: "core.rename",          key: "f2" },

  // ── E5.7#79：窗口缩放——用户可改绑/冲突检测可见（快捷键面板全套现成）──
  // ctrl+shift+= 与 ctrl+= 同物理键（US 布局 "=" 上档为 "+"——Ctrl+加号），
  // "+" 在键位串中是分隔符无法表达，按键侧归一化 "+"→"="（KeybindingRegistry + keyboard-router）。
  { command: "view.zoomIn",    key: "ctrl+=" },
  { command: "view.zoomIn",    key: "ctrl+shift+=" },
  { command: "view.zoomOut",   key: "ctrl+-" },
  { command: "view.zoomReset", key: "ctrl+0" },
];

let _registered = false;

/** 注册壳级快捷键（幂等——只执行一次） */
export function ensureCoreKeybindings(): void {
  if (_registered) return;
  _registered = true;
  for (const kb of CORE_KEYBINDINGS) {
    registerKeybinding({ ...kb, source: "builtin" });
  }
}
