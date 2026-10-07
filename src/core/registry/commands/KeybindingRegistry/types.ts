/**
 * KeybindingRegistry type layer—split out of KeybindingRegistry.ts (E5.8#0d.10-8a).
 * Pure types, zero logic. Dependency direction: none (consumed by normalization / registry / chord / persistence / dispatch).
 */

export interface Keybinding {
  /** Command ID */
  command: string;
  /** Keybinding string—e.g. "ctrl+k" / "ctrl+shift+b" */
  key: string;
  /** context key `when` condition */
  when?: string;
  /** Source: user / plugin / builtin—on the same key, user wins */
  source: "user" | "plugin" | "builtin";
  /** Plugin ID—exact-matched on uninstall (B3 fix: the original `source === "plugin"` check wrongly removed every plugin keybinding) */
  pluginId?: string;
  /** E3f #59-F: extra args passed through to executeCommand at dispatch time */
  args?: unknown[];
}

/** 快捷键冲突——E2c #17a：≥2 个 binding 映射到同一个 key */
export interface KeybindingConflict {
  key: string;
  bindings: Keybinding[];
}

/** Chord 状态机状态（E2c #16）——chord.ts 属主 */
export interface ChordState {
  isPending: boolean;
  firstKey: string;
  timer: ReturnType<typeof setTimeout> | null;
}
