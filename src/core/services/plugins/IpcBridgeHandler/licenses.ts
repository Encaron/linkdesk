/**
 * IpcBridgeHandler 许可域——R4-1.3（I21/#24 壳侧·正典 09 §三·补3）。
 * 池插件（市场付费流）经 plugins:call 代理进来的 licenses.* 三方法 → 薄转发壳 preload 的
 * window.linkdesk.licenses.*（直答主进程 IPC——真验签/权益存储都在主进程：
 * license-verify-service / license-store-service，裁决层住壳最深处，市场被整体替换也绕不过）。
 * 依赖方向：本域 → 壳 preload 面；⛔ 不在壳渲染层自建验签/存储（单复本纪律）。
 */

/** plugins:call 方法路由——licenses.verify / licenses.list / licenses.remove（theme.* 同款点号命名） */
export async function handleLicensesMethod(method: string, args: unknown[]): Promise<unknown> {
  const licenses = window.linkdesk?.licenses;
  if (!licenses) throw new Error(`壳面缺 licenses 命名空间——壳 preload 未注入？`);
  switch (method) {
    case "licenses.verify":
      // args[0] = 许可密钥；args[1] = 作者块 publicKey（壳无目录上下文——公钥由唯一读者市场随行）
      return licenses.verify(args[0] as string, args[1] as string);
    case "licenses.list":
      return licenses.list();
    case "licenses.remove":
      await licenses.remove(args[0] as string);
      return undefined;
    default:
      throw new Error(`未知的 licenses 方法: ${method}`);
  }
}
