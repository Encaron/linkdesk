/**
 * FileSearcher——递归文件搜索引擎。
 * E4V#37a：对标 VS Code search service。
 *
 * 🔥 在核心——多消费方准入（文件树搜索 + AI 插件 + Git 插件 ≥ 2）。
 * 纯逻辑，不涉 UI。SearchView 是消费方。
 */

import { listDir, readBinaryFile, exists } from "./FileService";
import { EncodingService } from "./EncodingService";
import { normalizePath } from "../../utils/path/pathUtils";

/** E5#102c: 搜索结果数上限——防内存炸 */
const DEFAULT_MAX_RESULTS = 2000;

/** 二进制/编译产物——搜索时自动跳过。对标 VS Code search.files.exclude 默认值 */
const BINARY_EXTS = new Set([
  ".exe", ".dll", ".pdb", ".suo", ".obj", ".o", ".a", ".lib",
  ".zip", ".rar", ".7z", ".tar", ".gz",
  ".jpg", ".jpeg", ".png", ".gif", ".bmp", ".ico", ".svg",
  ".mp3", ".mp4", ".wav", ".avi",
  ".ttf", ".otf", ".woff", ".woff2",
  ".pdf", ".doc", ".docx", ".xls", ".xlsx",
]);

/* ── 类型 ── */

export interface SearchOptions {
  /** 工作区根目录列表——跨所有根搜索 */
  roots: string[];
  /** 搜索字符串 */
  query: string;
  /** glob 模式——只搜匹配的文件（如 "*.{c,h}"） */
  include?: string;
  /** glob 模式——排除匹配的文件（如 "node_modules"） */
  exclude?: string;
  /** 大小写敏感——默认 false */
  caseSensitive?: boolean;
  /** 全词匹配——默认 false */
  wholeWord?: boolean;
  /** 正则表达式——默认 false。true 时 query 被当作正则 */
  useRegex?: boolean;
  /** 最大结果数——默认 2000，防内存炸 */
  maxResults?: number;
  /** 取消信号——用户输入新查询时中断旧的 */
  signal?: AbortSignal;
}

/** E5.8#20-c：SearchMatch 摘 export——唯一外部消费者 SearchView 已改走契约 wire 型
 *  （SearchWireMatch），语义型退化为 FileSearcher 内部细节（IPC 边界形状 = src/core/types/ipc/search.ts） */
interface SearchMatch {
  filePath: string;
  /** 1-based 行号 */
  lineNumber: number;
  /** 匹配的整行文本 */
  lineText: string;
  /** 匹配在该行中的起始列（0-based） */
  matchStart: number;
  /** 匹配在该行中的结束列（0-based，不含） */
  matchEnd: number;
}

export interface FileSearchResult {
  filePath: string;
  matches: SearchMatch[];
}

/* ── glob 工具 ── */

/**
 * 简单 glob → RegExp。
 * 支持：*（任意非 / 字符）、**​（任意字符含 /）、?（单个非 / 字符）、{a,b}（选择）。
 */
