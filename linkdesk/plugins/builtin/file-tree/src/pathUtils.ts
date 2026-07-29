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

/**
 * 归一化路径——统一为 / 分隔符。
 * E4b #99a：对标 VS Code URI 对象"内部永远是 /"。
 * listDir 经 path.join() 在 Windows 上返 \，前端工具函数产 /——
 * 所有进入 ExplorerItem.uri 的路径必须经此归一化。
 */
export function normalizePath(fullPath: string): string {
  return fullPath.replace(/\\/g, "/");
}
