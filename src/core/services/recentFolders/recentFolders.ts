/**
 * 「最近文件夹」的宿主语义 —— 纯函数（2026-11-24 A3 / F2）。
 *
 * 为什么住壳：最近文件夹的**属主是壳**（`app` 命名空间，唯一写点 = 欢迎页 `recentList.ts`）。
 * 文件树过去跨属主直读 `pluginState.get("app","recentFolders")`——宿主改键名/结构就静默断链。
 * 现在读取面 = `workspace.getRecentFolders()`（主进程按本文件的规则归一化后下发），
 * 插件⛔ 不再读别的属主的私有状态；写侧（合并/剔除）仍在欢迎页（本文件只给共享常量与读取归一）。
 *
 * 纯函数零副作用：不碰 window/fs/Electron——主进程与渲染侧可同图引用。
 */

export interface RecentFolder {
  path: string;
  name: string;
}

/** 数据属主命名空间——最近文件夹写在 `app` 下（壳自己的状态） */
export const RECENT_OWNER = "app";
/** 存量键名——照旧，别改：改了等于把用户已有记录清零 */
export const RECENT_FOLDERS_KEY = "recentFolders";
/** 存量上限（存 10：手滑移除了还能靠再次使用回来） */
export const RECENT_STORE_CAP = 10;
/** 显示上限（两列表同一容量——欢迎页与文件树各显示前 5 条） */
export const RECENT_DISPLAY_CAP = 5;

/**
 * 收窄成 `{ path, name }[]` —— 防御读历史形态（曾存过裸字符串数组）+ 去重 + 截断。
 * 脏条目挡在这里，不往任何 UI 上漏半条空行。
 */
export function normalizeRecentFolders(
  raw: unknown,
  limit: number = RECENT_DISPLAY_CAP,
): RecentFolder[] {
  if (!Array.isArray(raw)) return [];
  const out: RecentFolder[] = [];
  const seen = new Set<string>();
  for (const entry of raw) {
    const path =
      typeof entry === "string"
        ? entry
        : entry && typeof (entry as { path?: unknown }).path === "string"
          ? (entry as { path: string }).path
          : "";
    if (!path || seen.has(path)) continue;
    seen.add(path);
    const rawName =
      typeof entry === "object" && entry && typeof (entry as { name?: unknown }).name === "string"
        ? (entry as { name: string }).name
        : "";
    const name = rawName || path.split(/[/\\]/).pop() || path;
    out.push({ path, name });
    if (out.length >= limit) break;
  }
  return out;
}
