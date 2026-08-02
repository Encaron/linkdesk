/**
 * E4V#40p 已关闭标签页栈——Ctrl+Shift+T 恢复最近关闭的编辑器标签页。
 *
 * 模块级——命令 handler 和 EditorTab 共享。
 * EditorTab unmount（标签页关闭）时 push，Ctrl+Shift+T handler pop。
 */
interface ClosedTabEntry {
  filePath: string;
  label: string;
}

const MAX_STACK = 20;
const stack: ClosedTabEntry[] = [];

/** 标签页关闭时调用 */
export function pushClosedEditorTab(entry: ClosedTabEntry): void {
  stack.push(entry);
  if (stack.length > MAX_STACK) stack.shift();
}

/** 取最近关闭的标签页——Ctrl+Shift+T handler 调用 */
export function popClosedEditorTab(): ClosedTabEntry | undefined {
  return stack.pop();
}
