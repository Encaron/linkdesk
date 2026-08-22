/**
 * KeybindingRegistry 类型层——自 KeybindingRegistry.ts 拆出（E5.8#0d.10-8a）。
 * 纯类型零逻辑。依赖方向：无（被 normalization / registry / chord / persistence / dispatch 消费）。
 */

export interface Keybinding {
  /** 命令 ID */
  command: string;
  /** 快捷键字符串——如 "ctrl+k" / "ctrl+shift+b" */
  key: string;
  /** context key when 条件 */
  when?: string;
  /** 来源：user / plugin / builtin——同 key 时 user 优先 */
  source: "user" | "plugin" | "builtin";
  /** 插件 ID——卸载时精确匹配（B3 fix：原实现 source === "plugin" 会误删所有插件快捷键） */
  pluginId?: string;
  /** E3f #59-F：执行时透传给 executeCommand 的额外参数 */
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
