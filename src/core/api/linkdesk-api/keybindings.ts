/**
 * linkdesk-api keybindings domain — split out of linkdesk-api.ts (E5.8#0d.10-9b).
 * The keybindings namespace surface verbatim.
 * Dependency direction: keybindings → KeybindingRegistry (Keybinding type) + types/ipc/keyboard; cross-composed by the aggregator.
 */

import type { Keybinding } from "../../registry/commands/KeybindingRegistry";
import type { ForwardedKeyboardInput, KeybindingSyncData } from "../../types/ipc/keyboard";

/** Keybindings — injected on both shell/pool ends (syncToMainProcess/onForwardedEvent are shell-side only). Consumed by pool plugins via setKeybindingCaptureActive (file-tree), required */
export interface KeybindingsAPI {
  keybindings: {
    getKeybindings(): Promise<Keybinding[]>;
    getConflicts(): Promise<unknown>;
    registerKeybinding(binding: unknown): Promise<void>;
    saveUserKeybindings(): Promise<void>;
    removeKeybindingForCommand(commandId: string): Promise<void>;
    resetKeybindingToDefault(commandId: string): Promise<void>;
    /** Clear a command's bindings — "this command wants no key": deletes all existing bindings + suppresses built-in/plugin
     *  defaults (still keyless after restart), until the user rebinds or "Restore default". ⚠️ Difference from resetKeybindingToDefault =
     *  when "the author declared a key", reset pushes that key back (a rollback); this method does not. Requires LinkDesk 0.2.46+
     *  (absent on older shells ⇒ callers feature-detect first) */
    clearKeybindingForCommand(commandId: string): Promise<void>;
    findKeybindingForCommand(commandId: string): Promise<Keybinding | undefined>;
    setKeybindingCaptureActive(active: boolean): Promise<void>;
    // Pure-data parameter — contextBridge structured clone drops KeyboardEvent native properties (.key/.code are C++ getters);
    // callers extract the fields first, then pass them (same as KeybindingSettingsView). A real KeyboardEvent naturally satisfies this shape.
    keyboardEventToKeyString(e: Pick<KeyboardEvent, "key" | "ctrlKey" | "shiftKey" | "altKey" | "metaKey">): string;
    onChange(cb: () => void): () => void;
    /** Shell→main process keybinding table sync (chord state-machine lookup) */
    syncToMainProcess?(data: KeybindingSyncData): Promise<void>;
    /** Receive intercepted events forwarded from the main process's before-input-event (E5.8#46.8: the payload carries sourceWindowId — adjudicated per focused window) */
    onForwardedEvent?(cb: (input: ForwardedKeyboardInput) => void): () => void;
  };
}
