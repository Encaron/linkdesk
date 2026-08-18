/**
 * Pool preload 文件装饰域——池内本地注册表 + decorations 命名空间。
 * E5.8#0d.10-4c：自 preload-pool.ts 拆出——FileDecorationRegistry 不迁主进程（provider 是
 * JS 函数不可跨进程），provider 与消费方（文件树）同在 Pool → 真源放池内，零 IPC。
 * 依赖方向：decorations 纯本地注册表（零 IPC）；无 src import（构建边界，DTO 形状对齐）。
 */

// 形状与 src/core/registry/FileDecorationRegistry.ts 的 FileDecoration 对齐（该文件已
// 随任务整删——唯一活文档在 01-插件API契约 §3.24）——preload 不 import src（构建边界）。
type DecoDtoShape = { badge?: string; tooltip?: string; color?: string; propagate?: boolean };
type DecoProviderShape = {
  provideDecoration: (uri: string) => DecoDtoShape | null | Promise<DecoDtoShape | null>;
  onDidChangeFileDecorations?: (cb: (uris: string[] | void) => void) => () => void;
};

// ── E5.7#60：文件装饰——池内本地注册表（零 IPC）──
// 设计文档定性（Registry主进程化设计.md §3）：FileDecorationRegistry 不迁——provider 是
// JS 函数不可跨进程，E5.7 中 provider 与消费方（文件树）同在 Pool → 真源放池内。
// 原壳链（decorations:getDecoration 代理 + decorations:changed 广播 + 壳侧恒空注册表）
// 随本任务整删——池直答比壳往返快一轮且恒空代理是死路。
// provider 经 contextBridge 代理进隔离世界存储（同渲染进程函数代理可用——E5.7#58 实验
// 实证）；插件卸载后模块销毁 → 代理调用抛错 → 自愈剔除。池重建（崩溃恢复）注册表随
// preload 重置，插件入口重跑时重新注册（_poolCommands 同款语义）。
const _decoProviders = new Map<string, { provider: DecoProviderShape; unsub?: () => void }>();
const _decoListeners = new Set<(uris: string[]) => void>();

function _fireDecoChange(uris: string[]): void {
  for (const cb of _decoListeners) {
    try { cb(uris); } catch { /* contextBridge 回调静默失败 */ }
  }
}

/** decorations 命名空间——池内注册/查询/订阅（provider 与消费方同在池，零 IPC） */
export function buildDecorations() {
  return {
    registerProvider: (pluginId: string, provider: DecoProviderShape): void => {
      // 幂等重注册——同 pluginId 覆盖旧条目（插件入口重跑/重装安全）
      const prev = _decoProviders.get(pluginId);
      prev?.unsub?.();
      const entry: { provider: DecoProviderShape; unsub?: () => void } = { provider };
      if (typeof provider.onDidChangeFileDecorations === "function") {
        entry.unsub = provider.onDidChangeFileDecorations((uris) => {
          _fireDecoChange(Array.isArray(uris) ? uris : []);
        });
      }
      _decoProviders.set(pluginId, entry);
      // 注册即全量刷新——文件树重查询拾取新 provider 徽标（VS Code 同款）
      _fireDecoChange([]);
    },
    unregisterProvider: (pluginId: string): void => {
      const entry = _decoProviders.get(pluginId);
      if (!entry) return;
      entry.unsub?.();
      _decoProviders.delete(pluginId);
      _fireDecoChange([]);
    },
    getDecoration: async (uri: string): Promise<DecoDtoShape | null> => {
      for (const [pluginId, { provider }] of _decoProviders) {
        let deco: DecoDtoShape | null | Promise<DecoDtoShape | null>;
        try {
          deco = provider.provideDecoration(uri);
        } catch {
          // 插件已卸载——代理函数目标销毁 → 自愈剔除（重启前不再查询该 provider）
          _decoProviders.delete(pluginId);
          continue;
        }
        if (deco !== null && deco !== undefined && !(deco instanceof Promise)) {
          return deco;
        }
      }
      return null;
    },
    onDidChange: (cb: (uris: string[]) => void): (() => void) => {
      _decoListeners.add(cb);
      return () => { _decoListeners.delete(cb); };
    },
  };
}
