/**
 * E4V#40e 主题同步——LinkDesk 背景色 + Monaco 内置 token。
 *
 * syncMonacoTheme()：defineTheme("linkdesk-dark"/"linkdesk-light") + setTheme。
 * subscribeThemeSync()：订阅 CoreEvents.onDidChangeTheme → 自动同步。
 *
 * 设计原则：
 *   - 背景色走 LinkDesk CSS 变量（--bg-window）——和 App 主题一致
 *   - token 色走 Monaco 内置（inherit:true, base:vs-dark/vs）
 *   - 暗/亮各用独立主题名——避免 defineTheme 同名校验缓存不刷新 (Monaco known issue)
 */
import { CoreEvents } from "@src/core/react/CoreEvents";

/** 当前是否暗色主题 */
function isDarkTheme(): boolean {
  return document.documentElement.getAttribute("data-theme") === "dark";
}

function cssVar(name: string, fallback: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
}

/**
 * 同步 Monaco 主题到 LinkDesk 当前主题。
 * 调用时机：EditorView mount 时 + 每次 onDidChangeTheme。
 */
export function syncMonacoTheme(monaco: any): void {
  const isDark = isDarkTheme();
  const bg = isDark ? cssVar("--bg-window", "#1E1E1E") : cssVar("--bg-window", "#FFFFFF");
  const themeName = isDark ? "linkdesk-dark" : "linkdesk-light";

  monaco.editor.defineTheme(themeName, {
    base: isDark ? "vs-dark" : "vs",
    inherit: true,
    colors: { "editor.background": bg },
    rules: [],
  });
  monaco.editor.setTheme(themeName);
}

/**
 * 订阅 LinkDesk 主题变更——回调中调 syncMonacoTheme。
 * 返回 unsubscribe 函数——useEffect cleanup 中调用。
 */
export function subscribeThemeSync(monacoNsRef: { current: any }): () => void {
  return CoreEvents.onDidChangeTheme.event(() => {
    if (monacoNsRef.current) {
      syncMonacoTheme(monacoNsRef.current);
    }
  });
}
