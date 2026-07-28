/**
 * 路径工具函数——跨文件复用，避免重复 split+pop。
 * E4 品质加固：FileTreeModel + WelcomeView 共用。
 */

/** 获取路径最后一段（文件名/文件夹名）。跨平台——支持 / 和 \ 分隔符 */
export function basename(fullPath: string): string {
  return fullPath.split(/[/\\]/).pop() ?? fullPath;
}

/** 拆分路径为段 */
export function splitPath(fullPath: string): string[] {
  return fullPath.split(/[/\\]/).filter(Boolean);
}
