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

/** file:///e%3A/_testfiles/utils.ts → E:/_testfiles/utils.ts */
export function fileUriToPath(uri: string): string {
  return normalizePath(decodeURIComponent(uri.replace(/^file:\/\/\//, "")));
}

/**
 * 编辑器注册表——filePath → editor 实例。
 * F12 handler 查本表直连目标 editor，不经过 React 生命周期，无竞态。
 * 不上壳——编辑器领域内务，核心不碰。
 */
const _editorRegistry = new Map<string, any>();
const _pendingReveal = new Map<string, { line: number; column: number }>();

/* ── Editor 注册表 ── */

export function registerEditor(filePath: string, editor: any): void {
  _editorRegistry.set(normalizePath(filePath), editor);
}

export function unregisterEditor(filePath: string): void {
  _editorRegistry.delete(normalizePath(filePath));
}

export function getRegisteredEditor(filePath: string): any | undefined {
  return _editorRegistry.get(normalizePath(filePath));
}

/* ── 兜底——editor 尚未注册时暂存位置 ── */

export function setPendingReveal(filePath: string, line: number, column: number): void {
  _pendingReveal.set(normalizePath(filePath), { line, column });
}

export function consumePendingReveal(filePath: string): { line: number; column: number } | undefined {
  const key = normalizePath(filePath);
  const pos = _pendingReveal.get(key);
  _pendingReveal.delete(key);
  return pos;
}
