/**
 * fsWatcher——文件系统变更的内部发射器（E6#87a 从 FoldersView.tsx 拆出）。
 *
 * E5.6#11.5g3: MiniEmitter——替代 CoreEvents.onDidChangeFileSystem，纯 intra-component 事件
 * file watcher 回调 fire → 同组件内订阅者消费，无需跨 IPC
 * E5.7#98：events 定型为 FsChangeEvent——与 lk.filesystem.watch 回调参数同形状（零 any）
 *
 * 🔴 **模块级 mutable 单一属主**：`fsEmitter` 全仓仅在本文件声明。
 */
export interface FsChangeEvent {
  path: string;
  type: string;
}

class MiniFileSystemEmitter {
  private _listeners = new Set<(events: FsChangeEvent[]) => void>();
  fire(events: FsChangeEvent[]): void {
    for (const fn of this._listeners) {
      try { fn(events); } catch { /* 错误隔离 */ }
    }
  }
  event(listener: (events: FsChangeEvent[]) => void): () => void {
    this._listeners.add(listener);
    return () => { this._listeners.delete(listener); };
  }
}

export const fsEmitter = new MiniFileSystemEmitter();
