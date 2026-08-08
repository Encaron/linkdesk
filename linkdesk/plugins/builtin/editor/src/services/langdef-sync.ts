/**
 * E5.5#7 Bug B fix：LangDef 跨 WebView 同步。
 *
 * 多 WebView 下 LangDefRegistry 在本 WebView 为空——语言插件（Python/Rust/C++）
 * 在壳侧 JS 上下文注册。本模块通过 IPC 拉取所有 LangDef 并注册到本地 Registry，
 * 使 EditorView 的 getLangDef() 正常工作。
 *
 * 🔥 注意：registerLangDef 来自 @src/core——但 EditorView.tsx 已静态 import 同模块的
 *    getLangDef，LangDefRegistry 在此 chunk 中只有一个实例。此处只是向同一实例写入。
 */
import { registerLangDef } from "@src/core/registry/LangDefRegistry";

let _synced = false;

/**
 * 从壳侧同步 LangDef 到本地 Registry。幂等——多次调用只执行一次。
 * 必须在任何 getLangDef() 查询之前调用。
 */
export async function syncLangDefsFromShell(): Promise<void> {
  if (_synced) return;
  try {
    const entries: [string, Record<string, unknown>][] =
      await (window as any).linkdesk?.langDef?.getAll?.();
    if (!entries || entries.length === 0) return;
    for (const [, def] of entries) {
      registerLangDef((def._pluginId as string) ?? "shell", def as any);
    }
    console.log(`[langdef-sync] 同步完成: ${entries.length} 条`);
  } catch (e) {
    console.warn("[langdef-sync] 同步失败:", e);
  } finally {
    _synced = true;
  }
}
