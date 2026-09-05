/**
 * E4V#40e 主题同步——LinkDesk 暗/亮 → Monaco vs-dark / vs。
 *
 * 🔴 双路径机制（E5#107 + adj）：
 *   路径 1：monaco.editor.setTheme() — 被 @codingame/monaco-vscode-api 拦截，
 *          走 StandaloneWorkbenchThemeService 异步管道。loadThemes:false 时可能找不到主题。
 *   路径 2：editor.updateOptions({theme}) — Monaco 实例级 API，绕过 VS Code service override，
 *          直接设编辑器主题。即使路径 1 竞态失败，路径 2 永远有效。
 *
 * 🔥 E5#114d 生产修复：defineTheme 安全网——
 *   生产环境 @codingame 主题扩展 file:// URL 可能解析失败，CSS 规则不生成，
 *   导致主编辑器 token 颜色错误（缩略图 Canvas 渲染不受影响）。
 *   defineTheme 用 Monaco 原生 API 注册 vs-dark/vs，零外部依赖，
 *   在 setTheme 之前调用——只要定义过，后续 setTheme 就能找到主题。
 *
 * 🔥 E5.5#7 Bug B fix：主题变更事件改用 window.linkdesk.events。
 *   多 WebView 下 CoreEvents.onDidChangeTheme 是隔离实例——壳侧主题变更不会触发编辑器。
 *   IpcBridge.broadcast("theme:changed") → plugin:push → events.on("theme:changed") 是正确路径。
 */
// E5.7#98：Monaco 具体类型——替代 any（monaco: any / rules: any[] / { current: any }）
import type { editor as MonacoEditorApi } from "monaco-editor";
type MonacoNs = typeof import("monaco-editor");

/** Monaco 暗色 token 颜色——对标 VS Code Dark+ */
const DARK_TOKEN_RULES: MonacoEditorApi.ITokenThemeRule[] = [
  { token: "comment", foreground: "6A9955" },
  { token: "keyword", foreground: "569CD6" },
  { token: "string", foreground: "CE9178" },
  { token: "number", foreground: "B5CEA8" },
  { token: "type", foreground: "4EC9B0" },
  { token: "function", foreground: "DCDCAA" },
  { token: "variable", foreground: "9CDCFE" },
  { token: "constant", foreground: "4FC1FF" },
  { token: "operator", foreground: "D4D4D4" },
  { token: "delimiter", foreground: "D4D4D4" },
  { token: "predefined", foreground: "C586C0" }, // C 预处理器
];

/** Monaco 亮色 token 颜色——对标 VS Code Light+ */
const LIGHT_TOKEN_RULES: MonacoEditorApi.ITokenThemeRule[] = [
  { token: "comment", foreground: "008000" },
  { token: "keyword", foreground: "0000FF" },
  { token: "string", foreground: "A31515" },
  { token: "number", foreground: "098658" },
  { token: "type", foreground: "267F99" },
  { token: "function", foreground: "795E26" },
  { token: "variable", foreground: "001080" },
  { token: "constant", foreground: "0070C1" },
  { token: "operator", foreground: "000000" },
  { token: "delimiter", foreground: "000000" },
  { token: "predefined", foreground: "AF00DB" }, // C 预处理器
];

/** E5#114d：注册 Monaco 原生主题——纯兜底，不依赖 VS Code 主题扩展文件加载 */
function defineThemeSafe(monaco: MonacoNs, themeName: "vs-dark" | "vs", rules: MonacoEditorApi.ITokenThemeRule[]): void {
  try {
    // 只定义一次——重复定义抛异常
    monaco.editor.defineTheme(themeName, {
      base: themeName === "vs-dark" ? "vs-dark" : "vs",
      inherit: true,
      rules,
      colors: {},
    });
  } catch {
    // 已定义过——忽略
  }
}

function getTheme(): string {
  return document.documentElement.getAttribute("data-theme") === "dark" ? "vs-dark" : "vs";
}

export function syncMonacoTheme(monaco: MonacoNs): void {
  const theme = getTheme();
  // E5#114d：setTheme 之前确保主题已定义——生产环境兜底
  defineThemeSafe(monaco, "vs-dark", DARK_TOKEN_RULES);
  defineThemeSafe(monaco, "vs", LIGHT_TOKEN_RULES);
  // 路径 1：全局 setTheme（通知 VS Code service 层）
  monaco.editor.setTheme(theme);
  // 路径 2：实例级 updateOptions——绕过 StandaloneWorkbenchThemeService 异步管道
  const editors = monaco.editor.getEditors?.() ?? [];
  for (const ed of editors) {
    // theme 在 IGlobalEditorOptions 不在 IEditorOptions——getEditors 只返回 ICodeEditor——窄接口 cast（E5.7#98）
    try { (ed as MonacoEditorApi.IStandaloneCodeEditor).updateOptions({ theme }); } catch { /* 编辑器已销毁 */ }
  }
}

export function subscribeThemeSync(monacoNsRef: { readonly current: MonacoNs | null }): () => void {
  // E5.5#7 Bug B fix：用 window.linkdesk.events 替代 CoreEvents.onDidChangeTheme。
  // 多 WebView 下 CoreEvents 是隔离实例——壳侧主题变更不会触发编辑器回调。
  // theme:changed 通过 IpcBridge.broadcast → plugin:push → events.on 正确跨越 WebView 边界。
  const lk = window.linkdesk;
  return lk?.events?.on?.("theme:changed", () => {
    if (monacoNsRef.current) {
      syncMonacoTheme(monacoNsRef.current);
    }
  }) ?? (() => {});
}
