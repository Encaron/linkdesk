/**
 * MiniEmitter——E5.6#11.5i 从 @src/core/react/CoreEvents 内联。
 *
 * 纯 pub/sub 工具类——无全局状态，无 IPC。
 * 对标 VS Code Emitter 的最小子集。
 */
export class MiniEmitter<T> {
  private _listeners = new Set<(data: T) => void>();

  /** 订阅事件——返回取消函数 */
  get event(): (listener: (data: T) => void) => (() => void) {
    return (listener: (data: T) => void) => {
      this._listeners.add(listener);
      return () => { this._listeners.delete(listener); };
    };
  }

  /** 触发事件 */
  fire(data: T): void {
    for (const fn of this._listeners) {
      try { fn(data); } catch { /* 错误隔离 */ }
    }
  }

  /** 清空监听器 */
  dispose(): void {
    this._listeners.clear();
  }
}
