/**
 * 取消令牌——对标 VS Code CancellationToken。
 * Phase 5 盲区 1（P0）：命令 handler 从第一天就用 async + 取消令牌，
 * 不等 Phase 7 任务系统。
 *
 * 设计依据：[[phase4-design-decisions]] + docs/phase5_应用基础设施/V3-Phase5-设计.md §盲区1
 *
 * VS Code 对标：vscode.CancellationToken
 * VS Code 源码：src/vs/base/common/cancellation.ts — CancellationTokenSource
 */

export interface CancellationToken {
  /** 是否已被取消 */
  readonly isCancelled: boolean;
  /** 取消时触发（一次性） */
  onCancelled(fn: () => void): void;
}

class CancellationTokenSource {
  private _isCancelled = false;
  private _listeners: Array<() => void> = [];

  /** 创建新令牌 */
  create(): CancellationToken {
    return {
      get isCancelled() {
        return source._isCancelled;
      },
      onCancelled(fn: () => void) {
        if (source._isCancelled) {
          fn();
        } else {
          source._listeners.push(fn);
        }
      },
    };
  }

  /** 取消令牌——触发所有监听器 */
  cancel(): void {
    if (this._isCancelled) return;
    this._isCancelled = true;
    for (const fn of this._listeners) {
      try { fn(); } catch { /* 监听器异常不阻断其他监听器 */ }
    }
    this._listeners = [];
  }
}

const source = new CancellationTokenSource();

/** 获取当前操作的取消令牌（Phase 5 预留——Phase 7 任务系统消费） */
export function getCurrentCancellationToken(): CancellationToken {
  return source.create();
}

/** 创建一个超时自动取消的令牌 */
export function createTimeoutToken(ms: number): CancellationToken {
  const s = new CancellationTokenSource();
  const token = s.create();
  setTimeout(() => s.cancel(), ms);
  return token;
}

export { CancellationTokenSource };
