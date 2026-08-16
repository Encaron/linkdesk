/**
 * 编辑器导航桥——F12/Ctrl+Click 跳转定义 → 壳标签页。
 *
 * Standalone Monaco 没有 IEditorService.openEditor()——F12 走 addAction，
 * Ctrl+Click 走 gotoLocation.alternativeDefinitionCommand。
 * 两者汇到同一个 action handler → 调 TS worker 拿定义 → 壳 TabActions.createTab()。
 *
 * 🔥 不使用 monaco-vscode-api 的 initialize()——它替换整个服务层，
 *    standalone action（revealDefinition 等）全丢失，Ctrl+Click 失效。
 *    直接在自定义 action 里调 TS worker + tabActions 桥接——已验证可行。
 */
const lk = window.linkdesk;

/** file:///e%3A/_testfiles/utils.ts → E:/_testfiles/utils.ts */
export function fileUriToPath(uri: string): string {
  return lk.path.normalize(decodeURIComponent(uri.replace(/^file:\/\/\//, "")));
}

/** 兜底——editor 尚未挂载时暂存 reveal 位置，mount/isActive effect 中 consume */
const _pendingReveal = new Map<string, { line: number; column: number }>();

/** 归一化路径——反斜杠 + 大小写统一。Windows 驱动器字母可能 TS 返回 e:/ 文件树是 E:/ */
function _norm(p: string): string {
  return lk.path.normalize(p).toLowerCase();
}

export function setPendingReveal(filePath: string, line: number, column: number): void {
  _pendingReveal.set(_norm(filePath), { line, column });
}

export function consumePendingReveal(filePath: string): { line: number; column: number } | undefined {
  const key = _norm(filePath);
  const pos = _pendingReveal.get(key);
  if (pos) _pendingReveal.delete(key);
  return pos;
}
