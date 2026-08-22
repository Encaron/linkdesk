/**
 * 键盘 wire 契约——E5.7#97（方案 §3.1：跨堆协议值归口）。
 *
 * 曾双份定义：electron/keyboard-router.ts + KeybindingRegistry.ts 各自声明
 * KeyboardInput——一边改字段另一边静默失效。本模块一处定义，主进程/壳/池三端 import type。
 */

/** 键盘输入快照——主进程 before-input-event 归一化后转发的 executeShortcut 载荷 */
export interface KeyboardInput {
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
  metaKey: boolean;
  key: string;
  code: string;
}

/**
 * E5.8#46.8：主进程 before-input-event 转发的 executeShortcut 载荷——键盘快照 + 来源窗标注。
 * KeyboardInput 保持纯净（纯键盘字段）；来源作为组合类型必选字段（attachKeyboardRouting 恒有 windowId）。
 * 壳 dispatch 据此按聚焦窗裁决快捷键（Ctrl+W 关本窗 tab）——与 ShellTabAction 顶层 sourceWindowId 同构（#46.4 归一化）。
 */
export interface ForwardedKeyboardInput extends KeyboardInput {
  sourceWindowId: string;
}

/** 壳→主进程快捷键表同步载荷（KeybindingRegistry.getKeybindingSyncData 输出） */
export interface KeybindingSyncData {
  shortcuts: string[];
  chordPrefixes: string[];
  chordCombos: string[];
}
