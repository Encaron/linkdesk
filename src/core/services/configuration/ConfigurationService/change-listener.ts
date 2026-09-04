/**
 * 配置服务——变更监听器属主（E5.8#0.4a 拆 ConfigurationService/ feature-folder）。
 * 单域属主：_changeListeners 归本文件。双广播变体（逐行等价原 ConfigurationService 内两处循环）：
 *   emitChange（console.error）   ——set/reset/batch 写路径：listener 异常不静默，便于排查设置页消费方 bug；
 *   emitChangeSilent              ——reload/applyRemote：一个 listener 崩溃不阻塞其他（不扰启动/桥接）。
 *
 * 分层依赖（单向无环）：叶子（零内部依赖）→ 被 settings-io 消费。
 */

/* ── 监听器 ── */

type ChangeListener = (key: string, value: unknown, scope: "user" | "workspace") => void;
const _changeListeners = new Set<ChangeListener>();

/** 订阅配置变化——对标 VS Code onDidChangeConfiguration */
export function onDidChangeConfiguration(fn: ChangeListener): () => void {
  _changeListeners.add(fn);
  return () => { _changeListeners.delete(fn); };
}

/** 广播（console.error 变体）——写路径监听器异常可见 */
export function emitChange(key: string, value: unknown, scope: "user" | "workspace"): void {
  for (const fn of _changeListeners) {
    try { fn(key, value, scope); } catch (e) { console.error("[ConfigurationService] 监听器异常:", e); }
  }
}

/** 广播（静默变体）——reload/applyRemote：避免一个 listener 崩溃阻塞其他 */
export function emitChangeSilent(key: string, value: unknown, scope: "user" | "workspace"): void {
  for (const fn of _changeListeners) {
    try { fn(key, value, scope); } catch { /* 静默——避免一个 listener 崩溃阻塞其他 */ }
  }
}
