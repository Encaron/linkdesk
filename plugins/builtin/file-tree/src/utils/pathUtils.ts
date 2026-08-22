/**
 * 路径工具函数——跨文件复用，避免重复 split+pop。
 * E4 品质加固：FileTreeModel + WelcomeView 共用。
 * E4b #99d：dirname / joinPath / FlatItem 归一化收口——全插件从这一个文件导入。
 */

import type { ExplorerItem } from "../services/FileTreeModel";

/* ── 类型 ── */

/** 扁平化后的树节点——虚拟滚动消费 */
export interface FlatItem {
  item: ExplorerItem;
  depth: number;
  /** 紧凑文件夹——压缩后的路径段，如 ["src", "components", "Button.tsx"] */
  compactedSegments?: string[];
  /** E4V#16: 本层还有后续兄弟——CSS 引导线 */
  guide?: boolean;
  /** E4V#16: 被排除但保留显示的条目灰显 */
  isDimmed?: boolean;
}

/* ── 路径函数 ── */

/** 获取路径最后一段（文件名/文件夹名）。跨平台——支持 / 和 \ 分隔符 */
export function basename(fullPath: string): string {
  return fullPath.split(/[/\\]/).pop() ?? fullPath;
}

/** 拆分路径为段 */
export function splitPath(fullPath: string): string[] {
  return fullPath.split(/[/\\]/).filter(Boolean);
}

/**
 * 归一化路径——统一为 / 分隔符。
 * E4V#60：归一化到 core——项目唯一正源。
 * listDir 经 path.join() 在 Windows 上返 \，前端工具函数产 /——
 * 所有进入 ExplorerItem.uri 的路径必须经此归一化。
 */
const lk = window.linkdesk;

/** 归一化路径——统一为 / 分隔符，通过 lk.path API */
export function normalizePath(p: string): string {
  return lk.path.normalize(p);
}

/** 获取父目录路径 */
export function dirname(uri: string): string {
  const normalized = normalizePath(uri);
  const lastSlash = normalized.lastIndexOf("/");
  return lastSlash > 0 ? normalized.slice(0, lastSlash) : normalized;
}

/** 拼接路径——确保用 / 分隔 */
export function joinPath(parent: string, name: string): string {
  return normalizePath(parent) + "/" + name;
}

/**
 * 获取文件扩展名——不含前导点。
 * 无扩展名返回空字符串。多点扩展名取最后一个。
 *   extension("file.ts") → "ts"
 *   extension("file.tar.gz") → "gz"
 *   extension(".gitignore") → ""
 */
export function extension(name: string): string {
  const idx = name.lastIndexOf(".");
  return idx > 0 ? name.slice(idx + 1) : "";
}

/**
 * 获取文件扩展名——含前导点。
 * 无扩展名返回空字符串。
 *   extensionWithDot("file.ts") → ".ts"
 */
export function extensionWithDot(name: string): string {
  const idx = name.lastIndexOf(".");
  return idx > 0 ? name.slice(idx) : "";
}
