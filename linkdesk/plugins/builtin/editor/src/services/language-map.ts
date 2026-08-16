/**
 * E4V#40d 语言映射——文件扩展名 → Monaco 语言 ID。
 *
 * 两个出口：
 *   - getLanguageFromPath(filePath) → EditorModel 构造时确定语言
 *   - registerLanguageMap(monaco) → EditorView beforeMount 中调用
 *
 * 未知扩展名 → "plaintext" 兜底——不抛错。
 */

/** 扩展名 → Monaco 语言 ID */
const EXTENSION_LANGUAGE_MAP: Record<string, string> = {
  ".ts": "typescript", ".tsx": "typescript", ".js": "javascript", ".jsx": "javascript",
  ".mjs": "javascript", ".cjs": "javascript", ".json": "json", ".jsonc": "json",
  ".html": "html", ".htm": "html", ".css": "css", ".scss": "css", ".less": "css",
  ".md": "markdown", ".mdx": "markdown", ".py": "python", ".pyi": "python",
  ".pyx": "python", ".rs": "rust", ".c": "c", ".h": "c", ".cpp": "cpp",
  ".hpp": "cpp", ".cxx": "cpp", ".cc": "cpp", ".hh": "cpp", ".go": "go",
  ".java": "java", ".xml": "xml", ".xsl": "xml", ".xsd": "xml", ".svg": "xml",
  ".yaml": "yaml", ".yml": "yaml", ".toml": "ini", ".sh": "shell", ".bash": "shell",
  ".zsh": "shell", ".sql": "sql", ".lua": "lua", ".r": "r", ".php": "php",
  ".rb": "ruby", ".pl": "perl", ".pm": "perl", ".swift": "swift", ".kt": "kotlin",
  ".kts": "kotlin", ".dart": "dart", ".diff": "diff", ".patch": "diff",
  ".bat": "bat", ".cmd": "bat", ".ini": "ini", ".cfg": "ini", ".conf": "ini",
  ".log": "plaintext", ".txt": "plaintext",
};

/** 所有唯一语言 ID——registerLanguageMap 遍历此列表 */
const REGISTERED_LANGUAGES = [...new Set(Object.values(EXTENSION_LANGUAGE_MAP))];

/**
 * 从文件路径推断 Monaco 语言 ID。
 * 未知扩展名 → "plaintext" 兜底，不抛错。
 */
export function getLanguageFromPath(filePath: string): string {
  const ext = filePath.slice(filePath.lastIndexOf(".")).toLowerCase();
  return EXTENSION_LANGUAGE_MAP[ext] || "plaintext";
}

/**
 * 在 Monaco beforeMount 中调用——注册所有语言 ID。
 * Monaco 对已知语言（TS/JS/CSS/HTML/JSON）自带语法高亮，
 * 对未知语言（如 Rust/Go/Python）plaintext 兜底——不崩溃。
 */
// E5.7#98：Monaco 命名空间具体类型——替代 monaco: any
type MonacoNs = typeof import("monaco-editor");

export function registerLanguageMap(monaco: MonacoNs): void {
  for (const id of REGISTERED_LANGUAGES) {
    monaco.languages.register({ id });
  }
}
