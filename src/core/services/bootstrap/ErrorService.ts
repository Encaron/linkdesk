/**
 * 统一错误报告——全项目唯一入口。
 * E5#38：5 种错误处理归一化为 reportError()。
 *
 * 零依赖——不 import 任何可能形成循环依赖的模块。
 * toast.ts 是依赖图叶子节点（纯数据队列），动态 import 安全。
 *
 * @param opts.message - 用户可见错误信息（走 t()）
 * @param opts.source  - 来源（"serial-monitor" / "file-tree" / "core"）
 * @param opts.error   - 原始 Error 对象（console.error 用）
 * @param opts.severity - toast 类型，默认 "error"
 * @param opts.wake     - 唤醒旗标（18 档 §五 G 分级）。**只有背景性失败才传 false**——
 *   壳侧文件 IO 失败（StorageService 读写配置）就是这么一类：用户当场什么也做不了，
 *   弹面板只会糊脸，降为「只角标 + 内容进面板」。不传 = 走缺省（error → 弹）。
 * @param opts.silent   - true = 只 console.error，不 toast
 */
export function reportError(opts: {
  message: string;
  source?: string;
  error?: unknown;
  severity?: "error" | "warning" | "info";
  wake?: boolean;
  silent?: boolean;
}): void {
  // 1. 始终 console.error——开发者必见
  const src = opts.source || "core";
  console.error(`[${src}] ${opts.message}`, opts.error);

  // 2. 非静默 → toast（用户可见）
  if (!opts.silent) {
    // 动态 import 避免反向依赖——toast.ts 是最底层模块
    import("../ui/toast").then(({ pushToast }) => {
      pushToast({
        message: opts.message,
        severity: opts.severity || "error",
        source: opts.source,
        // wake 只在显式给定时落字段——不传 = 由 toast store 的 defaultWake 定缺省，
        // 在这里填 `wake: undefined` 会与「生产者没表态」不可区分（且 undefined 也是合法缺省）。
        ...(opts.wake !== undefined ? { wake: opts.wake } : {}),
      });
    });
  }
}
