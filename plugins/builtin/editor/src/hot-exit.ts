/**
 * E4V#40n Hot Exit——热退出恢复。
 *
 * 每次编辑后立即持久化脏文件内容到 PluginStateService（debounce 1s）。
 * beforeunload 做最终同步刷新。
 * 下次启动时 EditorTab 检测 → 恢复未保存内容 → 标记 ● 脏。
 */
import { getPluginStateValue, setPluginStateValue, setPluginStateValueSync } from "@src/core/PluginStateService";

const BACKUP_KEY = "hotExit.dirtyFiles";

interface DirtyFiles {
  [filePath: string]: string;
}

/** 当前 session 的脏文件内容 */
const dirtyFiles: DirtyFiles = {};

let _persistTimer: ReturnType<typeof setTimeout> | null = null;
let _restored = false;

function schedulePersist(): void {
  if (_persistTimer) clearTimeout(_persistTimer);
  _persistTimer = setTimeout(() => {
    setPluginStateValue("editor", BACKUP_KEY, { ...dirtyFiles });
  }, 1000);
}

/** 懒加载——EditorTab 首次调 hasBackup/getBackupContent 时才从 PluginStateService 恢复 */
function ensureRestored(): void {
  if (_restored) return;
  _restored = true;
  const prev = getPluginStateValue<DirtyFiles>("editor", BACKUP_KEY);
  if (prev && Object.keys(prev).length > 0) {
    Object.assign(dirtyFiles, prev);
    setPluginStateValue("editor", BACKUP_KEY, null);
  }
}

/** 注册 beforeunload */
export function initHotExit(): void {
  window.addEventListener("beforeunload", () => {
    if (_persistTimer) clearTimeout(_persistTimer);
    if (Object.keys(dirtyFiles).length > 0) {
      setPluginStateValueSync("editor", BACKUP_KEY, { ...dirtyFiles });
      setPluginStateValue("editor", BACKUP_KEY, { ...dirtyFiles });
    } else {
      setPluginStateValueSync("editor", BACKUP_KEY, null);
    }
  });
}

/** 文件变脏时调用——记录并调度持久化 */
export function trackDirtyFile(filePath: string, content: string): void {
  dirtyFiles[filePath] = content;
  schedulePersist();
}

/** 文件保存后调用——清除并调度持久化 */
export function clearDirtyFile(filePath: string): void {
  delete dirtyFiles[filePath];
  schedulePersist();
}

/** 是否有此文件的备份内容 */
export function hasBackup(filePath: string): boolean {
  ensureRestored();
  return filePath in dirtyFiles;
}

/** 取备份内容 */
export function getBackupContent(filePath: string): string | undefined {
  ensureRestored();
  return dirtyFiles[filePath];
}
