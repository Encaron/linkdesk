/**
 * 三个 check 脚本（css-hardcode / font-scale / spacing-grid）共享的工程扫描工具（E6#54d 移植）。
 *
 * 与壳 check-*.mjs 的关系：壳版本写死壳目录（src/plugins/…）+ 壳文档化豁免白名单；本版本
 * 面向**任意第三方插件工程**——以传入 root 为相对基准扫描，豁免只留通用类别（token 定义 / 测试 /
 * i18n·主题·取色器数据 / canvas / 内容画布文件级 disable），不携带壳专属路径（07 §六·三档）。
 * 机制（去注释 / 行号不漂移 / 纯函数收违规不 process.exit）与壳同源。
 */
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join, relative, sep } from "node:path";

export const SKIP_DIRS = new Set(["node_modules", "dist", "dist-electron", ".git", ".vite", "coverage", "out"]);

/** 收集 dir 下指定扩展名文件（跳过 SKIP_DIRS）。返回绝对路径数组。 */
export function collectFiles(dir: string, exts: string[]): string[] {
  const out: string[] = [];
  const walk = (cur: string): void => {
    let entries;
    try {
      entries = readdirSync(cur, { withFileTypes: true });
    } catch {
      return; // 不可读目录（权限等）跳过
    }
    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name)) continue;
        walk(join(cur, entry.name));
      } else if (entry.isFile() && exts.some((e) => entry.name.endsWith(e))) {
        out.push(join(cur, entry.name));
      }
    }
  };
  if (existsSync(dir)) walk(dir);
  return out;
}

/** 工程相对路径（正斜杠） */
export function relPath(root: string, abs: string): string {
  return relative(root, abs).split(sep).join("/");
}

/** 把 /* *\/ 注释替换为等长空格（保留换行 → 行号不漂移；注释内 { ; 不干扰解析） */
export function stripComments(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "));
}

/** 去掉 // 行注释（保留 : 前缀防 https:// 误伤） */
export function stripLineComments(text: string): string {
  return text.replace(/(^|[^:])\/\/.*$/gm, "$1");
}

export function countNewlines(s: string): number {
  let c = 0;
  for (const ch of s) if (ch === "\n") c++;
  return c;
}

export function isTestOrMockRel(rel: string): boolean {
  return /\.(test|spec)\.(tsx?|jsx?)$/.test(rel) || /\.(fixture|mock)\.(tsx?|jsx?)$/.test(rel);
}

export function readSource(abs: string): string {
  return readFileSync(abs, "utf8");
}

export interface CheckViolation {
  file: string; // 工程相对路径（正斜杠）
  line: number; // 1-based
  message: string;
  /** eslint-disable 知情绕行的理由（若该行被豁免注释标记）；未豁免 = undefined */
  bypassReason?: string;
}
