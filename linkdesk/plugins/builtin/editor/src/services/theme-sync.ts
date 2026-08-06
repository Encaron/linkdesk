/**
 * E4V#40e 主题同步——LinkDesk 暗/亮 → Monaco vs-dark / vs。
 *
 * 🔴 双路径机制（E5#107 + adj）：
 *   路径 1：monaco.editor.setTheme() — 被 @codingame/monaco-vscode-api 拦截，
 *          走 StandaloneWorkbenchThemeService 异步管道。loadThemes:false 时可能找不到主题。
 *   路径 2：editor.updateOptions({theme}) — Monaco 实例级 API，绕过 VS Code service override，
 *          直接设编辑器主题。即使路径 1 竞态失败，路径 2 永远有效。
 */
import { CoreEvents } from "@src/core/react/CoreEvents";

function getTheme(): string {
  return document.documentElement.getAttribute("data-theme") === "dark" ? "vs-dark" : "vs";
}

export function syncMonacoTheme(monaco: any): void {
  const theme = getTheme();
  // 路径 1：全局 setTheme（通知 VS Code service 层）
  monaco.editor.setTheme(theme);
  // 路径 2：实例级 updateOptions——绕过 StandaloneWorkbenchThemeService 异步管道
  const editors = monaco.editor.getEditors?.() ?? [];
  for (const ed of editors) {
    try { ed.updateOptions({ theme }); } catch { /* 编辑器已销毁 */ }
  }
}

export function subscribeThemeSync(monacoNsRef: { current: any }): () => void {
  return CoreEvents.onDidChangeTheme.event(() => {
    if (monacoNsRef.current) {
      syncMonacoTheme(monacoNsRef.current);
    }
  });
}
