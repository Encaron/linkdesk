/**
 * FileExcludeFilter——glob 模式排除过滤器。
 * E4a #95：对标 VS Code files.exclude + files.watcherExclude。
 *
 * 消费 ConfigurationService.get("files.exclude") 的 glob 模式字典。
 * 🔥 当前版本覆盖常见模式（**、*、! 取反）。后续可升级为 picomatch 做完整 glob。
 */

type MatchFn = (input: string) => boolean;

interface PatternEntry {
  isNegated: boolean;
  match: MatchFn;
}

/** 将简单 glob 模式编译为测试函数 */
function compileGlob(pattern: string): MatchFn {
  // 处理 **/suffix——匹配任意路径中包含该段
  if (pattern.startsWith("**/") && !pattern.includes("*", 3)) {
    const suffix = pattern.slice(3);
    return (input: string) => input.includes("/" + suffix) || input.startsWith(suffix + "/") || input === suffix;
  }
  // 处理 **/suffix/**——匹配任意路径中包含该目录
  if (pattern.startsWith("**/") && pattern.endsWith("/**")) {
    const dir = pattern.slice(3, pattern.length - 3);
    return (input: string) => input.includes("/" + dir + "/") || input.startsWith(dir + "/");
  }
  // 处理 *.ext——匹配扩展名
  if (pattern.startsWith("*.")) {
    const ext = pattern.slice(1);
    return (input: string) => input.endsWith(ext);
  }
  // 默认：精确匹配文件名
  return (input: string) => input === pattern || input.endsWith("/" + pattern);
}

export class FileExcludeFilter {
  private _patterns: PatternEntry[] = [];
  private _gitignore: PatternEntry[] = [];

  /**
   * 配置排除模式。
   * @param excludePatterns glob 模式字典——如 { "node_modules": true, ".git": true }
   */
  configure(excludePatterns: Record<string, boolean>): void {
    this._patterns = [];
    for (const [pattern, isExclude] of Object.entries(excludePatterns)) {
      if (!isExclude) continue;
      const isNegated = pattern.startsWith("!");
      const glob = isNegated ? pattern.slice(1) : pattern;
      this._patterns.push({ isNegated, match: compileGlob(glob) });
    }
  }

  /**
   * E4V#8: 解析 .gitignore 内容并设为 gitignore 排除规则。
   * 与 files.exclude 独立——configure() 不清空 gitignore 规则。
   */
  setGitignore(content: string): void {
    this._gitignore = [];
    const lines = content.split(/\r?\n/);
    for (const raw of lines) {
      const line = raw.trim();
      if (!line || line.startsWith("#")) continue;
      const isNegated = line.startsWith("!");
      const pattern = isNegated ? line.slice(1) : line;
      this._gitignore.push({ isNegated, match: compileGlob(pattern) });
    }
  }

  /** E4V#8: 清空 gitignore 规则 */
  clearGitignore(): void {
    this._gitignore = [];
  }

  /**
   * 检查相对路径是否应被排除。
   * 返回 true = 排除（files.exclude 或 .gitignore 任一声明排除即排除）。
   */
  matches(relativePath: string): boolean {
    // files.exclude 优先
    let excluded = false;
    for (const { isNegated, match } of this._patterns) {
      if (match(relativePath)) {
        excluded = !isNegated;
      }
    }
    // .gitignore 追加
    for (const { isNegated, match } of this._gitignore) {
      if (match(relativePath)) {
        excluded = !isNegated;
      }
    }
    return excluded;
  }

  /** 清空所有模式 */
  clear(): void {
    this._patterns = [];
    this._gitignore = [];
  }
}
