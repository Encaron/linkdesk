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
