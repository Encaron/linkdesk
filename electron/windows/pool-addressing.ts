/**
 * 多窗池寻址归一——E6#47b-1（方案见 07-Shell集成与多窗口/01-多窗口架构.md §5.3）。
 *
 * 🔴 **windowId 双重身份**：主进程池注册表 key 全局唯一（workspace 池 = `ws-N`），
 * 而**每个壳渲染进程眼里自己的池都叫 `main`**（pool:ready 报 'main'，壳的 windowHost 注册表以 'main' 指自身）。
 * 两个方向各一个纯函数，两个方向都不许在别处再写一份：
 *
 *   壳 → 池（`poolKeyFromShell`）：ws-N 壳送 'main' ⇒ 目标是它自己的池 ⇒ 换成注册表 key `ws-N`。
 *   池 → 壳（`shellVisiblePoolId`）：ws-N 池回它的壳 ⇒ 载荷 windowId 改写回 'main'。
 *
 * `detached:*` / 其它 id 一律原样（脱出窗 tab 归主壳，主壳注册表里的 id 就是那些）。
 *
 * 纯函数零 Electron 依赖——出参只由入参决定（单测表格式钉住，见 pool-addressing.test.ts）。
 */

/** 壳→池：壳内视角 windowId（可缺省）= 它自己的池 ⇒ 主进程注册表 key */
export function poolKeyFromShell(wsWindowId: string | null, payloadWindowId?: string): string {
  const id = payloadWindowId ?? "main";
  if (!wsWindowId) return id;
  return id === "main" || id === wsWindowId ? wsWindowId : id;
}

/** 池→壳：注册表 key ⇒ 该壳内视角的 windowId（workspace 池在其壳里叫 'main'） */
export function shellVisiblePoolId(poolKey: string, payloadWindowId: string): string {
  return poolKey.startsWith("ws-") ? "main" : payloadWindowId;
}
