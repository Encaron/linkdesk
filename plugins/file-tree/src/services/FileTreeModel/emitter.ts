/**
 * MiniEmitter——E6#87a 从 FileTreeModel.ts 拆出。
 *
 * E5.6#11.5g1：内联替代 @src/core Emitter，纯工具类无全局状态。
 */
export class MiniEmitter<T> {
  private _listeners = new Set<(data: T) => void>();
  private _event?: (listener: (data: T) => void) => () => void;

  get event(): (listener: (data: T) => void) => () => void {
    if (!this._event) {
      this._event = (listener: (data: T) => void): (() => void) => {
        this._listeners.add(listener);
        return () => { this._listeners.delete(listener); };
      };
    }
    return this._event;
  }

  fire(data: T): void {
    for (const fn of this._listeners) {
      try { fn(data); } catch { /* 错误隔离——一个监听器崩溃不阻塞其他 */ }
    }
  }

  dispose(): void { this._listeners.clear(); }
}
