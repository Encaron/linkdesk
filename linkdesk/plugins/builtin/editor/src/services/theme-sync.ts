/**
 * E4V#40e 主题同步——LinkDesk 暗/亮 → Monaco vs-dark / vs。
 *
 * syncMonacoTheme()：setTheme("vs-dark" / "vs")。
 * subscribeThemeSync()：订阅 CoreEvents.onDidChangeTheme → 自动同步。
 */
import { CoreEvents } from "@src/core/react/CoreEvents";

/** 当前是否暗色主题 */
function isDarkTheme(): boolean {
  return document.documentElement.getAttribute("data-theme") === "dark";
}

export function syncMonacoTheme(monaco: any): void {
  monaco.editor.setTheme(isDarkTheme() ? "vs-dark" : "vs");
}

export function subscribeThemeSync(monacoNsRef: { current: any }): () => void {
  return CoreEvents.onDidChangeTheme.event(() => {
    if (monacoNsRef.current) {
      syncMonacoTheme(monacoNsRef.current);
    }
  });
}
