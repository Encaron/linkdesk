/**
 * E4V#40e 主题同步——LinkDesk 暗/亮 → Monaco vs-dark / vs。
 *
 * syncMonacoTheme()：setTheme("vs-dark" / "vs")——防抖 50ms，防快速连续调用打断 tokenization。
 * subscribeThemeSync()：订阅 CoreEvents.onDidChangeTheme → 自动同步。
 */
import { CoreEvents } from "@src/core/react/CoreEvents";

let _debounceTimer: ReturnType<typeof setTimeout> | null = null;
let _pendingTheme: string | null = null;

/** 当前是否暗色主题 */
function isDarkTheme(): boolean {
  return document.documentElement.getAttribute("data-theme") === "dark";
}

export function syncMonacoTheme(monaco: any): void {
  const theme = isDarkTheme() ? "vs-dark" : "vs";
  // 同一主题不重复设置——避免打断 Monaco tokenization
  if (_pendingTheme === theme) return;
  _pendingTheme = theme;

  if (_debounceTimer) clearTimeout(_debounceTimer);
  _debounceTimer = setTimeout(() => {
    _debounceTimer = null;
    if (monaco?.editor?.setTheme) {
      monaco.editor.setTheme(_pendingTheme!);
    }
  }, 50);
}

export function subscribeThemeSync(monacoNsRef: { current: any }): () => void {
  return CoreEvents.onDidChangeTheme.event(() => {
    if (monacoNsRef.current) {
      syncMonacoTheme(monacoNsRef.current);
    }
  });
}
