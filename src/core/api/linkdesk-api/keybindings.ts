/**
 * linkdesk-api 快捷键域——自 linkdesk-api.ts 拆出（E5.8#0d.10-9b）。
 * keybindings 命名空间面 verbatim。
 * 依赖方向：keybindings → KeybindingRegistry（Keybinding type）+ types/ipc/keyboard；被聚合器交叉组装。
 */

import type { Keybinding } from "../../registry/commands/KeybindingRegistry";
import type { ForwardedKeyboardInput, KeybindingSyncData } from "../../types/ipc/keyboard";

/** 快捷键——壳/池双端注入（syncToMainProcess/onForwardedEvent 为壳侧独有）。池插件消费 setKeybindingCaptureActive（file-tree），必选 */
export interface KeybindingsAPI {
  keybindings: {
    getKeybindings(): Promise<Keybinding[]>;
    getConflicts(): Promise<unknown>;
    registerKeybinding(binding: unknown): Promise<void>;
    saveUserKeybindings(): Promise<void>;
    removeKeybindingForCommand(commandId: string): Promise<void>;
    resetKeybindingToDefault(commandId: string): Promise<void>;
    findKeybindingForCommand(commandId: string): Promise<Keybinding | undefined>;
    setKeybindingCaptureActive(active: boolean): Promise<void>;
    // 纯数据形参——contextBridge 结构化克隆丢 KeyboardEvent 原生属性（.key/.code 是 C++ getter），
    // 调用方先提取字段再传（KeybindingSettingsView 同款）。真实 KeyboardEvent 天然满足此形状。
    keyboardEventToKeyString(e: Pick<KeyboardEvent, "key" | "ctrlKey" | "shiftKey" | "altKey" | "metaKey">): string;
    onChange(cb: () => void): () => void;
    /** 壳→主进程同步快捷键表（chord 状态机查表） */
    syncToMainProcess?(data: KeybindingSyncData): Promise<void>;
    /** 接收主进程 before-input-event 转发的拦截事件（E5.8#46.8：载荷含 sourceWindowId——按聚焦窗裁决） */
    onForwardedEvent?(cb: (input: ForwardedKeyboardInput) => void): () => void;
  };
}
