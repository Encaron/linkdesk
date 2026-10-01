/**
 * 「最近」列表的纯数组语义——W3b（T6）。
 *
 * 为什么单独成文件：三处修正（**去重口径**／**写放大收敛**／**容量归一**）全是纯逻辑，
 * 抽出来才配得上单测——留在组件里只能靠 CDP 现场看（而"同一条视图攒成三行"这种事，
 * 现场看往往看不出来）。本文件无 React、无 `window.linkdesk`。
 *
 * 🔴 存量上限与显示上限是**两个数**：存 10（手滑移除了还能靠再次使用回来），显 5（两列表同一容量）。
 *  §七#1 拍板：文件夹原本「存10显5」、视图「存10显10」——同一概念两种容量，归一为都显 5。
 */

export interface RecentFolder {
  path: string;
  name: string;
}

export interface RecentEntry {
  pluginId: string;
  label: string;
  workspaceName?: string;
}

/** 存量上限——两列表同值 */
export const RECENT_STORE_CAP = 10;
/** 显示上限——两列表同值（§七#1） */
export const RECENT_DISPLAY_CAP = 5;

/** pluginState 归属与键——全仓唯一读写点仍在本组件（键名照旧，别改：改了等于把用户已有记录清零） */
export const STATE_OWNER = "app";
export const RECENT_FOLDERS_KEY = "recentFolders";
export const RECENT_VIEWS_KEY = "recentViews";
/** 通知来源桶（`app.<域>` 约定）——轻提示只借它分桶，不进铃铛面板 */
export const WELCOME_SOURCE = "app.welcome";

/**
 * 行身份 = `pluginId` ＋ `workspaceName` **两列都参与**。
 *
 * 🔴 这是「去重 bug」的判据本体：原写法是 `!(r.pluginId === pluginId && !r.workspaceName)`，
 * 第二个条件看的是**被比较的那一行**有没有 workspaceName，而不是「来记录的这一条」——
 * ⇒ 任何带 workspaceName 的条目**永远去重不掉**，同一视图会在列表里积成多行
 * （点一次开始卡多一行，用户看到的是"我明明只装了一个插件"）。
 * 缺省一侧按空串算：`undefined` 与 `""` 是同一件事（没有 workspace）。
 */
export function sameRecentView(a: RecentEntry, b: RecentEntry): boolean {
  return a.pluginId === b.pluginId && (a.workspaceName ?? "") === (b.workspaceName ?? "");
}

/**
 * 打开/新增一组文件夹后重算「最近文件夹」——**一次算好最终数组**。
 *
 * 🔴 这是「写放大」的修法：原实现在 `for` 循环里逐条 `pluginState.set` ＋ `setState`
 * ⇒ N 个文件夹 = N 次落盘 ＋ N 次渲染，且中途的中间态会被写进存储（后一条读到的可能是半成品）。
 * 顺序语义与原来一致：后传入的排在前（同一批里最后一个 = 最近打开的那个）。
 */
export function mergeRecentFolders(
  stored: readonly RecentFolder[],
  added: readonly RecentFolder[],
): RecentFolder[] {
  let next = [...stored];
  for (const f of added) next = [f, ...next.filter((r) => r.path !== f.path)];
  return next.slice(0, RECENT_STORE_CAP);
}

/** 记一次「最近视图」——同身份（见 `sameRecentView`）去重、新记录置顶、超出存量上限截断 */
export function mergeRecentViews(stored: readonly RecentEntry[], entry: RecentEntry): RecentEntry[] {
  return [entry, ...stored.filter((r) => !sameRecentView(r, entry))].slice(0, RECENT_STORE_CAP);
}

/** 从「最近文件夹」里剔除一条（失效率点击 / 条目级 ×——两条路共用，只清记录不拉黑：再次使用会回来，§七#9） */
export function dropRecentFolder(stored: readonly RecentFolder[], path: string): RecentFolder[] {
  return stored.filter((r) => r.path !== path);
}

/** 从「最近视图」里剔除一条（判据同 `sameRecentView`） */
export function dropRecentView(stored: readonly RecentEntry[], entry: RecentEntry): RecentEntry[] {
  return stored.filter((r) => !sameRecentView(r, entry));
}
