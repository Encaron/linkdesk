/**
 * E5.8#184 快捷键设置行排序——复制 VS Code 默认排序第一优先级语义（keybindingsEditorModel.compareKeybindingData）。
 * 规则：有快捷键的命令浮顶 → 同组内按命令标题字母序（zh）。
 * 纯函数直测（settings 插件无组件测试基建，先例 effectiveBadge/deriveSourceBadge）。
 */

export interface KeybindingSortRow {
  title: string;
  /** 绑定的快捷键字符串；无绑定的行显示 "—"（KeybindingSettingsView 约定）。 */
  key: string;
}

/**
 * 比较两行：key !== "—"（有绑定）优先，同组内 title.localeCompare("zh")。
 * 对齐 VS Code：`compareKeybindingData` 的 `a.keybinding && !b.keybinding → -1` 层。
 */
export function compareKeybindingRows(a: KeybindingSortRow, b: KeybindingSortRow): number {
  const aBound = a.key !== "—";
  const bBound = b.key !== "—";
  if (aBound !== bBound) return aBound ? -1 : 1;
  return a.title.localeCompare(b.title, "zh");
}
