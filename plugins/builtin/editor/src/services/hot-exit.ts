/**
 * E5.7#38 Hot Exit——热退出恢复（设计 §3.2）。
 *
 * 脏内容经 window.linkdesk.hotExit → 主进程落盘 %APPDATA%/linkdesk/hot-exit/<sha256>.dirty
 * （池渲染进程零直写——审计约束）。生命周期：
 *   - 每次变更 → trackDirtyFile → 1s debounce 落盘（崩溃最多丢最后 1s 输入——设计"异步写入"同款语义）
 *   - 保存 → clearDirtyFile 删备份文件
 *   - 标签关闭（unmount）→ scheduleClearOnUnmount 延迟删——跨组移动/StrictMode 的 remount
 *     在毫秒级完成并 cancelPendingClear 取消，真正的关闭才生效（不删 = 下次打开幽灵恢复）
 *   - 池崩 → 进程死亡无 unmount → 文件存活 → 重建后 EditorTab loadBackup 恢复 + dirty 标记
 *   - loadBackup 只读不消费——StrictMode 双 mount / 跨组移动 remount 都要能重复读同一份备份
 */

const lk = window.linkdesk;

/** 变更后 1s 内无新变更才落盘（异步写入） */
const SAVE_DEBOUNCE_MS = 1_000;
/** unmount 后延迟删备份——跨组移动 remount 在毫秒级，延迟窗覆盖它 */
const UNMOUNT_CLEAR_DELAY_MS = 2_000;

/** 当前 session 的脏文件内容（filePath → 最新内容）——debounce 落盘的数据源 */
const dirtyFiles = new Map<string, string>();

let _persistTimer: ReturnType<typeof setTimeout> | null = null;

/** unmount 清理的未决定时器（filePath → timer）——remount 时取消 */
const _pendingClears = new Map<string, ReturnType<typeof setTimeout>>();

function schedulePersist(): void {
  if (_persistTimer) clearTimeout(_persistTimer);
  _persistTimer = setTimeout(() => {
    _persistTimer = null;
    for (const [filePath, content] of dirtyFiles) {
      lk?.hotExit?.save(filePath, content).catch(() => { /* 落盘失败不阻断编辑 */ });
    }
  }, SAVE_DEBOUNCE_MS);
}

/** beforeunload 最终冲刷——尽力而为（池崩时 beforeunload 不触发，靠 1s 轮转落盘兜底） */
export function initHotExit(): void {
  window.addEventListener("beforeunload", () => {
    if (_persistTimer) {
      clearTimeout(_persistTimer);
      _persistTimer = null;
    }
    for (const [filePath, content] of dirtyFiles) {
      lk?.hotExit?.save(filePath, content).catch(() => {});
    }
  });
}

/** 文件变脏时调用——记录并调度落盘 */
export function trackDirtyFile(filePath: string, content: string): void {
  dirtyFiles.set(filePath, content);
  schedulePersist();
}

/** 文件保存后调用——删备份文件 */
export function clearDirtyFile(filePath: string): void {
  dirtyFiles.delete(filePath);
  lk?.hotExit?.clear(filePath).catch(() => {});
}

/** 取备份内容——只读不消费。无备份或 API 缺失（浏览器 dev 预览）→ null */
export async function loadBackup(filePath: string): Promise<string | null> {
  if (!lk?.hotExit) return null;
  try {
    return await lk.hotExit.load(filePath);
  } catch {
    return null;
  }
}

/** EditorTab unmount 时调用——延迟删备份：remount（跨组移动/StrictMode）毫秒级取消，真关闭才删 */
export function scheduleClearOnUnmount(filePath: string): void {
  const timer = setTimeout(() => {
    _pendingClears.delete(filePath);
    clearDirtyFile(filePath);
  }, UNMOUNT_CLEAR_DELAY_MS);
  _pendingClears.set(filePath, timer);
}

/** EditorTab mount 时调用——取消未决的 unmount 清理 */
export function cancelPendingClear(filePath: string): void {
  const timer = _pendingClears.get(filePath);
  if (timer) {
    clearTimeout(timer);
    _pendingClears.delete(filePath);
  }
}