function globToRegex(pattern: string): RegExp {
  let src = "";
  let i = 0;
  while (i < pattern.length) {
    const ch = pattern[i];
    if (ch === "*") {
      if (pattern[i + 1] === "*") {
        // **​ → .*
        src += ".*";
        i += 2;
        // 跳过可选的 /
        if (pattern[i] === "/") i++;
        continue;
      }
      // * → [^/]*
      src += "[^/]*";
      i++;
      continue;
    }
    if (ch === "?") {
      src += "[^/]";
      i++;
      continue;
    }
    if (ch === "{") {
      const end = pattern.indexOf("}", i);
      if (end !== -1) {
        const inner = pattern.slice(i + 1, end);
        src += "(" + inner.split(",").map(escapeRegex).join("|") + ")";
        i = end + 1;
        continue;
      }
    }
    src += escapeRegexChar(ch);
    i++;
  }
  return new RegExp("^" + src + "$");
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function escapeRegexChar(ch: string): string {
  return /[.*+?^${}()|[\]\\]/.test(ch) ? "\\" + ch : ch;
}

/** glob 逗号分隔的多个模式——任一匹配即通过。同时匹配完整路径和文件名 */
function globMatch(path: string, globs?: string): boolean {
  if (!globs) return true;
  const patterns = globs.split(",").map((s) => s.trim()).filter(Boolean);
  if (patterns.length === 0) return true;
  const fileName = path.split("/").pop() ?? path;
  return patterns.some((p) => {
    const re = globToRegex(p);
    return re.test(path) || re.test(fileName);
  });
}

/* ── 递归文件收集 ── */

async function collectFiles(
  dirPath: string,
  rootPath: string,
  signal?: AbortSignal,
): Promise<string[]> {
  if (signal?.aborted) return [];
  const result: string[] = [];
  try {
    const entries = await listDir(dirPath);
    for (const entry of entries) {
      if (signal?.aborted) return result;
      const fullPath = normalizePath(entry.path);
      if (entry.isDirectory) {
        const children = await collectFiles(fullPath, rootPath, signal);
        result.push(...children);
      } else if (entry.isFile) {
        // 跳过二进制/编译产物
        const ext = fullPath.slice(fullPath.lastIndexOf(".")).toLowerCase();
        if (!BINARY_EXTS.has(ext)) {
          result.push(fullPath);
        }
      }
    }
  } catch {
    // 目录不可读→静默跳过
  }
  return result;
}

/* ── 搜索 ── */

/**
 * 递归搜索工作区文件。
 * @returns 按文件分组的匹配结果。无匹配→空数组 `[]`。
 */
export async function searchFiles(opts: SearchOptions): Promise<FileSearchResult[]> {
  const maxResults = opts.maxResults ?? DEFAULT_MAX_RESULTS;
  const query = opts.query;
  if (!query) return [];

  // 编译匹配器
  let matcher: (line: string) => { start: number; end: number } | null;
  if (opts.useRegex) {
    const flags = opts.caseSensitive ? "g" : "gi";
    const re = new RegExp(query, flags);
    matcher = (line) => {
      re.lastIndex = 0;
      const m = re.exec(line);
      return m ? { start: m.index, end: m.index + m[0].length } : null;
    };
  } else if (opts.wholeWord) {
    const escaped = escapeRegex(query);
    const flags = opts.caseSensitive ? "g" : "gi";
    const re = new RegExp("\\b" + escaped + "\\b", flags);
    matcher = (line) => {
      re.lastIndex = 0;
      const m = re.exec(line);
      return m ? { start: m.index, end: m.index + m[0].length } : null;
    };
  } else {
    const searchStr = opts.caseSensitive ? query : query.toLowerCase();
    matcher = (line) => {
      const cmp = opts.caseSensitive ? line : line.toLowerCase();
      const idx = cmp.indexOf(searchStr);
      return idx !== -1 ? { start: idx, end: idx + searchStr.length } : null;
    };
  }

  // 收集所有文件
  let allFiles: string[] = [];
  for (const root of opts.roots) {
    if (opts.signal?.aborted) return [];
    const normalizedRoot = normalizePath(root);
    if (!(await exists(normalizedRoot))) continue;
    const files = await collectFiles(normalizedRoot, normalizedRoot, opts.signal);
    allFiles.push(...files);
  }

  // glob 过滤
  allFiles = allFiles.filter((f) => {
    // exclude 优先
    if (opts.exclude && globMatch(f, opts.exclude)) return false;
    // include 过滤
    if (opts.include && !globMatch(f, opts.include)) return false;
    return true;
  });

  const results: FileSearchResult[] = [];
  let totalMatches = 0;

  for (const filePath of allFiles) {
    if (opts.signal?.aborted) return results;
    if (totalMatches >= maxResults) break;

    try {
      const buffer = await readBinaryFile(filePath);
      if (buffer.length === 0) continue;
      const encoding = EncodingService.detect(buffer);
      const text = EncodingService.decode(buffer, encoding);
      const lines = text.split("\n");
      const fileMatches: SearchMatch[] = [];

      for (let i = 0; i < lines.length; i++) {
        const match = matcher(lines[i]);
        if (match) {
          fileMatches.push({
            filePath,
            lineNumber: i + 1,
            lineText: lines[i].length > 200
              ? lines[i].slice(0, 200) + "…"
              : lines[i],
            matchStart: match.start,
            matchEnd: match.end,
          });
          totalMatches++;
          if (totalMatches >= maxResults) break;
        }
      }

      if (fileMatches.length > 0) {
        results.push({ filePath, matches: fileMatches });
      }
    } catch {
      // 文件不可读→静默跳过
    }
  }

  return results;
}
