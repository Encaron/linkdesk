/**
 * E4V#40i2a 编辑器导航桥——F12/Ctrl+Click 跳转定义 → 壳标签页。
 *
 * Standalone Monaco 没有 IEditorService.openEditor()——F12 走 addAction，
 * Ctrl+Click 走 gotoLocation.alternativeDefinitionCommand。
 * 两者汇到同一个 action handler → 调 TS worker 拿定义 → 壳 TabActions.createTab()。
 *
 * 🔥 不使用 monaco-vscode-api 的 initialize()——它替换整个服务层，
 *    standalone action（revealDefinition 等）全丢失，Ctrl+Click 失效。
 *    直接在自定义 action 里调 TS worker + tabActions 桥接——已验证可行。
 */
import { normalizePath } from "@src/core/pathUtils";

export interface NavigateToFile {
  (filePath: string): void;
}

/** file:///e%3A/_testfiles/utils.ts → E:/_testfiles/utils.ts */
export function fileUriToPath(uri: string): string {
  return normalizePath(decodeURIComponent(uri.replace(/^file:\/\/\//, "")));
}

/**
 * F12 跳转后目标编辑器需要滚动到的位置。
 * 模块级暂存——EditorView(A) 写入，EditorView(B) mount 时读取并清除。
 * 不上壳——编辑器领域内务，核心不碰。
 */
const _pendingReveal = new Map<string, { line: number; column: number }>();

export function setPendingReveal(filePath: string, line: number, column: number): void {
  _pendingReveal.set(normalizePath(filePath), { line, column });
}

export function consumePendingReveal(filePath: string): { line: number; column: number } | undefined {
  const key = normalizePath(filePath);
  const pos = _pendingReveal.get(key);
  _pendingReveal.delete(key);
  return pos;
}
