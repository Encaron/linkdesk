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

/** 壳→主进程快捷键表同步载荷（KeybindingRegistry.getKeybindingSyncData 输出） */
export interface KeybindingSyncData {
  shortcuts: string[];
  chordPrefixes: string[];
  chordCombos: string[];
}
