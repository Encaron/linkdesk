/**
 * FileExcludeFilter——glob 模式排除过滤器。
 * E4a #95：对标 VS Code files.exclude + files.watcherExclude。
 *
 * 消费 ConfigurationService.get("files.exclude") 的 glob 模式字典。
 * 🔥 当前版本覆盖常见模式（**、*、! 取反）。后续可升级为 picomatch 做完整 glob。
 */

// E5.8#20-c：FileEntry 契约化——types/fileEntry 已打入 linkdesk.d.ts，插件走 @linkdesk/contracts（零 @src/core）
import type { FileEntry } from "@linkdesk/contracts";

type MatchFn = (input: string) => boolean;

/** E4V#9: 文件嵌套模式——对标 VS Code explorer.fileNesting.patterns */
interface NestingRule {
  parentPattern: string;   // e.g. "*.ts"
  childPatterns: string[]; // e.g. ["${capture}.js", "${capture}.js.map"]
}

/** 默认嵌套规则——对标 VS Code 内置 patterns */
const DEFAULT_NESTING_RULES: NestingRule[] = [
  { parentPattern: "*.ts", childPatterns: ["${capture}.js", "${capture}.js.map", "${capture}.d.ts"] },
  { parentPattern: "*.tsx", childPatterns: ["${capture}.js", "${capture}.js.map"] },
  { parentPattern: "*.jsx", childPatterns: ["${capture}.js", "${capture}.js.map"] },
  { parentPattern: "*.js", childPatterns: ["${capture}.js.map", "${capture}.d.ts"] },
  { parentPattern: "*.css", childPatterns: ["${capture}.css.map"] },
  { parentPattern: "*.scss", childPatterns: ["${capture}.css", "${capture}.css.map"] },
];

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
      // 去尾 / —— gitignore 的 "dist/" 等同于 "dist"，compileGlob 不认尾 /
      const pattern = (isNegated ? line.slice(1) : line).replace(/\/+$/, "");
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

  /**
   * E4V#9: 构建文件嵌套映射——匹配 parent→children 关系。
   * 返回 Map<parentPath, childEntries>。不在任何嵌套关系中的条目独立显示。
   */
  buildNestingMap(entries: FileEntry[]): Map<string, FileEntry[]> {
    const map = new Map<string, FileEntry[]>();
    for (const rule of DEFAULT_NESTING_RULES) {
      for (const entry of entries) {
        const match = matchNestingParent(entry.name, rule.parentPattern);
        if (!match) continue;
        const children: FileEntry[] = [];
        for (const childPattern of rule.childPatterns) {
          const resolved = childPattern.replace(/\$\{capture\}/g, match);
          const child = entries.find((e) => e.name === resolved);
          if (child && child !== entry) children.push(child);
        }
        if (children.length > 0) map.set(entry.path, children);
      }
    }
    return map;
  }
}

/** 匹配嵌套父模式——返回 capture 组（不含扩展名的文件名），不匹配返回 null */
function matchNestingParent(name: string, pattern: string): string | null {
  if (!pattern.startsWith("*.")) return null;
  const ext = pattern.slice(1); // ".ts"
  if (!name.endsWith(ext)) return null;
  return name.slice(0, -ext.length); // "app.ts" → "app"
}
