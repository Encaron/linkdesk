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
 * @param opts.silent   - true = 只 console.error，不 toast
 */
export function reportError(opts: {
  message: string;
  source?: string;
  error?: unknown;
  severity?: "error" | "warning" | "info";
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
      });
    });
  }
}
