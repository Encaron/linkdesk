/**
 * IpcRelay<T>——preload 缓冲+回放模式归一化（E5.7#78，E5.6#67a 迁入）
 *
 * 硬约束 20：preload 的 IPC 监听器必须在模块顶层注册（React mount 前事件可能已到达），
 * 但消费回调（React 侧 handler）要等 mount 后才注册——窗口期事件入缓冲，
 * 回调注册（onReady）时按序回放，之后 push 直调。
 *
 * 用法：
 *   const relay = new IpcRelay<Layout>();
 *   ipcRenderer.on(CHANNEL, (_e, item) => relay.push(item));  // 模块顶层常驻
 *   // React 侧：
 *   useEffect(() => relay.onReady(render), []);               // 返回 unsubscribe
 *
 * 语义：回放全部缓冲项（FIFO）。只留最后一份的"单例快照"变体（preload-pool
 * quickpick/toast/dialog 缓冲）不入本类——保留手写 keep-last 语义（见清单 #78 执行注）。
 */
export class IpcRelay<T> {
  private _buffer: T[] = [];
  private _callback: ((item: T) => void) | null = null;
  private _active = false;

  /** 事件入口——就绪前入缓冲；就绪后直调回调 */
  push(item: T): void {
    if (!this._active || !this._callback) {
      this._buffer.push(item);
    } else {
      try { this._callback(item); } catch { /* contextBridge 回调静默失败 */ }
    }
  }

  /**
   * 注册消费回调 + 回放缓冲 + 进入就绪态。
   * 返回 unsubscribe——注销回调并回到缓冲态（对标手写版 _onLayoutCallback=null 清理）。
   */
  onReady(cb: (item: T) => void): () => void {
    this._callback = cb;
    this._active = true;
    for (const item of this._buffer) {
      try { cb(item); } catch { /* contextBridge 回调静默失败 */ }
    }
    this._buffer.length = 0;
    return () => {
      this._callback = null;
      this._active = false;
    };
  }
}
