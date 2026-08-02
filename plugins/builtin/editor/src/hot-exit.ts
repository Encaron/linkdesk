/**
 * E4V#40n Hot Exit——热退出恢复。
 *
 * beforeunload 时保存未保存文件内容到 PluginStateService。
 * 下次启动时恢复——对标 VS Code Hot Exit。
 */
import { getPluginStateValue, setPluginStateValue } from "@src/core/PluginStateService";

const BACKUP_KEY = "hotExit.dirtyFiles";

interface DirtyFiles {
  [filePath: string]: string;
}

/** 当前 session 的脏文件内容——内存中 */
const dirtyFiles: DirtyFiles = {};

/** 注册 beforeunload——保存脏文件到持久化 */
export function initHotExit(): void {
  // 恢复上次 session 的未保存文件
  restoreFromPrevious();

  // 退出前保存
  window.addEventListener("beforeunload", () => {
    if (Object.keys(dirtyFiles).length > 0) {
      setPluginStateValue("editor", BACKUP_KEY, { ...dirtyFiles });
    }
  });
}

/** 文件变脏时调用——记录最新内容 */
export function trackDirtyFile(filePath: string, content: string): void {
  dirtyFiles[filePath] = content;
}

/** 文件保存后调用——清除备份 */
export function clearDirtyFile(filePath: string): void {
  delete dirtyFiles[filePath];
}

/** 是否有此文件的备份内容 */
export function hasBackup(filePath: string): boolean {
  return filePath in dirtyFiles;
}

/** 取备份内容 */
export function getBackupContent(filePath: string): string | undefined {
  return dirtyFiles[filePath];
}

/** 从 PluginStateService 恢复上次 session 的备份 */
function restoreFromPrevious(): void {
  const prev = getPluginStateValue<DirtyFiles>("editor", BACKUP_KEY);
  if (prev && Object.keys(prev).length > 0) {
    Object.assign(dirtyFiles, prev);
    // 清空持久化中的备份——已加载到内存
    setPluginStateValue("editor", BACKUP_KEY, null);
  }
}
