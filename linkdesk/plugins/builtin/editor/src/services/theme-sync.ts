/**
 * E4V#40e 主题同步——LinkDesk 主题 ↔ Monaco 内置主题切换。
 *
 * syncMonacoTheme()：直接切换到 vs-dark / vs 内置主题。
 * subscribeThemeSync()：订阅 CoreEvents.onDidChangeTheme → 自动同步。
 *
 * 设计原则：
 *   - 用 Monaco 内置的 vs-dark / vs——零自定义 token，零 defineTheme
 *   - defineTheme("linkdesk", inherit:true) 在重复调用时可能不复用 base token 色
 *     → 导致暗色主题下函数名/标识符 token 变黑（Monaco 已知 issue）
 */
import { CoreEvents } from "@src/core/react/CoreEvents";

/** 当前是否暗色主题 */
function isDarkTheme(): boolean {
  return document.documentElement.getAttribute("data-theme") === "dark";
}

/**
 * 同步 Monaco 主题到 LinkDesk 当前主题。
 * 调用时机：EditorView mount 时 + 每次 onDidChangeTheme。
 */
export function syncMonacoTheme(monaco: any): void {
  const isDark = isDarkTheme();
  const theme = isDark ? "vs-dark" : "vs";
  console.log(`[theme-sync] ${document.documentElement.getAttribute("data-theme")} → setTheme("${theme}")`);
  monaco.editor.setTheme(theme);
}

/**
 * 订阅 LinkDesk 主题变更——回调中调 syncMonacoTheme。
 * 返回 unsubscribe 函数——useEffect cleanup 中调用。
 *
 * 🔥 参数是 monaco 命名空间 ref（monaco.editor.defineTheme/setTheme），
 *   不是 editor 实例 ref（editor.layout/dispose）。
 */
export function subscribeThemeSync(monacoNsRef: { current: any }): () => void {
  return CoreEvents.onDidChangeTheme.event(() => {
    if (monacoNsRef.current) {
      syncMonacoTheme(monacoNsRef.current);
    }
  });
}
