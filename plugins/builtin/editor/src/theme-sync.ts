/**
 * E4V#40e 主题同步——LinkDesk 主题 ↔ Monaco defineTheme。
 *
 * syncMonacoTheme(monaco)：定义 + 应用 "linkdesk" 主题。
 * subscribeThemeSync(monacoRef)：订阅 CoreEvents.onDidChangeTheme → 自动同步。
 *
 * 设计原则：
 *   - inherit: true → Monaco 内置语法 token 色全保留，不手动配 token
 *   - 外框颜色从 CSS 变量取——禁止硬编码 hex
 *   - 亮色 base="vs" / 暗色 base="vs-dark"
 */
import { CoreEvents } from "@src/core/CoreEvents";

/** 当前是否暗色主题 */
function isDarkTheme(): boolean {
  return document.documentElement.getAttribute("data-theme") === "dark";
}

/** 从 :root CSS 变量取色——取不到返回 undefined，Monaco 用内置老底 */
function cssVar(name: string): string | undefined {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || undefined;
}

/**
 * 同步 Monaco 主题到 LinkDesk 当前主题。
 * 调用时机：beforeMount + 每次 onDidChangeTheme。
 */
export function syncMonacoTheme(monaco: any): void {
  const isDark = isDarkTheme();
  const base = isDark ? "vs-dark" : "vs";

  // 从 CSS 变量取色——过滤掉 undefined 值（Monaco 不能处理 undefined color）
  const raw: Record<string, string | undefined> = {
    "editor.background": cssVar("--editor-bg"),
    "editor.foreground": cssVar("--editor-fg"),
    "editorLineNumber.foreground": cssVar("--text-secondary"),
    "editorCursor.foreground": cssVar("--accent"),
    "editor.selectionBackground": cssVar("--selection-bg"),
    "editorWidget.background": cssVar("--panel-bg"),
    "editorWidget.border": cssVar("--border-color"),
  };
  const colors: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw)) {
    if (v) colors[k] = v;
  }

  monaco.editor.defineTheme("linkdesk", { base, inherit: true, colors, rules: [] });
  monaco.editor.setTheme("linkdesk");
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
