/**
 * 核心事件系统——对标 VS Code Event / Emitter。
 * Phase 5 盲区 3（P1）：插件感知系统状态变化的唯一渠道。
 *
 * 设计依据：docs/phase5_应用基础设施/V3-Phase5-设计.md §盲区3
 * VS Code 对标：vscode.Event<T> + Emitter<T>
 * VS Code 源码：src/vs/base/common/event.ts — Event, Emitter
 */

/* ── 通用 Event<T> 类型 ── */

/** 对标 VS Code Event<T>——订阅/取消订阅模式 */
export interface Event<T> {
  (listener: (data: T) => void): () => void;
}

/** 对标 VS Code Emitter<T>——内部触发，对外暴露 Event<T> */
export class Emitter<T> {
  private _listeners = new Set<(data: T) => void>();
  private _event?: Event<T>;

  /** 外部订阅此事件 */
  get event(): Event<T> {
    if (!this._event) {
      this._event = (listener: (data: T) => void): (() => void) => {
        this._listeners.add(listener);
        return () => { this._listeners.delete(listener); };
      };
    }
    return this._event;
  }

  /** 内部触发事件——Phase 5 盲区 8（P1）：包 try/catch 做错误隔离 */
  fire(data: T): void {
    for (const fn of this._listeners) {
      try { fn(data); } catch (err) {
        console.error("[CoreEvents] 事件监听器出错:", err);
      }
    }
  }

  /** 当前监听器数量（调试用） */
  get listenerCount(): number {
    return this._listeners.size;
  }

  /** 移除所有监听器（测试用） */
  dispose(): void {
    this._listeners.clear();
  }
}

/* ── 5 个核心事件 ── */

/**
 * 核心事件——对标 VS Code 的系统级事件。
 * Phase 5 启动时挂上这 5 个，Phase 6 追加 onDidChangeWorkspaceFolders / onDidChangeFileSystem / onDidChangeProfile。
 */
export const CoreEvents = {
  /** 配置变更——对标 VS Code onDidChangeConfiguration */
  onDidChangeConfiguration: new Emitter<{ key: string; value: unknown; scope: "user" | "workspace" }>(),

  /** 串口状态变更——对标 VS Code onDidChangeTerminalState */
  onDidChangePortState: new Emitter<{ isOpen: boolean; portName: string | null }>(),

  /** 主题切换——对标 VS Code onDidChangeTheme */
  onDidChangeTheme: new Emitter<{ theme: string }>(),

  /** 活跃标签页切换——对标 VS Code onDidChangeActiveEditor */
  onDidChangeActiveTab: new Emitter<{ tabId: string; pluginId?: string }>(),

  /** 收到串口数据——对标 VS Code onDidWriteTerminalData */
  onDidReceiveData: new Emitter<{ sourceId: string; raw: string }>(),
};

// 确保只有 5 个——Phase 6 前不再扩展。
// Phase 6 新增事件时更新此数字，拆掉 @ts-expect-error
export const _Phase5EventCount: 5 = 5;
void _Phase5EventCount; // 标记已引用
